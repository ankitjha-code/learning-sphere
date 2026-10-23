import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { jobTargets } from '../../db/schema';
import { type AppEnv, requireAuth } from '../../lib/context';
import { body, idParam, patchSchema } from '../../lib/validate';
import { badRequest, notFound } from '../../lib/errors';
import { rateLimit } from '../../lib/ratelimit';
import { extractSkills, toStoredSkills, skillName, KNOWN_SKILL_SLUGS } from './extract';
import { analyzeTarget, runAi, aiUnavailable, parseJsonLoose } from './service';

export const targetRoutes = new Hono<AppEnv>();

async function loadOwn(id: string, userId: string) {
  const [t] = await db.select().from(jobTargets).where(and(eq(jobTargets.id, id), eq(jobTargets.userId, userId)));
  if (!t) throw notFound('Job target');
  return t;
}

const targetInput = z.object({
  title: z.string().trim().min(1, 'Add the job title.').max(160),
  company: z.string().trim().max(160).nullable().optional(),
  url: z.string().trim().url('Enter a full URL (https://...).').max(500).nullable().optional().or(z.literal('')),
  description: z.string().trim().min(40, 'Paste the full job description (at least a few sentences).').max(30_000),
});

targetRoutes.get('/', async (c) => {
  const auth = requireAuth(c);
  const rows = await db.select().from(jobTargets).where(eq(jobTargets.userId, auth.user.id)).orderBy(desc(jobTargets.createdAt));
  return c.json({
    items: rows.map((t) => ({
      id: t.id,
      title: t.title,
      company: t.company,
      url: t.url,
      createdAt: t.createdAt,
      skills: t.extractedSkills.length,
      requiredSkills: t.extractedSkills.filter((s) => s.required).length,
      score: (t.analysis as { score?: number | null } | null)?.score ?? null,
      checklistDone: (t.analysis as { checklistDone?: number } | null)?.checklistDone ?? null,
      checklistTotal: (t.analysis as { checklistTotal?: number } | null)?.checklistTotal ?? null,
      computedAt: (t.analysis as { computedAt?: string } | null)?.computedAt ?? null,
    })),
    total: rows.length,
  });
});

/** Preview extraction without saving (used while pasting a JD). */
targetRoutes.post('/extract', async (c) => {
  requireAuth(c);
  const { description } = await body(c, z.object({ description: z.string().min(1).max(30_000) }));
  return c.json({ skills: extractSkills(description), method: 'deterministic' });
});

targetRoutes.post('/', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, targetInput);
  const extracted = toStoredSkills(extractSkills(input.description));
  const [row] = await db
    .insert(jobTargets)
    .values({ userId: auth.user.id, title: input.title, company: input.company || null, url: input.url || null, description: input.description, extractedSkills: extracted })
    .returning();
  const analysis = await analyzeTarget(auth.user.id, row);
  return c.json({ target: { ...row, analysis: undefined }, analysis }, 201);
});

targetRoutes.get('/:id', async (c) => {
  const auth = requireAuth(c);
  const t = await loadOwn(idParam(c), auth.user.id);
  const analysis = await analyzeTarget(auth.user.id, t);
  return c.json({ target: { ...t, analysis: undefined }, analysis, extraction: extractSkills(t.description) });
});

targetRoutes.put('/:id', async (c) => {
  const auth = requireAuth(c);
  const t = await loadOwn(idParam(c), auth.user.id);
  const input = await body(c, patchSchema(targetInput));
  const descChanged = input.description !== undefined && input.description !== t.description;
  const [row] = await db
    .update(jobTargets)
    .set({
      title: input.title ?? t.title,
      company: input.company === undefined ? t.company : input.company || null,
      url: input.url === undefined ? t.url : input.url || null,
      description: input.description ?? t.description,
      extractedSkills: descChanged ? toStoredSkills(extractSkills(input.description!)) : t.extractedSkills,
    })
    .where(eq(jobTargets.id, t.id))
    .returning();
  const analysis = await analyzeTarget(auth.user.id, row);
  return c.json({ target: { ...row, analysis: undefined }, analysis });
});

/** User edits to the extracted skill list (add, remove, required/preferred). */
targetRoutes.put('/:id/skills', async (c) => {
  const auth = requireAuth(c);
  const t = await loadOwn(idParam(c), auth.user.id);
  const { skills } = await body(c, z.object({ skills: z.array(z.object({ slug: z.string().max(80), required: z.boolean() })).max(60) }));
  const unknown = skills.filter((s) => !KNOWN_SKILL_SLUGS.has(s.slug));
  if (unknown.length) throw badRequest(`Unknown skills: ${unknown.map((u) => u.slug).join(', ')}`);
  const unique = [...new Map(skills.map((s) => [s.slug, s])).values()];
  const [row] = await db
    .update(jobTargets)
    .set({ extractedSkills: unique.map((s) => ({ slug: s.slug, name: skillName(s.slug), required: s.required })) })
    .where(eq(jobTargets.id, t.id))
    .returning();
  const analysis = await analyzeTarget(auth.user.id, row);
  return c.json({ target: { ...row, analysis: undefined }, analysis });
});

/** Optional AI extraction. Suggestions are stored separately and only join the list when the user accepts them. */
targetRoutes.post('/:id/ai-extract', async (c) => {
  const auth = requireAuth(c);
  const t = await loadOwn(idParam(c), auth.user.id);
  rateLimit(`career-ai:${auth.user.id}`, 30, 3600_000);
  const ai = await runAi({
    userId: auth.user.id,
    assistant: 'jd_analyzer',
    feature: 'jd_analysis',
    json: true,
    messages: [
      { role: 'system', content: `Extract skills from the job description. Only use these slugs: ${[...KNOWN_SKILL_SLUGS].join(', ')}. Return JSON {"skills":[{"slug":"...","required":true|false}]}. Required only when the JD states it as a requirement.` },
      { role: 'user', content: t.description.slice(0, 12_000) },
    ],
  });
  if (!ai.ok) return c.json(aiUnavailable(ai));
  const parsed = parseJsonLoose(ai.text) as { skills?: { slug?: unknown; required?: unknown }[] } | null;
  const suggestions = (parsed?.skills ?? [])
    .filter((s) => typeof s.slug === 'string' && KNOWN_SKILL_SLUGS.has(s.slug) && !t.extractedSkills.some((e) => e.slug === s.slug))
    .map((s) => ({ slug: s.slug as string, name: skillName(s.slug as string), required: s.required === true }));
  const prev = (t.analysis ?? {}) as Record<string, unknown>;
  await db.update(jobTargets).set({ analysis: { ...prev, aiSuggestedSkills: suggestions } }).where(eq(jobTargets.id, t.id));
  return c.json({ ok: true, aiAssisted: true, suggestions, label: 'AI suggested: confirm each skill against the job description before adding it.' });
});

targetRoutes.delete('/:id', async (c) => {
  const auth = requireAuth(c);
  const t = await loadOwn(idParam(c), auth.user.id);
  await db.delete(jobTargets).where(eq(jobTargets.id, t.id));
  return c.json({ ok: true });
});
