import { Navigate, type RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

export const routes: RouteObject[] = [
  { path: 'settings', element: <Navigate to="/app/settings/profile" replace /> },
  {
    // Pathless layout route: shared settings navigation around every settings page.
    lazy: page(() => import('./SettingsLayout')),
    children: [
      { path: 'settings/profile', lazy: page(() => import('./ProfilePage')) },
      { path: 'settings/preferences', lazy: page(() => import('./PreferencesPage')) },
      { path: 'settings/notifications', lazy: page(() => import('./NotificationSettingsPage')) },
      { path: 'settings/security', lazy: page(() => import('./SecurityPage')) },
      { path: 'settings/privacy', lazy: page(() => import('./PrivacyPage')) },
      { path: 'settings/calendar', lazy: page(() => import('./CalendarPage')) },
    ],
  },
];
