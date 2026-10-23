import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { toast } from 'sonner';
import { CheckCircleIcon, FlaskIcon, PlayIcon, XCircleIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Banner, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, Field, Select, SkeletonRows, StatusBadge } from '@/components/ui';
import type { Provider } from './ProvidersTab';

type RunSummary = { id: string; status: string; passed: number | null; total: number | null; providerId: string | null; createdAt: string; completedAt: string | null; startedByName: string | null };
type RunDetail = {
  run: RunSummary & { results: { caseId: string; passed: boolean; checks: { name: string; passed: boolean }[]; output?: string; error?: string }[] | null };
  cases: { id: string; title: string; assistant: string }[];
};

export function EvalsTab() {
  const qc = useQueryClient();
  const [providerId, setProviderId] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const providers = useQuery({ queryKey: ['admin', 'ai', 'providers'], queryFn: () => api.get<{ items: Provider[] }>('/ai/admin/providers') });
  const cases = useQuery({ queryKey: ['admin', 'ai', 'eval-cases'], queryFn: () => api.get<{ items: { id: string; title: string; assistant: string }[]; note: string }>('/ai/admin/evals/cases') });
  const runs = useQuery({
    queryKey: ['admin', 'ai', 'evals'],
    queryFn: () => api.get<{ items: RunSummary[] }>('/ai/admin/evals'),
    refetchInterval: (query) => (query.state.data?.items.some((r) => r.status === 'queued' || r.status === 'running') ? 3000 : false),
  });
  const run = useMutation({
    mutationFn: () => api.post<{ run: RunSummary }>('/ai/admin/evals/run', providerId ? { providerId } : {}),
    onSuccess: (r) => {
      toast.success('Evaluation queued. Results appear here when it finishes.');
      setSelected(r.run.id);
      qc.invalidateQueries({ queryKey: ['admin', 'ai', 'evals'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const usable = (providers.data?.items ?? []).filter((p) => p.enabled && !p.problem);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Run the evaluation set"
          description={`${cases.data?.items.length ?? '…'} cases check honesty and safety behaviour: refusing to write graded work, not inventing resume metrics, ignoring instructions hidden in sources, and more. Each run makes one real request per case and uses provider quota.`}
        />
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Provider" className="sm:w-80">
            <Select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
              <option value="">Normal order with failover</option>
              {usable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.model})
                </option>
              ))}
            </Select>
          </Field>
          <Button
            variant="primary"
            icon={<PlayIcon size={15} weight="fill" />}
            loading={run.isPending}
            disabled={!usable.length}
            disabledReason="Add and enable a provider first"
            onClick={() => run.mutate()}
          >
            Run evaluation
          </Button>
        </CardBody>
        {cases.data && <p className="border-t border-border px-5 py-3 text-[12.5px] text-subtle">{cases.data.note}</p>}
      </Card>

      {runs.isLoading ? (
        <SkeletonRows rows={3} />
      ) : runs.error ? (
        <ErrorState error={runs.error} onRetry={() => runs.refetch()} />
      ) : runs.data!.items.length === 0 ? (
        <EmptyState icon={<FlaskIcon size={22} />} title="No evaluation runs yet" description="Run the evaluation set after adding or changing a provider to see how the model behaves." />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
          <Card>
            <CardHeader title="History" />
            <ul className="divide-y divide-border border-t border-border">
              {runs.data!.items.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(r.id)}
                    className={clsx('flex w-full items-center justify-between gap-3 px-5 py-3 text-left text-[13px] transition-colors hover:bg-surface-2', selected === r.id && 'bg-surface-2')}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{formatDateTime(r.createdAt)}</span>
                      <span className="block truncate text-[11.5px] text-subtle">{r.startedByName ?? 'Unknown'}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {r.status === 'completed' && (
                        <span className="tabular-nums text-muted">
                          {r.passed}/{r.total}
                        </span>
                      )}
                      <StatusBadge status={r.status} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          {selected ? (
            <RunView id={selected} />
          ) : (
            <p className="rounded-lg border border-dashed border-border-strong/70 px-5 py-10 text-center text-[13.5px] text-muted">Select a run to see per-case results.</p>
          )}
        </div>
      )}
    </div>
  );
}

function RunView({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ['admin', 'ai', 'eval', id],
    queryFn: () => api.get<RunDetail>(`/ai/admin/evals/${id}`),
    refetchInterval: (query) => (query.state.data && ['queued', 'running'].includes(query.state.data.run.status) ? 3000 : false),
  });
  const [open, setOpen] = useState<string | null>(null);
  if (q.isLoading) return <SkeletonRows rows={4} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { run, cases } = q.data!;
  if (run.status === 'queued' || run.status === 'running')
    return (
      <Banner tone="info" title="Running">
        This run is {run.status}. Results appear here automatically.
      </Banner>
    );
  if (run.status === 'failed')
    return (
      <Banner tone="danger" title="The run could not start">
        {run.results?.[0]?.error ?? 'No usable provider.'}
      </Banner>
    );
  return (
    <Card>
      <CardHeader title={`${run.passed} of ${run.total} cases passed`} description="Outputs are shown for review. They are model output, not verified facts." />
      <ul className="divide-y divide-border border-t border-border">
        {(run.results ?? []).map((r) => {
          const c = cases.find((x) => x.id === r.caseId);
          return (
            <li key={r.caseId} className="px-5 py-3.5">
              <button type="button" className="flex w-full items-start gap-2 text-left" onClick={() => setOpen(open === r.caseId ? null : r.caseId)} aria-expanded={open === r.caseId}>
                {r.passed ? (
                  <CheckCircleIcon size={17} weight="fill" className="mt-0.5 shrink-0 text-success" aria-label="Passed" />
                ) : (
                  <XCircleIcon size={17} weight="fill" className="mt-0.5 shrink-0 text-danger" aria-label="Failed" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium">{c?.title ?? r.caseId}</span>
                  <span className="block text-[12px] text-subtle">{c?.assistant}</span>
                </span>
              </button>
              {open === r.caseId && (
                <div className="mt-2 space-y-2 pl-6 text-[12.5px]">
                  {r.error && <p className="text-danger">{r.error}</p>}
                  <ul className="space-y-0.5">
                    {r.checks.map((k) => (
                      <li key={k.name} className={k.passed ? 'text-success' : 'text-danger'}>
                        {k.passed ? 'Pass' : 'Fail'}: {k.name}
                      </li>
                    ))}
                  </ul>
                  {r.output && <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-surface-2 p-2 text-[12px] text-muted">{r.output}</pre>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
