import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardTextIcon, CheckIcon, ArrowBendUpLeftIcon, ArrowSquareOutIcon, CaretDownIcon, CaretUpIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { PageHeader, Card, Badge, Button, ButtonLink, Markdown, Field, Textarea, EmptyState, ErrorState, Skeleton, Dialog } from '@/components/ui';
import { Breadcrumb, KIND_LABEL, cap, type ResourceSummary } from './shared';

type QueueItem = ResourceSummary & {
  body: string | null;
  license: string | null;
  topics: string[];
  skills: { slug: string; name: string }[];
  author: { name: string | null; email: string | null };
};

export default function ReviewQueuePage() {
  const q = useQuery({
    queryKey: ['create', 'review-queue'],
    queryFn: () => api.get<{ items: QueueItem[] }>('/create/review-queue'),
    retry: (n, e) => !(e instanceof ApiError && e.status === 403) && n < 2,
  });

  return (
    <div>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Creator studio', to: '/app/create' }, { label: 'Review queue' }]} />}
        title="Review queue"
        description="Public library submissions waiting for a platform admin. Check accuracy, attribution and licensing before approving."
      />
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : !q.data?.items.length ? (
        <EmptyState
          icon={<ClipboardTextIcon size={22} />}
          title="Nothing to review"
          description="All public submissions have been handled. New ones will appear here and you will get a notification."
          action={
            <ButtonLink variant="primary" to="/app/create">
              Back to creator studio
            </ButtonLink>
          }
        />
      ) : (
        <ul className="space-y-4">
          {q.data.items.map((item) => (
            <li key={item.id}>
              <QueueCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QueueCard({ item }: { item: QueueItem }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [approveNote, setApproveNote] = useState('');

  const decide = useMutation({
    mutationFn: (v: { decision: 'approve' | 'reject'; note?: string }) => api.post<{ ok: true; status: string }>(`/create/review/${item.id}`, v),
    onSuccess: (_r, v) => {
      toast.success(v.decision === 'approve' ? `Approved and published: ${item.title}` : 'Changes requested. The author has been notified.');
      setRejecting(false);
      qc.invalidateQueries({ queryKey: ['create'] });
      qc.invalidateQueries({ queryKey: ['library'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const fields = decide.error instanceof ApiError ? decide.error.fields : {};
  const long = (item.body?.length ?? 0) > 1200;

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold leading-snug">{item.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
            <Badge>{KIND_LABEL[item.kind] ?? item.kind}</Badge>
            <Badge>{cap(item.difficulty)}</Badge>
            <span>
              by {item.author.name ?? 'Unknown author'}
              {item.author.email && <span className="text-subtle"> ({item.author.email})</span>}
            </span>
            <span>· v{item.version}</span>
            <span>· Submitted {timeAgo(item.updatedAt)}</span>
          </div>
        </div>
      </div>

      {item.summary && <p className="mt-3 text-[14px] text-muted">{item.summary}</p>}

      <div className="mt-3 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
        <div>
          <span className="text-muted">Source: </span>
          {item.sourceName ?? <span className="text-subtle">Not given</span>}
        </div>
        <div>
          <span className="text-muted">License: </span>
          {item.license ?? <span className="text-subtle">License not specified</span>}
        </div>
        {item.topics.length > 0 && (
          <div>
            <span className="text-muted">Topics: </span>
            {item.topics.join(', ')}
          </div>
        )}
        {item.skills.length > 0 && (
          <div>
            <span className="text-muted">Skills: </span>
            {item.skills.map((s) => s.name).join(', ')}
          </div>
        )}
      </div>

      {item.url && (
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 break-all text-[13.5px] font-medium text-accent-text hover:underline">
          {item.url} <ArrowSquareOutIcon size={13} aria-hidden className="shrink-0" />
        </a>
      )}

      {item.body && (
        <div className="mt-3 rounded-md border border-border bg-surface-2 p-4">
          <div className={long && !expanded ? 'relative max-h-72 overflow-hidden' : undefined}>
            <Markdown source={item.body} />
          </div>
          {long && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              icon={expanded ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? 'Show less' : 'Show full content'}
            </Button>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end">
        <Field label="Note for the author" optional className="flex-1">
          <Textarea value={approveNote} onChange={(e) => setApproveNote(e.target.value)} rows={1} maxLength={2000} placeholder="Optional when approving" />
        </Field>
        <div className="flex gap-2">
          <Button
            icon={<ArrowBendUpLeftIcon size={16} />}
            onClick={() => {
              setNote(approveNote);
              setRejecting(true);
            }}
          >
            Request changes
          </Button>
          <Button
            variant="primary"
            icon={<CheckIcon size={16} />}
            loading={decide.isPending && decide.variables?.decision === 'approve'}
            onClick={() => decide.mutate({ decision: 'approve', note: approveNote.trim() || undefined })}
          >
            Approve and publish
          </Button>
        </div>
      </div>

      <Dialog
        open={rejecting}
        onOpenChange={(v) => {
          setRejecting(v);
          if (!v) decide.reset();
        }}
        title="Request changes"
        description="The author gets your note and can edit and resubmit."
        footer={
          <>
            <Button onClick={() => setRejecting(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={decide.isPending && decide.variables?.decision === 'reject'}
              disabled={note.trim().length < 5}
              disabledReason="Explain what needs to change (at least 5 characters)"
              onClick={() => decide.mutate({ decision: 'reject', note: note.trim() })}
            >
              Send request
            </Button>
          </>
        }
      >
        <Field label="What needs to change?" required helper="At least 5 characters. Be specific so the author can fix it." error={fields.note}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} maxLength={2000} autoFocus />
        </Field>
      </Dialog>
    </Card>
  );
}
