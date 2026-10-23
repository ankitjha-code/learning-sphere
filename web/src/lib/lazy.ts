import type { ComponentType } from 'react';

/** Route-level code splitting: `lazy: page(() => import('./SomePage'))`. */
export const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({ Component: (await load()).default });
