import { and, desc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db } from '../../db/client';
import {
  portfolios,
  portfolioPrefs,
  portfolioVersions,
  certificates,
  achievements,
  attempts,
  assessments,
  projects,
  projectMembers,
  projectReviews,
  projectSettings,
  skillEvidence,
  tracks,
  topics,
  topicProgress,
  enrollments,
  profiles,
  users,
} from '../../db/schema';
import { computeSkillDna } from '../learning/skilldna';
import { randomToken } from '../../lib/crypto';
import { slugify, skillsByIds } from '../projects/service';

export const PLATFORM_ISSUER = 'LearnSphere Nexus (platform completion record, not an accredited qualification)';
export const PLATFORM_CERT_STATEMENT =
  'This is a LearnSphere Nexus platform completion record. It confirms activity recorded on this platform. It is not an accredited qualification and is not issued by any external body.';

export type SectionKey = 'projects' | 'skills' | 'assessments' | 'writing' | 'achievements' | 'experience' | 'education';
export const SECTION_KEYS: SectionKey[] = ['projects', 'skills', 'assessments', 'achievements', 'writing', 'experience', 'education'];
export const SECTION_LABELS: Record<SectionKey, string> = {
  projects: 'Projects',
  skills: 'Skills & evidence',
  assessments: 'Assessment results',
  achievements: 'Achievements & certificates',
  writing: 'Writing samples',
  experience: 'Experience',
  education: 'Education',
};

export const RESERVED_SLUGS = new Set(['app', 'admin', 'api', 'login', 'register', 'verify', 'p', 'project', 'projects', 'portfolio', 'settings', 'help', 'about', 'jobs']);

const SOURCE_LABEL: Record<string, string> = {
  self: 'Self-rated',
  assessment: 'Graded assessment',
  practice: 'CodeLab (tested)',
  project: 'Project (self-completed)',
  review: 'Reviewer confirmed',
  course: 'Topic quiz',
  mentor: 'Mentor assessment',
};

export type Portfolio = typeof portfolios.$inferSelect;

// ---------- Portfolio row ----------

export async function uniquePortfolioSlug(name: string) {
  const base = slugify(name).slice(0, 40) || 'learner';
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    if (RESERVED_SLUGS.has(candidate)) continue;
    const [taken] = await db.select({ userId: portfolios.userId }).from(portfolios).where(eq(portfolios.slug, candidate));
    if (!taken) return candidate;
  }
  return `${base}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`;
}

/** Returns the user's portfolio, creating a private default on first use. */
export async function ensurePortfolio(userId: string): Promise<Portfolio> {
  const [existing] = await db.select().from(portfolios).where(eq(portfolios.userId, userId));
  if (existing) return existing;
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  const slug = await uniquePortfolioSlug(u?.name ?? 'learner');
  await db
    .insert(portfolios)
    .values({ userId, slug, visibility: 'private', sections: SECTION_KEYS.map((key) => ({ key, visible: true })) })
    .onConflictDoNothing();
  const [row] = await db.select().from(portfolios).where(eq(portfolios.userId, userId));
  return row;
}

export async function getPrefs(userId: string) {
  await db.insert(portfolioPrefs).values({ userId }).onConflictDoNothing();
  const [p] = await db.select().from(portfolioPrefs).where(eq(portfolioPrefs.userId, userId));
  return p;
}

/** Sections in the saved order, with any keys missing from older rows appended (visible). */
export function normalizedSections(p: Portfolio) {
  const seen = new Set<string>();
  const out: { key: SectionKey; visible: boolean; label: string }[] = [];
  for (const s of p.sections) {
    if (!SECTION_KEYS.includes(s.key) || seen.has(s.key)) continue;
    seen.add(s.key);
    out.push({ key: s.key, visible: s.visible, label: SECTION_LABELS[s.key] });
  }
  for (const k of SECTION_KEYS) if (!seen.has(k)) out.push({ key: k, visible: true, label: SECTION_LABELS[k] });
  return out;
}

export async function snapshotVersion(userId: string, note: string) {
  const p = await ensurePortfolio(userId);
  const prefs = await getPrefs(userId);
  const version = p.version + 1;
  const snapshot = {
    note,
    slug: p.slug,
    visibility: p.visibility,
    headline: p.headline,
    about: p.about,
    sections: p.sections,
    featuredProjectIds: p.featuredProjectIds,
    hiddenEvidenceIds: p.hiddenEvidenceIds,
    writing: p.writing,
    shownAttemptIds: prefs.shownAttemptIds,
  };
  await db.insert(portfolioVersions).values({ userId, version, snapshot });
  await db.update(portfolios).set({ version, updatedAt: new Date() }).where(eq(portfolios.userId, userId));
  return version;
}

// ---------- Platform certificates ----------

/** Short human-readable, unguessable code, e.g. LSN-7KQ2-M9XD-4TPA. */
export function newVerificationCode() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) s += alphabet[bytes[i] % alphabet.length];
  return `LSN-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

/** Issues a platform completion record once per (user, track) or (user, project). Returns the certificate. */
export async function issuePlatformCertificate(e: { userId: string; title: string; trackId?: string | null; projectId?: string | null }) {
  const [existing] = await db
    .select()
    .from(certificates)
    .where(
      and(
        eq(certificates.userId, e.userId),
        eq(certificates.kind, 'platform_completion'),
        e.trackId ? eq(certificates.trackId, e.trackId) : eq(certificates.projectId, e.projectId!),
      ),
    );
  if (existing) return existing;
  const [row] = await db
    .insert(certificates)
    .values({
      userId: e.userId,
      kind: 'platform_completion',
      title: e.title,
      issuer: PLATFORM_ISSUER,
      issuedAt: new Date(),
      verificationCode: newVerificationCode(),
      trackId: e.trackId ?? null,
      projectId: e.projectId ?? null,
    })
    .returning();
  return row;
}

/**
 * Certificate rule for learning paths: every topic of the track has been completed
 * (status completed or later marked for revision after completion). Skipped topics do not count.
 */
export async function issueTrackCertificateIfComplete(userId: string, trackId: string) {
  const [t] = await db.select({ id: tracks.id, title: tracks.title }).from(tracks).where(eq(tracks.id, trackId));
  if (!t) return null;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(topics).where(eq(topics.trackId, trackId));
  if (!total) return null;
  const [{ done }] = await db
    .select({ done: sql<number>`count(*)::int` })
    .from(topicProgress)
    .innerJoin(topics, eq(topics.id, topicProgress.topicId))
    .where(and(eq(topics.trackId, trackId), eq(topicProgress.userId, userId), isNotNull(topicProgress.completedAt), inArray(topicProgress.status, ['completed', 'needs_revision'])));
  if (done < total) return null;
  return issuePlatformCertificate({ userId, trackId, title: `Completed learning path: ${t.title}` });
}

/** Lazily catches up track certificates (called when the owner opens their portfolio). */
export async function syncTrackCertificates(userId: string) {
  const rows = await db.select({ trackId: enrollments.trackId }).from(enrollments).where(eq(enrollments.userId, userId));
  for (const r of rows) await issueTrackCertificateIfComplete(userId, r.trackId);
}

// ---------- Evidence composition ----------

type Mode = 'owner' | 'public';

export type ProjectEvidence = {
  id: string;
  title: string;
  category: string;
  summary: string;
  status: string;
  skills: string[];
  repoUrl: string | null;
  demoUrl: string | null;
  completedAt: string | null;
  approvedAt: string | null;
  reviewerName: string | null;
  verification: 'verified_by_reviewer' | 'self_completed' | 'in_progress';
  visibility: string;
  publicPath: string | null;
  featured: boolean;
  hidden: boolean;
  role: string;
};

export async function composePortfolio(userId: string, mode: Mode) {
  const p = await ensurePortfolio(userId);
  const prefs = await getPrefs(userId);
  const hidden = new Set(p.hiddenEvidenceIds);
  const featured = new Set(p.featuredProjectIds);
  const shownAttempts = new Set(prefs.shownAttemptIds);
  const sections = normalizedSections(p);
  const sectionVisible = (k: SectionKey) => mode === 'owner' || sections.find((s) => s.key === k)!.visible;
  const [owner] = await db.select({ name: users.name, avatarColor: users.avatarColor }).from(users).where(eq(users.id, userId));
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));

  // Projects: owned or contributed (role member).
  const memberRows = await db.select({ projectId: projectMembers.projectId, role: projectMembers.role }).from(projectMembers).where(and(eq(projectMembers.userId, userId), eq(projectMembers.role, 'member')));
  const projRows = await db
    .select()
    .from(projects)
    .where(or(eq(projects.ownerId, userId), memberRows.length ? inArray(projects.id, memberRows.map((m) => m.projectId)) : sql`false`))
    .orderBy(desc(projects.updatedAt));
  const allSkillIds = [...new Set(projRows.flatMap((r) => r.skillIds))];
  const skillNames = new Map((await skillsByIds(allSkillIds)).map((s) => [s.id, s.name]));
  const settings = projRows.length ? await db.select().from(projectSettings).where(inArray(projectSettings.projectId, projRows.map((r) => r.id))) : [];
  const approverIds = [...new Set(projRows.map((r) => r.approvedBy).filter((x): x is string => !!x))];
  const approvers = approverIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, approverIds)) : [];

  let projectsOut: ProjectEvidence[] = projRows
    .filter((r) => r.status !== 'archived')
    .map((r) => {
      const token = settings.find((s) => s.projectId === r.id)?.shareToken;
      const linkable = r.visibility === 'public' || (r.visibility === 'unlisted' && !!token);
      return {
        id: r.id,
        title: r.title,
        category: r.category,
        summary: r.problem.length > 280 ? r.problem.slice(0, 277) + '...' : r.problem,
        status: r.status,
        skills: r.skillIds.map((id) => skillNames.get(id)).filter((x): x is string => !!x),
        repoUrl: r.repoUrl,
        demoUrl: r.demoUrl,
        completedAt: r.completedAt?.toISOString() ?? null,
        approvedAt: r.approvedAt?.toISOString() ?? null,
        reviewerName: approvers.find((a) => a.id === r.approvedBy)?.name ?? null,
        verification: r.approvedBy ? 'verified_by_reviewer' : r.status === 'completed' ? 'self_completed' : 'in_progress',
        visibility: r.visibility,
        publicPath: linkable ? `/p/${p.slug}?project=${r.id}${r.visibility === 'unlisted' ? `&ptoken=${token}` : ''}` : null,
        featured: featured.has(r.id),
        hidden: hidden.has(r.id),
        role: r.ownerId === userId ? 'owner' : 'member',
      };
    });
  if (mode === 'public') {
    // Explicit opt-in: a project appears publicly only if it is featured, or completed and itself shared (public/unlisted).
    projectsOut = projectsOut.filter((x) => !x.hidden && (x.featured || (x.verification !== 'in_progress' && x.visibility !== 'private')));
    projectsOut.sort((a, b) => Number(b.featured) - Number(a.featured));
  }

  // Skills with provenance.
  const dna = (await computeSkillDna(userId)).filter((d) => d.state !== 'not_started');
  const evidence = await db
    .select({ skillId: skillEvidence.skillId, source: skillEvidence.source, score: skillEvidence.score, verified: skillEvidence.verified, createdAt: skillEvidence.createdAt })
    .from(skillEvidence)
    .where(eq(skillEvidence.userId, userId))
    .orderBy(desc(skillEvidence.createdAt));
  const skillsOut = dna
    .map((d) => {
      const provenance: 'verified' | 'demonstrated' | 'learning' | 'self_reported' = d.verified
        ? 'verified'
        : d.state === 'demonstrated' || d.state === 'needs_revision'
          ? 'demonstrated'
          : d.state === 'self_declared'
            ? 'self_reported'
            : 'learning';
      return {
        skillId: d.skillId,
        slug: d.slug,
        name: d.name,
        category: d.category,
        mastery: d.mastery,
        provenance,
        label: { verified: 'Verified (graded or reviewer confirmed)', demonstrated: 'Demonstrated (unverified evidence)', learning: 'Learning', self_reported: 'Self-reported' }[provenance],
        lastEvidenceAt: d.lastEvidenceAt,
        lastVerifiedAt: d.lastVerifiedAt,
        evidenceCount: d.evidenceCount,
        history: evidence
          .filter((e) => e.skillId === d.skillId)
          .slice(0, 12)
          .map((e) => ({ at: e.createdAt.toISOString(), score: Math.round(e.score * 100) / 100, source: e.source, sourceLabel: SOURCE_LABEL[e.source] ?? e.source, verified: e.verified })),
        hidden: hidden.has(d.skillId),
      };
    })
    .filter((s) => mode === 'owner' || !s.hidden);
  const rank = { verified: 0, demonstrated: 1, learning: 2, self_reported: 3 } as const;
  skillsOut.sort((a, b) => rank[a.provenance] - rank[b.provenance] || (b.mastery ?? 0) - (a.mastery ?? 0));

  // Assessment results: only released (or graded self-practice) attempts, and publicly only those the user chose.
  const attemptRows = await db
    .select({ id: attempts.id, title: assessments.title, mode: assessments.mode, score: attempts.score, maxScore: attempts.maxScore, at: attempts.releasedAt, gradedAt: attempts.gradedAt })
    .from(attempts)
    .innerJoin(assessments, eq(assessments.id, attempts.assessmentId))
    .where(
      and(
        eq(attempts.userId, userId),
        isNotNull(attempts.score),
        or(eq(attempts.status, 'released'), and(eq(attempts.status, 'graded'), inArray(assessments.mode, ['practice', 'diagnostic']))),
      ),
    )
    .orderBy(desc(attempts.submittedAt))
    .limit(100);
  const assessmentsOut = attemptRows
    .filter((a) => (a.maxScore ?? 0) > 0)
    .map((a) => ({ attemptId: a.id, title: a.title, scorePercent: Math.round(((a.score ?? 0) / (a.maxScore ?? 1)) * 100), at: (a.at ?? a.gradedAt)?.toISOString() ?? null, shown: shownAttempts.has(a.id) }))
    .filter((a) => mode === 'owner' || (a.shown && !hidden.has(a.attemptId)));

  const achievementRows = await db.select().from(achievements).where(eq(achievements.userId, userId)).orderBy(desc(achievements.awardedAt));
  const certRows = await db.select().from(certificates).where(eq(certificates.userId, userId)).orderBy(desc(certificates.issuedAt));
  const achievementsOut = achievementRows
    .map((a) => ({ id: a.id, key: a.key, title: a.title, description: a.description, awardedAt: a.awardedAt.toISOString(), verified: a.verified, hidden: hidden.has(a.id) }))
    .filter((a) => mode === 'owner' || !a.hidden);
  const certificatesOut = certRows
    .map((c) => ({
      id: c.id,
      kind: c.kind as 'platform_completion' | 'external_self_reported',
      title: c.title,
      issuer: c.issuer,
      issuedAt: c.issuedAt.toISOString(),
      verificationCode: c.kind === 'platform_completion' ? c.verificationCode : null,
      credentialUrl: c.credentialUrl,
      label: c.kind === 'platform_completion' ? 'Platform completion record, not an accredited qualification' : 'Self-reported, not verified by LearnSphere Nexus',
      hidden: hidden.has(c.id),
    }))
    .filter((c) => mode === 'owner' || !c.hidden);

  const out = {
    owner: { name: owner?.name ?? 'Learner', avatarColor: owner?.avatarColor ?? null, location: profile?.location ?? null, links: profile?.links ?? [] },
    portfolio: {
      slug: p.slug,
      visibility: p.visibility,
      headline: p.headline ?? profile?.headline ?? null,
      about: p.about ?? profile?.bio ?? null,
      version: p.version,
      updatedAt: p.updatedAt.toISOString(),
    },
    sections: mode === 'owner' ? sections : sections.filter((s) => s.visible),
    projects: sectionVisible('projects') ? projectsOut : [],
    skills: sectionVisible('skills') ? skillsOut : [],
    assessments: sectionVisible('assessments') ? assessmentsOut : [],
    achievements: sectionVisible('achievements') ? achievementsOut : [],
    certificates: sectionVisible('achievements') ? certificatesOut : [],
    writing: sectionVisible('writing') ? p.writing : [],
    experience: sectionVisible('experience') ? (profile?.experience ?? []) : [],
    education: sectionVisible('education') ? (profile?.education ?? []) : [],
  };
  return out;
}

export type ComposedPortfolio = Awaited<ReturnType<typeof composePortfolio>>;

// ---------- Downloadable summary ----------

export function summaryMarkdown(v: ComposedPortfolio, appUrl: string) {
  const L: string[] = [];
  L.push(`# ${v.owner.name}`);
  if (v.portfolio.headline) L.push('', `_${v.portfolio.headline}_`);
  if (v.portfolio.about) L.push('', v.portfolio.about);
  L.push('', `Evidence labels: "Verified" means a deterministic grader or an authorized human reviewer produced it; "Self-reported" means the person stated it and nobody checked it.`);
  for (const s of v.sections) {
    if (s.key === 'projects' && v.projects.length) {
      L.push('', '## Projects');
      for (const p of v.projects) {
        const badge = p.verification === 'verified_by_reviewer' ? `Completion approved by reviewer${p.reviewerName ? ` ${p.reviewerName}` : ''}` : p.verification === 'self_completed' ? 'Self-completed (not reviewed)' : 'In progress';
        L.push('', `### ${p.title}`, `${badge}${p.completedAt ? ` · ${p.completedAt.slice(0, 10)}` : ''}`);
        if (p.summary) L.push('', p.summary);
        if (p.skills.length) L.push('', `Skills: ${p.skills.join(', ')}`);
        if (p.demoUrl) L.push(`Demo: ${p.demoUrl}`);
        if (p.repoUrl) L.push(`Code: ${p.repoUrl}`);
        if (p.publicPath) L.push(`Project page: ${appUrl}${p.publicPath}`);
      }
    }
    if (s.key === 'skills' && v.skills.length) {
      L.push('', '## Skills');
      const groups = [
        ['verified', 'Verified'],
        ['demonstrated', 'Demonstrated (unverified)'],
        ['learning', 'Learning'],
        ['self_reported', 'Self-reported'],
      ] as const;
      for (const [k, label] of groups) {
        const items = v.skills.filter((x) => x.provenance === k);
        if (!items.length) continue;
        L.push('', `**${label}:** ${items.map((i) => `${i.name}${i.lastEvidenceAt ? ` (last evidence ${i.lastEvidenceAt.slice(0, 10)})` : ''}`).join(', ')}`);
      }
    }
    if (s.key === 'assessments' && v.assessments.length) {
      L.push('', '## Assessment results', '');
      for (const a of v.assessments) L.push(`- ${a.title}: ${a.scorePercent}% (graded)`);
    }
    if (s.key === 'achievements' && (v.certificates.length || v.achievements.length)) {
      L.push('', '## Achievements & certificates', '');
      for (const c of v.certificates)
        L.push(`- ${c.title} · ${c.issuer} · ${c.issuedAt.slice(0, 10)} · ${c.label}${c.verificationCode ? ` · verify at ${appUrl}/verify/${c.verificationCode}` : ''}${c.credentialUrl ? ` · ${c.credentialUrl}` : ''}`);
      for (const a of v.achievements) L.push(`- ${a.title} (earned on the platform ${a.awardedAt.slice(0, 10)})`);
    }
    if (s.key === 'writing' && v.writing.length) {
      L.push('', '## Writing', '');
      for (const w of v.writing) L.push(`- [${w.title}](${w.url})${w.summary ? `: ${w.summary}` : ''}`);
    }
    if (s.key === 'experience' && v.experience.length) {
      L.push('', '## Experience (self-reported)', '');
      for (const e of v.experience) L.push(`- ${e.title}, ${e.company}${e.start ? ` (${e.start}${e.end ? ` to ${e.end}` : ''})` : ''}${e.summary ? `: ${e.summary}` : ''}`);
    }
    if (s.key === 'education' && v.education.length) {
      L.push('', '## Education (self-reported)', '');
      for (const e of v.education) L.push(`- ${e.institution}${e.degree ? `, ${e.degree}` : ''}${e.field ? ` in ${e.field}` : ''}${e.endYear ? ` (${e.endYear})` : ''}`);
    }
  }
  L.push('', `_Generated from LearnSphere Nexus on ${new Date().toISOString().slice(0, 10)}._`);
  return L.join('\n') + '\n';
}

// ---------- Resume linking ----------

/** Projects and skills a resume can cite, with honest provenance. Used by the career module. */
export async function evidenceForResume(userId: string) {
  const v = await composePortfolio(userId, 'owner');
  const reviews = v.projects.length
    ? await db.select({ projectId: projectReviews.projectId }).from(projectReviews).where(and(inArray(projectReviews.projectId, v.projects.map((p) => p.id)), eq(projectReviews.kind, 'approval')))
    : [];
  const [rawProjects] = [v.projects.filter((p) => p.status !== 'archived')];
  return {
    projects: rawProjects.map((p) => ({
      projectId: p.id,
      title: p.title,
      summary: p.summary,
      status: p.status,
      skills: p.skills,
      repoUrl: p.repoUrl,
      demoUrl: p.demoUrl,
      completedAt: p.completedAt,
      verification: p.verification,
      reviewed: reviews.some((r) => r.projectId === p.id) || p.verification === 'verified_by_reviewer',
      publicPath: p.publicPath,
    })),
    verifiedSkills: v.skills.filter((s) => s.provenance === 'verified').map((s) => ({ slug: s.slug, name: s.name, lastVerifiedAt: s.lastVerifiedAt })),
    demonstratedSkills: v.skills.filter((s) => s.provenance === 'demonstrated').map((s) => ({ slug: s.slug, name: s.name, lastEvidenceAt: s.lastEvidenceAt })),
    certificates: v.certificates.map((c) => ({ id: c.id, title: c.title, issuer: c.issuer, issuedAt: c.issuedAt, kind: c.kind, verificationCode: c.verificationCode })),
    portfolio: { slug: v.portfolio.slug, visibility: v.portfolio.visibility },
  };
}
