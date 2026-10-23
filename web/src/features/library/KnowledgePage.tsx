import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BrainIcon, UploadSimpleIcon, FileTextIcon, FilePdfIcon, TrashIcon, DownloadSimpleIcon, SparkleIcon, LockKeyIcon, CaretLeftIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { PageHeader, Banner, Button, ButtonLink, Card, CardHeader, CardBody, Field, Input, EmptyState, ErrorState, Skeleton, ConfirmDialog, Section, buttonClass } from '@/components/ui';
import { formatBytes } from './shared';

type KnowledgeDoc = {
  id: string;
  title: string;
  fileId: string | null;
  filename: string | null;
  chars: number;
  preview: string;
  createdAt: string;
  size: number | null;
  mime: string | null;
};
type UploadResult = { document: { id: string; title: string; chars: number; truncated: boolean; pages: number | null } };

const MAX_BYTES = 10 * 1024 * 1024;

export default function KnowledgePage() {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<KnowledgeDoc | null>(null);

  const q = useQuery({ queryKey: ['library', 'knowledge'], queryFn: () => api.get<{ items: KnowledgeDoc[] }>('/library/knowledge') });

  const upload = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('file', file!);
      if (title.trim()) fd.append('title', title.trim());
      return api.upload<UploadResult>('/library/knowledge', fd);
    },
    onSuccess: (r) => {
      const d = r.document;
      toast.success(
        `Added "${d.title}" (${d.chars.toLocaleString()} characters${d.pages ? `, ${d.pages} pages` : ''})${d.truncated ? '. Long documents are trimmed to the first part.' : ''}`,
      );
      setFile(null);
      setTitle('');
      if (fileInput.current) fileInput.current.value = '';
      qc.invalidateQueries({ queryKey: ['library', 'knowledge'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const del = useMutation({
    mutationFn: (d: KnowledgeDoc) => api.del(`/library/knowledge/${d.id}`),
    onSuccess: () => {
      toast.success('Document deleted');
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['library', 'knowledge'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const fields = upload.error instanceof ApiError ? upload.error.fields : {};
  const fileError = localError ?? fields.file ?? (upload.error ? errorMessage(upload.error) : undefined);

  const onPick = (f: File | null) => {
    upload.reset();
    setLocalError(null);
    if (f && f.size > MAX_BYTES) {
      setLocalError(`This file is ${formatBytes(f.size)}. The limit is 10 MB.`);
      setFile(null);
      return;
    }
    if (f && !/\.(pdf|txt|md)$/i.test(f.name)) {
      setLocalError('Only PDF, TXT and Markdown files are supported.');
      setFile(null);
      return;
    }
    setFile(f);
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        breadcrumb={
          <Link to="/app/library" className="inline-flex items-center gap-1 hover:text-fg">
            <CaretLeftIcon size={14} aria-hidden /> Library
          </Link>
        }
        title="My knowledge base"
        actions={
          <ButtonLink to="/app/ai?assistant=study_assistant" icon={<SparkleIcon size={16} />}>
            Ask the study assistant
          </ButtonLink>
        }
      />

      <Banner tone="info" title="Private study material" className="mb-6">
        Upload notes, PDFs or markdown. The AI study assistant can cite these documents privately when you ask questions; nobody else can see them.
      </Banner>

      <Card className="mb-8">
        <CardHeader title="Upload a document" description="PDF, TXT or Markdown, up to 10 MB. Scanned PDFs without a text layer cannot be read." />
        <CardBody>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (file) upload.mutate();
            }}
          >
            <Field label="File" error={fileError} helper={file ? `${file.name} · ${formatBytes(file.size)}` : 'Choose a .pdf, .txt or .md file'}>
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,.txt,.md"
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
                className="block w-full text-[13.5px] text-muted file:mr-3 file:h-8.5 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:text-[13.5px] file:font-medium file:text-fg hover:file:bg-surface-2"
              />
            </Field>
            <Field label="Title" optional helper="Defaults to the file name" error={fields.title}>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
            </Field>
            <div className="sm:col-span-2">
              <Button
                type="submit"
                variant="primary"
                icon={<UploadSimpleIcon size={16} />}
                loading={upload.isPending}
                disabled={!file}
                disabledReason="Choose a file first"
              >
                Upload
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Section title="Your documents">
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <Skeleton className="h-56 rounded-lg" />
      ) : !q.data?.items.length ? (
        <EmptyState
          icon={<BrainIcon size={22} />}
          title="No documents yet"
          description="Upload lecture notes or reading material so the study assistant can answer questions from them."
          action={
            <Button variant="primary" icon={<UploadSimpleIcon size={16} />} onClick={() => fileInput.current?.click()}>
              Choose a file
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
          {q.data.items.map((d) => {
            const isPdf = d.mime === 'application/pdf' || /\.pdf$/i.test(d.filename ?? '');
            return (
              <li key={d.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
                    {isPdf ? <FilePdfIcon size={18} aria-hidden /> : <FileTextIcon size={18} aria-hidden />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-semibold tracking-[-0.005em]">{d.title}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-[12.5px] text-muted">
                      {d.filename && <span>{d.filename}</span>}
                      <span>· {formatBytes(d.size)}</span>
                      <span>· {d.chars.toLocaleString()} characters</span>
                      <span>· Added {formatDate(d.createdAt)}</span>
                      <span className="inline-flex items-center gap-1">
                        · <LockKeyIcon size={12} aria-hidden /> Private
                      </span>
                    </div>
                    {d.preview && <p className="mt-2 line-clamp-2 whitespace-pre-line text-[13px] text-subtle">{d.preview}</p>}
                  </div>
                  <div className="-mr-2 flex shrink-0 gap-1">
                    {d.fileId && (
                      <a href={`/api/files/${d.fileId}`} className={buttonClass('ghost', 'icon')} aria-label={`Download ${d.title}`} title="Download">
                        <DownloadSimpleIcon size={18} />
                      </a>
                    )}
                    <Button variant="ghost" size="icon" aria-label={`Delete ${d.title}`} title="Delete" onClick={() => setDeleting(d)}>
                      <TrashIcon size={18} />
                    </Button>
                  </div>
              </li>
            );
          })}
        </ul>
      )}
      </Section>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete document?"
        description={deleting ? `"${deleting.title}" and its uploaded file will be deleted. The study assistant will no longer cite it.` : ''}
        confirmLabel="Delete"
        danger
        loading={del.isPending}
        onConfirm={() => {
          if (deleting) del.mutate(deleting);
        }}
      />
    </div>
  );
}
