import { NavLink, Outlet } from 'react-router-dom';
import clsx from 'clsx';
import { UserCircleIcon, SlidersHorizontalIcon, BellIcon, CalendarIcon, LockKeyIcon, ShieldCheckIcon, type Icon } from '@phosphor-icons/react';
import { PageHeader } from '@/components/ui';

const NAV: { to: string; label: string; icon: Icon }[] = [
  { to: '/app/settings/profile', label: 'Profile', icon: UserCircleIcon },
  { to: '/app/settings/preferences', label: 'Preferences', icon: SlidersHorizontalIcon },
  { to: '/app/settings/notifications', label: 'Notifications', icon: BellIcon },
  { to: '/app/settings/calendar', label: 'Calendar', icon: CalendarIcon },
  { to: '/app/settings/security', label: 'Security', icon: LockKeyIcon },
  { to: '/app/settings/privacy', label: 'Privacy', icon: ShieldCheckIcon },
];

/** Shared frame for every settings page: side nav on desktop, horizontal scrolling nav on mobile. */
export default function SettingsLayout() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Settings" description="Manage your profile, preferences, notifications, calendar sync, security and personal data." />
      <div className="flex flex-col gap-6 md:flex-row">
        <nav aria-label="Settings sections" className="md:w-52 md:shrink-0">
          <ul className="-mx-1 flex gap-1 overflow-x-auto pb-1 md:mx-0 md:flex-col md:overflow-visible md:pb-0">
            {NAV.map((it) => (
              <li key={it.to} className="shrink-0">
                <NavLink
                  to={it.to}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13.5px] font-medium transition-colors',
                      isActive ? 'bg-accent-soft text-accent-text' : 'text-muted hover:bg-surface-2 hover:text-fg',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <it.icon size={17} weight={isActive ? 'fill' : 'regular'} aria-hidden />
                      {it.label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
