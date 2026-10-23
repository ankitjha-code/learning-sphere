import type { RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

export const routes: RouteObject[] = [{ path: 'goals', lazy: page(() => import('./GoalsPage')) }];
