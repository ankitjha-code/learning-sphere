import { Hono } from 'hono';
import type { AppEnv } from '../../lib/context';
import { jobRoutes } from './routes-jobs';
import { pipelineRoutes } from './routes-pipeline';
import { interviewRoutes } from './routes-interviews';
import { candidateRoutes } from './routes-candidate';
import { insightRoutes } from './routes-insights';

/**
 * Mounted at /api/hire. TalentBridge: the employer recruitment workspace plus the few
 * candidate-side endpoints (discoverability, application view, messages, offer response).
 */
export const hireRoutes = new Hono<AppEnv>();

hireRoutes.route('/', candidateRoutes);
hireRoutes.route('/', insightRoutes);
hireRoutes.route('/', pipelineRoutes);
hireRoutes.route('/', interviewRoutes);
hireRoutes.route('/', jobRoutes);
