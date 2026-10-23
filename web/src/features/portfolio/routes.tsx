import type { RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

/** /app/portfolio routes. The public pages (/p/:slug, /verify/:code) are registered in app/routes.tsx. */
export const routes: RouteObject[] = [
  { path: 'portfolio', lazy: page(() => import('./PortfolioEditorPage')) },
  { path: 'portfolio/print', lazy: page(() => import('./PortfolioPrintPage')) },
];
