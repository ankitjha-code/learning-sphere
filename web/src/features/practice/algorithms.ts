/**
 * Step recorders for the CodeLab visualizer. Each algorithm runs once up front and
 * records frames; the player then steps through them. Pure functions, no DOM.
 */

export type SortFrame = {
  array: number[];
  compare?: [number, number];
  swap?: [number, number];
  write?: number; // index just written (merge sort)
  range?: [number, number]; // active subarray (merge sort)
  sorted: number[]; // indices known to be in final position
  note: string;
};

export type SortAlgorithm = 'bubble' | 'insertion' | 'merge';

export function bubbleSortFrames(input: number[]): SortFrame[] {
  const a = [...input];
  const n = a.length;
  const sorted: number[] = [];
  const frames: SortFrame[] = [{ array: [...a], sorted: [], note: 'Start. Bubble sort repeatedly swaps adjacent values that are out of order.' }];
  for (let pass = 0; pass < n - 1; pass++) {
    let swapped = false;
    for (let j = 0; j < n - 1 - pass; j++) {
      frames.push({ array: [...a], compare: [j, j + 1], sorted: [...sorted], note: `Compare ${a[j]} and ${a[j + 1]}.` });
      if (a[j] > a[j + 1]) {
        [a[j], a[j + 1]] = [a[j + 1], a[j]];
        swapped = true;
        frames.push({ array: [...a], swap: [j, j + 1], sorted: [...sorted], note: `${a[j + 1]} > ${a[j]}, so swap them.` });
      }
    }
    sorted.push(n - 1 - pass);
    frames.push({ array: [...a], sorted: [...sorted], note: `Pass ${pass + 1} done: ${a[n - 1 - pass]} has bubbled to its final place.` });
    if (!swapped) {
      for (let k = 0; k < n - 1 - pass; k++) sorted.push(k);
      frames.push({ array: [...a], sorted: [...sorted], note: 'No swaps in this pass, so the array is sorted. Stop early.' });
      return frames;
    }
  }
  frames.push({ array: [...a], sorted: a.map((_, i) => i), note: 'Sorted.' });
  return frames;
}

export function insertionSortFrames(input: number[]): SortFrame[] {
  const a = [...input];
  const frames: SortFrame[] = [{ array: [...a], sorted: [0], note: 'Start. The first value on its own is a sorted prefix.' }];
  for (let i = 1; i < a.length; i++) {
    let j = i;
    frames.push({ array: [...a], compare: [j - 1, j], sorted: range(i), note: `Insert ${a[i]} into the sorted prefix on its left.` });
    while (j > 0 && a[j - 1] > a[j]) {
      [a[j - 1], a[j]] = [a[j], a[j - 1]];
      frames.push({ array: [...a], swap: [j - 1, j], sorted: range(i), note: `${a[j]} > ${a[j - 1]}, shift ${a[j]} right.` });
      j--;
      if (j > 0) frames.push({ array: [...a], compare: [j - 1, j], sorted: range(i), note: `Compare ${a[j - 1]} and ${a[j]}.` });
    }
    frames.push({ array: [...a], sorted: range(i + 1), note: `The first ${i + 1} values are now sorted.` });
  }
  frames.push({ array: [...a], sorted: range(a.length), note: 'Sorted.' });
  return frames;
}

export function mergeSortFrames(input: number[]): SortFrame[] {
  const a = [...input];
  const frames: SortFrame[] = [{ array: [...a], sorted: [], note: 'Start. Merge sort splits the array in halves, sorts each half, then merges them.' }];
  const sortRange = (lo: number, hi: number) => {
    if (hi - lo < 1) return;
    const mid = Math.floor((lo + hi) / 2);
    sortRange(lo, mid);
    sortRange(mid + 1, hi);
    const left = a.slice(lo, mid + 1);
    const right = a.slice(mid + 1, hi + 1);
    frames.push({ array: [...a], range: [lo, hi], sorted: [], note: `Merge [${left.join(', ')}] and [${right.join(', ')}].` });
    let i = 0;
    let j = 0;
    let k = lo;
    while (i < left.length && j < right.length) {
      const takeLeft = left[i] <= right[j];
      a[k] = takeLeft ? left[i++] : right[j++];
      frames.push({ array: [...a], range: [lo, hi], write: k, sorted: [], note: `Take ${a[k]}, the smaller front value${takeLeft ? ' (left half wins ties, keeping the sort stable)' : ''}.` });
      k++;
    }
    while (i < left.length) {
      a[k] = left[i++];
      frames.push({ array: [...a], range: [lo, hi], write: k, sorted: [], note: `Copy the remaining ${a[k]} from the left half.` });
      k++;
    }
    while (j < right.length) {
      a[k] = right[j++];
      frames.push({ array: [...a], range: [lo, hi], write: k, sorted: [], note: `Copy the remaining ${a[k]} from the right half.` });
      k++;
    }
  };
  sortRange(0, a.length - 1);
  frames.push({ array: [...a], sorted: range(a.length), note: 'Sorted.' });
  return frames;
}

function range(n: number) {
  return Array.from({ length: n }, (_, i) => i);
}

export function sortFrames(algo: SortAlgorithm, input: number[]) {
  return algo === 'bubble' ? bubbleSortFrames(input) : algo === 'insertion' ? insertionSortFrames(input) : mergeSortFrames(input);
}

// ---------- Binary search ----------

export type SearchFrame = { lo: number; hi: number; mid: number | null; found: number | null; eliminated: number[]; note: string };

export function binarySearchFrames(sorted: number[], target: number): SearchFrame[] {
  let lo = 0;
  let hi = sorted.length - 1;
  const eliminated = new Set<number>();
  const frames: SearchFrame[] = [{ lo, hi, mid: null, found: null, eliminated: [], note: `Search for ${target}. The answer, if present, is between lo and hi.` }];
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    frames.push({ lo, hi, mid, found: null, eliminated: [...eliminated], note: `mid = (${lo} + ${hi}) / 2 = ${mid}. Check ${sorted[mid]}.` });
    if (sorted[mid] === target) {
      frames.push({ lo, hi, mid, found: mid, eliminated: [...eliminated], note: `${sorted[mid]} equals ${target}. Found at index ${mid}.` });
      return frames;
    }
    if (sorted[mid] < target) {
      for (let i = lo; i <= mid; i++) eliminated.add(i);
      lo = mid + 1;
      frames.push({ lo, hi, mid: null, found: null, eliminated: [...eliminated], note: `${sorted[mid]} < ${target}, so discard the left half. lo = ${lo}.` });
    } else {
      for (let i = mid; i <= hi; i++) eliminated.add(i);
      hi = mid - 1;
      frames.push({ lo, hi, mid: null, found: null, eliminated: [...eliminated], note: `${sorted[mid]} > ${target}, so discard the right half. hi = ${hi}.` });
    }
  }
  frames.push({ lo, hi, mid: null, found: null, eliminated: [...eliminated], note: `lo > hi: ${target} is not in the array.` });
  return frames;
}

// ---------- BFS on a grid ----------

export type Cell = [number, number];
export type BfsFrame = { visited: Set<string>; frontier: string[]; current: string | null; path: string[]; note: string };

export const key = (r: number, c: number) => `${r},${c}`;

export function bfsFrames(rows: number, cols: number, walls: Set<string>, start: Cell, goal: Cell): BfsFrame[] {
  const startKey = key(...start);
  const goalKey = key(...goal);
  const visited = new Set<string>([startKey]);
  const parent = new Map<string, string>();
  let queue: string[] = [startKey];
  const frames: BfsFrame[] = [{ visited: new Set(visited), frontier: [...queue], current: null, path: [], note: 'Start. The queue holds the start cell. BFS explores cells in order of distance.' }];
  const dirs: Cell[] = [
    [-1, 0],
    [0, 1],
    [1, 0],
    [0, -1],
  ];
  while (queue.length) {
    const cur = queue[0];
    queue = queue.slice(1);
    const [r, c] = cur.split(',').map(Number);
    if (cur === goalKey) {
      const path: string[] = [];
      for (let k: string | undefined = cur; k; k = parent.get(k)) path.unshift(k);
      frames.push({ visited: new Set(visited), frontier: [...queue], current: cur, path, note: `Reached the goal. The shortest path has ${path.length - 1} steps.` });
      return frames;
    }
    const added: string[] = [];
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      const k = key(nr, nc);
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || walls.has(k) || visited.has(k)) continue;
      visited.add(k);
      parent.set(k, cur);
      queue.push(k);
      added.push(k);
    }
    frames.push({
      visited: new Set(visited),
      frontier: [...queue],
      current: cur,
      path: [],
      note: added.length ? `Visit (${r}, ${c}) and add ${added.length} unvisited neighbour${added.length === 1 ? '' : 's'} to the queue.` : `Visit (${r}, ${c}). No new neighbours.`,
    });
  }
  frames.push({ visited: new Set(visited), frontier: [], current: null, path: [], note: 'The queue is empty and the goal was never reached: walls block every path.' });
  return frames;
}
