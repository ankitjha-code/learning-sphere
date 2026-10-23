import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HandHeartIcon, FireIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { Avatar, Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, EmptyState, ErrorState, Field, Input, Progress, ProvenanceTag, Skeleton, SkeletonRows } from '@/components/ui';

type Partner = { id: string; status: 'pending' | 'active'; direction: 'incoming' | 'outgoing'; createdAt: string; partner: { id: string; name: string; avatarColor: string | null; isSample: boolean } | null };
type PartnerProgress = { partner: { name: string }; streak: { current: number; activeToday: boolean }; weeklyGoals: { title: string; value: number | null; target: number | null; met: boolean | null }[] };

function PartnerProgressView({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['partner-progress', id], queryFn: () => api.get<PartnerProgress>(`/motivation/partners/${id}/progress`) });
  if (q.isLoading) return <Skeleton className="h-16" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!;
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-1.5 text-[13px]">
        <FireIcon size={15} className="text-xp" />
        {d.streak.current} day streak {d.streak.activeToday ? '· studied today' : ''}
      </div>
      {d.weeklyGoals.length ? (
        <ul className="space-y-2">
          {d.weeklyGoals.map((g, i) => (
            <li key={i}>
              <div className="flex justify-between text-[13px]">
                <span>{g.title}</span>
                {g.target !== null && (
                  <span className="tabular-nums text-muted">
                    {g.value}/{g.target}
                  </span>
                )}
              </div>
              {g.target !== null && <Progress value={g.value ?? 0} max={g.target} tone={g.met ? 'success' : 'accent'} className="mt-1" label={`${g.title} progress`} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-muted">No weekly goals set this week.</p>
      )}
    </div>
  );
}

export default function PartnersTab() {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [ending, setEnding] = useState<Partner | null>(null);
  const q = useQuery({ queryKey: ['partners'], queryFn: () => api.get<{ items: Partner[] }>('/motivation/partners') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['partners'] });
  const invite = useMutation({
    mutationFn: () => api.post('/motivation/partners', { email }),
    onSuccess: () => (toast.success('Invite sent'), setEmail(''), refresh()),
  });
  const accept = useMutation({ mutationFn: (id: string) => api.post(`/motivation/partners/${id}/accept`), onSuccess: () => (toast.success('You are now accountability partners'), refresh()), onError: (e) => toast.error(errorMessage(e)) });
  const end = useMutation({ mutationFn: (id: string) => api.post(`/motivation/partners/${id}/end`), onSuccess: () => (toast.success('Partnership ended'), setEnding(null), refresh()), onError: (e) => toast.error(errorMessage(e)) });
  const fields = invite.error instanceof ApiError ? invite.error.fields : {};
  const items = q.data?.items ?? [];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-3">
        {q.isLoading ? (
          <SkeletonRows rows={2} />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !items.length ? (
          <EmptyState icon={<HandHeartIcon size={22} />} title="No accountability partner yet" description="A partner sees your weekly goal progress and streak, and you see theirs. That is all. It is optional and you can end it at any time." />
        ) : (
          items.map((p) => (
            <Card key={p.id}>
              <CardBody className="pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[14px] font-medium">
                    {p.partner && <Avatar name={p.partner.name} color={p.partner.avatarColor} size={28} />}
                    {p.partner?.name ?? 'Unknown'}
                    {p.partner?.isSample && <ProvenanceTag kind="sample" />}
                    {p.status === 'pending' && <Badge tone="warning">{p.direction === 'incoming' ? 'Wants to partner with you' : 'Invite sent'}</Badge>}
                  </span>
                  <span className="flex gap-2">
                    {p.status === 'pending' && p.direction === 'incoming' && (
                      <Button size="sm" variant="primary" loading={accept.isPending} onClick={() => accept.mutate(p.id)}>
                        Accept
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setEnding(p)}>
                      {p.status === 'pending' ? (p.direction === 'incoming' ? 'Decline' : 'Cancel invite') : 'End'}
                    </Button>
                  </span>
                </div>
                {p.status === 'active' && <PartnerProgressView id={p.id} />}
              </CardBody>
            </Card>
          ))
        )}
      </div>
      <Card>
        <CardHeader title="Invite a partner" description="They need a LearnSphere account. They will be asked to accept." />
        <CardBody>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              invite.mutate();
            }}
          >
            <Field label="Their email" error={fields.email ?? (invite.error && !Object.keys(fields).length ? errorMessage(invite.error) : undefined)}>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            </Field>
            <Button type="submit" variant="primary" loading={invite.isPending} disabled={!email.includes('@')} disabledReason="Enter an email address">
              Send invite
            </Button>
          </form>
          <p className="mt-3 text-[12px] text-subtle">Shared: weekly goal progress and current streak. Never shared: XP, activity details, journal, notes, applications or messages.</p>
        </CardBody>
      </Card>
      <ConfirmDialog
        open={!!ending}
        onOpenChange={(v) => !v && setEnding(null)}
        title={ending?.status === 'active' ? 'End this partnership?' : 'Remove this invite?'}
        description="You both stop seeing each other's progress. They are not notified."
        confirmLabel={ending?.status === 'active' ? 'End partnership' : 'Remove invite'}
        loading={end.isPending}
        onConfirm={() => {
          if (ending) end.mutate(ending.id);
        }}
      />
    </div>
  );
}
