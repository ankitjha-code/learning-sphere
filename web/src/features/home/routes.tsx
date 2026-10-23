import type { RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

export const routes: RouteObject[] = [{ index: true, lazy: page(() => import('./HomePage')) }];
