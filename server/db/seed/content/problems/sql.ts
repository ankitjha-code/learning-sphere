import type { SeedProblem } from '../types';

// SQL problems run on PostgreSQL. The expected result of each problem is computed by
// running solutionSql against schemaSql + seedSql, so the seed data is designed to make
// common wrong answers (missing ties, NULLs, off-by-one dates) produce different results.

// ---------- Shared-looking schemas (each problem still carries its own full copy) ----------

const EMPLOYEES_SCHEMA = `CREATE TABLE departments (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE employees (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  department_id INTEGER REFERENCES departments(id), -- NULL = not assigned yet
  manager_id    INTEGER REFERENCES employees(id),   -- NULL = reports to nobody
  salary        INTEGER NOT NULL,
  hire_date     DATE NOT NULL
);`;

const EMPLOYEES_SEED = `INSERT INTO departments (id, name) VALUES
  (1, 'Engineering'),
  (2, 'Sales'),
  (3, 'Marketing'),
  (4, 'Legal');

INSERT INTO employees (id, name, department_id, manager_id, salary, hire_date) VALUES
  (1,  'Asha',    1,    NULL, 150000, '2015-03-01'),
  (2,  'Ben',     1,    1,    120000, '2017-06-15'),
  (3,  'Chen',    1,    2,     95000, '2019-01-10'),
  (4,  'Divya',   1,    2,     95000, '2020-08-03'),
  (5,  'Elif',    1,    2,     80000, '2022-02-14'),
  (6,  'Farah',   2,    1,    110000, '2016-11-20'),
  (7,  'Gabriel', 2,    6,     70000, '2021-04-05'),
  (8,  'Hiro',    2,    6,     70000, '2021-09-12'),
  (9,  'Ines',    2,    6,     62000, '2023-01-09'),
  (10, 'Jamal',   3,    1,     90000, '2018-05-30'),
  (11, 'Kofi',    3,    10,    65000, '2022-07-18'),
  (12, 'Lena',    NULL, 1,     72000, '2024-01-08');`;

const SHOP_SCHEMA = `CREATE TABLE customers (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  city        TEXT,
  signup_date DATE NOT NULL
);

CREATE TABLE orders (
  id          INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  ordered_at  TIMESTAMP NOT NULL,
  amount      NUMERIC(10, 2) NOT NULL,
  status      TEXT NOT NULL -- 'delivered' or 'cancelled'
);`;

const SHOP_SEED = `INSERT INTO customers (id, name, city, signup_date) VALUES
  (1, 'Aarav',  'Mumbai', '2023-11-02'),
  (2, 'Bella',  'London', '2023-12-15'),
  (3, 'Carlos', NULL,     '2024-01-03'),
  (4, 'Dana',   'Mumbai', '2024-01-07'),
  (5, 'Emeka',  'Lagos',  '2024-02-01'),
  (6, 'Freya',  'London', '2024-03-20');

INSERT INTO orders (id, customer_id, ordered_at, amount, status) VALUES
  (101, 1, '2024-01-05 10:00:00', 120.00, 'delivered'),
  (102, 2, '2024-01-05 14:30:00',  45.50, 'delivered'),
  (103, 1, '2024-01-06 09:15:00',  80.00, 'delivered'),
  (104, 4, '2024-01-08 18:00:00', 200.00, 'cancelled'),
  (105, 1, '2024-01-08 19:20:00',  35.00, 'delivered'),
  (106, 2, '2024-02-01 08:00:00',  60.00, 'delivered'),
  (107, 5, '2024-02-14 12:00:00', 150.00, 'delivered'),
  (108, 2, '2024-03-01 00:00:00',  20.00, 'delivered'),
  (109, 4, '2024-03-15 11:45:00',  75.25, 'delivered'),
  (110, 2, '2024-03-31 23:10:00',  99.99, 'delivered'),
  (111, 5, '2024-04-01 00:00:00',  10.00, 'delivered');`;

const CATALOG_SCHEMA = `CREATE TABLE products (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL,
  category TEXT NOT NULL,
  price    NUMERIC(10, 2) NOT NULL
);

CREATE TABLE order_items (
  order_id   INTEGER NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (order_id, product_id)
);`;

const CATALOG_SEED = `INSERT INTO products (id, name, category, price) VALUES
  (1, 'Keyboard',   'electronics', 50.00),
  (2, 'Mouse',      'electronics', 20.00),
  (3, 'Notebook',   'stationery',   3.50),
  (4, 'Pen pack',   'stationery',   5.00),
  (5, 'Desk lamp',  'home',        35.00),
  (6, 'Mug',        'home',         8.00),
  (7, 'Headphones', 'electronics', 80.00),
  (8, 'Backpack',   'accessories', 45.00),
  (9, 'Plant pot',  'garden',      12.00);

INSERT INTO order_items (order_id, product_id, quantity) VALUES
  (1, 1, 1),
  (1, 2, 2),
  (2, 3, 10),
  (2, 4, 4),
  (3, 5, 1),
  (3, 6, 4),
  (4, 7, 1),
  (5, 3, 6),
  (5, 6, 2),
  (6, 2, 1),
  (6, 8, 2),
  (7, 4, 10);`;

const SCHOOL_SCHEMA = `CREATE TABLE students (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL,
  email TEXT,  -- may be NULL
  phone TEXT   -- may be NULL
);

CREATE TABLE courses (
  id         INTEGER PRIMARY KEY,
  code       TEXT NOT NULL,
  title      TEXT NOT NULL,
  department TEXT NOT NULL
);

CREATE TABLE enrollments (
  student_id INTEGER NOT NULL REFERENCES students(id),
  course_id  INTEGER NOT NULL REFERENCES courses(id),
  term       TEXT NOT NULL,
  grade      INTEGER, -- NULL = not graded yet
  PRIMARY KEY (student_id, course_id, term)
);`;

const SCHOOL_SEED = `INSERT INTO students (id, name, email, phone) VALUES
  (1, 'Maya',  'maya@uni.edu',  '555-0101'),
  (2, 'Noah',  NULL,            '555-0102'),
  (3, 'Omar',  'omar@uni.edu',  NULL),
  (4, 'Priya', NULL,            NULL),
  (5, 'Quinn', 'quinn@uni.edu', '555-0105'),
  (6, 'Rosa',  'rosa@uni.edu',  NULL);

INSERT INTO courses (id, code, title, department) VALUES
  (1, 'CS101', 'Intro to Programming', 'CS'),
  (2, 'CS201', 'Data Structures',      'CS'),
  (3, 'MA101', 'Calculus I',           'Math'),
  (4, 'HI110', 'World History',        'History');

INSERT INTO enrollments (student_id, course_id, term, grade) VALUES
  (1, 1, '2024-fall',   88),
  (1, 2, '2025-spring', 91),
  (2, 1, '2024-fall',   72),
  (2, 3, '2024-fall',   NULL),
  (3, 3, '2024-fall',   95),
  (3, 4, '2025-spring', 81),
  (5, 1, '2024-fall',   NULL),
  (5, 2, '2025-spring', 67),
  (5, 3, '2025-spring', 78),
  (6, 4, '2024-fall',   90);`;

export const sqlProblems: SeedProblem[] = [
  // 1. Basic SELECT + WHERE
  {
    slug: 'sql-sales-salary-filter',
    title: 'Well-paid sales staff',
    type: 'sql',
    difficulty: 'easy',
    skills: ['sql-basics'],
    topics: ['select', 'where'],
    prompt: `The \`employees\` table stores every employee with a \`department_id\` and a \`salary\`.

Return the **name** and **salary** of every employee in the Sales department (\`department_id = 2\`) who earns **at least 70000**.

**Columns, in order:** \`name\`, \`salary\`

Row order does not matter.`,
    hints: [
      'You need two conditions in the WHERE clause, and both must be true.',
      'Combine the conditions with AND. "At least" means the boundary value itself is included.',
      'SELECT name, salary FROM employees WHERE department_id = 2 AND salary >= 70000;',
    ],
    explanation: `Filter rows with WHERE and join the two conditions with AND. "At least 70000" translates to \`>= 70000\`; using \`>\` would drop the two employees who earn exactly 70000.

\`\`\`sql
SELECT name, salary
FROM employees
WHERE department_id = 2
  AND salary >= 70000;
\`\`\``,
    schemaSql: EMPLOYEES_SCHEMA,
    seedSql: EMPLOYEES_SEED,
    solutionSql: `SELECT name, salary
FROM employees
WHERE department_id = 2
  AND salary >= 70000;`,
    orderMatters: false,
  },

  // 2. ORDER BY + LIMIT with a tie-breaker
  {
    slug: 'sql-top-four-salaries',
    title: 'Four highest salaries',
    type: 'sql',
    difficulty: 'easy',
    skills: ['sql-basics'],
    topics: ['order-by', 'limit', 'ties'],
    prompt: `Return the **four highest-paid employees** from \`employees\`.

Sort by \`salary\` from highest to lowest. When two employees earn the same salary, the one whose \`name\` comes first alphabetically ranks higher.

**Columns, in order:** \`name\`, \`salary\`

**Order:** \`salary\` descending, then \`name\` ascending.`,
    hints: [
      'Sort first, then keep only the first few rows.',
      'ORDER BY accepts several columns: the second one only breaks ties in the first.',
      'ORDER BY salary DESC, name ASC LIMIT 4',
    ],
    explanation: `\`ORDER BY salary DESC\` alone is not enough: Chen and Divya both earn 95000, and without a tie-breaker the database may return either one in fourth place. Adding \`name ASC\` makes the order deterministic, and \`LIMIT 4\` keeps the top four.

\`\`\`sql
SELECT name, salary
FROM employees
ORDER BY salary DESC, name ASC
LIMIT 4;
\`\`\``,
    schemaSql: EMPLOYEES_SCHEMA,
    seedSql: EMPLOYEES_SEED,
    solutionSql: `SELECT name, salary
FROM employees
ORDER BY salary DESC, name ASC
LIMIT 4;`,
    orderMatters: true,
  },

  // 3. COUNT / SUM with GROUP BY (NULL group)
  {
    slug: 'sql-department-headcount',
    title: 'Headcount per department',
    type: 'sql',
    difficulty: 'easy',
    skills: ['sql-aggregation'],
    topics: ['group-by', 'count', 'sum'],
    prompt: `For each \`department_id\` in \`employees\`, return how many employees it has and the total of their salaries.

Employees who are not assigned to a department (\`department_id IS NULL\`) form **their own group**, which should appear with a NULL \`department_id\`. Departments with no employees do not need to appear.

**Columns, in order:** \`department_id\`, \`headcount\`, \`total_salary\`

Row order does not matter.`,
    hints: [
      'One output row per department_id means you should GROUP BY that column.',
      'Use COUNT(*) for the number of rows in each group and SUM(salary) for the total. GROUP BY already puts all NULLs into a single group.',
      'SELECT department_id, COUNT(*) AS headcount, SUM(salary) AS total_salary FROM employees GROUP BY department_id;',
    ],
    explanation: `\`GROUP BY department_id\` collapses the rows into one row per distinct value, and PostgreSQL treats all NULLs as one group, so Lena (no department) appears in a row of her own. Aggregates such as \`COUNT(*)\` and \`SUM(salary)\` are computed per group.

\`\`\`sql
SELECT department_id,
       COUNT(*)    AS headcount,
       SUM(salary) AS total_salary
FROM employees
GROUP BY department_id;
\`\`\``,
    schemaSql: EMPLOYEES_SCHEMA,
    seedSql: EMPLOYEES_SEED,
    solutionSql: `SELECT department_id,
       COUNT(*)    AS headcount,
       SUM(salary) AS total_salary
FROM employees
GROUP BY department_id;`,
    orderMatters: false,
  },

  // 4. HAVING vs WHERE
  {
    slug: 'sql-big-spenders-having',
    title: 'Big spenders',
    type: 'sql',
    difficulty: 'medium',
    skills: ['sql-aggregation'],
    topics: ['group-by', 'having', 'where'],
    prompt: `An order only counts towards spending if its \`status\` is \`'delivered'\` (cancelled orders are ignored).

Return every customer whose **delivered** orders add up to **more than 150.00**, together with that delivered total.

**Columns, in order:** \`customer_id\`, \`total_spent\`

Row order does not matter.`,
    hints: [
      'There are two filters here: one on individual orders and one on the per-customer total.',
      'Row-level filters (status) belong in WHERE, which runs before grouping. Filters on aggregates belong in HAVING, which runs after.',
      "SELECT customer_id, SUM(amount) AS total_spent FROM orders WHERE status = 'delivered' GROUP BY customer_id HAVING SUM(amount) > 150;",
    ],
    explanation: `WHERE removes cancelled orders before the rows are grouped; HAVING then keeps only the groups whose sum exceeds 150. If you forget the status filter, customer 4 sneaks in because of a cancelled 200.00 order.

\`\`\`sql
SELECT customer_id, SUM(amount) AS total_spent
FROM orders
WHERE status = 'delivered'
GROUP BY customer_id
HAVING SUM(amount) > 150;
\`\`\``,
    schemaSql: SHOP_SCHEMA,
    seedSql: SHOP_SEED,
    solutionSql: `SELECT customer_id, SUM(amount) AS total_spent
FROM orders
WHERE status = 'delivered'
GROUP BY customer_id
HAVING SUM(amount) > 150;`,
    orderMatters: false,
  },

  // 5. INNER JOIN
  {
    slug: 'sql-orders-with-customer-names',
    title: 'Orders with customer names',
    type: 'sql',
    difficulty: 'easy',
    skills: ['sql-joins'],
    topics: ['inner-join'],
    prompt: `The \`orders\` table only stores a \`customer_id\`. Return every order with an \`amount\` of **at least 75.00**, showing the customer's name instead of their id.

**Columns, in order:** \`order_id\`, \`customer_name\`, \`amount\`

Row order does not matter.`,
    hints: [
      'The customer name lives in a different table. How are the two tables connected?',
      'JOIN customers ON customers.id = orders.customer_id, then filter on the amount.',
      'SELECT o.id AS order_id, c.name AS customer_name, o.amount FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.amount >= 75;',
    ],
    explanation: `An inner join pairs each order with the customer whose \`id\` matches \`orders.customer_id\`. Table aliases (\`o\`, \`c\`) keep the query short, and column aliases give the output the requested names.

\`\`\`sql
SELECT o.id   AS order_id,
       c.name AS customer_name,
       o.amount
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.amount >= 75;
\`\`\``,
    schemaSql: SHOP_SCHEMA,
    seedSql: SHOP_SEED,
    solutionSql: `SELECT o.id   AS order_id,
       c.name AS customer_name,
       o.amount
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.amount >= 75;`,
    orderMatters: false,
  },

  // 6. LEFT JOIN keeping customers with no orders
  {
    slug: 'sql-order-count-including-zero',
    title: 'Order count for every customer',
    type: 'sql',
    difficulty: 'medium',
    skills: ['sql-joins', 'sql-aggregation'],
    topics: ['left-join', 'count', 'missing-rows'],
    prompt: `Return **every customer** with the number of orders they have placed (any status). Customers who have never ordered must still appear, with an \`order_count\` of \`0\`.

**Columns, in order:** \`name\`, \`order_count\`

Row order does not matter.`,
    hints: [
      'An inner join drops customers that have no matching orders. Which join keeps every row from the left table?',
      'Use customers LEFT JOIN orders and GROUP BY the customer. Think carefully about what COUNT(*) does for a customer with no orders.',
      'COUNT(*) counts the single NULL-padded row as 1. Use COUNT(o.id), which ignores NULLs: SELECT c.name, COUNT(o.id) AS order_count FROM customers c LEFT JOIN orders o ON o.customer_id = c.id GROUP BY c.id, c.name;',
    ],
    explanation: `A LEFT JOIN keeps every customer; for customers without orders, the order columns are filled with NULL. \`COUNT(*)\` would count that padded row and report 1, but \`COUNT(o.id)\` only counts non-NULL values and correctly reports 0. Grouping by \`c.id\` (not just the name) keeps two customers with the same name apart.

\`\`\`sql
SELECT c.name, COUNT(o.id) AS order_count
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
GROUP BY c.id, c.name;
\`\`\``,
    schemaSql: SHOP_SCHEMA,
    seedSql: SHOP_SEED,
    solutionSql: `SELECT c.name, COUNT(o.id) AS order_count
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
GROUP BY c.id, c.name;`,
    orderMatters: false,
  },

  // 7. Self join
  {
    slug: 'sql-employee-manager-names',
    title: 'Employees and their managers',
    type: 'sql',
    difficulty: 'medium',
    skills: ['sql-joins'],
    topics: ['self-join', 'left-join'],
    prompt: `Each row in \`employees\` has a \`manager_id\` that points to another row in the **same table**.

Return every employee's name next to their manager's name. Employees with no manager (\`manager_id IS NULL\`) must still appear, with \`manager\` set to NULL.

**Columns, in order:** \`employee\`, \`manager\`

Row order does not matter.`,
    hints: [
      'You need two copies of the employees table: one for the employee and one for the manager. Give them different aliases.',
      'Join e.manager_id to m.id. An inner join would drop the employee who has no manager.',
      'SELECT e.name AS employee, m.name AS manager FROM employees e LEFT JOIN employees m ON m.id = e.manager_id;',
    ],
    explanation: `A self join uses the same table twice under different aliases. Here \`e\` is the employee and \`m\` is their manager. A LEFT JOIN keeps Asha, who reports to nobody, and gives her a NULL manager.

\`\`\`sql
SELECT e.name AS employee,
       m.name AS manager
FROM employees e
LEFT JOIN employees m ON m.id = e.manager_id;
\`\`\``,
    schemaSql: EMPLOYEES_SCHEMA,
    seedSql: EMPLOYEES_SEED,
    solutionSql: `SELECT e.name AS employee,
       m.name AS manager
FROM employees e
LEFT JOIN employees m ON m.id = e.manager_id;`,
    orderMatters: false,
  },

  // 8. Correlated subquery: above department average
  {
    slug: 'sql-above-department-average',
    title: 'Above their department average',
    type: 'sql',
    difficulty: 'medium',
    skills: ['sql-advanced'],
    topics: ['subquery', 'correlated-subquery', 'avg'],
    prompt: `Return the employees who earn **more than the average salary of their own department**. Employees without a department are not part of any department average and should not be returned.

**Columns, in order:** \`name\`, \`department_id\`, \`salary\`

Row order does not matter.`,
    hints: [
      'The comparison value is different for each employee: it depends on their department_id.',
      'Use a correlated subquery in WHERE: (SELECT AVG(salary) FROM employees e2 WHERE e2.department_id = e.department_id).',
      'SELECT e.name, e.department_id, e.salary FROM employees e WHERE e.salary > (SELECT AVG(e2.salary) FROM employees e2 WHERE e2.department_id = e.department_id);',
    ],
    explanation: `A correlated subquery is re-evaluated for each outer row, so each employee is compared to the average of their own department. Comparing to the company-wide average (\`SELECT AVG(salary) FROM employees\`) gives a different answer. For Lena, \`e2.department_id = NULL\` matches nothing, the subquery returns NULL, and \`salary > NULL\` is not true, so she is excluded automatically.

\`\`\`sql
SELECT e.name, e.department_id, e.salary
FROM employees e
WHERE e.salary > (
  SELECT AVG(e2.salary)
  FROM employees e2
  WHERE e2.department_id = e.department_id
);
\`\`\`

An equivalent approach joins to a derived table of per-department averages.`,
    schemaSql: EMPLOYEES_SCHEMA,
    seedSql: EMPLOYEES_SEED,
    solutionSql: `SELECT e.name, e.department_id, e.salary
FROM employees e
WHERE e.salary > (
  SELECT AVG(e2.salary)
  FROM employees e2
  WHERE e2.department_id = e.department_id
);`,
    orderMatters: false,
  },

  // 9. CTE: aggregate of an aggregate
  {
    slug: 'sql-top-categories-cte',
    title: 'Categories above average revenue',
    type: 'sql',
    difficulty: 'medium',
    skills: ['sql-advanced'],
    topics: ['cte', 'with', 'group-by'],
    prompt: `Revenue for an order line is \`price * quantity\`. A category's revenue is the sum over all of its order lines.

Considering **only categories that have at least one sale**, return the categories whose revenue is **greater than the average category revenue**.

**Columns, in order:** \`category\`, \`revenue\`

Row order does not matter.`,
    hints: [
      'This is a two-step problem: first compute revenue per category, then compare each category to the average of those totals.',
      'Put the first step in a CTE: WITH category_revenue AS (SELECT p.category, SUM(p.price * oi.quantity) AS revenue FROM ... GROUP BY p.category).',
      'Then: SELECT category, revenue FROM category_revenue WHERE revenue > (SELECT AVG(revenue) FROM category_revenue);',
    ],
    explanation: `You cannot nest aggregates directly (\`AVG(SUM(...))\` is not allowed in the same SELECT), so name the intermediate result with a CTE and query it twice. Averaging \`price * quantity\` over individual lines is a common mistake: that is the average line value, not the average category revenue. An inner join naturally ignores categories without sales, such as \`garden\`.

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
\`\`\``,
    schemaSql: CATALOG_SCHEMA,
    seedSql: CATALOG_SEED,
    solutionSql: `WITH category_revenue AS (
  SELECT p.category, SUM(p.price * oi.quantity) AS revenue
  FROM order_items oi
  JOIN products p ON p.id = oi.product_id
  GROUP BY p.category
)
SELECT category, revenue
FROM category_revenue
WHERE revenue > (SELECT AVG(revenue) FROM category_revenue);`,
    orderMatters: false,
  },

  // 10. RANK top-N per group with ties
  {
    slug: 'sql-top-two-per-department',
    title: 'Top two earners per department (with ties)',
    type: 'sql',
    difficulty: 'hard',
    skills: ['sql-advanced'],
    topics: ['window-functions', 'rank', 'top-n-per-group'],
    prompt: `Within each department, rank employees by salary from highest to lowest. Employees with equal salaries share the same rank, and the next rank is skipped (standard \`RANK()\` behaviour: 1, 2, 2, 4).

Return every employee whose rank is **2 or better** in their department, along with the department **name**. Only include employees who belong to a department.

**Columns, in order:** \`department\`, \`name\`, \`salary\`

Row order does not matter.`,
    hints: [
      'A window function can rank rows within each department without collapsing them: RANK() OVER (PARTITION BY ... ORDER BY ...).',
      'You cannot filter on a window function in WHERE of the same query. Compute the rank in a CTE or subquery, then filter on it outside.',
      'WITH ranked AS (SELECT d.name AS department, e.name, e.salary, RANK() OVER (PARTITION BY e.department_id ORDER BY e.salary DESC) AS rnk FROM employees e JOIN departments d ON d.id = e.department_id) SELECT department, name, salary FROM ranked WHERE rnk <= 2;',
    ],
    explanation: `\`RANK()\` gives tied rows the same rank, so both Sales employees earning 70000 are rank 2 and both are returned. \`ROW_NUMBER()\` would arbitrarily keep only one of them. Window functions are evaluated after WHERE, so the ranking has to happen in a CTE (or subquery) and be filtered in the outer query. The inner join to \`departments\` drops Lena, who has no department.

\`\`\`sql
WITH ranked AS (
  SELECT d.name AS department,
         e.name,
         e.salary,
         RANK() OVER (PARTITION BY e.department_id ORDER BY e.salary DESC) AS rnk
  FROM employees e
  JOIN departments d ON d.id = e.department_id
)
SELECT department, name, salary
FROM ranked
WHERE rnk <= 2;
\`\`\``,
    schemaSql: EMPLOYEES_SCHEMA,
    seedSql: EMPLOYEES_SEED,
    solutionSql: `WITH ranked AS (
  SELECT d.name AS department,
         e.name,
         e.salary,
         RANK() OVER (PARTITION BY e.department_id ORDER BY e.salary DESC) AS rnk
  FROM employees e
  JOIN departments d ON d.id = e.department_id
)
SELECT department, name, salary
FROM ranked
WHERE rnk <= 2;`,
    orderMatters: false,
  },

  // 11. Running total over daily aggregates
  {
    slug: 'sql-daily-revenue-running-total',
    title: 'Daily revenue with a running total',
    type: 'sql',
    difficulty: 'hard',
    skills: ['sql-advanced'],
    topics: ['window-functions', 'running-total', 'dates'],
    prompt: `Using only **delivered** orders, compute the revenue for each calendar day that had at least one delivered order, and a running total of revenue up to and including that day.

Several orders can fall on the same day; they must be combined into one row for that day.

**Columns, in order:** \`day\` (a \`DATE\`), \`revenue\`, \`running_total\`

**Order:** \`day\` ascending.`,
    hints: [
      'Start by getting one row per day: cast ordered_at to a date and GROUP BY it.',
      'A running total is SUM(...) OVER (ORDER BY day). You can apply a window function to an aggregate, or compute the daily totals in a CTE first.',
      "WITH daily AS (SELECT ordered_at::date AS day, SUM(amount) AS revenue FROM orders WHERE status = 'delivered' GROUP BY ordered_at::date) SELECT day, revenue, SUM(revenue) OVER (ORDER BY day) AS running_total FROM daily ORDER BY day;",
    ],
    explanation: `First collapse orders into daily totals; then a window \`SUM\` ordered by day accumulates them. If you skip the daily grouping, days with two orders produce two rows. Note that cancelled order 104 must be excluded before summing.

\`\`\`sql
WITH daily AS (
  SELECT ordered_at::date AS day, SUM(amount) AS revenue
  FROM orders
  WHERE status = 'delivered'
  GROUP BY ordered_at::date
)
SELECT day,
       revenue,
       SUM(revenue) OVER (ORDER BY day) AS running_total
FROM daily
ORDER BY day;
\`\`\`

With \`ORDER BY\` inside \`OVER\`, the default frame runs from the first row to the current row, which is exactly a running total.`,
    schemaSql: SHOP_SCHEMA,
    seedSql: SHOP_SEED,
    solutionSql: `WITH daily AS (
  SELECT ordered_at::date AS day, SUM(amount) AS revenue
  FROM orders
  WHERE status = 'delivered'
  GROUP BY ordered_at::date
)
SELECT day,
       revenue,
       SUM(revenue) OVER (ORDER BY day) AS running_total
FROM daily
ORDER BY day;`,
    orderMatters: true,
  },

  // 12. Date filtering on a TIMESTAMP
  {
    slug: 'sql-orders-in-march',
    title: 'Orders placed in March 2024',
    type: 'sql',
    difficulty: 'easy',
    skills: ['sql-basics'],
    topics: ['where', 'dates', 'timestamps'],
    prompt: `\`orders.ordered_at\` is a \`TIMESTAMP\` (date **and** time). Return every order placed at any moment during **March 2024**, of any status.

**Columns, in order:** \`id\`, \`ordered_at\`

Row order does not matter.`,
    hints: [
      "Watch the last day of the month: '2024-03-31' as a timestamp means midnight at the start of March 31.",
      'Use a half-open range: on or after the first instant of March, and strictly before the first instant of April.',
      "SELECT id, ordered_at FROM orders WHERE ordered_at >= '2024-03-01' AND ordered_at < '2024-04-01';",
    ],
    explanation: `\`BETWEEN '2024-03-01' AND '2024-03-31'\` compares timestamps against midnight on March 31, so it silently drops an order placed at 23:10 that day. Extending it to \`'2024-04-01'\` wrongly includes an order placed exactly at midnight on April 1. The half-open range \`>= start AND < next_start\` is correct for any precision and can use an index on \`ordered_at\`.

\`\`\`sql
SELECT id, ordered_at
FROM orders
WHERE ordered_at >= '2024-03-01'
  AND ordered_at <  '2024-04-01';
\`\`\``,
    schemaSql: SHOP_SCHEMA,
    seedSql: SHOP_SEED,
    solutionSql: `SELECT id, ordered_at
FROM orders
WHERE ordered_at >= '2024-03-01'
  AND ordered_at <  '2024-04-01';`,
    orderMatters: false,
  },

  // 13. DISTINCT after a join
  {
    slug: 'sql-distinct-cs-students',
    title: 'Students who took a CS course',
    type: 'sql',
    difficulty: 'easy',
    skills: ['sql-basics', 'sql-joins'],
    topics: ['distinct', 'inner-join'],
    prompt: `Return each student who has enrolled in **at least one** course from the \`'CS'\` department. Each student must appear **exactly once**, even if they took several CS courses.

**Columns, in order:** \`student_id\`, \`name\`

Row order does not matter.`,
    hints: [
      'You need students, enrollments and courses together: join through enrollments.',
      'A student with two CS enrollments produces two joined rows. How do you remove duplicate result rows?',
      "SELECT DISTINCT s.id AS student_id, s.name FROM students s JOIN enrollments e ON e.student_id = s.id JOIN courses c ON c.id = e.course_id WHERE c.department = 'CS';",
    ],
    explanation: `Joining multiplies rows: Maya and Quinn each have two CS enrollments, so they appear twice. \`SELECT DISTINCT\` removes duplicate output rows. An alternative is \`WHERE EXISTS (...)\`, which never creates the duplicates in the first place.

\`\`\`sql
SELECT DISTINCT s.id AS student_id, s.name
FROM students s
JOIN enrollments e ON e.student_id = s.id
JOIN courses c     ON c.id = e.course_id
WHERE c.department = 'CS';
\`\`\``,
    schemaSql: SCHOOL_SCHEMA,
    seedSql: SCHOOL_SEED,
    solutionSql: `SELECT DISTINCT s.id AS student_id, s.name
FROM students s
JOIN enrollments e ON e.student_id = s.id
JOIN courses c     ON c.id = e.course_id
WHERE c.department = 'CS';`,
    orderMatters: false,
  },

  // 14. NULL handling with COALESCE
  {
    slug: 'sql-student-contact-coalesce',
    title: 'Best contact for each student',
    type: 'sql',
    difficulty: 'easy',
    skills: ['sql-basics'],
    topics: ['null', 'coalesce'],
    prompt: `Some students have no email, some have no phone, and some have neither.

For every student, return a single \`contact\` value: their \`email\` if it is not NULL, otherwise their \`phone\` if it is not NULL, otherwise the text \`'no contact on file'\`.

**Columns, in order:** \`name\`, \`contact\`

Row order does not matter.`,
    hints: [
      'You want the first non-NULL value from a list of candidates.',
      'COALESCE(a, b, c) returns the first argument that is not NULL.',
      "SELECT name, COALESCE(email, phone, 'no contact on file') AS contact FROM students;",
    ],
    explanation: `\`COALESCE\` evaluates its arguments left to right and returns the first non-NULL one, which is exactly a priority list. Note that \`email = NULL\` is never true in SQL; to test for NULL explicitly you must write \`email IS NULL\`, for example in an equivalent \`CASE\` expression.

\`\`\`sql
SELECT name,
       COALESCE(email, phone, 'no contact on file') AS contact
FROM students;
\`\`\``,
    schemaSql: SCHOOL_SCHEMA,
    seedSql: SCHOOL_SEED,
    solutionSql: `SELECT name,
       COALESCE(email, phone, 'no contact on file') AS contact
FROM students;`,
    orderMatters: false,
  },
];
