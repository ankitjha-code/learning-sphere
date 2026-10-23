import type { RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

export const routes: RouteObject[] = [
  { path: 'assessments', lazy: page(() => import('./HubPage')) },
  { path: 'assessments/attempts/:attemptId', lazy: page(() => import('./TakePage')) },
  { path: 'assessments/attempts/:attemptId/result', lazy: page(() => import('./ResultPage')) },
  { path: 'assessments/:id', lazy: page(() => import('./OverviewPage')) },
];
