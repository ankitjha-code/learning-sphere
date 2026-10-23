import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FloppyDiskIcon, TrashIcon, CopyIcon, CheckIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { PageHeader, Card, CardHeader, CardBody, ErrorState, SkeletonRows, Button, Field, Input, Textarea, Badge, ConfirmDialog } from '@/components/ui';
import { AiDraftLabel, HighlightedDraft, countPlaceholders } from './components';
import { DOC_KIND_LABEL, type CareerDoc } from './api';

export default function DocumentEditorPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['career', 'document', id], queryFn: () => api.get<{ document: CareerDoc }>(`/career/documents/${id}`) });
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; the text can still be selected by hand */
    }
  };
  useEffect(() => {
    if (q.data && !dirty) {
      setTitle(q.data.document.title);
      setBody(q.data.document.body);
    }
  }, [q.data, dirty]);
  const save = useMutation({
    mutationFn: () => api.put<{ document: CareerDoc }>(`/career/documents/${id}`, { title, body }),
    onSuccess: (r) => {
      setDirty(false);
      qc.setQueryData(['career', 'document', id], { document: r.document });
      qc.invalidateQueries({ queryKey: ['career', 'documents'] });
      toast.success('Saved.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: () => api.del(`/career/documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['career', 'documents'] });
      toast.success('Document deleted.');
      nav('/app/career/documents');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isLoading) return <SkeletonRows rows={6} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return null;
  const d = q.data.document;
  const placeholders = countPlaceholders(body);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        breadcrumb={<Link to="/app/career/documents">Documents</Link>}
        title={title || 'Untitled'}
        badge={
          <>
            <Badge>{DOC_KIND_LABEL[d.kind]}</Badge>
            {dirty && <Badge tone="warning">Unsaved changes</Badge>}
          </>
        }
        description={`Edited ${timeAgo(d.updatedAt)}`}
        actions={
          <>
            <Button icon={copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />} onClick={copyText}>
              {copied ? 'Copied' : 'Copy text'}
            </Button>
            <Button variant="ghost" icon={<TrashIcon size={16} />} onClick={() => setConfirm(true)}>
              Delete
            </Button>
            <Button variant="primary" icon={<FloppyDiskIcon size={16} />} loading={save.isPending} disabled={!dirty} disabledReason="No changes to save" onClick={() => save.mutate()}>
              Save
            </Button>
          </>
        }
      />
      {d.aiAssisted && (
        <div className="mb-4">
          <AiDraftLabel text="AI draft: review every claim before sending." />
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardBody className="space-y-4 pt-5">
            <Field label="Title">
              <Input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} />
            </Field>
            <Field label="Text" helper={placeholders ? `${placeholders} placeholder(s) left. Replace each [Add: ...] with a true fact or remove the sentence.` : 'No placeholders left.'}>
              <Textarea rows={20} value={body} onChange={(e) => { setBody(e.target.value); setDirty(true); }} />
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Preview" description="Placeholders are highlighted." />
          <CardBody>
            <HighlightedDraft text={body} />
          </CardBody>
        </Card>
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Delete this document?" description="This cannot be undone." confirmLabel="Delete" danger loading={del.isPending} onConfirm={() => del.mutate()} />
    </div>
  );
}
