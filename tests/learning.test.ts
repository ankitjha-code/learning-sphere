import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { setupTestApp, registerUser } from './helpers';
import { seedReference } from '../server/db/seed/reference';
import { db } from '../server/db/client';
import { questions, topics, tracks } from '../server/db/schema';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => {
  ctx = await setupTestApp();
  await seedReference();
});
afterAll(async () => ctx.close());

/** Builds correct answers from the (server-side) answer key, as a learner who studied would. */
async function correctAnswers(topicId: string) {
  const [t] = await db.select().from(topics).where(eq(topics.id, topicId));
  const qs = await db.select().from(questions).where(inArray(questions.id, t.quizQuestionIds!));
  const answers: Record<string, unknown> = {};
  for (const q of qs) {
    if (q.type === 'single' || q.type === 'true_false') answers[q.id] = { choice: q.answerKey.correct![0] };
    else if (q.type === 'multi') answers[q.id] = { choices: q.answerKey.correct };
    else if (q.type === 'fill_blank') answers[q.id] = { blanks: q.answerKey.accepted!.map((a) => a[0]) };
    else if (q.type === 'matching') answers[q.id] = { matches: q.answerKey.matches };
  }
  return answers;
}

describe('learning loop: onboarding → roadmap → quiz → Skill DNA → revision', () => {
  it('generates an editable plan from onboarding answers', async () => {
    const c = await registerUser(ctx.app, 'Lena Cruz', 'lena@example.test');
    const r = await c.post('/api/me/onboarding', {
      stage: 'career_switcher',
      targetRoles: ['Backend Developer'],
      weeklyHours: 6,
      learningStyle: 'guided',
      selfRatedSkills: [{ slug: 'programming-basics', level: 4 }],
    });
    expect(r.status).toBe(200);
    expect(r.body.plan.tracks.length).toBeGreaterThan(0);
    expect(r.body.plan.tracks[0].reason).toMatch(/Backend Developer/);
    const me = await c.get('/api/auth/me');
    expect(me.body.onboarded).toBe(true);
    const goals = await c.get('/api/learning/goals');
    expect(goals.body.goals.some((g: any) => g.kind === 'career')).toBe(true);

    // Self-rating is recorded but never verified.
    const dna = await c.get('/api/learning/skills');
    const basics = dna.body.skills.find((s: any) => s.slug === 'programming-basics');
    expect(basics.state).toBe('self_declared');
    expect(basics.verified).toBe(false);
  });

  it('does not reveal answer keys when serving a topic', async () => {
    const c = await registerUser(ctx.app, 'Quiz Peeker', 'peek@example.test');
    const r = await c.get('/api/learning/tracks/programming-foundations-python/topics/how-programs-run');
    expect(r.status).toBe(200);
    const raw = JSON.stringify(r.body.quiz);
    expect(raw).not.toContain('correct');
    expect(raw).not.toContain('accepted');
    expect(raw).not.toContain('explanation');
  });

  it('grades a quiz deterministically, completes the topic once, schedules revision and records evidence', async () => {
    const c = await registerUser(ctx.app, 'Theo Park', 'theo@example.test');
    await c.post('/api/learning/tracks/programming-foundations-python/enroll', { mode: 'guided', weeklyMinutes: 300 });
    const topic = await c.get('/api/learning/tracks/programming-foundations-python/topics/how-programs-run');
    const topicId = topic.body.topic.id;

    // A wrong attempt does not complete the topic.
    const wrong = await c.post(`/api/learning/topics/${topicId}/quiz`, { answers: {} });
    expect(wrong.body.passed).toBe(false);
    expect(wrong.body.status).toBe('in_progress');

    const right = await c.post(`/api/learning/topics/${topicId}/quiz`, { answers: await correctAnswers(topicId) });
    expect(right.body.ratio).toBe(1);
    expect(right.body.passed).toBe(true);
    expect(right.body.status).toBe('completed');
    expect(new Date(right.body.nextReviewAt).getTime()).toBeGreaterThan(Date.now());

    // XP is granted once, even if the quiz is passed again.
    await c.post(`/api/learning/topics/${topicId}/quiz`, { answers: await correctAnswers(topicId) });
    const dash = await c.get('/api/learning/dashboard');
    expect(dash.body.xp).toBe(20);

    const skill = await c.get('/api/learning/skills/programming-basics');
    expect(skill.body.evidence.some((e: any) => e.source === 'course' && e.verified === false)).toBe(true);
    expect(skill.body.dna.mastery).toBeGreaterThan(0.5);
  });

  it('a failed review marks the topic for revision and explains the recommendation', async () => {
    const c = await registerUser(ctx.app, 'Ivy Long', 'ivy@example.test');
    await c.post('/api/learning/tracks/programming-foundations-python/enroll', { mode: 'guided' });
    const topic = await c.get('/api/learning/tracks/programming-foundations-python/topics/how-programs-run');
    const topicId = topic.body.topic.id;
    await c.post(`/api/learning/topics/${topicId}/quiz`, { answers: await correctAnswers(topicId) });
    const review = await c.post(`/api/learning/topics/${topicId}/quiz`, { answers: {}, review: true });
    expect(review.body.status).toBe('needs_revision');
    expect(review.body.intervalDays).toBe(1);

    const rev = await c.get('/api/learning/revision');
    expect(rev.body.due.some((r: any) => r.topicId === topicId)).toBe(true);
    const recs = await c.get('/api/learning/recommendations');
    const revisionRec = recs.body.recommendations.find((r: any) => r.kind === 'revision');
    expect(revisionRec.reason).toMatch(/below 60%/);

    const dismissed = await c.post('/api/learning/recommendations/dismiss', { id: revisionRec.id });
    expect(dismissed.status).toBe(200);
    const after = await c.get('/api/learning/recommendations');
    expect(after.body.recommendations.some((r: any) => r.id === revisionRec.id)).toBe(false);
  });

  it('requires a real reflection to complete topics without a quiz', async () => {
    const c = await registerUser(ctx.app, 'Noor Ali', 'noor@example.test');
    const [t] = await db.select().from(tracks).where(eq(tracks.slug, 'programming-foundations-python'));
    const [noQuiz] = await db.insert(topics).values({ trackId: t.id, slug: 'temp-no-quiz', title: 'Temp', sortOrder: 99, body: 'x' }).returning();
    const short = await c.post(`/api/learning/topics/${noQuiz.id}/complete`, { reflection: 'too short' });
    expect(short.status).toBe(400);
    const ok = await c.post(`/api/learning/topics/${noQuiz.id}/complete`, { reflection: 'I learned how the interpreter executes statements in order and how input is text.' });
    expect(ok.status).toBe(200);
  });

  it('global search returns only authorized content', async () => {
    const c = await registerUser(ctx.app, 'Searcher', 'search@example.test');
    const r = await c.get('/api/search?q=python');
    expect(r.status).toBe(200);
    expect(r.body.results.some((x: any) => x.type === 'track')).toBe(true);
    const unauth = await ctx.app.request('/api/search?q=python');
    expect(unauth.status).toBe(401);
  });
});

describe('recommendation engine paths that use array filters', () => {
  it('skips skipped topics and suggests a project once skills are demonstrated', async () => {
    const c = await registerUser(ctx.app, 'Rec Paths', 'recpaths@example.test');
    const enrolled = await c.post('/api/learning/tracks/programming-foundations-python/enroll', { mode: 'guided' });
    const track = await c.get('/api/learning/tracks/programming-foundations-python');
    const first = track.body.topics[0];
    await c.patch(`/api/learning/enrollments/${enrolled.body.enrollment.id}`, { skipTopicId: first.id });
    const recs = await c.get('/api/learning/recommendations');
    expect(recs.status).toBe(200);
    const next = recs.body.recommendations.find((r: any) => r.kind === 'next_topic');
    expect(next.link).not.toContain(first.slug);

    // Demonstrate a skill used by project templates, then expect a build suggestion.
    const { addEvidence } = await import('../server/modules/learning/skilldna');
    const { skills } = await import('../server/db/schema');
    const [py] = await db.select().from(skills).where(eq(skills.slug, 'python'));
    await addEvidence({ userId: c.userId, skillId: py.id, source: 'practice', sourceType: 'code_submission', sourceId: 'x', score: 1, verified: true });
    const recs2 = await c.get('/api/learning/recommendations');
    expect(recs2.status).toBe(200);
    expect(recs2.body.recommendations.some((r: any) => r.kind === 'project')).toBe(true);
  });
});

describe('partial updates never overwrite stored values with defaults', () => {
  it('keeps the learning mode when skipping a topic, and note tags when renaming a note', async () => {
    const c = await registerUser(ctx.app, 'Patch Safe', 'patchsafe@example.test');
    const e = await c.post('/api/learning/tracks/programming-foundations-python/enroll', { mode: 'interview', weeklyMinutes: 240 });
    const track = await c.get('/api/learning/tracks/programming-foundations-python');
    const r = await c.patch(`/api/learning/enrollments/${e.body.enrollment.id}`, { skipTopicId: track.body.topics[1].id });
    expect(r.body.enrollment.mode).toBe('interview');
    expect(r.body.enrollment.weeklyMinutes).toBe(240);

    const note = await c.post('/api/workspace/notes', { title: 'Recursion', body: 'Base case first.', tags: ['dsa', 'review'] });
    expect(note.status).toBeLessThan(300);
    const id = note.body.note.id;
    const renamed = await c.patch(`/api/workspace/notes/${id}`, { title: 'Recursion basics' });
    expect(renamed.body.note.tags).toEqual(['dsa', 'review']);
  });
});

describe('correlated count subqueries bind to the outer row', () => {
  it('reports the real topic count for every roadmap', async () => {
    const c = await registerUser(ctx.app, 'Count Checker', 'counts@example.test');
    const r = await c.get('/api/learning/tracks');
    expect(r.status).toBe(200);
    const all = await db.select({ trackId: topics.trackId }).from(topics);
    const expected = new Map<string, number>();
    for (const t of all) expected.set(t.trackId, (expected.get(t.trackId) ?? 0) + 1);
    expect(r.body.tracks.length).toBeGreaterThan(0);
    for (const t of r.body.tracks) expect(t.topicCount).toBe(expected.get(t.id) ?? 0);
    expect(r.body.tracks.some((t: any) => t.topicCount > 0)).toBe(true);
  });
});
