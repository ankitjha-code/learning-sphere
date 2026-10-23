import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { FileTextIcon, MagicWandIcon } from '@phosphor-icons/react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { Button, Card, Markdown, Segmented, Textarea, Banner } from '@/components/ui';
import type { DocKey, ProjectDetail } from '../types';
import { useProjectMutation } from './shared';

const PROMPTS: Record<DocKey, string> = {
  architecture: 'Components, how they talk to each other, and the key design decisions with their trade-offs.',
  dataModel: 'Entities, fields, keys and relationships. Note constraints and indexes.',
  api: 'Endpoints or interfaces: inputs, outputs, errors and examples.',
  testPlan: 'What you test, how (unit, integration, manual), and which acceptance criteria each test covers.',
  deployment: 'How to run it locally and where/how it is deployed. Environment variables (never the secret values).',
  retrospective: 'What went well, what was hard, what you would do differently, and what you learned.',
  readme: 'What it is, how to install and run it, and how to use it.',
};

/** Markdown section editor with preview. `only` limits it to a single section (used by the Retrospective tab). */
export function DocsTab({ d, only }: { d: ProjectDetail; only?: DocKey }) {
  const pid = d.project.id;
  const sections = only ? d.docSections.filter((s) => s.key === only) : d.docSections.filter((s) => s.key !== 'retrospective');
  const [active, setActive] = useState<DocKey>(sections[0].key);
  const saved = d.project.docs[active] ?? '';
  const [draft, setDraft] = useState(saved);
  const [view, setView] = useState<'write' | 'preview'>('write');
  useEffect(() => setDraft(d.project.docs[active] ?? ''), [active, d.project.docs]);
  const dirty = draft !== saved;
  const save = useProjectMutation(pid, () => api.patch(`/projects/${pid}/docs`, { section: active, content: draft }), 'Saved');
  // Drafts are generated without touching saved docs, so no refetch overwrites the draft.
  const gen = useMutation({
    mutationFn: (kind: 'readme' | 'case_study') => api.get<{ markdown: string }>(`/projects/${pid}/generate?kind=${kind}`),
    onSuccess: () => toast.success('Draft inserted. Review it, then save.'),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className={clsx('grid gap-4', !only && 'md:grid-cols-[200px_1fr]')}>
      {!only && (
        <nav aria-label="Document sections" className="flex gap-1 overflow-x-auto md:flex-col">
          {sections.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                if (dirty && !window.confirm('Discard unsaved changes in this section?')) return;
                setActive(s.key);
              }}
              aria-current={active === s.key}
              className={clsx(
                'flex items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-[13.5px]',
                active === s.key ? 'bg-accent-soft font-medium text-accent-text' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              <FileTextIcon size={14} />
              {s.label}
              {d.project.docs[s.key]?.trim() ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-success" aria-label="Has content" /> : null}
            </button>
          ))}
        </nav>
      )}
      <Card className="p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-semibold">{sections.find((s) => s.key === active)?.label}</h3>
            <p className="text-[12.5px] text-muted">{PROMPTS[active]}</p>
          </div>
          <Segmented label="Editor view" value={view} onChange={setView} options={[{ value: 'write', label: 'Write' }, { value: 'preview', label: 'Preview' }]} />
        </div>
        {active === 'readme' && d.access.canEdit && (
          <Banner
            tone="info"
            className="mb-3"
            action={
              <div className="flex gap-1.5">
                <Button size="sm" icon={<MagicWandIcon size={14} />} loading={gen.isPending && gen.variables === 'readme'} onClick={() => gen.mutate('readme', { onSuccess: (r) => setDraft(r.markdown) })}>
                  Draft README
                </Button>
                <Button size="sm" loading={gen.isPending && gen.variables === 'case_study'} onClick={() => gen.mutate('case_study', { onSuccess: (r) => setDraft(r.markdown) })}>
                  Draft case study
                </Button>
              </div>
            }
          >
            Generate a starting draft from your requirements, milestones and docs. Nothing is invented and nothing is saved until you choose Save.
          </Banner>
        )}
        {view === 'write' ? (
          <Textarea
            aria-label={`${active} markdown`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={18}
            readOnly={!d.access.canEdit}
            className="font-mono text-[13px]"
            placeholder={d.access.canEdit ? 'Write in Markdown...' : 'Nothing written yet.'}
          />
        ) : draft.trim() ? (
          <div className="min-h-[200px] rounded-md border border-border p-4">
            <Markdown source={draft} />
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-[13px] text-muted">Nothing to preview yet.</p>
        )}
        {d.access.canEdit && (
          <div className="mt-3 flex items-center justify-end gap-2">
            {dirty && <span className="text-[12.5px] text-warning">Unsaved changes</span>}
            <Button disabled={!dirty} disabledReason="No changes to discard" onClick={() => setDraft(saved)}>
              Discard
            </Button>
            <Button variant="primary" loading={save.isPending} disabled={!dirty} disabledReason="No changes to save" onClick={() => save.mutate(undefined)}>
              Save section
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
