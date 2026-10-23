import clsx from 'clsx';
import type { ResumeData } from './api';

const ORDER = ['summary', 'experience', 'projects', 'education', 'skills', 'certifications'];

/** Client-side rendering of a resume in one of three templates. */
export function ResumePreview({ data, template }: { data: ResumeData; template: string }) {
  const t = template === 'compact' || template === 'modern' ? template : 'clean';
  const b = data.basics;
  const order = data.sectionOrder?.length ? data.sectionOrder : ORDER;
  const heading = clsx('mb-1.5 mt-4 border-b pb-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]', t === 'modern' ? 'border-accent text-accent-text' : 'border-border-strong text-fg');
  const range = (s?: string, e?: string) => (s || e ? <span className="ml-auto shrink-0 text-muted">{[s, e || (s ? 'Present' : '')].filter(Boolean).join(' – ')}</span> : null);
  return (
    <article
      className={clsx('rounded-md border border-border bg-surface p-6 text-fg shadow-1', t === 'clean' && 'font-serif text-[13px] leading-snug', t === 'compact' && 'text-[11.5px] leading-tight', t === 'modern' && 'text-[12.5px] leading-snug')}
      aria-label="Resume preview"
    >
      <header className={clsx(t === 'modern' && 'border-l-4 border-accent pl-3')}>
        <h2 className={clsx('font-semibold', t === 'compact' ? 'text-[17px]' : 'text-[21px]', t === 'modern' && 'text-accent-text')}>{b.name || 'Your name'}</h2>
        {b.headline && <div className="text-muted">{b.headline}</div>}
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-muted">
          {[b.email, b.phone, b.location, ...(b.links ?? []).map((l) => l.url)].filter(Boolean).map((x, i) => (
            <span key={i}>{x}</span>
          ))}
        </div>
      </header>
      {order.map((key) => {
        if (key === 'summary' && data.summary)
          return (
            <section key={key}>
              <h3 className={heading}>Summary</h3>
              <p>{data.summary}</p>
            </section>
          );
        if (key === 'experience' && data.experience.length)
          return (
            <section key={key}>
              <h3 className={heading}>Experience</h3>
              {data.experience.map((e) => (
                <div key={e.id} className="mb-2">
                  <div className="flex gap-2">
                    <span>
                      <strong>{e.title || 'Title'}</strong>
                      {e.company && `, ${e.company}`}
                    </span>
                    {range(e.start, e.end)}
                  </div>
                  {e.bullets.length > 0 && (
                    <ul className="ml-4 list-disc">
                      {e.bullets.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </section>
          );
        if (key === 'projects' && data.projects.length)
          return (
            <section key={key}>
              <h3 className={heading}>Projects</h3>
              {data.projects.map((p) => (
                <div key={p.id} className="mb-2">
                  <div>
                    <strong>{p.name || 'Project'}</strong>
                    {p.url && <span className="text-muted"> · {p.url}</span>}
                  </div>
                  {p.bullets.length > 0 && (
                    <ul className="ml-4 list-disc">
                      {p.bullets.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </section>
          );
        if (key === 'education' && data.education.length)
          return (
            <section key={key}>
              <h3 className={heading}>Education</h3>
              {data.education.map((e) => (
                <div key={e.id} className="mb-1 flex gap-2">
                  <span>
                    <strong>{e.institution || 'Institution'}</strong>
                    {(e.degree || e.field) && `, ${[e.degree, e.field].filter(Boolean).join(', ')}`}
                    {e.grade && <span className="text-muted"> · {e.grade}</span>}
                  </span>
                  {range(e.start, e.end)}
                </div>
              ))}
            </section>
          );
        if (key === 'skills' && data.skills.length)
          return (
            <section key={key}>
              <h3 className={heading}>Skills</h3>
              {data.skills.map((g, i) => (
                <div key={i}>
                  <strong>{g.group}:</strong> {g.items.join(', ')}
                </div>
              ))}
            </section>
          );
        if (key === 'certifications' && data.certifications.length)
          return (
            <section key={key}>
              <h3 className={heading}>Certifications</h3>
              <ul className="ml-4 list-disc">
                {data.certifications.map((c) => (
                  <li key={c.id}>{[c.name, c.issuer, c.date].filter(Boolean).join(' · ')}</li>
                ))}
              </ul>
            </section>
          );
        return null;
      })}
    </article>
  );
}
