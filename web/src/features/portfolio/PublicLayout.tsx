import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CompassIcon, LinkBreakIcon } from '@phosphor-icons/react';

/** Chrome for public, no-account pages: brand bar, centered content, honest footer. */
export function PublicLayout({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="border-b border-border bg-surface/80 backdrop-blur">
        <div className={`mx-auto flex h-14 items-center justify-between px-4 sm:px-6 ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}>
          <Link to="/" className="inline-flex items-center gap-2 text-[14px] font-semibold">
            <CompassIcon size={20} weight="duotone" className="text-accent-text" aria-hidden />
            LearnSphere Nexus
          </Link>
        </div>
      </header>
      <main className={`mx-auto px-4 py-8 sm:px-6 sm:py-12 ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}>{children}</main>
      <footer className="border-t border-border py-6 text-center text-[12px] text-subtle">
        Evidence is labeled by where it came from. Platform completion records are not accredited qualifications.
      </footer>
    </div>
  );
}

export function PublicNotFound({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
        <LinkBreakIcon size={24} />
      </div>
      <h1 className="font-display text-[22px] font-semibold tracking-[-0.02em]">{title}</h1>
      <p className="mt-2 text-[14px] text-muted">{description}</p>
    </div>
  );
}
