import { pgTable, uuid, text, timestamp, jsonb, boolean, integer, index } from 'drizzle-orm/pg-core';
import { cols, users } from './core';

const { id, createdAt, updatedAt } = cols;

/**
 * Admin-configured AI providers. Keys entered in the UI are encrypted at rest
 * with APP_SECRET (AES-256-GCM). Providers can also come from environment
 * variables; those rows have keySource = 'env' and never store the key.
 */
export const aiProviders = pgTable('ai_providers', {
  id: id(),
  preset: text().notNull(), // gemini | groq | openrouter | cloudflare | mistral | azure_openai | ollama | custom
  label: text().notNull(),
  baseUrl: text().notNull(),
  model: text().notNull(),
  keySource: text().notNull().default('db'), // db | env | none
  apiKeyEnc: text(),
  envVar: text(),
  priority: integer().notNull().default(100),
  enabled: boolean().notNull().default(true),
  timeoutMs: integer().notNull().default(30000),
  dataNotice: text(), // e.g. "Free tier: prompts may be used for training"
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orgId: uuid(),
    assistant: text().notNull(),
    title: text().notNull(),
    context: jsonb().$type<{ type?: string; id?: string; label?: string }>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('ai_conv_user_idx').on(t.userId, t.updatedAt)],
);

export const aiMessages = pgTable(
  'ai_messages',
  {
    id: id(),
    conversationId: uuid()
      .notNull()
      .references(() => aiConversations.id, { onDelete: 'cascade' }),
    role: text().notNull(), // user | assistant | system_notice
    content: text().notNull(),
    sources: jsonb().$type<{ n: number; title: string; url?: string; kind: string; id?: string }[]>(),
    provider: text(),
    model: text(),
    status: text().notNull().default('ok'), // ok | error | unavailable
    feedback: integer(), // 1 | -1
    feedbackNote: text(),
    createdAt: createdAt(),
  },
  (t) => [index('ai_msg_conv_idx').on(t.conversationId, t.createdAt)],
);

export const aiUsage = pgTable(
  'ai_usage',
  {
    id: id(),
    userId: uuid(),
    orgId: uuid(),
    assistant: text().notNull(),
    feature: text().notNull(), // chat | hint | grading_proposal | resume_review | jd_analysis | eval
    providerId: uuid(),
    provider: text(),
    model: text(),
    status: text().notNull(), // ok | error | timeout | rate_limited | quota_exceeded | unavailable
    inputTokens: integer(),
    outputTokens: integer(),
    tokensEstimated: boolean().notNull().default(false),
    latencyMs: integer(),
    error: text(),
    createdAt: createdAt(),
  },
  (t) => [index('ai_usage_created_idx').on(t.createdAt), index('ai_usage_user_idx').on(t.userId, t.createdAt)],
);

export const aiEvalRuns = pgTable('ai_eval_runs', {
  id: id(),
  startedBy: uuid().notNull(),
  providerId: uuid(),
  status: text().notNull().default('queued'), // queued | running | completed | failed
  results: jsonb().$type<{ caseId: string; passed: boolean; checks: { name: string; passed: boolean }[]; output?: string; error?: string }[]>(),
  passed: integer(),
  total: integer(),
  createdAt: createdAt(),
  completedAt: timestamp({ withTimezone: true }),
});
