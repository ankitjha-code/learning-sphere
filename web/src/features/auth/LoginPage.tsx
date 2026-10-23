import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Banner, Button, Field, Input, Badge } from '@/components/ui';
import { AuthLayout } from './AuthLayout';

type DemoAccount = { email: string; role: string; description: string };

export default function LoginPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const demo = useQuery({ queryKey: ['demo-accounts'], queryFn: () => api.get<{ enabled: boolean; password?: string; accounts: DemoAccount[] }>('/system/demo-accounts') });

  async function submit(e: FormEvent, override?: { email: string; password: string }) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/login', override ?? { email, password });
      await qc.invalidateQueries({ queryKey: ['me'] });
      const next = params.get('next');
      navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/app', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'error', 'Sign-in failed.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue where you left off."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="font-medium text-accent-text hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Banner tone="danger">{error.message}</Banner>}
        <Field label="Email" error={error?.fields.email}>
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Field label="Password" error={error?.fields.password}>
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-[13px] text-muted hover:text-fg hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
          Sign in
        </Button>
      </form>

      {demo.data?.enabled && demo.data.accounts.length > 0 && (
        <div className="mt-10 overflow-hidden rounded-lg border border-border bg-surface shadow-1">
          <div className="border-b border-border px-4 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px] font-semibold">Demo accounts</span>
              <Badge tone="warning">Sample data</Badge>
            </div>
            <p className="mt-1 text-[12.5px] text-muted">
              One click signs in as a role. Password for all: <code className="rounded-sm bg-surface-2 px-1 py-px font-mono text-[12px] text-fg">{demo.data.password}</code>
            </p>
          </div>
          <div className="max-h-[360px] divide-y divide-border overflow-y-auto">
            {demo.data.accounts.map((a) => (
              <button
                key={a.email}
                type="button"
                disabled={loading}
                onClick={(e) => submit(e as unknown as FormEvent, { email: a.email, password: demo.data!.password! })}
                className="group flex w-full min-w-0 items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent-soft/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium group-hover:text-accent-text">{a.role}</span>
                  <span className="block truncate text-[12px] text-muted">{a.description}</span>
                </span>
                <span className="max-w-[40%] shrink-0 truncate font-mono text-[11.5px] text-subtle">{a.email.split('@')[0]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
