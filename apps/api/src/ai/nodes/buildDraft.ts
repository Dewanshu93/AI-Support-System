// buildDraft (code; playbook section 5): the TicketDraft the employee reviews.
// Queue and priority come from the domain rules (routing, priority floors), never
// from AI output; unknown fields stay "unknown". Cannot fail on valid state.
// UC-07: when the queue has an email address and the case is not restricted,
// code also drafts the escalation email (domain/escalationEmail). Nothing is
// sent here; sendEmail runs only after the employee confirms.
import { type TicketDraft, TicketDraftSchema } from '@sd/shared';
import type { ConfigFiles } from '../../config/schemas';
import { composeEscalationEmail, type EscalationEmailResult } from '../../domain/escalationEmail';
import { applyPriorityFloor } from '../../domain/priorityFloors';
import { routeTicket } from '../../domain/routing';
import { fillTemplate } from '../../domain/templates';
import { requiredMissing, UNKNOWN } from '../../domain/ticketSchemas';
import type { PayrollFacts } from '../../domain/workspaceReplies';
import type { UsersRepository } from '../../modules/users/repository';
import type { State, StateUpdate } from '../graph/state';
import { fallbackExtraction } from './slotFill';
import type { WorkspaceRecords } from './workspaceAgents';

/** The model's issue text held a number the employee never typed; their own words were used. */
export const EMAIL_ISSUE_FALLBACK = 'EMAIL_ISSUE_FALLBACK';
/** The requester's user record could not be read, so no email was drafted. */
export const EMAIL_NO_SENDER = 'EMAIL_NO_SENDER';

export interface BuildDraftDeps {
  routing: ConfigFiles['routing'];
  priorityRules: ConfigFiles['priorityRules'];
  ticketSchemas: ConfigFiles['ticketSchemas']['schemas'];
  templates: ConfigFiles['templates']['templates'];
  /** Category and subcategory labels for the email (UC-07). */
  taxonomy?: ConfigFiles['taxonomy'];
  /** The requester's name, address and job details for the email (UC-07). */
  users?: Pick<UsersRepository, 'findById'>;
  /** Payroll records for payroll emails (UC-07); absent in graphs without workspace data. */
  records?: WorkspaceRecords;
}

const utcToday = () => new Date().toISOString().slice(0, 10);

export function createBuildDraft(deps: BuildDraftDeps) {
  /** Drafts the email, or returns null (no address, no user record, restricted). */
  async function draftEmail(
    state: State,
    draft: TicketDraft,
    fromModel: boolean,
  ): Promise<{ result: EscalationEmailResult | null; flags: string[] }> {
    // The address comes from routing config, like sendEmail recomputes it at send time.
    const queue = deps.routing.queues.find((q) => q.id === draft.queue.id);
    if (!queue?.email || queue.id === deps.routing.sensitiveQueue || !deps.users) {
      return { result: null, flags: [] };
    }
    const user = await deps.users.findById(state.input.userId);
    if (!user) return { result: null, flags: [EMAIL_NO_SENDER] };

    let payroll: PayrollFacts | 'unavailable' | null = null;
    if (draft.category === 'payroll') {
      try {
        payroll = deps.records
          ? await deps.records.payroll({
              id: state.input.userId,
              country: user.country,
              employmentType: user.employmentType,
            })
          : 'unavailable';
      } catch {
        // Records are context, not a precondition: the email says they were unavailable.
        payroll = 'unavailable';
      }
    }

    const category = deps.taxonomy?.categories.find((c) => c.id === draft.category);
    const subcategory = category?.subcategories.find((s) => s.id === draft.subcategory);
    const fieldLabels = Object.fromEntries(
      (deps.ticketSchemas[draft.category]?.fields ?? []).map((f) => [f.key, f.description]),
    );
    const fallback = fallbackExtraction(state);
    const result = composeEscalationEmail({
      draft,
      fromModel,
      fallback: { summary: fallback.summary, description: fallback.description },
      employeeTexts: [
        ...state.history.filter((m) => m.role === 'user').map((m) => m.content),
        state.input.text,
      ],
      categoryLabel: category?.label ?? draft.category,
      subcategoryLabel: subcategory?.label ?? null,
      fieldLabels,
      to: { queueId: queue.id, label: queue.label, address: queue.email },
      employee: {
        name: user.name,
        address: user.email,
        department: user.department,
        jobTitle: user.jobTitle,
        country: user.country,
        employmentType: user.employmentType,
      },
      payroll,
      today: deps.records?.today() ?? utcToday(),
      templates: deps.templates,
    });
    const flags =
      fromModel && result.issueSource === 'employee_words' ? [EMAIL_ISSUE_FALLBACK] : [];
    return { result, flags };
  }

  return async function buildDraft(state: State): Promise<StateUpdate> {
    const flow = state.ticketFlow;
    const category = flow.category!;
    const queue = routeTicket(deps.routing, { category, restricted: false });
    const extraction = flow.extraction ?? fallbackExtraction(state);
    const { priority, floorApplied } = applyPriorityFloor(
      {
        aiUrgency: extraction.urgency,
        matchedRules: [...(flow.matchedRules ?? []), ...(state.precheckResult?.matchedRules ?? [])],
        impactScope: extraction.impactScope,
      },
      deps.priorityRules.floors,
    );
    const citations = state.output?.citations ?? [];
    const articlesShown = [
      ...new Map(citations.map((c) => [c.documentId, c.docTitle])).entries(),
    ].map(([documentId, docTitle]) => ({ documentId, docTitle }));
    // Values code took from the employee's records are not AI-filled.
    const recordFilledFields = (flow.recordFilledFields ?? []).filter(
      (key) => flow.fields[key] !== undefined && flow.fields[key] !== UNKNOWN,
    );

    const base: TicketDraft = TicketDraftSchema.parse({
      domain: queue.domain,
      category,
      subcategory: extraction.subcategory,
      queue: { id: queue.id, label: queue.label },
      priority,
      aiUrgency: extraction.urgency,
      priorityFloorApplied: floorApplied,
      impactScope: extraction.impactScope,
      summary: extraction.summary,
      description: extraction.description,
      alreadyTried: extraction.alreadyTried,
      errorMessages: extraction.errorMessages,
      fields: flow.fields,
      aiFilledFields: Object.entries(flow.fields)
        .filter(([k, v]) => v !== UNKNOWN && !recordFilledFields.includes(k))
        .map(([k]) => k),
      requiredMissing: requiredMissing(deps.ticketSchemas, category, flow.fields),
      articlesShown,
      restricted: false,
      recordFilledFields,
    });

    const { result: email, flags } = await draftEmail(state, base, extraction.fromModel);
    const draft: TicketDraft = email ? { ...base, email: email.email } : base;

    // Drafts without an email keep exactly the pre-UC-07 wording.
    const ready = email
      ? fillTemplate(deps.templates.email_draft_ready, { queueLabel: queue.label })
      : fillTemplate(deps.templates.ticket_draft_ready, { queueLabel: queue.label });
    const safety = state.output?.mode === 'safety_steps' && !state.output.withdrawn;
    return {
      ticketFlow: { ...flow, requiredMissing: draft.requiredMissing },
      output: safety
        ? { ...state.output!, text: `${state.output!.text}\n\n${ready}`, draft }
        : { text: ready, citations: [], uncovered: [], withdrawn: false, draft },
      trace: {
        flags,
        outputs: {
          buildDraft: {
            queue: queue.id,
            priority,
            floorApplied,
            requiredMissing: draft.requiredMissing,
            // Counts and flags only: never the subject, body or any figure.
            email: email
              ? {
                  to: queue.id,
                  issueSource: email.issueSource,
                  systemInfoLines: email.systemInfoLines,
                  actionTakenLines: email.actionTakenLines,
                  recordsUnavailable: email.recordsUnavailable,
                  droppedItems: email.droppedItems,
                }
              : null,
          },
        },
      },
    };
  };
}
