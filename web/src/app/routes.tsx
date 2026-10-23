import { createBrowserRouter, Navigate, Outlet, useLocation, useRouteError, isRouteErrorResponse, Link, type RouteObject } from 'react-router-dom';
import { useEffect } from 'react';
import { useMe } from '@/lib/session';
import { applyTheme, applyReducedMotion, getThemePref } from '@/lib/theme';
import { Button, SkeletonRows } from '@/components/ui';
import { AppShell } from './AppShell';
import { featureRoutes } from './feature-routes';

function FullPageLoading() {
  return (
    <div className="mx-auto max-w-md px-6 py-24">
      <SkeletonRows rows={4} />
    </div>
  );
}

/** Gate for /app: requires a session and a finished (or skipped) onboarding. */
function RequireAuth() {
  const { data, isLoading, error } = useMe();
  const location = useLocation();
  useEffect(() => {
    const prefs = data?.user?.preferences;
    if (prefs?.theme && prefs.theme !== getThemePref()) applyTheme(prefs.theme);
    applyReducedMotion(!!prefs?.reducedMotion);
  }, [data?.user?.preferences]);
  if (isLoading) return <FullPageLoading />;
  if (error) return <RouteError />;
  if (!data?.user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (!data.onboarded && !location.pathname.startsWith('/onboarding')) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

function RedirectIfAuthed() {
  const { data, isLoading } = useMe();
  if (isLoading) return <FullPageLoading />;
  if (data?.user) return <Navigate to="/app" replace />;
  return <Outlet />;
}

export function RouteError() {
  const err = useRouteError();
  const chunkFailed = err instanceof Error && /Failed to fetch dynamically imported module|Importing a module script failed/.test(err.message);
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="text-xl font-semibold">{isRouteErrorResponse(err) && err.status === 404 ? 'Page not found' : 'Something went wrong'}</h1>
      <p className="mt-2 text-muted">
        {chunkFailed
          ? 'A new version of LearnSphere Nexus was deployed. Reload to get it.'
          : isRouteErrorResponse(err) && err.status === 404
            ? "This page doesn't exist or was moved."
            : 'This screen failed to load. Your saved work is safe.'}
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <Button onClick={() => window.location.reload()}>Reload</Button>
        <Link to="/app" className="inline-flex h-8.5 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-on-accent">
          Go home
        </Link>
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="mt-2 text-muted">This page doesn't exist or was moved. Try the search (Ctrl/⌘ K).</p>
      <Link to="/app" className="mt-6 inline-flex h-8.5 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-on-accent">
        Go home
      </Link>
    </div>
  );
}

const lazy = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await load()).default });

const routes: RouteObject[] = [
  { path: '/', element: <Navigate to="/app" replace />, errorElement: <RouteError /> },
  {
    element: <RedirectIfAuthed />,
    errorElement: <RouteError />,
    children: [
      { path: '/login', lazy: lazy(() => import('@/features/auth/LoginPage')) },
      { path: '/register', lazy: lazy(() => import('@/features/auth/RegisterPage')) },
      { path: '/forgot-password', lazy: lazy(() => import('@/features/auth/ForgotPasswordPage')) },
    ],
  },
  { path: '/reset-password', lazy: lazy(() => import('@/features/auth/ResetPasswordPage')), errorElement: <RouteError /> },
  { path: '/invite/:token', lazy: lazy(() => import('@/features/auth/InvitePage')), errorElement: <RouteError /> },
  // Public, no-account pages (portfolio share links, certificate verification, job feed).
  { path: '/p/:slug', lazy: lazy(() => import('@/features/portfolio/PublicPortfolioPage')), errorElement: <RouteError /> },
  { path: '/verify/:code', lazy: lazy(() => import('@/features/portfolio/VerifyCertificatePage')), errorElement: <RouteError /> },
  { path: '/jobs/feed', lazy: lazy(() => import('@/features/jobs/PublicFeedPage')), errorElement: <RouteError /> },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      { path: '/onboarding', lazy: lazy(() => import('@/features/onboarding/OnboardingPage')) },
      {
        path: '/app',
        element: <AppShell />,
        errorElement: <RouteError />,
        children: [...featureRoutes, { path: '*', element: <NotFound /> }],
      },
    ],
  },
  { path: '*', element: <NotFound /> },
];

export const router = createBrowserRouter(routes);
