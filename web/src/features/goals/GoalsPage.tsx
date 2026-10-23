import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, Skeleton, Tabs } from '@/components/ui';

const OverviewTab = lazy(() => import('./OverviewTab'));
const LeaderboardTab = lazy(() => import('./LeaderboardTab'));
const ChallengesTab = lazy(() => import('./ChallengesTab'));
const PartnersTab = lazy(() => import('./PartnersTab'));
const JournalTab = lazy(() => import('./JournalTab'));
const AnalyticsTab = lazy(() => import('./AnalyticsTab'));

const TABS = [
  { value: 'overview', label: 'Goals and streaks' },
  { value: 'leaderboard', label: 'Leaderboard' },
  { value: 'challenges', label: 'Challenges' },
  { value: 'partners', label: 'Accountability' },
  { value: 'journal', label: 'Journal' },
  { value: 'analytics', label: 'Analytics' },
];

export default function GoalsPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab')! : 'overview';
  return (
    <div>
      <PageHeader title="Goals and progress" description="Set realistic goals, keep a healthy rhythm and celebrate real progress. Missed days never cost you anything, and rest days are part of the plan." />
      <Tabs value={tab} onValueChange={(v) => setParams(v === 'overview' ? {} : { tab: v }, { replace: true })} tabs={TABS} className="mb-4" />
      <Suspense fallback={<Skeleton className="h-64" />}>
        {tab === 'overview' && <OverviewTab />}
        {tab === 'leaderboard' && <LeaderboardTab />}
        {tab === 'challenges' && <ChallengesTab />}
        {tab === 'partners' && <PartnersTab />}
        {tab === 'journal' && <JournalTab />}
        {tab === 'analytics' && <AnalyticsTab />}
      </Suspense>
    </div>
  );
}
