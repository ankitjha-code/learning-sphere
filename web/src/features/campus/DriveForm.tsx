import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { fromLocalInput, toLocalInput } from '@/lib/format';
import { Button, Card, CardBody, CardHeader, Checkbox, Field, Input, Select, Textarea } from '@/components/ui';
import { CAMPUS_KEY } from './shared';
import { CompanyPicker } from './EmployersPage';
import { RuleBuilder } from './RuleBuilder';
import type { Drive, EligibilityRules } from './types';

export type DriveFormValue = {
  title: string;
  companyName: string;
  companyOrgId: string | null;
  roleTitle: string;
  description: string;
  ctcText: string;
  location: string;
  registrationDeadline: string; // datetime-local
  stages: string[];
  eligibility: EligibilityRules;
};

const STAGE_OPTIONS = [
  { value: 'registered', label: 'Registration' },
  { value: 'assessment', label: 'Assessment' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
];

export function driveToForm(d?: Drive, defaults?: EligibilityRules): DriveFormValue {
  return {
    title: d?.title ?? '',
    companyName: d?.companyName ?? '',
    companyOrgId: d?.companyOrgId ?? null,
    roleTitle: d?.roleTitle ?? '',
    description: d?.description ?? '',
    ctcText: d?.ctcText ?? '',
    location: d?.location ?? '',
    registrationDeadline: toLocalInput(d?.registrationDeadline ?? null),
    stages: d?.stages ?? ['registered', 'assessment', 'interview', 'offer'],
    eligibility: d?.eligibility ?? defaults ?? {},
  };
}

export function formToPayload(v: DriveFormValue) {
  return {
    title: v.title,
    companyName: v.companyName,
    companyOrgId: v.companyOrgId,
    roleTitle: v.roleTitle,
    description: v.description || null,
    ctcText: v.ctcText || null,
    location: v.location || null,
    registrationDeadline: fromLocalInput(v.registrationDeadline),
    stages: v.stages,
    eligibility: v.eligibility,
  };
}

export function DriveForm({ initial, onSubmit, submitting, error, submitLabel, locked, showEligibility = true }: { initial: DriveFormValue; onSubmit: (v: DriveFormValue) => void; submitting: boolean; error: unknown; submitLabel: string; locked?: boolean; showEligibility?: boolean }) {
  const [v, setV] = useState(initial);
  const employers = useQuery({ queryKey: [...CAMPUS_KEY, 'employers', ''], queryFn: () => api.get<{ items: { id: string; companyName: string; companyOrgId: string | null }[] }>('/campus/employers') });
  const f = error instanceof ApiError ? error.fields : {};
  const ready = v.title.trim().length >= 3 && v.companyName.trim().length >= 2 && v.roleTitle.trim().length >= 2;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
      className="space-y-4"
    >
      <Card>
        <CardHeader title="Drive details" description="What students see when they are invited or eligible." />
        <CardBody className="space-y-4">
          <fieldset disabled={locked} className="space-y-4">
            <Field label="Drive title" error={f.title}>
              <Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="Helix Labs SDE Intern 2027" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Employer from your list" optional>
                <Select
                  value=""
                  onChange={(e) => {
                    const emp = employers.data?.items.find((x) => x.id === e.target.value);
                    if (emp) setV({ ...v, companyName: emp.companyName, companyOrgId: emp.companyOrgId });
                  }}
                >
                  <option value="">{employers.data?.items.length ? 'Pick an employer to fill in' : 'No employers recorded yet'}</option>
                  {employers.data?.items.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.companyName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Company name" error={f.companyName}>
                <Input value={v.companyName} onChange={(e) => setV({ ...v, companyName: e.target.value })} />
              </Field>
            </div>
            <Field label="On-platform company" optional helper="Optional link to the company's organization on LearnSphere.">
              <CompanyPicker value={v.companyOrgId ? { id: v.companyOrgId, name: v.companyName } : null} onPick={(c) => setV({ ...v, companyOrgId: c?.id ?? null, companyName: c?.name ?? v.companyName })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Role" error={f.roleTitle}>
                <Input value={v.roleTitle} onChange={(e) => setV({ ...v, roleTitle: e.target.value })} placeholder="Software Development Engineer Intern" />
              </Field>
              <Field label="Location" optional error={f.location}>
                <Input value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} placeholder="Bengaluru (hybrid)" />
              </Field>
              <Field label="CTC or stipend" optional error={f.ctcText} helper="Write it as the company states it. Reports show it as text.">
                <Input value={v.ctcText} onChange={(e) => setV({ ...v, ctcText: e.target.value })} placeholder="12 LPA" />
              </Field>
              <Field label="Registration deadline" optional error={f.registrationDeadline} helper="Students register or decline before this time.">
                <Input type="datetime-local" value={v.registrationDeadline} onChange={(e) => setV({ ...v, registrationDeadline: e.target.value })} />
              </Field>
            </div>
            <Field label="Description" optional error={f.description}>
              <Textarea rows={4} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder="Process, responsibilities, bond or service terms if any." />
            </Field>
            <div>
              <div className="mb-1.5 text-[13px] font-medium">Stages</div>
              <div className="flex flex-wrap gap-4">
                {STAGE_OPTIONS.map((s) => (
                  <Checkbox key={s.value} checked={v.stages.includes(s.value)} onCheckedChange={(on) => setV({ ...v, stages: on ? [...v.stages, s.value] : v.stages.filter((x) => x !== s.value) })} label={s.label} />
                ))}
              </div>
            </div>
          </fieldset>
        </CardBody>
      </Card>
      {showEligibility && (
        <Card>
          <CardHeader title="Eligibility rules" description="You can refine these later and preview who qualifies before inviting anyone." />
          <CardBody>
            <RuleBuilder value={v.eligibility} onChange={(eligibility) => setV({ ...v, eligibility })} disabled={locked} />
          </CardBody>
        </Card>
      )}
      {!locked && (
        <Button type="submit" variant="primary" loading={submitting} disabled={!ready || !v.stages.length} disabledReason={!ready ? 'Enter a title, company and role' : 'Choose at least one stage'}>
          {submitLabel}
        </Button>
      )}
    </form>
  );
}
