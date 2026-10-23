import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AppleLogoIcon,
  ArrowsClockwiseIcon,
  CalendarPlusIcon,
  EyeIcon,
  FloppyDiskIcon,
  GoogleLogoIcon,
  LinkBreakIcon,
  MicrosoftOutlookLogoIcon,
  PlugsConnectedIcon,
  WrenchIcon,
  type Icon,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { Badge, Banner, Button, buttonClass, Card, CardBody, CardHeader, Checkbox, ConfirmDialog, CopyButton, ErrorState, Input, SkeletonRows, Tabs } from '@/components/ui';
import { SettingsFooter } from './shared';

// ---------- Server contract ----------

type ProviderId = 'google' | 'microsoft';
type Connection = {
  id: string;
  provider: ProviderId;
  accountEmail: string | null;
  status: 'active' | 'needs_reconnect';
  calendarCreated: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: 'never' | 'ok' | 'partial' | 'error' | 'skipped';
  lastSyncError: string | null;
  lastSyncStats: { created: number; updated: number; deleted: number; unchanged: number; failed: number } | null;
  nextRetryAt: string | null;
  syncing: boolean;
  connectedAt: string;
};
type Provider = { id: ProviderId; label: string; configured: boolean; redirectUri: string; scopes: string[]; connection: Connection | null };
type Overview = {
  types: { key: string; label: string; included: boolean }[];
  feed: { enabled: boolean; url: string | null; webcalUrl: string | null; createdAt: string | null; lastAccessedAt: string | null; reachableByCloudCalendars: boolean };
  providers: Provider[];
};

const KEY = ['calendar', 'overview'];

const CALLBACK_ERRORS: Record<string, string> = {
  invalid_state: 'The connection request expired or did not come from this browser session. Start again from this page.',
  denied: 'You cancelled the permission request, so nothing was connected.',
  scope: 'Calendar permission was not granted. Connect again and leave the calendar permission ticked.',
  exchange_failed: 'The provider did not accept the sign-in. Try again; if it keeps failing, an administrator should check the OAuth client settings.',
  not_configured: 'This provider is not configured on this server.',
  provider_error: 'The provider returned an error. Try again.',
};

export default function CalendarPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [pollUntil, setPollUntil] = useState(0);
  const q = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<Overview>('/calendar'),
    refetchInterval: (query) => {
      const syncing = query.state.data?.providers.some((p) => p.connection?.syncing);
      return syncing || Date.now() < pollUntil ? 2500 : false;
    },
  });

  // Result of the OAuth round trip, reported once and then removed from the address bar.
  useEffect(() => {
    const provider = params.get('provider');
    if (!provider) return;
    const label = provider === 'google' ? 'Google Calendar' : provider === 'microsoft' ? 'Microsoft Outlook' : 'Calendar';
    if (params.get('connected')) {
      toast.success(`${label} connected. The first sync is running.`);
      setPollUntil(Date.now() + 30_000);
    } else if (params.get('error')) {
      toast.error(CALLBACK_ERRORS[params.get('error')!] ?? 'Connecting failed. Try again.');
    }
    setParams({}, { replace: true });
    qc.invalidateQueries({ queryKey: KEY });
  }, [params, setParams, qc]);

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data)
    return (
      <div className="space-y-4">
        <Card>
          <CardBody className="pt-5">
            <SkeletonRows rows={4} />
          </CardBody>
        </Card>
        <Card>
          <CardBody className="pt-5">
            <SkeletonRows rows={6} />
          </CardBody>
        </Card>
      </div>
    );

  return (
    <div className="space-y-4">
      <TypesCard data={q.data} />
      <FeedCard data={q.data} />
      <Card>
        <CardHeader
          title="Direct sync with Google or Outlook"
          description="Connect an account and LearnSphere Nexus creates its own calendar there and keeps it up to date every 15 minutes. It never reads or changes your other calendars."
        />
        <div className="divide-y divide-border border-t border-border">
          {q.data.providers.map((p) => (
            <ProviderPanel key={p.id} provider={p} onSyncStarted={() => setPollUntil(Date.now() + 30_000)} />
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---------- What to include ----------

function TypesCard({ data }: { data: Overview }) {
  const qc = useQueryClient();
  const saved = data.types.filter((t) => t.included).map((t) => t.key);
  const savedKey = saved.join(',');
  const [draft, setDraft] = useState<string[]>(saved);
  // Reset the draft only when the saved selection changes (not on every background refetch).
  useEffect(() => setDraft(savedKey ? savedKey.split(',') : []), [savedKey]);
  const changed = draft.length !== saved.length || draft.some((k) => !saved.includes(k));
  const m = useMutation({
    mutationFn: () => api.patch<Overview>('/calendar/settings', { types: draft }),
    onSuccess: (d) => {
      qc.setQueryData(KEY, d);
      toast.success('Saved. Your subscription link and connected calendars now use these event types.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card>
      <CardHeader title="What to include" description="Choose which items appear in your external calendar. Applies to the subscription link and to direct sync." />
      <CardBody>
        <fieldset>
          <legend className="sr-only">Event types to include</legend>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {data.types.map((t) => (
              <Checkbox
                key={t.key}
                checked={draft.includes(t.key)}
                onCheckedChange={(v) => setDraft((d) => (v ? [...d, t.key] : d.filter((k) => k !== t.key)))}
                label={t.label}
              />
            ))}
          </div>
        </fieldset>
      </CardBody>
      <SettingsFooter note={changed ? 'Unsaved changes' : undefined}>
        {changed && (
          <Button onClick={() => setDraft(saved)} disabled={m.isPending}>
            Discard changes
          </Button>
        )}
        <Button
          variant="primary"
          icon={<FloppyDiskIcon size={16} />}
          loading={m.isPending}
          disabled={!changed || draft.length === 0}
          disabledReason={draft.length === 0 ? 'Choose at least one event type' : 'No changes to save'}
          onClick={() => m.mutate()}
        >
          Save event types
        </Button>
      </SettingsFooter>
    </Card>
  );
}

// ---------- Subscription link (ICS) ----------

function FeedCard({ data }: { data: Overview }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<'regenerate' | 'disable' | null>(null);
  const [tab, setTab] = useState('google');
  const feed = data.feed;
  const act = useMutation({
    mutationFn: (action: 'enable' | 'disable' | 'regenerate') => api.post<Overview>(`/calendar/feed/${action}`),
    onSuccess: (d, action) => {
      qc.setQueryData(KEY, d);
      setConfirm(null);
      toast.success(
        action === 'enable' ? 'Subscription link created.' : action === 'disable' ? 'Subscription link turned off. Calendars using it stop updating.' : 'New link created. The old link no longer works.',
      );
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card>
      <CardHeader
        title="Subscription link"
        description="A private calendar link (ICS) that Google Calendar, Outlook and Apple Calendar can subscribe to. Works without connecting any account. Read-only."
      />
      <CardBody className="space-y-4">
        {!feed.enabled || !feed.url ? (
          <div className="flex flex-col items-start gap-3 rounded-md bg-surface-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13.5px] text-muted">No subscription link yet. Create one, then paste it into your calendar app.</p>
            <Button variant="primary" icon={<CalendarPlusIcon size={16} />} loading={act.isPending} onClick={() => act.mutate('enable')}>
              Create subscription link
            </Button>
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="ics-url" className="mb-1.5 block text-[13px] font-medium">
                Your private calendar link
              </label>
              <div className="flex items-center gap-2">
                <Input id="ics-url" readOnly value={feed.url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-[12.5px]" />
                <CopyButton value={feed.url} label="Copy link" className="shrink-0" />
              </div>
              <p className="mt-1.5 text-[12.5px] text-muted">
                Anyone with this link can see these items, so treat it like a password. If it leaks, create a new link.
                {feed.lastAccessedAt ? ` Last fetched by a calendar app ${timeAgo(feed.lastAccessedAt)}.` : ' Not fetched by a calendar app yet.'}
              </p>
            </div>
            {!feed.reachableByCloudCalendars && (
              <Banner tone="warning" title="This server is not reachable from the internet">
                Google Calendar and Outlook fetch subscription links from their own servers, so they cannot reach this local address. Apple Calendar on this computer can still subscribe. Use a public address (APP_URL) for the others.
              </Banner>
            )}
            <div className="flex flex-wrap gap-2">
              <a href={`${feed.url}?view=text`} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'sm')}>
                <EyeIcon size={14} aria-hidden />
                Preview calendar file
              </a>
              {feed.webcalUrl && (
                <a href={feed.webcalUrl} className={buttonClass('secondary', 'sm')}>
                  <AppleLogoIcon size={14} aria-hidden />
                  Open in Apple Calendar
                </a>
              )}
              <Button size="sm" icon={<ArrowsClockwiseIcon size={14} />} onClick={() => setConfirm('regenerate')}>
                Create a new link
              </Button>
              <Button size="sm" variant="ghost" icon={<LinkBreakIcon size={14} />} onClick={() => setConfirm('disable')}>
                Turn off link
              </Button>
            </div>

            <div>
              <h4 className="text-[14px] font-semibold">Add it to your calendar</h4>
              <Tabs
                value={tab}
                onValueChange={setTab}
                className="mt-1"
                tabs={[
                  { value: 'google', label: 'Google Calendar' },
                  { value: 'outlook', label: 'Outlook' },
                  { value: 'apple', label: 'Apple Calendar' },
                ]}
              />
              <div className="pt-3 text-[13.5px]">
                {tab === 'google' && (
                  <Steps
                    steps={[
                      'Copy the link above.',
                      <>
                        On a computer, open <span className="font-medium">calendar.google.com</span>.
                      </>,
                      <>
                        Next to <span className="font-medium">Other calendars</span>, select the plus sign, then <span className="font-medium">From URL</span>.
                      </>,
                      <>
                        Paste the link and select <span className="font-medium">Add calendar</span>. It appears as "LearnSphere Nexus".
                      </>,
                    ]}
                    note="Google refreshes subscribed calendars on its own schedule, usually every few hours (sometimes up to a day). That is Google's behavior and cannot be sped up from here. For updates within minutes, use direct sync below."
                  />
                )}
                {tab === 'outlook' && (
                  <Steps
                    steps={[
                      'Copy the link above.',
                      <>
                        Open Outlook on the web (<span className="font-medium">outlook.live.com</span> or <span className="font-medium">outlook.office.com</span>) and go to Calendar.
                      </>,
                      <>
                        Select <span className="font-medium">Add calendar</span>, then <span className="font-medium">Subscribe from web</span>.
                      </>,
                      <>
                        Paste the link, name it "LearnSphere Nexus" and select <span className="font-medium">Import</span>.
                      </>,
                    ]}
                    note="Outlook also refreshes subscriptions on its own schedule, typically every few hours."
                  />
                )}
                {tab === 'apple' && (
                  <Steps
                    steps={[
                      <>
                        Select <span className="font-medium">Open in Apple Calendar</span> above, or copy the link.
                      </>,
                      <>
                        On a Mac: in Calendar choose <span className="font-medium">File, New Calendar Subscription</span>, paste the link and select Subscribe.
                      </>,
                      <>
                        On iPhone or iPad: <span className="font-medium">Settings, Apps, Calendar, Calendar Accounts, Add Account, Other, Add Subscribed Calendar</span>, then paste the link.
                      </>,
                      'Choose how often to refresh (for example every hour) and select OK.',
                    ]}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </CardBody>
      <ConfirmDialog
        open={confirm === 'regenerate'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title="Create a new link?"
        description="The current link stops working right away. Calendars subscribed with it stop updating until you add the new link."
        confirmLabel="Create new link"
        loading={act.isPending}
        onConfirm={() => act.mutate('regenerate')}
      />
      <ConfirmDialog
        open={confirm === 'disable'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title="Turn off the subscription link?"
        description="The link stops working right away. Turning it back on later creates a different link."
        confirmLabel="Turn off link"
        danger
        loading={act.isPending}
        onConfirm={() => act.mutate('disable')}
      />
    </Card>
  );
}

function Steps({ steps, note }: { steps: ReactNode[]; note?: string }) {
  return (
    <div className="space-y-2">
      <ol className="list-decimal space-y-1 pl-5 marker:text-muted">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      {note && <p className="text-[12.5px] text-muted">{note}</p>}
    </div>
  );
}

// ---------- Direct sync ----------

const PROVIDER_ICON: Record<ProviderId, Icon> = { google: GoogleLogoIcon, microsoft: MicrosoftOutlookLogoIcon };

function ProviderPanel({ provider: p, onSyncStarted }: { provider: Provider; onSyncStarted: () => void }) {
  const qc = useQueryClient();
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [deleteCalendar, setDeleteCalendar] = useState(false);
  const Logo = PROVIDER_ICON[p.id];
  const c = p.connection;

  const connect = useMutation({
    mutationFn: () => api.post<{ url: string }>(`/calendar/oauth/${p.id}/start`),
    onSuccess: (r) => window.location.assign(r.url),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const sync = useMutation({
    mutationFn: () => api.post(`/calendar/connections/${c!.id}/sync`),
    onSuccess: () => {
      toast.success('Sync started. The status below updates when it finishes.');
      onSyncStarted();
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const disconnect = useMutation({
    mutationFn: () => api.post<{ calendarDeleted: boolean; calendarError: string | null }>(`/calendar/connections/${c!.id}/disconnect`, { deleteCalendar }),
    onSuccess: (r) => {
      setDisconnectOpen(false);
      if (deleteCalendar && !r.calendarDeleted) toast.warning(`Disconnected, but the calendar could not be deleted${r.calendarError ? `: ${r.calendarError}` : ''}. Delete it in ${p.label}.`);
      else toast.success(r.calendarDeleted ? `Disconnected and deleted the LearnSphere Nexus calendar from ${p.label}.` : `Disconnected. The LearnSphere Nexus calendar stays in ${p.label} until you delete it there.`);
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <section aria-labelledby={`provider-${p.id}`} className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-fg ring-1 ring-inset ring-border">
            <Logo size={20} aria-hidden />
          </span>
          <div className="min-w-0">
            <h4 id={`provider-${p.id}`} className="text-[14.5px] font-semibold">
              {p.label}
            </h4>
            <p className="truncate text-[12.5px] text-muted">
              {!p.configured ? 'Not configured on this server' : c ? (c.accountEmail ?? 'Connected account') : 'Not connected'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {c ? <ConnectionBadge c={c} /> : !p.configured ? <Badge tone="neutral">Not configured</Badge> : null}
          {p.configured && !c && (
            <Button variant="primary" size="sm" icon={<PlugsConnectedIcon size={14} />} loading={connect.isPending} onClick={() => connect.mutate()}>
              Connect {p.label}
            </Button>
          )}
          {p.configured && c?.status === 'needs_reconnect' && (
            <Button variant="primary" size="sm" icon={<PlugsConnectedIcon size={14} />} loading={connect.isPending} onClick={() => connect.mutate()}>
              Reconnect
            </Button>
          )}
          {c?.status === 'active' && (
            <Button
              size="sm"
              icon={<ArrowsClockwiseIcon size={14} />}
              loading={sync.isPending || c.syncing}
              disabled={!p.configured}
              disabledReason="This provider is not configured on this server"
              onClick={() => sync.mutate()}
            >
              {c.syncing ? 'Syncing' : 'Sync now'}
            </Button>
          )}
          {c && (
            <Button size="sm" variant="ghost" icon={<LinkBreakIcon size={14} />} onClick={() => setDisconnectOpen(true)}>
              Disconnect
            </Button>
          )}
        </div>
      </div>

      {c && <ConnectionStatus c={c} label={p.label} />}
      {!p.configured && <SetupSteps provider={p} />}

      {c && (
        <ConfirmDialog
          open={disconnectOpen}
          onOpenChange={(v) => {
            setDisconnectOpen(v);
            if (!v) setDeleteCalendar(false);
          }}
          title={`Disconnect ${p.label}?`}
          description="LearnSphere Nexus deletes its stored access to this account and stops syncing."
          confirmLabel="Disconnect"
          danger
          loading={disconnect.isPending}
          onConfirm={() => disconnect.mutate()}
        >
          {c.calendarCreated && (
            <Checkbox
              checked={deleteCalendar}
              onCheckedChange={setDeleteCalendar}
              disabled={c.status !== 'active' || !p.configured}
              label={`Also delete the "LearnSphere Nexus" calendar from ${p.label}`}
              description={c.status !== 'active' ? 'Access has expired, so delete it in the calendar app yourself.' : 'Only the calendar LearnSphere Nexus created. Your other calendars are not touched.'}
            />
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}

function ConnectionBadge({ c }: { c: Connection }) {
  if (c.status === 'needs_reconnect') return <Badge tone="danger">Reconnect needed</Badge>;
  if (c.syncing) return <Badge tone="info">Syncing</Badge>;
  if (c.lastSyncStatus === 'ok') return <Badge tone="success">Up to date</Badge>;
  if (c.lastSyncStatus === 'partial') return <Badge tone="warning">Partly synced</Badge>;
  if (c.lastSyncStatus === 'error') return <Badge tone="danger">Sync failed</Badge>;
  return <Badge tone="neutral">Waiting for first sync</Badge>;
}

function ConnectionStatus({ c, label }: { c: Connection; label: string }) {
  const s = c.lastSyncStats;
  return (
    <div className="mt-3 space-y-2 text-[13px]">
      {c.status === 'needs_reconnect' && (
        <Banner tone="danger" title="Access was revoked or expired">
          {label} no longer accepts our access, so syncing has stopped. Reconnect to resume. Your existing events there are kept.
        </Banner>
      )}
      {c.status === 'active' && c.lastSyncError && (
        <Banner tone={c.lastSyncStatus === 'partial' ? 'warning' : 'danger'} title={c.lastSyncStatus === 'partial' ? 'Some items did not sync' : 'The last sync failed'}>
          {c.lastSyncError}
          {c.nextRetryAt ? ` Next automatic retry ${formatDateTime(c.nextRetryAt)}.` : ''}
        </Banner>
      )}
      <dl className="grid gap-x-6 gap-y-1 text-muted sm:grid-cols-2">
        <div>
          <dt className="inline">Last sync: </dt>
          <dd className="inline text-fg">{c.lastSyncAt ? `${timeAgo(c.lastSyncAt)} (${formatDateTime(c.lastSyncAt)})` : 'Not yet'}</dd>
        </div>
        <div>
          <dt className="inline">Calendar: </dt>
          <dd className="inline text-fg">{c.calendarCreated ? `"LearnSphere Nexus" in ${label}` : 'Created on first sync'}</dd>
        </div>
        {s && (
          <div className="sm:col-span-2">
            <dt className="inline">Last run: </dt>
            <dd className="inline text-fg">
              {s.created} added, {s.updated} updated, {s.deleted} removed, {s.unchanged} unchanged{s.failed ? `, ${s.failed} failed` : ''}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function SetupSteps({ provider: p }: { provider: Provider }) {
  return (
    <details className="mt-3 rounded-md bg-surface-2 px-3.5 py-2.5 text-[13px]">
      <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
        <WrenchIcon size={14} aria-hidden /> Not configured on this server. Setup steps for an administrator (free)
      </summary>
      <div className="mt-2 space-y-2">
        {p.id === 'google' ? (
          <ol className="list-decimal space-y-1.5 pl-5 marker:text-muted">
            <li>
              In <span className="font-medium">console.cloud.google.com</span>, create a project (no billing needed) and enable the <span className="font-medium">Google Calendar API</span>.
            </li>
            <li>
              Open <span className="font-medium">Google Auth Platform</span> (OAuth consent screen): choose <span className="font-medium">External</span>, fill in the app name and support email, keep the publishing status at{' '}
              <span className="font-medium">Testing</span> and add your own Google account under <span className="font-medium">Test users</span>.
            </li>
            <li>
              Under <span className="font-medium">Data access</span>, add the scope <code className="font-mono text-[12px]">.../auth/calendar.app.created</code> (create and manage only the calendars this app creates).
            </li>
            <li>
              Under <span className="font-medium">Clients</span>, create an OAuth client of type <span className="font-medium">Web application</span> with this authorized redirect URI:
              <RedirectUri value={p.redirectUri} />
            </li>
            <li>
              Set <code className="font-mono text-[12px]">GOOGLE_OAUTH_CLIENT_ID</code> and <code className="font-mono text-[12px]">GOOGLE_OAUTH_CLIENT_SECRET</code> in the server environment (.env) and restart.
            </li>
          </ol>
        ) : (
          <ol className="list-decimal space-y-1.5 pl-5 marker:text-muted">
            <li>
              In <span className="font-medium">entra.microsoft.com</span>, open <span className="font-medium">App registrations, New registration</span>. For supported account types choose{' '}
              <span className="font-medium">any organizational directory and personal Microsoft accounts</span>.
            </li>
            <li>
              Add a redirect URI of platform <span className="font-medium">Web</span>:
              <RedirectUri value={p.redirectUri} />
            </li>
            <li>
              Under <span className="font-medium">API permissions</span>, add Microsoft Graph delegated permissions <code className="font-mono text-[12px]">Calendars.ReadWrite</code> and{' '}
              <code className="font-mono text-[12px]">offline_access</code>.
            </li>
            <li>
              Under <span className="font-medium">Certificates and secrets</span>, create a client secret and copy its value.
            </li>
            <li>
              Set <code className="font-mono text-[12px]">MS_OAUTH_CLIENT_ID</code> (Application ID), <code className="font-mono text-[12px]">MS_OAUTH_CLIENT_SECRET</code> and optionally{' '}
              <code className="font-mono text-[12px]">MS_OAUTH_TENANT</code> (default <code className="font-mono text-[12px]">common</code>) in the server environment and restart.
            </li>
          </ol>
        )}
        <p className="text-muted">Until then, the subscription link above works with {p.id === 'google' ? 'Google Calendar' : 'Outlook'} without any setup.</p>
      </div>
    </details>
  );
}

function RedirectUri({ value }: { value: string }) {
  return (
    <span className="mt-1 flex items-center gap-1">
      <code className="min-w-0 break-all rounded bg-surface px-1.5 py-0.5 font-mono text-[12px]">{value}</code>
      <CopyButton value={value} label="Copy URI" className="shrink-0" />
    </span>
  );
}
