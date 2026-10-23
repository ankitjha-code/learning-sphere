import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DownloadSimpleIcon, FileArrowUpIcon, UploadSimpleIcon, XIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { plural } from '@/lib/format';
import { Banner, Button, Card, CardBody, CardHeader, buttonClass } from '@/components/ui';
import { formatBytes, type ImportResult } from './types';

const MAX_FILES = 50;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

export function TransferTab() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ExportCard />
      <ImportCard />
    </div>
  );
}

function ExportCard() {
  return (
    <Card>
      <CardHeader title="Export" description="Download a copy of your workspace at any time." />
      <CardBody className="space-y-4">
        <div className="space-y-1.5">
          <a href="/api/workspace/export?format=json" download className={buttonClass('primary', 'md')}>
            <DownloadSimpleIcon size={16} aria-hidden />
            Download JSON export
          </a>
          <p className="text-[12.5px] text-muted">
            Everything in one file: notes, tasks, saved links and bookmarks. Use it as a backup or to import into another LearnSphere account.
          </p>
        </div>
        <div className="space-y-1.5">
          <a href="/api/workspace/export?format=markdown" download className={buttonClass('secondary', 'md')}>
            <DownloadSimpleIcon size={16} aria-hidden />
            Download notes as Markdown (ZIP)
          </a>
          <p className="text-[12.5px] text-muted">
            One Markdown file per note with front matter for title, tags and pinned state. Opens in any editor, such as Obsidian or VS Code.
          </p>
        </div>
        <p className="text-[12.5px] text-subtle">Exports include knowledge base documents, since they are stored as notes.</p>
      </CardBody>
    </Card>
  );
}

function ImportCard() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<File[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);

  const run = useMutation({
    mutationFn: (list: File[]) => {
      const form = new FormData();
      for (const f of list) form.append('files', f);
      return api.upload<ImportResult>('/workspace/import', form);
    },
    onSuccess: (res) => {
      setResult(res);
      setChosen([]);
      const imported = res.notes + res.tasks + res.links + res.bookmarks;
      if (imported > 0) toast.success(`Imported ${plural(imported, 'item')}`);
      else toast.warning('Nothing was imported. See the skipped files below.');
      qc.invalidateQueries({ queryKey: ['workspace'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const tooMany = chosen.length > MAX_FILES;
  const oversized = chosen.filter((f) => f.size > MAX_FILE_BYTES).length;
  const blocked = !chosen.length ? 'Choose files to import first' : tooMany ? `Choose ${MAX_FILES} files or fewer` : undefined;

  return (
    <Card>
      <CardHeader title="Import" description="Bring in Markdown notes or a LearnSphere workspace export." />
      <CardBody className="space-y-4">
        <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-muted">
          <li>Markdown and text files (.md, .markdown, .txt) become notes, tagged "imported". Front matter for title, tags and pinned is read when present.</li>
          <li>JSON files must be a LearnSphere workspace export (the JSON download on this page).</li>
          <li>Up to {MAX_FILES} files at a time, 2 MB each. Imports add to your workspace and never overwrite existing items.</li>
        </ul>

        <div>
          <input
            ref={inputRef}
            id="import-files"
            type="file"
            multiple
            accept=".md,.markdown,.txt,.json"
            className="sr-only"
            onChange={(e) => {
              setChosen(Array.from(e.target.files ?? []));
              setResult(null);
              e.target.value = '';
            }}
          />
          <Button icon={<FileArrowUpIcon size={16} />} onClick={() => inputRef.current?.click()} disabled={run.isPending} disabledReason="An import is in progress">
            {chosen.length ? 'Choose different files' : 'Choose files'}
          </Button>
        </div>

        {chosen.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-medium">{plural(chosen.length, 'file')} selected</span>
              <Button variant="ghost" size="sm" icon={<XIcon size={14} />} onClick={() => setChosen([])}>
                Clear
              </Button>
            </div>
            <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border text-[12.5px]">
              {chosen.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="truncate">{f.name}</span>
                  <span className={f.size > MAX_FILE_BYTES ? 'shrink-0 text-danger' : 'shrink-0 text-subtle'}>
                    {formatBytes(f.size)}
                    {f.size > MAX_FILE_BYTES && ', will be skipped'}
                  </span>
                </li>
              ))}
            </ul>
            {tooMany && (
              <Banner tone="warning">
                You selected {chosen.length} files. Import up to {MAX_FILES} at a time.
              </Banner>
            )}
            {oversized > 0 && !tooMany && (
              <p className="text-[12.5px] text-warning">{plural(oversized, 'file')} larger than 2 MB will be skipped.</p>
            )}
          </div>
        )}

        <Button variant="primary" icon={<UploadSimpleIcon size={16} />} loading={run.isPending} disabled={!!blocked} disabledReason={blocked} onClick={() => run.mutate(chosen)}>
          Import files
        </Button>

        {result && <ImportSummary result={result} />}
      </CardBody>
    </Card>
  );
}

function ImportSummary({ result }: { result: ImportResult }) {
  const parts = [
    plural(result.notes, 'note'),
    plural(result.tasks, 'task'),
    plural(result.links, 'link'),
    plural(result.bookmarks, 'bookmark'),
  ];
  const imported = result.notes + result.tasks + result.links + result.bookmarks;
  return (
    <div className="space-y-3" aria-live="polite">
      <Banner tone={imported > 0 ? 'success' : 'warning'} title={imported > 0 ? 'Import finished' : 'Nothing was imported'}>
        Added {parts.join(', ')}.
        {result.bookmarks > 0 && ' Bookmarks you already had are kept as they were.'}
      </Banner>
      {result.skipped.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[13px] font-medium">Skipped {plural(result.skipped.length, 'file')}</h4>
          <ul className="divide-y divide-border rounded-md border border-border text-[12.5px]">
            {result.skipped.map((s, i) => (
              <li key={`${s.file}-${i}`} className="px-3 py-1.5">
                <span className="font-medium">{s.file}</span>
                <span className="text-muted">: {s.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
