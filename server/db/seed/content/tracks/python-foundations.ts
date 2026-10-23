import type { SeedTrack } from '../types';

export const pythonFoundations: SeedTrack = {
  slug: 'programming-foundations-python',
  title: 'Programming Foundations with Python',
  category: 'programming',
  summary: 'Learn to think like a programmer and write clear, working Python from your first line of code.',
  description: `**Who it's for:** complete beginners, school graduates and career switchers.

**Prerequisites:** none. You need a browser; CodeLab runs your code for you.

**You will be able to:**
- read and write Python programs that take input, make decisions and loop
- break a problem into functions and test them
- use lists, dictionaries and sets to organise data
- debug errors by reading tracebacks instead of guessing
- read and write text files and JSON data

**Milestones:** *Your first program* (topic 2), *Thinking in functions* (topic 5) and *Files and JSON* (topic 9).`,
  level: 'beginner',
  estimatedHours: 18,
  roles: ['software engineer', 'backend developer', 'data analyst', 'data scientist', 'machine learning engineer', 'full-stack developer'],
  contentStatus: 'complete',
  topics: [
    {
      slug: 'how-programs-run',
      title: 'How programs run',
      module: 'Getting started',
      skill: 'programming-basics',
      minutes: 20,
      objectives: [
        'Explain what a program, an interpreter and a statement are',
        'Run a Python program and read its output',
        'Use print() and input() for basic input and output',
      ],
      body: `A **program** is a list of instructions the computer follows one after another, top to bottom. Python is an **interpreted** language: the Python interpreter reads your file line by line and carries out each **statement**.

### Your first program

\`\`\`python
print("Hello, LearnSphere!")
\`\`\`

\`print\` is a **function**: a named piece of behaviour. The text in quotes is a **string**, and it is passed to \`print\` inside the parentheses.

### Reading input

Programs become useful when they react to input. \`input()\` waits for a line of text and returns it as a string:

\`\`\`python
name = input()
print("Hello,", name)
\`\`\`

If the input is \`Asha\`, the output is \`Hello, Asha\`. Notice that \`print\` puts a space between its arguments.

### Input is always text

\`input()\` always returns a string, even if the user types digits. To do arithmetic you must convert it:

\`\`\`python
a = int(input())
b = int(input())
print(a + b)
\`\`\`

With inputs \`2\` and \`3\` this prints \`5\`. Without \`int(...)\`, \`"2" + "3"\` would join the strings and print \`23\`.

### How CodeLab checks your work

CodeLab problems use **standard input and output**: your program reads the test input with \`input()\` and prints the answer. A test passes when your printed output exactly matches the expected output (trailing spaces are ignored). Some tests are hidden so you can't hard-code answers.

### Common mistakes
- Forgetting the quotes around text: \`print(Hello)\` looks for a variable called \`Hello\`.
- Printing extra text such as \`"The answer is"\` when the problem asks for just the number.
- Forgetting to convert input with \`int()\` before doing maths.`,
      practice: [
        { title: 'Sum of two numbers', kind: 'problem', ref: 'sum-two-numbers' },
        { title: 'Try it: change the greeting to include your city', kind: 'exercise', prompt: 'Read two lines (name and city) and print "Hello, <name> from <city>!"' },
      ],
      resources: [
        { title: 'The Python Tutorial: An Informal Introduction', url: 'https://docs.python.org/3/tutorial/introduction.html', source: 'Python Software Foundation', kind: 'docs' },
        { title: 'CS50P: Functions, Variables (lecture 0)', url: 'https://cs50.harvard.edu/python/2022/weeks/0/', source: 'Harvard CS50', kind: 'video' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'input() return type',
          prompt: 'What type of value does `input()` return?',
          options: [
            { id: 'a', text: 'Always a string' },
            { id: 'b', text: 'A number if the user types digits' },
            { id: 'c', text: 'Whatever type the user chooses' },
          ],
          correct: ['a'],
          explanation: '`input()` always returns a string. Convert it with `int()` or `float()` when you need a number.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'String concatenation',
          prompt: 'Without any conversion, what does `print(input() + input())` print for the inputs `4` and `5`?',
          options: [
            { id: 'a', text: '9' },
            { id: 'b', text: '45' },
            { id: 'c', text: 'An error' },
          ],
          correct: ['b'],
          explanation: 'Both values are strings, and `+` joins strings, so the result is `"45"`.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Execution order',
          prompt: 'A Python program runs its statements from top to bottom unless something (like a loop or function call) changes the order.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Statements run in order. Control-flow statements and function calls are what change that order.',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Convert input',
          prompt: 'Complete the code so it prints the input number doubled: `n = ____(input())` then `print(n * 2)`.',
          accepted: [['int', 'float']],
          explanation: '`int(input())` converts the text to an integer so `n * 2` is arithmetic, not string repetition.',
        },
      ],
    },
    {
      slug: 'variables-and-types',
      title: 'Variables, types and expressions',
      module: 'Getting started',
      skill: 'programming-basics',
      minutes: 30,
      milestone: true,
      completionCriteria: 'Pass the quiz (70%+) and solve "Sum of two numbers".',
      objectives: [
        'Create variables and update them',
        'Tell apart int, float, str and bool values',
        'Write arithmetic and comparison expressions and predict their results',
      ],
      body: `A **variable** is a name that refers to a value. You create one with \`=\` (assignment):

\`\`\`python
score = 10
score = score + 5   # now 15
\`\`\`

Read \`=\` as "now refers to", not "equals". The right side is evaluated first, then the name is pointed at the result.

### The four basic types

| Type | Examples | Notes |
|---|---|---|
| \`int\` | \`0\`, \`42\`, \`-7\` | whole numbers of any size |
| \`float\` | \`3.14\`, \`2.0\` | decimals; may have tiny rounding errors |
| \`str\` | \`"hi"\`, \`'42'\` | text, in single or double quotes |
| \`bool\` | \`True\`, \`False\` | results of comparisons |

Use \`type(x)\` to check a value's type.

### Arithmetic

\`\`\`python
7 + 2    # 9
7 - 2    # 5
7 * 2    # 14
7 / 2    # 3.5   true division always gives a float
7 // 2   # 3     floor division
7 % 2    # 1     remainder (modulo)
2 ** 10  # 1024  power
\`\`\`

\`%\` is handy: \`n % 2 == 0\` tests whether \`n\` is even.

### Comparisons produce booleans

\`\`\`python
5 > 3        # True
5 == 5.0     # True  (== compares values)
"a" < "b"    # True  (alphabetical order)
\`\`\`

### Worked example: minutes to hours

> Read a number of minutes and print it as hours and minutes.

\`\`\`python
total = int(input())        # e.g. 135
hours = total // 60         # 2
minutes = total % 60        # 15
print(hours, minutes)       # 2 15
\`\`\`

Floor division and modulo together split a quantity into units. You'll use this pattern often.

### Common mistakes
- Using \`=\` (assignment) when you mean \`==\` (comparison).
- Expecting \`7 / 2\` to be \`3\`: use \`//\` for integer division.
- Mixing types: \`"Age: " + 20\` fails; use \`"Age: " + str(20)\` or \`print("Age:", 20)\`.`,
      practice: [
        { title: 'Sum of two numbers', kind: 'problem', ref: 'sum-two-numbers' },
        { title: 'Even or odd', kind: 'problem', ref: 'even-or-odd' },
      ],
      resources: [
        { title: 'Built-in Types (numeric types)', url: 'https://docs.python.org/3/library/stdtypes.html#numeric-types-int-float-complex', source: 'Python Software Foundation', kind: 'docs' },
        { title: 'Python for Everybody: Variables, expressions and statements', url: 'https://www.py4e.com/lessons/memory', source: 'py4e.com (Dr. Chuck)', kind: 'course' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Floor division',
          prompt: 'What is the value of `17 // 5`?',
          options: [
            { id: 'a', text: '3.4' },
            { id: 'b', text: '3' },
            { id: 'c', text: '2' },
          ],
          correct: ['b'],
          explanation: '`//` divides and rounds down to a whole number: 17 / 5 = 3.4, so the result is 3.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Modulo',
          prompt: 'What does `17 % 5` evaluate to?',
          options: [
            { id: 'a', text: '2' },
            { id: 'b', text: '3' },
            { id: 'c', text: '3.4' },
          ],
          correct: ['a'],
          explanation: '17 = 3 × 5 + 2, so the remainder is 2.',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'Boolean results',
          prompt: 'Which expressions evaluate to `True`? Select all that apply.',
          options: [
            { id: 'a', text: '`10 == 10.0`' },
            { id: 'b', text: '`3 > 7`' },
            { id: 'c', text: '`8 % 2 == 0`' },
            { id: 'd', text: '`"apple" < "banana"`' },
          ],
          correct: ['a', 'c', 'd'],
          explanation: 'Numbers compare by value, 8 is even, and strings compare alphabetically. `3 > 7` is False.',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'Assignment order',
          prompt: 'After `x = 4` then `x = x * 2 + 1`, what is `x`?',
          options: [
            { id: 'a', text: '4' },
            { id: 'b', text: '9' },
            { id: 'c', text: '12' },
          ],
          correct: ['b'],
          explanation: 'The right side is evaluated first with the old value: 4 × 2 + 1 = 9.',
        },
      ],
    },
    {
      slug: 'conditionals-and-boolean-logic',
      title: 'Conditionals and boolean logic',
      module: 'Control flow',
      skill: 'control-flow',
      minutes: 35,
      objectives: [
        'Write if, elif and else blocks with correct indentation',
        'Combine conditions with and, or and not',
        'Predict which branch of an if / elif chain runs',
        'Explain truthy and falsy values and use them carefully',
      ],
      body: `Programs become interesting when they can choose what to do. An **if statement** runs a block of code only when a condition is \`True\`.

\`\`\`python
temperature = int(input())
if temperature > 30:
    print("It's hot")
print("Done")
\`\`\`

The indented line belongs to the \`if\`. The last line is not indented, so it always runs. Python uses **indentation** (four spaces by convention) instead of braces to mark blocks, and the line before a block always ends with a colon.

### if, elif and else

\`\`\`python
if temperature > 30:
    print("hot")
elif temperature > 15:
    print("mild")
else:
    print("cold")
\`\`\`

Python checks the conditions from top to bottom and runs **only the first block whose condition is true**. If none is true, the \`else\` block runs. So for \`temperature = 35\` this prints only \`hot\`, even though \`35 > 15\` is also true.

### Combining conditions

| Operator | Meaning | Example |
|---|---|---|
| \`and\` | both must be true | \`age >= 13 and age <= 19\` |
| \`or\` | at least one must be true | \`day == "Sat" or day == "Sun"\` |
| \`not\` | flips True and False | \`not is_member\` |

Python also lets you **chain comparisons**: \`13 <= age <= 19\` means the same as the \`and\` version above and reads like maths.

\`and\` and \`or\` **short-circuit**: Python stops as soon as the answer is known. In \`count > 0 and total / count > 10\`, the division never runs when \`count\` is 0, which avoids a crash.

### Truthy and falsy values

An \`if\` does not need a real boolean. Python treats these values as **falsy**: \`False\`, \`0\`, \`0.0\`, \`""\` (empty string), \`[]\`, \`{}\`, \`set()\` and \`None\`. Almost everything else is **truthy**.

\`\`\`python
name = input()
if name:
    print("Hello,", name)
else:
    print("You didn't type a name")
\`\`\`

### Worked example: cinema ticket price

> Children under 12 pay 5, seniors aged 65 or over pay 6, students pay 7 and everyone else pays 10.

\`\`\`python
age = int(input())
is_student = input() == "yes"

if age < 12:
    price = 5
elif age >= 65:
    price = 6
elif is_student:
    price = 7
else:
    price = 10
print(price)
\`\`\`

The order of the checks encodes the rules: a 10-year-old student pays 5, because the first matching branch wins. When you write a chain, ask "which rule should win if two apply?" and put that one first.

### Common mistakes
- Using \`=\` instead of \`==\` in a condition: \`if x = 5:\` is a syntax error.
- Writing \`if day == "Sat" or "Sun":\`. This is always true, because the non-empty string \`"Sun"\` is truthy on its own. Write \`day == "Sat" or day == "Sun"\`, or \`day in ("Sat", "Sun")\`.
- Mixing tabs and spaces, or forgetting to indent the block, which raises an \`IndentationError\`.
- Writing separate \`if\` statements when you meant \`elif\`, so more than one branch runs.`,
      practice: [
        { title: 'Grade calculator', kind: 'problem', ref: 'grade-calculator' },
        { title: 'Even or odd', kind: 'problem', ref: 'even-or-odd' },
        { title: 'Leap year rules', kind: 'exercise', prompt: 'Read a year and print "leap" or "common". A year is a leap year if it is divisible by 4, except years divisible by 100, which are leap years only if they are also divisible by 400 (so 2000 is leap and 1900 is not).' },
      ],
      resources: [
        { title: 'The Python Tutorial: if Statements', url: 'https://docs.python.org/3/tutorial/controlflow.html#if-statements', source: 'Python Software Foundation', kind: 'docs' },
        { title: 'Truth Value Testing and Boolean Operations', url: 'https://docs.python.org/3/library/stdtypes.html#truth-value-testing', source: 'Python Software Foundation', kind: 'docs' },
        { title: 'CS50P: Conditionals (lecture 1)', url: 'https://cs50.harvard.edu/python/2022/weeks/1/', source: 'Harvard CS50', kind: 'video' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'First matching branch',
          prompt: 'What does this print?\n\n```python\nx = 25\nif x > 10:\n    print("A")\nelif x > 20:\n    print("B")\nelse:\n    print("C")\n```',
          options: [
            { id: 'a', text: 'A' },
            { id: 'b', text: 'B' },
            { id: 'c', text: 'A and then B' },
            { id: 'd', text: 'C' },
          ],
          correct: ['a'],
          explanation: 'Only the first true branch runs. `25 > 10` is true, so `A` is printed and the rest of the chain is skipped.',
        },
        {
          key: 'q2',
          type: 'multi',
          title: 'Falsy values',
          prompt: 'Which of these values are **falsy** in Python? Select all that apply.',
          options: [
            { id: 'a', text: '`0`' },
            { id: 'b', text: '`""` (empty string)' },
            { id: 'c', text: '`"False"`' },
            { id: 'd', text: '`[]` (empty list)' },
            { id: 'e', text: '`-1`' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'Zero, empty strings and empty collections are falsy. `"False"` is a non-empty string, so it is truthy, and every non-zero number (including -1) is truthy.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'The "or" trap',
          prompt: 'The condition `day == "Sat" or "Sun"` is only true when `day` is `"Sat"` or `"Sun"`.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Python reads it as `(day == "Sat") or "Sun"`. The string `"Sun"` is truthy, so the whole condition is always truthy. Compare `day` on both sides of `or`.',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Chain keyword',
          prompt: 'Fill in the keyword that adds another condition to an if chain: `if a: ... ____ b: ... else: ...`',
          accepted: [['elif']],
          explanation: '`elif` (short for "else if") is checked only when every condition above it was false.',
        },
      ],
    },
    {
      slug: 'loops',
      title: 'Loops: for, while and range',
      module: 'Control flow',
      skill: 'control-flow',
      minutes: 40,
      objectives: [
        'Repeat code with for loops over range() and over collections',
        'Use while loops when the number of repetitions is not known in advance',
        'Apply the accumulator and counter patterns',
        'Control loops with break and continue',
        'Spot and fix off-by-one errors',
      ],
      body: `A **loop** repeats a block of code. Python has two kinds: \`for\` loops, which step through a sequence, and \`while\` loops, which repeat as long as a condition stays true.

### for loops and range()

\`\`\`python
for i in range(5):
    print(i)
\`\`\`

This prints \`0 1 2 3 4\` on separate lines. \`range\` is the workhorse for counting loops:

| Call | Values produced |
|---|---|
| \`range(5)\` | 0, 1, 2, 3, 4 |
| \`range(2, 6)\` | 2, 3, 4, 5 |
| \`range(1, 10, 3)\` | 1, 4, 7 |
| \`range(5, 0, -1)\` | 5, 4, 3, 2, 1 |

The stop value is **never included**. To count from 1 to \`n\`, write \`range(1, n + 1)\`.

A \`for\` loop can walk over any sequence, not just numbers:

\`\`\`python
for letter in "abc":
    print(letter.upper())   # A, B, C
\`\`\`

### The accumulator pattern

Many loops build up a result step by step. Start a variable before the loop and update it inside:

\`\`\`python
n = int(input())          # e.g. 4
total = 0
for k in range(1, n + 1):
    total += k            # same as total = total + k
print(total)              # 1 + 2 + 3 + 4 = 10
\`\`\`

A **counter** is the same idea: start at 0 and add 1 whenever something you care about happens.

### while loops

Use \`while\` when you don't know in advance how many times to repeat:

\`\`\`python
n = int(input())          # e.g. 9475
digits = 0
while n > 0:
    n //= 10              # drop the last digit
    digits += 1
print(digits)             # 4
\`\`\`

Every \`while\` loop needs something inside it that eventually makes the condition false. If nothing changes, the loop runs forever (an **infinite loop**). In CodeLab that shows up as a time-limit error.

### break and continue

- \`break\` leaves the loop immediately.
- \`continue\` skips the rest of this iteration and moves to the next one.

\`\`\`python
for k in range(1, 20):
    if k % 2 == 0:
        continue          # skip even numbers
    if k > 9:
        break             # stop once we pass 9
    print(k)              # 1 3 5 7 9
\`\`\`

### Worked example: tracing a loop

When a loop surprises you, trace it by hand in a table. For \`total = 0; for k in range(3): total += k * 2\`:

| k | k * 2 | total after |
|---|---|---|
| 0 | 0 | 0 |
| 1 | 2 | 2 |
| 2 | 4 | 6 |

Tracing is the fastest way to find logic bugs in loops.

### Common mistakes
- **Off-by-one errors:** \`range(1, n)\` stops at \`n - 1\`. Check the first and last values of every loop.
- Forgetting to update the variable in a \`while\` loop, causing an infinite loop.
- Resetting the accumulator inside the loop (\`total = 0\` indented under the \`for\`), so it starts over every time.
- Changing a list while looping over it. Loop over a copy (\`for x in items[:]\`) or build a new list instead.`,
      practice: [
        { title: 'FizzBuzz', kind: 'problem', ref: 'fizzbuzz' },
        { title: 'Running sum', kind: 'problem', ref: 'running-sum' },
        { title: 'Count the vowels', kind: 'problem', ref: 'count-vowels' },
        { title: 'Guess the number', kind: 'exercise', prompt: 'On your own computer, pick a secret number from 1 to 100 and use a while loop to keep asking for guesses, printing "higher" or "lower", until the guess is correct. Then print how many guesses it took.' },
      ],
      resources: [
        { title: 'The Python Tutorial: for Statements and range()', url: 'https://docs.python.org/3/tutorial/controlflow.html#for-statements', source: 'Python Software Foundation', kind: 'docs' },
        { title: 'CS50P: Loops (lecture 2)', url: 'https://cs50.harvard.edu/python/2022/weeks/2/', source: 'Harvard CS50', kind: 'video' },
        { title: 'Python for Everybody: Loops and Iterations', url: 'https://www.py4e.com/lessons/loops', source: 'py4e.com (Dr. Chuck)', kind: 'course' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'range with a step',
          prompt: 'Which values does `range(2, 11, 3)` produce?',
          options: [
            { id: 'a', text: '2, 5, 8' },
            { id: 'b', text: '2, 5, 8, 11' },
            { id: 'c', text: '3, 6, 9' },
            { id: 'd', text: '2, 3, 4, ..., 10' },
          ],
          correct: ['a'],
          explanation: 'Start at 2 and add 3 each time: 2, 5, 8. The next value, 11, is the stop value, which is never included.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Accumulator result',
          prompt: 'What does this print?\n\n```python\ntotal = 0\nfor k in range(1, 5):\n    total += k\nprint(total)\n```',
          options: [
            { id: 'a', text: '10' },
            { id: 'b', text: '15' },
            { id: 'c', text: '4' },
          ],
          correct: ['a'],
          explanation: '`range(1, 5)` is 1, 2, 3, 4, and 1 + 2 + 3 + 4 = 10. The stop value 5 is excluded.',
        },
        {
          key: 'q3',
          type: 'matching',
          title: 'Loop tools',
          prompt: 'Match each keyword or function to what it does.',
          pairs: {
            left: [
              { id: 'l1', text: '`break`' },
              { id: 'l2', text: '`continue`' },
              { id: 'l3', text: '`range(n)`' },
              { id: 'l4', text: '`while`' },
            ],
            right: [
              { id: 'r1', text: 'Exit the loop immediately' },
              { id: 'r2', text: 'Skip to the next iteration' },
              { id: 'r3', text: 'Produce 0, 1, ..., n - 1' },
              { id: 'r4', text: 'Repeat while a condition is true' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: '`break` exits, `continue` skips ahead, `range(n)` counts from 0 up to but not including n, and `while` repeats until its condition becomes false.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Infinite loop',
          prompt: 'This loop eventually stops:\n\n```python\nn = 5\nwhile n > 0:\n    print(n)\n```',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: '`n` never changes inside the loop, so `n > 0` stays true forever. Add `n -= 1` to the loop body.',
        },
      ],
    },
    {
      slug: 'functions',
      title: 'Thinking in functions',
      module: 'Functions',
      skill: 'functions',
      minutes: 45,
      milestone: true,
      completionCriteria: 'Pass the quiz (70%+) and solve "Prime checker" and "Number to words".',
      objectives: [
        'Define functions with parameters and return values',
        'Explain the difference between return and print',
        'Use default parameter values and keyword arguments',
        'Describe local and global scope',
        'Break a problem into small, testable functions',
      ],
      body: `A **function** is a named, reusable block of code. You have been calling functions such as \`print\`, \`input\` and \`len\` since the first lesson. Now you will write your own.

### Defining and calling a function

\`\`\`python
def greet(name):
    return "Hello, " + name + "!"

message = greet("Asha")
print(message)            # Hello, Asha!
\`\`\`

- \`def\` starts the definition, followed by the function name and its **parameters** in parentheses.
- The indented body runs only when the function is **called**.
- \`return\` sends a value back to the caller. The call \`greet("Asha")\` is replaced by that value.
- The value you pass in (\`"Asha"\`) is called an **argument**.

### return is not print

\`print\` shows text on the screen. \`return\` hands a value back so the rest of your program can use it.

\`\`\`python
def square_print(x):
    print(x * x)

def square(x):
    return x * x

total = square(3) + square(4)     # 9 + 16 = 25
broken = square_print(3)          # prints 9, but broken is None
\`\`\`

A function with no \`return\` statement returns the special value \`None\`. Prefer functions that return values: they are easier to combine and to test.

### Default values and keyword arguments

\`\`\`python
def power(base, exponent=2):
    return base ** exponent

power(5)               # 25 (exponent defaults to 2)
power(2, 10)           # 1024
power(exponent=3, base=2)   # 8, arguments passed by name
\`\`\`

### Scope

Variables created inside a function are **local**: they exist only while the function runs and are invisible outside it.

\`\`\`python
def add_tax(price):
    rate = 0.2            # local variable
    return price * (1 + rate)

print(add_tax(100))       # 120.0
print(rate)               # NameError: name 'rate' is not defined
\`\`\`

Functions can read variables defined at the top level of the file (globals), but relying on them makes code harder to follow. Pass what a function needs as parameters and get results back with \`return\`.

### Worked example: decomposing a problem

> Read several temperatures in Celsius and print the average in Fahrenheit.

\`\`\`python
def to_fahrenheit(celsius):
    """Convert a Celsius temperature to Fahrenheit."""
    return celsius * 9 / 5 + 32

def average(values):
    """Return the mean of a non-empty list of numbers."""
    return sum(values) / len(values)

temps = [float(x) for x in input().split()]   # e.g. 10 20 30
print(average([to_fahrenheit(t) for t in temps]))  # 68.0
\`\`\`

Each function does one job, has a clear name and a short **docstring** (the string on its first line). You can test \`to_fahrenheit(100)\` on its own and expect \`212.0\` before you trust the whole program.

### Common mistakes
- Printing inside a function when the caller needs the value, then getting \`None\` back.
- Forgetting the parentheses: \`greet\` refers to the function itself, \`greet("Asha")\` calls it.
- Code after \`return\` in the same block never runs, because \`return\` exits the function immediately.
- Using a mutable default such as \`def add(item, items=[])\`. The same list is shared between calls; use \`items=None\` and create the list inside.`,
      practice: [
        { title: 'Prime checker', kind: 'problem', ref: 'prime-checker' },
        { title: 'Number to words', kind: 'problem', ref: 'number-to-words' },
        { title: 'Refactor into functions', kind: 'exercise', prompt: 'Take your solution to "Grade calculator" and move the grading logic into a function letter_grade(score) that returns the letter. Then write three assert statements that check letter_grade(95), letter_grade(60) and letter_grade(-1).' },
      ],
      resources: [
        { title: 'The Python Tutorial: Defining Functions', url: 'https://docs.python.org/3/tutorial/controlflow.html#defining-functions', source: 'Python Software Foundation', kind: 'docs' },
        { title: 'Python for Everybody: Functions', url: 'https://www.py4e.com/lessons/functions', source: 'py4e.com (Dr. Chuck)', kind: 'course' },
        { title: 'CS50P: Functions, Variables (lecture 0)', url: 'https://cs50.harvard.edu/python/2022/weeks/0/', source: 'Harvard CS50', kind: 'video' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Missing return',
          prompt: 'What is printed?\n\n```python\ndef double(x):\n    x * 2\n\nprint(double(4))\n```',
          options: [
            { id: 'a', text: '8' },
            { id: 'b', text: 'None' },
            { id: 'c', text: '4' },
            { id: 'd', text: 'An error' },
          ],
          correct: ['b'],
          explanation: 'The function computes `x * 2` but never returns it. A function without a `return` gives back `None`.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Default parameter',
          prompt: 'Given `def power(base, exponent=2): return base ** exponent`, what is `power(3)`?',
          options: [
            { id: 'a', text: '6' },
            { id: 'b', text: '9' },
            { id: 'c', text: '27' },
            { id: 'd', text: 'TypeError: missing argument' },
          ],
          correct: ['b'],
          explanation: '`exponent` defaults to 2 when it is not passed, so the result is 3 ** 2 = 9.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Local scope',
          prompt: 'A variable assigned inside a function can be used by code outside the function after the function returns.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Variables assigned inside a function are local to it. To get a value out, `return` it.',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'Function vocabulary',
          prompt: 'Match each term to its meaning.',
          pairs: {
            left: [
              { id: 'l1', text: 'Parameter' },
              { id: 'l2', text: 'Argument' },
              { id: 'l3', text: 'Return value' },
              { id: 'l4', text: 'Docstring' },
            ],
            right: [
              { id: 'r1', text: 'The name in the def line that receives a value' },
              { id: 'r2', text: 'The actual value passed in a call' },
              { id: 'r3', text: 'What the call evaluates to' },
              { id: 'r4', text: 'A string on the first line describing the function' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'In `def greet(name)` the parameter is `name`; in `greet("Asha")` the argument is `"Asha"`; the call evaluates to the return value; a docstring documents what the function does.',
        },
      ],
    },
    {
      slug: 'lists-tuples-dicts-sets',
      title: 'Lists, tuples, dictionaries and sets',
      module: 'Working with data',
      skill: 'collections',
      minutes: 50,
      objectives: [
        'Create, index, slice and modify lists',
        'Explain when to use a tuple instead of a list',
        'Store and look up data by key with dictionaries',
        'Use sets to remove duplicates and test membership',
        'Choose the right collection for a task',
      ],
      body: `Real programs work with many values at once. Python's four built-in collections cover most needs.

### Lists: ordered and changeable

\`\`\`python
scores = [72, 95, 88]
scores.append(60)          # [72, 95, 88, 60]
scores[0] = 75             # [75, 95, 88, 60]
print(scores[1])           # 95  (indexes start at 0)
print(scores[-1])          # 60  (negative indexes count from the end)
print(scores[1:3])         # [95, 88]  slice: start included, stop excluded
print(len(scores))         # 4
print(sorted(scores))      # [60, 75, 88, 95]  (a new list)
\`\`\`

Other useful operations: \`scores.remove(88)\` removes the first 88, \`scores.pop()\` removes and returns the last item, \`x in scores\` tests membership, and \`sum(scores)\`, \`max(scores)\` and \`min(scores)\` do what their names say.

A **list comprehension** builds a new list in one line:

\`\`\`python
squares = [n * n for n in range(5)]          # [0, 1, 4, 9, 16]
passed = [s for s in scores if s >= 70]      # keep only passing scores
\`\`\`

### Tuples: ordered and fixed

\`\`\`python
point = (3, 4)
x, y = point               # unpacking
\`\`\`

A tuple is like a list that cannot be changed after it is created. Use one for a small, fixed group of related values, such as coordinates or a (name, score) pair. Functions often return several values as a tuple: \`return total, count\`.

### Dictionaries: look up by key

\`\`\`python
ages = {"Asha": 21, "Ben": 19}
ages["Chen"] = 22           # add or update
print(ages["Asha"])         # 21
print(ages.get("Dee", 0))   # 0, a default instead of a KeyError
for name, age in ages.items():
    print(name, age)
\`\`\`

Dictionaries map **keys** to **values**. Looking up a key is fast no matter how big the dictionary is. Keys must be immutable (strings, numbers, tuples).

### Sets: unique values

\`\`\`python
tags = {"python", "web", "python"}
print(tags)                 # {'python', 'web'}  duplicates removed
print("web" in tags)        # True, and very fast
unique = set([3, 1, 3, 2])  # {1, 2, 3}
\`\`\`

Sets are unordered, so you cannot index them. They support maths-style operations: \`a | b\` (union), \`a & b\` (intersection) and \`a - b\` (difference).

### Worked example: counting with a dictionary

> Count how many times each fruit appears in \`apple banana apple cherry banana apple\`.

\`\`\`python
words = input().split()
counts = {}
for w in words:
    counts[w] = counts.get(w, 0) + 1
print(counts)   # {'apple': 3, 'banana': 2, 'cherry': 1}
\`\`\`

\`counts.get(w, 0)\` returns the current count, or 0 if the word is new. This "count with a dictionary" pattern appears constantly in real code. The standard library's \`collections.Counter\` does the same job in one call.

### Choosing a collection

| Need | Use |
|---|---|
| An ordered sequence you will change | list |
| A small fixed record | tuple |
| Look up values by a name or ID | dict |
| Remove duplicates or test membership quickly | set |

### Common mistakes
- \`IndexError\` from using \`my_list[len(my_list)]\`: the last index is \`len - 1\`.
- \`KeyError\` from reading a missing key with \`d[key]\`; use \`d.get(key, default)\` or check \`key in d\` first.
- Expecting \`scores.sort()\` to return the sorted list. It sorts in place and returns \`None\`; use \`sorted(scores)\` for a new list.
- Writing \`b = a\` and expecting a copy. Both names refer to the same list; use \`a.copy()\` or \`a[:]\`.`,
      practice: [
        { title: 'Largest and smallest', kind: 'problem', ref: 'max-and-min' },
        { title: 'Second largest distinct value', kind: 'problem', ref: 'second-largest-distinct' },
        { title: 'Word frequency', kind: 'problem', ref: 'word-frequency' },
        { title: 'Reverse the words', kind: 'problem', ref: 'reverse-words' },
      ],
      resources: [
        { title: 'The Python Tutorial: Data Structures', url: 'https://docs.python.org/3/tutorial/datastructures.html', source: 'Python Software Foundation', kind: 'docs' },
        { title: 'Python for Everybody: Dictionaries', url: 'https://www.py4e.com/lessons/dictionary', source: 'py4e.com (Dr. Chuck)', kind: 'course' },
        { title: 'collections: Container datatypes', url: 'https://docs.python.org/3/library/collections.html', source: 'Python Software Foundation', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Slicing',
          prompt: 'Given `nums = [10, 20, 30, 40, 50]`, what is `nums[1:4]`?',
          options: [
            { id: 'a', text: '[20, 30, 40]' },
            { id: 'b', text: '[10, 20, 30, 40]' },
            { id: 'c', text: '[20, 30, 40, 50]' },
          ],
          correct: ['a'],
          explanation: 'A slice includes the start index (1, which holds 20) and stops before the end index (4, which holds 50).',
        },
        {
          key: 'q2',
          type: 'matching',
          title: 'Pick the collection',
          prompt: 'Match each task to the best collection.',
          pairs: {
            left: [
              { id: 'l1', text: 'Phone numbers looked up by contact name' },
              { id: 'l2', text: 'The unique visitors to a website' },
              { id: 'l3', text: 'A to-do list you reorder and edit' },
              { id: 'l4', text: 'A fixed (latitude, longitude) pair' },
            ],
            right: [
              { id: 'r1', text: 'dict' },
              { id: 'r2', text: 'set' },
              { id: 'r3', text: 'list' },
              { id: 'r4', text: 'tuple' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'Dictionaries look up by key, sets keep unique values, lists are ordered and changeable, and tuples hold small fixed groups.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Safe dictionary lookup',
          prompt: 'With `stock = {"pen": 4}`, what does `stock.get("ink", 0)` return?',
          options: [
            { id: 'a', text: '0' },
            { id: 'b', text: 'None' },
            { id: 'c', text: 'It raises KeyError' },
          ],
          correct: ['a'],
          explanation: '`get` returns the default you supply (here 0) when the key is missing. Only `stock["ink"]` would raise a KeyError.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'sort() return value',
          prompt: '`result = [3, 1, 2].sort()` stores `[1, 2, 3]` in `result`.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: '`list.sort()` sorts in place and returns `None`. Use `sorted([3, 1, 2])` when you want the sorted list as a value.',
        },
      ],
    },
    {
      slug: 'strings-and-string-methods',
      title: 'Strings and string methods',
      module: 'Working with data',
      skill: 'strings',
      minutes: 40,
      objectives: [
        'Index and slice strings, including reversing with [::-1]',
        'Explain why strings are immutable',
        'Use common methods such as lower, strip, split, join, replace and find',
        'Format output with f-strings',
      ],
      body: `A **string** is a sequence of characters. Much of what you know about lists works on strings too.

### Indexing and slicing

\`\`\`python
word = "Python"
print(word[0])        # P
print(word[-1])       # n
print(word[0:3])      # Pyt
print(word[::-1])     # nohtyP  (step -1 walks backwards)
print(len(word))      # 6
for ch in word:
    print(ch)         # one character per line
\`\`\`

### Strings are immutable

You cannot change a string in place. \`word[0] = "J"\` raises a \`TypeError\`. Instead, build a new string:

\`\`\`python
word = "J" + word[1:]   # "Jython"
\`\`\`

This is also why string methods **return a new string** rather than modifying the original. \`name.upper()\` on its own does nothing useful; write \`name = name.upper()\`.

### Everyday methods

| Method | Example | Result |
|---|---|---|
| \`lower()\` / \`upper()\` | \`"Hi".lower()\` | \`"hi"\` |
| \`strip()\` | \`"  hi  ".strip()\` | \`"hi"\` |
| \`split()\` | \`"a b  c".split()\` | \`["a", "b", "c"]\` |
| \`split(",")\` | \`"a,b,,c".split(",")\` | \`["a", "b", "", "c"]\` |
| \`join()\` | \`"-".join(["a", "b"])\` | \`"a-b"\` |
| \`replace()\` | \`"cat".replace("c", "b")\` | \`"bat"\` |
| \`find()\` | \`"hello".find("l")\` | \`2\` (or -1 if missing) |
| \`startswith()\` / \`endswith()\` | \`"photo.png".endswith(".png")\` | \`True\` |
| \`isdigit()\` / \`isalpha()\` | \`"42".isdigit()\` | \`True\` |
| \`count()\` | \`"banana".count("a")\` | \`3\` |

The \`in\` operator checks for a substring: \`"ell" in "hello"\` is \`True\`.

### f-strings for formatting

Put an \`f\` before the quotes and write expressions inside braces:

\`\`\`python
name, score = "Asha", 91.456
print(f"{name} scored {score:.1f}%")   # Asha scored 91.5%
print(f"{name:>8}|")                   # right-align in 8 characters
\`\`\`

\`:.1f\` means "one digit after the decimal point".

### Worked example: initials

> Read a full name such as \`  ada   lovelace \` and print the initials \`A.L.\`

\`\`\`python
name = input()
parts = name.split()                       # ["ada", "lovelace"]
initials = [p[0].upper() + "." for p in parts]
print("".join(initials))                   # A.L.
\`\`\`

\`split()\` with no argument handles any amount of extra whitespace, \`p[0]\` takes the first character and \`join\` glues the pieces back together. Split, transform, join is a pattern you will use again and again.

### Characters are numbers underneath

Every character has a numeric code: \`ord("a")\` is 97 and \`chr(98)\` is \`"b"\`. Letters are consecutive, which makes tricks such as shifting letters (a Caesar cipher) possible with simple arithmetic.

### Common mistakes
- Calling a method and ignoring its result: \`s.strip()\` alone does not change \`s\`.
- Using \`split(" ")\` on text with repeated spaces and getting empty strings. Plain \`split()\` is usually what you want.
- Comparing strings without normalising case: \`"Yes" == "yes"\` is \`False\`. Compare \`answer.lower() == "yes"\`.
- Forgetting \`str()\` when joining numbers: \`" ".join([1, 2])\` fails; use \`" ".join(str(n) for n in nums)\`.`,
      practice: [
        { title: 'Palindrome check', kind: 'problem', ref: 'palindrome-check' },
        { title: 'Anagram check', kind: 'problem', ref: 'anagram-check' },
        { title: 'Caesar cipher', kind: 'problem', ref: 'caesar-cipher' },
        { title: 'Reverse the words', kind: 'problem', ref: 'reverse-words' },
      ],
      resources: [
        { title: 'String Methods', url: 'https://docs.python.org/3/library/stdtypes.html#string-methods', source: 'Python Software Foundation', kind: 'docs' },
        { title: 'The Python Tutorial: Fancier Output Formatting', url: 'https://docs.python.org/3/tutorial/inputoutput.html#fancier-output-formatting', source: 'Python Software Foundation', kind: 'docs' },
        { title: 'Python for Everybody: Strings', url: 'https://www.py4e.com/lessons/strings', source: 'py4e.com (Dr. Chuck)', kind: 'course' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Reverse slice',
          prompt: 'What is `"stressed"[::-1]`?',
          options: [
            { id: 'a', text: '"desserts"' },
            { id: 'b', text: '"stressed"' },
            { id: 'c', text: '"d"' },
          ],
          correct: ['a'],
          explanation: 'A step of -1 walks the string from the end to the start, reversing it.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Immutability',
          prompt: 'After `s = "hello"` and then `s.upper()`, the variable `s` holds `"HELLO"`.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Strings are immutable. `upper()` returns a new string, which is thrown away here. Write `s = s.upper()` to keep it.',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Join words',
          prompt: 'Complete the code so it prints `a-b-c`: `print("-".____(["a", "b", "c"]))`',
          accepted: [['join']],
          explanation: '`separator.join(list_of_strings)` places the separator between each pair of items.',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'True expressions',
          prompt: 'Which expressions evaluate to `True`? Select all that apply.',
          options: [
            { id: 'a', text: '`"ell" in "hello"`' },
            { id: 'b', text: '`"  hi ".strip() == "hi"`' },
            { id: 'c', text: '`"Yes" == "yes"`' },
            { id: 'd', text: '`"a,b".split(",") == ["a", "b"]`' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: '`in` checks substrings, `strip` removes surrounding whitespace and `split(",")` cuts at commas. String comparison is case-sensitive, so `"Yes" == "yes"` is False.',
        },
      ],
    },
    {
      slug: 'errors-and-debugging',
      title: 'Errors, exceptions and debugging',
      module: 'Writing reliable code',
      skill: 'error-handling',
      minutes: 40,
      objectives: [
        'Read a traceback from the bottom up to find the cause of an error',
        'Recognise common exceptions such as NameError, TypeError, ValueError, IndexError and KeyError',
        'Handle expected failures with try, except, else and finally',
        'Raise your own exceptions with clear messages',
        'Debug systematically instead of guessing',
      ],
      body: `Every programmer writes code with bugs. What separates beginners from experienced developers is how quickly they find and fix them.

### Reading a traceback

When Python hits an error it cannot recover from, it stops and prints a **traceback**:

\`\`\`text
Traceback (most recent call last):
  File "main.py", line 5, in <module>
    print(average(scores))
  File "main.py", line 2, in average
    return sum(values) / len(values)
ZeroDivisionError: division by zero
\`\`\`

Read it **from the bottom up**:
1. The last line names the exception type (\`ZeroDivisionError\`) and a message.
2. The lines above show where it happened: line 2, inside \`average\`.
3. Further up is the call that led there: line 5 called \`average(scores)\`. Here \`scores\` must have been empty.

### Common exceptions

| Exception | Typical cause |
|---|---|
| \`SyntaxError\` | Code Python cannot parse: missing colon, unclosed bracket |
| \`NameError\` | Using a variable that does not exist (often a typo) |
| \`TypeError\` | Wrong type for an operation, such as \`"5" + 3\` |
| \`ValueError\` | Right type, bad value, such as \`int("abc")\` |
| \`IndexError\` | List index out of range |
| \`KeyError\` | Dictionary key not found |
| \`ZeroDivisionError\` | Dividing by zero |

### Handling exceptions with try and except

Some failures are expected, such as a user typing letters where you asked for a number. Handle those with \`try\`:

\`\`\`python
text = input()
try:
    age = int(text)
except ValueError:
    print("Please enter a whole number")
else:
    print("Next year you will be", age + 1)
finally:
    print("Thanks!")
\`\`\`

- The \`try\` block holds code that might fail.
- An \`except\` block runs only if that specific exception happens.
- \`else\` runs only if no exception happened.
- \`finally\` always runs, which is useful for cleanup.

Catch **specific** exceptions. A bare \`except:\` also hides typos and real bugs, making them much harder to find.

### Raising exceptions

Your own functions can signal a problem with \`raise\`:

\`\`\`python
def average(values):
    if not values:
        raise ValueError("average() needs at least one value")
    return sum(values) / len(values)
\`\`\`

A clear message saves the next person (often you) a lot of time.

### A debugging routine

1. **Reproduce** the bug with the smallest input that triggers it.
2. **Read** the traceback, or compare the actual output with the expected output.
3. **Inspect**: add \`print(repr(x))\` near the problem to see values and types (\`repr\` shows hidden spaces and quotes). For bigger programs, call \`breakpoint()\` to pause in the Python debugger.
4. **Form a hypothesis**, change one thing, and run again.
5. **Explain** the code line by line, out loud or to a "rubber duck". Bugs often appear when you describe what the code actually does.

### Worked example

\`\`\`python
prices = {"tea": 2, "cake": 3}
order = input().split()        # "tea cake coffee"
total = 0
for item in order:
    total += prices[item]      # KeyError: 'coffee'
\`\`\`

The traceback's last line, \`KeyError: 'coffee'\`, tells you exactly which key was missing. A fix that reports the problem instead of crashing:

\`\`\`python
for item in order:
    if item in prices:
        total += prices[item]
    else:
        print("Unknown item:", item)
\`\`\`

### Common mistakes
- Reading only the top of the traceback. The most useful line is the last one.
- Wrapping a whole program in \`try: ... except: pass\`, which silences every error, including the ones you need to see.
- Changing several things at once while debugging, so you cannot tell which change mattered.`,
      practice: [
        { title: 'Safe division', kind: 'problem', ref: 'safe-division' },
        { title: 'Break it on purpose', kind: 'exercise', prompt: 'Write five one-line programs that each raise a different exception: NameError, TypeError, ValueError, IndexError and KeyError. Read each traceback and write down, in your own words, what the last line tells you.' },
        { title: 'Robust number input', kind: 'exercise', prompt: 'Write a function read_int(prompt) that keeps asking until the user types a valid whole number, using try / except ValueError, and returns it.' },
      ],
      resources: [
        { title: 'The Python Tutorial: Errors and Exceptions', url: 'https://docs.python.org/3/tutorial/errors.html', source: 'Python Software Foundation', kind: 'docs' },
        { title: 'Built-in Exceptions', url: 'https://docs.python.org/3/library/exceptions.html', source: 'Python Software Foundation', kind: 'docs' },
        { title: 'CS50P: Exceptions (lecture 3)', url: 'https://cs50.harvard.edu/python/2022/weeks/3/', source: 'Harvard CS50', kind: 'video' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Where to look first',
          prompt: 'Which line of a Python traceback usually tells you **what** went wrong?',
          options: [
            { id: 'a', text: 'The last line' },
            { id: 'b', text: 'The first line' },
            { id: 'c', text: 'The line with the most indentation' },
          ],
          correct: ['a'],
          explanation: 'The last line shows the exception type and message. The lines above it show where it happened and how the program got there.',
        },
        {
          key: 'q2',
          type: 'matching',
          title: 'Name the exception',
          prompt: 'Match each line of code to the exception it raises.',
          pairs: {
            left: [
              { id: 'l1', text: '`int("abc")`' },
              { id: 'l2', text: '`"5" + 3`' },
              { id: 'l3', text: '`[1, 2][5]`' },
              { id: 'l4', text: '`{"a": 1}["b"]`' },
            ],
            right: [
              { id: 'r1', text: 'ValueError' },
              { id: 'r2', text: 'TypeError' },
              { id: 'r3', text: 'IndexError' },
              { id: 'r4', text: 'KeyError' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: '`int` gets a string of the right type but a bad value (ValueError); you cannot add a str and an int (TypeError); index 5 does not exist (IndexError); key "b" is missing (KeyError).',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'else and finally',
          prompt: 'What does this print when the input is `abc`?\n\n```python\ntry:\n    n = int(input())\nexcept ValueError:\n    print("bad")\nelse:\n    print("good")\nfinally:\n    print("end")\n```',
          options: [
            { id: 'a', text: 'bad, then end' },
            { id: 'b', text: 'bad, then good, then end' },
            { id: 'c', text: 'good, then end' },
            { id: 'd', text: 'bad only' },
          ],
          correct: ['a'],
          explanation: '`int("abc")` raises ValueError, so the except block prints "bad". `else` is skipped because an exception happened, and `finally` always runs.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Bare except',
          prompt: 'Using a bare `except:` that catches everything is good practice because it prevents all crashes.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'A bare except also swallows typos and genuine bugs, hiding them. Catch the specific exceptions you expect and can handle.',
        },
      ],
    },
    {
      slug: 'files-and-json',
      title: 'Files and JSON',
      module: 'Writing reliable code',
      skill: 'file-io',
      minutes: 45,
      milestone: true,
      completionCriteria: 'Pass the quiz (70%+), solve "Word frequency" and complete the "Notes saver" exercise on your own computer.',
      objectives: [
        'Open, read and write text files safely with the with statement',
        'Choose the right file mode: read, write or append',
        'Convert between Python data and JSON with the json module',
        'Handle missing or invalid files without crashing',
      ],
      body: `Variables disappear when a program ends. To keep data between runs, save it to a **file**.

### Reading a text file

\`\`\`python
with open("notes.txt", encoding="utf-8") as f:
    text = f.read()          # the whole file as one string
\`\`\`

The \`with\` statement opens the file and **closes it automatically** when the block ends, even if an error happens. Always pass \`encoding="utf-8"\` so your program behaves the same on every operating system.

To process a file line by line (memory-friendly for large files):

\`\`\`python
with open("notes.txt", encoding="utf-8") as f:
    for line in f:
        print(line.rstrip("\\n"))   # each line still ends with a newline
\`\`\`

### Writing and appending

| Mode | Meaning |
|---|---|
| \`"r"\` | read (the default); error if the file is missing |
| \`"w"\` | write; creates the file or **erases** an existing one |
| \`"a"\` | append; adds to the end, creating the file if needed |

\`\`\`python
with open("log.txt", "a", encoding="utf-8") as f:
    f.write("Started\\n")          # write() does not add a newline for you
\`\`\`

### Paths

A relative path such as \`"notes.txt"\` is resolved from the folder the program runs in, which is a frequent source of \`FileNotFoundError\`. The standard library's \`pathlib\` makes paths easier to build and check:

\`\`\`python
from pathlib import Path

path = Path("data") / "notes.txt"
if path.exists():
    print(path.read_text(encoding="utf-8"))
\`\`\`

### JSON: structured data as text

**JSON** (JavaScript Object Notation) is the most common format for saving and exchanging structured data. It maps neatly onto Python: objects become dicts, arrays become lists, and strings, numbers, \`true\`, \`false\` and \`null\` become \`str\`, \`int\`/\`float\`, \`True\`, \`False\` and \`None\`.

\`\`\`python
import json

profile = {"name": "Asha", "skills": ["python", "sql"], "level": 2}

# Python -> JSON text
text = json.dumps(profile)
print(text)        # {"name": "Asha", "skills": ["python", "sql"], "level": 2}

# JSON text -> Python
data = json.loads(text)
print(data["skills"][0])   # python
\`\`\`

\`dumps\` and \`loads\` work with strings. \`dump\` and \`load\` (no "s") work directly with files.

### Worked example: a notes saver

\`\`\`python
import json
from pathlib import Path

PATH = Path("notes.json")

def load_notes():
    try:
        with open(PATH, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return []                      # first run: no file yet
    except json.JSONDecodeError:
        print("notes.json is damaged; starting fresh")
        return []

def save_notes(notes):
    with open(PATH, "w", encoding="utf-8") as f:
        json.dump(notes, f, indent=2)

notes = load_notes()
notes.append(input("New note: "))
save_notes(notes)
print(f"You have {len(notes)} note(s).")
\`\`\`

Run it a few times and the list keeps growing, because it is reloaded from disk each time. Notice how this combines everything from the track: functions, a list, exception handling and an f-string. \`indent=2\` makes the saved file easy for humans to read.

CodeLab problems read from standard input rather than files, but the skills are the same: \`sys.stdin.read()\` returns all the input as one string, just like \`f.read()\`.

### Common mistakes
- Opening with \`"w"\` when you meant \`"a"\`, wiping the existing contents.
- Forgetting that lines read from a file end with \`"\\n"\`, so comparisons like \`line == "yes"\` fail; strip first.
- Writing JSON by hand with string concatenation instead of \`json.dumps\`, which breaks on quotes inside values.
- JSON object keys are always strings: after a round trip, \`{1: "a"}\` comes back as \`{"1": "a"}\`.`,
      practice: [
        { title: 'Word frequency', kind: 'problem', ref: 'word-frequency' },
        { title: 'Notes saver', kind: 'exercise', prompt: 'Build the notes saver from this lesson on your own computer. Then add a "list" command that prints every note with its number, and a "delete N" command that removes note N and saves the file.' },
        { title: 'CSV totals', kind: 'exercise', prompt: 'Create expenses.csv with lines such as "food,12.50". Read it with the csv module, add up the amount for each category in a dictionary, and write the totals to totals.json with json.dump(..., indent=2).' },
      ],
      resources: [
        { title: 'The Python Tutorial: Reading and Writing Files', url: 'https://docs.python.org/3/tutorial/inputoutput.html#reading-and-writing-files', source: 'Python Software Foundation', kind: 'docs' },
        { title: 'json: JSON encoder and decoder', url: 'https://docs.python.org/3/library/json.html', source: 'Python Software Foundation', kind: 'docs' },
        { title: 'CS50P: File I/O (lecture 6)', url: 'https://cs50.harvard.edu/python/2022/weeks/6/', source: 'Harvard CS50', kind: 'video' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'File modes',
          prompt: 'You want to add a line to the end of `log.txt` without losing what is already there. Which mode do you use?',
          options: [
            { id: 'a', text: '`"a"`' },
            { id: 'b', text: '`"w"`' },
            { id: 'c', text: '`"r"`' },
          ],
          correct: ['a'],
          explanation: 'Append mode adds to the end. `"w"` erases the file first, and `"r"` only reads.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'with closes files',
          prompt: 'A file opened with `with open(...) as f:` is closed automatically when the block ends, even if an exception is raised inside it.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'That guarantee is the main reason to use `with`: you never leak open files.',
        },
        {
          key: 'q3',
          type: 'matching',
          title: 'json functions',
          prompt: 'Match each function to what it does.',
          pairs: {
            left: [
              { id: 'l1', text: '`json.dumps(obj)`' },
              { id: 'l2', text: '`json.loads(text)`' },
              { id: 'l3', text: '`json.dump(obj, f)`' },
              { id: 'l4', text: '`json.load(f)`' },
            ],
            right: [
              { id: 'r1', text: 'Python object to a JSON string' },
              { id: 'r2', text: 'JSON string to a Python object' },
              { id: 'r3', text: 'Write a Python object to a file as JSON' },
              { id: 'r4', text: 'Read JSON from a file into a Python object' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'The "s" versions work with strings; the versions without "s" read from or write to file objects.',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'Missing file',
          prompt: 'Which exception does `open("missing.txt")` raise when the file does not exist?',
          options: [
            { id: 'a', text: 'FileNotFoundError' },
            { id: 'b', text: 'KeyError' },
            { id: 'c', text: 'ValueError' },
            { id: 'd', text: 'It returns None' },
          ],
          correct: ['a'],
          explanation: 'Opening a missing file for reading raises FileNotFoundError, which you can catch to handle a first run gracefully.',
        },
      ],
    },
  ],
};
