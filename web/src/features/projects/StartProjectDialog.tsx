import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { Button, Dialog, Field, Input, Select, Segmented, Textarea, Banner } from '@/components/ui';
import { CATEGORY_LABELS, MODE_INFO, type TemplateSummary } from './types';

type Mode = 'guided' | 'partial' | 'independent';

/** Start a project from a template (with a mode) or from a blank page. */
export function StartProjectDialog({ open, onOpenChange, templateSlug }: { open: boolean; onOpenChange: (v: boolean) => void; templateSlug?: string }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [source, setSource] = useState<'template' | 'blank'>('template');
  const [slug, setSlug] = useState(templateSlug ?? '');
  const [mode, setMode] = useState<Mode>('guided');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('beginner');
  const [problem, setProblem] = useState('');
  const templates = useQuery({
    queryKey: ['project-templates', {}],
    queryFn: () => api.get<{ items: TemplateSummary[] }>('/projects/templates'),
    enabled: open && !templateSlug,
    staleTime: 300_000,
  });
  const fixed = !!templateSlug;
  const m = useMutation({
    mutationFn: () =>
      source === 'template' || fixed
        ? api.post<{ project: { id: string } }>(`/projects/templates/${slug}/start`, { mode, ...(title.trim() ? { title: title.trim() } : {}) })
        : api.post<{ project: { id: string } }>('/projects', { title, category, problem, mode: 'independent' }),
    onSuccess: (r) => {
      toast.success('Project created. Start with the Overview and Requirements.');
      qc.invalidateQueries({ queryKey: ['projects'] });
      onOpenChange(false);
      nav(`/app/projects/${r.project.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const fields = m.error instanceof ApiError ? m.error.fields : {};
  const canSubmit = source === 'template' || fixed ? !!slug : title.trim().length >= 3;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Start a project"
      description="Projects become portfolio evidence. A reviewer's approval turns them into verified skill evidence."
      size="lg"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={!canSubmit}
            disabledReason={source === 'template' ? 'Choose a template first' : 'Give the project a name of at least 3 characters'}
            onClick={() => m.mutate()}
          >
            Create project
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!fixed && (
          <Segmented
            label="Start from"
            value={source}
            onChange={setSource}
            options={[
              { value: 'template', label: 'From a template' },
              { value: 'blank', label: 'Blank project' },
            ]}
          />
        )}
        {source === 'template' || fixed ? (
          <>
            {!fixed && (
              <Field label="Template" helper="Browse all templates with details on the Templates page.">
                <Select value={slug} onChange={(e) => setSlug(e.target.value)} disabled={templates.isLoading}>
                  <option value="">{templates.isLoading ? 'Loading templates...' : 'Choose a template'}</option>
                  {templates.data?.items.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.title} ({CATEGORY_LABELS[t.category] ?? t.category}, {t.difficulty}
                      {t.isCapstone ? ', capstone' : ''})
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {templates.error && <Banner tone="danger">{errorMessage(templates.error)}</Banner>}
            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-[13px] font-medium">How much guidance do you want?</legend>
              {(Object.keys(MODE_INFO) as Mode[]).map((k) => (
                <label key={k} className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border p-3 hover:bg-surface-2 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                  <input type="radio" name="mode" value={k} checked={mode === k} onChange={() => setMode(k)} className="mt-1 accent-[var(--accent)]" />
                  <span>
                    <span className="block text-[14px] font-medium">{MODE_INFO[k].label}</span>
                    <span className="block text-[12.5px] text-muted">{MODE_INFO[k].hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <Field label="Project name" optional helper="Defaults to the template title.">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Project name" error={fields.title} required>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="e.g. Recipe scaler CLI" />
            </Field>
            <Field label="Category">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Problem statement" optional helper="What problem does it solve, and for whom? You can refine it later.">
              <Textarea value={problem} onChange={(e) => setProblem(e.target.value)} rows={3} maxLength={5000} />
            </Field>
          </>
        )}
      </div>
    </Dialog>
  );
}
