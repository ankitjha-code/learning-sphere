import { useState, type ReactNode, type HTMLAttributes } from 'react';
import clsx from 'clsx';
import { Tabs as RTabs, Tooltip as RTooltip } from 'radix-ui';
import {
  CheckIcon,
  CopyIcon,
  InfoIcon,
  WarningIcon,
  WarningOctagonIcon,
  CheckCircleIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ArrowClockwiseIcon,
  LockKeyIcon,
  CircleNotchIcon,
} from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { errorMessage, ApiError } from '@/lib/api';

// ---------- Spinner & skeleton ----------

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <CircleNotchIcon size={size} className={clsx('animate-spin', className)} role="status" aria-label="Loading" />;
}

export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('skeleton', className)} aria-hidden {...rest} />;
}

export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={clsx('space-y-2.5', className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}

// ---------- Card ----------

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('rounded-lg border border-border bg-surface shadow-1', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex flex-col gap-2 px-5 pt-5 pb-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4', className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold leading-6 tracking-[-0.01em]">{title}</h3>
        {description && <p className="mt-0.5 text-[13px] leading-5 text-muted">{description}</p>}
      </div>
      {action && (
        // When stacked on phones, pull a leading CardAction back so its text lines up with the title.
        <div className="-my-0.5 flex shrink-0 flex-wrap items-center gap-1 max-sm:[&>[data-card-action]:first-child]:-ml-2">{action}</div>
      )}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('px-5 pb-5', className)}>{children}</div>;
}

/** The one style for "see all / manage / open" links in card and section headers. */
export function CardAction({ to, children, onClick }: { to?: string; children: ReactNode; onClick?: () => void }) {
  const cls =
    'group -mr-2 inline-flex h-7 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-accent-text transition-colors hover:bg-accent-soft';
  const inner = (
    <>
      {children}
      <CaretRightIcon size={12} weight="bold" className="transition-transform group-hover:translate-x-0.5" aria-hidden />
    </>
  );
  return to ? (
    <Link to={to} className={cls} data-card-action="">
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls} data-card-action="">
      {inner}
    </button>
  );
}

/** A titled block of a page. Keeps spacing between sections identical everywhere. */
export function Section({ title, description, action, children, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold leading-6 tracking-[-0.01em]">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
      </div>
      {children}
    </section>
  );
}

// ---------- Badges ----------

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'xp';
const toneClass: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted border-border',
  accent: 'bg-accent-soft text-accent-text border-transparent',
  success: 'bg-success-soft text-success border-transparent',
  warning: 'bg-warning-soft text-warning border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
  info: 'bg-info-soft text-info border-transparent',
  xp: 'bg-warning-soft text-xp border-transparent',
};

export function Badge({ tone = 'neutral', children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[11.5px] font-medium leading-none whitespace-nowrap [&_svg]:shrink-0',
        toneClass[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Maps common workflow statuses to a semantic tone + human label. */
const STATUS: Record<string, [Tone, string]> = {
  draft: ['neutral', 'Draft'],
  published: ['success', 'Published'],
  closed: ['neutral', 'Closed'],
  archived: ['neutral', 'Archived'],
  active: ['success', 'Active'],
  open: ['info', 'Open'],
  in_progress: ['info', 'In progress'],
  submitted: ['info', 'Submitted'],
  grading: ['info', 'Grading'],
  needs_review: ['warning', 'Needs review'],
  graded: ['success', 'Graded'],
  released: ['success', 'Released'],
  returned: ['warning', 'Returned'],
  completed: ['success', 'Completed'],
  failed: ['danger', 'Failed'],
  retrying: ['warning', 'Retrying'],
  queued: ['neutral', 'Queued'],
  running: ['info', 'Running'],
  succeeded: ['success', 'Succeeded'],
  cancelled: ['neutral', 'Cancelled'],
  accepted: ['success', 'Accepted'],
  rejected: ['danger', 'Rejected'],
  withdrawn: ['neutral', 'Withdrawn'],
  pending: ['warning', 'Pending'],
  scheduled: ['info', 'Scheduled'],
  not_configured: ['warning', 'Not configured'],
  captured_locally: ['info', 'Captured locally'],
  not_started: ['neutral', 'Not started'],
  needs_revision: ['warning', 'Needs revision'],
  planning: ['neutral', 'Planning'],
  building: ['info', 'Building'],
  review: ['warning', 'In review'],
  requested: ['warning', 'Requested'],
  declined: ['neutral', 'Declined'],
  ended: ['neutral', 'Ended'],
  hired: ['success', 'Hired'],
  offer: ['success', 'Offer'],
  interview: ['info', 'Interview'],
  applied: ['info', 'Applied'],
  saved: ['neutral', 'Saved'],
  invited: ['info', 'Invited'],
  expired: ['neutral', 'Expired'],
  suspended: ['danger', 'Suspended'],
  extended: ['info', 'Extended'],
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const [tone, label] = STATUS[status] ?? ['neutral', status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())];
  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  );
}

// ---------- Page header ----------

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  badge,
  hero,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  badge?: ReactNode;
  /** Workspace home pages: render the header as the ink "Nexus band". */
  hero?: boolean;
  /** Hero only: content shown inside the band under the title (usually StatTiles). */
  children?: ReactNode;
}) {
  // Title and actions share a row (actions centred on the title); the description
  // runs underneath. On phones the actions drop below the description.
  const body = (
    <>
      {breadcrumb && <div className="mb-3 text-[13px] font-medium text-muted">{breadcrumb}</div>}
      <div className="grid gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-8">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 sm:col-start-1 sm:row-start-1">
          <h1 className={clsx('font-display font-semibold leading-[1.15] tracking-[-0.025em]', hero ? 'text-[28px] sm:text-[34px]' : 'text-[26px] sm:text-[30px]')}>{title}</h1>
          {badge}
        </div>
        {description && <p className="max-w-[72ch] text-[14.5px] leading-relaxed text-muted sm:col-start-1 sm:row-start-2">{description}</p>}
        {actions && <div className="mt-2 flex flex-wrap items-center gap-2 sm:col-start-2 sm:row-start-1 sm:mt-0 sm:justify-end sm:self-center">{actions}</div>}
      </div>
    </>
  );
  if (hero) {
    // data-theme="dark" scopes the dark tokens to the band, so buttons, badges and
    // stat tiles inside it restyle themselves without special variants.
    return (
      <header data-theme="dark" className="nexus-band rise mb-8 rounded-xl px-5 py-7 text-fg shadow-2 sm:px-8 sm:py-8">
        {body}
        {children && <div className="mt-7">{children}</div>}
      </header>
    );
  }
  return <header className="rise mb-7">{body}</header>;
}

// ---------- Empty, error, banner ----------

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  inline,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
  /** Inside a card or panel: no border or background of its own, less padding. */
  inline?: boolean;
}) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center',
        inline ? 'px-4 py-8' : 'rounded-lg border border-dashed border-border-strong/70 bg-surface/60 px-6 py-12',
        className,
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] bg-accent-soft text-accent-text ring-4 ring-accent-soft/50">{icon}</div>
      <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
      <p className="mt-1 max-w-md text-[13.5px] leading-relaxed text-muted">{description}</p>
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Banner({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = { info: InfoIcon, warning: WarningIcon, danger: WarningOctagonIcon, success: CheckCircleIcon }[tone];
  const cls = {
    info: 'bg-info-soft text-info border-info/15',
    warning: 'bg-warning-soft text-warning border-warning/20',
    danger: 'bg-danger-soft text-danger border-danger/20',
    success: 'bg-success-soft text-success border-success/20',
  }[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={clsx('flex items-start gap-3 rounded-lg border px-4 py-3 text-[13.5px]', cls, className)}>
      <Icon size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-fg">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={clsx(title && 'mt-0.5', 'text-muted')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Inline recoverable error with retry. Shows the role needed for permission errors. */
export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const isForbidden = error instanceof ApiError && error.status === 403;
  if (isForbidden) {
    return (
      <div className={clsx('flex flex-col items-center rounded-lg border border-border bg-surface px-6 py-12 text-center', className)}>
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] bg-warning-soft text-warning">
          <LockKeyIcon size={22} />
        </div>
        <h3 className="text-[15px] font-semibold">You don't have access to this</h3>
        <p className="mt-1 max-w-md text-[13.5px] text-muted">{errorMessage(error)}</p>
      </div>
    );
  }
  return (
    <Banner
      tone="danger"
      title="Couldn't load this"
      className={className}
      action={
        onRetry && (
          <button onClick={onRetry} className="inline-flex items-center gap-1 text-[13px] font-medium text-fg underline-offset-2 hover:underline">
            <ArrowClockwiseIcon size={14} /> Retry
          </button>
        )
      }
    >
      {errorMessage(error)}
    </Banner>
  );
}

// ---------- Misc ----------

export function CopyButton({ value, label = 'Copy', className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked; user can select the text */
        }
      }}
      className={clsx('inline-flex items-center gap-1 rounded px-1.5 py-1 text-[12px] text-muted hover:bg-surface-2 hover:text-fg', className)}
      aria-label={copied ? 'Copied' : label}
    >
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      {copied ? 'Copied' : label}
    </button>
  );
}

/** White or near-black initials, whichever has the better contrast on the avatar colour (WCAG AA). */
function initialsColor(bg: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg);
  if (!m) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (lum + 0.05) >= 4.5 ? '#ffffff' : '#16181d';
}

export function Avatar({ name, color, size = 28, className }: { name: string; color?: string | null; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  // Initials are drawn with CSS generated content: avatars are decorative (the name is always shown or labelled nearby).
  return (
    <span
      className={clsx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold before:content-[attr(data-initials)]', className)}
      data-initials={initials}
      style={{ width: size, height: size, fontSize: size * 0.4, background: color ?? '#2f4fd6', color: initialsColor(color ?? '#2f4fd6') }}
      aria-hidden
    />
  );
}

export function Progress({ value, max = 100, className, tone = 'accent', label }: { value: number; max?: number; className?: string; tone?: 'accent' | 'success' | 'warning' | 'xp'; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const bar = { accent: 'bg-accent', success: 'bg-success', warning: 'bg-warning', xp: 'bg-xp' }[tone];
  return (
    <div
      className={clsx('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'Progress'}
    >
      <div className={clsx('h-full rounded-full transition-[width] duration-500', bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-2 px-1 font-mono text-[11px] text-muted">
      {children}
    </kbd>
  );
}

export function StatTile({ label, value, hint, icon, tone }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'accent' | 'xp' | 'success' | 'warning' }) {
  // Values stay ink so a row of tiles reads evenly; the icon chip carries the meaning colour.
  const chip = tone
    ? { accent: 'bg-accent-soft text-accent-text', xp: 'bg-warning-soft text-xp', success: 'bg-success-soft text-success', warning: 'bg-warning-soft text-warning' }[tone]
    : 'bg-surface-2 text-subtle ring-1 ring-inset ring-border';
  return (
    <div className="flex h-full min-w-0 flex-col rounded-lg border border-border bg-surface p-4 shadow-1">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <span className="min-w-0 text-[13px] font-medium leading-5 text-muted">{label}</span>
        {icon && <span className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-md [&_svg]:h-4 [&_svg]:w-4', chip)}>{icon}</span>}
      </div>
      <div className="mt-2 font-display text-[28px] font-semibold leading-9 tracking-[-0.02em] tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-[12.5px] leading-5 text-subtle">{hint}</div>}
    </div>
  );
}

export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <RTooltip.Root delayDuration={300}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          className="z-[60] max-w-xs rounded-md bg-fg px-2.5 py-1.5 text-[12px] font-medium text-bg shadow-2"
        >
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export const TooltipProvider = RTooltip.Provider;

// ---------- Tabs ----------

export function Tabs({
  value,
  onValueChange,
  tabs,
  className,
  wrap,
}: {
  value: string;
  onValueChange: (v: string) => void;
  tabs: { value: string; label: ReactNode; count?: number }[];
  className?: string;
  /** Let tabs wrap onto a second line instead of scrolling (for narrow columns with many tabs). */
  wrap?: boolean;
}) {
  return (
    <RTabs.Root value={value} onValueChange={onValueChange} className={className}>
      <RTabs.List
        className={clsx(
          'flex gap-1 border-b border-border',
          wrap ? 'flex-wrap' : 'overflow-x-auto [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] pr-6',
        )}
        aria-label="Sections"
      >
        {tabs.map((t) => (
          <RTabs.Trigger
            key={t.value}
            value={t.value}
            className="relative -mb-px inline-flex h-10 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 text-[13.5px] font-medium text-muted transition-colors hover:text-fg data-[state=active]:border-accent data-[state=active]:text-fg"
          >
            {t.label}
            {t.count !== undefined && <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-surface-3 px-1.5 text-[11px] font-semibold tabular-nums text-muted">{t.count}</span>}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {/* Content renders below the tab list; these panels give each tab a valid aria-controls target. */}
      {tabs.map((t) => (
        <RTabs.Content key={t.value} value={t.value} className="sr-only" tabIndex={-1} />
      ))}
    </RTabs.Root>
  );
}

// ---------- Pagination ----------

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return total > 0 ? <p className="mt-3 text-[12.5px] text-subtle">{total} total</p> : null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="mt-4 flex items-center justify-between text-[13px] text-muted" aria-label="Pagination">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-surface px-2.5 font-medium text-fg shadow-1 hover:bg-surface-2 disabled:opacity-50"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
        >
          <CaretLeftIcon size={14} /> Previous
        </button>
        <span className="px-2 tabular-nums">
          {page} / {pages}
        </span>
        <button
          className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-surface px-2.5 font-medium text-fg shadow-1 hover:bg-surface-2 disabled:opacity-50"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
        >
          Next <CaretRightIcon size={14} />
        </button>
      </div>
    </nav>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <h2 className="text-[16px] font-semibold tracking-[-0.01em]">{children}</h2>
      {action}
    </div>
  );
}

/** Labels content whose origin matters (AI vs verified, sample data). */
export function ProvenanceTag({ kind }: { kind: 'ai' | 'verified' | 'self' | 'sample' | 'estimate' | 'reviewer' }) {
  const map = {
    ai: ['info', 'AI generated'],
    verified: ['success', 'Verified'],
    self: ['neutral', 'Self-reported'],
    sample: ['warning', 'Sample data'],
    estimate: ['warning', 'Estimate'],
    reviewer: ['success', 'Reviewer confirmed'],
  } as const;
  const [tone, label] = map[kind];
  return <Badge tone={tone}>{label}</Badge>;
}
