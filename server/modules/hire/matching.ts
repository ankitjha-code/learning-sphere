/**
 * Job matching for employers. Uses ONLY the posting's explicit requirements and the
 * candidate's demonstrable skill evidence (Skill DNA). Never uses names, age, gender,
 * photos, religion, caste, marital status, nationality or any other personal attribute.
 * The score is advisory: it orders candidates for human review and never rejects anyone.
 */
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { profiles, type jobPostings } from '../../db/schema';
import { computeSkillDna, type SkillDnaEntry } from '../learning/skilldna';
import { skillStatus, STATUS_POINTS, REQUIRED_WEIGHT, PREFERRED_WEIGHT, type GapStatus } from '../career/analysis';

export type EvidenceLabel = 'verified' | 'demonstrated' | 'learning' | 'self_reported' | 'none';
export type MatchFactor = {
  slug: string;
  name: string;
  required: boolean;
  minLevel: number | null;
  outcome: 'met' | 'partial' | 'unmet';
  evidence: EvidenceLabel;
  evidenceLabel: string;
  evidenceDetail: string;
  level: number | null; // 0..4 estimate from evidence (mastery x 4), null without evidence
  lastEvidenceAt: string | null;
  points: number;
  weight: number;
  note: string | null;
};

export type EligibilityFactor = { label: string; outcome: 'met' | 'unmet' | 'unknown'; detail: string };

export type MatchResult = {
  score: number | null;
  factors: MatchFactor[];
  eligibility: EligibilityFactor[];
  summary: { required: number; requiredMet: number; partial: number; unmet: number };
  formula: string;
  note: string;
};

export const MATCH_FORMULA =
  'Match = sum(weight x points) / sum(weight) x 100 over the skills listed on the job. Weight: required 2, preferred 1. Points: verified 1.0, demonstrated 0.75, learning 0.35, self-reported 0.15, no evidence 0. A skill below the job\'s minimum level counts as partial.';
export const MATCH_NOTE =
  'Ranking uses only stated job requirements and demonstrated skills. It is advisory: people make every decision, and nobody is rejected automatically.';

const LABEL: Record<EvidenceLabel, string> = {
  verified: 'Verified (graded or reviewer confirmed)',
  demonstrated: 'Demonstrated (unverified evidence)',
  learning: 'Learning (in progress)',
  self_reported: 'Self-reported',
  none: 'No evidence',
};

export function skillFactors(required: (typeof jobPostings.$inferSelect)['requiredSkills'], dna: SkillDnaEntry[]): { score: number | null; factors: MatchFactor[] } {
  const bySlug = new Map(dna.map((d) => [d.slug, d]));
  let num = 0;
  let den = 0;
  const factors = required.map((s): MatchFactor => {
    const d = bySlug.get(s.slug);
    const st = skillStatus(d);
    const evidence = st.status as GapStatus as EvidenceLabel;
    const level = d?.mastery != null ? Math.round(d.mastery * 4 * 10) / 10 : null;
    let outcome: MatchFactor['outcome'] = evidence === 'verified' || evidence === 'demonstrated' ? 'met' : evidence === 'learning' || evidence === 'self_reported' ? 'partial' : 'unmet';
    let note: string | null = null;
    let points = STATUS_POINTS[st.status];
    if (outcome === 'met' && s.minLevel && level !== null && level < s.minLevel) {
      outcome = 'partial';
      points = Math.min(points, STATUS_POINTS.learning);
      note = `Evidence level ${level} is below the job's minimum of ${s.minLevel}.`;
    }
    if (st.revisionDue) note = [note, 'Evidence is due for revision (older or a revision is pending).'].filter(Boolean).join(' ');
    const weight = s.required ? REQUIRED_WEIGHT : PREFERRED_WEIGHT;
    num += weight * points;
    den += weight;
    return {
      slug: s.slug,
      name: s.name,
      required: s.required,
      minLevel: s.minLevel ?? null,
      outcome,
      evidence,
      evidenceLabel: LABEL[evidence],
      evidenceDetail: st.evidence,
      level,
      lastEvidenceAt: st.lastEvidenceAt,
      points,
      weight,
      note,
    };
  });
  return { score: den ? Math.round((num / den) * 100) : null, factors };
}

/** Eligibility shown as information next to the match. Never used to reject automatically. */
export function eligibilityFactors(
  e: (typeof jobPostings.$inferSelect)['eligibility'],
  profile: { education: { degree?: string; endYear?: number }[]; experience: { start?: string; end?: string }[] } | null,
): EligibilityFactor[] {
  const out: EligibilityFactor[] = [];
  if (e.graduationYears?.length) {
    const years = (profile?.education ?? []).map((x) => x.endYear).filter((y): y is number => typeof y === 'number');
    if (!years.length) out.push({ label: `Graduation year ${e.graduationYears.join(' or ')}`, outcome: 'unknown', detail: 'Not stated on the profile.' });
    else {
      const ok = years.some((y) => e.graduationYears!.includes(y));
      out.push({ label: `Graduation year ${e.graduationYears.join(' or ')}`, outcome: ok ? 'met' : 'unmet', detail: `Profile lists ${years.join(', ')}.` });
    }
  }
  if (e.degrees?.length) {
    const degrees = (profile?.education ?? []).map((x) => x.degree).filter((d): d is string => !!d);
    if (!degrees.length) out.push({ label: `Degree: ${e.degrees.join(' or ')}`, outcome: 'unknown', detail: 'Not stated on the profile.' });
    else {
      const ok = degrees.some((d) => e.degrees!.some((w) => d.toLowerCase().includes(w.toLowerCase())));
      out.push({ label: `Degree: ${e.degrees.join(' or ')}`, outcome: ok ? 'met' : 'unmet', detail: `Profile lists ${degrees.join(', ')}.` });
    }
  }
  if (e.minExperienceYears) {
    const months = (profile?.experience ?? []).reduce((sum, x) => {
      const s = x.start ? Date.parse(x.start) : NaN;
      const en = x.end ? Date.parse(x.end) : Date.now();
      return Number.isFinite(s) && Number.isFinite(en) && en > s ? sum + (en - s) / (30.44 * 86400_000) : sum;
    }, 0);
    const years = Math.round((months / 12) * 10) / 10;
    if (!profile?.experience?.length) out.push({ label: `At least ${e.minExperienceYears} years of experience`, outcome: 'unknown', detail: 'No dated experience on the profile.' });
    else out.push({ label: `At least ${e.minExperienceYears} years of experience`, outcome: years >= e.minExperienceYears ? 'met' : 'unmet', detail: `About ${years} years listed.` });
  }
  if (e.workAuthorization) out.push({ label: 'Work authorization', outcome: 'unknown', detail: `Requirement: ${e.workAuthorization}. Confirm with the candidate; not inferred.` });
  return out;
}

export async function matchCandidate(posting: typeof jobPostings.$inferSelect, candidateId: string, dna?: SkillDnaEntry[]): Promise<MatchResult> {
  const [skillDna, [profile]] = await Promise.all([
    dna ?? computeSkillDna(candidateId),
    db.select({ education: profiles.education, experience: profiles.experience }).from(profiles).where(eq(profiles.userId, candidateId)),
  ]);
  const { score, factors } = skillFactors(posting.requiredSkills ?? [], skillDna);
  return {
    score,
    factors,
    eligibility: eligibilityFactors(posting.eligibility ?? {}, profile ?? null),
    summary: {
      required: factors.filter((f) => f.required).length,
      requiredMet: factors.filter((f) => f.required && f.outcome === 'met').length,
      partial: factors.filter((f) => f.outcome === 'partial').length,
      unmet: factors.filter((f) => f.outcome === 'unmet').length,
    },
    formula: MATCH_FORMULA,
    note: MATCH_NOTE,
  };
}
