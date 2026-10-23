import type { RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

const assessmentScope = { basePath: '/app/hire', modes: ['recruitment'], label: 'Hire' };

export const routes: RouteObject[] = [
  // ---- Assessments (assessment engineer) ----
  { path: 'hire/assessments', handle: { assessmentScope }, lazy: page(() => import('@/components/assessments/AssessmentListPage')) },
  { path: 'hire/assessments/:id', handle: { assessmentScope }, lazy: page(() => import('@/components/assessments/AssessmentEditorPage')) },

  // ---- TalentBridge (hire) ----
  { path: 'hire', lazy: page(() => import('./OverviewPage')) },
  { path: 'hire/jobs', lazy: page(() => import('./JobsPage')) },
  { path: 'hire/jobs/new', lazy: page(() => import('./JobNewPage')) },
  { path: 'hire/jobs/:id', lazy: page(() => import('./JobDetailPage')) },
  { path: 'hire/candidates', lazy: page(() => import('./CandidatesPage')) },
  { path: 'hire/candidates/:applicationId', lazy: page(() => import('./CandidateDetailPage')) },
  { path: 'hire/interviews', lazy: page(() => import('./InterviewsPage')) },
  { path: 'hire/interviews/:id', lazy: page(() => import('./InterviewDetailPage')) },
  { path: 'hire/offers', lazy: page(() => import('./OffersPage')) },
  { path: 'hire/analytics', lazy: page(() => import('./AnalyticsPage')) },
  { path: 'hire/company', lazy: page(() => import('./CompanyPage')) },
];
