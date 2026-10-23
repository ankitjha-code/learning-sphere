import { Banner } from '@/components/ui';
import { useStatusBanner } from './api';

/**
 * Site-wide notice for unresolved high or critical incidents (title and status only).
 * INTEGRATION: render <StatusBanner /> near the top of the app shell's main area.
 */
export function StatusBanner() {
  const q = useStatusBanner();
  const items = q.data?.incidents ?? [];
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      {items.map((i) => (
        <Banner key={i.title} tone={i.severity === 'critical' ? 'danger' : 'warning'} title={i.title}>
          {i.status === 'monitoring' ? 'A fix is in place and the team is monitoring.' : 'The team is investigating. Some features may be slow or unavailable.'}
        </Banner>
      ))}
    </div>
  );
}
