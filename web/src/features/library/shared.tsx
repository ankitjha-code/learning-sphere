import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { toast } from 'sonner';
import type { Icon } from '@phosphor-icons/react';
import {
  ArticleIcon,
  VideoIcon,
  FileTextIcon,
  ListChecksIcon,
  GraduationCapIcon,
  CodeIcon,
  ChatsCircleIcon,
  LinkSimpleIcon,
  BookmarkSimpleIcon,
  StarIcon,
  CheckCircleIcon,
  BuildingsIcon,
} from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { Badge, Card } from '@/components/ui';

export type ResourceCard = {
  id: string;
  kind: string;
  title: string;
  summary: string;
  url: string | null;
  sourceName: string | null;
  license: string | null;
  topics: string[];
  languages: string[];
  roles: string[];
  difficulty: string;
  skills: { slug: string; name: string }[];
  orgId: string | null;
  orgName: string | null;
  status: string;
  version: number;
  downloadable: boolean;
  hasBody: boolean;
  body?: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  viewCount: number;
  lastReviewedAt: string | null;
  isSample: boolean;
  createdAt: string;
  updatedAt: string;
  bookmark: { id: string; collection: string | null } | null;
  completed: boolean;
  lastOpenedAt: string | null;
  myRating: number | null;
};

export type Collection = { name: string | null; count: number };

export const KIND_LABEL: Record<string, string> = {
  article: 'Article',
  video: 'Video',
  docs: 'Docs',
  cheatsheet: 'Cheatsheet',
  course: 'Course',
  exercise: 'Exercise',
  interview: 'Interview prep',
  link: 'Link',
};

const KIND_ICON: Record<string, Icon> = {
  article: ArticleIcon,
  video: VideoIcon,
  docs: FileTextIcon,
  cheatsheet: ListChecksIcon,
  course: GraduationCapIcon,
  exercise: CodeIcon,
  interview: ChatsCircleIcon,
  link: LinkSimpleIcon,
};

export function kindLabel(kind: string) {
  return KIND_LABEL[kind] ?? kind.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function KindIcon({ kind, size = 18, className }: { kind: string; size?: number; className?: string }) {
  const I = KIND_ICON[kind] ?? FileTextIcon;
  return <I size={size} className={className} aria-hidden />;
}

export function difficultyTone(d: string): 'success' | 'warning' | 'danger' | 'neutral' {
  return d === 'beginner' ? 'success' : d === 'intermediate' ? 'warning' : d === 'advanced' ? 'danger' : 'neutral';
}

export function cap(s: string) {
  return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  return <Badge tone={difficultyTone(difficulty)}>{cap(difficulty)}</Badge>;
}

export function RatingInline({ avg, count, className }: { avg: number | null; count: number; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 text-[12.5px] text-muted', className)}>
      <StarIcon size={13} weight={avg ? 'fill' : 'regular'} className={avg ? 'text-xp' : 'text-subtle'} aria-hidden />
      {avg ? (
        <>
          <span className="font-medium text-fg tabular-nums">{avg.toFixed(1)}</span>
          <span className="tabular-nums">({count})</span>
        </>
      ) : (
        <span>No ratings yet</span>
      )}
    </span>
  );
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function formatBytes(n: number | null | undefined) {
  if (n === null || n === undefined) return 'Unknown size';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Bookmark toggle with optimistic update across every cached list of cards.
 * Lists store `{ items: ResourceCard[] }`; detail stores `{ resource: ResourceCard }`.
 */
export function useBookmarkToggle() {
  const qc = useQueryClient();
  const patchCaches = (id: string, bookmark: ResourceCard['bookmark']) => {
    const patchCard = (c: ResourceCard) => (c.id === id ? { ...c, bookmark } : c);
    qc.setQueriesData<{ items: ResourceCard[] }>({ queryKey: ['library', 'resources'] }, (old) =>
      old?.items ? { ...old, items: old.items.map(patchCard) } : old,
    );
    for (const k of ['related', 'prerequisites']) {
      qc.setQueriesData<{ items: ResourceCard[] }>({ queryKey: ['library', k] }, (old) => (old?.items ? { ...old, items: old.items.map(patchCard) } : old));
    }
    qc.setQueryData<{ resource: ResourceCard }>(['library', 'resource', id], (old) => (old ? { resource: { ...old.resource, bookmark } } : old));
  };
  return useMutation({
    /** `collection` undefined toggles; a string or null saves into that collection (null = Unsorted). */
    mutationFn: async ({ card, collection }: { card: ResourceCard; collection?: string | null }): Promise<{ bookmark: ResourceCard['bookmark'] }> => {
      if (collection === undefined && card.bookmark) {
        await api.del<{ ok: true }>(`/library/resources/${card.id}/bookmark`);
        return { bookmark: null };
      }
      return api.put<{ bookmark: { id: string; collection: string | null } }>(`/library/resources/${card.id}/bookmark`, { collection: collection ?? null });
    },
    onMutate: async ({ card, collection }) => {
      await qc.cancelQueries({ queryKey: ['library'] });
      const prev = card.bookmark;
      const next = collection === undefined && card.bookmark ? null : { id: card.bookmark?.id ?? 'pending', collection: collection ?? null };
      patchCaches(card.id, next);
      return { prev };
    },
    onError: (e, { card }, ctx) => {
      patchCaches(card.id, ctx?.prev ?? null);
      toast.error(errorMessage(e));
    },
    onSuccess: (r, { card }) => {
      patchCaches(card.id, r.bookmark);
      toast.success(r.bookmark ? (r.bookmark.collection ? `Saved to ${r.bookmark.collection}` : 'Bookmarked') : 'Bookmark removed');
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['library', 'collections'] });
      qc.invalidateQueries({ queryKey: ['library', 'bookmarks'] });
    },
  });
}

export function BookmarkButton({ card, className }: { card: ResourceCard; className?: string }) {
  const toggle = useBookmarkToggle();
  const on = !!card.bookmark;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle.mutate({ card });
      }}
      disabled={toggle.isPending}
      aria-pressed={on}
      aria-label={on ? `Remove bookmark for ${card.title}` : `Bookmark ${card.title}`}
      title={on ? 'Remove bookmark' : 'Bookmark'}
      className={clsx(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-surface-2 disabled:opacity-60',
        on ? 'text-accent-text' : 'text-muted hover:text-fg',
        className,
      )}
    >
      <BookmarkSimpleIcon size={18} weight={on ? 'fill' : 'regular'} />
    </button>
  );
}

/** Compact card used on the library grid, related lists and collections. */
export function ResourceCardView({ card, compact }: { card: ResourceCard; compact?: boolean }) {
  return (
    <Card className="group relative flex h-full flex-col p-5 transition-colors hover:border-border-strong">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
          <KindIcon kind={card.kind} />
        </div>
        <div className="min-w-0 flex-1 text-[12.5px] leading-tight">
          <div className="font-medium text-fg">{kindLabel(card.kind)}</div>
          {card.sourceName && <div className="mt-0.5 truncate text-subtle">{card.sourceName}</div>}
        </div>
        <BookmarkButton card={card} className="relative z-10 -mr-1.5 self-start" />
      </div>
      <Link to={`/app/library/${card.id}`} className="mt-3.5 line-clamp-2 text-[14.5px] font-semibold leading-snug tracking-[-0.005em] text-fg after:absolute after:inset-0 group-hover:text-accent-text">
        {card.title}
      </Link>
      {!compact && card.summary && <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted">{card.summary}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        <DifficultyBadge difficulty={card.difficulty} />
        {card.orgName && (
          <Badge tone="info" icon={<BuildingsIcon size={11} />}>
            {card.orgName}
          </Badge>
        )}
        {card.isSample && <Badge tone="warning">Sample</Badge>}
        <RatingInline avg={card.ratingAvg} count={card.ratingCount} />
        {card.completed && (
          <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-success">
            <CheckCircleIcon size={14} weight="fill" aria-hidden /> Completed
          </span>
        )}
      </div>
    </Card>
  );
}

/** One row of a compact resource list inside a card (no nested cards). */
export function ResourceRow({ card }: { card: ResourceCard }) {
  return (
    <li className="group relative flex items-start gap-3 px-5 py-3 transition-colors hover:bg-surface-2">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
        <KindIcon kind={card.kind} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <Link to={`/app/library/${card.id}`} className="block text-[13.5px] font-medium leading-snug after:absolute after:inset-0 group-hover:text-accent-text">
          {card.title}
        </Link>
        <span className="mt-0.5 block truncate text-[12px] text-subtle">
          {kindLabel(card.kind)}
          {card.sourceName && <> · {card.sourceName}</>}
        </span>
      </span>
      <BookmarkButton card={card} className="relative z-10 -mr-2 -mt-1" />
    </li>
  );
}
