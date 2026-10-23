import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SparkleIcon, ListChecksIcon, FileTextIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { Button, Card, CardHeader, CardBody, Banner, Markdown, ProvenanceTag, CopyButton } from '@/components/ui';
import type { ProjectDetail } from '../types';

type AiResp = { ok: true; text: string; label: string; provider: string; model: string } | { ok: false; reason: string; message: string; fallback?: string };

const REASON: Record<string, string> = {
  not_configured: 'No AI provider is configured on this server.',
  disabled: 'AI is turned off for your account or organization.',
  quota_exceeded: 'The AI usage limit has been reached.',
  rate_limited: 'Too many AI requests. Try again shortly.',
  timeout: 'The AI provider took too long to respond.',
  unavailable: 'The AI provider is unavailable right now.',
  error: 'The AI request failed.',
};

function Result({ r }: { r: AiResp }) {
  if (!r.ok)
    return (
      <Banner tone="warning" title="AI assistance unavailable">
        {REASON[r.reason] ?? r.message} Everything else in ProjectForge keeps working.
        {r.fallback !== undefined && ' Use "Draft README" in the Docs tab for a draft built from your project data without AI.'}
      </Banner>
    );
  return (
    <div className="rounded-md border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2 px-3 py-2">
        <div className="flex items-center gap-2">
          <ProvenanceTag kind="ai" />
          <span className="text-[12px] text-muted">{r.label}</span>
        </div>
        <CopyButton value={r.text} label="Copy" />
      </div>
      <div className="max-h-[480px] overflow-y-auto p-3">
        <Markdown source={r.text} className="text-[13.5px]" />
      </div>
    </div>
  );
}

export function AiPanel({ d }: { d: ProjectDetail }) {
  const pid = d.project.id;
  const reqReview = useMutation({ mutationFn: () => api.post<AiResp>(`/projects/${pid}/ai/review-requirements`), onError: (e) => toast.error(errorMessage(e)) });
  const readme = useMutation({ mutationFn: (kind: 'readme' | 'case_study') => api.post<AiResp>(`/projects/${pid}/ai/readme`, { kind }), onError: (e) => toast.error(errorMessage(e)) });
  return (
    <div className="space-y-4">
      <Banner tone="info" title="AI suggestions, review before using">
        The project mentor suggests; you decide. Nothing it writes is saved to your project automatically, and AI output never counts as skill evidence. You should be able to explain every part of your project yourself.
      </Banner>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-1.5"><ListChecksIcon size={16} /> Requirements check</span>} description="Missing requirements, edge cases and acceptance criteria to tighten." />
          <CardBody className="space-y-3">
            <Button icon={<SparkleIcon size={14} />} loading={reqReview.isPending} onClick={() => reqReview.mutate()} disabled={!d.access.canEdit && !d.access.canReview}>
              Suggest improvements
            </Button>
            {reqReview.data && <Result r={reqReview.data} />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-1.5"><FileTextIcon size={16} /> README or case study draft</span>} description="Written only from what your project records. Check every statement." />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button icon={<SparkleIcon size={14} />} loading={readme.isPending && readme.variables === 'readme'} disabled={!d.access.canEdit} disabledReason="Only the team can draft docs" onClick={() => readme.mutate('readme')}>
                Draft README
              </Button>
              <Button loading={readme.isPending && readme.variables === 'case_study'} disabled={!d.access.canEdit} disabledReason="Only the team can draft docs" onClick={() => readme.mutate('case_study')}>
                Draft case study
              </Button>
            </div>
            {readme.data && <Result r={readme.data} />}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
