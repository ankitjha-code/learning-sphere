import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CalendarCheckIcon, PlusIcon, TrashIcon, PencilSimpleIcon, CheckIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Badge, Button, ButtonLink, Card, CardBody, CardHeader, ConfirmDialog, EmptyState, ErrorState, Field, Input, Kbd, Menu, PageHeader, Select, SkeletonRows, Tabs } from '@/components/ui';
import { LIST_GROUP, TABLE_WRAP, THEAD, TH, TR, TD, pctText } from './shared';

type Status = 'present' | 'absent' | 'late' | 'excused';
const STATUSES: { value: Status; label: string; key: string; tone: string }[] = [
  { value: 'present', label: 'Present', key: 'P', tone: 'bg-success-soft text-success border-success' },
  { value: 'absent', label: 'Absent', key: 'A', tone: 'bg-danger-soft text-danger border-danger' },
  { value: 'late', label: 'Late', key: 'L', tone: 'bg-warning-soft text-warning border-warning' },
  { value: 'excused', label: 'Excused', key: 'E', tone: 'bg-info-soft text-info border-info' },
];

type SessionRow = { id: string; heldOn: string; topic: string | null; courseCode: string | null; takenByName: string; counts: { present: number; absent: number; late: number; excused: number; marked: number } };
type Roster = { userId: string; name: string; email: string; status: Status | null }[];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Roster with one row per student. Arrow keys move between rows; P, A, L, E set the status. */
function MarkingTable({ roster, marks, setMark }: { roster: Roster; marks: Record<string, Status>; setMark: (uid: string, s: Status) => void }) {
  const rows = useRef<(HTMLTableRowElement | null)[]>([]);
  const onKey = (e: KeyboardEvent<HTMLTableRowElement>, i: number, uid: string) => {
    const k = e.key.toUpperCase();
    const s = STATUSES.find((x) => x.key === k);
    if (s) {
      e.preventDefault();
      setMark(uid, s.value);
      rows.current[Math.min(i + 1, roster.length - 1)]?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      rows.current[Math.min(i + 1, roster.length - 1)]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      rows.current[Math.max(i - 1, 0)]?.focus();
    }
  };
  return (
    <div className={TABLE_WRAP}>
      <table className="w-full min-w-[560px] text-left text-[13.5px]">
        <caption className="sr-only">Attendance marks. Focus a row and press P, A, L or E.</caption>
        <thead className={THEAD}>
          <tr>
            <th scope="col" className={TH}>Student</th>
            <th scope="col" className={TH}>Status</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((r, i) => (
            <tr
              key={r.userId}
              ref={(el) => {
                rows.current[i] = el;
              }}
              tabIndex={0}
              onKeyDown={(e) => onKey(e, i, r.userId)}
              className="border-b border-border last:border-0 focus:bg-accent-soft focus:outline-none"
              aria-label={`${r.name}: ${marks[r.userId] ?? 'not marked'}`}
            >
              <td className={TD}>
                <div className="font-semibold">{r.name}</div>
                <div className="mt-0.5 text-[12px] text-subtle">{r.email}</div>
              </td>
              <td className={TD}>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Status for ${r.name}`}>
                  {STATUSES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      role="radio"
                      aria-checked={marks[r.userId] === s.value}
                      tabIndex={-1}
                      onClick={() => setMark(r.userId, s.value)}
                      className={clsx('h-7 rounded-md border px-2.5 text-[12.5px] font-medium', marks[r.userId] === s.value ? s.tone : 'border-border text-muted hover:bg-surface-2')}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TakeAttendance({ cohortId, sessionId, onDone }: { cohortId: string; sessionId?: string; onDone: () => void }) {
  const qc = useQueryClient();
  const cohort = useQuery({ queryKey: ['teach', 'cohort', cohortId], queryFn: () => api.get<{ students: { userId: string; name: string; email: string }[]; courses: { id: string; code: string }[] }>(`/teach/cohorts/${cohortId}`) });
  const existing = useQuery({ queryKey: ['teach', 'attendance-session', sessionId], queryFn: () => api.get<{ session: { heldOn: string; topic: string | null }; roster: Roster }>(`/teach/attendance/sessions/${sessionId}`), enabled: !!sessionId });
  const [heldOn, setHeldOn] = useState(today());
  const [topic, setTopic] = useState('');
  const [courseId, setCourseId] = useState('');
  const [marks, setMarks] = useState<Record<string, Status>>({});
  useEffect(() => {
    if (existing.data) {
      setHeldOn(existing.data.session.heldOn);
      setTopic(existing.data.session.topic ?? '');
      setMarks(Object.fromEntries(existing.data.roster.filter((r) => r.status).map((r) => [r.userId, r.status as Status])));
    }
  }, [existing.data]);
  const roster: Roster = sessionId ? (existing.data?.roster ?? []) : (cohort.data?.students ?? []).map((s) => ({ ...s, status: null }));
  const save = useMutation({
    mutationFn: () => {
      const list = Object.entries(marks).map(([userId, status]) => ({ userId, status }));
      return sessionId
        ? Promise.all([api.patch(`/teach/attendance/sessions/${sessionId}`, { heldOn, topic: topic || null }), api.put<{ recordsUpdated: number }>(`/teach/attendance/sessions/${sessionId}/marks`, { marks: list })]).then((r) => r[1] as { recordsUpdated: number })
        : api.post<{ recordsUpdated: number }>('/teach/attendance/sessions', { cohortId, heldOn, topic: topic || undefined, courseId: courseId || null, marks: list });
    },
    onSuccess: (r) => {
      toast.success(`Attendance saved${r.recordsUpdated ? `. ${r.recordsUpdated} student record${r.recordsUpdated === 1 ? '' : 's'} updated` : ''}.`);
      qc.invalidateQueries({ queryKey: ['teach'] });
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (cohort.error || existing.error) return <ErrorState error={cohort.error ?? existing.error} onRetry={() => (cohort.refetch(), existing.refetch())} />;
  if (cohort.isLoading || (sessionId && existing.isLoading)) return <SkeletonRows rows={5} />;
  const unmarked = roster.filter((r) => !marks[r.userId]).length;
  return (
    <Card>
      <CardHeader title={sessionId ? 'Edit attendance' : 'Take attendance'} description="Focus a row, then press P, A, L or E. Arrow keys move between students." />
      <CardBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date">
            <Input type="date" value={heldOn} onChange={(e) => setHeldOn(e.target.value)} />
          </Field>
          <Field label="Topic" optional>
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Binary trees" />
          </Field>
          {!sessionId && (
            <Field label="Course" optional>
              <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="">None</option>
                {cohort.data?.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        {!roster.length ? (
          <EmptyState icon={<CalendarCheckIcon size={22} />} title="No students in this cohort" description="Add students to the cohort before taking attendance." action={<ButtonLink to={`/app/teach/cohorts/${cohortId}`}>Open cohort</ButtonLink>} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
              <Button size="sm" icon={<CheckIcon size={14} />} onClick={() => setMarks(Object.fromEntries(roster.map((r) => [r.userId, marks[r.userId] ?? 'present'])))}>
                Mark everyone else present
              </Button>
              <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 sm:ml-auto">
                {STATUSES.map((s) => (
                  <span key={s.key} className="inline-flex items-center gap-1">
                    <Kbd>{s.key}</Kbd> {s.label}
                  </span>
                ))}
              </span>
            </div>
            <MarkingTable roster={roster} marks={marks} setMark={(uid, s) => setMarks((m) => ({ ...m, [uid]: s }))} />
          </>
        )}
        <div className="-mx-5 -mb-5 flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4">
          {unmarked > 0 && <span className="mr-auto text-[12.5px] text-muted">{unmarked} not marked. Unmarked students count as no data, not absent.</span>}
          <Button onClick={onDone}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} disabled={!Object.keys(marks).length || !heldOn} disabledReason="Mark at least one student" onClick={() => save.mutate()}>
            Save attendance
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export default function AttendancePage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const cohorts = useQuery({ queryKey: ['teach', 'cohorts', 'mine', ''], queryFn: () => api.get<{ items: { id: string; name: string; students: number }[] }>('/teach/cohorts') });
  const cohortId = params.get('cohortId') ?? cohorts.data?.items[0]?.id ?? '';
  const [mode, setMode] = useState<null | { sessionId?: string }>(null);
  const [tab, setTab] = useState('history');
  const [deleting, setDeleting] = useState<SessionRow | null>(null);
  const sessions = useQuery({ queryKey: ['teach', 'attendance', cohortId], queryFn: () => api.get<{ items: SessionRow[] }>(`/teach/attendance/sessions?cohortId=${cohortId}`), enabled: !!cohortId });
  const summary = useQuery({
    queryKey: ['teach', 'attendance-summary', cohortId],
    queryFn: () => api.get<{ sessions: number; students: { userId: string; name: string; present: number; late: number; absent: number; excused: number; marked: number; percent: number | null; hasRecord: boolean }[]; definition: string }>(`/teach/attendance/summary?cohortId=${cohortId}`),
    enabled: !!cohortId && tab === 'summary',
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/teach/attendance/sessions/${id}`),
    onSuccess: () => {
      toast.success('Session deleted');
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['teach'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div>
      <PageHeader
        title="Attendance"
        description="Record attendance per session. Percentages count present and late over marked sessions, excluding excused absences."
        actions={
          cohortId && !mode ? (
            <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setMode({})}>
              Take attendance
            </Button>
          ) : undefined
        }
      />
      {cohorts.error ? (
        <ErrorState error={cohorts.error} onRetry={() => cohorts.refetch()} />
      ) : !cohorts.data ? (
        <SkeletonRows rows={4} />
      ) : !cohorts.data.items.length ? (
        <EmptyState icon={<CalendarCheckIcon size={22} />} title="No cohorts yet" description="Create a cohort and add students to take attendance." action={<ButtonLink to="/app/teach/cohorts" variant="primary">Go to cohorts</ButtonLink>} />
      ) : (
        <div className="space-y-4">
          <div className="w-full sm:max-w-xs">
            <Select
              value={cohortId}
              aria-label="Cohort"
              onChange={(e) => {
                setParams({ cohortId: e.target.value }, { replace: true });
                setMode(null);
              }}
            >
              {cohorts.data.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.students})
                </option>
              ))}
            </Select>
          </div>
          {mode ? (
            <TakeAttendance key={mode.sessionId ?? 'new'} cohortId={cohortId} sessionId={mode.sessionId} onDone={() => setMode(null)} />
          ) : (
            <>
              <Tabs value={tab} onValueChange={setTab} tabs={[{ value: 'history', label: 'Sessions', count: sessions.data?.items.length }, { value: 'summary', label: 'Per student' }]} />
              {tab === 'history' &&
                (sessions.error ? (
                  <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} />
                ) : !sessions.data ? (
                  <SkeletonRows rows={4} />
                ) : !sessions.data.items.length ? (
                  <EmptyState icon={<CalendarCheckIcon size={22} />} title="No sessions recorded" description="Take attendance for a class session. It takes a few keystrokes per student." action={<Button variant="primary" onClick={() => setMode({})}>Take attendance</Button>} />
                ) : (
                  <ul className={LIST_GROUP}>
                    {sessions.data.items.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted ring-1 ring-inset ring-border">
                          <CalendarCheckIcon size={18} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[14.5px] font-semibold tracking-[-0.005em]">
                            {formatDate(`${s.heldOn}T12:00:00`)}
                            {s.topic ? ` · ${s.topic}` : ''}
                          </div>
                          <div className="mt-0.5 text-[12.5px] text-muted">
                            {s.courseCode ? `${s.courseCode} · ` : ''}Taken by {s.takenByName}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge tone="success">{s.counts.present} present</Badge>
                          {s.counts.late > 0 && <Badge tone="warning">{s.counts.late} late</Badge>}
                          {s.counts.absent > 0 && <Badge tone="danger">{s.counts.absent} absent</Badge>}
                          {s.counts.excused > 0 && <Badge tone="info">{s.counts.excused} excused</Badge>}
                        </div>
                        <Menu
                          label={`Actions for session on ${s.heldOn}`}
                          items={[
                            { label: 'Edit marks', icon: <PencilSimpleIcon size={15} />, onSelect: () => setMode({ sessionId: s.id }) },
                            { label: 'Delete session', icon: <TrashIcon size={15} />, danger: true, onSelect: () => setDeleting(s) },
                          ]}
                        />
                      </li>
                    ))}
                  </ul>
                ))}
              {tab === 'summary' &&
                (summary.error ? (
                  <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
                ) : !summary.data ? (
                  <SkeletonRows rows={4} />
                ) : (
                  <>
                    <p className="text-[12.5px] text-muted">{summary.data.definition}</p>
                    <div className={TABLE_WRAP}>
                      <table className="w-full min-w-[600px] text-left text-[13.5px]">
                        <thead className={THEAD}>
                          <tr>
                            <th scope="col" className={TH}>Student</th>
                            <th scope="col" className={`${TH} text-right`}>Present</th>
                            <th scope="col" className={`${TH} text-right`}>Late</th>
                            <th scope="col" className={`${TH} text-right`}>Absent</th>
                            <th scope="col" className={`${TH} text-right`}>Excused</th>
                            <th scope="col" className={`${TH} text-right`}>Attendance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.data.students.map((s) => (
                            <tr key={s.userId} className={TR}>
                              <td className={`${TD} font-semibold`}>
                                {s.name}
                                {!s.hasRecord && <span className="ml-1.5 text-[11.5px] font-normal text-subtle">(no student record to update)</span>}
                              </td>
                              <td className={`${TD} text-right tabular-nums`}>{s.present}</td>
                              <td className={`${TD} text-right tabular-nums`}>{s.late}</td>
                              <td className={`${TD} text-right tabular-nums`}>{s.absent}</td>
                              <td className={`${TD} text-right tabular-nums`}>{s.excused}</td>
                              <td className={clsx(TD, 'text-right tabular-nums', s.percent !== null && s.percent < 75 && 'font-semibold text-warning')}>{pctText(s.percent)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ))}
            </>
          )}
        </div>
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete this session?"
        description="Its marks are removed and attendance percentages are recalculated."
        confirmLabel="Delete session"
        danger
        loading={del.isPending}
        onConfirm={() => {
          if (deleting) del.mutate(deleting.id);
        }}
      />
    </div>
  );
}
