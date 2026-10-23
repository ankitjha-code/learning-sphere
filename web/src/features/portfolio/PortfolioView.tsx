import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  SealCheckIcon,
  ArrowSquareOutIcon,
  GithubLogoIcon,
  GlobeIcon,
  MapPinIcon,
  CertificateIcon,
  TrophyIcon,
  PenNibIcon,
  BriefcaseIcon,
  GraduationCapIcon,
  ChartBarIcon,
  HammerIcon,
  UserIcon,
  ClipboardTextIcon,
} from '@phosphor-icons/react';
import { Avatar, Badge, Markdown, Progress } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { ComposedPortfolio, PortfolioProject, PortfolioSkill, SectionKey } from './types';

export function VerificationBadge({ p }: { p: Pick<PortfolioProject, 'verification' | 'reviewerName'> }) {
  if (p.verification === 'verified_by_reviewer')
    return (
      <Badge tone="success" icon={<SealCheckIcon size={12} weight="fill" />}>
        Verified by reviewer{p.reviewerName ? `: ${p.reviewerName}` : ''}
      </Badge>
    );
  if (p.verification === 'self_completed') return <Badge tone="neutral">Self-completed, not reviewed</Badge>;
  return <Badge tone="info">In progress</Badge>;
}

const PROV: Record<
  PortfolioSkill['provenance'],
  {
    title: string;
    tone: 'success' | 'info' | 'neutral' | 'warning';
    help: string;
  }
> = {
  verified: {
    title: 'Verified skills',
    tone: 'success',
    help: 'Produced by deterministic grading or confirmed by an authorized human reviewer.',
  },
  demonstrated: {
    title: 'Demonstrated',
    tone: 'info',
    help: 'Shown through practice, quizzes or self-completed projects. Not independently verified.',
  },
  learning: {
    title: 'Currently learning',
    tone: 'neutral',
    help: 'Early evidence; not yet a demonstrated level.',
  },
  self_reported: {
    title: 'Self-reported',
    tone: 'warning',
    help: 'Stated by the person. Nobody has checked it.',
  },
};

const ICONS: Record<SectionKey, typeof HammerIcon> = {
  projects: HammerIcon,
  skills: ChartBarIcon,
  assessments: ClipboardTextIcon,
  achievements: TrophyIcon,
  writing: PenNibIcon,
  experience: BriefcaseIcon,
  education: GraduationCapIcon,
};

function Section({ k, label, children, note }: { k: SectionKey; label: string; children: React.ReactNode; note?: React.ReactNode }) {
  const Icon = ICONS[k];
  return (
    <section aria-labelledby={`sec-${k}`} className="break-inside-avoid-page">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id={`sec-${k}`} className="flex items-center gap-2.5 text-[16px] font-semibold leading-6 tracking-[-0.01em]">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent-text">
            <Icon size={16} aria-hidden />
          </span>
          {label}
        </h2>
        {note && <span className="text-[12.5px] text-subtle">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function ProjectCard({ p, print }: { p: PortfolioProject; print?: boolean }) {
  return (
    <article className="flex h-full flex-col rounded-lg border border-border bg-surface p-5 shadow-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <VerificationBadge p={p} />
        {p.featured && <Badge tone="accent">Featured</Badge>}
      </div>
      <h3 className="mt-3 text-[16px] font-semibold leading-snug tracking-[-0.01em]">{p.title}</h3>
      {p.summary && <p className="mt-1.5 max-w-[80ch] text-[13.5px] leading-relaxed text-muted">{p.summary}</p>}
      {p.skills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {p.skills.slice(0, 8).map((s) => (
            <Badge key={s}>{s}</Badge>
          ))}
        </div>
      )}
      {(p.demoUrl || p.repoUrl || (p.publicPath && !print) || p.completedAt) && (
        <div className="mt-auto pt-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3.5 text-[13px]">
            {p.demoUrl && (
              <a href={p.demoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-text hover:underline">
                <GlobeIcon size={14} /> Demo{print && `: ${p.demoUrl}`}
              </a>
            )}
            {p.repoUrl && (
              <a href={p.repoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-text hover:underline">
                <GithubLogoIcon size={14} /> Code{print && `: ${p.repoUrl}`}
              </a>
            )}
            {p.publicPath && !print && (
              <Link to={p.publicPath} className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline">
                Case study <ArrowSquareOutIcon size={12} />
              </Link>
            )}
            {p.completedAt && <span className="ml-auto text-[12px] text-subtle">{formatDate(p.completedAt)}</span>}
          </div>
        </div>
      )}
    </article>
  );
}

/** One bordered panel split into cells by 1px dividers; an odd last cell is padded so no hole shows. */
const cellGrid = 'grid gap-px overflow-hidden rounded-lg border border-border bg-border shadow-1 sm:grid-cols-2';
const listGroup = 'divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1';

function SkillGroups({ skills, print }: { skills: PortfolioSkill[]; print?: boolean }) {
  const groups = (['verified', 'demonstrated', 'learning', 'self_reported'] as const).map((k) => ({ k, items: skills.filter((s) => s.provenance === k) })).filter((g) => g.items.length);
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.k}>
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <Badge tone={PROV[g.k].tone} icon={g.k === 'verified' ? <SealCheckIcon size={12} weight="fill" /> : undefined}>
              {PROV[g.k].title}
            </Badge>
            <span className="text-[12px] text-subtle">{PROV[g.k].help}</span>
          </div>
          <ul className={g.items.length > 1 ? cellGrid : listGroup}>
            {g.items.map((s) => (
              <li key={s.skillId} className="bg-surface px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[14px] font-medium">{s.name}</span>
                  {s.mastery !== null && g.k !== 'self_reported' && <span className="text-[13px] font-semibold tabular-nums">{Math.round(s.mastery * 100)}%</span>}
                </div>
                {s.mastery !== null && g.k !== 'self_reported' && (
                  <Progress value={Math.round(s.mastery * 100)} tone={g.k === 'verified' ? 'success' : 'accent'} className="mt-2" label={`${s.name} mastery`} />
                )}
                <div className="mt-2 text-[12px] text-subtle">
                  {g.k === 'verified' && s.lastVerifiedAt ? `Last verified ${formatDate(s.lastVerifiedAt)}` : s.lastEvidenceAt ? `Last evidence ${formatDate(s.lastEvidenceAt)}` : 'No dated evidence'}
                  {' · '}
                  {s.evidenceCount} {s.evidenceCount === 1 ? 'record' : 'records'}
                </div>
                {!print && s.history.length > 0 && (
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-[12.5px] font-medium text-accent-text">Proficiency history</summary>
                    <ul className="mt-1 space-y-0.5 text-[12px] text-muted">
                      {s.history.map((h, i) => (
                        <li key={i} className="flex justify-between gap-2">
                          <span>
                            {formatDate(h.at)} · {h.sourceLabel}
                            {h.verified && <SealCheckIcon size={11} weight="fill" className="ml-1 inline text-success" aria-label="verified" />}
                          </span>
                          <span className="tabular-nums">{Math.round(h.score * 100)}%</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
            {g.items.length > 1 && g.items.length % 2 === 1 && <li aria-hidden className="hidden bg-surface sm:block" />}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Read-only portfolio layout shared by the public page, owner preview and print view. */
export function PortfolioView({ v, print }: { v: ComposedPortfolio; print?: boolean }) {
  const has: Record<SectionKey, boolean> = {
    projects: v.projects.length > 0,
    skills: v.skills.length > 0,
    assessments: v.assessments.length > 0,
    achievements: v.achievements.length + v.certificates.length > 0,
    writing: v.writing.length > 0,
    experience: v.experience.length > 0,
    education: v.education.length > 0,
  };
  const shown = v.sections.filter((s) => s.visible && has[s.key]);
  return (
    <div className={clsx('space-y-10', print && 'space-y-7')}>
      <header className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <Avatar name={v.owner.name} color={v.owner.avatarColor} size={print ? 56 : 72} />
        <div className="min-w-0">
          <h1 className="font-display text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[32px]">{v.owner.name}</h1>
          {v.portfolio.headline && <p className="mt-1 text-[16px] text-muted">{v.portfolio.headline}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-muted">
            {v.owner.location && (
              <span className="inline-flex items-center gap-1">
                <MapPinIcon size={14} /> {v.owner.location}
              </span>
            )}
            {v.owner.links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-text hover:underline">
                {l.label}
                {print ? `: ${l.url}` : <ArrowSquareOutIcon size={12} />}
              </a>
            ))}
          </div>
        </div>
      </header>
      {v.portfolio.about && (
        <section aria-label="About" className="max-w-3xl">
          <Markdown source={v.portfolio.about} className="text-[15px] leading-relaxed" />
        </section>
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border border-border bg-surface px-4 py-3 text-[12.5px] text-muted shadow-1">
        <span className="font-medium text-fg">How to read this page:</span>
        <Badge tone="success" icon={<SealCheckIcon size={12} weight="fill" />}>
          Verified by reviewer
        </Badge>
        <span>an authorized human checked it;</span>
        <Badge tone="info">Graded assessment</Badge>
        <span>scored by a grader;</span>
        <Badge tone="warning">Self-reported</Badge>
        <span>stated by the person, not checked.</span>
      </div>
      {!shown.length && (
        <p className="rounded-lg border border-dashed border-border-strong/70 p-8 text-center text-[14px] text-muted">
          <UserIcon size={20} className="mx-auto mb-2" aria-hidden />
          Nothing has been added to this portfolio yet.
        </p>
      )}
      {shown.map((s) => {
        switch (s.key) {
          case 'projects':
            return (
              <Section key={s.key} k={s.key} label={s.label}>
                <div className={clsx('grid gap-4', v.projects.length > 1 && 'md:grid-cols-2')}>
                  {v.projects.map((p) => (
                    <ProjectCard key={p.id} p={p} print={print} />
                  ))}
                </div>
              </Section>
            );
          case 'skills':
            return (
              <Section key={s.key} k={s.key} label={s.label} note="Mastery is an estimate from weighted, time-decayed evidence">
                <SkillGroups skills={v.skills} print={print} />
              </Section>
            );
          case 'assessments':
            return (
              <Section key={s.key} k={s.key} label={s.label} note="Only results the person chose to show">
                <ul className={v.assessments.length > 1 ? cellGrid : listGroup}>
                  {v.assessments.map((a) => (
                    <li key={a.attemptId} className="flex items-center justify-between gap-3 bg-surface px-5 py-4">
                      <div className="min-w-0">
                        <div className="text-[14px] font-medium">{a.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-subtle">
                          <Badge tone="info">Graded assessment</Badge> {a.at && formatDate(a.at)}
                        </div>
                      </div>
                      <span className="font-display text-[22px] font-semibold tabular-nums">{a.scorePercent}%</span>
                    </li>
                  ))}
                  {v.assessments.length > 1 && v.assessments.length % 2 === 1 && <li aria-hidden className="hidden bg-surface sm:block" />}
                </ul>
              </Section>
            );
          case 'achievements':
            return (
              <Section key={s.key} k={s.key} label={s.label}>
                <ul className={listGroup}>
                  {v.certificates.map((c) => (
                    <li key={c.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
                      <span
                        className={clsx(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                          c.kind === 'platform_completion' ? 'bg-accent-soft text-accent-text' : 'bg-surface-2 text-subtle',
                        )}
                      >
                        <CertificateIcon size={18} aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-medium">{c.title}</div>
                        <div className="text-[12px] text-muted">
                          {c.issuer} · {formatDate(c.issuedAt)}
                        </div>
                        <div className="text-[12px] text-subtle">{c.label}</div>
                      </div>
                      {c.kind === 'platform_completion' && c.verificationCode ? (
                        print ? (
                          <span className="text-[12px] text-muted">Verify: /verify/{c.verificationCode}</span>
                        ) : (
                          <Link to={`/verify/${c.verificationCode}`} className="text-[12.5px] font-medium text-accent-text hover:underline">
                            Verify record
                          </Link>
                        )
                      ) : (
                        <div className="flex items-center gap-2">
                          <Badge tone="warning">Self-reported</Badge>
                          {c.credentialUrl && (
                            <a href={c.credentialUrl} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-accent-text hover:underline">
                              Issuer link
                            </a>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                  {v.achievements.map((a) => (
                    <li key={a.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-warning-soft text-xp">
                        <TrophyIcon size={18} aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-medium">{a.title}</div>
                        {a.description && <div className="mt-0.5 text-[12.5px] text-muted">{a.description}</div>}
                      </div>
                      <span className="text-[12px] text-subtle sm:text-right">Earned on the platform {formatDate(a.awardedAt)}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            );
          case 'writing':
            return (
              <Section key={s.key} k={s.key} label={s.label}>
                <ul className={listGroup}>
                  {v.writing.map((w, i) => (
                    <li key={i} className="px-5 py-4">
                      <a href={w.url} target="_blank" rel="noopener noreferrer" className="text-[14.5px] font-medium text-accent-text hover:underline">
                        {w.title}
                      </a>
                      {print && <span className="text-[12px] text-muted"> ({w.url})</span>}
                      {w.summary && <p className="mt-0.5 text-[13px] text-muted">{w.summary}</p>}
                    </li>
                  ))}
                </ul>
              </Section>
            );
          case 'experience':
            return (
              <Section key={s.key} k={s.key} label={s.label} note={<Badge tone="warning">Self-reported</Badge>}>
                <ul className={listGroup}>
                  {v.experience.map((e, i) => (
                    <li key={i} className="px-5 py-4">
                      <div className="text-[14.5px] font-medium">
                        {e.title}, {e.company}
                      </div>
                      {(e.start || e.end) && (
                        <div className="text-[12px] text-subtle">
                          {e.start} {e.end ? `to ${e.end}` : e.start ? 'to present' : ''}
                        </div>
                      )}
                      {e.summary && <p className="mt-1 text-[13px] text-muted">{e.summary}</p>}
                    </li>
                  ))}
                </ul>
              </Section>
            );
          case 'education':
            return (
              <Section key={s.key} k={s.key} label={s.label} note={<Badge tone="warning">Self-reported</Badge>}>
                <ul className={listGroup}>
                  {v.education.map((e, i) => (
                    <li key={i} className="px-5 py-4">
                      <div className="text-[14.5px] font-medium">{e.institution}</div>
                      <div className="mt-0.5 text-[13px] text-muted">
                        {[e.degree, e.field].filter(Boolean).join(', ')}
                        {e.endYear ? ` · ${e.endYear}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>
            );
        }
      })}
    </div>
  );
}
