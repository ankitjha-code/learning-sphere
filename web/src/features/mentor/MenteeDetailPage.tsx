import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PlusIcon, LockKeyIcon, ShieldCheckIcon, TrashIcon, CheckIcon, SealCheckIcon, ArrowSquareOutIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDate, timeAgo, pct, fromLocalInput } from '@/lib/format';
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Dialog,
  ErrorState,
  Field,
  Input,
  Menu,
  PageHeader,
  ProvenanceTag,
  Select,
  Skeleton,
  SkeletonRows,
  StatusBadge,
  Tabs,
  Textarea,
} from '@/components/ui';
import {
  AssignmentList,
  FeedbackForm,
  FeedbackList,
  FollowUpChecklist,
  GoalList,
  MessagesPanel,
  NotSharedNote,
  SampleTag,
  ScheduleButton,
  SessionCard,
  SharedNotes,
  useMentorship,
  type FollowUp,
  type Session,
  type MentorshipDetail,
} from '@/features/mentors/shared';
import { SharingBadges } from './shared';

type NotShared = { shared: false };
type Progress = {
  sharing: MentorshipDetail['mentorship']['sharing'];
  skillDna:
    | NotShared
    | {
        shared: true;
        skills: { slug: string; name: string; category: string; state: string; mastery: number | null; confidence: number; verified: boolean; evidenceCount: number; lastEvidenceAt: string | null }[];
      };
  projects:
    | NotShared
    | {
        shared: true;
        projects: {
          id: string;
          title: string;
          category: string;
          status: string;
          visibility: string;
          repoUrl: string | null;
          demoUrl: string | null;
          milestonesDone: number;
          milestonesTotal: number;
          completedAt: string | null;
        }[];
      };
  assessments: NotShared | { shared: true; attempts: { id: string; title: string; mode: string; status: string; score: number | null; maxScore: number | null; submittedAt: string | null }[] };
  applications: NotShared | { shared: true; applications: { id: string; company: string; role: string; status: string; appliedAt: string | null; updatedAt: string }[] };
};

function SharedLabel() {
  return (
    <Badge tone="success" icon={<ShieldCheckIcon size={12} />}>
      Shared by mentee
    </Badge>
  );
}

function ProgressReview({ mentorshipId }: { mentorshipId: string }) {
  const q = useQuery({ queryKey: ['mentorship-progress', mentorshipId], queryFn: () => api.get<Progress>(`/mentorship/${mentorshipId}/progress`) });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <SkeletonRows rows={4} />;
  const p = q.data;
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted">Computed live from the mentee's records, limited to what they share. If they turn something off, it disappears here immediately.</p>
      <Card>
        <CardHeader title="Skill DNA" action={p.skillDna.shared ? <SharedLabel /> : undefined} />
        <CardBody>
          {!p.skillDna.shared ? (
            <NotSharedNote what="their Skill DNA" />
          ) : !p.skillDna.skills.length ? (
            <p className="text-[13px] text-muted">No skill evidence yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="text-left text-[12px] text-subtle">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">Skill</th>
                    <th className="py-1.5 pr-3 font-medium">State</th>
                    <th className="py-1.5 pr-3 font-medium">Mastery</th>
                    <th className="py-1.5 pr-3 font-medium">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {p.skillDna.skills.map((s) => (
                    <tr key={s.slug}>
                      <td className="py-1.5 pr-3">
                        {s.name} <span className="text-subtle">· {s.category}</span>
                      </td>
                      <td className="py-1.5 pr-3">
                        <span className="inline-flex items-center gap-1">
                          <StatusBadge status={s.state} />
                          {s.verified && <ProvenanceTag kind="verified" />}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 tabular-nums">{pct(s.mastery)}</td>
                      <td className="py-1.5 pr-3 tabular-nums text-muted">
                        {s.evidenceCount}
                        {s.lastEvidenceAt ? ` · ${timeAgo(s.lastEvidenceAt)}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Projects" action={p.projects.shared ? <SharedLabel /> : undefined} />
        <CardBody>
          {!p.projects.shared ? (
            <NotSharedNote what="their projects" />
          ) : !p.projects.projects.length ? (
            <p className="text-[13px] text-muted">No projects yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {p.projects.projects.map((pr) => (
                <li key={pr.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13.5px]">
                  <span>
                    {pr.title} <span className="text-subtle">· {pr.category}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {pr.milestonesTotal > 0 && (
                      <span className="text-[12px] tabular-nums text-muted">
                        {pr.milestonesDone}/{pr.milestonesTotal} milestones
                      </span>
                    )}
                    {pr.repoUrl && (
                      <a href={pr.repoUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-[12px] text-accent-text hover:underline">
                        Repo <ArrowSquareOutIcon size={12} />
                      </a>
                    )}
                    <StatusBadge status={pr.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Assessment results" action={p.assessments.shared ? <SharedLabel /> : undefined} />
        <CardBody>
          {!p.assessments.shared ? (
            <NotSharedNote what="assessment results" />
          ) : !p.assessments.attempts.length ? (
            <p className="text-[13px] text-muted">No released results yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {p.assessments.attempts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-[13.5px]">
                  <span>
                    {a.title} <span className="text-subtle">· {a.mode}</span>
                  </span>
                  <span className="tabular-nums">{a.score !== null && a.maxScore ? `${Math.round(a.score * 10) / 10} / ${a.maxScore}` : 'Not scored'}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Job applications" action={p.applications.shared ? <SharedLabel /> : undefined} />
        <CardBody>
          {!p.applications.shared ? (
            <NotSharedNote what="their job applications" />
          ) : !p.applications.applications.length ? (
            <p className="text-[13px] text-muted">No applications tracked.</p>
          ) : (
            <ul className="divide-y divide-border">
              {p.applications.applications.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-[13.5px]">
                  <span>
                    {a.role} <span className="text-subtle">at {a.company}</span>
                  </span>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function GoalDialog({ mentorshipId, open, onOpenChange }: { mentorshipId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('milestone');
  const [target, setTarget] = useState('');
  const [metric, setMetric] = useState('');
  const [metricTarget, setMetricTarget] = useState('');
  const m = useMutation({
    mutationFn: () =>
      api.post(`/mentorship/${mentorshipId}/goals`, {
        title,
        kind,
        targetDate: target ? new Date(`${target}T12:00:00`).toISOString() : null,
        metric: metric && metricTarget ? { type: metric, target: Number(metricTarget) } : null,
      }),
    onSuccess: () => {
      toast.success('Goal added. Your mentee was notified.');
      qc.invalidateQueries({ queryKey: ['mentorship', mentorshipId] });
      onOpenChange(false);
      setTitle('');
    },
  });
  const fields = m.error instanceof ApiError ? m.error.fields : {};
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add a goal"
      description="Goals appear in your mentee's Goals page, labelled as set by you."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={title.trim().length < 2} disabledReason="Add a title" onClick={() => m.mutate()}>
            Add goal
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {m.error && !Object.keys(fields).length && <Banner tone="danger">{errorMessage(m.error)}</Banner>}
        <Field label="Goal" error={fields.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: ship the catalogue API with tests" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="milestone">Milestone</option>
              <option value="weekly">Weekly</option>
              <option value="daily">Daily</option>
              <option value="career">Career</option>
            </Select>
          </Field>
          <Field label="Target date" optional>
            <Input type="date" value={target} onChange={(e) => setTarget(e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Track progress by" optional helper="Measured automatically from completed work.">
            <Select value={metric} onChange={(e) => setMetric(e.target.value)}>
              <option value="">Not tracked</option>
              <option value="minutes">Study minutes</option>
              <option value="topics">Topics and problems</option>
              <option value="problems">Problems solved</option>
            </Select>
          </Field>
          {metric && (
            <Field label="Target" error={fields['metric.target']}>
              <Input type="number" min={1} value={metricTarget} onChange={(e) => setMetricTarget(e.target.value)} />
            </Field>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function AssignmentDialog({ mentorshipId, open, onOpenChange }: { mentorshipId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ kind: 'topic', title: '', link: '', note: '', dueAt: '' });
  const m = useMutation({
    mutationFn: () =>
      api.post(`/mentorship/${mentorshipId}/assignments`, {
        kind: form.kind,
        title: form.title,
        link: form.link || null,
        note: form.note || null,
        dueAt: form.dueAt ? fromLocalInput(`${form.dueAt}T18:00`) : null,
      }),
    onSuccess: () => {
      toast.success('Activity assigned');
      qc.invalidateQueries({ queryKey: ['mentorship', mentorshipId] });
      onOpenChange(false);
      setForm({ kind: 'topic', title: '', link: '', note: '', dueAt: '' });
    },
  });
  const fields = m.error instanceof ApiError ? m.error.fields : {};
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Assign an activity"
      description="Link a roadmap topic, CodeLab problem, project or resource."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={form.title.trim().length < 2} disabledReason="Add a title" onClick={() => m.mutate()}>
            Assign
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {m.error && !Object.keys(fields).length && <Banner tone="danger">{errorMessage(m.error)}</Banner>}
        <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
          <Field label="Type">
            <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="topic">Topic</option>
              <option value="problem">Problem</option>
              <option value="project">Project</option>
              <option value="resource">Resource</option>
              <option value="custom">Other</option>
            </Select>
          </Field>
          <Field label="Title" error={fields.title}>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
        </div>
        <Field label="Link" optional error={fields.link} helper="An in-app path such as /app/practice/two-sum, or an https:// URL.">
          <Input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} />
        </Field>
        <Field label="Note" optional>
          <Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </Field>
        <Field label="Due" optional>
          <Input type="date" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
        </Field>
      </div>
    </Dialog>
  );
}

function SessionNotesDialog({ mentorshipId, s, onClose }: { mentorshipId: string; s: Session; onClose: () => void }) {
  const qc = useQueryClient();
  const [shared, setShared] = useState(s.sharedNotes ?? '');
  const [priv, setPriv] = useState(s.mentorPrivateNotes ?? '');
  const [followUps, setFollowUps] = useState<FollowUp[]>(s.followUps);
  const [newItem, setNewItem] = useState('');
  const m = useMutation({
    mutationFn: () => api.patch(`/mentorship/${mentorshipId}/sessions/${s.id}`, { sharedNotes: shared || null, mentorPrivateNotes: priv || null, followUps }),
    onSuccess: () => {
      toast.success('Session notes saved');
      qc.invalidateQueries({ queryKey: ['mentorship', mentorshipId] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      size="lg"
      title="Session notes"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>
            Save notes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Shared notes" helper="Your mentee can read and edit these.">
          <Textarea rows={4} value={shared} onChange={(e) => setShared(e.target.value)} />
        </Field>
        <div className="rounded-lg border border-warning/40 bg-warning-soft p-3">
          <Field
            label={
              <span className="inline-flex items-center gap-1.5">
                <LockKeyIcon size={14} /> Private notes: only you can see this
              </span>
            }
            helper="Never shown to your mentee or anyone else."
          >
            <Textarea rows={3} value={priv} onChange={(e) => setPriv(e.target.value)} />
          </Field>
        </div>
        <div>
          <div className="mb-1.5 text-[13px] font-medium">Follow-ups</div>
          <ul className="space-y-1">
            {followUps.map((f) => (
              <li key={f.id} className="flex items-center gap-2 text-[13.5px]">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--accent)]"
                  checked={f.done}
                  onChange={(e) => setFollowUps(followUps.map((x) => (x.id === f.id ? { ...x, done: e.target.checked } : x)))}
                  aria-label={`Done: ${f.text}`}
                />
                <span className="flex-1">{f.text}</span>
                <button
                  type="button"
                  className="rounded p-1 text-subtle hover:bg-surface-2 hover:text-danger"
                  aria-label={`Remove ${f.text}`}
                  onClick={() => setFollowUps(followUps.filter((x) => x.id !== f.id))}
                >
                  <TrashIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newItem.trim()) return;
              setFollowUps([...followUps, { id: crypto.randomUUID().slice(0, 12), text: newItem.trim(), done: false }]);
              setNewItem('');
            }}
          >
            <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add a follow-up" aria-label="New follow-up" />
            <Button type="submit" icon={<PlusIcon size={14} />} disabled={!newItem.trim()} disabledReason="Type a follow-up first">
              Add
            </Button>
          </form>
        </div>
      </div>
    </Dialog>
  );
}

function SessionsManager({ d }: { d: MentorshipDetail }) {
  const qc = useQueryClient();
  const id = d.mentorship.id;
  const active = d.mentorship.status === 'active';
  const [editing, setEditing] = useState<Session | null>(null);
  const patch = useMutation({
    mutationFn: ({ sid, body }: { sid: string; body: Record<string, unknown> }) => api.patch(`/mentorship/${id}/sessions/${sid}`, body),
    onSuccess: (_r, v) => {
      if (v.body.status === 'completed') toast.success('Session completed. XP recorded for you both.');
      else if (v.body.status) toast.success(`Session ${v.body.status}`);
      qc.invalidateQueries({ queryKey: ['mentorship', id] });
      qc.invalidateQueries({ queryKey: ['mentor-workspace'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card>
      <CardHeader title="Sessions" action={<ScheduleButton mentorshipId={id} role="mentor" jitsiNote={d.jitsiNote} disabled={!active} />} />
      {!d.sessions.length && (
        <CardBody>
          <p className="text-[13px] text-muted">No sessions yet.</p>
        </CardBody>
      )}
      {/* SessionCard draws its own box; inside this card the rows use dividers instead. */}
      <ul className="divide-y divide-border border-t border-border empty:hidden">
        {d.sessions.map((s) => (
          <li key={s.id} className="px-5 py-4 [&>div]:rounded-none [&>div]:border-0 [&>div]:p-0">
            <SessionCard s={s}>
              {s.mentorPrivateNotes && (
                <div className="mt-2 rounded-md bg-warning-soft px-3 py-2 text-[13px]">
                  <div className="mb-0.5 flex items-center gap-1 text-[11.5px] font-medium uppercase tracking-wide text-warning">
                    <LockKeyIcon size={12} /> Only you can see this
                  </div>
                  <p className="whitespace-pre-wrap">{s.mentorPrivateNotes}</p>
                </div>
              )}
              <FollowUpChecklist
                items={s.followUps}
                disabled={!active || patch.isPending}
                onToggle={(fid, done) => patch.mutate({ sid: s.id, body: { followUps: s.followUps.map((f) => (f.id === fid ? { ...f, done } : f)) } })}
              />
              {active && (
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                    Notes and follow-ups
                  </Button>
                  {s.status === 'requested' && (
                    <Button size="sm" onClick={() => patch.mutate({ sid: s.id, body: { status: 'scheduled' } })}>
                      Confirm
                    </Button>
                  )}
                  {(s.status === 'scheduled' || s.status === 'requested') && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => patch.mutate({ sid: s.id, body: { status: 'cancelled' } })}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        icon={<CheckIcon size={14} />}
                        disabled={new Date(s.scheduledAt).getTime() > Date.now() + 15 * 60_000}
                        disabledReason="You can complete a session once it has started"
                        onClick={() => patch.mutate({ sid: s.id, body: { status: 'completed' } })}
                      >
                        Mark completed
                      </Button>
                    </>
                  )}
                </div>
              )}
            </SessionCard>
          </li>
        ))}
      </ul>
      {editing && <SessionNotesDialog mentorshipId={id} s={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function PrivateNotes({ d }: { d: MentorshipDetail }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const notes = d.notes.filter((n) => n.visibility === 'mentor_private');
  const add = useMutation({
    mutationFn: () => api.post(`/mentorship/${d.mentorship.id}/notes`, { body: text, visibility: 'mentor_private' }),
    onSuccess: () => (setText(''), qc.invalidateQueries({ queryKey: ['mentorship', d.mentorship.id] })),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: (nid: string) => api.del(`/mentorship/${d.mentorship.id}/notes/${nid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mentorship', d.mentorship.id] }),
  });
  return (
    <Card className="border-warning/40">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            <LockKeyIcon size={16} className="text-warning" /> Private notes
          </span>
        }
        description="Only you can see this. Never shared with your mentee."
      />
      <CardBody className="space-y-2">
        {notes.map((n) => (
          <div key={n.id} className="flex items-start justify-between gap-2 rounded-md bg-warning-soft px-3 py-2 text-[13.5px]">
            <div>
              <p className="whitespace-pre-wrap">{n.body}</p>
              <div className="text-[11.5px] text-subtle">{timeAgo(n.createdAt)}</div>
            </div>
            <Menu items={[{ label: 'Delete note', danger: true, onSelect: () => del.mutate(n.id) }]} />
          </div>
        ))}
        <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Observations, ideas for next time" aria-label="New private note" />
        <div className="flex justify-end">
          <Button size="sm" loading={add.isPending} disabled={!text.trim()} disabledReason="Write a note first" onClick={() => add.mutate()}>
            Save private note
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function SkillAssessmentDialog({ mentorshipId, open, onOpenChange }: { mentorshipId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const skills = useQuery({ queryKey: ['skills-catalog'], queryFn: () => api.get<{ skills: { slug: string; name: string; category: string }[] }>('/learning/skills'), enabled: open });
  const [slug, setSlug] = useState('');
  const [level, setLevel] = useState('2');
  const [note, setNote] = useState('');
  const m = useMutation({
    mutationFn: () => api.post(`/mentorship/${mentorshipId}/skill-assessment`, { skillSlug: slug, level: Number(level), note: note || undefined }),
    onSuccess: () => (toast.success('Assessment recorded on their Skill DNA (unverified)'), onOpenChange(false)),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record a skill assessment"
      description="Shown on your mentee's Skill DNA as a mentor assessment. It is an informed opinion, so it is never marked verified."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={!slug} disabledReason="Choose a skill" onClick={() => m.mutate()}>
            Record assessment
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Skill">
          <Select value={slug} onChange={(e) => setSlug(e.target.value)}>
            <option value="">Choose a skill</option>
            {skills.data?.skills.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name} ({s.category})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Level">
          <Select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="1">1 · Beginner</option>
            <option value="2">2 · Developing</option>
            <option value="3">3 · Proficient</option>
            <option value="4">4 · Advanced</option>
          </Select>
        </Field>
        <Field label="What you based this on" optional>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

export default function MenteeDetailPage() {
  const { mentorshipId = '' } = useParams();
  const qc = useQueryClient();
  const q = useMentorship(mentorshipId);
  const [tab, setTab] = useState('plan');
  const [goalOpen, setGoalOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [skillOpen, setSkillOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const goalPatch = useMutation({
    mutationFn: ({ gid, body }: { gid: string; body: Record<string, unknown> }) =>
      body.delete ? api.del(`/mentorship/${mentorshipId}/goals/${gid}`) : api.patch(`/mentorship/${mentorshipId}/goals/${gid}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mentorship', mentorshipId] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const delAssignment = useMutation({
    mutationFn: (aid: string) => api.del(`/mentorship/${mentorshipId}/assignments/${aid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mentorship', mentorshipId] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const end = useMutation({
    mutationFn: () => api.post(`/mentorship/${mentorshipId}/end`, {}),
    onSuccess: () => {
      toast.success('Mentorship ended');
      setEnding(false);
      qc.invalidateQueries({ queryKey: ['mentorship', mentorshipId] });
      qc.invalidateQueries({ queryKey: ['mentor-workspace'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-64" />
      </div>
    );
  const d = q.data;
  if (d.role !== 'mentor') return <ErrorState error={new ApiError(403, 'forbidden', 'This page is for the mentor. Open your mentorship from Mentors instead.')} />;
  const active = d.mentorship.status === 'active';
  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/mentor/mentees" className="hover:underline">
            Mentees
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <Avatar name={d.mentee.name} color={d.mentee.avatarColor} size={36} />
            {d.mentee.name}
          </span>
        }
        badge={
          <>
            <StatusBadge status={d.mentorship.status} />
            <SampleTag show={d.mentee.isSample} />
          </>
        }
        description={d.mentee.headline ?? undefined}
        actions={
          active && (
            <>
              <Button icon={<SealCheckIcon size={16} />} onClick={() => setSkillOpen(true)}>
                Assess a skill
              </Button>
              <Button variant="ghost" onClick={() => setEnding(true)}>
                End mentorship
              </Button>
            </>
          )
        }
      />
      <div className="mb-6 space-y-3">
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-5 py-4 shadow-1 md:flex-row md:items-center md:justify-between">
          <p className="min-w-0 text-[13.5px]">
            <span className="font-medium">Their goals: </span>
            <span className="text-muted">{d.mentorship.goalsSummary || 'Not shared yet.'}</span>
          </p>
          <div className="shrink-0">
            <SharingBadges sharing={d.mentorship.sharing} />
          </div>
        </div>
        {!active && <Banner tone="info">This mentorship has {d.mentorship.status === 'requested' ? 'not started yet' : 'ended'}. Progress access is closed.</Banner>}
      </div>
      <Tabs
        value={tab}
        onValueChange={setTab}
        className="mb-6"
        tabs={[
          { value: 'plan', label: 'Plan and sessions' },
          { value: 'progress', label: 'Progress review' },
          { value: 'notes', label: 'Notes and messages' },
          { value: 'feedback', label: 'Feedback', count: d.feedback.length },
        ]}
      />
      {tab === 'progress' && (active ? <ProgressReview mentorshipId={mentorshipId} /> : <Banner tone="info">Progress review is available only during an active mentorship.</Banner>)}
      {tab === 'plan' && (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-2">
          <div className="min-w-0 space-y-5">
            <Card>
              <CardHeader
                title="Goals"
                description="Stored in your mentee's Goals, labelled as set by you."
                action={
                  <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => setGoalOpen(true)} disabled={!active} disabledReason="The mentorship is not active">
                    Add goal
                  </Button>
                }
              />
              <CardBody>
                <GoalList
                  goals={d.goals}
                  empty={<p className="text-[13px] text-muted">No goals yet. Agree on one or two in your first session.</p>}
                  actions={(g) =>
                    active ? (
                      <Menu
                        items={[
                          ...(g.status === 'active'
                            ? [
                                { label: 'Mark done', onSelect: () => goalPatch.mutate({ gid: g.id, body: { status: 'done' } }) },
                                { label: 'Drop goal', onSelect: () => goalPatch.mutate({ gid: g.id, body: { status: 'dropped' } }) },
                              ]
                            : [{ label: 'Reopen', onSelect: () => goalPatch.mutate({ gid: g.id, body: { status: 'active' } }) }]),
                          'separator' as const,
                          { label: 'Delete goal', danger: true, onSelect: () => goalPatch.mutate({ gid: g.id, body: { delete: true } }) },
                        ]}
                      />
                    ) : null
                  }
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title="Assigned activities"
                action={
                  <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => setAssignOpen(true)} disabled={!active} disabledReason="The mentorship is not active">
                    Assign
                  </Button>
                }
              />
              <CardBody>
                <AssignmentList
                  items={d.assignments}
                  renderActions={(a) =>
                    active ? (
                      <button type="button" className="rounded p-1 text-subtle hover:bg-surface-2 hover:text-danger" aria-label={`Remove ${a.title}`} onClick={() => delAssignment.mutate(a.id)}>
                        <TrashIcon size={15} />
                      </button>
                    ) : null
                  }
                />
              </CardBody>
            </Card>
          </div>
          <SessionsManager d={d} />
        </div>
      )}
      {tab === 'notes' && (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-2">
          <div className="min-w-0 space-y-5">
            <PrivateNotes d={d} />
            <Card>
              <CardHeader title="Shared notes" description="Visible to you and your mentee." />
              <CardBody>
                <SharedNotes mentorshipId={mentorshipId} notes={d.notes} myId={d.mentor.id} canWrite={active} />
              </CardBody>
            </Card>
          </div>
          <MessagesPanel mentorshipId={mentorshipId} active={active} otherName={d.mentee.name} />
        </div>
      )}
      {tab === 'feedback' && (
        <Card>
          <CardHeader title="Feedback" description={`Started ${formatDate(d.mentorship.startedAt ?? d.mentorship.createdAt)}`} />
          <CardBody className="space-y-4">
            <FeedbackList items={d.feedback} mentorId={d.mentor.id} />
            {(active || d.mentorship.status === 'ended') && <FeedbackForm mentorshipId={mentorshipId} role="mentor" />}
          </CardBody>
        </Card>
      )}
      {goalOpen && <GoalDialog mentorshipId={mentorshipId} open={goalOpen} onOpenChange={setGoalOpen} />}
      {assignOpen && <AssignmentDialog mentorshipId={mentorshipId} open={assignOpen} onOpenChange={setAssignOpen} />}
      {skillOpen && <SkillAssessmentDialog mentorshipId={mentorshipId} open={skillOpen} onOpenChange={setSkillOpen} />}
      <ConfirmDialog
        open={ending}
        onOpenChange={setEnding}
        title="End this mentorship?"
        description="You will lose access to their shared progress immediately and upcoming sessions are cancelled. Past notes and messages stay readable."
        confirmLabel="End mentorship"
        danger
        loading={end.isPending}
        onConfirm={() => end.mutate()}
      />
    </div>
  );
}
