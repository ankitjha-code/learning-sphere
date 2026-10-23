import { useState } from 'react';
import { XIcon } from '@phosphor-icons/react';
import { Checkbox, Field, Input, Select, Switch } from '@/components/ui';
import { useSkillCatalog, useStructure } from './shared';
import type { EligibilityRules } from './types';

const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

/** Eligibility rule editor. An empty field means the rule is not applied. */
export function RuleBuilder({ value, onChange, disabled }: { value: EligibilityRules; onChange: (v: EligibilityRules) => void; disabled?: boolean }) {
  const structure = useStructure();
  const catalog = useSkillCatalog();
  const [yearsText, setYearsText] = useState((value.graduationYears ?? []).join(', '));
  const set = (patch: Partial<EligibilityRules>) => onChange({ ...value, ...patch });
  const programs = structure.data?.programs ?? [];
  const selected = new Set(value.programIds ?? []);
  const skills = value.requiredSkillSlugs ?? [];
  const skillName = (slug: string) => catalog.data?.items.find((s) => s.slug === slug)?.name ?? slug;

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <div className="space-y-4 @container">
        <div>
          <div className="mb-1.5 text-[13px] font-medium">Programs</div>
          {!programs.length ? (
            <p className="text-[12.5px] text-subtle">No programs set up yet, so any program is allowed. Add programs in Structure.</p>
          ) : (
            <div className="grid gap-x-4 gap-y-2 @lg:grid-cols-2">
              {programs.map((p) => (
                <Checkbox
                  key={p.id}
                  checked={selected.has(p.id)}
                  onCheckedChange={(on) => {
                    const next = new Set(selected);
                    if (on) next.add(p.id);
                    else next.delete(p.id);
                    set({ programIds: [...next] });
                  }}
                  label={`${p.name} (${p.code})`}
                />
              ))}
              <p className="text-[12px] text-subtle @lg:col-span-2">None selected means any program.</p>
            </div>
          )}
        </div>
        <div className="grid gap-4 @lg:grid-cols-2">
          <Field label="Graduation years" optional helper="Comma separated, for example 2027, 2028.">
            <Input
              value={yearsText}
              onChange={(e) => {
                setYearsText(e.target.value);
                const ys = e.target.value
                  .split(',')
                  .map((s) => Number(s.trim()))
                  .filter((n) => Number.isInteger(n) && n >= 1990 && n <= 2100);
                set({ graduationYears: ys });
              }}
              placeholder="2027"
            />
          </Field>
          <Field label="Minimum CGPA" optional helper="On a 10-point scale.">
            <Input type="number" step="0.1" min={0} max={10} value={value.minCgpa ?? ''} onChange={(e) => set({ minCgpa: numOrNull(e.target.value) })} />
          </Field>
          <Field label="Maximum active backlogs" optional>
            <Input type="number" min={0} max={50} value={value.maxActiveBacklogs ?? ''} onChange={(e) => set({ maxActiveBacklogs: numOrNull(e.target.value) })} />
          </Field>
          <Field label="Minimum attendance (%)" optional helper="Uses attendance recorded in Teach.">
            <Input type="number" min={0} max={100} value={value.minAttendance ?? ''} onChange={(e) => set({ minAttendance: numOrNull(e.target.value) })} />
          </Field>
        </div>
        <div>
          <Field label="Required skills" optional helper="Met when the student's Skill DNA shows the skill as verified or demonstrated. Self-reported skills count as needs data.">
            <Select
              value=""
              onChange={(e) => {
                if (e.target.value && !skills.includes(e.target.value)) set({ requiredSkillSlugs: [...skills, e.target.value] });
              }}
            >
              <option value="">{catalog.isLoading ? 'Loading skills...' : 'Add a skill'}</option>
              {catalog.data?.items
                .filter((s) => !skills.includes(s.slug))
                .map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name} ({s.category})
                  </option>
                ))}
            </Select>
          </Field>
          {skills.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {skills.map((slug) => (
                <li key={slug} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[12px] text-accent-text">
                  {skillName(slug)}
                  <button type="button" onClick={() => set({ requiredSkillSlugs: skills.filter((s) => s !== slug) })} aria-label={`Remove ${skillName(slug)}`} className="rounded-full hover:bg-surface-2">
                    <XIcon size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Switch
          checked={!!value.requireVerifiedRecord}
          onCheckedChange={(v) => set({ requireVerifiedRecord: v })}
          label="Require a verified record"
          description="Unverified records show as needs data (not as ineligible) until someone verifies them."
        />
      </div>
    </fieldset>
  );
}

/** Plain-language summary of rules for read-only display. */
export function describeRules(r: EligibilityRules, programName: (id: string) => string, skillName: (slug: string) => string = (s) => s): string[] {
  const out: string[] = [];
  if (r.programIds?.length) out.push(`Program: ${r.programIds.map(programName).join(', ')}`);
  if (r.graduationYears?.length) out.push(`Graduating in ${r.graduationYears.join(', ')}`);
  if (r.minCgpa !== null && r.minCgpa !== undefined) out.push(`CGPA at least ${r.minCgpa}`);
  if (r.maxActiveBacklogs !== null && r.maxActiveBacklogs !== undefined) out.push(`At most ${r.maxActiveBacklogs} active backlogs`);
  if (r.minAttendance !== null && r.minAttendance !== undefined) out.push(`Attendance at least ${r.minAttendance}%`);
  if (r.requiredSkillSlugs?.length) out.push(`Skills: ${r.requiredSkillSlugs.map(skillName).join(', ')}`);
  if (r.requireVerifiedRecord) out.push('Verified record required');
  return out;
}
