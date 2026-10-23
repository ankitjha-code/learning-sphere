import { z } from 'zod';

/** Eligibility rules for a placement drive (all optional; an omitted rule is not applied). */
export const eligibilityInput = z.object({
  programIds: z.array(z.string().uuid()).max(50).optional(),
  graduationYears: z.array(z.number().int().min(1990).max(2100)).max(10).optional(),
  minCgpa: z.number().min(0).max(10).nullable().optional(),
  maxActiveBacklogs: z.number().int().min(0).max(50).nullable().optional(),
  minAttendance: z.number().min(0).max(100).nullable().optional(),
  requiredSkillSlugs: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  requireVerifiedRecord: z.boolean().optional(),
});

export const DRIVE_STAGE_OPTIONS = ['registered', 'assessment', 'interview', 'offer'] as const;
