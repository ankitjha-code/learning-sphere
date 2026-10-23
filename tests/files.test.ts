import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupTestApp, registerUser } from './helpers';
import { db } from '../server/db/client';
import { files, systemSettings } from '../server/db/schema';
import { registerFileAccess, sniffKind, sanitizeFilename } from '../server/modules/files/service';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(async () => ctx.close());

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const PDF = Buffer.from('%PDF-1.4\n% test\n1 0 obj << >> endobj\n%%EOF\n', 'latin1');

async function upload(cookie: string, path: string, filename: string, data: Buffer, fields: Record<string, string> = {}) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(data)]), filename);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await ctx.app.request(path, { method: 'POST', headers: { origin: 'http://localhost:5317', cookie }, body: form });
  return { status: res.status, body: (await res.json()) as any };
}

async function download(cookie: string, id: string) {
  return ctx.app.request(`/api/files/${id}`, { headers: { cookie } });
}

describe('files: upload, validation and authorization', () => {
  it('identifies content by magic bytes and sanitizes names', () => {
    expect(sniffKind(PNG)).toBe('png');
    expect(sniffKind(PDF)).toBe('pdf');
    expect(sniffKind(Buffer.from('hello'))).toBe('text');
    expect(sanitizeFilename('../../etc/pa\u0000ss wd<script>.png')).toBe('pass wd_script_.png');
    expect(sanitizeFilename('C:\\Users\\me\\report.pdf')).toBe('report.pdf');
  });

  it('uploads, lists, reports usage and lets only the owner download', async () => {
    const owner = await registerUser(ctx.app, 'File Owner', 'owner@files.test');
    const other = await registerUser(ctx.app, 'Someone Else', 'other@files.test');
    const up = await upload(owner.cookie, '/api/files', 'diagram.png', PNG);
    expect(up.status).toBe(201);
    expect(up.body.file.mime).toBe('image/png');
    expect(up.body.file.sha256).toHaveLength(64);

    const res = await download(owner.cookie, up.body.file.id);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-disposition')).toMatch(/^inline/);
    expect(res.headers.get('cache-control')).toMatch(/private/);
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);

    // Another user cannot learn the file exists.
    expect((await download(other.cookie, up.body.file.id)).status).toBe(404);
    expect((await other.get(`/api/files/${up.body.file.id}/meta`)).status).toBe(404);
    expect((await other.del(`/api/files/${up.body.file.id}`)).status).toBe(404);
    // Signed-out requests are rejected.
    expect((await ctx.app.request(`/api/files/${up.body.file.id}`)).status).toBe(401);

    const pdf = await upload(owner.cookie, '/api/files', 'notes.pdf', PDF);
    expect(pdf.status).toBe(201);
    const pdfRes = await download(owner.cookie, pdf.body.file.id);
    expect(pdfRes.headers.get('content-disposition')).toMatch(/^attachment; filename="notes.pdf"/);

    const list = await owner.get('/api/files');
    expect(list.body.items).toHaveLength(2);
    expect(list.body.usage.used).toBe(PNG.length + PDF.length);
    expect(list.body.usage.quota).toBe(200 * 1024 * 1024);
    expect((await other.get('/api/files')).body.items).toHaveLength(0);
  });

  it('rejects MIME spoofing, unsupported types and per-purpose mismatches', async () => {
    const u = await registerUser(ctx.app, 'Spoofer', 'spoof@files.test');
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    const spoof = await upload(u.cookie, '/api/files', 'cat.png', html);
    expect(spoof.status).toBe(400);
    expect(spoof.body.error.details.fields.file).toMatch(/do not match/);
    expect((await upload(u.cookie, '/api/files', 'page.html', html)).status).toBe(400);
    expect((await upload(u.cookie, '/api/files', 'tool.exe', Buffer.from([0x4d, 0x5a, 0x90, 0x00]))).status).toBe(400);
    // A PDF disguised as a text file is not text.
    expect((await upload(u.cookie, '/api/files', 'bin.txt', Buffer.from([0xff, 0xfe, 0x00, 0x01]))).status).toBe(400);
    // Avatars accept images only.
    expect((await upload(u.cookie, '/api/files', 'cv.pdf', PDF, { purpose: 'avatar' })).status).toBe(400);
    expect((await upload(u.cookie, '/api/files', 'bad.json', Buffer.from('{not json'))).status).toBe(400);
    expect((await upload(u.cookie, '/api/files', 'data.json', Buffer.from('{"ok":true}'))).status).toBe(201);
    expect((await upload(u.cookie, '/api/files', 'x.png', PNG, { purpose: 'nonsense' })).status).toBe(400);
  });

  it('enforces the 10 MB cap and the per-user quota', async () => {
    const u = await registerUser(ctx.app, 'Big Uploader', 'big@files.test');
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(10 * 1024 * 1024 + 10, 0x20)]);
    const r = await upload(u.cookie, '/api/files', 'huge.pdf', big);
    expect(r.status).toBe(413);

    await db.insert(systemSettings).values({ key: 'storage.userQuotaBytes', value: 100 }).onConflictDoUpdate({ target: systemSettings.key, set: { value: 100 } });
    const q = await upload(u.cookie, '/api/files', 'pic.png', PNG.length > 100 ? PNG : Buffer.concat([PNG, Buffer.alloc(100)]));
    expect(q.status).toBe(413);
    expect(q.body.error.code).toBe('quota_exceeded');
    await db.delete(systemSettings).where(eq(systemSettings.key, 'storage.userQuotaBytes'));
  });

  it('soft-deletes own files (bytes removed) and supports delegated access', async () => {
    const owner = await registerUser(ctx.app, 'Student Sam', 'sam@files.test');
    const grader = await registerUser(ctx.app, 'Grader Gia', 'gia@files.test');
    const stranger = await registerUser(ctx.app, 'Stranger Stu', 'stu@files.test');
    registerFileAccess('submission', (auth) => auth.user.email === 'gia@files.test');

    const sub = await upload(owner.cookie, '/api/files', 'essay.md', Buffer.from('# Essay'), { purpose: 'submission' });
    expect(sub.status).toBe(201);
    expect((await download(grader.cookie, sub.body.file.id)).status).toBe(200);
    expect((await download(stranger.cookie, sub.body.file.id)).status).toBe(404);

    const del = await owner.del(`/api/files/${sub.body.file.id}`);
    expect(del.status).toBe(200);
    const [row] = await db.select().from(files).where(eq(files.id, sub.body.file.id));
    expect(row.status).toBe('deleted');
    expect(row.data).toBeNull();
    expect((await download(owner.cookie, sub.body.file.id)).status).toBe(404);
    expect((await owner.del(`/api/files/${sub.body.file.id}`)).status).toBe(404);
  });

  it('hides expired files', async () => {
    const u = await registerUser(ctx.app, 'Expiring', 'exp@files.test');
    const up = await upload(u.cookie, '/api/files', 'old.txt', Buffer.from('old'));
    await db.update(files).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(files.id, up.body.file.id));
    expect((await download(u.cookie, up.body.file.id)).status).toBe(404);
  });
});
