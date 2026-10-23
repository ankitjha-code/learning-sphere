import type { RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

export const routes: RouteObject[] = [
  { path: 'skills', lazy: page(() => import('./SkillDnaPage')) },
  { path: 'skills/:slug', lazy: page(() => import('./SkillDetailPage')) },
];
