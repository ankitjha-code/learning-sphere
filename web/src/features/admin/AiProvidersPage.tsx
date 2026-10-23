import { useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs } from '@/components/ui';
import { ProvidersTab } from './ai/ProvidersTab';
import { SettingsTab } from './ai/SettingsTab';
import { UsageTab } from './ai/UsageTab';
import { EvalsTab } from './ai/EvalsTab';
import { FeedbackTab } from './ai/FeedbackTab';

const TABS = [
  { value: 'providers', label: 'Providers' },
  { value: 'limits', label: 'Limits & toggles' },
  { value: 'usage', label: 'Usage' },
  { value: 'evals', label: 'Evaluations' },
  { value: 'feedback', label: 'Feedback & reports' },
];

/** Admin → AI. Platform admins only (enforced by the API on every request). */
export default function AiProvidersPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab')! : 'providers';
  return (
    <div>
      <PageHeader
        title="AI providers"
        description="Connect free or student-credit AI providers, set limits, watch usage and check behaviour. AI stays optional: when nothing is configured, every other feature keeps working."
      />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })} tabs={TABS} className="mb-6" />
      {tab === 'providers' && <ProvidersTab />}
      {tab === 'limits' && <SettingsTab />}
      {tab === 'usage' && <UsageTab />}
      {tab === 'evals' && <EvalsTab />}
      {tab === 'feedback' && <FeedbackTab />}
    </div>
  );
}
