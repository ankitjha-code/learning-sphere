import { z } from 'zod';

const str = (max = 200) => z.string().trim().max(max);
const optStr = (max = 200) => z.string().trim().max(max).optional();
const idStr = z.string().trim().min(1).max(40);

export const resumeDataSchema = z.object({
  basics: z.object({
    name: str(120).default(''),
    email: optStr(254),
    phone: optStr(40),
    location: optStr(120),
    headline: optStr(200),
    links: z.array(z.object({ label: str(40), url: str(300) })).max(8).default([]),
  }),
  summary: optStr(2000),
  experience: z
    .array(z.object({ id: idStr, company: str(160).default(''), title: str(160).default(''), start: optStr(20), end: optStr(20), bullets: z.array(str(600)).max(12).default([]) }))
    .max(20)
    .default([]),
  education: z
    .array(z.object({ id: idStr, institution: str(200).default(''), degree: optStr(160), field: optStr(160), start: optStr(20), end: optStr(20), grade: optStr(60) }))
    .max(10)
    .default([]),
  projects: z
    .array(z.object({ id: idStr, name: str(160).default(''), url: optStr(300), bullets: z.array(str(600)).max(10).default([]), projectId: z.string().uuid().optional() }))
    .max(15)
    .default([]),
  skills: z.array(z.object({ group: str(60), items: z.array(str(60)).max(40) })).max(12).default([]),
  certifications: z.array(z.object({ id: idStr, name: str(200), issuer: optStr(160), date: optStr(20) })).max(20).default([]),
  sectionOrder: z.array(z.enum(['summary', 'experience', 'projects', 'education', 'skills', 'certifications'])).max(6).default(['summary', 'experience', 'projects', 'education', 'skills', 'certifications']),
});

export const isoDate = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
  .transform((s) => new Date(s));
