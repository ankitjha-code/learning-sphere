import { useEffect, useState } from 'react';

/** Shapes returned by /api/workspace/* and /api/files (see server/modules/workspace/routes.ts, server/modules/files). */

export const LINK_TYPES = ['topic', 'resource', 'project', 'problem', 'file', 'track', 'assignment', 'application'] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export function isLinkType(v: string | null | undefined): v is LinkType {
  return !!v && (LINK_TYPES as readonly string[]).includes(v);
}

export type NoteListItem = {
  id: string;
  title: string;
  tags: string[];
  pinned: boolean;
  linkType: string | null;
  linkId: string | null;
  linkLabel: string | null;
  excerpt: string;
  createdAt: string;
  updatedAt: string;
};

export type NotesResponse = { items: NoteListItem[]; total: number; tags: { tag: string; count: number }[] };

export type Note = {
  id: string;
  userId: string;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  linkType: string | null;
  linkId: string | null;
  linkLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskPriority = 'low' | 'normal' | 'high';

export type Task = {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  status: 'todo' | 'done';
  priority: TaskPriority;
  linkType: string | null;
  linkId: string | null;
  linkLabel: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type TasksResponse = { items: Task[]; total: number; counts: { total: number; open: number; overdue: number } };

export type SavedLink = { id: string; userId: string; title: string; url: string; note: string | null; createdAt: string };

export const BOOKMARK_TYPES = ['resource', 'topic', 'track', 'problem', 'job', 'project', 'thread'] as const;
export type BookmarkType = (typeof BOOKMARK_TYPES)[number];

export const BOOKMARK_TYPE_LABELS: Record<BookmarkType, string> = {
  resource: 'Resource',
  topic: 'Topic',
  track: 'Track',
  problem: 'Problem',
  job: 'Job',
  project: 'Project',
  thread: 'Thread',
};

export type Bookmark = {
  id: string;
  userId: string;
  targetType: string;
  targetId: string;
  label: string;
  collection: string | null;
  createdAt: string;
  link: string | null;
};

export type BookmarksResponse = { items: Bookmark[]; counts: { type: string; count: number }[] };

export type CalendarType = 'task' | 'assignment' | 'assessment' | 'interview' | 'mentor_session' | 'milestone';

export type CalendarItem = { id: string; type: CalendarType; title: string; at: string; link: string; detail?: string; done?: boolean };

export type CalendarResponse = { items: CalendarItem[]; from: string; to: string };

export type StoredFile = {
  id: string;
  purpose: string;
  filename: string;
  mime: string;
  size: number;
  sha256: string;
  status: string;
  orgId: string | null;
  expiresAt: string | null;
  createdAt: string;
  url: string;
};

export type FilesResponse = { items: StoredFile[]; total: number; usage: { used: number; quota: number } };

export type ImportResult = { notes: number; tasks: number; links: number; bookmarks: number; skipped: { file: string; reason: string }[] };

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Simple debounce for search boxes. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
