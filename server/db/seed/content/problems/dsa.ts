import type { SeedProblem, SeedTest } from '../types';

// ---------------------------------------------------------------------------
// Deterministic test-data helpers. Large hidden tests are generated at module
// load from a fixed seed, and their expected output is computed here with an
// independent (often simpler or brute-force) method so the reference
// solutions are genuinely checked.
// ---------------------------------------------------------------------------

function rng(seed: number): (lo: number, hi: number) => number {
  let a = seed >>> 0;
  return (lo, hi) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const u = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return lo + Math.floor(u * (hi - lo + 1));
  };
}

function randInts(n: number, lo: number, hi: number, seed: number): number[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => r(lo, hi));
}

function shuffled<T>(arr: T[], seed: number): T[] {
  const r = rng(seed);
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = r(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function randString(n: number, alphabet: string, seed: number): string {
  const r = rng(seed);
  let s = '';
  for (let i = 0; i < n; i++) s += alphabet[r(0, alphabet.length - 1)];
  return s;
}

const LOWER = 'abcdefghijklmnopqrstuvwxyz';

// two-sum: multiples of 4 everywhere except two planted values of the form 4k+1,
// whose sum is 2 (mod 4), so exactly one pair reaches the target.
const twoSumBig: SeedTest = (() => {
  const r = rng(11);
  const nums = Array.from({ length: 10000 }, () => r(-250000, 250000) * 4);
  nums[1234] = 445;
  nums[8765] = 889;
  return { name: 'Large input (n = 10000)', input: `10000\n${nums.join(' ')}\n1334\n`, expected: '1234 8765' };
})();

const distinctBig = shuffled(Array.from({ length: 10000 }, (_, i) => i * 3 - 15000), 21);
const dupBig = distinctBig.slice();
dupBig[9999] = dupBig[0];

const anagramS = randString(10000, LOWER, 31);
const anagramT = shuffled(anagramS.split(''), 32);
const anagramBad = anagramT.slice();
anagramBad[5000] = LOWER[(LOWER.indexOf(anagramBad[5000]) + 1) % 26];

function maxSubarrayByPrefix(a: number[]): number {
  // best = max over j of prefix[j+1] - min(prefix[0..j])
  let prefix = 0;
  let minPrefix = 0;
  let best = -Infinity;
  for (const x of a) {
    prefix += x;
    best = Math.max(best, prefix - minPrefix);
    minPrefix = Math.min(minPrefix, prefix);
  }
  return best;
}
const kadaneBig = randInts(10000, -1000, 1000, 41);

function stockBySuffixMax(p: number[]): number {
  let best = 0;
  let maxAfter = -Infinity;
  for (let i = p.length - 1; i >= 0; i--) {
    best = Math.max(best, maxAfter - p[i]);
    maxAfter = Math.max(maxAfter, p[i]);
  }
  return best;
}
const stockBig = randInts(10000, 1, 10000, 42);

const zeroesBig = randInts(10000, -5, 5, 51);
const zeroesBigExpected = [...zeroesBig.filter((x) => x !== 0), ...zeroesBig.filter((x) => x === 0)];

const mergeA = randInts(5000, -1000000, 1000000, 61).sort((x, y) => x - y);
const mergeB = randInts(4000, -1000000, 1000000, 62).sort((x, y) => x - y);
const mergeExpected = [...mergeA, ...mergeB].sort((x, y) => x - y);

function longestUniqueBrute(s: string): number {
  let best = 0;
  for (let i = 0; i < s.length; i++) {
    const seen = new Set<string>();
    let j = i;
    while (j < s.length && !seen.has(s[j])) seen.add(s[j++]);
    best = Math.max(best, j - i);
  }
  return best;
}
const uniqueBig = randString(10000, LOWER + '0123456789!@#$%', 71);

const parensBig: string = (() => {
  const r = rng(81);
  const L = 10000;
  const open = '([{';
  const close: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const stack: string[] = [];
  let s = '';
  for (let pos = 0; pos < L; pos++) {
    const remaining = L - pos;
    const mustClose = stack.length === remaining;
    const mustOpen = stack.length === 0;
    if (!mustClose && (mustOpen || r(0, 1) === 0)) {
      const c = open[r(0, 2)];
      stack.push(c);
      s += c;
    } else {
      s += close[stack.pop() as string];
    }
  }
  return s;
})();
const parensBigBad = parensBig.slice(0, -1) + (parensBig.endsWith(')') ? ']' : ')');

const rpnBig: SeedTest = (() => {
  const r = rng(91);
  const tokens = ['1'];
  let value = 1;
  for (let i = 0; i < 4999; i++) {
    const v = r(1, 1000);
    const plus = r(0, 1) === 0;
    tokens.push(String(v), plus ? '+' : '-');
    value += plus ? v : -v;
  }
  return { name: 'Long expression (9999 tokens)', input: `${tokens.length}\n${tokens.join(' ')}\n`, expected: String(value) };
})();

const bsBig = Array.from({ length: 10000 }, (_, i) => i * 2 - 9000);

const listBig = randInts(10000, -1000000000, 1000000000, 101);

const intervalsBig: SeedTest = (() => {
  const r = rng(111);
  const items: [number, number][] = [];
  for (let i = 0; i < 10000; i++) {
    const s = r(0, 50000);
    items.push([s, s + r(0, 12)]);
  }
  // Independent check: mark covered points on a doubled number line, so
  // [1,3] and [3,5] connect at 6 but [1,3] and [4,5] leave a gap at 7.
  const covered = new Uint8Array(2 * 50020 + 2);
  for (const [s, e] of items) for (let x = 2 * s; x <= 2 * e; x++) covered[x] = 1;
  const out: string[] = [];
  for (let x = 0; x < covered.length; x++) {
    if (covered[x] && (x === 0 || !covered[x - 1])) {
      let y = x;
      while (y + 1 < covered.length && covered[y + 1]) y++;
      out.push(`${x / 2} ${y / 2}`);
    }
  }
  return { name: 'Large input (n = 10000)', input: `10000\n${items.map((p) => p.join(' ')).join('\n')}\n`, expected: out.join('\n') };
})();

const topKBig: SeedTest = (() => {
  const nums = randInts(10000, -50, 50, 121);
  const cnt = new Map<number, number>();
  for (const x of nums) cnt.set(x, (cnt.get(x) ?? 0) + 1);
  const order = [...cnt.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 10).map((e) => e[0]);
  return { name: 'Large input (n = 10000, k = 10)', input: `10000 10\n${nums.join(' ')}\n`, expected: order.join(' ') };
})();

const kthBig: SeedTest = (() => {
  const nums = randInts(10000, -1000000, 1000000, 131);
  const sorted = nums.slice().sort((a, b) => b - a);
  return { name: 'Large input (n = 10000, k = 2500)', input: `10000 2500\n${nums.join(' ')}\n`, expected: String(sorted[2499]) };
})();

const islandsBig: SeedTest = (() => {
  const r = rng(141);
  const R = 100;
  const C = 100;
  const g = Array.from({ length: R }, () => Array.from({ length: C }, () => (r(0, 99) < 45 ? '1' : '0')).join(''));
  // Independent check: union-find over land cells.
  const parent = Array.from({ length: R * C }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  let comps = 0;
  for (let i = 0; i < R; i++)
    for (let j = 0; j < C; j++) {
      if (g[i][j] !== '1') continue;
      comps++;
      for (const [di, dj] of [
        [-1, 0],
        [0, -1],
      ]) {
        const a = i + di;
        const b = j + dj;
        if (a >= 0 && b >= 0 && g[a][b] === '1') {
          const x = find(i * C + j);
          const y = find(a * C + b);
          if (x !== y) {
            parent[x] = y;
            comps--;
          }
        }
      }
    }
  return { name: 'Large grid (100 x 100)', input: `${R} ${C}\n${g.join('\n')}\n`, expected: String(comps) };
})();

function gridBfs(g: string[]): number {
  const R = g.length;
  const C = g[0].length;
  if (g[0][0] === '#' || g[R - 1][C - 1] === '#') return -1;
  const dist = Array.from({ length: R }, () => new Array<number>(C).fill(-1));
  dist[0][0] = 0;
  let frontier: [number, number][] = [[0, 0]];
  while (frontier.length) {
    const next: [number, number][] = [];
    for (const [i, j] of frontier)
      for (const [a, b] of [
        [i + 1, j],
        [i - 1, j],
        [i, j + 1],
        [i, j - 1],
      ])
        if (a >= 0 && b >= 0 && a < R && b < C && g[a][b] === '.' && dist[a][b] === -1) {
          dist[a][b] = dist[i][j] + 1;
          next.push([a, b]);
        }
    frontier = next;
  }
  return dist[R - 1][C - 1];
}
function gridTest(name: string, rows: number, cols: number, wallPct: number, seed: number): SeedTest {
  const r = rng(seed);
  const g = Array.from({ length: rows }, () => Array.from({ length: cols }, () => (r(0, 99) < wallPct ? '#' : '.')));
  g[0][0] = '.';
  g[rows - 1][cols - 1] = '.';
  const lines = g.map((row) => row.join(''));
  return { name, input: `${rows} ${cols}\n${lines.join('\n')}\n`, expected: String(gridBfs(lines)) };
}

function lcsDp(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[a.length][b.length];
}
const lcsA = randString(1000, 'acgt', 151);
const lcsB = randString(1000, 'acgt', 152);

// ---------------------------------------------------------------------------

const JS_TOKENS = "const data = require('fs').readFileSync(0, 'utf8').split(/\\s+/).filter(Boolean);\n";
const PY_TOKENS = 'import sys\n\ndata = sys.stdin.read().split()\n';

export const dsaProblems: SeedProblem[] = [
  // ------------------------------------------------------------------ hashing
  {
    slug: 'two-sum',
    title: 'Two sum',
    type: 'coding',
    difficulty: 'easy',
    skills: ['hashing', 'arrays'],
    topics: ['arrays', 'hashing'],
    prompt: `Given an array of integers \`nums\` and an integer \`target\`, find two different positions \`i < j\` such that \`nums[i] + nums[j] == target\`.

At least one such pair is guaranteed to exist. If several pairs work, print the pair with the **smallest \`j\`**; if several pairs share that \`j\`, print the one with the **smallest \`i\`**.

**Input:**
- line 1: an integer \`n\`
- line 2: \`n\` space-separated integers \`nums[0] ... nums[n-1]\`
- line 3: the integer \`target\`

**Output:** the two 0-based indices \`i j\` separated by a space.

**Example**

Input:
\`\`\`
4
2 7 11 15
9
\`\`\`
Output:
\`\`\`
0 1
\`\`\``,
    constraints: '2 ≤ n ≤ 10^4; -10^9 ≤ nums[i], target ≤ 10^9; at least one valid pair exists.',
    hints: [
      'Checking every pair is O(n^2). As you scan left to right, what information about earlier elements would let you answer instantly?',
      'For the current element x at index j, you need to know whether target - x appeared earlier, and where. A hash map from value to index answers that in O(1).',
      'Scan j from 0 to n-1. If target - nums[j] is in the map, print its index and j and stop. Otherwise store nums[j] only if it is not already in the map, so the map keeps the smallest index for each value.',
    ],
    explanation: `Scan once while keeping a dictionary \`seen\` from value to the first index where it appeared. At index \`j\`, the needed partner is \`target - nums[j]\`. If it is in \`seen\`, we have found the pair with the smallest possible \`j\` (we stop at the first success), and because we only store the first occurrence of each value, its index is the smallest \`i\` for that \`j\`.

Checking before inserting matters: it prevents pairing an element with itself (for example \`target = 6\` and a single \`3\`).

**Complexity:** O(n) time on average and O(n) extra space, compared with O(n^2) time for the brute-force double loop.`,
    starterCode: {
      python: PY_TOKENS + 'n = int(data[0])\nnums = list(map(int, data[1:1 + n]))\ntarget = int(data[1 + n])\n# print the indices i j\n',
      javascript: JS_TOKENS + 'const n = Number(data[0]);\nconst nums = data.slice(1, 1 + n).map(Number);\nconst target = Number(data[1 + n]);\n// console.log(i + " " + j);\n',
    },
    visibleTests: [
      { name: 'Example', input: '4\n2 7 11 15\n9\n', expected: '0 1' },
      { name: 'Pair not at the start', input: '3\n3 2 4\n6\n', expected: '1 2' },
    ],
    hiddenTests: [
      { name: 'Equal values', input: '2\n3 3\n6\n', expected: '0 1' },
      { name: 'Negatives and zero target', input: '5\n-3 4 3 90 -7\n0\n', expected: '0 2' },
      { name: 'Several valid pairs (smallest j wins)', input: '6\n3 1 2 3 5 4\n6\n', expected: '0 3' },
      { name: 'Duplicate partner (smallest i wins)', input: '5\n1 1 1 4 5\n5\n', expected: '0 3' },
      twoSumBig,
    ],
    solutions: {
      python: String.raw`import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    nums = list(map(int, data[1:1 + n]))
    target = int(data[1 + n])
    seen = {}
    for j, x in enumerate(nums):
        need = target - x
        if need in seen:
            print(seen[need], j)
            return
        if x not in seen:
            seen[x] = j

main()
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const n = Number(data[0]);
const nums = data.slice(1, 1 + n).map(Number);
const target = Number(data[1 + n]);
const seen = new Map();
for (let j = 0; j < n; j++) {
  const need = target - nums[j];
  if (seen.has(need)) {
    console.log(seen.get(need) + ' ' + j);
    break;
  }
  if (!seen.has(nums[j])) seen.set(nums[j], j);
}
`,
    },
  },
  {
    slug: 'contains-duplicate',
    title: 'Contains duplicate',
    type: 'coding',
    difficulty: 'easy',
    skills: ['hashing', 'arrays'],
    topics: ['arrays', 'hashing', 'sets'],
    prompt: `Given an array of integers, print \`true\` if any value appears at least twice, otherwise print \`false\`.

**Input:**
- line 1: an integer \`n\`
- line 2: \`n\` space-separated integers

**Output:** \`true\` or \`false\` (lowercase).

**Example**

Input:
\`\`\`
4
1 2 3 1
\`\`\`
Output:
\`\`\`
true
\`\`\``,
    constraints: '1 ≤ n ≤ 10^4; -10^9 ≤ nums[i] ≤ 10^9',
    hints: [
      'The brute-force approach compares every pair. Which data structure answers "have I seen this before?" in constant time?',
      'Keep a set of values seen so far while scanning the array.',
      'For each x: if x is already in the set, print true and stop; otherwise add it. If the loop finishes, print false. (Alternatively compare len(set(nums)) with n.)',
    ],
    explanation: `A hash set gives average O(1) membership checks, so one pass over the array is enough: the first time we meet a value already in the set, we know there is a duplicate.

An alternative is to sort and check adjacent elements, which uses O(n log n) time but can be done in place.

**Complexity:** O(n) average time and O(n) extra space with a set; O(n log n) time with sorting.`,
    starterCode: {
      python: PY_TOKENS + 'n = int(data[0])\nnums = list(map(int, data[1:1 + n]))\n',
      javascript: JS_TOKENS + 'const n = Number(data[0]);\nconst nums = data.slice(1, 1 + n).map(Number);\n',
    },
    visibleTests: [
      { name: 'Example', input: '4\n1 2 3 1\n', expected: 'true' },
      { name: 'All distinct', input: '4\n1 2 3 4\n', expected: 'false' },
    ],
    hiddenTests: [
      { name: 'Single element', input: '1\n5\n', expected: 'false' },
      { name: 'Negative duplicates', input: '3\n-1 0 -1\n', expected: 'true' },
      { name: 'Many duplicates', input: '10\n1 1 1 3 3 4 3 2 4 2\n', expected: 'true' },
      { name: 'Large, all distinct', input: `10000\n${distinctBig.join(' ')}\n`, expected: 'false' },
      { name: 'Large, one duplicate far apart', input: `10000\n${dupBig.join(' ')}\n`, expected: 'true' },
    ],
    solutions: {
      python: String.raw`import sys

data = sys.stdin.read().split()
n = int(data[0])
seen = set()
answer = "false"
for tok in data[1:1 + n]:
    x = int(tok)
    if x in seen:
        answer = "true"
        break
    seen.add(x)
print(answer)
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const n = Number(data[0]);
const seen = new Set();
let answer = 'false';
for (let i = 1; i <= n; i++) {
  const x = Number(data[i]);
  if (seen.has(x)) { answer = 'true'; break; }
  seen.add(x);
}
console.log(answer);
`,
    },
  },
  {
    slug: 'valid-anagram',
    title: 'Valid anagram',
    type: 'coding',
    difficulty: 'easy',
    skills: ['strings', 'hashing'],
    topics: ['strings', 'hashing', 'counting'],
    prompt: `Two strings are **anagrams** if one can be rearranged to form the other, using every character exactly as many times as it appears. Print \`true\` if \`s\` and \`t\` are anagrams, otherwise \`false\`.

**Input:** two lines: the string \`s\`, then the string \`t\`. Both contain only lowercase English letters.

**Output:** \`true\` or \`false\`.

**Example**

Input:
\`\`\`
anagram
nagaram
\`\`\`
Output:
\`\`\`
true
\`\`\``,
    constraints: '1 ≤ |s|, |t| ≤ 10^4; lowercase letters a-z only',
    hints: [
      'If the lengths differ, can they ever be anagrams?',
      'Anagrams have exactly the same count of each letter. Count the letters of both strings.',
      'Use an array of 26 counters: add 1 for each letter of s and subtract 1 for each letter of t. They are anagrams exactly when every counter ends at 0.',
    ],
    explanation: `Two strings are anagrams exactly when their character frequency tables are equal. Counting with a fixed array of 26 integers (or a \`Counter\` / \`Map\`) takes one pass over each string. Sorting both strings and comparing also works, but costs O(n log n).

**Complexity:** O(|s| + |t|) time and O(1) extra space (26 counters; O(k) for an alphabet of size k).`,
    starterCode: {
      python: 's = input().strip()\nt = input().strip()\n',
      javascript: "const [s, t] = require('fs').readFileSync(0, 'utf8').split('\\n').map((x) => x.trim());\n",
    },
    visibleTests: [
      { name: 'Example', input: 'anagram\nnagaram\n', expected: 'true' },
      { name: 'Not anagrams', input: 'rat\ncar\n', expected: 'false' },
    ],
    hiddenTests: [
      { name: 'Different lengths', input: 'ab\nabc\n', expected: 'false' },
      { name: 'Same letters, different counts', input: 'aab\nabb\n', expected: 'false' },
      { name: 'Single character', input: 'a\na\n', expected: 'true' },
      { name: 'Large anagram', input: `${anagramS}\n${anagramT.join('')}\n`, expected: 'true' },
      { name: 'Large, one letter changed', input: `${anagramS}\n${anagramBad.join('')}\n`, expected: 'false' },
    ],
    solutions: {
      python: String.raw`import sys

s, t = sys.stdin.read().split()[:2]
if len(s) != len(t):
    print("false")
else:
    counts = [0] * 26
    for ch in s:
        counts[ord(ch) - 97] += 1
    for ch in t:
        counts[ord(ch) - 97] -= 1
    print("true" if all(c == 0 for c in counts) else "false")
`,
      javascript: String.raw`const [s, t] = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
let ok = s.length === t.length;
if (ok) {
  const counts = new Array(26).fill(0);
  for (let i = 0; i < s.length; i++) {
    counts[s.charCodeAt(i) - 97]++;
    counts[t.charCodeAt(i) - 97]--;
  }
  ok = counts.every((c) => c === 0);
}
console.log(ok ? 'true' : 'false');
`,
    },
  },
  {
    slug: 'top-k-frequent',
    title: 'Top k frequent elements',
    type: 'coding',
    difficulty: 'medium',
    skills: ['hashing', 'sorting', 'heaps'],
    topics: ['hashing', 'counting', 'sorting', 'heap'],
    prompt: `Given an array of integers and an integer \`k\`, print the \`k\` most frequent values.

To make the answer unique, order values by **frequency, highest first**; values with the same frequency are ordered by **value, smallest first**. Print the first \`k\` values in that order.

**Input:**
- line 1: two integers \`n k\`
- line 2: \`n\` space-separated integers

**Output:** \`k\` values on one line, separated by spaces.

**Example**

Input:
\`\`\`
6 2
1 1 1 2 2 3
\`\`\`
Output:
\`\`\`
1 2
\`\`\``,
    constraints: '1 ≤ n ≤ 10^4; -10^4 ≤ nums[i] ≤ 10^4; 1 ≤ k ≤ number of distinct values',
    hints: [
      'First you need to know how often each value occurs. Which structure counts things?',
      'Build a frequency map, then order its (value, count) entries using the rule in the statement.',
      'Sort entries by the key (-count, value) and take the first k values. A heap of size k or bucket sort by frequency are faster alternatives when the number of distinct values is large.',
    ],
    explanation: `Count with a hash map in O(n). Then sort the d distinct entries by \`(-count, value)\` so that higher counts come first and ties are broken by the smaller value. Taking the first \`k\` gives the canonical answer.

Faster alternatives: a min-heap of size \`k\` gives O(n + d log k), and bucket sort by frequency gives O(n) (frequencies are at most n), but you must still sort within a bucket to honour the tie-break.

**Complexity:** O(n + d log d) time and O(d) space, where d is the number of distinct values.`,
    starterCode: {
      python: PY_TOKENS + 'n, k = int(data[0]), int(data[1])\nnums = list(map(int, data[2:2 + n]))\n',
      javascript: JS_TOKENS + 'const n = Number(data[0]);\nconst k = Number(data[1]);\nconst nums = data.slice(2, 2 + n).map(Number);\n',
    },
    visibleTests: [
      { name: 'Example', input: '6 2\n1 1 1 2 2 3\n', expected: '1 2' },
      { name: 'Single value', input: '1 1\n1\n', expected: '1' },
    ],
    hiddenTests: [
      { name: 'Ties broken by smaller value', input: '6 2\n4 4 1 1 2 2\n', expected: '1 2' },
      { name: 'Negatives', input: '7 3\n-1 -1 5 5 3 3 3\n', expected: '3 -1 5' },
      { name: 'k equals distinct count', input: '5 3\n9 8 7 8 9\n', expected: '8 9 7' },
      topKBig,
    ],
    solutions: {
      python: String.raw`import sys
from collections import Counter

data = sys.stdin.read().split()
n, k = int(data[0]), int(data[1])
nums = list(map(int, data[2:2 + n]))
counts = Counter(nums)
ordered = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
print(" ".join(str(value) for value, _ in ordered[:k]))
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const n = Number(data[0]);
const k = Number(data[1]);
const counts = new Map();
for (let i = 2; i < 2 + n; i++) {
  const x = Number(data[i]);
  counts.set(x, (counts.get(x) || 0) + 1);
}
const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
console.log(ordered.slice(0, k).map((e) => e[0]).join(' '));
`,
    },
  },

  // ------------------------------------------------------------------- arrays
  {
    slug: 'maximum-subarray',
    title: 'Maximum subarray sum',
    type: 'coding',
    difficulty: 'medium',
    skills: ['arrays', 'dynamic-programming'],
    topics: ['arrays', 'kadane', 'dynamic-programming', 'prefix-sums'],
    prompt: `Find the largest possible sum of a **non-empty contiguous** subarray.

**Input:**
- line 1: an integer \`n\`
- line 2: \`n\` space-separated integers

**Output:** the maximum subarray sum.

**Example**

Input:
\`\`\`
9
-2 1 -3 4 -1 2 1 -5 4
\`\`\`
Output:
\`\`\`
6
\`\`\`
The subarray \`4 -1 2 1\` has sum 6.`,
    constraints: '1 ≤ n ≤ 10^4; -10^4 ≤ nums[i] ≤ 10^4',
    hints: [
      'Think about the best subarray that ends exactly at index i. How does it relate to the best one ending at i - 1?',
      'The best subarray ending at i either extends the best one ending at i - 1, or starts fresh at i. Pick whichever is larger.',
      'Keep cur = max(x, cur + x) and best = max(best, cur). Initialise both with the first element so an all-negative array works.',
    ],
    explanation: `**Kadane's algorithm.** Let \`cur\` be the best sum of a subarray that ends at the current position. For each new element \`x\`, either we extend the previous subarray (\`cur + x\`) or start a new one (\`x\`): \`cur = max(x, cur + x)\`. The answer is the largest \`cur\` seen.

Initialising with the first element (not 0) matters: if every number is negative, the answer is the largest single element, not 0.

An equivalent view uses prefix sums: the sum of \`nums[i..j]\` is \`P[j+1] - P[i]\`, so the answer is the maximum of \`P[j+1] - min(P[0..j])\`.

**Complexity:** O(n) time and O(1) extra space.`,
    starterCode: {
      python: PY_TOKENS + 'n = int(data[0])\nnums = list(map(int, data[1:1 + n]))\n',
      javascript: JS_TOKENS + 'const n = Number(data[0]);\nconst nums = data.slice(1, 1 + n).map(Number);\n',
    },
    visibleTests: [
      { name: 'Example', input: '9\n-2 1 -3 4 -1 2 1 -5 4\n', expected: '6' },
      { name: 'Single element', input: '1\n5\n', expected: '5' },
    ],
    hiddenTests: [
      { name: 'All negative', input: '3\n-3 -1 -2\n', expected: '-1' },
      { name: 'All positive', input: '4\n1 2 3 4\n', expected: '10' },
      { name: 'Single negative', input: '1\n-7\n', expected: '-7' },
      { name: 'Best is whole array despite dips', input: '5\n5 -1 -1 -1 5\n', expected: '7' },
      { name: 'Large input (n = 10000)', input: `10000\n${kadaneBig.join(' ')}\n`, expected: String(maxSubarrayByPrefix(kadaneBig)) },
    ],
    solutions: {
      python: String.raw`import sys

data = sys.stdin.read().split()
n = int(data[0])
nums = list(map(int, data[1:1 + n]))
cur = best = nums[0]
for x in nums[1:]:
    cur = max(x, cur + x)
    best = max(best, cur)
print(best)
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const n = Number(data[0]);
const nums = data.slice(1, 1 + n).map(Number);
let cur = nums[0];
let best = nums[0];
for (let i = 1; i < n; i++) {
  cur = Math.max(nums[i], cur + nums[i]);
  best = Math.max(best, cur);
}
console.log(best);
`,
    },
  },
  {
    slug: 'best-time-to-buy-sell-stock',
    title: 'Best time to buy and sell stock',
    type: 'coding',
    difficulty: 'easy',
    skills: ['arrays', 'greedy'],
    topics: ['arrays', 'greedy', 'running-minimum'],
    prompt: `You are given the price of a stock on each of \`n\` days. You may buy once and sell once, and the sale must happen on a **later** day than the purchase. Print the maximum profit you can make. If no profit is possible, print \`0\`.

**Input:**
- line 1: an integer \`n\`
- line 2: \`n\` space-separated prices

**Output:** the maximum profit.

**Example**

Input:
\`\`\`
6
7 1 5 3 6 4
\`\`\`
Output:
\`\`\`
5
\`\`\`
Buy at 1 (day 2) and sell at 6 (day 5).`,
    constraints: '1 ≤ n ≤ 10^5; 0 ≤ price ≤ 10^4',
    hints: [
      'If you sell on day j, which buying day is best?',
      'The best buying day for a sale on day j is the cheapest day before j. Track the minimum price seen so far.',
      'Scan once: profit = max(profit, price - minSoFar), then minSoFar = min(minSoFar, price). Start profit at 0.',
    ],
    explanation: `For a sale on day \`j\`, the best purchase is the minimum price on days before \`j\`. So one pass that keeps the running minimum and the best \`price - minimum\` finds the answer. Updating the profit before the minimum guarantees we never buy and sell on the same day for a gain (that would give 0 anyway).

**Complexity:** O(n) time and O(1) extra space. The brute force over all pairs is O(n^2).`,
    starterCode: {
      python: PY_TOKENS + 'n = int(data[0])\nprices = list(map(int, data[1:1 + n]))\n',
      javascript: JS_TOKENS + 'const n = Number(data[0]);\nconst prices = data.slice(1, 1 + n).map(Number);\n',
    },
    visibleTests: [
      { name: 'Example', input: '6\n7 1 5 3 6 4\n', expected: '5' },
      { name: 'Falling prices', input: '5\n7 6 4 3 1\n', expected: '0' },
    ],
    hiddenTests: [
      { name: 'Single day', input: '1\n5\n', expected: '0' },
      { name: 'Two rising days', input: '2\n1 2\n', expected: '1' },
      { name: 'Flat prices', input: '4\n3 3 3 3\n', expected: '0' },
      { name: 'Minimum after the maximum', input: '6\n2 9 1 4 8 3\n', expected: '7' },
      { name: 'Large input (n = 10000)', input: `10000\n${stockBig.join(' ')}\n`, expected: String(stockBySuffixMax(stockBig)) },
    ],
    solutions: {
      python: String.raw`import sys

data = sys.stdin.read().split()
n = int(data[0])
best = 0
low = None
for tok in data[1:1 + n]:
    p = int(tok)
    if low is not None and p - low > best:
        best = p - low
    if low is None or p < low:
        low = p
print(best)
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const n = Number(data[0]);
let best = 0;
let low = Infinity;
for (let i = 1; i <= n; i++) {
  const p = Number(data[i]);
  best = Math.max(best, p - low);
  low = Math.min(low, p);
}
console.log(best);
`,
    },
  },
  {
    slug: 'move-zeroes',
    title: 'Move zeroes',
    type: 'coding',
    difficulty: 'easy',
    skills: ['arrays', 'two-pointers'],
    topics: ['arrays', 'two-pointers', 'in-place'],
    prompt: `Move all zeros in the array to the end while keeping the **relative order** of the non-zero elements. Try to do it in place with O(1) extra space.

**Input:**
- line 1: an integer \`n\`
- line 2: \`n\` space-separated integers

**Output:** the rearranged array on one line, separated by spaces.

**Example**

Input:
\`\`\`
5
0 1 0 3 12
\`\`\`
Output:
\`\`\`
1 3 12 0 0
\`\`\``,
    constraints: '1 ≤ n ≤ 10^4; -10^9 ≤ nums[i] ≤ 10^9',
    hints: [
      'Imagine a "write" position that marks where the next non-zero element should go.',
      'Use two pointers: read scans every element, write only advances when a non-zero element is placed.',
      'For each read index, if nums[read] != 0, swap nums[read] and nums[write] and increment write. Zeros drift to the end and order is preserved.',
    ],
    explanation: `Keep a \`write\` index for the next slot that should hold a non-zero value. Scan with \`read\`; every non-zero value is swapped into \`nums[write]\` and \`write\` moves on. Because non-zeros are placed in the order they are read, their relative order is preserved, and everything from \`write\` onward ends up zero.

**Complexity:** O(n) time and O(1) extra space. Building a new list of non-zeros plus zeros is also O(n) but uses O(n) extra space.`,
    starterCode: {
      python: PY_TOKENS + 'n = int(data[0])\nnums = list(map(int, data[1:1 + n]))\n',
      javascript: JS_TOKENS + 'const n = Number(data[0]);\nconst nums = data.slice(1, 1 + n).map(Number);\n',
    },
    visibleTests: [
      { name: 'Example', input: '5\n0 1 0 3 12\n', expected: '1 3 12 0 0' },
      { name: 'Single zero', input: '1\n0\n', expected: '0' },
    ],
    hiddenTests: [
      { name: 'No zeros', input: '3\n1 2 3\n', expected: '1 2 3' },
      { name: 'All zeros', input: '3\n0 0 0\n', expected: '0 0 0' },
      { name: 'Negatives keep order', input: '6\n-1 0 0 -2 3 0\n', expected: '-1 -2 3 0 0 0' },
      { name: 'Large input (n = 10000)', input: `10000\n${zeroesBig.join(' ')}\n`, expected: zeroesBigExpected.join(' ') },
    ],
    solutions: {
      python: String.raw`import sys

data = sys.stdin.read().split()
n = int(data[0])
nums = list(map(int, data[1:1 + n]))
write = 0
for read in range(n):
    if nums[read] != 0:
        nums[write], nums[read] = nums[read], nums[write]
        write += 1
print(" ".join(map(str, nums)))
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const n = Number(data[0]);
const nums = data.slice(1, 1 + n).map(Number);
let write = 0;
for (let read = 0; read < n; read++) {
  if (nums[read] !== 0) {
    const tmp = nums[write];
    nums[write] = nums[read];
    nums[read] = tmp;
    write++;
  }
}
console.log(nums.join(' '));
`,
    },
  },
  {
    slug: 'merge-sorted-arrays',
    title: 'Merge two sorted arrays',
    type: 'coding',
    difficulty: 'easy',
    skills: ['two-pointers', 'arrays', 'sorting'],
    topics: ['two-pointers', 'merge', 'sorting'],
    prompt: `Given two arrays sorted in non-decreasing order, print a single sorted array containing all elements of both. Do it in linear time using the fact that both inputs are already sorted.

**Input:**
- line 1: two integers \`n m\`
- line 2: \`n\` sorted integers (this line is empty when \`n = 0\`)
- line 3: \`m\` sorted integers (this line is empty when \`m = 0\`)

**Output:** the \`n + m\` merged values on one line, separated by spaces.

**Example**

Input:
\`\`\`
3 3
1 2 3
2 5 6
\`\`\`
Output:
\`\`\`
1 2 2 3 5 6
\`\`\`

Tip: read all whitespace-separated tokens at once, so empty lines do not need special handling.`,
    constraints: '0 ≤ n, m ≤ 10^4; n + m ≥ 1; -10^9 ≤ values ≤ 10^9',
    hints: [
      'The smallest remaining element is always at the front of one of the two arrays.',
      'Keep one pointer into each array. Compare the two front elements and take the smaller one.',
      'While both pointers are in range, append the smaller of a[i] and b[j] and advance that pointer. Then append whatever remains of either array.',
    ],
    explanation: `This is the **merge** step of merge sort. Pointers \`i\` and \`j\` start at the front of each array. At each step, the smaller of \`a[i]\` and \`b[j]\` is the smallest value not yet output, so we append it and advance that pointer. When one array runs out, the rest of the other is already sorted and is appended as-is. Using \`<=\` when comparing keeps the merge stable.

**Complexity:** O(n + m) time and O(n + m) space for the output. Concatenating and sorting would be O((n + m) log(n + m)).`,
    starterCode: {
      python: PY_TOKENS + 'n, m = int(data[0]), int(data[1])\na = list(map(int, data[2:2 + n]))\nb = list(map(int, data[2 + n:2 + n + m]))\n',
      javascript: JS_TOKENS + 'const n = Number(data[0]);\nconst m = Number(data[1]);\nconst a = data.slice(2, 2 + n).map(Number);\nconst b = data.slice(2 + n, 2 + n + m).map(Number);\n',
    },
    visibleTests: [
      { name: 'Example', input: '3 3\n1 2 3\n2 5 6\n', expected: '1 2 2 3 5 6' },
      { name: 'First array empty', input: '0 3\n\n1 2 3\n', expected: '1 2 3' },
    ],
    hiddenTests: [
      { name: 'Second array empty', input: '2 0\n-5 4\n\n', expected: '-5 4' },
      { name: 'Duplicates and negatives', input: '4 3\n-3 -3 0 7\n-3 0 8\n', expected: '-3 -3 -3 0 0 7 8' },
      { name: 'All of one before the other', input: '2 2\n10 20\n1 2\n', expected: '1 2 10 20' },
      { name: 'Large input (9000 values)', input: `5000 4000\n${mergeA.join(' ')}\n${mergeB.join(' ')}\n`, expected: mergeExpected.join(' ') },
    ],
    solutions: {
      python: String.raw`import sys

data = sys.stdin.read().split()
n, m = int(data[0]), int(data[1])
a = list(map(int, data[2:2 + n]))
b = list(map(int, data[2 + n:2 + n + m]))
i = j = 0
out = []
while i < n and j < m:
    if a[i] <= b[j]:
        out.append(a[i])
        i += 1
    else:
        out.append(b[j])
        j += 1
out.extend(a[i:])
out.extend(b[j:])
print(" ".join(map(str, out)))
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const n = Number(data[0]);
const m = Number(data[1]);
const a = data.slice(2, 2 + n).map(Number);
const b = data.slice(2 + n, 2 + n + m).map(Number);
const out = [];
let i = 0;
let j = 0;
while (i < n && j < m) {
  if (a[i] <= b[j]) out.push(a[i++]);
  else out.push(b[j++]);
}
while (i < n) out.push(a[i++]);
while (j < m) out.push(b[j++]);
console.log(out.join(' '));
`,
    },
  },
  {
    slug: 'longest-substring-no-repeat',
    title: 'Longest substring without repeating characters',
    type: 'coding',
    difficulty: 'medium',
    skills: ['two-pointers', 'strings', 'hashing'],
    topics: ['sliding-window', 'strings', 'hashing'],
    prompt: `Print the length of the longest **substring** (contiguous block of characters) of \`s\` in which no character appears more than once.

**Input:** a single line containing \`s\`. It may be empty and contains no whitespace (letters, digits and symbols only).

**Output:** the length of the longest such substring.

**Example**

Input:
\`\`\`
abcabcbb
\`\`\`
Output:
\`\`\`
3
\`\`\`
\`abc\` is the longest substring without a repeat.`,
    constraints: '0 ≤ |s| ≤ 5 * 10^4; printable ASCII characters without spaces',
    hints: [
      'Checking every substring is O(n^2) or worse. Can you keep a window that is always valid and slide it?',
      'Grow the window by moving the right end. When the new character is already inside the window, move the left end past its previous occurrence.',
      'Store the last index of each character in a map. For each right index r with character c: if last[c] >= left, set left = last[c] + 1. Then last[c] = r and best = max(best, r - left + 1).',
    ],
    explanation: `Use a **sliding window** \`[left, r]\` that never contains a repeated character. For each new character \`c\` at index \`r\`, if \`c\` was last seen inside the window, jump \`left\` to one past that position. Record \`r\` as the new last position of \`c\` and update the best length.

The check \`last[c] >= left\` is essential: an old occurrence to the left of the window must not move \`left\` backwards (try \`abba\`).

**Complexity:** O(n) time, since each index is visited once by \`r\` and \`left\` only moves forward, and O(k) space for an alphabet of size k.`,
    starterCode: {
      python: 'import sys\n\ns = sys.stdin.readline().strip()\n',
      javascript: "const s = require('fs').readFileSync(0, 'utf8').split('\\n')[0].trim();\n",
    },
    visibleTests: [
      { name: 'Example', input: 'abcabcbb\n', expected: '3' },
      { name: 'One repeated letter', input: 'bbbbb\n', expected: '1' },
    ],
    hiddenTests: [
      { name: 'Answer in the middle', input: 'pwwkew\n', expected: '3' },
      { name: 'Empty string', input: '\n', expected: '0' },
      { name: 'Old occurrence outside the window', input: 'abba\n', expected: '2' },
      { name: 'Window restarts mid-way', input: 'dvdf\n', expected: '3' },
      { name: 'Whole alphabet repeated', input: `${LOWER.repeat(3)}\n`, expected: '26' },
      { name: 'Large input (n = 10000)', input: `${uniqueBig}\n`, expected: String(longestUniqueBrute(uniqueBig)) },
    ],
    solutions: {
      python: String.raw`import sys

s = sys.stdin.readline().strip()
last = {}
left = 0
best = 0
for r, c in enumerate(s):
    if c in last and last[c] >= left:
        left = last[c] + 1
    last[c] = r
    best = max(best, r - left + 1)
print(best)
`,
      javascript: String.raw`const s = require('fs').readFileSync(0, 'utf8').split('\n')[0].trim();
const last = new Map();
let left = 0;
let best = 0;
for (let r = 0; r < s.length; r++) {
  const c = s[r];
  if (last.has(c) && last.get(c) >= left) left = last.get(c) + 1;
  last.set(c, r);
  best = Math.max(best, r - left + 1);
}
console.log(best);
`,
    },
  },

  // ---------------------------------------------------------- stacks & queues
  {
    slug: 'valid-parentheses',
    title: 'Valid parentheses',
    type: 'coding',
    difficulty: 'easy',
    skills: ['stacks-queues', 'strings'],
    topics: ['stack', 'strings', 'parsing'],
    prompt: `A string of brackets is **valid** if every opening bracket is closed by the same type of bracket, and brackets close in the correct order (the most recently opened bracket closes first). Print \`true\` if the string is valid, otherwise \`false\`.

**Input:** a single line containing only the characters \`()[]{}\`.

**Output:** \`true\` or \`false\`.

**Example**

Input:
\`\`\`
([]){}
\`\`\`
Output:
\`\`\`
true
\`\`\``,
    constraints: '1 ≤ |s| ≤ 10^4',
    hints: [
      'When you meet a closing bracket, which opening bracket must it match?',
      'It must match the most recent unmatched opening bracket. Last in, first out: that is a stack.',
      'Push opening brackets. On a closing bracket, fail if the stack is empty or its top is not the matching opener; otherwise pop. At the end, the string is valid only if the stack is empty.',
    ],
    explanation: `Push every opening bracket onto a stack. A closing bracket must match the bracket on top of the stack (the most recently opened one that is still unmatched), so we pop and compare. The string is invalid if we try to pop from an empty stack, if the types differ, or if anything remains on the stack at the end.

**Complexity:** O(n) time and O(n) space in the worst case (all opening brackets).`,
    starterCode: {
      python: 'import sys\n\ns = sys.stdin.readline().strip()\n',
      javascript: "const s = require('fs').readFileSync(0, 'utf8').trim();\n",
    },
    visibleTests: [
      { name: 'Example', input: '([]){}\n', expected: 'true' },
      { name: 'Wrong type', input: '(]\n', expected: 'false' },
    ],
    hiddenTests: [
      { name: 'Interleaved', input: '([)]\n', expected: 'false' },
      { name: 'Nested', input: '{[]}\n', expected: 'true' },
      { name: 'Single opener', input: '(\n', expected: 'false' },
      { name: 'Closer first', input: ')(\n', expected: 'false' },
      { name: 'Unclosed at end', input: '(()\n', expected: 'false' },
      { name: 'Large valid input', input: `${parensBig}\n`, expected: 'true' },
      { name: 'Large input, last bracket wrong', input: `${parensBigBad}\n`, expected: 'false' },
    ],
    solutions: {
      python: String.raw`import sys

s = sys.stdin.readline().strip()
pairs = {")": "(", "]": "[", "}": "{"}
stack = []
ok = True
for ch in s:
    if ch in "([{":
        stack.append(ch)
    elif not stack or stack.pop() != pairs[ch]:
        ok = False
        break
print("true" if ok and not stack else "false")
`,
      javascript: String.raw`const s = require('fs').readFileSync(0, 'utf8').trim();
const pairs = { ')': '(', ']': '[', '}': '{' };
const stack = [];
let ok = true;
for (const ch of s) {
  if (ch === '(' || ch === '[' || ch === '{') stack.push(ch);
  else if (stack.length === 0 || stack.pop() !== pairs[ch]) { ok = false; break; }
}
console.log(ok && stack.length === 0 ? 'true' : 'false');
`,
    },
  },
  {
    slug: 'evaluate-rpn',
    title: 'Evaluate reverse Polish notation',
    type: 'coding',
    difficulty: 'medium',
    skills: ['stacks-queues'],
    topics: ['stack', 'parsing', 'expressions'],
    prompt: `Evaluate an arithmetic expression written in **reverse Polish notation** (postfix), where each operator follows its two operands. For example, \`2 1 + 3 *\` means \`(2 + 1) * 3\`.

The operators are \`+\`, \`-\`, \`*\` and \`/\`. Division between integers **truncates toward zero** (so \`-7 / 2 = -3\`). The expression is always valid and never divides by zero.

**Input:**
- line 1: the number of tokens \`n\`
- line 2: \`n\` space-separated tokens (integers or operators)

**Output:** the value of the expression.

**Example**

Input:
\`\`\`
5
4 13 5 / +
\`\`\`
Output:
\`\`\`
6
\`\`\`
\`13 / 5 = 2\`, then \`4 + 2 = 6\`.`,
    constraints: '1 ≤ n ≤ 10^4; every operand and intermediate result fits in a 32-bit signed integer',
    hints: [
      'When you read an operator, its two operands are the two most recent values that have not been used yet.',
      'Push numbers onto a stack. On an operator, pop two values, apply the operator, and push the result.',
      'Pop b first, then a, and compute a op b (order matters for - and /). For truncating division in Python, int(a / b) can lose precision on huge values; compute abs(a) // abs(b) and fix the sign.',
    ],
    explanation: `Postfix notation is designed for a stack: scan tokens left to right, push numbers, and for each operator pop the right operand \`b\` and then the left operand \`a\`, push \`a op b\`. At the end the stack holds exactly one value, the answer.

Watch two details. First, operand order: \`3 10 -\` is \`3 - 10 = -7\`. Second, Python's \`//\` rounds toward negative infinity (\`-7 // 2 == -4\`), but this problem truncates toward zero, so compute the quotient of absolute values and apply the sign. In JavaScript, \`Math.trunc(a / b)\` is exact for 32-bit values.

**Complexity:** O(n) time and O(n) space for the stack.`,
    starterCode: {
      python: PY_TOKENS + 'n = int(data[0])\ntokens = data[1:1 + n]\n',
      javascript: JS_TOKENS + 'const n = Number(data[0]);\nconst tokens = data.slice(1, 1 + n);\n',
    },
    visibleTests: [
      { name: 'Example', input: '5\n4 13 5 / +\n', expected: '6' },
      { name: 'Multiply a sum', input: '5\n2 1 + 3 *\n', expected: '9' },
    ],
    hiddenTests: [
      { name: 'Longer expression', input: '13\n10 6 9 3 + -11 * / * 17 + 5 +\n', expected: '22' },
      { name: 'Single number', input: '1\n42\n', expected: '42' },
      { name: 'Negative dividend truncates toward zero', input: '3\n-7 2 /\n', expected: '-3' },
      { name: 'Negative divisor truncates toward zero', input: '3\n7 -2 /\n', expected: '-3' },
      { name: 'Operand order for subtraction', input: '3\n3 10 -\n', expected: '-7' },
      rpnBig,
    ],
    solutions: {
      python: String.raw`import sys

data = sys.stdin.read().split()
n = int(data[0])
stack = []
for tok in data[1:1 + n]:
    if tok in ("+", "-", "*", "/"):
        b = stack.pop()
        a = stack.pop()
        if tok == "+":
            stack.append(a + b)
        elif tok == "-":
            stack.append(a - b)
        elif tok == "*":
            stack.append(a * b)
        else:
            q = abs(a) // abs(b)
            stack.append(q if (a >= 0) == (b > 0) else -q)
    else:
        stack.append(int(tok))
print(stack[-1])
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const n = Number(data[0]);
const stack = [];
for (let i = 1; i <= n; i++) {
  const tok = data[i];
  if (tok === '+' || tok === '-' || tok === '*' || tok === '/') {
    const b = stack.pop();
    const a = stack.pop();
    if (tok === '+') stack.push(a + b);
    else if (tok === '-') stack.push(a - b);
    else if (tok === '*') stack.push(a * b);
    else stack.push(Math.trunc(a / b));
  } else {
    stack.push(Number(tok));
  }
}
console.log(String(stack[stack.length - 1] + 0));
`,
    },
  },

  // ------------------------------------------------------------ binary search
  {
    slug: 'binary-search',
    title: 'Binary search',
    type: 'coding',
    difficulty: 'easy',
    skills: ['binary-search'],
    topics: ['binary-search', 'arrays'],
    prompt: `Given a sorted array of **distinct** integers and a \`target\`, print the index of \`target\` in the array, or \`-1\` if it is not present. Your solution should run in O(log n) time.

**Input:**
- line 1: an integer \`n\`
- line 2: \`n\` space-separated integers in strictly increasing order
- line 3: the integer \`target\`

**Output:** the 0-based index of \`target\`, or \`-1\`.

**Example**

Input:
\`\`\`
6
-1 0 3 5 9 12
9
\`\`\`
Output:
\`\`\`
4
\`\`\``,
    constraints: '1 ≤ n ≤ 10^4; -10^9 ≤ nums[i], target ≤ 10^9; values are strictly increasing',
    hints: [
      'Compare the target with the middle element. What does that tell you about the half you can ignore?',
      'Keep a search range [lo, hi]. If nums[mid] < target the answer must be right of mid; if greater, left of mid.',
      'Loop while lo <= hi: mid = (lo + hi) // 2; return mid on a match, else set lo = mid + 1 or hi = mid - 1. If the loop ends, print -1.',
    ],
    explanation: `Binary search keeps the invariant "if \`target\` is present, its index is in \`[lo, hi]\`". Comparing with \`nums[mid]\` discards half of the remaining range each step, so at most about log2(n) + 1 comparisons are needed. When \`lo > hi\` the range is empty and the target is absent.

Off-by-one errors are the usual bug: with an inclusive range use \`while lo <= hi\` and move to \`mid + 1\` / \`mid - 1\`, so the range always shrinks.

**Complexity:** O(log n) time and O(1) extra space (reading the input is O(n)).`,
    starterCode: {
      python: PY_TOKENS + 'n = int(data[0])\nnums = list(map(int, data[1:1 + n]))\ntarget = int(data[1 + n])\n',
      javascript: JS_TOKENS + 'const n = Number(data[0]);\nconst nums = data.slice(1, 1 + n).map(Number);\nconst target = Number(data[1 + n]);\n',
    },
    visibleTests: [
      { name: 'Example', input: '6\n-1 0 3 5 9 12\n9\n', expected: '4' },
      { name: 'Not present', input: '6\n-1 0 3 5 9 12\n2\n', expected: '-1' },
    ],
    hiddenTests: [
      { name: 'Single element found', input: '1\n5\n5\n', expected: '0' },
      { name: 'Single element missing', input: '1\n5\n-5\n', expected: '-1' },
      { name: 'Smaller than all', input: '4\n1 3 5 7\n0\n', expected: '-1' },
      { name: 'Larger than all', input: '4\n1 3 5 7\n8\n', expected: '-1' },
      { name: 'First and last positions', input: '5\n-9 -4 0 2 10\n10\n', expected: '4' },
      { name: 'Large input, present', input: `10000\n${bsBig.join(' ')}\n${bsBig[7321]}\n`, expected: '7321' },
      { name: 'Large input, absent', input: `10000\n${bsBig.join(' ')}\n${bsBig[7321] + 1}\n`, expected: '-1' },
    ],
    solutions: {
      python: String.raw`import sys

data = sys.stdin.read().split()
n = int(data[0])
nums = list(map(int, data[1:1 + n]))
target = int(data[1 + n])
lo, hi = 0, n - 1
answer = -1
while lo <= hi:
    mid = (lo + hi) // 2
    if nums[mid] == target:
        answer = mid
        break
    if nums[mid] < target:
        lo = mid + 1
    else:
        hi = mid - 1
print(answer)
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const n = Number(data[0]);
const nums = data.slice(1, 1 + n).map(Number);
const target = Number(data[1 + n]);
let lo = 0;
let hi = n - 1;
let answer = -1;
while (lo <= hi) {
  const mid = (lo + hi) >> 1;
  if (nums[mid] === target) { answer = mid; break; }
  if (nums[mid] < target) lo = mid + 1;
  else hi = mid - 1;
}
console.log(answer);
`,
    },
  },
  {
    slug: 'integer-square-root',
    title: 'Integer square root',
    type: 'coding',
    difficulty: 'easy',
    skills: ['binary-search'],
    topics: ['binary-search', 'search-on-answer', 'math'],
    prompt: `Given a non-negative integer \`x\`, print the largest integer \`r\` such that \`r * r <= x\` (that is, the square root of \`x\` rounded down). Do not use a built-in square root function; search for the answer instead.

**Input:** a single integer \`x\`.

**Output:** the integer square root of \`x\`.

**Example**

Input:
\`\`\`
8
\`\`\`
Output:
\`\`\`
2
\`\`\`
The true square root is about 2.83, which rounds down to 2.`,
    constraints: '0 ≤ x ≤ 10^12',
    hints: [
      'The condition "r * r <= x" is true for small r and false for large r. Where have you seen a true-then-false pattern?',
      'Binary search on r over the range [0, x] (or [0, 10^6] given the constraints), looking for the last r where r * r <= x.',
      'Use lo = 0, hi = min(x, 10^6). While lo < hi: mid = (lo + hi + 1) // 2; if mid * mid <= x then lo = mid else hi = mid - 1. Print lo. The +1 avoids an infinite loop.',
    ],
    explanation: `This is **binary search on the answer**. The predicate \`ok(r) = r * r <= x\` is monotonic: once it becomes false it stays false. We look for the last \`r\` where it is true. With \`lo\` always satisfying the predicate and \`hi\` an upper bound, choose the upper middle \`mid = (lo + hi + 1) // 2\` so that \`lo = mid\` always makes progress.

The same pattern solves "first bad version", "minimum capacity to ship packages in D days" and many other problems: define a monotonic yes/no question about a candidate answer, then binary search for the boundary.

**Complexity:** O(log x) time and O(1) space. Since x ≤ 10^12, at most about 20 iterations are needed with hi = 10^6.`,
    starterCode: {
      python: 'x = int(input())\n',
      javascript: "const x = Number(require('fs').readFileSync(0, 'utf8').trim());\n",
    },
    visibleTests: [
      { name: 'Example', input: '8\n', expected: '2' },
      { name: 'Perfect square', input: '16\n', expected: '4' },
    ],
    hiddenTests: [
      { name: 'Zero', input: '0\n', expected: '0' },
      { name: 'One', input: '1\n', expected: '1' },
      { name: 'Two', input: '2\n', expected: '1' },
      { name: 'Just below a square', input: '2147395599\n', expected: '46339' },
      { name: 'Maximum value', input: '1000000000000\n', expected: '1000000' },
      { name: 'One below maximum', input: '999999999999\n', expected: '999999' },
    ],
    solutions: {
      python: String.raw`x = int(input())
lo, hi = 0, min(x, 10**6)
while lo < hi:
    mid = (lo + hi + 1) // 2
    if mid * mid <= x:
        lo = mid
    else:
        hi = mid - 1
print(lo)
`,
      javascript: String.raw`const x = Number(require('fs').readFileSync(0, 'utf8').trim());
let lo = 0;
let hi = Math.min(x, 1000000);
while (lo < hi) {
  const mid = Math.floor((lo + hi + 1) / 2);
  if (mid * mid <= x) lo = mid;
  else hi = mid - 1;
}
console.log(lo);
`,
    },
  },

  // ------------------------------------------------------------- linked lists
  {
    slug: 'reverse-linked-list',
    title: 'Reverse a linked list',
    type: 'coding',
    difficulty: 'easy',
    skills: ['linked-lists'],
    topics: ['linked-list', 'pointers'],
    prompt: `The values of a singly linked list are given in order from head to tail. Build the linked list, **reverse it by re-linking its nodes** (do not just reverse the input array), and print the values of the reversed list from its new head.

**Input:**
- line 1: the number of nodes \`n\`
- line 2: \`n\` space-separated values (empty when \`n = 0\`)

**Output:** the reversed values on one line, separated by spaces. If the list is empty, print an empty line.

**Example**

Input:
\`\`\`
5
1 2 3 4 5
\`\`\`
Output:
\`\`\`
5 4 3 2 1
\`\`\``,
    constraints: '0 ≤ n ≤ 10^4; -10^9 ≤ value ≤ 10^9',
    hints: [
      'Each node has a next pointer. After reversal, each node should point to the node that used to come before it.',
      'Walk the list with two references: prev (initially None/null) and cur (initially head).',
      'In a loop: save nxt = cur.next, set cur.next = prev, then move prev = cur and cur = nxt. When cur is None, prev is the new head.',
    ],
    explanation: `The iterative reversal keeps three references: \`prev\` (the already reversed part), \`cur\` (the node being processed) and \`nxt\` (saved before we overwrite \`cur.next\`). Each step points \`cur\` back at \`prev\` and advances. When \`cur\` becomes null, \`prev\` is the new head.

Saving \`nxt\` first is the critical detail: once \`cur.next\` is overwritten, the rest of the list would be lost.

A recursive version also works, but it uses O(n) call-stack space and can hit Python's default recursion limit (about 1000) on long lists.

**Complexity:** O(n) time and O(1) extra space (beyond the nodes themselves).`,
    starterCode: {
      python: PY_TOKENS + '\nclass Node:\n    def __init__(self, val, next=None):\n        self.val = val\n        self.next = next\n\nn = int(data[0])\nvalues = list(map(int, data[1:1 + n]))\n# build the list, reverse it, print it\n',
      javascript: JS_TOKENS + '\nclass Node {\n  constructor(val, next = null) {\n    this.val = val;\n    this.next = next;\n  }\n}\n\nconst n = Number(data[0]);\nconst values = data.slice(1, 1 + n).map(Number);\n// build the list, reverse it, print it\n',
    },
    visibleTests: [
      { name: 'Example', input: '5\n1 2 3 4 5\n', expected: '5 4 3 2 1' },
      { name: 'Two nodes', input: '2\n1 2\n', expected: '2 1' },
    ],
    hiddenTests: [
      { name: 'Empty list', input: '0\n\n', expected: '' },
      { name: 'Single node', input: '1\n7\n', expected: '7' },
      { name: 'Duplicates and negatives', input: '6\n3 -1 3 0 -1 9\n', expected: '9 -1 0 3 -1 3' },
      { name: 'Large list (n = 10000)', input: `10000\n${listBig.join(' ')}\n`, expected: listBig.slice().reverse().join(' ') },
    ],
    solutions: {
      python: String.raw`import sys


class Node:
    def __init__(self, val, next=None):
        self.val = val
        self.next = next


data = sys.stdin.read().split()
n = int(data[0])
head = None
for tok in reversed(data[1:1 + n]):
    head = Node(int(tok), head)

prev, cur = None, head
while cur:
    nxt = cur.next
    cur.next = prev
    prev, cur = cur, nxt

out = []
node = prev
while node:
    out.append(str(node.val))
    node = node.next
print(" ".join(out))
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
class Node {
  constructor(val, next = null) {
    this.val = val;
    this.next = next;
  }
}
const n = Number(data[0]);
let head = null;
for (let i = n; i >= 1; i--) head = new Node(Number(data[i]), head);

let prev = null;
let cur = head;
while (cur) {
  const nxt = cur.next;
  cur.next = prev;
  prev = cur;
  cur = nxt;
}

const out = [];
for (let node = prev; node; node = node.next) out.push(node.val);
console.log(out.join(' '));
`,
    },
  },

  // ------------------------------------------------------------------ sorting
  {
    slug: 'merge-intervals',
    title: 'Merge intervals',
    type: 'coding',
    difficulty: 'medium',
    skills: ['sorting', 'arrays'],
    topics: ['sorting', 'intervals', 'greedy'],
    prompt: `Given a list of closed intervals \`[start, end]\`, merge all overlapping intervals and print the result sorted by start. Intervals that **touch** (one ends exactly where the next starts, such as \`[1, 4]\` and \`[4, 5]\`) count as overlapping and must be merged.

**Input:**
- line 1: the number of intervals \`n\`
- next \`n\` lines: two integers \`start end\` with \`start ≤ end\` (in any order)

**Output:** one merged interval per line as \`start end\`, in increasing order of start.

**Example**

Input:
\`\`\`
4
1 3
2 6
8 10
15 18
\`\`\`
Output:
\`\`\`
1 6
8 10
15 18
\`\`\``,
    constraints: '1 ≤ n ≤ 10^4; -10^9 ≤ start ≤ end ≤ 10^9',
    hints: [
      'If the intervals were sorted by start, where could an interval overlap with the ones before it?',
      'After sorting by start, an interval can only overlap with the most recently merged interval.',
      'Sort by start. Keep a list of merged intervals; for each interval, if its start <= the last merged end, extend that end to max(end, last end); otherwise append it as a new interval.',
    ],
    explanation: `Sort intervals by their start. Then sweep: if the current interval starts at or before the end of the last merged interval, they overlap (or touch), so extend the last merged end to \`max(lastEnd, end)\`. Otherwise the current interval begins a new merged block. Taking the max matters when one interval contains another, such as \`[1, 10]\` and \`[2, 3]\`.

**Complexity:** O(n log n) time for the sort plus O(n) for the sweep, and O(n) space for the output.`,
    starterCode: {
      python: PY_TOKENS + 'n = int(data[0])\nintervals = [(int(data[1 + 2 * i]), int(data[2 + 2 * i])) for i in range(n)]\n',
      javascript: JS_TOKENS + 'const n = Number(data[0]);\nconst intervals = [];\nfor (let i = 0; i < n; i++) intervals.push([Number(data[1 + 2 * i]), Number(data[2 + 2 * i])]);\n',
    },
    visibleTests: [
      { name: 'Example', input: '4\n1 3\n2 6\n8 10\n15 18\n', expected: '1 6\n8 10\n15 18' },
      { name: 'Touching intervals merge', input: '2\n1 4\n4 5\n', expected: '1 5' },
    ],
    hiddenTests: [
      { name: 'Unsorted input', input: '3\n8 10\n1 3\n2 6\n', expected: '1 6\n8 10' },
      { name: 'Single interval', input: '1\n5 5\n', expected: '5 5' },
      { name: 'Containment', input: '3\n1 10\n2 3\n4 5\n', expected: '1 10' },
      { name: 'Adjacent but not touching', input: '2\n1 3\n4 5\n', expected: '1 3\n4 5' },
      { name: 'Negatives', input: '3\n-5 -2\n-3 0\n2 4\n', expected: '-5 0\n2 4' },
      intervalsBig,
    ],
    solutions: {
      python: String.raw`import sys

data = sys.stdin.read().split()
n = int(data[0])
intervals = sorted((int(data[1 + 2 * i]), int(data[2 + 2 * i])) for i in range(n))
merged = []
for s, e in intervals:
    if merged and s <= merged[-1][1]:
        if e > merged[-1][1]:
            merged[-1][1] = e
    else:
        merged.append([s, e])
print("\n".join(f"{s} {e}" for s, e in merged))
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const n = Number(data[0]);
const intervals = [];
for (let i = 0; i < n; i++) intervals.push([Number(data[1 + 2 * i]), Number(data[2 + 2 * i])]);
intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
const merged = [];
for (const [s, e] of intervals) {
  const last = merged[merged.length - 1];
  if (last && s <= last[1]) last[1] = Math.max(last[1], e);
  else merged.push([s, e]);
}
console.log(merged.map((p) => p[0] + ' ' + p[1]).join('\n'));
`,
    },
  },
  {
    slug: 'kth-largest',
    title: 'Kth largest element',
    type: 'coding',
    difficulty: 'medium',
    skills: ['heaps', 'sorting'],
    topics: ['heap', 'priority-queue', 'selection', 'sorting'],
    prompt: `Print the \`k\`-th largest element of the array. This is the \`k\`-th element in **sorted descending order**, counting duplicates (so in \`7 7 5\` the 2nd largest is 7).

**Input:**
- line 1: two integers \`n k\`
- line 2: \`n\` space-separated integers

**Output:** the \`k\`-th largest value.

**Example**

Input:
\`\`\`
6 2
3 2 1 5 6 4
\`\`\`
Output:
\`\`\`
5
\`\`\``,
    constraints: '1 ≤ k ≤ n ≤ 10^5; -10^9 ≤ nums[i] ≤ 10^9',
    hints: [
      'Sorting works in O(n log n). Can you avoid keeping more than k elements around?',
      'Keep the k largest values seen so far in a min-heap. Its smallest element (the root) is the current k-th largest.',
      'Push each value; whenever the heap holds more than k values, pop the smallest. After processing all values, the root is the answer.',
    ],
    explanation: `Maintain a **min-heap of size k** holding the k largest values seen so far. Each new value is pushed; if the heap grows beyond k, the smallest is popped because it cannot be among the top k. At the end the heap's minimum is the k-th largest.

Alternatives: sort descending and index \`k - 1\` (O(n log n)), or quickselect (average O(n), worst case O(n^2) without careful pivots).

**Complexity:** O(n log k) time and O(k) extra space with the heap.`,
    starterCode: {
      python: PY_TOKENS + 'import heapq\n\nn, k = int(data[0]), int(data[1])\nnums = list(map(int, data[2:2 + n]))\n',
      javascript: JS_TOKENS + 'const n = Number(data[0]);\nconst k = Number(data[1]);\nconst nums = data.slice(2, 2 + n).map(Number);\n// JavaScript has no built-in heap: write a small min-heap or start with sorting.\n',
    },
    visibleTests: [
      { name: 'Example', input: '6 2\n3 2 1 5 6 4\n', expected: '5' },
      { name: 'Duplicates count', input: '9 4\n3 2 3 1 2 4 5 5 6\n', expected: '4' },
    ],
    hiddenTests: [
      { name: 'k = 1 is the maximum', input: '5 1\n-1 -5 -3 -4 -2\n', expected: '-1' },
      { name: 'k = n is the minimum', input: '5 5\n10 40 30 20 50\n', expected: '10' },
      { name: 'All equal', input: '4 2\n7 7 7 7\n', expected: '7' },
      { name: 'Single element', input: '1 1\n-9\n', expected: '-9' },
      kthBig,
    ],
    solutions: {
      python: String.raw`import heapq
import sys

data = sys.stdin.read().split()
n, k = int(data[0]), int(data[1])
heap = []
for tok in data[2:2 + n]:
    x = int(tok)
    if len(heap) < k:
        heapq.heappush(heap, x)
    elif x > heap[0]:
        heapq.heapreplace(heap, x)
print(heap[0])
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const n = Number(data[0]);
const k = Number(data[1]);

// Minimal binary min-heap stored in an array.
const heap = [];
function push(x) {
  heap.push(x);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap[p] <= heap[i]) break;
    [heap[p], heap[i]] = [heap[i], heap[p]];
    i = p;
  }
}
function replaceTop(x) {
  heap[0] = x;
  let i = 0;
  for (;;) {
    const l = 2 * i + 1;
    const r = l + 1;
    let m = i;
    if (l < heap.length && heap[l] < heap[m]) m = l;
    if (r < heap.length && heap[r] < heap[m]) m = r;
    if (m === i) break;
    [heap[m], heap[i]] = [heap[i], heap[m]];
    i = m;
  }
}

for (let i = 2; i < 2 + n; i++) {
  const x = Number(data[i]);
  if (heap.length < k) push(x);
  else if (x > heap[0]) replaceTop(x);
}
console.log(heap[0]);
`,
    },
  },

  // ------------------------------------------------------------------- graphs
  {
    slug: 'number-of-islands',
    title: 'Number of islands',
    type: 'coding',
    difficulty: 'medium',
    skills: ['graphs'],
    topics: ['graphs', 'grid', 'bfs', 'dfs', 'connected-components'],
    prompt: `A grid map contains land (\`1\`) and water (\`0\`). An **island** is a group of land cells connected **horizontally or vertically** (not diagonally). Print the number of islands.

**Input:**
- line 1: two integers \`r c\` (rows and columns)
- next \`r\` lines: each a string of \`c\` characters, each \`0\` or \`1\`

**Output:** the number of islands.

**Example**

Input:
\`\`\`
4 5
11000
11000
00100
00011
\`\`\`
Output:
\`\`\`
3
\`\`\``,
    constraints: '1 ≤ r, c ≤ 300',
    hints: [
      'Think of each land cell as a node connected to its land neighbours. What are you counting?',
      'You are counting connected components. Each time you find unvisited land, you have found a new island; explore all of it so you never count it again.',
      'Loop over every cell. On unvisited land, increment the count and run BFS or an iterative DFS that marks every reachable land cell as visited (for example by setting it to 0). Avoid deep recursion on large grids.',
    ],
    explanation: `Treat the grid as a graph whose nodes are land cells and whose edges join up/down/left/right neighbours. The answer is the number of connected components. Scan every cell; when you meet land that has not been visited, count a new island and flood-fill it with BFS (a queue) or DFS (an explicit stack), marking cells as visited when they are first discovered.

Recursive DFS is the shortest to write, but on a 300 x 300 grid of land the recursion depth can reach 90,000 and overflow Python's stack, so an explicit queue or stack is safer.

**Complexity:** O(r * c) time, since each cell is visited a constant number of times, and O(r * c) space in the worst case for the queue and visited marks.`,
    starterCode: {
      python: PY_TOKENS + 'r, c = int(data[0]), int(data[1])\ngrid = [list(row) for row in data[2:2 + r]]\n',
      javascript: JS_TOKENS + 'const r = Number(data[0]);\nconst c = Number(data[1]);\nconst grid = data.slice(2, 2 + r).map((row) => row.split(\'\'));\n',
    },
    visibleTests: [
      { name: 'Example', input: '4 5\n11000\n11000\n00100\n00011\n', expected: '3' },
      { name: 'One big island', input: '4 5\n11110\n11010\n11000\n00000\n', expected: '1' },
    ],
    hiddenTests: [
      { name: 'Single water cell', input: '1 1\n0\n', expected: '0' },
      { name: 'Single land cell', input: '1 1\n1\n', expected: '1' },
      { name: 'Diagonals do not connect', input: '3 3\n101\n010\n101\n', expected: '5' },
      { name: 'Ring around a lake', input: '3 3\n111\n101\n111\n', expected: '1' },
      { name: 'Single row', input: '1 7\n1011001\n', expected: '3' },
      islandsBig,
    ],
    solutions: {
      python: String.raw`import sys
from collections import deque

data = sys.stdin.read().split()
r, c = int(data[0]), int(data[1])
grid = [list(row) for row in data[2:2 + r]]
count = 0
for i in range(r):
    for j in range(c):
        if grid[i][j] != "1":
            continue
        count += 1
        grid[i][j] = "0"
        q = deque([(i, j)])
        while q:
            x, y = q.popleft()
            for a, b in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= a < r and 0 <= b < c and grid[a][b] == "1":
                    grid[a][b] = "0"
                    q.append((a, b))
print(count)
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const r = Number(data[0]);
const c = Number(data[1]);
const grid = data.slice(2, 2 + r).map((row) => row.split(''));
let count = 0;
const stack = [];
for (let i = 0; i < r; i++) {
  for (let j = 0; j < c; j++) {
    if (grid[i][j] !== '1') continue;
    count++;
    grid[i][j] = '0';
    stack.push([i, j]);
    while (stack.length) {
      const [x, y] = stack.pop();
      for (const [a, b] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (a >= 0 && a < r && b >= 0 && b < c && grid[a][b] === '1') {
          grid[a][b] = '0';
          stack.push([a, b]);
        }
      }
    }
  }
}
console.log(count);
`,
    },
  },
  {
    slug: 'grid-shortest-path',
    title: 'Shortest path in a grid',
    type: 'coding',
    difficulty: 'medium',
    skills: ['graphs', 'shortest-paths'],
    topics: ['graphs', 'bfs', 'grid', 'shortest-path'],
    prompt: `A grid contains open cells (\`.\`) and walls (\`#\`). Starting at the top-left cell, you may move one step up, down, left or right into an open cell. Print the **minimum number of steps** needed to reach the bottom-right cell, or \`-1\` if it cannot be reached (including when the start or the target is a wall).

**Input:**
- line 1: two integers \`r c\`
- next \`r\` lines: each a string of \`c\` characters, \`.\` or \`#\`

**Output:** the minimum number of steps, or \`-1\`.

**Example**

Input:
\`\`\`
3 3
...
.#.
...
\`\`\`
Output:
\`\`\`
4
\`\`\``,
    constraints: '1 ≤ r, c ≤ 300',
    hints: [
      'Every move costs the same (one step). Which graph search visits nodes in order of their distance from the start?',
      'Breadth-first search explores all cells at distance d before any cell at distance d + 1, so the first time it reaches the target is via a shortest path.',
      'Use a queue starting at (0, 0) with distance 0 and a dist grid initialised to -1. Pop a cell, and for each open, unvisited neighbour set dist = dist + 1 and enqueue it. Print dist of the bottom-right cell.',
    ],
    explanation: `In an **unweighted** graph, breadth-first search finds shortest paths: it processes cells in layers of increasing distance, so the first time a cell is discovered its distance is minimal. Mark a cell visited when you **enqueue** it (not when you dequeue it), otherwise the same cell can be added many times.

Handle the edge cases explicitly: if the start or target is a wall the answer is \`-1\`, and a 1 x 1 open grid needs 0 steps. For weighted edges you would need Dijkstra's algorithm instead.

**Complexity:** O(r * c) time and space.`,
    starterCode: {
      python: PY_TOKENS + 'from collections import deque\n\nr, c = int(data[0]), int(data[1])\ngrid = data[2:2 + r]\n',
      javascript: JS_TOKENS + 'const r = Number(data[0]);\nconst c = Number(data[1]);\nconst grid = data.slice(2, 2 + r);\n',
    },
    visibleTests: [
      { name: 'Example', input: '3 3\n...\n.#.\n...\n', expected: '4' },
      { name: 'Blocked', input: '2 2\n.#\n#.\n', expected: '-1' },
    ],
    hiddenTests: [
      { name: 'Single open cell', input: '1 1\n.\n', expected: '0' },
      { name: 'Start is a wall', input: '2 2\n#.\n..\n', expected: '-1' },
      { name: 'Target is a wall', input: '2 2\n..\n.#\n', expected: '-1' },
      { name: 'Winding corridor', input: '5 5\n.....\n####.\n.....\n.####\n.....\n', expected: '16' },
      { name: 'Single row', input: '1 6\n......\n', expected: '5' },
      gridTest('Large grid (100 x 100, 25% walls)', 100, 100, 25, 161),
      gridTest('Large grid (100 x 100, 30% walls)', 100, 100, 30, 162),
    ],
    solutions: {
      python: String.raw`import sys
from collections import deque

data = sys.stdin.read().split()
r, c = int(data[0]), int(data[1])
grid = data[2:2 + r]
if grid[0][0] == "#" or grid[r - 1][c - 1] == "#":
    print(-1)
else:
    dist = [[-1] * c for _ in range(r)]
    dist[0][0] = 0
    q = deque([(0, 0)])
    while q:
        x, y = q.popleft()
        if x == r - 1 and y == c - 1:
            break
        for a, b in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= a < r and 0 <= b < c and grid[a][b] == "." and dist[a][b] == -1:
                dist[a][b] = dist[x][y] + 1
                q.append((a, b))
    print(dist[r - 1][c - 1])
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const r = Number(data[0]);
const c = Number(data[1]);
const grid = data.slice(2, 2 + r);
if (grid[0][0] === '#' || grid[r - 1][c - 1] === '#') {
  console.log(-1);
} else {
  const dist = Array.from({ length: r }, () => new Array(c).fill(-1));
  dist[0][0] = 0;
  const qx = [0];
  const qy = [0];
  for (let head = 0; head < qx.length; head++) {
    const x = qx[head];
    const y = qy[head];
    const moves = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [a, b] of moves) {
      if (a >= 0 && a < r && b >= 0 && b < c && grid[a][b] === '.' && dist[a][b] === -1) {
        dist[a][b] = dist[x][y] + 1;
        qx.push(a);
        qy.push(b);
      }
    }
  }
  console.log(dist[r - 1][c - 1]);
}
`,
    },
  },

  // ------------------------------------------------------ dynamic programming
  {
    slug: 'climbing-stairs',
    title: 'Climbing stairs',
    type: 'coding',
    difficulty: 'easy',
    skills: ['dynamic-programming', 'recursion'],
    topics: ['dynamic-programming', 'recursion', 'memoization', 'fibonacci'],
    prompt: `You are climbing a staircase with \`n\` steps. Each move climbs either **1 or 2** steps. In how many distinct ways can you reach the top? (Different orders count as different ways: \`1+2\` and \`2+1\` are two ways.)

**Input:** a single integer \`n\`.

**Output:** the number of distinct ways.

**Example**

Input:
\`\`\`
3
\`\`\`
Output:
\`\`\`
3
\`\`\`
The ways are \`1+1+1\`, \`1+2\` and \`2+1\`.`,
    constraints: '1 ≤ n ≤ 70 (the answer fits in a 64-bit integer and is exact in a JavaScript number)',
    hints: [
      'Think about the very last move. Where could you have been just before reaching step n?',
      'You arrived from step n - 1 (a 1-step move) or from step n - 2 (a 2-step move), so ways(n) = ways(n - 1) + ways(n - 2).',
      'Plain recursion repeats work exponentially. Iterate from the bottom keeping only the last two values: a, b = 1, 1; repeat n times: a, b = b, a + b; print a.',
    ],
    explanation: `The last move is either a 1-step from \`n - 1\` or a 2-step from \`n - 2\`, and those two groups of paths do not overlap, so \`ways(n) = ways(n - 1) + ways(n - 2)\` with \`ways(0) = ways(1) = 1\`. These are the Fibonacci numbers shifted by one.

The naive recursion recomputes the same subproblems and takes about O(1.6^n) time. Memoization (\`functools.cache\`) or bottom-up iteration computes each value once.

**Complexity:** O(n) time and O(1) space with the two-variable loop.`,
    starterCode: {
      python: 'n = int(input())\n',
      javascript: "const n = Number(require('fs').readFileSync(0, 'utf8').trim());\n",
    },
    visibleTests: [
      { name: 'Example', input: '3\n', expected: '3' },
      { name: 'Two steps', input: '2\n', expected: '2' },
    ],
    hiddenTests: [
      { name: 'One step', input: '1\n', expected: '1' },
      { name: 'Ten steps', input: '10\n', expected: '89' },
      { name: 'Forty-five steps', input: '45\n', expected: '1836311903' },
      { name: 'Maximum n', input: '70\n', expected: '308061521170129' },
    ],
    solutions: {
      python: String.raw`n = int(input())
a, b = 1, 1
for _ in range(n):
    a, b = b, a + b
print(a)
`,
      javascript: String.raw`const n = Number(require('fs').readFileSync(0, 'utf8').trim());
let a = 1;
let b = 1;
for (let i = 0; i < n; i++) {
  const next = a + b;
  a = b;
  b = next;
}
console.log(String(a));
`,
    },
  },
  {
    slug: 'coin-change',
    title: 'Coin change (minimum coins)',
    type: 'coding',
    difficulty: 'medium',
    skills: ['dynamic-programming'],
    topics: ['dynamic-programming', 'unbounded-knapsack'],
    prompt: `You have an unlimited supply of coins of each given denomination. Print the **fewest coins** needed to make exactly \`amount\`, or \`-1\` if it is impossible. Making an amount of 0 needs 0 coins.

**Input:**
- line 1: two integers \`n amount\` (number of denominations and the target amount)
- line 2: \`n\` distinct positive coin values

**Output:** the minimum number of coins, or \`-1\`.

**Example**

Input:
\`\`\`
3 11
1 2 5
\`\`\`
Output:
\`\`\`
3
\`\`\`
\`11 = 5 + 5 + 1\`.`,
    constraints: '1 ≤ n ≤ 12; 1 ≤ coin ≤ 2^31 - 1; 0 ≤ amount ≤ 10^4',
    hints: [
      'Greedy (always take the largest coin) fails for coins like 1, 3, 4 and amount 6. What smaller questions would let you build the answer?',
      'Let best[a] be the fewest coins for amount a. If the last coin used is c, then best[a] = best[a - c] + 1.',
      'best[0] = 0 and every other entry starts at infinity. For a from 1 to amount, for each coin c <= a, best[a] = min(best[a], best[a - c] + 1). Print best[amount] or -1 if it is still infinity.',
    ],
    explanation: `Define \`best[a]\` as the minimum number of coins summing to \`a\`. Any optimal way to make \`a\` ends with some coin \`c\`, and the rest must be an optimal way to make \`a - c\`, so \`best[a] = 1 + min over coins c <= a of best[a - c]\`. Filling the table from 0 upward guarantees every subproblem is ready when needed. Amounts that cannot be made stay at infinity and are reported as \`-1\`.

Greedy is not correct in general: for coins \`1 3 4\` and amount 6, greedy takes \`4 + 1 + 1\` (3 coins) but \`3 + 3\` uses 2.

**Complexity:** O(amount * n) time and O(amount) space.`,
    starterCode: {
      python: PY_TOKENS + 'n, amount = int(data[0]), int(data[1])\ncoins = list(map(int, data[2:2 + n]))\n',
      javascript: JS_TOKENS + 'const n = Number(data[0]);\nconst amount = Number(data[1]);\nconst coins = data.slice(2, 2 + n).map(Number);\n',
    },
    visibleTests: [
      { name: 'Example', input: '3 11\n1 2 5\n', expected: '3' },
      { name: 'Impossible', input: '1 3\n2\n', expected: '-1' },
    ],
    hiddenTests: [
      { name: 'Zero amount', input: '1 0\n1\n', expected: '0' },
      { name: 'Greedy fails', input: '3 6\n1 3 4\n', expected: '2' },
      { name: 'Coin larger than amount', input: '2 7\n100 7\n', expected: '1' },
      { name: 'Classic large case', input: '4 6249\n186 419 83 408\n', expected: '20' },
      { name: 'Large amount', input: '4 10000\n1 2 5 10\n', expected: '1000' },
      { name: 'Large amount, impossible parity', input: '2 9999\n2 4\n', expected: '-1' },
    ],
    solutions: {
      python: String.raw`import sys

data = sys.stdin.read().split()
n, amount = int(data[0]), int(data[1])
coins = list(map(int, data[2:2 + n]))
INF = amount + 1
best = [0] + [INF] * amount
for a in range(1, amount + 1):
    for c in coins:
        if c <= a and best[a - c] + 1 < best[a]:
            best[a] = best[a - c] + 1
print(best[amount] if best[amount] <= amount else -1)
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const n = Number(data[0]);
const amount = Number(data[1]);
const coins = data.slice(2, 2 + n).map(Number);
const INF = amount + 1;
const best = new Array(amount + 1).fill(INF);
best[0] = 0;
for (let a = 1; a <= amount; a++) {
  for (const c of coins) {
    if (c <= a && best[a - c] + 1 < best[a]) best[a] = best[a - c] + 1;
  }
}
console.log(best[amount] <= amount ? best[amount] : -1);
`,
    },
  },
  {
    slug: 'longest-common-subsequence',
    title: 'Longest common subsequence',
    type: 'coding',
    difficulty: 'medium',
    skills: ['dynamic-programming', 'strings'],
    topics: ['dynamic-programming', 'strings', '2d-dp'],
    prompt: `A **subsequence** is obtained by deleting zero or more characters from a string without changing the order of the rest (\`ace\` is a subsequence of \`abcde\`). Print the length of the longest subsequence common to both strings.

**Input:** two lines, the strings \`a\` and \`b\`, each made of lowercase English letters.

**Output:** the length of their longest common subsequence.

**Example**

Input:
\`\`\`
abcde
ace
\`\`\`
Output:
\`\`\`
3
\`\`\``,
    constraints: '1 ≤ |a|, |b| ≤ 1000',
    hints: [
      'Compare the last characters of the two strings. What happens if they are equal? What if they are not?',
      'Let dp[i][j] be the LCS length of the first i characters of a and the first j characters of b. If a[i-1] == b[j-1], dp[i][j] = dp[i-1][j-1] + 1.',
      'Otherwise dp[i][j] = max(dp[i-1][j], dp[i][j-1]). Fill a (|a|+1) x (|b|+1) table row by row from dp[0][*] = dp[*][0] = 0; the answer is dp[|a|][|b|]. Keeping only two rows saves memory.',
    ],
    explanation: `Let \`dp[i][j]\` be the LCS length of prefixes \`a[:i]\` and \`b[:j]\`. If the last characters match, they can both end the common subsequence: \`dp[i][j] = dp[i-1][j-1] + 1\`. If not, at least one of them is unused, so \`dp[i][j] = max(dp[i-1][j], dp[i][j-1])\`. Empty prefixes give 0.

Each row only depends on the previous row, so two rows of length \`|b| + 1\` are enough.

**Complexity:** O(|a| * |b|) time and O(min(|a|, |b|)) space with rolling rows (O(|a| * |b|) with the full table).`,
    starterCode: {
      python: PY_TOKENS + 'a, b = data[0], data[1]\n',
      javascript: JS_TOKENS + 'const [a, b] = data;\n',
    },
    visibleTests: [
      { name: 'Example', input: 'abcde\nace\n', expected: '3' },
      { name: 'Nothing in common', input: 'abc\ndef\n', expected: '0' },
    ],
    hiddenTests: [
      { name: 'Identical strings', input: 'abc\nabc\n', expected: '3' },
      { name: 'Single characters', input: 'a\nb\n', expected: '0' },
      { name: 'Palindromic overlap', input: 'abcba\nabcbcba\n', expected: '5' },
      { name: 'Repeated letters', input: 'aaaa\naa\n', expected: '2' },
      { name: 'Large input (1000 x 1000)', input: `${lcsA}\n${lcsB}\n`, expected: String(lcsDp(lcsA, lcsB)) },
    ],
    solutions: {
      python: String.raw`import sys

a, b = sys.stdin.read().split()[:2]
if len(b) > len(a):
    a, b = b, a
prev = [0] * (len(b) + 1)
for ch in a:
    cur = [0] * (len(b) + 1)
    for j in range(1, len(b) + 1):
        if ch == b[j - 1]:
            cur[j] = prev[j - 1] + 1
        else:
            cur[j] = prev[j] if prev[j] > cur[j - 1] else cur[j - 1]
    prev = cur
print(prev[len(b)])
`,
      javascript: String.raw`const [a0, b0] = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const a = a0.length >= b0.length ? a0 : b0;
const b = a0.length >= b0.length ? b0 : a0;
let prev = new Array(b.length + 1).fill(0);
for (let i = 1; i <= a.length; i++) {
  const cur = new Array(b.length + 1).fill(0);
  for (let j = 1; j <= b.length; j++) {
    cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
  }
  prev = cur;
}
console.log(prev[b.length]);
`,
    },
  },

  // ------------------------------------------------------------- backtracking
  {
    slug: 'n-queens-count',
    title: 'N-Queens (count solutions)',
    type: 'coding',
    difficulty: 'hard',
    skills: ['backtracking', 'recursion'],
    topics: ['backtracking', 'recursion', 'bit-manipulation'],
    prompt: `Place \`n\` queens on an \`n x n\` chessboard so that no two queens attack each other (no two share a row, a column or a diagonal). Print the **number of distinct placements**.

**Input:** a single integer \`n\`.

**Output:** the number of valid placements.

**Example**

Input:
\`\`\`
4
\`\`\`
Output:
\`\`\`
2
\`\`\``,
    constraints: '1 ≤ n ≤ 10',
    hints: [
      'Every row must contain exactly one queen. Place them one row at a time.',
      'Use backtracking: for row r, try each column that is not attacked, place the queen, recurse into row r + 1, then remove it. Count when r reaches n.',
      'Track attacked columns and diagonals in sets (or bitmasks). Squares on the same "\\" diagonal share r - c, and squares on the same "/" diagonal share r + c, so each check is O(1).',
    ],
    explanation: `Since each row holds exactly one queen, the search places one queen per row. For row \`r\`, try each column \`c\` that is free in three senses: the column, the diagonal \`r - c\` and the anti-diagonal \`r + c\`. Mark those, recurse to the next row, and unmark them when returning (the "undo" step that defines backtracking). Reaching row \`n\` means one complete placement.

Pruning attacked squares early is what makes this practical: the search explores far fewer than n^n arrangements. A bitmask version represents the three attacked sets as integers and extracts free columns with \`free & -free\`.

**Complexity:** exponential in n (roughly O(n!) in the worst case), with O(n) recursion depth and extra space. For n = 10 there are 724 solutions and the search runs instantly.`,
    starterCode: {
      python: 'n = int(input())\n',
      javascript: "const n = Number(require('fs').readFileSync(0, 'utf8').trim());\n",
    },
    visibleTests: [
      { name: 'Example', input: '4\n', expected: '2' },
      { name: 'One queen', input: '1\n', expected: '1' },
    ],
    hiddenTests: [
      { name: 'n = 2 has no solution', input: '2\n', expected: '0' },
      { name: 'n = 3 has no solution', input: '3\n', expected: '0' },
      { name: 'n = 6', input: '6\n', expected: '4' },
      { name: 'Classic eight queens', input: '8\n', expected: '92' },
      { name: 'n = 10', input: '10\n', expected: '724' },
    ],
    solutions: {
      python: String.raw`import sys

n = int(sys.stdin.read().split()[0])
full = (1 << n) - 1


def solve(cols, diag, anti):
    if cols == full:
        return 1
    count = 0
    free = full & ~(cols | diag | anti)
    while free:
        bit = free & -free
        free ^= bit
        count += solve(cols | bit, ((diag | bit) << 1) & full, (anti | bit) >> 1)
    return count


print(solve(0, 0, 0))
`,
      javascript: String.raw`const n = Number(require('fs').readFileSync(0, 'utf8').trim());
const full = (1 << n) - 1;
function solve(cols, diag, anti) {
  if (cols === full) return 1;
  let count = 0;
  let free = full & ~(cols | diag | anti);
  while (free) {
    const bit = free & -free;
    free ^= bit;
    count += solve(cols | bit, ((diag | bit) << 1) & full, (anti | bit) >> 1);
  }
  return count;
}
console.log(solve(0, 0, 0));
`,
    },
  },
];
