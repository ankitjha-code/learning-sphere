import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileTextIcon, PlusIcon, UploadSimpleIcon, StarIcon, CopyIcon, TrashIcon, GitBranchIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { PageHeader, ErrorState, SkeletonRows, EmptyState, Button, Dialog, Field, Input, Select, Segmented, Badge, Menu, ConfirmDialog } from '@/components/ui';
import { ImportDialog } from './ImportDialog';
import type { ResumeSummary } from './api';

function NewResumeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [title, setTitle] = useState('My resume');
  const [template, setTemplate] = useState('clean');
  const [start, setStart] = useState<'profile' | 'blank'>('profile');
  const create = useMutation({
    mutationFn: () => api.post<{ resume: { id: string } }>('/career/resumes', { title, template, start }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['career'] });
      toast.success('Resume created.');
      onOpenChange(false);
      nav(`/app/career/resumes/${r.resume.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const fields = create.error instanceof ApiError ? create.error.fields : {};
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create a resume"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={create.isPending} onClick={() => create.mutate()} disabled={!title.trim()} disabledReason="Name the resume first">
            Create resume
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name" required error={fields.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Template" helper="You can switch templates at any time; content stays the same.">
          <Select value={template} onChange={(e) => setTemplate(e.target.value)}>
            <option value="clean">Clean (serif, classic)</option>
            <option value="compact">Compact (fits more on one page)</option>
            <option value="modern">Modern (sans-serif, accent headings)</option>
          </Select>
        </Field>
        <div className="space-y-1.5">
          <div className="text-[13px] font-medium">Start from</div>
          <Segmented
            label="Start from"
            value={start}
            onChange={setStart}
            options={[
              { value: 'profile', label: 'My profile' },
              { value: 'blank', label: 'Blank' },
            ]}
          />
          <p className="text-[12.5px] text-subtle">{start === 'profile' ? 'Copies the experience and education you entered in your profile. Nothing else is added.' : 'Only your name is filled in.'}</p>
        </div>
      </div>
    </Dialog>
  );
}

export default function ResumesPage() {
  const [params, setParams] = useSearchParams();
  const [newOpen, setNewOpen] = useState(params.get('new') === '1');
  const [importOpen, setImportOpen] = useState(false);
  const [toDelete, setToDelete] = useState<ResumeSummary | null>(null);
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['career', 'resumes'], queryFn: () => api.get<{ items: ResumeSummary[] }>('/career/resumes') });
  const primary = useMutation({
    mutationFn: (id: string) => api.post(`/career/resumes/${id}/primary`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['career', 'resumes'] });
      toast.success('Primary resume updated.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const copy = useMutation({
    mutationFn: (id: string) => api.post<{ resume: { id: string } }>(`/career/resumes/${id}/copy`, {}),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['career', 'resumes'] });
      toast.success('New version created.');
      nav(`/app/career/resumes/${r.resume.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/career/resumes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['career'] });
      setToDelete(null);
      toast.success('Resume deleted.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const items = q.data?.items ?? [];
  const titleOf = (id: string | null) => items.find((r) => r.id === id)?.title;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Resumes"
        description="Structured resumes with versions for different roles. Checks flag weak spots; nothing is ever added for you."
        actions={
          <>
            <Button icon={<UploadSimpleIcon size={16} />} onClick={() => setImportOpen(true)}>
              Import text
            </Button>
            <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setNewOpen(true)}>
              New resume
            </Button>
          </>
        }
      />
      {q.isLoading ? (
        <SkeletonRows rows={3} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={<FileTextIcon size={22} />} title="No resumes yet" description="Start from your profile, or paste an existing resume and confirm each field we find." action={<Button variant="primary" onClick={() => setNewOpen(true)}>Create a resume</Button>} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
          {items.map((r) => (
            <li key={r.id} className="group relative flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
                <FileTextIcon size={18} weight="duotone" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <Link to={`/app/career/resumes/${r.id}`} className="text-[14.5px] font-semibold tracking-[-0.005em] after:absolute after:inset-0 hover:text-accent-text">
                    {r.title}
                  </Link>
                  {r.isPrimary && <Badge tone="accent" icon={<StarIcon size={11} weight="fill" />}>Primary</Badge>}
                  {r.targetRole && <Badge>For {r.targetRole}</Badge>}
                </div>
                <div className="mt-0.5 text-[12.5px] text-muted">
                  <span className="capitalize">{r.template}</span> template · version {r.version} · edited {timeAgo(r.updatedAt)}
                  {r.parentId && (
                    <>
                      {' '}
                      · <GitBranchIcon size={12} className="inline align-[-1px]" aria-hidden /> from {titleOf(r.parentId) ?? 'a deleted resume'}
                    </>
                  )}
                </div>
              </div>
              <div className="relative z-10 shrink-0">
                <Menu
                  items={[
                    { label: 'Make primary', icon: <StarIcon size={14} />, onSelect: () => primary.mutate(r.id), disabled: r.isPrimary },
                    { label: 'Create a new version', icon: <CopyIcon size={14} />, onSelect: () => copy.mutate(r.id) },
                    'separator',
                    { label: 'Delete', icon: <TrashIcon size={14} />, danger: true, onSelect: () => setToDelete(r) },
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <NewResumeDialog
        open={newOpen}
        onOpenChange={(v) => {
          setNewOpen(v);
          if (!v && params.get('new')) setParams({}, { replace: true });
        }}
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="Delete this resume?"
        description="This cannot be undone. Applications that referenced it keep their record but lose the link."
        confirmText={toDelete?.title}
        confirmLabel="Delete resume"
        danger
        loading={del.isPending}
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
      />
    </div>
  );
}
