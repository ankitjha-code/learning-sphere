import type { RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

export const routes: RouteObject[] = [
  { path: 'jobs', lazy: page(() => import('./JobsPage')) },
  { path: 'jobs/external/:id', lazy: page(() => import('./ExternalJobPage')) },
  { path: 'jobs/:id', lazy: page(() => import('./JobDetailPage')) },
];
