import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PlusIcon, TrashIcon, ArrowSquareOutIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { Banner, Button, ButtonLink, Card, CardBody, CardHeader, ErrorState, Field, Input, PageHeader, Select, Skeleton, StatusBadge, Switch, Textarea } from '@/components/ui';
import { DAYS } from '@/features/mentors/shared';

type Slot = { day: number; start: string; end: string };
type Profile = {
  userId: string;
  headline: string;
  bio: string;
  expertise: string[];
  yearsExperience: number | null;
  availability: Slot[];
  maxMentees: number;
  acceptingRequests: boolean;
  status: string;
};
type ProfileResp = {
  profile: Profile | null;
  workspaceUnlocked: boolean;
  orgMentor: { orgId: string; orgName: string } | null;
  activeMentees: number;
};

export default function MentorProfileEditPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['mentor-profile'],
    queryFn: () => api.get<ProfileResp>('/mentorship/profile'),
  });
  const [form, setForm] = useState({
    headline: '',
    bio: '',
    expertise: '',
    yearsExperience: '',
    maxMentees: '5',
    acceptingRequests: true,
  });
  const [slots, setSlots] = useState<Slot[]>([]);
  useEffect(() => {
    const p = q.data?.profile;
    if (!p) return;
    setForm({
      headline: p.headline,
      bio: p.bio,
      expertise: p.expertise.join(', '),
      yearsExperience: p.yearsExperience?.toString() ?? '',
      maxMentees: String(p.maxMentees),
      acceptingRequests: p.acceptingRequests,
    });
    setSlots(p.availability);
  }, [q.data?.profile]);
  const save = useMutation({
    mutationFn: () =>
      api.put<{ profile: Profile }>('/mentorship/profile', {
        headline: form.headline,
        bio: form.bio,
        expertise: form.expertise
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        yearsExperience: form.yearsExperience ? Number(form.yearsExperience) : null,
        availability: slots,
        maxMentees: Number(form.maxMentees),
        acceptingRequests: form.acceptingRequests,
      }),
    onSuccess: (r) => {
      toast.success(r.profile.status === 'pending' ? 'Profile saved and sent for review' : 'Mentor profile saved');
      qc.invalidateQueries({ queryKey: ['mentor-profile'] });
      qc.invalidateQueries({ queryKey: ['mentor-workspace'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
  const fields = save.error instanceof ApiError ? save.error.fields : {};
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const p = d.profile;
  return (
    <div>
      <PageHeader
        title="Mentor profile"
        description="What learners see when they look for a mentor. Your email is never shown."
        badge={p ? <StatusBadge status={p.status} /> : undefined}
        actions={
          p?.status === 'active' && (
            <ButtonLink to={`/app/mentors/${p.userId}`} icon={<ArrowSquareOutIcon size={15} />}>
              View public profile
            </ButtonLink>
          )
        }
      />
      <div className="mb-6 space-y-3 empty:hidden">
        {!p && d.orgMentor && <Banner tone="info">You mentor through {d.orgMentor.orgName}, so your profile is active as soon as you save it.</Banner>}
        {!p && !d.orgMentor && <Banner tone="info">New mentor profiles are reviewed by the platform team before learners can find you. This usually takes a day or two.</Banner>}
        {p?.status === 'pending' && (
          <Banner tone="warning" title="Waiting for approval">
            You can keep editing. Learners will find you once it is approved.
          </Banner>
        )}
        {p?.status === 'rejected' && (
          <Banner tone="warning" title="Not approved">
            Update your profile and save to submit it again.
          </Banner>
        )}
        {save.error && !Object.keys(fields).length && <Banner tone="danger">{errorMessage(save.error)}</Banner>}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title="About you" description="Shown on your public mentor card and profile." />
            <CardBody className="space-y-4">
              <Field label="Headline" error={fields.headline} helper="Your role and what you help with, in one line.">
                <Input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} maxLength={160} />
              </Field>
              <Field label="Bio" error={fields.bio}>
                <Textarea rows={5} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} maxLength={3000} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
                <Field label="Expertise" error={fields.expertise} helper="Separate with commas, for example: backend, system design, interviews">
                  <Input value={form.expertise} onChange={(e) => setForm({ ...form, expertise: e.target.value })} />
                </Field>
                <Field label="Years of experience" optional error={fields.yearsExperience}>
                  <Input type="number" min={0} max={60} value={form.yearsExperience} onChange={(e) => setForm({ ...form, yearsExperience: e.target.value })} />
                </Field>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Availability" description="Weekly windows in your local time. Learners see these before requesting." />
            <CardBody className="space-y-3">
              {slots.length === 0 && <p className="text-[13px] text-muted">No time windows yet. Add one so learners know when you are free.</p>}
              {slots.map((s, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <div className="w-32">
                    <Select aria-label="Day" value={s.day} onChange={(e) => setSlots(slots.map((x, j) => (j === i ? { ...x, day: Number(e.target.value) } : x)))}>
                      {DAYS.map((d, di) => (
                        <option key={d} value={di}>
                          {d}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Input aria-label="Start time" type="time" className="w-32" value={s.start} onChange={(e) => setSlots(slots.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                  <span className="text-[13px] text-muted">to</span>
                  <Input aria-label="End time" type="time" className="w-32" value={s.end} onChange={(e) => setSlots(slots.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
                  <Button variant="ghost" size="icon" aria-label="Remove time slot" onClick={() => setSlots(slots.filter((_, j) => j !== i))}>
                    <TrashIcon size={16} />
                  </Button>
                </div>
              ))}
              {fields.availability && <p className="text-[12.5px] text-danger">{fields.availability}</p>}
              <Button
                size="sm"
                icon={<PlusIcon size={14} />}
                onClick={() => setSlots([...slots, { day: 2, start: '18:00', end: '19:00' }])}
                disabled={slots.length >= 21}
                disabledReason="Up to 21 slots"
              >
                Add time slot
              </Button>
            </CardBody>
          </Card>
        </div>
        <div className="min-w-0 space-y-4 lg:sticky lg:top-6">
          <Card>
            <CardHeader title="Capacity" description={`You have ${d.activeMentees} active ${d.activeMentees === 1 ? 'mentee' : 'mentees'}.`} />
            <CardBody className="space-y-4">
              <Field label="Maximum active mentees" error={fields.maxMentees} helper="Requests can't be accepted beyond this. Keep it sustainable.">
                <Input type="number" min={1} max={30} className="w-32" value={form.maxMentees} onChange={(e) => setForm({ ...form, maxMentees: e.target.value })} />
              </Field>
              <Switch
                checked={form.acceptingRequests}
                onCheckedChange={(v) => setForm({ ...form, acceptingRequests: v })}
                label="Accepting new requests"
                description="Turn off to pause new requests. Current mentees are not affected."
              />
            </CardBody>
          </Card>
          <Button variant="primary" className="w-full" loading={save.isPending} onClick={() => save.mutate()}>
            {p ? 'Save profile' : 'Create profile'}
          </Button>
          {!p && <p className="text-center text-[12.5px] text-muted">You can change everything later.</p>}
        </div>
      </div>
    </div>
  );
}
