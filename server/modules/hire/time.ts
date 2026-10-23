/** Formats a time in the recipient's timezone (falls back to UTC) for notification text. */
export function formatInTz(d: Date, tz: string | null | undefined): string {
  const zone = tz || 'UTC';
  try {
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: zone, timeZoneName: 'short' }).format(d);
  } catch {
    return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  }
}
