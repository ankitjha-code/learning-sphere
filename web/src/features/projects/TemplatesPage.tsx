import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MagnifyingGlassIcon, ClockIcon, GraduationCapIcon, SparkleIcon, SquaresFourIcon, CaretLeftIcon } from '@phosphor-icons/react';
import { api, qs } from '@/lib/api';
import clsx from 'clsx';
import { PageHeader, Section, Card, Badge, Input, Select, Switch, EmptyState, ErrorState, Skeleton, Button } from '@/components/ui';
import { CATEGORY_LABELS, type TemplateSummary } from './types';

type SkillDna = { skills: { slug: string; name: string; state: string }[] };

function TemplateCard({ t, reason }: { t: TemplateSummary; reason?: string }) {
  return (
    <Link to={`/app/projects/templates/${t.slug}`} className="group block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2">
      <Card className="flex h-full flex-col p-5 transition-colors group-hover:border-border-strong group-hover:shadow-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge>{CATEGORY_LABELS[t.category] ?? t.category}</Badge>
          <Badge tone={t.difficulty === 'beginner' ? 'success' : t.difficulty === 'advanced' ? 'danger' : 'warning'}>{t.difficulty.charAt(0).toUpperCase() + t.difficulty.slice(1)}</Badge>
          {t.isCapstone && (
            <Badge tone="accent" icon={<GraduationCapIcon size={12} />}>
              Capstone
            </Badge>
          )}
        </div>
        <h3 className="mt-3 text-[15px] font-semibold leading-snug tracking-[-0.01em] group-hover:text-accent-text">{t.title}</h3>
        <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-muted">{t.summary}</p>
        {reason && (
          <p className="mt-3 flex items-start gap-1.5 rounded-md bg-accent-soft px-2.5 py-2 text-[12.5px] leading-snug text-accent-text">
            <SparkleIcon size={13} className="mt-px shrink-0" aria-hidden />
            {reason}
          </p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-[12.5px] text-subtle">
          <span className="inline-flex items-center gap-1">
            <ClockIcon size={13} aria-hidden />
            About {t.estimatedHours} h
          </span>
          <span>{t.requirementCount} requirements</span>
          <span>{t.milestoneCount} milestones</span>
        </div>
      </Card>
    </Link>
  );
}

export default function TemplatesPage() {
  const [category, setCategory] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [capstoneOnly, setCapstoneOnly] = useState(false);
  const [q, setQ] = useState('');
  const filters = { category, difficulty, capstone: capstoneOnly ? 'true' : undefined, q: q.trim() || undefined };
  const list = useQuery({ queryKey: ['project-templates', filters], queryFn: () => api.get<{ items: TemplateSummary[] }>(`/projects/templates${qs(filters)}`), staleTime: 120_000 });
  const all = useQuery({ queryKey: ['project-templates', {}], queryFn: () => api.get<{ items: TemplateSummary[] }>('/projects/templates'), staleTime: 300_000 });
  const dna = useQuery({ queryKey: ['skills'], queryFn: () => api.get<SkillDna>('/learning/skills'), staleTime: 60_000 });

  const recommended = useMemo(() => {
    if (!dna.data || !all.data) return [];
    const demonstrated = new Map(dna.data.skills.filter((s) => s.state === 'demonstrated' || s.state === 'verified').map((s) => [s.slug, s.name]));
    const learning = new Map(dna.data.skills.filter((s) => s.state === 'learning' || s.state === 'needs_revision').map((s) => [s.slug, s.name]));
    return all.data.items
      .map((t) => {
        const builds = t.skillSlugs.filter((s) => demonstrated.has(s)).map((s) => demonstrated.get(s)!);
        const grows = t.skillSlugs.filter((s) => learning.has(s)).map((s) => learning.get(s)!);
        const score = builds.length * 2 + grows.length - (t.isCapstone ? 1 : 0);
        const parts: string[] = [];
        if (builds.length) parts.push(`builds on ${builds.slice(0, 3).join(', ')} you have demonstrated`);
        if (grows.length) parts.push(`practises ${grows.slice(0, 3).join(', ')} you are learning`);
        return { t, score, reason: parts.length ? `Recommended: ${parts.join(' and ')}.` : '' };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [dna.data, all.data]);

  const filtering = !!(category || difficulty || capstoneOnly || q.trim());

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/projects" className="inline-flex items-center gap-1 hover:text-fg">
            <CaretLeftIcon size={12} /> Projects
          </Link>
        }
        title="Project templates"
        description="Real-world briefs with requirements, acceptance criteria and milestones. Pick one, choose how much guidance you want, and make it yours."
      />
      {!filtering && recommended.length > 0 && (
        <Section title="Recommended for you" description="Matched to the skills in your Skill DNA." className="mb-8">
          <div className={clsx('grid gap-4', recommended.length === 2 && 'md:grid-cols-2', recommended.length >= 3 && 'md:grid-cols-3')}>
            {recommended.map((r) => (
              <TemplateCard key={r.t.slug} t={r.t} reason={r.reason} />
            ))}
          </div>
        </Section>
      )}
      <Section title="All templates">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
          <Input aria-label="Search templates" placeholder="Search templates" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-44">
            <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-36">
            <Select aria-label="Difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="">Any difficulty</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </Select>
          </div>
          <Switch checked={capstoneOnly} onCheckedChange={setCapstoneOnly} label="Capstones only" />
        </div>
      </div>
      {list.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data?.items.length ? (
        <EmptyState
          icon={<SquaresFourIcon size={22} />}
          title="No templates match"
          description="Try a different category or clear the search."
          action={
            <Button
              onClick={() => {
                setCategory('');
                setDifficulty('');
                setCapstoneOnly(false);
                setQ('');
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.data.items.map((t) => (
            <TemplateCard key={t.slug} t={t} />
          ))}
        </div>
      )}
      </Section>
    </div>
  );
}
