/**
 * Readiness / gap analysis of a skill list against Skill DNA.
 * The score formula is deliberately simple and shown to the user verbatim.
 */
import { and, count, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  skills,
  topics,
  tracks,
  questions,
  projectTemplates,
  projects,
  portfolios,
  resumes,
  interviewPractice,
  careerDocuments,
  mockInterviews,
} from '../../db/schema';
import type { SkillDnaEntry } from '../learning/skilldna';

export type GapStatus = 'verified' | 'demonstrated' | 'learning' | 'self_reported' | 'none';

export const STATUS_POINTS: Record<GapStatus, number> = { verified: 1, demonstrated: 0.75, learning: 0.35, self_reported: 0.15, none: 0 };
export const REQUIRED_WEIGHT = 2;
export const PREFERRED_WEIGHT = 1;

export const READINESS_FORMULA = {
  text: 'Readiness = sum(weight x points) / sum(weight) x 100. Weight: required skill 2, preferred skill 1. Points: verified 1.0, demonstrated 0.75, learning 0.35, self-reported 0.15, no evidence 0.',
  points: STATUS_POINTS,
  weights: { required: REQUIRED_WEIGHT, preferred: PREFERRED_WEIGHT },
  note: 'This is an estimate of how much evidence you have for the listed skills. It is not a prediction of hiring outcomes.',
};

const SOURCE_LABEL: Record<string, string> = {
  self: 'self-rating',
  assessment: 'graded assessment',
  practice: 'CodeLab tests',
  project: 'project',
  review: 'reviewer',
  course: 'topic quiz',
  mentor: 'mentor',
};

export function skillStatus(d: SkillDnaEntry | undefined): { status: GapStatus; revisionDue: boolean; evidence: string; lastEvidenceAt: string | null } {
  if (!d) return { status: 'none', revisionDue: false, evidence: 'No evidence yet', lastEvidenceAt: null };
  const evidence = Object.entries(d.bySource)
    .map(([src, v]) => `${SOURCE_LABEL[src] ?? src} x${v.count}`)
    .join(', ');
  let status: GapStatus;
  switch (d.state) {
    case 'verified':
      status = 'verified';
      break;
    case 'demonstrated':
      status = 'demonstrated';
      break;
    case 'needs_revision':
      status = d.verified ? 'verified' : 'demonstrated';
      break;
    case 'learning':
      status = 'learning';
      break;
    case 'self_declared':
      status = 'self_reported';
      break;
    default:
      status = 'none';
  }
  return { status, revisionDue: d.state === 'needs_revision', evidence: evidence || 'No evidence yet', lastEvidenceAt: d.lastEvidenceAt };
}

export type SkillRow = { slug: string; name: string; required: boolean; status: GapStatus; revisionDue: boolean; evidence: string; lastEvidenceAt: string | null; points: number; weight: number; aiSuggested?: boolean };

export function scoreSkills(list: { slug: string; name: string; required: boolean }[], dna: SkillDnaEntry[]): { score: number | null; rows: SkillRow[] } {
  const bySlug = new Map(dna.map((d) => [d.slug, d]));
  let num = 0;
  let den = 0;
  const rows = list.map((s) => {
    const st = skillStatus(bySlug.get(s.slug));
    const weight = s.required ? REQUIRED_WEIGHT : PREFERRED_WEIGHT;
    const points = STATUS_POINTS[st.status];
    num += weight * points;
    den += weight;
    return { slug: s.slug, name: s.name, required: s.required, ...st, points, weight };
  });
  return { score: den ? Math.round((num / den) * 100) : null, rows };
}

/** Advisory match explanation for a candidate viewing a posting. Uses only skills and evidence. */
export function matchExplanation(required: { slug: string; name: string; required: boolean }[], dna: SkillDnaEntry[]) {
  const { score, rows } = scoreSkills(required, dna);
  const factors = rows.map((r) => ({
    label: `${r.name}${r.required ? '' : ' (preferred)'}`,
    met: r.status === 'verified' || r.status === 'demonstrated',
    evidence: r.status === 'none' ? 'No evidence yet' : `${r.status.replace('_', '-')}: ${r.evidence}`,
    status: r.status,
    required: r.required,
  }));
  return {
    score: score ?? 0,
    hasSkills: rows.length > 0,
    factors,
    missing: rows.filter((r) => r.required && (r.status === 'none' || r.status === 'self_reported')).map((r) => r.name),
    note: 'Advisory only: based on the skills listed in the posting and the evidence in your Skill DNA. Personal characteristics are never used.',
  };
}

const NEEDS_WORK: GapStatus[] = ['none', 'self_reported', 'learning'];

export async function buildPlan(rows: SkillRow[]) {
  const gaps = rows.filter((r) => NEEDS_WORK.includes(r.status)).sort((a, b) => Number(b.required) - Number(a.required));
  const slugs = gaps.map((g) => g.slug);
  if (!slugs.length) return { gaps: [], topics: [], practice: [], projects: [] };
  const skillRows = await db.select({ id: skills.id, slug: skills.slug }).from(skills).where(inArray(skills.slug, slugs));
  const idBySlug = new Map(skillRows.map((s) => [s.slug, s.id]));
  const ids = skillRows.map((s) => s.id);
  const [topicRows, practiceRows, templateRows] = ids.length
    ? await Promise.all([
        db
          .select({ id: topics.id, title: topics.title, slug: topics.slug, skillId: topics.skillId, trackSlug: tracks.slug, trackTitle: tracks.title, minutes: topics.estimatedMinutes })
          .from(topics)
          .innerJoin(tracks, eq(tracks.id, topics.trackId))
          .where(and(inArray(topics.skillId, ids), eq(tracks.status, 'published'), sql`${tracks.orgId} IS NULL`))
          .orderBy(topics.sortOrder)
          .limit(60),
        db
          .select({ id: questions.id, slug: questions.slug, title: questions.title, difficulty: questions.difficulty, type: questions.type, skillIds: questions.skillIds })
          .from(questions)
          .where(and(eq(questions.isPractice, true), eq(questions.status, 'active'), sql`${questions.skillIds} && ARRAY[${sql.join(ids.map((i) => sql`${i}`), sql`, `)}]::uuid[]`))
          .limit(60),
        db
          .select({ slug: projectTemplates.slug, title: projectTemplates.title, skillSlugs: projectTemplates.skillSlugs, difficulty: projectTemplates.difficulty, estimatedHours: projectTemplates.estimatedHours })
          .from(projectTemplates)
          .where(sql`${projectTemplates.skillSlugs} && ARRAY[${sql.join(slugs.map((x) => sql`${x}`), sql`, `)}]::text[]`)
          .limit(30),
      ])
    : [[], [], []];
  const topicOut: { skill: string; title: string; trackTitle: string; minutes: number; link: string }[] = [];
  const practiceOut: { skill: string; title: string; difficulty: string; kind: string; link: string }[] = [];
  for (const g of gaps) {
    const id = idBySlug.get(g.slug);
    if (!id) continue;
    for (const t of topicRows.filter((t) => t.skillId === id).slice(0, 2))
      topicOut.push({ skill: g.name, title: t.title, trackTitle: t.trackTitle, minutes: t.minutes, link: `/app/learn/${t.trackSlug}/${t.slug}` });
    for (const q of practiceRows.filter((q) => q.skillIds.includes(id)).slice(0, 2))
      practiceOut.push({ skill: g.name, title: q.title, difficulty: q.difficulty, kind: q.type === 'sql' ? 'SQL' : 'Coding', link: `/app/practice/${q.slug ?? q.id}` });
  }
  const projectsOut = templateRows
    .map((t) => ({ ...t, covers: t.skillSlugs.filter((s) => slugs.includes(s)) }))
    .sort((a, b) => b.covers.length - a.covers.length)
    .slice(0, 3)
    .map((t) => ({ title: t.title, difficulty: t.difficulty, estimatedHours: t.estimatedHours, covers: t.covers.map((s) => gaps.find((g) => g.slug === s)?.name ?? s), link: `/app/projects/templates/${t.slug}` }));
  return {
    gaps: gaps.map((g) => ({ slug: g.slug, name: g.name, required: g.required, status: g.status })),
    topics: topicOut.slice(0, 12),
    practice: practiceOut.slice(0, 10),
    projects: projectsOut,
  };
}

export type ChecklistItem = { id: string; label: string; done: boolean; hint: string; link: string };

export async function readinessChecklist(userId: string, target: { title: string }, rows: SkillRow[]): Promise<ChecklistItem[]> {
  const [tailored, anyResume, portfolio, completedProjects, behavioral, mocks, covers] = await Promise.all([
    db.select({ n: count() }).from(resumes).where(and(eq(resumes.userId, userId), ilike(resumes.targetRole, target.title.replace(/[%_\\]/g, (m) => `\\${m}`)))),
    db.select({ n: count() }).from(resumes).where(eq(resumes.userId, userId)),
    db.select({ visibility: portfolios.visibility }).from(portfolios).where(eq(portfolios.userId, userId)),
    db.select({ n: count() }).from(projects).where(and(eq(projects.ownerId, userId), eq(projects.status, 'completed'))),
    db.select({ feedback: interviewPractice.feedback }).from(interviewPractice).where(and(eq(interviewPractice.userId, userId), eq(interviewPractice.kind, 'behavioral'))).orderBy(desc(interviewPractice.createdAt)).limit(50),
    db.select({ n: count() }).from(mockInterviews).where(and(eq(mockInterviews.userId, userId), eq(mockInterviews.status, 'completed'))),
    db.select({ n: count() }).from(careerDocuments).where(and(eq(careerDocuments.userId, userId), eq(careerDocuments.kind, 'cover_letter'))),
  ]);
  const starStories = behavioral.filter((b) => (b.feedback?.items ?? []).filter((i) => i.met && /^(Situation|Task|Action|Result)/.test(i.label)).length >= 3).length;
  const requiredRows = rows.filter((r) => r.required);
  const requiredCovered = requiredRows.every((r) => r.status !== 'none' && r.status !== 'self_reported');
  return [
    { id: 'resume', label: 'Resume created', done: anyResume[0].n > 0, hint: 'Build a resume from your real experience and projects.', link: '/app/career/resumes' },
    { id: 'tailored', label: `Resume tailored for "${target.title}"`, done: tailored[0].n > 0, hint: 'Make a tailored copy that orders your existing content around this role.', link: '/app/career/resumes' },
    { id: 'skills', label: 'Every required skill has some evidence', done: requiredRows.length > 0 && requiredCovered, hint: 'Practise or learn the required skills listed below until each has evidence beyond a self-rating.', link: '/app/skills' },
    { id: 'project', label: 'At least one completed project', done: completedProjects[0].n > 0, hint: 'A finished project gives interviewers something concrete to discuss.', link: '/app/projects' },
    { id: 'portfolio', label: 'Portfolio shareable (public or unlisted)', done: !!portfolio[0] && portfolio[0].visibility !== 'private', hint: 'Make your portfolio shareable so recruiters can see your evidence.', link: '/app/portfolio' },
    { id: 'star', label: 'Two STAR stories practised', done: starStories >= 2, hint: 'Practise behavioral answers until the STAR checklist is mostly met.', link: '/app/career/interview?kind=behavioral' },
    { id: 'mock', label: 'One mock interview completed', done: mocks[0].n > 0, hint: 'Run a timed mock interview to practise under time pressure.', link: '/app/career/interview?tab=mock' },
    { id: 'cover', label: 'Cover letter drafted', done: covers[0].n > 0, hint: 'Draft a cover letter from your own facts; placeholders show what is missing.', link: '/app/career/documents?new=cover_letter' },
  ];
}
