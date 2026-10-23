import { useState } from 'react';
import { CheckSquareIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { Card, Button, Checkbox, Badge, EmptyState, Dialog, Field, Input, Textarea, Switch, Menu } from '@/components/ui';
import type { ProjectDetail, Requirement } from '../types';
import { useProjectMutation } from './shared';

function nextId(list: Requirement[]) {
  let n = list.length + 1;
  const ids = new Set(list.map((r) => r.id));
  while (ids.has(`R${n}`)) n++;
  return `R${n}`;
}

function RequirementDialog({ initial, open, onOpenChange, onSave, saving }: { initial: Requirement; open: boolean; onOpenChange: (v: boolean) => void; onSave: (r: Requirement) => void; saving: boolean }) {
  const [text, setText] = useState(initial.text);
  const [acceptance, setAcceptance] = useState(initial.acceptance.join('\n'));
  const [optional, setOptional] = useState(!!initial.optional);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial.text ? `Edit ${initial.id}` : 'Add requirement'}
      description="Write acceptance criteria as observable checks: what someone would do and what they should see."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={text.trim().length < 3}
            disabledReason="Describe the requirement first"
            onClick={() => onSave({ ...initial, text: text.trim(), acceptance: acceptance.split('\n').map((s) => s.trim()).filter(Boolean), optional })}
          >
            Save requirement
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Requirement">
          <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="e.g. Members can borrow an available book" />
        </Field>
        <Field label="Acceptance criteria" helper="One per line.">
          <Textarea value={acceptance} onChange={(e) => setAcceptance(e.target.value)} rows={5} />
        </Field>
        <Switch checked={optional} onCheckedChange={setOptional} label="Optional (stretch goal)" description="Optional requirements do not count toward progress." />
      </div>
    </Dialog>
  );
}

export function RequirementsTab({ d }: { d: ProjectDetail }) {
  const p = d.project;
  const [editing, setEditing] = useState<Requirement | null>(null);
  const toggle = useProjectMutation(p.id, (v: { id: string; done: boolean }) => api.patch(`/projects/${p.id}/requirements/${v.id}`, { done: v.done }));
  const saveAll = useProjectMutation(p.id, (list: Requirement[]) => api.put(`/projects/${p.id}/requirements`, { requirements: list }), 'Requirements saved');
  const reqs = p.requirements;
  const done = reqs.filter((r) => r.done && !r.optional).length;
  const required = reqs.filter((r) => !r.optional).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13.5px] text-muted">
          {done} of {required} required requirements done. Mark one done only when every acceptance criterion holds.
        </p>
        {d.access.canEdit && (
          <Button icon={<PlusIcon size={14} />} onClick={() => setEditing({ id: nextId(reqs), text: '', acceptance: [], done: false })}>
            Add requirement
          </Button>
        )}
      </div>
      {reqs.length === 0 ? (
        <EmptyState
          icon={<CheckSquareIcon size={22} />}
          title="No requirements yet"
          description="List what the project must do, each with acceptance criteria you can check."
          action={d.access.canEdit ? <Button variant="primary" onClick={() => setEditing({ id: 'R1', text: '', acceptance: [], done: false })}>Add requirement</Button> : undefined}
        />
      ) : (
        <Card className="divide-y divide-border">
          {reqs.map((r) => (
            <div key={r.id} className="flex items-start gap-3 p-4">
              <div className="pt-0.5">
                <Checkbox
                  checked={r.done}
                  disabled={!d.access.canEdit || toggle.isPending}
                  onCheckedChange={(v) => toggle.mutate({ id: r.id, done: v })}
                  label={<span className="sr-only">Mark {r.id} done</span>}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12px] text-subtle">{r.id}</span>
                  <span className={r.done ? 'text-[14px] font-medium text-muted line-through' : 'text-[14px] font-medium'}>{r.text}</span>
                  {r.optional && <Badge>Optional</Badge>}
                </div>
                {r.acceptance.length > 0 ? (
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13px] text-muted">
                    {r.acceptance.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[12.5px] text-warning">No acceptance criteria yet. Add checks so you and reviewers know when this is done.</p>
                )}
              </div>
              {d.access.canEdit && (
                <Menu
                  items={[
                    { label: 'Edit', icon: <PencilSimpleIcon size={14} />, onSelect: () => setEditing(r) },
                    { label: 'Remove', icon: <TrashIcon size={14} />, danger: true, onSelect: () => saveAll.mutate(reqs.filter((x) => x.id !== r.id)) },
                  ]}
                  label={`Actions for ${r.id}`}
                />
              )}
            </div>
          ))}
        </Card>
      )}
      {editing && (
        <RequirementDialog
          key={editing.id}
          initial={editing}
          open
          onOpenChange={(v) => !v && setEditing(null)}
          saving={saveAll.isPending}
          onSave={(r) => {
            const exists = reqs.some((x) => x.id === r.id);
            saveAll.mutate(exists ? reqs.map((x) => (x.id === r.id ? r : x)) : [...reqs, r], { onSuccess: () => setEditing(null) });
          }}
        />
      )}
    </div>
  );
}
