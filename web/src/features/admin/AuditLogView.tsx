import { Fragment, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ScrollIcon, MagnifyingGlassIcon, DownloadSimpleIcon, CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import { api, qs } from '@/lib/api';
import { formatDateTime, fromLocalInput } from '@/lib/format';
import { Badge, Button, EmptyState, ErrorState, Field, Input, Pagination, Select, SkeletonRows, buttonClass } from '@/components/ui';
import { ACTION_LABELS, csvHref, type AuditRow, type Paged } from './api';
import { FilterBar, JsonBlock, TableCard, Th, rowClass, tdClass, theadClass } from './components';

type Extra = { orgName?: string | null; canExport?: boolean; exportReason?: string | null };

const ACTION_PREFIXES = [
  ['admin.', 'Platform admin actions'],
  ['admin.user_', 'Admin: users'],
  ['admin.org_', 'Admin: organizations'],
  ['admin.job', 'Admin: background jobs'],
  ['org.', 'Organization changes'],
  ['auth.', 'Sign-in and security'],
  ['privacy.', 'Privacy requests'],
] as const;

/**
 * Shared audit table for the platform view (/admin/audit) and the org admin view
 * (/admin/org-audit). Filters live in the URL so a filtered view can be shared.
 */
export function AuditLogView({ endpoint, orgPicker }: { endpoint: '/admin/audit' | '/admin/org-audit'; orgPicker?: boolean }) {
  const [params, setParams] = useSearchParams();
  const f = {
    action: params.get('action') ?? '',
    actor: params.get('actor') ?? '',
    targetType: params.get('targetType') ?? '',
    targetId: params.get('targetId') ?? '',
    orgId: params.get('orgId') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  };
  const page = Number(params.get('page') ?? 1);
  const [actorText, setActorText] = useState(f.actor);
  const [targetText, setTargetText] = useState(f.targetId);
  const [expanded, setExpanded] = useState<string | null>(null);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  const apiFilters = { ...f, orgId: orgPicker ? f.orgId : '', from: fromLocalInput(f.from) ?? '', to: fromLocalInput(f.to) ?? '' };

  const orgs = useQuery({
    queryKey: ['admin', 'orgs', 'picker'],
    queryFn: () => api.get<Paged<{ id: string; name: string }>>('/admin/orgs?pageSize=100'),
    enabled: !!orgPicker,
    retry: false,
  });
  const list = useQuery({
    queryKey: ['admin', 'audit', endpoint, apiFilters, page],
    queryFn: () => api.get<Paged<AuditRow> & Extra>(`${endpoint}${qs({ ...apiFilters, page, pageSize: 50 })}`),
    placeholderData: keepPreviousData,
  });
  const filtered = Object.values(f).some(Boolean);
  const exportHref = csvHref(`${endpoint}/export.csv${qs(apiFilters)}`);
  const canExport = endpoint === '/admin/audit' || !!list.data?.canExport;

  return (
    <div>
      <FilterBar>
        <Field label="Action">
          <Select value={f.action} onChange={(e) => set('action', e.target.value)}>
            <option value="">Any action</option>
            {ACTION_PREFIXES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
            {f.action && !ACTION_PREFIXES.some(([v]) => v === f.action) && <option value={f.action}>{f.action}</option>}
          </Select>
        </Field>
        <Field label="Actor">
          <Input
            type="search"
            value={actorText}
            placeholder="Name or email"
            onChange={(e) => setActorText(e.target.value)}
            onBlur={() => set('actor', actorText.trim())}
            onKeyDown={(e) => e.key === 'Enter' && set('actor', actorText.trim())}
          />
        </Field>
        <Field label="Target type">
          <Select value={f.targetType} onChange={(e) => set('targetType', e.target.value)}>
            <option value="">Any target</option>
            {['user', 'organization', 'job', 'incident', 'report', 'plan', 'system_settings', 'invite', 'audit_log'].map((t) => (
              <option key={t} value={t}>
                {t.replace('_', ' ')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Target ID">
          <Input
            value={targetText}
            placeholder="Exact ID"
            onChange={(e) => setTargetText(e.target.value)}
            onBlur={() => set('targetId', targetText.trim())}
            onKeyDown={(e) => e.key === 'Enter' && set('targetId', targetText.trim())}
          />
        </Field>
        {orgPicker && (
          <Field label="Organization">
            <Select value={f.orgId} onChange={(e) => set('orgId', e.target.value)}>
              <option value="">All organizations</option>
              {orgs.data?.items.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="From">
          <Input type="datetime-local" value={f.from} onChange={(e) => set('from', e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="datetime-local" value={f.to} onChange={(e) => set('to', e.target.value)} />
        </Field>
        <div className="flex items-end gap-2 self-end">
          {filtered && (
            <Button
              variant="ghost"
              onClick={() => {
                setActorText('');
                setTargetText('');
                setParams(new URLSearchParams(), { replace: true });
              }}
            >
              Clear filters
            </Button>
          )}
          {canExport ? (
            <a className={buttonClass('secondary')} href={exportHref} download>
              <DownloadSimpleIcon size={16} /> Export CSV
            </a>
          ) : (
            <Button disabled disabledReason={list.data?.exportReason ?? 'Export is not available.'} icon={<DownloadSimpleIcon size={16} />}>
              Export CSV
            </Button>
          )}
        </div>
      </FilterBar>

      {list.isLoading && <SkeletonRows rows={8} />}
      {list.error && <ErrorState error={list.error} onRetry={() => list.refetch()} />}
      {list.data && list.data.items.length === 0 && (
        <EmptyState
          icon={filtered ? <MagnifyingGlassIcon size={22} /> : <ScrollIcon size={22} />}
          title={filtered ? 'No entries match these filters' : 'No audit entries yet'}
          description={filtered ? 'Widen the date range or clear a filter.' : 'Sensitive actions such as role changes, exports and admin actions are recorded here.'}
        />
      )}
      {list.data && list.data.items.length > 0 && (
        <>
          <TableCard label="Audit log">
            <thead className={theadClass}>
              <tr>
                <Th>
                  <span className="sr-only">Expand</span>
                </Th>
                <Th>Time</Th>
                <Th>Action</Th>
                <Th>Actor</Th>
                {orgPicker && <Th>Organization</Th>}
                <Th>Target</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((r) => (
                <Fragment key={r.id}>
                  <tr className={rowClass}>
                    <td className={`${tdClass} w-8`}>
                      <button
                        type="button"
                        className="rounded p-1 text-muted hover:bg-surface-2"
                        aria-expanded={expanded === r.id}
                        aria-label="Show details"
                        onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                      >
                        {expanded === r.id ? <CaretDownIcon size={14} /> : <CaretRightIcon size={14} />}
                      </button>
                    </td>
                    <td className={`${tdClass} whitespace-nowrap text-muted`}>{formatDateTime(r.createdAt)}</td>
                    <td className={tdClass}>
                      <div className="font-medium">{ACTION_LABELS[r.action] ?? r.action}</div>
                      {ACTION_LABELS[r.action] && <div className="font-mono text-[11.5px] text-subtle">{r.action}</div>}
                    </td>
                    <td className={tdClass}>
                      {r.actorName ?? <span className="text-subtle">System</span>}
                      {r.actorRole && (
                        <div>
                          <Badge tone="accent">{r.actorRole === 'platform_admin' ? 'Platform admin' : 'Support'}</Badge>
                        </div>
                      )}
                    </td>
                    {orgPicker && <td className={`${tdClass} text-muted`}>{r.orgName ?? '—'}</td>}
                    <td className={`${tdClass} text-muted`}>
                      {r.targetType ? (
                        <>
                          {r.targetType.replace('_', ' ')}
                          {r.targetId && <div className="max-w-[220px] truncate font-mono text-[11.5px]">{r.targetId}</div>}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr className={rowClass}>
                      <td />
                      <td colSpan={orgPicker ? 5 : 4} className="px-3 pb-3">
                        <JsonBlock value={r.meta} label="Audit entry details" />
                        <p className="mt-1 text-[12px] text-subtle">
                          {r.actorEmail && <>Actor email {r.actorEmail}. </>}
                          {r.ip && <>IP {r.ip}. </>}
                          {r.requestId && <>Request {r.requestId}.</>}
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </TableCard>
          <Pagination page={page} pageSize={50} total={list.data.total} onPage={(p) => set('page', String(p))} />
        </>
      )}
    </div>
  );
}
