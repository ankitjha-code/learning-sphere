import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SignOutIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage, ApiError } from '@/lib/api';
import { Button, ConfirmDialog } from '@/components/ui';

// ---------- Types that mirror the server contract ----------

export type EducationItem = { institution: string; degree?: string; field?: string; startYear?: number; endYear?: number; grade?: string };
export type ExperienceItem = { company: string; title: string; start?: string; end?: string; summary?: string };
export type LinkItem = { label: string; url: string };

export type Profile = {
  userId: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  stage: string | null;
  education: EducationItem[];
  experience: ExperienceItem[];
  interests: string[];
  targetRoles: string[];
  targetDate: string | null;
  weeklyHours: number | null;
  learningStyle: string | null;
  preferredLanguages: string[];
  links: LinkItem[];
};

export type ProfileResponse = { profile: Profile | null; user: { name: string; email: string; timezone: string } };

export type Preferences = {
  theme?: 'light' | 'dark' | 'system';
  reducedMotion?: boolean;
  publicProfile?: boolean;
  showOnLeaderboard?: boolean;
  studyReminders?: boolean;
  restDays?: number[];
  notifications?: Record<string, { inApp: boolean; email: boolean }>;
};

export type PreferencesPatch = Preferences & { locale?: string };

export type SessionRow = { id: string; userAgent: string | null; ip: string | null; createdAt: string; lastSeenAt: string | null; current: boolean };

// ---------- Helpers ----------

/** Field errors from a failed request, keyed by the server's field path (for example "education.0.institution"). */
export function fieldErrors(e: unknown): Record<string, string> {
  return e instanceof ApiError ? e.fields : {};
}

export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return 'Unknown size';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

/** All IANA time zones when the browser can list them, otherwise a short fallback list. */
export function timeZones(current?: string): string[] {
  const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  let list: string[] = [];
  try {
    list = fn ? fn('timeZone') : [];
  } catch {
    list = [];
  }
  if (!list.length) list = ['UTC', 'Asia/Kolkata', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Singapore', 'Australia/Sydney'];
  if (!list.includes('UTC')) list = ['UTC', ...list];
  if (current && !list.includes(current)) list = [current, ...list];
  return list;
}

/** Human summary of a user agent string, for example "Chrome on macOS". */
export function summarizeUserAgent(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : /curl|node|undici|axios|python/i.test(ua)
              ? 'Script or API client'
              : 'Browser';
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X|Macintosh/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /CrOS/.test(ua)
            ? 'ChromeOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : null;
  return os ? `${browser} on ${os}` : browser;
}

// ---------- Layout ----------

/**
 * The one save row used by every settings card: a full-width strip under the card body,
 * actions on the right, an optional status note on the left.
 */
export function SettingsFooter({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4">
      {note && <span className="mr-auto text-[12.5px] text-muted">{note}</span>}
      {children}
    </div>
  );
}

/** "Nothing here yet" inside a card: a quiet row instead of a dashed box, so cards never nest. */
export function InlineEmpty({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-md bg-surface-2 px-4 py-4 sm:flex-row sm:items-center">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface text-muted ring-1 ring-inset ring-border [&_svg]:h-[18px] [&_svg]:w-[18px]" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium">{title}</div>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ---------- Shared actions ----------

/** "Sign out all other sessions" button with confirmation. Used on Security and Privacy. */
export function SignOutOthersButton({ disabled, disabledReason, size = 'md' }: { disabled?: boolean; disabledReason?: string; size?: 'sm' | 'md' }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const m = useMutation({
    mutationFn: () => api.post<{ ok: true; revoked: number }>('/auth/sessions/revoke', { allOthers: true }),
    onSuccess: (r) => {
      setOpen(false);
      toast.success(r.revoked ? `Signed out ${r.revoked} other session${r.revoked === 1 ? '' : 's'}.` : 'No other sessions were active.');
      qc.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <Button size={size} icon={<SignOutIcon size={16} />} onClick={() => setOpen(true)} disabled={disabled} disabledReason={disabledReason}>
        Sign out all other sessions
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Sign out all other sessions?"
        description="Every other browser and device signed in to your account will be signed out right away. This device stays signed in."
        confirmLabel="Sign out others"
        danger
        loading={m.isPending}
        onConfirm={() => m.mutate()}
      />
    </>
  );
}
