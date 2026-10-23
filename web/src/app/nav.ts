import type { Icon } from '@phosphor-icons/react';
import {
  HouseIcon,
  PathIcon,
  BooksIcon,
  CodeIcon,
  ExamIcon,
  HammerIcon,
  IdentificationBadgeIcon,
  SparkleIcon,
  UsersThreeIcon,
  HandshakeIcon,
  NotebookIcon,
  DnaIcon,
  TargetIcon,
  FileTextIcon,
  EnvelopeSimpleIcon,
  KanbanIcon,
  BriefcaseIcon,
  MicrophoneStageIcon,
  ScalesIcon,
  BookOpenTextIcon,
  ChalkboardTeacherIcon,
  UsersIcon,
  ClipboardTextIcon,
  CheckSquareOffsetIcon,
  ListChecksIcon,
  ChartBarIcon,
  CalendarCheckIcon,
  BuildingsIcon,
  TreeStructureIcon,
  GraduationCapIcon,
  RocketLaunchIcon,
  FileMagnifyingGlassIcon,
  BuildingOfficeIcon,
  CalendarIcon,
  SealCheckIcon,
  UserCircleIcon,
  ChatsCircleIcon,
  PencilSimpleLineIcon,
  StackIcon,
  ShieldCheckIcon,
  RobotIcon,
  GearSixIcon,
  QueueIcon,
  ScrollIcon,
  FlagIcon,
  HeartbeatIcon,
  WarningDiamondIcon,
  TrophyIcon,
  BookBookmarkIcon,
  EyeIcon,
  TrendUpIcon,
} from '@phosphor-icons/react';
import type { Workspace } from '@shared/roles';

export type NavItem = { label: string; to: string; icon: Icon; end?: boolean; keywords?: string };
export type NavGroup = { label?: string; items: NavItem[] };

export const NAV: Record<Workspace, NavGroup[]> = {
  learner: [
    {
      items: [
        { label: 'Home', to: '/app', icon: HouseIcon, end: true },
        { label: 'Skill DNA', to: '/app/skills', icon: DnaIcon, keywords: 'progress mastery evidence' },
        { label: 'Roadmaps', to: '/app/learn', icon: PathIcon, keywords: 'learning paths tracks courses' },
        { label: 'Library', to: '/app/library', icon: BooksIcon, keywords: 'resources articles knowledge hub' },
        { label: 'CodeLab', to: '/app/practice', icon: CodeIcon, keywords: 'coding problems dsa sql practice' },
        { label: 'Assessments', to: '/app/assessments', icon: ExamIcon, keywords: 'tests quizzes exams diagnostic' },
        { label: 'Assignments', to: '/app/assignments', icon: ClipboardTextIcon, keywords: 'homework submissions grades' },
        { label: 'Projects', to: '/app/projects', icon: HammerIcon, keywords: 'projectforge build' },
        { label: 'Portfolio', to: '/app/portfolio', icon: IdentificationBadgeIcon },
        { label: 'Placements', to: '/app/placements', icon: BriefcaseIcon, keywords: 'campus drives eligibility interviews record' },
      ],
    },
    {
      label: 'Support',
      items: [
        { label: 'AI Council', to: '/app/ai', icon: SparkleIcon, keywords: 'assistant tutor chat' },
        { label: 'Mentors', to: '/app/mentors', icon: HandshakeIcon, keywords: 'mentorship sessions' },
        { label: 'Community', to: '/app/community', icon: UsersThreeIcon, keywords: 'discussions questions study groups' },
        { label: 'Goals & streaks', to: '/app/goals', icon: TrophyIcon, keywords: 'xp achievements leaderboard challenges' },
        { label: 'My workspace', to: '/app/workspace', icon: NotebookIcon, keywords: 'notes tasks calendar bookmarks' },
      ],
    },
  ],
  career: [
    {
      items: [
        { label: 'Career home', to: '/app/career', icon: RocketLaunchIcon, end: true },
        { label: 'Job targets', to: '/app/career/targets', icon: TargetIcon, keywords: 'skill gap job description analyzer' },
        { label: 'Resumes', to: '/app/career/resumes', icon: FileTextIcon },
        { label: 'Documents', to: '/app/career/documents', icon: EnvelopeSimpleIcon, keywords: 'cover letter outreach cold email' },
        { label: 'Applications', to: '/app/career/applications', icon: KanbanIcon, keywords: 'tracker pipeline' },
        { label: 'Job board', to: '/app/jobs', icon: BriefcaseIcon, keywords: 'openings vacancies' },
        { label: 'Market insights', to: '/app/career/market', icon: TrendUpIcon, keywords: 'skills demand trends job market' },
        { label: 'Interview prep', to: '/app/career/interview', icon: MicrophoneStageIcon, keywords: 'mock interview behavioral' },
        { label: 'Offers', to: '/app/career/offers', icon: ScalesIcon, keywords: 'compare offers decision' },
        { label: 'Growth journal', to: '/app/career/journal', icon: BookBookmarkIcon },
        { label: 'Recruiter visibility', to: '/app/career/discoverability', icon: EyeIcon, keywords: 'discoverable opt in privacy' },
      ],
    },
  ],
  teach: [
    {
      items: [
        { label: 'Overview', to: '/app/teach', icon: ChalkboardTeacherIcon, end: true },
        { label: 'Courses', to: '/app/teach/courses', icon: BookOpenTextIcon },
        { label: 'Cohorts', to: '/app/teach/cohorts', icon: UsersIcon, keywords: 'students sections batches' },
        { label: 'Assignments', to: '/app/teach/assignments', icon: ClipboardTextIcon },
        { label: 'Grading queue', to: '/app/teach/grading', icon: CheckSquareOffsetIcon, keywords: 'evaluate submissions regrade' },
        { label: 'Rubrics', to: '/app/teach/rubrics', icon: ScalesIcon, keywords: 'grading criteria' },
        { label: 'Question bank', to: '/app/teach/questions', icon: ListChecksIcon },
        { label: 'Assessments', to: '/app/teach/assessments', icon: ExamIcon, keywords: 'exams quizzes' },
        { label: 'Attendance', to: '/app/teach/attendance', icon: CalendarCheckIcon },
        { label: 'Analytics', to: '/app/teach/analytics', icon: ChartBarIcon, keywords: 'interventions cohort progress' },
      ],
    },
  ],
  campus: [
    {
      items: [
        { label: 'Overview', to: '/app/campus', icon: BuildingsIcon, end: true },
        { label: 'Structure', to: '/app/campus/structure', icon: TreeStructureIcon, keywords: 'departments programs terms' },
        { label: 'Students', to: '/app/campus/students', icon: GraduationCapIcon, keywords: 'records eligibility' },
        { label: 'People & roles', to: '/app/campus/people', icon: UsersIcon, keywords: 'faculty invite members' },
        { label: 'Employers', to: '/app/campus/employers', icon: BuildingOfficeIcon, keywords: 'companies relationships' },
        { label: 'Placement drives', to: '/app/campus/drives', icon: RocketLaunchIcon },
        { label: 'Assessments', to: '/app/campus/assessments', icon: ExamIcon, keywords: 'placement tests screening' },
        { label: 'Reports', to: '/app/campus/reports', icon: ChartBarIcon, keywords: 'placement outcomes readiness' },
      ],
    },
  ],
  hire: [
    {
      items: [
        { label: 'Overview', to: '/app/hire', icon: BriefcaseIcon, end: true },
        { label: 'Jobs', to: '/app/hire/jobs', icon: FileMagnifyingGlassIcon, keywords: 'postings openings' },
        { label: 'Candidates', to: '/app/hire/candidates', icon: UsersIcon, keywords: 'pipeline applications search' },
        { label: 'Assessments', to: '/app/hire/assessments', icon: ExamIcon, keywords: 'screening tests' },
        { label: 'Interviews', to: '/app/hire/interviews', icon: CalendarIcon, keywords: 'schedule feedback' },
        { label: 'Offers', to: '/app/hire/offers', icon: SealCheckIcon },
        { label: 'Analytics', to: '/app/hire/analytics', icon: ChartBarIcon, keywords: 'funnel conversion' },
        { label: 'Company & team', to: '/app/hire/company', icon: BuildingOfficeIcon },
      ],
    },
  ],
  mentor: [
    {
      items: [
        { label: 'Overview', to: '/app/mentor', icon: HandshakeIcon, end: true },
        { label: 'Mentees', to: '/app/mentor/mentees', icon: UsersIcon, keywords: 'requests goals progress' },
        { label: 'Sessions', to: '/app/mentor/sessions', icon: CalendarIcon },
        { label: 'Mentor profile', to: '/app/mentor/profile', icon: UserCircleIcon, keywords: 'availability expertise' },
      ],
    },
  ],
  create: [
    {
      items: [
        { label: 'Overview', to: '/app/create', icon: PencilSimpleLineIcon, end: true },
        { label: 'Resources', to: '/app/create/resources', icon: BooksIcon, keywords: 'articles publish' },
        { label: 'Learning paths', to: '/app/create/paths', icon: PathIcon, keywords: 'tracks lessons topics' },
        { label: 'Quizzes & questions', to: '/app/create/questions', icon: ListChecksIcon },
        { label: 'Discussions', to: '/app/community', icon: ChatsCircleIcon },
      ],
    },
  ],
  admin: [
    {
      items: [
        { label: 'Overview', to: '/app/admin', icon: ShieldCheckIcon, end: true },
        { label: 'Users', to: '/app/admin/users', icon: UsersIcon, keywords: 'suspend recover roles' },
        { label: 'Organizations', to: '/app/admin/orgs', icon: BuildingsIcon, keywords: 'tenants plans' },
        { label: 'AI providers', to: '/app/admin/ai', icon: RobotIcon, keywords: 'models quotas usage evaluation' },
        { label: 'Background jobs', to: '/app/admin/jobs', icon: QueueIcon, keywords: 'retry failed tasks' },
        { label: 'Moderation', to: '/app/admin/moderation', icon: FlagIcon, keywords: 'reports abuse' },
        { label: 'Audit log', to: '/app/admin/audit', icon: ScrollIcon },
        { label: 'Incidents', to: '/app/admin/incidents', icon: WarningDiamondIcon },
        { label: 'System health', to: '/app/admin/health', icon: HeartbeatIcon, keywords: 'status services' },
        { label: 'Platform settings', to: '/app/admin/settings', icon: GearSixIcon, keywords: 'features retention plans quotas' },
      ],
    },
  ],
};

export const WORKSPACE_HOME: Record<Workspace, string> = {
  learner: '/app',
  career: '/app/career',
  teach: '/app/teach',
  campus: '/app/campus',
  hire: '/app/hire',
  mentor: '/app/mentor',
  create: '/app/create',
  admin: '/app/admin',
};

export const WORKSPACE_ICON: Record<Workspace, Icon> = {
  learner: PathIcon,
  career: RocketLaunchIcon,
  teach: ChalkboardTeacherIcon,
  campus: BuildingsIcon,
  hire: BriefcaseIcon,
  mentor: HandshakeIcon,
  create: StackIcon,
  admin: ShieldCheckIcon,
};

/** Which workspace a path belongs to (so deep links switch the sidebar correctly). */
export function workspaceForPath(path: string): Workspace | null {
  const m = path.match(/^\/app\/(career|teach|campus|hire|mentor|create|admin)(\/|$)/);
  if (m) return m[1] as Workspace;
  if (path === '/app/jobs' || path.startsWith('/app/jobs/')) return 'career';
  return null;
}
