import type { RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

export const routes: RouteObject[] = [
  // ---- Faculty workspace (teach engineer) ----
  { path: 'teach', lazy: page(() => import('./OverviewPage')) },
  { path: 'teach/courses', lazy: page(() => import('./CoursesPage')) },
  { path: 'teach/courses/:id', lazy: page(() => import('./CourseDetailPage')) },
  { path: 'teach/cohorts', lazy: page(() => import('./CohortsPage')) },
  { path: 'teach/cohorts/:id', lazy: page(() => import('./CohortDetailPage')) },
  { path: 'teach/assignments', lazy: page(() => import('./AssignmentsPage')) },
  { path: 'teach/assignments/new', lazy: page(() => import('./AssignmentEditorPage')) },
  { path: 'teach/assignments/:id', lazy: page(() => import('./AssignmentEditorPage')) },
  { path: 'teach/grading', lazy: page(() => import('./GradingQueuePage')) },
  { path: 'teach/grading/:submissionId', lazy: page(() => import('./GradingPage')) },
  { path: 'teach/rubrics', lazy: page(() => import('./RubricsPage')) },
  { path: 'teach/attendance', lazy: page(() => import('./AttendancePage')) },
  { path: 'teach/analytics', lazy: page(() => import('./AnalyticsPage')) },
  // ---- Assessments and question banks (assessment engineer adds entries below) ----
  { path: 'teach/assessments', handle: { assessmentScope: { basePath: '/app/teach', modes: ['classroom', 'diagnostic', 'practice'], label: 'Teach' } }, lazy: page(() => import('@/components/assessments/AssessmentListPage')) },
  { path: 'teach/assessments/:id', handle: { assessmentScope: { basePath: '/app/teach', modes: ['classroom', 'diagnostic', 'practice'], label: 'Teach' } }, lazy: page(() => import('@/components/assessments/AssessmentEditorPage')) },
  { path: 'teach/assessments/:id/grading', handle: { assessmentScope: { basePath: '/app/teach', modes: ['classroom', 'diagnostic', 'practice'], label: 'Teach' } }, lazy: page(() => import('@/components/assessments/GradingQueuePage')) },
  { path: 'teach/questions', lazy: page(() => import('@/components/assessments/QuestionBankPage')) },
];
