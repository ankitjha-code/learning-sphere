import { useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { SparkleIcon, XIcon } from '@phosphor-icons/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';

export type Summary = {
  streak: { current: number; longest: number; activeToday: boolean; restDays: number[] };
  xp: number;
  weekXp: number;
  level: { level: number; currentLevelAt: number; nextLevelAt: number; toNext: number; explanation: string };
  records: { bestWeek: { weekOf: string; xp: number } | null; longestStreak: number; mostProblemsInDay: { date: string; count: number } | null };
  heatmap: { date: string; xp: number; minutes: number; active: boolean; rest: boolean }[];
  preferences: { showOnLeaderboard: boolean; studyReminders: boolean; restDays: number[] };
  xpPolicy: string;
};

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Saves account preferences (PATCH /api/me/preferences) and refreshes anything that depends on them. */
export function usePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: { showOnLeaderboard?: boolean; studyReminders?: boolean; restDays?: number[] }) => api.patch('/me/preferences', patch),
    onSuccess: () => {
      toast.success('Preference saved');
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['motivation-summary'] });
      qc.invalidateQueries({ queryKey: ['leaderboard'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/**
 * A quiet, dismissible confirmation for milestones. It fades in with a short transition
 * that is disabled for people who prefer reduced motion (and by the app-level setting).
 */
export function Celebration({ title, children, onDismiss }: { title: string; children?: ReactNode; onDismiss: () => void }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(t);
  }, []);
  return (
    <div
      role="status"
      className={clsx(
        'flex items-start gap-3 rounded-lg border border-success/40 bg-success-soft px-4 py-3 transition-all duration-300 motion-reduce:transition-none',
        shown ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100',
      )}
    >
      <SparkleIcon size={20} weight="fill" className="mt-0.5 shrink-0 text-success" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold">{title}</div>
        {children && <div className="text-[13px] text-muted">{children}</div>}
      </div>
      <button type="button" onClick={onDismiss} className="rounded p-1 text-muted hover:bg-surface hover:text-fg" aria-label="Dismiss">
        <XIcon size={16} />
      </button>
    </div>
  );
}
