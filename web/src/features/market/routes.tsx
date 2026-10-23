import type { RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

export const routes: RouteObject[] = [
  { path: 'career/market', lazy: page(() => import('./MarketPage')) },
  { path: 'career/market/skills/:slug', lazy: page(() => import('./SkillDetailPage')) },
];
