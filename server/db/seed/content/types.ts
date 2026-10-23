// Authoring format for the built-in learning library. Seeded idempotently (upsert by slug).

export type SeedOption = { id: string; text: string };

export type SeedQuestion = {
  key: string; // unique within the topic, e.g. "q1"
  type: 'single' | 'multi' | 'true_false' | 'fill_blank' | 'matching';
  title: string; // short label
  prompt: string; // markdown
  options?: SeedOption[]; // single / multi / true_false (use ids "true"/"false")
  correct?: string[]; // option ids
  accepted?: string[][]; // fill_blank: accepted answers per blank (case-insensitive)
  pairs?: { left: SeedOption[]; right: SeedOption[] }; // matching
  matches?: Record<string, string>; // left id -> right id
  explanation: string; // shown after the quiz is graded
  difficulty?: 'easy' | 'medium' | 'hard';
};

export type SeedResource = { title: string; url: string; source: string; kind: 'docs' | 'article' | 'video' | 'course' | 'book' | 'interactive' | 'cheatsheet' };

export type SeedPractice = { title: string; kind: 'problem' | 'quiz' | 'exercise' | 'sql'; ref?: string; prompt?: string };

export type SeedTopic = {
  slug: string;
  title: string;
  module: string; // grouping inside the track
  skill: string; // skill slug from skills.ts
  minutes: number;
  objectives: string[];
  body: string; // markdown: explanation + worked examples
  practice: SeedPractice[]; // ref = problem slug for kind problem/sql
  resources: SeedResource[]; // real, stable, free URLs only
  quiz?: SeedQuestion[]; // 3-5 objective questions for complete tracks
  milestone?: boolean;
  completionCriteria?: string;
};

export type SeedTrack = {
  slug: string;
  title: string;
  category: string; // must be one of TRACK_CATEGORIES
  summary: string; // one sentence
  description: string; // markdown: who it's for, prerequisites, outcomes
  level: 'beginner' | 'intermediate' | 'advanced';
  estimatedHours: number;
  roles: string[]; // target roles this serves (used to suggest tracks)
  contentStatus: 'complete' | 'outline';
  prerequisites?: string[]; // other track slugs
  topics: SeedTopic[];
};

export type SeedTest = { name: string; input: string; expected: string };

export type SeedProblem = {
  slug: string;
  title: string;
  type: 'coding' | 'sql';
  difficulty: 'easy' | 'medium' | 'hard';
  skills: string[]; // skill slugs
  topics: string[]; // free-form tags, e.g. ["arrays", "hashing"]
  prompt: string; // markdown; for coding describe the exact stdin/stdout format
  constraints?: string;
  hints: string[]; // progressive: nudge → approach → near-solution
  explanation: string; // shown after solving / for study
  source?: string; // attribution if adapted
  // coding (stdin → stdout)
  starterCode?: Partial<Record<'python' | 'javascript' | 'typescript' | 'java' | 'cpp' | 'c' | 'go' | 'rust', string>>;
  visibleTests?: SeedTest[];
  hiddenTests?: SeedTest[];
  solutions?: Partial<Record<'python' | 'javascript', string>>; // reference solutions, verified by scripts/verify-problems.ts
  timeLimitMs?: number;
  // sql
  schemaSql?: string; // CREATE TABLE statements (shown to learner)
  seedSql?: string; // INSERTs (hidden from learner)
  solutionSql?: string; // reference query; expected result is computed by running it
  orderMatters?: boolean;
};

export type SeedProjectTemplate = {
  slug: string;
  title: string;
  category: 'beginner' | 'fullstack' | 'api' | 'automation' | 'data' | 'ml' | 'ai' | 'mobile' | 'devtools' | 'open_source' | 'enterprise';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  summary: string;
  problem: string;
  intendedUsers: string;
  objectives: string[];
  requirements: { id: string; text: string; acceptance: string[]; optional?: boolean }[];
  milestones: { title: string; tasks: string[]; weekOffset: number }[];
  skillSlugs: string[];
  trackSlugs: string[];
  estimatedHours: number;
  isCapstone?: boolean;
};

export const TRACK_CATEGORIES = [
  'programming',
  'web',
  'dsa',
  'design',
  'system-design',
  'databases',
  'cs-fundamentals',
  'devops',
  'ai-ml',
  'math',
  'quality',
  'collaboration',
  'professional',
  'career',
] as const;
