import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DevicesIcon, LockKeyIcon, DesktopIcon, DeviceMobileIcon, XCircleIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { Badge, Banner, Button, Card, CardBody, CardHeader, ConfirmDialog, ErrorState, Field, Input, SkeletonRows } from '@/components/ui';
import { InlineEmpty, SettingsFooter, fieldErrors, summarizeUserAgent, SignOutOthersButton, type SessionRow } from './shared';

export default function SecurityPage() {
  return (
    <div className="space-y-4">
      <ChangePasswordCard />
      <SessionsCard />
    </div>
  );
}

function passwordProblem(p: string): string | null {
  if (!p) return null;
  if (p.length < 10) return 'Use at least 10 characters.';
  if (!/[a-zA-Z]/.test(p) || !/[0-9]/.test(p)) return 'Include at least one letter and one number.';
  return null;
}

function ChangePasswordCard() {
  const qc = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== next;
  const weak = passwordProblem(next);
  const blockedReason = !current
    ? 'Enter your current password'
    : !next
      ? 'Enter a new password'
      : weak
        ? weak
        : confirm !== next
          ? 'The new passwords do not match'
          : null;

  const m = useMutation({
    mutationFn: () => api.post('/auth/password', { currentPassword: current, newPassword: next }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setConfirm('');
      setErrors({});
      setTouched(false);
      toast.success('Password changed. Other sessions were signed out.');
      qc.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
    onError: (e) => {
      setErrors(fieldErrors(e));
      toast.error(errorMessage(e));
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (blockedReason) return;
    m.mutate();
  };

  return (
    <Card>
      <CardHeader title="Change password" description="Changing your password signs out every other browser and device. This one stays signed in." />
      <form onSubmit={onSubmit} noValidate>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Current password" error={errors.currentPassword} className="sm:col-span-2 sm:max-w-[calc(50%-8px)]">
            <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label="New password" error={errors.newPassword ?? (touched || next.length >= 10 ? (weak ?? undefined) : undefined)} helper="At least 10 characters, with a letter and a number.">
            <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="Confirm new password" error={mismatch ? 'The new passwords do not match.' : undefined}>
            <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
        </CardBody>
        <SettingsFooter>
          <Button type="submit" variant="primary" icon={<LockKeyIcon size={16} />} loading={m.isPending} disabled={!!blockedReason} disabledReason={blockedReason ?? undefined}>
            Change password
          </Button>
        </SettingsFooter>
      </form>
    </Card>
  );
}

function SessionsCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['auth', 'sessions'], queryFn: () => api.get<{ sessions: SessionRow[] }>('/auth/sessions') });
  const [target, setTarget] = useState<SessionRow | null>(null);
  const [showAll, setShowAll] = useState(false);

  const revoke = useMutation({
    mutationFn: (id: string) => api.post<{ ok: true; revoked: number }>('/auth/sessions/revoke', { id }),
    onSuccess: () => {
      setTarget(null);
      toast.success('Session signed out.');
      qc.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const sessions = q.data?.sessions ?? [];
  const others = sessions.filter((s) => !s.current).length;
  // The current device first, then the most recent; long lists are capped until expanded.
  const ordered = [...sessions].sort((a, b) => Number(b.current) - Number(a.current));
  const LIMIT = 5;
  const shown = showAll ? ordered : ordered.slice(0, LIMIT);

  return (
    <Card>
      <CardHeader
        title="Where you're signed in"
        description="Sign out any session you don't recognise, then change your password."
        action={q.data && <SignOutOthersButton size="sm" disabled={others === 0} disabledReason="No other sessions are signed in" />}
      />
      <div>
        {q.error ? (
          <CardBody>
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          </CardBody>
        ) : q.isLoading ? (
          <CardBody>
            <SkeletonRows rows={3} />
          </CardBody>
        ) : sessions.length === 0 ? (
          <CardBody>
          <InlineEmpty
            icon={<DevicesIcon size={22} />}
            title="No active sessions"
            description="We could not find any active sessions for your account. Refresh to check again."
            action={
              <Button size="sm" onClick={() => q.refetch()}>
                Refresh sessions
              </Button>
            }
          />
          </CardBody>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {shown.map((s) => {
              const device = summarizeUserAgent(s.userAgent);
              const mobile = /iOS|Android/.test(device);
              const DeviceIcon = mobile ? DeviceMobileIcon : DesktopIcon;
              return (
                <li key={s.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted ring-1 ring-inset ring-border">
                      <DeviceIcon size={18} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                        {device}
                        {s.current && <Badge tone="accent">This device</Badge>}
                      </div>
                      <div className="text-[12.5px] text-muted">
                        {s.ip ? `IP ${s.ip}` : 'IP unknown'} · Signed in {formatDateTime(s.createdAt)} · Last active {s.lastSeenAt ? timeAgo(s.lastSeenAt) : 'unknown'}
                      </div>
                      {s.userAgent && (
                        <div className="truncate text-[12px] text-subtle" title={s.userAgent}>
                          {s.userAgent}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 sm:pl-3">
                    <Button
                      size="sm"
                      icon={<XCircleIcon size={14} />}
                      onClick={() => setTarget(s)}
                      disabled={s.current}
                      disabledReason="This is the device you are using. Sign out from the account menu instead."
                      aria-label={`Revoke session on ${device}`}
                    >
                      Revoke
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {ordered.length > LIMIT && (
          <div className="border-t border-border px-5 py-3">
            <button type="button" className="text-[13px] font-medium text-accent-text hover:underline" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              {showAll ? 'Show fewer sessions' : `Show all ${ordered.length} sessions`}
            </button>
          </div>
        )}
        {q.data && others === 0 && sessions.length > 0 && (
          <div className="border-t border-border px-5 py-4">
            <Banner tone="success">Only this device is signed in.</Banner>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={!!target}
        onOpenChange={(v) => !v && setTarget(null)}
        title="Revoke this session?"
        description={target ? `${summarizeUserAgent(target.userAgent)}${target.ip ? ` at ${target.ip}` : ''} will be signed out right away and must sign in again.` : ''}
        confirmLabel="Revoke session"
        danger
        loading={revoke.isPending}
        onConfirm={() => {
          if (target) revoke.mutate(target.id);
        }}
      />
    </Card>
  );
}
