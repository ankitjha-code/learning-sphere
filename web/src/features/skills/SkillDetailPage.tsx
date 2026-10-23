import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CaretLeftIcon, SealCheckIcon, PathIcon, CodeIcon, ArrowRightIcon, ArrowLeftIcon, InfoIcon, ChartLineUpIcon, GaugeIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { PageHeader, ErrorState, Skeleton, Card, CardHeader, CardBody, Badge, Progress, ProvenanceTag, EmptyState, StatTile, Section, ButtonLink } from '@/components/ui';
import { DIFFICULTY_TONE } from '@/features/practice/api';
import { STATE_META, StateBadge, type SkillDna, CATEGORY_LABEL } from './SkillDnaPage';

type Evidence = { id: string; source: string; sourceLabel: string; sourceType: string | null; sourceId: string | null; score: number; verified: boolean; note: string | null; createdAt: string };
type Detail = {
  skill: { id: string; slug: string; name: string; category: string; description: string | null; level: number };
  dna: SkillDna;
  prereqs: { id: string; slug: string; name: string }[];
  unlocks: { id: string; slug: string; name: string }[];
  relatedTopics: { title: string; slug: string; trackSlug: string; trackTitle: string }[];
  practice: { id: string; slug: string | null; title: string; difficulty: string; type: string }[];
  evidence: Evidence[];
};

const LEVELS = ['Not rated', 'Beginner', 'Some practice', 'Comfortable', 'Advanced'];

function evidenceLink(e: Evidence): string | null {
  if (e.sourceType === 'code_submission' && e.sourceId) return null;
  if (e.sourceType === 'attempt' && e.sourceId) return `/app/assessments/attempts/${e.sourceId}`;
  if (e.sourceType === 'project' && e.sourceId) return `/app/projects/${e.sourceId}`;
  return null;
}

export default function SkillDetailPage() {
  const { slug = '' } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['skill', slug], queryFn: () => api.get<Detail>(`/learning/skills/${slug}`) });
  const rate = useMutation({
    mutationFn: (level: number) => api.post('/learning/skills/self-rate', { slug, level }),
    onSuccess: () => {
      toast.success('Self-rating saved. It stays labeled as self-reported.');
      qc.invalidateQueries({ queryKey: ['skill', slug] });
      qc.invalidateQueries({ queryKey: ['skill-dna'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <Skeleton className="h-96 rounded-lg" />;
  const d = q.data!;
  const meta = STATE_META[d.dna.state];

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/skills" className="inline-flex items-center gap-1 hover:text-fg">
            <CaretLeftIcon size={14} /> Skill DNA
          </Link>
        }
        title={d.skill.name}
        badge={<StateBadge state={d.dna.state} />}
        description={d.skill.description}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile
              label="Mastery estimate"
              value={d.dna.mastery === null ? 'Not yet' : `${Math.round(d.dna.mastery * 100)}%`}
              hint={d.dna.mastery !== null ? <Progress value={d.dna.mastery * 100} label="Mastery" className="mt-1.5" /> : 'Add evidence to get an estimate'}
              icon={<ChartLineUpIcon weight="bold" />}
              tone="accent"
            />
            <StatTile
              label="Confidence"
              value={d.dna.evidenceCount ? `${Math.round(d.dna.confidence * 100)}%` : 'Not yet'}
              hint="How much recent evidence backs the estimate"
              icon={<GaugeIcon weight="bold" />}
            />
            <StatTile
              label="Last verified"
              value={<span className="text-[22px]">{d.dna.lastVerifiedAt ? formatDate(d.dna.lastVerifiedAt) : 'Never'}</span>}
              hint={meta.description}
              icon={<SealCheckIcon weight="fill" />}
              tone={d.dna.lastVerifiedAt ? 'success' : undefined}
            />
          </div>

          <Section title="Evidence" description="Every quiz, CodeLab solution, assessment and review that counts toward this skill, newest first.">
            {!d.evidence.length ? (
              <EmptyState
                icon={<SealCheckIcon size={22} />}
                title="No evidence yet"
                description="Pass a topic quiz, solve a related CodeLab problem or complete a project to add evidence for this skill."
                action={d.practice[0] && <ButtonLink to={`/app/practice/${d.practice[0].slug ?? d.practice[0].id}`} variant="primary" icon={<CodeIcon size={16} />}>Try "{d.practice[0].title}"</ButtonLink>}
              />
            ) : (
              <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
                {d.evidence.map((e) => {
                  const link = evidenceLink(e);
                  return (
                    <li key={e.id} className="flex items-start gap-4 px-5 py-4">
                      <span className={clsx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', e.verified ? 'bg-success' : e.source === 'self' ? 'bg-border-strong' : 'bg-accent')} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="text-[14px] font-medium">{e.sourceLabel}</span>
                          {e.verified ? <ProvenanceTag kind="verified" /> : e.source === 'self' ? <ProvenanceTag kind="self" /> : e.source === 'review' ? <ProvenanceTag kind="reviewer" /> : <Badge>Unverified</Badge>}
                        </div>
                        {e.note && <p className="mt-1 text-[13px] leading-relaxed text-muted">{e.note}</p>}
                        {link && (
                          <Link to={link} className="mt-1 inline-block text-[12.5px] font-medium text-accent-text hover:underline">
                            Open source
                          </Link>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[14px] font-semibold tabular-nums">{Math.round(e.score * 100)}%</div>
                        <div className="text-[12px] text-subtle">{formatDate(e.createdAt)}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            <p className="mt-3 flex items-start gap-1.5 text-[12.5px] leading-relaxed text-subtle">
              <InfoIcon size={14} className="mt-0.5 shrink-0" aria-hidden />
              Only deterministic grading (tests, answer keys) and authorized human reviewers can produce verified evidence. Self-ratings and AI feedback never do.
            </p>
          </Section>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="flex flex-col">
              <CardHeader title="Learn it" description="Lessons that build this skill" />
              {d.relatedTopics.length ? (
                <ul className="divide-y divide-border border-t border-border">
                  {d.relatedTopics.map((t) => (
                    <li key={t.trackSlug + t.slug}>
                      <Link to={`/app/learn/${t.trackSlug}/${t.slug}`} className="group flex items-start gap-3 px-5 py-3 transition-colors hover:bg-surface-2">
                        <PathIcon size={18} className="mt-0.5 shrink-0 text-subtle" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] font-medium group-hover:text-accent-text">{t.title}</span>
                          <span className="block text-[12px] text-subtle">{t.trackTitle}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <CardBody>
                  <p className="text-[13px] text-muted">
                    No lessons are mapped to this skill yet. Check the{' '}
                    <Link to="/app/library" className="font-medium text-accent-text hover:underline">
                      Library
                    </Link>{' '}
                    for curated resources.
                  </p>
                </CardBody>
              )}
            </Card>
            <Card className="flex flex-col">
              <CardHeader title="Prove it" description="CodeLab problems that add evidence" />
              {d.practice.length ? (
                <ul className="divide-y divide-border border-t border-border">
                  {d.practice.map((p) => (
                    <li key={p.id}>
                      <Link to={`/app/practice/${p.slug ?? p.id}`} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2">
                        <CodeIcon size={18} className="shrink-0 text-subtle" />
                        <span className="min-w-0 flex-1 text-[13.5px] font-medium group-hover:text-accent-text">{p.title}</span>
                        <Badge tone={DIFFICULTY_TONE[p.difficulty as keyof typeof DIFFICULTY_TONE] ?? 'neutral'}>{p.difficulty.charAt(0).toUpperCase() + p.difficulty.slice(1)}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <CardBody>
                  <p className="text-[13px] text-muted">No CodeLab problems for this skill yet. Projects and assessments can still add evidence.</p>
                </CardBody>
              )}
            </Card>
          </div>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="Your self-rating" description="Shown as self-reported. Low weight in your mastery estimate." />
            <CardBody>
              <div className="grid gap-1" role="radiogroup" aria-label="Self-rating">
                {LEVELS.map((l, i) => {
                  const on = (d.dna.selfRating ?? 0) === i;
                  return (
                    <button
                      key={l}
                      role="radio"
                      aria-checked={on}
                      disabled={rate.isPending}
                      onClick={() => rate.mutate(i)}
                      className={clsx('flex h-9 items-center gap-2.5 rounded-md px-2.5 text-left text-[13.5px] transition-colors', on ? 'bg-accent-soft font-medium text-accent-text' : 'hover:bg-surface-2')}
                    >
                      <span className={clsx('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', on ? 'border-accent' : 'border-border-strong')} aria-hidden>
                        {on && <span className="h-2 w-2 rounded-full bg-accent" />}
                      </span>
                      {l}
                    </button>
                  );
                })}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Where it fits" description={`${CATEGORY_LABEL[d.skill.category] ?? d.skill.category} · Tier ${d.skill.level} of 4`} />
            <div className="border-t border-border px-5 py-4">
              <h4 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-subtle">Builds on</h4>
              {d.prereqs.length ? (
                <ul className="mt-2 space-y-1.5">
                  {d.prereqs.map((p) => (
                    <li key={p.id}>
                      <Link to={`/app/skills/${p.slug}`} className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-accent-text hover:underline">
                        <ArrowLeftIcon size={13} aria-hidden /> {p.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[13px] text-muted">No prerequisites. A good starting point.</p>
              )}
            </div>
            <div className="border-t border-border px-5 py-4">
              <h4 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-subtle">Unlocks</h4>
              {d.unlocks.length ? (
                <ul className="mt-2 space-y-1.5">
                  {d.unlocks.map((p) => (
                    <li key={p.id}>
                      <Link to={`/app/skills/${p.slug}`} className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-accent-text hover:underline">
                        <ArrowRightIcon size={13} aria-hidden /> {p.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[13px] text-muted">Nothing depends on this skill in the graph yet.</p>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
