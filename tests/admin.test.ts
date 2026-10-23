import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { setupTestApp, client, registerUser } from './helpers';
import { db } from '../server/db/client';
import { users, organizations, memberships, auditLogs, passwordResets, notifications, reports, resources, sessions, files, backgroundJobs } from '../server/db/schema';
import { drainJobs } from '../server/jobs/queue';
import { isSignupOpen, FEATURE_KEYS } from '../server/modules/admin/settings';
import { getEntitlements, checkLimit } from '../server/modules/admin/plans';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
type C = Awaited<ReturnType<typeof registerUser>>;
let admin: C;
let support: C;
let orgAdmin: C;
let plain: C;
let orgA: string;
let orgB: string;

async function makeOrg(name: string, slug: string, kind = 'college') {
  const [o] = await db.insert(organizations).values({ name, slug, kind }).returning();
  return o.id;
}

beforeAll(async () => {
  ctx = await setupTestApp();
  admin = await registerUser(ctx.app, 'Ada Admin', 'ada@example.test');
  support = await registerUser(ctx.app, 'Sam Support', 'sam@example.test');
  orgAdmin = await registerUser(ctx.app, 'Olu Orgadmin', 'olu@example.test');
  plain = await registerUser(ctx.app, 'Pat Plain', 'pat@example.test');
  await db.update(users).set({ platformRole: 'platform_admin' }).where(eq(users.id, admin.userId));
  await db.update(users).set({ platformRole: 'support' }).where(eq(users.id, support.userId));
  orgA = await makeOrg('Alpha College', 'alpha-college');
  orgB = await makeOrg('Beta College', 'beta-college');
  await db.insert(memberships).values({ orgId: orgA, userId: orgAdmin.userId, roles: ['org_admin'] });
  await db.insert(memberships).values({ orgId: orgA, userId: plain.userId, roles: ['student'] });
  expect((await orgAdmin.post('/api/auth/switch', { orgId: orgA })).status).toBe(200);
  expect((await plain.post('/api/auth/switch', { orgId: orgA })).status).toBe(200);
});
afterAll(async () => ctx.close());

describe('admin authorization', () => {
  it('rejects anonymous callers with 401 and non-admins (including org admins) with 403', async () => {
    const anon = client(ctx.app);
    expect((await anon.get('/api/admin/overview')).status).toBe(401);
    for (const c of [plain, orgAdmin]) {
      for (const p of ['/api/admin/overview', '/api/admin/users', '/api/admin/orgs', '/api/admin/jobs', '/api/admin/audit', '/api/admin/health', '/api/admin/settings', '/api/admin/features', '/api/admin/plans', '/api/admin/reports', '/api/admin/incidents', '/api/admin/exports/users.csv']) {
        expect((await c.get(p)).status, `${p}`).toBe(403);
      }
      expect((await c.post(`/api/admin/users/${plain.userId}/suspend`, { reason: 'test' })).status).toBe(403);
      expect((await c.post('/api/admin/orgs', { name: 'X Org', slug: 'x-org', kind: 'company' })).status).toBe(403);
      expect((await c.put('/api/admin/features', { flags: { ai: false } })).status).toBe(403);
    }
  });

  it('gives support staff read-only access to users, jobs, health and audit', async () => {
    for (const p of ['/api/admin/users', `/api/admin/users/${plain.userId}`, '/api/admin/jobs', '/api/admin/health', '/api/admin/audit', '/api/admin/overview']) {
      expect((await support.get(p)).status, p).toBe(200);
    }
    const detail = await support.get(`/api/admin/users/${plain.userId}`);
    expect(detail.body.can.suspend).toBe(false);
    expect(detail.body.reasons.readOnly).toMatch(/read-only/);
    expect((await support.post(`/api/admin/users/${plain.userId}/suspend`, { reason: 'nope' })).status).toBe(403);
    expect((await support.patch(`/api/admin/users/${plain.userId}/platform-role`, { platformRole: 'support' })).status).toBe(403);
    expect((await support.post(`/api/admin/users/${plain.userId}/reset-link`)).status).toBe(403);
    expect((await support.get('/api/admin/orgs')).status).toBe(403);
    expect((await support.get('/api/admin/settings')).status).toBe(403);
    expect((await support.post('/api/admin/jobs/recover-stale', {})).status).toBe(403);
  });
});

describe('users', () => {
  it('searches and filters users', async () => {
    const r = await admin.get('/api/admin/users?q=pat');
    expect(r.status).toBe(200);
    expect(r.body.items.map((u: { email: string }) => u.email)).toEqual(['pat@example.test']);
    const byRole = await admin.get('/api/admin/users?role=support');
    expect(byRole.body.items.map((u: { email: string }) => u.email)).toEqual(['sam@example.test']);
    const byOrg = await admin.get(`/api/admin/users?orgId=${orgA}`);
    expect(byOrg.body.total).toBe(2);
    expect(byOrg.body.items.every((u: { orgCount: number }) => u.orgCount === 1)).toBe(true);
    expect((await admin.get('/api/admin/users?role=wizard')).status).toBe(400);
  });

  it('suspending a user revokes sessions and blocks sign-in; unsuspending restores it', async () => {
    const victim = await registerUser(ctx.app, 'Vic Tim', 'vic@example.test');
    expect((await victim.get('/api/auth/me')).body.user.email).toBe('vic@example.test');
    expect((await admin.post(`/api/admin/users/${victim.userId}/suspend`, {})).status).toBe(400); // reason required
    const s = await admin.post(`/api/admin/users/${victim.userId}/suspend`, { reason: 'Spam account' });
    expect(s.status).toBe(200);
    expect(s.body.sessionsRevoked).toBe(1);
    expect((await victim.get('/api/auth/me')).body.user).toBeNull();
    const login = await client(ctx.app).post('/api/auth/login', { email: 'vic@example.test', password: 'correct-horse-42' });
    expect(login.status).toBe(403);
    const [entry] = await db.select().from(auditLogs).where(and(eq(auditLogs.action, 'admin.user_suspended'), eq(auditLogs.targetId, victim.userId)));
    expect(entry.actorId).toBe(admin.userId);
    expect(entry.meta.reason).toBe('Spam account');
    expect((await admin.post(`/api/admin/users/${victim.userId}/unsuspend`)).status).toBe(200);
    const again = await client(ctx.app).post('/api/auth/login', { email: 'vic@example.test', password: 'correct-horse-42' });
    expect(again.status).toBe(200);
  });

  it('revokes all sessions of a user', async () => {
    const u = await registerUser(ctx.app, 'Ses Sion', 'session@example.test');
    const r = await admin.post(`/api/admin/users/${u.userId}/revoke-sessions`);
    expect(r.body.revoked).toBe(1);
    expect((await u.get('/api/auth/me')).body.user).toBeNull();
  });

  it('protects the last platform admin and an admin\'s own account', async () => {
    expect((await admin.patch(`/api/admin/users/${admin.userId}/platform-role`, { platformRole: null })).status).toBe(409);
    expect((await admin.post(`/api/admin/users/${admin.userId}/suspend`, { reason: 'oops' })).status).toBe(409);
    expect((await admin.post(`/api/admin/users/${admin.userId}/revoke-sessions`)).status).toBe(409);
    const [{ role }] = await db.select({ role: users.platformRole }).from(users).where(eq(users.id, admin.userId));
    expect(role).toBe('platform_admin');

    // A second admin can be granted and removed; the remaining admin keeps the role.
    const second = await registerUser(ctx.app, 'Bea Second', 'bea@example.test');
    expect((await admin.patch(`/api/admin/users/${second.userId}/platform-role`, { platformRole: 'platform_admin' })).status).toBe(200);
    expect((await second.get('/api/admin/settings')).status).toBe(200);
    expect((await second.patch(`/api/admin/users/${admin.userId}/platform-role`, { platformRole: 'support' })).status).toBe(200);
    // Now `second` is the only active platform admin and cannot demote themself.
    expect((await second.patch(`/api/admin/users/${second.userId}/platform-role`, { platformRole: null })).status).toBe(409);
    expect((await second.patch(`/api/admin/users/${admin.userId}/platform-role`, { platformRole: 'platform_admin' })).status).toBe(200);
  });

  it('creates a single-use, one-hour admin reset link and notifies the user', async () => {
    const u = await registerUser(ctx.app, 'Rita Reset', 'rita@example.test');
    const r = await admin.post(`/api/admin/users/${u.userId}/reset-link`);
    expect(r.status).toBe(200);
    const token = new URL(r.body.link).searchParams.get('token')!;
    expect(token.length).toBeGreaterThan(20);
    expect(new Date(r.body.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(3600_000);
    const [row] = await db.select().from(passwordResets).where(eq(passwordResets.userId, u.userId));
    expect(row.createdBy).toBe('admin');
    expect(row.tokenHash).not.toContain(token);
    const [log] = await db.select().from(auditLogs).where(and(eq(auditLogs.action, 'admin.password_reset_link_created'), eq(auditLogs.targetId, u.userId)));
    expect(JSON.stringify(log.meta)).not.toContain(token);
    const notes = await db.select().from(notifications).where(eq(notifications.userId, u.userId));
    expect(notes.some((n) => n.type === 'security.admin_reset_link')).toBe(true);

    const anon = client(ctx.app);
    expect((await anon.post('/api/auth/password-reset/confirm', { token, password: 'brand-new-pass-9' })).status).toBe(200);
    expect((await anon.post('/api/auth/password-reset/confirm', { token, password: 'another-pass-99' })).status).toBe(400);
    expect((await client(ctx.app).post('/api/auth/login', { email: 'rita@example.test', password: 'brand-new-pass-9' })).status).toBe(200);
  });

  it('reset links expire and a new link invalidates the previous one', async () => {
    const u = await registerUser(ctx.app, 'Exp Ired', 'expired@example.test');
    const first = new URL((await admin.post(`/api/admin/users/${u.userId}/reset-link`)).body.link).searchParams.get('token')!;
    const second = new URL((await admin.post(`/api/admin/users/${u.userId}/reset-link`)).body.link).searchParams.get('token')!;
    const anon = client(ctx.app);
    expect((await anon.post('/api/auth/password-reset/confirm', { token: first, password: 'brand-new-pass-9' })).status).toBe(400);
    await db.update(passwordResets).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(passwordResets.userId, u.userId));
    expect((await anon.post('/api/auth/password-reset/confirm', { token: second, password: 'brand-new-pass-9' })).status).toBe(400);
  });

  it('reports admin-assisted export honestly when the privacy job is not available', async () => {
    const r = await admin.post(`/api/admin/users/${plain.userId}/export`);
    // Either the privacy module registered its export job (201) or the server says it is unavailable (503).
    expect([201, 503]).toContain(r.status);
    const list = await admin.get('/api/admin/data-requests');
    expect(list.status).toBe(200);
  });
});

describe('organizations, plans and policies', () => {
  it('creates an organization with an existing first admin or an invite link', async () => {
    const a = await admin.post('/api/admin/orgs', { name: 'Gamma Labs', slug: 'gamma-labs', kind: 'company', planId: 'company', adminEmail: 'pat@example.test' });
    expect(a.status).toBe(201);
    expect(a.body.firstAdmin.status).toBe('added');
    const [m] = await db.select().from(memberships).where(and(eq(memberships.orgId, a.body.org.id), eq(memberships.userId, plain.userId)));
    expect(m.roles).toEqual(['org_admin']);
    const b = await admin.post('/api/admin/orgs', { name: 'Delta School', slug: 'delta-school', kind: 'training', adminEmail: 'newperson@example.test' });
    expect(b.body.firstAdmin.status).toBe('invited');
    expect(b.body.firstAdmin.inviteLink).toMatch(/\/invite\//);
    const dup = await admin.post('/api/admin/orgs', { name: 'Gamma Again', slug: 'gamma-labs', kind: 'company' });
    expect(dup.status).toBe(409);
    expect((await admin.post('/api/admin/orgs', { name: 'Bad', slug: 'Bad Slug!', kind: 'company' })).status).toBe(400);
  });

  it('suspending an organization stops its memberships granting access', async () => {
    const me1 = await orgAdmin.get('/api/auth/me');
    expect(me1.body.memberships.map((m: { orgId: string }) => m.orgId)).toContain(orgA);
    expect((await admin.post(`/api/admin/orgs/${orgA}/suspend`, { reason: 'Contract review' })).status).toBe(200);
    const me2 = await orgAdmin.get('/api/auth/me');
    expect(me2.body.memberships.map((m: { orgId: string }) => m.orgId)).not.toContain(orgA);
    expect((await orgAdmin.get('/api/org/current')).status).toBe(403);
    expect((await admin.post(`/api/admin/orgs/${orgA}/reactivate`)).status).toBe(200);
    expect((await orgAdmin.get('/api/org/current')).status).toBe(200);
  });

  it('changes plans in demonstration mode and validates policies', async () => {
    const r = await admin.put(`/api/admin/orgs/${orgB}/plan`, { planId: 'campus' });
    expect(r.status).toBe(200);
    expect(r.body.notice).toMatch(/Demonstration mode: no payments are processed/);
    expect((await admin.put(`/api/admin/orgs/${orgB}/plan`, { planId: 'enterprise' })).status).toBe(400);
    const detail = await admin.get(`/api/admin/orgs/${orgB}`);
    expect(detail.body.plan.id).toBe('campus');
    expect(detail.body.policies.allowStudentDirectory).toBe(false);
    expect(detail.body.usage.find((u: { metric: string }) => u.metric === 'org.members')).toBeTruthy();
    expect((await admin.put(`/api/admin/orgs/${orgB}/policies`, { maxUploadMb: 50 })).status).toBe(400);
    const p = await admin.put(`/api/admin/orgs/${orgB}/policies`, { aiMonthlyRequestLimit: 500, allowStudentDirectory: true });
    expect(p.status).toBe(200);
    expect(p.body.policies).toMatchObject({ aiMonthlyRequestLimit: 500, allowStudentDirectory: true, maxUploadMb: 10 });
    const ent = await getEntitlements(orgB, admin.userId);
    expect(ent.plan.id).toBe('campus');
    expect(ent.limits.orgAiMonthlyRequestLimit).toBe(500);
    const lim = await checkLimit('org', orgB, 'org.members');
    expect(lim.allowed).toBe(true);
    expect(lim.limit).toBe(5000);
    const plans = await admin.get('/api/admin/plans');
    expect(plans.body.mode).toBe('demonstration');
    expect(JSON.stringify(plans.body)).not.toMatch(/invoice|card|payment_method/i);
    const edit = await admin.put('/api/admin/plans/free', { limits: { aiRequestsPerUserPerDay: 10 } });
    expect(edit.status).toBe(200);
    expect(edit.body.plan.limits.aiRequestsPerUserPerDay).toBe(10);
    expect((await admin.put('/api/admin/plans/free', { limits: { aiRequestsPerUserPerDay: -1 } })).status).toBe(400);
    const mine = await plain.get('/api/admin/my-plan');
    expect(mine.status).toBe(200);
    expect(mine.body.entitlements.notice).toMatch(/Demonstration mode/);
  });
});

describe('feature flags', () => {
  it('public endpoint exposes only flag booleans and reflects admin changes', async () => {
    const pub = await plain.get('/api/admin/features/public');
    expect(pub.status).toBe(200);
    expect(Object.keys(pub.body)).toEqual(['features']);
    expect(Object.keys(pub.body.features).sort()).toEqual([...FEATURE_KEYS].sort());
    expect(Object.values(pub.body.features).every((v) => typeof v === 'boolean')).toBe(true);
    expect((await client(ctx.app).get('/api/admin/features/public')).status).toBe(401);
    expect((await admin.put('/api/admin/features', { flags: { community: false } })).status).toBe(200);
    expect((await plain.get('/api/admin/features/public')).body.features.community).toBe(false);
    expect((await admin.put('/api/admin/features', { flags: { telepathy: true } })).status).toBe(400);
    await admin.put('/api/admin/features', { flags: { community: true } });
  });
});

describe('incidents and status banner', () => {
  it('shows only title and status of unresolved high/critical incidents to signed-in users', async () => {
    const low = await admin.post('/api/admin/incidents', { title: 'Minor slowness', severity: 'low' });
    expect(low.status).toBe(201);
    const high = await admin.post('/api/admin/incidents', { title: 'Grading delayed', severity: 'high', summary: 'Internal detail: worker pool exhausted' });
    expect(high.status).toBe(201);
    const banner = await plain.get('/api/admin/status-banner');
    expect(banner.body.incidents).toEqual([{ title: 'Grading delayed', status: 'open', severity: 'high' }]);
    expect((await plain.post('/api/admin/incidents', { title: 'Nope nope', severity: 'low' })).status).toBe(403);
    const upd = await admin.post(`/api/admin/incidents/${high.body.incident.id}/timeline`, { note: 'Added capacity' });
    expect(upd.body.incident.timeline).toHaveLength(2);
    const resolved = await admin.patch(`/api/admin/incidents/${high.body.incident.id}`, { status: 'resolved' });
    expect(resolved.body.incident.resolvedAt).toBeTruthy();
    expect((await plain.get('/api/admin/status-banner')).body.incidents).toEqual([]);
    const overview = await admin.get('/api/admin/overview');
    expect(overview.body.openIncidents.map((i: { title: string }) => i.title)).toContain('Minor slowness');
    expect(overview.body.metrics.every((m: { definition: string }) => m.definition.length > 10)).toBe(true);
  });
});

describe('moderation', () => {
  it('resolves a report with a quick action and notifies the reporter generically', async () => {
    const [r] = await db.insert(resources).values({ kind: 'article', title: 'Spammy guide', summary: 'Buy now', status: 'published' }).returning();
    const [rep] = await db.insert(reports).values({ reporterId: plain.userId, targetType: 'resource', targetId: r.id, reason: 'spam' }).returning();
    const list = await admin.get('/api/admin/reports?status=open');
    expect(list.body.items.find((x: { id: string }) => x.id === rep.id).targetTitle).toBe('Spammy guide');
    const detail = await admin.get(`/api/admin/reports/${rep.id}`);
    expect(detail.body.quickActions.map((a: { id: string }) => a.id)).toEqual(['unpublish_resource']);
    expect((await admin.post(`/api/admin/reports/${rep.id}/resolve`, { outcome: 'actioned', resolution: 'Removed', quickAction: 'suspend_user' })).status).toBe(400);
    const res = await admin.post(`/api/admin/reports/${rep.id}/resolve`, { outcome: 'actioned', resolution: 'Spam, archived', quickAction: 'unpublish_resource' });
    expect(res.status).toBe(200);
    const [after] = await db.select({ status: resources.status }).from(resources).where(eq(resources.id, r.id));
    expect(after.status).toBe('archived');
    const notes = await db.select().from(notifications).where(and(eq(notifications.userId, plain.userId), eq(notifications.type, 'moderation.report_reviewed')));
    expect(notes[0].body).toMatch(/took action/);
    expect(notes[0].body).not.toMatch(/Spam, archived/);
    expect((await admin.post(`/api/admin/reports/${rep.id}/resolve`, { outcome: 'dismissed', resolution: 'Again' })).status).toBe(409);
  });
});

describe('audit logs', () => {
  it('filters and exports CSV, and the export itself is audited', async () => {
    const list = await admin.get('/api/admin/audit?action=admin.user_suspended');
    expect(list.status).toBe(200);
    expect(list.body.total).toBeGreaterThan(0);
    expect(list.body.items.every((i: { action: string }) => i.action.startsWith('admin.user_suspended'))).toBe(true);
    const csv = await admin.get('/api/admin/audit/export.csv?action=admin.user_suspended');
    expect(csv.status).toBe(200);
    expect(typeof csv.body).toBe('string');
    const lines = (csv.body as string).split('\r\n').filter((l) => l && !l.startsWith('#'));
    expect(lines[0]).toMatch(/^time_utc,action,/);
    expect(lines.slice(1).every((l) => l.includes('admin.user_suspended'))).toBe(true);
    const none = await admin.get(`/api/admin/audit?action=admin.user_suspended&from=${encodeURIComponent(new Date(Date.now() + 86400_000).toISOString())}`);
    expect(none.body.total).toBe(0);
    const [exp] = await db.select().from(auditLogs).where(eq(auditLogs.action, 'admin.audit_exported'));
    expect(exp).toBeTruthy();
    // Wildcards in the prefix are treated literally.
    expect((await admin.get('/api/admin/audit?action=%25')).body.total).toBe(0);
  });

  it('org admins see only their own organization in /org-audit', async () => {
    await admin.patch(`/api/admin/orgs/${orgB}`, { description: 'Beta secret change' });
    await admin.patch(`/api/admin/orgs/${orgA}`, { description: 'Alpha change' });
    const r = await orgAdmin.get('/api/admin/org-audit');
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBeGreaterThan(0);
    expect(r.body.items.every((i: { orgId: string; ip: string | null }) => i.orgId === orgA && i.ip === null)).toBe(true);
    const sneaky = await orgAdmin.get(`/api/admin/org-audit?orgId=${orgB}`);
    expect(sneaky.body.items.every((i: { orgId: string }) => i.orgId === orgA)).toBe(true);
    expect((await plain.get('/api/admin/org-audit')).status).toBe(403); // student in org A
    expect((await admin.get('/api/admin/org-audit')).status).toBe(403); // no active org
  });
});

describe('platform settings and retention', () => {
  it('toggles signup and validates retention', async () => {
    expect(await isSignupOpen()).toBe(true);
    expect((await admin.put('/api/admin/settings', { signupOpen: false })).status).toBe(200);
    expect(await isSignupOpen()).toBe(false);
    await admin.put('/api/admin/settings', { signupOpen: true });
    const bad = await admin.put('/api/admin/settings', { retention: { auditLogRetentionDays: 30 } });
    expect(bad.status).toBe(400);
    const ok = await admin.put('/api/admin/settings', { retention: { auditLogRetentionDays: 120, deletionGraceDays: 10 } });
    expect(ok.body.retention).toMatchObject({ auditLogRetentionDays: 120, deletionGraceDays: 10, exportFileRetentionDays: 7 });
    const s = await admin.get('/api/admin/settings');
    expect(s.body.retention.auditLogRetentionDays).toBe(120);
  });

  it('runs an idempotent retention sweep that keeps recent audit logs', async () => {
    const D = 86400_000;
    await db.insert(auditLogs).values([
      { action: 'test.old', createdAt: new Date(Date.now() - 200 * D) },
      { action: 'test.recent', createdAt: new Date(Date.now() - 100 * D) },
      { action: 'test.fresh', createdAt: new Date(Date.now() - 30 * D) },
    ]);
    await db.insert(sessions).values({ id: 'old-revoked-session', userId: plain.userId, expiresAt: new Date(Date.now() + D), revokedAt: new Date(Date.now() - 40 * D) });
    const [f] = await db
      .insert(files)
      .values({ ownerId: plain.userId, purpose: 'export', filename: 'x.json', mime: 'application/json', size: 10, sha256: 'x', data: Buffer.from('{}'), expiresAt: new Date(Date.now() - 1000) })
      .returning();
    const run = await admin.post('/api/admin/retention/run');
    expect(run.status).toBe(201);
    await drainJobs();
    const [job] = await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, run.body.job.id));
    expect(job.status).toBe('succeeded');
    expect(job.result).toMatchObject({ prunedAuditLogs: 1, prunedSessions: 1, expiredExportFiles: 1, auditRetentionDaysApplied: 120 });
    const actions = (await db.select({ a: auditLogs.action }).from(auditLogs)).map((r) => r.a);
    expect(actions).not.toContain('test.old');
    expect(actions).toContain('test.recent');
    expect(actions).toContain('test.fresh');
    const [ff] = await db.select({ status: files.status }).from(files).where(eq(files.id, f.id));
    expect(ff.status).toBe('deleted');
    // Same minute: the manual run is deduplicated; a second sweep changes nothing.
    expect((await admin.post('/api/admin/retention/run')).body.created).toBe(false);
  });

  it('serves health with honest statuses and CSV reports with definitions', async () => {
    const h = await admin.get('/api/admin/health');
    expect(h.status).toBe(200);
    expect(h.body.database.status).toBe('ok');
    expect(h.body.services.find((s: { key: string }) => s.key === 'email').status).toBe('not_configured');
    expect(h.body.app.version).toBeTruthy();
    const csv = await admin.get('/api/admin/exports/usage.csv');
    expect(csv.status).toBe(200);
    expect(csv.body).toMatch(/# .*members_active_30d/);
    expect(csv.body).toMatch(/Alpha College,campus|Alpha College,free/);
    const orgList = await admin.get('/api/admin/orgs?q=alpha');
    expect(orgList.body.items[0].memberCount).toBe(2);
    expect((await admin.get('/api/admin/exports/users.csv')).body).toMatch(/user_id,name,email/);
  });
});
