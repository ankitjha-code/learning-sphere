import { expect, type Page, type APIRequestContext } from '@playwright/test';

export const DEMO_PASSWORD = 'Demo-pass-2026';
export const demo = (local: string) => `${local}@demo.learnsphere.test`;

/** Signs in through the API (shares cookies with the page) and optionally switches workspace/org. */
export async function login(page: Page, email: string, opts: { workspace?: string; orgName?: string; password?: string } = {}) {
  const base = new URL(page.url() === 'about:blank' ? 'http://127.0.0.1:4417' : page.url()).origin;
  const origin = { origin: 'http://127.0.0.1:4417' };
  const r = await page.request.post('/api/auth/login', { data: { email, password: opts.password ?? DEMO_PASSWORD }, headers: origin });
  expect(r.ok(), `login ${email}`).toBeTruthy();
  if (opts.workspace || opts.orgName) {
    const me = await (await page.request.get('/api/auth/me')).json();
    const org = opts.orgName ? me.memberships.find((m: { orgName: string }) => m.orgName.includes(opts.orgName!)) : me.memberships[0];
    const s = await page.request.post('/api/auth/switch', { data: { orgId: org?.orgId ?? null, workspace: opts.workspace }, headers: origin });
    expect(s.ok(), `switch ${opts.workspace}`).toBeTruthy();
  }
  void base;
}

export async function api<T = any>(req: APIRequestContext, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, data?: unknown): Promise<{ status: number; body: T }> {
  const r = await req[method](path, { data, headers: { origin: 'http://127.0.0.1:4417' } });
  let body: any = null;
  try {
    body = await r.json();
  } catch {
    body = null;
  }
  return { status: r.status(), body };
}

/** Replaces the whole CodeMirror document with `code`. */
export async function setEditor(page: Page, code: string) {
  const editor = page.locator('.cm-content').first();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
  // One input event (like a paste): no auto-indent or bracket closing per keystroke.
  await page.keyboard.insertText(code);
  await expect(editor).toContainText(code.split('\n')[0].trim().slice(0, 20));
}

export function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.test`;
}
