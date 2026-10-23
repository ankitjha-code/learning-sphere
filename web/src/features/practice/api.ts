export type Difficulty = 'easy' | 'medium' | 'hard';
export type Provider = 'quickjs' | 'pglite' | 'docker' | 'judge0' | 'none';
export type Language = 'python' | 'javascript' | 'typescript' | 'java' | 'cpp' | 'c' | 'go' | 'rust' | 'sql';

export type SkillRef = { id: string; slug: string; name: string };

export type ProblemSummary = {
  id: string;
  slug: string | null;
  title: string;
  type: 'coding' | 'sql';
  difficulty: Difficulty;
  topics: string[];
  points: number;
  skills: SkillRef[];
  solved: boolean;
  attempted: boolean;
  bestScore: number | null;
};

export type ProblemCounts = { total: number; solved: number; attempted: number; byDifficulty: Record<string, { total: number; solved: number }> };

export type ProblemListResponse = { items: ProblemSummary[]; total: number; page: number; pageSize: number; counts: ProblemCounts };

export type Collection = { id: string; title: string; description: string; type: 'coding' | 'sql' | null; count: number; solved: number };

export type RuntimeInfo = { language: Language; available: boolean; provider: Provider; reason?: string; setupHint?: string };

export type ProblemDetail = {
  problem: {
    id: string;
    slug: string | null;
    type: 'coding' | 'sql';
    title: string;
    difficulty: Difficulty;
    points?: number;
    topics?: string[];
    source: string | null;
    content: {
      prompt: string;
      languages: Language[];
      starterCode?: Partial<Record<Language, string>>;
      visibleTests?: { name: string; input: string; expected: string }[];
      constraints?: string;
      timeLimitMs?: number;
      memoryLimitMb?: number;
      schemaSql?: string;
      orderMatters?: boolean;
      hintCount: number;
      hints?: string[];
    };
  };
  skills: SkillRef[];
  state: {
    solved: boolean;
    solvedAt: string | null;
    attempted: boolean;
    gaveUp: boolean;
    bestScore: number | null;
    lastLanguage: Language | null;
    hintsRevealed: number;
    hintCount: number;
    solutionAvailable: boolean;
    drafts: Partial<Record<Language, { code: string; updatedAt: string }>>;
  };
};

export type TestStatus = 'passed' | 'wrong_answer' | 'runtime_error' | 'time_limit' | 'memory_limit' | 'compile_error' | 'error';
export type RunStatus = 'accepted' | 'wrong_answer' | 'runtime_error' | 'compile_error' | 'time_limit' | 'unavailable' | 'error' | 'completed';

export type TestResult = { name: string; hidden: boolean; passed: boolean; status: TestStatus; timeMs: number | null; input?: string; expected?: string; actual?: string; stderr?: string };

export type RunResult = {
  id: string;
  kind: 'run' | 'submit';
  language: Language;
  provider: Provider;
  status: RunStatus;
  passed: number;
  total: number;
  message?: string;
  compileOutput?: string;
  results: TestResult[];
  durationMs: number | null;
  custom?: boolean;
  columns?: string[];
  rows?: unknown[][];
  rowCount?: number;
  expectedColumns?: string[];
};

export type SubmitResponse = {
  submission: RunResult;
  firstSolve: boolean;
  xpAwarded: number;
  evidence: { added: boolean; score: number; skills: SkillRef[] } | null;
};

export type SubmissionSummary = { id: string; kind: 'run' | 'submit'; language: Language; status: RunStatus; provider: Provider; passed: number; total: number; durationMs: number | null; createdAt: string };

export type SubmissionDetail = RunResult & { code: string; createdAt: string; problem: { id: string; slug: string | null; title: string; type: string } | null };

export type AiResponse = { ok: true; text: string; provider: string; model: string; label: string } | { ok: false; reason: string; message: string; retryAfterSeconds: number | null };

export type SolutionResponse = {
  unlockedBy: 'solved' | 'gave_up';
  solution: { explanation: string | null; statedComplexity: string | null; reference: { language: Language; code: string }[] };
};

export const LANGUAGE_LABEL: Record<Language, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  go: 'Go',
  rust: 'Rust',
  sql: 'SQL',
};

export const PROVIDER_LABEL: Record<Provider, string> = {
  quickjs: 'Runs in browser-safe sandbox (QuickJS)',
  pglite: 'Runs on a fresh PostgreSQL sandbox (PGlite)',
  docker: 'Docker sandbox',
  judge0: 'Judge0',
  none: 'Unavailable',
};

export const DIFFICULTY_TONE: Record<Difficulty, 'success' | 'warning' | 'danger'> = { easy: 'success', medium: 'warning', hard: 'danger' };

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  accepted: 'Accepted',
  wrong_answer: 'Wrong answer',
  runtime_error: 'Runtime error',
  compile_error: 'Compile error',
  time_limit: 'Time limit exceeded',
  unavailable: 'Execution unavailable',
  error: 'Sandbox error',
  completed: 'Finished',
};

export const TEST_STATUS_LABEL: Record<TestStatus, string> = {
  passed: 'Passed',
  wrong_answer: 'Wrong answer',
  runtime_error: 'Runtime error',
  time_limit: 'Time limit',
  memory_limit: 'Memory limit',
  compile_error: 'Compile error',
  error: 'Sandbox error',
};

export function runTone(s: RunStatus): 'success' | 'danger' | 'warning' | 'neutral' {
  if (s === 'accepted' || s === 'completed') return 'success';
  if (s === 'unavailable' || s === 'error') return 'warning';
  return 'danger';
}

/**
 * Starter code for languages the problem author did not provide. All problems read
 * stdin and print to stdout; these templates only show how to do that.
 */
export const DEFAULT_STARTERS: Record<Exclude<Language, 'sql'>, string> = {
  python: 'import sys\n\ndata = sys.stdin.read().split()\n# Write your solution here\n',
  javascript: "const input = require('fs').readFileSync(0, 'utf8');\nconst lines = input.trim().split('\\n');\n// Write your solution here\n",
  typescript: "const input: string = require('fs').readFileSync(0, 'utf8');\nconst lines: string[] = input.trim().split('\\n');\n// Write your solution here\n",
  java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));\n        // Write your solution here\n    }\n}\n',
  cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // Write your solution here\n    return 0;\n}\n',
  c: '#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n\nint main(void) {\n    /* Write your solution here */\n    return 0;\n}\n',
  go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\nfunc main() {\n\treader := bufio.NewReader(os.Stdin)\n\t_ = reader\n\tfmt.Print("")\n\t// Write your solution here\n}\n',
  rust: 'use std::io::{self, Read};\n\nfn main() {\n    let mut input = String::new();\n    io::stdin().read_to_string(&mut input).unwrap();\n    // Write your solution here\n}\n',
};

export function starterFor(detail: ProblemDetail, lang: Language): string {
  if (lang === 'sql') return '-- Write your query here\nSELECT\n';
  return detail.problem.content.starterCode?.[lang] ?? DEFAULT_STARTERS[lang];
}
