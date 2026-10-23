// Privacy lifecycle for calendar sync. Exports connection metadata only (never tokens or feed URLs);
// erasure deletes tokens, event mappings, pending OAuth states and the feed token.
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import { calendarConnections, calendarEventMaps, calendarSettings } from '../../db/schema';
import { registerPrivacyHandler } from '../privacy/registry';
import { eraseUser } from './service';

registerPrivacyHandler({
  key: 'calendar',
  label: 'Calendar subscription feed and connected calendars',
  tables: ['calendar_settings', 'calendar_connections', 'calendar_event_maps', 'calendar_oauth_states'],
  retention:
    'Deleted with your account. Events already copied to your Google or Outlook calendar live in your account there; delete the "LearnSphere Nexus" calendar from that service (or disconnect with "Also delete the calendar" first).',
  count: async (userId) => {
    const [s, c] = await Promise.all([
      db.select({ id: calendarSettings.userId }).from(calendarSettings).where(eq(calendarSettings.userId, userId)),
      db.select({ id: calendarConnections.id }).from(calendarConnections).where(eq(calendarConnections.userId, userId)),
    ]);
    return s.length + c.length;
  },
  export: async (userId) => {
    const [s] = await db
      .select({ feedEnabled: calendarSettings.feedEnabled, feedCreatedAt: calendarSettings.feedTokenCreatedAt, feedLastAccessedAt: calendarSettings.feedLastAccessedAt, types: calendarSettings.types })
      .from(calendarSettings)
      .where(eq(calendarSettings.userId, userId));
    const conns = await db
      .select({
        id: calendarConnections.id,
        provider: calendarConnections.provider,
        accountEmail: calendarConnections.accountEmail,
        status: calendarConnections.status,
        scope: calendarConnections.scope,
        lastSyncAt: calendarConnections.lastSyncAt,
        lastSyncStatus: calendarConnections.lastSyncStatus,
        connectedAt: calendarConnections.createdAt,
      })
      .from(calendarConnections)
      .where(eq(calendarConnections.userId, userId));
    const maps = conns.length
      ? await db.select({ connectionId: calendarEventMaps.connectionId }).from(calendarEventMaps).where(inArray(calendarEventMaps.connectionId, conns.map((c) => c.id)))
      : [];
    return {
      feed: s ? { enabled: s.feedEnabled, createdAt: s.feedCreatedAt, lastFetchedByCalendarApp: s.feedLastAccessedAt, includedTypes: s.types } : null,
      connections: conns.map(({ id, ...c }) => ({ ...c, syncedEvents: maps.filter((m) => m.connectionId === id).length })),
      note: 'Access tokens, refresh tokens and the secret feed URL are never included in exports.',
    };
  },
  erase: async (userId) => ({ action: 'deleted', count: await eraseUser(userId) }),
});
