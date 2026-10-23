import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Banner, Button, Field, Input } from '@/components/ui';
import { AuthLayout } from './AuthLayout';

export default function RegisterPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const inviteToken = params.get('invite') ?? undefined;
  const [form, setForm] = useState({ name: '', email: params.get('email') ?? '', password: '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/register', { ...form, inviteToken });
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate('/onboarding', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'error', 'Registration failed.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Free to use. Takes under a minute, then we'll tailor your plan."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent-text hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && !Object.keys(error.fields).length && <Banner tone="danger">{error.message}</Banner>}
        {inviteToken && <Banner tone="info">You're joining through an organization invitation. Use the email address the invitation was sent to.</Banner>}
        <Field label="Full name" error={error?.fields.name}>
          <Input autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </Field>
        <Field label="Email" error={error?.fields.email ?? (error?.status === 409 ? error.message : undefined)}>
          <Input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Password" helper="At least 10 characters, with a letter and a number." error={error?.fields.password}>
          <Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
          Create account
        </Button>
        <p className="text-center text-[12px] text-subtle">
          We store only what the platform needs. You can export or delete your data at any time from Settings → Privacy.
        </p>
      </form>
    </AuthLayout>
  );
}
