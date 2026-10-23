// The platform skill graph. `prereqs` are skill slugs that should come first.
// level: 1 foundational, 2 core, 3 intermediate, 4 advanced.

export type SeedSkill = { slug: string; name: string; category: string; level: number; description: string; prereqs?: string[] };

export const SKILLS: SeedSkill[] = [
  // ---------- Programming fundamentals & languages ----------
  { slug: 'programming-basics', name: 'Programming basics', category: 'programming', level: 1, description: 'Variables, types, expressions, input/output and the edit-run-debug loop.' },
  { slug: 'control-flow', name: 'Control flow', category: 'programming', level: 1, description: 'Conditionals, loops and boolean logic.', prereqs: ['programming-basics'] },
  { slug: 'functions', name: 'Functions', category: 'programming', level: 1, description: 'Defining functions, parameters, return values and scope.', prereqs: ['control-flow'] },
  { slug: 'collections', name: 'Core data structures', category: 'programming', level: 2, description: 'Lists/arrays, dictionaries/maps, sets and tuples in everyday code.', prereqs: ['functions'] },
  { slug: 'error-handling', name: 'Error handling', category: 'programming', level: 2, description: 'Exceptions, error values and defensive programming.', prereqs: ['functions'] },
  { slug: 'modules-packages', name: 'Modules and packages', category: 'programming', level: 2, description: 'Organizing code into modules and using third-party packages.', prereqs: ['functions'] },
  { slug: 'file-io', name: 'Files and data formats', category: 'programming', level: 2, description: 'Reading and writing files, JSON and CSV.', prereqs: ['collections', 'error-handling'] },
  { slug: 'async-programming', name: 'Asynchronous programming', category: 'programming', level: 3, description: 'Callbacks, promises, async/await and event loops.', prereqs: ['functions', 'error-handling'] },
  { slug: 'python', name: 'Python', category: 'programming', level: 2, description: 'Idiomatic Python: comprehensions, iterators, standard library.', prereqs: ['collections'] },
  { slug: 'javascript', name: 'JavaScript', category: 'programming', level: 2, description: 'Modern JavaScript: closures, objects, arrays, modules.', prereqs: ['collections'] },
  { slug: 'typescript', name: 'TypeScript', category: 'programming', level: 3, description: 'Static types, interfaces, generics and type narrowing.', prereqs: ['javascript'] },
  { slug: 'java', name: 'Java', category: 'programming', level: 2, description: 'Java syntax, classes, collections framework and the JVM.', prereqs: ['collections'] },
  { slug: 'c-lang', name: 'C', category: 'programming', level: 3, description: 'Pointers, memory management, arrays and the C toolchain.', prereqs: ['collections'] },
  { slug: 'cpp', name: 'C++', category: 'programming', level: 3, description: 'Modern C++, STL containers, RAII and templates.', prereqs: ['c-lang'] },
  { slug: 'go', name: 'Go', category: 'programming', level: 3, description: 'Go syntax, goroutines, channels and interfaces.', prereqs: ['collections'] },
  { slug: 'rust', name: 'Rust', category: 'programming', level: 4, description: 'Ownership, borrowing, enums, traits and cargo.', prereqs: ['collections'] },

  // ---------- Web ----------
  { slug: 'html-css', name: 'HTML and CSS', category: 'web', level: 1, description: 'Semantic HTML, the box model, flexbox, grid and responsive design.' },
  { slug: 'web-accessibility', name: 'Web accessibility', category: 'web', level: 2, description: 'WCAG basics, semantic markup, keyboard and screen-reader support.', prereqs: ['html-css'] },
  { slug: 'dom-browser', name: 'DOM and browser APIs', category: 'web', level: 2, description: 'Events, the DOM, fetch and storage in the browser.', prereqs: ['javascript', 'html-css'] },
  { slug: 'react', name: 'React', category: 'web', level: 3, description: 'Components, props, state, effects and data fetching.', prereqs: ['dom-browser'] },
  { slug: 'http-rest', name: 'HTTP and REST APIs', category: 'web', level: 2, description: 'Requests, responses, status codes, REST design and JSON.', prereqs: ['programming-basics'] },
  { slug: 'nodejs', name: 'Node.js backends', category: 'web', level: 3, description: 'Building HTTP services with Node.js, routing and middleware.', prereqs: ['javascript', 'http-rest', 'async-programming'] },
  { slug: 'api-design', name: 'API design', category: 'web', level: 3, description: 'Resource modeling, versioning, pagination, errors and auth.', prereqs: ['http-rest'] },
  { slug: 'auth-security-web', name: 'Authentication and sessions', category: 'web', level: 3, description: 'Passwords, sessions, tokens, OAuth and CSRF.', prereqs: ['http-rest'] },

  // ---------- DSA ----------
  { slug: 'complexity', name: 'Complexity analysis', category: 'dsa', level: 2, description: 'Big-O time and space, best/worst/average cases.', prereqs: ['control-flow'] },
  { slug: 'arrays', name: 'Arrays', category: 'dsa', level: 2, description: 'Indexing, traversal, in-place updates and prefix sums.', prereqs: ['collections', 'complexity'] },
  { slug: 'strings', name: 'Strings', category: 'dsa', level: 2, description: 'String manipulation, parsing and character counting.', prereqs: ['arrays'] },
  { slug: 'hashing', name: 'Hash maps and sets', category: 'dsa', level: 2, description: 'Constant-time lookup, counting and deduplication.', prereqs: ['arrays'] },
  { slug: 'two-pointers', name: 'Two pointers and sliding window', category: 'dsa', level: 3, description: 'Linear-time patterns over sorted arrays and subarrays.', prereqs: ['arrays'] },
  { slug: 'recursion', name: 'Recursion', category: 'dsa', level: 2, description: 'Base cases, recursive cases and the call stack.', prereqs: ['functions'] },
  { slug: 'sorting', name: 'Sorting', category: 'dsa', level: 2, description: 'Comparison sorts, merge sort, quicksort and stability.', prereqs: ['arrays', 'recursion'] },
  { slug: 'binary-search', name: 'Binary search', category: 'dsa', level: 3, description: 'Searching sorted spaces and searching on the answer.', prereqs: ['arrays', 'complexity'] },
  { slug: 'linked-lists', name: 'Linked lists', category: 'dsa', level: 2, description: 'Singly and doubly linked lists, pointers and reversal.', prereqs: ['collections'] },
  { slug: 'stacks-queues', name: 'Stacks and queues', category: 'dsa', level: 2, description: 'LIFO/FIFO structures, monotonic stacks, deques.', prereqs: ['arrays'] },
  { slug: 'trees', name: 'Trees', category: 'dsa', level: 3, description: 'Binary trees, traversals and tree recursion.', prereqs: ['recursion'] },
  { slug: 'bst', name: 'Binary search trees', category: 'dsa', level: 3, description: 'Ordered trees, insert, search, delete and balance.', prereqs: ['trees', 'binary-search'] },
  { slug: 'heaps', name: 'Heaps and priority queues', category: 'dsa', level: 3, description: 'Min/max heaps, top-k and scheduling problems.', prereqs: ['trees'] },
  { slug: 'graphs', name: 'Graphs', category: 'dsa', level: 3, description: 'Representations, BFS, DFS and connected components.', prereqs: ['stacks-queues', 'recursion'] },
  { slug: 'shortest-paths', name: 'Shortest paths', category: 'dsa', level: 4, description: "BFS on unweighted graphs, Dijkstra and topological order.", prereqs: ['graphs', 'heaps'] },
  { slug: 'greedy', name: 'Greedy algorithms', category: 'dsa', level: 3, description: 'Making locally optimal choices with proofs of correctness.', prereqs: ['sorting'] },
  { slug: 'backtracking', name: 'Backtracking', category: 'dsa', level: 3, description: 'Exploring choices recursively with pruning.', prereqs: ['recursion'] },
  { slug: 'dynamic-programming', name: 'Dynamic programming', category: 'dsa', level: 4, description: 'Overlapping subproblems, memoization and tabulation.', prereqs: ['recursion', 'arrays'] },

  // ---------- Design ----------
  { slug: 'oop', name: 'Object-oriented programming', category: 'design', level: 2, description: 'Classes, encapsulation, inheritance, composition and polymorphism.', prereqs: ['functions'] },
  { slug: 'solid-principles', name: 'SOLID and clean code', category: 'design', level: 3, description: 'Single responsibility, dependency inversion, naming and refactoring.', prereqs: ['oop'] },
  { slug: 'design-patterns', name: 'Design patterns', category: 'design', level: 3, description: 'Strategy, observer, factory, adapter and when not to use them.', prereqs: ['oop'] },
  { slug: 'low-level-design', name: 'Low-level design', category: 'design', level: 4, description: 'Designing classes and interactions for real systems (parking lot, LRU cache).', prereqs: ['solid-principles', 'design-patterns'] },

  // ---------- System design ----------
  { slug: 'system-design-basics', name: 'System design fundamentals', category: 'system-design', level: 3, description: 'Requirements, capacity estimates, load balancing and APIs at scale.', prereqs: ['http-rest', 'sql-basics'] },
  { slug: 'caching', name: 'Caching', category: 'system-design', level: 3, description: 'Cache strategies, invalidation, CDNs and TTLs.', prereqs: ['system-design-basics'] },
  { slug: 'scalability', name: 'Scalability and reliability', category: 'system-design', level: 4, description: 'Replication, partitioning, consistency and failure handling.', prereqs: ['system-design-basics', 'transactions'] },
  { slug: 'messaging', name: 'Queues and event-driven systems', category: 'system-design', level: 4, description: 'Message queues, pub/sub, idempotency and retries.', prereqs: ['system-design-basics'] },

  // ---------- Databases ----------
  { slug: 'sql-basics', name: 'SQL basics', category: 'databases', level: 1, description: 'SELECT, WHERE, ORDER BY, LIMIT and basic types.' },
  { slug: 'sql-joins', name: 'SQL joins', category: 'databases', level: 2, description: 'Inner, left and self joins; join conditions and pitfalls.', prereqs: ['sql-basics'] },
  { slug: 'sql-aggregation', name: 'Aggregation and grouping', category: 'databases', level: 2, description: 'GROUP BY, HAVING and aggregate functions.', prereqs: ['sql-basics'] },
  { slug: 'sql-advanced', name: 'Subqueries, CTEs and window functions', category: 'databases', level: 3, description: 'Composing queries and ranking/running totals.', prereqs: ['sql-joins', 'sql-aggregation'] },
  { slug: 'database-design', name: 'Database design', category: 'databases', level: 3, description: 'Entities, relationships, keys and normalization.', prereqs: ['sql-joins'] },
  { slug: 'indexing', name: 'Indexes and query performance', category: 'databases', level: 3, description: 'B-tree indexes, EXPLAIN and query planning basics.', prereqs: ['sql-joins'] },
  { slug: 'transactions', name: 'Transactions and concurrency', category: 'databases', level: 4, description: 'ACID, isolation levels, locking and anomalies.', prereqs: ['database-design'] },

  // ---------- CS fundamentals ----------
  { slug: 'computer-architecture', name: 'How computers work', category: 'cs-fundamentals', level: 1, description: 'Binary, memory, CPU basics and how programs run.' },
  { slug: 'operating-systems', name: 'Operating systems', category: 'cs-fundamentals', level: 3, description: 'Processes, threads, scheduling, memory and file systems.', prereqs: ['computer-architecture'] },
  { slug: 'networking', name: 'Computer networking', category: 'cs-fundamentals', level: 3, description: 'TCP/IP, DNS, HTTP, TLS and latency.', prereqs: ['computer-architecture'] },
  { slug: 'concurrency', name: 'Concurrency', category: 'cs-fundamentals', level: 4, description: 'Threads, locks, races, deadlocks and async models.', prereqs: ['operating-systems'] },

  // ---------- DevOps ----------
  { slug: 'command-line', name: 'Command line', category: 'devops', level: 1, description: 'Shell navigation, files, pipes and scripting basics.' },
  { slug: 'git', name: 'Git', category: 'devops', level: 1, description: 'Commits, branches, merging, rebasing and remotes.', prereqs: ['command-line'] },
  { slug: 'docker', name: 'Containers with Docker', category: 'devops', level: 3, description: 'Images, containers, Dockerfiles and compose.', prereqs: ['command-line'] },
  { slug: 'ci-cd', name: 'CI/CD', category: 'devops', level: 3, description: 'Automated builds, tests and deployments.', prereqs: ['git', 'unit-testing'] },
  { slug: 'cloud-basics', name: 'Cloud fundamentals', category: 'devops', level: 3, description: 'Compute, storage, networking and managed services in the cloud.', prereqs: ['networking'] },
  { slug: 'observability', name: 'Observability and reliability', category: 'devops', level: 4, description: 'Logs, metrics, traces, SLOs and incident response.', prereqs: ['cloud-basics'] },

  // ---------- AI / ML / data ----------
  { slug: 'statistics', name: 'Statistics', category: 'math', level: 2, description: 'Descriptive statistics, distributions, sampling and hypothesis tests.', prereqs: ['probability'] },
  { slug: 'probability', name: 'Probability', category: 'math', level: 2, description: 'Events, conditional probability, Bayes and expectation.' },
  { slug: 'linear-algebra', name: 'Linear algebra', category: 'math', level: 3, description: 'Vectors, matrices, dot products and transformations.' },
  { slug: 'discrete-math', name: 'Discrete math and logic', category: 'math', level: 2, description: 'Sets, logic, proofs, combinatorics and graphs.' },
  { slug: 'analytical-reasoning', name: 'Analytical reasoning', category: 'math', level: 1, description: 'Breaking down problems, estimation and quantitative aptitude.' },
  { slug: 'data-wrangling', name: 'Data wrangling with Python', category: 'ai-ml', level: 2, description: 'NumPy and pandas: loading, cleaning and transforming data.', prereqs: ['python'] },
  { slug: 'data-visualization', name: 'Data visualization', category: 'ai-ml', level: 2, description: 'Choosing and building honest charts.', prereqs: ['data-wrangling'] },
  { slug: 'ml-fundamentals', name: 'Machine learning fundamentals', category: 'ai-ml', level: 3, description: 'Supervised vs unsupervised learning, features, train/test splits.', prereqs: ['statistics', 'data-wrangling'] },
  { slug: 'model-evaluation', name: 'Model evaluation', category: 'ai-ml', level: 3, description: 'Metrics, cross-validation, overfitting and bias.', prereqs: ['ml-fundamentals'] },
  { slug: 'deep-learning', name: 'Deep learning basics', category: 'ai-ml', level: 4, description: 'Neural networks, gradient descent and common architectures.', prereqs: ['ml-fundamentals', 'linear-algebra'] },
  { slug: 'llm-applications', name: 'LLM applications', category: 'ai-ml', level: 3, description: 'Prompting, retrieval-augmented generation, evaluation and safety.', prereqs: ['http-rest', 'python'] },

  // ---------- Quality ----------
  { slug: 'debugging', name: 'Debugging', category: 'quality', level: 1, description: 'Reproducing, isolating and fixing defects systematically.', prereqs: ['programming-basics'] },
  { slug: 'unit-testing', name: 'Unit testing', category: 'quality', level: 2, description: 'Writing focused tests, assertions, fixtures and test design.', prereqs: ['functions'] },
  { slug: 'web-security', name: 'Application security', category: 'quality', level: 3, description: 'OWASP Top 10: injection, XSS, access control and secrets.', prereqs: ['http-rest'] },
  { slug: 'code-review', name: 'Code review and refactoring', category: 'quality', level: 3, description: 'Reviewing for correctness and clarity; safe refactoring.', prereqs: ['unit-testing'] },

  // ---------- Collaboration & professional ----------
  { slug: 'open-source', name: 'Open-source contribution', category: 'collaboration', level: 2, description: 'Finding issues, forking, pull requests and community norms.', prereqs: ['git'] },
  { slug: 'teamwork', name: 'Teamwork and collaboration', category: 'professional', level: 1, description: 'Working in teams, planning, feedback and ownership.' },
  { slug: 'communication', name: 'Professional communication', category: 'professional', level: 1, description: 'Clear spoken and written communication with peers and stakeholders.' },
  { slug: 'technical-writing', name: 'Technical writing', category: 'professional', level: 2, description: 'READMEs, design docs, documentation and explaining decisions.', prereqs: ['communication'] },

  // ---------- Career ----------
  { slug: 'resume-writing', name: 'Resume writing', category: 'career', level: 1, description: 'Evidence-based bullet points, tailoring and formatting.' },
  { slug: 'behavioral-interviews', name: 'Behavioral interviews', category: 'career', level: 2, description: 'STAR stories, reflection and communicating impact.', prereqs: ['communication'] },
  { slug: 'technical-interviews', name: 'Technical interviews', category: 'career', level: 3, description: 'Problem-solving out loud, clarifying, testing and trade-offs.', prereqs: ['complexity'] },
  { slug: 'job-search', name: 'Job search strategy', category: 'career', level: 1, description: 'Targeting roles, networking, applications and offers.' },
];
