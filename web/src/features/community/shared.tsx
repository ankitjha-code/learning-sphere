import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import clsx from 'clsx';
import {
  ChatsCircleIcon,
  QuestionIcon,
  RocketLaunchIcon,
  CalendarIcon,
  UsersThreeIcon,
  LockKeyIcon,
  CheckCircleIcon,
  ArrowFatUpIcon,
  ChatCircleIcon,
  LockSimpleIcon,
} from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { timeAgo, formatDateTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Avatar, Badge, Banner, Button, Dialog, EmptyState, ErrorState, Field, Input, Pagination, ProvenanceTag, Select, SkeletonRows, Switch, Textarea } from '@/components/ui';

export type Author = { id: string; name: string; avatarColor: string | null; isSample: boolean; reputation?: number | null };
export type ThreadKind = 'discussion' | 'question' | 'showcase' | 'event' | 'team_formation';
export type ThreadRow = {
  id: string;
  kind: ThreadKind;
  title: string;
  excerpt: string;
  tags: string[];
  isPrivate: boolean;
  status: string;
  answered: boolean;
  score: number;
  replyCount: number;
  eventAt: string | null;
  projectId: string | null;
  lastActivityAt: string;
  createdAt: string;
  author: Author;
  space: { slug: string; name: string; orgId: string | null };
  signups: number;
  locked: boolean;
};
export type ThreadPage = { items: ThreadRow[]; total: number; page: number; pageSize: number };

export const KIND_META: Record<ThreadKind, { label: string; icon: typeof ChatsCircleIcon }> = {
  discussion: { label: 'Discussion', icon: ChatsCircleIcon },
  question: { label: 'Question', icon: QuestionIcon },
  showcase: { label: 'Showcase', icon: RocketLaunchIcon },
  event: { label: 'Event', icon: CalendarIcon },
  team_formation: { label: 'Team', icon: UsersThreeIcon },
};

export function AuthorChip({ a, sub }: { a: Author; sub?: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted">
      <Avatar name={a.name} color={a.avatarColor} size={20} />
      <span className="truncate font-medium text-fg">{a.name}</span>
      {typeof a.reputation === 'number' && (
        <span className="tabular-nums text-subtle" title="Community reputation">
          {a.reputation}
        </span>
      )}
      {a.isSample && <ProvenanceTag kind="sample" />}
      {sub && <span className="text-subtle">· {sub}</span>}
    </span>
  );
}

export function ThreadList({ data, page, onPage, showSpace, empty }: { data: ThreadPage; page: number; onPage: (p: number) => void; showSpace?: boolean; empty: React.ReactNode }) {
  if (!data.items.length) return <>{empty}</>;
  return (
    <div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface shadow-1">
        {data.items.map((t) => {
          const K = KIND_META[t.kind];
          return (
            <li key={t.id} className="relative flex gap-3 px-4 py-3 hover:bg-surface-2">
              <div className="hidden w-14 shrink-0 flex-col items-center gap-1 pt-0.5 text-[12px] text-muted sm:flex">
                <span className="inline-flex items-center gap-0.5 tabular-nums" title="Votes">
                  <ArrowFatUpIcon size={13} /> {t.score}
                </span>
                <span className={clsx('inline-flex items-center gap-0.5 rounded px-1 tabular-nums', t.answered && 'bg-success-soft text-success')} title={t.answered ? 'Has an accepted answer' : 'Replies'}>
                  {t.answered ? <CheckCircleIcon size={13} weight="fill" /> : <ChatCircleIcon size={13} />} {t.replyCount}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge icon={<K.icon size={12} />}>{K.label}</Badge>
                  {t.isPrivate && (
                    <Badge tone="warning" icon={<LockKeyIcon size={12} />}>
                      Private
                    </Badge>
                  )}
                  {t.locked && (
                    <Badge icon={<LockSimpleIcon size={12} />}>Locked</Badge>
                  )}
                  {t.status === 'hidden' && <Badge tone="danger">Hidden</Badge>}
                  <Link to={`/app/community/t/${t.id}`} className="min-w-0 text-[14.5px] font-medium after:absolute after:inset-0 hover:underline">
                    {t.title}
                  </Link>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{t.excerpt}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <AuthorChip a={t.author} sub={timeAgo(t.lastActivityAt)} />
                  {showSpace && <span className="text-[12px] text-subtle">in {t.space.name}</span>}
                  {t.kind === 'event' && t.eventAt && (
                    <span className="inline-flex items-center gap-1 text-[12px] text-info">
                      <CalendarIcon size={13} /> {formatDateTime(t.eventAt)}
                    </span>
                  )}
                  {(t.kind === 'team_formation' || t.kind === 'event') && t.signups > 0 && <span className="text-[12px] text-subtle">{t.signups} interested</span>}
                  {t.tags.map((tag) => (
                    <span key={tag} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11.5px] text-muted">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <Pagination page={page} pageSize={data.pageSize} total={data.total} onPage={onPage} />
    </div>
  );
}

export function ThreadListQuery({ path, params, showSpace, empty }: { path: string; params: Record<string, string | undefined>; showSpace?: boolean; empty: React.ReactNode }) {
  const [page, setPage] = useState(1);
  const search = new URLSearchParams(Object.entries({ ...params, page: String(page), pageSize: '20' }).filter(([, v]) => v) as [string, string][]).toString();
  const q = useQuery({ queryKey: ['threads', path, search], queryFn: () => api.get<ThreadPage>(`${path}?${search}`), placeholderData: (p) => p });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <SkeletonRows rows={5} />;
  return <ThreadList data={q.data} page={page} onPage={setPage} showSpace={showSpace} empty={empty} />;
}

type MyProject = { id: string; title: string; visibility: string; ownerId: string };

export function NewThreadDialog({ open, onOpenChange, spaceSlug, spaceName, isModerator, defaultKind = 'question' }: { open: boolean; onOpenChange: (v: boolean) => void; spaceSlug: string; spaceName: string; isModerator: boolean; defaultKind?: ThreadKind }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const me = useSession();
  const [kind, setKind] = useState<ThreadKind>(defaultKind);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [isPrivate, setPrivate] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [eventAt, setEventAt] = useState('');
  const projects = useQuery({
    queryKey: ['my-projects-for-showcase'],
    queryFn: () => api.get<{ items: MyProject[] }>('/projects?pageSize=100'),
    enabled: open && kind === 'showcase',
    retry: false,
  });
  const projectList = (projects.data?.items ?? []).filter((p) => p.ownerId === me.user.id && p.visibility !== 'private');
  const m = useMutation({
    mutationFn: () =>
      api.post<{ thread: { id: string } }>(`/community/spaces/${spaceSlug}/threads`, {
        kind,
        title,
        body,
        tags: tags
          .split(',')
          .map((t) => t.trim().replace(/^#/, ''))
          .filter(Boolean),
        isPrivate: kind === 'question' && isPrivate,
        projectId: kind === 'showcase' ? projectId || null : null,
        eventAt: kind === 'event' && eventAt ? new Date(eventAt).toISOString() : null,
      }),
    onSuccess: (r) => {
      toast.success('Posted');
      qc.invalidateQueries({ queryKey: ['threads'] });
      onOpenChange(false);
      nav(`/app/community/t/${r.thread.id}`);
    },
  });
  const fields = m.error instanceof ApiError ? m.error.fields : {};
  const kinds: ThreadKind[] = ['question', 'discussion', 'showcase', 'team_formation', ...(isModerator ? (['event'] as ThreadKind[]) : [])];
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={`New post in ${spaceName}`}
      description={
        <>
          Please follow the{' '}
          <Link to="/app/community/guidelines" className="text-accent-text hover:underline">
            community guidelines
          </Link>
          .
        </>
      }
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={title.trim().length < 8 || body.trim().length < 20} disabledReason="Add a title (8+ characters) and some detail (20+ characters)" onClick={() => m.mutate()}>
            Post
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {m.error && !Object.keys(fields).length && <Banner tone="danger">{errorMessage(m.error)}</Banner>}
        <Field label="Type">
          <Select value={kind} onChange={(e) => setKind(e.target.value as ThreadKind)}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {KIND_META[k].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Title" error={fields.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={kind === 'question' ? 'What are you trying to do?' : undefined} />
        </Field>
        <Field label="Details" error={fields.body} helper={kind === 'question' ? 'What you tried, what you expected, and what happened. Markdown and code blocks are supported.' : 'Markdown is supported.'}>
          <Textarea rows={7} value={body} onChange={(e) => setBody(e.target.value)} maxLength={20000} />
        </Field>
        <Field label="Tags" optional helper="Up to 5, separated by commas.">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="python, recursion" />
        </Field>
        {kind === 'question' && (
          <div className="rounded-md border border-border p-3">
            <Switch
              checked={isPrivate}
              onCheckedChange={setPrivate}
              label="Ask privately"
              description="Only you, this space's moderators and mentors you invite can see it. Good for sensitive career questions."
            />
          </div>
        )}
        {kind === 'showcase' && (
          <Field label="Project" error={fields.projectId} helper="Only your public or unlisted projects can be showcased.">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Choose a project</option>
              {projectList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {kind === 'event' && (
          <Field label="Event date and time" error={fields.eventAt}>
            <Input type="datetime-local" value={eventAt} onChange={(e) => setEventAt(e.target.value)} />
          </Field>
        )}
      </div>
    </Dialog>
  );
}

export function ReportDialog({ target, onClose }: { target: { type: 'thread' | 'post' | 'user'; id: string; label: string }; onClose: () => void }) {
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const m = useMutation({
    mutationFn: () => api.post<{ duplicate?: boolean }>('/community/reports', { targetType: target.type, targetId: target.id, reason, details: details || undefined }),
    onSuccess: (r) => {
      toast.success(r.duplicate ? 'You already reported this. Moderators will review it.' : 'Thanks. Moderators will review your report.');
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Report ${target.label}`}
      description="Reports go to moderators. The person you report is not told who reported them."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={m.isPending} onClick={() => m.mutate()}>
            Send report
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Reason">
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="spam">Spam or advertising</option>
            <option value="abuse">Harassment or abuse</option>
            <option value="incorrect">Harmful or dangerously wrong</option>
            <option value="copyright">Copyright or assessment answers</option>
            <option value="other">Something else</option>
          </Select>
        </Field>
        <Field label="Details" optional>
          <Textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} />
        </Field>
      </div>
    </Dialog>
  );
}

export function useCommunityOverview() {
  return useQuery({
    queryKey: ['community-overview'],
    queryFn: () => api.get<{ reputation: { reputation: number; accepted: number }; canModerate: boolean; preferences: Record<string, boolean> }>('/community/overview'),
  });
}

export function EmptyThreads({ action }: { action?: React.ReactNode }) {
  return <EmptyState icon={<ChatsCircleIcon size={22} />} title="Nothing here yet" description="Start the conversation. Specific questions get the best answers." action={action} />;
}
