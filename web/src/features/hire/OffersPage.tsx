import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SealCheckIcon } from '@phosphor-icons/react';
import { api, qs } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { ButtonLink, Card, EmptyState, ErrorState, PageHeader, Segmented, SkeletonRows, StatusBadge } from '@/components/ui';
import { OfferActions } from './offer-ui';

type Row = { id: string; applicationId: string; title: string; compensationText: string; startDate: string | null; expiresAt: string | null; status: string; candidateName: string; jobTitle: string; postingId: string; updatedAt: string };

export default function OffersPage() {
  const [status, setStatus] = useState<'' | 'draft' | 'extended' | 'accepted' | 'declined'>('');
  const q = useQuery({ queryKey: ['hire', 'offers', status], queryFn: () => api.get<{ items: Row[] }>(`/hire/offers${qs({ status })}`) });
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Offers" description="Draft privately, extend when ready. Candidates accept or decline from their application page, and every step is audited." />
      <Segmented
        label="Filter offers"
        value={status}
        onChange={setStatus}
        options={[
          { value: '', label: 'All' },
          { value: 'draft', label: 'Drafts' },
          { value: 'extended', label: 'Awaiting answer' },
          { value: 'accepted', label: 'Accepted' },
          { value: 'declined', label: 'Declined' },
        ]}
      />
      {q.isLoading ? (
        <SkeletonRows rows={4} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.items.length ? (
        <EmptyState
          icon={<SealCheckIcon size={22} />}
          title="No offers here"
          description="Move a candidate to the Offer stage, then choose Draft offer on their profile."
          action={<ButtonLink to="/app/hire/candidates">Go to candidates</ButtonLink>}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13.5px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/60 text-left text-[12px] text-muted">
                <th className="px-4 py-2.5 font-medium">Candidate</th>
                <th className="px-4 py-2.5 font-medium">Offer</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Dates</th>
                <th className="px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((o) => (
                <tr key={o.id} className="border-b border-border/60 align-top last:border-0">
                  <td className="px-4 py-3">
                    <Link to={`/app/hire/candidates/${o.applicationId}?tab=offers`} className="font-medium hover:underline">
                      {o.candidateName}
                    </Link>
                    <div className="text-[12px] text-muted">{o.jobTitle}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{o.title}</div>
                    <div className="max-w-xs text-[12px] text-muted">{o.compensationText}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3 text-[12.5px] text-muted">
                    {o.startDate && <div>Starts {formatDate(o.startDate)}</div>}
                    {o.expiresAt && <div>Respond by {formatDate(o.expiresAt)}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <OfferActions offer={o} candidateName={o.candidateName} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
