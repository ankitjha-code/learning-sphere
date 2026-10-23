import nodemailer from 'nodemailer';
import { config } from './config';

export type EmailResult =
  | { status: 'accepted' | 'captured_locally'; provider: string; messageId?: string }
  | { status: 'not_configured'; provider: null };

export type EmailProviderInfo = { configured: boolean; provider: string | null; from: string | null; note: string };

/**
 * Order: Brevo HTTP → Resend HTTP → SMTP. HTTP APIs come first because some free
 * hosts (e.g. Render Free) block outbound SMTP ports.
 * "accepted" means the provider accepted the message for delivery; we never claim inbox delivery.
 */
export function emailProvider(): EmailProviderInfo {
  const c = config();
  const from = c.EMAIL_FROM ?? null;
  if (c.BREVO_API_KEY && from) return { configured: true, provider: 'brevo', from, note: 'Brevo HTTP API (free: 300 emails/day)' };
  if (c.RESEND_API_KEY && from) return { configured: true, provider: 'resend', from, note: 'Resend HTTP API (free: 100 emails/day, verified domain)' };
  if (c.SMTP_HOST) {
    const local = /^(localhost|127\.0\.0\.1|mailpit|mailhog)$/.test(c.SMTP_HOST);
    return {
      configured: true,
      provider: local ? 'smtp-local' : 'smtp',
      from: from ?? 'LearnSphere Nexus <no-reply@localhost>',
      note: local ? 'Local dev mailbox (messages are captured, not delivered)' : `SMTP via ${c.SMTP_HOST}`,
    };
  }
  return { configured: false, provider: null, from: null, note: 'No email provider configured. In-app notifications still work.' };
}

function parseFrom(from: string) {
  const m = from.match(/^(.*)<(.+)>$/);
  return m ? { name: m[1].trim().replace(/^"|"$/g, ''), email: m[2].trim() } : { name: 'LearnSphere Nexus', email: from.trim() };
}

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

export async function sendEmail(msg: { to: string; subject: string; text: string; html?: string }): Promise<EmailResult> {
  const info = emailProvider();
  const c = config();
  if (!info.configured || !info.from) return { status: 'not_configured', provider: null };

  if (info.provider === 'brevo') {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': c.BREVO_API_KEY!, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: parseFrom(info.from),
        to: [{ email: msg.to }],
        subject: msg.subject,
        textContent: msg.text,
        htmlContent: msg.html ?? `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(msg.text)}</pre>`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Brevo rejected the message (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { messageId?: string };
    return { status: 'accepted', provider: 'brevo', messageId: body.messageId };
  }

  if (info.provider === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${c.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: info.from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Resend rejected the message (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { id?: string };
    return { status: 'accepted', provider: 'resend', messageId: body.id };
  }

  transport ??= nodemailer.createTransport({
    host: c.SMTP_HOST,
    port: c.SMTP_PORT ?? (c.SMTP_SECURE ? 465 : 587),
    secure: c.SMTP_SECURE,
    auth: c.SMTP_USER ? { user: c.SMTP_USER, pass: c.SMTP_PASS } : undefined,
    connectionTimeout: 10000,
  });
  const sent = await transport.sendMail({ from: info.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
  if (!sent.accepted?.length) throw new Error(`SMTP server did not accept the recipient: ${JSON.stringify(sent.rejected)}`);
  return { status: info.provider === 'smtp-local' ? 'captured_locally' : 'accepted', provider: info.provider!, messageId: sent.messageId };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}
