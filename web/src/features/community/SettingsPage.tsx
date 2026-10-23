import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ProhibitIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { Avatar, Button, Card, CardBody, CardHeader, ErrorState, PageHeader, SkeletonRows, Switch } from '@/components/ui';

type Prefs = { notifyReplies: boolean; notifyMentions: boolean; showReputation: boolean; allowMentorInvites: boolean };

export default function SettingsPage() {
  const qc = useQueryClient();
  const prefs = useQuery({ queryKey: ['community-prefs'], queryFn: () => api.get<{ preferences: Prefs }>('/community/preferences') });
  const blocks = useQuery({ queryKey: ['community-blocks'], queryFn: () => api.get<{ items: { userId: string; name: string; avatarColor: string | null; createdAt: string }[] }>('/community/blocks') });
  const save = useMutation({
    mutationFn: (patch: Partial<Prefs>) => api.patch('/community/preferences', patch),
    onSuccess: () => (toast.success('Preferences saved'), qc.invalidateQueries({ queryKey: ['community-prefs'] })),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const unblock = useMutation({
    mutationFn: (userId: string) => api.del(`/community/blocks/${userId}`),
    onSuccess: () => (toast.success('Unblocked'), qc.invalidateQueries({ queryKey: ['community-blocks'] })),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const p = prefs.data?.preferences;
  return (
    <div className="max-w-2xl">
      <PageHeader
        breadcrumb={
          <Link to="/app/community" className="hover:underline">
            Community
          </Link>
        }
        title="Community settings"
        description={
          <>
            Notification channels (in-app or email) for community activity are set in{' '}
            <Link to="/app/settings/notifications" className="text-accent-text hover:underline">
              Settings, Notifications
            </Link>
            .
          </>
        }
      />
      <div className="space-y-4">
        <Card>
          <CardHeader title="Notifications and privacy" />
          <CardBody className="space-y-4">
            {prefs.isLoading ? (
              <SkeletonRows rows={3} />
            ) : prefs.error ? (
              <ErrorState error={prefs.error} onRetry={() => prefs.refetch()} />
            ) : (
              <>
                <Switch checked={p!.notifyReplies} disabled={save.isPending} onCheckedChange={(v) => save.mutate({ notifyReplies: v })} label="Replies to my threads" description="Get notified when someone replies to a thread you started." />
                <Switch checked={p!.notifyMentions} disabled={save.isPending} onCheckedChange={(v) => save.mutate({ notifyMentions: v })} label="Mentions" description="Get notified when someone mentions you with @ in a thread you take part in." />
                <Switch checked={p!.showReputation} disabled={save.isPending} onCheckedChange={(v) => save.mutate({ showReputation: v })} label="Show my reputation" description="When off, others do not see your reputation score. You still do." />
                <Switch checked={p!.allowMentorInvites} disabled={save.isPending} onCheckedChange={(v) => save.mutate({ allowMentorInvites: v })} label="Allow invitations to private questions" description="For mentors: learners can invite you to answer their private questions." />
              </>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Blocked people" description="Their posts are hidden for you, and they cannot reply to your threads or join your study groups." />
          <CardBody>
            {blocks.isLoading ? (
              <SkeletonRows rows={2} />
            ) : blocks.error ? (
              <ErrorState error={blocks.error} onRetry={() => blocks.refetch()} />
            ) : !blocks.data!.items.length ? (
              <div className="flex items-start gap-3 rounded-md bg-surface-2 px-4 py-3.5 text-[13px]">
                <ProhibitIcon size={18} className="mt-px shrink-0 text-subtle" aria-hidden />
                <div>
                  <div className="font-medium">You have not blocked anyone</div>
                  <div className="mt-0.5 text-muted">Block someone from the menu on any of their posts.</div>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {blocks.data!.items.map((b) => (
                  <li key={b.userId} className="flex items-center justify-between gap-2 py-2">
                    <span className="flex items-center gap-2 text-[13.5px]">
                      <Avatar name={b.name} color={b.avatarColor} size={26} />
                      {b.name}
                      <span className="text-[12px] text-subtle">blocked {timeAgo(b.createdAt)}</span>
                    </span>
                    <Button size="sm" variant="ghost" loading={unblock.isPending && unblock.variables === b.userId} onClick={() => unblock.mutate(b.userId)}>
                      Unblock
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
