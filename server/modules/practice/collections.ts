/**
 * Curated CodeLab sets derived from problem tags and skills (no hand-maintained lists,
 * so new library problems join the right sets automatically). None of these claim to
 * be any company's interview questions.
 */
export type CollectionDef = {
  id: string;
  title: string;
  description: string;
  type?: 'coding' | 'sql';
  difficulties?: string[];
  skills?: string[]; // skill slugs (any)
  topics?: string[]; // topic tags (any)
};

export const COLLECTIONS: CollectionDef[] = [
  { id: 'interview-essentials', title: 'Interview essentials', description: 'Core data-structure and algorithm patterns that come up again and again in technical interviews, easy to medium.', type: 'coding', difficulties: ['easy', 'medium'], skills: ['arrays', 'hashing', 'two-pointers', 'binary-search', 'stacks-queues', 'graphs', 'dynamic-programming', 'trees', 'heaps', 'linked-lists'] },
  { id: 'arrays-hashing', title: 'Arrays and hashing', description: 'Traversal, counting and constant-time lookups with maps and sets.', type: 'coding', skills: ['arrays', 'hashing'], topics: ['arrays', 'hashing', 'counting', 'prefix-sums', 'sets'] },
  { id: 'two-pointers', title: 'Two pointers', description: 'Linear-time scans from both ends and sliding windows.', type: 'coding', skills: ['two-pointers'], topics: ['two-pointers', 'sliding-window'] },
  { id: 'stack', title: 'Stack', description: 'Matching, undo-style processing and monotonic stacks.', type: 'coding', skills: ['stacks-queues'], topics: ['stack', 'monotonic-stack', 'queue'] },
  { id: 'binary-search', title: 'Binary search', description: 'Halving sorted spaces and searching on the answer.', type: 'coding', skills: ['binary-search'], topics: ['binary-search', 'search-on-answer'] },
  { id: 'graphs', title: 'Graphs', description: 'Grids, BFS, DFS and shortest paths.', type: 'coding', skills: ['graphs', 'shortest-paths'], topics: ['graphs', 'bfs', 'dfs', 'grid', 'shortest-path'] },
  { id: 'dynamic-programming', title: 'Dynamic programming', description: 'Overlapping subproblems with memoization and tabulation.', type: 'coding', skills: ['dynamic-programming'], topics: ['dynamic-programming', 'memoization'] },
  { id: 'sql-basics', title: 'SQL basics', description: 'SELECT, WHERE, ORDER BY and simple aggregates.', type: 'sql', skills: ['sql-basics', 'sql-aggregation'], topics: ['select', 'where', 'order-by', 'group-by', 'count', 'sum'] },
  { id: 'sql-joins', title: 'SQL joins', description: 'Inner, left and self joins, and the rows they drop or keep.', type: 'sql', skills: ['sql-joins'], topics: ['inner-join', 'left-join', 'self-join', 'missing-rows'] },
  { id: 'sql-window-functions', title: 'SQL window functions', description: 'Ranking, running totals and top-N per group.', type: 'sql', skills: ['sql-advanced'], topics: ['window-functions', 'rank', 'running-total', 'top-n-per-group'] },
  { id: 'beginner-python', title: 'Beginner Python', description: 'Input, output, conditionals and loops. A gentle start that runs in Python or any other language.', type: 'coding', difficulties: ['easy'], skills: ['programming-basics', 'control-flow', 'functions', 'python', 'collections'] },
];

export function inCollection(def: CollectionDef, q: { type: string; difficulty: string; topics: string[]; skillSlugs: string[] }) {
  if (def.type && q.type !== def.type) return false;
  if (def.difficulties && !def.difficulties.includes(q.difficulty)) return false;
  const skillHit = !!def.skills?.some((s) => q.skillSlugs.includes(s));
  const topicHit = !!def.topics?.some((t) => q.topics.includes(t));
  return skillHit || topicHit;
}
