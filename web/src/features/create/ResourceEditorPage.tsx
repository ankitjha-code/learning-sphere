import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  FloppyDiskIcon,
  PaperPlaneTiltIcon,
  ArrowCounterClockwiseIcon,
  ArchiveIcon,
  TrashIcon,
  RocketLaunchIcon,
  ClockCounterClockwiseIcon,
  EyeIcon,
  StarIcon,
  CheckCircleIcon,
  UsersIcon,
  BookmarkSimpleIcon,
  FlagIcon,
  ArrowSquareOutIcon,
  ChatTextIcon,
} from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  PageHeader,
  Banner,
  Button,
  Card,
  CardHeader,
  CardBody,
  Field,
  Input,
  Textarea,
  Select,
  Switch,
  Segmented,
  TagsInput,
  Tabs,
  Markdown,
  Dialog,
  ConfirmDialog,
  ErrorState,
  EmptyState,
  Skeleton,
  SkeletonRows,
  StatTile,
  Badge,
  StatusBadge,
} from '@/components/ui';
import { Breadcrumb, Bar, ResourceStatus, KINDS, DIFFICULTIES, KIND_LABEL, cap, type ResourceDetailResponse, type ResourceDetail, type Analytics } from './shared';

type Context = { activeOrg: { id: string; name: string } | null; canAuthorOrg: boolean; isPlatformAdmin: boolean };
type FormState = {
  scope: 'org' | 'public';
  kind: string;
  title: string;
  summary: string;
  contentType: 'markdown' | 'link';
  body: string;
  url: string;
  sourceName: string;
  license: string;
  topics: string[];
  languages: string[];
  roles: string[];
  difficulty: string;
  skillSlugs: string[];
  downloadable: boolean;
  changeNote: string;
};

function toForm(r: ResourceDetail | null, canAuthorOrg: boolean): FormState {
  return {
    scope: r ? r.scope : canAuthorOrg ? 'org' : 'public',
    kind: r?.kind ?? 'article',
    title: r?.title ?? '',
    summary: r?.summary ?? '',
    contentType: r && !r.body && r.url ? 'link' : 'markdown',
    body: r?.body ?? '',
    url: r?.url ?? '',
    sourceName: r?.sourceName ?? '',
    license: r?.license ?? '',
    topics: r?.topics ?? [],
    languages: r?.languages ?? [],
    roles: r?.roles ?? [],
    difficulty: r?.difficulty ?? 'beginner',
    skillSlugs: r?.skillSlugs ?? [],
    downloadable: r?.downloadable ?? false,
    changeNote: '',
  };
}

export default function ResourceEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const ctx = useQuery({ queryKey: ['create', 'context'], queryFn: () => api.get<Context>('/create/context'), enabled: isNew });
  const detail = useQuery({
    queryKey: ['create', 'resource', id],
    queryFn: () => api.get<ResourceDetailResponse>(`/create/resources/${id}`),
    enabled: !isNew,
  });

  const q = isNew ? ctx : detail;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Skeleton className="h-[600px] rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );

  if (isNew) return ctx.data ? <Editor key="new" data={null} canAuthorOrg={ctx.data.canAuthorOrg} orgName={ctx.data.activeOrg?.name ?? null} /> : null;
  return detail.data ? <Editor key={id} data={detail.data} canAuthorOrg={detail.data.resource.scope === 'org'} orgName={null} /> : null;
}

function Editor({ data, canAuthorOrg, orgName }: { data: ResourceDetailResponse | null; canAuthorOrg: boolean; orgName: string | null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const r = data?.resource ?? null;
  const [form, setForm] = useState<FormState>(() => toForm(r, canAuthorOrg));
  const [dirty, setDirty] = useState(false);
  const [bodyTab, setBodyTab] = useState('write');
  const [section, setSection] = useState('content');
  const [backToReview, setBackToReview] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['create'] });
    qc.invalidateQueries({ queryKey: ['library'] });
  };

  const payload = () => {
    const isLink = form.contentType === 'link';
    return {
      kind: form.kind,
      title: form.title,
      summary: form.summary,
      body: isLink ? null : form.body,
      url: isLink ? form.url.trim() || null : form.url.trim() || null,
      sourceName: form.sourceName.trim() || null,
      license: form.license.trim() || null,
      topics: form.topics,
      languages: form.languages,
      roles: form.roles,
      difficulty: form.difficulty,
      skillSlugs: form.skillSlugs,
      downloadable: isLink ? false : form.downloadable,
    };
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!r) return { created: await api.post<{ resource: { id: string } }>('/create/resources', { scope: form.scope, ...payload() }) };
      return {
        updated: await api.patch<{ resource: { version: number }; versionBumped: boolean; backToReview: boolean }>(`/create/resources/${r.id}`, {
          ...payload(),
          changeNote: form.changeNote.trim() || undefined,
        }),
      };
    },
    onSuccess: (res) => {
      setDirty(false);
      invalidate();
      if (res.created) {
        toast.success('Draft saved');
        navigate(`/app/create/resources/${res.created.resource.id}`, { replace: true });
        return;
      }
      const u = res.updated!;
      setForm((f) => ({ ...f, changeNote: '' }));
      setBackToReview(u.backToReview);
      toast.success(u.versionBumped ? `Saved as version ${u.resource.version}` : 'Changes saved');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const fields = save.error instanceof ApiError ? save.error.fields : {};
  const fe = (name: string) => fields[name] ?? Object.entries(fields).find(([k]) => k.startsWith(`${name}.`))?.[1];
  const skillError = fields.skillSlugs ? errorMessage(save.error) : undefined;

  const lockedForReview = !!r && r.status === 'in_review' && !!data?.permissions.mustSubmitForReview;
  const isLink = form.contentType === 'link';

  return (
    <div>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Creator studio', to: '/app/create' }, { label: 'Resources', to: '/app/create/resources' }, { label: r ? r.title : 'New resource' }]} />}
        title={r ? 'Edit resource' : 'New resource'}
        badge={
          r && (
            <>
              <ResourceStatus status={r.status} />
              <Badge>v{r.version}</Badge>
            </>
          )
        }
        actions={
          <>
            {r?.status === 'published' && (
              <Link to={`/app/library/${r.id}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-text hover:underline">
                View in library <ArrowSquareOutIcon size={13} aria-hidden />
              </Link>
            )}
            <Button
              variant="primary"
              icon={<FloppyDiskIcon size={16} />}
              loading={save.isPending}
              onClick={() => save.mutate()}
              disabled={lockedForReview || (!!r && !dirty)}
              disabledReason={lockedForReview ? 'Withdraw the submission to edit it' : 'No unsaved changes'}
            >
              {r ? 'Save changes' : 'Save draft'}
            </Button>
          </>
        }
      />

      <div className="mb-6 space-y-3 empty:hidden">
        {backToReview && (
          <Banner tone="warning" title="Sent back to review">
            You changed the content of a published public resource, so it goes back to a platform admin for review. The previous version stays archived in version history.
          </Banner>
        )}
        {lockedForReview && (
          <Banner tone="info" title="Waiting for review">
            A platform admin is reviewing this submission. Withdraw it if you need to make changes.
          </Banner>
        )}
        {r?.status === 'rejected' && data?.reviews[0]?.note && (
          <Banner tone="warning" title="Changes requested">
            {data.reviews[0].note}
          </Banner>
        )}
        {save.error && !Object.keys(fields).length && <Banner tone="danger">{errorMessage(save.error)}</Banner>}
      </div>

      {r && (
        <Tabs
          value={section}
          onValueChange={setSection}
          className="mb-4"
          tabs={[
            { value: 'content', label: 'Content' },
            { value: 'versions', label: 'Version history', count: data!.versions.length },
            { value: 'reviews', label: 'Review history', count: data!.reviews.length },
            { value: 'analytics', label: 'Analytics' },
          ]}
        />
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {section === 'content' && (
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!lockedForReview) save.mutate();
              }}
            >
              <fieldset disabled={lockedForReview} className="space-y-5">
                <Card>
                  <CardHeader title="Basics" />
                  <CardBody className="space-y-4">
                    {!r ? (
                      canAuthorOrg ? (
                        <div className="space-y-1.5">
                          <div className="text-[13px] font-medium">Where will it be published?</div>
                          <Segmented
                            label="Scope"
                            value={form.scope}
                            onChange={(v) => set('scope', v)}
                            options={[
                              { value: 'org', label: orgName ? `${orgName} only` : 'My organization' },
                              { value: 'public', label: 'Public library' },
                            ]}
                          />
                          <p className="text-[12.5px] text-subtle">
                            {form.scope === 'org' ? 'Visible to members of your organization once you publish it.' : 'Visible to everyone after a platform admin approves it.'}
                          </p>
                        </div>
                      ) : (
                        <Banner tone="info" title="Public submission">
                          This resource goes to the public library after a platform admin approves it. Organization publishing needs a creator, faculty or admin role.
                        </Banner>
                      )
                    ) : (
                      <p className="text-[13px] text-muted">
                        Scope: <span className="font-medium text-fg">{r.scope === 'org' ? 'Organization library' : 'Public library'}</span>
                      </p>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Type" error={fe('kind')}>
                        <Select value={form.kind} onChange={(e) => set('kind', e.target.value)}>
                          {KINDS.map((k) => (
                            <option key={k} value={k}>
                              {KIND_LABEL[k]}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Difficulty" error={fe('difficulty')}>
                        <Select value={form.difficulty} onChange={(e) => set('difficulty', e.target.value)}>
                          {DIFFICULTIES.map((d) => (
                            <option key={d} value={d}>
                              {cap(d)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <Field label="Title" required error={fe('title')}>
                      <Input value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={200} />
                    </Field>
                    <Field label="Summary" optional helper="One or two sentences shown on library cards." error={fe('summary')}>
                      <Textarea value={form.summary} onChange={(e) => set('summary', e.target.value)} rows={2} maxLength={600} />
                    </Field>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader
                    title="Content"
                    description="Write the material here in markdown, or point to an external page with attribution."
                    action={
                      <Segmented
                        label="Content type"
                        value={form.contentType}
                        onChange={(v) => set('contentType', v)}
                        options={[
                          { value: 'markdown', label: 'Markdown' },
                          { value: 'link', label: 'External link' },
                        ]}
                      />
                    }
                  />
                  <CardBody className="space-y-4">
                    {!isLink ? (
                      <>
                        <div>
                          <Tabs
                            value={bodyTab}
                            onValueChange={setBodyTab}
                            className="mb-3"
                            tabs={[
                              { value: 'write', label: 'Write' },
                              { value: 'preview', label: 'Preview' },
                            ]}
                          />
                          {bodyTab === 'write' ? (
                            <Field label="Body" helper="Markdown with GitHub flavour: headings, lists, tables and fenced code blocks." error={fe('body')}>
                              <Textarea value={form.body} onChange={(e) => set('body', e.target.value)} rows={18} className="font-mono text-[13px]" />
                            </Field>
                          ) : form.body.trim() ? (
                            <div className="min-h-40 rounded-md border border-border bg-surface-2 p-4">
                              <Markdown source={form.body} />
                            </div>
                          ) : (
                            <p className="rounded-md border border-dashed border-border p-6 text-center text-[13px] text-muted">Nothing to preview yet. Write something first.</p>
                          )}
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Original source" optional helper="Credit the source if you adapted this material." error={fe('sourceName')}>
                            <Input value={form.sourceName} onChange={(e) => set('sourceName', e.target.value)} maxLength={200} />
                          </Field>
                          <Field label="Source URL" optional error={fe('url')}>
                            <Input type="url" value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" />
                          </Field>
                        </div>
                        <Switch
                          checked={form.downloadable}
                          onCheckedChange={(v) => set('downloadable', v)}
                          label="Allow download"
                          description="Readers can download the markdown with source and license attached."
                        />
                      </>
                    ) : (
                      <>
                        <Field label="URL" required helper="Full address starting with https://" error={fe('url') ?? fe('body')}>
                          <Input type="url" value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" />
                        </Field>
                        <Field label="Source name" required helper="Required for links. Name the publisher or site so readers know where it comes from." error={fe('sourceName')}>
                          <Input value={form.sourceName} onChange={(e) => set('sourceName', e.target.value)} maxLength={200} placeholder="For example MDN Web Docs" />
                        </Field>
                      </>
                    )}
                    <Field label="License" optional helper="For example CC BY 4.0. Leave empty if unknown." error={fe('license')}>
                      <Input value={form.license} onChange={(e) => set('license', e.target.value)} maxLength={200} />
                    </Field>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title="Discovery" description="Helps learners find this in search and filters. Separate values with commas." />
                  <CardBody className="grid gap-4 sm:grid-cols-2">
                    <Field label="Topics" optional error={fe('topics')}>
                      <TagsInput value={form.topics} onChange={(v) => set('topics', v)} placeholder="sql, joins" />
                    </Field>
                    <Field label="Languages" optional error={fe('languages')}>
                      <TagsInput value={form.languages} onChange={(v) => set('languages', v)} placeholder="python, javascript" />
                    </Field>
                    <Field label="Roles" optional error={fe('roles')}>
                      <TagsInput value={form.roles} onChange={(v) => set('roles', v)} placeholder="Data Analyst, Backend Developer" />
                    </Field>
                    <Field label="Skill slugs" optional helper="Links the resource to skills in the skill graph." error={skillError ?? fe('skillSlugs')}>
                      <TagsInput value={form.skillSlugs} onChange={(v) => set('skillSlugs', v)} placeholder="sql-joins" />
                    </Field>
                  </CardBody>
                </Card>

                {r && (
                  <Field label="Change note" optional helper="Shown to reviewers when an edit goes back to review." error={fe('changeNote')}>
                    <Input value={form.changeNote} onChange={(e) => set('changeNote', e.target.value)} maxLength={300} />
                  </Field>
                )}
              </fieldset>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  icon={<FloppyDiskIcon size={16} />}
                  loading={save.isPending}
                  disabled={lockedForReview || (!!r && !dirty)}
                  disabledReason={lockedForReview ? 'Withdraw the submission to edit it' : 'No unsaved changes'}
                >
                  {r ? 'Save changes' : 'Save draft'}
                </Button>
              </div>
            </form>
          )}
          {r && section === 'versions' && <Versions resourceId={r.id} versions={data!.versions} currentVersion={r.version} />}
          {r && section === 'reviews' && <Reviews reviews={data!.reviews} />}
          {r && section === 'analytics' && <AnalyticsSection resourceId={r.id} />}
        </div>

        <aside className="space-y-4">
          {r && data ? (
            <PublishPanel data={data} dirty={dirty} onChanged={invalidate} />
          ) : (
            <Card>
              <CardHeader title="Publishing" />
              <CardBody>
                <p className="text-[13px] text-muted">
                  Save the draft first. Then you can {form.scope === 'org' && canAuthorOrg ? 'publish it to your organization' : 'submit it for platform admin review'}.
                </p>
              </CardBody>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---------- Publish panel ----------

function PublishPanel({ data, dirty, onChanged }: { data: ResourceDetailResponse; dirty: boolean; onChanged: () => void }) {
  const navigate = useNavigate();
  const r = data.resource;
  const { canPublishDirectly, mustSubmitForReview } = data.permissions;
  const [confirm, setConfirm] = useState<null | 'archive' | 'delete' | 'submit'>(null);
  const [submitNote, setSubmitNote] = useState('');

  const action = useMutation({
    mutationFn: ({ kind, note }: { kind: 'publish' | 'submit' | 'withdraw' | 'archive' | 'restore' | 'delete'; note?: string }) =>
      kind === 'delete'
        ? api.del<{ ok: true }>(`/create/resources/${r.id}`)
        : api.post<{ ok: true; status: string }>(`/create/resources/${r.id}/${kind}`, kind === 'submit' ? { note: note || undefined } : {}),
    onSuccess: (_res, { kind }) => {
      const msg = {
        publish: 'Published',
        submit: 'Submitted for review. A platform admin will look at it soon.',
        withdraw: 'Submission withdrawn. It is a draft again.',
        archive: 'Archived. It no longer appears in the library.',
        restore: 'Restored as a draft',
        delete: 'Draft deleted',
      }[kind];
      toast.success(msg);
      setConfirm(null);
      setSubmitNote('');
      onChanged();
      if (kind === 'delete') navigate('/app/create/resources', { replace: true });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const pending = (k: string) => action.isPending && action.variables?.kind === k;
  const editable = r.status === 'draft' || r.status === 'rejected';
  const saveFirst = dirty ? 'Save your changes first' : undefined;

  return (
    <>
      <Card>
        <CardHeader title="Publishing" description={r.scope === 'org' ? 'Organization library' : 'Public library'} />
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-muted">Status</span>
            <ResourceStatus status={r.status} />
          </div>
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-muted">Version</span>
            <span>v{r.version}</span>
          </div>
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-muted">Last reviewed</span>
            <span>{r.lastReviewedAt ? formatDate(r.lastReviewedAt) : 'Never'}</span>
          </div>

          <div className="flex flex-col gap-2 border-t border-border pt-3">
            {canPublishDirectly && editable && (
              <Button
                variant="primary"
                icon={<RocketLaunchIcon size={16} />}
                loading={pending('publish')}
                disabled={dirty}
                disabledReason={saveFirst}
                onClick={() => action.mutate({ kind: 'publish' })}
              >
                Publish
              </Button>
            )}
            {mustSubmitForReview && editable && (
              <Button variant="primary" icon={<PaperPlaneTiltIcon size={16} />} disabled={dirty} disabledReason={saveFirst} onClick={() => setConfirm('submit')}>
                Submit for review
              </Button>
            )}
            {r.status === 'in_review' && (
              <Button icon={<ArrowCounterClockwiseIcon size={16} />} loading={pending('withdraw')} onClick={() => action.mutate({ kind: 'withdraw' })}>
                Withdraw submission
              </Button>
            )}
            {r.status === 'in_review' && canPublishDirectly && <p className="text-[12.5px] text-muted">Approve or reject it from the review queue.</p>}
            {r.status === 'published' && (
              <Button icon={<ArchiveIcon size={16} />} onClick={() => setConfirm('archive')}>
                Archive
              </Button>
            )}
            {r.status === 'archived' && (
              <Button icon={<ArrowCounterClockwiseIcon size={16} />} loading={pending('restore')} onClick={() => action.mutate({ kind: 'restore' })}>
                Restore as draft
              </Button>
            )}
            {editable && (
              <Button variant="ghost" icon={<TrashIcon size={16} />} className="text-danger hover:text-danger" onClick={() => setConfirm('delete')}>
                Delete draft
              </Button>
            )}
            {mustSubmitForReview && <p className="text-[12.5px] text-subtle">Public library resources are published after a platform admin review.</p>}
          </div>
        </CardBody>
      </Card>

      <Dialog
        open={confirm === 'submit'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title="Submit for review"
        description="A platform admin checks accuracy, attribution and licensing before it goes live. You cannot edit while it is in review."
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="primary" loading={pending('submit')} onClick={() => action.mutate({ kind: 'submit', note: submitNote.trim() })}>
              Submit for review
            </Button>
          </>
        }
      >
        <Field label="Note for the reviewer" optional>
          <Textarea value={submitNote} onChange={(e) => setSubmitNote(e.target.value)} rows={3} maxLength={500} />
        </Field>
      </Dialog>

      <ConfirmDialog
        open={confirm === 'archive'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title="Archive this resource?"
        description="It disappears from the library and search. Bookmarks and history keep their entries. You can restore it later as a draft."
        confirmLabel="Archive"
        loading={pending('archive')}
        onConfirm={() => action.mutate({ kind: 'archive' })}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title="Delete this draft?"
        description="The draft and its version history are deleted permanently. This cannot be undone."
        confirmLabel="Delete draft"
        danger
        confirmText={r.title}
        loading={pending('delete')}
        onConfirm={() => action.mutate({ kind: 'delete' })}
      />
    </>
  );
}

// ---------- Sections ----------

type VersionFull = { id: string; version: number; title: string; body: string | null; createdAt: string };

function Versions({ resourceId, versions, currentVersion }: { resourceId: string; versions: ResourceDetailResponse['versions']; currentVersion: number }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const v = useQuery({
    queryKey: ['create', 'resource', resourceId, 'version', openId],
    queryFn: () => api.get<{ version: VersionFull }>(`/create/resources/${resourceId}/versions/${openId}`),
    enabled: !!openId,
  });
  if (!versions.length)
    return (
      <EmptyState
        icon={<ClockCounterClockwiseIcon size={22} />}
        title="No earlier versions"
        description={`This is version ${currentVersion}. Each time you change the title, summary, body or link, the previous content is kept here.`}
      />
    );
  return (
    <Card>
      <CardHeader title="Version history" description={`Current version is v${currentVersion}. Earlier snapshots are read-only.`} />
      <CardBody className="px-0 pb-0">
        <ul className="divide-y divide-border border-t border-border">
          {versions.map((x) => (
            <li key={x.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="font-medium">
                  v{x.version} · {x.title}
                </div>
                <div className="text-[12.5px] text-muted">
                  {formatDateTime(x.createdAt)}
                  {x.editedBy && ` · replaced by ${x.editedBy}`}
                </div>
              </div>
              <Button size="sm" icon={<EyeIcon size={14} />} onClick={() => setOpenId(x.id)}>
                View
              </Button>
            </li>
          ))}
        </ul>
      </CardBody>
      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)} title={v.data ? `Version ${v.data.version.version}: ${v.data.version.title}` : 'Version'} size="lg">
        {v.error ? (
          <ErrorState error={v.error} onRetry={() => v.refetch()} />
        ) : !v.data ? (
          <SkeletonRows rows={6} />
        ) : v.data.version.body ? (
          <Markdown source={v.data.version.body} />
        ) : (
          <p className="text-[13px] text-muted">This version had no body.</p>
        )}
      </Dialog>
    </Card>
  );
}

function Reviews({ reviews }: { reviews: ResourceDetailResponse['reviews'] }) {
  if (!reviews.length)
    return <EmptyState icon={<ChatTextIcon size={22} />} title="No review history" description="Submissions, approvals and change requests will be listed here with reviewer notes." />;
  return (
    <Card>
      <CardHeader title="Review history" />
      <CardBody className="px-0 pb-0">
        <ol className="divide-y divide-border border-t border-border">
          {reviews.map((x) => (
            <li key={x.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <StatusBadge status={x.decision === 'approved' ? 'accepted' : x.decision === 'rejected' ? 'needs_revision' : 'submitted'} />
                <span className="text-muted">by</span>
                <span className="font-medium">{x.reviewer ?? 'Unknown'}</span>
                <span className="text-subtle">· {formatDateTime(x.createdAt)}</span>
              </div>
              {x.note && <p className="mt-1.5 whitespace-pre-line text-[13.5px] text-muted">{x.note}</p>}
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}

function AnalyticsSection({ resourceId }: { resourceId: string }) {
  const q = useQuery({
    queryKey: ['create', 'resource', resourceId, 'analytics'],
    queryFn: () => api.get<{ analytics: Analytics; ratingDistribution: { rating: number; count: number }[] }>(`/create/resources/${resourceId}/analytics`),
  });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data)
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-lg" />
        ))}
      </div>
    );
  const a = q.data.analytics;
  const max = Math.max(0, ...q.data.ratingDistribution.map((d) => d.count));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatTile label="Views" value={a.views.toLocaleString()} icon={<EyeIcon />} />
        <StatTile label="Rating" value={a.ratingAvg !== null ? a.ratingAvg.toFixed(1) : 'None'} hint={`${a.ratingCount} ${a.ratingCount === 1 ? 'rating' : 'ratings'}`} icon={<StarIcon />} />
        <StatTile label="Completions" value={a.completions} hint="Self-reported" icon={<CheckCircleIcon />} />
        <StatTile label="Readers" value={a.readers} icon={<UsersIcon />} />
        <StatTile label="Bookmarks" value={a.bookmarks} icon={<BookmarkSimpleIcon />} />
        <StatTile label="Open reports" value={a.openReports} tone={a.openReports ? 'warning' : undefined} icon={<FlagIcon />} />
      </div>
      <Card>
        <CardHeader title="Rating distribution" />
        <CardBody className="space-y-2">
          {a.ratingCount === 0 ? (
            <p className="text-[13px] text-muted">No ratings yet.</p>
          ) : (
            [...q.data.ratingDistribution].reverse().map((d) => <Bar key={d.rating} label={`${d.rating} ${d.rating === 1 ? 'star' : 'stars'}`} value={d.count} max={max} />)
          )}
        </CardBody>
      </Card>
    </div>
  );
}
