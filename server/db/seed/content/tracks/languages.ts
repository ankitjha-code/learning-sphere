import type { SeedTrack } from '../types';

// Complete tracks for additional languages (TypeScript, Java, C/C++, Go, Rust). Each topic
// has objectives, a worked lesson, a quiz, free official resources and hands-on exercises.

export const typescriptTrack: SeedTrack = {
  slug: 'typescript-essentials',
  title: 'TypeScript Essentials',
  category: 'programming',
  summary: 'Add static types to your JavaScript so editors catch bugs before your users do.',
  description: `**Who it's for:** developers who already write JavaScript and want safer, self-documenting code for frontend or backend projects.

**Prerequisites:** *JavaScript Essentials* or equivalent experience with functions, objects, arrays, modules and promises.

**You will be able to:**
- set up a TypeScript project in strict mode and read compiler errors with confidence
- describe data with annotations, interfaces, type aliases, unions and literal types
- narrow union types safely and model application states with discriminated unions
- write reusable generic functions and derive new types with utility types instead of repeating yourself
- type classes and async code, and validate data that arrives from outside your program

**How it works:** seven topics, each with a lesson, worked examples, a short quiz and practice. CodeLab problems accept TypeScript, so you can practise on real input and output tasks while your editor checks the types.

**Milestones:** *Narrowing and discriminated unions* (topic 4) and *Classes and typed async code* (topic 7).`,
  level: 'intermediate',
  estimatedHours: 16,
  roles: ['frontend developer', 'full-stack developer', 'backend developer', 'software engineer'],
  contentStatus: 'complete',
  prerequisites: ['javascript-essentials'],
  topics: [
    {
      slug: 'why-typescript-and-setup',
      title: 'Why TypeScript, and project setup',
      module: 'Getting started',
      skill: 'typescript',
      minutes: 35,
      objectives: [
        'Explain what TypeScript adds to JavaScript and what it does not change at runtime',
        'Create a project with a tsconfig.json that has strict mode enabled',
        'Compile with tsc and read a type error message',
        'Choose between type checking, compiling and running a file directly',
      ],
      body: `TypeScript is JavaScript with a **static type system**. You write \`.ts\` files, the compiler (\`tsc\`) checks them, and then it emits plain JavaScript that runs in browsers or Node.js. Types are **erased** during compilation: they never run, so they cost nothing at runtime, but your editor uses them to catch mistakes as you type, autocomplete property names and make refactoring safe.

### What TypeScript catches

\`\`\`typescript
function total(prices: number[]): number {
  return prices.reduce((sum, p) => sum + p, 0);
}

total([4, 5]);          // OK: 9
total(['4', '5']);      // Error: Type 'string' is not assignable to type 'number'.

const user = { name: 'Asha', email: 'asha@example.com' };
console.log(user.emial);   // Error: Property 'emial' does not exist. Did you mean 'email'?
\`\`\`

Both bugs would run silently in plain JavaScript: the first call returns the string \`"045"\` and the second line prints \`undefined\`.

### What TypeScript does not do
- It does not change how your code behaves. \`tsc\` removes the types and can rewrite newer syntax for older targets, nothing more.
- It does not check data at runtime. If an API sends a string where you declared a number, nothing stops it. Topic 6 shows how to validate outside data.
- By default \`tsc\` still writes JavaScript even when there are type errors. Read the errors instead of ignoring them (or set \`noEmitOnError\`).

### Setting up a project

\`\`\`bash
mkdir ts-practice && cd ts-practice
npm init -y
npm install --save-dev typescript
npx tsc --init          # creates tsconfig.json
npx tsc                 # type-check and compile
npx tsc --noEmit        # type-check only (common in CI)
npx tsc --watch         # re-check on every save
\`\`\`

A small \`tsconfig.json\` for a Node.js project:

\`\`\`json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "strict": true,
    "rootDir": "src",
    "outDir": "dist"
  }
}
\`\`\`

\`"strict": true\` turns on a family of checks. The most valuable are \`strictNullChecks\`, which makes \`null\` and \`undefined\` separate types you must handle, and \`noImplicitAny\`, which reports parameters whose type cannot be worked out.

### Reading an error

\`src/index.ts:5:7 - error TS2322: Type 'string' is not assignable to type 'number'.\` gives the file, line, column, an error code you can search for, and a message. Read "X is not assignable to Y" as "you gave me X where I expected Y".

### Running TypeScript while you learn
The TypeScript Playground checks code in the browser with no setup. Tools such as \`tsx\` and recent Node.js versions can run \`.ts\` files directly by stripping the types, but they do **not** type-check. CodeLab works the same way: it strips types and runs your code, reading input with \`require('fs').readFileSync(0, 'utf8')\` just like JavaScript. Keep \`tsc\` or your editor in the loop to get the checking.

### Common mistakes
- Turning off strict mode to make errors disappear. The errors are the point; fix the code instead.
- Expecting types to validate data at runtime. They are erased before the code runs.
- Annotating every local variable. Let inference do the work and annotate function boundaries.
- Running output from the wrong folder: check \`outDir\` and run the \`.js\` file it produced.`,
      practice: [
        { title: 'Sum of two numbers', kind: 'problem', ref: 'sum-two-numbers' },
        { title: 'First compile', kind: 'exercise', prompt: 'Install TypeScript in a new folder, run npx tsc --init, and write src/index.ts with a function add(a: number, b: number): number. Call it with a string argument and read the compiler error. Fix the call, compile, and run the JavaScript output with node.' },
        { title: 'Strict mode difference', kind: 'exercise', prompt: 'In the Playground, write function len(s?: string) { return s.length; }. Toggle strictNullChecks on and off in the TS Config menu and write two sentences explaining what changes and why the strict version is safer.' },
      ],
      resources: [
        { title: 'TypeScript for JavaScript Programmers', url: 'https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html', source: 'TypeScript', kind: 'docs' },
        { title: 'The Basics', url: 'https://www.typescriptlang.org/docs/handbook/2/basic-types.html', source: 'TypeScript Handbook', kind: 'docs' },
        { title: 'TSConfig Reference', url: 'https://www.typescriptlang.org/tsconfig', source: 'TypeScript', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Types after compiling',
          prompt: 'What happens to type annotations when `tsc` compiles a `.ts` file?',
          options: [
            { id: 'a', text: 'They are erased, and the output is plain JavaScript' },
            { id: 'b', text: 'They become runtime checks that throw on bad values' },
            { id: 'c', text: 'They are kept in the output as comments the engine reads' },
          ],
          correct: ['a'],
          explanation: 'Types exist only at compile time. The emitted JavaScript contains no type information and no extra checks.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Runtime validation',
          prompt: 'If you declare `const data: User = await res.json();`, TypeScript verifies at runtime that the server really sent a `User`.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Nothing is checked at runtime. `res.json()` returns `any`, so the annotation is simply trusted. Validate outside data yourself.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Strict option',
          prompt: 'Complete the tsconfig.json entry that enables the whole family of strict checks, including strictNullChecks: `"____": true`',
          accepted: [['strict']],
          explanation: '`"strict": true` enables strictNullChecks, noImplicitAny and several related checks in one switch.',
          difficulty: 'easy',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Facts about tsc',
          prompt: 'Which statements are true? Select all that apply.',
          options: [
            { id: 'a', text: '`npx tsc --noEmit` checks types without writing JavaScript files' },
            { id: 'b', text: 'By default, `tsc` can still emit JavaScript when there are type errors' },
            { id: 'c', text: 'Compiling with `tsc` makes the program run faster than the same JavaScript' },
            { id: 'd', text: '`npx tsc --init` creates a tsconfig.json file' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'The output is ordinary JavaScript, so it runs at the same speed. `--noEmit` only checks, `--init` creates the config, and emitting despite errors is the default unless `noEmitOnError` is set.',
          difficulty: 'medium',
        },
      ],
    },
    {
      slug: 'everyday-types',
      title: 'Everyday types',
      module: 'Types',
      skill: 'typescript',
      minutes: 45,
      objectives: [
        'Annotate variables, parameters and return values, and rely on inference where it is clear',
        'Use arrays, tuples, union types and literal types',
        'Handle null and undefined with strictNullChecks, optional chaining and ??',
        'Explain the difference between any and unknown',
      ],
      body: `Most of the time TypeScript **infers** types from the values you write, so you mainly annotate the boundaries: function parameters, return values and data coming from outside.

### Primitives, arrays and tuples

\`\`\`typescript
let count = 0;                          // inferred as number
const title = 'Report';                 // inferred as the literal type 'Report'
let done: boolean = false;              // annotation is optional here

const names: string[] = [];             // annotate empty arrays, or they become any[]
const matrix: number[][] = [[1, 2], [3, 4]];
const point: [number, number] = [3, 4]; // tuple: fixed length, a type per position
const entry: [string, number] = ['apples', 3];
\`\`\`

### Unions and literal types

A **union** (\`A | B\`) means "one of these". A **literal type** is a single exact value, and a union of literals works like a small enum.

\`\`\`typescript
let id: string | number;
id = 42;
id = 'abc-42';

type Size = 'S' | 'M' | 'L';
function priceFor(size: Size): number {
  return size === 'S' ? 8 : size === 'M' ? 10 : 12;
}
priceFor('M');    // 10
priceFor('XL');   // Error: Argument of type '"XL"' is not assignable to parameter of type 'Size'.
\`\`\`

### Worked example: scores to grades

\`\`\`typescript
type Grade = 'A' | 'B' | 'C' | 'F';

function toGrade(score: number): Grade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 50) return 'C';
  return 'F';
}

const scores = [92, 67, 48];          // number[]
const grades = scores.map(toGrade);   // Grade[], inferred from toGrade
\`\`\`

The return annotation \`Grade\` means a typo such as \`return 'E'\` is caught inside the function, not later by a confused caller.

### null and undefined

With \`strictNullChecks\` on, \`string\` does not include \`undefined\`. A function that might not find something says so in its return type, and callers must handle it:

\`\`\`typescript
function findName(names: string[], prefix: string): string | undefined {
  return names.find((n) => n.startsWith(prefix));
}

const found = findName(['Asha', 'Ben'], 'Z');
found.length;                 // Error: 'found' is possibly 'undefined'.
const len = found?.length ?? 0;   // optional chaining plus a default: 0
\`\`\`

\`?.\` stops and gives \`undefined\` if the left side is null or undefined. \`??\` supplies a default only for null or undefined, whereas \`||\` also replaces \`0\`, \`''\` and \`false\`.

### any versus unknown

\`any\` switches checking off for a value, and the lack of checking spreads to everything it touches. \`unknown\` also accepts any value, but you must check it before use, which makes it the safe choice for parsed JSON or user input.

\`\`\`typescript
const a: any = JSON.parse('{"x": 1}');
a.y.z;                        // compiles, crashes at runtime

const u: unknown = JSON.parse('{"x": 1}');
u.x;                          // Error: 'u' is of type 'unknown'.
\`\`\`

### Common mistakes
- Leaving an empty array unannotated (\`const items = []\`), which can widen to \`any[]\`.
- Using \`any\` to silence an error; prefer \`unknown\` plus a check.
- Using \`||\` for defaults when \`0\` or \`''\` are valid values; use \`??\`.
- Writing the wrapper types \`String\`, \`Number\` or \`Boolean\` instead of \`string\`, \`number\`, \`boolean\`.`,
      practice: [
        { title: 'Even or odd', kind: 'problem', ref: 'even-or-odd' },
        { title: 'Grade calculator', kind: 'problem', ref: 'grade-calculator' },
        { title: 'Annotate a module', kind: 'exercise', prompt: 'Take a small JavaScript file you have written, rename it to .ts and add types to every function parameter and return value until tsc reports no errors in strict mode. Count how many real bugs or unclear spots the compiler found.' },
        { title: 'Literal unions', kind: 'exercise', prompt: 'Define type Coin = "penny" | "nickel" | "dime" | "quarter" and write valueInCents(coin: Coin): number. Then write totalCents(coins: Coin[]): number. Confirm that totalCents(["dime", "euro"]) is a compile error.' },
      ],
      resources: [
        { title: 'Everyday Types', url: 'https://www.typescriptlang.org/docs/handbook/2/everyday-types.html', source: 'TypeScript Handbook', kind: 'docs' },
        { title: 'TypeScript Playground', url: 'https://www.typescriptlang.org/play', source: 'TypeScript', kind: 'interactive' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'const inference',
          prompt: 'What type does TypeScript infer for `const dir = \'up\';`?',
          options: [
            { id: 'a', text: '`string`' },
            { id: 'b', text: 'The literal type `\'up\'`' },
            { id: 'c', text: '`any`' },
          ],
          correct: ['b'],
          explanation: 'A `const` can never be reassigned, so TypeScript keeps the exact literal type. `let dir = \'up\'` would widen to `string`.',
          difficulty: 'medium',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Safe type for JSON',
          prompt: 'You parse JSON whose shape you do not control. Which type makes the compiler force you to check the value before using it?',
          options: [
            { id: 'a', text: '`any`' },
            { id: 'b', text: '`unknown`' },
            { id: 'c', text: '`object`' },
            { id: 'd', text: '`never`' },
          ],
          correct: ['b'],
          explanation: '`unknown` accepts any value but allows no operations until you narrow it. `any` allows everything and checks nothing.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Null in strict mode',
          prompt: 'With `strictNullChecks` enabled, a variable declared as `string` can be assigned `null`.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Under strictNullChecks, `null` and `undefined` are separate types. You must write `string | null` to allow null.',
          difficulty: 'easy',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'Read the type',
          prompt: 'Match each type to its description.',
          pairs: {
            left: [
              { id: 'l1', text: '`[number, number]`' },
              { id: 'l2', text: '`string | number`' },
              { id: 'l3', text: '`\'S\' | \'M\' | \'L\'`' },
              { id: 'l4', text: '`string[]`' },
            ],
            right: [
              { id: 'r1', text: 'A tuple with exactly two numbers' },
              { id: 'r2', text: 'A union: either a string or a number' },
              { id: 'r3', text: 'A union of three literal values' },
              { id: 'r4', text: 'An array of any length containing strings' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'Tuples fix length and position types, unions mean "one of", literal unions restrict to exact values and `T[]` is an array of T.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'Default for undefined',
          prompt: '`count` has type `number | undefined`, and `0` is a valid count. Complete the expression so it gives `count` when defined and `10` only when it is undefined: `const n = count ____ 10;`',
          accepted: [['??']],
          explanation: '`??` falls back only for null or undefined. `||` would also replace a real count of `0` with `10`, which is a bug here.',
          difficulty: 'medium',
        },
      ],
    },
    {
      slug: 'objects-interfaces-type-aliases',
      title: 'Objects, interfaces and type aliases',
      module: 'Types',
      skill: 'typescript',
      minutes: 45,
      objectives: [
        'Describe object shapes with interface and type',
        'Use optional and readonly properties, and know that readonly is shallow',
        'Extend interfaces and combine types with intersections',
        'Explain structural typing and excess property checks',
      ],
      body: `Object types describe the **shape** of data: which properties exist and what type each has. You can name a shape with an \`interface\` or a \`type\` alias.

\`\`\`typescript
interface User {
  readonly id: number;     // cannot be reassigned after creation
  name: string;
  email?: string;          // optional: reading it gives string | undefined
}

interface Admin extends User {
  permissions: string[];
}

type Point = { x: number; y: number };
type Labeled = Point & { label: string };   // intersection: has all properties of both

function greet(user: User): string {
  return 'Hello, ' + user.name + (user.email ? ' <' + user.email + '>' : '');
}

greet({ id: 1, name: 'Asha' });   // OK, email is optional
\`\`\`

### interface or type?

For plain object shapes they are nearly interchangeable. Differences that matter day to day:
- Only \`type\` can name a union, tuple or primitive: \`type Id = string | number\`.
- An \`interface\` can be extended with \`extends\` and merged by declaring it twice (handy for library typings).

Pick one style for object shapes in a codebase and stay consistent.

### Structural typing

TypeScript compares **shapes**, not names. Any value with the required properties fits, wherever it came from:

\`\`\`typescript
const visitor = { id: 7, name: 'Ben', lastSeen: '2024-05-01' };
greet(visitor);                               // OK: it has id and name

greet({ id: 8, name: 'Chen', nickname: 'C' }); // Error: Object literal may only specify known properties
\`\`\`

The second call fails because of the **excess property check**: when you pass a fresh object literal directly, extra properties are probably typos, so TypeScript reports them. A variable that was created elsewhere is not checked this way.

### Index signatures and Record

When keys are not known in advance, describe them generally:

\`\`\`typescript
const stock: Record<string, number> = { apples: 3, pears: 0 };
interface Scores { [student: string]: number }   // same idea with an index signature
\`\`\`

### Worked example: immutable updates

\`\`\`typescript
interface Book { isbn: string; title: string; authors: readonly string[] }
interface Member { readonly id: number; name: string; borrowed: readonly Book[] }

function borrow(member: Member, book: Book): Member {
  return { ...member, borrowed: [...member.borrowed, book] };   // new object, original untouched
}

const m: Member = { id: 1, name: 'Asha', borrowed: [] };
const m2 = borrow(m, { isbn: '978-0', title: 'Dune', authors: ['F. Herbert'] });
m.borrowed.push(m2.borrowed[0]);   // Error: Property 'push' does not exist on type 'readonly Book[]'
\`\`\`

\`readonly string[]\` (or \`ReadonlyArray<string>\`) removes mutating methods, so accidental in-place changes become compile errors.

### Common mistakes
- Assuming \`readonly\` is deep. \`readonly borrowed: Book[]\` stops reassignment of \`borrowed\` but still allows \`borrowed.push(...)\`; use \`readonly Book[]\` for the array too.
- Confusing \`email?: string\` with \`email: string | undefined\`. The first may be left out; the second must be present, even if its value is undefined.
- Assuming excess property checks always run. They only apply to object literals written directly where a type is expected.
- Trying to write a union with \`interface\`. Use a \`type\` alias.`,
      practice: [
        { title: 'Largest and smallest', kind: 'problem', ref: 'max-and-min' },
        { title: 'Model a library', kind: 'exercise', prompt: 'Write interfaces for Book (isbn, title, authors, optional publishedYear) and Member (readonly id, name, borrowed: readonly Book[]). Write borrow(member, book) and giveBack(member, isbn) that each return a new Member without mutating the original, and prove with a compile error that push on borrowed is rejected.' },
        { title: 'Excess property experiment', kind: 'exercise', prompt: 'Call a function that takes { name: string } once with an object literal containing an extra property and once with a variable holding the same object. Explain in two sentences why only one call is an error.' },
      ],
      resources: [
        { title: 'Object Types', url: 'https://www.typescriptlang.org/docs/handbook/2/objects.html', source: 'TypeScript Handbook', kind: 'docs' },
        { title: 'Everyday Types: interfaces and type aliases', url: 'https://www.typescriptlang.org/docs/handbook/2/everyday-types.html', source: 'TypeScript Handbook', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'true_false',
          title: 'Structural typing',
          prompt: 'Given `function greet(u: { name: string })` and `const p = { name: \'Asha\', age: 30 };`, the call `greet(p)` compiles.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: '`p` has the required `name` property, so its shape fits. Excess property checks only apply to object literals passed directly, not to variables.',
          difficulty: 'medium',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Only with type',
          prompt: 'Which of these can only be written with a `type` alias, not an `interface`?',
          options: [
            { id: 'a', text: 'An object with a name and an age' },
            { id: 'b', text: '`string | number`' },
            { id: 'c', text: 'An object shape that extends another object shape' },
          ],
          correct: ['b'],
          explanation: 'Interfaces describe object shapes. Unions, tuples and aliases of primitives need `type`.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'readonly facts',
          prompt: 'Which statements about `readonly` are true? Select all that apply.',
          options: [
            { id: 'a', text: 'It prevents reassigning the property after the object is created' },
            { id: 'b', text: 'It makes nested objects and arrays inside the property immutable too' },
            { id: 'c', text: 'It is enforced only at compile time' },
            { id: 'd', text: '`Readonly<T>` makes every top-level property of T readonly' },
          ],
          correct: ['a', 'c', 'd'],
          explanation: '`readonly` is shallow and compile-time only. Nested arrays need their own `readonly` (for example `readonly string[]`).',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Extend an interface',
          prompt: 'Complete the declaration so Admin has every property of User plus permissions: `interface Admin ____ User { permissions: string[] }`',
          accepted: [['extends']],
          explanation: '`extends` copies the members of the base interface into the new one.',
          difficulty: 'easy',
        },
      ],
    },
    {
      slug: 'narrowing-and-discriminated-unions',
      title: 'Narrowing and discriminated unions',
      module: 'Types',
      skill: 'typescript',
      minutes: 55,
      milestone: true,
      completionCriteria: 'Complete the "Request state" exercise with an exhaustive switch that fails to compile when a new state is added, and score 70% or more on the quiz.',
      objectives: [
        'Narrow union types with typeof, truthiness, equality, in and instanceof checks',
        'Write type predicates for reusable checks',
        'Model alternatives with discriminated unions',
        'Use the never type to make switches exhaustive',
      ],
      body: `A union value could be any of its members, so TypeScript only lets you use what they all share. A runtime check that TypeScript understands **narrows** the type inside that branch.

### Narrowing checks

\`\`\`typescript
function format(value: string | number | Date | null): string {
  if (value === null) return '(none)';             // equality
  if (typeof value === 'number') return value.toFixed(2);   // typeof
  if (value instanceof Date) return value.toISOString();    // instanceof
  return value.toUpperCase();                      // only string is left
}

type Fish = { swim: () => void };
type Bird = { fly: () => void };
function move(animal: Fish | Bird) {
  if ('swim' in animal) animal.swim();             // in
  else animal.fly();
}
\`\`\`

TypeScript follows \`return\`, \`throw\` and \`else\` through the function, so after an early return the remaining type is smaller.

### Type predicates

Wrap a check in a function whose return type is \`value is T\`, and callers get the narrowing too:

\`\`\`typescript
function isString(x: unknown): x is string {
  return typeof x === 'string';
}

const inputs: unknown[] = ['a', 1, 'b'];
const words = inputs.filter(isString);   // string[]
\`\`\`

The compiler trusts your predicate, so make sure the body really checks what the signature claims.

### Discriminated unions

Give every variant a common property with a **literal** type (the discriminant). Checking that property narrows the whole object:

\`\`\`typescript
type RequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: string[] }
  | { status: 'error'; message: string };

function render(state: RequestState): string {
  switch (state.status) {
    case 'idle':
      return 'Press load';
    case 'loading':
      return 'Loading...';
    case 'success':
      return state.data.join(', ');     // data exists only here
    case 'error':
      return 'Failed: ' + state.message;
    default: {
      const unreachable: never = state; // compile error if a variant is unhandled
      return unreachable;
    }
  }
}
\`\`\`

Compare this with one object holding \`isLoading\`, \`data?\` and \`error?\`: that version allows impossible combinations, such as loading with an error and data at the same time. The union makes illegal states unrepresentable.

### Exhaustiveness with never

\`never\` is the type with no values. In the \`default\` branch every variant has been handled, so \`state\` has type \`never\` and the assignment compiles. If a teammate later adds \`{ status: 'cancelled' }\`, \`state\` is no longer \`never\` in that branch, and the compiler points straight at the switch that needs updating.

### Common mistakes
- Narrowing with truthiness when \`0\` or \`''\` are valid: \`if (count)\` skips a real count of zero. Compare with \`!== undefined\` instead.
- Forgetting that \`typeof null === 'object'\`, so \`typeof x === 'object'\` does not rule out null.
- Using \`as\` to force a type. An assertion does no checking; narrowing does.
- Using a discriminant typed as plain \`string\`. It must be a literal type for narrowing to work.`,
      practice: [
        { title: 'Safe division', kind: 'problem', ref: 'safe-division' },
        { title: 'Evaluate reverse Polish notation', kind: 'problem', ref: 'evaluate-rpn' },
        { title: 'Request state', kind: 'exercise', prompt: 'Implement RequestState and render(state) from the lesson with the exhaustive never check. Then add a { status: "cancelled"; reason: string } variant and confirm the compiler points you to render before you handle it.' },
        { title: 'Narrow unknown', kind: 'exercise', prompt: 'Write isUser(value: unknown): value is { name: string; age: number } that checks typeof, null and both properties. Use it to safely read users from JSON.parse output, printing "invalid" for entries that fail.' },
      ],
      resources: [
        { title: 'Narrowing', url: 'https://www.typescriptlang.org/docs/handbook/2/narrowing.html', source: 'TypeScript Handbook', kind: 'docs' },
        { title: 'TypeScript Playground', url: 'https://www.typescriptlang.org/play', source: 'TypeScript', kind: 'interactive' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'typeof object',
          prompt: '`value` has type `string[] | null`. Inside `if (typeof value === \'object\') { ... }`, what is the type of `value`?',
          options: [
            { id: 'a', text: '`string[]`' },
            { id: 'b', text: '`string[] | null`' },
            { id: 'c', text: '`object`' },
          ],
          correct: ['b'],
          explanation: '`typeof null` is `\'object\'` in JavaScript, so this check does not remove null. Add `value !== null` to narrow to `string[]`.',
          difficulty: 'medium',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Discriminant',
          prompt: 'What makes a union a **discriminated** union?',
          options: [
            { id: 'a', text: 'Every member is a class' },
            { id: 'b', text: 'Every member has a common property with a distinct literal type' },
            { id: 'c', text: 'The union is declared with `interface` instead of `type`' },
          ],
          correct: ['b'],
          explanation: 'A shared property such as `status: \'loading\'` lets one equality check narrow the whole object to a single variant.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'Which narrow?',
          prompt: '`x` has a union type. Which of these narrow `x` inside the `if` block? Select all that apply.',
          options: [
            { id: 'a', text: '`if (typeof x === \'string\')`' },
            { id: 'b', text: '`if (x instanceof Date)`' },
            { id: 'c', text: '`if (\'radius\' in x)` when x is an object union' },
            { id: 'd', text: '`const s = x as string;`' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: '`typeof`, `instanceof` and `in` are runtime checks TypeScript understands. `as` is an assertion: it changes the static type without checking anything.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Exhaustive switch',
          prompt: 'In the `default` branch of a switch over a discriminated union, `const n: never = value;` compiles only when every variant has been handled by a case.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Only when nothing is left can the value be `never`. An unhandled variant makes the assignment a compile error, which is exactly the warning you want.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'Type predicate',
          prompt: 'Complete the signature of a reusable check: `function isString(x: unknown): x ____ string { return typeof x === \'string\'; }`',
          accepted: [['is']],
          explanation: 'A return type of the form `x is T` is a type predicate: when the function returns true, callers see `x` as `T`.',
          difficulty: 'easy',
        },
      ],
    },
    {
      slug: 'functions-and-generics',
      title: 'Functions and generics',
      module: 'Reusable code',
      skill: 'typescript',
      minutes: 50,
      objectives: [
        'Write function type signatures, including optional, default and rest parameters',
        'Create generic functions that keep type information',
        'Constrain generics with extends and keyof',
        'Decide when a generic is needed and when it is not',
      ],
      body: `### Function signatures

\`\`\`typescript
function greet(name: string, greeting = 'Hello', punctuation?: string): string {
  return greeting + ', ' + name + (punctuation ?? '!');
}

function sum(...values: number[]): number {    // rest parameter
  return values.reduce((a, b) => a + b, 0);
}

type Compare<T> = (a: T, b: T) => number;      // a function type
const byLength: Compare<string> = (a, b) => a.length - b.length;   // a and b inferred as string
\`\`\`

Default parameters get their type from the default value. Optional parameters (\`?\`) must come after required ones. A return type of \`void\` means "the caller should not use the result".

### Why generics?

Generics let one function work with many types **without losing information**, the way \`Array<T>\` does.

\`\`\`typescript
function firstAny(items: any[]): any {          // result type is lost
  return items[0];
}

function first<T>(items: T[]): T | undefined {  // T is a type parameter
  return items[0];
}

const n = first([1, 2, 3]);      // number | undefined
const s = first(['a', 'b']);     // string | undefined
\`\`\`

TypeScript **infers** \`T\` from the argument. Write it explicitly (\`first<string>([])\`) only when there is nothing to infer from.

### Constraints

When the function needs certain properties, constrain the type parameter with \`extends\`:

\`\`\`typescript
function longest<T extends { length: number }>(a: T, b: T): T {
  return a.length >= b.length ? a : b;
}

longest('apple', 'fig');   // OK: strings have length
longest([1, 2], [3]);      // OK: arrays have length
longest(10, 20);           // Error: number has no property 'length'
\`\`\`

\`keyof T\` is the union of T's property names, which lets you write a type-safe property getter:

\`\`\`typescript
function getProp<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}
const user = { name: 'Asha', age: 31 };
getProp(user, 'age');      // number
getProp(user, 'email');    // Error: '"email"' is not assignable to '"name" | "age"'
\`\`\`

### Worked example: groupBy

\`\`\`typescript
function groupBy<T>(items: T[], keyOf: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyOf(item);
    (groups[key] ??= []).push(item);
  }
  return groups;
}

const people = [{ name: 'Asha', team: 'web' }, { name: 'Ben', team: 'data' }, { name: 'Chen', team: 'web' }];
const byTeam = groupBy(people, (p) => p.team);
// byTeam.web is { name: string; team: string }[], and p was inferred inside the callback
\`\`\`

Generic types work the same way: \`interface ApiResponse<T> { data: T; error?: string }\`, then \`ApiResponse<User[]>\`.

### Common mistakes
- Reaching for \`any\` when a type parameter would keep the information.
- Adding a type parameter that is used only once, such as \`function log<T>(x: T): void\`. Plain \`unknown\` says the same thing more simply.
- Putting an optional parameter before a required one.
- Passing explicit type arguments everywhere instead of letting inference work.`,
      practice: [
        { title: 'Second largest distinct value', kind: 'problem', ref: 'second-largest-distinct' },
        { title: 'Top k frequent elements', kind: 'problem', ref: 'top-k-frequent' },
        { title: 'Typed helpers', kind: 'exercise', prompt: 'Write generic functions last<T>(items: T[]): T | undefined, uniqueBy<T>(items: T[], key: (item: T) => string): T[] and maxBy<T>(items: T[], score: (item: T) => number): T | undefined. Hover over each call in your editor to confirm the return types are inferred correctly.' },
        { title: 'Constrained generic', kind: 'exercise', prompt: 'Write pluck<T, K extends keyof T>(items: T[], key: K): T[K][] that returns one property from every item. Confirm that pluck(users, "nmae") is a compile error and that pluck(users, "age") returns number[].' },
      ],
      resources: [
        { title: 'More on Functions', url: 'https://www.typescriptlang.org/docs/handbook/2/functions.html', source: 'TypeScript Handbook', kind: 'docs' },
        { title: 'Generics', url: 'https://www.typescriptlang.org/docs/handbook/2/generics.html', source: 'TypeScript Handbook', kind: 'docs' },
        { title: 'Keyof Type Operator', url: 'https://www.typescriptlang.org/docs/handbook/2/keyof-types.html', source: 'TypeScript Handbook', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Inferred generic',
          prompt: 'Given `function first<T>(items: T[]): T | undefined`, what is the type of `first([\'a\', \'b\'])`?',
          options: [
            { id: 'a', text: '`any`' },
            { id: 'b', text: '`string`' },
            { id: 'c', text: '`string | undefined`' },
            { id: 'd', text: '`T`' },
          ],
          correct: ['c'],
          explanation: 'T is inferred as `string` from the argument, so the return type `T | undefined` becomes `string | undefined`.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Constraint failure',
          prompt: 'Why does `longest(10, 20)` fail when `longest` is declared as `<T extends { length: number }>(a: T, b: T) => T`?',
          options: [
            { id: 'a', text: 'Numbers cannot be compared with >=' },
            { id: 'b', text: '`number` does not have a `length` property, so it does not satisfy the constraint' },
            { id: 'c', text: 'Generic functions cannot accept primitive values' },
          ],
          correct: ['b'],
          explanation: '`extends { length: number }` only admits types with a numeric `length`, such as strings and arrays.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Property names',
          prompt: 'Complete the safe getter so `key` must be a property name of `obj`: `function getProp<T, K extends ____ T>(obj: T, key: K): T[K]`',
          accepted: [['keyof']],
          explanation: '`keyof T` is the union of T\'s property names, so K can only be one of them, and `T[K]` is that property\'s type.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Optional order',
          prompt: 'An optional parameter may come before a required parameter, as in `function f(a?: string, b: number)`.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Required parameters cannot follow optional ones. Reorder them, or give the earlier one a default value.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Generics versus any',
          prompt: 'What do you gain by writing `first<T>(items: T[]): T | undefined` instead of `first(items: any[]): any`? Select all that apply.',
          options: [
            { id: 'a', text: 'Callers get a precise result type and autocomplete on it' },
            { id: 'b', text: 'Misusing the result, such as calling a missing method, is a compile error' },
            { id: 'c', text: 'The function runs faster at runtime' },
            { id: 'd', text: 'The relationship between input and output types is documented in the signature' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'Generics are erased like all types, so runtime speed is unchanged. Their value is the type information they preserve for the compiler and for readers.',
          difficulty: 'medium',
        },
      ],
    },
    {
      slug: 'modules-and-utility-types',
      title: 'Modules and utility types',
      module: 'Reusable code',
      skill: 'typescript',
      minutes: 45,
      objectives: [
        'Export and import types alongside values, using import type where appropriate',
        'Derive types with Partial, Pick, Omit, Record and ReturnType',
        'Use keyof and typeof to build types from existing code',
        'Validate data from outside your program instead of trusting an assertion',
      ],
      body: `### Types travel through modules

\`\`\`typescript
// models.ts
export interface Product {
  id: string;
  name: string;
  price: number;
  tags: string[];
}

// catalog.ts
import type { Product } from './models';   // erased completely from the output
\`\`\`

\`import type\` tells readers and tools that the import is only used as a type, so it disappears from the compiled JavaScript and cannot create a runtime dependency.

### Utility types: derive, do not repeat

| Utility | Result |
|---|---|
| \`Partial<T>\` | every property optional |
| \`Required<T>\` | every property required |
| \`Readonly<T>\` | every property readonly |
| \`Pick<T, K>\` | only the properties in K |
| \`Omit<T, K>\` | every property except those in K |
| \`Record<K, V>\` | an object with keys K and values V |
| \`ReturnType<F>\` | the return type of function type F |
| \`Awaited<T>\` | the value inside a Promise |

\`\`\`typescript
type NewProduct = Omit<Product, 'id'>;                          // server assigns the id
type ProductPatch = Partial<Pick<Product, 'name' | 'price'>>;   // optional name and price
type PriceIndex = Record<string, number>;

function applyPatch(p: Product, patch: ProductPatch): Product {
  return { ...p, ...patch };
}
\`\`\`

Change \`Product\` and every derived type updates with it, so related types cannot drift apart.

### Types from values

\`typeof\` in a type position gives the type of a value, and \`keyof\` gives its keys:

\`\`\`typescript
const defaults = { theme: 'light', pageSize: 20 };
type Settings = typeof defaults;           // { theme: string; pageSize: number }
type SettingKey = keyof Settings;          // 'theme' | 'pageSize'

function makeId() { return { id: crypto.randomUUID(), createdAt: new Date() }; }
type IdInfo = ReturnType<typeof makeId>;   // { id: string; createdAt: Date }
\`\`\`

### Worked example: validating outside data

Types disappear at runtime, so \`fetch\` and \`JSON.parse\` give you data that has never been checked. An assertion such as \`as Product\` only silences the compiler. Treat the data as \`unknown\` and validate it:

\`\`\`typescript
function parseProduct(value: unknown): Product {
  if (typeof value !== 'object' || value === null) throw new Error('not an object');
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.name !== 'string' || typeof v.price !== 'number') {
    throw new Error('invalid product');
  }
  const tags = Array.isArray(v.tags) ? v.tags.filter((t): t is string => typeof t === 'string') : [];
  return { id: v.id, name: v.name, price: v.price, tags };
}

const product = parseProduct(JSON.parse('{"id":"p1","name":"Mug","price":8.5,"tags":["kitchen"]}'));
\`\`\`

Hand-written validators are fine for small shapes. Larger projects often use a schema validation library that produces both the check and the type from one definition.

### Common mistakes
- Using \`as SomeType\` on parsed JSON and assuming it was checked.
- Copying a large interface by hand to make a variation instead of using \`Pick\`, \`Omit\` or \`Partial\`.
- Expecting \`Omit\` to catch typos: \`Omit<User, 'pasword'>\` compiles and removes nothing, so double-check key names.
- Forgetting that \`Partial\` is shallow: nested objects keep their required properties.`,
      practice: [
        { title: 'Word frequency', kind: 'problem', ref: 'word-frequency' },
        { title: 'Derive, do not repeat', kind: 'exercise', prompt: 'Starting from interface User { id: string; name: string; email: string; passwordHash: string; createdAt: Date }, derive PublicUser (no passwordHash), CreateUserInput (no id or createdAt) and UpdateUserInput (id required, everything else optional) using utility types only. Add a field to User and check which derived types change.' },
        { title: 'Typed fetch', kind: 'exercise', prompt: 'Write async function getJson(url: string): Promise<unknown> and a parsePost(value: unknown): Post validator for interface Post { userId: number; id: number; title: string; body: string }. Use them to load https://jsonplaceholder.typicode.com/posts/1 and print the title, throwing a clear error if the shape is wrong.' },
      ],
      resources: [
        { title: 'Utility Types', url: 'https://www.typescriptlang.org/docs/handbook/utility-types.html', source: 'TypeScript Handbook', kind: 'docs' },
        { title: 'Modules', url: 'https://www.typescriptlang.org/docs/handbook/2/modules.html', source: 'TypeScript Handbook', kind: 'docs' },
        { title: 'Creating Types from Types', url: 'https://www.typescriptlang.org/docs/handbook/2/types-from-types.html', source: 'TypeScript Handbook', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'matching',
          title: 'Utility types',
          prompt: 'Match each utility type to what it produces.',
          pairs: {
            left: [
              { id: 'l1', text: '`Partial<T>`' },
              { id: 'l2', text: '`Pick<T, K>`' },
              { id: 'l3', text: '`Omit<T, K>`' },
              { id: 'l4', text: '`Record<K, V>`' },
            ],
            right: [
              { id: 'r1', text: 'T with every property optional' },
              { id: 'r2', text: 'Only the properties of T named in K' },
              { id: 'r3', text: 'T without the properties named in K' },
              { id: 'r4', text: 'An object type whose keys are K and values are V' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'These four cover most day-to-day derivations: making fields optional, selecting fields, removing fields and describing dictionaries.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'What as does',
          prompt: 'What does `const p = (await res.json()) as Product;` do at runtime?',
          options: [
            { id: 'a', text: 'Checks every property and throws if the shape is wrong' },
            { id: 'b', text: 'Nothing: the assertion only changes the static type the compiler sees' },
            { id: 'c', text: 'Converts the JSON into a Product instance' },
          ],
          correct: ['b'],
          explanation: 'Type assertions are erased. If the server sends the wrong shape you will find out later, somewhere less obvious. Validate instead.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'import type',
          prompt: 'An `import type { Product } from \'./models\'` statement is removed completely from the emitted JavaScript.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Type-only imports never reach the output, so they cannot cause a runtime dependency or a circular import at runtime.',
          difficulty: 'easy',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Return type utility',
          prompt: 'Complete the type that captures what `makeId` returns: `type IdInfo = ____<typeof makeId>;`',
          accepted: [['ReturnType']],
          explanation: '`ReturnType<F>` takes a function type, and `typeof makeId` turns the function value into its type.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'Omit with a typo',
          prompt: '`User` has a `password` property. What happens with `type Safe = Omit<User, \'pasword\'>;`?',
          options: [
            { id: 'a', text: 'A compile error, because pasword is not a key of User' },
            { id: 'b', text: 'It compiles, and Safe still contains password' },
            { id: 'c', text: 'TypeScript corrects the spelling automatically' },
          ],
          correct: ['b'],
          explanation: '`Omit` accepts any key, not just keys of T, so a typo silently removes nothing. Check names carefully, or compare against `keyof User`.',
          difficulty: 'hard',
        },
      ],
    },
    {
      slug: 'ts-classes-and-async',
      title: 'Classes and typed async code',
      module: 'Real-world TypeScript',
      skill: 'typescript',
      minutes: 55,
      milestone: true,
      completionCriteria: 'Complete the "Typed API client" exercise: every function has explicit return types, outside data is validated from unknown, and errors are returned as a Result union instead of thrown.',
      objectives: [
        'Write classes with typed fields, access modifiers and parameter properties',
        'Implement interfaces and write a generic class',
        'Type async functions with Promise<T> and handle unknown errors in catch',
        'Combine validation and discriminated unions in a small API client',
      ],
      body: `### Classes

\`\`\`typescript
interface Shape {
  area(): number;
}

class Rectangle implements Shape {
  constructor(public readonly width: number, public readonly height: number) {}   // parameter properties
  area(): number {
    return this.width * this.height;
  }
}

class Counter {
  #count = 0;                       // JavaScript private field: hidden at runtime too
  private label: string;            // TypeScript private: checked only at compile time
  constructor(label: string) {
    this.label = label;
  }
  increment(): number {
    return ++this.#count;
  }
}
\`\`\`

\`public\`, \`private\` and \`protected\` are compile-time checks. Fields written with \`#\` are private at runtime as well. **Parameter properties** (\`constructor(public readonly width: number)\`) declare and assign a field in one step. \`implements\` asks the compiler to confirm the class has everything the interface requires.

### A generic class

\`\`\`typescript
class Stack<T> {
  private items: T[] = [];
  push(item: T): void { this.items.push(item); }
  pop(): T | undefined { return this.items.pop(); }
  peek(): T | undefined { return this.items[this.items.length - 1]; }
  get size(): number { return this.items.length; }
}

const brackets = new Stack<string>();
brackets.push('(');
brackets.push(42);   // Error: number is not assignable to string
\`\`\`

### Async functions

An \`async\` function always returns a \`Promise\`. Annotate the value it resolves to:

\`\`\`typescript
async function delayedDouble(n: number): Promise<number> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return n * 2;
}

const pending = delayedDouble(4);          // Promise<number>
const value = await delayedDouble(4);      // number (await works in modules and async functions)
pending.toFixed(1);                        // Error: Property 'toFixed' does not exist on type 'Promise<number>'
\`\`\`

That last error catches the classic forgotten \`await\`. \`Promise.all\` keeps each position's type: \`await Promise.all([getUser(), getOrders()])\` gives a typed tuple.

### Worked example: a typed API client

\`\`\`typescript
interface Todo { id: number; title: string; completed: boolean }
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function isTodo(v: unknown): v is Todo {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'number' && typeof o.title === 'string' && typeof o.completed === 'boolean';
}

async function getTodo(id: number): Promise<Result<Todo>> {
  try {
    const res = await fetch('https://jsonplaceholder.typicode.com/todos/' + id);
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    const data: unknown = await res.json();
    return isTodo(data) ? { ok: true, value: data } : { ok: false, error: 'unexpected response shape' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const result = await getTodo(1);
if (result.ok) console.log(result.value.title);   // narrowed by the ok discriminant
else console.error(result.error);
\`\`\`

In strict mode the variable in \`catch (e)\` has type \`unknown\`, because JavaScript can throw any value, not only \`Error\` objects. Narrow it with \`instanceof Error\` before reading \`message\`.

### Common mistakes
- Forgetting \`await\` and passing a \`Promise<T>\` where a \`T\` was expected.
- Starting a promise without awaiting it or handling rejection (a floating promise), so errors vanish.
- Assuming \`private\` hides data at runtime; use \`#\` fields when that matters.
- Reading \`e.message\` in a catch block without checking that \`e\` is an \`Error\`.`,
      practice: [
        { title: 'Valid parentheses', kind: 'problem', ref: 'valid-parentheses' },
        { title: 'Typed API client', kind: 'exercise', prompt: 'Build getTodo and getUser (https://jsonplaceholder.typicode.com/users/1, interface User { id: number; name: string; email: string }) returning Promise<Result<T>>. Write a main function that loads both with Promise.all, prints the user name and todo title, and prints a clear message for each failure. No any, no as on response data.' },
        { title: 'Generic queue class', kind: 'exercise', prompt: 'Write class Queue<T> with enqueue, dequeue (returning T | undefined), peek and a size getter, using two arrays so dequeue is amortised O(1). Make the internal arrays # private and show that new Queue<number>().enqueue("x") is a compile error.' },
      ],
      resources: [
        { title: 'Classes', url: 'https://www.typescriptlang.org/docs/handbook/2/classes.html', source: 'TypeScript Handbook', kind: 'docs' },
        { title: 'async function', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'Narrowing', url: 'https://www.typescriptlang.org/docs/handbook/2/narrowing.html', source: 'TypeScript Handbook', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Async return type',
          prompt: 'What is the return type of `async function answer() { return 42; }`?',
          options: [
            { id: 'a', text: '`number`' },
            { id: 'b', text: '`Promise<number>`' },
            { id: 'c', text: '`Promise<void>`' },
          ],
          correct: ['b'],
          explanation: 'An async function always wraps its return value in a Promise. Callers need `await` to get the number.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'private at runtime',
          prompt: 'A field marked with the TypeScript `private` keyword cannot be read by any JavaScript code at runtime.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: '`private` is a compile-time check that is erased. JavaScript private fields written with `#` are enforced at runtime.',
          difficulty: 'medium',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Type in catch',
          prompt: 'With `strict` enabled, what is the type of `e` in `try { ... } catch (e) { ... }`?',
          options: [
            { id: 'a', text: '`Error`' },
            { id: 'b', text: '`any`' },
            { id: 'c', text: '`unknown`' },
          ],
          correct: ['c'],
          explanation: 'JavaScript can throw any value, so strict mode types catch variables as `unknown`. Check `e instanceof Error` before reading `e.message`.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Parameter property',
          prompt: 'Complete the constructor so `id` becomes a public field that cannot be reassigned: `constructor(public ____ id: string) {}`',
          accepted: [['readonly']],
          explanation: 'A modifier such as `public readonly` on a constructor parameter declares the field and assigns it in one step.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'What the compiler can catch',
          prompt: 'Which of these problems can TypeScript report at compile time? Select all that apply.',
          options: [
            { id: 'a', text: 'Reading `res.ok` on the result of `fetch(url)` without `await`' },
            { id: 'b', text: 'A class that says `implements Shape` but has no `area` method' },
            { id: 'c', text: 'A server that returns a todo whose `title` is a number' },
            { id: 'd', text: 'Pushing a number onto a `Stack<string>`' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'The compiler sees your code, not the network. Wrong server data can only be caught at runtime by validation, which is why the client checks responses from `unknown`.',
          difficulty: 'medium',
        },
      ],
    },
  ],
};

export const javaTrack: SeedTrack = {
  slug: 'java-foundations',
  title: 'Java Foundations',
  category: 'programming',
  summary: 'Learn Java, the language behind enterprise backends and Android, from your first class to the collections framework.',
  description: `**Who it's for:** learners aiming at backend, enterprise or Android development, and students preparing for Java-based courses or interviews.

**Prerequisites:** basic programming (variables, loops, functions) in any language.

**You will be able to:**
- compile and run Java programs with the JDK and read input from standard input
- use primitive types, strings, arrays and control flow without the classic pitfalls (integer division, overflow, \`==\` on strings)
- write methods and classes with constructors, encapsulated fields and records
- design with interfaces, inheritance and polymorphism, and know when composition fits better
- choose and use List, Set, Map, Deque and PriorityQueue from the collections framework
- transform data with lambdas, comparators and streams
- handle checked and unchecked exceptions and clean up resources with try-with-resources

**How it works:** eight topics, each with a lesson, worked examples, a quiz and practice. CodeLab problems accept Java (name your class \`Main\`), so you can apply every topic to real input and output tasks.

**Milestone:** *The collections framework* (topic 6).`,
  level: 'beginner',
  estimatedHours: 22,
  roles: ['backend developer', 'android developer', 'software engineer', 'full-stack developer'],
  contentStatus: 'complete',
  topics: [
    {
      slug: 'java-setup-and-first-program',
      title: 'Setup and your first program',
      module: 'Getting started',
      skill: 'java',
      minutes: 35,
      objectives: [
        'Install a JDK and check it with java -version',
        'Explain the roles of source code, bytecode and the JVM',
        'Write, compile and run a program with a main method',
        'Read input from standard input with Scanner',
      ],
      body: `Java source files (\`.java\`) are compiled by \`javac\` into **bytecode** (\`.class\` files). The **Java Virtual Machine (JVM)** runs that bytecode on any operating system, which is where the slogan "write once, run anywhere" comes from. The **JDK** (Java Development Kit) contains the compiler, the JVM and the standard library; install a current long-term support (LTS) release such as JDK 21 or 25.

### Your first program

\`\`\`java
// Hello.java (the file name must match the public class name)
public class Hello {
    public static void main(String[] args) {
        String name = args.length > 0 ? args[0] : "world";
        System.out.println("Hello, " + name + "!");
    }
}
\`\`\`

\`\`\`bash
java -version         # check the JDK is installed
javac Hello.java      # produces Hello.class
java Hello Asha       # prints: Hello, Asha!
java Hello.java       # Java 11+: compile and run a single file in one step
\`\`\`

Reading \`public static void main(String[] args)\` word by word:
- \`public\`: the JVM must be able to call it from outside the class.
- \`static\`: it belongs to the class, so no object needs to exist first.
- \`void\`: it returns nothing.
- \`String[] args\`: the command-line arguments.

Statements end with semicolons, blocks use braces, names are case-sensitive, and all code lives inside a class.

### Reading input

\`Scanner\` splits standard input into tokens separated by whitespace:

\`\`\`java
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int a = in.nextInt();
        int b = in.nextInt();
        System.out.println(a + b);
    }
}
\`\`\`

\`nextInt()\`, \`nextLong()\` and \`nextDouble()\` read one number, \`next()\` reads one word, and \`nextLine()\` reads the rest of the current line. For large inputs, \`BufferedReader\` with \`readLine()\` is noticeably faster.

### Java in CodeLab

CodeLab compiles your file as \`Main.java\`, so the public class must be called \`Main\`. Read the test input from \`System.in\` and print exactly the expected output with \`System.out.println\`.

### Trying ideas quickly

\`jshell\` (included since Java 9) is an interactive prompt: type \`2 + 3\` or \`"abc".toUpperCase()\` and see the result immediately, without writing a class.

### Common mistakes
- Saving \`public class Hello\` in a file with a different name. The compiler reports that the class must be declared in \`Hello.java\`.
- Running \`java Hello.class\`. Give the class name: \`java Hello\`.
- Writing \`string\` or \`system.out\`. Java is case-sensitive: \`String\`, \`System\`.
- Mixing \`nextInt()\` and \`nextLine()\`: after \`nextInt()\`, the newline is still waiting, so the next \`nextLine()\` returns an empty string.`,
      practice: [
        { title: 'Sum of two numbers', kind: 'problem', ref: 'sum-two-numbers' },
        { title: 'Even or odd', kind: 'problem', ref: 'even-or-odd' },
        { title: 'Install and run', kind: 'exercise', prompt: 'Install a current LTS JDK, run java -version, then write Hello.java and run it both with javac plus java and with the single-file java Hello.java command. Rename the class without renaming the file and read the compiler error.' },
        { title: 'Read input', kind: 'exercise', prompt: 'Use Scanner to read two integers and print their sum, difference and product, one per line. Then read a full name with nextLine() after the numbers and fix the empty-line problem described in Common mistakes.' },
      ],
      resources: [
        { title: 'Getting Started with Java', url: 'https://dev.java/learn/getting-started/', source: 'dev.java (Oracle)', kind: 'docs' },
        { title: 'The Java Tutorials: Getting Started', url: 'https://docs.oracle.com/javase/tutorial/getStarted/index.html', source: 'Oracle', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'What javac produces',
          prompt: 'What does `javac Hello.java` produce?',
          options: [
            { id: 'a', text: 'A native executable for the current operating system' },
            { id: 'b', text: 'A `Hello.class` file containing bytecode for the JVM' },
            { id: 'c', text: 'Nothing; it runs the program immediately' },
          ],
          correct: ['b'],
          explanation: '`javac` compiles source code into platform-independent bytecode. The `java` command starts a JVM to run it.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'File naming',
          prompt: 'A class declared as `public class Hello` must be saved in a file named `Hello.java`.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Each public top-level class must live in a file with the same name. This is also why CodeLab needs your class to be called `Main`.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Entry point',
          prompt: 'Complete the entry point of a Java program: `public static void ____(String[] args)`',
          accepted: [['main']],
          explanation: 'The JVM looks for a method called `main` with this signature and starts the program there.',
          difficulty: 'easy',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'JDK tools',
          prompt: 'Match each tool to its job.',
          pairs: {
            left: [
              { id: 'l1', text: '`javac`' },
              { id: 'l2', text: '`java`' },
              { id: 'l3', text: 'The JVM' },
              { id: 'l4', text: '`jshell`' },
            ],
            right: [
              { id: 'r1', text: 'Compiles .java source into bytecode' },
              { id: 'r2', text: 'Launches a program by class name' },
              { id: 'r3', text: 'Executes bytecode on the current operating system' },
              { id: 'r4', text: 'Evaluates Java snippets interactively' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'The compiler and launcher are separate tools; the launcher starts the JVM, which runs the bytecode. jshell is a quick experimentation prompt.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'Scanner tokens',
          prompt: 'The input is a single line `Asha Khan`. What does the first call to `in.next()` return?',
          options: [
            { id: 'a', text: '`"Asha"`' },
            { id: 'b', text: '`"Asha Khan"`' },
            { id: 'c', text: 'An empty string' },
          ],
          correct: ['a'],
          explanation: '`next()` returns the next whitespace-separated token. Use `nextLine()` to read the whole line.',
          difficulty: 'medium',
        },
      ],
    },
    {
      slug: 'java-types-and-control-flow',
      title: 'Types, strings and control flow',
      module: 'Getting started',
      skill: 'java',
      minutes: 45,
      objectives: [
        'Use primitive types (int, long, double, boolean, char) and String',
        'Predict integer division, casting and overflow results',
        'Explain the difference between == and equals() for objects',
        'Write if, switch expressions, for, enhanced for and while loops',
      ],
      body: `Java is **statically typed**: every variable has a type fixed at compile time. \`var\` lets the compiler infer the type of a local variable, but the type is still fixed.

### Primitive types and String

| Type | Holds | Example |
|---|---|---|
| \`int\` | 32-bit whole numbers (about plus or minus 2.1 billion) | \`int count = 3;\` |
| \`long\` | 64-bit whole numbers | \`long big = 9_000_000_000L;\` |
| \`double\` | 64-bit decimals | \`double price = 19.99;\` |
| \`boolean\` | \`true\` or \`false\` | \`boolean ok = true;\` |
| \`char\` | one UTF-16 character, single quotes | \`char grade = 'A';\` |

\`String\` (double quotes) is an **object**, not a primitive, and it is immutable: methods such as \`toUpperCase()\` return a new string.

### Arithmetic surprises

\`\`\`java
int a = 7 / 2;            // 3: int / int truncates toward zero
double b = 7 / 2;         // 3.0: the division happened in int first
double c = 7 / 2.0;       // 3.5: one double operand makes it a double division
int d = (int) 3.99;       // 3: casting truncates
int big = Integer.MAX_VALUE + 1;   // -2147483648: silent overflow
long safe = 2_000_000_000L * 2;    // 4000000000: the L makes it long arithmetic
\`\`\`

### Comparing strings

\`==\` on objects checks whether two references point at the **same object**. To compare contents, use \`equals\`:

\`\`\`java
String typed = new Scanner(System.in).next();   // user types: yes
System.out.println(typed == "yes");             // false (different objects)
System.out.println(typed.equals("yes"));        // true
System.out.println("YES".equalsIgnoreCase(typed)); // true
\`\`\`

### Decisions and loops

\`\`\`java
int[] scores = {72, 95, 88, 41};
int passed = 0;
for (int s : scores) {            // enhanced for: each element in turn
    if (s >= 50) passed++;
}

for (int i = 0; i < scores.length; i++) { /* index-based loop */ }

int n = 37;
while (n != 1) {                  // Collatz steps
    n = (n % 2 == 0) ? n / 2 : 3 * n + 1;
}

char grade = 'B';
String label = switch (grade) {   // switch expression (Java 14+)
    case 'A', 'B' -> "good";
    case 'C' -> "fair";
    default -> "needs work";
};
\`\`\`

The arrow form of \`switch\` never falls through to the next case, and as an expression it must cover every possibility (hence \`default\`). \`break\` leaves a loop early and \`continue\` skips to the next iteration.

### Worked example: FizzBuzz

\`\`\`java
for (int i = 1; i <= 15; i++) {
    if (i % 15 == 0) System.out.println("FizzBuzz");
    else if (i % 3 == 0) System.out.println("Fizz");
    else if (i % 5 == 0) System.out.println("Buzz");
    else System.out.println(i);
}
\`\`\`

Checking 15 first matters: a number divisible by 15 is also divisible by 3, and the first matching branch wins.

### Common mistakes
- Comparing strings with \`==\`. Use \`equals\`.
- Dividing two ints and expecting a decimal: write \`7 / 2.0\` or cast one operand to \`double\`.
- Overflowing \`int\` when multiplying large values; use \`long\` (and an \`L\` suffix on literals).
- Using double quotes for a \`char\` (\`'A'\` is a char, \`"A"\` is a String).
- In the old colon form of \`switch\`, forgetting \`break\`, so execution falls into the next case.`,
      practice: [
        { title: 'FizzBuzz', kind: 'problem', ref: 'fizzbuzz' },
        { title: 'Grade calculator', kind: 'problem', ref: 'grade-calculator' },
        { title: 'Prime checker', kind: 'problem', ref: 'prime-checker' },
        { title: 'String equality', kind: 'exercise', prompt: 'Read a word with Scanner and compare it to "yes" using ==, equals() and equalsIgnoreCase(). Print all three results and explain each in one sentence.' },
      ],
      resources: [
        { title: 'Language Basics', url: 'https://dev.java/learn/language-basics/', source: 'dev.java (Oracle)', kind: 'docs' },
        { title: 'The Java Tutorials: Language Basics', url: 'https://docs.oracle.com/javase/tutorial/java/nutsandbolts/index.html', source: 'Oracle', kind: 'docs' },
        { title: 'The Java Tutorials: Strings', url: 'https://docs.oracle.com/javase/tutorial/java/data/strings.html', source: 'Oracle', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Integer division',
          prompt: 'What does `double r = 7 / 2;` store in `r`?',
          options: [
            { id: 'a', text: '`3.5`' },
            { id: 'b', text: '`3.0`' },
            { id: 'c', text: '`4.0`' },
          ],
          correct: ['b'],
          explanation: 'Both operands are ints, so `7 / 2` is computed as the int `3` first and only then widened to `3.0`. Write `7 / 2.0` to get 3.5.',
          difficulty: 'medium',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Comparing contents',
          prompt: 'Which expression correctly checks whether the String `answer` contains the text `yes`?',
          options: [
            { id: 'a', text: '`answer == "yes"`' },
            { id: 'b', text: '`answer.equals("yes")`' },
            { id: 'c', text: '`answer = "yes"`' },
          ],
          correct: ['b'],
          explanation: '`equals` compares characters. `==` compares references and can be false for equal text; `=` is assignment.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'Primitive types',
          prompt: 'Which of these are primitive types in Java? Select all that apply.',
          options: [
            { id: 'a', text: '`int`' },
            { id: 'b', text: '`boolean`' },
            { id: 'c', text: '`String`' },
            { id: 'd', text: '`double`' },
            { id: 'e', text: '`Integer`' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: '`String` and `Integer` are classes (reference types). `Integer` is the object wrapper for `int`.',
          difficulty: 'easy',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Long literal',
          prompt: 'Complete the literal so it compiles as a long: `long big = 9_000_000_000____;`',
          accepted: [['L', 'l']],
          explanation: 'Without the `L` suffix the literal is an int, and 9 billion is too large for int. Prefer uppercase `L`, which cannot be mistaken for the digit 1.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'true_false',
          title: 'Arrow switch',
          prompt: 'In a `switch` written with arrows (`case \'A\' -> ...`), execution falls through to the next case unless you write `break`.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Arrow cases never fall through. Fall-through only happens in the older colon form (`case \'A\':`) when `break` is missing.',
          difficulty: 'easy',
        },
      ],
    },
    {
      slug: 'java-methods-and-arrays',
      title: 'Methods, arrays and string building',
      module: 'Getting started',
      skill: 'java',
      minutes: 50,
      objectives: [
        'Write static methods with parameters and return values, including overloads',
        'Explain how Java passes primitives and references to methods',
        'Create, loop over, sort and print arrays, including 2D arrays',
        'Use common String methods and StringBuilder to build output efficiently',
      ],
      body: `### Methods

A method groups steps under a name. For now, write them as \`static\` methods inside your \`Main\` class.

\`\`\`java
public class Main {
    static int max(int a, int b) {           // parameters and a return type
        return a >= b ? a : b;
    }

    static double max(double a, double b) {  // overload: same name, different parameter types
        return a >= b ? a : b;
    }

    static boolean isPalindrome(String s) {
        int i = 0, j = s.length() - 1;
        while (i < j) {
            if (s.charAt(i) != s.charAt(j)) return false;
            i++;
            j--;
        }
        return true;
    }

    public static void main(String[] args) {
        System.out.println(max(3, 9));             // 9
        System.out.println(isPalindrome("level")); // true
    }
}
\`\`\`

### Pass by value, including references

Java always passes **copies**. For a primitive, the method gets a copy of the number, so changing it has no effect outside. For an object or array, the method gets a copy of the **reference**, so it can change the object the caller is also looking at:

\`\`\`java
static void bump(int x) { x++; }              // caller's variable unchanged
static void bumpFirst(int[] arr) { arr[0]++; } // caller's array IS changed
\`\`\`

### Arrays

Arrays have a fixed length chosen at creation, and elements start at a default value (\`0\`, \`false\` or \`null\`).

\`\`\`java
import java.util.Arrays;

int[] nums = new int[5];                 // [0, 0, 0, 0, 0]
int[] primes = {2, 3, 5, 7, 11};
System.out.println(primes.length);       // 5 (a field, no parentheses)
System.out.println(primes);              // something like [I@1b6d3586: not the contents
System.out.println(Arrays.toString(primes)); // [2, 3, 5, 7, 11]

int[] copy = Arrays.copyOf(primes, primes.length);
Arrays.sort(copy);                       // sorts in place, ascending

int[][] grid = new int[3][4];            // 3 rows, 4 columns
grid[1][2] = 7;
for (int[] row : grid) System.out.println(Arrays.toString(row));
\`\`\`

### Strings and StringBuilder

Useful String methods: \`length()\`, \`charAt(i)\`, \`substring(start, end)\` (end excluded), \`indexOf\`, \`contains\`, \`trim()\`, \`split(" ")\`, \`toCharArray()\` and \`String.join(", ", parts)\`.

Because strings are immutable, \`s += x\` in a loop creates a new string every time. \`StringBuilder\` appends in place:

### Worked example: reverse the words

\`\`\`java
static String reverseWords(String line) {
    String[] words = line.trim().split(" +");    // one or more spaces
    StringBuilder sb = new StringBuilder();
    for (int i = words.length - 1; i >= 0; i--) {
        sb.append(words[i]);
        if (i > 0) sb.append(' ');
    }
    return sb.toString();
}
// reverseWords("  the quick  fox ") returns "fox quick the"
\`\`\`

\`split\` takes a regular expression, so \`" +"\` means "one or more spaces". Building the result with \`StringBuilder\` keeps the method O(n) instead of O(n squared) for long inputs.

### Common mistakes
- Looping with \`i <= arr.length\`, which throws \`ArrayIndexOutOfBoundsException\` on the last step. Valid indexes are \`0\` to \`length - 1\`.
- Printing an array directly instead of using \`Arrays.toString\`.
- Mixing up \`arr.length\` (arrays), \`s.length()\` (strings) and \`list.size()\` (collections).
- Concatenating strings in a long loop instead of using \`StringBuilder\`.
- Being surprised that a method changed your array: the reference was copied, not the array.`,
      practice: [
        { title: 'Largest and smallest', kind: 'problem', ref: 'max-and-min' },
        { title: 'Running sum', kind: 'problem', ref: 'running-sum' },
        { title: 'Palindrome check', kind: 'problem', ref: 'palindrome-check' },
        { title: 'Reverse the words', kind: 'problem', ref: 'reverse-words' },
        { title: 'Matrix helpers', kind: 'exercise', prompt: 'Write static methods int[][] transpose(int[][] m) and int[] rowSums(int[][] m). Read a matrix (first line: rows and columns, then the rows) with Scanner, and print the transpose and the row sums using Arrays.toString.' },
      ],
      resources: [
        { title: 'The Java Tutorials: Defining Methods', url: 'https://docs.oracle.com/javase/tutorial/java/javaOO/methods.html', source: 'Oracle', kind: 'docs' },
        { title: 'The Java Tutorials: Arrays', url: 'https://docs.oracle.com/javase/tutorial/java/nutsandbolts/arrays.html', source: 'Oracle', kind: 'docs' },
        { title: 'The Java Tutorials: Strings', url: 'https://docs.oracle.com/javase/tutorial/java/data/strings.html', source: 'Oracle', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Printing an array',
          prompt: 'What does `System.out.println(new int[]{1, 2, 3});` print?',
          options: [
            { id: 'a', text: '`[1, 2, 3]`' },
            { id: 'b', text: '`1 2 3`' },
            { id: 'c', text: 'A type code and hash such as `[I@1b6d3586`' },
          ],
          correct: ['c'],
          explanation: 'Arrays do not override `toString`, so you get the default object description. Use `Arrays.toString(arr)` to print the contents.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'matching',
          title: 'Size of things',
          prompt: 'Match each value to the correct way of getting its size.',
          pairs: {
            left: [
              { id: 'l1', text: '`int[] arr`' },
              { id: 'l2', text: '`String s`' },
              { id: 'l3', text: '`List<String> list`' },
            ],
            right: [
              { id: 'r1', text: '`arr.length`' },
              { id: 'r2', text: '`s.length()`' },
              { id: 'r3', text: '`list.size()`' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3' },
          explanation: 'Arrays expose a `length` field, strings a `length()` method and collections a `size()` method. Mixing them up is a common compile error.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Arrays as parameters',
          prompt: 'If a method receives an `int[]` parameter and runs `arr[0] = 99;`, the caller\'s array also changes.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Java copies the reference, and both copies point at the same array. Reassigning the parameter (`arr = new int[3]`) would not affect the caller, but changing elements does.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'Default values',
          prompt: 'What are the elements of `new int[3]` immediately after creation?',
          options: [
            { id: 'a', text: '`0, 0, 0`' },
            { id: 'b', text: '`null, null, null`' },
            { id: 'c', text: 'Unpredictable leftover values' },
          ],
          correct: ['a'],
          explanation: 'Java always initialises array elements: numbers to 0, booleans to false and references to null.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'Building strings',
          prompt: 'Complete the line with the class that appends text in place, so building output in a loop stays fast: `var sb = new ____();`',
          accepted: [['StringBuilder']],
          explanation: '`StringBuilder` keeps a growable buffer. Repeated `+=` on a String copies the whole string each time.',
          difficulty: 'easy',
        },
      ],
    },
    {
      slug: 'classes-and-objects',
      title: 'Classes, objects and records',
      module: 'Object-oriented Java',
      skill: 'oop',
      minutes: 50,
      objectives: [
        'Define classes with private fields, constructors and methods',
        'Explain encapsulation and why fields are usually private',
        'Tell static members apart from instance members',
        'Use records for simple immutable data and override toString, equals and hashCode when needed',
      ],
      body: `A **class** is a blueprint; an **object** is an instance created with \`new\`. Each object has its own copy of the instance fields.

### Encapsulation

Keep fields \`private\` and expose behaviour through methods, so the class controls its own rules and nobody can put it into an invalid state.

\`\`\`java
public class BankAccount {
    private static int accountsOpened = 0;   // static: one value shared by the class
    private final String owner;              // final: assigned once, in the constructor
    private long balanceCents;               // instance field: one per object

    public BankAccount(String owner) {
        if (owner == null || owner.isBlank()) throw new IllegalArgumentException("owner required");
        this.owner = owner;                  // this.owner is the field, owner is the parameter
        accountsOpened++;
    }

    public void deposit(long cents) {
        if (cents <= 0) throw new IllegalArgumentException("deposit must be positive");
        balanceCents += cents;
    }

    public void withdraw(long cents) {
        if (cents > balanceCents) throw new IllegalStateException("insufficient funds");
        balanceCents -= cents;
    }

    public long getBalanceCents() { return balanceCents; }
    public String getOwner() { return owner; }
    public static int getAccountsOpened() { return accountsOpened; }

    @Override
    public String toString() {
        return owner + ": " + balanceCents + " cents";
    }
}

BankAccount acc = new BankAccount("Asha");
acc.deposit(2500);
acc.withdraw(700);
System.out.println(acc);                           // Asha: 1800 cents
System.out.println(BankAccount.getAccountsOpened()); // 1
\`\`\`

Storing money as whole cents in a \`long\` avoids the rounding errors of \`double\`. Because \`balanceCents\` is private, the only way to change it is through \`deposit\` and \`withdraw\`, which enforce the rules.

### Static versus instance

Instance members belong to each object (\`acc.deposit(...)\`). \`static\` members belong to the class itself (\`BankAccount.getAccountsOpened()\`) and cannot use \`this\` or instance fields directly. Utility methods such as \`Math.max\` are static.

### Records

For plain data carriers, a **record** (Java 16+) generates a constructor, accessor methods, \`equals\`, \`hashCode\` and \`toString\`. Fields are private and final, so records are immutable.

\`\`\`java
public record Point(int x, int y) {
    public Point {                            // compact constructor for validation
        if (x < 0 || y < 0) throw new IllegalArgumentException("negative coordinate");
    }
    public double distanceToOrigin() { return Math.sqrt(x * x + y * y); }
}

Point p = new Point(3, 4);
System.out.println(p.x() + " " + p);          // 3 Point[x=3, y=4]
System.out.println(p.equals(new Point(3, 4))); // true: compares fields
System.out.println(p.distanceToOrigin());     // 5.0
\`\`\`

### equals and hashCode

For ordinary classes, \`equals\` inherited from \`Object\` compares identity, like \`==\`. If two objects with the same data should count as equal (for example as \`HashMap\` keys), override **both** \`equals\` and \`hashCode\`, or use a record.

### Common mistakes
- Making fields public, so any code can break the class's rules.
- Writing \`owner = owner;\` in a constructor, which assigns the parameter to itself. Use \`this.owner = owner;\`.
- Overriding \`equals\` but not \`hashCode\`, which breaks \`HashSet\` and \`HashMap\`.
- Calling a method on a variable that was never assigned an object, causing a \`NullPointerException\`.
- Making everything \`static\` to avoid creating objects, which turns a class into a bag of global state.`,
      practice: [
        { title: 'Bank account', kind: 'exercise', prompt: 'Extend BankAccount with transferTo(BankAccount other, long cents) that either moves the money completely or leaves both accounts unchanged. Write a main method that exercises a successful transfer, an overdraft and a negative amount, printing each account after every step.' },
        { title: 'Records', kind: 'exercise', prompt: 'Create record Student(String name, int score) with a compact constructor that rejects scores outside 0 to 100. Read five students from standard input, store them in an array and print the one with the highest score.' },
        { title: 'Equality experiment', kind: 'exercise', prompt: 'Write a class Card with rank and suit fields but no equals or hashCode. Add two equal cards to a HashSet and print its size. Then convert Card to a record and run it again. Explain the difference.' },
      ],
      resources: [
        { title: 'The Java Tutorials: Classes and Objects', url: 'https://docs.oracle.com/javase/tutorial/java/javaOO/index.html', source: 'Oracle', kind: 'docs' },
        { title: 'Learn Java', url: 'https://dev.java/learn/', source: 'dev.java (Oracle)', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Why private fields',
          prompt: 'What is the main reason to make a class\'s fields `private`?',
          options: [
            { id: 'a', text: 'Private fields use less memory' },
            { id: 'b', text: 'The class can enforce its own rules, because other code must go through its methods' },
            { id: 'c', text: 'Private fields cannot be changed, even by the class itself' },
          ],
          correct: ['b'],
          explanation: 'This is encapsulation. A private balance can only change through methods that validate the change.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'multi',
          title: 'Record features',
          prompt: 'What does `record Point(int x, int y) {}` generate for you? Select all that apply.',
          options: [
            { id: 'a', text: 'A constructor taking x and y' },
            { id: 'b', text: 'Accessor methods `x()` and `y()`' },
            { id: 'c', text: '`equals`, `hashCode` and `toString` based on the fields' },
            { id: 'd', text: 'Setter methods `setX` and `setY`' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Record fields are final, so there are no setters. To "change" a record, create a new one.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'equals and hashCode',
          prompt: 'If you override `equals` in a class, you should also override `hashCode`.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Equal objects must have equal hash codes. Otherwise hash-based collections put equal objects in different buckets and treat them as different.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Field versus parameter',
          prompt: 'Complete the constructor line so the field is set from the parameter of the same name: `____.owner = owner;`',
          accepted: [['this']],
          explanation: '`this` refers to the current object, so `this.owner` is the field and plain `owner` is the parameter.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'static fields',
          prompt: 'A field is declared `private static int accountsOpened`. How many copies of it exist when the program has created 10 BankAccount objects?',
          options: [
            { id: 'a', text: 'One, shared by the class' },
            { id: 'b', text: 'Ten, one per object' },
            { id: 'c', text: 'Eleven, one per object plus the class' },
          ],
          correct: ['a'],
          explanation: 'Static fields belong to the class, not to individual objects, so every account sees the same counter.',
          difficulty: 'easy',
        },
      ],
    },
    {
      slug: 'interfaces-and-inheritance',
      title: 'Interfaces, inheritance and polymorphism',
      module: 'Object-oriented Java',
      skill: 'oop',
      minutes: 50,
      objectives: [
        'Define and implement interfaces, including default methods',
        'Use inheritance with extends, abstract classes, super and @Override',
        'Explain polymorphism and program to an interface',
        'Prefer composition when inheritance does not fit',
      ],
      body: `An **interface** defines what a type can do; classes promise to do it with \`implements\`. Code written against the interface works with any implementation, chosen at runtime. That is **polymorphism**.

\`\`\`java
import java.util.List;

public interface Shape {
    double area();
    default String describe() {                 // default method: shared implementation
        return getClass().getSimpleName() + " with area " + String.format("%.2f", area());
    }
}

public record Circle(double r) implements Shape {
    public double area() { return Math.PI * r * r; }
}

public record Rect(double w, double h) implements Shape {
    public double area() { return w * h; }
}

List<Shape> shapes = List.of(new Circle(1), new Rect(2, 3));
double total = 0;
for (Shape s : shapes) total += s.area();      // each object runs its own area()
\`\`\`

The loop never asks "which kind of shape is this?". Adding a \`Triangle\` later requires no change to the loop. This is **dynamic dispatch**: the method that runs depends on the object's actual class, not the variable's declared type.

### Inheritance and abstract classes

\`extends\` creates a subclass that inherits fields and methods. An **abstract** class can hold shared state and code but cannot be instantiated; its abstract methods must be implemented by subclasses.

\`\`\`java
public abstract class Employee {
    private final String name;
    protected Employee(String name) { this.name = name; }
    public String getName() { return name; }
    public abstract long monthlyPayCents();

    @Override
    public String toString() { return name + " earns " + monthlyPayCents() + " cents"; }
}

public class Salaried extends Employee {
    private final long annualCents;
    public Salaried(String name, long annualCents) {
        super(name);                            // call the parent constructor first
        this.annualCents = annualCents;
    }
    @Override
    public long monthlyPayCents() { return annualCents / 12; }
}
\`\`\`

A class can \`extend\` only **one** class but \`implement\` **many** interfaces. Always write \`@Override\`: if you misspell the method or get the parameters wrong, the compiler reports it instead of silently creating a new method.

### Sealed interfaces and pattern matching (Java 21)

When the set of variants is fixed, a \`sealed\` interface lets a \`switch\` check that every case is covered:

\`\`\`java
sealed interface Payment permits Card, Wallet {}
record Card(String last4) implements Payment {}
record Wallet(long balanceCents) implements Payment {}

static String label(Payment p) {
    return switch (p) {
        case Card c -> "card ending " + c.last4();
        case Wallet w -> "wallet with " + w.balanceCents() + " cents";
    };                                          // no default needed: the compiler knows all cases
}
\`\`\`

### Composition over inheritance

Inheritance models "is a" (a \`Salaried\` is an \`Employee\`). When one class merely **uses** another, hold it as a field instead: a \`Checkout\` *has a* \`PaymentMethod\`. Composition keeps classes loosely coupled and lets you swap behaviour by passing a different object.

### Common mistakes
- Omitting \`@Override\` and accidentally overloading, for example writing \`equals(Point other)\` instead of \`equals(Object other)\`.
- Building deep inheritance trees to reuse a few lines of code; prefer small interfaces and composition.
- Chains of \`instanceof\` checks where a polymorphic method (or a sealed switch) would be clearer.
- Forgetting that a subclass constructor must call \`super(...)\` when the parent has no no-argument constructor.`,
      practice: [
        { title: 'Evaluate reverse Polish notation', kind: 'problem', ref: 'evaluate-rpn' },
        { title: 'Payment methods', kind: 'exercise', prompt: 'Define interface PaymentMethod { boolean pay(long cents); } with CardPayment (always succeeds, logs the amount) and WalletPayment (has a balance and fails when it is too low). Write a Checkout class that receives any PaymentMethod in its constructor and test it with both.' },
        { title: 'Employees', kind: 'exercise', prompt: 'Create the abstract Employee class from the lesson plus Salaried and Hourly (hours times rate) subclasses. Put a mix in a List<Employee>, print each with toString, and print the total monthly payroll.' },
      ],
      resources: [
        { title: 'The Java Tutorials: Interfaces and Inheritance', url: 'https://docs.oracle.com/javase/tutorial/java/IandI/index.html', source: 'Oracle', kind: 'docs' },
        { title: 'Learn Java', url: 'https://dev.java/learn/', source: 'dev.java (Oracle)', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Extends and implements',
          prompt: 'How many classes can a Java class extend, and how many interfaces can it implement?',
          options: [
            { id: 'a', text: 'One class, many interfaces' },
            { id: 'b', text: 'Many classes, one interface' },
            { id: 'c', text: 'Many classes and many interfaces' },
          ],
          correct: ['a'],
          explanation: 'Java has single inheritance for classes, but a class may implement any number of interfaces.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Dynamic dispatch',
          prompt: 'Given `Shape s = new Circle(1);`, which `area()` runs when you call `s.area()`?',
          options: [
            { id: 'a', text: 'The one in `Shape`, because that is the declared type' },
            { id: 'b', text: 'The one in `Circle`, because that is the actual object' },
            { id: 'c', text: 'It does not compile, because `Shape` is an interface' },
          ],
          correct: ['b'],
          explanation: 'The declared type decides which methods you may call; the runtime class of the object decides which implementation runs.',
          difficulty: 'medium',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Is @Override required?',
          prompt: 'A method only overrides its parent\'s method if it is annotated with `@Override`.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Overriding works without the annotation. `@Override` asks the compiler to confirm you really are overriding, which catches typos and wrong parameter types.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'OOP vocabulary',
          prompt: 'Match each term to its description.',
          pairs: {
            left: [
              { id: 'l1', text: 'Interface' },
              { id: 'l2', text: 'Abstract class' },
              { id: 'l3', text: 'Composition' },
              { id: 'l4', text: 'Polymorphism' },
            ],
            right: [
              { id: 'r1', text: 'A contract of methods a class promises to provide' },
              { id: 'r2', text: 'A partial implementation that cannot be instantiated directly' },
              { id: 'r3', text: 'Holding another object as a field and delegating to it' },
              { id: 'r4', text: 'One piece of code working with many types through a shared interface' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'Interfaces and abstract classes define shared types, composition reuses behaviour without inheritance, and polymorphism is what lets code depend only on the shared type.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'Implement an interface',
          prompt: '`Shape` is an interface. Complete the declaration: `public class Square ____ Shape { ... }`',
          accepted: [['implements']],
          explanation: 'Classes `implement` interfaces and `extend` classes. An interface that builds on another interface uses `extends`.',
          difficulty: 'easy',
        },
      ],
    },
    {
      slug: 'collections-framework',
      title: 'The collections framework',
      module: 'Working with data',
      skill: 'java',
      minutes: 60,
      milestone: true,
      completionCriteria: 'Complete the "Word counter" exercise using a Map and print results sorted by count, solve the "Word frequency" CodeLab problem in Java, and score 70% or more on the quiz.',
      objectives: [
        'Use List, Set and Map through their interfaces, with generics for type safety',
        'Pick ArrayList, HashSet, HashMap, TreeMap, ArrayDeque or PriorityQueue for a task',
        'Iterate, sort with comparators and update maps with getOrDefault and merge',
        'Avoid boxing and modification pitfalls',
      ],
      body: `The collections framework provides ready-made, well-tested data structures. Declare variables with the **interface** type and choose the implementation on the right, so you can swap it later without touching the rest of the code.

\`\`\`java
import java.util.*;

List<String> names = new ArrayList<>(List.of("Chen", "Asha", "Ben"));
names.add("Dee");
Collections.sort(names);                    // [Asha, Ben, Chen, Dee]
names.sort(Comparator.comparing(String::length).thenComparing(Comparator.naturalOrder()));

Set<Integer> seen = new HashSet<>();
boolean added = seen.add(3);                // true
added = seen.add(3);                        // false: already present, size stays 1

Map<String, Integer> stock = new HashMap<>();
stock.put("apples", 3);
stock.merge("apples", 2, Integer::sum);     // 5: add 2 to the existing value
stock.getOrDefault("pears", 0);             // 0: no exception for a missing key
for (Map.Entry<String, Integer> e : stock.entrySet()) {
    System.out.println(e.getKey() + " " + e.getValue());
}
\`\`\`

The \`<String>\` part is a **generic** type argument: the compiler stops you adding an \`Integer\` to a \`List<String>\`, and you never need casts when reading.

### Choosing an implementation

| Need | Use | Typical cost |
|---|---|---|
| Ordered list, fast index access | \`ArrayList\` | get O(1), add at end amortised O(1) |
| Unique values, fast membership | \`HashSet\` | add/contains O(1) average |
| Key to value, fast lookup | \`HashMap\` | get/put O(1) average |
| Keys kept sorted, range queries | \`TreeMap\` / \`TreeSet\` | O(log n) |
| Stack or queue | \`ArrayDeque\` | push/pop/offer/poll O(1) |
| Always take the smallest (or largest) | \`PriorityQueue\` | offer/poll O(log n) |
| Insertion order with uniqueness | \`LinkedHashSet\` / \`LinkedHashMap\` | O(1) average |

\`\`\`java
Deque<Character> stack = new ArrayDeque<>();
stack.push('(');
char top = stack.pop();

PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Comparator.reverseOrder());
maxHeap.addAll(List.of(5, 1, 9));
maxHeap.poll();                              // 9
\`\`\`

### Worked example: word counter

\`\`\`java
import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        Map<String, Integer> counts = new HashMap<>();
        while (in.hasNext()) {
            counts.merge(in.next().toLowerCase(), 1, Integer::sum);
        }

        List<Map.Entry<String, Integer>> entries = new ArrayList<>(counts.entrySet());
        entries.sort((a, b) -> {
            int byCount = Integer.compare(b.getValue(), a.getValue());   // descending count
            return byCount != 0 ? byCount : a.getKey().compareTo(b.getKey());   // then A to Z
        });

        for (Map.Entry<String, Integer> e : entries) {
            System.out.println(e.getKey() + " " + e.getValue());
        }
    }
}
\`\`\`

For the input \`the cat the hat\` this prints \`the 2\`, then \`cat 1\` and \`hat 1\`. The comparator returns a negative number when \`a\` should come first, zero when they tie and a positive number otherwise.

### Boxing

Collections hold objects, so \`int\` values are **boxed** into \`Integer\`. You must write \`Map<String, Integer>\`, not \`Map<String, int>\`, and you should compare boxed values with \`equals\` or unbox them first, because \`==\` compares references.

### Common mistakes
- Removing elements inside a for-each loop, which throws \`ConcurrentModificationException\`. Use \`list.removeIf(x -> ...)\` or an \`Iterator\`.
- Calling \`add\` on \`List.of(...)\`, which is immutable and throws \`UnsupportedOperationException\`. Copy it into \`new ArrayList<>(...)\` first.
- \`list.remove(1)\` on a \`List<Integer>\` removes the element **at index 1**; use \`list.remove(Integer.valueOf(1))\` to remove the value 1.
- Comparing two \`Integer\` objects with \`==\`, which can be false for equal values above 127.
- Using \`Stack\` or \`LinkedList\` out of habit; \`ArrayDeque\` is the usual choice for stacks and queues.`,
      practice: [
        { title: 'Word frequency', kind: 'problem', ref: 'word-frequency' },
        { title: 'Two sum', kind: 'problem', ref: 'two-sum' },
        { title: 'Contains duplicate', kind: 'problem', ref: 'contains-duplicate' },
        { title: 'Valid anagram', kind: 'problem', ref: 'valid-anagram' },
        { title: 'Word counter', kind: 'exercise', prompt: 'Read all text from standard input, count each lowercase word in a HashMap, and print "word count" lines sorted by count descending, then alphabetically. Then change the map to a TreeMap and explain what changes in the output before sorting.' },
        { title: 'Deduplicate in order', kind: 'exercise', prompt: 'Given a List<Integer> with duplicates, return a new list with duplicates removed but the first-seen order kept, using LinkedHashSet. Then write a second version that uses a HashSet and an ArrayList, and compare them.' },
      ],
      resources: [
        { title: 'The Java Tutorials: Collections', url: 'https://docs.oracle.com/javase/tutorial/collections/index.html', source: 'Oracle', kind: 'docs' },
        { title: 'The Collections Framework', url: 'https://dev.java/learn/api/collections-framework/', source: 'dev.java (Oracle)', kind: 'docs' },
        { title: 'The Java Tutorials: Generics', url: 'https://docs.oracle.com/javase/tutorial/java/generics/index.html', source: 'Oracle', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'matching',
          title: 'Pick the collection',
          prompt: 'Match each need to the best default choice.',
          pairs: {
            left: [
              { id: 'l1', text: 'Ordered items with fast access by index' },
              { id: 'l2', text: 'Check quickly whether a value has been seen' },
              { id: 'l3', text: 'Count occurrences of each word' },
              { id: 'l4', text: 'Process tasks smallest-priority first' },
            ],
            right: [
              { id: 'r1', text: '`ArrayList`' },
              { id: 'r2', text: '`HashSet`' },
              { id: 'r3', text: '`HashMap`' },
              { id: 'r4', text: '`PriorityQueue`' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'Lists give positional access, sets give fast membership, maps associate keys with values and priority queues always hand back the smallest element first.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Immutable list',
          prompt: 'What happens when you run `List<Integer> xs = List.of(1, 2, 3); xs.add(4);`?',
          options: [
            { id: 'a', text: 'xs becomes [1, 2, 3, 4]' },
            { id: 'b', text: 'It throws `UnsupportedOperationException` at runtime' },
            { id: 'c', text: 'It is a compile error' },
          ],
          correct: ['b'],
          explanation: '`List.of` returns an immutable list. The code compiles because `add` exists on the `List` interface, but the call fails at runtime.',
          difficulty: 'medium',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Primitive type arguments',
          prompt: '`Map<String, int> counts = new HashMap<>();` is valid Java.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Generic type arguments must be reference types. Use the wrapper class: `Map<String, Integer>`.',
          difficulty: 'easy',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Constant-time operations',
          prompt: 'Which operations take O(1) time on average? Select all that apply.',
          options: [
            { id: 'a', text: '`HashMap.get(key)`' },
            { id: 'b', text: '`HashSet.contains(x)`' },
            { id: 'c', text: '`ArrayList.get(i)`' },
            { id: 'd', text: '`TreeMap.get(key)`' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Hash-based lookups and array indexing are O(1) on average. `TreeMap` is a balanced tree, so lookups are O(log n).',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'Map default',
          prompt: 'Complete the call so a missing key gives 0 instead of null: `int n = counts.____("pears", 0);`',
          accepted: [['getOrDefault']],
          explanation: '`getOrDefault(key, fallback)` returns the fallback when the key is absent, avoiding a `NullPointerException` when unboxing.',
          difficulty: 'easy',
        },
      ],
    },
    {
      slug: 'java-lambdas-and-streams',
      title: 'Lambdas, comparators and streams',
      module: 'Working with data',
      skill: 'java',
      minutes: 50,
      objectives: [
        'Write lambdas and method references for functional interfaces such as Predicate, Function and Comparator',
        'Build multi-key comparators with Comparator.comparing and thenComparing',
        'Transform collections with stream pipelines: filter, map, sorted, collect',
        'Recognise when a plain loop is clearer than a stream',
      ],
      body: `A **lambda** is a short anonymous function. Java uses lambdas wherever a **functional interface** (an interface with a single abstract method) is expected.

\`\`\`java
import java.util.*;
import java.util.function.*;

Predicate<String> isLong = s -> s.length() > 4;           // String -> boolean
Function<String, Integer> len = String::length;           // method reference
BinaryOperator<Integer> add = (a, b) -> a + b;
Supplier<List<String>> fresh = ArrayList::new;            // constructor reference

isLong.test("banana");    // true
len.apply("kiwi");        // 4
add.apply(2, 3);          // 5
\`\`\`

A lambda can read local variables from the surrounding code only if they are **effectively final** (never reassigned).

### Comparators

\`\`\`java
record Person(String name, int age) {}

List<Person> people = new ArrayList<>(List.of(
    new Person("Chen", 31), new Person("Asha", 27), new Person("Ben", 31)));

people.sort(Comparator.comparingInt(Person::age)
                      .reversed()
                      .thenComparing(Person::name));
// [Ben 31, Chen 31, Asha 27]: oldest first, ties broken by name
\`\`\`

### Streams

A stream is a pipeline over a source of elements: zero or more **intermediate** operations (\`filter\`, \`map\`, \`sorted\`, \`distinct\`, \`limit\`) followed by one **terminal** operation (\`toList\`, \`collect\`, \`count\`, \`sum\`, \`forEach\`). Nothing runs until the terminal operation is called.

\`\`\`java
import java.util.stream.*;

List<String> names = List.of("Asha", "ben", "Chen", "dee", "Asha");
List<String> cleaned = names.stream()
    .map(String::toLowerCase)
    .distinct()
    .sorted()
    .toList();                                     // [asha, ben, chen, dee]

int sumOfSquares = IntStream.rangeClosed(1, 10).map(i -> i * i).sum();   // 385
double avgAge = people.stream().mapToInt(Person::age).average().orElse(0);  // about 29.67
Map<Integer, List<Person>> byAge = people.stream()
    .collect(Collectors.groupingBy(Person::age));
\`\`\`

### Worked example: top k frequent words

\`\`\`java
import java.util.*;
import java.util.stream.*;

record WordCount(String word, long count) {}

public class Main {
    public static void main(String[] args) {
        String text = "the cat and the hat and the bat";
        Map<String, Long> counts = Arrays.stream(text.split(" "))
            .collect(Collectors.groupingBy(w -> w, Collectors.counting()));

        List<WordCount> top = counts.entrySet().stream()
            .map(e -> new WordCount(e.getKey(), e.getValue()))
            .sorted(Comparator.comparingLong(WordCount::count).reversed()
                              .thenComparing(WordCount::word))
            .limit(2)
            .toList();

        top.forEach(wc -> System.out.println(wc.word() + " " + wc.count()));
        // the 3
        // and 2
    }
}
\`\`\`

\`groupingBy\` with \`counting()\` builds the frequency map in one step. Mapping entries into a small record makes the comparator easy to read and lets type inference work.

### Optional

Terminal operations that might find nothing, such as \`max\` or \`findFirst\`, return an \`Optional\`. Use \`orElse\`, \`ifPresent\` or \`isPresent\` rather than calling \`get()\` blindly.

### Common mistakes
- Reusing a stream after a terminal operation, which throws \`IllegalStateException\`. Create a new stream from the source.
- Changing outside state inside \`map\` or \`filter\`. Keep pipeline steps free of side effects and collect the result instead.
- Calling \`Optional.get()\` without checking, which throws when the value is missing.
- Forcing every loop into a stream. A simple \`for\` loop with an early \`return\` is often clearer.`,
      practice: [
        { title: 'Top k frequent elements', kind: 'problem', ref: 'top-k-frequent' },
        { title: 'Merge intervals', kind: 'problem', ref: 'merge-intervals' },
        { title: 'Second largest distinct value', kind: 'problem', ref: 'second-largest-distinct' },
        { title: 'Student report', kind: 'exercise', prompt: 'Given a list of record Student(String name, String course, int score), use streams to print: the average score per course (groupingBy with averagingInt), the names of students scoring 90 or more sorted alphabetically, and the top student overall using max with a comparator and Optional.' },
      ],
      resources: [
        { title: 'The Java Tutorials: Lambda Expressions', url: 'https://docs.oracle.com/javase/tutorial/java/javaOO/lambdaexpressions.html', source: 'Oracle', kind: 'docs' },
        { title: 'The Java Tutorials: Aggregate Operations', url: 'https://docs.oracle.com/javase/tutorial/collections/streams/index.html', source: 'Oracle', kind: 'docs' },
        { title: 'The Stream API', url: 'https://dev.java/learn/api/streams/', source: 'dev.java (Oracle)', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Functional interface',
          prompt: 'What makes an interface a **functional interface** that a lambda can implement?',
          options: [
            { id: 'a', text: 'It has exactly one abstract method' },
            { id: 'b', text: 'All of its methods are static' },
            { id: 'c', text: 'It is declared in the java.util.function package' },
          ],
          correct: ['a'],
          explanation: 'A lambda supplies the body of the single abstract method. Interfaces like `Comparator` and `Runnable` qualify even though they live elsewhere.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Laziness',
          prompt: 'What does `names.stream().filter(n -> n.length() > 3).map(String::toUpperCase);` do on its own, with no further call?',
          options: [
            { id: 'a', text: 'Filters and converts every name immediately' },
            { id: 'b', text: 'Nothing yet: intermediate operations run only when a terminal operation is called' },
            { id: 'c', text: 'Changes the original `names` list in place' },
          ],
          correct: ['b'],
          explanation: 'Streams are lazy. Without a terminal operation such as `toList()` or `forEach`, no element is processed, and streams never modify their source.',
          difficulty: 'medium',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Tie-breaker',
          prompt: 'Complete the comparator so people are sorted by age, then by name: `Comparator.comparingInt(Person::age).____(Person::name)`',
          accepted: [['thenComparing']],
          explanation: '`thenComparing` adds a secondary key used only when the first comparison is a tie.',
          difficulty: 'easy',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Stream reuse',
          prompt: 'You can call two terminal operations, such as `count()` and then `toList()`, on the same stream object.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'A stream can be consumed only once. The second terminal operation throws `IllegalStateException`; create a new stream from the collection instead.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'matching',
          title: 'Functional interfaces',
          prompt: 'Match each functional interface to its shape.',
          pairs: {
            left: [
              { id: 'l1', text: '`Predicate<T>`' },
              { id: 'l2', text: '`Function<T, R>`' },
              { id: 'l3', text: '`Supplier<T>`' },
              { id: 'l4', text: '`Consumer<T>`' },
            ],
            right: [
              { id: 'r1', text: 'Takes a T, returns a boolean' },
              { id: 'r2', text: 'Takes a T, returns an R' },
              { id: 'r3', text: 'Takes nothing, returns a T' },
              { id: 'r4', text: 'Takes a T, returns nothing' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'These four cover most lambdas you pass to collection and stream methods: tests, transformations, factories and actions.',
          difficulty: 'medium',
        },
      ],
    },
    {
      slug: 'java-exceptions',
      title: 'Exceptions',
      module: 'Working with data',
      skill: 'error-handling',
      minutes: 45,
      objectives: [
        'Catch exceptions with try / catch / finally and read a stack trace',
        'Explain checked versus unchecked exceptions',
        'Close resources automatically with try-with-resources',
        'Throw meaningful exceptions, including custom ones that keep the original cause',
      ],
      body: `When something goes wrong, Java **throws** an exception object. It travels up the call stack until a matching \`catch\` handles it; if nothing does, the program stops and prints a **stack trace** listing the method calls that led there. Read a stack trace from the top: the first line names the exception and message, and the first \`at\` line that points to your own code is usually where to look.

### The exception hierarchy

- \`Error\` (such as \`OutOfMemoryError\`): serious JVM problems you normally do not catch.
- \`Exception\`: problems a program may handle.
  - **Checked** exceptions (such as \`IOException\`): the compiler forces you to catch them or declare them with \`throws\`. They model failures outside your control, like a missing file.
  - **Unchecked** exceptions, subclasses of \`RuntimeException\` (such as \`NullPointerException\`, \`IllegalArgumentException\`, \`ArithmeticException\`): usually programming errors, so the compiler does not force handling.

### try-with-resources

\`\`\`java
import java.io.*;
import java.nio.file.*;

static int countLines(String path) throws IOException {
    try (BufferedReader reader = Files.newBufferedReader(Path.of(path))) {
        int lines = 0;
        while (reader.readLine() != null) lines++;
        return lines;
    }   // reader.close() runs automatically, even if an exception is thrown
}

public static void main(String[] args) {
    try {
        System.out.println(countLines("notes.txt"));
    } catch (NoSuchFileException e) {          // most specific first
        System.out.println("File not found: " + e.getMessage());
    } catch (IOException e) {
        System.out.println("Could not read file: " + e.getMessage());
    } finally {
        System.out.println("done");            // always runs
    }
}
\`\`\`

Any class that implements \`AutoCloseable\` works in try-with-resources. Several resources can be opened in one \`try (...)\`, and they are closed in reverse order.

### Worked example: safe parsing

\`\`\`java
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        long sum = 0;
        int invalid = 0;
        while (in.hasNextLine()) {
            String line = in.nextLine().trim();
            if (line.isEmpty()) continue;
            try {
                sum += Integer.parseInt(line);
            } catch (NumberFormatException e) {
                invalid++;
            }
        }
        System.out.println(sum + " " + invalid);   // input 4, x, 10 prints: 14 1
    }
}
\`\`\`

### Throwing your own

Validate early and fail with a clear message, so the bug surfaces where it starts:

\`\`\`java
public class InsufficientFundsException extends Exception {   // checked
    public InsufficientFundsException(String message) { super(message); }
}

public void withdraw(long cents) throws InsufficientFundsException {
    if (cents <= 0) throw new IllegalArgumentException("amount must be positive");   // caller bug
    if (cents > balanceCents) throw new InsufficientFundsException("balance is " + balanceCents);
    balanceCents -= cents;
}
\`\`\`

When you catch a low-level exception and throw a higher-level one, pass the original as the **cause**: \`throw new ReportException("could not load report", e);\`. The stack trace then shows both.

### Common mistakes
- Empty catch blocks that swallow errors. At minimum, log the exception.
- Catching \`Exception\` everywhere, which also hides bugs such as \`NullPointerException\`. Catch what you can actually handle.
- Putting a broad catch before a narrow one: \`catch (Exception e)\` followed by \`catch (IOException e)\` does not compile, because the second is unreachable.
- Using exceptions for normal control flow, such as ending a loop.
- Throwing a new exception without the cause, which loses the original stack trace.`,
      practice: [
        { title: 'Safe division', kind: 'problem', ref: 'safe-division' },
        { title: 'Safe parse', kind: 'exercise', prompt: 'Run the safe parsing example, then extend it to also reject numbers outside the int range with a clear message per bad line (line number and reason), printing the sum and the count of invalid lines at the end.' },
        { title: 'Custom exception', kind: 'exercise', prompt: 'Add InsufficientFundsException to your BankAccount class. Update transferTo to throw it, handle it in main with a friendly message, and write two sentences explaining why you chose a checked exception here but IllegalArgumentException for a negative amount.' },
      ],
      resources: [
        { title: 'The Java Tutorials: Exceptions', url: 'https://docs.oracle.com/javase/tutorial/essential/exceptions/index.html', source: 'Oracle', kind: 'docs' },
        { title: 'Exceptions', url: 'https://dev.java/learn/exceptions/', source: 'dev.java (Oracle)', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Checked exception',
          prompt: 'Which of these is a **checked** exception?',
          options: [
            { id: 'a', text: '`NullPointerException`' },
            { id: 'b', text: '`IOException`' },
            { id: 'c', text: '`IllegalArgumentException`' },
            { id: 'd', text: '`ArithmeticException`' },
          ],
          correct: ['b'],
          explanation: '`IOException` extends `Exception` but not `RuntimeException`, so it must be caught or declared. The others are unchecked runtime exceptions.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Catch order',
          prompt: 'A `catch (Exception e)` block followed by `catch (IOException e)` on the same try compiles successfully.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'The first block already catches every `IOException`, so the second is unreachable and the compiler rejects it. Put specific exceptions first.',
          difficulty: 'medium',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'try-with-resources',
          prompt: 'Which statements about try-with-resources are true? Select all that apply.',
          options: [
            { id: 'a', text: 'It works with any class that implements `AutoCloseable`' },
            { id: 'b', text: 'Resources are closed even when an exception is thrown' },
            { id: 'c', text: 'Multiple resources are closed in the reverse order they were opened' },
            { id: 'd', text: 'It requires a `finally` block to close the resource' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'The compiler generates the closing code for you, so no `finally` is needed for cleanup.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Declaring exceptions',
          prompt: 'Complete the signature of a method that may throw a checked exception: `static String readConfig(String path) ____ IOException`',
          accepted: [['throws']],
          explanation: '`throws` in the signature declares the exception; `throw` (no s) is the statement that actually throws one.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'matching',
          title: 'Name the exception',
          prompt: 'Match each line of code to the exception it throws.',
          pairs: {
            left: [
              { id: 'l1', text: '`String s = null; s.length();`' },
              { id: 'l2', text: '`int[] a = new int[2]; a[2] = 1;`' },
              { id: 'l3', text: '`Integer.parseInt("abc");`' },
              { id: 'l4', text: '`int x = 5 / 0;`' },
            ],
            right: [
              { id: 'r1', text: '`NullPointerException`' },
              { id: 'r2', text: '`ArrayIndexOutOfBoundsException`' },
              { id: 'r3', text: '`NumberFormatException`' },
              { id: 'r4', text: '`ArithmeticException`' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'Recognising these four by name speeds up debugging: a null reference, an index past the end, text that is not a number and integer division by zero.',
          difficulty: 'easy',
        },
      ],
    },
  ],
};

export const cCppTrack: SeedTrack = {
  slug: 'c-and-cpp-foundations',
  title: 'C and C++ Foundations',
  category: 'programming',
  summary: 'Understand how programs use memory by learning C, then write safer, expressive code with modern C++.',
  description: `**Who it's for:** learners interested in systems programming, embedded devices, game engines or performance-critical code, and anyone who wants to understand what higher-level languages do for them.

**Prerequisites:** comfortable with variables, loops and functions in another language.

**You will be able to:**
- compile, run and debug C and C++ programs from the command line with warnings and sanitizers turned on
- reason about types, undefined behaviour, pointers, arrays and C strings
- manage heap memory in C with malloc and free, and build linked data with structs
- use references, std::string and std::vector in modern C++
- manage resources safely with RAII and smart pointers instead of raw new and delete
- solve problems with STL containers, algorithms and lambdas

**How it works:** eight topics, the first five in C and the last three in modern C++ (C++20). Each has a lesson, worked examples, a quiz and practice. CodeLab problems accept both C and C++, so you can apply each topic to real input and output tasks.

**Milestones:** *Pointers and arrays* (topic 3) and *Classes and RAII* (topic 7).`,
  level: 'intermediate',
  estimatedHours: 28,
  roles: ['systems programmer', 'embedded engineer', 'game developer', 'software engineer'],
  contentStatus: 'complete',
  topics: [
    {
      slug: 'c-compile-and-run',
      title: 'Compiling and running C',
      module: 'C fundamentals',
      skill: 'c-lang',
      minutes: 35,
      objectives: [
        'Compile a C program with gcc or clang and run it',
        'Explain what the preprocessor, compiler and linker do',
        'Print and read values with printf and scanf, using the right format specifiers',
        'Read input until the end of the file and check scanf\'s return value',
      ],
      body: `C is compiled ahead of time into a native executable for your machine. There is no interpreter or virtual machine, which is why C is fast and also why it trusts you completely.

### A first program

\`\`\`c
#include <stdio.h>

int main(void) {
    int a, b;
    if (scanf("%d %d", &a, &b) != 2) {
        fprintf(stderr, "expected two integers\\n");
        return 1;                 // non-zero means failure
    }
    printf("%d\\n", a + b);
    return 0;                     // 0 means success
}
\`\`\`

\`\`\`bash
gcc -Wall -Wextra -std=c17 -g -o sum sum.c
./sum
\`\`\`

### From source to executable

1. The **preprocessor** handles lines starting with \`#\`. \`#include <stdio.h>\` pastes in the declarations of \`printf\` and \`scanf\`; \`#define\` creates text substitutions.
2. The **compiler** checks the code and translates it into machine code in an object file.
3. The **linker** joins your object files with library code, such as the real \`printf\`, into one executable.

Useful flags: \`-Wall -Wextra\` (warnings), \`-std=c17\` (language version), \`-g\` (debug information), \`-O2\` (optimise). CodeLab compiles C with \`gcc -O2 -std=c17\`.

### printf and scanf format specifiers

| Type | printf | scanf |
|---|---|---|
| \`int\` | \`%d\` | \`%d\` |
| \`long long\` | \`%lld\` | \`%lld\` |
| \`double\` | \`%f\` (\`%.2f\` for 2 decimals) | \`%lf\` |
| \`char\` | \`%c\` | \`%c\` (\`" %c"\` skips whitespace) |
| string (\`char *\`) | \`%s\` | \`%s\` (one word) |
| \`size_t\` | \`%zu\` | \`%zu\` |

\`scanf\` needs the **address** of each variable (\`&a\`) so it can write into it. This is your first glimpse of pointers, covered properly in topic 3.

### Worked example: read until end of input

\`scanf\` returns how many values it read successfully, and \`EOF\` at the end of input. That makes "read every number" a short loop:

\`\`\`c
#include <stdio.h>

int main(void) {
    long long x, sum = 0;
    int count = 0;
    while (scanf("%lld", &x) == 1) {
        sum += x;
        count++;
    }
    printf("count=%d sum=%lld\\n", count, sum);
    return 0;
}
\`\`\`

With the input \`4 10 -3\` it prints \`count=3 sum=11\`. Using \`long long\` avoids overflow when many large numbers are added.

### Common mistakes
- Ignoring warnings. C compiles a lot of wrong code; treat every warning as a bug until proven otherwise.
- Forgetting \`&\` in \`scanf\`: \`scanf("%d", n)\` passes the value instead of the address and usually crashes.
- Mismatched specifiers, such as \`%d\` for a \`long long\` or \`%f\` in \`scanf\` for a \`double\`. Both are undefined behaviour.
- Forgetting \`\\n\` at the end of output, so the next prompt appears on the same line.
- Writing \`void main()\`. Standard C uses \`int main(void)\` and returns a status code.`,
      practice: [
        { title: 'Sum of two numbers', kind: 'problem', ref: 'sum-two-numbers' },
        { title: 'Even or odd', kind: 'problem', ref: 'even-or-odd' },
        { title: 'Hello, compiler', kind: 'exercise', prompt: 'Write sum.c from the lesson, compile it with -Wall -Wextra and run it. Then remove the & before a in scanf, recompile, and copy the warning the compiler gives you into a comment explaining what it means.' },
        { title: 'Temperature table', kind: 'exercise', prompt: 'Print a table of Celsius values from 0 to 100 in steps of 10 with their Fahrenheit equivalents, formatted with printf("%3d %6.1f\\n", ...). Then read a list of Celsius values until end of input and print the average.' },
      ],
      resources: [
        { title: 'CS50x Week 1: C', url: 'https://cs50.harvard.edu/x/2024/weeks/1/', source: 'Harvard CS50', kind: 'video' },
        { title: 'printf, fprintf (format specifiers)', url: 'https://en.cppreference.com/w/c/io/fprintf', source: 'cppreference.com', kind: 'docs' },
        { title: 'GCC warning options', url: 'https://gcc.gnu.org/onlinedocs/gcc/Warning-Options.html', source: 'GNU Project', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'matching',
          title: 'Build stages',
          prompt: 'Match each part of the build to its job.',
          pairs: {
            left: [
              { id: 'l1', text: 'Preprocessor' },
              { id: 'l2', text: 'Compiler' },
              { id: 'l3', text: 'Linker' },
              { id: 'l4', text: '`-Wall -Wextra`' },
            ],
            right: [
              { id: 'r1', text: 'Expands #include and #define lines' },
              { id: 'r2', text: 'Translates C code into machine code in object files' },
              { id: 'r3', text: 'Combines object files and libraries into an executable' },
              { id: 'r4', text: 'Turns on extra warnings about suspicious code' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'gcc runs all three stages for you, but knowing them explains errors: a missing header is a compile error, a missing function definition is a link error.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Why the ampersand',
          prompt: 'Why does `scanf("%d", &n)` need the `&`?',
          options: [
            { id: 'a', text: 'It marks n as an integer' },
            { id: 'b', text: 'scanf needs the address of n so it can store the value there' },
            { id: 'c', text: 'It is optional style that some programmers prefer' },
          ],
          correct: ['b'],
          explanation: 'C passes arguments by value. Passing the address lets scanf write into your variable.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Format specifier',
          prompt: 'Which printf specifier correctly prints a `long long` value?',
          options: [
            { id: 'a', text: '`%d`' },
            { id: 'b', text: '`%ld`' },
            { id: 'c', text: '`%lld`' },
            { id: 'd', text: '`%f`' },
          ],
          correct: ['c'],
          explanation: '`%lld` matches `long long`. A mismatched specifier is undefined behaviour and often prints garbage.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Read until EOF',
          prompt: 'Complete the loop so it keeps going while a number was read successfully: `while (scanf("%d", &x) == ____) { ... }`',
          accepted: [['1']],
          explanation: 'scanf returns the number of items it assigned. It returns 0 for non-matching input and EOF at the end of input, both of which end the loop.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'true_false',
          title: 'Exit status',
          prompt: 'Returning 0 from `main` tells the operating system that the program succeeded.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'By convention 0 means success and any other value means failure. Scripts and CI tools check this status.',
          difficulty: 'easy',
        },
      ],
    },
    {
      slug: 'c-types-functions',
      title: 'Types, control flow and functions in C',
      module: 'C fundamentals',
      skill: 'c-lang',
      minutes: 45,
      objectives: [
        'Use integer and floating-point types and know their limits',
        'Predict integer division, conversion and signed versus unsigned results',
        'Write functions with prototypes, header files and header guards',
        'Recognise undefined behaviour such as signed overflow and uninitialised variables',
      ],
      body: `C's types map closely to the hardware. Sizes vary by platform, but on today's common systems:

| Type | Usual size | Notes |
|---|---|---|
| \`char\` | 1 byte | small integers and characters |
| \`int\` | 4 bytes | about plus or minus 2.1 billion |
| \`long long\` | 8 bytes | at least 64 bits everywhere |
| \`double\` | 8 bytes | about 15 significant digits |
| \`size_t\` | 8 bytes on 64-bit | unsigned; used for sizes and indexes |

Use \`sizeof(type)\` to check, and \`<stdint.h>\` types such as \`int32_t\` and \`int64_t\` when the exact width matters. \`<stdbool.h>\` provides \`bool\`, \`true\` and \`false\`.

### Conversions and division

\`\`\`c
int a = 7 / 2;               // 3: integer division truncates toward zero
double b = 7 / 2;            // 3.0: divided as ints first
double c = (double)7 / 2;    // 3.5: cast one operand before dividing
int r = -7 % 3;              // -1: the remainder takes the sign of the left operand
unsigned int u = 0;
u = u - 1;                   // 4294967295: unsigned arithmetic wraps around
\`\`\`

Mixing signed and unsigned values in a comparison converts the signed one to unsigned, so \`-1 < 1u\` is **false**. Compilers warn about this with \`-Wextra\`.

### Functions, prototypes and headers

C reads a file top to bottom, so a function must be declared before it is called. A **prototype** declares it; the definition can come later or live in another file.

\`\`\`c
// primes.h
#ifndef PRIMES_H              // header guard: include the contents only once
#define PRIMES_H
#include <stdbool.h>
bool is_prime(int n);
#endif

// primes.c
#include "primes.h"
bool is_prime(int n) {
    if (n < 2) return false;
    for (int d = 2; d <= n / d; d++) {   // d <= n / d avoids overflow of d * d
        if (n % d == 0) return false;
    }
    return true;
}

// main.c
#include <stdio.h>
#include "primes.h"
int main(void) {
    for (int i = 1; i <= 20; i++) {
        if (is_prime(i)) printf("%d ", i);
    }
    printf("\\n");            // 2 3 5 7 11 13 17 19
    return 0;
}
\`\`\`

\`\`\`bash
gcc -Wall -Wextra -std=c17 main.c primes.c -o primes
\`\`\`

Arguments are passed **by value**: a function gets copies, so assigning to a parameter never changes the caller's variable. To let a function change the caller's data, pass a pointer (next topic).

### Undefined behaviour

Some mistakes are not errors at all in C: the standard says the behaviour is **undefined**, so the program may crash, print nonsense or appear to work until it does not. Common examples:
- reading an uninitialised local variable
- overflowing a **signed** integer (\`INT_MAX + 1\`)
- dividing an integer by zero
- accessing an array out of bounds

Compile with \`-fsanitize=undefined\` while developing to catch many of these at runtime.

### Common mistakes
- Using \`=\` instead of \`==\` in a condition: \`if (x = 5)\` assigns 5 and is always true. \`-Wall\` warns about it.
- Declaring \`int total;\` without initialising it, then adding to it.
- Calling a function before its prototype, which modern compilers reject.
- Comparing an \`int\` with a \`size_t\` such as \`strlen(s)\`, so a negative value becomes huge.
- Assuming \`int\` is big enough for products of large numbers; use \`long long\`.`,
      practice: [
        { title: 'Prime checker', kind: 'problem', ref: 'prime-checker' },
        { title: 'FizzBuzz', kind: 'problem', ref: 'fizzbuzz' },
        { title: 'Split into files', kind: 'exercise', prompt: 'Create primes.h, primes.c and main.c from the lesson and compile them together. Then remove the header guard, include primes.h twice in main.c, and note what changes (if anything) and why guards matter once headers define types.' },
        { title: 'Overflow experiment', kind: 'exercise', prompt: 'Compute factorials from 1 to 25 using int, then long long, then unsigned long long, printing each. Note where each type first gives a wrong answer, then compile the int version with -fsanitize=undefined and read the report.' },
      ],
      resources: [
        { title: 'Arithmetic types', url: 'https://en.cppreference.com/w/c/language/arithmetic_types', source: 'cppreference.com', kind: 'docs' },
        { title: 'Functions', url: 'https://en.cppreference.com/w/c/language/functions', source: 'cppreference.com', kind: 'docs' },
        { title: 'Undefined behavior', url: 'https://en.cppreference.com/w/c/language/behavior', source: 'cppreference.com', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Getting 3.5',
          prompt: 'Which expression evaluates to `3.5`?',
          options: [
            { id: 'a', text: '`7 / 2`' },
            { id: 'b', text: '`(double)(7 / 2)`' },
            { id: 'c', text: '`(double)7 / 2`' },
          ],
          correct: ['c'],
          explanation: 'Casting 7 to double before dividing makes it a floating-point division. Casting after `7 / 2` only converts the already-truncated 3.',
          difficulty: 'medium',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Signed overflow',
          prompt: 'In C, adding 1 to an `int` holding `INT_MAX` is guaranteed to wrap around to `INT_MIN`.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Signed overflow is undefined behaviour, and optimising compilers rely on it never happening. Only unsigned arithmetic is defined to wrap.',
          difficulty: 'medium',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'Spot the undefined behaviour',
          prompt: 'Which of these are undefined behaviour in C? Select all that apply.',
          options: [
            { id: 'a', text: 'Reading a local `int` that was never initialised' },
            { id: 'b', text: 'Computing `INT_MAX + 1` with `int` values' },
            { id: 'c', text: 'Computing `UINT_MAX + 1u` with `unsigned int` values' },
            { id: 'd', text: 'Dividing an `int` by zero' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'Unsigned arithmetic wraps modulo 2 to the power of its width, so `UINT_MAX + 1u` is defined as 0. The other three are undefined.',
          difficulty: 'hard',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Header guard',
          prompt: 'Complete the header guard: `#ifndef PRIMES_H` then `#____ PRIMES_H` ... `#endif`',
          accepted: [['define']],
          explanation: 'The first inclusion defines PRIMES_H; later inclusions see it is already defined and skip the contents.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'Pass by value',
          prompt: '`void reset(int n) { n = 0; }` is called as `reset(count);` where `count` is 7. What is `count` afterwards?',
          options: [
            { id: 'a', text: '0' },
            { id: 'b', text: '7' },
            { id: 'c', text: 'Undefined' },
          ],
          correct: ['b'],
          explanation: 'The function received a copy. To change the caller\'s variable, take an `int *` and write through it.',
          difficulty: 'easy',
        },
      ],
    },
    {
      slug: 'pointers-and-arrays',
      title: 'Pointers and arrays',
      module: 'C fundamentals',
      skill: 'c-lang',
      minutes: 60,
      milestone: true,
      completionCriteria: 'Complete the "swap and reverse" exercise and explain, in writing, why swap needs pointers. Solve "Move zeroes" in C and score 70% or more on the quiz.',
      objectives: [
        'Explain what a pointer stores and use & and *',
        'Pass pointers to functions to modify the caller\'s data',
        'Relate arrays to pointers and use pointer arithmetic safely',
        'Work with C strings as null-terminated char arrays',
      ],
      body: `Every variable lives at some address in memory. A **pointer** is a variable that stores an address. \`&x\` gives the address of \`x\`; \`*p\` follows the pointer to the value it points at (called **dereferencing**).

\`\`\`c
int x = 5;
int *p = &x;      // p holds the address of x
*p = 9;           // writes through p: x is now 9
int *q = NULL;    // a pointer to nothing; dereferencing it is undefined behaviour
\`\`\`

### Pointers let functions change the caller's data

\`\`\`c
#include <stdio.h>
#include <stddef.h>

void swap(int *a, int *b) {
    int tmp = *a;
    *a = *b;
    *b = tmp;
}

void reverse(int *arr, size_t n) {
    if (n < 2) return;
    for (size_t i = 0, j = n - 1; i < j; i++, j--) {
        swap(&arr[i], &arr[j]);
    }
}

int main(void) {
    int x = 1, y = 2;
    swap(&x, &y);                   // pass addresses so swap can change x and y
    printf("%d %d\\n", x, y);        // 2 1

    int nums[5] = {10, 20, 30, 40, 50};
    reverse(nums, 5);
    for (size_t i = 0; i < 5; i++) printf("%d ", nums[i]);   // 50 40 30 20 10
    printf("\\n");
    return 0;
}
\`\`\`

Without pointers, \`swap\` would receive copies and the caller's variables would not change. The \`n < 2\` check matters: with \`n == 0\`, \`n - 1\` on an unsigned \`size_t\` would wrap to a huge number.

### Arrays and pointer arithmetic

An array is a block of elements stored next to each other. In most expressions, an array name **decays** to a pointer to its first element. Adding 1 to a pointer moves it by one **element**, not one byte, so \`arr[i]\` means exactly \`*(arr + i)\`.

\`\`\`c
int nums[4] = {10, 20, 30, 40};
int *p = nums;                      // same as &nums[0]
printf("%d %d\\n", *(p + 2), p[2]);  // 30 30
printf("%zu\\n", sizeof nums);       // 16: the whole array (4 ints of 4 bytes)
printf("%zu\\n", sizeof p);          // 8: just a pointer on a 64-bit system
\`\`\`

When an array is passed to a function, only the pointer arrives. The function cannot know the length, so pass it separately: \`int sum(const int *arr, size_t n)\`. \`const\` promises the function will not modify the elements.

### C strings

A C string is an array of \`char\` ending with a **null byte** \`'\\0'\`. Library functions in \`<string.h>\` (\`strlen\`, \`strcpy\`, \`strcmp\`) walk the characters until they reach it.

\`\`\`c
char word[] = "hi";                // {'h', 'i', '\\0'}: 3 bytes
size_t my_strlen(const char *s) {
    const char *start = s;
    while (*s != '\\0') s++;
    return (size_t)(s - start);    // pointer difference counts elements
}
\`\`\`

Compare strings with \`strcmp(a, b) == 0\`, not \`a == b\` (which compares addresses). A string literal such as \`"hi"\` used through \`char *s = "hi";\` may live in read-only memory, so never modify it; copy it into an array first.

### Common mistakes
- Using an uninitialised pointer: \`int *p; *p = 3;\` writes to a random address.
- Dereferencing \`NULL\`, for example when a function that can fail returns it.
- Using \`sizeof arr\` inside a function that received an array parameter: you get the size of a pointer.
- Forgetting space for the \`'\\0'\`: a 5-letter word needs a 6-byte array.
- Reading or writing past the end of an array, the classic buffer overflow.`,
      practice: [
        { title: 'Move zeroes', kind: 'problem', ref: 'move-zeroes' },
        { title: 'Merge two sorted arrays', kind: 'problem', ref: 'merge-sorted-arrays' },
        { title: 'Palindrome check', kind: 'problem', ref: 'palindrome-check' },
        { title: 'Swap and reverse', kind: 'exercise', prompt: 'Write swap(int *a, int *b) and use it to implement reverse(int *arr, size_t n) that reverses an array in place. Test it on arrays of length 0, 1, 4 and 5, then write two or three sentences explaining why swap needs pointers.' },
        { title: 'Your own string functions', kind: 'exercise', prompt: 'Implement size_t my_strlen(const char *s) and int my_strcmp(const char *a, const char *b) by walking pointers until the null terminator. Compare their results with strlen and strcmp from <string.h> on at least five inputs, including empty strings.' },
      ],
      resources: [
        { title: 'Pointer declaration', url: 'https://en.cppreference.com/w/c/language/pointer', source: 'cppreference.com', kind: 'docs' },
        { title: 'CS50x Week 4: Memory', url: 'https://cs50.harvard.edu/x/2024/weeks/4/', source: 'Harvard CS50', kind: 'video' },
        { title: 'Array declaration', url: 'https://en.cppreference.com/w/c/language/array', source: 'cppreference.com', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Writing through a pointer',
          prompt: 'After `int x = 5; int *p = &x; *p = 9;`, what is the value of `x`?',
          options: [
            { id: 'a', text: '5' },
            { id: 'b', text: '9' },
            { id: 'c', text: 'The address of p' },
          ],
          correct: ['b'],
          explanation: '`p` points at `x`, so assigning to `*p` writes into `x`.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Pointer arithmetic',
          prompt: 'Given `int nums[4] = {10, 20, 30, 40}; int *p = nums;`, what is `*(p + 2)`?',
          options: [
            { id: 'a', text: '12' },
            { id: 'b', text: '20' },
            { id: 'c', text: '30' },
          ],
          correct: ['c'],
          explanation: '`p + 2` moves two elements forward, to `nums[2]`. Pointer arithmetic counts elements, not bytes.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'sizeof a parameter',
          prompt: 'Inside `void f(int arr[])`, the expression `sizeof arr` gives the size in bytes of the caller\'s whole array.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'An array parameter is really a pointer, so `sizeof arr` is the size of a pointer (usually 8). Pass the length as a separate argument.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'String storage',
          prompt: 'How many bytes does `char word[] = "cat";` occupy? Answer with a number: ____',
          accepted: [['4', 'four']],
          explanation: 'Three letters plus the terminating null byte `\\0` make 4 bytes.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Pointer facts',
          prompt: 'Which statements are true? Select all that apply.',
          options: [
            { id: 'a', text: '`arr[i]` is equivalent to `*(arr + i)`' },
            { id: 'b', text: 'For an `int *p`, `p + 1` points one byte further along' },
            { id: 'c', text: 'You should not modify a string literal such as `"hi"`' },
            { id: 'd', text: 'Dereferencing a NULL pointer is undefined behaviour' },
          ],
          correct: ['a', 'c', 'd'],
          explanation: '`p + 1` advances by `sizeof(int)` bytes, one whole element. String literals may be in read-only memory, and NULL dereferences usually crash.',
          difficulty: 'medium',
        },
      ],
    },
    {
      slug: 'memory-management-in-c',
      title: 'Dynamic memory in C',
      module: 'C fundamentals',
      skill: 'c-lang',
      minutes: 50,
      objectives: [
        'Distinguish stack and heap lifetimes',
        'Allocate and free heap memory with malloc, calloc, realloc and free',
        'Decide who owns (and must free) each allocation',
        'Find leaks and invalid accesses with sanitizers or Valgrind',
      ],
      body: `### Stack and heap

Local variables live on the **stack**. They are created when a function is called and disappear when it returns, which is fast and automatic but limited: the size must be known in advance and the memory cannot outlive the function.

The **heap** is a large pool you manage yourself. You ask for memory with \`malloc\` and give it back with \`free\`. Use it when the size is only known at runtime or when data must outlive the function that created it.

| Function | Does |
|---|---|
| \`malloc(bytes)\` | allocates uninitialised memory, or returns \`NULL\` |
| \`calloc(count, size)\` | allocates zero-filled memory |
| \`realloc(p, bytes)\` | resizes a block, possibly moving it |
| \`free(p)\` | releases a block; \`free(NULL)\` does nothing |

### Worked example: a growable array

\`\`\`c
#include <stdio.h>
#include <stdlib.h>

int main(void) {
    size_t len = 0, cap = 4;
    int *nums = malloc(cap * sizeof *nums);   // sizeof *nums: stays right if the type changes
    if (nums == NULL) { perror("malloc"); return 1; }

    int x;
    while (scanf("%d", &x) == 1) {
        if (len == cap) {
            cap *= 2;                                         // double the capacity
            int *bigger = realloc(nums, cap * sizeof *nums);
            if (bigger == NULL) { free(nums); perror("realloc"); return 1; }
            nums = bigger;
        }
        nums[len++] = x;
    }

    for (size_t i = len; i > 0; i--) printf("%d ", nums[i - 1]);   // print in reverse
    printf("\\n");

    free(nums);       // every successful malloc needs exactly one free
    nums = NULL;      // avoid a dangling pointer
    return 0;
}
\`\`\`

Doubling the capacity means each element is copied only a constant number of times on average, so appending is **amortised O(1)**. Notice the temporary \`bigger\`: if \`realloc\` fails it returns \`NULL\` but leaves the old block alive, and writing \`nums = realloc(nums, ...)\` directly would lose your only pointer to it.

### Ownership

C has no garbage collector, so every allocation needs a clear **owner** responsible for freeing it. A common convention: a function that returns heap memory documents that the caller must free it.

\`\`\`c
#include <stdlib.h>
#include <string.h>

// Returns a new string with s repeated times times. The caller must free the result.
char *repeat(const char *s, int times) {
    size_t n = strlen(s);
    char *out = malloc(n * (size_t)times + 1);   // + 1 for the null byte
    if (out == NULL) return NULL;
    for (int i = 0; i < times; i++) memcpy(out + i * n, s, n);
    out[n * (size_t)times] = '\\0';
    return out;
}
\`\`\`

Never return the address of a local variable: \`int *bad(void) { int x = 5; return &x; }\` hands back a pointer to stack memory that no longer belongs to you.

### Finding memory bugs

\`\`\`bash
gcc -g -fsanitize=address,undefined -o grow grow.c   # AddressSanitizer + UBSan
valgrind --leak-check=full ./grow                    # alternative on Linux
\`\`\`

AddressSanitizer stops at the first invalid access and prints where the memory was allocated and freed. Run your tests under it regularly.

### Common mistakes
- **Leaks**: forgetting \`free\`, especially on early-return error paths.
- **Use after free**: reading memory after freeing it. Setting the pointer to \`NULL\` afterwards helps.
- **Double free**: freeing the same block twice.
- Allocating \`n * sizeof(int *)\` when you meant \`n * sizeof(int)\`; the \`sizeof *p\` idiom avoids this.
- Forgetting the \`+ 1\` for the null byte when allocating a string.
- Assuming \`malloc\` zeroes memory. Use \`calloc\` or initialise it yourself.`,
      practice: [
        { title: 'Running sum', kind: 'problem', ref: 'running-sum' },
        { title: 'Kth largest element', kind: 'problem', ref: 'kth-largest' },
        { title: 'Find the bug', kind: 'exercise', prompt: 'Write a function that returns a pointer to a local array, call it, and compile with -fsanitize=address -g. Read the report, then fix the function by allocating with malloc and freeing in the caller. Repeat with a deliberate double free and note how the report differs.' },
        { title: 'Read lines into memory', kind: 'exercise', prompt: 'Read lines from standard input with fgets into a fixed buffer, copy each into its own exactly-sized heap string (malloc plus memcpy), store the pointers in a growable array of char *, print the lines in reverse order and free everything. Confirm with AddressSanitizer that there are no leaks.' },
      ],
      resources: [
        { title: 'malloc', url: 'https://en.cppreference.com/w/c/memory/malloc', source: 'cppreference.com', kind: 'docs' },
        { title: 'AddressSanitizer', url: 'https://clang.llvm.org/docs/AddressSanitizer.html', source: 'LLVM Project', kind: 'docs' },
        { title: 'Valgrind Quick Start Guide', url: 'https://valgrind.org/docs/manual/quick-start.html', source: 'Valgrind', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Stack lifetime',
          prompt: 'A function declares `int total = 0;` in its body. When does that variable stop existing?',
          options: [
            { id: 'a', text: 'When the function returns' },
            { id: 'b', text: 'When you call free on it' },
            { id: 'c', text: 'When the program exits' },
          ],
          correct: ['a'],
          explanation: 'Local variables live on the stack and are discarded on return. Only memory from malloc, calloc or realloc is freed with `free`.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'realloc trap',
          prompt: 'What is the danger in writing `nums = realloc(nums, bigger_size);`?',
          options: [
            { id: 'a', text: 'realloc always moves the data, so it is slow' },
            { id: 'b', text: 'If realloc fails it returns NULL, overwriting your only pointer to the old block, which then leaks' },
            { id: 'c', text: 'realloc frees the old block even when it fails' },
          ],
          correct: ['b'],
          explanation: 'On failure, realloc leaves the original block allocated. Store the result in a temporary and only replace `nums` when it is not NULL.',
          difficulty: 'medium',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'Memory bugs',
          prompt: 'Which of these are memory bugs? Select all that apply.',
          options: [
            { id: 'a', text: 'Calling free twice on the same pointer' },
            { id: 'b', text: 'Reading through a pointer after the block was freed' },
            { id: 'c', text: 'Never freeing a block that is no longer needed' },
            { id: 'd', text: 'Calling `free(NULL)`' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Double free, use after free and leaks are the classic trio. `free(NULL)` is defined to do nothing, which is why setting freed pointers to NULL is a useful habit.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'malloc contents',
          prompt: '`malloc` returns memory that is already filled with zeros.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'malloc memory is uninitialised and may contain leftover data. Use `calloc` when you need zeros.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'Sanitizer flag',
          prompt: 'Complete the flag that enables AddressSanitizer: `gcc -g -fsanitize=____ prog.c`',
          accepted: [['address']],
          explanation: '`-fsanitize=address` instruments memory accesses and reports out-of-bounds reads, use after free and leaks with stack traces.',
          difficulty: 'easy',
        },
      ],
    },
    {
      slug: 'c-structs-and-linked-data',
      title: 'Structs and linked data in C',
      module: 'C fundamentals',
      skill: 'c-lang',
      minutes: 50,
      objectives: [
        'Define structs, name them with typedef and initialise them',
        'Access members with . and -> and pass structs by pointer',
        'Sort arrays of structs with qsort and a comparison function',
        'Build, traverse and free a singly linked list',
      ],
      body: `A **struct** groups related values of different types into one type, the C ancestor of classes and records.

\`\`\`c
#include <stdio.h>

typedef struct {
    char name[32];
    int score;
} Student;                                  // typedef lets you write Student instead of struct ...

void add_bonus(Student *s, int bonus) {     // pointer: modify the caller's struct, no copy
    s->score += bonus;                      // s->score is shorthand for (*s).score
}

int main(void) {
    Student a = { .name = "Asha", .score = 88 };   // designated initialisers
    Student b = a;                          // assignment copies every member
    add_bonus(&b, 5);
    printf("%s %d %d\\n", a.name, a.score, b.score);   // Asha 88 93
    return 0;
}
\`\`\`

Use \`.\` on a struct value and \`->\` on a pointer to a struct. Passing a pointer avoids copying large structs and lets the function change the original; add \`const\` (\`const Student *s\`) when it should only read.

### Sorting structs with qsort

\`qsort\` from \`<stdlib.h>\` sorts any array, given the element size and a comparison function that returns a negative, zero or positive value:

\`\`\`c
#include <stdlib.h>

typedef struct { int start, end; } Interval;

int by_start(const void *pa, const void *pb) {
    const Interval *a = pa, *b = pb;
    return (a->start > b->start) - (a->start < b->start);   // -1, 0 or 1 without overflow
}

// Interval items[n]; ...
// qsort(items, n, sizeof items[0], by_start);
\`\`\`

### Worked example: a linked list

A struct can contain a pointer to another struct of the same type, which is how linked lists, trees and graphs are built.

\`\`\`c
#include <stdio.h>
#include <stdlib.h>

typedef struct Node {
    int value;
    struct Node *next;                      // the name Node is needed inside its own definition
} Node;

Node *push_front(Node *head, int value) {
    Node *n = malloc(sizeof *n);
    if (n == NULL) { perror("malloc"); exit(1); }
    n->value = value;
    n->next = head;
    return n;                               // the new node becomes the head
}

Node *reverse(Node *head) {
    Node *prev = NULL;
    while (head != NULL) {
        Node *next = head->next;            // remember the rest of the list
        head->next = prev;                  // point this node backwards
        prev = head;
        head = next;
    }
    return prev;
}

void free_list(Node *head) {
    while (head != NULL) {
        Node *next = head->next;            // save before freeing
        free(head);
        head = next;
    }
}

int main(void) {
    Node *list = NULL;
    for (int i = 1; i <= 4; i++) list = push_front(list, i);   // 4 3 2 1
    list = reverse(list);                                      // 1 2 3 4
    for (Node *p = list; p != NULL; p = p->next) printf("%d ", p->value);
    printf("\\n");
    free_list(list);
    return 0;
}
\`\`\`

Each node is a separate heap allocation, so each needs its own \`free\`. Reversing touches every node once: O(n) time and O(1) extra memory.

### Common mistakes
- Using \`.\` on a pointer (\`p.value\`) or \`->\` on a value; the compiler error tells you which you have.
- Freeing a node and then reading \`node->next\`. Save the next pointer first.
- Writing \`return a->start - b->start;\` in a comparator, which can overflow for large values.
- Copying a struct that contains a pointer and assuming the pointed-to data was copied too. Only the pointer is copied (a shallow copy).
- Returning a pointer to a local struct instead of allocating it.`,
      practice: [
        { title: 'Reverse a linked list', kind: 'problem', ref: 'reverse-linked-list' },
        { title: 'Merge intervals', kind: 'problem', ref: 'merge-intervals' },
        { title: 'Student records', kind: 'exercise', prompt: 'Read lines of "name score" from standard input into a growable array of Student structs. Sort them with qsort by score descending, then name ascending (use strcmp), and print them. Free all memory and check with AddressSanitizer.' },
        { title: 'List toolkit', kind: 'exercise', prompt: 'Extend the linked list with push_back (keep a tail pointer), length, find (returning a Node * or NULL) and remove_value (removing the first match and freeing it). Test removal of the head, a middle node, the last node and a missing value.' },
      ],
      resources: [
        { title: 'Struct declaration', url: 'https://en.cppreference.com/w/c/language/struct', source: 'cppreference.com', kind: 'docs' },
        { title: 'qsort', url: 'https://en.cppreference.com/w/c/algorithm/qsort', source: 'cppreference.com', kind: 'docs' },
        { title: 'CS50x Week 5: Data Structures', url: 'https://cs50.harvard.edu/x/2024/weeks/5/', source: 'Harvard CS50', kind: 'video' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Member through a pointer',
          prompt: '`p` has type `Student *`. Which expression reads the score?',
          options: [
            { id: 'a', text: '`p.score`' },
            { id: 'b', text: '`p->score`' },
            { id: 'c', text: '`*p.score`' },
          ],
          correct: ['b'],
          explanation: '`p->score` means `(*p).score`. Without the parentheses, `*p.score` tries to apply `.` to the pointer first and does not compile.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Struct assignment',
          prompt: 'Assigning one struct variable to another copies every member, but if a member is a pointer, only the address is copied, not the data it points to.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Struct assignment is a shallow, member-by-member copy. Both structs then point at the same heap data, so be careful about who frees it.',
          difficulty: 'medium',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Comparator overflow',
          prompt: 'Why is `return a->start - b->start;` risky in a qsort comparator?',
          options: [
            { id: 'a', text: 'qsort requires the result to be exactly -1, 0 or 1' },
            { id: 'b', text: 'The subtraction can overflow for large values of opposite sign, giving the wrong sign' },
            { id: 'c', text: 'Subtraction is slower than comparison' },
          ],
          correct: ['b'],
          explanation: 'Any negative, zero or positive value is allowed, but signed overflow is undefined and can flip the sign. Comparing with `>` and `<` is always safe.',
          difficulty: 'hard',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Freeing a list',
          prompt: 'When freeing a linked list node by node, you must save `node->____` in a variable before calling `free(node)`.',
          accepted: [['next']],
          explanation: 'After `free(node)` the node\'s memory is gone, so reading `node->next` would be a use after free.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'matching',
          title: 'Struct syntax',
          prompt: 'Match each piece of syntax to what it does.',
          pairs: {
            left: [
              { id: 'l1', text: '`typedef struct { ... } Point;`' },
              { id: 'l2', text: '`(*p).x`' },
              { id: 'l3', text: '`{ .x = 1, .y = 2 }`' },
              { id: 'l4', text: '`qsort(arr, n, sizeof arr[0], cmp)`' },
            ],
            right: [
              { id: 'r1', text: 'Lets you write Point instead of a struct tag' },
              { id: 'r2', text: 'The same as p->x' },
              { id: 'r3', text: 'A designated initialiser naming each member' },
              { id: 'r4', text: 'Sorts an array using a comparison function' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'These four pieces appear in almost every C program that models data.',
          difficulty: 'easy',
        },
      ],
    },
    {
      slug: 'cpp-basics',
      title: 'From C to modern C++',
      module: 'Modern C++',
      skill: 'cpp',
      minutes: 50,
      objectives: [
        'Use iostream, std::string and std::vector instead of raw C equivalents',
        'Pass by value, by reference and by const reference, and know when to use each',
        'Use auto, range-based for loops and function overloading',
        'Read words and whole lines of input with cin, getline and istringstream',
      ],
      body: `C++ keeps C's performance and its ability to work close to the hardware, but adds abstractions that manage memory for you. Modern C++ (C++17 and later) rarely needs raw \`malloc\`, \`free\` or \`char\` arrays.

\`\`\`cpp
#include <iostream>
#include <string>
#include <vector>

void addBonus(std::vector<int>& scores, int bonus) {   // reference: modifies the caller's vector
    for (int& s : scores) s += bonus;
}

int total(const std::vector<int>& scores) {             // const reference: no copy, read-only
    int sum = 0;
    for (int s : scores) sum += s;
    return sum;
}

int main() {
    std::vector<int> scores{72, 95, 88};
    scores.push_back(60);                 // grows automatically
    addBonus(scores, 5);

    std::string name = "Asha";
    name += " K.";                        // no buffer sizes to manage
    std::cout << name << ": " << total(scores) << '\\n';   // Asha K.: 335
}
\`\`\`

\`\`\`bash
g++ -std=c++20 -Wall -Wextra -g -o scores scores.cpp
\`\`\`

CodeLab compiles C++ with \`g++ -O2 -std=c++20\`. \`main\` in C++ may omit \`return 0;\`.

### References

A **reference** (\`int&\`) is another name for an existing variable. It must be initialised and cannot be re-pointed later. How to pass parameters:

| Parameter | Use when |
|---|---|
| \`int x\` (by value) | small types such as int, double, char |
| \`const std::vector<int>& v\` | large objects you only read |
| \`std::vector<int>& v\` | the function should modify the caller's object |

### auto, range-for and overloading

\`\`\`cpp
auto count = 3;                    // int
auto ratio = 0.5;                  // double
auto words = std::vector<std::string>{"hi", "there"};
for (const auto& w : words) std::cout << w << ' ';

int area(int side) { return side * side; }               // overloads: same name,
int area(int w, int h) { return w * h; }                  // different parameters
\`\`\`

Use \`nullptr\` instead of \`NULL\` for null pointers.

### Worked example: reverse the words of each line

\`\`\`cpp
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

int main() {
    std::ios::sync_with_stdio(false);   // faster I/O for large inputs
    std::cin.tie(nullptr);

    std::string line;
    while (std::getline(std::cin, line)) {          // read whole lines until end of input
        std::istringstream in(line);
        std::vector<std::string> words;
        for (std::string w; in >> w;) words.push_back(w);   // >> skips any whitespace

        for (std::size_t i = words.size(); i > 0; i--) {
            std::cout << words[i - 1] << (i > 1 ? " " : "");
        }
        std::cout << '\\n';
    }
}
\`\`\`

For the input \`the quick brown fox\` this prints \`fox brown quick the\`. \`std::cin >> x\` reads one whitespace-separated value; \`std::getline\` reads the rest of the line.

### Common mistakes
- Passing a large vector or string by value, copying it on every call. Use \`const&\`.
- Mixing \`std::cin >> n\` and \`std::getline\`: the newline left behind makes the next \`getline\` return an empty line. Call \`std::cin.ignore()\` in between, or read everything with \`getline\`.
- Indexing past the end with \`v[i]\`, which is undefined behaviour. \`v.at(i)\` checks and throws \`std::out_of_range\`.
- Comparing an \`int\` loop counter with \`v.size()\` (unsigned) and getting warnings or wrap-around bugs; use \`std::size_t\` or a range-for.
- Writing \`using namespace std;\` in header files, which leaks every standard name into every file that includes them.`,
      practice: [
        { title: 'Reverse the words', kind: 'problem', ref: 'reverse-words' },
        { title: 'Count the vowels', kind: 'problem', ref: 'count-vowels' },
        { title: 'Largest and smallest', kind: 'problem', ref: 'max-and-min' },
        { title: 'Port a C program', kind: 'exercise', prompt: 'Rewrite your C growable-array exercise in C++ using std::vector<int>, and list every line of the C version that disappeared and every bug class (leaks, realloc failures, off-by-one capacity) you no longer have to think about.' },
      ],
      resources: [
        { title: 'Learn C++', url: 'https://www.learncpp.com/', source: 'learncpp.com', kind: 'course' },
        { title: 'std::vector', url: 'https://en.cppreference.com/w/cpp/container/vector', source: 'cppreference.com', kind: 'docs' },
        { title: 'Reference declaration', url: 'https://en.cppreference.com/w/cpp/language/reference', source: 'cppreference.com', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Best parameter type',
          prompt: 'A function only reads a large `std::vector<int>`. Which parameter type avoids a copy and prevents accidental changes?',
          options: [
            { id: 'a', text: '`std::vector<int> v`' },
            { id: 'b', text: '`std::vector<int>& v`' },
            { id: 'c', text: '`const std::vector<int>& v`' },
          ],
          correct: ['c'],
          explanation: 'A const reference refers to the caller\'s vector without copying it, and `const` makes any modification a compile error.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Unchecked indexing',
          prompt: 'For a `std::vector<int> v` of size 3, `v[10]` throws `std::out_of_range`.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: '`operator[]` does no bounds checking, so `v[10]` is undefined behaviour. `v.at(10)` checks and throws `std::out_of_range`.',
          difficulty: 'medium',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'References',
          prompt: 'Which statements about C++ references are true? Select all that apply.',
          options: [
            { id: 'a', text: 'A reference must be initialised when it is declared' },
            { id: 'b', text: 'A reference can later be changed to refer to a different variable' },
            { id: 'c', text: 'After `int& r = x;`, the statement `r = 5;` sets `x` to 5' },
            { id: 'd', text: 'Passing by non-const reference lets a function modify the caller\'s object' },
          ],
          correct: ['a', 'c', 'd'],
          explanation: 'A reference is permanently bound to the object it was initialised with; assigning to it assigns to that object.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Read a whole line',
          prompt: 'Complete the call that reads an entire line, spaces included, into `line`: `std::____(std::cin, line);`',
          accepted: [['getline']],
          explanation: '`std::getline` reads up to the newline. `std::cin >> line` would stop at the first whitespace.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'auto deduction',
          prompt: 'What type does `auto x = 3.0;` give `x`?',
          options: [
            { id: 'a', text: '`int`' },
            { id: 'b', text: '`float`' },
            { id: 'c', text: '`double`' },
          ],
          correct: ['c'],
          explanation: 'A floating-point literal without a suffix is a `double`. `3.0f` would be a `float` and `3` an `int`.',
          difficulty: 'easy',
        },
      ],
    },
    {
      slug: 'cpp-classes-and-raii',
      title: 'Classes and RAII',
      module: 'Modern C++',
      skill: 'cpp',
      minutes: 60,
      milestone: true,
      completionCriteria: 'Complete the "RAII file wrapper" exercise with no raw delete or fclose calls outside the destructor, and score 70% or more on the quiz.',
      objectives: [
        'Write classes with constructors, member initialiser lists, member functions and destructors',
        'Explain RAII: tying resource lifetime to object lifetime',
        'Use std::unique_ptr and std::make_unique instead of new and delete, and transfer ownership with std::move',
        'Apply the rule of zero, and disable copying for classes that own a unique resource',
      ],
      body: `### Classes

\`\`\`cpp
#include <stdexcept>
#include <string>

class BankAccount {
public:
    explicit BankAccount(std::string owner) : owner_(std::move(owner)) {}   // member initialiser list

    void deposit(long long cents) {
        if (cents <= 0) throw std::invalid_argument("deposit must be positive");
        balance_ += cents;
    }
    long long balance() const { return balance_; }   // const: does not modify the object

private:
    std::string owner_;
    long long balance_ = 0;                          // default member initialiser
};
\`\`\`

\`public\` members form the interface; \`private\` members are the implementation. \`explicit\` stops accidental conversions such as passing a plain string where a \`BankAccount\` was expected. Mark member functions \`const\` when they only read.

### RAII

**RAII** (Resource Acquisition Is Initialisation) is the central idea of C++: acquire a resource in a constructor and release it in the destructor. Destructors run automatically when an object goes out of scope, in reverse order of construction, **even when an exception is thrown**. Cleanup can no longer be forgotten.

\`\`\`cpp
#include <cstdio>
#include <memory>
#include <stdexcept>
#include <string>

class File {
public:
    File(const std::string& path, const char* mode)
        : handle_(std::fopen(path.c_str(), mode)) {
        if (!handle_) throw std::runtime_error("cannot open " + path);
    }
    ~File() { std::fclose(handle_); }          // destructor: always runs
    File(const File&) = delete;                // no copying: exactly one owner
    File& operator=(const File&) = delete;
    void write(const std::string& text) { std::fputs(text.c_str(), handle_); }
private:
    std::FILE* handle_;
};

struct Node {
    int value;
    std::unique_ptr<Node> next;                // owns the rest of the list
};

int main() {
    File log("log.txt", "w");
    log.write("started\\n");

    auto head = std::make_unique<Node>(Node{1, nullptr});
    head->next = std::make_unique<Node>(Node{2, nullptr});

    std::unique_ptr<Node> owner = std::move(head);   // ownership moves; head is now empty
}   // owner frees both nodes, then log closes the file
\`\`\`

Copying \`File\` is deleted because two copies would both call \`fclose\` on the same handle. Compare this list with the C version in topic 5: there is no \`free_list\`, because each \`unique_ptr\` frees what it owns.

### Smart pointers

| Type | Meaning |
|---|---|
| \`std::unique_ptr<T>\` | sole owner; cannot be copied, only moved; zero overhead over a raw pointer |
| \`std::shared_ptr<T>\` | shared ownership with a reference count; freed when the last owner goes away |
| raw \`T*\` or \`T&\` | non-owning access to something someone else owns |

Create them with \`std::make_unique<T>(...)\` and \`std::make_shared<T>(...)\`. In modern code you should almost never write \`new\` or \`delete\` yourself.

### The rule of zero

If your class only holds members that already manage themselves (\`std::string\`, \`std::vector\`, \`std::unique_ptr\`), write **no** destructor, copy or move operations at all: the compiler-generated ones do the right thing. Only a class that directly owns a raw resource, like \`File\`, needs a custom destructor, and then it must also decide what copying and moving mean (the rule of three or five).

### Common mistakes
- Using \`new\` and \`delete\` directly; an early return or exception between them leaks.
- Holding a raw owning pointer in a class without deleting copy operations, so two copies free the same memory.
- Using a \`unique_ptr\` after moving from it; it is now null.
- Reaching for \`shared_ptr\` everywhere. Most objects have one clear owner.
- Forgetting a \`virtual\` destructor in a base class that is deleted through a base pointer.`,
      practice: [
        { title: 'Valid parentheses', kind: 'problem', ref: 'valid-parentheses' },
        { title: 'RAII file wrapper', kind: 'exercise', prompt: 'Extend the File class with readLine() returning std::optional<std::string>. Use it to count lines in a file, and show with a print statement in the destructor that the file closes even when you throw an exception halfway through.' },
        { title: 'Accounts with unique_ptr', kind: 'exercise', prompt: 'Write a Bank class holding std::vector<std::unique_ptr<BankAccount>>. Add open(name), find(name) returning BankAccount* (or nullptr) and transfer(from, to, cents) that throws std::invalid_argument for bad input. Confirm the class follows the rule of zero and has no destructor.' },
      ],
      resources: [
        { title: 'RAII', url: 'https://en.cppreference.com/w/cpp/language/raii', source: 'cppreference.com', kind: 'docs' },
        { title: 'std::unique_ptr', url: 'https://en.cppreference.com/w/cpp/memory/unique_ptr', source: 'cppreference.com', kind: 'docs' },
        { title: 'C++ Core Guidelines', url: 'https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines', source: 'Standard C++ Foundation', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'When destructors run',
          prompt: 'When does the destructor of a local object run?',
          options: [
            { id: 'a', text: 'Only when you call delete on it' },
            { id: 'b', text: 'When it goes out of scope, including when an exception leaves the scope' },
            { id: 'c', text: 'At some later time chosen by a garbage collector' },
          ],
          correct: ['b'],
          explanation: 'Destruction is deterministic in C++. That guarantee is what makes RAII reliable even on error paths.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Copying unique_ptr',
          prompt: 'A `std::unique_ptr` can be copied, giving two owners of the same object.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: '`unique_ptr` is move-only, which guarantees a single owner. Use `shared_ptr` when ownership really is shared.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Moving ownership',
          prompt: 'After `auto p2 = std::move(p1);` where `p1` is a `std::unique_ptr<Node>`, what is true?',
          options: [
            { id: 'a', text: 'Both p1 and p2 own the node' },
            { id: 'b', text: 'p2 owns the node and p1 is null' },
            { id: 'c', text: 'The node is copied, so each pointer owns its own node' },
          ],
          correct: ['b'],
          explanation: 'Moving transfers ownership. Using `p1` afterwards would dereference a null pointer.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Creating a unique_ptr',
          prompt: 'Complete the preferred way to create a heap object owned by a unique_ptr: `auto node = std::____<Node>();`',
          accepted: [['make_unique']],
          explanation: '`std::make_unique` allocates and wraps the object in one step, so there is never an unowned raw pointer.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'RAII types',
          prompt: 'Which of these release their resource automatically when they go out of scope? Select all that apply.',
          options: [
            { id: 'a', text: '`std::vector<int>`' },
            { id: 'b', text: '`std::unique_ptr<Node>`' },
            { id: 'c', text: 'A raw `Node*` returned by `new Node`' },
            { id: 'd', text: '`std::lock_guard<std::mutex>`' },
            { id: 'e', text: 'A `FILE*` returned by `fopen`' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'Raw pointers and C `FILE*` handles have no destructor, so you must free or close them yourself, or wrap them in an RAII class.',
          difficulty: 'medium',
        },
      ],
    },
    {
      slug: 'stl-containers-and-algorithms',
      title: 'STL containers and algorithms',
      module: 'Modern C++',
      skill: 'cpp',
      minutes: 55,
      objectives: [
        'Choose between vector, deque, map, unordered_map, set and priority_queue',
        'Use algorithms such as sort, find_if, count_if, accumulate, lower_bound and unique',
        'Write lambdas, including captures, to customise algorithms',
        'Avoid pitfalls such as map operator[] inserting keys and iterator invalidation',
      ],
      body: `The Standard Template Library (STL) separates **containers**, which store data, from **algorithms**, which work on ranges of elements through **iterators** (generalised pointers such as \`v.begin()\` and \`v.end()\`).

### Containers

| Container | Structure | Typical operations |
|---|---|---|
| \`std::vector\` | contiguous dynamic array | index O(1), push_back amortised O(1) |
| \`std::deque\` | double-ended queue | push/pop at both ends O(1) |
| \`std::map\` / \`std::set\` | balanced tree, keys sorted | insert/find O(log n) |
| \`std::unordered_map\` / \`std::unordered_set\` | hash table | insert/find O(1) average |
| \`std::priority_queue\` | binary heap | top O(1), push/pop O(log n); largest first by default |
| \`std::stack\` / \`std::queue\` | adapters over deque | LIFO / FIFO |

Default to \`std::vector\`; its contiguous memory is very cache-friendly.

### Algorithms and lambdas

\`\`\`cpp
#include <algorithm>
#include <numeric>
#include <vector>

std::vector<int> v{5, 3, 9, 1, 7, 3};
std::sort(v.begin(), v.end());                                   // 1 3 3 5 7 9
auto evens = std::count_if(v.begin(), v.end(), [](int x) { return x % 2 == 0; });   // 0
int sum = std::accumulate(v.begin(), v.end(), 0);                // 28
bool has7 = std::binary_search(v.begin(), v.end(), 7);           // true (needs sorted input)
auto it = std::lower_bound(v.begin(), v.end(), 4);               // first element >= 4, here 5
v.erase(std::unique(v.begin(), v.end()), v.end());               // 1 3 5 7 9

int limit = 4;
auto firstBig = std::find_if(v.begin(), v.end(), [limit](int x) { return x > limit; });   // 5
std::sort(v.begin(), v.end(), [](int a, int b) { return a > b; });   // descending
\`\`\`

A **lambda** \`[capture](params) { body }\` is an inline function. The capture list says which outside variables it may use: \`[limit]\` copies \`limit\`, \`[&total]\` refers to \`total\`, \`[&]\` captures everything used by reference. \`std::unique\` only removes **adjacent** duplicates, which is why it follows a sort.

### Worked example: top words

\`\`\`cpp
#include <algorithm>
#include <iostream>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

int main() {
    std::unordered_map<std::string, int> counts;
    for (std::string w; std::cin >> w;) counts[w]++;        // missing keys start at 0

    std::vector<std::pair<std::string, int>> items(counts.begin(), counts.end());
    std::sort(items.begin(), items.end(), [](const auto& a, const auto& b) {
        if (a.second != b.second) return a.second > b.second;   // higher count first
        return a.first < b.first;                               // then alphabetical
    });

    for (const auto& [word, n] : items) {                   // structured bindings
        std::cout << word << ' ' << n << '\\n';
    }
}
\`\`\`

For \`the cat and the hat\` this prints \`the 2\` followed by \`and 1\`, \`cat 1\` and \`hat 1\`. Counting is O(n) on average and sorting the k distinct words is O(k log k). A comparator must define a strict ordering: return \`true\` only when \`a\` should come before \`b\`, never for equal elements.

### Common mistakes
- Reading with \`m[key]\` when the key might be missing: \`operator[]\` **inserts** a default value. Use \`m.find(key)\`, \`m.count(key)\` or (C++20) \`m.contains(key)\`.
- Keeping an iterator, pointer or reference into a vector across \`push_back\` or \`erase\`: reallocation invalidates it.
- Calling \`std::unique\` without sorting first, or forgetting the \`erase\` that actually shrinks the container.
- Writing a comparator with \`<=\`, which breaks \`std::sort\`'s requirements and can crash.
- Using \`std::endl\` in a hot loop; it flushes every time. Prefer \`'\\n'\`.`,
      practice: [
        { title: 'Word frequency', kind: 'problem', ref: 'word-frequency' },
        { title: 'Top k frequent elements', kind: 'problem', ref: 'top-k-frequent' },
        { title: 'Two sum', kind: 'problem', ref: 'two-sum' },
        { title: 'Kth largest element', kind: 'problem', ref: 'kth-largest' },
        { title: 'Second largest', kind: 'exercise', prompt: 'Given a vector of ints, find the second largest distinct value using std::sort and std::unique, or print "none". Then write a single-pass O(n) version and compare both on 10 test inputs, including all-equal values and a single element.' },
      ],
      resources: [
        { title: 'Containers library', url: 'https://en.cppreference.com/w/cpp/container', source: 'cppreference.com', kind: 'docs' },
        { title: 'Algorithms library', url: 'https://en.cppreference.com/w/cpp/algorithm', source: 'cppreference.com', kind: 'docs' },
        { title: 'Lambda expressions', url: 'https://en.cppreference.com/w/cpp/language/lambda', source: 'cppreference.com', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'matching',
          title: 'Container structures',
          prompt: 'Match each container to how it works.',
          pairs: {
            left: [
              { id: 'l1', text: '`std::vector`' },
              { id: 'l2', text: '`std::unordered_map`' },
              { id: 'l3', text: '`std::map`' },
              { id: 'l4', text: '`std::priority_queue`' },
            ],
            right: [
              { id: 'r1', text: 'Contiguous dynamic array' },
              { id: 'r2', text: 'Hash table with average O(1) lookup' },
              { id: 'r3', text: 'Balanced tree keeping keys sorted' },
              { id: 'r4', text: 'Heap that gives the largest element first by default' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'Knowing the underlying structure tells you the costs: arrays index fast, hashes look up fast, trees keep order and heaps give the extreme element.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'map operator[]',
          prompt: 'Evaluating `counts["zebra"]` on a `std::map<std::string, int>` that has no "zebra" key leaves the map unchanged.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: '`operator[]` inserts the key with a default value (0 for int) if it is missing. Use `find`, `count` or `contains` to check without inserting.',
          difficulty: 'medium',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'sort before unique',
          prompt: 'Why is `std::unique` usually called right after `std::sort`?',
          options: [
            { id: 'a', text: '`std::unique` only removes duplicates that are next to each other' },
            { id: 'b', text: '`std::unique` sorts the range as a side effect' },
            { id: 'c', text: '`std::unique` refuses to compile on unsorted vectors' },
          ],
          correct: ['a'],
          explanation: 'Sorting groups equal values together so `unique` can collapse them. It returns an iterator to the new logical end, which you pass to `erase`.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Capture by reference',
          prompt: 'Complete the capture list so the lambda can add to the outside variable `total`: `std::for_each(v.begin(), v.end(), [____](int x) { total += x; });`',
          accepted: [['&total', '&']],
          explanation: '`[&total]` (or `[&]`) captures by reference so the lambda changes the real variable. Capturing by value would not compile here, because the copy is const inside the lambda.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Iterator invalidation',
          prompt: 'You hold an iterator into a `std::vector`. Which operations on the vector can invalidate it? Select all that apply.',
          options: [
            { id: 'a', text: '`push_back`, if it causes a reallocation' },
            { id: 'b', text: '`erase` of an element at or before the iterator' },
            { id: 'c', text: 'Calling `size()`' },
            { id: 'd', text: 'Reading an element with `at(i)`' },
          ],
          correct: ['a', 'b'],
          explanation: 'Reallocation moves every element and erase shifts later elements, so old iterators no longer point where you think. Read-only calls never invalidate.',
          difficulty: 'hard',
        },
      ],
    },
  ],
};

export const goTrack: SeedTrack = {
  slug: 'go-essentials',
  title: 'Go Essentials',
  category: 'programming',
  summary: 'Write simple, fast and concurrent services in Go, the language of much of today\'s cloud infrastructure.',
  description: `**Who it's for:** developers heading towards backend services, cloud tooling, DevOps or site reliability work.

**Prerequisites:** experience with at least one programming language, including functions, loops and collections.

**You will be able to:**
- set up a Go module, and run, build, format and test programs
- use slices, maps, structs, methods and interfaces idiomatically
- handle errors as values, including wrapping and inspecting them
- run work concurrently with goroutines, channels, select and sync primitives, and check it with the race detector
- write table-driven tests and solve CodeLab problems in Go

**Milestone:** *Goroutines and channels* (topic 6).`,
  level: 'intermediate',
  estimatedHours: 18,
  roles: ['backend developer', 'cloud engineer', 'devops engineer', 'site reliability engineer'],
  contentStatus: 'complete',
  topics: [
    // ------------------------------------------------------------------ 1
    {
      slug: 'go-setup-and-basics',
      title: 'Setup, packages and variables',
      module: 'Getting started',
      skill: 'go',
      minutes: 30,
      objectives: [
        'Install Go, create a module with go mod init, and run or build it with go run and go build',
        'Declare variables with var and := and predict their zero values',
        'Convert explicitly between numeric types and define constants with iota',
        'Format output with fmt verbs and read input line by line with bufio.Scanner',
      ],
      body: `Every Go file starts with a **package** clause. An executable program uses \`package main\` and begins in \`func main()\`. Code lives in a **module**: a folder whose \`go.mod\` file names it.

### Create, run and build

\`\`\`bash
mkdir hello && cd hello
go mod init example.com/hello   # creates go.mod
go run .                        # compile and run in one step
go build                        # write a binary named hello
\`\`\`

### Variables, constants and conversion

\`\`\`go
package main

import "fmt"

const (
    Small  = iota // 0
    Medium        // 1
    Large         // 2
)

func main() {
    var count int        // zero value 0
    var label string     // zero value ""
    name := "Asha"       // short declaration, type inferred
    price, qty := 2.5, 4 // float64 and int
    count = qty * 2
    total := price * float64(qty) // explicit conversion required
    fmt.Println(name, count, total, label == "") // Asha 8 10 true
    fmt.Printf("%s has %d items\\n", name, count) // Asha has 8 items
    fmt.Printf("%.2f %T %q\\n", total, Large, name) // 10.00 int "Asha"
}
\`\`\`

\`:=\` declares and assigns in one step but only inside functions; use \`var\` at package level or when you want the zero value. Go never converts numbers implicitly, and unused variables or imports are compile errors.

| Type | Zero value |
|---|---|
| \`int\`, \`float64\` | \`0\` |
| \`string\` | \`""\` |
| \`bool\` | \`false\` |
| pointers, slices, maps, channels | \`nil\` |

Useful fmt verbs: \`%v\` (default), \`%+v\` (structs with field names), \`%d\`, \`%s\`, \`%q\` (quoted), \`%.2f\`, \`%T\` (type). \`Println\` adds spaces and a newline; \`Printf\` adds neither.

### Reading input

\`\`\`go
package main

import (
    "bufio"
    "fmt"
    "os"
    "strconv"
    "strings"
)

func main() {
    sc := bufio.NewScanner(os.Stdin)
    sum := 0
    for sc.Scan() { // one line per iteration until end of input
        n, err := strconv.Atoi(strings.TrimSpace(sc.Text()))
        if err != nil {
            continue // skip lines that are not integers
        }
        sum += n
    }
    fmt.Println("sum:", sum) // lines 3, 4, x print: sum: 7
}
\`\`\`

### Common mistakes
- Writing \`x := 1\` outside a function. Package-level declarations need \`var\`.
- Multiplying an \`int\` by a \`float64\` without converting one of them.
- Leaving an unused import or variable: Go treats it as an error, not a warning.
- Forgetting \`\\n\` in \`Printf\`, so the next output runs onto the same line.`,
      practice: [
        { title: 'Sum two numbers (solve it in Go)', kind: 'problem', ref: 'sum-two-numbers' },
        { title: 'Even or odd (solve it in Go)', kind: 'problem', ref: 'even-or-odd' },
        { title: 'Hello module', kind: 'exercise', prompt: 'Install Go, create a module, and write a program that reads a name with bufio.Scanner and prints a greeting. Build it with go build and run the binary.' },
        { title: 'Tour basics', kind: 'exercise', prompt: 'Complete the "Basics" section of A Tour of Go (packages, variables and functions), and write down one thing that differs from a language you already know.' },
      ],
      resources: [
        { title: 'Tutorial: Get started with Go', url: 'https://go.dev/doc/tutorial/getting-started', source: 'The Go Authors', kind: 'docs' },
        { title: 'A Tour of Go', url: 'https://go.dev/tour/', source: 'The Go Authors', kind: 'interactive' },
        { title: 'Go by Example: Variables', url: 'https://gobyexample.com/variables', source: 'Go by Example', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Zero value of a string',
          prompt: 'What value does `s` hold after `var s string`?',
          options: [
            { id: 'a', text: '`nil`' },
            { id: 'b', text: 'The empty string `""`' },
            { id: 'c', text: 'A single space' },
            { id: 'd', text: 'It is uninitialised, and reading it is an error' },
          ],
          correct: ['b'],
          explanation: 'Every Go type has a zero value. For strings it is the empty string; `nil` is the zero value only for pointers, slices, maps, channels, functions and interfaces.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Short declarations',
          prompt: 'The short declaration `count := 5` can be written at package level, outside any function.',
          options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }],
          correct: ['false'],
          explanation: '`:=` is only allowed inside functions. At package level you must write `var count = 5`.',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Explicit conversion',
          prompt: '`n` is an `int`. Fill in the conversion so this compiles and `f` is a float: `f := ____(n) * 1.5`',
          accepted: [['float64', 'float32']],
          explanation: 'Go has no implicit numeric conversions. `float64(n)` converts the integer so it can be multiplied by the floating-point constant.',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'fmt verbs',
          prompt: 'Match each fmt verb to what it prints.',
          pairs: {
            left: [
              { id: 'l1', text: '`%d`' },
              { id: 'l2', text: '`%q`' },
              { id: 'l3', text: '`%T`' },
              { id: 'l4', text: '`%+v`' },
            ],
            right: [
              { id: 'r1', text: 'An integer in base 10' },
              { id: 'r2', text: 'A double-quoted string' },
              { id: 'r3', text: 'The type of the value' },
              { id: 'r4', text: 'A struct with its field names' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: '`%d` formats integers, `%q` quotes strings, `%T` prints the Go type such as `float64`, and `%+v` adds field names when printing structs.',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'iota',
          prompt: 'Given `const ( A = iota; B; C )`, what is the value of `C`?',
          options: [
            { id: 'a', text: '0' },
            { id: 'b', text: '1' },
            { id: 'c', text: '2' },
            { id: 'd', text: '3' },
          ],
          correct: ['c'],
          explanation: '`iota` starts at 0 in a const block and increases by one for each line. Lines without an expression repeat the previous one, so A = 0, B = 1 and C = 2.',
        },
      ],
    },
    // ------------------------------------------------------------------ 2
    {
      slug: 'go-control-flow-and-functions',
      title: 'Control flow and functions',
      module: 'Getting started',
      skill: 'go',
      minutes: 35,
      objectives: [
        'Use for as Go\'s only loop, in its counting, while-style, infinite and range forms',
        'Write if statements with an init statement, and switch without fall-through',
        'Return multiple and named values, and write variadic functions',
        'Capture state in closures',
        'Use defer for cleanup and predict its order and argument evaluation',
      ],
      body: `Go keeps control flow small. \`for\` is the only loop keyword, conditions need no parentheses, and braces are always required.

| Form | Example |
|---|---|
| Counting | \`for i := 0; i < n; i++ { }\` |
| While-style | \`for n > 0 { n /= 10 }\` |
| Infinite | \`for { }\` (leave with \`break\` or \`return\`) |
| Range | \`for i, v := range nums { }\` |
| Range over an int (Go 1.22+) | \`for i := range 3 { }\` gives 0, 1, 2 |

### Functions, closures and switch

\`\`\`go
package main

import (
    "fmt"
    "strconv"
)

func divmod(a, b int) (q, r int) { // named results
    q = a / b
    r = a % b
    return // "naked" return sends back q and r
}

func sum(nums ...int) int { // variadic: nums is a []int
    total := 0
    for _, n := range nums {
        total += n
    }
    return total
}

func counter() func() int { // returns a closure
    n := 0
    return func() int {
        n++ // n survives between calls
        return n
    }
}

func main() {
    if v, err := strconv.Atoi("42"); err == nil { // v, err scoped to the if
        fmt.Println(v * 2) // 84
    }
    q, r := divmod(17, 5)
    fmt.Println(q, r) // 3 2
    xs := []int{4, 5}
    fmt.Println(sum(1, 2, 3), sum(), sum(xs...)) // 6 0 9

    next := counter()
    next()
    fmt.Println(next()) // 2

    switch day := 5; day {
    case 6, 7:
        fmt.Println("weekend")
    case 5:
        fmt.Println("friday")
        fallthrough // explicitly run the next case body too
    default:
        fmt.Println("workday")
    }
    // friday
    // workday
}
\`\`\`

A switch case ends automatically; \`fallthrough\` runs the next case body without checking its condition. A switch with no expression (\`switch { case x > 0: ... }\`) is a tidy if/else chain.

### defer

\`defer\` schedules a call for when the surrounding function returns. Deferred calls run last in, first out, and their **arguments are evaluated immediately**.

\`\`\`go
package main

import "fmt"

func main() {
    x := 1
    defer fmt.Println("deferred x =", x) // x is evaluated now: 1
    x = 2
    for i := 1; i <= 3; i++ {
        defer fmt.Println("defer", i)
    }
    fmt.Println("x =", x)
}
// Output:
// x = 2
// defer 3
// defer 2
// defer 1
// deferred x = 1
\`\`\`

Use it right after acquiring a resource: \`f, err := os.Open(p)\`, check \`err\`, then \`defer f.Close()\`.

### Common mistakes
- Expecting C-style fall-through. Each case breaks on its own; use \`fallthrough\` only when you mean it.
- Assuming deferred arguments are read when the deferred call runs. They are captured at the \`defer\` line.
- Deferring inside a long loop, which holds every file open until the function returns.
- Discarding errors with \`v, _ := strconv.Atoi(s)\`, so bad input silently becomes 0.`,
      practice: [
        { title: 'FizzBuzz (solve it in Go with a tagless switch)', kind: 'problem', ref: 'fizzbuzz' },
        { title: 'Grade calculator (solve it in Go)', kind: 'problem', ref: 'grade-calculator' },
        { title: 'Min and max', kind: 'exercise', prompt: 'Write func minMax(nums ...int) (min, max int) that returns both values in one pass, and call it from main with a few test inputs, including a slice passed with nums....' },
      ],
      resources: [
        { title: 'A Tour of Go: Flow control', url: 'https://go.dev/tour/flowcontrol/1', source: 'The Go Authors', kind: 'interactive' },
        { title: 'Go by Example: Closures', url: 'https://gobyexample.com/closures', source: 'Go by Example', kind: 'article' },
        { title: 'Go by Example: Defer', url: 'https://gobyexample.com/defer', source: 'Go by Example', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Deferred loop',
          prompt: 'What does `for i := 0; i < 3; i++ { defer fmt.Print(i) }` print when the function returns?',
          options: [
            { id: 'a', text: '`012`' },
            { id: 'b', text: '`210`' },
            { id: 'c', text: '`333`' },
            { id: 'd', text: '`222`' },
          ],
          correct: ['b'],
          explanation: 'Deferred calls run last in, first out, and each call captured the value of `i` when its `defer` statement ran, so they print 2, 1, 0.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Switch fall-through',
          prompt: 'In a Go switch, execution continues into the next case unless you write `break`.',
          options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }],
          correct: ['false'],
          explanation: 'Go cases never fall through by default. You must write `fallthrough` to run the next case body.',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'The only loop',
          prompt: 'Fill in the keyword for this while-style loop: `____ n > 0 { n /= 10 }`',
          accepted: [['for']],
          explanation: 'Go has no `while` keyword. `for` with only a condition behaves like a while loop.',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Variadic functions',
          prompt: 'Given `func sum(nums ...int) int`, which statements are true? Select all that apply.',
          options: [
            { id: 'a', text: 'Inside `sum`, `nums` has type `[]int`' },
            { id: 'b', text: 'Calling `sum()` with no arguments is valid' },
            { id: 'c', text: 'A slice `s` can be passed as `sum(s...)`' },
            { id: 'd', text: 'A slice `s` can be passed as `sum(s)`' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'The variadic parameter is a slice inside the function and may be empty. To pass an existing slice you must spread it with `s...`; `sum(s)` does not compile.',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'Deferred arguments',
          prompt: 'What does this print? `x := 1; defer fmt.Println(x); x = 2`',
          options: [
            { id: 'a', text: '1' },
            { id: 'b', text: '2' },
            { id: 'c', text: 'Nothing, deferred calls are skipped' },
            { id: 'd', text: 'It does not compile' },
          ],
          correct: ['a'],
          explanation: 'The arguments of a deferred call are evaluated when the `defer` statement executes, when `x` is still 1. Only the call itself is delayed.',
        },
      ],
    },
    // ------------------------------------------------------------------ 3
    {
      slug: 'slices-maps-and-structs',
      title: 'Slices, maps and structs',
      module: 'Data',
      skill: 'go',
      minutes: 45,
      objectives: [
        'Distinguish arrays from slices, and explain length versus capacity',
        'Grow slices with append and avoid aliasing bugs with copy',
        'Use maps with the comma-ok idiom and delete, and iterate them in sorted order',
        'Group related data in structs, using struct literals and embedding',
      ],
      body: `An **array** (\`[3]int\`) has a fixed length that is part of its type, and assigning it copies every element. A **slice** (\`[]int\`) is a small header (pointer, length, capacity) that views an underlying array. Slices are what you use day to day.

### Slices: len, cap, append and copy

\`\`\`go
package main

import "fmt"

func main() {
    arr := [3]int{1, 2, 3}
    b := arr // arrays are values: b is a full copy
    b[0] = 99
    fmt.Println(arr, b) // [1 2 3] [99 2 3]

    s := make([]int, 0, 4) // len 0, cap 4
    s = append(s, 10, 20, 30)
    fmt.Println(len(s), cap(s)) // 3 4

    t := s[0:2] // t shares s's backing array
    t[0] = 1
    t = append(t, 7) // spare capacity, so this overwrites s[2]
    fmt.Println(s) // [1 20 7]

    u := make([]int, len(s))
    n := copy(u, s) // u is independent
    u[1] = 0
    fmt.Println(n, s, u) // 3 [1 20 7] [1 0 7]
}
\`\`\`

When \`append\` exceeds the capacity it allocates a bigger array and copies, so always use its result: \`s = append(s, x)\`.

### Maps

\`\`\`go
package main

import (
    "fmt"
    "slices"
    "strings"
)

type Student struct {
    Name  string
    Score int
}

func main() {
    counts := map[string]int{}
    for _, w := range strings.Fields("the cat and the hat") {
        counts[w]++ // a missing key reads as 0
    }
    if _, ok := counts["dog"]; !ok {
        fmt.Println("no dog")
    }
    delete(counts, "and")

    keys := make([]string, 0, len(counts))
    for k := range counts {
        keys = append(keys, k)
    }
    slices.Sort(keys) // map order is random, so sort for stable output
    for _, k := range keys {
        fmt.Println(k, counts[k])
    }

    st := Student{Name: "Ben", Score: 67}
    p := &st
    p.Score += 5 // same as (*p).Score += 5
    fmt.Printf("%+v\\n", st)
}
// Output:
// no dog
// cat 1
// hat 1
// the 2
// {Name:Ben Score:72}
\`\`\`

### Structs and embedding

Struct literals can name fields (\`Student{Name: "Ben"}\`, missing fields get zero values). Embedding a type, as in \`type Admin struct { Student; Level int }\`, promotes its fields and methods, so \`a.Name\` works on an \`Admin\`.

### Common mistakes
- Assuming \`b := s[1:3]\` is a copy. It shares memory; use \`copy\` or \`slices.Clone\`.
- Writing to a nil map (\`var m map[string]int\`), which panics. Create it with \`make\` or a literal.
- Relying on map iteration order, which changes between runs.
- Comparing two slices with \`==\` (only \`s == nil\` is allowed); use \`slices.Equal\`.`,
      practice: [
        { title: 'Word frequency (solve it in Go)', kind: 'problem', ref: 'word-frequency' },
        { title: 'Two sum (solve it in Go with a map)', kind: 'problem', ref: 'two-sum' },
        { title: 'Word frequency by hand', kind: 'exercise', prompt: 'Read all of standard input with io.ReadAll, lowercase it, count words with a map, then sort the keys by count descending and word ascending using sort.Slice. Print "word count" lines.' },
        { title: 'Slice sharing', kind: 'exercise', prompt: 'Create a slice a of 5 ints, set b := a[1:3], change b[0] and print a. Then use copy or append to make an independent copy and repeat the experiment.' },
      ],
      resources: [
        { title: 'A Tour of Go: More types', url: 'https://go.dev/tour/moretypes/1', source: 'The Go Authors', kind: 'interactive' },
        { title: 'Go Slices: usage and internals', url: 'https://go.dev/blog/slices-intro', source: 'The Go Blog', kind: 'article' },
        { title: 'Go maps in action', url: 'https://go.dev/blog/maps', source: 'The Go Blog', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Length and capacity',
          prompt: 'After `s := make([]int, 2, 5)`, what are `len(s)` and `cap(s)`?',
          options: [
            { id: 'a', text: '2 and 5' },
            { id: 'b', text: '5 and 5' },
            { id: 'c', text: '0 and 5' },
            { id: 'd', text: '2 and 2' },
          ],
          correct: ['a'],
          explanation: '`make([]T, len, cap)` creates a slice with `len` zero-valued elements and room for `cap` elements in the backing array.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Shared backing array',
          prompt: 'What does this print? `a := []int{1, 2, 3}; b := a[:2]; b[0] = 9; fmt.Println(a)`',
          options: [
            { id: 'a', text: '`[1 2 3]`' },
            { id: 'b', text: '`[9 2 3]`' },
            { id: 'c', text: '`[9 2]`' },
            { id: 'd', text: 'It panics' },
          ],
          correct: ['b'],
          explanation: 'Slicing does not copy. `b` views the same backing array as `a`, so writing `b[0]` changes `a[0]`.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Map order',
          prompt: 'Ranging over a Go map visits keys in the order they were inserted.',
          options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }],
          correct: ['false'],
          explanation: 'Map iteration order is unspecified and deliberately varies between runs. Collect and sort the keys when you need a stable order.',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Remove a key',
          prompt: 'Fill in the built-in function that removes a key from a map: `____(counts, "and")`',
          accepted: [['delete']],
          explanation: '`delete(m, key)` removes the entry. Deleting a key that is not present is a no-op.',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Slice and map facts',
          prompt: 'Which statements are true? Select all that apply.',
          options: [
            { id: 'a', text: 'Writing to a nil map panics' },
            { id: 'b', text: 'Reading a missing key returns the value type\'s zero value' },
            { id: 'c', text: 'Assigning an array to another variable copies all its elements' },
            { id: 'd', text: '`append` always modifies the original backing array in place' },
            { id: 'e', text: 'Two slices can be compared with `==`' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Nil maps can be read but not written, missing keys read as the zero value, and arrays are values. `append` allocates a new array when capacity runs out, and slices can only be compared with `==` against nil.',
        },
      ],
    },
    // ------------------------------------------------------------------ 4
    {
      slug: 'methods-and-interfaces',
      title: 'Methods and interfaces',
      module: 'Data',
      skill: 'go',
      minutes: 40,
      objectives: [
        'Define methods with value and pointer receivers, and choose between them',
        'Explain implicit interface satisfaction and how pointer receivers affect method sets',
        'Use small standard interfaces such as fmt.Stringer and io.Reader',
        'Recover concrete types with type assertions and type switches',
        'Explain why an interface holding a nil pointer is not equal to nil',
      ],
      body: `Go has no classes. You attach **methods** to types, and a type satisfies an **interface** simply by having its methods; there is no \`implements\` keyword.

### Methods and method sets

\`\`\`go
package main

import (
    "fmt"
    "math"
)

type Shape interface{ Area() float64 }

type Circle struct{ R float64 }
type Rect struct{ W, H float64 }

func (c Circle) Area() float64 { return math.Pi * c.R * c.R }
func (r Rect) Area() float64   { return r.W * r.H }
func (r Rect) String() string  { return fmt.Sprintf("%gx%g rectangle", r.W, r.H) }

type Incrementer interface{ Inc() }
type Counter struct{ n int }

func (c *Counter) Inc() { c.n++ } // pointer receiver: changes the original

func main() {
    total := 0.0
    for _, s := range []Shape{Circle{1}, Rect{2, 3}} {
        total += s.Area()
    }
    fmt.Printf("%.2f\\n", total) // 9.14
    fmt.Println(Rect{2, 3})      // 2x3 rectangle (fmt.Stringer)

    var c Counter
    c.Inc() // Go takes &c automatically
    var inc Incrementer = &c // Counter{} would not compile here
    inc.Inc()
    fmt.Println(c.n) // 2
}
\`\`\`

A value receiver works on a copy; a pointer receiver can modify the value and avoids copying large structs. Methods with pointer receivers belong only to the method set of \`*T\`, so only \`*Counter\` satisfies \`Incrementer\`. Standard interfaces are tiny: \`fmt.Stringer\` is \`String() string\`, and \`io.Reader\` is \`Read(p []byte) (n int, err error)\`, satisfied by files, network connections and \`strings.Reader\`.

### any, type assertions and type switches

\`\`\`go
package main

import (
    "fmt"
    "time"
)

type MyErr struct{}

func (*MyErr) Error() string { return "boom" }

func mayFail() error {
    var p *MyErr // nil pointer
    return p     // interface holds (type *MyErr, value nil)
}

func describe(v any) string {
    switch x := v.(type) {
    case int:
        return fmt.Sprintf("int %d", x)
    case fmt.Stringer:
        return "stringer " + x.String()
    default:
        return fmt.Sprintf("other %T", x)
    }
}

func main() {
    fmt.Println(describe(7))           // int 7
    fmt.Println(describe(time.Second)) // stringer 1s
    fmt.Println(describe(2.5))         // other float64

    var v any = "hello"
    if s, ok := v.(string); ok { // comma-ok form never panics
        fmt.Println(s) // hello
    }
    fmt.Println(mayFail() != nil) // true
}
\`\`\`

An interface value is nil only when both its type and value are nil, so return a literal \`nil\` for "no error".

### Common mistakes
- Storing a \`T\` in an interface whose methods have pointer receivers; the compiler says the method has a pointer receiver.
- Using \`v.(T)\` without comma-ok, which panics when \`v\` holds another type.
- Returning a typed nil pointer as an \`error\`, making \`err != nil\` true.
- Designing big interfaces up front. Keep them small and define them where they are used.`,
      practice: [
        { title: 'Valid parentheses (in Go, with a Stack type that has Push and Pop methods)', kind: 'problem', ref: 'valid-parentheses' },
        { title: 'Notifier', kind: 'exercise', prompt: 'Define type Notifier interface { Notify(msg string) error } with EmailNotifier and ConsoleNotifier implementations. Write a function that sends a message to a []Notifier and collects any errors.' },
        { title: 'Stringer', kind: 'exercise', prompt: 'Give a Student struct a String() method and print a slice of students with fmt.Println to see it used automatically. Then switch it to a pointer receiver and explain what changes.' },
      ],
      resources: [
        { title: 'A Tour of Go: Methods and interfaces', url: 'https://go.dev/tour/methods/1', source: 'The Go Authors', kind: 'interactive' },
        { title: 'Go by Example: Interfaces', url: 'https://gobyexample.com/interfaces', source: 'Go by Example', kind: 'article' },
        { title: 'Go FAQ: Why is my nil error value not equal to nil?', url: 'https://go.dev/doc/faq#nil_error', source: 'The Go Authors', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Pointer receivers and interfaces',
          prompt: 'With `func (c *Counter) Inc()` and `type Incrementer interface{ Inc() }`, which assignment compiles?',
          options: [
            { id: 'a', text: '`var i Incrementer = Counter{}`' },
            { id: 'b', text: '`var i Incrementer = &Counter{}`' },
            { id: 'c', text: 'Both' },
            { id: 'd', text: 'Neither' },
          ],
          correct: ['b'],
          explanation: 'A method with a pointer receiver is in the method set of `*Counter` only, so only a `*Counter` satisfies the interface.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Implicit interfaces',
          prompt: 'A Go type must declare that it implements an interface before it can be used as that interface.',
          options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }],
          correct: ['false'],
          explanation: 'Interface satisfaction is implicit: any type with the required methods satisfies the interface, with no `implements` declaration.',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'fmt.Stringer',
          prompt: 'Fill in the method name: a type satisfies `fmt.Stringer` by having a method `____() string`.',
          accepted: [['String']],
          explanation: '`fmt.Stringer` has one method, `String() string`. The fmt print functions call it automatically.',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'Working with interface values',
          prompt: 'Match each construct to its behaviour.',
          pairs: {
            left: [
              { id: 'l1', text: '`v.(string)`' },
              { id: 'l2', text: '`s, ok := v.(string)`' },
              { id: 'l3', text: '`switch x := v.(type)`' },
              { id: 'l4', text: '`any`' },
            ],
            right: [
              { id: 'r1', text: 'Panics if v does not hold a string' },
              { id: 'r2', text: 'Sets ok to false instead of panicking' },
              { id: 'r3', text: 'Branches on the dynamic type of v' },
              { id: 'r4', text: 'An alias for interface{}, which every type satisfies' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'The single-result assertion panics on a mismatch, comma-ok reports it, a type switch picks a case by dynamic type, and `any` is the empty interface.',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'Typed nil',
          prompt: '`mayFail` declares `var p *MyErr` and returns `p` as an `error`. What does `fmt.Println(mayFail() != nil)` print?',
          options: [
            { id: 'a', text: '`true`' },
            { id: 'b', text: '`false`' },
            { id: 'c', text: 'It panics' },
            { id: 'd', text: 'It does not compile' },
          ],
          correct: ['a'],
          explanation: 'The returned interface holds the type `*MyErr` with a nil value. An interface is nil only when both type and value are nil, so the comparison is true.',
        },
      ],
    },
    // ------------------------------------------------------------------ 5
    {
      slug: 'errors-in-go',
      title: 'Errors as values',
      module: 'Reliable programs',
      skill: 'error-handling',
      minutes: 35,
      objectives: [
        'Return and check error values with if err != nil',
        'Create sentinel errors with errors.New and custom error types with an Error method',
        'Wrap errors with fmt.Errorf and %w',
        'Inspect error chains with errors.Is and errors.As',
        'Know when panic and recover are appropriate (rarely)',
      ],
      body: `Go has no exceptions for ordinary failures. A function that can fail returns an \`error\` as its last result, and the caller checks it. \`error\` is just an interface: \`Error() string\`.

\`\`\`go
package main

import (
    "errors"
    "fmt"
    "strconv"
)

var ErrNegative = errors.New("age must not be negative") // sentinel

type RangeError struct{ Value, Max int } // custom error type

func (e *RangeError) Error() string {
    return fmt.Sprintf("%d is above the maximum %d", e.Value, e.Max)
}

func parseAge(s string) (int, error) {
    n, err := strconv.Atoi(s)
    if err != nil {
        return 0, fmt.Errorf("parse age %q: %w", s, err) // wrap with context
    }
    if n < 0 {
        return 0, ErrNegative
    }
    if n > 150 {
        return 0, &RangeError{Value: n, Max: 150}
    }
    return n, nil
}

func main() {
    for _, in := range []string{"21", "abc", "-4", "200"} {
        age, err := parseAge(in)
        var re *RangeError
        switch {
        case err == nil:
            fmt.Println("age", age)
        case errors.Is(err, ErrNegative):
            fmt.Println("negative:", in)
        case errors.As(err, &re):
            fmt.Println("too big by", re.Value-re.Max)
        default:
            fmt.Println("error:", err)
        }
    }
}
// Output:
// age 21
// error: parse age "abc": strconv.Atoi: parsing "abc": invalid syntax
// negative: -4
// too big by 50
\`\`\`

| Tool | Use it to |
|---|---|
| \`errors.New\` | create a fixed sentinel error such as \`io.EOF\` |
| \`fmt.Errorf\` with \`%w\` | add context while keeping the original error in the chain |
| \`errors.Is(err, target)\` | ask whether err, or anything it wraps, is that value |
| \`errors.As(err, &target)\` | find an error of a given type in the chain and extract it |

Because of \`%w\`, \`errors.Is(err, strconv.ErrSyntax)\` is also true for the "abc" case. The standard library works the same way: \`errors.Is(err, fs.ErrNotExist)\` detects a missing file whatever context was added.

### panic and recover

\`panic\` is for bugs and impossible states, not bad input. A deferred function can stop a panic with \`recover\`:

\`\`\`go
package main

import "fmt"

func safeDiv(a, b int) (q int, err error) {
    defer func() {
        if r := recover(); r != nil {
            err = fmt.Errorf("recovered: %v", r)
        }
    }()
    return a / b, nil
}

func main() {
    fmt.Println(safeDiv(7, 2)) // 3 <nil>
    fmt.Println(safeDiv(1, 0)) // 0 recovered: runtime error: integer divide by zero
}
\`\`\`

### Common mistakes
- Wrapping with \`%v\` instead of \`%w\`, which flattens the error so \`errors.Is\` and \`errors.As\` cannot see the original.
- Comparing a possibly wrapped error with \`==\` instead of \`errors.Is\`.
- Passing \`re\` instead of \`&re\` to \`errors.As\`; it needs a pointer and panics otherwise.
- Discarding errors with \`_\`, or logging an error and then carrying on as if nothing failed.`,
      practice: [
        { title: 'Safe division (solve it in Go)', kind: 'problem', ref: 'safe-division' },
        { title: 'Safe division with a sentinel', kind: 'exercise', prompt: 'Write func divide(a, b int) (int, error) returning a sentinel ErrDivByZero. Read pairs of numbers from standard input and print either the result or a clear error for each line, mirroring the "Safe division" CodeLab problem.' },
        { title: 'Custom error type', kind: 'exercise', prompt: 'Define type ValidationError struct { Field, Msg string } with an Error() method. Return it wrapped from a validate function and recover the field name in the caller with errors.As.' },
      ],
      resources: [
        { title: 'Error handling and Go', url: 'https://go.dev/blog/error-handling-and-go', source: 'The Go Blog', kind: 'article' },
        { title: 'Working with Errors in Go 1.13', url: 'https://go.dev/blog/go1.13-errors', source: 'The Go Blog', kind: 'article' },
        { title: 'Go by Example: Errors', url: 'https://gobyexample.com/errors', source: 'Go by Example', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'fill_blank',
          title: 'Wrapping verb',
          prompt: 'Fill in the fmt verb that wraps `err` so `errors.Is` can still find it: `fmt.Errorf("load config: ____", err)`',
          accepted: [['%w', 'w']],
          explanation: '`%w` stores the original error inside the new one. `%v` only copies its text, which breaks `errors.Is` and `errors.As`.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Extract a typed error',
          prompt: 'An error may wrap a `*RangeError` several levels deep. Which call finds it and gives you access to its fields?',
          options: [
            { id: 'a', text: '`errors.Is(err, &re)`' },
            { id: 'b', text: '`errors.As(err, &re)`' },
            { id: 'c', text: '`err == re`' },
            { id: 'd', text: '`errors.Unwrap(err).(RangeError)`' },
          ],
          correct: ['b'],
          explanation: '`errors.As` walks the chain looking for an error assignable to the target type and stores it in `re`. `errors.Is` compares against a specific value.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Is after wrapping',
          prompt: 'If `err` was created with `fmt.Errorf("ctx: %w", ErrNegative)`, then `errors.Is(err, ErrNegative)` returns true.',
          options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }],
          correct: ['true'],
          explanation: '`errors.Is` unwraps the chain created by `%w` and finds the sentinel, even though `err == ErrNegative` is false.',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'Error tools',
          prompt: 'Match each tool to its job.',
          pairs: {
            left: [
              { id: 'l1', text: '`errors.New`' },
              { id: 'l2', text: '`fmt.Errorf` with `%w`' },
              { id: 'l3', text: '`errors.Is`' },
              { id: 'l4', text: '`recover`' },
            ],
            right: [
              { id: 'r1', text: 'Creates a simple error value, often a sentinel' },
              { id: 'r2', text: 'Adds context while keeping the original error' },
              { id: 'r3', text: 'Checks whether a chain contains a specific error value' },
              { id: 'r4', text: 'Stops a panic when called inside a deferred function' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'Sentinels come from `errors.New`, wrapping adds context with `%w`, `errors.Is` searches the chain for a value, and `recover` only has an effect inside a deferred call during a panic.',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'When to panic',
          prompt: 'In which situations is `panic` a reasonable choice? Select all that apply.',
          options: [
            { id: 'a', text: 'An internal invariant is broken, which means there is a bug' },
            { id: 'b', text: 'A user typed a non-numeric age' },
            { id: 'c', text: 'A configuration file is missing' },
            { id: 'd', text: 'A `Must` helper at start-up, such as `regexp.MustCompile` with a constant pattern' },
          ],
          correct: ['a', 'd'],
          explanation: 'Panic signals programmer errors that should never happen. Bad input and missing files are expected failures and should be returned as errors.',
        },
      ],
    },
    // ------------------------------------------------------------------ 6
    {
      slug: 'goroutines-and-channels',
      title: 'Goroutines and channels',
      module: 'Reliable programs',
      skill: 'go',
      minutes: 50,
      milestone: true,
      completionCriteria: 'Complete the "Concurrent fetcher" exercise and show that it runs faster than the sequential version.',
      objectives: [
        'Start concurrent work with goroutines and wait for it with sync.WaitGroup',
        'Communicate with unbuffered and buffered channels, and close and range over them',
        'Wait on several channel operations with select, including a timeout',
        'Protect shared state with sync.Mutex and find data races with the race detector',
        'Recognise and fix deadlocks',
      ],
      body: `A **goroutine** is a lightweight thread managed by the Go runtime: put \`go\` before a function call and it runs concurrently. When \`main\` returns, the program exits, even if goroutines are still running. **Channels** let goroutines pass values safely.

| | Unbuffered \`make(chan int)\` | Buffered \`make(chan int, 3)\` |
|---|---|---|
| Send blocks | until a receiver takes the value | only while the buffer is full |
| Receive blocks | until a sender sends | only while the buffer is empty |

After \`close(ch)\`, buffered values are still delivered, then receives return the zero value immediately (\`v, ok := <-ch\` gives \`ok == false\`), and sending panics. Only the sender should close.

### A worker pool

\`\`\`go
package main

import (
    "fmt"
    "sync"
    "time"
)

func worker(jobs <-chan int, results chan<- int, wg *sync.WaitGroup) {
    defer wg.Done()
    for j := range jobs { // receive until jobs is closed
        time.Sleep(100 * time.Millisecond) // pretend to work
        results <- j * j
    }
}

func main() {
    jobs := make(chan int)
    results := make(chan int, 6) // room for every result
    var wg sync.WaitGroup
    for range 3 {
        wg.Add(1)
        go worker(jobs, results, &wg)
    }
    for j := 1; j <= 6; j++ {
        jobs <- j
    }
    close(jobs)    // workers' loops end
    wg.Wait()      // all workers called Done
    close(results) // nobody sends any more
    sum := 0
    for r := range results {
        sum += r
    }
    fmt.Println("sum of squares:", sum) // sum of squares: 91
}
\`\`\`

Six 100 ms jobs on three workers take about 200 ms instead of 600 ms.

### select and timeouts

\`\`\`go
package main

import (
    "fmt"
    "time"
)

func main() {
    ch := make(chan string)
    go func() {
        time.Sleep(50 * time.Millisecond)
        ch <- "done"
    }()
    select { // waits for whichever case is ready first
    case msg := <-ch:
        fmt.Println(msg) // done
    case <-time.After(time.Second):
        fmt.Println("timed out")
    }
}
\`\`\`

### Shared state

When goroutines share a variable, guard it: \`mu.Lock(); count++; mu.Unlock()\` with a \`sync.Mutex\`. Without it, 1,000 goroutines incrementing \`count\` may lose updates; \`go run -race .\` or \`go test -race\` reports the data race. Since Go 1.22 (in modules that declare go 1.22 or later) each loop iteration has its own variable, so goroutines started in a loop no longer share \`i\`.

If every goroutine is blocked, the runtime stops with \`fatal error: all goroutines are asleep - deadlock!\`. A classic cause is \`ch <- 1\` on an unbuffered channel with no receiver.

### Common mistakes
- Calling \`wg.Add\` inside the goroutine instead of before \`go\`, so \`Wait\` can return early.
- Ranging over a channel nobody closes, which deadlocks.
- Passing a \`sync.WaitGroup\` or \`sync.Mutex\` by value; pass a pointer.
- Sharing variables without a mutex or channel, and never running \`-race\`.`,
      practice: [
        { title: 'Concurrent fetcher', kind: 'exercise', prompt: 'Write a program that fetches five URLs with net/http, first sequentially and then with one goroutine per URL and a WaitGroup, printing each status code and the total time for both versions.' },
        { title: 'Race detector', kind: 'exercise', prompt: 'Start 1,000 goroutines that each increment a shared counter without a mutex. Run with -race, read the report, then fix it with sync.Mutex and again with sync/atomic.' },
        { title: 'Word frequency (in Go, fan out lines to worker goroutines and merge their maps over a channel)', kind: 'problem', ref: 'word-frequency' },
      ],
      resources: [
        { title: 'A Tour of Go: Concurrency', url: 'https://go.dev/tour/concurrency/1', source: 'The Go Authors', kind: 'interactive' },
        { title: 'Effective Go: Concurrency', url: 'https://go.dev/doc/effective_go#concurrency', source: 'The Go Authors', kind: 'docs' },
        { title: 'Go by Example: WaitGroups', url: 'https://gobyexample.com/waitgroups', source: 'Go by Example', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Unbuffered send',
          prompt: 'What happens when `main` runs `ch := make(chan int); ch <- 1; fmt.Println(<-ch)` with no other goroutines?',
          options: [
            { id: 'a', text: 'It prints 1' },
            { id: 'b', text: 'It prints 0' },
            { id: 'c', text: 'It stops with "all goroutines are asleep", a deadlock' },
            { id: 'd', text: 'It does not compile' },
          ],
          correct: ['c'],
          explanation: 'A send on an unbuffered channel blocks until another goroutine receives. No other goroutine exists, so the runtime detects the deadlock. A buffer of 1 would make it print 1.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Receiving after close',
          prompt: 'Receiving from a closed channel blocks forever.',
          options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }],
          correct: ['false'],
          explanation: 'Once a closed channel is drained, receives return the zero value immediately, and the comma-ok form reports `ok == false`. Sending on a closed channel panics.',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Race detector flag',
          prompt: 'Fill in the flag that turns on the data race detector: `go test ____ ./...`',
          accepted: [['-race', 'race']],
          explanation: '`-race` instruments memory accesses and reports conflicting unsynchronised reads and writes while the program runs.',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Using sync.WaitGroup',
          prompt: 'Which statements about `sync.WaitGroup` are correct? Select all that apply.',
          options: [
            { id: 'a', text: 'Call `wg.Add(1)` before starting each goroutine' },
            { id: 'b', text: 'Each goroutine calls `wg.Done()` when it finishes, often with `defer`' },
            { id: 'c', text: '`wg.Wait()` blocks until the counter reaches zero' },
            { id: 'd', text: 'Pass the WaitGroup to each goroutine by value' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Add before `go` so Wait cannot return early, Done decrements the counter, and Wait blocks until it is zero. A copied WaitGroup is a different counter, so pass a pointer.',
        },
        {
          key: 'q5',
          type: 'matching',
          title: 'Concurrency tools',
          prompt: 'Match each tool to its purpose.',
          pairs: {
            left: [
              { id: 'l1', text: '`case <-time.After(d)` in a select' },
              { id: 'l2', text: '`close(ch)`' },
              { id: 'l3', text: 'Buffered channel' },
              { id: 'l4', text: '`sync.Mutex`' },
            ],
            right: [
              { id: 'r1', text: 'Gives up waiting after a timeout' },
              { id: 'r2', text: 'Signals that no more values will be sent' },
              { id: 'r3', text: 'Lets sends proceed until the buffer is full' },
              { id: 'r4', text: 'Lets only one goroutine at a time touch shared data' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: '`time.After` returns a channel that fires after d, `close` ends range loops on the receiver side, buffers decouple senders from receivers, and a mutex provides mutual exclusion.',
        },
      ],
    },
    // ------------------------------------------------------------------ 7
    {
      slug: 'go-modules-and-testing',
      title: 'Modules, packages and testing',
      module: 'Reliable programs',
      skill: 'modules-packages',
      minutes: 35,
      objectives: [
        'Organise code into packages with exported and unexported names, including internal packages',
        'Add dependencies with go get and explain go.mod and go.sum',
        'Write table-driven tests with t.Run subtests and run them with go test flags',
        'Write a basic benchmark and keep code clean with gofmt and go vet',
      ],
      body: `A **module** is a tree of packages with a \`go.mod\` file at its root. Each folder is one package. Names starting with a capital letter are **exported**; lowercase names are private to their package. Packages under an \`internal/\` folder can only be imported by code rooted at the folder that contains \`internal\`.

\`\`\`text
myapp/
  go.mod              module example.com/myapp
  go.sum              checksums of dependencies
  main.go             package main
  stringsx/reverse.go package stringsx
  internal/store/     importable only inside myapp
\`\`\`

\`go get github.com/google/uuid\` adds a \`require\` line to \`go.mod\` and checksums to \`go.sum\`. Commit both so builds are reproducible. \`go mod tidy\` adds missing and removes unused requirements.

### A table-driven test

\`\`\`go
// stringsx/reverse.go
package stringsx

// Reverse returns s with its runes in reverse order.
func Reverse(s string) string {
    r := []rune(s)
    for i, j := 0, len(r)-1; i < j; i, j = i+1, j-1 {
        r[i], r[j] = r[j], r[i]
    }
    return string(r)
}
\`\`\`

\`\`\`go
// stringsx/reverse_test.go
package stringsx

import "testing"

func TestReverse(t *testing.T) {
    tests := []struct{ name, in, want string }{
        {"empty", "", ""},
        {"ascii", "go", "og"},
        {"unicode", "héllo", "olléh"},
    }
    for _, tc := range tests {
        t.Run(tc.name, func(t *testing.T) {
            if got := Reverse(tc.in); got != tc.want {
                t.Errorf("Reverse(%q) = %q, want %q", tc.in, got, tc.want)
            }
        })
    }
}

func BenchmarkReverse(b *testing.B) {
    for i := 0; i < b.N; i++ {
        Reverse("hello, world")
    }
}
\`\`\`

Test files end in \`_test.go\`, and test functions look like \`func TestXxx(t *testing.T)\`. \`t.Errorf\` records a failure and keeps going; \`t.Fatalf\` stops the current test.

| Command | What it does |
|---|---|
| \`go test ./...\` | test every package in the module |
| \`go test -v\` | list each test and subtest |
| \`go test -run TestReverse/unicode\` | run only matching tests |
| \`go test -cover\` | report statement coverage |
| \`go test -bench .\` | run benchmarks too |
| \`go vet ./...\` | report suspicious code such as bad Printf verbs |
| \`gofmt -w .\` | format every file in place |

### Common mistakes
- Naming a function \`testReverse\` or the file \`reverse_tests.go\`, so \`go test\` silently skips it.
- Expecting a lowercase function to be usable from another package.
- Editing \`go.sum\` by hand or leaving it out of version control.
- Creating an import cycle between two packages, which is a compile error.`,
      practice: [
        { title: 'Palindrome check (solve it in Go, then add a table-driven test)', kind: 'problem', ref: 'palindrome-check' },
        { title: 'Reverse words (solve it in Go with a tested helper function)', kind: 'problem', ref: 'reverse-words' },
        { title: 'Tested package', kind: 'exercise', prompt: 'Create a package with IsPalindrome(s string) bool and a table-driven test with t.Run subtests covering empty strings, mixed case, punctuation and non-ASCII letters. Run go test -v and go test -cover.' },
        { title: 'Add a dependency', kind: 'exercise', prompt: 'Follow the official "Create a Go module" tutorial, then inspect go.mod and go.sum and explain what each line is for.' },
      ],
      resources: [
        { title: 'Tutorial: Create a Go module', url: 'https://go.dev/doc/tutorial/create-module', source: 'The Go Authors', kind: 'docs' },
        { title: 'Tutorial: Add a test', url: 'https://go.dev/doc/tutorial/add-a-test', source: 'The Go Authors', kind: 'docs' },
        { title: 'How to Write Go Code', url: 'https://go.dev/doc/code', source: 'The Go Authors', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Exported names',
          prompt: 'Which identifier declared in package `stringsx` can be used from another package?',
          options: [
            { id: 'a', text: '`reverse`' },
            { id: 'b', text: '`Reverse`' },
            { id: 'c', text: '`_Reverse`' },
            { id: 'd', text: '`rev`' },
          ],
          correct: ['b'],
          explanation: 'An identifier is exported only if it starts with an upper-case letter. Everything else is private to its package.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'go.sum',
          prompt: '`go.sum` records checksums of dependency modules and should be committed to version control.',
          options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }],
          correct: ['true'],
          explanation: 'The checksums let the go command verify that every download matches what was used before, which keeps builds reproducible and tamper-evident.',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Test file names',
          prompt: 'Fill in the suffix that every Go test file name must end with, as in `reverse____`',
          accepted: [['_test.go']],
          explanation: '`go test` only compiles test functions from files whose names end in `_test.go`; those files are excluded from normal builds.',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'Go tooling',
          prompt: 'Match each command to what it does.',
          pairs: {
            left: [
              { id: 'l1', text: '`go test -v`' },
              { id: 'l2', text: '`go test -run Name`' },
              { id: 'l3', text: '`go test -cover`' },
              { id: 'l4', text: '`go vet`' },
              { id: 'l5', text: '`gofmt -w`' },
            ],
            right: [
              { id: 'r1', text: 'Prints every test and subtest as it runs' },
              { id: 'r2', text: 'Runs only tests matching a pattern' },
              { id: 'r3', text: 'Reports statement coverage' },
              { id: 'r4', text: 'Reports suspicious code such as mismatched Printf arguments' },
              { id: 'r5', text: 'Rewrites files in the standard format' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4', l5: 'r5' },
          explanation: '`-v` is verbose output, `-run` filters by a regular expression, `-cover` measures coverage, `go vet` finds likely bugs and `gofmt -w` formats files in place.',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'internal packages',
          prompt: 'Who can import the package `example.com/myapp/internal/store`?',
          options: [
            { id: 'a', text: 'Any module that depends on example.com/myapp' },
            { id: 'b', text: 'Only packages inside the example.com/myapp tree' },
            { id: 'c', text: 'Only the main package' },
            { id: 'd', text: 'Nobody, internal packages cannot be imported' },
          ],
          correct: ['b'],
          explanation: 'The go command only allows an `internal` package to be imported by code rooted at the parent of the `internal` directory, here example.com/myapp and its subpackages.',
        },
      ],
    },
  ],
};

export const rustTrack: SeedTrack = {
  slug: 'rust-essentials',
  title: 'Rust Essentials',
  category: 'programming',
  summary: 'Learn Rust\'s ownership model and type system to write fast programs that are memory-safe by construction.',
  description: `**Who it's for:** developers interested in systems programming, high-performance backends, command-line tools, WebAssembly or embedded work.

**Prerequisites:** solid experience in one programming language. Some exposure to C or C++ helps you appreciate what Rust prevents, but is not required.

**You will be able to:**
- create, build, test and run projects with cargo, and read compiler errors
- use Rust's types, expressions and control flow fluently
- explain ownership, borrowing and lifetimes, and satisfy the borrow checker
- model data with structs, enums and pattern matching
- process data with Vec, String, HashMap and iterators
- handle failure with Option, Result, custom error types and the ? operator
- write generic code with traits, and choose between generics and trait objects

Each topic ends with a short quiz, and most link to CodeLab problems you can solve in Rust.

**Milestone:** *Ownership and borrowing* (topic 3).`,
  level: 'intermediate',
  estimatedHours: 24,
  roles: ['systems programmer', 'backend developer', 'embedded engineer', 'software engineer'],
  contentStatus: 'complete',
  topics: [
    {
      slug: 'rust-setup-and-cargo',
      title: 'Setup and cargo',
      module: 'Getting started',
      skill: 'rust',
      minutes: 30,
      objectives: [
        'Install Rust with rustup and keep the toolchain up to date',
        'Create, check, build, run and test a project with cargo',
        'Describe the files in a cargo project and add a dependency from crates.io',
        'Read standard input and print output with the println! macro',
        'Read a compiler error, look up its code with rustc --explain, and use clippy and rustfmt',
      ],
      body: `Rust is installed with **rustup**, the toolchain manager. It installs the compiler (\`rustc\`), the build tool **cargo** and the standard library, and \`rustup update\` upgrades them all.

### Creating and running a project

\`\`\`bash
cargo new hello          # creates hello/Cargo.toml and hello/src/main.rs
cd hello
cargo run                # compile a debug build and run it
cargo check              # type-check only: the fastest feedback
cargo build --release    # optimised binary in target/release/
cargo test               # run the #[test] functions
\`\`\`

| File or folder | Purpose |
|---|---|
| \`Cargo.toml\` | package name, version, edition and \`[dependencies]\` |
| \`Cargo.lock\` | exact dependency versions, for reproducible builds |
| \`src/main.rs\` | entry point of a binary crate |
| \`target/\` | build output (do not commit it) |

A library from crates.io is called a **crate**. Add one with \`cargo add rand\`, or write \`rand = "0.8"\` under \`[dependencies]\`; cargo downloads and compiles it on the next build.

### Reading input

\`\`\`rust
use std::io;

fn main() {
    let mut line = String::new();
    io::stdin().read_line(&mut line).expect("failed to read input");
    let name = line.trim(); // drop the trailing newline
    println!("Hello, {name}!");
}
\`\`\`

For the input \`Asha\` this prints \`Hello, Asha!\`. \`println!\` is a **macro** (note the \`!\`), not a function. Macros expand into code at compile time, which lets \`println!\` check its format string and take any number of arguments. \`{name}\` prints a variable in scope; \`{}\` prints the next argument.

### Reading compiler errors

Remove \`mut\` from \`line\` and the build fails:

\`\`\`text
error[E0596]: cannot borrow \`line\` as mutable, as it is not declared as mutable
\`\`\`

Each error has a code, a file and line, and often a \`help:\` line suggesting the fix. \`rustc --explain E0596\` prints a longer explanation with examples. Fix the **first** error first: later errors are often caused by it.

### Tooling

\`cargo fmt\` (rustfmt) formats code in the standard style, and \`cargo clippy\` runs extra lints that catch bugs and non-idiomatic code. Run both before committing.

### Common mistakes
- Running \`rustc main.rs\` by hand inside a project, so \`Cargo.toml\` settings and dependencies are ignored: use \`cargo run\`.
- Timing a debug build. Use \`cargo run --release\` when performance matters.
- Forgetting \`.trim()\` after \`read_line\`, so the text still ends in a newline and \`parse()\` fails.
- Reading only the last error in a long list instead of the first.
- Writing \`println("hi")\` without the \`!\`.`,
      practice: [
        { title: 'Hello, cargo', kind: 'exercise', prompt: 'Install Rust with rustup, create a project with cargo new, and make it read your name and print a greeting. Then deliberately remove the mut keyword, read the compiler error and run rustc --explain on its code.' },
        { title: 'Guessing game', kind: 'exercise', prompt: 'Work through chapter 2 of The Rust Programming Language (the guessing game), which adds the rand crate as a dependency. Run cargo clippy and cargo fmt on the result.' },
        { title: 'Sum of two numbers (solve it in Rust)', kind: 'problem', ref: 'sum-two-numbers' },
      ],
      resources: [
        { title: 'The Rust Programming Language: Getting Started', url: 'https://doc.rust-lang.org/book/ch01-00-getting-started.html', source: 'The Rust Project', kind: 'book' },
        { title: 'The Rust Programming Language: Hello, Cargo!', url: 'https://doc.rust-lang.org/book/ch01-03-hello-cargo.html', source: 'The Rust Project', kind: 'book' },
        { title: 'The Cargo Book', url: 'https://doc.rust-lang.org/cargo/', source: 'The Rust Project', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Fastest feedback',
          prompt: 'Which cargo command type-checks your code without producing a binary, giving the fastest feedback while you edit?',
          options: [
            { id: 'a', text: '`cargo build --release`' },
            { id: 'b', text: '`cargo check`' },
            { id: 'c', text: '`cargo run`' },
            { id: 'd', text: '`cargo new`' },
          ],
          correct: ['b'],
          explanation: '`cargo check` runs the compiler\'s analysis but skips code generation, so it is much faster than a full build. `cargo run` builds and runs; `--release` adds slow optimisation.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'println! is a macro',
          prompt: '`println!` is an ordinary function; the `!` is just part of its name.',
          options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }],
          correct: ['false'],
          explanation: 'The `!` marks a macro invocation. Macros expand into code at compile time, which is how `println!` checks its format string and accepts a variable number of arguments.',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Explain an error code',
          prompt: 'Complete the command that prints a detailed explanation of an error code: `rustc --____ E0596`',
          accepted: [['explain']],
          explanation: '`rustc --explain <code>` prints a long-form description of the error with examples of code that triggers it and how to fix it.',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'Project files',
          prompt: 'Match each part of a cargo project to its purpose.',
          pairs: {
            left: [
              { id: 'l1', text: '`Cargo.toml`' },
              { id: 'l2', text: '`Cargo.lock`' },
              { id: 'l3', text: '`src/main.rs`' },
              { id: 'l4', text: '`target/`' },
            ],
            right: [
              { id: 'r1', text: 'Package metadata and the list of dependencies' },
              { id: 'r2', text: 'Exact resolved dependency versions' },
              { id: 'r3', text: 'Entry point of a binary crate' },
              { id: 'r4', text: 'Compiled build output' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'You edit `Cargo.toml`; cargo writes `Cargo.lock` to pin versions; `src/main.rs` holds `fn main`; `target/` contains build artifacts and should not be committed.',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Release builds',
          prompt: 'Which statements about `cargo build --release` are true? Select all that apply.',
          options: [
            { id: 'a', text: 'It produces an optimised binary in `target/release/`' },
            { id: 'b', text: 'It usually takes longer to compile than a debug build' },
            { id: 'c', text: 'It runs all the tests' },
            { id: 'd', text: 'It is the right build to use when measuring performance' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'Release builds apply optimisations, which cost compile time but make the program much faster, so they are what you benchmark. Tests are run by `cargo test`, not by building.',
        },
      ],
    },
    {
      slug: 'rust-variables-types-control-flow',
      title: 'Variables, types and control flow',
      module: 'Getting started',
      skill: 'rust',
      minutes: 40,
      objectives: [
        'Declare immutable and mutable variables, constants, and use shadowing',
        'Choose scalar types, and use tuples, arrays and as casts',
        'Explain how integer overflow behaves in debug and release builds',
        'Write if, loop, while and for, using if and loop as expressions and loop labels to exit nested loops',
      ],
      body: `### Variables, shadowing and constants

\`\`\`rust
fn main() {
    let x = 5;                 // immutable: x = 6; would not compile
    let mut count = 0;         // mutable
    count += 1;
    let x = x * 2;             // shadowing: a new x hides the old one
    let spaces = "   ";
    let spaces = spaces.len(); // shadowing may change the type (&str to usize)
    const MAX: u32 = 100_000;  // constant: type required, value fixed at compile time
    println!("{x} {count} {spaces} {MAX}"); // 10 1 3 100000
}
\`\`\`

### Types

| Type | Notes |
|---|---|
| \`i8\` to \`i128\`, \`u8\` to \`u128\` | signed and unsigned integers; \`i32\` is the default |
| \`isize\`, \`usize\` | pointer-sized; \`usize\` is used for lengths and indexes |
| \`f32\`, \`f64\` | floating point; \`f64\` is the default |
| \`bool\`, \`char\` | \`char\` is one Unicode scalar value, 4 bytes, written \`'a'\` |

A **tuple** groups values of different types: \`let p = (3, 2.5);\` then \`p.0\` or \`let (a, b) = p;\`. An **array** has a fixed length and one element type, such as \`[i32; 3]\`. Indexing is bounds-checked: an out-of-range index panics instead of reading stray memory.

Rust never converts numbers implicitly; use \`as\`: \`total as f64 / n as f64\`. \`2.9_f64 as i32\` is \`2\` (truncates) and \`300_i32 as u8\` is \`44\` (wraps). Integer overflow panics in debug builds and wraps in release builds; use \`checked_add\` or \`saturating_add\` when it can happen.

### Control flow is made of expressions

\`\`\`rust
fn main() {
    let n = 7;
    let kind = if n % 2 == 0 { "even" } else { "odd" }; // arms must have one type

    let mut tries = 0;
    let found = loop {
        tries += 1;
        if tries * tries > 50 {
            break tries; // loop returns a value through break
        }
    };

    let mut total = 0;
    for i in 1..=4 { // 1, 2, 3, 4 (1..4 stops at 3)
        total += i;
    }

    let mut left = 3;
    while left > 0 {
        left -= 1;
    }

    'outer: for a in 0..5 {
        for b in 0..5 {
            if a * b == 6 {
                println!("{a} x {b}"); // 2 x 3
                break 'outer;          // leaves both loops
            }
        }
    }
    println!("{kind} {found} {total} {left}"); // odd 8 10 0
}
\`\`\`

A block's last expression without a semicolon is its value, so \`fn double(n: i32) -> i32 { n * 2 }\` returns \`n * 2\`. \`for\` also walks iterators: \`for (i, s) in scores.iter().enumerate()\`.

### Common mistakes
- Writing \`if n { ... }\` with an integer: conditions must be \`bool\`.
- Mixing \`i32\` and \`f64\` in arithmetic without \`as\`.
- Using \`1..n\` when you meant to include \`n\` (\`1..=n\`).
- Ending a value-returning function with \`n * 2;\`: the semicolon makes it return \`()\`.
- Expecting shadowing to change the old variable: it creates a new one.`,
      practice: [
        { title: 'FizzBuzz in Rust', kind: 'exercise', prompt: 'Write FizzBuzz from 1 to 100 using a for loop over 1..=100 and a match on (i % 3, i % 5).' },
        { title: 'Temperature converter', kind: 'exercise', prompt: 'Write fn c_to_f(c: f64) -> f64 and print a conversion table from -10 to 40 in steps of 10. Then try to add an i32 to an f64 and read the error.' },
        { title: 'Even or odd (solve it in Rust)', kind: 'problem', ref: 'even-or-odd' },
        { title: 'Prime checker (solve it in Rust)', kind: 'problem', ref: 'prime-checker' },
      ],
      resources: [
        { title: 'The Rust Programming Language: Variables and Mutability', url: 'https://doc.rust-lang.org/book/ch03-01-variables-and-mutability.html', source: 'The Rust Project', kind: 'book' },
        { title: 'The Rust Programming Language: Control Flow', url: 'https://doc.rust-lang.org/book/ch03-05-control-flow.html', source: 'The Rust Project', kind: 'book' },
        { title: 'Rust by Example: Primitives', url: 'https://doc.rust-lang.org/rust-by-example/primitives.html', source: 'The Rust Project', kind: 'interactive' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Shadowing in a block',
          prompt: `What does this program print?

\`\`\`rust
fn main() {
    let x = 5;
    let x = x + 1;
    {
        let x = x * 2;
        println!("{x}");
    }
    println!("{x}");
}
\`\`\``,
          options: [
            { id: 'a', text: '12 then 12' },
            { id: 'b', text: '12 then 6' },
            { id: 'c', text: '10 then 5' },
            { id: 'd', text: 'It does not compile because x is immutable' },
          ],
          correct: ['b'],
          explanation: 'Each `let x` creates a new variable. The inner `x` (12) exists only inside the block; after it ends, the outer shadowed `x` (6) is visible again. No variable is mutated, so `mut` is not needed.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Overflow behaviour',
          prompt: 'By default, integer overflow at run time panics in a debug build and wraps around in a release build.',
          options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }],
          correct: ['true'],
          explanation: 'Debug builds include overflow checks that panic; release builds disable them by default and use two\'s complement wrapping. Use `checked_*`, `wrapping_*` or `saturating_*` methods to choose the behaviour explicitly.',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Value from a loop',
          prompt: 'Complete the code so the loop produces a value: `let found = loop { tries += 1; if tries > 3 { ____ tries; } };`',
          accepted: [['break']],
          explanation: '`break value` exits a `loop` and makes the whole `loop` expression evaluate to that value.',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Which lines compile?',
          prompt: 'Which of these lines compile? Select all that apply.',
          options: [
            { id: 'a', text: '`let f = 3_i32 as f64 * 1.5;`' },
            { id: 'b', text: '`let f = 3_i32 * 1.5;`' },
            { id: 'c', text: '`let c: char = \'é\';`' },
            { id: 'd', text: '`let n = if true { 1 } else { "one" };`' },
          ],
          correct: ['a', 'c'],
          explanation: 'Rust does not mix integer and float arithmetic implicitly, so (b) fails while (a) casts first. A `char` holds any Unicode scalar value, so (c) is fine. Both arms of an `if` expression must have the same type, so (d) fails.',
        },
        {
          key: 'q5',
          type: 'matching',
          title: 'Type facts',
          prompt: 'Match each description to the correct answer.',
          pairs: {
            left: [
              { id: 'l1', text: 'Default integer type' },
              { id: 'l2', text: 'Type used for lengths and indexes' },
              { id: 'l3', text: 'Default floating point type' },
              { id: 'l4', text: 'Size of a `char`' },
            ],
            right: [
              { id: 'r1', text: '`i32`' },
              { id: 'r2', text: '`usize`' },
              { id: 'r3', text: '`f64`' },
              { id: 'r4', text: '4 bytes' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'Unannotated integer literals default to `i32` and floats to `f64`. Collections report lengths and take indexes as `usize`. A `char` is a 4-byte Unicode scalar value, unlike a 1-byte C char.',
        },
      ],
    },
    {
      slug: 'ownership-and-borrowing',
      title: 'Ownership and borrowing',
      module: 'Core concepts',
      skill: 'rust',
      minutes: 60,
      milestone: true,
      completionCriteria: 'Complete both exercises and explain in writing why the "use after move" example does not compile.',
      objectives: [
        'State the three ownership rules and relate them to stack and heap memory',
        'Explain moves versus Copy and Clone, and when values are dropped',
        'Borrow values with & and &mut and follow the borrowing rules',
        'Use string and array slices, and explain why dangling references are rejected',
        'Recognise and fix common borrow checker errors',
      ],
      body: `Ownership is how Rust frees memory without a garbage collector or manual \`free\`. Values like \`i32\` live on the **stack**. A \`String\` keeps a small header (pointer, length, capacity) on the stack and its text on the **heap**. The rules decide who frees heap data:

1. Each value has an **owner**.
2. There is only one owner at a time.
3. When the owner goes out of scope, the value is **dropped** (freed).

### Move, Copy and Clone

\`\`\`rust
fn take(s: String) -> usize {
    s.len()
} // s is dropped here

fn main() {
    let a = String::from("hello");
    let b = a;               // move: b owns the text, a is invalid
    // println!("{a}");      // error[E0382]: borrow of moved value: \`a\`
    let c = b.clone();       // deep copy: separate heap data
    println!("{}", take(c)); // 5 (c was moved into take)
    let n = 5;
    let m = n;               // i32 is Copy: n stays valid
    println!("{b} {n} {m}"); // hello 5 5
}
\`\`\`

Integers, floats, \`bool\`, \`char\`, and tuples or arrays of them are \`Copy\`: assignment duplicates them. \`String\`, \`Vec\` and \`Box\` move; call \`.clone()\` when you truly need a second copy.

### Borrowing

A **reference** uses a value without owning it.

\`\`\`rust
fn length(s: &str) -> usize { s.len() }    // shared borrow
fn shout(s: &mut String) { s.push('!'); } // mutable borrow

fn main() {
    let mut s = String::from("hi");
    let r1 = &s;
    let r2 = &s;                       // many shared borrows are fine
    println!("{} {}", length(r1), r2); // 2 hi
    shout(&mut s);                     // ok: r1 and r2 are not used again
    println!("{s}");                   // hi!
}
\`\`\`

**Borrowing rules:** at any moment you may have either any number of \`&T\` or exactly one \`&mut T\`, and a reference must not outlive its value. A borrow lasts until its last use (non-lexical lifetimes), which is why \`shout\` compiles above; printing \`r1\` after it would fail with E0502.

### Slices and lifetimes

A slice borrows part of a collection: \`&s[0..2]\` is a \`&str\`, \`&v[1..]\` is a \`&[i32]\`.

\`\`\`rust
fn first_word(s: &str) -> &str {
    s.split_whitespace().next().unwrap_or("")
}
\`\`\`

The result borrows from \`s\`, and the compiler checks that \`s\` outlives it. These checked durations are **lifetimes**, usually inferred. Returning \`&local\` from a function is rejected because the local is dropped at the end of the function; return an owned \`String\` instead.

### Common mistakes
- Using a variable after moving it (E0382): borrow with \`&\` or clone.
- Keeping a \`&\` borrow alive across a call that needs \`&mut\` (E0502).
- Taking \`Vec<i32>\` when the function only reads: take \`&[i32]\`.
- Adding \`.clone()\` everywhere to silence errors instead of deciding who owns the data.`,
      practice: [
        { title: 'Fix the borrow errors', kind: 'exercise', prompt: 'Write a function that takes a String and returns its first word. First write it to take ownership, notice the caller can no longer use the string, then change it to take &str and return &str. Explain each compiler error you met.' },
        { title: 'Move or borrow?', kind: 'exercise', prompt: 'Write fn total(v: &[i32]) -> i32 and fn double_all(v: &mut Vec<i32>). Call both from main on the same vector and print it at the end. Then try holding a shared reference across the mutable call and read the error.' },
        { title: 'Reverse words (solve it in Rust with &str slices)', kind: 'problem', ref: 'reverse-words' },
        { title: 'Running sum (solve it in Rust with a &mut borrow)', kind: 'problem', ref: 'running-sum' },
      ],
      resources: [
        { title: 'The Rust Programming Language: What Is Ownership?', url: 'https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html', source: 'The Rust Project', kind: 'book' },
        { title: 'The Rust Programming Language: References and Borrowing', url: 'https://doc.rust-lang.org/book/ch04-02-references-and-borrowing.html', source: 'The Rust Project', kind: 'book' },
        { title: 'The Rust Programming Language: The Slice Type', url: 'https://doc.rust-lang.org/book/ch04-03-slices.html', source: 'The Rust Project', kind: 'book' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Use after move',
          prompt: 'What happens with `let v = vec![1, 2]; let w = v; println!("{:?}", v);`?',
          options: [
            { id: 'a', text: 'It prints `[1, 2]`' },
            { id: 'b', text: 'It prints `[]` because the data moved to `w`' },
            { id: 'c', text: 'It fails to compile because `v` was moved into `w`' },
            { id: 'd', text: 'It compiles but panics at run time' },
          ],
          correct: ['c'],
          explanation: '`Vec` is not `Copy`, so `let w = v;` moves ownership to `w` and `v` can no longer be used. The compiler reports E0382 (borrow of moved value) before the program ever runs.',
        },
        {
          key: 'q2',
          type: 'multi',
          title: 'Copy types',
          prompt: 'Which of these types are `Copy`, so that assignment leaves the original usable? Select all that apply.',
          options: [
            { id: 'a', text: '`i32`' },
            { id: 'b', text: '`char`' },
            { id: 'c', text: '`(u8, bool)`' },
            { id: 'd', text: '`String`' },
            { id: 'e', text: '`Vec<i32>`' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Simple stack-only values, and tuples made only of them, are `Copy`. `String` and `Vec` own heap memory, so they move instead; duplicating them requires an explicit `.clone()`.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Mixing borrows',
          prompt: 'While a mutable reference `&mut s` is in use, you may also read `s` through a shared reference `&s`.',
          options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }],
          correct: ['false'],
          explanation: 'The rule is either any number of shared references or exactly one mutable reference, never both at once. This is what prevents data races and iterator invalidation at compile time.',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Deep copy',
          prompt: 'To get a second, independent `String` with the same text as `b`, write `let c = b.____();`',
          accepted: [['clone']],
          explanation: '`.clone()` allocates new heap memory and copies the data, so `b` and `c` each own their own text and both remain valid.',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'Why this compiles',
          prompt: 'Why does this compile? `let mut s = String::new(); let r = &s; println!("{r}"); s.push(\'a\');`',
          options: [
            { id: 'a', text: 'Because `String` is `Copy`' },
            { id: 'b', text: 'Because the shared borrow `r` ends at its last use, before `s.push` needs a mutable borrow' },
            { id: 'c', text: 'Because `println!` takes ownership of `r`' },
            { id: 'd', text: 'Because the borrow checker does not check method calls' },
          ],
          correct: ['b'],
          explanation: 'With non-lexical lifetimes a borrow lasts until its last use, not until the end of the scope. `r` is last used in `println!`, so the mutable borrow for `push` does not overlap it.',
        },
      ],
    },
    {
      slug: 'structs-enums-and-match',
      title: 'Structs, enums and pattern matching',
      module: 'Core concepts',
      skill: 'rust',
      minutes: 45,
      objectives: [
        'Define named, tuple and unit structs with impl blocks, methods and associated functions',
        'Choose between &self, &mut self and self receivers',
        'Model alternatives with enums that carry data, and handle absence with Option',
        'Write exhaustive match expressions with bindings and guards, and use if let and let else',
      ],
      body: `### Structs and methods

\`\`\`rust
#[derive(Debug)] // lets {:?} print the struct
struct Rect {
    w: f64,
    h: f64,
}

impl Rect {
    fn new(w: f64, h: f64) -> Self { // associated function: Rect::new(..)
        Self { w, h }                // field init shorthand
    }
    fn area(&self) -> f64 {          // &self: reads
        self.w * self.h
    }
    fn scale(&mut self, k: f64) {    // &mut self: modifies
        self.w *= k;
        self.h *= k;
    }
    fn into_square(self) -> Rect {   // self: consumes the value
        let side = self.w.max(self.h);
        Rect::new(side, side)
    }
}

struct Meters(f64); // tuple struct, fields are .0, .1, ...

fn main() {
    let mut r = Rect::new(2.0, 3.0);
    r.scale(2.0);
    println!("{} {:?}", r.area(), r); // 24 Rect { w: 4.0, h: 6.0 }
    let sq = r.into_square();         // r is moved and unusable now
    println!("{} {}", sq.area(), Meters(1.5).0); // 36 1.5
}
\`\`\`

A **unit struct** such as \`struct Marker;\` has no fields and is useful as a type that implements a trait.

### Enums and exhaustive match

Each enum variant can carry its own data. \`match\` must cover every variant, so forgetting one is a compile error (E0004), not a runtime surprise.

\`\`\`rust
enum Shape {
    Circle { r: f64 },
    Square(f64),
    Point,
}

fn describe(s: &Shape) -> String {
    match s {
        Shape::Circle { r } if *r > 10.0 => String::from("big circle"), // guard
        Shape::Circle { r } => format!("circle r={r}"),                // binding
        Shape::Square(side) => format!("square {side}"),
        Shape::Point => String::from("point"),
    }
}
\`\`\`

Arms are tried top to bottom, so the guarded arm must come first. Other patterns include \`1 | 2\`, ranges like \`3..=9\` and the catch-all \`_\`.

### Option instead of null

Rust has no null. A value that may be missing is \`Option<T>\`: \`Some(value)\` or \`None\`.

\`\`\`rust
fn main() {
    let names = ["Asha", "Ben"];
    match names.iter().position(|&n| n == "Ben") {
        Some(i) => println!("found at {i}"), // found at 1
        None => println!("not found"),
    }
    let maybe: Option<u32> = None;
    if let Some(v) = maybe {   // one pattern, ignore the rest
        println!("{v}");
    } else {
        println!("nothing");   // nothing
    }
}
\`\`\`

\`let Some(v) = maybe else { return; };\` (**let else**) binds \`v\` or leaves the function, keeping the main path unindented.

### Common mistakes
- Writing \`fn area(self)\` when \`&self\` is enough, which moves the struct on every call.
- Adding \`_ =>\` by habit, which hides variants added to the enum later.
- Calling \`.unwrap()\` on an \`Option\` instead of handling \`None\`.
- Printing a struct with \`{:?}\` without \`#[derive(Debug)]\`.
- Putting a general arm before a specific one, making the specific arm unreachable.`,
      practice: [
        { title: 'Traffic light', kind: 'exercise', prompt: 'Define enum Light { Red, Amber, Green } with a method next(&self) -> Light and a method duration_secs(&self) -> u32 using match. Simulate ten changes and print each state.' },
        { title: 'Safe lookup', kind: 'exercise', prompt: 'Write fn find_score(scores: &[(String, u32)], name: &str) -> Option<u32>. Call it for a present and a missing name and handle both results with match, with if let and with let else.' },
        { title: 'Grade calculator (solve it in Rust with match ranges)', kind: 'problem', ref: 'grade-calculator' },
        { title: 'Number to words (solve it in Rust with match)', kind: 'problem', ref: 'number-to-words' },
      ],
      resources: [
        { title: 'The Rust Programming Language: Method Syntax', url: 'https://doc.rust-lang.org/book/ch05-03-method-syntax.html', source: 'The Rust Project', kind: 'book' },
        { title: 'The Rust Programming Language: Defining an Enum', url: 'https://doc.rust-lang.org/book/ch06-01-defining-an-enum.html', source: 'The Rust Project', kind: 'book' },
        { title: 'The Rust Programming Language: The match Control Flow Construct', url: 'https://doc.rust-lang.org/book/ch06-02-match.html', source: 'The Rust Project', kind: 'book' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'matching',
          title: 'Method receivers',
          prompt: 'Match each way of declaring a function in an `impl` block to what it means.',
          pairs: {
            left: [
              { id: 'l1', text: '`fn area(&self)`' },
              { id: 'l2', text: '`fn scale(&mut self, k: f64)`' },
              { id: 'l3', text: '`fn into_square(self)`' },
              { id: 'l4', text: '`fn new(w: f64, h: f64) -> Self`' },
            ],
            right: [
              { id: 'r1', text: 'Reads the value through a shared borrow' },
              { id: 'r2', text: 'Can modify the value through a mutable borrow' },
              { id: 'r3', text: 'Takes ownership and consumes the value' },
              { id: 'r4', text: 'Associated function, called as `Rect::new(..)`' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'The receiver decides how the method accesses the value. A function with no `self` parameter is an associated function and is called on the type, which is the convention for constructors like `new`.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Missing variant',
          prompt: 'A `match` on an enum that leaves out one variant and has no `_` arm still compiles; the compiler only prints a warning.',
          options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }],
          correct: ['false'],
          explanation: '`match` must be exhaustive. A missing variant is a hard error (E0004, non-exhaustive patterns), so the compiler forces you to handle every case.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Guards',
          prompt: 'Using `describe` from the lesson, what does `describe(&Shape::Circle { r: 12.0 })` return?',
          options: [
            { id: 'a', text: '`"big circle"`' },
            { id: 'b', text: '`"circle r=12"`' },
            { id: 'c', text: '`"point"`' },
            { id: 'd', text: 'It does not compile because two arms match `Circle`' },
          ],
          correct: ['a'],
          explanation: 'Arms are checked in order. The first arm matches `Circle` and its guard `*r > 10.0` is true for 12.0, so it returns "big circle". Two arms for the same variant are allowed when the first has a guard.',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'if let',
          prompt: 'Complete the code that runs only when `maybe` holds a value: `if ____ Some(v) = maybe { println!("{v}"); }`',
          accepted: [['let']],
          explanation: '`if let PATTERN = value` runs the block when the pattern matches and binds `v`; it is shorthand for a `match` that ignores the other cases.',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Option facts',
          prompt: 'Which statements about `Option<T>` are true? Select all that apply.',
          options: [
            { id: 'a', text: 'A value is either `Some(T)` or `None`' },
            { id: 'b', text: 'Rust uses it where other languages use null' },
            { id: 'c', text: 'You can add an `Option<i32>` directly to an `i32`' },
            { id: 'd', text: 'Calling `.unwrap()` on `None` panics' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: '`Option<i32>` is a different type from `i32`, so you must extract the value (with `match`, `if let`, `unwrap_or` and so on) before doing arithmetic. That is exactly how Rust prevents null errors.',
        },
      ],
    },
    {
      slug: 'collections-and-strings',
      title: 'Collections and strings',
      module: 'Core concepts',
      skill: 'rust',
      minutes: 45,
      objectives: [
        'Use Vec<T>, choosing between get and indexing and between iter, iter_mut and into_iter',
        'Explain the difference between String and &str, and work with UTF-8 text through chars',
        'Count and group data with HashMap and the entry API',
        'Transform data with iterator adapters and sort with sort, sort_by and sort_by_key',
      ],
      body: `### Vec<T> and iterators

\`\`\`rust
fn main() {
    let mut nums = vec![5, 3, 8, 1];
    nums.push(6);
    println!("{:?} {:?}", nums.get(1), nums.get(9)); // Some(3) None
    // nums[9] would panic: index out of bounds

    for n in nums.iter_mut() { // n is &mut i32
        *n *= 10;
    }
    let total: i32 = nums.iter().sum();
    let big: Vec<i32> = nums.iter().filter(|&&n| n > 40).cloned().collect();
    let tags: Vec<String> = nums.iter().enumerate().map(|(i, n)| format!("{i}:{n}")).collect();
    nums.sort();
    println!("{total} {big:?} {tags:?} {nums:?}");
    // 230 [50, 80, 60] ["0:50", "1:30", "2:80", "3:10", "4:60"] [10, 30, 50, 60, 80]
}
\`\`\`

| Method | Yields | Vec usable after? |
|---|---|---|
| \`iter()\` | \`&T\` | yes |
| \`iter_mut()\` | \`&mut T\` | yes |
| \`into_iter()\` | \`T\` | no, it is consumed |

Adapters like \`map\` and \`filter\` are lazy; \`collect\`, \`sum\` or a \`for\` loop runs them.

### String and &str

\`String\` owns a growable UTF-8 buffer; \`&str\` is a borrowed view (literals are \`&str\`). Take \`&str\` parameters (a \`&String\` converts automatically) and return \`String\` for new text.

\`\`\`rust
fn main() {
    let mut s = String::from("hi");
    s.push_str(", there");
    s.push('!');
    let msg = format!("{s} ({} bytes)", s.len()); // format! only borrows s
    println!("{msg}");                                // hi, there! (10 bytes)
    let word = "héllo";
    println!("{} {}", word.len(), word.chars().count()); // 6 5
    let back: String = word.chars().rev().collect();
    println!("{:?} {back}", word.chars().next());       // Some('h') olléh
}
\`\`\`

\`len\` counts bytes, and \`é\` takes two. \`word[0]\` does not compile; use \`chars()\`.

### HashMap and the entry API

\`\`\`rust
use std::collections::HashMap;

fn main() {
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for w in "the cat and the hat".split_whitespace() {
        *counts.entry(w).or_insert(0) += 1;
    }
    println!("{:?}", counts.get("the")); // Some(2)
    let mut pairs: Vec<(&str, usize)> = counts.into_iter().collect();
    pairs.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)));
    println!("{pairs:?}"); // [("the", 2), ("and", 1), ("cat", 1), ("hat", 1)]
}
\`\`\`

Map iteration order is unspecified, so sort before printing. \`sort_by_key(|p| p.1)\` sorts by one key.

### Common mistakes
- Using \`v[i]\` when \`i\` may be out of range: use \`v.get(i)\`.
- Indexing a string by position instead of using \`chars()\`.
- Expecting a \`HashMap\` to keep insertion order.
- Writing \`filter(|n| n > 40)\` on \`iter()\`: the closure gets \`&&i32\`, so use \`|&&n|\` or \`**n\`.
- Calling \`collect()\` without a target type such as \`Vec<_>\`.`,
      practice: [
        { title: 'Word frequency in Rust', kind: 'exercise', prompt: 'Read all of standard input with std::io::read_to_string, count words made of letters only (lowercased), and print "word count" lines sorted by count descending then alphabetically.' },
        { title: 'Palindrome', kind: 'exercise', prompt: 'Write fn is_palindrome(s: &str) -> bool that ignores case and non-alphanumeric characters, using chars(), filter and to_ascii_lowercase. Test it on "A man, a plan, a canal: Panama".' },
        { title: 'Anagram check (solve it in Rust)', kind: 'problem', ref: 'anagram-check' },
        { title: 'Two sum (solve it in Rust with a HashMap)', kind: 'problem', ref: 'two-sum' },
      ],
      resources: [
        { title: 'The Rust Programming Language: Storing Lists of Values with Vectors', url: 'https://doc.rust-lang.org/book/ch08-01-vectors.html', source: 'The Rust Project', kind: 'book' },
        { title: 'The Rust Programming Language: Storing UTF-8 Encoded Text with Strings', url: 'https://doc.rust-lang.org/book/ch08-02-strings.html', source: 'The Rust Project', kind: 'book' },
        { title: 'The Rust Programming Language: Storing Keys with Associated Values in Hash Maps', url: 'https://doc.rust-lang.org/book/ch08-03-hash-maps.html', source: 'The Rust Project', kind: 'book' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'get versus indexing',
          prompt: 'Given `let v = vec![1, 2, 3];`, what does `v.get(5)` evaluate to?',
          options: [
            { id: 'a', text: 'It panics with index out of bounds' },
            { id: 'b', text: '`None`' },
            { id: 'c', text: '`0`' },
            { id: 'd', text: 'It does not compile' },
          ],
          correct: ['b'],
          explanation: '`get` returns `Option<&T>`, giving `None` for a missing index. Indexing with `v[5]` is the form that panics.',
        },
        {
          key: 'q2',
          type: 'matching',
          title: 'Iterator item types',
          prompt: 'Match each call to the type of item it yields.',
          pairs: {
            left: [
              { id: 'l1', text: '`v.iter()` on a `Vec<i32>`' },
              { id: 'l2', text: '`v.iter_mut()` on a `Vec<i32>`' },
              { id: 'l3', text: '`v.into_iter()` on a `Vec<i32>`' },
              { id: 'l4', text: '`s.chars()` on a `&str`' },
            ],
            right: [
              { id: 'r1', text: '`&i32`' },
              { id: 'r2', text: '`&mut i32`' },
              { id: 'r3', text: '`i32` (the Vec is consumed)' },
              { id: 'r4', text: '`char`' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: '`iter` borrows, `iter_mut` borrows mutably and `into_iter` on an owned Vec takes ownership of each element. `chars` decodes UTF-8 into `char` values.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'HashMap order',
          prompt: 'Iterating over a `HashMap` visits the entries in the order they were inserted.',
          options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }],
          correct: ['false'],
          explanation: 'The order is unspecified and can differ between runs, because the default hasher is randomly seeded. Collect into a Vec and sort it (or use a `BTreeMap`) when order matters.',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Entry API',
          prompt: 'Complete the counting line: `*counts.entry(w).____(0) += 1;`',
          accepted: [['or_insert']],
          explanation: '`entry(key).or_insert(default)` returns a `&mut` to the existing value, or inserts the default first. Dereferencing with `*` lets you increment it in place.',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Strings that compile',
          prompt: 'Assume `let owned = String::from("hi");` and `fn greet(name: &str) {}`. Which lines compile? Select all that apply.',
          options: [
            { id: 'a', text: '`greet(&owned);`' },
            { id: 'b', text: '`let c = owned[0];`' },
            { id: 'c', text: '`let n = "héllo".chars().count();`' },
            { id: 'd', text: '`let s: String = "hi";`' },
          ],
          correct: ['a', 'c'],
          explanation: 'A `&String` converts to `&str` automatically, and `chars().count()` counts characters. Strings cannot be indexed by an integer, and a `&str` literal must be converted (for example with `String::from` or `.to_string()`) to become a `String`.',
        },
      ],
    },
    {
      slug: 'error-handling-with-result',
      title: 'Error handling with Result',
      module: 'Robust code',
      skill: 'error-handling',
      minutes: 40,
      objectives: [
        'Choose between panic!, Option and Result for a given failure',
        'Return Result<T, E> and handle it with match, unwrap and expect',
        'Propagate errors with ? and convert them with map_err and ok_or',
        'Define a custom error enum with Display and From, and return Box<dyn Error> from main',
      ],
      body: `Rust separates two kinds of failure. \`panic!\` is for bugs and broken invariants: it stops the current thread. \`Result<T, E>\` (\`Ok(T)\` or \`Err(E)\`) is for failures a caller should expect, like bad input or a missing file. \`Option<T>\` is for absence that needs no reason.

### Match and the ? operator

\`\`\`rust
use std::num::ParseIntError;

fn parse_age(s: &str) -> Result<u32, ParseIntError> {
    let n: u32 = s.trim().parse()?; // on Err, return it from parse_age
    Ok(n)
}

fn main() {
    for input in ["21", "abc"] {
        match parse_age(input) {
            Ok(age) => println!("age {age}"),
            Err(e) => println!("bad {input:?}: {e}"),
        }
    }
}
// age 21
// bad "abc": invalid digit found in string
\`\`\`

On \`Ok(v)\`, \`expr?\` evaluates to \`v\`. On \`Err(e)\` it returns \`Err(From::from(e))\` from the current function, which must return \`Result\` (or \`Option\` for \`Option\` values). \`unwrap()\` and \`expect("why")\` panic on \`Err\`/\`None\`: fine in tests and prototypes, risky on real input.

### Converting errors

\`\`\`rust
fn first_even(v: &[i32]) -> Result<i32, String> {
    v.iter().copied().find(|n| n % 2 == 0).ok_or("no even number".to_string())
}

fn port(s: &str) -> Result<u16, String> {
    s.parse::<u16>().map_err(|e| format!("bad port {s}: {e}"))
}
\`\`\`

\`ok_or\` turns \`None\` into an \`Err\`; \`map_err\` changes the error type and leaves \`Ok\` alone.

### Custom error types

\`\`\`rust
use std::fmt;
use std::num::ParseIntError;

#[derive(Debug)]
enum AppError {
    Empty,
    Parse(ParseIntError),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Empty => write!(f, "input was empty"),
            AppError::Parse(e) => write!(f, "not a number: {e}"),
        }
    }
}

impl std::error::Error for AppError {}

impl From<ParseIntError> for AppError {
    fn from(e: ParseIntError) -> Self {
        AppError::Parse(e)
    }
}

fn total(line: &str) -> Result<i64, AppError> {
    if line.trim().is_empty() {
        return Err(AppError::Empty);
    }
    let mut sum = 0;
    for part in line.split_whitespace() {
        sum += part.parse::<i64>()?; // From turns ParseIntError into AppError
    }
    Ok(sum)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("{}", total("4 5 6")?); // 15
    total("4 x")?; // main returns Err: prints the Debug form, exit code 1
    Ok(())
}
\`\`\`

### Common mistakes
- Calling \`unwrap()\` on user input, so one bad line crashes the program.
- Using \`?\` in a function that returns \`()\`.
- Mixing error types under \`?\` without a \`From\` impl or \`map_err\`.
- Using \`panic!\` for expected conditions like a missing file.`,
      practice: [
        { title: 'Safe division', kind: 'exercise', prompt: 'Write fn divide(a: i64, b: i64) -> Result<i64, String> that returns Err for division by zero. Read lines of "a b" from standard input, parse them with ?, and print the result or the error for each line.' },
        { title: 'Custom error enum', kind: 'exercise', prompt: 'Define enum AppError { Io(std::io::Error), Parse(std::num::ParseIntError) } with Display and From implementations so ? converts both automatically. Use it in a function that reads a file of numbers and sums them, and return Box<dyn Error> from main.' },
        { title: 'Safe division (solve it in Rust with Result)', kind: 'problem', ref: 'safe-division' },
      ],
      resources: [
        { title: 'The Rust Programming Language: Recoverable Errors with Result', url: 'https://doc.rust-lang.org/book/ch09-02-recoverable-errors-with-result.html', source: 'The Rust Project', kind: 'book' },
        { title: 'The Rust Programming Language: To panic! or Not to panic!', url: 'https://doc.rust-lang.org/book/ch09-03-to-panic-or-not-to-panic.html', source: 'The Rust Project', kind: 'book' },
        { title: 'Rust by Example: Introducing ?', url: 'https://doc.rust-lang.org/rust-by-example/error/option_unwrap/question_mark.html', source: 'The Rust Project', kind: 'interactive' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'What ? does',
          prompt: 'Inside a function returning `Result<T, AppError>`, what does `expr?` do when `expr` is `Err(e)`?',
          options: [
            { id: 'a', text: 'Panics with the error message' },
            { id: 'b', text: 'Returns early with `Err(AppError::from(e))`' },
            { id: 'c', text: 'Replaces the error with a default value and continues' },
            { id: 'd', text: 'Ignores the error and evaluates to `()`' },
          ],
          correct: ['b'],
          explanation: '`?` either unwraps the `Ok` value or returns the error from the enclosing function, converting it with `From::from` so it fits the declared error type.',
        },
        {
          key: 'q2',
          type: 'multi',
          title: 'When to panic',
          prompt: 'Which situations are reasonable places to panic (with `panic!`, `unwrap` or `expect`)? Select all that apply.',
          options: [
            { id: 'a', text: 'A unit test checking that a value is present' },
            { id: 'b', text: 'An internal invariant that can only fail because of a bug' },
            { id: 'c', text: 'Parsing a number typed by the user' },
            { id: 'd', text: 'Opening a config file that might not exist' },
          ],
          correct: ['a', 'b'],
          explanation: 'Panics are for bugs and tests. Bad user input and missing files are expected failures, so they should be returned as `Result` and handled or reported.',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Option to Result',
          prompt: 'Complete the code that turns a missing value into an error: `v.iter().copied().find(|n| n % 2 == 0).____("none".to_string())`',
          accepted: [['ok_or']],
          explanation: '`ok_or(err)` converts `Some(v)` into `Ok(v)` and `None` into `Err(err)`, after which you can use `?` in a function that returns `Result`.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Box<dyn Error>',
          prompt: 'For `?` to convert a custom error into `Box<dyn std::error::Error>` in `main`, the custom type must implement `std::error::Error`, which requires `Debug` and `Display`.',
          options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }],
          correct: ['true'],
          explanation: 'The standard library provides `From<E> for Box<dyn Error>` for any `E: Error`. The `Error` trait requires `Debug + Display`, which is why the lesson derives `Debug`, implements `Display` and adds an empty `impl std::error::Error`.',
        },
        {
          key: 'q5',
          type: 'matching',
          title: 'Result and Option helpers',
          prompt: 'Match each method to what it does.',
          pairs: {
            left: [
              { id: 'l1', text: '`unwrap()`' },
              { id: 'l2', text: '`expect("msg")`' },
              { id: 'l3', text: '`map_err(f)`' },
              { id: 'l4', text: '`ok_or(e)`' },
            ],
            right: [
              { id: 'r1', text: 'Returns the value or panics with a generic message' },
              { id: 'r2', text: 'Returns the value or panics with your message' },
              { id: 'r3', text: 'Transforms the error and leaves `Ok` unchanged' },
              { id: 'r4', text: 'Turns an `Option` into a `Result`, using `e` for `None`' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: '`unwrap` and `expect` both panic on failure; `expect` documents why you thought it could not fail. `map_err` and `ok_or` reshape errors so `?` can propagate them.',
        },
      ],
    },
    {
      slug: 'traits-and-generics',
      title: 'Traits and generics',
      module: 'Robust code',
      skill: 'rust',
      minutes: 45,
      objectives: [
        'Define traits with required and default methods and implement them for your types',
        'Write generic functions with trait bounds, impl Trait and where clauses',
        'Derive and implement standard traits such as Debug, Display, Clone, PartialEq and PartialOrd',
        'Choose between generics (static dispatch) and dyn Trait objects (dynamic dispatch), and state the orphan rule',
      ],
      body: `A **trait** names behaviour that types can implement, like an interface. **Generics** with **trait bounds** let one function work for every type with that behaviour.

### Traits and generic functions

\`\`\`rust
use std::fmt;

trait Describe {
    fn describe(&self) -> String;      // required
    fn shout(&self) -> String {        // default: implementors may override
        self.describe().to_uppercase()
    }
}

#[derive(Debug, Clone, PartialEq)]
struct Book {
    title: String,
    pages: u32,
}

impl Describe for Book {
    fn describe(&self) -> String {
        format!("{} ({} pages)", self.title, self.pages)
    }
}

impl fmt::Display for Book {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "'{}'", self.title)
    }
}

struct Dvd;
impl Describe for Dvd {
    fn describe(&self) -> String { String::from("a dvd") }
}

fn largest<T: PartialOrd + Copy>(items: &[T]) -> T {
    let mut best = items[0];           // panics on an empty slice
    for &item in items {
        if item > best {
            best = item;
        }
    }
    best
}

fn announce(item: &impl Describe) {    // shorthand for a generic bound
    println!("{}", item.describe());
}

fn report<T>(item: &T) -> String
where
    T: Describe + fmt::Display,        // where clause for longer bounds
{
    format!("{item}: {}", item.shout())
}

fn main() {
    let b = Book { title: String::from("Rust 101"), pages: 250 };
    announce(&b);                          // Rust 101 (250 pages)
    println!("{}", report(&b));            // 'Rust 101': RUST 101 (250 PAGES)
    println!("{} {}", largest(&[3, 9, 2]), largest(&[1.5, 0.5])); // 9 1.5
    println!("{} {b:?}", b.clone() == b);  // true Book { title: "Rust 101", pages: 250 }

    let shelf: Vec<Box<dyn Describe>> = vec![Box::new(b), Box::new(Dvd)];
    for item in &shelf {
        println!("{}", item.shout());      // RUST 101 (250 PAGES), then A DVD
    }
}
\`\`\`

\`#[derive]\` writes impls for you: \`Debug\` for \`{:?}\`, \`Clone\` for \`.clone()\`, \`PartialEq\` for \`==\`, and \`PartialOrd\` for \`<\` (fields compared in order). \`Display\` is never derived: you write it to control \`{}\`.

### Generics versus trait objects

| | Generics, \`impl Trait\` | \`dyn Trait\` |
|---|---|---|
| Dispatch | static, chosen at compile time | dynamic, through a vtable |
| Machine code | one copy per type (monomorphisation) | one shared copy |
| Mixed types in one Vec | no | yes, \`Vec<Box<dyn Trait>>\` |

**Orphan rule:** you may implement a trait for a type only if the trait or the type is defined in your crate.

### Common mistakes
- Calling a trait method without the trait in scope: add a \`use\`.
- Using \`>\` on a generic \`T\` without a \`PartialOrd\` bound.
- Expecting a generic \`T\` to hold different types in one Vec: use \`Box<dyn Trait>\`.
- Implementing \`Display\` for \`Vec<i32>\`: wrap it in your own struct.`,
      practice: [
        { title: 'Shapes with traits', kind: 'exercise', prompt: 'Define trait Shape { fn area(&self) -> f64; } for Circle and Rect structs. Store a Vec<Box<dyn Shape>> and print the total area. Then write a generic fn print_area<T: Shape>(s: &T) and explain which version uses static dispatch.' },
        { title: 'Implement Display', kind: 'exercise', prompt: 'Implement std::fmt::Display for a Money struct holding cents so that println!("{}", m) prints values like 12.05. Derive Debug, Clone, PartialEq and PartialOrd, add a test with #[test] and run cargo test.' },
        { title: 'Merge intervals (solve it in Rust with a struct and sort_by_key)', kind: 'problem', ref: 'merge-intervals' },
        { title: 'Kth largest (solve it in Rust with a generic helper)', kind: 'problem', ref: 'kth-largest' },
      ],
      resources: [
        { title: 'The Rust Programming Language: Generic Data Types', url: 'https://doc.rust-lang.org/book/ch10-01-syntax.html', source: 'The Rust Project', kind: 'book' },
        { title: 'The Rust Programming Language: Defining Shared Behavior with Traits', url: 'https://doc.rust-lang.org/book/ch10-02-traits.html', source: 'The Rust Project', kind: 'book' },
        { title: 'Rust by Example: Traits', url: 'https://doc.rust-lang.org/rust-by-example/trait.html', source: 'The Rust Project', kind: 'interactive' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Dynamic dispatch',
          prompt: 'Which parameter type calls `describe` through a vtable at run time (dynamic dispatch)?',
          options: [
            { id: 'a', text: '`item: &impl Describe`' },
            { id: 'b', text: '`item: &T` where `T: Describe`' },
            { id: 'c', text: '`item: &dyn Describe`' },
            { id: 'd', text: '`item: Book`' },
          ],
          correct: ['c'],
          explanation: '`dyn Describe` is a trait object: the concrete type is unknown at compile time, so calls go through a vtable. `impl Trait` in argument position and explicit generics are monomorphised and use static dispatch.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Default methods',
          prompt: 'A type that implements a trait can override the trait\'s default method with its own version.',
          options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }],
          correct: ['true'],
          explanation: 'Default methods are used only when the implementation does not provide its own. `Book` gets `shout` for free, but it could define `fn shout(&self) -> String` in its `impl Describe` block to replace it.',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Missing bound',
          prompt: '`largest` copies elements out of the slice with `let mut best = items[0];`. Complete its signature: `fn largest<T: PartialOrd + ____>(items: &[T]) -> T`',
          accepted: [['Copy']],
          explanation: 'Moving a value out of a slice by indexing is not allowed, so `T` must be `Copy`. `PartialOrd` is what makes `item > best` compile.',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Orphan rule',
          prompt: 'Your crate defines `struct Book` and `trait Describe`. Which impls are allowed in your crate? Select all that apply.',
          options: [
            { id: 'a', text: '`impl std::fmt::Display for Book`' },
            { id: 'b', text: '`impl Describe for i32`' },
            { id: 'c', text: '`impl std::fmt::Display for Vec<i32>`' },
            { id: 'd', text: '`impl Describe for Vec<Book>`' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'An impl is allowed when the trait or the type is local. (a) has a local type, (b) and (d) have a local trait. (c) uses a foreign trait on a foreign type, which the orphan rule forbids.',
        },
        {
          key: 'q5',
          type: 'matching',
          title: 'Trait vocabulary',
          prompt: 'Match each term to its meaning.',
          pairs: {
            left: [
              { id: 'l1', text: 'Monomorphisation' },
              { id: 'l2', text: '`where` clause' },
              { id: 'l3', text: '`#[derive(...)]`' },
              { id: 'l4', text: 'Orphan rule' },
            ],
            right: [
              { id: 'r1', text: 'The compiler generates a copy of generic code for each concrete type used' },
              { id: 'r2', text: 'Lists trait bounds after the function signature' },
              { id: 'r3', text: 'Generates standard trait implementations automatically' },
              { id: 'r4', text: 'The trait or the type must be defined in your crate' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'Monomorphisation is why generics have no runtime cost. `where` clauses keep long bounds readable. `derive` covers traits like Debug, Clone and PartialEq. The orphan rule keeps trait implementations coherent across crates.',
        },
      ],
    },
  ],
};
