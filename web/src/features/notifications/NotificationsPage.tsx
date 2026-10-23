import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { GearSixIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { ButtonLink, PageHeader, Tabs } from '@/components/ui';
import type { NotificationRow } from '@/app/NotificationsBell';
import { NotificationsList } from './NotificationsList';
import { ActivityHistory } from './ActivityHistory';

type TabValue = 'all' | 'unread' | 'activity';
const TAB_VALUES: TabValue[] = ['all', 'unread', 'activity'];

export default function NotificationsPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as TabValue | null;
  const tab: TabValue = raw && TAB_VALUES.includes(raw) ? raw : 'all';

  // Shares the bell's cache key prefix so both stay in sync after mark-read.
  const unread = useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: () => api.get<{ items: NotificationRow[]; unread: number }>('/notifications?pageSize=8'),
  });

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Updates about your learning, deadlines, results and messages, plus a history of your activity."
        actions={
          <ButtonLink to="/app/settings/notifications" icon={<GearSixIcon size={16} />}>
            Notification settings
          </ButtonLink>
        }
      />
      <Tabs
        value={tab}
        onValueChange={(v) => setParams(v === 'all' ? {} : { tab: v })}
        tabs={[
          { value: 'all', label: 'All' },
          { value: 'unread', label: 'Unread', count: unread.data?.unread || undefined },
          { value: 'activity', label: 'Activity history' },
        ]}
        className="mb-6"
      />
      {tab === 'activity' ? <ActivityHistory /> : <NotificationsList key={tab} unreadOnly={tab === 'unread'} onShowAll={() => setParams({})} />}
    </div>
  );
}
