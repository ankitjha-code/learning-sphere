import { Hono } from 'hono';
import type { AppEnv } from '../../lib/context';
import { registerFileAccess } from '../files/service';
import { ensureScheduled } from '../files/recurring';
import { canReadSubmissionFile } from './service';
import { structureRoutes } from './routes-structure';
import { assignmentRoutes } from './routes-assignments';
import { gradingRoutes } from './routes-grading';
import { studentRoutes } from './routes-student';
import { insightRoutes } from './routes-insights';
import { peerRoutes } from './routes-peer';
import { PEER_TICK_MS } from './peer';
import { REMINDER_PERIOD_MS } from './jobs';

/**
 * Mounted at /api/teach.
 * Faculty endpoints require faculty, faculty_admin or org_admin in the record's org; students use /my/*.
 */
export const teachRoutes = new Hono<AppEnv>();

// Submission files: the submitter, their teammates, and staff who teach the assignment's cohort may download.
registerFileAccess('submission', (auth, file) => canReadSubmissionFile(auth, file.id));

teachRoutes.use('*', async (_c, next) => {
  ensureScheduled('teach.deadline_reminders', REMINDER_PERIOD_MS);
  ensureScheduled('teach.peer_tick', PEER_TICK_MS);
  await next();
});

teachRoutes.route('/', studentRoutes);
teachRoutes.route('/', structureRoutes);
teachRoutes.route('/', assignmentRoutes);
teachRoutes.route('/', gradingRoutes);
teachRoutes.route('/', insightRoutes);
teachRoutes.route('/', peerRoutes);
