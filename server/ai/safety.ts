/**
 * Input hygiene for everything we send to an AI provider.
 *
 * LIMITATIONS (be honest): there is no complete defence against prompt injection.
 * These functions reduce the obvious cases: they strip markup, neutralise common
 * "ignore previous instructions" phrasings, keep untrusted text inside delimiters
 * the model is told to treat as data, and redact obvious secrets and contact
 * details. A determined attacker can still phrase instructions we do not catch.
 * That is why assistants have no tools and can take no actions beyond answering,
 * and why users see "AI can be wrong. Verify important information."
 */
import type { AiChatMessage } from './service';

export const SAFETY_LIMITATIONS =
  'Prompt-injection defences are best effort: retrieved and uploaded text is stripped of markup, common injection phrases are neutralised and the text is fenced as untrusted data, but no filter catches every phrasing. Assistants cannot take actions, so the worst case is a wrong or off-topic answer.';

/** Hard cap on total characters sent per request (roughly 12k tokens). */
export const MAX_INPUT_CHARS = 48_000;
/** Cap for a single user message. */
export const MAX_MESSAGE_CHARS = 8_000;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/** Removes HTML tags, scripts, styles and comments; decodes the common entities. */
export function stripHtml(input: string): string {
  return input
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|iframe|object|embed|noscript)[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/&(#39|amp|lt|gt|quot|apos|nbsp);/g, (_m, e: string) => ENTITIES[e] ?? ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const INJECTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|any|system|your)\b[^.\n]{0,30}\b(instructions?|prompts?|rules?|directions?|guidelines?|messages?)\b/gi,
  /\byou are now\b[^.\n]{0,80}/gi,
  /\b(new|updated|revised) (system )?(instructions?|rules?)\s*:/gi,
  /\b(act|behave|respond) as (if you (are|were)|an?|the)\b[^.\n]{0,60}\b(unrestricted|jailbroken|developer mode|DAN|without (rules|restrictions|filters))\b/gi,
  /\b(reveal|print|show|repeat|output|leak)\b[^.\n]{0,30}\b(system prompt|hidden instructions?|your instructions|api keys?|secrets?|passwords?)\b/gi,
  /^\s*(system|assistant|developer)\s*:/gim,
  /<\|?(im_start|im_end|system|endoftext)\|?>/gi,
];

export const NEUTRALISED = '[possible instruction removed]';

/** Replaces common injection phrasings inside untrusted text. */
export function neutralizeInjection(input: string): string {
  let out = input;
  for (const re of INJECTION_PATTERNS) out = out.replace(re, NEUTRALISED);
  return out;
}

/** Stops untrusted text from closing or opening our own delimiters. */
export function escapeDelimiters(input: string): string {
  return input.replace(/<\s*(\/?)\s*(source|context|untrusted|system)\b/gi, (_m, slash: string, tag: string) => `‹${slash}${tag}`);
}

export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  return `${input.slice(0, max).replace(/\s+\S*$/, '')} […truncated]`;
}

/** Full pipeline for retrieved or uploaded text before it goes into a prompt. */
export function sanitizeUntrusted(input: string, max = 4000): string {
  return truncate(escapeDelimiters(neutralizeInjection(stripHtml(input ?? ''))), max);
}

/** Wraps untrusted text in a delimiter block the base instructions tell the model to treat as data. */
export function untrustedBlock(tag: 'source' | 'context', attrs: Record<string, string | number>, text: string): string {
  const a = Object.entries(attrs)
    .map(([k, v]) => `${k}="${String(v).replace(/["<>\n]/g, ' ').slice(0, 160)}"`)
    .join(' ');
  return `<${tag} ${a} trust="untrusted">\n${text}\n</${tag}>`;
}

// ---------- Redaction ----------

const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}\b/g,
  /\bgsk_[A-Za-z0-9]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWT
  /\b(password|passwd|pwd|secret|api[_-]?key|token|access[_-]?key)\s*[:=]\s*["']?[^\s"']{6,}/gi,
];
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE = /(?<![\w.])\+?\(?\d{1,4}\)?(?:[\s.-]\(?\d{1,5}\)?){1,5}(?![\w.])|(?<![\w.])\+\d{9,14}(?![\w.])/g;

export function redactSensitive(input: string): string {
  let out = input;
  for (const re of SECRET_PATTERNS) out = out.replace(re, (m) => (/^(password|passwd|pwd|secret|api|token|access)/i.test(m) ? `${m.split(/[:=]/)[0]}=[secret redacted]` : '[secret redacted]'));
  out = out.replace(EMAIL, '[email redacted]');
  out = out.replace(PHONE, (m) => {
    const digits = m.replace(/\D/g, '').length;
    return digits >= 9 && digits <= 15 ? '[phone redacted]' : m;
  });
  return out;
}

export function redactMessages(messages: AiChatMessage[]): AiChatMessage[] {
  return messages.map((m) => ({ ...m, content: redactSensitive(m.content) }));
}

/**
 * Merges all system messages into one leading system message (some providers
 * reject several) and keeps the conversation under the size budget by dropping
 * the oldest non-system turns first. The latest user turn is always kept (truncated if needed).
 */
export function prepareMessages(messages: AiChatMessage[], maxChars = MAX_INPUT_CHARS): AiChatMessage[] {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join('\n\n');
  const turns = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }));
  let budget = maxChars - Math.min(system.length, Math.floor(maxChars * 0.6));
  const kept: AiChatMessage[] = [];
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    if (kept.length === 0) {
      const content = truncate(t.content, Math.max(500, budget));
      kept.unshift({ ...t, content });
      budget -= content.length;
      continue;
    }
    if (t.content.length > budget) break;
    kept.unshift(t);
    budget -= t.content.length;
  }
  // Conversations must start with a user turn for some providers.
  while (kept.length > 1 && kept[0].role !== 'user') kept.shift();
  const sys = system ? [{ role: 'system' as const, content: truncate(system, Math.floor(maxChars * 0.6)) }] : [];
  return [...sys, ...kept];
}
