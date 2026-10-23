import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { StatusBadge } from '@/components/ui';

export type Analytics = {
  views: number;
  ratingCount: number;
  ratingAvg: number | null;
  completions: number;
  readers: number;
  bookmarks: number;
  openReports: number;
};

export type ResourceSummary = {
  id: string;
  kind: string;
  title: string;
  summary: string;
  status: 'draft' | 'in_review' | 'published' | 'archived' | 'rejected' | string;
  scope: 'org' | 'public';
  orgId: string | null;
  authorId: string | null;
  version: number;
  difficulty: string;
  url: string | null;
  sourceName: string | null;
  updatedAt: string;
  createdAt: string;
  lastReviewedAt: string | null;
  analytics: Analytics;
};

export type ResourceDetail = ResourceSummary & {
  body: string | null;
  license: string | null;
  topics: string[];
  languages: string[];
  roles: string[];
  downloadable: boolean;
  skillSlugs: string[];
};

export type ResourceDetailResponse = {
  resource: ResourceDetail;
  versions: { id: string; version: number; title: string; createdAt: string; editedBy: string | null }[];
  reviews: { id: string; decision: string; note: string | null; createdAt: string; reviewer: string | null }[];
  permissions: { canPublishDirectly: boolean; mustSubmitForReview: boolean };
};

export type Overview = {
  counts: Record<string, number>;
  totals: { views: number; ratings: number; completions: number; bookmarks: number };
  drafts: ResourceSummary[];
  inReview: ResourceSummary[];
  top: ResourceSummary[];
  paths: { total: number; published: number };
  activeOrg: { id: string; name: string } | null;
  canAuthorOrg: boolean;
  isPlatformAdmin: boolean;
  reviewQueue: number;
};

export type Path = {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary: string;
  description: string | null;
  level: string;
  estimatedHours: number | null;
  roles: string[];
  orgId: string | null;
  status: string;
  contentStatus: string;
  version: number;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TopicResource = { title: string; url: string; source: string; kind: string };
export type TopicPractice = { title: string; kind: 'problem' | 'quiz' | 'exercise' | 'sql'; ref?: string; prompt?: string };
export type QuizQuestion = { id: string; title: string; type: string; difficulty: string };

export type Topic = {
  id: string;
  trackId: string;
  skillId: string | null;
  slug: string;
  title: string;
  module: string;
  sortOrder: number;
  objectives: string[];
  body: string;
  estimatedMinutes: number;
  practice: TopicPractice[];
  resources: TopicResource[];
  quizQuestionIds: string[] | null;
  completionCriteria: string | null;
  isMilestone: boolean;
  skill: { slug: string; name: string } | null;
  quiz: QuizQuestion[];
};

export const KINDS = ['article', 'video', 'docs', 'cheatsheet', 'course', 'exercise', 'interview', 'link'] as const;
export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;

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

export const QUESTION_TYPE_LABEL: Record<string, string> = {
  single: 'Single choice',
  multi: 'Multiple choice',
  true_false: 'True or false',
  matching: 'Matching',
  fill_blank: 'Fill in the blank',
};

export function cap(s: string) {
  return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** Status labels that differ from the shared StatusBadge vocabulary. */
export function ResourceStatus({ status }: { status: string }) {
  if (status === 'in_review') return <StatusBadge status="review" />;
  if (status === 'rejected') return <StatusBadge status="needs_revision" />;
  return <StatusBadge status={status} />;
}

export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span aria-hidden>/</span>}
          {it.to ? (
            <Link to={it.to} className="hover:text-fg">
              {it.label}
            </Link>
          ) : (
            <span className="text-fg">{it.label}</span>
          )}
        </span>
      ))}
    </span>
  );
}

/** Horizontal bar used for distributions; width is relative to `max`. */
export function Bar({ label, value, max, suffix, className }: { label: ReactNode; value: number; max: number; suffix?: ReactNode; className?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className={clsx('flex items-center gap-3 text-[13px]', className)}>
      <div className="w-16 shrink-0 text-muted">{label}</div>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-10 shrink-0 text-right tabular-nums text-fg">{suffix ?? value}</div>
    </div>
  );
}

/** Splits text lines into a trimmed non-empty list. */
export function lines(s: string) {
  return s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}
