import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { aiConversations, aiMessages, reports } from '../../db/schema';
import { type AppEnv, isPlatformAdmin, requireAuth } from '../../lib/context';
import { body, idParam, query } from '../../lib/validate';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { aiStatus } from '../../ai/engine';
import { ASSISTANTS, GROUP_LABELS, assistantAvailability, getAssistant } from '../../ai/assistants';
import { routeQuestion } from '../../ai/router';
import { buildContext, CONTEXT_TYPES } from '../../ai/contexts';
import { remainingQuota } from '../../ai/quotas';
import { selectablePresets } from '../../ai/providers';
import { MAX_MESSAGE_CHARS, SAFETY_LIMITATIONS } from '../../ai/safety';
import { loadOwnConversation, publicMessage, sendMessage } from './chat';
import { aiAdminRoutes } from './admin';

/** Mounted at /api/ai. */
export const aiRoutes = new Hono<AppEnv>();

aiRoutes.route('/admin', aiAdminRoutes);

const TRANSPARENCY = 'All specialists use the same configured model with different instructions.';

aiRoutes.get('/status', async (c) => {
  const auth = requireAuth(c);
  const admin = isPlatformAdmin(auth);
  const s = await aiStatus();
  const usable = s.providers.filter((p) => p.enabled && !p.problem);
  const notices = [...new Set(usable.map((p) => p.dataNotice).filter((n): n is string => !!n))];
  return c.json({
    configured: s.configured,
    enabled: s.enabled,
    providers: usable.map((p) => ({ label: p.label, preset: p.preset, model: p.model, healthy: p.healthy, dataNotice: p.dataNotice })),
    // Admins also see misconfigured rows so the "not configured" page can say why.
    problems: admin ? s.providers.filter((p) => p.problem).map((p) => ({ label: p.label, problem: p.problem })) : [],
    dataNotices: notices,
    primaryNotice: usable[0]?.dataNotice ?? null,
    quota: await remainingQuota(auth.user.id, auth.session.activeOrgId),
    isPlatformAdmin: admin,
    freeOptions: selectablePresets()
      .filter((p) => p.id !== 'custom' && !p.testOnly)
      .map((p) => ({ id: p.id, label: p.label, freeTier: p.freeTier, signupUrl: p.signupUrl, envVars: p.envVars })),
    transparency: TRANSPARENCY,
    limitations: SAFETY_LIMITATIONS,
  });
});

aiRoutes.get('/assistants', (c) => {
  const auth = requireAuth(c);
  return c.json({
    transparency: TRANSPARENCY,
    groups: Object.entries(GROUP_LABELS).map(([id, label]) => ({ id, label })),
    assistants: ASSISTANTS.map((a) => {
      const av = assistantAvailability(a, auth);
      return {
        id: a.id,
        name: a.name,
        group: a.group,
        description: a.description,
        can: a.can,
        cannot: a.cannot,
        contexts: a.contexts,
        usesSources: a.retrieval,
        starters: a.starters,
        requiredRoles: a.requiredRoles ?? [],
        available: av.available,
        reason: av.available ? null : av.reason,
      };
    }),
  });
});

aiRoutes.post('/route', async (c) => {
  const auth = requireAuth(c);
  const { message } = await body(c, z.object({ message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS) }));
  const suggestion = routeQuestion(message, (a) => assistantAvailability(a, auth).available);
  return c.json({ suggestion, transparency: TRANSPARENCY });
});

// ---------- Conversations (own only) ----------

const contextInput = z
  .object({
    type: z.enum(CONTEXT_TYPES as [string, ...string[]]),
    id: z.string().trim().max(120).optional(),
    label: z.string().trim().max(200).optional(),
  })
  .nullable()
  .optional();

function publicConversation(cv: typeof aiConversations.$inferSelect) {
  const a = getAssistant(cv.assistant);
  return { id: cv.id, title: cv.title, assistant: cv.assistant, assistantName: a?.name ?? cv.assistant, context: cv.context, createdAt: cv.createdAt, updatedAt: cv.updatedAt };
}

aiRoutes.get('/conversations', async (c) => {
  const auth = requireAuth(c);
  const q = query(c, z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(30) }));
  const where = eq(aiConversations.userId, auth.user.id);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(aiConversations)
      .where(where)
      .orderBy(desc(aiConversations.updatedAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: count() }).from(aiConversations).where(where),
  ]);
  return c.json({ items: rows.map(publicConversation), total, page: q.page, pageSize: q.pageSize });
});

aiRoutes.post('/conversations', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, z.object({ assistant: z.string().max(60), title: z.string().trim().min(1).max(120).optional(), context: contextInput }));
  const a = getAssistant(input.assistant);
  if (!a) throw badRequest('Unknown specialist.', { fields: { assistant: 'Pick a specialist from the list.' } });
  const av = assistantAvailability(a, auth);
  if (!av.available) throw forbidden(av.reason);
  const built = input.context ? await buildContext(auth, a, input.context) : null;
  // The label shown in the UI comes from the server's copy of the item, not the URL.
  const context = input.context && built ? { type: input.context.type, id: input.context.type === 'text' ? undefined : input.context.id, label: built.label } : {};
  const [cv] = await db
    .insert(aiConversations)
    .values({ userId: auth.user.id, orgId: auth.session.activeOrgId, assistant: a.id, title: input.title ?? 'New conversation', context })
    .returning();
  return c.json({ conversation: publicConversation(cv) }, 201);
});

aiRoutes.get('/conversations/:id', async (c) => {
  const auth = requireAuth(c);
  const cv = await loadOwnConversation(auth.user.id, idParam(c));
  return c.json({ conversation: publicConversation(cv) });
});

aiRoutes.patch('/conversations/:id', async (c) => {
  const auth = requireAuth(c);
  const cv = await loadOwnConversation(auth.user.id, idParam(c));
  const input = await body(c, z.object({ title: z.string().trim().min(1).max(120).optional(), assistant: z.string().max(60).optional() }));
  const patch: Partial<typeof aiConversations.$inferInsert> = { updatedAt: new Date() };
  if (input.title) patch.title = input.title;
  if (input.assistant && input.assistant !== cv.assistant) {
    const a = getAssistant(input.assistant);
    if (!a) throw badRequest('Unknown specialist.');
    const av = assistantAvailability(a, auth);
    if (!av.available) throw forbidden(av.reason);
    if (cv.context?.type && !a.contexts.includes(cv.context.type as never)) throw badRequest(`${a.name} cannot use this conversation's context. Start a new chat instead.`);
    patch.assistant = a.id;
  }
  const [row] = await db.update(aiConversations).set(patch).where(and(eq(aiConversations.id, cv.id), eq(aiConversations.userId, auth.user.id))).returning();
  return c.json({ conversation: publicConversation(row) });
});

aiRoutes.delete('/conversations/:id', async (c) => {
  const auth = requireAuth(c);
  const cv = await loadOwnConversation(auth.user.id, idParam(c));
  await db.delete(aiConversations).where(and(eq(aiConversations.id, cv.id), eq(aiConversations.userId, auth.user.id)));
  return c.json({ ok: true });
});

aiRoutes.get('/conversations/:id/messages', async (c) => {
  const auth = requireAuth(c);
  const cv = await loadOwnConversation(auth.user.id, idParam(c));
  const rows = await db.select().from(aiMessages).where(eq(aiMessages.conversationId, cv.id)).orderBy(asc(aiMessages.createdAt)).limit(500);
  return c.json({ conversation: publicConversation(cv), items: rows.map(publicMessage) });
});

aiRoutes.post('/conversations/:id/messages', async (c) => {
  const auth = requireAuth(c);
  const id = idParam(c);
  const input = await body(
    c,
    z.object({
      content: z.string().trim().min(1, 'Write a message first.').max(MAX_MESSAGE_CHARS, `Keep messages under ${MAX_MESSAGE_CHARS} characters.`),
      clientMessageId: z.string().trim().min(8).max(80).regex(/^[A-Za-z0-9_-]+$/),
    }),
  );
  const stream = c.req.query('stream') !== '0';
  return sendMessage(c, auth, id, input, stream);
});

// ---------- Feedback & reports ----------

async function loadOwnAssistantMessage(userId: string, messageId: string) {
  const [row] = await db
    .select({ m: aiMessages })
    .from(aiMessages)
    .innerJoin(aiConversations, eq(aiConversations.id, aiMessages.conversationId))
    .where(and(eq(aiMessages.id, messageId), eq(aiConversations.userId, userId), eq(aiMessages.role, 'assistant')));
  if (!row) throw notFound('Message');
  return row.m;
}

aiRoutes.post('/messages/:id/feedback', async (c) => {
  const auth = requireAuth(c);
  const m = await loadOwnAssistantMessage(auth.user.id, idParam(c));
  const input = await body(c, z.object({ value: z.union([z.literal(1), z.literal(-1), z.literal(0)]), note: z.string().trim().max(1000).optional() }));
  const [row] = await db
    .update(aiMessages)
    .set({ feedback: input.value === 0 ? null : input.value, feedbackNote: input.value === 0 ? null : (input.note ?? null) })
    .where(eq(aiMessages.id, m.id))
    .returning();
  return c.json({ message: publicMessage(row) });
});

aiRoutes.post('/messages/:id/report', async (c) => {
  const auth = requireAuth(c);
  const m = await loadOwnAssistantMessage(auth.user.id, idParam(c));
  const input = await body(c, z.object({ reason: z.enum(['incorrect', 'harmful', 'biased', 'privacy', 'other']), details: z.string().trim().max(1000).optional() }));
  const [existing] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(and(eq(reports.targetType, 'ai_message'), eq(reports.targetId, m.id), eq(reports.reporterId, auth.user.id), eq(reports.status, 'open')));
  if (existing) return c.json({ ok: true, reportId: existing.id, duplicate: true });
  const [r] = await db
    .insert(reports)
    .values({ reporterId: auth.user.id, targetType: 'ai_message', targetId: m.id, reason: input.reason, details: input.details ?? null, orgId: null })
    .returning({ id: reports.id });
  return c.json({ ok: true, reportId: r.id }, 201);
});
