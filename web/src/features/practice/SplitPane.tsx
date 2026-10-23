import { useCallback, useEffect, useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import clsx from 'clsx';

function readStored(key: string, fallback: number) {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Two resizable panes with a draggable, keyboard-accessible divider (arrow keys move it,
 * Home/End jump to the limits). The split is remembered per `storageKey` in this browser.
 */
export function SplitPane({
  direction,
  first,
  second,
  storageKey,
  initial = 50,
  min = 20,
  max = 80,
  label,
  className,
}: {
  direction: 'horizontal' | 'vertical';
  first: ReactNode;
  second: ReactNode;
  storageKey: string;
  initial?: number;
  min?: number;
  max?: number;
  label: string;
  className?: string;
}) {
  const [pct, setPct] = useState(() => Math.min(max, Math.max(min, readStored(storageKey, initial))));
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const horizontal = direction === 'horizontal';

  const update = useCallback(
    (v: number) => {
      const next = Math.min(max, Math.max(min, v));
      setPct(next);
      try {
        localStorage.setItem(storageKey, String(Math.round(next)));
      } catch {
        /* storage blocked: the split still works for this visit */
      }
    },
    [max, min, storageKey],
  );

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragging.current || !box.current) return;
      const r = box.current.getBoundingClientRect();
      update(horizontal ? ((e.clientX - r.left) / r.width) * 100 : ((e.clientY - r.top) / r.height) * 100);
    };
    const up = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [horizontal, update]);

  const onKey = (e: KeyboardEvent) => {
    const dec = horizontal ? 'ArrowLeft' : 'ArrowUp';
    const inc = horizontal ? 'ArrowRight' : 'ArrowDown';
    if (e.key === dec) update(pct - 5);
    else if (e.key === inc) update(pct + 5);
    else if (e.key === 'Home') update(min);
    else if (e.key === 'End') update(max);
    else return;
    e.preventDefault();
  };

  return (
    <div ref={box} className={clsx('flex min-h-0 min-w-0', horizontal ? 'flex-row' : 'flex-col', className)}>
      <div className="min-h-0 min-w-0 overflow-hidden" style={{ flexBasis: `${pct}%`, flexGrow: 0, flexShrink: 0 }}>
        {first}
      </div>
      <div
        role="separator"
        tabIndex={0}
        aria-label={label}
        aria-orientation={horizontal ? 'vertical' : 'horizontal'}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={min}
        aria-valuemax={max}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          e.preventDefault();
          dragging.current = true;
          document.body.style.userSelect = 'none';
          document.body.style.cursor = horizontal ? 'col-resize' : 'row-resize';
        }}
        className={clsx(
          'group relative shrink-0 bg-transparent focus-visible:outline-2 focus-visible:outline-offset-0',
          horizontal ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize',
        )}
      >
        <span className={clsx('absolute rounded-full bg-border transition-colors group-hover:bg-accent group-focus-visible:bg-accent', horizontal ? 'inset-y-0 left-1/2 w-px -translate-x-1/2' : 'inset-x-0 top-1/2 h-px -translate-y-1/2')} />
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{second}</div>
    </div>
  );
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatches(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return matches;
}

/** True when the user (OS setting or app preference) asked for less motion. */
export function usePrefersReducedMotion() {
  const os = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [app, setApp] = useState(() => typeof document !== 'undefined' && document.documentElement.dataset.reducedMotion === 'true');
  useEffect(() => {
    const obs = new MutationObserver(() => setApp(document.documentElement.dataset.reducedMotion === 'true'));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduced-motion'] });
    return () => obs.disconnect();
  }, []);
  return os || app;
}
