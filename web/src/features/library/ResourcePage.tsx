import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  ArrowSquareOutIcon,
  BookmarkSimpleIcon,
  BooksIcon,
  BuildingsIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CircleIcon,
  DownloadSimpleIcon,
  FlagIcon,
  FolderIcon,
  NotePencilIcon,
  PlusIcon,
  SparkleIcon,
  StarIcon,
  TrashIcon,
  TreeStructureIcon,
} from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import {
  Badge,
  Banner,
  Button,
  ButtonLink,
  buttonClass,
  Card,
  CardAction,
  CardBody,
  CardHeader,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Markdown,
  PageHeader,
  Popover,
  PopoverClose,
  ProvenanceTag,
  Select,
  Skeleton,
  SkeletonRows,
  Textarea,
} from '@/components/ui';
import { DifficultyBadge, KindIcon, kindLabel, RatingInline, ResourceRow, cap, useBookmarkToggle, type Collection, type ResourceCard } from './shared';

type RateResponse = { myRating: number; ratingCount: number; ratingAvg: number | null };

export default function ResourcePage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const key = ['library', 'resource', id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<{ resource: ResourceCard }>(`/library/resources/${id}`) });

  const setResource = (patch: Partial<ResourceCard>) =>
    qc.setQueryData<{ resource: ResourceCard }>(key, (old) => (old ? { resource: { ...old.resource, ...patch } } : old));

  const complete = useMutation({
    mutationFn: (completed: boolean) => api.post<{ completed: boolean }>(`/library/resources/${id}/complete`, { completed }),
    onSuccess: (r) => {
      setResource({ completed: r.completed });
      qc.invalidateQueries({ queryKey: ['library', 'history'] });
      qc.invalidateQueries({ queryKey: ['library', 'resources'] });
      toast.success(r.completed ? 'Marked as completed' : 'Marked as not completed');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data)
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-[480px] rounded-lg" />
      </div>
    );

  const r = q.data.resource;
  const urlOnly = !r.body && !!r.url;
  const source = r.sourceName ?? (r.orgName ? r.orgName : 'LearnSphere Nexus');
  const encTitle = encodeURIComponent(r.title);
  // External-only resources have little main content, so their details sit in the main column to keep both columns balanced.
  const about = (
    <Card>
      <CardHeader title="About this resource" />
      <CardBody>
        <dl className="space-y-2.5 text-[13px]">
          <Row label="Source">{source}</Row>
          <Row label="License">{r.license ?? <span className="text-subtle">License not specified</span>}</Row>
          <Row label="Last reviewed">{r.lastReviewedAt ? formatDate(r.lastReviewedAt) : <span className="text-subtle">Not reviewed yet</span>}</Row>
          <Row label="Version">v{r.version}</Row>
          <Row label="Views">{r.viewCount}</Row>
        </dl>
        {(r.topics.length > 0 || r.skills.length > 0) && (
          <div className="-mx-5 mt-4 flex flex-wrap gap-1.5 border-t border-border px-5 pt-4">
            {r.skills.map((s) => (
              <Link key={s.slug} to={`/app/skills/${s.slug}`}>
                <Badge tone="accent">{s.name}</Badge>
              </Link>
            ))}
            {r.topics.map((t) => (
              <Link key={t} to={`/app/library?topic=${encodeURIComponent(t)}`}>
                <Badge>{cap(t)}</Badge>
              </Link>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        breadcrumb={
          <nav className="flex min-w-0 items-center gap-1" aria-label="Breadcrumb">
            <Link to="/app/library" className="shrink-0 hover:text-fg">
              Library
            </Link>
            <CaretRightIcon size={12} className="shrink-0" aria-hidden />
            <span className="truncate text-fg">{r.title}</span>
          </nav>
        }
        title={r.title}
        description={
          <span className="block">
            {r.summary && <span className="block">{r.summary}</span>}
            <span className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]', r.summary && 'mt-2.5')}>
              <span className="inline-flex items-center gap-1.5">
                <KindIcon kind={r.kind} size={15} /> {kindLabel(r.kind)}
              </span>
              <DifficultyBadge difficulty={r.difficulty} />
              {r.orgName && (
                <Badge tone="info" icon={<BuildingsIcon size={11} />}>
                  {r.orgName}
                </Badge>
              )}
              {r.isSample && <ProvenanceTag kind="sample" />}
              {r.completed && (
                <Badge tone="success" icon={<CheckCircleIcon size={11} weight="fill" />}>
                  Completed
                </Badge>
              )}
              <RatingInline avg={r.ratingAvg} count={r.ratingCount} />
            </span>
          </span>
        }
      />

      <div className="mb-8 flex flex-wrap gap-2">
        <SaveToCollection card={r} />
        <Button
          variant={r.completed ? 'soft' : 'secondary'}
          icon={r.completed ? <CheckCircleIcon size={16} weight="fill" /> : <CircleIcon size={16} />}
          loading={complete.isPending}
          aria-pressed={r.completed}
          onClick={() => complete.mutate(!r.completed)}
        >
          {r.completed ? 'Completed' : 'Mark completed'}
        </Button>
        <ButtonLink
          to={`/app/workspace?new=note&linkType=resource&linkId=${r.id}&linkLabel=${encTitle}`}
          icon={<NotePencilIcon size={16} />}
        >
          Take a note
        </ButtonLink>
        <ButtonLink to={`/app/ai?assistant=study_assistant&context=resource:${r.id}&label=${encTitle}`} icon={<SparkleIcon size={16} />}>
          Ask the study assistant
        </ButtonLink>
        {r.downloadable && (
          <a href={`/api/library/resources/${r.id}/download`} className={buttonClass('secondary', 'md')} download>
            <DownloadSimpleIcon size={16} aria-hidden /> Download
          </a>
        )}
        <ReportDialogButton resourceId={r.id} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          {urlOnly ? (
            <Card className="p-6">
              <div className="flex flex-col items-start gap-3">
                <p className="text-[14px] text-muted">This resource lives on an external site. It opens in a new tab.</p>
                <a href={r.url!} target="_blank" rel="noopener noreferrer" className={buttonClass('primary', 'lg')}>
                  Open on {source} <ArrowSquareOutIcon size={16} aria-hidden />
                </a>
                <p className="text-[12.5px] text-subtle">
                  Content by {source}. {r.license ? `License: ${r.license}.` : 'License not specified.'} LearnSphere Nexus links to it and does not host a copy.
                </p>
              </div>
            </Card>
          ) : r.body ? (
            <article>
              <Markdown source={r.body} />
              {r.url && (
                <p className="mt-6 text-[13px] text-muted">
                  Original source:{' '}
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline">
                    {source} <ArrowSquareOutIcon size={13} aria-hidden />
                  </a>
                </p>
              )}
            </article>
          ) : (
            <EmptyState
              icon={<BooksIcon size={22} />}
              title="No content yet"
              description="This resource has no body or link. Let the author know with a correction report."
              action={<ReportDialogButton resourceId={r.id} variant="primary" />}
            />
          )}

          {urlOnly && about}
          <RateResource card={r} onRated={(x) => setResource({ myRating: x.myRating, ratingAvg: x.ratingAvg, ratingCount: x.ratingCount })} />
        </div>

        <aside className="space-y-5">
          {!urlOnly && about}
          <Prerequisites id={r.id} />
          <Related id={r.id} />
        </aside>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-fg">{children}</dd>
    </div>
  );
}

// ---------- Rating ----------

function RateResource({ card, onRated }: { card: ResourceCard; onRated: (r: RateResponse) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const rate = useMutation({
    mutationFn: (rating: number) => api.post<RateResponse>(`/library/resources/${card.id}/rate`, { rating }),
    onSuccess: (r) => {
      onRated(r);
      toast.success(`Thanks. Average is now ${r.ratingAvg?.toFixed(1) ?? r.myRating} from ${r.ratingCount} ${r.ratingCount === 1 ? 'rating' : 'ratings'}.`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const current = card.myRating ?? 0;
  const shown = hover ?? current;
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      rate.mutate(Math.min(5, (current || 0) + 1));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      rate.mutate(Math.max(1, (current || 2) - 1));
    }
  };
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Rate this resource</h2>
          <p className="text-[13px] text-muted">
            {card.myRating ? `You rated it ${card.myRating} of 5.` : 'Your rating helps others find the best material.'}{' '}
            {card.ratingAvg !== null && `Average ${card.ratingAvg.toFixed(1)} from ${card.ratingCount}.`}
          </p>
        </div>
        <div role="radiogroup" aria-label="Your rating" className="flex items-center gap-0.5" onKeyDown={onKey} onMouseLeave={() => setHover(null)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={current === n}
              aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
              tabIndex={current ? (current === n ? 0 : -1) : n === 1 ? 0 : -1}
              disabled={rate.isPending}
              onMouseEnter={() => setHover(n)}
              onFocus={() => setHover(null)}
              onClick={() => rate.mutate(n)}
              className="rounded p-1 transition-colors hover:bg-surface-2 disabled:opacity-60"
            >
              <StarIcon size={24} weight={n <= shown ? 'fill' : 'regular'} className={n <= shown ? 'text-xp' : 'text-subtle'} />
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ---------- Save to collection ----------

function SaveToCollection({ card }: { card: ResourceCard }) {
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);
  const toggle = useBookmarkToggle();
  const cols = useQuery({
    queryKey: ['library', 'collections'],
    queryFn: () => api.get<{ collections: Collection[] }>('/library/collections'),
    enabled: open,
  });
  const save = (collection: string | null) =>
    toggle.mutate(
      { card, collection },
      {
        onSuccess: () => {
          setName('');
        },
      },
    );
  const on = !!card.bookmark;
  const named = (cols.data?.collections ?? []).filter((c) => c.name);

  return (
    <Popover
      align="start"
      className="w-72 p-3"
      trigger={
        <Button
          variant={on ? 'soft' : 'secondary'}
          icon={<BookmarkSimpleIcon size={16} weight={on ? 'fill' : 'regular'} />}
          onClick={() => setOpen(true)}
          loading={toggle.isPending}
        >
          {on ? (card.bookmark?.collection ? `Saved in ${card.bookmark.collection}` : 'Bookmarked') : 'Bookmark'}
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="text-[13px] font-semibold">Save to a collection</div>
        {cols.isLoading ? (
          <SkeletonRows rows={2} />
        ) : cols.error ? (
          <ErrorState error={cols.error} onRetry={() => cols.refetch()} />
        ) : (
          <ul className="max-h-52 space-y-0.5 overflow-y-auto">
            <li>
              <PopoverClose asChild>
                <button
                  type="button"
                  onClick={() => save(null)}
                  className={clsx(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13.5px] hover:bg-surface-2',
                    on && !card.bookmark?.collection && 'bg-accent-soft text-accent-text',
                  )}
                >
                  <FolderIcon size={15} aria-hidden /> Unsorted
                </button>
              </PopoverClose>
            </li>
            {named.map((c) => (
              <li key={c.name}>
                <PopoverClose asChild>
                  <button
                    type="button"
                    onClick={() => save(c.name)}
                    className={clsx(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13.5px] hover:bg-surface-2',
                      card.bookmark?.collection === c.name && 'bg-accent-soft text-accent-text',
                    )}
                  >
                    <FolderIcon size={15} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="text-[12px] text-subtle tabular-nums">{c.count}</span>
                  </button>
                </PopoverClose>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex gap-2 border-t border-border pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) save(name.trim());
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New collection" aria-label="New collection name" maxLength={60} />
          <Button type="submit" size="icon" variant="primary" aria-label="Create collection and save" disabled={!name.trim()} disabledReason="Type a collection name first">
            <PlusIcon size={16} />
          </Button>
        </form>
        {on && (
          <PopoverClose asChild>
            <Button variant="ghost" size="sm" icon={<TrashIcon size={14} />} onClick={() => toggle.mutate({ card })}>
              Remove bookmark
            </Button>
          </PopoverClose>
        )}
      </div>
    </Popover>
  );
}

// ---------- Report ----------

const REASONS = [
  { value: 'incorrect', label: 'Incorrect information' },
  { value: 'outdated', label: 'Outdated' },
  { value: 'broken_link', label: 'Broken link' },
  { value: 'copyright', label: 'Copyright concern' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Something else' },
];

function ReportDialogButton({ resourceId, variant = 'ghost' }: { resourceId: string; variant?: 'ghost' | 'primary' }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('incorrect');
  const [details, setDetails] = useState('');
  const m = useMutation({
    mutationFn: () => api.post<{ report: { id: string; status: string }; updated: boolean }>(`/library/resources/${resourceId}/report`, { reason, details }),
    onSuccess: (r) => {
      toast.success(r.updated ? 'Your open report was updated' : 'Thanks. The maintainers will review your report.');
      setOpen(false);
      setDetails('');
      setReason('incorrect');
      m.reset();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const fields = m.error instanceof ApiError ? m.error.fields : {};
  return (
    <>
      <Button variant={variant} icon={<FlagIcon size={16} />} onClick={() => setOpen(true)}>
        Report a correction
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) m.reset();
        }}
        title="Report a correction"
        description="Tell the maintainers what is wrong. Reports are reviewed by moderators."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={m.isPending}
              disabled={details.trim().length < 10}
              disabledReason="Describe the problem in at least 10 characters"
              onClick={() => m.mutate()}
            >
              Send report
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {m.error && !Object.keys(fields).length && <Banner tone="danger">{errorMessage(m.error)}</Banner>}
          <Field label="Reason" error={fields.reason}>
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Details" helper="What should change? Include the correct information or a working link if you have one." error={fields.details}>
            <Textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={5} maxLength={2000} />
          </Field>
        </div>
      </Dialog>
    </>
  );
}

// ---------- Side sections ----------

function Prerequisites({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ['library', 'prerequisites', id],
    queryFn: () => api.get<{ skills: { slug: string; name: string }[]; items: ResourceCard[] }>(`/library/resources/${id}/prerequisites`),
  });
  if (q.isLoading)
    return (
      <Card className="p-5">
        <SkeletonRows rows={2} />
      </Card>
    );
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data || (!q.data.skills.length && !q.data.items.length)) return null;
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-1.5"><TreeStructureIcon size={16} aria-hidden /> Learn these first</span>} />
      {q.data.skills.length > 0 && (
        <CardBody>
          <p className="mb-2 text-[12.5px] text-muted">Prerequisite skills</p>
          <div className="flex flex-wrap gap-1.5">
            {q.data.skills.map((s) => (
              <Link key={s.slug} to={`/app/skills/${s.slug}`}>
                <Badge tone="accent">{s.name}</Badge>
              </Link>
            ))}
          </div>
        </CardBody>
      )}
      {q.data.items.length > 0 ? (
        <ul className="divide-y divide-border border-t border-border">
          {q.data.items.map((c) => (
            <ResourceRow key={c.id} card={c} />
          ))}
        </ul>
      ) : (
        <CardBody>
          <p className="text-[12.5px] text-subtle">No resources for these skills yet.</p>
        </CardBody>
      )}
    </Card>
  );
}

function Related({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['library', 'related', id], queryFn: () => api.get<{ items: ResourceCard[] }>(`/library/resources/${id}/related`) });
  return (
    <Card>
      <CardHeader title="Related" action={<CardAction to="/app/library">Library</CardAction>} />
      {q.data?.items.length ? (
        <ul className="divide-y divide-border border-t border-border">
          {q.data.items.map((c) => (
            <ResourceRow key={c.id} card={c} />
          ))}
        </ul>
      ) : (
        <CardBody>
          {q.isLoading ? (
            <SkeletonRows rows={3} />
          ) : q.error ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : (
            <p className="text-[13px] text-muted">Nothing related yet.</p>
          )}
        </CardBody>
      )}
    </Card>
  );
}
