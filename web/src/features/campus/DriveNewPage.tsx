import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { ErrorState, PageHeader, SkeletonRows } from '@/components/ui';
import { CAMPUS_KEY } from './shared';
import { DriveForm, driveToForm, formToPayload, type DriveFormValue } from './DriveForm';
import type { EligibilityRules } from './types';

export default function DriveNewPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: [...CAMPUS_KEY, 'settings'], queryFn: () => api.get<{ settings: { eligibilityDefaults: EligibilityRules } }>('/campus/settings') });
  const m = useMutation({
    mutationFn: (v: DriveFormValue) => api.post<{ drive: { id: string } }>('/campus/drives', formToPayload(v)),
    onSuccess: (r) => {
      toast.success('Drive created as a draft. Check eligibility, then open it.');
      qc.invalidateQueries({ queryKey: CAMPUS_KEY });
      nav(`/app/campus/drives/${r.drive.id}?tab=eligibility`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        breadcrumb={
          <Link to="/app/campus/drives" className="hover:text-fg">
            Placement drives
          </Link>
        }
        title="New placement drive"
        description="Drives start as drafts. Nobody is notified until you open the drive and invite students."
      />
      {settings.error ? (
        <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
      ) : !settings.data ? (
        <SkeletonRows rows={6} />
      ) : (
        <DriveForm initial={driveToForm(undefined, settings.data.settings.eligibilityDefaults)} onSubmit={(v) => m.mutate(v)} submitting={m.isPending} error={m.error} submitLabel="Create draft drive" />
      )}
    </div>
  );
}
