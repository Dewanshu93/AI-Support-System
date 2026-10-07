'use client';

// The employee chat screen (playbook section 10): conversation sidebar, message
// list with the live streamed turn, resolution and feedback, source drawer, the
// pending ticket draft (flows 4 and 5) and the private-contact offer (flow 6).
import type {
  CitationDto,
  ConversationDetailResponse,
  ConversationListResponse,
  MessageDto,
  TicketConfirmResponse,
} from '@sd/shared';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useChatTurn } from '@/hooks/useChatTurn';
import { api, ApiError } from '@/lib/api';
import { isBusy } from '@/lib/chatTurn';
import { AssistantMessage, type AssistantView } from './AssistantMessage';
import {
  Composer,
  EmptyChat,
  FeedbackButtons,
  ResolutionPrompt,
  StageIndicator,
} from './ChatParts';
import type { PrivateContactOffer } from './HandoffCard';
import { SourceDrawer } from './SourceDrawer';
import { TicketDraftCard } from './TicketDraftCard';

type Load<T> =
  { kind: 'loading' } | { kind: 'ready'; data: T } | { kind: 'error'; error: ApiError };

const toError = (err: unknown) =>
  err instanceof ApiError ? err : new ApiError(0, 'NETWORK', 'Cannot reach the service.');

/** A stored assistant message as the view model AssistantMessage renders. */
function storedView(m: MessageDto): AssistantView {
  return {
    text: m.content,
    citations: m.citations,
    citationsResolved: true,
    decision: m.decision,
    reasonCode: m.reasonCode,
    withdrawn: m.status === 'withdrawn',
    failed: m.status === 'error',
    handoff:
      m.decision === 'SENSITIVE_HANDOFF'
        ? { kind: 'sensitive' }
        : m.decision === 'OUT_OF_SCOPE'
          ? { kind: 'out_of_scope' }
          : null,
  };
}

export function ChatWorkspace({
  initialConversationId,
  initialPrompt,
}: {
  initialConversationId?: string;
  /** Sent as the first message of a new conversation (from /chat?q=…). */
  initialPrompt?: string;
}) {
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId ?? null,
  );
  const [detail, setDetail] = useState<Load<ConversationDetailResponse> | null>(
    initialConversationId ? { kind: 'loading' } : null,
  );
  const [list, setList] = useState<Load<ConversationListResponse>>({ kind: 'loading' });
  const [source, setSource] = useState<{ chunkId: string; sectionPath?: string[] } | null>(null);
  const [ratings, setRatings] = useState<Record<string, 'up' | 'down'>>({});
  const [resolving, setResolving] = useState(false);
  const [lastSent, setLastSent] = useState<{ text: string; escalate: boolean } | null>(null);
  const [created, setCreated] = useState<TicketConfirmResponse['ticket'] | null>(null);
  const [offer, setOffer] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });
  const { state: turn, send, reset } = useChatTurn();
  const bottom = useRef<HTMLDivElement>(null);

  const loadList = useCallback(() => {
    api.conversations().then(
      (data) => setList({ kind: 'ready', data }),
      (err: unknown) => setList({ kind: 'error', error: toError(err) }),
    );
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetail({ kind: 'ready', data: await api.conversation(id) });
    } catch (err) {
      setDetail({ kind: 'error', error: toError(err) });
    }
  }, []);

  useEffect(() => loadList(), [loadList]);
  // Send the prompt from /chat?q=… once (the ref survives the Strict Mode double effect).
  const promptSent = useRef(false);
  useEffect(() => {
    if (!initialPrompt || initialConversationId || promptSent.current) return;
    promptSent.current = true;
    void start(initialPrompt);
  }, [initialPrompt, initialConversationId]);
  useEffect(() => {
    if (initialConversationId) void loadDetail(initialConversationId);
  }, [initialConversationId, loadDetail]);

  // When a streamed turn finishes, show the stored messages instead of the live view.
  useEffect(() => {
    const persisted = turn.userMessageId !== null;
    if (!conversationId || !persisted) return;
    if (turn.phase === 'done' || turn.phase === 'withdrawn' || turn.phase === 'error') {
      void loadDetail(conversationId).then(() => {
        if (turn.phase !== 'error') reset();
        loadList();
      });
    }
  }, [turn.phase, turn.userMessageId, conversationId, loadDetail, loadList, reset]);

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: 'end' });
  }, [turn.text, turn.phase, detail]);

  const start = async (text: string, escalate = false) => {
    setLastSent({ text, escalate });
    let id = conversationId;
    if (!id) {
      try {
        const conversation = await api.createConversation();
        id = conversation.id;
        setConversationId(id);
        setDetail({ kind: 'ready', data: { conversation, messages: [] } });
        window.history.replaceState(null, '', `/chat/${id}`);
      } catch (err) {
        setDetail({ kind: 'error', error: toError(err) });
        return;
      }
    }
    await send(id, text, { escalate });
  };

  const resolve = async (messageId: string, resolved: boolean) => {
    if (!conversationId) return;
    setResolving(true);
    try {
      await api.resolve(conversationId, messageId, resolved);
      await loadDetail(conversationId);
      loadList();
    } finally {
      setResolving(false);
    }
  };

  const rate = async (messageId: string, rating: 'up' | 'down') => {
    setRatings((r) => ({ ...r, [messageId]: rating }));
    await api.feedback(messageId, { rating }).catch(() =>
      setRatings((r) => {
        const next = { ...r };
        delete next[messageId];
        return next;
      }),
    );
  };

  /** After confirm, cancel or a private-contact answer: show the stored outcome. */
  const afterDraft = async (ticket: TicketConfirmResponse['ticket'] | null) => {
    if (ticket) setCreated(ticket);
    if (conversationId) await loadDetail(conversationId);
    loadList();
  };

  const answerPrivateContact = async (yes: boolean) => {
    if (!conversationId) return;
    setOffer({ busy: true, error: null });
    try {
      const ticket = yes ? await api.confirmDraft(conversationId, { edits: {} }) : null;
      if (!yes) await api.cancelDraft(conversationId);
      await afterDraft(ticket);
      setOffer({ busy: false, error: null });
    } catch (err) {
      setOffer({ busy: false, error: `${toError(err).message} Please try again.` });
    }
  };

  const openCitation = (c: CitationDto) =>
    setSource({ chunkId: c.chunkId, sectionPath: c.sectionPath });

  const data = detail?.kind === 'ready' ? detail.data : null;
  const messages = data?.messages ?? [];
  const busy = isBusy(turn);
  const draft = busy ? undefined : data?.pendingDraft;
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  // A restricted draft is the sensitive handoff's private-contact offer (ADR-013).
  const privateContact: PrivateContactOffer | null =
    draft?.restricted && lastAssistant?.decision === 'SENSITIVE_HANDOFF'
      ? { ...offer, onAnswer: (yes) => void answerPrivateContact(yes) }
      : null;
  const canResolve =
    !busy &&
    !!lastAssistant &&
    lastAssistant.status === 'complete' &&
    (lastAssistant.decision === 'ANSWER' || lastAssistant.decision === 'PARTIAL') &&
    !data?.conversation.resolution;
  // A finished turn stays on screen until the reloaded conversation contains its reply
  // (and any pending draft), so nothing disappears in between.
  const stored =
    !!turn.assistantMessageId && messages.some((m) => m.id === turn.assistantMessageId);
  const showLive = turn.phase !== 'idle' && !(stored && !busy && turn.phase !== 'error');

  return (
    <div className="grid gap-6 pt-4 md:grid-cols-[16rem_1fr]">
      <nav
        aria-label="Conversations"
        data-testid="conversation-sidebar"
        className="space-y-3 self-start rounded-2xl border border-slate-200/80 bg-white p-3 shadow-card md:sticky md:top-20"
      >
        {/* Full navigation: after the first message the URL is updated with
            history.replaceState, so the router may still think this is /chat. */}
        <Button
          className="w-full"
          onClick={() => {
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.assign('/chat');
          }}
        >
          New chat
        </Button>
        {list.kind === 'loading' && <Skeleton className="h-24 w-full" />}
        {list.kind === 'error' && (
          <p className="text-xs text-rose-700">Could not load conversations.</p>
        )}
        {list.kind === 'ready' && list.data.items.length === 0 && (
          <p className="text-xs text-slate-500">No conversations yet.</p>
        )}
        {list.kind === 'ready' && (
          <ul className="space-y-1">
            {list.data.items.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/chat/${c.id}`}
                  aria-current={c.id === conversationId ? 'page' : undefined}
                  className={`block rounded-lg px-3 py-2 text-sm ${c.id === conversationId ? 'bg-brand-50 font-medium text-brand-900' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  <span className="line-clamp-1">{c.title || 'New conversation'}</span>
                  <span className="text-xs text-slate-500 capitalize">
                    {c.status.replace('_', ' ')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </nav>

      <section className="flex min-h-[70vh] flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-6">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white">
            <Icon name="sparkles" className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-900">
              {data?.conversation.title || 'Copilot'}
            </h1>
            <p className="text-xs text-slate-500">
              Answers cite company policy. Actions and requests always ask you to confirm.
            </p>
          </div>
        </div>
        {detail?.kind === 'loading' && (
          <div className="space-y-3" role="status" aria-label="Loading conversation">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="ml-auto h-10 w-1/2" />
            <Skeleton className="h-16 w-3/4" />
          </div>
        )}
        {detail?.kind === 'error' && (
          <ErrorState
            title={
              detail.error.status === 404
                ? 'Conversation not found'
                : 'Could not load the conversation'
            }
            message={detail.error.message}
            requestId={detail.error.requestId}
            onRetry={conversationId ? () => void loadDetail(conversationId) : undefined}
          />
        )}

        <div data-testid="message-list" className="flex-1 space-y-4">
          {!conversationId && turn.phase === 'idle' && <EmptyChat onPick={(p) => void start(p)} />}
          {data?.conversation.resolution?.confirmed && (
            <Badge tone="success">Marked as resolved</Badge>
          )}
          {messages.map((m) =>
            m.role === 'user' ? (
              <p
                key={m.id}
                data-testid="user-message"
                className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-sm whitespace-pre-wrap text-white"
              >
                {m.content}
              </p>
            ) : m.role === 'system_event' ? (
              <p
                key={m.id}
                data-testid="system-message"
                className="text-center text-xs text-slate-600"
              >
                {m.content}
              </p>
            ) : (
              <AssistantMessage
                key={m.id}
                view={storedView(m)}
                onCitation={openCitation}
                privateContact={m.id === lastAssistant?.id ? privateContact : null}
                footer={
                  m.status !== 'error' ? (
                    <div className="space-y-2">
                      <FeedbackButtons
                        value={ratings[m.id] ?? null}
                        onRate={(r) => void rate(m.id, r)}
                      />
                      {canResolve && m.id === lastAssistant?.id && (
                        <ResolutionPrompt
                          busy={resolving}
                          onAnswer={(r) => void resolve(m.id, r)}
                        />
                      )}
                    </div>
                  ) : lastSent && m.id === lastAssistant?.id ? (
                    <Button
                      variant="secondary"
                      onClick={() => void start(lastSent.text, lastSent.escalate)}
                    >
                      Try again
                    </Button>
                  ) : null
                }
              />
            ),
          )}

          {draft && !draft.restricted && conversationId && (
            <TicketDraftCard
              key={`${conversationId}:${lastAssistant?.id ?? ''}`}
              conversationId={conversationId}
              draft={draft}
              onConfirmed={(ticket) => void afterDraft(ticket)}
              onCancelled={() => void afterDraft(null)}
            />
          )}
          {created && (
            <p
              data-testid="ticket-created"
              role="status"
              className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
            >
              Ticket <span className="font-semibold">{created.humanId}</span> is with the team.{' '}
              <Link href={`/tickets/${created.id}`} className="font-medium underline">
                View ticket
              </Link>
            </p>
          )}

          {showLive && (
            <div data-testid="live-turn" className="space-y-3">
              {/* After a stored turn fails, the stored messages above already show it. */}
              {!turn.userMessageId && turn.userText && (
                <p className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-sm whitespace-pre-wrap text-white">
                  {turn.userText}
                </p>
              )}
              {turn.userMessageId && turn.phase !== 'error' && (
                <p
                  data-testid="user-message"
                  className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-sm whitespace-pre-wrap text-white"
                >
                  {turn.userText}
                </p>
              )}
              {busy && <StageIndicator stage={turn.stage} />}
              {(turn.text || turn.handoff) && (
                <AssistantMessage
                  view={{
                    text: turn.text,
                    citations: turn.citations,
                    citationsResolved: turn.citationsResolved,
                    decision: turn.decision,
                    reasonCode: turn.reasonCode,
                    withdrawn: turn.phase === 'withdrawn',
                    handoff: turn.handoff,
                  }}
                  onCitation={openCitation}
                />
              )}
              {turn.phase === 'error' && turn.error && (
                <div
                  data-testid="turn-error"
                  role="alert"
                  className="flex flex-wrap items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900"
                >
                  <span>{turn.error.message}</span>
                  {turn.error.retryable && lastSent && (
                    <Button
                      variant="secondary"
                      onClick={() => void start(lastSent.text, lastSent.escalate)}
                    >
                      Try again
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
          <div ref={bottom} />
        </div>

        {draft ? (
          <p
            data-testid="draft-pending-note"
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            {draft.restricted
              ? 'Please answer the private-contact offer above to continue.'
              : 'Confirm or cancel the ticket draft above to continue.'}
          </p>
        ) : (
          <Composer
            disabled={busy}
            onSend={(t) => void start(t)}
            onEscalate={() => void start('Please connect me with a person.', true)}
          />
        )}
      </section>

      {source && (
        <SourceDrawer
          chunkId={source.chunkId}
          sectionPath={source.sectionPath}
          onNavigate={(chunkId) => setSource({ chunkId })}
          onClose={() => setSource(null)}
        />
      )}
    </div>
  );
}
