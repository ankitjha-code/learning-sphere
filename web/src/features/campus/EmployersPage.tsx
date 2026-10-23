import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BuildingOfficeIcon, LinkIcon, PlusIcon, PencilSimpleIcon, TrashIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, ApiError, errorMessage, qs } from '@/lib/api';
import { Badge, Button, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input, Menu, PageHeader, Select, SkeletonRows, StatusBadge, Textarea } from '@/components/ui';
import { CAMPUS_KEY, TableWrap, td, th } from './shared';

type Employer = { id: string; companyName: string; companyOrgId: string | null; contactName: string | null; contactEmail: string | null; status: string; notes: string | null; drives: number; createdAt: string };

/** Search companies on the platform by name (debounced). */
export function CompanyPicker({ value, onPick }: { value: { id: string; name: string } | null; onPick: (v: { id: string; name: string } | null) => void }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const res = useQuery({ queryKey: [...CAMPUS_KEY, 'companies', debounced], queryFn: () => api.get<{ items: { id: string; name: string }[] }>(`/campus/companies${qs({ q: debounced })}`), enabled: debounced.length > 0 });
  if (value)
    return (
      <div className="flex items-center gap-2 text-[13px]">
        <Badge tone="accent" icon={<LinkIcon size={12} />}>
          Linked to {value.name} on the platform
        </Badge>
        <Button size="sm" variant="ghost" onClick={() => onPick(null)}>
          Unlink
        </Button>
      </div>
    );
  return (
    <div className="space-y-1.5">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies on LearnSphere" aria-label="Search companies" />
      {debounced && (
        <div className="rounded-md border border-border">
          {res.isLoading ? (
            <p className="px-3 py-2 text-[12.5px] text-subtle">Searching...</p>
          ) : !res.data?.items.length ? (
            <p className="px-3 py-2 text-[12.5px] text-subtle">No company with that name is on the platform. You can still record it by name.</p>
          ) : (
            <ul>
              {res.data.items.map((c) => (
                <li key={c.id}>
                  <button type="button" className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-surface-2" onClick={() => onPick(c)}>
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function EmployerDialog({ initial, onOpenChange }: { initial?: Employer; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ companyName: initial?.companyName ?? '', contactName: initial?.contactName ?? '', contactEmail: initial?.contactEmail ?? '', status: initial?.status ?? 'active', notes: initial?.notes ?? '' });
  const [company, setCompany] = useState<{ id: string; name: string } | null>(initial?.companyOrgId ? { id: initial.companyOrgId, name: initial.companyName } : null);
  const m = useMutation({
    mutationFn: () => {
      const payload = { ...form, contactName: form.contactName || null, contactEmail: form.contactEmail || null, notes: form.notes || null, companyOrgId: company?.id ?? null };
      return initial ? api.patch(`/campus/employers/${initial.id}`, payload) : api.post('/campus/employers', payload);
    },
    onSuccess: () => {
      toast.success(initial ? 'Employer saved' : 'Employer added');
      qc.invalidateQueries({ queryKey: [...CAMPUS_KEY, 'employers'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const f = m.error instanceof ApiError ? m.error.fields : {};
  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={initial ? 'Edit employer' : 'Add employer'}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={form.companyName.trim().length < 2} disabledReason="Enter the company name" onClick={() => m.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="On-platform company" optional helper="Linking lets you pre-fill drives and see the company profile.">
          <CompanyPicker
            value={company}
            onPick={(c) => {
              setCompany(c);
              if (c) setForm((x) => ({ ...x, companyName: c.name }));
            }}
          />
        </Field>
        <Field label="Company name" error={f.companyName}>
          <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact name" optional error={f.contactName}>
            <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          </Field>
          <Field label="Contact email" optional error={f.contactEmail}>
            <Input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
          </Field>
        </div>
        <Field label="Relationship status">
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="prospect">Prospect</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </Select>
        </Field>
        <Field label="Notes" optional>
          <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Hiring cycles, preferred skills, last conversation" />
        </Field>
      </div>
    </Dialog>
  );
}

export default function EmployersPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<Employer | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Employer | null>(null);
  const q = useQuery({ queryKey: [...CAMPUS_KEY, 'employers', status], queryFn: () => api.get<{ items: Employer[] }>(`/campus/employers${qs({ status })}`) });
  const del = useMutation({
    mutationFn: () => api.del(`/campus/employers/${deleting!.id}`),
    onSuccess: () => {
      toast.success('Employer removed. Drive history is kept.');
      setDeleting(null);
      qc.invalidateQueries({ queryKey: [...CAMPUS_KEY, 'employers'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Employers"
        description="Companies you work with for placements. Link a company that is on the platform, or record it by name."
        actions={
          <Button variant="primary" icon={<PlusIcon size={15} />} onClick={() => setEditing('new')}>
            Add employer
          </Button>
        }
      />
      <div className="mb-4">
      <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className="w-44">
        <option value="">All statuses</option>
        <option value="prospect">Prospect</option>
        <option value="active">Active</option>
        <option value="paused">Paused</option>
      </Select>
      </div>
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <SkeletonRows rows={4} />
      ) : !q.data.items.length ? (
        <EmptyState
          icon={<BuildingOfficeIcon size={22} />}
          title="No employers yet"
          description="Keep track of companies, contacts and notes. Drives can then be created for them."
          action={
            <Button variant="primary" onClick={() => setEditing('new')}>
              Add employer
            </Button>
          }
        />
      ) : (
        <TableWrap>
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-border">
              <tr>
                <th className={th}>Company</th>
                <th className={th}>Contact</th>
                <th className={th}>Status</th>
                <th className={th}>Drives</th>
                <th className={th}>Notes</th>
                <th className={th} aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {q.data.items.map((e) => (
                <tr key={e.id}>
                  <td className={td}>
                    <div className="font-medium">{e.companyName}</div>
                    {e.companyOrgId && (
                      <Badge tone="accent" icon={<LinkIcon size={11} />} className="mt-1">
                        On platform
                      </Badge>
                    )}
                  </td>
                  <td className={td}>
                    {e.contactName ?? <span className="text-subtle">No contact</span>}
                    {e.contactEmail && <div className="text-[12px] text-subtle">{e.contactEmail}</div>}
                  </td>
                  <td className={td}>
                    <StatusBadge status={e.status} />
                  </td>
                  <td className={td}>
                    <Link to={`/app/campus/drives?q=${encodeURIComponent(e.companyName)}`} className="hover:underline">
                      {e.drives}
                    </Link>
                  </td>
                  <td className={`${td} max-w-xs text-muted`}>
                    <span className="line-clamp-2">{e.notes}</span>
                  </td>
                  <td className={`${td} text-right`}>
                    <Menu
                      items={[
                        { label: 'Edit', icon: <PencilSimpleIcon size={14} />, onSelect: () => setEditing(e) },
                        { label: 'Remove', icon: <TrashIcon size={14} />, danger: true, onSelect: () => setDeleting(e) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {editing && <EmployerDialog initial={editing === 'new' ? undefined : editing} onOpenChange={(v) => !v && setEditing(null)} />}
      <ConfirmDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)} title="Remove employer?" description={`${deleting?.companyName ?? ''} and its notes will be removed. Drives that used this company keep their history.`} confirmLabel="Remove" danger loading={del.isPending} onConfirm={() => del.mutate()} />
    </div>
  );
}
