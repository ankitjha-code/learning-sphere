import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BookOpenIcon, ChartBarIcon, CodeIcon, CalendarBlankIcon, ListNumbersIcon } from '@phosphor-icons/react';
import { api, qs } from '@/lib/api';
import { Banner, ButtonLink, Card, CardBody, CardHeader, EmptyState, ErrorState, PageHeader, ProvenanceTag, Segmented, Skeleton, StatTile } from '@/components/ui';
import { BarTable, CaveatsBox, ProvenanceLine, SkillLink, WeeklyColumns } from './components';
import { pctText, type Scope, type SkillDetail } from './api';

export default function SkillDetailPage() {
  const { slug = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const days = params.get('days') === '30' ? '30' : '90';
  const scope = (['all', 'public', 'platform'].includes(params.get('scope') ?? '') ? params.get('scope') : 'all') as Scope;
  const back = `/app/career/market${qs({ days: params.get('days') ?? undefined, scope: scope === 'all' ? undefined : scope })}`;
  const search = qs({ days, scope: scope === 'all' ? undefined : scope });
  const q = useQuery({ queryKey: ['market', 'skill', slug, days, scope], queryFn: () => api.get<SkillDetail>(`/market/skills/${encodeURIComponent(slug)}${qs({ days, scope })}`), placeholderData: keepPreviousData });
  const d = q.data;
  const learnInGrid = !!d && d.status !== 'empty' && !!d.summary && d.summary.mentions > 0;
  const learnCard: ReactNode = d ? <LearnCard d={d} /> : null;

  return (
    <div>
      <PageHeader
        title={d?.skill.name ?? 'Skill in the market'}
        badge={d?.dataset === 'sample' ? <ProvenanceTag kind="sample" /> : undefined}
        description="How often postings mention this skill, in which roles, and which skills appear next to it."
        breadcrumb={
          <Link to={back} className="hover:underline">
            Market insights
          </Link>
        }
        actions={
          <Segmented
            label="Period"
            value={days}
            onChange={(v) => {
              const next = new URLSearchParams(params);
              next.set('days', v);
              setParams(next, { replace: true });
            }}
            options={[
              { value: '30', label: 'Last 30 days' },
              { value: '90', label: 'Last 90 days' },
            ]}
          />
        }
      />
      {q.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-64" />
        </div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : d ? (
        <div className="space-y-6">
          <div className="space-y-3">
            <ProvenanceLine basedOn={d.basedOn} freshness={d.freshness} />
            {d.dataset === 'sample' && (
              <Banner tone="warning" title="Sample data">
                These figures come from sample postings written for demonstration, not real vacancies.
              </Banner>
            )}
          </div>
          {d.status === 'empty' || !d.summary ? (
            <EmptyState icon={<ChartBarIcon size={22} />} title="No market data yet" description={d.emptyReason?.message ?? 'There are no postings to analyse yet.'} action={<ButtonLink to={back}>Back to Market insights</ButtonLink>} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                <StatTile label="Share of postings" value={pctText(d.summary.share, 1)} hint={`${d.summary.mentions} of ${d.summary.postings} postings`} icon={<ChartBarIcon weight="bold" />} tone="accent" />
                <StatTile label="Postings mentioning it" value={d.summary.mentions} hint={`In the last ${d.window.days} days`} icon={<ListNumbersIcon weight="bold" />} tone="accent" />
                <StatTile label="Period" value={`${d.window.days} days`} hint="Counted by publish date" icon={<CalendarBlankIcon weight="bold" />} />
              </div>
              {d.summary.mentions === 0 ? (
                <p className="rounded-lg border border-dashed border-border-strong/70 px-5 py-6 text-center text-[13px] text-muted">No posting in this period mentions {d.skill.name}. Try the longer period.</p>
              ) : (
                <>
                  <Card>
                    <CardHeader title="Share over time" description="Weekly share of postings that mention this skill. Weeks with fewer than 10 postings are not charted because a single posting would swing the share." />
                    <CardBody>
                      <WeeklyColumns weeks={d.weekly} value={(w) => { const x = w as SkillDetail['weekly'][number]; return x.enoughData ? x.share : null; }} valueLabel="Share of postings" format={(n) => pctText(n)} caption={`Weekly share of postings mentioning ${d.skill.name}`} />
                    </CardBody>
                  </Card>
                  <div className="grid items-start gap-4 lg:grid-cols-2">
                    <div className="space-y-4">
                      <Card>
                        <CardHeader title="Roles where it appears" description="Share of the postings that mention this skill, by role." />
                        <CardBody>
                          <BarTable caption={`Roles of postings mentioning ${d.skill.name}`} labelHeader="Role" shareHeader="Of these postings" rows={d.roles.map((r) => ({ key: r.role, label: r.label, value: r.postings, share: r.shareOfSkillPostings }))} />
                        </CardBody>
                      </Card>
                      {learnCard}
                    </div>
                    <Card>
                      <CardHeader title="Often mentioned together" description="Skills named in the same postings. Mentioned together does not mean one causes demand for the other." />
                      <CardBody>
                        {d.cooccurring.length === 0 ? (
                          <p className="text-[13.5px] text-muted">No other known skills appear in these postings.</p>
                        ) : (
                          <BarTable caption={`Skills mentioned together with ${d.skill.name}`} labelHeader="Skill" shareHeader="Of these postings" rows={d.cooccurring.map((c) => ({ key: c.slug, label: <SkillLink slug={c.slug} name={c.name} search={search} />, value: c.postings, share: c.shareOfSkillPostings }))} />
                        )}
                      </CardBody>
                    </Card>
                  </div>
                </>
              )}
            </>
          )}
          {!learnInGrid && learnCard}
          <CaveatsBox caveats={d.caveats} />
        </div>
      ) : null}
    </div>
  );
}

function LearnCard({ d }: { d: SkillDetail }) {
  const empty = d.learning.topics.length === 0 && d.learning.practice.length === 0;
  return (
    <Card>
      <CardHeader title="Learn and practise" description="Roadmap topics and CodeLab problems for this skill." />
      {empty ? (
        <CardBody>
          <p className="text-[13.5px] text-muted">
            No roadmap topic or practice problem is linked to this skill yet.{' '}
            <Link to="/app/learn" className="font-medium text-accent-text hover:underline">
              Browse roadmaps
            </Link>
          </p>
        </CardBody>
      ) : (
        <ul className="divide-y divide-border border-t border-border text-[13.5px]">
          {d.learning.topics.map((t) => (
            <li key={t.link} className="flex items-center gap-3 px-5 py-3">
              <BookOpenIcon size={16} className="shrink-0 text-subtle" aria-hidden />
              <Link to={t.link} className="min-w-0 flex-1 font-medium hover:text-accent-text hover:underline">
                {t.title}
              </Link>
              <span className="shrink-0 text-[12.5px] text-muted">in {t.trackTitle}</span>
            </li>
          ))}
          {d.learning.practice.map((p) => (
            <li key={p.link} className="flex items-center gap-3 px-5 py-3">
              <CodeIcon size={16} className="shrink-0 text-subtle" aria-hidden />
              <Link to={p.link} className="min-w-0 flex-1 font-medium hover:text-accent-text hover:underline">
                {p.title}
              </Link>
              <span className="shrink-0 text-[12.5px] capitalize text-muted">{p.difficulty}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
