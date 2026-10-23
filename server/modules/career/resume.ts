/**
 * Resume logic that never invents facts:
 * - importResumeText: deterministic parser that returns PROPOSED fields with confidence; nothing is saved here.
 * - checkResume: proofreading / ATS checks. Messages never contain numbers and never rewrite a fact.
 * - filterAiSuggestions: drops AI suggestions that introduce numbers absent from the source text.
 * - renderResumeHtml / renderResumeText: export.
 */
import { randomUUID } from 'node:crypto';
import type { ResumeData } from '../../db/schema/build';

export const DEFAULT_SECTION_ORDER = ['summary', 'experience', 'projects', 'education', 'skills', 'certifications'];
export const RESUME_TEMPLATES = ['clean', 'compact', 'modern'] as const;

export function emptyResume(name = ''): ResumeData {
  return { basics: { name, links: [] }, summary: '', experience: [], education: [], projects: [], skills: [], certifications: [], sectionOrder: [...DEFAULT_SECTION_ORDER] };
}

export const newId = () => randomUUID().slice(0, 8);

// ---------- Numbers helpers (honesty guard) ----------

/** Every number-like token in a text ("40%", "3", "1,200", "2.5x", "$10k"), normalized. */
export function numberTokens(text: string): string[] {
  return (text.match(/\d[\d,.]*/g) ?? []).map((t) => t.replace(/[,]/g, '').replace(/\.$/, ''));
}

/** True when `candidate` contains a number that does not appear anywhere in `source`. */
export function introducesNumbers(candidate: string, source: string): boolean {
  const known = new Set(numberTokens(source));
  return numberTokens(candidate).some((n) => !known.has(n));
}

export function resumeToPlainText(d: ResumeData): string {
  const parts: string[] = [];
  const b = d.basics;
  parts.push([b.name, b.headline].filter(Boolean).join(' - '));
  parts.push([b.email, b.phone, b.location, ...(b.links ?? []).map((l) => l.url)].filter(Boolean).join(' | '));
  const order = d.sectionOrder?.length ? d.sectionOrder : DEFAULT_SECTION_ORDER;
  for (const key of order) {
    if (key === 'summary' && d.summary) parts.push('', 'SUMMARY', d.summary);
    if (key === 'experience' && d.experience.length) {
      parts.push('', 'EXPERIENCE');
      for (const e of d.experience) {
        parts.push(`${e.title}, ${e.company}${e.start || e.end ? ` (${[e.start, e.end || 'Present'].filter(Boolean).join(' to ')})` : ''}`);
        for (const bl of e.bullets) parts.push(`- ${bl}`);
      }
    }
    if (key === 'projects' && d.projects.length) {
      parts.push('', 'PROJECTS');
      for (const p of d.projects) {
        parts.push(`${p.name}${p.url ? ` (${p.url})` : ''}`);
        for (const bl of p.bullets) parts.push(`- ${bl}`);
      }
    }
    if (key === 'education' && d.education.length) {
      parts.push('', 'EDUCATION');
      for (const e of d.education)
        parts.push(
          [[e.degree, e.field].filter(Boolean).join(', '), e.institution, [e.start, e.end].filter(Boolean).join(' to '), e.grade].filter(Boolean).join(' | '),
        );
    }
    if (key === 'skills' && d.skills.length) {
      parts.push('', 'SKILLS');
      for (const g of d.skills) parts.push(`${g.group}: ${g.items.join(', ')}`);
    }
    if (key === 'certifications' && d.certifications.length) {
      parts.push('', 'CERTIFICATIONS');
      for (const c of d.certifications) parts.push([c.name, c.issuer, c.date].filter(Boolean).join(' | '));
    }
  }
  return parts.join('\n').trim() + '\n';
}

// ---------- Import assist (deterministic) ----------

export type ProposedField = {
  id: string;
  path: string; // e.g. basics.email, experience[0].title
  section: 'basics' | 'summary' | 'experience' | 'education' | 'projects' | 'skills' | 'certifications';
  label: string;
  value: string | string[];
  confidence: 'high' | 'medium' | 'low';
  sourceLine: string;
};

const HEADINGS: Record<string, ProposedField['section']> = {
  summary: 'summary',
  profile: 'summary',
  about: 'summary',
  objective: 'summary',
  'professional summary': 'summary',
  experience: 'experience',
  'work experience': 'experience',
  'professional experience': 'experience',
  employment: 'experience',
  'employment history': 'experience',
  'work history': 'experience',
  education: 'education',
  'education and training': 'education',
  projects: 'projects',
  'personal projects': 'projects',
  'selected projects': 'projects',
  skills: 'skills',
  'technical skills': 'skills',
  'core skills': 'skills',
  certifications: 'certifications',
  certificates: 'certifications',
  'licenses and certifications': 'certifications',
};

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const DATE = `(?:${MONTH}\\s+\\d{4}|\\d{1,2}/\\d{4}|\\d{4}-\\d{2}|\\d{4})`;
const RANGE_RE = new RegExp(`(${DATE})\\s*(?:-|–|—|to|until)\\s*(${DATE}|present|current|now)`, 'i');
const SINGLE_DATE_RE = new RegExp(`\\b(${DATE})\\b`, 'i');
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
const URL_RE = /\b((?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|github\.com|gitlab\.com|[a-z0-9-]+\.(?:dev|io|me|com|net|org|app))\/?[^\s|,]*)/gi;
const BULLET_RE = /^\s*(?:[-*•▪◦·‣]|\d+[.)])\s+/;

function headingOf(line: string): ProposedField['section'] | null {
  const t = line
    .trim()
    .replace(/[:#*_=-]+$/g, '')
    .replace(/^[#*_=\s]+/, '')
    .toLowerCase()
    .trim();
  return HEADINGS[t] ?? null;
}

function normalizeDate(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  if (/present|current|now/i.test(t)) return 'Present';
  return t;
}

/** Turns pasted resume text into proposed fields. The caller must show each field for confirmation. */
export function importResumeText(text: string): { fields: ProposedField[]; proposal: ResumeData; unparsed: string[]; notes: string[] } {
  const lines = text.replace(/\r/g, '').split('\n');
  const fields: ProposedField[] = [];
  const proposal = emptyResume();
  const unparsed: string[] = [];
  const add = (f: Omit<ProposedField, 'id'>) => fields.push({ id: newId(), ...f });

  // Contact details anywhere in the first lines.
  const head = lines.slice(0, 12).join('\n');
  const email = head.match(EMAIL_RE)?.[0] ?? text.match(EMAIL_RE)?.[0];
  if (email) {
    proposal.basics.email = email;
    add({ path: 'basics.email', section: 'basics', label: 'Email', value: email, confidence: 'high', sourceLine: email });
  }
  const phoneLine = lines.slice(0, 12).find((l) => PHONE_RE.test(l) && !EMAIL_RE.test(l.match(PHONE_RE)![0]));
  const phone = phoneLine?.match(PHONE_RE)?.[0]?.trim();
  if (phone && phone.replace(/\D/g, '').length >= 8) {
    proposal.basics.phone = phone;
    add({ path: 'basics.phone', section: 'basics', label: 'Phone', value: phone, confidence: 'medium', sourceLine: phoneLine!.trim() });
  }
  const links = [...new Set([...head.matchAll(URL_RE)].map((m) => m[1]).filter((u) => !u.includes('@') && !EMAIL_RE.test(u)))];
  for (const [i, url] of links.entries()) {
    const label = /linkedin/i.test(url) ? 'LinkedIn' : /github/i.test(url) ? 'GitHub' : 'Website';
    proposal.basics.links!.push({ label, url });
    add({ path: `basics.links[${i}]`, section: 'basics', label: `${label} link`, value: url, confidence: 'high', sourceLine: url });
  }
  const firstLine = lines.find((l) => l.trim());
  if (firstLine && !EMAIL_RE.test(firstLine) && !headingOf(firstLine) && firstLine.trim().split(/\s+/).length <= 5 && !/\d/.test(firstLine)) {
    proposal.basics.name = firstLine.trim();
    add({ path: 'basics.name', section: 'basics', label: 'Name', value: firstLine.trim(), confidence: 'medium', sourceLine: firstLine.trim() });
  }

  // Walk sections.
  let section: ProposedField['section'] | null = null;
  let current: { kind: 'experience' | 'projects' | 'education'; idx: number } | null = null;
  const summaryLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;
    const h = headingOf(line);
    if (h) {
      section = h;
      current = null;
      continue;
    }
    if (!section) continue;
    const isBullet = BULLET_RE.test(raw);
    const content = line.replace(BULLET_RE, '').trim();

    if (section === 'summary') {
      summaryLines.push(content);
      continue;
    }
    if (section === 'skills') {
      const m = content.match(/^([^:]{2,40}):\s*(.+)$/);
      const group = m ? m[1].trim() : 'Skills';
      const items = (m ? m[2] : content)
        .split(/[,;|•]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (items.length) {
        proposal.skills.push({ group, items });
        add({ path: `skills[${proposal.skills.length - 1}]`, section: 'skills', label: `Skills: ${group}`, value: items, confidence: m ? 'high' : 'medium', sourceLine: line });
      }
      continue;
    }
    if (section === 'certifications') {
      const date = content.match(SINGLE_DATE_RE)?.[1];
      const parts = content.replace(SINGLE_DATE_RE, '').split(/\s[|,–—-]\s|\s-\s|,\s/).map((s) => s.trim()).filter(Boolean);
      proposal.certifications.push({ id: newId(), name: parts[0] ?? content, issuer: parts[1], date });
      add({ path: `certifications[${proposal.certifications.length - 1}]`, section: 'certifications', label: 'Certification', value: content, confidence: 'medium', sourceLine: line });
      continue;
    }
    if (section === 'experience' || section === 'projects' || section === 'education') {
      if (isBullet && current) {
        if (current.kind === 'experience') {
          proposal.experience[current.idx].bullets.push(content);
          add({ path: `experience[${current.idx}].bullets`, section: 'experience', label: `Bullet (${proposal.experience[current.idx].title || 'role'})`, value: content, confidence: 'high', sourceLine: line });
        } else if (current.kind === 'projects') {
          proposal.projects[current.idx].bullets.push(content);
          add({ path: `projects[${current.idx}].bullets`, section: 'projects', label: `Bullet (${proposal.projects[current.idx].name})`, value: content, confidence: 'high', sourceLine: line });
        } else {
          unparsed.push(line);
        }
        continue;
      }
      // A header line: "Title, Company (Jan 2021 - Present)" / "Title at Company | 2021 - 2023" / "Company" then "Title"
      const range = content.match(RANGE_RE);
      const start = normalizeDate(range?.[1]);
      const end = normalizeDate(range?.[2]);
      const stripped = content
        .replace(RANGE_RE, '')
        .replace(/[()]/g, '')
        .replace(/\s*[|·•,–—-]\s*$/g, '')
        .trim();
      if (section === 'experience') {
        const m = stripped.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i) ?? stripped.match(/^(.+?)\s*[,|–—]\s*(.+)$/) ?? stripped.match(/^(.+?)\s+-\s+(.+)$/);
        const title = m ? m[1].trim() : stripped;
        const company = m ? m[2].replace(/\s*[|,]\s*$/, '').trim() : '';
        if (!range && !m && current?.kind === 'experience' && !proposal.experience[current.idx].company) {
          // second line of a two-line header
          proposal.experience[current.idx].company = stripped;
          add({ path: `experience[${current.idx}].company`, section: 'experience', label: 'Company', value: stripped, confidence: 'low', sourceLine: line });
          continue;
        }
        proposal.experience.push({ id: newId(), title, company, start, end, bullets: [] });
        current = { kind: 'experience', idx: proposal.experience.length - 1 };
        const idx = current.idx;
        add({ path: `experience[${idx}].title`, section: 'experience', label: 'Job title', value: title, confidence: m ? 'medium' : 'low', sourceLine: line });
        if (company) add({ path: `experience[${idx}].company`, section: 'experience', label: 'Company', value: company, confidence: 'medium', sourceLine: line });
        if (start) add({ path: `experience[${idx}].start`, section: 'experience', label: 'Start date', value: start, confidence: 'high', sourceLine: line });
        if (end) add({ path: `experience[${idx}].end`, section: 'experience', label: 'End date', value: end, confidence: 'high', sourceLine: line });
      } else if (section === 'projects') {
        const url = content.match(/https?:\/\/\S+|github\.com\/\S+/)?.[0];
        const name = stripped.replace(url ?? '', '').replace(/[|:–—-]\s*$/, '').trim();
        proposal.projects.push({ id: newId(), name, url, bullets: [] });
        current = { kind: 'projects', idx: proposal.projects.length - 1 };
        add({ path: `projects[${current.idx}].name`, section: 'projects', label: 'Project name', value: name, confidence: 'medium', sourceLine: line });
        if (url) add({ path: `projects[${current.idx}].url`, section: 'projects', label: 'Project link', value: url, confidence: 'high', sourceLine: line });
      } else {
        const single = !range ? content.match(SINGLE_DATE_RE)?.[1] : undefined;
        const parts = stripped
          .replace(single ?? '', '')
          .split(/\s*[,|–—]\s*|\s+-\s+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const instIdx = parts.findIndex((p) => /universit|college|institute|school|academy|iit|polytechnic/i.test(p));
        const institution = instIdx >= 0 ? parts[instIdx] : (parts[1] ?? parts[0] ?? content);
        const degree = instIdx >= 0 ? parts.filter((_, j) => j !== instIdx).join(', ') || undefined : parts.length > 1 ? parts[0] : undefined;
        proposal.education.push({ id: newId(), institution, degree, start, end: end ?? single });
        current = { kind: 'education', idx: proposal.education.length - 1 };
        add({ path: `education[${current.idx}].institution`, section: 'education', label: 'Institution', value: institution, confidence: instIdx >= 0 ? 'high' : 'low', sourceLine: line });
        if (degree) add({ path: `education[${current.idx}].degree`, section: 'education', label: 'Degree', value: degree, confidence: 'medium', sourceLine: line });
        if (end ?? single) add({ path: `education[${current.idx}].end`, section: 'education', label: 'End date', value: (end ?? single)!, confidence: 'medium', sourceLine: line });
      }
      continue;
    }
    unparsed.push(line);
  }
  if (summaryLines.length) {
    proposal.summary = summaryLines.join(' ');
    add({ path: 'summary', section: 'summary', label: 'Summary', value: proposal.summary, confidence: 'high', sourceLine: summaryLines[0] });
  }
  // Lines before any heading that were not contact/name lines.
  const firstHeading = lines.findIndex((l) => headingOf(l));
  if (firstHeading > 0) {
    for (const l of lines.slice(0, firstHeading)) {
      const t = l.trim();
      if (!t || t === proposal.basics.name || EMAIL_RE.test(t) || (phone && t.includes(phone)) || links.some((u) => t.includes(u))) continue;
      if (!proposal.basics.headline && t.split(/\s+/).length <= 10) {
        proposal.basics.headline = t;
        add({ path: 'basics.headline', section: 'basics', label: 'Headline', value: t, confidence: 'low', sourceLine: t });
      } else unparsed.push(t);
    }
  }
  const notes = [
    'Nothing has been saved. Review each proposed field, fix anything the parser got wrong, and confirm only what is accurate.',
    'The parser only copies text you pasted. It never adds achievements, dates, grades or metrics.',
  ];
  if (!fields.length) notes.push('No recognizable sections were found. Use headings such as Experience, Education, Projects and Skills, one per line.');
  return { fields, proposal, unparsed, notes };
}

// ---------- Checks (deterministic, always available) ----------

export type ResumeCheck = {
  id: string;
  severity: 'error' | 'warning' | 'tip';
  category: 'contact' | 'content' | 'impact' | 'tense' | 'length' | 'ats' | 'dates';
  section: string;
  path?: string;
  message: string;
  /** A question for the user. Answers must come from the user; nothing is filled in automatically. */
  question?: string;
};

const WEAK_STARTS: [RegExp, string][] = [
  [/^responsible for\b/i, 'Responsible for'],
  [/^(helped|helping)\b/i, 'Helped'],
  [/^worked on\b/i, 'Worked on'],
  [/^(assisted|assisting)\b/i, 'Assisted'],
  [/^involved in\b/i, 'Involved in'],
  [/^tasked with\b/i, 'Tasked with'],
  [/^(handled|handling)\b/i, 'Handled'],
  [/^(did|doing)\b/i, 'Did'],
  [/^duties included\b/i, 'Duties included'],
  [/^participated in\b/i, 'Participated in'],
];
export const STRONG_VERBS = ['Built', 'Designed', 'Automated', 'Analyzed', 'Organized', 'Led', 'Reduced', 'Improved', 'Created', 'Implemented', 'Documented', 'Coordinated', 'Resolved', 'Trained', 'Migrated', 'Tested'];
const OUTCOME_CUES = /(\d|reduc|increas|improv|sav|cut|faster|fewer|grew|enabl|so that|resulting|result|which (let|allowed|helped|meant)|leading to|led to|adopted|used by|launched|shipped|published|award)/i;
const PRONOUNS = /\b(I|me|my|mine)\b/;
const PAST_VERB = /^[A-Z][a-z]+ed\b/;
const PRESENT_VERB = /^[A-Z][a-z]+(s|e|ing)?\b/;

function snippet(s: string) {
  const words = s.split(/\s+/).slice(0, 6).join(' ');
  return `"${words}${s.split(/\s+/).length > 6 ? '...' : ''}"`;
}

function isCurrent(end?: string) {
  return !end || /present|current|now/i.test(end);
}

export function checkResume(d: ResumeData): { checks: ResumeCheck[]; stats: { words: number; bullets: number; sections: number } } {
  const checks: ResumeCheck[] = [];
  let n = 0;
  const push = (c: Omit<ResumeCheck, 'id'>) => checks.push({ id: `c${++n}`, ...c });
  const b = d.basics ?? { name: '' };

  // Contact completeness
  if (!b.name?.trim()) push({ severity: 'error', category: 'contact', section: 'basics', path: 'basics.name', message: 'Add your name at the top.' });
  if (!b.email?.trim()) push({ severity: 'error', category: 'contact', section: 'basics', path: 'basics.email', message: 'Add an email address so recruiters can reach you.' });
  if (!b.phone?.trim()) push({ severity: 'tip', category: 'contact', section: 'basics', path: 'basics.phone', message: 'Consider adding a phone number. Leave it out if you prefer email only.' });
  if (!b.location?.trim()) push({ severity: 'tip', category: 'contact', section: 'basics', path: 'basics.location', message: 'Add a city or region (or "Remote"). Many recruiters filter by location.' });
  if (!(b.links ?? []).length) push({ severity: 'tip', category: 'contact', section: 'basics', path: 'basics.links', message: 'Add a link to your portfolio, GitHub or LinkedIn if you have one.' });

  // Summary
  const summaryWords = (d.summary ?? '').split(/\s+/).filter(Boolean).length;
  if (!summaryWords) push({ severity: 'tip', category: 'content', section: 'summary', path: 'summary', message: 'A short summary (two or three sentences) helps a reader place you quickly.' });
  else if (summaryWords > 80) push({ severity: 'warning', category: 'length', section: 'summary', path: 'summary', message: 'Your summary is long. Aim for two or three sentences.' });
  if (d.summary && PRONOUNS.test(d.summary)) push({ severity: 'tip', category: 'ats', section: 'summary', path: 'summary', message: 'Resumes usually drop first-person pronouns ("I", "my"). Start sentences with what you do.' });

  // Experience and projects
  const allBullets: string[] = [];
  const roleChecks = (kind: 'experience' | 'projects') => {
    const list = kind === 'experience' ? d.experience : d.projects;
    list.forEach((item, i) => {
      const label = kind === 'experience' ? `${(item as ResumeData['experience'][number]).title || 'Role'} at ${(item as ResumeData['experience'][number]).company || 'company'}` : (item as ResumeData['projects'][number]).name || 'Project';
      if (kind === 'experience') {
        const e = item as ResumeData['experience'][number];
        if (!e.title?.trim()) push({ severity: 'error', category: 'content', section: 'experience', path: `experience[${i}].title`, message: 'A role is missing its job title.' });
        if (!e.company?.trim()) push({ severity: 'error', category: 'content', section: 'experience', path: `experience[${i}].company`, message: `${label}: add the organization name.` });
        if (!e.start) push({ severity: 'warning', category: 'dates', section: 'experience', path: `experience[${i}].start`, message: `${label}: add a start date.`, question: 'When did you start this role? Month and year is enough.' });
        if (!e.end) push({ severity: 'tip', category: 'dates', section: 'experience', path: `experience[${i}].end`, message: `${label}: no end date, so this reads as your current role. Add an end date if it has ended.` });
      }
      if (!item.bullets.length) push({ severity: 'warning', category: 'content', section: kind, path: `${kind}[${i}].bullets`, message: `${label}: add a few bullets describing what you did.`, question: 'What did you actually do here? List the tasks you owned, in your own words.' });
      if (item.bullets.length > 6) push({ severity: 'tip', category: 'length', section: kind, path: `${kind}[${i}].bullets`, message: `${label}: many bullets. Keep the strongest ones for this role.` });
      const tenses = new Set<string>();
      item.bullets.forEach((bl, j) => {
        const t = bl.trim();
        allBullets.push(t);
        const path = `${kind}[${i}].bullets[${j}]`;
        const weak = WEAK_STARTS.find(([re]) => re.test(t));
        if (weak) push({ severity: 'warning', category: 'impact', section: kind, path, message: `${snippet(t)} starts with "${weak[1]}". Lead with an action verb that says what you did (for example ${STRONG_VERBS.slice(0, 4).join(', ')}).` });
        if (!OUTCOME_CUES.test(t))
          push({
            severity: 'tip',
            category: 'impact',
            section: kind,
            path,
            message: `${snippet(t)} describes a task without an outcome. Add a real result if you have one.`,
            question: 'What changed because of this work? Leave blank if you are not sure. Only add a number you can back up.',
          });
        if (t.split(/\s+/).length > 35) push({ severity: 'tip', category: 'length', section: kind, path, message: `${snippet(t)} is long. Split it or cut it to one line or two.` });
        if (PRONOUNS.test(t)) push({ severity: 'tip', category: 'ats', section: kind, path, message: `${snippet(t)} uses a first-person pronoun. Start with the verb instead.` });
        if (PAST_VERB.test(t)) tenses.add('past');
        else if (PRESENT_VERB.test(t) && !/^[A-Z][a-z]+ed\b/.test(t)) tenses.add('present');
      });
      if (kind === 'experience') {
        const e = item as ResumeData['experience'][number];
        if (tenses.has('past') && tenses.has('present'))
          push({ severity: 'tip', category: 'tense', section: 'experience', path: `experience[${i}].bullets`, message: `${label}: bullets mix past and present tense. Use ${isCurrent(e.end) ? 'present tense for a current role' : 'past tense for a past role'}.` });
        else if (!isCurrent(e.end) && tenses.has('present') && !tenses.has('past'))
          push({ severity: 'tip', category: 'tense', section: 'experience', path: `experience[${i}].bullets`, message: `${label}: this role has ended, so past tense usually reads better.` });
      }
    });
  };
  roleChecks('experience');
  roleChecks('projects');
  if (!d.experience.length && !d.projects.length) push({ severity: 'error', category: 'content', section: 'experience', message: 'Add at least one role or project. Projects you built count, even unpaid ones.' });

  // Education
  d.education.forEach((e, i) => {
    if (!e.institution?.trim()) push({ severity: 'error', category: 'content', section: 'education', path: `education[${i}].institution`, message: 'An education entry is missing the institution.' });
    if (!e.end && !e.start) push({ severity: 'tip', category: 'dates', section: 'education', path: `education[${i}].end`, message: `${e.institution || 'Education'}: add a graduation year (or expected year).`, question: 'When did you finish, or when do you expect to finish?' });
  });

  // Skills
  const skillCount = d.skills.reduce((a, g) => a + g.items.length, 0);
  if (!skillCount) push({ severity: 'warning', category: 'ats', section: 'skills', path: 'skills', message: 'Add a skills section. Applicant tracking systems match on it.' });
  else if (skillCount > 30) push({ severity: 'tip', category: 'length', section: 'skills', path: 'skills', message: 'Long skills list. Keep the ones you could discuss in an interview.' });

  // Dates format consistency
  const dates = [...d.experience.flatMap((e) => [e.start, e.end]), ...d.education.flatMap((e) => [e.start, e.end])].filter((x): x is string => !!x && !/present/i.test(x));
  const formats = new Set(dates.map((x) => (/^\d{4}-\d{2}$/.test(x) ? 'iso' : /^\d{4}$/.test(x) ? 'year' : /^[A-Za-z]/.test(x) ? 'month-name' : /\//.test(x) ? 'slash' : 'other')));
  formats.delete('year');
  if (formats.size > 1) push({ severity: 'tip', category: 'dates', section: 'experience', message: 'Dates use different formats. Pick one style and use it everywhere.' });

  // Length
  const text = resumeToPlainText(d);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > 900) push({ severity: 'warning', category: 'length', section: 'all', message: 'This resume is long for an early-career role. Aim for one page; two at most.' });
  if (words < 120 && (d.experience.length || d.projects.length)) push({ severity: 'tip', category: 'length', section: 'all', message: 'This resume is quite short. Add detail about what you built or did, using facts you can stand behind.' });

  // ATS hints
  if (/[│┃█▓]/.test(text) || /\t/.test(text)) push({ severity: 'tip', category: 'ats', section: 'all', message: 'Avoid tables, columns and special symbols. Applicant tracking systems read plain text best.' });
  const custom = (d.sectionOrder ?? []).filter((k) => !DEFAULT_SECTION_ORDER.includes(k));
  if (custom.length) push({ severity: 'tip', category: 'ats', section: 'all', message: 'Use standard section names (Experience, Education, Skills, Projects) so parsers recognize them.' });

  return { checks, stats: { words, bullets: allBullets.length, sections: (d.sectionOrder ?? DEFAULT_SECTION_ORDER).length } };
}

// ---------- AI suggestion validation ----------

export type AiSuggestion = { section: string; kind: 'rewrite' | 'question' | 'tip'; text: string; original?: string };

/**
 * Keeps only safe AI suggestions:
 * - drops any suggestion that contains a number not present in the source text;
 * - a suggestion asking for a new fact must be phrased as a question (contains "?").
 */
export function filterAiSuggestions(raw: unknown, sourceText: string): { kept: AiSuggestion[]; dropped: number } {
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { suggestions?: unknown })?.suggestions) ? (raw as { suggestions: unknown[] }).suggestions : [];
  const kept: AiSuggestion[] = [];
  let dropped = 0;
  for (const item of list.slice(0, 40)) {
    const s = item as Partial<AiSuggestion>;
    if (!s || typeof s.text !== 'string' || !s.text.trim()) {
      dropped++;
      continue;
    }
    const kind: AiSuggestion['kind'] = s.kind === 'rewrite' || s.kind === 'question' ? s.kind : 'tip';
    const text = s.text.trim().slice(0, 600);
    if (introducesNumbers(text, sourceText)) {
      dropped++;
      continue;
    }
    if (kind === 'question' && !text.includes('?')) {
      dropped++;
      continue;
    }
    kept.push({ section: typeof s.section === 'string' ? s.section.slice(0, 40) : 'general', kind, text, original: typeof s.original === 'string' ? s.original.slice(0, 400) : undefined });
  }
  return { kept, dropped };
}

// ---------- Export ----------

const esc = (s: string | undefined | null) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u.replace(/^\/*/, '')}`);

export function renderResumeHtml(d: ResumeData, template: string, title: string): string {
  const t = RESUME_TEMPLATES.includes(template as (typeof RESUME_TEMPLATES)[number]) ? template : 'clean';
  const font = t === 'modern' ? "'Helvetica Neue', Arial, sans-serif" : t === 'compact' ? 'Arial, sans-serif' : 'Georgia, serif';
  const size = t === 'compact' ? '10pt' : '11pt';
  const accent = t === 'modern' ? '#1f4f8b' : '#111';
  const b = d.basics;
  const order = d.sectionOrder?.length ? d.sectionOrder : DEFAULT_SECTION_ORDER;
  const sec = (name: string, inner: string) => `<section><h2>${name}</h2>${inner}</section>`;
  const range = (s?: string, e?: string) => (s || e ? `<span class="dates">${esc([s, e || (s ? 'Present' : '')].filter(Boolean).join(' – '))}</span>` : '');
  const bullets = (xs: string[]) => (xs.length ? `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
  const body: string[] = [];
  for (const key of order) {
    if (key === 'summary' && d.summary) body.push(sec('Summary', `<p>${esc(d.summary)}</p>`));
    if (key === 'experience' && d.experience.length)
      body.push(sec('Experience', d.experience.map((e) => `<div class="item"><div class="row"><strong>${esc(e.title)}</strong>${e.company ? `, ${esc(e.company)}` : ''}${range(e.start, e.end)}</div>${bullets(e.bullets)}</div>`).join('')));
    if (key === 'projects' && d.projects.length)
      body.push(sec('Projects', d.projects.map((p) => `<div class="item"><div class="row"><strong>${esc(p.name)}</strong>${p.url ? ` <a href="${esc(safeUrl(p.url))}">${esc(p.url)}</a>` : ''}</div>${bullets(p.bullets)}</div>`).join('')));
    if (key === 'education' && d.education.length)
      body.push(sec('Education', d.education.map((e) => `<div class="item"><div class="row"><strong>${esc(e.institution)}</strong>${e.degree || e.field ? `, ${esc([e.degree, e.field].filter(Boolean).join(', '))}` : ''}${range(e.start, e.end)}</div>${e.grade ? `<div>${esc(e.grade)}</div>` : ''}</div>`).join('')));
    if (key === 'skills' && d.skills.length) body.push(sec('Skills', d.skills.map((g) => `<div><strong>${esc(g.group)}:</strong> ${esc(g.items.join(', '))}</div>`).join('')));
    if (key === 'certifications' && d.certifications.length) body.push(sec('Certifications', `<ul>${d.certifications.map((c) => `<li>${esc([c.name, c.issuer, c.date].filter(Boolean).join(' · '))}</li>`).join('')}</ul>`));
  }
  const contact = [b.email, b.phone, b.location].filter(Boolean).map((x) => esc(x)).concat((b.links ?? []).map((l) => `<a href="${esc(safeUrl(l.url))}">${esc(l.url)}</a>`));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: ${font}; font-size: ${size}; color: #111; background: #fff; max-width: 780px; margin: 24px auto; padding: 0 16px; line-height: 1.4; }
  header h1 { margin: 0; font-size: 20pt; color: ${accent}; }
  header .headline { margin: 2px 0; color: #333; }
  header .contact { color: #333; font-size: 0.95em; }
  h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: .06em; color: ${accent}; border-bottom: 1px solid #bbb; padding-bottom: 2px; margin: 14px 0 6px; }
  .item { margin-bottom: 8px; } .row { display: flex; gap: 6px; flex-wrap: wrap; } .dates { margin-left: auto; color: #444; }
  ul { margin: 4px 0 0 18px; padding: 0; } li { margin: 2px 0; }
  a { color: inherit; }
  .note { font-family: Arial, sans-serif; font-size: 12px; background: #f3f4f6; border: 1px solid #ddd; padding: 8px 10px; border-radius: 6px; margin-bottom: 16px; }
  @media print { .note { display: none; } body { margin: 0; } }
</style></head><body>
<div class="note">To save as PDF, use your browser's Print command and choose "Save as PDF". This page is not a PDF file itself.</div>
<header><h1>${esc(b.name)}</h1>${b.headline ? `<div class="headline">${esc(b.headline)}</div>` : ''}<div class="contact">${contact.join(' · ')}</div></header>
${body.join('\n')}
</body></html>`;
}
