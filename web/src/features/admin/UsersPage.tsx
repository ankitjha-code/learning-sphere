import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { UsersIcon, MagnifyingGlassIcon, DownloadSimpleIcon, ShieldCheckIcon } from '@phosphor-icons/react';
import { api, qs } from '@/lib/api';
import { timeAgo, formatDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Avatar, Badge, EmptyState, ErrorState, Field, Input, PageHeader, Pagination, ProvenanceTag, Select, SkeletonRows, StatusBadge, Tabs, buttonClass } from '@/components/ui';
import { ROLE_LABELS, ORG_ROLES, type OrgRole, type PlatformRole } from '@shared/roles';
import { csvHref, type Paged } from './api';
import { FilterBar, TableCard, Th, rowClass, tdClass, theadClass } from './components';

type UserRow = {
  id: string;
  name: string;
  email: string;
  platformRole: PlatformRole | null;
  status: string;
  isSample: boolean;
  avatarColor: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  orgCount: number;
};

type DataRequestRow = { id: string; userId: string; userName: string; userEmail: string; kind: string; status: string; scheduledFor: string | null; completedAt: string | null; createdAt: string };

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Accounts() {
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const q = useDebounced(text);
  const role = params.get('role') ?? '';
  const status = params.get('status') ?? '';
  const sample = params.get('sample') ?? '';
  const page = Number(params.get('page') ?? 1);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  useEffect(() => {
    if ((params.get('q') ?? '') !== q) set('q', q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const list = useQuery({
    queryKey: ['admin', 'users', { q, role, status, sample, page }],
    queryFn: () => api.get<Paged<UserRow>>(`/admin/users${qs({ q, role, status, sample, page, pageSize: 25 })}`),
    placeholderData: keepPreviousData,
  });
  const filtered = !!(q || role || status || sample);

  return (
    <div>
      <FilterBar>
        <Field label="Search">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Name or email" type="search" />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => set('role', e.target.value)}>
            <option value="">Any role</option>
            <option value="platform_admin">Platform admin</option>
            <option value="support">Support</option>
            <option value="none">No platform role</option>
            <optgroup label="Organization roles">
              {ORG_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r as OrgRole]}
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => set('status', e.target.value)}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="pending_deletion">Pending deletion</option>
            <option value="deleted">Deleted</option>
          </Select>
        </Field>
        <Field label="Data">
          <Select value={sample} onChange={(e) => set('sample', e.target.value)}>
            <option value="">Real and sample</option>
            <option value="false">Real accounts only</option>
            <option value="true">Sample accounts only</option>
          </Select>
        </Field>
      </FilterBar>
      {list.isLoading && <SkeletonRows rows={6} />}
      {list.error && <ErrorState error={list.error} onRetry={() => list.refetch()} />}
      {list.data && list.data.items.length === 0 && (
        <EmptyState
          icon={filtered ? <MagnifyingGlassIcon size={22} /> : <UsersIcon size={22} />}
          title={filtered ? 'No users match these filters' : 'No users yet'}
          description={filtered ? 'Try a shorter search or clear a filter.' : 'People appear here when they register or accept an invitation.'}
        />
      )}
      {list.data && list.data.items.length > 0 && (
        <>
          <TableCard label="Users">
            <thead className={theadClass}>
              <tr>
                <Th>User</Th>
                <Th>Platform role</Th>
                <Th>Status</Th>
                <Th className="text-right">Orgs</Th>
                <Th>Last active</Th>
                <Th>Joined</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((u) => (
                <tr key={u.id} className={rowClass}>
                  <td className={tdClass}>
                    <Link to={`/app/admin/users/${u.id}`} className="flex items-center gap-2.5 hover:underline">
                      <Avatar name={u.name} color={u.avatarColor} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{u.name}</span>
                        <span className="block truncate text-[12.5px] text-muted">{u.email}</span>
                      </span>
                    </Link>
                  </td>
                  <td className={tdClass}>
                    {u.platformRole ? (
                      <Badge tone="accent" icon={<ShieldCheckIcon size={12} />}>
                        {ROLE_LABELS[u.platformRole]}
                      </Badge>
                    ) : (
                      <span className="text-subtle">None</span>
                    )}
                  </td>
                  <td className={tdClass}>
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge status={u.status} />
                      {u.isSample && <ProvenanceTag kind="sample" />}
                    </div>
                  </td>
                  <td className={`${tdClass} text-right tabular-nums`}>{u.orgCount}</td>
                  <td className={`${tdClass} text-muted`}>{u.lastActiveAt ? timeAgo(u.lastActiveAt) : 'Never'}</td>
                  <td className={`${tdClass} text-muted`}>{formatDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </TableCard>
          <Pagination page={page} pageSize={25} total={list.data.total} onPage={(p) => set('page', String(p))} />
        </>
      )}
    </div>
  );
}

function DataRequests() {
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['admin', 'data-requests', { kind, status, page }],
    queryFn: () => api.get<Paged<DataRequestRow>>(`/admin/data-requests${qs({ kind, status, page, pageSize: 25 })}`),
    placeholderData: keepPreviousData,
  });
  return (
    <div>
      <p className="mb-4 max-w-[72ch] text-[13.5px] leading-relaxed text-muted">
        Export and deletion requests people made from Settings, Privacy, plus exports started by support. Exports are delivered only to the account owner. Deletions run after the grace period set in
        Platform settings.
      </p>
      <FilterBar>
        <Field label="Kind">
          <Select value={kind} onChange={(e) => (setKind(e.target.value), setPage(1))}>
            <option value="">Any kind</option>
            <option value="export">Export</option>
            <option value="deletion">Deletion</option>
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
            <option value="">Any status</option>
            {['pending', 'processing', 'ready', 'completed', 'cancelled', 'failed'].map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
      </FilterBar>
      {list.isLoading && <SkeletonRows rows={4} />}
      {list.error && <ErrorState error={list.error} onRetry={() => list.refetch()} />}
      {list.data && list.data.items.length === 0 && (
        <EmptyState icon={<DownloadSimpleIcon size={22} />} title="No data requests" description="When someone asks for a copy of their data or to delete their account, the request appears here." />
      )}
      {list.data && list.data.items.length > 0 && (
        <>
          <TableCard label="Data requests">
            <thead className={theadClass}>
              <tr>
                <Th>User</Th>
                <Th>Kind</Th>
                <Th>Status</Th>
                <Th>Requested</Th>
                <Th>Scheduled or completed</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((r) => (
                <tr key={r.id} className={rowClass}>
                  <td className={tdClass}>
                    <Link to={`/app/admin/users/${r.userId}`} className="font-medium hover:underline">
                      {r.userName}
                    </Link>
                    <div className="text-[12.5px] text-muted">{r.userEmail}</div>
                  </td>
                  <td className={`${tdClass} capitalize`}>{r.kind}</td>
                  <td className={tdClass}>
                    <StatusBadge status={r.status} />
                  </td>
                  <td className={`${tdClass} text-muted`}>{timeAgo(r.createdAt)}</td>
                  <td className={`${tdClass} text-muted`}>{r.completedAt ? `Completed ${formatDate(r.completedAt)}` : r.scheduledFor ? `Scheduled ${formatDate(r.scheduledFor)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </TableCard>
          <Pagination page={page} pageSize={25} total={list.data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

export default function UsersPage() {
  const me = useSession();
  const [tab, setTab] = useState('accounts');
  return (
    <div>
      <PageHeader
        title="Users"
        description="Find accounts, review memberships and sessions, suspend or restore access, and help people recover their accounts. Support staff can view; platform admins can act."
        actions={
          me.user.platformRole === 'platform_admin' && (
            <a className={buttonClass('secondary')} href={csvHref('/admin/exports/users.csv')} download>
              <DownloadSimpleIcon size={16} /> Export CSV
            </a>
          )
        }
      />
      <Tabs
        value={tab}
        onValueChange={setTab}
        className="mb-4"
        tabs={[
          { value: 'accounts', label: 'Accounts' },
          { value: 'requests', label: 'Data requests' },
        ]}
      />
      {tab === 'accounts' ? <Accounts /> : <DataRequests />}
    </div>
  );
}
