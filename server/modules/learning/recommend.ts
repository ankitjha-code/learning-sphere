import { and, asc, eq, inArray, notInArray, sql, desc } from 'drizzle-orm';
import { db } from '../../db/client';
import { enrollments, topics, topicProgress, tracks, questions, projectTemplates, projects, jobTargets, skillEvidence } from '../../db/schema';
import { computeSkillDna, type SkillDnaEntry } from './skilldna';

export type Recommendation = {
  id: string;
  kind: 'revision' | 'prerequisite' | 'next_topic' | 'practice' | 'project' | 'skip' | 'job_gap' | 'diagnostic';
  title: string;
  reason: string; // why this was recommended, in plain words
  link: string;
  priority: number; // higher first
  skill?: { slug: string; name: string };
  meta?: Record<string, unknown>;
};

function difficultyFor(mastery: number | null) {
  if (mastery === null || mastery < 0.4) return 'easy';
  if (mastery < 0.75) return 'medium';
  return 'hard';
}

/**
 * The learn → practice → build → hire loop. Each recommendation names the evidence
 * that triggered it, so learners can judge it and override it.
 */
export async function recommendationsFor(userId: string, dismissed: string[] = []): Promise<Recommendation[]> {
  const dna = await computeSkillDna(userId);
  const byId = new Map(dna.map((d) => [d.skillId, d]));
  const recs: Recommendation[] = [];
  const now = new Date();

  // 1) Spaced revision that is due.
  const due = await db
    .select({ topicId: topics.id, title: topics.title, trackSlug: tracks.slug, slug: topics.slug, status: topicProgress.status, intervalDays: topicProgress.intervalDays, nextReviewAt: topicProgress.nextReviewAt })
    .from(topicProgress)
    .innerJoin(topics, eq(topics.id, topicProgress.topicId))
    .innerJoin(tracks, eq(tracks.id, topics.trackId))
    .where(and(eq(topicProgress.userId, userId), sql`(${topicProgress.status} = 'needs_revision' OR (${topicProgress.status} = 'completed' AND ${topicProgress.nextReviewAt} <= ${now}))`))
    .orderBy(asc(topicProgress.nextReviewAt))
    .limit(5);
  for (const d of due) {
    recs.push({
      id: `revision:${d.topicId}`,
      kind: 'revision',
      title: `Review: ${d.title}`,
      reason:
        d.status === 'needs_revision'
          ? 'Your last quiz on this topic was below 60%, so it is scheduled again. A quick review now prevents the gap from growing.'
          : `You last reviewed this ${d.intervalDays} day${d.intervalDays === 1 ? '' : 's'} ago. Reviewing at this point is when it sticks best.`,
      link: `/app/learn/${d.trackSlug}/${d.slug}?review=1`,
      priority: d.status === 'needs_revision' ? 95 : 80,
    });
  }

  // 2) Weak skills whose prerequisites are also weak → fix the prerequisite first.
  const weak = dna.filter((d) => d.mastery !== null && d.mastery < 0.6 && d.evidenceCount > 0 && Object.keys(d.bySource).some((s) => s !== 'self'));
  for (const w of weak.slice(0, 6)) {
    const weakPrereq = w.prereqIds.map((id) => byId.get(id)).find((p): p is SkillDnaEntry => !!p && (p.mastery === null || p.mastery < 0.6));
    if (weakPrereq) {
      const [t] = await db.select({ title: topics.title, slug: topics.slug, trackSlug: tracks.slug }).from(topics).innerJoin(tracks, eq(tracks.id, topics.trackId)).where(eq(topics.skillId, weakPrereq.skillId)).limit(1);
      if (t) {
        recs.push({
          id: `prereq:${weakPrereq.skillId}`,
          kind: 'prerequisite',
          title: `Strengthen ${weakPrereq.name} first`,
          reason: `You scored ${Math.round((w.mastery ?? 0) * 100)}% on ${w.name}. ${weakPrereq.name} is a prerequisite ${weakPrereq.mastery === null ? 'with no evidence yet' : `where you are at ${Math.round(weakPrereq.mastery * 100)}%`}, and gaps there usually cause these mistakes.`,
          link: `/app/learn/${t.trackSlug}/${t.slug}`,
          priority: 90,
          skill: { slug: weakPrereq.slug, name: weakPrereq.name },
        });
      }
    }
  }

  // 3) Next topic in each active enrollment (prerequisite order = track order).
  const enrolled = await db
    .select({ e: enrollments, t: tracks })
    .from(enrollments)
    .innerJoin(tracks, eq(tracks.id, enrollments.trackId))
    .where(and(eq(enrollments.userId, userId), eq(enrollments.status, 'active')));
  for (const { e, t } of enrolled) {
    const [next] = await db
      .select({ id: topics.id, title: topics.title, slug: topics.slug, minutes: topics.estimatedMinutes, skillId: topics.skillId })
      .from(topics)
      .leftJoin(topicProgress, and(eq(topicProgress.topicId, topics.id), eq(topicProgress.userId, userId)))
      .where(and(eq(topics.trackId, t.id), sql`coalesce(${topicProgress.status}, 'not_started') <> 'completed'`, e.skippedTopicIds.length ? notInArray(topics.id, e.skippedTopicIds) : undefined))
      .orderBy(asc(topics.sortOrder))
      .limit(1);
    if (next) {
      const s = next.skillId ? byId.get(next.skillId) : undefined;
      if (s && (s.state === 'verified' || (s.mastery ?? 0) >= 0.85)) {
        recs.push({
          id: `skip:${next.id}`,
          kind: 'skip',
          title: `You may already know: ${next.title}`,
          reason: `Your evidence for ${s.name} is ${Math.round((s.mastery ?? 0) * 100)}%. Take the topic quiz to skip it, or skip it from the roadmap.`,
          link: `/app/learn/${t.slug}/${next.slug}?quiz=1`,
          priority: 70,
          skill: { slug: s.slug, name: s.name },
        });
      } else {
        recs.push({
          id: `next:${next.id}`,
          kind: 'next_topic',
          title: next.title,
          reason: `Next in ${t.title} (${e.mode.replace('_', ' ')} mode). About ${next.minutes} minutes.`,
          link: `/app/learn/${t.slug}/${next.slug}`,
          priority: 75,
          meta: { track: t.title, minutes: next.minutes },
        });
      }
    }
  }

  // 4) Practice at the right difficulty for skills being learned.
  const learning = dna.filter((d) => d.state === 'learning' || d.state === 'needs_revision').slice(0, 4);
  for (const l of learning) {
    const diff = difficultyFor(l.mastery);
    const [p] = await db
      .select({ id: questions.id, title: questions.title, slug: questions.slug, difficulty: questions.difficulty })
      .from(questions)
      .where(and(eq(questions.isPractice, true), eq(questions.status, 'active'), sql`${l.skillId} = ANY(${questions.skillIds})`, eq(questions.difficulty, diff)))
      .limit(1);
    if (p) {
      recs.push({
        id: `practice:${p.id}`,
        kind: 'practice',
        title: `Practice: ${p.title}`,
        reason: `${diff === 'easy' ? 'An' : 'A'} ${diff} problem for ${l.name}, matched to your current level (${l.mastery === null ? 'no score yet' : `${Math.round(l.mastery * 100)}%`}). Solving it adds verified evidence.`,
        link: `/app/practice/${p.slug ?? p.id}`,
        priority: 65,
        skill: { slug: l.slug, name: l.name },
      });
    }
  }

  // 5) Demonstrated skills without project evidence → build something.
  const demonstrated = dna.filter((d) => (d.state === 'demonstrated' || d.state === 'verified') && !d.bySource.project);
  if (demonstrated.length) {
    const slugs = demonstrated.map((d) => d.slug);
    const own = await db.select({ templateId: projects.templateId }).from(projects).where(eq(projects.ownerId, userId));
    const ownIds = new Set(own.map((o) => o.templateId));
    const templates = await db.select().from(projectTemplates).where(sql`${projectTemplates.skillSlugs} && ARRAY[${sql.join(slugs.map((x) => sql`${x}`), sql`, `)}]::text[]`).limit(5);
    const pick = templates.find((t) => !ownIds.has(t.id));
    if (pick) {
      const covered = pick.skillSlugs.filter((s) => slugs.includes(s)).map((s) => dna.find((d) => d.slug === s)!.name);
      recs.push({
        id: `project:${pick.id}`,
        kind: 'project',
        title: `Build: ${pick.title}`,
        reason: `You've shown ${covered.join(', ')} in practice but have no project evidence yet. Employers weigh shipped projects heavily.`,
        link: `/app/projects/templates/${pick.slug}`,
        priority: 60,
      });
    }
  }

  // 6) Gaps against saved job targets.
  const targets = await db.select().from(jobTargets).where(eq(jobTargets.userId, userId)).orderBy(desc(jobTargets.createdAt)).limit(3);
  for (const jt of targets) {
    const missing = jt.extractedSkills.filter((s) => s.required).filter((s) => {
      const d = dna.find((x) => x.slug === s.slug);
      return !d || d.mastery === null || d.mastery < 0.6;
    });
    if (missing.length) {
      recs.push({
        id: `jobgap:${jt.id}`,
        kind: 'job_gap',
        title: `Close ${missing.length} gap${missing.length > 1 ? 's' : ''} for ${jt.title}`,
        reason: `The job description requires ${missing.slice(0, 3).map((m) => m.name).join(', ')}${missing.length > 3 ? '…' : ''}, where you have little or no evidence yet.`,
        link: `/app/career/targets/${jt.id}`,
        priority: 55,
      });
    }
  }

  // 7) No assessment evidence at all → take a diagnostic.
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(skillEvidence).where(and(eq(skillEvidence.userId, userId), inArray(skillEvidence.source, ['assessment', 'practice'])));
  if (n === 0 && enrolled.length) {
    recs.push({
      id: 'diagnostic',
      kind: 'diagnostic',
      title: 'Take a 10-minute diagnostic',
      reason: 'You have no graded evidence yet. A short diagnostic finds what you already know so your roadmap can skip it.',
      link: '/app/assessments?mode=diagnostic',
      priority: 85,
    });
  }

  return recs.filter((r) => !dismissed.includes(r.id)).sort((a, b) => b.priority - a.priority);
}

