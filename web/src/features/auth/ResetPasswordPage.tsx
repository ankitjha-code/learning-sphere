import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { Banner, Button, Field, Input, ButtonLink } from '@/components/ui';
import { AuthLayout } from './AuthLayout';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/password-reset/confirm', { token, password });
      setDone(true);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="For your security, all your sessions will be signed out.">
      {!token ? (
        <Banner tone="danger" title="This link is incomplete">
          Open the full link from your email, or <Link to="/forgot-password" className="underline">request a new one</Link>.
        </Banner>
      ) : done ? (
        <div className="space-y-4">
          <Banner tone="success" title="Password updated">You can now sign in with your new password.</Banner>
          <ButtonLink to="/login" variant="primary" size="lg" className="w-full">
            Sign in
          </ButtonLink>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && !error.fields.password && <Banner tone="danger">{error.message}</Banner>}
          <Field label="New password" helper="At least 10 characters, with a letter and a number." error={error?.fields.password}>
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </Field>
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
            Update password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
