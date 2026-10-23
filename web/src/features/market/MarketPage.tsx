import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowsClockwiseIcon, ChartBarIcon, CloudArrowDownIcon, DnaIcon, TrendUpIcon, GlobeIcon } from '@phosphor-icons/react';
import { api, errorMessage, qs } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Banner, Button, ButtonLink, Card, CardAction, CardBody, CardHeader, EmptyState, ErrorState, PageHeader, ProvenanceTag, Segmented, Select, Skeleton, StatTile, Badge } from '@/components/ui';
import { BarTable, CaveatsBox, ProvenanceLine, SkillLink, SourcesCard, TrendBadge, WeeklyColumns } from './components';
import { STATUS_LABEL, pctText, type MeStatus, type MeVsMarket, type Overview, type Scope, type SnapshotResult, type SourcesReport, type SyncResult } from './api';

const STATUS_TONE: Record<MeStatus, 'success' | 'info' | 'accent' | 'neutral' | 'warning'> = {
  verified: 'success',
  demonstrated: 'info',
  learning: 'accent',
  self_reported: 'neutral',
  none: 'neutral',
};

export default function MarketPage() {
  const [params, setParams] = useSearchParams();
  const days = params.get('days') === '90' ? '90' : '30';
  const scope = (['all', 'public', 'platform'].includes(params.get('scope') ?? '') ? params.get('scope') : 'all') as Scope;
  const search = qs({ days, scope: scope === 'all' ? undefined : scope });
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    setParams(next, { replace: true });
  };

  const ov = useQuery({ queryKey: ['market', 'overview', days, scope], queryFn: () => api.get<Overview>(`/market/overview${qs({ days, scope })}`), placeholderData: keepPreviousData });
  const sources = useQuery({ queryKey: ['market', 'sources', days], queryFn: () => api.get<SourcesReport>(`/market/sources${qs({ days })}`) });

  return (
    <div>
      <PageHeader
        title="Market insights"
        badge={ov.data?.dataset === 'sample' ? <ProvenanceTag kind="sample" /> : undefined}
        description="Which skills job postings mention, counted from real postings with their source and date. Use it to choose what to learn next, not as a forecast."
        breadcrumb={
          <Link to="/app/career" className="hover:underline">
            Career Launch Studio
          </Link>
        }
        actions={
          <>
            <Segmented label="Period" value={days} onChange={(v) => set('days', v)} options={[{ value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }]} />
            <Select aria-label="Sources" value={scope} onChange={(e) => set('scope', e.target.value)} className="w-48">
              <option value="all">All sources</option>
              <option value="public">Public job boards</option>
              <option value="platform">On this platform</option>
            </Select>
          </>
        }
      />

      {ov.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-6 w-2/3" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-72" />
        </div>
      ) : ov.error ? (
        <ErrorState error={ov.error} onRetry={() => ov.refetch()} />
      ) : ov.data ? (
        <div className="space-y-6">
          <div className="space-y-3">
            <ProvenanceLine basedOn={ov.data.basedOn} freshness={ov.data.freshness} />
            {ov.data.dataset === 'sample' && (
              <Banner tone="warning" title="Sample data">
                No real postings are available on this server, so this page shows clearly labelled sample postings to demonstrate the feature. Do not use these figures for decisions.
              </Banner>
            )}
            {ov.data.freshness.status === 'historical' && (
              <Banner tone="warning" title="Historical data">
                {ov.data.freshness.message}
              </Banner>
            )}
          </div>

          {ov.data.status === 'empty' ? (
            <EmptyState
              icon={<ChartBarIcon size={22} />}
              title={ov.data.emptyReason?.code === 'no_recent_postings' ? 'No postings in this period' : 'No market data yet'}
              description={ov.data.emptyReason?.message ?? 'There are no postings to analyse yet.'}
              action={
                ov.data.emptyReason?.code === 'no_recent_postings' && days === '30' ? (
                  <Button variant="primary" onClick={() => set('days', '90')}>
                    Show the last 90 days
                  </Button>
                ) : (
                  <ButtonLink to="/app/jobs" variant="primary">
                    Browse the job board
                  </ButtonLink>
                )
              }
            />
          ) : (
            <Insights data={ov.data} search={search} />
          )}

          <MePanel days={days} scope={scope} search={search} />
          <CaveatsBox caveats={ov.data.caveats} />
          {sources.data ? <SourcesCard report={sources.data} /> : sources.error ? <ErrorState error={sources.error} onRetry={() => sources.refetch()} /> : <Skeleton className="h-40" />}
          <AdminPanel />
        </div>
      ) : null}
    </div>
  );
}

function Insights({ data, search }: { data: Overview; search: string }) {
  const s = data.summary!;
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Postings analysed" value={s.postings} hint={`${data.window.days}-day period`} icon={<ChartBarIcon weight="bold" />} tone="accent" />
        <StatTile label="Remote share" value={pctText(s.remoteShare)} hint={`${s.remotePostings} of ${s.postings} postings`} icon={<GlobeIcon weight="bold" />} tone="accent" />
        <StatTile label="Skills detected" value={s.skillsDetected} hint="Distinct skills mentioned" icon={<DnaIcon weight="bold" />} tone="accent" />
        <StatTile label="Trend comparison" value={data.trend.available ? 'Shown' : 'Not shown'} hint={`Needs ${data.trend.minPostingsPerPeriod}+ postings per period`} icon={<TrendUpIcon weight="bold" />} tone={data.trend.available ? 'success' : undefined} />
      </div>

      <Card>
        <CardHeader
          title="Most requested skills"
          description={`Share of postings that mention each skill. Trend compares with the previous ${data.window.days} days.`}
        />
        <CardBody>
          {!data.trend.available && data.trend.reason && <p className="mb-2 text-[13px] text-muted">{data.trend.reason}</p>}
          {data.skills.length === 0 ? (
            <p className="text-[13.5px] text-muted">No known skills were detected in these postings.</p>
          ) : (
            <BarTable
              caption="Most requested skills: share of postings mentioning each skill"
              labelHeader="Skill"
              extraHeader="Trend"
              rows={data.skills.slice(0, 15).map((k) => ({ key: k.slug, label: <SkillLink slug={k.slug} name={k.name} search={search} />, value: k.postings, share: k.share, extra: <TrendBadge trend={k.trend} /> }))}
            />
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Role mix" description="Roles guessed from job titles with simple keyword rules." />
          <CardBody>
            <BarTable caption="Role mix: share of postings per role" labelHeader="Role" rows={data.roles.map((r) => ({ key: r.role, label: r.label, value: r.postings, share: r.share }))} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Top companies" description="Companies with the most postings in this period." />
          <CardBody>
            <BarTable caption="Top companies by number of postings" labelHeader="Company" rows={data.companies.map((c) => ({ key: c.name, label: c.name, value: c.postings, share: c.share }))} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Postings per week" description="How many postings our sources returned each week. This depends on how often we fetch, so it is not a measure of hiring activity." />
        <CardBody>
          <WeeklyColumns weeks={data.weekly} value={(w) => w.postings} valueLabel="Postings" caption="Postings per week" />
        </CardBody>
      </Card>
    </>
  );
}

function MePanel({ days, scope, search }: { days: string; scope: Scope; search: string }) {
  const me = useQuery({ queryKey: ['market', 'me', days, scope], queryFn: () => api.get<MeVsMarket>(`/market/me${qs({ days, scope })}`) });
  return (
    <Card>
      <CardHeader
        title="You vs the market"
        description="The most requested skills next to the evidence in your Skill DNA."
        action={<CardAction to="/app/skills">Open Skill DNA</CardAction>}
      />
      <CardBody>
        {me.isLoading ? (
          <Skeleton className="h-40" />
        ) : me.error ? (
          <ErrorState error={me.error} onRetry={() => me.refetch()} />
        ) : !me.data || me.data.status === 'empty' ? (
          <p className="text-[13.5px] text-muted">This comparison appears once there are postings to compare with.</p>
        ) : (
          <>
            <p className="mb-3 text-[13.5px] text-muted">
              Of the top {me.data.items.length} skills, you have verified evidence for {me.data.counts.verified}, demonstrated {me.data.counts.demonstrated} and are learning {me.data.counts.learning}.
              {me.data.dataset === 'sample' && ' The market side is sample data.'}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <caption className="sr-only">Top skills in postings compared with your Skill DNA</caption>
                <thead>
                  <tr className="border-b border-border text-left text-[12px] text-muted">
                    <th scope="col" className="whitespace-nowrap py-2 pr-3 font-medium">
                      Skill
                    </th>
                    <th scope="col" className="whitespace-nowrap py-2 pr-3 text-right font-medium">
                      In postings
                    </th>
                    <th scope="col" className="whitespace-nowrap py-2 pr-3 font-medium">
                      Your evidence
                    </th>
                    <th scope="col" className="whitespace-nowrap py-2 font-medium">
                      Next step
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {me.data.items.map((i) => {
                    const topic = i.learning.topics[0];
                    const practice = i.learning.practice[0];
                    return (
                      <tr key={i.slug} className="border-b border-border last:border-0">
                        <th scope="row" className="py-2 pr-3 text-left font-normal">
                          <SkillLink slug={i.slug} name={i.name} search={search} />
                        </th>
                        <td className="py-2 pr-3 text-right tabular-nums">{pctText(i.marketShare)}</td>
                        <td className="py-2 pr-3">
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge tone={STATUS_TONE[i.status]}>{STATUS_LABEL[i.status]}</Badge>
                            {i.revisionDue && <Badge tone="warning">Revision due</Badge>}
                          </div>
                        </td>
                        <td className="py-2 text-[13px]">
                          {i.status === 'verified' && !i.revisionDue ? (
                            <span className="text-muted">Keep it fresh with practice</span>
                          ) : topic || practice ? (
                            <span className="flex flex-wrap gap-x-3 gap-y-1">
                              {topic && (
                                <Link to={topic.link} className="text-accent-text hover:underline">
                                  Learn: {topic.title}
                                </Link>
                              )}
                              {practice && (
                                <Link to={practice.link} className="text-accent-text hover:underline">
                                  Practise: {practice.title}
                                </Link>
                              )}
                            </span>
                          ) : (
                            <Link to="/app/learn" className="text-accent-text hover:underline">
                              Browse roadmaps
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[12px] text-subtle">Verified means a deterministic grader or an authorized reviewer confirmed it. A skill being common in postings does not predict your chances of being hired.</p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function AdminPanel() {
  const session = useSession();
  const qc = useQueryClient();
  const isAdmin = session.user.platformRole === 'platform_admin';
  const fetchNow = useMutation({
    mutationFn: () => api.post<{ results: SyncResult[]; snapshot: SnapshotResult; disabled: string[] }>('/market/admin/fetch'),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['market'] });
      const ok = r.results.filter((x) => x.status === 'ok');
      toast.success(r.results.length ? `Fetched ${ok.length} of ${r.results.length} sources. ${r.snapshot.newPostings} new postings counted.` : 'No feeds are enabled on this server.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const recompute = useMutation({
    mutationFn: () => api.post<{ snapshot: SnapshotResult }>('/market/admin/recompute'),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['market'] });
      toast.success(`Insights recomputed. ${r.snapshot.newPostings} new postings counted.`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!isAdmin) return null;
  const results = fetchNow.data?.results;
  return (
    <Card>
      <CardHeader title="Data operations" description="Platform admins only. Fetching respects each provider's rate limit; a source that was fetched recently is skipped and says when it can run again." />
      <CardBody>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={<CloudArrowDownIcon size={16} />} loading={fetchNow.isPending} onClick={() => fetchNow.mutate()}>
            Fetch latest postings now
          </Button>
          <Button icon={<ArrowsClockwiseIcon size={16} />} loading={recompute.isPending} onClick={() => recompute.mutate()}>
            Recompute insights
          </Button>
        </div>
        {results && (
          <ul className="mt-3 space-y-1 text-[13px]" aria-live="polite">
            {results.map((r) => (
              <li key={r.source}>
                <span className="font-medium capitalize">{r.source}</span>: {r.status === 'ok' ? `fetched ${r.fetched} postings` : r.message ?? r.status.replace(/_/g, ' ')}
              </li>
            ))}
            {fetchNow.data!.disabled.length > 0 && <li className="text-muted">Turned off on this server: {fetchNow.data!.disabled.join(', ')}</li>}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
