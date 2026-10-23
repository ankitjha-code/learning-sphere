import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { Card, ErrorState, PageHeader, SkeletonRows } from '@/components/ui';

type Guidelines = { version: string; summary: string; sections: { title: string; points: string[] }[] };

export default function GuidelinesPage() {
  const q = useQuery({ queryKey: ['community-guidelines'], queryFn: () => api.get<{ guidelines: Guidelines }>('/community/guidelines'), staleTime: Infinity });
  return (
    <div className="max-w-3xl">
      <PageHeader
        breadcrumb={
          <Link to="/app/community" className="hover:underline">
            Community
          </Link>
        }
        title="Community guidelines"
        description={q.data?.guidelines.summary}
      />
      {q.isLoading ? (
        <SkeletonRows rows={5} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <Card className="divide-y divide-border">
            {q.data!.guidelines.sections.map((s) => (
              <section key={s.title} className="p-5">
                <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{s.title}</h2>
                <ul className="mt-3 space-y-2">
                  {s.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-[14px] leading-relaxed">
                      <CheckIcon size={16} className="mt-1 shrink-0 text-success" aria-hidden />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </Card>
          <p className="mt-3 text-[12px] text-subtle">Version {q.data!.guidelines.version}</p>
        </>
      )}
    </div>
  );
}
