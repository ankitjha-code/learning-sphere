import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupTestApp, registerUser } from './helpers';
import { db } from '../server/db/client';
import { organizations, memberships, orgInvites, tracks, resources, auditLogs } from '../server/db/schema';

/**
 * Cross-module tenant isolation. Two organizations with staff and students; everything
 * org-scoped that a user can reach today must stay inside their own organization.
 * Other feature areas add their own isolation tests next to their features.
 */

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
type C = Awaited<ReturnType<typeof registerUser>>;
let adminA: C;
let studentA: C;
let adminB: C;
let studentB: C;
let orgA: string;
let orgB: string;
let membershipB: string;
let inviteB: string;
const SECRET_WORD = 'zephyrquokka';

beforeAll(async () => {
  ctx = await setupTestApp();
  const [a] = await db.insert(organizations).values({ name: 'Alpha Institute', slug: 'alpha-inst', kind: 'college' }).returning();
  const [b] = await db.insert(organizations).values({ name: 'Beta Institute', slug: 'beta-inst', kind: 'college' }).returning();
  orgA = a.id;
  orgB = b.id;
  adminA = await registerUser(ctx.app, 'Alice Alpha', 'alice@alpha.test');
  studentA = await registerUser(ctx.app, 'Sid Alpha', 'sid@alpha.test');
  adminB = await registerUser(ctx.app, 'Bob Beta', 'bob@beta.test');
  studentB = await registerUser(ctx.app, 'Sue Beta', 'sue@beta.test');
  await db.insert(memberships).values([
    { orgId: orgA, userId: adminA.userId, roles: ['org_admin', 'faculty'] },
    { orgId: orgA, userId: studentA.userId, roles: ['student'] },
    { orgId: orgB, userId: adminB.userId, roles: ['org_admin', 'faculty'] },
  ]);
  const [mb] = await db.insert(memberships).values({ orgId: orgB, userId: studentB.userId, roles: ['student'] }).returning();
  membershipB = mb.id;
  const [inv] = await db
    .insert(orgInvites)
    .values({ orgId: orgB, email: 'pending@beta.test', roles: ['student'], tokenHash: 'x'.repeat(64), invitedBy: adminB.userId, expiresAt: new Date(Date.now() + 86400_000) })
    .returning();
  inviteB = inv.id;
  for (const [c, o] of [
    [adminA, orgA],
    [studentA, orgA],
    [adminB, orgB],
    [studentB, orgB],
  ] as const) {
    expect((await c.post('/api/auth/switch', { orgId: o })).status).toBe(200);
  }
  await db.insert(tracks).values([
    { slug: 'alpha-private-track', title: `Alpha ${SECRET_WORD} path`, category: 'backend', summary: 'Only for Alpha', orgId: orgA },
    { slug: 'beta-private-track', title: `Beta ${SECRET_WORD} path`, category: 'backend', summary: 'Only for Beta', orgId: orgB },
  ]);
  await db.insert(resources).values([
    { kind: 'article', title: `Alpha ${SECRET_WORD} handbook`, summary: 'Alpha only', orgId: orgA },
    { kind: 'article', title: `Beta ${SECRET_WORD} handbook`, summary: 'Beta only', orgId: orgB },
  ]);
  await db.insert(auditLogs).values([
    { orgId: orgA, actorId: adminA.userId, action: 'org.updated', targetType: 'organization', targetId: orgA },
    { orgId: orgB, actorId: adminB.userId, action: 'org.updated', targetType: 'organization', targetId: orgB, meta: { secret: 'beta-only' } },
  ]);
});
afterAll(async () => ctx.close());

describe('organization endpoints stay inside the caller\'s organization', () => {
  it('cannot switch into an organization without a membership', async () => {
    expect((await adminA.post('/api/auth/switch', { orgId: orgB })).status).toBe(403);
    const cur = await adminA.get('/api/org/current');
    expect(cur.body.org.id).toBe(orgA);
  });

  it('lists only own members and invitations', async () => {
    const r = await adminA.get('/api/org/members');
    expect(r.status).toBe(200);
    const emails = r.body.members.map((m: { email: string }) => m.email);
    expect(emails.sort()).toEqual(['alice@alpha.test', 'sid@alpha.test']);
    expect(JSON.stringify(r.body)).not.toContain('beta.test');
    const people = await adminA.get('/api/org/people');
    expect(JSON.stringify(people.body)).not.toContain('beta.test');
  });

  it('cannot change, remove or revoke records of another organization (404, not leaked)', async () => {
    expect((await adminA.patch(`/api/org/members/${membershipB}`, { roles: ['faculty'] })).status).toBe(404);
    expect((await adminA.del(`/api/org/members/${membershipB}`)).status).toBe(404);
    expect((await adminA.del(`/api/org/invites/${inviteB}`)).status).toBe(404);
    const [still] = await db.select().from(memberships).where(eq(memberships.id, membershipB));
    expect(still.roles).toEqual(['student']);
  });

  it('students cannot browse the member directory or manage the org', async () => {
    expect((await studentA.get('/api/org/members')).status).toBe(403);
    expect((await studentA.patch('/api/org/current', { name: 'Hijacked' })).status).toBe(403);
    expect((await studentA.post('/api/org/invites', { emails: ['x@alpha.test'], roles: ['faculty'] })).status).toBe(403);
  });
});

describe('admin endpoints', () => {
  it('org admins cannot use platform admin endpoints', async () => {
    for (const p of ['/api/admin/orgs', `/api/admin/orgs/${orgB}`, '/api/admin/users', '/api/admin/audit', '/api/admin/jobs']) {
      expect((await adminA.get(p)).status, p).toBe(403);
    }
    expect((await adminA.put(`/api/admin/orgs/${orgB}/plan`, { planId: 'company' })).status).toBe(403);
  });

  it('org audit shows only the caller\'s organization, even when asked for another', async () => {
    const r = await adminA.get(`/api/admin/org-audit?orgId=${orgB}`);
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBeGreaterThan(0);
    expect(r.body.items.every((i: { orgId: string }) => i.orgId === orgA)).toBe(true);
    expect(JSON.stringify(r.body)).not.toContain('beta-only');
    expect((await adminA.get('/api/admin/org-audit/export.csv')).status).toBe(403); // Free plan has no audit export
  });
});

describe('learning content and search visibility', () => {
  it('org-private tracks are visible only to members of that organization', async () => {
    const a = await studentA.get('/api/learning/tracks');
    const slugsA = a.body.tracks.map((t: { slug: string }) => t.slug);
    expect(slugsA).toContain('alpha-private-track');
    expect(slugsA).not.toContain('beta-private-track');
    expect((await studentA.get('/api/learning/tracks/beta-private-track')).status).toBe(404);
    const b = await studentB.get('/api/learning/tracks');
    expect(b.body.tracks.map((t: { slug: string }) => t.slug)).not.toContain('alpha-private-track');
  });

  it('search never returns another organization\'s tracks or resources', async () => {
    const r = await studentA.get(`/api/search?q=${SECRET_WORD}`);
    expect(r.status).toBe(200);
    const titles = r.body.results.map((h: { title: string }) => h.title);
    expect(titles.some((t: string) => t.startsWith('Alpha'))).toBe(true);
    expect(titles.some((t: string) => t.startsWith('Beta'))).toBe(false);
    const rb = await studentB.get(`/api/search?q=${SECRET_WORD}`);
    expect(rb.body.results.map((h: { title: string }) => h.title).some((t: string) => t.startsWith('Alpha'))).toBe(false);
  });

  it('users without any organization see neither organization\'s private content', async () => {
    const loner = await registerUser(ctx.app, 'Lone Learner', 'lone@example.test');
    const t = await loner.get('/api/learning/tracks');
    const slugs = t.body.tracks.map((x: { slug: string }) => x.slug);
    expect(slugs).not.toContain('alpha-private-track');
    expect(slugs).not.toContain('beta-private-track');
    const s = await loner.get(`/api/search?q=${SECRET_WORD}`);
    expect(s.body.results).toEqual([]);
    expect((await loner.get('/api/org/current')).status).toBe(403);
  });
});
