/**
 * Deterministic skill extraction from a job description.
 * Matches platform skill names plus a hand-written alias map, and decides
 * required vs preferred from section headings and line cues. No AI involved.
 */
import { SKILLS } from '../../db/seed/content/skills';

export type ExtractedSkill = { slug: string; name: string; required: boolean };
export type ExtractedSkillDetail = ExtractedSkill & { matched: string[]; snippet: string; cue: 'required' | 'preferred' | 'default' };

type Alias = { re: RegExp; slugs: string[]; label: string };

const NAME_BY_SLUG = new Map(SKILLS.map((s) => [s.slug, s.name]));
export const skillName = (slug: string) => NAME_BY_SLUG.get(slug) ?? slug;

function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/** Case-insensitive phrase with word boundaries that also work for terms like "c++" or "node.js". */
function phrase(p: string): RegExp {
  const start = /^\w/.test(p) ? '\\b' : '(?:^|(?<=[\\s(,/]))';
  const end = /\w$/.test(p) ? '\\b' : '(?=$|[\\s),./;:])';
  return new RegExp(`${start}${esc(p)}${end}`, 'i');
}

// alias → skill slugs (one alias may support several skills).
const ALIASES: [string, string[]][] = [
  // languages
  ['python', ['python']],
  ['django', ['python']],
  ['flask', ['python']],
  ['fastapi', ['python']],
  ['javascript', ['javascript']],
  ['ecmascript', ['javascript']],
  ['es6', ['javascript']],
  ['typescript', ['typescript']],
  ['java', ['java']],
  ['spring boot', ['java']],
  ['golang', ['go']],
  ['rust', ['rust']],
  ['c++', ['cpp']],
  ['cpp', ['cpp']],
  ['c/c++', ['c-lang', 'cpp']],
  ['c programming', ['c-lang']],
  ['object-oriented', ['oop']],
  ['object oriented', ['oop']],
  ['oop', ['oop']],
  // web
  ['html', ['html-css']],
  ['css', ['html-css']],
  ['tailwind', ['html-css']],
  ['react', ['react']],
  ['react.js', ['react']],
  ['reactjs', ['react']],
  ['next.js', ['react']],
  ['node', ['nodejs']],
  ['node.js', ['nodejs']],
  ['nodejs', ['nodejs']],
  ['express', ['nodejs']],
  ['express.js', ['nodejs']],
  ['rest api', ['http-rest']],
  ['rest apis', ['http-rest']],
  ['restful', ['http-rest']],
  ['http', ['http-rest']],
  ['web services', ['http-rest']],
  ['api design', ['api-design']],
  ['graphql', ['api-design']],
  ['openapi', ['api-design']],
  ['authentication', ['auth-security-web']],
  ['oauth', ['auth-security-web']],
  ['jwt', ['auth-security-web']],
  ['accessibility', ['web-accessibility']],
  ['wcag', ['web-accessibility']],
  ['a11y', ['web-accessibility']],
  ['dom', ['dom-browser']],
  // async
  ['asynchronous', ['async-programming']],
  ['async/await', ['async-programming']],
  ['concurrency', ['concurrency']],
  ['multithreading', ['concurrency']],
  ['multi-threading', ['concurrency']],
  // dsa
  ['dsa', ['arrays', 'complexity']],
  ['data structures', ['collections', 'arrays']],
  ['algorithms', ['complexity', 'sorting']],
  ['big-o', ['complexity']],
  ['big o', ['complexity']],
  ['time complexity', ['complexity']],
  ['hash map', ['hashing']],
  ['hash maps', ['hashing']],
  ['hashmap', ['hashing']],
  ['linked list', ['linked-lists']],
  ['binary tree', ['trees']],
  ['graph algorithms', ['graphs']],
  ['dynamic programming', ['dynamic-programming']],
  // design
  ['design patterns', ['design-patterns']],
  ['solid principles', ['solid-principles']],
  ['clean code', ['solid-principles']],
  ['low-level design', ['low-level-design']],
  ['system design', ['system-design-basics']],
  ['distributed systems', ['system-design-basics', 'scalability']],
  ['microservices', ['system-design-basics']],
  ['scalability', ['scalability']],
  ['scalable', ['scalability']],
  ['high availability', ['scalability']],
  ['caching', ['caching']],
  ['redis', ['caching']],
  ['memcached', ['caching']],
  ['kafka', ['messaging']],
  ['rabbitmq', ['messaging']],
  ['message queue', ['messaging']],
  ['message queues', ['messaging']],
  ['event-driven', ['messaging']],
  ['pub/sub', ['messaging']],
  // databases
  ['sql', ['sql-basics']],
  ['postgres', ['sql-basics', 'database-design']],
  ['postgresql', ['sql-basics', 'database-design']],
  ['mysql', ['sql-basics', 'database-design']],
  ['sqlite', ['sql-basics']],
  ['relational database', ['sql-basics', 'database-design']],
  ['relational databases', ['sql-basics', 'database-design']],
  ['rdbms', ['sql-basics', 'database-design']],
  ['database design', ['database-design']],
  ['data modeling', ['database-design']],
  ['data modelling', ['database-design']],
  ['schema design', ['database-design']],
  ['joins', ['sql-joins']],
  ['group by', ['sql-aggregation']],
  ['window functions', ['sql-advanced']],
  ['cte', ['sql-advanced']],
  ['ctes', ['sql-advanced']],
  ['indexing', ['indexing']],
  ['indexes', ['indexing']],
  ['query optimization', ['indexing']],
  ['query performance', ['indexing']],
  ['transactions', ['transactions']],
  ['acid', ['transactions']],
  // cs fundamentals / devops
  ['operating systems', ['operating-systems']],
  ['networking', ['networking']],
  ['tcp/ip', ['networking']],
  ['dns', ['networking']],
  ['linux', ['command-line']],
  ['bash', ['command-line']],
  ['shell scripting', ['command-line']],
  ['command line', ['command-line']],
  ['git', ['git']],
  ['github', ['git']],
  ['gitlab', ['git']],
  ['version control', ['git']],
  ['docker', ['docker']],
  ['containers', ['docker']],
  ['containerization', ['docker']],
  ['kubernetes', ['docker', 'cloud-basics']],
  ['ci/cd', ['ci-cd']],
  ['continuous integration', ['ci-cd']],
  ['github actions', ['ci-cd']],
  ['jenkins', ['ci-cd']],
  ['aws', ['cloud-basics']],
  ['azure', ['cloud-basics']],
  ['gcp', ['cloud-basics']],
  ['google cloud', ['cloud-basics']],
  ['cloud', ['cloud-basics']],
  ['monitoring', ['observability']],
  ['observability', ['observability']],
  ['logging', ['observability']],
  ['prometheus', ['observability']],
  ['grafana', ['observability']],
  // data / ml
  ['statistics', ['statistics']],
  ['probability', ['probability']],
  ['linear algebra', ['linear-algebra']],
  ['pandas', ['data-wrangling']],
  ['numpy', ['data-wrangling']],
  ['data visualization', ['data-visualization']],
  ['machine learning', ['ml-fundamentals']],
  ['scikit-learn', ['ml-fundamentals']],
  ['deep learning', ['deep-learning']],
  ['pytorch', ['deep-learning']],
  ['tensorflow', ['deep-learning']],
  ['llm', ['llm-applications']],
  ['llms', ['llm-applications']],
  ['large language models', ['llm-applications']],
  ['generative ai', ['llm-applications']],
  // quality
  ['unit testing', ['unit-testing']],
  ['unit tests', ['unit-testing']],
  ['automated tests', ['unit-testing']],
  ['testing', ['unit-testing']],
  ['tdd', ['unit-testing']],
  ['jest', ['unit-testing']],
  ['pytest', ['unit-testing']],
  ['debugging', ['debugging']],
  ['troubleshooting', ['debugging']],
  ['security', ['web-security']],
  ['owasp', ['web-security']],
  ['code review', ['code-review']],
  ['code reviews', ['code-review']],
  ['refactoring', ['code-review']],
  ['open source', ['open-source']],
  ['open-source', ['open-source']],
  // professional
  ['communication skills', ['communication']],
  ['communicate', ['communication']],
  ['written communication', ['communication', 'technical-writing']],
  ['teamwork', ['teamwork']],
  ['collaborate', ['teamwork']],
  ['collaboration', ['teamwork']],
  ['cross-functional', ['teamwork']],
  ['documentation', ['technical-writing']],
  ['technical writing', ['technical-writing']],
];

// Skill names that are too ambiguous to match as plain words.
const SKIP_NAMES = new Set(['c-lang', 'go', 'functions', 'control-flow', 'programming-basics', 'collections', 'resume-writing', 'job-search', 'behavioral-interviews', 'technical-interviews']);

let compiled: Alias[] | null = null;
function aliases(): Alias[] {
  if (compiled) return compiled;
  const list: Alias[] = [];
  for (const s of SKILLS) {
    if (SKIP_NAMES.has(s.slug)) continue;
    list.push({ re: phrase(s.name.toLowerCase()), slugs: [s.slug], label: s.name });
  }
  for (const [p, slugs] of ALIASES) list.push({ re: phrase(p), slugs: slugs.filter((x) => NAME_BY_SLUG.has(x)), label: p });
  // Case-sensitive specials: "Go" the language, "C" in a list, "REST" in caps.
  list.push({ re: /\bGo\b(?!\s+(?:to|ahead|live|beyond|above|far|the extra))/, slugs: ['go'], label: 'Go' });
  list.push({ re: /(?<![Ss]eries |[Tt]ype |[Gg]rade |[Ll]evel |[Pp]lan )\bC\b(?![#+])(?=\s*(?:[,/)]|and\b|or\b|programming|language))|(?<=[,/(]\s?)\bC\b(?![#+])/, slugs: ['c-lang'], label: 'C' });
  list.push({ re: /\bREST\b/, slugs: ['http-rest'], label: 'REST' });
  compiled = list;
  return list;
}

const PREFERRED_HEADING = /^[#*\s]*(?:[\w']+\s){0,2}(nice[\s-]to[\s-]have|preferred|bonus|good[\s-]to[\s-]have|desirable|plus(es)?\b|extra credit|optional)/i;
const REQUIRED_HEADING = /^[#*\s]*(?:[\w']+\s){0,2}(requirements?|required|must[\s-]have|qualifications|what you('| wi)ll need|what we('re| are) looking for|you have|minimum|skills|tech stack|responsibilities|what you('| wi)ll do)/i;
const PREFERRED_LINE = /(nice to have|preferred|is a plus|are a plus|a bonus|bonus points|ideally|good to have|familiarity with|exposure to|would be great)/i;
const REQUIRED_LINE = /(must|required|requires|need to|strong (knowledge|experience|understanding)|proficien|solid (knowledge|experience|understanding))/i;

function isHeading(line: string) {
  const t = line.trim();
  if (!t) return false;
  if (/^#{1,6}\s/.test(t)) return true;
  if (t.length <= 60 && /:$/.test(t)) return true;
  if (t.length <= 40 && !/[.,;]$/.test(t) && !/^[-*•]/.test(t) && t.split(/\s+/).length <= 6) return true;
  return false;
}

/** Extracts known skills. Required unless every mention sits in a "preferred" section or line. */
export function extractSkills(description: string): ExtractedSkillDetail[] {
  const lines = description.replace(/\r/g, '').split('\n');
  let section: 'required' | 'preferred' | 'default' = 'default';
  const found = new Map<string, ExtractedSkillDetail & { anyRequired: boolean }>();
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (isHeading(line)) {
      if (PREFERRED_HEADING.test(line)) section = 'preferred';
      else if (REQUIRED_HEADING.test(line)) section = 'required';
      else if (/:$/.test(line) || /^#/.test(line)) section = 'default';
    }
    let cue: 'required' | 'preferred' | 'default' = section;
    if (PREFERRED_LINE.test(line)) cue = 'preferred';
    else if (REQUIRED_LINE.test(line)) cue = 'required';
    for (const a of aliases()) {
      const m = line.match(a.re);
      if (!m) continue;
      for (const slug of a.slugs) {
        const isReq = cue !== 'preferred';
        const prev = found.get(slug);
        if (!prev) {
          found.set(slug, { slug, name: skillName(slug), required: isReq, anyRequired: isReq, matched: [a.label], snippet: line.slice(0, 200), cue });
        } else {
          if (!prev.matched.includes(a.label)) prev.matched.push(a.label);
          if (isReq && !prev.anyRequired) {
            prev.anyRequired = true;
            prev.required = true;
            prev.cue = cue;
            prev.snippet = line.slice(0, 200);
          }
        }
      }
    }
  }
  return [...found.values()]
    .map(({ anyRequired: _a, ...rest }) => rest)
    .sort((a, b) => Number(b.required) - Number(a.required) || a.name.localeCompare(b.name));
}

/** Shape stored in job_targets.extractedSkills (read by learning/recommend.ts). */
export function toStoredSkills(details: { slug: string; name: string; required: boolean }[]): ExtractedSkill[] {
  return details.map((d) => ({ slug: d.slug, name: d.name, required: d.required }));
}

export const KNOWN_SKILL_SLUGS = new Set(NAME_BY_SLUG.keys());
