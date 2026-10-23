import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SealCheckIcon, XCircleIcon } from '@phosphor-icons/react';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { ErrorState, SkeletonRows, Card } from '@/components/ui';
import { PublicLayout } from './PublicLayout';

type Verify = {
  valid: true;
  certificate: { title: string; holderName: string; issuer: string; issuedAt: string; verificationCode: string; basis: string; statement: string };
};

/** Public verification of a platform completion record at /verify/:code. Shows certificate facts only. */
export default function VerifyCertificatePage() {
  const { code = '' } = useParams();
  const q = useQuery({ queryKey: ['verify', code], queryFn: () => api.get<Verify>(`/portfolio/verify/${encodeURIComponent(code)}`), retry: false });
  useEffect(() => {
    document.title = 'Verify a completion record · LearnSphere Nexus';
  }, []);
  const invalid = q.error instanceof ApiError && q.error.status === 404;
  return (
    <PublicLayout>
      <h1 className="mb-1.5 font-display text-[26px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[30px]">Verify a completion record</h1>
      <p className="mb-6 text-[14px] text-muted">
        Code <span className="font-mono">{code.toUpperCase()}</span>
      </p>
      {q.isLoading ? (
        <SkeletonRows rows={4} />
      ) : invalid ? (
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <XCircleIcon size={32} weight="fill" className="shrink-0 text-danger" aria-hidden />
            <div>
              <h2 className="text-[17px] font-semibold">No matching record</h2>
              <p className="mt-1 text-[14px] text-muted">
                LearnSphere Nexus has no platform completion record with this code. Check the code for typos. Certificates from other organizations cannot be verified here.
              </p>
            </div>
          </div>
        </Card>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <SealCheckIcon size={32} weight="fill" className="shrink-0 text-success" aria-hidden />
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold">Valid platform completion record</h2>
              <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-[14px]">
                <dt className="text-muted">Record</dt>
                <dd className="font-medium">{q.data!.certificate.title}</dd>
                <dt className="text-muted">Holder</dt>
                <dd>{q.data!.certificate.holderName}</dd>
                <dt className="text-muted">Basis</dt>
                <dd>{q.data!.certificate.basis}</dd>
                <dt className="text-muted">Issued</dt>
                <dd>{formatDate(q.data!.certificate.issuedAt)}</dd>
                <dt className="text-muted">Issuer</dt>
                <dd>{q.data!.certificate.issuer}</dd>
                <dt className="text-muted">Code</dt>
                <dd className="font-mono">{q.data!.certificate.verificationCode}</dd>
              </dl>
              <p className="mt-5 rounded-md bg-surface-2 p-3 text-[13px] text-muted">{q.data!.certificate.statement}</p>
            </div>
          </div>
        </Card>
      )}
    </PublicLayout>
  );
}
