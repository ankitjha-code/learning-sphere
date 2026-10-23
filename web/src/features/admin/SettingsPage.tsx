import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PlayIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Badge, Banner, Button, Card, CardAction, CardBody, CardHeader, Checkbox, ConfirmDialog, ErrorState, Field, Input, PageHeader, SkeletonRows, StatusBadge, Switch, Tabs } from '@/components/ui';
import { formatBytes, type Plan, type PlanLimits } from './api';
import { DetailList, JsonBlock } from './components';
import { BillingSettingsCard } from '@/features/billing/components';

type Feature = { key: string; label: string; description: string; default: boolean; enabled: boolean };
type PlansResponse = {
  mode: string;
  notice: string;
  plans: Plan[];
  defaults: Plan[];
  limitLabels: Record<keyof PlanLimits, { label: string; unit: string; explain: string }>;
  entitlementLabels: Record<string, string>;
};
type Retention = { deletionGraceDays: number; auditLogRetentionDays: number; exportFileRetentionDays: number; aiConversationRetentionDays: number | null };
type Settings = {
  retention: Retention;
  retentionDefaults: Retention;
  retentionRules: string[];
  retentionRuns: { id: string; status: string; updatedAt: string; result: Record<string, unknown> | null; lastError: string | null }[];
  storage: { userQuotaBytes: number; defaultUserQuotaBytes: number };
  signupOpen: boolean;
  security: Record<string, string | number>;
  demoData: { sampleUsers: number; sampleOrgs: number; seedingEnabled: boolean; note: string };
};

function FeaturesTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'features'], queryFn: () => api.get<{ features: Feature[] }>('/admin/features') });
  const toggle = useMutation({
    mutationFn: (v: { key: string; enabled: boolean }) => api.put('/admin/features', { flags: { [v.key]: v.enabled } }),
    onSuccess: (_r, v) => {
      toast.success(`${q.data?.features.find((f) => f.key === v.key)?.label ?? v.key} turned ${v.enabled ? 'on' : 'off'}`);
      qc.invalidateQueries({ queryKey: ['admin', 'features'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <SkeletonRows rows={5} />;
  return (
    <Card>
      <CardHeader
        title="Feature flags"
        description="Turning a feature off hides it for everyone, with an explanation, and its API refuses new actions. Existing data is kept."
        action={<CardAction to="/app/admin/ai">AI providers</CardAction>}
      />
      <ul className="divide-y divide-border border-t border-border">
        {q.data.features.map((f) => (
          <li key={f.key} className="px-5 py-4">
            <Switch
              checked={f.enabled}
              disabled={toggle.isPending && toggle.variables?.key === f.key}
              onCheckedChange={(v) => toggle.mutate({ key: f.key, enabled: v })}
              label={
                <span className="flex flex-wrap items-center gap-2">
                  {f.label}
                  {f.enabled !== f.default && <Badge tone="warning">Changed from default</Badge>}
                </span>
              }
              description={f.description}
            />
          </li>
        ))}
      </ul>
      <p className="border-t border-border bg-surface-2/60 px-5 py-3 text-[12.5px] text-muted">AI providers, models and per-assistant quotas are configured on the AI providers page.</p>
    </Card>
  );
}

function PlanEditor({ plan, labels, entitlementLabels }: { plan: Plan; labels: PlansResponse['limitLabels']; entitlementLabels: Record<string, string> }) {
  const qc = useQueryClient();
  const toText = (p: Plan) => Object.fromEntries(Object.entries(p.limits).map(([k, v]) => [k, v === null ? '' : String(v)])) as Record<keyof PlanLimits, string>;
  const [limits, setLimits] = useState(toText(plan));
  const [ents, setEnts] = useState(plan.entitlements);
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    setLimits(toText(plan));
    setEnts(plan.entitlements);
  }, [plan]);
  const nullable: (keyof PlanLimits)[] = ['membersPerOrg', 'activeJobPostings', 'assessmentsPerMonth'];
  const payload = () => ({
    limits: Object.fromEntries(Object.entries(limits).map(([k, v]) => [k, v.trim() === '' && nullable.includes(k as keyof PlanLimits) ? null : Number(v)])),
    entitlements: ents,
  });
  const dirty = JSON.stringify(limits) !== JSON.stringify(toText(plan)) || JSON.stringify(ents) !== JSON.stringify(plan.entitlements);
  const save = useMutation({
    mutationFn: () => api.put(`/admin/plans/${plan.id}`, payload()),
    onSuccess: () => {
      toast.success(`${plan.name} plan saved. New limits apply immediately.`);
      qc.invalidateQueries({ queryKey: ['admin', 'plans'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reset = useMutation({
    mutationFn: () => api.post(`/admin/plans/${plan.id}/reset`),
    onSuccess: () => {
      toast.success(`${plan.name} plan reset to defaults`);
      setConfirmReset(false);
      qc.invalidateQueries({ queryKey: ['admin', 'plans'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card>
      <CardHeader title={plan.name} description={`${plan.description} Used by ${plan.orgCount ?? 0} organization(s).`} />
      <CardBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          {(Object.keys(labels) as (keyof PlanLimits)[]).map((k) => (
            <Field key={k} label={`${labels[k].label} (${labels[k].unit})`} helper={`${labels[k].explain}${nullable.includes(k) ? ' Leave empty for no limit.' : ''}`}>
              <Input type="number" min={0} value={limits[k]} onChange={(e) => setLimits({ ...limits, [k]: e.target.value })} placeholder={nullable.includes(k) ? 'No limit' : undefined} />
            </Field>
          ))}
        </div>
        <div className="border-t border-border pt-4">
          <fieldset className="space-y-2.5">
            <legend className="mb-2.5 text-[13px] font-medium">Included features</legend>
            {Object.entries(entitlementLabels).map(([k, label]) => (
              <Checkbox key={k} checked={!!ents[k]} onCheckedChange={(v) => setEnts({ ...ents, [k]: v })} label={label} />
            ))}
          </fieldset>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmReset(true)}>
            Reset to defaults
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!dirty} disabledReason="No unsaved changes" onClick={() => save.mutate()}>
            Save plan
          </Button>
        </div>
      </CardBody>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={`Reset the ${plan.name} plan?`}
        description="Limits and included features go back to the built-in defaults for every organization on this plan."
        confirmLabel="Reset plan"
        loading={reset.isPending}
        onConfirm={() => reset.mutate()}
      />
    </Card>
  );
}

function PlansTab() {
  const q = useQuery({ queryKey: ['admin', 'plans'], queryFn: () => api.get<PlansResponse>('/admin/plans') });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <SkeletonRows rows={5} />;
  const d = q.data;
  return (
    <div className="space-y-6">
      <BillingSettingsCard />
      <p className="max-w-[72ch] text-[13.5px] leading-relaxed text-muted">
        Plans set limits and included features. Organization admins buy a plan in Plan &amp; billing when a payment provider is configured; you can also assign a plan from an organization’s page (free
        of charge). People without an organization use the Free plan. A platform feature flag that is off overrides every plan.
      </p>
      <div className="grid gap-4 xl:grid-cols-3">
        {d.plans.map((p) => (
          <PlanEditor key={p.id} plan={p} labels={d.limitLabels} entitlementLabels={d.entitlementLabels} />
        ))}
      </div>
    </div>
  );
}

function RetentionTab({ s }: { s: Settings }) {
  const qc = useQueryClient();
  const toText = (r: Retention) => ({
    deletionGraceDays: String(r.deletionGraceDays),
    auditLogRetentionDays: String(r.auditLogRetentionDays),
    exportFileRetentionDays: String(r.exportFileRetentionDays),
    aiConversationRetentionDays: r.aiConversationRetentionDays === null ? '' : String(r.aiConversationRetentionDays),
  });
  const [r, setR] = useState(toText(s.retention));
  const [quota, setQuota] = useState(String(Math.round(s.storage.userQuotaBytes / 1048576)));
  const [fields, setFields] = useState<Record<string, string>>({});
  useEffect(() => {
    setR(toText(s.retention));
    setQuota(String(Math.round(s.storage.userQuotaBytes / 1048576)));
  }, [s]);
  const save = useMutation({
    mutationFn: () =>
      api.put('/admin/settings', {
        retention: {
          deletionGraceDays: Number(r.deletionGraceDays),
          auditLogRetentionDays: Number(r.auditLogRetentionDays),
          exportFileRetentionDays: Number(r.exportFileRetentionDays),
          aiConversationRetentionDays: r.aiConversationRetentionDays.trim() === '' ? null : Number(r.aiConversationRetentionDays),
        },
        storageUserQuotaMb: Number(quota),
      }),
    onSuccess: () => {
      toast.success('Retention and storage settings saved');
      setFields({});
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    onError: (e) => (e instanceof ApiError && Object.keys(e.fields).length ? setFields(e.fields) : toast.error(errorMessage(e))),
  });
  const run = useMutation({
    mutationFn: () => api.post<{ job: { id: string }; created: boolean }>('/admin/retention/run'),
    onSuccess: (res) => {
      toast.success(res.created ? 'Retention sweep queued. Results appear below when it finishes.' : 'A sweep was already queued in the last minute.');
      setTimeout(() => qc.invalidateQueries({ queryKey: ['admin', 'settings'] }), 3000);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const err = (k: string) => fields[`retention.${k}`] ?? fields[k];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader title="Retention" description="How long data is kept before the daily sweep removes it." />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Account deletion grace period (days)" error={err('deletionGraceDays')} helper={`Time to cancel a deletion request. Default ${s.retentionDefaults.deletionGraceDays}.`}>
              <Input type="number" min={1} max={90} value={r.deletionGraceDays} onChange={(e) => setR({ ...r, deletionGraceDays: e.target.value })} />
            </Field>
            <Field label="Audit log retention (days)" error={err('auditLogRetentionDays')} helper={`Minimum 90. Default ${s.retentionDefaults.auditLogRetentionDays}.`}>
              <Input type="number" min={90} value={r.auditLogRetentionDays} onChange={(e) => setR({ ...r, auditLogRetentionDays: e.target.value })} />
            </Field>
            <Field label="Data export files (days)" error={err('exportFileRetentionDays')} helper={`Generated exports are deleted after this. Default ${s.retentionDefaults.exportFileRetentionDays}.`}>
              <Input type="number" min={1} max={90} value={r.exportFileRetentionDays} onChange={(e) => setR({ ...r, exportFileRetentionDays: e.target.value })} />
            </Field>
            <Field label="AI conversations (days)" optional error={err('aiConversationRetentionDays')} helper="Empty keeps conversations until the person deletes them.">
              <Input type="number" min={7} value={r.aiConversationRetentionDays} onChange={(e) => setR({ ...r, aiConversationRetentionDays: e.target.value })} placeholder="Keep" />
            </Field>
            <Field label="Storage quota per user (MB)" error={fields.storageUserQuotaMb} helper={`Default ${formatBytes(s.storage.defaultUserQuotaBytes)}. Plans may set a lower limit.`}>
              <Input type="number" min={10} value={quota} onChange={(e) => setQuota(e.target.value)} />
            </Field>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-muted">
            {s.retentionRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
              Save retention settings
            </Button>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title="Retention sweep"
          description="Runs daily as a background job. Safe to run again at any time."
          action={
            <Button size="sm" icon={<PlayIcon size={14} />} loading={run.isPending} onClick={() => run.mutate()}>
              Run now
            </Button>
          }
        />
        <CardBody>
          {s.retentionRuns.length === 0 ? (
            <p className="text-[13.5px] text-muted">No sweep has run yet.</p>
          ) : (
            <ul className="space-y-4">
              {s.retentionRuns.map((run) => (
                <li key={run.id}>
                  <div className="mb-2 flex items-center justify-between text-[13px]">
                    <StatusBadge status={run.status} />
                    <span className="text-muted">{formatDateTime(run.updatedAt)}</span>
                  </div>
                  {run.result && <JsonBlock value={run.result} label="Sweep result" />}
                  {run.lastError && <p className="text-[12.5px] text-danger">{run.lastError}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function AccessTab({ s }: { s: Settings }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<boolean | null>(null);
  const save = useMutation({
    mutationFn: (open: boolean) => api.put('/admin/settings', { signupOpen: open }),
    onSuccess: (_r, open) => {
      toast.success(open ? 'Self-service sign-up is open' : 'Self-service sign-up is closed. Invitations still work.');
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <Card>
          <CardHeader title="Security" description="Built into the server and shown here for reference. Changing these needs a code or environment change." />
          <CardBody>
            <DetailList
              items={[
                ['Sessions', String(s.security.sessionNote)],
                ['Passwords', String(s.security.passwordPolicy)],
                ['Lockout', String(s.security.lockout)],
                ['Request forgery', String(s.security.csrf)],
                ['Secrets', String(s.security.secrets)],
              ]}
            />
          </CardBody>
        </Card>
      </div>
      <div className="min-w-0 space-y-8">
        <Card>
          <CardHeader title="Sign-up" />
          <CardBody className="space-y-3">
            <Switch
              checked={s.signupOpen}
              onCheckedChange={(v) => setConfirm(v)}
              label="Allow anyone to create an account"
              description="When off, only people with an organization invitation can register. Existing accounts are not affected."
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Sample data" />
          <CardBody>
            <p className="text-[13.5px] text-muted">{s.demoData.note}</p>
            <p className="mt-2 text-[13.5px]">
              {s.demoData.sampleUsers} sample accounts in {s.demoData.sampleOrgs} sample organizations. Demo seeding on fresh databases is {s.demoData.seedingEnabled ? 'enabled' : 'disabled'}.
            </p>
          </CardBody>
        </Card>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={confirm ? 'Open self-service sign-up?' : 'Close self-service sign-up?'}
        description={confirm ? 'Anyone with the link can create an account.' : 'New people can only join with an organization invitation. Existing accounts keep working.'}
        confirmLabel={confirm ? 'Open sign-up' : 'Close sign-up'}
        danger={confirm === false}
        loading={save.isPending}
        onConfirm={() => {
          if (confirm !== null) save.mutate(confirm);
        }}
      />
    </div>
  );
}

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'features';
  const settings = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api.get<Settings>('/admin/settings'), enabled: tab === 'retention' || tab === 'access' });
  return (
    <div>
      <PageHeader title="Platform settings" description="Features, plans and limits, data retention and access rules for the whole platform. Every change is recorded in the audit log." />
      <Tabs
        className="mb-6"
        value={tab}
        onValueChange={(v) => setParams({ tab: v }, { replace: true })}
        tabs={[
          { value: 'features', label: 'Features' },
          { value: 'plans', label: 'Plans and limits' },
          { value: 'retention', label: 'Retention and storage' },
          { value: 'access', label: 'Access and security' },
        ]}
      />
      {tab === 'features' && <FeaturesTab />}
      {tab === 'plans' && <PlansTab />}
      {(tab === 'retention' || tab === 'access') && (
        <>
          {settings.isLoading && <SkeletonRows rows={5} />}
          {settings.error && <ErrorState error={settings.error} onRetry={() => settings.refetch()} />}
          {settings.data && tab === 'retention' && <RetentionTab s={settings.data} />}
          {settings.data && tab === 'access' && <AccessTab s={settings.data} />}
        </>
      )}
      {tab === 'access' && !settings.data?.signupOpen && settings.data && (
        <Banner tone="info" className="mt-4">
          Sign-up is closed. Organization admins can still invite people from their workspace.
        </Banner>
      )}
    </div>
  );
}
