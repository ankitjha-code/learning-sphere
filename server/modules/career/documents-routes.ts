import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { careerDocuments, applications, jobTargets, resumes } from '../../db/schema';
import { type AppEnv, requireAuth } from '../../lib/context';
import { body, idParam, query } from '../../lib/validate';
import { notFound } from '../../lib/errors';
import { rateLimit } from '../../lib/ratelimit';
import { DOC_KINDS, DOC_KIND_LABEL, generateDocument, factsText, guardAiDraft, PLACEHOLDER_RE, type DocFacts } from './generator';
import { runAi, aiUnavailable, HONESTY_SYSTEM } from './service';

export const documentRoutes = new Hono<AppEnv>();

const kindSchema = z.enum(DOC_KINDS);
const s = (max = 2000) => z.string().trim().max(max).optional();
const factsSchema = z.object({
  name: s(120),
  email: s(254),
  role: s(160),
  company: s(160),
  recipientName: s(120),
  currentRole: s(300),
  whyCompany: s(),
  whyRole: s(),
  relevantExperience: s(),
  achievement: s(),
  skills: z.array(z.string().trim().max(60)).max(30).optional(),
  projectName: s(160),
  projectDescription: s(),
  projectRole: s(),
  projectOutcome: s(),
  techStack: z.array(z.string().trim().max(60)).max(30).optional(),
  link: s(300),
  availability: s(200),
  question: s(1000),
  answerPoints: s(4000),
  mutualConnection: s(160),
  interviewDate: s(60),
  interviewerName: s(120),
  topicDiscussed: s(500),
  goal: s(500),
});

async function loadOwn(id: string, userId: string) {
  const [d] = await db.select().from(careerDocuments).where(and(eq(careerDocuments.id, id), eq(careerDocuments.userId, userId)));
  if (!d) throw notFound('Document');
  return d;
}

/** Facts the user already entered elsewhere (resume, target, application), used to prefill. */
async function prefill(userId: string, refs: { resumeId?: string; targetId?: string; applicationId?: string }): Promise<DocFacts> {
  const facts: DocFacts = {};
  if (refs.resumeId) {
    const [r] = await db.select().from(resumes).where(and(eq(resumes.id, refs.resumeId), eq(resumes.userId, userId)));
    if (!r) throw notFound('Resume');
    facts.name = r.data.basics.name || undefined;
    facts.email = r.data.basics.email;
    // Current role comes from an ongoing experience entry (never the free-text headline).
    const current = r.data.experience.find((x) => x.title && x.company && !x.end);
    facts.currentRole = current ? `${current.title} at ${current.company}` : undefined;
    facts.skills = r.data.skills.flatMap((g) => g.items).slice(0, 8);
    facts.link = r.data.basics.links?.[0]?.url;
  }
  if (refs.targetId) {
    const [t] = await db.select().from(jobTargets).where(and(eq(jobTargets.id, refs.targetId), eq(jobTargets.userId, userId)));
    if (!t) throw notFound('Job target');
    facts.role = t.title;
    facts.company = t.company ?? undefined;
  }
  if (refs.applicationId) {
    const [a] = await db.select().from(applications).where(and(eq(applications.id, refs.applicationId), eq(applications.userId, userId)));
    if (!a) throw notFound('Application');
    facts.role = a.role;
    facts.company = a.company;
    const contact = a.contacts[0];
    if (contact) facts.recipientName = contact.name;
  }
  return facts;
}

documentRoutes.get('/', async (c) => {
  const auth = requireAuth(c);
  const { kind } = query(c, z.object({ kind: kindSchema.optional() }));
  const rows = await db
    .select()
    .from(careerDocuments)
    .where(and(eq(careerDocuments.userId, auth.user.id), kind ? eq(careerDocuments.kind, kind) : undefined))
    .orderBy(desc(careerDocuments.updatedAt));
  return c.json({ items: rows.map((r) => ({ ...r, placeholders: (r.body.match(PLACEHOLDER_RE) ?? []).length })), total: rows.length, kinds: DOC_KIND_LABEL });
});

documentRoutes.post('/', async (c) => {
  const auth = requireAuth(c);
  const input = await body(
    c,
    z.object({
      kind: kindSchema,
      title: z.string().trim().min(1, 'Add a title.').max(160),
      body: z.string().max(20_000),
      applicationId: z.string().uuid().nullable().optional(),
      jobDescription: z.string().max(20_000).nullable().optional(),
      aiAssisted: z.boolean().default(false),
    }),
  );
  if (input.applicationId) await prefill(auth.user.id, { applicationId: input.applicationId }); // ownership check
  const [row] = await db.insert(careerDocuments).values({ ...input, userId: auth.user.id }).returning();
  return c.json({ document: row }, 201);
});

/** Template generator (always available). Missing facts stay as [Add: ...] placeholders. */
documentRoutes.post('/generate', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, z.object({ kind: kindSchema, facts: factsSchema.default({}), resumeId: z.string().uuid().optional(), targetId: z.string().uuid().optional(), applicationId: z.string().uuid().optional() }));
  const base = await prefill(auth.user.id, input);
  const facts: DocFacts = { ...base, ...Object.fromEntries(Object.entries(input.facts).filter(([, v]) => (Array.isArray(v) ? v.length : !!v))) };
  const out = generateDocument(input.kind, facts);
  return c.json({ ...out, kind: input.kind, facts, aiAssisted: false });
});

/** Optional AI draft using only the provided facts. Unknown numbers are replaced with a confirmation marker. */
documentRoutes.post('/generate/ai', async (c) => {
  const auth = requireAuth(c);
  rateLimit(`career-ai:${auth.user.id}`, 30, 3600_000);
  const input = await body(c, z.object({ kind: kindSchema, facts: factsSchema.default({}), resumeId: z.string().uuid().optional(), targetId: z.string().uuid().optional(), applicationId: z.string().uuid().optional(), jobDescription: z.string().max(12_000).optional() }));
  const base = await prefill(auth.user.id, input);
  const facts: DocFacts = { ...base, ...Object.fromEntries(Object.entries(input.facts).filter(([, v]) => (Array.isArray(v) ? v.length : !!v))) };
  const template = generateDocument(input.kind, facts);
  const ai = await runAi({
    userId: auth.user.id,
    assistant: 'application_writer',
    feature: 'document_draft',
    messages: [
      {
        role: 'system',
        content: `${HONESTY_SYSTEM} Write a ${DOC_KIND_LABEL[input.kind].toLowerCase()} using ONLY the facts provided. Where a needed fact is missing, write a placeholder in the form [Add: description]. Plain text, no markdown headings.`,
      },
      { role: 'user', content: `Facts (JSON):\n${JSON.stringify(facts)}\n\n${input.jobDescription ? `Job description (for tone and priorities only; do not claim requirements as the user's experience):\n${input.jobDescription}` : ''}` },
    ],
  });
  if (!ai.ok) return c.json({ ...aiUnavailable(ai), fallback: template });
  const guarded = guardAiDraft(ai.text.trim(), factsText(facts));
  return c.json({
    ok: true,
    aiAssisted: true,
    kind: input.kind,
    title: template.title,
    body: guarded.body,
    flaggedNumbers: guarded.flagged,
    placeholders: [...new Set(guarded.body.match(PLACEHOLDER_RE) ?? [])],
    label: 'AI draft: review every claim before sending.',
  });
});

documentRoutes.get('/:id', async (c) => {
  const auth = requireAuth(c);
  const d = await loadOwn(idParam(c), auth.user.id);
  return c.json({ document: d, placeholders: d.body.match(PLACEHOLDER_RE) ?? [] });
});

documentRoutes.put('/:id', async (c) => {
  const auth = requireAuth(c);
  const d = await loadOwn(idParam(c), auth.user.id);
  const input = await body(c, z.object({ title: z.string().trim().min(1).max(160).optional(), body: z.string().max(20_000).optional(), kind: kindSchema.optional(), applicationId: z.string().uuid().nullable().optional() }));
  if (input.applicationId) await prefill(auth.user.id, { applicationId: input.applicationId });
  const [row] = await db.update(careerDocuments).set({ ...input, updatedAt: new Date() }).where(eq(careerDocuments.id, d.id)).returning();
  return c.json({ document: row, placeholders: row.body.match(PLACEHOLDER_RE) ?? [] });
});

documentRoutes.delete('/:id', async (c) => {
  const auth = requireAuth(c);
  const d = await loadOwn(idParam(c), auth.user.id);
  await db.delete(careerDocuments).where(eq(careerDocuments.id, d.id));
  return c.json({ ok: true });
});
