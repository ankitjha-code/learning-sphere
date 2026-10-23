export type Requirement = { id: string; text: string; acceptance: string[]; done: boolean; optional?: boolean };

export type TemplateSummary = {
  id: string;
  slug: string;
  title: string;
  category: string;
  difficulty: string;
  summary: string;
  skillSlugs: string[];
  trackSlugs: string[];
  estimatedHours: number;
  isCapstone: boolean;
  milestoneCount: number;
  requirementCount: number;
};

export type TemplateDetail = TemplateSummary & {
  problem: string;
  intendedUsers: string;
  objectives: string[];
  requirements: { id: string; text: string; acceptance: string[]; optional?: boolean }[];
  milestones: { title: string; tasks: string[]; weekOffset: number }[];
};

export type ProjectListItem = {
  id: string;
  title: string;
  category: string;
  status: string;
  mode: string;
  visibility: string;
  ownerId: string;
  ownerName: string;
  orgId: string | null;
  dueAt: string | null;
  approvedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  role: string;
  progress: number;
};

export type Milestone = { id: string; title: string; dueAt: string | null; status: 'open' | 'done'; sortOrder: number; completedAt: string | null };

export type Task = {
  id: string;
  milestoneId: string | null;
  title: string;
  description: string | null;
  kind: 'task' | 'bug' | 'issue';
  status: 'todo' | 'doing' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high';
  assigneeId: string | null;
  sortOrder: number;
  createdBy: string;
  createdAt: string;
};

export type TeamMember = { userId: string; role: string; name: string; avatarColor: string | null; email: string; addedAt: string };

export type Review = {
  id: string;
  reviewerId: string;
  reviewerName: string;
  kind: 'feedback' | 'code_review' | 'approval' | 'changes_requested';
  rubricScores: { criterion: string; points: number; max: number; comment?: string }[] | null;
  body: string;
  confirmedSkillIds: string[];
  createdAt: string;
};

export type DocKey = 'architecture' | 'dataModel' | 'api' | 'testPlan' | 'deployment' | 'retrospective' | 'readme';

export type ProjectDetail = {
  project: {
    id: string;
    ownerId: string;
    orgId: string | null;
    title: string;
    category: string;
    mode: 'guided' | 'partial' | 'independent';
    problem: string;
    intendedUsers: string;
    objectives: string[];
    requirements: Requirement[];
    docs: Partial<Record<DocKey, string>>;
    repoUrl: string | null;
    demoUrl: string | null;
    skillIds: string[];
    status: string;
    visibility: 'private' | 'unlisted' | 'public';
    approvedAt: string | null;
    approvedBy: string | null;
    startedAt: string;
    dueAt: string | null;
    completedAt: string | null;
    updatedAt: string;
    privateNotes?: string | null;
  };
  access: { role: string | null; isOwner: boolean; canEdit: boolean; canReview: boolean; orgStaff: boolean };
  settings: { showTasksPublic: boolean; screenshotLinks: { url: string; caption?: string; fileId?: string }[]; shareToken: string | null };
  template: { slug: string; title: string; isCapstone: boolean } | null;
  milestones: Milestone[];
  tasks: Task[];
  team: TeamMember[];
  invites: { id: string; role: string; status: string; name: string; email: string; createdAt: string }[];
  reviews: Review[];
  skills: { id: string; slug: string; name: string }[];
  rubric: { id: string; title: string; criteria: { id: string; title: string; description?: string; levels: { label: string; points: number }[] }[] } | null;
  reviewer: { id: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
  progress: { percent: number; formula: string; parts: { key: string; label: string; done: number; total: number; weight: number }[] };
  guide: { mode: string; checkpoints?: { title: string; done: boolean; tasks: string[] }[]; next?: string | null; hints?: { milestone: string; tasks: string[] }[] } | null;
  docSections: { key: DocKey; label: string }[];
};

export const CATEGORY_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  fullstack: 'Full-stack',
  api: 'APIs',
  automation: 'Automation',
  data: 'Data science',
  ml: 'Machine learning',
  ai: 'AI apps',
  mobile: 'Mobile',
  devtools: 'Developer tools',
  open_source: 'Open source',
  enterprise: 'Enterprise simulation',
};

export const MODE_INFO: Record<string, { label: string; hint: string }> = {
  guided: { label: 'Guided', hint: 'Requirements with acceptance criteria, milestones and a ready task board with checkpoints.' },
  partial: { label: 'Partially guided', hint: 'Requirements and milestones are set; you plan the tasks. Template hints available on request.' },
  independent: { label: 'Independent', hint: 'Requirement statements only. You write acceptance criteria and plan everything yourself.' },
};

export const STATUS_COLUMNS: { key: Task['status']; label: string }[] = [
  { key: 'todo', label: 'To do' },
  { key: 'doing', label: 'Doing' },
  { key: 'review', label: 'In review' },
  { key: 'done', label: 'Done' },
];
