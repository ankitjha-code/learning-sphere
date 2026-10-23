import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PathIcon, PlusIcon, ListChecksIcon, UsersIcon, ClockIcon, PencilSimpleIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { PageHeader, Button, Card, Badge, StatusBadge, EmptyState, ErrorState, Skeleton, Dialog, Field, Input, Textarea, Select, TagsInput, Banner } from '@/components/ui';
import { Breadcrumb, DIFFICULTIES, cap, type Path } from './shared';

type PathRow = Path & { topicCount: number; enrollments: number };

export default function PathsListPage() {
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ['create', 'paths'], queryFn: () => api.get<{ items: PathRow[] }>('/create/paths'), retry: (n, e) => !(e instanceof ApiError && e.status === 403) && n < 2 });
  const forbidden = q.error instanceof ApiError && q.error.status === 403;

  return (
    <div>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Creator studio', to: '/app/create' }, { label: 'Learning paths' }]} />}
        title="Learning paths"
        description="Ordered topics with notes, resources, practice and quizzes, published to members of your organization."
        actions={
          !forbidden && (
            <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setCreating(true)}>
              New path
            </Button>
          )
        }
      />

      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      ) : !q.data?.items.length ? (
        <EmptyState
          icon={<PathIcon size={22} />}
          title="No learning paths yet"
          description="Create a path, add topics in order, then publish it so your members can enroll."
          action={
            <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setCreating(true)}>
              Create a path
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {q.data.items.map((p) => (
            <Card key={p.id} className="relative flex flex-col p-5 transition-colors hover:border-border-strong">
              <div className="flex items-start justify-between gap-2">
                <Link to={`/app/create/paths/${p.id}`} className="font-semibold leading-snug after:absolute after:inset-0 hover:underline">
                  {p.title}
                </Link>
                <StatusBadge status={p.status} />
              </div>
              <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted">{p.summary}</p>
              <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 pr-6 text-[12.5px] text-muted">
                <Badge>{cap(p.level)}</Badge>
                <span className="inline-flex items-center gap-1">
                  <ListChecksIcon size={13} aria-hidden /> {p.topicCount} {p.topicCount === 1 ? 'topic' : 'topics'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <UsersIcon size={13} aria-hidden /> {p.enrollments} enrolled
                </span>
                {p.estimatedHours && (
                  <span className="inline-flex items-center gap-1">
                    <ClockIcon size={13} aria-hidden /> {p.estimatedHours} h
                  </span>
                )}
                <span>v{p.version}</span>
                <span>Updated {timeAgo(p.updatedAt)}</span>
              </div>
              <PencilSimpleIcon size={14} className="absolute bottom-5 right-5 text-subtle" aria-hidden />
            </Card>
          ))}
        </div>
      )}

      {creating && <NewPathDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewPathDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [category, setCategory] = useState('');
  const [level, setLevel] = useState('beginner');
  const [hours, setHours] = useState('');
  const [roles, setRoles] = useState<string[]>([]);

  const m = useMutation({
    mutationFn: () =>
      api.post<{ path: Path }>('/create/paths', {
        title,
        summary,
        category: category.trim() || undefined,
        level,
        estimatedHours: hours ? Number(hours) : null,
        roles,
      }),
    onSuccess: (r) => {
      toast.success('Path created. Add your first topic.');
      qc.invalidateQueries({ queryKey: ['create'] });
      navigate(`/app/create/paths/${r.path.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const fields = m.error instanceof ApiError ? m.error.fields : {};

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title="New learning path"
      description="It starts as a draft. Only you and other editors in your organization can see it until you publish."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>
            Create path
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        {m.error && !Object.keys(fields).length && <Banner tone="danger">{errorMessage(m.error)}</Banner>}
        <Field label="Title" required error={fields.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} autoFocus />
        </Field>
        <Field label="Summary" required helper="One sentence describing who it is for and what they will be able to do." error={fields.summary}>
          <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} maxLength={400} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Category" optional error={fields.category}>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="custom" maxLength={40} />
          </Field>
          <Field label="Level" error={fields.level}>
            <Select value={level} onChange={(e) => setLevel(e.target.value)}>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {cap(d)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estimated hours" optional error={fields.estimatedHours}>
            <Input type="number" min={1} max={1000} value={hours} onChange={(e) => setHours(e.target.value)} />
          </Field>
        </div>
        <Field label="Target roles" optional helper="Separate with commas" error={fields.roles}>
          <TagsInput value={roles} onChange={setRoles} placeholder="Data Analyst, Backend Developer" />
        </Field>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
