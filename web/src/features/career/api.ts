// Types mirroring /api/career responses.

export type ResumeData = {
  basics: { name: string; email?: string; phone?: string; location?: string; headline?: string; links?: { label: string; url: string }[] };
  summary?: string;
  experience: { id: string; company: string; title: string; start?: string; end?: string; bullets: string[] }[];
  education: { id: string; institution: string; degree?: string; field?: string; start?: string; end?: string; grade?: string }[];
  projects: { id: string; name: string; url?: string; bullets: string[]; projectId?: string }[];
  skills: { group: string; items: string[] }[];
  certifications: { id: string; name: string; issuer?: string; date?: string }[];
  sectionOrder: string[];
};

export type ResumeSummary = { id: string; title: string; template: string; targetRole: string | null; version: number; parentId: string | null; isPrimary: boolean; updatedAt: string; createdAt: string };
export type Resume = ResumeSummary & { data: ResumeData; userId: string };

export type ResumeCheck = { id: string; severity: 'error' | 'warning' | 'tip'; category: string; section: string; path?: string; message: string; question?: string };
export type ChecksResponse = { checks: ResumeCheck[]; stats: { words: number; bullets: number; sections: number } };

export type ProposedField = { id: string; path: string; section: string; label: string; value: string | string[]; confidence: 'high' | 'medium' | 'low'; sourceLine: string };

export type AiFailure = { ok: false; reason: string; message: string; retryAfterSeconds?: number };

export type GapStatus = 'verified' | 'demonstrated' | 'learning' | 'self_reported' | 'none';
export type SkillRow = { slug: string; name: string; required: boolean; status: GapStatus; revisionDue: boolean; evidence: string; lastEvidenceAt: string | null; points: number; weight: number; snippet?: string; matched?: string[] };
export type ChecklistItem = { id: string; label: string; done: boolean; hint: string; link: string };
export type Analysis = {
  computedAt: string;
  score: number | null;
  formula: { text: string; note: string; points: Record<GapStatus, number>; weights: { required: number; preferred: number } };
  skills: SkillRow[];
  counts: { required: number; preferred: number; strong: number; gaps: number };
  plan: {
    gaps: { slug: string; name: string; required: boolean; status: GapStatus }[];
    topics: { skill: string; title: string; trackTitle: string; minutes: number; link: string }[];
    practice: { skill: string; title: string; difficulty: string; kind: string; link: string }[];
    projects: { title: string; difficulty: string; estimatedHours: number; covers: string[]; link: string }[];
  };
  checklist: ChecklistItem[];
  checklistDone: number;
  aiSuggestedSkills: { slug: string; name: string; required: boolean }[];
};
export type Target = { id: string; title: string; company: string | null; url: string | null; description: string; extractedSkills: { slug: string; name: string; required: boolean }[]; createdAt: string };
export type TargetSummary = { id: string; title: string; company: string | null; url: string | null; createdAt: string; skills: number; requiredSkills: number; score: number | null; checklistDone: number | null; checklistTotal: number | null; computedAt: string | null };

export const APP_STATUSES = ['saved', 'applied', 'assessment', 'interview', 'offer', 'accepted', 'rejected', 'withdrawn'] as const;
export type AppStatus = (typeof APP_STATUSES)[number];
export const STATUS_LABEL: Record<AppStatus, string> = {
  saved: 'Saved',
  applied: 'Applied',
  assessment: 'Assessment',
  interview: 'Interview',
  offer: 'Offer',
  accepted: 'Accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};
export const SOURCE_LABEL: Record<string, string> = { manual: 'Added by you', platform: 'Applied on platform', feed: 'Public job feed', referral: 'Referral', campus: 'Campus' };

export type Offer = { baseSalary?: number; currency?: string; bonus?: number; equity?: string; location?: string; remote?: string; startDate?: string; deadline?: string; benefits?: string; notes?: string };
export type Round = { id: string; name: string; at?: string; status: 'scheduled' | 'done' | 'cancelled'; feedback?: string };
export type Contact = { name: string; role?: string; email?: string; note?: string };
export type Application = {
  id: string;
  company: string;
  role: string;
  source: string;
  sourceUrl: string | null;
  jobPostingId: string | null;
  jobApplicationId: string | null;
  location: string | null;
  status: AppStatus;
  appliedAt: string | null;
  deadline: string | null;
  resumeId: string | null;
  coverLetterId: string | null;
  salaryText: string | null;
  notes: string | null;
  contacts: Contact[];
  rounds: Round[];
  offer: Offer | null;
  outcomeReason: string | null;
  nextActionAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type AppEvent = { id: string; kind: string; fromStatus: string | null; toStatus: string | null; note: string | null; createdAt: string };

export type DocKind = 'cover_letter' | 'answer' | 'outreach' | 'cold_email' | 'follow_up' | 'bio' | 'project_summary';
export const DOC_KIND_LABEL: Record<DocKind, string> = {
  cover_letter: 'Cover letter',
  answer: 'Application answer',
  outreach: 'Recruiter outreach',
  cold_email: 'Cold email',
  follow_up: 'Follow-up',
  bio: 'Professional bio',
  project_summary: 'Project summary',
};
export type CareerDoc = { id: string; kind: DocKind; title: string; body: string; applicationId: string | null; jobDescription: string | null; aiAssisted: boolean; createdAt: string; updatedAt: string; placeholders?: number };

export type FeedbackItem = { label: string; met: boolean; note?: string };
export type Feedback = { source: 'checklist' | 'ai' | 'mentor'; items: FeedbackItem[]; summary?: string };
export type FeedbackStats = { words: number; fillerCount: number; fillers: Record<string, number>; speakingSeconds: number; iCount: number; weCount: number };
export type Practice = { id: string; kind: string; question: string; answer: string; selfRating: number | null; feedback: Feedback | null; createdAt: string };
export type BankQuestion = { id: string; kind: string; prompt: string; guidance: string; modelAnswer?: string; role?: string; link?: string; difficulty?: string };
export type MockQuestion = { id: string; kind: string; prompt: string; practiceId?: string; durationSec?: number; checklistMet?: number; checklistTotal?: number };
export type Mock = {
  id: string;
  kinds: string[];
  minutesPerQuestion: number;
  questions: MockQuestion[];
  status: 'in_progress' | 'completed' | 'abandoned';
  summary: { answered: number; total: number; avgChecklist: number | null; overTime: number; totalSeconds: number; weakest: { label: string; count: number }[]; note: string } | null;
  startedAt: string;
  completedAt: string | null;
};

/** Pull "[Add: ...]" placeholders out of a draft. */
export const PLACEHOLDER_RE = /\[Add: [^\]]+\]/g;

/** True when the AI endpoint answered with an honest "unavailable" result. */
export function isAiFailure(x: unknown): x is AiFailure {
  return !!x && typeof x === 'object' && (x as { ok?: unknown }).ok === false;
}
