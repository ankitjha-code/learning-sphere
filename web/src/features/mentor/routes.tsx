import type { RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

export const routes: RouteObject[] = [
  { path: 'mentor', lazy: page(() => import('./MentorOverviewPage')) },
  { path: 'mentor/mentees', lazy: page(() => import('./MenteesPage')) },
  { path: 'mentor/mentees/:mentorshipId', lazy: page(() => import('./MenteeDetailPage')) },
  { path: 'mentor/sessions', lazy: page(() => import('./MentorSessionsPage')) },
  { path: 'mentor/profile', lazy: page(() => import('./MentorProfileEditPage')) },
];
