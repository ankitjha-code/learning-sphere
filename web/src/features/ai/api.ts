import { api, ApiError } from '@/lib/api';

export type AiFailureReason = 'not_configured' | 'disabled' | 'quota_exceeded' | 'rate_limited' | 'timeout' | 'unavailable' | 'error' | 'interrupted';

export type AiStatus = {
  configured: boolean;
  enabled: boolean;
  providers: { label: string; preset: string; model: string; healthy: boolean; dataNotice: string | null }[];
  problems: { label: string; problem: string }[];
  dataNotices: string[];
  primaryNotice: string | null;
  quota: {
    user: { limit: number; used: number; remaining: number; resetsInSeconds: number };
    org: { limit: number; used: number; remaining: number; resetsInSeconds: number } | null;
  };
  isPlatformAdmin: boolean;
  freeOptions: { id: string; label: string; freeTier: string; signupUrl: string; envVars: string[] }[];
  transparency: string;
  limitations: string;
};

export type AssistantInfo = {
  id: string;
  name: string;
  group: 'learning' | 'coding' | 'career' | 'teaching_hiring';
  description: string;
  can: string[];
  cannot: string[];
  contexts: string[];
  usesSources: boolean;
  starters: string[];
  requiredRoles: string[];
  available: boolean;
  reason: string | null;
};

export type AssistantsResponse = { transparency: string; groups: { id: string; label: string }[]; assistants: AssistantInfo[] };

export type ConversationContext = { type?: string; id?: string; label?: string };

export type Conversation = {
  id: string;
  title: string;
  assistant: string;
  assistantName: string;
  context: ConversationContext;
  createdAt: string;
  updatedAt: string;
};

export type Source = { n: number; title: string; url?: string; kind: string; id?: string };

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system_notice';
  content: string;
  sources: Source[];
  provider: string | null;
  model: string | null;
  status: 'ok' | 'error' | 'unavailable' | 'stopped' | string;
  feedback: number | null;
  createdAt: string;
};

export type RouteSuggestion = {
  assistant: string;
  name: string;
  explanation: string;
  matched: string[];
  alternatives: { assistant: string; name: string; score: number }[];
  fallback: boolean;
};

export const aiKeys = {
  status: ['ai', 'status'] as const,
  assistants: ['ai', 'assistants'] as const,
  conversations: ['ai', 'conversations'] as const,
  messages: (id: string) => ['ai', 'messages', id] as const,
};

export const fetchStatus = () => api.get<AiStatus>('/ai/status');
export const fetchAssistants = () => api.get<AssistantsResponse>('/ai/assistants');
export const fetchConversations = () => api.get<{ items: Conversation[]; total: number }>('/ai/conversations?pageSize=50');

/** Parses a "type:id" context param from the URL (e.g. topic:<uuid>). */
export function parseContextParam(raw: string | null, label: string | null): ConversationContext | null {
  if (!raw) return label ? { type: 'text', label } : null;
  const i = raw.indexOf(':');
  if (i <= 0) return null;
  return { type: raw.slice(0, i), id: raw.slice(i + 1), label: label ?? undefined };
}

export function newClientMessageId() {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `m_${rnd}`;
}

export type StreamHandlers = {
  onStart?: (d: { userMessageId: string; replayed?: boolean }) => void;
  onSources?: (sources: Source[]) => void;
  onDelta?: (text: string) => void;
  onDone?: (d: { messageId: string; provider: string; model: string; replayed?: boolean }) => void;
  onError?: (d: { reason: AiFailureReason; message: string; retryAfterSeconds?: number | null; messageId?: string }) => void;
};

/**
 * POSTs a chat message and reads the text/event-stream response.
 * Throws ApiError-like errors only for HTTP failures (validation, 403, 404, 409).
 */
export async function streamMessage(conversationId: string, body: { content: string; clientMessageId: string }, handlers: StreamHandlers, signal: AbortSignal) {
  const res = await fetch(`/api/ai/conversations/${conversationId}/messages`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch', accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let message = `Request failed (${res.status}).`;
    let code = 'error';
    try {
      const j = await res.json();
      message = j?.error?.message ?? message;
      code = j?.error?.code ?? code;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, code, message);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const event = block.match(/^event: ?(.*)$/m)?.[1];
      const dataLine = block
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).replace(/^ /, ''))
        .join('\n');
      if (!event || !dataLine) continue;
      let data: any;
      try {
        data = JSON.parse(dataLine);
      } catch {
        continue;
      }
      if (event === 'start') handlers.onStart?.(data);
      else if (event === 'sources') handlers.onSources?.(data.sources ?? []);
      else if (event === 'delta') handlers.onDelta?.(data.text ?? '');
      else if (event === 'done') handlers.onDone?.(data);
      else if (event === 'error') handlers.onError?.(data);
    }
  }
}

export const REASON_TITLES: Record<string, string> = {
  not_configured: 'AI is not configured',
  disabled: 'AI is turned off',
  quota_exceeded: 'AI limit reached',
  rate_limited: 'The AI provider is busy',
  timeout: 'The AI provider timed out',
  unavailable: 'AI is unavailable right now',
  interrupted: 'The answer was cut off',
  error: 'The AI request failed',
};

export function formatWait(seconds: number | null | undefined) {
  if (!seconds) return null;
  if (seconds < 90) return `${seconds} seconds`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)} hours`;
  return `${Math.round(seconds / 86400)} days`;
}
