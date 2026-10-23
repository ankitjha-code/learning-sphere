import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ---------- Shared types (mirror server/modules/admin responses) ----------

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

export type Metric = { key: string; label: string; value: number | string; definition: string };

export type JobRow = {
  id: string;
  type: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  runAt: string;
  lockedAt: string | null;
  orgId: string | null;
  createdAt: string;
  updatedAt: string;
  handlerRegistered: boolean;
};

export type AuditRow = {
  id: string;
  createdAt: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  orgId: string | null;
  orgName: string | null;
  targetType: string | null;
  targetId: string | null;
  meta: Record<string, unknown>;
  ip: string | null;
  requestId: string | null;
};

export type FeatureFlags = Record<'ai' | 'community' | 'jobFeeds' | 'mentorship' | 'publicPortfolios' | 'codeExecutionDocker' | 'emailNotifications', boolean>;

export type LimitCheck = { metric: string; scope: 'user' | 'org'; used: number; limit: number | null; allowed: boolean; period: string | null; explanation: string };

export type PlanLimits = {
  aiRequestsPerUserPerDay: number;
  membersPerOrg: number | null;
  storagePerUserMb: number;
  activeJobPostings: number | null;
  assessmentsPerMonth: number | null;
};

export type Plan = {
  id: 'free' | 'campus' | 'company';
  name: string;
  description: string;
  limits: PlanLimits;
  entitlements: Record<string, boolean>;
  orgCount?: number;
};

export const DEMO_BILLING_NOTICE = 'Demonstration mode: no payments are processed; plan changes are free and immediate.';

// ---------- Hooks other features may use ----------

/**
 * Platform feature flags for the signed-in user (booleans only). Use it to hide a
 * disabled feature with an explanation, e.g. `if (!flags.community) <Banner>Community is turned off by the platform administrator.</Banner>`.
 */
export function useFeatureFlags() {
  return useQuery({
    queryKey: ['admin', 'features', 'public'],
    queryFn: () => api.get<{ features: FeatureFlags }>('/admin/features/public'),
    staleTime: 5 * 60_000,
    select: (d) => d.features,
  });
}

/** Unresolved high/critical incidents (title + status only), for a site-wide banner. */
export function useStatusBanner() {
  return useQuery({
    queryKey: ['admin', 'status-banner'],
    queryFn: () => api.get<{ incidents: { title: string; status: string; severity: string }[] }>('/admin/status-banner'),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

// ---------- Formatting ----------

export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function formatNumber(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return typeof n === 'number' ? new Intl.NumberFormat().format(n) : n;
}

export const ACTION_LABELS: Record<string, string> = {
  'admin.user_suspended': 'User suspended',
  'admin.user_unsuspended': 'User restored',
  'admin.user_sessions_revoked': 'Sessions revoked',
  'admin.platform_role_changed': 'Platform role changed',
  'admin.password_reset_link_created': 'Reset link created',
  'admin.user_export_requested': 'Data export started',
  'admin.org_created': 'Organization created',
  'admin.org_updated': 'Organization updated',
  'admin.org_suspended': 'Organization suspended',
  'admin.org_reactivated': 'Organization reactivated',
  'admin.org_plan_changed': 'Plan changed (demo)',
  'admin.org_policies_updated': 'Policies updated',
  'admin.job_retried': 'Job retried',
  'admin.job_cancelled': 'Job cancelled',
};


/** Download a CSV from an authenticated GET endpoint (same-origin cookie). */
export function csvHref(path: string) {
  return `/api${path}`;
}

export const SEVERITY_HELP: Record<string, string> = {
  low: 'Minor degradation, workaround exists, few people affected.',
  medium: 'A feature is impaired for many people.',
  high: 'A core workflow is broken. Shows a banner to every signed-in user.',
  critical: 'The platform is down or data is at risk. Shows a banner to every signed-in user.',
};
