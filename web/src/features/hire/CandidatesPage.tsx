import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MagnifyingGlassIcon, UserPlusIcon, UsersIcon } from '@phosphor-icons/react';
import { api, errorMessage, qs } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { Avatar, Badge, Button, buttonClass, Card, Dialog, EmptyState, ErrorState, Field, Input, PageHeader, Pagination, Segmented, Select, SkeletonRows, StatusBadge, Tabs, Textarea } from '@/components/ui';
import { SOURCE_LABEL, useJobs, type AppRow } from './api';
import { EvidenceBadge, FairnessNote, listGroup, MatchScore } from './components';

function ApplicationsTab() {
  const jobs = useJobs('open');
  const [f, setF] = useState({ postingId: '', status: 'active', source: '', q: '', sort: 'recent' });
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['hire', 'applications', f, page],
    queryFn: () => api.get<{ items: AppRow[]; total: number; page: number; pageSize: number; canManage: boolean }>(`/hire/applications${qs({ ...f, page, pageSize: 25 })}`),
  });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 sm:w-64">
          <MagnifyingGlassIcon size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
          <Input
            aria-label="Search by name or job"
            placeholder="Search by name or job"
            className="w-full pl-8 sm:w-64"
            value={f.q}
            onChange={(e) => {
              setF({ ...f, q: e.target.value });
              setPage(1);
            }}
          />
        </div>
        <Select
          aria-label="Job"
          className="w-full sm:w-56"
          value={f.postingId}
          onChange={(e) => {
            setF({ ...f, postingId: e.target.value });
            setPage(1);
          }}
        >
          <option value="">All jobs</option>
          {(jobs.data?.items ?? []).map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Status"
          className="w-full sm:w-36"
          value={f.status}
          onChange={(e) => {
            setF({ ...f, status: e.target.value });
            setPage(1);
          }}
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="hired">Hired</option>
          <option value="rejected">Rejected</option>
          <option value="withdrawn">Withdrawn</option>
          <option value="declined">Declined offer</option>
        </Select>
        <Select
          aria-label="Source"
          className="w-full sm:w-40"
          value={f.source}
          onChange={(e) => {
            setF({ ...f, source: e.target.value });
            setPage(1);
          }}
        >
          <option value="">Any source</option>
          {Object.entries(SOURCE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <div className="col-span-2 sm:ml-auto">
          <Segmented
            label="Sort"
            value={f.sort as 'recent' | 'match'}
            onChange={(v) => setF({ ...f, sort: v })}
            options={[
              { value: 'recent', label: 'Recent' },
              { value: 'match', label: 'Skill match' },
            ]}
          />
        </div>
      </div>
      {q.isLoading ? (
        <SkeletonRows rows={6} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.items.length ? (
        <EmptyState
          icon={<UsersIcon size={22} />}
          title="No applications found"
          description={q.data?.canManage === false ? 'You see candidates for interviews you are assigned to. None yet.' : 'Applications to your jobs appear here. Try clearing filters.'}
        />
      ) : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13.5px]">
              <thead>
                <tr className="border-b border-border bg-surface-2/60 text-left text-[12px] text-muted">
                  <th className="px-4 py-2.5 font-medium">Candidate</th>
                  <th className="px-4 py-2.5 font-medium">Job</th>
                  <th className="px-4 py-2.5 font-medium">Stage</th>
                  <th className="px-4 py-2.5 font-medium">Match</th>
                  <th className="px-4 py-2.5 font-medium">Source</th>
                  <th className="px-4 py-2.5 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <Link to={`/app/hire/candidates/${a.id}`} className="font-medium hover:underline">
                        {a.candidate.name}
                      </Link>
                      {a.unread > 0 && (
                        <Badge tone="warning" className="ml-2">
                          {a.unread} unread
                        </Badge>
                      )}
                      {a.candidate.headline && <div className="text-[12px] text-muted">{a.candidate.headline}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/app/hire/jobs/${a.postingId}`} className="hover:underline">
                        {a.jobTitle}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.stage} />
                    </td>
                    <td className="px-4 py-3">
                      <MatchScore score={a.match.score} />
                    </td>
                    <td className="px-4 py-3 text-muted">{SOURCE_LABEL[a.source] ?? a.source}</td>
                    <td className="px-4 py-3 text-muted">{timeAgo(a.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Pagination page={page} pageSize={25} total={q.data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

type SearchResult = {
  userId: string;
  name: string;
  headline: string | null;
  location: string | null;
  graduationYears: number[];
  skills: { slug: string; name: string; evidence: string; detail: string }[];
  strongestSkills: { slug: string; name: string; evidence: string }[];
  score: number | null;
  portfolioUrl: string | null;
  relation: { applied: boolean; discoverable: boolean; campusDrive: boolean };
};

function InviteDialog({ person, onOpenChange }: { person: SearchResult | null; onOpenChange: (v: boolean) => void }) {
  const jobs = useJobs('published');
  const [postingId, setPostingId] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    setPostingId('');
    setMessage('');
  }, [person]);
  const m = useMutation({
    mutationFn: () => api.post(`/hire/candidates/${person!.userId}/invite`, { postingId, message: message || null }),
    onSuccess: () => {
      toast.success(`Invitation sent to ${person!.name}. Applying is their choice.`);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open={!!person}
      onOpenChange={onOpenChange}
      title={`Invite ${person?.name ?? ''} to apply`}
      description="They get a notification with a link to the job. The invitation is recorded in the audit log."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={!postingId} disabledReason="Choose a published job" onClick={() => m.mutate()}>
            Send invitation
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Job">
          <Select value={postingId} onChange={(e) => setPostingId(e.target.value)}>
            <option value="">Choose a published job</option>
            {(jobs.data?.items ?? []).map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Message" optional helper="Explain why their demonstrated skills fit the role.">
          <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} />
        </Field>
      </div>
    </Dialog>
  );
}

function SearchTab() {
  const [form, setForm] = useState({ skills: '', minEvidence: 'demonstrated', graduationYear: '', location: '' });
  const [applied, setApplied] = useState(form);
  const [page, setPage] = useState(1);
  const [invite, setInvite] = useState<SearchResult | null>(null);
  const q = useQuery({
    queryKey: ['hire', 'search', applied, page],
    queryFn: () => api.get<{ items: SearchResult[]; total: number; note: string }>(`/hire/candidates/search${qs({ ...applied, page, pageSize: 20 })}`),
  });
  return (
    <div className="space-y-4">
      <p className="text-[13.5px] text-muted">
        Search covers only people who opted in to recruiter search, people who applied to your jobs, and students invited to campus drives for your postings. Contact details are never shown; use invitations and application messages.
      </p>
      <Card>
        <form
          className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-[2fr_1.2fr_1fr_1fr_auto] lg:items-start"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied(form);
            setPage(1);
          }}
        >
          <Field label="Skills" helper="Skill keys separated by commas, e.g. python, sql-basics">
            <Input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} />
          </Field>
          <Field label="Evidence">
            <Select value={form.minEvidence} onChange={(e) => setForm({ ...form, minEvidence: e.target.value })}>
              <option value="demonstrated">Demonstrated or verified</option>
              <option value="any">Any evidence</option>
            </Select>
          </Field>
          <Field label="Graduation year" optional>
            <Input type="number" value={form.graduationYear} onChange={(e) => setForm({ ...form, graduationYear: e.target.value })} />
          </Field>
          <Field label="Location" optional>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </Field>
          <Button type="submit" variant="primary" icon={<MagnifyingGlassIcon size={15} />} className="lg:mt-[26px]">
            Search
          </Button>
        </form>
      </Card>
      <FairnessNote />
      {q.isLoading ? (
        <SkeletonRows rows={5} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.items.length ? (
        <EmptyState icon={<MagnifyingGlassIcon size={22} />} title="No matching candidates" description="Nobody in your authorized pool has evidence for these skills yet. Try 'Any evidence' or fewer skills." />
      ) : (
        <>
          <ul className={listGroup}>
            {q.data.items.map((p) => (
              <li key={p.userId} className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-start md:justify-between md:gap-8">
                <div className="flex min-w-0 items-start gap-3">
                  <Avatar name={p.name} size={36} />
                  <div className="min-w-0">
                    <div className="text-[14.5px] font-semibold tracking-[-0.005em]">{p.name}</div>
                    <div className="text-[12.5px] text-muted">{[p.headline, p.location, p.graduationYears.length ? `Graduates ${p.graduationYears.join(', ')}` : null].filter(Boolean).join(' · ')}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.relation.applied && <Badge tone="info">Applied to your jobs</Badge>}
                      {p.relation.campusDrive && <Badge tone="info">Campus drive</Badge>}
                      {p.relation.discoverable && <Badge>Open to recruiters</Badge>}
                    </div>
                    {p.skills.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
                        {p.skills.map((s) => (
                          <li key={s.slug} className="inline-flex items-center gap-1.5">
                            <span>{s.name}</span>
                            <EvidenceBadge evidence={s.evidence} />
                          </li>
                        ))}
                      </ul>
                    )}
                    {p.strongestSkills.length > 0 && <div className="mt-2 text-[12.5px] text-muted">Strongest evidence: {p.strongestSkills.map((s) => s.name).join(', ')}</div>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3 pl-12 md:flex-col md:items-end md:pl-0">
                  {p.score !== null && <MatchScore score={p.score} className="text-[18px]" />}
                  <div className="flex flex-wrap gap-2">
                    {p.portfolioUrl && (
                      <a href={p.portfolioUrl} target="_blank" rel="noopener noreferrer" className={buttonClass('ghost', 'sm')}>
                        Public portfolio
                      </a>
                    )}
                    <Button size="sm" icon={<UserPlusIcon size={14} />} onClick={() => setInvite(p)}>
                      Invite to apply
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={20} total={q.data.total} onPage={setPage} />
        </>
      )}
      <InviteDialog person={invite} onOpenChange={(v) => !v && setInvite(null)} />
    </div>
  );
}

export default function CandidatesPage() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const tab = params.get('tab') ?? 'applications';
  const deepLink = params.get('application');
  useEffect(() => {
    // Notifications link here with ?application=<id>; open that profile.
    if (deepLink) nav(`/app/hire/candidates/${deepLink}`, { replace: true });
  }, [deepLink, nav]);
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Candidates" description="Every application across your jobs, and a consent-based search for new candidates." />
      <Tabs
        value={tab}
        onValueChange={(v) => setParams({ tab: v })}
        tabs={[
          { value: 'applications', label: 'Applications' },
          { value: 'search', label: 'Search' },
        ]}
      />
      {tab === 'search' ? <SearchTab /> : <ApplicationsTab />}
    </div>
  );
}
