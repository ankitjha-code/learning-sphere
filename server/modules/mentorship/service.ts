import { randomInt } from 'node:crypto';
import { and, eq, or } from 'drizzle-orm';
import { db } from '../../db/client';
import { mentorships, mentorProfiles } from '../../db/schema';
import type { AuthContext } from '../../lib/context';
import { notFound } from '../../lib/errors';

export type Sharing = { skillDna: boolean; projects: boolean; assessments: boolean; applications: boolean };
export type PartyRole = 'mentor' | 'mentee';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** https://meet.jit.si/LearnSphere-<16 random chars>. */
export function jitsiLink() {
  let s = '';
  for (let i = 0; i < 16; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `https://meet.jit.si/LearnSphere-${s}`;
}

export const JITSI_NOTE =
  'Jitsi Meet is free and needs no account for participants. On the public meet.jit.si server, a moderator may need to sign in (Google, GitHub or Facebook) to start the meeting.';

/** Loads a mentorship only if the caller is one of its two parties; everyone else gets 404. */
export async function loadAsParty(auth: AuthContext, id: string) {
  const uid = auth.user.id;
  const [m] = await db
    .select()
    .from(mentorships)
    .where(and(eq(mentorships.id, id), or(eq(mentorships.mentorId, uid), eq(mentorships.menteeId, uid))));
  if (!m) throw notFound('Mentorship');
  const role: PartyRole = m.mentorId === uid ? 'mentor' : 'mentee';
  return { m, role, otherId: role === 'mentor' ? m.menteeId : m.mentorId };
}

/** Whether a user may use the mentor workspace: an active mentor profile or an org mentor role. */
export async function mentorAccess(auth: AuthContext) {
  const [profile] = await db.select().from(mentorProfiles).where(eq(mentorProfiles.userId, auth.user.id));
  const orgMentor = auth.memberships.find((m) => m.roles.includes('mentor')) ?? null;
  return { profile: profile ?? null, orgMentor, active: profile?.status === 'active' || !!orgMentor };
}
