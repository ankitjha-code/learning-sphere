import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FlagCheckeredIcon, UsersThreeIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Badge, Button, Card, CardBody, Dialog, EmptyState, ErrorState, Field, Input, Progress, ProvenanceTag, Segmented, SkeletonRows } from '@/components/ui';

type Challenge = {
  id: string;
  title: string;
  description: string;
  kind: 'individual' | 'team' | 'season';
  metric: string;
  target: number;
  startsAt: string;
  endsAt: string;
  orgName: string | null;
  participants: number;
  joined: boolean;
  teamName: string | null;
  myProgress: number | null;
  state: 'current' | 'upcoming' | 'past';
};
type Detail = {
  standings: { userId: string; name: string; isSample: boolean; teamName: string | null; value: number; isMe: boolean }[];
  teams: { teamName: string; members: number; value: number }[];
};

const METRIC: Record<string, string> = { problems_solved: 'problems solved', topics_completed: 'topics completed', minutes: 'minutes studied', xp: 'XP' };

function Standings({ id, kind }: { id: string; kind: string }) {
  const q = useQuery({ queryKey: ['challenge', id], queryFn: () => api.get<Detail>(`/motivation/challenges/${id}`) });
  if (q.isLoading) return <SkeletonRows rows={2} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!;
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {kind === 'team' && (
        <div>
          <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-subtle">Teams</div>
          {d.teams.length ? (
            <ol className="space-y-1 text-[13px]">
              {d.teams.map((t, i) => (
                <li key={t.teamName} className="flex justify-between">
                  <span>
                    {i + 1}. {t.teamName} <span className="text-subtle">({t.members})</span>
                  </span>
                  <span className="tabular-nums">{t.value}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[12.5px] text-muted">No teams yet.</p>
          )}
        </div>
      )}
      <div>
        <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-subtle">Standings (opted-in people and you)</div>
        <ol className="space-y-1 text-[13px]">
          {d.standings.slice(0, 10).map((s, i) => (
            <li key={s.userId} className="flex justify-between gap-2">
              <span className="flex items-center gap-1">
                {i + 1}. {s.isMe ? 'You' : s.name}
                {s.isSample && <ProvenanceTag kind="sample" />}
              </span>
              <span className="tabular-nums">{s.value}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function JoinTeamDialog({ c, onClose }: { c: Challenge; onClose: () => void }) {
  const qc = useQueryClient();
  const [team, setTeam] = useState('');
  const m = useMutation({
    mutationFn: () => api.post(`/motivation/challenges/${c.id}/join`, { teamName: team }),
    onSuccess: () => (toast.success(`Joined as ${team}`), qc.invalidateQueries({ queryKey: ['challenges'] }), qc.invalidateQueries({ queryKey: ['challenge', c.id] }), onClose()),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Join ${c.title}`}
      description="Type an existing team's exact name to join it, or a new name to start a team."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={team.trim().length < 2} disabledReason="Enter a team name" onClick={() => m.mutate()}>
            Join
          </Button>
        </>
      }
    >
      <Field label="Team name">
        <Input value={team} onChange={(e) => setTeam(e.target.value)} maxLength={40} />
      </Field>
    </Dialog>
  );
}

export default function ChallengesTab() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'current' | 'upcoming' | 'past'>('current');
  const [open, setOpen] = useState<string | null>(null);
  const [teamFor, setTeamFor] = useState<Challenge | null>(null);
  const q = useQuery({ queryKey: ['challenges', status], queryFn: () => api.get<{ items: Challenge[] }>(`/motivation/challenges?status=${status}`) });
  const act = useMutation({
    mutationFn: ({ c, join }: { c: Challenge; join: boolean }) => api.post(`/motivation/challenges/${c.id}/${join ? 'join' : 'leave'}`, {}),
    onSuccess: (_r, v) => (toast.success(v.join ? 'You joined the challenge' : 'You left the challenge'), qc.invalidateQueries({ queryKey: ['challenges'] })),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label="Challenge status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'current', label: 'Current' },
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'past', label: 'Past' },
          ]}
        />
        <p className="text-[12px] text-subtle">Challenges are optional. Only real, completed work counts, once.</p>
      </div>
      {q.isLoading ? (
        <SkeletonRows rows={3} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data!.items.length ? (
        <EmptyState icon={<FlagCheckeredIcon size={22} />} title={`No ${status} challenges`} description="Platform and organization challenges appear here when they are announced." />
      ) : (
        <div className="space-y-3">
          {q.data!.items.map((c) => (
            <Card key={c.id}>
              <CardBody className="pt-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[15px] font-semibold">{c.title}</span>
                      <Badge>{c.kind === 'team' ? 'Team' : c.kind === 'season' ? 'Season' : 'Individual'}</Badge>
                      {c.orgName && <Badge tone="info">{c.orgName}</Badge>}
                      {c.joined && <Badge tone="success">{c.teamName ? `Joined · ${c.teamName}` : 'Joined'}</Badge>}
                    </div>
                    <p className="mt-1 text-[13px] text-muted">{c.description}</p>
                    <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-subtle">
                      <span>
                        {formatDate(c.startsAt)} to {formatDate(c.endsAt)}
                      </span>
                      <span>
                        Goal: {c.target} {METRIC[c.metric] ?? c.metric}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <UsersThreeIcon size={13} /> {c.participants}
                      </span>
                    </div>
                  </div>
                  {c.state !== 'past' &&
                    (c.joined ? (
                      <Button size="sm" variant="ghost" onClick={() => act.mutate({ c, join: false })}>
                        Leave
                      </Button>
                    ) : (
                      <Button size="sm" variant="primary" loading={act.isPending && act.variables?.c.id === c.id} onClick={() => (c.kind === 'team' ? setTeamFor(c) : act.mutate({ c, join: true }))}>
                        Join
                      </Button>
                    ))}
                </div>
                {c.joined && c.myProgress !== null && (
                  <div className="mt-3">
                    <Progress value={c.myProgress} max={c.target} tone={c.myProgress >= c.target ? 'success' : 'xp'} label={`${c.title} progress`} />
                    <div className="mt-1 text-[12px] tabular-nums text-muted">
                      {c.myProgress} of {c.target} {METRIC[c.metric] ?? ''}
                      {c.myProgress >= c.target ? ' · completed' : ''}
                    </div>
                  </div>
                )}
                <button type="button" className="mt-2 text-[12.5px] font-medium text-accent-text hover:underline" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id}>
                  {open === c.id ? 'Hide standings' : 'Show standings'}
                </button>
                {open === c.id && <Standings id={c.id} kind={c.kind} />}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
      {teamFor && <JoinTeamDialog c={teamFor} onClose={() => setTeamFor(null)} />}
    </div>
  );
}
