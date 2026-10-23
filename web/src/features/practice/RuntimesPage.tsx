import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CaretRightIcon, DownloadSimpleIcon, CheckCircleIcon, WarningIcon, CubeIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { PageHeader, Card, CardHeader, CardBody, Badge, Button, ErrorState, SkeletonRows, StatusBadge, Banner, Section } from '@/components/ui';
import { PROVIDER_LABEL, type Language, type Provider } from './api';

type PullStatus = { image: string; status: 'idle' | 'pulling' | 'succeeded' | 'failed'; startedAt?: string; finishedAt?: string; message?: string; lastLines: string[] };
type RuntimeRow = { language: Language; label: string; available: boolean; provider: Provider; reason?: string; setupHint?: string; image: string | null; imagePresent: boolean | null; pull: PullStatus | null };
type AdminRuntimes = {
  docker: { mode: 'auto' | 'true' | 'false'; reachable: boolean; error?: string };
  judge0: { configured: boolean; label: string | null };
  runtimes: RuntimeRow[];
  jobs: { id: string; status: string; payload: { language?: string; image?: string }; lastError: string | null; createdAt: string }[];
};

/** Platform admin view of code execution: which languages run where, and Docker image pulls. */
export default function RuntimesPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['practice', 'admin-runtimes'],
    queryFn: () => api.get<AdminRuntimes>('/practice/admin/runtimes'),
    refetchInterval: (query) => (query.state.data?.runtimes.some((r) => r.pull?.status === 'pulling') || query.state.data?.jobs.some((j) => j.status === 'queued' || j.status === 'running') ? 3000 : false),
  });
  const pull = useMutation({
    mutationFn: (language: string) => api.post<{ created: boolean }>(`/practice/admin/runtimes/${language}/pull`),
    onSuccess: (r) => {
      toast.success(r.created ? 'Image pull queued. Progress shows on this page.' : 'A pull for this image is already queued.');
      qc.invalidateQueries({ queryKey: ['practice', 'admin-runtimes'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        breadcrumb={
          <nav className="flex items-center gap-1" aria-label="Breadcrumb">
            <Link to="/app/practice" className="hover:text-fg">
              CodeLab
            </Link>
            <CaretRightIcon size={12} aria-hidden />
            <span className="text-fg">Runtimes</span>
          </nav>
        }
        title="Code execution runtimes"
        description="JavaScript, TypeScript and SQL always run in built-in WebAssembly sandboxes. Other languages need Docker images on this server or a Judge0 instance."
      />
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <SkeletonRows rows={6} />
      ) : (
        <div className="space-y-8">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Docker sandbox" description={`CODE_EXEC_DOCKER=${q.data!.docker.mode}`} action={q.data!.docker.reachable ? <Badge tone="success">Reachable</Badge> : <Badge tone="warning">Not reachable</Badge>} />
              <CardBody>
                <p className="text-[13px] text-muted">{q.data!.docker.reachable ? 'Containers run with no network, a read-only filesystem, memory, CPU and process limits, and no root.' : (q.data!.docker.error ?? 'Docker is not available.')}</p>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Judge0" description="Fallback when Docker cannot run a language" action={q.data!.judge0.configured ? <Badge tone="success">Configured</Badge> : <Badge>Not configured</Badge>} />
              <CardBody>
                <p className="text-[13px] text-muted">{q.data!.judge0.configured ? `${q.data!.judge0.label}. Configured, not health-checked here.` : 'Set JUDGE0_URL (self-hosted) or JUDGE0_RAPIDAPI_HOST and JUDGE0_KEY to enable.'}</p>
              </CardBody>
            </Card>
          </div>

          <Section title="Languages" description="Where each language runs, and whether its image is on this server.">
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {q.data!.runtimes.map((r) => {
                const pulling = r.pull?.status === 'pulling';
                const canPull = !!r.image && q.data!.docker.reachable && r.imagePresent === false;
                return (
                  <li key={r.language} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-start">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      {r.available ? <CheckCircleIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-success" aria-label="Available" /> : <WarningIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-warning" aria-label="Unavailable" />}
                      <div className="min-w-0">
                        <div className="font-medium">{r.label}</div>
                        <div className="text-[13px] text-muted">{r.available ? PROVIDER_LABEL[r.provider] : r.reason}</div>
                        {!r.available && r.setupHint && <div className="mt-0.5 text-[12.5px] text-subtle">{r.setupHint}</div>}
                        {r.image && (
                          <div className="mt-1 inline-flex items-center gap-1 text-[12px] text-subtle">
                            <CubeIcon size={13} /> {r.image}
                            {r.imagePresent === true && ' (present)'}
                            {r.imagePresent === false && ' (not pulled)'}
                          </div>
                        )}
                        {r.pull && r.pull.status !== 'idle' && (
                          <div className="mt-1.5 text-[12.5px]">
                            <StatusBadge status={r.pull.status === 'pulling' ? 'running' : r.pull.status} /> <span className="text-muted">{r.pull.message ?? (pulling ? 'Pulling' : '')}</span>
                            {pulling && r.pull.lastLines.length > 0 && <pre className="mt-1.5 max-h-24 overflow-auto rounded-md bg-surface-2 px-2.5 py-1.5 font-mono text-[11.5px] text-muted">{r.pull.lastLines.slice(-4).join('\n')}</pre>}
                          </div>
                        )}
                      </div>
                    </div>
                    {r.image && (
                      <Button
                        size="sm"
                        icon={<DownloadSimpleIcon size={15} />}
                        loading={pulling || (pull.isPending && pull.variables === r.language)}
                        disabled={!canPull}
                        disabledReason={!q.data!.docker.reachable ? 'Docker is not reachable on this server.' : r.imagePresent ? 'The image is already on this server.' : undefined}
                        onClick={() => pull.mutate(r.language)}
                      >
                        Pull image
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
          </Section>

          {q.data!.jobs.length > 0 && (
            <Section title="Recent pull jobs">
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface text-[13px] shadow-1">
                {q.data!.jobs.map((j) => (
                  <li key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                    <StatusBadge status={j.status} />
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{j.payload.image}</span>
                    <span className="text-[12.5px] text-subtle">{formatDateTime(j.createdAt)}</span>
                    {j.lastError && <span className="w-full text-danger">{j.lastError}</span>}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Banner tone="info">Images are never pulled during a learner's run. Large images (gcc, rust) can take several minutes; the page refreshes while a pull is in progress.</Banner>
        </div>
      )}
    </div>
  );
}
