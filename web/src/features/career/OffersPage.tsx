import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ScalesIcon, InfoIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { PageHeader, Card, CardHeader, CardBody, ErrorState, SkeletonRows, Button, ButtonLink, Field, Select, Textarea, Badge, StatusBadge } from '@/components/ui';
import type { TargetSummary } from './api';

type Key = { key: string; label: string };
type Breakdown = { key: string; label: string; weight: number; value: number | null; basis: string; contribution: number | null };
type CompareItem = { id: string; company: string; role: string; status: string; salaryText: string | null; location: string | null; offer: { baseSalary?: number; currency?: string; remote?: string; deadline?: string } | null; score: number | null; coverage: string; breakdown: Breakdown[] };
type Evaluation = { rows: { key: string; label: string; weight: number; signal: 'positive' | 'concern' | 'mixed' | 'not_mentioned'; quotes: string[] }[]; topPriorities: string[]; addressed: number; note: string };

const SIGNAL: Record<Evaluation['rows'][number]['signal'], { label: string; tone: 'success' | 'warning' | 'info' | 'neutral' }> = {
  positive: { label: 'Mentioned positively', tone: 'success' },
  concern: { label: 'Possible concern', tone: 'warning' },
  mixed: { label: 'Mixed', tone: 'info' },
  not_mentioned: { label: 'Not mentioned', tone: 'neutral' },
};

function Priorities({ keys, weights, onSaved }: { keys: Key[]; weights: Record<string, number>; onSaved: () => void }) {
  const [w, setW] = useState(weights);
  useEffect(() => setW(weights), [weights]);
  const save = useMutation({
    mutationFn: () => api.put('/career/offers/priorities', { weights: w }),
    onSuccess: () => {
      toast.success('Priorities saved.');
      onSaved();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card>
      <CardHeader title="Your priorities" description="How much each factor matters to you, from 0 (ignore) to 5 (critical)." />
      <CardBody className="space-y-3">
        {keys.map((k) => (
          <div key={k.key} className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_1.25rem] items-center gap-3">
            <label htmlFor={`w-${k.key}`} className="text-[13.5px]">
              {k.label}
            </label>
            <input id={`w-${k.key}`} type="range" min={0} max={5} step={1} value={w[k.key] ?? 0} onChange={(e) => setW({ ...w, [k.key]: Number(e.target.value) })} className="w-full min-w-0 accent-[var(--accent)]" />
            <span className="text-right text-[13px] font-semibold tabular-nums">{w[k.key] ?? 0}</span>
          </div>
        ))}
        <div className="flex justify-end border-t border-border pt-4">
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            Save priorities
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function RatingSelect({ appId, item, k, onSaved }: { appId: string; item: CompareItem; k: string; onSaved: () => void }) {
  const current = item.breakdown.find((b) => b.key === k);
  const rated = current?.basis.startsWith('Your rating') ? current.basis.match(/(\d)\/5/)?.[1] ?? '' : '';
  const save = useMutation({
    mutationFn: (v: string) => {
      const ratings: Record<string, number | null> = {};
      for (const b of item.breakdown) {
        const m = b.basis.match(/^Your rating (\d)\/5/);
        if (m) ratings[b.key] = Number(m[1]);
      }
      ratings[k] = v ? Number(v) : null;
      return api.put(`/career/offers/ratings/${appId}`, { ratings });
    },
    onSuccess: onSaved,
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Select aria-label={`Your rating for ${current?.label} at ${item.company}`} value={rated} onChange={(e) => save.mutate(e.target.value)} className="h-7 text-[12.5px]">
      <option value="">Not rated</option>
      {[1, 2, 3, 4, 5].map((n) => (
        <option key={n} value={n}>
          {n} of 5
        </option>
      ))}
    </Select>
  );
}

export default function OffersPage() {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const pri = useQuery({ queryKey: ['career', 'offers', 'priorities'], queryFn: () => api.get<{ weights: Record<string, number>; keys: Key[]; formula: string }>('/career/offers/priorities') });
  const cmp = useQuery({ queryKey: ['career', 'offers', 'compare'], queryFn: () => api.get<{ items: CompareItem[]; formula: string; keys: Key[] }>('/career/offers/compare') });
  const targets = useQuery({ queryKey: ['career', 'targets'], queryFn: () => api.get<{ items: TargetSummary[] }>('/career/targets') });
  const [targetId, setTargetId] = useState(params.get('targetId') ?? '');
  const [jd, setJd] = useState('');
  const evaluate = useMutation({
    mutationFn: () => api.post<Evaluation>('/career/offers/evaluate-jd', targetId ? { targetId } : { description: jd }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  useEffect(() => {
    if (params.get('targetId')) evaluate.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const refresh = () => qc.invalidateQueries({ queryKey: ['career', 'offers'] });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Offers and decisions" description="Weigh opportunities against what matters to you. Scores use only offer details you entered and your own ratings; nothing is guessed." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        {pri.isLoading ? <SkeletonRows rows={6} /> : pri.error ? <ErrorState error={pri.error} onRetry={() => pri.refetch()} /> : pri.data && <Priorities keys={pri.data.keys} weights={pri.data.weights} onSaved={refresh} />}
        <Card>
          <CardHeader title="Compare offers" description="Applications in Offer or Accepted status, or with offer details recorded." />
          <CardBody>
            {cmp.isLoading ? (
              <SkeletonRows rows={4} />
            ) : cmp.error ? (
              <ErrorState error={cmp.error} onRetry={() => cmp.refetch()} />
            ) : !cmp.data?.items.length ? (
              <div className="flex flex-col items-center px-4 py-10 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] bg-accent-soft text-accent-text ring-[6px] ring-accent-wash">
                  <ScalesIcon size={22} />
                </div>
                <h3 className="text-[15px] font-semibold tracking-[-0.01em]">No offers to compare</h3>
                <p className="mt-1 max-w-sm text-[13.5px] leading-relaxed text-muted">Record offer details on an application (Offer tab) and it appears here.</p>
                <ButtonLink to="/app/career/applications" variant="primary" className="mt-5">
                  Open tracker
                </ButtonLink>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-2 pr-3 font-medium text-subtle">Criterion (weight)</th>
                        {cmp.data.items.map((i) => (
                          <th key={i.id} className="min-w-44 py-2 pr-3 align-bottom">
                            <Link to={`/app/career/applications?open=${i.id}`} className="font-semibold hover:underline">
                              {i.company}
                            </Link>
                            <div className="font-normal text-muted">{i.role}</div>
                            <StatusBadge status={i.status} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {cmp.data.keys.map((k) => (
                        <tr key={k.key}>
                          <th className="py-2 pr-3 font-normal">
                            {k.label} <span className="text-subtle">({cmp.data!.items[0].breakdown.find((b) => b.key === k.key)?.weight ?? 0})</span>
                          </th>
                          {cmp.data!.items.map((i) => {
                            const b = i.breakdown.find((x) => x.key === k.key)!;
                            return (
                              <td key={i.id} className="py-2 pr-3 align-top">
                                <div className="tabular-nums">{b.value === null ? <span className="text-subtle">Not rated</span> : `${Math.round(b.value * 100)}%`}</div>
                                <div className="text-[11.5px] text-muted">{b.basis}</div>
                                {k.key !== 'salary' || b.value === null ? <div className="mt-1"><RatingSelect appId={i.id} item={i} k={k.key} onSaved={refresh} /></div> : null}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      <tr>
                        <th className="py-2 pr-3 font-semibold">Weighted score</th>
                        {cmp.data.items.map((i) => (
                          <td key={i.id} className="py-2 pr-3">
                            <div className="text-[18px] font-semibold tabular-nums">{i.score === null ? '-' : i.score}</div>
                            <div className="text-[11.5px] text-muted">{i.coverage}</div>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="flex items-start gap-1.5 text-[12.5px] text-muted">
                  <InfoIcon size={14} className="mt-0.5 shrink-0" /> {cmp.data.formula}
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-8">
        <CardHeader title="Check a job description against your priorities" description="Quotes what the JD says about each priority and flags what it does not mention, so you know what to ask." />
        <CardBody className="space-y-4">
          <div className="grid items-start gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
            <Field label="Saved job target" optional>
              <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                <option value="">Paste a description instead</option>
                {(targets.data?.items ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </Select>
            </Field>
            {!targetId && (
              <Field label="Job description">
                <Textarea rows={5} value={jd} onChange={(e) => setJd(e.target.value)} />
              </Field>
            )}
          </div>
          <Button variant="primary" loading={evaluate.isPending} disabled={!targetId && jd.trim().length < 40} disabledReason="Choose a target or paste a description" onClick={() => evaluate.mutate()}>
            Check against priorities
          </Button>
          {evaluate.data && (
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-[13.5px]">
                {evaluate.data.addressed} of your top {evaluate.data.topPriorities.length} priorities are addressed in this description.
              </p>
              <ul className="divide-y divide-border">
                {evaluate.data.rows.map((r) => (
                  <li key={r.key} className="grid gap-1 py-2.5 sm:grid-cols-[12rem_11rem_minmax(0,1fr)] sm:gap-4">
                    <span className="text-[13.5px]">
                      {r.label} <span className="text-subtle">({r.weight})</span>
                    </span>
                    <span>
                      <Badge tone={SIGNAL[r.signal].tone}>{SIGNAL[r.signal].label}</Badge>
                    </span>
                    <span className="text-[12.5px] text-muted">{r.quotes.length ? r.quotes.map((q) => `"${q}"`).join(' ') : 'Ask about this in the interview.'}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[12.5px] text-muted">{evaluate.data.note}</p>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
