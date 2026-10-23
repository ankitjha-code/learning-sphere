import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, BookOpenTextIcon, PathIcon, ArrowRightIcon, UsersIcon, ChalkboardTeacherIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage, ApiError } from '@/lib/api';
import { Badge, Button, Dialog, EmptyState, ErrorState, Field, Input, PageHeader, Select, SkeletonRows, Textarea } from '@/components/ui';
import { LIST_GROUP, useLookups } from './shared';

type CourseRow = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: string;
  track: { id: string; title: string; slug: string } | null;
  cohorts: { id: string; name: string }[];
  instructors: { userId: string; role: string; name: string }[];
  canManage: boolean;
};

export function CourseFormDialog({
  open,
  onOpenChange,
  courseId,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  courseId?: string;
  initial?: { code: string; title: string; description: string | null; trackId: string | null; termId: string | null };
}) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const lookups = useLookups();
  const [code, setCode] = useState(initial?.code ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [trackId, setTrackId] = useState(initial?.trackId ?? '');
  const [termId, setTermId] = useState(initial?.termId ?? '');
  const m = useMutation({
    mutationFn: () => {
      const payload = { code, title, description: description || null, trackId: trackId || null, termId: termId || null };
      return courseId ? api.patch<{ course: { id: string } }>(`/teach/courses/${courseId}`, payload) : api.post<{ course: { id: string } }>('/teach/courses', payload);
    },
    onSuccess: (r) => {
      toast.success(courseId ? 'Course updated' : 'Course created');
      qc.invalidateQueries({ queryKey: ['teach'] });
      onOpenChange(false);
      if (!courseId) nav(`/app/teach/courses/${r.course.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const fields = m.error instanceof ApiError ? m.error.fields : {};
  const orgTracks = lookups.data?.tracks.filter((t) => t.scope === 'org') ?? [];
  const globalTracks = lookups.data?.tracks.filter((t) => t.scope === 'global') ?? [];
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={courseId ? 'Edit course' : 'New course'}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={code.trim().length < 2 || title.trim().length < 3} disabledReason="Enter a code and a title" onClick={() => m.mutate()}>
            {courseId ? 'Save' : 'Create course'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
          <Field label="Code" error={fields.code}>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CS201" autoFocus />
          </Field>
          <Field label="Title" error={fields.title}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Data Structures" />
          </Field>
        </div>
        <Field label="Description" optional>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </Field>
        <Field
          label="Linked learning path"
          optional
          error={fields.trackId}
          helper={
            <>
              Students see progress on this path in analytics.{' '}
              <Link to="/app/create/paths" className="text-accent-text hover:underline">
                Author an organization path
              </Link>
            </>
          }
        >
          <Select value={trackId} onChange={(e) => setTrackId(e.target.value)}>
            <option value="">None</option>
            {orgTracks.length > 0 && (
              <optgroup label="Organization paths">
                {orgTracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                    {t.status !== 'published' ? ` (${t.status})` : ''}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="LearnSphere roadmaps">
              {globalTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>
        <Field label="Term" optional>
          <Select value={termId} onChange={(e) => setTermId(e.target.value)}>
            <option value="">None</option>
            {lookups.data?.terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

export default function CoursesPage() {
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ['teach', 'courses'], queryFn: () => api.get<{ items: CourseRow[] }>('/teach/courses') });
  return (
    <div>
      <PageHeader
        title="Courses"
        description="Courses group cohorts, instructors, announcements and an optional learning path."
        actions={
          <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setCreating(true)}>
            New course
          </Button>
        }
      />
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <SkeletonRows rows={4} />
      ) : !q.data!.items.length ? (
        <EmptyState icon={<BookOpenTextIcon size={22} />} title="No courses yet" description="Create a course, link your cohorts and a learning path, then post announcements to students." action={<Button variant="primary" onClick={() => setCreating(true)}>Create a course</Button>} />
      ) : (
        <ul className={LIST_GROUP}>
          {q.data!.items.map((c) => (
            <li key={c.id}>
              <Link to={`/app/teach/courses/${c.id}`} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2">
                <span className="flex h-11 w-16 shrink-0 items-center justify-center rounded-md bg-accent-soft px-1 font-mono text-[12px] font-semibold text-accent-text">
                  <span className="truncate">{c.code}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[14.5px] font-semibold tracking-[-0.005em]">{c.title}</span>
                    {c.status !== 'active' && <Badge>{c.status}</Badge>}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <UsersIcon size={14} className="text-subtle" aria-hidden />
                      {c.cohorts.length ? c.cohorts.map((x) => x.name).join(', ') : 'No cohorts linked'}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <ChalkboardTeacherIcon size={14} className="text-subtle" aria-hidden />
                      {c.instructors.map((i) => i.name).join(', ') || 'No instructors'}
                    </span>
                    {c.track && (
                      <span className="inline-flex items-center gap-1.5">
                        <PathIcon size={14} className="text-subtle" aria-hidden />
                        {c.track.title}
                      </span>
                    )}
                  </span>
                </span>
                <ArrowRightIcon size={16} className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {creating && <CourseFormDialog open={creating} onOpenChange={setCreating} />}
    </div>
  );
}
