import type { SeedTrack } from '../types';

// ============================================================================
// OOP and low-level design
// ============================================================================

export const oopLowLevelDesign: SeedTrack = {
  slug: 'oop-and-low-level-design',
  title: 'OOP and Low-Level Design',
  category: 'design',
  summary: 'Model problems with classes and objects, apply SOLID and common patterns, and design classic interview systems such as an LRU cache and a parking lot.',
  description: `**Who it's for:** developers who can write working code and now want to structure it well, and candidates preparing for low-level (machine coding / object-oriented design) interviews.

**Prerequisites:** comfortable with functions and core data structures in one language. Examples use Python, and every idea carries over directly to Java, TypeScript, C# or Kotlin.

**You will be able to:**
- explain encapsulation, abstraction, inheritance and polymorphism with your own examples
- choose composition over inheritance when it reduces coupling
- turn a written requirement into classes, responsibilities and relationships, and sketch them as a class diagram
- recognise SOLID violations and refactor them
- apply Strategy, Observer, Factory Method, Adapter, Decorator and State where they fit, and avoid them where they do not
- design and implement an LRU cache, a parking lot and a vending machine end to end, including edge cases and concurrency

**How each lesson works:** a worked explanation with code, a "Common mistakes" section, hands-on design exercises and a short graded quiz.

**Milestones:** *Design an LRU cache* (topic 6) and *Design a parking lot* (topic 7).`,
  level: 'intermediate',
  estimatedHours: 22,
  roles: ['software engineer', 'backend developer', 'full-stack developer', 'mobile developer'],
  contentStatus: 'complete',
  topics: [
    // ------------------------------------------------------------------ 1
    {
      slug: 'oop-pillars',
      title: 'The four pillars of OOP',
      module: 'Object-oriented foundations',
      skill: 'oop',
      minutes: 40,
      objectives: [
        'Define encapsulation, abstraction, inheritance and polymorphism with an example of each',
        'Protect invariants by hiding state behind methods',
        'Use an abstract base class to separate what an object does from how it does it',
        'Use polymorphism to remove type-checking conditionals',
      ],
      body: `Object-oriented programming (OOP) bundles **data** and the **behaviour** that operates on it into **objects**. A **class** is the blueprint; an **object** (an instance) is one concrete thing built from it, with its own state.

### Encapsulation: protect invariants

An **invariant** is a rule that must always hold, such as "a balance is never negative". Encapsulation keeps state private and exposes only methods that preserve the rules.

\`\`\`python
class BankAccount:
    def __init__(self, owner: str):
        self.owner = owner
        self._balance = 0              # leading underscore: internal by convention

    @property
    def balance(self) -> int:          # read-only view, no setter
        return self._balance

    def deposit(self, amount: int) -> None:
        if amount <= 0:
            raise ValueError("deposit must be positive")
        self._balance += amount

    def withdraw(self, amount: int) -> None:
        if amount <= 0 or amount > self._balance:
            raise ValueError("invalid withdrawal")
        self._balance -= amount
\`\`\`

The only way to change the balance is through methods that check, so no caller can break the invariant. Java, C# and TypeScript enforce this with \`private\`; Python relies on the \`_name\` convention plus properties.

### Abstraction: expose what, hide how

Callers should depend on *what* an object does, not *how*.

\`\`\`python
from abc import ABC, abstractmethod

class FileStore(ABC):
    @abstractmethod
    def save(self, name: str, data: bytes) -> str: ...   # returns a URL

class LocalDiskStore(FileStore):
    def save(self, name, data):
        ...  # write under /var/uploads
        return f"file:///var/uploads/{name}"
\`\`\`

An upload handler that receives a \`FileStore\` works unchanged when you add a \`CloudStore\` later.

### Inheritance: is-a reuse

A subclass reuses and specialises its parent: \`class SavingsAccount(BankAccount)\` can add \`add_interest()\` and still be used anywhere a \`BankAccount\` is expected. Keep hierarchies shallow (see the next lesson).

### Polymorphism: one call, many behaviours

\`\`\`python
class Shape(ABC):
    @abstractmethod
    def area(self) -> float: ...

class Circle(Shape):
    def __init__(self, r): self.r = r
    def area(self): return 3.14159 * self.r ** 2

class Rect(Shape):
    def __init__(self, w, h): self.w, self.h = w, h
    def area(self): return self.w * self.h

total = sum(s.area() for s in [Circle(1), Rect(2, 3)])   # no if/elif on type
\`\`\`

\`\`\`text
        Shape (area)
        /         \\
    Circle       Rect      <- callers depend only on Shape
\`\`\`

Before polymorphism, the same code often looks like \`if kind == "circle": ... elif kind == "rect": ...\`, repeated in every function that touches shapes. Adding a triangle then means editing all of them. With polymorphism you add one class.

### Common mistakes
- Public mutable fields that let callers put an object into an invalid state.
- A getter and a setter for every field: that exposes state just as much as a public field does.
- \`if isinstance(...)\` chains where a polymorphic method belongs.
- Inheriting from a class only to reuse one helper method.
- Mutable class attributes such as \`items = []\` at class level: they are shared by every instance. Create them in \`__init__\`.`,
      practice: [
        { title: 'Bank account invariants', kind: 'exercise', prompt: 'Implement a BankAccount class with deposit, withdraw and a read-only balance. Make it impossible for outside code to set a negative balance. Write three tests that prove the invariant holds, including a withdrawal larger than the balance.' },
        { title: 'Replace the conditional', kind: 'exercise', prompt: 'Given a function that computes shipping cost with if/elif on order.type ("standard", "express", "overnight"), refactor it so each type is a class with a cost(order) method. Then add "same-day" and count how many existing lines you had to edit.' },
        { title: 'Spot the shared state', kind: 'exercise', prompt: 'Write a class Cart with a class-level items = [] list, create two carts and add an item to one. Explain the output, then fix the class.' },
      ],
      resources: [
        { title: 'The Python Tutorial: Classes', url: 'https://docs.python.org/3/tutorial/classes.html', source: 'Python Software Foundation', kind: 'docs' },
        { title: 'The Java Tutorials: Object-Oriented Programming Concepts', url: 'https://docs.oracle.com/javase/tutorial/java/concepts/index.html', source: 'Oracle', kind: 'docs' },
        { title: 'Replace Conditional with Polymorphism', url: 'https://refactoring.guru/replace-conditional-with-polymorphism', source: 'Refactoring.Guru', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Encapsulation',
          prompt: 'Which design best demonstrates encapsulation?',
          options: [
            { id: 'a', text: 'A public `balance` field that callers update directly' },
            { id: 'b', text: 'A private balance changed only through `deposit()` and `withdraw()`, which validate amounts' },
            { id: 'c', text: 'A subclass `SavingsAccount` that extends `Account`' },
          ],
          correct: ['b'],
          explanation: 'Encapsulation hides state behind methods that enforce invariants. Option c is inheritance.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Polymorphism',
          prompt: '`for s in shapes: total += s.area()` works for circles, rectangles and triangles without any type checks. Which pillar is this?',
          options: [
            { id: 'a', text: 'Polymorphism' },
            { id: 'b', text: 'Encapsulation' },
            { id: 'c', text: 'Inheritance only' },
          ],
          correct: ['a'],
          explanation: 'The same call dispatches to a different implementation depending on the object, which is polymorphism.',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'Weak encapsulation',
          prompt: 'Which of these weaken encapsulation? Select all that apply.',
          options: [
            { id: 'a', text: 'A public setter `set_balance(value)` with no validation' },
            { id: 'b', text: 'Returning the internal list so callers can append to it directly' },
            { id: 'c', text: 'A `withdraw()` method that rejects amounts above the balance' },
            { id: 'd', text: 'A read-only property that returns a copy of internal data' },
          ],
          correct: ['a', 'b'],
          explanation: 'An unchecked setter and a leaked mutable list both let outside code bypass the rules. Validating methods and read-only copies protect them.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Class attributes',
          prompt: 'In Python, a list assigned at class level (`class Cart: items = []`) is shared by every instance of the class.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Class attributes belong to the class object. Appending through one instance changes the list every instance sees. Create per-instance state in `__init__`.',
        },
        {
          key: 'q5',
          type: 'matching',
          title: 'Pillars in practice',
          prompt: 'Match each pillar to the example that shows it.',
          pairs: {
            left: [
              { id: 'enc', text: 'Encapsulation' },
              { id: 'abs', text: 'Abstraction' },
              { id: 'inh', text: 'Inheritance' },
              { id: 'pol', text: 'Polymorphism' },
            ],
            right: [
              { id: 'r1', text: 'Balance can change only through validating methods' },
              { id: 'r2', text: 'An upload handler depends on `FileStore.save()` without knowing where files go' },
              { id: 'r3', text: '`SavingsAccount` reuses and extends `BankAccount`' },
              { id: 'r4', text: '`shape.area()` runs different code for circles and rectangles' },
            ],
          },
          matches: { enc: 'r1', abs: 'r2', inh: 'r3', pol: 'r4' },
          explanation: 'Each pillar answers a different question: who may change state, what callers depend on, how code is reused, and how one call adapts to many types.',
        },
      ],
    },

    // ------------------------------------------------------------------ 2
    {
      slug: 'composition-vs-inheritance',
      title: 'Composition vs inheritance',
      module: 'Object-oriented foundations',
      skill: 'oop',
      minutes: 40,
      objectives: [
        'Tell "is-a" from "has-a" relationships',
        'Explain the fragile base class problem with a concrete example',
        'Refactor an inheritance hierarchy to composition with injected collaborators',
        'Recognise a Liskov substitution violation such as Square extends Rectangle',
      ],
      body: `**Inheritance** shares code by making a class a specialised version of another. **Composition** shares code by giving an object *other objects* that do part of the work. A useful test: if "B **is an** A" is true everywhere, inheritance may fit; if "B **has an** A" or "B **uses an** A" reads better, use composition.

### The fragile base class problem

A subclass depends on its parent's *implementation*, not just its interface. A classic example from Java: you subclass \`HashSet\` to count insertions by overriding both \`add\` and \`addAll\`.

\`\`\`text
CountingSet.addAll([a, b, c])   counts += 3, then calls super.addAll
  HashSet.addAll internally calls add() for each element
    CountingSet.add(...)        counts += 1   (three more times)
result: 6 counted for 3 inserts
\`\`\`

Nothing in \`HashSet\`'s public contract says \`addAll\` uses \`add\`. The subclass broke because of a hidden internal detail, and a future change to the parent could break it again.

### The combination explosion

\`\`\`text
Inheritance:                       Composition:
Notifier                           Notifier --has--> [Channel]
 ├─ EmailNotifier                              Channel: Email | Sms | Slack
 ├─ SmsNotifier
 ├─ EmailAndSmsNotifier   <- one class per combination
 └─ ...
\`\`\`

\`\`\`python
class Notifier:
    def __init__(self, channels):          # inject collaborators
        self.channels = channels

    def notify(self, user, msg):
        for c in self.channels:
            c.send(user, msg)

class FakeChannel:                         # for tests
    def __init__(self): self.sent = []
    def send(self, user, msg): self.sent.append((user, msg))

Notifier([EmailChannel(), SmsChannel()]).notify(user, "Your order shipped")
\`\`\`

A new behaviour is a new \`Channel\` class, combinations are just lists, and tests pass a fake.

### Forwarding instead of inheriting

To extend a class you do not own, wrap it and forward calls:

\`\`\`python
class CountingSet:
    def __init__(self, inner=None):
        self._inner = inner if inner is not None else set()
        self.added = 0
    def add(self, x):
        self.added += 1
        self._inner.add(x)
    def add_all(self, xs):
        for x in xs:
            self.add(x)                    # behaviour we control
    def __contains__(self, x):
        return x in self._inner
\`\`\`

### When inheritance is right

Use it when the subtype truly *is* the base type everywhere and honours its contract (the **Liskov substitution principle**), and the hierarchy is shallow. \`Square extends Rectangle\` fails this test: code that sets width 5 and height 4 expects area 20, but a square must keep its sides equal.

| Prefer inheritance when | Prefer composition when |
|---|---|
| A real is-a relationship that holds for every method | You only want to reuse some code |
| Framework hooks require it (for example a UI widget base class) | Features combine in many ways |
| The hierarchy is one or two levels | You need to swap behaviour at runtime or in tests |

### Common mistakes
- Inheriting just to reuse a helper method.
- Deep hierarchies (more than two levels) where nobody knows which override runs.
- Subclasses that throw "not supported" from inherited methods.
- Overriding a method and relying on how the parent calls it internally.`,
      practice: [
        { title: 'Flatten a hierarchy', kind: 'exercise', prompt: 'A game has Character, FlyingCharacter, SwimmingCharacter and FlyingSwimmingCharacter. Redesign it with composition (movement abilities as objects held in a list) and show how adding "Burrowing" requires no new Character subclass.' },
        { title: 'Reproduce the fragile base class', kind: 'exercise', prompt: 'Write a base class with add(x) and add_all(xs) where add_all calls add. Subclass it to count additions by overriding both methods and show the double count. Then rewrite the counter using composition and forwarding.' },
        { title: 'Inject a fake', kind: 'exercise', prompt: 'Take the Notifier example, write a FakeChannel and a unit test asserting that notify() sends exactly one message per channel.' },
      ],
      resources: [
        { title: 'Composition over inheritance', url: 'https://python-patterns.guide/gang-of-four/composition-over-inheritance/', source: 'Brandon Rhodes, python-patterns.guide', kind: 'article' },
        { title: 'Replace Inheritance with Delegation', url: 'https://refactoring.guru/replace-inheritance-with-delegation', source: 'Refactoring.Guru', kind: 'article' },
        { title: 'Composition over inheritance', url: 'https://en.wikipedia.org/wiki/Composition_over_inheritance', source: 'Wikipedia', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Has-a',
          prompt: 'A `Car` needs an engine that can be petrol, diesel or electric, and swapped in tests. Which design fits best?',
          options: [
            { id: 'a', text: 'PetrolCar, DieselCar and ElectricCar subclasses of Car' },
            { id: 'b', text: 'A Car that holds an Engine object passed to its constructor' },
            { id: 'c', text: 'Engine extends Car' },
          ],
          correct: ['b'],
          explanation: 'A car has an engine. Composition lets you swap engines at runtime and inject a fake in tests.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Fragile base class',
          prompt: 'Changing a base class method can break subclasses that relied on its internal behaviour, even if its public contract is unchanged.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'That is the fragile base class problem: subclasses couple to implementation details, such as whether addAll calls add.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Square and rectangle',
          prompt: 'Why is `Square extends Rectangle` (with independent `set_width` and `set_height`) a problematic design?',
          options: [
            { id: 'a', text: 'Squares have fewer fields, which wastes memory' },
            { id: 'b', text: 'Code that sets width and height independently on a Rectangle gets surprising results when given a Square' },
            { id: 'c', text: 'Python does not allow subclasses to override setters' },
          ],
          correct: ['b'],
          explanation: 'A Square cannot honour the Rectangle contract that width and height change independently, so it cannot safely substitute for one (a Liskov violation).',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Signals for composition',
          prompt: 'Which situations point towards composition rather than inheritance? Select all that apply.',
          options: [
            { id: 'a', text: 'Features combine in many ways (email plus SMS plus Slack)' },
            { id: 'b', text: 'You need to swap an implementation in unit tests' },
            { id: 'c', text: 'You want to reuse one helper from a large unrelated class' },
            { id: 'd', text: 'A framework requires you to extend its base widget class' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Combinations, test doubles and partial reuse all favour composition. Framework extension points are a legitimate reason to inherit.',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'Relationship names',
          prompt: 'Inheritance models an "is-a" relationship; composition models a "____-a" relationship.',
          accepted: [['has', 'has-a']],
          explanation: 'Composition means an object has (or uses) other objects that do part of its work.',
        },
      ],
    },

    // ------------------------------------------------------------------ 3
    {
      slug: 'class-modelling-and-uml',
      title: 'From requirements to classes: modelling and UML',
      module: 'Object-oriented foundations',
      skill: 'oop',
      minutes: 45,
      objectives: [
        'Extract candidate classes and methods from a written requirement',
        'Assign each responsibility to the class that owns the data it needs',
        'Distinguish association, aggregation, composition, inheritance and dependency',
        'Read and sketch a class diagram with multiplicities',
      ],
      body: `Low-level design starts with words, not code. The skill is turning a paragraph of requirements into a small set of classes with clear responsibilities.

### A repeatable process

1. **Underline nouns** in the requirements: they are candidate classes or attributes.
2. **Circle verbs**: they are candidate methods.
3. **Assign responsibilities**: give each behaviour to the class that holds the data it needs (sometimes called the *information expert* rule).
4. **Name relationships** and their multiplicities.
5. **Walk a use case** step by step to check that every step has an owner.

### Worked example: a library

> Members can borrow up to 5 books at a time for 14 days. The library may own several copies of the same book. Returning a book late costs a fee per day.

Nouns: member, book, copy, library, fee, day. Verbs: borrow, return, charge.

The key insight is that **Book** (title, ISBN, author) and **BookCopy** (one physical item with a status) are different things, and that a borrowing is itself a thing with data: a **Loan** with a due date.

\`\`\`text
Library 1 ──── * Book 1 ──── 1..* BookCopy
                                  │ 0..1
Member 1 ──── 0..5 Loan * ────────┘
                     │ uses
                     ▼
                 FeePolicy
\`\`\`

\`\`\`python
from datetime import date, timedelta

class Loan:
    def __init__(self, copy, member, start: date):
        self.copy, self.member = copy, member
        self.due = start + timedelta(days=14)
        self.returned_on: date | None = None

    def is_overdue(self, today: date) -> bool:
        return self.returned_on is None and today > self.due

class Member:
    MAX_LOANS = 5
    def __init__(self, member_id: str):
        self.member_id = member_id
        self.active_loans: list[Loan] = []

    def can_borrow(self) -> bool:
        return len(self.active_loans) < self.MAX_LOANS
\`\`\`

\`Member\` owns the "max 5" rule because it holds the loans; \`Loan\` owns "is it overdue?" because it holds the dates. A separate \`FeePolicy\` keeps pricing swappable.

### Relationship vocabulary

| Relationship | Meaning | Text notation (Mermaid style) | Example |
|---|---|---|---|
| Association | knows about / works with | \`Member --> Loan\` | A member has loans |
| Aggregation | has parts that can exist alone | \`Team o-- Player\` | A player can leave the team |
| Composition | owns parts that die with it | \`Order *-- OrderLine\` | Delete the order, lines go too |
| Inheritance | is-a | \`Account <|-- Savings\` | Savings is an account |
| Dependency | uses briefly (parameter, local) | \`Report ..> Formatter\` | Report calls a formatter |

**Multiplicity** labels each end: \`1\`, \`0..1\`, \`*\` (zero or more), \`1..*\`, or a range such as \`0..5\`.

### Checking with a sequence

Borrow flow: \`Library.checkout(member, isbn)\` finds an available \`BookCopy\`, asks \`member.can_borrow()\`, creates a \`Loan\`, marks the copy as on loan and appends the loan to the member. If any step has no natural owner, your model is missing a class.

### Common mistakes
- Turning every noun into a class, including "System" or "Manager", which become god classes.
- Missing the association object (here, \`Loan\`) and stuffing due dates into \`Book\`.
- Confusing a book (the title) with a copy (the physical item).
- Bidirectional references everywhere, which make objects hard to create and test.
- Drawing far more diagram detail than the code or the conversation needs.`,
      practice: [
        { title: 'Model the library', kind: 'exercise', prompt: 'Extend the library model with reservations: a member can reserve a book when no copy is free, and the first reservation is notified when a copy is returned. Draw the updated class diagram with multiplicities and write the checkout and return methods.' },
        { title: 'Model a food-delivery order', kind: 'exercise', prompt: 'From this requirement, list nouns and verbs, then produce classes and relationships: "Customers place orders containing items from one restaurant. A courier is assigned to deliver each order. Customers can rate the courier and the restaurant." Mark each relationship as association, aggregation or composition.' },
        { title: 'CRC cards', kind: 'exercise', prompt: 'For your food-delivery model, write a Class-Responsibility-Collaborator card for each class: three responsibilities at most per class, and the classes it collaborates with. Merge or split classes that break the limit.' },
      ],
      resources: [
        { title: 'Mermaid: Class diagrams', url: 'https://mermaid.js.org/syntax/classDiagram.html', source: 'Mermaid', kind: 'docs' },
        { title: 'Class diagram', url: 'https://en.wikipedia.org/wiki/Class_diagram', source: 'Wikipedia', kind: 'article' },
        { title: 'System Design Primer: Object-oriented design interview questions', url: 'https://github.com/donnemartin/system-design-primer#object-oriented-design-interview-questions-with-solutions', source: 'System Design Primer (GitHub)', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Book vs copy',
          prompt: 'A library owns three copies of the same title. Where should the "on loan / available" status live?',
          options: [
            { id: 'a', text: 'On the Book, since all copies share a title' },
            { id: 'b', text: 'On each BookCopy, since each physical item can be on loan independently' },
            { id: 'c', text: 'In a global dictionary inside the Library class' },
          ],
          correct: ['b'],
          explanation: 'Status belongs to the physical item. Putting it on Book would make all three copies appear on loan together.',
        },
        {
          key: 'q2',
          type: 'matching',
          title: 'Relationships',
          prompt: 'Match each relationship to an example.',
          pairs: {
            left: [
              { id: 'agg', text: 'Aggregation' },
              { id: 'com', text: 'Composition' },
              { id: 'inh', text: 'Inheritance' },
              { id: 'dep', text: 'Dependency' },
            ],
            right: [
              { id: 'r1', text: 'A team and its players, who can move to another team' },
              { id: 'r2', text: 'An order and its order lines, deleted with the order' },
              { id: 'r3', text: 'A savings account is an account' },
              { id: 'r4', text: 'A report method receives a formatter as a parameter' },
            ],
          },
          matches: { agg: 'r1', com: 'r2', inh: 'r3', dep: 'r4' },
          explanation: 'Aggregation parts outlive the whole, composition parts do not, inheritance is is-a, and a dependency is a short-lived use.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Every noun a class',
          prompt: 'Every noun in the requirements should become its own class.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Nouns are candidates only. Many become attributes (a due date), and vague ones ("system") usually signal a god class.',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'Information expert',
          prompt: 'Which class should own the method `is_overdue(today)`?',
          options: [
            { id: 'a', text: 'Loan, because it holds the due date and return date' },
            { id: 'b', text: 'Library, because it coordinates everything' },
            { id: 'c', text: 'Book, because books are what get returned late' },
          ],
          correct: ['a'],
          explanation: 'Assign behaviour to the class that already holds the data it needs. That keeps logic close to state and avoids a god class.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'Multiplicity',
          prompt: 'In a UML class diagram, the multiplicity meaning "zero or more" is written as ____.',
          accepted: [['*', '0..*']],
          explanation: 'Use `*` (or `0..*`) for zero or more and `1..*` for one or more.',
        },
      ],
    },

    // ------------------------------------------------------------------ 4
    {
      slug: 'solid-principles',
      title: 'SOLID principles',
      module: 'Principles and patterns',
      skill: 'solid-principles',
      minutes: 50,
      objectives: [
        'State each SOLID principle in one sentence',
        'Spot violations of each principle in example code',
        'Refactor a conditional into an open/closed design',
        'Apply dependency inversion and dependency injection to make code testable',
      ],
      body: `SOLID is five guidelines for classes that are cheap to change.

| Letter | Principle | In one line |
|---|---|---|
| S | Single responsibility | A class should have one reason to change. |
| O | Open/closed | Add behaviour by adding code, not by editing working code. |
| L | Liskov substitution | Subtypes must work anywhere their base type is expected. |
| I | Interface segregation | Many small interfaces beat one fat one. |
| D | Dependency inversion | High-level code depends on abstractions; concrete details are injected. |

### S and D: one job each, collaborators injected

\`\`\`python
# Before: one class formats, emails and talks to SMTP directly
class ReportService:
    def send(self, data):
        html = "<table>...</table>"
        smtplib.SMTP("mail.local").sendmail(...)

# After: each piece has one job, and the mailer is injected
class ReportFormatter:
    def to_html(self, data) -> str: ...

class ReportService:
    def __init__(self, formatter, mailer):
        self.formatter, self.mailer = formatter, mailer
    def send(self, data, to):
        self.mailer.send(to, self.formatter.to_html(data))
\`\`\`

A test now passes a \`FakeMailer\`; switching email providers touches one class. *Dependency inversion* is the principle (depend on an abstraction such as "something with \`send\`"); *dependency injection* is the technique (pass it in). Neither needs a framework.

### O: extend without editing

\`\`\`python
# Before: every new discount edits this function
def price(cart, kind):
    if kind == "student": return cart.total * 0.9
    elif kind == "festival": return cart.total - 100
    ...

# After: new discounts are new classes
class Discount(ABC):
    @abstractmethod
    def apply(self, total: float) -> float: ...

class StudentDiscount(Discount):
    def apply(self, total): return total * 0.9

def price(cart, discount: Discount):
    return discount.apply(cart.total)
\`\`\`

### L: honour the contract

A \`ReadOnlyList\` that throws on \`append()\` cannot substitute for a list, and a \`Penguin\` whose \`fly()\` throws cannot substitute for a \`Bird\` that promises flight. Fix the model: split \`FlyingBird\` from \`Bird\`.

### I: small interfaces

\`\`\`text
Before: MultiFunctionDevice { print(), scan(), fax() }
        BasicPrinter must implement scan() and fax() by throwing.
After:  Printer { print() }   Scanner { scan() }   Fax { fax() }
        An office machine implements all three; a basic printer only Printer.
\`\`\`

### Common mistakes
- Applying SOLID mechanically: an interface for every class that has a single implementation.
- Splitting classes so finely that one behaviour is spread across ten files.
- Reading "single responsibility" as "one method per class". It means one *reason to change*, usually one stakeholder or concern.
- Believing dependency injection requires a container or framework. A constructor parameter is enough.`,
      practice: [
        { title: 'Find the violations', kind: 'exercise', prompt: 'Take a class from one of your own projects that is longer than 200 lines. List each responsibility it has, name the SOLID principle it bends, and sketch the split with class names and method signatures.' },
        { title: 'Open/closed discounts', kind: 'exercise', prompt: 'A checkout function has an if/elif for each discount type. Refactor it so a new discount type can be added without editing the checkout function, then add a "buy two, get one free" discount to prove it.' },
        { title: 'Make it testable', kind: 'exercise', prompt: 'Write a WeatherAlert class that calls a real HTTP API inside its method. Refactor it with dependency injection so a unit test can run without the network, and write that test.' },
      ],
      resources: [
        { title: 'SOLID', url: 'https://en.wikipedia.org/wiki/SOLID', source: 'Wikipedia', kind: 'article' },
        { title: 'Refactoring: Code smells', url: 'https://refactoring.guru/refactoring/smells', source: 'Refactoring.Guru', kind: 'article' },
        { title: 'Dependency injection', url: 'https://en.wikipedia.org/wiki/Dependency_injection', source: 'Wikipedia', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'matching',
          title: 'SOLID letters',
          prompt: 'Match each principle to its description.',
          pairs: {
            left: [
              { id: 's', text: 'Single responsibility' },
              { id: 'o', text: 'Open/closed' },
              { id: 'l', text: 'Liskov substitution' },
              { id: 'd', text: 'Dependency inversion' },
            ],
            right: [
              { id: 'r1', text: 'One reason to change' },
              { id: 'r2', text: 'Extend behaviour without modifying existing code' },
              { id: 'r3', text: 'Subtypes can replace their base type safely' },
              { id: 'r4', text: 'High-level code depends on abstractions, not concrete classes' },
            ],
          },
          matches: { s: 'r1', o: 'r2', l: 'r3', d: 'r4' },
          explanation: 'These are four of the five SOLID principles; interface segregation favours small, focused interfaces.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Liskov',
          prompt: 'A `Penguin` subclass of `Bird` throws an error from `fly()`. Which principle does this violate?',
          options: [
            { id: 'a', text: 'Liskov substitution' },
            { id: 'b', text: 'Single responsibility' },
            { id: 'c', text: 'Open/closed' },
          ],
          correct: ['a'],
          explanation: 'Code that calls `bird.fly()` breaks when given a Penguin, so Penguin cannot substitute for Bird. Splitting out a FlyingBird type fixes it.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Fat interface',
          prompt: 'A `BasicPrinter` must implement `scan()` and `fax()` from a `MultiFunctionDevice` interface and does so by throwing errors. Which principle suggests the fix?',
          options: [
            { id: 'a', text: 'Interface segregation: split into Printer, Scanner and Fax interfaces' },
            { id: 'b', text: 'Open/closed: add a new subclass of BasicPrinter' },
            { id: 'c', text: 'Single responsibility: move printing into a helper function' },
          ],
          correct: ['a'],
          explanation: 'Clients should not be forced to depend on methods they do not use. Small interfaces let each device implement only what it supports.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Injection needs a framework',
          prompt: 'Dependency injection requires a dependency-injection framework or container.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Passing a collaborator through the constructor or a parameter is dependency injection. Containers only automate the wiring in large codebases.',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Over-engineering',
          prompt: 'Which are signs of applying SOLID too mechanically? Select all that apply.',
          options: [
            { id: 'a', text: 'An interface for every class, each with exactly one implementation and no test double' },
            { id: 'b', text: 'Following one simple feature requires opening ten tiny classes' },
            { id: 'c', text: 'Extracting a mailer so tests can pass a fake' },
            { id: 'd', text: 'Splitting a 1,500-line class that changes for five unrelated reasons' },
          ],
          correct: ['a', 'b'],
          explanation: 'SOLID aims for code that is cheap to change. Abstractions with no second use and over-fragmentation add cost without benefit; options c and d are sensible refactors.',
        },
      ],
    },

    // ------------------------------------------------------------------ 5
    {
      slug: 'common-design-patterns',
      title: 'Common design patterns',
      module: 'Principles and patterns',
      skill: 'design-patterns',
      minutes: 55,
      objectives: [
        'Describe the problem each of Strategy, Observer, Factory Method, Adapter and Decorator solves',
        'Implement Strategy, Observer and Adapter in a few lines',
        'Use a function-based decorator to add retry or logging behaviour',
        'Recognise when a pattern adds complexity without benefit',
      ],
      body: `A **design pattern** is a named, reusable solution to a recurring design problem. The names let a team discuss designs quickly ("put an adapter around the SDK").

| Pattern | Problem it solves | Everyday example |
|---|---|---|
| Strategy | Swap an algorithm at runtime | Pricing rules, sort comparators, route planners |
| Observer | Notify many listeners of an event | UI events, webhooks, domain events |
| Factory Method | Create objects without hard-coding the class | \`Parser.for_file("a.csv")\` |
| Adapter | Make an incompatible interface fit yours | Wrapping a third-party SDK |
| Decorator | Add behaviour by wrapping, same interface | Logging, caching, retry wrappers |

### Strategy

\`\`\`python
class Checkout:
    def __init__(self, pricing):             # anything with .price(cart)
        self.pricing = pricing
    def total(self, cart):
        return self.pricing.price(cart)

Checkout(BlackFridayPricing()).total(cart)
\`\`\`

In languages with first-class functions a strategy can simply be a function argument: \`sorted(users, key=lambda u: u.age)\`.

### Observer

\`\`\`python
from collections import defaultdict

class EventBus:
    def __init__(self):
        self._handlers = defaultdict(list)
    def subscribe(self, event, handler):
        self._handlers[event].append(handler)
    def publish(self, event, payload):
        for h in self._handlers[event]:
            h(payload)

bus = EventBus()
bus.subscribe("order_placed", send_confirmation_email)
bus.subscribe("order_placed", reserve_inventory)
bus.publish("order_placed", {"order_id": 42})
\`\`\`

The order service does not know who listens, so new reactions do not change it.

### Factory Method

\`\`\`python
class Parser:
    @staticmethod
    def for_file(name: str) -> "Parser":
        if name.endswith(".csv"): return CsvParser()
        if name.endswith(".json"): return JsonParser()
        raise ValueError(f"unsupported file: {name}")
\`\`\`

Callers ask for "a parser for this file" and never name concrete classes. The single \`if\` chain lives in one place.

### Adapter

\`\`\`python
class PaymentGateway(ABC):                      # your interface
    @abstractmethod
    def charge(self, amount_cents: int, token: str) -> str: ...

class AcmePayAdapter(PaymentGateway):
    def __init__(self, client):                 # third-party SDK
        self.client = client
    def charge(self, amount_cents, token):
        resp = self.client.create_payment(value=amount_cents / 100, source=token)
        return resp["payment_id"]
\`\`\`

### Decorator

\`\`\`python
import functools, time

def retry(times=3, delay=0.2):
    def wrap(fn):
        @functools.wraps(fn)
        def inner(*args, **kwargs):
            for attempt in range(times):
                try:
                    return fn(*args, **kwargs)
                except ConnectionError:
                    if attempt == times - 1: raise
                    time.sleep(delay * 2 ** attempt)
        return inner
    return wrap

@retry(times=3)
def fetch_user(uid): ...
\`\`\`

### Common mistakes
- Reaching for patterns before the problem exists. Start simple and refactor towards a pattern when duplication or change pressure appears.
- Singletons used as hidden global state, which makes tests order-dependent.
- Observers that throw and stop the remaining handlers from running, or that run slow work synchronously.
- Naming every class \`SomethingFactoryManager\`. Name things after what they do.`,
      practice: [
        { title: 'Strategy in practice', kind: 'exercise', prompt: 'Implement a ride-fare calculator where the fare strategy (standard, surge multiplier, flat airport rate) is chosen at runtime. Add a new "night" strategy without changing existing classes, and test each strategy.' },
        { title: 'Observer in practice', kind: 'exercise', prompt: 'Build an event bus with subscribe(event, handler) and publish(event, payload). Use it so that placing an order sends an email and updates inventory without OrderService knowing about either. Then make publish keep calling other handlers when one raises an exception.' },
        { title: 'Adapter for two SDKs', kind: 'exercise', prompt: 'Two SMS providers expose send_sms(to, body) and post_message(recipient=..., text=...). Define your own SmsSender interface and write an adapter for each so the rest of the code never imports a provider SDK.' },
      ],
      resources: [
        { title: 'Design Patterns catalog', url: 'https://refactoring.guru/design-patterns/catalog', source: 'Refactoring.Guru', kind: 'article' },
        { title: 'Strategy pattern', url: 'https://refactoring.guru/design-patterns/strategy', source: 'Refactoring.Guru', kind: 'article' },
        { title: 'Observer pattern', url: 'https://refactoring.guru/design-patterns/observer', source: 'Refactoring.Guru', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Pick the pattern',
          prompt: 'Your code must call a payment SDK whose method names and argument shapes differ from your own `PaymentGateway` interface. Which pattern fits?',
          options: [
            { id: 'a', text: 'Adapter' },
            { id: 'b', text: 'Observer' },
            { id: 'c', text: 'Strategy' },
          ],
          correct: ['a'],
          explanation: 'An Adapter wraps the SDK and translates calls into the interface your code expects.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Decorator',
          prompt: 'You want to add caching and logging around an existing `fetch_user` function without editing it. Which pattern is this?',
          options: [
            { id: 'a', text: 'Factory Method' },
            { id: 'b', text: 'Decorator' },
            { id: 'c', text: 'Singleton' },
          ],
          correct: ['b'],
          explanation: 'A Decorator wraps an object or function with the same interface and adds behaviour before or after delegating.',
        },
        {
          key: 'q3',
          type: 'matching',
          title: 'Problem to pattern',
          prompt: 'Match each problem to the pattern that addresses it.',
          pairs: {
            left: [
              { id: 'p1', text: 'Choose between several pricing algorithms at runtime' },
              { id: 'p2', text: 'Several services must react when an order is placed' },
              { id: 'p3', text: 'Create the right parser from a file name without callers naming classes' },
              { id: 'p4', text: 'Add retries around an HTTP call without changing it' },
            ],
            right: [
              { id: 'r1', text: 'Strategy' },
              { id: 'r2', text: 'Observer' },
              { id: 'r3', text: 'Factory Method' },
              { id: 'r4', text: 'Decorator' },
            ],
          },
          matches: { p1: 'r1', p2: 'r2', p3: 'r3', p4: 'r4' },
          explanation: 'Strategy swaps algorithms, Observer fans out events, Factory Method hides construction, Decorator wraps behaviour.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Observer coupling',
          prompt: 'With the Observer pattern, the publisher must know the concrete classes of all its listeners.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'The publisher only knows the subscription interface. That is why new listeners can be added without changing it.',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'Singleton risk',
          prompt: 'What is the main design risk of using Singletons for things like a database connection?',
          options: [
            { id: 'a', text: 'They use more memory than normal objects' },
            { id: 'b', text: 'They act as hidden global state, making dependencies invisible and tests harder to isolate' },
            { id: 'c', text: 'They cannot have methods' },
          ],
          correct: ['b'],
          explanation: 'Code reaches the singleton from anywhere, so dependencies are not visible in signatures and tests leak state into each other. Passing the dependency in avoids this.',
          difficulty: 'medium',
        },
      ],
    },

    // ------------------------------------------------------------------ 6
    {
      slug: 'design-lru-cache',
      title: 'Design an LRU cache',
      module: 'Design case studies',
      skill: 'low-level-design',
      minutes: 60,
      milestone: true,
      completionCriteria: 'Implement an LRU cache with O(1) get and put, plus tests covering eviction order and updates to existing keys.',
      objectives: [
        'Clarify the interface and eviction rule of an LRU cache',
        'Combine a hash map and a doubly linked list for O(1) get and put',
        'Handle edge cases: capacity 1, updating an existing key, missing keys',
        'Discuss thread safety and TTL extensions',
      ],
      body: `### 1. Clarify

A fixed-capacity key-value cache. \`get(key)\` returns the value (or -1 if absent) and marks the key as recently used. \`put(key, value)\` inserts or updates and also marks the key as recently used; when the cache is over capacity, evict the **least recently used** key. Both operations must be **O(1)**. Ask: what does \`get\` return on a miss? Is capacity always at least 1? Is it used from several threads?

### 2. Choose the data structures

A hash map gives O(1) lookup but no order. A doubly linked list keeps usage order and lets you move or remove a *known* node in O(1). Together:

\`\`\`text
map: { k1 -> node1, k2 -> node2, k3 -> node3 }

head <-> [k3] <-> [k1] <-> [k2] <-> tail
        most recent         least recent (evict this)
\`\`\`

| Operation | Map | List |
|---|---|---|
| get hit | find node | unlink, insert after head |
| put new | add entry | insert after head; if over capacity, remove node before tail and delete its key |
| put existing | find node | update value, move to front |

### 3. Implement

\`\`\`python
class Node:
    def __init__(self, k=0, v=0):
        self.k, self.v, self.prev, self.next = k, v, None, None

class LRUCache:
    def __init__(self, capacity: int):
        self.cap, self.map = capacity, {}
        self.head, self.tail = Node(), Node()      # sentinels avoid null checks
        self.head.next, self.tail.prev = self.tail, self.head

    def _remove(self, n):
        n.prev.next, n.next.prev = n.next, n.prev

    def _add_front(self, n):
        n.next, n.prev = self.head.next, self.head
        self.head.next.prev = n
        self.head.next = n

    def get(self, k):
        if k not in self.map:
            return -1
        n = self.map[k]
        self._remove(n); self._add_front(n)
        return n.v

    def put(self, k, v):
        if k in self.map:
            self._remove(self.map[k])
        n = Node(k, v)
        self.map[k] = n
        self._add_front(n)
        if len(self.map) > self.cap:
            lru = self.tail.prev
            self._remove(lru)
            del self.map[lru.k]
\`\`\`

The node stores its key so eviction can delete it from the map. Sentinel head and tail nodes mean \`_remove\` and \`_add_front\` never deal with empty-list special cases. In Python, \`collections.OrderedDict\` with \`move_to_end(k)\` and \`popitem(last=False)\` gives the same behaviour in a few lines; interviewers usually want the manual version first.

### 4. Test the edge cases

Trace capacity 2: \`put(1)\`, \`put(2)\`, \`get(1)\` (order now 1, 2), \`put(3)\` evicts 2. With capacity 1, every new key evicts the previous one. Calling \`put(1, "b")\` on an existing key must update the value *and* refresh recency without growing the size.

### 5. Extend

- **Concurrency:** wrap \`get\` and \`put\` in one lock (note that \`get\` mutates the list, so it needs the lock too), or shard the cache by \`hash(key) % n\` with one lock per shard for higher throughput.
- **TTL:** store an expiry time in each node and treat expired entries as misses.
- **LFU** instead of LRU when popularity matters more than recency; **metrics** for hit rate.

### Common mistakes
- Using a list and \`list.remove\`, which is O(n).
- Forgetting to move a key to the front on \`get\`.
- Not updating the value (or creating a duplicate node) when \`put\` is called on an existing key.
- Evicting before inserting and accidentally evicting the key being updated.
- Treating \`get\` as read-only and skipping the lock in a concurrent cache.`,
      practice: [
        { title: 'Warm-up: pointer manipulation', kind: 'problem', ref: 'reverse-linked-list' },
        { title: 'Implement and test', kind: 'exercise', prompt: 'Implement LRUCache(capacity) with get and put in your language of choice without using an ordered-map library. Write tests for: eviction of the least recently used key, get refreshing recency, put updating an existing key, and capacity 1.' },
        { title: 'Make it thread-safe', kind: 'exercise', prompt: 'Explain where races occur if two threads call put at once, add locking, and discuss the throughput trade-off of one global lock versus a cache sharded into 16 independently locked parts.' },
        { title: 'Add a TTL', kind: 'exercise', prompt: 'Extend the cache with put(key, value, ttl_seconds). Expired entries must behave like misses. Decide whether expired entries are removed lazily on access, by a background sweep, or both, and justify the choice.' },
      ],
      resources: [
        { title: 'System Design Primer: LRU cache (object-oriented design solution)', url: 'https://github.com/donnemartin/system-design-primer/tree/master/solutions/object_oriented_design/lru_cache', source: 'System Design Primer (GitHub)', kind: 'article' },
        { title: 'collections.OrderedDict', url: 'https://docs.python.org/3/library/collections.html#collections.OrderedDict', source: 'Python Software Foundation', kind: 'docs' },
        { title: 'Cache replacement policies', url: 'https://en.wikipedia.org/wiki/Cache_replacement_policies', source: 'Wikipedia', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Data structures',
          prompt: 'Which combination gives O(1) `get` and `put` for an LRU cache?',
          options: [
            { id: 'a', text: 'Hash map + doubly linked list' },
            { id: 'b', text: 'Array sorted by last access time' },
            { id: 'c', text: 'Min-heap keyed by access time' },
          ],
          correct: ['a'],
          explanation: 'The map finds the node in O(1); the doubly linked list moves or removes it in O(1). A heap needs O(log n) per update.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Eviction',
          prompt: 'Capacity 2. Calls: put(1), put(2), get(1), put(3). Which key is evicted?',
          options: [
            { id: 'a', text: '1' },
            { id: 'b', text: '2' },
            { id: 'c', text: '3' },
          ],
          correct: ['b'],
          explanation: 'get(1) makes key 1 the most recent, so key 2 is least recently used when 3 arrives.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Node keys',
          prompt: 'Each linked-list node should store its key, not just its value.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'When evicting the tail node, you need its key to delete the entry from the hash map.',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'Trace with updates',
          prompt: 'Capacity 2. Calls: put(1, "a"), put(2, "b"), put(1, "c"), put(3, "d"). What does get(1) return afterwards?',
          options: [
            { id: 'a', text: '"a"' },
            { id: 'b', text: '"c"' },
            { id: 'c', text: '-1, because key 1 was evicted' },
          ],
          correct: ['b'],
          explanation: 'put(1, "c") updates the value and makes key 1 most recent, so key 2 is evicted when 3 arrives. Key 1 holds "c".',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Concurrency',
          prompt: 'In a multi-threaded LRU cache, which operations need synchronisation? Select all that apply.',
          options: [
            { id: 'a', text: '`put`, because it changes the map and the list' },
            { id: 'b', text: '`get`, because it moves the node to the front of the list' },
            { id: 'c', text: 'Neither, because dictionary operations are always atomic' },
          ],
          correct: ['a', 'b'],
          explanation: 'Both operations mutate the linked list. Two unsynchronised moves can corrupt the prev/next pointers even if each map operation is atomic.',
          difficulty: 'hard',
        },
      ],
    },

    // ------------------------------------------------------------------ 7
    {
      slug: 'design-parking-lot',
      title: 'Design a parking lot',
      module: 'Design case studies',
      skill: 'low-level-design',
      minutes: 70,
      milestone: true,
      completionCriteria: 'Produce a class diagram and working code for park, leave and fee calculation, with tests for full-lot and wrong-size cases.',
      objectives: [
        'Turn a vague prompt into explicit requirements and assumptions',
        'Identify classes, responsibilities and relationships',
        'Keep fee calculation and spot allocation swappable with Strategy',
        'Discuss concurrency when two cars claim the same spot',
      ],
      body: `Low-level design interviews reward a clear process more than a perfect answer: **clarify, identify objects, define interfaces, implement core flows, then extend.**

### 1. Clarify and write down assumptions

Multiple levels? Vehicle sizes (motorcycle, car, bus)? Can a small vehicle use a larger spot? How are fees computed? Do we need payment, displays, reservations? For this lesson: several levels; sizes SMALL < MEDIUM < LARGE; a vehicle may use any spot at least its size; hourly fee rounded up to the next hour; payment is out of scope.

### 2. Identify classes

\`\`\`text
ParkingLot 1 ──< Level 1 ──< Spot (id, size, vehicle?)
     │
     ├── SpotAllocator  (strategy: nearest-first, fill lower levels first)
     ├── FeeCalculator  (strategy: hourly, flat, weekend)
     └── active: map ticket_id -> Ticket(vehicle, spot, entry_time)

Vehicle (plate, size)       VehicleSize: SMALL | MEDIUM | LARGE
\`\`\`

### 3. Define interfaces and implement

\`\`\`python
import math, uuid
from enum import IntEnum
from datetime import datetime

class VehicleSize(IntEnum):
    SMALL = 1
    MEDIUM = 2
    LARGE = 3

class Spot:
    def __init__(self, spot_id: str, size: VehicleSize):
        self.id, self.size, self.vehicle = spot_id, size, None
    def fits(self, vehicle) -> bool:
        return self.vehicle is None and vehicle.size <= self.size

class LotFull(Exception): pass

class FirstFitAllocator:
    def find(self, levels, vehicle):
        for level in levels:
            for spot in level.spots:
                if spot.fits(vehicle):
                    return spot
        return None

class HourlyFee:
    def __init__(self, rate_per_hour: int):
        self.rate = rate_per_hour
    def fee(self, entry: datetime, exit: datetime) -> int:
        hours = math.ceil((exit - entry).total_seconds() / 3600)
        return max(1, hours) * self.rate

class ParkingLot:
    def __init__(self, levels, allocator, fees):
        self.levels, self.allocator, self.fees = levels, allocator, fees
        self.active = {}

    def park(self, vehicle, now: datetime):
        spot = self.allocator.find(self.levels, vehicle)
        if spot is None:
            raise LotFull(vehicle.plate)
        spot.vehicle = vehicle
        ticket = Ticket(str(uuid.uuid4()), vehicle, spot, now)
        self.active[ticket.id] = ticket
        return ticket

    def leave(self, ticket_id: str, now: datetime) -> int:
        ticket = self.active.pop(ticket_id)        # KeyError for unknown tickets
        ticket.spot.vehicle = None
        return self.fees.fee(ticket.entry_time, now)
\`\`\`

\`ParkingLot\` coordinates; \`Spot\` knows whether a vehicle fits; the allocator and fee calculator are injected strategies, so changing pricing never touches \`park\` or \`leave\`. A 2 hour 10 minute stay at 3 per hour costs \`ceil(2.17) * 3 = 9\`.

### 4. Extend

- **Concurrency:** two entry gates may pick the same free spot. Guard \`find\` plus assignment with one lock, or claim spots with an atomic compare-and-set. In a database, a unique constraint on active spot assignments rejects the second claim.
- **Displays:** an Observer on spot state changes updates "Level 2: 14 free" boards.
- **Electric-vehicle spots:** add a spot feature and a new fee strategy; the core flow should not change.

### Common mistakes
- Jumping into code before agreeing requirements.
- One god class \`ParkingLot\` that allocates, prices, prints tickets and talks to hardware.
- Hard-coding pricing inside \`leave\`.
- Ignoring the "lot full", "vehicle too big" and "unknown ticket" paths.
- Using floats for money; use integer minor units (cents or paise).`,
      practice: [
        { title: 'Build it', kind: 'exercise', prompt: 'Implement ParkingLot, Level, Spot, Vehicle, Ticket, an allocator and an hourly fee calculator. Write tests for parking until full, a bus that fits nowhere, an unknown ticket on leave, and the fee for a 2.5-hour stay rounded up to 3 hours.' },
        { title: 'Change request', kind: 'exercise', prompt: 'Product now wants electric-vehicle spots with chargers and a per-kWh fee. Show which classes change and which do not. If more than two existing classes change, revisit your design.' },
        { title: 'Two gates, one spot', kind: 'exercise', prompt: 'Write a test that starts two threads calling park() at the same time when exactly one spot is free. Show the bug without a lock (both succeed), then fix it and explain where the lock boundary must be.' },
      ],
      resources: [
        { title: 'System Design Primer: Parking lot (object-oriented design solution)', url: 'https://github.com/donnemartin/system-design-primer/tree/master/solutions/object_oriented_design/parking_lot', source: 'System Design Primer (GitHub)', kind: 'article' },
        { title: 'Strategy pattern', url: 'https://refactoring.guru/design-patterns/strategy', source: 'Refactoring.Guru', kind: 'article' },
        { title: 'enum: Support for enumerations', url: 'https://docs.python.org/3/library/enum.html', source: 'Python Software Foundation', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'First step',
          prompt: 'What should you do first in a low-level design interview for a parking lot?',
          options: [
            { id: 'a', text: 'Start writing the ParkingLot class' },
            { id: 'b', text: 'Ask clarifying questions and state assumptions about vehicles, spots and pricing' },
            { id: 'c', text: 'Choose a database' },
          ],
          correct: ['b'],
          explanation: 'Requirements drive every later decision, and interviewers explicitly look for this step.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Pricing changes',
          prompt: 'Pricing rules change often (hourly, weekend, event rates). How should fee calculation be modelled?',
          options: [
            { id: 'a', text: 'An if/else chain inside ParkingLot.leave()' },
            { id: 'b', text: 'A FeeCalculator interface with interchangeable implementations (Strategy)' },
            { id: 'c', text: 'A subclass of ParkingLot per pricing rule' },
          ],
          correct: ['b'],
          explanation: 'Strategy isolates the part that varies, so new pricing is a new class rather than an edit to the core flow.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Fee rounding',
          prompt: 'The hourly rate is 3 and partial hours are rounded up. A car stays 2 hours 10 minutes. What is the fee?',
          options: [
            { id: 'a', text: '6' },
            { id: 'b', text: '7' },
            { id: 'c', text: '9' },
          ],
          correct: ['c'],
          explanation: '2 hours 10 minutes rounds up to 3 hours, and 3 x 3 = 9.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Race on a spot',
          prompt: 'If two gates each check `spot.fits(vehicle)` and then assign the spot without any synchronisation, both cars can be assigned the same spot.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Check-then-act is a race: both checks can pass before either assignment happens. The check and the assignment must be one atomic step.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Responsibilities',
          prompt: 'Which responsibilities belong outside the `ParkingLot` class in a clean design? Select all that apply.',
          options: [
            { id: 'a', text: 'Computing the fee for a stay' },
            { id: 'b', text: 'Choosing which free spot to assign' },
            { id: 'c', text: 'Deciding whether a vehicle fits a given spot' },
            { id: 'd', text: 'Coordinating park and leave' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Fees and allocation are swappable strategies, and fit belongs to Spot, which holds size and occupancy. ParkingLot coordinates the flow.',
        },
      ],
    },

    // ------------------------------------------------------------------ 8
    {
      slug: 'design-vending-machine',
      title: 'Design a vending machine with the State pattern',
      module: 'Design case studies',
      skill: 'low-level-design',
      minutes: 60,
      objectives: [
        'Model a device as a finite-state machine with a transition table',
        'Implement the State pattern so each state handles its own events',
        'Handle money with integer minor units and compute change',
        'Cover failure and cancel paths, not just the happy path',
      ],
      body: `Many design prompts describe something whose correct behaviour depends on *what has happened so far*: a vending machine, an elevator, a traffic light, an order lifecycle. Model these as a **finite-state machine** first, then implement with the **State pattern**.

### 1. Clarify

The machine sells products from numbered slots. A customer selects a product, inserts coins, receives the product and change, or cancels and gets a refund. An operator can restock and take the machine out of service. Prices and coins are in integer cents.

### 2. Draw the transition table

| State | Event | Next state | Action |
|---|---|---|---|
| Idle | select(slot) | HasSelection | remember slot, show price |
| Idle | insert(coin) | Idle | return coin ("select first") |
| HasSelection | insert(coin) | HasSelection or Dispensing | add to balance; dispense when paid |
| HasSelection | cancel | Idle | refund balance |
| Dispensing | product released | Idle | return change |
| Dispensing | insert(coin) | Dispensing | return coin |
| any | out of stock / fault | OutOfService | refund balance |

Writing the table exposes questions early: what if the selected slot is empty? What if exact change is impossible?

### 3. Implement the State pattern

\`\`\`python
class State:
    def select(self, m, slot): m.display("Busy, please wait")
    def insert(self, m, cents): m.return_coins(cents)
    def cancel(self, m): pass

class Idle(State):
    def select(self, m, slot):
        if m.stock[slot] == 0:
            m.display("Sold out"); return
        m.slot = slot
        m.state = HasSelection()

class HasSelection(State):
    def insert(self, m, cents):
        m.balance += cents
        price = m.prices[m.slot]
        if m.balance >= price:
            m.state = Dispensing()
            m.dispense(m.slot, change=m.balance - price)
    def cancel(self, m):
        m.return_coins(m.balance)
        m.balance, m.slot = 0, None
        m.state = Idle()

class Dispensing(State):
    pass        # defaults: reject coins and selections

class VendingMachine:
    def __init__(self, prices, stock):
        self.prices, self.stock = prices, stock
        self.state, self.balance, self.slot = Idle(), 0, None
    def select(self, slot): self.state.select(self, slot)
    def insert(self, cents): self.state.insert(self, cents)
    def cancel(self): self.state.cancel(self)
\`\`\`

\`dispense\` releases the product, decrements stock, returns change, resets the balance and sets the state back to \`Idle\`. Each state class answers only the events that matter to it; the base class supplies safe defaults. Adding a "card payment pending" state means adding one class, not editing every method.

### 4. Money and change

Store money as **integer cents**: \`0.1 + 0.2\` is not exactly \`0.3\` in binary floating point. For change, a greedy algorithm (largest coin first) is optimal for typical coin systems such as 1, 2, 5, 10, 20, 50, but not for every coin set: with coins 1, 3 and 4, greedy pays 6 as 4 + 1 + 1 instead of 3 + 3. Also track the coins the machine actually holds; if change cannot be made, refuse the sale before dispensing.

### Common mistakes
- One big \`if state == "idle" ... elif ...\` block repeated in every method; the State pattern keeps each state's rules together.
- Only designing the happy path: forgetting cancel, sold out, jammed product and no-change cases.
- Using floats for prices and balances.
- Mutating the balance in one place and the state in another, so a crash in between leaves them inconsistent.`,
      practice: [
        { title: 'Build the machine', kind: 'exercise', prompt: 'Implement the vending machine with Idle, HasSelection, Dispensing and OutOfService states. Write tests for: exact payment, overpayment with change, cancel with refund, coins inserted before selection, and selecting a sold-out slot.' },
        { title: 'Make change safely', kind: 'exercise', prompt: 'Add a coin inventory. Before dispensing, check that change can be made from the coins actually held; if not, refund and show "Exact change only". Explain why greedy works for your coin set and give a coin set where it fails.' },
        { title: 'Another state machine', kind: 'exercise', prompt: 'Design an online order lifecycle (created, paid, packed, shipped, delivered, cancelled, refunded) as a transition table. Mark which transitions are illegal, and show how your code rejects them.' },
      ],
      resources: [
        { title: 'State pattern', url: 'https://refactoring.guru/design-patterns/state', source: 'Refactoring.Guru', kind: 'article' },
        { title: 'Finite-state machine', url: 'https://en.wikipedia.org/wiki/Finite-state_machine', source: 'Wikipedia', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Which pattern',
          prompt: 'A vending machine reacts differently to `insert(coin)` depending on whether a product has been selected or is being dispensed. Which pattern organises this best?',
          options: [
            { id: 'a', text: 'State' },
            { id: 'b', text: 'Adapter' },
            { id: 'c', text: 'Factory Method' },
          ],
          correct: ['a'],
          explanation: 'The State pattern puts each state\'s behaviour in its own class, so the machine delegates events to its current state.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Floats for money',
          prompt: 'Storing prices as floating-point numbers such as 0.10 is safe because the machine only adds and subtracts.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Many decimal amounts have no exact binary representation, so sums drift (0.1 + 0.2 is 0.30000000000000004). Use integer minor units.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Greedy change',
          prompt: 'The machine has coins of 1, 3 and 4 and must return 6. What does a largest-coin-first greedy algorithm return?',
          options: [
            { id: 'a', text: '3 + 3 (two coins)' },
            { id: 'b', text: '4 + 1 + 1 (three coins)' },
            { id: 'c', text: 'It cannot make 6' },
          ],
          correct: ['b'],
          explanation: 'Greedy takes 4 first, then 1 and 1. The optimal answer is 3 + 3, so greedy is not optimal for every coin system.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Paths to cover',
          prompt: 'Which scenarios should a complete vending machine design handle? Select all that apply.',
          options: [
            { id: 'a', text: 'The customer cancels after inserting coins' },
            { id: 'b', text: 'The selected slot is empty' },
            { id: 'c', text: 'The machine cannot make change' },
            { id: 'd', text: 'Coins are inserted while a product is being dispensed' },
          ],
          correct: ['a', 'b', 'c', 'd'],
          explanation: 'All four are realistic. Interviewers look for failure and cancel paths as much as the happy path.',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'Money representation',
          prompt: 'To avoid rounding errors, store money as an integer number of the smallest currency unit, for example ____ for US dollars.',
          accepted: [['cents', 'cent']],
          explanation: 'Integer cents (or paise, or pence) make addition and comparison exact.',
        },
      ],
    },
  ],
};

// ============================================================================
// System design fundamentals
// ============================================================================

export const systemDesign: SeedTrack = {
  slug: 'system-design-fundamentals',
  title: 'System Design Fundamentals',
  category: 'system-design',
  summary: 'Learn the building blocks of scalable systems (load balancers, caches, replicated and sharded databases, queues) and how to combine them under real constraints.',
  description: `**Who it's for:** backend and full-stack developers moving towards senior roles, and candidates preparing for system design interviews.

**Prerequisites:** HTTP and REST basics, SQL basics, and some experience building a web service. The *SQL and Database Design* track is recommended first.

**You will be able to:**
- turn a vague product idea into functional and non-functional requirements with back-of-the-envelope estimates
- place load balancers, caches, databases and queues and justify each one with numbers
- choose between relational, key-value, document, search and object storage for each kind of data
- reason about replication, sharding, consistency and availability trade-offs
- walk through complete designs (a URL shortener and a distributed rate limiter) at interview depth, including failure modes

**How each lesson works:** request-flow diagrams, worked estimates and trade-off tables, a "Common mistakes" section, written design exercises and a short graded quiz.

**Milestone:** *Design a URL shortener* (topic 8).`,
  level: 'intermediate',
  estimatedHours: 28,
  roles: ['backend developer', 'full-stack developer', 'software engineer', 'devops engineer', 'solutions architect'],
  contentStatus: 'complete',
  prerequisites: ['sql-database-design'],
  topics: [
    // ------------------------------------------------------------------ 1
    {
      slug: 'requirements-and-estimation',
      title: 'Requirements and back-of-the-envelope estimation',
      module: 'Foundations',
      skill: 'system-design-basics',
      minutes: 45,
      objectives: [
        'Follow a repeatable structure for any design discussion',
        'Separate functional from non-functional requirements',
        'Estimate requests per second, storage and bandwidth from user numbers',
        'Use latency numbers to judge which designs are feasible',
      ],
      body: `Every design starts with **what** the system must do and **how well**. Skipping this step is the most common reason designs (and interviews) go wrong.

### A repeatable structure

1. **Clarify requirements** and scope (5 minutes in an interview).
2. **Estimate** traffic, storage and bandwidth.
3. **Define the API** and the **data model**.
4. **Draw the high-level design**: clients, load balancer, services, data stores.
5. **Deep dive** into the hardest one or two parts.
6. **Find bottlenecks and failure modes**, and say how you would monitor them.

### Functional vs non-functional

- **Functional:** what users can do. "Users can shorten a URL", "users can view a feed".
- **Non-functional:** how well. Availability (99.9%?), latency (p99 under 200 ms?), durability, consistency, cost, read/write ratio, data retention, compliance.

Non-functional requirements decide the architecture. "Show a like count" is easy; "show an exact like count to a billion users within 100 ms" is a different system.

### Estimation toolkit

A day has **86,400 s**, roughly **10^5** seconds. Powers of two map to units: 2^10 ≈ a thousand (KB), 2^20 ≈ a million (MB), 2^30 ≈ a billion (GB), 2^40 ≈ a trillion (TB).

Worked example: a notes service with 100 M new notes per month and a 100:1 read/write ratio.

\`\`\`text
writes:   100e6 / (30 * 86,400) ≈ 40 / s average, plan ~100 / s peak (2-3x)
reads:    100 x 40 ≈ 4,000 / s average, ~10,000 / s peak
storage:  100e6 * 500 bytes ≈ 50 GB / month ≈ 3 TB over 5 years
          x 3 replicas ≈ 9 TB of disk
egress:   4,000 reads/s * 500 bytes ≈ 2 MB/s (tiny)
\`\`\`

Conclusion: one well-indexed database handles the writes; reads at 10,000 per second suggest a cache or read replicas; storage fits comfortably on a few machines. Numbers turn opinions into decisions.

### Latency intuition (orders of magnitude)

\`\`\`text
L1 cache reference              ~1 ns
main memory reference           ~100 ns
SSD random read                 ~100 µs
round trip within a datacentre  ~0.5 ms
HDD disk seek                   ~10 ms
round trip across continents    ~150 ms
\`\`\`

A page that makes 20 sequential cross-continent calls cannot load in under a second. Memory is about 1,000 times faster than an SSD read, which is why caches matter.

### Common mistakes
- Designing before agreeing scope, then solving the wrong problem.
- False precision: say "about 40 per second", not "38.58".
- Planning for average traffic and ignoring peaks.
- Forgetting replication, indexes and backups when estimating storage.
- Treating every non-functional requirement as "maximum": state concrete targets.`,
      practice: [
        { title: 'Estimate a photo app', kind: 'exercise', prompt: '10 million daily active users each upload 2 photos (average 2 MB) and view 50 per day. Estimate upload and view requests per second (average and peak), daily new storage with 3 replicas, and egress bandwidth. State every assumption, then say which number most shapes the design.' },
        { title: 'Requirements interview', kind: 'exercise', prompt: 'For "design a ride-hailing app", write five functional and five non-functional requirements with concrete targets (for example, "driver location updates every 4 seconds; p99 match time under 10 seconds"). Mark which two drive the architecture most.' },
      ],
      resources: [
        { title: 'System Design Primer (start here)', url: 'https://github.com/donnemartin/system-design-primer', source: 'System Design Primer (GitHub)', kind: 'article' },
        { title: 'System Design Primer: Back-of-the-envelope calculations', url: 'https://github.com/donnemartin/system-design-primer#appendix', source: 'System Design Primer (GitHub)', kind: 'cheatsheet' },
        { title: 'Latency numbers every programmer should know', url: 'https://gist.github.com/jboner/2841832', source: 'Jonas Bonér (GitHub Gist)', kind: 'cheatsheet' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Requests per second',
          prompt: 'Roughly how many writes per second is 8.6 million writes per day, on average?',
          options: [
            { id: 'a', text: '~10' },
            { id: 'b', text: '~100' },
            { id: 'c', text: '~1,000' },
          ],
          correct: ['b'],
          explanation: '8.6e6 / 86,400 s ≈ 100 writes per second on average; plan for a higher peak.',
        },
        {
          key: 'q2',
          type: 'multi',
          title: 'Non-functional requirements',
          prompt: 'Which are non-functional requirements? Select all that apply.',
          options: [
            { id: 'a', text: '99.95% availability' },
            { id: 'b', text: 'Users can delete their account' },
            { id: 'c', text: 'p99 latency under 300 ms' },
            { id: 'd', text: 'Data is retained for 7 years' },
          ],
          correct: ['a', 'c', 'd'],
          explanation: 'Availability, latency and retention describe how well the system behaves. Deleting an account is a feature (functional).',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Storage estimate',
          prompt: '1 million new records per day, 1 KB each, kept for 3 years with 3 replicas. Roughly how much disk is needed?',
          options: [
            { id: 'a', text: 'About 3 GB' },
            { id: 'b', text: 'About 3 TB' },
            { id: 'c', text: 'About 3 PB' },
          ],
          correct: ['b'],
          explanation: '1 GB per day x ~1,100 days ≈ 1.1 TB, x 3 replicas ≈ 3.3 TB.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Seconds per day',
          prompt: 'A day has about ____ seconds (write the number).',
          accepted: [['86400', '86,400', '86 400']],
          explanation: '24 x 60 x 60 = 86,400, close to 10^5, which makes quick division easy.',
        },
        {
          key: 'q5',
          type: 'true_false',
          title: 'Plan for peaks',
          prompt: 'Capacity should be planned for average traffic, because peaks are short.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Systems fail at peak. Plan for peak load (often 2-10x average) plus headroom, and use autoscaling or queues to absorb bursts.',
        },
      ],
    },

    // ------------------------------------------------------------------ 2
    {
      slug: 'load-balancing-and-apis',
      title: 'Load balancing and API design at scale',
      module: 'Foundations',
      skill: 'system-design-basics',
      minutes: 50,
      objectives: [
        'Explain why stateless services scale horizontally',
        'Compare round robin, least connections and hashing strategies',
        'Distinguish layer 4 from layer 7 load balancing',
        'Design APIs with cursor pagination, idempotency keys and rate limiting',
      ],
      body: `To serve more traffic you either buy a bigger machine (**vertical scaling**) or add more machines (**horizontal scaling**). Vertical scaling is simple but has a ceiling and a single point of failure. Horizontal scaling needs a **load balancer** and **stateless** application servers.

### Request flow

\`\`\`text
clients ──> DNS ──> Load balancer ──┬──> app-1 ─┐
                    (TLS, health    ├──> app-2 ─┼──> cache / database
                     checks)        └──> app-3 ─┘
\`\`\`

**Stateless** means no request depends on data stored in one server's memory. Session data lives in a shared store (Redis, the database) or in a signed token, so any server can handle any request, and servers can be added, removed or replaced freely. Health checks (\`GET /healthz\` every few seconds) take failing servers out of rotation.

### Balancing algorithms

| Algorithm | How | Good for |
|---|---|---|
| Round robin | next server in turn | similar, short requests |
| Least connections | server with fewest open connections | requests with uneven cost |
| Hash on a key | \`hash(user_id)\` picks the server | stickiness, per-server caches |
| Weighted | more traffic to bigger servers | mixed hardware, gradual rollouts |

### Layer 4 vs layer 7

An **L4** balancer routes TCP or UDP connections by IP and port; it is very fast but cannot see HTTP. An **L7** balancer understands HTTP: it can route \`/api\` and \`/static\` to different pools, terminate TLS, add headers and retry idempotent requests.

### APIs that survive scale

**Cursor pagination.** \`OFFSET 100000\` makes the database read and discard 100,000 rows, and pages shift when rows are inserted. A cursor uses an index:

\`\`\`sql
-- GET /posts?after=812&limit=50
SELECT id, title FROM posts WHERE id < 812 ORDER BY id DESC LIMIT 50;
\`\`\`

**Idempotency.** A client times out on \`POST /payments\` and retries. Without protection the card is charged twice.

\`\`\`text
POST /payments   Idempotency-Key: 9f1c...
server: key seen?  no  -> process, store (key, request hash, response) for 24 h
                   yes -> same body: return stored response
                          different body: 422 error
\`\`\`

**Rate limiting.** Limit each user or IP (for example 100 requests per minute) and return \`429 Too Many Requests\` with \`Retry-After\`. The rate limiter case study covers this in depth.

**Timeouts and retries.** Every outbound call needs a timeout. Retry only idempotent operations, with exponential backoff and **jitter** so thousands of clients do not retry in lockstep.

### Common mistakes
- Storing sessions in server memory behind a load balancer, so users are logged out when they hit another server.
- No health checks, so traffic keeps flowing to a dead server.
- Retrying non-idempotent requests blindly.
- A single load balancer with no redundancy: the component meant to add availability becomes the single point of failure.
- Offset pagination on large, frequently changing tables.`,
      practice: [
        { title: 'Make checkout idempotent', kind: 'exercise', prompt: 'Design the POST /payments endpoint so a client can safely retry after a timeout. Describe the idempotency-key table (columns, primary key, expiry), what happens when a duplicate key arrives while the first request is still running, and what happens on a duplicate key with a different body.' },
        { title: 'Choose a balancing strategy', kind: 'exercise', prompt: 'An image-processing API has requests that take between 50 ms and 20 s. Compare round robin and least connections for it, then describe the health check you would configure and how you would drain a server before a deploy.' },
      ],
      resources: [
        { title: 'System Design Primer: Load balancer', url: 'https://github.com/donnemartin/system-design-primer#load-balancer', source: 'System Design Primer (GitHub)', kind: 'article' },
        { title: 'What is load balancing?', url: 'https://www.cloudflare.com/learning/performance/what-is-load-balancing/', source: 'Cloudflare Learning Center', kind: 'article' },
        { title: 'Timeouts, retries and backoff with jitter', url: 'https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/', source: 'Amazon Builders\' Library', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Stateless servers',
          prompt: 'Why should application servers behind a load balancer be stateless?',
          options: [
            { id: 'a', text: 'So any server can handle any request, and servers can be added or removed freely' },
            { id: 'b', text: 'Because load balancers cannot forward cookies' },
            { id: 'c', text: 'To avoid using a database' },
          ],
          correct: ['a'],
          explanation: 'If session state lives in a shared store, requests do not need to return to the same server, which makes scaling and failover simple.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Layer 7',
          prompt: 'You need to send `/images/*` to one pool and `/api/*` to another. Which load balancer do you need?',
          options: [
            { id: 'a', text: 'Layer 4 (TCP)' },
            { id: 'b', text: 'Layer 7 (HTTP)' },
            { id: 'c', text: 'DNS round robin' },
          ],
          correct: ['b'],
          explanation: 'Only a layer 7 balancer reads the HTTP path, so it can route by URL.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Uneven requests',
          prompt: 'Requests to a service vary from 10 ms to 30 s. Which balancing algorithm usually spreads load best?',
          options: [
            { id: 'a', text: 'Round robin' },
            { id: 'b', text: 'Least connections' },
            { id: 'c', text: 'Always the first healthy server' },
          ],
          correct: ['b'],
          explanation: 'Round robin can stack several slow requests on one server. Least connections sends new work to the server with the fewest requests in progress.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Offset pagination',
          prompt: '`LIMIT 50 OFFSET 100000` is as fast as fetching the first page, because the database jumps straight to row 100,000.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'The database must produce and discard the first 100,000 rows. A cursor (`WHERE id < last_seen ORDER BY id DESC LIMIT 50`) uses the index directly.',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Safe retries',
          prompt: 'Which practices make client retries safe? Select all that apply.',
          options: [
            { id: 'a', text: 'An idempotency key stored with the result of the first request' },
            { id: 'b', text: 'Exponential backoff with random jitter' },
            { id: 'c', text: 'A timeout on every outbound call' },
            { id: 'd', text: 'Retrying every failed POST immediately, as many times as needed' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Idempotency prevents duplicate effects, jitter avoids synchronised retry storms and timeouts bound waiting. Immediate unlimited retries amplify outages.',
        },
      ],
    },

    // ------------------------------------------------------------------ 3
    {
      slug: 'caching',
      title: 'Caching',
      module: 'Building blocks',
      skill: 'caching',
      minutes: 50,
      objectives: [
        'Identify cache layers from browser to database',
        'Compare cache-aside, write-through and write-behind',
        'Choose TTLs and invalidation strategies, and explain the stale-read race',
        'Prevent cache stampedes',
      ],
      body: `A **cache** stores the results of expensive work closer to where it is needed. It trades freshness and memory for speed. If 90% of reads hit a cache that answers in 1 ms instead of a 20 ms database query, average read latency drops from 20 ms to about 3 ms and the database sees one tenth of the load.

### Where caches live

\`\`\`text
browser cache → CDN edge → load balancer → app (in-process) → Redis / Memcached → database
   (private)    (shared,       │              (per server,      (shared by all
                 static and    │               fastest)          app servers)
                 public data)  │
\`\`\`

### Cache-aside (lazy loading)

The most common pattern: the application checks the cache, and on a miss loads from the database and fills the cache.

\`\`\`python
def get_user(uid):
    key = f"user:{uid}"
    user = redis.get(key)
    if user is None:                              # miss
        user = db.query("SELECT ... WHERE id = %s", uid)
        redis.set(key, user, ex=300)              # TTL 5 minutes
    return user

def update_user(uid, fields):
    db.update(uid, fields)
    redis.delete(f"user:{uid}")                   # next read refills
\`\`\`

Deleting the key after a write is safer than writing the new value into the cache, because two concurrent writers can update the cache in the opposite order to the database. Deleting is still not perfect:

\`\`\`text
reader: cache miss, reads OLD row from DB ........ writes OLD value to cache
writer:                 updates DB, deletes key
result: cache holds the old value until the TTL expires
\`\`\`

This is why a **TTL** is a safety net even when you invalidate explicitly.

### Write strategies

| Strategy | Write path | Trade-off |
|---|---|---|
| Cache-aside | app writes DB, deletes key | simple; first read after a change is slower |
| Write-through | write cache and DB together | cache always warm; every write is slower |
| Write-behind | write cache, flush DB later | fast writes; data loss if the cache dies |

**Eviction** (LRU, LFU) decides what to drop when memory is full; **TTL** decides when data is too old.

### Cache stampede

A hot key expires and thousands of requests miss at once and hit the database. Mitigations: **request coalescing** (one request refills while others wait), **TTL jitter** (\`300 + random(0, 60)\` seconds so keys do not expire together), and **refresh-ahead** (refresh popular keys shortly before expiry).

### HTTP caching

\`Cache-Control: public, max-age=86400\` lets browsers and CDNs keep a response for a day; \`ETag\` with \`If-None-Match\` lets clients revalidate cheaply and receive \`304 Not Modified\`. Fingerprinted asset names (\`app.3f9a1c.js\`) can be cached for a year because a new deploy changes the name.

### Common mistakes
- Caching without a TTL, so a missed invalidation means stale data forever.
- Caching per-user responses in a shared CDN, which can show one user another user's data.
- Treating the cache as a source of truth.
- Caching everything, including data read once, which evicts the useful entries.
- Ignoring the hit rate: a cache with a 20% hit rate adds latency and cost for little benefit.`,
      practice: [
        { title: 'Cache a product page', kind: 'exercise', prompt: 'A product page reads product details (changes rarely), price (changes hourly) and stock (changes every second). Propose what to cache, where (CDN, Redis, none), and with what TTL and invalidation for each piece. Explain what a user could see in the worst case.' },
        { title: 'Stampede protection', kind: 'exercise', prompt: 'Write pseudocode for get_with_coalescing(key) that lets only one request rebuild a missing hot key (for example with a short-lived lock key set with NX) while others wait briefly or serve the previous value. List two failure modes of your approach.' },
      ],
      resources: [
        { title: 'System Design Primer: Cache', url: 'https://github.com/donnemartin/system-design-primer#cache', source: 'System Design Primer (GitHub)', kind: 'article' },
        { title: 'HTTP caching', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'What is a CDN?', url: 'https://www.cloudflare.com/learning/cdn/what-is-a-cdn/', source: 'Cloudflare Learning Center', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Invalidation',
          prompt: 'In cache-aside, what is the usual safe action after updating a row in the database?',
          options: [
            { id: 'a', text: 'Delete the cache key' },
            { id: 'b', text: 'Do nothing; the TTL will handle it' },
            { id: 'c', text: 'Flush the entire cache' },
          ],
          correct: ['a'],
          explanation: 'Deleting the key forces the next read to load fresh data. Waiting for the TTL serves stale data, and flushing everything causes a stampede.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Stampede',
          prompt: 'A very popular cache key expires and the database is overwhelmed by simultaneous refills. What is this called?',
          options: [
            { id: 'a', text: 'Cache stampede (thundering herd)' },
            { id: 'b', text: 'Cache poisoning' },
            { id: 'c', text: 'Write skew' },
          ],
          correct: ['a'],
          explanation: 'Request coalescing, TTL jitter and early refresh are standard mitigations.',
        },
        {
          key: 'q3',
          type: 'matching',
          title: 'Write strategies',
          prompt: 'Match each caching strategy to its main trade-off.',
          pairs: {
            left: [
              { id: 'ca', text: 'Cache-aside' },
              { id: 'wt', text: 'Write-through' },
              { id: 'wb', text: 'Write-behind' },
            ],
            right: [
              { id: 'r1', text: 'Simple; the first read after a change misses' },
              { id: 'r2', text: 'Cache stays warm; every write pays for two writes' },
              { id: 'r3', text: 'Fastest writes; recent data can be lost if the cache fails' },
            ],
          },
          matches: { ca: 'r1', wt: 'r2', wb: 'r3' },
          explanation: 'Each strategy moves cost and risk to a different place: read latency, write latency or durability.',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'Hit rate maths',
          prompt: 'Cache hits take 1 ms and misses take 21 ms (cache check plus a 20 ms query). With a 90% hit rate, what is the average read latency?',
          options: [
            { id: 'a', text: 'About 3 ms' },
            { id: 'b', text: 'About 10 ms' },
            { id: 'c', text: 'About 19 ms' },
          ],
          correct: ['a'],
          explanation: '0.9 x 1 + 0.1 x 21 = 0.9 + 2.1 = 3 ms.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'true_false',
          title: 'Shared CDN',
          prompt: 'It is safe to let a shared CDN cache responses that contain a logged-in user\'s account details.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'A shared cache can serve that response to another user. Mark per-user responses `Cache-Control: private` or `no-store`.',
        },
      ],
    },

    // ------------------------------------------------------------------ 4
    {
      slug: 'databases-at-scale',
      title: 'Databases at scale: replication and sharding',
      module: 'Building blocks',
      skill: 'scalability',
      minutes: 55,
      objectives: [
        'Explain leader-follower replication and replication lag',
        'Decide when read replicas help and when they do not',
        'Compare range, hash and directory-based sharding, and explain consistent hashing',
        'Identify the costs of sharding: cross-shard queries, rebalancing, hot keys',
      ],
      body: `A single database eventually runs out of CPU, memory, disk or connections. Before scaling out, exhaust the cheap options in order: fix slow queries and add indexes, add a cache, use a connection pooler, buy a bigger machine. Many successful products run on one well-tuned primary database for years.

### Replication

\`\`\`text
           writes                 async replication
app ─────────────> Leader ───────────────┬──> Follower 1  <── reads
                                         └──> Follower 2  <── reads
\`\`\`

- **Read replicas** scale reads and provide a standby for failover. They do nothing for write throughput: every replica applies every write.
- **Replication lag:** asynchronous followers can be milliseconds to seconds behind. A user who updates their profile and immediately reads from a follower may see old data.
- **Read-your-writes:** route a user's reads to the leader for a short window after they write, or always for their own profile.
- **Synchronous** replication waits for a follower before acknowledging a commit: no acknowledged write is lost on failover, but every commit pays an extra round trip.

### Sharding (partitioning)

Sharding splits data across databases so each holds a subset and handles a share of the writes.

| Scheme | How | Watch out for |
|---|---|---|
| Range | user_id 1-1M on shard A, 1M-2M on B | hot ranges (all new users on the last shard) |
| Hash | \`hash(user_id) % N\` | changing N moves most keys |
| Directory | lookup table maps key to shard | the directory must be fast and highly available |

With \`hash % N\`, going from 4 to 5 shards moves about 80% of keys. **Consistent hashing** places shards and keys on a ring; each key belongs to the next shard clockwise, so adding a shard moves only about 1/N of the keys. Virtual nodes (many points per shard) smooth the distribution.

\`\`\`text
          shard A
        /         \\
  key k1           shard B      add shard D between A and B:
       |           |            only keys in that arc move to D
  shard C ─────────
\`\`\`

### Choosing a shard key

Pick a key that **spreads load evenly** and **keeps data queried together on one shard**. For an e-commerce site, sharding orders by \`customer_id\` puts "my orders" on one shard. Sharding by \`order_id\` spreads evenly but turns "my orders" into a scatter-gather across every shard.

### Costs of sharding

Joins and transactions across shards become application problems; globally unique IDs need a scheme (UUIDs or time-ordered IDs such as Snowflake-style); rebalancing is operationally heavy; and one celebrity key can still overload a single shard.

### Common mistakes
- Sharding before exhausting indexes, caching and vertical scaling.
- A shard key that forces scatter-gather for the most common query.
- Ignoring replica lag in user-facing reads.
- Expecting read replicas to fix a write bottleneck.
- Auto-increment IDs per shard that collide when data is combined.`,
      practice: [
        { title: 'Pick a shard key', kind: 'exercise', prompt: 'A chat app stores messages (message_id, conversation_id, sender_id, sent_at, body). The main query is "latest 50 messages in a conversation". Compare sharding by message_id, sender_id and conversation_id, choose one, and describe what happens with a very large group conversation.' },
        { title: 'Read-your-writes', kind: 'exercise', prompt: 'Design request routing for a profile service with one leader and three async followers so that users always see their own updates, while other users may see changes up to 5 seconds late. Explain where you store the "recently wrote" marker.' },
      ],
      resources: [
        { title: 'System Design Primer: Database (replication, federation, sharding)', url: 'https://github.com/donnemartin/system-design-primer#database', source: 'System Design Primer (GitHub)', kind: 'article' },
        { title: 'PostgreSQL: High Availability, Load Balancing, and Replication', url: 'https://www.postgresql.org/docs/current/high-availability.html', source: 'PostgreSQL Global Development Group', kind: 'docs' },
        { title: 'Consistent hashing', url: 'https://en.wikipedia.org/wiki/Consistent_hashing', source: 'Wikipedia', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Replication lag',
          prompt: 'A user saves a new display name and the next page still shows the old one. Reads go to an async follower. What is the likely cause?',
          options: [
            { id: 'a', text: 'Replication lag' },
            { id: 'b', text: 'A missing index' },
            { id: 'c', text: 'A deadlock' },
          ],
          correct: ['a'],
          explanation: 'The follower has not yet applied the write. Read-your-writes routing fixes this for the affected user.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Shard key',
          prompt: 'Which property matters most in a shard key?',
          options: [
            { id: 'a', text: 'It is a string' },
            { id: 'b', text: 'It spreads load evenly and keeps data queried together on the same shard' },
            { id: 'c', text: 'It is the newest timestamp' },
          ],
          correct: ['b'],
          explanation: 'Even distribution avoids hot shards, and locality keeps common queries on a single shard.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Replicas and writes',
          prompt: 'Adding read replicas increases the write throughput of a leader-follower database.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'All writes still go through the leader, and every replica must apply them. Scaling writes needs sharding or a more efficient write path.',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'Consistent hashing',
          prompt: 'What is the main benefit of consistent hashing over `hash(key) % N` when adding a shard?',
          options: [
            { id: 'a', text: 'Only about 1/N of keys move, instead of most of them' },
            { id: 'b', text: 'Keys are stored in sorted order' },
            { id: 'c', text: 'Cross-shard joins become possible' },
          ],
          correct: ['a'],
          explanation: 'With modulo, changing N reassigns most keys. On a hash ring, only keys in the arc taken by the new shard move.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Before sharding',
          prompt: 'Which steps should usually come before sharding a struggling database? Select all that apply.',
          options: [
            { id: 'a', text: 'Find and fix slow queries, adding indexes' },
            { id: 'b', text: 'Add a cache for hot reads' },
            { id: 'c', text: 'Move to a larger machine' },
            { id: 'd', text: 'Split every table into its own database immediately' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Query fixes, caching and vertical scaling are cheaper and keep joins and transactions simple. Sharding is powerful but expensive to operate.',
        },
      ],
    },

    // ------------------------------------------------------------------ 5
    {
      slug: 'choosing-data-stores',
      title: 'Choosing data stores: SQL, NoSQL and object storage',
      module: 'Building blocks',
      skill: 'system-design-basics',
      minutes: 45,
      objectives: [
        'Describe relational, key-value, document, wide-column, search and object stores',
        'Match each kind of data and access pattern to a suitable store',
        'Explain why large files belong in object storage, not in database rows',
        'Weigh the operational cost of adding another data store',
      ],
      body: `"SQL or NoSQL?" is the wrong question. The right one is: **what are the access patterns, consistency needs and data sizes**, and which store serves them with the least operational cost?

### The main families

| Store | Data model | Strong at | Weak at | Examples |
|---|---|---|---|---|
| Relational | tables, joins, constraints | transactions, ad-hoc queries, integrity | horizontal write scaling needs work | PostgreSQL, MySQL |
| Key-value | key to opaque value | very fast lookups by key, caching, sessions | queries by anything but the key | Redis, DynamoDB |
| Document | JSON-like documents | flexible nested records read as a whole | joins across documents | MongoDB, PostgreSQL JSONB |
| Wide-column | rows with many columns, partitioned | huge write volume, time-ordered data | ad-hoc queries, joins | Cassandra, HBase |
| Search index | inverted index | full-text search, relevance, facets | being the source of truth | Elasticsearch, OpenSearch |
| Object storage | files (blobs) by key | cheap, durable storage of large files | small, frequent updates | Amazon S3, Google Cloud Storage |

### Worked example: an online shop

\`\`\`text
users, orders, payments, inventory  -> PostgreSQL (transactions: stock and payment together)
sessions, carts, rate-limit counters -> Redis (fast, expiring keys)
product search with typo tolerance   -> search index, fed from PostgreSQL changes
product images, invoices (PDF)       -> object storage + CDN; DB stores only the URL
click events (billions per month)    -> append-only log or wide-column store, then a warehouse
\`\`\`

The relational database stays the **source of truth**. Other stores are derived from it and can be rebuilt.

### Large files

Storing a 5 MB image in a database row bloats backups and replication and wastes database memory. Instead, the client uploads directly to object storage (often with a short-lived pre-signed URL), and the database row stores the object key, size and checksum.

\`\`\`text
client --1. request upload URL--> API --> returns pre-signed URL
client --2. PUT image----------> object storage
client --3. confirm(key)-------> API --> INSERT INTO images(key, size, owner)
\`\`\`

### Decision checklist

1. Do you need multi-row transactions or constraints? Start relational.
2. Is every read by a single key at very high rate? Consider key-value.
3. Is the data large binary content? Object storage.
4. Do users search free text? Add a search index as a secondary store.
5. Can your team run it? Every new store adds backups, monitoring, upgrades and on-call knowledge.

### Common mistakes
- Picking a NoSQL store "for scale" when the data is relational and the load fits one PostgreSQL server.
- Using a search index or cache as the only copy of data.
- Storing large files as database blobs.
- Designing a key-value schema without listing the queries first; adding a new query later can mean rewriting the data.
- Adding a new database for every feature (polyglot persistence) without counting the operational cost.`,
      practice: [
        { title: 'Map the stores', kind: 'exercise', prompt: 'For a video-learning platform, choose a store for each: user accounts and enrolments, course videos, video progress updates every 10 seconds per viewer, course search, and quiz attempts. For each, give the main access pattern and one reason you rejected an alternative.' },
        { title: 'Design an upload flow', kind: 'exercise', prompt: 'Design profile-photo uploads with object storage: the API endpoints, the database table, how you validate size and type, how thumbnails are generated, and what happens if the client uploads but never calls confirm.' },
      ],
      resources: [
        { title: 'System Design Primer: SQL or NoSQL', url: 'https://github.com/donnemartin/system-design-primer#sql-or-nosql', source: 'System Design Primer (GitHub)', kind: 'article' },
        { title: 'PostgreSQL: JSON types', url: 'https://www.postgresql.org/docs/current/datatype-json.html', source: 'PostgreSQL Global Development Group', kind: 'docs' },
        { title: 'NoSQL', url: 'https://en.wikipedia.org/wiki/NoSQL', source: 'Wikipedia', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'matching',
          title: 'Data to store',
          prompt: 'Match each kind of data to the store that fits it best.',
          pairs: {
            left: [
              { id: 'd1', text: 'Orders and payments that must update together' },
              { id: 'd2', text: 'User sessions with a 30-minute expiry' },
              { id: 'd3', text: 'Uploaded product videos' },
              { id: 'd4', text: 'Typo-tolerant product search' },
            ],
            right: [
              { id: 'r1', text: 'Relational database' },
              { id: 'r2', text: 'Key-value store' },
              { id: 'r3', text: 'Object storage' },
              { id: 'r4', text: 'Search index' },
            ],
          },
          matches: { d1: 'r1', d2: 'r2', d3: 'r3', d4: 'r4' },
          explanation: 'Transactions suit relational stores, expiring lookups suit key-value, large files suit object storage and free text suits an inverted index.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Large files',
          prompt: 'Where should a 5 MB user-uploaded image usually be stored?',
          options: [
            { id: 'a', text: 'In a BYTEA column next to the user row' },
            { id: 'b', text: 'In object storage, with its key and metadata in the database' },
            { id: 'c', text: 'In the search index' },
          ],
          correct: ['b'],
          explanation: 'Object storage is cheap and durable for blobs and can be served through a CDN. Keeping blobs in the database bloats backups and replication.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Search as source of truth',
          prompt: 'A search index is a good primary store for orders because it can query any field quickly.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Search indexes are usually derived, eventually consistent copies without transactions. Keep orders in a transactional store and index a copy.',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Hidden costs',
          prompt: 'Which costs come with adding a new kind of database to a system? Select all that apply.',
          options: [
            { id: 'a', text: 'Backups and restore procedures' },
            { id: 'b', text: 'Monitoring, upgrades and on-call expertise' },
            { id: 'c', text: 'Keeping data in sync with the source of truth' },
            { id: 'd', text: 'None, if it is a managed cloud service' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Managed services reduce some work, but the team still owns data modelling, synchronisation, cost and incident response.',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'Key-value design',
          prompt: 'What should you do first when designing a schema for a key-value or wide-column store?',
          options: [
            { id: 'a', text: 'List the queries the application must answer' },
            { id: 'b', text: 'Normalise the data to third normal form' },
            { id: 'c', text: 'Pick the largest possible partition key' },
          ],
          correct: ['a'],
          explanation: 'These stores answer queries efficiently only by key, so the keys and partitions are designed from the access patterns.',
          difficulty: 'medium',
        },
      ],
    },

    // ------------------------------------------------------------------ 6
    {
      slug: 'queues-and-async',
      title: 'Queues and asynchronous processing',
      module: 'Building blocks',
      skill: 'messaging',
      minutes: 50,
      objectives: [
        'Explain when to move work off the request path',
        'Compare point-to-point queues with publish/subscribe',
        'Design idempotent consumers for at-least-once delivery',
        'Use retries, dead-letter queues, backpressure and the transactional outbox',
      ],
      body: `Not every task needs to finish before you respond. Sending email, resizing images or generating reports can be put on a **queue** and handled by **workers**.

\`\`\`text
          enqueue                      dequeue
API ───────────────> [ queue ] ───────────────> worker-1
  (respond 202 now)               └───────────> worker-2
                                  failed 5x ──> dead-letter queue
\`\`\`

**Benefits:** faster responses, smoothing traffic spikes (the queue absorbs a burst and workers drain it at a steady rate), independent scaling of workers, and isolation: if the email provider is down, orders still succeed and emails go out later.

**When not to:** if the user needs the result now (a search, a price), a queue only adds latency.

### Queue vs pub/sub

| Model | Delivery | Typical use |
|---|---|---|
| Work queue | each message to **one** consumer | jobs: resize this image |
| Publish/subscribe | each event to **every** subscriber group | \`order_placed\` consumed by email, billing and analytics |
| Log (Kafka style) | events kept for days; consumers track their own offset | replay, rebuilding derived data, ordering per partition |

### Delivery guarantees and idempotency

Most systems offer **at-least-once** delivery. A worker can do the work, then crash before acknowledging, and the message is delivered again. Make consumers **idempotent**:

\`\`\`python
def handle(msg):
    with db.transaction():
        inserted = db.execute(
            "INSERT INTO processed(message_id) VALUES (%s) ON CONFLICT DO NOTHING",
            msg.id).rowcount
        if inserted == 0:
            return                          # duplicate, already done
        db.execute("UPDATE orders SET status = 'shipped' WHERE id = %s", msg.order_id)
    msg.ack()
\`\`\`

Recording the message ID and doing the work in the **same transaction** is what makes this safe. Some operations are naturally idempotent (setting a status); others (incrementing a counter, charging a card) are not.

### Failures and backpressure

Retry with exponential backoff; after N attempts move the message to a **dead-letter queue** for inspection, so one bad "poison" message does not block the rest. Watch **queue depth** and **age of the oldest message**: steady growth means consumers cannot keep up, so scale workers or shed load.

### The dual-write problem and the outbox

\`\`\`text
BAD:  INSERT order; COMMIT;  then publish("order_placed")   <- crash here = event lost
GOOD: BEGIN; INSERT order; INSERT outbox(event); COMMIT;
      relay process reads outbox -> publishes -> marks sent  (at-least-once)
\`\`\`

### Common mistakes
- Assuming exactly-once delivery.
- Unbounded retries of a poison message.
- Putting work on a queue when the user needs the result immediately.
- Writing to the database and publishing an event as two separate steps.
- Not monitoring queue depth until users notice delays.`,
      practice: [
        { title: 'Async video uploads', kind: 'exercise', prompt: 'Design the flow for uploading a video that must be transcoded into three resolutions. Describe the API response, the queue messages, how workers report progress, what happens if a worker crashes halfway, and how a client learns the video is ready.' },
        { title: 'Idempotent consumer', kind: 'exercise', prompt: 'A "payment_succeeded" message credits loyalty points. Show how a duplicate delivery could double the points, then design the consumer and table so processing the same message twice has no extra effect.' },
      ],
      resources: [
        { title: 'System Design Primer: Asynchronism', url: 'https://github.com/donnemartin/system-design-primer#asynchronism', source: 'System Design Primer (GitHub)', kind: 'article' },
        { title: 'RabbitMQ Tutorials', url: 'https://www.rabbitmq.com/tutorials', source: 'RabbitMQ', kind: 'docs' },
        { title: 'Pattern: Transactional outbox', url: 'https://microservices.io/patterns/data/transactional-outbox.html', source: 'microservices.io (Chris Richardson)', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'At-least-once',
          prompt: 'Your queue guarantees at-least-once delivery. What must consumers be?',
          options: [
            { id: 'a', text: 'Idempotent, so processing a message twice has the same effect as once' },
            { id: 'b', text: 'Single-threaded' },
            { id: 'c', text: 'Written in the same language as the producer' },
          ],
          correct: ['a'],
          explanation: 'Duplicates are possible, so processing must be safe to repeat.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Fan-out',
          prompt: 'An `order_placed` event must reach the email, billing and analytics services. Which model fits?',
          options: [
            { id: 'a', text: 'One work queue shared by all three services' },
            { id: 'b', text: 'Publish/subscribe, so each service gets its own copy' },
            { id: 'c', text: 'Synchronous HTTP calls from the order service to each' },
          ],
          correct: ['b'],
          explanation: 'With a shared work queue each message goes to only one consumer. Pub/sub delivers every event to every subscriber.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Poison message',
          prompt: 'One malformed message fails every time it is processed. What prevents it from blocking the queue forever?',
          options: [
            { id: 'a', text: 'A dead-letter queue after a bounded number of retries' },
            { id: 'b', text: 'Retrying it immediately in a tight loop' },
            { id: 'c', text: 'Deleting the queue and recreating it' },
          ],
          correct: ['a'],
          explanation: 'Bounded retries with backoff, then moving the message aside, keep the rest flowing and preserve the message for debugging.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Dual write',
          prompt: 'Committing a database transaction and then publishing an event in a separate step can lose the event if the process crashes in between.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'That is the dual-write problem. The transactional outbox writes the event in the same transaction and publishes it afterwards.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Good queue candidates',
          prompt: 'Which tasks are good candidates for asynchronous processing? Select all that apply.',
          options: [
            { id: 'a', text: 'Sending a welcome email after sign-up' },
            { id: 'b', text: 'Generating a monthly PDF report' },
            { id: 'c', text: 'Returning search results the user is waiting for' },
            { id: 'd', text: 'Transcoding an uploaded video' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'Work the user does not need in the response can be deferred. Search results are needed immediately, so a queue would only add delay.',
        },
      ],
    },

    // ------------------------------------------------------------------ 7
    {
      slug: 'consistency-and-availability',
      title: 'Consistency and availability',
      module: 'Trade-offs',
      skill: 'scalability',
      minutes: 50,
      objectives: [
        'State the CAP theorem precisely and its practical meaning',
        'Contrast strong and eventual consistency with examples',
        'Calculate availability of components in series and in parallel',
        'Describe quorum reads and writes and resilience patterns such as circuit breakers',
      ],
      body: `In a distributed system, networks fail. **CAP** says that during a network **partition**, a system must choose between **consistency** (every read sees the latest write, or returns an error) and **availability** (every request gets a non-error response, possibly stale). When there is no partition you can have both; the everyday trade-off is usually **latency vs consistency** (waiting for more replicas to agree takes longer).

### Choosing per feature

| Feature | Choice | Why |
|---|---|---|
| Bank transfer, seat reservation, unique username | strong | users notice and lose money or trust |
| Like counts, view counts, recommendations | eventual | a few seconds of staleness is invisible |
| Social feed | eventual, with read-your-writes | users must see their own post |
| DNS | eventual | caching with TTLs is the whole design |

**Eventual consistency** means replicas converge if writes stop. It does not say how long that takes, so measure and bound replication lag.

### Quorums

With N replicas, write to W and read from R. If **R + W > N**, every read set overlaps every write set in at least one replica, so a read sees the latest acknowledged write.

\`\`\`text
N = 3, W = 2, R = 2   ->  2 + 2 > 3, reads see the latest acknowledged write
N = 3, W = 1, R = 1   ->  fastest, but reads may be stale
N = 3, W = 3, R = 1   ->  fast reads, but any one replica down blocks writes
\`\`\`

### Availability maths

Components in **series** multiply availabilities; redundant components in **parallel** fail only if all fail.

\`\`\`text
series:    LB 99.99% x app 99.9% x DB 99.9%   ≈ 99.79%
parallel:  two app servers at 99.9% each      = 1 - (0.001)^2 = 99.9999%
\`\`\`

| Availability | Downtime per year |
|---|---|
| 99% | about 3.65 days |
| 99.9% | about 8.8 hours |
| 99.99% | about 53 minutes |
| 99.999% | about 5 minutes |

The parallel formula assumes failures are independent. Two servers in the same rack, on the same power supply or running the same bad deploy are not independent.

### Resilience patterns

- **Redundancy and failover:** active-passive (a standby takes over) or active-active (all serve traffic).
- **Timeouts** on every call, and **circuit breakers**: after repeated failures, stop calling a dependency for a while and fail fast or serve a fallback.
- **Graceful degradation:** if recommendations are down, show the page without them.
- **Bulkheads:** separate pools (threads, connections) per dependency so one slow service cannot exhaust everything.

### Common mistakes
- Saying "we choose CA": partitions are not optional in a distributed system.
- Using eventual consistency where users would notice money or stock errors.
- Forgetting that every added dependency in series lowers availability.
- Assuming replicas fail independently when they share a rack, region or deploy.
- Calls without timeouts, so one slow dependency ties up every thread.`,
      practice: [
        { title: 'Choose per feature', kind: 'exercise', prompt: 'For a ticket-booking site, decide strong or eventual consistency for: seat reservation, number of people viewing an event, user profile photo, payment status. Justify each in one sentence and say what the user would see if you chose wrong.' },
        { title: 'Availability budget', kind: 'exercise', prompt: 'A request passes through a CDN (99.99%), a load balancer (99.99%), an app tier (99.9%) and a database (99.95%). Compute end-to-end availability and yearly downtime, then show how adding a second, independent instance of the weakest link changes it.' },
        { title: 'Circuit breaker', kind: 'exercise', prompt: 'Write pseudocode for a circuit breaker with closed, open and half-open states around a recommendations API. Choose the failure threshold, open duration and fallback, and explain each choice.' },
      ],
      resources: [
        { title: 'System Design Primer: Availability vs consistency', url: 'https://github.com/donnemartin/system-design-primer#availability-vs-consistency', source: 'System Design Primer (GitHub)', kind: 'article' },
        { title: 'Consistency models', url: 'https://jepsen.io/consistency', source: 'Jepsen', kind: 'article' },
        { title: 'Circuit breaker pattern', url: 'https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker', source: 'Microsoft Azure Architecture Center', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'CAP',
          prompt: 'According to CAP, when must a distributed system choose between consistency and availability?',
          options: [
            { id: 'a', text: 'Always, even when the network is healthy' },
            { id: 'b', text: 'During a network partition' },
            { id: 'c', text: 'Only when using SQL databases' },
          ],
          correct: ['b'],
          explanation: 'CAP is about behaviour during partitions. Without a partition, the practical trade-off is latency versus consistency.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Quorum',
          prompt: 'With N = 5 replicas and W = 3, what is the smallest R that guarantees reads see the latest acknowledged write?',
          options: [
            { id: 'a', text: '2' },
            { id: 'b', text: '3' },
            { id: 'c', text: '5' },
          ],
          correct: ['b'],
          explanation: 'R + W must exceed N: R + 3 > 5, so R = 3.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Series availability',
          prompt: 'Two components are in series, each 99% available. What is the combined availability?',
          options: [
            { id: 'a', text: '99%' },
            { id: 'b', text: 'About 98%' },
            { id: 'c', text: '99.99%' },
          ],
          correct: ['b'],
          explanation: '0.99 x 0.99 = 0.9801. Dependencies in series lower availability; redundancy in parallel raises it.',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Strong consistency needed',
          prompt: 'Which features usually need strong consistency? Select all that apply.',
          options: [
            { id: 'a', text: 'Reserving the last seat on a flight' },
            { id: 'b', text: 'Claiming a unique username' },
            { id: 'c', text: 'Showing the number of views on a video' },
            { id: 'd', text: 'Recording that a payment succeeded' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'Double-booking, duplicate usernames and payment errors are visible and costly. A view count that lags by a few seconds is not.',
        },
        {
          key: 'q5',
          type: 'true_false',
          title: 'Circuit breaker',
          prompt: 'A circuit breaker stops calling a failing dependency for a period, failing fast or serving a fallback instead of waiting on timeouts.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Failing fast protects your threads and the struggling dependency. After the open period, a few trial requests (half-open) test whether it has recovered.',
        },
      ],
    },

    // ------------------------------------------------------------------ 8
    {
      slug: 'case-study-url-shortener',
      title: 'Case study: design a URL shortener',
      module: 'Case studies',
      skill: 'system-design-basics',
      minutes: 70,
      milestone: true,
      completionCriteria: 'Write a one-page design covering requirements, estimates, API, data model, key generation, caching and scaling, and defend two trade-offs.',
      objectives: [
        'Run a full design from requirements to scaling',
        'Choose a short-code generation scheme and explain collisions',
        'Design the read path for very high read-to-write ratios',
        'Identify bottlenecks, abuse risks and failure modes',
      ],
      body: `### 1. Requirements

Functional: create a short link for a long URL; redirect a short link; optional custom alias and expiry; basic click counts. Non-functional: redirects are very fast (p99 under 50 ms) and highly available; a code must never point to the wrong URL; creation can be slightly slower.

### 2. Estimates

\`\`\`text
writes:    100 M new links / month ≈ 40 / s (peak ~100 / s)
reads:     100:1 ≈ 4,000 redirects / s (peak ~20,000 / s for viral links)
storage:   500 bytes / link ≈ 50 GB / month ≈ 3 TB over 5 years
hot set:   if 1 M links get most traffic: 1 M x 500 B ≈ 500 MB, fits in one cache node
\`\`\`

### 3. API

\`\`\`text
POST /api/links   { "url": "https://...", "alias"?: "...", "expiresAt"?: "..." }
                  -> 201 { "code": "aZ3kP9q", "shortUrl": "https://sho.rt/aZ3kP9q" }
GET  /{code}      -> 302 Location: <long url>   (404 if unknown, 410 if expired)
\`\`\`

A **301** is cached by browsers, which reduces load but hides later clicks; a **302** sends every click through you. Pick based on whether analytics matter.

### 4. Short codes

7 characters of base62 (0-9, a-z, A-Z) give 62^7 ≈ 3.5 trillion codes.

| Scheme | How | Pros | Cons |
|---|---|---|---|
| Counter + base62 | unique ID from a sequence, or ID ranges handed to each server, encoded in base62 | no collisions | sequential codes are guessable unless shuffled |
| Hash the URL | first 7 characters of a hash | same URL gives same code | collisions must be detected and retried |
| Random + check | random 7 characters, unique constraint, retry on conflict | simple, unguessable | retries grow as the space fills (still rare at this scale) |

### 5. Data model

\`links(code PRIMARY KEY, long_url, owner_id, created_at, expires_at)\`. Every redirect is a primary-key lookup, so a relational database or a key-value store both work. The unique primary key is what guarantees one code never maps to two URLs.

### 6. Read path

\`\`\`text
client -> CDN / edge -> LB -> redirect service -> cache (Redis, hot codes) -> DB (on miss)
                                         └── async click event -> queue -> analytics
\`\`\`

Cache-aside with a long TTL works well because links rarely change. Click events go on a queue so analytics never slow redirects.

### 7. Scaling and failure modes

Stateless redirect servers behind a load balancer; read replicas or a key-value store sharded by code; rate-limit link creation per user and IP; scan submitted URLs against malware and phishing lists. If the cache fails, the database must survive the full read load for a while, or you need a replicated cache. If the analytics queue backs up, redirects must still succeed.

### Common mistakes
- Skipping estimates, then over- or under-building.
- Synchronous analytics writes on the redirect path.
- Random codes without a uniqueness guarantee.
- No abuse controls, turning the service into a phishing tool.
- Treating a custom alias like a generated code without checking reserved words such as "api" or "admin".`,
      practice: [
        { title: 'Write the design doc', kind: 'exercise', prompt: 'Write a one-page design for the URL shortener covering requirements, estimates, API, schema, code generation, caching, analytics and abuse prevention. End with the two biggest risks and how you would monitor them.' },
        { title: 'Base62 encoder', kind: 'exercise', prompt: 'Implement encode(n) and decode(s) for base62 using the alphabet 0-9a-zA-Z, and test that decode(encode(n)) == n for 0, 61, 62 and 10^12.' },
        { title: 'ID ranges', kind: 'exercise', prompt: 'Design how 20 redirect-creation servers get unique numeric IDs without calling the database on every request (for example, each server leases a block of 10,000 IDs). Describe what happens when a server crashes with an unused block.' },
      ],
      resources: [
        { title: 'System Design Primer: Design Pastebin.com (or Bit.ly)', url: 'https://github.com/donnemartin/system-design-primer/blob/master/solutions/system_design/pastebin/README.md', source: 'System Design Primer (GitHub)', kind: 'article' },
        { title: 'HTTP redirections', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Redirections', source: 'MDN Web Docs', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Keyspace',
          prompt: 'Why do 7 base62 characters comfortably cover years of links at 100 M per month?',
          options: [
            { id: 'a', text: '62^7 is about 3.5 trillion possible codes' },
            { id: 'b', text: 'Base62 compresses URLs' },
            { id: 'c', text: 'Codes are reused after expiry' },
          ],
          correct: ['a'],
          explanation: '100 M per month is 1.2 B per year, so 3.5 trillion codes last thousands of years.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Redirect status',
          prompt: 'You want to count every click on a short link. Which redirect status is the better default?',
          options: [
            { id: 'a', text: '301 Moved Permanently' },
            { id: 'b', text: '302 Found' },
            { id: 'c', text: '200 OK with the long URL in the body' },
          ],
          correct: ['b'],
          explanation: 'Browsers cache 301s and may skip your server on later clicks. A 302 sends every click through you.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Analytics path',
          prompt: 'Where should click counting happen so it does not slow redirects?',
          options: [
            { id: 'a', text: 'An UPDATE on the links row before sending the redirect' },
            { id: 'b', text: 'An event published to a queue and aggregated by separate consumers' },
            { id: 'c', text: 'In the browser, by asking users to report clicks' },
          ],
          correct: ['b'],
          explanation: 'Publishing an event is cheap, and consumers aggregate counts in batches. A synchronous UPDATE on every redirect also creates hot-row contention for viral links.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Hash collisions',
          prompt: 'If codes are the first 7 characters of a hash of the URL, two different URLs can produce the same code, so collisions must be detected.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Truncating a hash shrinks the space, making collisions possible. Insert with a unique constraint and, on conflict, add a salt or take a different slice.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Abuse prevention',
          prompt: 'Which measures help stop a URL shortener being used to spread malicious links? Select all that apply.',
          options: [
            { id: 'a', text: 'Rate-limiting link creation per user and IP' },
            { id: 'b', text: 'Checking submitted URLs against malware and phishing lists' },
            { id: 'c', text: 'Using 301 instead of 302 redirects' },
            { id: 'd', text: 'Letting users report a link and disabling it quickly' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'Rate limits, URL scanning and fast takedown reduce abuse. The redirect status code has no effect on it.',
        },
      ],
    },

    // ------------------------------------------------------------------ 9
    {
      slug: 'case-study-rate-limiter',
      title: 'Case study: design a distributed rate limiter',
      module: 'Case studies',
      skill: 'system-design-basics',
      minutes: 60,
      objectives: [
        'Compare fixed window, sliding window and token bucket algorithms',
        'Implement a token bucket and explain its burst behaviour',
        'Design a shared rate limiter with Redis that is correct under concurrency',
        'Choose fail-open or fail-closed behaviour and communicate limits to clients',
      ],
      body: `A rate limiter caps how many requests a client can make in a period. It protects services from abuse and accidental overload, and enforces plan limits ("free tier: 100 requests per minute").

### 1. Requirements

Functional: limit by API key (or user, or IP) with per-endpoint rules; reject excess requests with \`429 Too Many Requests\`; tell clients their limits. Non-functional: adds under 2 ms per request; works across 50 API servers; a limiter outage must not take the API down.

### 2. Where it runs

\`\`\`text
client -> API gateway / middleware [rate limiter] -> service
                         │
                         └──> Redis (shared counters, all gateways see the same state)
\`\`\`

A per-server, in-memory limiter is simplest but lets a client get N times the limit across N servers. A shared store gives one global count.

### 3. Algorithms

| Algorithm | Idea | Memory per client | Behaviour |
|---|---|---|---|
| Fixed window | count requests per calendar minute | 1 counter | allows up to 2x the limit around a window boundary |
| Sliding log | store a timestamp per request | one entry per request | exact, but expensive at high limits |
| Sliding window counter | weight the previous window: \`current + previous x (1 - elapsed fraction)\` | 2 counters | close approximation, cheap |
| Token bucket | tokens refill at rate r up to capacity b; each request spends one | 2 numbers | allows short bursts up to b, average rate r |
| Leaky bucket | requests queue and drain at a fixed rate | a queue | smooth output, adds waiting |

### 4. Token bucket

\`\`\`python
import time

class TokenBucket:
    def __init__(self, capacity: float, refill_per_sec: float):
        self.capacity, self.rate = capacity, refill_per_sec
        self.tokens = capacity
        self.updated = time.monotonic()

    def allow(self, cost: float = 1) -> bool:
        now = time.monotonic()
        elapsed = now - self.updated
        self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
        self.updated = now
        if self.tokens >= cost:
            self.tokens -= cost
            return True
        return False
\`\`\`

With capacity 10 and refill 1 per second, an idle client can burst 10 requests, then gets one per second.

### 5. Making it distributed and correct

Store \`tokens\` and \`updated\` per client in Redis under a key such as \`rl:{api_key}:{route}\`. The read-refill-spend sequence must be **atomic**: if two gateways read "1 token left" at the same time, both allow. Run the whole update in a Redis Lua script (Redis executes a script without interleaving other commands), and set a key expiry so idle clients do not use memory forever. For a fixed window, \`INCR\` then \`EXPIRE\` must also be atomic, or a crash between them leaves a key that never expires.

**Memory estimate:** about 100 bytes per key in Redis x 10 M active keys ≈ 1 GB.

### 6. Responses

\`\`\`text
HTTP/1.1 429 Too Many Requests
Retry-After: 12
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
\`\`\`

\`Retry-After\` is standard HTTP; \`X-RateLimit-*\` headers are a widespread convention (an IETF draft is standardising \`RateLimit\` headers).

### 7. Failure modes

- **Redis unavailable:** fail open (allow traffic, risk overload) or fail closed (reject, causing an outage). Most public APIs fail open with a local in-memory fallback limit.
- **Race conditions** if the update is not atomic, letting bursts through.
- **Hot keys:** one huge client concentrated on one Redis shard.
- **Clock differences** between servers if timestamps come from each gateway; use the Redis server time inside the script.

### Common mistakes
- Per-server limits that multiply with the number of servers.
- Non-atomic check-then-update in a shared store.
- Returning 500 or 403 instead of 429 with \`Retry-After\`.
- Limiting only by IP, which punishes many users behind one office or mobile network.
- No expiry on counter keys.`,
      practice: [
        { title: 'Design a rate limiter', kind: 'exercise', prompt: 'Design a rate limiter for a public API: write the configuration format for rules (per key, per route), the Redis data model, the middleware flow, the response headers, and two failure modes with how you handle each.' },
        { title: 'Implement and test the token bucket', kind: 'exercise', prompt: 'Implement TokenBucket with an injectable clock function so tests do not sleep. Test: a burst up to capacity, rejection after the burst, refill after 3 simulated seconds, and that tokens never exceed capacity.' },
        { title: 'Boundary burst', kind: 'exercise', prompt: 'With a fixed window of 100 requests per minute, show a timeline in which a client makes 200 requests within two seconds without being rejected. Then compute what a sliding window counter would allow for the same timeline.' },
      ],
      resources: [
        { title: 'What is rate limiting?', url: 'https://www.cloudflare.com/learning/bots/what-is-rate-limiting/', source: 'Cloudflare Learning Center', kind: 'article' },
        { title: '429 Too Many Requests', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/429', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'Retry-After header', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After', source: 'MDN Web Docs', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Status code',
          prompt: 'Which HTTP status code should a rate limiter return when a client exceeds its limit?',
          options: [
            { id: 'a', text: '403 Forbidden' },
            { id: 'b', text: '429 Too Many Requests' },
            { id: 'c', text: '503 Service Unavailable' },
          ],
          correct: ['b'],
          explanation: '429 tells the client it sent too many requests, ideally with a Retry-After header saying when to try again.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Fixed window weakness',
          prompt: 'What is the main weakness of a fixed-window counter (for example, 100 requests per calendar minute)?',
          options: [
            { id: 'a', text: 'It needs a timestamp for every request' },
            { id: 'b', text: 'A client can send up to twice the limit in a short span around a window boundary' },
            { id: 'c', text: 'It cannot be stored in Redis' },
          ],
          correct: ['b'],
          explanation: '100 requests at 12:00:59 and 100 more at 12:01:00 are both allowed. Sliding windows or token buckets smooth this.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Token bucket bursts',
          prompt: 'A token bucket has capacity 10 and refills 2 tokens per second. A client has been idle for a minute. How many requests can it make instantly?',
          options: [
            { id: 'a', text: '2' },
            { id: 'b', text: '10' },
            { id: 'c', text: '120' },
          ],
          correct: ['b'],
          explanation: 'Tokens accumulate only up to the capacity, so the burst is capped at 10, after which the client gets 2 per second.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Atomic updates',
          prompt: 'In a shared Redis limiter, reading the token count and writing the new count as two separate commands from the gateway is safe under concurrency.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Two gateways can read the same value and both allow a request. Do the read-modify-write atomically, for example in a Lua script.',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Failure handling',
          prompt: 'Which are reasonable choices when the shared Redis store behind a public API rate limiter becomes unavailable? Select all that apply.',
          options: [
            { id: 'a', text: 'Fail open, allowing requests, and alert the on-call engineer' },
            { id: 'b', text: 'Fall back to a conservative in-memory limit on each gateway' },
            { id: 'c', text: 'Silently reject all traffic with 500 errors' },
          ],
          correct: ['a', 'b'],
          explanation: 'Most public APIs prefer availability: fail open or use a local fallback, and alert. Rejecting everything turns a limiter outage into a full outage.',
        },
      ],
    },
  ],
};

// ============================================================================
// CS fundamentals
// ============================================================================

export const csFundamentals: SeedTrack = {
  slug: 'cs-fundamentals',
  title: 'CS Fundamentals: How Computers and Networks Work',
  category: 'cs-fundamentals',
  summary: 'Understand what really happens when code runs and when a browser loads a page: CPUs, processes, memory, file systems, TCP/IP, DNS, HTTP and TLS.',
  description: `**Who it's for:** self-taught developers and bootcamp graduates who want the computer science foundation behind everyday programming, and anyone preparing for interviews that probe operating systems and networking.

**Prerequisites:** basic programming in any language. A Linux or macOS terminal (or WSL on Windows) helps for the hands-on exercises.

**You will be able to:**
- explain how source code becomes instructions a CPU executes, and why memory access patterns matter
- read binary and hexadecimal, and explain integer overflow, floating-point rounding and UTF-8
- distinguish processes from threads and reason about scheduling, race conditions and deadlock
- use locks, condition variables and thread pools, and choose between threads and async I/O
- describe virtual memory, the stack and the heap, and why page faults happen
- explain how files are stored and why fsync matters
- trace a request from typing a URL to rendering a page through DNS, TCP, TLS and HTTP

**How each lesson works:** concrete examples you can run on your own machine, a "Common mistakes" section, hands-on exercises and a short graded quiz.

**Milestones:** *Processes and threads* (topic 3) and *HTTP and TLS* (topic 8).`,
  level: 'beginner',
  estimatedHours: 24,
  roles: ['software engineer', 'backend developer', 'devops engineer', 'full-stack developer', 'site reliability engineer'],
  contentStatus: 'complete',
  topics: [
    // ------------------------------------------------------------------ 1
    {
      slug: 'how-computers-run-programs',
      title: 'How computers run programs',
      module: 'The machine',
      skill: 'computer-architecture',
      minutes: 45,
      objectives: [
        'Describe the CPU fetch-decode-execute cycle and the role of registers',
        'Explain compilation, linking, interpretation and JIT at a high level',
        'Relate the memory hierarchy and cache lines to program performance',
        'Explain what a system call is and why programs need the kernel',
      ],
      body: `A CPU repeatedly **fetches** an instruction from memory (at the address held in the **program counter**), **decodes** it and **executes** it. Instructions are tiny: load a value into a **register**, add two registers, compare, jump. A 3 GHz core runs about 3 billion clock cycles per second, and modern cores overlap several instructions at once (pipelining).

### One line of code, several instructions

\`c = a + b\` becomes something like:

\`\`\`text
LOAD   r1, [a]        ; copy a from memory into register r1
LOAD   r2, [b]
ADD    r3, r1, r2     ; r3 = r1 + r2
STORE  [c], r3        ; write the result back to memory
\`\`\`

Registers are the only place the CPU computes; everything else must be loaded into them first.

### From source to running program

\`\`\`text
source code ──compiler──> object files ──linker──> executable ──loader──> memory ──CPU
   (C, Rust, Go)                       (adds libraries)

source code ──> bytecode ──> interpreter / JIT ──> machine code at runtime
   (Python, Java, JavaScript)
\`\`\`

- A **compiler** translates the whole program ahead of time. For C, \`gcc -S hello.c\` shows the assembly it generates.
- A **linker** combines object files and libraries and resolves names such as \`printf\`.
- An **interpreter** executes code (often bytecode) step by step. CPython compiles your file to bytecode first; \`python -m dis\` shows it.
- A **JIT** compiler watches hot code paths at runtime and compiles them to machine code (the JVM's HotSpot, V8 in Chrome and Node.js).

### The memory hierarchy

\`\`\`text
registers   < 1 ns     bytes
L1 cache    ~1 ns      tens of KB
L2 / L3     ~4-40 ns   MB
RAM         ~100 ns    GB
SSD         ~100 µs    TB
network     ~0.5-150 ms
\`\`\`

Caches load memory in **cache lines** (typically 64 bytes) and prefetch ahead. Iterating an array touches neighbouring bytes, so each line brings several useful values; following pointers in a linked list can miss the cache on every node. Summing a 2D array row by row (the order it is laid out in memory in C) can be several times faster than column by column.

### System calls

User programs run in **user mode** and cannot touch hardware directly. To read a file, open a socket or print, they make a **system call**: a controlled jump into the **kernel**, which does the work and returns. Python's \`print\` eventually calls \`write(1, ...)\` on file descriptor 1. You can watch system calls with \`strace\` on Linux or \`dtruss\` on macOS.

### Common mistakes
- Assuming all memory accesses cost the same.
- Believing interpreted languages never compile anything; most compile to bytecode and many JIT-compile.
- Micro-optimising instructions while ignoring cache misses and system calls, which usually dominate.
- Making one system call per byte (unbuffered I/O) instead of reading in blocks.`,
      practice: [
        { title: 'Cache effects', kind: 'exercise', prompt: 'Write a program that sums a 4000x4000 2D array (use a flat array or NumPy in Python, or a 2D array in C or Java) row by row, then column by column. Time both and explain the difference using cache lines.' },
        { title: 'See the layers', kind: 'exercise', prompt: 'Compile a small C function with gcc -S (or use Compiler Explorer) and identify the loads, the add and the store. Then run python -m dis on an equivalent Python function and compare the bytecode with the assembly.' },
        { title: 'Count system calls', kind: 'exercise', prompt: 'On Linux, run strace -c on a program that copies a file one byte at a time and on one that copies it in 64 KB blocks. Compare the number of read and write calls and the run time.' },
      ],
      resources: [
        { title: 'CS50x Week 1: C (compiling)', url: 'https://cs50.harvard.edu/x/2024/weeks/1/', source: 'Harvard CS50', kind: 'video' },
        { title: 'OSTEP: Introduction to Operating Systems', url: 'https://pages.cs.wisc.edu/~remzi/OSTEP/intro.pdf', source: 'Operating Systems: Three Easy Pieces', kind: 'book' },
        { title: 'Nand2Tetris: build a computer from first principles', url: 'https://www.nand2tetris.org/', source: 'Nand2Tetris', kind: 'course' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'JIT',
          prompt: 'What does a just-in-time (JIT) compiler do?',
          options: [
            { id: 'a', text: 'Compiles frequently executed code to machine code while the program runs' },
            { id: 'b', text: 'Compiles the whole program before it is distributed' },
            { id: 'c', text: 'Converts machine code back into source code' },
          ],
          correct: ['a'],
          explanation: 'JITs (like V8 or the JVM HotSpot compiler) profile running code and compile hot paths for speed.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Memory hierarchy',
          prompt: 'Why is iterating over an array usually faster than traversing a linked list of the same length?',
          options: [
            { id: 'a', text: 'Array elements are contiguous, so cache lines and prefetching help' },
            { id: 'b', text: 'Arrays always need fewer CPU instructions per element' },
            { id: 'c', text: 'Linked lists are stored on disk' },
          ],
          correct: ['a'],
          explanation: 'Contiguous memory makes each cache line carry several useful elements; linked-list nodes can be scattered across memory.',
        },
        {
          key: 'q3',
          type: 'matching',
          title: 'Build tools',
          prompt: 'Match each tool to what it does.',
          pairs: {
            left: [
              { id: 'comp', text: 'Compiler' },
              { id: 'link', text: 'Linker' },
              { id: 'load', text: 'Loader' },
              { id: 'interp', text: 'Interpreter' },
            ],
            right: [
              { id: 'r1', text: 'Translates source code into machine code ahead of time' },
              { id: 'r2', text: 'Combines object files and libraries into one executable' },
              { id: 'r3', text: 'Places an executable into memory so it can start running' },
              { id: 'r4', text: 'Executes code or bytecode step by step at runtime' },
            ],
          },
          matches: { comp: 'r1', link: 'r2', load: 'r3', interp: 'r4' },
          explanation: 'Compiled languages pass through compiler, linker and loader; interpreted ones run inside an interpreter, often with a JIT for hot code.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'System calls',
          prompt: 'A normal user program can write directly to the disk hardware without asking the operating system kernel.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'User-mode code must make a system call; the kernel performs the privileged operation and enforces permissions.',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'Cache line size',
          prompt: 'On most modern CPUs, a cache line is ____ bytes.',
          accepted: [['64']],
          explanation: 'Caches move memory in 64-byte lines, so touching one byte loads its neighbours too.',
        },
      ],
    },

    // ------------------------------------------------------------------ 2
    {
      slug: 'data-representation',
      title: 'Data representation: binary, integers, floats and text',
      module: 'The machine',
      skill: 'computer-architecture',
      minutes: 45,
      objectives: [
        'Convert between decimal, binary and hexadecimal',
        'Explain two\'s complement and predict integer overflow',
        'Explain why floating-point arithmetic is approximate and how to compare floats',
        'Describe how UTF-8 encodes text and why string length depends on encoding',
      ],
      body: `Everything in memory is bits. The same 8 bits can be a number, a character or part of an instruction; the **type** tells the program how to interpret them.

### Binary and hexadecimal

A **bit** is 0 or 1; a **byte** is 8 bits and holds 256 values (0-255). Binary place values are powers of two:

\`\`\`text
binary 1011 0110 = 128 + 32 + 16 + 4 + 2 = 182
hex    0xB6      = 11 x 16 + 6        = 182
\`\`\`

Each hex digit is exactly 4 bits, which is why memory addresses, colours (\`#FF8800\`) and byte dumps are written in hex: \`0xFF\` = 255, \`0x10\` = 16.

### Signed integers: two's complement

To store negative numbers, CPUs use **two's complement**: invert the bits and add one.

\`\`\`text
 5  = 0000 0101
-5  = 1111 1010 + 1 = 1111 1011
8-bit signed range: -128 to 127
\`\`\`

Addition works the same for positive and negative numbers, which is why hardware uses it. **Overflow** happens when a result does not fit: in 8 bits, 127 + 1 wraps to -128. A 32-bit signed int tops out at 2,147,483,647; adding 1 in Java gives -2,147,483,648, and in C signed overflow is undefined behaviour. Python integers grow as needed, so they never overflow, but values passed to databases or other languages can.

### Floating point

Floats (IEEE 754) store a sign, an exponent and a fraction in binary, like scientific notation in base 2. Many decimal fractions, such as 0.1, have no exact binary form, just as 1/3 has no exact decimal form.

\`\`\`python
>>> 0.1 + 0.2
0.30000000000000004
>>> abs((0.1 + 0.2) - 0.3) < 1e-9     # compare with a tolerance
True
>>> from decimal import Decimal
>>> Decimal("0.1") + Decimal("0.2")
Decimal('0.3')
\`\`\`

A 64-bit double has about 15-17 significant decimal digits. Use integers (cents) or a decimal type for money, and a tolerance (\`math.isclose\`) when comparing floats.

### Text and UTF-8

A character set gives each character a number (a **code point**): "A" is U+0041, "é" is U+00E9, "€" is U+20AC. An **encoding** turns code points into bytes. **UTF-8**, the web's default, uses 1 byte for ASCII and 2-4 bytes for others:

\`\`\`python
>>> len("café")                     # characters
4
>>> len("café".encode("utf-8"))     # bytes: é takes 2
5
>>> "€".encode("utf-8").hex()      # 3 bytes: E2 82 AC
'e282ac'
\`\`\`

Decoding bytes with the wrong encoding produces garbled text such as "cafÃ©".

### Byte order

Multi-byte numbers can be stored most significant byte first (**big-endian**, used in network protocols) or least significant first (**little-endian**, used by x86 and most ARM systems). 0x12345678 in little-endian memory is the bytes 78 56 34 12.

### Common mistakes
- Comparing floats with \`==\`.
- Using floats for currency.
- Assuming one character is one byte, or that string length in characters equals storage size.
- Ignoring overflow when moving numbers between Python and a 32-bit column or another language.
- Reading binary data on one machine and assuming the same byte order on another.`,
      practice: [
        { title: 'Integer overflow', kind: 'exercise', prompt: 'In C or Java, add 1 to the maximum 32-bit signed integer and print the result. Explain the output using two\'s complement, then show the same calculation in Python and explain why it differs.' },
        { title: 'By hand', kind: 'exercise', prompt: 'Convert 200 and 45 to binary and hex by hand, write -45 in 8-bit two\'s complement, and add 200 + 45 in 8 unsigned bits to show what overflow produces. Check your answers with Python bin(), hex() and int(x, 2).' },
        { title: 'Encoding detective', kind: 'exercise', prompt: 'Write "naïve café" to a file as UTF-8, then read it back decoded as Latin-1. Explain the garbled output byte by byte, and count characters versus bytes for three strings in different scripts.' },
      ],
      resources: [
        { title: 'CS50x Week 0: Scratch (binary, representation)', url: 'https://cs50.harvard.edu/x/2024/weeks/0/', source: 'Harvard CS50', kind: 'video' },
        { title: 'The Floating-Point Guide', url: 'https://floating-point-gui.de/', source: 'floating-point-gui.de', kind: 'article' },
        { title: 'UTF-8', url: 'https://en.wikipedia.org/wiki/UTF-8', source: 'Wikipedia', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Hex',
          prompt: 'What is the decimal value of `0x2F`?',
          options: [
            { id: 'a', text: '29' },
            { id: 'b', text: '47' },
            { id: 'c', text: '215' },
          ],
          correct: ['b'],
          explanation: '2 x 16 + 15 = 47.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Overflow',
          prompt: 'An 8-bit signed integer holds 127. What does it hold after adding 1, with wrap-around?',
          options: [
            { id: 'a', text: '128' },
            { id: 'b', text: '0' },
            { id: 'c', text: '-128' },
          ],
          correct: ['c'],
          explanation: '0111 1111 + 1 = 1000 0000, which in two\'s complement is -128.',
          difficulty: 'medium',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Float equality',
          prompt: 'In Python, `0.1 + 0.2 == 0.3` evaluates to True.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'The sum is 0.30000000000000004 because 0.1 and 0.2 are binary approximations. Compare with a tolerance such as math.isclose.',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'UTF-8 bytes',
          prompt: 'In UTF-8, the string "café" has 4 characters and takes ____ bytes.',
          accepted: [['5', 'five']],
          explanation: 'c, a and f take one byte each; é (U+00E9) takes two bytes in UTF-8.',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Safe practices',
          prompt: 'Which practices avoid number and text bugs? Select all that apply.',
          options: [
            { id: 'a', text: 'Store money as integer cents or a decimal type' },
            { id: 'b', text: 'Compare floats with a tolerance' },
            { id: 'c', text: 'Specify the encoding explicitly when reading and writing text files' },
            { id: 'd', text: 'Assume every character is one byte' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Exact money types, tolerant float comparison and explicit encodings prevent common bugs. Many characters take 2-4 bytes in UTF-8.',
        },
      ],
    },

    // ------------------------------------------------------------------ 3
    {
      slug: 'processes-and-threads',
      title: 'Processes and threads',
      module: 'Operating systems',
      skill: 'operating-systems',
      minutes: 55,
      milestone: true,
      completionCriteria: 'Pass the quiz and complete the race-condition exercise, showing the bug and a fix with a lock.',
      objectives: [
        'Distinguish a program, a process and a thread',
        'Explain process states, context switches and what the scheduler does',
        'Describe how fork and exec start new programs',
        'Identify race conditions and fix them with locks',
        'Describe deadlock and how to avoid it',
      ],
      body: `A **program** is a file on disk. A **process** is a running instance of it, with its own **address space** (memory), open files, environment and at least one **thread**. A **thread** is a sequence of execution with its own stack, registers and program counter; threads in the same process **share memory**.

\`\`\`text
Process A (own memory)          Process B (own memory)
 ├─ thread 1  [stack]            └─ thread 1  [stack]
 ├─ thread 2  [stack]
 └─ shared heap, code, open files
\`\`\`

### Process states and scheduling

\`\`\`text
          admitted        scheduled
  new ──────────> ready ───────────> running ──exit──> terminated
                    ^   <─preempted──   │
                    │                   │ waits for I/O, a lock, sleep
                    └──── I/O done ── blocked
\`\`\`

The OS **scheduler** gives each runnable thread a short time slice (a few milliseconds) on a CPU core, then performs a **context switch**: save its registers and program counter, load another's. A switch costs microseconds directly, plus colder caches afterwards. Threads waiting for disk or network are **blocked** and use no CPU, which is why one core can serve many I/O-bound threads.

### Starting programs: fork and exec

On Unix, \`fork()\` creates a child process as a copy of the parent (cheaply, with copy-on-write pages). It returns 0 in the child and the child's PID in the parent. The child then calls \`exec()\` to replace its program. That is how a shell runs \`ls\`:

\`\`\`python
import os
pid = os.fork()
if pid == 0:
    os.execvp("ls", ["ls", "-l"])       # child becomes ls
else:
    os.waitpid(pid, 0)                  # parent waits, collecting the exit status
\`\`\`

A child that has exited but has not been waited for is a **zombie**; a child whose parent died is adopted by the init process.

### Processes vs threads

| | Processes | Threads |
|---|---|---|
| Memory | isolated | shared |
| Crash impact | contained to one process | can take down the whole process |
| Communication | pipes, sockets, shared memory | ordinary variables (with locks) |
| Creation cost | higher | lower |

Browsers run tabs in separate processes so one crashing page does not take down the rest.

### Race conditions

\`\`\`python
counter = 0
def work():
    global counter
    for _ in range(100_000):
        counter += 1          # read, add, write: not atomic
\`\`\`

Two threads can both read 41 and both write 42, losing an increment. Protect the **critical section** with a **lock** (mutex): \`with lock: counter += 1\`.

### Deadlock

Thread 1 holds lock A and waits for B; thread 2 holds B and waits for A. Neither can proceed. Avoid it by always acquiring locks in the same order, holding them briefly, or using timeouts. The next lesson covers concurrency tools in depth.

### Common mistakes
- Assuming \`x += 1\` is atomic.
- Sharing mutable state between threads without synchronisation.
- Creating one thread per request without a limit.
- Forgetting to wait for child processes, leaving zombies.
- Assuming more threads always means more speed; CPU-bound work cannot use more threads than cores.`,
      practice: [
        { title: 'Race condition', kind: 'exercise', prompt: 'Write a program where 4 threads each increment a shared counter 1,000,000 times without a lock and print the result. Run it several times. Then add a lock and confirm the result is always 4,000,000. (In CPython, use a read-modify-write pattern such as tmp = counter; counter = tmp + 1 to make the race easier to see.)' },
        { title: 'Explore processes', kind: 'exercise', prompt: 'Run ps aux (or Task Manager) and pick three processes. For each, find its PID, parent PID, thread count and memory use, and explain why a browser might run many processes.' },
        { title: 'A tiny shell', kind: 'exercise', prompt: 'Write a loop that reads a command line, forks, execs the command in the child and waits in the parent. Print the exit status. Then explain what would happen if the parent never called wait.' },
      ],
      resources: [
        { title: 'OSTEP: The Abstraction: The Process', url: 'https://pages.cs.wisc.edu/~remzi/OSTEP/cpu-intro.pdf', source: 'Operating Systems: Three Easy Pieces', kind: 'book' },
        { title: 'OSTEP: Interlude: Process API', url: 'https://pages.cs.wisc.edu/~remzi/OSTEP/cpu-api.pdf', source: 'Operating Systems: Three Easy Pieces', kind: 'book' },
        { title: 'OSTEP: Concurrency: An Introduction', url: 'https://pages.cs.wisc.edu/~remzi/OSTEP/threads-intro.pdf', source: 'Operating Systems: Three Easy Pieces', kind: 'book' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Shared memory',
          prompt: 'What do threads of the same process share?',
          options: [
            { id: 'a', text: 'Nothing; each thread has its own memory' },
            { id: 'b', text: 'The heap and global data, but each thread has its own stack and registers' },
            { id: 'c', text: 'Only open files' },
          ],
          correct: ['b'],
          explanation: 'Threads share the address space (heap, globals, code, open files) and each has a private stack and register state.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Deadlock prevention',
          prompt: 'Which practice prevents the classic two-lock deadlock?',
          options: [
            { id: 'a', text: 'Always acquiring locks in the same global order' },
            { id: 'b', text: 'Using more threads' },
            { id: 'c', text: 'Increasing the time slice' },
          ],
          correct: ['a'],
          explanation: 'A consistent lock order makes a circular wait impossible, which removes one of the necessary conditions for deadlock.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Atomic increment',
          prompt: '`counter += 1` on a shared variable is safe to run from several threads without a lock.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'It is a read, an add and a write. Another thread can interleave between them and an update is lost.',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'fork return value',
          prompt: 'After a successful `fork()`, the call returns the number ____ in the child process.',
          accepted: [['0', 'zero']],
          explanation: 'fork returns 0 in the child and the child\'s PID in the parent, which is how each side knows which branch to take.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'Blocked threads',
          prompt: 'A thread is waiting for a network response. What state is it in, and does it use CPU time?',
          options: [
            { id: 'a', text: 'Running; it spins on the CPU until data arrives' },
            { id: 'b', text: 'Blocked; it uses no CPU until the I/O completes and it becomes ready again' },
            { id: 'c', text: 'Terminated; it restarts when data arrives' },
          ],
          correct: ['b'],
          explanation: 'Blocked threads are not scheduled. When the I/O completes, the thread moves to ready and waits for a time slice.',
        },
      ],
    },

    // ------------------------------------------------------------------ 4
    {
      slug: 'concurrency-basics',
      title: 'Concurrency basics: locks, coordination and async I/O',
      module: 'Operating systems',
      skill: 'concurrency',
      minutes: 55,
      objectives: [
        'Distinguish concurrency from parallelism',
        'Use mutexes, condition variables and thread-safe queues correctly',
        'State the four conditions for deadlock and how to break each',
        'Choose between threads, processes and async I/O for a workload',
      ],
      body: `**Concurrency** is structuring a program as several tasks that make progress over overlapping time. **Parallelism** is running tasks at literally the same moment on different cores. A single-core machine can be concurrent but not parallel.

### Mutexes and critical sections

A **mutex** (lock) allows one thread at a time into a critical section. Keep critical sections short, and never do slow I/O while holding a lock.

\`\`\`python
import threading
lock = threading.Lock()
balance = 0

def deposit(amount):
    global balance
    with lock:                 # acquire; released even if an exception occurs
        balance += amount
\`\`\`

### Waiting for a condition: producer and consumer

Threads often need to wait until something is true ("the buffer has an item"). Busy-waiting in a loop wastes CPU. A **condition variable** lets a thread sleep until another signals it.

\`\`\`python
import threading
from collections import deque

buf, CAP = deque(), 10
cond = threading.Condition()

def produce(item):
    with cond:
        while len(buf) >= CAP:     # while, not if: re-check after waking
            cond.wait()
        buf.append(item)
        cond.notify_all()

def consume():
    with cond:
        while not buf:
            cond.wait()
        item = buf.popleft()
        cond.notify_all()
        return item
\`\`\`

Always wait in a \`while\` loop: another thread may take the item first, and spurious wake-ups are allowed. In practice, use a ready-made thread-safe queue (\`queue.Queue\` in Python, \`BlockingQueue\` in Java, channels in Go). A **semaphore** generalises a lock to N holders, for example "at most 5 concurrent database connections".

### Deadlock: four conditions

Deadlock requires all four at once, so breaking any one prevents it:

| Condition | Meaning | How to break it |
|---|---|---|
| Mutual exclusion | resources held exclusively | use lock-free structures or immutable data |
| Hold and wait | hold one lock while waiting for another | acquire all needed locks at once |
| No preemption | locks cannot be taken away | use \`try_lock\` with timeout and back off |
| Circular wait | A waits for B, B waits for A | acquire locks in one global order |

### Threads, processes or async?

| Workload | Good fit | Why |
|---|---|---|
| CPU-bound (image processing, number crunching) | processes, or threads in languages with true parallel threads | uses all cores |
| I/O-bound, moderate concurrency | thread pool | simple blocking code |
| I/O-bound, thousands of connections | async I/O with an event loop | one thread, tiny per-task cost |

In the default CPython build, the **global interpreter lock (GIL)** lets only one thread run Python bytecode at a time, so CPU-bound Python code uses \`multiprocessing\` for parallelism, while threads still help with I/O.

**Async I/O** (Node.js, Python \`asyncio\`) runs many tasks on one thread. Each task \`await\`s I/O, and the event loop runs other tasks meanwhile. The catch: one blocking call (CPU-heavy work or a synchronous library) stalls every task on the loop.

\`\`\`python
import asyncio
async def fetch(i):
    await asyncio.sleep(1)          # stands in for a network call
    return i
async def main():
    results = await asyncio.gather(*(fetch(i) for i in range(100)))
    print(len(results))             # about 1 second total, not 100
asyncio.run(main())
\`\`\`

### Common mistakes
- Waiting on a condition with \`if\` instead of \`while\`.
- Holding a lock while making a network call.
- Creating unbounded threads instead of a fixed-size pool.
- Calling blocking functions inside async code.
- Using threads for CPU-bound Python and expecting a speed-up.`,
      practice: [
        { title: 'Bounded buffer', kind: 'exercise', prompt: 'Implement a bounded queue with put and get using a lock and condition variables, then run 3 producers and 3 consumers that move 10,000 items. Verify that every item is consumed exactly once and that the buffer never exceeds its capacity.' },
        { title: 'Cause and fix a deadlock', kind: 'exercise', prompt: 'Write two threads that transfer money between two accounts in opposite directions, each locking the source then the destination. Show it can hang, then fix it by always locking the account with the smaller ID first.' },
        { title: 'Threads vs async vs processes', kind: 'exercise', prompt: 'Time three versions of downloading (or simulating with sleep) 50 URLs: sequential, a thread pool of 10, and asyncio. Then time a CPU-heavy task (summing squares to 10^7, four times) with threads versus processes. Explain each result.' },
      ],
      resources: [
        { title: 'OSTEP: Locks', url: 'https://pages.cs.wisc.edu/~remzi/OSTEP/threads-locks.pdf', source: 'Operating Systems: Three Easy Pieces', kind: 'book' },
        { title: 'OSTEP: Condition Variables', url: 'https://pages.cs.wisc.edu/~remzi/OSTEP/threads-cv.pdf', source: 'Operating Systems: Three Easy Pieces', kind: 'book' },
        { title: 'OSTEP: Common Concurrency Problems', url: 'https://pages.cs.wisc.edu/~remzi/OSTEP/threads-bugs.pdf', source: 'Operating Systems: Three Easy Pieces', kind: 'book' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Concurrency vs parallelism',
          prompt: 'A single-core machine runs a web server that handles 100 connections by switching between them. Which statement is accurate?',
          options: [
            { id: 'a', text: 'It is concurrent but not parallel' },
            { id: 'b', text: 'It is parallel but not concurrent' },
            { id: 'c', text: 'It is neither' },
          ],
          correct: ['a'],
          explanation: 'Tasks make overlapping progress (concurrency), but only one runs at any instant on one core, so there is no parallelism.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Waiting in a loop',
          prompt: 'A thread waiting on a condition variable should re-check its condition in a `while` loop after waking up.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Another thread may have changed the state before this one reacquired the lock, and spurious wake-ups are permitted.',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'Deadlock conditions',
          prompt: 'Which are among the four necessary conditions for deadlock? Select all that apply.',
          options: [
            { id: 'a', text: 'Circular wait' },
            { id: 'b', text: 'Hold and wait' },
            { id: 'c', text: 'No preemption' },
            { id: 'd', text: 'High CPU usage' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'The four conditions are mutual exclusion, hold and wait, no preemption and circular wait. CPU usage is unrelated.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'Blocking the loop',
          prompt: 'An asyncio web server becomes unresponsive whenever one request resizes a large image in plain Python code. Why?',
          options: [
            { id: 'a', text: 'The CPU-bound work runs on the event loop thread and blocks every other task' },
            { id: 'b', text: 'asyncio can only handle one request at a time by design' },
            { id: 'c', text: 'Image files cannot be opened in async code' },
          ],
          correct: ['a'],
          explanation: 'Async code only switches tasks at await points. Move CPU-heavy work to a process pool (or a thread for releasing libraries) so the loop stays free.',
        },
        {
          key: 'q5',
          type: 'matching',
          title: 'Pick the tool',
          prompt: 'Match each situation to the best-fitting tool.',
          pairs: {
            left: [
              { id: 's1', text: 'Allow at most 5 concurrent database connections' },
              { id: 's2', text: 'Protect a shared counter from lost updates' },
              { id: 's3', text: 'Hand work items from producers to consumers' },
              { id: 's4', text: 'Serve 10,000 mostly idle WebSocket connections' },
            ],
            right: [
              { id: 'r1', text: 'Semaphore' },
              { id: 'r2', text: 'Mutex' },
              { id: 'r3', text: 'Thread-safe queue' },
              { id: 'r4', text: 'Async I/O event loop' },
            ],
          },
          matches: { s1: 'r1', s2: 'r2', s3: 'r3', s4: 'r4' },
          explanation: 'A semaphore counts permits, a mutex allows one holder, a queue coordinates producers and consumers, and an event loop handles many idle connections cheaply.',
        },
      ],
    },

    // ------------------------------------------------------------------ 5
    {
      slug: 'memory-and-virtual-memory',
      title: 'Memory and virtual memory',
      module: 'Operating systems',
      skill: 'operating-systems',
      minutes: 50,
      objectives: [
        'Describe the layout of a process address space: code, data, heap, stack',
        'Translate a virtual address to a physical address using pages and a page table',
        'Explain page faults, swapping and why they hurt performance',
        'Recognise stack overflows and memory leaks, and how garbage collectors help',
      ],
      body: `Every process believes it has a large, private, contiguous memory. That is an illusion created by **virtual memory**.

\`\`\`text
high addresses   ┌──────────────┐
                 │    stack     │  function frames, local variables (grows down)
                 │      ↓       │
                 │      ↑       │
                 │     heap     │  dynamic allocations: malloc, new, objects
                 ├──────────────┤
                 │  data / bss  │  globals
                 │     code     │  machine instructions (read-only)
low addresses    └──────────────┘
\`\`\`

### Pages and translation

Memory is divided into fixed-size **pages** (commonly 4 KB). The OS keeps a **page table** per process that maps virtual page numbers to physical frames. The CPU's **MMU** translates every address, and a **TLB** caches recent translations so most lookups are fast.

Worked example with 4 KB pages (4096 = 2^12, so the low 12 bits are the offset):

\`\`\`text
virtual address   0x00403A7C
offset            low 12 bits   = 0xA7C
virtual page      remaining     = 0x00403
page table        0x00403 -> frame 0x1F2
physical address  0x1F2 followed by 0xA7C = 0x1F2A7C
\`\`\`

The offset never changes; only the page number is replaced.

### Why virtual memory is useful

- **Isolation:** one process cannot read another's memory; its page table simply has no mapping.
- **Lazy allocation:** pages get physical memory only when first touched, so a program can reserve a large range cheaply.
- **Sharing:** the same library code page can be mapped into many processes; \`fork\` shares pages copy-on-write.

### Page faults and swapping

A **page fault** happens when a process touches a page with no valid mapping in RAM. If it is a first touch, the OS allocates a frame quickly. If the page was swapped to disk, loading it takes milliseconds instead of nanoseconds. A system that spends its time swapping is **thrashing**. A **segmentation fault** is an access to an address the process may not use at all (such as dereferencing a null pointer), and the OS kills the process.

### Stack vs heap

Stack allocation is just moving the stack pointer and is freed automatically when a function returns. The stack is small (often 8 MB for the main thread), so deep recursion causes a **stack overflow**: a crash in C, or \`RecursionError\` in Python, which stops at a default depth of 1,000 frames. Heap memory must be freed: manually in C (\`free\`), by **reference counting** plus a cycle collector in CPython, or by a **tracing garbage collector** in Java, Go and JavaScript.

A **memory leak** is memory that is no longer needed but never freed. In garbage-collected languages it usually means something still holds a reference, such as an ever-growing cache or a listener that is never removed.

### Common mistakes
- Returning a pointer to a local (stack) variable in C.
- Unbounded caches or global lists that act as leaks in garbage-collected languages.
- Very deep recursion on large inputs; convert to an explicit stack or loop.
- Reading "used memory" without distinguishing reserved virtual memory from resident physical memory.`,
      practice: [
        { title: 'Find the limit', kind: 'exercise', prompt: 'Write a recursive function with no base case in Python and in C (or Java). Record the error each produces and explain what limit was hit in each case.' },
        { title: 'Address translation', kind: 'exercise', prompt: 'With 4 KB pages, split the virtual address 0x00C0FFEE into a virtual page number and an offset. If the page table maps that page to frame 0x2A0, compute the physical address. Then redo it for 2 MB pages.' },
        { title: 'Spot the leak', kind: 'exercise', prompt: 'Write a small web handler (or loop) that appends every request to a global list "for debugging". Measure memory growth over 100,000 iterations, explain why the garbage collector cannot free it, and fix it with a bounded structure.' },
      ],
      resources: [
        { title: 'OSTEP: The Abstraction: Address Spaces', url: 'https://pages.cs.wisc.edu/~remzi/OSTEP/vm-intro.pdf', source: 'Operating Systems: Three Easy Pieces', kind: 'book' },
        { title: 'OSTEP: Paging: Introduction', url: 'https://pages.cs.wisc.edu/~remzi/OSTEP/vm-paging.pdf', source: 'Operating Systems: Three Easy Pieces', kind: 'book' },
        { title: 'CS50x Week 4: Memory', url: 'https://cs50.harvard.edu/x/2024/weeks/4/', source: 'Harvard CS50', kind: 'video' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Page fault',
          prompt: 'What triggers a page fault?',
          options: [
            { id: 'a', text: 'Accessing a virtual page that is not currently mapped to physical memory' },
            { id: 'b', text: 'Dividing by zero' },
            { id: 'c', text: 'Calling a function recursively' },
          ],
          correct: ['a'],
          explanation: 'The MMU finds no valid mapping, so the OS steps in to load the page (or kill the process if the access is illegal).',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Stack overflow',
          prompt: 'Unbounded recursion usually crashes with which error?',
          options: [
            { id: 'a', text: 'Stack overflow' },
            { id: 'b', text: 'Heap fragmentation' },
            { id: 'c', text: 'Page table full' },
          ],
          correct: ['a'],
          explanation: 'Each call pushes a frame onto the stack, which has a fixed maximum size.',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Page offset',
          prompt: 'With 4 KB pages, the offset within a page is given by the lowest ____ bits of a virtual address.',
          accepted: [['12', 'twelve']],
          explanation: '4 KB is 4096 = 2^12 bytes, so 12 bits address every byte in a page.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Leaks with a GC',
          prompt: 'Programs in garbage-collected languages such as Java or Python cannot have memory leaks.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'A collector frees only unreachable objects. Anything still referenced, such as entries in an unbounded cache, stays in memory forever.',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Benefits of virtual memory',
          prompt: 'Which are benefits of virtual memory? Select all that apply.',
          options: [
            { id: 'a', text: 'Processes are isolated from each other\'s memory' },
            { id: 'b', text: 'Shared libraries can be mapped into many processes once' },
            { id: 'c', text: 'Physical memory is allocated lazily on first touch' },
            { id: 'd', text: 'Memory accesses become faster than cache hits' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Virtual memory provides isolation, sharing and lazy allocation. Translation adds work, which the TLB keeps cheap; it never beats a cache hit.',
        },
      ],
    },

    // ------------------------------------------------------------------ 6
    {
      slug: 'file-systems',
      title: 'File systems',
      module: 'Operating systems',
      skill: 'operating-systems',
      minutes: 45,
      objectives: [
        'Explain files, directories, inodes and file descriptors',
        'Describe buffering, the page cache and fsync',
        'Replace a file atomically with write, fsync and rename',
        'Explain how journaling protects against crashes',
      ],
      body: `A **file system** organises raw disk blocks into named files and directories, and decides what survives a crash.

\`\`\`text
path "/home/asha/notes.txt"
   → directory entries map names to inode numbers
   → inode 4211: size, owner, permissions, timestamps, pointers to data blocks
   → data blocks on disk
\`\`\`

### Inodes, names and links

An **inode** stores a file's metadata and where its data lives. The **name** is stored in the directory, which is why a **hard link** is just another name for the same inode, and the data is freed only when the last name is removed and no process has it open. A **symbolic link** is a small file containing a path; if the target is deleted, the symlink dangles.

\`\`\`text
$ ls -i notes.txt          4211 notes.txt
$ ln notes.txt backup.txt  # hard link: same inode 4211
$ ln -s notes.txt latest   # symlink: new inode containing "notes.txt"
\`\`\`

### File descriptors

When a program opens a file, the kernel returns a **file descriptor**, a small integer index into the process's table of open files. 0, 1 and 2 are stdin, stdout and stderr, which is why \`2>errors.log\` redirects error output. \`read\`, \`write\`, \`lseek\` and \`close\` all take a descriptor. Each process has a limit on open descriptors (often 1,024 by default, see \`ulimit -n\`), and sockets count too, so leaking descriptors eventually breaks a server with "Too many open files".

### Buffering and durability

\`\`\`text
your program ──write()──> language buffer ──flush──> kernel page cache ──fsync / later──> disk
\`\`\`

\`write()\` usually copies data into the kernel's **page cache** and returns immediately; the OS flushes to disk later. A power cut can lose recently "written" data. \`fsync(fd)\` forces the data to stable storage before returning, which is what databases do on commit (and why commits cost time).

\`\`\`python
import os
with open("data.json", "w") as f:
    f.write(payload)
    f.flush()             # language buffer -> kernel
    os.fsync(f.fileno())  # kernel -> disk
\`\`\`

### Safe file replacement

Overwriting a file in place can leave it half-written after a crash. Instead: write to a temporary file in the **same directory**, fsync it, then \`rename()\` it over the original. Rename is atomic within one POSIX file system, so readers see either the old file or the new one. For the rename itself to be durable, fsync the directory as well.

### Journaling

Updating a file touches several structures (the inode, a free-block bitmap, data blocks). A crash in the middle could leave them inconsistent. **Journaling** file systems such as ext4 and NTFS first write the intended changes to a log, then apply them (APFS and ZFS reach the same goal with copy-on-write). After a crash, the file system replays complete log entries and discards incomplete ones instead of scanning the whole disk.

### Common mistakes
- Assuming \`write()\` means "on disk".
- Overwriting a file in place and corrupting it on a crash.
- Leaking file descriptors by never closing files or sockets.
- Writing the temporary file to a different file system (such as /tmp) and expecting rename to be atomic.
- Deleting a large log file while a process still has it open, and wondering why disk space is not freed.`,
      practice: [
        { title: 'Atomic save', kind: 'exercise', prompt: 'Implement save_atomic(path, data) that writes to a temp file in the same directory, fsyncs it, renames it over path and fsyncs the directory. Explain why the temp file must be on the same file system.' },
        { title: 'Inspect inodes', kind: 'exercise', prompt: 'On Linux or macOS, use ls -i and stat on a file, create a hard link and a symbolic link to it, and explain what happens to each link when you delete the original name.' },
        { title: 'Descriptor leak', kind: 'exercise', prompt: 'Write a loop that opens a file 5,000 times without closing it and record the error. Fix it with a context manager (with) or try/finally, and check the limit with ulimit -n.' },
      ],
      resources: [
        { title: 'OSTEP: Files and Directories', url: 'https://pages.cs.wisc.edu/~remzi/OSTEP/file-intro.pdf', source: 'Operating Systems: Three Easy Pieces', kind: 'book' },
        { title: 'OSTEP: Crash Consistency: FSCK and Journaling', url: 'https://pages.cs.wisc.edu/~remzi/OSTEP/file-journaling.pdf', source: 'Operating Systems: Three Easy Pieces', kind: 'book' },
        { title: 'Operating Systems: Three Easy Pieces (full book)', url: 'https://pages.cs.wisc.edu/~remzi/OSTEP/', source: 'Remzi and Andrea Arpaci-Dusseau', kind: 'book' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'fsync',
          prompt: 'Why do databases call `fsync` when a transaction commits?',
          options: [
            { id: 'a', text: 'To make sure the data reaches stable storage before reporting success' },
            { id: 'b', text: 'To compress the file' },
            { id: 'c', text: 'To release locks' },
          ],
          correct: ['a'],
          explanation: 'write() may leave data in the page cache. fsync forces it to disk so a committed transaction survives a crash (durability).',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Inodes and names',
          prompt: 'A file\'s name is stored in its inode.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Names live in directory entries that point to inodes. That is why one inode can have several hard-link names.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Atomic replace',
          prompt: 'Which sequence safely replaces a config file so readers never see a half-written version?',
          options: [
            { id: 'a', text: 'Open the file with truncate, write the new content, close' },
            { id: 'b', text: 'Write a temp file in the same directory, fsync it, rename it over the original' },
            { id: 'c', text: 'Delete the original, then write the new file with the same name' },
          ],
          correct: ['b'],
          explanation: 'Rename is atomic within one file system, so readers see the old or new file. Options a and c leave a window with an empty or missing file.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Standard descriptors',
          prompt: 'By convention, file descriptor ____ is standard error (stderr).',
          accepted: [['2', 'two']],
          explanation: '0 is stdin, 1 is stdout and 2 is stderr, which is why `2>file` redirects errors.',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Hard and symbolic links',
          prompt: 'You create a hard link and a symbolic link to `notes.txt`, then delete `notes.txt`. Which statements are true? Select all that apply.',
          options: [
            { id: 'a', text: 'The hard link still opens the file\'s data' },
            { id: 'b', text: 'The symbolic link now dangles' },
            { id: 'c', text: 'Both links are deleted automatically' },
          ],
          correct: ['a', 'b'],
          explanation: 'The hard link is another name for the same inode, so the data survives. The symlink stores the path "notes.txt", which no longer exists.',
        },
      ],
    },

    // ------------------------------------------------------------------ 7
    {
      slug: 'networking-tcp-ip-dns',
      title: 'Networking: TCP/IP and DNS',
      module: 'Networks',
      skill: 'networking',
      minutes: 55,
      objectives: [
        'Describe the layers of the TCP/IP model and what each adds',
        'Explain IP addresses, private ranges, NAT, ports and sockets',
        'Compare TCP and UDP and explain the three-way handshake',
        'Trace a DNS lookup from resolver to authoritative server',
      ],
      body: `Networking is organised in **layers**; each adds a header and relies on the one below.

\`\`\`text
Application   HTTP, DNS, SMTP      "GET /index.html"
Transport     TCP / UDP            ports, reliability
Internet      IP                   addresses, routing between networks
Link          Ethernet, Wi-Fi      frames on the local network
\`\`\`

### Addresses, NAT and ports

An IPv4 address is 32 bits (\`203.0.113.7\`); IPv6 is 128 bits (\`2001:db8::1\`). **CIDR** notation such as \`192.168.1.0/24\` means the first 24 bits identify the network, leaving 256 addresses. Private ranges (\`10.0.0.0/8\`, \`172.16.0.0/12\`, \`192.168.0.0/16\`) are not routed on the internet; your home router uses **NAT** to share one public address among many devices.

**IP** delivers packets on a best-effort basis: packets can be lost, duplicated or reordered. **Ports** (0-65535) identify which program on a host gets the data: 22 SSH, 53 DNS, 80 HTTP, 443 HTTPS, 5432 PostgreSQL. A connection is identified by four values: source IP, source port, destination IP, destination port.

### Sockets in practice

A **socket** is the endpoint a program reads and writes. A TCP echo server:

\`\`\`python
import socket
srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(("127.0.0.1", 9000))
srv.listen()
conn, addr = srv.accept()            # blocks until a client connects
while data := conn.recv(4096):       # empty bytes means the client closed
    conn.sendall(data)
\`\`\`

Try it with \`nc 127.0.0.1 9000\`.

### TCP

TCP builds a reliable, ordered **byte stream** on top of IP: sequence numbers, acknowledgements, retransmission of lost segments, **flow control** (the receiver advertises how much it can accept) and **congestion control** (the sender slows down when the network drops packets). A connection starts with a **three-way handshake**:

\`\`\`text
client ── SYN ──────────> server
client <── SYN-ACK ────── server
client ── ACK ──────────> server     (one round trip before data flows)
\`\`\`

TCP has no message boundaries: two \`send\` calls can arrive in one \`recv\`, or one can be split across two. Protocols add framing, such as a length prefix or a newline delimiter.

### UDP

UDP sends independent datagrams with no handshake, ordering or retransmission. It has lower latency and suits DNS queries, video calls, games and QUIC (the transport under HTTP/3), where the application handles loss itself.

### DNS

DNS turns names into IP addresses:

\`\`\`text
browser cache → OS cache → recursive resolver (ISP or a public resolver such as 1.1.1.1)
   resolver asks: root server → ".com" TLD server → example.com's authoritative server
   answer: A record 93.184.215.14 (TTL 3600) → cached along the way
\`\`\`

Common record types: **A** (IPv4), **AAAA** (IPv6), **CNAME** (alias), **MX** (mail), **TXT** (verification, SPF), **NS** (which servers are authoritative). The **TTL** controls caching, which is why DNS changes take time to propagate; lower the TTL a day before a migration.

### Common mistakes
- Thinking TCP preserves message boundaries.
- Forgetting DNS caching when debugging a migration.
- Binding a server to 127.0.0.1 and wondering why other machines cannot reach it (use 0.0.0.0 to listen on all interfaces, with a firewall).
- Blaming the network before checking which port a service actually listens on (\`ss -ltn\` or \`lsof -i\`).`,
      practice: [
        { title: 'Trace DNS', kind: 'exercise', prompt: 'Run dig +trace example.com (or nslookup) and identify the root, TLD and authoritative steps. Then look up the A, AAAA and MX records for a domain you use and note their TTLs.' },
        { title: 'A tiny TCP server', kind: 'exercise', prompt: 'Following Beej\'s guide or your language\'s socket library, write a TCP echo server and connect to it with nc. Send two messages quickly and observe whether they arrive as one read or two. Then add newline framing so the server handles one line at a time.' },
        { title: 'Subnet arithmetic', kind: 'exercise', prompt: 'For 10.20.0.0/16 and 192.168.4.0/22, compute the number of addresses and the first and last address in each range. Check your answers with Python\'s ipaddress module.' },
      ],
      resources: [
        { title: "Beej's Guide to Network Programming", url: 'https://beej.us/guide/bgnet/', source: 'Brian "Beej" Hall', kind: 'book' },
        { title: 'What is DNS?', url: 'https://www.cloudflare.com/learning/dns/what-is-dns/', source: 'Cloudflare Learning Center', kind: 'article' },
        { title: 'What is the OSI model?', url: 'https://www.cloudflare.com/learning/ddos/glossary/open-systems-interconnection-model-osi/', source: 'Cloudflare Learning Center', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'TCP vs UDP',
          prompt: 'Which feature does TCP provide that UDP does not?',
          options: [
            { id: 'a', text: 'Reliable, ordered delivery with retransmission' },
            { id: 'b', text: 'Port numbers' },
            { id: 'c', text: 'Delivery across the internet' },
          ],
          correct: ['a'],
          explanation: 'Both use ports and IP routing. TCP adds acknowledgements, retransmission, ordering and congestion control.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Handshake',
          prompt: 'What is the order of the TCP three-way handshake?',
          options: [
            { id: 'a', text: 'SYN, SYN-ACK, ACK' },
            { id: 'b', text: 'ACK, SYN, FIN' },
            { id: 'c', text: 'HELLO, KEY, DONE' },
          ],
          correct: ['a'],
          explanation: 'The client sends SYN, the server replies SYN-ACK, the client confirms with ACK.',
        },
        {
          key: 'q3',
          type: 'matching',
          title: 'DNS records',
          prompt: 'Match each DNS record type to its purpose.',
          pairs: {
            left: [
              { id: 'a', text: 'A' },
              { id: 'aaaa', text: 'AAAA' },
              { id: 'cname', text: 'CNAME' },
              { id: 'mx', text: 'MX' },
            ],
            right: [
              { id: 'r1', text: 'IPv4 address' },
              { id: 'r2', text: 'IPv6 address' },
              { id: 'r3', text: 'Alias to another name' },
              { id: 'r4', text: 'Mail server for the domain' },
            ],
          },
          matches: { a: 'r1', aaaa: 'r2', cname: 'r3', mx: 'r4' },
          explanation: 'A and AAAA map names to IPv4 and IPv6 addresses, CNAME points to another name, MX names mail servers.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Message boundaries',
          prompt: 'If a client calls `send()` twice on a TCP socket, the server is guaranteed to receive the data in exactly two separate `recv()` calls.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'TCP is a byte stream. Data can be merged or split arbitrarily, so applications must add their own framing.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'CIDR size',
          prompt: 'A `/24` IPv4 network contains ____ addresses.',
          accepted: [['256']],
          explanation: '32 - 24 = 8 host bits, and 2^8 = 256 addresses (some are reserved for the network and broadcast addresses).',
        },
      ],
    },

    // ------------------------------------------------------------------ 8
    {
      slug: 'http-and-tls',
      title: 'HTTP and TLS',
      module: 'Networks',
      skill: 'networking',
      minutes: 55,
      milestone: true,
      completionCriteria: 'Pass the quiz and write a step-by-step explanation of what happens when you visit an https URL, from DNS to the first response byte.',
      objectives: [
        'Read and write raw HTTP requests and responses',
        'Explain methods, status codes, cookies and key headers',
        'Describe what TLS provides and the steps of a TLS 1.3 handshake',
        'Count the round trips needed to load an HTTPS page and compare HTTP/1.1, HTTP/2 and HTTP/3',
      ],
      body: `**HTTP** is a request/response protocol on top of a transport connection. HTTP/1.1 is plain text, so you can read it directly:

\`\`\`text
GET /api/users/42 HTTP/1.1
Host: example.com
Accept: application/json
Cookie: session=abc123

HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: max-age=60
Content-Length: 26

{"id": 42, "name": "Asha"}
\`\`\`

### Methods and status codes

| Method | Meaning | Safe | Idempotent |
|---|---|---|---|
| GET | read | yes | yes |
| POST | create or trigger an action | no | no |
| PUT | replace a resource | no | yes |
| PATCH | partial update | no | not necessarily |
| DELETE | remove | no | yes |

Status classes: **2xx** success (200, 201, 204), **3xx** redirect (301, 302, 304), **4xx** client error (400 bad input, 401 not authenticated, 403 not allowed, 404 not found, 429 too many requests), **5xx** server error (500, 502 bad gateway, 503 unavailable).

### State with cookies

HTTP is **stateless**: each request stands alone. A server sets \`Set-Cookie: session=abc123; HttpOnly; Secure; SameSite=Lax\` and the browser sends the cookie back on later requests. \`HttpOnly\` hides it from JavaScript, \`Secure\` sends it only over HTTPS, and \`SameSite\` limits cross-site sending.

### TLS

**TLS** wraps the connection to provide **confidentiality** (encryption), **integrity** (tamper detection) and **authentication** (the server proves it owns the domain with a certificate signed by a trusted certificate authority).

\`\`\`text
TLS 1.3 handshake (after TCP connects):
client ── ClientHello (supported ciphers, key share) ───────────> server
client <── ServerHello (key share), certificate, Finished ─────── server
   both derive the same session keys (Diffie-Hellman key exchange)
client ── Finished, then encrypted HTTP request ────────────────> server
\`\`\`

TLS 1.3 needs one round trip (TLS 1.2 needed two). The browser checks that the certificate chains to a trusted root, matches the domain name and has not expired.

### Putting it together: visiting https://example.com

\`\`\`text
1. DNS lookup (often cached; otherwise 1 or more round trips)
2. TCP handshake                          1 RTT
3. TLS 1.3 handshake                      1 RTT
4. HTTP request and first response byte   1 RTT
5. parse HTML, request CSS, JS, images (reusing the connection)
\`\`\`

At 100 ms round-trip time, that is at least 300 ms before the first byte of HTML, which is why CDNs place servers close to users and why connection reuse matters.

### HTTP versions

- **HTTP/1.1**: one request at a time per connection, so browsers open several connections.
- **HTTP/2**: many requests multiplexed over one TCP connection, binary framing, header compression. A single lost TCP packet still stalls every stream (head-of-line blocking).
- **HTTP/3**: runs over **QUIC** on UDP, combines the transport and TLS handshakes, and isolates loss to individual streams.

### Common mistakes
- Using GET for actions that change data (crawlers and prefetchers will trigger them).
- Returning 200 with an error message in the body.
- Mixing up 401 (who are you?) and 403 (you are not allowed).
- Thinking HTTPS hides which site you visit: the IP address and usually the server name are still visible to the network.`,
      practice: [
        { title: 'Raw HTTP', kind: 'exercise', prompt: 'Use curl -v https://example.com and identify the TLS version, the certificate issuer, the request line, the response status and three response headers. Then explain what each header does.' },
        { title: 'What happens when...', kind: 'exercise', prompt: 'Write a step-by-step explanation of what happens between pressing Enter on https://example.com and the first byte of HTML arriving: caches, DNS, TCP, TLS, HTTP. Count the network round trips, and estimate the time at 20 ms and at 150 ms round-trip time.' },
        { title: 'Speak HTTP by hand', kind: 'exercise', prompt: 'Using nc example.com 80 (or openssl s_client -connect example.com:443 for HTTPS), type a GET request by hand including the Host header and a blank line. Note what happens if you omit Host.' },
      ],
      resources: [
        { title: 'An overview of HTTP', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'What happens in a TLS handshake?', url: 'https://www.cloudflare.com/learning/ssl/what-happens-in-a-tls-handshake/', source: 'Cloudflare Learning Center', kind: 'article' },
        { title: 'HTTP response status codes', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status', source: 'MDN Web Docs', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'multi',
          title: 'TLS guarantees',
          prompt: 'Which properties does TLS provide? Select all that apply.',
          options: [
            { id: 'a', text: 'Encryption of the data in transit' },
            { id: 'b', text: 'Detection of tampering' },
            { id: 'c', text: 'Proof of the server\'s identity via a certificate' },
            { id: 'd', text: 'Protection against bugs in the server application' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'TLS secures the channel: confidentiality, integrity and authentication. It does nothing about vulnerabilities in the application itself.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Status codes',
          prompt: 'A logged-in user requests a resource they are not allowed to see. Which status code fits?',
          options: [
            { id: 'a', text: '401 Unauthorized' },
            { id: 'b', text: '403 Forbidden' },
            { id: 'c', text: '500 Internal Server Error' },
          ],
          correct: ['b'],
          explanation: '401 means "not authenticated" (who are you?). 403 means authenticated but not permitted.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'HTTP/3',
          prompt: 'What transport does HTTP/3 use?',
          options: [
            { id: 'a', text: 'QUIC over UDP' },
            { id: 'b', text: 'TCP with TLS 1.2' },
            { id: 'c', text: 'Raw IP packets' },
          ],
          correct: ['a'],
          explanation: 'HTTP/3 runs on QUIC, which is built on UDP and integrates TLS 1.3, avoiding TCP head-of-line blocking.',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'Round trips',
          prompt: 'DNS is cached. Using TCP and TLS 1.3, how many network round trips pass before the first byte of the HTTP response arrives on a new connection?',
          options: [
            { id: 'a', text: '1' },
            { id: 'b', text: '3' },
            { id: 'c', text: '5' },
          ],
          correct: ['b'],
          explanation: 'One for the TCP handshake, one for the TLS 1.3 handshake, and one for the HTTP request and response.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'true_false',
          title: 'Idempotent methods',
          prompt: 'PUT and DELETE are defined as idempotent: repeating the same request has the same effect as sending it once.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Replacing a resource with the same content or deleting it again leaves the same final state. POST is not idempotent, which is why retries need idempotency keys.',
        },
      ],
    },
  ],
};
