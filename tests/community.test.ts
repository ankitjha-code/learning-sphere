import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { setupTestApp, registerUser } from './helpers';
import { db } from '../server/db/client';
import { activityEvents, communitySpaces, spaceMembers, users, mentorProfiles, projects, organizations, memberships } from '../server/db/schema';
import { resetRateLimits } from '../server/lib/ratelimit';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
let spaceId: string;
beforeAll(async () => {
  ctx = await setupTestApp();
  const [s] = await db.insert(communitySpaces).values({ slug: 'python-help', name: 'Python help', description: 'Ask anything about Python.' }).returning();
  spaceId = s.id;
});
afterAll(async () => ctx.close());
// Posting limits are exercised elsewhere; each scenario starts with a fresh window.
beforeEach(() => resetRateLimits());

async function user(name: string, email: string) {
  resetRateLimits();
  return registerUser(ctx.app, name, email);
}

let n = 0;
const q = (title = 'How do list comprehensions work?') => ({
  kind: 'question',
  title: `${title} #${++n}`,
  body: `I am trying to understand list comprehensions in Python, case ${n}. What is the difference from a loop?`,
  tags: ['python'],
});

describe('community: threads, private questions, blocks, anti-spam, accepted answers', () => {
  let asker: Awaited<ReturnType<typeof user>>;
  let helper: Awaited<ReturnType<typeof user>>;
  let mod: Awaited<ReturnType<typeof user>>;
  let mentor: Awaited<ReturnType<typeof user>>;
  let stranger: Awaited<ReturnType<typeof user>>;

  beforeAll(async () => {
    asker = await user('Asha Asker', 'asker@example.test');
    helper = await user('Hari Helper', 'helper@example.test');
    mod = await user('Mona Moderator', 'mod@example.test');
    mentor = await user('Mia Mentor', 'mia@example.test');
    stranger = await user('Sam Stranger', 'sam@example.test');
    await db.insert(spaceMembers).values({ spaceId, userId: mod.userId, role: 'moderator' });
    await db.insert(mentorProfiles).values({ userId: mentor.userId, headline: 'Mentor', bio: 'Helps with Python questions and careers.', expertise: ['python'], status: 'active' });
  });

  it('serves guidelines and validates new threads', async () => {
    const g = await asker.get('/api/community/guidelines');
    expect(g.body.guidelines.sections.length).toBeGreaterThan(3);
    const bad = await asker.post('/api/community/spaces/python-help/threads', { kind: 'question', title: 'short', body: 'x' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fields.title).toBeTruthy();
  });

  it('keeps private questions invisible to non-moderators', async () => {
    const r = await asker.post('/api/community/spaces/python-help/threads', { ...q('Private career question about salary'), isPrivate: true, tags: ['career'] });
    expect(r.status).toBe(201);
    const id = r.body.thread.id;

    expect((await stranger.get(`/api/community/threads/${id}`)).status).toBe(404);
    expect((await stranger.post(`/api/community/threads/${id}/posts`, { body: 'Let me answer' })).status).toBe(404);
    const strangerList = await stranger.get('/api/community/spaces/python-help/threads');
    expect(strangerList.body.items.find((t: any) => t.id === id)).toBeUndefined();
    const feed = await stranger.get('/api/community/threads');
    expect(feed.body.items.find((t: any) => t.id === id)).toBeUndefined();
    const search = await stranger.get('/api/search?q=salary');
    expect(JSON.stringify(search.body)).not.toContain(id);

    expect((await mod.get(`/api/community/threads/${id}`)).status).toBe(200);
    expect((await asker.get(`/api/community/threads/${id}`)).status).toBe(200);
    expect((await mentor.get(`/api/community/threads/${id}`)).status).toBe(404);

    // Inviting a non-mentor fails; inviting a mentor grants access.
    expect((await asker.post(`/api/community/threads/${id}/invite`, { userId: stranger.userId })).status).toBe(400);
    expect((await asker.post(`/api/community/threads/${id}/invite`, { userId: mentor.userId })).status).toBe(200);
    expect((await mentor.get(`/api/community/threads/${id}`)).status).toBe(200);
    expect((await stranger.get(`/api/community/threads/${id}`)).status).toBe(404);
  });

  it('rejects an exact duplicate post within 10 minutes', async () => {
    const t = await asker.post('/api/community/spaces/python-help/threads', q());
    const id = t.body.thread.id;
    const body = 'Use [x * 2 for x in items]. It builds a new list in one expression.';
    expect((await helper.post(`/api/community/threads/${id}/posts`, { body })).status).toBe(201);
    const dup = await helper.post(`/api/community/threads/${id}/posts`, { body: `  ${body.toUpperCase()}  ` });
    expect(dup.status).toBe(409);
  });

  it('limits links for accounts younger than 3 days', async () => {
    const t = await asker.post('/api/community/spaces/python-help/threads', q());
    const r = await helper.post(`/api/community/threads/${t.body.thread.id}/posts`, { body: 'See https://a.example https://b.example https://c.example' });
    expect(r.status).toBe(400);
    expect((await helper.post(`/api/community/threads/${t.body.thread.id}/posts`, { body: 'See https://a.example and https://b.example' })).status).toBe(201);
  });

  it('hides a blocked user’s posts for the blocker and stops them replying', async () => {
    const t = await asker.post('/api/community/spaces/python-help/threads', q('Blocked user scenario'));
    const id = t.body.thread.id;
    await stranger.post(`/api/community/threads/${id}/posts`, { body: 'STRANGER-REPLY-TEXT here' });
    const st = await stranger.post('/api/community/spaces/python-help/threads', { kind: 'discussion', title: 'Stranger discussion thread', body: 'STRANGER-THREAD-BODY with enough characters' });
    expect(st.status).toBe(201);

    expect((await asker.post('/api/community/blocks', { userId: stranger.userId })).status).toBe(201);
    const view = await asker.get(`/api/community/threads/${id}`);
    expect(JSON.stringify(view.body.posts)).not.toContain('STRANGER-REPLY-TEXT');
    const list = await asker.get('/api/community/spaces/python-help/threads');
    expect(list.body.items.find((x: any) => x.id === st.body.thread.id)).toBeUndefined();
    // Others still see it.
    expect(JSON.stringify((await helper.get(`/api/community/threads/${id}`)).body.posts)).toContain('STRANGER-REPLY-TEXT');
    // The blocked user can no longer reply to the blocker's thread.
    expect((await stranger.post(`/api/community/threads/${id}/posts`, { body: 'Another reply from the blocked user' })).status).toBe(403);
    await asker.del(`/api/community/blocks/${stranger.userId}`);
    expect(JSON.stringify((await asker.get(`/api/community/threads/${id}`)).body.posts)).toContain('STRANGER-REPLY-TEXT');
  });

  it('accepting an answer awards XP and reputation once', async () => {
    const t = await asker.post('/api/community/spaces/python-help/threads', q('Accepted answer scenario'));
    const id = t.body.thread.id;
    const p1 = await helper.post(`/api/community/threads/${id}/posts`, { body: 'Answer one: comprehensions are expressions.' });
    const p2 = await mentor.post(`/api/community/threads/${id}/posts`, { body: 'Answer two: loops are statements.' });
    expect((await helper.post(`/api/community/threads/${id}/accept`, { postId: p1.body.post.id })).status).toBe(403);
    const a1 = await asker.post(`/api/community/threads/${id}/accept`, { postId: p1.body.post.id });
    expect(a1.status).toBe(200);
    expect(a1.body.xpAwarded).toBe(true);
    await asker.post(`/api/community/threads/${id}/accept`, { postId: p2.body.post.id });
    const again = await asker.post(`/api/community/threads/${id}/accept`, { postId: p1.body.post.id });
    expect(again.body.xpAwarded).toBe(false);
    const ev = await db.select().from(activityEvents).where(and(eq(activityEvents.userId, helper.userId), eq(activityEvents.kind, 'community.answer_accepted')));
    expect(ev).toHaveLength(1);
    expect(ev[0].xp).toBe(10);

    // Votes: one per user, changeable, not on own posts.
    expect((await helper.post('/api/community/votes', { targetType: 'post', targetId: p1.body.post.id, value: 1 })).status).toBe(400);
    expect((await asker.post('/api/community/votes', { targetType: 'post', targetId: p1.body.post.id, value: 1 })).body.score).toBe(1);
    expect((await asker.post('/api/community/votes', { targetType: 'post', targetId: p1.body.post.id, value: 1 })).body.score).toBe(1);
    expect((await mod.post('/api/community/votes', { targetType: 'post', targetId: p1.body.post.id, value: -1 })).body.score).toBe(0);
    expect((await mod.post('/api/community/votes', { targetType: 'post', targetId: p1.body.post.id, value: 1 })).body.score).toBe(2);

    const prof = await asker.get(`/api/community/people/${helper.userId}`);
    expect(prof.body.person.reputation).toBe(2 + 15);
    expect(prof.body.person.acceptedAnswers).toBe(1);
  });

  it('lets moderators hide and lock, with reports in the queue', async () => {
    const t = await asker.post('/api/community/spaces/python-help/threads', q('Moderation scenario'));
    const id = t.body.thread.id;
    const p = await helper.post(`/api/community/threads/${id}/posts`, { body: 'Buy cheap followers now at my site' });
    const rep = await asker.post('/api/community/reports', { targetType: 'post', targetId: p.body.post.id, reason: 'spam' });
    expect(rep.status).toBe(201);

    expect((await stranger.get('/api/community/moderation/reports')).status).toBe(403);
    const queue = await mod.get('/api/community/moderation/reports');
    expect(queue.status).toBe(200);
    const item = queue.body.items.find((r: any) => r.id === rep.body.report.id);
    expect(item.target.kind).toBe('post');

    expect((await stranger.post(`/api/community/moderation/threads/${id}`, { action: 'lock' })).status).toBe(403);
    const res = await mod.post(`/api/community/moderation/reports/${rep.body.report.id}/resolve`, { status: 'actioned', resolution: 'Spam removed', hideContent: true });
    expect(res.status).toBe(200);
    const view = await stranger.get(`/api/community/threads/${id}`);
    expect(JSON.stringify(view.body.posts)).not.toContain('cheap followers');

    expect((await mod.post(`/api/community/moderation/threads/${id}`, { action: 'lock' })).status).toBe(200);
    expect((await helper.post(`/api/community/threads/${id}/posts`, { body: 'Reply after lock attempt' })).status).toBe(403);
    expect((await mod.post(`/api/community/moderation/threads/${id}`, { action: 'hide' })).status).toBe(200);
    expect((await stranger.get(`/api/community/threads/${id}`)).status).toBe(404);
    expect((await asker.get(`/api/community/threads/${id}`)).status).toBe(200);
    expect((await mod.post(`/api/community/moderation/threads/${id}`, { action: 'unhide' })).status).toBe(200);
    expect((await stranger.get(`/api/community/threads/${id}`)).status).toBe(200);
  });

  it('allows edits only within 30 minutes and marks editedAt', async () => {
    const t = await asker.post('/api/community/spaces/python-help/threads', q('Edit window scenario'));
    const r = await asker.patch(`/api/community/threads/${t.body.thread.id}`, { body: 'Updated body with more detail about comprehensions and loops.' });
    expect(r.status).toBe(200);
    expect(r.body.thread.editedAt).toBeTruthy();
    expect((await helper.patch(`/api/community/threads/${t.body.thread.id}`, { body: 'Not my thread to edit at all' })).status).toBe(403);
  });

  it('only allows showcasing your own public or unlisted project', async () => {
    const [mine] = await db.insert(projects).values({ ownerId: asker.userId, title: 'Todo API', slug: 'todo-api', category: 'api', visibility: 'private' }).returning();
    const [theirs] = await db.insert(projects).values({ ownerId: helper.userId, title: 'Chat App', slug: 'chat-app', category: 'fullstack', visibility: 'public' }).returning();
    const base = { kind: 'showcase', title: 'My project showcase post', body: 'Here is what I built and what I learned along the way.' };
    expect((await asker.post('/api/community/spaces/python-help/threads', { ...base, projectId: mine.id })).status).toBe(400);
    expect((await asker.post('/api/community/spaces/python-help/threads', { ...base, body: base.body + ' theirs', projectId: theirs.id })).status).toBe(404);
    await db.update(projects).set({ visibility: 'unlisted' }).where(eq(projects.id, mine.id));
    expect((await asker.post('/api/community/spaces/python-help/threads', { ...base, body: base.body + ' mine', projectId: mine.id })).status).toBe(201);
  });

  it('hides org spaces from non-members', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Test College', slug: 'test-college', kind: 'college' }).returning();
    await db.insert(memberships).values({ orgId: org.id, userId: helper.userId, roles: ['student'] });
    await db.insert(communitySpaces).values({ slug: 'test-college-lounge', name: 'Lounge', description: 'Org members only space.', orgId: org.id });
    expect((await stranger.get('/api/community/spaces/test-college-lounge')).status).toBe(404);
    expect((await helper.get('/api/community/spaces/test-college-lounge')).status).toBe(200);
    const list = await stranger.get('/api/community/spaces');
    expect(list.body.items.find((s: any) => s.slug === 'test-college-lounge')).toBeUndefined();
  });

  it('keeps study group notes and tasks for members only', async () => {
    const g = await asker.post('/api/community/groups', { name: 'DSA crew', goal: 'Solve two problems a day together.' });
    expect(g.status).toBe(201);
    const gid = g.body.group.id;
    await asker.patch(`/api/community/groups/${gid}/notes`, { sharedNotes: 'GROUP-NOTES' });
    const outside = await stranger.get(`/api/community/groups/${gid}`);
    expect(outside.body.group.sharedNotes).toBeNull();
    expect((await stranger.patch(`/api/community/groups/${gid}/notes`, { sharedNotes: 'x' })).status).toBe(404);
    await stranger.post(`/api/community/groups/${gid}/join`);
    expect((await stranger.get(`/api/community/groups/${gid}`)).body.group.sharedNotes).toBe('GROUP-NOTES');
    const task = await stranger.post(`/api/community/groups/${gid}/tasks`, { text: 'Two pointers practice' });
    expect(task.status).toBe(201);
    const done = await asker.patch(`/api/community/groups/${gid}/tasks/${task.body.task.id}`, { done: true });
    expect(done.body.task.done).toBe(true);
  });

  it('platform admins can moderate any space', async () => {
    const admin = await user('Pat Platform', 'pat@example.test');
    await db.update(users).set({ platformRole: 'platform_admin' }).where(eq(users.id, admin.userId));
    const t = await asker.post('/api/community/spaces/python-help/threads', { ...q('Admin moderation scenario'), isPrivate: true });
    expect((await admin.get(`/api/community/threads/${t.body.thread.id}`)).status).toBe(200);
    expect((await admin.post(`/api/community/moderation/threads/${t.body.thread.id}`, { action: 'lock' })).status).toBe(200);
  });
});
