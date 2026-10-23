import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PlusIcon, WarningDiamondIcon, CheckCircleIcon } from '@phosphor-icons/react';
import { api, qs, errorMessage, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { formatDateTime, timeAgo } from '@/lib/format';
import { Banner, Button, Dialog, EmptyState, ErrorState, Field, Input, PageHeader, Pagination, Select, SkeletonRows, StatusBadge, Textarea } from '@/components/ui';
import { SEVERITY_HELP, type Paged } from './api';
import { FilterBar, SeverityBadge, TableCard, Th, rowClass, tdClass, theadClass } from './components';

type IncidentRow = { id: string; title: string; severity: string; status: string; summary: string | null; createdAt: string; resolvedAt: string | null; updates: number };

function CreateIncidentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', severity: 'medium', summary: '', firstUpdate: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const create = useMutation({
    mutationFn: () => api.post<{ incident: { id: string } }>('/admin/incidents', { ...form, summary: form.summary || null, firstUpdate: form.firstUpdate || undefined }),
    onSuccess: (r) => {
      toast.success('Incident recorded');
      qc.invalidateQueries({ queryKey: ['admin'] });
      onOpenChange(false);
      navigate(`/app/admin/incidents/${r.incident.id}`);
    },
    onError: (e) => (e instanceof ApiError && Object.keys(e.fields).length ? setFields(e.fields) : toast.error(errorMessage(e))),
  });
  const set = (k: keyof typeof form, v: string) => {
    setFields((f) => ({ ...f, [k]: '' }));
    setForm((f) => ({ ...f, [k]: v }));
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record an incident"
      description="Use incidents for anything that affects people: outages, delays, data problems. The timeline becomes the record of what happened."
      size="lg"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={create.isPending} onClick={() => create.mutate()}>
            Record incident
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Title" error={fields.title} helper="Describe the effect people notice, for example 'Assignment grading delayed'.">
          <Input value={form.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Severity" helper={SEVERITY_HELP[form.severity]}>
          <Select value={form.severity} onChange={(e) => set('severity', e.target.value)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </Select>
        </Field>
        {(form.severity === 'high' || form.severity === 'critical') && <Banner tone="warning">Every signed-in user will see this title and status in a banner until the incident is resolved.</Banner>}
        <Field label="Summary" optional helper="Internal. Not shown in the public banner.">
          <Textarea rows={3} value={form.summary} onChange={(e) => set('summary', e.target.value)} />
        </Field>
        <Field label="First timeline entry" optional>
          <Input value={form.firstUpdate} onChange={(e) => set('firstUpdate', e.target.value)} placeholder="What you know so far" />
        </Field>
      </div>
    </Dialog>
  );
}

export default function IncidentsPage() {
  const me = useSession();
  const isAdmin = me.user.platformRole === 'platform_admin';
  const [status, setStatus] = useState('all');
  const [severity, setSeverity] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    queryKey: ['admin', 'incidents', { status, severity, page }],
    queryFn: () => api.get<Paged<IncidentRow>>(`/admin/incidents${qs({ status, severity, page, pageSize: 25 })}`),
    placeholderData: keepPreviousData,
  });
  return (
    <div>
      <PageHeader
        title="Incidents"
        description="Operational incident records with a timeline. Unresolved high and critical incidents are announced to signed-in users with their title and status only."
        actions={
          <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setCreating(true)} disabled={!isAdmin} disabledReason="Only platform admins can record incidents.">
            Record incident
          </Button>
        }
      />
      <FilterBar>
        <Field label="Status">
          <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
            <option value="all">All</option>
            <option value="unresolved">Unresolved</option>
            <option value="open">Open</option>
            <option value="monitoring">Monitoring</option>
            <option value="resolved">Resolved</option>
          </Select>
        </Field>
        <Field label="Severity">
          <Select value={severity} onChange={(e) => (setSeverity(e.target.value), setPage(1))}>
            <option value="">Any severity</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </Select>
        </Field>
      </FilterBar>
      {list.isLoading && <SkeletonRows rows={4} />}
      {list.error && <ErrorState error={list.error} onRetry={() => list.refetch()} />}
      {list.data && list.data.items.length === 0 && (
        <EmptyState
          icon={status === 'all' ? <WarningDiamondIcon size={22} /> : <CheckCircleIcon size={22} />}
          title="No incidents"
          description="When something affects people, record it here so there is a clear timeline of what happened and what was done."
          action={
            isAdmin && (
              <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setCreating(true)}>
                Record incident
              </Button>
            )
          }
        />
      )}
      {list.data && list.data.items.length > 0 && (
        <>
          <TableCard label="Incidents">
            <thead className={theadClass}>
              <tr>
                <Th>Incident</Th>
                <Th>Severity</Th>
                <Th>Status</Th>
                <Th>Started</Th>
                <Th>Resolved</Th>
                <Th className="text-right">Updates</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((i) => (
                <tr key={i.id} className={rowClass}>
                  <td className={tdClass}>
                    <Link to={`/app/admin/incidents/${i.id}`} className="font-medium hover:underline">
                      {i.title}
                    </Link>
                    {i.summary && <p className="line-clamp-1 text-[12.5px] text-muted">{i.summary}</p>}
                  </td>
                  <td className={tdClass}>
                    <SeverityBadge severity={i.severity} />
                  </td>
                  <td className={tdClass}>
                    <StatusBadge status={i.status} />
                  </td>
                  <td className={`${tdClass} whitespace-nowrap text-muted`}>{timeAgo(i.createdAt)}</td>
                  <td className={`${tdClass} whitespace-nowrap text-muted`}>{i.resolvedAt ? formatDateTime(i.resolvedAt) : '—'}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{i.updates}</td>
                </tr>
              ))}
            </tbody>
          </TableCard>
          <Pagination page={page} pageSize={25} total={list.data.total} onPage={setPage} />
        </>
      )}
      {creating && <CreateIncidentDialog open={creating} onOpenChange={setCreating} />}
    </div>
  );
}
