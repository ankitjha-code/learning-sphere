import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { PlusIcon, ListChecksIcon, CopyIcon, PencilSimpleIcon, TrashIcon, ClockCounterClockwiseIcon, CaretDownIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { Badge, Banner, Button, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input, Menu, PageHeader, SkeletonRows } from '@/components/ui';
import { LIST_GROUP, RubricBuilder, RubricTable, cleanCriteria, defaultCriterion, rubricMax, validateRubricClient, type RubricCriterion } from './shared';

type Rubric = { id: string; title: string; criteria: RubricCriterion[]; version: number; ownerName: string; usedBy: number; updatedAt: string; ownerId: string };
type RubricDetail = {
  rubric: Rubric;
  versions: { id: string; version: number; title: string; criteria: RubricCriterion[]; editedByName: string; createdAt: string }[];
  usedBy: { id: string; title: string; status: string }[];
};

export function RubricEditorDialog({ open, onOpenChange, rubric, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; rubric?: Rubric; onSaved?: (r: { id: string; title: string }) => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(rubric?.title ?? '');
  const [criteria, setCriteria] = useState<RubricCriterion[]>(rubric?.criteria ?? [defaultCriterion('Correctness'), defaultCriterion('Communication')]);
  const clientError = validateRubricClient(title, criteria);
  const m = useMutation({
    mutationFn: () => {
      const payload = { title: title.trim(), criteria: cleanCriteria(criteria) };
      return rubric ? api.patch<{ rubric: Rubric }>(`/teach/rubrics/${rubric.id}`, payload) : api.post<{ rubric: Rubric }>('/teach/rubrics', payload);
    },
    onSuccess: (r) => {
      toast.success(rubric ? `Saved as version ${r.rubric.version}` : 'Rubric created');
      qc.invalidateQueries({ queryKey: ['teach', 'rubrics'] });
      qc.invalidateQueries({ queryKey: ['teach', 'rubric'] });
      onSaved?.(r.rubric);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={rubric ? `Edit ${rubric.title}` : 'New rubric'}
      description={rubric ? 'Saving creates a new version. Published assignments keep the version they were published with.' : 'Criteria with levels and points. Rubric points are scaled to each assignment’s maximum points.'}
      footer={
        <>
          {clientError && <span className="mr-auto self-center text-[12.5px] text-warning">{clientError}</span>}
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={!!clientError} disabledReason={clientError ?? undefined} onClick={() => m.mutate()}>
            {rubric ? 'Save new version' : 'Create rubric'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Programming assignment rubric" autoFocus />
        </Field>
        <RubricBuilder value={criteria} onChange={setCriteria} />
      </div>
    </Dialog>
  );
}

function VersionsDialog({ rubricId, onOpenChange }: { rubricId: string; onOpenChange: (v: boolean) => void }) {
  const q = useQuery({ queryKey: ['teach', 'rubric', rubricId], queryFn: () => api.get<RubricDetail>(`/teach/rubrics/${rubricId}`) });
  const [shown, setShown] = useState<number | null>(null);
  return (
    <Dialog open onOpenChange={onOpenChange} size="lg" title="Version history" description="Every saved version is kept. Assignments store the version they were published with.">
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <SkeletonRows rows={3} />
      ) : (
        <div className="space-y-4">
          {q.data!.usedBy.length > 0 && (
            <Banner tone="info" title={`Used by ${q.data!.usedBy.length} assignment${q.data!.usedBy.length === 1 ? '' : 's'}`}>
              {q.data!.usedBy.map((a) => a.title).join(', ')}
            </Banner>
          )}
          <ul className="divide-y divide-border rounded-lg border border-border">
            {q.data!.versions.map((v) => (
              <li key={v.id} className="px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={v.version === q.data!.rubric.version ? 'accent' : 'neutral'}>Version {v.version}</Badge>
                  <span className="text-[13.5px]">{v.title}</span>
                  <span className="text-[12px] text-subtle">
                    {v.editedByName} · {formatDateTime(v.createdAt)}
                  </span>
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setShown(shown === v.version ? null : v.version)}>
                    {shown === v.version ? 'Hide' : 'Show criteria'}
                  </Button>
                </div>
                {shown === v.version && (
                  <div className="mt-2">
                    <RubricTable criteria={v.criteria} compact />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}

export default function RubricsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Rubric | 'new' | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Rubric | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['teach', 'rubrics'], queryFn: () => api.get<{ items: Rubric[] }>('/teach/rubrics') });
  const dup = useMutation({
    mutationFn: (id: string) => api.post(`/teach/rubrics/${id}/duplicate`),
    onSuccess: () => {
      toast.success('Copy created');
      qc.invalidateQueries({ queryKey: ['teach', 'rubrics'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/teach/rubrics/${id}`),
    onSuccess: () => {
      toast.success('Rubric deleted');
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['teach', 'rubrics'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div>
      <PageHeader
        title="Rubrics"
        description="Reusable grading criteria shared across your organization. Edits create a new version; published assignments keep their own copy."
        actions={
          <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setEditing('new')}>
            New rubric
          </Button>
        }
      />
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <SkeletonRows rows={4} />
      ) : !q.data!.items.length ? (
        <EmptyState icon={<ListChecksIcon size={22} />} title="No rubrics yet" description="Create a rubric with criteria and levels so grading is consistent and students see how they are assessed." action={<Button variant="primary" onClick={() => setEditing('new')}>Create a rubric</Button>} />
      ) : (
        <ul className={LIST_GROUP}>
          {q.data!.items.map((r) => (
            <li key={r.id}>
              <div className="flex items-center gap-4 px-5 py-4">
                <button className="group flex min-w-0 flex-1 items-center gap-4 text-left" onClick={() => setExpanded(expanded === r.id ? null : r.id)} aria-expanded={expanded === r.id}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
                    <ListChecksIcon size={18} weight="duotone" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[14.5px] font-semibold tracking-[-0.005em] group-hover:text-accent-text">
                      {r.title}
                      <CaretDownIcon size={13} weight="bold" className={clsx('shrink-0 text-subtle transition-transform', expanded === r.id && 'rotate-180')} aria-hidden />
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-muted">
                      {r.criteria.length} criteria · {rubricMax(r.criteria)} points · version {r.version} · {r.ownerName} · updated {timeAgo(r.updatedAt)}
                    </span>
                  </span>
                </button>
                {r.usedBy > 0 && <Badge tone="info">Used by {r.usedBy}</Badge>}
                <Menu
                  label={`Actions for ${r.title}`}
                  items={[
                    { label: 'Edit (new version)', icon: <PencilSimpleIcon size={15} />, onSelect: () => setEditing(r) },
                    { label: 'Duplicate', icon: <CopyIcon size={15} />, onSelect: () => dup.mutate(r.id) },
                    { label: 'Version history', icon: <ClockCounterClockwiseIcon size={15} />, onSelect: () => setHistory(r.id) },
                    'separator',
                    { label: 'Delete', icon: <TrashIcon size={15} />, danger: true, onSelect: () => setDeleting(r) },
                  ]}
                />
              </div>
              {expanded === r.id && (
                <div className="border-t border-border bg-surface-2 px-5 py-4">
                  <RubricTable criteria={r.criteria} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <RubricEditorDialog open onOpenChange={(v) => !v && setEditing(null)} rubric={editing === 'new' ? undefined : editing} />}
      {history && <VersionsDialog rubricId={history} onOpenChange={(v) => !v && setHistory(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete rubric?"
        description="Published assignments keep their copy of this rubric. Draft assignments that use it must switch to another rubric first."
        confirmLabel="Delete rubric"
        danger
        loading={del.isPending}
        onConfirm={() => {
          if (deleting) del.mutate(deleting.id);
        }}
      />
    </div>
  );
}
