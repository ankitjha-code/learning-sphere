import type { SeedProblem } from '../types';

export const basicProblems: SeedProblem[] = [
  {
    slug: 'sum-two-numbers',
    title: 'Sum of two numbers',
    type: 'coding',
    difficulty: 'easy',
    skills: ['programming-basics'],
    topics: ['input-output', 'arithmetic'],
    prompt: `Read two integers, one per line, and print their sum.

**Input:** two lines, each containing an integer \`a\` and \`b\`.

**Output:** a single line with \`a + b\`.

**Example**

Input:
\`\`\`
2
3
\`\`\`
Output:
\`\`\`
5
\`\`\``,
    constraints: '-10^9 ≤ a, b ≤ 10^9',
    hints: [
      'input() gives you text. What do you need to do before adding?',
      'Convert each line with int(...) and store it in a variable.',
      'a = int(input()); b = int(input()); then print the sum.',
    ],
    explanation: 'Read each line, convert it to an integer, add them and print. Python integers have no overflow, so large values are fine.',
    starterCode: {
      python: '# Read two integers and print their sum\n',
      javascript: "const lines = require('fs').readFileSync(0, 'utf8').trim().split('\\n');\n// lines[0] and lines[1] are the two numbers\n",
    },
    visibleTests: [
      { name: 'Example', input: '2\n3\n', expected: '5' },
      { name: 'Negative numbers', input: '-4\n10\n', expected: '6' },
    ],
    hiddenTests: [
      { name: 'Large values', input: '1000000000\n1000000000\n', expected: '2000000000' },
      { name: 'Zeros', input: '0\n0\n', expected: '0' },
      { name: 'Both negative', input: '-7\n-8\n', expected: '-15' },
    ],
    solutions: {
      python: 'a = int(input())\nb = int(input())\nprint(a + b)\n',
      javascript: "const [a, b] = require('fs').readFileSync(0, 'utf8').trim().split('\\n').map(Number);\nconsole.log(a + b);\n",
    },
  },
  {
    slug: 'even-or-odd',
    title: 'Even or odd',
    type: 'coding',
    difficulty: 'easy',
    skills: ['control-flow', 'programming-basics'],
    topics: ['conditionals', 'modulo'],
    prompt: `Read an integer \`n\` and print \`even\` if it is even, otherwise \`odd\`.

**Example**

Input:
\`\`\`
7
\`\`\`
Output:
\`\`\`
odd
\`\`\``,
    constraints: '-10^9 ≤ n ≤ 10^9',
    hints: ['Which operator gives the remainder after division?', 'n % 2 is 0 for even numbers.', 'Use if n % 2 == 0: print("even") else: print("odd").'],
    explanation: 'The remainder of n divided by 2 is 0 exactly when n is even. In Python, -3 % 2 == 1, so negatives work too.',
    starterCode: { python: 'n = int(input())\n', javascript: "const n = Number(require('fs').readFileSync(0, 'utf8').trim());\n" },
    visibleTests: [
      { name: 'Odd', input: '7\n', expected: 'odd' },
      { name: 'Even', input: '10\n', expected: 'even' },
    ],
    hiddenTests: [
      { name: 'Zero', input: '0\n', expected: 'even' },
      { name: 'Negative odd', input: '-3\n', expected: 'odd' },
      { name: 'Negative even', input: '-8\n', expected: 'even' },
    ],
    solutions: {
      python: 'n = int(input())\nprint("even" if n % 2 == 0 else "odd")\n',
      javascript: "const n = Number(require('fs').readFileSync(0, 'utf8').trim());\nconsole.log(Math.abs(n % 2) === 0 ? 'even' : 'odd');\n",
    },
  },
];
