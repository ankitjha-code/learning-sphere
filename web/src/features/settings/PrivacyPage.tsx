import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DatabaseIcon,
  DownloadSimpleIcon,
  ClockIcon,
  TrashIcon,
  WarningIcon,
  ScalesIcon,
} from '@phosphor-icons/react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatDateTime, plural } from '@/lib/format';
import {
  Badge,
  Banner,
  Button,
  ButtonLink,
  Card,
  CardAction,
  CardBody,
  CardHeader,
  Dialog,
  ErrorState,
  Field,
  Input,
  Progress,
  Skeleton,
  StatusBadge,
  Switch,
  Textarea,
} from '@/components/ui';
import { InlineEmpty, SettingsFooter, fieldErrors, formatBytes, SignOutOthersButton } from './shared';
import { DeletionSummary, isDeletionSummary, type DeletionSummaryData } from './DeletionSummary';

// ---------- Contract (server/modules/privacy/routes.ts) ----------

type DataRequest = {
  id: string;
  kind: 'export' | 'deletion';
  status: 'pending' | 'processing' | 'ready' | 'expired' | 'cancelled' | 'completed' | 'failed' | string;
  createdAt: string;
  scheduledFor: string | null;
  completedAt: string | null;
  summary: Record<string, unknown> | null;
  file: { id: string; size: number | null; expiresAt: string | null; url: string } | null;
};

type RetentionRule = { key: string; label: string; outcome: 'deleted' | 'anonymized' | 'retained'; detail: string };

type PrivacySummary = {
  status: string;
  deletionRequestedAt: string | null;
  pendingDeletion: DataRequest | null;
  graceDays: number;
  confirmText: string;
  exportTtlDays: number;
  visibility: { publicProfile: boolean; showOnLeaderboard: boolean };
  storage: { used: number; quota: number };
  categories: { key: string; label: string; count: number }[];
  retention: { rules: RetentionRule[]; graceNote: string; exportNote: string };
  requests: DataRequest[];
};

const SUMMARY_KEY = ['privacy', 'summary'] as const;
const scrollToExport = () => document.getElementById('export')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
const inFlight = (r: DataRequest) => r.kind === 'export' && (r.status === 'pending' || r.status === 'processing');

export default function PrivacyPage() {
  const q = useQuery({
    queryKey: SUMMARY_KEY,
    queryFn: () => api.get<PrivacySummary>('/privacy/summary'),
    // Poll while an export is being built so the download link appears on its own.
    refetchInterval: (query) => (query.state.data?.requests.some(inFlight) ? 3000 : false),
  });

  useExportReadyToast(q.data);

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading privacy settings">
        <Skeleton className="h-36" />
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
        <Skeleton className="h-56" />
      </div>
    );
  }
  const s = q.data;
  const completedDeletions = s.requests.filter((r) => r.kind === 'deletion' && r.status === 'completed' && isDeletionSummary(r.summary));

  return (
    <div className="space-y-4">
      {s.pendingDeletion && <PendingDeletionBanner request={s.pendingDeletion} graceNote={s.retention.graceNote} />}
      <VisibilityCard visibility={s.visibility} />
      <YourDataCard summary={s} />
      <ExportCard summary={s} />
      <SessionsShortcutCard />
      <RetentionCard retention={s.retention} graceDays={s.graceDays} />
      {!s.pendingDeletion && <DeleteAccountCard summary={s} />}
      {completedDeletions.map((r) => (
        <Card key={r.id}>
          <CardBody className="pt-4">
            <DeletionSummary summary={r.summary as DeletionSummaryData} />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

/** Announces when a polled export flips to ready. */
function useExportReadyToast(data: PrivacySummary | undefined) {
  const watching = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!data) return;
    for (const r of data.requests) {
      if (inFlight(r)) watching.current.add(r.id);
      else if (watching.current.has(r.id)) {
        watching.current.delete(r.id);
        if (r.status === 'ready') toast.success('Your data export is ready to download.');
        else if (r.status === 'failed') toast.error('Your data export failed. Request a new one or try again later.');
      }
    }
  }, [data]);
}

// ---------- Visibility ----------

function VisibilityCard({ visibility }: { visibility: PrivacySummary['visibility'] }) {
  const qc = useQueryClient();
  const [v, setV] = useState(visibility);
  useEffect(() => setV(visibility), [visibility]);

  const m = useMutation({
    mutationFn: (patch: Partial<PrivacySummary['visibility']>) => api.patch('/me/preferences', patch),
    onMutate: (patch) => {
      const prev = v;
      setV((cur) => ({ ...cur, ...patch }));
      return { prev };
    },
    onSuccess: (_r, patch) => {
      if ('publicProfile' in patch) toast.success(patch.publicProfile ? 'Your profile is now public.' : 'Your profile is now private.');
      else toast.success(patch.showOnLeaderboard ? 'You appear on leaderboards.' : 'You are hidden from leaderboards.');
      qc.invalidateQueries({ queryKey: SUMMARY_KEY });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e, _p, ctx) => {
      if (ctx) setV(ctx.prev);
      toast.error(errorMessage(e));
    },
  });

  return (
    <Card>
      <CardHeader title="Visibility" description="Control who can see you outside your organizations." />
      <CardBody className="space-y-4">
        <Switch
          label="Public profile"
          description="Anyone with your profile link can see your headline, skills and published portfolio. Private notes and scores are never shown."
          checked={v.publicProfile}
          disabled={m.isPending}
          onCheckedChange={(publicProfile) => m.mutate({ publicProfile })}
        />
        <Switch
          label="Show me on leaderboards"
          description="Your name and XP appear on community and cohort leaderboards. Turn off to stay hidden while still earning XP."
          checked={v.showOnLeaderboard}
          disabled={m.isPending}
          onCheckedChange={(showOnLeaderboard) => m.mutate({ showOnLeaderboard })}
        />
      </CardBody>
    </Card>
  );
}

// ---------- Your data ----------

function YourDataCard({ summary }: { summary: PrivacySummary }) {
  const { categories, storage } = summary;
  const total = categories.reduce((n, c) => n + c.count, 0);
  return (
    <Card>
      <CardHeader
        title="Your data"
        description={`${plural(total, 'record')} across ${plural(categories.length, 'category', 'categories')}. Everything here is included in a data export.`}
      />
      <CardBody className="space-y-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[13px]">
            <span className="font-medium">Storage used</span>
            <span className="tabular-nums text-muted">
              {formatBytes(storage.used)} of {formatBytes(storage.quota)}
            </span>
          </div>
          <Progress value={storage.used} max={storage.quota} tone={storage.quota && storage.used / storage.quota > 0.9 ? 'warning' : 'accent'} label="Storage used" />
        </div>
        {categories.length === 0 ? (
          <InlineEmpty
            icon={<DatabaseIcon size={22} />}
            title="No data categories"
            description="We could not list your data categories. You can still request a full export below."
            action={
              <Button size="sm" onClick={scrollToExport}>
                Go to export
              </Button>
            }
          />
        ) : (
          <dl className="-mx-5 -mb-5 grid text-[13.5px] sm:grid-cols-2">
            {categories.map((c) => (
              <div key={c.key} className={clsx('flex items-center justify-between gap-3 border-t border-border px-5 py-2.5 sm:[&:nth-child(odd)]:border-r', !c.count && 'text-subtle')}>
                <dt>{c.label}</dt>
                <dd className="tabular-nums">{c.count.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardBody>
    </Card>
  );
}

// ---------- Export ----------

const KIND_LABEL: Record<string, string> = { export: 'Data export', deletion: 'Account deletion' };

function RequestStatus({ status }: { status: string }) {
  if (status === 'ready') return <Badge tone="success">Ready</Badge>;
  if (status === 'processing') return <Badge tone="info">Processing</Badge>;
  return <StatusBadge status={status} />;
}

function ExportCard({ summary }: { summary: PrivacySummary }) {
  const qc = useQueryClient();
  const pending = summary.requests.find(inFlight);
  const m = useMutation({
    mutationFn: () => api.post<{ request: { id: string; status: string }; created: boolean }>('/privacy/export'),
    onSuccess: (r) => {
      toast.success(r.created ? 'Export requested. We will build it in the background; this page updates when it is ready.' : 'An export is already being prepared.');
      qc.invalidateQueries({ queryKey: SUMMARY_KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const requestButton = (
    <Button
      variant="primary"
      icon={<DownloadSimpleIcon size={16} />}
      loading={m.isPending}
      disabled={!!pending}
      disabledReason="An export is already being prepared. It usually takes under a minute."
      onClick={() => m.mutate()}
    >
      Request data export
    </Button>
  );

  return (
    <Card id="export">
      <CardHeader
        title="Export your data"
        description={`A JSON archive of everything listed above. Downloads stay available for ${plural(summary.exportTtlDays, 'day')} and only you can open them.`}
      />
      <CardBody className="space-y-3">
        {pending && (
          <Banner tone="info" title={pending.status === 'processing' ? 'Building your export' : 'Export queued'}>
            Requested {formatDateTime(pending.createdAt)}. This page checks every few seconds and shows a download link when it is ready.
          </Banner>
        )}
        {summary.requests.length === 0 ? (
          <div className="rounded-md bg-surface-2 px-4 py-3 text-[13px]">
            <div className="font-medium">No export or deletion requests yet</div>
            <p className="mt-0.5 text-muted">Request a copy of your data at any time. We prepare it in the background and keep it for a limited time.</p>
          </div>
        ) : (
          <ul className="-mx-5 divide-y divide-border border-y border-border">
            {summary.requests.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                    {KIND_LABEL[r.kind] ?? r.kind}
                    <RequestStatus status={r.status} />
                  </div>
                  <div className="text-[12.5px] text-muted">
                    Requested {formatDateTime(r.createdAt)}
                    {r.kind === 'deletion' && r.scheduledFor && r.status === 'pending' && ` · Scheduled for ${formatDateTime(r.scheduledFor)}`}
                    {r.completedAt && ` · ${r.status === 'cancelled' ? 'Cancelled' : 'Finished'} ${formatDateTime(r.completedAt)}`}
                  </div>
                  {r.status === 'expired' && <div className="text-[12.5px] text-subtle">This download has expired. Request a new export to get a fresh copy.</div>}
                  {r.status === 'failed' && <div className="text-[12.5px] text-danger">Something went wrong while preparing this. Request a new export to try again.</div>}
                </div>
                {r.file && (
                  <div className="flex shrink-0 flex-col items-start gap-0.5 sm:items-end">
                    <a
                      href={r.file.url}
                      download
                      className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent-soft px-2.5 text-[13px] font-medium text-accent-text hover:brightness-95"
                      aria-label={`Download data export from ${formatDate(r.createdAt)}, ${formatBytes(r.file.size)}`}
                    >
                      <DownloadSimpleIcon size={14} aria-hidden /> Download ({formatBytes(r.file.size)})
                    </a>
                    {r.file.expiresAt && <span className="text-[12px] text-subtle">Available until {formatDateTime(r.file.expiresAt)}</span>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      <SettingsFooter note={summary.retention.exportNote}>{requestButton}</SettingsFooter>
    </Card>
  );
}

// ---------- Sessions shortcut ----------

function SessionsShortcutCard() {
  return (
    <Card>
      <CardHeader
        title="Signed-in devices"
        description="If you are cleaning up your account, sign out of devices you no longer use."
        action={<CardAction to="/app/settings/security">Review sessions</CardAction>}
      />
      <SettingsFooter>
        <SignOutOthersButton />
      </SettingsFooter>
    </Card>
  );
}

// ---------- Retention ----------

const OUTCOME_TONE = { deleted: 'danger', anonymized: 'warning', retained: 'neutral' } as const;
const OUTCOME_LABEL = { deleted: 'Deleted', anonymized: 'Anonymized', retained: 'Retained' } as const;

function RetentionCard({ retention, graceDays }: { retention: PrivacySummary['retention']; graceDays: number }) {
  return (
    <Card>
      <CardHeader
        title="What happens when you delete your account"
        description="Our documented retention rules. Some records must be kept by the organizations you worked with, but never with your name or email."
      />
      <CardBody className="space-y-3">
        {retention.rules.length === 0 ? (
          <InlineEmpty
            icon={<ScalesIcon size={22} />}
            title="No retention rules published"
            description="This server has not published retention rules. Ask an administrator before requesting deletion."
            action={
              <ButtonLink to="/app/settings/security" size="sm">
                Review security instead
              </ButtonLink>
            }
          />
        ) : (
          <ul className="-mx-5 -mt-2 divide-y divide-border border-y border-border">
            {retention.rules.map((r) => (
              <li key={r.key} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium">{r.label}</span>
                  <Badge tone={OUTCOME_TONE[r.outcome] ?? 'neutral'}>{OUTCOME_LABEL[r.outcome] ?? r.outcome}</Badge>
                </div>
                <p className="mt-0.5 text-[13px] text-muted">{r.detail}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-start gap-2 rounded-md bg-surface-2 px-4 py-3 text-[13px] text-muted">
          <ClockIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {retention.graceNote} The grace period is currently {plural(graceDays, 'day')}.
          </span>
        </div>
      </CardBody>
    </Card>
  );
}

// ---------- Pending deletion ----------

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function countdown(ms: number) {
  if (ms <= 0) return 'any moment now';
  const mins = Math.floor(ms / 60_000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const minutes = mins % 60;
  const parts = [days ? plural(days, 'day') : null, hours || days ? plural(hours, 'hour') : null, plural(minutes, 'minute')].filter(Boolean);
  return parts.join(', ');
}

function PendingDeletionBanner({ request, graceNote }: { request: DataRequest; graceNote: string }) {
  const qc = useQueryClient();
  const now = useNow(60_000);
  const when = request.scheduledFor ? new Date(request.scheduledFor).getTime() : null;

  const cancel = useMutation({
    mutationFn: () => api.post('/privacy/delete/cancel'),
    onSuccess: async () => {
      toast.success('Deletion cancelled. Your account stays active and nothing was deleted.');
      await qc.invalidateQueries({ queryKey: SUMMARY_KEY });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Banner
      tone="warning"
      title="Your account is scheduled for deletion"
      action={
        <Button variant="primary" size="sm" loading={cancel.isPending} onClick={() => cancel.mutate()}>
          Cancel deletion
        </Button>
      }
    >
      <p>
        {when ? (
          <>
            Deletion runs on <span className="font-medium text-fg">{formatDateTime(request.scheduledFor)}</span>, in{' '}
            <span className="font-medium tabular-nums text-fg" aria-live="polite">
              {countdown(when - now)}
            </span>
            .
          </>
        ) : (
          'Deletion is queued.'
        )}{' '}
        {graceNote}
      </p>
    </Banner>
  );
}

// ---------- Delete account ----------

function DeleteAccountCard({ summary }: { summary: PrivacySummary }) {
  const [open, setOpen] = useState(false);
  if (summary.status !== 'active') {
    return (
      <Banner tone="info" title="Account deletion is unavailable">
        Your account status is {summary.status.replace(/_/g, ' ')}, so deletion cannot be requested from here. Contact an administrator for help.
      </Banner>
    );
  }
  return (
    <Card className="border-danger!">
      <CardHeader
        title={<span className="inline-flex items-center gap-1.5 text-danger"><WarningIcon size={17} weight="fill" aria-hidden /> Delete your account</span>}
        description={`Deletion starts a ${plural(summary.graceDays, 'day')} grace period.`}
      />
      <CardBody className="space-y-3">
        <ul className="list-disc space-y-1 pl-5 text-[13.5px] text-muted">
          <li>Every other device is signed out right away. This device stays signed in so you can change your mind.</li>
          <li>You can cancel at any time during the {plural(summary.graceDays, 'day')} grace period from this page.</li>
          <li>After that, your personal content is permanently deleted and shared records are anonymized, as described above.</li>
          <li>Download a data export first if you want to keep a copy.</li>
        </ul>
      </CardBody>
      <SettingsFooter>
        <Button variant="danger" icon={<TrashIcon size={16} />} onClick={() => setOpen(true)}>
          Delete my account
        </Button>
      </SettingsFooter>
      <DeleteAccountDialog open={open} onOpenChange={setOpen} confirmText={summary.confirmText} graceDays={summary.graceDays} />
    </Card>
  );
}

function DeleteAccountDialog({ open, onOpenChange, confirmText, graceDays }: { open: boolean; onOpenChange: (v: boolean) => void; confirmText: string; graceDays: number }) {
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setPassword('');
    setReason('');
    setTyped('');
    setErrors({});
  };

  const matches = typed.trim().toLowerCase() === confirmText.toLowerCase();
  const blockedReason = !password ? 'Enter your password' : !matches ? `Type "${confirmText}" to confirm` : null;

  const m = useMutation({
    mutationFn: () => api.post<{ request: { scheduledFor: string }; sessionsRevoked: number; graceDays: number }>('/privacy/delete', { password, confirm: typed.trim(), reason: reason.trim() || undefined }),
    onSuccess: async (r) => {
      toast.success(
        `Deletion scheduled for ${formatDateTime(r.request.scheduledFor)}.${r.sessionsRevoked ? ` ${plural(r.sessionsRevoked, 'other session')} signed out.` : ''}`,
      );
      reset();
      onOpenChange(false);
      await qc.invalidateQueries({ queryKey: SUMMARY_KEY });
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
    onError: (e) => {
      setErrors(fieldErrors(e));
      toast.error(errorMessage(e));
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!blockedReason) m.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      title="Delete your account?"
      description={`Your account will be deleted in ${plural(graceDays, 'day')}. You can cancel until then.`}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Keep my account</Button>
          <Button type="submit" form="delete-account-form" variant="danger" icon={<TrashIcon size={16} />} loading={m.isPending} disabled={!!blockedReason} disabledReason={blockedReason ?? undefined}>
            Schedule deletion
          </Button>
        </>
      }
    >
      <form id="delete-account-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <Banner tone="danger">Once the grace period ends this cannot be undone. Personal content is permanently deleted.</Banner>
        <Field label="Password" error={errors.password} helper="Confirms it is really you.">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Why are you leaving?" optional error={errors.reason} helper="Kept with the deletion record. It helps us improve.">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
        </Field>
        <Field
          label={
            <span>
              Type <span className="font-mono font-semibold">{confirmText}</span> to confirm
            </span>
          }
          error={errors.confirm}
        >
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} className="font-mono" />
        </Field>
        <p className="text-[12.5px] text-muted">
          Want a copy first?{' '}
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              scrollToExport();
            }}
            className="font-medium text-accent-text underline-offset-2 hover:underline"
          >
            Go to data export
          </button>
          .
        </p>
      </form>
    </Dialog>
  );
}
