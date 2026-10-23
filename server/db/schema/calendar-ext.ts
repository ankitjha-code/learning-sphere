// Tables owned by the calendar feature. Add new tables here (do not edit other schema files).
import { pgTable, uuid, text, timestamp, jsonb, boolean, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { cols, users } from './core';

const { id, createdAt, updatedAt } = cols;

/**
 * Per-user calendar settings and the private ICS subscription feed.
 * The feed token is looked up by its SHA-256 hash. An AES-GCM encrypted copy (APP_SECRET)
 * lets the owner see the URL again; a database dump alone reveals neither.
 */
export const calendarSettings = pgTable(
  'calendar_settings',
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    feedEnabled: boolean().notNull().default(false),
    feedTokenHash: text(),
    feedTokenEnc: text(),
    feedTokenCreatedAt: timestamp({ withTimezone: true }),
    feedLastAccessedAt: timestamp({ withTimezone: true }),
    /** Event types included in the feed and in direct sync. */
    types: text().array().notNull().default(sql`'{task,assignment,assessment,interview,mentor_session,milestone}'::text[]`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('calendar_settings_feed_token_idx').on(t.feedTokenHash)],
);

/** A connected external calendar account (Google or Microsoft). Tokens are encrypted at rest and never returned by the API. */
export const calendarConnections = pgTable(
  'calendar_connections',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text().notNull(), // google | microsoft
    accountEmail: text(),
    scope: text(),
    refreshTokenEnc: text(),
    accessTokenEnc: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    /** The dedicated "LearnSphere Nexus" calendar we created and write to (never any other calendar). */
    externalCalendarId: text(),
    status: text().notNull().default('active'), // active | needs_reconnect
    lastSyncAt: timestamp({ withTimezone: true }),
    lastSyncStatus: text().notNull().default('never'), // never | ok | partial | error | skipped
    lastSyncError: text(),
    lastSyncStats: jsonb().$type<{ created: number; updated: number; deleted: number; unchanged: number; failed: number }>(),
    lastFingerprint: text(),
    lastFullSyncAt: timestamp({ withTimezone: true }),
    nextRetryAt: timestamp({ withTimezone: true }),
    consecutiveFailures: integer().notNull().default(0),
    syncLockedUntil: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('calendar_connections_user_provider_idx').on(t.userId, t.provider), index('calendar_connections_status_idx').on(t.status)],
);

/** Our stable item key (for example "task-<uuid>") to the provider's event id, per connection. */
export const calendarEventMaps = pgTable(
  'calendar_event_maps',
  {
    id: id(),
    connectionId: uuid()
      .notNull()
      .references(() => calendarConnections.id, { onDelete: 'cascade' }),
    itemKey: text().notNull(),
    externalEventId: text().notNull(),
    contentHash: text().notNull(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('calendar_event_maps_conn_item_idx').on(t.connectionId, t.itemKey)],
);

/** Pending OAuth authorizations: state (hashed) bound to the browser session, with the PKCE verifier (encrypted). One-time use. */
export const calendarOauthStates = pgTable(
  'calendar_oauth_states',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: text().notNull(),
    provider: text().notNull(),
    stateHash: text().notNull(),
    codeVerifierEnc: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('calendar_oauth_states_state_idx').on(t.stateHash)],
);
