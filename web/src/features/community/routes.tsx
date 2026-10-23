import type { RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

export const routes: RouteObject[] = [
  { path: 'community', lazy: page(() => import('./CommunityPage')) },
  { path: 'community/s/:slug', lazy: page(() => import('./SpacePage')) },
  { path: 'community/t/:id', lazy: page(() => import('./ThreadPage')) },
  { path: 'community/groups', lazy: page(() => import('./GroupsPage')) },
  { path: 'community/groups/:id', lazy: page(() => import('./GroupPage')) },
  { path: 'community/moderation', lazy: page(() => import('./ModerationPage')) },
  { path: 'community/guidelines', lazy: page(() => import('./GuidelinesPage')) },
  { path: 'community/settings', lazy: page(() => import('./SettingsPage')) },
];
