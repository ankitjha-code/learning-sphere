import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClockCounterClockwiseIcon, UserPlusIcon, UsersIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Avatar, Badge, Banner, Button, ButtonLink, Card, CardBody, CardHeader, Checkbox, CopyButton, Dialog, EmptyState, ErrorState, Field, Input, PageHeader, ProvenanceTag, SkeletonRows, Textarea } from '@/components/ui';
import { ROLE_LABELS, type OrgRole } from '@shared/roles';

type Company = {
  org: { id: string; name: string; description: string | null; website: string | null; isSample: boolean };
  profile: { about: string | null; values: string[]; benefits: string[]; locations: string[]; hiringProcess: string | null; updatedAt: string | null };
  canEdit: boolean;
  canEditOrg: boolean;
};
type Members = {
  members: { membershipId: string; userId: string; name: string; email: string; roles: OrgRole[]; status: string; title: string | null }[];
  invites: { id: string; email: string; roles: OrgRole[]; expiresAt: string }[];
  canManageRoles: OrgRole[];
};

const HIRE_ROLES: OrgRole[] = ['recruiter_admin', 'recruiter', 'interviewer'];
const lines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

function ProfileCard({ c }: { c: Company }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ about: '', values: '', benefits: '', locations: '', hiringProcess: '' });
  const [org, setOrg] = useState({ name: '', description: '', website: '' });
  useEffect(() => {
    setF({ about: c.profile.about ?? '', values: c.profile.values.join('\n'), benefits: c.profile.benefits.join('\n'), locations: c.profile.locations.join('\n'), hiringProcess: c.profile.hiringProcess ?? '' });
    setOrg({ name: c.org.name, description: c.org.description ?? '', website: c.org.website ?? '' });
  }, [c]);
  const save = useMutation({
    mutationFn: async () => {
      if (c.canEditOrg) await api.patch('/org/current', { name: org.name, description: org.description || null, website: org.website || null });
      await api.put('/hire/company', { about: f.about || null, values: lines(f.values), benefits: lines(f.benefits), locations: lines(f.locations), hiringProcess: f.hiringProcess || null });
    },
    onSuccess: () => {
      toast.success('Company profile saved.');
      qc.invalidateQueries({ queryKey: ['hire', 'company'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const fields = save.error instanceof ApiError ? save.error.fields : {};
  const ro = !c.canEdit;
  return (
    <Card>
      <CardHeader title="Company profile" description="Shown to candidates next to your postings." action={c.org.isSample && <ProvenanceTag kind="sample" />} />
      <CardBody className="space-y-4">
        {ro && <Banner tone="info">Only recruiter admins and organization admins can edit the company profile.</Banner>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" helper={c.canEditOrg ? undefined : 'Organization admins can change the name, description and website.'} error={fields.name}>
            <Input value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} disabled={!c.canEditOrg} />
          </Field>
          <Field label="Website" optional error={fields.website}>
            <Input type="url" value={org.website} onChange={(e) => setOrg({ ...org, website: e.target.value })} disabled={!c.canEditOrg} placeholder="https://" />
          </Field>
          <Field label="Short description" optional className="sm:col-span-2">
            <Input value={org.description} onChange={(e) => setOrg({ ...org, description: e.target.value })} disabled={!c.canEditOrg} />
          </Field>
          <Field label="About" optional className="sm:col-span-2">
            <Textarea rows={4} value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} disabled={ro} />
          </Field>
          <Field label="Values" optional helper="One per line.">
            <Textarea rows={3} value={f.values} onChange={(e) => setF({ ...f, values: e.target.value })} disabled={ro} />
          </Field>
          <Field label="Benefits" optional helper="One per line.">
            <Textarea rows={3} value={f.benefits} onChange={(e) => setF({ ...f, benefits: e.target.value })} disabled={ro} />
          </Field>
          <Field label="Locations" optional helper="One per line.">
            <Textarea rows={3} value={f.locations} onChange={(e) => setF({ ...f, locations: e.target.value })} disabled={ro} />
          </Field>
          <Field label="Hiring process" optional helper="Tell candidates what to expect, step by step.">
            <Textarea rows={3} value={f.hiringProcess} onChange={(e) => setF({ ...f, hiringProcess: e.target.value })} disabled={ro} />
          </Field>
        </div>
        {!ro && (
          <div className="flex justify-end border-t border-border pt-4">
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
              Save profile
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function InviteDialog({ open, onOpenChange, allowed }: { open: boolean; onOpenChange: (v: boolean) => void; allowed: OrgRole[] }) {
  const qc = useQueryClient();
  const [emails, setEmails] = useState('');
  const [roles, setRoles] = useState<OrgRole[]>([]);
  useEffect(() => {
    if (open) {
      setEmails('');
      setRoles(allowed.includes('interviewer') ? ['interviewer'] : []);
    }
  }, [open, allowed]);
  const m = useMutation({
    mutationFn: () => api.post<{ results: { email: string; status: string; inviteLink?: string }[]; emailConfigured: boolean }>('/org/invites', { emails: emails.split(/[\s,]+/).filter(Boolean), roles }),
    onError: (e) => toast.error(errorMessage(e)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hire', 'team'] }),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) m.reset();
        onOpenChange(v);
      }}
      title="Invite to the hiring team"
      footer={
        m.data ? (
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="primary" loading={m.isPending} disabled={!emails.trim() || !roles.length} disabledReason="Add an email and a role" onClick={() => m.mutate()}>
              Send invitations
            </Button>
          </>
        )
      }
    >
      {m.data ? (
        <div className="space-y-3 text-[13.5px]">
          {!m.data.emailConfigured && <Banner tone="warning">Email is not configured on this server. Share the invite links directly.</Banner>}
          <ul className="space-y-2">
            {m.data.results.map((r) => (
              <li key={r.email} className="flex flex-wrap items-center justify-between gap-2">
                <span>{r.email}</span>
                {r.inviteLink ? <CopyButton value={r.inviteLink} label="Copy invite link" /> : <Badge>{r.status.replace('_', ' ')}</Badge>}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Email addresses" helper="Separate with commas or spaces.">
            <Textarea rows={2} value={emails} onChange={(e) => setEmails(e.target.value)} />
          </Field>
          <div className="space-y-2">
            <div className="text-[13px] font-medium">Roles</div>
            {allowed.map((r) => (
              <Checkbox
                key={r}
                checked={roles.includes(r)}
                onCheckedChange={(v) => setRoles(v ? [...roles, r] : roles.filter((x) => x !== r))}
                label={ROLE_LABELS[r]}
                description={
                  {
                    recruiter_admin: 'Everything, including company profile and decision exports.',
                    recruiter: 'Jobs, candidates, interviews, offers and messages.',
                    interviewer: 'Only candidates they interview; submits their own feedback.',
                  }[r as 'recruiter']
                }
              />
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}

export default function CompanyPage() {
  const company = useQuery({ queryKey: ['hire', 'company'], queryFn: () => api.get<Company>('/hire/company') });
  const team = useQuery({ queryKey: ['hire', 'team'], queryFn: () => api.get<Members>('/org/members') });
  const [invite, setInvite] = useState(false);
  const allowed = HIRE_ROLES.filter((r) => team.data?.canManageRoles.includes(r));
  const hiringMembers = (team.data?.members ?? []).filter((m) => m.roles.some((r) => [...HIRE_ROLES, 'org_admin'].includes(r)));
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Company and team"
        description="Your hiring profile and the people who can act on candidates."
        actions={
          company.data?.canEditOrg && (
            <ButtonLink to="/app/admin/org-audit" icon={<ClockCounterClockwiseIcon size={15} />}>
              Organization audit log
            </ButtonLink>
          )
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">{company.isLoading ? <SkeletonRows rows={6} /> : company.error ? <ErrorState error={company.error} onRetry={() => company.refetch()} /> : company.data && <ProfileCard c={company.data} />}</div>
        <aside>
          <Card className="overflow-hidden">
            <CardHeader
              title="Hiring team"
              description="Recruiter admins can invite recruiters and interviewers. Organization admins can grant any role."
              action={
                allowed.length > 0 && (
                  <Button size="sm" variant="primary" icon={<UserPlusIcon size={14} />} onClick={() => setInvite(true)}>
                    Invite
                  </Button>
                )
              }
            />
            {team.isLoading ? (
              <CardBody>
                <SkeletonRows rows={3} />
              </CardBody>
            ) : team.error ? (
              <CardBody>
                <ErrorState error={team.error} onRetry={() => team.refetch()} />
              </CardBody>
            ) : !hiringMembers.length ? (
              <CardBody>
                <EmptyState icon={<UsersIcon size={22} />} title="No hiring team yet" description="Invite recruiters and interviewers to collaborate on candidates." />
              </CardBody>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {hiringMembers.map((m) => (
                  <li key={m.membershipId} className="flex items-start gap-3 px-5 py-3.5">
                    <Avatar name={m.name} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold">{m.name}</div>
                      <div className="truncate text-[12.5px] text-muted">{[m.title, m.email].filter(Boolean).join(' · ')}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {m.roles.map((r) => (
                          <Badge key={r} tone={r === 'interviewer' ? 'neutral' : 'accent'}>
                            {ROLE_LABELS[r] ?? r}
                          </Badge>
                        ))}
                        {m.status !== 'active' && <Badge tone="warning">{m.status}</Badge>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {!!team.data?.invites.length && (
              <div className="border-t border-border px-5 py-4">
                <h3 className="mb-2 text-[12.5px] font-semibold text-muted">Pending invitations</h3>
                <ul className="space-y-2 text-[13px]">
                  {team.data.invites.map((i) => (
                    <li key={i.id}>
                      <div className="truncate font-medium">{i.email}</div>
                      <div className="text-[12px] text-subtle">
                        {i.roles.map((r) => ROLE_LABELS[r] ?? r).join(', ')} · expires {formatDate(i.expiresAt)}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </aside>
      </div>
      <InviteDialog open={invite} onOpenChange={setInvite} allowed={allowed} />
    </div>
  );
}
