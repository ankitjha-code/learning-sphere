import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowSquareOutIcon, BellIcon, BellSlashIcon, CheckIcon, ChecksIcon, EnvelopeSimpleIcon, GearSixIcon } from '@phosphor-icons/react';
import { api, errorMessage, qs } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { Badge, Button, ButtonLink, EmptyState, ErrorState, Pagination, Select, SkeletonRows, Tooltip } from '@/components/ui';
import type { NotificationRow } from '@/app/NotificationsBell';
import { CATEGORY_KEYS, NOTIFICATION_CATEGORIES, categoryShort, emailStatus } from './categories';

const PAGE_SIZE = 20;

type Row = Omit<NotificationRow, 'email'> & { email?: { status: string; provider: string | null; lastError?: string | null } | null };
type ListResponse = { items: Row[]; total: number; unread: number };

export function NotificationsList({ unreadOnly, onShowAll }: { unreadOnly: boolean; onShowAll: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);

  const list = useQuery({
    queryKey: ['notifications', 'list', { unreadOnly, category, page }],
    queryFn: () => api.get<ListResponse>(`/notifications${qs({ page, pageSize: PAGE_SIZE, unread: unreadOnly ? 'true' : undefined, category })}`),
    placeholderData: keepPreviousData,
  });

  // In the unread view, marking items read can empty the current page.
  useEffect(() => {
    if (list.data && !list.data.items.length && page > 1) setPage(Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)));
  }, [list.data, page]);

  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => {
      toast.success('All notifications marked as read');
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const markOne = useMutation({
    mutationFn: (v: { id: string; silent?: boolean }) => api.post(`/notifications/${v.id}/read`),
    onSuccess: (_r, v) => {
      if (!v.silent) toast.success('Marked as read');
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const open = (n: Row) => {
    if (!n.readAt) markOne.mutate({ id: n.id, silent: true });
    if (n.link) navigate(n.link);
  };

  const unread = list.data?.unread ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full sm:w-72">
          <label htmlFor="notif-category" className="sr-only">
            Category
          </label>
          <Select
            id="notif-category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {CATEGORY_KEYS.map((k) => (
              <option key={k} value={k}>
                {NOTIFICATION_CATEGORIES[k]}
              </option>
            ))}
          </Select>
        </div>
        <Button
          icon={<ChecksIcon size={16} />}
          loading={markAll.isPending}
          disabled={!list.data || unread === 0}
          disabledReason={list.data ? 'You have no unread notifications' : 'Loading notifications'}
          onClick={() => markAll.mutate()}
        >
          Mark all as read
        </Button>
      </div>

      <p className="flex items-start gap-1.5 text-[12.5px] text-muted">
        <EnvelopeSimpleIcon size={14} className="mt-0.5 shrink-0" aria-hidden />
        <span>Email status shows what the email provider reported. "Accepted by provider" means the provider took the message, not that it reached your inbox.</span>
      </p>

      {list.isLoading ? (
        <SkeletonRows rows={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data?.items.length ? (
        category ? (
          <EmptyState
            icon={<BellSlashIcon size={22} />}
            title={unreadOnly ? 'No unread notifications in this category' : 'No notifications in this category'}
            description={`Nothing under "${NOTIFICATION_CATEGORIES[category as keyof typeof NOTIFICATION_CATEGORIES] ?? category}" yet.`}
            action={
              <Button
                onClick={() => {
                  setCategory('');
                  setPage(1);
                }}
              >
                Show all categories
              </Button>
            }
          />
        ) : unreadOnly ? (
          <EmptyState icon={<BellIcon size={22} />} title="You're all caught up" description="You have no unread notifications. Earlier ones are still in All." action={<Button onClick={onShowAll}>View all notifications</Button>} />
        ) : (
          <EmptyState
            icon={<BellSlashIcon size={22} />}
            title="No notifications yet"
            description="Deadlines, results, replies and invitations will show up here as they happen."
            action={
              <ButtonLink to="/app/settings/notifications" variant="primary" icon={<GearSixIcon size={16} />}>
                Choose what to be notified about
              </ButtonLink>
            }
          />
        )
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1" aria-busy={list.isFetching || undefined}>
            {list.data.items.map((n) => (
              <NotificationItem
                key={n.id}
                n={n}
                onOpen={() => open(n)}
                onMarkRead={() => markOne.mutate({ id: n.id })}
                marking={markOne.isPending && markOne.variables?.id === n.id}
              />
            ))}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function NotificationItem({ n, onOpen, onMarkRead, marking }: { n: Row; onOpen: () => void; onMarkRead: () => void; marking: boolean }) {
  const isUnread = !n.readAt;
  const email = n.email ? emailStatus(n.email.status) : null;
  return (
    <li className={clsx('flex items-start gap-3 px-5 py-4', isUnread && 'bg-accent-soft/40')}>
      <span className={clsx('mt-2 h-2 w-2 shrink-0 rounded-full', isUnread ? 'bg-accent' : 'bg-transparent')} aria-hidden />
      <div className="min-w-0 flex-1">
        {isUnread && <span className="sr-only">Unread: </span>}
        {n.link ? (
          <button type="button" onClick={onOpen} className={clsx('text-left text-[14px] leading-snug hover:underline', isUnread ? 'font-semibold' : 'font-medium')}>
            {n.title}
          </button>
        ) : (
          <span className={clsx('text-[14px] leading-snug', isUnread ? 'font-semibold' : 'font-medium')}>{n.title}</span>
        )}
        {n.body && <p className="mt-0.5 text-[13px] text-muted">{n.body}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-subtle">
          <Badge>{categoryShort(n.category)}</Badge>
          {email ? (
            <Tooltip content={email.hint}>
              <span tabIndex={0} className="inline-flex rounded-full focus-visible:outline-2" aria-label={`${email.label}. ${email.hint}`}>
                <Badge tone={email.tone} icon={<EnvelopeSimpleIcon size={11} aria-hidden />}>
                  {email.label}
                </Badge>
              </span>
            </Tooltip>
          ) : (
            <span>In-app only</span>
          )}
          <span aria-hidden>·</span>
          <time dateTime={n.createdAt} title={formatDateTime(n.createdAt)}>
            {timeAgo(n.createdAt)}
          </time>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {isUnread && (
          <Button variant="ghost" size="sm" icon={<CheckIcon size={14} />} loading={marking} onClick={onMarkRead} aria-label={`Mark "${n.title}" as read`}>
            <span className="hidden sm:inline">Mark as read</span>
          </Button>
        )}
        {n.link && (
          <Button variant="ghost" size="icon-sm" onClick={onOpen} aria-label={`Open ${n.title}`} title="Open">
            <ArrowSquareOutIcon size={16} />
          </Button>
        )}
      </div>
    </li>
  );
}
