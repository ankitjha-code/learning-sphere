/**
 * Walkthrough recorder for the HTML test report.
 *
 * Each scenario is a Playwright test. Inside it, `rec.step()` performs an action, takes a
 * screenshot and records a plain-language caption; `rec.check()` records an explicit
 * verification. Results are written as JSON to reports/.data and assembled into one HTML
 * file by scripts/build-report.mjs.
 */
import { test as base, expect, type Browser, type BrowserContext, type Page, type APIRequestContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export const BASE = process.env.REPORT_BASE ?? 'http://127.0.0.1:4420';
export const DEMO_PASSWORD = 'Demo-pass-2026';
export const demo = (local: string) => `${local}@demo.learnsphere.test`;

const DATA = path.resolve('reports/.data');

export type ScenarioMeta = {
  id: string; // stable slug, e.g. "learn-03-topic-quiz"
  area: string; // section in the report, e.g. "Learning"
  title: string; // short, plain title
  summary: string; // one or two sentences: what this scenario shows and why it matters
  roles: string[]; // who is involved, e.g. ["Learner"]
};

type Step = { n: number; title: string; explain: string; shot: string | null; ok: boolean; ms: number; error?: string };
type Check = { text: string; ok: boolean; error?: string };

export class Recorder {
  steps: Step[] = [];
  checks: Check[] = [];
  private n = 0;
  constructor(
    public meta: ScenarioMeta,
    public page: Page,
  ) {}

  /** Do something (optional), wait for the screen to settle, screenshot it, and describe it. */
  async step(title: string, explain: string, action?: () => Promise<unknown>, opts: { page?: Page; fullPage?: boolean; settleMs?: number } = {}) {
    const p = opts.page ?? this.page;
    const n = ++this.n;
    const t = Date.now();
    let error: string | undefined;
    try {
      if (action) await action();
      await p.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await p.waitForTimeout(opts.settleMs ?? 400);
    } catch (e) {
      error = (e as Error).message.split('\n')[0].slice(0, 400);
    }
    const dir = path.join(DATA, 'shots', this.meta.id);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${String(n).padStart(2, '0')}.jpg`);
    let shot: string | null = null;
    try {
      await p.screenshot({ path: file, type: 'jpeg', quality: 70, fullPage: opts.fullPage ?? false });
      shot = path.relative(DATA, file);
    } catch {
      shot = null;
    }
    this.steps.push({ n, title, explain, shot, ok: !error, ms: Date.now() - t, error });
    if (error) throw new Error(`Step ${n} "${title}" failed: ${error}`);
  }

  /** An explicit verification, shown as a checklist item in the report. */
  async check(text: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      this.checks.push({ text, ok: true });
    } catch (e) {
      const error = (e as Error).message.split('\n')[0].slice(0, 400);
      this.checks.push({ text, ok: false, error });
      throw new Error(`Check failed: ${text}: ${error}`);
    }
  }

  write(status: 'passed' | 'failed', error?: string) {
    fs.mkdirSync(path.join(DATA, 'scenarios'), { recursive: true });
    fs.writeFileSync(
      path.join(DATA, 'scenarios', `${this.meta.id}.json`),
      JSON.stringify({ ...this.meta, status, error: error?.slice(0, 600), steps: this.steps, checks: this.checks, finishedAt: new Date().toISOString() }, null, 2),
    );
  }
}

/** Signs in through the API (cookies shared with the page) and optionally switches workspace/org. */
export async function login(page: Page, email: string, opts: { workspace?: string; orgName?: string; password?: string } = {}) {
  const r = await page.request.post(`${BASE}/api/auth/login`, { data: { email, password: opts.password ?? DEMO_PASSWORD }, headers: { origin: BASE } });
  expect(r.ok(), `sign in as ${email}`).toBeTruthy();
  if (opts.workspace || opts.orgName) {
    const me = await (await page.request.get(`${BASE}/api/auth/me`)).json();
    const org = opts.orgName ? me.memberships.find((m: { orgName: string }) => m.orgName.includes(opts.orgName!)) : me.memberships[0];
    const s = await page.request.post(`${BASE}/api/auth/switch`, { data: { orgId: org?.orgId ?? null, workspace: opts.workspace }, headers: { origin: BASE } });
    expect(s.ok(), `switch to ${opts.workspace}`).toBeTruthy();
  }
}

/** JSON API call with the CSRF origin header. */
export async function api<T = any>(req: APIRequestContext, method: 'get' | 'post' | 'put' | 'patch' | 'delete', p: string, data?: unknown): Promise<{ status: number; body: T }> {
  const r = await req[method](`${BASE}${p}`, { data, headers: { origin: BASE } });
  let body: any = null;
  try {
    body = await r.json();
  } catch {
    body = null;
  }
  return { status: r.status(), body };
}

/** A second signed-in browser for multi-person scenarios (e.g. recruiter + candidate). */
export async function person(browser: Browser, email: string | null, opts: { workspace?: string; orgName?: string; password?: string; width?: number; theme?: 'light' | 'dark' } = {}): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: opts.width ?? 1440, height: 900 }, colorScheme: opts.theme ?? 'light' });
  const page = await ctx.newPage();
  await page.addInitScript((t) => localStorage.setItem('ls-theme', t), opts.theme ?? 'light');
  if (email) await login(page, email, opts);
  return { ctx, page };
}

/** Replaces the whole CodeMirror document with `code` as one input (like a paste). */
export async function setEditor(page: Page, code: string) {
  const editor = page.locator('.cm-content').first();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(code);
}

export function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.test`;
}

/** Declares a report scenario. */
export function scenario(meta: ScenarioMeta, fn: (rec: Recorder, ctx: { page: Page; browser: Browser }) => Promise<void>) {
  base(`${meta.id}: ${meta.title}`, async ({ browser }) => {
    const { ctx, page } = await person(browser, null);
    const rec = new Recorder(meta, page);
    try {
      await fn(rec, { page, browser });
      rec.write('passed');
    } catch (e) {
      rec.write('failed', (e as Error).message);
      throw e;
    } finally {
      await ctx.close();
    }
  });
}

export { expect };
