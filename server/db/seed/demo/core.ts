import { db } from '../../client';
import { organizations, users, memberships, profiles, mentorProfiles } from '../../schema';
import { hashPassword } from '../../../lib/crypto';
import { DEMO_PASSWORD, demoEmail, type DemoContext } from './context';

const COLORS = ['#6d5efc', '#0ea5a4', '#e0598b', '#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ef4444'];

export async function seedDemoCore(): Promise<DemoContext> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  let colorIdx = 0;

  async function org(name: string, slug: string, kind: string, description: string, website?: string) {
    const [o] = await db.insert(organizations).values({ name, slug, kind, description, website, isSample: true }).returning({ id: organizations.id });
    return o.id;
  }
  async function user(local: string, name: string, extra: Partial<typeof users.$inferInsert> = {}, profile: Partial<typeof profiles.$inferInsert> = {}) {
    const [u] = await db
      .insert(users)
      .values({ email: demoEmail(local), name, passwordHash, isSample: true, avatarColor: COLORS[colorIdx++ % COLORS.length], timezone: 'Asia/Kolkata', ...extra })
      .returning({ id: users.id });
    await db.insert(profiles).values({ userId: u.id, onboardingCompletedAt: new Date(), ...profile });
    return u.id;
  }
  async function member(orgId: string, userId: string, roles: string[], title?: string) {
    await db.insert(memberships).values({ orgId, userId, roles, title });
  }

  const northbridge = await org('Northbridge Institute of Technology', 'northbridge', 'college', 'Sample engineering college used for demonstration.');
  const riverside = await org('Riverside College', 'riverside', 'college', 'Second sample college, used to demonstrate tenant isolation.');
  const helix = await org('Helix Labs', 'helix-labs', 'company', 'Sample product company hiring engineers.', 'https://example.com');
  const orbit = await org('Orbit Systems', 'orbit-systems', 'company', 'Second sample company, used to demonstrate tenant isolation.');
  const community = await org('LearnSphere Community', 'learnsphere-community', 'community', 'Sample community organization for creators and mentors.');

  const admin = await user('admin', 'Priya Admin', { platformRole: 'platform_admin' });
  const learner = await user('learner', 'Asha Verma', {}, {
    headline: 'Career switcher learning backend development',
    stage: 'career_switcher',
    targetRoles: ['Backend Developer'],
    weeklyHours: 8,
    learningStyle: 'guided',
    preferredLanguages: ['python', 'javascript'],
    interests: ['APIs', 'databases'],
    experience: [{ company: 'City Library', title: 'Operations Assistant', start: '2021-06', end: '2025-12', summary: 'Ran circulation reports in spreadsheets.' }],
    education: [{ institution: 'State University', degree: 'B.Com', field: 'Commerce', endYear: 2021 }],
  });
  const student = await user('student', 'Rohan Iyer', {}, {
    headline: 'CS undergraduate, 3rd year',
    stage: 'college_student',
    targetRoles: ['Software Engineer'],
    weeklyHours: 10,
    learningStyle: 'project_first',
    preferredLanguages: ['python', 'java'],
    education: [{ institution: 'Northbridge Institute of Technology', degree: 'B.Tech', field: 'Computer Science', startYear: 2023, endYear: 2027 }],
  });
  const studentNames = ['Meera Nair', 'Kabir Shah', 'Ananya Gupta', 'Dev Malhotra', 'Sara Thomas', 'Arjun Rao'];
  const students: string[] = [];
  for (const [i, n] of studentNames.entries()) {
    students.push(await user(`student${i + 2}`, n, {}, { stage: 'college_student', targetRoles: ['Software Engineer'], education: [{ institution: 'Northbridge Institute of Technology', degree: 'B.Tech', field: 'Computer Science', endYear: 2027 }] }));
  }
  const faculty = await user('faculty', 'Dr. Neha Kulkarni', {}, { headline: 'Associate Professor, Computer Science' });
  const orgAdmin = await user('orgadmin', 'Vikram Sethi', {}, { headline: 'Academic administrator' });
  const placement = await user('placement', 'Farah Khan', {}, { headline: 'Training & Placement Officer' });
  const recruiter = await user('recruiter', 'Jordan Lee', {}, { headline: 'Technical Recruiter at Helix Labs' });
  const interviewer = await user('interviewer', 'Sam Okafor', {}, { headline: 'Senior Engineer at Helix Labs' });
  const mentor = await user('mentor', 'Lina Park', {}, { headline: 'Staff Engineer, 10 years in backend systems' });
  const creator = await user('creator', 'Omar Haddad', {}, { headline: 'Educator and technical writer' });
  const riversideFaculty = await user('faculty.riverside', 'Prof. Daniel Mensah', {}, { headline: 'Lecturer, Riverside College' });
  const riversideStudent = await user('student.riverside', 'Grace Owusu', {}, { stage: 'college_student' });
  const orbitRecruiter = await user('recruiter.orbit', 'Mia Chen', {}, { headline: 'Recruiter at Orbit Systems' });

  await member(northbridge, student, ['student']);
  for (const s of students) await member(northbridge, s, ['student']);
  await member(northbridge, faculty, ['faculty'], 'Associate Professor');
  await member(northbridge, orgAdmin, ['org_admin', 'faculty_admin'], 'Dean of Academics');
  await member(northbridge, placement, ['placement_officer'], 'Training & Placement Officer');
  await member(northbridge, mentor, ['mentor'], 'Alumni mentor');
  await member(riverside, riversideFaculty, ['faculty']);
  await member(riverside, riversideStudent, ['student']);
  await member(helix, recruiter, ['recruiter_admin', 'recruiter'], 'Technical Recruiter');
  await member(helix, interviewer, ['interviewer'], 'Senior Engineer');
  await member(orbit, orbitRecruiter, ['recruiter_admin', 'recruiter']);
  await member(community, creator, ['creator']);
  await member(community, mentor, ['mentor']);

  await db.insert(mentorProfiles).values({
    userId: mentor,
    headline: 'Staff Engineer · backend, databases, system design',
    bio: 'I help early-career engineers plan their learning, review projects and prepare for interviews. I have hired and mentored engineers for a decade.',
    expertise: ['backend', 'databases', 'system design', 'career planning', 'python'],
    yearsExperience: 10,
    availability: [
      { day: 2, start: '18:00', end: '20:00' },
      { day: 6, start: '10:00', end: '12:00' },
    ],
    maxMentees: 6,
    status: 'active',
  });

  return {
    password: DEMO_PASSWORD,
    orgs: { northbridge, riverside, helix, orbit, community },
    users: { admin, learner, student, students, faculty, orgAdmin, placement, recruiter, interviewer, mentor, creator, riversideFaculty, riversideStudent, orbitRecruiter },
  };
}
