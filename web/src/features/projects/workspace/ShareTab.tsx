import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GlobeIcon, LinkIcon, LockIcon, ArrowsClockwiseIcon, ProhibitIcon, IdentificationBadgeIcon, ArrowSquareOutIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { Button, Card, CardHeader, CardBody, CopyButton, Switch, Banner, SkeletonRows, ErrorState, ButtonLink } from '@/components/ui';
import type { ProjectDetail } from '../types';

type Share = { visibility: 'private' | 'unlisted' | 'public'; shareToken: string | null; showTasksPublic: boolean; sharePath: string | null; inPortfolio: boolean };

const OPTIONS = [
  { value: 'private', label: 'Private', icon: LockIcon, hint: 'Only you, your team and (for capstones) your faculty.' },
  { value: 'unlisted', label: 'Unlisted', icon: LinkIcon, hint: 'Anyone with the secret link. Revoke or rotate it any time.' },
  { value: 'public', label: 'Public', icon: GlobeIcon, hint: 'Anyone with the address can view the project page.' },
] as const;

export function ShareTab({ d }: { d: ProjectDetail }) {
  const pid = d.project.id;
  const qc = useQueryClient();
  const share = useQuery({ queryKey: ['project-share', pid], queryFn: () => api.get<Share>(`/projects/${pid}/share`), enabled: d.access.isOwner });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['project-share', pid] });
    qc.invalidateQueries({ queryKey: ['project', pid] });
    qc.invalidateQueries({ queryKey: ['portfolio'] });
  };
  const update = useMutation({
    mutationFn: (v: { visibility?: Share['visibility']; showTasksPublic?: boolean }) => api.patch(`/projects/${pid}/sharing`, v),
    onSuccess: () => {
      toast.success('Sharing updated');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const rotate = useMutation({
    mutationFn: () => api.post(`/projects/${pid}/share-token`),
    onSuccess: () => {
      toast.success('New link created. The old link no longer works.');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const revoke = useMutation({
    mutationFn: () => api.del(`/projects/${pid}/share-token`),
    onSuccess: () => {
      toast.success('Link revoked. Nobody can open it now.');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const portfolio = useMutation({
    mutationFn: async (add: boolean) => {
      const cur = await api.get<{ portfolio: { featuredProjectIds: string[] } }>('/portfolio');
      const ids = cur.portfolio.featuredProjectIds.filter((x) => x !== pid);
      return api.patch('/portfolio', { featuredProjectIds: add ? [pid, ...ids].slice(0, 20) : ids });
    },
    onSuccess: (_r, add) => {
      toast.success(add ? 'Added to your portfolio' : 'Removed from your portfolio');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!d.access.isOwner)
    return (
      <Card className="p-5 text-[13.5px] text-muted">
        Only the project owner controls sharing. This project is currently <strong className="text-fg">{d.project.visibility}</strong>.
      </Card>
    );
  if (share.error) return <ErrorState error={share.error} onRetry={() => share.refetch()} />;
  if (!share.data) return <SkeletonRows rows={3} />;
  const s = share.data;
  const url = s.sharePath ? `${window.location.origin}${s.sharePath}` : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Visibility" description="Public pages never show private notes, member emails or review drafts." />
        <CardBody className="space-y-2">
          <div role="radiogroup" aria-label="Project visibility" className="space-y-2">
            {OPTIONS.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border p-3 hover:bg-surface-2 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                <input type="radio" name="visibility" checked={s.visibility === o.value} disabled={update.isPending} onChange={() => update.mutate({ visibility: o.value })} className="mt-1 accent-[var(--accent)]" />
                <o.icon size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                <span>
                  <span className="block text-[14px] font-medium">{o.label}</span>
                  <span className="block text-[12.5px] text-muted">{o.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="pt-2">
            <Switch checked={s.showTasksPublic} onCheckedChange={(v) => update.mutate({ showTasksPublic: v })} disabled={update.isPending} label="Show the task board on the shared page" description="Off by default. Requirements, milestones and docs are always shown." />
          </div>
        </CardBody>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Share link" />
          <CardBody className="space-y-3">
            {url ? (
              <>
                <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-2">
                  <code className="min-w-0 flex-1 truncate text-[12.5px]">{url}</code>
                  <CopyButton value={url} label="Copy link" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <ButtonLink to={s.sharePath!} target="_blank" size="sm" icon={<ArrowSquareOutIcon size={14} />}>
                    Open shared page
                  </ButtonLink>
                  {s.visibility === 'unlisted' && (
                    <>
                      <Button size="sm" icon={<ArrowsClockwiseIcon size={14} />} loading={rotate.isPending} onClick={() => rotate.mutate()}>
                        New link
                      </Button>
                      <Button size="sm" variant="ghost" className="text-danger" icon={<ProhibitIcon size={14} />} loading={revoke.isPending} onClick={() => revoke.mutate()}>
                        Revoke link
                      </Button>
                    </>
                  )}
                </div>
              </>
            ) : s.visibility === 'unlisted' ? (
              <Banner tone="warning" title="Link revoked" action={<Button size="sm" onClick={() => rotate.mutate()} loading={rotate.isPending}>Create new link</Button>}>
                Nobody can open this project right now.
              </Banner>
            ) : (
              <p className="text-[13px] text-muted">Private projects have no share link. Choose Unlisted or Public to get one.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-1.5"><IdentificationBadgeIcon size={16} /> Portfolio</span>} description="Featured projects appear on your portfolio even if the project itself is private (as a card without a link)." />
          <CardBody>
            {s.inPortfolio ? (
              <Button loading={portfolio.isPending} onClick={() => portfolio.mutate(false)}>
                Remove from portfolio
              </Button>
            ) : (
              <Button variant="primary" loading={portfolio.isPending} onClick={() => portfolio.mutate(true)}>
                Add to portfolio
              </Button>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
