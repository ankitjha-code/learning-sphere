export type EligibilityRules = {
  programIds?: string[];
  graduationYears?: number[];
  minCgpa?: number | null;
  maxActiveBacklogs?: number | null;
  minAttendance?: number | null;
  requiredSkillSlugs?: string[];
  requireVerifiedRecord?: boolean;
};

export type Department = { id: string; name: string; code: string; headUserId: string | null; programs: number; students: number };
export type Program = { id: string; name: string; code: string; departmentId: string | null; durationYears: number; students: number };
export type Term = { id: string; name: string; startsOn: string; endsOn: string; isCurrent: boolean };
export type Batch = { id: string; name: string; programId: string | null; termId: string | null; graduationYear: number | null; members: number };
export type Structure = { departments: Department[]; programs: Program[]; terms: Term[]; batches: Batch[] };

export type StudentRecordRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  rollNumber: string;
  programId: string | null;
  programName: string | null;
  programCode: string | null;
  departmentId: string | null;
  graduationYear: number | null;
  cgpa: number | null;
  activeBacklogs: number | null;
  attendancePercent: number | null;
  status: string;
  placementOptIn: boolean;
  verifiedAt: string | null;
  notes: string | null;
  gaps: string[];
  openCorrections: number;
};

export type RuleCheck = {
  key: string;
  label: string;
  status: 'met' | 'not_met' | 'unknown';
  detail: string;
  skill?: { slug: string; name: string; state: string; verified: boolean; evidenceCount: number; lastEvidenceAt: string | null; sources: string[] };
};
export type Tri = true | false | 'unknown';
export type Eligibility = { eligible: Tri; reasons: string[]; unknown: string[]; checks: RuleCheck[] };

export type Drive = {
  id: string;
  orgId: string;
  title: string;
  companyName: string;
  companyOrgId: string | null;
  roleTitle: string;
  description: string | null;
  ctcText: string | null;
  location: string | null;
  eligibility: EligibilityRules;
  registrationDeadline: string | null;
  assessmentId: string | null;
  stages: string[];
  status: 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
};

export type Funnel = { invited: number; registered: number; assessed: number; interviewed: number; offers: number; placed: number };

export type Snapshot = {
  eligible: boolean;
  status: 'eligible' | 'not_eligible' | 'needs_data';
  reasons: string[];
  unknown: string[];
  evaluatedAt: string;
  manualInclusion?: { reason: string; by: string; at: string };
} | null;

export type AssessmentView = { status: string; percent: number | null; score: number | null; maxScore: number | null; final: boolean; submittedAt?: string | null } | null;

export type Candidate = {
  id: string;
  driveId: string;
  userId: string;
  stage: string;
  eligibilitySnapshot: Snapshot;
  interviewAt: string | null;
  offerCtcText: string | null;
  notes: string | null;
  updatedAt: string;
  student: { name: string; email: string; rollNumber: string | null; recordId: string | null; programName: string | null };
  assessment: AssessmentView;
  interviews: { id: string; scheduledAt: string; status: string }[];
};

export type EvalItem = {
  userId: string;
  name: string;
  email: string;
  recordId: string | null;
  rollNumber: string | null;
  verified: boolean;
  eligible: Tri;
  reasons: string[];
  unknown: string[];
  checks: RuleCheck[];
  candidateStage: string | null;
};

export type Interview = {
  id: string;
  title: string;
  kind: string;
  scheduledAt: string;
  durationMinutes: number;
  meetingUrl: string | null;
  meetingProvider: string | null;
  status: string;
  interviewers: { name: string; email?: string | null }[];
  notes: string | null;
  outcome: string | null;
  outcomeNote: string | null;
  candidate: { id: string; name: string; email: string; stage: string };
};
