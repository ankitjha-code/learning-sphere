import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LightbulbIcon, SparkleIcon, BookOpenTextIcon, ClockCounterClockwiseIcon, FlagIcon, ChartLineIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Button, Banner, Badge, EmptyState, ErrorState, SkeletonRows, ProvenanceTag, Markdown, ConfirmDialog, Dialog, Pagination, CopyButton } from '@/components/ui';
import { CodeEditor } from './CodeEditor';
import { ResultsView } from './ResultsView';
import {
  LANGUAGE_LABEL,
  PROVIDER_LABEL,
  RUN_STATUS_LABEL,
  runTone,
  type AiResponse,
  type Language,
  type ProblemDetail,
  type SolutionResponse,
  type SubmissionDetail,
  type SubmissionSummary,
} from './api';

function AiResult({ r, title }: { r: AiResponse; title: string }) {
  if (!r.ok) {
    const why = r.reason === 'not_configured' ? 'No AI provider is set up on this server, so AI help is turned off. Stored hints still work.' : r.message;
    return (
      <Banner tone="warning" title={`${title} unavailable`}>
        {why}
        {r.retryAfterSeconds ? ` Try again in about ${r.retryAfterSeconds} seconds.` : ''}
      </Banner>
    );
  }
  return (
    <div className="rounded-md border border-border bg-surface-2 px-4 py-3.5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <ProvenanceTag kind="ai" />
        {r.label !== 'AI generated' && <ProvenanceTag kind="estimate" />}
        <span className="text-[12px] text-subtle">Model: {r.model}</span>
      </div>
      <Markdown source={r.text} className="text-[14px]" />
    </div>
  );
}

// ---------- Hints ----------

export function HintsPanel({ detail, code, language }: { detail: ProblemDetail; code: string; language: Language }) {
  const qc = useQueryClient();
  const id = detail.problem.id;
  const hints = detail.problem.content.hints ?? [];
  const total = detail.state.hintCount;
  const [ai, setAi] = useState<AiResponse | null>(null);

  const next = useMutation({
    mutationFn: () => api.post<{ level: number; hint: string }>(`/practice/problems/${id}/hint`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['practice', 'problem'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const nudge = useMutation({
    mutationFn: () => api.post<AiResponse>(`/practice/problems/${id}/ai-hint`, { code, language }),
    onSuccess: setAi,
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-1 text-[15px] font-semibold">Hints</h2>
        <p className="mb-3 text-[13px] text-muted">Each hint gives a little more away. Try the next step on your own before opening another.</p>
        {total === 0 ? (
          <p className="text-[13.5px] text-muted">This problem has no stored hints.</p>
        ) : (
          <ol className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {hints.map((h, i) => (
              <li key={i} className="px-4 py-3 text-[14px]">
                <div className="mb-0.5 text-[11.5px] font-semibold uppercase tracking-wide text-subtle">Hint {i + 1}</div>
                <Markdown source={h} />
              </li>
            ))}
          </ol>
        )}
        {total > 0 && (
          <Button
            className="mt-3"
            icon={<LightbulbIcon size={16} />}
            loading={next.isPending}
            onClick={() => next.mutate()}
            disabled={hints.length >= total}
            disabledReason={hints.length >= total ? 'You have seen every hint for this problem.' : undefined}
          >
            {hints.length === 0 ? `Show hint 1 of ${total}` : `Show hint ${hints.length + 1} of ${total}`}
          </Button>
        )}
      </section>

      <section>
        <div className="mb-1 flex items-center gap-2">
          <h2 className="text-[15px] font-semibold">AI nudge</h2>
          <ProvenanceTag kind="ai" />
        </div>
        <p className="mb-3 text-[13px] text-muted">An AI coach reads the problem, the sample tests and your current code, and suggests a next step. It is told not to give the solution and never sees hidden tests.</p>
        <Button icon={<SparkleIcon size={16} />} loading={nudge.isPending} onClick={() => nudge.mutate()}>
          Ask for a nudge
        </Button>
        {ai && (
          <div className="mt-3">
            <AiResult r={ai} title="AI nudge" />
          </div>
        )}
      </section>
    </div>
  );
}

// ---------- Solution ----------

export function SolutionPanel({ detail, code, language }: { detail: ProblemDetail; code: string; language: Language }) {
  const qc = useQueryClient();
  const id = detail.problem.id;
  const [confirm, setConfirm] = useState(false);
  const [estimate, setEstimate] = useState<AiResponse | null>(null);
  const available = detail.state.solutionAvailable;
  const sol = useQuery({ queryKey: ['practice', 'solution', id], queryFn: () => api.get<SolutionResponse>(`/practice/problems/${id}/solution`), enabled: available });

  const giveUp = useMutation({
    mutationFn: () => api.post(`/practice/problems/${id}/give-up`),
    onSuccess: async () => {
      setConfirm(false);
      await qc.invalidateQueries({ queryKey: ['practice', 'problem'] });
      toast.success('Solution unlocked. Solving it later still counts, with a note that you viewed the solution.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const estimateMut = useMutation({
    mutationFn: () => api.post<AiResponse>(`/practice/problems/${id}/ai-complexity`, { code, language }),
    onSuccess: setEstimate,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const estimateSection = (
    <section className="mt-6">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-[14px] font-semibold">Complexity of your code</h3>
        <ProvenanceTag kind="estimate" />
      </div>
      <p className="mb-2 text-[13px] text-muted">CodeLab does not measure complexity. You can ask the AI coach for an estimate based on reading your code; it is labeled as an AI estimate, not measured.</p>
      <Button
        size="sm"
        icon={<ChartLineIcon size={15} />}
        loading={estimateMut.isPending}
        disabled={!code.trim()}
        disabledReason={!code.trim() ? 'Write some code first.' : undefined}
        onClick={() => estimateMut.mutate()}
      >
        Estimate my complexity
      </Button>
      {estimate && (
        <div className="mt-3">
          <AiResult r={estimate} title="AI estimate" />
        </div>
      )}
    </section>
  );

  if (!available) {
    return (
      <div>
        <EmptyState
          icon={<BookOpenTextIcon size={22} />}
          title="The solution unlocks when you solve the problem"
          description="Get an accepted submission to compare your approach with the reference. If you are stuck, use the hints first, or give up to see the solution now."
          action={
            <Button variant="secondary" icon={<FlagIcon size={16} />} onClick={() => setConfirm(true)}>
              Give up and view solution
            </Button>
          }
        />
        {estimateSection}
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title="View the solution now?"
          description="The reference solution and explanation will be shown. You can still solve the problem afterwards and it will count, but your Skill DNA evidence will note that you viewed the solution first."
          confirmLabel="Show solution"
          loading={giveUp.isPending}
          onConfirm={() => giveUp.mutate()}
        />
      </div>
    );
  }
  if (sol.error) return <ErrorState error={sol.error} onRetry={() => sol.refetch()} />;
  if (!sol.data) return <SkeletonRows rows={5} />;
  const s = sol.data.solution;
  return (
    <div className="space-y-4">
      {sol.data.unlockedBy === 'gave_up' && !detail.state.solved && (
        <Banner tone="info">You chose to view the solution. Solving the problem afterwards still counts, with a note on the evidence.</Banner>
      )}
      {s.explanation ? <Markdown source={s.explanation} /> : <p className="text-muted">No written explanation for this problem.</p>}
      {s.statedComplexity && (
        <div className="rounded-md border border-border bg-surface-2 px-3 py-2.5 text-[13.5px]">
          <div className="mb-0.5 text-[11.5px] font-semibold uppercase tracking-wide text-subtle">Complexity stated by the author (not measured)</div>
          {s.statedComplexity}
        </div>
      )}
      {s.reference.map((r) => (
        <div key={r.language}>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[13px] font-medium">Reference solution in {LANGUAGE_LABEL[r.language]}</span>
            <CopyButton value={r.code} />
          </div>
          <div className="overflow-hidden rounded-md border border-border">
            <CodeEditor value={r.code} language={r.language} readOnly label={`Reference solution in ${LANGUAGE_LABEL[r.language]}`} />
          </div>
        </div>
      ))}
      {estimateSection}
    </div>
  );
}

// ---------- Submissions ----------

export function SubmissionsPanel({ problemId }: { problemId: string }) {
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState<'submit' | 'all'>('submit');
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['practice', 'submissions', problemId, kind, page],
    queryFn: () => api.get<{ items: SubmissionSummary[]; total: number }>(`/practice/problems/${problemId}/submissions?kind=${kind}&page=${page}&pageSize=15`),
  });
  const detail = useQuery({ queryKey: ['practice', 'submission', openId], queryFn: () => api.get<{ submission: SubmissionDetail }>(`/practice/submissions/${openId}`), enabled: !!openId });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Your history</h2>
        <div className="flex gap-1" role="group" aria-label="Which runs to show">
          <Button size="sm" variant={kind === 'submit' ? 'soft' : 'ghost'} aria-pressed={kind === 'submit'} onClick={() => (setKind('submit'), setPage(1))}>
            Submissions
          </Button>
          <Button size="sm" variant={kind === 'all' ? 'soft' : 'ghost'} aria-pressed={kind === 'all'} onClick={() => (setKind('all'), setPage(1))}>
            Runs and submissions
          </Button>
        </div>
      </div>
      {list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data ? (
        <SkeletonRows rows={4} />
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={<ClockCounterClockwiseIcon size={22} />} title="Nothing here yet" description="Submit your code to run every test, including hidden ones. Your submissions appear here." />
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {list.data.items.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setOpenId(s.id)} className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left text-[13.5px] transition-colors hover:bg-surface-2">
                  <Badge tone={runTone(s.status)}>{RUN_STATUS_LABEL[s.status] ?? s.status}</Badge>
                  <span className="text-muted">{LANGUAGE_LABEL[s.language] ?? s.language}</span>
                  {s.kind === 'run' && <Badge>Run</Badge>}
                  {s.status !== 'unavailable' && s.total > 0 && (
                    <span className="tabular-nums text-muted">
                      {s.passed}/{s.total}
                    </span>
                  )}
                  <span className="ml-auto text-[12px] text-subtle">{formatDateTime(s.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={15} total={list.data.total} onPage={setPage} />
        </>
      )}
      <Dialog open={!!openId} onOpenChange={(v) => !v && setOpenId(null)} title="Submission details" size="xl">
        {detail.error ? (
          <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
        ) : !detail.data ? (
          <SkeletonRows rows={5} />
        ) : (
          <div className="space-y-4">
            <div className="text-[13px] text-muted">
              {LANGUAGE_LABEL[detail.data.submission.language]} · {formatDateTime(detail.data.submission.createdAt)} · {PROVIDER_LABEL[detail.data.submission.provider]}
            </div>
            <div className="overflow-hidden rounded-md border border-border">
              <CodeEditor value={detail.data.submission.code} language={detail.data.submission.language} readOnly label="Submitted code" />
            </div>
            <ResultsView run={detail.data.submission} />
          </div>
        )}
      </Dialog>
    </div>
  );
}
