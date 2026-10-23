import { Hono } from 'hono';
import { z } from 'zod';
import { and, arrayContains, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, not, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  notes,
  tasks,
  savedLinks,
  bookmarks,
  topics,
  tracks,
  assignments,
  cohortMembers,
  assessmentInvites,
  assessments,
  interviews,
  mentorships,
  mentorSessions,
  projects,
  projectMilestones,
} from '../../db/schema';
import { type AppEnv, requireAuth } from '../../lib/context';
import { body, idParam, parse, query, patchSchema } from '../../lib/validate';
import { badRequest, notFound } from '../../lib/errors';
import { rateLimit } from '../../lib/ratelimit';
import { readMultipart, fileBuffer } from '../files/routes';
import { sanitizeFilename, extensionOf } from '../files/service';
import { buildZip } from './zip';

/** Mounted at /api/workspace. */
export const workspaceRoutes = new Hono<AppEnv>();

const KNOWLEDGE_TAG = 'knowledge';
const LINK_TYPES = ['topic', 'resource', 'project', 'problem', 'file', 'track', 'assignment', 'application'] as const;
const escapeLike = (s: string) => s.replace(/[%_\\]/g, (m) => '\\' + m);
const httpUrl = z
  .string()
  .trim()
  .url('Enter a full URL starting with https://')
  .max(2000)
  .refine((u) => /^https?:\/\//i.test(u), 'Only http(s) links can be saved.');

const tagList = z
  .array(z.string().trim().toLowerCase().min(1).max(40))
  .max(20)
  .transform((t) => [...new Set(t)]);

// ======================================================================
// Notes
// ======================================================================

const noteInput = z.object({
  title: z.string().trim().min(1, 'Give the note a title.').max(200),
  body: z.string().max(100_000, 'Notes are limited to 100,000 characters.').default(''),
  tags: tagList.default([]),
  pinned: z.boolean().default(false),
  linkType: z.enum(LINK_TYPES).nullable().optional(),
  linkId: z.string().trim().max(200).nullable().optional(),
  linkLabel: z.string().trim().max(200).nullable().optional(),
});

workspaceRoutes.get('/notes', async (c) => {
  const auth = requireAuth(c);
  const q = query(
    c,
    z.object({
      q: z.string().trim().max(200).optional(),
      tag: z.string().trim().toLowerCase().max(40).optional(),
      linkType: z.string().max(30).optional(),
      linkId: z.string().max(200).optional(),
      pinned: z.enum(['true', 'false']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }),
  );
  const like = q.q ? `%${escapeLike(q.q)}%` : null;
  const where = and(
    eq(notes.userId, auth.user.id),
    // Knowledge-base documents live in the library page unless asked for explicitly.
    q.tag ? arrayContains(notes.tags, [q.tag]) : not(arrayContains(notes.tags, [KNOWLEDGE_TAG])),
    q.linkType ? eq(notes.linkType, q.linkType) : undefined,
    q.linkId ? eq(notes.linkId, q.linkId) : undefined,
    q.pinned ? eq(notes.pinned, q.pinned === 'true') : undefined,
    like ? or(sql`${notes.title} ilike ${like}`, sql`${notes.body} ilike ${like}`) : undefined,
  );
  const rows = await db
    .select({
      id: notes.id,
      title: notes.title,
      tags: notes.tags,
      pinned: notes.pinned,
      linkType: notes.linkType,
      linkId: notes.linkId,
      linkLabel: notes.linkLabel,
      excerpt: sql<string>`left(${notes.body}, 180)`,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .where(where)
    .orderBy(desc(notes.pinned), desc(notes.updatedAt))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(notes).where(where);
  const tagRows = await db
    .select({ tag: sql<string>`t.tag`, count: sql<number>`count(*)::int` })
    .from(sql`${notes}, unnest(${notes.tags}) as t(tag)`)
    .where(sql`${notes.userId} = ${auth.user.id} and t.tag <> ${KNOWLEDGE_TAG}`)
    .groupBy(sql`t.tag`)
    .orderBy(sql`count(*) desc, t.tag asc`);
  return c.json({ items: rows, total, tags: tagRows });
});

workspaceRoutes.post('/notes', async (c) => {
  const auth = requireAuth(c);
  rateLimit(`notes:${auth.user.id}`, 300, 3600_000);
  const input = await body(c, noteInput);
  if (input.linkType && !input.linkId) throw badRequest('A linked note needs the linked item.', { fields: { linkId: 'Required with a link type' } });
  const [row] = await db.insert(notes).values({ ...input, userId: auth.user.id }).returning();
  return c.json({ note: row }, 201);
});

workspaceRoutes.get('/notes/:id', async (c) => {
  const auth = requireAuth(c);
  const [row] = await db.select().from(notes).where(and(eq(notes.id, idParam(c)), eq(notes.userId, auth.user.id)));
  if (!row) throw notFound('Note');
  return c.json({ note: row });
});

workspaceRoutes.patch('/notes/:id', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, patchSchema(noteInput));
  const [row] = await db
    .update(notes)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(notes.id, idParam(c)), eq(notes.userId, auth.user.id)))
    .returning();
  if (!row) throw notFound('Note');
  return c.json({ note: row });
});

workspaceRoutes.delete('/notes/:id', async (c) => {
  const auth = requireAuth(c);
  const res = await db
    .delete(notes)
    .where(and(eq(notes.id, idParam(c)), eq(notes.userId, auth.user.id)))
    .returning({ id: notes.id });
  if (!res.length) throw notFound('Note');
  return c.json({ ok: true });
});

// ======================================================================
// Tasks
// ======================================================================

const taskInput = z.object({
  title: z.string().trim().min(1, 'Describe the task.').max(300),
  notes: z.string().max(5000).nullable().optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  status: z.enum(['todo', 'done']).default('todo'),
  linkType: z.enum(LINK_TYPES).nullable().optional(),
  linkId: z.string().trim().max(200).nullable().optional(),
  linkLabel: z.string().trim().max(200).nullable().optional(),
});

workspaceRoutes.get('/tasks', async (c) => {
  const auth = requireAuth(c);
  const q = query(
    c,
    z.object({
      status: z.enum(['todo', 'done', 'all']).default('all'),
      due: z.enum(['overdue', 'today', 'week', 'none']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(100),
    }),
  );
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const week = new Date(now.getTime() + 7 * 86400_000);
  const where = and(
    eq(tasks.userId, auth.user.id),
    q.status !== 'all' ? eq(tasks.status, q.status) : undefined,
    q.due === 'overdue' ? and(isNotNull(tasks.dueAt), lte(tasks.dueAt, now), eq(tasks.status, 'todo')) : undefined,
    q.due === 'today' ? and(isNotNull(tasks.dueAt), lte(tasks.dueAt, endOfDay)) : undefined,
    q.due === 'week' ? and(isNotNull(tasks.dueAt), lte(tasks.dueAt, week)) : undefined,
    q.due === 'none' ? isNull(tasks.dueAt) : undefined,
  );
  const rows = await db
    .select()
    .from(tasks)
    .where(where)
    .orderBy(asc(tasks.status), sql`${tasks.dueAt} asc nulls last`, sql`case ${tasks.priority} when 'high' then 0 when 'normal' then 1 else 2 end`, desc(tasks.createdAt))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${tasks.status} = 'todo')::int`,
      overdue: sql<number>`count(*) filter (where ${tasks.status} = 'todo' and ${tasks.dueAt} < now())::int`,
    })
    .from(tasks)
    .where(eq(tasks.userId, auth.user.id));
  return c.json({ items: rows, total: counts.total, counts });
});

workspaceRoutes.post('/tasks', async (c) => {
  const auth = requireAuth(c);
  rateLimit(`tasks:${auth.user.id}`, 300, 3600_000);
  const input = await body(c, taskInput);
  const [row] = await db
    .insert(tasks)
    .values({ ...input, userId: auth.user.id, dueAt: input.dueAt ? new Date(input.dueAt) : null, completedAt: input.status === 'done' ? new Date() : null })
    .returning();
  return c.json({ task: row }, 201);
});

workspaceRoutes.patch('/tasks/:id', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, patchSchema(taskInput));
  const { dueAt, status, ...rest } = input;
  const [row] = await db
    .update(tasks)
    .set({
      ...rest,
      ...(dueAt !== undefined ? { dueAt: dueAt ? new Date(dueAt) : null } : {}),
      ...(status ? { status, completedAt: status === 'done' ? new Date() : null } : {}),
    })
    .where(and(eq(tasks.id, idParam(c)), eq(tasks.userId, auth.user.id)))
    .returning();
  if (!row) throw notFound('Task');
  return c.json({ task: row });
});

workspaceRoutes.delete('/tasks/:id', async (c) => {
  const auth = requireAuth(c);
  const res = await db
    .delete(tasks)
    .where(and(eq(tasks.id, idParam(c)), eq(tasks.userId, auth.user.id)))
    .returning({ id: tasks.id });
  if (!res.length) throw notFound('Task');
  return c.json({ ok: true });
});

// ======================================================================
// Saved links
// ======================================================================

const linkInput = z.object({
  title: z.string().trim().min(1, 'Give the link a title.').max(200),
  url: httpUrl,
  note: z.string().trim().max(2000).nullable().optional(),
});

workspaceRoutes.get('/links', async (c) => {
  const auth = requireAuth(c);
  const { q } = query(c, z.object({ q: z.string().trim().max(200).optional() }));
  const like = q ? `%${escapeLike(q)}%` : null;
  const rows = await db
    .select()
    .from(savedLinks)
    .where(and(eq(savedLinks.userId, auth.user.id), like ? or(sql`${savedLinks.title} ilike ${like}`, sql`${savedLinks.url} ilike ${like}`, sql`${savedLinks.note} ilike ${like}`) : undefined))
    .orderBy(desc(savedLinks.createdAt))
    .limit(500);
  return c.json({ items: rows, total: rows.length });
});

workspaceRoutes.post('/links', async (c) => {
  const auth = requireAuth(c);
  rateLimit(`links:${auth.user.id}`, 200, 3600_000);
  const input = await body(c, linkInput);
  const [row] = await db.insert(savedLinks).values({ ...input, userId: auth.user.id }).returning();
  return c.json({ link: row }, 201);
});

workspaceRoutes.patch('/links/:id', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, patchSchema(linkInput));
  const [row] = await db
    .update(savedLinks)
    .set(input)
    .where(and(eq(savedLinks.id, idParam(c)), eq(savedLinks.userId, auth.user.id)))
    .returning();
  if (!row) throw notFound('Link');
  return c.json({ link: row });
});

workspaceRoutes.delete('/links/:id', async (c) => {
  const auth = requireAuth(c);
  const res = await db
    .delete(savedLinks)
    .where(and(eq(savedLinks.id, idParam(c)), eq(savedLinks.userId, auth.user.id)))
    .returning({ id: savedLinks.id });
  if (!res.length) throw notFound('Link');
  return c.json({ ok: true });
});

// ======================================================================
// Bookmarks (all types)
// ======================================================================

const BOOKMARK_TYPES = ['resource', 'topic', 'track', 'problem', 'job', 'project', 'thread'] as const;

function bookmarkLink(type: string, id: string, extra?: { trackSlug?: string; topicSlug?: string }) {
  switch (type) {
    case 'resource':
      return `/app/library/${id}`;
    case 'topic':
      return extra?.trackSlug && extra.topicSlug ? `/app/learn/${extra.trackSlug}/${extra.topicSlug}` : null;
    case 'track':
      return extra?.trackSlug ? `/app/learn/${extra.trackSlug}` : null;
    case 'problem':
      return `/app/practice/${id}`;
    case 'job':
      return `/app/jobs/${id}`;
    case 'project':
      return `/app/projects/${id}`;
    case 'thread':
      return `/app/community/threads/${id}`;
    default:
      return null;
  }
}

workspaceRoutes.get('/bookmarks', async (c) => {
  const auth = requireAuth(c);
  const q = query(c, z.object({ type: z.enum(BOOKMARK_TYPES).optional(), collection: z.string().max(60).optional() }));
  const rows = await db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, auth.user.id), q.type ? eq(bookmarks.targetType, q.type) : undefined, q.collection ? eq(bookmarks.collection, q.collection) : undefined))
    .orderBy(desc(bookmarks.createdAt))
    .limit(500);
  const uuidRe = /^[0-9a-f-]{36}$/i;
  const topicIds = rows.filter((r) => r.targetType === 'topic' && uuidRe.test(r.targetId)).map((r) => r.targetId);
  const trackIds = rows.filter((r) => r.targetType === 'track' && uuidRe.test(r.targetId)).map((r) => r.targetId);
  const topicRows = topicIds.length
    ? await db.select({ id: topics.id, slug: topics.slug, trackSlug: tracks.slug }).from(topics).innerJoin(tracks, eq(tracks.id, topics.trackId)).where(inArray(topics.id, topicIds))
    : [];
  const trackRows = trackIds.length ? await db.select({ id: tracks.id, slug: tracks.slug }).from(tracks).where(inArray(tracks.id, trackIds)) : [];
  const counts = await db
    .select({ type: bookmarks.targetType, count: sql<number>`count(*)::int` })
    .from(bookmarks)
    .where(eq(bookmarks.userId, auth.user.id))
    .groupBy(bookmarks.targetType);
  return c.json({
    items: rows.map((r) => {
      const t = topicRows.find((x) => x.id === r.targetId);
      const tr = trackRows.find((x) => x.id === r.targetId);
      return { ...r, link: bookmarkLink(r.targetType, r.targetId, { trackSlug: t?.trackSlug ?? tr?.slug, topicSlug: t?.slug }) };
    }),
    counts,
  });
});

workspaceRoutes.post('/bookmarks', async (c) => {
  const auth = requireAuth(c);
  const input = await body(
    c,
    z.object({
      targetType: z.enum(BOOKMARK_TYPES),
      targetId: z.string().trim().min(1).max(200),
      label: z.string().trim().min(1).max(200),
      collection: z.string().trim().max(60).nullable().optional(),
    }),
  );
  const [row] = await db
    .insert(bookmarks)
    .values({ ...input, collection: input.collection || null, userId: auth.user.id })
    .onConflictDoUpdate({ target: [bookmarks.userId, bookmarks.targetType, bookmarks.targetId], set: { label: input.label, collection: input.collection || null } })
    .returning();
  return c.json({ bookmark: row }, 201);
});

workspaceRoutes.delete('/bookmarks/:id', async (c) => {
  const auth = requireAuth(c);
  const res = await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.id, idParam(c)), eq(bookmarks.userId, auth.user.id)))
    .returning({ id: bookmarks.id });
  if (!res.length) throw notFound('Bookmark');
  return c.json({ ok: true });
});

// ======================================================================
// Calendar
// ======================================================================

export type CalendarItem = { id: string; type: 'task' | 'assignment' | 'assessment' | 'interview' | 'mentor_session' | 'milestone'; title: string; at: string; link: string; detail?: string; done?: boolean };

/**
 * One agenda across modules, each source filtered to records the user is a party to:
 * personal tasks, published assignments in their cohorts, assessment invitations with
 * a due date, interviews (candidate or interviewer), mentor sessions (either side),
 * and milestones of projects they own.
 */
export async function calendarFor(userId: string, from: Date, to: Date): Promise<CalendarItem[]> {
  const [taskRows, assignmentRows, inviteRows, interviewRows, sessionRows, milestoneRows] = await Promise.all([
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userId), gte(tasks.dueAt, from), lte(tasks.dueAt, to))),
    db
      .select({ id: assignments.id, title: assignments.title, dueAt: assignments.dueAt, role: cohortMembers.role })
      .from(assignments)
      .innerJoin(cohortMembers, and(eq(cohortMembers.cohortId, assignments.cohortId), eq(cohortMembers.userId, userId)))
      .where(and(eq(assignments.status, 'published'), gte(assignments.dueAt, from), lte(assignments.dueAt, to))),
    db
      .select({ id: assessmentInvites.id, assessmentId: assessmentInvites.assessmentId, dueAt: assessmentInvites.dueAt, status: assessmentInvites.status, title: assessments.title })
      .from(assessmentInvites)
      .innerJoin(assessments, eq(assessments.id, assessmentInvites.assessmentId))
      .where(and(eq(assessmentInvites.userId, userId), inArray(assessmentInvites.status, ['invited', 'started', 'completed']), gte(assessmentInvites.dueAt, from), lte(assessmentInvites.dueAt, to))),
    db
      .select()
      .from(interviews)
      .where(
        and(
          or(eq(interviews.candidateId, userId), arrayContains(interviews.interviewerIds, [userId])),
          ne(interviews.status, 'cancelled'),
          gte(interviews.scheduledAt, from),
          lte(interviews.scheduledAt, to),
        ),
      ),
    db
      .select({ id: mentorSessions.id, scheduledAt: mentorSessions.scheduledAt, agenda: mentorSessions.agenda, status: mentorSessions.status, mentorId: mentorships.mentorId })
      .from(mentorSessions)
      .innerJoin(mentorships, eq(mentorships.id, mentorSessions.mentorshipId))
      .where(
        and(
          or(eq(mentorships.mentorId, userId), eq(mentorships.menteeId, userId)),
          ne(mentorSessions.status, 'cancelled'),
          gte(mentorSessions.scheduledAt, from),
          lte(mentorSessions.scheduledAt, to),
        ),
      ),
    db
      .select({ id: projectMilestones.id, title: projectMilestones.title, dueAt: projectMilestones.dueAt, status: projectMilestones.status, projectId: projects.id, projectTitle: projects.title })
      .from(projectMilestones)
      .innerJoin(projects, eq(projects.id, projectMilestones.projectId))
      .where(and(eq(projects.ownerId, userId), gte(projectMilestones.dueAt, from), lte(projectMilestones.dueAt, to))),
  ]);
  const iso = (d: Date | string | null) => new Date(d!).toISOString();
  const items: CalendarItem[] = [
    ...taskRows.map((t) => ({ id: t.id, type: 'task' as const, title: t.title, at: iso(t.dueAt), link: `/app/workspace?tab=tasks`, detail: `Task, ${t.priority} priority`, done: t.status === 'done' })),
    ...assignmentRows.map((a) => ({
      id: a.id,
      type: 'assignment' as const,
      title: a.title,
      at: iso(a.dueAt),
      link: a.role === 'student' ? `/app/assignments/${a.id}` : `/app/teach/assignments/${a.id}`,
      detail: a.role === 'student' ? 'Assignment due' : 'Assignment you teach is due',
    })),
    ...inviteRows.map((i) => ({ id: i.id, type: 'assessment' as const, title: i.title, at: iso(i.dueAt), link: `/app/assessments/${i.assessmentId}`, detail: 'Assessment due', done: i.status === 'completed' })),
    ...interviewRows.map((i) => ({
      id: i.id,
      type: 'interview' as const,
      title: i.title,
      at: iso(i.scheduledAt),
      link: i.candidateId === userId ? '/app/career/applications' : '/app/hire/interviews',
      detail: `${i.candidateId === userId ? 'Your interview' : 'You are interviewing'}, ${i.durationMinutes} min`,
      done: i.status === 'completed',
    })),
    ...sessionRows.map((s) => ({
      id: s.id,
      type: 'mentor_session' as const,
      title: s.agenda ? `Mentor session: ${s.agenda.slice(0, 80)}` : 'Mentor session',
      at: iso(s.scheduledAt),
      link: s.mentorId === userId ? '/app/mentor/sessions' : '/app/mentors',
      detail: s.mentorId === userId ? 'You are mentoring' : 'With your mentor',
      done: s.status === 'completed',
    })),
    ...milestoneRows.map((m) => ({ id: m.id, type: 'milestone' as const, title: m.title, at: iso(m.dueAt), link: `/app/projects/${m.projectId}`, detail: `Milestone in ${m.projectTitle}`, done: m.status === 'done' })),
  ];
  // Peer review deadlines (loaded lazily to keep the teach module out of this import graph).
  const { peerReviewCalendarItems } = await import('../teach/peer');
  items.push(...(await peerReviewCalendarItems(userId, from, to)));
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

workspaceRoutes.get('/calendar', async (c) => {
  const auth = requireAuth(c);
  const q = query(c, z.object({ from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }) }));
  const from = new Date(q.from);
  const to = new Date(q.to);
  if (to <= from) throw badRequest('The end of the range must be after the start.');
  if (to.getTime() - from.getTime() > 100 * 86400_000) throw badRequest('Choose a range of 100 days or less.');
  return c.json({ items: await calendarFor(auth.user.id, from, to), from: from.toISOString(), to: to.toISOString() });
});

// ======================================================================
// Export / import
// ======================================================================

export const WORKSPACE_EXPORT_FORMAT = 'learnsphere.workspace';

function slugName(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'note'
  );
}

export function noteToMarkdown(n: typeof notes.$inferSelect) {
  const fm = [
    '---',
    `title: ${JSON.stringify(n.title)}`,
    `tags: [${n.tags.map((t) => JSON.stringify(t)).join(', ')}]`,
    `pinned: ${n.pinned}`,
    n.linkType ? `link: ${JSON.stringify(`${n.linkType}:${n.linkId ?? ''}`)}` : null,
    n.linkLabel ? `linkLabel: ${JSON.stringify(n.linkLabel)}` : null,
    `created: ${new Date(n.createdAt).toISOString()}`,
    `updated: ${new Date(n.updatedAt).toISOString()}`,
    '---',
    '',
  ]
    .filter((l) => l !== null)
    .join('\n');
  return `${fm}\n${n.body}\n`;
}

workspaceRoutes.get('/export', async (c) => {
  const auth = requireAuth(c);
  const { format } = query(c, z.object({ format: z.enum(['json', 'markdown']).default('json') }));
  const uid = auth.user.id;
  const [noteRows, taskRows, linkRows, bookmarkRows] = await Promise.all([
    db.select().from(notes).where(eq(notes.userId, uid)).orderBy(asc(notes.createdAt)),
    db.select().from(tasks).where(eq(tasks.userId, uid)).orderBy(asc(tasks.createdAt)),
    db.select().from(savedLinks).where(eq(savedLinks.userId, uid)).orderBy(asc(savedLinks.createdAt)),
    db.select().from(bookmarks).where(eq(bookmarks.userId, uid)).orderBy(asc(bookmarks.createdAt)),
  ]);
  const stamp = new Date().toISOString().slice(0, 10);
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Cache-Control', 'private, no-store');
  if (format === 'markdown') {
    const used = new Set<string>();
    const entries = noteRows.map((n) => {
      let name = `${slugName(n.title)}.md`;
      for (let i = 2; used.has(name); i++) name = `${slugName(n.title)}-${i}.md`;
      used.add(name);
      return { name: `notes/${name}`, data: noteToMarkdown(n), date: new Date(n.updatedAt) };
    });
    entries.push({ name: 'README.md', data: `# LearnSphere Nexus notes export\n\nExported ${new Date().toISOString()}.\nEach note is a markdown file with front matter (title, tags, pinned). You can import these files back from My workspace, Import and export.\n`, date: new Date() });
    const zip = buildZip(entries);
    c.header('Content-Type', 'application/zip');
    c.header('Content-Disposition', `attachment; filename="learnsphere-notes-${stamp}.zip"`);
    return c.body(new Uint8Array(zip));
  }
  const strip = <T extends { userId?: string }>(r: T) => {
    const { userId: _u, ...rest } = r;
    return rest;
  };
  const payload = {
    format: WORKSPACE_EXPORT_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    notes: noteRows.map(strip),
    tasks: taskRows.map(strip),
    links: linkRows.map(strip),
    bookmarks: bookmarkRows.map(strip),
  };
  c.header('Content-Type', 'application/json; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="learnsphere-workspace-${stamp}.json"`);
  return c.body(JSON.stringify(payload, null, 2));
});

/** Parses the small front-matter subset our export writes (title, tags, pinned). */
export function parseMarkdownNote(text: string, filename: string) {
  let body = text.replace(/^﻿/, '');
  const meta: Record<string, string> = {};
  const m = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([A-Za-z]+):\s*(.*)$/);
      if (kv) meta[kv[1]] = kv[2].trim();
    }
    body = body.slice(m[0].length);
  }
  const unquote = (v?: string) => {
    if (!v) return v;
    try {
      return v.startsWith('"') ? (JSON.parse(v) as string) : v;
    } catch {
      return v.replace(/^"|"$/g, '');
    }
  };
  let tags: string[] = [];
  if (meta.tags) {
    const inner = meta.tags.replace(/^\[|\]$/g, '');
    tags = inner
      .split(',')
      .map((t) => unquote(t.trim())!.toLowerCase())
      .filter(Boolean);
  }
  const heading = body.match(/^#\s+(.+)$/m)?.[1];
  const title = (unquote(meta.title) || heading || filename.replace(/\.(md|markdown|txt)$/i, '')).trim().slice(0, 200) || 'Imported note';
  return { title, body: body.replace(/^\n+/, ''), tags: tags.slice(0, 20), pinned: meta.pinned === 'true' };
}

const importJson = z.object({
  format: z.literal(WORKSPACE_EXPORT_FORMAT),
  version: z.number().int().min(1).max(1),
  notes: z
    .array(z.object({ title: z.string().max(200), body: z.string().max(100_000).default(''), tags: z.array(z.string().max(40)).max(20).default([]), pinned: z.boolean().default(false), linkType: z.string().max(30).nullable().optional(), linkId: z.string().max(200).nullable().optional(), linkLabel: z.string().max(200).nullable().optional() }))
    .max(2000)
    .default([]),
  tasks: z
    .array(z.object({ title: z.string().min(1).max(300), notes: z.string().max(5000).nullable().optional(), dueAt: z.string().nullable().optional(), status: z.enum(['todo', 'done']).default('todo'), priority: z.enum(['low', 'normal', 'high']).default('normal') }))
    .max(2000)
    .default([]),
  links: z.array(z.object({ title: z.string().min(1).max(200), url: httpUrl, note: z.string().max(2000).nullable().optional() })).max(2000).default([]),
  bookmarks: z.array(z.object({ targetType: z.enum(BOOKMARK_TYPES), targetId: z.string().min(1).max(200), label: z.string().min(1).max(200), collection: z.string().max(60).nullable().optional() })).max(2000).default([]),
});

const MAX_IMPORT_FILES = 50;
const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;

workspaceRoutes.post('/import', async (c) => {
  const auth = requireAuth(c);
  rateLimit(`import:${auth.user.id}`, 20, 3600_000);
  const { files: single } = await readMultipart(c, ['files', 'file']);
  if (!single.length) throw badRequest('Choose markdown or JSON files to import.', { fields: { files: 'Required' } });
  if (single.length > MAX_IMPORT_FILES) throw badRequest(`Import up to ${MAX_IMPORT_FILES} files at a time.`);
  const result = { notes: 0, tasks: 0, links: 0, bookmarks: 0, skipped: [] as { file: string; reason: string }[] };
  const uid = auth.user.id;
  for (const f of single) {
    const name = sanitizeFilename(f.name);
    const ext = extensionOf(name);
    if (f.size > MAX_IMPORT_FILE_BYTES) {
      result.skipped.push({ file: name, reason: 'Larger than 2 MB' });
      continue;
    }
    const buf = await fileBuffer(f);
    if (buf.includes(0)) {
      result.skipped.push({ file: name, reason: 'Not a text file' });
      continue;
    }
    const text = buf.toString('utf8');
    if (ext === 'md' || ext === 'markdown' || ext === 'txt') {
      const n = parseMarkdownNote(text, name);
      if (n.body.length > 100_000) {
        result.skipped.push({ file: name, reason: 'Note is longer than 100,000 characters' });
        continue;
      }
      await db.insert(notes).values({ userId: uid, ...n, tags: [...new Set([...n.tags, 'imported'])] });
      result.notes++;
    } else if (ext === 'json') {
      let data: z.infer<typeof importJson>;
      try {
        data = parse(importJson, JSON.parse(text));
      } catch {
        result.skipped.push({ file: name, reason: 'Not a LearnSphere workspace export (format learnsphere.workspace, version 1)' });
        continue;
      }
      if (data.notes.length) {
        await db.insert(notes).values(data.notes.map((n) => ({ userId: uid, title: n.title || 'Untitled', body: n.body, tags: n.tags.map((t) => t.toLowerCase()), pinned: n.pinned, linkType: n.linkType ?? null, linkId: n.linkId ?? null, linkLabel: n.linkLabel ?? null })));
        result.notes += data.notes.length;
      }
      if (data.tasks.length) {
        await db.insert(tasks).values(
          data.tasks.map((t) => {
            const due = t.dueAt ? new Date(t.dueAt) : null;
            return { userId: uid, title: t.title, notes: t.notes ?? null, dueAt: due && !Number.isNaN(due.getTime()) ? due : null, status: t.status, priority: t.priority, completedAt: t.status === 'done' ? new Date() : null };
          }),
        );
        result.tasks += data.tasks.length;
      }
      if (data.links.length) {
        await db.insert(savedLinks).values(data.links.map((l) => ({ userId: uid, title: l.title, url: l.url, note: l.note ?? null })));
        result.links += data.links.length;
      }
      for (const b of data.bookmarks) {
        await db
          .insert(bookmarks)
          .values({ userId: uid, targetType: b.targetType, targetId: b.targetId, label: b.label, collection: b.collection ?? null })
          .onConflictDoNothing();
        result.bookmarks++;
      }
    } else {
      result.skipped.push({ file: name, reason: 'Only .md, .txt and .json files can be imported' });
    }
  }
  return c.json(result);
});
