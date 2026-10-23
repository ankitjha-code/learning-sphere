import { useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DownloadSimpleIcon, FileArrowUpIcon, FolderIcon, TrashIcon, UploadSimpleIcon } from '@phosphor-icons/react';
import { api, errorMessage, qs } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Badge, Banner, Button, Card, ConfirmDialog, EmptyState, ErrorState, Pagination, Progress, Skeleton, SkeletonRows } from '@/components/ui';
import { formatBytes, type FilesResponse, type StoredFile } from './types';

const PAGE_SIZE = 50;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const PURPOSE: Record<string, { label: string; tone: 'neutral' | 'accent' | 'info' | 'success' | 'warning' }> = {
  attachment: { label: 'Attachment', tone: 'neutral' },
  knowledge: { label: 'Knowledge base', tone: 'accent' },
  export: { label: 'Export', tone: 'info' },
  submission: { label: 'Submission', tone: 'success' },
  resume: { label: 'Resume', tone: 'warning' },
  avatar: { label: 'Avatar', tone: 'neutral' },
  project: { label: 'Project', tone: 'accent' },
  import: { label: 'Import', tone: 'info' },
  resource: { label: 'Resource', tone: 'neutral' },
};

const toMb = (n: number) => (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0);

export function FilesTab() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<StoredFile | null>(null);

  const files = useQuery({
    queryKey: ['files', 'mine', page],
    queryFn: () => api.get<FilesResponse>(`/files${qs({ page, pageSize: PAGE_SIZE })}`),
    placeholderData: keepPreviousData,
  });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      form.append('purpose', 'attachment');
      return api.upload<{ file: StoredFile }>('/files', form);
    },
    onSuccess: (res) => {
      setUploadError(null);
      toast.success(`Uploaded ${res.file.filename}`);
      setPage(1);
      qc.invalidateQueries({ queryKey: ['files'] });
    },
    onError: (e) => {
      const msg = errorMessage(e);
      setUploadError(msg);
      toast.error(msg);
    },
  });

  const remove = useMutation({
    mutationFn: (f: StoredFile) => api.del(`/files/${f.id}`),
    onSuccess: (_r, f) => {
      setDeleting(null);
      toast.success(`Deleted ${f.filename}`);
      qc.invalidateQueries({ queryKey: ['files'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const onPick = (list: FileList | null) => {
    const f = list?.[0];
    if (inputRef.current) inputRef.current.value = '';
    if (!f) return;
    if (f.size > MAX_UPLOAD_BYTES) {
      const msg = `${f.name} is ${formatBytes(f.size)}. Files can be up to 10 MB.`;
      setUploadError(msg);
      toast.error(msg);
      return;
    }
    upload.mutate(f);
  };

  const usage = files.data?.usage;
  const ratio = usage && usage.quota ? usage.used / usage.quota : 0;
  const openPicker = () => inputRef.current?.click();

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="text-[14px] font-medium">Storage</div>
            {usage ? (
              <>
                <Progress value={usage.used} max={usage.quota} tone={ratio >= 0.9 ? 'warning' : 'accent'} label="Storage used" />
                <p className="text-[12.5px] text-muted">
                  {toMb(usage.used)} MB of {toMb(usage.quota)} MB used. Exports you generate do not count toward your quota.
                </p>
              </>
            ) : files.isError ? (
              <p className="text-[12.5px] text-muted">Storage usage is unavailable right now.</p>
            ) : (
              <Skeleton className="h-8 w-full max-w-md" />
            )}
          </div>
          <div className="shrink-0">
            <input ref={inputRef} type="file" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onPick(e.target.files)} />
            <Button variant="primary" icon={<UploadSimpleIcon size={16} />} loading={upload.isPending} onClick={openPicker}>
              {upload.isPending ? 'Uploading' : 'Upload a file'}
            </Button>
          </div>
        </div>
        <p className="mt-3 text-[12.5px] text-subtle">
          Up to 10 MB per file: PDF, images (PNG, JPEG, WebP, GIF), text, Markdown, CSV, JSON, ZIP and DOCX. Files are checked by content, so a file whose contents do not match its extension is rejected.
        </p>
        {uploadError && (
          <Banner tone="danger" title="Upload failed" className="mt-3" action={<Button size="sm" onClick={() => setUploadError(null)}>Dismiss</Button>}>
            {uploadError}
          </Banner>
        )}
      </Card>

      <p className="text-[12.5px] text-muted">This list includes every file you own, such as knowledge base documents and generated exports, labeled by purpose.</p>

      {files.isLoading ? (
        <SkeletonRows rows={5} />
      ) : files.isError ? (
        <ErrorState error={files.error} onRetry={() => files.refetch()} />
      ) : !files.data?.items.length ? (
        <EmptyState
          icon={<FolderIcon size={22} />}
          title="No files yet"
          description="Upload notes, PDFs or images you want to keep alongside your learning. Only you can download them."
          action={
            <Button variant="primary" icon={<FileArrowUpIcon size={16} />} onClick={openPicker} loading={upload.isPending}>
              Upload a file
            </Button>
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1" aria-busy={files.isFetching || undefined}>
            {files.data.items.map((f) => {
              const p = PURPOSE[f.purpose] ?? { label: f.purpose, tone: 'neutral' as const };
              return (
                <li key={f.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:flex-nowrap">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium" title={f.filename}>
                      {f.filename}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-subtle">
                      <Badge tone={p.tone}>{p.label}</Badge>
                      <span>{formatBytes(f.size)}</span>
                      <span aria-hidden>·</span>
                      <span>Added {formatDate(f.createdAt)}</span>
                      {f.expiresAt && (
                        <>
                          <span aria-hidden>·</span>
                          <span>Expires {formatDate(f.expiresAt)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <a
                      href={`/api/files/${f.id}`}
                      download={f.filename}
                      className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-muted hover:bg-surface-2 hover:text-fg"
                      aria-label={`Download ${f.filename}`}
                    >
                      <DownloadSimpleIcon size={14} aria-hidden />
                      Download
                    </a>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${f.filename}`} title="Delete" onClick={() => setDeleting(f)}>
                      <TrashIcon size={16} />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={files.data.total} onPage={setPage} />
        </>
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete this file?"
        description={
          deleting
            ? deleting.purpose === 'attachment' || deleting.purpose === 'export'
              ? `"${deleting.filename}" will be deleted and can no longer be downloaded.`
              : `"${deleting.filename}" is used as a ${PURPOSE[deleting.purpose]?.label.toLowerCase() ?? deleting.purpose} file. Deleting it removes it everywhere it is used and cannot be undone.`
            : ''
        }
        confirmLabel="Delete file"
        danger
        loading={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
        }}
      />
    </div>
  );
}
