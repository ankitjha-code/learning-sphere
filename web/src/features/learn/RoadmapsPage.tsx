import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PathIcon, ClockIcon, MagnifyingGlassIcon, ArrowsClockwiseIcon, ArrowRightIcon, InfoIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { PageHeader, ErrorState, Skeleton, Input, Select, Badge, Progress, EmptyState, ButtonLink, Button, Section } from '@/components/ui';
import { CATEGORY_LABEL } from '@/features/skills/SkillDnaPage';

export type TrackSummary = {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary: string;
  level: string;
  estimatedHours: number | null;
  contentStatus: 'complete' | 'outline';
  roles: string[];
  topicCount: number;
  completedTopics: number;
  orgId: string | null;
  enrollment: { id: string; status: string; mode: string } | null;
};

const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

function TrackMeta({ t }: { t: TrackSummary }) {
  return (
    <>
      {t.topicCount > 0 && <span>{t.topicCount} topics</span>}
      {t.estimatedHours ? (
        <span className="inline-flex items-center gap-1">
          <ClockIcon size={13} aria-hidden /> ~{t.estimatedHours} h
        </span>
      ) : null}
    </>
  );
}

function TrackCard({ t }: { t: TrackSummary }) {
  return (
    <Link to={`/app/learn/${t.slug}`} className="group flex h-full flex-col rounded-lg border border-border bg-surface p-5 shadow-1 transition-colors hover:border-border-strong">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge>{CATEGORY_LABEL[t.category] ?? t.category}</Badge>
        <Badge tone="neutral">{cap(t.level)}</Badge>
        {t.contentStatus === 'outline' && <Badge tone="warning">Outline</Badge>}
        {t.orgId && <Badge tone="info">Your organization</Badge>}
      </div>
      <h3 className="mt-3 text-[15px] font-semibold leading-snug tracking-[-0.005em] group-hover:text-accent-text">{t.title}</h3>
      <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">{t.summary}</p>
      <div className="mt-auto flex items-center gap-3 pt-4 text-[12.5px] text-subtle">
        <TrackMeta t={t} />
      </div>
    </Link>
  );
}

/** Enrolled roadmaps read as one list group with progress, like the home page. */
function MyTrackRow({ t }: { t: TrackSummary }) {
  const pct = t.topicCount ? Math.round((t.completedTopics / t.topicCount) * 100) : 0;
  return (
    <li>
      <Link to={`/app/learn/${t.slug}`} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent-soft font-display text-[14px] font-semibold tabular-nums text-accent-text">{pct}%</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="truncate text-[14.5px] font-semibold tracking-[-0.005em]">{t.title}</span>
            {t.enrollment?.status === 'paused' && <Badge>Paused</Badge>}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12.5px] text-muted">
            <span>{CATEGORY_LABEL[t.category] ?? t.category}</span>
            {t.topicCount > 0 && (
              <span>
                {t.completedTopics} of {t.topicCount} completed
              </span>
            )}
            {t.estimatedHours ? <span>~{t.estimatedHours} h</span> : null}
          </span>
          {t.topicCount > 0 && <Progress value={t.completedTopics} max={t.topicCount} className="mt-2.5 max-w-md" label={`${t.title} progress`} />}
        </span>
        <ArrowRightIcon size={16} className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" aria-hidden />
      </Link>
    </li>
  );
}

export default function RoadmapsPage() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [level, setLevel] = useState('');
  const tracks = useQuery({ queryKey: ['tracks'], queryFn: () => api.get<{ tracks: TrackSummary[]; categories: string[] }>('/learning/tracks') });
  const revision = useQuery({ queryKey: ['revision'], queryFn: () => api.get<{ due: unknown[] }>('/learning/revision') });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (tracks.data?.tracks ?? []).filter(
      (t) =>
        (!category || t.category === category) &&
        (!level || t.level === level) &&
        (!term || t.title.toLowerCase().includes(term) || t.summary.toLowerCase().includes(term) || t.roles.some((r) => r.toLowerCase().includes(term))),
    );
  }, [tracks.data, q, category, level]);
  const mine = filtered.filter((t) => t.enrollment && t.enrollment.status !== 'completed');
  const others = filtered.filter((t) => !mine.includes(t));

  return (
    <div>
      <PageHeader
        title="Roadmaps"
        description="Structured learning paths with lessons, practice, quizzes, projects and milestones. Complete paths have full lessons and quizzes; outline paths give concise notes plus curated free resources."
        actions={
          revision.data?.due.length ? (
            <ButtonLink to="/app/learn/revision" icon={<ArrowsClockwiseIcon size={16} />}>
              Revision queue · {revision.data.due.length}
            </ButtonLink>
          ) : (
            <ButtonLink to="/app/learn/revision" icon={<ArrowsClockwiseIcon size={16} />}>
              Revision queue
            </ButtonLink>
          )
        }
      />

      <div className="mb-8 grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px_160px]">
        <div className="relative">
          <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by topic, language or role" className="pl-9" aria-label="Search roadmaps" />
        </div>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {tracks.data?.categories.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c] ?? c}
            </option>
          ))}
        </Select>
        <Select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Level">
          <option value="">All levels</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </Select>
      </div>

      {tracks.error ? (
        <ErrorState error={tracks.error} onRetry={() => tracks.refetch()} />
      ) : tracks.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-lg" />
          ))}
        </div>
      ) : !filtered.length ? (
        <EmptyState
          icon={<PathIcon size={22} />}
          title="No roadmaps match"
          description="Try a broader search or clear the filters."
          action={
            <Button
              onClick={() => {
                setQ('');
                setCategory('');
                setLevel('');
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          {mine.length > 0 && (
            <Section title="Your roadmaps">
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
                {mine.map((t) => (
                  <MyTrackRow key={t.id} t={t} />
                ))}
              </ul>
            </Section>
          )}
          {others.length > 0 && (
            <Section title={mine.length ? 'Explore more' : 'All roadmaps'} action={<span className="text-[12.5px] tabular-nums text-subtle">{others.length} roadmaps</span>}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {others.map((t) => (
                  <TrackCard key={t.id} t={t} />
                ))}
              </div>
            </Section>
          )}
          <p className="flex items-start gap-1.5 text-[12.5px] leading-relaxed text-subtle">
            <InfoIcon size={14} className="mt-0.5 shrink-0" aria-hidden />
            Supported categories cover programming languages, web, DSA, design, system design, databases, CS fundamentals, DevOps, AI/ML, math, testing and security, collaboration, communication and careers. Outline paths are clearly labeled and grow over time; organizations can publish their own paths from the Create workspace.
          </p>
        </div>
      )}
    </div>
  );
}
