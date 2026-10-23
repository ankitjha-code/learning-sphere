import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { PlusIcon, TrashIcon, MagnifyingGlassIcon, UsersIcon, ArrowUpIcon, ArrowDownIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { Badge, Button, Checkbox, Dialog, EmptyState, ErrorState, Input, SkeletonRows } from '@/components/ui';

// ---------- Layout classes shared by every Teach page ----------

/** One list group: a single bordered surface with divided rows (rows use px-5 py-4). */
export const LIST_GROUP = 'divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1';
/** Data tables: same header, row height and padding on every Teach page. */
export const TABLE_WRAP = 'overflow-x-auto rounded-lg border border-border bg-surface shadow-1';
export const THEAD = 'border-b border-border bg-surface-2 text-left text-[12px] text-muted';
export const TH = 'h-10 px-4 font-medium whitespace-nowrap';
export const TR = 'border-b border-border transition-colors last:border-0 hover:bg-surface-2';
export const TD = 'px-4 py-3';

// ---------- Types shared by faculty and student screens ----------

export type RubricLevel = { label: string; points: number; description?: string };
export type RubricCriterion = { id: string; title: string; description?: string; levels: RubricLevel[] };
export type LatePolicy = { allowLate: boolean; penaltyPercentPerDay?: number; hardCutoffDays?: number | null };
export type WorkStatus = 'not_started' | 'draft' | 'submitted' | 'late' | 'graded' | 'returned';
export type RubricScore = { criterionId: string; levelLabel: string; points: number; comment?: string };
export type Lookups = {
  skills: { id: string; slug: string; name: string; category: string }[];
  tracks: { id: string; slug: string; title: string; scope: 'global' | 'org'; status: string }[];
  terms: { id: string; name: string; isCurrent: boolean }[];
  programs: { id: string; name: string; code: string }[];
};
export type Person = { userId: string; name: string; email: string; roles: string[] };

export const WORK_STATUS: Record<WorkStatus, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }> = {
  not_started: { label: 'Not started', tone: 'neutral' },
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'Submitted', tone: 'info' },
  late: { label: 'Submitted late', tone: 'warning' },
  graded: { label: 'Graded', tone: 'success' },
  returned: { label: 'Returned for revision', tone: 'warning' },
};

export function WorkStatusBadge({ status }: { status: WorkStatus }) {
  const s = WORK_STATUS[status] ?? WORK_STATUS.not_started;
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function rubricMax(criteria: RubricCriterion[]) {
  return criteria.reduce((s, c) => s + Math.max(0, ...c.levels.map((l) => l.points)), 0);
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Plain-language late policy with a worked example (mirrors the server's rule: started days after the due time). */
export function latePolicyExplain(p: LatePolicy, maxPoints = 100) {
  if (!p.allowLate) return { summary: 'Late submissions are not accepted. Submissions close at the due time.', example: null as string | null };
  const per = p.penaltyPercentPerDay ?? 0;
  const cutoff = p.hardCutoffDays !== undefined && p.hardCutoffDays !== null ? p.hardCutoffDays : null;
  const parts = [per > 0 ? `Late work loses ${per}% of its score for each started day after the due time` : 'Late work is accepted with no penalty'];
  parts.push(cutoff !== null ? `submissions close ${cutoff} day${cutoff === 1 ? '' : 's'} after the due time` : 'there is no final cutoff');
  const sample = round2(maxPoints * 0.8);
  const example = per > 0 ? `Example: work submitted 30 hours late counts as 2 days late. A score of ${sample} out of ${maxPoints} becomes ${round2(sample * (1 - Math.min(100, 2 * per) / 100))}.` : null;
  return { summary: parts.join('; ') + '.', example };
}

export function pctText(v: number | null | undefined, digits = 0) {
  if (v === null || v === undefined) return 'No data';
  return `${v.toFixed(digits)}%`;
}

export function ratioText(v: number | null | undefined) {
  if (v === null || v === undefined) return 'No data';
  return `${Math.round(v * 100)}%`;
}

export function NoData({ children = 'No data' }: { children?: ReactNode }) {
  return <span className="text-subtle">{children}</span>;
}

export function useLookups() {
  return useQuery({ queryKey: ['teach', 'lookups'], queryFn: () => api.get<Lookups>('/teach/lookups'), staleTime: 300_000 });
}

export function usePeople(role: 'student' | 'faculty' | 'faculty_admin') {
  return useQuery({ queryKey: ['org', 'people', role], queryFn: () => api.get<{ people: Person[] }>(`/org/people?role=${role}`), staleTime: 60_000 });
}

/** Opens a CSV export (server checks permission; the browser sends the session cookie). */
export function csvHref(path: string) {
  return `/api/teach${path}`;
}

// ---------- Rubric preview ----------

export function RubricTable({ criteria, selected, compact }: { criteria: RubricCriterion[]; selected?: RubricScore[]; compact?: boolean }) {
  const max = rubricMax(criteria);
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[520px] text-left text-[13px]">
        <caption className="sr-only">Rubric criteria and levels, {max} points in total</caption>
        <thead className="bg-surface-2 text-[12px] text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Criterion</th>
            <th scope="col" className="px-3 py-2 font-medium">Levels</th>
            {selected && <th scope="col" className="px-3 py-2 text-right font-medium">Awarded</th>}
          </tr>
        </thead>
        <tbody>
          {criteria.map((c) => {
            const pick = selected?.find((s) => s.criterionId === c.id);
            const top = Math.max(0, ...c.levels.map((l) => l.points));
            return (
              <tr key={c.id} className="border-t border-border align-top">
                <th scope="row" className="w-1/4 px-3 py-2.5 font-medium">
                  {c.title}
                  {!compact && c.description && <div className="mt-0.5 text-[12px] font-normal text-muted">{c.description}</div>}
                </th>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {c.levels.map((l) => (
                      <span
                        key={l.label}
                        title={l.description}
                        className={clsx('rounded-md border px-2 py-1 text-[12px]', pick?.levelLabel === l.label ? 'border-accent bg-accent-soft text-accent-text' : 'border-border text-muted')}
                      >
                        {l.label} · {l.points}
                      </span>
                    ))}
                  </div>
                  {pick?.comment && <p className="mt-1.5 text-[12.5px] text-fg">{pick.comment}</p>}
                </td>
                {selected && (
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {pick ? `${pick.points} / ${top}` : <NoData>Not scored</NoData>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-surface-2 text-[12px] text-muted">
            <td className="px-3 py-2" colSpan={selected ? 2 : 2}>
              Total rubric points
            </td>
            {selected ? (
              <td className="px-3 py-2 text-right tabular-nums">
                {selected.reduce((s, x) => s + x.points, 0)} / {max}
              </td>
            ) : (
              <td className="sr-only" />
            )}
          </tr>
        </tfoot>
      </table>
      {!selected && <p className="border-t border-border px-3 py-2 text-[12px] text-subtle">{max} rubric points in total, scaled to the assignment's maximum points.</p>}
    </div>
  );
}

// ---------- Rubric builder ----------

const newId = () => Math.random().toString(36).slice(2, 10);

export function defaultCriterion(title = ''): RubricCriterion {
  return {
    id: newId(),
    title,
    levels: [
      { label: 'Excellent', points: 4 },
      { label: 'Proficient', points: 3 },
      { label: 'Developing', points: 2 },
      { label: 'Beginning', points: 1 },
    ],
  };
}

export function RubricBuilder({ value, onChange, errors }: { value: RubricCriterion[]; onChange: (v: RubricCriterion[]) => void; errors?: Record<string, string> }) {
  const update = (i: number, patch: Partial<RubricCriterion>) => onChange(value.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {value.map((c, i) => (
        <fieldset key={c.id} className="rounded-lg border border-border bg-surface p-3">
          <legend className="sr-only">Criterion {i + 1}</legend>
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-[180px] flex-1 space-y-1">
              <label className="text-[12px] font-medium text-muted" htmlFor={`crit-${c.id}`}>
                Criterion {i + 1}
              </label>
              <Input id={`crit-${c.id}`} value={c.title} placeholder="e.g. Correctness" onChange={(e) => update(i, { title: e.target.value })} aria-invalid={errors?.[`criteria.${i}.title`] ? true : undefined} />
              <Input value={c.description ?? ''} placeholder="What does this criterion look for? (optional)" onChange={(e) => update(i, { description: e.target.value || undefined })} aria-label={`Description for criterion ${i + 1}`} />
            </div>
            <div className="flex items-center gap-1 pt-5">
              <Button size="icon-sm" variant="ghost" aria-label="Move criterion up" onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUpIcon size={14} />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label="Move criterion down" onClick={() => move(i, 1)} disabled={i === value.length - 1}>
                <ArrowDownIcon size={14} />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Remove criterion ${i + 1}`} onClick={() => onChange(value.filter((_, k) => k !== i))} disabled={value.length <= 1} disabledReason="A rubric needs at least one criterion">
                <TrashIcon size={14} />
              </Button>
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="grid grid-cols-[1fr_80px_32px] gap-2 text-[11.5px] font-medium text-subtle">
              <span>Level</span>
              <span>Points</span>
              <span className="sr-only">Remove</span>
            </div>
            {c.levels.map((l, li) => (
              <div key={li} className="grid grid-cols-[1fr_80px_32px] gap-2">
                <Input
                  value={l.label}
                  aria-label={`Level ${li + 1} name`}
                  onChange={(e) => update(i, { levels: c.levels.map((x, k) => (k === li ? { ...x, label: e.target.value } : x)) })}
                />
                <Input
                  type="number"
                  min={0}
                  step="0.5"
                  value={Number.isFinite(l.points) ? l.points : 0}
                  aria-label={`Points for ${l.label || `level ${li + 1}`}`}
                  onChange={(e) => update(i, { levels: c.levels.map((x, k) => (k === li ? { ...x, points: Number(e.target.value) } : x)) })}
                />
                <Button size="icon-sm" variant="ghost" className="mt-1" aria-label={`Remove level ${l.label}`} disabled={c.levels.length <= 2} onClick={() => update(i, { levels: c.levels.filter((_, k) => k !== li) })}>
                  <TrashIcon size={13} />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={<PlusIcon size={13} />} disabled={c.levels.length >= 8} disabledReason="Up to 8 levels" onClick={() => update(i, { levels: [...c.levels, { label: '', points: 0 }] })}>
              Add level
            </Button>
          </div>
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => onChange([...value, defaultCriterion()])} disabled={value.length >= 20}>
          Add criterion
        </Button>
        <span className="text-[12.5px] text-muted">Total: {rubricMax(value)} points</span>
      </div>
    </div>
  );
}

export function validateRubricClient(title: string, criteria: RubricCriterion[]) {
  if (title.trim().length < 3) return 'Give the rubric a title of at least 3 characters.';
  if (!criteria.length) return 'Add at least one criterion.';
  for (const c of criteria) {
    if (!c.title.trim()) return 'Every criterion needs a name.';
    if (c.levels.length < 2) return `"${c.title}" needs at least 2 levels.`;
    if (c.levels.some((l) => !l.label.trim())) return `Every level in "${c.title}" needs a name.`;
    if (new Set(c.levels.map((l) => l.label.trim())).size !== c.levels.length) return `Level names in "${c.title}" must be unique.`;
  }
  if (rubricMax(criteria) <= 0) return 'The rubric needs at least one level worth more than 0 points.';
  return null;
}

export function cleanCriteria(criteria: RubricCriterion[]): RubricCriterion[] {
  return criteria.map((c) => ({
    id: c.id,
    title: c.title.trim(),
    ...(c.description?.trim() ? { description: c.description.trim() } : {}),
    levels: c.levels.map((l) => ({ label: l.label.trim(), points: Number(l.points) || 0, ...(l.description?.trim() ? { description: l.description.trim() } : {}) })),
  }));
}

// ---------- People picker ----------

export function PeoplePickerDialog({
  open,
  onOpenChange,
  role,
  title,
  description,
  exclude = [],
  onConfirm,
  loading,
  confirmLabel = 'Add selected',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  role: 'student' | 'faculty';
  title: string;
  description?: string;
  exclude?: string[];
  onConfirm: (ids: string[]) => void;
  loading?: boolean;
  confirmLabel?: string;
}) {
  const people = usePeople(role);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (people.data?.people ?? []).filter((p) => !exclude.includes(p.userId) && (!term || p.name.toLowerCase().includes(term) || p.email.toLowerCase().includes(term)));
  }, [people.data, q, exclude]);
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setPicked([]);
          setQ('');
        }
        onOpenChange(v);
      }}
      title={title}
      description={description}
      footer={
        <>
          <span className="mr-auto self-center text-[13px] text-muted">{picked.length} selected</span>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={loading} disabled={!picked.length} disabledReason="Select at least one person" onClick={() => onConfirm(picked)}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <MagnifyingGlassIcon size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" className="pl-8" aria-label="Search people" autoFocus />
        </div>
        {people.error ? (
          <ErrorState error={people.error} onRetry={() => people.refetch()} />
        ) : people.isLoading ? (
          <SkeletonRows rows={4} />
        ) : !list.length ? (
          <EmptyState icon={<UsersIcon size={22} />} title="No one to add" description={q ? 'No match for that search.' : `Everyone with the ${role === 'student' ? 'Student' : 'Faculty'} role is already here. Invite more people from Campus, People and roles.`} />
        ) : (
          <>
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => setPicked(picked.length === list.length ? [] : list.map((p) => p.userId))}>
                {picked.length === list.length ? 'Clear selection' : `Select all ${list.length}`}
              </Button>
            </div>
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {list.map((p) => (
                <li key={p.userId} className="rounded-md px-2 py-1.5 hover:bg-surface-2">
                  <Checkbox
                    checked={picked.includes(p.userId)}
                    onCheckedChange={(v) => setPicked(v ? [...picked, p.userId] : picked.filter((x) => x !== p.userId))}
                    label={p.name}
                    description={p.email}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Dialog>
  );
}

// ---------- Simple accessible bar chart ----------

/** Horizontal bars with the values printed, so the chart never relies on colour or hover. */
export function BarList({ rows, max = 100, unit = '%', label }: { rows: { label: string; value: number | null; hint?: string }[]; max?: number; unit?: string; label: string }) {
  return (
    <figure aria-label={label}>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_64px] items-center gap-3 text-[13px]">
            <span className="truncate" title={r.label}>
              {r.label}
            </span>
            <span className="h-2.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              {r.value !== null && <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(2, Math.min(100, (r.value / max) * 100))}%` }} />}
            </span>
            <span className="text-right tabular-nums text-muted">{r.value === null ? 'No data' : `${Math.round(r.value)}${unit}`}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
