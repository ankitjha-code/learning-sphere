import type { SeedProblem, SeedTest } from '../types';

// ---------------------------------------------------------------------------
// Problems for the Advanced DSA track. Large hidden tests are generated at
// module load from fixed seeds, and their expected output is computed here
// with an independent method (brute force, a different algorithm, or a
// property guaranteed by construction) so the reference solutions are
// genuinely checked.
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

const PY_TOKENS = 'import sys\n\ndata = sys.stdin.read().split()\n';
const JS_TOKENS = "const data = require('fs').readFileSync(0, 'utf8').split(/\\s+/).filter(Boolean);\n";

// ------------------------------------------------------------ validate-bst
type TNode = { v: number; l: TNode | null; r: TNode | null };

function bstFromInserts(keys: number[]): TNode | null {
  let root: TNode | null = null;
  for (const k of keys) {
    const node: TNode = { v: k, l: null, r: null };
    if (!root) {
      root = node;
      continue;
    }
    let cur: TNode = root;
    for (;;) {
      if (k < cur.v) {
        if (cur.l) cur = cur.l;
        else {
          cur.l = node;
          break;
        }
      } else if (cur.r) cur = cur.r;
      else {
        cur.r = node;
        break;
      }
    }
  }
  return root;
}

function levelOrder(root: TNode | null): string[] {
  const out: string[] = [];
  const q: (TNode | null)[] = [root];
  for (let h = 0; h < q.length; h++) {
    const x = q[h];
    if (x) {
      out.push(String(x.v));
      q.push(x.l, x.r);
    } else out.push('null');
  }
  while (out.length && out[out.length - 1] === 'null') out.pop();
  return out;
}

// Independent check: rebuild the tree and confirm its inorder sequence is strictly increasing.
function inorderStrictlyIncreasing(tokens: string[]): boolean {
  if (!tokens.length || tokens[0] === 'null') return true;
  const root: TNode = { v: Number(tokens[0]), l: null, r: null };
  const q: TNode[] = [root];
  let i = 1;
  for (let h = 0; h < q.length && i < tokens.length; h++) {
    for (const side of ['l', 'r'] as const) {
      if (i >= tokens.length) break;
      const t = tokens[i++];
      if (t !== 'null') {
        const c: TNode = { v: Number(t), l: null, r: null };
        q[h][side] = c;
        q.push(c);
      }
    }
  }
  const stack: TNode[] = [];
  let cur: TNode | null = root;
  let prev = -Infinity;
  while (cur || stack.length) {
    while (cur) {
      stack.push(cur);
      cur = cur.l;
    }
    const top = stack.pop() as TNode;
    if (top.v <= prev) return false;
    prev = top.v;
    cur = top.r;
  }
  return true;
}

function bstTest(name: string, tokens: string[]): SeedTest {
  return { name, input: `${tokens.length}\n${tokens.join(' ')}\n`, expected: inorderStrictlyIncreasing(tokens) ? 'true' : 'false' };
}

const bstKeys = shuffled(
  Array.from({ length: 3000 }, (_, i) => i * 7 - 10000),
  201,
);
const bstBigTokens = levelOrder(bstFromInserts(bstKeys));
const bstBigSwapped = (() => {
  const t = bstBigTokens.slice();
  const real = t.map((x, i) => (x === 'null' ? -1 : i)).filter((i) => i >= 0);
  const a = real[Math.floor(real.length / 3)];
  const b = real[Math.floor((real.length * 2) / 3)];
  [t[a], t[b]] = [t[b], t[a]];
  return t;
})();
const bstChain = levelOrder(bstFromInserts(Array.from({ length: 800 }, (_, i) => i + 1)));
const bstLeftChainBad = (() => {
  const t = levelOrder(bstFromInserts(Array.from({ length: 800 }, (_, i) => 800 - i)));
  t[t.length - 1] = '801';
  return t;
})();

// ------------------------------------------------------------ kth smallest in a sorted matrix
function matrixTest(name: string, n: number, k: number, seed: number): SeedTest {
  const rows = randInts(n, -400000000, 400000000, seed).sort((x, y) => x - y);
  const cols = randInts(n, -400000000, 400000000, seed + 1).sort((x, y) => x - y);
  const m = rows.map((a) => cols.map((b) => a + b));
  const flat = m.flat().sort((x, y) => x - y);
  return { name, input: `${n} ${k}\n${m.map((row) => row.join(' ')).join('\n')}\n`, expected: String(flat[k - 1]) };
}

// ------------------------------------------------------------ dijkstra
function dijkstraTest(name: string, n: number, m: number, seed: number): SeedTest {
  const r = rng(seed);
  const edges: [number, number, number][] = [];
  for (let i = 0; i < m; i++) edges.push([r(1, n), r(1, n), r(0, 1000000)]);
  const s = r(1, n);
  // Independent check: Bellman-Ford with early exit.
  const dist = new Array<number>(n + 1).fill(Infinity);
  dist[s] = 0;
  for (let pass = 0; pass < n; pass++) {
    let changed = false;
    for (const [u, v, w] of edges)
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        changed = true;
      }
    if (!changed) break;
  }
  const out = dist.slice(1).map((d) => (d === Infinity ? '-1' : String(d)));
  return { name, input: `${n} ${m} ${s}\n${edges.map((e) => e.join(' ')).join('\n')}\n`, expected: out.join(' ') };
}

// ------------------------------------------------------------ topological order
// Independent check: O(n^2) selection of the smallest available vertex.
function smallestTopo(n: number, edges: [number, number][]): string {
  const indeg = new Array<number>(n + 1).fill(0);
  const adj: number[][] = Array.from({ length: n + 1 }, () => []);
  for (const [a, b] of edges) {
    adj[a].push(b);
    indeg[b]++;
  }
  const done = new Array<boolean>(n + 1).fill(false);
  const order: number[] = [];
  for (let step = 0; step < n; step++) {
    let pick = -1;
    for (let v = 1; v <= n; v++)
      if (!done[v] && indeg[v] === 0) {
        pick = v;
        break;
      }
    if (pick === -1) return 'IMPOSSIBLE';
    done[pick] = true;
    order.push(pick);
    for (const v of adj[pick]) indeg[v]--;
  }
  return order.join(' ');
}

// A random DAG: edges always go from earlier to later in a shuffled order of the vertices.
function randomDag(n: number, m: number, seed: number, backbone: boolean): [number, number][] {
  const perm = shuffled(
    Array.from({ length: n }, (_, i) => i + 1),
    seed,
  );
  const r = rng(seed + 7);
  const edges: [number, number][] = [];
  if (backbone) for (let i = 0; i + 1 < n; i++) edges.push([perm[i], perm[i + 1]]);
  while (edges.length < m) {
    const i = r(0, n - 2);
    const j = r(i + 1, n - 1);
    edges.push([perm[i], perm[j]]);
  }
  return shuffled(edges, seed + 13);
}

function edgesInput(n: number, edges: [number, number][]): string {
  return `${n} ${edges.length}\n${edges.map((e) => e.join(' ')).join('\n')}${edges.length ? '\n' : ''}`;
}

const topoDag = randomDag(1000, 4000, 301, false);
const topoCyclic = (() => {
  const e = randomDag(1000, 4000, 302, true);
  // The backbone gives a path through every vertex, so any backward edge closes a cycle.
  const perm = shuffled(
    Array.from({ length: 1000 }, (_, i) => i + 1),
    302,
  );
  e.push([perm[900], perm[100]]);
  return e;
})();

// ------------------------------------------------------------ directed cycle
const chainN = 5000;
const chainEdges: [number, number][] = Array.from({ length: chainN - 1 }, (_, i) => [i + 1, i + 2]);
const cycleDag = randomDag(3000, 12000, 401, true);
const cycleDagBack = (() => {
  const perm = shuffled(
    Array.from({ length: 3000 }, (_, i) => i + 1),
    401,
  );
  return [...cycleDag, [perm[2999], perm[0]] as [number, number]];
})();

// ------------------------------------------------------------ activity selection
function activityTest(name: string, n: number, seed: number): SeedTest {
  const r = rng(seed);
  const acts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const s = r(0, 1000000);
    acts.push([s, s + r(1, 3000)]);
  }
  // Independent check: weighted-interval DP with unit weights and binary search.
  const byEnd = acts.slice().sort((a, b) => a[1] - b[1]);
  const ends = byEnd.map((a) => a[1]);
  const dp = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    const [s] = byEnd[i - 1];
    let lo = 0;
    let hi = i - 1; // count of activities among the first i - 1 with end <= s
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ends[mid - 1] <= s) lo = mid;
      else hi = mid - 1;
    }
    dp[i] = Math.max(dp[i - 1], dp[lo] + 1);
  }
  return { name, input: `${n}\n${acts.map((a) => a.join(' ')).join('\n')}\n`, expected: String(dp[n]) };
}

// ------------------------------------------------------------ unique permutations
// Independent check: the classic next-permutation algorithm.
function allPermsByNext(nums: number[]): string {
  const a = nums.slice().sort((x, y) => x - y);
  const out: string[] = [a.join(' ')];
  for (;;) {
    let i = a.length - 2;
    while (i >= 0 && a[i] >= a[i + 1]) i--;
    if (i < 0) break;
    let j = a.length - 1;
    while (a[j] <= a[i]) j--;
    [a[i], a[j]] = [a[j], a[i]];
    for (let l = i + 1, h = a.length - 1; l < h; l++, h--) [a[l], a[h]] = [a[h], a[l]];
    out.push(a.join(' '));
  }
  return out.join('\n');
}
function permTest(name: string, nums: number[]): SeedTest {
  return { name, input: `${nums.length}\n${nums.join(' ')}\n`, expected: allPermsByNext(nums) };
}

// ------------------------------------------------------------ LIS
function lisQuadratic(a: number[]): number {
  const dp = new Array<number>(a.length).fill(1);
  let best = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < i; j++) if (a[j] < a[i] && dp[j] + 1 > dp[i]) dp[i] = dp[j] + 1;
    best = Math.max(best, dp[i]);
  }
  return best;
}
const lisRandom = randInts(2500, -1000, 1000, 501);
// 100 blocks of 500 values; each block is decreasing and every block lies above the previous one,
// so an increasing subsequence takes at most one value per block and the answer is exactly 100.
const lisBlocks = Array.from({ length: 50000 }, (_, i) => Math.floor(i / 500) * 1000 + (499 - (i % 500)));

// ------------------------------------------------------------ edit distance
function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array<number>(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
function randWord(n: number, alphabet: string, seed: number): string {
  const r = rng(seed);
  let s = '';
  for (let i = 0; i < n; i++) s += alphabet[r(0, alphabet.length - 1)];
  return s;
}
const editA = randWord(600, 'abcd', 601);
const editB = randWord(700, 'abcd', 602);

// ------------------------------------------------------------ 0/1 knapsack
// Independent check: DP over total value (minimum weight needed to reach each value).
function knapsackTest(name: string, n: number, W: number, seed: number): SeedTest {
  const r = rng(seed);
  const items: [number, number][] = Array.from({ length: n }, () => [r(1, 2000), r(1, 100)]);
  const total = items.reduce((s, it) => s + it[1], 0);
  const minW = new Array<number>(total + 1).fill(Infinity);
  minW[0] = 0;
  for (const [w, v] of items) for (let val = total; val >= v; val--) if (minW[val - v] + w < minW[val]) minW[val] = minW[val - v] + w;
  let best = 0;
  for (let val = 0; val <= total; val++) if (minW[val] <= W) best = val;
  return { name, input: `${n} ${W}\n${items.map((it) => it.join(' ')).join('\n')}\n`, expected: String(best) };
}

// ---------------------------------------------------------------------------

export const dsaAdvancedProblems: SeedProblem[] = [
  // ------------------------------------------------------------------ trees
  {
    slug: 'validate-bst',
    title: 'Validate a binary search tree',
    type: 'coding',
    difficulty: 'medium',
    skills: ['bst', 'trees'],
    topics: ['binary-search-tree', 'trees', 'dfs'],
    prompt: `A binary tree is given in **level order**, the format used by many online judges: values are listed breadth first, left to right, and \`null\` marks a missing child. Children are listed only for nodes that exist, and trailing \`null\` tokens may be omitted.

Print \`true\` if the tree is a valid **binary search tree** and \`false\` otherwise. In a valid BST, every value in a node's left subtree is **strictly smaller** than the node's value and every value in its right subtree is **strictly larger**. An empty tree is valid.

**Input:**
- line 1: an integer \`n\`, the number of tokens
- line 2: \`n\` tokens, each an integer or \`null\` (this line may be empty when \`n = 0\`)

**Output:** \`true\` or \`false\`.

**Example**

Input:
\`\`\`
7
5 1 4 null null 3 6
\`\`\`
Output:
\`\`\`
false
\`\`\`
The root is 5 and its right child is 4, which is smaller than 5.`,
    constraints: '0 ≤ n ≤ 10^4; values fit in a 32-bit signed integer; the tree has at most 5000 nodes and depth at most 900',
    hints: [
      'Comparing each node only with its two children is not enough: in `5 4 6 null null 3 7` every parent and child are ordered correctly, yet 3 sits in the right subtree of 5.',
      'Pass an allowed range (low, high) down the tree. The root may be anything; a left child inherits (low, parent) and a right child inherits (parent, high).',
      'First build the tree from the level-order tokens with a queue: take the next node from the queue and give it the next two tokens as its left and right children. Then check ranges with a stack, or use the fact that an inorder traversal of a BST is strictly increasing.',
    ],
    explanation: `**Building the tree.** Create the root from the first token and put it in a queue. Repeatedly take the front node and read the next two tokens as its left and right child; each real child is appended to the queue. This mirrors how the level-order list was written.

**Checking the BST property.** Every node must lie strictly inside an interval determined by all its ancestors, not just its parent. Start with \`(-infinity, +infinity)\` at the root. Going left narrows the upper bound to the parent's value; going right narrows the lower bound. If any node falls outside its interval, the tree is not a BST. An equivalent check is that an inorder traversal visits values in strictly increasing order.

Using an explicit stack instead of recursion avoids recursion-depth limits on tall, chain-like trees. Avoid sentinel values such as \`-2^31\` for the bounds, because a node may legitimately hold that value; use \`None\`/\`null\` or infinity instead.

**Complexity:** O(n) time to build and check, O(n) space for the nodes and the stack.`,
    starterCode: {
      python: PY_TOKENS + 'n = int(data[0])\ntokens = data[1:1 + n]  # each token is an integer string or "null"\n',
      javascript: JS_TOKENS + 'const n = Number(data[0]);\nconst tokens = data.slice(1, 1 + n); // each token is an integer string or "null"\n',
    },
    visibleTests: [
      { name: 'Example', input: '7\n5 1 4 null null 3 6\n', expected: 'false' },
      { name: 'Small valid tree', input: '3\n2 1 3\n', expected: 'true' },
    ],
    hiddenTests: [
      { name: 'Empty tree', input: '0\n\n', expected: 'true' },
      { name: 'Single node', input: '1\n42\n', expected: 'true' },
      { name: 'Violation two levels down', input: '7\n5 4 6 null null 3 7\n', expected: 'false' },
      { name: 'Duplicate value is not allowed', input: '3\n2 2 3\n', expected: 'false' },
      { name: 'Extreme 32-bit values', input: '3\n-2147483648 null 2147483647\n', expected: 'true' },
      { name: 'Valid with negatives', input: '10\n0 -5 8 -9 -2 6 10 null null -3\n', expected: 'true' },
      bstTest('Long right chain (800 nodes)', bstChain),
      bstTest('Long left chain with a bad leaf', bstLeftChainBad),
      bstTest('Large valid BST (3000 nodes)', bstBigTokens),
      bstTest('Large BST with two values swapped', bstBigSwapped),
    ],
    solutions: {
      python: String.raw`import sys

data = sys.stdin.read().split()
n = int(data[0]) if data else 0
tokens = data[1:1 + n]

val, left, right = [], [], []
if tokens and tokens[0] != "null":
    val.append(int(tokens[0]))
    left.append(-1)
    right.append(-1)
    queue = [0]
    head = 0
    i = 1
    while head < len(queue) and i < len(tokens):
        node = queue[head]
        head += 1
        for side in (left, right):
            if i >= len(tokens):
                break
            tok = tokens[i]
            i += 1
            if tok != "null":
                val.append(int(tok))
                left.append(-1)
                right.append(-1)
                side[node] = len(val) - 1
                queue.append(len(val) - 1)

ok = True
stack = [(0, None, None)] if val else []
while stack:
    node, lo, hi = stack.pop()
    v = val[node]
    if (lo is not None and v <= lo) or (hi is not None and v >= hi):
        ok = False
        break
    if left[node] != -1:
        stack.append((left[node], lo, v))
    if right[node] != -1:
        stack.append((right[node], v, hi))

print("true" if ok else "false")
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const n = data.length ? Number(data[0]) : 0;
const tokens = data.slice(1, 1 + n);

const val = [];
const kids = []; // kids[i] = [left, right], -1 when missing
if (tokens.length && tokens[0] !== 'null') {
  val.push(Number(tokens[0]));
  kids.push([-1, -1]);
  const queue = [0];
  let i = 1;
  for (let head = 0; head < queue.length && i < tokens.length; head++) {
    const node = queue[head];
    for (let side = 0; side < 2 && i < tokens.length; side++) {
      const tok = tokens[i++];
      if (tok !== 'null') {
        val.push(Number(tok));
        kids.push([-1, -1]);
        kids[node][side] = val.length - 1;
        queue.push(val.length - 1);
      }
    }
  }
}

let ok = true;
const stack = val.length ? [[0, null, null]] : [];
while (stack.length) {
  const [node, lo, hi] = stack.pop();
  const v = val[node];
  if ((lo !== null && v <= lo) || (hi !== null && v >= hi)) {
    ok = false;
    break;
  }
  const [l, r] = kids[node];
  if (l !== -1) stack.push([l, lo, v]);
  if (r !== -1) stack.push([r, v, hi]);
}
console.log(ok ? 'true' : 'false');
`,
    },
  },
  // ------------------------------------------------------------------ heaps
  {
    slug: 'kth-smallest-sorted-matrix',
    title: 'Kth smallest in a sorted matrix',
    type: 'coding',
    difficulty: 'medium',
    skills: ['heaps'],
    topics: ['heap', 'priority-queue', 'k-way-merge', 'matrix'],
    prompt: `You are given an \`n x n\` matrix in which **every row and every column is sorted in non-decreasing order**. Print the \`k\`-th smallest value in the whole matrix (1-indexed, counting duplicates separately).

**Input:**
- line 1: two integers \`n k\`
- the next \`n\` lines: \`n\` integers each, one matrix row per line

**Output:** the \`k\`-th smallest value.

**Example**

Input:
\`\`\`
3 8
1 5 9
10 11 13
12 13 15
\`\`\`
Output:
\`\`\`
13
\`\`\`
In sorted order the values are 1, 5, 9, 10, 11, 12, 13, 13, 15, and the 8th is 13.`,
    constraints: '1 ≤ n ≤ 300; 1 ≤ k ≤ n^2; -10^9 ≤ value ≤ 10^9',
    hints: [
      'Flattening and sorting all n^2 values works but ignores the structure. Each row is already a sorted list: how do you merge sorted lists efficiently?',
      'Put the first element of every row into a min-heap, as (value, row, column). The smallest remaining value in the matrix is always at the top of the heap.',
      'Pop k - 1 times; after popping (value, r, c), push (matrix[r][c + 1], r, c + 1) if that column exists. The top of the heap is then the answer.',
    ],
    explanation: `This is a **k-way merge**. Each row is a sorted list, and the next smallest value overall must be the front of one of the rows. A min-heap holding one "front" entry per row gives that value in O(log n).

1. Push \`(matrix[r][0], r, 0)\` for every row \`r\`.
2. Pop the smallest entry \`k - 1\` times. After popping \`(v, r, c)\`, push the next element of the same row, \`(matrix[r][c + 1], r, c + 1)\`, if it exists.
3. The heap's top is now the \`k\`-th smallest value.

The heap never holds more than \`n\` entries. (The sorted columns allow an alternative: binary search on the answer value, counting how many entries are <= mid with a staircase walk in O(n).)

**Complexity:** O(n + k log n) time and O(n) extra space, compared with O(n^2 log n) for sorting everything.`,
    starterCode: {
      python: PY_TOKENS + 'n, k = int(data[0]), int(data[1])\nvalues = list(map(int, data[2:2 + n * n]))\nmatrix = [values[i * n:(i + 1) * n] for i in range(n)]\n',
      javascript: JS_TOKENS + 'const n = Number(data[0]);\nconst k = Number(data[1]);\nconst matrix = [];\nfor (let i = 0; i < n; i++) matrix.push(data.slice(2 + i * n, 2 + (i + 1) * n).map(Number));\n',
    },
    visibleTests: [
      { name: 'Example', input: '3 8\n1 5 9\n10 11 13\n12 13 15\n', expected: '13' },
      { name: 'One cell', input: '1 1\n-7\n', expected: '-7' },
    ],
    hiddenTests: [
      { name: 'Smallest (k = 1)', input: '3 1\n1 5 9\n10 11 13\n12 13 15\n', expected: '1' },
      { name: 'Largest (k = n^2)', input: '3 9\n1 5 9\n10 11 13\n12 13 15\n', expected: '15' },
      { name: 'Duplicates count separately', input: '2 2\n1 2\n1 3\n', expected: '1' },
      { name: 'Answer in a later row', input: '2 3\n1 2\n1 3\n', expected: '2' },
      { name: 'Negative values', input: '3 4\n-9 -5 0\n-8 -1 3\n-2 4 8\n', expected: '-2' },
      matrixTest('Large matrix (150 x 150)', 150, 11111, 211),
      matrixTest('Large matrix, k near the end', 120, 14000, 213),
    ],
    solutions: {
      python: String.raw`import heapq
import sys

data = sys.stdin.read().split()
n, k = int(data[0]), int(data[1])
values = list(map(int, data[2:2 + n * n]))
matrix = [values[i * n:(i + 1) * n] for i in range(n)]

heap = [(matrix[r][0], r, 0) for r in range(n)]
heapq.heapify(heap)
for _ in range(k - 1):
    v, r, c = heapq.heappop(heap)
    if c + 1 < n:
        heapq.heappush(heap, (matrix[r][c + 1], r, c + 1))
print(heap[0][0])
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const n = Number(data[0]);
const k = Number(data[1]);
const matrix = [];
for (let i = 0; i < n; i++) matrix.push(data.slice(2 + i * n, 2 + (i + 1) * n).map(Number));

// Minimal binary min-heap of [value, row, col] entries.
const heap = [];
function push(item) {
  heap.push(item);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap[p][0] <= heap[i][0]) break;
    [heap[p], heap[i]] = [heap[i], heap[p]];
    i = p;
  }
}
function pop() {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let s = i;
      if (l < heap.length && heap[l][0] < heap[s][0]) s = l;
      if (r < heap.length && heap[r][0] < heap[s][0]) s = r;
      if (s === i) break;
      [heap[s], heap[i]] = [heap[i], heap[s]];
      i = s;
    }
  }
  return top;
}

for (let r = 0; r < n; r++) push([matrix[r][0], r, 0]);
for (let t = 0; t < k - 1; t++) {
  const [, r, c] = pop();
  if (c + 1 < n) push([matrix[r][c + 1], r, c + 1]);
}
console.log(heap[0][0]);
`,
    },
  },
  // ------------------------------------------------------------------ graphs
  {
    slug: 'dijkstra-shortest-paths',
    title: "Shortest paths with Dijkstra's algorithm",
    type: 'coding',
    difficulty: 'medium',
    skills: ['shortest-paths', 'heaps', 'graphs'],
    topics: ['graphs', 'dijkstra', 'priority-queue', 'weighted-graphs'],
    prompt: `A directed graph has \`n\` vertices numbered \`1\` to \`n\` and \`m\` weighted edges with **non-negative** weights. Print the length of the shortest path from the source vertex \`s\` to every vertex.

**Input:**
- line 1: three integers \`n m s\`
- the next \`m\` lines: three integers \`u v w\`, a directed edge from \`u\` to \`v\` with weight \`w\`

Parallel edges and self-loops may appear.

**Output:** one line with \`n\` space-separated integers: the distance from \`s\` to vertex 1, 2, ..., n. Print \`-1\` for a vertex that cannot be reached. The distance from \`s\` to itself is \`0\`.

**Example**

Input:
\`\`\`
5 6 1
1 2 4
1 3 1
3 2 2
2 4 1
3 4 5
4 5 3
\`\`\`
Output:
\`\`\`
0 3 1 4 7
\`\`\`
Going 1 to 3 to 2 costs 3, which beats the direct edge of weight 4.`,
    constraints: '1 ≤ n ≤ 10^4; 0 ≤ m ≤ 5 * 10^4; 1 ≤ u, v, s ≤ n; 0 ≤ w ≤ 10^6',
    hints: [
      'BFS finds fewest edges, not least total weight. You need to always expand the closest vertex not yet finalised.',
      "Keep dist[] (infinity except dist[s] = 0) and a min-heap of (distance, vertex). Pop the smallest; for each edge (u, v, w), if dist[u] + w < dist[v], update dist[v] and push (dist[v], v).",
      'A vertex can be pushed several times. When you pop (d, u) with d > dist[u], the entry is stale: skip it. Print -1 for vertices whose distance is still infinity.',
    ],
    explanation: `**Dijkstra's algorithm** grows a set of vertices whose shortest distance is final. Because weights are non-negative, the unfinished vertex with the smallest tentative distance cannot be improved later, so it can be finalised. A min-heap finds it quickly.

1. \`dist[s] = 0\`, all others infinity; push \`(0, s)\`.
2. Pop \`(d, u)\`. If \`d > dist[u]\` the entry is outdated, so skip it.
3. **Relax** every edge \`u -> v\` with weight \`w\`: if \`d + w < dist[v]\`, set \`dist[v] = d + w\` and push \`(dist[v], v)\`.

This "lazy deletion" version pushes a new entry instead of decreasing a key, which is simpler and just as fast in practice. Negative weights break the argument (a later edge could reduce a finalised distance); use Bellman-Ford for those.

**Complexity:** O((n + m) log m) time with a binary heap, O(n + m) space.`,
    starterCode: {
      python: PY_TOKENS + 'n, m, s = int(data[0]), int(data[1]), int(data[2])\nadj = [[] for _ in range(n + 1)]\nfor i in range(m):\n    u, v, w = int(data[3 + 3 * i]), int(data[4 + 3 * i]), int(data[5 + 3 * i])\n    adj[u].append((v, w))\n',
      javascript: JS_TOKENS + 'const [n, m, s] = data.slice(0, 3).map(Number);\nconst adj = Array.from({ length: n + 1 }, () => []);\nfor (let i = 0; i < m; i++) {\n  const u = Number(data[3 + 3 * i]);\n  const v = Number(data[4 + 3 * i]);\n  const w = Number(data[5 + 3 * i]);\n  adj[u].push([v, w]);\n}\n',
    },
    visibleTests: [
      { name: 'Example', input: '5 6 1\n1 2 4\n1 3 1\n3 2 2\n2 4 1\n3 4 5\n4 5 3\n', expected: '0 3 1 4 7' },
      { name: 'Unreachable vertices', input: '3 1 1\n2 3 5\n', expected: '0 -1 -1' },
    ],
    hiddenTests: [
      { name: 'Single vertex, no edges', input: '1 0 1\n', expected: '0' },
      { name: 'Edges are one-way', input: '3 2 3\n1 2 1\n2 3 1\n', expected: '-1 -1 0' },
      { name: 'Parallel edges keep the cheapest', input: '2 3 1\n1 2 10\n1 2 3\n1 2 7\n', expected: '0 3' },
      { name: 'Zero-weight edges and a self-loop', input: '4 5 2\n2 1 0\n1 3 0\n3 4 5\n2 4 9\n4 4 1\n', expected: '0 0 0 5' },
      { name: 'More edges but shorter total', input: '4 4 1\n1 4 100\n1 2 1\n2 3 1\n3 4 1\n', expected: '0 1 2 3' },
      dijkstraTest('Large random graph (n = 2000, m = 10000)', 2000, 10000, 221),
      dijkstraTest('Sparse graph with unreachable parts', 3000, 2500, 223),
    ],
    solutions: {
      python: String.raw`import heapq
import sys

data = sys.stdin.read().split()
n, m, s = int(data[0]), int(data[1]), int(data[2])
adj = [[] for _ in range(n + 1)]
for i in range(m):
    u, v, w = int(data[3 + 3 * i]), int(data[4 + 3 * i]), int(data[5 + 3 * i])
    adj[u].append((v, w))

INF = float("inf")
dist = [INF] * (n + 1)
dist[s] = 0
pq = [(0, s)]
while pq:
    d, u = heapq.heappop(pq)
    if d > dist[u]:
        continue
    for v, w in adj[u]:
        nd = d + w
        if nd < dist[v]:
            dist[v] = nd
            heapq.heappush(pq, (nd, v))

print(" ".join("-1" if d == INF else str(d) for d in dist[1:]))
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const [n, m, s] = data.slice(0, 3).map(Number);
const adj = Array.from({ length: n + 1 }, () => []);
for (let i = 0; i < m; i++) {
  const u = Number(data[3 + 3 * i]);
  const v = Number(data[4 + 3 * i]);
  const w = Number(data[5 + 3 * i]);
  adj[u].push([v, w]);
}

const heap = []; // [distance, vertex]
function push(item) {
  heap.push(item);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap[p][0] <= heap[i][0]) break;
    [heap[p], heap[i]] = [heap[i], heap[p]];
    i = p;
  }
}
function pop() {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let sm = i;
      if (l < heap.length && heap[l][0] < heap[sm][0]) sm = l;
      if (r < heap.length && heap[r][0] < heap[sm][0]) sm = r;
      if (sm === i) break;
      [heap[sm], heap[i]] = [heap[i], heap[sm]];
      i = sm;
    }
  }
  return top;
}

const dist = new Array(n + 1).fill(Infinity);
dist[s] = 0;
push([0, s]);
while (heap.length) {
  const [d, u] = pop();
  if (d > dist[u]) continue;
  for (const [v, w] of adj[u]) {
    const nd = d + w;
    if (nd < dist[v]) {
      dist[v] = nd;
      push([nd, v]);
    }
  }
}
console.log(dist.slice(1).map((d) => (d === Infinity ? '-1' : String(d))).join(' '));
`,
    },
  },
  {
    slug: 'task-order-topological',
    title: 'Task order (topological sort)',
    type: 'coding',
    difficulty: 'medium',
    skills: ['shortest-paths', 'graphs', 'heaps'],
    topics: ['graphs', 'topological-sort', 'kahn', 'priority-queue'],
    prompt: `There are \`n\` tasks numbered \`1\` to \`n\` and \`m\` rules. A rule \`a b\` means task \`a\` must be done **before** task \`b\`. Print an order in which all tasks can be done.

Many orders may be valid, so print the **lexicographically smallest** one: whenever several tasks are available (all their prerequisites are done), do the one with the **smallest number** first. If no valid order exists because the rules contain a cycle, print \`IMPOSSIBLE\`.

**Input:**
- line 1: two integers \`n m\`
- the next \`m\` lines: two integers \`a b\`

**Output:** the \`n\` task numbers separated by spaces, or \`IMPOSSIBLE\`.

**Example**

Input:
\`\`\`
5 4
1 3
2 3
3 4
5 4
\`\`\`
Output:
\`\`\`
1 2 3 5 4
\`\`\``,
    constraints: '1 ≤ n ≤ 10^5; 0 ≤ m ≤ 2 * 10^5; 1 ≤ a, b ≤ n (a rule may repeat; a = b is a cycle)',
    hints: [
      'A task can be done once every task that must precede it is done. Count, for each task, how many rules point into it (its in-degree).',
      "Kahn's algorithm: start with all tasks of in-degree 0, repeatedly take one, output it, and decrease the in-degree of the tasks it unlocks. Tasks that reach 0 become available.",
      'To get the smallest order, keep the available tasks in a min-heap instead of a FIFO queue. If fewer than n tasks are output, the remaining ones are stuck on a cycle: print IMPOSSIBLE.',
    ],
    explanation: `Model tasks as vertices and each rule \`a b\` as a directed edge \`a -> b\`. A valid order is a **topological order** of this graph, and one exists exactly when the graph has no directed cycle.

**Kahn's algorithm** repeatedly removes a vertex with in-degree 0 (no unfinished prerequisites), appends it to the order and decrements the in-degree of its successors. Choosing the **smallest available** vertex each time, via a min-heap, produces the lexicographically smallest topological order: at every position, no smaller task could legally be placed there.

If the heap empties before all \`n\` tasks are output, every remaining task has an unfinished prerequisite, which can only happen when they lie on or behind a cycle, so the answer is \`IMPOSSIBLE\`. A self-rule \`a a\` is a cycle of length 1.

A plain FIFO queue also gives a valid order, but not necessarily the smallest one: for rules \`4 1\` and \`2 3\` it outputs \`2 4 3 1\` while the expected answer is \`2 3 4 1\`.

**Complexity:** O((n + m) log n) time with the heap and O(n + m) space.`,
    starterCode: {
      python: PY_TOKENS + 'n, m = int(data[0]), int(data[1])\nrules = [(int(data[2 + 2 * i]), int(data[3 + 2 * i])) for i in range(m)]\n',
      javascript: JS_TOKENS + 'const n = Number(data[0]);\nconst m = Number(data[1]);\nconst rules = [];\nfor (let i = 0; i < m; i++) rules.push([Number(data[2 + 2 * i]), Number(data[3 + 2 * i])]);\n',
    },
    visibleTests: [
      { name: 'Example', input: '5 4\n1 3\n2 3\n3 4\n5 4\n', expected: '1 2 3 5 4' },
      { name: 'Cycle', input: '3 3\n1 2\n2 3\n3 1\n', expected: 'IMPOSSIBLE' },
    ],
    hiddenTests: [
      { name: 'No rules', input: '4 0\n', expected: '1 2 3 4' },
      { name: 'Reverse chain', input: '3 2\n3 2\n2 1\n', expected: '3 2 1' },
      { name: 'Smallest available first (not FIFO)', input: '4 2\n4 1\n2 3\n', expected: '2 3 4 1' },
      { name: 'Self rule', input: '2 1\n2 2\n', expected: 'IMPOSSIBLE' },
      { name: 'Repeated rule', input: '3 3\n1 2\n1 2\n2 3\n', expected: '1 2 3' },
      { name: 'Cycle in one part only', input: '5 4\n1 2\n3 4\n4 5\n5 3\n', expected: 'IMPOSSIBLE' },
      { name: 'Large DAG (n = 1000, m = 4000)', input: edgesInput(1000, topoDag), expected: smallestTopo(1000, topoDag) },
      { name: 'Large graph with one cycle', input: edgesInput(1000, topoCyclic), expected: smallestTopo(1000, topoCyclic) },
    ],
    solutions: {
      python: String.raw`import heapq
import sys

data = sys.stdin.read().split()
n, m = int(data[0]), int(data[1])
adj = [[] for _ in range(n + 1)]
indeg = [0] * (n + 1)
for i in range(m):
    a, b = int(data[2 + 2 * i]), int(data[3 + 2 * i])
    adj[a].append(b)
    indeg[b] += 1

heap = [v for v in range(1, n + 1) if indeg[v] == 0]
heapq.heapify(heap)
order = []
while heap:
    u = heapq.heappop(heap)
    order.append(u)
    for v in adj[u]:
        indeg[v] -= 1
        if indeg[v] == 0:
            heapq.heappush(heap, v)

print(" ".join(map(str, order)) if len(order) == n else "IMPOSSIBLE")
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const n = Number(data[0]);
const m = Number(data[1]);
const adj = Array.from({ length: n + 1 }, () => []);
const indeg = new Array(n + 1).fill(0);
for (let i = 0; i < m; i++) {
  const a = Number(data[2 + 2 * i]);
  const b = Number(data[3 + 2 * i]);
  adj[a].push(b);
  indeg[b]++;
}

const heap = []; // min-heap of task numbers
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
function pop() {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let s = i;
      if (l < heap.length && heap[l] < heap[s]) s = l;
      if (r < heap.length && heap[r] < heap[s]) s = r;
      if (s === i) break;
      [heap[s], heap[i]] = [heap[i], heap[s]];
      i = s;
    }
  }
  return top;
}

for (let v = 1; v <= n; v++) if (indeg[v] === 0) push(v);
const order = [];
while (heap.length) {
  const u = pop();
  order.push(u);
  for (const v of adj[u]) if (--indeg[v] === 0) push(v);
}
console.log(order.length === n ? order.join(' ') : 'IMPOSSIBLE');
`,
    },
  },
  {
    slug: 'directed-graph-cycle',
    title: 'Detect a cycle in a directed graph',
    type: 'coding',
    difficulty: 'medium',
    skills: ['graphs'],
    topics: ['graphs', 'dfs', 'cycle-detection', 'topological-sort'],
    prompt: `A directed graph has \`n\` vertices numbered \`1\` to \`n\` and \`m\` edges. Print \`YES\` if it contains a **directed cycle** (a path that starts and ends at the same vertex following edge directions) and \`NO\` otherwise. A self-loop \`u u\` is a cycle.

**Input:**
- line 1: two integers \`n m\`
- the next \`m\` lines: two integers \`u v\`, an edge from \`u\` to \`v\`

**Output:** \`YES\` or \`NO\`.

**Example**

Input:
\`\`\`
4 4
1 2
2 3
3 4
4 2
\`\`\`
Output:
\`\`\`
YES
\`\`\`
2 to 3 to 4 to 2 is a cycle.`,
    constraints: '1 ≤ n ≤ 10^5; 0 ≤ m ≤ 2 * 10^5; 1 ≤ u, v ≤ n',
    hints: [
      'Reaching an already visited vertex is not enough in a directed graph: in the diamond 1 to 2, 1 to 3, 2 to 4, 3 to 4, vertex 4 is reached twice but there is no cycle.',
      'Use three colours in DFS: white (unvisited), grey (on the current DFS path) and black (finished). An edge to a grey vertex closes a cycle; an edge to a black vertex does not.',
      "Alternatively run Kahn's algorithm: if repeatedly removing in-degree-0 vertices cannot remove all n vertices, there is a cycle. Either way, avoid deep recursion on long chains (use an explicit stack).",
    ],
    explanation: `**Three-colour DFS.** Mark a vertex grey when DFS enters it and black when all its descendants are finished. Grey vertices are exactly those on the current recursion path. If DFS follows an edge \`u -> v\` where \`v\` is grey, then \`v\` is an ancestor of \`u\`, so the path from \`v\` to \`u\` plus this edge is a cycle. An edge to a black vertex just leads into an already explored region with no path back, so it is harmless. That distinction is why a simple "visited" set (enough for undirected graphs) gives false positives here.

**Kahn's algorithm** gives a second proof: a directed graph has a topological order if and only if it is acyclic, so count how many vertices the in-degree-0 removal process outputs. Fewer than \`n\` means a cycle.

Long chains (thousands of vertices) exceed default recursion limits in Python, so the reference solution keeps the DFS path on an explicit stack of \`(vertex, next edge index)\` pairs.

**Complexity:** O(n + m) time and O(n + m) space for both methods.`,
    starterCode: {
      python: PY_TOKENS + 'n, m = int(data[0]), int(data[1])\nadj = [[] for _ in range(n + 1)]\nfor i in range(m):\n    adj[int(data[2 + 2 * i])].append(int(data[3 + 2 * i]))\n',
      javascript: JS_TOKENS + 'const n = Number(data[0]);\nconst m = Number(data[1]);\nconst adj = Array.from({ length: n + 1 }, () => []);\nfor (let i = 0; i < m; i++) adj[Number(data[2 + 2 * i])].push(Number(data[3 + 2 * i]));\n',
    },
    visibleTests: [
      { name: 'Example', input: '4 4\n1 2\n2 3\n3 4\n4 2\n', expected: 'YES' },
      { name: 'Diamond without a cycle', input: '4 4\n1 2\n1 3\n2 4\n3 4\n', expected: 'NO' },
    ],
    hiddenTests: [
      { name: 'No edges', input: '3 0\n', expected: 'NO' },
      { name: 'Self-loop', input: '2 1\n2 2\n', expected: 'YES' },
      { name: 'Two-vertex cycle', input: '2 2\n1 2\n2 1\n', expected: 'YES' },
      { name: 'Cycle in a later component', input: '6 4\n1 2\n3 4\n4 5\n5 3\n', expected: 'YES' },
      { name: 'Edge into a finished branch', input: '4 4\n1 2\n2 3\n1 4\n4 2\n', expected: 'NO' },
      { name: 'Long chain (5000 vertices)', input: edgesInput(chainN, chainEdges), expected: 'NO' },
      { name: 'Long chain closed into a cycle', input: edgesInput(chainN, [...chainEdges, [chainN, 1]]), expected: 'YES' },
      { name: 'Large DAG (n = 3000, m = 12000)', input: edgesInput(3000, cycleDag), expected: 'NO' },
      { name: 'Large DAG plus one backward edge', input: edgesInput(3000, cycleDagBack), expected: 'YES' },
    ],
    solutions: {
      python: String.raw`import sys

data = sys.stdin.read().split()
n, m = int(data[0]), int(data[1])
adj = [[] for _ in range(n + 1)]
for i in range(m):
    adj[int(data[2 + 2 * i])].append(int(data[3 + 2 * i]))

WHITE, GREY, BLACK = 0, 1, 2
color = [WHITE] * (n + 1)
found = False
for start in range(1, n + 1):
    if color[start] != WHITE:
        continue
    color[start] = GREY
    stack = [[start, 0]]  # vertex and index of the next edge to try
    while stack and not found:
        top = stack[-1]
        u, i = top
        if i < len(adj[u]):
            top[1] += 1
            v = adj[u][i]
            if color[v] == GREY:
                found = True
            elif color[v] == WHITE:
                color[v] = GREY
                stack.append([v, 0])
        else:
            color[u] = BLACK
            stack.pop()
    if found:
        break

print("YES" if found else "NO")
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const n = Number(data[0]);
const m = Number(data[1]);
const adj = Array.from({ length: n + 1 }, () => []);
const indeg = new Array(n + 1).fill(0);
for (let i = 0; i < m; i++) {
  const u = Number(data[2 + 2 * i]);
  const v = Number(data[3 + 2 * i]);
  adj[u].push(v);
  indeg[v]++;
}

// Kahn's algorithm: an acyclic graph lets us remove every vertex.
const queue = [];
for (let v = 1; v <= n; v++) if (indeg[v] === 0) queue.push(v);
let removed = 0;
for (let head = 0; head < queue.length; head++) {
  const u = queue[head];
  removed++;
  for (const v of adj[u]) if (--indeg[v] === 0) queue.push(v);
}
console.log(removed === n ? 'NO' : 'YES');
`,
    },
  },
  // ------------------------------------------------------------------ greedy
  {
    slug: 'activity-selection',
    title: 'Activity selection',
    type: 'coding',
    difficulty: 'easy',
    skills: ['greedy', 'sorting'],
    topics: ['greedy', 'intervals', 'sorting', 'scheduling'],
    prompt: `You have \`n\` activities, each with a start time and an end time, and one room. Two activities can both be scheduled if they do not overlap; an activity may start **exactly when** the previous one ends. Print the **maximum number** of activities you can schedule.

**Input:**
- line 1: an integer \`n\`
- the next \`n\` lines: two integers \`start end\` with \`start < end\`

**Output:** the maximum number of non-overlapping activities.

**Example**

Input:
\`\`\`
6
1 4
3 5
0 6
5 7
8 9
5 9
\`\`\`
Output:
\`\`\`
3
\`\`\`
For example, \`1 4\`, \`5 7\` and \`8 9\`.`,
    constraints: '1 ≤ n ≤ 10^5; 0 ≤ start < end ≤ 10^9',
    hints: [
      'Try a few greedy rules on paper: shortest activity first, earliest start first, earliest end first. Find a counterexample for the ones that fail.',
      'Picking the activity that ends first leaves the room free as early as possible for everything else.',
      'Sort by end time. Walk through the activities, keeping the end time of the last chosen one; take an activity when its start is >= that end time.',
    ],
    explanation: `**Greedy rule: always take the compatible activity that finishes first.** Sort by end time and scan, keeping \`last_end\`, the end of the most recently chosen activity. Take an activity if \`start >= last_end\`.

**Why it is optimal (exchange argument).** Let \`g\` be the activity with the earliest end time and take any optimal schedule. Replace its first activity with \`g\`: since \`g\` ends no later, it cannot overlap the rest, so the schedule stays valid and has the same size. Some optimal schedule therefore starts with \`g\`, and the same reasoning applies to the activities that start after \`g\` ends.

Other rules fail: *shortest first* picks \`4 7\` from \`1 5\`, \`4 7\`, \`6 10\` and blocks both others (1 instead of 2); *earliest start first* picks a long \`0 10\` that blocks everything.

**Complexity:** O(n log n) for sorting plus an O(n) scan; O(n) space for the sorted list.`,
    starterCode: {
      python: PY_TOKENS + 'n = int(data[0])\nacts = [(int(data[1 + 2 * i]), int(data[2 + 2 * i])) for i in range(n)]  # (start, end)\n',
      javascript: JS_TOKENS + 'const n = Number(data[0]);\nconst acts = [];\nfor (let i = 0; i < n; i++) acts.push([Number(data[1 + 2 * i]), Number(data[2 + 2 * i])]); // [start, end]\n',
    },
    visibleTests: [
      { name: 'Example', input: '6\n1 4\n3 5\n0 6\n5 7\n8 9\n5 9\n', expected: '3' },
      { name: 'Touching activities are compatible', input: '3\n1 2\n2 3\n3 4\n', expected: '3' },
    ],
    hiddenTests: [
      { name: 'Single activity', input: '1\n5 10\n', expected: '1' },
      { name: 'All overlap', input: '3\n1 10\n2 9\n3 8\n', expected: '1' },
      { name: 'Shortest-first fails', input: '3\n1 5\n4 7\n6 10\n', expected: '2' },
      { name: 'Earliest-start-first fails', input: '4\n0 10\n1 2\n3 4\n5 6\n', expected: '3' },
      { name: 'Identical activities', input: '4\n1 3\n1 3\n1 3\n3 5\n', expected: '2' },
      activityTest('Large input (n = 20000)', 20000, 231),
      activityTest('Large input (n = 50000)', 50000, 233),
    ],
    solutions: {
      python: String.raw`import sys

data = sys.stdin.read().split()
n = int(data[0])
acts = sorted((int(data[2 + 2 * i]), int(data[1 + 2 * i])) for i in range(n))  # (end, start)

count = 0
last_end = float("-inf")
for end, start in acts:
    if start >= last_end:
        count += 1
        last_end = end
print(count)
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const n = Number(data[0]);
const acts = [];
for (let i = 0; i < n; i++) acts.push([Number(data[1 + 2 * i]), Number(data[2 + 2 * i])]);
acts.sort((a, b) => a[1] - b[1]);

let count = 0;
let lastEnd = -Infinity;
for (const [start, end] of acts) {
  if (start >= lastEnd) {
    count++;
    lastEnd = end;
  }
}
console.log(count);
`,
    },
  },
  // ------------------------------------------------------------------ backtracking
  {
    slug: 'unique-permutations',
    title: 'Unique permutations',
    type: 'coding',
    difficulty: 'medium',
    skills: ['backtracking', 'recursion'],
    topics: ['backtracking', 'permutations', 'duplicates'],
    prompt: `Given \`n\` integers that **may contain duplicates**, print every **distinct** permutation exactly once, in **lexicographic order** (compare permutations element by element as numbers).

**Input:**
- line 1: an integer \`n\`
- line 2: \`n\` integers

**Output:** one permutation per line, with values separated by single spaces.

**Example**

Input:
\`\`\`
3
1 1 2
\`\`\`
Output:
\`\`\`
1 1 2
1 2 1
2 1 1
\`\`\``,
    constraints: '1 ≤ n ≤ 8; -100 ≤ value ≤ 100',
    hints: [
      'Sort the numbers first (numerically, not as strings). If you then build permutations by trying candidates in index order, they come out in lexicographic order.',
      'Backtrack with a used[] array: at each position try every unused index, recurse, then un-mark it.',
      'To skip duplicates, at one position never try the same value twice: skip index i when nums[i] == nums[i - 1] and index i - 1 is not currently used.',
    ],
    explanation: `**Backtracking with duplicate pruning.** Sort the values. Build the permutation one position at a time; for each position try every unused index in increasing order, recurse, and then undo the choice. Because candidates are tried in sorted order, permutations are produced in lexicographic order with no final sort.

**Avoiding repeats.** Equal values must not start the same branch twice. The rule "skip \`i\` if \`nums[i] == nums[i - 1]\` and \`i - 1\` is unused" forces equal values to be used left to right, so each distinct arrangement is built exactly once. Generating all \`n!\` orderings and deduplicating with a set also works for n = 8, but wastes time and still needs a sort.

Watch the numeric order: as strings, \`"10"\` sorts before \`"2"\`, which would give the wrong order.

**Complexity:** O(n * P) time where P is the number of distinct permutations (at most n! = 40320 for n = 8), plus O(n) recursion depth.`,
    starterCode: {
      python: PY_TOKENS + 'n = int(data[0])\nnums = list(map(int, data[1:1 + n]))\n',
      javascript: JS_TOKENS + 'const n = Number(data[0]);\nconst nums = data.slice(1, 1 + n).map(Number);\n',
    },
    visibleTests: [
      { name: 'Example', input: '3\n1 1 2\n', expected: '1 1 2\n1 2 1\n2 1 1' },
      { name: 'Distinct values', input: '3\n3 1 2\n', expected: '1 2 3\n1 3 2\n2 1 3\n2 3 1\n3 1 2\n3 2 1' },
    ],
    hiddenTests: [
      { name: 'Single value', input: '1\n5\n', expected: '5' },
      { name: 'All equal', input: '4\n7 7 7 7\n', expected: '7 7 7 7' },
      { name: 'Numeric, not string, order', input: '3\n10 -1 2\n', expected: '-1 2 10\n-1 10 2\n2 -1 10\n2 10 -1\n10 -1 2\n10 2 -1' },
      permTest('Two pairs', [2, 1, 2, 1]),
      permTest('Six distinct values', [4, 1, 6, 2, 5, 3]),
      permTest('Seven values with repeats', [3, 1, 2, 3, 1, 2, 4]),
      permTest('Eight values with repeats', [0, -5, 0, 9, -5, 0, 100, 9]),
    ],
    solutions: {
      python: String.raw`import sys

data = sys.stdin.read().split()
n = int(data[0])
nums = sorted(map(int, data[1:1 + n]))
used = [False] * n
path = []
out = []


def build():
    if len(path) == n:
        out.append(" ".join(map(str, path)))
        return
    for i in range(n):
        if used[i]:
            continue
        if i > 0 and nums[i] == nums[i - 1] and not used[i - 1]:
            continue
        used[i] = True
        path.append(nums[i])
        build()
        path.pop()
        used[i] = False


build()
sys.stdout.write("\n".join(out) + "\n")
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const n = Number(data[0]);
const nums = data.slice(1, 1 + n).map(Number).sort((a, b) => a - b);
const used = new Array(n).fill(false);
const path = [];
const out = [];

function build() {
  if (path.length === n) {
    out.push(path.join(' '));
    return;
  }
  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    if (i > 0 && nums[i] === nums[i - 1] && !used[i - 1]) continue;
    used[i] = true;
    path.push(nums[i]);
    build();
    path.pop();
    used[i] = false;
  }
}

build();
console.log(out.join('\n'));
`,
    },
  },
  // ------------------------------------------------------------------ dynamic programming
  {
    slug: 'longest-increasing-subsequence',
    title: 'Longest increasing subsequence',
    type: 'coding',
    difficulty: 'medium',
    skills: ['dynamic-programming', 'binary-search'],
    topics: ['dynamic-programming', 'binary-search', 'patience-sorting'],
    prompt: `Print the length of the longest **strictly increasing subsequence** of an array. A subsequence keeps the original order but may skip elements.

**Input:**
- line 1: an integer \`n\`
- line 2: \`n\` integers

**Output:** the length of the longest strictly increasing subsequence.

**Example**

Input:
\`\`\`
8
10 9 2 5 3 7 101 18
\`\`\`
Output:
\`\`\`
4
\`\`\`
One longest subsequence is \`2 3 7 18\`.`,
    constraints: '1 ≤ n ≤ 10^5; -10^9 ≤ value ≤ 10^9',
    hints: [
      'Let dp[i] be the length of the longest increasing subsequence that ends at index i. It equals 1 + the largest dp[j] with j < i and a[j] < a[i]. That is O(n^2): fine for small n, too slow for 10^5.',
      'Keep tails[L] = the smallest possible last value of an increasing subsequence of length L + 1. This array is always sorted.',
      'For each x, binary-search the first position in tails whose value is >= x. Replace it with x, or append x if there is none. The answer is len(tails).',
    ],
    explanation: `**O(n^2) DP.** \`dp[i] = 1 + max(dp[j])\` over \`j < i\` with \`a[j] < a[i]\` (or 1 if none). The answer is \`max(dp)\`. Correct, but about 5 * 10^9 steps for n = 10^5.

**O(n log n) with binary search.** Maintain \`tails\`, where \`tails[L]\` is the smallest value that can end an increasing subsequence of length \`L + 1\`. A smaller tail is always at least as useful, because more future values can extend it. \`tails\` is strictly increasing, so for each \`x\`:
- find the first index with \`tails[idx] >= x\` (a lower bound, \`bisect_left\` in Python);
- if there is none, \`x\` extends the longest subsequence, so append it;
- otherwise set \`tails[idx] = x\`, improving the best tail for that length.

Using lower bound (\`>= x\`) rather than upper bound keeps the subsequence **strictly** increasing: an equal value replaces, never extends. Note that \`tails\` is not itself a valid subsequence; only its length is meaningful.

**Complexity:** O(n log n) time and O(n) space.`,
    starterCode: {
      python: PY_TOKENS + 'n = int(data[0])\nnums = list(map(int, data[1:1 + n]))\n',
      javascript: JS_TOKENS + 'const n = Number(data[0]);\nconst nums = data.slice(1, 1 + n).map(Number);\n',
    },
    visibleTests: [
      { name: 'Example', input: '8\n10 9 2 5 3 7 101 18\n', expected: '4' },
      { name: 'Repeated values', input: '6\n0 1 0 3 2 3\n', expected: '4' },
    ],
    hiddenTests: [
      { name: 'Single element', input: '1\n-4\n', expected: '1' },
      { name: 'All equal (strictly increasing only)', input: '5\n7 7 7 7 7\n', expected: '1' },
      { name: 'Decreasing', input: '5\n5 4 3 2 1\n', expected: '1' },
      { name: 'Increasing', input: '6\n-3 -1 0 4 8 9\n', expected: '6' },
      { name: 'Greedy trap', input: '7\n1 100 2 3 101 4 5\n', expected: '5' },
      { name: 'Random (n = 2500)', input: `2500\n${lisRandom.join(' ')}\n`, expected: String(lisQuadratic(lisRandom)) },
      { name: 'Large structured (n = 50000)', input: `50000\n${lisBlocks.join(' ')}\n`, expected: '100' },
    ],
    solutions: {
      python: String.raw`import sys
from bisect import bisect_left

data = sys.stdin.read().split()
n = int(data[0])
nums = list(map(int, data[1:1 + n]))
tails = []
for x in nums:
    i = bisect_left(tails, x)
    if i == len(tails):
        tails.append(x)
    else:
        tails[i] = x
print(len(tails))
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const n = Number(data[0]);
const nums = data.slice(1, 1 + n).map(Number);
const tails = [];
for (const x of nums) {
  let lo = 0;
  let hi = tails.length; // first index with tails[idx] >= x
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tails[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  if (lo === tails.length) tails.push(x);
  else tails[lo] = x;
}
console.log(tails.length);
`,
    },
  },
  {
    slug: 'edit-distance',
    title: 'Edit distance',
    type: 'coding',
    difficulty: 'medium',
    skills: ['dynamic-programming', 'strings'],
    topics: ['dynamic-programming', 'strings', 'levenshtein'],
    prompt: `Print the **edit distance** (Levenshtein distance) between two words: the minimum number of single-character operations needed to turn the first word into the second. The allowed operations are **insert** a character, **delete** a character and **replace** a character, each costing 1.

**Input:** two lines, each containing one word of lowercase letters.

**Output:** the edit distance.

**Example**

Input:
\`\`\`
horse
ros
\`\`\`
Output:
\`\`\`
3
\`\`\`
horse to rorse (replace h with r), rorse to rose (delete r), rose to ros (delete e).`,
    constraints: '1 ≤ length of each word ≤ 1000',
    hints: [
      'Think about the last characters of the two prefixes you are comparing. Either they match, or the last operation was an insert, a delete or a replace.',
      'Let dp[i][j] be the edit distance between the first i characters of a and the first j characters of b. dp[i][0] = i and dp[0][j] = j.',
      'If a[i - 1] == b[j - 1], dp[i][j] = dp[i - 1][j - 1]. Otherwise dp[i][j] = 1 + min(dp[i - 1][j] (delete), dp[i][j - 1] (insert), dp[i - 1][j - 1] (replace)). Only the previous row is needed.',
    ],
    explanation: `**State.** \`dp[i][j]\` is the minimum cost to turn \`a[:i]\` into \`b[:j]\`.

**Base cases.** Turning a prefix of length \`i\` into the empty string takes \`i\` deletions, so \`dp[i][0] = i\`; similarly \`dp[0][j] = j\` insertions.

**Recurrence.** Look at the last characters:
- if \`a[i - 1] == b[j - 1]\`, they already match: \`dp[i][j] = dp[i - 1][j - 1]\`;
- otherwise take the cheapest of: delete \`a[i - 1]\` (\`dp[i - 1][j] + 1\`), insert \`b[j - 1]\` (\`dp[i][j - 1] + 1\`), or replace (\`dp[i - 1][j - 1] + 1\`).

Fill the table row by row; the answer is \`dp[len(a)][len(b)]\`. Each row only reads the row above and the cell to its left, so two rows of length \`len(b) + 1\` are enough.

**Complexity:** O(len(a) * len(b)) time, O(len(b)) space with rolling rows.`,
    starterCode: {
      python: PY_TOKENS + 'a, b = data[0], data[1]\n',
      javascript: JS_TOKENS + 'const [a, b] = data;\n',
    },
    visibleTests: [
      { name: 'Example', input: 'horse\nros\n', expected: '3' },
      { name: 'Classic', input: 'intention\nexecution\n', expected: '5' },
    ],
    hiddenTests: [
      { name: 'Identical words', input: 'same\nsame\n', expected: '0' },
      { name: 'One replacement', input: 'a\nb\n', expected: '1' },
      { name: 'Only insertions', input: 'abc\nabcdef\n', expected: '3' },
      { name: 'Only deletions', input: 'aaaaaaaaaa\na\n', expected: '9' },
      { name: 'Kitten and sitting', input: 'kitten\nsitting\n', expected: '3' },
      { name: 'Sunday and saturday', input: 'sunday\nsaturday\n', expected: '3' },
      { name: 'Nothing in common', input: 'abc\nxyz\n', expected: '3' },
      { name: 'Large words (600 x 700)', input: `${editA}\n${editB}\n`, expected: String(levenshtein(editA, editB)) },
    ],
    solutions: {
      python: String.raw`import sys

data = sys.stdin.read().split()
a, b = data[0], data[1]
m = len(b)
prev = list(range(m + 1))
for i in range(1, len(a) + 1):
    cur = [i] + [0] * m
    ca = a[i - 1]
    for j in range(1, m + 1):
        if ca == b[j - 1]:
            cur[j] = prev[j - 1]
        else:
            cur[j] = 1 + min(prev[j - 1], prev[j], cur[j - 1])
    prev = cur
print(prev[m])
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const [a, b] = data;
const m = b.length;
let prev = Array.from({ length: m + 1 }, (_, j) => j);
for (let i = 1; i <= a.length; i++) {
  const cur = new Array(m + 1).fill(0);
  cur[0] = i;
  for (let j = 1; j <= m; j++) {
    if (a[i - 1] === b[j - 1]) cur[j] = prev[j - 1];
    else cur[j] = 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
  }
  prev = cur;
}
console.log(prev[m]);
`,
    },
  },
  {
    slug: 'knapsack-01',
    title: '0/1 knapsack',
    type: 'coding',
    difficulty: 'medium',
    skills: ['dynamic-programming'],
    topics: ['dynamic-programming', 'knapsack'],
    prompt: `You have a bag that holds a total weight of at most \`W\` and \`n\` items, each with a weight and a value. Each item can be taken **at most once** (you cannot split items). Print the **maximum total value** you can carry.

**Input:**
- line 1: two integers \`n W\`
- the next \`n\` lines: two integers \`weight value\`

**Output:** the maximum total value.

**Example**

Input:
\`\`\`
4 7
1 1
3 4
4 5
5 7
\`\`\`
Output:
\`\`\`
9
\`\`\`
Take the items of weight 3 and 4 (total weight 7, value 4 + 5 = 9).`,
    constraints: '1 ≤ n ≤ 100; 0 ≤ W ≤ 10^4; 1 ≤ weight ≤ 10^4; 0 ≤ value ≤ 10^6',
    hints: [
      'Greedy by value-to-weight ratio fails: with capacity 10 and items (6, 30), (5, 20), (5, 20), the best ratio item blocks the better pair.',
      'Let best[c] be the maximum value achievable with capacity c using the items considered so far. Adding an item (w, v) gives best[c] = max(best[c], best[c - w] + v).',
      'Process items one at a time and loop c from W down to w. Going downwards ensures best[c - w] still describes the items before the current one, so each item is used at most once.',
    ],
    explanation: `**State.** After processing some prefix of the items, \`best[c]\` is the maximum value with total weight at most \`c\`. Initially every entry is 0 (take nothing).

**Transition.** For an item \`(w, v)\`, either skip it (\`best[c]\` unchanged) or take it, which needs capacity \`w\` and leaves \`c - w\` for the earlier items: \`best[c - w] + v\`.

**Why loop capacity downwards?** With one array, updating \`c\` from high to low means \`best[c - w]\` has not yet been updated for the current item, so the item is counted at most once. Looping upwards would let the same item be added repeatedly, which solves the *unbounded* knapsack instead (the classic bug: one item of weight 2 and value 3 with capacity 10 would wrongly give 15).

The 2-D version \`dp[i][c] = max(dp[i - 1][c], dp[i - 1][c - w_i] + v_i)\` is equivalent and makes the dependency explicit.

**Complexity:** O(n * W) time and O(W) space. This is called pseudo-polynomial: it depends on the numeric value of W, not just the input length.`,
    starterCode: {
      python: PY_TOKENS + 'n, W = int(data[0]), int(data[1])\nitems = [(int(data[2 + 2 * i]), int(data[3 + 2 * i])) for i in range(n)]  # (weight, value)\n',
      javascript: JS_TOKENS + 'const n = Number(data[0]);\nconst W = Number(data[1]);\nconst items = [];\nfor (let i = 0; i < n; i++) items.push([Number(data[2 + 2 * i]), Number(data[3 + 2 * i])]); // [weight, value]\n',
    },
    visibleTests: [
      { name: 'Example', input: '4 7\n1 1\n3 4\n4 5\n5 7\n', expected: '9' },
      { name: 'Classic', input: '3 50\n10 60\n20 100\n30 120\n', expected: '220' },
    ],
    hiddenTests: [
      { name: 'Zero capacity', input: '2 0\n1 5\n2 9\n', expected: '0' },
      { name: 'Item heavier than the bag', input: '1 5\n10 100\n', expected: '0' },
      { name: 'Greedy by ratio fails', input: '3 10\n6 30\n5 20\n5 20\n', expected: '40' },
      { name: 'Each item only once', input: '1 10\n2 3\n', expected: '3' },
      { name: 'Exact fill', input: '3 6\n1 1\n2 2\n3 3\n', expected: '6' },
      knapsackTest('Large input (n = 100, W = 10000)', 100, 10000, 241),
      knapsackTest('Tight capacity (n = 100, W = 3000)', 100, 3000, 243),
    ],
    solutions: {
      python: String.raw`import sys

data = sys.stdin.read().split()
n, W = int(data[0]), int(data[1])
best = [0] * (W + 1)
for i in range(n):
    w, v = int(data[2 + 2 * i]), int(data[3 + 2 * i])
    for c in range(W, w - 1, -1):
        cand = best[c - w] + v
        if cand > best[c]:
            best[c] = cand
print(best[W])
`,
      javascript: String.raw`const data = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
const n = Number(data[0]);
const W = Number(data[1]);
const best = new Array(W + 1).fill(0);
for (let i = 0; i < n; i++) {
  const w = Number(data[2 + 2 * i]);
  const v = Number(data[3 + 2 * i]);
  for (let c = W; c >= w; c--) {
    const cand = best[c - w] + v;
    if (cand > best[c]) best[c] = cand;
  }
}
console.log(best[W]);
`,
    },
  },
];
