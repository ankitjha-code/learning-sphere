import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { files, systemSettings } from '../../db/schema';
import type { AuthContext } from '../../lib/context';
import { sha256 } from '../../lib/crypto';
import { badRequest, AppError } from '../../lib/errors';

/**
 * File storage service. Files live in Postgres (files.data bytea) so they are
 * portable and backed up with the database.
 *
 * Other modules call `storeFile()` to save server-generated or validated uploads
 * and `registerFileAccess(purpose, check)` to let people other than the owner
 * download files of that purpose (e.g. instructors reading a submission).
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const DEFAULT_USER_QUOTA_BYTES = 200 * 1024 * 1024;

export type FileKind = 'pdf' | 'png' | 'jpeg' | 'webp' | 'gif' | 'txt' | 'md' | 'csv' | 'json' | 'zip' | 'docx';

export const KIND_MIME: Record<FileKind, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  json: 'application/json',
  zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const EXT_KIND: Record<string, FileKind> = {
  pdf: 'pdf',
  png: 'png',
  jpg: 'jpeg',
  jpeg: 'jpeg',
  webp: 'webp',
  gif: 'gif',
  txt: 'txt',
  text: 'txt',
  md: 'md',
  markdown: 'md',
  csv: 'csv',
  json: 'json',
  zip: 'zip',
  docx: 'docx',
};

export const IMAGE_KINDS: FileKind[] = ['png', 'jpeg', 'webp', 'gif'];
const TEXT_KINDS: FileKind[] = ['txt', 'md', 'csv', 'json'];
const ALL_KINDS = Object.keys(KIND_MIME) as FileKind[];

/** Which file types each upload purpose accepts. `export` is server-generated only. */
export const PURPOSE_KINDS: Record<string, FileKind[]> = {
  attachment: ALL_KINDS,
  submission: ALL_KINDS,
  knowledge: ['pdf', 'txt', 'md'],
  resume: ['pdf', 'docx'],
  avatar: IMAGE_KINDS,
  project: ['png', 'jpeg', 'webp', 'gif', 'pdf', 'md', 'txt', 'zip'],
  import: ['md', 'txt', 'json'],
  resource: ['pdf', 'png', 'jpeg', 'webp', 'gif', 'md', 'txt', 'csv', 'zip'],
};
export const UPLOAD_PURPOSES = Object.keys(PURPOSE_KINDS) as [string, ...string[]];

function startsWith(buf: Buffer, bytes: number[], offset = 0) {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

function isUtf8Text(buf: Buffer) {
  if (buf.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

/** Identifies a file by its content (magic bytes), never by its name. Returns null when unknown. */
export function sniffKind(buf: Buffer): FileKind | 'text' | null {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf'; // %PDF-
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith(buf, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) return 'gif';
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buf, [0x50, 0x4b, 0x05, 0x06])) {
    // A .docx is a zip whose entries include word/document.xml.
    const head = buf.subarray(0, Math.min(buf.length, 256 * 1024)).toString('latin1');
    if (head.includes('word/document.xml') || (head.includes('[Content_Types].xml') && head.includes('word/'))) return 'docx';
    return 'zip';
  }
  if (isUtf8Text(buf)) return 'text';
  return null;
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^\p{L}\p{N}._\- ()]+/gu, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+/, '')
    .trim();
  const safe = cleaned || 'file';
  if (safe.length <= 120) return safe;
  const dot = safe.lastIndexOf('.');
  const ext = dot > 0 ? safe.slice(dot) : '';
  return safe.slice(0, 120 - ext.length) + ext;
}

export function extensionOf(name: string) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * Validates an upload: size, purpose allowlist and content-vs-extension match.
 * A file whose bytes do not match its extension (e.g. HTML renamed to .png) is rejected.
 */
export function validateUpload(purpose: string, filename: string, data: Buffer): { kind: FileKind; mime: string; filename: string } {
  const allowed = PURPOSE_KINDS[purpose];
  if (!allowed) throw badRequest('Unknown upload purpose.');
  if (data.length === 0) throw badRequest('The file is empty.');
  if (data.length > MAX_FILE_BYTES) throw new AppError(413, 'too_large', 'Upload is too large (limit 10 MB).');
  const clean = sanitizeFilename(filename);
  const claimed = EXT_KIND[extensionOf(clean)];
  if (!claimed) throw badRequest(`This file type is not supported. Allowed here: ${allowed.join(', ')}.`, { fields: { file: 'Unsupported type' } });
  if (!allowed.includes(claimed)) throw badRequest(`${claimed.toUpperCase()} files are not accepted here. Allowed: ${allowed.join(', ')}.`, { fields: { file: 'Type not allowed' } });
  const actual = sniffKind(data);
  const matches = TEXT_KINDS.includes(claimed) ? actual === 'text' : actual === claimed;
  if (!matches) {
    throw badRequest('The file contents do not match its extension, so it was rejected.', { fields: { file: 'Contents do not match the file type' } });
  }
  if (claimed === 'json') {
    try {
      JSON.parse(data.toString('utf8'));
    } catch {
      throw badRequest('This JSON file is not valid JSON.', { fields: { file: 'Invalid JSON' } });
    }
  }
  return { kind: claimed, mime: KIND_MIME[claimed], filename: clean };
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db.select({ value: systemSettings.value }).from(systemSettings).where(eq(systemSettings.key, key));
  return (row?.value as T) ?? fallback;
}

export async function userQuotaBytes() {
  const v = await getSetting<number>('storage.userQuotaBytes', DEFAULT_USER_QUOTA_BYTES);
  return typeof v === 'number' && v > 0 ? v : DEFAULT_USER_QUOTA_BYTES;
}

/** Bytes a user currently stores (ready files; server-generated exports do not count). */
export async function storageUsed(userId: string) {
  const [row] = await db
    .select({ used: sql<number>`coalesce(sum(${files.size}), 0)::bigint` })
    .from(files)
    .where(and(eq(files.ownerId, userId), eq(files.status, 'ready'), ne(files.purpose, 'export')));
  return Number(row?.used ?? 0);
}

export async function storeFile(input: {
  ownerId: string | null;
  orgId?: string | null;
  purpose: string;
  filename: string;
  mime: string;
  data: Buffer;
  expiresAt?: Date | null;
  enforceQuota?: boolean;
}) {
  if (input.enforceQuota && input.ownerId) {
    const [used, quota] = await Promise.all([storageUsed(input.ownerId), userQuotaBytes()]);
    if (used + input.data.length > quota) {
      throw new AppError(413, 'quota_exceeded', `This upload would exceed your storage quota (${Math.round(quota / 1024 / 1024)} MB). Delete files you no longer need and try again.`);
    }
  }
  const [row] = await db
    .insert(files)
    .values({
      ownerId: input.ownerId,
      orgId: input.orgId ?? null,
      purpose: input.purpose,
      filename: sanitizeFilename(input.filename),
      mime: input.mime,
      size: input.data.length,
      sha256: sha256(input.data),
      data: input.data,
      expiresAt: input.expiresAt ?? null,
    })
    .returning();
  return publicFile(row);
}

export function publicFile(f: typeof files.$inferSelect) {
  return {
    id: f.id,
    purpose: f.purpose,
    filename: f.filename,
    mime: f.mime,
    size: f.size,
    sha256: f.sha256,
    status: f.status,
    orgId: f.orgId,
    expiresAt: f.expiresAt,
    createdAt: f.createdAt,
    url: `/api/files/${f.id}`,
  };
}

// ---------- Delegated access ----------

export type FileRecord = Omit<typeof files.$inferSelect, 'data'>;
export type FileAccessCheck = (auth: AuthContext, file: FileRecord) => Promise<boolean> | boolean;
const accessChecks = new Map<string, FileAccessCheck[]>();

/**
 * Lets a module grant download access to files of a purpose beyond the owner.
 * Example (assignments): registerFileAccess('submission', async (auth, file) => isInstructorFor(auth, file.id)).
 * Access is denied unless a check returns true.
 */
export function registerFileAccess(purpose: string, check: FileAccessCheck) {
  const list = accessChecks.get(purpose) ?? [];
  list.push(check);
  accessChecks.set(purpose, list);
}

export async function canAccessFile(auth: AuthContext, file: FileRecord): Promise<boolean> {
  if (file.ownerId && file.ownerId === auth.user.id) return true;
  for (const check of accessChecks.get(file.purpose) ?? []) {
    try {
      if (await check(auth, file)) return true;
    } catch {
      // A failing check never grants access.
    }
  }
  return false;
}

/** Loads a downloadable file the caller may read, or null (callers return 404). */
export async function loadAccessibleFile(auth: AuthContext, id: string, withData = true) {
  const cols = {
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
  };
  const [meta] = await db.select(cols).from(files).where(and(eq(files.id, id), eq(files.status, 'ready')));
  if (!meta) return null;
  if (meta.expiresAt && new Date(meta.expiresAt).getTime() < Date.now()) return null;
  if (!(await canAccessFile(auth, meta))) return null;
  if (!withData) return { ...meta, data: null as Buffer | null };
  const [row] = await db.select({ data: files.data }).from(files).where(eq(files.id, id));
  return { ...meta, data: row?.data ?? null };
}

/** Soft-deletes a file: keeps the row for audit, removes the bytes. */
export async function softDeleteFile(id: string, ownerId?: string) {
  const res = await db
    .update(files)
    .set({ status: 'deleted', data: null })
    .where(and(eq(files.id, id), ownerId ? eq(files.ownerId, ownerId) : undefined, ne(files.status, 'deleted')))
    .returning({ id: files.id });
  return res.length > 0;
}
