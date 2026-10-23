import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/session';
import { Banner, Button, ButtonLink, SkeletonRows } from '@/components/ui';
import { ROLE_LABELS, type OrgRole } from '@shared/roles';
import { AuthLayout } from './AuthLayout';

export default function InvitePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const invite = useQuery({ queryKey: ['invite', token], queryFn: () => api.get<{ invite: { email: string; roles: OrgRole[]; orgName: string } }>(`/auth/invites/${token}`) });
  const accept = useMutation({
    mutationFn: () => api.post(`/auth/invites/${token}/accept`),
    onSuccess: async () => {
      await qc.invalidateQueries();
      navigate('/app');
    },
  });

  return (
    <AuthLayout title="Organization invitation">
      {invite.isLoading || me.isLoading ? (
        <SkeletonRows rows={3} />
      ) : invite.error ? (
        <Banner tone="danger" title="Invitation unavailable">This invitation is invalid, already used, or expired. Ask the sender for a new one.</Banner>
      ) : (
        <div className="space-y-4">
          <p className="text-[15px]">
            You've been invited to join <strong>{invite.data!.invite.orgName}</strong> as{' '}
            <strong>{invite.data!.invite.roles.map((r) => ROLE_LABELS[r]).join(', ')}</strong>.
          </p>
          <p className="text-[13.5px] text-muted">Invitation sent to {invite.data!.invite.email}.</p>
          {accept.error && <Banner tone="danger">{errorMessage(accept.error)}</Banner>}
          {me.data?.user ? (
            <Button variant="primary" size="lg" className="w-full" loading={accept.isPending} onClick={() => accept.mutate()}>
              Accept and join
            </Button>
          ) : (
            <div className="grid gap-2">
              <ButtonLink to={`/register?invite=${token}&email=${encodeURIComponent(invite.data!.invite.email)}`} variant="primary" size="lg">
                Create account and join
              </ButtonLink>
              <ButtonLink to={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} size="lg">
                I already have an account
              </ButtonLink>
            </div>
          )}
        </div>
      )}
    </AuthLayout>
  );
}
