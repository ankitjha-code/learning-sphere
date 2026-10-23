import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { users, communitySpaces, spaceMembers, threads, posts, votes, userBlocks, threadInvites, threadMeta, communityPrefs, mentorProfiles, memberships } from '../../db/schema';
import { type AuthContext, isPlatformAdmin, rolesIn } from '../../lib/context';
import { notFound } from '../../lib/errors';

export type Space = typeof communitySpaces.$inferSelect;
export type Thread = typeof threads.$inferSelect;

export const EDIT_WINDOW_MS = 30 * 60_000;
export const ACCEPTED_ANSWER_REP = 15;

export const GUIDELINES = {
  version: '2026-10',
  summary: 'LearnSphere Community is for learning together. Be kind, be specific, and help others the way you would like to be helped.',
  sections: [
    {
      title: 'Be respectful',
      points: [
        'Critique ideas and code, never people. No harassment, hate speech, or personal attacks.',
        'Assume good intent. Everyone was a beginner once.',
        'Respect privacy: do not share anyone else’s personal details, grades, or private messages.',
      ],
    },
    {
      title: 'Ask good questions',
      points: [
        'Say what you tried, what you expected, and what happened instead. Include the smallest code that shows the problem.',
        'Use a private question for sensitive career or personal topics. Only you, space moderators and mentors you invite can see it.',
        'Accept the answer that solved your problem so others can find it.',
      ],
    },
    {
      title: 'Give helpful answers',
      points: [
        'Explain the why, not only the fix. Link sources you relied on.',
        'Do not post graded assignment or live assessment answers. Help people learn instead.',
        'Reputation comes from votes on your posts and accepted answers. It cannot be bought or transferred.',
      ],
    },
    {
      title: 'No spam',
      points: [
        'No advertising, referral links or repeated posts. Identical posts within 10 minutes are rejected.',
        'New accounts (under 3 days old) can include at most 2 links per post.',
        'Posting is rate limited to keep discussions readable.',
      ],
    },
    {
      title: 'Reporting and moderation',
      points: [
        'Report content that breaks these guidelines from its menu. Reports are reviewed by space moderators or platform admins.',
        'Block someone to hide their posts from you. Blocked people cannot reply to your threads.',
        'Moderators can hide posts, lock threads and resolve reports. Every moderator action is recorded in the audit log.',
      ],
    },
  ],
};

export async function blockedIds(uid: string) {
  const rows = await db.select({ id: userBlocks.blockedId }).from(userBlocks).where(eq(userBlocks.blockerId, uid));
  return rows.map((r) => r.id);
}

export async function hasBlocked(blocker: string, blocked: string) {
  const [row] = await db
    .select({ x: userBlocks.blockerId })
    .from(userBlocks)
    .where(and(eq(userBlocks.blockerId, blocker), eq(userBlocks.blockedId, blocked)))
    .limit(1);
  return !!row;
}

export function orgIds(auth: AuthContext) {
  return auth.memberships.map((m) => m.orgId);
}

/** Org spaces are invisible (404) to people outside the org. */
export function canSeeSpace(auth: AuthContext, space: Space) {
  if (!space.orgId) return true;
  return isPlatformAdmin(auth) || orgIds(auth).includes(space.orgId);
}

export async function membership(spaceId: string, uid: string) {
  const [m] = await db.select().from(spaceMembers).where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, uid)));
  return m ?? null;
}

export async function isModerator(auth: AuthContext, space: Space, member?: typeof spaceMembers.$inferSelect | null) {
  if (isPlatformAdmin(auth)) return true;
  if (space.orgId && rolesIn(auth, space.orgId).includes('org_admin')) return true;
  const m = member === undefined ? await membership(space.id, auth.user.id) : member;
  return m?.role === 'moderator';
}

/** Content of members-only spaces (study rooms) needs membership; moderators always can read. */
export function canReadContent(space: Space, member: typeof spaceMembers.$inferSelect | null, mod: boolean) {
  return space.visibility !== 'members' || !!member || mod;
}

export async function loadSpaceBySlug(auth: AuthContext, slug: string) {
  const [space] = await db.select().from(communitySpaces).where(eq(communitySpaces.slug, slug));
  if (!space || !canSeeSpace(auth, space)) throw notFound('Space');
  const member = await membership(space.id, auth.user.id);
  const mod = await isModerator(auth, space, member);
  return { space, member, mod };
}

export async function isInvited(threadId: string, uid: string) {
  const [row] = await db
    .select({ x: threadInvites.userId })
    .from(threadInvites)
    .where(and(eq(threadInvites.threadId, threadId), eq(threadInvites.userId, uid)))
    .limit(1);
  return !!row;
}

/**
 * Loads a thread the caller may read, or throws 404. Private questions are visible only to
 * the author, space moderators and explicitly invited mentors. Hidden threads only to the
 * author and moderators.
 */
export async function loadReadableThread(auth: AuthContext, id: string) {
  const [row] = await db.select({ t: threads, s: communitySpaces }).from(threads).innerJoin(communitySpaces, eq(communitySpaces.id, threads.spaceId)).where(eq(threads.id, id));
  if (!row || !canSeeSpace(auth, row.s)) throw notFound('Thread');
  const uid = auth.user.id;
  const member = await membership(row.s.id, uid);
  const mod = await isModerator(auth, row.s, member);
  const isAuthor = row.t.authorId === uid;
  if (!isAuthor && !mod && !canReadContent(row.s, member, mod)) throw notFound('Thread');
  if (row.t.status === 'hidden' && !isAuthor && !mod) throw notFound('Thread');
  const invited = row.t.isPrivate && !isAuthor && !mod ? await isInvited(row.t.id, uid) : false;
  if (row.t.isPrivate && !isAuthor && !mod && !invited) throw notFound('Thread');
  const [meta] = await db.select().from(threadMeta).where(eq(threadMeta.threadId, row.t.id));
  return { thread: row.t, space: row.s, member, mod, isAuthor, invited, meta: meta ?? null };
}

/** Reputation = net votes on your threads and replies + 15 per accepted answer (on someone else's question). */
export async function reputationFor(ids: string[]) {
  if (!ids.length) return new Map<string, { reputation: number; accepted: number }>();
  const uid = sql.raw('"users"."id"'); // qualified: correlated subqueries below have their own id columns
  const rows = await db
    .select({
      id: users.id,
      postVotes: sql<number>`coalesce((select sum(v.value) from ${votes} v join ${posts} p on v.target_type = 'post' and p.id = v.target_id where p.author_id = ${uid}), 0)::int`,
      threadVotes: sql<number>`coalesce((select sum(v.value) from ${votes} v join ${threads} t on v.target_type = 'thread' and t.id = v.target_id where t.author_id = ${uid}), 0)::int`,
      accepted: sql<number>`(select count(*) from ${threads} t join ${posts} p on p.id = t.accepted_post_id where p.author_id = ${uid} and t.author_id <> ${uid})::int`,
    })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(rows.map((r) => [r.id, { reputation: r.postVotes + r.threadVotes + ACCEPTED_ANSWER_REP * r.accepted, accepted: r.accepted }]));
}

export async function prefsFor(uid: string) {
  const [p] = await db.select().from(communityPrefs).where(eq(communityPrefs.userId, uid));
  return p ?? { userId: uid, notifyReplies: true, notifyMentions: true, showReputation: true, allowMentorInvites: true, updatedAt: new Date() };
}

export async function isMentorUser(uid: string) {
  const [p] = await db.select({ status: mentorProfiles.status }).from(mentorProfiles).where(eq(mentorProfiles.userId, uid));
  if (p?.status === 'active') return true;
  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, uid), eq(memberships.status, 'active'), sql`'mentor' = any(${memberships.roles})`))
    .limit(1);
  return !!m;
}

const LINK_RE = /(https?:\/\/|www\.)\S+/gi;
export function countLinks(text: string) {
  return (text.match(LINK_RE) ?? []).length;
}

export function normalizeBody(text: string) {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Users mentioned as @FirstName or @FullName (no spaces) among the given participants. */
export function mentionedAmong(text: string, participants: { id: string; name: string }[]) {
  const lower = text.toLowerCase();
  const hits = new Set<string>();
  for (const p of participants) {
    const first = p.name.split(/\s+/)[0]?.toLowerCase();
    const full = p.name.replace(/\s+/g, '').toLowerCase();
    for (const handle of [full, first]) {
      if (!handle) continue;
      const re = new RegExp(`(^|[^\\w])@${handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`, 'i');
      if (re.test(lower)) {
        hits.add(p.id);
        break;
      }
    }
  }
  return [...hits];
}
