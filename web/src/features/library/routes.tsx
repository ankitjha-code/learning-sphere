import type { RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

export const routes: RouteObject[] = [
  { path: 'library', lazy: page(() => import('./LibraryPage')) },
  { path: 'library/collections', lazy: page(() => import('./CollectionsPage')) },
  { path: 'library/history', lazy: page(() => import('./HistoryPage')) },
  { path: 'library/knowledge', lazy: page(() => import('./KnowledgePage')) },
  { path: 'library/:id', lazy: page(() => import('./ResourcePage')) },
];
