import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ExamIcon, ClockIcon, SparkleIcon, ListChecksIcon, ArrowRightIcon, CompassIcon, ClockCounterClockwiseIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { PageHeader, Section, Tabs, Badge, StatusBadge, ErrorState, Skeleton, EmptyState, Button, ButtonLink, Dialog, Field, Select, Input, Pagination, SkeletonRows } from '@/components/ui';
import { MODE_LABEL, type AssessmentMode } from '@/components/assessments/types';

export type AvailableItem = {
  id: string;
  title: string;
  description: string | null;
  mode: AssessmentMode;
  orgName: string | null;
  source: 'library' | 'personal' | 'invited' | 'cohort';
  itemCount: number;
  timeLimitMinutes: number | null;
  maxAttempts: number | null;
  attemptsUsed: number;
  closesAt: string | null;
  open: boolean;
  inProgressAttemptId: string | null;
  lastAttempt: { id: string; status: string } | null;
  best: { attemptId: string; percent: number } | null;
};

type MyAttempt = { id: string; assessmentId: string; title: string; mode: AssessmentMode; attemptNo: number; status: string; startedAt: string; submittedAt: string | null; percent: number | null };

export function attemptLink(a: { id: string; status: string }) {
  return a.status === 'in_progress' ? `/app/assessments/attempts/${a.id}` : `/app/assessments/attempts/${a.id}/result`;
}

const MODE_ICON: Partial<Record<AssessmentMode, typeof ExamIcon>> = { diagnostic: CompassIcon, practice: ListChecksIcon };

function AssessmentRow({ a }: { a: AvailableItem }) {
  const Icon = MODE_ICON[a.mode] ?? ExamIcon;
  return (
    <li className="group relative flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', a.mode === 'diagnostic' ? 'bg-info-soft text-info' : a.mode === 'practice' ? 'bg-surface-2 text-muted ring-1 ring-inset ring-border' : 'bg-accent-soft text-accent-text')}>
          <Icon size={18} weight="duotone" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h3 className="text-[14.5px] font-semibold tracking-[-0.005em]">
              <Link to={`/app/assessments/${a.id}`} className="after:absolute after:inset-0 hover:text-accent-text">
                {a.title}
              </Link>
            </h3>
            <Badge tone={a.mode === 'diagnostic' ? 'info' : a.mode === 'practice' ? 'neutral' : 'accent'}>{MODE_LABEL[a.mode]}</Badge>
            {a.source === 'invited' && <Badge tone="warning">Invited</Badge>}
            {a.source === 'personal' && <Badge>Your practice</Badge>}
          </div>
          {a.description && <p className="mt-1 line-clamp-1 text-[13px] text-muted">{a.description}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-subtle">
            {a.orgName && <span className="font-medium text-muted">{a.orgName}</span>}
            <span>{a.itemCount} questions</span>
            <span className="inline-flex items-center gap-1">
              <ClockIcon size={13} aria-hidden /> {a.timeLimitMinutes ? `${a.timeLimitMinutes} min` : 'Untimed'}
            </span>
            {a.maxAttempts && (
              <span>
                {a.attemptsUsed}/{a.maxAttempts} attempts used
              </span>
            )}
            {a.closesAt && <span>Closes {timeAgo(a.closesAt)}</span>}
          </div>
        </div>
      </div>
      <div className="relative z-10 flex shrink-0 items-center justify-between gap-3 pl-[52px] sm:justify-end sm:pl-0">
        {a.best ? <span className="text-[13px] font-medium tabular-nums">Best: {a.best.percent}%</span> : a.lastAttempt ? <StatusBadge status={a.lastAttempt.status} /> : null}
        {a.inProgressAttemptId ? (
          <ButtonLink to={`/app/assessments/attempts/${a.inProgressAttemptId}`} variant="primary" size="sm">
            Resume
          </ButtonLink>
        ) : (
          <ButtonLink to={`/app/assessments/${a.id}`} size="sm" icon={<ArrowRightIcon size={14} />}>
            {a.attemptsUsed ? 'View' : 'Open'}
          </ButtonLink>
        )}
      </div>
    </li>
  );
}

function PracticeGenerator({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const [by, setBy] = useState<'topic' | 'skill'>('topic');
  const [topic, setTopic] = useState('');
  const [skillSlug, setSkillSlug] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [count, setCount] = useState('10');
  const [minutes, setMinutes] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const opts = useQuery({ queryKey: ['assessments', 'practice-options'], queryFn: () => api.get<{ topics: { topic: string; count: number }[]; skills: { slug: string; name: string; count: number }[] }>('/assessments/practice/options'), enabled: open });
  const gen = useMutation({
    mutationFn: () =>
      api.post<{ assessment: { id: string; itemCount: number; requested: number } }>('/assessments/practice/generate', {
        topic: by === 'topic' && topic ? topic : undefined,
        skillSlug: by === 'skill' && skillSlug ? skillSlug : undefined,
        difficulty: difficulty || undefined,
        count: Number(count) || 10,
        timeLimitMinutes: minutes ? Number(minutes) : null,
      }),
    onSuccess: (r) => {
      if (r.assessment.itemCount < r.assessment.requested) toast.info(`Only ${r.assessment.itemCount} questions matched, so your quiz is shorter.`);
      else toast.success('Practice quiz ready.');
      onOpenChange(false);
      navigate(`/app/assessments/${r.assessment.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError) setFields(e.fields);
      toast.error(errorMessage(e));
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Generate a practice quiz"
      description="Questions are drawn from the public library. Only you can see this quiz, and answers are shown after each attempt."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={gen.isPending} onClick={() => gen.mutate()}>
            Generate quiz
          </Button>
        </>
      }
    >
      {opts.error ? (
        <ErrorState error={opts.error} onRetry={() => opts.refetch()} />
      ) : !opts.data ? (
        <SkeletonRows rows={3} />
      ) : (
        <div className="space-y-3">
          <Field label="Focus on">
            <Select value={by} onChange={(e) => setBy(e.target.value as 'topic' | 'skill')}>
              <option value="topic">A topic</option>
              <option value="skill">A skill</option>
            </Select>
          </Field>
          {by === 'topic' ? (
            <Field label="Topic" helper="Leave as Any topic for a mixed quiz." error={fields.topic}>
              <Select value={topic} onChange={(e) => setTopic(e.target.value)}>
                <option value="">Any topic</option>
                {opts.data.topics.map((t) => (
                  <option key={t.topic} value={t.topic}>
                    {t.topic.replace(/-/g, ' ')} ({t.count})
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Skill" error={fields.skillSlug}>
              <Select value={skillSlug} onChange={(e) => setSkillSlug(e.target.value)}>
                <option value="">Any skill</option>
                {opts.data.skills.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name} ({s.count})
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Difficulty">
              <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="">Any</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </Select>
            </Field>
            <Field label="Questions" error={fields.count}>
              <Input type="number" min={3} max={30} value={count} onChange={(e) => setCount(e.target.value)} />
            </Field>
            <Field label="Time limit (min)" optional error={fields.timeLimitMinutes}>
              <Input type="number" min={1} max={180} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </Field>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function MyAttempts() {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['assessments', 'my-attempts', page], queryFn: () => api.get<{ items: MyAttempt[]; total: number; page: number; pageSize: number }>(`/assessments/my/attempts?page=${page}`) });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <SkeletonRows rows={4} />;
  if (!q.data.items.length)
    return <EmptyState icon={<ClockCounterClockwiseIcon size={22} />} title="No attempts yet" description="When you take an assessment, it shows up here with its status and score." />;
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-1">
        <table className="w-full text-left text-[13.5px]">
          <thead className="border-b border-border bg-surface-2 text-[12.5px] text-muted">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Assessment</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Score</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Submitted</th>
              <th scope="col" className="px-4 py-2.5"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {q.data.items.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{a.title}</div>
                  <div className="text-[12px] text-subtle">
                    {MODE_LABEL[a.mode]} · Attempt {a.attemptNo}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={a.status} />
                </td>
                <td className="px-4 py-3 tabular-nums">{a.percent !== null ? `${a.percent}%` : <span className="text-subtle">Not scored</span>}</td>
                <td className="px-4 py-3 text-muted">{a.submittedAt ? formatDateTime(a.submittedAt) : <span className="text-subtle">Not submitted</span>}</td>
                <td className="px-4 py-3 text-right">
                  <Link to={attemptLink(a)} className="text-[13px] font-medium text-accent-text hover:underline">
                    {a.status === 'in_progress' ? 'Resume' : a.status === 'released' ? 'View result' : 'View status'}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
    </div>
  );
}

const TABS = ['all', 'assigned', 'diagnostic', 'practice', 'history'] as const;

export default function HubPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') ?? params.get('mode') ?? 'all';
  const tab = (TABS as readonly string[]).includes(raw) ? raw : 'all';
  const [genOpen, setGenOpen] = useState(false);
  const q = useQuery({ queryKey: ['assessments', 'available'], queryFn: () => api.get<{ items: AvailableItem[] }>('/assessments/available') });
  const items = q.data?.items ?? [];
  const assigned = items.filter((i) => i.source === 'invited' || i.source === 'cohort');
  const diagnostics = items.filter((i) => i.mode === 'diagnostic' && i.source === 'library');
  const practice = items.filter((i) => i.mode === 'practice' && (i.source === 'library' || i.source === 'personal'));

  const section = (title: string, list: AvailableItem[], empty: { title: string; description: string; icon: ReactNode; action?: ReactNode }) => (
    <Section title={title}>
      {list.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
          {list.map((a) => (
            <AssessmentRow key={a.id} a={a} />
          ))}
        </ul>
      ) : (
        <EmptyState icon={empty.icon} title={empty.title} description={empty.description} action={empty.action} />
      )}
    </Section>
  );

  return (
    <div>
      <PageHeader
        title="Assessments"
        description="Diagnostics show what you already know so your roadmap can skip it. Practice quizzes build confidence. Exams and screens from your college or employers appear here when you are invited."
        actions={
          <Button variant="primary" icon={<SparkleIcon size={16} />} onClick={() => setGenOpen(true)}>
            Generate practice quiz
          </Button>
        }
      />
      <Tabs
        className="mb-6"
        value={tab}
        onValueChange={(v) => setParams(v === 'all' ? {} : { tab: v }, { replace: true })}
        tabs={[
          { value: 'all', label: 'All' },
          { value: 'assigned', label: 'Assigned to me', count: q.data ? assigned.length : undefined },
          { value: 'diagnostic', label: 'Diagnostics', count: q.data ? diagnostics.length : undefined },
          { value: 'practice', label: 'Practice', count: q.data ? practice.length : undefined },
          { value: 'history', label: 'My attempts' },
        ]}
      />
      {tab === 'history' ? (
        <MyAttempts />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px]" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {(tab === 'all' || tab === 'assigned') &&
            section('Assigned to me', assigned, { icon: <ExamIcon size={22} />, title: 'Nothing assigned right now', description: 'Exams from your cohorts and screening tests from employers appear here when you are invited.' })}
          {(tab === 'all' || tab === 'diagnostic') &&
            section('Diagnostics', diagnostics, { icon: <CompassIcon size={22} />, title: 'No diagnostics available', description: 'Diagnostics are part of the public library. Check back after the library is set up.' })}
          {(tab === 'all' || tab === 'practice') &&
            section('Practice', practice, {
              icon: <ListChecksIcon size={22} />,
              title: 'No practice quizzes yet',
              description: 'Generate a quiz on any topic from the public question bank.',
              action: (
                <Button variant="primary" onClick={() => setGenOpen(true)}>
                  Generate practice quiz
                </Button>
              ),
            })}
        </div>
      )}
      <PracticeGenerator open={genOpen} onOpenChange={setGenOpen} />
    </div>
  );
}
