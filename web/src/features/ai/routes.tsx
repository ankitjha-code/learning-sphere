import type { RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

export const routes: RouteObject[] = [
  { path: 'ai', lazy: page(() => import('./CouncilPage')) },
  { path: 'ai/c/:conversationId', lazy: page(() => import('./ChatPage')) },
];
