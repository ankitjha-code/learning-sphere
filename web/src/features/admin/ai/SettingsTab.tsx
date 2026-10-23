import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { Button, Card, CardBody, CardHeader, ErrorState, Field, Input, Select, SkeletonRows, Switch } from '@/components/ui';

type Settings = {
  enabled: boolean;
  disabledFeatures: string[];
  limits: { userDailyRequests: number; orgMonthlyRequests: number };
  redaction: 'notice_providers' | 'always' | 'off';
};

export function SettingsTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'ai', 'settings'], queryFn: () => api.get<{ settings: Settings; features: { id: string; label: string }[] }>('/ai/admin/settings') });
  const [form, setForm] = useState<Settings | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  useEffect(() => {
    if (q.data) setForm(q.data.settings);
  }, [q.data]);

  const save = useMutation({
    mutationFn: (s: Settings) => api.put<{ settings: Settings }>('/ai/admin/settings', s),
    onSuccess: () => {
      toast.success('AI settings saved');
      setFields({});
      qc.invalidateQueries({ queryKey: ['admin', 'ai', 'settings'] });
      qc.invalidateQueries({ queryKey: ['ai', 'status'] });
    },
    onError: (e) => {
      setFields(e instanceof ApiError ? e.fields : {});
      toast.error(errorMessage(e));
    },
  });

  if (q.isLoading || (!form && !q.error)) return <SkeletonRows rows={4} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const f = form!;
  const dirty = JSON.stringify(f) !== JSON.stringify(q.data!.settings);
  const setLimit = (k: keyof Settings['limits'], v: string) => setForm({ ...f, limits: { ...f.limits, [k]: Math.max(0, Math.floor(Number(v) || 0)) } });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(f);
      }}
    >
      <Card>
        <CardHeader title="Availability" description="Turning AI off hides nothing else: learning, practice, grading and career tools keep working." />
        <CardBody className="space-y-4">
          <Switch
            checked={f.enabled}
            onCheckedChange={(v) => setForm({ ...f, enabled: v })}
            label="AI features enabled"
            description="When off, every AI request returns a clear 'turned off by an administrator' message."
          />
          <div className="space-y-3 border-t border-border pt-4">
            <div className="text-[13px] font-medium">Features</div>
            {q.data!.features.map((ft) => (
              <Switch
                key={ft.id}
                checked={!f.disabledFeatures.includes(ft.id)}
                disabled={!f.enabled}
                onCheckedChange={(on) => setForm({ ...f, disabledFeatures: on ? f.disabledFeatures.filter((x) => x !== ft.id) : [...f.disabledFeatures, ft.id] })}
                label={ft.label}
                description={<span className="font-mono text-[11.5px]">{ft.id}</span>}
              />
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Limits"
          description="Free tiers have low limits, so these protect your quota. Organizations can override them in their settings (settings.ai.monthlyRequests, settings.ai.userDailyRequests). Only successful requests count."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Requests per user per day" helper="Resets at 00:00 UTC. Users are notified at 80%." error={fields['limits.userDailyRequests']}>
            <Input type="number" min={0} value={f.limits.userDailyRequests} onChange={(e) => setLimit('userDailyRequests', e.target.value)} />
          </Field>
          <Field label="Requests per organization per month" helper="Counts requests made while an organization is active." error={fields['limits.orgMonthlyRequests']}>
            <Input type="number" min={0} value={f.limits.orgMonthlyRequests} onChange={(e) => setLimit('orgMonthlyRequests', e.target.value)} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Privacy"
          description="Redaction replaces email addresses, phone numbers and secret-looking strings (API keys, tokens, passwords) before a request leaves the server. It is pattern based and can miss things."
        />
        <CardBody>
          <Field label="Redact personal data and secrets">
            <Select value={f.redaction} onChange={(e) => setForm({ ...f, redaction: e.target.value as Settings['redaction'] })}>
              <option value="notice_providers">For providers whose free tier may train on prompts (recommended)</option>
              <option value="always">For every provider</option>
              <option value="off">Never</option>
            </Select>
          </Field>
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <Button onClick={() => setForm(q.data!.settings)} disabled={!dirty} disabledReason="No changes">
          Discard
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending} disabled={!dirty} disabledReason="No changes">
          Save settings
        </Button>
      </div>
    </form>
  );
}
