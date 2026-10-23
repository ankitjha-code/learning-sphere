import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HandshakeIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { Badge, ButtonLink, EmptyState, ErrorState, Skeleton, Tooltip } from '@/components/ui';
import { SHARING_LABELS, type Person, type Sharing, type Session } from '@/features/mentors/shared';

export type Workspace = {
  profile: { status: string; maxMentees: number; acceptingRequests: boolean } | null;
  workspaceUnlocked: boolean;
  requests: { id: string; createdAt: string; requestMessage: string | null; goalsSummary: string | null; sharing: Sharing; mentee: Person | null }[];
  mentees: { id: string; startedAt: string | null; sharing: Sharing; mentee: Person | null; nextSession: string | null; openAssignments: number }[];
  upcomingSessions: (Session & { mentee: Person | null })[];
  followUps: { id: string; text: string; sessionId: string; mentorshipId: string; sessionAt: string; mentee: Person | null }[];
};

export function useWorkspace() {
  return useQuery({ queryKey: ['mentor-workspace'], queryFn: () => api.get<Workspace>('/mentorship/workspace') });
}

export function SharingBadges({ sharing }: { sharing: Sharing }) {
  return (
    <div className="flex flex-wrap gap-1">
      {(Object.keys(SHARING_LABELS) as (keyof Sharing)[]).map((k) => (
        <Tooltip key={k} content={sharing[k] ? `Shared by mentee: ${SHARING_LABELS[k].description}` : 'Not shared by the mentee'}>
          <span>
            <Badge tone={sharing[k] ? 'success' : 'neutral'}>{sharing[k] ? SHARING_LABELS[k].label : `No ${SHARING_LABELS[k].label.toLowerCase()}`}</Badge>
          </span>
        </Tooltip>
      ))}
    </div>
  );
}

export function MentorGate({ children }: { children: ReactNode }) {
  const ws = useWorkspace();
  if (ws.isLoading) return <Skeleton className="h-40" />;
  if (ws.error) return <ErrorState error={ws.error} onRetry={() => ws.refetch()} />;
  if (!ws.data!.profile && !ws.data!.workspaceUnlocked)
    return (
      <EmptyState
        icon={<HandshakeIcon size={22} />}
        title="Set up your mentor profile"
        description="Share your expertise and availability. Profiles are reviewed by the platform team before learners can find you, unless you mentor through an organization."
        action={
          <ButtonLink to="/app/mentor/profile" variant="primary">
            Create mentor profile
          </ButtonLink>
        }
      />
    );
  return <>{children}</>;
}
