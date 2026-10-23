import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import clsx from 'clsx';
import {
  VideoCameraIcon,
  CalendarPlusIcon,
  PaperPlaneRightIcon,
  ChatCircleDotsIcon,
  CheckCircleIcon,
  CircleIcon,
  ArrowSquareOutIcon,
  EyeSlashIcon,
  ListChecksIcon,
  InfoIcon,
} from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDateTime, timeAgo, toLocalInput, fromLocalInput } from '@/lib/format';
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  CardBody,
  CardHeader,
  CopyButton,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Progress,
  Segmented,
  Select,
  SkeletonRows,
  StatusBadge,
  Textarea,
  ProvenanceTag,
  Menu,
} from '@/components/ui';

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------- Types ----------

export type Person = { id: string; name: string; avatarColor: string | null; isSample: boolean; headline?: string | null };
export type Sharing = { skillDna: boolean; projects: boolean; assessments: boolean; applications: boolean };
export type FollowUp = { id: string; text: string; done: boolean };
export type Session = {
  id: string;
  mentorshipId: string;
  scheduledAt: string;
  durationMinutes: number;
  agenda: string | null;
  meetingUrl: string | null;
  status: 'requested' | 'scheduled' | 'completed' | 'cancelled';
  sharedNotes: string | null;
  mentorPrivateNotes?: string | null;
  followUps: FollowUp[];
};
export type Assignment = { id: string; kind: string; title: string; link: string | null; note: string | null; dueAt: string | null; status: 'assigned' | 'done' | 'skipped'; completedAt: string | null; createdAt: string };
export type Note = { id: string; authorId: string; visibility: 'shared' | 'mentor_private'; body: string; createdAt: string; updatedAt: string };
export type Feedback = { id: string; authorId: string; kind: 'progress_review' | 'mentee_rating'; body: string; rating: number | null; createdAt: string };
export type Goal = { id: string; title: string; kind: string; status: 'active' | 'done' | 'dropped'; targetDate: string | null; progress: { value: number; target: number } | null; metric: { type: string; target: number } | null };
export type MentorshipDetail = {
  mentorship: { id: string; status: 'requested' | 'active' | 'declined' | 'ended'; sharing: Sharing; requestMessage: string | null; goalsSummary: string | null; startedAt: string | null; endedAt: string | null; createdAt: string; mentorId: string; menteeId: string };
  role: 'mentor' | 'mentee';
  mentor: Person;
  mentee: Person;
  sessions: Session[];
  assignments: Assignment[];
  notes: Note[];
  feedback: Feedback[];
  goals: Goal[];
  unreadMessages: number;
  jitsiNote: string;
};

export const SHARING_LABELS: Record<keyof Sharing, { label: string; description: string }> = {
  skillDna: { label: 'Skill DNA', description: 'Skill levels, evidence counts and which skills are verified.' },
  projects: { label: 'Projects', description: 'Project titles, status, milestones and repository or demo links.' },
  assessments: { label: 'Assessment results', description: 'Released scores from practice, diagnostic and course assessments. Never employer screenings.' },
  applications: { label: 'Job applications', description: 'Company, role and status of applications you track. Notes and contacts stay private.' },
};

export function useMentorship(id: string) {
  return useQuery({ queryKey: ['mentorship', id], queryFn: () => api.get<MentorshipDetail>(`/mentorship/${id}`) });
}

export function SampleTag({ show }: { show?: boolean }) {
  return show ? <ProvenanceTag kind="sample" /> : null;
}

export function PersonLine({ person, sub }: { person: Person | null; sub?: ReactNode }) {
  if (!person) return <span className="text-muted">Unknown</span>;
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar name={person.name} color={person.avatarColor} size={32} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[14px] font-medium">
          <span className="truncate">{person.name}</span>
          <SampleTag show={person.isSample} />
        </span>
        {(sub ?? person.headline) && <span className="block truncate text-[12.5px] text-muted">{sub ?? person.headline}</span>}
      </span>
    </span>
  );
}

// ---------- Goals ----------

export function GoalList({ goals, empty, actions }: { goals: Goal[]; empty: ReactNode; actions?: (g: Goal) => ReactNode }) {
  if (!goals.length) return <>{empty}</>;
  return (
    <ul className="divide-y divide-border">
      {goals.map((g) => (
        <li key={g.id} className="py-3.5 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className={clsx('text-[14px] font-medium', g.status !== 'active' && 'text-muted line-through')}>{g.title}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-subtle">
                <Badge>{g.kind.charAt(0).toUpperCase() + g.kind.slice(1)}</Badge>
                {g.status !== 'active' && <StatusBadge status={g.status === 'done' ? 'completed' : 'withdrawn'} />}
                {g.targetDate && <span>Target {new Date(g.targetDate).toLocaleDateString()}</span>}
              </div>
            </div>
            {actions?.(g)}
          </div>
          {g.progress && (
            <div className="mt-2">
              <Progress value={g.progress.value} max={g.progress.target} tone={g.progress.value >= g.progress.target ? 'success' : 'accent'} label={`${g.title} progress`} />
              <div className="mt-1 text-[11.5px] tabular-nums text-subtle">
                {g.progress.value} / {g.progress.target} {g.metric?.type}
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

// ---------- Assignments ----------

export function AssignmentList({ items, onStatus, renderActions }: { items: Assignment[]; onStatus?: (a: Assignment, status: Assignment['status']) => void; renderActions?: (a: Assignment) => ReactNode }) {
  if (!items.length) return <p className="text-[13px] text-muted">No activities assigned yet.</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((a) => (
        <li key={a.id} className="flex items-start gap-3 py-2.5">
          {onStatus ? (
            <button
              type="button"
              className="mt-0.5 text-subtle hover:text-fg"
              aria-label={a.status === 'done' ? `Mark ${a.title} as not done` : `Mark ${a.title} as done`}
              onClick={() => onStatus(a, a.status === 'done' ? 'assigned' : 'done')}
            >
              {a.status === 'done' ? <CheckCircleIcon size={20} weight="fill" className="text-success" /> : <CircleIcon size={20} />}
            </button>
          ) : a.status === 'done' ? (
            <CheckCircleIcon size={20} weight="fill" className="mt-0.5 text-success" />
          ) : (
            <CircleIcon size={20} className="mt-0.5 text-subtle" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={clsx('text-[14px]', a.status !== 'assigned' && 'text-muted line-through')}>{a.title}</span>
              <Badge>{a.kind}</Badge>
              {a.status === 'skipped' && <Badge tone="neutral">Skipped</Badge>}
            </div>
            {a.note && <p className="mt-0.5 text-[12.5px] text-muted">{a.note}</p>}
            <div className="mt-0.5 flex flex-wrap gap-3 text-[12px] text-subtle">
              {a.dueAt && <span>Due {new Date(a.dueAt).toLocaleDateString()}</span>}
              {a.link &&
                (a.link.startsWith('/app/') ? (
                  <Link to={a.link} className="inline-flex items-center gap-1 text-accent-text hover:underline">
                    Open <ArrowSquareOutIcon size={12} />
                  </Link>
                ) : (
                  <a href={a.link} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-accent-text hover:underline">
                    Open link <ArrowSquareOutIcon size={12} />
                  </a>
                ))}
            </div>
          </div>
          {renderActions?.(a)}
        </li>
      ))}
    </ul>
  );
}

// ---------- Sessions ----------

/** `flat` renders the session as a divided row for use inside a card; the default bordered box is for standalone lists. */
export function SessionCard({ s, children, flat }: { s: Session; children?: ReactNode; flat?: boolean }) {
  return (
    <div className={flat ? 'py-4 first:pt-0 last:pb-0' : 'rounded-md border border-border p-3'}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[14px] font-medium">{formatDateTime(s.scheduledAt)}</div>
          <div className="text-[12.5px] text-muted">
            {s.durationMinutes} min{s.agenda ? ` · ${s.agenda}` : ''}
          </div>
        </div>
        <StatusBadge status={s.status} />
      </div>
      {s.meetingUrl && s.status !== 'cancelled' && s.status !== 'completed' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <a href={s.meetingUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-md bg-accent-soft px-2.5 py-1 text-[13px] font-medium text-accent-text hover:brightness-95">
            <VideoCameraIcon size={15} /> Join meeting
          </a>
          <CopyButton value={s.meetingUrl} label="Copy link" />
        </div>
      )}
      {s.sharedNotes && (
        <div className="mt-2 rounded-md bg-surface-2 px-3 py-2 text-[13px]">
          <div className="mb-0.5 text-[11.5px] font-medium uppercase tracking-wide text-subtle">Shared notes</div>
          <p className="whitespace-pre-wrap">{s.sharedNotes}</p>
        </div>
      )}
      {children}
    </div>
  );
}

export function FollowUpChecklist({ items, onToggle, disabled }: { items: FollowUp[]; onToggle: (id: string, done: boolean) => void; disabled?: boolean }) {
  if (!items.length) return null;
  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-wide text-subtle">
        <ListChecksIcon size={13} /> Follow-ups
      </div>
      <ul className="space-y-1">
        {items.map((f) => (
          <li key={f.id}>
            <label className="flex cursor-pointer items-center gap-2 text-[13px]">
              <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={f.done} disabled={disabled} onChange={(e) => onToggle(f.id, e.target.checked)} />
              <span className={clsx(f.done && 'text-muted line-through')}>{f.text}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ScheduleSessionDialog({ open, onOpenChange, mentorshipId, role, jitsiNote }: { open: boolean; onOpenChange: (v: boolean) => void; mentorshipId: string; role: 'mentor' | 'mentee'; jitsiNote: string }) {
  const qc = useQueryClient();
  const [at, setAt] = useState(() => toLocalInput(new Date(Date.now() + 2 * 86400_000).toISOString()));
  const [duration, setDuration] = useState('30');
  const [agenda, setAgenda] = useState('');
  const [meeting, setMeeting] = useState<'jitsi' | 'custom' | 'none'>('jitsi');
  const [url, setUrl] = useState('');
  const m = useMutation({
    mutationFn: () => api.post(`/mentorship/${mentorshipId}/sessions`, { scheduledAt: fromLocalInput(at), durationMinutes: Number(duration), agenda: agenda || null, meeting, meetingUrl: meeting === 'custom' ? url : null }),
    onSuccess: () => {
      toast.success(role === 'mentor' ? 'Session scheduled' : 'Session requested. Your mentor will confirm it.');
      qc.invalidateQueries({ queryKey: ['mentorship', mentorshipId] });
      qc.invalidateQueries({ queryKey: ['mentor-workspace'] });
      qc.invalidateQueries({ queryKey: ['mentor-sessions'] });
      onOpenChange(false);
    },
  });
  const fields = m.error instanceof ApiError ? m.error.fields : {};
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={role === 'mentor' ? 'Schedule a session' : 'Request a session'}
      description={role === 'mentor' ? 'Your mentee is notified right away.' : 'Your mentor confirms or suggests another time.'}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={!at} disabledReason="Pick a date and time" onClick={() => m.mutate()}>
            {role === 'mentor' ? 'Schedule' : 'Send request'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {m.error && !Object.keys(fields).length && <Banner tone="danger">{errorMessage(m.error)}</Banner>}
        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <Field label="Date and time" error={fields.scheduledAt}>
            <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
          </Field>
          <Field label="Length">
            <Select value={duration} onChange={(e) => setDuration(e.target.value)}>
              {[15, 30, 45, 60, 90].map((d) => (
                <option key={d} value={d}>
                  {d} minutes
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Agenda" optional>
          <Textarea rows={2} value={agenda} onChange={(e) => setAgenda(e.target.value)} placeholder="What do you want to cover?" />
        </Field>
        <div className="space-y-2">
          <div className="text-[13px] font-medium">Meeting link</div>
          <Segmented
            label="Meeting link"
            value={meeting}
            onChange={setMeeting}
            options={[
              { value: 'jitsi', label: 'Jitsi (free)' },
              { value: 'custom', label: 'My own link' },
              { value: 'none', label: 'Decide later' },
            ]}
          />
          {meeting === 'jitsi' && (
            <p className="flex items-start gap-1.5 text-[12.5px] text-muted">
              <InfoIcon size={15} className="mt-0.5 shrink-0" />
              {jitsiNote}
            </p>
          )}
          {meeting === 'custom' && (
            <Field label="Link" error={fields.meetingUrl}>
              <Input type="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
            </Field>
          )}
        </div>
      </div>
    </Dialog>
  );
}

export function ScheduleButton(props: { mentorshipId: string; role: 'mentor' | 'mentee'; jitsiNote: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" icon={<CalendarPlusIcon size={15} />} onClick={() => setOpen(true)} disabled={props.disabled} disabledReason="The mentorship is not active">
        {props.role === 'mentor' ? 'Schedule' : 'Request session'}
      </Button>
      {open && <ScheduleSessionDialog open={open} onOpenChange={setOpen} {...props} />}
    </>
  );
}

// ---------- Messages ----------

type Msg = { id: string; senderId: string; body: string; createdAt: string; mine: boolean };

export function MessagesPanel({ mentorshipId, active, otherName }: { mentorshipId: string; active: boolean; otherName: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['mentorship-messages', mentorshipId], queryFn: () => api.get<{ items: Msg[] }>(`/mentorship/${mentorshipId}/messages`), refetchInterval: 20_000 });
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const send = useMutation({
    mutationFn: () => api.post<{ message: Msg }>(`/mentorship/${mentorshipId}/messages`, { body: text }),
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: ['mentorship-messages', mentorshipId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [q.data?.items.length]);
  return (
    <Card>
      <CardHeader title="Messages" description={`Only you and ${otherName} can read these.`} />
      <CardBody>
        {q.isLoading ? (
          <SkeletonRows rows={3} />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data!.items.length ? (
          <EmptyState className="border-0! bg-transparent! px-0! py-8!" icon={<ChatCircleDotsIcon size={22} />} title="No messages yet" description="Use messages for quick questions between sessions." />
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1" aria-live="polite">
            {q.data!.items.map((m) => (
              <div key={m.id} className={clsx('flex', m.mine ? 'justify-end' : 'justify-start')}>
                <div className={clsx('max-w-[80%] rounded-lg px-3 py-2 text-[13.5px]', m.mine ? 'bg-accent-soft text-fg' : 'bg-surface-2')}>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <div className="mt-0.5 text-right text-[11px] text-subtle">{timeAgo(m.createdAt)}</div>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
        {active ? (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) send.mutate();
            }}
          >
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message" aria-label="Message" maxLength={4000} />
            <Button type="submit" variant="primary" loading={send.isPending} disabled={!text.trim()} disabledReason="Write a message first" icon={<PaperPlaneRightIcon size={15} />}>
              Send
            </Button>
          </form>
        ) : (
          <p className="mt-3 text-[12.5px] text-subtle">This mentorship has ended. Messages are read-only.</p>
        )}
      </CardBody>
    </Card>
  );
}

// ---------- Feedback ----------

export function FeedbackList({ items, mentorId }: { items: Feedback[]; mentorId: string }) {
  if (!items.length) return <p className="text-[13px] text-muted">No feedback yet.</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((f) => (
        <li key={f.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-center justify-between gap-2 text-[12px] text-subtle">
            <span>{f.authorId === mentorId ? 'Progress review from mentor' : 'Feedback from mentee'}</span>
            <span>{timeAgo(f.createdAt)}</span>
          </div>
          {f.rating && <div className="mt-0.5 text-[12.5px] font-medium">{f.rating} / 5</div>}
          <p className="mt-0.5 whitespace-pre-wrap text-[13.5px]">{f.body}</p>
        </li>
      ))}
    </ul>
  );
}

export function FeedbackForm({ mentorshipId, role }: { mentorshipId: string; role: 'mentor' | 'mentee' }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const m = useMutation({
    mutationFn: () => api.post(`/mentorship/${mentorshipId}/feedback`, { body: text, rating }),
    onSuccess: () => {
      toast.success(role === 'mentor' ? 'Progress review shared' : 'Thanks for the feedback');
      setText('');
      setRating(null);
      qc.invalidateQueries({ queryKey: ['mentorship', mentorshipId] });
    },
  });
  const fields = m.error instanceof ApiError ? m.error.fields : {};
  return (
    <div className="space-y-2">
      <Field label={role === 'mentor' ? 'Progress review' : 'How is the mentorship going?'} error={fields.body} helper={role === 'mentor' ? 'Your mentee can read this.' : 'Your mentor can read this.'}>
        <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Rating" className="flex items-center gap-1">
          <span className="mr-1 text-[12.5px] text-muted">{role === 'mentee' ? 'Rating' : 'Rating (optional)'}</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              onClick={() => setRating(n)}
              className={clsx('h-7 w-7 rounded-md border text-[13px] tabular-nums', rating === n ? 'border-accent bg-accent-soft text-accent-text' : 'border-border text-muted hover:bg-surface-2')}
            >
              {n}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="primary"
          loading={m.isPending}
          disabled={text.trim().length < 5 || (role === 'mentee' && !rating)}
          disabledReason={role === 'mentee' && !rating ? 'Pick a rating' : 'Write a few words first'}
          onClick={() => m.mutate()}
        >
          Share feedback
        </Button>
      </div>
      {m.error && <p className="text-[12.5px] text-danger">{errorMessage(m.error)}</p>}
    </div>
  );
}

export function NotSharedNote({ what }: { what: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-4 text-[13px] text-muted">
      <EyeSlashIcon size={16} className="shrink-0 text-subtle" />
      Not shared. Your mentee has chosen not to share {what}.
    </div>
  );
}

// ---------- Shared notes ----------

export function SharedNotes({ mentorshipId, notes, myId, canWrite }: { mentorshipId: string; notes: { id: string; authorId: string; body: string; createdAt: string; visibility: string }[]; myId: string; canWrite: boolean }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const add = useMutation({
    mutationFn: () => api.post(`/mentorship/${mentorshipId}/notes`, { body: text, visibility: 'shared' }),
    onSuccess: () => {
      setText('');
      toast.success('Note added');
      qc.invalidateQueries({ queryKey: ['mentorship', mentorshipId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/mentorship/${mentorshipId}/notes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mentorship', mentorshipId] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const shared = notes.filter((n) => n.visibility === 'shared');
  return (
    <div className="space-y-3">
      {shared.length ? (
        <ul className="space-y-2">
          {shared.map((n) => (
            <li key={n.id} className="rounded-md bg-surface-2 px-3 py-2 text-[13.5px]">
              <div className="flex items-start justify-between gap-2">
                <p className="whitespace-pre-wrap">{n.body}</p>
                {n.authorId === myId && <Menu items={[{ label: 'Delete note', danger: true, onSelect: () => del.mutate(n.id) }]} />}
              </div>
              <div className="mt-0.5 text-[11.5px] text-subtle">{timeAgo(n.createdAt)}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">No shared notes yet. Both of you can add notes here.</p>
      )}
      {canWrite && (
        <div className="space-y-2">
          <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a shared note (both of you can see it)" aria-label="New shared note" />
          <div className="flex justify-end">
            <Button size="sm" loading={add.isPending} disabled={!text.trim()} disabledReason="Write a note first" onClick={() => add.mutate()}>
              Add note
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
