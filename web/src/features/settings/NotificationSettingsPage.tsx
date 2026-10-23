import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { BellIcon, BellSlashIcon, LockKeyIcon, FloppyDiskIcon, EnvelopeSimpleIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { Banner, Button, Card, CardAction, CardBody, CardHeader, Checkbox, ErrorState, Skeleton, SkeletonRows, Tooltip } from '@/components/ui';
import { InlineEmpty, SettingsFooter } from './shared';

type Category = { key: string; label: string; inApp: boolean; email: boolean; locked: boolean };
type Capabilities = { email: { configured: boolean; provider: string | null; note: string } };
type Matrix = Record<string, { inApp: boolean; email: boolean }>;

const toMatrix = (cats: Category[]): Matrix => Object.fromEntries(cats.map((c) => [c.key, { inApp: c.inApp, email: c.email }]));

export default function NotificationSettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me', 'notification-settings'], queryFn: () => api.get<{ categories: Category[] }>('/me/notification-settings') });
  const caps = useQuery({ queryKey: ['system', 'capabilities'], queryFn: () => api.get<Capabilities>('/system/capabilities'), staleTime: 5 * 60_000 });
  const [draft, setDraft] = useState<Matrix>({});

  // Reset the draft whenever fresh server data arrives.
  useEffect(() => {
    if (q.data) setDraft(toMatrix(q.data.categories));
  }, [q.data]);

  const categories = q.data?.categories ?? [];
  const changed = categories.filter((c) => !c.locked && draft[c.key] && (draft[c.key].inApp !== c.inApp || draft[c.key].email !== c.email));

  const save = useMutation({
    mutationFn: () => api.patch('/me/preferences', { notifications: Object.fromEntries(changed.map((c) => [c.key, draft[c.key]])) }),
    onSuccess: () => {
      toast.success('Notification settings saved.');
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const setCell = (key: string, channel: 'inApp' | 'email', v: boolean) => setDraft((d) => ({ ...d, [key]: { ...d[key], [channel]: v } }));
  const setColumn = (channel: 'inApp' | 'email', v: boolean) =>
    setDraft((d) => Object.fromEntries(Object.entries(d).map(([k, cell]) => [k, categories.find((c) => c.key === k)?.locked ? cell : { ...cell, [channel]: v }])));

  return (
    <div className="space-y-4">
      <EmailAvailability caps={caps} />

      <Card>
        <CardHeader
          title="What you hear about"
          description="Choose where each kind of update reaches you. In-app notifications appear under the bell icon."
          action={<CardAction to="/app/notifications">Delivery history</CardAction>}
        />
        <div>
          {q.error ? (
            <CardBody>
              <ErrorState error={q.error} onRetry={() => q.refetch()} />
            </CardBody>
          ) : q.isLoading ? (
            <CardBody>
              <SkeletonRows rows={8} />
            </CardBody>
          ) : categories.length === 0 ? (
            <CardBody>
              <InlineEmpty
                icon={<BellSlashIcon size={22} />}
                title="No notification categories"
                description="This server has not defined any notification categories yet. Check again after the next update."
                action={
                  <Button size="sm" onClick={() => q.refetch()}>
                    Check again
                  </Button>
                }
              />
            </CardBody>
          ) : (
            <>
              <div className="overflow-x-auto border-t border-border">
                <table className="w-full min-w-[420px] text-[14px]">
                  <caption className="sr-only">Notification channels by category</caption>
                  <thead>
                    <tr className="border-b border-border bg-surface-2 text-left text-[12px] text-muted">
                      <th scope="col" className="h-10 pl-5 pr-3 font-medium">
                        Category
                      </th>
                      <th scope="col" className="h-10 w-28 px-3 text-center font-medium">
                        <span className="inline-flex items-center gap-1">
                          <BellIcon size={14} aria-hidden /> In-app
                        </span>
                      </th>
                      <th scope="col" className="h-10 w-28 pl-3 pr-5 text-center font-medium">
                        <span className="inline-flex items-center gap-1">
                          <EnvelopeSimpleIcon size={14} aria-hidden /> Email
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((c) => {
                      const cell = draft[c.key] ?? { inApp: c.inApp, email: c.email };
                      return (
                        <tr key={c.key} className="border-b border-border last:border-0">
                          <th scope="row" className="py-3 pl-5 pr-3 text-left font-normal">
                            <div className="flex items-center gap-1.5 font-medium">
                              {c.label}
                              {c.locked && (
                                <Tooltip content="Security alerts are always on so you hear about password changes and sign-ins.">
                                  <span tabIndex={0} aria-label="Locked" className="inline-flex text-subtle">
                                    <LockKeyIcon size={14} />
                                  </span>
                                </Tooltip>
                              )}
                            </div>
                            {c.locked && <div className="text-[12.5px] text-muted">Security alerts are always on</div>}
                          </th>
                          <td className="px-3 py-3">
                            <div className="flex justify-center">
                              <Checkbox
                                checked={c.locked ? true : cell.inApp}
                                disabled={c.locked}
                                onCheckedChange={(v) => setCell(c.key, 'inApp', v)}
                                label={<span className="sr-only">In-app notifications for {c.label}</span>}
                              />
                            </div>
                          </td>
                          <td className="py-3 pl-3 pr-5">
                            <div className="flex justify-center">
                              <Checkbox
                                checked={c.locked ? true : cell.email}
                                disabled={c.locked}
                                onCheckedChange={(v) => setCell(c.key, 'email', v)}
                                label={<span className="sr-only">Email notifications for {c.label}</span>}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <SettingsFooter
                note={
                  <span className="-ml-3 flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setColumn('email', false)}>
                      Turn off all email
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setColumn('inApp', true)}>
                      Turn on all in-app
                    </Button>
                  </span>
                }
              >
                {changed.length > 0 && (
                  <Button onClick={() => setDraft(toMatrix(categories))} disabled={save.isPending}>
                    Discard changes
                  </Button>
                )}
                <Button
                  variant="primary"
                  icon={<FloppyDiskIcon size={16} />}
                  loading={save.isPending}
                  disabled={changed.length === 0}
                  disabledReason="No changes to save"
                  onClick={() => save.mutate()}
                >
                  Save notification settings
                </Button>
              </SettingsFooter>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function EmailAvailability({ caps }: { caps: UseQueryResult<Capabilities> }) {
  if (caps.isLoading) return <Skeleton className="h-14" />;
  if (caps.error) return <ErrorState error={caps.error} onRetry={() => caps.refetch()} />;
  const email = caps.data?.email;
  if (!email) return null;
  if (!email.configured) {
    return (
      <Banner tone="warning" title="Email is not configured">
        Email is not configured on this server, so email choices are saved but nothing is sent until an administrator sets up a provider. In-app notifications still work.
      </Banner>
    );
  }
  if (email.provider === 'smtp-local') {
    return (
      <Banner tone="info" title="Email goes to a local development mailbox">
        This server captures email in a local dev mailbox for testing. Messages are not delivered to your inbox.
      </Banner>
    );
  }
  return (
    <Banner tone="success" title="Email delivery is available">
      {email.note}. Delivery status for each message is shown in your notification history.
    </Banner>
  );
}
