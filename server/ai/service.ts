/**
 * AI service contract. Every feature that uses AI calls these functions and MUST
 * handle `ok: false` gracefully (show the reason, keep non-AI paths working).
 * The full implementation (providers, failover, quotas, usage accounting) lives in server/ai/.
 */
export type AiChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type AiFailureReason = 'not_configured' | 'disabled' | 'quota_exceeded' | 'rate_limited' | 'timeout' | 'unavailable' | 'error';

export type AiResult =
  | { ok: true; text: string; provider: string; model: string; usage: { inputTokens: number; outputTokens: number; estimated: boolean } }
  | { ok: false; reason: AiFailureReason; message: string; retryAfterSeconds?: number };

export type AiCompleteOptions = {
  userId: string | null;
  orgId?: string | null;
  assistant: string; // assistant id from server/ai/assistants.ts, e.g. 'tutor', 'resume_reviewer'
  feature: string; // usage accounting label, e.g. 'chat', 'hint', 'grading_proposal', 'jd_analysis'
  messages: AiChatMessage[];
  maxTokens?: number;
  temperature?: number;
  json?: boolean; // ask the model for a JSON object (callers must still validate the output)
  timeoutMs?: number;
};

export { aiComplete, aiStatus } from './engine';
