// Privacy lifecycle for campus records. Institutions must keep academic and placement records,
// so they are retained and become anonymous through the anonymized user row. Free text the
// student wrote themselves (correction reasons, withdrawal notes) is removed on erasure.
import { and, eq, inArray, like } from 'drizzle-orm';
import { db } from '../../db/client';
import { campusInterviewDetails, driveCandidates, driveStageEvents, interviews, placementDrives, recordCorrections, studentRecords } from '../../db/schema';
import { registerPrivacyHandler } from '../privacy/registry';

registerPrivacyHandler({
  key: 'campus_placement',
  label: 'Campus academic record, correction requests and placement drive history',
  tables: ['student_records', 'record_corrections', 'drive_candidates', 'drive_stage_events', 'campus_interview_details'],
  retention: 'Kept by your institution as academic and placement records; identity removed when your account is deleted.',
  count: async (userId) => {
    const [r, x, d] = await Promise.all([
      db.select({ id: studentRecords.id }).from(studentRecords).where(eq(studentRecords.userId, userId)),
      db.select({ id: recordCorrections.id }).from(recordCorrections).where(eq(recordCorrections.requestedBy, userId)),
      db.select({ id: driveCandidates.id }).from(driveCandidates).where(eq(driveCandidates.userId, userId)),
    ]);
    return r.length + x.length + d.length;
  },
  export: async (userId) => {
    const records = await db.select().from(studentRecords).where(eq(studentRecords.userId, userId));
    const corrections = await db
      .select({ field: recordCorrections.field, currentValue: recordCorrections.currentValue, proposedValue: recordCorrections.proposedValue, reason: recordCorrections.reason, status: recordCorrections.status, reviewNote: recordCorrections.reviewNote, createdAt: recordCorrections.createdAt, reviewedAt: recordCorrections.reviewedAt })
      .from(recordCorrections)
      .where(eq(recordCorrections.requestedBy, userId));
    const drives = await db
      .select({ drive: placementDrives.title, company: placementDrives.companyName, stage: driveCandidates.stage, offerCtcText: driveCandidates.offerCtcText, createdAt: driveCandidates.createdAt, updatedAt: driveCandidates.updatedAt, candidateId: driveCandidates.id })
      .from(driveCandidates)
      .innerJoin(placementDrives, eq(placementDrives.id, driveCandidates.driveId))
      .where(eq(driveCandidates.userId, userId));
    const events = drives.length
      ? await db.select({ candidateId: driveStageEvents.candidateId, fromStage: driveStageEvents.fromStage, toStage: driveStageEvents.toStage, createdAt: driveStageEvents.createdAt }).from(driveStageEvents).where(inArray(driveStageEvents.candidateId, drives.map((d) => d.candidateId)))
      : [];
    const ivs = await db
      .select({ title: interviews.title, scheduledAt: interviews.scheduledAt, status: interviews.status, meetingUrl: interviews.meetingUrl })
      .from(interviews)
      .innerJoin(campusInterviewDetails, eq(campusInterviewDetails.interviewId, interviews.id))
      .where(eq(interviews.candidateId, userId));
    return {
      // Internal staff notes are not part of the student's archive.
      records: records.map(({ notes: _n, verifiedBy: _v, ...r }) => r),
      corrections,
      drives: drives.map(({ candidateId, ...d }) => ({ ...d, stageHistory: events.filter((e) => e.candidateId === candidateId).map(({ candidateId: _c, ...e }) => e) })),
      interviews: ivs,
    };
  },
  erase: async (userId) => {
    const x = await db.update(recordCorrections).set({ reason: '[removed: account deleted]' }).where(eq(recordCorrections.requestedBy, userId)).returning({ id: recordCorrections.id });
    await db.update(recordCorrections).set({ status: 'rejected', reviewNote: 'Closed: the requester deleted their account.', reviewedAt: new Date() }).where(and(eq(recordCorrections.requestedBy, userId), eq(recordCorrections.status, 'open')));
    const e = await db.update(driveStageEvents).set({ note: '[removed: account deleted]' }).where(and(eq(driveStageEvents.userId, userId), eq(driveStageEvents.actorKind, 'student'), like(driveStageEvents.note, 'Student:%'))).returning({ id: driveStageEvents.id });
    const [r, d] = await Promise.all([
      db.select({ id: studentRecords.id }).from(studentRecords).where(eq(studentRecords.userId, userId)),
      db.select({ id: driveCandidates.id }).from(driveCandidates).where(eq(driveCandidates.userId, userId)),
    ]);
    return { action: 'anonymized', count: r.length + d.length + x.length + e.length, reason: 'Academic and placement records stay with your institution under an anonymous label; text you wrote in correction requests and withdrawal notes is removed.' };
  },
});
