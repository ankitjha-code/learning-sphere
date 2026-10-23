import { z } from 'zod';
import type { Ctx } from './context';
import { badRequest } from './errors';

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const fields: Record<string, string> = {};
    for (const issue of r.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    throw badRequest('Please check the highlighted fields.', { fields });
  }
  return r.data;
}

export async function body<T extends z.ZodType>(c: Ctx, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  const raw = await c.req.text();
  if (!raw.trim()) json = {}; // An empty body means "no options" (e.g. POST /publish).
  else {
    try {
      json = JSON.parse(raw);
    } catch {
      throw badRequest('Request body must be valid JSON.');
    }
  }
  return parse(schema, json);
}

export function query<T extends z.ZodType>(c: Ctx, schema: T): z.infer<T> {
  return parse(schema, c.req.query());
}

export const uuidParam = z.string().uuid();

export function idParam(c: Ctx, name = 'id'): string {
  const v = c.req.param(name);
  const r = uuidParam.safeParse(v);
  if (!r.success) throw badRequest(`Invalid ${name}.`);
  return r.data;
}

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
});

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(200)
  .refine((p) => /[a-zA-Z]/.test(p) && /[0-9]/.test(p), 'Include at least one letter and one number.');

/**
 * Schema for PATCH bodies: every field optional and every default removed.
 * Zod 4's `.partial()` still applies `.default()` values, which would silently overwrite
 * stored data (e.g. reset `mode` to 'guided' or `tags` to []) on updates that omit a field.
 */
export function patchSchema<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape) as [string, z.ZodType][]) {
    let f: z.ZodType = field;
    if (f instanceof z.ZodOptional) f = f.unwrap() as z.ZodType;
    if (f instanceof z.ZodDefault) f = f.unwrap() as z.ZodType;
    shape[key] = f.optional();
  }
  return z.object(shape) as unknown as z.ZodObject<{ [K in keyof T]: z.ZodOptional<T[K] extends z.ZodDefault<infer I> ? I : T[K]> }>;
}
