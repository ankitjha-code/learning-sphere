/**
 * Code execution contract. Implemented by the CodeLab/exec work; used by the
 * assessment engine for coding and SQL questions. Never fake results: when no
 * sandbox can run a language, return status 'unavailable' with a reason.
 */
export type ExecLanguage = 'python' | 'javascript' | 'typescript' | 'java' | 'cpp' | 'c' | 'go' | 'rust';

export type ExecTest = { name: string; input: string; expected: string; hidden?: boolean; weight?: number };

export type ExecTestResult = {
  name: string;
  hidden: boolean;
  passed: boolean;
  status: 'passed' | 'wrong_answer' | 'runtime_error' | 'time_limit' | 'memory_limit' | 'compile_error' | 'error';
  timeMs: number | null;
  // Only populated for visible tests (never send hidden inputs/outputs to candidates):
  input?: string;
  expected?: string;
  actual?: string;
  stderr?: string;
};

export type ExecResult = {
  provider: 'quickjs' | 'pglite' | 'docker' | 'judge0' | 'none';
  status: 'accepted' | 'wrong_answer' | 'runtime_error' | 'compile_error' | 'time_limit' | 'unavailable' | 'error';
  passed: number;
  total: number;
  compileOutput?: string;
  message?: string; // human-readable summary or unavailability reason
  results: ExecTestResult[];
  durationMs: number;
};

export type RuntimeInfo = { language: ExecLanguage | 'sql'; available: boolean; provider: ExecResult['provider']; reason?: string; setupHint?: string };

export { runCode, runSql, runtimes } from './runner';
