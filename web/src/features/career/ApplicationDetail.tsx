import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PlusIcon, TrashIcon, ArrowSquareOutIcon, BellIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDateTime, toLocalInput, fromLocalInput, timeAgo } from '@/lib/format';
import { Dialog, Tabs, Button, CardAction, Field, Input, Textarea, Select, StatusBadge, Badge, SkeletonRows, ErrorState, ConfirmDialog, Banner, EmptyState } from '@/components/ui';
import { SOURCE_LABEL, STATUS_LABEL, type AppEvent, type AppStatus, type Application, type CareerDoc, type Contact, type Offer, type ResumeSummary, type Round } from './api';

type Detail = { application: Application; events: AppEvent[]; allowedTransitions: AppStatus[] };

const toDateInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

export function ApplicationDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const key = ['career', 'application', id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<Detail>(`/career/applications/${id}`), enabled: !!id });
  const resumes = useQuery({ queryKey: ['career', 'resumes'], queryFn: () => api.get<{ items: ResumeSummary[] }>('/career/resumes'), enabled: !!id });
  const docs = useQuery({ queryKey: ['career', 'documents', ''], queryFn: () => api.get<{ items: CareerDoc[] }>('/career/documents'), enabled: !!id });
  const [tab, setTab] = useState('overview');
  const [form, setForm] = useState<Partial<Application>>({});
  const [note, setNote] = useState('');
  const [statusTo, setStatusTo] = useState<AppStatus | ''>('');
  const [reason, setReason] = useState('');
  const [round, setRound] = useState<{ name: string; at: string }>({ name: '', at: '' });
  const [contact, setContact] = useState<Contact>({ name: '' });
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (q.data) setForm(q.data.application);
  }, [q.data]);
  useEffect(() => {
    setTab('overview');
    setStatusTo('');
    setReason('');
  }, [id]);

  const refresh = (d?: { application: Application }) => {
    if (d) qc.setQueryData<Detail>(key, (old) => (old ? { ...old, application: d.application } : old));
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['career', 'applications'] });
    qc.invalidateQueries({ queryKey: ['career', 'overview'] });
  };
  const patch = useMutation({
    mutationFn: (body: Partial<Application>) => api.patch<{ application: Application }>(`/career/applications/${id}`, body),
    onSuccess: (d) => {
      refresh(d);
      toast.success('Saved.');
    },
    onError: (e) => toast.error(e instanceof ApiError && Object.keys(e.fields).length ? `${errorMessage(e)} (${Object.keys(e.fields).join(', ')})` : errorMessage(e)),
  });
  const setStatus = useMutation({
    mutationFn: () => api.post<{ application: Application }>(`/career/applications/${id}/status`, { status: statusTo, outcomeReason: reason || undefined, note: reason || undefined }),
    onSuccess: (d) => {
      refresh(d);
      toast.success(`Moved to ${STATUS_LABEL[d.application.status]}.`);
      setStatusTo('');
      setReason('');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const addNote = useMutation({
    mutationFn: () => api.post(`/career/applications/${id}/notes`, { note }),
    onSuccess: () => {
      setNote('');
      refresh();
      toast.success('Note added.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const addRound = useMutation({
    mutationFn: () => api.post<{ application: Application }>(`/career/applications/${id}/rounds`, { name: round.name, at: round.at ? fromLocalInput(round.at) : '' }),
    onSuccess: (d) => {
      setRound({ name: '', at: '' });
      refresh(d);
      toast.success('Round added.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const updRound = useMutation({
    mutationFn: ({ rid, body }: { rid: string; body: Partial<Round> }) => api.patch<{ application: Application }>(`/career/applications/${id}/rounds/${rid}`, body),
    onSuccess: (d) => refresh(d),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const delRound = useMutation({
    mutationFn: (rid: string) => api.del<{ application: Application }>(`/career/applications/${id}/rounds/${rid}`),
    onSuccess: (d) => refresh(d),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: () => api.del(`/career/applications/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['career'] });
      toast.success('Removed from tracker.');
      setConfirmDelete(false);
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const a = q.data?.application;
  const offer: Offer = (form.offer as Offer) ?? {};
  const setOffer = (o: Partial<Offer>) => setForm({ ...form, offer: { ...offer, ...o } });
  const needsReason = statusTo === 'rejected' || statusTo === 'withdrawn';

  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && onClose()} size="xl" title={a ? `${a.role} at ${a.company}` : 'Application'} description={a ? `${SOURCE_LABEL[a.source] ?? a.source}${a.appliedAt ? ` · applied ${formatDateTime(a.appliedAt)}` : ''}` : undefined}>
      {q.isLoading ? (
        <SkeletonRows rows={5} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        a && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-surface-2 p-3">
              <div>
                <div className="text-[12px] text-muted">Status</div>
                <StatusBadge status={a.status} />
              </div>
              <Field label="Move to" className="w-44">
                <Select value={statusTo} onChange={(e) => setStatusTo(e.target.value as AppStatus)}>
                  <option value="">Choose next step</option>
                  {q.data!.allowedTransitions.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              {statusTo && (
                <Field label={needsReason ? 'Reason (for your records)' : 'Note'} optional className="min-w-56 flex-1">
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={statusTo === 'withdrawn' ? 'For example: accepted another offer' : ''} />
                </Field>
              )}
              <Button variant="primary" disabled={!statusTo} disabledReason="Choose a next step" loading={setStatus.isPending} onClick={() => setStatus.mutate()}>
                Update status
              </Button>
              {a.jobApplicationId && statusTo === 'withdrawn' && <p className="w-full text-[12.5px] text-warning">This was sent through the platform. Withdrawing also withdraws it with the employer, who will be notified.</p>}
            </div>
            {a.outcomeReason && (a.status === 'rejected' || a.status === 'withdrawn') && <Banner tone="info" title="Outcome">{a.outcomeReason}</Banner>}

            <Tabs
              value={tab}
              onValueChange={setTab}
              tabs={[
                { value: 'overview', label: 'Overview' },
                { value: 'timeline', label: 'Timeline', count: q.data!.events.length },
                { value: 'rounds', label: 'Rounds', count: a.rounds.length },
                { value: 'contacts', label: 'Contacts', count: a.contacts.length },
                { value: 'offer', label: 'Offer' },
              ]}
            />

            {tab === 'overview' && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Company">
                    <Input value={form.company ?? ''} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                  </Field>
                  <Field label="Role">
                    <Input value={form.role ?? ''} onChange={(e) => setForm({ ...form, role: e.target.value })} />
                  </Field>
                  <Field label="Location" optional>
                    <Input value={form.location ?? ''} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                  </Field>
                  <Field label="Job link" optional>
                    <Input value={form.sourceUrl ?? ''} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} />
                  </Field>
                  <Field label="Application deadline" optional>
                    <Input type="date" value={toDateInput(form.deadline ?? null)} onChange={(e) => setForm({ ...form, deadline: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                  </Field>
                  <Field label="Salary (as advertised)" optional>
                    <Input value={form.salaryText ?? ''} onChange={(e) => setForm({ ...form, salaryText: e.target.value })} />
                  </Field>
                  <Field label="Resume version used" optional>
                    <Select value={form.resumeId ?? ''} onChange={(e) => setForm({ ...form, resumeId: e.target.value || null })}>
                      <option value="">None</option>
                      {(resumes.data?.items ?? []).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Cover letter" optional>
                    <Select value={form.coverLetterId ?? ''} onChange={(e) => setForm({ ...form, coverLetterId: e.target.value || null })}>
                      <option value="">None</option>
                      {(docs.data?.items ?? []).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Follow-up reminder" optional helper="You get one notification at this time.">
                    <Input type="datetime-local" value={toLocalInput(form.nextActionAt ?? null)} onChange={(e) => setForm({ ...form, nextActionAt: fromLocalInput(e.target.value) })} />
                  </Field>
                </div>
                <Field label="Notes" optional>
                  <Textarea rows={4} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </Field>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                  <div className="-ml-2 flex flex-wrap items-center gap-1">
                    {a.sourceUrl && (
                      <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-accent-text transition-colors hover:bg-accent-soft">
                        Open job link <ArrowSquareOutIcon size={14} />
                      </a>
                    )}
                    {a.jobPostingId && (
                      <CardAction to={`/app/jobs/${a.jobPostingId}`}>View posting</CardAction>
                    )}
                    <CardAction to={`/app/career/documents?new=cover_letter&applicationId=${a.id}`}>Draft a cover letter</CardAction>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" icon={<TrashIcon size={14} />} onClick={() => setConfirmDelete(true)}>
                      Remove
                    </Button>
                    <Button
                      variant="primary"
                      loading={patch.isPending}
                      onClick={() =>
                        patch.mutate({
                          company: form.company,
                          role: form.role,
                          location: form.location || null,
                          sourceUrl: form.sourceUrl || null,
                          deadline: form.deadline ?? null,
                          salaryText: form.salaryText || null,
                          resumeId: form.resumeId || null,
                          coverLetterId: form.coverLetterId || null,
                          nextActionAt: form.nextActionAt ?? null,
                          notes: form.notes || null,
                        })
                      }
                    >
                      Save details
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {tab === 'timeline' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input aria-label="New note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (call notes, feedback, next steps)" />
                  <Button disabled={!note.trim()} disabledReason="Write a note first" loading={addNote.isPending} onClick={() => addNote.mutate()}>
                    Add note
                  </Button>
                </div>
                <ol className="space-y-2 border-l border-border pl-4">
                  {q.data!.events.map((e) => (
                    <li key={e.id} className="text-[13.5px]">
                      <div className="flex flex-wrap items-center gap-2">
                        {e.kind === 'status' ? (
                          <span>
                            {e.fromStatus ? `${STATUS_LABEL[e.fromStatus as AppStatus] ?? e.fromStatus} → ` : ''}
                            <strong>{STATUS_LABEL[e.toStatus as AppStatus] ?? e.toStatus}</strong>
                          </span>
                        ) : (
                          <Badge tone={e.kind === 'reminder' ? 'warning' : 'neutral'} icon={e.kind === 'reminder' ? <BellIcon size={11} /> : undefined}>
                            {e.kind}
                          </Badge>
                        )}
                        <span className="text-[12px] text-subtle">{formatDateTime(e.createdAt)}</span>
                      </div>
                      {e.note && <div className="text-muted">{e.note}</div>}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {tab === 'rounds' && (
              <div className="space-y-3">
                {a.rounds.length === 0 && <p className="text-[13.5px] text-muted">No interview rounds yet.</p>}
                {a.rounds.length > 0 && (
                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                {a.rounds.map((r) => (
                  <li key={r.id} className="space-y-2 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">{r.name}</div>
                      <div className="flex items-center gap-2">
                        <Select aria-label={`Status of ${r.name}`} value={r.status} onChange={(e) => updRound.mutate({ rid: r.id, body: { status: e.target.value as Round['status'] } })}>
                          <option value="scheduled">Scheduled</option>
                          <option value="done">Done</option>
                          <option value="cancelled">Cancelled</option>
                        </Select>
                        <Button size="icon-sm" variant="ghost" aria-label={`Delete ${r.name}`} icon={<TrashIcon size={14} />} onClick={() => delRound.mutate(r.id)} />
                      </div>
                    </div>
                    {r.at && <div className="text-[12.5px] text-muted">{formatDateTime(r.at)}</div>}
                    <Textarea
                      aria-label={`Feedback for ${r.name}`}
                      rows={2}
                      defaultValue={r.feedback ?? ''}
                      placeholder="Feedback or reflections"
                      onBlur={(e) => e.target.value !== (r.feedback ?? '') && updRound.mutate({ rid: r.id, body: { feedback: e.target.value } })}
                    />
                  </li>
                ))}
                </ul>
                )}
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Round name" className="min-w-48 flex-1">
                    <Input value={round.name} onChange={(e) => setRound({ ...round, name: e.target.value })} placeholder="Technical interview" />
                  </Field>
                  <Field label="When" optional>
                    <Input type="datetime-local" value={round.at} onChange={(e) => setRound({ ...round, at: e.target.value })} />
                  </Field>
                  <Button icon={<PlusIcon size={14} />} disabled={!round.name.trim()} disabledReason="Name the round" loading={addRound.isPending} onClick={() => addRound.mutate()}>
                    Add round
                  </Button>
                </div>
                <div>
                  <CardAction to="/app/career/interview">Prepare in Interview prep</CardAction>
                </div>
              </div>
            )}

            {tab === 'contacts' && (
              <div className="space-y-3">
                {a.contacts.length === 0 ? (
                  <EmptyState icon={<PlusIcon size={22} />} title="No contacts" description="Add recruiters, interviewers or referrers so follow-ups are easy." />
                ) : (
                  <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                    {a.contacts.map((c, i) => (
                      <li key={i} className="flex items-start justify-between gap-3 px-4 py-3 text-[13.5px]">
                        <div>
                          <div className="font-medium">{c.name}</div>
                          <div className="text-muted">{[c.role, c.email].filter(Boolean).join(' · ')}</div>
                          {c.note && <div className="text-[12.5px] text-muted">{c.note}</div>}
                        </div>
                        <Button size="icon-sm" variant="ghost" aria-label={`Remove ${c.name}`} icon={<TrashIcon size={14} />} onClick={() => patch.mutate({ contacts: a.contacts.filter((_, j) => j !== i) })} />
                      </li>
                    ))}
                  </ul>
                )}
                <div className="grid gap-2 sm:grid-cols-4 sm:items-end">
                  <Field label="Name">
                    <Input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
                  </Field>
                  <Field label="Role" optional>
                    <Input value={contact.role ?? ''} onChange={(e) => setContact({ ...contact, role: e.target.value })} />
                  </Field>
                  <Field label="Email" optional>
                    <Input value={contact.email ?? ''} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
                  </Field>
                  <Button
                    icon={<PlusIcon size={14} />}
                    disabled={!contact.name.trim()}
                    disabledReason="Add a name"
                    onClick={() => {
                      patch.mutate({ contacts: [...a.contacts, { name: contact.name, role: contact.role || undefined, email: contact.email || undefined }] });
                      setContact({ name: '' });
                    }}
                  >
                    Add contact
                  </Button>
                </div>
              </div>
            )}

            {tab === 'offer' && (
              <div className="space-y-3">
                <p className="text-[13px] text-muted">Record the offer exactly as stated. Compare offers under Offers.</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Base salary" optional>
                    <Input type="number" min={0} value={offer.baseSalary ?? ''} onChange={(e) => setOffer({ baseSalary: e.target.value === '' ? undefined : Number(e.target.value) })} />
                  </Field>
                  <Field label="Currency" optional>
                    <Input value={offer.currency ?? ''} onChange={(e) => setOffer({ currency: e.target.value })} placeholder="INR" />
                  </Field>
                  <Field label="Bonus" optional>
                    <Input type="number" min={0} value={offer.bonus ?? ''} onChange={(e) => setOffer({ bonus: e.target.value === '' ? undefined : Number(e.target.value) })} />
                  </Field>
                  <Field label="Remote policy" optional>
                    <Select value={offer.remote ?? ''} onChange={(e) => setOffer({ remote: e.target.value || undefined })}>
                      <option value="">Not stated</option>
                      <option value="Remote">Remote</option>
                      <option value="Hybrid">Hybrid</option>
                      <option value="Onsite">Onsite</option>
                    </Select>
                  </Field>
                  <Field label="Location" optional>
                    <Input value={offer.location ?? ''} onChange={(e) => setOffer({ location: e.target.value })} />
                  </Field>
                  <Field label="Equity" optional>
                    <Input value={offer.equity ?? ''} onChange={(e) => setOffer({ equity: e.target.value })} />
                  </Field>
                  <Field label="Start date" optional>
                    <Input type="date" value={offer.startDate ?? ''} onChange={(e) => setOffer({ startDate: e.target.value || undefined })} />
                  </Field>
                  <Field label="Decision deadline" optional>
                    <Input type="date" value={offer.deadline ?? ''} onChange={(e) => setOffer({ deadline: e.target.value || undefined })} />
                  </Field>
                </div>
                <Field label="Benefits" optional>
                  <Textarea rows={2} value={offer.benefits ?? ''} onChange={(e) => setOffer({ benefits: e.target.value })} />
                </Field>
                <Field label="Notes" optional>
                  <Textarea rows={2} value={offer.notes ?? ''} onChange={(e) => setOffer({ notes: e.target.value })} />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => patch.mutate({ offer: null })} disabled={!a.offer} disabledReason="No offer recorded">
                    Clear offer
                  </Button>
                  <Button variant="primary" loading={patch.isPending} onClick={() => patch.mutate({ offer: Object.fromEntries(Object.entries(offer).filter(([, v]) => v !== '' && v !== undefined)) as Offer })}>
                    Save offer
                  </Button>
                </div>
              </div>
            )}
            <p className="text-[12px] text-subtle">Last updated {timeAgo(a.updatedAt)}</p>
          </div>
        )
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Remove from your tracker?"
        description={a?.jobApplicationId && !['withdrawn', 'rejected', 'accepted'].includes(a.status) ? 'This was sent through the platform. Withdraw it first so the employer knows.' : 'The record and its timeline are deleted. This cannot be undone.'}
        confirmLabel="Remove"
        danger
        loading={del.isPending}
        onConfirm={() => del.mutate()}
      />
    </Dialog>
  );
}
