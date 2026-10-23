import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, count, desc, eq, ne } from 'drizzle-orm';
import { db } from '../../db/client';
import { resumes, jobTargets } from '../../db/schema';
import type { ResumeData } from '../../db/schema/build';
import { type AppEnv, requireAuth } from '../../lib/context';
import { body, idParam, query } from '../../lib/validate';
import { notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { rateLimit } from '../../lib/ratelimit';
import { resumeDataSchema } from './schemas';
import { checkResume, filterAiSuggestions, importResumeText, renderResumeHtml, resumeToPlainText, RESUME_TEMPLATES, newId, emptyResume } from './resume';
import { resumeFromProfile, runAi, aiUnavailable, parseJsonLoose, HONESTY_SYSTEM } from './service';

export const resumeRoutes = new Hono<AppEnv>();

const templateSchema = z.enum(RESUME_TEMPLATES);

async function loadOwn(id: string, userId: string) {
  const [r] = await db.select().from(resumes).where(and(eq(resumes.id, id), eq(resumes.userId, userId)));
  if (!r) throw notFound('Resume');
  return r;
}

resumeRoutes.get('/', async (c) => {
  const auth = requireAuth(c);
  const rows = await db
    .select({ id: resumes.id, title: resumes.title, template: resumes.template, targetRole: resumes.targetRole, version: resumes.version, parentId: resumes.parentId, isPrimary: resumes.isPrimary, updatedAt: resumes.updatedAt, createdAt: resumes.createdAt })
    .from(resumes)
    .where(eq(resumes.userId, auth.user.id))
    .orderBy(desc(resumes.isPrimary), desc(resumes.updatedAt));
  return c.json({ items: rows, total: rows.length });
});

resumeRoutes.post('/', async (c) => {
  const auth = requireAuth(c);
  const input = await body(
    c,
    z.object({
      title: z.string().trim().min(1, 'Give the resume a name.').max(120),
      template: templateSchema.default('clean'),
      targetRole: z.string().trim().max(160).optional(),
      data: resumeDataSchema.optional(),
      start: z.enum(['profile', 'blank']).default('profile'),
    }),
  );
  const data: ResumeData = input.data ?? (input.start === 'profile' ? await resumeFromProfile(auth.user.id) : emptyResume(auth.user.name));
  const [{ n }] = await db.select({ n: count() }).from(resumes).where(eq(resumes.userId, auth.user.id));
  const [row] = await db
    .insert(resumes)
    .values({ userId: auth.user.id, title: input.title, template: input.template, targetRole: input.targetRole ?? null, data, isPrimary: Number(n) === 0 })
    .returning();
  return c.json({ resume: row }, 201);
});

/** Import assist: parse pasted text into PROPOSED fields. Nothing is stored. */
resumeRoutes.post('/import', async (c) => {
  requireAuth(c);
  const { text } = await body(c, z.object({ text: z.string().min(20, 'Paste at least a few lines of your resume.').max(40_000) }));
  const result = importResumeText(text);
  return c.json({ saved: false, ...result });
});

/** Optional AI parse. Also proposals only; nothing is stored. */
resumeRoutes.post('/import/ai', async (c) => {
  const auth = requireAuth(c);
  rateLimit(`career-ai:${auth.user.id}`, 30, 3600_000);
  const { text } = await body(c, z.object({ text: z.string().min(20).max(20_000) }));
  const r = await runAi({
    userId: auth.user.id,
    assistant: 'resume_reviewer',
    feature: 'resume_import',
    json: true,
    messages: [
      { role: 'system', content: `${HONESTY_SYSTEM} Extract the resume into JSON with keys basics{name,email,phone,location,headline}, summary, experience[{company,title,start,end,bullets[]}], education[{institution,degree,field,start,end}], projects[{name,url,bullets[]}], skills[{group,items[]}], certifications[{name,issuer,date}]. Copy text verbatim. Omit anything not present.` },
      { role: 'user', content: text },
    ],
  });
  if (!r.ok) return c.json(aiUnavailable(r));
  const parsed = resumeDataSchema.partial().safeParse(withIds(parseJsonLoose(r.text)));
  if (!parsed.success) return c.json({ ok: false, reason: 'error', message: 'The AI response could not be read. Use the standard parser instead.' });
  // Drop any bullet the source text does not contain word-for-word-ish (guards against invented content).
  const src = text.toLowerCase().replace(/\s+/g, ' ');
  const keep = (s: string) => src.includes(s.toLowerCase().replace(/\s+/g, ' ').slice(0, 40));
  const p = parsed.data;
  let dropped = 0;
  const filterBullets = (xs: string[]) => xs.filter((b) => (keep(b) ? true : (dropped++, false)));
  p.experience = (p.experience ?? []).map((e) => ({ ...e, bullets: filterBullets(e.bullets) }));
  p.projects = (p.projects ?? []).map((e) => ({ ...e, bullets: filterBullets(e.bullets) }));
  return c.json({ ok: true, saved: false, aiAssisted: true, proposal: { ...emptyResume(), ...p }, dropped, notes: ['AI draft: review every field. Bullets that did not appear in your text were removed.'] });
});

function withIds(v: unknown): unknown {
  if (!v || typeof v !== 'object') return v;
  const o = v as Record<string, unknown>;
  for (const k of ['experience', 'education', 'projects', 'certifications']) {
    if (Array.isArray(o[k])) o[k] = (o[k] as Record<string, unknown>[]).map((x) => ({ id: newId(), bullets: k === 'experience' || k === 'projects' ? [] : undefined, ...x }));
  }
  return o;
}

resumeRoutes.get('/:id', async (c) => {
  const auth = requireAuth(c);
  const r = await loadOwn(idParam(c), auth.user.id);
  const versions = await db
    .select({ id: resumes.id, title: resumes.title, targetRole: resumes.targetRole, parentId: resumes.parentId, updatedAt: resumes.updatedAt })
    .from(resumes)
    .where(and(eq(resumes.userId, auth.user.id), ne(resumes.id, r.id)))
    .orderBy(asc(resumes.createdAt));
  return c.json({ resume: r, ...checkResume(r.data), related: versions.filter((v) => v.parentId === r.id || v.id === r.parentId) });
});

resumeRoutes.put('/:id', async (c) => {
  const auth = requireAuth(c);
  const r = await loadOwn(idParam(c), auth.user.id);
  const input = await body(c, z.object({ title: z.string().trim().min(1).max(120).optional(), template: templateSchema.optional(), targetRole: z.string().trim().max(160).nullable().optional(), data: resumeDataSchema.optional() }));
  const changedData = input.data && JSON.stringify(input.data) !== JSON.stringify(r.data);
  const [row] = await db
    .update(resumes)
    .set({ ...input, version: changedData ? r.version + 1 : r.version, updatedAt: new Date() })
    .where(eq(resumes.id, r.id))
    .returning();
  return c.json({ resume: row, ...checkResume(row.data) });
});

resumeRoutes.delete('/:id', async (c) => {
  const auth = requireAuth(c);
  const r = await loadOwn(idParam(c), auth.user.id);
  await db.delete(resumes).where(eq(resumes.id, r.id));
  if (r.isPrimary) {
    const [next] = await db.select({ id: resumes.id }).from(resumes).where(eq(resumes.userId, auth.user.id)).orderBy(desc(resumes.updatedAt)).limit(1);
    if (next) await db.update(resumes).set({ isPrimary: true }).where(eq(resumes.id, next.id));
  }
  return c.json({ ok: true });
});

resumeRoutes.post('/:id/primary', async (c) => {
  const auth = requireAuth(c);
  const r = await loadOwn(idParam(c), auth.user.id);
  await db.update(resumes).set({ isPrimary: false }).where(eq(resumes.userId, auth.user.id));
  await db.update(resumes).set({ isPrimary: true }).where(eq(resumes.id, r.id));
  return c.json({ ok: true });
});

/**
 * Copy (new version) or tailor for a job target. Tailoring only reorders the user's existing
 * skills and section order and lists which target skills appear or are missing. It never adds content.
 */
resumeRoutes.post('/:id/copy', async (c) => {
  const auth = requireAuth(c);
  const r = await loadOwn(idParam(c), auth.user.id);
  const input = await body(c, z.object({ title: z.string().trim().max(120).optional(), targetId: z.string().uuid().optional() }));
  const data: ResumeData = structuredClone(r.data);
  let tailoring: { present: string[]; missing: string[]; notes: string[] } | null = null;
  let targetRole = r.targetRole;
  let title = input.title || `${r.title} (copy)`;
  if (input.targetId) {
    const [t] = await db.select().from(jobTargets).where(and(eq(jobTargets.id, input.targetId), eq(jobTargets.userId, auth.user.id)));
    if (!t) throw notFound('Job target');
    targetRole = t.title;
    title = input.title || `${r.title} for ${t.title}${t.company ? ` at ${t.company}` : ''}`;
    const text = resumeToPlainText(data).toLowerCase();
    const names = t.extractedSkills.map((s) => ({ ...s, terms: [s.name.toLowerCase(), s.slug.replace(/-/g, ' ')] }));
    const present = names.filter((s) => s.terms.some((x) => text.includes(x)));
    const missing = names.filter((s) => s.required && !present.includes(s));
    const presentTerms = present.flatMap((p) => p.terms);
    // Move matching skill items first inside each group, and groups with matches first.
    data.skills = data.skills
      .map((g) => ({ ...g, items: [...g.items].sort((a, b) => Number(presentTerms.some((x) => b.toLowerCase().includes(x))) - Number(presentTerms.some((x) => a.toLowerCase().includes(x)))) }))
      .sort((a, b) => Number(b.items.some((i) => presentTerms.some((x) => i.toLowerCase().includes(x)))) - Number(a.items.some((i) => presentTerms.some((x) => i.toLowerCase().includes(x)))));
    // Projects before experience when experience has no matching terms but projects do.
    const expText = data.experience.map((e) => e.bullets.join(' ')).join(' ').toLowerCase();
    const projText = data.projects.map((p) => `${p.name} ${p.bullets.join(' ')}`).join(' ').toLowerCase();
    if (presentTerms.some((x) => projText.includes(x)) && !presentTerms.some((x) => expText.includes(x))) {
      const order = data.sectionOrder.filter((s) => s !== 'projects');
      order.splice(Math.max(0, order.indexOf('experience')), 0, 'projects');
      data.sectionOrder = order;
    }
    tailoring = {
      present: present.map((p) => p.name),
      missing: missing.map((m) => m.name),
      notes: [
        'Reordered your existing skills and sections so content relevant to this role comes first.',
        'Nothing was added. For each missing skill, add it only if you genuinely have it and can discuss it.',
      ],
    };
  }
  const [row] = await db.insert(resumes).values({ userId: auth.user.id, title, template: r.template, targetRole, data, parentId: r.id, isPrimary: false }).returning();
  return c.json({ resume: row, tailoring }, 201);
});

resumeRoutes.get('/:id/checks', async (c) => {
  const auth = requireAuth(c);
  const r = await loadOwn(idParam(c), auth.user.id);
  return c.json(checkResume(r.data));
});

/** Optional AI review. Suggestions that would add facts must be questions; anything adding numbers is dropped. */
resumeRoutes.post('/:id/review', async (c) => {
  const auth = requireAuth(c);
  const r = await loadOwn(idParam(c), auth.user.id);
  rateLimit(`career-ai:${auth.user.id}`, 30, 3600_000);
  const source = resumeToPlainText(r.data);
  const ai = await runAi({
    userId: auth.user.id,
    assistant: 'resume_reviewer',
    feature: 'resume_review',
    json: true,
    messages: [
      {
        role: 'system',
        content: `${HONESTY_SYSTEM} Review the resume. Return JSON {"suggestions":[{"section":"experience|projects|summary|skills|education|basics|general","kind":"rewrite|question|tip","original":"text being improved (optional)","text":"..."}]}. A "rewrite" may only rephrase facts already present. If a stronger version needs a fact the user has not given (a result, a metric, a tool), use kind "question", for example "What was the measurable result? Leave blank if none."`,
      },
      { role: 'user', content: source },
    ],
  });
  if (!ai.ok) return c.json(aiUnavailable(ai));
  const { kept, dropped } = filterAiSuggestions(parseJsonLoose(ai.text), source);
  return c.json({ ok: true, aiAssisted: true, suggestions: kept, dropped, label: 'AI suggestions: review every claim before using it.' });
});

/** Export: print-friendly HTML (save as PDF from the browser), plain text, or JSON. */
resumeRoutes.get('/:id/export', async (c) => {
  const auth = requireAuth(c);
  const r = await loadOwn(idParam(c), auth.user.id);
  const { format } = query(c, z.object({ format: z.enum(['html', 'text', 'json']).default('html') }));
  await audit(c, { action: 'career.resume.export', targetType: 'resume', targetId: r.id, meta: { format } });
  const safeName = r.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'resume';
  if (format === 'text') {
    c.header('content-disposition', `attachment; filename="${safeName}.txt"`);
    return c.text(resumeToPlainText(r.data));
  }
  if (format === 'json') {
    c.header('content-disposition', `attachment; filename="${safeName}.json"`);
    return c.json({ title: r.title, template: r.template, exportedAt: new Date().toISOString(), data: r.data });
  }
  return c.html(renderResumeHtml(r.data, r.template, r.title));
});
