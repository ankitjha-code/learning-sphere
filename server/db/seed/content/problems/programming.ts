import type { SeedProblem } from '../types';

const JS_READ = "const input = require('fs').readFileSync(0, 'utf8');\n";

export const programmingProblems: SeedProblem[] = [
  // ---------------------------------------------------------------- control flow and loops
  {
    slug: 'fizzbuzz',
    title: 'FizzBuzz',
    type: 'coding',
    difficulty: 'easy',
    skills: ['control-flow'],
    topics: ['loops', 'conditionals', 'modulo'],
    prompt: `Read an integer \`n\` and print the numbers from \`1\` to \`n\`, one per line, with these replacements:

- if the number is divisible by both 3 and 5, print \`FizzBuzz\`
- otherwise, if it is divisible by 3, print \`Fizz\`
- otherwise, if it is divisible by 5, print \`Buzz\`
- otherwise, print the number itself

**Input:** one line containing \`n\`.

**Output:** \`n\` lines.

**Example**

Input:
\`\`\`
5
\`\`\`
Output:
\`\`\`
1
2
Fizz
4
Buzz
\`\`\``,
    constraints: '1 ≤ n ≤ 100',
    hints: [
      'You need to visit every number from 1 to n. Which loop does that, and how do you make it include n?',
      'Use the remainder operator: a number k is divisible by 3 when k % 3 == 0.',
      'Check the "divisible by both" case first (k % 15 == 0), then 3, then 5, then fall back to printing k.',
    ],
    explanation:
      'Loop k from 1 to n inclusive (range(1, n + 1) in Python). The order of the checks matters: 15 is divisible by 3, so if you test 3 first you would print Fizz instead of FizzBuzz. Testing k % 15 == 0 first (or k % 3 == 0 and k % 5 == 0) fixes that.',
    starterCode: {
      python: 'n = int(input())\n# print 1..n with Fizz / Buzz / FizzBuzz replacements\n',
      javascript: "const n = Number(require('fs').readFileSync(0, 'utf8').trim());\n// print 1..n with Fizz / Buzz / FizzBuzz replacements\n",
    },
    visibleTests: [{ name: 'Example', input: '5\n', expected: '1\n2\nFizz\n4\nBuzz' }],
    hiddenTests: [
      { name: 'Smallest n', input: '1\n', expected: '1' },
      { name: 'First Fizz', input: '3\n', expected: '1\n2\nFizz' },
      { name: 'First FizzBuzz', input: '15\n', expected: '1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz' },
      { name: 'Past 15', input: '16\n', expected: '1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz\n16' },
    ],
    solutions: {
      python: String.raw`n = int(input())
for k in range(1, n + 1):
    if k % 15 == 0:
        print("FizzBuzz")
    elif k % 3 == 0:
        print("Fizz")
    elif k % 5 == 0:
        print("Buzz")
    else:
        print(k)
`,
      javascript: String.raw`const n = Number(require('fs').readFileSync(0, 'utf8').trim());
const out = [];
for (let k = 1; k <= n; k++) {
  if (k % 15 === 0) out.push('FizzBuzz');
  else if (k % 3 === 0) out.push('Fizz');
  else if (k % 5 === 0) out.push('Buzz');
  else out.push(String(k));
}
console.log(out.join('\n'));
`,
    },
  },
  {
    slug: 'grade-calculator',
    title: 'Grade calculator',
    type: 'coding',
    difficulty: 'easy',
    skills: ['control-flow'],
    topics: ['conditionals', 'input-validation'],
    prompt: `Read an integer exam score and print its letter grade:

| Score | Grade |
|---|---|
| 90 to 100 | \`A\` |
| 80 to 89 | \`B\` |
| 70 to 79 | \`C\` |
| 60 to 69 | \`D\` |
| 0 to 59 | \`F\` |

If the score is below 0 or above 100, print \`invalid\`.

**Input:** one line with an integer.

**Output:** one line: \`A\`, \`B\`, \`C\`, \`D\`, \`F\` or \`invalid\`.

**Example**

Input:
\`\`\`
85
\`\`\`
Output:
\`\`\`
B
\`\`\``,
    constraints: '-1000 ≤ score ≤ 1000',
    hints: [
      'Handle the invalid scores first so the rest of your checks only deal with 0 to 100.',
      'An if / elif / else chain stops at the first true condition, so you can check score >= 90, then score >= 80, and so on.',
      'if score < 0 or score > 100: invalid; elif score >= 90: A; elif score >= 80: B; elif score >= 70: C; elif score >= 60: D; else: F.',
    ],
    explanation:
      'Validate first, then test thresholds from highest to lowest. Because elif only runs when every earlier condition was false, "score >= 80" already implies the score is below 90, so you never need to write both bounds.',
    starterCode: {
      python: 'score = int(input())\n',
      javascript: "const score = Number(require('fs').readFileSync(0, 'utf8').trim());\n",
    },
    visibleTests: [
      { name: 'Example', input: '85\n', expected: 'B' },
      { name: 'Perfect score', input: '100\n', expected: 'A' },
    ],
    hiddenTests: [
      { name: 'Boundary 90', input: '90\n', expected: 'A' },
      { name: 'Boundary 89', input: '89\n', expected: 'B' },
      { name: 'Boundary 70', input: '70\n', expected: 'C' },
      { name: 'Boundary 60', input: '60\n', expected: 'D' },
      { name: 'Boundary 59', input: '59\n', expected: 'F' },
      { name: 'Zero', input: '0\n', expected: 'F' },
      { name: 'Too high', input: '101\n', expected: 'invalid' },
      { name: 'Negative', input: '-5\n', expected: 'invalid' },
    ],
    solutions: {
      python: String.raw`score = int(input())
if score < 0 or score > 100:
    print("invalid")
elif score >= 90:
    print("A")
elif score >= 80:
    print("B")
elif score >= 70:
    print("C")
elif score >= 60:
    print("D")
else:
    print("F")
`,
      javascript: String.raw`const score = Number(require('fs').readFileSync(0, 'utf8').trim());
let grade;
if (score < 0 || score > 100) grade = 'invalid';
else if (score >= 90) grade = 'A';
else if (score >= 80) grade = 'B';
else if (score >= 70) grade = 'C';
else if (score >= 60) grade = 'D';
else grade = 'F';
console.log(grade);
`,
    },
  },
  // ---------------------------------------------------------------- functions
  {
    slug: 'prime-checker',
    title: 'Prime checker',
    type: 'coding',
    difficulty: 'easy',
    skills: ['functions', 'control-flow'],
    topics: ['functions', 'loops', 'math'],
    prompt: `A **prime** is a whole number greater than 1 whose only divisors are 1 and itself. Write a function \`is_prime(n)\` and use it to classify several numbers.

**Input:** the first line contains \`t\`, the number of values. Each of the next \`t\` lines contains one integer \`n\`.

**Output:** for each value, print \`prime\` or \`not prime\` on its own line.

**Example**

Input:
\`\`\`
4
2
9
17
1
\`\`\`
Output:
\`\`\`
prime
not prime
prime
not prime
\`\`\``,
    constraints: '1 ≤ t ≤ 100; 0 ≤ n ≤ 10^9',
    hints: [
      'Numbers below 2 are never prime. Deal with them before any loop.',
      'Try dividing n by every d starting at 2. If any d divides n exactly (n % d == 0), n is not prime.',
      'You only need to test d while d * d <= n: if n had a divisor larger than its square root, it would also have one smaller. Return False as soon as you find a divisor, and True after the loop.',
    ],
    explanation:
      'Putting the test in its own function keeps the main loop short: read t, then for each value print "prime" if is_prime(n) else "not prime". Inside is_prime, checking divisors only up to the square root makes the largest input (about 10^9) need roughly 31,623 steps instead of a billion. The condition must be d * d <= n, not d * d < n, or perfect squares such as 25 and 49 would be reported as prime.',
    starterCode: {
      python: 'def is_prime(n):\n    # return True if n is prime, otherwise False\n    pass\n\n\nt = int(input())\nfor _ in range(t):\n    n = int(input())\n    # print the result for n\n',
      javascript:
        "function isPrime(n) {\n  // return true if n is prime, otherwise false\n}\n\nconst [t, ...nums] = require('fs').readFileSync(0, 'utf8').trim().split('\\n').map(Number);\n// print the result for each of the t numbers\n",
    },
    visibleTests: [{ name: 'Example', input: '4\n2\n9\n17\n1\n', expected: 'prime\nnot prime\nprime\nnot prime' }],
    hiddenTests: [
      { name: 'Zero, one and two', input: '3\n0\n1\n2\n', expected: 'not prime\nnot prime\nprime' },
      { name: 'Squares of primes', input: '3\n25\n49\n121\n', expected: 'not prime\nnot prime\nnot prime' },
      { name: 'Near 100', input: '2\n97\n100\n', expected: 'prime\nnot prime' },
      { name: 'Large prime', input: '1\n999999937\n', expected: 'prime' },
    ],
    solutions: {
      python: String.raw`def is_prime(n):
    if n < 2:
        return False
    d = 2
    while d * d <= n:
        if n % d == 0:
            return False
        d += 1
    return True


t = int(input())
for _ in range(t):
    n = int(input())
    print("prime" if is_prime(n) else "not prime")
`,
      javascript: String.raw`function isPrime(n) {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) {
    if (n % d === 0) return false;
  }
  return true;
}

const [t, ...nums] = require('fs').readFileSync(0, 'utf8').trim().split('\n').map(Number);
const out = [];
for (let i = 0; i < t; i++) out.push(isPrime(nums[i]) ? 'prime' : 'not prime');
console.log(out.join('\n'));
`,
    },
  },
  {
    slug: 'number-to-words',
    title: 'Number to words',
    type: 'coding',
    difficulty: 'medium',
    skills: ['functions', 'control-flow'],
    topics: ['functions', 'lookup-tables', 'strings'],
    prompt: `Read an integer \`n\` between 0 and 99 and print it in English words, all lowercase.

- 0 to 19 each have their own word: \`zero\`, \`one\`, ..., \`twelve\`, \`thirteen\`, ..., \`nineteen\`.
- Multiples of ten are \`twenty\`, \`thirty\`, \`forty\`, \`fifty\`, \`sixty\`, \`seventy\`, \`eighty\`, \`ninety\`.
- Other numbers from 21 to 99 join the tens word and the ones word with a hyphen, for example \`forty-two\`.

Note the spelling \`forty\` (no "u").

**Input:** one line with \`n\`.

**Output:** one line with the words.

**Example**

Input:
\`\`\`
42
\`\`\`
Output:
\`\`\`
forty-two
\`\`\``,
    constraints: '0 ≤ n ≤ 99',
    hints: [
      'Writing 100 if statements is not the answer. Which numbers have names that cannot be built from smaller parts?',
      'Store the 20 words for 0 to 19 in one list and the tens words in another, so ones[7] is "seven" and tens[4] is "forty".',
      'If n < 20, print ones[n]. Otherwise take t = n // 10 and u = n % 10; print tens[t] alone when u == 0, else tens[t] + "-" + ones[u].',
    ],
    explanation:
      'Lookup tables turn this into a few lines. A helper function such as to_words(n) keeps the logic reusable: you could later call it twice to build numbers up to 999. Floor division and modulo split n into its tens digit and ones digit, the same pattern used for converting minutes to hours.',
    starterCode: {
      python: 'def to_words(n):\n    # return n (0 to 99) in English words\n    pass\n\n\nprint(to_words(int(input())))\n',
      javascript: "function toWords(n) {\n  // return n (0 to 99) in English words\n}\n\nconsole.log(toWords(Number(require('fs').readFileSync(0, 'utf8').trim())));\n",
    },
    visibleTests: [
      { name: 'Example', input: '42\n', expected: 'forty-two' },
      { name: 'Single digit', input: '7\n', expected: 'seven' },
    ],
    hiddenTests: [
      { name: 'Zero', input: '0\n', expected: 'zero' },
      { name: 'Ten', input: '10\n', expected: 'ten' },
      { name: 'Teen', input: '13\n', expected: 'thirteen' },
      { name: 'Nineteen', input: '19\n', expected: 'nineteen' },
      { name: 'Twenty', input: '20\n', expected: 'twenty' },
      { name: 'Seventy', input: '70\n', expected: 'seventy' },
      { name: 'Eighty-one', input: '81\n', expected: 'eighty-one' },
      { name: 'Largest', input: '99\n', expected: 'ninety-nine' },
    ],
    solutions: {
      python: String.raw`ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
        "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
        "seventeen", "eighteen", "nineteen"]
TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]


def to_words(n):
    if n < 20:
        return ONES[n]
    t, u = n // 10, n % 10
    if u == 0:
        return TENS[t]
    return TENS[t] + "-" + ONES[u]


print(to_words(int(input())))
`,
      javascript: String.raw`const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function toWords(n) {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  return u === 0 ? TENS[t] : TENS[t] + '-' + ONES[u];
}

console.log(toWords(Number(require('fs').readFileSync(0, 'utf8').trim())));
`,
    },
  },
  // ---------------------------------------------------------------- lists
  {
    slug: 'max-and-min',
    title: 'Largest and smallest',
    type: 'coding',
    difficulty: 'easy',
    skills: ['collections'],
    topics: ['lists', 'loops'],
    prompt: `Read a list of integers and print the largest value followed by the smallest value.

Try it first with a loop that tracks the best values so far, then compare with the built-in \`max()\` and \`min()\`.

**Input:** one line of integers separated by spaces. There is at least one integer.

**Output:** one line: the largest value, a space, then the smallest value.

**Example**

Input:
\`\`\`
3 9 -2 7
\`\`\`
Output:
\`\`\`
9 -2
\`\`\``,
    constraints: '1 ≤ count ≤ 10^5; each value fits in -10^9 to 10^9',
    hints: [
      'Turn the line into a list of numbers first: split it on whitespace and convert each piece with int().',
      'Start both "largest" and "smallest" at the first element, not at 0. Why would 0 be wrong for a list like -3 -8?',
      'Loop over the rest of the list: if x > largest, update largest; if x < smallest, update smallest. Then print(largest, smallest).',
    ],
    explanation:
      'Initialising the trackers with the first element works for any list, including all-negative lists and lists of one element. The loop does a single pass, so it runs in O(n) time. Built-ins max(nums) and min(nums) do the same thing internally.',
    starterCode: {
      python: 'nums = [int(x) for x in input().split()]\n',
      javascript: "const nums = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/).map(Number);\n",
    },
    visibleTests: [
      { name: 'Example', input: '3 9 -2 7\n', expected: '9 -2' },
      { name: 'One value', input: '5\n', expected: '5 5' },
    ],
    hiddenTests: [
      { name: 'All negative', input: '-1 -8 -3\n', expected: '-1 -8' },
      { name: 'All equal', input: '4 4 4\n', expected: '4 4' },
      { name: 'Extremes', input: '1000000000 -1000000000 0\n', expected: '1000000000 -1000000000' },
    ],
    solutions: {
      python: String.raw`nums = [int(x) for x in input().split()]
largest = smallest = nums[0]
for x in nums[1:]:
    if x > largest:
        largest = x
    if x < smallest:
        smallest = x
print(largest, smallest)
`,
      javascript: String.raw`const nums = require('fs').readFileSync(0, 'utf8').trim().split(/\s+/).map(Number);
let largest = nums[0];
let smallest = nums[0];
for (const x of nums) {
  if (x > largest) largest = x;
  if (x < smallest) smallest = x;
}
console.log(largest + ' ' + smallest);
`,
    },
  },
  {
    slug: 'second-largest-distinct',
    title: 'Second largest distinct value',
    type: 'coding',
    difficulty: 'medium',
    skills: ['collections'],
    topics: ['lists', 'sets', 'edge-cases'],
    prompt: `Read a list of integers and print the **second largest distinct** value. Duplicates count once: in \`4 1 7 7 3\` the largest is 7 and the second largest distinct value is 4.

If there are fewer than two distinct values, print \`none\`.

**Input:** one line of integers separated by spaces (at least one).

**Output:** one line with the answer or \`none\`.

**Example**

Input:
\`\`\`
4 1 7 7 3
\`\`\`
Output:
\`\`\`
4
\`\`\``,
    constraints: '1 ≤ count ≤ 10^5; each value fits in -10^9 to 10^9',
    hints: [
      'Duplicates are the tricky part. Which collection type automatically removes them?',
      'Convert the list to a set. If the set has fewer than 2 elements, the answer is none.',
      'Either sort the distinct values and take the second from the end, or remove the maximum from the set and take the maximum of what remains.',
    ],
    explanation:
      'A set keeps one copy of each value, which matches the meaning of "distinct". sorted(set(nums))[-2] is short and clear. A single-pass alternative tracks first and second as you loop, updating second only when x is strictly between them. Either way, check the "fewer than two distinct values" case before indexing, or you will get an IndexError.',
    starterCode: {
      python: 'nums = [int(x) for x in input().split()]\n',
      javascript: "const nums = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/).map(Number);\n",
    },
    visibleTests: [
      { name: 'Example', input: '4 1 7 7 3\n', expected: '4' },
      { name: 'All the same', input: '5 5 5\n', expected: 'none' },
    ],
    hiddenTests: [
      { name: 'Single value', input: '10\n', expected: 'none' },
      { name: 'Negatives', input: '-3 -1 -2\n', expected: '-2' },
      { name: 'Two values', input: '2 9\n', expected: '2' },
      { name: 'Duplicated top two', input: '8 8 6 6 7\n', expected: '7' },
    ],
    solutions: {
      python: String.raw`nums = [int(x) for x in input().split()]
distinct = sorted(set(nums))
if len(distinct) < 2:
    print("none")
else:
    print(distinct[-2])
`,
      javascript: String.raw`const nums = require('fs').readFileSync(0, 'utf8').trim().split(/\s+/).map(Number);
const distinct = [...new Set(nums)].sort((a, b) => a - b);
console.log(distinct.length < 2 ? 'none' : String(distinct[distinct.length - 2]));
`,
    },
  },
  {
    slug: 'running-sum',
    title: 'Running sum',
    type: 'coding',
    difficulty: 'easy',
    skills: ['collections', 'control-flow'],
    topics: ['lists', 'accumulator', 'prefix-sums'],
    prompt: `Read a list of integers and print its **running sum**: the i-th output value is the sum of the first i input values.

**Input:** one line of integers separated by spaces (at least one).

**Output:** one line with the running sums separated by single spaces.

**Example**

Input:
\`\`\`
1 2 3 4
\`\`\`
Output:
\`\`\`
1 3 6 10
\`\`\`

(1, then 1 + 2, then 1 + 2 + 3, then 1 + 2 + 3 + 4.)`,
    constraints: '1 ≤ count ≤ 10^5; each value fits in -10^4 to 10^4',
    hints: [
      'You do not need to re-add everything for each position. What do you already know from the previous step?',
      'Keep a variable total that starts at 0. For each value, add it to total and record the new total.',
      'Collect the totals in a list, then print " ".join(str(t) for t in totals).',
    ],
    explanation:
      'This is the accumulator pattern: one variable carries the result forward through the loop. Each output is the previous output plus the current value, so the whole thing is a single O(n) pass. Running sums are also called prefix sums and are a building block for many array algorithms.',
    starterCode: {
      python: 'nums = [int(x) for x in input().split()]\n',
      javascript: "const nums = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/).map(Number);\n",
    },
    visibleTests: [{ name: 'Example', input: '1 2 3 4\n', expected: '1 3 6 10' }],
    hiddenTests: [
      { name: 'Single value', input: '5\n', expected: '5' },
      { name: 'Alternating signs', input: '3 -3 3 -3\n', expected: '3 0 3 0' },
      { name: 'Zeros', input: '0 0 0\n', expected: '0 0 0' },
      { name: 'Tens', input: '10 20 30 40 50\n', expected: '10 30 60 100 150' },
    ],
    solutions: {
      python: String.raw`nums = [int(x) for x in input().split()]
total = 0
totals = []
for x in nums:
    total += x
    totals.append(total)
print(" ".join(str(t) for t in totals))
`,
      javascript: String.raw`const nums = require('fs').readFileSync(0, 'utf8').trim().split(/\s+/).map(Number);
let total = 0;
const totals = nums.map((x) => (total += x));
console.log(totals.join(' '));
`,
    },
  },
  // ---------------------------------------------------------------- dictionaries and counting
  {
    slug: 'word-frequency',
    title: 'Word frequency',
    type: 'coding',
    difficulty: 'medium',
    skills: ['collections', 'strings'],
    topics: ['dictionaries', 'counting', 'sorting', 'strings'],
    prompt: `Count how often each word appears in a piece of text.

A **word** is a run of consecutive letters \`a\` to \`z\`, ignoring case. Every other character (spaces, digits, punctuation, line breaks) separates words, so \`Hello-world\` is two words and \`don't\` is the two words \`don\` and \`t\`.

**Input:** one or more lines of text.

**Output:** one line per distinct word in the form \`word count\`, with words in lowercase. Sort by count, highest first; break ties alphabetically. If there are no words, print nothing.

**Example**

Input:
\`\`\`
the cat and the hat
\`\`\`
Output:
\`\`\`
the 2
and 1
cat 1
hat 1
\`\`\``,
    constraints: 'Total input length ≤ 10^5 characters.',
    hints: [
      'Break the work into three steps: extract the words, count them, then sort the counts.',
      'Lowercase the whole text first. In Python, re.findall(r"[a-z]+", text) returns every run of letters; in JavaScript use text.match(/[a-z]+/g). Count with a dictionary (or collections.Counter / a Map).',
      'Sort the (word, count) pairs with a key that puts larger counts first and then compares words: key=lambda p: (-p[1], p[0]) in Python.',
    ],
    explanation:
      'A dictionary maps each word to its count: counts[w] = counts.get(w, 0) + 1. Reading all of standard input at once (sys.stdin.read() in Python) handles any number of lines. Sorting by the tuple (-count, word) gives "highest count first, then alphabetical" in a single sort, because tuples compare element by element.',
    starterCode: {
      python: 'import sys\n\ntext = sys.stdin.read()\n',
      javascript: JS_READ,
    },
    visibleTests: [
      { name: 'Example', input: 'the cat and the hat\n', expected: 'the 2\nand 1\ncat 1\nhat 1' },
      { name: 'Mixed case and punctuation', input: 'Go go GO! Stop. go\n', expected: 'go 4\nstop 1' },
    ],
    hiddenTests: [
      { name: 'Several lines', input: 'apple banana\nbanana cherry\ncherry banana\n', expected: 'banana 3\ncherry 2\napple 1' },
      { name: 'All tied', input: 'b a c b a c\n', expected: 'a 2\nb 2\nc 2' },
      { name: 'Hyphen splits words', input: 'Hello, world! Hello-world.\n', expected: 'hello 2\nworld 2' },
      { name: 'No words', input: '123 !!!\n', expected: '' },
    ],
    solutions: {
      python: String.raw`import re
import sys

text = sys.stdin.read().lower()
counts = {}
for word in re.findall(r"[a-z]+", text):
    counts[word] = counts.get(word, 0) + 1

for word, count in sorted(counts.items(), key=lambda p: (-p[1], p[0])):
    print(word, count)
`,
      javascript: String.raw`const text = require('fs').readFileSync(0, 'utf8').toLowerCase();
const counts = new Map();
for (const word of text.match(/[a-z]+/g) || []) {
  counts.set(word, (counts.get(word) || 0) + 1);
}
const rows = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
if (rows.length) console.log(rows.map(([w, c]) => w + ' ' + c).join('\n'));
`,
    },
  },
  // ---------------------------------------------------------------- strings
  {
    slug: 'palindrome-check',
    title: 'Palindrome check',
    type: 'coding',
    difficulty: 'easy',
    skills: ['strings'],
    topics: ['strings', 'normalization', 'two-pointers'],
    prompt: `A phrase is a **palindrome** if it reads the same forwards and backwards after you keep only letters and digits and ignore case. For example, \`A man, a plan, a canal: Panama\` becomes \`amanaplanacanalpanama\`, which is a palindrome.

If nothing is left after removing the other characters, treat it as a palindrome.

**Input:** one line of printable ASCII text.

**Output:** \`yes\` if it is a palindrome, otherwise \`no\`.

**Example**

Input:
\`\`\`
A man, a plan, a canal: Panama
\`\`\`
Output:
\`\`\`
yes
\`\`\``,
    constraints: 'Line length ≤ 10^5 characters.',
    hints: [
      'First build a cleaned-up version of the string, then worry about checking it.',
      'Keep a character only if it is a letter or digit (str.isalnum() in Python, /[a-z0-9]/i in JavaScript) and lowercase it.',
      'A string s is a palindrome when s == s[::-1]. In JavaScript compare s with s.split("").reverse().join("").',
    ],
    explanation:
      'Normalising the input first (filter, then lowercase) separates the messy part from the simple comparison. Reversing with slicing is the most readable check. A two-pointer loop that walks inwards from both ends does the same job without building a reversed copy. An empty cleaned string is equal to its reverse, so it counts as a palindrome automatically.',
    starterCode: {
      python: 'line = input()\n',
      javascript: "const line = require('fs').readFileSync(0, 'utf8').split('\\n')[0];\n",
    },
    visibleTests: [
      { name: 'Simple word', input: 'racecar\n', expected: 'yes' },
      { name: 'Example', input: 'A man, a plan, a canal: Panama\n', expected: 'yes' },
    ],
    hiddenTests: [
      { name: 'Not a palindrome', input: 'hello\n', expected: 'no' },
      { name: 'Quotes and spaces', input: "No 'x' in Nixon\n", expected: 'yes' },
      { name: 'Digits', input: '12321\n', expected: 'yes' },
      { name: 'Letter and digit', input: '0P\n', expected: 'no' },
      { name: 'Only punctuation', input: '!!!\n', expected: 'yes' },
      { name: 'Question', input: 'Was it a car or a cat I saw?\n', expected: 'yes' },
    ],
    solutions: {
      python: String.raw`line = input()
cleaned = "".join(c.lower() for c in line if c.isalnum())
print("yes" if cleaned == cleaned[::-1] else "no")
`,
      javascript: String.raw`const line = require('fs').readFileSync(0, 'utf8').split('\n')[0];
const cleaned = line.toLowerCase().replace(/[^a-z0-9]/g, '');
console.log(cleaned === cleaned.split('').reverse().join('') ? 'yes' : 'no');
`,
    },
  },
  {
    slug: 'count-vowels',
    title: 'Count the vowels',
    type: 'coding',
    difficulty: 'easy',
    skills: ['strings', 'control-flow'],
    topics: ['strings', 'loops', 'counting'],
    prompt: `Read one line of text and print how many vowels it contains. The vowels are \`a\`, \`e\`, \`i\`, \`o\` and \`u\`, in either upper or lower case. The letter \`y\` does not count.

**Input:** one line of text (it may be empty).

**Output:** one integer.

**Example**

Input:
\`\`\`
Hello World
\`\`\`
Output:
\`\`\`
3
\`\`\``,
    constraints: 'Line length ≤ 10^5 characters.',
    hints: [
      'Look at each character in turn and decide whether it is a vowel.',
      'Lowercase the character (or the whole line) first so you only need to check five letters.',
      'count = 0; for c in line.lower(): if c in "aeiou": count += 1. Then print(count).',
    ],
    explanation:
      'The membership test c in "aeiou" checks whether a single character appears in the vowel string. Lowercasing once up front avoids listing both cases. A compact alternative is sum(1 for c in line.lower() if c in "aeiou").',
    starterCode: {
      python: 'line = input()\n',
      javascript: "const line = require('fs').readFileSync(0, 'utf8').split('\\n')[0];\n",
    },
    visibleTests: [{ name: 'Example', input: 'Hello World\n', expected: '3' }],
    hiddenTests: [
      { name: 'No vowels', input: 'rhythm\n', expected: '0' },
      { name: 'Upper and lower case', input: 'AEIOU aeiou\n', expected: '10' },
      { name: 'Sentence', input: 'Programming is fun!\n', expected: '5' },
      { name: 'Vowel run', input: 'Queueing\n', expected: '5' },
      { name: 'Empty line', input: '\n', expected: '0' },
    ],
    solutions: {
      python: String.raw`line = input()
count = 0
for c in line.lower():
    if c in "aeiou":
        count += 1
print(count)
`,
      javascript: String.raw`const line = require('fs').readFileSync(0, 'utf8').split('\n')[0];
let count = 0;
for (const c of line.toLowerCase()) {
  if ('aeiou'.includes(c)) count++;
}
console.log(count);
`,
    },
  },
  {
    slug: 'reverse-words',
    title: 'Reverse the words',
    type: 'coding',
    difficulty: 'easy',
    skills: ['strings', 'collections'],
    topics: ['strings', 'split-join', 'lists'],
    prompt: `Read a line of text and print its words in reverse order. Words are separated by one or more spaces. In the output, separate words with exactly one space and do not print leading or trailing spaces. Punctuation stays attached to its word.

**Input:** one line containing at least one word.

**Output:** one line with the words reversed.

**Example**

Input:
\`\`\`
hello world here
\`\`\`
Output:
\`\`\`
here world hello
\`\`\``,
    constraints: 'Line length ≤ 10^5 characters.',
    hints: [
      'Split the line into a list of words, reverse the list, then join it back together.',
      'In Python, line.split() with no argument splits on any run of whitespace and ignores leading and trailing spaces.',
      'print(" ".join(reversed(line.split()))) or use words[::-1].',
    ],
    explanation:
      'split, reverse and join is a common string pipeline. Calling split() without arguments is important here: split(" ") would produce empty strings for repeated spaces. In JavaScript, trim the line and split on the regular expression /\\s+/ for the same effect.',
    starterCode: {
      python: 'line = input()\n',
      javascript: "const line = require('fs').readFileSync(0, 'utf8').split('\\n')[0];\n",
    },
    visibleTests: [{ name: 'Example', input: 'hello world here\n', expected: 'here world hello' }],
    hiddenTests: [
      { name: 'Extra spaces', input: '  one   two  \n', expected: 'two one' },
      { name: 'Single word', input: 'single\n', expected: 'single' },
      { name: 'Letters', input: 'a b c d e\n', expected: 'e d c b a' },
      { name: 'Punctuation', input: 'Keep, the punctuation.\n', expected: 'punctuation. the Keep,' },
    ],
    solutions: {
      python: String.raw`line = input()
print(" ".join(reversed(line.split())))
`,
      javascript: String.raw`const line = require('fs').readFileSync(0, 'utf8').split('\n')[0];
console.log(line.trim().split(/\s+/).reverse().join(' '));
`,
    },
  },
  {
    slug: 'anagram-check',
    title: 'Anagram check',
    type: 'coding',
    difficulty: 'easy',
    skills: ['strings', 'collections'],
    topics: ['strings', 'sorting', 'counting'],
    prompt: `Two phrases are **anagrams** if one can be formed by rearranging all the letters of the other. Ignore spaces and letter case: \`Dormitory\` and \`dirty room\` are anagrams.

**Input:** two lines, each containing letters and spaces only.

**Output:** \`yes\` if the two phrases are anagrams, otherwise \`no\`.

**Example**

Input:
\`\`\`
listen
silent
\`\`\`
Output:
\`\`\`
yes
\`\`\``,
    constraints: 'Each line has at most 10^5 characters and at least one letter.',
    hints: [
      'Normalise both lines the same way first: remove spaces and lowercase.',
      'Two strings are anagrams when they contain the same letters the same number of times. How could you put the letters in a standard order?',
      'Compare sorted(a) == sorted(b), or compare letter counts with collections.Counter.',
    ],
    explanation:
      'Sorting both normalised strings puts their letters in a canonical order, so anagrams become identical. That costs O(n log n). Counting letters in a dictionary and comparing the dictionaries is O(n). Comparing only the sets of letters is a common bug: "aab" and "abb" have the same set but different counts.',
    starterCode: {
      python: 'a = input()\nb = input()\n',
      javascript: "const [a, b] = require('fs').readFileSync(0, 'utf8').split('\\n');\n",
    },
    visibleTests: [
      { name: 'Example', input: 'listen\nsilent\n', expected: 'yes' },
      { name: 'Different letters', input: 'hello\nworld\n', expected: 'no' },
    ],
    hiddenTests: [
      { name: 'Spaces and case', input: 'Dormitory\ndirty room\n', expected: 'yes' },
      { name: 'Extra letter', input: 'abc\nabcc\n', expected: 'no' },
      { name: 'Same letters, different counts', input: 'aab\nabb\n', expected: 'no' },
      { name: 'Phrase', input: 'Astronomer\nMoon starer\n', expected: 'yes' },
      { name: 'Identical', input: 'abc\nabc\n', expected: 'yes' },
    ],
    solutions: {
      python: String.raw`def normalise(s):
    return sorted(s.replace(" ", "").lower())


a = input()
b = input()
print("yes" if normalise(a) == normalise(b) else "no")
`,
      javascript: String.raw`const [a, b] = require('fs').readFileSync(0, 'utf8').split('\n');
const normalise = (s) => s.replace(/ /g, '').toLowerCase().split('').sort().join('');
console.log(normalise(a) === normalise(b) ? 'yes' : 'no');
`,
    },
  },
  {
    slug: 'caesar-cipher',
    title: 'Caesar cipher',
    type: 'coding',
    difficulty: 'medium',
    skills: ['strings'],
    topics: ['strings', 'modulo', 'character-codes'],
    prompt: `A Caesar cipher shifts every letter a fixed number of places along the alphabet, wrapping around from \`z\` to \`a\`. With a shift of 3, \`a\` becomes \`d\` and \`y\` becomes \`b\`.

Encrypt a line of text:
- shift uppercase letters within \`A\` to \`Z\` and lowercase letters within \`a\` to \`z\` (case is preserved)
- leave every other character (spaces, digits, punctuation) unchanged
- the shift may be negative (shift backwards) or larger than 26

**Input:** the first line contains the integer shift \`k\`. The second line contains the text.

**Output:** the encrypted text on one line.

**Example**

Input:
\`\`\`
3
Hello, World!
\`\`\`
Output:
\`\`\`
Khoor, Zruog!
\`\`\``,
    constraints: '-1000 ≤ k ≤ 1000; text length ≤ 10^5',
    hints: [
      'Characters have numeric codes: ord("a") is 97 in Python and "a".charCodeAt(0) is 97 in JavaScript. chr() and String.fromCharCode() go back.',
      'Convert a letter to its position 0 to 25 by subtracting the code of "a" (or "A"), add k, wrap with % 26, then add the base back.',
      'Python\'s % always returns a non-negative result for a positive divisor, but JavaScript\'s does not: use ((x % 26) + 26) % 26 in JavaScript so negative shifts work.',
    ],
    explanation:
      'Working with positions 0 to 25 makes wrapping a single modulo operation: new = (pos + k) % 26. Handling uppercase and lowercase with their own base keeps case intact, and anything that is not a letter is copied as is. Decrypting is just encrypting with -k.',
    starterCode: {
      python: 'k = int(input())\ntext = input()\n',
      javascript: "const lines = require('fs').readFileSync(0, 'utf8').split('\\n');\nconst k = Number(lines[0]);\nconst text = lines[1];\n",
    },
    visibleTests: [
      { name: 'Example', input: '3\nHello, World!\n', expected: 'Khoor, Zruog!' },
      { name: 'Wrap around', input: '1\nxyz\n', expected: 'yza' },
    ],
    hiddenTests: [
      { name: 'Negative shift decrypts', input: '-3\nKhoor, Zruog!\n', expected: 'Hello, World!' },
      { name: 'Full rotation', input: '26\nSame Text\n', expected: 'Same Text' },
      { name: 'Shift above 26', input: '29\nabc\n', expected: 'def' },
      { name: 'ROT13', input: '13\nWhy did the chicken cross the road?\n', expected: 'Jul qvq gur puvpxra pebff gur ebnq?' },
      { name: 'Large negative with digits', input: '-27\nBa 123\n', expected: 'Az 123' },
    ],
    solutions: {
      python: String.raw`def shift_char(c, k):
    if "a" <= c <= "z":
        base = ord("a")
    elif "A" <= c <= "Z":
        base = ord("A")
    else:
        return c
    return chr((ord(c) - base + k) % 26 + base)


k = int(input())
text = input()
print("".join(shift_char(c, k) for c in text))
`,
      javascript: String.raw`const lines = require('fs').readFileSync(0, 'utf8').split('\n');
const k = Number(lines[0]);
const text = lines[1];

function shiftChar(c, k) {
  let base;
  if (c >= 'a' && c <= 'z') base = 97;
  else if (c >= 'A' && c <= 'Z') base = 65;
  else return c;
  const pos = (((c.charCodeAt(0) - base + k) % 26) + 26) % 26;
  return String.fromCharCode(pos + base);
}

console.log([...text].map((c) => shiftChar(c, k)).join(''));
`,
    },
  },
  // ---------------------------------------------------------------- error handling
  {
    slug: 'safe-division',
    title: 'Safe division',
    type: 'coding',
    difficulty: 'medium',
    skills: ['error-handling', 'control-flow'],
    topics: ['exceptions', 'input-validation', 'parsing'],
    prompt: `Process a list of division requests without crashing on bad input.

**Input:** the first line contains \`t\`, the number of requests. Each of the next \`t\` lines should contain exactly two whole numbers \`a\` and \`b\` separated by a space.

**Output:** for each request, print one line:
- \`error: invalid input\` if the line does not contain exactly two whole numbers (for example \`x 3\`, \`2.5 1\` or \`4\`)
- otherwise \`error: division by zero\` if \`b\` is 0
- otherwise the integer quotient of \`a\` divided by \`b\`, **rounded down** (towards negative infinity), so \`-7 / 2\` gives \`-4\`

Check for invalid input before checking for division by zero.

**Example**

Input:
\`\`\`
3
10 2
7 0
x 3
\`\`\`
Output:
\`\`\`
5
error: division by zero
error: invalid input
\`\`\``,
    constraints: '1 ≤ t ≤ 100; valid numbers are in the range -10^9 to 10^9',
    hints: [
      'Handle each line on its own: split it, check how many parts there are, then try to convert them.',
      'In Python, int("x") raises ValueError and a // 0 raises ZeroDivisionError. Wrap each step in try / except and print the matching message instead of crashing.',
      'Python\'s // already rounds down. In JavaScript, validate with the regular expression /^-?\\d+$/ and use Math.floor(a / b).',
    ],
    explanation:
      'This is defensive programming: one bad line should not stop the whole batch. In Python, catching specific exceptions (ValueError, ZeroDivisionError) instead of a bare except keeps real bugs visible. The order of checks matters: "x 0" is invalid input, not a division by zero, because you cannot divide by something that is not a number. Floor division rounds towards negative infinity, which is why -7 // 2 is -4, not -3.',
    starterCode: {
      python: 't = int(input())\nfor _ in range(t):\n    parts = input().split()\n    # validate, divide, or print an error message\n',
      javascript: "const lines = require('fs').readFileSync(0, 'utf8').split('\\n');\nconst t = Number(lines[0]);\nfor (let i = 1; i <= t; i++) {\n  const parts = lines[i].trim().split(/\\s+/);\n  // validate, divide, or print an error message\n}\n",
    },
    visibleTests: [{ name: 'Example', input: '3\n10 2\n7 0\nx 3\n', expected: '5\nerror: division by zero\nerror: invalid input' }],
    hiddenTests: [
      { name: 'Rounds down', input: '2\n-7 2\n9 3\n', expected: '-4\n3' },
      { name: 'Wrong shapes', input: '3\n1 2 3\n4\n2.5 1\n', expected: 'error: invalid input\nerror: invalid input\nerror: invalid input' },
      { name: 'Zero numerator', input: '2\n0 5\n0 0\n', expected: '0\nerror: division by zero' },
      { name: 'Negative divisor', input: '1\n100 -7\n', expected: '-15' },
      { name: 'Invalid before zero', input: '1\nx 0\n', expected: 'error: invalid input' },
    ],
    solutions: {
      python: String.raw`t = int(input())
for _ in range(t):
    parts = input().split()
    if len(parts) != 2:
        print("error: invalid input")
        continue
    try:
        a = int(parts[0])
        b = int(parts[1])
    except ValueError:
        print("error: invalid input")
        continue
    try:
        print(a // b)
    except ZeroDivisionError:
        print("error: division by zero")
`,
      javascript: String.raw`const lines = require('fs').readFileSync(0, 'utf8').split('\n');
const t = Number(lines[0]);
const out = [];
for (let i = 1; i <= t; i++) {
  const parts = (lines[i] || '').trim().split(/\s+/);
  if (parts.length !== 2 || !parts.every((p) => /^-?\d+$/.test(p))) {
    out.push('error: invalid input');
    continue;
  }
  const [a, b] = parts.map(Number);
  out.push(b === 0 ? 'error: division by zero' : String(Math.floor(a / b)));
}
console.log(out.join('\n'));
`,
    },
  },
];
