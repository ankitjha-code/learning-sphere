// Curated public library. External entries link to free, stable, well-known sources with attribution.
// Authored entries (body set, no url) are original LearnSphere Nexus writing.
export type SeedResource = {
  kind: 'article' | 'video' | 'docs' | 'cheatsheet' | 'course' | 'exercise' | 'interview' | 'link';
  title: string; // unique within this file (used as the idempotent seed key)
  summary: string; // 1-2 sentences, plain text, original wording
  url?: string; // external link (https only). Omit for authored entries.
  body?: string; // markdown, only for authored entries
  sourceName: string; // attribution, e.g. 'MDN Web Docs (Mozilla)'; authored entries use 'LearnSphere Nexus'
  license?: string; // only when you actually know it, e.g. 'CC BY-SA 2.5', 'CC BY 4.0', 'MIT', 'Free to read online (all rights reserved)'
  topics: string[]; // lowercase short tags, e.g. ['sql', 'joins']
  languages: string[]; // programming languages involved, lowercase: python, javascript, typescript, java, cpp, c, go, rust, sql. Empty if language-agnostic.
  roles: string[]; // target roles from: 'Backend Developer', 'Frontend Developer', 'Full Stack Developer', 'Data Analyst', 'Data Scientist', 'ML Engineer', 'DevOps Engineer', 'Software Engineer'
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  skills: string[]; // skill slugs, ONLY from the list in server/db/seed/content/skills.ts
  downloadable?: boolean; // true only for authored cheat sheets (users may download the markdown)
};

const AUTHORED_LICENSE = 'CC BY 4.0 (LearnSphere Nexus original)';

// ---------------------------------------------------------------------------
// Authored cheat sheets (original LearnSphere Nexus writing)
// ---------------------------------------------------------------------------

const SQL_CHEATSHEET = `# SQL joins and aggregation cheat sheet

## Join types at a glance

| Join | Rows returned |
| --- | --- |
| \`INNER JOIN\` | Only rows with a match on both sides |
| \`LEFT JOIN\` | Every row from the left table, plus matches from the right (NULLs where none) |
| \`RIGHT JOIN\` | Mirror image of LEFT JOIN; usually rewritten as a LEFT JOIN for readability |
| \`FULL OUTER JOIN\` | All rows from both sides, NULLs filling the gaps |
| \`CROSS JOIN\` | Every combination of rows (row count = left x right) |
| Self join | A table joined to itself using two aliases |

\`\`\`sql
-- Customers with their orders (customers without orders are kept)
SELECT c.id, c.name, o.id AS order_id, o.total
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id;
\`\`\`

## Common join pitfalls

- **Filtering the right table in WHERE turns a LEFT JOIN into an INNER JOIN.** Put the condition in the \`ON\` clause instead if you want to keep unmatched rows:

\`\`\`sql
SELECT c.name, o.id
FROM customers c
LEFT JOIN orders o
  ON o.customer_id = c.id AND o.status = 'paid';
\`\`\`

- **Anti-join (rows with no match):** use a LEFT JOIN and test the right key for NULL, or \`NOT EXISTS\`.

\`\`\`sql
SELECT c.*
FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);
\`\`\`

- **Row multiplication:** joining a one-to-many relationship repeats the "one" side. Summing a column from the "one" side after such a join double counts. Aggregate first in a subquery or CTE, then join.

## Aggregation

| Function | Notes |
| --- | --- |
| \`COUNT(*)\` | Counts rows, including those with NULLs |
| \`COUNT(col)\` | Counts non-NULL values of \`col\` |
| \`COUNT(DISTINCT col)\` | Counts unique non-NULL values |
| \`SUM\`, \`AVG\`, \`MIN\`, \`MAX\` | Ignore NULLs |

\`\`\`sql
SELECT customer_id, COUNT(*) AS orders, SUM(total) AS revenue
FROM orders
WHERE created_at >= DATE '2024-01-01'   -- filters rows before grouping
GROUP BY customer_id
HAVING SUM(total) > 500                  -- filters groups after aggregation
ORDER BY revenue DESC
LIMIT 10;
\`\`\`

Every column in \`SELECT\` must either appear in \`GROUP BY\` or be wrapped in an aggregate.

## Logical order of evaluation

1. \`FROM\` and \`JOIN\`
2. \`WHERE\`
3. \`GROUP BY\`
4. \`HAVING\`
5. \`SELECT\` (aliases are created here)
6. \`ORDER BY\`
7. \`LIMIT\` / \`OFFSET\`

This is why a column alias defined in \`SELECT\` cannot be used in \`WHERE\` in most databases, but can be used in \`ORDER BY\`.

## Window functions: aggregate without collapsing rows

\`\`\`sql
SELECT id, customer_id, total,
       SUM(total) OVER (PARTITION BY customer_id ORDER BY created_at) AS running_total,
       RANK() OVER (ORDER BY total DESC) AS overall_rank
FROM orders;
\`\`\`

Use \`ROW_NUMBER()\` for a unique sequence, \`RANK()\` when ties share a rank and leave gaps, and \`DENSE_RANK()\` when ties share a rank without gaps.
`;

const GIT_CHEATSHEET = `# Git everyday commands cheat sheet

## Start and inspect

| Command | What it does |
| --- | --- |
| \`git init\` | Create a new repository in the current folder |
| \`git clone <url>\` | Copy a remote repository locally |
| \`git status\` | Show staged, unstaged and untracked changes |
| \`git diff\` | Show unstaged changes |
| \`git diff --staged\` | Show what will go into the next commit |
| \`git log --oneline --graph --all\` | Compact history with branch structure |
| \`git show <commit>\` | Inspect a single commit |

## Save work

\`\`\`bash
git add path/to/file      # stage a file
git add -p                # stage changes hunk by hunk (review as you go)
git commit -m "Explain why, not just what"
git commit --amend        # fix the last commit message or add forgotten files
\`\`\`

Only amend commits that you have not pushed to a shared branch yet.

## Branches

\`\`\`bash
git switch -c feature/login   # create and move to a new branch
git switch main               # move to an existing branch
git branch                    # list local branches
git branch -d feature/login   # delete a merged branch
git merge feature/login       # merge a branch into the current one
git rebase main               # replay your branch commits on top of main
\`\`\`

Rule of thumb: rebase your own unpublished work to keep history tidy, merge when integrating shared branches.

## Work with remotes

\`\`\`bash
git remote -v                       # list remotes
git fetch origin                    # download new commits without changing your files
git pull --rebase                   # fetch, then rebase local commits on top
git push -u origin feature/login    # publish a branch and set its upstream
\`\`\`

## Undo safely

| Situation | Command |
| --- | --- |
| Discard unstaged edits in a file | \`git restore <file>\` |
| Unstage a file but keep the edits | \`git restore --staged <file>\` |
| Undo the last commit, keep changes staged | \`git reset --soft HEAD~1\` |
| Create a new commit that reverses an old one | \`git revert <commit>\` |
| Find a commit you "lost" after a reset | \`git reflog\` |

\`git revert\` is the safe choice on shared branches because it does not rewrite history. \`git reset --hard\` throws away uncommitted work, so double check before using it.

## Park work in progress

\`\`\`bash
git stash push -m "half-done refactor"
git stash list
git stash pop        # reapply the latest stash and drop it
\`\`\`

## Good habits

- Commit small, focused changes with messages that explain intent.
- Run \`git status\` and \`git diff --staged\` before every commit.
- Pull or fetch often to keep merge conflicts small.
- Never commit secrets; add them to \`.gitignore\` and rotate anything that leaked.
- Use tags (\`git tag v1.2.0\`) to mark releases.
`;

const BIGO_CHEATSHEET = `# Big-O complexity cheat sheet

Big-O describes how the cost of an algorithm grows as the input size \`n\` grows. Constants and lower-order terms are dropped: \`3n + 10\` is O(n).

## Common growth rates (fastest to slowest)

| Notation | Name | Typical example |
| --- | --- | --- |
| O(1) | Constant | Array index, hash map lookup (average) |
| O(log n) | Logarithmic | Binary search, balanced BST lookup |
| O(n) | Linear | Single pass over an array |
| O(n log n) | Linearithmic | Merge sort, heap sort, efficient comparison sorting |
| O(n^2) | Quadratic | Nested loops over the same input |
| O(2^n) | Exponential | Enumerating all subsets |
| O(n!) | Factorial | Enumerating all permutations |

## Data structure operations (average case)

| Structure | Access | Search | Insert | Delete |
| --- | --- | --- | --- | --- |
| Dynamic array | O(1) | O(n) | O(1) amortized at end, O(n) in middle | O(n) |
| Linked list | O(n) | O(n) | O(1) given the node | O(1) given the node |
| Hash map / set | n/a | O(1) | O(1) | O(1) |
| Balanced BST | O(log n) | O(log n) | O(log n) | O(log n) |
| Binary heap | O(1) peek min/max | O(n) | O(log n) | O(log n) pop |
| Stack / queue (deque) | n/a | O(n) | O(1) | O(1) |

Hash tables degrade to O(n) in the worst case when many keys collide. An unbalanced BST can degrade to O(n) as well.

## Sorting algorithms

| Algorithm | Best | Average | Worst | Extra space | Stable |
| --- | --- | --- | --- | --- | --- |
| Insertion sort | O(n) | O(n^2) | O(n^2) | O(1) | Yes |
| Merge sort | O(n log n) | O(n log n) | O(n log n) | O(n) | Yes |
| Quicksort | O(n log n) | O(n log n) | O(n^2) | O(log n) stack | No |
| Heap sort | O(n log n) | O(n log n) | O(n log n) | O(1) | No |
| Counting sort | O(n + k) | O(n + k) | O(n + k) | O(k) | Yes |

## Graph algorithms

| Algorithm | Time |
| --- | --- |
| BFS / DFS (adjacency list) | O(V + E) |
| Topological sort | O(V + E) |
| Dijkstra with a binary heap | O((V + E) log V) |
| Building a heap from n items | O(n) |

## Quick rules for analyzing code

- Sequential steps add: O(n) followed by O(n log n) is O(n log n).
- Nested loops multiply: a loop of n inside a loop of n is O(n^2).
- Halving the problem each step gives O(log n).
- Recursion that branches twice and goes n levels deep is often O(2^n); memoization can bring it down to the number of distinct subproblems.
- Space counts too: recursion depth uses stack space, and building a new list of size n is O(n) extra memory.

## Interview tips

- State both time and space complexity, and say which case (average or worst) you mean.
- Mention trade-offs: a hash set buys O(1) lookup at the cost of O(n) memory.
- Sorting first (O(n log n)) often unlocks two pointers or binary search.
`;

const HTTP_CHEATSHEET = `# HTTP status codes and methods cheat sheet

## Methods

| Method | Typical use | Safe | Idempotent |
| --- | --- | --- | --- |
| GET | Read a resource | Yes | Yes |
| HEAD | Same as GET, headers only | Yes | Yes |
| OPTIONS | Ask which methods are allowed (used by CORS preflight) | Yes | Yes |
| POST | Create a resource or trigger an action | No | No |
| PUT | Replace a resource entirely | No | Yes |
| PATCH | Partially update a resource | No | Not guaranteed |
| DELETE | Remove a resource | No | Yes |

- **Safe** means the request should not change server state.
- **Idempotent** means repeating the same request has the same effect as sending it once, which makes it safe to retry. To make POST retries safe, many APIs accept an idempotency key header.

## Status code classes

| Range | Meaning |
| --- | --- |
| 1xx | Informational |
| 2xx | Success |
| 3xx | Redirection |
| 4xx | Client error: the request needs to change |
| 5xx | Server error: the server failed a valid request |

## Codes you will use most

| Code | Name | When to return it |
| --- | --- | --- |
| 200 | OK | Successful GET, or an update that returns a body |
| 201 | Created | A new resource was created; include a \`Location\` header |
| 202 | Accepted | Work was queued and will finish later |
| 204 | No Content | Success with no response body (common for DELETE) |
| 301 | Moved Permanently | Resource has a new permanent URL |
| 302 | Found | Temporary redirect |
| 304 | Not Modified | Cached copy is still valid (conditional GET) |
| 307 / 308 | Temporary / Permanent Redirect | Like 302 / 301 but the method and body must be preserved |
| 400 | Bad Request | Malformed syntax or invalid input |
| 401 | Unauthorized | Not authenticated: missing or invalid credentials |
| 403 | Forbidden | Authenticated, but not allowed to do this |
| 404 | Not Found | No resource at this URL (also used to hide existence) |
| 409 | Conflict | State conflict, such as a duplicate or version mismatch |
| 422 | Unprocessable Content | Well-formed request that fails validation |
| 429 | Too Many Requests | Rate limit hit; send \`Retry-After\` when possible |
| 500 | Internal Server Error | Unexpected failure on the server |
| 502 | Bad Gateway | An upstream server returned an invalid response |
| 503 | Service Unavailable | Overloaded or down for maintenance |
| 504 | Gateway Timeout | An upstream server did not respond in time |

## Headers worth knowing

\`Content-Type\` and \`Accept\` describe body formats, \`Authorization\` carries credentials, \`Cache-Control\` and \`ETag\` drive caching, and \`Location\` points to a created resource or redirect target.

## API design reminders

- Use nouns for resources (\`/orders/42\`) and methods for actions.
- Return a consistent error body, for example \`{ "error": { "code": "...", "message": "..." } }\`.
- Do not return 200 with an error message inside; let the status code tell the truth.
`;

const PYTHON_CHEATSHEET = `# Python collections cheat sheet

## Built-in containers

| Type | Literal | Ordered | Mutable | Duplicates | Typical use |
| --- | --- | --- | --- | --- | --- |
| list | \`[1, 2, 3]\` | Yes | Yes | Yes | Sequences you append to and index |
| tuple | \`(1, 2)\` | Yes | No | Yes | Fixed records, dictionary keys |
| dict | \`{"a": 1}\` | Insertion order | Yes | Unique keys | Lookup by key |
| set | \`{1, 2}\` | No | Yes | No | Membership tests, deduplication |
| frozenset | \`frozenset({1, 2})\` | No | No | No | Hashable set (usable as a key) |

Note: \`{}\` creates an empty dict. Use \`set()\` for an empty set.

## List essentials

\`\`\`python
nums = [5, 3, 8]
nums.append(1)          # O(1) amortized
nums.insert(0, 9)       # O(n): shifts elements
last = nums.pop()       # O(1)
first = nums.pop(0)     # O(n): use collections.deque for queues
nums.sort()             # in place, returns None
ordered = sorted(nums, key=lambda x: -x)  # new list
evens = [n for n in nums if n % 2 == 0]   # list comprehension
sub = nums[1:3]         # slicing makes a shallow copy
\`\`\`

## Dict essentials

\`\`\`python
ages = {"ana": 31, "raj": 27}
ages.get("li", 0)               # default instead of KeyError
ages.setdefault("li", 22)       # insert if missing
for name, age in ages.items():
    print(name, age)
squares = {n: n * n for n in range(5)}   # dict comprehension
merged = ages | {"zoe": 40}               # Python 3.9+
\`\`\`

## Set essentials

\`\`\`python
a, b = {1, 2, 3}, {2, 3, 4}
a | b    # union        {1, 2, 3, 4}
a & b    # intersection {2, 3}
a - b    # difference   {1}
a ^ b    # symmetric difference {1, 4}
3 in a   # O(1) average membership test
\`\`\`

## The collections module

\`\`\`python
from collections import Counter, defaultdict, deque, namedtuple

Counter("banana").most_common(2)   # [('a', 3), ('n', 2)]

groups = defaultdict(list)
for word in ["apple", "avocado", "banana"]:
    groups[word[0]].append(word)    # no KeyError for new keys

q = deque([1, 2, 3])
q.appendleft(0); q.popleft()        # O(1) at both ends
window = deque(maxlen=3)            # keeps only the last 3 items

Point = namedtuple("Point", "x y")
p = Point(2, 5); p.x                # readable, immutable record
\`\`\`

## heapq and bisect

\`\`\`python
import heapq, bisect

h = [5, 1, 4]
heapq.heapify(h)          # O(n), min-heap in place
heapq.heappush(h, 2)      # O(log n)
smallest = heapq.heappop(h)
top3 = heapq.nlargest(3, [7, 2, 9, 4, 8])

scores = [10, 20, 30]
bisect.bisect_left(scores, 20)   # 1: index for insertion keeping order
bisect.insort(scores, 25)        # insert in sorted position
\`\`\`

For a max-heap, push negated values or \`(-priority, item)\` tuples.

## Gotchas

- Default arguments are evaluated once: use \`def f(items=None)\` and create the list inside.
- \`[[0] * 3] * 3\` repeats the same inner list; use \`[[0] * 3 for _ in range(3)]\`.
- Only hashable (immutable) values can be dict keys or set members.
- Use \`copy.deepcopy\` when nested structures must be fully independent.
`;

const STAR_CHEATSHEET = `# STAR method for behavioral interviews

Behavioral questions ("Tell me about a time when...") test how you actually behave at work. STAR gives your answer a shape so the interviewer can follow it and score it.

## The four parts

| Part | What to cover | Rough share of the answer |
| --- | --- | --- |
| **Situation** | Where and when, the team, the stakes. One or two sentences. | 10 to 15 percent |
| **Task** | Your specific responsibility or the goal you owned. | 10 percent |
| **Action** | The concrete steps *you* took and why you chose them. | 50 to 60 percent |
| **Result** | The measurable outcome, plus what you learned. | 20 percent |

Aim for about two minutes per story. Spend the most time on Action, because that is where your judgment shows.

## Worked example (original)

> **Question:** Tell me about a time you dealt with a production problem under pressure.

- **Situation:** In my final-year project team, our demo app started timing out two days before a showcase with 200 expected visitors.
- **Task:** I owned the backend, so finding and fixing the slowdown was on me.
- **Action:** I reproduced the issue with a load script, then profiled the slowest endpoint and found it ran one database query per list item. I rewrote it as a single join, added an index on the foreign key, and set up a basic response-time check that ran before each deploy. I posted short updates in our team chat so the frontend teammates could plan around it.
- **Result:** Median response time dropped from about 3 seconds to under 200 milliseconds, the showcase ran without errors, and the pre-deploy check caught a similar regression a week later. I learned to measure before guessing.

## Build a story bank

Prepare 6 to 8 stories and map each one to several themes:

| Theme | Example prompt |
| --- | --- |
| Conflict | A disagreement with a teammate or reviewer |
| Failure | A mistake you made and how you recovered |
| Leadership | Taking ownership without formal authority |
| Ambiguity | Making progress with unclear requirements |
| Impact | Your proudest technical result |
| Learning | Picking up a new tool or domain quickly |
| Feedback | Receiving tough feedback and acting on it |

A single strong story can often answer two or three different questions if you shift the emphasis.

## Tips

- Say "I", not "we", when describing actions. Credit the team, but make your part clear.
- Quantify results where you can: time saved, errors reduced, users helped. If you lack numbers, describe the observable change.
- For failure questions, pick a real mistake, own it without blaming others, and spend real time on what you changed afterward.
- Keep the Situation short. Interviewers lose interest in long background.
- Pause after the Result. Let the interviewer ask follow-ups instead of over-explaining.
- Be honest. Follow-up questions quickly expose invented details.

## Common mistakes

- Answering hypothetically ("I would...") instead of describing a real event.
- No result, or a result with no connection to your actions.
- Choosing a story where you were a bystander.
- Memorizing a script word for word, which sounds stiff. Memorize the beats, not the sentences.
`;

const DOCKER_CHEATSHEET = `# Docker essentials cheat sheet

## Key ideas

| Term | Meaning |
| --- | --- |
| Image | A read-only, layered template containing an app and its dependencies |
| Container | A running (or stopped) instance of an image |
| Dockerfile | A recipe of instructions used to build an image |
| Registry | A place to store and share images, such as Docker Hub |
| Volume | Storage managed by Docker that outlives any single container |

## Images

\`\`\`bash
docker build -t myapp:1.0 .        # build from the Dockerfile in this folder
docker images                      # list local images
docker pull postgres:16            # download an image
docker tag myapp:1.0 user/myapp:1.0
docker push user/myapp:1.0         # upload to a registry (after docker login)
docker rmi myapp:1.0               # remove an image
\`\`\`

## Containers

\`\`\`bash
docker run -d --name web -p 8080:80 nginx   # detached, host port 8080 -> container port 80
docker run --rm -it python:3.12 bash        # interactive, removed on exit
docker ps                                   # running containers
docker ps -a                                # include stopped ones
docker logs -f web                          # follow output
docker exec -it web sh                      # open a shell inside a running container
docker stop web && docker rm web
\`\`\`

Pass configuration with \`-e KEY=value\` or \`--env-file .env\`, and mount data with \`-v mydata:/var/lib/data\` (named volume) or \`-v "$(pwd)":/app\` (bind mount).

## A small, production-minded Dockerfile

\`\`\`dockerfile
# Stage 1: install dependencies and build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: ship only what is needed at runtime
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
\`\`\`

Why it is shaped this way:

- Copying \`package*.json\` before the source lets Docker reuse the cached dependency layer when only code changes.
- The multi-stage build keeps compilers and dev dependencies out of the final image.
- \`USER node\` avoids running as root.
- Add a \`.dockerignore\` (for example \`node_modules\`, \`.git\`, \`.env\`) to keep the build context small and secrets out of images.

## Docker Compose

\`\`\`yaml
services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://app:secret@db:5432/app
    depends_on:
      - db
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: app
    volumes:
      - dbdata:/var/lib/postgresql/data
volumes:
  dbdata:
\`\`\`

\`\`\`bash
docker compose up -d       # start everything in the background
docker compose logs -f api
docker compose down        # stop and remove containers (add -v to delete volumes)
\`\`\`

Services on the same Compose network reach each other by service name (here, \`db\`). Use real secret management for anything beyond local development.

## Cleanup

\`\`\`bash
docker system df           # see disk usage
docker system prune        # remove stopped containers, unused networks, dangling images
\`\`\`
`;

const REGEX_CHEATSHEET = `# Regular expressions quick reference

Syntax below works in JavaScript, Python and most modern engines. Small differences are noted.

## Characters and classes

| Pattern | Matches |
| --- | --- |
| \`.\` | Any character except newline (unless the dotall flag is on) |
| \`\\d\` / \`\\D\` | A digit / a non-digit |
| \`\\w\` / \`\\W\` | A word character (letter, digit, underscore) / anything else |
| \`\\s\` / \`\\S\` | Whitespace / non-whitespace |
| \`[abc]\` | One of a, b or c |
| \`[^abc]\` | Any character except a, b or c |
| \`[a-z0-9]\` | A range of characters |
| \`\\.\` | A literal dot (escape special characters with a backslash) |

## Anchors and boundaries

| Pattern | Meaning |
| --- | --- |
| \`^\` | Start of string (or line, with the multiline flag) |
| \`$\` | End of string (or line, with the multiline flag) |
| \`\\b\` | Word boundary |
| \`\\B\` | Not a word boundary |

## Quantifiers

| Pattern | Meaning |
| --- | --- |
| \`*\` | 0 or more |
| \`+\` | 1 or more |
| \`?\` | 0 or 1 (optional) |
| \`{3}\` | Exactly 3 |
| \`{2,5}\` | Between 2 and 5 |
| \`{2,}\` | 2 or more |
| \`*?\`, \`+?\`, \`??\` | Lazy versions: match as little as possible |

Quantifiers are greedy by default. On the text \`<b>hi</b>\`, the pattern \`<.+>\` matches the whole string, while \`<.+?>\` matches just \`<b>\`.

## Groups and alternation

| Pattern | Meaning |
| --- | --- |
| \`(abc)\` | Capturing group |
| \`(?:abc)\` | Non-capturing group |
| \`(?<year>\\d{4})\` | Named group (Python also accepts \`(?P<year>...)\`) |
| \`\\1\` | Backreference to group 1 |
| \`cat\\|dog\` | Either cat or dog |

## Lookarounds (zero-width)

| Pattern | Meaning |
| --- | --- |
| \`x(?=y)\` | x followed by y |
| \`x(?!y)\` | x not followed by y |
| \`(?<=y)x\` | x preceded by y |
| \`(?<!y)x\` | x not preceded by y |

## Flags

| Flag | JavaScript | Python |
| --- | --- | --- |
| Case-insensitive | \`i\` | \`re.IGNORECASE\` |
| Multiline anchors | \`m\` | \`re.MULTILINE\` |
| Dot matches newline | \`s\` | \`re.DOTALL\` |
| Find all matches | \`g\` (or use \`matchAll\`) | use \`re.findall\` / \`re.finditer\` |

## Practical patterns

\`\`\`text
^\\d{4}-\\d{2}-\\d{2}$          ISO-style date shape, e.g. 2024-05-17 (does not validate the calendar)
^[\\w.+-]+@[\\w-]+\\.[\\w.-]+$    Rough email shape (real validation means sending an email)
\\b(\\w+)\\s+\\1\\b               A doubled word such as "the the"
^\\s+|\\s+$                     Leading or trailing whitespace
#[0-9a-fA-F]{6}\\b             Six-digit hex color
\`\`\`

## Using them in code

\`\`\`javascript
const m = "Order 2024-05-17".match(/(?<y>\\d{4})-(?<mo>\\d{2})-(?<d>\\d{2})/);
console.log(m.groups.y);                       // "2024"
"a1b22c333".replace(/\\d+/g, "#");              // "a#b#c#"
\`\`\`

\`\`\`python
import re
re.findall(r"\\d+", "a1b22c333")                # ['1', '22', '333']
re.sub(r"\\s+", " ", "too    many   spaces")     # 'too many spaces'
\`\`\`

In Python, always write patterns as raw strings (\`r"..."\`) so backslashes reach the regex engine unchanged.

## Tips

- Test patterns against both matching and non-matching examples.
- Prefer a real parser for HTML, JSON or nested structures.
- Avoid nested quantifiers like \`(a+)+\` on untrusted input; they can cause catastrophic backtracking.
`;

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

export const LIBRARY_RESOURCES: SeedResource[] = [
  // ---------- Programming foundations ----------
  {
    kind: 'course',
    title: "CS50's Introduction to Computer Science",
    summary: "Harvard's free introductory computer science course, starting in C and moving through Python, SQL and web basics, with lectures, notes and problem sets.",
    url: 'https://cs50.harvard.edu/x/',
    sourceName: 'Harvard University (CS50)',
    topics: ['computer science', 'c', 'fundamentals'],
    languages: ['c', 'python', 'sql'],
    roles: ['Software Engineer', 'Backend Developer', 'Full Stack Developer'],
    difficulty: 'beginner',
    skills: ['programming-basics', 'c-lang', 'computer-architecture'],
  },
  {
    kind: 'video',
    title: 'CS50 on YouTube',
    summary: "The official CS50 channel with full lecture recordings, shorts and seminars covering programming fundamentals and computer science.",
    url: 'https://www.youtube.com/@cs50',
    sourceName: 'Harvard University (CS50)',
    topics: ['lectures', 'computer science', 'fundamentals'],
    languages: [],
    roles: ['Software Engineer'],
    difficulty: 'beginner',
    skills: ['programming-basics', 'control-flow'],
  },
  {
    kind: 'docs',
    title: 'The Python Tutorial',
    summary: 'The official Python tutorial, covering syntax, data structures, modules, errors, classes and a tour of the standard library.',
    url: 'https://docs.python.org/3/tutorial/',
    sourceName: 'Python Software Foundation',
    topics: ['python', 'language basics'],
    languages: ['python'],
    roles: ['Backend Developer', 'Data Analyst', 'Data Scientist', 'ML Engineer', 'Software Engineer'],
    difficulty: 'beginner',
    skills: ['python', 'programming-basics', 'collections'],
  },
  {
    kind: 'docs',
    title: 'The Modern JavaScript Tutorial',
    summary: 'A thorough, example-driven guide to JavaScript from basics through closures, prototypes, promises, async/await and browser APIs.',
    url: 'https://javascript.info/',
    sourceName: 'javascript.info (Ilya Kantor and contributors)',
    license: 'CC BY-NC-SA',
    topics: ['javascript', 'language basics', 'async'],
    languages: ['javascript'],
    roles: ['Frontend Developer', 'Full Stack Developer', 'Backend Developer'],
    difficulty: 'beginner',
    skills: ['javascript', 'async-programming', 'dom-browser'],
  },
  {
    kind: 'docs',
    title: 'MDN JavaScript Guide',
    summary: "Mozilla's guide to the JavaScript language: grammar, control flow, functions, objects, classes, promises and modules.",
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide',
    sourceName: 'MDN Web Docs (Mozilla)',
    license: 'CC BY-SA 2.5',
    topics: ['javascript', 'reference'],
    languages: ['javascript'],
    roles: ['Frontend Developer', 'Full Stack Developer'],
    difficulty: 'beginner',
    skills: ['javascript', 'functions'],
  },
  {
    kind: 'docs',
    title: 'The TypeScript Handbook',
    summary: 'The official handbook explaining everyday types, narrowing, generics, object types and how TypeScript fits into JavaScript projects.',
    url: 'https://www.typescriptlang.org/docs/handbook/intro.html',
    sourceName: 'TypeScript (Microsoft)',
    topics: ['typescript', 'types', 'generics'],
    languages: ['typescript'],
    roles: ['Frontend Developer', 'Full Stack Developer', 'Backend Developer'],
    difficulty: 'intermediate',
    skills: ['typescript'],
  },
  {
    kind: 'docs',
    title: 'Learn Java on dev.java',
    summary: "Oracle's official learning hub for Java, with tutorials on the language, the collections framework, records, generics and the JVM.",
    url: 'https://dev.java/learn/',
    sourceName: 'dev.java (Oracle)',
    topics: ['java', 'language basics', 'jvm'],
    languages: ['java'],
    roles: ['Backend Developer', 'Software Engineer'],
    difficulty: 'beginner',
    skills: ['java', 'oop'],
  },
  {
    kind: 'course',
    title: 'A Tour of Go',
    summary: 'An interactive, in-browser walkthrough of Go basics, methods, interfaces, generics and concurrency with goroutines and channels.',
    url: 'https://go.dev/tour/',
    sourceName: 'The Go Project',
    topics: ['go', 'concurrency', 'interfaces'],
    languages: ['go'],
    roles: ['Backend Developer', 'DevOps Engineer', 'Software Engineer'],
    difficulty: 'beginner',
    skills: ['go', 'concurrency'],
  },
  {
    kind: 'docs',
    title: 'Go by Example',
    summary: 'Short annotated Go programs that each demonstrate one feature, from slices and maps to worker pools and rate limiting.',
    url: 'https://gobyexample.com/',
    sourceName: 'Go by Example (Mark McGranaghan and Eli Bendersky)',
    topics: ['go', 'examples'],
    languages: ['go'],
    roles: ['Backend Developer', 'DevOps Engineer'],
    difficulty: 'intermediate',
    skills: ['go', 'collections'],
  },
  {
    kind: 'docs',
    title: 'The Rust Programming Language',
    summary: 'The official Rust book, explaining ownership, borrowing, enums, pattern matching, traits, error handling and fearless concurrency.',
    url: 'https://doc.rust-lang.org/book/',
    sourceName: 'The Rust Project',
    license: 'MIT or Apache-2.0',
    topics: ['rust', 'ownership', 'systems programming'],
    languages: ['rust'],
    roles: ['Backend Developer', 'Software Engineer'],
    difficulty: 'intermediate',
    skills: ['rust', 'error-handling'],
  },
  {
    kind: 'exercise',
    title: 'Rustlings',
    summary: 'Small broken Rust programs you fix one by one, a hands-on companion to the Rust book for getting used to the compiler.',
    url: 'https://github.com/rust-lang/rustlings',
    sourceName: 'The Rust Project',
    license: 'MIT',
    topics: ['rust', 'practice'],
    languages: ['rust'],
    roles: ['Software Engineer', 'Backend Developer'],
    difficulty: 'intermediate',
    skills: ['rust'],
  },
  {
    kind: 'course',
    title: 'Learn C++',
    summary: 'A free, regularly updated C++ tutorial site that moves from fundamentals to classes, templates, smart pointers and the STL.',
    url: 'https://www.learncpp.com/',
    sourceName: 'LearnCpp.com',
    topics: ['cpp', 'language basics', 'stl'],
    languages: ['cpp'],
    roles: ['Software Engineer'],
    difficulty: 'beginner',
    skills: ['cpp', 'oop'],
  },
  {
    kind: 'docs',
    title: 'cppreference',
    summary: 'A detailed community reference for the C and C++ languages and their standard libraries, useful when you need exact semantics.',
    url: 'https://en.cppreference.com/',
    sourceName: 'cppreference.com',
    topics: ['cpp', 'c', 'reference'],
    languages: ['cpp', 'c'],
    roles: ['Software Engineer'],
    difficulty: 'intermediate',
    skills: ['cpp', 'c-lang'],
  },
  {
    kind: 'exercise',
    title: 'Exercism language tracks',
    summary: 'Free coding exercises in dozens of languages with automated tests and optional human mentoring on your solutions.',
    url: 'https://exercism.org/tracks',
    sourceName: 'Exercism',
    topics: ['practice', 'katas', 'mentoring'],
    languages: ['python', 'javascript', 'typescript', 'java', 'go', 'rust', 'cpp', 'c'],
    roles: ['Software Engineer', 'Backend Developer', 'Frontend Developer'],
    difficulty: 'beginner',
    skills: ['programming-basics', 'functions', 'unit-testing'],
  },
  {
    kind: 'exercise',
    title: 'Project Euler',
    summary: 'A long-running collection of mathematical programming problems that reward clever algorithms over brute force.',
    url: 'https://projecteuler.net/',
    sourceName: 'Project Euler',
    topics: ['math', 'problem solving', 'practice'],
    languages: [],
    roles: ['Software Engineer', 'Data Scientist'],
    difficulty: 'intermediate',
    skills: ['analytical-reasoning', 'discrete-math', 'complexity'],
  },
  {
    kind: 'course',
    title: 'freeCodeCamp curriculum',
    summary: 'A free, self-paced curriculum with interactive lessons and certification projects in web development, JavaScript, Python and more.',
    url: 'https://www.freecodecamp.org/learn',
    sourceName: 'freeCodeCamp',
    topics: ['web development', 'projects', 'certifications'],
    languages: ['javascript', 'python'],
    roles: ['Frontend Developer', 'Full Stack Developer', 'Data Analyst'],
    difficulty: 'beginner',
    skills: ['html-css', 'javascript', 'programming-basics'],
  },
  {
    kind: 'video',
    title: 'freeCodeCamp on YouTube',
    summary: 'Long-form, full-length video courses on programming languages, frameworks, data science, cloud and interview preparation.',
    url: 'https://www.youtube.com/@freecodecamp',
    sourceName: 'freeCodeCamp',
    topics: ['video courses', 'programming'],
    languages: [],
    roles: ['Software Engineer', 'Full Stack Developer', 'Data Scientist'],
    difficulty: 'beginner',
    skills: ['programming-basics'],
  },

  // ---------- Web ----------
  {
    kind: 'course',
    title: 'MDN Learn web development',
    summary: 'A structured beginner path through HTML, CSS, JavaScript, accessibility and core web tooling, written by the MDN team.',
    url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development',
    sourceName: 'MDN Web Docs (Mozilla)',
    license: 'CC BY-SA 2.5',
    topics: ['html', 'css', 'web basics'],
    languages: ['javascript'],
    roles: ['Frontend Developer', 'Full Stack Developer'],
    difficulty: 'beginner',
    skills: ['html-css', 'javascript', 'dom-browser'],
  },
  {
    kind: 'docs',
    title: 'MDN CSS reference and guides',
    summary: 'Reference pages and guides for CSS properties, selectors, the box model, flexbox, grid and responsive layout.',
    url: 'https://developer.mozilla.org/en-US/docs/Web/CSS',
    sourceName: 'MDN Web Docs (Mozilla)',
    license: 'CC BY-SA 2.5',
    topics: ['css', 'layout', 'reference'],
    languages: [],
    roles: ['Frontend Developer', 'Full Stack Developer'],
    difficulty: 'beginner',
    skills: ['html-css'],
  },
  {
    kind: 'course',
    title: 'Learn CSS on web.dev',
    summary: "A free course from Chrome's developer relations team covering the box model, selectors, cascade, layout, flexbox and grid.",
    url: 'https://web.dev/learn/css',
    sourceName: 'web.dev (Google)',
    topics: ['css', 'layout', 'responsive design'],
    languages: [],
    roles: ['Frontend Developer', 'Full Stack Developer'],
    difficulty: 'beginner',
    skills: ['html-css'],
  },
  {
    kind: 'docs',
    title: 'MDN Accessibility guides',
    summary: 'Practical guidance on building accessible web pages: semantic HTML, ARIA, keyboard support and testing with assistive technology.',
    url: 'https://developer.mozilla.org/en-US/docs/Web/Accessibility',
    sourceName: 'MDN Web Docs (Mozilla)',
    license: 'CC BY-SA 2.5',
    topics: ['accessibility', 'aria', 'semantic html'],
    languages: [],
    roles: ['Frontend Developer', 'Full Stack Developer'],
    difficulty: 'intermediate',
    skills: ['web-accessibility', 'html-css'],
  },
  {
    kind: 'article',
    title: 'W3C WAI Accessibility Fundamentals',
    summary: 'An introduction from the W3C Web Accessibility Initiative to what accessibility means, who it serves and how WCAG is organized.',
    url: 'https://www.w3.org/WAI/fundamentals/',
    sourceName: 'W3C Web Accessibility Initiative',
    topics: ['accessibility', 'wcag'],
    languages: [],
    roles: ['Frontend Developer', 'Full Stack Developer'],
    difficulty: 'beginner',
    skills: ['web-accessibility'],
  },
  {
    kind: 'docs',
    title: 'MDN HTTP documentation',
    summary: 'Guides and reference for HTTP: how requests and responses work, methods, status codes, headers, caching, cookies and CORS.',
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP',
    sourceName: 'MDN Web Docs (Mozilla)',
    license: 'CC BY-SA 2.5',
    topics: ['http', 'headers', 'caching', 'cors'],
    languages: [],
    roles: ['Backend Developer', 'Frontend Developer', 'Full Stack Developer'],
    difficulty: 'beginner',
    skills: ['http-rest', 'networking'],
  },
  {
    kind: 'docs',
    title: 'React: Learn',
    summary: 'The official React learning path on components, JSX, props, state, effects and managing data flow in a modern React app.',
    url: 'https://react.dev/learn',
    sourceName: 'React (Meta Open Source)',
    license: 'CC BY 4.0',
    topics: ['react', 'components', 'state'],
    languages: ['javascript', 'typescript'],
    roles: ['Frontend Developer', 'Full Stack Developer'],
    difficulty: 'intermediate',
    skills: ['react', 'javascript'],
  },
  {
    kind: 'docs',
    title: 'Node.js Learn',
    summary: 'Official introductory articles on Node.js: the event loop, asynchronous work, modules, npm, files and building HTTP servers.',
    url: 'https://nodejs.org/en/learn',
    sourceName: 'Node.js (OpenJS Foundation)',
    topics: ['nodejs', 'event loop', 'npm'],
    languages: ['javascript'],
    roles: ['Backend Developer', 'Full Stack Developer'],
    difficulty: 'intermediate',
    skills: ['nodejs', 'async-programming', 'modules-packages'],
  },
  {
    kind: 'course',
    title: 'The Odin Project',
    summary: 'A free open-source full stack curriculum built around real projects, covering HTML, CSS, JavaScript, React and Node.js or Ruby on Rails.',
    url: 'https://www.theodinproject.com/',
    sourceName: 'The Odin Project',
    topics: ['full stack', 'projects', 'web development'],
    languages: ['javascript'],
    roles: ['Full Stack Developer', 'Frontend Developer'],
    difficulty: 'beginner',
    skills: ['html-css', 'javascript', 'git'],
  },

  // ---------- DSA and CS fundamentals ----------
  {
    kind: 'course',
    title: 'MIT 6.006 Introduction to Algorithms',
    summary: 'MIT OpenCourseWare lectures, notes and problem sets on sorting, hashing, trees, graphs, shortest paths and dynamic programming.',
    url: 'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/',
    sourceName: 'MIT OpenCourseWare',
    license: 'CC BY-NC-SA 4.0',
    topics: ['algorithms', 'data structures', 'graphs'],
    languages: ['python'],
    roles: ['Software Engineer', 'Backend Developer'],
    difficulty: 'intermediate',
    skills: ['complexity', 'graphs', 'dynamic-programming'],
  },
  {
    kind: 'docs',
    title: 'Open Data Structures',
    summary: 'A free textbook that explains and analyzes lists, hash tables, trees, heaps and graphs, with implementations in Java, C++ and pseudocode.',
    url: 'https://opendatastructures.org/',
    sourceName: 'Pat Morin, Open Data Structures',
    license: 'CC BY 2.5',
    topics: ['data structures', 'textbook'],
    languages: ['java', 'cpp'],
    roles: ['Software Engineer'],
    difficulty: 'intermediate',
    skills: ['hashing', 'trees', 'heaps'],
  },
  {
    kind: 'exercise',
    title: 'VisuAlgo',
    summary: 'Interactive animations of sorting, linked lists, heaps, BSTs, graph traversal and shortest path algorithms that you can step through.',
    url: 'https://visualgo.net/',
    sourceName: 'VisuAlgo (National University of Singapore)',
    topics: ['algorithms', 'visualization'],
    languages: [],
    roles: ['Software Engineer'],
    difficulty: 'beginner',
    skills: ['sorting', 'bst', 'graphs'],
  },
  {
    kind: 'course',
    title: 'The Missing Semester of Your CS Education',
    summary: 'An MIT course on the tools classes rarely teach: the shell, scripting, editors, version control, debugging and profiling.',
    url: 'https://missing.csail.mit.edu/',
    sourceName: 'MIT CSAIL',
    topics: ['shell', 'tooling', 'git'],
    languages: [],
    roles: ['Software Engineer', 'DevOps Engineer', 'Backend Developer'],
    difficulty: 'beginner',
    skills: ['command-line', 'git', 'debugging'],
  },
  {
    kind: 'docs',
    title: 'Operating Systems: Three Easy Pieces',
    summary: 'A free online textbook on virtualization, concurrency and persistence, the three big ideas behind modern operating systems.',
    url: 'https://pages.cs.wisc.edu/~remzi/OSTEP/',
    sourceName: 'Remzi and Andrea Arpaci-Dusseau (University of Wisconsin-Madison)',
    license: 'Free to read online',
    topics: ['operating systems', 'concurrency', 'file systems'],
    languages: ['c'],
    roles: ['Software Engineer', 'Backend Developer'],
    difficulty: 'advanced',
    skills: ['operating-systems', 'concurrency'],
  },
  {
    kind: 'docs',
    title: "Beej's Guide to Network Programming",
    summary: 'A friendly, practical guide to socket programming in C that also explains how TCP, UDP and addressing work underneath.',
    url: 'https://beej.us/guide/bgnet/',
    sourceName: 'Brian "Beej" Hall',
    topics: ['networking', 'sockets', 'tcp'],
    languages: ['c'],
    roles: ['Backend Developer', 'Software Engineer'],
    difficulty: 'advanced',
    skills: ['networking', 'c-lang'],
  },
  {
    kind: 'course',
    title: 'Khan Academy Statistics and Probability',
    summary: 'Free lessons and practice on descriptive statistics, probability, distributions, sampling and hypothesis testing.',
    url: 'https://www.khanacademy.org/math/statistics-probability',
    sourceName: 'Khan Academy',
    topics: ['statistics', 'probability', 'math'],
    languages: [],
    roles: ['Data Analyst', 'Data Scientist', 'ML Engineer'],
    difficulty: 'beginner',
    skills: ['statistics', 'probability'],
  },
  {
    kind: 'course',
    title: 'MIT 18.06 Linear Algebra',
    summary: "Gilbert Strang's classic linear algebra course with video lectures, covering matrices, vector spaces, eigenvalues and least squares.",
    url: 'https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/',
    sourceName: 'MIT OpenCourseWare',
    license: 'CC BY-NC-SA 4.0',
    topics: ['linear algebra', 'math', 'matrices'],
    languages: [],
    roles: ['Data Scientist', 'ML Engineer'],
    difficulty: 'intermediate',
    skills: ['linear-algebra'],
  },

  // ---------- Design ----------
  {
    kind: 'docs',
    title: 'Refactoring.Guru design patterns catalog',
    summary: 'Illustrated explanations of the classic design patterns with intent, structure, pros and cons and examples in several languages.',
    url: 'https://refactoring.guru/design-patterns',
    sourceName: 'Refactoring.Guru',
    license: 'Free to read online',
    topics: ['design patterns', 'oop'],
    languages: ['java', 'python', 'typescript', 'go', 'cpp'],
    roles: ['Software Engineer', 'Backend Developer'],
    difficulty: 'intermediate',
    skills: ['design-patterns', 'oop', 'solid-principles'],
  },

  // ---------- Databases ----------
  {
    kind: 'exercise',
    title: 'SQLBolt',
    summary: 'Short interactive lessons with in-browser exercises that teach SELECT, filtering, joins, aggregates and data modification.',
    url: 'https://sqlbolt.com/',
    sourceName: 'SQLBolt',
    topics: ['sql', 'joins', 'practice'],
    languages: ['sql'],
    roles: ['Data Analyst', 'Backend Developer', 'Data Scientist'],
    difficulty: 'beginner',
    skills: ['sql-basics', 'sql-joins', 'sql-aggregation'],
  },
  {
    kind: 'docs',
    title: 'PostgreSQL Tutorial',
    summary: 'The tutorial section of the official PostgreSQL manual, introducing tables, queries, joins, aggregates, views, foreign keys and transactions.',
    url: 'https://www.postgresql.org/docs/current/tutorial.html',
    sourceName: 'PostgreSQL Global Development Group',
    topics: ['postgresql', 'sql', 'transactions'],
    languages: ['sql'],
    roles: ['Backend Developer', 'Data Analyst', 'Full Stack Developer'],
    difficulty: 'beginner',
    skills: ['sql-basics', 'sql-joins', 'transactions'],
  },
  {
    kind: 'docs',
    title: 'Use The Index, Luke',
    summary: 'A free guide to SQL indexing and performance for developers, explaining B-tree indexes, execution plans and how to write index-friendly queries.',
    url: 'https://use-the-index-luke.com/',
    sourceName: 'Markus Winand',
    license: 'Free to read online',
    topics: ['sql', 'indexes', 'performance'],
    languages: ['sql'],
    roles: ['Backend Developer', 'Data Analyst', 'Full Stack Developer'],
    difficulty: 'advanced',
    skills: ['indexing', 'sql-advanced'],
  },

  // ---------- System design ----------
  {
    kind: 'docs',
    title: 'The System Design Primer',
    summary: 'A widely used open guide to designing large systems: scalability, caching, load balancing, databases, queues and worked interview examples.',
    url: 'https://github.com/donnemartin/system-design-primer',
    sourceName: 'Donne Martin and contributors (GitHub)',
    license: 'CC BY 4.0',
    topics: ['system design', 'scalability', 'interviews'],
    languages: [],
    roles: ['Backend Developer', 'Software Engineer', 'Full Stack Developer'],
    difficulty: 'intermediate',
    skills: ['system-design-basics', 'caching', 'scalability'],
  },
  {
    kind: 'docs',
    title: 'Site Reliability Engineering (Google SRE book)',
    summary: "Google's book on running production systems, covering SLOs, error budgets, monitoring, on-call, incident response and postmortems.",
    url: 'https://sre.google/sre-book/table-of-contents/',
    sourceName: 'Google',
    license: 'Free to read online',
    topics: ['sre', 'reliability', 'monitoring'],
    languages: [],
    roles: ['DevOps Engineer', 'Backend Developer', 'Software Engineer'],
    difficulty: 'advanced',
    skills: ['observability', 'scalability'],
  },
  {
    kind: 'article',
    title: 'The Twelve-Factor App',
    summary: 'A short methodology for building deployable services: config in the environment, stateless processes, disposability and dev/prod parity.',
    url: 'https://12factor.net/',
    sourceName: 'Adam Wiggins (Heroku)',
    license: 'MIT',
    topics: ['architecture', 'deployment', 'config'],
    languages: [],
    roles: ['Backend Developer', 'DevOps Engineer', 'Full Stack Developer'],
    difficulty: 'intermediate',
    skills: ['cloud-basics', 'ci-cd', 'system-design-basics'],
  },
  {
    kind: 'article',
    title: 'AWS Well-Architected Framework',
    summary: 'AWS guidance on designing cloud workloads around operational excellence, security, reliability, performance, cost and sustainability.',
    url: 'https://aws.amazon.com/architecture/well-architected/',
    sourceName: 'Amazon Web Services',
    topics: ['cloud', 'architecture', 'aws'],
    languages: [],
    roles: ['DevOps Engineer', 'Backend Developer'],
    difficulty: 'advanced',
    skills: ['cloud-basics', 'scalability'],
  },

  // ---------- DevOps ----------
  {
    kind: 'docs',
    title: 'Pro Git',
    summary: 'The complete Pro Git book, free online, covering Git basics, branching, remote workflows, internals and collaboration on GitHub.',
    url: 'https://git-scm.com/book/en/v2',
    sourceName: 'Scott Chacon and Ben Straub (git-scm.com)',
    license: 'CC BY-NC-SA 3.0',
    topics: ['git', 'version control', 'branching'],
    languages: [],
    roles: ['Software Engineer', 'DevOps Engineer', 'Backend Developer', 'Frontend Developer'],
    difficulty: 'beginner',
    skills: ['git', 'open-source'],
  },
  {
    kind: 'course',
    title: 'Linux Journey',
    summary: 'Bite-sized lessons on the Linux command line, permissions, processes, packages, networking and the boot process.',
    url: 'https://linuxjourney.com/',
    sourceName: 'Linux Journey',
    topics: ['linux', 'shell', 'command line'],
    languages: [],
    roles: ['DevOps Engineer', 'Backend Developer'],
    difficulty: 'beginner',
    skills: ['command-line', 'operating-systems'],
  },
  {
    kind: 'docs',
    title: 'Docker Get Started',
    summary: 'The official Docker getting-started guides on images, containers, Dockerfiles, volumes, networking and Docker Compose.',
    url: 'https://docs.docker.com/get-started/',
    sourceName: 'Docker Docs',
    topics: ['docker', 'containers'],
    languages: [],
    roles: ['DevOps Engineer', 'Backend Developer', 'Full Stack Developer'],
    difficulty: 'beginner',
    skills: ['docker'],
  },
  {
    kind: 'course',
    title: 'Kubernetes Basics tutorial',
    summary: 'The official interactive introduction to Kubernetes: deploying an app, exploring pods, exposing services, scaling and rolling updates.',
    url: 'https://kubernetes.io/docs/tutorials/kubernetes-basics/',
    sourceName: 'Kubernetes (CNCF)',
    license: 'CC BY 4.0',
    topics: ['kubernetes', 'containers', 'orchestration'],
    languages: [],
    roles: ['DevOps Engineer', 'Backend Developer'],
    difficulty: 'intermediate',
    skills: ['docker', 'cloud-basics'],
  },
  {
    kind: 'docs',
    title: 'GitHub Actions documentation',
    summary: 'Official docs for GitHub Actions workflows: triggers, jobs, runners, caching, secrets and deploying from a CI pipeline.',
    url: 'https://docs.github.com/en/actions',
    sourceName: 'GitHub Docs',
    topics: ['ci/cd', 'automation', 'github actions'],
    languages: [],
    roles: ['DevOps Engineer', 'Backend Developer', 'Full Stack Developer'],
    difficulty: 'intermediate',
    skills: ['ci-cd', 'git'],
  },
  {
    kind: 'article',
    title: 'Continuous Integration by Martin Fowler',
    summary: 'A classic essay on the practices behind continuous integration: a single mainline, automated builds, self-testing code and fast feedback.',
    url: 'https://martinfowler.com/articles/continuousIntegration.html',
    sourceName: 'martinfowler.com',
    topics: ['ci/cd', 'practices'],
    languages: [],
    roles: ['DevOps Engineer', 'Software Engineer'],
    difficulty: 'intermediate',
    skills: ['ci-cd', 'unit-testing'],
  },

  // ---------- Security ----------
  {
    kind: 'docs',
    title: 'OWASP Top 10',
    summary: 'The OWASP awareness document listing the most critical web application security risks, such as broken access control and injection.',
    url: 'https://owasp.org/www-project-top-ten/',
    sourceName: 'OWASP Foundation',
    license: 'CC BY-SA 4.0',
    topics: ['security', 'owasp', 'vulnerabilities'],
    languages: [],
    roles: ['Backend Developer', 'Full Stack Developer', 'Software Engineer'],
    difficulty: 'intermediate',
    skills: ['web-security', 'auth-security-web'],
  },
  {
    kind: 'docs',
    title: 'OWASP Cheat Sheet Series',
    summary: 'Concise, practical security guidance on topics like authentication, session management, input validation, XSS and SQL injection prevention.',
    url: 'https://cheatsheetseries.owasp.org/',
    sourceName: 'OWASP Foundation',
    topics: ['security', 'authentication', 'xss'],
    languages: [],
    roles: ['Backend Developer', 'Full Stack Developer', 'Frontend Developer'],
    difficulty: 'intermediate',
    skills: ['web-security', 'auth-security-web'],
  },

  // ---------- Testing and quality ----------
  {
    kind: 'article',
    title: 'The Practical Test Pyramid',
    summary: 'A detailed article on balancing unit, integration, contract and end-to-end tests, with concrete examples of what to test at each level.',
    url: 'https://martinfowler.com/articles/practical-test-pyramid.html',
    sourceName: 'Ham Vocke on martinfowler.com',
    topics: ['testing', 'test pyramid'],
    languages: [],
    roles: ['Software Engineer', 'Backend Developer', 'Full Stack Developer'],
    difficulty: 'intermediate',
    skills: ['unit-testing', 'ci-cd'],
  },
  {
    kind: 'docs',
    title: 'pytest documentation',
    summary: 'Official docs for pytest, the popular Python testing framework: writing tests, fixtures, parametrization and plugins.',
    url: 'https://docs.pytest.org/',
    sourceName: 'pytest-dev',
    topics: ['testing', 'pytest'],
    languages: ['python'],
    roles: ['Backend Developer', 'Data Scientist', 'Software Engineer'],
    difficulty: 'beginner',
    skills: ['unit-testing', 'python'],
  },
  {
    kind: 'docs',
    title: 'Google Engineering Practices: Code Review',
    summary: "Google's published guidance for code reviewers and authors: what to look for, how fast to respond and how to write helpful comments.",
    url: 'https://google.github.io/eng-practices/review/',
    sourceName: 'Google',
    topics: ['code review', 'collaboration'],
    languages: [],
    roles: ['Software Engineer', 'Backend Developer', 'Frontend Developer'],
    difficulty: 'intermediate',
    skills: ['code-review', 'communication', 'teamwork'],
  },

  // ---------- Data and ML ----------
  {
    kind: 'docs',
    title: 'pandas Getting Started',
    summary: 'The official pandas introduction with short tutorials on reading data, selecting and filtering, creating columns, grouping and reshaping.',
    url: 'https://pandas.pydata.org/docs/getting_started/index.html',
    sourceName: 'pandas (NumFOCUS)',
    topics: ['pandas', 'dataframes', 'data cleaning'],
    languages: ['python'],
    roles: ['Data Analyst', 'Data Scientist', 'ML Engineer'],
    difficulty: 'beginner',
    skills: ['data-wrangling', 'python'],
  },
  {
    kind: 'docs',
    title: 'Python Data Science Handbook',
    summary: "Jake VanderPlas's free online book covering IPython, NumPy, pandas, Matplotlib and an introduction to machine learning with scikit-learn.",
    url: 'https://jakevdp.github.io/PythonDataScienceHandbook/',
    sourceName: 'Jake VanderPlas',
    topics: ['numpy', 'pandas', 'matplotlib'],
    languages: ['python'],
    roles: ['Data Analyst', 'Data Scientist'],
    difficulty: 'intermediate',
    skills: ['data-wrangling', 'data-visualization', 'ml-fundamentals'],
  },
  {
    kind: 'docs',
    title: 'scikit-learn User Guide',
    summary: 'The scikit-learn user guide explaining supervised and unsupervised models, preprocessing, pipelines, cross-validation and metrics.',
    url: 'https://scikit-learn.org/stable/user_guide.html',
    sourceName: 'scikit-learn developers',
    topics: ['machine learning', 'scikit-learn', 'evaluation'],
    languages: ['python'],
    roles: ['Data Scientist', 'ML Engineer'],
    difficulty: 'intermediate',
    skills: ['ml-fundamentals', 'model-evaluation'],
  },
  {
    kind: 'course',
    title: 'Google Machine Learning Crash Course',
    summary: 'A free, fast-paced introduction to machine learning concepts with videos, interactive visualizations and exercises.',
    url: 'https://developers.google.com/machine-learning/crash-course',
    sourceName: 'Google for Developers',
    topics: ['machine learning', 'regression', 'classification'],
    languages: ['python'],
    roles: ['ML Engineer', 'Data Scientist'],
    difficulty: 'beginner',
    skills: ['ml-fundamentals', 'model-evaluation'],
  },
  {
    kind: 'course',
    title: 'Practical Deep Learning for Coders (fast.ai)',
    summary: 'A free, code-first deep learning course that has you training real models early, then explains how they work underneath.',
    url: 'https://course.fast.ai/',
    sourceName: 'fast.ai',
    topics: ['deep learning', 'neural networks', 'pytorch'],
    languages: ['python'],
    roles: ['ML Engineer', 'Data Scientist'],
    difficulty: 'advanced',
    skills: ['deep-learning', 'ml-fundamentals'],
  },
  {
    kind: 'course',
    title: 'Kaggle Learn',
    summary: 'Short, free hands-on courses with in-browser notebooks on Python, pandas, SQL, data visualization and machine learning.',
    url: 'https://www.kaggle.com/learn',
    sourceName: 'Kaggle (Google)',
    topics: ['data science', 'notebooks', 'practice'],
    languages: ['python', 'sql'],
    roles: ['Data Analyst', 'Data Scientist', 'ML Engineer'],
    difficulty: 'beginner',
    skills: ['data-wrangling', 'data-visualization', 'ml-fundamentals'],
  },
  {
    kind: 'course',
    title: 'Hugging Face Learn',
    summary: 'Free courses from Hugging Face on transformers, large language models, agents and building applications with open models.',
    url: 'https://huggingface.co/learn',
    sourceName: 'Hugging Face',
    topics: ['llm', 'transformers', 'nlp'],
    languages: ['python'],
    roles: ['ML Engineer', 'Data Scientist'],
    difficulty: 'intermediate',
    skills: ['llm-applications', 'deep-learning'],
  },

  // ---------- Career ----------
  {
    kind: 'interview',
    title: 'Tech Interview Handbook',
    summary: 'A free, open guide to the software engineering interview process: coding interview study plans, algorithm cheat sheets, behavioral prep and negotiation.',
    url: 'https://www.techinterviewhandbook.org/',
    sourceName: 'Tech Interview Handbook (Yangshun Tay)',
    license: 'MIT',
    topics: ['interviews', 'coding interviews', 'career'],
    languages: [],
    roles: ['Software Engineer', 'Backend Developer', 'Frontend Developer', 'Full Stack Developer'],
    difficulty: 'intermediate',
    skills: ['technical-interviews', 'behavioral-interviews', 'job-search'],
  },
  {
    kind: 'article',
    title: 'Tech Interview Handbook: Resume guide',
    summary: 'Practical advice on writing a software engineering resume that passes screening, with guidance on structure, impact-focused bullets and common mistakes.',
    url: 'https://www.techinterviewhandbook.org/resume/',
    sourceName: 'Tech Interview Handbook (Yangshun Tay)',
    license: 'MIT',
    topics: ['resume', 'career'],
    languages: [],
    roles: ['Software Engineer', 'Backend Developer', 'Frontend Developer', 'Full Stack Developer', 'Data Analyst'],
    difficulty: 'beginner',
    skills: ['resume-writing', 'job-search'],
  },
  {
    kind: 'interview',
    title: 'Tech Interview Handbook: Behavioral interviews',
    summary: 'A guide to preparing for behavioral rounds, including common questions, how to structure answers and how companies evaluate them.',
    url: 'https://www.techinterviewhandbook.org/behavioral-interview/',
    sourceName: 'Tech Interview Handbook (Yangshun Tay)',
    license: 'MIT',
    topics: ['behavioral interviews', 'career'],
    languages: [],
    roles: ['Software Engineer', 'Backend Developer', 'Frontend Developer', 'Full Stack Developer'],
    difficulty: 'beginner',
    skills: ['behavioral-interviews', 'communication'],
  },
  {
    kind: 'link',
    title: 'roadmap.sh developer roadmaps',
    summary: 'Community-maintained visual roadmaps for roles such as frontend, backend, DevOps, data and AI, showing what to learn and in what order.',
    url: 'https://roadmap.sh/',
    sourceName: 'roadmap.sh',
    topics: ['roadmaps', 'career planning'],
    languages: [],
    roles: ['Frontend Developer', 'Backend Developer', 'DevOps Engineer', 'Full Stack Developer', 'Data Analyst', 'ML Engineer'],
    difficulty: 'beginner',
    skills: ['job-search'],
  },
  {
    kind: 'link',
    title: 'Python Package Index (PyPI)',
    summary: 'The official repository of third-party Python packages, where you find, evaluate and publish libraries installed with pip.',
    url: 'https://pypi.org/',
    sourceName: 'Python Software Foundation',
    topics: ['python', 'packages', 'pip'],
    languages: ['python'],
    roles: ['Backend Developer', 'Data Scientist', 'ML Engineer'],
    difficulty: 'beginner',
    skills: ['modules-packages', 'python'],
  },
  {
    kind: 'docs',
    title: 'MDN Regular expressions guide',
    summary: 'A guide to writing regular expressions in JavaScript, covering character classes, assertions, groups, quantifiers and flags.',
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions',
    sourceName: 'MDN Web Docs (Mozilla)',
    license: 'CC BY-SA 2.5',
    topics: ['regex', 'strings'],
    languages: ['javascript'],
    roles: ['Software Engineer', 'Frontend Developer', 'Backend Developer'],
    difficulty: 'intermediate',
    skills: ['strings', 'javascript'],
  },

  // ---------- Authored cheat sheets ----------
  {
    kind: 'cheatsheet',
    title: 'SQL joins and aggregation cheat sheet',
    summary: 'Join types, the LEFT JOIN filtering trap, anti-joins, GROUP BY versus HAVING, query evaluation order and window function basics on one page.',
    body: SQL_CHEATSHEET,
    sourceName: 'LearnSphere Nexus',
    license: AUTHORED_LICENSE,
    topics: ['sql', 'joins', 'aggregation', 'window functions'],
    languages: ['sql'],
    roles: ['Data Analyst', 'Backend Developer', 'Data Scientist', 'Full Stack Developer'],
    difficulty: 'beginner',
    skills: ['sql-joins', 'sql-aggregation', 'sql-advanced'],
    downloadable: true,
  },
  {
    kind: 'cheatsheet',
    title: 'Git everyday commands cheat sheet',
    summary: 'The Git commands you use daily for inspecting, committing, branching, syncing with remotes and undoing mistakes safely.',
    body: GIT_CHEATSHEET,
    sourceName: 'LearnSphere Nexus',
    license: AUTHORED_LICENSE,
    topics: ['git', 'version control', 'commands'],
    languages: [],
    roles: ['Software Engineer', 'Backend Developer', 'Frontend Developer', 'Full Stack Developer', 'DevOps Engineer'],
    difficulty: 'beginner',
    skills: ['git', 'command-line'],
    downloadable: true,
  },
  {
    kind: 'cheatsheet',
    title: 'Big-O complexity cheat sheet',
    summary: 'Growth rates, data structure operation costs, sorting and graph algorithm complexities, plus quick rules for analyzing your own code.',
    body: BIGO_CHEATSHEET,
    sourceName: 'LearnSphere Nexus',
    license: AUTHORED_LICENSE,
    topics: ['big-o', 'complexity', 'algorithms', 'interviews'],
    languages: [],
    roles: ['Software Engineer', 'Backend Developer'],
    difficulty: 'intermediate',
    skills: ['complexity', 'sorting', 'technical-interviews'],
    downloadable: true,
  },
  {
    kind: 'cheatsheet',
    title: 'HTTP status codes and methods cheat sheet',
    summary: 'HTTP methods with their safety and idempotency, the status codes APIs return most often and when to use each, and key headers.',
    body: HTTP_CHEATSHEET,
    sourceName: 'LearnSphere Nexus',
    license: AUTHORED_LICENSE,
    topics: ['http', 'status codes', 'rest', 'api'],
    languages: [],
    roles: ['Backend Developer', 'Frontend Developer', 'Full Stack Developer'],
    difficulty: 'beginner',
    skills: ['http-rest', 'api-design'],
    downloadable: true,
  },
  {
    kind: 'cheatsheet',
    title: 'Python collections cheat sheet',
    summary: 'Lists, tuples, dicts and sets with their costs, the collections module, heapq and bisect, and the gotchas that trip up new Python developers.',
    body: PYTHON_CHEATSHEET,
    sourceName: 'LearnSphere Nexus',
    license: AUTHORED_LICENSE,
    topics: ['python', 'collections', 'data structures'],
    languages: ['python'],
    roles: ['Backend Developer', 'Data Analyst', 'Data Scientist', 'ML Engineer', 'Software Engineer'],
    difficulty: 'beginner',
    skills: ['python', 'collections', 'hashing'],
    downloadable: true,
  },
  {
    kind: 'cheatsheet',
    title: 'STAR method for behavioral interviews',
    summary: 'How to structure behavioral answers with Situation, Task, Action and Result, a worked example, a story bank template and common mistakes.',
    body: STAR_CHEATSHEET,
    sourceName: 'LearnSphere Nexus',
    license: AUTHORED_LICENSE,
    topics: ['behavioral interviews', 'star', 'career'],
    languages: [],
    roles: ['Software Engineer', 'Backend Developer', 'Frontend Developer', 'Full Stack Developer', 'Data Analyst', 'Data Scientist', 'ML Engineer', 'DevOps Engineer'],
    difficulty: 'beginner',
    skills: ['behavioral-interviews', 'communication'],
    downloadable: true,
  },
  {
    kind: 'cheatsheet',
    title: 'Docker essentials cheat sheet',
    summary: 'Core Docker concepts, image and container commands, a multi-stage Dockerfile explained line by line, Docker Compose basics and cleanup.',
    body: DOCKER_CHEATSHEET,
    sourceName: 'LearnSphere Nexus',
    license: AUTHORED_LICENSE,
    topics: ['docker', 'containers', 'compose'],
    languages: [],
    roles: ['DevOps Engineer', 'Backend Developer', 'Full Stack Developer'],
    difficulty: 'intermediate',
    skills: ['docker', 'command-line'],
    downloadable: true,
  },
  {
    kind: 'cheatsheet',
    title: 'Regular expressions quick reference',
    summary: 'Character classes, anchors, quantifiers, groups, lookarounds and flags, with practical patterns and usage in JavaScript and Python.',
    body: REGEX_CHEATSHEET,
    sourceName: 'LearnSphere Nexus',
    license: AUTHORED_LICENSE,
    topics: ['regex', 'strings', 'text processing'],
    languages: ['javascript', 'python'],
    roles: ['Software Engineer', 'Backend Developer', 'Data Analyst'],
    difficulty: 'intermediate',
    skills: ['strings', 'python', 'javascript'],
    downloadable: true,
  },
];
