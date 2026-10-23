import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CaretLeftIcon, PrinterIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { Button, Banner, ErrorState, SkeletonRows } from '@/components/ui';
import { PortfolioView } from './PortfolioView';
import type { ComposedPortfolio } from './types';

/**
 * Print-friendly portfolio. There is no server-side PDF engine: use the browser's
 * Print dialog and choose "Save as PDF". The style block below hides the app shell when printing.
 */
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #portfolio-print, #portfolio-print * { visibility: visible !important; }
  #portfolio-print { position: absolute; inset: 0 auto auto 0; width: 100%; padding: 0 12mm; }
  #portfolio-print details { display: none; }
  @page { margin: 14mm 0; }
}`;

export default function PortfolioPrintPage() {
  const q = useQuery({ queryKey: ['portfolio-preview'], queryFn: () => api.get<ComposedPortfolio>('/portfolio/preview') });
  useEffect(() => {
    document.title = q.data ? `${q.data.owner.name} · Portfolio` : 'Portfolio';
  }, [q.data]);
  return (
    <div>
      <style>{PRINT_CSS}</style>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link to="/app/portfolio" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
          <CaretLeftIcon size={12} /> Portfolio editor
        </Link>
        <Button variant="primary" icon={<PrinterIcon size={16} />} onClick={() => window.print()} disabled={!q.data}>
          Print or save as PDF
        </Button>
      </div>
      <Banner tone="info" className="mb-4 print:hidden">
        Use your browser's print dialog and choose "Save as PDF" as the destination. The PDF shows what your sharing settings allow, with the same evidence labels.
      </Banner>
      {q.isLoading ? (
        <SkeletonRows rows={6} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div id="portfolio-print" className="mx-auto max-w-4xl rounded-xl border border-border bg-bg p-6 print:border-0 print:p-0">
          <PortfolioView v={q.data!} print />
          <p className="mt-8 text-[11px] text-subtle">Generated from LearnSphere Nexus on {new Date().toLocaleDateString()}. Platform completion records are not accredited qualifications.</p>
        </div>
      )}
    </div>
  );
}
