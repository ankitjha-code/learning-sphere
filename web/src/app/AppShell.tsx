import { useEffect, useState, Suspense } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import clsx from 'clsx';
import { Dialog as RDialog } from 'radix-ui';
import {
  ListIcon,
  MagnifyingGlassIcon,
  SparkleIcon,
  CaretUpDownIcon,
  CheckIcon,
  SignOutIcon,
  GearSixIcon,
  SunIcon,
  MoonIcon,
  DesktopIcon,
  XIcon,
  FlaskIcon,
  CreditCardIcon,
} from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { WORKSPACE_LABELS, ROLE_LABELS, type Workspace } from '@shared/roles';
import { useSession, useSwitchWorkspace } from '@/lib/session';
import { api } from '@/lib/api';
import { applyTheme, getThemePref, type ThemePref } from '@/lib/theme';
import { Avatar, Kbd, Menu, Popover, PopoverClose, Badge, SkeletonRows, Tooltip } from '@/components/ui';
import { NAV, WORKSPACE_HOME, WORKSPACE_ICON, workspaceForPath } from './nav';
import { CommandPalette } from './CommandPalette';
import { NotificationsBell } from './NotificationsBell';
import { StatusBanner } from '@/features/admin/StatusBanner';

function Brand() {
  return (
    <Link to="/app" className="flex items-center gap-2.5 rounded-md px-1 py-1" aria-label="LearnSphere Nexus home">
      <img src="/favicon.svg" alt="" width={28} height={28} className="rounded-[8px]" />
      <span className="font-display text-[16px] font-semibold tracking-[-0.02em] text-rail-strong">
        LearnSphere <span className="text-rail-accent">Nexus</span>
      </span>
    </Link>
  );
}

function WorkspaceSwitcher({ onDone }: { onDone?: () => void }) {
  const me = useSession();
  const sw = useSwitchWorkspace();
  const navigate = useNavigate();
  const Icon = WORKSPACE_ICON[me.workspace];

  async function choose(v: { orgId?: string | null; workspace?: Workspace }) {
    const r = await sw.mutateAsync(v);
    navigate(WORKSPACE_HOME[r.workspace]);
    onDone?.();
  }

  return (
    <Popover
      align="start"
      className="w-72 p-1.5"
      trigger={
        <button
          className="flex w-full items-center gap-3 rounded-md border border-rail-border bg-rail-2 px-2.5 py-2 text-left transition-colors hover:border-rail-3 hover:bg-rail-3 focus-visible:outline-rail-accent"
        >
          <span className="sr-only">Switch workspace or organization. Current:</span>
          <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-accent text-white shadow-accent dark:text-on-accent">
            <Icon size={17} weight="fill" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold text-rail-strong">{WORKSPACE_LABELS[me.workspace].label}</span>
            <span className="block truncate text-[12px] text-rail-muted">{me.activeOrg?.orgName ?? 'Personal'}</span>
          </span>
          <CaretUpDownIcon size={14} className="text-rail-muted" />
        </button>
      }
    >
      <div className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">Workspaces</div>
      {me.workspaces.map((w) => {
        const WIcon = WORKSPACE_ICON[w];
        return (
          <PopoverClose asChild key={w}>
            <button
              onClick={() => choose({ workspace: w })}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-2"
            >
              <WIcon size={16} className="text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">{WORKSPACE_LABELS[w].label}</span>
                <span className="block truncate text-[11.5px] text-muted">{WORKSPACE_LABELS[w].description}</span>
              </span>
              {w === me.workspace && <CheckIcon size={14} className="text-accent-text" />}
            </button>
          </PopoverClose>
        );
      })}
      {me.memberships.length > 0 && (
        <>
          <div className="mx-1 my-1.5 h-px bg-border" />
          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">Organization</div>
          <PopoverClose asChild>
            <button onClick={() => choose({ orgId: null, workspace: 'learner' })} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2">
              <span className="flex-1">Personal (no organization)</span>
              {!me.activeOrg && <CheckIcon size={14} className="text-accent-text" />}
            </button>
          </PopoverClose>
          {me.memberships.map((m) => (
            <PopoverClose asChild key={m.orgId}>
              <button onClick={() => choose({ orgId: m.orgId })} className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[13px] font-medium">
                    <span className="truncate">{m.orgName}</span>
                    {m.isSample && <Badge tone="warning">Sample</Badge>}
                  </span>
                  <span className="block truncate text-[11.5px] text-muted">{m.roles.map((r) => ROLE_LABELS[r]).join(', ')}</span>
                </span>
                {me.activeOrg?.orgId === m.orgId && <CheckIcon size={14} className="mt-0.5 text-accent-text" />}
              </button>
            </PopoverClose>
          ))}
        </>
      )}
      <p className="px-2 pb-1 pt-2 text-[11.5px] text-subtle">Switching changes what you see. Your permissions always come from your role in the selected organization.</p>
    </Popover>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const me = useSession();
  const groups = NAV[me.workspace];
  return (
    <div className="rail-glow flex h-full flex-col text-rail-text">
      <div className="flex h-[60px] shrink-0 items-center border-b border-rail-border px-4">
        <Brand />
      </div>
      <div className="px-3 pb-2 pt-4">
        <WorkspaceSwitcher onDone={onNavigate} />
      </div>
      <nav className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2" aria-label="Main">
        {groups.map((g, gi) => (
          <div key={gi} className={clsx(gi > 0 && 'mt-5')}>
            {g.label && <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-rail-muted">{g.label}</div>}
            <ul className="space-y-px">
              {g.items.map((it) => (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    end={it.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      clsx(
                        'group relative flex h-9 items-center gap-3 rounded-md px-3 text-[13.5px] font-medium transition-colors focus-visible:outline-rail-accent',
                        isActive ? 'bg-rail-3 text-rail-strong' : 'text-rail-text hover:bg-rail-2 hover:text-rail-strong',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute inset-y-2 -left-3 w-[3px] rounded-r-full bg-rail-accent" aria-hidden />}
                        <it.icon size={18} weight={isActive ? 'fill' : 'regular'} className={isActive ? 'text-rail-accent' : 'text-rail-muted group-hover:text-rail-text'} />
                        <span className="truncate">{it.label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {me.activeOrg?.isSample && (
        <div className="mx-3 mb-3 flex items-start gap-2.5 rounded-md border border-rail-border bg-rail-2 px-3 py-2.5 text-[12px] leading-snug text-rail-text">
          <FlaskIcon size={16} weight="fill" className="mt-px shrink-0 text-[#fbbf24]" aria-hidden />
          <span>
            <strong className="font-semibold text-rail-strong">{me.activeOrg.orgName}</strong> is a sample organization. Its records are demonstration data.
          </span>
        </div>
      )}
    </div>
  );
}

function ThemeMenu() {
  const [pref, setPref] = useState<ThemePref>(getThemePref());
  const Icon = pref === 'dark' ? MoonIcon : pref === 'light' ? SunIcon : DesktopIcon;
  const set = (p: ThemePref) => {
    setPref(p);
    applyTheme(p);
    api.patch('/me/preferences', { theme: p }).catch(() => {});
  };
  return (
    <Menu
      label="Theme"
      trigger={
        <button className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-3/60 hover:text-fg" aria-label={`Theme: ${pref}`}>
          <Icon size={18} />
        </button>
      }
      items={[
        { label: 'Light', icon: <SunIcon size={16} />, onSelect: () => set('light') },
        { label: 'Dark', icon: <MoonIcon size={16} />, onSelect: () => set('dark') },
        { label: 'System', icon: <DesktopIcon size={16} />, onSelect: () => set('system') },
      ]}
    />
  );
}

function UserMenu() {
  const me = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  return (
    <Menu
      label="Account"
      trigger={
        <button className="ml-1.5 inline-flex items-center gap-2 rounded-full p-0.5 ring-1 ring-border transition-shadow hover:ring-border-strong" aria-label="Account menu">
          <Avatar name={me.user.name} color={(me.user as { avatarColor?: string }).avatarColor} size={30} />
        </button>
      }
      items={[
        { label: me.user.email, onSelect: () => navigate('/app/settings'), disabled: true },
        'separator',
        { label: 'Settings', icon: <GearSixIcon size={16} />, onSelect: () => navigate('/app/settings') },
        { label: 'Plan & billing', icon: <CreditCardIcon size={16} />, onSelect: () => navigate('/app/billing') },
        {
          label: 'Sign out',
          icon: <SignOutIcon size={16} />,
          onSelect: async () => {
            await api.post('/auth/logout');
            qc.clear();
            navigate('/login');
          },
        },
      ]}
    />
  );
}

export function AppShell() {
  const me = useSession();
  const location = useLocation();
  const sw = useSwitchWorkspace();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Deep links into another workspace switch the sidebar (only if the server allows it).
  useEffect(() => {
    const target = workspaceForPath(location.pathname) ?? (me.workspace === 'career' && location.pathname.startsWith('/app/jobs') ? 'career' : null);
    const learnerPath = !target && /^\/app(\/(skills|learn|library|practice|assessments|assignments|projects|portfolio|ai|mentors|community|goals|workspace))?(\/|$)/.test(location.pathname);
    const want: Workspace | null = target ?? (learnerPath && me.workspace !== 'learner' && !location.pathname.startsWith('/app/settings') && !location.pathname.startsWith('/app/notifications') ? 'learner' : null);
    if (want && want !== me.workspace && me.workspaces.includes(want) && !sw.isPending) sw.mutate({ workspace: want });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="flex min-h-dvh bg-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-2">
        Skip to content
      </a>

      {/* The rail paints the full page height; its content stays pinned to the viewport. */}
      <aside className="hidden w-[256px] shrink-0 border-r border-rail-border bg-rail lg:block">
        <div className="sticky top-0 h-dvh">
          <SidebarContent />
        </div>
      </aside>

      <RDialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <RDialog.Portal>
          <RDialog.Overlay className="fixed inset-0 z-50 bg-[#0d1020]/50 backdrop-blur-[2px] lg:hidden" />
          <RDialog.Content className="fixed inset-y-0 left-0 z-50 w-[284px] max-w-[85vw] bg-rail shadow-3 lg:hidden" aria-describedby={undefined}>
            <RDialog.Title className="sr-only">Navigation</RDialog.Title>
            <RDialog.Close className="absolute right-3 top-3.5 z-10 rounded-md p-1.5 text-rail-muted hover:bg-rail-2 hover:text-rail-strong" aria-label="Close navigation">
              <XIcon size={18} />
            </RDialog.Close>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </RDialog.Content>
        </RDialog.Portal>
      </RDialog.Root>

      <div className="canvas flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[60px] items-center gap-2 border-b border-border bg-bg/80 px-3 backdrop-blur-md backdrop-saturate-150 sm:px-6 lg:px-10">
          <button className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-3/60 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <ListIcon size={20} />
          </button>
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-md border border-border bg-surface px-3 text-left text-[13.5px] text-subtle shadow-1 transition-colors hover:border-border-strong sm:max-w-[420px]"
          >
            <MagnifyingGlassIcon size={16} />
            <span className="flex-1 truncate">Search or jump to…</span>
            <span className="hidden items-center gap-0.5 sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
          <div className="ml-auto flex items-center gap-0.5">
            <Tooltip content="Ask the AI Council">
              <Link to="/app/ai" className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[13.5px] font-medium text-accent-text transition-colors hover:bg-accent-soft">
                <SparkleIcon size={17} weight="fill" aria-hidden />
                <span className="sr-only md:not-sr-only">Ask AI</span>
              </Link>
            </Tooltip>
            <NotificationsBell />
            <ThemeMenu />
            <UserMenu />
          </div>
        </header>

        <main id="main" className="relative mx-auto w-full max-w-[1320px] flex-1 px-4 pb-16 pt-8 sm:px-6 lg:px-10">
          <div className="mb-4 empty:mb-0">
            <StatusBanner />
          </div>
          <Suspense fallback={<SkeletonRows rows={6} />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
