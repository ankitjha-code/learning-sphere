import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DnaIcon, HammerIcon, BriefcaseIcon, ExamIcon } from '@phosphor-icons/react';

const POINTS = [
  { icon: DnaIcon, title: 'Skill DNA', body: 'Every lesson, test, project and review adds evidence to one living map of what you can do.' },
  { icon: HammerIcon, title: 'Learn, build, get hired', body: 'A weak skill leads to focused practice, then a project, then portfolio proof and relevant roles.' },
  { icon: ExamIcon, title: 'One assessment engine', body: 'The same trusted grading powers practice, college exams and recruiter screening.' },
  { icon: BriefcaseIcon, title: 'Honest by design', body: 'AI suggestions, self-reported skills and verified results are always labeled for what they are.' },
];

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className="relative hidden overflow-hidden bg-[#0d1020] text-white lg:block">
        <div className="sticky top-0 flex h-dvh flex-col px-14 py-12">
          {/* Dot grid + a single cobalt glow: the rail's identity, at poster scale. */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.55] [background-image:radial-gradient(rgb(255_255_255/0.09)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_30%_40%,black,transparent_75%)]"
            aria-hidden
          />
          <div className="pointer-events-none absolute -left-40 top-1/4 h-[520px] w-[520px] rounded-full bg-[#2f4fd6]/35 blur-[120px]" aria-hidden />
          <Link to="/" className="relative flex items-center gap-3">
            <img src="/favicon.svg" alt="" width={34} height={34} className="rounded-[10px]" />
            <span className="font-display text-[18px] font-semibold tracking-[-0.02em]">
              LearnSphere <span className="text-[#9fb0ff]">Nexus</span>
            </span>
          </Link>
          <div className="relative my-auto max-w-xl py-10">
            <h2 className="font-display text-[44px] font-semibold leading-[1.05] tracking-[-0.035em] xl:text-[52px]">
              From a goal to a job offer, <span className="text-[#9fb0ff]">in one connected workspace.</span>
            </h2>
            <ul className="mt-12 grid gap-x-8 gap-y-7 xl:grid-cols-2">
              {POINTS.map((p) => (
                <li key={p.title} className="flex gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.07] text-[#9fb0ff] ring-1 ring-inset ring-white/10">
                    <p.icon size={20} weight="duotone" />
                  </span>
                  <span>
                    <span className="block text-[15px] font-semibold">{p.title}</span>
                    <span className="mt-0.5 block text-[13.5px] leading-relaxed text-white/65">{p.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="relative text-[12.5px] text-white/55">Built on free and open tools. Works without any AI provider.</p>
        </div>
      </section>
      <section className="flex justify-center px-4 py-12 sm:px-8 lg:py-16">
        <div className="w-full max-w-[420px] lg:pt-[6vh]">
          <Link to="/" className="mb-10 flex items-center gap-2.5 lg:hidden">
            <img src="/favicon.svg" alt="" width={30} height={30} className="rounded-[8px]" />
            <span className="font-display text-[17px] font-semibold tracking-[-0.02em]">LearnSphere Nexus</span>
          </Link>
          <h1 className="font-display text-[30px] font-semibold leading-tight tracking-[-0.025em]">{title}</h1>
          {subtitle && <p className="mt-2 text-[14.5px] text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-[13.5px] text-muted">{footer}</div>}
        </div>
      </section>
    </div>
  );
}
