import { Hono } from 'hono';
import type { AppEnv } from '../../lib/context';
import { resumeRoutes } from './resumes-routes';
import { documentRoutes } from './documents-routes';
import { targetRoutes } from './targets-routes';
import { applicationRoutes } from './applications-routes';
import { interviewRoutes } from './interview-routes';
import { offerRoutes, journalRoutes, overviewRoutes } from './misc-routes';

/** Mounted at /api/career. Every record here is private to its owner (other users get 404). */
export const careerRoutes = new Hono<AppEnv>();

careerRoutes.route('/overview', overviewRoutes);
careerRoutes.route('/resumes', resumeRoutes);
careerRoutes.route('/documents', documentRoutes);
careerRoutes.route('/targets', targetRoutes);
careerRoutes.route('/applications', applicationRoutes);
careerRoutes.route('/interview', interviewRoutes);
careerRoutes.route('/offers', offerRoutes);
careerRoutes.route('/journal', journalRoutes);
