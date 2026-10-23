import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClockCounterClockwiseIcon, BookOpenIcon } from '@phosphor-icons/react';
import { api, qs } from '@/lib/api';
import { formatDate, plural } from '@/lib/format';
import { Badge, ButtonLink, EmptyState, ErrorState, Select, SkeletonRows, StatTile } from '@/components/ui';

type ActivityEvent = {
  id: string;
  userId: string;
  orgId: string | null;
  kind: string;
  label: string;
  link: string | null;
  xp: number;
  minutes: number;
  skillIds: string[] | null;
  dedupeKey: string | null;
  createdAt: string;
};

const RANGES = [7, 30, 90, 365] as const;
const LIMIT = 300;
const timeFmt = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

function humanKind(kind: string) {
  const s = kind.replace(/[._]/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatMinutes(m: number) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function ActivityHistory() {
  const [days, setDays] = useState<number>(30);
  const activity = useQuery({
    queryKey: ['me', 'activity', days],
    queryFn: () => api.get<{ items: ActivityEvent[] }>(`/me/activity${qs({ days })}`),
    placeholderData: keepPreviousData,
  });

  const items = activity.data?.items ?? [];
  const groups = useMemo(() => {
    const out: { key: string; date: Date; items: ActivityEvent[] }[] = [];
    for (const it of items) {
      const d = new Date(it.createdAt);
      const k = dayKey(d);
      const g = out[out.length - 1];
      if (g && g.key === k) g.items.push(it);
      else out.push({ key: k, date: d, items: [it] });
    }
    return out;
  }, [items]);
  const totals = useMemo(() => items.reduce((a, it) => ({ xp: a.xp + it.xp, minutes: a.minutes + it.minutes }), { xp: 0, minutes: 0 }), [items]);
  const todayKey = dayKey(new Date());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full sm:w-48">
          <label htmlFor="activity-range" className="mb-1.5 block text-[13px] font-medium">
            Period
          </label>
          <Select id="activity-range" value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
            {RANGES.map((d) => (
              <option key={d} value={d}>
                Last {d} days
              </option>
            ))}
          </Select>
        </div>
        <p className="max-w-md text-[12.5px] text-muted">XP is only counted for substantive activity such as completed lessons, passed submissions and milestones, and each activity counts once.</p>
      </div>

      {activity.isLoading ? (
        <SkeletonRows rows={6} />
      ) : activity.isError ? (
        <ErrorState error={activity.error} onRetry={() => activity.refetch()} />
      ) : !items.length ? (
        <EmptyState
          icon={<ClockCounterClockwiseIcon size={22} />}
          title={`No activity in the last ${days} days`}
          description="Completed lessons, practice submissions, assessments and project milestones are recorded here."
          action={
            <ButtonLink to="/app/learn" variant="primary" icon={<BookOpenIcon size={16} />}>
              Continue learning
            </ButtonLink>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Activities" value={items.length} />
            <StatTile label="XP earned" value={totals.xp} tone="xp" />
            <StatTile label="Time recorded" value={formatMinutes(totals.minutes)} />
          </div>
          {items.length >= LIMIT && <p className="text-[12.5px] text-subtle">Showing the latest {LIMIT} activities in this period, so totals may be lower than your full history.</p>}
          <div className="space-y-5" aria-busy={activity.isFetching || undefined}>
            {groups.map((g) => (
              <section key={g.key} aria-labelledby={`act-${g.key}`}>
                <h3 id={`act-${g.key}`} className="mb-2 flex items-center gap-2 text-[13.5px] font-semibold">
                  {formatDate(g.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  {g.key === todayKey && <Badge tone="accent">Today</Badge>}
                  <span className="text-[12px] font-normal text-subtle">{plural(g.items.length, 'activity', 'activities')}</span>
                </h3>
                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
                  {g.items.map((it) => (
                    <li key={it.id} className="flex items-start gap-3 px-5 py-3.5">
                      <time dateTime={it.createdAt} className="w-16 shrink-0 pt-0.5 text-[12.5px] tabular-nums text-muted">
                        {timeFmt.format(new Date(it.createdAt))}
                      </time>
                      <div className="min-w-0 flex-1">
                        {it.link ? (
                          <Link to={it.link} className="text-[14px] font-medium hover:underline">
                            {it.label}
                          </Link>
                        ) : (
                          <span className="text-[14px] font-medium">{it.label}</span>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-subtle">
                          <Badge>{humanKind(it.kind)}</Badge>
                          {it.xp > 0 && <Badge tone="xp">+{it.xp} XP</Badge>}
                          {it.minutes > 0 && <span>{formatMinutes(it.minutes)}</span>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
