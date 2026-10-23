import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CaretLeftIcon, UserPlusIcon, UsersIcon, DownloadSimpleIcon, PencilSimpleIcon, TrashIcon, ClipboardTextIcon, ChartBarIcon, CalendarCheckIcon, WarningCircleIcon, CheckCircleIcon, ChartLineUpIcon, BookOpenTextIcon, ArrowRightIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatDate, dueLabel } from '@/lib/format';
import { Avatar, Badge, Button, ButtonLink, ConfirmDialog, EmptyState, ErrorState, Menu, PageHeader, SkeletonRows, StatTile, StatusBadge, Tabs, buttonClass } from '@/components/ui';
import { LIST_GROUP, PeoplePickerDialog, TABLE_WRAP, THEAD, TH, TR, TD, csvHref, pctText } from './shared';
import { CohortFormDialog } from './CohortsPage';

type Detail = {
  cohort: { id: string; name: string; kind: string; programId: string | null; termId: string | null; graduationYear: number | null; programName: string | null; termName: string | null; ownerId: string | null };
  students: {
    userId: string;
    name: string;
    email: string;
    addedAt: string;
    progress: { submitted: number; assignments: number; late: number; averagePercent: number | null; attendancePercent: number | null; atRisk: boolean; reasons: { code: string; text: string }[] } | null;
  }[];
  staff: { userId: string; name: string; email: string; role: string }[];
  courses: { id: string; code: string; title: string }[];
  assignments: { id: string; title: string; status: string; dueAt: string; collaboration: string }[];
  totals: { students: number; completionRate: number | null; onTimeRate: number | null; averagePercent: number | null; atRisk: number; attendanceSessions: number };
};

export default function CohortDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [tab, setTab] = useState('roster');
  const [adding, setAdding] = useState<null | 'student' | 'faculty'>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removing, setRemoving] = useState<{ userId: string; name: string } | null>(null);
  const q = useQuery({ queryKey: ['teach', 'cohort', id], queryFn: () => api.get<Detail>(`/teach/cohorts/${id}`) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['teach'] });

  const add = useMutation({
    mutationFn: (v: { userIds: string[]; role: string }) => api.post<{ added: number; skipped: { userId: string; reason: string }[] }>(`/teach/cohorts/${id}/members`, v),
    onSuccess: (r) => {
      toast.success(`Added ${r.added}${r.skipped.length ? `. Skipped ${r.skipped.length}: ${r.skipped[0].reason}` : ''}`);
      setAdding(null);
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api.del(`/teach/cohorts/${id}/members/${userId}`),
    onSuccess: () => {
      toast.success('Removed from cohort');
      setRemoving(null);
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: () => api.del(`/teach/cohorts/${id}`),
    onSuccess: () => {
      toast.success('Cohort deleted');
      invalidate();
      nav('/app/teach/cohorts');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data) return <SkeletonRows rows={6} />;
  const d = q.data;
  const existing = [...d.students.map((s) => s.userId), ...d.staff.map((s) => s.userId)];

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/teach/cohorts" className="inline-flex items-center gap-1 hover:text-fg">
            <CaretLeftIcon size={14} /> Cohorts
          </Link>
        }
        title={d.cohort.name}
        description={[d.cohort.kind.replace(/^\w/, (c) => c.toUpperCase()), d.cohort.programName, d.cohort.termName, d.cohort.graduationYear ? `Class of ${d.cohort.graduationYear}` : null].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button variant="primary" icon={<UserPlusIcon size={16} />} onClick={() => setAdding('student')}>
              Add students
            </Button>
            <ButtonLink to={`/app/teach/assignments/new?cohortId=${d.cohort.id}`} icon={<ClipboardTextIcon size={16} />}>
              New assignment
            </ButtonLink>
            <Menu
              items={[
                { label: 'Edit details', icon: <PencilSimpleIcon size={15} />, onSelect: () => setEditing(true) },
                { label: 'Add instructor or TA', icon: <UserPlusIcon size={15} />, onSelect: () => setAdding('faculty') },
                { label: 'Take attendance', icon: <CalendarCheckIcon size={15} />, onSelect: () => nav(`/app/teach/attendance?cohortId=${d.cohort.id}`) },
                { label: 'Open analytics', icon: <ChartBarIcon size={15} />, onSelect: () => nav(`/app/teach/analytics?cohortId=${d.cohort.id}`) },
                'separator',
                { label: 'Delete cohort', icon: <TrashIcon size={15} />, danger: true, onSelect: () => setDeleting(true) },
              ]}
            />
          </>
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Students" value={d.totals.students} hint={`${d.totals.attendanceSessions} attendance session${d.totals.attendanceSessions === 1 ? '' : 's'}`} icon={<UsersIcon weight="bold" />} tone="accent" />
        <StatTile label="Completion" value={d.totals.completionRate === null ? 'No data' : `${Math.round(d.totals.completionRate * 100)}%`} hint="Past-due assignments" icon={<CheckCircleIcon weight="bold" />} tone="success" />
        <StatTile label="Average score" value={pctText(d.totals.averagePercent)} hint="Across graded work" icon={<ChartLineUpIcon weight="bold" />} tone="accent" />
        <StatTile label="Check in with" value={d.totals.atRisk} hint="Students meeting a rule" icon={<WarningCircleIcon weight="bold" />} tone={d.totals.atRisk ? 'warning' : 'success'} />
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: 'roster', label: 'Roster', count: d.students.length },
          { value: 'staff', label: 'Instructors', count: d.staff.length },
          { value: 'assignments', label: 'Assignments and teams', count: d.assignments.length },
          { value: 'courses', label: 'Courses', count: d.courses.length },
        ]}
        className="mb-4"
      />

      {tab === 'roster' &&
        (!d.students.length ? (
          <EmptyState icon={<UsersIcon size={22} />} title="No students yet" description="Add students who have the Student role in your organization." action={<Button variant="primary" onClick={() => setAdding('student')}>Add students</Button>} />
        ) : (
          <>
            <div className="mb-3 flex justify-end">
              <a href={csvHref(`/cohorts/${d.cohort.id}/completion.csv`)} className={buttonClass('secondary', 'sm')} download>
                <DownloadSimpleIcon size={14} /> Completion report (CSV)
              </a>
            </div>
            <div className={TABLE_WRAP}>
              <table className="w-full min-w-[720px] text-left text-[13.5px]">
                <thead className={THEAD}>
                  <tr>
                    <th scope="col" className={TH}>Student</th>
                    <th scope="col" className={`${TH} text-right`}>Submitted</th>
                    <th scope="col" className={`${TH} text-right`}>Average</th>
                    <th scope="col" className={`${TH} text-right`}>Attendance</th>
                    <th scope="col" className={TH}>Needs attention</th>
                    <th scope="col" className="h-10 w-12 pr-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {d.students.map((s) => (
                    <tr key={s.userId} className={TR}>
                      <td className={TD}>
                        <div className="font-semibold">{s.name}</div>
                        <div className="mt-0.5 text-[12px] text-subtle">{s.email}</div>
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>
                        {s.progress ? `${s.progress.submitted}/${s.progress.assignments}` : 'No data'}
                        {s.progress?.late ? <div className="text-[11.5px] text-warning">{s.progress.late} late</div> : null}
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>{pctText(s.progress?.averagePercent)}</td>
                      <td className={`${TD} text-right tabular-nums`}>{pctText(s.progress?.attendancePercent)}</td>
                      <td className={`${TD} text-[12.5px]`}>
                        {s.progress?.reasons.length ? (
                          <ul className="space-y-0.5">
                            {s.progress.reasons.map((r) => (
                              <li key={r.code} className="text-warning">
                                {r.text}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-subtle">None</span>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-right">
                        <Menu items={[{ label: 'Remove from cohort', danger: true, icon: <TrashIcon size={15} />, onSelect: () => setRemoving({ userId: s.userId, name: s.name }) }]} label={`Actions for ${s.name}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[12.5px] text-subtle">Average uses graded work only. Attendance uses marked sessions only. Missing data shows "No data" and never counts against a student.</p>
          </>
        ))}

      {tab === 'staff' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" icon={<UserPlusIcon size={14} />} onClick={() => setAdding('faculty')}>
              Add instructor or TA
            </Button>
          </div>
          <ul className={LIST_GROUP}>
            {d.staff.map((s) => (
              <li key={s.userId} className="flex items-center gap-4 px-5 py-4">
                <Avatar name={s.name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] font-semibold tracking-[-0.005em]">{s.name}</div>
                  <div className="mt-0.5 text-[12.5px] text-muted">{s.email}</div>
                </div>
                <Badge tone="accent">{s.role === 'ta' ? 'Teaching assistant' : 'Instructor'}</Badge>
                <Menu items={[{ label: 'Remove', danger: true, icon: <TrashIcon size={15} />, onSelect: () => setRemoving({ userId: s.userId, name: s.name }) }]} label={`Actions for ${s.name}`} />
              </li>
            ))}
            {!d.staff.length && <li className="px-5 py-4 text-[13.5px] text-muted">No instructors listed. Faculty admins can always see this cohort.</li>}
          </ul>
        </div>
      )}

      {tab === 'assignments' &&
        (!d.assignments.length ? (
          <EmptyState icon={<ClipboardTextIcon size={22} />} title="No assignments yet" description="Create an assignment for this cohort. Team assignments let you form teams before publishing." action={<ButtonLink to={`/app/teach/assignments/new?cohortId=${d.cohort.id}`} variant="primary">New assignment</ButtonLink>} />
        ) : (
          <ul className={LIST_GROUP}>
            {d.assignments.map((a) => {
              const due = dueLabel(a.dueAt);
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
                    <ClipboardTextIcon size={18} weight="duotone" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link to={`/app/teach/assignments/${a.id}`} className="text-[14.5px] font-semibold tracking-[-0.005em] hover:text-accent-text hover:underline">
                      {a.title}
                    </Link>
                    <div className="mt-0.5 text-[12.5px] text-muted">Due {formatDate(a.dueAt)}</div>
                  </div>
                  {a.collaboration === 'team' && (
                    <Link to={`/app/teach/assignments/${a.id}?tab=teams`} className="text-[13px] font-medium text-accent-text hover:underline">
                      Manage teams
                    </Link>
                  )}
                  <StatusBadge status={a.status} />
                  {a.status === 'published' && <Badge tone={due.tone === 'neutral' ? 'neutral' : due.tone}>{due.text}</Badge>}
                </li>
              );
            })}
          </ul>
        ))}

      {tab === 'courses' &&
        (!d.courses.length ? (
          <EmptyState icon={<ClipboardTextIcon size={22} />} title="Not linked to a course" description="Link this cohort from a course page to share announcements and roadmap progress." action={<ButtonLink to="/app/teach/courses" variant="primary">Go to courses</ButtonLink>} />
        ) : (
          <ul className={LIST_GROUP}>
            {d.courses.map((c) => (
              <li key={c.id}>
                <Link to={`/app/teach/courses/${c.id}`} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
                    <BookOpenTextIcon size={18} weight="duotone" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold tracking-[-0.005em] group-hover:text-accent-text">
                    {c.code} · {c.title}
                  </span>
                  <ArrowRightIcon size={16} className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
                </Link>
              </li>
            ))}
          </ul>
        ))}

      <PeoplePickerDialog
        open={adding === 'student'}
        onOpenChange={(v) => !v && setAdding(null)}
        role="student"
        title="Add students"
        description="Only people with the Student role in this organization are listed."
        exclude={existing}
        loading={add.isPending}
        onConfirm={(ids) => add.mutate({ userIds: ids, role: 'student' })}
      />
      <PeoplePickerDialog
        open={adding === 'faculty'}
        onOpenChange={(v) => !v && setAdding(null)}
        role="faculty"
        title="Add instructors"
        description="Instructors can grade, take attendance and see analytics for this cohort."
        exclude={existing}
        loading={add.isPending}
        onConfirm={(ids) => add.mutate({ userIds: ids, role: 'instructor' })}
      />
      {editing && <CohortFormDialog open={editing} onOpenChange={setEditing} cohortId={d.cohort.id} initial={d.cohort} />}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        title="Remove from cohort?"
        description={`${removing?.name} will no longer see this cohort's assignments. Their submitted work and grades are kept.`}
        confirmLabel="Remove"
        danger
        loading={remove.isPending}
        onConfirm={() => {
          if (removing) remove.mutate(removing.userId);
        }}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this cohort?"
        description="This deletes the cohort, its draft assignments and attendance. Cohorts with submitted work cannot be deleted; close their assignments instead."
        confirmLabel="Delete cohort"
        danger
        confirmText={d.cohort.name}
        loading={del.isPending}
        onConfirm={() => del.mutate()}
      />
    </div>
  );
}
