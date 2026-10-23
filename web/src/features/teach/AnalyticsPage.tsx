import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChartBarIcon, InfoIcon, HandHeartIcon, CheckIcon, DownloadSimpleIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatDate, timeAgo } from '@/lib/format';
import { Avatar, Badge, Banner, Button, ButtonLink, Card, CardAction, CardBody, CardHeader, Checkbox, Dialog, EmptyState, ErrorState, Field, Input, PageHeader, Segmented, Select, Skeleton, StatTile, Textarea, Tooltip, buttonClass } from '@/components/ui';
import { BarList, NoData, THEAD, TH, TR, TD, csvHref, pctText, ratioText, useLookups } from './shared';

type Analytics = {
  cohort: { id: string; name: string };
  generatedAt: string;
  totals: { students: number; assignments: number; pastDueAssignments: number; completionRate: number | null; completionSample: number; onTimeRate: number | null; submissions: number; averagePercent: number | null; atRisk: number; attendanceSessions: number };
  assignments: { id: string; title: string; dueAt: string; pastDue: boolean; students: number; submittedStudents: number; completionRate: number | null; submissions: number; onTimeRate: number | null; graded: number; ungraded: number; averagePercent: number | null }[];
  backlog: { ungraded: number; ungradedLate: number; byGrader: { graderId: string; name: string; drafts: number; released: number }[] };
  students: { userId: string; name: string; email: string; submitted: number; late: number; assignments: number; averagePercent: number | null; gradedCount: number; attendancePercent: number | null; reasons: { code: string; text: string }[]; atRisk: boolean }[];
  conceptDifficulty: { criteria: { title: string; averageRatio: number; n: number; assignments: string[] }[]; skills: { skillId: string; name: string; slug: string; averageRatio: number; n: number }[] };
  topicProgress: { trackId: string; trackTitle: string; trackSlug: string; topics: { id: string; title: string; completed: number; started: number; averageMastery: number | null }[] }[];
  assessments: { id: string; title: string; available: boolean; message?: string; attempts?: number; averagePercent?: number | null }[];
  rules: Record<string, string>;
  definitions: Record<string, string>;
};
type Intervention = { id: string; studentName: string; facultyName: string; kind: string; reason: string | null; message: string | null; followUpOn: string | null; status: 'open' | 'done'; outcomeNote: string | null; createdAt: string; goalId: string | null };

function Def({ text }: { text: string }) {
  return (
    <Tooltip content={text}>
      <button type="button" className="text-subtle hover:text-fg" aria-label={text}>
        <InfoIcon size={14} />
      </button>
    </Tooltip>
  );
}

function InterventionDialog({ open, onOpenChange, cohortId, students }: { open: boolean; onOpenChange: (v: boolean) => void; cohortId: string; students: Analytics['students'] }) {
  const qc = useQueryClient();
  const lookups = useLookups();
  const [kind, setKind] = useState<'message' | 'revision_resource' | 'note'>('message');
  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('');
  const [trackId, setTrackId] = useState('');
  const [skillId, setSkillId] = useState('');
  const [followUpOn, setFollowUpOn] = useState('');
  const reason = students.flatMap((s) => s.reasons.map((r) => `${s.name}: ${r.text}`)).join(' ');
  const m = useMutation({
    mutationFn: () =>
      api.post<{ created: number }>('/teach/interventions', {
        cohortId,
        studentIds: students.map((s) => s.userId),
        kind,
        message: message.trim() || undefined,
        reason: reason.slice(0, 1000) || undefined,
        followUpOn: followUpOn || null,
        ...(kind === 'revision_resource' ? { resource: { title: title.trim(), trackId: trackId || null, skillId: skillId || null } } : {}),
      }),
    onSuccess: (r) => {
      toast.success(kind === 'note' ? `Logged for ${r.created} student${r.created === 1 ? '' : 's'}` : `Sent to ${r.created} student${r.created === 1 ? '' : 's'} and logged`);
      qc.invalidateQueries({ queryKey: ['teach', 'interventions'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const invalid = kind === 'message' ? message.trim().length < 10 : kind === 'revision_resource' ? title.trim().length < 3 : false;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Plan an intervention"
      description={`For ${students.map((s) => s.name).join(', ')}. Every intervention is logged so you can follow up.`}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={invalid} disabledReason={kind === 'message' ? 'Write at least 10 characters' : 'Name the revision resource'} onClick={() => m.mutate()}>
            {kind === 'message' ? 'Send message' : kind === 'revision_resource' ? 'Assign revision goal' : 'Log note'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          label="Intervention type"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'message', label: 'Supportive message' },
            { value: 'revision_resource', label: 'Revision goal' },
            { value: 'note', label: 'Log only' },
          ]}
        />
        {kind === 'revision_resource' && (
          <>
            <Field label="Goal title" helper="Added to each student's goals, marked as suggested by you.">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Revise hash maps and practice 3 problems" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Roadmap" optional>
                <Select value={trackId} onChange={(e) => setTrackId(e.target.value)}>
                  <option value="">None</option>
                  {lookups.data?.tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Skill" optional>
                <Select value={skillId} onChange={(e) => setSkillId(e.target.value)}>
                  <option value="">None</option>
                  {lookups.data?.skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </>
        )}
        <Field label={kind === 'note' ? 'Note (only instructors see this)' : 'Message to the student'} optional={kind !== 'message'} helper={kind === 'message' ? 'Keep it supportive and specific. Students receive it as an in-app notification.' : undefined}>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder={kind === 'message' ? 'I noticed the last two assignments are missing. Is anything getting in the way? Office hours are Thursday 3 to 5.' : ''} />
        </Field>
        <Field label="Follow up on" optional>
          <Input type="date" value={followUpOn} onChange={(e) => setFollowUpOn(e.target.value)} className="max-w-[200px]" />
        </Field>
      </div>
    </Dialog>
  );
}

export default function AnalyticsPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const cohorts = useQuery({ queryKey: ['teach', 'cohorts', 'mine', ''], queryFn: () => api.get<{ items: { id: string; name: string }[] }>('/teach/cohorts') });
  const cohortId = params.get('cohortId') ?? cohorts.data?.items[0]?.id ?? '';
  const q = useQuery({ queryKey: ['teach', 'analytics', cohortId], queryFn: () => api.get<Analytics>(`/teach/analytics/cohorts/${cohortId}`), enabled: !!cohortId });
  const iv = useQuery({ queryKey: ['teach', 'interventions', cohortId], queryFn: () => api.get<{ items: Intervention[] }>(`/teach/interventions?cohortId=${cohortId}`), enabled: !!cohortId });
  const [selected, setSelected] = useState<string[]>([]);
  const [planning, setPlanning] = useState(false);
  const [studentFilter, setStudentFilter] = useState<'risk' | 'all'>('risk');
  const done = useMutation({
    mutationFn: (id: string) => api.patch(`/teach/interventions/${id}`, { status: 'done' }),
    onSuccess: () => {
      toast.success('Marked as done');
      qc.invalidateQueries({ queryKey: ['teach', 'interventions'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const d = q.data;
  const shownStudents = d ? d.students.filter((s) => (studentFilter === 'risk' ? s.atRisk : true)) : [];

  return (
    <div>
      <PageHeader
        title="Cohort analytics"
        description="Completion, grading workload, concept difficulty and students who may need support. Every number states how it is calculated."
        actions={
          cohortId ? (
            <a href={csvHref(`/cohorts/${cohortId}/completion.csv`)} className={buttonClass('secondary', 'md')} download>
              <DownloadSimpleIcon size={16} /> Completion report
            </a>
          ) : undefined
        }
      />
      {cohorts.error ? (
        <ErrorState error={cohorts.error} onRetry={() => cohorts.refetch()} />
      ) : !cohorts.data ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : !cohorts.data.items.length ? (
        <EmptyState icon={<ChartBarIcon size={22} />} title="No cohorts yet" description="Analytics appear once you teach a cohort with published assignments." action={<ButtonLink to="/app/teach/cohorts" variant="primary">Go to cohorts</ButtonLink>} />
      ) : (
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="w-full sm:max-w-xs">
              <Select
                value={cohortId}
                aria-label="Cohort"
                onChange={(e) => {
                  setParams({ cohortId: e.target.value }, { replace: true });
                  setSelected([]);
                }}
              >
                {cohorts.data.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            {!cohortId ? (
              <p className="text-[13.5px] text-muted">Choose a cohort to see analytics.</p>
            ) : q.error ? (
              <ErrorState error={q.error} onRetry={() => q.refetch()} />
            ) : !d ? (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-[118px] rounded-lg" />
                ))}
              </div>
            ) : (
              <>
                <Banner tone="info">{d.definitions.causation}</Banner>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <StatTile label="Completion" value={ratioText(d.totals.completionRate)} hint={d.totals.completionSample ? `${d.totals.completionSample} student-assignment pairs` : 'No past-due assignments yet'} icon={<Def text={d.definitions.completionRate} />} />
                  <StatTile label="On time" value={ratioText(d.totals.onTimeRate)} hint={`${d.totals.submissions} submissions`} icon={<Def text={d.definitions.onTimeRate} />} />
                  <StatTile label="Average score" value={pctText(d.totals.averagePercent)} hint="Mean of assignment averages" icon={<Def text={d.definitions.averageScore} />} />
                  <StatTile label="Check in with" value={d.totals.atRisk} hint={`of ${d.totals.students} students`} icon={<Def text={d.definitions.atRisk} />} tone={d.totals.atRisk ? 'warning' : undefined} />
                </div>
              </>
            )}
          </div>

          {cohortId && d && (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
                <Card className="min-w-0">
                  <CardHeader title="Assignments" description={d.definitions.averageScore} />
                  {!d.assignments.length ? (
                    <CardBody>
                      <p className="text-[13.5px] text-muted">No published assignments yet.</p>
                    </CardBody>
                  ) : (
                    <>
                      <CardBody>
                        <BarList label="Average score per assignment" rows={d.assignments.map((a) => ({ label: a.title, value: a.averagePercent }))} />
                      </CardBody>
                      <div className="overflow-x-auto border-t border-border">
                        <table className="w-full min-w-[560px] text-left text-[13px]">
                          <thead className={THEAD}>
                            <tr>
                              <th scope="col" className={`${TH} pl-5`}>Assignment</th>
                              <th scope="col" className={`${TH} text-right`}>Completion</th>
                              <th scope="col" className={`${TH} text-right`}>On time</th>
                              <th scope="col" className={`${TH} text-right`}>Graded</th>
                              <th scope="col" className={`${TH} pr-5 text-right`}>Average</th>
                            </tr>
                          </thead>
                          <tbody>
                            {d.assignments.map((a) => (
                              <tr key={a.id} className={TR}>
                                <td className={`${TD} pl-5`}>
                                  <Link to={`/app/teach/assignments/${a.id}?tab=submissions`} className="font-semibold hover:text-accent-text hover:underline">
                                    {a.title}
                                  </Link>
                                  <div className="mt-0.5 text-[12px] text-subtle">
                                    Due {formatDate(a.dueAt)}
                                    {!a.pastDue && ' · still open'}
                                  </div>
                                </td>
                                <td className={`${TD} text-right tabular-nums`}>
                                  {a.submittedStudents}/{a.students}
                                </td>
                                <td className={`${TD} text-right tabular-nums`}>{ratioText(a.onTimeRate)}</td>
                                <td className={`${TD} text-right tabular-nums`}>
                                  {a.graded}/{a.submissions}
                                </td>
                                <td className={`${TD} pr-5 text-right tabular-nums`}>{pctText(a.averagePercent)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </Card>
                <Card className="flex flex-col">
                  <CardHeader title="Grading workload" action={<CardAction to="/app/teach/grading">Open grading queue</CardAction>} />
                  <p className="-mt-2 px-5 pb-3 text-[13px] leading-5 text-muted">{d.definitions.gradingBacklog}</p>
                  <CardBody className="flex-1">
                    <div className="flex items-baseline gap-2 rounded-md bg-surface-2 px-4 py-3">
                      <span className="font-display text-[28px] font-semibold leading-9 tracking-[-0.02em] tabular-nums">{d.backlog.ungraded}</span>
                      <span className="text-[13px] text-muted">ungraded{d.backlog.ungradedLate ? `, ${d.backlog.ungradedLate} late` : ''}</span>
                    </div>
                    {d.backlog.byGrader.length ? (
                      <ul className="mt-3 divide-y divide-border text-[13px]">
                        {d.backlog.byGrader.map((g) => (
                          <li key={g.graderId} className="flex items-center justify-between gap-3 py-2.5">
                            <span className="flex min-w-0 items-center gap-2.5">
                              <Avatar name={g.name} size={24} />
                              <span className="truncate font-medium">{g.name}</span>
                            </span>
                            <span className="shrink-0 text-right text-[12.5px] tabular-nums text-muted">
                              {g.drafts} to release · {g.released} released
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-[13px] text-muted">No grading recorded yet.</p>
                    )}
                  </CardBody>
                </Card>
              </div>

              <Card>
                <CardHeader title="Students" description={d.definitions.atRisk} />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
                  <Segmented label="Which students" value={studentFilter} onChange={setStudentFilter} options={[{ value: 'risk', label: `Check in (${d.totals.atRisk})` }, { value: 'all', label: `All (${d.totals.students})` }]} />
                  <Button size="sm" variant="primary" icon={<HandHeartIcon size={14} />} disabled={!selected.length} disabledReason="Select students first" onClick={() => setPlanning(true)}>
                    Plan intervention
                  </Button>
                </div>
                {!shownStudents.length ? (
                  <p className="border-t border-border px-5 py-4 text-[13.5px] text-muted">{studentFilter === 'risk' ? 'No student meets an at-risk rule. Rules without data are skipped.' : 'No students in this cohort.'}</p>
                ) : (
                  <div className="overflow-x-auto border-t border-border">
                    <table className="w-full min-w-[720px] text-left text-[13px]">
                      <thead className={THEAD}>
                        <tr>
                          <th scope="col" className="h-10 w-10 pl-5 pr-0">
                            <span className="sr-only">Select</span>
                          </th>
                          <th scope="col" className={TH}>Student</th>
                          <th scope="col" className={`${TH} text-right`}>Submitted</th>
                          <th scope="col" className={`${TH} text-right`}>Average</th>
                          <th scope="col" className={`${TH} text-right`}>Attendance</th>
                          <th scope="col" className={`${TH} pr-5`}>Why flagged</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shownStudents.map((s) => (
                          <tr key={s.userId} className={`${TR} align-top`}>
                            <td className="py-3 pl-5 pr-0">
                              <Checkbox checked={selected.includes(s.userId)} onCheckedChange={(v) => setSelected(v ? [...selected, s.userId] : selected.filter((x) => x !== s.userId))} label={<span className="sr-only">Select {s.name}</span>} />
                            </td>
                            <td className={TD}>
                              <div className="font-semibold">{s.name}</div>
                              <div className="mt-0.5 text-[12px] text-subtle">{s.email}</div>
                            </td>
                            <td className={`${TD} text-right tabular-nums`}>
                              {s.submitted}/{s.assignments}
                              {s.late > 0 && <div className="text-[12px] text-warning">{s.late} late</div>}
                            </td>
                            <td className={`${TD} text-right tabular-nums`}>{s.averagePercent === null ? <NoData /> : `${Math.round(s.averagePercent)}%`}</td>
                            <td className={`${TD} text-right tabular-nums`}>{s.attendancePercent === null ? <NoData /> : `${Math.round(s.attendancePercent)}%`}</td>
                            <td className={`${TD} pr-5 text-[12.5px]`}>
                              {s.reasons.length ? (
                                <ul className="space-y-1">
                                  {s.reasons.map((r) => (
                                    <li key={r.code} className="flex items-start gap-1.5">
                                      <WarningCircleIcon size={14} weight="fill" className="mt-px shrink-0 text-warning" aria-hidden />
                                      <span>{r.text}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="text-subtle">Not flagged</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Concept difficulty" description={d.definitions.conceptDifficulty} />
                  <CardBody className="space-y-5">
                    {!d.conceptDifficulty.criteria.length && !d.conceptDifficulty.skills.length ? (
                      <p className="text-[13.5px] text-muted">No graded rubric scores yet.</p>
                    ) : (
                      <>
                        {d.conceptDifficulty.criteria.length > 0 && (
                          <div>
                            <h3 className="mb-2.5 text-[13px] font-semibold">Rubric criteria (hardest first)</h3>
                            <BarList label="Average share of rubric points per criterion" rows={d.conceptDifficulty.criteria.map((c) => ({ label: `${c.title} (n=${c.n})`, value: c.averageRatio * 100 }))} />
                          </div>
                        )}
                        {d.conceptDifficulty.skills.length > 0 && (
                          <div className="border-t border-border pt-5">
                            <h3 className="mb-2.5 text-[13px] font-semibold">Skills (hardest first)</h3>
                            <BarList label="Average score ratio per skill" rows={d.conceptDifficulty.skills.map((s) => ({ label: `${s.name} (n=${s.n})`, value: s.averageRatio * 100 }))} />
                          </div>
                        )}
                      </>
                    )}
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader title="Roadmap progress" description={d.definitions.topicProgress} />
                  <CardBody>
                    {!d.topicProgress.length ? (
                      <p className="text-[13.5px] text-muted">
                        No learning path is linked to this cohort's courses.{' '}
                        <Link to="/app/teach/courses" className="font-medium text-accent-text hover:underline">
                          Link one on a course
                        </Link>
                        .
                      </p>
                    ) : (
                      d.topicProgress.map((t) => (
                        <div key={t.trackId} className="mb-5 border-b border-border pb-5 last:mb-0 last:border-0 last:pb-0">
                          <h3 className="mb-2.5 text-[13px] font-semibold">{t.trackTitle}</h3>
                          <BarList label={`Students who completed each topic in ${t.trackTitle}`} max={d.totals.students || 1} unit="" rows={t.topics.slice(0, 12).map((x) => ({ label: x.title, value: x.completed }))} />
                          <p className="mt-2.5 text-[12px] text-subtle">Bars show students who completed each topic, out of {d.totals.students}.</p>
                        </div>
                      ))
                    )}
                  </CardBody>
                </Card>
              </div>

              {d.assessments.length > 0 && (
                <Card>
                  <CardHeader title="Linked assessments" description={d.definitions.assessments} />
                  <ul className="divide-y divide-border border-t border-border text-[13px]">
                    {d.assessments.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3">
                        <span className="font-medium">{a.title}</span>
                        <span className="text-muted">{a.available ? `${a.attempts} attempts · average ${pctText(a.averagePercent ?? null)}` : a.message}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              <Card>
                <CardHeader title="Interventions" description="Messages, revision goals and notes you or colleagues logged for this cohort." />
                {iv.error ? (
                  <CardBody>
                    <ErrorState error={iv.error} onRetry={() => iv.refetch()} />
                  </CardBody>
                ) : !iv.data?.items.length ? (
                  <CardBody>
                    <p className="rounded-md bg-surface-2 px-4 py-3 text-[13px] text-muted">None yet. Select students above and choose Plan intervention.</p>
                  </CardBody>
                ) : (
                  <ul className="divide-y divide-border border-t border-border">
                    {iv.data.items.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-start gap-4 px-5 py-4 text-[13px]">
                        <Avatar name={i.studentName} size={32} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13.5px] font-semibold">{i.studentName}</span>
                            <Badge tone={i.kind === 'message' ? 'info' : i.kind === 'revision_resource' ? 'accent' : 'neutral'}>{i.kind === 'message' ? 'Message' : i.kind === 'revision_resource' ? 'Revision goal' : 'Note'}</Badge>
                            {i.status === 'done' ? <Badge tone="success">Done</Badge> : i.followUpOn ? <Badge tone="warning">Follow up {formatDate(`${i.followUpOn}T12:00:00`)}</Badge> : null}
                          </div>
                          {i.message && <p className="mt-1 leading-relaxed text-fg">{i.message}</p>}
                          {i.reason && <p className="mt-1 text-[12px] text-subtle">Prompted by: {i.reason}</p>}
                          <div className="mt-1 text-[12px] text-subtle">
                            {i.facultyName} · {timeAgo(i.createdAt)}
                          </div>
                        </div>
                        {i.status === 'open' && (
                          <Button size="sm" icon={<CheckIcon size={14} />} loading={done.isPending && done.variables === i.id} onClick={() => done.mutate(i.id)}>
                            Mark done
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHeader title="How these numbers are calculated" description={`Generated ${timeAgo(d.generatedAt)}.`} />
                <CardBody>
                  <dl className="grid gap-x-8 gap-y-4 text-[13px] md:grid-cols-2">
                    {Object.entries(d.definitions).map(([k, v]) => (
                      <div key={k}>
                        <dt className="font-semibold">{k.replace(/([A-Z])/g, ' $1').replace(/^\w/, (c) => c.toUpperCase())}</dt>
                        <dd className="mt-0.5 leading-relaxed text-muted">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </CardBody>
              </Card>
            </>
          )}
        </div>
      )}
      {planning && d && <InterventionDialog open={planning} onOpenChange={setPlanning} cohortId={cohortId} students={d.students.filter((s) => selected.includes(s.userId))} />}
    </div>
  );
}
