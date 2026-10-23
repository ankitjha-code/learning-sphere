/** IDs created by the core demo seed, passed to every module's demo seeder. */
export type DemoContext = {
  password: string;
  orgs: { northbridge: string; riverside: string; helix: string; orbit: string; community: string };
  users: {
    admin: string;
    learner: string; // independent learner (no org) — Journey 1 persona
    student: string; // Northbridge student
    students: string[]; // more Northbridge students (cohort)
    faculty: string;
    orgAdmin: string;
    placement: string;
    recruiter: string;
    interviewer: string;
    mentor: string;
    creator: string;
    riversideFaculty: string;
    riversideStudent: string;
    orbitRecruiter: string;
  };
};

export const DEMO_PASSWORD = 'Demo-pass-2026';
export const DEMO_DOMAIN = 'demo.learnsphere.test';
export const demoEmail = (local: string) => `${local}@${DEMO_DOMAIN}`;

export const DEMO_ACCOUNTS = [
  { local: 'learner', role: 'Learner (independent)', description: 'Career switcher building toward a backend role' },
  { local: 'student', role: 'College student', description: 'Northbridge student in a cohort with assignments' },
  { local: 'faculty', role: 'Faculty', description: 'Teaches Data Structures at Northbridge' },
  { local: 'placement', role: 'Placement officer', description: 'Runs placement drives at Northbridge' },
  { local: 'recruiter', role: 'Recruiter admin', description: 'Hiring at Helix Labs' },
  { local: 'interviewer', role: 'Interviewer', description: 'Gives interview feedback at Helix Labs' },
  { local: 'mentor', role: 'Mentor', description: 'Senior engineer mentoring learners' },
  { local: 'creator', role: 'Content creator', description: 'Publishes resources and quizzes' },
  { local: 'orgadmin', role: 'Organization admin', description: 'Administers Northbridge' },
  { local: 'admin', role: 'Platform admin', description: 'Operates the whole platform' },
  { local: 'faculty.riverside', role: 'Faculty (other college)', description: 'Riverside College: used to show tenant isolation' },
];
