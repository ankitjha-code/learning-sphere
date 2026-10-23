import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { UserPlusIcon, SignOutIcon, XIcon } from '@phosphor-icons/react';
import { api, ApiError, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Button, Card, CardHeader, CardBody, Field, Input, Select, Avatar, Badge, ConfirmDialog, Banner } from '@/components/ui';
import type { ProjectDetail } from '../types';
import { useProjectMutation } from './shared';

const ROLE_HELP: Record<string, string> = {
  member: 'Builds with you: edits requirements, tasks, milestones and docs. Receives completion evidence.',
  mentor: 'Guides and reviews. Can approve completion. Does not edit project content.',
  reviewer: 'Reviews and can approve completion. Does not edit project content.',
};

function CapstoneSettings({ d }: { d: ProjectDetail }) {
  const opts = useQuery({
    queryKey: ['capstone-options'],
    queryFn: () => api.get<{ rubrics: { id: string; title: string }[]; reviewers: { userId: string; name: string }[] }>('/projects/capstones/options'),
  });
  const [rubricId, setRubricId] = useState(d.rubric?.id ?? '');
  const [reviewerId, setReviewerId] = useState(d.reviewer?.id ?? '');
  const save = useProjectMutation(d.project.id, () => api.patch(`/projects/${d.project.id}/capstone`, { rubricId: rubricId || null, reviewerId: reviewerId || null }), 'Capstone settings saved');
  return (
    <Card>
      <CardHeader title="Capstone settings (faculty)" description="Attach a rubric and an assigned reviewer. Only staff of this organization see this." />
      <CardBody className="space-y-3">
        {opts.error ? (
          <Banner tone="warning">{errorMessage(opts.error)} Switch to this project's organization in the workspace switcher.</Banner>
        ) : (
          <>
            <Field label="Rubric">
              <Select value={rubricId} onChange={(e) => setRubricId(e.target.value)} disabled={opts.isLoading}>
                <option value="">No rubric</option>
                {opts.data?.rubrics.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assigned reviewer">
              <Select value={reviewerId} onChange={(e) => setReviewerId(e.target.value)} disabled={opts.isLoading}>
                <option value="">Any faculty in the organization</option>
                {opts.data?.reviewers.map((r) => (
                  <option key={r.userId} value={r.userId}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex justify-end">
              <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>
                Save capstone settings
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

export function TeamTab({ d }: { d: ProjectDetail }) {
  const pid = d.project.id;
  const me = useSession();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [removing, setRemoving] = useState<{ userId: string; name: string } | null>(null);
  const invite = useProjectMutation(pid, () => api.post(`/projects/${pid}/members`, { email, role }), 'Invitation sent. They can accept from their Projects page.');
  const revoke = useProjectMutation(pid, (id: string) => api.del(`/projects/${pid}/invites/${id}`), 'Invitation revoked');
  const changeRole = useProjectMutation(pid, (v: { userId: string; role: string }) => api.patch(`/projects/${pid}/members/${v.userId}`, { role: v.role }), 'Role updated');
  const remove = useProjectMutation(pid, (userId: string) => api.del(`/projects/${pid}/members/${userId}`), (_r, userId) => (userId === me.user.id ? 'You left the project' : 'Member removed'));
  const f = invite.error instanceof ApiError ? invite.error.fields : {};
  const isMemberNotOwner = !d.access.isOwner && d.team.some((m) => m.userId === me.user.id);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <Card>
          <CardHeader title="Team" description="Individual or team ownership. Contributors (owner and members) receive completion evidence and XP." />
          <CardBody>
            <ul className="divide-y divide-border">
              {d.team.map((m) => (
                <li key={m.userId} className="flex flex-wrap items-center gap-3 py-2.5">
                  <Avatar name={m.name} color={m.avatarColor} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium">
                      {m.name} {m.userId === me.user.id && <span className="text-subtle">(you)</span>}
                    </div>
                    {d.access.isOwner && <div className="truncate text-[12px] text-muted">{m.email}</div>}
                  </div>
                  {d.access.isOwner && m.role !== 'owner' ? (
                    <>
                      <div className="w-32">
                        <Select aria-label={`Role of ${m.name}`} value={m.role} onChange={(e) => changeRole.mutate({ userId: m.userId, role: e.target.value })}>
                          <option value="member">Member</option>
                          <option value="mentor">Mentor</option>
                          <option value="reviewer">Reviewer</option>
                        </Select>
                      </div>
                      <Button size="icon-sm" variant="ghost" aria-label={`Remove ${m.name}`} onClick={() => setRemoving({ userId: m.userId, name: m.name })}>
                        <XIcon size={14} />
                      </Button>
                    </>
                  ) : (
                    <Badge tone={m.role === 'owner' ? 'accent' : 'neutral'}>{m.role.charAt(0).toUpperCase() + m.role.slice(1)}</Badge>
                  )}
                </li>
              ))}
            </ul>
            {d.invites.length > 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <div className="mb-1.5 text-[12.5px] font-semibold uppercase tracking-wide text-subtle">Pending invitations</div>
                <ul className="space-y-1.5">
                  {d.invites.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 text-[13px]">
                      <span>
                        {i.name} <span className="text-muted">({i.email})</span> · {i.role} · sent {timeAgo(i.createdAt)}
                      </span>
                      <Button size="sm" variant="ghost" loading={revoke.isPending && revoke.variables === i.id} onClick={() => revoke.mutate(i.id)}>
                        Revoke
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {isMemberNotOwner && (
              <div className="mt-4 flex justify-end">
                <Button variant="ghost" icon={<SignOutIcon size={14} />} onClick={() => setRemoving({ userId: me.user.id, name: 'yourself' })}>
                  Leave project
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
        {d.access.orgStaff && d.project.orgId && <CapstoneSettings d={d} />}
      </div>
      {d.access.isOwner && (
        <Card>
          <CardHeader title="Invite someone" description="They need a LearnSphere Nexus account. They accept from their Projects page." />
          <CardBody>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                invite.mutate(undefined, { onSuccess: () => setEmail('') });
              }}
            >
              <Field label="Email" error={f.email}>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Role" helper={ROLE_HELP[role]}>
                <Select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="member">Member (builds with you)</option>
                  <option value="mentor">Mentor</option>
                  <option value="reviewer">Reviewer</option>
                </Select>
              </Field>
              <Button type="submit" variant="primary" icon={<UserPlusIcon size={14} />} loading={invite.isPending} disabled={!email.includes('@')} disabledReason="Enter an email address">
                Send invitation
              </Button>
            </form>
          </CardBody>
        </Card>
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={removing?.userId === me.user.id ? 'Leave this project?' : `Remove ${removing?.name}?`}
        description={removing?.userId === me.user.id ? 'You lose access to the workspace. The owner can invite you again.' : 'They lose access to the workspace. Tasks assigned to them become unassigned.'}
        confirmLabel={removing?.userId === me.user.id ? 'Leave project' : 'Remove member'}
        danger
        loading={remove.isPending}
        onConfirm={() => {
          if (!removing) return;
          remove.mutate(removing.userId, {
            onSuccess: () => {
              const self = removing.userId === me.user.id;
              setRemoving(null);
              if (self) nav('/app/projects');
            },
          });
        }}
      />
    </div>
  );
}
