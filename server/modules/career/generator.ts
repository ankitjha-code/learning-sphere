/**
 * Template-based document generator. Always available (no AI).
 * It only fills in facts the user provided; every missing fact becomes a visible
 * [Add: ...] placeholder so nothing is invented.
 */
import { introducesNumbers } from './resume';

export const DOC_KINDS = ['cover_letter', 'answer', 'outreach', 'cold_email', 'follow_up', 'bio', 'project_summary'] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  cover_letter: 'Cover letter',
  answer: 'Application answer',
  outreach: 'Recruiter outreach',
  cold_email: 'Cold email',
  follow_up: 'Follow-up',
  bio: 'Professional bio',
  project_summary: 'Project summary',
};

export type DocFacts = {
  name?: string;
  email?: string;
  role?: string;
  company?: string;
  recipientName?: string;
  currentRole?: string;
  whyCompany?: string;
  whyRole?: string;
  relevantExperience?: string;
  achievement?: string;
  skills?: string[];
  projectName?: string;
  projectDescription?: string;
  projectRole?: string;
  projectOutcome?: string;
  techStack?: string[];
  link?: string;
  availability?: string;
  question?: string;
  answerPoints?: string;
  mutualConnection?: string;
  interviewDate?: string;
  interviewerName?: string;
  topicDiscussed?: string;
  goal?: string;
};

export const PLACEHOLDER_RE = /\[Add: [^\]]+\]/g;

export function generateDocument(kind: DocKind, facts: DocFacts): { title: string; body: string; placeholders: string[]; usedFacts: string[] } {
  const used = new Set<string>();
  const missing: string[] = [];
  const f = (key: keyof DocFacts, hint: string): string => {
    const v = facts[key];
    const val = Array.isArray(v) ? v.filter(Boolean).join(', ') : typeof v === 'string' ? v.trim() : '';
    if (val) {
      used.add(key);
      return val;
    }
    missing.push(hint);
    return `[Add: ${hint}]`;
  };
  /** Optional sentence: included only when the fact exists; otherwise omitted rather than invented. */
  const opt = (key: keyof DocFacts, render: (v: string) => string): string => {
    const v = facts[key];
    const val = Array.isArray(v) ? v.filter(Boolean).join(', ') : typeof v === 'string' ? v.trim() : '';
    if (!val) return '';
    used.add(key);
    return render(val);
  };

  const greeting = facts.recipientName?.trim() ? `Dear ${f('recipientName', 'recipient name')},` : 'Dear Hiring Team,';
  let title = '';
  let body = '';

  switch (kind) {
    case 'cover_letter':
      title = `Cover letter: ${facts.role || 'role'} at ${facts.company || 'company'}`;
      body = [
        greeting,
        '',
        `I am applying for the ${f('role', 'role title')} position at ${f('company', 'company name')}. ${f('whyCompany', 'one specific reason this company interests you')}`,
        '',
        `${opt('currentRole', (v) => `I currently work as ${v}. `)}${f('relevantExperience', 'your most relevant experience, in your own words')}`,
        '',
        `${opt('skills', (v) => `The skills I would bring include ${v}. `)}${f('achievement', 'one real accomplishment you can describe in an interview (leave out numbers you cannot back up)')}`,
        '',
        `${opt('whyRole', (v) => `${v} `)}I would welcome the chance to discuss how I can contribute.${opt('availability', (v) => ` I am available ${v}.`)}`,
        '',
        'Sincerely,',
        f('name', 'your name'),
        opt('email', (v) => v),
      ]
        .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
        .join('\n')
        .trim();
      break;
    case 'answer':
      title = `Answer: ${(facts.question || 'application question').slice(0, 60)}`;
      body = [
        `Question: ${f('question', 'the exact question from the application')}`,
        '',
        f('answerPoints', 'the points you want to make, in your own words'),
        '',
        opt('relevantExperience', (v) => `Relevant experience: ${v}`),
        opt('achievement', (v) => `Example: ${v}`),
      ]
        .filter(Boolean)
        .join('\n')
        .trim();
      break;
    case 'outreach':
      title = `Outreach: ${facts.company || 'company'}`;
      body = [
        `Hi ${f('recipientName', 'recruiter name')},`,
        '',
        `I'm ${f('name', 'your name')}${opt('currentRole', (v) => `, currently ${v}`)}. I'm interested in the ${f('role', 'role title')} opening at ${f('company', 'company name')}${opt('mutualConnection', (v) => ` (${v} suggested I reach out)`)}.`,
        '',
        `${f('relevantExperience', 'one or two sentences on your most relevant experience')}${opt('link', (v) => ` You can see my work here: ${v}.`)}`,
        '',
        'Would you be open to a short conversation about the role?',
        '',
        'Thank you,',
        f('name', 'your name'),
      ].join('\n');
      break;
    case 'cold_email':
      title = `Cold email: ${facts.company || 'company'}`;
      body = [
        `Subject: ${facts.role ? `Interest in ${f('role', 'role')} roles` : `Question about opportunities at ${f('company', 'company name')}`}`,
        '',
        `Hi ${f('recipientName', 'recipient name')},`,
        '',
        `${f('whyCompany', 'why you are writing to this company specifically')}`,
        '',
        `About me: ${f('relevantExperience', 'your relevant background in one or two sentences')}${opt('skills', (v) => ` I work with ${v}.`)}`,
        '',
        `${opt('goal', (v) => `${v} `)}If there is a better person to contact, I'd appreciate a pointer.`,
        '',
        'Best regards,',
        f('name', 'your name'),
        opt('link', (v) => v),
      ]
        .join('\n')
        .trim();
      break;
    case 'follow_up':
      title = `Follow-up: ${facts.company || 'company'}`;
      body = [
        `Hi ${f('interviewerName', 'interviewer or recruiter name')},`,
        '',
        `Thank you for speaking with me${opt('interviewDate', (v) => ` on ${v}`)} about the ${f('role', 'role title')} role at ${f('company', 'company name')}.${opt('topicDiscussed', (v) => ` I especially enjoyed discussing ${v}.`)}`,
        '',
        `${opt('whyRole', (v) => `${v} `)}Please let me know if there is anything else I can share.`,
        '',
        'Best regards,',
        f('name', 'your name'),
      ].join('\n');
      break;
    case 'bio':
      title = 'Professional bio';
      body = [
        `${f('name', 'your name')} is ${f('currentRole', 'what you do now (for example "a career switcher learning backend development")')}.`,
        opt('relevantExperience', (v) => v),
        opt('skills', (v) => `Skills: ${v}.`),
        opt('projectName', (v) => `Recent project: ${v}${facts.projectDescription ? `, ${facts.projectDescription.trim()}` : ''}.`),
        opt('goal', (v) => `Currently focused on ${v}.`),
      ]
        .filter(Boolean)
        .join(' ');
      if (facts.projectDescription?.trim()) used.add('projectDescription');
      break;
    case 'project_summary':
      title = `Project summary: ${facts.projectName || 'project'}`;
      body = [
        `${f('projectName', 'project name')}`,
        '',
        `Problem: ${f('projectDescription', 'what the project does and the problem it solves')}`,
        `My role: ${f('projectRole', 'what you personally built or decided')}`,
        `Tech: ${f('techStack', 'technologies you actually used')}`,
        `Outcome: ${f('projectOutcome', 'what happened as a result (users, learning, status); leave out numbers you cannot back up')}`,
        opt('link', (v) => `Link: ${v}`),
      ]
        .filter((l) => l !== '')
        .join('\n');
      break;
  }
  return { title, body, placeholders: [...new Set(missing)], usedFacts: [...used] };
}

/** Text of all provided facts, used to verify AI drafts do not add numbers. */
export function factsText(facts: DocFacts): string {
  return Object.values(facts)
    .map((v) => (Array.isArray(v) ? v.join(' ') : String(v ?? '')))
    .join('\n');
}

/** Replaces any number the user did not provide with a visible confirmation marker. */
export function guardAiDraft(draft: string, sourceText: string): { body: string; flagged: number } {
  let flagged = 0;
  const body = draft.replace(/\d[\d,.]*%?/g, (m) => {
    if (!introducesNumbers(m, sourceText)) return m;
    flagged++;
    return '[Add: confirm this number or remove it]';
  });
  return { body, flagged };
}
