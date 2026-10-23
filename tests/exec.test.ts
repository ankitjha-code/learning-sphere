import { describe, it, expect, afterAll, afterEach } from 'vitest';
import { runCode, runSql, runtimes, configureExec, resetExecConfig } from '../server/exec/runner';
import { shutdownExecPool } from '../server/exec/pool';
import { dockerReachable, imagePresent, pullImage } from '../server/exec/docker';
import { normalizeOutput, compareResultSets } from '../server/exec/compare';

process.env.NODE_ENV = 'test';

const SUM_JS = "const [a, b] = require('fs').readFileSync(0, 'utf8').trim().split('\\n').map(Number);\nconsole.log(a + b);\n";
const tests = [
  { name: 'Example', input: '2\n3\n', expected: '5' },
  { name: 'Negative', input: '-4\n10\n', expected: '6' },
  { name: 'Large values', input: '1000000000\n1000000000\n', expected: '2000000000', hidden: true },
];

afterEach(() => resetExecConfig());
afterAll(async () => shutdownExecPool());

describe('output comparison', () => {
  it('normalizes line endings, trailing spaces and trailing blank lines', () => {
    expect(normalizeOutput('a  \r\nb\t\n\n\n')).toBe('a\nb');
    expect(normalizeOutput(' a')).toBe(' a'); // leading whitespace is significant
  });

  it('compares SQL result sets by normalized values', () => {
    const f = [{ name: 'n', dataTypeID: 1700 }];
    expect(compareResultSets({ fields: f, rows: [['120.00']] }, { fields: [{ name: 'N', dataTypeID: 23 }], rows: [[120]] }, true).equal).toBe(true);
    expect(compareResultSets({ fields: f, rows: [[null]] }, { fields: f, rows: [['0']] }, true).equal).toBe(false);
  });
});

describe('JavaScript and TypeScript (QuickJS sandbox)', () => {
  it('accepts a correct solution and hides hidden-test details', async () => {
    const r = await runCode({ language: 'javascript', code: SUM_JS, tests });
    expect(r.provider).toBe('quickjs');
    expect(r.status).toBe('accepted');
    expect(r.passed).toBe(3);
    expect(r.results[0]).toMatchObject({ name: 'Example', passed: true, input: '2\n3\n', expected: '5', actual: '5\n' });
    const hidden = r.results[2];
    expect(hidden.hidden).toBe(true);
    expect(hidden.name).toBe('Hidden test 1');
    expect(hidden).not.toHaveProperty('input');
    expect(hidden).not.toHaveProperty('expected');
    expect(hidden).not.toHaveProperty('actual');
    expect(JSON.stringify(r)).not.toContain('2000000000');
  });

  it('reports a wrong answer with the actual output', async () => {
    const r = await runCode({ language: 'javascript', code: "console.log('7')", tests: tests.slice(0, 1) });
    expect(r.status).toBe('wrong_answer');
    expect(r.results[0].actual).toBe('7\n');
  });

  it('reports runtime errors with stderr', async () => {
    const r = await runCode({ language: 'javascript', code: 'null.x;', tests: tests.slice(0, 1) });
    expect(r.status).toBe('runtime_error');
    expect(r.results[0].stderr).toMatch(/TypeError/);
  });

  it('stops an infinite loop with time_limit without hanging', async () => {
    const t0 = Date.now();
    const r = await runCode({ language: 'javascript', code: 'while (true) {}', tests: tests.slice(0, 2), timeLimitMs: 300 });
    expect(r.status).toBe('time_limit');
    expect(r.results.every((t) => t.status === 'time_limit')).toBe(true);
    expect(Date.now() - t0).toBeLessThan(15_000);
  });

  it('contains a memory bomb', async () => {
    const r = await runCode({ language: 'javascript', code: 'const a = []; while (true) a.push(new Array(100000).fill(1));', tests: tests.slice(0, 1), memoryLimitMb: 32, timeLimitMs: 5000 });
    expect(r.status).not.toBe('accepted');
    expect(['memory_limit', 'time_limit']).toContain(r.results[0].status);
    // The sandbox still works afterwards.
    const ok = await runCode({ language: 'javascript', code: SUM_JS, tests: tests.slice(0, 1) });
    expect(ok.status).toBe('accepted');
  });

  it('caps output', async () => {
    const r = await runCode({ language: 'javascript', code: "for (;;) console.log('x'.repeat(1000));", tests: tests.slice(0, 1) });
    expect(r.status).toBe('runtime_error');
    expect(r.results[0].actual!.length).toBeLessThanOrEqual(64 * 1024);
    expect(r.results[0].stderr).toMatch(/Output limit/);
  });

  it('runs TypeScript (types stripped) and supports async code', async () => {
    const code = "type P = [number, number];\nconst nums = require('fs').readFileSync(0, 'utf8').trim().split('\\n').map(Number) as P;\nasync function main(): Promise<void> { const s: number = await Promise.resolve(nums[0] + nums[1]); console.log(s); }\nmain();\n";
    const r = await runCode({ language: 'typescript', code, tests });
    expect(r.status).toBe('accepted');
  });

  it('reports TypeScript syntax errors as compile errors', async () => {
    const r = await runCode({ language: 'typescript', code: 'const x: = ;', tests: tests.slice(0, 1) });
    expect(r.status).toBe('compile_error');
    expect(r.compileOutput).toBeTruthy();
  });

  it('gives no access to process, real modules or the host', async () => {
    const code = [
      "const out = [typeof process, typeof globalThis.process, typeof fetch, typeof setTimeout];",
      "try { require('child_process'); out.push('child_process loaded'); } catch (e) { out.push('blocked'); }",
      "try { require('fs').readFileSync('/etc/passwd', 'utf8'); out.push('read file'); } catch (e) { out.push('no-fs'); }",
      "try { require('fs').writeFileSync('/tmp/x', 'y'); out.push('wrote'); } catch (e) { out.push('no-write'); }",
      "console.log(out.join(','));",
    ].join('\n');
    const r = await runCode({ language: 'javascript', code, tests: [{ name: 'host', input: '', expected: 'undefined,undefined,undefined,undefined,blocked,no-fs,no-write' }] });
    expect(r.results[0].actual).toBe('undefined,undefined,undefined,undefined,blocked,no-fs,no-write\n');
    expect(r.status).toBe('accepted');
  });
});

describe('SQL (PGlite sandbox)', () => {
  const schemaSql = 'CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT NOT NULL, salary NUMERIC(10,2) NOT NULL, hired DATE NOT NULL);';
  const seedSql = "INSERT INTO employees VALUES (1, 'Asha', 150000, '2015-03-01'), (2, 'Ben', 120000, '2017-06-15'), (3, 'Chen', 95000, '2019-01-10');";
  const solutionSql = 'SELECT name, salary FROM employees ORDER BY salary DESC;';

  it('accepts a correct query and returns rows plus only the expected column names', async () => {
    const r = await runSql({ schemaSql, seedSql, query: 'select NAME, salary::int as Salary from employees where salary > 0', solutionSql, orderMatters: false });
    expect(r.provider).toBe('pglite');
    expect(r.status).toBe('accepted');
    expect(r.columns).toEqual(['name', 'salary']);
    expect(r.rows).toHaveLength(3);
    expect(r.expectedColumns).toEqual(['name', 'salary']);
    expect(r).not.toHaveProperty('expectedRows');
  });

  it('rejects an incorrect query without leaking expected rows', async () => {
    const r = await runSql({ schemaSql, seedSql, query: "SELECT name, salary FROM employees WHERE name <> 'Ben'", solutionSql, orderMatters: false });
    expect(r.status).toBe('wrong_answer');
    expect(r.message).toMatch(/Expected 3 rows/);
    expect(JSON.stringify(r)).not.toContain('Ben');
  });

  it('is order-sensitive only when the problem says so', async () => {
    const asc = 'SELECT name, salary FROM employees ORDER BY salary ASC';
    expect((await runSql({ schemaSql, seedSql, query: asc, solutionSql, orderMatters: false })).status).toBe('accepted');
    const strict = await runSql({ schemaSql, seedSql, query: asc, solutionSql, orderMatters: true });
    expect(strict.status).toBe('wrong_answer');
    expect(strict.message).toMatch(/order/i);
  });

  it('reports SQL errors and stops runaway queries', async () => {
    const bad = await runSql({ schemaSql, seedSql, query: 'SELEC 1', solutionSql, orderMatters: false });
    expect(bad.status).toBe('runtime_error');
    expect(bad.message).toMatch(/syntax/i);
    const slow = await runSql({ schemaSql, seedSql, query: 'SELECT pg_sleep(30)', solutionSql, orderMatters: false, timeLimitMs: 1500 });
    expect(slow.status).toBe('time_limit');
  });

  it('cannot change the reference result by modifying data', async () => {
    const r = await runSql({ schemaSql, seedSql, query: 'DELETE FROM employees; SELECT name, salary FROM employees', solutionSql, orderMatters: false });
    expect(r.status).toBe('wrong_answer');
  });
});

describe('provider selection', () => {
  it('returns unavailable (never a fake result) when no sandbox can run a language', async () => {
    configureExec({ docker: 'false', judge0: null });
    const r = await runCode({ language: 'python', code: 'print(5)', tests: tests.slice(0, 1) });
    expect(r.status).toBe('unavailable');
    expect(r.provider).toBe('none');
    expect(r.passed).toBe(0);
    expect(r.message).toMatch(/CODE_EXEC_DOCKER=false/);
    const list = await runtimes();
    const py = list.find((x) => x.language === 'python')!;
    expect(py.available).toBe(false);
    expect(py.setupHint).toBeTruthy();
    expect(list.find((x) => x.language === 'javascript')).toMatchObject({ available: true, provider: 'quickjs' });
    expect(list.find((x) => x.language === 'sql')).toMatchObject({ available: true, provider: 'pglite' });
  });

  it('falls back to Judge0 when configured and Docker is off', async () => {
    configureExec({ docker: 'false', judge0: { url: 'http://127.0.0.1:9' } });
    const py = (await runtimes()).find((x) => x.language === 'python')!;
    expect(py).toMatchObject({ available: true, provider: 'judge0' });
    // An unreachable Judge0 is reported as an error, not as a result.
    const r = await runCode({ language: 'python', code: 'print(5)', tests: tests.slice(0, 1) });
    expect(r.provider).toBe('judge0');
    expect(r.status).toBe('error');
  });
});

// Docker tests run only where Docker is reachable (python:3.13-alpine is pulled if missing).
const PY_IMAGE = 'python:3.13-alpine';
const dockerState = await (async () => {
  const reach = await dockerReachable(true);
  if (!reach.ok) return { ok: false, why: `Docker not reachable: ${reach.error}` };
  if (!(await imagePresent(PY_IMAGE, true))) {
    const st = await pullImage(PY_IMAGE);
    if (st.status !== 'succeeded') return { ok: false, why: `Could not pull ${PY_IMAGE}: ${st.message}` };
  }
  return { ok: true, why: '' };
})();
if (!dockerState.ok) console.warn(`[exec.test] Skipping Docker sandbox tests. ${dockerState.why}`);

describe.skipIf(!dockerState.ok)('Python (Docker sandbox)', () => {
  it('accepts a correct solution', async () => {
    const r = await runCode({ language: 'python', code: 'a = int(input())\nb = int(input())\nprint(a + b)\n', tests });
    expect(r.provider).toBe('docker');
    expect(r.status).toBe('accepted');
    expect(r.results[2]).not.toHaveProperty('input');
  }, 60_000);

  it('handles wrong answers, runtime errors and time limits per test', async () => {
    const code = 'import sys\ndata = sys.stdin.read().split()\nif data[0] == "-4":\n    raise ValueError("boom")\nif data[0] == "1000000000":\n    while True: pass\nprint(int(data[0]) + int(data[1]) + 1)\n';
    const r = await runCode({ language: 'python', code, tests, timeLimitMs: 2000 });
    expect(r.results.map((t) => t.status)).toEqual(['wrong_answer', 'runtime_error', 'time_limit']);
    expect(r.results[1].stderr).toMatch(/ValueError: boom/);
  }, 60_000);

  it('has no network and a read-only filesystem', async () => {
    const code = [
      'import socket, os',
      'out = []',
      'try:',
      '    socket.create_connection(("1.1.1.1", 53), timeout=2); out.append("net")',
      'except Exception:',
      '    out.append("no-net")',
      'try:',
      '    open("/etc/hacked", "w"); out.append("wrote")',
      'except Exception:',
      '    out.append("ro")',
      'out.append(str(os.getuid()))',
      'print(",".join(out))',
    ].join('\n');
    const r = await runCode({ language: 'python', code, tests: [{ name: 'iso', input: '', expected: 'no-net,ro,65534' }] });
    expect(r.results[0].actual?.trim()).toBe('no-net,ro,65534');
  }, 60_000);
});
