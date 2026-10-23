export type SectionKey = 'projects' | 'skills' | 'assessments' | 'writing' | 'achievements' | 'experience' | 'education';

export type PortfolioProject = {
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

export type PortfolioSkill = {
  skillId: string;
  slug: string;
  name: string;
  category: string;
  mastery: number | null;
  provenance: 'verified' | 'demonstrated' | 'learning' | 'self_reported';
  label: string;
  lastEvidenceAt: string | null;
  lastVerifiedAt: string | null;
  evidenceCount: number;
  history: { at: string; score: number; source: string; sourceLabel: string; verified: boolean }[];
  hidden: boolean;
};

export type PortfolioCertificate = {
  id: string;
  kind: 'platform_completion' | 'external_self_reported';
  title: string;
  issuer: string;
  issuedAt: string;
  verificationCode: string | null;
  credentialUrl: string | null;
  label: string;
  hidden: boolean;
};

export type ComposedPortfolio = {
  owner: { name: string; avatarColor: string | null; location: string | null; links: { label: string; url: string }[] };
  portfolio: { slug: string; visibility: string; headline: string | null; about: string | null; version: number; updatedAt: string };
  sections: { key: SectionKey; visible: boolean; label: string }[];
  projects: PortfolioProject[];
  skills: PortfolioSkill[];
  assessments: { attemptId: string; title: string; scorePercent: number; at: string | null; shown: boolean }[];
  achievements: { id: string; key: string; title: string; description: string | null; awardedAt: string; verified: boolean; hidden: boolean }[];
  certificates: PortfolioCertificate[];
  writing: { title: string; url: string; summary?: string }[];
  experience: { company: string; title: string; start?: string; end?: string; summary?: string }[];
  education: { institution: string; degree?: string; field?: string; startYear?: number; endYear?: number; grade?: string }[];
};

export type OwnerPortfolio = {
  slug: string;
  visibility: 'private' | 'unlisted' | 'public';
  shareToken: string | null;
  sharePath: string | null;
  headline: string | null;
  about: string | null;
  sections: { key: SectionKey; visible: boolean; label: string }[];
  featuredProjectIds: string[];
  hiddenEvidenceIds: string[];
  writing: { title: string; url: string; summary?: string }[];
  shownAttemptIds: string[];
  version: number;
  updatedAt: string;
};

export type PublicProject = {
  project: {
    id: string;
    title: string;
    category: string;
    status: string;
    problem: string;
    intendedUsers: string;
    objectives: string[];
    requirements: { id: string; text: string; acceptance: string[]; done: boolean; optional: boolean }[];
    docs: Partial<Record<'architecture' | 'dataModel' | 'api' | 'testPlan' | 'deployment' | 'retrospective' | 'readme', string>>;
    repoUrl: string | null;
    demoUrl: string | null;
    screenshots: { url: string; caption?: string; isFile: boolean }[];
    startedAt: string;
    completedAt: string | null;
    templateTitle: string | null;
    isCapstone: boolean;
  };
  ownerName: string;
  team: { name: string; role: string }[];
  skills: string[];
  milestones: { title: string; status: string; completedAt: string | null }[];
  tasks: { title: string; kind: string; status: string; priority: string }[] | null;
  progress: { percent: number; formula: string };
  verification: { kind: 'verified_by_reviewer'; label: string; reviewerName: string; at: string; body: string } | { kind: 'self_completed'; label: string } | null;
};
