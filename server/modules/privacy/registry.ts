/**
 * Lets other modules take part in the privacy lifecycle without editing this module.
 *
 *   registerPrivacyHandler({
 *     key: 'study_plans', label: 'Study plans', tables: ['study_plans'],
 *     export: async (userId) => db.select().from(studyPlans).where(eq(studyPlans.userId, userId)),
 *     erase: async (userId) => ({ action: 'deleted', count: (await db.delete(studyPlans).where(...).returning()).length }),
 *   });
 *
 * `tables` lists the tables the handler covers, so the generic sweep of extension
 * tables leaves them alone. Handlers must be idempotent (deletion jobs can retry).
 */
export type ErasureResult = { action: 'deleted' | 'anonymized' | 'retained'; count: number; reason?: string };

export type PrivacyHandler = {
  key: string;
  label: string;
  tables?: string[];
  export?: (userId: string) => Promise<unknown>;
  erase?: (userId: string) => Promise<ErasureResult>;
  count?: (userId: string) => Promise<number>;
  retention?: string;
};

const handlers = new Map<string, PrivacyHandler>();

export function registerPrivacyHandler(h: PrivacyHandler) {
  handlers.set(h.key, h);
}

export function privacyHandlers() {
  return [...handlers.values()];
}
