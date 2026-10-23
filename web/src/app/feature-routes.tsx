import type { RouteObject } from 'react-router-dom';
import { routes as homeRoutes } from '@/features/home/routes';
import { routes as skillsRoutes } from '@/features/skills/routes';
import { routes as learnRoutes } from '@/features/learn/routes';
import { routes as libraryRoutes } from '@/features/library/routes';
import { routes as practiceRoutes } from '@/features/practice/routes';
import { routes as assessmentsRoutes } from '@/features/assessments/routes';
import { routes as assignmentsRoutes } from '@/features/assignments/routes';
import { routes as projectsRoutes } from '@/features/projects/routes';
import { routes as portfolioRoutes } from '@/features/portfolio/routes';
import { routes as aiRoutes } from '@/features/ai/routes';
import { routes as mentorsRoutes } from '@/features/mentors/routes';
import { routes as communityRoutes } from '@/features/community/routes';
import { routes as goalsRoutes } from '@/features/goals/routes';
import { routes as workspaceRoutes } from '@/features/workspace/routes';
import { routes as notificationsRoutes } from '@/features/notifications/routes';
import { routes as settingsRoutes } from '@/features/settings/routes';
import { routes as careerRoutes } from '@/features/career/routes';
import { routes as jobsRoutes } from '@/features/jobs/routes';
import { routes as teachRoutes } from '@/features/teach/routes';
import { routes as campusRoutes } from '@/features/campus/routes';
import { routes as hireRoutes } from '@/features/hire/routes';
import { routes as mentorRoutes } from '@/features/mentor/routes';
import { routes as createRoutes } from '@/features/create/routes';
import { routes as adminRoutes } from '@/features/admin/routes';
import { routes as billingRoutes } from '@/features/billing/routes';
import { routes as marketRoutes } from '@/features/market/routes';
import { candidateRoutes } from '@/features/hire/candidate-routes';

/** Routes under /app, contributed by each feature folder (paths are relative to /app). */
export const featureRoutes: RouteObject[] = [
  ...homeRoutes,
  ...skillsRoutes,
  ...learnRoutes,
  ...libraryRoutes,
  ...practiceRoutes,
  ...assessmentsRoutes,
  ...assignmentsRoutes,
  ...projectsRoutes,
  ...portfolioRoutes,
  ...aiRoutes,
  ...mentorsRoutes,
  ...communityRoutes,
  ...goalsRoutes,
  ...workspaceRoutes,
  ...notificationsRoutes,
  ...settingsRoutes,
  ...careerRoutes,
  ...jobsRoutes,
  ...teachRoutes,
  ...campusRoutes,
  ...hireRoutes,
  ...mentorRoutes,
  ...createRoutes,
  ...adminRoutes,
  ...candidateRoutes,
  ...billingRoutes,
  ...marketRoutes,
];
