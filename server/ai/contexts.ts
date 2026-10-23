/**
 * Context builders: turn a conversation's context reference ({type, id, label})
 * into a short, sanitized block for the prompt. Every builder re-checks that the
 * user may see the item, on every message (access can be revoked).
 *
 * Practice problems: only `questions.content` is selected (statement, constraints,
 * starter code, visible tests). The answer key, hidden tests, model answer and
 * hints are never read here.
 */
import { and, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db } from '../db/client';
import { assignments, careerDocuments, cohortMembers, questions, resumes, topics, tracks } from '../db/schema';
import type { AuthContext } from '../lib/context';
import { rolesIn } from '../lib/context';
import { badRequest, notFound } from '../lib/errors';
import { uuidParam } from '../lib/validate';
import type { Assistant, ContextType } from './assistants';
import { sanitizeUntrusted, untrustedBlock } from './safety';

export type ConversationContext = { type?: string; id?: string; label?: string };
export type BuiltContext = { label: string; block: string };

export const CONTEXT_TYPES: ContextType[] = ['topic', 'problem', 'resume', 'career_document', 'assignment', 'text'];

function orgScope(col: PgColumn, orgIds: string[]): SQL {
  return orgIds.length ? or(isNull(col), inArray(col, orgIds))! : isNull(col);
}

const FACULTY: string[] = ['faculty', 'faculty_admin', 'org_admin'];

function clean(s: string | null | undefined, max: number) {
  return sanitizeUntrusted(s ?? '', max);
}

/** Validates the context reference against the assistant and the user's access. Throws 400/404. */
export async function buildContext(auth: AuthContext, assistant: Assistant, ctx: ConversationContext | null | undefined): Promise<BuiltContext | null> {
  if (!ctx || !ctx.type) return null;
  const type = ctx.type as ContextType;
  if (!CONTEXT_TYPES.includes(type)) throw badRequest('Unknown context type.');
  if (!assistant.contexts.includes(type)) throw badRequest(`${assistant.name} cannot use this kind of context. Pick another specialist or remove the context.`);

  if (type === 'text') {
    const label = (ctx.label ?? '').trim().slice(0, 200);
    if (!label) return null;
    return { label, block: untrustedBlock('context', { kind: 'text' }, clean(label, 200)) };
  }

  const orgIds = auth.memberships.map((m) => m.orgId);
  const uid = auth.user.id;
  const id = ctx.id ?? '';

  if (type === 'topic') {
    if (!uuidParam.safeParse(id).success) throw notFound('Topic');
    const [t] = await db
      .select({ title: topics.title, objectives: topics.objectives, body: topics.body, trackTitle: tracks.title })
      .from(topics)
      .innerJoin(tracks, eq(tracks.id, topics.trackId))
      .where(and(eq(topics.id, id), eq(tracks.status, 'published'), orgScope(tracks.orgId, orgIds)));
    if (!t) throw notFound('Topic');
    const text = [`Topic: ${t.title} (roadmap: ${t.trackTitle})`, t.objectives.length ? `Learning objectives:\n- ${t.objectives.join('\n- ')}` : '', `Lesson excerpt:\n${clean(t.body, 3000)}`]
      .filter(Boolean)
      .join('\n\n');
    return { label: t.title, block: untrustedBlock('context', { kind: 'topic', title: t.title }, clean(text, 4000)) };
  }

  if (type === 'problem') {
    const byId = uuidParam.safeParse(id).success;
    if (!byId && !/^[a-z0-9-]{1,120}$/.test(id)) throw notFound('Practice problem');
    // Only questions.content: never answerKey (hidden tests, model answer, solution SQL).
    const [q] = await db
      .select({ title: questions.title, type: questions.type, difficulty: questions.difficulty, content: questions.content })
      .from(questions)
      .where(and(byId ? eq(questions.id, id) : eq(questions.slug, id), eq(questions.isPractice, true), eq(questions.status, 'active'), orgScope(questions.orgId, orgIds)));
    if (!q) throw notFound('Practice problem');
    return { label: q.title, block: untrustedBlock('context', { kind: 'practice problem', title: q.title }, practiceText(q)) };
  }

  if (type === 'resume') {
    if (!uuidParam.safeParse(id).success) throw notFound('Resume');
    const [r] = await db.select({ title: resumes.title, targetRole: resumes.targetRole, data: resumes.data }).from(resumes).where(and(eq(resumes.id, id), eq(resumes.userId, uid)));
    if (!r) throw notFound('Resume');
    return { label: r.title, block: untrustedBlock('context', { kind: 'resume', title: r.title }, resumeText(r)) };
  }

  if (type === 'career_document') {
    if (!uuidParam.safeParse(id).success) throw notFound('Document');
    const [d] = await db
      .select({ title: careerDocuments.title, kind: careerDocuments.kind, body: careerDocuments.body, jobDescription: careerDocuments.jobDescription })
      .from(careerDocuments)
      .where(and(eq(careerDocuments.id, id), eq(careerDocuments.userId, uid)));
    if (!d) throw notFound('Document');
    const text = [`${d.kind.replace(/_/g, ' ')}: ${d.title}`, clean(d.body, 3000), d.jobDescription ? `Job description:\n${clean(d.jobDescription, 2500)}` : ''].filter(Boolean).join('\n\n');
    return { label: d.title, block: untrustedBlock('context', { kind: 'career document', title: d.title }, text) };
  }

  // assignment: instructions only, for students in the cohort (published) or teaching staff of the org.
  if (!uuidParam.safeParse(id).success) throw notFound('Assignment');
  const [a] = await db
    .select({ title: assignments.title, objectives: assignments.objectives, instructions: assignments.instructions, dueAt: assignments.dueAt, status: assignments.status, orgId: assignments.orgId, cohortId: assignments.cohortId, availableFrom: assignments.availableFrom })
    .from(assignments)
    .where(eq(assignments.id, id));
  if (!a) throw notFound('Assignment');
  const isStaff = rolesIn(auth, a.orgId).some((r) => FACULTY.includes(r));
  let allowed = isStaff;
  if (!allowed && a.status !== 'draft' && (!a.availableFrom || new Date(a.availableFrom).getTime() <= Date.now()) && orgIds.includes(a.orgId)) {
    const [m] = await db.select({ userId: cohortMembers.userId }).from(cohortMembers).where(and(eq(cohortMembers.cohortId, a.cohortId), eq(cohortMembers.userId, uid)));
    allowed = !!m;
  }
  if (!allowed) throw notFound('Assignment');
  const text = [`Assignment: ${a.title}`, a.objectives.length ? `Objectives:\n- ${a.objectives.join('\n- ')}` : '', `Instructions:\n${clean(a.instructions, 3500)}`].filter(Boolean).join('\n\n');
  return { label: a.title, block: untrustedBlock('context', { kind: 'assignment', title: a.title }, text) };
}

/** Statement, constraints, starter code and visible tests only. Hints are revealed by the practice module, not here. */
export function practiceText(q: { title: string; type: string; difficulty: string; content: typeof questions.$inferSelect.content }): string {
  const c = q.content;
  const parts = [`Problem: ${q.title} (${q.type}, ${q.difficulty})`, `Statement:\n${clean(c.prompt, 2500)}`];
  if (c.constraints) parts.push(`Constraints:\n${clean(c.constraints, 600)}`);
  if (c.schemaSql) parts.push(`Schema:\n${clean(c.schemaSql, 1500)}`);
  if (c.starterCode) {
    const [lang, code] = Object.entries(c.starterCode)[0] ?? [];
    if (lang && code) parts.push(`Starter code (${lang}):\n${clean(code, 1200)}`);
  }
  if (c.visibleTests?.length)
    parts.push(
      `Visible example tests:\n${c.visibleTests
        .slice(0, 5)
        .map((t) => `- ${t.name}: input ${clean(t.input, 200)} → expected ${clean(t.expected, 200)}`)
        .join('\n')}`,
    );
  return parts.join('\n\n');
}

/** Resume content without contact details (not needed for feedback, and kept out of provider logs). */
function resumeText(r: { title: string; targetRole: string | null; data: typeof resumes.$inferSelect.data }): string {
  const d = r.data;
  const lines: string[] = [`Resume: ${r.title}${r.targetRole ? ` (target role: ${r.targetRole})` : ''}`];
  if (d.basics?.headline) lines.push(`Headline: ${d.basics.headline}`);
  if (d.summary) lines.push(`Summary: ${d.summary}`);
  if (d.experience?.length) {
    lines.push('Experience:');
    for (const e of d.experience.slice(0, 8)) lines.push(`- ${e.title} at ${e.company} (${e.start ?? '?'} to ${e.end ?? 'present'})\n${e.bullets.map((b) => `  • ${b}`).join('\n')}`);
  }
  if (d.projects?.length) {
    lines.push('Projects:');
    for (const p of d.projects.slice(0, 6)) lines.push(`- ${p.name}\n${p.bullets.map((b) => `  • ${b}`).join('\n')}`);
  }
  if (d.education?.length) lines.push(`Education:\n${d.education.map((e) => `- ${[e.degree, e.field].filter(Boolean).join(' in ')} at ${e.institution}${e.end ? ` (${e.end})` : ''}`).join('\n')}`);
  if (d.skills?.length) lines.push(`Skills:\n${d.skills.map((s) => `- ${s.group}: ${s.items.join(', ')}`).join('\n')}`);
  if (d.certifications?.length) lines.push(`Certifications:\n${d.certifications.map((c) => `- ${c.name}${c.issuer ? ` (${c.issuer})` : ''}`).join('\n')}`);
  return clean(lines.join('\n'), 5000);
}
