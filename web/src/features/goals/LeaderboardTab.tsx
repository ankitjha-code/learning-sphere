import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { RankingIcon, EyeSlashIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Avatar, Card, CardBody, CardHeader, EmptyState, ErrorState, ProvenanceTag, Segmented, SkeletonRows, Switch } from '@/components/ui';
import { usePreferences, type Summary } from './shared';

type Board = {
  scope: 'global' | 'org';
  org: { id: string; name: string } | null;
  entries: { rank: number; userId: string; name: string; avatarColor: string | null; isSample: boolean; xp: number; isMe: boolean }[];
  me: { xp: number; optedIn: boolean; rank: number | null };
  weekStart: string;
};

export default function LeaderboardTab() {
  const me = useSession();
  const [scope, setScope] = useState<'global' | 'org'>('global');
  const summary = useQuery({ queryKey: ['motivation-summary'], queryFn: () => api.get<Summary>('/motivation/summary') });
  const q = useQuery({ queryKey: ['leaderboard', scope], queryFn: () => api.get<Board>(`/motivation/leaderboard?scope=${scope}`) });
  const prefs = usePreferences();
  const optedIn = summary.data?.preferences.showOnLeaderboard ?? false;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader
          title="Weekly XP"
          description={q.data ? `Week starting ${formatDate(q.data.weekStart)}. Resets every Monday.` : undefined}
          action={
            me.activeOrg ? (
              <Segmented
                label="Leaderboard scope"
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'global', label: 'Everyone' },
                  { value: 'org', label: me.activeOrg.orgName },
                ]}
              />
            ) : undefined
          }
        />
        <CardBody>
          {q.isLoading ? (
            <SkeletonRows rows={5} />
          ) : q.error ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : !q.data!.entries.length ? (
            <EmptyState className="border-0! bg-transparent! px-0! py-8!" icon={<RankingIcon size={22} />} title="No one on this board yet" description="Only people who opt in appear here, and only with XP from this week." />
          ) : (
            <ol className="divide-y divide-border">
              {q.data!.entries.map((e) => (
                <li key={e.userId} className={clsx('flex items-center gap-3 py-2', e.isMe && 'rounded-md bg-accent-soft px-2')}>
                  <span className="w-6 text-right text-[13px] font-semibold tabular-nums text-muted">{e.rank}</span>
                  <Avatar name={e.name} color={e.avatarColor} size={26} />
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[13.5px]">
                    <span className="truncate">{e.isMe ? `${e.name} (you)` : e.name}</span>
                    {e.isSample && <ProvenanceTag kind="sample" />}
                  </span>
                  <span className="text-[13px] font-medium tabular-nums text-xp">{e.xp} XP</span>
                </li>
              ))}
            </ol>
          )}
          {q.data && !q.data.entries.some((e) => e.isMe) && (
            <div className="mt-3 flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2 text-[13px]">
              <span className="flex items-center gap-1.5 text-muted">
                <EyeSlashIcon size={15} /> You (only visible to you)
              </span>
              <span className="font-medium tabular-nums">{q.data.me.xp} XP this week</span>
            </div>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Your visibility" />
        <CardBody className="space-y-3">
          <Switch
            checked={optedIn}
            disabled={prefs.isPending || summary.isLoading}
            onCheckedChange={(v) => prefs.mutate({ showOnLeaderboard: v })}
            label="Show me on leaderboards"
            description="Off by default. When on, your name and weekly XP appear to others on the public board and your organization's board."
          />
          <p className="text-[12px] text-subtle">People who do not opt in never appear on any leaderboard. Your own position is always shown to you privately.</p>
        </CardBody>
      </Card>
    </div>
  );
}
