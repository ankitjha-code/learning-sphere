import type { RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

export const routes: RouteObject[] = [
  { path: 'assignments', lazy: page(() => import('./MyAssignmentsPage')) },
  { path: 'assignments/peer-reviews/:reviewId', lazy: page(() => import('./PeerReviewPage')) },
  { path: 'assignments/:id', lazy: page(() => import('./AssignmentDetailPage')) },
];
