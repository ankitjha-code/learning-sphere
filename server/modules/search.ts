import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq, inArray, isNull, or, sql, desc } from 'drizzle-orm';
import { db } from '../db/client';
import {
  tracks,
  topics,
  resources,
  questions,
  notes,
  projects,
  applications,
  resumes,
  threads,
  communitySpaces,
  mentorProfiles,
  users,
  jobPostings,
  organizations,
  externalJobs,
  assessments,
  assessmentInvites,
} from '../db/schema';
import { type AppEnv, requireAuth } from '../lib/context';
import { query } from '../lib/validate';

export const searchRoutes = new Hono<AppEnv>();

export type SearchHit = { type: string; id: string; title: string; subtitle?: string; url: string };

/**
 * One query across every resource type, filtered to what the user may see.
 * Each source applies its own authorization rule; nothing is searched first and
 * filtered afterwards.
 */
searchRoutes.get('/', async (c) => {
  const auth = requireAuth(c);
  const { q, types } = query(c, z.object({ q: z.string().trim().min(2).max(100), types: z.string().max(200).optional() }));
  const like = `%${q.replace(/[%_\\]/g, (m) => '\\' + m)}%`;
  const orgIds = auth.memberships.map((m) => m.orgId);
  const uid = auth.user.id;
  const want = types ? new Set(types.split(',')) : null;
  const on = (t: string) => !want || want.has(t);
  const orgScope = <T extends { orgId: unknown }>(col: T['orgId']) =>
    orgIds.length ? or(isNull(col as never), inArray(col as never, orgIds)) : isNull(col as never);

  const tasks: Promise<SearchHit[]>[] = [];

  if (on('track'))
    tasks.push(
      db
        .select({ id: tracks.id, title: tracks.title, slug: tracks.slug, category: tracks.category })
        .from(tracks)
        .where(and(eq(tracks.status, 'published'), orgScope(tracks.orgId), or(sql`${tracks.title} ilike ${like}`, sql`${tracks.summary} ilike ${like}`, sql`array_to_string(${tracks.roles}, ',') ilike ${like}`)))
        .limit(5)
        .then((r) => r.map((x) => ({ type: 'track', id: x.id, title: x.title, subtitle: `Roadmap · ${x.category}`, url: `/app/learn/${x.slug}` }))),
    );

  if (on('topic'))
    tasks.push(
      db
        .select({ id: topics.id, title: topics.title, slug: topics.slug, trackSlug: tracks.slug, trackTitle: tracks.title })
        .from(topics)
        .innerJoin(tracks, eq(tracks.id, topics.trackId))
        .where(and(eq(tracks.status, 'published'), orgScope(tracks.orgId), or(sql`${topics.title} ilike ${like}`, sql`${topics.body} ilike ${like}`)))
        .limit(6)
        .then((r) => r.map((x) => ({ type: 'topic', id: x.id, title: x.title, subtitle: x.trackTitle, url: `/app/learn/${x.trackSlug}/${x.slug}` }))),
    );

  if (on('resource'))
    tasks.push(
      db
        .select({ id: resources.id, title: resources.title, kind: resources.kind, source: resources.sourceName })
        .from(resources)
        .where(
          and(
            eq(resources.status, 'published'),
            orgScope(resources.orgId),
            or(sql`to_tsvector('english', ${resources.title} || ' ' || ${resources.summary} || ' ' || coalesce(${resources.body}, '')) @@ plainto_tsquery('english', ${q})`, sql`${resources.title} ilike ${like}`, sql`array_to_string(${resources.topics}, ',') ilike ${like}`),
          ),
        )
        .limit(6)
        .then((r) => r.map((x) => ({ type: 'resource', id: x.id, title: x.title, subtitle: [x.kind, x.source].filter(Boolean).join(' · '), url: `/app/library/${x.id}` }))),
    );

  if (on('problem'))
    tasks.push(
      db
        .select({ id: questions.id, title: questions.title, slug: questions.slug, difficulty: questions.difficulty, type: questions.type })
        .from(questions)
        .where(and(eq(questions.isPractice, true), eq(questions.status, 'active'), orgScope(questions.orgId), or(sql`${questions.title} ilike ${like}`, sql`array_to_string(${questions.topics}, ',') ilike ${like}`)))
        .limit(6)
        .then((r) => r.map((x) => ({ type: 'problem', id: x.id, title: x.title, subtitle: `${x.type === 'sql' ? 'SQL' : 'Coding'} · ${x.difficulty}`, url: `/app/practice/${x.slug ?? x.id}` }))),
    );

  if (on('assessment'))
    tasks.push(
      db
        .selectDistinct({ id: assessments.id, title: assessments.title, mode: assessments.mode })
        .from(assessments)
        .leftJoin(assessmentInvites, and(eq(assessmentInvites.assessmentId, assessments.id), eq(assessmentInvites.userId, uid)))
        .where(
          and(
            eq(assessments.status, 'published'),
            sql`${assessments.title} ilike ${like}`,
            or(and(inArray(assessments.mode, ['practice', 'diagnostic']), orgScope(assessments.orgId)), sql`${assessmentInvites.id} is not null`),
          ),
        )
        .limit(4)
        .then((r) => r.map((x) => ({ type: 'assessment', id: x.id, title: x.title, subtitle: `Assessment · ${x.mode}`, url: `/app/assessments/${x.id}` }))),
    );

  if (on('note'))
    tasks.push(
      db
        .select({ id: notes.id, title: notes.title })
        .from(notes)
        .where(and(eq(notes.userId, uid), or(sql`${notes.title} ilike ${like}`, sql`${notes.body} ilike ${like}`)))
        .orderBy(desc(notes.updatedAt))
        .limit(5)
        .then((r) => r.map((x) => ({ type: 'note', id: x.id, title: x.title, subtitle: 'Your note', url: `/app/workspace?note=${x.id}` }))),
    );

  if (on('project'))
    tasks.push(
      db
        .select({ id: projects.id, title: projects.title, ownerId: projects.ownerId, visibility: projects.visibility })
        .from(projects)
        .where(and(or(eq(projects.ownerId, uid), sql`exists (select 1 from project_members pm where pm.project_id = ${projects.id} and pm.user_id = ${uid})`), sql`${projects.title} ilike ${like}`))
        .limit(5)
        .then((r) => r.map((x) => ({ type: 'project', id: x.id, title: x.title, subtitle: 'Project', url: `/app/projects/${x.id}` }))),
    );

  if (on('application'))
    tasks.push(
      db
        .select({ id: applications.id, company: applications.company, role: applications.role, status: applications.status })
        .from(applications)
        .where(and(eq(applications.userId, uid), or(sql`${applications.company} ilike ${like}`, sql`${applications.role} ilike ${like}`)))
        .limit(5)
        .then((r) => r.map((x) => ({ type: 'application', id: x.id, title: `${x.role} at ${x.company}`, subtitle: `Application · ${x.status}`, url: `/app/career/applications?open=${x.id}` }))),
    );

  if (on('resume'))
    tasks.push(
      db
        .select({ id: resumes.id, title: resumes.title })
        .from(resumes)
        .where(and(eq(resumes.userId, uid), sql`${resumes.title} ilike ${like}`))
        .limit(3)
        .then((r) => r.map((x) => ({ type: 'resume', id: x.id, title: x.title, subtitle: 'Resume', url: `/app/career/resumes/${x.id}` }))),
    );

  if (on('thread'))
    tasks.push(
      db
        .select({ id: threads.id, title: threads.title, space: communitySpaces.name })
        .from(threads)
        .innerJoin(communitySpaces, eq(communitySpaces.id, threads.spaceId))
        .where(
          and(
            or(sql`${threads.title} ilike ${like}`, sql`${threads.body} ilike ${like}`),
            or(eq(threads.isPrivate, false), eq(threads.authorId, uid)),
            sql`${threads.status} <> 'hidden'`,
            or(eq(communitySpaces.visibility, 'public'), sql`exists (select 1 from space_members sm where sm.space_id = ${communitySpaces.id} and sm.user_id = ${uid})`),
            orgScope(communitySpaces.orgId),
          ),
        )
        .limit(5)
        .then((r) => r.map((x) => ({ type: 'thread', id: x.id, title: x.title, subtitle: x.space, url: `/app/community/t/${x.id}` }))),
    );

  if (on('mentor'))
    tasks.push(
      db
        .select({ id: mentorProfiles.userId, name: users.name, headline: mentorProfiles.headline })
        .from(mentorProfiles)
        .innerJoin(users, eq(users.id, mentorProfiles.userId))
        .where(and(eq(mentorProfiles.status, 'active'), or(sql`${users.name} ilike ${like}`, sql`${mentorProfiles.headline} ilike ${like}`, sql`array_to_string(${mentorProfiles.expertise}, ',') ilike ${like}`)))
        .limit(4)
        .then((r) => r.map((x) => ({ type: 'mentor', id: x.id, title: x.name, subtitle: x.headline, url: `/app/mentors/${x.id}` }))),
    );

  if (on('job'))
    tasks.push(
      Promise.all([
        db
          .select({ id: jobPostings.id, title: jobPostings.title, company: organizations.name, location: jobPostings.location, campusOnly: jobPostings.campusOnly })
          .from(jobPostings)
          .innerJoin(organizations, eq(organizations.id, jobPostings.orgId))
          .where(and(eq(jobPostings.status, 'published'), eq(jobPostings.campusOnly, false), or(sql`${jobPostings.title} ilike ${like}`, sql`${organizations.name} ilike ${like}`)))
          .limit(4),
        db
          .select({ id: externalJobs.id, title: externalJobs.title, company: externalJobs.company, source: externalJobs.source })
          .from(externalJobs)
          .where(or(sql`${externalJobs.title} ilike ${like}`, sql`${externalJobs.company} ilike ${like}`))
          .limit(4),
      ]).then(([own, ext]) => [
        ...own.map((x) => ({ type: 'job', id: x.id, title: x.title, subtitle: `${x.company} · ${x.location}`, url: `/app/jobs/${x.id}` })),
        ...ext.map((x) => ({ type: 'job', id: x.id, title: x.title, subtitle: `${x.company} · via ${x.source}`, url: `/app/jobs/external/${x.id}` })),
      ]),
    );

  const settled = await Promise.allSettled(tasks);
  const results = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
  return c.json({ results, partial: settled.some((s) => s.status === 'rejected') });
});
