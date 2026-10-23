import type { RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

export const routes: RouteObject[] = [
  { path: 'create', lazy: page(() => import('./CreateOverviewPage')) },
  { path: 'create/resources', lazy: page(() => import('./ResourcesListPage')) },
  { path: 'create/resources/new', lazy: page(() => import('./ResourceEditorPage')) },
  { path: 'create/resources/:id', lazy: page(() => import('./ResourceEditorPage')) },
  { path: 'create/paths', lazy: page(() => import('./PathsListPage')) },
  { path: 'create/paths/:id', lazy: page(() => import('./PathEditorPage')) },
  { path: 'create/review', lazy: page(() => import('./ReviewQueuePage')) },
  // Assessment engineer: question bank
  { path: 'create/questions', lazy: page(() => import('@/components/assessments/QuestionBankPage')) },
];
