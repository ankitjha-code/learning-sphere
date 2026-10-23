import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  ArrowClockwiseIcon,
  CaretLeftIcon,
  FlagIcon,
  PaperPlaneRightIcon,
  StopIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  WarningCircleIcon,
  LinkSimpleIcon,
} from '@phosphor-icons/react';
import { api, ApiError, errorMessage } from '@/lib/api';
import { Badge, Banner, Button, CopyButton, Dialog, ErrorState, Field, Markdown, ProvenanceTag, Select, Skeleton, Spinner, Textarea } from '@/components/ui';
import {
  aiKeys,
  fetchStatus,
  formatWait,
  newClientMessageId,
  REASON_TITLES,
  streamMessage,
  type AiFailureReason,
  type ChatMessage,
  type Conversation,
  type Source,
} from './api';
import { AiNotice, ContextChip, ConversationList, NewChatButton, NotConfigured } from './components';

type Pending = {
  clientMessageId: string;
  content: string;
  userMessageId?: string;
  text: string;
  sources: Source[];
  phase: 'waiting' | 'streaming' | 'finishing';
};

type SendError = { reason: AiFailureReason; message: string; retryAfterSeconds?: number | null; clientMessageId: string; content: string };

const ID_STORE = 'ls.ai.clientIds';

/** Remembers clientMessageId per user message so a retry after reload reuses it (no duplicates). */
function rememberClientId(userMessageId: string, clientMessageId: string) {
  try {
    const m = JSON.parse(sessionStorage.getItem(ID_STORE) ?? '{}');
    m[userMessageId] = clientMessageId;
    sessionStorage.setItem(ID_STORE, JSON.stringify(m));
  } catch {
    /* storage unavailable */
  }
}
function recallClientId(userMessageId: string): string | null {
  try {
    return JSON.parse(sessionStorage.getItem(ID_STORE) ?? '{}')[userMessageId] ?? null;
  } catch {
    return null;
  }
}

export default function ChatPage() {
  const { conversationId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: aiKeys.status, queryFn: fetchStatus });
  const q = useQuery({
    queryKey: aiKeys.messages(conversationId),
    queryFn: () => api.get<{ conversation: Conversation; items: ChatMessage[] }>(`/ai/conversations/${conversationId}/messages`),
  });

  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [sendError, setSendError] = useState<SendError | null>(null);
  const [announce, setAnnounce] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoSent = useRef(false);

  const busy = !!pending;
  const ready = !!status.data?.configured && !!status.data?.enabled;

  const send = useCallback(
    async (content: string, clientMessageId: string) => {
      setSendError(null);
      setPending({ clientMessageId, content, text: '', sources: [], phase: 'waiting' });
      setAnnounce('');
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      let failed: SendError | null = null;
      let finished = false;
      try {
        await streamMessage(
          conversationId,
          { content, clientMessageId },
          {
            onStart: (d) => {
              rememberClientId(d.userMessageId, clientMessageId);
              setPending((p) => (p ? { ...p, userMessageId: d.userMessageId } : p));
            },
            onSources: (sources) => setPending((p) => (p ? { ...p, sources } : p)),
            onDelta: (t) => setPending((p) => (p ? { ...p, text: p.text + t, phase: 'streaming' } : p)),
            onDone: () => {
              finished = true;
              setAnnounce('Answer complete.');
            },
            onError: (d) => {
              failed = { reason: d.reason, message: d.message, retryAfterSeconds: d.retryAfterSeconds, clientMessageId, content };
            },
          },
          ctrl.signal,
        );
      } catch (e) {
        if (ctrl.signal.aborted) {
          setAnnounce('Stopped.');
        } else {
          const msg = e instanceof ApiError ? e.message : 'Lost the connection while waiting for the answer. Retry to continue.';
          failed = { reason: e instanceof ApiError && e.status === 409 ? 'unavailable' : 'error', message: msg, clientMessageId, content };
        }
      } finally {
        abortRef.current = null;
        setPending((p) => (p ? { ...p, phase: 'finishing' } : p));
        await qc.invalidateQueries({ queryKey: aiKeys.messages(conversationId) });
        qc.invalidateQueries({ queryKey: aiKeys.conversations });
        qc.invalidateQueries({ queryKey: aiKeys.status });
        setPending(null);
        if (failed) {
          setSendError(failed);
          setAnnounce(`${REASON_TITLES[(failed as SendError).reason] ?? 'Request failed'}. ${(failed as SendError).message}`);
        } else if (!finished && !ctrl.signal.aborted) {
          setAnnounce('The answer ended unexpectedly.');
        }
      }
    },
    [conversationId, qc],
  );

  // A message typed on the Council home arrives in navigation state: send it once.
  useEffect(() => {
    const st = location.state as { pendingMessage?: string; clientMessageId?: string } | null;
    if (st?.pendingMessage && st.clientMessageId && !autoSent.current && q.data) {
      autoSent.current = true;
      navigate(location.pathname, { replace: true, state: null });
      void send(st.pendingMessage, st.clientMessageId);
    }
  }, [location, q.data, navigate, send]);

  useEffect(() => {
    autoSent.current = false;
    setSendError(null);
    setPending(null);
    return () => abortRef.current?.abort();
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [q.data?.items.length, pending?.phase, sendError]);

  const submit = () => {
    const content = draft.trim();
    if (!content || busy || !ready) return;
    setDraft('');
    void send(content, newClientMessageId());
  };

  const retry = (m: ChatMessage, items: ChatMessage[]) => {
    const idx = items.findIndex((x) => x.id === m.id);
    const userMsg = [...items.slice(0, idx)].reverse().find((x) => x.role === 'user');
    if (!userMsg) return;
    void send(userMsg.content, recallClientId(userMsg.id) ?? newClientMessageId());
  };

  if (q.isLoading)
    return (
      <div className="mx-auto max-w-5xl space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (q.error)
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
        <Link to="/app/ai" className="text-[13px] text-accent-text hover:underline">
          Back to the AI Council
        </Link>
      </div>
    );

  const { conversation, items } = q.data!;
  // While a retry is in flight, hide the stale failed answer it will replace.
  const visible = pending?.userMessageId ? items.filter((m, i) => !(m.role === 'assistant' && items[i - 1]?.id === pending.userMessageId)) : items;
  const showPendingUser = pending && !items.some((m) => m.id === pending.userMessageId);
  const lastAssistant = [...items].reverse().find((m) => m.role === 'assistant');

  const disabledReason = !ready ? 'AI is not available on this platform right now' : busy ? 'Wait for the current answer or stop it' : !draft.trim() ? 'Write a message first' : undefined;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <div className="sticky top-4 space-y-3">
          <NewChatButton className="w-full justify-center" />
          <ConversationList activeId={conversationId} compact />
        </div>
      </aside>

      <section className="flex min-h-[calc(100vh-9rem)] min-w-0 flex-col" aria-label="Chat">
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3">
          <div className="min-w-0">
            <Link to="/app/ai" className="mb-1 inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-fg lg:hidden">
              <CaretLeftIcon size={13} /> AI Council
            </Link>
            <h1 className="truncate font-display text-[20px] font-semibold tracking-[-0.02em]">{conversation.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
              <Badge tone="accent">{conversation.assistantName}</Badge>
              <ContextChip context={conversation.context} />
            </div>
          </div>
          <NewChatButton className="lg:hidden" />
        </header>

        {status.data && !ready && (
          <div className="mb-4">
            <NotConfigured status={status.data} />
          </div>
        )}

        <div className="flex-1 space-y-5" aria-busy={busy}>
          {visible.length === 0 && !pending && (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-[13.5px] text-muted">
              Ask {conversation.assistantName.toLowerCase()} anything{conversation.context?.label ? ` about ${conversation.context.label}` : ''}. Conversations are private to you.
            </p>
          )}
          {visible.map((m) =>
            m.role === 'user' ? (
              <UserBubble key={m.id} content={m.content} />
            ) : (
              <AssistantMessage key={m.id} m={m} canRetry={!busy && ready && m.id === lastAssistant?.id && m.status !== 'ok'} onRetry={() => retry(m, items)} />
            ),
          )}
          {showPendingUser && <UserBubble content={pending!.content} />}
          {pending && (
            <div className="space-y-2">
              {pending.phase === 'waiting' ? (
                <p className="flex items-center gap-2 text-[13px] text-muted">
                  <Spinner size={14} /> {conversation.assistantName} is thinking…
                </p>
              ) : (
                <Markdown source={pending.text} />
              )}
              <SourcesList sources={pending.sources} />
            </div>
          )}
          {sendError && !pending && !(lastAssistant && lastAssistant.status !== 'ok') && <SendErrorBanner err={sendError} onRetry={() => void send(sendError.content, sendError.clientMessageId)} canRetry={ready && sendError.reason !== 'quota_exceeded' && sendError.reason !== 'disabled' && sendError.reason !== 'not_configured'} />}
          <div ref={bottomRef} />
        </div>

        <div className="sr-only" role="status" aria-live="polite">
          {announce}
        </div>

        <div className="sticky bottom-0 mt-4 space-y-2 border-t border-border bg-bg pt-3 pb-2">
          <div className="flex items-end gap-2">
            <Textarea
              aria-label="Message"
              rows={2}
              className="min-h-[52px] flex-1 resize-y"
              placeholder={ready ? `Message ${conversation.assistantName}` : 'AI is not available right now'}
              value={draft}
              maxLength={8000}
              disabled={!ready}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            {busy ? (
              <Button variant="secondary" icon={<StopIcon size={16} weight="fill" />} onClick={() => abortRef.current?.abort()}>
                Stop
              </Button>
            ) : (
              <Button variant="primary" icon={<PaperPlaneRightIcon size={16} />} onClick={submit} disabled={!!disabledReason} disabledReason={disabledReason}>
                Send
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <AiNotice status={status.data} className="max-w-3xl" />
            <span className="text-[11.5px] text-subtle">Enter sends, Shift+Enter for a new line</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-accent-soft px-3.5 py-2.5 text-[14px] text-fg">{content}</div>
    </div>
  );
}

function SourcesList({ sources }: { sources: Source[] }) {
  if (!sources?.length) return null;
  return (
    <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
      <div className="mb-1 text-[12px] font-medium text-muted">Sources searched for this answer</div>
      <ol className="space-y-0.5 text-[12.5px]">
        {sources.map((s) => (
          <li key={s.n} className="flex items-start gap-1.5">
            <span className="tabular-nums text-subtle">[{s.n}]</span>
            {s.url ? (
              <Link to={s.url} className="inline-flex items-center gap-1 text-accent-text hover:underline">
                <LinkSimpleIcon size={12} aria-hidden />
                {s.title}
              </Link>
            ) : (
              <span>{s.title}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function SendErrorBanner({ err, onRetry, canRetry }: { err: SendError; onRetry: () => void; canRetry: boolean }) {
  const wait = formatWait(err.retryAfterSeconds);
  return (
    <Banner
      tone={err.reason === 'quota_exceeded' || err.reason === 'rate_limited' ? 'warning' : 'danger'}
      title={REASON_TITLES[err.reason] ?? 'The AI request failed'}
      action={
        canRetry ? (
          <Button size="sm" icon={<ArrowClockwiseIcon size={14} />} onClick={onRetry}>
            Retry
          </Button>
        ) : undefined
      }
    >
      {err.message.trim().replace(/[.!]?$/, '.')}
      {wait ? ` You can try again in about ${wait}.` : ''} Your message was saved.
    </Banner>
  );
}

function AssistantMessage({ m, canRetry, onRetry }: { m: ChatMessage; canRetry: boolean; onRetry: () => void }) {
  const qc = useQueryClient();
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState('incorrect');
  const [details, setDetails] = useState('');
  const feedback = useMutation({
    mutationFn: (value: 1 | -1 | 0) => api.post(`/ai/messages/${m.id}/feedback`, { value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai', 'messages'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const report = useMutation({
    mutationFn: () => api.post(`/ai/messages/${m.id}/report`, { reason, details: details.trim() || undefined }),
    onSuccess: () => {
      toast.success('Thanks. A platform admin will review this answer.');
      setReportOpen(false);
      setDetails('');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (m.status === 'unavailable') {
    return (
      <div className="flex items-start gap-2 rounded-md border border-border bg-surface px-3 py-2.5 text-[13.5px]">
        <WarningCircleIcon size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="font-medium">No answer</div>
          <p className="text-muted">{m.content.trim().replace(/[.!]?$/, '.')} Your message was saved.</p>
        </div>
        {canRetry && (
          <Button size="sm" icon={<ArrowClockwiseIcon size={14} />} onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    <article className="group space-y-2">
      <Markdown source={m.content} />
      {m.status === 'error' && (
        <Banner
          tone="warning"
          title="This answer was cut off"
          action={
            canRetry ? (
              <Button size="sm" icon={<ArrowClockwiseIcon size={14} />} onClick={onRetry}>
                Retry
              </Button>
            ) : undefined
          }
        >
          The provider stopped responding mid-answer. The partial text above may be incomplete.
        </Banner>
      )}
      {m.status === 'stopped' && (
        <p className="flex items-center gap-2 text-[12.5px] text-subtle">
          You stopped this answer.
          {canRetry && (
            <button type="button" className="text-accent-text hover:underline" onClick={onRetry}>
              Regenerate
            </button>
          )}
        </p>
      )}
      <SourcesList sources={m.sources} />
      <div className="flex flex-wrap items-center gap-1 text-[11.5px] text-subtle">
        <ProvenanceTag kind="ai" />
        {m.provider && (
          <span className="px-1">
            {m.provider} · {m.model}
          </span>
        )}
        <span className="ml-auto flex items-center gap-0.5 opacity-80 group-hover:opacity-100">
          <CopyButton value={m.content} />
          <button
            type="button"
            className={clsx('rounded p-1 hover:bg-surface-2', m.feedback === 1 ? 'text-success' : 'text-muted')}
            aria-label="Helpful"
            aria-pressed={m.feedback === 1}
            onClick={() => feedback.mutate(m.feedback === 1 ? 0 : 1)}
          >
            <ThumbsUpIcon size={15} weight={m.feedback === 1 ? 'fill' : 'regular'} />
          </button>
          <button
            type="button"
            className={clsx('rounded p-1 hover:bg-surface-2', m.feedback === -1 ? 'text-danger' : 'text-muted')}
            aria-label="Not helpful"
            aria-pressed={m.feedback === -1}
            onClick={() => feedback.mutate(m.feedback === -1 ? 0 : -1)}
          >
            <ThumbsDownIcon size={15} weight={m.feedback === -1 ? 'fill' : 'regular'} />
          </button>
          <button type="button" className="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Report this answer" onClick={() => setReportOpen(true)}>
            <FlagIcon size={15} />
          </button>
        </span>
      </div>

      <Dialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        title="Report this answer"
        description="A platform admin can read a reported answer to review it. Other answers stay private."
        size="sm"
        footer={
          <>
            <Button onClick={() => setReportOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={report.isPending} onClick={() => report.mutate()}>
              Send report
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Reason">
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="incorrect">Incorrect or misleading</option>
              <option value="harmful">Harmful or unsafe</option>
              <option value="biased">Biased or offensive</option>
              <option value="privacy">Privacy concern</option>
              <option value="other">Something else</option>
            </Select>
          </Field>
          <Field label="Details" optional>
            <Textarea rows={3} value={details} maxLength={1000} onChange={(e) => setDetails(e.target.value)} />
          </Field>
        </div>
      </Dialog>
    </article>
  );
}
