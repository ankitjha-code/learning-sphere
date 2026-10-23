import type { RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

/**
 * Candidate-side TalentBridge pages (paths relative to /app). Owned by the hire feature;
 * the coordinator registers `candidateRoutes` in app/feature-routes.tsx.
 */
export const candidateRoutes: RouteObject[] = [
  { path: 'career/discoverability', lazy: page(() => import('./DiscoverabilityPage')) },
  { path: 'jobs/applications/:jobApplicationId', lazy: page(() => import('./MyApplicationPage')) },
];
