import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { CalendarBlankIcon, CalendarIcon, CalendarPlusIcon, CaretLeftIcon, CaretRightIcon, ListIcon, PlusIcon } from '@phosphor-icons/react';
import { api, qs } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Badge, Button, ButtonLink, EmptyState, ErrorState, Segmented, Skeleton } from '@/components/ui';
import type { CalendarItem, CalendarResponse, CalendarType } from './types';

const TYPE_META: Record<CalendarType, { label: string; cls: string; dot: string }> = {
  task: { label: 'Task', cls: 'bg-accent-soft text-accent-text', dot: 'bg-accent' },
  assignment: { label: 'Assignment', cls: 'bg-info-soft text-info', dot: 'bg-info' },
  assessment: { label: 'Assessment', cls: 'bg-warning-soft text-warning', dot: 'bg-warning' },
  interview: { label: 'Interview', cls: 'bg-success-soft text-success', dot: 'bg-success' },
  mentor_session: { label: 'Mentor session', cls: 'bg-surface-3 text-fg', dot: 'bg-muted' },
  milestone: { label: 'Milestone', cls: 'bg-danger-soft text-danger', dot: 'bg-danger' },
};
const TYPE_ORDER: CalendarType[] = ['task', 'assignment', 'assessment', 'interview', 'mentor_session', 'milestone'];
const MAX_CHIPS = 3;

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}
const timeFmt = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const fullDayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
// 7 Jan 2024 was a Sunday; used only to get localized weekday names.
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(2024, 0, 7 + i);
  return {
    short: new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(d),
    narrow: new Intl.DateTimeFormat(undefined, { weekday: 'narrow' }).format(d),
    long: new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(d),
  };
});

function itemLabel(it: CalendarItem) {
  return `${TYPE_META[it.type]?.label ?? it.type}: ${it.title}, ${timeFmt.format(new Date(it.at))}${it.done ? ', done' : ''}`;
}

export function CalendarTab() {
  const [, setParams] = useSearchParams();
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [view, setView] = useState<'month' | 'list'>(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches ? 'list' : 'month',
  );

  // The visible grid: whole weeks covering the month (at most 42 days, well under the 100 day limit).
  const { gridStart, weeks, monthEnd } = useMemo(() => {
    const offset = cursor.getDay();
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    return {
      gridStart: addDays(cursor, -offset),
      weeks: Math.ceil((offset + daysInMonth) / 7),
      monthEnd: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1),
    };
  }, [cursor]);
  const gridEnd = addDays(gridStart, weeks * 7);
  const from = gridStart.toISOString();
  const to = gridEnd.toISOString();

  const cal = useQuery({
    queryKey: ['workspace', 'calendar', from, to],
    queryFn: () => api.get<CalendarResponse>(`/workspace/calendar${qs({ from, to })}`),
    placeholderData: keepPreviousData,
  });

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    for (const it of cal.data?.items ?? []) {
      const k = dayKey(new Date(it.at));
      const list = m.get(k) ?? [];
      list.push(it);
      m.set(k, list);
    }
    return m;
  }, [cal.data]);

  const monthItems = useMemo(
    () => (cal.data?.items ?? []).filter((it) => {
      const d = new Date(it.at);
      return d >= cursor && d < monthEnd;
    }),
    [cal.data, cursor, monthEnd],
  );

  const today = new Date();
  const todayKey = dayKey(today);
  const monthLabel = monthFmt.format(cursor);
  const shift = (n: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));
  const isCurrentMonth = sameMonth(cursor, today);
  const visibleEmpty = view === 'month' ? !cal.data?.items.length : !monthItems.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <p className="text-[13px] text-muted">
          One agenda from across LearnSphere: your task due dates, published assignments in your cohorts, assessment invitations with a due date, interviews, mentor sessions and milestones of projects you own.
        </p>
        <ButtonLink to="/app/settings/calendar" size="sm" icon={<CalendarPlusIcon size={14} />} className="shrink-0 self-start">
          Sync to your calendar
        </ButtonLink>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="icon" aria-label="Previous month" title="Previous month" onClick={() => shift(-1)}>
            <CaretLeftIcon size={16} />
          </Button>
          <Button
            onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
            disabled={isCurrentMonth}
            disabledReason="You are already viewing this month"
          >
            Today
          </Button>
          <Button size="icon" aria-label="Next month" title="Next month" onClick={() => shift(1)}>
            <CaretRightIcon size={16} />
          </Button>
          <h2 className="ml-1 text-[16px] font-semibold" aria-live="polite">
            {monthLabel}
          </h2>
        </div>
        <Segmented
          label="Calendar view"
          value={view}
          onChange={setView}
          options={[
            {
              value: 'month',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon size={14} aria-hidden /> Month
                </span>
              ),
            },
            {
              value: 'list',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <ListIcon size={14} aria-hidden /> List
                </span>
              ),
            },
          ]}
        />
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-muted" aria-label="Legend">
        {TYPE_ORDER.map((t) => (
          <li key={t} className="inline-flex items-center gap-1.5">
            <span className={clsx('h-2.5 w-2.5 rounded-sm', TYPE_META[t].dot)} aria-hidden />
            {TYPE_META[t].label}
          </li>
        ))}
      </ul>

      {cal.isLoading ? (
        <Skeleton className="h-[460px] w-full" />
      ) : cal.isError ? (
        <ErrorState error={cal.error} onRetry={() => cal.refetch()} />
      ) : visibleEmpty ? (
        <EmptyState
          icon={<CalendarBlankIcon size={22} />}
          title={`Nothing scheduled in ${monthLabel}`}
          description="Add a task with a due date, or check another month. Deadlines and sessions from your courses, assessments, interviews and projects appear here automatically."
          action={
            <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setParams({ tab: 'tasks' })}>
              Add a task
            </Button>
          }
        />
      ) : view === 'month' ? (
        <div className={clsx('overflow-hidden rounded-lg border border-border bg-surface', cal.isFetching && 'opacity-70')} aria-busy={cal.isFetching || undefined}>
          <table className="w-full table-fixed border-collapse">
            <caption className="sr-only">Calendar for {monthLabel}. Use the List view for a full agenda.</caption>
            <thead>
              <tr>
                {WEEKDAYS.map((w) => (
                  <th key={w.long} scope="col" abbr={w.long} className="border-b border-border bg-surface-2 py-1.5 text-center text-[12px] font-medium text-muted">
                    <span className="hidden sm:inline">{w.short}</span>
                    <span className="sm:hidden" aria-hidden>
                      {w.narrow}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: weeks }, (_, wi) => (
                <tr key={wi}>
                  {Array.from({ length: 7 }, (_, di) => {
                    const day = addDays(gridStart, wi * 7 + di);
                    const key = dayKey(day);
                    const items = byDay.get(key) ?? [];
                    const inMonth = sameMonth(day, cursor);
                    const isToday = key === todayKey;
                    const extra = items.length - MAX_CHIPS;
                    return (
                      <td
                        key={key}
                        aria-current={isToday ? 'date' : undefined}
                        className={clsx('h-24 border-b border-r border-border p-1 align-top last:border-r-0 sm:h-28', !inMonth && 'bg-surface-2')}
                      >
                        <div className="mb-0.5 flex justify-end">
                          <span
                            aria-hidden
                            className={clsx(
                              'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] tabular-nums',
                              isToday ? 'bg-accent font-semibold text-on-accent' : inMonth ? 'text-fg' : 'text-subtle',
                            )}
                          >
                            {day.getDate()}
                          </span>
                          <span className="sr-only">
                            {fullDayFmt.format(day)}
                            {isToday ? ', today' : ''}, {items.length === 0 ? 'nothing scheduled' : `${items.length} ${items.length === 1 ? 'item' : 'items'}`}
                          </span>
                        </div>
                        {items.length > 0 && (
                          <ul className="space-y-0.5">
                            {items.slice(0, MAX_CHIPS).map((it) => (
                              <li key={`${it.type}-${it.id}`}>
                                <Link
                                  to={it.link}
                                  title={`${itemLabel(it)}${it.detail ? `. ${it.detail}` : ''}`}
                                  aria-label={itemLabel(it)}
                                  className={clsx(
                                    'block truncate rounded px-1.5 py-0.5 text-[11px] font-medium leading-4 hover:brightness-95 focus-visible:outline-2',
                                    TYPE_META[it.type]?.cls ?? 'bg-surface-3 text-fg',
                                    it.done && 'line-through opacity-70',
                                  )}
                                >
                                  <span className="hidden md:inline">{timeFmt.format(new Date(it.at))} </span>
                                  {it.title}
                                </Link>
                              </li>
                            ))}
                            {extra > 0 && (
                              <li>
                                <button
                                  type="button"
                                  onClick={() => setView('list')}
                                  className="px-1.5 text-[11px] font-medium text-muted hover:text-fg hover:underline"
                                  aria-label={`${extra} more on ${fullDayFmt.format(day)}. Open the list view`}
                                >
                                  +{extra} more
                                </button>
                              </li>
                            )}
                          </ul>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <AgendaList items={monthItems} todayKey={todayKey} />
      )}
    </div>
  );
}

function AgendaList({ items, todayKey }: { items: CalendarItem[]; todayKey: string }) {
  const groups: { key: string; date: Date; items: CalendarItem[] }[] = [];
  for (const it of items) {
    const d = new Date(it.at);
    const k = dayKey(d);
    const g = groups[groups.length - 1];
    if (g && g.key === k) g.items.push(it);
    else groups.push({ key: k, date: d, items: [it] });
  }
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`day-${g.key}`}>
          <h3 id={`day-${g.key}`} className="mb-2 flex items-center gap-2 text-[13.5px] font-semibold">
            {formatDate(g.date, { weekday: 'long', month: 'long', day: 'numeric' })}
            {g.key === todayKey && <Badge tone="accent">Today</Badge>}
          </h3>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
            {g.items.map((it) => {
              const meta = TYPE_META[it.type];
              return (
                <li key={`${it.type}-${it.id}`} className="flex items-start gap-3 px-5 py-3">
                  <time dateTime={it.at} className="w-16 shrink-0 pt-0.5 text-[12.5px] tabular-nums text-muted">
                    {timeFmt.format(new Date(it.at))}
                  </time>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={clsx('rounded px-1.5 py-0.5 text-[11px] font-medium leading-4', meta?.cls ?? 'bg-surface-3 text-fg')}>{meta?.label ?? it.type}</span>
                      <Link to={it.link} className={clsx('text-[14px] font-medium hover:underline', it.done && 'text-muted line-through')}>
                        {it.title}
                      </Link>
                      {it.done && <Badge tone="success">Done</Badge>}
                    </div>
                    {it.detail && <p className="mt-0.5 text-[12.5px] text-muted">{it.detail}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
