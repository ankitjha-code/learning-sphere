import type { RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

const assessmentScope = { assessmentScope: { basePath: '/app/campus', modes: ['placement'], label: 'Campus' } };

export const routes: RouteObject[] = [
  // ---- Campus workspace (placement officers, org admins, faculty admins) ----
  { path: 'campus', lazy: page(() => import('./OverviewPage')) },
  { path: 'campus/structure', lazy: page(() => import('./StructurePage')) },
  { path: 'campus/students', lazy: page(() => import('./StudentsPage')) },
  { path: 'campus/students/:recordId', lazy: page(() => import('./StudentDetailPage')) },
  { path: 'campus/people', lazy: page(() => import('./PeoplePage')) },
  { path: 'campus/employers', lazy: page(() => import('./EmployersPage')) },
  { path: 'campus/drives', lazy: page(() => import('./DrivesPage')) },
  { path: 'campus/drives/new', lazy: page(() => import('./DriveNewPage')) },
  { path: 'campus/drives/:id', lazy: page(() => import('./DriveDetailPage')) },
  { path: 'campus/reports', lazy: page(() => import('./ReportsPage')) },
  // ---- Placement assessments (shared assessment engine pages) ----
  { path: 'campus/assessments', handle: assessmentScope, lazy: page(() => import('@/components/assessments/AssessmentListPage')) },
  { path: 'campus/assessments/:id', handle: assessmentScope, lazy: page(() => import('@/components/assessments/AssessmentEditorPage')) },
  { path: 'campus/assessments/:id/grading', handle: assessmentScope, lazy: page(() => import('@/components/assessments/GradingQueuePage')) },
  // ---- Student-facing placement pages (learner area) ----
  { path: 'placements', lazy: page(() => import('./MyPlacementsPage')) },
  { path: 'placements/record', lazy: page(() => import('./MyRecordPage')) },
];
