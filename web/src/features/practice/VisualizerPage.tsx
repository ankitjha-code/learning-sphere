import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { PlayIcon, PauseIcon, SkipBackIcon, SkipForwardIcon, ArrowCounterClockwiseIcon, ShuffleIcon, CaretRightIcon, BroomIcon } from '@phosphor-icons/react';
import { PageHeader, Button, Card, CardBody, Field, Input, Select, Tabs, Segmented, Banner } from '@/components/ui';
import { usePrefersReducedMotion } from './SplitPane';
import { binarySearchFrames, bfsFrames, key, sortFrames, type Cell, type SortAlgorithm } from './algorithms';

const SPEEDS = [
  { value: '1400', label: 'Slow' },
  { value: '700', label: 'Normal' },
  { value: '300', label: 'Fast' },
  { value: '100', label: 'Very fast' },
];

/** Step player shared by every visualization: play/pause, step, reset, speed. */
function usePlayer(length: number, resetKey: unknown) {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState('700');
  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [length, resetKey]);
  useEffect(() => {
    if (!playing) return;
    if (index >= length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIndex((i) => Math.min(length - 1, i + 1)), Number(speed));
    return () => clearTimeout(t);
  }, [playing, index, length, speed]);
  return {
    index,
    playing,
    speed,
    reduced,
    setSpeed,
    toggle: () => {
      if (index >= length - 1) setIndex(0);
      setPlaying((p) => !p);
    },
    next: () => (setPlaying(false), setIndex((i) => Math.min(length - 1, i + 1))),
    prev: () => (setPlaying(false), setIndex((i) => Math.max(0, i - 1))),
    reset: () => (setPlaying(false), setIndex(0)),
    end: () => (setPlaying(false), setIndex(length - 1)),
    length,
  };
}

type Player = ReturnType<typeof usePlayer>;

/** Keyboard: Space plays or pauses, arrows step, Home resets, End jumps to the last step. */
function playerKeys(p: Player) {
  return (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, select, textarea, button')) return;
    if (e.key === ' ') p.toggle();
    else if (e.key === 'ArrowRight') p.next();
    else if (e.key === 'ArrowLeft') p.prev();
    else if (e.key === 'Home') p.reset();
    else if (e.key === 'End') p.end();
    else return;
    e.preventDefault();
  };
}

function Controls({ p, note }: { p: Player; note: string }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon" aria-label="Reset to the first step" onClick={p.reset} disabled={p.index === 0}>
          <ArrowCounterClockwiseIcon size={16} />
        </Button>
        <Button size="icon" aria-label="Previous step" onClick={p.prev} disabled={p.index === 0}>
          <SkipBackIcon size={16} />
        </Button>
        <Button variant="primary" onClick={p.toggle} icon={p.playing ? <PauseIcon size={16} weight="fill" /> : <PlayIcon size={16} weight="fill" />} aria-label={p.playing ? 'Pause' : 'Play'}>
          {p.playing ? 'Pause' : p.index >= p.length - 1 ? 'Replay' : 'Play'}
        </Button>
        <Button size="icon" aria-label="Next step" onClick={p.next} disabled={p.index >= p.length - 1}>
          <SkipForwardIcon size={16} />
        </Button>
        <div className="w-36">
          <Select aria-label="Speed" value={p.speed} onChange={(e) => p.setSpeed(e.target.value)}>
            {SPEEDS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <span className="ml-auto text-[13px] tabular-nums text-muted">
          Step {p.index + 1} of {p.length}
        </span>
      </div>
      <p className="min-h-[2.75rem] rounded-md bg-surface-2 px-3 py-2 text-[14px]" aria-live="polite">
        {note}
      </p>
    </div>
  );
}

function parseNumbers(text: string, max = 16): number[] | null {
  const parts = text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length || parts.length > max) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 99)) return null;
  return nums;
}

const randomArray = (n = 10) => Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 60));

function Legend({ items }: { items: { cls: string; label: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-3 text-[12.5px] text-muted" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5">
          <span className={clsx('inline-block h-3 w-3 rounded-sm', i.cls)} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function Region({ label, p, children }: { label: string; p: Player; children: ReactNode }) {
  return (
    <div tabIndex={0} role="group" aria-label={`${label}. Space plays or pauses, arrow keys step, Home resets.`} onKeyDown={playerKeys(p)} className="space-y-4 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4">
      {children}
    </div>
  );
}

// ---------- Sorting ----------

function SortingViz() {
  const [algo, setAlgo] = useState<SortAlgorithm>('bubble');
  const [text, setText] = useState('29, 10, 14, 37, 13, 5, 41, 22');
  const [values, setValues] = useState<number[]>([29, 10, 14, 37, 13, 5, 41, 22]);
  const [error, setError] = useState<string | undefined>();
  const frames = useMemo(() => sortFrames(algo, values), [algo, values]);
  const p = usePlayer(frames.length, frames);
  const f = frames[Math.min(p.index, frames.length - 1)];
  const maxV = Math.max(...f.array, 1);

  const apply = (t: string) => {
    const nums = parseNumbers(t);
    if (!nums) return setError('Enter 1 to 16 whole numbers between 0 and 99, separated by commas.');
    setError(undefined);
    setValues(nums);
  };

  return (
    <Region label="Sorting visualization" p={p}>
      <div className="grid gap-3 md:grid-cols-[200px_minmax(0,1fr)_auto] md:items-start">
        <Field label="Algorithm">
          <Select value={algo} onChange={(e) => setAlgo(e.target.value as SortAlgorithm)}>
            <option value="bubble">Bubble sort</option>
            <option value="insertion">Insertion sort</option>
            <option value="merge">Merge sort</option>
          </Select>
        </Field>
        <Field label="Array" error={error} helper="Up to 16 numbers from 0 to 99. Press Enter to apply.">
          <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply(text)} onBlur={() => apply(text)} />
        </Field>
        <Button
          className="md:mt-[26px]"
          icon={<ShuffleIcon size={16} />}
          onClick={() => {
            const r = randomArray();
            setText(r.join(', '));
            setValues(r);
            setError(undefined);
          }}
        >
          Randomize
        </Button>
      </div>
      <div className="flex h-56 items-end gap-1 rounded-md border border-border bg-surface-2 px-2 pt-3 sm:gap-1.5" role="img" aria-label={`Array: ${f.array.join(', ')}`}>
        {f.array.map((v, i) => {
          const comparing = f.compare?.includes(i);
          const swapping = f.swap?.includes(i);
          const written = f.write === i;
          const inRange = f.range ? i >= f.range[0] && i <= f.range[1] : true;
          const done = f.sorted.includes(i);
          return (
            <div key={i} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[11px] tabular-nums text-muted">{v}</span>
              <div
                className={clsx(
                  'w-full rounded-t-sm',
                  !p.reduced && 'transition-[height,background-color] duration-200',
                  swapping || written ? 'bg-danger' : comparing ? 'bg-warning' : done ? 'bg-success' : inRange ? 'bg-accent' : 'bg-surface-3',
                )}
                style={{ height: `${Math.max(4, (v / maxV) * 170)}px` }}
              />
            </div>
          );
        })}
      </div>
      <Legend
        items={[
          { cls: 'bg-warning', label: 'Comparing' },
          { cls: 'bg-danger', label: algo === 'merge' ? 'Written' : 'Swapped' },
          { cls: 'bg-success', label: 'In final place' },
          ...(algo === 'merge' ? [{ cls: 'bg-surface-3', label: 'Outside the current merge' }] : []),
        ]}
      />
      <Controls p={p} note={f.note} />
    </Region>
  );
}

// ---------- Binary search ----------

function BinarySearchViz() {
  const [text, setText] = useState('3, 8, 12, 17, 21, 26, 30, 35, 41, 47, 52, 60');
  const [values, setValues] = useState<number[]>([3, 8, 12, 17, 21, 26, 30, 35, 41, 47, 52, 60]);
  const [target, setTarget] = useState('35');
  const [error, setError] = useState<string | undefined>();
  const t = Number(target);
  const frames = useMemo(() => binarySearchFrames(values, Number.isFinite(t) ? t : 0), [values, t]);
  const p = usePlayer(frames.length, frames);
  const f = frames[Math.min(p.index, frames.length - 1)];

  const apply = (s: string) => {
    const nums = parseNumbers(s);
    if (!nums) return setError('Enter 1 to 16 whole numbers between 0 and 99.');
    setError(undefined);
    const sorted = [...nums].sort((a, b) => a - b);
    setValues(sorted);
    setText(sorted.join(', '));
  };

  return (
    <Region label="Binary search visualization" p={p}>
      <div className="grid gap-3 md:grid-cols-[1fr_140px]">
        <Field label="Array (sorted for you)" error={error} helper="Binary search needs sorted input, so the values are sorted when applied.">
          <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply(text)} onBlur={() => apply(text)} />
        </Field>
        <Field label="Target">
          <Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
      </div>
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-1.5 py-6" role="img" aria-label={`lo ${f.lo}, hi ${f.hi}${f.mid !== null ? `, mid ${f.mid}` : ''}`}>
          {values.map((v, i) => {
            const isMid = f.mid === i;
            const found = f.found === i;
            const out = f.eliminated.includes(i);
            return (
              <div key={i} className="relative flex w-11 flex-col items-center">
                <div className="absolute -top-5 flex gap-0.5 text-[10.5px] font-semibold">
                  {i === f.lo && f.lo <= f.hi && <span className="text-info">lo</span>}
                  {isMid && <span className="text-warning">mid</span>}
                  {i === f.hi && f.lo <= f.hi && <span className="text-info">hi</span>}
                </div>
                <div
                  className={clsx(
                    'flex h-11 w-11 items-center justify-center rounded-md border text-[14px] font-medium tabular-nums',
                    !p.reduced && 'transition-colors duration-200',
                    found ? 'border-success bg-success-soft text-success' : isMid ? 'border-warning bg-warning-soft text-warning' : out ? 'border-border bg-surface-2 text-subtle line-through' : 'border-border-strong bg-surface text-fg',
                  )}
                >
                  {v}
                </div>
                <span className="mt-1 text-[10.5px] tabular-nums text-subtle">{i}</span>
              </div>
            );
          })}
        </div>
      </div>
      <Legend
        items={[
          { cls: 'bg-warning', label: 'Middle element' },
          { cls: 'bg-surface-3', label: 'Ruled out' },
          { cls: 'bg-success', label: 'Found' },
        ]}
      />
      <Controls p={p} note={f.note} />
    </Region>
  );
}

// ---------- BFS on a grid ----------

const ROWS = 8;
const COLS = 12;

function BfsViz() {
  const [walls, setWalls] = useState<Set<string>>(() => new Set(['1,3', '2,3', '3,3', '4,3', '5,3', '3,6', '3,7', '3,8', '4,8', '5,8', '6,8']));
  const [start, setStart] = useState<Cell>([1, 1]);
  const [goal, setGoal] = useState<Cell>([6, 10]);
  const [mode, setMode] = useState<'wall' | 'start' | 'goal'>('wall');
  const [cursor, setCursor] = useState<Cell>([0, 0]);
  const frames = useMemo(() => bfsFrames(ROWS, COLS, walls, start, goal), [walls, start, goal]);
  const p = usePlayer(frames.length, frames);
  const f = frames[Math.min(p.index, frames.length - 1)];
  const frontier = new Set(f.frontier);
  const path = new Set(f.path);

  const act = (r: number, c: number) => {
    const k = key(r, c);
    const isStart = start[0] === r && start[1] === c;
    const isGoal = goal[0] === r && goal[1] === c;
    if (mode === 'wall') {
      if (isStart || isGoal) return;
      setWalls((w) => {
        const n = new Set(w);
        if (n.has(k)) n.delete(k);
        else n.add(k);
        return n;
      });
    } else if (!walls.has(k)) {
      if (mode === 'start' && !isGoal) setStart([r, c]);
      if (mode === 'goal' && !isStart) setGoal([r, c]);
    }
  };

  const onGridKey = (e: KeyboardEvent) => {
    const [r, c] = cursor;
    const moves: Record<string, Cell> = { ArrowUp: [Math.max(0, r - 1), c], ArrowDown: [Math.min(ROWS - 1, r + 1), c], ArrowLeft: [r, Math.max(0, c - 1)], ArrowRight: [r, Math.min(COLS - 1, c + 1)] };
    if (moves[e.key]) {
      setCursor(moves[e.key]);
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Enter' || e.key === ' ') {
      act(r, c);
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <Region label="Breadth-first search visualization" p={p}>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Grid editing mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'wall', label: 'Draw walls' },
            { value: 'start', label: 'Move start' },
            { value: 'goal', label: 'Move goal' },
          ]}
        />
        <Button size="sm" icon={<BroomIcon size={15} />} onClick={() => setWalls(new Set())} disabled={walls.size === 0} disabledReason="There are no walls to clear.">
          Clear walls
        </Button>
      </div>
      <div
        tabIndex={0}
        role="application"
        aria-label={`Grid, ${ROWS} rows by ${COLS} columns. Arrow keys move the cursor, Enter applies the current mode. Cursor at row ${cursor[0]}, column ${cursor[1]}${walls.has(key(...cursor)) ? ', wall' : ''}.`}
        onKeyDown={onGridKey}
        className="inline-grid gap-0.5 rounded-md border border-border bg-border p-0.5 focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: ROWS * COLS }).map((_, idx) => {
          const r = Math.floor(idx / COLS);
          const c = idx % COLS;
          const k = key(r, c);
          const isStart = start[0] === r && start[1] === c;
          const isGoal = goal[0] === r && goal[1] === c;
          const isCursor = cursor[0] === r && cursor[1] === c;
          const cls = isStart
            ? 'bg-accent text-on-accent'
            : isGoal
              ? 'bg-danger text-white'
              : walls.has(k)
                ? 'bg-fg'
                : path.has(k)
                  ? 'bg-success'
                  : f.current === k
                    ? 'bg-warning'
                    : frontier.has(k)
                      ? 'bg-info-soft'
                      : f.visited.has(k)
                        ? 'bg-accent-soft'
                        : 'bg-surface';
          return (
            <div
              key={k}
              onMouseDown={(e) => {
                e.preventDefault();
                setCursor([r, c]);
                act(r, c);
              }}
              className={clsx('flex h-6 w-6 cursor-pointer select-none items-center justify-center text-[10px] font-bold sm:h-8 sm:w-8', !p.reduced && 'transition-colors duration-150', cls, isCursor && 'ring-2 ring-inset ring-accent')}
              aria-hidden
            >
              {isStart ? 'S' : isGoal ? 'G' : ''}
            </div>
          );
        })}
      </div>
      <Legend
        items={[
          { cls: 'bg-accent', label: 'Start' },
          { cls: 'bg-danger', label: 'Goal' },
          { cls: 'bg-fg', label: 'Wall' },
          { cls: 'bg-warning', label: 'Visiting' },
          { cls: 'bg-info-soft', label: 'In queue' },
          { cls: 'bg-accent-soft', label: 'Visited' },
          { cls: 'bg-success', label: 'Shortest path' },
        ]}
      />
      <p className="text-[12.5px] text-muted">Queue: {f.frontier.length ? f.frontier.slice(0, 10).map((k) => `(${k})`).join(' ') + (f.frontier.length > 10 ? ` and ${f.frontier.length - 10} more` : '') : 'empty'}</p>
      <Controls p={p} note={f.note} />
    </Region>
  );
}

export default function VisualizerPage() {
  const [tab, setTab] = useState('sorting');
  const reduced = usePrefersReducedMotion();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        breadcrumb={
          <nav className="flex items-center gap-1" aria-label="Breadcrumb">
            <Link to="/app/practice" className="hover:text-fg">
              CodeLab
            </Link>
            <CaretRightIcon size={12} aria-hidden />
            <span className="text-fg">Visualizer</span>
          </nav>
        }
        title="Algorithm visualizer"
        description="Step through classic algorithms on your own input. Use the controls, or focus a visualization and press Space to play and the arrow keys to step."
      />
      {reduced && (
        <Banner tone="info" className="mb-6">
          Reduced motion is on, so steps change without animation. Autoplay still works; use Step to go at your own pace.
        </Banner>
      )}
      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: 'sorting', label: 'Sorting' },
          { value: 'binary', label: 'Binary search' },
          { value: 'bfs', label: 'BFS on a grid' },
        ]}
        className="mb-5"
      />
      <Card>
        <CardBody className="pt-5">
          {tab === 'sorting' && <SortingViz />}
          {tab === 'binary' && <BinarySearchViz />}
          {tab === 'bfs' && <BfsViz />}
        </CardBody>
      </Card>
    </div>
  );
}
