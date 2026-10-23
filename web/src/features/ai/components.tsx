import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  ArrowSquareOutIcon,
  ChatsCircleIcon,
  GearSixIcon,
  InfoIcon,
  LockKeyIcon,
  PencilSimpleIcon,
  PlusIcon,
  ShieldWarningIcon,
  TrashIcon,
  BookOpenTextIcon,
  CodeIcon,
  ListChecksIcon,
  NotebookIcon,
  FileTextIcon,
  ChatTextIcon,
} from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { Badge, Banner, Button, ButtonLink, Card, ConfirmDialog, Dialog, ErrorState, Field, Input, Menu, SkeletonRows } from '@/components/ui';
import { aiKeys, fetchConversations, type AiStatus, type AssistantInfo, type Conversation, type ConversationContext } from './api';

export const AI_DISCLAIMER = 'AI can be wrong. Verify important information.';

const CONTEXT_META: Record<string, { label: string; icon: typeof BookOpenTextIcon }> = {
  topic: { label: 'Topic', icon: BookOpenTextIcon },
  problem: { label: 'Practice problem', icon: CodeIcon },
  resume: { label: 'Resume', icon: FileTextIcon },
  career_document: { label: 'Document', icon: FileTextIcon },
  assignment: { label: 'Assignment', icon: ListChecksIcon },
  text: { label: 'About', icon: ChatTextIcon },
};

/** "About: Topic X" chip shown on the composer and in the chat header. */
export function ContextChip({ context, onRemove }: { context: ConversationContext | null | undefined; onRemove?: () => void }) {
  if (!context?.type || !context.label) return null;
  const meta = CONTEXT_META[context.type] ?? { label: 'About', icon: NotebookIcon };
  const Icon = meta.icon;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-[12.5px] text-muted">
      <Icon size={14} aria-hidden />
      <span className="truncate">
        <span className="text-subtle">About:</span> {meta.label !== 'About' && <span className="sr-only">{meta.label}</span>}
        <span className="text-fg">{context.label}</span>
      </span>
      {onRemove && (
        <button type="button" onClick={onRemove} className="ml-0.5 rounded px-1 text-subtle hover:bg-surface-3 hover:text-fg" aria-label="Remove context">
          ×
        </button>
      )}
    </span>
  );
}

/** Persistent honesty note plus the active provider's data notice. */
export function AiNotice({ status, className }: { status: AiStatus | undefined; className?: string }) {
  return (
    <div className={clsx('flex flex-col gap-1 text-[12px] text-subtle', className)}>
      <p className="flex items-start gap-1.5">
        <InfoIcon size={14} className="mt-px shrink-0" aria-hidden />
        <span>
          {AI_DISCLAIMER} {status?.transparency}
        </span>
      </p>
      {status?.primaryNotice && (
        <p className="flex items-start gap-1.5">
          <ShieldWarningIcon size={14} className="mt-px shrink-0 text-warning" aria-hidden />
          <span>{status.primaryNotice}</span>
        </p>
      )}
    </div>
  );
}

/** Shown when no provider is configured or AI is switched off. Everything else keeps working. */
export function NotConfigured({ status }: { status: AiStatus }) {
  const off = status.configured && !status.enabled;
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
          <ChatsCircleIcon size={22} aria-hidden />
        </div>
        <div className="min-w-0 space-y-2">
          <h2 className="text-[16px] font-semibold">{off ? 'AI is turned off on this platform' : 'AI is not set up yet'}</h2>
          <p className="text-[14px] text-muted">
            AI is optional in LearnSphere Nexus. Roadmaps, practice with real code execution, grading, projects and career tools all work without it. You can still browse the specialists below.
          </p>
          {status.isPlatformAdmin ? (
            <div className="space-y-3">
              {!off && (
                <>
                  <p className="text-[14px] text-muted">These providers have free tiers or student credit. Add one in Admin, or set its environment variable and restart the server:</p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {status.freeOptions.map((o) => (
                      <li key={o.id} className="rounded-md border border-border p-2.5 text-[13px]">
                        <div className="font-medium">{o.label}</div>
                        <div className="text-muted">{o.freeTier}</div>
                        {o.envVars.length > 0 && <div className="mt-1 font-mono text-[11.5px] text-subtle">{o.envVars.join(', ')}</div>}
                        {o.signupUrl && (
                          <a href={o.signupUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-accent-text hover:underline">
                            Get a key <ArrowSquareOutIcon size={12} aria-hidden />
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {status.problems.length > 0 && (
                <Banner tone="warning" title="Configured providers that cannot be used">
                  <ul className="list-disc pl-4">
                    {status.problems.map((p) => (
                      <li key={p.label}>
                        {p.label}: {p.problem}
                      </li>
                    ))}
                  </ul>
                </Banner>
              )}
              <ButtonLink to="/app/admin/ai" variant="primary" icon={<GearSixIcon size={16} />}>
                Open Admin AI providers
              </ButtonLink>
            </div>
          ) : (
            <p className="text-[14px] text-muted">Ask your administrator to configure an AI provider if you want to use the AI Council.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

export function AssistantLock({ a }: { a: AssistantInfo }) {
  if (a.available) return null;
  return (
    <Badge tone="warning" icon={<LockKeyIcon size={12} aria-hidden />}>
      Locked
    </Badge>
  );
}

/** Grouped specialist picker (native select for accessibility). */
export function AssistantSelect({ assistants, groups, value, onChange, id }: { assistants: AssistantInfo[]; groups: { id: string; label: string }[]; value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full appearance-none rounded-md border border-border bg-surface px-3 pr-8 text-[14px] text-fg shadow-1 hover:border-border-strong focus:border-accent focus:outline-none"
      >
        {groups.map((g) => (
          <optgroup key={g.id} label={g.label}>
            {assistants
              .filter((a) => a.group === g.id)
              .map((a) => (
                <option key={a.id} value={a.id} disabled={!a.available}>
                  {a.name}
                  {a.available ? '' : ' (locked)'}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

/** Conversation list with rename and delete. */
export function ConversationList({ activeId, compact }: { activeId?: string; compact?: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: aiKeys.conversations, queryFn: fetchConversations });
  const [renaming, setRenaming] = useState<Conversation | null>(null);
  const [title, setTitle] = useState('');
  const [deleting, setDeleting] = useState<Conversation | null>(null);

  const rename = useMutation({
    mutationFn: (v: { id: string; title: string }) => api.patch(`/ai/conversations/${v.id}`, { title: v.title }),
    onSuccess: () => {
      toast.success('Conversation renamed');
      setRenaming(null);
      qc.invalidateQueries({ queryKey: ['ai'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/ai/conversations/${id}`),
    onSuccess: (_d, id) => {
      toast.success('Conversation deleted');
      setDeleting(null);
      qc.invalidateQueries({ queryKey: aiKeys.conversations });
      if (id === activeId) navigate('/app/ai');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <SkeletonRows rows={compact ? 5 : 3} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const items = compact ? q.data!.items : q.data!.items.slice(0, 6);
  if (!items.length)
    return compact ? (
      <p className="px-2 py-3 text-[13px] text-subtle">No conversations yet.</p>
    ) : (
      <div className="flex items-start gap-3 py-1 text-[13px] text-muted">
        <ChatsCircleIcon size={18} className="mt-px shrink-0 text-subtle" aria-hidden />
        <p>No conversations yet. Ask a question or start a chat with a specialist. Your conversations are private to you.</p>
      </div>
    );

  return (
    <>
      <ul className="space-y-0.5" aria-label="Conversations">
        {items.map((cv) => (
          <li key={cv.id} className="group flex items-center gap-1">
            <NavLink
              to={`/app/ai/c/${cv.id}`}
              className={({ isActive }) =>
                clsx('min-w-0 flex-1 rounded-md px-2 py-1.5 text-[13.5px] hover:bg-surface-2', isActive || cv.id === activeId ? 'bg-surface-2 font-medium text-fg' : 'text-muted')
              }
            >
              <span className="block truncate">{cv.title}</span>
              <span className="block truncate text-[11.5px] text-subtle">
                {cv.assistantName} · {timeAgo(cv.updatedAt)}
              </span>
            </NavLink>
            <Menu
              label={`Actions for ${cv.title}`}
              items={[
                {
                  label: 'Rename',
                  icon: <PencilSimpleIcon size={15} />,
                  onSelect: () => {
                    setTitle(cv.title);
                    setRenaming(cv);
                  },
                },
                { label: 'Delete', icon: <TrashIcon size={15} />, danger: true, onSelect: () => setDeleting(cv) },
              ]}
            />
          </li>
        ))}
      </ul>
      {!compact && q.data!.items.length > items.length && <p className="mt-2 text-[12.5px] text-subtle">Open any conversation to see the full list in its sidebar.</p>}

      <Dialog
        open={!!renaming}
        onOpenChange={(v) => !v && setRenaming(null)}
        title="Rename conversation"
        size="sm"
        footer={
          <>
            <Button onClick={() => setRenaming(null)}>Cancel</Button>
            <Button variant="primary" loading={rename.isPending} disabled={!title.trim()} disabledReason="Enter a title" onClick={() => renaming && rename.mutate({ id: renaming.id, title: title.trim() })}>
              Save
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (renaming && title.trim()) rename.mutate({ id: renaming.id, title: title.trim() });
          }}
        >
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus />
          </Field>
        </form>
      </Dialog>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete conversation?"
        description={`"${deleting?.title ?? ''}" and all its messages will be permanently deleted.`}
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </>
  );
}

export function NewChatButton({ className }: { className?: string }) {
  return (
    <Link to="/app/ai" className={clsx('inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-[13px] font-medium shadow-1 hover:bg-surface-2', className)}>
      <PlusIcon size={15} aria-hidden /> New chat
    </Link>
  );
}
