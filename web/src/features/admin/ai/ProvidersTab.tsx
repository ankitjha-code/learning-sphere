import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowDownIcon,
  ArrowSquareOutIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  PencilSimpleIcon,
  PlugsConnectedIcon,
  PlusIcon,
  ShieldWarningIcon,
  TrashIcon,
  WarningCircleIcon,
  RobotIcon,
} from '@phosphor-icons/react';
import { api, ApiError, errorMessage } from '@/lib/api';
import { Badge, Banner, Button, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input, Select, SkeletonRows, Switch } from '@/components/ui';

export type Preset = {
  id: string;
  label: string;
  baseUrl: string;
  baseUrlHelp?: string;
  authStyle: 'bearer' | 'api-key' | 'none';
  keyOptional?: boolean;
  models: { id: string; note?: string }[];
  defaultModel: string;
  modelHelp?: string;
  freeTier: string;
  dataNotice: string | null;
  trainingUse: boolean;
  docsUrl: string;
  signupUrl: string;
  envVars: string[];
};

export type Provider = {
  id: string;
  preset: string;
  label: string;
  baseUrl: string;
  model: string;
  keySource: 'db' | 'env' | 'none';
  envVar: string | null;
  keyMasked: string | null;
  priority: number;
  enabled: boolean;
  timeoutMs: number;
  dataNotice: string | null;
  problem: string | null;
  health: { circuitOpenSeconds: number; consecutiveFailures: number; lastError: string | null };
};

type TestResult = { ok: boolean; latencyMs: number; sample?: string; error?: string };

export function TestResultLine({ r }: { r: TestResult | null }) {
  if (!r) return null;
  return r.ok ? (
    <p className="flex items-start gap-1.5 text-[12.5px] text-success" role="status">
      <CheckCircleIcon size={15} className="mt-px shrink-0" weight="fill" aria-hidden />
      <span>
        Connected in {r.latencyMs} ms. Reply: <span className="font-mono text-fg">{r.sample}</span>
      </span>
    </p>
  ) : (
    <p className="flex items-start gap-1.5 text-[12.5px] text-danger" role="alert">
      <WarningCircleIcon size={15} className="mt-px shrink-0" weight="fill" aria-hidden />
      <span>{r.error ?? 'Connection failed.'}</span>
    </p>
  );
}

export function ProvidersTab() {
  const qc = useQueryClient();
  const presets = useQuery({ queryKey: ['admin', 'ai', 'presets'], queryFn: () => api.get<{ presets: Preset[]; limitations: string }>('/ai/admin/presets') });
  const q = useQuery({ queryKey: ['admin', 'ai', 'providers'], queryFn: () => api.get<{ items: Provider[] }>('/ai/admin/providers') });
  const [editing, setEditing] = useState<Provider | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Provider | null>(null);
  const [tests, setTests] = useState<Record<string, TestResult>>({});

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'ai', 'providers'] });
    qc.invalidateQueries({ queryKey: ['ai', 'status'] });
  };

  const toggle = useMutation({
    mutationFn: (p: Provider) => api.patch(`/ai/admin/providers/${p.id}`, { enabled: !p.enabled }),
    onSuccess: (_d, p) => {
      toast.success(p.enabled ? `${p.label} disabled` : `${p.label} enabled`);
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.post('/ai/admin/providers/reorder', { ids }),
    onSuccess: () => {
      toast.success('Order saved');
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const test = useMutation({
    mutationFn: (p: Provider) => api.post<{ result: TestResult }>(`/ai/admin/providers/${p.id}/test`, {}),
    onSuccess: (r, p) => {
      setTests((t) => ({ ...t, [p.id]: r.result }));
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (p: Provider) => api.del(`/ai/admin/providers/${p.id}`),
    onSuccess: () => {
      toast.success('Provider removed');
      setDeleting(null);
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const items = q.data?.items ?? [];
  const move = (idx: number, dir: -1 | 1) => {
    const ids = items.map((p) => p.id);
    const j = idx + dir;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    reorder.mutate(ids);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <p className="max-w-[72ch] text-[13.5px] leading-relaxed text-muted">
          Requests try providers from top to bottom. A provider that fails or rate-limits is skipped for about a minute and the next one answers. Keys are encrypted at rest and only shown masked.
          Providers set by environment variables appear automatically.
        </p>
        <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setEditing('new')} disabled={!presets.data} disabledReason="Loading provider presets">
          Add provider
        </Button>
      </div>

      {q.isLoading ? (
        <SkeletonRows rows={3} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<RobotIcon size={22} />}
          title="No AI provider yet"
          description="Add a free provider such as Gemini (AI Studio key) or Groq, or set GEMINI_API_KEY / GROQ_API_KEY on the server and restart. Until then AI panels explain that AI is not configured."
          action={
            <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setEditing('new')} disabled={!presets.data}>
              Add provider
            </Button>
          }
        />
      ) : (
        <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
          {items.map((p, i) => (
            <li key={p.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-start">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div className="-ml-1 flex shrink-0 flex-col gap-0.5">
                  <Button size="icon-sm" variant="ghost" aria-label={`Move ${p.label} up`} disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)}>
                    <ArrowUpIcon size={14} />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Move ${p.label} down`} disabled={i === items.length - 1 || reorder.isPending} onClick={() => move(i, 1)}>
                    <ArrowDownIcon size={14} />
                  </Button>
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] tabular-nums text-subtle">#{i + 1}</span>
                    <h3 className="text-[15px] font-semibold">{p.label}</h3>
                    <Badge>{presets.data?.presets.find((x) => x.id === p.preset)?.label ?? p.preset}</Badge>
                    {p.keySource === 'env' && <Badge tone="info">From environment</Badge>}
                    {!p.enabled ? (
                      <Badge>Disabled</Badge>
                    ) : p.problem ? (
                      <Badge tone="danger">Not usable</Badge>
                    ) : p.health.circuitOpenSeconds > 0 ? (
                      <Badge tone="warning">Cooling down {p.health.circuitOpenSeconds}s</Badge>
                    ) : (
                      <Badge tone="success">Active</Badge>
                    )}
                  </div>
                  <div className="text-[13px] text-muted">
                    Model <span className="font-mono text-fg">{p.model}</span>
                    {' · '}Key <span className="font-mono">{p.keySource === 'none' ? 'none' : (p.keyMasked ?? 'missing')}</span>
                    {p.envVar && <span className="text-subtle"> ({p.envVar})</span>}
                    {' · '}Timeout {Math.round(p.timeoutMs / 1000)}s
                  </div>
                  <div className="truncate font-mono text-[11.5px] text-subtle">{p.baseUrl}</div>
                  {p.problem && <p className="text-[12.5px] text-danger">{p.problem}</p>}
                  {p.health.lastError && p.health.consecutiveFailures > 0 && <p className="text-[12.5px] text-warning">Last error: {p.health.lastError}</p>}
                  {p.dataNotice && (
                    <p className="flex items-start gap-1.5 text-[12.5px] text-muted">
                      <ShieldWarningIcon size={14} className="mt-px shrink-0 text-warning" aria-hidden />
                      {p.dataNotice}
                    </p>
                  )}
                  <TestResultLine r={tests[p.id] ?? null} />
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5 pl-9 lg:pl-0">
                <Button size="sm" icon={<PlugsConnectedIcon size={14} />} loading={test.isPending && test.variables?.id === p.id} onClick={() => test.mutate(p)}>
                  Test connection
                </Button>
                <Button size="sm" variant="ghost" icon={<PencilSimpleIcon size={14} />} onClick={() => setEditing(p)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<TrashIcon size={14} />}
                  onClick={() => setDeleting(p)}
                  disabled={p.keySource === 'env'}
                  disabledReason="Set by environment variables. Disable it here or remove the variable on the server."
                >
                  Remove
                </Button>
                <span className="mx-1 h-5 w-px bg-border" aria-hidden />
                <Switch checked={p.enabled} onCheckedChange={() => toggle.mutate(p)} label={<span className="sr-only">Enable {p.label}</span>} disabled={toggle.isPending} />
              </div>
            </li>
          ))}
        </ol>
      )}

      {presets.data && (
        <Banner tone="info" title="About prompt injection">
          {presets.data.limitations}
        </Banner>
      )}

      {editing && presets.data && (
        <ProviderDialog
          key={editing === 'new' ? 'new' : editing.id}
          presets={presets.data.presets}
          provider={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={invalidate}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Remove provider?"
        description={`${deleting?.label ?? ''} and its encrypted key will be deleted. Requests will use the remaining providers.`}
        confirmLabel="Remove"
        danger
        loading={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
        }}
      />
    </div>
  );
}

const CUSTOM = '__custom__';

function ProviderDialog({ presets, provider, onClose, onSaved }: { presets: Preset[]; provider: Provider | null; onClose: () => void; onSaved: () => void }) {
  const isEnv = provider?.keySource === 'env';
  const [presetId, setPresetId] = useState(provider?.preset ?? presets[0]?.id ?? 'gemini');
  const preset = presets.find((p) => p.id === presetId);
  const [label, setLabel] = useState(provider?.label ?? preset?.label ?? '');
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? preset?.baseUrl ?? '');
  const knownModel = (m: string) => !!preset?.models.some((x) => x.id === m);
  const initialModel = provider?.model ?? preset?.defaultModel ?? '';
  const [modelChoice, setModelChoice] = useState(initialModel && knownModel(initialModel) ? initialModel : CUSTOM);
  const [customModel, setCustomModel] = useState(initialModel && !knownModel(initialModel) ? initialModel : '');
  const [apiKey, setApiKey] = useState('');
  const [reveal, setReveal] = useState(false);
  const [timeout, setTimeoutSec] = useState(String(Math.round((provider?.timeoutMs ?? 30000) / 1000)));
  const [fields, setFields] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Switching preset (new provider only) resets preset-specific defaults.
  useEffect(() => {
    if (provider || !preset) return;
    setLabel(preset.label);
    setBaseUrl(preset.baseUrl);
    setModelChoice(preset.models.length ? preset.defaultModel : CUSTOM);
    setCustomModel(preset.models.length ? '' : preset.defaultModel);
    setTestResult(null);
    setFields({});
  }, [presetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The key is only visible while typing: hide it again whenever the field empties.
  useEffect(() => {
    if (!apiKey) setReveal(false);
  }, [apiKey]);

  const model = modelChoice === CUSTOM ? customModel.trim() : modelChoice;
  const timeoutMs = Math.max(2, Math.min(120, Number(timeout) || 30)) * 1000;
  const payload = useMemo(
    () => ({
      label: label.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
      model,
      apiKey: apiKey.trim() || undefined,
      timeoutMs,
    }),
    [label, baseUrl, model, apiKey, timeoutMs],
  );

  const save = useMutation({
    mutationFn: () => {
      if (provider) {
        const body: Record<string, unknown> = { label: payload.label, model: payload.model, timeoutMs };
        if (!isEnv) {
          body.baseUrl = payload.baseUrl;
          if (payload.apiKey) body.apiKey = payload.apiKey;
        }
        return api.patch(`/ai/admin/providers/${provider.id}`, body);
      }
      return api.post('/ai/admin/providers', { preset: presetId, ...payload });
    },
    onSuccess: () => {
      toast.success(provider ? 'Provider saved' : 'Provider added');
      onSaved();
      onClose();
    },
    onError: (e) => {
      setFields(e instanceof ApiError ? e.fields : {});
      toast.error(errorMessage(e));
    },
  });
  const test = useMutation({
    mutationFn: () =>
      api.post<{ result: TestResult }>('/ai/admin/providers/test', {
        preset: presetId,
        baseUrl: payload.baseUrl,
        model: payload.model,
        apiKey: payload.apiKey,
        providerId: provider?.id,
        timeoutMs,
      }),
    onSuccess: (r) => setTestResult(r.result),
    onError: (e) => {
      setFields(e instanceof ApiError ? e.fields : {});
      setTestResult({ ok: false, latencyMs: 0, error: errorMessage(e) });
    },
  });

  const needsKey = !provider && preset && !preset.keyOptional && !apiKey.trim();
  const blocked = !model ? 'Choose or enter a model' : needsKey ? 'Enter the API key' : undefined;

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={provider ? `Edit ${provider.label}` : 'Add AI provider'}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button icon={<PlugsConnectedIcon size={15} />} loading={test.isPending} disabled={!model} disabledReason="Choose or enter a model" onClick={() => test.mutate()}>
            Test connection
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!!blocked} disabledReason={blocked} onClick={() => save.mutate()}>
            {provider ? 'Save' : 'Add provider'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!blocked) save.mutate();
        }}
      >
        {isEnv && (
          <Banner tone="info" title="Configured by environment variables">
            The key and base URL come from {provider?.envVar ?? 'environment variables'} on the server and are never stored in the database. You can change the label, model and timeout here.
          </Banner>
        )}
        <Field label="Provider" error={fields.preset}>
          <Select value={presetId} onChange={(e) => setPresetId(e.target.value)} disabled={!!provider}>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        {preset && (
          <div className="space-y-2 rounded-md border border-border bg-surface-2 p-3 text-[13px]">
            <p className="text-muted">{preset.freeTier}</p>
            {preset.dataNotice && (
              <p className="flex items-start gap-1.5 text-fg">
                <ShieldWarningIcon size={15} className="mt-px shrink-0 text-warning" aria-hidden />
                {preset.dataNotice}
              </p>
            )}
            {preset.trainingUse && (
              <p className="text-[12.5px] text-subtle">Emails, phone numbers and secret-looking strings are redacted before requests go to this provider (change in Limits & toggles).</p>
            )}
            <div className="flex flex-wrap gap-3">
              {preset.signupUrl && (
                <a href={preset.signupUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-text hover:underline">
                  Get an API key <ArrowSquareOutIcon size={12} aria-hidden />
                </a>
              )}
              {preset.docsUrl && (
                <a href={preset.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-text hover:underline">
                  Free tier and limits <ArrowSquareOutIcon size={12} aria-hidden />
                </a>
              )}
              {preset.envVars.length > 0 && <span className="font-mono text-[11.5px] text-subtle">Env: {preset.envVars.join(', ')}</span>}
            </div>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display name" error={fields.label}>
            <Input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="Timeout (seconds)" helper="Per request. Between 2 and 120." error={fields.timeoutMs}>
            <Input type="number" min={2} max={120} value={timeout} onChange={(e) => setTimeoutSec(e.target.value)} />
          </Field>
        </div>
        <Field label="Base URL" helper={preset?.baseUrlHelp ?? 'The URL right before /chat/completions.'} error={fields.baseUrl}>
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} disabled={isEnv} className="font-mono text-[13px]" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Model" helper={preset?.models.find((m) => m.id === modelChoice)?.note ?? preset?.modelHelp} error={fields.model}>
            <Select value={modelChoice} onChange={(e) => setModelChoice(e.target.value)}>
              {preset?.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                </option>
              ))}
              <option value={CUSTOM}>Custom model…</option>
            </Select>
          </Field>
          {modelChoice === CUSTOM && (
            <Field label="Custom model id" helper={preset?.modelHelp}>
              <Input value={customModel} onChange={(e) => setCustomModel(e.target.value)} className="font-mono text-[13px]" placeholder="model-name" />
            </Field>
          )}
        </div>
        {!isEnv && preset?.authStyle !== 'none' && (
          <Field
            label="API key"
            optional={!!preset?.keyOptional || !!provider}
            helper={provider?.keyMasked ? `Saved key ${provider.keyMasked}. Leave empty to keep it.` : 'Stored encrypted. It is never shown again after saving.'}
            error={fields.apiKey}
          >
            <div className="relative">
              <Input
                type={reveal ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="pr-10 font-mono text-[13px]"
                placeholder={provider?.keyMasked ?? ''}
              />
              {apiKey && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-fg"
                  aria-label={reveal ? 'Hide key' : 'Show key while typing'}
                  aria-pressed={reveal}
                  onClick={() => setReveal((v) => !v)}
                >
                  {reveal ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              )}
            </div>
          </Field>
        )}
        <TestResultLine r={testResult} />
      </form>
    </Dialog>
  );
}
