import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KanbanIcon, PlusIcon, ArrowRightIcon, CalendarIcon, ScalesIcon, ChartBarIcon, TableIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDate, formatDateTime, dueLabel, pct } from '@/lib/format';
import { PageHeader, Card, CardHeader, CardBody, ErrorState, SkeletonRows, EmptyState, Button, Dialog, Field, Input, Select, Segmented, Badge, StatusBadge, Menu, Checkbox, StatTile } from '@/components/ui';
import { ApplicationDetailDialog } from './ApplicationDetail';
import { APP_STATUSES, SOURCE_LABEL, STATUS_LABEL, type AppStatus, type Application } from './api';

type ListResponse = { items: Application[]; total: number; transitions: Record<AppStatus, AppStatus[]> };

function NewApplicationDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ company: '', role: '', source: 'manual', status: 'saved', sourceUrl: '', location: '', deadline: '' });
  const create = useMutation({
    mutationFn: () =>
      api.post<{ application: Application }>('/career/applications', {
        company: form.company,
        role: form.role,
        source: form.source,
        status: form.status,
        sourceUrl: form.sourceUrl || null,
        location: form.location || null,
        deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['career'] });
      toast.success('Added to your tracker.');
      setForm({ company: '', role: '', source: 'manual', status: 'saved', sourceUrl: '', location: '', deadline: '' });
      onOpenChange(false);
      onCreated(r.application.id);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const fields = create.error instanceof ApiError ? create.error.fields : {};
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Track an application"
      description="Any job counts, including ones you found outside the platform."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={create.isPending} disabled={!form.company.trim() || !form.role.trim()} disabledReason="Add the company and role" onClick={() => create.mutate()}>
            Add to tracker
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Company" required error={fields.company}>
          <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        </Field>
        <Field label="Role" required error={fields.role}>
          <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
        </Field>
        <Field label="Status">
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="saved">Saved (not applied yet)</option>
            <option value="applied">Applied</option>
          </Select>
        </Field>
        <Field label="Source">
          <Select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
            <option value="manual">Found it myself</option>
            <option value="referral">Referral</option>
            <option value="campus">Campus</option>
          </Select>
        </Field>
        <Field label="Job link" optional error={fields.sourceUrl}>
          <Input value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} placeholder="https://" />
        </Field>
        <Field label="Location" optional>
          <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        </Field>
        <Field label="Deadline" optional>
          <Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
        </Field>
      </div>
    </Dialog>
  );
}

function MoveMenu({ app, allowed, onMove }: { app: Application; allowed: AppStatus[]; onMove: (to: AppStatus) => void }) {
  if (!allowed.length) return null;
  return (
    <Menu
      label={`Move ${app.role} at ${app.company}`}
      trigger={
        <Button size="sm" variant="ghost" icon={<ArrowRightIcon size={14} />} aria-label={`Move ${app.role} at ${app.company} to another status`}>
          Move
        </Button>
      }
      items={allowed.map((s) => ({ label: `Move to ${STATUS_LABEL[s]}`, onSelect: () => onMove(s) }))}
    />
  );
}

type CalendarEvent = { date: string; kind: string; title: string; applicationId: string };
type Analytics = {
  total: number;
  byStatus: Record<AppStatus, number>;
  sent: number;
  responded: number;
  responseRate: number | null;
  timeInStage: Record<string, { avgDays: number; samples: number }>;
  bySource: { source: string; sent: number; interviews: number; offers: number; interviewRate: number | null }[];
  definitions: Record<string, string>;
};
type CompareItem = { id: string; company: string; role: string; status: string; location: string | null; salaryText: string | null; deadline: string | null; source: string; rounds: number; score: number | null; coverage: string; offer: { baseSalary?: number; currency?: string; remote?: string } | null };

export default function ApplicationsPage() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const [view, setView] = useState<'board' | 'table' | 'calendar' | 'analytics'>('board');
  const [search, setSearch] = useState('');
  const [newOpen, setNewOpen] = useState(params.get('new') === '1');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compare, setCompare] = useState<{ items: CompareItem[]; formula: string } | null>(null);
  const statusFilter = params.get('status') as AppStatus | null;
  const openId = params.get('open');
  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('open', id);
    else next.delete('open');
    next.delete('new');
    setParams(next, { replace: true });
  };

  const q = useQuery({ queryKey: ['career', 'applications', 'all'], queryFn: () => api.get<ListResponse>('/career/applications') });
  const cal = useQuery({ queryKey: ['career', 'applications', 'calendar'], queryFn: () => api.get<{ events: CalendarEvent[] }>('/career/applications/calendar'), enabled: view === 'calendar' });
  const analytics = useQuery({ queryKey: ['career', 'applications', 'analytics'], queryFn: () => api.get<Analytics>('/career/applications/analytics'), enabled: view === 'analytics' });

  const move = useMutation({
    mutationFn: ({ id, to }: { id: string; to: AppStatus }) => api.post<{ application: Application }>(`/career/applications/${id}/status`, { status: to }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['career'] });
      toast.success(`Moved to ${STATUS_LABEL[r.application.status]}.${r.application.status === 'rejected' || r.application.status === 'withdrawn' ? ' Open it to record a reason.' : ''}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const runCompare = useMutation({
    mutationFn: () => api.post<{ items: CompareItem[]; formula: string }>('/career/applications/compare', { ids: [...selected] }),
    onSuccess: (r) => setCompare(r),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const items = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data?.items ?? []).filter((a) => (!statusFilter || a.status === statusFilter) && (!s || `${a.company} ${a.role}`.toLowerCase().includes(s)));
  }, [q.data, search, statusFilter]);
  const transitions = q.data?.transitions;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Applications"
        description="Every job you are considering or have applied to, with status history, rounds, contacts, offers and reminders."
        actions={
          <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setNewOpen(true)}>
            Track application
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: 'board', label: <span className="inline-flex items-center gap-1"><KanbanIcon size={14} /> Board</span> },
            { value: 'table', label: <span className="inline-flex items-center gap-1"><TableIcon size={14} /> Table</span> },
            { value: 'calendar', label: <span className="inline-flex items-center gap-1"><CalendarIcon size={14} /> Calendar</span> },
            { value: 'analytics', label: <span className="inline-flex items-center gap-1"><ChartBarIcon size={14} /> Analytics</span> },
          ]}
        />
        {(view === 'board' || view === 'table') && (
          <>
            <Input aria-label="Search applications" className="w-full sm:w-64" placeholder="Search company or role" value={search} onChange={(e) => setSearch(e.target.value)} />
            {statusFilter && (
              <Button size="sm" variant="ghost" onClick={() => { const n = new URLSearchParams(params); n.delete('status'); setParams(n); }}>
                Clear filter: {STATUS_LABEL[statusFilter]}
              </Button>
            )}
          </>
        )}
        {view === 'table' && (
          <Button icon={<ScalesIcon size={16} />} disabled={selected.size < 2 || selected.size > 6} disabledReason="Select two to six applications to compare" loading={runCompare.isPending} onClick={() => runCompare.mutate()}>
            Compare {selected.size || ''}
          </Button>
        )}
      </div>

      {q.isLoading ? (
        <SkeletonRows rows={5} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.items.length && (view === 'board' || view === 'table') ? (
        <EmptyState icon={<KanbanIcon size={22} />} title="Nothing tracked yet" description="Track jobs you are considering, from this platform or anywhere else. Status changes build a timeline automatically." action={<Button variant="primary" onClick={() => setNewOpen(true)}>Track application</Button>} />
      ) : view === 'board' ? (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {APP_STATUSES.map((s) => {
            const col = items.filter((a) => a.status === s);
            return (
              <section key={s} aria-label={`${STATUS_LABEL[s]} column`} className="flex w-[17rem] shrink-0 flex-col rounded-lg border border-border bg-surface-2 p-2">
                <h2 className="mb-2 flex h-8 items-center justify-between px-2 text-[13px] font-semibold">
                  {STATUS_LABEL[s]}
                  <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-surface-3 px-1.5 text-[11px] font-semibold tabular-nums text-muted">{col.length}</span>
                </h2>
                {col.length === 0 && <p className="rounded-md border border-dashed border-border-strong/70 px-3 py-4 text-center text-[12.5px] text-subtle">Nothing here</p>}
                <ul className="space-y-2">
                  {col.map((a) => {
                    const due = a.deadline ? dueLabel(a.deadline) : null;
                    return (
                      <li key={a.id}>
                        <Card className="p-3 transition-colors hover:border-border-strong">
                          <button type="button" className="block w-full rounded-sm text-left" onClick={() => setOpen(a.id)}>
                            <div className="text-[13.5px] font-semibold leading-5">{a.role}</div>
                            <div className="text-[12.5px] text-muted">{a.company}</div>
                          </button>
                          <div className="mt-2 flex flex-wrap items-center gap-1">
                            <Badge>{SOURCE_LABEL[a.source] ?? a.source}</Badge>
                            {due && a.status === 'saved' && <Badge tone={due.tone === 'neutral' ? 'neutral' : due.tone}>{due.text}</Badge>}
                            {a.nextActionAt && <Badge tone="info">Follow-up {formatDate(a.nextActionAt)}</Badge>}
                          </div>
                          {transitions && (transitions[a.status] ?? []).length > 0 && (
                            <div className="-mx-1 -mb-1 mt-2 flex justify-end border-t border-border pt-1">
                              <MoveMenu app={a} allowed={transitions[a.status] ?? []} onMove={(to) => move.mutate({ id: a.id, to })} />
                            </div>
                          )}
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      ) : view === 'table' ? (
        <Card className="overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead className="border-b border-border bg-surface-2 text-[12px] uppercase tracking-wide text-subtle">
              <tr>
                <th className="px-4 py-3 font-medium"><span className="sr-only">Select</span></th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Applied</th>
                <th className="px-4 py-3 font-medium">Deadline</th>
                <th className="px-4 py-3 font-medium">Follow-up</th>
                <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3">
                    <Checkbox checked={selected.has(a.id)} onCheckedChange={(v) => setSelected((s) => { const n = new Set(s); if (v) n.add(a.id); else n.delete(a.id); return n; })} label={<span className="sr-only">Select {a.role} at {a.company}</span>} />
                  </td>
                  <td className="px-4 py-3">
                    <button type="button" className="font-medium hover:underline" onClick={() => setOpen(a.id)}>
                      {a.role}
                    </button>
                  </td>
                  <td className="px-4 py-3">{a.company}</td>
                  <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                  <td className="px-4 py-3 text-muted">{SOURCE_LABEL[a.source] ?? a.source}</td>
                  <td className="px-4 py-3 text-muted">{a.appliedAt ? formatDate(a.appliedAt) : '-'}</td>
                  <td className="px-4 py-3 text-muted">{a.deadline ? formatDate(a.deadline) : '-'}</td>
                  <td className="px-4 py-3 text-muted">{a.nextActionAt ? formatDateTime(a.nextActionAt) : '-'}</td>
                  <td className="px-4 py-3 text-right">{transitions && <MoveMenu app={a} allowed={transitions[a.status] ?? []} onMove={(to) => move.mutate({ id: a.id, to })} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      ) : view === 'calendar' ? (
        cal.isLoading ? (
          <SkeletonRows rows={4} />
        ) : cal.error ? (
          <ErrorState error={cal.error} onRetry={() => cal.refetch()} />
        ) : !cal.data?.events.length ? (
          <EmptyState icon={<CalendarIcon size={22} />} title="No dates in the next three months" description="Add deadlines, interview rounds and follow-up reminders to your applications to see them here." />
        ) : (
          <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
            {Object.entries(
              cal.data.events.reduce<Record<string, CalendarEvent[]>>((acc, e) => {
                const d = formatDate(e.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
                (acc[d] ??= []).push(e);
                return acc;
              }, {}),
            ).map(([day, evs]) => (
              <li key={day} className="grid gap-2 px-5 py-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6">
                <div className="text-[13px] font-semibold tabular-nums">{day}</div>
                <ul className="space-y-2">
                  {evs.map((e, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 text-[13.5px]">
                      <Badge tone={e.kind === 'round' ? 'info' : e.kind === 'deadline' || e.kind === 'offer_deadline' ? 'warning' : 'neutral'}>{(e.kind.charAt(0).toUpperCase() + e.kind.slice(1)).replace('_', ' ')}</Badge>
                      <button type="button" className="text-left font-medium hover:text-accent-text" onClick={() => setOpen(e.applicationId)}>
                        {e.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )
      ) : analytics.isLoading ? (
        <SkeletonRows rows={4} />
      ) : analytics.error ? (
        <ErrorState error={analytics.error} onRetry={() => analytics.refetch()} />
      ) : (
        analytics.data && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatTile label="Tracked" value={analytics.data.total} />
              <StatTile label="Sent" value={analytics.data.sent} hint="Reached Applied or later" />
              <StatTile label="Responses" value={analytics.data.responded} />
              <StatTile label="Response rate" value={analytics.data.responseRate === null ? '-' : pct(analytics.data.responseRate)} hint="See definition below" />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Average time in each status" description={analytics.data.definitions.timeInStage} />
                <CardBody>
                  {Object.keys(analytics.data.timeInStage).length === 0 ? (
                    <p className="text-[13.5px] text-muted">Not enough status history yet.</p>
                  ) : (
                    <ul className="divide-y divide-border text-[13.5px]">
                      {Object.entries(analytics.data.timeInStage).map(([s, v]) => (
                        <li key={s} className="flex justify-between gap-3 py-2 first:pt-0 last:pb-0">
                          <span>{STATUS_LABEL[s as AppStatus] ?? s}</span>
                          <span className="tabular-nums text-muted">
                            {v.avgDays} days <span className="text-subtle">({v.samples} sample{v.samples === 1 ? '' : 's'})</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Conversion by source" description={analytics.data.definitions.bySource} />
                <CardBody>
                  {analytics.data.bySource.length === 0 ? (
                    <p className="text-[13.5px] text-muted">No sent applications yet.</p>
                  ) : (
                    <table className="w-full text-[13.5px]">
                      <thead className="border-b border-border text-left text-[12px] text-subtle">
                        <tr>
                          <th className="pb-2 font-medium">Source</th>
                          <th className="pb-2 font-medium">Sent</th>
                          <th className="pb-2 font-medium">Interview+</th>
                          <th className="pb-2 font-medium">Offer</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {analytics.data.bySource.map((s) => (
                          <tr key={s.source}>
                            <td className="py-2">{SOURCE_LABEL[s.source] ?? s.source}</td>
                            <td className="py-2 tabular-nums">{s.sent}</td>
                            <td className="py-2 tabular-nums">
                              {s.interviews} <span className="text-subtle">({pct(s.interviewRate)})</span>
                            </td>
                            <td className="py-2 tabular-nums">{s.offers}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardBody>
              </Card>
            </div>
            <Card>
              <CardHeader title="Definitions" />
              <CardBody>
                <dl className="space-y-2 text-[13px] leading-relaxed">
                  {Object.entries(analytics.data.definitions).map(([k, v]) => (
                    <div key={k}>
                      <dt className="inline font-medium">{k}: </dt>
                      <dd className="inline text-muted">{v}</dd>
                    </div>
                  ))}
                </dl>
              </CardBody>
            </Card>
          </div>
        )
      )}

      <NewApplicationDialog open={newOpen} onOpenChange={setNewOpen} onCreated={(id) => setOpen(id)} />
      <ApplicationDetailDialog id={openId} onClose={() => setOpen(null)} />
      <Dialog open={!!compare} onOpenChange={(v) => !v && setCompare(null)} size="xl" title="Compare applications" description={compare?.formula}>
        {compare && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13.5px]">
              <tbody className="divide-y divide-border">
                {(
                  [
                    ['Role', (c: CompareItem) => c.role],
                    ['Company', (c: CompareItem) => c.company],
                    ['Status', (c: CompareItem) => STATUS_LABEL[c.status as AppStatus] ?? c.status],
                    ['Location', (c: CompareItem) => c.location ?? '-'],
                    ['Salary (advertised)', (c: CompareItem) => c.salaryText ?? '-'],
                    ['Offer base', (c: CompareItem) => (c.offer?.baseSalary ? `${c.offer.baseSalary.toLocaleString()} ${c.offer.currency ?? ''}` : '-')],
                    ['Remote', (c: CompareItem) => c.offer?.remote ?? '-'],
                    ['Deadline', (c: CompareItem) => (c.deadline ? formatDate(c.deadline) : '-')],
                    ['Rounds', (c: CompareItem) => String(c.rounds)],
                    ['Priority score', (c: CompareItem) => (c.score === null ? 'Not enough rated' : `${c.score} (${c.coverage})`)],
                  ] as [string, (c: CompareItem) => string][]
                ).map(([label, fn]) => (
                  <tr key={label}>
                    <th className="py-2 pr-4 font-medium text-muted">{label}</th>
                    {compare.items.map((c) => (
                      <td key={c.id} className="py-2 pr-4">
                        {fn(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[12.5px] text-muted">Rate growth, learning, team and other priorities under Offers to fill in the score.</p>
          </div>
        )}
      </Dialog>
    </div>
  );
}
