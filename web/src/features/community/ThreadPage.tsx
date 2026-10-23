import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowFatUpIcon, ArrowFatDownIcon, CheckCircleIcon, LockKeyIcon, LockSimpleIcon, CalendarIcon, UserPlusIcon, ArrowSquareOutIcon, EyeSlashIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Badge, Banner, Button, Card, CardBody, CardHeader, Dialog, ErrorState, Field, Input, Markdown, Menu, PageHeader, Skeleton, Textarea, type MenuItem } from '@/components/ui';
import { AuthorChip, KIND_META, ReportDialog, type Author, type ThreadKind } from './shared';

type Post = { id: string; body: string; score: number; status: string; createdAt: string; editedAt: string | null; author: Author; myVote: number; accepted: boolean; canEdit: boolean };
type ThreadDetail = {
  thread: { id: string; kind: ThreadKind; title: string; body: string; tags: string[]; isPrivate: boolean; status: string; acceptedPostId: string | null; score: number; eventAt: string | null; createdAt: string; editedAt: string | null; locked: boolean; myVote: number; authorId: string };
  author: Author;
  space: { id: string; slug: string; name: string; kind: string; orgId: string | null };
  posts: Post[];
  signups: { userId: string; name: string; avatarColor: string | null; note: string | null; createdAt: string }[];
  mySignup: boolean;
  invites: { userId: string; name: string }[];
  project: { id: string; title: string; repoUrl: string | null; demoUrl: string | null; status: string; visibility: string } | null;
  permissions: { canEdit: boolean; canReply: boolean; replyBlockedReason: string | null; canAccept: boolean; canModerate: boolean; canInvite: boolean; canVote: boolean };
};

function VoteControl({ type, id, score, myVote, disabled, onDone }: { type: 'thread' | 'post'; id: string; score: number; myVote: number; disabled?: boolean; onDone: () => void }) {
  const m = useMutation({
    mutationFn: (value: number) => api.post('/community/votes', { targetType: type, targetId: id, value }),
    onSuccess: onDone,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const vote = (v: number) => m.mutate(myVote === v ? 0 : v);
  return (
    <div className="flex flex-col items-center gap-0.5">
      <button type="button" disabled={disabled || m.isPending} onClick={() => vote(1)} aria-pressed={myVote === 1} aria-label="Upvote (helpful)" title={disabled ? 'You cannot vote on your own posts' : 'Helpful'} className={clsx('rounded p-1 hover:bg-surface-2 disabled:opacity-40', myVote === 1 ? 'text-accent-text' : 'text-subtle')}>
        <ArrowFatUpIcon size={18} weight={myVote === 1 ? 'fill' : 'regular'} />
      </button>
      <span className="text-[13px] font-medium tabular-nums" aria-label={`Score ${score}`}>
        {score}
      </span>
      <button type="button" disabled={disabled || m.isPending} onClick={() => vote(-1)} aria-pressed={myVote === -1} aria-label="Downvote (not helpful)" title={disabled ? 'You cannot vote on your own posts' : 'Not helpful'} className={clsx('rounded p-1 hover:bg-surface-2 disabled:opacity-40', myVote === -1 ? 'text-danger' : 'text-subtle')}>
        <ArrowFatDownIcon size={18} weight={myVote === -1 ? 'fill' : 'regular'} />
      </button>
    </div>
  );
}

function InviteMentorDialog({ threadId, onClose }: { threadId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const mentors = useQuery({ queryKey: ['invite-mentors', q], queryFn: () => api.get<{ items: { userId: string; name: string; headline: string; expertise: string[] }[] }>(`/mentorship/mentors?pageSize=10${q ? `&q=${encodeURIComponent(q)}` : ''}`) });
  const invite = useMutation({
    mutationFn: (userId: string) => api.post(`/community/threads/${threadId}/invite`, { userId }),
    onSuccess: () => (toast.success('Mentor invited'), qc.invalidateQueries({ queryKey: ['thread', threadId] })),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="Invite a mentor" description="Invited mentors can read and answer this private question. Nobody else can.">
      <div className="space-y-3">
        <Input placeholder="Search mentors by name or skill" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search mentors" />
        {mentors.isLoading ? (
          <Skeleton className="h-24" />
        ) : mentors.error ? (
          <ErrorState error={mentors.error} onRetry={() => mentors.refetch()} />
        ) : !mentors.data!.items.length ? (
          <p className="text-[13px] text-muted">No mentors found.</p>
        ) : (
          <ul className="divide-y divide-border">
            {mentors.data!.items.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium">{m.name}</div>
                  <div className="truncate text-[12px] text-muted">{m.headline}</div>
                </div>
                <Button size="sm" onClick={() => invite.mutate(m.userId)} loading={invite.isPending && invite.variables === m.userId}>
                  Invite
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

function EditDialog({ title, initial, onSave, onClose, pending }: { title: string; initial: string; onSave: (v: string) => void; onClose: () => void; pending: boolean }) {
  const [v, setV] = useState(initial);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={title}
      description="Edits are allowed for 30 minutes after posting and are marked as edited."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={pending} onClick={() => onSave(v)}>
            Save changes
          </Button>
        </>
      }
    >
      <Textarea rows={8} value={v} onChange={(e) => setV(e.target.value)} aria-label="Content" />
    </Dialog>
  );
}

export default function ThreadPage() {
  const { id = '' } = useParams();
  const me = useSession();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['thread', id], queryFn: () => api.get<ThreadDetail>(`/community/threads/${id}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['thread', id] });
  const [reply, setReply] = useState('');
  const [report, setReport] = useState<{ type: 'thread' | 'post' | 'user'; id: string; label: string } | null>(null);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<{ type: 'thread' | 'post'; id: string; body: string } | null>(null);
  const [signupNote, setSignupNote] = useState('');

  const postReply = useMutation({
    mutationFn: () => api.post(`/community/threads/${id}/posts`, { body: reply }),
    onSuccess: () => (setReply(''), toast.success('Reply posted'), refresh()),
  });
  const accept = useMutation({
    mutationFn: (postId: string | null) => api.post<{ xpAwarded?: boolean }>(`/community/threads/${id}/accept`, { postId }),
    onSuccess: (_r, postId) => (toast.success(postId ? 'Answer accepted. Thanks for closing the loop.' : 'Accepted answer cleared'), refresh()),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const block = useMutation({
    mutationFn: (userId: string) => api.post('/community/blocks', { userId }),
    onSuccess: () => (toast.success('Blocked. Their posts are hidden for you and they cannot reply to your threads.'), refresh()),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const moderate = useMutation({
    mutationFn: ({ type, targetId, action }: { type: 'threads' | 'posts'; targetId: string; action: string }) => api.post(`/community/moderation/${type}/${targetId}`, { action }),
    onSuccess: (_r, v) => (toast.success(`Done: ${v.action}`), refresh()),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const signup = useMutation({
    mutationFn: (join: boolean) => (join ? api.post(`/community/threads/${id}/signup`, { note: signupNote || undefined }) : api.del(`/community/threads/${id}/signup`)),
    onSuccess: (_r, join) => (toast.success(join ? 'Signed up' : 'Removed your sign-up'), setSignupNote(''), refresh()),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const edit = useMutation({
    mutationFn: (v: { type: 'thread' | 'post'; id: string; body: string }) => (v.type === 'thread' ? api.patch(`/community/threads/${v.id}`, { body: v.body }) : api.patch(`/community/posts/${v.id}`, { body: v.body })),
    onSuccess: () => (toast.success('Saved'), setEditing(null), refresh()),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading)
    return (
      <div className="space-y-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-48" />
      </div>
    );
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const t = d.thread;
  const K = KIND_META[t.kind];
  const isAuthor = d.author.id === me.user.id;
  const replyFields = postReply.error instanceof ApiError ? postReply.error.fields : {};

  const threadMenu: MenuItem[] = [
    ...(d.permissions.canEdit ? [{ label: 'Edit', onSelect: () => setEditing({ type: 'thread' as const, id: t.id, body: t.body }) }] : []),
    ...(!isAuthor
      ? [
          { label: 'Report thread', onSelect: () => setReport({ type: 'thread', id: t.id, label: 'this thread' }) },
          { label: `Block ${d.author.name}`, danger: true, onSelect: () => block.mutate(d.author.id) },
        ]
      : []),
    ...(d.permissions.canModerate
      ? [
          'separator' as const,
          { label: t.locked ? 'Unlock thread' : 'Lock thread', onSelect: () => moderate.mutate({ type: 'threads', targetId: t.id, action: t.locked ? 'unlock' : 'lock' }) },
          { label: t.status === 'hidden' ? 'Unhide thread' : 'Hide thread', danger: t.status !== 'hidden', onSelect: () => moderate.mutate({ type: 'threads', targetId: t.id, action: t.status === 'hidden' ? 'unhide' : 'hide' }) },
        ]
      : []),
  ];

  return (
    <div className="max-w-4xl">
      <PageHeader
        breadcrumb={
          <span>
            <Link to="/app/community" className="hover:underline">
              Community
            </Link>{' '}
            /{' '}
            <Link to={`/app/community/s/${d.space.slug}`} className="hover:underline">
              {d.space.name}
            </Link>
          </span>
        }
        title={t.title}
        badge={
          <>
            <Badge icon={<K.icon size={12} />}>{K.label}</Badge>
            {t.isPrivate && (
              <Badge tone="warning" icon={<LockKeyIcon size={12} />}>
                Private
              </Badge>
            )}
            {t.acceptedPostId && (
              <Badge tone="success" icon={<CheckCircleIcon size={12} />}>
                Answered
              </Badge>
            )}
            {t.locked && <Badge icon={<LockSimpleIcon size={12} />}>Locked</Badge>}
            {t.status === 'hidden' && (
              <Badge tone="danger" icon={<EyeSlashIcon size={12} />}>
                Hidden by a moderator
              </Badge>
            )}
          </>
        }
        actions={threadMenu.length > 0 ? <Menu items={threadMenu} label="Thread actions" /> : undefined}
      />
      {t.isPrivate && (
        <Banner tone="warning" className="mb-5" title="Private question">
          Visible only to {isAuthor ? 'you' : d.author.name}, this space's moderators{d.invites.length ? ` and invited mentors (${d.invites.map((i) => i.name).join(', ')})` : ' and mentors the author invites'}.
        </Banner>
      )}
      <Card className="mb-5">
        <CardBody className="flex gap-3 pt-4">
          <VoteControl type="thread" id={t.id} score={t.score} myVote={t.myVote} disabled={isAuthor} onDone={refresh} />
          <div className="min-w-0 flex-1">
            <Markdown source={t.body} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <AuthorChip a={d.author} sub={`${timeAgo(t.createdAt)}${t.editedAt ? ' · edited' : ''}`} />
              {t.tags.map((tag) => (
                <span key={tag} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11.5px] text-muted">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      {d.project && (
        <Card className="mb-5">
          <CardHeader title={d.project.title} description="Showcased project" />
          <CardBody className="flex flex-wrap gap-3 text-[13px]">
            {d.project.repoUrl && (
              <a href={d.project.repoUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-accent-text hover:underline">
                Repository <ArrowSquareOutIcon size={13} />
              </a>
            )}
            {d.project.demoUrl && (
              <a href={d.project.demoUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-accent-text hover:underline">
                Live demo <ArrowSquareOutIcon size={13} />
              </a>
            )}
            {!d.project.repoUrl && !d.project.demoUrl && <span className="text-muted">No public links yet.</span>}
          </CardBody>
        </Card>
      )}

      {(t.kind === 'event' || t.kind === 'team_formation') && (
        <Card className="mb-5">
          <CardHeader
            title={
              t.kind === 'event' ? (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon size={16} aria-hidden /> Event
                </span>
              ) : (
                'Interested teammates'
              )
            }
            description={t.kind === 'event' && t.eventAt ? `${formatDateTime(t.eventAt)} · ${d.signups.length} going` : `${d.signups.length} interested`}
          />
          <CardBody className="space-y-4">
            {d.signups.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {d.signups.map((s) => (
                  <li key={s.userId} className="inline-flex h-7 items-center rounded-full bg-surface-2 px-3 text-[12.5px] ring-1 ring-inset ring-border" title={s.note ?? undefined}>
                    {s.name}
                    {isAuthor && s.note ? `: ${s.note}` : ''}
                  </li>
                ))}
              </ul>
            )}
            {!isAuthor &&
              (d.mySignup ? (
                <Button size="sm" loading={signup.isPending} onClick={() => signup.mutate(false)}>
                  Remove my sign-up
                </Button>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  {t.kind === 'team_formation' && <Input value={signupNote} onChange={(e) => setSignupNote(e.target.value)} placeholder="Optional note: your skills and availability" aria-label="Note to the author" maxLength={500} />}
                  <Button size="sm" variant="primary" loading={signup.isPending} onClick={() => signup.mutate(true)}>
                    {t.kind === 'event' ? 'I am going' : "I'm interested"}
                  </Button>
                </div>
              ))}
          </CardBody>
        </Card>
      )}

      {d.permissions.canInvite && (
        <div className="mb-5 flex justify-end">
          <Button size="sm" icon={<UserPlusIcon size={15} />} onClick={() => setInviting(true)}>
            Invite a mentor
          </Button>
        </div>
      )}

      <h2 className="mb-3 mt-8 text-[16px] font-semibold tracking-[-0.01em]">
        {d.posts.length} {d.posts.length === 1 ? 'reply' : 'replies'}
      </h2>
      <div className="space-y-3">
        {[...d.posts]
          .sort((a, b) => Number(b.accepted) - Number(a.accepted))
          .map((p) => {
            const mine = p.author.id === me.user.id;
            const items: MenuItem[] = [
              ...(p.canEdit ? [{ label: 'Edit', onSelect: () => setEditing({ type: 'post' as const, id: p.id, body: p.body }) }] : []),
              ...(!mine
                ? [
                    { label: 'Report reply', onSelect: () => setReport({ type: 'post', id: p.id, label: 'this reply' }) },
                    { label: `Block ${p.author.name}`, danger: true, onSelect: () => block.mutate(p.author.id) },
                  ]
                : []),
              ...(d.permissions.canModerate ? ['separator' as const, { label: p.status === 'hidden' ? 'Unhide reply' : 'Hide reply', danger: p.status !== 'hidden', onSelect: () => moderate.mutate({ type: 'posts', targetId: p.id, action: p.status === 'hidden' ? 'unhide' : 'hide' }) }] : []),
            ];
            return (
              <Card key={p.id} id={`post-${p.id}`} className={clsx(p.accepted && 'border-success', p.status === 'hidden' && 'opacity-70')}>
                <CardBody className="flex gap-3 pt-4">
                  <VoteControl type="post" id={p.id} score={p.score} myVote={p.myVote} disabled={mine} onDone={refresh} />
                  <div className="min-w-0 flex-1">
                    {p.accepted && (
                      <Badge tone="success" icon={<CheckCircleIcon size={12} />} className="mb-2">
                        Accepted answer
                      </Badge>
                    )}
                    {p.status === 'hidden' && (
                      <Badge tone="danger" className="mb-2">
                        Hidden by a moderator
                      </Badge>
                    )}
                    <Markdown source={p.body} />
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <AuthorChip a={p.author} sub={`${timeAgo(p.createdAt)}${p.editedAt ? ' · edited' : ''}`} />
                      <div className="flex items-center gap-1">
                        {d.permissions.canAccept && !mine && (
                          <Button size="sm" variant={p.accepted ? 'soft' : 'ghost'} icon={<CheckCircleIcon size={15} />} loading={accept.isPending && accept.variables === (p.accepted ? null : p.id)} onClick={() => accept.mutate(p.accepted ? null : p.id)}>
                            {p.accepted ? 'Accepted' : 'Accept answer'}
                          </Button>
                        )}
                        {items.length > 0 && <Menu items={items} label="Reply actions" />}
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
      </div>

      <Card className="mt-4">
        <CardBody className="pt-5">
          {d.permissions.canReply ? (
            <div className="space-y-2">
              <Field label="Your reply" error={replyFields.body} helper="Mention someone in this thread with @FirstName. Markdown is supported.">
                <Textarea rows={5} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={20000} />
              </Field>
              {postReply.error && !Object.keys(replyFields).length && <p className="text-[12.5px] text-danger">{errorMessage(postReply.error)}</p>}
              <div className="flex justify-end">
                <Button variant="primary" loading={postReply.isPending} disabled={reply.trim().length < 2} disabledReason="Write a reply first" onClick={() => postReply.mutate()}>
                  Post reply
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-muted">{d.permissions.replyBlockedReason ?? 'Replies are closed.'}</p>
          )}
        </CardBody>
      </Card>

      {report && <ReportDialog target={report} onClose={() => setReport(null)} />}
      {inviting && <InviteMentorDialog threadId={t.id} onClose={() => setInviting(false)} />}
      {editing && <EditDialog title={editing.type === 'thread' ? 'Edit thread' : 'Edit reply'} initial={editing.body} pending={edit.isPending} onClose={() => setEditing(null)} onSave={(body) => edit.mutate({ ...editing, body })} />}
    </div>
  );
}
