import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from './api';
import type { Workspace, OrgRole, OrgKind, PlatformRole } from '@shared/roles';

export type Membership = { orgId: string; orgName: string; orgSlug: string; orgKind: OrgKind; roles: OrgRole[]; isSample: boolean };

export type Me = {
  user: {
    id: string;
    email: string;
    name: string;
    platformRole: PlatformRole | null;
    status: string;
    timezone: string;
    locale: string;
    preferences: { theme?: 'light' | 'dark' | 'system'; reducedMotion?: boolean; [k: string]: unknown };
    isSample: boolean;
  } | null;
  onboarded?: boolean;
  memberships?: Membership[];
  activeOrg?: Membership | null;
  workspace?: Workspace;
  workspaces?: Workspace[];
};

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api.get<Me>('/auth/me'), staleTime: 60_000 });
}

/** Non-null session data; only use inside authenticated routes. */
export function useSession() {
  const { data } = useMe();
  if (!data?.user) throw new Error('useSession used outside an authenticated route');
  return data as Required<Me> & { user: NonNullable<Me['user']> };
}

export function useSwitchWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { orgId?: string | null; workspace?: Workspace }) => api.post<{ orgId: string | null; workspace: Workspace }>('/auth/switch', v),
    onSuccess: async () => {
      // Everything org-scoped must refetch under the new context.
      await qc.invalidateQueries();
    },
  });
}

export function hasRole(me: Me, ...roles: OrgRole[]) {
  return !!me.activeOrg && roles.some((r) => me.activeOrg!.roles.includes(r));
}
