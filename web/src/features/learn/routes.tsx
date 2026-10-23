import type { RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

export const routes: RouteObject[] = [
  { path: 'learn', lazy: page(() => import('./RoadmapsPage')) },
  { path: 'learn/revision', lazy: page(() => import('./RevisionPage')) },
  { path: 'learn/:slug', lazy: page(() => import('./TrackPage')) },
  { path: 'learn/:slug/:topic', lazy: page(() => import('./TopicPage')) },
];
