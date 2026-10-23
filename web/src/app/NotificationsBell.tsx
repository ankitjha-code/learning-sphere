import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellIcon, BellSlashIcon } from '@phosphor-icons/react';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { Popover, PopoverClose, SkeletonRows } from '@/components/ui';
import { timeAgo } from '@/lib/format';

export type NotificationRow = {
  id: string;
  type: string;
  category: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
  email?: { status: string; provider: string | null } | null;
};

export function NotificationsBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: () => api.get<{ items: NotificationRow[]; unread: number }>('/notifications?pageSize=8'),
    refetchInterval: 30_000,
  });
  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markOne = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const unread = data?.unread ?? 0;

  return (
    <Popover
      className="w-[360px] max-w-[calc(100vw-24px)]"
      trigger={
        <button className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-3/60 hover:text-fg" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <BellIcon size={18} />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white ring-2 ring-bg dark:text-black">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      }
    >
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <span className="text-[14.5px] font-semibold">Notifications</span>
        {unread > 0 && (
          <button className="text-[12.5px] font-medium text-accent-text hover:underline" onClick={() => markAll.mutate()}>
            Mark all as read
          </button>
        )}
      </div>
      <div className="max-h-[420px] overflow-y-auto" aria-live="polite">
        {isLoading ? (
          <div className="p-3">
            <SkeletonRows rows={3} />
          </div>
        ) : !data?.items.length ? (
          <div className="flex flex-col items-center px-6 py-8 text-center">
            <BellSlashIcon size={24} className="text-subtle" />
            <p className="mt-2 text-[13px] text-muted">You're all caught up. Deadlines, results and replies will show up here.</p>
          </div>
        ) : (
          <ul>
            {data.items.map((n) => (
              <li key={n.id}>
                <PopoverClose asChild>
                  <button
                    className={clsx('flex w-full gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-0 hover:bg-surface-2', !n.readAt && 'bg-accent-soft/40')}
                    onClick={() => {
                      if (!n.readAt) markOne.mutate(n.id);
                      if (n.link) navigate(n.link);
                    }}
                  >
                    <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-accent')} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium leading-snug">{n.title}</span>
                      {n.body && <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-muted">{n.body}</span>}
                      <span className="mt-0.5 block text-[11.5px] text-subtle">{timeAgo(n.createdAt)}</span>
                    </span>
                  </button>
                </PopoverClose>
              </li>
            ))}
          </ul>
        )}
      </div>
      <PopoverClose asChild>
        <Link to="/app/notifications" className="block rounded-b-lg border-t border-border bg-surface-2 px-4 py-2.5 text-center text-[13px] font-medium text-accent-text hover:bg-surface-3/60">
          View all activity
        </Link>
      </PopoverClose>
    </Popover>
  );
}
