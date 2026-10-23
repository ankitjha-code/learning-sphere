import type { RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

export const routes: RouteObject[] = [
  { path: 'projects', lazy: page(() => import('./ProjectsPage')) },
  { path: 'projects/templates', lazy: page(() => import('./TemplatesPage')) },
  { path: 'projects/templates/:slug', lazy: page(() => import('./TemplateDetailPage')) },
  { path: 'projects/:id', lazy: page(() => import('./ProjectWorkspacePage')) },
];
