import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowSquareOutIcon, CheckCircleIcon, MinusCircleIcon, WarningIcon, MapPinIcon } from '@phosphor-icons/react';
import { timeAgo, formatDateTime } from '@/lib/format';
import { Badge, Tooltip, buttonClass } from '@/components/ui';

export type Attribution = { source: string; label: string; homepage: string; applyLabel: string; text: string };
export type ExternalJob = {
  id: string;
  source: string;
  title: string;
  company: string;
  location: string | null;
  url: string;
  tags: string[];
  publishedAt: string | null;
  fetchedAt: string;
  expiresAt: string | null;
  description?: string | null;
  attribution: Attribution;
  saved?: boolean;
};
export type FeedSource = {
  source: string;
  label: string;
  homepage: string;
  enabled: boolean;
  lastSuccessAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  cachedJobs: number;
  terms?: string;
  backgroundSync?: boolean;
  limits?: { minIntervalMinutes: number; maxPerDay: number };
  nextAllowedAt?: string | null;
  lastAttemptAt?: string | null;
};
export type MatchFactor = { label: string; met: boolean; evidence: string; status: string; required: boolean };
export type Match = { score: number; hasSkills: boolean; factors: MatchFactor[]; missing: string[]; note: string; skillsSource: string };

export const WORKPLACE_LABEL: Record<string, string> = { onsite: 'Onsite', hybrid: 'Hybrid', remote: 'Remote' };
export const TYPE_LABEL: Record<string, string> = { full_time: 'Full-time', internship: 'Internship', contract: 'Contract', part_time: 'Part-time' };

/** Visible credit on every external job: "Listed on <source>, fetched <time>" with a link to the source. */
export function SourceCredit({ job, className }: { job: Pick<ExternalJob, 'attribution' | 'fetchedAt'>; className?: string }) {
  return (
    <div className={clsx('text-[12px] text-muted', className)}>
      Listed on{' '}
      <a href={job.attribution.homepage} target="_blank" rel="noopener noreferrer" className="font-medium text-fg underline-offset-2 hover:underline">
        {job.attribution.label}
      </a>
      , fetched <Tooltip content={formatDateTime(job.fetchedAt)}><span tabIndex={0}>{timeAgo(job.fetchedAt)}</span></Tooltip>
    </div>
  );
}

/** One external listing as a row inside a list group (`<ul>` with divide-y). */
export function ExternalJobRow({ job, to, actions, showCredit = true }: { job: ExternalJob; to?: string; actions?: React.ReactNode; showCredit?: boolean }) {
  const titleCls = 'text-[14.5px] font-semibold tracking-[-0.005em] hover:text-accent-text';
  return (
    <li className="px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          {to ? (
            <Link to={to} className={titleCls}>
              {job.title}
            </Link>
          ) : (
            <a href={job.url} target="_blank" rel="noopener noreferrer" className={titleCls}>
              {job.title}
            </a>
          )}
          <div className="mt-0.5 text-[13px] text-muted">
            {job.company}
            {job.location && (
              <>
                {' '}
                · <MapPinIcon size={12} className="inline align-[-1px]" aria-hidden /> {job.location}
              </>
            )}
            {job.publishedAt && <> · posted {timeAgo(job.publishedAt)}</>}
          </div>
          {job.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {job.tags.slice(0, 6).map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </div>
          )}
        </div>
        <a href={job.url} target="_blank" rel="noopener noreferrer" className={clsx(buttonClass('secondary', 'sm'), 'self-start')}>
          {job.attribution.applyLabel} <ArrowSquareOutIcon size={14} />
        </a>
      </div>
      {(showCredit || actions) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {showCredit ? <SourceCredit job={job} /> : <span />}
          {actions}
        </div>
      )}
    </li>
  );
}

export function FeedStatusList({ sources, syncOff }: { sources: FeedSource[]; syncOff?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-2 text-[12.5px]">
      {sources.map((s) => (
        <li key={s.source} className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 shadow-1">
          {!s.enabled ? <MinusCircleIcon size={14} className="text-subtle" /> : s.lastStatus === 'error' ? <WarningIcon size={14} className="text-warning" /> : <CheckCircleIcon size={14} className="text-success" />}
          <a href={s.homepage} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
            {s.label}
          </a>
          <span className="text-muted">
            {!s.enabled
              ? 'disabled on this server'
              : s.lastSuccessAt
                ? `${s.cachedJobs} jobs · synced ${timeAgo(s.lastSuccessAt)}${s.lastStatus === 'error' ? ' · last sync failed' : ''}`
                : s.lastStatus === 'error'
                  ? 'sync failing, no jobs yet'
                  : syncOff
                    ? 'automatic sync is turned off on this server'
                    : 'not synced yet'}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function MatchChips({ match, max = 4 }: { match: Match; max?: number }) {
  if (!match.hasSkills) return <span className="text-[12px] text-subtle">No skills listed to match</span>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Tooltip content={match.note}>
        <span tabIndex={0}>
          <Badge tone={match.score >= 70 ? 'success' : match.score >= 40 ? 'accent' : 'warning'}>Evidence match {match.score}%</Badge>
        </span>
      </Tooltip>
      {match.factors.slice(0, max).map((f) => (
        <Tooltip key={f.label} content={f.evidence}>
          <span tabIndex={0}>
            <Badge tone={f.met ? 'success' : f.status === 'none' ? 'neutral' : 'info'} icon={f.met ? <CheckCircleIcon size={11} /> : undefined}>
              {f.label}
            </Badge>
          </span>
        </Tooltip>
      ))}
      {match.factors.length > max && <span className="text-[12px] text-subtle">+{match.factors.length - max} more</span>}
    </div>
  );
}
