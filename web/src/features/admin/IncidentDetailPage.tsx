import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { TrashIcon, PaperPlaneRightIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { formatDateTime } from '@/lib/format';
import { Banner, Button, Card, CardBody, CardHeader, ConfirmDialog, ErrorState, Field, Input, PageHeader, Select, SkeletonRows, StatusBadge, Textarea } from '@/components/ui';
import { SeverityBadge } from './components';
import { SEVERITY_HELP } from './api';

type Incident = {
  id: string;
  title: string;
  severity: string;
  status: string;
  summary: string | null;
  timeline: { at: string; note: string; by?: string }[];
  createdAt: string;
  resolvedAt: string | null;
  createdByName: string | null;
};

export default function IncidentDetailPage() {
  const { id } = useParams();
  const me = useSession();
  const isAdmin = me.user.platformRole === 'platform_admin';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'incident', id], queryFn: () => api.get<{ incident: Incident }>(`/admin/incidents/${id}`) });
  const i = q.data?.incident;
  const [form, setForm] = useState({ title: '', severity: 'low', status: 'open', summary: '' });
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | undefined>();
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    if (i) setForm({ title: i.title, severity: i.severity, status: i.status, summary: i.summary ?? '' });
  }, [i]);
  const dirty = !!i && (form.title !== i.title || form.severity !== i.severity || form.status !== i.status || form.summary !== (i.summary ?? ''));
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] });

  const save = useMutation({
    mutationFn: () => api.patch(`/admin/incidents/${id}`, { ...form, summary: form.summary || null }),
    onSuccess: () => {
      toast.success('Incident updated');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const post = useMutation({
    mutationFn: () => api.post(`/admin/incidents/${id}/timeline`, { note }),
    onSuccess: () => {
      setNote('');
      toast.success('Update posted');
      refresh();
    },
    onError: (e) => (e instanceof ApiError && e.fields.note ? setNoteError(e.fields.note) : toast.error(errorMessage(e))),
  });
  const del = useMutation({
    mutationFn: () => api.del(`/admin/incidents/${id}`),
    onSuccess: () => {
      toast.success('Incident deleted');
      refresh();
      navigate('/app/admin/incidents');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <SkeletonRows rows={5} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!i) return null;
  const announced = i.status !== 'resolved' && (i.severity === 'high' || i.severity === 'critical');

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/admin/incidents" className="hover:underline">
            Incidents
          </Link>
        }
        title={i.title}
        badge={
          <>
            <SeverityBadge severity={i.severity} />
            <StatusBadge status={i.status} />
          </>
        }
        description={`Started ${formatDateTime(i.createdAt)}${i.createdByName ? ` by ${i.createdByName}` : ''}${i.resolvedAt ? `. Resolved ${formatDateTime(i.resolvedAt)}.` : '.'}`}
        actions={
          <Button variant="ghost" icon={<TrashIcon size={16} />} onClick={() => setDeleting(true)} disabled={!isAdmin} disabledReason="Only platform admins can delete incidents.">
            Delete
          </Button>
        }
      />
      {announced && (
        <Banner tone="warning" className="mb-4">
          Signed-in users currently see a banner with this incident's title and status.
        </Banner>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader title="Details" />
          <CardBody className="space-y-3">
            <Field label="Title">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} disabled={!isAdmin} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Severity" helper={SEVERITY_HELP[form.severity]}>
                <Select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} disabled={!isAdmin}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </Field>
              <Field label="Status" helper="Monitoring means a fix is in place and you are watching.">
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} disabled={!isAdmin}>
                  <option value="open">Open</option>
                  <option value="monitoring">Monitoring</option>
                  <option value="resolved">Resolved</option>
                </Select>
              </Field>
            </div>
            <Field label="Summary" optional helper="Internal. Not shown in the banner.">
              <Textarea rows={4} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} disabled={!isAdmin} />
            </Field>
            <div className="flex justify-end">
              <Button
                variant="primary"
                loading={save.isPending}
                disabled={!isAdmin || !dirty}
                disabledReason={!isAdmin ? 'Only platform admins can edit incidents.' : 'No unsaved changes'}
                onClick={() => save.mutate()}
              >
                Save changes
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Timeline" description="Status and severity changes are added automatically." />
          <CardBody>
            <ol className="relative space-y-4 border-l border-border pl-4">
              {i.timeline.map((t, idx) => (
                <li key={idx}>
                  <span aria-hidden className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-accent" />
                  <div className="text-[12px] text-muted">
                    {formatDateTime(t.at)}
                    {t.by ? ` · ${t.by}` : ''}
                  </div>
                  <p className="whitespace-pre-wrap text-[14px]">{t.note}</p>
                </li>
              ))}
            </ol>
            {isAdmin && (
              <div className="mt-4 space-y-2 border-t border-border pt-4">
                <Field label="Post an update" error={noteError}>
                  <Textarea rows={2} value={note} onChange={(e) => (setNote(e.target.value), setNoteError(undefined))} placeholder="What changed, what you are doing next" />
                </Field>
                <div className="flex justify-end">
                  <Button icon={<PaperPlaneRightIcon size={16} />} loading={post.isPending} disabled={!note.trim()} disabledReason="Write an update first" onClick={() => post.mutate()}>
                    Post update
                  </Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this incident?"
        description="The record and its timeline are removed permanently. Prefer resolving incidents so the history is kept. The deletion is audited."
        confirmLabel="Delete incident"
        danger
        confirmText="delete"
        loading={del.isPending}
        onConfirm={() => del.mutate()}
      />
    </div>
  );
}
