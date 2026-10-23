import type { RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

export const routes: RouteObject[] = [
  { path: 'career', lazy: page(() => import('./CareerHomePage')) },
  { path: 'career/targets', lazy: page(() => import('./TargetsPage')) },
  { path: 'career/targets/:id', lazy: page(() => import('./TargetDetailPage')) },
  { path: 'career/resumes', lazy: page(() => import('./ResumesPage')) },
  { path: 'career/resumes/:id', lazy: page(() => import('./ResumeEditorPage')) },
  { path: 'career/documents', lazy: page(() => import('./DocumentsPage')) },
  { path: 'career/documents/:id', lazy: page(() => import('./DocumentEditorPage')) },
  { path: 'career/applications', lazy: page(() => import('./ApplicationsPage')) },
  { path: 'career/interview', lazy: page(() => import('./InterviewPage')) },
  { path: 'career/offers', lazy: page(() => import('./OffersPage')) },
  { path: 'career/journal', lazy: page(() => import('./JournalPage')) },
];
