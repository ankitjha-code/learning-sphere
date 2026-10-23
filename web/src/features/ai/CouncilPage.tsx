import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRightIcon, CheckIcon, LockKeyIcon, PaperPlaneRightIcon, SparkleIcon, XIcon, BookOpenTextIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { Badge, Button, Card, CardBody, CardHeader, ErrorState, PageHeader, Section, Skeleton, Textarea } from '@/components/ui';
import { aiKeys, fetchAssistants, fetchStatus, newClientMessageId, parseContextParam, type AssistantInfo, type Conversation, type RouteSuggestion } from './api';
import { AiNotice, AssistantLock, AssistantSelect, ContextChip, ConversationList, NotConfigured } from './components';

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function CouncilPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = useQuery({ queryKey: aiKeys.status, queryFn: fetchStatus });
  const assistants = useQuery({ queryKey: aiKeys.assistants, queryFn: fetchAssistants });

  const paramAssistant = params.get('assistant');
  const context = useMemo(() => parseContextParam(params.get('context'), params.get('label')), [params]);
  const [text, setText] = useState('');
  const [override, setOverride] = useState<string | null>(paramAssistant);
  useEffect(() => setOverride(paramAssistant), [paramAssistant]);

  const debounced = useDebounced(text.trim(), 450);
  const route = useQuery({
    queryKey: ['ai', 'route', debounced],
    queryFn: () => api.post<{ suggestion: RouteSuggestion }>('/ai/route', { message: debounced }),
    enabled: debounced.length >= 6 && !override,
    staleTime: 60_000,
  });
  const suggestion = route.data?.suggestion;
  const chosen = override ?? suggestion?.assistant ?? 'mentor';
  const list = assistants.data?.assistants ?? [];
  const chosenInfo = list.find((a) => a.id === chosen);
  const ready = !!status.data?.configured && !!status.data?.enabled;

  const start = useMutation({
    mutationFn: async (v: { assistant: string; message?: string }) => {
      const r = await api.post<{ conversation: Conversation }>('/ai/conversations', {
        assistant: v.assistant,
        context: context && v.assistant === chosen ? context : undefined,
      });
      return { conversation: r.conversation, message: v.message };
    },
    onSuccess: ({ conversation, message }) => {
      navigate(`/app/ai/c/${conversation.id}`, { state: message ? { pendingMessage: message, clientMessageId: newClientMessageId() } : null });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const submit = () => {
    const message = text.trim();
    if (!message || !ready || !chosenInfo?.available) return;
    start.mutate({ assistant: chosen, message });
  };

  const clearContext = () => {
    const next = new URLSearchParams(params);
    next.delete('context');
    next.delete('label');
    setParams(next, { replace: true });
  };

  const disabledReason = !ready
    ? 'AI is not available on this platform right now'
    : !text.trim()
      ? 'Write a question first'
      : chosenInfo && !chosenInfo.available
        ? (chosenInfo.reason ?? 'This specialist is locked')
        : undefined;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="AI Council"
        badge={<Badge tone="neutral">Optional</Badge>}
        description="Twenty-one specialists for learning, coding, careers, teaching and hiring. Ask once and Nexus suggests who should answer. All specialists use the same configured model with different instructions."
      />

      {status.error ? (
        <ErrorState error={status.error} onRetry={() => status.refetch()} className="mb-6" />
      ) : !status.data ? (
        <Skeleton className="mb-6 h-40 w-full" />
      ) : !ready ? (
        <div className="mb-6">
          <NotConfigured status={status.data} />
        </div>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-8">
          <Card>
            <CardHeader title="Ask Nexus" description="Describe what you need. You can change the specialist before sending." />
            <CardBody className="space-y-3">
              {context && <ContextChip context={context} onRemove={clearContext} />}
              <Textarea
                aria-label="Your question"
                rows={4}
                value={text}
                maxLength={8000}
                placeholder="For example: Why does my LEFT JOIN with GROUP BY return duplicate rows?"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <label htmlFor="ask-assistant" className="text-[13px] font-medium">
                    Specialist
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 sm:max-w-xs">
                      {assistants.data ? (
                        <AssistantSelect id="ask-assistant" assistants={list} groups={assistants.data.groups} value={chosen} onChange={(v) => setOverride(v)} />
                      ) : (
                        <Skeleton className="h-9 w-full" />
                      )}
                    </div>
                    {override && !paramAssistant && (
                      <Button size="sm" variant="ghost" icon={<XIcon size={14} />} onClick={() => setOverride(null)}>
                        Use suggestion
                      </Button>
                    )}
                  </div>
                </div>
                <Button variant="primary" icon={<PaperPlaneRightIcon size={16} />} loading={start.isPending} disabled={!!disabledReason} disabledReason={disabledReason} onClick={submit}>
                  Ask
                </Button>
              </div>
              <p className="min-h-5 text-[13px] text-muted" aria-live="polite">
                {override
                  ? paramAssistant && override === paramAssistant
                    ? `You opened this from a page that suggests the ${chosenInfo?.name ?? 'selected specialist'}.`
                    : `You chose the ${chosenInfo?.name ?? 'selected specialist'}.`
                  : suggestion
                    ? suggestion.explanation
                    : text.trim().length >= 6 && route.isFetching
                      ? 'Finding the right specialist…'
                      : 'Nexus suggests a specialist from keywords in your question. No AI is used for routing.'}
              </p>
              <p className="text-[12px] text-subtle">Enter sends. Shift+Enter adds a new line.</p>
            </CardBody>
          </Card>

          <div className="-mt-5">
            <AiNotice status={status.data} />
          </div>

          <section aria-labelledby="directory-title">
            <h2 id="directory-title" className="sr-only">
              Specialist directory
            </h2>
            {assistants.error ? (
              <ErrorState error={assistants.error} onRetry={() => assistants.refetch()} />
            ) : !assistants.data ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <div className="space-y-8">
                {assistants.data.groups.map((g) => (
                  <Section key={g.id} title={g.label}>
                    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
                      {list
                        .filter((a) => a.group === g.id)
                        .map((a) => (
                          <AssistantRow key={a.id} a={a} disabledReason={!ready ? 'AI is not available on this platform right now' : undefined} loading={start.isPending && start.variables?.assistant === a.id} onStart={() => start.mutate({ assistant: a.id })} />
                        ))}
                    </ul>
                  </Section>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardHeader title="Recent conversations" />
            <CardBody className="[&_ul[aria-label=Conversations]]:-mx-2">
              <ConversationList />
            </CardBody>
            {status.data && ready && (
              <p className="border-t border-border px-5 py-3.5 text-[12.5px] leading-relaxed text-subtle">
                {status.data.quota.user.remaining} of {status.data.quota.user.limit} AI requests left today
                {status.data.quota.org ? `; your organization has ${status.data.quota.org.remaining} left this month` : ''}.
              </p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function AssistantRow({ a, onStart, loading, disabledReason }: { a: AssistantInfo; onStart: () => void; loading: boolean; disabledReason?: string }) {
  const [open, setOpen] = useState(false);
  const reason = disabledReason ?? (a.available ? undefined : (a.reason ?? 'Locked'));
  return (
    <li className="px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h3 className="text-[14.5px] font-semibold tracking-[-0.005em]">{a.name}</h3>
          {a.usesSources && (
            <Badge tone="info" icon={<BookOpenTextIcon size={12} aria-hidden />}>
              Cites sources
            </Badge>
          )}
          <AssistantLock a={a} />
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">{a.description}</p>
      {!a.available && a.reason && (
        <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-warning">
          <LockKeyIcon size={14} className="mt-px shrink-0" aria-hidden />
          <span>{a.reason}</span>
        </p>
      )}
      <button type="button" className="mt-1.5 text-[12.5px] font-medium text-accent-text underline-offset-2 hover:underline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? 'Hide details' : 'What it can and cannot do'}
      </button>
      </div>
      <Button size="sm" className="self-start" icon={<SparkleIcon size={14} />} onClick={onStart} loading={loading} disabled={!!reason} disabledReason={reason}>
        Start chat <ArrowRightIcon size={13} aria-hidden />
      </Button>
      </div>
      {open && (
        <div className="mt-3 grid gap-4 rounded-md bg-surface-2 p-4 text-[12.5px] sm:grid-cols-2">
          <div>
            <div className="mb-1 font-medium text-fg">Can</div>
            <ul className="space-y-1 text-muted">
              {a.can.map((x) => (
                <li key={x} className="flex gap-1.5">
                  <CheckIcon size={13} className="mt-0.5 shrink-0 text-success" aria-hidden />
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-1 font-medium text-fg">Cannot</div>
            <ul className="space-y-1 text-muted">
              {a.cannot.map((x) => (
                <li key={x} className="flex gap-1.5">
                  <XIcon size={13} className="mt-0.5 shrink-0 text-danger" aria-hidden />
                  {x}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </li>
  );
}
