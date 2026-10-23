import { useRef, useState } from 'react';
import { ArrowSquareOutIcon, GithubLogoIcon, GlobeIcon, ImageIcon, PencilSimpleIcon, TrashIcon, PlusIcon, LightbulbIcon, CheckCircleIcon, CircleIcon, UploadSimpleIcon } from '@phosphor-icons/react';
import { api, ApiError } from '@/lib/api';
import { Card, CardHeader, CardBody, Button, Field, Input, Textarea, Progress, Badge, Banner, Dialog, EmptyState } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { ProjectDetail } from '../types';
import { useProjectMutation } from './shared';

function EditOverviewDialog({ d, open, onOpenChange }: { d: ProjectDetail; open: boolean; onOpenChange: (v: boolean) => void }) {
  const p = d.project;
  const [title, setTitle] = useState(p.title);
  const [problem, setProblem] = useState(p.problem);
  const [users, setUsers] = useState(p.intendedUsers);
  const [objectives, setObjectives] = useState(p.objectives.join('\n'));
  const [repoUrl, setRepoUrl] = useState(p.repoUrl ?? '');
  const [demoUrl, setDemoUrl] = useState(p.demoUrl ?? '');
  const m = useProjectMutation(
    p.id,
    () =>
      api.patch(`/projects/${p.id}`, {
        title,
        problem,
        intendedUsers: users,
        objectives: objectives.split('\n').map((s) => s.trim()).filter(Boolean),
        repoUrl: repoUrl.trim() || null,
        demoUrl: demoUrl.trim() || null,
      }),
    'Overview saved',
  );
  const f = m.error instanceof ApiError ? m.error.fields : {};
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit overview"
      size="lg"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate(undefined, { onSuccess: () => onOpenChange(false) })}>
            Save overview
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Project name" error={f.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
        </Field>
        <Field label="Problem statement" error={f.problem}>
          <Textarea value={problem} onChange={(e) => setProblem(e.target.value)} rows={4} />
        </Field>
        <Field label="Intended users" error={f.intendedUsers}>
          <Textarea value={users} onChange={(e) => setUsers(e.target.value)} rows={2} />
        </Field>
        <Field label="Learning objectives" helper="One per line." error={f.objectives}>
          <Textarea value={objectives} onChange={(e) => setObjectives(e.target.value)} rows={4} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Repository link" optional error={f.repoUrl}>
            <Input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/you/project" />
          </Field>
          <Field label="Demo link" optional error={f.demoUrl}>
            <Input value={demoUrl} onChange={(e) => setDemoUrl(e.target.value)} placeholder="https://..." />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

function hostOf(u: string) {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}

type Shot = { url: string; caption?: string; fileId?: string };

function Screenshots({ d }: { d: ProjectDetail }) {
  const links = d.settings.screenshotLinks as Shot[];
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const save = useProjectMutation(d.project.id, (next: Shot[]) => api.put(`/projects/${d.project.id}/screenshots`, { links: next.map((l) => (l.fileId ? { fileId: l.fileId, caption: l.caption } : { url: l.url, caption: l.caption })) }), 'Screenshots updated');
  const upload = useProjectMutation(
    d.project.id,
    async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      form.append('purpose', 'project');
      const r = await api.upload<{ file: { id: string } }>('/files', form);
      return api.post(`/projects/${d.project.id}/screenshots/files`, { fileId: r.file.id, ...(caption.trim() ? { caption: caption.trim() } : {}) });
    },
    'Screenshot uploaded',
  );
  const f = save.error instanceof ApiError ? save.error.fields : {};
  const full = links.length >= 12;
  return (
    <Card>
      <CardHeader title="Screenshots" description="Upload images (PNG, JPEG, WebP or GIF, up to 10 MB) or link to images hosted elsewhere. Uploaded images are visible to your team and on shared pages." />
      <CardBody>
        {links.length === 0 ? (
          <p className="text-[13px] text-muted">No screenshots yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {links.map((s, i) => (
              <li key={s.fileId ?? s.url + i} className="overflow-hidden rounded-md border border-border">
                {s.fileId ? (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="block bg-surface-2">
                    <img src={s.url} alt={s.caption || `Screenshot ${i + 1}`} className="aspect-video w-full object-cover" loading="lazy" />
                  </a>
                ) : (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="flex aspect-video items-center justify-center gap-2 bg-surface-2 px-3 text-[12.5px] text-muted hover:underline">
                    <ImageIcon size={20} aria-hidden /> <span className="truncate">{hostOf(s.url)}</span> <ArrowSquareOutIcon size={12} />
                  </a>
                )}
                <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-[12.5px]">
                  <span className="truncate text-muted">{s.caption || (s.fileId ? 'Uploaded image' : 'External link')}</span>
                  {d.access.canEdit && (
                    <Button size="icon-sm" variant="ghost" aria-label={`Remove ${s.caption || `screenshot ${i + 1}`}`} onClick={() => save.mutate(links.filter((_, j) => j !== i))}>
                      <TrashIcon size={14} />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {d.access.canEdit && !full && (
          <div className="mt-3 space-y-2">
            <Field label="Caption" optional helper="Used for the next upload or link.">
              <Input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200} />
            </Field>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                aria-label="Upload a screenshot"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) upload.mutate(file, { onSuccess: () => setCaption('') });
                }}
              />
              <Button icon={<UploadSimpleIcon size={14} />} loading={upload.isPending} onClick={() => fileInput.current?.click()}>
                Upload image
              </Button>
              <span className="text-center text-[12px] text-subtle sm:pb-2">or</span>
              <form
                className="flex flex-1 items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate([...links, { url: url.trim(), ...(caption.trim() ? { caption: caption.trim() } : {}) }], {
                    onSuccess: () => {
                      setUrl('');
                      setCaption('');
                    },
                  });
                }}
              >
                <Field label="Image link" className="flex-1" error={f['links.' + links.length + '.url'] ?? f['links.' + links.length]}>
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
                </Field>
                <Button type="submit" icon={<PlusIcon size={14} />} loading={save.isPending} disabled={!url.trim()} disabledReason="Paste an image link first">
                  Add link
                </Button>
              </form>
            </div>
          </div>
        )}
        {full && <p className="mt-2 text-[12px] text-subtle">Maximum of 12 screenshots reached.</p>}
      </CardBody>
    </Card>
  );
}

export function OverviewTab({ d }: { d: ProjectDetail }) {
  const [editing, setEditing] = useState(false);
  const p = d.project;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <Card>
          <CardHeader
            title="Problem and users"
            action={
              d.access.canEdit && (
                <Button size="sm" icon={<PencilSimpleIcon size={14} />} onClick={() => setEditing(true)}>
                  Edit
                </Button>
              )
            }
          />
          <CardBody className="space-y-3 text-[14px]">
            {p.problem ? <p className="leading-relaxed">{p.problem}</p> : <p className="text-muted">No problem statement yet. Describe the problem in your own words.</p>}
            <div>
              <div className="text-[13px] font-semibold">Intended users</div>
              <p className="mt-0.5 text-muted">{p.intendedUsers || 'Not written yet.'}</p>
            </div>
            <div>
              <div className="text-[13px] font-semibold">Learning objectives</div>
              {p.objectives.length ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
                  {p.objectives.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-0.5 text-muted">None yet.</p>
              )}
            </div>
            {d.skills.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {d.skills.map((s) => (
                  <Badge key={s.id} tone="accent">
                    {s.name}
                  </Badge>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
        {d.guide?.mode === 'guided' && d.guide.checkpoints && (
          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-1.5"><LightbulbIcon size={16} /> Guided checkpoints</span>} description={d.guide.next ? `Next checkpoint: ${d.guide.next}` : 'All checkpoints reached. Write your retrospective and request a review.'} />
            <CardBody>
              <ol className="space-y-2">
                {d.guide.checkpoints.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13.5px]">
                    {c.done ? <CheckCircleIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-success" aria-label="Done" /> : <CircleIcon size={18} className="mt-0.5 shrink-0 text-subtle" aria-label="Open" />}
                    <div>
                      <div className="font-medium">{c.title}</div>
                      {!c.done && c.tasks.length > 0 && <div className="text-[12.5px] text-muted">Check: {c.tasks.join('; ')}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        )}
        <Screenshots d={d} />
      </div>
      <aside className="space-y-5">
        <Card>
          <CardHeader title="Progress" description="How the percentage is calculated" />
          <CardBody>
            <div className="flex items-baseline gap-2">
              <span className="text-[28px] font-semibold tabular-nums">{d.progress.percent}%</span>
            </div>
            <Progress value={d.progress.percent} className="mt-1" tone={p.status === 'completed' ? 'success' : 'accent'} label="Project progress" />
            <ul className="mt-3 space-y-2 text-[13px]">
              {d.progress.parts.map((part) => (
                <li key={part.key}>
                  <div className="flex justify-between">
                    <span>{part.label}</span>
                    <span className="tabular-nums text-muted">
                      {part.done}/{part.total}
                    </span>
                  </div>
                  <div className="text-[11.5px] text-subtle">{part.total ? `${Math.round(part.weight * 100)}% of the total` : 'No items, not counted'}</div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] text-subtle">{d.progress.formula}</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Links and dates" />
          <CardBody className="space-y-2 text-[13.5px]">
            {p.repoUrl ? (
              <a href={p.repoUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-accent-text hover:underline">
                <GithubLogoIcon size={16} /> Repository <ArrowSquareOutIcon size={12} />
              </a>
            ) : (
              <p className="flex items-center gap-2 text-muted"><GithubLogoIcon size={16} /> No repository link</p>
            )}
            {p.demoUrl ? (
              <a href={p.demoUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-accent-text hover:underline">
                <GlobeIcon size={16} /> Live demo <ArrowSquareOutIcon size={12} />
              </a>
            ) : (
              <p className="flex items-center gap-2 text-muted"><GlobeIcon size={16} /> No demo link</p>
            )}
            <div className="pt-2 text-[12.5px] text-muted">
              Started {formatDate(p.startedAt)}
              {p.dueAt && <> · Due {formatDate(p.dueAt)}</>}
              {p.completedAt && <> · Completed {formatDate(p.completedAt)}</>}
            </div>
          </CardBody>
        </Card>
        {d.guide?.mode === 'partial' && <PartialHints d={d} />}
        {d.template?.isCapstone && (
          <Banner tone="info" title="Capstone">
            Approved capstones earn a platform completion record (not an accredited qualification).
            {d.reviewer && <> Assigned reviewer: {d.reviewer.name}.</>}
            {d.rubric && <> Rubric: {d.rubric.title}.</>}
          </Banner>
        )}
      </aside>
      {editing && <EditOverviewDialog d={d} open={editing} onOpenChange={setEditing} />}
    </div>
  );
}

function PartialHints({ d }: { d: ProjectDetail }) {
  const [show, setShow] = useState(false);
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-1.5"><LightbulbIcon size={16} /> Template hints</span>} description="Try planning tasks yourself first." />
      <CardBody>
        {!show ? (
          <Button size="sm" onClick={() => setShow(true)}>
            Show suggested tasks
          </Button>
        ) : d.guide?.hints?.length ? (
          <ul className="space-y-2 text-[13px]">
            {d.guide.hints.map((h, i) => (
              <li key={i}>
                <div className="font-medium">{h.milestone}</div>
                <ul className="list-disc pl-5 text-muted">
                  {h.tasks.map((t, j) => (
                    <li key={j}>{t}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState className="border-0! bg-transparent! px-0! py-8!" icon={<LightbulbIcon size={20} />} title="No hints" description="This template has no suggested tasks." />
        )}
      </CardBody>
    </Card>
  );
}
