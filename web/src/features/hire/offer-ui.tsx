import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage, ApiError } from '@/lib/api';
import { Button, ConfirmDialog, Dialog, Field, Input, Textarea } from '@/components/ui';

export type OfferRow = { id: string; title: string; compensationText: string; startDate: string | null; expiresAt: string | null; status: string };

const dateOnly = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');
const toIso = (d: string) => (d ? new Date(`${d}T23:59:00`).toISOString() : null);

export function OfferFormDialog({ open, onOpenChange, applicationId, defaultTitle, offer }: { open: boolean; onOpenChange: (v: boolean) => void; applicationId?: string; defaultTitle?: string; offer?: OfferRow }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [comp, setComp] = useState('');
  const [start, setStart] = useState('');
  const [expires, setExpires] = useState('');
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (open) {
      setTitle(offer?.title ?? defaultTitle ?? '');
      setComp(offer?.compensationText ?? '');
      setStart(dateOnly(offer?.startDate));
      setExpires(dateOnly(offer?.expiresAt) || dateOnly(new Date(Date.now() + 7 * 86400_000).toISOString()));
      setNotes('');
    }
  }, [open]); // reset when opened, not on background refetch
  const extended = offer?.status === 'extended';
  const m = useMutation({
    mutationFn: () =>
      offer
        ? api.patch(`/hire/offers/${offer.id}`, extended ? { expiresAt: toIso(expires), ...(notes ? { notes } : {}) } : { title, compensationText: comp, startDate: toIso(start), expiresAt: toIso(expires), ...(notes ? { notes } : {}) })
        : api.post('/hire/offers', { applicationId, title, compensationText: comp, startDate: toIso(start), expiresAt: toIso(expires), notes: notes || null }),
    onSuccess: () => {
      toast.success(offer ? 'Offer updated.' : 'Offer drafted. Extend it when ready; the candidate sees it only after that.');
      qc.invalidateQueries({ queryKey: ['hire'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const fields = m.error instanceof ApiError ? m.error.fields : {};
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={offer ? 'Edit offer' : 'Draft an offer'}
      description={extended ? 'This offer was extended. Only the expiry and internal notes can change; rescind and redraft to change terms.' : 'Drafts are private to your team until you extend them.'}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={!extended && (title.trim().length < 3 || comp.trim().length < 2)} disabledReason="Add a title and compensation" onClick={() => m.mutate()}>
            {offer ? 'Save offer' : 'Save draft'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Role title" error={fields.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={extended} />
        </Field>
        <Field label="Compensation" error={fields.compensationText} helper="Shown to the candidate as written, e.g. base salary, bonus and benefits.">
          <Textarea rows={3} value={comp} onChange={(e) => setComp(e.target.value)} disabled={extended} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date" optional>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} disabled={extended} />
          </Field>
          <Field label="Respond by" optional error={fields.expiresAt}>
            <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </Field>
        </div>
        <Field label="Internal notes" optional helper="Visible to your team only.">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

export function OfferActions({ offer, candidateName }: { offer: OfferRow; candidateName: string }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState(false);
  const [extend, setExtend] = useState(false);
  const [rescind, setRescind] = useState(false);
  const [reason, setReason] = useState('');
  const act = useMutation({
    mutationFn: (a: 'extend' | 'rescind') => api.post(`/hire/offers/${offer.id}/${a}`, a === 'rescind' ? { reason } : {}),
    onSuccess: (_r, a) => {
      toast.success(a === 'extend' ? `Offer sent to ${candidateName}.` : 'Offer rescinded.');
      qc.invalidateQueries({ queryKey: ['hire'] });
      setExtend(false);
      setRescind(false);
      setReason('');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (offer.status !== 'draft' && offer.status !== 'extended') return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => setEdit(true)}>
        Edit
      </Button>
      {offer.status === 'draft' && (
        <Button size="sm" variant="primary" onClick={() => setExtend(true)}>
          Extend offer
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => setRescind(true)}>
        Rescind
      </Button>
      <OfferFormDialog open={edit} onOpenChange={setEdit} offer={offer} />
      <ConfirmDialog
        open={extend}
        onOpenChange={setExtend}
        title="Extend this offer?"
        description={`${candidateName} will be notified and can accept or decline from their application page. Terms cannot be edited after this.`}
        confirmLabel="Extend offer"
        loading={act.isPending}
        onConfirm={() => act.mutate('extend')}
      />
      <ConfirmDialog
        open={rescind}
        onOpenChange={setRescind}
        title="Rescind this offer?"
        description={offer.status === 'extended' ? 'The candidate will be told the offer was withdrawn. This is recorded in the audit log.' : 'The draft will be closed.'}
        confirmLabel="Rescind offer"
        danger
        loading={act.isPending}
        onConfirm={() => (reason.trim().length >= 5 ? act.mutate('rescind') : toast.error('Write a short reason (at least 5 characters).'))}
      >
        <Field label="Reason" helper="Kept with the offer record.">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
