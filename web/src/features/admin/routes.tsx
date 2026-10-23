import type { RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

export const routes: RouteObject[] = [
  // AI area (owned by the AI layer).
  { path: 'admin/ai', lazy: page(() => import('./AiProvidersPage')) },

  // Platform administration (platform staff; every endpoint re-checks the role on the server).
  { path: 'admin', lazy: page(() => import('./OverviewPage')) },
  { path: 'admin/users', lazy: page(() => import('./UsersPage')) },
  { path: 'admin/users/:id', lazy: page(() => import('./UserDetailPage')) },
  { path: 'admin/orgs', lazy: page(() => import('./OrgsPage')) },
  { path: 'admin/orgs/:id', lazy: page(() => import('./OrgDetailPage')) },
  { path: 'admin/jobs', lazy: page(() => import('./JobsPage')) },
  { path: 'admin/moderation', lazy: page(() => import('./ModerationPage')) },
  { path: 'admin/audit', lazy: page(() => import('./AuditPage')) },
  { path: 'admin/incidents', lazy: page(() => import('./IncidentsPage')) },
  { path: 'admin/incidents/:id', lazy: page(() => import('./IncidentDetailPage')) },
  { path: 'admin/health', lazy: page(() => import('./HealthPage')) },
  { path: 'admin/settings', lazy: page(() => import('./SettingsPage')) },
  // Organization admins (not platform staff): their own organization's audit log.
  { path: 'admin/org-audit', lazy: page(() => import('./OrgAuditPage')) },
];
