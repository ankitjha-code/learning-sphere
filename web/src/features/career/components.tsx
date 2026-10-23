import { Fragment, type ReactNode } from 'react';
import clsx from 'clsx';
import { SealCheckIcon, CheckCircleIcon, CircleDashedIcon, UserIcon, MinusCircleIcon, ArrowsClockwiseIcon } from '@phosphor-icons/react';
import { Badge, Banner, ProvenanceTag, Progress, Tooltip } from '@/components/ui';
import type { AiFailure, GapStatus } from './api';
import { PLACEHOLDER_RE } from './api';

const GAP_META: Record<GapStatus, { label: string; tone: 'success' | 'accent' | 'info' | 'neutral' | 'danger'; icon: ReactNode; hint: string }> = {
  verified: { label: 'Verified', tone: 'success', icon: <SealCheckIcon size={12} weight="fill" />, hint: 'Proven by graded work or a reviewer' },
  demonstrated: { label: 'Demonstrated', tone: 'accent', icon: <CheckCircleIcon size={12} />, hint: 'Shown in practice, quizzes or projects' },
  learning: { label: 'Learning', tone: 'info', icon: <CircleDashedIcon size={12} />, hint: 'Some evidence, still below the bar' },
  self_reported: { label: 'Self-reported', tone: 'neutral', icon: <UserIcon size={12} />, hint: 'Only your own rating so far' },
  none: { label: 'No evidence', tone: 'danger', icon: <MinusCircleIcon size={12} />, hint: 'Nothing recorded yet' },
};

export function GapBadge({ status, revisionDue }: { status: GapStatus; revisionDue?: boolean }) {
  const m = GAP_META[status];
  return (
    <span className="inline-flex items-center gap-1">
      <Tooltip content={m.hint}>
        <span tabIndex={0}>
          <Badge tone={m.tone} icon={m.icon}>
            {m.label}
          </Badge>
        </span>
      </Tooltip>
      {revisionDue && (
        <Badge tone="warning" icon={<ArrowsClockwiseIcon size={12} />}>
          Revision due
        </Badge>
      )}
    </span>
  );
}

export function ReadinessMeter({ score, label = 'Readiness', size = 'md' }: { score: number | null; label?: string; size?: 'sm' | 'md' }) {
  if (score === null) return <span className="text-[13px] text-subtle">No skills found yet</span>;
  const tone = score >= 70 ? 'success' : score >= 40 ? 'accent' : 'warning';
  return (
    <div className={clsx('min-w-0', size === 'md' ? 'w-full' : 'w-32')}>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[12.5px] text-muted">
        <span>{label}</span>
        <span className="font-semibold tabular-nums text-fg">{score}%</span>
      </div>
      <Progress value={score} tone={tone} label={`${label} ${score}%`} />
    </div>
  );
}

export function AiUnavailable({ failure, className }: { failure: AiFailure; className?: string }) {
  const title = failure.reason === 'not_configured' ? 'AI is not set up on this server' : failure.reason === 'quota_exceeded' ? 'AI quota used up' : 'AI is unavailable right now';
  return (
    <Banner tone="warning" title={title} className={className}>
      {failure.message} The non-AI tools on this page still work.
    </Banner>
  );
}

export function AiDraftLabel({ text = 'AI draft: review every claim before using it.' }: { text?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
      <ProvenanceTag kind="ai" />
      <span>{text}</span>
    </div>
  );
}

/** Renders text with [Add: ...] placeholders highlighted so missing facts are obvious. */
export function HighlightedDraft({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\[Add: [^\]]+\])/g);
  return (
    <div className={clsx('whitespace-pre-wrap text-[14px] leading-relaxed', className)}>
      {parts.map((p, i) =>
        /^\[Add: [^\]]+\]$/.test(p) ? (
          <mark key={i} className="rounded bg-warning-soft px-1 text-warning">
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </div>
  );
}

export function countPlaceholders(text: string) {
  return (text.match(PLACEHOLDER_RE) ?? []).length;
}

export function SampleTag({ show }: { show: boolean }) {
  return show ? <ProvenanceTag kind="sample" /> : null;
}
