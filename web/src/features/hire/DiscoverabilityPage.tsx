import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Card, CardBody, CardHeader, ErrorState, PageHeader, SkeletonRows, Switch } from '@/components/ui';

type Prefs = { discoverableByRecruiters: boolean; updatedAt: string | null; explainer: string };

export default function DiscoverabilityPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['hire', 'candidate-preferences'], queryFn: () => api.get<Prefs>('/hire/candidate-preferences') });
  const m = useMutation({
    mutationFn: (v: boolean) => api.patch<Prefs>('/hire/candidate-preferences', { discoverableByRecruiters: v }),
    onSuccess: (r) => {
      toast.success(r.discoverableByRecruiters ? 'Recruiters can now find you in search.' : 'You are hidden from recruiter search.');
      qc.invalidateQueries({ queryKey: ['hire', 'candidate-preferences'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="Recruiter visibility" description="Choose whether employers on LearnSphere Nexus can find you. It is off unless you turn it on." />
      {q.isLoading ? (
        <SkeletonRows rows={2} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <Card>
          <CardHeader title="Candidate search" />
          <CardBody className="space-y-4">
            <Switch
              checked={q.data!.discoverableByRecruiters}
              disabled={m.isPending}
              onCheckedChange={(v) => m.mutate(v)}
              label="Let recruiters find me"
              description={q.data!.discoverableByRecruiters ? 'On: you can appear in recruiter search results.' : 'Off: only employers you apply to can see your application.'}
            />
            <p className="text-[13.5px] text-muted">{q.data!.explainer}</p>
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted">
              <li>Search uses your skills and their evidence. Personal characteristics are never used to rank you.</li>
              <li>Recruiters can invite you to apply. Applying is always your choice.</li>
              <li>You can turn this off at any time; it takes effect immediately.</li>
            </ul>
            {q.data!.updatedAt && <p className="text-[12px] text-subtle">Last changed {formatDateTime(q.data!.updatedAt)}</p>}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
