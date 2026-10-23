import type { SeedTrack } from '../types';

const TF = [
  { id: 'true', text: 'True' },
  { id: 'false', text: 'False' },
];

export const dsaEssentials: SeedTrack = {
  slug: 'dsa-essentials',
  title: 'Data Structures and Algorithms Essentials',
  category: 'dsa',
  summary: 'Master the core data structures and algorithm patterns that power efficient code and technical interviews.',
  description: `**Who it's for:** developers and students who can already write small programs and want to reason about efficiency, prepare for coding interviews, or move from "it works" to "it scales".

**Prerequisites:** comfortable with one programming language (loops, functions, lists and dictionaries). Examples use Python, with JavaScript where it helps. The *Programming Foundations with Python* track covers everything you need.

**You will be able to:**
- estimate the time and space cost of code with Big-O notation and pick the faster approach
- apply the core patterns: prefix sums, hashing, two pointers, sliding windows, binary search and recursion
- choose between arrays, hash maps, stacks, queues, linked lists and trees for a task
- solve classic interview problems in CodeLab and explain your solution's complexity

**Milestones:** *Hashing in practice* (topic 4), *Searching sorted spaces* (topic 8) and *Thinking in trees* (topic 11).`,
  level: 'intermediate',
  estimatedHours: 32,
  roles: ['software engineer', 'backend developer', 'full-stack developer', 'sde intern', 'frontend developer', 'mobile developer'],
  contentStatus: 'complete',
  topics: [
    // ------------------------------------------------------------------ 1
    {
      slug: 'complexity-analysis',
      title: 'Complexity analysis and Big-O',
      module: 'Foundations',
      skill: 'complexity',
      minutes: 45,
      objectives: [
        'Explain what Big-O notation describes and why constants and lower-order terms are dropped',
        'Determine the time complexity of loops, nested loops and halving loops',
        'Distinguish time complexity from space complexity, including the call stack',
        'Compare common growth rates: O(1), O(log n), O(n), O(n log n), O(n^2) and O(2^n)',
        'Use input-size limits to estimate whether an approach is fast enough',
      ],
      body: `Two programs can both be correct while one finishes in a millisecond and the other takes an hour. **Complexity analysis** predicts how the running time (or memory) grows as the input size \`n\` grows, without running the code.

### Big-O in one sentence

\`f(n) = O(g(n))\` means that, for large enough \`n\`, \`f(n)\` is at most a constant times \`g(n)\`. It is an **upper bound on growth**. We drop constants and smaller terms because they stop mattering as \`n\` grows: \`3n^2 + 10n + 7\` is \`O(n^2)\`.

| Growth | Name | Typical source | n = 10^5 steps (roughly) |
|---|---|---|---|
| O(1) | constant | array index, hash lookup | 1 |
| O(log n) | logarithmic | binary search, halving | 17 |
| O(n) | linear | one loop over the input | 10^5 |
| O(n log n) | linearithmic | good sorting algorithms | 1.7 * 10^6 |
| O(n^2) | quadratic | all pairs, nested loops | 10^10 |
| O(2^n) | exponential | all subsets | astronomically many |

### Reading complexity from code

\`\`\`python
def total(nums):            # O(n): one pass
    s = 0
    for x in nums:
        s += x
    return s

def has_pair_sum(nums, t):  # O(n^2): every pair
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] + nums[j] == t:
                return True
    return False

def halvings(n):            # O(log n): n halves each step
    steps = 0
    while n > 1:
        n //= 2
        steps += 1
    return steps
\`\`\`

Rules of thumb: sequential blocks **add** (O(n) + O(n) = O(n)), nested loops **multiply** (O(n) * O(n) = O(n^2)), and a loop whose variable is multiplied or divided by a constant runs O(log n) times.

### Worked example: contains duplicate

Checking every pair is O(n^2). Sorting first and comparing neighbours is O(n log n). Using a set is O(n) on average:

\`\`\`python
def has_duplicate(nums):
    seen = set()
    for x in nums:          # n iterations
        if x in seen:       # O(1) average
            return True
        seen.add(x)         # O(1) average
    return False            # total: O(n) time, O(n) extra space
\`\`\`

This is the classic **time-space trade-off**: we spend O(n) memory to save a factor of n in time.

### Space complexity

Space complexity counts extra memory: new lists, dictionaries, and the **call stack**. A recursive function that goes \`n\` levels deep uses O(n) stack space even if it creates no lists.

### Estimating from constraints

A typical judge runs on the order of 10^7 to 10^8 simple operations per second (Python is slower than C++). If \`n ≤ 10^5\`, an O(n^2) solution needs about 10^10 steps and will time out; aim for O(n log n) or better. If \`n ≤ 20\`, even O(2^n) is fine.

### Best, worst and average case

Big-O usually describes the **worst case**. Linear search is O(1) in the best case (first element) but O(n) in the worst. Hash table operations are O(1) on average but O(n) in a pathological worst case.

### Common mistakes
- Counting a call such as \`x in my_list\`, \`list.index\`, \`s[1:]\` or \`list.insert(0, x)\` as O(1). Each is O(n).
- Forgetting the cost of building strings in a loop with \`+=\`; join a list instead.
- Ignoring recursion depth when stating space complexity.
- Thinking O(2n) is slower than O(n) in Big-O terms. They are the same class; constants matter only for fine tuning.`,
      practice: [
        { title: 'Contains duplicate', kind: 'problem', ref: 'contains-duplicate' },
        { title: 'Two sum', kind: 'problem', ref: 'two-sum' },
        { title: 'Analyse your own code', kind: 'exercise', prompt: 'Take a solution you wrote recently. Annotate each loop with its cost and state the overall time and space complexity. Can you remove one level of nesting?' },
      ],
      resources: [
        { title: 'Asymptotic notation', url: 'https://www.khanacademy.org/computing/computer-science/algorithms/asymptotic-notation/a/asymptotic-notation', source: 'Khan Academy', kind: 'course' },
        { title: 'Big O notation', url: 'https://en.wikipedia.org/wiki/Big_O_notation', source: 'Wikipedia', kind: 'article' },
        { title: 'TimeComplexity of Python operations', url: 'https://wiki.python.org/moin/TimeComplexity', source: 'Python Wiki', kind: 'cheatsheet' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Simplify Big-O',
          prompt: 'What is `5n^2 + 100n + 3000` in Big-O notation?',
          options: [
            { id: 'a', text: 'O(n)' },
            { id: 'b', text: 'O(n^2)' },
            { id: 'c', text: 'O(5n^2)' },
            { id: 'd', text: 'O(n^2 + n)' },
          ],
          correct: ['b'],
          explanation: 'Drop constant factors and lower-order terms: the n^2 term dominates for large n, so the class is O(n^2).',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Halving loop',
          prompt: 'What is the time complexity of `while n > 1: n //= 2`?',
          options: [
            { id: 'a', text: 'O(1)' },
            { id: 'b', text: 'O(log n)' },
            { id: 'c', text: 'O(n)' },
            { id: 'd', text: 'O(n / 2)' },
          ],
          correct: ['b'],
          explanation: 'Each iteration halves n, so the loop runs about log2(n) times.',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'Linear-time operations',
          prompt: 'Which Python operations take O(n) time on a list of length n? Select all that apply.',
          options: [
            { id: 'a', text: '`x in my_list`' },
            { id: 'b', text: '`my_list[i]`' },
            { id: 'c', text: '`my_list.insert(0, x)`' },
            { id: 'd', text: '`my_list.append(x)` (amortised)' },
          ],
          correct: ['a', 'c'],
          explanation: 'Membership scans the list and inserting at the front shifts every element. Indexing is O(1) and append is amortised O(1).',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'Match code to complexity',
          prompt: 'Match each operation to its typical time complexity.',
          pairs: {
            left: [
              { id: 'l1', text: 'Binary search in a sorted array' },
              { id: 'l2', text: 'Comparing every pair of elements' },
              { id: 'l3', text: 'Looking up a key in a hash map (average)' },
              { id: 'l4', text: 'Merge sort' },
            ],
            right: [
              { id: 'r1', text: 'O(log n)' },
              { id: 'r2', text: 'O(n^2)' },
              { id: 'r3', text: 'O(1)' },
              { id: 'r4', text: 'O(n log n)' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'Binary search halves the range, all pairs is n(n-1)/2, hash lookups are constant on average and merge sort does O(n) work on each of log n levels.',
        },
        {
          key: 'q5',
          type: 'true_false',
          title: 'Recursion and space',
          prompt: 'A recursive function that recurses n levels deep but allocates no lists uses O(1) extra space.',
          options: TF,
          correct: ['false'],
          explanation: 'Each active call occupies a stack frame, so n nested calls use O(n) space on the call stack.',
        },
      ],
    },
    // ------------------------------------------------------------------ 2
    {
      slug: 'arrays-prefix-sums',
      title: 'Arrays and prefix sums',
      module: 'Foundations',
      skill: 'arrays',
      minutes: 50,
      objectives: [
        'Describe how arrays store elements contiguously and why indexing is O(1)',
        'Know the cost of appending, inserting and deleting in a dynamic array',
        'Build a prefix-sum array and answer range-sum queries in O(1)',
        'Use running values (minimum so far, best so far) to solve problems in one pass',
      ],
      body: `An **array** stores elements in one contiguous block of memory. The address of element \`i\` is \`start + i * size\`, so reading or writing \`a[i]\` is O(1). Python's \`list\` and JavaScript's \`Array\` are **dynamic arrays**: they over-allocate and grow automatically.

| Operation | Cost | Why |
|---|---|---|
| \`a[i]\`, \`a[i] = x\` | O(1) | direct address calculation |
| append at end | amortised O(1) | occasional resize copies everything, but rarely |
| insert or delete at position i | O(n - i) | later elements must shift |
| search for a value | O(n) | must scan unless sorted |

### Prefix sums

A **prefix-sum** array stores running totals: \`P[0] = 0\` and \`P[i + 1] = P[i] + a[i]\`. The sum of the subarray \`a[l..r]\` (inclusive) is then \`P[r + 1] - P[l]\`, computed in O(1) after O(n) preprocessing.

\`\`\`python
def build_prefix(a):
    P = [0] * (len(a) + 1)
    for i, x in enumerate(a):
        P[i + 1] = P[i] + x
    return P

a = [3, -1, 4, 1, 5]
P = build_prefix(a)          # [0, 3, 2, 6, 7, 12]
print(P[4] - P[1])           # sum of a[1..3] = -1 + 4 + 1 = 4
\`\`\`

The extra leading 0 removes the special case for ranges that start at index 0. Python's \`itertools.accumulate\` builds the running totals for you.

\`\`\`javascript
const P = [0];
for (const x of a) P.push(P[P.length - 1] + x);
\`\`\`

### Worked example: maximum subarray

Find the largest sum of a contiguous subarray. Using prefix sums, the sum ending at \`j\` is \`P[j + 1] - P[i]\`, which is largest when \`P[i]\` is the **smallest prefix seen so far**. Kadane's algorithm expresses the same idea as a running value:

\`\`\`python
def max_subarray(nums):
    cur = best = nums[0]
    for x in nums[1:]:
        cur = max(x, cur + x)   # extend the run or start fresh at x
        best = max(best, cur)
    return best

print(max_subarray([-2, 1, -3, 4, -1, 2, 1, -5, 4]))  # 6
\`\`\`

**Complexity:** O(n) time and O(1) extra space, versus O(n^2) for trying every start and end.

The "best so far plus running state" pattern appears again in the stock-trading problem: track the minimum price so far and the best profit so far in one pass.

### Common mistakes
- Off-by-one errors in prefix sums: the sum of \`a[l..r]\` is \`P[r + 1] - P[l]\`, not \`P[r] - P[l]\`.
- Initialising a running maximum with 0, which gives the wrong answer when all values are negative.
- Inserting or deleting at the front of a list inside a loop, turning O(n) code into O(n^2).
- Modifying a list while iterating over it with a \`for\` loop.`,
      practice: [
        { title: 'Maximum subarray sum', kind: 'problem', ref: 'maximum-subarray' },
        { title: 'Best time to buy and sell stock', kind: 'problem', ref: 'best-time-to-buy-sell-stock' },
        { title: 'Range sums', kind: 'exercise', prompt: 'Read an array and q queries "l r". Answer each query with the sum of a[l..r] in O(1) using a prefix-sum array.' },
      ],
      resources: [
        { title: 'Prefix sum', url: 'https://en.wikipedia.org/wiki/Prefix_sum', source: 'Wikipedia', kind: 'article' },
        { title: 'Maximum subarray problem', url: 'https://en.wikipedia.org/wiki/Maximum_subarray_problem', source: 'Wikipedia', kind: 'article' },
        { title: 'More on lists', url: 'https://docs.python.org/3/tutorial/datastructures.html#more-on-lists', source: 'Python Software Foundation', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'fill_blank',
          title: 'Range sum formula',
          prompt: 'With `P[0] = 0` and `P[i + 1] = P[i] + a[i]`, the sum of `a[l..r]` (inclusive) is `P[____] - P[l]`.',
          accepted: [['r + 1', 'r+1']],
          explanation: '`P[r + 1]` contains a[0..r] and `P[l]` contains a[0..l-1]; the difference is exactly a[l..r].',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Insert at front',
          prompt: 'What is the cost of inserting an element at index 0 of a dynamic array with n elements?',
          options: [
            { id: 'a', text: 'O(1)' },
            { id: 'b', text: 'O(log n)' },
            { id: 'c', text: 'O(n)' },
          ],
          correct: ['c'],
          explanation: 'Every existing element must shift one position to the right.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Kadane initialisation',
          prompt: 'In Kadane\'s algorithm, why initialise `best` with `nums[0]` instead of 0?',
          options: [
            { id: 'a', text: 'It is faster' },
            { id: 'b', text: 'So that an array of all negative numbers returns its largest element instead of 0' },
            { id: 'c', text: 'Because Python lists start at index 0' },
          ],
          correct: ['b'],
          explanation: 'The subarray must be non-empty. Starting at 0 would wrongly report 0 for input like `-3 -1 -2`.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Prefix sums and updates',
          prompt: 'A prefix-sum array still answers range-sum queries in O(1) after you change a single element of the original array, with no extra work.',
          options: TF,
          correct: ['false'],
          explanation: 'Changing a[i] invalidates every P[j] with j > i, which costs O(n) to rebuild. Structures such as Fenwick trees support both updates and queries in O(log n).',
        },
      ],
    },
    // ------------------------------------------------------------------ 3
    {
      slug: 'strings',
      title: 'Strings and character counting',
      module: 'Foundations',
      skill: 'strings',
      minutes: 40,
      objectives: [
        'Explain string immutability and its effect on building strings in a loop',
        'Use character frequency tables to compare strings',
        'Iterate over strings with indices and with two ends moving inward',
        'Choose efficient string operations and state their complexity',
      ],
      body: `A **string** is a sequence of characters. In Python and JavaScript strings are **immutable**: every "modification" creates a new string. That has a direct performance consequence.

\`\`\`python
# O(n^2) in the worst case: each += may copy the whole string so far
out = ""
for word in words:
    out += word

# O(n): collect pieces, join once
out = "".join(words)
\`\`\`

(CPython sometimes optimises \`+=\` in place, but you should not rely on it; JavaScript engines also vary. Joining is always safe.)

### Useful operations and their cost

| Operation | Cost |
|---|---|
| \`s[i]\`, \`len(s)\` | O(1) |
| \`s[a:b]\` (slice) | O(b - a), it copies |
| \`sub in s\`, \`s.find(sub)\` | O(n * m) worst case |
| \`s.split()\`, \`"".join(parts)\` | O(n) |
| \`s[::-1]\` (reverse) | O(n) |

### Frequency tables

Many string problems reduce to **counting characters**. For lowercase letters, an array of 26 counters is fastest; for general text use \`collections.Counter\` or a \`Map\`.

\`\`\`python
def letter_counts(s):
    counts = [0] * 26
    for ch in s:
        counts[ord(ch) - ord("a")] += 1
    return counts
\`\`\`

### Worked example: valid anagram

Two strings are anagrams if they contain the same characters with the same multiplicities. Instead of sorting both (O(n log n)), count once:

\`\`\`python
def is_anagram(s, t):
    if len(s) != len(t):
        return False
    counts = [0] * 26
    for a, b in zip(s, t):
        counts[ord(a) - 97] += 1
        counts[ord(b) - 97] -= 1
    return all(c == 0 for c in counts)

print(is_anagram("listen", "silent"))  # True
\`\`\`

**Complexity:** O(n) time and O(1) extra space (26 counters).

\`\`\`javascript
function isAnagram(s, t) {
  if (s.length !== t.length) return false;
  const counts = new Array(26).fill(0);
  for (let i = 0; i < s.length; i++) {
    counts[s.charCodeAt(i) - 97]++;
    counts[t.charCodeAt(i) - 97]--;
  }
  return counts.every((c) => c === 0);
}
\`\`\`

### Two ends moving inward

Palindrome checks compare characters from both ends. Using indices avoids creating a reversed copy:

\`\`\`python
def is_palindrome(s):
    i, j = 0, len(s) - 1
    while i < j:
        if s[i] != s[j]:
            return False
        i += 1
        j -= 1
    return True
\`\`\`

### Common mistakes
- Building output with repeated \`+=\` in a loop instead of joining a list.
- Slicing inside a loop (\`s[1:]\` in a recursion), which silently adds O(n) per call.
- Forgetting that \`"A"\` and \`"a"\` are different characters; normalise with \`.lower()\` when the problem says case does not matter.
- Assuming one character is one byte or one code unit: emoji and many scripts use several UTF-16 code units in JavaScript.`,
      practice: [
        { title: 'Valid anagram', kind: 'problem', ref: 'valid-anagram' },
        { title: 'Valid parentheses', kind: 'problem', ref: 'valid-parentheses' },
        { title: 'Palindrome check', kind: 'exercise', prompt: 'Read a line and print true if it is a palindrome when you ignore case and non-alphanumeric characters. Use two indices, not a reversed copy.' },
      ],
      resources: [
        { title: 'Text sequence type: str', url: 'https://docs.python.org/3/library/stdtypes.html#text-sequence-type-str', source: 'Python Software Foundation', kind: 'docs' },
        { title: 'collections.Counter', url: 'https://docs.python.org/3/library/collections.html#collections.Counter', source: 'Python Software Foundation', kind: 'docs' },
        { title: 'String (JavaScript reference)', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String', source: 'MDN Web Docs', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'true_false',
          title: 'Immutability',
          prompt: 'In Python, `s[0] = "x"` changes the first character of the string `s` in place.',
          options: TF,
          correct: ['false'],
          explanation: 'Strings are immutable, so item assignment raises a TypeError. Build a new string instead.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Anagram check cost',
          prompt: 'What is the time complexity of checking whether two strings of length n are anagrams using a 26-letter count array?',
          options: [
            { id: 'a', text: 'O(n)' },
            { id: 'b', text: 'O(n log n)' },
            { id: 'c', text: 'O(n^2)' },
          ],
          correct: ['a'],
          explanation: 'One pass over each string plus a fixed 26-element check gives O(n). Sorting would be O(n log n).',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'Hidden linear costs',
          prompt: 'Which of these create a new string and cost time proportional to its length? Select all that apply.',
          options: [
            { id: 'a', text: '`s[2:10]`' },
            { id: 'b', text: '`len(s)`' },
            { id: 'c', text: '`s[::-1]`' },
            { id: 'd', text: '`s.upper()`' },
          ],
          correct: ['a', 'c', 'd'],
          explanation: 'Slicing, reversing and upper-casing all build new strings. `len` is O(1) because the length is stored.',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Joining pieces',
          prompt: 'To combine a list of strings `parts` into one string efficiently in Python, write `"".____(parts)`.',
          accepted: [['join']],
          explanation: '`"".join(parts)` computes the total length once and copies each piece once, so it is O(total length).',
        },
      ],
    },
    // ------------------------------------------------------------------ 4
    {
      slug: 'hash-maps-sets',
      title: 'Hash maps and sets',
      module: 'Core patterns',
      skill: 'hashing',
      minutes: 50,
      milestone: true,
      completionCriteria: 'Pass the quiz (70%+) and solve "Two sum" and "Top k frequent elements".',
      objectives: [
        'Explain how a hash table maps keys to buckets and why lookups are O(1) on average',
        'Use sets for membership and deduplication, and maps for counting and indexing',
        'Apply the "complement lookup" pattern to replace a nested loop',
        'Recognise when keys must be hashable and how collisions affect worst-case cost',
      ],
      body: `A **hash table** stores key-value pairs in an array of buckets. A **hash function** turns each key into an integer, which picks a bucket. If keys spread evenly, each bucket holds only a few entries, so insert, lookup and delete take **O(1) on average**. Python's \`dict\` and \`set\`, and JavaScript's \`Map\` and \`Set\`, are hash tables.

When two keys land in the same bucket we have a **collision**. Implementations handle it (by chaining or probing) and resize the table as it fills up, which keeps the average cost constant. In the worst case, when many keys collide, operations degrade to O(n).

### Which structure?

| Need | Use |
|---|---|
| "Have I seen x?" | set |
| "How many times does x occur?" | dict / Map of counts |
| "Where did I see x?" | dict / Map from value to index |
| Group items by a property | dict of lists |

Keys must be **hashable** (immutable) in Python: numbers, strings and tuples work; lists do not. Use \`tuple(lst)\` or a string as a key instead. In JavaScript, \`Map\` compares object keys by identity, so two equal-looking arrays are different keys.

### Worked example: two sum

Find indices \`i < j\` with \`nums[i] + nums[j] == target\`. The brute force checks all pairs in O(n^2). Instead, as we scan, ask "has the **complement** \`target - x\` appeared already?"

\`\`\`python
def two_sum(nums, target):
    seen = {}                       # value -> index of first occurrence
    for j, x in enumerate(nums):
        need = target - x
        if need in seen:            # O(1) average
            return seen[need], j
        if x not in seen:
            seen[x] = j
    return None

print(two_sum([2, 7, 11, 15], 9))  # (0, 1)
\`\`\`

Checking **before** inserting prevents using the same element twice. **Complexity:** O(n) time and O(n) space.

\`\`\`javascript
function twoSum(nums, target) {
  const seen = new Map();
  for (let j = 0; j < nums.length; j++) {
    const need = target - nums[j];
    if (seen.has(need)) return [seen.get(need), j];
    if (!seen.has(nums[j])) seen.set(nums[j], j);
  }
  return null;
}
\`\`\`

### Counting pattern

\`\`\`python
from collections import Counter
counts = Counter([3, 1, 3, 2, 3, 1])   # Counter({3: 3, 1: 2, 2: 1})
top_two = sorted(counts, key=lambda v: (-counts[v], v))[:2]   # [3, 1]
\`\`\`

Sorting by \`(-count, value)\` gives a deterministic order when counts tie, which matters whenever an exact output is required.

### Common mistakes
- Using a list for membership tests (\`x in my_list\` is O(n)) where a set gives O(1).
- Using a mutable list as a dictionary key (TypeError in Python).
- Relying on iteration order to break ties. Python dicts keep insertion order and JavaScript \`Map\` does too, but "most frequent" problems usually need an explicit tie-break rule.
- Using a plain JavaScript object as a map with keys like \`"__proto__"\` or numbers that get converted to strings. Prefer \`Map\`.`,
      practice: [
        { title: 'Two sum', kind: 'problem', ref: 'two-sum' },
        { title: 'Contains duplicate', kind: 'problem', ref: 'contains-duplicate' },
        { title: 'Top k frequent elements', kind: 'problem', ref: 'top-k-frequent' },
        { title: 'Group anagrams', kind: 'exercise', prompt: 'Given a list of words, group the anagrams together using a dictionary whose key is the sorted word (or a tuple of 26 counts).' },
      ],
      resources: [
        { title: 'Hash table visualisation', url: 'https://visualgo.net/en/hashtable', source: 'VisuAlgo', kind: 'interactive' },
        { title: 'Hash table', url: 'https://en.wikipedia.org/wiki/Hash_table', source: 'Wikipedia', kind: 'article' },
        { title: 'Map (JavaScript reference)', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map', source: 'MDN Web Docs', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Average lookup cost',
          prompt: 'What is the average time to look up a key in a well-implemented hash map?',
          options: [
            { id: 'a', text: 'O(1)' },
            { id: 'b', text: 'O(log n)' },
            { id: 'c', text: 'O(n)' },
          ],
          correct: ['a'],
          explanation: 'The hash picks a bucket directly and buckets stay small on average, so lookups are O(1) on average (O(n) only in pathological cases).',
        },
        {
          key: 'q2',
          type: 'multi',
          title: 'Valid Python dict keys',
          prompt: 'Which of these can be used as keys in a Python dict? Select all that apply.',
          options: [
            { id: 'a', text: '`(1, 2)`' },
            { id: 'b', text: '`[1, 2]`' },
            { id: 'c', text: '`"abc"`' },
            { id: 'd', text: '`frozenset({1, 2})`' },
          ],
          correct: ['a', 'c', 'd'],
          explanation: 'Keys must be hashable. Tuples of hashable values, strings and frozensets are; lists are mutable and unhashable.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Two sum order of operations',
          prompt: 'In the one-pass two sum, why do we check for the complement before inserting the current element?',
          options: [
            { id: 'a', text: 'It is faster' },
            { id: 'b', text: 'To avoid pairing an element with itself, for example a single 3 with target 6' },
            { id: 'c', text: 'Because maps cannot be read after writing' },
          ],
          correct: ['b'],
          explanation: 'If we inserted first, `target - x == x` would find the element we just stored, producing i == j.',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'Pick the structure',
          prompt: 'Match each task to the most suitable structure.',
          pairs: {
            left: [
              { id: 'l1', text: 'Remove duplicates from a list' },
              { id: 'l2', text: 'Count word frequencies' },
              { id: 'l3', text: 'Remember the index where each value first appeared' },
            ],
            right: [
              { id: 'r1', text: 'Set' },
              { id: 'r2', text: 'Map from item to count' },
              { id: 'r3', text: 'Map from value to index' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3' },
          explanation: 'Sets answer membership, count maps tally occurrences, and index maps support complement lookups like two sum.',
        },
        {
          key: 'q5',
          type: 'true_false',
          title: 'Worst case',
          prompt: 'If many keys collide into the same bucket, hash map operations can degrade to O(n).',
          options: TF,
          correct: ['true'],
          explanation: 'With heavy collisions, a lookup may have to examine most entries. Good hash functions and resizing make this rare.',
        },
      ],
    },
    // ------------------------------------------------------------------ 5
    {
      slug: 'two-pointers-sliding-window',
      title: 'Two pointers and sliding window',
      module: 'Core patterns',
      skill: 'two-pointers',
      minutes: 55,
      objectives: [
        'Use two pointers moving toward each other on sorted data',
        'Use read and write pointers to modify an array in place',
        'Maintain a variable-size sliding window with a validity condition',
        'Argue why these patterns run in O(n) even though they contain nested loops',
      ],
      body: `Two-pointer techniques replace an O(n^2) search over pairs or subarrays with a single coordinated scan. There are three common shapes.

### 1. Opposite ends (sorted input)

To find a pair with a given sum in a **sorted** array, start at both ends. If the sum is too small, only moving the left pointer right can increase it; if too large, move the right pointer left.

\`\`\`python
def pair_with_sum(a, target):        # a is sorted
    i, j = 0, len(a) - 1
    while i < j:
        s = a[i] + a[j]
        if s == target:
            return i, j
        if s < target:
            i += 1
        else:
            j -= 1
    return None
\`\`\`

Each step discards one element for good, so the loop runs at most n times: O(n).

### 2. Read and write pointers (same direction)

Compact an array in place: \`read\` visits every element, \`write\` marks where the next kept element goes. This is how "move zeroes" and "remove duplicates from sorted array" work in O(n) time and O(1) space.

\`\`\`python
def move_zeroes(nums):
    write = 0
    for read in range(len(nums)):
        if nums[read] != 0:
            nums[write], nums[read] = nums[read], nums[write]
            write += 1
\`\`\`

The merge step of merge sort is another same-direction pattern: one pointer per sorted input, always take the smaller front element.

### 3. Sliding window

A **window** \`[left, right]\` grows by moving \`right\` and shrinks by moving \`left\` whenever it becomes invalid. Keep whatever state you need to test validity (a count map, a sum) and update it incrementally.

### Worked example: longest substring without repeating characters

\`\`\`python
def longest_unique(s):
    last = {}            # char -> last index seen
    left = best = 0
    for right, ch in enumerate(s):
        if ch in last and last[ch] >= left:
            left = last[ch] + 1      # jump past the previous copy
        last[ch] = right
        best = max(best, right - left + 1)
    return best

print(longest_unique("abcabcbb"))   # 3
print(longest_unique("abba"))       # 2
\`\`\`

\`\`\`javascript
function longestUnique(s) {
  const last = new Map();
  let left = 0, best = 0;
  for (let right = 0; right < s.length; right++) {
    const ch = s[right];
    if (last.has(ch) && last.get(ch) >= left) left = last.get(ch) + 1;
    last.set(ch, right);
    best = Math.max(best, right - left + 1);
  }
  return best;
}
\`\`\`

**Complexity:** O(n) time, because \`right\` moves n times and \`left\` only ever moves forward; O(k) space for k distinct characters. The general shrinking version uses an inner \`while\` loop, but the total number of \`left\` moves across the whole run is still at most n, so the amortised cost stays O(n).

### Choosing the pattern
- Sorted array, looking for a pair: opposite ends.
- Rearranging in place or merging sorted sequences: same direction.
- "Longest/shortest contiguous subarray or substring such that...": sliding window.

### Common mistakes
- Using opposite-end pointers on **unsorted** data. The "move the smaller side" logic is only valid when the array is sorted.
- Letting \`left\` move backwards in a window (forgetting the \`last[ch] >= left\` check).
- Updating the answer before restoring validity, so an invalid window is counted.
- Sliding windows with a sum condition when the array contains negatives: shrinking no longer always decreases the sum, so the pattern breaks. Use prefix sums with a hash map instead.`,
      practice: [
        { title: 'Move zeroes', kind: 'problem', ref: 'move-zeroes' },
        { title: 'Merge two sorted arrays', kind: 'problem', ref: 'merge-sorted-arrays' },
        { title: 'Longest substring without repeating characters', kind: 'problem', ref: 'longest-substring-no-repeat' },
      ],
      resources: [
        { title: 'Sorting visualisations (see the merge step)', url: 'https://visualgo.net/en/sorting', source: 'VisuAlgo', kind: 'interactive' },
        { title: 'Search the subarray with the maximum/minimum sum', url: 'https://cp-algorithms.com/others/maximum_average_segment.html', source: 'cp-algorithms', kind: 'article' },
        { title: 'MIT 6.006 Introduction to Algorithms (Spring 2020)', url: 'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/', source: 'MIT OpenCourseWare', kind: 'course' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Precondition',
          prompt: 'The opposite-ends two-pointer search for a pair with a given sum requires the array to be:',
          options: [
            { id: 'a', text: 'Free of duplicates' },
            { id: 'b', text: 'Sorted' },
            { id: 'c', text: 'Of even length' },
          ],
          correct: ['b'],
          explanation: 'Only in a sorted array does moving the left pointer right increase the sum and moving the right pointer left decrease it.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Amortised window cost',
          prompt: 'A sliding window with an inner `while` loop that moves `left` forward is O(n^2) in the worst case.',
          options: TF,
          correct: ['false'],
          explanation: '`left` only moves forward and never passes `right`, so across the whole run it moves at most n times. Total work is O(n).',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Window trace',
          prompt: 'Using the longest-unique-substring algorithm on `"abba"`, what is `left` after processing the final `a` (index 3)?',
          options: [
            { id: 'a', text: '1' },
            { id: 'b', text: '2' },
            { id: 'c', text: '3' },
          ],
          correct: ['b'],
          explanation: 'The second `b` moves left to 2. The last `a` was seen at index 0, which is before left, so left stays at 2. The window `ba` has length 2.',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Sliding-window problems',
          prompt: 'Which problems are natural fits for a sliding window? Select all that apply.',
          options: [
            { id: 'a', text: 'Longest substring with at most 2 distinct characters' },
            { id: 'b', text: 'Shortest subarray of positive numbers with sum at least S' },
            { id: 'c', text: 'Number of islands in a grid' },
            { id: 'd', text: 'Maximum sum of any k consecutive elements' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'All three ask about contiguous ranges with a condition that can be maintained incrementally. Islands is a graph traversal problem.',
        },
      ],
    },
    // ------------------------------------------------------------------ 6
    {
      slug: 'recursion',
      title: 'Recursion',
      module: 'Core patterns',
      skill: 'recursion',
      minutes: 50,
      objectives: [
        'Write recursive functions with a correct base case and a recursive case that makes progress',
        'Trace recursive calls on the call stack',
        'Recognise overlapping subproblems and fix them with memoization',
        'State the time and stack-space cost of a recursive solution',
      ],
      body: `A function is **recursive** when it calls itself on a smaller version of the same problem. Every recursive function needs:

1. A **base case** that is answered directly, without recursion.
2. A **recursive case** that reduces the problem and trusts the recursive call to solve the smaller instance.

\`\`\`python
def factorial(n):
    if n <= 1:              # base case
        return 1
    return n * factorial(n - 1)   # recursive case: smaller n
\`\`\`

### The call stack

Each call gets its own **stack frame** holding its parameters and local variables. \`factorial(4)\` pushes frames for 4, 3, 2 and 1, then returns in reverse order: 1, 2, 6, 24. The maximum depth is the stack space used: O(n) here. Python limits depth to about 1000 by default (\`sys.getrecursionlimit()\`), so very deep recursion raises \`RecursionError\`; JavaScript throws a \`RangeError\` at a few thousand frames.

### Thinking recursively

Ask: "If someone already solved the problem for smaller inputs, how would I combine their answers?" For the sum of a list: the sum is the first element plus the sum of the rest.

\`\`\`python
def list_sum(a, i=0):
    if i == len(a):
        return 0
    return a[i] + list_sum(a, i + 1)   # pass an index, not a slice
\`\`\`

### Worked example: climbing stairs

You can climb 1 or 2 steps at a time. How many ways reach step n? The last move came from \`n - 1\` or \`n - 2\`, so \`ways(n) = ways(n - 1) + ways(n - 2)\`, with \`ways(0) = ways(1) = 1\`.

\`\`\`python
def ways(n):                     # correct but exponential
    if n <= 1:
        return 1
    return ways(n - 1) + ways(n - 2)
\`\`\`

The call tree recomputes \`ways(n - 2)\` twice, \`ways(n - 3)\` three times, and so on: roughly O(1.6^n) calls. Caching each result once (**memoization**) brings it down to O(n):

\`\`\`python
from functools import cache

@cache
def ways(n):
    if n <= 1:
        return 1
    return ways(n - 1) + ways(n - 2)

print(ways(40))   # 165580141, instantly
\`\`\`

\`\`\`javascript
function ways(n, memo = new Map()) {
  if (n <= 1) return 1;
  if (memo.has(n)) return memo.get(n);
  const r = ways(n - 1, memo) + ways(n - 2, memo);
  memo.set(n, r);
  return r;
}
\`\`\`

**Complexity:** with memoization, O(n) time and O(n) space (cache plus stack depth). This is the doorway to dynamic programming, covered in the advanced track.

### Common mistakes
- Missing or unreachable base case, causing infinite recursion and a stack overflow.
- A recursive case that does not shrink the input (for example calling \`f(n)\` from \`f(n)\`).
- Passing slices like \`a[1:]\`, which copies O(n) per call and turns O(n) into O(n^2).
- Forgetting to \`return\` the recursive result, so the function returns \`None\`.
- Ignoring stack depth on large inputs; convert to iteration or an explicit stack when depth can reach thousands.`,
      practice: [
        { title: 'Climbing stairs', kind: 'problem', ref: 'climbing-stairs' },
        { title: 'Reverse a linked list (try it recursively too)', kind: 'problem', ref: 'reverse-linked-list' },
        { title: 'Power function', kind: 'exercise', prompt: 'Write power(x, n) recursively using power(x, n // 2) so that it runs in O(log n) multiplications. Handle n = 0 and odd n.' },
      ],
      resources: [
        { title: 'Recursive algorithms', url: 'https://www.khanacademy.org/computing/computer-science/algorithms/recursive-algorithms/a/recursion', source: 'Khan Academy', kind: 'course' },
        { title: 'Recursion tree visualiser', url: 'https://visualgo.net/en/recursion', source: 'VisuAlgo', kind: 'interactive' },
        { title: 'functools.cache', url: 'https://docs.python.org/3/library/functools.html#functools.cache', source: 'Python Software Foundation', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'multi',
          title: 'Parts of a recursive function',
          prompt: 'Which are required for a correct recursive function? Select all that apply.',
          options: [
            { id: 'a', text: 'A base case that returns without recursing' },
            { id: 'b', text: 'Recursive calls on inputs that move toward the base case' },
            { id: 'c', text: 'A global variable to store the result' },
            { id: 'd', text: 'At least two recursive calls' },
          ],
          correct: ['a', 'b'],
          explanation: 'You need a base case and progress toward it. Globals and multiple calls are optional.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Naive Fibonacci cost',
          prompt: 'What is the time complexity of the naive recursive `ways(n) = ways(n-1) + ways(n-2)` without memoization?',
          options: [
            { id: 'a', text: 'O(n)' },
            { id: 'b', text: 'O(n^2)' },
            { id: 'c', text: 'Exponential, roughly O(1.6^n)' },
          ],
          correct: ['c'],
          explanation: 'The call tree branches twice per level and recomputes the same values, so the number of calls grows like the Fibonacci numbers themselves.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Stack depth',
          prompt: 'Calling `factorial(5000)` with the simple recursive definition will typically raise a RecursionError in default CPython.',
          options: TF,
          correct: ['true'],
          explanation: 'The default recursion limit is about 1000 frames, so a depth of 5000 exceeds it unless the limit is raised.',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Memoization decorator',
          prompt: 'In Python 3.9+, the decorator `@functools.____` caches a function\'s results by argument.',
          accepted: [['cache', 'lru_cache', 'lru_cache(maxsize=None)', 'lru_cache(None)']],
          explanation: '`@functools.cache` (or `@functools.lru_cache(maxsize=None)`) stores results so repeated calls with the same arguments return immediately.',
        },
      ],
    },
    // ------------------------------------------------------------------ 7
    {
      slug: 'sorting',
      title: 'Sorting',
      module: 'Searching and sorting',
      skill: 'sorting',
      minutes: 55,
      objectives: [
        'Explain how merge sort and quicksort work and state their complexities',
        'Define stability and explain when it matters',
        'Sort with custom keys in Python and comparators in JavaScript',
        'Recognise problems that become easy after sorting',
      ],
      body: `Sorting puts data in order so that equal items are adjacent, ranges are contiguous and binary search becomes possible. Comparison-based sorting cannot beat **O(n log n)** in the worst case, and the standard library sorts reach that bound.

### Merge sort

Divide the array in half, sort each half recursively, then **merge** the two sorted halves with two pointers.

\`\`\`python
def merge_sort(a):
    if len(a) <= 1:
        return a
    mid = len(a) // 2
    left, right = merge_sort(a[:mid]), merge_sort(a[mid:])
    out, i, j = [], 0, 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:      # <= keeps it stable
            out.append(left[i]); i += 1
        else:
            out.append(right[j]); j += 1
    return out + left[i:] + right[j:]
\`\`\`

There are log n levels of splitting and each level does O(n) merge work: **O(n log n)** time in every case and O(n) extra space.

### Quicksort

Pick a **pivot**, partition the array into elements smaller and larger than it, and recurse on each side. Average O(n log n), in place, and fast in practice, but O(n^2) in the worst case if pivots are consistently bad (for example always the first element on already-sorted input). Random pivots make that very unlikely.

### Stability

A sort is **stable** if equal keys keep their original relative order. Python's \`sorted\`/\`list.sort\` (Timsort) and JavaScript's \`Array.prototype.sort\` (required since ES2019) are stable. Stability lets you sort by several keys in passes, and it keeps results predictable.

### Custom ordering

\`\`\`python
people = [("Asha", 31), ("Ben", 25), ("Chen", 31)]
people.sort(key=lambda p: (-p[1], p[0]))   # age desc, then name asc
\`\`\`

\`\`\`javascript
const nums = [10, 9, 1, 100];
nums.sort();                    // [1, 10, 100, 9]  compares as strings!
nums.sort((a, b) => a - b);     // [1, 9, 10, 100]
\`\`\`

### Worked example: merge intervals

Merge overlapping intervals such as \`[1,3] [2,6] [8,10]\`. After sorting by start, an interval can only overlap the **last merged** interval:

\`\`\`python
def merge(intervals):
    intervals.sort()                     # by start, then end
    merged = []
    for s, e in intervals:
        if merged and s <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    return merged

print(merge([[8, 10], [1, 3], [2, 6]]))  # [[1, 6], [8, 10]]
\`\`\`

**Complexity:** O(n log n) for the sort plus O(n) for the sweep.

### Common mistakes
- Calling JavaScript's \`sort()\` on numbers without a comparator; it sorts lexicographically.
- Forgetting that \`list.sort()\` returns \`None\` in Python (use \`sorted()\` for a new list).
- Writing a comparator that returns a boolean instead of a negative, zero or positive number.
- Sorting when you only need the minimum, maximum or k-th element; a single pass or a heap may be cheaper.`,
      practice: [
        { title: 'Merge intervals', kind: 'problem', ref: 'merge-intervals' },
        { title: 'Kth largest element', kind: 'problem', ref: 'kth-largest' },
        { title: 'Merge two sorted arrays', kind: 'problem', ref: 'merge-sorted-arrays' },
      ],
      resources: [
        { title: 'Sorting algorithm visualisations', url: 'https://visualgo.net/en/sorting', source: 'VisuAlgo', kind: 'interactive' },
        { title: 'Sorting techniques (HOWTO)', url: 'https://docs.python.org/3/howto/sorting.html', source: 'Python Software Foundation', kind: 'docs' },
        { title: 'Overview of merge sort', url: 'https://www.khanacademy.org/computing/computer-science/algorithms/merge-sort/a/overview-of-merge-sort', source: 'Khan Academy', kind: 'course' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'matching',
          title: 'Sorting complexities',
          prompt: 'Match each algorithm to its worst-case time complexity.',
          pairs: {
            left: [
              { id: 'l1', text: 'Merge sort' },
              { id: 'l2', text: 'Quicksort with a naive first-element pivot' },
              { id: 'l3', text: 'Insertion sort' },
            ],
            right: [
              { id: 'r1', text: 'O(n log n)' },
              { id: 'r2', text: 'O(n^2), for example on already sorted input' },
              { id: 'r3', text: 'O(n^2), but O(n) on nearly sorted input' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3' },
          explanation: 'Merge sort always splits evenly. Quicksort degrades with bad pivots. Insertion sort shifts up to n elements per insert but does almost nothing when the data is already nearly sorted.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'JavaScript default sort',
          prompt: 'What does `[10, 9, 1, 100].sort()` return in JavaScript?',
          options: [
            { id: 'a', text: '[1, 9, 10, 100]' },
            { id: 'b', text: '[1, 10, 100, 9]' },
            { id: 'c', text: '[100, 10, 9, 1]' },
          ],
          correct: ['b'],
          explanation: 'Without a comparator, elements are converted to strings and compared lexicographically. Use `(a, b) => a - b` for numbers.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Stability',
          prompt: 'Python\'s built-in `sorted` is stable: items with equal keys keep their original relative order.',
          options: TF,
          correct: ['true'],
          explanation: 'Timsort is stable, which is why sorting by a secondary key first and then by a primary key works.',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'Why sort intervals?',
          prompt: 'After sorting intervals by start, why do we only compare each interval with the last merged one?',
          options: [
            { id: 'a', text: 'Earlier merged intervals end before the last one starts, so they cannot overlap the current interval' },
            { id: 'b', text: 'Because sorting removes all overlaps' },
            { id: 'c', text: 'It is an approximation that is usually correct' },
          ],
          correct: ['a'],
          explanation: 'Merged blocks are disjoint and ordered, and the current start is at least every earlier start, so only the most recent block can reach it.',
        },
      ],
    },
    // ------------------------------------------------------------------ 8
    {
      slug: 'binary-search',
      title: 'Binary search',
      module: 'Searching and sorting',
      skill: 'binary-search',
      minutes: 55,
      milestone: true,
      completionCriteria: 'Pass the quiz (70%+) and solve "Binary search" and "Integer square root".',
      objectives: [
        'Implement binary search on a sorted array without off-by-one errors',
        'State and maintain a loop invariant for the search range',
        'Find the first or last position satisfying a condition (lower and upper bounds)',
        'Apply binary search on the answer using a monotonic predicate',
      ],
      body: `**Binary search** finds a target in a sorted array by repeatedly comparing with the middle element and discarding the half that cannot contain it. Each step halves the range, so it needs at most about log2(n) + 1 comparisons: **O(log n)**. For a million elements that is about 20 steps.

### The classic version

\`\`\`python
def binary_search(a, target):
    lo, hi = 0, len(a) - 1           # invariant: if present, target is in a[lo..hi]
    while lo <= hi:
        mid = (lo + hi) // 2
        if a[mid] == target:
            return mid
        if a[mid] < target:
            lo = mid + 1             # target is right of mid
        else:
            hi = mid - 1             # target is left of mid
    return -1                        # range is empty
\`\`\`

The **invariant** is what makes it correct: every update keeps the target (if present) inside \`[lo, hi]\`, and the range strictly shrinks, so the loop ends.

### Lower bound: first position where a condition becomes true

Many problems ask for the first index with \`a[i] >= x\`. Use a half-open range \`[lo, hi)\`:

\`\`\`python
def lower_bound(a, x):
    lo, hi = 0, len(a)
    while lo < hi:
        mid = (lo + hi) // 2
        if a[mid] < x:
            lo = mid + 1
        else:
            hi = mid
    return lo        # first index with a[i] >= x (len(a) if none)
\`\`\`

Python's \`bisect.bisect_left\` does exactly this. \`bisect_right\` finds the first index with \`a[i] > x\`, so \`bisect_right - bisect_left\` counts copies of \`x\`.

### Worked example: binary search on the answer

> Find the integer square root of x: the largest r with r * r <= x.

There is no array, but the predicate \`ok(r) = r * r <= x\` is **monotonic**: true, true, ..., true, false, false. Binary search finds the boundary.

\`\`\`python
def isqrt(x):
    lo, hi = 0, x            # lo always satisfies ok(lo)
    while lo < hi:
        mid = (lo + hi + 1) // 2     # round up so lo = mid makes progress
        if mid * mid <= x:
            lo = mid
        else:
            hi = mid - 1
    return lo

print(isqrt(8))    # 2
\`\`\`

\`\`\`javascript
function isqrt(x) {
  let lo = 0, hi = x;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (mid * mid <= x) lo = mid; else hi = mid - 1;
  }
  return lo;
}
\`\`\`

**Complexity:** O(log x) iterations. The same template solves "first bad version", "minimum speed to finish in H hours" and "smallest capacity to ship within D days": define a yes/no check that flips once, then search for the flip.

### Common mistakes
- Mixing range conventions: \`while lo <= hi\` goes with \`hi = mid - 1\`; \`while lo < hi\` goes with \`hi = mid\`.
- Using \`mid = (lo + hi) // 2\` together with \`lo = mid\`; when \`hi = lo + 1\` this loops forever. Round up instead.
- Applying binary search to unsorted data or a non-monotonic predicate.
- Integer overflow in languages with fixed-size integers: compute \`lo + (hi - lo) / 2\` in Java or C++.`,
      practice: [
        { title: 'Binary search', kind: 'problem', ref: 'binary-search' },
        { title: 'Integer square root', kind: 'problem', ref: 'integer-square-root' },
        { title: 'Count occurrences', kind: 'exercise', prompt: 'Given a sorted array with duplicates and a value x, count how many times x appears in O(log n) using two binary searches (lower and upper bound).' },
      ],
      resources: [
        { title: 'Binary search', url: 'https://www.khanacademy.org/computing/computer-science/algorithms/binary-search/a/binary-search', source: 'Khan Academy', kind: 'course' },
        { title: 'Binary search', url: 'https://cp-algorithms.com/num_methods/binary_search.html', source: 'cp-algorithms', kind: 'article' },
        { title: 'bisect: array bisection algorithm', url: 'https://docs.python.org/3/library/bisect.html', source: 'Python Software Foundation', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Number of steps',
          prompt: 'About how many comparisons does binary search need in the worst case for a sorted array of 1,000,000 elements?',
          options: [
            { id: 'a', text: 'About 20' },
            { id: 'b', text: 'About 1,000' },
            { id: 'c', text: 'About 500,000' },
          ],
          correct: ['a'],
          explanation: '2^20 is about 1,048,576, so about 20 halvings reduce the range to a single element.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Infinite loop',
          prompt: 'With `while lo < hi`, `mid = (lo + hi) // 2` and the update `lo = mid` when the check passes, what can happen when `hi == lo + 1`?',
          options: [
            { id: 'a', text: 'The loop ends early with the wrong answer' },
            { id: 'b', text: 'mid equals lo, so lo = mid makes no progress and the loop never ends' },
            { id: 'c', text: 'An index error' },
          ],
          correct: ['b'],
          explanation: 'Rounding down gives mid = lo. Use `mid = (lo + hi + 1) // 2` whenever the update is `lo = mid`.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Monotonic predicate',
          prompt: 'Binary search on the answer only works if the yes/no condition changes value at most once across the search range.',
          options: TF,
          correct: ['true'],
          explanation: 'Discarding half the range is only safe if all values on one side of mid are known to give the same answer, which requires a monotonic predicate.',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Lower bound in Python',
          prompt: 'The standard-library function `bisect.____(a, x)` returns the first index i where `a[i] >= x`.',
          accepted: [['bisect_left']],
          explanation: '`bisect_left` returns the leftmost insertion point, which is the lower bound. `bisect_right` returns the first index with `a[i] > x`.',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Search on the answer',
          prompt: 'Which problems can be solved by binary searching over the answer? Select all that apply.',
          options: [
            { id: 'a', text: 'Smallest ship capacity that delivers all packages within D days' },
            { id: 'b', text: 'Integer square root of x' },
            { id: 'c', text: 'First bad version among n versions' },
            { id: 'd', text: 'Checking whether a string is a palindrome' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Each of the first three has a yes/no check that flips once as the candidate grows. A palindrome check has no such search space.',
        },
      ],
    },
    // ------------------------------------------------------------------ 9
    {
      slug: 'stacks-queues',
      title: 'Stacks and queues',
      module: 'Linear data structures',
      skill: 'stacks-queues',
      minutes: 50,
      objectives: [
        'Describe LIFO and FIFO behaviour and the O(1) operations of stacks and queues',
        'Implement a stack with a list and a queue with a deque',
        'Use a stack to match brackets and evaluate postfix expressions',
        'Recognise where queues appear: BFS, scheduling and buffering',
      ],
      body: `A **stack** is last-in, first-out (LIFO): you \`push\` onto the top and \`pop\` from the top. A **queue** is first-in, first-out (FIFO): you \`enqueue\` at the back and \`dequeue\` from the front. Both support their core operations in O(1).

| Structure | Python | JavaScript |
|---|---|---|
| Stack | \`list\` with \`append\` / \`pop()\` | \`Array\` with \`push\` / \`pop\` |
| Queue | \`collections.deque\` with \`append\` / \`popleft()\` | array plus a head index, or a linked list |

Avoid \`list.pop(0)\` in Python and \`Array.prototype.shift()\` in JavaScript for queues on large inputs: they shift every remaining element, which can cost O(n) per dequeue. A \`deque\` is O(1) at both ends.

\`\`\`python
from collections import deque
q = deque()
q.append(1); q.append(2)
q.popleft()        # 1  (FIFO)

stack = []
stack.append(1); stack.append(2)
stack.pop()        # 2  (LIFO)
\`\`\`

### Worked example: valid parentheses

The most recently opened bracket must close first, which is exactly LIFO.

\`\`\`python
def is_valid(s):
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    for ch in s:
        if ch in "([{":
            stack.append(ch)
        elif not stack or stack.pop() != pairs[ch]:
            return False
    return not stack           # leftovers mean unclosed brackets

print(is_valid("([]){}"))      # True
print(is_valid("([)]"))        # False
\`\`\`

\`\`\`javascript
function isValid(s) {
  const pairs = { ')': '(', ']': '[', '}': '{' };
  const stack = [];
  for (const ch of s) {
    if ('([{'.includes(ch)) stack.push(ch);
    else if (stack.pop() !== pairs[ch]) return false;
  }
  return stack.length === 0;
}
\`\`\`

**Complexity:** O(n) time, O(n) space in the worst case.

### Postfix evaluation

In reverse Polish notation (\`2 1 + 3 *\`), push numbers; on an operator pop **b then a** and push \`a op b\`. Order matters for \`-\` and \`/\`.

### Queues and breadth-first search

A queue processes items in arrival order, which is why BFS uses one: it visits all nodes at distance 1 before any at distance 2. You will use this for shortest paths in grids.

### Monotonic stacks (preview)

Keeping a stack whose values are always increasing (pop while the new value is smaller) answers "next smaller/greater element" for every index in O(n) total, because each index is pushed and popped at most once.

### Common mistakes
- Popping from an empty stack. Check \`if not stack\` first (JavaScript's \`pop\` returns \`undefined\`, which can hide the bug).
- Forgetting the final "stack must be empty" check in bracket matching.
- Using \`list.pop(0)\` or \`shift()\` as a queue in a hot loop.
- Reversing operand order when evaluating postfix subtraction or division.`,
      practice: [
        { title: 'Valid parentheses', kind: 'problem', ref: 'valid-parentheses' },
        { title: 'Evaluate reverse Polish notation', kind: 'problem', ref: 'evaluate-rpn' },
        { title: 'Shortest path in a grid (queue-based BFS)', kind: 'problem', ref: 'grid-shortest-path' },
      ],
      resources: [
        { title: 'Linked list, stack, queue and deque', url: 'https://visualgo.net/en/list', source: 'VisuAlgo', kind: 'interactive' },
        { title: 'collections.deque', url: 'https://docs.python.org/3/library/collections.html#collections.deque', source: 'Python Software Foundation', kind: 'docs' },
        { title: 'Stack (abstract data type)', url: 'https://en.wikipedia.org/wiki/Stack_(abstract_data_type)', source: 'Wikipedia', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Order of removal',
          prompt: 'You push 1, 2, 3 onto a stack and then pop twice. Which values come out, in order?',
          options: [
            { id: 'a', text: '1 then 2' },
            { id: 'b', text: '3 then 2' },
            { id: 'c', text: '3 then 1' },
          ],
          correct: ['b'],
          explanation: 'A stack is LIFO: the last value pushed (3) is popped first, then 2.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Python queue choice',
          prompt: 'In Python, `list.pop(0)` is an efficient O(1) way to dequeue from a large queue.',
          options: TF,
          correct: ['false'],
          explanation: 'Removing from the front of a list shifts every other element, which is O(n). Use `collections.deque.popleft()`.',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Evaluate postfix',
          prompt: 'What is the value of the postfix expression `5 1 2 + 4 * + 3 -`? Answer with a number.',
          accepted: [['14']],
          explanation: '1 + 2 = 3; 3 * 4 = 12; 5 + 12 = 17; 17 - 3 = 14.',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'Structure for the job',
          prompt: 'Match each task to the structure it naturally uses.',
          pairs: {
            left: [
              { id: 'l1', text: 'Undo history in an editor' },
              { id: 'l2', text: 'Breadth-first search' },
              { id: 'l3', text: 'Adding and removing items at both the front and the back in O(1)' },
            ],
            right: [
              { id: 'r1', text: 'Stack (LIFO)' },
              { id: 'r2', text: 'Queue (FIFO)' },
              { id: 'r3', text: 'Deque (double-ended queue)' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3' },
          explanation: 'Undo reverses the latest action first (LIFO). BFS serves vertices in the order they were discovered (FIFO). A deque supports O(1) operations at both ends.',
        },
      ],
    },
    // ------------------------------------------------------------------ 10
    {
      slug: 'linked-lists',
      title: 'Linked lists',
      module: 'Linear data structures',
      skill: 'linked-lists',
      minutes: 50,
      objectives: [
        'Describe singly and doubly linked lists and compare them with arrays',
        'Traverse, insert and delete nodes by updating pointers',
        'Reverse a linked list iteratively in O(n) time and O(1) space',
        'Use dummy heads and fast/slow pointers to simplify list problems',
      ],
      body: `A **linked list** is a chain of nodes. Each node holds a value and a reference to the next node (and, in a **doubly** linked list, to the previous one). The list is accessed through its **head**.

\`\`\`python
class Node:
    def __init__(self, val, next=None):
        self.val = val
        self.next = next

head = Node(1, Node(2, Node(3)))     # 1 -> 2 -> 3 -> None
\`\`\`

### Arrays versus linked lists

| Operation | Array | Linked list |
|---|---|---|
| Access element i | O(1) | O(i), walk from head |
| Insert or delete at front | O(n) | O(1) |
| Insert or delete after a known node | O(n) | O(1) |
| Memory | compact, cache-friendly | extra pointer per node |

Linked lists shine when you insert and remove at known positions often (queues, LRU caches with a hash map), and lose when you need random access.

### Traversal and deletion

\`\`\`python
def print_list(head):
    node = head
    while node:
        print(node.val, end=" ")
        node = node.next

def delete_value(head, target):
    dummy = Node(0, head)            # dummy head removes the "delete the head" special case
    prev = dummy
    while prev.next:
        if prev.next.val == target:
            prev.next = prev.next.next
        else:
            prev = prev.next
    return dummy.next
\`\`\`

### Worked example: reverse a linked list

Walk the list once, turning each \`next\` pointer around. Save the next node **before** overwriting the pointer.

\`\`\`python
def reverse(head):
    prev, cur = None, head
    while cur:
        nxt = cur.next      # 1. remember the rest
        cur.next = prev     # 2. point backwards
        prev = cur          # 3. advance prev
        cur = nxt           # 4. advance cur
    return prev             # new head
\`\`\`

\`\`\`javascript
function reverse(head) {
  let prev = null, cur = head;
  while (cur) {
    const nxt = cur.next;
    cur.next = prev;
    prev = cur;
    cur = nxt;
  }
  return prev;
}
\`\`\`

Trace on \`1 -> 2 -> 3\`: after step one \`1 -> None\`, then \`2 -> 1\`, then \`3 -> 2\`; \`prev\` ends at 3, giving \`3 -> 2 -> 1\`. **Complexity:** O(n) time and O(1) extra space. A recursive version is shorter but uses O(n) stack.

### Fast and slow pointers

Move \`slow\` one step and \`fast\` two steps. When \`fast\` reaches the end, \`slow\` is at the middle. If the list has a cycle, \`fast\` eventually meets \`slow\` (Floyd's cycle detection), using O(1) space.

### Common mistakes
- Overwriting \`cur.next\` before saving it, which loses the rest of the list.
- Dereferencing \`None\`/\`null\`: always check \`node\` (and \`node.next\` for fast pointers) before accessing fields.
- Forgetting to return the new head after operations that may change it.
- Special-casing the head everywhere instead of using a dummy node.`,
      practice: [
        { title: 'Reverse a linked list', kind: 'problem', ref: 'reverse-linked-list' },
        { title: 'Merge two sorted arrays (same idea as merging sorted lists)', kind: 'problem', ref: 'merge-sorted-arrays' },
        { title: 'Middle of the list', kind: 'exercise', prompt: 'Build a linked list from input values and print the middle value using fast and slow pointers (for even length, print the second middle).' },
      ],
      resources: [
        { title: 'Linked list visualisation', url: 'https://visualgo.net/en/list', source: 'VisuAlgo', kind: 'interactive' },
        { title: 'Linked list', url: 'https://en.wikipedia.org/wiki/Linked_list', source: 'Wikipedia', kind: 'article' },
        { title: 'CS50x Week 5: Data Structures', url: 'https://cs50.harvard.edu/x/2024/weeks/5/', source: 'Harvard CS50', kind: 'video' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Access cost',
          prompt: 'What is the cost of reading the k-th element of a singly linked list, given only the head?',
          options: [
            { id: 'a', text: 'O(1)' },
            { id: 'b', text: 'O(k)' },
            { id: 'c', text: 'O(log k)' },
          ],
          correct: ['b'],
          explanation: 'You must follow k next pointers from the head; there is no address arithmetic as in arrays.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Reversal order of steps',
          prompt: 'In iterative reversal, which step must happen before `cur.next = prev`?',
          options: [
            { id: 'a', text: '`prev = cur`' },
            { id: 'b', text: '`nxt = cur.next`' },
            { id: 'c', text: '`cur = nxt`' },
          ],
          correct: ['b'],
          explanation: 'Once `cur.next` is overwritten, the rest of the list is unreachable unless you saved it first.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Dummy head',
          prompt: 'A dummy head node lets you delete the first real node with the same code you use for any other node.',
          options: TF,
          correct: ['true'],
          explanation: 'Every real node, including the first, now has a predecessor, so deletion is always `prev.next = prev.next.next`.',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Fast and slow pointers',
          prompt: 'Which tasks can fast and slow pointers solve in O(1) extra space? Select all that apply.',
          options: [
            { id: 'a', text: 'Find the middle node' },
            { id: 'b', text: 'Detect whether the list has a cycle' },
            { id: 'c', text: 'Sort the list' },
            { id: 'd', text: 'Find the k-th node from the end (with a k-step head start)' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'Different speeds or a fixed gap locate the middle, detect cycles and find the k-th from the end. Sorting needs a real algorithm such as merge sort.',
        },
      ],
    },
    // ------------------------------------------------------------------ 11
    {
      slug: 'trees-traversals',
      title: 'Trees and traversals',
      module: 'Trees',
      skill: 'trees',
      minutes: 60,
      milestone: true,
      completionCriteria: 'Pass the quiz (70%+) and complete the tree height and level-order exercises.',
      objectives: [
        'Use tree vocabulary: root, child, leaf, height, depth and subtree',
        'Implement preorder, inorder and postorder traversals recursively',
        'Implement level-order traversal with a queue',
        'Solve tree problems by combining answers from left and right subtrees',
        'State the time and space cost of tree traversals',
      ],
      body: `A **tree** is a hierarchy of nodes with one **root**, where every other node has exactly one **parent**. Nodes without children are **leaves**. In a **binary tree** each node has at most two children, \`left\` and \`right\`. The **depth** of a node is its distance from the root; the **height** of a tree is the number of nodes on the longest root-to-leaf path (some texts count edges instead, so define it when you answer).

\`\`\`python
class TreeNode:
    def __init__(self, val, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

#        1
#       / \\
#      2   3
#     / \\
#    4   5
root = TreeNode(1, TreeNode(2, TreeNode(4), TreeNode(5)), TreeNode(3))
\`\`\`

### Depth-first traversals

The three classic orders differ only in **when** the node itself is visited:

\`\`\`python
def preorder(n, out):    # node, left, right   -> 1 2 4 5 3
    if n:
        out.append(n.val); preorder(n.left, out); preorder(n.right, out)

def inorder(n, out):     # left, node, right   -> 4 2 5 1 3
    if n:
        inorder(n.left, out); out.append(n.val); inorder(n.right, out)

def postorder(n, out):   # left, right, node   -> 4 5 2 3 1
    if n:
        postorder(n.left, out); postorder(n.right, out); out.append(n.val)
\`\`\`

Preorder is handy for copying or serialising a tree, inorder visits a binary search tree in sorted order, and postorder computes answers that depend on children first (sizes, heights, deleting a tree).

### Breadth-first (level-order) traversal

Use a queue to visit the tree level by level:

\`\`\`python
from collections import deque

def level_order(root):
    if not root:
        return []
    levels, q = [], deque([root])
    while q:
        level = []
        for _ in range(len(q)):          # exactly the nodes of this level
            n = q.popleft()
            level.append(n.val)
            if n.left: q.append(n.left)
            if n.right: q.append(n.right)
        levels.append(level)
    return levels        # [[1], [2, 3], [4, 5]]
\`\`\`

### Worked example: height of a tree

Most tree problems follow one recipe: **solve for the left subtree, solve for the right subtree, combine**. The empty tree is the base case.

\`\`\`python
def height(n):
    if n is None:
        return 0
    return 1 + max(height(n.left), height(n.right))

print(height(root))   # 3
\`\`\`

\`\`\`javascript
function height(n) {
  if (n === null) return 0;
  return 1 + Math.max(height(n.left), height(n.right));
}
\`\`\`

**Complexity:** every traversal visits each node once: O(n) time. Recursive DFS uses O(h) stack space, where h is the height: O(log n) for a balanced tree but O(n) for a degenerate, list-like tree. BFS uses O(w) space, where w is the maximum width of a level.

### Common mistakes
- Forgetting the \`None\`/\`null\` base case and crashing on missing children.
- Confusing depth (from the root down) with height (from a node to its deepest leaf).
- Assuming a binary tree is balanced; a skewed tree makes recursion depth O(n) and can overflow the stack.
- In level-order traversal, reading \`len(q)\` inside the loop condition instead of fixing it at the start of each level.`,
      practice: [
        { title: 'Tree height', kind: 'exercise', prompt: 'Read a binary tree given in level order (use -1 for a missing child), build it, and print its height using recursion.' },
        { title: 'Level-order traversal', kind: 'exercise', prompt: 'For the same input format, print each level of the tree on its own line using a queue.' },
        { title: 'Stretch: depth-first search on a grid', kind: 'problem', ref: 'number-of-islands' },
      ],
      resources: [
        { title: 'Tree traversal', url: 'https://en.wikipedia.org/wiki/Tree_traversal', source: 'Wikipedia', kind: 'article' },
        { title: 'Binary search tree visualisation (includes traversals)', url: 'https://visualgo.net/en/bst', source: 'VisuAlgo', kind: 'interactive' },
        { title: 'MIT 6.006 Introduction to Algorithms (Spring 2020)', url: 'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/', source: 'MIT OpenCourseWare', kind: 'course' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'matching',
          title: 'Traversal orders',
          prompt: 'For the tree with root 1, left child 2 (children 4 and 5) and right child 3, match each traversal to its output.',
          pairs: {
            left: [
              { id: 'l1', text: 'Preorder' },
              { id: 'l2', text: 'Inorder' },
              { id: 'l3', text: 'Postorder' },
              { id: 'l4', text: 'Level order' },
            ],
            right: [
              { id: 'r1', text: '1 2 4 5 3' },
              { id: 'r2', text: '4 2 5 1 3' },
              { id: 'r3', text: '4 5 2 3 1' },
              { id: 'r4', text: '1 2 3 4 5' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'Preorder visits the node first, inorder between subtrees, postorder last, and level order goes row by row.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Level-order structure',
          prompt: 'Which data structure does level-order (breadth-first) traversal use?',
          options: [
            { id: 'a', text: 'Stack' },
            { id: 'b', text: 'Queue' },
            { id: 'c', text: 'Hash set' },
          ],
          correct: ['b'],
          explanation: 'A FIFO queue ensures nodes are processed in the order they were discovered, which is level by level.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Recursion depth',
          prompt: 'What is the worst-case recursion depth of a recursive DFS on a binary tree with n nodes?',
          options: [
            { id: 'a', text: 'O(log n)' },
            { id: 'b', text: 'O(n)' },
            { id: 'c', text: 'O(1)' },
          ],
          correct: ['b'],
          explanation: 'A skewed tree is effectively a linked list of height n. Only balanced trees guarantee O(log n) depth.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Inorder and BSTs',
          prompt: 'An inorder traversal of a binary search tree visits the keys in sorted order.',
          options: TF,
          correct: ['true'],
          explanation: 'All keys in the left subtree are smaller and all in the right are larger, so left-node-right yields increasing order.',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'Height recurrence',
          prompt: 'Complete the recurrence: `height(node) = 1 + ____(height(node.left), height(node.right))`, with `height(None) = 0`.',
          accepted: [['max', 'Math.max']],
          explanation: 'The height is determined by the taller subtree, plus one for the current node.',
        },
      ],
    },
  ],
};

export const dsaAdvanced: SeedTrack = {
  slug: 'dsa-advanced',
  title: 'Advanced Data Structures and Algorithms',
  category: 'dsa',
  summary: 'Go beyond the basics with search trees, heaps, graph algorithms, greedy methods, backtracking and dynamic programming.',
  description: `**Who it's for:** learners who have finished *Data Structures and Algorithms Essentials* (or are comfortable with recursion, hashing, sorting, binary search and tree traversals) and want to tackle medium and hard interview problems.

**Prerequisites:** the *dsa-essentials* track.

**You will be able to:**
- use binary search trees and heaps, and know what balanced trees guarantee
- model problems as graphs and apply BFS, DFS, cycle detection, Dijkstra's algorithm and topological sort
- recognise when a greedy choice is safe and prove it with an exchange argument
- enumerate configurations with backtracking and prune the search
- turn a recursive brute force into an efficient memoized or tabulated solution

**Milestones:** *Graph traversal* (topic 3) and *Dynamic programming* (topic 7).

Every topic has a full lesson with Python and JavaScript examples, complexity analysis, a quiz, and CodeLab problems to practise on.`,
  level: 'advanced',
  estimatedHours: 44,
  roles: ['software engineer', 'backend developer', 'full-stack developer', 'sde intern'],
  contentStatus: 'complete',
  prerequisites: ['dsa-essentials'],
  topics: [
    // ------------------------------------------------------------------ 1
    {
      slug: 'binary-search-trees',
      title: 'Binary search trees',
      module: 'Trees and heaps',
      skill: 'bst',
      minutes: 50,
      objectives: [
        'State the BST ordering property and why it applies to whole subtrees',
        'Implement search and insert in O(h) time and describe the three deletion cases',
        'Validate a BST by passing value bounds down the tree or by checking its inorder sequence',
        'Explain why balance matters and what self-balancing trees guarantee',
      ],
      body: `A **binary search tree** (BST) is a binary tree in which, for every node, **all** keys in its left subtree are smaller than its key and **all** keys in its right subtree are larger. Searching follows a single path from the root, discarding half of the remaining tree at each step when the tree is balanced, just like binary search.

### Search and insert

\`\`\`python
class Node:
    def __init__(self, val):
        self.val, self.left, self.right = val, None, None

def search(node, key):
    while node and node.val != key:
        node = node.left if key < node.val else node.right
    return node                      # None if absent

def insert(root, key):
    if root is None:
        return Node(key)
    cur = root
    while True:
        if key < cur.val:
            if cur.left is None:
                cur.left = Node(key); break
            cur = cur.left
        else:
            if cur.right is None:
                cur.right = Node(key); break
            cur = cur.right
    return root
\`\`\`

Both cost **O(h)**, where h is the height. **Deletion** has three cases: a leaf (remove it), a node with one child (replace it with that child), or a node with two children (copy in the **inorder successor**, the smallest key of the right subtree, then delete that successor).

### Inorder traversal gives sorted order

Visiting left subtree, node, right subtree lists a BST's keys in increasing order. That gives two ways to **validate** a tree:

\`\`\`javascript
function isBST(node, low = -Infinity, high = Infinity) {
  if (!node) return true;
  if (node.val <= low || node.val >= high) return false;
  return isBST(node.left, low, node.val) && isBST(node.right, node.val, high);
}
\`\`\`

Each node must lie strictly inside the interval set by **all** its ancestors. The alternative is an inorder traversal that checks every key is larger than the previous one. Both are O(n) time.

### Balance

| Insertion order | Shape | Height | Search |
|---|---|---|---|
| random | bushy | O(log n) expected | O(log n) expected |
| sorted (1, 2, 3, ...) | a chain | n | O(n) |

**Self-balancing** trees (AVL, red-black) rotate nodes after updates to keep h = O(log n) in the worst case. They power ordered maps such as Java's \`TreeMap\` and C++'s \`std::map\`, which also answer "next larger key" and range queries that hash maps cannot. Python has no built-in balanced BST; a sorted list with \`bisect\` or a heap often suffices.

### Common mistakes
- Validating by comparing each node only with its children. In \`5 4 6 null null 3 7\` every parent-child pair is ordered, but 3 sits in the right subtree of 5.
- Using sentinels such as \`-2**31\` for the bounds when a node may hold that value; use infinity or \`None\`.
- Allowing duplicates without a rule for where they go.
- Assuming O(log n) operations without balancing.`,
      practice: [
        { title: 'Validate a binary search tree', kind: 'problem', ref: 'validate-bst' },
        { title: 'Kth largest element (compare with an inorder walk of a BST)', kind: 'problem', ref: 'kth-largest' },
        { title: 'BST delete', kind: 'exercise', prompt: 'Implement delete(root, key) handling the leaf, one-child and two-children cases. Test it by deleting every key of a random tree in random order and checking the inorder sequence after each step.' },
      ],
      resources: [
        { title: 'Binary search tree visualisation', url: 'https://visualgo.net/en/bst', source: 'VisuAlgo', kind: 'interactive' },
        { title: 'Binary search tree', url: 'https://en.wikipedia.org/wiki/Binary_search_tree', source: 'Wikipedia', kind: 'article' },
        { title: 'Self-balancing binary search tree', url: 'https://en.wikipedia.org/wiki/Self-balancing_binary_search_tree', source: 'Wikipedia', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Degenerate BST',
          prompt: 'Inserting the keys 1, 2, 3, ..., n in order into an unbalanced BST produces a tree of height:',
          options: [
            { id: 'a', text: 'O(log n)' },
            { id: 'b', text: 'O(n)' },
            { id: 'c', text: 'O(1)' },
            { id: 'd', text: 'O(n log n)' },
          ],
          correct: ['b'],
          explanation: 'Each new key becomes the right child of the previous one, forming a chain of length n, so search degrades to O(n).',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Local check',
          prompt: 'A binary tree is a valid BST if every node is greater than its left child and smaller than its right child.',
          options: TF,
          correct: ['false'],
          explanation: 'The ordering must hold for entire subtrees. A grandchild can violate it even when every parent-child pair looks fine, as in `5 4 6 null null 3 7`.',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Sorted traversal',
          prompt: 'Which traversal (preorder, inorder or postorder) visits the keys of a BST in increasing order?',
          accepted: [['inorder', 'in-order', 'in order']],
          explanation: 'Inorder visits the left subtree, then the node, then the right subtree, which for a BST is exactly smaller keys, the key, then larger keys.',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'Two-children delete',
          prompt: 'When deleting a node with two children, which key is usually copied into it before removing a node lower down?',
          options: [
            { id: 'a', text: 'Its parent' },
            { id: 'b', text: 'Its inorder successor, the minimum of its right subtree' },
            { id: 'c', text: 'The root' },
            { id: 'd', text: 'Its left child' },
          ],
          correct: ['b'],
          explanation: 'The inorder successor is larger than everything on the left and smaller than everything else on the right, so it can take the deleted key\'s place. It has no left child, so removing it afterwards is an easy case. The inorder predecessor works symmetrically.',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'What balanced BSTs offer',
          prompt: 'Which operations does a balanced BST (such as a red-black tree) support in O(log n) worst-case time? Select all that apply.',
          options: [
            { id: 'a', text: 'Insert a key' },
            { id: 'b', text: 'Find the smallest key greater than x' },
            { id: 'c', text: 'Delete a key' },
            { id: 'd', text: 'Find the k-th largest key with no extra information stored in the nodes' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Insert, delete and successor queries each follow one root-to-leaf path. Order statistics such as the k-th largest need subtree sizes stored in each node; without them you must walk the tree in O(k + log n) or worse.',
        },
      ],
    },
    // ------------------------------------------------------------------ 2
    {
      slug: 'heaps-priority-queues',
      title: 'Heaps and priority queues',
      module: 'Trees and heaps',
      skill: 'heaps',
      minutes: 50,
      objectives: [
        'Describe the heap property and its array representation, including parent and child indexes',
        'Use heapq (or a hand-written heap in JavaScript) and state the cost of push, pop and heapify',
        'Solve top-k and k-th smallest or largest problems with a bounded heap or a k-way merge',
        'Simulate a max-heap with a min-heap and break ties safely',
      ],
      body: `A **binary heap** is a complete binary tree stored in an array where every parent is no larger than its children (a **min-heap**). The smallest element is always at index 0. For index \`i\`, the children are \`2i + 1\` and \`2i + 2\` and the parent is \`(i - 1) // 2\`. Only the root is guaranteed to be the minimum; the rest of the array is not sorted.

| Operation | Cost | How |
|---|---|---|
| peek min | O(1) | read \`heap[0]\` |
| push | O(log n) | append, then **sift up** while smaller than the parent |
| pop min | O(log n) | move the last element to the root, then **sift down** |
| heapify a list | O(n) | sift down every internal node, bottom up |

### Python's heapq

\`heapq\` is a min-heap on a plain list. For a max-heap, push negated keys. Tuples compare element by element, so \`(priority, counter, item)\` gives a stable tie-break and avoids comparing items that do not support \`<\`.

\`\`\`python
import heapq

def k_largest(nums, k):            # keep only the k largest seen so far
    heap = []
    for x in nums:
        heapq.heappush(heap, x)
        if len(heap) > k:
            heapq.heappop(heap)     # drop the smallest
    return heap[0]                  # k-th largest; O(n log k) time, O(k) space
\`\`\`

### Worked example: k-way merge

To find the k-th smallest value in a matrix whose rows are sorted, treat each row as a sorted list. The next smallest value overall is the front of some row, so keep one entry per row in a heap:

\`\`\`python
def kth_smallest(matrix, k):
    heap = [(row[0], r, 0) for r, row in enumerate(matrix)]
    heapq.heapify(heap)                         # O(n)
    for _ in range(k - 1):
        v, r, c = heapq.heappop(heap)
        if c + 1 < len(matrix[r]):
            heapq.heappush(heap, (matrix[r][c + 1], r, c + 1))
    return heap[0][0]                           # O(n + k log n)
\`\`\`

The same pattern merges k sorted lists, and heaps also drive schedulers, running medians (a max-heap and a min-heap) and Dijkstra's algorithm.

### JavaScript

JavaScript has no built-in heap. The core is two loops:

\`\`\`javascript
function push(h, x) {
  h.push(x);
  let i = h.length - 1;
  while (i > 0 && h[(i - 1) >> 1] > h[i]) {
    const p = (i - 1) >> 1;
    [h[p], h[i]] = [h[i], h[p]];
    i = p;
  }
}
// pop: save h[0], move the last element to index 0, then swap it with its
// smaller child until neither child is smaller.
\`\`\`

### Common mistakes
- Expecting the heap list to be sorted; only \`heap[0]\` is guaranteed.
- Pushing \`(priority, obj)\` where objects are not comparable; ties then raise a TypeError. Add a counter.
- Using a max-heap of all n elements for top-k (O(n log n)) when a size-k min-heap gives O(n log k).
- Forgetting to negate values back when simulating a max-heap.`,
      practice: [
        { title: 'Kth smallest in a sorted matrix', kind: 'problem', ref: 'kth-smallest-sorted-matrix' },
        { title: 'Kth largest element', kind: 'problem', ref: 'kth-largest' },
        { title: 'Top k frequent elements', kind: 'problem', ref: 'top-k-frequent' },
      ],
      resources: [
        { title: 'heapq: heap queue algorithm', url: 'https://docs.python.org/3/library/heapq.html', source: 'Python Software Foundation', kind: 'docs' },
        { title: 'Binary heap visualisation', url: 'https://visualgo.net/en/heap', source: 'VisuAlgo', kind: 'interactive' },
        { title: 'Binary heap', url: 'https://en.wikipedia.org/wiki/Binary_heap', source: 'Wikipedia', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Children index',
          prompt: 'In a 0-indexed array heap, where are the children of index i?',
          options: [
            { id: 'a', text: '2i and 2i + 1' },
            { id: 'b', text: '2i + 1 and 2i + 2' },
            { id: 'c', text: 'i + 1 and i + 2' },
          ],
          correct: ['b'],
          explanation: 'With 0-based indexing the left child is 2i + 1 and the right child is 2i + 2; the parent of i is (i - 1) // 2.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Heapify cost',
          prompt: '`heapq.heapify` turns an arbitrary list into a heap in O(n) time.',
          options: TF,
          correct: ['true'],
          explanation: 'Bottom-up construction sifts down from the middle of the array. Most nodes are near the bottom and move only a little, so the total work sums to O(n), not O(n log n).',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Top-k cost',
          prompt: 'What is the time complexity of finding the k-th largest of n numbers with a min-heap that never holds more than k elements?',
          options: [
            { id: 'a', text: 'O(n log n)' },
            { id: 'b', text: 'O(n log k)' },
            { id: 'c', text: 'O(k log n)' },
            { id: 'd', text: 'O(n k)' },
          ],
          correct: ['b'],
          explanation: 'Each of the n elements causes at most one push and one pop on a heap of size k, each O(log k).',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'Heap operations',
          prompt: 'Match each operation on a binary heap of n elements to its cost.',
          pairs: {
            left: [
              { id: 'l1', text: 'Peek at the minimum' },
              { id: 'l2', text: 'Push a value' },
              { id: 'l3', text: 'Build a heap from an unordered list' },
              { id: 'l4', text: 'Search for an arbitrary value' },
            ],
            right: [
              { id: 'r1', text: 'O(1)' },
              { id: 'r2', text: 'O(log n)' },
              { id: 'r3', text: 'O(n) total' },
              { id: 'r4', text: 'O(n), the heap is not sorted' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'The minimum sits at index 0, push sifts up one path, heapify is linear, and arbitrary search has no order to exploit, so it scans the array.',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'Max-heap trick',
          prompt: 'To use Python\'s min-heap `heapq` as a max-heap of numbers, push each value multiplied by ____.',
          accepted: [['-1', 'negative one', 'minus one']],
          explanation: 'Negating reverses the order, so the largest original value becomes the smallest key. Negate again when you pop.',
        },
      ],
    },
    // ------------------------------------------------------------------ 3
    {
      slug: 'graphs-bfs-dfs',
      title: 'Graphs: BFS and DFS',
      module: 'Graphs',
      skill: 'graphs',
      minutes: 60,
      milestone: true,
      completionCriteria: 'Solve "Number of islands" and "Shortest path in a grid".',
      objectives: [
        'Represent graphs with adjacency lists and recognise implicit graphs such as grids',
        'Implement breadth-first and depth-first search with a visited set, iteratively',
        'Count connected components and use BFS for shortest paths in unweighted graphs',
        'Detect cycles in directed graphs with three-colour DFS',
      ],
      body: `A **graph** is a set of vertices joined by edges, which may be directed or undirected. Store it as an **adjacency list** (a list or dict of neighbour lists), which takes O(V + E) space. An adjacency matrix takes O(V^2) and only pays off for dense graphs. Many problems hide a graph: in a grid, each cell is a vertex joined to its up, down, left and right neighbours.

### BFS: layers and shortest paths

**Breadth-first search** explores in layers using a queue, so in an unweighted graph the first time it reaches a vertex is along a path with the fewest edges.

\`\`\`python
from collections import deque

def bfs(graph, start):
    dist = {start: 0}
    q = deque([start])
    while q:
        u = q.popleft()
        for v in graph[u]:
            if v not in dist:        # mark when enqueued, not when dequeued
                dist[v] = dist[u] + 1
                q.append(v)
    return dist
\`\`\`

### DFS: reachability, components and cycles

**Depth-first search** goes as deep as possible before backtracking. An explicit stack avoids recursion limits on large inputs:

\`\`\`javascript
function countComponents(n, adj) {        // vertices 0..n-1, undirected
  const seen = new Array(n).fill(false);
  let count = 0;
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    count++;
    seen[s] = true;
    const stack = [s];
    while (stack.length) {
      const u = stack.pop();
      for (const v of adj[u]) if (!seen[v]) { seen[v] = true; stack.push(v); }
    }
  }
  return count;
}
\`\`\`

Both traversals cost **O(V + E)**: each vertex is processed once and each edge examined once (twice if undirected).

### Cycles in directed graphs

In a directed graph, reaching an already visited vertex does **not** mean there is a cycle: in the diamond 1 to 2, 1 to 3, 2 to 4, 3 to 4, vertex 4 is reached twice. Use three colours: **white** (unvisited), **grey** (on the current DFS path) and **black** (finished). An edge to a grey vertex points back to an ancestor and closes a cycle; an edge to a black vertex does not. In an undirected graph, a cycle exists when DFS meets a visited vertex other than the parent it came from.

| Task | Tool |
|---|---|
| fewest edges between two vertices | BFS |
| connected components, flood fill | BFS or DFS |
| directed cycle detection, ordering | DFS with colours (or Kahn's algorithm) |

### Common mistakes
- Marking vertices visited when dequeued instead of enqueued, so the same vertex enters the queue many times.
- Forgetting bounds checks or the visited mark on grids.
- Recursive DFS on a 1000 x 1000 grid, which overflows the call stack; use an explicit stack.
- Using an undirected "visited" check to find cycles in a directed graph.`,
      practice: [
        { title: 'Number of islands', kind: 'problem', ref: 'number-of-islands' },
        { title: 'Shortest path in a grid', kind: 'problem', ref: 'grid-shortest-path' },
        { title: 'Detect a cycle in a directed graph', kind: 'problem', ref: 'directed-graph-cycle' },
      ],
      resources: [
        { title: 'Graph traversal (DFS/BFS) visualisation', url: 'https://visualgo.net/en/dfsbfs', source: 'VisuAlgo', kind: 'interactive' },
        { title: 'Breadth-first search', url: 'https://cp-algorithms.com/graph/breadth-first-search.html', source: 'cp-algorithms', kind: 'article' },
        { title: 'Depth first search', url: 'https://cp-algorithms.com/graph/depth-first-search.html', source: 'cp-algorithms', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Unweighted shortest path',
          prompt: 'Which traversal finds shortest paths (fewest edges) in an unweighted graph?',
          options: [
            { id: 'a', text: 'Depth-first search' },
            { id: 'b', text: 'Breadth-first search' },
            { id: 'c', text: 'Either, always' },
          ],
          correct: ['b'],
          explanation: 'BFS processes vertices in nondecreasing order of distance, so the first time it reaches a vertex is via a shortest path. DFS may reach it first along a long detour.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Traversal cost',
          prompt: 'What is the time complexity of BFS on a graph stored as adjacency lists?',
          options: [
            { id: 'a', text: 'O(V + E)' },
            { id: 'b', text: 'O(V^2)' },
            { id: 'c', text: 'O(E log V)' },
          ],
          correct: ['a'],
          explanation: 'Each vertex is enqueued once and each edge is examined once (twice for undirected graphs).',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'When to mark visited',
          prompt: 'In BFS, marking a vertex as visited when it is enqueued prevents it from being added to the queue more than once.',
          options: TF,
          correct: ['true'],
          explanation: 'If you mark on dequeue instead, several neighbours can enqueue the same vertex before it is processed.',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'Grey vertices',
          prompt: 'During three-colour DFS on a directed graph, you follow an edge u to v and v is grey. What does that mean?',
          options: [
            { id: 'a', text: 'v was fully explored earlier, so nothing special happened' },
            { id: 'b', text: 'v is an ancestor of u on the current path, so the graph has a cycle' },
            { id: 'c', text: 'v is unreachable from the start vertex' },
            { id: 'd', text: 'The graph is disconnected' },
          ],
          correct: ['b'],
          explanation: 'Grey vertices are exactly those on the current recursion path. An edge back to one of them, plus the path from it down to u, forms a directed cycle.',
        },
        {
          key: 'q5',
          type: 'matching',
          title: 'Pick the representation or tool',
          prompt: 'Match each situation to the best choice.',
          pairs: {
            left: [
              { id: 'l1', text: 'Sparse graph with 10^5 vertices' },
              { id: 'l2', text: 'Minimum number of moves in a maze' },
              { id: 'l3', text: 'Count separate regions of land on a map' },
              { id: 'l4', text: 'Check whether task dependencies contain a loop' },
            ],
            right: [
              { id: 'r1', text: 'Adjacency list' },
              { id: 'r2', text: 'BFS from the start cell' },
              { id: 'r3', text: 'Run BFS or DFS from every unvisited land cell and count the runs' },
              { id: 'r4', text: 'Three-colour DFS on the directed graph' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'A matrix for 10^5 vertices needs 10^10 cells, BFS gives fewest moves, each traversal from a new start covers one component, and directed cycles need the grey/black distinction.',
        },
      ],
    },
    // ------------------------------------------------------------------ 4
    {
      slug: 'shortest-paths-topological-sort',
      title: 'Shortest paths and topological sort',
      module: 'Graphs',
      skill: 'shortest-paths',
      minutes: 60,
      objectives: [
        'Choose between BFS, Dijkstra and Bellman-Ford based on edge weights',
        'Implement Dijkstra\'s algorithm with a priority queue and lazy deletion of stale entries',
        'Produce a topological order of a DAG with Kahn\'s algorithm, including a deterministic smallest-first order',
        'Use topological sorting to detect cycles in dependency graphs',
      ],
      body: `### Dijkstra's algorithm

When every edge weight is **non-negative**, Dijkstra's algorithm finds shortest paths from one source. It keeps tentative distances and repeatedly settles the unsettled vertex with the smallest one, taken from a min-heap. Because weights are non-negative, no later path can make a settled vertex cheaper.

\`\`\`python
import heapq

def dijkstra(n, adj, src):            # adj[u] = [(v, w), ...], vertices 1..n
    INF = float("inf")
    dist = [INF] * (n + 1)
    dist[src] = 0
    pq = [(0, src)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue                  # stale entry: u was already improved
        for v, w in adj[u]:
            if d + w < dist[v]:       # relax the edge
                dist[v] = d + w
                heapq.heappush(pq, (dist[v], v))
    return dist
\`\`\`

Pushing a new entry instead of decreasing a key ("lazy deletion") is simplest; the \`d > dist[u]\` check discards outdated entries. The cost is **O((V + E) log V)**.

| Edge weights | Algorithm | Time |
|---|---|---|
| all equal (unweighted) | BFS | O(V + E) |
| non-negative | Dijkstra with a heap | O((V + E) log V) |
| may be negative | Bellman-Ford (also detects negative cycles) | O(V E) |

### Topological sort

A **topological order** of a directed acyclic graph (DAG) lists vertices so every edge goes from earlier to later: course prerequisites, build steps, spreadsheet formulas. **Kahn's algorithm** repeatedly outputs a vertex with in-degree 0 and removes its outgoing edges. If some vertices are never output, they lie on or behind a cycle, so no order exists.

Many orders may be valid. Keeping the available vertices in a **min-heap** instead of a queue always picks the smallest label, which gives the unique lexicographically smallest order:

\`\`\`javascript
// edges: [a, b] means a must come before b; vertices 1..n
function smallestTopo(n, edges) {
  const adj = Array.from({ length: n + 1 }, () => []);
  const indeg = new Array(n + 1).fill(0);
  for (const [a, b] of edges) { adj[a].push(b); indeg[b]++; }
  const ready = [];                       // used as a min-heap
  for (let v = 1; v <= n; v++) if (indeg[v] === 0) ready.push(v);
  const order = [];
  while (ready.length) {
    ready.sort((x, y) => y - x);          // simple version; use a real heap for large n
    const u = ready.pop();                // smallest available
    order.push(u);
    for (const v of adj[u]) if (--indeg[v] === 0) ready.push(v);
  }
  return order.length === n ? order : null; // null means a cycle
}
\`\`\`

With a FIFO queue Kahn's algorithm runs in O(V + E); with a heap it is O((V + E) log V). A DFS-based alternative appends each vertex when it finishes and reverses the list at the end.

### Common mistakes
- Running Dijkstra with negative edge weights; the settled distances can be wrong.
- Forgetting to skip stale heap entries, which repeats work and can blow up the running time.
- Printing \`Infinity\` instead of the required marker (such as -1) for unreachable vertices.
- Using a plain queue when the problem asks for the smallest order, or not checking that every vertex was output.`,
      practice: [
        { title: "Shortest paths with Dijkstra's algorithm", kind: 'problem', ref: 'dijkstra-shortest-paths' },
        { title: 'Task order (topological sort)', kind: 'problem', ref: 'task-order-topological' },
        { title: 'Shortest path in a grid (unweighted, so BFS)', kind: 'problem', ref: 'grid-shortest-path' },
      ],
      resources: [
        { title: 'Dijkstra algorithm', url: 'https://cp-algorithms.com/graph/dijkstra.html', source: 'cp-algorithms', kind: 'article' },
        { title: 'Topological sorting', url: 'https://cp-algorithms.com/graph/topological-sort.html', source: 'cp-algorithms', kind: 'article' },
        { title: 'Single-source shortest paths visualisation', url: 'https://visualgo.net/en/sssp', source: 'VisuAlgo', kind: 'interactive' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Dijkstra precondition',
          prompt: 'Dijkstra\'s algorithm is guaranteed correct when:',
          options: [
            { id: 'a', text: 'The graph is undirected' },
            { id: 'b', text: 'All edge weights are non-negative' },
            { id: 'c', text: 'The graph has no cycles' },
          ],
          correct: ['b'],
          explanation: 'Once a vertex is settled, Dijkstra assumes no later path can be shorter, which fails if negative edges exist.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Cycle detection',
          prompt: 'If Kahn\'s algorithm outputs fewer than n vertices, the directed graph contains a cycle.',
          options: TF,
          correct: ['true'],
          explanation: 'Vertices on a cycle never reach in-degree 0, so they, and everything that depends on them, are never output.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Stale entries',
          prompt: 'In lazy-deletion Dijkstra you pop `(d, u)` and find `d > dist[u]`. What should you do?',
          options: [
            { id: 'a', text: 'Update `dist[u] = d`' },
            { id: 'b', text: 'Skip it, because a shorter path to u was already processed' },
            { id: 'c', text: 'Stop the algorithm' },
            { id: 'd', text: 'Push it back into the heap' },
          ],
          correct: ['b'],
          explanation: 'The entry was pushed before u\'s distance improved. Relaxing u\'s edges again with the larger d cannot help, so it is discarded.',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'Choose the algorithm',
          prompt: 'Match each graph to the simplest correct single-source shortest path algorithm.',
          pairs: {
            left: [
              { id: 'l1', text: 'Every edge has weight 1' },
              { id: 'l2', text: 'Road network with positive travel times' },
              { id: 'l3', text: 'Currency exchange graph with some negative weights' },
            ],
            right: [
              { id: 'r1', text: 'BFS' },
              { id: 'r2', text: 'Dijkstra' },
              { id: 'r3', text: 'Bellman-Ford' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3' },
          explanation: 'Equal weights make BFS layers equal distances, non-negative weights allow Dijkstra, and negative weights need Bellman-Ford, which also reports negative cycles.',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'Smallest order',
          prompt: 'For 4 tasks with rules `4 before 1` and `2 before 3`, what is the lexicographically smallest valid order? Write the four numbers separated by spaces.',
          accepted: [['2 3 4 1', '2,3,4,1', '2, 3, 4, 1']],
          explanation: 'Initially 2 and 4 are available; take 2, which makes 3 available. Now 3 and 4 are available; take 3, then 4, then 1. A FIFO queue would give 2 4 3 1 instead.',
        },
      ],
    },
    // ------------------------------------------------------------------ 5
    {
      slug: 'greedy-algorithms',
      title: 'Greedy algorithms',
      module: 'Algorithm design',
      skill: 'greedy',
      minutes: 45,
      objectives: [
        'Describe the greedy strategy and the greedy-choice property',
        'Solve activity selection by sorting on end time and justify it with an exchange argument',
        'Recognise counterexamples where plausible greedy rules fail',
        'Analyse the cost of sort-then-scan greedy solutions',
      ],
      body: `A **greedy algorithm** builds a solution step by step, always taking the choice that looks best right now and never undoing it. Greedy solutions are short and fast, usually a sort followed by one scan, but they are only correct when the problem has the **greedy-choice property**: some optimal solution begins with the greedy choice, and what remains is a smaller instance of the same problem.

### Worked example: activity selection

Choose the maximum number of non-overlapping activities in one room (an activity may start exactly when another ends). Sort by **end** time and take each activity that starts no earlier than the last chosen one ends.

\`\`\`python
def max_activities(acts):            # acts = [(start, end), ...]
    count, last_end = 0, float("-inf")
    for start, end in sorted(acts, key=lambda a: a[1]):
        if start >= last_end:
            count += 1
            last_end = end
    return count

print(max_activities([(1, 4), (3, 5), (0, 6), (5, 7), (8, 9), (5, 9)]))  # 3
\`\`\`

\`\`\`javascript
function maxActivities(acts) {
  acts.sort((a, b) => a[1] - b[1]);
  let count = 0, lastEnd = -Infinity;
  for (const [s, e] of acts) if (s >= lastEnd) { count++; lastEnd = e; }
  return count;
}
\`\`\`

**Complexity:** O(n log n) for the sort plus O(n) for the scan.

### Proving it: the exchange argument

Let \`g\` be the activity that ends first, and take any optimal schedule. Replace its first activity with \`g\`. Since \`g\` ends no later, it cannot overlap anything else in the schedule, so the result is still valid and just as large. Hence an optimal schedule starts with \`g\`, and the same argument repeats on the activities that start after \`g\` ends.

### When greedy fails

| Plausible rule | Counterexample | Greedy | Best |
|---|---|---|---|
| shortest activity first | (1, 5), (4, 7), (6, 10) | 1 | 2 |
| earliest start first | (0, 10), (1, 2), (3, 4) | 1 | 2 |
| largest coin first, coins 1, 3, 4 | amount 6 | 4 + 1 + 1 | 3 + 3 |
| best value per weight, 0/1 knapsack | capacity 10: (6, 30), (5, 20), (5, 20) | 30 | 40 |

Coin change with arbitrary coins and the 0/1 knapsack need dynamic programming. Always test a greedy idea against small cases, ideally against a brute force, before trusting it.

Other classic greedy algorithms include merging intervals after sorting by start, Huffman coding, and Kruskal's and Prim's minimum spanning tree algorithms. Dijkstra's algorithm is greedy too.

### Common mistakes
- Sorting by start time or duration for activity selection.
- Using \`>\` instead of \`>=\` when touching intervals are allowed (or the reverse when they are not).
- Assuming greedy works for coin change because it works for 1, 5, 10 and 25.
- Skipping the proof: a greedy rule that passes the sample can still fail hidden tests.`,
      practice: [
        { title: 'Activity selection', kind: 'problem', ref: 'activity-selection' },
        { title: 'Merge intervals', kind: 'problem', ref: 'merge-intervals' },
        { title: 'Best time to buy and sell stock', kind: 'problem', ref: 'best-time-to-buy-sell-stock' },
        { title: 'Coin change (where greedy fails)', kind: 'problem', ref: 'coin-change' },
      ],
      resources: [
        { title: 'Greedy algorithm', url: 'https://en.wikipedia.org/wiki/Greedy_algorithm', source: 'Wikipedia', kind: 'article' },
        { title: 'Activity selection problem', url: 'https://en.wikipedia.org/wiki/Activity_selection_problem', source: 'Wikipedia', kind: 'article' },
        { title: 'Interval scheduling', url: 'https://en.wikipedia.org/wiki/Interval_scheduling', source: 'Wikipedia', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Activity selection key',
          prompt: 'To maximise the number of non-overlapping intervals greedily, sort them by:',
          options: [
            { id: 'a', text: 'Start time' },
            { id: 'b', text: 'End time' },
            { id: 'c', text: 'Length' },
          ],
          correct: ['b'],
          explanation: 'Choosing the interval that ends first leaves the most time for the remaining intervals; an exchange argument proves it optimal.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Coins and greedy',
          prompt: 'Taking the largest coin that fits always gives the fewest coins, whatever the coin denominations are.',
          options: TF,
          correct: ['false'],
          explanation: 'With coins 1, 3 and 4 and amount 6, greedy uses 4 + 1 + 1 (three coins) while 3 + 3 uses two. Greedy works for some coin systems, such as 1, 5, 10, 25, but not in general.',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Run the greedy',
          prompt: 'Activities (1, 3), (2, 5), (3, 6), (5, 8), (6, 9) may touch at endpoints. How many can be scheduled at most? Answer with a number.',
          accepted: [['3']],
          explanation: 'Sorted by end: (1, 3) is taken, (2, 5) overlaps, (3, 6) starts at 3 and is taken, (5, 8) overlaps, (6, 9) starts at 6 and is taken: 3 activities.',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Greedy or not?',
          prompt: 'For which problems is a simple greedy rule known to give an optimal answer? Select all that apply.',
          options: [
            { id: 'a', text: 'Maximum number of non-overlapping intervals' },
            { id: 'b', text: '0/1 knapsack, taking the best value per weight first' },
            { id: 'c', text: 'Merging overlapping intervals after sorting by start' },
            { id: 'd', text: 'Fewest coins for arbitrary denominations' },
          ],
          correct: ['a', 'c'],
          explanation: 'Interval scheduling and interval merging have provably correct greedy solutions. The 0/1 knapsack and general coin change can be beaten by other choices and need dynamic programming.',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'Exchange argument',
          prompt: 'What does an exchange argument show for a greedy algorithm?',
          options: [
            { id: 'a', text: 'That the algorithm runs in O(n log n)' },
            { id: 'b', text: 'That swapping the greedy choice into any optimal solution keeps it optimal, so some optimal solution makes the greedy choice' },
            { id: 'c', text: 'That every optimal solution is identical to the greedy one' },
            { id: 'd', text: 'That greedy is faster than dynamic programming' },
          ],
          correct: ['b'],
          explanation: 'It proves the greedy choice is always safe. Optimal solutions need not be unique; the argument only shows one of them agrees with the greedy choice at each step.',
        },
      ],
    },
    // ------------------------------------------------------------------ 6
    {
      slug: 'backtracking',
      title: 'Backtracking',
      module: 'Algorithm design',
      skill: 'backtracking',
      minutes: 50,
      objectives: [
        'Structure a backtracking search as choose, explore, un-choose',
        'Generate subsets, permutations and combinations in a canonical order',
        'Skip duplicate results when the input contains repeated values',
        'Prune branches early and estimate the size of the search tree',
      ],
      body: `**Backtracking** explores a tree of choices recursively. At each step you **choose** an option, **explore** everything that follows from it, then **un-choose** it and try the next option. It enumerates every valid configuration, so it is exponential, but **pruning** (abandoning a branch as soon as it cannot lead to a valid answer) often makes it fast enough.

### Template

\`\`\`python
def backtrack(state):
    if is_complete(state):
        record(state)
        return
    for choice in candidates(state):
        if not valid(state, choice):
            continue                 # prune
        apply(state, choice)         # choose
        backtrack(state)             # explore
        undo(state, choice)          # un-choose
\`\`\`

### Subsets and permutations

\`\`\`python
def subsets(nums):                    # 2^n results
    out, path = [], []
    def go(i):
        if i == len(nums):
            out.append(path[:])       # copy, because path keeps changing
            return
        path.append(nums[i]); go(i + 1)   # include nums[i]
        path.pop();           go(i + 1)   # exclude nums[i]
    go(0)
    return out
\`\`\`

For permutations, track which indexes are used. Sorting first and trying candidates in index order produces permutations in **lexicographic order** for free. If the input has duplicates, skip index \`i\` when \`nums[i] == nums[i - 1]\` and \`i - 1\` is not in use; this forces equal values to be placed left to right, so each distinct permutation appears once:

\`\`\`javascript
function uniquePerms(nums) {
  nums.sort((a, b) => a - b);             // numeric sort, not string sort
  const used = new Array(nums.length).fill(false), path = [], out = [];
  (function go() {
    if (path.length === nums.length) { out.push(path.join(' ')); return; }
    for (let i = 0; i < nums.length; i++) {
      if (used[i] || (i > 0 && nums[i] === nums[i - 1] && !used[i - 1])) continue;
      used[i] = true; path.push(nums[i]);
      go();
      path.pop(); used[i] = false;
    }
  })();
  return out;
}
\`\`\`

### Pruning: N-Queens

Placing one queen per row and tracking attacked columns and both diagonals (\`r - c\` and \`r + c\`) in sets makes each check O(1) and cuts attacked squares immediately. The search visits far fewer than the n^n raw placements.

| Search | Results | Typical cost |
|---|---|---|
| subsets of n items | 2^n | O(n * 2^n) |
| permutations of n items | n! | O(n * n!) |
| combinations of k from n | C(n, k) | O(k * C(n, k)) |

These sizes tell you the limits: n of about 20 for subsets and about 10 for permutations.

### Common mistakes
- Appending \`path\` instead of a copy, so every saved result ends up as the same (empty) list.
- Forgetting the un-choose step, which leaks state into sibling branches.
- Sorting numbers as strings in JavaScript (\`[10, 2].sort()\` gives \`[10, 2]\`).
- Deduplicating with a set after generating all n! orders instead of pruning duplicates during the search.`,
      practice: [
        { title: 'Unique permutations', kind: 'problem', ref: 'unique-permutations' },
        { title: 'N-Queens (count solutions)', kind: 'problem', ref: 'n-queens-count' },
        { title: 'Combination sum', kind: 'exercise', prompt: 'Given distinct positive integers and a target, print every combination (numbers may repeat) that sums to the target, each in non-decreasing order. Prune as soon as the running sum exceeds the target.' },
      ],
      resources: [
        { title: 'Backtracking', url: 'https://en.wikipedia.org/wiki/Backtracking', source: 'Wikipedia', kind: 'article' },
        { title: 'Eight queens puzzle', url: 'https://en.wikipedia.org/wiki/Eight_queens_puzzle', source: 'Wikipedia', kind: 'article' },
        { title: 'Recursion and backtracking visualisation', url: 'https://visualgo.net/en/recursion', source: 'VisuAlgo', kind: 'interactive' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Saving results',
          prompt: 'Why does the subsets code append `path[:]` instead of `path`?',
          options: [
            { id: 'a', text: 'Slicing is faster' },
            { id: 'b', text: 'Because `path` keeps changing; appending the same list object would make every saved result identical' },
            { id: 'c', text: 'Lists cannot be appended to lists' },
          ],
          correct: ['b'],
          explanation: 'All references would point to the one `path` list, which is empty when the search finishes. A copy freezes the current state.',
        },
        {
          key: 'q2',
          type: 'fill_blank',
          title: 'Number of subsets',
          prompt: 'How many subsets does a set of 10 distinct elements have? Answer with a number.',
          accepted: [['1024']],
          explanation: 'Each element is either in or out, giving 2^10 = 1024 subsets, including the empty set.',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Distinct permutations',
          prompt: 'How many distinct permutations does the list `1 1 2 2` have? Answer with a number.',
          accepted: [['6']],
          explanation: '4! / (2! * 2!) = 24 / 4 = 6: 1122, 1212, 1221, 2112, 2121, 2211.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Free lexicographic order',
          prompt: 'If the input is sorted and the backtracking loop tries candidates in increasing index order, permutations are generated in lexicographic order.',
          options: TF,
          correct: ['true'],
          explanation: 'The first position takes the smallest available value first, and the same holds recursively for each later position, which is exactly lexicographic order.',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Good pruning',
          prompt: 'Which of these are valid pruning rules? Select all that apply.',
          options: [
            { id: 'a', text: 'N-Queens: skip a column already attacked by a queen in an earlier row' },
            { id: 'b', text: 'Combination sum with positive numbers: stop extending once the running sum exceeds the target' },
            { id: 'c', text: 'Unique permutations: skip a value equal to the previous one whose index is not in use' },
            { id: 'd', text: 'Subsets: stop after finding the first subset' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'The first three discard only branches that cannot produce new valid answers. Stopping early in (d) would miss results the problem asks for.',
        },
      ],
    },
    // ------------------------------------------------------------------ 7
    {
      slug: 'dynamic-programming',
      title: 'Dynamic programming',
      module: 'Algorithm design',
      skill: 'dynamic-programming',
      minutes: 75,
      milestone: true,
      completionCriteria: 'Solve "Coin change" and "Longest common subsequence".',
      objectives: [
        'Identify overlapping subproblems and optimal substructure',
        'Define a DP state, recurrence, base cases and evaluation order',
        'Convert memoized recursion into bottom-up tabulation and reduce memory to one or two rows',
        'Apply classic patterns: 1-D sequences (LIS), 2-D strings (edit distance) and 0/1 knapsack',
      ],
      body: `**Dynamic programming** (DP) solves problems whose answers are built from answers to smaller **overlapping** subproblems. Instead of recomputing them, compute each one once and store it. Design a DP in four steps:

1. **State:** what does \`dp[i]\` (or \`dp[i][j]\`) mean, in words?
2. **Recurrence:** how is a state computed from smaller states?
3. **Base cases:** the smallest states, answered directly.
4. **Order:** compute states so their dependencies are ready (or memoize a recursion).

### Memoization versus tabulation

\`\`\`python
from functools import lru_cache

@lru_cache(maxsize=None)
def ways(n):                     # climbing stairs, 1 or 2 steps at a time
    return 1 if n <= 1 else ways(n - 1) + ways(n - 2)
\`\`\`

Top-down memoization is the recursion plus a cache. Bottom-up tabulation fills an array in dependency order and avoids recursion limits. Both evaluate each state once.

### 1-D: longest increasing subsequence

State: \`dp[i]\` = length of the longest strictly increasing subsequence ending at \`i\`; \`dp[i] = 1 + max(dp[j])\` over \`j < i\` with \`a[j] < a[i]\`. That is O(n^2). A faster O(n log n) method keeps \`tails[L]\`, the smallest possible last value of an increasing subsequence of length L + 1, and binary-searches it for each element.

### 2-D: edit distance

\`dp[i][j]\` = edits to turn \`a[:i]\` into \`b[:j]\`. Base cases \`dp[i][0] = i\` and \`dp[0][j] = j\`.

\`\`\`javascript
function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]); // replace, delete, insert
    }
    prev = cur;
  }
  return prev[b.length];          // O(len(a) * len(b)) time, O(len(b)) space
}
\`\`\`

Each row reads only the previous row, so two rows suffice. The longest common subsequence has the same shape.

### 0/1 knapsack

\`best[c]\` = best value with capacity \`c\`. For each item \`(w, v)\`, loop \`c\` **downwards** so each item is used at most once:

\`\`\`python
def knapsack(items, W):
    best = [0] * (W + 1)
    for w, v in items:
        for c in range(W, w - 1, -1):
            best[c] = max(best[c], best[c - w] + v)
    return best[W]               # O(n * W) time, O(W) space
\`\`\`

Looping upwards would let an item be reused, which solves the unbounded version (like coin change) instead.

| Problem | State | Time |
|---|---|---|
| coin change | fewest coins for amount a | O(amount * coins) |
| LIS | best length ending at i | O(n^2), or O(n log n) |
| edit distance, LCS | prefixes i and j | O(n m) |
| 0/1 knapsack | best value at capacity c | O(n W) |

### Common mistakes
- A vague state definition; write it as a sentence before coding.
- Wrong base cases, such as forgetting that an amount of 0 needs 0 coins.
- Iterating in an order that reads states before they are computed.
- Looping capacity upwards in 0/1 knapsack, or reusing a row you have already overwritten.`,
      practice: [
        { title: 'Climbing stairs', kind: 'problem', ref: 'climbing-stairs' },
        { title: 'Coin change (minimum coins)', kind: 'problem', ref: 'coin-change' },
        { title: 'Longest common subsequence', kind: 'problem', ref: 'longest-common-subsequence' },
        { title: 'Longest increasing subsequence', kind: 'problem', ref: 'longest-increasing-subsequence' },
        { title: 'Edit distance', kind: 'problem', ref: 'edit-distance' },
        { title: '0/1 knapsack', kind: 'problem', ref: 'knapsack-01' },
      ],
      resources: [
        { title: 'Introduction to dynamic programming', url: 'https://cp-algorithms.com/dynamic_programming/intro-to-dp.html', source: 'cp-algorithms', kind: 'article' },
        { title: 'Longest increasing subsequence', url: 'https://cp-algorithms.com/sequences/longest_increasing_subsequence.html', source: 'cp-algorithms', kind: 'article' },
        { title: 'Knapsack problem', url: 'https://en.wikipedia.org/wiki/Knapsack_problem', source: 'Wikipedia', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'multi',
          title: 'When DP applies',
          prompt: 'Which properties suggest dynamic programming? Select all that apply.',
          options: [
            { id: 'a', text: 'Overlapping subproblems' },
            { id: 'b', text: 'Optimal substructure' },
            { id: 'c', text: 'The input is sorted' },
            { id: 'd', text: 'A naive recursion recomputes the same calls' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'DP pays off when optimal answers are built from optimal sub-answers and the same subproblems recur. Sortedness is unrelated.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Knapsack loop direction',
          prompt: 'In the one-array 0/1 knapsack, why is the capacity loop run from W down to w?',
          options: [
            { id: 'a', text: 'It is faster' },
            { id: 'b', text: 'So `best[c - w]` still reflects only earlier items, and each item is used at most once' },
            { id: 'c', text: 'To find the smallest weight first' },
            { id: 'd', text: 'It makes no difference' },
          ],
          correct: ['b'],
          explanation: 'Going upwards, `best[c - w]` may already include the current item, so the item could be added again. That is the unbounded knapsack.',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Edit distance',
          prompt: 'What is the edit distance between `kitten` and `sitting` (insert, delete or replace, each costing 1)? Answer with a number.',
          accepted: [['3']],
          explanation: 'Replace k with s, replace e with i, and insert g at the end: 3 operations, and no 2-operation sequence works.',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'Match the recurrence',
          prompt: 'Match each problem to its recurrence.',
          pairs: {
            left: [
              { id: 'l1', text: 'Coin change (fewest coins)' },
              { id: 'l2', text: 'Longest increasing subsequence' },
              { id: 'l3', text: 'Edit distance when a[i-1] != b[j-1]' },
              { id: 'l4', text: '0/1 knapsack' },
            ],
            right: [
              { id: 'r1', text: 'best[a] = 1 + min(best[a - c]) over coins c' },
              { id: 'r2', text: 'dp[i] = 1 + max(dp[j]) over j < i with a[j] < a[i]' },
              { id: 'r3', text: 'dp[i][j] = 1 + min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])' },
              { id: 'r4', text: 'dp[i][c] = max(dp[i-1][c], dp[i-1][c - w_i] + v_i)' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'Each recurrence considers the last decision: the last coin, the previous element of the subsequence, the last edit, and whether item i is taken.',
        },
        {
          key: 'q5',
          type: 'true_false',
          title: 'Memoization versus tabulation',
          prompt: 'Memoized recursion and bottom-up tabulation of the same recurrence compute the same answers with the same asymptotic time.',
          options: TF,
          correct: ['true'],
          explanation: 'Both evaluate each state once. Tabulation avoids recursion overhead and depth limits; memoization only computes states that are actually needed.',
        },
      ],
    },
  ],
};
