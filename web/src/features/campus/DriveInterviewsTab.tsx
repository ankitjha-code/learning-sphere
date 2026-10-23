import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlusIcon, CalendarIcon, PlusIcon, TrashIcon, VideoCameraIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { formatDateTime, fromLocalInput, toLocalInput } from '@/lib/format';
import { Badge, Banner, Button, ConfirmDialog, CopyButton, Dialog, EmptyState, ErrorState, Field, Input, Menu, Segmented, Select, SkeletonRows, StatusBadge, Textarea } from '@/components/ui';
import { CAMPUS_KEY, listGroup } from './shared';
import { useCandidates } from './DriveCandidatesTab';
import type { DriveDetail } from './DriveDetailPage';
import type { Interview } from './types';

const KINDS = [
  { value: 'technical', label: 'Technical' },
  { value: 'behavioral', label: 'Behavioral' },
  { value: 'system_design', label: 'System design' },
  { value: 'hr', label: 'HR' },
  { value: 'panel', label: 'Panel' },
];
const OUTCOMES: Record<string, string> = { advance: 'Advance', hold: 'On hold', not_selected: 'Not selected' };

function ScheduleDialog({ d, initial, onClose, jitsiNote }: { d: DriveDetail; initial?: Interview; onClose: () => void; jitsiNote: string }) {
  const qc = useQueryClient();
  const cands = useCandidates(d.drive.id);
  const eligible = cands.data?.items.filter((c) => ['registered', 'assessment', 'interview', 'offer'].includes(c.stage)) ?? [];
  const [candidateId, setCandidateId] = useState(initial?.candidate.id ?? '');
  const [kind, setKind] = useState(initial?.kind ?? 'technical');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [when, setWhen] = useState(toLocalInput(initial?.scheduledAt ?? null));
  const [duration, setDuration] = useState(String(initial?.durationMinutes ?? 45));
  const [provider, setProvider] = useState<'jitsi' | 'custom' | 'keep'>(initial ? 'keep' : 'jitsi');
  const [url, setUrl] = useState('');
  const [interviewers, setInterviewers] = useState<{ name: string; email: string }[]>(initial?.interviewers.map((i) => ({ name: i.name, email: i.email ?? '' })) ?? [{ name: '', email: '' }]);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const people = interviewers.filter((i) => i.name.trim()).map((i) => ({ name: i.name.trim(), email: i.email.trim() || null }));
  const meeting = provider === 'jitsi' ? { provider: 'jitsi' } : provider === 'custom' ? { provider: 'custom', url } : undefined;
  const m = useMutation({
    mutationFn: () =>
      initial
        ? api.patch(`/campus/interviews/${initial.id}`, { scheduledAt: fromLocalInput(when), durationMinutes: Number(duration), interviewers: people, notes: notes || null, ...(meeting ? { meeting } : {}) })
        : api.post(`/campus/drives/${d.drive.id}/interviews`, { candidateId, kind, title: title.trim() || undefined, scheduledAt: fromLocalInput(when), durationMinutes: Number(duration), meeting, interviewers: people, notes: notes || undefined }),
    onSuccess: () => {
      toast.success(initial ? 'Interview updated. The student was notified.' : 'Interview scheduled. The student was notified.');
      qc.invalidateQueries({ queryKey: CAMPUS_KEY });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const f = m.error instanceof ApiError ? m.error.fields : {};
  const missing = !initial && !candidateId ? 'Choose a candidate' : !when ? 'Choose a date and time' : provider === 'custom' && !/^https?:\/\//i.test(url) ? 'Enter a meeting link starting with https://' : undefined;
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      size="lg"
      title={initial ? 'Reschedule interview' : 'Schedule an interview'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={!!missing} disabledReason={missing} onClick={() => m.mutate()}>
            {initial ? 'Save changes' : 'Schedule'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!initial && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Candidate" error={f.candidateId} helper={cands.data && !eligible.length ? 'Candidates must register before they can be scheduled.' : undefined}>
              <Select value={candidateId} onChange={(e) => setCandidateId(e.target.value)}>
                <option value="">Choose a candidate</option>
                {eligible.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.student.name} ({c.stage})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Kind">
              <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Title" optional className="sm:col-span-2">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${d.drive.companyName} ${kind.replace('_', ' ')} interview`} />
            </Field>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date and time" error={f.scheduledAt} helper="Shown to the student in their own time zone.">
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Field label="Duration (minutes)" error={f.durationMinutes}>
            <Input type="number" min={10} max={480} value={duration} onChange={(e) => setDuration(e.target.value)} />
          </Field>
        </div>
        <div className="space-y-2">
          <Segmented
            label="Meeting link"
            value={provider}
            onChange={(v) => setProvider(v)}
            options={[...(initial ? [{ value: 'keep' as const, label: 'Keep current link' }] : []), { value: 'jitsi' as const, label: 'Generate Jitsi link' }, { value: 'custom' as const, label: 'Use my own link' }]}
          />
          {provider === 'jitsi' && <p className="text-[12.5px] text-muted">{jitsiNote}</p>}
          {provider === 'custom' && (
            <Field label="Meeting URL" error={f['meeting.url']}>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
            </Field>
          )}
        </div>
        <div>
          <div className="mb-1.5 text-[13px] font-medium">Interviewers</div>
          <p className="mb-2 text-[12px] text-subtle">Company interviewers do not need an account. Names are shown to the student; emails are for your records.</p>
          <ul className="space-y-2">
            {interviewers.map((p, i) => (
              <li key={i} className="flex gap-2">
                <Input value={p.name} onChange={(e) => setInterviewers(interviewers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Name" aria-label={`Interviewer ${i + 1} name`} />
                <Input value={p.email} onChange={(e) => setInterviewers(interviewers.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} placeholder="Email (optional)" aria-label={`Interviewer ${i + 1} email`} />
                <Button size="icon" variant="ghost" aria-label="Remove interviewer" onClick={() => setInterviewers(interviewers.filter((_, j) => j !== i))}>
                  <TrashIcon size={14} />
                </Button>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="ghost" icon={<PlusIcon size={13} />} className="mt-1" disabled={interviewers.length >= 10} disabledReason="Up to 10 interviewers" onClick={() => setInterviewers([...interviewers, { name: '', email: '' }])}>
            Add interviewer
          </Button>
        </div>
        <Field label="Notes for interviewers" optional>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function OutcomeDialog({ iv, onClose }: { iv: Interview; onClose: () => void }) {
  const qc = useQueryClient();
  const [outcome, setOutcome] = useState(iv.outcome ?? 'advance');
  const [note, setNote] = useState(iv.outcomeNote ?? '');
  const m = useMutation({
    mutationFn: () => api.patch(`/campus/interviews/${iv.id}`, { status: 'completed', outcome, outcomeNote: note || null }),
    onSuccess: () => {
      toast.success('Interview outcome recorded. Update the candidate stage from Outcomes when you are ready.');
      qc.invalidateQueries({ queryKey: CAMPUS_KEY });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Outcome: ${iv.candidate.name}`}
      description="Records the interview result. It does not change the candidate's stage by itself."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>
            Save outcome
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Result">
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            {Object.entries(OUTCOMES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Feedback summary" optional helper="Internal. Not shown to the student.">
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

export function InterviewsTab({ d }: { d: DriveDetail }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [...CAMPUS_KEY, 'drive', d.drive.id, 'interviews'], queryFn: () => api.get<{ items: Interview[]; jitsiNote: string }>(`/campus/drives/${d.drive.id}/interviews`) });
  const [scheduling, setScheduling] = useState<Interview | 'new' | null>(null);
  const [outcome, setOutcome] = useState<Interview | null>(null);
  const [cancelling, setCancelling] = useState<Interview | null>(null);
  const status = useMutation({
    mutationFn: (p: { id: string; status: string }) => api.patch(`/campus/interviews/${p.id}`, { status: p.status }),
    onSuccess: () => {
      toast.success('Interview updated');
      setCancelling(null);
      qc.invalidateQueries({ queryKey: CAMPUS_KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const closed = d.drive.status === 'completed' || d.drive.status === 'cancelled';
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p className="max-w-[72ch] text-[13.5px] text-muted">Campus-run interviews for this drive. Students see the time, link and interviewer names on their Placements page.</p>
        <Button variant="primary" icon={<CalendarPlusIcon size={15} />} disabled={closed} disabledReason="This drive is closed" onClick={() => setScheduling('new')}>
          Schedule interview
        </Button>
      </div>
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <SkeletonRows rows={3} />
      ) : !q.data.items.length ? (
        <EmptyState icon={<CalendarIcon size={22} />} title="No interviews scheduled" description="Schedule interviews for registered or shortlisted candidates. A Jitsi link can be generated for you." />
      ) : (
        <ul className={listGroup}>
          {q.data.items.map((iv) => (
            <li key={iv.id} className="px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold tracking-[-0.005em]">
                    {iv.candidate.name}
                    <StatusBadge status={iv.status} />
                    {iv.outcome && <Badge tone={iv.outcome === 'advance' ? 'success' : iv.outcome === 'hold' ? 'warning' : 'danger'}>{OUTCOMES[iv.outcome]}</Badge>}
                  </div>
                  <div className="mt-1 text-[12.5px] text-muted">
                    {iv.title} · {formatDateTime(iv.scheduledAt)} · {iv.durationMinutes} min
                  </div>
                  {iv.interviewers.length > 0 && <div className="text-[12.5px] text-subtle">With {iv.interviewers.map((p) => p.name).join(', ')}</div>}
                  {iv.meetingUrl && (
                    <div className="mt-1 flex items-center gap-1 text-[12.5px]">
                      <VideoCameraIcon size={13} className="text-subtle" aria-hidden />
                      <a href={iv.meetingUrl} target="_blank" rel="noreferrer" className="truncate text-accent-text hover:underline">
                        {iv.meetingUrl}
                      </a>
                      <CopyButton value={iv.meetingUrl} label="Copy link" />
                    </div>
                  )}
                  {iv.outcomeNote && <p className="mt-1 text-[12.5px] text-muted">{iv.outcomeNote}</p>}
                </div>
                {iv.status === 'scheduled' && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button size="sm" onClick={() => setOutcome(iv)}>
                      Record outcome
                    </Button>
                    <Menu
                      items={[
                        { label: 'Reschedule', onSelect: () => setScheduling(iv) },
                        { label: 'Mark no-show', onSelect: () => status.mutate({ id: iv.id, status: 'no_show' }) },
                        { label: 'Cancel interview', danger: true, onSelect: () => setCancelling(iv) },
                      ]}
                    />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {q.data && q.data.items.some((i) => i.meetingProvider === 'jitsi') && <Banner tone="info">{q.data.jitsiNote}</Banner>}
      {scheduling && <ScheduleDialog d={d} initial={scheduling === 'new' ? undefined : scheduling} onClose={() => setScheduling(null)} jitsiNote={q.data?.jitsiNote ?? ''} />}
      {outcome && <OutcomeDialog iv={outcome} onClose={() => setOutcome(null)} />}
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(v) => !v && setCancelling(null)}
        title="Cancel this interview?"
        description={`${cancelling?.candidate.name ?? 'The student'} is notified that the interview is cancelled. The candidate's stage does not change.`}
        confirmLabel="Cancel interview"
        danger
        loading={status.isPending}
        onConfirm={() => cancelling && status.mutate({ id: cancelling.id, status: 'cancelled' })}
      />
    </div>
  );
}
