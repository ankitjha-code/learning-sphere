export type ThemePref = 'light' | 'dark' | 'system';

export function getThemePref(): ThemePref {
  try {
    return (localStorage.getItem('ls-theme') as ThemePref) || 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(pref: ThemePref) {
  try {
    localStorage.setItem('ls-theme', pref);
  } catch {
    /* storage blocked: theme still applies for this page view */
  }
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function applyReducedMotion(on: boolean) {
  document.documentElement.dataset.reducedMotion = on ? 'true' : 'false';
}

if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemePref() === 'system') applyTheme('system');
  });
}

export function usePersisted<T>(key: string, fallback: T): [T, (v: T) => void] {
  let initial = fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw) initial = JSON.parse(raw) as T;
  } catch {
    /* ignore */
  }
  return [
    initial,
    (v: T) => {
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* ignore */
      }
    },
  ];
}
