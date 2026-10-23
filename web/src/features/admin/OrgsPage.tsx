import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BuildingsIcon, PlusIcon, MagnifyingGlassIcon, DownloadSimpleIcon } from '@phosphor-icons/react';
import { api, qs, errorMessage, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import {
  Badge,
  Banner,
  Button,
  CopyButton,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Pagination,
  ProvenanceTag,
  Select,
  SkeletonRows,
  StatusBadge,
  Textarea,
  buttonClass,
} from '@/components/ui';
import { ORG_KINDS } from '@shared/roles';
import { csvHref, type Paged } from './api';
import { FilterBar, TableCard, Th, rowClass, tdClass, theadClass, BillingModeBanner, useBillingMode } from './components';

type OrgRow = { id: string; name: string; slug: string; kind: string; planId: string; status: string; isSample: boolean; createdAt: string; memberCount: number };

const PLAN_NAMES: Record<string, string> = { free: 'Free', campus: 'Campus', company: 'Company' };

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function CreateOrgDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', slug: '', kind: 'college', planId: 'free', description: '', adminEmail: '' });
  const [slugTouched, setSlugTouched] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [invite, setInvite] = useState<{ orgId: string; email: string; link: string } | null>(null);
  const billing = useBillingMode();
  const create = useMutation({
    mutationFn: () =>
      api.post<{ org: { id: string }; firstAdmin: { status: string; email?: string; inviteLink?: string } }>('/admin/orgs', {
        ...form,
        description: form.description || undefined,
        adminEmail: form.adminEmail || undefined,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['admin'] });
      if (r.firstAdmin.status === 'invited' && r.firstAdmin.inviteLink) {
        setInvite({ orgId: r.org.id, email: r.firstAdmin.email!, link: r.firstAdmin.inviteLink });
        return;
      }
      toast.success(r.firstAdmin.status === 'added' ? 'Organization created and first admin added' : 'Organization created');
      onOpenChange(false);
      navigate(`/app/admin/orgs/${r.org.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && Object.keys(e.fields).length) setFields(e.fields);
      else toast.error(errorMessage(e));
    },
  });
  const set = (k: keyof typeof form, v: string) => {
    setFields((f) => ({ ...f, [k]: '' }));
    setForm((f) => ({ ...f, [k]: v, ...(k === 'name' && !slugTouched ? { slug: slugify(v) } : {}) }));
  };

  if (invite) {
    return (
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) setInvite(null);
          onOpenChange(v);
        }}
        title="Organization created"
        description={`${invite.email} does not have an account yet, so an invitation was created.`}
        footer={
          <Button
            variant="primary"
            onClick={() => {
              onOpenChange(false);
              navigate(`/app/admin/orgs/${invite.orgId}`);
              setInvite(null);
            }}
          >
            Open organization
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="text-[13.5px] text-muted">Share this link with them. It makes them the organization admin when they register with that email. It expires in 14 days.</p>
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 p-2">
            <code className="min-w-0 flex-1 break-all font-mono text-[12.5px]">{invite.link}</code>
            <CopyButton value={invite.link} label="Copy link" />
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create organization"
      description="Colleges, companies, training institutes or communities. The first admin then invites everyone else."
      size="lg"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={create.isPending} onClick={() => create.mutate()} disabled={!form.name || !form.slug} disabledReason="Enter a name and slug">
            Create organization
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" error={fields.name} required>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Slug" error={fields.slug} helper="Lowercase letters, numbers and hyphens. Used in links.">
          <Input
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set('slug', e.target.value);
            }}
          />
        </Field>
        <Field label="Kind" error={fields.kind}>
          <Select value={form.kind} onChange={(e) => set('kind', e.target.value)}>
            {ORG_KINDS.map((k) => (
              <option key={k} value={k}>
                {k.charAt(0).toUpperCase() + k.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Plan" helper={billing.mode === 'demonstration' ? 'Demonstration mode: free and immediate.' : 'Assigned free of charge, effective immediately.'}>
          <Select value={form.planId} onChange={(e) => set('planId', e.target.value)}>
            {Object.entries(PLAN_NAMES).map(([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="First organization admin" optional error={fields.adminEmail} helper="An existing account is added directly; otherwise you get an invite link to share." className="sm:col-span-2">
          <Input type="email" value={form.adminEmail} onChange={(e) => set('adminEmail', e.target.value)} placeholder="name@example.edu" />
        </Field>
        <Field label="Description" optional className="sm:col-span-2">
          <Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

export default function OrgsPage() {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [planId, setPlanId] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    queryKey: ['admin', 'orgs', { q, kind, status, planId, page }],
    queryFn: () => api.get<Paged<OrgRow>>(`/admin/orgs${qs({ q, kind, status, planId, page, pageSize: 25 })}`),
    placeholderData: keepPreviousData,
  });
  const filtered = !!(q || kind || status || planId);
  return (
    <div>
      <PageHeader
        title="Organizations"
        description="Create and manage tenants, their plans and policies. Membership and roles inside an organization are managed by its own admins."
        actions={
          <>
            <a className={buttonClass('secondary')} href={csvHref('/admin/exports/orgs.csv')} download>
              <DownloadSimpleIcon size={16} /> Export CSV
            </a>
            <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setCreating(true)}>
              Create organization
            </Button>
          </>
        }
      />
      <BillingModeBanner className="mb-6" />
      <FilterBar>
        <Field label="Search">
          <Input type="search" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} placeholder="Name or slug" />
        </Field>
        <Field label="Kind">
          <Select value={kind} onChange={(e) => (setKind(e.target.value), setPage(1))}>
            <option value="">Any kind</option>
            {ORG_KINDS.map((k) => (
              <option key={k} value={k}>
                {k.charAt(0).toUpperCase() + k.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </Select>
        </Field>
        <Field label="Plan">
          <Select value={planId} onChange={(e) => (setPlanId(e.target.value), setPage(1))}>
            <option value="">Any plan</option>
            {Object.entries(PLAN_NAMES).map(([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
      </FilterBar>
      {list.isLoading && <SkeletonRows rows={5} />}
      {list.error && <ErrorState error={list.error} onRetry={() => list.refetch()} />}
      {list.data && list.data.items.length === 0 && (
        <EmptyState
          icon={filtered ? <MagnifyingGlassIcon size={22} /> : <BuildingsIcon size={22} />}
          title={filtered ? 'No organizations match' : 'No organizations yet'}
          description={filtered ? 'Clear a filter or search for part of the name.' : 'Create the first organization and invite its admin.'}
          action={
            !filtered && (
              <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setCreating(true)}>
                Create organization
              </Button>
            )
          }
        />
      )}
      {list.data && list.data.items.length > 0 && (
        <>
          <TableCard label="Organizations">
            <thead className={theadClass}>
              <tr>
                <Th>Organization</Th>
                <Th>Kind</Th>
                <Th>Plan</Th>
                <Th>Status</Th>
                <Th className="text-right">Members</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((o) => (
                <tr key={o.id} className={rowClass}>
                  <td className={tdClass}>
                    <Link to={`/app/admin/orgs/${o.id}`} className="font-medium hover:underline">
                      {o.name}
                    </Link>
                    <div className="font-mono text-[12px] text-muted">{o.slug}</div>
                  </td>
                  <td className={`${tdClass} capitalize`}>{o.kind}</td>
                  <td className={tdClass}>
                    <Badge tone="accent">{PLAN_NAMES[o.planId] ?? o.planId}</Badge>
                  </td>
                  <td className={tdClass}>
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge status={o.status} />
                      {o.isSample && <ProvenanceTag kind="sample" />}
                    </div>
                  </td>
                  <td className={`${tdClass} text-right tabular-nums`}>{o.memberCount}</td>
                  <td className={`${tdClass} text-muted`}>{formatDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </TableCard>
          <Pagination page={page} pageSize={25} total={list.data.total} onPage={setPage} />
        </>
      )}
      {creating && <CreateOrgDialog open={creating} onOpenChange={setCreating} />}
      {list.data?.items.some((o) => o.status === 'suspended') && (
        <Banner tone="info" className="mt-4">
          Members of suspended organizations keep their accounts, but the organization's workspaces and data are unavailable to them until it is reactivated.
        </Banner>
      )}
    </div>
  );
}
