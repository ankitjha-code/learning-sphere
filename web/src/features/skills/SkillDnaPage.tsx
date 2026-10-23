import { useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { DnaIcon, ListIcon, GraphIcon, SealCheckIcon, InfoIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { PageHeader, ErrorState, Skeleton, Segmented, Select, Badge, Progress, Card, EmptyState, ButtonLink } from '@/components/ui';

export type SkillState = 'verified' | 'demonstrated' | 'learning' | 'needs_revision' | 'self_declared' | 'not_started';
export type SkillDna = {
  skillId: string;
  slug: string;
  name: string;
  category: string;
  level: number;
  mastery: number | null;
  confidence: number;
  state: SkillState;
  verified: boolean;
  evidenceCount: number;
  bySource: Record<string, { count: number; avg: number }>;
  lastEvidenceAt: string | null;
  lastVerifiedAt: string | null;
  selfRating: number | null;
  prereqIds: string[];
  dueRevisions: number;
  inProgressTopics: number;
};

export const STATE_META: Record<SkillState, { label: string; description: string; swatch: string; text: string }> = {
  verified: { label: 'Verified', description: 'Proven by graded work or a reviewer', swatch: 'bg-success', text: 'text-success' },
  demonstrated: { label: 'Demonstrated', description: 'Shown in practice, quizzes or projects', swatch: 'bg-accent', text: 'text-accent-text' },
  learning: { label: 'Learning', description: 'In progress or below 60%', swatch: 'bg-info', text: 'text-info' },
  needs_revision: { label: 'Needs revision', description: 'Revision due or evidence is getting old', swatch: 'bg-warning', text: 'text-warning' },
  self_declared: { label: 'Self-reported', description: 'Only your own rating so far', swatch: 'bg-border-strong', text: 'text-muted' },
  not_started: { label: 'Not started', description: 'No evidence yet', swatch: 'bg-surface-3', text: 'text-subtle' },
};

export const CATEGORY_LABEL: Record<string, string> = {
  programming: 'Programming',
  web: 'Web',
  dsa: 'Data structures & algorithms',
  design: 'Software design',
  'system-design': 'System design',
  databases: 'Databases',
  'cs-fundamentals': 'CS fundamentals',
  devops: 'DevOps & cloud',
  'ai-ml': 'AI, ML & data',
  math: 'Math & reasoning',
  quality: 'Testing & security',
  collaboration: 'Collaboration',
  professional: 'Professional skills',
  career: 'Career',
};

/** Quiet node styles: a soft fill per state, with a matching dot so the state never relies on fill alone. */
const NODE_CLASS: Record<SkillState, string> = {
  verified: 'border-success/30 bg-success-soft',
  demonstrated: 'border-accent/30 bg-accent-soft',
  learning: 'border-info/30 bg-info-soft',
  needs_revision: 'border-warning/30 bg-warning-soft',
  self_declared: 'border-dashed border-border-strong bg-surface',
  not_started: 'border-border bg-surface-2 text-muted',
};

type Link2 = { key: string; d: string };

/** Depth of each skill in the prerequisite graph, so every strand runs from foundations to what builds on them. */
function useStrands(skills: SkillDna[]) {
  return useMemo(() => {
    const byId = new Map(skills.map((s) => [s.skillId, s]));
    const depth = new Map<string, number>();
    const depthOf = (id: string, seen = new Set<string>()): number => {
      if (depth.has(id)) return depth.get(id)!;
      if (seen.has(id)) return 0;
      seen.add(id);
      const prereqs = byId.get(id)?.prereqIds.filter((p) => byId.has(p)) ?? [];
      const d = prereqs.length ? 1 + Math.max(...prereqs.map((p) => depthOf(p, seen))) : 0;
      depth.set(id, d);
      return d;
    };
    const cats = [...new Set(skills.map((s) => s.category))];
    return cats.map((cat) => ({
      cat,
      skills: skills.filter((s) => s.category === cat).sort((a, b) => depthOf(a.skillId) - depthOf(b.skillId) || a.level - b.level || a.name.localeCompare(b.name)),
    }));
  }, [skills]);
}

function DnaMap({ skills, filter }: { skills: SkillDna[]; filter: SkillState | 'all' }) {
  const strands = useStrands(skills);
  const markerId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLAnchorElement>());
  const [active, setActive] = useState<{ id: string; related: Set<string>; links: Link2[] } | null>(null);

  // Connections are drawn only for the skill you point at or focus, so the map stays readable at rest.
  const activate = (id: string) => {
    const box = boxRef.current?.getBoundingClientRect();
    const s = skills.find((x) => x.skillId === id);
    if (!box || !s) return;
    const related = new Set<string>([id]);
    const pairs: [string, string][] = [];
    s.prereqIds.forEach((p) => {
      if (nodes.current.has(p)) {
        related.add(p);
        pairs.push([p, id]);
      }
    });
    skills.forEach((x) => {
      if (x.prereqIds.includes(id)) {
        related.add(x.skillId);
        pairs.push([id, x.skillId]);
      }
    });
    const rect = (k: string) => {
      const r = nodes.current.get(k)!.getBoundingClientRect();
      return { l: r.left - box.left, r: r.right - box.left, cy: r.top - box.top + r.height / 2 };
    };
    const links = pairs.map(([from, to]) => {
      const a = rect(from);
      const b = rect(to);
      let d: string;
      if (Math.abs(a.l - b.l) < 4) {
        // Same strand: a short arc in the gutter to the left of the column.
        const bulge = Math.min(18, 8 + Math.abs(b.cy - a.cy) / 12);
        d = `M ${a.l} ${a.cy} C ${a.l - bulge} ${a.cy}, ${b.l - bulge} ${b.cy}, ${b.l - 2} ${b.cy}`;
      } else if (a.l < b.l) {
        const mid = (a.r + b.l) / 2;
        d = `M ${a.r} ${a.cy} C ${mid} ${a.cy}, ${mid} ${b.cy}, ${b.l - 2} ${b.cy}`;
      } else {
        const mid = (a.l + b.r) / 2;
        d = `M ${a.l} ${a.cy} C ${mid} ${a.cy}, ${mid} ${b.cy}, ${b.r + 2} ${b.cy}`;
      }
      return { key: `${from}-${to}`, d };
    });
    setActive({ id, related, links });
  };
  const clear = () => setActive(null);

  return (
    <Card className="p-5">
      <p className="mb-4 flex items-start gap-1.5 text-[12.5px] text-muted">
        <InfoIcon size={14} className="mt-0.5 shrink-0" aria-hidden />
        Each strand is a category, ordered from foundations at the top to the skills that build on them. Point at or focus a skill to trace what it builds on and what it unlocks.
      </p>
      <div ref={boxRef} className="relative" role="group" aria-label="Skill DNA map: skills grouped by category with prerequisite links" onMouseLeave={clear}>
        <div className="gap-x-6 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5">
          {strands.map(({ cat, skills: list }) => (
            <div key={cat} role="group" aria-label={CATEGORY_LABEL[cat] ?? cat} className="mb-6 break-inside-avoid">
              <div className="mb-2 flex items-baseline justify-between gap-2 px-0.5">
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-subtle">{CATEGORY_LABEL[cat] ?? cat}</span>
                <span className="text-[11.5px] tabular-nums text-subtle">{list.length}</span>
              </div>
              <ul className="space-y-1.5">
                {list.map((s) => {
                  const dim = (filter !== 'all' && s.state !== filter) || (active && !active.related.has(s.skillId));
                  const pct = s.mastery !== null ? Math.round(s.mastery * 100) : null;
                  return (
                    <li key={s.skillId}>
                      <Link
                        ref={(el) => {
                          if (el) nodes.current.set(s.skillId, el);
                          else nodes.current.delete(s.skillId);
                        }}
                        to={`/app/skills/${s.slug}`}
                        onMouseEnter={() => activate(s.skillId)}
                        onFocus={() => activate(s.skillId)}
                        onBlur={clear}
                        className={clsx(
                          'relative z-10 flex min-h-9 items-center gap-2 overflow-hidden rounded-md border px-2.5 py-1.5 text-[13px] leading-[1.3] transition-[opacity,border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-1',
                          NODE_CLASS[s.state],
                          active?.id === s.skillId && 'border-accent! shadow-1',
                          dim && 'opacity-35',
                        )}
                      >
                        <span className={clsx('h-2 w-2 shrink-0 rounded-full', STATE_META[s.state].swatch, s.state === 'not_started' && 'ring-1 ring-inset ring-border-strong')} aria-hidden />
                        <span className={clsx('min-w-0 flex-1', s.state !== 'not_started' && 'font-medium')}>{s.name}</span>
                        {s.verified && <SealCheckIcon size={14} weight="fill" className="shrink-0 text-success" aria-hidden />}
                        {pct !== null && <span className="shrink-0 text-[11.5px] font-medium tabular-nums text-muted">{pct}%</span>}
                        {pct !== null && <span className={clsx('absolute inset-x-0 bottom-0 h-0.5 origin-left', STATE_META[s.state].swatch)} style={{ transform: `scaleX(${s.mastery})` }} aria-hidden />}
                        {/* State last, so the accessible name starts with exactly the visible text. */}
                        <span className="sr-only">, {STATE_META[s.state].label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        {active && active.links.length > 0 && (
          <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible" aria-hidden>
            <defs>
              <marker id={markerId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--accent)" />
              </marker>
            </defs>
            {active.links.map((l) => (
              <path key={l.key} d={l.d} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinecap="round" opacity={0.75} markerEnd={`url(#${markerId})`} />
            ))}
          </svg>
        )}
      </div>
    </Card>
  );
}

function DnaList({ skills }: { skills: SkillDna[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-1">
      <table className="w-full text-[13.5px]">
        <thead className="border-b border-border bg-surface-2 text-left text-[12px] text-muted">
          <tr>
            <th className="px-4 py-2.5 font-medium">Skill</th>
            <th className="px-4 py-2.5 font-medium">State</th>
            <th className="px-4 py-2.5 font-medium">Mastery</th>
            <th className="hidden px-4 py-2.5 font-medium md:table-cell">Confidence</th>
            <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Evidence</th>
            <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Last evidence</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {skills.map((s) => (
            <tr key={s.skillId} className="transition-colors hover:bg-surface-2">
              <td className="px-4 py-3">
                <Link to={`/app/skills/${s.slug}`} className="font-medium hover:text-accent-text">
                  {s.name}
                </Link>
                <div className="text-[12px] text-subtle">{CATEGORY_LABEL[s.category] ?? s.category}</div>
              </td>
              <td className="px-4 py-3">
                <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium', STATE_META[s.state].text)}>
                  <span className={clsx('h-2 w-2 rounded-full', STATE_META[s.state].swatch, s.state === 'not_started' && 'ring-1 ring-inset ring-border-strong')} />
                  {STATE_META[s.state].label}
                  {s.verified && <SealCheckIcon size={14} weight="fill" className="text-success" aria-label="Has verified evidence" />}
                </span>
              </td>
              <td className="w-44 px-4 py-3">
                {s.mastery === null ? (
                  <span className="text-subtle">Not yet</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <Progress value={s.mastery * 100} className="w-20" label={`${s.name} mastery`} />
                    <span className="tabular-nums text-muted">{Math.round(s.mastery * 100)}%</span>
                  </div>
                )}
              </td>
              <td className="hidden px-4 py-3 tabular-nums text-muted md:table-cell">{s.evidenceCount ? `${Math.round(s.confidence * 100)}%` : <span className="text-subtle">Not yet</span>}</td>
              <td className="hidden px-4 py-3 tabular-nums text-muted sm:table-cell">{s.evidenceCount}</td>
              <td className="hidden px-4 py-3 text-muted lg:table-cell">{s.lastEvidenceAt ? timeAgo(s.lastEvidenceAt) : <span className="text-subtle">Never</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CHIP = 'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors';

export default function SkillDnaPage() {
  const [view, setView] = useState<'map' | 'list'>('map');
  const [filter, setFilter] = useState<SkillState | 'all'>('all');
  const [category, setCategory] = useState('all');
  const q = useQuery({ queryKey: ['skill-dna'], queryFn: () => api.get<{ skills: SkillDna[]; counts: Record<string, number> }>('/learning/skills') });

  const skills = useMemo(() => (q.data?.skills ?? []).filter((s) => category === 'all' || s.category === category), [q.data, category]);
  const listed = useMemo(
    () => skills.filter((s) => filter === 'all' || s.state === filter).sort((a, b) => (b.mastery ?? -1) - (a.mastery ?? -1) || a.name.localeCompare(b.name)),
    [skills, filter],
  );
  const hasEvidence = (q.data?.skills ?? []).some((s) => s.evidenceCount > 0);

  return (
    <div>
      <PageHeader
        title="Skill DNA"
        description="A living map of what you can do. Every topic quiz, CodeLab submission, assessment, project and review adds evidence. AI never verifies a skill."
        actions={
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: 'map', label: <span className="inline-flex items-center gap-1"><GraphIcon size={14} /> Map</span> },
              { value: 'list', label: <span className="inline-flex items-center gap-1"><ListIcon size={14} /> List</span> },
            ]}
          />
        }
      />

      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <Skeleton className="h-[480px] rounded-lg" />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex flex-1 flex-wrap items-center gap-2" role="group" aria-label="Filter by state">
              <button
                onClick={() => setFilter('all')}
                className={clsx(CHIP, filter === 'all' ? 'border-accent bg-accent-soft text-accent-text' : 'border-border bg-surface text-muted hover:border-border-strong hover:text-fg')}
                aria-pressed={filter === 'all'}
              >
                All <span className="tabular-nums text-subtle">{q.data!.skills.length}</span>
              </button>
              {(Object.keys(STATE_META) as SkillState[]).map((st) => (
                <button
                  key={st}
                  onClick={() => setFilter(filter === st ? 'all' : st)}
                  aria-pressed={filter === st}
                  title={STATE_META[st].description}
                  className={clsx(CHIP, filter === st ? 'border-accent bg-accent-soft text-fg' : 'border-border bg-surface text-muted hover:border-border-strong hover:text-fg')}
                >
                  <span className={clsx('h-2 w-2 rounded-full', STATE_META[st].swatch, st === 'not_started' && 'ring-1 ring-inset ring-border-strong')} aria-hidden />
                  {STATE_META[st].label} <span className="tabular-nums text-subtle">{q.data!.counts[st] ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="w-full shrink-0 sm:w-56">
              <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
                <option value="all">All categories</option>
                {[...new Set(q.data!.skills.map((s) => s.category))].map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c] ?? c}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {!hasEvidence && (
            <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
                <DnaIcon size={20} />
              </span>
              <div className="flex-1 text-[13.5px]">
                <div className="font-semibold">Your Skill DNA fills in as you work</div>
                <div className="mt-0.5 text-muted">Pass a topic quiz, solve a CodeLab problem or take a diagnostic to add your first piece of evidence.</div>
              </div>
              <ButtonLink to="/app/assessments?mode=diagnostic" variant="primary">
                Take a diagnostic
              </ButtonLink>
            </Card>
          )}

          {view === 'map' ? <DnaMap skills={skills} filter={filter} /> : listed.length ? <DnaList skills={listed} /> : <EmptyState icon={<DnaIcon size={22} />} title="No skills match" description="Try another state or category filter." />}

          <p className="flex items-start gap-1.5 text-[12.5px] leading-relaxed text-subtle">
            <InfoIcon size={14} className="mt-0.5 shrink-0" aria-hidden />
            Mastery is a weighted average: reviewer-confirmed projects count most, then graded assessments, tested CodeLab solutions, topic quizzes, and self-ratings least. Evidence older than four months gradually counts less, which is what triggers revision.
          </p>
        </div>
      )}
    </div>
  );
}

export function StateBadge({ state }: { state: SkillState }) {
  const tone = ({ verified: 'success', demonstrated: 'accent', learning: 'info', needs_revision: 'warning', self_declared: 'neutral', not_started: 'neutral' } as const)[state];
  return <Badge tone={tone}>{STATE_META[state].label}</Badge>;
}
