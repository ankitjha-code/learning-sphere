import { Hono } from 'hono';
import type { AppEnv } from '../../lib/context';
import { structureRoutes } from './routes-structure';
import { studentRoutes } from './routes-students';
import { driveRoutes } from './routes-drives';
import { reportRoutes } from './routes-reports';
import { meRoutes } from './routes-me';
import './privacy';

/**
 * Mounted at /api/campus. College & placement workspace (Journey 5).
 * Staff routes require placement_officer, org_admin or faculty_admin in the record's org;
 * /me/* routes serve students their own record and drives.
 */
export const campusRoutes = new Hono<AppEnv>();

campusRoutes.route('/', meRoutes);
campusRoutes.route('/', structureRoutes);
campusRoutes.route('/', studentRoutes);
campusRoutes.route('/', driveRoutes);
campusRoutes.route('/', reportRoutes);
