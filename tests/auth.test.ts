import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestApp, client, registerUser } from './helpers';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(async () => ctx.close());

describe('authentication and sessions', () => {
  it('registers, reads /me, logs out', async () => {
    const c = await registerUser(ctx.app, 'Asha Rao', 'asha@example.test');
    const me = await c.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('asha@example.test');
    expect(me.body.workspaces).toEqual(['learner', 'career']);
    await c.post('/api/auth/logout');
    const after = await c.get('/api/auth/me');
    expect(after.body.user).toBeNull();
  });

  it('rejects duplicate emails case-insensitively and weak passwords', async () => {
    const c = client(ctx.app);
    const dup = await c.post('/api/auth/register', { name: 'Xavier', email: 'ASHA@example.test', password: 'abcdefghij1' });
    expect(dup.status).toBe(409);
    const weak = await c.post('/api/auth/register', { name: 'Weak', email: 'weak@example.test', password: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.details.fields.password).toBeTruthy();
  });

  it('does not reveal whether an email exists on bad login', async () => {
    const c = client(ctx.app);
    const a = await c.post('/api/auth/login', { email: 'asha@example.test', password: 'wrong-password-1' });
    const b = await c.post('/api/auth/login', { email: 'nobody@example.test', password: 'wrong-password-1' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });

  it('revokes other sessions, and a revoked session stops working', async () => {
    const first = client(ctx.app);
    await first.post('/api/auth/login', { email: 'asha@example.test', password: 'correct-horse-42' });
    const second = client(ctx.app);
    await second.post('/api/auth/login', { email: 'asha@example.test', password: 'correct-horse-42' });
    const list = await second.get('/api/auth/sessions');
    expect(list.body.sessions.length).toBeGreaterThanOrEqual(2);
    const r = await second.post('/api/auth/sessions/revoke', { allOthers: true });
    expect(r.body.revoked).toBeGreaterThanOrEqual(1);
    expect((await first.get('/api/auth/me')).body.user).toBeNull();
    expect((await second.get('/api/auth/me')).body.user.email).toBe('asha@example.test');
  });

  it('blocks cross-origin state-changing requests', async () => {
    const res = await ctx.app.request('/api/auth/login', {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'asha@example.test', password: 'correct-horse-42' }),
    });
    expect(res.status).toBe(403);
  });

  it('refuses switching into a workspace the user has no role for', async () => {
    const c = await registerUser(ctx.app, 'Ben', 'ben@example.test');
    const r = await c.post('/api/auth/switch', { workspace: 'admin' });
    expect(r.status).toBe(403);
    const t = await c.post('/api/auth/switch', { workspace: 'teach' });
    expect(t.status).toBe(403);
  });
});
