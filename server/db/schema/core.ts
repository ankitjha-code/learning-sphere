import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  index,
  uniqueIndex,
  customType,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType() {
    return 'bytea';
  },
  fromDriver(v) {
    return Buffer.isBuffer(v) ? v : Buffer.from(v);
  },
});

const id = () => uuid().primaryKey().defaultRandom();
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
export const cols = { id, createdAt, updatedAt };

// ---------- Organizations & identity ----------

export const organizations = pgTable(
  'organizations',
  {
    id: id(),
    name: text().notNull(),
    slug: text().notNull(),
    kind: text().notNull(), // college | company | training | community
    description: text(),
    website: text(),
    branding: jsonb().$type<{ accent?: string; logoFileId?: string }>().notNull().default({}),
    settings: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    planId: text().notNull().default('free'),
    isSample: boolean().notNull().default(false),
    status: text().notNull().default('active'), // active | suspended
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('organizations_slug_uq').on(t.slug)],
);

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text().notNull(),
    name: text().notNull(),
    passwordHash: text(),
    platformRole: text(), // platform_admin | support | null
    status: text().notNull().default('active'), // active | suspended | pending_deletion | deleted
    emailVerifiedAt: timestamp({ withTimezone: true }),
    avatarColor: text(),
    timezone: text().notNull().default('UTC'),
    locale: text().notNull().default('en'),
    preferences: jsonb()
      .$type<{
        theme?: 'light' | 'dark' | 'system';
        reducedMotion?: boolean;
        notifications?: Record<string, { inApp: boolean; email: boolean }>;
        publicProfile?: boolean;
        showOnLeaderboard?: boolean;
        studyReminders?: boolean;
        restDays?: number[];
      }>()
      .notNull()
      .default({}),
    isSample: boolean().notNull().default(false),
    lastActiveAt: timestamp({ withTimezone: true }),
    deletionRequestedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('users_email_uq').on(sql`lower(${t.email})`)],
);

export const memberships = pgTable(
  'memberships',
  {
    id: id(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roles: text().array().notNull().default(sql`'{}'::text[]`),
    status: text().notNull().default('active'), // active | invited | suspended
    title: text(),
    invitedBy: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('memberships_org_user_uq').on(t.orgId, t.userId), index('memberships_user_idx').on(t.userId)],
);

export const orgInvites = pgTable('org_invites', {
  id: id(),
  orgId: uuid()
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  email: text().notNull(),
  roles: text().array().notNull(),
  tokenHash: text().notNull(),
  invitedBy: uuid().notNull(),
  acceptedAt: timestamp({ withTimezone: true }),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: text().primaryKey(), // sha256(token)
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activeOrgId: uuid(),
    activeWorkspace: text().notNull().default('learner'),
    userAgent: text(),
    ip: text(),
    createdAt: createdAt(),
    lastSeenAt: createdAt(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const passwordResets = pgTable('password_resets', {
  id: id(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text().notNull(),
  createdBy: text().notNull().default('self'), // self | admin
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  usedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
});

// ---------- Audit, notifications, jobs ----------

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    orgId: uuid(),
    actorId: uuid(),
    actorRole: text(),
    action: text().notNull(),
    targetType: text(),
    targetId: text(),
    meta: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    ip: text(),
    requestId: text(),
    createdAt: createdAt(),
  },
  (t) => [index('audit_org_idx').on(t.orgId, t.createdAt), index('audit_actor_idx').on(t.actorId)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orgId: uuid(),
    type: text().notNull(), // e.g. assignment.due, application.status, ai.quota
    category: text().notNull().default('general'),
    title: text().notNull(),
    body: text(),
    link: text(),
    readAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
);

export const notificationDeliveries = pgTable('notification_deliveries', {
  id: id(),
  notificationId: uuid()
    .notNull()
    .references(() => notifications.id, { onDelete: 'cascade' }),
  channel: text().notNull(), // email
  status: text().notNull(), // queued | accepted | captured_locally | failed | not_configured | skipped
  provider: text(),
  providerMessageId: text(),
  attempts: integer().notNull().default(0),
  lastError: text(),
  updatedAt: updatedAt(),
  createdAt: createdAt(),
});

export const backgroundJobs = pgTable(
  'background_jobs',
  {
    id: id(),
    type: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    status: text().notNull().default('queued'), // queued | running | retrying | succeeded | failed | cancelled
    attempts: integer().notNull().default(0),
    maxAttempts: integer().notNull().default(3),
    runAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp({ withTimezone: true }),
    lastError: text(),
    result: jsonb().$type<Record<string, unknown>>(),
    idempotencyKey: text(),
    orgId: uuid(),
    createdBy: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('jobs_idem_uq').on(t.idempotencyKey),
    index('jobs_status_idx').on(t.status, t.runAt),
  ],
);

// ---------- Files (stored in Postgres by default: portable and backed up with the DB) ----------

export const files = pgTable(
  'files',
  {
    id: id(),
    ownerId: uuid().references(() => users.id, { onDelete: 'set null' }),
    orgId: uuid(),
    purpose: text().notNull(), // submission | resume | avatar | knowledge | export | project
    filename: text().notNull(),
    mime: text().notNull(),
    size: integer().notNull(),
    sha256: text().notNull(),
    data: bytea(),
    status: text().notNull().default('ready'), // ready | quarantined | deleted
    expiresAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('files_owner_idx').on(t.ownerId)],
);

// ---------- Platform settings, plans, quotas ----------

export const systemSettings = pgTable('system_settings', {
  key: text().primaryKey(),
  value: jsonb().$type<unknown>().notNull(),
  updatedBy: uuid(),
  updatedAt: updatedAt(),
});

export const usageCounters = pgTable(
  'usage_counters',
  {
    id: id(),
    scope: text().notNull(), // user | org
    scopeId: uuid().notNull(),
    metric: text().notNull(), // ai.requests | ai.tokens | exec.runs | storage.bytes
    period: text().notNull(), // 2026-10-22 (day) or 2026-10 (month)
    value: integer().notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('usage_uq').on(t.scope, t.scopeId, t.metric, t.period)],
);

export const dataRequests = pgTable('data_requests', {
  id: id(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: text().notNull(), // export | deletion
  status: text().notNull().default('pending'), // pending | processing | ready | completed | cancelled | failed
  fileId: uuid(),
  scheduledFor: timestamp({ withTimezone: true }),
  completedAt: timestamp({ withTimezone: true }),
  summary: jsonb().$type<Record<string, unknown>>(),
  createdAt: createdAt(),
});

export const reports = pgTable(
  'reports',
  {
    id: id(),
    orgId: uuid(),
    reporterId: uuid().notNull(),
    targetType: text().notNull(), // post | thread | user | resource | ai_message | job_posting
    targetId: text().notNull(),
    reason: text().notNull(), // spam | abuse | incorrect | copyright | other
    details: text(),
    status: text().notNull().default('open'), // open | actioned | dismissed
    resolvedBy: uuid(),
    resolution: text(),
    createdAt: createdAt(),
    resolvedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('reports_status_idx').on(t.status)],
);

export const incidents = pgTable('incidents', {
  id: id(),
  title: text().notNull(),
  severity: text().notNull(), // low | medium | high | critical
  status: text().notNull().default('open'), // open | monitoring | resolved
  summary: text(),
  timeline: jsonb().$type<{ at: string; note: string; by?: string }[]>().notNull().default([]),
  createdBy: uuid(),
  createdAt: createdAt(),
  resolvedAt: timestamp({ withTimezone: true }),
});

export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerId: uuid().notNull(),
    blockedId: uuid().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('user_blocks_uq').on(t.blockerId, t.blockedId)],
);

export const tasks = pgTable(
  'workspace_tasks',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    notes: text(),
    dueAt: timestamp({ withTimezone: true }),
    status: text().notNull().default('todo'), // todo | done
    priority: text().notNull().default('normal'),
    linkType: text(),
    linkId: text(),
    linkLabel: text(),
    createdAt: createdAt(),
    completedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('tasks_user_idx').on(t.userId, t.status)],
);

export const notes = pgTable(
  'notes',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    body: text().notNull().default(''),
    tags: text().array().notNull().default(sql`'{}'::text[]`),
    linkType: text(), // topic | resource | project | problem
    linkId: text(),
    linkLabel: text(),
    pinned: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('notes_user_idx').on(t.userId, t.updatedAt)],
);

export const savedLinks = pgTable('saved_links', {
  id: id(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text().notNull(),
  url: text().notNull(),
  note: text(),
  createdAt: createdAt(),
});

export const activityEvents = pgTable(
  'activity_events',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orgId: uuid(),
    kind: text().notNull(), // lesson.completed | attempt.submitted | submission.passed | project.milestone ...
    label: text().notNull(),
    link: text(),
    xp: integer().notNull().default(0),
    minutes: integer().notNull().default(0),
    skillIds: uuid().array(),
    dedupeKey: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index('activity_user_idx').on(t.userId, t.createdAt),
    uniqueIndex('activity_dedupe_uq').on(t.userId, t.dedupeKey),
  ],
);
