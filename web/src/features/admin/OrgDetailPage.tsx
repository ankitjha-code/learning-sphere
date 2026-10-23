import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PencilSimpleIcon, ProhibitIcon, ArrowCounterClockwiseIcon, UsersIcon, ScrollIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDate, timeAgo } from '@/lib/format';
import {
  Badge,
  Banner,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Progress,
  ProvenanceTag,
  Section,
  Select,
  SkeletonRows,
  StatusBadge,
  Switch,
  Textarea,
} from '@/components/ui';
import { ROLE_LABELS, ORG_KINDS, type OrgRole } from '@shared/roles';
import { formatBytes, type LimitCheck, type Plan } from './api';
import { BillingModeBanner, useBillingMode, DetailList, TableCard, Th, rowClass, tdClass, theadClass } from './components';

type Policies = {
  requireVerifiedRecordForPlacement: boolean;
  allowStudentDirectory: boolean;
  aiEnabled: boolean;
  aiMonthlyRequestLimit: number | null;
  maxUploadMb: number;
};

type OrgDetail = {
  org: {
    id: string;
    name: string;
    slug: string;
    kind: string;
    description: string | null;
    website: string | null;
    branding: { accent?: string };
    planId: string;
    isSample: boolean;
    status: string;
    createdAt: string;
  };
  policies: Policies;
  policyDefaults: Policies;
  policyDescriptions: Record<keyof Policies, string>;
  members: { membershipId: string; userId: string; name: string; email: string; roles: OrgRole[]; status: string; userStatus: string; lastActiveAt: string | null; joinedAt: string }[];
  membersTruncated: boolean;
  invites: { id: string; email: string; roles: string[]; expiresAt: string }[];
  plan: Plan;
  usage: LimitCheck[];
  billing: { mode: string; notice: string };
};

const METRIC_LABEL: Record<string, string> = {
  'org.members': 'Active members',
  'job_postings.active': 'Published job postings',
  'assessments.month': 'Assessments created this month',
  'ai.requests.month': 'AI requests this month (org policy)',
};

export function UsageRow({ u }: { u: LimitCheck }) {
  const label = METRIC_LABEL[u.metric] ?? u.metric;
  const value = u.metric === 'storage.bytes' ? formatBytes(u.used) : u.used;
  const limit = u.limit === null ? 'No limit' : u.metric === 'storage.bytes' ? formatBytes(u.limit) : u.limit;
  const ratio = u.limit ? u.used / u.limit : 0;
  return (
    <li>
      <div className="mb-1.5 flex justify-between gap-3 text-[13.5px]">
        <span>{label}</span>
        <span className="tabular-nums">
          {value} / {limit}
        </span>
      </div>
      {u.limit !== null && <Progress value={u.used} max={u.limit} tone={ratio >= 1 ? 'warning' : ratio >= 0.8 ? 'xp' : 'accent'} label={`${label} usage`} />}
      <p className="mt-1 text-[12px] text-subtle">{u.explanation}</p>
    </li>
  );
}

function EditOrgDialog({ d, open, onOpenChange }: { d: OrgDetail; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: d.org.name, kind: d.org.kind, description: d.org.description ?? '', website: d.org.website ?? '', accent: d.org.branding.accent ?? '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () =>
      api.patch(`/admin/orgs/${d.org.id}`, {
        name: form.name,
        kind: form.kind,
        description: form.description || null,
        website: form.website || null,
        accent: form.accent || null,
      }),
    onSuccess: () => {
      toast.success('Organization updated');
      qc.invalidateQueries({ queryKey: ['admin'] });
      onOpenChange(false);
    },
    onError: (e) => (e instanceof ApiError && Object.keys(e.fields).length ? setFields(e.fields) : toast.error(errorMessage(e))),
  });
  const set = (k: keyof typeof form, v: string) => {
    setFields((f) => ({ ...f, [k]: '' }));
    setForm((f) => ({ ...f, [k]: v }));
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit organization"
      size="lg"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" error={fields.name}>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Kind" helper="Changing the kind changes which roles can be granted.">
          <Select value={form.kind} onChange={(e) => set('kind', e.target.value)}>
            {ORG_KINDS.map((k) => (
              <option key={k} value={k}>
                {k.charAt(0).toUpperCase() + k.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Website" optional error={fields.website}>
          <Input value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" />
        </Field>
        <Field
          label="Branding accent"
          optional
          error={fields.accent}
          helper={
            <span className="inline-flex items-center gap-1.5">
              {/^#[0-9a-fA-F]{6}$/.test(form.accent) && <span aria-hidden className="inline-block h-3.5 w-3.5 rounded border border-border" style={{ background: form.accent }} />}
              Hex colour such as #0f766e. Used on the organization's shared pages.
            </span>
          }
        >
          <Input value={form.accent} onChange={(e) => set('accent', e.target.value)} placeholder="#0f766e" />
        </Field>
        <Field label="Description" optional className="sm:col-span-2">
          <Textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function PoliciesCard({ d }: { d: OrgDetail }) {
  const qc = useQueryClient();
  const [p, setP] = useState<Policies>(d.policies);
  const [limitText, setLimitText] = useState(d.policies.aiMonthlyRequestLimit?.toString() ?? '');
  const [fields, setFields] = useState<Record<string, string>>({});
  useEffect(() => {
    setP(d.policies);
    setLimitText(d.policies.aiMonthlyRequestLimit?.toString() ?? '');
  }, [d.policies]);
  const dirty = JSON.stringify(p) !== JSON.stringify(d.policies) || limitText !== (d.policies.aiMonthlyRequestLimit?.toString() ?? '');
  const save = useMutation({
    mutationFn: () => api.put(`/admin/orgs/${d.org.id}/policies`, { ...p, aiMonthlyRequestLimit: limitText.trim() === '' ? null : Number(limitText) }),
    onSuccess: () => {
      toast.success('Policies saved');
      setFields({});
      qc.invalidateQueries({ queryKey: ['admin', 'org', d.org.id] });
    },
    onError: (e) => (e instanceof ApiError && Object.keys(e.fields).length ? setFields(e.fields) : toast.error(errorMessage(e))),
  });
  return (
    <Card>
      <CardHeader title="Policies" description="Rules that apply to everyone in this organization. Other features read these settings on the server." />
      <CardBody className="space-y-4">
        <Switch
          checked={p.allowStudentDirectory}
          onCheckedChange={(v) => setP({ ...p, allowStudentDirectory: v })}
          label="Student directory"
          description={d.policyDescriptions.allowStudentDirectory}
        />
        <Switch
          checked={p.requireVerifiedRecordForPlacement}
          onCheckedChange={(v) => setP({ ...p, requireVerifiedRecordForPlacement: v })}
          label="Require verified records for placement"
          description={d.policyDescriptions.requireVerifiedRecordForPlacement}
        />
        <Switch checked={p.aiEnabled} onCheckedChange={(v) => setP({ ...p, aiEnabled: v })} label="AI assistants" description={d.policyDescriptions.aiEnabled} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Monthly AI request limit" optional error={fields.aiMonthlyRequestLimit} helper={d.policyDescriptions.aiMonthlyRequestLimit}>
            <Input type="number" min={0} value={limitText} onChange={(e) => setLimitText(e.target.value)} placeholder="Plan limit applies" />
          </Field>
          <Field label="Maximum upload size (MB)" error={fields.maxUploadMb} helper={d.policyDescriptions.maxUploadMb}>
            <Input type="number" min={1} max={10} value={p.maxUploadMb} onChange={(e) => setP({ ...p, maxUploadMb: Number(e.target.value) })} />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            onClick={() => {
              setP(d.policies);
              setLimitText(d.policies.aiMonthlyRequestLimit?.toString() ?? '');
              setFields({});
            }}
            disabled={!dirty}
            disabledReason="No unsaved changes"
          >
            Discard
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!dirty} disabledReason="No unsaved changes" onClick={() => save.mutate()}>
            Save policies
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function PlanCard({ d }: { d: OrgDetail }) {
  const qc = useQueryClient();
  const [planId, setPlanId] = useState(d.org.planId);
  const [confirm, setConfirm] = useState(false);
  const plans = useQuery({ queryKey: ['admin', 'plans'], queryFn: () => api.get<{ plans: Plan[] }>('/admin/plans') });
  const change = useMutation({
    mutationFn: () => api.put(`/admin/orgs/${d.org.id}/plan`, { planId }),
    onSuccess: () => {
      toast.success('Plan changed. No payment was taken.');
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const target = plans.data?.plans.find((p) => p.id === planId);
  const billing = useBillingMode();
  return (
    <Card>
      <CardHeader title="Plan and usage" description={`Currently on the ${d.plan.name} plan.`} />
      <CardBody className="space-y-4">
        <BillingModeBanner />
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Plan" className="min-w-[180px]">
            <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
              {(plans.data?.plans ?? [d.plan]).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="primary" onClick={() => setConfirm(true)} disabled={planId === d.org.planId} disabledReason="Choose a different plan">
            Change plan
          </Button>
        </div>
        <ul className="space-y-4 border-t border-border pt-4">
          {d.usage.map((u) => (
            <UsageRow key={u.metric} u={u} />
          ))}
        </ul>
        <p className="text-[12.5px] text-muted">
          Per-user limits on this plan: {d.plan.limits.aiRequestsPerUserPerDay} AI requests per day, {d.plan.limits.storagePerUserMb} MB storage. Limits are checked from stored records when someone
          acts.
        </p>
      </CardBody>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Move ${d.org.name} to ${target?.name ?? planId}?`}
        description={`${billing.mode === 'demonstration' ? 'Demonstration mode: no payment is processed and no invoice is created.' : 'This change is complimentary: no payment is taken and no invoice is created.'} The new limits apply immediately; existing records above a lower limit are kept, but new ones are blocked until usage drops.`}
        confirmLabel="Change plan"
        loading={change.isPending}
        onConfirm={() => change.mutate()}
      />
    </Card>
  );
}

export default function OrgDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'org', id], queryFn: () => api.get<OrgDetail>(`/admin/orgs/${id}`) });
  const [editing, setEditing] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [reason, setReason] = useState('');
  const suspend = useMutation({
    mutationFn: () => api.post(`/admin/orgs/${id}/suspend`, { reason }),
    onSuccess: () => {
      toast.success('Organization suspended');
      setSuspending(false);
      setReason('');
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reactivate = useMutation({
    mutationFn: () => api.post(`/admin/orgs/${id}/reactivate`),
    onSuccess: () => {
      toast.success('Organization reactivated');
      setReactivating(false);
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <SkeletonRows rows={6} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const o = d.org;

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/admin/orgs" className="hover:underline">
            Organizations
          </Link>
        }
        title={o.name}
        badge={
          <>
            <StatusBadge status={o.status} />
            <Badge tone="accent">{d.plan.name}</Badge>
            {o.isSample && <ProvenanceTag kind="sample" />}
          </>
        }
        description={o.description ?? undefined}
        actions={
          <>
            <ButtonLink to={`/app/admin/audit?orgId=${o.id}`} icon={<ScrollIcon size={16} />}>
              Audit log
            </ButtonLink>
            <Button icon={<PencilSimpleIcon size={16} />} onClick={() => setEditing(true)}>
              Edit
            </Button>
            {o.status === 'active' ? (
              <Button variant="danger" icon={<ProhibitIcon size={16} />} onClick={() => setSuspending(true)}>
                Suspend
              </Button>
            ) : (
              <Button icon={<ArrowCounterClockwiseIcon size={16} />} onClick={() => setReactivating(true)}>
                Reactivate
              </Button>
            )}
          </>
        }
      />
      {o.status === 'suspended' && (
        <Banner tone="warning" title="Suspended" className="mb-4">
          Memberships in this organization currently grant no access. Members still have their personal accounts.
        </Banner>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-2">
        <div className="min-w-0 space-y-8">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DetailList
                items={[
                  ['Slug', <span className="font-mono">{o.slug}</span>],
                  ['Kind', <span className="capitalize">{o.kind}</span>],
                  ['Website', o.website ?? 'Not set'],
                  [
                    'Accent',
                    o.branding.accent ? (
                      <span className="inline-flex items-center gap-2">
                        <span aria-hidden className="h-4 w-4 rounded border border-border" style={{ background: o.branding.accent }} />
                        <span className="font-mono">{o.branding.accent}</span>
                      </span>
                    ) : (
                      'Default'
                    ),
                  ],
                  ['Created', formatDate(o.createdAt)],
                  ['Pending invitations', d.invites.length],
                ]}
              />
            </CardBody>
          </Card>
          <PoliciesCard d={d} />
        </div>
        <PlanCard d={d} />
      </div>

      <Section className="mt-8" title="Members" description="Read-only. Organization admins invite people and change roles from their own workspace. There is no impersonation.">
        {d.members.length === 0 ? (
          <EmptyState
            icon={<UsersIcon size={22} />}
            title="No members yet"
            description={
              d.invites.length ? 'Invitations are pending; members appear once they accept.' : 'Create an invitation for the first admin from the organization list, or ask them to register.'
            }
          />
        ) : (
          <TableCard label="Members">
            <thead className={theadClass}>
              <tr>
                <Th>Member</Th>
                <Th>Roles</Th>
                <Th>Status</Th>
                <Th>Last active</Th>
              </tr>
            </thead>
            <tbody>
              {d.members.map((m) => (
                <tr key={m.membershipId} className={rowClass}>
                  <td className={tdClass}>
                    <Link to={`/app/admin/users/${m.userId}`} className="font-medium hover:underline">
                      {m.name}
                    </Link>
                    <div className="text-[12.5px] text-muted">{m.email}</div>
                  </td>
                  <td className={tdClass}>
                    <div className="flex flex-wrap gap-1">
                      {m.roles.map((r) => (
                        <Badge key={r}>{ROLE_LABELS[r] ?? r}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className={tdClass}>
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge status={m.status} />
                      {m.userStatus !== 'active' && <Badge tone="warning">Account {m.userStatus.replace('_', ' ')}</Badge>}
                    </div>
                  </td>
                  <td className={`${tdClass} text-muted`}>{m.lastActiveAt ? timeAgo(m.lastActiveAt) : 'Never'}</td>
                </tr>
              ))}
            </tbody>
          </TableCard>
        )}
        {d.membersTruncated && <p className="mt-3 text-[12.5px] text-muted">Showing the first 300 members alphabetically.</p>}
      </Section>

      {editing && <EditOrgDialog d={d} open={editing} onOpenChange={setEditing} />}
      <ConfirmDialog
        open={suspending}
        onOpenChange={setSuspending}
        title={`Suspend ${o.name}?`}
        description="Every membership in this organization stops granting access immediately. Organization admins are notified. You can reactivate it later; no data is deleted."
        confirmLabel="Suspend organization"
        danger
        confirmText={o.slug}
        loading={suspend.isPending}
        onConfirm={() => suspend.mutate()}
      >
        <Field label="Reason" helper="Kept in the audit log.">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog
        open={reactivating}
        onOpenChange={setReactivating}
        title={`Reactivate ${o.name}?`}
        description="Members regain access according to their roles. Organization admins are notified."
        confirmLabel="Reactivate"
        loading={reactivate.isPending}
        onConfirm={() => reactivate.mutate()}
      />
    </div>
  );
}
