// Extra tables owned by the ai feature. Add new tables here (do not edit other schema files).
import { pgTable, uuid, text, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { cols } from './core';
import { aiConversations } from './ai';

const { id, createdAt, updatedAt } = cols;

/**
 * Idempotency record for chat sends. A retried POST with the same clientMessageId
 * never creates a second user message; a completed send is replayed instead of
 * calling the model again; a failed send is retried in place (same rows updated).
 */
export const aiMessageRequests = pgTable(
  'ai_message_requests',
  {
    id: id(),
    conversationId: uuid()
      .notNull()
      .references(() => aiConversations.id, { onDelete: 'cascade' }),
    userId: uuid().notNull(),
    clientMessageId: text().notNull(),
    userMessageId: uuid(),
    assistantMessageId: uuid(),
    status: text().notNull().default('pending'), // pending | done | failed | stopped
    attempts: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('ai_msg_req_uq').on(t.conversationId, t.clientMessageId)],
);
