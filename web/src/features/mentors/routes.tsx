import type { RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

export const routes: RouteObject[] = [
  { path: 'mentors', lazy: page(() => import('./MentorsPage')) },
  { path: 'mentors/m/:mentorshipId', lazy: page(() => import('./MenteeMentorshipPage')) },
  { path: 'mentors/:userId', lazy: page(() => import('./MentorProfilePage')) },
];
