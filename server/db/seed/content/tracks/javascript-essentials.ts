import type { SeedTrack } from '../types';

export const javascriptEssentials: SeedTrack = {
  slug: 'javascript-essentials',
  title: 'JavaScript Essentials',
  category: 'programming',
  summary: 'Learn modern JavaScript from values and functions to async/await and the DOM, the language of the web.',
  description: `**Who it's for:** beginners who want to build for the web, and programmers coming from another language who need solid JavaScript fundamentals.

**Prerequisites:** none, although basic programming experience (for example *Programming Foundations with Python*) makes the first topics quicker. CodeLab runs your JavaScript with Node.js; the DOM topic uses your browser.

**You will be able to:**
- explain JavaScript's types, equality rules and truthiness without surprises
- write functions, arrow functions and closures, and use them with array methods such as map, filter and reduce
- organise code into modules and handle errors with try / catch
- write asynchronous code with promises and async/await
- select, change and listen to elements on a web page

**Milestones:** *Functions and closures* (topic 3) and *Promises and async/await* (topic 7).`,
  level: 'beginner',
  estimatedHours: 20,
  roles: ['frontend developer', 'full-stack developer', 'web developer', 'backend developer', 'software engineer'],
  contentStatus: 'complete',
  topics: [
    {
      slug: 'values-types-operators',
      title: 'Values, types and operators',
      module: 'Language basics',
      skill: 'javascript',
      minutes: 35,
      objectives: [
        'Declare variables with const and let, and explain why var is avoided',
        'Name the primitive types and check them with typeof',
        'Use strict equality (===) and explain why loose equality (==) surprises people',
        'Convert between strings and numbers and recognise NaN',
      ],
      body: `JavaScript runs in every web browser and, through Node.js, on servers. Let's start with the building blocks: values, variables and operators.

### Declaring variables

\`\`\`javascript
const name = 'Asha';   // cannot be reassigned
let score = 10;        // can be reassigned
score = score + 5;     // 15
\`\`\`

Use \`const\` by default and \`let\` when the value must change. The older \`var\` keyword has confusing scoping rules (it ignores block boundaries), so modern code avoids it.

### Primitive types

| Type | Examples | typeof |
|---|---|---|
| number | \`42\`, \`3.14\`, \`-7\`, \`NaN\` | \`"number"\` |
| string | \`'hi'\`, \`"hi"\` | \`"string"\` |
| boolean | \`true\`, \`false\` | \`"boolean"\` |
| undefined | a variable with no value yet | \`"undefined"\` |
| null | "intentionally empty" | \`"object"\` (a historical bug) |
| bigint | \`10n ** 20n\` | \`"bigint"\` |
| symbol | \`Symbol('id')\` | \`"symbol"\` |

Everything else (arrays, functions, plain objects, dates) is an **object**. JavaScript has a single number type for integers and decimals, so \`7 / 2\` is \`3.5\`. Use \`Math.floor(7 / 2)\` for integer division and \`%\` for the remainder.

### Operators

\`\`\`javascript
2 ** 10        // 1024
17 % 5         // 2
'Hi ' + 'there'   // 'Hi there'
0.1 + 0.2      // 0.30000000000000004 (floating point rounding)
\`\`\`

### Equality: always use ===

\`===\` (strict equality) compares value **and** type. \`==\` (loose equality) first converts the values to a common type, which leads to surprises:

\`\`\`javascript
5 === '5'      // false
5 == '5'       // true   ('5' is converted to a number)
0 == ''        // true
null == undefined   // true
\`\`\`

Use \`===\` and \`!==\` everywhere. Linters flag \`==\` for this reason.

### Converting types

\`\`\`javascript
Number('42')      // 42
Number('42px')    // NaN ("Not a Number")
parseInt('42px')  // 42, reads digits until it hits a non-digit
String(42)        // '42'
'5' + 3           // '53'  (+ with a string joins)
'5' * 3           // 15    (* converts to numbers)
\`\`\`

\`NaN\` is the result of a failed numeric conversion. It is not equal to anything, not even itself, so test it with \`Number.isNaN(x)\`.

### Worked example: reading input in CodeLab

\`\`\`javascript
const input = require('fs').readFileSync(0, 'utf8');  // all of stdin as a string
const [a, b] = input.trim().split('\\n').map(Number);
console.log(a + b);
\`\`\`

\`readFileSync(0, 'utf8')\` reads standard input. \`trim()\` removes the final newline, \`split('\\n')\` makes an array of lines and \`map(Number)\` converts each line. Forgetting the conversion would print \`'23'\` instead of \`5\` for inputs 2 and 3.

### Common mistakes
- Using \`==\` and being surprised by type conversion.
- Reassigning a \`const\` (a \`TypeError\`). Note that \`const\` stops reassignment, not changes inside an object or array.
- Comparing with \`NaN\` using \`===\`; use \`Number.isNaN\`.
- Doing maths on strings read from input without converting them first.`,
      practice: [
        { title: 'Sum of two numbers', kind: 'problem', ref: 'sum-two-numbers' },
        { title: 'Even or odd', kind: 'problem', ref: 'even-or-odd' },
        { title: 'Explore typeof', kind: 'exercise', prompt: 'In your browser console or Node.js, print typeof for 42, "42", true, undefined, null, [], {} and a function. Write down which results surprised you and why.' },
      ],
      resources: [
        { title: 'Grammar and types', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Grammar_and_types', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'Data types', url: 'https://javascript.info/types', source: 'javascript.info', kind: 'article' },
        { title: 'Comparisons', url: 'https://javascript.info/comparison', source: 'javascript.info', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'String plus number',
          prompt: 'What does `"5" + 3` evaluate to?',
          options: [
            { id: 'a', text: '8' },
            { id: 'b', text: '"53"' },
            { id: 'c', text: 'NaN' },
          ],
          correct: ['b'],
          explanation: 'When either operand of `+` is a string, JavaScript converts the other to a string and joins them.',
        },
        {
          key: 'q2',
          type: 'multi',
          title: 'Strict equality',
          prompt: 'Which expressions evaluate to `true`? Select all that apply.',
          options: [
            { id: 'a', text: '`5 === 5`' },
            { id: 'b', text: '`5 === "5"`' },
            { id: 'c', text: '`5 == "5"`' },
            { id: 'd', text: '`NaN === NaN`' },
          ],
          correct: ['a', 'c'],
          explanation: '`===` requires the same type, so `5 === "5"` is false. Loose `==` converts the string first, so `5 == "5"` is true. `NaN` is never equal to anything, including itself.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'typeof null',
          prompt: 'What is `typeof null`?',
          options: [
            { id: 'a', text: '"null"' },
            { id: 'b', text: '"object"' },
            { id: 'c', text: '"undefined"' },
          ],
          correct: ['b'],
          explanation: 'It is a long-standing quirk kept for backwards compatibility. Check for null with `x === null`.',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Declare a constant',
          prompt: 'Fill in the keyword that declares a variable which cannot be reassigned: `____ rate = 0.2;`',
          accepted: [['const']],
          explanation: '`const` prevents reassignment. Use `let` when the variable needs to change.',
        },
      ],
    },
    {
      slug: 'js-control-flow',
      title: 'Control flow',
      module: 'Language basics',
      skill: 'control-flow',
      minutes: 35,
      objectives: [
        'Write if / else if / else chains and the ternary operator',
        'List the falsy values in JavaScript',
        'Use for, while and for...of loops, with break and continue',
        'Choose between for...of and for...in',
      ],
      body: `Control flow decides which code runs and how many times.

### Conditionals

\`\`\`javascript
const temp = 22;
if (temp > 30) {
  console.log('hot');
} else if (temp > 15) {
  console.log('mild');
} else {
  console.log('cold');
}
\`\`\`

Conditions go in parentheses and blocks go in braces. As in most languages, only the first true branch runs.

For a simple either/or value, the **ternary operator** is concise:

\`\`\`javascript
const label = temp > 15 ? 'warm' : 'cold';
\`\`\`

Logical operators are \`&&\` (and), \`||\` (or) and \`!\` (not). They short-circuit, just like Python's \`and\` and \`or\`.

### Truthy and falsy

Conditions accept any value. The **falsy** values are \`false\`, \`0\`, \`-0\`, \`0n\`, \`''\`, \`null\`, \`undefined\` and \`NaN\`. Everything else is truthy, **including empty arrays \`[]\` and empty objects \`{}\`**, which is different from Python.

\`\`\`javascript
const items = [];
if (items.length === 0) console.log('empty');  // check length, not the array itself
\`\`\`

Two handy operators build on this:

\`\`\`javascript
const name = input || 'guest';     // falls back if input is ANY falsy value
const count = saved ?? 0;          // falls back only if saved is null or undefined
\`\`\`

Use \`??\` when \`0\` or \`''\` are valid values you want to keep.

### switch

\`\`\`javascript
switch (day) {
  case 'Sat':
  case 'Sun':
    console.log('weekend');
    break;
  default:
    console.log('weekday');
}
\`\`\`

Without \`break\`, execution "falls through" into the next case. That is occasionally useful (as with Sat and Sun above) but usually a bug.

### Loops

\`\`\`javascript
for (let i = 1; i <= 5; i++) {   // classic counting loop: 1 to 5
  console.log(i);
}

let n = 9475, digits = 0;
while (n > 0) {                  // repeat until a condition fails
  n = Math.floor(n / 10);
  digits++;
}

for (const fruit of ['apple', 'kiwi']) {   // each VALUE of an iterable
  console.log(fruit);
}
\`\`\`

\`for...of\` loops over the values of arrays, strings, Maps and Sets. \`for...in\` loops over the **keys** of an object; avoid it for arrays, where it gives string indexes.

\`break\` exits a loop and \`continue\` jumps to the next iteration.

### Worked example: FizzBuzz to 15

\`\`\`javascript
const lines = [];
for (let k = 1; k <= 15; k++) {
  if (k % 15 === 0) lines.push('FizzBuzz');
  else if (k % 3 === 0) lines.push('Fizz');
  else if (k % 5 === 0) lines.push('Buzz');
  else lines.push(String(k));
}
console.log(lines.join('\\n'));
\`\`\`

The most specific rule (divisible by 15) is checked first, otherwise 15 would print \`Fizz\`. Collecting lines in an array and printing once is a common pattern for CodeLab output.

### Common mistakes
- Writing \`if (x = 5)\`, which assigns instead of comparing and is always truthy. Use \`===\`.
- Assuming \`[]\` is falsy. Check \`arr.length === 0\`.
- Forgetting \`break\` in a \`switch\`.
- Using \`||\` for defaults when \`0\` is a legitimate value; use \`??\`.
- Off-by-one errors: \`i < n\` versus \`i <= n\`.`,
      practice: [
        { title: 'FizzBuzz', kind: 'problem', ref: 'fizzbuzz' },
        { title: 'Grade calculator', kind: 'problem', ref: 'grade-calculator' },
        { title: 'Count the vowels', kind: 'problem', ref: 'count-vowels' },
      ],
      resources: [
        { title: 'Control flow and error handling', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Control_flow_and_error_handling', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'Loops and iteration', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Loops_and_iteration', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'Conditional branching: if, ?', url: 'https://javascript.info/ifelse', source: 'javascript.info', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'multi',
          title: 'Falsy in JavaScript',
          prompt: 'Which values are **falsy** in JavaScript? Select all that apply.',
          options: [
            { id: 'a', text: '`0`' },
            { id: 'b', text: '`[]`' },
            { id: 'c', text: '`""`' },
            { id: 'd', text: '`null`' },
            { id: 'e', text: '`"0"`' },
          ],
          correct: ['a', 'c', 'd'],
          explanation: 'Empty arrays and the non-empty string `"0"` are truthy. `0`, the empty string and `null` are falsy.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Nullish coalescing',
          prompt: 'What is `0 ?? 10`?',
          options: [
            { id: 'a', text: '0' },
            { id: 'b', text: '10' },
            { id: 'c', text: 'undefined' },
          ],
          correct: ['a'],
          explanation: '`??` only falls back when the left side is `null` or `undefined`. `0 || 10` would give 10.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'for...of',
          prompt: 'What does `for (const x of ["a", "b"]) console.log(x);` print?',
          options: [
            { id: 'a', text: 'a then b' },
            { id: 'b', text: '0 then 1' },
            { id: 'c', text: '"0" then "1"' },
          ],
          correct: ['a'],
          explanation: '`for...of` visits values. `for...in` would visit the keys, which for an array are the string indexes "0" and "1".',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'switch fall-through',
          prompt: 'In a `switch`, if a matching `case` has no `break`, the code in the next case also runs.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Execution falls through until it reaches a `break`, a `return` or the end of the switch.',
        },
      ],
    },
    {
      slug: 'functions-and-closures',
      title: 'Functions and closures',
      module: 'Functions',
      skill: 'functions',
      minutes: 45,
      milestone: true,
      completionCriteria: 'Pass the quiz (70%+) and solve "Prime checker" and "Number to words" in JavaScript.',
      objectives: [
        'Write function declarations, function expressions and arrow functions',
        'Use default and rest parameters',
        'Explain block scope with let and const',
        'Describe what a closure is and use one to keep private state',
        'Pass functions as arguments to other functions',
      ],
      body: `Functions are values in JavaScript: you can store them in variables, pass them to other functions and return them. That idea powers most modern JavaScript.

### Three ways to write a function

\`\`\`javascript
// 1. Function declaration (hoisted: callable before this line)
function add(a, b) {
  return a + b;
}

// 2. Function expression
const subtract = function (a, b) {
  return a - b;
};

// 3. Arrow function
const multiply = (a, b) => a * b;          // implicit return for one expression
const square = (x) => {
  const result = x * x;
  return result;                            // braces need an explicit return
};
\`\`\`

A function without a \`return\` gives back \`undefined\`.

### Parameters

\`\`\`javascript
function greet(name = 'friend') {           // default parameter
  return 'Hello, ' + name;
}
greet();            // 'Hello, friend'

function total(...nums) {                   // rest parameter collects extras into an array
  return nums.reduce((sum, n) => sum + n, 0);
}
total(1, 2, 3);     // 6
\`\`\`

JavaScript does not complain if you pass too few or too many arguments: missing ones are \`undefined\`.

### Scope

\`let\` and \`const\` are **block-scoped**: a variable declared inside \`{ }\` exists only inside those braces.

\`\`\`javascript
if (true) {
  const msg = 'inside';
}
console.log(msg);   // ReferenceError: msg is not defined
\`\`\`

### Closures

A **closure** is a function that remembers the variables from the place where it was created, even after that outer function has finished.

\`\`\`javascript
function makeCounter() {
  let count = 0;                 // private to this counter
  return () => {
    count += 1;
    return count;
  };
}

const next = makeCounter();
next();   // 1
next();   // 2
const other = makeCounter();
other();  // 1, a separate count
\`\`\`

Each call to \`makeCounter\` creates a fresh \`count\`. Nothing outside can change it except through \`next\`. Closures give you private state, and they are why callbacks can "see" variables around them.

### Higher-order functions

A function that takes or returns another function is called **higher-order**:

\`\`\`javascript
function repeat(times, action) {
  for (let i = 0; i < times; i++) action(i);
}
repeat(3, (i) => console.log('step', i));   // step 0, step 1, step 2
\`\`\`

You will use this constantly with array methods such as \`map\` and \`filter\`, event listeners and promises.

### Worked example: a reusable discount

\`\`\`javascript
function makeDiscount(percent) {
  return (price) => price * (1 - percent / 100);
}

const studentPrice = makeDiscount(20);
const staffPrice = makeDiscount(35);
console.log(studentPrice(50));   // 40
console.log(staffPrice(100));    // 65
\`\`\`

\`makeDiscount\` is a function factory: it returns a new function that has closed over its own \`percent\`.

### Common mistakes
- Forgetting \`return\` inside an arrow function that uses braces: \`(x) => { x * 2 }\` returns \`undefined\`.
- Returning an object literal from a concise arrow function without parentheses: write \`() => ({ ok: true })\`.
- Calling a function when you mean to pass it: \`button.addEventListener('click', handle())\` runs \`handle\` immediately; pass \`handle\` instead.
- Using \`var\` in a loop that creates callbacks; every callback then shares one variable. \`let\` gives each iteration its own.`,
      practice: [
        { title: 'Prime checker', kind: 'problem', ref: 'prime-checker' },
        { title: 'Number to words', kind: 'problem', ref: 'number-to-words' },
        { title: 'Once', kind: 'exercise', prompt: 'Write once(fn) that returns a new function which calls fn the first time it is called and returns the cached result on every later call. Test it with a function that logs a message.' },
      ],
      resources: [
        { title: 'Functions', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'Variable scope, closure', url: 'https://javascript.info/closure', source: 'javascript.info', kind: 'article' },
        { title: 'Arrow functions, the basics', url: 'https://javascript.info/arrow-functions-basics', source: 'javascript.info', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Arrow with braces',
          prompt: 'What does `((x) => { x * 2 })(4)` return?',
          options: [
            { id: 'a', text: '8' },
            { id: 'b', text: 'undefined' },
            { id: 'c', text: 'A SyntaxError' },
          ],
          correct: ['b'],
          explanation: 'With braces, an arrow function needs an explicit `return`. Without it the function returns `undefined`.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Closure state',
          prompt: 'Using `makeCounter` from the lesson, what is printed?\n\n```javascript\nconst a = makeCounter();\nconst b = makeCounter();\na(); a();\nconsole.log(b());\n```',
          options: [
            { id: 'a', text: '1' },
            { id: 'b', text: '3' },
            { id: 'c', text: '2' },
          ],
          correct: ['a'],
          explanation: 'Each call to `makeCounter` creates its own `count`. `b` has not been called before, so it returns 1.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Block scope',
          prompt: 'A variable declared with `let` inside an `if` block can be read after the block ends.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: '`let` and `const` are block-scoped, so the variable no longer exists outside the braces.',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'Function features',
          prompt: 'Match each piece of code to the feature it shows.',
          pairs: {
            left: [
              { id: 'l1', text: '`function f(x = 1) {}`' },
              { id: 'l2', text: '`function f(...xs) {}`' },
              { id: 'l3', text: '`const f = (x) => x + 1;`' },
              { id: 'l4', text: '`[1, 2].map((n) => n * 2)`' },
            ],
            right: [
              { id: 'r1', text: 'Default parameter' },
              { id: 'r2', text: 'Rest parameter' },
              { id: 'r3', text: 'Arrow function with implicit return' },
              { id: 'r4', text: 'Passing a function to a higher-order function' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'Defaults fill in missing arguments, rest collects extra arguments into an array, concise arrows return their expression, and `map` takes a function as its argument.',
        },
      ],
    },
    {
      slug: 'arrays-and-objects',
      title: 'Arrays, objects and array methods',
      module: 'Working with data',
      skill: 'collections',
      minutes: 50,
      objectives: [
        'Create and modify arrays and objects',
        'Transform data with map, filter, reduce, find, some and every',
        'Sort arrays correctly with a compare function',
        'Use destructuring and the spread operator',
        'Choose between plain objects, Map and Set',
      ],
      body: `Arrays hold ordered lists; objects hold named properties. Together they model almost any data.

### Arrays

\`\`\`javascript
const scores = [72, 95, 88];
scores.push(60);           // add to the end: [72, 95, 88, 60]
scores.pop();              // remove from the end, returns 60
scores[0] = 75;            // [75, 95, 88]
scores.length;             // 3
scores.includes(95);       // true
scores.indexOf(88);        // 2 (or -1 if missing)
scores.slice(1, 3);        // [95, 88], a copy; the original is unchanged
\`\`\`

### Array methods that take functions

These methods do not change the original array (except \`sort\`); they return something new.

\`\`\`javascript
const nums = [3, 8, 1, 6];
nums.map((n) => n * 2);               // [6, 16, 2, 12]   transform each item
nums.filter((n) => n > 2);            // [3, 8, 6]        keep matching items
nums.reduce((sum, n) => sum + n, 0);  // 18               combine into one value
nums.find((n) => n > 5);              // 8                first match (or undefined)
nums.some((n) => n > 7);              // true             at least one matches
nums.every((n) => n > 0);             // true             all match
\`\`\`

You can chain them: \`orders.filter((o) => o.paid).map((o) => o.total)\`.

### Sorting: the classic trap

\`sort()\` **changes the array in place** and, by default, compares items **as strings**:

\`\`\`javascript
[10, 9, 1].sort();                 // [1, 10, 9]  (string order!)
[10, 9, 1].sort((a, b) => a - b);  // [1, 9, 10]  ascending
[10, 9, 1].sort((a, b) => b - a);  // [10, 9, 1]  descending
\`\`\`

The compare function returns a negative number if \`a\` should come first, positive if \`b\` should, and 0 if they are equal. Use \`[...arr].sort(...)\` (or \`arr.toSorted(...)\` in modern runtimes) to keep the original.

### Objects

\`\`\`javascript
const user = { name: 'Asha', age: 21, skills: ['js'] };
user.age = 22;                 // update
user.city = 'Pune';            // add
user['name'];                  // 'Asha', bracket notation works with any string
delete user.city;
Object.keys(user);             // ['name', 'age', 'skills']
Object.entries(user);          // [['name', 'Asha'], ['age', 22], ['skills', ['js']]]
\`\`\`

### Destructuring and spread

\`\`\`javascript
const { name, age } = user;            // pull properties into variables
const [first, ...rest] = [1, 2, 3];    // first = 1, rest = [2, 3]
const copy = { ...user, age: 30 };     // shallow copy with one property changed
const all = [...scores, 100];          // new array with an extra item
\`\`\`

### Map and Set

\`Map\` is a key-value collection whose keys can be any type and which keeps insertion order. \`Set\` stores unique values.

\`\`\`javascript
const unique = [...new Set([3, 1, 3, 2])];   // [3, 1, 2]
const counts = new Map();
for (const w of ['a', 'b', 'a']) counts.set(w, (counts.get(w) || 0) + 1);
counts.get('a');   // 2
\`\`\`

### Worked example: a class report

\`\`\`javascript
const students = [
  { name: 'Asha', score: 91 },
  { name: 'Ben', score: 67 },
  { name: 'Chen', score: 78 },
];
const passed = students.filter((s) => s.score >= 70);
const names = passed.map((s) => s.name);                  // ['Asha', 'Chen']
const average = students.reduce((t, s) => t + s.score, 0) / students.length;
const top = [...students].sort((a, b) => b.score - a.score)[0].name;   // 'Asha'
console.log(names.join(', '), average.toFixed(1), top);  // Asha, Chen 78.7 Asha
\`\`\`

### Common mistakes
- Sorting numbers without a compare function.
- Forgetting the initial value in \`reduce\`; on an empty array that throws a \`TypeError\`.
- Thinking \`const arr = []\` makes the array unchangeable. You can still push to it; you just cannot reassign \`arr\`.
- Copying with \`b = a\`; both names point at the same array. Spread creates a (shallow) copy.
- Using \`map\` just to loop. If you do not use the returned array, use \`forEach\` or \`for...of\`.`,
      practice: [
        { title: 'Largest and smallest', kind: 'problem', ref: 'max-and-min' },
        { title: 'Running sum', kind: 'problem', ref: 'running-sum' },
        { title: 'Second largest distinct value', kind: 'problem', ref: 'second-largest-distinct' },
        { title: 'Word frequency', kind: 'problem', ref: 'word-frequency' },
      ],
      resources: [
        { title: 'Array methods', url: 'https://javascript.info/array-methods', source: 'javascript.info', kind: 'article' },
        { title: 'Array reference', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'Working with objects', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Working_with_objects', source: 'MDN Web Docs', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Default sort',
          prompt: 'What is `[10, 9, 1].sort()`?',
          options: [
            { id: 'a', text: '[1, 9, 10]' },
            { id: 'b', text: '[1, 10, 9]' },
            { id: 'c', text: '[10, 9, 1]' },
          ],
          correct: ['b'],
          explanation: 'Without a compare function, `sort` compares items as strings, and "10" comes before "9". Use `sort((a, b) => a - b)`.',
        },
        {
          key: 'q2',
          type: 'matching',
          title: 'Which method?',
          prompt: 'Match each goal to the array method.',
          pairs: {
            left: [
              { id: 'l1', text: 'Double every number' },
              { id: 'l2', text: 'Keep only the even numbers' },
              { id: 'l3', text: 'Add all numbers together' },
              { id: 'l4', text: 'Get the first number over 100' },
            ],
            right: [
              { id: 'r1', text: '`map`' },
              { id: 'r2', text: '`filter`' },
              { id: 'r3', text: '`reduce`' },
              { id: 'r4', text: '`find`' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: '`map` transforms, `filter` selects, `reduce` combines and `find` returns the first match.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'reduce',
          prompt: 'What does `[2, 3, 4].reduce((acc, n) => acc * n, 1)` return?',
          options: [
            { id: 'a', text: '9' },
            { id: 'b', text: '24' },
            { id: 'c', text: '1' },
          ],
          correct: ['b'],
          explanation: 'Starting from 1: 1 × 2 = 2, 2 × 3 = 6, 6 × 4 = 24.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'const arrays',
          prompt: 'After `const list = [1];`, calling `list.push(2)` throws an error.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: '`const` stops you reassigning the variable, not changing the array it refers to. `list` becomes `[1, 2]`.',
        },
      ],
    },
    {
      slug: 'strings-and-template-literals',
      title: 'Strings and template literals',
      module: 'Working with data',
      skill: 'strings',
      minutes: 35,
      objectives: [
        'Build strings with template literals and interpolation',
        'Use common string methods such as slice, split, includes, replaceAll, trim and padStart',
        'Explain why strings are immutable',
        'Work with character codes for simple transformations',
      ],
      body: `Strings are sequences of characters. In JavaScript you can write them with single quotes, double quotes or backticks.

### Template literals

Backtick strings are **template literals**. They allow interpolation with \`\${...}\` and can span several lines:

\`\`\`javascript
const name = 'Asha';
const score = 91.456;
const msg = \`\${name} scored \${score.toFixed(1)}%\`;   // 'Asha scored 91.5%'

const html = \`
  <li>\${name}</li>
\`;
\`\`\`

Anything inside \`\${ }\` is a JavaScript expression: \`\${a + b}\`, \`\${user.isAdmin ? 'admin' : 'member'}\`. This is much easier to read than chains of \`+\`.

### Indexing and immutability

\`\`\`javascript
const word = 'Python';
word[0];            // 'P'
word.at(-1);        // 'n' (at() accepts negative indexes)
word.length;        // 6
word[0] = 'J';      // no effect (a TypeError in strict mode): strings cannot be changed
const changed = 'J' + word.slice(1);   // 'Jython', a new string
\`\`\`

Every string method returns a **new** string, so remember to use the result.

### Everyday methods

| Method | Example | Result |
|---|---|---|
| \`toLowerCase()\` / \`toUpperCase()\` | \`'Hi'.toUpperCase()\` | \`'HI'\` |
| \`trim()\` | \`'  hi '.trim()\` | \`'hi'\` |
| \`slice(start, end)\` | \`'hello'.slice(1, 3)\` | \`'el'\` |
| \`split(sep)\` | \`'a,b,c'.split(',')\` | \`['a', 'b', 'c']\` |
| \`includes(sub)\` | \`'hello'.includes('ell')\` | \`true\` |
| \`startsWith\` / \`endsWith\` | \`'img.png'.endsWith('.png')\` | \`true\` |
| \`indexOf(sub)\` | \`'hello'.indexOf('l')\` | \`2\` (or -1) |
| \`replaceAll(a, b)\` | \`'a-b-c'.replaceAll('-', ' ')\` | \`'a b c'\` |
| \`padStart(n, ch)\` | \`'7'.padStart(3, '0')\` | \`'007'\` |
| \`repeat(n)\` | \`'ab'.repeat(3)\` | \`'ababab'\` |

There is no built-in \`reverse\` for strings. Convert to an array and back: \`[...s].reverse().join('')\`.

### Splitting on patterns

\`split\` also accepts a regular expression, which helps with messy input:

\`\`\`javascript
'  one   two  '.trim().split(/\\s+/);   // ['one', 'two']
'Hello, world!'.toLowerCase().match(/[a-z]+/g);   // ['hello', 'world']
\`\`\`

### Character codes

\`\`\`javascript
'a'.charCodeAt(0);          // 97
String.fromCharCode(98);    // 'b'
\`\`\`

Letters have consecutive codes, so shifting a letter is arithmetic on its code. This is how a Caesar cipher works.

### Worked example: title case

> Turn \`'the  quick brown fox'\` into \`'The Quick Brown Fox'\`.

\`\`\`javascript
const titleCase = (text) =>
  text
    .trim()
    .split(/\\s+/)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

console.log(titleCase('the  quick brown fox'));   // The Quick Brown Fox
\`\`\`

Split, transform each piece, join: the same pipeline you meet in every language.

### Common mistakes
- Using single or double quotes when you meant backticks: \`'Hi \${name}'\` prints the braces literally.
- Calling \`s.toUpperCase()\` without storing the result.
- Comparing user input without normalising case or trimming whitespace.
- Using \`replace('-', ' ')\` and expecting every match to change; \`replace\` with a string changes only the first. Use \`replaceAll\`.`,
      practice: [
        { title: 'Reverse the words', kind: 'problem', ref: 'reverse-words' },
        { title: 'Palindrome check', kind: 'problem', ref: 'palindrome-check' },
        { title: 'Anagram check', kind: 'problem', ref: 'anagram-check' },
        { title: 'Caesar cipher', kind: 'problem', ref: 'caesar-cipher' },
      ],
      resources: [
        { title: 'Template literals', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'Strings', url: 'https://javascript.info/string', source: 'javascript.info', kind: 'article' },
        { title: 'String reference', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String', source: 'MDN Web Docs', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Interpolation',
          prompt: 'Given `const n = 3;`, which string literal evaluates to `"3 items"`?',
          options: [
            { id: 'a', text: "`'${n} items'`" },
            { id: 'b', text: '`"${n} items"`' },
            { id: 'c', text: 'A backtick string containing `${n} items`' },
          ],
          correct: ['c'],
          explanation: 'Only template literals (backticks) interpolate `${...}`. In single or double quotes the characters are printed literally.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'slice',
          prompt: "What is `'JavaScript'.slice(0, 4)`?",
          options: [
            { id: 'a', text: "'Java'" },
            { id: 'b', text: "'JavaS'" },
            { id: 'c', text: "'avaS'" },
          ],
          correct: ['a'],
          explanation: '`slice(start, end)` includes the start index and stops before the end index: characters 0 to 3.',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Pad a number',
          prompt: "Complete the code so it produces `'007'`: `'7'.____(3, '0')`",
          accepted: [['padStart']],
          explanation: '`padStart(targetLength, padString)` adds characters to the front until the string reaches the target length.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Strings are immutable',
          prompt: "After `let s = 'cat'; s[0] = 'b';`, the variable `s` holds `'bat'`.",
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: "Strings cannot be changed in place, so the assignment is ignored (or throws in strict mode). Build a new string: `s = 'b' + s.slice(1)`.",
        },
      ],
    },
    {
      slug: 'modules-and-error-handling',
      title: 'Modules and error handling',
      module: 'Writing real programs',
      skill: 'error-handling',
      minutes: 40,
      objectives: [
        'Split code into ES modules with export and import',
        'Recognise CommonJS require/module.exports in older Node.js code',
        'Handle errors with try / catch / finally',
        'Throw Error objects with helpful messages and create custom error types',
      ],
      body: `As programs grow, you split them into files (**modules**) and make them resilient to things going wrong.

### ES modules

Each file is a module with its own scope. You choose what to share with \`export\`:

\`\`\`javascript
// math.js
export const PI = 3.14159;
export function area(r) {
  return PI * r * r;
}
export default function circumference(r) {
  return 2 * PI * r;
}
\`\`\`

\`\`\`javascript
// main.js
import circumference, { area, PI } from './math.js';
console.log(area(2), circumference(1));
\`\`\`

- **Named exports** are imported with braces and must use the same name (or rename: \`import { area as circleArea }\`).
- A module can have one **default export**, imported without braces under any name.
- In the browser, load the entry file with \`<script type="module" src="main.js"></script>\`. In Node.js, use the \`.mjs\` extension or set \`"type": "module"\` in \`package.json\`.

### CommonJS (older Node.js code)

You will still see this style, including in CodeLab's input snippet:

\`\`\`javascript
const fs = require('fs');                // import
module.exports = { area };               // export
\`\`\`

Both systems do the same job. New projects generally use ES modules.

### Errors and try / catch

When something goes wrong at runtime, JavaScript **throws** an error. If nothing catches it, the program stops (or, in a browser, the current task fails and the error appears in the console).

\`\`\`javascript
try {
  const data = JSON.parse('{ bad json }');
  console.log(data);
} catch (err) {
  console.log('Could not parse:', err.message);
} finally {
  console.log('done');      // always runs
}
\`\`\`

Common built-in errors: \`TypeError\` (calling something that is not a function, reading a property of \`undefined\`), \`ReferenceError\` (using a variable that does not exist), \`SyntaxError\` (for example from \`JSON.parse\` on invalid text) and \`RangeError\`.

### Throwing your own errors

\`\`\`javascript
function withdraw(balance, amount) {
  if (amount <= 0) throw new RangeError('amount must be positive');
  if (amount > balance) throw new Error('insufficient funds');
  return balance - amount;
}
\`\`\`

Always throw \`Error\` objects (not plain strings) so you get a message and a stack trace. For errors your code needs to tell apart, create a subclass:

\`\`\`javascript
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

try {
  throw new ValidationError('email is required');
} catch (err) {
  if (err instanceof ValidationError) console.log('Fix the form:', err.message);
  else throw err;          // not ours: let it propagate
}
\`\`\`

### Worked example: safe parsing

\`\`\`javascript
function parseAge(text) {
  if (!/^\\d+$/.test(text.trim())) throw new ValidationError('age must be a whole number');
  return Number(text);
}

for (const input of ['21', 'abc', ' 7 ']) {
  try {
    console.log(parseAge(input));
  } catch (err) {
    console.log('Error:', err.message);
  }
}
// 21, Error: age must be a whole number, 7
\`\`\`

Validation lives in one function, and the caller decides how to report the problem. Optional chaining (\`user?.address?.city\`) is another useful defence: it returns \`undefined\` instead of throwing when part of the chain is missing.

### Common mistakes
- An empty \`catch {}\` that hides every error, including your own bugs.
- Throwing strings (\`throw 'oops'\`): you lose the stack trace and \`err.message\`.
- Mixing named and default imports: \`import area from './math.js'\` gets the default export, not \`area\`.
- Forgetting the \`.js\` extension in browser ES module paths.`,
      practice: [
        { title: 'Safe division', kind: 'problem', ref: 'safe-division' },
        { title: 'Split into modules', kind: 'exercise', prompt: 'On your own computer, create stats.js exporting mean(nums) and median(nums), each throwing a RangeError for an empty array. Import them in main.js, call them with good and empty inputs, and catch the errors.' },
      ],
      resources: [
        { title: 'JavaScript modules', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'Modules, introduction', url: 'https://javascript.info/modules-intro', source: 'javascript.info', kind: 'article' },
        { title: 'Error handling, "try...catch"', url: 'https://javascript.info/try-catch', source: 'javascript.info', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Default import',
          prompt: "A module has `export default function main() {}` and `export function helper() {}`. Which line imports **both**?",
          options: [
            { id: 'a', text: "`import main, { helper } from './mod.js';`" },
            { id: 'b', text: "`import { main, helper } from './mod.js';`" },
            { id: 'c', text: "`import main, helper from './mod.js';`" },
          ],
          correct: ['a'],
          explanation: 'The default export is imported without braces; named exports go inside braces.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'finally',
          prompt: 'When does a `finally` block run?',
          options: [
            { id: 'a', text: 'Always, whether or not an error was thrown' },
            { id: 'b', text: 'Only if an error was thrown' },
            { id: 'c', text: 'Only if no error was thrown' },
          ],
          correct: ['a'],
          explanation: '`finally` runs after `try` (and `catch`, if it ran) in every case, which makes it the place for cleanup.',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'Good error handling',
          prompt: 'Which are good practices? Select all that apply.',
          options: [
            { id: 'a', text: 'Throwing `new Error("message")` rather than a string' },
            { id: 'b', text: 'Catching errors you cannot handle and silently ignoring them' },
            { id: 'c', text: 'Re-throwing errors your catch block does not recognise' },
            { id: 'd', text: 'Using a custom error class to tell error types apart' },
          ],
          correct: ['a', 'c', 'd'],
          explanation: 'Error objects carry a message and stack trace, custom classes let callers check `instanceof`, and re-throwing unknown errors keeps bugs visible. Silently ignoring errors hides problems.',
        },
      ],
    },
    {
      slug: 'promises-and-async-await',
      title: 'Promises and async/await',
      module: 'Writing real programs',
      skill: 'async-programming',
      minutes: 50,
      milestone: true,
      completionCriteria: 'Pass the quiz (70%+) and complete the "Fetch with fallback" exercise.',
      objectives: [
        'Explain why JavaScript uses asynchronous code and what the event loop does',
        'Create and consume promises with then and catch',
        'Write async functions with await and handle errors with try / catch',
        'Run independent tasks in parallel with Promise.all',
      ],
      body: `Some operations take time: downloading data, reading a file, waiting for a timer. JavaScript runs your code on a **single thread**, so instead of freezing while it waits, it starts the operation, carries on, and comes back when the result is ready. That is **asynchronous** programming.

### The event loop in one paragraph

Your code runs to completion. Slow operations (timers, network requests, file reads) are handed to the browser or Node.js. When one finishes, its callback is placed in a queue, and the **event loop** runs queued callbacks whenever the call stack is empty.

\`\`\`javascript
console.log('A');
setTimeout(() => console.log('B'), 0);
console.log('C');
// prints A, C, B: the timer callback waits until the current code finishes
\`\`\`

### Promises

A **promise** is an object representing a value that will be available later. It is in one of three states: **pending**, **fulfilled** (with a value) or **rejected** (with an error).

\`\`\`javascript
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

wait(500)
  .then(() => 'half a second later')
  .then((msg) => console.log(msg))
  .catch((err) => console.error('Something failed:', err));
\`\`\`

Each \`.then\` returns a new promise, so you can chain steps. A single \`.catch\` at the end handles a rejection from any step.

### async and await

\`async\`/\`await\` lets you write promise-based code that reads top to bottom:

\`\`\`javascript
async function loadUser(id) {
  const response = await fetch(\`https://jsonplaceholder.typicode.com/users/\${id}\`);
  if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
  const user = await response.json();
  return user.name;
}

loadUser(1)
  .then((name) => console.log(name))
  .catch((err) => console.error(err.message));
\`\`\`

- \`await\` pauses **this function** until the promise settles, without blocking the rest of the program.
- An \`async\` function **always returns a promise**. Its \`return\` value becomes the fulfilled value; a thrown error becomes a rejection.
- \`fetch\` only rejects for network failures. An HTTP 404 still fulfils, which is why we check \`response.ok\`.

### Handling errors

Inside an \`async\` function, use ordinary \`try\`/\`catch\`:

\`\`\`javascript
async function main() {
  try {
    const name = await loadUser(1);
    console.log('Hello,', name);
  } catch (err) {
    console.log('Could not load user:', err.message);
  }
}
main();
\`\`\`

### Sequential versus parallel

\`\`\`javascript
// Sequential: the second request starts only after the first finishes
const a = await loadUser(1);
const b = await loadUser(2);

// Parallel: both start at once; total time is roughly the slower one
const [c, d] = await Promise.all([loadUser(3), loadUser(4)]);
\`\`\`

\`Promise.all\` rejects as soon as any promise rejects. When you want every result regardless of failures, use \`Promise.allSettled\`.

### Worked example: retry with a delay

\`\`\`javascript
async function withRetry(task, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await task();
    } catch (err) {
      if (i === attempts) throw err;
      console.log(\`Attempt \${i} failed, retrying...\`);
      await wait(1000 * i);          // wait a little longer each time
    }
  }
}
\`\`\`

This combines everything: an async function, \`await\` inside a loop, \`try\`/\`catch\`, and a helper that returns a promise.

### Common mistakes
- Forgetting \`await\`, so you get a pending \`Promise\` object instead of the value.
- Using \`await\` outside an \`async\` function (allowed only at the top level of ES modules).
- Awaiting independent requests one by one when \`Promise.all\` would run them together.
- Not handling rejections, which leads to "Unhandled promise rejection" warnings or crashes.
- Using \`forEach\` with an async callback and expecting it to wait. Use \`for...of\` with \`await\`, or \`Promise.all\` with \`map\`.`,
      practice: [
        { title: 'Predict the order', kind: 'exercise', prompt: 'Without running it, write down the output order of: console.log(1); setTimeout(() => console.log(2), 0); Promise.resolve().then(() => console.log(3)); console.log(4). Then run it in Node.js and look up "microtasks" to explain why 3 prints before 2.' },
        { title: 'Fetch with fallback', kind: 'exercise', prompt: 'Write an async function getTodo(id) that fetches https://jsonplaceholder.typicode.com/todos/<id>, throws for a non-OK response, and returns the title. Call it for ids 1, 2 and 3 in parallel with Promise.all, and print "unavailable" for any request that fails (hint: Promise.allSettled).' },
        { title: 'Countdown', kind: 'exercise', prompt: 'Write wait(ms) as in the lesson, then an async function countdown(n) that prints n, n - 1, ..., 1 with one second between numbers using a for loop and await.' },
      ],
      resources: [
        { title: 'Using promises', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'Async/await', url: 'https://javascript.info/async-await', source: 'javascript.info', kind: 'article' },
        { title: 'Promise', url: 'https://javascript.info/promise-basics', source: 'javascript.info', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Event loop order',
          prompt: "What does this print?\n\n```javascript\nconsole.log('A');\nsetTimeout(() => console.log('B'), 0);\nconsole.log('C');\n```",
          options: [
            { id: 'a', text: 'A, B, C' },
            { id: 'b', text: 'A, C, B' },
            { id: 'c', text: 'B, A, C' },
          ],
          correct: ['b'],
          explanation: 'Even with a 0 ms delay, the timer callback is queued and only runs after the current code finishes.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'async return value',
          prompt: 'An `async` function always returns a promise, even if its body returns a plain number.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'The returned value is wrapped in a fulfilled promise; a thrown error becomes a rejected promise.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Parallel requests',
          prompt: 'You need the results of three independent requests. Which approach finishes fastest?',
          options: [
            { id: 'a', text: '`await Promise.all([r1(), r2(), r3()])`' },
            { id: 'b', text: 'Three `await` lines, one after another' },
            { id: 'c', text: 'They always take the same time' },
          ],
          correct: ['a'],
          explanation: '`Promise.all` starts all three at once, so the total time is about that of the slowest one. Sequential awaits add the times together.',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'Promise states',
          prompt: 'Match each promise state to its meaning.',
          pairs: {
            left: [
              { id: 'l1', text: 'Pending' },
              { id: 'l2', text: 'Fulfilled' },
              { id: 'l3', text: 'Rejected' },
            ],
            right: [
              { id: 'r1', text: 'The operation has not finished yet' },
              { id: 'r2', text: 'The operation succeeded with a value' },
              { id: 'r3', text: 'The operation failed with an error' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3' },
          explanation: 'A promise starts pending and settles exactly once, either fulfilled or rejected.',
        },
      ],
    },
    {
      slug: 'dom-basics',
      title: 'DOM basics',
      module: 'JavaScript in the browser',
      skill: 'dom-browser',
      minutes: 45,
      objectives: [
        'Describe the DOM as a tree of objects that represents the page',
        'Select elements with querySelector and querySelectorAll',
        'Change text, attributes and classes, and create new elements',
        'Respond to user actions with addEventListener',
        'Explain why textContent is safer than innerHTML for user input',
      ],
      body: `When a browser loads an HTML page, it builds the **Document Object Model (DOM)**: a tree of objects, one for each element, that JavaScript can read and change. Change the DOM and the page updates.

\`\`\`html
<!doctype html>
<html>
  <body>
    <h1 id="title">To-do</h1>
    <input id="task" placeholder="New task">
    <button id="add">Add</button>
    <ul id="list"></ul>
    <script src="app.js" defer></script>
  </body>
</html>
\`\`\`

\`defer\` tells the browser to run the script after the HTML has been parsed, so the elements exist when your code looks for them.

### Selecting elements

\`\`\`javascript
const title = document.querySelector('#title');      // first match for a CSS selector
const items = document.querySelectorAll('#list li'); // all matches (a NodeList)
\`\`\`

\`querySelector\` returns \`null\` if nothing matches, so a typo in a selector often shows up later as "Cannot read properties of null".

### Changing elements

\`\`\`javascript
title.textContent = 'My tasks';          // set the text
title.classList.add('highlight');        // add a CSS class
title.classList.toggle('done');          // add if missing, remove if present
title.setAttribute('aria-live', 'polite');
title.style.color = 'teal';              // inline style (prefer classes)
\`\`\`

### Creating and removing elements

\`\`\`javascript
const li = document.createElement('li');
li.textContent = 'Learn the DOM';
document.querySelector('#list').append(li);
li.remove();                              // take it out again
\`\`\`

### textContent versus innerHTML

\`innerHTML\` parses a string as HTML. If that string contains user input, an attacker can inject markup such as \`<img src=x onerror="stealCookies()">\`. This is called **cross-site scripting (XSS)**. Use \`textContent\` for any text that came from a user, and build structure with \`createElement\`.

### Events

\`\`\`javascript
const button = document.querySelector('#add');
button.addEventListener('click', (event) => {
  console.log('clicked', event.target);
});
\`\`\`

Common events: \`click\`, \`input\` (every keystroke in a field), \`change\`, \`submit\`, \`keydown\` and \`DOMContentLoaded\`. For a \`<form>\`, listen for \`submit\` and call \`event.preventDefault()\` to stop the browser reloading the page.

**Event delegation:** instead of adding a listener to every list item, add one to the parent and check \`event.target\`. It also works for items added later.

### Worked example: a tiny to-do list

\`\`\`javascript
const input = document.querySelector('#task');
const list = document.querySelector('#list');

document.querySelector('#add').addEventListener('click', () => {
  const text = input.value.trim();
  if (!text) return;                       // ignore empty tasks
  const li = document.createElement('li');
  li.textContent = text;                   // safe: no HTML parsing
  list.append(li);
  input.value = '';
  input.focus();
});

list.addEventListener('click', (event) => {   // one listener for every item
  if (event.target.tagName === 'LI') event.target.classList.toggle('done');
});
\`\`\`

This is the core loop of every interactive page: **select** elements, **listen** for events, **update** the DOM. Frameworks such as React automate the "update" step, but they are built on exactly these APIs.

### Accessibility notes
- Use real \`<button>\` elements for clickable controls; they work with the keyboard and screen readers for free.
- Give inputs a \`<label>\`, and keep focus somewhere sensible after an action, as \`input.focus()\` does above.

### Common mistakes
- Running a script before the elements exist (no \`defer\`, script in \`<head>\`), so selectors return \`null\`.
- Inserting user input with \`innerHTML\`.
- Forgetting \`event.preventDefault()\` on form submit.
- Passing \`handler()\` instead of \`handler\` to \`addEventListener\`.`,
      practice: [
        { title: 'Build the to-do list', kind: 'exercise', prompt: 'Create index.html and app.js from the worked example and open the page in your browser. Then add a "Clear done" button that removes every item with the class "done", and make pressing Enter in the input add a task.' },
        { title: 'Live character counter', kind: 'exercise', prompt: 'Add a <textarea> and a <p> to a page. Use the "input" event to show "N / 140 characters" as the user types, and add a class that turns the counter red past 140.' },
        { title: 'Explore the DOM tree', kind: 'exercise', prompt: 'Open the developer tools on any website, select an element in the Elements panel, then type $0.textContent and $0.parentElement in the console. Describe what you see.' },
      ],
      resources: [
        { title: 'Introduction to the DOM', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model/Introduction', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'DOM tree', url: 'https://javascript.info/dom-nodes', source: 'javascript.info', kind: 'article' },
        { title: 'Introduction to browser events', url: 'https://javascript.info/introduction-browser-events', source: 'javascript.info', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'No match',
          prompt: "What does `document.querySelector('#missing')` return when no element matches?",
          options: [
            { id: 'a', text: '`null`' },
            { id: 'b', text: 'An empty array' },
            { id: 'c', text: 'It throws an error' },
          ],
          correct: ['a'],
          explanation: '`querySelector` returns `null` when nothing matches. `querySelectorAll` returns an empty NodeList.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Safe text',
          prompt: 'You want to show a comment typed by a user. Which property should you set?',
          options: [
            { id: 'a', text: '`element.textContent`' },
            { id: 'b', text: '`element.innerHTML`' },
            { id: 'c', text: 'Either; they are equally safe' },
          ],
          correct: ['a'],
          explanation: '`textContent` treats the value as plain text. `innerHTML` parses it as HTML, which allows script injection (XSS).',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Stop the reload',
          prompt: 'Inside a form `submit` listener, call `event.____()` to stop the browser reloading the page.',
          accepted: [['preventDefault', 'preventDefault()']],
          explanation: '`preventDefault()` cancels the default action of an event, here the full-page form submission.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Event delegation',
          prompt: 'With event delegation, one listener on a parent element can handle clicks on child elements that are added later.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Events bubble up from the target to its ancestors, so the parent sees clicks on any child, including new ones. Check `event.target` to see which child was clicked.',
        },
      ],
    },
  ],
};
