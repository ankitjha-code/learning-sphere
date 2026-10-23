import { CheckCircleIcon, CircleIcon, GithubLogoIcon, GlobeIcon, ImageIcon, SealCheckIcon, ArrowSquareOutIcon, GraduationCapIcon } from '@phosphor-icons/react';
import { Badge, Banner, Markdown, Progress } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { PublicProject } from './types';

const DOC_LABELS: Record<string, string> = {
  readme: 'README',
  architecture: 'Design & architecture',
  dataModel: 'Data model',
  api: 'API & interfaces',
  testPlan: 'Test plan',
  deployment: 'Deployment',
  retrospective: 'Retrospective',
};

/** Shareable project case-study page (public or unlisted). */
export function PublicProjectView({ v }: { v: PublicProject }) {
  const p = v.project;
  const docOrder = ['readme', 'architecture', 'dataModel', 'api', 'testPlan', 'deployment', 'retrospective'] as const;
  return (
    <article className="space-y-8">
      <header>
        <div className="flex flex-wrap items-center gap-1.5">
          {v.verification?.kind === 'verified_by_reviewer' ? (
            <Badge tone="success" icon={<SealCheckIcon size={12} weight="fill" />}>
              Verified by reviewer: {v.verification.reviewerName}
            </Badge>
          ) : v.verification?.kind === 'self_completed' ? (
            <Badge>Self-completed, not reviewed</Badge>
          ) : (
            <Badge tone="info">In progress</Badge>
          )}
          {p.isCapstone && (
            <Badge tone="accent" icon={<GraduationCapIcon size={12} />}>
              Capstone
            </Badge>
          )}
        </div>
        <h1 className="mt-3 font-display text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[32px]">{p.title}</h1>
        <p className="mt-1 text-[14px] text-muted">
          By {v.team.length > 1 ? v.team.map((t) => t.name).join(', ') : v.ownerName} · Started {formatDate(p.startedAt)}
          {p.completedAt && <> · Completed {formatDate(p.completedAt)}</>}
          {p.templateTitle && <> · Based on the template "{p.templateTitle}"</>}
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-[14px]">
          {p.demoUrl && (
            <a href={p.demoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline">
              <GlobeIcon size={16} /> Live demo <ArrowSquareOutIcon size={12} />
            </a>
          )}
          {p.repoUrl && (
            <a href={p.repoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline">
              <GithubLogoIcon size={16} /> Source code <ArrowSquareOutIcon size={12} />
            </a>
          )}
        </div>
      </header>

      {v.verification?.kind === 'verified_by_reviewer' && v.verification.body && (
        <Banner tone="success" title={`Reviewer approval, ${formatDate(v.verification.at)}`}>
          {v.verification.body}
        </Banner>
      )}

      <section className="grid gap-6 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.01em]">Problem</h2>
            <p className="mt-1 text-[14.5px] leading-relaxed">{p.problem || 'Not written.'}</p>
          </div>
          {p.intendedUsers && (
            <div>
              <h2 className="text-[16px] font-semibold tracking-[-0.01em]">Who it is for</h2>
              <p className="mt-1 text-[14.5px] text-muted">{p.intendedUsers}</p>
            </div>
          )}
          {p.objectives.length > 0 && (
            <div>
              <h2 className="text-[16px] font-semibold tracking-[-0.01em]">Learning objectives</h2>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[14px] text-muted">
                {p.objectives.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <aside className="space-y-5 self-start rounded-lg border border-border bg-surface p-5 shadow-1">
          <div>
            <div className="flex justify-between text-[13px]">
              <span className="font-medium">Progress</span>
              <span className="tabular-nums">{v.progress.percent}%</span>
            </div>
            <Progress value={v.progress.percent} className="mt-1" tone={p.status === 'completed' ? 'success' : 'accent'} label="Project progress" />
          </div>
          {v.skills.length > 0 && (
            <div>
              <div className="mb-1 text-[13px] font-medium">Skills</div>
              <div className="flex flex-wrap gap-1.5">
                {v.skills.map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="mb-1 text-[13px] font-medium">Milestones</div>
            <ul className="space-y-1 text-[13px]">
              {v.milestones.map((m, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  {m.status === 'done' ? <CheckCircleIcon size={14} weight="fill" className="text-success" aria-label="Done" /> : <CircleIcon size={14} className="text-subtle" aria-label="Open" />}
                  {m.title}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>

      <section>
        <h2 className="mb-3 text-[16px] font-semibold tracking-[-0.01em]">Requirements</h2>
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
          {p.requirements.map((r) => (
            <li key={r.id} className="px-5 py-4">
              <div className="flex items-start gap-2 text-[14px]">
                {r.done ? <CheckCircleIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-success" aria-label="Done" /> : <CircleIcon size={18} className="mt-0.5 shrink-0 text-subtle" aria-label="Not done" />}
                <span className="font-medium">{r.text}</span>
                {r.optional && <Badge>Optional</Badge>}
              </div>
              {r.acceptance.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-1 pl-12 text-[13px] leading-relaxed text-muted">
                  {r.acceptance.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      {p.screenshots.length > 0 && (
        <section>
          <h2 className="mb-3 text-[16px] font-semibold tracking-[-0.01em]">Screenshots</h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {p.screenshots.map((s, i) =>
              s.isFile ? (
                <li key={i}>
                  <figure className="overflow-hidden rounded-lg border border-border bg-surface">
                    <img src={s.url} alt={s.caption || `Screenshot ${i + 1}`} className="aspect-video w-full object-cover" loading="lazy" />
                    {s.caption && <figcaption className="px-3 py-1.5 text-[12.5px] text-muted">{s.caption}</figcaption>}
                  </figure>
                </li>
              ) : (
                <li key={i}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-md border border-border bg-surface p-2.5 text-[13px] hover:underline">
                    <ImageIcon size={18} className="text-muted" aria-hidden /> {s.caption || `Screenshot ${i + 1}`}
                    <ArrowSquareOutIcon size={12} className="ml-auto text-subtle" />
                  </a>
                </li>
              ),
            )}
          </ul>
        </section>
      )}

      {docOrder
        .filter((k) => p.docs[k]?.trim())
        .map((k) => (
          <section key={k}>
            <h2 className="mb-3 text-[16px] font-semibold tracking-[-0.01em]">{DOC_LABELS[k]}</h2>
            <div className="rounded-lg border border-border bg-surface p-5 shadow-1">
              <Markdown source={p.docs[k]!} />
            </div>
          </section>
        ))}

      {v.tasks && v.tasks.length > 0 && (
        <section>
          <h2 className="mb-3 text-[16px] font-semibold tracking-[-0.01em]">Task board</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
            {v.tasks.map((t, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-5 py-3 text-[13.5px]">
                <span className={t.status === 'done' ? 'text-muted line-through' : ''}>{t.title}</span>
                <Badge tone={t.status === 'done' ? 'success' : 'neutral'}>{t.status}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
