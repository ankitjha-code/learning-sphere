import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { files } from '../../db/schema';
import { type AppEnv, type Ctx, requireAuth, rolesIn } from '../../lib/context';
import { idParam, parse, query } from '../../lib/validate';
import { badRequest, notFound } from '../../lib/errors';
import { rateLimit } from '../../lib/ratelimit';
import {
  IMAGE_KINDS,
  KIND_MIME,
  UPLOAD_PURPOSES,
  loadAccessibleFile,
  publicFile,
  softDeleteFile,
  storageUsed,
  storeFile,
  userQuotaBytes,
  validateUpload,
  type FileKind,
} from './service';
import { ensureScheduled } from './recurring';

/** Mounted at /api/files. */
export const fileRoutes = new Hono<AppEnv>();

fileRoutes.use('*', async (_c, next) => {
  ensureScheduled('files.cleanup', 3600_000);
  await next();
});

/** Reads one multipart file plus text fields. Shared by modules that accept uploads. */
export async function readMultipart(c: Ctx, field: string | string[] = 'file') {
  const type = c.req.header('content-type') ?? '';
  if (!type.includes('multipart/form-data')) throw badRequest('Send the file as multipart/form-data.');
  let form: Record<string, string | File | (string | File)[]>;
  try {
    form = await c.req.parseBody({ all: true });
  } catch {
    throw badRequest('Could not read the uploaded form.');
  }
  const list = (Array.isArray(field) ? field : [field])
    .flatMap((k) => {
      const raw = form[k];
      return Array.isArray(raw) ? raw : raw ? [raw] : [];
    })
    .filter((v): v is File => typeof v !== 'string');
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(form)) if (typeof v === 'string') fields[k] = v;
  return { files: list, fields };
}

export async function fileBuffer(f: File) {
  return Buffer.from(await f.arrayBuffer());
}

fileRoutes.post('/', async (c) => {
  const auth = requireAuth(c);
  rateLimit(`upload:${auth.user.id}`, 60, 3600_000);
  const { files: uploads, fields } = await readMultipart(c);
  if (!uploads.length) throw badRequest('Choose a file to upload.', { fields: { file: 'Required' } });
  const meta = parse(z.object({ purpose: z.enum(UPLOAD_PURPOSES).default('attachment'), orgId: z.string().uuid().optional() }), fields);
  // An org tag is only accepted for orgs the uploader belongs to.
  if (meta.orgId && !rolesIn(auth, meta.orgId).length) throw badRequest('You are not a member of that organization.');
  const f = uploads[0];
  const data = await fileBuffer(f);
  const v = validateUpload(meta.purpose, f.name, data);
  const file = await storeFile({ ownerId: auth.user.id, orgId: meta.orgId ?? null, purpose: meta.purpose, filename: v.filename, mime: v.mime, data, enforceQuota: true });
  return c.json({ file }, 201);
});

fileRoutes.get('/', async (c) => {
  const auth = requireAuth(c);
  const q = query(
    c,
    z.object({
      purpose: z.string().max(30).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }),
  );
  const where = and(eq(files.ownerId, auth.user.id), eq(files.status, 'ready'), q.purpose ? eq(files.purpose, q.purpose) : undefined);
  const rows = await db
    .select({
      id: files.id,
      ownerId: files.ownerId,
      orgId: files.orgId,
      purpose: files.purpose,
      filename: files.filename,
      mime: files.mime,
      size: files.size,
      sha256: files.sha256,
      status: files.status,
      expiresAt: files.expiresAt,
      createdAt: files.createdAt,
    })
    .from(files)
    .where(where)
    .orderBy(desc(files.createdAt))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(files).where(where);
  const [used, quota] = await Promise.all([storageUsed(auth.user.id), userQuotaBytes()]);
  return c.json({ items: rows.map((r) => publicFile({ ...r, data: null })), total, usage: { used, quota } });
});

fileRoutes.get('/usage', async (c) => {
  const auth = requireAuth(c);
  const byPurpose = await db
    .select({ purpose: files.purpose, bytes: sql<number>`coalesce(sum(${files.size}), 0)::bigint`, count: sql<number>`count(*)::int` })
    .from(files)
    .where(and(eq(files.ownerId, auth.user.id), eq(files.status, 'ready'), ne(files.purpose, 'export')))
    .groupBy(files.purpose);
  const [used, quota] = await Promise.all([storageUsed(auth.user.id), userQuotaBytes()]);
  return c.json({ used, quota, byPurpose: byPurpose.map((r) => ({ purpose: r.purpose, bytes: Number(r.bytes), count: r.count })) });
});

fileRoutes.get('/:id/meta', async (c) => {
  const auth = requireAuth(c);
  const f = await loadAccessibleFile(auth, idParam(c), false);
  if (!f) throw notFound('File');
  return c.json({ file: publicFile(f) });
});

function contentDisposition(kind: 'inline' | 'attachment', filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

fileRoutes.get('/:id', async (c) => {
  const auth = requireAuth(c);
  const f = await loadAccessibleFile(auth, idParam(c), true);
  if (!f || !f.data) throw notFound('File');
  const kind = (Object.entries(KIND_MIME).find(([, m]) => m === f.mime)?.[0] ?? null) as FileKind | null;
  const inline = !!kind && IMAGE_KINDS.includes(kind);
  c.header('Content-Type', f.mime);
  c.header('Content-Length', String(f.data.length));
  c.header('Content-Disposition', contentDisposition(inline ? 'inline' : 'attachment', f.filename));
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Cache-Control', 'private, max-age=0, must-revalidate');
  c.header('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  return c.body(new Uint8Array(f.data));
});

fileRoutes.delete('/:id', async (c) => {
  const auth = requireAuth(c);
  const ok = await softDeleteFile(idParam(c), auth.user.id);
  if (!ok) throw notFound('File');
  return c.json({ ok: true });
});
