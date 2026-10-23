import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircleIcon, ClockIcon, XCircleIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Banner, ButtonLink, Card, CardBody, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { DetailList } from '@/features/admin/components';
import { ModeBadge, ModeBanner } from './components';
import type { CheckoutResponse } from './api';

const POLL_MS = 2500;
const GIVE_UP_MS = 3 * 60_000;

/**
 * Where Razorpay (callback_url) and Stripe (success_url / cancel_url) send the payer back.
 * Nothing on this page is trusted by itself: the provider's query parameters are sent to the
 * server, which verifies the signature or fetches the status from the provider API.
 */
export default function BillingReturnPage() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const checkoutId = params.get('checkout') ?? '';
  const valid = /^[0-9a-f-]{36}$/i.test(checkoutId);
  const [returnError, setReturnError] = useState<string | null>(null);
  const [returned, setReturned] = useState(false);
  const posted = useRef(false);
  const startedAt = useRef(Date.now());
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), GIVE_UP_MS);
    return () => clearTimeout(t);
  }, []);

  // 1. Hand the provider's return parameters to the server once, then tidy the URL.
  useEffect(() => {
    if (!valid || posted.current) return;
    posted.current = true;
    const provided: Record<string, string> = {};
    params.forEach((v, k) => {
      if (k !== 'checkout') provided[k] = v;
    });
    api
      .post<CheckoutResponse>(`/billing/checkouts/${checkoutId}/return`, { params: provided })
      .then((r) => qc.setQueryData(['billing', 'checkout', checkoutId], r))
      .catch((e) => setReturnError(e instanceof ApiError && e.status === 404 ? null : errorMessage(e)))
      .finally(() => {
        setReturned(true);
        setParams({ checkout: checkoutId }, { replace: true });
      });
  }, [valid]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Poll our server (which may ask the provider) until the status is final.
  const q = useQuery({
    queryKey: ['billing', 'checkout', checkoutId],
    queryFn: () => api.get<CheckoutResponse>(`/billing/checkouts/${checkoutId}`),
    enabled: valid && returned,
    refetchInterval: (query) => {
      const s = query.state.data?.checkout.status;
      if (s && s !== 'pending') return false;
      return Date.now() - startedAt.current > GIVE_UP_MS ? false : POLL_MS;
    },
  });

  useEffect(() => {
    if (q.data?.checkout.status === 'paid') qc.invalidateQueries({ queryKey: ['billing', 'overview'] });
  }, [q.data?.checkout.status, qc]);

  if (!valid) {
    return (
      <div>
        <PageHeader title="Payment" />
        <EmptyState icon={<XCircleIcon size={22} />} title="This link is incomplete" description="It does not say which checkout to confirm. Open Plan & billing to see your plan and any unfinished checkout." action={<ButtonLink to="/app/billing">Plan & billing</ButtonLink>} />
      </div>
    );
  }

  const data = q.data;
  const ch = data?.checkout;
  const gaveUp = ch?.status === 'pending' && timedOut;
  // When the checkout could not be loaded at all, the banner above says so; skip the empty body.
  const hasBody = !!ch || !q.error;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Payment" description="We confirm every payment with the provider before changing your plan." />
      {data && <ModeBanner mode={data.mode} notice={data.notice} />}
      {returnError && (
        <Banner tone="danger" title="We could not verify the return from the payment page">
          {returnError}
        </Banner>
      )}
      {q.error && !data && (
        <Banner tone="danger" title="Could not load this checkout">
          {errorMessage(q.error)}
        </Banner>
      )}
      <Card>
        {hasBody && (
        <CardBody className="space-y-4 pt-5">
          {(!ch || (ch.status === 'pending' && !gaveUp)) && !q.error && (
            <div className="flex items-center gap-3" role="status" aria-live="polite">
              <Spinner size={22} />
              <div>
                <div className="text-[15px] font-semibold">Confirming payment…</div>
                <p className="text-[13px] text-muted">Waiting for {ch?.providerLabel ?? 'the payment provider'} to confirm. This usually takes a few seconds. You can keep this page open.</p>
              </div>
            </div>
          )}
          {gaveUp && (
            <div className="flex items-start gap-3" role="status">
              <ClockIcon size={24} className="mt-0.5 shrink-0 text-warning" aria-hidden />
              <div>
                <div className="text-[15px] font-semibold">No confirmation yet</div>
                <p className="text-[13px] text-muted">
                  {ch!.providerLabel} has not confirmed a payment for this checkout. If you completed the payment, the plan is applied as soon as the confirmation arrives and the organization admins are notified. If you did not pay, nothing was charged.
                </p>
              </div>
            </div>
          )}
          {ch?.status === 'paid' && (
            <div className="flex items-start gap-3" role="status">
              <CheckCircleIcon size={26} weight="fill" className="mt-0.5 shrink-0 text-success" aria-hidden />
              <div>
                <div className="text-[15px] font-semibold">Payment confirmed</div>
                <p className="text-[13px] text-muted">
                  {ch.providerLabel} confirmed the payment{ch.mode === 'test' ? ' (test mode: no real money moved)' : ''}. The plan is active
                  {data?.subscription?.currentPeriodEnd ? ` and paid through ${formatDate(data.subscription.currentPeriodEnd)}` : ''}.
                </p>
              </div>
            </div>
          )}
          {ch && (ch.status === 'failed' || ch.status === 'expired' || ch.status === 'cancelled') && (
            <div className="flex items-start gap-3" role="status">
              <XCircleIcon size={26} weight="fill" className="mt-0.5 shrink-0 text-danger" aria-hidden />
              <div>
                <div className="text-[15px] font-semibold">
                  {ch.status === 'failed' ? 'The payment did not go through' : ch.status === 'expired' ? 'This checkout expired' : 'Checkout cancelled'}
                </div>
                <p className="text-[13px] text-muted">
                  {ch.failureReason ? `${ch.failureReason} ` : ''}Your plan has not changed. You can start a new checkout from Plan & billing.
                </p>
              </div>
            </div>
          )}
          {ch && (
            <DetailList
              items={[
                ['Amount', ch.amountLabel],
                ['Plan', ch.planId.charAt(0).toUpperCase() + ch.planId.slice(1)],
                ['Provider', <span key="p" className="inline-flex items-center gap-2">{ch.providerLabel} <ModeBadge mode={ch.mode} /></span>],
                ['Provider reference', <span key="r" className="font-mono text-[12.5px]">{ch.providerRef ?? 'None'}</span>],
              ]}
            />
          )}
        </CardBody>
        )}
        <div className={clsx('flex flex-wrap justify-end gap-2 px-5 py-4', hasBody && 'border-t border-border')}>
          {ch?.status === 'paid' && <ButtonLink to="/app/billing/history">Payment history</ButtonLink>}
          <ButtonLink to="/app/billing" variant={ch?.status === 'paid' ? 'primary' : 'secondary'}>
            Back to Plan & billing
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
