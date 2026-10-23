import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, gte, inArray, isNull, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  users,
  communitySpaces,
  spaceMembers,
  threads,
  posts,
  votes,
  studyGroups,
  reports,
  userBlocks,
  projects,
  threadMeta,
  threadSignups,
  threadInvites,
  communityPrefs,
} from '../../db/schema';
import { type AppEnv, type AuthContext, requireAuth, isPlatformAdmin, rolesIn } from '../../lib/context';
import { body, query, idParam, pageQuery } from '../../lib/validate';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { recordActivity, XP } from '../../lib/activity';
import { rateLimit } from '../../lib/ratelimit';
import { evaluateAchievements } from '../motivation/service';
import {
  GUIDELINES,
  EDIT_WINDOW_MS,
  blockedIds,
  hasBlocked,
  orgIds,
  canSeeSpace,
  membership,
  isModerator,
  canReadContent,
  loadSpaceBySlug,
  loadReadableThread,
  reputationFor,
  prefsFor,
  isMentorUser,
  countLinks,
  normalizeBody,
  mentionedAmong,
  type Space,
} from './service';
import { ref } from '../../lib/sql';

/** Mounted at /api/community. */
export const communityRoutes = new Hono<AppEnv>();

const authorCols = { id: users.id, name: users.name, avatarColor: users.avatarColor, isSample: users.isSample };

// ---------- Anti-spam ----------

async function antiSpam(auth: AuthContext, kind: 'thread' | 'post', text: string, title?: string) {
  const uid = auth.user.id;
  if (kind === 'thread') rateLimit(`community:thread:${uid}`, 5, 10 * 60_000);
  else rateLimit(`community:post:${uid}`, 20, 10 * 60_000);
  await linkLimit(uid, title ? `${title}\n${text}` : text);
  const norm = normalizeBody(text);
  const since = new Date(Date.now() - 10 * 60_000);
  const normSql = (col: SQL) => sql`lower(regexp_replace(trim(${col}), '\\s+', ' ', 'g')) = ${norm}`;
  const [dupPost] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.authorId, uid), gte(posts.createdAt, since), normSql(sql`${posts.body}`)))
    .limit(1);
  const [dupThread] = dupPost
    ? [dupPost]
    : await db
        .select({ id: threads.id })
        .from(threads)
        .where(and(eq(threads.authorId, uid), gte(threads.createdAt, since), normSql(sql`${threads.body}`)))
        .limit(1);
  if (dupPost || dupThread) throw conflict('You posted the same text a few minutes ago. Edit your earlier post instead of posting it again.');
}

async function linkLimit(uid: string, text: string) {
  const [u] = await db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, uid));
  const young = u && Date.now() - new Date(u.createdAt).getTime() < 3 * 86400_000;
  if (young && countLinks(text) > 2) throw badRequest('New accounts can include up to 2 links per post during their first 3 days.', { fields: { body: 'Use at most 2 links.' } });
}

function canEditWithin(createdAt: Date | string) {
  return Date.now() - new Date(createdAt).getTime() <= EDIT_WINDOW_MS;
}

// ---------- Guidelines & preferences ----------

communityRoutes.get('/guidelines', (c) => c.json({ guidelines: GUIDELINES }));

communityRoutes.get('/preferences', async (c) => {
  const auth = requireAuth(c);
  return c.json({ preferences: await prefsFor(auth.user.id) });
});

communityRoutes.patch('/preferences', async (c) => {
  const auth = requireAuth(c);
  const input = await body(
    c,
    z.object({ notifyReplies: z.boolean().optional(), notifyMentions: z.boolean().optional(), showReputation: z.boolean().optional(), allowMentorInvites: z.boolean().optional() }),
  );
  const current = await prefsFor(auth.user.id);
  const next = {
    notifyReplies: input.notifyReplies ?? current.notifyReplies,
    notifyMentions: input.notifyMentions ?? current.notifyMentions,
    showReputation: input.showReputation ?? current.showReputation,
    allowMentorInvites: input.allowMentorInvites ?? current.allowMentorInvites,
    updatedAt: new Date(),
  };
  const [row] = await db.insert(communityPrefs).values({ userId: auth.user.id, ...next }).onConflictDoUpdate({ target: communityPrefs.userId, set: next }).returning();
  return c.json({ preferences: row });
});

// ---------- Overview ----------

async function moderatedSpaceIds(auth: AuthContext) {
  if (isPlatformAdmin(auth)) return 'all' as const;
  const own = await db.select({ id: spaceMembers.spaceId }).from(spaceMembers).where(and(eq(spaceMembers.userId, auth.user.id), eq(spaceMembers.role, 'moderator')));
  const adminOrgs = auth.memberships.filter((m) => m.roles.includes('org_admin')).map((m) => m.orgId);
  const orgSpaces = adminOrgs.length ? await db.select({ id: communitySpaces.id }).from(communitySpaces).where(inArray(communitySpaces.orgId, adminOrgs)) : [];
  return [...new Set([...own, ...orgSpaces].map((r) => r.id))];
}

communityRoutes.get('/overview', async (c) => {
  const auth = requireAuth(c);
  const [rep, mods, prefs] = await Promise.all([reputationFor([auth.user.id]), moderatedSpaceIds(auth), prefsFor(auth.user.id)]);
  return c.json({
    reputation: rep.get(auth.user.id) ?? { reputation: 0, accepted: 0 },
    canModerate: mods === 'all' || mods.length > 0,
    preferences: prefs,
  });
});

communityRoutes.get('/people/:userId', async (c) => {
  const auth = requireAuth(c);
  const userId = idParam(c, 'userId');
  const [u] = await db.select(authorCols).from(users).where(and(eq(users.id, userId), eq(users.status, 'active')));
  if (!u) throw notFound('Person');
  const prefs = await prefsFor(userId);
  const rep = (await reputationFor([userId])).get(userId)!;
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(threads)
    .innerJoin(communitySpaces, eq(communitySpaces.id, threads.spaceId))
    .where(and(eq(threads.authorId, userId), eq(threads.isPrivate, false), ne(threads.status, 'hidden'), isNull(communitySpaces.orgId)));
  const self = userId === auth.user.id;
  return c.json({
    person: { ...u, reputation: prefs.showReputation || self ? rep.reputation : null, acceptedAnswers: prefs.showReputation || self ? rep.accepted : null, publicThreads: n },
    blockedByMe: await hasBlocked(auth.user.id, userId),
  });
});

// ---------- Spaces ----------

communityRoutes.get('/spaces', async (c) => {
  const auth = requireAuth(c);
  const spaceIdCol = sql.raw('"community_spaces"."id"');
  const ids = orgIds(auth);
  const visible = isPlatformAdmin(auth) ? undefined : ids.length ? or(isNull(communitySpaces.orgId), inArray(communitySpaces.orgId, ids)) : isNull(communitySpaces.orgId);
  const rows = await db
    .select({
      s: communitySpaces,
      memberCount: sql<number>`(select count(*)::int from ${spaceMembers} sm where sm.space_id = ${spaceIdCol})`,
      threadCount: sql<number>`(select count(*)::int from ${threads} t where t.space_id = ${spaceIdCol} and t.is_private = false and t.status <> 'hidden')`,
      myRole: sql<string | null>`(select sm.role from ${spaceMembers} sm where sm.space_id = ${spaceIdCol} and sm.user_id = ${auth.user.id})`,
    })
    .from(communitySpaces)
    .where(visible)
    .orderBy(asc(communitySpaces.name));
  const orgNames = new Map(auth.memberships.map((m) => [m.orgId, m.orgName]));
  return c.json({
    items: rows.map((r) => ({ ...r.s, orgName: r.s.orgId ? (orgNames.get(r.s.orgId) ?? null) : null, memberCount: r.memberCount, threadCount: r.threadCount, joined: !!r.myRole, myRole: r.myRole })),
    total: rows.length,
  });
});

communityRoutes.post('/spaces', async (c) => {
  const auth = requireAuth(c);
  const input = await body(
    c,
    z.object({
      name: z.string().trim().min(3).max(80),
      slug: z
        .string()
        .trim()
        .toLowerCase()
        .min(3)
        .max(60)
        .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes.'),
      description: z.string().trim().min(10).max(500),
      kind: z.enum(['topic', 'study_group', 'doubt_room', 'showcase', 'events']).default('topic'),
      visibility: z.enum(['public', 'members']).default('public'),
      orgId: z.string().uuid().nullable().optional(),
    }),
  );
  if (input.orgId) {
    if (!rolesIn(auth, input.orgId).some((r) => ['org_admin', 'faculty', 'faculty_admin', 'mentor'].includes(r))) throw forbidden('You need an admin, faculty or mentor role in that organization to create a space.');
  } else if (!isPlatformAdmin(auth)) {
    throw forbidden('Only platform admins create public spaces. Start a study group instead, or ask in an existing space.');
  }
  const [exists] = await db.select({ id: communitySpaces.id }).from(communitySpaces).where(eq(communitySpaces.slug, input.slug));
  if (exists) throw conflict('That address is taken.', { fields: { slug: 'That address is taken.' } });
  const [space] = await db
    .insert(communitySpaces)
    .values({ name: input.name, slug: input.slug, description: input.description, kind: input.kind, visibility: input.visibility, orgId: input.orgId ?? null, createdBy: auth.user.id })
    .returning();
  await db.insert(spaceMembers).values({ spaceId: space.id, userId: auth.user.id, role: 'moderator' });
  await audit(c, { action: 'community.space.created', orgId: space.orgId, targetType: 'space', targetId: space.id });
  return c.json({ space }, 201);
});

communityRoutes.get('/spaces/:slug', async (c) => {
  const auth = requireAuth(c);
  const { space, member, mod } = await loadSpaceBySlug(auth, c.req.param('slug'));
  const [moderators, [{ memberCount }]] = await Promise.all([
    db.select(authorCols).from(spaceMembers).innerJoin(users, eq(users.id, spaceMembers.userId)).where(and(eq(spaceMembers.spaceId, space.id), eq(spaceMembers.role, 'moderator'))),
    db.select({ memberCount: sql<number>`count(*)::int` }).from(spaceMembers).where(eq(spaceMembers.spaceId, space.id)),
  ]);
  const tags = await db
    .select({ tag: sql<string>`unnest(${threads.tags})`, n: sql<number>`count(*)::int` })
    .from(threads)
    .where(and(eq(threads.spaceId, space.id), eq(threads.isPrivate, false), ne(threads.status, 'hidden')))
    .groupBy(sql`1`)
    .orderBy(desc(sql`2`))
    .limit(20);
  return c.json({
    space,
    membership: member,
    isModerator: mod,
    canRead: canReadContent(space, member, mod),
    moderators,
    memberCount,
    tags: tags.map((t) => t.tag),
  });
});

communityRoutes.post('/spaces/:slug/join', async (c) => {
  const auth = requireAuth(c);
  const { space, member } = await loadSpaceBySlug(auth, c.req.param('slug'));
  if (!member) await db.insert(spaceMembers).values({ spaceId: space.id, userId: auth.user.id, role: 'member' }).onConflictDoNothing();
  return c.json({ ok: true });
});

communityRoutes.post('/spaces/:slug/leave', async (c) => {
  const auth = requireAuth(c);
  const { space } = await loadSpaceBySlug(auth, c.req.param('slug'));
  await db.delete(spaceMembers).where(and(eq(spaceMembers.spaceId, space.id), eq(spaceMembers.userId, auth.user.id)));
  return c.json({ ok: true });
});

communityRoutes.post('/spaces/:slug/moderators', async (c) => {
  const auth = requireAuth(c);
  const { space, mod } = await loadSpaceBySlug(auth, c.req.param('slug'));
  if (!mod) throw forbidden('Only moderators can appoint moderators.');
  const input = await body(c, z.object({ userId: z.string().uuid(), role: z.enum(['moderator', 'member']) }));
  await db
    .insert(spaceMembers)
    .values({ spaceId: space.id, userId: input.userId, role: input.role })
    .onConflictDoUpdate({ target: [spaceMembers.spaceId, spaceMembers.userId], set: { role: input.role } });
  await audit(c, { action: 'community.moderator.set', orgId: space.orgId, targetType: 'user', targetId: input.userId, meta: { spaceId: space.id, role: input.role } });
  return c.json({ ok: true });
});

// ---------- Thread listing ----------

const listQuery = pageQuery.extend({
  kind: z.enum(['discussion', 'question', 'showcase', 'event', 'team_formation']).optional(),
  tag: z.string().trim().max(40).optional(),
  sort: z.enum(['recent', 'top', 'unanswered', 'trending', 'upcoming']).default('recent'),
  mine: z.enum(['true', 'false']).optional(),
});

/** Visibility filter shared by every thread list: hidden, private and blocked-author threads are excluded. */
async function threadVisibility(auth: AuthContext, opts: { spaceId?: string; mod?: boolean }) {
  const uid = auth.user.id;
  const blocked = await blockedIds(uid);
  const conds: SQL[] = [];
  if (!opts.mod) {
    conds.push(or(ne(threads.status, 'hidden'), eq(threads.authorId, uid))!);
    conds.push(
      or(
        eq(threads.isPrivate, false),
        eq(threads.authorId, uid),
        sql`exists (select 1 from ${threadInvites} ti where ti.thread_id = ${threads.id} and ti.user_id = ${uid})`,
      )!,
    );
  }
  if (blocked.length) conds.push(notInArray(threads.authorId, blocked));
  if (opts.spaceId) conds.push(eq(threads.spaceId, opts.spaceId));
  return conds;
}

async function listThreads(auth: AuthContext, q: z.infer<typeof listQuery>, base: SQL[]) {
  const conds = [...base];
  if (q.kind) conds.push(eq(threads.kind, q.kind));
  if (q.tag) conds.push(sql`${q.tag.toLowerCase()} = any(${threads.tags})`);
  if (q.mine === 'true') conds.push(eq(threads.authorId, auth.user.id));
  if (q.q) {
    const like = `%${q.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    conds.push(or(sql`${threads.title} ilike ${like}`, sql`${threads.body} ilike ${like}`)!);
  }
  if (q.sort === 'unanswered') conds.push(and(eq(threads.kind, 'question'), isNull(threads.acceptedPostId))!);
  if (q.sort === 'trending') conds.push(gte(threads.lastActivityAt, new Date(Date.now() - 14 * 86400_000)));
  if (q.sort === 'upcoming') conds.push(and(eq(threads.kind, 'event'), gte(threads.eventAt, new Date(Date.now() - 3 * 3600_000)))!);
  const order =
    q.sort === 'top'
      ? [desc(threads.score), desc(threads.createdAt)]
      : q.sort === 'trending'
        ? [desc(sql`${threads.score} + ${threads.replyCount} * 2`), desc(threads.lastActivityAt)]
        : q.sort === 'upcoming'
          ? [asc(threads.eventAt)]
          : [desc(threads.lastActivityAt)];
  const where = and(...conds);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        t: threads,
        author: authorCols,
        space: { slug: communitySpaces.slug, name: communitySpaces.name, orgId: communitySpaces.orgId },
        signups: sql<number>`(select count(*)::int from ${threadSignups} ts where ts.thread_id = ${ref(threads.id)})`,
        locked: sql<boolean>`coalesce((select tm.locked from ${threadMeta} tm where tm.thread_id = ${ref(threads.id)}), false)`,
      })
      .from(threads)
      .innerJoin(users, eq(users.id, threads.authorId))
      .innerJoin(communitySpaces, eq(communitySpaces.id, threads.spaceId))
      .where(where)
      .orderBy(...order)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(threads).innerJoin(communitySpaces, eq(communitySpaces.id, threads.spaceId)).where(where),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.t.id,
      kind: r.t.kind,
      title: r.t.title,
      excerpt: r.t.body.slice(0, 220),
      tags: r.t.tags,
      isPrivate: r.t.isPrivate,
      status: r.t.status,
      answered: !!r.t.acceptedPostId,
      score: r.t.score,
      replyCount: r.t.replyCount,
      eventAt: r.t.eventAt,
      projectId: r.t.projectId,
      lastActivityAt: r.t.lastActivityAt,
      createdAt: r.t.createdAt,
      author: r.author,
      space: r.space,
      signups: r.signups,
      locked: r.locked,
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  };
}

communityRoutes.get('/spaces/:slug/threads', async (c) => {
  const auth = requireAuth(c);
  const { space, member, mod } = await loadSpaceBySlug(auth, c.req.param('slug'));
  if (!canReadContent(space, member, mod)) throw forbidden('Join this space to read its threads.');
  const q = query(c, listQuery);
  return c.json(await listThreads(auth, q, await threadVisibility(auth, { spaceId: space.id, mod })));
});

/** Feed across every space the caller can read (public spaces + their org spaces). */
communityRoutes.get('/threads', async (c) => {
  const auth = requireAuth(c);
  const q = query(c, listQuery);
  const ids = orgIds(auth);
  const base = await threadVisibility(auth, {});
  base.push(ids.length ? or(isNull(communitySpaces.orgId), inArray(communitySpaces.orgId, ids))! : isNull(communitySpaces.orgId));
  base.push(
    or(
      eq(communitySpaces.visibility, 'public'),
      sql`exists (select 1 from ${spaceMembers} sm where sm.space_id = ${communitySpaces.id} and sm.user_id = ${auth.user.id})`,
    )!,
  );
  return c.json(await listThreads(auth, q, base));
});

// ---------- Create thread ----------

const threadInput = z.object({
  kind: z.enum(['discussion', 'question', 'showcase', 'event', 'team_formation']).default('discussion'),
  title: z.string().trim().min(8, 'Make the title a little more descriptive.').max(200),
  body: z.string().trim().min(20, 'Add some detail so people can help.').max(20000),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(5).default([]),
  isPrivate: z.boolean().default(false),
  projectId: z.string().uuid().nullable().optional(),
  eventAt: z.string().datetime().nullable().optional(),
});

communityRoutes.post('/spaces/:slug/threads', async (c) => {
  const auth = requireAuth(c);
  const { space, member, mod } = await loadSpaceBySlug(auth, c.req.param('slug'));
  const input = await body(c, threadInput);
  if (!canReadContent(space, member, mod)) throw forbidden('Join this space to post.');
  if (input.isPrivate && input.kind !== 'question') throw badRequest('Only questions can be private.');
  if (input.kind === 'event') {
    if (!mod) throw forbidden('Events are posted by space moderators. Suggest one in a discussion thread.');
    if (!input.eventAt) throw badRequest('Add the event date and time.', { fields: { eventAt: 'Add the event date and time.' } });
  }
  if (input.kind === 'showcase') {
    if (!input.projectId) throw badRequest('Choose one of your projects to showcase.', { fields: { projectId: 'Choose a project.' } });
    const [p] = await db.select({ id: projects.id, visibility: projects.visibility }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.ownerId, auth.user.id)));
    if (!p) throw notFound('Project');
    if (p.visibility === 'private') throw badRequest('Make the project public or unlisted before showcasing it.', { fields: { projectId: 'This project is private.' } });
  }
  await antiSpam(auth, 'thread', input.body, input.title);
  const [t] = await db
    .insert(threads)
    .values({
      spaceId: space.id,
      authorId: auth.user.id,
      kind: input.kind,
      title: input.title,
      body: input.body,
      tags: [...new Set(input.tags)],
      isPrivate: input.isPrivate,
      projectId: input.kind === 'showcase' ? input.projectId! : null,
      eventAt: input.kind === 'event' && input.eventAt ? new Date(input.eventAt) : null,
    })
    .returning();
  if (!member) await db.insert(spaceMembers).values({ spaceId: space.id, userId: auth.user.id }).onConflictDoNothing();
  return c.json({ thread: t }, 201);
});

// ---------- Thread detail ----------

communityRoutes.get('/threads/:id', async (c) => {
  const auth = requireAuth(c);
  const uid = auth.user.id;
  const ctx = await loadReadableThread(auth, idParam(c));
  const { thread: t, space, mod } = ctx;
  const blocked = await blockedIds(uid);
  const postConds = [eq(posts.threadId, t.id)];
  if (!mod) postConds.push(or(eq(posts.status, 'visible'), eq(posts.authorId, uid))!);
  if (blocked.length) postConds.push(notInArray(posts.authorId, blocked));
  const [author, postRows, myVotes, signups, invites, project] = await Promise.all([
    db.select(authorCols).from(users).where(eq(users.id, t.authorId)).then((r) => r[0]),
    db.select({ p: posts, author: authorCols }).from(posts).innerJoin(users, eq(users.id, posts.authorId)).where(and(...postConds)).orderBy(asc(posts.createdAt)),
    db.select().from(votes).where(and(eq(votes.userId, uid), or(and(eq(votes.targetType, 'thread'), eq(votes.targetId, t.id)), and(eq(votes.targetType, 'post'), sql`${votes.targetId} in (select id from ${posts} where thread_id = ${t.id})`)))),
    db.select({ userId: threadSignups.userId, note: threadSignups.note, createdAt: threadSignups.createdAt, name: users.name, avatarColor: users.avatarColor }).from(threadSignups).innerJoin(users, eq(users.id, threadSignups.userId)).where(eq(threadSignups.threadId, t.id)),
    t.isPrivate && (ctx.isAuthor || mod)
      ? db.select({ userId: threadInvites.userId, name: users.name }).from(threadInvites).innerJoin(users, eq(users.id, threadInvites.userId)).where(eq(threadInvites.threadId, t.id))
      : Promise.resolve([]),
    t.projectId
      ? db
          .select({ id: projects.id, title: projects.title, slug: projects.slug, visibility: projects.visibility, repoUrl: projects.repoUrl, demoUrl: projects.demoUrl, status: projects.status })
          .from(projects)
          .where(and(eq(projects.id, t.projectId), ne(projects.visibility, 'private')))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);
  const authorIds = [...new Set([t.authorId, ...postRows.map((p) => p.p.authorId)])];
  const [rep, prefsRows] = await Promise.all([
    reputationFor(authorIds),
    db.select({ userId: communityPrefs.userId, show: communityPrefs.showReputation }).from(communityPrefs).where(inArray(communityPrefs.userId, authorIds)),
  ]);
  const hideRep = new Set(prefsRows.filter((p) => !p.show).map((p) => p.userId));
  const repOf = (id: string) => (hideRep.has(id) && id !== uid ? null : (rep.get(id)?.reputation ?? 0));
  const voteOf = (type: string, id: string) => myVotes.find((v) => v.targetType === type && v.targetId === id)?.value ?? 0;
  const locked = !!ctx.meta?.locked;
  const authorBlockedMe = t.authorId !== uid && (await hasBlocked(t.authorId, uid));
  return c.json({
    thread: { ...t, editedAt: ctx.meta?.editedAt ?? null, locked, myVote: voteOf('thread', t.id) },
    author: { ...author, reputation: repOf(t.authorId) },
    space: { id: space.id, slug: space.slug, name: space.name, kind: space.kind, orgId: space.orgId },
    posts: postRows.map((r) => ({
      ...r.p,
      author: { ...r.author, reputation: repOf(r.p.authorId) },
      myVote: voteOf('post', r.p.id),
      accepted: t.acceptedPostId === r.p.id,
      canEdit: r.p.authorId === uid && canEditWithin(r.p.createdAt),
    })),
    signups: t.kind === 'team_formation' || t.kind === 'event' ? signups : [],
    mySignup: signups.some((s) => s.userId === uid),
    invites,
    project,
    permissions: {
      canEdit: ctx.isAuthor && canEditWithin(t.createdAt),
      canReply: !locked && t.status !== 'hidden' && !authorBlockedMe,
      replyBlockedReason: locked ? 'This thread is locked.' : authorBlockedMe ? 'You cannot reply to this thread.' : t.status === 'hidden' ? 'This thread is hidden by a moderator.' : null,
      canAccept: ctx.isAuthor && t.kind === 'question',
      canModerate: mod,
      canInvite: ctx.isAuthor && t.isPrivate,
      canVote: true,
    },
  });
});

communityRoutes.patch('/threads/:id', async (c) => {
  const auth = requireAuth(c);
  const ctx = await loadReadableThread(auth, idParam(c));
  if (!ctx.isAuthor) throw forbidden('Only the author can edit this thread.');
  if (!canEditWithin(ctx.thread.createdAt)) throw forbidden('Threads can be edited for 30 minutes after posting. Add a reply with the update instead.');
  const input = await body(
    c,
    z.object({
      title: z.string().trim().min(8).max(200).optional(),
      body: z.string().trim().min(20).max(20000).optional(),
      tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(5).optional(),
    }),
  );
  if (input.body) await linkLimit(auth.user.id, input.body);
  const [t] = await db
    .update(threads)
    .set({ ...(input.title ? { title: input.title } : {}), ...(input.body ? { body: input.body } : {}), ...(input.tags ? { tags: [...new Set(input.tags)] } : {}) })
    .where(eq(threads.id, ctx.thread.id))
    .returning();
  const editedAt = new Date();
  await db.insert(threadMeta).values({ threadId: t.id, editedAt }).onConflictDoUpdate({ target: threadMeta.threadId, set: { editedAt } });
  return c.json({ thread: { ...t, editedAt } });
});

communityRoutes.delete('/threads/:id', async (c) => {
  const auth = requireAuth(c);
  const ctx = await loadReadableThread(auth, idParam(c));
  if (!ctx.isAuthor) throw forbidden('Only the author can delete this thread.');
  if (ctx.thread.replyCount > 0) throw badRequest('Threads with replies cannot be deleted, so answers are not lost. Ask a moderator to hide it if needed.');
  await db.delete(threads).where(eq(threads.id, ctx.thread.id));
  return c.json({ ok: true });
});

// ---------- Replies ----------

communityRoutes.post('/threads/:id/posts', async (c) => {
  const auth = requireAuth(c);
  const uid = auth.user.id;
  const ctx = await loadReadableThread(auth, idParam(c));
  const { thread: t, space, mod } = ctx;
  const input = await body(c, z.object({ body: z.string().trim().min(2).max(20000) }));
  if (ctx.meta?.locked && !mod) throw forbidden('This thread is locked.');
  if (t.status === 'hidden') throw forbidden('This thread is hidden by a moderator.');
  if (t.authorId !== uid && (await hasBlocked(t.authorId, uid))) throw forbidden('You cannot reply to this thread.');
  await antiSpam(auth, 'post', input.body);
  const [p] = await db.insert(posts).values({ threadId: t.id, authorId: uid, body: input.body }).returning();
  await db.update(threads).set({ replyCount: sql`${threads.replyCount} + 1`, lastActivityAt: new Date() }).where(eq(threads.id, t.id));
  if (!ctx.member && canSeeSpace(auth, space) && space.visibility === 'public') {
    await db.insert(spaceMembers).values({ spaceId: space.id, userId: uid }).onConflictDoNothing();
  }

  // Notifications: thread author on reply, participants on @mention, respecting preferences and blocks.
  const participantRows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(or(eq(users.id, t.authorId), sql`${users.id} in (select author_id from ${posts} where thread_id = ${t.id})`));
  const mentioned = mentionedAmong(input.body, participantRows.filter((r) => r.id !== uid));
  const link = `/app/community/t/${t.id}#post-${p.id}`;
  const targets = new Map<string, 'reply' | 'mention'>();
  if (t.authorId !== uid) targets.set(t.authorId, 'reply');
  for (const id of mentioned) targets.set(id, 'mention');
  for (const [id, why] of targets) {
    if (await hasBlocked(id, uid)) continue;
    const prefs = await prefsFor(id);
    if (why === 'reply' && !prefs.notifyReplies && !mentioned.includes(id)) continue;
    if (why === 'mention' && !prefs.notifyMentions) continue;
    await notify(id, {
      type: why === 'reply' ? 'community.reply' : 'community.mention',
      category: 'community',
      orgId: space.orgId,
      title: why === 'reply' ? `${auth.user.name} replied to "${t.title.slice(0, 80)}"` : `${auth.user.name} mentioned you in "${t.title.slice(0, 80)}"`,
      body: t.isPrivate ? undefined : input.body.slice(0, 160),
      link,
    });
  }
  return c.json({ post: p }, 201);
});

communityRoutes.patch('/posts/:id', async (c) => {
  const auth = requireAuth(c);
  const id = idParam(c);
  const [p] = await db.select().from(posts).where(and(eq(posts.id, id), eq(posts.authorId, auth.user.id)));
  if (!p) throw notFound('Reply');
  await loadReadableThread(auth, p.threadId);
  if (!canEditWithin(p.createdAt)) throw forbidden('Replies can be edited for 30 minutes after posting.');
  const input = await body(c, z.object({ body: z.string().trim().min(2).max(20000) }));
  await linkLimit(auth.user.id, input.body);
  const [row] = await db.update(posts).set({ body: input.body, editedAt: new Date() }).where(eq(posts.id, id)).returning();
  return c.json({ post: row });
});

// ---------- Votes ----------

communityRoutes.post('/votes', async (c) => {
  const auth = requireAuth(c);
  const uid = auth.user.id;
  const input = await body(c, z.object({ targetType: z.enum(['thread', 'post']), targetId: z.string().uuid(), value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) }));
  rateLimit(`community:vote:${uid}`, 120, 3600_000);
  let authorId: string;
  if (input.targetType === 'thread') {
    const ctx = await loadReadableThread(auth, input.targetId);
    authorId = ctx.thread.authorId;
  } else {
    const [p] = await db.select().from(posts).where(eq(posts.id, input.targetId));
    if (!p) throw notFound('Reply');
    const ctx = await loadReadableThread(auth, p.threadId);
    if (p.status === 'hidden' && !ctx.mod) throw notFound('Reply');
    authorId = p.authorId;
  }
  if (authorId === uid) throw badRequest('You cannot vote on your own posts.');
  if (input.value === 0) {
    await db.delete(votes).where(and(eq(votes.userId, uid), eq(votes.targetType, input.targetType), eq(votes.targetId, input.targetId)));
  } else {
    await db
      .insert(votes)
      .values({ userId: uid, targetType: input.targetType, targetId: input.targetId, value: input.value })
      .onConflictDoUpdate({ target: [votes.userId, votes.targetType, votes.targetId], set: { value: input.value, createdAt: new Date() } });
  }
  const [{ score }] = await db
    .select({ score: sql<number>`coalesce(sum(${votes.value}), 0)::int` })
    .from(votes)
    .where(and(eq(votes.targetType, input.targetType), eq(votes.targetId, input.targetId)));
  if (input.targetType === 'thread') await db.update(threads).set({ score }).where(eq(threads.id, input.targetId));
  else await db.update(posts).set({ score }).where(eq(posts.id, input.targetId));
  return c.json({ score, myVote: input.value });
});

// ---------- Accept answer ----------

communityRoutes.post('/threads/:id/accept', async (c) => {
  const auth = requireAuth(c);
  const ctx = await loadReadableThread(auth, idParam(c));
  const { thread: t } = ctx;
  if (!ctx.isAuthor) throw forbidden('Only the person who asked can accept an answer.');
  if (t.kind !== 'question') throw badRequest('Only questions have accepted answers.');
  const input = await body(c, z.object({ postId: z.string().uuid().nullable() }));
  if (input.postId === null) {
    await db.update(threads).set({ acceptedPostId: null, status: t.status === 'answered' ? 'open' : t.status }).where(eq(threads.id, t.id));
    return c.json({ ok: true, acceptedPostId: null });
  }
  const [p] = await db.select().from(posts).where(and(eq(posts.id, input.postId), eq(posts.threadId, t.id), eq(posts.status, 'visible')));
  if (!p) throw notFound('Reply');
  if (p.authorId === auth.user.id) throw badRequest('You cannot accept your own reply.');
  await db.update(threads).set({ acceptedPostId: p.id, status: t.status === 'hidden' ? 'hidden' : 'answered' }).where(eq(threads.id, t.id));
  // XP once per accepted post, however often acceptance is toggled.
  const ev = await recordActivity(p.authorId, {
    kind: 'community.answer_accepted',
    label: `Answer accepted: ${t.title.slice(0, 80)}`,
    xp: XP.helpfulAnswer,
    link: `/app/community/t/${t.id}`,
    dedupeKey: `answer-accepted:${p.id}`,
  });
  if (ev) {
    await evaluateAchievements(p.authorId);
    await notify(p.authorId, { type: 'community.accepted', category: 'community', title: `Your answer was accepted`, body: t.isPrivate ? undefined : t.title.slice(0, 120), link: `/app/community/t/${t.id}#post-${p.id}` });
  }
  return c.json({ ok: true, acceptedPostId: p.id, xpAwarded: !!ev });
});

// ---------- Team formation signups & event RSVPs ----------

communityRoutes.post('/threads/:id/signup', async (c) => {
  const auth = requireAuth(c);
  const ctx = await loadReadableThread(auth, idParam(c));
  const { thread: t } = ctx;
  if (t.kind !== 'team_formation' && t.kind !== 'event') throw badRequest('Sign-ups are for team formation and event threads.');
  if (ctx.isAuthor) throw badRequest('You started this thread.');
  if (t.authorId !== auth.user.id && (await hasBlocked(t.authorId, auth.user.id))) throw forbidden('You cannot sign up for this.');
  const input = await body(c, z.object({ note: z.string().trim().max(500).optional() }));
  const [row] = await db.insert(threadSignups).values({ threadId: t.id, userId: auth.user.id, note: input.note ?? null }).onConflictDoNothing().returning();
  if (row && t.kind === 'team_formation') {
    await notify(t.authorId, { type: 'community.team.interest', category: 'community', title: `${auth.user.name} is interested in joining your team`, body: input.note, link: `/app/community/t/${t.id}` });
  }
  return c.json({ ok: true });
});

communityRoutes.delete('/threads/:id/signup', async (c) => {
  const auth = requireAuth(c);
  const ctx = await loadReadableThread(auth, idParam(c));
  await db.delete(threadSignups).where(and(eq(threadSignups.threadId, ctx.thread.id), eq(threadSignups.userId, auth.user.id)));
  return c.json({ ok: true });
});

// ---------- Private question invites ----------

communityRoutes.post('/threads/:id/invite', async (c) => {
  const auth = requireAuth(c);
  const ctx = await loadReadableThread(auth, idParam(c));
  if (!ctx.isAuthor || !ctx.thread.isPrivate) throw forbidden('Only the author of a private question can invite mentors.');
  const { userId } = await body(c, z.object({ userId: z.string().uuid() }));
  if (userId === auth.user.id) throw badRequest('You can already see your question.');
  if (!(await isMentorUser(userId))) throw badRequest('Only mentors can be invited to private questions.');
  const prefs = await prefsFor(userId);
  if (!prefs.allowMentorInvites || (await hasBlocked(userId, auth.user.id))) throw badRequest('This mentor is not accepting invitations right now.');
  const [row] = await db.insert(threadInvites).values({ threadId: ctx.thread.id, userId, invitedBy: auth.user.id }).onConflictDoNothing().returning();
  if (row) await notify(userId, { type: 'community.invite', category: 'community', title: `${auth.user.name} invited you to a private question`, link: `/app/community/t/${ctx.thread.id}` });
  return c.json({ ok: true });
});

communityRoutes.delete('/threads/:id/invite/:userId', async (c) => {
  const auth = requireAuth(c);
  const ctx = await loadReadableThread(auth, idParam(c));
  if (!ctx.isAuthor) throw forbidden('Only the author can manage invitations.');
  await db.delete(threadInvites).where(and(eq(threadInvites.threadId, ctx.thread.id), eq(threadInvites.userId, idParam(c, 'userId'))));
  return c.json({ ok: true });
});

// ---------- Reports & blocks ----------

communityRoutes.post('/reports', async (c) => {
  const auth = requireAuth(c);
  const input = await body(
    c,
    z.object({ targetType: z.enum(['thread', 'post', 'user']), targetId: z.string().uuid(), reason: z.enum(['spam', 'abuse', 'incorrect', 'copyright', 'other']), details: z.string().trim().max(2000).optional() }),
  );
  rateLimit(`community:report:${auth.user.id}`, 20, 3600_000);
  let orgId: string | null = null;
  if (input.targetType === 'thread') orgId = (await loadReadableThread(auth, input.targetId)).space.orgId;
  else if (input.targetType === 'post') {
    const [p] = await db.select().from(posts).where(eq(posts.id, input.targetId));
    if (!p) throw notFound('Reply');
    orgId = (await loadReadableThread(auth, p.threadId)).space.orgId;
  } else {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.targetId));
    if (!u) throw notFound('Person');
    if (u.id === auth.user.id) throw badRequest('You cannot report yourself.');
  }
  const [existing] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.reporterId, auth.user.id), eq(reports.targetType, input.targetType), eq(reports.targetId, input.targetId), eq(reports.status, 'open')));
  if (existing) return c.json({ report: { id: existing.id, status: existing.status }, duplicate: true });
  const [r] = await db.insert(reports).values({ orgId, reporterId: auth.user.id, targetType: input.targetType, targetId: input.targetId, reason: input.reason, details: input.details ?? null }).returning();
  return c.json({ report: { id: r.id, status: r.status } }, 201);
});

communityRoutes.get('/blocks', async (c) => {
  const auth = requireAuth(c);
  const rows = await db
    .select({ userId: userBlocks.blockedId, name: users.name, avatarColor: users.avatarColor, createdAt: userBlocks.createdAt })
    .from(userBlocks)
    .innerJoin(users, eq(users.id, userBlocks.blockedId))
    .where(eq(userBlocks.blockerId, auth.user.id))
    .orderBy(desc(userBlocks.createdAt));
  return c.json({ items: rows });
});

communityRoutes.post('/blocks', async (c) => {
  const auth = requireAuth(c);
  const { userId } = await body(c, z.object({ userId: z.string().uuid() }));
  if (userId === auth.user.id) throw badRequest('You cannot block yourself.');
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
  if (!u) throw notFound('Person');
  await db.insert(userBlocks).values({ blockerId: auth.user.id, blockedId: userId }).onConflictDoNothing();
  await audit(c, { action: 'community.user.blocked', targetType: 'user', targetId: userId });
  return c.json({ ok: true }, 201);
});

communityRoutes.delete('/blocks/:userId', async (c) => {
  const auth = requireAuth(c);
  await db.delete(userBlocks).where(and(eq(userBlocks.blockerId, auth.user.id), eq(userBlocks.blockedId, idParam(c, 'userId'))));
  return c.json({ ok: true });
});

// ---------- Moderation ----------

communityRoutes.get('/moderation/access', async (c) => {
  const auth = requireAuth(c);
  const mods = await moderatedSpaceIds(auth);
  return c.json({ canModerate: mods === 'all' || mods.length > 0, scope: mods === 'all' ? 'platform' : 'spaces' });
});

communityRoutes.post('/moderation/threads/:id', async (c) => {
  const auth = requireAuth(c);
  const ctx = await loadReadableThread(auth, idParam(c));
  if (!ctx.mod) throw forbidden('Only moderators of this space can do that.');
  const { action, reason } = await body(c, z.object({ action: z.enum(['hide', 'unhide', 'lock', 'unlock']), reason: z.string().trim().max(500).optional() }));
  await applyThreadModeration(ctx.thread, action);
  await audit(c, { action: `community.thread.${action}`, orgId: ctx.space.orgId, targetType: 'thread', targetId: ctx.thread.id, meta: { reason: reason ?? null } });
  if (action === 'hide' && ctx.thread.authorId !== auth.user.id) {
    await notify(ctx.thread.authorId, { type: 'community.moderation', category: 'community', title: 'A moderator hid one of your threads', body: reason || 'It may break the community guidelines.', link: '/app/community/guidelines' });
  }
  return c.json({ ok: true });
});

async function applyThreadModeration(t: typeof threads.$inferSelect, action: 'hide' | 'unhide' | 'lock' | 'unlock') {
  const [meta] = await db.select().from(threadMeta).where(eq(threadMeta.threadId, t.id));
  if (action === 'lock' || action === 'unlock') {
    const locked = action === 'lock';
    await db.insert(threadMeta).values({ threadId: t.id, locked }).onConflictDoUpdate({ target: threadMeta.threadId, set: { locked } });
  } else if (action === 'hide' && t.status !== 'hidden') {
    await db.insert(threadMeta).values({ threadId: t.id, statusBeforeHide: t.status }).onConflictDoUpdate({ target: threadMeta.threadId, set: { statusBeforeHide: t.status } });
    await db.update(threads).set({ status: 'hidden' }).where(eq(threads.id, t.id));
  } else if (action === 'unhide' && t.status === 'hidden') {
    await db.update(threads).set({ status: meta?.statusBeforeHide ?? (t.acceptedPostId ? 'answered' : 'open') }).where(eq(threads.id, t.id));
  }
}

communityRoutes.post('/moderation/posts/:id', async (c) => {
  const auth = requireAuth(c);
  const [p] = await db.select().from(posts).where(eq(posts.id, idParam(c)));
  if (!p) throw notFound('Reply');
  const ctx = await loadReadableThread(auth, p.threadId);
  if (!ctx.mod) throw forbidden('Only moderators of this space can do that.');
  const { action, reason } = await body(c, z.object({ action: z.enum(['hide', 'unhide']), reason: z.string().trim().max(500).optional() }));
  await db.update(posts).set({ status: action === 'hide' ? 'hidden' : 'visible' }).where(eq(posts.id, p.id));
  await audit(c, { action: `community.post.${action}`, orgId: ctx.space.orgId, targetType: 'post', targetId: p.id, meta: { reason: reason ?? null } });
  return c.json({ ok: true });
});

communityRoutes.get('/moderation/reports', async (c) => {
  const auth = requireAuth(c);
  const q = query(c, pageQuery.extend({ status: z.enum(['open', 'actioned', 'dismissed']).default('open') }));
  const mods = await moderatedSpaceIds(auth);
  if (mods !== 'all' && !mods.length) throw forbidden('The moderation queue is for space moderators and platform admins.');
  const conds: SQL[] = [eq(reports.status, q.status), inArray(reports.targetType, ['thread', 'post', 'user'])];
  if (mods !== 'all') {
    conds.push(
      or(
        and(eq(reports.targetType, 'thread'), sql`${reports.targetId} in (select id::text from ${threads} where space_id in (${sql.join(mods.map((m) => sql`${m}::uuid`), sql`, `)}))`),
        and(
          eq(reports.targetType, 'post'),
          sql`${reports.targetId} in (select p.id::text from ${posts} p join ${threads} t on t.id = p.thread_id where t.space_id in (${sql.join(mods.map((m) => sql`${m}::uuid`), sql`, `)}))`,
        ),
      )!,
    );
  }
  const where = and(...conds);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ r: reports, reporter: { id: users.id, name: users.name } })
      .from(reports)
      .innerJoin(users, eq(users.id, reports.reporterId))
      .where(where)
      .orderBy(desc(reports.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(reports).where(where),
  ]);
  // Attach a preview of the reported content.
  const threadIds = rows.filter((r) => r.r.targetType === 'thread').map((r) => r.r.targetId);
  const postIds = rows.filter((r) => r.r.targetType === 'post').map((r) => r.r.targetId);
  const userIds = rows.filter((r) => r.r.targetType === 'user').map((r) => r.r.targetId);
  const [tRows, pRows, uRows] = await Promise.all([
    threadIds.length ? db.select({ id: threads.id, title: threads.title, body: threads.body, status: threads.status, authorId: threads.authorId, authorName: users.name }).from(threads).innerJoin(users, eq(users.id, threads.authorId)).where(inArray(threads.id, threadIds)) : Promise.resolve([]),
    postIds.length ? db.select({ id: posts.id, body: posts.body, status: posts.status, threadId: posts.threadId, authorId: posts.authorId, authorName: users.name }).from(posts).innerJoin(users, eq(users.id, posts.authorId)).where(inArray(posts.id, postIds)) : Promise.resolve([]),
    userIds.length ? db.select({ id: users.id, name: users.name, status: users.status }).from(users).where(inArray(users.id, userIds)) : Promise.resolve([]),
  ]);
  return c.json({
    items: rows.map((r) => {
      const t = tRows.find((x) => x.id === r.r.targetId);
      const p = pRows.find((x) => x.id === r.r.targetId);
      const u = uRows.find((x) => x.id === r.r.targetId);
      return {
        ...r.r,
        reporter: r.reporter,
        target: t
          ? { kind: 'thread', title: t.title, excerpt: t.body.slice(0, 300), status: t.status, author: { id: t.authorId, name: t.authorName }, link: `/app/community/t/${t.id}` }
          : p
            ? { kind: 'post', excerpt: p.body.slice(0, 300), status: p.status, author: { id: p.authorId, name: p.authorName }, link: `/app/community/t/${p.threadId}#post-${p.id}` }
            : u
              ? { kind: 'user', name: u.name, status: u.status }
              : null,
      };
    }),
    total,
    page: q.page,
    pageSize: q.pageSize,
  });
});

communityRoutes.post('/moderation/reports/:id/resolve', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, z.object({ status: z.enum(['actioned', 'dismissed']), resolution: z.string().trim().min(3).max(1000), hideContent: z.boolean().default(false) }));
  const [r] = await db.select().from(reports).where(and(eq(reports.id, idParam(c)), inArray(reports.targetType, ['thread', 'post', 'user'])));
  if (!r) throw notFound('Report');
  if (r.targetType === 'user') {
    if (!isPlatformAdmin(auth)) throw notFound('Report');
  } else {
    const threadId = r.targetType === 'thread' ? r.targetId : (await db.select({ t: posts.threadId }).from(posts).where(eq(posts.id, r.targetId)))[0]?.t;
    if (threadId) {
      const [row] = await db.select({ t: threads, s: communitySpaces }).from(threads).innerJoin(communitySpaces, eq(communitySpaces.id, threads.spaceId)).where(eq(threads.id, threadId));
      if (!row || !(await isModerator(auth, row.s as Space))) throw notFound('Report');
      if (input.hideContent && input.status === 'actioned') {
        if (r.targetType === 'thread') await applyThreadModeration(row.t, 'hide');
        else await db.update(posts).set({ status: 'hidden' }).where(eq(posts.id, r.targetId));
      }
    } else if (!isPlatformAdmin(auth)) throw notFound('Report');
  }
  if (r.status !== 'open') throw badRequest('This report is already resolved.');
  const [row] = await db.update(reports).set({ status: input.status, resolution: input.resolution, resolvedBy: auth.user.id, resolvedAt: new Date() }).where(eq(reports.id, r.id)).returning();
  await audit(c, { action: `community.report.${input.status}`, orgId: r.orgId, targetType: r.targetType, targetId: r.targetId, meta: { reportId: r.id, hideContent: input.hideContent } });
  await notify(r.reporterId, {
    type: 'community.report.resolved',
    category: 'community',
    title: input.status === 'actioned' ? 'Thanks for your report. A moderator took action.' : 'Thanks for your report. A moderator reviewed it.',
    link: '/app/community/guidelines',
    email: false,
  });
  return c.json({ report: row });
});

// ---------- Study groups ----------

function groupMembers(g: typeof studyGroups.$inferSelect) {
  return [...new Set([g.ownerId, ...g.memberIds])];
}

async function loadGroup(id: string) {
  const [g] = await db.select().from(studyGroups).where(eq(studyGroups.id, id));
  if (!g) throw notFound('Study group');
  return g;
}

async function loadGroupAsMember(auth: AuthContext, id: string) {
  const g = await loadGroup(id);
  if (!groupMembers(g).includes(auth.user.id)) throw notFound('Study group');
  return g;
}

communityRoutes.get('/groups', async (c) => {
  const auth = requireAuth(c);
  const rows = await db.select().from(studyGroups).orderBy(desc(studyGroups.createdAt)).limit(200);
  const ownerIds = [...new Set(rows.map((g) => g.ownerId))];
  const owners = ownerIds.length ? await db.select(authorCols).from(users).where(inArray(users.id, ownerIds)) : [];
  const blocked = new Set(await blockedIds(auth.user.id));
  return c.json({
    items: rows
      .filter((g) => !blocked.has(g.ownerId))
      .map((g) => {
        const members = groupMembers(g);
        return { id: g.id, name: g.name, goal: g.goal, maxMembers: g.maxMembers, memberCount: members.length, isMember: members.includes(auth.user.id), isOwner: g.ownerId === auth.user.id, owner: owners.find((o) => o.id === g.ownerId) ?? null, createdAt: g.createdAt };
      }),
  });
});

communityRoutes.post('/groups', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, z.object({ name: z.string().trim().min(3).max(80), goal: z.string().trim().min(10).max(500), maxMembers: z.number().int().min(2).max(30).default(8) }));
  rateLimit(`community:group:${auth.user.id}`, 5, 86400_000);
  await linkLimit(auth.user.id, input.goal);
  const [g] = await db.insert(studyGroups).values({ name: input.name, goal: input.goal, maxMembers: input.maxMembers, ownerId: auth.user.id, memberIds: [auth.user.id] }).returning();
  return c.json({ group: g }, 201);
});

communityRoutes.get('/groups/:id', async (c) => {
  const auth = requireAuth(c);
  const g = await loadGroup(idParam(c));
  const members = groupMembers(g);
  const isMember = members.includes(auth.user.id);
  const people = await db.select(authorCols).from(users).where(inArray(users.id, members));
  return c.json({
    group: {
      id: g.id,
      name: g.name,
      goal: g.goal,
      maxMembers: g.maxMembers,
      ownerId: g.ownerId,
      createdAt: g.createdAt,
      // Notes and tasks are for members only.
      sharedNotes: isMember ? g.sharedNotes : null,
      sharedTasks: isMember ? g.sharedTasks : null,
    },
    members: isMember ? people : people.map((p) => ({ id: p.id, name: p.name, avatarColor: p.avatarColor, isSample: p.isSample })),
    isMember,
    isOwner: g.ownerId === auth.user.id,
  });
});

communityRoutes.post('/groups/:id/join', async (c) => {
  const auth = requireAuth(c);
  const g = await loadGroup(idParam(c));
  const members = groupMembers(g);
  if (members.includes(auth.user.id)) return c.json({ ok: true });
  if (members.length >= g.maxMembers) throw conflict('This group is full.');
  if (await hasBlocked(g.ownerId, auth.user.id)) throw forbidden('You cannot join this group.');
  await db.update(studyGroups).set({ memberIds: [...g.memberIds, auth.user.id] }).where(eq(studyGroups.id, g.id));
  await notify(g.ownerId, { type: 'community.group.joined', category: 'community', title: `${auth.user.name} joined ${g.name}`, link: `/app/community/groups/${g.id}`, email: false });
  return c.json({ ok: true });
});

communityRoutes.post('/groups/:id/leave', async (c) => {
  const auth = requireAuth(c);
  const g = await loadGroupAsMember(auth, idParam(c));
  const rest = groupMembers(g).filter((id) => id !== auth.user.id);
  if (!rest.length) {
    await db.delete(studyGroups).where(eq(studyGroups.id, g.id));
    return c.json({ ok: true, deleted: true });
  }
  await db
    .update(studyGroups)
    .set({ memberIds: rest, ownerId: g.ownerId === auth.user.id ? rest[0] : g.ownerId, sharedTasks: g.sharedTasks.map((t) => (t.assigneeId === auth.user.id ? { ...t, assigneeId: undefined } : t)) })
    .where(eq(studyGroups.id, g.id));
  return c.json({ ok: true });
});

communityRoutes.patch('/groups/:id/notes', async (c) => {
  const auth = requireAuth(c);
  const g = await loadGroupAsMember(auth, idParam(c));
  const { sharedNotes } = await body(c, z.object({ sharedNotes: z.string().max(50000) }));
  await db.update(studyGroups).set({ sharedNotes }).where(eq(studyGroups.id, g.id));
  return c.json({ ok: true });
});

communityRoutes.post('/groups/:id/tasks', async (c) => {
  const auth = requireAuth(c);
  const g = await loadGroupAsMember(auth, idParam(c));
  const input = await body(c, z.object({ text: z.string().trim().min(1).max(300), assigneeId: z.string().uuid().nullable().optional() }));
  if (input.assigneeId && !groupMembers(g).includes(input.assigneeId)) throw badRequest('Assign tasks to group members only.');
  if (g.sharedTasks.length >= 100) throw badRequest('This board is full. Clear finished tasks first.');
  const task = { id: crypto.randomUUID(), text: input.text, done: false, ...(input.assigneeId ? { assigneeId: input.assigneeId } : {}) };
  await db.update(studyGroups).set({ sharedTasks: [...g.sharedTasks, task] }).where(eq(studyGroups.id, g.id));
  return c.json({ task }, 201);
});

communityRoutes.patch('/groups/:id/tasks/:taskId', async (c) => {
  const auth = requireAuth(c);
  const g = await loadGroupAsMember(auth, idParam(c));
  const taskId = c.req.param('taskId');
  const input = await body(c, z.object({ text: z.string().trim().min(1).max(300).optional(), done: z.boolean().optional(), assigneeId: z.string().uuid().nullable().optional() }));
  if (input.assigneeId && !groupMembers(g).includes(input.assigneeId)) throw badRequest('Assign tasks to group members only.');
  if (!g.sharedTasks.some((t) => t.id === taskId)) throw notFound('Task');
  const sharedTasks = g.sharedTasks.map((t) => {
    if (t.id !== taskId) return t;
    const next = { ...t, ...(input.text ? { text: input.text } : {}), ...(input.done !== undefined ? { done: input.done } : {}) };
    if (input.assigneeId !== undefined) {
      if (input.assigneeId) next.assigneeId = input.assigneeId;
      else delete next.assigneeId;
    }
    return next;
  });
  await db.update(studyGroups).set({ sharedTasks }).where(eq(studyGroups.id, g.id));
  return c.json({ task: sharedTasks.find((t) => t.id === taskId) });
});

communityRoutes.delete('/groups/:id/tasks/:taskId', async (c) => {
  const auth = requireAuth(c);
  const g = await loadGroupAsMember(auth, idParam(c));
  const taskId = c.req.param('taskId');
  if (!g.sharedTasks.some((t) => t.id === taskId)) throw notFound('Task');
  await db
    .update(studyGroups)
    .set({ sharedTasks: g.sharedTasks.filter((t) => t.id !== taskId) })
    .where(eq(studyGroups.id, g.id));
  return c.json({ ok: true });
});

// Members of a space (used by moderators to appoint moderators).
communityRoutes.get('/spaces/:slug/members', async (c) => {
  const auth = requireAuth(c);
  const { space, member, mod } = await loadSpaceBySlug(auth, c.req.param('slug'));
  if (!canReadContent(space, member, mod)) throw forbidden('Join this space to see its members.');
  const rows = await db
    .select({ ...authorCols, role: spaceMembers.role, joinedAt: spaceMembers.joinedAt })
    .from(spaceMembers)
    .innerJoin(users, eq(users.id, spaceMembers.userId))
    .where(eq(spaceMembers.spaceId, space.id))
    .orderBy(desc(spaceMembers.role), asc(users.name))
    .limit(200);
  return c.json({ items: rows, isModerator: mod, member: !!(await membership(space.id, auth.user.id)) });
});
