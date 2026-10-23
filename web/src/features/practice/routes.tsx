import type { RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

export const routes: RouteObject[] = [
  { path: 'practice', lazy: page(() => import('./ProblemListPage')) },
  { path: 'practice/visualize', lazy: page(() => import('./VisualizerPage')) },
  { path: 'practice/runtimes', lazy: page(() => import('./RuntimesPage')) },
  { path: 'practice/:slug', lazy: page(() => import('./WorkspacePage')) },
];
