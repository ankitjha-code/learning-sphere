import { useMatches, useLocation } from 'react-router-dom';
import type { PublicQuestion } from '@/components/questions/ObjectiveQuestion';

export type AssessmentMode = 'practice' | 'diagnostic' | 'classroom' | 'recruitment' | 'placement';
export type QuestionType = 'single' | 'multi' | 'true_false' | 'matching' | 'fill_blank' | 'short_text' | 'long_text' | 'coding' | 'sql' | 'file' | 'oral';

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  single: 'Single choice',
  multi: 'Multiple choice',
  true_false: 'True / false',
  matching: 'Matching',
  fill_blank: 'Fill in the blank',
  short_text: 'Short answer',
  long_text: 'Long answer',
  coding: 'Coding',
  sql: 'SQL',
  file: 'File upload',
  oral: 'Oral',
};
export const QUESTION_TYPES = Object.keys(QUESTION_TYPE_LABEL) as QuestionType[];
export const MANUAL_TYPES: QuestionType[] = ['short_text', 'long_text', 'file', 'oral'];

export const MODE_LABEL: Record<AssessmentMode, string> = {
  practice: 'Practice',
  diagnostic: 'Diagnostic',
  classroom: 'Classroom exam',
  recruitment: 'Recruitment screen',
  placement: 'Placement test',
};

export const CODE_LANGUAGES = ['python', 'javascript', 'typescript', 'java', 'cpp', 'c', 'go', 'rust'] as const;

export type Settings = {
  timeLimitMinutes?: number | null;
  maxAttempts?: number | null;
  availableFrom?: string | null;
  availableUntil?: string | null;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  blueprint?: { topic?: string; difficulty?: string; type?: string; count: number; points?: number }[];
  resultRelease: 'immediate' | 'after_close' | 'manual';
  showAnswersAfterRelease?: boolean;
  passingScore?: number | null;
  allowRegradeRequests?: boolean;
  proctoringNote?: string;
  sections?: string[];
  personal?: boolean;
};

export type Content = {
  prompt: string;
  options?: { id: string; text: string }[];
  pairs?: { left: { id: string; text: string }[]; right: { id: string; text: string }[] };
  blanks?: number;
  languages?: string[];
  starterCode?: Record<string, string>;
  visibleTests?: { name: string; input: string; expected: string }[];
  constraints?: string;
  timeLimitMs?: number;
  memoryLimitMb?: number;
  schemaSql?: string;
  orderMatters?: boolean;
  wordLimit?: number;
  acceptedFileTypes?: string[];
  hints?: string[];
};

export type AnswerKey = {
  correct?: string[];
  accepted?: string[][];
  caseSensitive?: boolean;
  matches?: Record<string, string>;
  hiddenTests?: { name: string; input: string; expected: string; weight?: number }[];
  solutionSql?: string;
  seedSql?: string;
  modelAnswer?: string;
  rubric?: { criterion: string; points: number; guidance?: string }[];
  explanation?: string;
};

export type BankQuestion = {
  id: string;
  orgId: string | null;
  type: QuestionType;
  title: string;
  content: Content;
  answerKey: AnswerKey | null;
  keyHidden: boolean;
  difficulty: 'easy' | 'medium' | 'hard';
  topics: string[];
  skillIds: string[];
  points: number;
  version: number;
  status: 'active' | 'retired' | 'draft';
  visibility: string;
  isPractice: boolean;
  editable: boolean;
  updatedAt: string;
};

export type Assessment = {
  id: string;
  orgId: string | null;
  ownerId: string;
  title: string;
  description: string | null;
  mode: AssessmentMode;
  settings: Settings;
  status: 'draft' | 'published' | 'closed' | 'archived';
  version: number;
  skillIds: string[];
  cohortId: string | null;
  jobPostingId: string | null;
  driveId: string | null;
  publishedAt: string | null;
  updatedAt: string;
};

export type Checklist = { ready: boolean; problems: string[]; warnings: string[]; itemCount: number; blueprintCount: number; totalPoints: number };

export type ManagedItem = {
  id: string;
  points: number;
  sortOrder: number;
  section: string | null;
  questionVersion: number;
  latestVersion: number;
  question: BankQuestion | (PublicQuestion & { content: Content });
};

export type ManagedAssessment = {
  assessment: Assessment;
  access: 'view' | 'edit' | null;
  editable: boolean;
  itemsLocked: boolean;
  cohort: { id: string; name: string } | null;
  counts: { attempts: number; needsReview: number; awaitingRelease: number };
  checklist: Checklist;
  items: ManagedItem[];
};

export type Answer = { choice?: string; choices?: string[]; blanks?: string[]; matches?: Record<string, string>; text?: string; code?: string; language?: string; query?: string; link?: string };

export type ExecRun = {
  status: string;
  provider: string;
  passed?: number;
  total?: number;
  message?: string;
  compileOutput?: string;
  results?: { name: string; hidden: boolean; passed: boolean; status: string; timeMs: number | null; input?: string; expected?: string; actual?: string; stderr?: string }[];
  columns?: string[];
  rows?: unknown[][];
  durationMs?: number;
};

/** Where manager pages live (teach, hire, create, campus) and which modes they author. */
export type AssessmentScope = { basePath: string; modes: AssessmentMode[]; label: string };

export const SCOPES: Record<string, AssessmentScope> = {
  teach: { basePath: '/app/teach', modes: ['classroom', 'diagnostic', 'practice'], label: 'Teach' },
  hire: { basePath: '/app/hire', modes: ['recruitment'], label: 'Hire' },
  campus: { basePath: '/app/campus', modes: ['placement'], label: 'Campus' },
  create: { basePath: '/app/create', modes: ['practice', 'diagnostic', 'classroom'], label: 'Create' },
};

/**
 * Scope from explicit props, else the route `handle.assessmentScope`, else the
 * workspace segment of the URL. Lets the same pages mount under teach/hire/campus/create.
 */
export function useAssessmentScope(override?: Partial<AssessmentScope>): AssessmentScope {
  const matches = useMatches();
  const location = useLocation();
  const fromHandle = [...matches].reverse().map((m) => (m.handle as { assessmentScope?: AssessmentScope } | undefined)?.assessmentScope).find(Boolean);
  const seg = location.pathname.match(/^\/app\/(teach|hire|campus|create)\b/)?.[1] ?? 'teach';
  return { ...(fromHandle ?? SCOPES[seg]), ...override } as AssessmentScope;
}

export function percentLabel(score: number | null | undefined, max: number | null | undefined) {
  if (score === null || score === undefined || !max) return '—';
  return `${Math.round((score / max) * 1000) / 10}%`;
}
