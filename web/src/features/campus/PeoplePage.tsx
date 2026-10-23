import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EnvelopeSimpleIcon, MagnifyingGlassIcon, UserPlusIcon, UsersIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage, qs } from '@/lib/api';
import { timeAgo, formatDate } from '@/lib/format';
import { Avatar, Badge, Banner, Button, Checkbox, ConfirmDialog, CopyButton, Dialog, EmptyState, ErrorState, Field, Input, Menu, PageHeader, Select, SkeletonRows, StatusBadge, Textarea } from '@/components/ui';
import { ROLE_LABELS, type OrgRole } from '@shared/roles';
import { listGroup, TableWrap, td, th } from './shared';

type Member = { membershipId: string; userId: string; name: string; email: string; roles: OrgRole[]; status: string; title: string | null; lastActiveAt: string | null; joinedAt: string; avatarColor: string | null };
type Invite = { id: string; email: string; roles: OrgRole[]; expiresAt: string; createdAt: string };
type Current = { org: { id: string; name: string; kind: string }; roles: OrgRole[]; canManageRoles: OrgRole[]; allowedRoles: OrgRole[] };
type InviteResult = { email: string; status: 'added' | 'invited' | 'already_member'; inviteLink?: string; emailStatus?: string };

const COLLEGE_ROLES: OrgRole[] = ['student', 'faculty', 'faculty_admin', 'placement_officer', 'mentor', 'org_admin'];

function InviteDialog({ open, onOpenChange, grantable }: { open: boolean; onOpenChange: (v: boolean) => void; grantable: OrgRole[] }) {
  const qc = useQueryClient();
  const [emails, setEmails] = useState('');
  const [roles, setRoles] = useState<OrgRole[]>(grantable.includes('student') ? ['student'] : grantable.slice(0, 1));
  const [results, setResults] = useState<{ results: InviteResult[]; emailConfigured: boolean } | null>(null);
  const list = emails
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);
  const m = useMutation({
    mutationFn: () => api.post<{ results: InviteResult[]; emailConfigured: boolean }>('/org/invites', { emails: list, roles }),
    onSuccess: (r) => {
      setResults(r);
      qc.invalidateQueries({ queryKey: ['org'] });
      toast.success(`${r.results.filter((x) => x.status === 'invited').length} invitation(s) created`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Invite people"
      description="Invitations are valid for 14 days. People who accept join with the roles you pick."
      footer={
        results ? (
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="primary" loading={m.isPending} disabled={!list.length || !roles.length} disabledReason={!list.length ? 'Enter at least one email' : 'Pick at least one role'} onClick={() => m.mutate()}>
              Send {list.length || ''} invitation{list.length === 1 ? '' : 's'}
            </Button>
          </>
        )
      }
    >
      {results ? (
        <div className="space-y-3">
          {!results.emailConfigured && (
            <Banner tone="warning" title="Email is not configured on this server">
              No emails were sent. Copy each invite link and share it directly.
            </Banner>
          )}
          <ul className="divide-y divide-border text-[13px]">
            {results.results.map((r) => (
              <li key={r.email} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate">{r.email}</span>
                {r.status === 'already_member' ? (
                  <Badge>Already a member with these roles</Badge>
                ) : (
                  <>
                    {r.emailStatus && <StatusBadge status={r.emailStatus} />}
                    {r.inviteLink && <CopyButton value={r.inviteLink} label="Copy link" />}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Email addresses" helper="Separate with commas, spaces or new lines (up to 100).">
            <Textarea rows={4} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="student@college.edu, faculty@college.edu" autoFocus />
          </Field>
          <div>
            <div className="mb-1.5 text-[13px] font-medium">Roles</div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {grantable.map((r) => (
                <Checkbox key={r} checked={roles.includes(r)} onCheckedChange={(on) => setRoles(on ? [...roles, r] : roles.filter((x) => x !== r))} label={ROLE_LABELS[r]} />
              ))}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function RolesDialog({ member, grantable, onOpenChange }: { member: Member | null; grantable: OrgRole[]; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [roles, setRoles] = useState<OrgRole[]>(member?.roles ?? []);
  const m = useMutation({
    mutationFn: () => api.patch(`/org/members/${member!.membershipId}`, { roles }),
    onSuccess: () => {
      toast.success('Roles updated. The person was notified.');
      qc.invalidateQueries({ queryKey: ['org'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open={!!member}
      onOpenChange={onOpenChange}
      title={`Roles for ${member?.name ?? ''}`}
      description="You can change only the roles your own role allows. Role changes are audited."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>
            Save roles
          </Button>
        </>
      }
    >
      <div className="grid gap-1.5 sm:grid-cols-2">
        {COLLEGE_ROLES.map((r) => (
          <Checkbox key={r} checked={roles.includes(r)} disabled={!grantable.includes(r)} onCheckedChange={(on) => setRoles(on ? [...roles, r] : roles.filter((x) => x !== r))} label={ROLE_LABELS[r]} description={grantable.includes(r) ? undefined : 'Your role cannot change this'} />
        ))}
      </div>
    </Dialog>
  );
}

export default function PeoplePage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [revoking, setRevoking] = useState<Invite | null>(null);
  const current = useQuery({ queryKey: ['org', 'current'], queryFn: () => api.get<Current>('/org/current') });
  const members = useQuery({ queryKey: ['org', 'members', q, role], queryFn: () => api.get<{ members: Member[]; invites: Invite[]; canManageRoles: OrgRole[] }>(`/org/members${qs({ q, role })}`) });
  const revoke = useMutation({
    mutationFn: () => api.del(`/org/invites/${revoking!.id}`),
    onSuccess: () => {
      toast.success('Invitation revoked');
      setRevoking(null);
      qc.invalidateQueries({ queryKey: ['org'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const grantable = (current.data?.canManageRoles ?? []).filter((r) => COLLEGE_ROLES.includes(r) && (current.data?.allowedRoles ?? []).includes(r));
  const d = members.data;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="People & roles"
        description="Members of your institution and their roles. Students need the Student role to have records and join drives."
        actions={
          <Button variant="primary" icon={<UserPlusIcon size={15} />} disabled={!grantable.length} disabledReason="Your role cannot invite people. Ask an organization admin or faculty admin." onClick={() => setInviting(true)}>
            Invite people
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <MagnifyingGlassIcon size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="pl-8" aria-label="Search people" />
        </div>
        <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role" className="w-48">
          <option value="">All roles</option>
          {COLLEGE_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </div>
      {members.error ? (
        <ErrorState error={members.error} onRetry={() => members.refetch()} />
      ) : !d ? (
        <SkeletonRows rows={6} />
      ) : (
        <div className="space-y-8">
          {d.invites.length > 0 && (
            <section>
              <h2 className="mb-3 text-[16px] font-semibold tracking-[-0.01em]">Pending invitations</h2>
              <ul className={listGroup}>
                {d.invites.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 text-[13.5px]">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-subtle ring-1 ring-inset ring-border">
                      <EnvelopeSimpleIcon size={16} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{i.email}</span>
                    {i.roles.map((r) => (
                      <Badge key={r}>{ROLE_LABELS[r]}</Badge>
                    ))}
                    <span className="text-[12px] text-subtle">expires {formatDate(i.expiresAt)}</span>
                    <Button size="sm" variant="ghost" onClick={() => setRevoking(i)}>
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!d.members.length ? (
            <EmptyState icon={<UsersIcon size={22} />} title="No members match" description="Try another search or role, or invite people." />
          ) : (
            <TableWrap>
              <table className="w-full min-w-[720px]">
                <thead className="border-b border-border">
                  <tr>
                    <th className={th}>Person</th>
                    <th className={th}>Roles</th>
                    <th className={th}>Status</th>
                    <th className={th}>Last active</th>
                    <th className={th} aria-label="Actions" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {d.members.map((m) => (
                    <tr key={m.membershipId}>
                      <td className={td}>
                        <div className="flex items-center gap-3">
                          <Avatar name={m.name} color={m.avatarColor} size={32} />
                          <div className="min-w-0">
                            <div className="font-medium">{m.name}</div>
                            <div className="text-[12px] text-subtle">{m.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className={td}>
                        <div className="flex flex-wrap gap-1">
                          {m.roles.map((r) => (
                            <Badge key={r} tone={r === 'student' ? 'neutral' : 'accent'}>
                              {ROLE_LABELS[r] ?? r}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className={td}>
                        <StatusBadge status={m.status} />
                      </td>
                      <td className={td}>{m.lastActiveAt ? timeAgo(m.lastActiveAt) : <span className="text-subtle">Never</span>}</td>
                      <td className={`${td} text-right`}>
                        {grantable.length > 0 && <Menu items={[{ label: 'Change roles', onSelect: () => setEditing(m) }]} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </div>
      )}
      {inviting && <InviteDialog open onOpenChange={setInviting} grantable={grantable} />}
      {editing && <RolesDialog member={editing} grantable={grantable} onOpenChange={(v) => !v && setEditing(null)} />}
      <ConfirmDialog open={!!revoking} onOpenChange={(v) => !v && setRevoking(null)} title="Revoke invitation?" description={`The link sent to ${revoking?.email ?? ''} will stop working.`} confirmLabel="Revoke" danger loading={revoke.isPending} onConfirm={() => revoke.mutate()} />
    </div>
  );
}
