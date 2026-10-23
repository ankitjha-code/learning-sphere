import type { SeedProjectTemplate } from './types';

export const PROJECT_TEMPLATES: SeedProjectTemplate[] = [
  // ---------------------------------------------------------------------------
  // Beginner
  // ---------------------------------------------------------------------------
  {
    slug: 'cli-todo-app',
    title: 'Command-line to-do app',
    category: 'beginner',
    difficulty: 'beginner',
    summary: 'A Python command-line to-do manager that saves tasks to a JSON file, with tests and a clear README.',
    problem: 'Beginners often learn syntax in isolation and never build a complete program that takes input, stores data between runs, handles bad input and is tested. A small to-do manager exercises all of these in a scope that fits a week or two.',
    intendedUsers: 'You, as a daily user who wants to track tasks from the terminal, and anyone who clones the repository and follows the README.',
    objectives: [
      'Structure a small program into functions and modules',
      'Persist data between runs using a JSON file',
      'Validate user input and handle errors without crashing',
      'Write unit tests for the core logic',
    ],
    requirements: [
      {
        id: 'R1',
        text: 'Add tasks from the command line, e.g. `todo add "Buy milk"`.',
        acceptance: [
          'Running add with a non-empty title stores a task with a unique id, the title, done=false and a created timestamp',
          'Running add with an empty or whitespace-only title prints an error and exits with a non-zero status',
        ],
      },
      {
        id: 'R2',
        text: 'List tasks, showing id, status and title.',
        acceptance: [
          '`todo list` prints all tasks in creation order with [ ] or [x] markers',
          '`todo list --pending` shows only tasks that are not done',
          'With no tasks, the command prints a friendly "No tasks yet" message',
        ],
      },
      {
        id: 'R3',
        text: 'Mark tasks done and delete tasks by id.',
        acceptance: [
          '`todo done 3` marks task 3 as done and confirms it',
          '`todo delete 3` removes task 3; listing afterwards no longer shows it',
          'Using an id that does not exist prints an error and changes nothing',
        ],
      },
      {
        id: 'R4',
        text: 'Persist tasks in a JSON file between runs.',
        acceptance: [
          'Tasks added in one run are listed in the next run',
          'If the data file is missing, the app starts with an empty list and creates the file on first save',
          'If the file contains invalid JSON, the app prints a clear error instead of a traceback and does not overwrite the file',
        ],
      },
      {
        id: 'R5',
        text: 'Unit tests cover the core task functions.',
        acceptance: [
          'Tests for add, list, done and delete run with a single command (e.g. `python -m pytest` or `python -m unittest`)',
          'Tests use a temporary file so they never touch the real data file',
        ],
      },
      {
        id: 'R6',
        text: 'Optional: due dates and sorting.',
        acceptance: [
          '`todo add "Report" --due 2025-03-01` stores a due date and rejects invalid dates',
          '`todo list --sort due` lists tasks with the nearest due date first, undated tasks last',
        ],
        optional: true,
      },
    ],
    milestones: [
      { title: 'Core logic in memory', tasks: ['Design the task data structure', 'Write add, list, done and delete functions', 'Write tests for each function'], weekOffset: 0 },
      { title: 'Command-line interface and persistence', tasks: ['Parse commands with argparse', 'Load and save tasks as JSON', 'Handle missing and corrupt files'], weekOffset: 1 },
      { title: 'Polish and publish', tasks: ['Add input validation and helpful error messages', 'Write a README with install and usage examples', 'Push to a public Git repository with a short commit history'], weekOffset: 2 },
    ],
    skillSlugs: ['python', 'functions', 'file-io', 'error-handling', 'command-line', 'unit-testing'],
    trackSlugs: ['programming-foundations-python', 'git-and-collaboration'],
    estimatedHours: 12,
  },
  {
    slug: 'personal-budget-tracker',
    title: 'Personal budget tracker',
    category: 'beginner',
    difficulty: 'beginner',
    summary: 'Import bank-style CSV transactions, categorise them with rules, and produce monthly summaries and a spending chart.',
    problem: 'Many people do not know where their money goes each month. Bank exports are messy CSV files with inconsistent descriptions. A small tool that imports, categorises and summarises transactions answers "what did I spend on food in March?" in seconds.',
    intendedUsers: 'Students and young professionals who want a private, offline view of their spending without signing up to a finance app.',
    objectives: [
      'Read and clean CSV data with the standard library or pandas',
      'Use dictionaries and rules to categorise records',
      'Aggregate data by month and category',
      'Present results as a readable table and a simple chart',
    ],
    requirements: [
      {
        id: 'R1',
        text: 'Import transactions from a CSV file with date, description and amount columns.',
        acceptance: [
          'A sample CSV of at least 50 rows (fake data) is included and imports without errors',
          'Rows with unparseable dates or amounts are skipped and reported with their line numbers',
          'Importing the same file twice does not create duplicate transactions',
        ],
      },
      {
        id: 'R2',
        text: 'Categorise transactions using editable keyword rules.',
        acceptance: [
          'Rules live in a separate JSON or YAML file mapping keywords to categories (e.g. "uber" to Transport)',
          'Matching is case-insensitive; unmatched transactions are labelled Uncategorised',
          'The tool lists the 10 most common uncategorised descriptions so the user can add rules',
        ],
      },
      {
        id: 'R3',
        text: 'Show a monthly summary by category.',
        acceptance: [
          '`budget summary --month 2025-03` prints totals per category, sorted by spend, plus income, total spend and net',
          'Totals match a hand calculation on the sample data (documented in the README)',
        ],
      },
      {
        id: 'R4',
        text: 'Set monthly budgets per category and flag overspending.',
        acceptance: [
          'Budgets are stored in the config file',
          'The summary marks categories over budget and shows by how much',
        ],
      },
      {
        id: 'R5',
        text: 'Generate a spending chart.',
        acceptance: [
          'A bar chart of spending by category for a chosen month is saved as a PNG',
          'The chart has a title with the month, labelled axes with currency, and bars starting at zero',
        ],
      },
      {
        id: 'R6',
        text: 'Optional: month-over-month trend.',
        acceptance: [
          'A line chart shows total spend for each of the last 6 months',
          'The summary reports the category with the largest increase versus the previous month',
        ],
        optional: true,
      },
    ],
    milestones: [
      { title: 'Import and clean', tasks: ['Create a realistic fake CSV', 'Parse dates and amounts robustly', 'Detect duplicates and report bad rows'], weekOffset: 0 },
      { title: 'Categorise and summarise', tasks: ['Implement keyword rules', 'Compute monthly totals by category', 'Verify totals by hand on a small sample'], weekOffset: 1 },
      { title: 'Budgets, charts and README', tasks: ['Add budgets and overspend flags', 'Generate the chart', 'Document usage, privacy (data stays local) and limitations'], weekOffset: 2 },
    ],
    skillSlugs: ['python', 'collections', 'file-io', 'error-handling', 'data-wrangling', 'data-visualization'],
    trackSlugs: ['programming-foundations-python', 'data-science-python'],
    estimatedHours: 16,
  },

  // ---------------------------------------------------------------------------
  // Full-stack
  // ---------------------------------------------------------------------------
  {
    slug: 'habit-tracker-with-auth',
    title: 'Habit tracker with authentication',
    category: 'fullstack',
    difficulty: 'intermediate',
    summary: 'A full-stack web app where users sign up, define habits, check them off daily and see streaks, with secure sessions and per-user data.',
    problem: 'Habit apps are simple on the surface but require the fundamentals every real product needs: accounts, secure password storage, per-user data isolation, date handling across time zones, and a responsive UI. Building one end to end teaches how the pieces connect.',
    intendedUsers: 'People building routines (exercise, reading, study) who want a simple, private tracker they can use on phone and desktop.',
    objectives: [
      'Implement sign-up, login and logout with hashed passwords and secure sessions',
      'Design a relational schema for users, habits and check-ins',
      'Build a REST API consumed by a React front end',
      'Enforce that users can only access their own data',
    ],
    requirements: [
      {
        id: 'R1',
        text: 'Users can sign up, log in and log out.',
        acceptance: [
          'Passwords are hashed with bcrypt or argon2; plaintext passwords never appear in the database or logs',
          'Sessions use an HttpOnly, Secure, SameSite cookie (or a short-lived token stored outside localStorage)',
          'Login with wrong credentials returns a generic error that does not reveal whether the email exists',
        ],
      },
      {
        id: 'R2',
        text: 'Users can create, edit, archive and delete habits.',
        acceptance: [
          'A habit has a name, optional description, and a target frequency (daily or N times per week)',
          'Validation errors are shown inline in the form and returned as 400 responses by the API',
        ],
      },
      {
        id: 'R3',
        text: 'Users can check off a habit for today and view history.',
        acceptance: [
          'Checking off is idempotent: tapping twice on the same day records one check-in',
          '"Today" is computed in the user\'s time zone, which is stored on their profile',
          'A 30-day grid shows completed and missed days for each habit',
        ],
      },
      {
        id: 'R4',
        text: 'Show current and longest streaks.',
        acceptance: [
          'Streak logic is a pure function with unit tests covering gaps, today not yet checked, and time-zone edges',
          'The dashboard displays current and longest streak per habit',
        ],
      },
      {
        id: 'R5',
        text: 'Per-user data isolation.',
        acceptance: [
          'Every habit and check-in query is scoped to the logged-in user id',
          'An automated test shows that user A requesting user B\'s habit id receives 404',
        ],
      },
      {
        id: 'R6',
        text: 'Responsive, accessible UI.',
        acceptance: [
          'The app is usable at 360px width without horizontal scrolling',
          'All interactive controls are reachable by keyboard and have accessible labels',
        ],
      },
      {
        id: 'R7',
        text: 'Optional: daily reminder email or push notification.',
        acceptance: [
          'Users can opt in to a reminder at a chosen local time',
          'Reminders are not sent for habits already checked off that day',
        ],
        optional: true,
      },
    ],
    milestones: [
      { title: 'Schema and auth', tasks: ['Design tables for users, habits, check-ins', 'Implement sign-up, login, logout with sessions', 'Write auth integration tests'], weekOffset: 0 },
      { title: 'Habits API', tasks: ['CRUD endpoints for habits', 'Check-in endpoint with idempotency', 'Scope all queries to the current user and test isolation'], weekOffset: 1 },
      { title: 'React front end', tasks: ['Auth screens and protected routes', 'Habit list, form and today view', 'Loading, empty and error states'], weekOffset: 2 },
      { title: 'Streaks, polish and deploy', tasks: ['Implement and test streak logic', 'Accessibility and mobile pass', 'Deploy to a free hosting tier and write the README'], weekOffset: 3 },
    ],
    skillSlugs: ['react', 'nodejs', 'http-rest', 'auth-security-web', 'database-design', 'sql-basics', 'unit-testing', 'web-accessibility'],
    trackSlugs: ['full-stack-path', 'frontend-react', 'backend-node-apis', 'sql-database-design'],
    estimatedHours: 40,
  },
  {
    slug: 'job-application-tracker',
    title: 'Job application tracker',
    category: 'fullstack',
    difficulty: 'intermediate',
    summary: 'A TypeScript full-stack app to track job applications through stages on a board, with notes, follow-up reminders and pipeline statistics.',
    problem: 'Job seekers juggle dozens of applications across spreadsheets, email and job boards, and lose track of follow-ups. A focused tracker with stages, reminders and simple analytics helps them stay organised and learn which channels work.',
    intendedUsers: 'Students and career switchers applying to many roles at once, including learners on this platform.',
    objectives: [
      'Model a multi-stage workflow in a relational database',
      'Build a typed API and a React board UI with drag-and-drop or equivalent controls',
      'Compute useful aggregates with SQL',
      'Handle dates and reminders correctly',
    ],
    requirements: [
      {
        id: 'R1',
        text: 'Create and edit applications with company, role, link, source, stage and dates.',
        acceptance: [
          'Stages are: Wishlist, Applied, Interviewing, Offer, Rejected, Withdrawn',
          'Required fields are validated on both client and server using a shared TypeScript schema',
          'Stage changes are recorded in a history table with timestamps',
        ],
      },
      {
        id: 'R2',
        text: 'Board view grouped by stage.',
        acceptance: [
          'Applications appear as cards in stage columns; moving a card updates the stage via the API',
          'Moving a card can also be done with keyboard-accessible controls (not drag-only)',
          'A failed update reverts the card and shows an error message',
        ],
      },
      {
        id: 'R3',
        text: 'Notes and contacts per application.',
        acceptance: [
          'Users can add timestamped notes (e.g. interview feedback) to an application',
          'Users can attach recruiter or referral contacts with name, email and role',
        ],
      },
      {
        id: 'R4',
        text: 'Follow-up reminders.',
        acceptance: [
          'Users can set a follow-up date; overdue follow-ups appear in a "Needs attention" list',
          'Applications in Applied for more than 14 days with no activity are suggested for follow-up',
        ],
      },
      {
        id: 'R5',
        text: 'Pipeline statistics.',
        acceptance: [
          'A stats page shows counts per stage and response rate (applications that reached Interviewing or later divided by Applied or later)',
          'Response rate is broken down by source (referral, job board, company site)',
          'Statistics are computed with SQL aggregation queries, with at least one test against seeded data',
        ],
      },
      {
        id: 'R6',
        text: 'Search and filter.',
        acceptance: [
          'Users can filter by stage and source and search by company or role text',
          'Filters are reflected in the URL so a filtered view can be bookmarked',
        ],
      },
      {
        id: 'R7',
        text: 'Optional: CSV import and export.',
        acceptance: [
          'Users can export all applications to CSV and re-import that file without duplicates',
          'Import reports rows that failed validation with reasons',
        ],
        optional: true,
      },
    ],
    milestones: [
      { title: 'Data model and API', tasks: ['Design schema including stage history', 'Implement typed CRUD endpoints', 'Seed realistic sample data'], weekOffset: 0 },
      { title: 'Board UI', tasks: ['Build the board with stage columns', 'Accessible stage change controls', 'Optimistic updates with rollback on error'], weekOffset: 1 },
      { title: 'Notes, reminders and stats', tasks: ['Notes and contacts', 'Follow-up logic and "Needs attention" list', 'SQL aggregates and stats page'], weekOffset: 2 },
      { title: 'Search, testing and launch', tasks: ['Filters and URL state', 'API and component tests', 'Deploy and write a README with screenshots'], weekOffset: 3 },
    ],
    skillSlugs: ['typescript', 'react', 'nodejs', 'api-design', 'database-design', 'sql-aggregation', 'unit-testing'],
    trackSlugs: ['full-stack-path', 'typescript-essentials', 'frontend-react', 'backend-node-apis', 'sql-database-design'],
    estimatedHours: 45,
  },
  {
    slug: 'collaborative-notes',
    title: 'Collaborative notes app',
    category: 'fullstack',
    difficulty: 'advanced',
    summary: 'A real-time collaborative Markdown notes app with sharing permissions, live presence and a clear strategy for concurrent edits.',
    problem: 'Study groups and small teams want to edit shared notes together without emailing files or overwriting each other. Real-time collaboration forces you to deal with WebSockets, authorisation on every message, and conflicting concurrent edits.',
    intendedUsers: 'Study groups and small project teams of 2 to 10 people editing shared notes at the same time.',
    objectives: [
      'Implement real-time updates over WebSockets',
      'Design and enforce document-level sharing permissions',
      'Choose, implement and document a concurrency strategy',
      'Test multi-user behaviour automatically',
    ],
    requirements: [
      {
        id: 'R1',
        text: 'Authenticated users can create Markdown notes and organise them in folders.',
        acceptance: [
          'Notes render Markdown safely (HTML is sanitised to prevent XSS)',
          'Users see only notes they own or that are shared with them',
        ],
      },
      {
        id: 'R2',
        text: 'Share notes with viewer or editor roles.',
        acceptance: [
          'Owners can invite users by email as viewer or editor and revoke access',
          'Viewers cannot modify a note through the UI, REST API or WebSocket messages (tested at the server)',
          'Revoking access disconnects that user\'s live session for the note within 5 seconds',
        ],
      },
      {
        id: 'R3',
        text: 'Real-time collaborative editing.',
        acceptance: [
          'Edits by one editor appear for others within 1 second on a local network',
          'Concurrent edits are handled by a documented strategy (e.g. a CRDT library such as Yjs, or operational transforms, or last-write-wins per paragraph with conflict notice)',
          'An automated test simulates two clients editing at once and asserts both converge to the same content',
        ],
      },
      {
        id: 'R4',
        text: 'Presence indicators.',
        acceptance: [
          'Users see who else is viewing a note',
          'Presence updates when a user leaves or disconnects',
        ],
      },
      {
        id: 'R5',
        text: 'Persistence and version history.',
        acceptance: [
          'Note content is persisted so a server restart loses at most the last few seconds of edits',
          'Users can view and restore at least the last 20 saved versions of a note',
        ],
      },
      {
        id: 'R6',
        text: 'Resilience to disconnects.',
        acceptance: [
          'The client reconnects automatically with backoff after a dropped connection',
          'Edits made while briefly offline are sent after reconnecting without duplicating content',
        ],
      },
      {
        id: 'R7',
        text: 'Optional: full-text search across accessible notes.',
        acceptance: [
          'Search returns only notes the user can access',
          'Results highlight the matching snippet',
        ],
        optional: true,
      },
    ],
    milestones: [
      { title: 'Notes and sharing', tasks: ['Schema for notes, folders and permissions', 'CRUD API with permission checks', 'Safe Markdown rendering'], weekOffset: 0 },
      { title: 'Real-time channel', tasks: ['WebSocket server with authenticated connections', 'Authorise every message by role', 'Presence tracking'], weekOffset: 1 },
      { title: 'Concurrent editing', tasks: ['Research and pick a concurrency strategy; write a short design note', 'Implement it and the convergence test', 'Reconnect and offline buffering'], weekOffset: 2 },
      { title: 'History, testing and deploy', tasks: ['Version history and restore', 'Multi-client end-to-end tests', 'Deploy and document architecture and trade-offs'], weekOffset: 4 },
    ],
    skillSlugs: ['react', 'nodejs', 'async-programming', 'auth-security-web', 'web-security', 'database-design', 'concurrency', 'unit-testing'],
    trackSlugs: ['full-stack-path', 'frontend-react', 'backend-node-apis', 'system-design-fundamentals', 'testing-security-debugging'],
    estimatedHours: 60,
  },

  // ---------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------
  {
    slug: 'library-rest-api',
    title: 'Library REST API with tests',
    category: 'api',
    difficulty: 'intermediate',
    summary: 'A well-designed REST API for a small library: books, members and loans, with validation, pagination, transactions and an automated test suite.',
    problem: 'A community library tracks books and loans in a spreadsheet, leading to double-lending and lost books. They need a reliable backend that a future web or mobile app can use, with rules enforced on the server and confidence from tests.',
    intendedUsers: 'Library volunteers using a front end built later, and developers who will integrate with the API from its documentation.',
    objectives: [
      'Design resource-oriented endpoints with correct status codes and error formats',
      'Model relationships and enforce business rules in the database and API',
      'Use transactions to prevent race conditions',
      'Write integration tests that run in CI',
    ],
    requirements: [
      {
        id: 'R1',
        text: 'CRUD endpoints for books and members.',
        acceptance: [
          'Endpoints follow REST conventions (e.g. GET /books, POST /books, GET /books/:id, PATCH /books/:id)',
          'Invalid input returns 400 with a consistent JSON error body listing field errors',
          'Unknown ids return 404; duplicate ISBN returns 409',
        ],
      },
      {
        id: 'R2',
        text: 'Borrow and return books.',
        acceptance: [
          'POST /loans creates a loan only if a copy is available and the member has fewer than 5 active loans',
          'Two simultaneous requests for the last copy result in exactly one successful loan (enforced with a transaction or constraint and tested)',
          'POST /loans/:id/return sets the return date; returning twice returns 409',
        ],
      },
      {
        id: 'R3',
        text: 'Search, filter and paginate.',
        acceptance: [
          'GET /books supports search by title or author, filter by availability, and limit/cursor (or page) parameters',
          'Responses include pagination metadata; requesting a page beyond the end returns an empty list, not an error',
        ],
      },
      {
        id: 'R4',
        text: 'Overdue report.',
        acceptance: [
          'GET /reports/overdue lists active loans past their due date with member and book details using a SQL join',
          'The query uses an index on the due-date column, shown with EXPLAIN in the README',
        ],
      },
      {
        id: 'R5',
        text: 'Automated tests.',
        acceptance: [
          'Integration tests cover every endpoint, including error cases, against a disposable test database',
          'Tests run with one command and in a CI workflow on every push',
          'Line coverage of the route and service code is at least 80%',
        ],
      },
      {
        id: 'R6',
        text: 'API documentation.',
        acceptance: [
          'An OpenAPI specification describes every endpoint, request and response schema',
          'The README includes example curl requests for the main flows',
        ],
      },
      {
        id: 'R7',
        text: 'Optional: staff authentication with API keys or tokens.',
        acceptance: [
          'Write endpoints require a valid staff credential; read endpoints remain public',
          'Credentials are stored hashed and can be revoked',
        ],
        optional: true,
      },
    ],
    milestones: [
      { title: 'Design', tasks: ['Write the resource model and endpoint list', 'Design tables, keys and constraints', 'Draft the OpenAPI spec'], weekOffset: 0 },
      { title: 'Core endpoints', tasks: ['Books and members CRUD with validation', 'Consistent error handling middleware', 'Integration tests for CRUD'], weekOffset: 1 },
      { title: 'Loans and reports', tasks: ['Loan rules with transactions', 'Concurrency test for the last copy', 'Overdue report and index'], weekOffset: 2 },
      { title: 'CI and docs', tasks: ['CI workflow running tests', 'Finalise OpenAPI and README', 'Review code for clarity and refactor'], weekOffset: 3 },
    ],
    skillSlugs: ['api-design', 'http-rest', 'nodejs', 'database-design', 'sql-joins', 'transactions', 'indexing', 'unit-testing', 'ci-cd'],
    trackSlugs: ['backend-node-apis', 'sql-database-design', 'testing-security-debugging'],
    estimatedHours: 30,
  },
  {
    slug: 'url-shortener-service',
    title: 'URL shortener service',
    category: 'api',
    difficulty: 'intermediate',
    summary: 'A URL shortening API with fast redirects, click analytics, abuse protection and a written capacity estimate.',
    problem: 'Long links are awkward to share in messages and print. A URL shortener looks trivial but raises real backend questions: generating unique short codes, making redirects fast, counting clicks without slowing them down, and preventing abuse.',
    intendedUsers: 'Developers and small teams who want branded short links for documentation, events and campaigns, plus their analytics dashboard (API consumers).',
    objectives: [
      'Design a short-code scheme and reason about collisions',
      'Serve redirects with low latency using indexes and caching',
      'Record analytics without blocking the redirect path',
      'Apply basic security and rate limiting',
    ],
    requirements: [
      {
        id: 'R1',
        text: 'Create short links.',
        acceptance: [
          'POST /links with a valid http(s) URL returns a short code of 6 to 8 URL-safe characters',
          'Invalid URLs and non-http(s) schemes (e.g. javascript:) are rejected with 400',
          'Users may request a custom alias; taken aliases return 409',
        ],
      },
      {
        id: 'R2',
        text: 'Redirect short codes.',
        acceptance: [
          'GET /:code responds with a 301 or 302 redirect (choice justified in the README) to the original URL',
          'Unknown or expired codes return a 404 page',
          'Lookup uses a unique index on the code column',
        ],
      },
      {
        id: 'R3',
        text: 'Click analytics.',
        acceptance: [
          'Each redirect records timestamp, referrer and a coarse user-agent category',
          'Recording analytics does not add more than a few milliseconds to the redirect (e.g. buffered or async writes)',
          'GET /links/:code/stats returns total clicks and clicks per day for the last 30 days',
        ],
      },
      {
        id: 'R4',
        text: 'Rate limiting and abuse protection.',
        acceptance: [
          'Link creation is rate-limited per IP or API key and returns 429 with a Retry-After header when exceeded',
          'A denylist of domains can block known-bad destinations',
        ],
      },
      {
        id: 'R5',
        text: 'Caching hot links.',
        acceptance: [
          'Frequently accessed codes are served from an in-memory or Redis cache with a TTL',
          'Deleting or updating a link invalidates its cache entry (tested)',
        ],
      },
      {
        id: 'R6',
        text: 'Capacity estimate and design note.',
        acceptance: [
          'The README estimates storage and requests per second for 100 million links and 1 billion redirects per month, with assumptions stated',
          'It explains how many codes the chosen length allows and the collision-handling strategy',
        ],
      },
      {
        id: 'R7',
        text: 'Optional: link expiry and QR codes.',
        acceptance: [
          'Links can have an expiry date after which they return 410 Gone',
          'GET /links/:code/qr returns a PNG QR code for the short URL',
        ],
        optional: true,
      },
    ],
    milestones: [
      { title: 'Create and redirect', tasks: ['Choose the code generation scheme', 'Schema with unique index', 'Create and redirect endpoints with tests'], weekOffset: 0 },
      { title: 'Analytics and caching', tasks: ['Non-blocking click recording', 'Stats endpoint with SQL aggregation', 'Cache with invalidation'], weekOffset: 1 },
      { title: 'Hardening and write-up', tasks: ['Rate limiting and URL validation', 'Load test redirects and record latency percentiles', 'Capacity estimate and design note'], weekOffset: 2 },
    ],
    skillSlugs: ['api-design', 'http-rest', 'nodejs', 'hashing', 'indexing', 'caching', 'web-security', 'system-design-basics'],
    trackSlugs: ['backend-node-apis', 'system-design-fundamentals', 'sql-database-design'],
    estimatedHours: 25,
  },

  // ---------------------------------------------------------------------------
  // Automation
  // ---------------------------------------------------------------------------
  {
    slug: 'file-organizer-script',
    title: 'File organiser script',
    category: 'automation',
    difficulty: 'beginner',
    summary: 'A safe Python script that sorts a messy folder into subfolders by type and date, with a dry-run mode and an undo log.',
    problem: 'Download and desktop folders fill up with hundreds of mixed files. Sorting them by hand is tedious, and careless scripts can overwrite or lose files. A careful organiser shows how to automate file operations safely.',
    intendedUsers: 'Anyone with a cluttered Downloads folder, starting with yourself; the script should be safe enough to give to a friend.',
    objectives: [
      'Work with paths and file metadata using pathlib',
      'Design automation that is safe by default (dry run, no overwrites, undo)',
      'Make behaviour configurable without editing code',
      'Test file operations using temporary directories',
    ],
    requirements: [
      {
        id: 'R1',
        text: 'Sort files into category folders by extension.',
        acceptance: [
          'Images, documents, audio, video, archives and code go into matching folders; unknown types go to Other',
          'Category-to-extension mappings are read from a config file, with sensible defaults',
          'Hidden files and the script\'s own files are left alone',
        ],
      },
      {
        id: 'R2',
        text: 'Dry-run mode by default.',
        acceptance: [
          'Running without --apply prints every planned move and changes nothing on disk',
          'Running with --apply performs exactly the moves that the dry run listed',
        ],
      },
      {
        id: 'R3',
        text: 'Never overwrite or lose files.',
        acceptance: [
          'If a file with the same name exists at the destination, the new file is renamed (e.g. report (1).pdf)',
          'Permission errors on individual files are reported and skipped; the run continues',
        ],
      },
      {
        id: 'R4',
        text: 'Undo the last run.',
        acceptance: [
          'Each applied run writes a log of source and destination paths',
          '`organise undo` moves files back to their original locations and reports any it could not restore',
        ],
      },
      {
        id: 'R5',
        text: 'Tests with temporary directories.',
        acceptance: [
          'Tests create files in a temporary directory and assert the resulting layout for sort, collision and undo cases',
          'Tests never touch real user folders',
        ],
      },
      {
        id: 'R6',
        text: 'Optional: date-based subfolders and scheduling.',
        acceptance: [
          'A --by-date flag nests files as Category/YYYY-MM using modification time',
          'The README explains how to run the script on a schedule with cron (macOS/Linux) or Task Scheduler (Windows)',
        ],
        optional: true,
      },
    ],
    milestones: [
      { title: 'Plan the moves', tasks: ['Scan a folder with pathlib', 'Map extensions to categories from config', 'Print a dry-run plan'], weekOffset: 0 },
      { title: 'Apply safely', tasks: ['Perform moves with collision handling', 'Write the undo log and implement undo', 'Tests in temporary directories'], weekOffset: 1 },
      { title: 'Package and document', tasks: ['Command-line flags and help text', 'README with examples and safety notes', 'Optional scheduling instructions'], weekOffset: 2 },
    ],
    skillSlugs: ['python', 'file-io', 'error-handling', 'command-line', 'unit-testing'],
    trackSlugs: ['programming-foundations-python', 'git-and-collaboration'],
    estimatedHours: 10,
  },
  {
    slug: 'scheduled-report-emailer',
    title: 'Scheduled report emailer',
    category: 'automation',
    difficulty: 'intermediate',
    summary: 'A job that queries data every week, builds an HTML summary report and emails it through a free-tier email API, running on a schedule with secrets handled safely.',
    problem: 'Small teams waste time manually exporting numbers and pasting them into an email every Monday. Automating the report saves that time and removes copy-paste errors, but only if the job is reliable, observable and does not leak credentials.',
    intendedUsers: 'A small business owner or team lead who wants a weekly metrics email without logging into a dashboard.',
    objectives: [
      'Query and aggregate data with SQL from a script',
      'Generate a readable HTML email from a template',
      'Send email through a transactional email API using secrets stored securely',
      'Run the job on a schedule with logging, retries and failure alerts',
    ],
    requirements: [
      {
        id: 'R1',
        text: 'Compute weekly metrics from a database.',
        acceptance: [
          'A seeded SQLite or Postgres database with at least 3 months of sample orders is included',
          'The report includes totals for the last 7 days, the change versus the previous 7 days, and the top 5 products',
          'Each metric is computed by a SQL query with a unit test against fixed seed data',
        ],
      },
      {
        id: 'R2',
        text: 'Render an HTML report.',
        acceptance: [
          'The email is rendered from a template (e.g. Jinja2) with a plain-text alternative',
          'Numbers are formatted with thousands separators and currency; changes show direction and percentage',
        ],
      },
      {
        id: 'R3',
        text: 'Send via a free-tier email API.',
        acceptance: [
          'Email is sent through a transactional email provider\'s free tier (for example Resend, Brevo or Mailgun) or SMTP, chosen and justified in the README',
          'The API key is read from an environment variable or the scheduler\'s secret store and never committed',
          'A --dry-run flag writes the HTML to a file instead of sending',
        ],
      },
      {
        id: 'R4',
        text: 'Run on a schedule.',
        acceptance: [
          'The job runs weekly via cron or a scheduled CI workflow (e.g. GitHub Actions schedule)',
          'The schedule and time zone are documented, and the job can also be triggered manually',
        ],
      },
      {
        id: 'R5',
        text: 'Reliability and observability.',
        acceptance: [
          'Transient send failures are retried up to 3 times with backoff',
          'Each run logs start, metrics computed, send result and duration',
          'If the job fails, a short failure notice is sent or the CI run is marked failed so someone is alerted',
        ],
      },
      {
        id: 'R6',
        text: 'Optional: embedded chart.',
        acceptance: [
          'The email includes a chart of daily revenue for the last 4 weeks, attached or inlined as an image',
          'The chart has labelled axes and alt text',
        ],
        optional: true,
      },
    ],
    milestones: [
      { title: 'Metrics', tasks: ['Create and seed the sample database', 'Write and test the metric queries'], weekOffset: 0 },
      { title: 'Report and sending', tasks: ['HTML and text templates', 'Integrate the email API with dry-run mode', 'Store secrets safely'], weekOffset: 1 },
      { title: 'Schedule and harden', tasks: ['Set up the scheduled workflow', 'Add retries, logging and failure alerts', 'Write the README and runbook'], weekOffset: 2 },
    ],
    skillSlugs: ['python', 'sql-aggregation', 'http-rest', 'error-handling', 'ci-cd', 'file-io'],
    trackSlugs: ['programming-foundations-python', 'sql-database-design', 'devops-and-cloud'],
    estimatedHours: 20,
  },

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------
  {
    slug: 'public-dataset-eda',
    title: 'Exploratory analysis of a public dataset',
    category: 'data',
    difficulty: 'beginner',
    summary: 'Pick a public dataset, clean it reproducibly, answer five or more questions with charts, and publish an honest write-up of what you found.',
    problem: 'Public datasets (transport, health, education, climate) hold useful answers, but raw files are messy and easy to misread. A careful, reproducible analysis with clearly stated limitations is the core skill behind analyst and data science roles.',
    intendedUsers: 'A non-technical reader such as a local journalist, council member or hiring manager who wants clear findings, plus technical reviewers who want to reproduce them.',
    objectives: [
      'Load and clean real-world data reproducibly with pandas',
      'Ask and answer specific questions with grouped summaries and charts',
      'Distinguish observations from causal claims',
      'Write findings for a non-technical audience',
    ],
    requirements: [
      {
        id: 'R1',
        text: 'Choose and document a public dataset.',
        acceptance: [
          'The README names the source, licence, download date and a data dictionary for the columns used',
          'Raw data is downloaded by a script or documented step, not edited by hand',
        ],
      },
      {
        id: 'R2',
        text: 'Clean the data in code.',
        acceptance: [
          'A cleaning notebook or script fixes types, handles missing values and duplicates, and logs row counts after each step',
          'Every cleaning decision (e.g. dropping rows) is listed with its justification',
        ],
      },
      {
        id: 'R3',
        text: 'Answer at least five specific questions.',
        acceptance: [
          'Each question has code, a table or chart, and a one-sentence takeaway',
          'At least one question compares groups and one looks at change over time',
          'Charts have titles, labelled axes with units, and honest scales',
        ],
      },
      {
        id: 'R4',
        text: 'Quantify uncertainty where relevant.',
        acceptance: [
          'At least one comparison reports a confidence interval or notes sample sizes per group',
          'Correlations are not described as causes',
        ],
      },
      {
        id: 'R5',
        text: 'Publish a findings write-up.',
        acceptance: [
          'A one to two page summary leads with the main findings, then evidence, limitations and next questions',
          'A reviewer can rerun the analysis from a clean environment using the documented steps and pinned dependencies',
        ],
      },
      {
        id: 'R6',
        text: 'Optional: second dataset join.',
        acceptance: [
          'The analysis joins a second public dataset (e.g. population) to normalise counts into rates',
          'The join is validated (row counts and unmatched keys reported)',
        ],
        optional: true,
      },
    ],
    milestones: [
      { title: 'Choose and load', tasks: ['Pick a dataset and write 8 candidate questions', 'Download script and data dictionary'], weekOffset: 0 },
      { title: 'Clean and explore', tasks: ['Cleaning pipeline with logged row counts', 'First-pass EDA: distributions and quality issues'], weekOffset: 1 },
      { title: 'Answer questions', tasks: ['Answer at least five questions with charts', 'Add uncertainty and caveats'], weekOffset: 2 },
      { title: 'Write up', tasks: ['Draft the findings summary', 'Ask someone non-technical to read it and revise', 'Check reproducibility from scratch'], weekOffset: 3 },
    ],
    skillSlugs: ['data-wrangling', 'data-visualization', 'statistics', 'python', 'technical-writing'],
    trackSlugs: ['data-science-python', 'communication-and-writing'],
    estimatedHours: 20,
  },
  {
    slug: 'data-dashboard',
    title: 'Interactive data dashboard',
    category: 'data',
    difficulty: 'intermediate',
    summary: 'An interactive dashboard over a cleaned dataset with filters, key metrics and drill-down, backed by a reproducible data pipeline.',
    problem: 'Decision-makers want to explore data themselves instead of waiting for one-off reports. A dashboard is only trustworthy if its numbers are defined clearly, refreshed reliably and match the source, and if it stays fast and readable.',
    intendedUsers: 'Operations or programme managers who check metrics weekly and need to filter by region, period and category without writing code.',
    objectives: [
      'Build a repeatable pipeline from raw data to analysis-ready tables',
      'Define metrics precisely and compute them with SQL or pandas',
      'Design a clear, accessible dashboard layout',
      'Test that dashboard numbers match independent calculations',
    ],
    requirements: [
      {
        id: 'R1',
        text: 'Data pipeline.',
        acceptance: [
          'A script downloads or reads raw data, cleans it and writes analysis tables to SQLite, DuckDB or Postgres',
          'Running the pipeline twice produces identical tables (idempotent)',
          'The pipeline logs row counts and fails loudly on schema changes in the source',
        ],
      },
      {
        id: 'R2',
        text: 'Metric definitions.',
        acceptance: [
          'A metrics document defines each KPI precisely (formula, filters, time zone, edge cases)',
          'Each KPI is computed in one place in code and reused by every chart that shows it',
        ],
      },
      {
        id: 'R3',
        text: 'Dashboard with filters.',
        acceptance: [
          'Built with a tool such as Streamlit, Dash, Observable Framework or React with a charting library',
          'Users can filter by date range and at least two categorical dimensions; all charts update consistently',
          'A KPI row shows current values and change versus the previous period',
        ],
      },
      {
        id: 'R4',
        text: 'Drill-down and detail.',
        acceptance: [
          'Clicking or selecting a category shows a breakdown or the underlying rows',
          'Users can download the filtered data as CSV',
        ],
      },
      {
        id: 'R5',
        text: 'Correctness tests.',
        acceptance: [
          'Automated tests compare at least three dashboard metrics against hand-checked values on a fixed sample',
          'Empty filter results show a clear "no data" state instead of errors or misleading zeros',
        ],
      },
      {
        id: 'R6',
        text: 'Performance and accessibility.',
        acceptance: [
          'Filter changes update the view in under 2 seconds on the full dataset',
          'Colours are colour-blind-safe and every chart has a text title stating what it shows',
        ],
      },
      {
        id: 'R7',
        text: 'Optional: scheduled refresh.',
        acceptance: [
          'The pipeline runs on a schedule and the dashboard shows the last refresh time',
          'A failed refresh leaves the previous data in place and is visibly flagged',
        ],
        optional: true,
      },
    ],
    milestones: [
      { title: 'Pipeline', tasks: ['Choose a dataset and storage', 'Write the idempotent pipeline with logging'], weekOffset: 0 },
      { title: 'Metrics', tasks: ['Write the metrics document', 'Implement metric functions with tests'], weekOffset: 1 },
      { title: 'Dashboard', tasks: ['Layout sketch on paper first', 'Build filters, KPIs and charts', 'Drill-down and CSV export'], weekOffset: 2 },
      { title: 'Validate and ship', tasks: ['Correctness and empty-state checks', 'Performance and accessibility pass', 'Deploy and record a short demo'], weekOffset: 3 },
    ],
    skillSlugs: ['data-wrangling', 'data-visualization', 'sql-aggregation', 'python', 'unit-testing', 'web-accessibility'],
    trackSlugs: ['data-science-python', 'sql-database-design'],
    estimatedHours: 30,
  },

  // ---------------------------------------------------------------------------
  // Machine learning
  // ---------------------------------------------------------------------------
  {
    slug: 'house-price-regression',
    title: 'House price regression with honest evaluation',
    category: 'ml',
    difficulty: 'intermediate',
    summary: 'Predict house prices from a public dataset with a baseline, leak-free pipelines, cross-validation, error analysis and a model card that states what the model cannot do.',
    problem: 'It is easy to build a regression model that looks accurate in a notebook and fails on new data because of leakage, overfitting or a test set that was reused for tuning. This project is about producing a number you can defend.',
    intendedUsers: 'A hypothetical estate agency evaluating whether a model could give agents a first price estimate, and technical reviewers checking the methodology.',
    objectives: [
      'Set up a correct train/validation/test protocol and a meaningful baseline',
      'Build preprocessing and modelling in scikit-learn Pipelines to avoid leakage',
      'Compare models with cross-validation and report uncertainty',
      'Analyse errors and document limitations in a model card',
    ],
    requirements: [
      {
        id: 'R1',
        text: 'Data and split.',
        acceptance: [
          'Uses a public dataset such as the Ames Housing data or scikit-learn\'s California housing, with source and licence cited',
          'A test set is held out before any exploration and used exactly once, at the end',
          'If the data has a time component, the split respects time order',
        ],
      },
      {
        id: 'R2',
        text: 'Baseline.',
        acceptance: [
          'A baseline (predict the median price, or a one-feature linear model) is evaluated with the same protocol as other models',
          'All later results are reported alongside the baseline',
        ],
      },
      {
        id: 'R3',
        text: 'Leak-free pipelines.',
        acceptance: [
          'Imputation, encoding and scaling live inside a scikit-learn Pipeline or ColumnTransformer',
          'The README lists features that were excluded for leakage risk and why',
        ],
      },
      {
        id: 'R4',
        text: 'Model comparison.',
        acceptance: [
          'At least three model families (e.g. regularised linear, random forest, gradient boosting) are compared with 5-fold cross-validation',
          'Results report MAE and RMSE as mean and standard deviation across folds',
          'Hyperparameters are tuned with cross-validation on the training set only',
        ],
      },
      {
        id: 'R5',
        text: 'Error analysis.',
        acceptance: [
          'A residual plot and the 10 largest errors are examined, with hypotheses for each pattern',
          'Error is reported separately for at least two segments (e.g. price bands or neighbourhoods)',
        ],
      },
      {
        id: 'R6',
        text: 'Model card.',
        acceptance: [
          'Documents intended use, data, final test metrics with the baseline, segment performance, and known limitations',
          'States clearly that the model reflects historical prices and should not be used for unsupervised valuation decisions',
        ],
      },
      {
        id: 'R7',
        text: 'Optional: prediction intervals.',
        acceptance: [
          'The model returns an interval (e.g. via quantile regression) as well as a point estimate',
          'Interval coverage on the test set is measured and reported',
        ],
        optional: true,
      },
    ],
    milestones: [
      { title: 'Protocol and baseline', tasks: ['Hold out the test set', 'EDA on training data only', 'Evaluate the baseline'], weekOffset: 0 },
      { title: 'Pipelines and models', tasks: ['Build the preprocessing pipeline', 'Cross-validate three model families', 'Tune the best two'], weekOffset: 1 },
      { title: 'Error analysis', tasks: ['Residual plots and largest errors', 'Segment performance'], weekOffset: 2 },
      { title: 'Final evaluation and report', tasks: ['Single test-set evaluation', 'Write the model card', 'Clean, reproducible repository'], weekOffset: 3 },
    ],
    skillSlugs: ['ml-fundamentals', 'model-evaluation', 'data-wrangling', 'statistics', 'python', 'technical-writing'],
    trackSlugs: ['machine-learning-foundations', 'data-science-python'],
    estimatedHours: 30,
  },
  {
    slug: 'spam-classifier',
    title: 'Spam classifier',
    category: 'ml',
    difficulty: 'intermediate',
    summary: 'Train a text classifier that flags spam SMS or email, choose a decision threshold from the costs of mistakes, and expose it through a small API.',
    problem: 'Spam wastes time and enables scams, but a filter that blocks real messages is worse than useless. The challenge is not just training a model but choosing how it trades off false positives against false negatives, and measuring that honestly on imbalanced data.',
    intendedUsers: 'Developers of a small messaging or contact-form service who want an automatic first-pass spam filter with a human review queue.',
    objectives: [
      'Turn text into features with bag-of-words or TF-IDF',
      'Train and compare classifiers on imbalanced data',
      'Choose a threshold using precision, recall and error costs',
      'Serve predictions through a simple API with input validation',
    ],
    requirements: [
      {
        id: 'R1',
        text: 'Dataset and split.',
        acceptance: [
          'Uses a public labelled dataset such as the UCI SMS Spam Collection, cited with its licence',
          'Exact duplicate messages are removed before splitting so the same text cannot appear in train and test',
          'Train/test split is stratified and the class balance of each split is reported',
        ],
      },
      {
        id: 'R2',
        text: 'Text features and models.',
        acceptance: [
          'A Pipeline combines TF-IDF (or counts) with a classifier, so vectoriser vocabulary is learned from training data only',
          'At least two classifiers (e.g. multinomial naive Bayes and logistic regression) are compared with cross-validation',
        ],
      },
      {
        id: 'R3',
        text: 'Evaluation on imbalanced data.',
        acceptance: [
          'Reports precision, recall, F1 and a confusion matrix; accuracy is never reported alone',
          'Includes a precision-recall curve and average precision',
          'Compares against a baseline that always predicts "not spam"',
        ],
      },
      {
        id: 'R4',
        text: 'Threshold selection.',
        acceptance: [
          'States an explicit cost assumption (e.g. a blocked real message costs 10 times a missed spam)',
          'Selects a threshold on validation data that minimises expected cost and reports test metrics at that threshold',
          'Suggests a "review" band of uncertain scores for human checking',
        ],
      },
      {
        id: 'R5',
        text: 'Prediction API.',
        acceptance: [
          'POST /classify accepts a message and returns label, probability and model version',
          'Empty or overly long inputs (e.g. over 5,000 characters) return 400',
          'The saved model loads once at startup, not per request',
        ],
      },
      {
        id: 'R6',
        text: 'Error analysis and limitations.',
        acceptance: [
          'Lists 10 misclassified messages with a hypothesis for each',
          'The README discusses how spammers adapt and why the model would need monitoring and retraining',
        ],
      },
      {
        id: 'R7',
        text: 'Optional: compare with an LLM classifier.',
        acceptance: [
          'Classifies 200 test messages with a free-tier LLM prompt and compares precision, recall, cost and latency with the trained model',
          'Only the public dataset is sent to the LLM; the README notes the provider\'s data-use terms',
        ],
        optional: true,
      },
    ],
    milestones: [
      { title: 'Data and baseline', tasks: ['Load, deduplicate and split', 'Baseline metrics'], weekOffset: 0 },
      { title: 'Models and evaluation', tasks: ['TF-IDF pipelines and model comparison', 'Precision-recall analysis'], weekOffset: 1 },
      { title: 'Threshold and API', tasks: ['Cost-based threshold selection', 'Prediction API with tests'], weekOffset: 2 },
      { title: 'Analysis and write-up', tasks: ['Error analysis', 'README with results, threshold rationale and limitations'], weekOffset: 3 },
    ],
    skillSlugs: ['ml-fundamentals', 'model-evaluation', 'python', 'strings', 'http-rest', 'probability'],
    trackSlugs: ['machine-learning-foundations', 'data-science-python'],
    estimatedHours: 25,
  },

  // ---------------------------------------------------------------------------
  // AI
  // ---------------------------------------------------------------------------
  {
    slug: 'rag-study-assistant',
    title: 'RAG study assistant over your own notes',
    category: 'ai',
    difficulty: 'intermediate',
    summary: 'A question-answering assistant that retrieves passages from your own study notes and answers with citations using a free-tier LLM, evaluated with a test set and honest about what it does not know.',
    problem: 'Students accumulate notes, slides and summaries but struggle to find the right passage when revising. General chatbots answer confidently from their own training data instead of your course material, and sometimes invent facts. A retrieval-augmented assistant grounded in your notes, with citations you can check, is more trustworthy.',
    intendedUsers: 'A student revising for exams using their own notes (Markdown, text or PDF exports), who needs to verify every answer against the source.',
    objectives: [
      'Build an ingestion pipeline that chunks and embeds documents',
      'Implement retrieval and evaluate it separately from generation',
      'Prompt an LLM to answer only from sources and cite them',
      'Handle API keys, free-tier limits and data privacy responsibly',
    ],
    requirements: [
      {
        id: 'R1',
        text: 'Ingest notes.',
        acceptance: [
          'Ingests a folder of Markdown or text files (PDF optional), splitting them into chunks that keep their heading and file name',
          'Re-running ingestion only re-embeds files that changed (detected by content hash)',
          'Embeddings and metadata are stored locally (NumPy file, SQLite or a local vector store)',
        ],
      },
      {
        id: 'R2',
        text: 'Retrieve relevant passages.',
        acceptance: [
          'Given a question, returns the top-k chunks by cosine similarity with their scores and sources',
          'A retrieval evaluation set of at least 15 questions with expected source chunks reports hit rate at k=3',
        ],
      },
      {
        id: 'R3',
        text: 'Answer with citations.',
        acceptance: [
          'Answers cite sources inline (e.g. [week3.md: Recursion]) and every citation refers to a retrieved chunk',
          'When retrieved chunks do not contain the answer, the assistant says it could not find it in the notes',
          'The UI or CLI shows the cited passages so the user can verify them',
        ],
      },
      {
        id: 'R4',
        text: 'Use a free-tier LLM responsibly.',
        acceptance: [
          'Uses a free-tier API (e.g. the Gemini API via its OpenAI-compatible endpoint) with the key in an environment variable',
          'Rate-limit errors are retried with backoff and surfaced to the user as a clear message',
          'The README warns that free-tier prompts may be used by the provider to improve its products, so private or sensitive notes should not be uploaded',
        ],
      },
      {
        id: 'R5',
        text: 'Answer quality evaluation.',
        acceptance: [
          'An answer evaluation set of at least 20 questions (including 5 unanswerable ones) is run automatically',
          'Reports the share of answers that are correct, faithful to the cited sources, and correctly refuse unanswerable questions, with the method explained',
          'Results are recorded before and after at least one improvement (e.g. chunk size or prompt change)',
        ],
      },
      {
        id: 'R6',
        text: 'Basic safety.',
        acceptance: [
          'Model output is escaped before rendering in any HTML interface',
          'A note containing an injected instruction (e.g. "ignore previous instructions") is included in testing, with results documented',
        ],
      },
      {
        id: 'R7',
        text: 'Optional: practice question generation.',
        acceptance: [
          'Generates practice questions from a selected note, each linked to its source chunk',
          'The UI labels them as AI-generated and lets the user flag incorrect ones',
        ],
        optional: true,
      },
    ],
    milestones: [
      { title: 'Ingestion and retrieval', tasks: ['Chunking strategy and metadata', 'Embedding and local storage', 'Retrieval evaluation set and hit rate'], weekOffset: 0 },
      { title: 'Grounded answers', tasks: ['Citation-required prompt', 'LLM client with retries and key handling', 'Show sources in the interface'], weekOffset: 1 },
      { title: 'Evaluation and improvement', tasks: ['Answer evaluation set', 'One measured improvement', 'Injection test'], weekOffset: 2 },
      { title: 'Polish and document', tasks: ['README with architecture, results, privacy note and limitations', 'Short demo recording'], weekOffset: 3 },
    ],
    skillSlugs: ['llm-applications', 'python', 'http-rest', 'linear-algebra', 'file-io', 'web-security'],
    trackSlugs: ['generative-ai-applications', 'programming-foundations-python'],
    estimatedHours: 35,
  },

  // ---------------------------------------------------------------------------
  // Mobile
  // ---------------------------------------------------------------------------
  {
    slug: 'offline-flashcards-pwa',
    title: 'Offline-first flashcards PWA',
    category: 'mobile',
    difficulty: 'intermediate',
    summary: 'An installable progressive web app for flashcards with spaced repetition that works fully offline and stores data on the device.',
    problem: 'Learners want to review flashcards on the bus, on flights or with poor connectivity. Many study apps break offline or require an account. An offline-first PWA works anywhere, installs to the home screen, and keeps data on the device.',
    intendedUsers: 'Students on mobile phones with intermittent connectivity who want quick daily review sessions.',
    objectives: [
      'Make a web app installable and fully functional offline with a service worker',
      'Store structured data in IndexedDB',
      'Implement a spaced-repetition scheduling algorithm and test it',
      'Build an accessible, touch-friendly mobile interface',
    ],
    requirements: [
      {
        id: 'R1',
        text: 'Decks and cards.',
        acceptance: [
          'Users can create, edit and delete decks and cards with front and back text',
          'Data is stored in IndexedDB and survives closing the browser and restarting the device',
        ],
      },
      {
        id: 'R2',
        text: 'Spaced-repetition review.',
        acceptance: [
          'A review session shows due cards; the user rates recall (e.g. Again, Hard, Good, Easy)',
          'Next review dates follow a documented algorithm (e.g. Leitner boxes or a simplified SM-2), implemented as a pure function with unit tests',
          'A daily summary shows cards due today and reviewed today',
        ],
      },
      {
        id: 'R3',
        text: 'Works offline.',
        acceptance: [
          'After the first visit, the app loads and all features work with the network disabled (verified in browser dev tools)',
          'A service worker caches the app shell and uses a documented caching strategy',
          'A new app version is detected and the user is offered a reload, without losing data',
        ],
      },
      {
        id: 'R4',
        text: 'Installable.',
        acceptance: [
          'A web app manifest with name, icons and theme colour is provided',
          'The app passes the installability checks in Chrome DevTools (Lighthouse or Application panel)',
        ],
      },
      {
        id: 'R5',
        text: 'Import and export.',
        acceptance: [
          'Users can export a deck to JSON and import it on another device',
          'Importing invalid files shows an error and does not corrupt existing data',
        ],
      },
      {
        id: 'R6',
        text: 'Mobile accessibility.',
        acceptance: [
          'Touch targets are at least 44 by 44 CSS pixels and text respects the user\'s font size',
          'The review flow is fully keyboard and screen-reader operable',
        ],
      },
      {
        id: 'R7',
        text: 'Optional: sync across devices.',
        acceptance: [
          'With an optional account, changes made offline sync when back online',
          'Conflicting edits to the same card are resolved by a documented rule and never silently lose a review',
        ],
        optional: true,
      },
    ],
    milestones: [
      { title: 'Core app', tasks: ['Deck and card UI', 'IndexedDB storage layer'], weekOffset: 0 },
      { title: 'Spaced repetition', tasks: ['Implement and test the scheduling algorithm', 'Review session and daily summary'], weekOffset: 1 },
      { title: 'Offline and install', tasks: ['Service worker and caching strategy', 'Manifest, icons and update flow', 'Offline testing'], weekOffset: 2 },
      { title: 'Polish', tasks: ['Import and export', 'Accessibility pass on a real phone', 'Deploy and document'], weekOffset: 3 },
    ],
    skillSlugs: ['javascript', 'dom-browser', 'html-css', 'async-programming', 'web-accessibility', 'unit-testing'],
    trackSlugs: ['web-foundations', 'javascript-essentials', 'frontend-react'],
    estimatedHours: 30,
  },

  // ---------------------------------------------------------------------------
  // Developer tools
  // ---------------------------------------------------------------------------
  {
    slug: 'static-site-generator',
    title: 'Static site generator CLI',
    category: 'devtools',
    difficulty: 'intermediate',
    summary: 'A TypeScript command-line tool that turns a folder of Markdown files with front matter into a fast static website, with templates, incremental builds and a dev server.',
    problem: 'Developers use static site generators for blogs and documentation without knowing how they work. Building one teaches file-system traversal, parsing, templating, caching and designing a CLI that other developers find pleasant to use.',
    intendedUsers: 'Developers who want a minimal, understandable tool for a personal blog or project documentation, and contributors who read the source.',
    objectives: [
      'Design a CLI with clear commands, flags, errors and help text',
      'Parse Markdown and front matter and render HTML through templates',
      'Implement incremental builds using content hashing',
      'Package and publish a tool with tests and documentation',
    ],
    requirements: [
      {
        id: 'R1',
        text: 'Build a site from Markdown.',
        acceptance: [
          '`ssg build` converts content/**/*.md to HTML in dist/, preserving the folder structure as URLs',
          'Front matter (title, date, draft, tags) is parsed; draft pages are excluded from production builds',
          'Invalid front matter fails the build with the file name and line number',
        ],
      },
      {
        id: 'R2',
        text: 'Templates and layouts.',
        acceptance: [
          'Pages render through a layout template chosen in front matter, with a default layout',
          'Templates can access page data and site config (title, base URL)',
        ],
      },
      {
        id: 'R3',
        text: 'Generated index pages.',
        acceptance: [
          'A blog index lists posts newest first; tag pages list posts per tag',
          'An RSS or Atom feed and a sitemap.xml are generated and validate',
        ],
      },
      {
        id: 'R4',
        text: 'Incremental builds and dev server.',
        acceptance: [
          'Rebuilding with no changes skips all page renders (reported in the build output)',
          'Changing one page re-renders only that page and pages that list it',
          '`ssg dev` serves the site locally and rebuilds on file changes',
        ],
      },
      {
        id: 'R5',
        text: 'Tests.',
        acceptance: [
          'Snapshot or fixture tests build a sample site and compare the output',
          'Unit tests cover front matter parsing, URL generation and incremental change detection',
        ],
      },
      {
        id: 'R6',
        text: 'Developer experience and docs.',
        acceptance: [
          '`ssg --help` and each command\'s help describe all flags',
          'The README has a quick start that produces a site in under 5 minutes, and a CONTRIBUTING guide',
        ],
      },
      {
        id: 'R7',
        text: 'Optional: plugin hook or custom lint rule.',
        acceptance: [
          'Exposes a documented plugin hook (e.g. transform Markdown before render) with one example plugin, OR ships a custom lint check that flags broken internal links',
          'The extension point has its own tests',
        ],
        optional: true,
      },
    ],
    milestones: [
      { title: 'Minimal build', tasks: ['CLI skeleton and config loading', 'Markdown and front matter to HTML', 'Fixture test for a sample site'], weekOffset: 0 },
      { title: 'Templates and indexes', tasks: ['Layouts and site data', 'Index, tag pages, feed and sitemap'], weekOffset: 1 },
      { title: 'Incremental and dev server', tasks: ['Content hashing and dependency tracking', 'Watch mode and local server'], weekOffset: 2 },
      { title: 'Package and publish', tasks: ['Help text and error messages', 'README and CONTRIBUTING', 'Publish to npm or as a release with a changelog'], weekOffset: 3 },
    ],
    skillSlugs: ['typescript', 'nodejs', 'file-io', 'modules-packages', 'command-line', 'unit-testing', 'technical-writing'],
    trackSlugs: ['typescript-essentials', 'testing-security-debugging', 'git-and-collaboration'],
    estimatedHours: 30,
  },

  // ---------------------------------------------------------------------------
  // Open source
  // ---------------------------------------------------------------------------
  {
    slug: 'first-open-source-contribution',
    title: 'Your first open-source contribution',
    category: 'open_source',
    difficulty: 'beginner',
    summary: 'Find a good-first-issue in a real project, get a pull request reviewed and merged (or closed with feedback), and write up what you learned.',
    problem: 'Contributing to open source builds real-world skills and a public track record, but newcomers are often intimidated by large codebases, unwritten norms and code review. A guided, step-by-step journey turns that into a manageable process.',
    intendedUsers: 'Learners who know Git basics and one programming language and want their first contribution to a project used by others.',
    objectives: [
      'Evaluate projects for newcomer-friendliness',
      'Set up an unfamiliar codebase and run its tests',
      'Submit a focused pull request that follows project conventions',
      'Respond to code review professionally and reflect in writing',
    ],
    requirements: [
      {
        id: 'R1',
        text: 'Choose a project and issue.',
        acceptance: [
          'Shortlist 3 projects with a CONTRIBUTING guide, recent maintainer activity and issues labelled "good first issue" or similar, with notes on each',
          'Comment on the chosen issue (or follow the project\'s claiming process) before starting work',
        ],
      },
      {
        id: 'R2',
        text: 'Set up and reproduce.',
        acceptance: [
          'The project builds and its test suite runs locally from your fork',
          'For a bug, you reproduce it and record the steps; for docs or features, you confirm the expected behaviour with maintainers if unclear',
        ],
      },
      {
        id: 'R3',
        text: 'Make a focused change.',
        acceptance: [
          'The change addresses only the issue, follows the project\'s style and passes linting and tests',
          'Includes a test or documentation update where the project expects one',
          'Commits follow the project\'s message conventions',
        ],
      },
      {
        id: 'R4',
        text: 'Open and shepherd the pull request.',
        acceptance: [
          'The PR description links the issue, explains what changed and how it was tested',
          'All review comments receive a response or a follow-up commit within a few days',
          'The PR is merged, or closed with documented maintainer feedback',
        ],
      },
      {
        id: 'R5',
        text: 'Write up the journey.',
        acceptance: [
          'A 600 to 1,200 word post or README covers how you chose the project, obstacles, what review taught you and what you would do differently',
          'The write-up links the PR and is respectful of maintainers (no private information or complaints)',
        ],
      },
      {
        id: 'R6',
        text: 'Optional: second contribution.',
        acceptance: [
          'A second PR to the same project, ideally slightly larger in scope',
          'Or reviewing another newcomer\'s PR with constructive, specific comments',
        ],
        optional: true,
      },
    ],
    milestones: [
      { title: 'Find a project', tasks: ['Shortlist and evaluate three projects', 'Read CONTRIBUTING and code of conduct', 'Claim an issue'], weekOffset: 0 },
      { title: 'Set up and fix', tasks: ['Fork, clone and run tests', 'Reproduce and implement the change', 'Add tests or docs'], weekOffset: 1 },
      { title: 'Review cycle', tasks: ['Open the PR', 'Respond to review and iterate'], weekOffset: 2 },
      { title: 'Reflect', tasks: ['Write and publish the write-up', 'Thank the maintainers and look for a next issue'], weekOffset: 3 },
    ],
    skillSlugs: ['open-source', 'git', 'code-review', 'communication', 'technical-writing', 'debugging'],
    trackSlugs: ['git-and-collaboration', 'communication-and-writing'],
    estimatedHours: 20,
  },

  // ---------------------------------------------------------------------------
  // Enterprise (capstone)
  // ---------------------------------------------------------------------------
  {
    slug: 'multi-tenant-ticketing',
    title: 'Multi-tenant support ticketing system',
    category: 'enterprise',
    difficulty: 'advanced',
    summary: 'Simulate a B2B SaaS helpdesk: strict tenant isolation, role-based access, SLA tracking, audit logs, asynchronous notifications and production-style operations.',
    problem: 'Businesses buying SaaS expect their data to be invisible to other customers, permissions to match their org chart, SLAs to be tracked and every change to be auditable. These enterprise requirements shape architecture far more than features do, and getting isolation wrong is a serious incident.',
    intendedUsers: 'Several simulated customer companies (tenants), each with admins, support agents and end customers who raise tickets; plus the platform operator who runs the service.',
    objectives: [
      'Design and enforce tenant isolation at the database and application layers',
      'Implement role-based access control with an audit trail',
      'Use background jobs and queues for notifications and SLA checks',
      'Operate the system with containers, CI, observability and load testing',
      'Document architecture decisions and trade-offs',
    ],
    requirements: [
      {
        id: 'R1',
        text: 'Tenant isolation.',
        acceptance: [
          'Every tenant-owned table carries a tenant id, and isolation is enforced centrally (e.g. Postgres row-level security or a mandatory scoped repository layer)',
          'An automated test suite attempts cross-tenant reads and writes on every endpoint and all are denied',
          'Tenant id comes from the authenticated session, never from client-supplied input alone',
        ],
      },
      {
        id: 'R2',
        text: 'Role-based access control.',
        acceptance: [
          'Roles include tenant admin, agent and customer, with a documented permission matrix',
          'Customers see only their own tickets; agents see their tenant\'s queue; admins manage users and settings',
          'Permission checks are unit tested against the matrix',
        ],
      },
      {
        id: 'R3',
        text: 'Ticket lifecycle.',
        acceptance: [
          'Tickets move through New, Open, Pending, Resolved and Closed with valid transitions enforced',
          'Tickets support comments (public and internal), assignment, priority and tags',
          'Concurrent updates to the same ticket do not lose changes (optimistic locking with version numbers)',
        ],
      },
      {
        id: 'R4',
        text: 'SLA tracking.',
        acceptance: [
          'Each tenant configures first-response and resolution targets per priority',
          'A background job flags tickets approaching or breaching SLA and the dashboard shows breach rates per tenant',
        ],
      },
      {
        id: 'R5',
        text: 'Asynchronous notifications.',
        acceptance: [
          'Ticket events are published to a queue and processed by a worker that sends notifications',
          'Workers are idempotent: processing the same event twice sends one notification',
          'Failed jobs retry with backoff and land in a dead-letter queue after a limit',
        ],
      },
      {
        id: 'R6',
        text: 'Audit log.',
        acceptance: [
          'Every create, update, permission change and login is written to an append-only audit log with actor, tenant, action and timestamp',
          'Tenant admins can search their own audit log; they cannot see other tenants\' entries',
        ],
      },
      {
        id: 'R7',
        text: 'Operations.',
        acceptance: [
          'The system runs locally with Docker Compose (API, worker, database, queue) and CI runs tests on every push',
          'Structured logs include request id and tenant id; a metrics endpoint exposes request rate, error rate and latency',
          'A load test with at least 3 tenants reports p95 latency and finds no cross-tenant leakage under load',
        ],
      },
      {
        id: 'R8',
        text: 'Optional: per-tenant data export and deletion.',
        acceptance: [
          'Tenant admins can export all their data as a JSON archive',
          'Deleting a tenant removes or anonymises its data, verified by a test, and is recorded in the platform audit log',
        ],
        optional: true,
      },
    ],
    milestones: [
      { title: 'Architecture and isolation', tasks: ['Write architecture decision records for tenancy model and auth', 'Schema with tenant ids and isolation mechanism', 'Cross-tenant test harness'], weekOffset: 0 },
      { title: 'RBAC and tickets', tasks: ['Permission matrix and checks', 'Ticket lifecycle with optimistic locking', 'Audit logging'], weekOffset: 2 },
      { title: 'Async and SLAs', tasks: ['Queue, worker and idempotency', 'SLA configuration and checker job', 'Dead-letter handling'], weekOffset: 4 },
      { title: 'Operations', tasks: ['Docker Compose and CI', 'Structured logging and metrics', 'Load test and fix bottlenecks'], weekOffset: 6 },
      { title: 'Review and present', tasks: ['Security review against OWASP Top 10', 'Final architecture document', 'Recorded demo walking through isolation and SLAs'], weekOffset: 8 },
    ],
    skillSlugs: ['database-design', 'transactions', 'auth-security-web', 'web-security', 'api-design', 'messaging', 'system-design-basics', 'docker', 'ci-cd', 'observability', 'low-level-design'],
    trackSlugs: ['backend-node-apis', 'sql-database-design', 'system-design-fundamentals', 'devops-and-cloud', 'testing-security-debugging', 'oop-and-low-level-design'],
    estimatedHours: 90,
    isCapstone: true,
  },

  // ---------------------------------------------------------------------------
  // Capstones combining tracks
  // ---------------------------------------------------------------------------
  {
    slug: 'capstone-ai-study-platform',
    title: 'Capstone: AI-assisted study platform',
    category: 'fullstack',
    difficulty: 'advanced',
    summary: 'A deployed full-stack platform where users upload course material, ask grounded questions with citations, and review AI-generated practice questions, built with tests, security and evaluation from day one.',
    problem: 'Students want help revising from their own course material, but generic AI tools hallucinate, ignore the syllabus and raise privacy concerns. Building a production-quality platform that is grounded, evaluated, secure and honest about its limits combines full-stack engineering with responsible AI.',
    intendedUsers: 'Students in a course (and optionally an instructor who uploads shared material), using the platform on desktop and mobile.',
    objectives: [
      'Ship a full-stack application with authentication, per-user data and a polished UI',
      'Build a RAG pipeline with citations and measurable quality',
      'Apply security practices to both the web app and the LLM integration',
      'Deploy with CI/CD, monitoring and cost and rate-limit controls',
      'Communicate the system\'s design and limitations clearly',
    ],
    requirements: [
      {
        id: 'R1',
        text: 'Accounts and workspaces.',
        acceptance: [
          'Users sign up, log in and create course workspaces; all documents and chats are scoped to the owner (or shared members)',
          'Authorisation tests prove one user cannot access another user\'s documents, chats or embeddings',
        ],
      },
      {
        id: 'R2',
        text: 'Document ingestion.',
        acceptance: [
          'Users upload Markdown, text or PDF files up to a documented size limit; unsupported files are rejected with a clear message',
          'Ingestion runs as a background job with visible status (queued, processing, ready, failed)',
          'Deleting a document removes its chunks and embeddings',
        ],
      },
      {
        id: 'R3',
        text: 'Grounded Q&A with citations.',
        acceptance: [
          'Answers cite the source document and section, and the cited passage can be opened in one click',
          'If the material does not cover a question, the assistant says so instead of answering from general knowledge',
          'Responses stream to the UI and show a clear error state on failure',
        ],
      },
      {
        id: 'R4',
        text: 'Practice questions with human review.',
        acceptance: [
          'Users can generate practice questions from a document; each is labelled AI-generated and linked to its source',
          'Users can mark questions as wrong, which removes them from practice and records feedback',
        ],
      },
      {
        id: 'R5',
        text: 'Evaluation.',
        acceptance: [
          'A versioned evaluation set (at least 30 cases including unanswerable and adversarial ones) runs in CI or on demand',
          'Reports retrieval hit rate, answer faithfulness and refusal accuracy; results for the deployed version are recorded in the repository',
        ],
      },
      {
        id: 'R6',
        text: 'Security and privacy.',
        acceptance: [
          'LLM output is sanitised before rendering; the model has no tools that can modify data',
          'Prompt-injection test documents are part of the evaluation set',
          'The privacy page states which provider processes data, its data-use terms (including free-tier training use if applicable), and how users delete their data',
        ],
      },
      {
        id: 'R7',
        text: 'Deployment and operations.',
        acceptance: [
          'CI runs lint, unit, integration and evaluation smoke tests; main deploys automatically to a hosting provider',
          'Per-user rate limits protect the LLM quota; token usage is logged and visible on an admin page',
          'Errors are tracked and an uptime check alerts on downtime',
        ],
      },
      {
        id: 'R8',
        text: 'Optional: instructor mode.',
        acceptance: [
          'An instructor can publish shared course material to enrolled students without exposing students\' private uploads',
          'The instructor sees aggregate, anonymised question topics, never individual students\' chats',
        ],
        optional: true,
      },
    ],
    milestones: [
      { title: 'Foundation', tasks: ['Architecture sketch and data model', 'Auth, workspaces and authorisation tests', 'CI pipeline'], weekOffset: 0 },
      { title: 'Ingestion and retrieval', tasks: ['Upload and background ingestion', 'Chunking, embeddings and retrieval evaluation'], weekOffset: 2 },
      { title: 'Q&A and practice', tasks: ['Citation-grounded chat with streaming', 'Practice question generation with feedback'], weekOffset: 4 },
      { title: 'Evaluation and security', tasks: ['Full evaluation set and reporting', 'Injection tests, output sanitisation and privacy page'], weekOffset: 6 },
      { title: 'Launch', tasks: ['Deploy with monitoring and rate limits', 'Usability test with 3 students', 'Final write-up and demo video'], weekOffset: 8 },
    ],
    skillSlugs: ['react', 'nodejs', 'llm-applications', 'auth-security-web', 'web-security', 'database-design', 'unit-testing', 'ci-cd', 'technical-writing'],
    trackSlugs: ['full-stack-path', 'frontend-react', 'backend-node-apis', 'generative-ai-applications', 'testing-security-debugging', 'devops-and-cloud'],
    estimatedHours: 100,
    isCapstone: true,
  },
  {
    slug: 'capstone-ml-prediction-service',
    title: 'Capstone: end-to-end ML prediction service',
    category: 'ml',
    difficulty: 'advanced',
    summary: 'Take a prediction problem from raw data to a deployed, monitored API: SQL data pipeline, honestly evaluated model, containerised service, drift monitoring and a stakeholder report.',
    problem: 'Most ML projects never reach production, and many that do degrade silently as data changes. This capstone covers the whole lifecycle for a realistic problem such as customer churn or demand forecasting: reliable data, a defensible model, a service others can call, and monitoring that tells you when to retrain.',
    intendedUsers: 'A simulated business team (e.g. customer success or operations) that consumes predictions through an API and a weekly report, plus engineers who maintain the service.',
    objectives: [
      'Build a reproducible data pipeline with SQL and Python',
      'Train and evaluate a model with a leak-free protocol appropriate to the problem',
      'Serve the model through a versioned, tested, containerised API',
      'Monitor data drift and model performance after deployment',
      'Explain results, uncertainty and limitations to non-technical stakeholders',
    ],
    requirements: [
      {
        id: 'R1',
        text: 'Problem framing.',
        acceptance: [
          'A one-page brief defines the prediction target, decision it supports, success metric, baseline and costs of each error type',
          'Uses a public or synthetic dataset with enough history for a time-based split, cited in the README',
        ],
      },
      {
        id: 'R2',
        text: 'Data pipeline.',
        acceptance: [
          'Raw data is loaded into a SQL database; features are built with SQL and/or pandas in versioned code',
          'Feature computation uses only information available at prediction time (point-in-time correct), with a test that checks for future leakage',
          'Data validation checks (schema, ranges, null rates) run before training and fail loudly',
        ],
      },
      {
        id: 'R3',
        text: 'Modelling and evaluation.',
        acceptance: [
          'Time-based train, validation and test splits; the test period is evaluated once',
          'At least one baseline and two model families are compared with metrics chosen in the brief, reported with uncertainty',
          'Performance is reported for key segments, and a model card documents data, metrics and limitations',
        ],
      },
      {
        id: 'R4',
        text: 'Prediction API.',
        acceptance: [
          'A versioned endpoint (e.g. POST /v1/predict) validates input with a schema and returns prediction, score and model version',
          'Batch prediction is supported for scoring many records',
          'The service ships as a Docker image; unit and API tests run in CI',
        ],
      },
      {
        id: 'R5',
        text: 'Monitoring.',
        acceptance: [
          'Requests and predictions are logged (without unnecessary personal data)',
          'A scheduled job compares recent feature distributions with training data and flags drift above a documented threshold',
          'When labels arrive, live performance is computed and compared with the test-set estimate',
        ],
      },
      {
        id: 'R6',
        text: 'Retraining workflow.',
        acceptance: [
          'A single command retrains, evaluates and registers a new model version',
          'A new model is promoted only if it beats the current one on the agreed metric, and rollback to the previous version is documented and tested',
        ],
      },
      {
        id: 'R7',
        text: 'Stakeholder report.',
        acceptance: [
          'A short report for the business team leads with what the model can and cannot do, expected accuracy in plain terms, and how to use scores in decisions',
          'Includes at least two charts and explicitly states uncertainty and risks such as bias or drift',
        ],
      },
      {
        id: 'R8',
        text: 'Optional: explanation per prediction.',
        acceptance: [
          'The API can return the top contributing features for a prediction (e.g. via SHAP or permutation-based methods)',
          'The README cautions that explanations describe the model, not causes in the real world',
        ],
        optional: true,
      },
    ],
    milestones: [
      { title: 'Frame and pipeline', tasks: ['Write the problem brief', 'Load data into SQL and build point-in-time features', 'Data validation checks'], weekOffset: 0 },
      { title: 'Model', tasks: ['Baselines and model comparison', 'Segment analysis and model card'], weekOffset: 2 },
      { title: 'Serve', tasks: ['Prediction API with schema validation', 'Docker image and CI'], weekOffset: 4 },
      { title: 'Monitor and retrain', tasks: ['Prediction logging and drift job', 'Retraining, promotion and rollback'], weekOffset: 6 },
      { title: 'Report and present', tasks: ['Stakeholder report', 'Architecture overview and demo'], weekOffset: 8 },
    ],
    skillSlugs: ['ml-fundamentals', 'model-evaluation', 'data-wrangling', 'sql-advanced', 'api-design', 'docker', 'ci-cd', 'observability', 'communication'],
    trackSlugs: ['data-science-python', 'machine-learning-foundations', 'sql-database-design', 'devops-and-cloud', 'system-design-fundamentals', 'communication-and-writing'],
    estimatedHours: 100,
    isCapstone: true,
  },
];
