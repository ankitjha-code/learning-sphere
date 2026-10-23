/**
 * Interview prep content and deterministic feedback.
 * Model answers are authored study guidance (structure + what interviewers look for),
 * never fabricated personal stories.
 */

export const INTERVIEW_KINDS = ['behavioral', 'project', 'system_design', 'technical', 'sql', 'dsa', 'role', 'communication'] as const;
export type InterviewKind = (typeof INTERVIEW_KINDS)[number];

export const KIND_LABEL: Record<InterviewKind, string> = {
  behavioral: 'Behavioral (STAR)',
  project: 'Project discussion',
  system_design: 'System design',
  technical: 'Technical concepts',
  sql: 'SQL',
  dsa: 'Coding and DSA',
  role: 'Role-specific',
  communication: 'Communication',
};

export type BankQuestion = { id: string; kind: InterviewKind; prompt: string; tags?: string[]; role?: string; guidance: string; modelAnswer?: string; skillSlugs?: string[] };

const STAR_GUIDE =
  'Use STAR. Situation: one or two sentences of context. Task: what you were responsible for. Action: the steps you personally took (say "I", not only "we"). Result: what happened, and what you learned. Use a real example; if you have no work example, a project, volunteer or study example is fine.';

const STAR_MODEL = (focus: string) =>
  `Structure to study (fill it with your own real example):\n\n- Situation: "[Where and when, in one sentence]."\n- Task: "[What you were responsible for; ${focus}]."\n- Action: "[Two to four concrete steps you took and why you chose them]."\n- Result: "[What changed. If you have a real measurement, give it; otherwise describe the observable outcome.] [One thing you learned or would do differently]."\n\nWhat interviewers listen for: ownership, judgement, specifics, and reflection. Keep it to about two minutes.`;

export const QUESTION_BANK: BankQuestion[] = [
  // Behavioral
  { id: 'beh-conflict', kind: 'behavioral', prompt: 'Tell me about a time you disagreed with a teammate or manager. How did you handle it?', guidance: STAR_GUIDE, modelAnswer: STAR_MODEL('show how you understood the other view'), skillSlugs: ['behavioral-interviews', 'teamwork'] },
  { id: 'beh-failure', kind: 'behavioral', prompt: 'Describe a mistake you made at work or in a project. What did you do next?', guidance: STAR_GUIDE, modelAnswer: STAR_MODEL('own the mistake without blaming others'), skillSlugs: ['behavioral-interviews'] },
  { id: 'beh-learn-fast', kind: 'behavioral', prompt: 'Tell me about a time you had to learn something new quickly.', guidance: STAR_GUIDE, modelAnswer: STAR_MODEL('explain how you structured the learning'), skillSlugs: ['behavioral-interviews'] },
  { id: 'beh-deadline', kind: 'behavioral', prompt: 'Describe a situation where you had a tight deadline. How did you prioritize?', guidance: STAR_GUIDE, modelAnswer: STAR_MODEL('name what you chose not to do and why'), skillSlugs: ['behavioral-interviews'] },
  { id: 'beh-improve', kind: 'behavioral', prompt: 'Tell me about a process you improved.', guidance: STAR_GUIDE, modelAnswer: STAR_MODEL('describe the before and after'), skillSlugs: ['behavioral-interviews'] },
  { id: 'beh-feedback', kind: 'behavioral', prompt: 'Tell me about a time you received difficult feedback.', guidance: STAR_GUIDE, modelAnswer: STAR_MODEL('show what you changed afterwards'), skillSlugs: ['behavioral-interviews', 'communication'] },
  { id: 'beh-ambiguity', kind: 'behavioral', prompt: 'Describe a time you had to make progress with unclear requirements.', guidance: STAR_GUIDE, modelAnswer: STAR_MODEL('show the questions you asked and assumptions you stated'), skillSlugs: ['behavioral-interviews'] },
  { id: 'beh-help', kind: 'behavioral', prompt: 'Tell me about a time you helped someone else succeed.', guidance: STAR_GUIDE, modelAnswer: STAR_MODEL('keep the focus on what you did'), skillSlugs: ['behavioral-interviews', 'teamwork'] },
  { id: 'beh-why-switch', kind: 'behavioral', prompt: 'Why are you moving into software development, and what have you done to prepare?', guidance: 'Be honest and concrete: what pulled you toward the field, and the specific learning and projects you have done. Avoid negativity about your previous field.', modelAnswer: 'Structure to study:\n\n- Motivation: "[A real moment or problem that got you interested]."\n- Preparation: "[Courses, topics, and projects you completed; name them]."\n- Transferable strengths: "[Skills from your previous work that carry over, with an example]."\n- Direction: "[The kind of role you want next and why this company fits]."', skillSlugs: ['behavioral-interviews', 'communication'] },
  // Project discussion
  { id: 'proj-walkthrough', kind: 'project', prompt: 'Walk me through a project you built. What problem does it solve?', guidance: 'Cover the problem, who it is for, your role, the architecture, one hard decision and why, and what you would change.', modelAnswer: 'Checklist to study:\n\n1. One-sentence problem statement and users.\n2. What you personally built (versus team members or tutorials).\n3. Architecture in a few boxes: client, server, database, external services.\n4. One trade-off you made and the alternative you rejected.\n5. Testing and how you know it works.\n6. What you would improve next.', skillSlugs: ['communication'] },
  { id: 'proj-hardest-bug', kind: 'project', prompt: 'What was the hardest bug you hit in a project, and how did you find it?', guidance: 'Describe symptoms, hypotheses, how you narrowed it down (logs, tests, bisecting), the root cause, and the fix.', modelAnswer: 'Structure: symptom → first hypothesis → evidence gathered → narrowed cause → fix → prevention (a test or check you added).', skillSlugs: ['debugging'] },
  { id: 'proj-tradeoff', kind: 'project', prompt: 'Tell me about a technical decision in your project you would make differently today.', guidance: 'Show judgement: the decision, the context at the time, what you learned, and what you would choose now.', skillSlugs: ['communication'] },
  { id: 'proj-data-model', kind: 'project', prompt: 'How did you design the data model for your project?', guidance: 'Name the main entities and relationships, keys and constraints, and one query you optimized or would need to.', skillSlugs: ['database-design'] },
  // System design
  { id: 'sd-url-shortener', kind: 'system_design', prompt: 'Design a URL shortener.', guidance: 'Clarify requirements, estimate scale, define the API and data model, sketch components, then discuss scaling, caching and trade-offs.', modelAnswer: 'Outline to study:\n\n1. Requirements: create short link, redirect, optional expiry and analytics. Read-heavy.\n2. API: POST /links {url} → {code}; GET /:code → 301/302 redirect.\n3. Data model: links(code PK, url, created_at, expires_at, owner_id).\n4. Code generation: base62 of a counter or random with collision check; discuss predictability.\n5. Components: stateless app servers behind a load balancer, a key-value or relational store, a cache for hot codes.\n6. Scaling: cache reads, replicate the database, partition by code if needed.\n7. Trade-offs: 301 (cacheable, loses analytics) versus 302; counter versus random codes.', skillSlugs: ['system-design-basics', 'caching'] },
  { id: 'sd-rate-limiter', kind: 'system_design', prompt: 'Design a rate limiter for an API.', guidance: 'Discuss algorithms (fixed window, sliding window, token bucket), where state lives, and behaviour when the store is unavailable.', modelAnswer: 'Outline to study:\n\n1. Requirements: limit per user or key, low latency, clear 429 responses with Retry-After.\n2. Algorithms: fixed window (simple, bursty at edges), sliding log (accurate, memory heavy), token bucket (smooth, common).\n3. State: in-memory for one instance; a shared store with atomic increments for many instances.\n4. Failure mode: fail open or closed, and why.\n5. Observability: count rejections per key.', skillSlugs: ['system-design-basics', 'scalability'] },
  { id: 'sd-notifications', kind: 'system_design', prompt: 'Design a notification system that sends in-app and email notifications.', guidance: 'Cover producers, a queue, workers, user preferences, retries and idempotency, and delivery status.', modelAnswer: 'Outline to study:\n\n1. Requirements: in-app list, email, preferences per category, retries.\n2. Flow: event → notification record → queue job per channel → worker → provider.\n3. Idempotency key per notification and channel so retries never double-send.\n4. Status honesty: queued, accepted by provider, failed. "Accepted" is not "delivered".\n5. Scaling: horizontal workers; backoff on provider errors.', skillSlugs: ['system-design-basics', 'messaging'] },
  { id: 'sd-library', kind: 'system_design', prompt: 'Design a library book-lending system (search, reserve, check out, return).', guidance: 'Model entities and states, handle concurrent reservations, and define the main APIs.', modelAnswer: 'Outline to study:\n\n1. Entities: book (title), copy (physical item), member, loan, reservation.\n2. States: copy available → on loan → returned; reservation queue per title.\n3. Concurrency: a transaction or unique constraint so one copy cannot be loaned twice.\n4. APIs: search, reserve, checkout, return; overdue job that sends reminders.\n5. Reporting: loans per period with indexed date columns.', skillSlugs: ['system-design-basics', 'database-design', 'transactions'] },
  { id: 'sd-feed', kind: 'system_design', prompt: 'Design a simple job board that aggregates postings from external APIs.', guidance: 'Discuss scheduled fetching, rate limits, normalization, deduplication, expiry and attribution.', modelAnswer: 'Outline to study:\n\n1. Scheduled fetch per source honouring each provider\'s rate limit.\n2. Normalize into one schema; dedupe on (source, external id).\n3. Remove expired listings; keep fetched-at timestamps visible.\n4. Attribution and link-out per provider terms.\n5. Failure: show the last successful sync and the error, never stale data as fresh.', skillSlugs: ['system-design-basics', 'api-design'] },
  // Technical concepts
  { id: 'tech-rest', kind: 'technical', prompt: 'What makes an API RESTful? Explain status codes you would use for create, not found and validation errors.', guidance: 'Define the idea, give a concrete example, and mention a trade-off.', modelAnswer: 'Key points: resources identified by URLs, standard methods (GET, POST, PUT/PATCH, DELETE), stateless requests, representations such as JSON. 201 Created for create, 404 Not Found, 400 or 422 for validation errors, 401 versus 403 for authentication versus authorization.', skillSlugs: ['http-rest'] },
  { id: 'tech-index', kind: 'technical', prompt: 'What is a database index and when can it hurt?', guidance: 'Explain the data structure at a high level, a query it speeds up, and the write and storage cost.', modelAnswer: 'Key points: usually a B-tree that lets the database find rows without scanning the whole table; speeds equality and range lookups on indexed columns; costs extra writes and storage; low-selectivity columns gain little; composite index column order matters.', skillSlugs: ['indexing'] },
  { id: 'tech-async', kind: 'technical', prompt: 'Explain the difference between concurrency and parallelism, with an example from backend code.', guidance: 'Define both, then give an example such as handling many I/O-bound requests on one event loop.', skillSlugs: ['async-programming', 'concurrency'] },
  { id: 'tech-transactions', kind: 'technical', prompt: 'What does ACID mean? Give an example where a transaction prevents a bug.', guidance: 'Define each letter briefly and use a concrete example such as transferring money or reserving the last item.', skillSlugs: ['transactions'] },
  { id: 'tech-auth', kind: 'technical', prompt: 'How do session cookies differ from bearer tokens for authentication?', guidance: 'Cover storage, CSRF versus XSS exposure, revocation and typical use cases.', skillSlugs: ['auth-security-web'] },
  { id: 'tech-git', kind: 'technical', prompt: 'How would you undo a commit that was already pushed to a shared branch?', guidance: 'Compare revert and reset, and explain why rewriting shared history is risky.', skillSlugs: ['git'] },
  // Role-specific
  { id: 'role-be-1', kind: 'role', role: 'backend', prompt: 'How would you design pagination for an API that lists thousands of records?', guidance: 'Compare offset and cursor pagination, ordering guarantees and performance.', skillSlugs: ['api-design'] },
  { id: 'role-be-2', kind: 'role', role: 'backend', prompt: 'A request is slow in production. How do you investigate?', guidance: 'Describe measuring first (logs, traces, query plans), forming hypotheses, and verifying the fix.', skillSlugs: ['observability', 'debugging'] },
  { id: 'role-be-3', kind: 'role', role: 'backend', prompt: 'How do you validate and sanitize input in a web service?', guidance: 'Mention schema validation, parameterized queries, output encoding and least privilege.', skillSlugs: ['web-security'] },
  { id: 'role-fe-1', kind: 'role', role: 'frontend', prompt: 'How do you decide what state belongs in a component versus a global store or the server cache?', guidance: 'Discuss ownership, sharing, persistence and server state libraries.', skillSlugs: ['react'] },
  { id: 'role-fe-2', kind: 'role', role: 'frontend', prompt: 'How do you make a custom dropdown accessible?', guidance: 'Keyboard support, focus management, ARIA roles, and why native elements are often better.', skillSlugs: ['web-accessibility'] },
  { id: 'role-data-1', kind: 'role', role: 'data', prompt: 'How would you check a new dataset for quality problems before analysis?', guidance: 'Missing values, duplicates, ranges, types, outliers and documenting assumptions.', skillSlugs: ['data-wrangling'] },
  // Communication
  { id: 'comm-explain', kind: 'communication', prompt: 'Explain what an API is to someone who does not work in tech.', guidance: 'Use a simple analogy, avoid jargon, and check understanding.', skillSlugs: ['communication'] },
  { id: 'comm-intro', kind: 'communication', prompt: 'Tell me about yourself.', guidance: 'Present, past, future in about a minute: what you do now, the relevant path that led here, and what you want next.', modelAnswer: 'Structure to study: Present ("I am currently [what you do]") → Past ("Before that, [relevant experience], where I [one real strength]") → Future ("I am looking for [type of role] because [reason tied to the company]"). Keep it under ninety seconds.', skillSlugs: ['communication'] },
  { id: 'comm-question', kind: 'communication', prompt: 'What questions do you have for us?', guidance: 'Prepare two or three genuine questions about the team, how success is measured, and onboarding.', skillSlugs: ['communication'] },
];

// ---------- Deterministic feedback ----------

export type FeedbackItem = { label: string; met: boolean; note?: string };
export type Feedback = { source: 'checklist'; items: FeedbackItem[]; summary: string };
export type FeedbackStats = { words: number; fillerCount: number; fillers: Record<string, number>; speakingSeconds: number; iCount: number; weCount: number };

const FILLERS = ['um', 'uh', 'erm', 'like', 'basically', 'actually', 'literally', 'you know', 'kind of', 'sort of', 'i mean', 'just'];

export function answerStats(answer: string): FeedbackStats {
  const lower = ` ${answer.toLowerCase().replace(/[^\w\s']/g, ' ')} `;
  const words = answer.split(/\s+/).filter(Boolean).length;
  const fillers: Record<string, number> = {};
  let fillerCount = 0;
  for (const f of FILLERS) {
    const c = lower.split(` ${f} `).length - 1;
    if (c) {
      fillers[f] = c;
      fillerCount += c;
    }
  }
  const iCount = (answer.match(/\bI\b/g) ?? []).length;
  const weCount = (answer.match(/\bwe\b/gi) ?? []).length;
  return { words, fillerCount, fillers, speakingSeconds: Math.round((words / 140) * 60), iCount, weCount };
}

const has = (text: string, re: RegExp) => re.test(text);

function lengthItem(words: number, min: number, max: number): FeedbackItem {
  if (words < min) return { label: 'Enough detail', met: false, note: 'Quite short. Add the missing parts of the structure with real specifics.' };
  if (words > max) return { label: 'Concise', met: false, note: 'Long for a spoken answer. Trim background and keep the steps and outcome.' };
  return { label: 'Length suits a spoken answer', met: true };
}

export function deterministicFeedback(kind: string, answer: string): { feedback: Feedback; stats: FeedbackStats } {
  const stats = answerStats(answer);
  const t = answer.toLowerCase();
  const items: FeedbackItem[] = [];
  if (kind === 'behavioral') {
    items.push({ label: 'Situation: sets the context', met: has(t, /\b(when|while|during|at my|in my (role|job|previous|last)|situation|context|back in|i was working|our team)\b/), note: 'Open with where and when, in a sentence or two.' });
    items.push({ label: 'Task: states your responsibility', met: has(t, /\b(my (task|job|role|responsibility|goal)|i (needed|had|was asked|was responsible) to|goal was|i was tasked|challenge was)\b/), note: 'Say what you specifically had to achieve.' });
    const actions = (answer.match(/\bI\s+(?!was\b|am\b|think\b|feel\b)[a-z]+(ed|t)?\b/g) ?? []).length;
    items.push({ label: 'Action: describes steps you took', met: actions >= 2, note: 'Describe at least two concrete steps using "I" (what you did, and why).' });
    items.push({ label: 'Result: explains the outcome', met: has(t, /\b(result|as a result|outcome|in the end|eventually|led to|which meant|so that|learned|ended up|impact|afterwards|since then)\b/), note: 'Finish with what changed and what you learned. Use a real measurement only if you have one.' });
    items.push({ label: 'Ownership: says what you did', met: stats.iCount >= stats.weCount || stats.weCount <= 2, note: 'Many "we" statements. Make your own contribution clear.' });
    items.push(lengthItem(stats.words, 90, 420));
  } else if (kind === 'system_design') {
    items.push({ label: 'Clarifies requirements', met: has(t, /\b(requirement|users?|use case|functional|scale|traffic|assum)/), note: 'Start by clarifying requirements and expected scale.' });
    items.push({ label: 'Defines API or data model', met: has(t, /\b(api|endpoint|schema|table|data model|entity|post |get )/), note: 'Name the main API calls and entities.' });
    items.push({ label: 'Sketches components', met: has(t, /\b(service|server|database|cache|queue|load balancer|worker|client)\b/), note: 'Describe the main components and how requests flow.' });
    items.push({ label: 'Discusses scaling and bottlenecks', met: has(t, /\b(scal|shard|partition|replica|bottleneck|cache|horizontal|throughput|latency)/), note: 'Call out where it would break first and how to scale.' });
    items.push({ label: 'Explains trade-offs', met: has(t, /\b(trade-?off|instead|alternatively|downside|pros?|cons?|because|versus|vs\.?)\b/), note: 'Compare at least one alternative and say why you chose yours.' });
    items.push(lengthItem(stats.words, 120, 900));
  } else if (kind === 'project') {
    items.push({ label: 'States the problem', met: has(t, /\b(problem|users?|built (it|this) (to|for)|goal|purpose|so that)\b/), note: 'Say what problem it solves and for whom.' });
    items.push({ label: 'Clarifies your role', met: stats.iCount >= 2, note: 'Make clear what you personally built or decided.' });
    items.push({ label: 'Explains technical decisions', met: has(t, /\b(chose|decided|because|instead|used .+ (for|because)|trade-?off)\b/), note: 'Explain at least one decision and why.' });
    items.push({ label: 'Mentions a challenge', met: has(t, /\b(challenge|hard|difficult|bug|issue|problem was|struggled|tricky)\b/), note: 'Describe a challenge and how you handled it.' });
    items.push({ label: 'Reflects on outcome or learning', met: has(t, /\b(learned|would (change|do differently|improve)|next|result|outcome)\b/), note: 'Close with what you learned or would improve.' });
    items.push(lengthItem(stats.words, 90, 500));
  } else {
    items.push({ label: 'Gives a clear definition or direct answer', met: stats.words >= 25, note: 'Start with a one-sentence direct answer.' });
    items.push({ label: 'Uses a concrete example', met: has(t, /\b(for example|e\.g\.|for instance|such as|imagine|like when|say we)\b/), note: 'Add a concrete example.' });
    items.push({ label: 'Mentions a trade-off or limitation', met: has(t, /\b(trade-?off|but|however|downside|cost|when not|unless|limitation)\b/), note: 'Mention when it does not apply or what it costs.' });
    items.push({ label: 'Structured delivery', met: has(t, /\b(first|second|then|finally|next|overall|in short)\b/) || answer.split('\n').filter((l) => l.trim()).length > 1, note: 'Signpost your points (first, then, finally).' });
    items.push(lengthItem(stats.words, 40, 400));
  }
  items.push({ label: 'Few filler words', met: stats.fillerCount <= Math.max(2, Math.floor(stats.words / 60)), note: `Filler words found: ${Object.entries(stats.fillers).map(([k, v]) => `"${k}" x${v}`).join(', ') || 'none'}.` });
  const met = items.filter((i) => i.met).length;
  const missing = items.filter((i) => !i.met).map((i) => i.label.toLowerCase());
  const summary = missing.length ? `${met} of ${items.length} checks met. Work on: ${missing.slice(0, 3).join('; ')}.` : `All ${items.length} checks met. Practise saying it aloud within about two minutes.`;
  return { feedback: { source: 'checklist', items: items.map((i) => (i.met ? { label: i.label, met: true } : i)), summary }, stats };
}
