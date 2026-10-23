import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SunIcon, MoonIcon, MonitorIcon, FloppyDiskIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useMe, type Me } from '@/lib/session';
import { applyTheme, applyReducedMotion, getThemePref, type ThemePref } from '@/lib/theme';
import { Button, Card, CardBody, CardHeader, Checkbox, ErrorState, Field, Segmented, Select, Skeleton, Switch } from '@/components/ui';
import { SettingsFooter, fieldErrors, timeZones, type Preferences, type PreferencesPatch } from './shared';

const LOCALES = [
  { value: 'en', label: 'English' },
  { value: 'en-IN', label: 'English (India)' },
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'hi', label: 'Hindi' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
];

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MAX_REST_DAYS = 3;

/** PATCH /me/preferences with an optimistic update of the ['me'] cache, rolled back on failure. */
function usePatchPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { patch: PreferencesPatch; success: string }) => api.patch<{ preferences: Preferences }>('/me/preferences', v.patch),
    onMutate: async ({ patch }) => {
      await qc.cancelQueries({ queryKey: ['me'], exact: true });
      const prev = qc.getQueryData<Me>(['me']);
      if (prev?.user) {
        const { locale, ...prefs } = patch;
        qc.setQueryData<Me>(['me'], {
          ...prev,
          user: { ...prev.user, ...(locale ? { locale } : {}), preferences: { ...prev.user.preferences, ...prefs } },
        });
      }
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['me'], ctx.prev);
      toast.error(errorMessage(e));
    },
    onSuccess: (_r, v) => toast.success(v.success),
    onSettled: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
}

export default function PreferencesPage() {
  const me = useMe();
  if (me.error) return <ErrorState error={me.error} onRetry={() => me.refetch()} />;
  if (me.isLoading || !me.data?.user) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading preferences">
        <Skeleton className="h-44" />
        <Skeleton className="h-40" />
        <Skeleton className="h-56" />
      </div>
    );
  }
  return <PreferencesForm user={me.data.user} />;
}

function PreferencesForm({ user }: { user: NonNullable<Me['user']> }) {
  const prefs = user.preferences as Preferences;
  const patch = usePatchPreferences();
  const theme: ThemePref = prefs.theme ?? getThemePref();
  const restDays = prefs.restDays ?? [];

  const setTheme = (t: ThemePref) => {
    const before = theme;
    applyTheme(t);
    patch.mutate(
      { patch: { theme: t }, success: `Theme set to ${t === 'system' ? 'match your system' : t}.` },
      { onError: () => applyTheme(before) },
    );
  };

  const setReducedMotion = (on: boolean) => {
    applyReducedMotion(on);
    patch.mutate(
      { patch: { reducedMotion: on }, success: on ? 'Reduced motion turned on.' : 'Reduced motion turned off.' },
      { onError: () => applyReducedMotion(!on) },
    );
  };

  const toggleRestDay = (day: number, on: boolean) => {
    const next = on ? [...restDays, day].sort((a, b) => a - b) : restDays.filter((d) => d !== day);
    patch.mutate({
      patch: { restDays: next },
      success: next.length ? `Rest days: ${next.map((d) => WEEKDAYS[d]).join(', ')}.` : 'Rest days cleared. Every day counts toward your streak.',
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Appearance" description="Changes apply right away and follow you to other devices." />
        <CardBody className="space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[14px] font-medium">Theme</div>
              <div className="text-[12.5px] text-muted">System follows your device's light or dark setting.</div>
            </div>
            <Segmented<ThemePref>
              label="Theme"
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'light', label: <span className="inline-flex items-center gap-1.5"><SunIcon size={14} aria-hidden /> Light</span> },
                { value: 'dark', label: <span className="inline-flex items-center gap-1.5"><MoonIcon size={14} aria-hidden /> Dark</span> },
                { value: 'system', label: <span className="inline-flex items-center gap-1.5"><MonitorIcon size={14} aria-hidden /> System</span> },
              ]}
            />
          </div>
          <Switch
            label="Reduce motion"
            description="Turns off non-essential animations and transitions."
            checked={!!prefs.reducedMotion}
            onCheckedChange={setReducedMotion}
          />
        </CardBody>
      </Card>

      <RegionCard locale={user.locale} timezone={user.timezone} />

      <Card>
        <CardHeader title="Streaks and reminders" description="Rest days keep your streak alive on days you plan not to study." />
        <CardBody className="space-y-5">
          <fieldset>
            <legend className="text-[14px] font-medium">Rest days</legend>
            <p className="text-[12.5px] text-muted">
              Choose up to {MAX_REST_DAYS}. {restDays.length >= MAX_REST_DAYS ? 'Clear one to pick a different day.' : `${MAX_REST_DAYS - restDays.length} left.`}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {WEEKDAYS.map((name, day) => {
                const checked = restDays.includes(day);
                const locked = !checked && restDays.length >= MAX_REST_DAYS;
                return (
                  <div key={day} title={locked ? `You already chose ${MAX_REST_DAYS} rest days. Clear one first.` : undefined}>
                    <Checkbox label={name} checked={checked} disabled={locked || patch.isPending} onCheckedChange={(v) => toggleRestDay(day, v)} />
                  </div>
                );
              })}
            </div>
          </fieldset>
          <Switch
            label="Study reminders"
            description="A nudge on days you have not studied yet. Delivery follows your notification settings for learning reminders."
            checked={!!prefs.studyReminders}
            onCheckedChange={(v) => patch.mutate({ patch: { studyReminders: v }, success: v ? 'Study reminders turned on.' : 'Study reminders turned off.' })}
          />
        </CardBody>
      </Card>
    </div>
  );
}

function RegionCard({ locale, timezone }: { locale: string; timezone: string }) {
  const qc = useQueryClient();
  const [loc, setLoc] = useState(locale || 'en');
  const [tz, setTz] = useState(timezone || 'UTC');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const zones = useMemo(() => timeZones(tz), [tz]);
  const locales = LOCALES.some((l) => l.value === loc) ? LOCALES : [{ value: loc, label: loc }, ...LOCALES];
  const dirty = loc !== (locale || 'en') || tz !== (timezone || 'UTC');

  const save = useMutation({
    mutationFn: async () => {
      setErrors({});
      try {
        if (loc !== locale) await api.patch('/me/preferences', { locale: loc });
        if (tz !== timezone) await api.put('/me/profile', { timezone: tz });
      } catch (e) {
        setErrors(fieldErrors(e));
        throw e;
      }
    },
    onSuccess: () => {
      toast.success('Language and region saved.');
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <Card>
      <CardHeader title="Language and region" description="Used to format dates and numbers, and to schedule reminders in your local time." />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Locale" error={errors.locale}>
            <Select value={loc} onChange={(e) => setLoc(e.target.value)}>
              {locales.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Time zone"
            error={errors.timezone}
            helper={
              detected && detected !== tz ? (
                <>
                  This device reports {detected.replace(/_/g, ' ')}.{' '}
                  <button type="button" className="font-medium text-accent-text underline-offset-2 hover:underline" onClick={() => setTz(detected)}>
                    Use it
                  </button>
                </>
              ) : undefined
            }
          >
            <Select value={tz} onChange={(e) => setTz(e.target.value)}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
        <SettingsFooter note={dirty ? 'Unsaved changes' : undefined}>
          <Button type="submit" variant="primary" icon={<FloppyDiskIcon size={16} />} loading={save.isPending} disabled={!dirty} disabledReason="No changes to save">
            Save language and region
          </Button>
        </SettingsFooter>
      </form>
    </Card>
  );
}
