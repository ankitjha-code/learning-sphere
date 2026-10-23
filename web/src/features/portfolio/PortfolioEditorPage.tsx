import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowUpIcon,
  ArrowDownIcon,
  EyeIcon,
  EyeSlashIcon,
  PrinterIcon,
  DownloadSimpleIcon,
  ArrowsClockwiseIcon,
  LockIcon,
  LinkIcon,
  GlobeIcon,
  ClockCounterClockwiseIcon,
  PlusIcon,
  TrashIcon,
  CertificateIcon,
  PenNibIcon,
  ArrowSquareOutIcon,
} from '@phosphor-icons/react';
import { api, ApiError, errorMessage } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  PageHeader,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  CardBody,
  Field,
  Input,
  Textarea,
  Switch,
  Tabs,
  Badge,
  Banner,
  CopyButton,
  ErrorState,
  SkeletonRows,
  EmptyState,
  ConfirmDialog,
  ProvenanceTag,
  buttonClass,
} from '@/components/ui';
import { PortfolioView, VerificationBadge } from './PortfolioView';
import type { ComposedPortfolio, OwnerPortfolio } from './types';

type Resp = { portfolio: OwnerPortfolio; evidence: ComposedPortfolio };

function usePatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: Record<string, unknown>) => api.patch<{ portfolio: OwnerPortfolio }>('/portfolio', v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      qc.invalidateQueries({ queryKey: ['portfolio-preview'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

function ProfileTab({ p }: { p: OwnerPortfolio }) {
  const [slug, setSlug] = useState(p.slug);
  const [headline, setHeadline] = useState(p.headline ?? '');
  const [about, setAbout] = useState(p.about ?? '');
  const patch = usePatch();
  const f = patch.error instanceof ApiError ? patch.error.fields : {};
  const sections = p.sections;
  const move = (i: number, dir: -1 | 1) => {
    const next = [...sections];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    patch.mutate({ sections: next.map(({ key, visible }) => ({ key, visible })) });
  };
  const toggle = (i: number) => patch.mutate({ sections: sections.map((s, j) => ({ key: s.key, visible: j === i ? !s.visible : s.visible })) });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Profile" description="Shown at the top of your portfolio." />
        <CardBody className="space-y-4">
          <Field label="Address" helper={`${window.location.origin}/p/${slug || 'your-name'}`} error={f.slug}>
            <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} maxLength={40} />
          </Field>
          <Field label="Headline" optional error={f.headline}>
            <Input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={160} placeholder="e.g. Backend developer focused on APIs and data" />
          </Field>
          <Field label="About" optional helper="Markdown supported." error={f.about}>
            <Textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={6} maxLength={5000} />
          </Field>
          <div className="flex justify-end">
            <Button
              variant="primary"
              loading={patch.isPending && !!patch.variables && 'headline' in patch.variables}
              onClick={() => patch.mutate({ slug, headline: headline || null, about: about || null }, { onSuccess: () => toast.success('Profile saved') })}
            >
              Save profile
            </Button>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Sections" description="Order and visibility on the public page. Use the arrow buttons to reorder." />
        <CardBody>
          <ol className="divide-y divide-border">
            {sections.map((s, i) => (
              <li key={s.key} className="flex items-center gap-2 py-2">
                <span className="w-5 text-center text-[12px] tabular-nums text-subtle">{i + 1}</span>
                <span className={s.visible ? 'flex-1 text-[14px]' : 'flex-1 text-[14px] text-subtle line-through'}>{s.label}</span>
                <Button size="icon-sm" variant="ghost" aria-label={`Move ${s.label} up`} disabled={i === 0 || patch.isPending} onClick={() => move(i, -1)}>
                  <ArrowUpIcon size={14} />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Move ${s.label} down`} disabled={i === sections.length - 1 || patch.isPending} onClick={() => move(i, 1)}>
                  <ArrowDownIcon size={14} />
                </Button>
                <Button size="sm" variant="ghost" icon={s.visible ? <EyeIcon size={14} /> : <EyeSlashIcon size={14} />} aria-pressed={s.visible} disabled={patch.isPending} onClick={() => toggle(i)}>
                  {s.visible ? 'Shown' : 'Hidden'}
                </Button>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[12px] text-subtle">Experience and education come from your profile and are labeled self-reported.</p>
        </CardBody>
      </Card>
    </div>
  );
}

function HideToggle({ id, hidden, ids }: { id: string; hidden: boolean; ids: string[] }) {
  const patch = usePatch();
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={hidden ? <EyeSlashIcon size={14} /> : <EyeIcon size={14} />}
      aria-pressed={!hidden}
      loading={patch.isPending}
      onClick={() => patch.mutate({ hiddenEvidenceIds: hidden ? ids.filter((x) => x !== id) : [...ids, id] })}
    >
      {hidden ? 'Hidden' : 'Shown'}
    </Button>
  );
}

function EvidenceTab({ p, e }: { p: OwnerPortfolio; e: ComposedPortfolio }) {
  const patch = usePatch();
  const ids = p.hiddenEvidenceIds;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Projects" description="Featured projects always appear (as a card; linked only if the project is shared). Completed projects you share as public or unlisted also appear." />
        <CardBody>
          {!e.projects.length ? (
            <p className="text-[13px] text-muted">No projects yet. Start one in Projects.</p>
          ) : (
            <ul className="divide-y divide-border">
              {e.projects.map((pr) => {
                const featured = p.featuredProjectIds.includes(pr.id);
                return (
                  <li key={pr.id} className="flex flex-wrap items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium">{pr.title}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                        <VerificationBadge p={pr} />
                        <Badge>{pr.visibility}</Badge>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={featured ? 'soft' : 'secondary'}
                      loading={patch.isPending}
                      onClick={() => patch.mutate({ featuredProjectIds: featured ? p.featuredProjectIds.filter((x) => x !== pr.id) : [...p.featuredProjectIds, pr.id] })}
                    >
                      {featured ? 'Featured' : 'Feature'}
                    </Button>
                    <HideToggle id={pr.id} hidden={pr.hidden} ids={ids} />
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Skills" description="Grouped by how they were established. You can hide a skill, but you cannot change its label." />
        <CardBody>
          {!e.skills.length ? (
            <p className="text-[13px] text-muted">No skill evidence yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {e.skills.map((s) => (
                <li key={s.skillId} className="flex flex-wrap items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-[14px] font-medium">{s.name}</span>{' '}
                    {s.provenance === 'verified' ? <ProvenanceTag kind="verified" /> : s.provenance === 'self_reported' ? <ProvenanceTag kind="self" /> : <Badge tone={s.provenance === 'demonstrated' ? 'info' : 'neutral'}>{s.provenance === 'demonstrated' ? 'Demonstrated' : 'Learning'}</Badge>}
                    <div className="text-[12px] text-subtle">{s.lastEvidenceAt ? `Last evidence ${formatDate(s.lastEvidenceAt)}` : 'No dated evidence'}</div>
                  </div>
                  <HideToggle id={s.skillId} hidden={s.hidden} ids={ids} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Assessment results" description="Hidden by default. Only the title and score percentage are ever shown." />
        <CardBody>
          {!e.assessments.length ? (
            <p className="text-[13px] text-muted">No released results yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {e.assessments.map((a) => (
                <li key={a.attemptId} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium">{a.title}</div>
                    <div className="text-[12px] text-subtle">
                      {a.scorePercent}% {a.at && `· ${formatDate(a.at)}`}
                    </div>
                  </div>
                  <Switch
                    checked={a.shown}
                    disabled={patch.isPending}
                    onCheckedChange={(v) => patch.mutate({ shownAttemptIds: v ? [...p.shownAttemptIds, a.attemptId] : p.shownAttemptIds.filter((x) => x !== a.attemptId) })}
                    label={<span className="sr-only">Show {a.title}</span>}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Achievements" />
        <CardBody>
          {!e.achievements.length ? (
            <p className="text-[13px] text-muted">No achievements yet. They are earned from platform activity.</p>
          ) : (
            <ul className="divide-y divide-border">
              {e.achievements.map((a) => (
                <li key={a.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium">{a.title}</div>
                    <div className="text-[12px] text-subtle">{formatDate(a.awardedAt)}</div>
                  </div>
                  <HideToggle id={a.id} hidden={a.hidden} ids={ids} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function CertificatesTab({ p, e }: { p: OwnerPortfolio; e: ComposedPortfolio }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [issuer, setIssuer] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [url, setUrl] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => api.post('/portfolio/certificates', { title, issuer, issuedAt, credentialUrl: url.trim() || null }),
    onSuccess: () => {
      toast.success('Certificate added as self-reported');
      setTitle('');
      setIssuer('');
      setIssuedAt('');
      setUrl('');
      qc.invalidateQueries({ queryKey: ['portfolio'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/portfolio/certificates/${id}`),
    onSuccess: () => {
      toast.success('Certificate removed');
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ['portfolio'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const f = add.error instanceof ApiError ? add.error.fields : {};
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader title="Certificates" description="Platform completion records are issued automatically when you finish every topic of a learning path or a reviewer approves a capstone." />
        <CardBody>
          {!e.certificates.length ? (
            <EmptyState className="border-0! bg-transparent! px-0! py-8!" icon={<CertificateIcon size={22} />} title="No certificates yet" description="Finish a learning path or a capstone to earn a platform completion record, or add an external certificate." />
          ) : (
            <ul className="divide-y divide-border">
              {e.certificates.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium">{c.title}</div>
                    <div className="text-[12px] text-muted">
                      {c.issuer} · {formatDate(c.issuedAt)}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      {c.kind === 'platform_completion' ? <Badge tone="accent">Platform completion record</Badge> : <ProvenanceTag kind="self" />}
                      <span className="text-[11.5px] text-subtle">{c.label}</span>
                    </div>
                    {c.verificationCode && (
                      <div className="mt-1 flex items-center gap-1 text-[12px]">
                        <span className="font-mono">{c.verificationCode}</span>
                        <CopyButton value={`${window.location.origin}/verify/${c.verificationCode}`} label="Copy verify link" />
                      </div>
                    )}
                  </div>
                  <HideToggle id={c.id} hidden={c.hidden} ids={p.hiddenEvidenceIds} />
                  {c.kind === 'external_self_reported' && (
                    <Button size="icon-sm" variant="ghost" aria-label={`Remove ${c.title}`} onClick={() => setRemoving(c.id)}>
                      <TrashIcon size={14} />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Add an external certificate" description="Stored and shown as self-reported. LearnSphere Nexus does not verify certificates from other issuers." />
        <CardBody>
          <form
            className="space-y-3"
            onSubmit={(ev) => {
              ev.preventDefault();
              add.mutate();
            }}
          >
            <Field label="Certificate name" error={f.title}>
              <Input value={title} onChange={(ev) => setTitle(ev.target.value)} maxLength={200} />
            </Field>
            <Field label="Issuer" error={f.issuer}>
              <Input value={issuer} onChange={(ev) => setIssuer(ev.target.value)} maxLength={200} />
            </Field>
            <Field label="Issued on" error={f.issuedAt}>
              <Input type="date" value={issuedAt} onChange={(ev) => setIssuedAt(ev.target.value)} className="max-w-[200px]" />
            </Field>
            <Field label="Credential link" optional error={f.credentialUrl} helper="The issuer's own verification page, if they have one.">
              <Input value={url} onChange={(ev) => setUrl(ev.target.value)} placeholder="https://..." />
            </Field>
            <Button type="submit" variant="primary" icon={<PlusIcon size={14} />} loading={add.isPending} disabled={!title.trim() || !issuer.trim() || !issuedAt} disabledReason="Fill in name, issuer and date">
              Add as self-reported
            </Button>
          </form>
        </CardBody>
      </Card>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        title="Remove this certificate?"
        description="It disappears from your portfolio. You can add it again later."
        confirmLabel="Remove certificate"
        danger
        loading={del.isPending}
        onConfirm={() => {
          if (removing) del.mutate(removing);
        }}
      />
    </div>
  );
}

function WritingTab({ p }: { p: OwnerPortfolio }) {
  const patch = usePatch();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [summary, setSummary] = useState('');
  const f = patch.error instanceof ApiError ? patch.error.fields : {};
  const idx = p.writing.length;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader title="Writing samples" description="Blog posts, technical write-ups or documentation you wrote." />
        <CardBody>
          {!p.writing.length ? (
            <EmptyState className="border-0! bg-transparent! px-0! py-8!" icon={<PenNibIcon size={22} />} title="No writing samples" description="Link articles or documentation that show how you think and explain." />
          ) : (
            <ul className="divide-y divide-border">
              {p.writing.map((w, i) => (
                <li key={i} className="flex items-start gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <a href={w.url} target="_blank" rel="noopener noreferrer" className="text-[14px] font-medium text-accent-text hover:underline">
                      {w.title} <ArrowSquareOutIcon size={12} className="inline" />
                    </a>
                    {w.summary && <p className="text-[12.5px] text-muted">{w.summary}</p>}
                  </div>
                  <Button size="icon-sm" variant="ghost" aria-label={`Remove ${w.title}`} onClick={() => patch.mutate({ writing: p.writing.filter((_, j) => j !== i) }, { onSuccess: () => toast.success('Removed') })}>
                    <TrashIcon size={14} />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Add a writing sample" />
        <CardBody>
          <form
            className="space-y-3"
            onSubmit={(ev) => {
              ev.preventDefault();
              patch.mutate(
                { writing: [...p.writing, { title: title.trim(), url: url.trim(), ...(summary.trim() ? { summary: summary.trim() } : {}) }] },
                {
                  onSuccess: () => {
                    toast.success('Writing sample added');
                    setTitle('');
                    setUrl('');
                    setSummary('');
                  },
                },
              );
            }}
          >
            <Field label="Title" error={f[`writing.${idx}.title`]}>
              <Input value={title} onChange={(ev) => setTitle(ev.target.value)} maxLength={200} />
            </Field>
            <Field label="Link" error={f[`writing.${idx}.url`]}>
              <Input value={url} onChange={(ev) => setUrl(ev.target.value)} placeholder="https://..." />
            </Field>
            <Field label="Summary" optional>
              <Textarea value={summary} onChange={(ev) => setSummary(ev.target.value)} rows={2} maxLength={500} />
            </Field>
            <Button type="submit" variant="primary" loading={patch.isPending} disabled={title.trim().length < 2 || !url.trim()} disabledReason="Add a title and a link">
              Add sample
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

type Version = { id: string; version: number; snapshot: { note?: string; visibility?: string; headline?: string | null }; createdAt: string };

function SharingTab({ p }: { p: OwnerPortfolio }) {
  const qc = useQueryClient();
  const versions = useQuery({ queryKey: ['portfolio-versions'], queryFn: () => api.get<{ items: Version[] }>('/portfolio/versions') });
  const [restoring, setRestoring] = useState<number | null>(null);
  const done = (msg: string) => () => {
    toast.success(msg);
    qc.invalidateQueries({ queryKey: ['portfolio'] });
    qc.invalidateQueries({ queryKey: ['portfolio-versions'] });
    qc.invalidateQueries({ queryKey: ['portfolio-preview'] });
  };
  const publish = useMutation({ mutationFn: (visibility: 'public' | 'unlisted') => api.post('/portfolio/publish', { visibility }), onSuccess: done('Published. A version snapshot was saved.'), onError: (e) => toast.error(errorMessage(e)) });
  const unpublish = useMutation({ mutationFn: () => api.post('/portfolio/unpublish'), onSuccess: done('Portfolio is private again. Shared links stop working.'), onError: (e) => toast.error(errorMessage(e)) });
  const rotate = useMutation({ mutationFn: () => api.post('/portfolio/share-token/rotate'), onSuccess: done('New link created. The old link no longer works.'), onError: (e) => toast.error(errorMessage(e)) });
  const restore = useMutation({
    mutationFn: (v: number) => api.post(`/portfolio/versions/${v}/restore`),
    onSuccess: () => {
      setRestoring(null);
      done('Version restored. Publish again to update the snapshot history.')();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const url = p.sharePath ? `${window.location.origin}${p.sharePath}` : null;
  const opts = [
    { v: 'private', label: 'Private', icon: LockIcon, hint: 'Only you. The public address shows "not available".' },
    { v: 'unlisted', label: 'Unlisted', icon: LinkIcon, hint: 'Anyone with the secret link. Create a new link to revoke the old one.' },
    { v: 'public', label: 'Public', icon: GlobeIcon, hint: 'Anyone with your address.' },
  ] as const;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Visibility" description="Publishing saves a version snapshot you can restore later." />
        <CardBody className="space-y-2">
          {opts.map((o) => (
            <div key={o.v} className={`flex items-start gap-2.5 rounded-md border p-3 ${p.visibility === o.v ? 'border-accent bg-accent-soft' : 'border-border'}`}>
              <o.icon size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium">
                  {o.label} {p.visibility === o.v && <Badge tone="accent">Current</Badge>}
                </div>
                <div className="text-[12.5px] text-muted">{o.hint}</div>
              </div>
              {o.v === 'private' ? (
                p.visibility !== 'private' && (
                  <Button size="sm" loading={unpublish.isPending} onClick={() => unpublish.mutate()}>
                    Make private
                  </Button>
                )
              ) : (
                <Button size="sm" variant={p.visibility === o.v ? 'secondary' : 'primary'} loading={publish.isPending && publish.variables === o.v} onClick={() => publish.mutate(o.v)}>
                  {p.visibility === o.v ? 'Publish update' : 'Publish'}
                </Button>
              )}
            </div>
          ))}
          {url && (
            <div className="pt-2">
              <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-2">
                <code className="min-w-0 flex-1 truncate text-[12.5px]">{url}</code>
                <CopyButton value={url} label="Copy link" />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <ButtonLink to={p.sharePath!} target="_blank" size="sm" icon={<ArrowSquareOutIcon size={14} />}>
                  Open public page
                </ButtonLink>
                {p.visibility === 'unlisted' && (
                  <Button size="sm" icon={<ArrowsClockwiseIcon size={14} />} loading={rotate.isPending} onClick={() => rotate.mutate()}>
                    New link (revoke old)
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-1.5"><ClockCounterClockwiseIcon size={16} /> Version history</span>} description="Restoring brings back headline, about, sections, featured projects, hidden items and writing. Visibility is not changed." />
        <CardBody>
          {versions.isLoading ? (
            <SkeletonRows rows={3} />
          ) : versions.error ? (
            <ErrorState error={versions.error} onRetry={() => versions.refetch()} />
          ) : !versions.data?.items.length ? (
            <p className="text-[13px] text-muted">No versions yet. Each publish saves one.</p>
          ) : (
            <ul className="divide-y divide-border">
              {versions.data.items.map((v) => (
                <li key={v.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium">Version {v.version}</div>
                    <div className="text-[12px] text-subtle">
                      {formatDateTime(v.createdAt)} · {v.snapshot.note ?? 'Snapshot'}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => setRestoring(v.version)}>
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      <ConfirmDialog
        open={restoring !== null}
        onOpenChange={(v) => !v && setRestoring(null)}
        title={`Restore version ${restoring}?`}
        description="Your current content is replaced by that version. A new version is recorded, so you can undo this by restoring again."
        confirmLabel="Restore version"
        loading={restore.isPending}
        onConfirm={() => {
          if (restoring !== null) restore.mutate(restoring);
        }}
      />
    </div>
  );
}

function PreviewTab() {
  const q = useQuery({ queryKey: ['portfolio-preview'], queryFn: () => api.get<ComposedPortfolio>('/portfolio/preview') });
  if (q.isLoading) return <SkeletonRows rows={6} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div>
      <Banner tone="info" className="mb-4">
        This is what visitors see with your current settings{q.data!.portfolio.visibility === 'private' ? ' once you publish. Right now your portfolio is private.' : '.'}
      </Banner>
      <div className="rounded-xl border border-border bg-bg p-4 sm:p-8">
        <PortfolioView v={q.data!} />
      </div>
    </div>
  );
}

const TABS = ['profile', 'evidence', 'certificates', 'writing', 'sharing', 'preview'] as const;

export default function PortfolioEditorPage() {
  const [params, setParams] = useSearchParams();
  const t = params.get('tab');
  const tab = t && (TABS as readonly string[]).includes(t) ? t : 'profile';
  const q = useQuery({ queryKey: ['portfolio'], queryFn: () => api.get<Resp>('/portfolio') });
  useEffect(() => {
    document.title = 'Portfolio · LearnSphere Nexus';
  }, []);
  if (q.isLoading) return <SkeletonRows rows={6} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { portfolio: p, evidence: e } = q.data!;
  return (
    <div>
      <PageHeader
        title="Portfolio"
        badge={<Badge tone={p.visibility === 'public' ? 'success' : p.visibility === 'unlisted' ? 'info' : 'neutral'}>{p.visibility.charAt(0).toUpperCase() + p.visibility.slice(1)}</Badge>}
        description="Evidence of what you can do, labeled honestly: reviewer-verified, graded, or self-reported."
        actions={
          <>
            <a href="/api/portfolio/summary.md" download className={buttonClass('secondary', 'md')}>
              <DownloadSimpleIcon size={16} /> Download summary
            </a>
            <ButtonLink to="/app/portfolio/print" icon={<PrinterIcon size={16} />}>
              Print or save as PDF
            </ButtonLink>
          </>
        }
      />
      <Tabs
        value={tab}
        onValueChange={(v) => {
          params.set('tab', v);
          setParams(params, { replace: true });
        }}
        tabs={[
          { value: 'profile', label: 'Profile & sections' },
          { value: 'evidence', label: 'Evidence' },
          { value: 'certificates', label: 'Certificates', count: e.certificates.length },
          { value: 'writing', label: 'Writing', count: p.writing.length },
          { value: 'sharing', label: 'Sharing & history' },
          { value: 'preview', label: 'Preview' },
        ]}
        className="mb-6"
      />
      {tab === 'profile' && <ProfileTab key={p.version} p={p} />}
      {tab === 'evidence' && <EvidenceTab p={p} e={e} />}
      {tab === 'certificates' && <CertificatesTab p={p} e={e} />}
      {tab === 'writing' && <WritingTab p={p} />}
      {tab === 'sharing' && <SharingTab p={p} />}
      {tab === 'preview' && <PreviewTab />}
    </div>
  );
}
