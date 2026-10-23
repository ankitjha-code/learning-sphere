import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CaretLeftIcon, MegaphoneIcon, PathIcon, PencilSimpleIcon, TrashIcon, UsersIcon, LinkIcon, ClipboardTextIcon, ArrowRightIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDate, timeAgo } from '@/lib/format';
import { Avatar, Badge, Button, Card, CardAction, CardBody, CardHeader, Checkbox, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input, Markdown, Menu, PageHeader, Section, Select, SkeletonRows, StatusBadge, Textarea } from '@/components/ui';
import { LIST_GROUP, PeoplePickerDialog } from './shared';
import { CourseFormDialog } from './CoursesPage';

type Detail = {
  course: { id: string; code: string; title: string; description: string | null; trackId: string | null; termId: string | null; ownerName: string; status: string };
  track: { id: string; slug: string; title: string; scope: 'global' | 'org' } | null;
  cohorts: { id: string; name: string; kind: string; students: number }[];
  instructors: { userId: string; role: string; name: string; email: string }[];
  announcements: { id: string; title: string; body: string; createdAt: string; authorName: string; cohortName: string | null }[];
  assignments: { id: string; title: string; status: string; dueAt: string; cohortName: string | null }[];
  canManage: boolean;
};

function LinkCohortsDialog({ open, onOpenChange, courseId, current }: { open: boolean; onOpenChange: (v: boolean) => void; courseId: string; current: string[] }) {
  const qc = useQueryClient();
  const cohorts = useQuery({ queryKey: ['teach', 'cohorts', 'all', ''], queryFn: () => api.get<{ items: { id: string; name: string; students: number }[] }>('/teach/cohorts?scope=all'), enabled: open });
  const [picked, setPicked] = useState<string[]>(current);
  const m = useMutation({
    mutationFn: () => api.put(`/teach/courses/${courseId}/cohorts`, { cohortIds: picked }),
    onSuccess: () => {
      toast.success('Linked cohorts updated');
      qc.invalidateQueries({ queryKey: ['teach'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Linked cohorts"
      description="Students in linked cohorts receive this course's announcements."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>
            Save
          </Button>
        </>
      }
    >
      {cohorts.error ? (
        <ErrorState error={cohorts.error} onRetry={() => cohorts.refetch()} />
      ) : !cohorts.data ? (
        <SkeletonRows rows={3} />
      ) : !cohorts.data.items.length ? (
        <p className="text-[13.5px] text-muted">No cohorts yet. Create one under Cohorts first.</p>
      ) : (
        <ul className="space-y-2">
          {cohorts.data.items.map((c) => (
            <li key={c.id}>
              <Checkbox checked={picked.includes(c.id)} onCheckedChange={(v) => setPicked(v ? [...picked, c.id] : picked.filter((x) => x !== c.id))} label={c.name} description={`${c.students} students`} />
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function AnnouncementDialog({ open, onOpenChange, courseId, cohorts }: { open: boolean; onOpenChange: (v: boolean) => void; courseId: string; cohorts: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [cohortId, setCohortId] = useState('');
  const m = useMutation({
    mutationFn: () => api.post<{ notified: number }>(`/teach/courses/${courseId}/announcements`, { title, body, cohortId: cohortId || null }),
    onSuccess: (r) => {
      toast.success(`Announcement posted. ${r.notified} people notified.`);
      qc.invalidateQueries({ queryKey: ['teach', 'course', courseId] });
      setTitle('');
      setBody('');
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const fields = m.error instanceof ApiError ? m.error.fields : {};
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Post an announcement"
      description="Members of the chosen cohorts get an in-app notification (category: organization announcements)."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={title.trim().length < 3 || !body.trim()} disabledReason="Add a title and a message" onClick={() => m.mutate()}>
            Post announcement
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Audience">
          <Select value={cohortId} onChange={(e) => setCohortId(e.target.value)}>
            <option value="">All linked cohorts</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Title" error={fields.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Message" helper="Markdown is supported." error={fields.body}>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
        </Field>
      </div>
    </Dialog>
  );
}

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [announcing, setAnnouncing] = useState(false);
  const [addingInstructor, setAddingInstructor] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const q = useQuery({ queryKey: ['teach', 'course', id], queryFn: () => api.get<Detail>(`/teach/courses/${id}`) });
  const addInstructor = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const userId of ids) await api.post(`/teach/courses/${id}/instructors`, { userId, role: 'instructor' });
    },
    onSuccess: () => {
      toast.success('Instructor added');
      setAddingInstructor(false);
      qc.invalidateQueries({ queryKey: ['teach'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const removeInstructor = useMutation({
    mutationFn: (userId: string) => api.del(`/teach/courses/${id}/instructors/${userId}`),
    onSuccess: () => {
      toast.success('Instructor removed');
      qc.invalidateQueries({ queryKey: ['teach'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: () => api.del(`/teach/courses/${id}`),
    onSuccess: () => {
      toast.success('Course deleted');
      qc.invalidateQueries({ queryKey: ['teach'] });
      nav('/app/teach/courses');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data) return <SkeletonRows rows={6} />;
  const d = q.data;
  const manageReason = d.canManage ? undefined : 'Only the course owner, its instructors or a faculty admin can change this course';

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/teach/courses" className="inline-flex items-center gap-1 hover:text-fg">
            <CaretLeftIcon size={14} /> Courses
          </Link>
        }
        title={`${d.course.code} · ${d.course.title}`}
        description={
          <>
            {d.course.description && <span className="block">{d.course.description}</span>}
            <span className={d.course.description ? 'mt-1 block text-[13px] text-subtle' : undefined}>Owner: {d.course.ownerName}</span>
          </>
        }
        actions={
          <>
            <Button variant="primary" icon={<MegaphoneIcon size={16} />} disabled={!d.canManage || !d.cohorts.length} disabledReason={manageReason ?? 'Link a cohort first'} onClick={() => setAnnouncing(true)}>
              Post announcement
            </Button>
            {d.canManage && (
              <Menu
                items={[
                  { label: 'Edit course', icon: <PencilSimpleIcon size={15} />, onSelect: () => setEditing(true) },
                  { label: 'Link cohorts', icon: <LinkIcon size={15} />, onSelect: () => setLinking(true) },
                  'separator',
                  { label: 'Delete course', icon: <TrashIcon size={15} />, danger: true, onSelect: () => setDeleting(true) },
                ]}
              />
            )}
          </>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          <Section title="Announcements" description="Newest first. Each one notifies every member of the linked cohorts.">
            {!d.announcements.length ? (
              <EmptyState icon={<MegaphoneIcon size={22} />} title="No announcements yet" description="Announcements notify every member of the linked cohorts." />
            ) : (
              <ul className={LIST_GROUP}>
                {d.announcements.map((a) => (
                  <li key={a.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14.5px] font-semibold tracking-[-0.005em]">{a.title}</span>
                      <Badge>{a.cohortName ?? 'All linked cohorts'}</Badge>
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-subtle">
                      {a.authorName} · {timeAgo(a.createdAt)}
                    </div>
                    <Markdown source={a.body} className="mt-2 text-[13.5px]! leading-relaxed!" />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Assignments" action={<CardAction to="/app/teach/assignments/new">New assignment</CardAction>}>
            {!d.assignments.length ? (
              <p className="rounded-lg border border-dashed border-border-strong/70 px-5 py-6 text-center text-[13px] text-muted">No assignments are linked to this course yet. Choose this course when creating an assignment.</p>
            ) : (
              <ul className={LIST_GROUP}>
                {d.assignments.map((a) => (
                  <li key={a.id}>
                    <Link to={`/app/teach/assignments/${a.id}`} className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-surface-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
                        <ClipboardTextIcon size={18} weight="duotone" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-semibold tracking-[-0.005em] group-hover:text-accent-text">{a.title}</span>
                        <span className="mt-0.5 block text-[12.5px] text-muted">
                          {a.cohortName} · due {formatDate(a.dueAt)}
                        </span>
                      </span>
                      <StatusBadge status={a.status} />
                      <ArrowRightIcon size={16} className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="Learning path" action={<CardAction to="/app/create/paths">Author paths</CardAction>} />
            <CardBody>
              {d.track ? (
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
                    <PathIcon size={18} weight="duotone" />
                  </span>
                  <div className="min-w-0">
                    <Link to={`/app/learn/${d.track.slug}`} className="text-[13.5px] font-semibold hover:text-accent-text hover:underline">
                      {d.track.title}
                    </Link>
                    <div className="mt-0.5 text-[12.5px] text-muted">{d.track.scope === 'org' ? 'Organization path' : 'LearnSphere roadmap'}. Topic progress shows in cohort analytics.</div>
                  </div>
                </div>
              ) : (
                <p className="text-[13px] text-muted">
                  No path linked.{' '}
                  {d.canManage && (
                    <button className="font-medium text-accent-text hover:underline" onClick={() => setEditing(true)}>
                      Link one
                    </button>
                  )}
                </p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Cohorts" action={d.canManage && <CardAction onClick={() => setLinking(true)}>Edit</CardAction>} />
            {!d.cohorts.length ? (
              <CardBody>
                <p className="text-[13px] text-muted">No cohorts linked.</p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {d.cohorts.map((c) => (
                  <li key={c.id}>
                    <Link to={`/app/teach/cohorts/${c.id}`} className="flex items-center gap-3 px-5 py-3 text-[13.5px] transition-colors hover:bg-surface-2">
                      <UsersIcon size={16} className="shrink-0 text-subtle" />
                      <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                      <span className="text-[12.5px] tabular-nums text-muted">
                        {c.students} student{c.students === 1 ? '' : 's'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Instructors" action={d.canManage && <CardAction onClick={() => setAddingInstructor(true)}>Add</CardAction>} />
            <ul className="divide-y divide-border border-t border-border">
              {d.instructors.map((i) => (
                <li key={i.userId} className="flex items-center gap-3 px-5 py-3 text-[13.5px]">
                  <Avatar name={i.name} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{i.name}</span>
                    <span className="block truncate text-[12px] text-subtle">{i.role === 'ta' ? 'Teaching assistant' : i.email}</span>
                  </span>
                  {d.canManage && d.instructors.length > 1 && (
                    <Button size="icon-sm" variant="ghost" aria-label={`Remove ${i.name}`} onClick={() => removeInstructor.mutate(i.userId)}>
                      <TrashIcon size={14} />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>

      {editing && <CourseFormDialog open={editing} onOpenChange={setEditing} courseId={d.course.id} initial={d.course} />}
      {linking && <LinkCohortsDialog open={linking} onOpenChange={setLinking} courseId={d.course.id} current={d.cohorts.map((c) => c.id)} />}
      <AnnouncementDialog open={announcing} onOpenChange={setAnnouncing} courseId={d.course.id} cohorts={d.cohorts} />
      <PeoplePickerDialog
        open={addingInstructor}
        onOpenChange={setAddingInstructor}
        role="faculty"
        title="Add instructors"
        exclude={d.instructors.map((i) => i.userId)}
        loading={addInstructor.isPending}
        onConfirm={(ids) => addInstructor.mutate(ids)}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this course?"
        description="Announcements are deleted. Cohorts and assignments are kept, but lose the link to this course."
        confirmLabel="Delete course"
        danger
        confirmText={d.course.code}
        loading={del.isPending}
        onConfirm={() => del.mutate()}
      />
    </div>
  );
}
