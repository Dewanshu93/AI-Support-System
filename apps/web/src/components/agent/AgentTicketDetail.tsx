'use client';

// Agent ticket workspace (W3-07, playbook section 10): everything needed to
// resolve a request in one place. Header with the status selector; the AI brief
// (P-6); extracted fields with AI-filled markers; articles the employee was
// already shown; escalation emails; the conversation; the full timeline
// (internal notes included); the reply composer with "Generate draft" (P-7); and
// the classification editor. Every action reloads the ticket.
import type { AgentTicketDetailResponse, TicketStatus } from '@sd/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PRIORITY_TONE, priorityLabel } from '@/components/chat/TicketDraftCard';
import { TicketEmails } from '@/components/tickets/EmailCard';
import { EVENT_LABEL, formatDateTime } from '@/components/tickets/ticketLabels';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { AGENT_STATUS_LABEL } from '@/lib/agentTicket';
import { api, ApiError } from '@/lib/api';
import { fieldLabel, UNKNOWN } from '@/lib/ticketDraft';
import { ClassificationEditor } from './ClassificationEditor';
import { type ComposerMode, ReplyComposer } from './ReplyComposer';
import { StatusSelector } from './StatusSelector';

type Data = AgentTicketDetailResponse;
type Notice = { tone: 'ok' | 'error'; text: string } | null;

const toError = (err: unknown) =>
  err instanceof ApiError ? err : new ApiError(0, 'NETWORK', 'Cannot reach the service.');

/** Agent-facing labels for the timeline (internal events included). */
const AGENT_EVENT_LABEL = {
  ...EVENT_LABEL,
  reply: 'Reply to employee',
  note: 'Internal note',
  status_change: 'Status changed',
  classification_correction: 'Classification corrected',
  ai_draft_generated: 'AI draft generated',
};

function AiSummaryPanel({ data }: { data: Data }) {
  const { ticket } = data;
  const assist = ticket.agentAssist;
  return (
    <Card data-testid="ai-summary" className="space-y-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-700">
        <Icon name="sparkles" className="h-4 w-4" /> AI brief
      </p>
      {assist?.status === 'skipped' && (
        <p className="text-sm text-slate-600">
          Confidential case: no AI summary (sensitive topics bypass the AI).
        </p>
      )}
      {assist?.headline && (
        <p data-testid="ai-headline" className="text-sm font-semibold text-slate-900">
          {assist.headline}
        </p>
      )}
      {ticket.agentBrief && (
        <p data-testid="ai-brief" className="text-sm whitespace-pre-wrap text-slate-700">
          {ticket.agentBrief}
        </p>
      )}
      {assist?.status === 'fallback' && (
        <p className="text-xs text-slate-500">
          The AI summary was not available; this is the employee&apos;s description.
        </p>
      )}
      {!assist && !ticket.agentBrief && <p className="text-sm text-slate-500">No brief yet.</p>}
      {assist && assist.firstChecks.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-600">Suggested first checks</p>
          <ul data-testid="ai-first-checks" className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {assist.firstChecks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function FieldsPanel({ data }: { data: Data }) {
  const fields = Object.entries(data.ticket.fields);
  if (fields.length === 0) return null;
  const ai = new Set(data.aiFilledFields);
  return (
    <Card className="space-y-2">
      <p className="text-xs font-semibold text-slate-600">Details</p>
      <dl data-testid="ticket-fields" className="space-y-2 text-sm">
        {fields.map(([key, value]) => (
          <div key={key}>
            <dt className="flex items-center gap-1.5 text-xs text-slate-500">
              {fieldLabel(key)}
              {ai.has(key) && (
                <span data-testid="field-ai" title="Filled by AI from the conversation">
                  <Badge tone="violet">AI</Badge>
                </span>
              )}
            </dt>
            <dd
              className={value === UNKNOWN ? 'text-slate-400 italic' : 'break-words text-slate-900'}
            >
              {value === UNKNOWN ? 'Not given' : value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function AgentTicketView({
  data,
  busy,
  notice,
  onStatus,
  onClassify,
  onGenerate,
  onSend,
}: {
  data: Data;
  busy: boolean;
  notice: Notice;
  onStatus: (next: TicketStatus) => void;
  onClassify: Parameters<typeof ClassificationEditor>[0]['onSave'];
  onGenerate: Parameters<typeof ReplyComposer>[0]['onGenerate'];
  onSend: Parameters<typeof ReplyComposer>[0]['onSend'];
}) {
  const { ticket } = data;
  return (
    <article data-testid="agent-ticket" className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <p className="flex items-center gap-2 font-mono text-sm text-slate-600">
            <span data-testid="ticket-human-id">{ticket.humanId}</span>
            <span className="font-sans text-xs">· {ticket.queueLabel}</span>
          </p>
          <h1 className="text-xl font-semibold text-slate-900">{ticket.summary}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <Badge tone={PRIORITY_TONE[ticket.priority]}>{priorityLabel(ticket.priority)}</Badge>
            {ticket.priorityFloorApplied && (
              <span title="Raised by a priority rule">
                <Badge tone="warning">Floor: {fieldLabel(ticket.priorityFloorApplied)}</Badge>
              </span>
            )}
            {ticket.restricted && (
              <Badge tone="danger">
                <Icon name="lock" className="h-3 w-3" /> Confidential
              </Badge>
            )}
            <span>
              {ticket.requester.name} · {ticket.requester.department} · {ticket.requester.country}
            </span>
            <span>· Raised {formatDateTime(ticket.createdAt)}</span>
          </div>
        </div>
        <div data-testid="ticket-status" data-status={ticket.status}>
          <StatusSelector
            status={ticket.status}
            allowed={data.allowedStatuses}
            busy={busy}
            onChange={onStatus}
          />
        </div>
      </header>

      {notice && (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          data-testid="action-notice"
          className={`rounded-lg px-3 py-2 text-sm ${
            notice.tone === 'error'
              ? 'bg-rose-50 text-rose-800 ring-1 ring-rose-200'
              : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
          }`}
        >
          {notice.text}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <AiSummaryPanel data={data} />
          <ReplyComposer
            busy={busy}
            aiAvailable={!ticket.restricted}
            onGenerate={onGenerate}
            onSend={onSend}
          />
          <TicketEmails emails={data.emails} viewer="agent" />

          <details
            data-testid="transcript"
            className="rounded-2xl border border-slate-200/80 bg-surface p-4 shadow-card"
          >
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">
              Conversation ({data.transcript.length} messages)
            </summary>
            <ol className="mt-3 space-y-2">
              {data.transcript.map((m) => (
                <li
                  key={m.id}
                  className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-700 ring-1 ring-slate-200'
                  }`}
                >
                  <span className="block text-[11px] font-semibold text-slate-500 uppercase">
                    {m.role === 'user'
                      ? ticket.requester.name
                      : m.role === 'assistant'
                        ? 'Copilot'
                        : 'System'}
                  </span>
                  {m.content}
                </li>
              ))}
            </ol>
          </details>

          <section aria-labelledby="agent-timeline" className="space-y-3">
            <h2 id="agent-timeline" className="text-sm font-semibold text-slate-900">
              Timeline
            </h2>
            {data.events.length === 0 ? (
              <p className="text-sm text-slate-500">No events yet</p>
            ) : (
              <ol
                data-testid="ticket-timeline"
                className="space-y-3 border-l border-slate-200 pl-4"
              >
                {data.events.map((e) => (
                  <li
                    key={e.id}
                    data-testid="ticket-event"
                    data-type={e.type}
                    className="space-y-1"
                  >
                    <p className="text-xs text-slate-500">
                      <span className="font-medium text-slate-700">
                        {AGENT_EVENT_LABEL[e.type]}
                      </span>
                      {e.visibility === 'internal' && <> · internal</>} ·{' '}
                      {formatDateTime(e.createdAt)}
                    </p>
                    {e.type === 'status_change' && (
                      <p className="text-sm text-slate-700">
                        {AGENT_STATUS_LABEL[e.oldValue as TicketStatus] ?? e.oldValue} →{' '}
                        {AGENT_STATUS_LABEL[e.newValue as TicketStatus] ?? e.newValue}
                      </p>
                    )}
                    {e.type === 'classification_correction' && (
                      <p className="text-sm text-slate-700">
                        {fieldLabel(e.field ?? '')}: {e.oldValue ? fieldLabel(e.oldValue) : 'none'}{' '}
                        → {e.newValue ? fieldLabel(e.newValue) : 'none'}
                      </p>
                    )}
                    {e.body && (
                      <p
                        className={`text-sm whitespace-pre-wrap ${
                          e.visibility === 'internal'
                            ? 'rounded-md bg-amber-50 px-3 py-2 text-slate-800 ring-1 ring-amber-200'
                            : 'rounded-md bg-surface px-3 py-2 ring-1 ring-slate-200'
                        }`}
                      >
                        {e.body}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <Card className="space-y-3">
            <p className="text-xs font-semibold text-slate-600">Classification</p>
            <ClassificationEditor
              key={`${ticket.category}|${ticket.subcategory}|${ticket.priority}`}
              current={{
                category: ticket.category,
                subcategory: ticket.subcategory,
                priority: ticket.priority,
              }}
              options={data.categoryOptions}
              restricted={ticket.restricted}
              busy={busy}
              onSave={onClassify}
            />
          </Card>
          <FieldsPanel data={data} />
          {data.articlesShown.length > 0 && (
            <Card className="space-y-2">
              <p className="text-xs font-semibold text-slate-600">Already shown to the employee</p>
              <ul data-testid="articles-shown" className="space-y-1 text-sm text-slate-800">
                {data.articlesShown.map((a) => (
                  <li key={a.documentId} className="flex gap-1.5">
                    <Icon name="file" className="mt-0.5 h-4 w-4 text-slate-400" />
                    {a.docTitle}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </article>
  );
}

export function AgentTicketDetail({ id }: { id: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.agentTicket(id));
    } catch (err) {
      setError(toError(err));
    }
  }, [id]);

  useEffect(() => void load(), [load]);

  /** Runs an action, then reloads; a refused action (e.g. 409) shows the API's message. */
  const act = async (run: () => Promise<unknown>, ok: string): Promise<boolean> => {
    setBusy(true);
    setNotice(null);
    try {
      await run();
      setNotice({ tone: 'ok', text: ok });
      await load();
      return true;
    } catch (err) {
      setNotice({ tone: 'error', text: toError(err).message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const notFound = error?.status === 404 || error?.status === 400;
  return (
    <div className="space-y-4 pt-4">
      <Link href="/agent/queue" className="text-sm text-slate-600 hover:underline">
        ← Queue
      </Link>
      {/* The page keeps one h1 while loading or on error; the ticket view has its own. */}
      {!data && <h1 className="text-xl font-semibold text-slate-900">Ticket</h1>}
      {error && (
        <ErrorState
          title={notFound ? 'Ticket not found' : 'Could not load the ticket'}
          message={
            notFound ? 'It may be outside your queues. Open it from the queue.' : error.message
          }
          requestId={error.requestId}
          onRetry={notFound ? undefined : () => void load()}
        />
      )}
      {!error && !data && (
        <div role="status" aria-label="Loading ticket" className="space-y-3">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}
      {data && (
        <AgentTicketView
          data={data}
          busy={busy}
          notice={notice}
          onStatus={(next) =>
            void act(
              () => api.agentStatus(id, next),
              `Status changed to ${AGENT_STATUS_LABEL[next]}.`,
            )
          }
          onClassify={(change) =>
            void act(() => api.agentClassify(id, change), 'Classification corrected.')
          }
          onGenerate={async (tone) => {
            setNotice(null);
            try {
              return (await api.agentDraftReply(id, tone)).draft;
            } catch (err) {
              setNotice({ tone: 'error', text: toError(err).message });
              return null;
            }
          }}
          onSend={(mode: ComposerMode, body, usedAiDraft) =>
            act(
              () =>
                mode === 'reply' ? api.agentReply(id, body, usedAiDraft) : api.agentNote(id, body),
              mode === 'reply' ? 'Reply sent to the employee.' : 'Note added.',
            )
          }
        />
      )}
    </div>
  );
}
