// Extra tables owned by the workspace / library / create features. Add new tables here (do not edit other schema files).
import { pgTable, uuid, text, index } from 'drizzle-orm/pg-core';
import { cols, users } from './core';
import { resources } from './learning';

const { id, createdAt } = cols;

/** Platform-admin review decisions on community submissions to the public library (history kept). */
export const resourceReviews = pgTable(
  'resource_reviews',
  {
    id: id(),
    resourceId: uuid()
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    reviewerId: uuid().references(() => users.id, { onDelete: 'set null' }),
    decision: text().notNull(), // approved | rejected | submitted
    note: text(),
    version: text(),
    createdAt: createdAt(),
  },
  (t) => [index('resource_reviews_resource_idx').on(t.resourceId, t.createdAt)],
);
