import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SparkleIcon, ArrowLeftIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { Dialog, Button, Field, Textarea, Input, Checkbox, Badge, Banner, ProvenanceTag } from '@/components/ui';
import { AiUnavailable } from './components';
import { isAiFailure, type AiFailure, type ProposedField, type ResumeData } from './api';

const uid = () => Math.random().toString(36).slice(2, 10);

export function emptyResumeData(name = ''): ResumeData {
  return { basics: { name, links: [] }, summary: '', experience: [], education: [], projects: [], skills: [], certifications: [], sectionOrder: ['summary', 'experience', 'projects', 'education', 'skills', 'certifications'] };
}

/** Builds resume data from only the fields the user confirmed (with their edits). */
export function buildFromConfirmed(fields: ProposedField[], values: Record<string, string>, confirmed: Set<string>): ResumeData {
  const d = emptyResumeData();
  const idx: Record<string, Map<number, number>> = { experience: new Map(), projects: new Map(), education: new Map() };
  const slot = <K extends 'experience' | 'projects' | 'education'>(kind: K, i: number) => {
    const m = idx[kind];
    if (!m.has(i)) {
      if (kind === 'experience') d.experience.push({ id: uid(), company: '', title: '', bullets: [] });
      if (kind === 'projects') d.projects.push({ id: uid(), name: '', bullets: [] });
      if (kind === 'education') d.education.push({ id: uid(), institution: '' });
      m.set(i, (kind === 'experience' ? d.experience : kind === 'projects' ? d.projects : d.education).length - 1);
    }
    return m.get(i)!;
  };
  for (const f of fields) {
    if (!confirmed.has(f.id)) continue;
    const raw = values[f.id] ?? (Array.isArray(f.value) ? f.value.join(', ') : f.value);
    const v = raw.trim();
    if (!v) continue;
    if (f.path.startsWith('basics.links')) {
      d.basics.links!.push({ label: f.label.replace(/ link$/, ''), url: v });
      continue;
    }
    const m = f.path.match(/^(\w+)(?:\[(\d+)\])?(?:\.(\w+))?$/);
    if (!m) continue;
    const [, root, iStr, prop] = m;
    const i = iStr ? Number(iStr) : 0;
    if (root === 'basics') {
      if (prop) (d.basics as Record<string, unknown>)[prop] = v;
    } else if (root === 'summary') d.summary = v;
    else if (root === 'experience') {
      const e = d.experience[slot('experience', i)];
      if (prop === 'bullets') e.bullets.push(v);
      else if (prop) (e as Record<string, unknown>)[prop] = v;
    } else if (root === 'projects') {
      const p = d.projects[slot('projects', i)];
      if (prop === 'bullets') p.bullets.push(v);
      else if (prop) (p as Record<string, unknown>)[prop] = v;
    } else if (root === 'education') {
      const e = d.education[slot('education', i)];
      if (prop) (e as Record<string, unknown>)[prop] = v;
    } else if (root === 'skills') {
      d.skills.push({ group: f.label.replace(/^Skills: /, '') || 'Skills', items: v.split(',').map((s) => s.trim()).filter(Boolean) });
    } else if (root === 'certifications') {
      d.certifications.push({ id: uid(), name: v });
    }
  }
  d.experience = d.experience.filter((e) => e.title || e.company);
  d.projects = d.projects.filter((p) => p.name);
  d.education = d.education.filter((e) => e.institution);
  return d;
}

/** Turns an AI proposal into the same per-field confirmation list as the deterministic parser. */
function fieldsFromProposal(p: Partial<ResumeData>): ProposedField[] {
  const out: ProposedField[] = [];
  const add = (path: string, section: string, label: string, value: string | string[] | undefined) => {
    if (value === undefined || (Array.isArray(value) ? !value.length : !String(value).trim())) return;
    out.push({ id: uid(), path, section, label, value, confidence: 'medium', sourceLine: 'AI parse' });
  };
  const b = p.basics;
  if (b) {
    add('basics.name', 'basics', 'Name', b.name);
    add('basics.email', 'basics', 'Email', b.email);
    add('basics.phone', 'basics', 'Phone', b.phone);
    add('basics.location', 'basics', 'Location', b.location);
    add('basics.headline', 'basics', 'Headline', b.headline);
  }
  add('summary', 'summary', 'Summary', p.summary);
  (p.experience ?? []).forEach((e, i) => {
    add(`experience[${i}].title`, 'experience', 'Job title', e.title);
    add(`experience[${i}].company`, 'experience', 'Company', e.company);
    add(`experience[${i}].start`, 'experience', 'Start date', e.start);
    add(`experience[${i}].end`, 'experience', 'End date', e.end);
    e.bullets.forEach((bl) => add(`experience[${i}].bullets`, 'experience', `Bullet (${e.title || 'role'})`, bl));
  });
  (p.education ?? []).forEach((e, i) => {
    add(`education[${i}].institution`, 'education', 'Institution', e.institution);
    add(`education[${i}].degree`, 'education', 'Degree', e.degree);
    add(`education[${i}].end`, 'education', 'End date', e.end);
  });
  (p.projects ?? []).forEach((pr, i) => {
    add(`projects[${i}].name`, 'projects', 'Project name', pr.name);
    add(`projects[${i}].url`, 'projects', 'Project link', pr.url);
    pr.bullets.forEach((bl) => add(`projects[${i}].bullets`, 'projects', `Bullet (${pr.name})`, bl));
  });
  (p.skills ?? []).forEach((g, i) => add(`skills[${i}]`, 'skills', `Skills: ${g.group}`, g.items));
  (p.certifications ?? []).forEach((c, i) => add(`certifications[${i}]`, 'certifications', 'Certification', c.name));
  return out;
}

const SECTION_LABEL: Record<string, string> = { basics: 'Contact', summary: 'Summary', experience: 'Experience', education: 'Education', projects: 'Projects', skills: 'Skills', certifications: 'Certifications' };

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [fields, setFields] = useState<ProposedField[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [unparsed, setUnparsed] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('Imported resume');
  const [aiUsed, setAiUsed] = useState(false);
  const [aiFailure, setAiFailure] = useState<AiFailure | null>(null);

  const reset = () => {
    setFields(null);
    setValues({});
    setConfirmed(new Set());
    setAiUsed(false);
    setAiFailure(null);
  };
  const parse = useMutation({
    mutationFn: () => api.post<{ fields: ProposedField[]; notes: string[]; unparsed: string[] }>('/career/resumes/import', { text }),
    onSuccess: (r) => {
      setFields(r.fields);
      setNotes(r.notes);
      setUnparsed(r.unparsed);
      setAiUsed(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const aiParse = useMutation({
    mutationFn: () => api.post<AiFailure | { ok: true; proposal: Partial<ResumeData>; notes: string[]; dropped: number }>('/career/resumes/import/ai', { text }),
    onSuccess: (r) => {
      if (isAiFailure(r)) return setAiFailure(r);
      setAiFailure(null);
      setFields(fieldsFromProposal(r.proposal));
      setNotes(r.notes);
      setUnparsed([]);
      setAiUsed(true);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const create = useMutation({
    mutationFn: () => api.post<{ resume: { id: string } }>('/career/resumes', { title, data: buildFromConfirmed(fields ?? [], values, confirmed) }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['career'] });
      toast.success('Resume created from the fields you confirmed.');
      onOpenChange(false);
      nav(`/app/career/resumes/${r.resume.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const grouped = useMemo(() => {
    const g = new Map<string, ProposedField[]>();
    for (const f of fields ?? []) (g.get(f.section) ?? g.set(f.section, []).get(f.section)!).push(f);
    return [...g.entries()];
  }, [fields]);

  const toggle = (id: string, on: boolean) => setConfirmed((s) => {
    const n = new Set(s);
    if (on) n.add(id);
    else n.delete(id);
    return n;
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      size="xl"
      title="Import from existing resume text"
      description="Paste your resume as text. We propose fields; you confirm each one. Nothing is saved until you create the resume."
      footer={
        fields ? (
          <>
            <Button icon={<ArrowLeftIcon size={14} />} onClick={reset}>
              Back to text
            </Button>
            <Button variant="primary" loading={create.isPending} disabled={confirmed.size === 0} disabledReason="Confirm at least one field" onClick={() => create.mutate()}>
              Create resume from {confirmed.size} confirmed field{confirmed.size === 1 ? '' : 's'}
            </Button>
          </>
        ) : (
          <>
            <Button icon={<SparkleIcon size={14} />} loading={aiParse.isPending} disabled={text.trim().length < 20} disabledReason="Paste your resume text first" onClick={() => aiParse.mutate()}>
              Try AI parse
            </Button>
            <Button variant="primary" loading={parse.isPending} disabled={text.trim().length < 20} disabledReason="Paste your resume text first" onClick={() => parse.mutate()}>
              Propose fields
            </Button>
          </>
        )
      }
    >
      {!fields ? (
        <div className="space-y-3">
          {aiFailure && <AiUnavailable failure={aiFailure} />}
          <Field label="Resume text" helper="Headings such as Experience, Education, Projects and Skills on their own lines work best.">
            <Textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        </div>
      ) : (
        <div className="space-y-4">
          {notes.map((n, i) => (
            <Banner key={i} tone="info">
              {n}
            </Banner>
          ))}
          {aiUsed && (
            <div className="flex items-center gap-2 text-[12.5px] text-muted">
              <ProvenanceTag kind="ai" /> AI proposals. Check every field against your original text.
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Resume name" className="min-w-60 flex-1">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Button size="sm" onClick={() => setConfirmed(new Set((fields ?? []).filter((f) => f.confidence === 'high').map((f) => f.id)))}>
              Confirm high-confidence fields
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmed(new Set())}>
              Clear all
            </Button>
          </div>
          {grouped.length === 0 && <p className="text-[13.5px] text-muted">No fields were recognized. Go back and add section headings, or create a blank resume.</p>}
          {grouped.map(([section, list]) => (
            <section key={section}>
              <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-subtle">{SECTION_LABEL[section] ?? section}</h3>
              <ul className="space-y-2">
                {list.map((f) => (
                  <li key={f.id} className="grid gap-2 rounded-md border border-border p-2.5 sm:grid-cols-[auto_10rem_1fr] sm:items-center">
                    <Checkbox checked={confirmed.has(f.id)} onCheckedChange={(v) => toggle(f.id, v)} label={<span className="sr-only">Confirm {f.label}</span>} />
                    <div className="text-[13px]">
                      <div className="font-medium">{f.label}</div>
                      <Badge tone={f.confidence === 'high' ? 'success' : f.confidence === 'medium' ? 'info' : 'warning'}>{f.confidence} confidence</Badge>
                    </div>
                    <Input aria-label={`${f.label} value`} value={values[f.id] ?? (Array.isArray(f.value) ? f.value.join(', ') : f.value)} onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {unparsed.length > 0 && (
            <details className="rounded-md border border-border p-3 text-[13px]">
              <summary className="cursor-pointer font-medium">Lines we could not place ({unparsed.length})</summary>
              <ul className="mt-2 list-disc pl-5 text-muted">
                {unparsed.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Dialog>
  );
}
