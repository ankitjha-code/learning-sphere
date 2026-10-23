import { db } from '../db/client';
import { auditLogs } from '../db/schema';
import { clientIp, type Ctx } from './context';

export async function audit(
  c: Ctx | null,
  entry: { action: string; orgId?: string | null; targetType?: string; targetId?: string; meta?: Record<string, unknown>; actorId?: string | null },
) {
  const auth = c?.get('auth') ?? null;
  await db.insert(auditLogs).values({
    action: entry.action,
    orgId: entry.orgId ?? null,
    actorId: entry.actorId !== undefined ? entry.actorId : (auth?.user.id ?? null),
    actorRole: auth?.user.platformRole ?? null,
    targetType: entry.targetType,
    targetId: entry.targetId,
    meta: entry.meta ?? {},
    ip: c ? clientIp(c) : null,
    requestId: c?.get('requestId') ?? null,
  });
}
