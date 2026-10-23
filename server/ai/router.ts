/**
 * Deterministic question → specialist routing. No model call: keyword and intent
 * rules with weights, so the choice is predictable and explainable. The user can
 * always override the suggestion.
 */
import { ASSISTANTS, getAssistant, type Assistant } from './assistants';

type Rule = { assistant: string; weight: number; terms: string[] };

// Terms are matched case-insensitively on word boundaries; the display form is used in explanations.
const RULES: Rule[] = [
  { assistant: 'sql_coach', weight: 3, terms: ['SQL', 'JOIN', 'LEFT JOIN', 'INNER JOIN', 'GROUP BY', 'HAVING', 'ORDER BY', 'SELECT', 'WHERE clause', 'subquery', 'window function', 'index', 'indexes', 'PostgreSQL', 'Postgres', 'MySQL', 'SQLite', 'normalization', 'foreign key', 'primary key', 'query plan', 'EXPLAIN ANALYZE', 'database schema', 'transaction'] },
  { assistant: 'debugger', weight: 3, terms: ['error', 'exception', 'stack trace', 'traceback', 'bug', 'crash', 'crashes', 'not working', "doesn't work", 'does not work', 'TypeError', 'NullPointerException', 'segfault', 'undefined is not', 'cannot read properties', 'fails', 'failing', 'broken', 'debug'] },
  { assistant: 'code_explainer', weight: 2, terms: ['explain this code', 'what does this code', 'what does this function', 'walk me through', 'line by line', 'what does this regex', 'regular expression', 'understand this code'] },
  { assistant: 'dsa_coach', weight: 3, terms: ['algorithm', 'data structure', 'linked list', 'binary tree', 'BST', 'graph', 'BFS', 'DFS', 'dynamic programming', 'DP', 'recursion', 'memoization', 'heap', 'priority queue', 'hash map', 'two pointers', 'sliding window', 'Big O', 'time complexity', 'LeetCode', 'sorting', 'binary search', 'stack', 'queue', 'trie'] },
  { assistant: 'system_design', weight: 3, terms: ['system design', 'architecture', 'scalability', 'scale', 'load balancer', 'microservices', 'cache', 'caching', 'CDN', 'sharding', 'replication', 'message queue', 'Kafka', 'rate limiter', 'URL shortener', 'high availability', 'CAP theorem', 'distributed'] },
  { assistant: 'ml_tutor', weight: 3, terms: ['machine learning', 'ML', 'deep learning', 'neural network', 'model training', 'overfitting', 'regression', 'classification', 'precision', 'recall', 'F1', 'gradient descent', 'transformer', 'LLM', 'embedding', 'PyTorch', 'TensorFlow', 'scikit-learn', 'feature engineering', 'data leakage'] },
  { assistant: 'math_tutor', weight: 3, terms: ['proof', 'prove', 'theorem', 'probability', 'statistics', 'linear algebra', 'matrix', 'vector', 'calculus', 'derivative', 'integral', 'discrete math', 'combinatorics', 'permutation', 'logarithm', 'induction', 'set theory', 'Bayes', 'modular arithmetic'] },
  { assistant: 'assignment_guide', weight: 4, terms: ['assignment', 'homework', 'coursework', 'due date', 'my professor', 'my instructor', 'graded', 'submission', 'lab report', 'rubric for my'] },
  { assistant: 'project_mentor', weight: 3, terms: ['project idea', 'portfolio project', 'side project', 'capstone', 'tech stack', 'which stack', 'MVP', 'milestones', 'scope my project', 'project plan', 'build a project'] },
  { assistant: 'tech_interview', weight: 3, terms: ['coding interview', 'technical interview', 'mock interview', 'whiteboard', 'interview question', 'onsite', 'technical round', 'live coding'] },
  { assistant: 'behavioral_interview', weight: 4, terms: ['behavioral', 'behavioural', 'STAR method', 'STAR', 'tell me about a time', 'conflict with', 'greatest weakness', 'strengths and weaknesses', 'HR round', 'culture fit'] },
  { assistant: 'resume_reviewer', weight: 4, terms: ['resume', 'résumé', 'CV', 'bullet points', 'ATS'] },
  { assistant: 'application_writer', weight: 4, terms: ['cover letter', 'application letter', 'motivation letter', 'why do you want to work', 'application question', 'personal statement', 'referral message', 'cold email'] },
  { assistant: 'jd_analyzer', weight: 4, terms: ['job description', 'JD', 'job posting', 'job ad', 'requirements for this role', 'qualifications', 'am I qualified'] },
  { assistant: 'career_advisor', weight: 3, terms: ['career', 'career switch', 'career change', 'which role', 'job market', 'should I become', 'salary', 'promotion', 'career path', 'data analyst or', 'get a job', 'land a job'] },
  { assistant: 'writing_coach', weight: 3, terms: ['write better', 'technical writing', 'documentation', 'README', 'email to', 'proofread', 'rephrase', 'tone', 'presentation', 'design doc', 'clearer', 'grammar'] },
  { assistant: 'study_assistant', weight: 3, terms: ['my notes', 'from my notes', 'summarize', 'summarise', 'sources', 'cite', 'research', 'literature', 'compare these', 'study guide', 'flashcards', 'knowledge base'] },
  { assistant: 'mentor', weight: 2, terms: ['study plan', 'what should I learn', 'learn next', 'roadmap', 'motivation', 'stuck', 'consistent', 'schedule', 'hours a week', 'where do I start', 'beginner'] },
  { assistant: 'tutor', weight: 2, terms: ['JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'Rust', 'Go', 'React', 'closure', 'class', 'function', 'loop', 'variable', 'async', 'promise', 'API', 'OOP', 'how do I', 'what is'] },
  { assistant: 'faculty_ta', weight: 4, terms: ['lesson plan', 'my students', 'teach this', 'lecture', 'syllabus', 'formative', 'quiz questions for my class', 'rubric for students', 'learning objectives'] },
  { assistant: 'recruiter_assessment', weight: 4, terms: ['candidates', 'hiring', 'take-home', 'screening', 'interview plan', 'assessment for the role', 'interview rubric', 'job-related'] },
];

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Short acronyms and words that are common in everyday English only count in their exact case.
const CASE_SENSITIVE = new Set(['DP', 'ML', 'CV', 'JD', 'STAR', 'Go', 'JOIN', 'SELECT', 'WHERE clause', 'HAVING', 'API', 'ATS', 'F1', 'MVP', 'BST', 'BFS', 'DFS', 'CDN', 'LLM', 'OOP', 'HR round', 'Java']);

const COMPILED = RULES.map((r) => ({
  ...r,
  matchers: r.terms.map((term) => ({ term, re: new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRe(term)}(?=$|[^\\p{L}\\p{N}_])`, CASE_SENSITIVE.has(term) ? 'u' : 'iu') })),
}));

export type RouteSuggestion = {
  assistant: string;
  name: string;
  explanation: string;
  matched: string[];
  alternatives: { assistant: string; name: string; score: number }[];
  fallback: boolean;
};

function joinTerms(terms: string[]) {
  const t = terms.slice(0, 3);
  if (t.length === 1) return t[0];
  return `${t.slice(0, -1).join(', ')} and ${t[t.length - 1]}`;
}

/**
 * Routes a question to a specialist. `isAvailable` lets the caller skip role-gated
 * specialists the user cannot use (the explanation says so).
 */
export function routeQuestion(message: string, isAvailable: (a: Assistant) => boolean = () => true): RouteSuggestion {
  const text = message.slice(0, 4000);
  const scores = new Map<string, { score: number; matched: string[] }>();
  for (const rule of COMPILED) {
    for (const m of rule.matchers) {
      if (m.re.test(text)) {
        const s = scores.get(rule.assistant) ?? { score: 0, matched: [] };
        // Longer phrases are stronger signals than single words.
        s.score += rule.weight * (m.term.includes(' ') ? 1.5 : 1);
        if (!s.matched.includes(m.term)) s.matched.push(m.term);
        scores.set(rule.assistant, s);
      }
    }
  }
  // Deterministic order: score desc, then catalog order.
  const order = new Map(ASSISTANTS.map((a, i) => [a.id, i]));
  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score || order.get(a[0])! - order.get(b[0])!);

  let skipped: Assistant | null = null;
  for (const [id, s] of ranked) {
    const a = getAssistant(id)!;
    if (!isAvailable(a)) {
      skipped ??= a;
      continue;
    }
    const alternatives = ranked
      .filter(([other]) => other !== id && isAvailable(getAssistant(other)!))
      .slice(0, 3)
      .map(([other, os]) => ({ assistant: other, name: getAssistant(other)!.name, score: os.score }));
    const note = skipped ? ` (${skipped.name} matched too, but it needs a role you do not have in your active organization)` : '';
    return {
      assistant: id,
      name: a.name,
      explanation: `Routed to ${a.name} because your question mentions ${joinTerms(s.matched)}${note}.`,
      matched: s.matched,
      alternatives,
      fallback: false,
    };
  }
  const mentor = getAssistant('mentor')!;
  return {
    assistant: mentor.id,
    name: mentor.name,
    explanation: `No specific topic signals found, so this goes to the ${mentor.name}. Pick another specialist if you prefer.`,
    matched: [],
    alternatives: [],
    fallback: true,
  };
}
