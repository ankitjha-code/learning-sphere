import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { db } from '../../db/client';
import { portfolios, portfolioPrefs, portfolioVersions, certificates, projects, projectMembers, tracks, users, attempts } from '../../db/schema';
import { type AppEnv, requireAuth } from '../../lib/context';
import { body } from '../../lib/validate';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { config } from '../../lib/config';
import { randomToken } from '../../lib/crypto';
import { tokenMatches } from '../projects/service';
import {
  SECTION_KEYS,
  RESERVED_SLUGS,
  PLATFORM_CERT_STATEMENT,
  ensurePortfolio,
  getPrefs,
  normalizedSections,
  snapshotVersion,
  composePortfolio,
  summaryMarkdown,
  evidenceForResume,
  syncTrackCertificates,
} from './service';

/** Mounted at /api/portfolio. Evidence-based portfolio with privacy controls and revocable sharing. */
export const portfolioRoutes = new Hono<AppEnv>();

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .url('Enter a full link starting with https://')
  .refine((u) => /^https?:\/\//i.test(u), 'Use an http(s) link.');

function sharePath(p: { slug: string; visibility: string; shareToken: string | null }) {
  if (p.visibility === 'public') return `/p/${p.slug}`;
  if (p.visibility === 'unlisted' && p.shareToken) return `/p/${p.slug}?token=${p.shareToken}`;
  return null;
}

function ownerPayload(p: typeof portfolios.$inferSelect, shownAttemptIds: string[]) {
  return {
    slug: p.slug,
    visibility: p.visibility,
    shareToken: p.shareToken,
    sharePath: sharePath(p),
    headline: p.headline,
    about: p.about,
    sections: normalizedSections(p),
    featuredProjectIds: p.featuredProjectIds,
    hiddenEvidenceIds: p.hiddenEvidenceIds,
    writing: p.writing,
    shownAttemptIds,
    version: p.version,
    updatedAt: p.updatedAt,
  };
}

// ---------- Public (no account needed) ----------

/** Public portfolio. Private → 404. Unlisted → requires the current share token (rotating revokes old links). */
portfolioRoutes.get('/public/:slug', async (c) => {
  const slug = c.req.param('slug').toLowerCase();
  const [p] = await db.select().from(portfolios).where(eq(portfolios.slug, slug));
  if (!p || p.visibility === 'private') throw notFound('Portfolio');
  if (p.visibility === 'unlisted' && !tokenMatches(p.shareToken, c.req.query('token'))) throw notFound('Portfolio');
  const [u] = await db.select({ status: users.status }).from(users).where(eq(users.id, p.userId));
  if (!u || u.status !== 'active') throw notFound('Portfolio');
  const view = await composePortfolio(p.userId, 'public');
  return c.json(view);
});

/** Certificate verification: facts about one platform-issued completion record only. */
portfolioRoutes.get('/verify/:code', async (c) => {
  const code = c.req.param('code').trim().toUpperCase();
  if (!/^LSN-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) throw notFound('Certificate');
  const [cert] = await db
    .select({ title: certificates.title, kind: certificates.kind, issuer: certificates.issuer, issuedAt: certificates.issuedAt, code: certificates.verificationCode, holderName: users.name, trackId: certificates.trackId, projectId: certificates.projectId })
    .from(certificates)
    .innerJoin(users, eq(users.id, certificates.userId))
    .where(and(eq(certificates.verificationCode, code), eq(certificates.kind, 'platform_completion')));
  if (!cert) throw notFound('Certificate');
  const [t] = cert.trackId ? await db.select({ title: tracks.title }).from(tracks).where(eq(tracks.id, cert.trackId)) : [];
  const [pr] = cert.projectId ? await db.select({ title: projects.title }).from(projects).where(eq(projects.id, cert.projectId)) : [];
  return c.json({
    valid: true,
    certificate: {
      title: cert.title,
      holderName: cert.holderName,
      issuer: cert.issuer,
      issuedAt: cert.issuedAt,
      verificationCode: cert.code,
      basis: t ? `Completed every topic of the learning path "${t.title}"` : pr ? `Capstone project "${pr.title}" approved by a reviewer` : 'Platform activity',
      statement: PLATFORM_CERT_STATEMENT,
    },
  });
});

// ---------- Owner ----------

portfolioRoutes.get('/', async (c) => {
  const auth = requireAuth(c);
  await syncTrackCertificates(auth.user.id);
  const p = await ensurePortfolio(auth.user.id);
  const prefs = await getPrefs(auth.user.id);
  const evidence = await composePortfolio(auth.user.id, 'owner');
  return c.json({ portfolio: ownerPayload(p, prefs.shownAttemptIds), evidence });
});

/** What a visitor would see right now (ignores visibility so the owner can preview a private portfolio). */
portfolioRoutes.get('/preview', async (c) => {
  const auth = requireAuth(c);
  return c.json(await composePortfolio(auth.user.id, 'public'));
});

portfolioRoutes.patch('/', async (c) => {
  const auth = requireAuth(c);
  const input = await body(
    c,
    z.object({
      slug: z
        .string()
        .trim()
        .toLowerCase()
        .min(3, 'Use at least 3 characters.')
        .max(40)
        .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Use lowercase letters, numbers and dashes.')
        .optional(),
      headline: z.string().trim().max(160).nullable().optional(),
      about: z.string().trim().max(5000).nullable().optional(),
      sections: z
        .array(z.object({ key: z.enum(SECTION_KEYS as [string, ...string[]]), visible: z.boolean() }))
        .max(SECTION_KEYS.length)
        .optional(),
      featuredProjectIds: z.array(z.string().uuid()).max(20).optional(),
      hiddenEvidenceIds: z.array(z.string().uuid()).max(500).optional(),
      writing: z.array(z.object({ title: z.string().trim().min(2).max(200), url: httpUrl, summary: z.string().trim().max(500).optional() })).max(30).optional(),
      shownAttemptIds: z.array(z.string().uuid()).max(100).optional(),
    }),
  );
  const uid = auth.user.id;
  const p = await ensurePortfolio(uid);
  if (input.slug && input.slug !== p.slug) {
    if (RESERVED_SLUGS.has(input.slug)) throw badRequest('That address is reserved.', { fields: { slug: 'Reserved. Try another.' } });
    const [taken] = await db.select({ userId: portfolios.userId }).from(portfolios).where(eq(portfolios.slug, input.slug));
    if (taken) throw conflict('That address is taken.', { fields: { slug: 'Already taken. Try another.' } });
  }
  if (input.sections) {
    const keys = input.sections.map((s) => s.key);
    if (new Set(keys).size !== keys.length) throw badRequest('Each section can appear once.');
  }
  if (input.featuredProjectIds?.length) {
    // Only projects the user owns or contributed to can be featured.
    const memberOf = await db.select({ projectId: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, uid));
    const own = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(inArray(projects.id, input.featuredProjectIds), or(eq(projects.ownerId, uid), memberOf.length ? inArray(projects.id, memberOf.map((m) => m.projectId)) : eq(projects.ownerId, uid))));
    if (own.length !== new Set(input.featuredProjectIds).size) throw badRequest('You can only feature your own projects.', { fields: { featuredProjectIds: 'Unknown project.' } });
  }
  if (input.shownAttemptIds?.length) {
    const mine = await db.select({ id: attempts.id }).from(attempts).where(and(eq(attempts.userId, uid), inArray(attempts.id, input.shownAttemptIds)));
    if (mine.length !== new Set(input.shownAttemptIds).size) throw badRequest('Unknown assessment result.', { fields: { shownAttemptIds: 'Unknown result.' } });
    await getPrefs(uid);
    await db.update(portfolioPrefs).set({ shownAttemptIds: [...new Set(input.shownAttemptIds)], updatedAt: new Date() }).where(eq(portfolioPrefs.userId, uid));
  } else if (input.shownAttemptIds) {
    await getPrefs(uid);
    await db.update(portfolioPrefs).set({ shownAttemptIds: [], updatedAt: new Date() }).where(eq(portfolioPrefs.userId, uid));
  }
  const { shownAttemptIds: _ignored, sections, ...rest } = input;
  const [row] = await db
    .update(portfolios)
    .set({ ...rest, ...(sections ? { sections: sections as typeof p.sections } : {}), updatedAt: new Date() })
    .where(eq(portfolios.userId, uid))
    .returning();
  const prefs = await getPrefs(uid);
  return c.json({ portfolio: ownerPayload(row, prefs.shownAttemptIds) });
});

/** Publish (public or unlisted) and snapshot a version. Unlisted gets a share token if it has none. */
portfolioRoutes.post('/publish', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, z.object({ visibility: z.enum(['public', 'unlisted']), note: z.string().trim().max(200).optional() }));
  const p = await ensurePortfolio(auth.user.id);
  const shareToken = input.visibility === 'unlisted' ? (p.shareToken ?? randomToken(18)) : p.shareToken;
  await db.update(portfolios).set({ visibility: input.visibility, shareToken, updatedAt: new Date() }).where(eq(portfolios.userId, auth.user.id));
  const version = await snapshotVersion(auth.user.id, input.note || `Published as ${input.visibility}`);
  await audit(c, { action: 'portfolio.published', targetType: 'portfolio', targetId: auth.user.id, meta: { visibility: input.visibility, version } });
  const [row] = await db.select().from(portfolios).where(eq(portfolios.userId, auth.user.id));
  const prefs = await getPrefs(auth.user.id);
  return c.json({ portfolio: ownerPayload(row, prefs.shownAttemptIds), version });
});

portfolioRoutes.post('/unpublish', async (c) => {
  const auth = requireAuth(c);
  await ensurePortfolio(auth.user.id);
  const [row] = await db.update(portfolios).set({ visibility: 'private', updatedAt: new Date() }).where(eq(portfolios.userId, auth.user.id)).returning();
  await audit(c, { action: 'portfolio.unpublished', targetType: 'portfolio', targetId: auth.user.id });
  const prefs = await getPrefs(auth.user.id);
  return c.json({ portfolio: ownerPayload(row, prefs.shownAttemptIds) });
});

/** New share token; every previously shared unlisted link stops working. */
portfolioRoutes.post('/share-token/rotate', async (c) => {
  const auth = requireAuth(c);
  await ensurePortfolio(auth.user.id);
  const [row] = await db.update(portfolios).set({ shareToken: randomToken(18), updatedAt: new Date() }).where(eq(portfolios.userId, auth.user.id)).returning();
  await audit(c, { action: 'portfolio.share_token_rotated', targetType: 'portfolio', targetId: auth.user.id });
  return c.json({ shareToken: row.shareToken, sharePath: sharePath(row) });
});

portfolioRoutes.get('/versions', async (c) => {
  const auth = requireAuth(c);
  const rows = await db
    .select({ id: portfolioVersions.id, version: portfolioVersions.version, snapshot: portfolioVersions.snapshot, createdAt: portfolioVersions.createdAt })
    .from(portfolioVersions)
    .where(eq(portfolioVersions.userId, auth.user.id))
    .orderBy(desc(portfolioVersions.version))
    .limit(100);
  return c.json({ items: rows, total: rows.length });
});

/** Restores the editable content of a snapshot (not visibility or the share token) and records a new version. */
portfolioRoutes.post('/versions/:version/restore', async (c) => {
  const auth = requireAuth(c);
  const version = Number(c.req.param('version'));
  if (!Number.isInteger(version) || version < 1) throw badRequest('Invalid version.');
  const [v] = await db.select().from(portfolioVersions).where(and(eq(portfolioVersions.userId, auth.user.id), eq(portfolioVersions.version, version)));
  if (!v) throw notFound('Version');
  const s = v.snapshot as Record<string, unknown>;
  const p = await ensurePortfolio(auth.user.id);
  await db
    .update(portfolios)
    .set({
      headline: (s.headline as string | null) ?? null,
      about: (s.about as string | null) ?? null,
      sections: (s.sections as typeof p.sections) ?? p.sections,
      featuredProjectIds: (s.featuredProjectIds as string[]) ?? [],
      hiddenEvidenceIds: (s.hiddenEvidenceIds as string[]) ?? [],
      writing: (s.writing as typeof p.writing) ?? [],
      updatedAt: new Date(),
    })
    .where(eq(portfolios.userId, auth.user.id));
  await getPrefs(auth.user.id);
  await db.update(portfolioPrefs).set({ shownAttemptIds: (s.shownAttemptIds as string[]) ?? [] }).where(eq(portfolioPrefs.userId, auth.user.id));
  const newVersion = await snapshotVersion(auth.user.id, `Restored from version ${version}`);
  const [row] = await db.select().from(portfolios).where(eq(portfolios.userId, auth.user.id));
  const prefs = await getPrefs(auth.user.id);
  return c.json({ portfolio: ownerPayload(row, prefs.shownAttemptIds), version: newVersion });
});

// ---------- Certificates ----------

portfolioRoutes.get('/certificates', async (c) => {
  const auth = requireAuth(c);
  const rows = await db.select().from(certificates).where(eq(certificates.userId, auth.user.id)).orderBy(desc(certificates.issuedAt));
  return c.json({ items: rows, total: rows.length });
});

/** External certificates are stored as self-reported and never get a verification code. */
portfolioRoutes.post('/certificates', async (c) => {
  const auth = requireAuth(c);
  const input = await body(
    c,
    z.object({
      title: z.string().trim().min(2, 'Enter the certificate name.').max(200),
      issuer: z.string().trim().min(2, 'Enter who issued it.').max(200),
      issuedAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date.')),
      credentialUrl: httpUrl.nullable().optional(),
    }),
  );
  const issuedAt = new Date(input.issuedAt);
  if (Number.isNaN(issuedAt.getTime()) || issuedAt.getTime() > Date.now() + 86400_000) throw badRequest('Enter a past date.', { fields: { issuedAt: 'Enter a past date.' } });
  const [row] = await db
    .insert(certificates)
    .values({ userId: auth.user.id, kind: 'external_self_reported', title: input.title, issuer: input.issuer, issuedAt, credentialUrl: input.credentialUrl ?? null })
    .returning();
  return c.json({ certificate: row }, 201);
});

portfolioRoutes.delete('/certificates/:id', async (c) => {
  const auth = requireAuth(c);
  const id = c.req.param('id');
  if (!z.string().uuid().safeParse(id).success) throw badRequest('Invalid id.');
  const res = await db
    .delete(certificates)
    .where(and(eq(certificates.id, id), eq(certificates.userId, auth.user.id), eq(certificates.kind, 'external_self_reported')))
    .returning({ id: certificates.id });
  if (!res.length) throw notFound('Certificate');
  return c.json({ ok: true });
});

// ---------- Exports & integration ----------

/** Downloadable markdown summary of what the portfolio shows (visibility settings applied). */
portfolioRoutes.get('/summary.md', async (c) => {
  const auth = requireAuth(c);
  const view = await composePortfolio(auth.user.id, 'public');
  const md = summaryMarkdown(view, config().APP_URL);
  await audit(c, { action: 'portfolio.exported', targetType: 'portfolio', targetId: auth.user.id, meta: { format: 'markdown' } });
  c.header('content-type', 'text/markdown; charset=utf-8');
  c.header('content-disposition', `attachment; filename="${view.portfolio.slug}-portfolio.md"`);
  return c.body(md);
});

/** Lightweight evidence feed for the resume builder: projects (with review status) and verified skills. */
portfolioRoutes.get('/evidence-for-resume', async (c) => {
  const auth = requireAuth(c);
  return c.json(await evidenceForResume(auth.user.id));
});
