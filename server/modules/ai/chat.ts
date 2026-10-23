/**
 * Chat send pipeline for POST /api/ai/conversations/:id/messages.
 *
 * Idempotent by clientMessageId:
 * - first send: creates the user message, calls the model, saves the answer
 * - retry after success: replays the saved answer (no new user message, no model call)
 * - retry while the first attempt is still running: 409
 * - retry after failure/stop: calls the model again and updates the same assistant row
 * On any failure the user's message is kept and an assistant row with status
 * 'unavailable' (or 'error' for a mid-answer failure) records the honest reason.
 */
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { streamSSE } from 'hono/streaming';
import { db } from '../../db/client';
import { aiConversations, aiMessageRequests, aiMessages } from '../../db/schema';
import type { AuthContext, Ctx } from '../../lib/context';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors';
import { aiStream, completeWith } from '../../ai/engine';
import { assistantAvailability, buildSystemPrompt, getAssistant } from '../../ai/assistants';
import { buildContext } from '../../ai/contexts';
import { formatSources, retrieve, type Source } from '../../ai/retrieval';
import type { AiChatMessage, AiCompleteOptions } from '../../ai/service';

type MessageRow = typeof aiMessages.$inferSelect;
type RequestRow = typeof aiMessageRequests.$inferSelect;
type ConversationRow = typeof aiConversations.$inferSelect;

const PENDING_STALE_MS = 3 * 60_000;
const HISTORY_TURNS = 16;

export function publicMessage(m: MessageRow) {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    sources: m.sources ?? [],
    provider: m.provider,
    model: m.model,
    status: m.status,
    feedback: m.feedback,
    createdAt: m.createdAt,
  };
}

export async function loadOwnConversation(userId: string, id: string): Promise<ConversationRow> {
  const [conv] = await db.select().from(aiConversations).where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)));
  if (!conv) throw notFound('Conversation');
  return conv;
}

type Claim = { kind: 'replay'; req: RequestRow } | { kind: 'run'; req: RequestRow; userMessage: MessageRow };

/** Creates or resumes the idempotency record. Never inserts a second user message for the same clientMessageId. */
async function claim(conv: ConversationRow, userId: string, clientMessageId: string, content: string, depth = 0): Promise<Claim> {
  const [existing] = await db
    .select()
    .from(aiMessageRequests)
    .where(and(eq(aiMessageRequests.conversationId, conv.id), eq(aiMessageRequests.clientMessageId, clientMessageId)));
  if (existing) {
    if (existing.status === 'done') return { kind: 'replay', req: existing };
    if (existing.status === 'pending' && Date.now() - new Date(existing.updatedAt).getTime() < PENDING_STALE_MS)
      throw conflict('This message is still being answered. Wait a moment before retrying.');
    const [req] = await db
      .update(aiMessageRequests)
      .set({ status: 'pending', attempts: existing.attempts + 1, updatedAt: new Date() })
      .where(and(eq(aiMessageRequests.id, existing.id), eq(aiMessageRequests.status, existing.status)))
      .returning();
    if (!req) throw conflict('This message is still being answered. Wait a moment before retrying.');
    const [userMessage] = await db.select().from(aiMessages).where(eq(aiMessages.id, req.userMessageId!));
    return { kind: 'run', req, userMessage };
  }
  const [req] = await db
    .insert(aiMessageRequests)
    .values({ conversationId: conv.id, userId, clientMessageId, status: 'pending' })
    .onConflictDoNothing()
    .returning();
  if (!req) {
    if (depth > 0) throw conflict('This message is still being answered. Wait a moment before retrying.');
    return claim(conv, userId, clientMessageId, content, depth + 1);
  }
  const [userMessage] = await db.insert(aiMessages).values({ conversationId: conv.id, role: 'user', content, status: 'ok' }).returning();
  const [updated] = await db.update(aiMessageRequests).set({ userMessageId: userMessage.id }).where(eq(aiMessageRequests.id, req.id)).returning();
  const patch: Partial<ConversationRow> = { updatedAt: new Date() };
  if (conv.title === 'New conversation') patch.title = content.replace(/\s+/g, ' ').trim().slice(0, 70) || conv.title;
  await db.update(aiConversations).set(patch).where(eq(aiConversations.id, conv.id));
  return { kind: 'run', req: updated, userMessage };
}

async function saveAssistant(
  req: RequestRow,
  conversationId: string,
  data: { content: string; status: string; provider?: string | null; model?: string | null; sources?: Source[] },
  reqStatus: 'done' | 'failed' | 'stopped',
): Promise<MessageRow> {
  let row: MessageRow;
  const values = { content: data.content, status: data.status, provider: data.provider ?? null, model: data.model ?? null, sources: data.sources ?? [] };
  if (req.assistantMessageId) {
    [row] = await db
      .update(aiMessages)
      .set({ ...values, feedback: null, feedbackNote: null, createdAt: new Date() })
      .where(eq(aiMessages.id, req.assistantMessageId))
      .returning();
  } else {
    [row] = await db.insert(aiMessages).values({ conversationId, role: 'assistant', ...values }).returning();
  }
  await db.update(aiMessageRequests).set({ assistantMessageId: row.id, status: reqStatus, updatedAt: new Date() }).where(eq(aiMessageRequests.id, req.id));
  await db.update(aiConversations).set({ updatedAt: new Date() }).where(eq(aiConversations.id, conversationId));
  return row;
}

/** Builds the provider messages: system (rules, specialist, context, sources) + recent history + the new turn. */
async function buildPrompt(auth: AuthContext, conv: ConversationRow, claimRes: Extract<Claim, { kind: 'run' }>) {
  const assistant = getAssistant(conv.assistant)!;
  let contextBlock: string | null = null;
  try {
    contextBlock = (await buildContext(auth, assistant, conv.context))?.block ?? null;
  } catch (e) {
    // Access to the item was lost (or it was deleted): answer without it rather than leak anything.
    if (!(e instanceof AppError)) throw e;
  }
  let sources: Source[] = [];
  let sourcesBlock: string | null = null;
  if (assistant.retrieval) {
    try {
      const chunks = await retrieve(claimRes.userMessage.content, { userId: auth.user.id, orgIds: auth.memberships.map((m) => m.orgId) });
      const f = formatSources(chunks);
      sources = f.sources;
      sourcesBlock = f.block;
    } catch (e) {
      console.warn('[ai] retrieval failed', (e as Error).message);
    }
  }
  const exclude = [claimRes.userMessage.id, claimRes.req.assistantMessageId].filter(Boolean) as string[];
  const history = await db
    .select({ id: aiMessages.id, role: aiMessages.role, content: aiMessages.content, status: aiMessages.status, createdAt: aiMessages.createdAt })
    .from(aiMessages)
    .where(and(eq(aiMessages.conversationId, conv.id), inArray(aiMessages.role, ['user', 'assistant']), ne(aiMessages.status, 'unavailable')))
    .orderBy(asc(aiMessages.createdAt));
  const turns: AiChatMessage[] = history
    .filter((m) => !exclude.includes(m.id) && new Date(m.createdAt) <= new Date(claimRes.userMessage.createdAt))
    .filter((m) => m.role === 'user' || m.status === 'ok')
    .slice(-HISTORY_TURNS)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  const messages: AiChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(assistant, { context: contextBlock, sources: sourcesBlock }) },
    ...turns,
    { role: 'user', content: claimRes.userMessage.content },
  ];
  return { assistant, messages, sources };
}

function orgFor(auth: AuthContext, conv: ConversationRow) {
  // Charge the conversation's org only while the user still belongs to it.
  return conv.orgId && auth.memberships.some((m) => m.orgId === conv.orgId) ? conv.orgId : null;
}

export async function sendMessage(c: Ctx, auth: AuthContext, conversationId: string, input: { content: string; clientMessageId: string }, stream: boolean) {
  const conv = await loadOwnConversation(auth.user.id, conversationId);
  const assistant = getAssistant(conv.assistant);
  if (!assistant) throw notFound('Assistant');
  const avail = assistantAvailability(assistant, auth);
  if (!avail.available) throw forbidden(avail.reason);

  const claimed = await claim(conv, auth.user.id, input.clientMessageId, input.content);

  if (claimed.kind === 'replay') {
    const rows = await db.select().from(aiMessages).where(inArray(aiMessages.id, [claimed.req.userMessageId!, claimed.req.assistantMessageId!]));
    const userMessage = rows.find((r) => r.role === 'user')!;
    const assistantMessage = rows.find((r) => r.role === 'assistant')!;
    if (!stream) return c.json({ ok: true, replayed: true, userMessage: publicMessage(userMessage), assistantMessage: publicMessage(assistantMessage) });
    return streamSSE(c, async (s) => {
      await s.writeSSE({ event: 'start', data: JSON.stringify({ userMessageId: userMessage.id, replayed: true }) });
      await s.writeSSE({ event: 'sources', data: JSON.stringify({ sources: assistantMessage.sources ?? [] }) });
      await s.writeSSE({ event: 'delta', data: JSON.stringify({ text: assistantMessage.content }) });
      await s.writeSSE({ event: 'done', data: JSON.stringify({ messageId: assistantMessage.id, provider: assistantMessage.provider, model: assistantMessage.model, replayed: true }) });
    });
  }

  let prompt: Awaited<ReturnType<typeof buildPrompt>>;
  try {
    prompt = await buildPrompt(auth, conv, claimed);
  } catch (e) {
    await saveAssistant(claimed.req, conv.id, { content: 'Could not prepare this request. Try again.', status: 'unavailable' }, 'failed');
    throw e;
  }
  const aiOpts: AiCompleteOptions = { userId: auth.user.id, orgId: orgFor(auth, conv), assistant: assistant.id, feature: 'chat', messages: prompt.messages, maxTokens: 1500 };

  if (!stream) {
    const r = await completeWith(aiOpts, {});
    if (!r.ok) {
      const assistantMessage = await saveAssistant(claimed.req, conv.id, { content: r.message, status: 'unavailable' }, 'failed');
      return c.json({ ok: false, reason: r.reason, message: r.message, retryAfterSeconds: r.retryAfterSeconds ?? null, userMessage: publicMessage(claimed.userMessage), assistantMessage: publicMessage(assistantMessage) });
    }
    const assistantMessage = await saveAssistant(claimed.req, conv.id, { content: r.text, status: 'ok', provider: r.provider, model: r.model, sources: prompt.sources }, 'done');
    return c.json({ ok: true, userMessage: publicMessage(claimed.userMessage), assistantMessage: publicMessage(assistantMessage) });
  }

  const abort = new AbortController();
  return streamSSE(
    c,
    async (s) => {
      s.onAbort(() => abort.abort());
      const send = (event: string, data: unknown) => s.writeSSE({ event, data: JSON.stringify(data) }).catch(() => {});
      await send('start', { userMessageId: claimed.userMessage.id });
      const start = await aiStream({ ...aiOpts, signal: abort.signal });
      if (!start.ok) {
        const msg = await saveAssistant(claimed.req, conv.id, { content: start.message, status: 'unavailable' }, 'failed');
        await send('error', { reason: start.reason, message: start.message, retryAfterSeconds: start.retryAfterSeconds ?? null, messageId: msg.id });
        return;
      }
      await send('sources', { sources: prompt.sources });
      for await (const delta of start.deltas) {
        if (abort.signal.aborted) continue; // drain quietly; the generator stops on abort
        await send('delta', { text: delta });
      }
      const fin = start.final();
      if (fin.status === 'ok') {
        const msg = await saveAssistant(claimed.req, conv.id, { content: fin.text, status: 'ok', provider: start.provider, model: start.model, sources: prompt.sources }, 'done');
        await send('done', { messageId: msg.id, provider: start.provider, model: start.model });
      } else if (fin.status === 'stopped') {
        await saveAssistant(claimed.req, conv.id, { content: fin.text || 'Stopped before any text arrived.', status: 'stopped', provider: start.provider, model: start.model, sources: prompt.sources }, 'stopped');
      } else {
        const message = `The provider stopped responding mid-answer${fin.error ? ` (${fin.error})` : ''}. The partial answer was kept; retry to get a complete one.`;
        const msg = await saveAssistant(
          claimed.req,
          conv.id,
          fin.text ? { content: fin.text, status: 'error', provider: start.provider, model: start.model, sources: prompt.sources } : { content: message, status: 'unavailable', provider: start.provider, model: start.model },
          'failed',
        );
        await send('error', { reason: 'interrupted', message, messageId: msg.id });
      }
    },
    async (err, s) => {
      console.error('[ai] chat stream failed', err instanceof Error ? err.message : 'unknown');
      try {
        await saveAssistant(claimed.req, conv.id, { content: 'Something went wrong on our side while answering. Try again.', status: 'unavailable' }, 'failed');
      } catch {
        /* best effort */
      }
      await s.writeSSE({ event: 'error', data: JSON.stringify({ reason: 'error', message: 'Something went wrong on our side while answering. Try again.' }) });
    },
  );
}
