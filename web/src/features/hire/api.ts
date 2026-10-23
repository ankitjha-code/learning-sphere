import { useQuery } from '@tanstack/react-query';
import { api, qs } from '@/lib/api';

export type SkillReq = { slug: string; name: string; required: boolean; minLevel?: number };
export type Eligibility = { minExperienceYears?: number; graduationYears?: number[]; degrees?: string[]; workAuthorization?: string; notes?: string };
export type JobStatus = 'draft' | 'published' | 'closed' | 'archived';

export type Job = {
  id: string;
  orgId: string;
  title: string;
  team: string | null;
  location: string;
  workplace: 'onsite' | 'hybrid' | 'remote';
  employmentType: 'full_time' | 'internship' | 'contract' | 'part_time';
  description: string;
  responsibilities: string[];
  requiredSkills: SkillReq[];
  eligibility: Eligibility;
  salaryText: string | null;
  stages: string[];
  stageLabels: Record<string, string>;
  assessmentId: string | null;
  openings: number;
  status: JobStatus;
  publishedAt: string | null;
  closesAt: string | null;
  campusOnly: boolean;
  createdAt: string;
  updatedAt: string;
  counts: Record<string, number>;
  applicants: number;
  active: number;
  acceptingApplications: boolean;
};

export type ChecklistItem = { key: string; label: string; ok: boolean; reason: string };
export type LinkedAssessment = { id: string; title: string; status: string; primary: boolean; invited: number; completed: number; link: string };

export type JobDetail = { job: Job; checklist: { ready: boolean; items: ChecklistItem[] }; assessments: LinkedAssessment[]; canManage: boolean };

export type AssessmentState = { assessmentId: string; title: string; inviteStatus: string; invitedAt: string; dueAt: string | null; attemptStatus: string | null; percent: number | null; submittedAt: string | null; resultsLink: string };

export type AppRow = {
  id: string;
  postingId: string;
  jobTitle: string;
  candidate: { id: string; name: string; headline: string | null };
  stage: string;
  stageLabel: string;
  status: string;
  source: string;
  appliedAt: string;
  updatedAt: string;
  portfolioShared: boolean;
  match: { score: number | null; met: number; partial: number; total: number; metSlugs: string[] };
  assessment: { summary: 'not_invited' | 'invited' | 'in_progress' | 'completed'; items: AssessmentState[] };
  unread: number;
};

export type MatchFactor = {
  slug: string;
  name: string;
  required: boolean;
  minLevel: number | null;
  outcome: 'met' | 'partial' | 'unmet';
  evidence: 'verified' | 'demonstrated' | 'learning' | 'self_reported' | 'none';
  evidenceLabel: string;
  evidenceDetail: string;
  level: number | null;
  lastEvidenceAt: string | null;
  points: number;
  weight: number;
  note: string | null;
};
export type Match = {
  score: number | null;
  factors: MatchFactor[];
  eligibility: { label: string; outcome: 'met' | 'unmet' | 'unknown'; detail: string }[];
  summary: { required: number; requiredMet: number; partial: number; unmet: number };
  formula: string;
  note: string;
};

export type Feedback = { id: string; interviewerId: string; interviewerName: string; recommendation: string; scores: { competency: string; rating: number; note?: string }[]; summary: string; submittedAt: string };

export type CandidateDetail = {
  application: { id: string; stage: string; stageLabel: string; status: string; source: string; appliedAt: string; updatedAt: string; coverNote: string | null; portfolioShared: boolean; resume: { data?: ResumeLike; title?: string; capturedAt?: string } | null; matchAtApply: { score: number } | null };
  candidate: { id: string; name: string; headline: string | null; location: string | null };
  job: { id: string; title: string; status: string; stages: string[]; stageLabels: Record<string, string>; requiredSkills: SkillReq[] };
  match: Match;
  portfolio: {
    headline: string | null;
    about: string | null;
    publicUrl: string | null;
    projects: { id: string; title: string; summary: string; skills: string[]; verification: string; repoUrl: string | null; demoUrl: string | null; completedAt: string | null; reviewerName: string | null }[];
    skills: { slug: string; name: string; provenance: string; label: string }[];
    assessments: { title: string; scorePercent: number; at: string | null }[];
    certificates: { title: string; issuer: string; label: string; issuedAt: string }[];
    links: { label: string; url: string }[];
  } | null;
  portfolioNote: string;
  assessments: AssessmentState[];
  interviews: {
    id: string;
    title: string;
    kind: string;
    scheduledAt: string;
    durationMinutes: number;
    status: string;
    meetingUrl: string | null;
    interviewers: { id: string; name: string }[];
    feedback: Feedback[];
    hiddenFeedbackCount: number;
    iAmInterviewer: boolean;
    mySubmitted: boolean;
  }[];
  offers: { id: string; title: string; compensationText: string; startDate: string | null; expiresAt: string | null; status: string; createdAt: string }[];
  decisions: { id: string; fromLabel: string; toLabel: string; toStage: string; reason: string; visibleToCandidate: boolean; decidedBy: string; createdAt: string }[];
  unreadMessages: number;
  permissions: { canManage: boolean; canMessage: boolean; canMove: boolean };
  nextStages: { key: string; label: string; needsReason: boolean; why: string | null; blocked: string | null }[];
};

export type ResumeLike = {
  basics?: { name?: string; headline?: string; location?: string; links?: { label: string; url: string }[] };
  summary?: string;
  experience?: { id: string; company: string; title: string; start?: string; end?: string; bullets: string[] }[];
  education?: { id: string; institution: string; degree?: string; field?: string; start?: string; end?: string }[];
  projects?: { id: string; name: string; url?: string; bullets: string[] }[];
  skills?: { group: string; items: string[] }[];
};

export type Interview = {
  id: string;
  applicationId: string | null;
  candidateName: string;
  jobTitle: string | null;
  postingId: string | null;
  title: string;
  kind: string;
  kindLabel: string;
  scheduledAt: string;
  durationMinutes: number;
  meetingUrl: string | null;
  meetingProvider: string | null;
  meetingNote: string | null;
  interviewers: { id: string; name: string }[];
  status: string;
  feedbackCount?: number;
  myFeedbackSubmitted?: boolean;
  iAmInterviewer?: boolean;
};

export type Message = { id: string; senderId?: string; senderName: string; body: string; createdAt: string; mine: boolean };

export const SOURCE_LABEL: Record<string, string> = { direct: 'Direct', invited: 'Invited', campus_drive: 'Campus drive', referral: 'Referral' };
export const WORKPLACE_LABEL: Record<string, string> = { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' };
export const TYPE_LABEL: Record<string, string> = { full_time: 'Full time', internship: 'Internship', contract: 'Contract', part_time: 'Part time' };
export const RECOMMENDATION_LABEL: Record<string, string> = { strong_yes: 'Strong yes', yes: 'Yes', no: 'No', strong_no: 'Strong no' };

export function useJobs(status?: string) {
  return useQuery({ queryKey: ['hire', 'jobs', status ?? 'all'], queryFn: () => api.get<{ items: Job[]; total: number; canManage: boolean }>(`/hire/jobs${qs({ status })}`) });
}

export function useInterviewers(enabled = true) {
  return useQuery({ queryKey: ['hire', 'interviewers'], queryFn: () => api.get<{ items: { userId: string; name: string; roles: string[]; title: string | null }[] }>('/hire/interviewers'), enabled });
}
