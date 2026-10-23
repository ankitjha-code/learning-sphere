import type { SeedTrack } from '../types';

export const sqlDatabaseDesign: SeedTrack = {
  slug: 'sql-database-design',
  title: 'SQL and Database Design',
  category: 'databases',
  summary: 'Query relational data confidently with PostgreSQL, then design schemas, indexes and transactions that hold up in production.',
  description: `**Who it's for:** developers, analysts and aspiring data engineers who need to read and write real SQL, and anyone preparing for SQL interview rounds.

**Prerequisites:** comfort with basic programming ideas (values, conditions). No prior SQL is needed. All examples use the PostgreSQL dialect, and every SQL problem runs on a real PostgreSQL engine in the browser.

**You will be able to:**
- write SELECT queries with filters, sorting, NULL handling, aggregation and joins
- compose larger queries with subqueries, CTEs and window functions (top-N per group, running totals)
- model a domain as tables with primary keys, foreign keys and the right relationships
- normalise a schema to remove update anomalies, and know when to denormalise
- read an EXPLAIN plan and choose indexes that actually get used
- use transactions and isolation levels to keep concurrent writes correct

**Milestones:** *Design a schema* (topic 7) and *Safe concurrent writes* (topic 10).`,
  level: 'beginner',
  estimatedHours: 24,
  roles: ['backend developer', 'data analyst', 'data engineer', 'full-stack developer', 'software engineer', 'data scientist'],
  contentStatus: 'complete',
  topics: [
    // ------------------------------------------------------------------ 1
    {
      slug: 'relational-model-and-select',
      title: 'The relational model and SELECT',
      module: 'Querying data',
      skill: 'sql-basics',
      minutes: 30,
      objectives: [
        'Describe tables, rows, columns, types and primary keys in the relational model',
        'Write SELECT queries that pick columns, compute expressions and rename them with aliases',
        'Explain the logical order in which the clauses of a query are evaluated',
        'Use DISTINCT to remove duplicate result rows',
      ],
      body: `A **relational database** stores data in **tables** (formally, *relations*). Each table has a fixed set of named, typed **columns**, and holds any number of **rows**. A **primary key** is a column (or set of columns) whose value uniquely identifies each row.

\`\`\`sql
CREATE TABLE employees (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  department_id INTEGER,
  salary        INTEGER NOT NULL,
  hire_date     DATE NOT NULL
);
\`\`\`

Rows in a table have **no inherent order**. Think of a table as a set of facts, not a spreadsheet.

### Anatomy of SELECT

\`\`\`sql
SELECT name, salary
FROM employees;
\`\`\`

\`SELECT\` lists the columns you want; \`FROM\` names the table. \`SELECT *\` returns every column, which is handy for exploring but fragile in application code (a new column changes your result).

You can compute expressions and name them with \`AS\`:

\`\`\`sql
SELECT name,
       salary / 12            AS monthly_salary,
       upper(name)            AS shout,
       hire_date + 90         AS probation_ends
FROM employees;
\`\`\`

Watch out: \`salary / 12\` on an \`INTEGER\` column is **integer division** in PostgreSQL (\`95000 / 12\` is \`7916\`). Use \`salary / 12.0\` or \`salary::numeric / 12\` for decimals.

### The result is a table too

Every query returns a table, which is why queries compose: a query's result can be filtered, joined or aggregated by another query. You will rely on this in the subqueries and CTE topic.

### Logical order of evaluation

You write clauses in this order: \`SELECT ... FROM ... WHERE ... GROUP BY ... HAVING ... ORDER BY ... LIMIT\`. The database logically evaluates them in a different order:

1. \`FROM\` (and joins): which rows exist
2. \`WHERE\`: keep matching rows
3. \`GROUP BY\`, then \`HAVING\`
4. \`SELECT\`: compute output columns (and window functions)
5. \`DISTINCT\`
6. \`ORDER BY\`, then \`LIMIT\` / \`OFFSET\`

This explains several rules: you cannot use a \`SELECT\` alias inside \`WHERE\` (it does not exist yet), but you *can* use it in \`ORDER BY\`.

### DISTINCT

\`SELECT DISTINCT department_id FROM employees;\` returns each department id once. \`DISTINCT\` applies to the **whole row** of selected columns, not to the first column only.

### Quoting

In PostgreSQL, **single quotes** make string literals (\`'Asha'\`) and **double quotes** make identifiers (\`"Order"\` for a column or table name). \`WHERE name = "Asha"\` looks for a *column* called Asha and fails.

### Common mistakes
- Relying on the order rows come back in without an \`ORDER BY\`. It can change between runs.
- Using double quotes for text values.
- Referencing a \`SELECT\` alias in \`WHERE\`.
- Expecting \`INTEGER / INTEGER\` to give a decimal.`,
      practice: [
        { title: 'Well-paid sales staff', kind: 'sql', ref: 'sql-sales-salary-filter' },
        { title: 'Students who took a CS course', kind: 'sql', ref: 'sql-distinct-cs-students' },
        { title: 'Try it: explore with expressions', kind: 'exercise', prompt: 'Using the employees schema, write a query that returns each name, the annual salary, and the salary per month rounded to 2 decimal places (hint: round(salary / 12.0, 2)).' },
      ],
      resources: [
        { title: 'PostgreSQL Tutorial: Querying a Table', url: 'https://www.postgresql.org/docs/current/tutorial-select.html', source: 'PostgreSQL Global Development Group', kind: 'docs' },
        { title: 'SQLBolt Lesson 1: SELECT queries', url: 'https://sqlbolt.com/lesson/select_queries_introduction', source: 'SQLBolt', kind: 'interactive' },
        { title: 'PostgreSQL: Queries overview', url: 'https://www.postgresql.org/docs/current/queries-overview.html', source: 'PostgreSQL Global Development Group', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Row order',
          prompt: 'A query has no `ORDER BY` clause. In what order are the rows returned?',
          options: [
            { id: 'a', text: 'In primary key order' },
            { id: 'b', text: 'In insertion order' },
            { id: 'c', text: 'Unspecified: the database may return them in any order' },
          ],
          correct: ['c'],
          explanation: 'Tables are unordered sets. Without ORDER BY the order depends on the plan the database chooses and can change between runs.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Quotes',
          prompt: 'In PostgreSQL, what does `WHERE name = "Asha"` do?',
          options: [
            { id: 'a', text: 'Compares name to the text Asha' },
            { id: 'b', text: 'Compares name to a column called Asha, and errors if no such column exists' },
            { id: 'c', text: 'Performs a case-insensitive comparison' },
          ],
          correct: ['b'],
          explanation: 'Double quotes delimit identifiers. String literals use single quotes: `WHERE name = \'Asha\'`.',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'Primary keys',
          prompt: 'Which statements about a primary key are true? Select all that apply.',
          options: [
            { id: 'a', text: 'Its value is unique for every row' },
            { id: 'b', text: 'It can never be NULL' },
            { id: 'c', text: 'It can be made of more than one column' },
            { id: 'd', text: 'It must be an integer' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'A primary key is UNIQUE and NOT NULL, and may be composite. It can be any comparable type, such as TEXT or UUID.',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Evaluation order',
          prompt: 'Logically, the first clause of a SELECT query that the database evaluates is ____.',
          accepted: [['FROM']],
          explanation: 'FROM (including joins) is evaluated first to determine the input rows; SELECT is evaluated much later, after WHERE, GROUP BY and HAVING.',
        },
      ],
    },

    // ------------------------------------------------------------------ 2
    {
      slug: 'filtering-sorting-null',
      title: 'Filtering, sorting and NULL',
      module: 'Querying data',
      skill: 'sql-basics',
      minutes: 40,
      objectives: [
        'Filter rows with comparison operators, AND/OR, IN, BETWEEN and LIKE',
        'Sort results by several columns and limit them with LIMIT and OFFSET',
        'Explain three-valued logic and test for NULL correctly',
        'Replace NULLs with COALESCE and filter timestamps with half-open ranges',
      ],
      body: `### WHERE

\`WHERE\` keeps only the rows for which a condition is **true**.

\`\`\`sql
SELECT name, salary
FROM employees
WHERE department_id IN (1, 3)
  AND salary BETWEEN 80000 AND 120000   -- inclusive on both ends
  AND name LIKE 'A%';                   -- starts with A (ILIKE ignores case)
\`\`\`

\`AND\` binds tighter than \`OR\`. This query does **not** mean what it looks like:

\`\`\`sql
WHERE department_id = 2 OR department_id = 3 AND salary > 80000
-- parsed as: department_id = 2 OR (department_id = 3 AND salary > 80000)
\`\`\`

Add parentheses whenever you mix the two.

### ORDER BY and LIMIT

\`\`\`sql
SELECT name, salary
FROM employees
ORDER BY salary DESC, name ASC   -- name only breaks ties in salary
LIMIT 5 OFFSET 10;               -- rows 11-15
\`\`\`

Without a tie-breaker, rows with equal salaries can come back in any order, so "top 5" may differ between runs. In PostgreSQL, NULLs sort as if larger than every value: **last** in ascending order and **first** in descending order. Override with \`NULLS FIRST\` / \`NULLS LAST\`.

### NULL means "unknown"

NULL is not zero and not an empty string; it is a missing or unknown value. Any comparison with NULL yields **NULL** (unknown), not true or false, and \`WHERE\` drops rows whose condition is unknown.

| Expression | Result |
|---|---|
| \`NULL = NULL\` | NULL |
| \`NULL <> 5\` | NULL |
| \`NULL IS NULL\` | true |
| \`TRUE OR NULL\` | true |
| \`FALSE AND NULL\` | false |

So \`WHERE manager_id = NULL\` returns **no rows**. Write \`WHERE manager_id IS NULL\` (or \`IS NOT NULL\`). \`IS DISTINCT FROM\` is a NULL-safe "not equal".

**The NOT IN trap:** \`WHERE id NOT IN (SELECT manager_id FROM employees)\` returns nothing if any \`manager_id\` is NULL, because \`id <> NULL\` is unknown. Prefer \`NOT EXISTS\`.

### COALESCE

\`COALESCE(a, b, c)\` returns the first non-NULL argument:

\`\`\`sql
SELECT name, COALESCE(email, phone, 'no contact') AS contact
FROM students;
\`\`\`

\`NULLIF(a, b)\` does the reverse: it returns NULL when \`a = b\`, which is useful to avoid division by zero: \`total / NULLIF(count, 0)\`.

### Filtering dates and timestamps

For a \`TIMESTAMP\` column, \`BETWEEN '2024-03-01' AND '2024-03-31'\` stops at **midnight** on 31 March and misses the rest of that day. Use a half-open range:

\`\`\`sql
WHERE ordered_at >= '2024-03-01'
  AND ordered_at <  '2024-04-01'
\`\`\`

This is correct at any precision and can use an index. Avoid \`WHERE date_trunc('month', ordered_at) = ...\` on large tables: wrapping the column in a function usually prevents a plain index from being used.

### Common mistakes
- \`= NULL\` instead of \`IS NULL\`.
- Mixing AND and OR without parentheses.
- \`BETWEEN\` with timestamps at the end of a range.
- \`NOT IN\` against a list or subquery that can contain NULL.`,
      practice: [
        { title: 'Four highest salaries', kind: 'sql', ref: 'sql-top-four-salaries' },
        { title: 'Orders placed in March 2024', kind: 'sql', ref: 'sql-orders-in-march' },
        { title: 'Best contact for each student', kind: 'sql', ref: 'sql-student-contact-coalesce' },
      ],
      resources: [
        { title: 'SQLBolt Lesson 8: A short note on NULLs', url: 'https://sqlbolt.com/lesson/select_queries_with_nulls', source: 'SQLBolt', kind: 'interactive' },
        { title: 'PostgreSQL: Comparison Functions and Operators', url: 'https://www.postgresql.org/docs/current/functions-comparison.html', source: 'PostgreSQL Global Development Group', kind: 'docs' },
        { title: 'PostgreSQL: Conditional Expressions (COALESCE, NULLIF, CASE)', url: 'https://www.postgresql.org/docs/current/functions-conditional.html', source: 'PostgreSQL Global Development Group', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Comparing with NULL',
          prompt: 'The employees table has one row with `manager_id` NULL. How many rows does `SELECT * FROM employees WHERE manager_id = NULL` return?',
          options: [
            { id: 'a', text: '1' },
            { id: 'b', text: '0' },
            { id: 'c', text: 'All rows' },
          ],
          correct: ['b'],
          explanation: '`manager_id = NULL` is always unknown, and WHERE only keeps rows where the condition is true. Use `IS NULL`.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'AND / OR precedence',
          prompt: 'Which rows does `WHERE dept = 2 OR dept = 3 AND salary > 80000` return?',
          options: [
            { id: 'a', text: 'Rows in dept 2 or 3 that earn more than 80000' },
            { id: 'b', text: 'Every row in dept 2, plus rows in dept 3 that earn more than 80000' },
            { id: 'c', text: 'It is a syntax error' },
          ],
          correct: ['b'],
          explanation: 'AND binds tighter than OR, so it is `dept = 2 OR (dept = 3 AND salary > 80000)`. Use parentheses to get option a.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'NULL sort order',
          prompt: 'In PostgreSQL, `ORDER BY bonus DESC` places rows with a NULL bonus first unless you add `NULLS LAST`.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'PostgreSQL treats NULL as larger than any value, so NULLs come last in ascending and first in descending order by default.',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'NOT IN with NULL',
          prompt: 'The subquery `SELECT manager_id FROM employees` returns `1, 2, NULL`. What does `SELECT name FROM employees WHERE id NOT IN (SELECT manager_id FROM employees)` return?',
          options: [
            { id: 'a', text: 'Employees whose id is not 1 or 2' },
            { id: 'b', text: 'No rows at all' },
            { id: 'c', text: 'An error' },
          ],
          correct: ['b'],
          explanation: '`id NOT IN (1, 2, NULL)` expands to `id <> 1 AND id <> 2 AND id <> NULL`; the last part is unknown, so the whole condition is never true. Use NOT EXISTS instead.',
          difficulty: 'hard',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'First non-NULL',
          prompt: 'The function that returns its first non-NULL argument is ____.',
          accepted: [['COALESCE']],
          explanation: '`COALESCE(a, b, c)` evaluates left to right and returns the first argument that is not NULL.',
        },
      ],
    },

    // ------------------------------------------------------------------ 3
    {
      slug: 'aggregation-group-by-having',
      title: 'Aggregation, GROUP BY and HAVING',
      module: 'Querying data',
      skill: 'sql-aggregation',
      minutes: 40,
      objectives: [
        'Use COUNT, SUM, AVG, MIN and MAX and explain how they treat NULL',
        'Group rows with GROUP BY and follow the rule for selected columns',
        'Choose correctly between WHERE and HAVING',
        'Compute conditional aggregates with FILTER',
      ],
      body: `**Aggregate functions** collapse many rows into one value.

| Function | Meaning | NULLs |
|---|---|---|
| \`COUNT(*)\` | number of rows | counts every row |
| \`COUNT(col)\` | number of non-NULL values | ignored |
| \`COUNT(DISTINCT col)\` | number of distinct non-NULL values | ignored |
| \`SUM\`, \`AVG\`, \`MIN\`, \`MAX\` | as named | ignored |

So \`AVG(grade)\` is the average of graded rows only, and \`SUM\` over zero rows returns **NULL**, not 0 (wrap it in \`COALESCE(SUM(x), 0)\` when needed). \`AVG\` of an integer column returns \`numeric\`; use \`round(AVG(x), 2)\` for display.

### GROUP BY

\`GROUP BY\` splits rows into groups that share the same values, and aggregates are computed **per group**:

\`\`\`sql
SELECT department_id,
       COUNT(*)            AS headcount,
       round(AVG(salary))  AS avg_salary,
       MAX(hire_date)      AS latest_hire
FROM employees
GROUP BY department_id;
\`\`\`

All NULL \`department_id\` values form a single group.

**The rule:** every column in \`SELECT\` must either be inside an aggregate or appear in \`GROUP BY\`. \`SELECT department_id, name, COUNT(*) ... GROUP BY department_id\` is an error, because a group has many names. (PostgreSQL relaxes this only when you group by a table's primary key, because every other column of that table is then determined.)

### WHERE vs HAVING

- \`WHERE\` filters **rows before** grouping. It cannot reference aggregates.
- \`HAVING\` filters **groups after** aggregation.

\`\`\`sql
-- Customers whose delivered orders total more than 150
SELECT customer_id, SUM(amount) AS total_spent
FROM orders
WHERE status = 'delivered'          -- row filter
GROUP BY customer_id
HAVING SUM(amount) > 150;           -- group filter
\`\`\`

Putting the status test in \`HAVING\` would not even be valid unless \`status\` were grouped. Putting \`SUM(amount) > 150\` in \`WHERE\` is an error.

### Conditional aggregates with FILTER

PostgreSQL lets you aggregate a subset of each group without extra queries:

\`\`\`sql
SELECT customer_id,
       COUNT(*)                                        AS all_orders,
       COUNT(*) FILTER (WHERE status = 'cancelled')    AS cancelled,
       SUM(amount) FILTER (WHERE status = 'delivered') AS delivered_total
FROM orders
GROUP BY customer_id;
\`\`\`

The portable equivalent is \`SUM(CASE WHEN status = 'delivered' THEN amount END)\`.

### Worked example: average grade per course

\`\`\`sql
SELECT course_id,
       COUNT(*)            AS enrolled,
       COUNT(grade)        AS graded,
       round(AVG(grade), 1) AS avg_grade
FROM enrollments
GROUP BY course_id
HAVING COUNT(grade) >= 2
ORDER BY avg_grade DESC;
\`\`\`

\`enrolled\` and \`graded\` differ whenever some grades are NULL, and \`AVG\` ignores the ungraded rows.

### Common mistakes
- Selecting a non-aggregated column that is not in \`GROUP BY\`.
- Filtering on an aggregate in \`WHERE\`.
- Using \`COUNT(*)\` when you meant "count of non-NULL values".
- Forgetting that \`SUM\` of no rows is NULL.`,
      practice: [
        { title: 'Headcount per department', kind: 'sql', ref: 'sql-department-headcount' },
        { title: 'Big spenders', kind: 'sql', ref: 'sql-big-spenders-having' },
      ],
      resources: [
        { title: 'PostgreSQL Tutorial: Aggregate Functions', url: 'https://www.postgresql.org/docs/current/tutorial-agg.html', source: 'PostgreSQL Global Development Group', kind: 'docs' },
        { title: 'SQLBolt Lesson 10: Queries with aggregates', url: 'https://sqlbolt.com/lesson/select_queries_with_aggregates', source: 'SQLBolt', kind: 'interactive' },
        { title: 'PostgreSQL: Aggregate Functions reference', url: 'https://www.postgresql.org/docs/current/functions-aggregate.html', source: 'PostgreSQL Global Development Group', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'COUNT and NULL',
          prompt: 'A table has 5 rows; 2 of them have `grade` NULL. What do `COUNT(*)` and `COUNT(grade)` return?',
          options: [
            { id: 'a', text: '5 and 5' },
            { id: 'b', text: '5 and 3' },
            { id: 'c', text: '3 and 3' },
          ],
          correct: ['b'],
          explanation: 'COUNT(*) counts rows; COUNT(column) counts non-NULL values in that column.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'WHERE or HAVING',
          prompt: 'You want departments whose total salary exceeds 300000. Where does `SUM(salary) > 300000` go?',
          options: [
            { id: 'a', text: 'WHERE' },
            { id: 'b', text: 'HAVING' },
            { id: 'c', text: 'Either works' },
          ],
          correct: ['b'],
          explanation: 'WHERE runs before grouping and cannot see aggregates. HAVING filters groups after the aggregates are computed.',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'Valid grouping',
          prompt: 'Assume `employees.id` is the primary key. Which queries are valid in PostgreSQL? Select all that apply.',
          options: [
            { id: 'a', text: '`SELECT department_id, COUNT(*) FROM employees GROUP BY department_id`' },
            { id: 'b', text: '`SELECT department_id, name FROM employees GROUP BY department_id`' },
            { id: 'c', text: '`SELECT department_id, MAX(salary) FROM employees GROUP BY department_id HAVING COUNT(*) > 1`' },
            { id: 'd', text: '`SELECT id, name, COUNT(*) FROM employees GROUP BY id`' },
          ],
          correct: ['a', 'c', 'd'],
          explanation: 'b selects `name`, which is neither grouped nor aggregated. d is allowed because grouping by the primary key determines every other column of the table.',
          difficulty: 'hard',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'Aggregate meanings',
          prompt: 'Match each expression to what it returns.',
          pairs: {
            left: [
              { id: 'l1', text: '`COUNT(*)`' },
              { id: 'l2', text: '`COUNT(DISTINCT city)`' },
              { id: 'l3', text: '`SUM(amount)` over zero rows' },
              { id: 'l4', text: '`AVG(grade)` with some NULL grades' },
            ],
            right: [
              { id: 'r1', text: 'Number of rows' },
              { id: 'r2', text: 'Number of different non-NULL cities' },
              { id: 'r3', text: 'NULL' },
              { id: 'r4', text: 'Average of the non-NULL grades only' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'Aggregates other than COUNT(*) skip NULLs, and SUM/AVG/MIN/MAX of an empty set are NULL.',
        },
      ],
    },

    // ------------------------------------------------------------------ 4
    {
      slug: 'sql-joins',
      title: 'Joins: inner, left and self',
      module: 'Combining tables',
      skill: 'sql-joins',
      minutes: 45,
      objectives: [
        'Combine tables with INNER JOIN using a correct join condition',
        'Keep unmatched rows with LEFT JOIN and find missing rows with an anti-join',
        'Explain why a filter in WHERE can turn a LEFT JOIN into an inner join',
        'Join a table to itself with aliases',
        'Recognise row multiplication (fan-out) in one-to-many joins',
      ],
      body: `Data is split across tables so each fact is stored once. **Joins** put it back together.

### INNER JOIN

Returns one output row for every pair of rows that satisfy the \`ON\` condition. Rows with no partner disappear.

\`\`\`sql
SELECT o.id AS order_id, c.name AS customer_name, o.amount
FROM orders o
JOIN customers c ON c.id = o.customer_id;   -- JOIN means INNER JOIN
\`\`\`

Aliases (\`o\`, \`c\`) shorten the query and are required when a column name exists in both tables.

### LEFT JOIN

Keeps **every row from the left table**. When there is no match, the right side's columns are NULL.

\`\`\`text
customers            orders                 customers LEFT JOIN orders
id | name            id  | customer_id      name   | order id
 1 | Aarav           101 | 1                Aarav  | 101
 2 | Bella           102 | 1                Aarav  | 102
 3 | Carlos          103 | 2                Bella  | 103
                                            Carlos | NULL
\`\`\`

To count orders per customer including zero, count a column from the right table: \`COUNT(o.id)\` ignores the NULL padding, while \`COUNT(*)\` would report 1 for Carlos.

**Anti-join** (rows with no match):

\`\`\`sql
SELECT c.id, c.name
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.id IS NULL;
-- equivalent: WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)
\`\`\`

### ON vs WHERE in outer joins

\`\`\`sql
-- Keeps all customers, attaching only their delivered orders
SELECT c.name, o.id
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'delivered';

-- Silently becomes an inner join: NULL status fails the WHERE test
SELECT c.name, o.id
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.status = 'delivered';
\`\`\`

Conditions on the right table of a LEFT JOIN usually belong in \`ON\`.

### Self join

A table can be joined to itself. Each employee row has a \`manager_id\` pointing at another employee:

\`\`\`sql
SELECT e.name AS employee, m.name AS manager
FROM employees e
LEFT JOIN employees m ON m.id = e.manager_id;
\`\`\`

\`LEFT\` keeps the person at the top, who has no manager.

### Fan-out

Joining one customer to many orders produces one row **per order**. Join orders to order items as well and each order is repeated per item, so \`SUM(o.amount)\` would double count. Aggregate before joining, or count with \`COUNT(DISTINCT o.id)\`.

\`RIGHT JOIN\` mirrors LEFT JOIN, \`FULL JOIN\` keeps unmatched rows from both sides, and \`CROSS JOIN\` pairs every row with every row.

### Common mistakes
- Forgetting the join condition, or joining on the wrong columns (for example \`c.id = o.id\`).
- Filtering the right table of a LEFT JOIN in \`WHERE\`.
- Summing a column after a join that multiplied its rows.
- Using \`COUNT(*)\` after a LEFT JOIN when you need zero for missing matches.`,
      practice: [
        { title: 'Orders with customer names', kind: 'sql', ref: 'sql-orders-with-customer-names' },
        { title: 'Order count for every customer', kind: 'sql', ref: 'sql-order-count-including-zero' },
        { title: 'Employees and their managers', kind: 'sql', ref: 'sql-employee-manager-names' },
        { title: 'Students who took a CS course', kind: 'sql', ref: 'sql-distinct-cs-students' },
      ],
      resources: [
        { title: 'PostgreSQL Tutorial: Joins Between Tables', url: 'https://www.postgresql.org/docs/current/tutorial-join.html', source: 'PostgreSQL Global Development Group', kind: 'docs' },
        { title: 'SQLBolt Lesson 6: Multi-table queries with JOINs', url: 'https://sqlbolt.com/lesson/select_queries_with_joins', source: 'SQLBolt', kind: 'interactive' },
        { title: 'SQLBolt Lesson 7: OUTER JOINs', url: 'https://sqlbolt.com/lesson/select_queries_with_outer_joins', source: 'SQLBolt', kind: 'interactive' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Filter after LEFT JOIN',
          prompt: '`customers LEFT JOIN orders ON o.customer_id = c.id WHERE o.status = \'delivered\'`: what happens to customers with no orders?',
          options: [
            { id: 'a', text: 'They appear with NULL order columns' },
            { id: 'b', text: 'They are removed, because NULL status fails the WHERE condition' },
            { id: 'c', text: 'The query errors' },
          ],
          correct: ['b'],
          explanation: 'The WHERE clause runs after the join and rejects rows where o.status is NULL. Move the condition into ON to keep them.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Join row count',
          prompt: 'Customer A has 3 orders, customer B has 2 and customer C has none. How many rows does `customers JOIN orders ON orders.customer_id = customers.id` return?',
          options: [
            { id: 'a', text: '3' },
            { id: 'b', text: '5' },
            { id: 'c', text: '6' },
          ],
          correct: ['b'],
          explanation: 'An inner join returns one row per matching pair: 3 + 2 = 5. C has no match and disappears.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Anti-join',
          prompt: 'Which query lists customers who have never placed an order?',
          options: [
            { id: 'a', text: '`SELECT c.name FROM customers c JOIN orders o ON o.customer_id = c.id WHERE o.id IS NULL`' },
            { id: 'b', text: '`SELECT c.name FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.id IS NULL`' },
            { id: 'c', text: '`SELECT c.name FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.id IS NOT NULL`' },
          ],
          correct: ['b'],
          explanation: 'Only a LEFT JOIN produces NULL-padded rows for unmatched customers, and `o.id IS NULL` keeps exactly those.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Self join aliases',
          prompt: 'When joining a table to itself, you must give at least one copy an alias so the two roles can be told apart.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Without aliases, `employees.name` would be ambiguous. Aliases like `e` and `m` name the employee and manager roles.',
        },
      ],
    },

    // ------------------------------------------------------------------ 5
    {
      slug: 'subqueries-and-ctes',
      title: 'Subqueries and CTEs',
      module: 'Advanced queries',
      skill: 'sql-advanced',
      minutes: 45,
      objectives: [
        'Use scalar, IN/EXISTS and derived-table subqueries',
        'Write correlated subqueries and explain how they are evaluated',
        'Break a complex query into named steps with WITH (CTEs)',
        'Walk a hierarchy with a recursive CTE',
      ],
      body: `Because every query returns a table, you can use a query inside another query.

### Scalar subqueries

A subquery that returns **exactly one row and one column** can be used like a value:

\`\`\`sql
SELECT name, salary
FROM employees
WHERE salary > (SELECT AVG(salary) FROM employees);
\`\`\`

If a scalar subquery returns more than one row, PostgreSQL raises an error; if it returns none, the value is NULL.

### IN and EXISTS

\`\`\`sql
-- customers who placed at least one order over 100
SELECT name FROM customers
WHERE id IN (SELECT customer_id FROM orders WHERE amount > 100);

SELECT name FROM customers c
WHERE EXISTS (
  SELECT 1 FROM orders o
  WHERE o.customer_id = c.id AND o.amount > 100
);
\`\`\`

\`EXISTS\` only asks "is there at least one row?", so what you select inside does not matter. For the negative case prefer \`NOT EXISTS\` over \`NOT IN\`, which breaks when the subquery yields a NULL.

### Correlated subqueries

A **correlated** subquery refers to the outer row, so it is logically evaluated once per outer row:

\`\`\`sql
-- employees earning more than their own department's average
SELECT e.name, e.department_id, e.salary
FROM employees e
WHERE e.salary > (
  SELECT AVG(e2.salary)
  FROM employees e2
  WHERE e2.department_id = e.department_id
);
\`\`\`

### Derived tables

A subquery in \`FROM\` must have an alias:

\`\`\`sql
SELECT d.department_id, d.avg_salary
FROM (
  SELECT department_id, AVG(salary) AS avg_salary
  FROM employees
  GROUP BY department_id
) AS d
WHERE d.avg_salary > 80000;
\`\`\`

### Common table expressions (WITH)

A **CTE** names a subquery so you can read the query top to bottom and reuse the result:

\`\`\`sql
WITH category_revenue AS (
  SELECT p.category, SUM(p.price * oi.quantity) AS revenue
  FROM order_items oi
  JOIN products p ON p.id = oi.product_id
  GROUP BY p.category
)
SELECT category, revenue
FROM category_revenue
WHERE revenue > (SELECT AVG(revenue) FROM category_revenue);
\`\`\`

You can chain several CTEs separated by commas; each may use the ones before it. Since PostgreSQL 12, a simple CTE referenced once is usually inlined into the main query, so CTEs are a readability tool rather than a performance penalty. \`AS MATERIALIZED\` forces it to be computed once.

### Recursive CTEs

\`WITH RECURSIVE\` has an **anchor** part and a **recursive** part joined by \`UNION ALL\`. It repeats the recursive part until it produces no new rows:

\`\`\`sql
WITH RECURSIVE chain AS (
  SELECT id, name, manager_id, 1 AS depth
  FROM employees WHERE manager_id IS NULL          -- anchor: the top
  UNION ALL
  SELECT e.id, e.name, e.manager_id, c.depth + 1
  FROM employees e
  JOIN chain c ON e.manager_id = c.id              -- recursive step
)
SELECT name, depth FROM chain ORDER BY depth, name;
\`\`\`

### Common mistakes
- A "scalar" subquery that can return several rows.
- Trying \`AVG(SUM(x))\` in one SELECT instead of aggregating in two steps.
- Forgetting the alias on a derived table.
- A recursive CTE with no terminating condition on cyclic data.`,
      practice: [
        { title: 'Above their department average', kind: 'sql', ref: 'sql-above-department-average' },
        { title: 'Categories above average revenue', kind: 'sql', ref: 'sql-top-categories-cte' },
        { title: 'Try it: rewrite with EXISTS', kind: 'exercise', prompt: 'Rewrite the "Students who took a CS course" solution using WHERE EXISTS instead of DISTINCT and a join. Confirm both return the same rows.' },
      ],
      resources: [
        { title: 'PostgreSQL: WITH Queries (Common Table Expressions)', url: 'https://www.postgresql.org/docs/current/queries-with.html', source: 'PostgreSQL Global Development Group', kind: 'docs' },
        { title: 'PostgreSQL: Subquery Expressions (EXISTS, IN, ANY, ALL)', url: 'https://www.postgresql.org/docs/current/functions-subquery.html', source: 'PostgreSQL Global Development Group', kind: 'docs' },
        { title: 'PostgreSQL: Table Expressions (derived tables, LATERAL)', url: 'https://www.postgresql.org/docs/current/queries-table-expressions.html', source: 'PostgreSQL Global Development Group', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Scalar subquery rows',
          prompt: 'What happens when a subquery used as `WHERE salary > (SELECT ...)` returns two rows?',
          options: [
            { id: 'a', text: 'PostgreSQL compares against the first row' },
            { id: 'b', text: 'PostgreSQL raises an error' },
            { id: 'c', text: 'The condition becomes NULL' },
          ],
          correct: ['b'],
          explanation: 'A scalar subquery must return at most one row. Use IN, ANY or an aggregate if several rows are possible.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Correlated subquery',
          prompt: 'What makes a subquery "correlated"?',
          options: [
            { id: 'a', text: 'It uses an aggregate function' },
            { id: 'b', text: 'It references a column from the outer query' },
            { id: 'c', text: 'It appears in the FROM clause' },
          ],
          correct: ['b'],
          explanation: 'A correlated subquery depends on the current outer row, so it is logically re-evaluated for each one.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Reusing a CTE',
          prompt: 'A CTE defined in a WITH clause can be referenced more than once in the main query.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'That is one of the main benefits: compute category_revenue once, then use it both as the source and inside the AVG subquery.',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Recursive CTE',
          prompt: 'In a recursive CTE, the anchor and the recursive part are combined with `UNION ____` (one word).',
          accepted: [['ALL']],
          explanation: 'UNION ALL appends the rows of each iteration. Plain UNION also works but removes duplicates, which costs extra and can hide bugs.',
        },
      ],
    },

    // ------------------------------------------------------------------ 6
    {
      slug: 'window-functions',
      title: 'Window functions',
      module: 'Advanced queries',
      skill: 'sql-advanced',
      minutes: 50,
      objectives: [
        'Explain how a window function differs from GROUP BY',
        'Rank rows within groups with ROW_NUMBER, RANK and DENSE_RANK and handle ties',
        'Compute running totals and moving averages with window frames',
        'Compare a row with its neighbours using LAG and LEAD',
        'Filter on a window function result using a CTE or subquery',
      ],
      body: `A **window function** computes a value from a set of related rows (the *window*) **without collapsing them**. GROUP BY returns one row per group; a window function returns every row, with an extra column.

\`\`\`sql
SELECT name, department_id, salary,
       AVG(salary) OVER (PARTITION BY department_id) AS dept_avg
FROM employees;
\`\`\`

- \`OVER (...)\` turns a function into a window function.
- \`PARTITION BY\` splits rows into independent windows (like groups).
- \`ORDER BY\` inside \`OVER\` orders rows within each partition.

### Ranking and ties

For salaries 150, 120, 120, 90 in one department:

| salary | ROW_NUMBER() | RANK() | DENSE_RANK() |
|---|---|---|---|
| 150 | 1 | 1 | 1 |
| 120 | 2 | 2 | 2 |
| 120 | 3 | 2 | 2 |
| 90 | 4 | 4 | 3 |

\`ROW_NUMBER\` always gives distinct numbers (ties broken arbitrarily unless you add columns to the ORDER BY). \`RANK\` shares ranks and leaves gaps; \`DENSE_RANK\` shares ranks without gaps. Pick the one the question describes.

### Top-N per group

Window functions are computed after \`WHERE\`, so you cannot write \`WHERE RANK() OVER (...) <= 2\`. Compute first, filter outside:

\`\`\`sql
WITH ranked AS (
  SELECT department_id, name, salary,
         RANK() OVER (PARTITION BY department_id ORDER BY salary DESC) AS rnk
  FROM employees
)
SELECT department_id, name, salary
FROM ranked
WHERE rnk <= 2;
\`\`\`

### Running totals and frames

With \`ORDER BY\` in the window, aggregates become cumulative:

\`\`\`sql
SELECT day, revenue,
       SUM(revenue) OVER (ORDER BY day) AS running_total,
       round(AVG(revenue) OVER (ORDER BY day
             ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 2) AS moving_avg_3
FROM daily_revenue;
\`\`\`

The default frame with an ORDER BY is \`RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW\`. \`RANGE\` includes **peers** (rows with the same ORDER BY value), so if two rows share a day they get the same running total. Use \`ROWS\` for a strictly row-by-row frame, or aggregate to one row per day first.

### LAG and LEAD

\`\`\`sql
SELECT day, revenue,
       revenue - LAG(revenue) OVER (ORDER BY day) AS change_vs_prev
FROM daily_revenue;
\`\`\`

\`LAG(x)\` reads the previous row's value (NULL for the first row); \`LEAD(x)\` reads the next. Both accept an offset and a default: \`LAG(x, 1, 0)\`.

### Window functions with GROUP BY

You can window over aggregates in the same query, because windows run after grouping: \`SUM(SUM(amount)) OVER (ORDER BY day)\` is a running total of daily sums.

### Common mistakes
- Filtering on a window result in \`WHERE\` of the same query.
- Using ROW_NUMBER when ties should be kept.
- Forgetting \`PARTITION BY\`, which ranks across the whole table.
- Surprise results from the default \`RANGE\` frame when ORDER BY values repeat.`,
      practice: [
        { title: 'Top two earners per department (with ties)', kind: 'sql', ref: 'sql-top-two-per-department' },
        { title: 'Daily revenue with a running total', kind: 'sql', ref: 'sql-daily-revenue-running-total' },
        { title: 'Try it: change versus previous day', kind: 'exercise', prompt: 'Extend the running-total solution with a column showing how much revenue rose or fell compared with the previous day, using LAG.' },
      ],
      resources: [
        { title: 'PostgreSQL Tutorial: Window Functions', url: 'https://www.postgresql.org/docs/current/tutorial-window.html', source: 'PostgreSQL Global Development Group', kind: 'docs' },
        { title: 'PostgreSQL: Window Functions reference', url: 'https://www.postgresql.org/docs/current/functions-window.html', source: 'PostgreSQL Global Development Group', kind: 'docs' },
        { title: 'PostgreSQL: Window function calls (frame syntax)', url: 'https://www.postgresql.org/docs/current/sql-expressions.html#SYNTAX-WINDOW-FUNCTIONS', source: 'PostgreSQL Global Development Group', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'DENSE_RANK',
          prompt: 'Salaries in one partition are 100, 90, 90, 80 (ordered descending). What does `DENSE_RANK()` give the row with 80?',
          options: [
            { id: 'a', text: '3' },
            { id: 'b', text: '4' },
            { id: 'c', text: '2' },
          ],
          correct: ['a'],
          explanation: 'DENSE_RANK gives 1, 2, 2, 3. RANK would give 4 for that row, and ROW_NUMBER would also give 4.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Filtering on rank',
          prompt: 'Why does `SELECT ... FROM employees WHERE RANK() OVER (ORDER BY salary DESC) <= 3` fail?',
          options: [
            { id: 'a', text: 'RANK needs a PARTITION BY' },
            { id: 'b', text: 'Window functions are evaluated after WHERE, so they cannot be used in it' },
            { id: 'c', text: 'RANK can only be used with GROUP BY' },
          ],
          correct: ['b'],
          explanation: 'Window functions are computed in the SELECT phase. Compute the rank in a CTE or subquery and filter in the outer query.',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'Window facts',
          prompt: 'Which statements are true? Select all that apply.',
          options: [
            { id: 'a', text: 'A window function keeps one output row per input row' },
            { id: 'b', text: '`SUM(x) OVER (ORDER BY d)` produces a running total' },
            { id: 'c', text: '`LAG(x)` returns NULL for the first row of a partition by default' },
            { id: 'd', text: 'PARTITION BY is required in every window function' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'PARTITION BY is optional; without it the whole result is one window.',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'Keeping ties',
          prompt: 'You need the top 2 salaries per department and must include everyone tied at second place. Which function fits?',
          options: [
            { id: 'a', text: 'ROW_NUMBER()' },
            { id: 'b', text: 'RANK()' },
            { id: 'c', text: 'LAG()' },
          ],
          correct: ['b'],
          explanation: 'RANK gives tied rows the same rank, so `rnk <= 2` keeps all of them. ROW_NUMBER would arbitrarily drop one.',
        },
      ],
    },

    // ------------------------------------------------------------------ 7
    {
      slug: 'entities-keys-relationships',
      title: 'Designing schemas: entities, keys and relationships',
      module: 'Database design',
      skill: 'database-design',
      minutes: 50,
      milestone: true,
      completionCriteria: 'Pass the quiz (70%+) and complete the "Design a schema" exercise, including primary keys, foreign keys and at least one many-to-many relationship.',
      objectives: [
        'Identify entities, attributes and relationships from a written requirement',
        'Choose primary keys and explain surrogate versus natural keys',
        'Model one-to-many, many-to-many and one-to-one relationships with foreign keys',
        'Enforce business rules with NOT NULL, UNIQUE, CHECK and ON DELETE behaviour',
        'Pick appropriate PostgreSQL data types',
      ],
      body: `Good schemas make correct queries easy and wrong data impossible. Start from the requirements, not from tables.

### From requirements to entities

> "Students enrol in courses each term and receive a grade. Each course belongs to one department. Instructors teach courses."

Nouns that have their own identity and attributes become **entities** (tables): student, course, department, instructor. Facts that connect them become **relationships**: a student *enrols in* a course.

\`\`\`text
department 1 ──< course >──< enrollment >── 1 student
   (one department has many courses; a student has many enrollments)
\`\`\`

### Keys

- A **primary key** uniquely identifies a row. A **surrogate key** is a meaningless generated id (\`id BIGINT GENERATED ALWAYS AS IDENTITY\`); a **natural key** comes from the domain (an ISBN, a course code). Surrogate keys never change, which makes them safe to reference; still add a \`UNIQUE\` constraint on natural keys so duplicates are rejected.
- A **foreign key** says "this value must exist as a key in that table". The database rejects orders for customers that do not exist.

### Relationship patterns

**One-to-many:** the foreign key goes on the "many" side.

\`\`\`sql
CREATE TABLE departments (
  id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  department_id BIGINT NOT NULL REFERENCES departments(id)
);
\`\`\`

**Many-to-many:** add a **junction table** holding a foreign key to each side. Attributes of the relationship itself (term, grade) live there.

\`\`\`sql
CREATE TABLE enrollments (
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id  BIGINT NOT NULL REFERENCES courses(id),
  term       TEXT   NOT NULL,
  grade      INTEGER CHECK (grade BETWEEN 0 AND 100),
  PRIMARY KEY (student_id, course_id, term)
);
\`\`\`

**One-to-one:** a foreign key that is also \`UNIQUE\` (for example \`student_profiles.student_id\`). Often a sign the columns could live in one table, unless the extra data is optional or sensitive.

**Self-referencing:** \`employees.manager_id REFERENCES employees(id)\` models a hierarchy.

### Constraints are documentation that runs

- \`NOT NULL\` for required data.
- \`UNIQUE\` for "no two users share an email".
- \`CHECK (price >= 0)\` for value rules.
- \`ON DELETE CASCADE\` (delete children too), \`RESTRICT\` (block the delete) or \`SET NULL\`. Choose deliberately per relationship.

### Data types

Use \`NUMERIC(12,2)\` for money (never \`REAL\`/\`DOUBLE PRECISION\`, which round), \`TIMESTAMPTZ\` for moments in time, \`DATE\` for calendar days, \`TEXT\` for strings, and \`BOOLEAN\` for flags.

PostgreSQL automatically indexes primary keys and UNIQUE columns, but **not** foreign key columns. Index \`courses.department_id\` yourself if you join or delete through it often.

### Common mistakes
- Storing lists in a column (\`course_ids = '1,4,7'\`) instead of a junction table.
- Putting the foreign key on the wrong side of a one-to-many.
- Using a mutable value (email, name) as the primary key.
- Relying on application code alone to enforce rules the database could enforce.`,
      practice: [
        { title: 'Employees and their managers (self-referencing key)', kind: 'sql', ref: 'sql-employee-manager-names' },
        { title: 'Design a schema', kind: 'exercise', prompt: 'Design tables for a library: members borrow copies of books; a book can have many authors and many physical copies; a loan records borrow and return dates. Write CREATE TABLE statements with primary keys, foreign keys, NOT NULL, UNIQUE and CHECK constraints, and explain your ON DELETE choices.' },
        { title: 'Spot the relationships', kind: 'exercise', prompt: 'For an online shop (customers, orders, products, reviews, addresses), list every relationship, label it one-to-one, one-to-many or many-to-many, and say which table holds each foreign key.' },
      ],
      resources: [
        { title: 'PostgreSQL: Constraints', url: 'https://www.postgresql.org/docs/current/ddl-constraints.html', source: 'PostgreSQL Global Development Group', kind: 'docs' },
        { title: 'PostgreSQL Tutorial: Foreign Keys', url: 'https://www.postgresql.org/docs/current/tutorial-fk.html', source: 'PostgreSQL Global Development Group', kind: 'docs' },
        { title: 'CS50 SQL: Designing (lecture 2)', url: 'https://cs50.harvard.edu/sql/2024/weeks/2/', source: 'Harvard CS50', kind: 'video' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Many-to-many',
          prompt: 'Students take many courses and courses have many students. How should this be modelled?',
          options: [
            { id: 'a', text: 'A `course_ids` text column on students' },
            { id: 'b', text: 'A junction table with foreign keys to both students and courses' },
            { id: 'c', text: 'A `student_id` column on courses' },
          ],
          correct: ['b'],
          explanation: 'A junction (associative) table such as enrollments holds one row per student-course pair, plus attributes of that relationship.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Foreign key placement',
          prompt: 'One department has many courses. Which table gets the foreign key column?',
          options: [
            { id: 'a', text: 'courses (department_id)' },
            { id: 'b', text: 'departments (course_id)' },
            { id: 'c', text: 'Both' },
          ],
          correct: ['a'],
          explanation: 'The foreign key goes on the "many" side: each course row points at its single department.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Money type',
          prompt: 'Which PostgreSQL type should store prices?',
          options: [
            { id: 'a', text: 'REAL' },
            { id: 'b', text: 'DOUBLE PRECISION' },
            { id: 'c', text: 'NUMERIC(12, 2)' },
          ],
          correct: ['c'],
          explanation: 'Floating-point types store binary approximations, so 0.1 + 0.2 is not exactly 0.3. NUMERIC is exact.',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Enforcing rules',
          prompt: 'Which rules can the database enforce with built-in constraints? Select all that apply.',
          options: [
            { id: 'a', text: 'No two users share an email address' },
            { id: 'b', text: 'A grade is between 0 and 100' },
            { id: 'c', text: 'Every order refers to an existing customer' },
            { id: 'd', text: 'A product name is required' },
          ],
          correct: ['a', 'b', 'c', 'd'],
          explanation: 'UNIQUE, CHECK, FOREIGN KEY and NOT NULL respectively.',
        },
        {
          key: 'q5',
          type: 'true_false',
          title: 'Foreign key indexes',
          prompt: 'PostgreSQL automatically creates an index on every foreign key column.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'PostgreSQL indexes primary keys and UNIQUE constraints automatically, but not the referencing column of a foreign key. Add one when you join or delete through it.',
        },
      ],
    },

    // ------------------------------------------------------------------ 8
    {
      slug: 'normalization',
      title: 'Normalization and when to denormalize',
      module: 'Database design',
      skill: 'database-design',
      minutes: 45,
      objectives: [
        'Recognise update, insert and delete anomalies in a poorly designed table',
        'Explain functional dependencies in plain terms',
        'Apply first, second and third normal form to decompose a table',
        'Judge when deliberate denormalization is worth its cost',
      ],
      body: `**Normalization** organises columns into tables so each fact is stored **once**. It prevents a family of bugs called anomalies.

### The problem

A spreadsheet-style table of enrollments:

| student_id | student_name | student_email | course_code | course_title | dept_name | grade |
|---|---|---|---|---|---|---|
| 1 | Maya | maya@uni.edu | CS101 | Intro to Programming | CS | 88 |
| 1 | Maya | maya@uni.edu | CS201 | Data Structures | CS | 91 |
| 2 | Noah | noah@uni.edu | CS101 | Intro to Programming | CS | 72 |

- **Update anomaly:** Maya changes her email; you must update every row, and missing one leaves contradictory data.
- **Insert anomaly:** you cannot record a new course until someone enrols in it.
- **Delete anomaly:** delete Noah's only enrollment and you lose the fact that Noah exists.

### Functional dependencies

\`A -> B\` means "knowing A determines B". Here \`student_id -> student_name, student_email\`, \`course_code -> course_title, dept_name\` and \`(student_id, course_code) -> grade\`. Normal forms are rules about these dependencies.

### First normal form (1NF)

Each column holds a single (atomic) value and there are no repeating groups. \`tags = 'sql,python'\` or \`phone1, phone2, phone3\` columns violate 1NF. Move repeated values to their own table with one row per value.

### Second normal form (2NF)

1NF, and every non-key column depends on the **whole** key. With key \`(student_id, course_code)\`, \`student_name\` depends only on \`student_id\` (a *partial dependency*). Split it out:

\`\`\`sql
CREATE TABLE students (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE);
CREATE TABLE courses  (code TEXT PRIMARY KEY, title TEXT NOT NULL, dept_name TEXT NOT NULL);
CREATE TABLE enrollments (
  student_id  INTEGER REFERENCES students(id),
  course_code TEXT    REFERENCES courses(code),
  grade       INTEGER,
  PRIMARY KEY (student_id, course_code)
);
\`\`\`

### Third normal form (3NF)

2NF, and no non-key column depends on another **non-key** column (no *transitive dependency*). If courses also stored \`dept_building\`, then \`code -> dept_name -> dept_building\`. Move department facts into a \`departments\` table referenced by id.

A handy summary: every non-key column must depend on "the key, the whole key and nothing but the key". **BCNF** tightens 3NF for rare cases with overlapping candidate keys.

### Denormalization

Normalized schemas favour correctness and cheap writes. Reads may need more joins. Sometimes you deliberately duplicate data:

- storing \`order_items.unit_price\` at purchase time (this is actually a *different fact*: the historical price),
- a cached \`comment_count\` on posts,
- reporting tables or materialized views for analytics.

Each copy needs a plan to stay correct (a transaction, trigger or scheduled refresh). Denormalize because you measured a problem, not by default.

### Common mistakes
- Comma-separated lists in a column.
- Copying descriptive columns (names, titles) into many tables "for convenience".
- Treating normalization as all-or-nothing: aim for 3NF, then denormalize specific hot paths with a reason.
- Confusing a historical snapshot (price paid) with redundant data.`,
      practice: [
        { title: 'Normalize a spreadsheet', kind: 'exercise', prompt: 'A table orders_flat has columns (order_id, order_date, customer_id, customer_name, customer_city, product_id, product_name, unit_price, quantity). List its functional dependencies, then decompose it into 3NF tables with CREATE TABLE statements. Explain which columns you keep on the order line and why.' },
        { title: 'Headcount per department', kind: 'sql', ref: 'sql-department-headcount' },
      ],
      resources: [
        { title: 'Database normalization', url: 'https://en.wikipedia.org/wiki/Database_normalization', source: 'Wikipedia', kind: 'article' },
        { title: 'Third normal form', url: 'https://en.wikipedia.org/wiki/Third_normal_form', source: 'Wikipedia', kind: 'article' },
        { title: 'PostgreSQL: Materialized Views', url: 'https://www.postgresql.org/docs/current/rules-materializedviews.html', source: 'PostgreSQL Global Development Group', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: '1NF',
          prompt: 'A `posts` table has a column `tags` containing values like `\'sql,python,career\'`. Which normal form does this violate?',
          options: [
            { id: 'a', text: 'First normal form' },
            { id: 'b', text: 'Second normal form' },
            { id: 'c', text: 'Third normal form' },
          ],
          correct: ['a'],
          explanation: 'The column holds several values, so it is not atomic. Use a post_tags table with one row per tag.',
        },
        {
          key: 'q2',
          type: 'single',
          title: '2NF',
          prompt: '`enrollments(student_id, course_id, student_name, grade)` has primary key `(student_id, course_id)`. What is the problem?',
          options: [
            { id: 'a', text: 'grade depends on only part of the key' },
            { id: 'b', text: 'student_name depends on only part of the key (a partial dependency)' },
            { id: 'c', text: 'There is no problem' },
          ],
          correct: ['b'],
          explanation: 'student_name is determined by student_id alone, so it is repeated for every course the student takes. Move it to students.',
        },
        {
          key: 'q3',
          type: 'single',
          title: '3NF',
          prompt: '`employees(id, name, department_id, department_name)` with key `id` violates 3NF because:',
          options: [
            { id: 'a', text: 'department_name depends on department_id, a non-key column' },
            { id: 'b', text: 'name is not unique' },
            { id: 'c', text: 'the key is a single column' },
          ],
          correct: ['a'],
          explanation: 'id -> department_id -> department_name is a transitive dependency. Store department_name once in departments.',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Anomalies',
          prompt: 'Which problems are caused by storing the same fact in many rows? Select all that apply.',
          options: [
            { id: 'a', text: 'Updates that miss some copies, leaving contradictions' },
            { id: 'b', text: 'Being unable to store an entity until a related row exists' },
            { id: 'c', text: 'Losing an entity when its last related row is deleted' },
            { id: 'd', text: 'Queries that can never use indexes' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'These are the update, insert and delete anomalies. Redundancy does not by itself prevent index use.',
        },
        {
          key: 'q5',
          type: 'true_false',
          title: 'Denormalization',
          prompt: 'Denormalization is always a design mistake.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Deliberate, measured denormalization (cached counts, reporting tables) is a valid trade-off as long as you have a mechanism to keep the copies correct.',
        },
      ],
    },

    // ------------------------------------------------------------------ 9
    {
      slug: 'indexes-and-explain',
      title: 'Indexes and EXPLAIN',
      module: 'Performance and correctness',
      skill: 'indexing',
      minutes: 50,
      objectives: [
        'Explain how a B-tree index speeds up lookups and what it costs',
        'Read the main node types in an EXPLAIN plan',
        'Choose column order for composite indexes using the leftmost-prefix rule',
        'Write predicates that can use an index (sargable) and use expression indexes when needed',
      ],
      body: `Without an index, finding rows means reading the whole table (a **sequential scan**). An **index** is a separate, sorted data structure that maps column values to row locations, like the index at the back of a book.

### B-tree indexes

PostgreSQL's default index is a **B-tree**: a balanced tree whose leaves hold sorted keys. Finding a value takes a few page reads even for millions of rows, and because keys are sorted, the same index serves \`=\`, \`<\`, \`>\`, \`BETWEEN\`, \`ORDER BY\` and prefix \`LIKE 'abc%'\` (the last needs the C collation or a \`text_pattern_ops\` index).

\`\`\`sql
CREATE INDEX orders_customer_id_idx ON orders (customer_id);
\`\`\`

Indexes are not free: every \`INSERT\`, \`UPDATE\` of an indexed column and \`DELETE\` must maintain them, and they use disk and memory.

### EXPLAIN

\`EXPLAIN\` shows the plan the optimizer chose; \`EXPLAIN ANALYZE\` **actually runs** the query and adds real timings (wrap data-changing statements in a transaction you roll back).

\`\`\`sql
EXPLAIN ANALYZE
SELECT * FROM orders WHERE customer_id = 42;
\`\`\`

\`\`\`text
Index Scan using orders_customer_id_idx on orders  (cost=0.43..8.45 rows=3 width=40)
                                                   (actual time=0.031..0.035 rows=3 loops=1)
  Index Cond: (customer_id = 42)
Planning Time: 0.120 ms
Execution Time: 0.060 ms
\`\`\`

Common nodes: **Seq Scan** (whole table), **Index Scan** (index then table), **Index Only Scan** (index alone answers the query), **Bitmap Heap Scan** (collect many matches, then read pages in order), plus **Nested Loop**, **Hash Join** and **Merge Join** for joins. Compare estimated \`rows\` with actual \`rows\`: big gaps often mean stale statistics (run \`ANALYZE\`).

A sequential scan is not always bad. If a query returns a large fraction of the table, reading it all is cheaper than millions of index lookups, and the planner knows it.

### Composite indexes and column order

An index on \`(customer_id, ordered_at)\` is sorted by customer, then by date within each customer. It efficiently serves:

- \`WHERE customer_id = 7\`
- \`WHERE customer_id = 7 AND ordered_at >= '2024-03-01'\`
- \`WHERE customer_id = 7 ORDER BY ordered_at DESC LIMIT 10\`

It is a poor fit for \`WHERE ordered_at >= '2024-03-01'\` alone, because dates are scattered across all customers (the **leftmost-prefix** rule). Put equality columns first, then range or sort columns.

### Sargable predicates

An index on \`email\` cannot help \`WHERE lower(email) = 'a@b.com'\`, because the index stores \`email\`, not \`lower(email)\`. Either rewrite the predicate or create an **expression index**:

\`\`\`sql
CREATE INDEX users_lower_email_idx ON users (lower(email));
\`\`\`

Likewise prefer \`ordered_at >= '2024-03-01' AND ordered_at < '2024-04-01'\` to \`date_trunc('month', ordered_at) = '2024-03-01'\`, and note that \`LIKE '%son'\` (leading wildcard) cannot use a B-tree.

\`INCLUDE\` adds non-key columns so more queries become index-only: \`CREATE INDEX ON orders (customer_id) INCLUDE (amount);\`

### Common mistakes
- Adding an index for every column "just in case", slowing every write.
- Wrapping indexed columns in functions or casts in \`WHERE\`.
- Wrong column order in a composite index.
- Forgetting to index foreign keys used in joins.
- Running \`EXPLAIN ANALYZE\` on a \`DELETE\` outside a transaction.`,
      practice: [
        { title: 'Orders placed in March 2024 (a sargable date range)', kind: 'sql', ref: 'sql-orders-in-march' },
        { title: 'Read a plan', kind: 'exercise', prompt: 'In a local PostgreSQL database, create a table with 1,000,000 rows using generate_series, run EXPLAIN ANALYZE on a lookup by a non-indexed column, add an index, and run it again. Record the plan node and execution time before and after, and explain the difference.' },
        { title: 'Choose an index', kind: 'exercise', prompt: 'The slowest query in an app is: SELECT id, amount FROM orders WHERE status = \'delivered\' AND customer_id = $1 ORDER BY ordered_at DESC LIMIT 20. Propose one index, justify its column order, and say whether an INCLUDE clause would help.' },
      ],
      resources: [
        { title: 'Use The Index, Luke: Anatomy of an SQL Index', url: 'https://use-the-index-luke.com/sql/anatomy', source: 'Markus Winand', kind: 'book' },
        { title: 'Use The Index, Luke: The WHERE clause', url: 'https://use-the-index-luke.com/sql/where-clause', source: 'Markus Winand', kind: 'book' },
        { title: 'PostgreSQL: Using EXPLAIN', url: 'https://www.postgresql.org/docs/current/using-explain.html', source: 'PostgreSQL Global Development Group', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Leftmost prefix',
          prompt: 'There is a B-tree index on `(last_name, first_name)`. Which query can use it most efficiently?',
          options: [
            { id: 'a', text: "`WHERE first_name = 'Ada'`" },
            { id: 'b', text: "`WHERE last_name = 'Lovelace'`" },
            { id: 'c', text: "`WHERE first_name LIKE '%da'`" },
          ],
          correct: ['b'],
          explanation: 'The index is sorted by last_name first, so equality on last_name narrows straight to a range. first_name alone is scattered throughout the index.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'EXPLAIN ANALYZE',
          prompt: 'What is the key difference between `EXPLAIN` and `EXPLAIN ANALYZE`?',
          options: [
            { id: 'a', text: 'EXPLAIN ANALYZE executes the query and reports actual times and row counts' },
            { id: 'b', text: 'EXPLAIN ANALYZE updates table statistics' },
            { id: 'c', text: 'There is no difference' },
          ],
          correct: ['a'],
          explanation: 'EXPLAIN only plans. EXPLAIN ANALYZE runs the statement, including any writes, so wrap INSERT/UPDATE/DELETE in BEGIN ... ROLLBACK.',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'Sargable predicates',
          prompt: 'There is a plain B-tree index on `users(email)` and one on `orders(ordered_at)`. Which predicates **cannot** use those indexes? Select all that apply.',
          options: [
            { id: 'a', text: "`WHERE lower(email) = 'a@b.com'`" },
            { id: 'b', text: "`WHERE email = 'a@b.com'`" },
            { id: 'c', text: "`WHERE date_trunc('day', ordered_at) = '2024-03-01'`" },
            { id: 'd', text: "`WHERE ordered_at >= '2024-03-01' AND ordered_at < '2024-03-02'`" },
          ],
          correct: ['a', 'c'],
          explanation: 'Applying a function to the indexed column hides it from a plain index. Rewrite as a range, or create an expression index on lower(email).',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'More indexes',
          prompt: 'Adding more indexes always makes a database faster.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Every index must be updated on writes and takes space. Add indexes for real query patterns and drop unused ones.',
        },
      ],
    },

    // ------------------------------------------------------------------ 10
    {
      slug: 'transactions-and-isolation',
      title: 'Transactions and isolation levels',
      module: 'Performance and correctness',
      skill: 'transactions',
      minutes: 55,
      milestone: true,
      completionCriteria: 'Pass the quiz (70%+) and complete the "Lost update" exercise, showing both the bug and a fix.',
      objectives: [
        'Explain each ACID property with an example',
        'Group statements with BEGIN, COMMIT, ROLLBACK and SAVEPOINT',
        'Describe dirty reads, non-repeatable reads, phantoms, lost updates and write skew',
        "Compare PostgreSQL's Read Committed, Repeatable Read and Serializable levels",
        'Prevent lost updates with atomic updates, row locks or optimistic versioning',
      ],
      body: `A **transaction** groups statements into one unit of work that either fully happens or does not happen at all.

\`\`\`sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;      -- or ROLLBACK; to undo both
\`\`\`

Outside \`BEGIN\`, PostgreSQL runs each statement in its own transaction (autocommit). \`SAVEPOINT name\` and \`ROLLBACK TO SAVEPOINT name\` undo part of a transaction.

### ACID

- **Atomicity:** all or nothing. A crash between the two updates leaves neither applied.
- **Consistency:** each transaction moves the database from one valid state to another; constraints (CHECK, foreign keys) are never left violated.
- **Isolation:** concurrent transactions do not see each other's partial work; the *level* controls how strictly.
- **Durability:** once \`COMMIT\` returns, the change survives a crash (PostgreSQL writes it to the write-ahead log first).

### Concurrency anomalies

| Anomaly | What happens |
|---|---|
| Dirty read | reading another transaction's uncommitted change |
| Non-repeatable read | reading the same row twice and getting different values |
| Phantom read | re-running a query and seeing new rows appear |
| Lost update | two read-modify-write cycles overwrite each other |
| Write skew | two transactions read overlapping data, each writes something that is valid alone but together breaks a rule |

### PostgreSQL isolation levels

PostgreSQL uses **MVCC**: each transaction reads a snapshot, so readers never block writers.

- **Read Committed** (default): each *statement* sees data committed before it began. No dirty reads, but non-repeatable reads and phantoms are possible. \`READ UNCOMMITTED\` behaves the same in PostgreSQL.
- **Repeatable Read:** the whole *transaction* sees one snapshot taken at its first query. If it tries to update a row that another transaction changed and committed meanwhile, it fails with a serialization error.
- **Serializable:** behaves as if transactions ran one at a time. PostgreSQL detects dangerous patterns (including write skew) and aborts one transaction with SQLSTATE \`40001\`. Your application **must retry** it.

\`\`\`sql
BEGIN ISOLATION LEVEL SERIALIZABLE;
-- ...
COMMIT;
\`\`\`

### The lost update and three fixes

Two requests both do "read stock, subtract 1 in application code, write it back". Both read 5 and both write 4: one sale vanished.

1. **Atomic update:** let the database do the arithmetic.
   \`\`\`sql
   UPDATE products SET stock = stock - 1 WHERE id = 7 AND stock > 0;
   \`\`\`
2. **Pessimistic lock:** lock the row while you decide.
   \`\`\`sql
   BEGIN;
   SELECT stock FROM products WHERE id = 7 FOR UPDATE;  -- others wait here
   UPDATE products SET stock = 4 WHERE id = 7;
   COMMIT;
   \`\`\`
3. **Optimistic concurrency:** keep a \`version\` column and \`UPDATE ... SET ..., version = version + 1 WHERE id = 7 AND version = 3\`. If zero rows are updated, someone else won: reload and retry.

### Deadlocks

Transaction A locks row 1 then wants row 2; B locks row 2 then wants row 1. PostgreSQL detects the cycle and aborts one. Reduce deadlocks by locking rows in a consistent order and keeping transactions short.

### Common mistakes
- Read-modify-write in application code without a lock or atomic update.
- Long transactions that hold locks while waiting on the network or a user.
- Using Serializable without retry logic.
- Assuming Read Committed gives one consistent snapshot for a multi-statement report.`,
      practice: [
        { title: 'Lost update', kind: 'exercise', prompt: 'Open two psql sessions on a table accounts(id, balance). In both, BEGIN, SELECT the balance of account 1, then UPDATE it to the value you read minus 10, and COMMIT. Observe the lost update. Repeat using UPDATE ... SET balance = balance - 10 and then using SELECT ... FOR UPDATE, and explain what changed.' },
        { title: 'Write skew', kind: 'exercise', prompt: 'Rule: at least one doctor must be on call. Two on-call doctors each run "if count(on_call) >= 2 then set myself off call" at the same time under REPEATABLE READ. Show why both can succeed, then show how SERIALIZABLE prevents it.' },
      ],
      resources: [
        { title: 'PostgreSQL Tutorial: Transactions', url: 'https://www.postgresql.org/docs/current/tutorial-transactions.html', source: 'PostgreSQL Global Development Group', kind: 'docs' },
        { title: 'PostgreSQL: Transaction Isolation', url: 'https://www.postgresql.org/docs/current/transaction-iso.html', source: 'PostgreSQL Global Development Group', kind: 'docs' },
        { title: 'PostgreSQL: Explicit Locking', url: 'https://www.postgresql.org/docs/current/explicit-locking.html', source: 'PostgreSQL Global Development Group', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Default isolation',
          prompt: "What is PostgreSQL's default transaction isolation level?",
          options: [
            { id: 'a', text: 'Read Uncommitted' },
            { id: 'b', text: 'Read Committed' },
            { id: 'c', text: 'Serializable' },
          ],
          correct: ['b'],
          explanation: 'Read Committed is the default: each statement sees data committed before that statement began.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Lost update fix',
          prompt: 'Which statement safely decrements stock even when many requests run at once?',
          options: [
            { id: 'a', text: 'SELECT stock, then UPDATE products SET stock = <value read - 1>' },
            { id: 'b', text: 'UPDATE products SET stock = stock - 1 WHERE id = 7 AND stock > 0' },
            { id: 'c', text: 'Run the SELECT and UPDATE in two separate transactions' },
          ],
          correct: ['b'],
          explanation: 'The atomic UPDATE reads and writes the current value under a row lock, so concurrent decrements cannot overwrite each other.',
        },
        {
          key: 'q3',
          type: 'matching',
          title: 'ACID',
          prompt: 'Match each ACID property to its meaning.',
          pairs: {
            left: [
              { id: 'a', text: 'Atomicity' },
              { id: 'c', text: 'Consistency' },
              { id: 'i', text: 'Isolation' },
              { id: 'd', text: 'Durability' },
            ],
            right: [
              { id: 'r1', text: 'All statements apply, or none do' },
              { id: 'r2', text: 'Constraints hold before and after every transaction' },
              { id: 'r3', text: 'Concurrent transactions do not see each other\'s partial work' },
              { id: 'r4', text: 'Committed data survives a crash' },
            ],
          },
          matches: { a: 'r1', c: 'r2', i: 'r3', d: 'r4' },
          explanation: 'Atomicity is all-or-nothing, consistency keeps rules satisfied, isolation separates concurrent work, durability survives crashes.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Serialization failures',
          prompt: 'Under SERIALIZABLE, PostgreSQL may abort a transaction with a serialization failure, and the application is expected to retry it.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Serializable Snapshot Isolation aborts one of the conflicting transactions (SQLSTATE 40001). Retrying it is part of using the level correctly.',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'Dirty reads',
          prompt: 'In PostgreSQL, can a transaction at READ UNCOMMITTED see another transaction\'s uncommitted changes?',
          options: [
            { id: 'a', text: 'Yes, that is what the level is for' },
            { id: 'b', text: 'No, PostgreSQL treats READ UNCOMMITTED as READ COMMITTED' },
            { id: 'c', text: 'Only for INSERTs' },
          ],
          correct: ['b'],
          explanation: 'PostgreSQL never allows dirty reads. Requesting READ UNCOMMITTED gives Read Committed behaviour.',
          difficulty: 'hard',
        },
      ],
    },
  ],
};
