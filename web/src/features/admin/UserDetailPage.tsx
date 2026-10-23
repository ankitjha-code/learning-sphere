import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ProhibitIcon, ArrowCounterClockwiseIcon, SignOutIcon, KeyIcon, ShieldCheckIcon, DownloadSimpleIcon, WarningIcon, BuildingsIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDate, formatDateTime, timeAgo } from '@/lib/format';
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  CardBody,
  CardAction,
  CardHeader,
  ConfirmDialog,
  CopyButton,
  Dialog,
  ErrorState,
  Field,
  PageHeader,
  ProvenanceTag,
  Section,
  Select,
  SkeletonRows,
  StatusBadge,
  Textarea,
} from '@/components/ui';
import { ROLE_LABELS, type OrgRole, type PlatformRole } from '@shared/roles';
import { ACTION_LABELS } from './api';
import { DetailList, TableCard, Th, rowClass, tdClass, theadClass } from './components';

type Detail = {
  user: {
    id: string;
    name: string;
    email: string;
    platformRole: PlatformRole | null;
    status: string;
    isSample: boolean;
    avatarColor: string | null;
    emailVerifiedAt: string | null;
    hasPassword: boolean;
    lastActiveAt: string | null;
    deletionRequestedAt: string | null;
    createdAt: string;
    timezone: string;
  };
  memberships: { membershipId: string; orgId: string; orgName: string; orgKind: string; orgStatus: string; roles: OrgRole[]; status: string; joinedAt: string }[];
  activeSessions: number;
  dataRequests: { id: string; kind: string; status: string; createdAt: string; scheduledFor: string | null; completedAt: string | null }[];
  recentAdminActions: { id: string; action: string; actorId: string | null; createdAt: string; meta: Record<string, unknown> }[];
  emailConfigured: boolean;
  exportAvailable: boolean;
  can: { suspend: boolean; unsuspend: boolean; revokeSessions: boolean; changeRole: boolean; resetLink: boolean; export: boolean };
  reasons: { self: string | null; readOnly: string | null };
};

type Dialogs = 'suspend' | 'unsuspend' | 'revoke' | 'role' | 'reset' | 'export' | null;

export default function UserDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => api.get<Detail>(`/admin/users/${id}`) });
  const [open, setOpen] = useState<Dialogs>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [role, setRole] = useState<string>('');
  const [resetResult, setResetResult] = useState<{ link: string; expiresAt: string; notice: string; suspended: boolean } | null>(null);

  const done = (msg: string) => {
    toast.success(msg);
    setOpen(null);
    qc.invalidateQueries({ queryKey: ['admin'] });
  };
  const fail = (e: unknown) => toast.error(errorMessage(e));

  const suspend = useMutation({
    mutationFn: () => api.post<{ sessionsRevoked: number }>(`/admin/users/${id}/suspend`, { reason }),
    onSuccess: (r) => {
      setReason('');
      done(`Account suspended. ${r.sessionsRevoked} session(s) signed out.`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fields.reason) setReasonError(e.fields.reason);
      else fail(e);
    },
  });
  const unsuspend = useMutation({ mutationFn: () => api.post(`/admin/users/${id}/unsuspend`), onSuccess: () => done('Account restored. The person can sign in again.'), onError: fail });
  const revoke = useMutation({ mutationFn: () => api.post<{ revoked: number }>(`/admin/users/${id}/revoke-sessions`), onSuccess: (r) => done(`${r.revoked} session(s) signed out.`), onError: fail });
  const changeRole = useMutation({
    mutationFn: () => api.patch(`/admin/users/${id}/platform-role`, { platformRole: role === 'none' ? null : role }),
    onSuccess: () => done('Platform role updated.'),
    onError: fail,
  });
  const reset = useMutation({
    mutationFn: () => api.post<{ link: string; expiresAt: string; notice: string; suspended: boolean }>(`/admin/users/${id}/reset-link`),
    onSuccess: (r) => {
      setOpen(null);
      setResetResult(r);
      qc.invalidateQueries({ queryKey: ['admin', 'user', id] });
    },
    onError: fail,
  });
  const exportData = useMutation({ mutationFn: () => api.post(`/admin/users/${id}/export`), onSuccess: () => done('Export started. The person will be notified when it is ready.'), onError: fail });

  if (q.isLoading) return <SkeletonRows rows={6} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const u = d.user;
  const why = d.reasons.readOnly ?? d.reasons.self ?? undefined;

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/admin/users" className="hover:underline">
            Users
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <Avatar name={u.name} color={u.avatarColor} size={36} />
            {u.name}
          </span>
        }
        badge={
          <>
            <StatusBadge status={u.status} />
            {u.platformRole && (
              <Badge tone="accent" icon={<ShieldCheckIcon size={12} />}>
                {ROLE_LABELS[u.platformRole]}
              </Badge>
            )}
            {u.isSample && <ProvenanceTag kind="sample" />}
          </>
        }
        description={u.email}
      />

      {d.reasons.readOnly && (
        <Banner tone="info" className="mb-4">
          {d.reasons.readOnly}
        </Banner>
      )}
      {u.status === 'suspended' && (
        <Banner tone="warning" title="This account is suspended" className="mb-4">
          The person cannot sign in and all their sessions were signed out. Their data is kept.
        </Banner>
      )}
      {u.status === 'pending_deletion' && (
        <Banner tone="warning" title="Deletion requested" className="mb-4">
          The person asked to delete their account {u.deletionRequestedAt ? timeAgo(u.deletionRequestedAt) : ''}. It will be erased when the grace period ends unless they cancel.
        </Banner>
      )}

      <div className="mb-8 flex flex-wrap gap-2">
        {u.status === 'suspended' ? (
          <Button icon={<ArrowCounterClockwiseIcon size={16} />} onClick={() => setOpen('unsuspend')} disabled={!d.can.unsuspend} disabledReason={why}>
            Restore account
          </Button>
        ) : (
          <Button variant="danger" icon={<ProhibitIcon size={16} />} onClick={() => setOpen('suspend')} disabled={!d.can.suspend} disabledReason={why ?? 'Only active accounts can be suspended.'}>
            Suspend
          </Button>
        )}
        <Button icon={<SignOutIcon size={16} />} onClick={() => setOpen('revoke')} disabled={!d.can.revokeSessions || d.activeSessions === 0} disabledReason={why ?? 'No active sessions.'}>
          Sign out everywhere
        </Button>
        <Button icon={<KeyIcon size={16} />} onClick={() => setOpen('reset')} disabled={!d.can.resetLink} disabledReason={why ?? 'Not available for deleted accounts.'}>
          Create reset link
        </Button>
        <Button
          icon={<ShieldCheckIcon size={16} />}
          onClick={() => {
            setRole(u.platformRole ?? 'none');
            setOpen('role');
          }}
          disabled={!d.can.changeRole}
          disabledReason={why}
        >
          Change platform role
        </Button>
        <Button
          icon={<DownloadSimpleIcon size={16} />}
          onClick={() => setOpen('export')}
          disabled={!d.can.export || !d.exportAvailable}
          disabledReason={!d.exportAvailable ? 'Data export processing is not available on this server.' : why}
        >
          Start data export
        </Button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="min-w-0 space-y-8">
          <Card>
            <CardHeader title="Account" />
            <CardBody>
              <DetailList
                items={[
                  ['Joined', formatDate(u.createdAt)],
                  ['Last active', u.lastActiveAt ? `${timeAgo(u.lastActiveAt)} (${formatDateTime(u.lastActiveAt)})` : 'Never recorded'],
                  ['Active sessions', d.activeSessions],
                  ['Email verified', u.emailVerifiedAt ? formatDate(u.emailVerifiedAt) : 'Not verified'],
                  ['Password set', u.hasPassword ? 'Yes' : 'No (invited or external sign-in)'],
                  ['Timezone', u.timezone],
                  ['Email delivery', d.emailConfigured ? 'Configured on this server' : 'Not configured: use a reset link for recovery'],
                ]}
              />
            </CardBody>
          </Card>

          <Section title="Data requests">
            {d.dataRequests.length === 0 ? (
              <p className="rounded-lg border border-border bg-surface px-5 py-4 text-[13.5px] text-muted shadow-1">No export or deletion requests.</p>
            ) : (
              <TableCard label="Data requests">
                <thead className={theadClass}>
                  <tr>
                    <Th>Kind</Th>
                    <Th>Status</Th>
                    <Th>Requested</Th>
                  </tr>
                </thead>
                <tbody>
                  {d.dataRequests.map((r) => (
                    <tr key={r.id} className={rowClass}>
                      <td className={`${tdClass} capitalize`}>{r.kind}</td>
                      <td className={tdClass}>
                        <StatusBadge status={r.status} />
                      </td>
                      <td className={`${tdClass} text-muted`}>{formatDateTime(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableCard>
            )}
          </Section>
        </div>
        <div className="min-w-0 space-y-8">
          <Card>
            <CardHeader title="Organizations" description="Memberships are managed by each organization's admins. Platform admins see them read-only; there is no impersonation." />
            {d.memberships.length === 0 ? (
              <CardBody>
                <div className="flex items-center gap-3 rounded-md bg-surface-2 px-4 py-3 text-[13.5px] text-muted">
                  <BuildingsIcon size={18} className="shrink-0 text-subtle" aria-hidden />
                  No organizations. This person uses the platform as an independent learner.
                </div>
              </CardBody>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {d.memberships.map((m) => (
                  <li key={m.membershipId} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
                    <Link to={`/app/admin/orgs/${m.orgId}`} className="font-medium hover:underline">
                      {m.orgName}
                    </Link>
                    <div className="flex flex-wrap items-center gap-1">
                      {m.roles.map((r) => (
                        <Badge key={r}>{ROLE_LABELS[r] ?? r}</Badge>
                      ))}
                      {m.status !== 'active' && <StatusBadge status={m.status} />}
                      {m.orgStatus !== 'active' && <Badge tone="warning">Org {m.orgStatus}</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Section title="Recent admin actions on this account" action={<CardAction to={`/app/admin/audit?targetId=${u.id}`}>View full audit trail</CardAction>}>
            {d.recentAdminActions.length === 0 ? (
              <p className="rounded-lg border border-border bg-surface px-5 py-4 text-[13.5px] text-muted shadow-1">No admin actions recorded.</p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
                {d.recentAdminActions.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-4 px-5 py-3.5 text-[13.5px]">
                    <span className="min-w-0">{ACTION_LABELS[a.action] ?? a.action}</span>
                    <span className="shrink-0 text-[12.5px] text-muted">{formatDateTime(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      <ConfirmDialog
        open={open === 'suspend'}
        onOpenChange={(v) => {
          if (!v) setReasonError(undefined);
          setOpen(v ? 'suspend' : null);
        }}
        title={`Suspend ${u.name}?`}
        description="They will be signed out everywhere and cannot sign in until restored. Their data stays intact. The reason is kept in the audit log."
        confirmLabel="Suspend account"
        danger
        loading={suspend.isPending}
        onConfirm={() => suspend.mutate()}
      >
        <Field label="Reason" error={reasonError} helper="Visible to platform staff in the audit log, not to the person.">
          <Textarea value={reason} onChange={(e) => (setReason(e.target.value), setReasonError(undefined))} rows={3} />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={open === 'unsuspend'}
        onOpenChange={(v) => setOpen(v ? 'unsuspend' : null)}
        title={`Restore ${u.name}?`}
        description="They can sign in again with their existing password. They will get a notification."
        confirmLabel="Restore account"
        loading={unsuspend.isPending}
        onConfirm={() => unsuspend.mutate()}
      />

      <ConfirmDialog
        open={open === 'revoke'}
        onOpenChange={(v) => setOpen(v ? 'revoke' : null)}
        title="Sign out of every session?"
        description={`${d.activeSessions} active session(s) will end immediately. ${u.name} can sign in again unless the account is suspended.`}
        confirmLabel="Sign out everywhere"
        danger
        loading={revoke.isPending}
        onConfirm={() => revoke.mutate()}
      />

      <ConfirmDialog
        open={open === 'reset'}
        onOpenChange={(v) => setOpen(v ? 'reset' : null)}
        title="Create a password reset link?"
        description="Use this when the person cannot receive email. The link works once, expires in 1 hour and replaces any earlier link you created. You will see it only once."
        confirmLabel="Create link"
        loading={reset.isPending}
        onConfirm={() => reset.mutate()}
      />

      <Dialog
        open={!!resetResult}
        onOpenChange={(v) => !v && setResetResult(null)}
        title="Password reset link"
        description="Copy it now. It will not be shown again."
        footer={<Button onClick={() => setResetResult(null)}>I have copied it</Button>}
      >
        {resetResult && (
          <div className="space-y-3">
            <Banner tone="warning" title="Treat this like a password">
              {resetResult.notice} Verify the person's identity before sharing it.
            </Banner>
            {resetResult.suspended && <Banner tone="danger">This account is suspended. Resetting the password does not lift the suspension.</Banner>}
            <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 p-2">
              <code className="min-w-0 flex-1 break-all font-mono text-[12.5px]">{resetResult.link}</code>
              <CopyButton value={resetResult.link} label="Copy link" />
            </div>
            <p className="flex items-center gap-1.5 text-[12.5px] text-muted">
              <WarningIcon size={14} /> Expires {formatDateTime(resetResult.expiresAt)}.
            </p>
          </div>
        )}
      </Dialog>

      <Dialog
        open={open === 'role'}
        onOpenChange={(v) => setOpen(v ? 'role' : null)}
        title="Change platform role"
        description="Platform roles apply across every organization. Organization roles are managed inside each organization."
        footer={
          <>
            <Button onClick={() => setOpen(null)}>Cancel</Button>
            <Button variant="primary" loading={changeRole.isPending} disabled={role === (u.platformRole ?? 'none')} disabledReason="Choose a different role" onClick={() => changeRole.mutate()}>
              Save role
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Platform role">
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="none">None (regular user)</option>
              <option value="support">Support: read-only access to users, jobs, health and audit</option>
              <option value="platform_admin">Platform admin: full control of the platform</option>
            </Select>
          </Field>
          {role === 'platform_admin' && <Banner tone="warning">Platform admins can suspend anyone, change plans and settings, and read every audit log.</Banner>}
          <p className="text-[12.5px] text-muted">The last active platform admin cannot be removed, and you cannot change your own role.</p>
        </div>
      </Dialog>

      <ConfirmDialog
        open={open === 'export'}
        onOpenChange={(v) => setOpen(v ? 'export' : null)}
        title="Start a data export for this person?"
        description="A copy of their data is prepared in the background and offered to them in Settings, Privacy. You do not receive the file."
        confirmLabel="Start export"
        loading={exportData.isPending}
        onConfirm={() => exportData.mutate()}
      />
    </div>
  );
}
