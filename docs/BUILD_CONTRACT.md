# Build Contract — AI Service Desk Front Door

|                          |                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------- |
| **Version**              | 1.0 (draft for approval)                                                                |
| **Date**                 | 2026-10-06                                                                              |
| **Author**               | Dewanshu Chakraborty, written at the manager's request because no prior contract exists |
| **Approved by**          | _name, date_                                                                            |
| **Implementation guide** | `docs/PLAYBOOK.pdf` (how it is built); this document says **what** is delivered         |

Once approved, this document is read-only. Changes follow section U.

---

## A. Purpose

Employees ask IT and HR questions in one chat. The assistant answers from company policy with
cited sources, asks a clarifying question when a request is unclear, hands sensitive topics to
HR in confidence, and turns problems that need a person into tickets the employee reviews
before they are created. Agents work those tickets; admins see quality, gaps and costs.

The deliverable is a **working prototype** for demonstration and evaluation, not a production
service.

## B. Scope

In scope:

- Employee chat (web) with streamed, cited answers.
- Ticket creation from chat with employee confirmation, routing and priority by rules.
- Agent workspace for IT and HR queues.
- Admin pages: metrics, knowledge gaps, AI traces, document management, evaluation runs.
- A synthetic policy corpus (section Q), a golden evaluation set and an evaluation runner
  (sections R and S).

Out of scope: see section O.

## C. Users and roles

| Role     | Can do                                                                                     | Cannot do                                       |
| -------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Employee | Chat, view own conversations, confirm/cancel ticket drafts, view own tickets, rate replies | See other employees' data, agent or admin pages |
| Agent    | Work tickets in their assigned queues; HR agents see confidential HR cases                 | See queues not assigned to them, admin pages    |
| Admin    | Metrics, gaps, traces, documents, evaluations; read the agent queue                        | Act as an employee in chat                      |

Eight demo personas are seeded (no real people): five employees covering US/UK, full-time and
contractor, and standard and manager access; two agents (IT queues; HR queues, including
confidential cases); one admin. Sign-in is a demo persona picker; real SSO is out of scope.

## D. User flows

Each flow is accepted when it works in the browser and has an automated end-to-end test.

| #   | Flow                                                                                                                                                       | Acceptance                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Cited answer.** An employee asks a policy question and gets an answer drawn only from documents their profile may read, with clickable source citations. | The same question gets profile-specific answers (e.g. US full-time vs UK contractor); a citation opens the source passage; the employee can mark it resolved and rate it, and both are stored.                                             |
| 2   | **Partial answer.** The policy covers only part of the question.                                                                                           | The answer covers what the sources support and says plainly what they do not cover; "not resolved" offers a ticket.                                                                                                                        |
| 3   | **Clarification.** The request is too vague to search or act on.                                                                                           | One clarifying question, at most once per topic, then an answer or escalation.                                                                                                                                                             |
| 4   | **Ticket from chat.** The employee asks for a person, needs an action, or the policy has no answer.                                                        | A ticket draft with AI-filled fields is shown; the employee edits and confirms it; only then is the ticket created, routed to the right queue with a rule-based priority. Missing required details are asked for (at most two rounds).     |
| 5   | **Duplicate prompt.** The employee already has an open ticket on the same issue (within 7 days).                                                           | Before creating, the employee chooses to add to the existing ticket or create a new one.                                                                                                                                                   |
| 6   | **Sensitive topic.** Harassment, discrimination, health, legal, grievance or wellbeing.                                                                    | No AI advice and no policy text; a confidential HR contact and the offer "Would you like HR to contact you privately?". On yes, a restricted HR case is created that only HR agents can see.                                               |
| 7   | **Out of scope.** Not about IT or HR at work.                                                                                                              | A fixed reply saying what the assistant can help with; no search, no answer generation.                                                                                                                                                    |
| 8   | **Agent works a ticket.**                                                                                                                                  | The agent sees their queue in priority order, opens a ticket with the AI summary, transcript and cited articles, generates and edits a draft reply, adds internal notes, changes status, and corrects category or priority.                |
| 9   | **Admin oversight.**                                                                                                                                       | Admin sees decision and resolution metrics with latency and cost, knowledge-gap clusters from unanswered questions, the full trace of any AI turn, can upload or re-index documents, and can start evaluation runs and view their results. |

## E. AI behaviour rules

1. **Grounded answers only.** Answers use only retrieved policy text; every factual sentence
   cites its source; numbers and dates are copied exactly. A number not found in the cited
   source withdraws the answer.
2. **Citations are verified by code.** The model can only reference sources it was given; a
   citation to anything else is removed, and an answer with no valid citation is withdrawn and
   replaced by an offer to raise a ticket.
3. **Access control is enforced by code, twice:** in the database query and again before any
   text reaches the model or the screen. The AI never decides who may read what.
4. **AI proposes, code decides.** Routing, priority floors, ticket status, decisions, permissions
   and citations are deterministic code with tests, never prompt instructions.
5. **Sensitive topics bypass the AI** for advice and field extraction (flow 6).
6. **Prompt injection** in user text or documents is treated as data and never changes rules.
7. Every AI call has a validated output schema, a versioned prompt and a stored trace.

## F. Turn decisions

Every turn ends in exactly one of six decisions, chosen by an ordered rule table in code:
SENSITIVE_HANDOFF, OUT_OF_SCOPE, ESCALATE (safety, user request, action needed, no evidence),
CLARIFY, ANSWER, PARTIAL. Thresholds for ANSWER/PARTIAL are configuration, tuned by evaluation.

## G. Tickets

- Categories: IT (hardware, software, access, network) and HR (leave, benefits, payroll,
  policy, employee relations), each routed to one queue by configuration.
- Priority: AI proposes; code applies floors (safety issues are always critical; org-wide
  impact at least high).
- Statuses: new → in progress → waiting on employee → resolved → closed, with allowed
  transitions enforced in code.
- The requester, queue and priority floor are set by code, never by AI output or edits.
- No ticket exists until the employee confirms it.

## H. Agent workspace

As in flow 8. Agents see only their queues; confidential HR cases only for HR agents; every
change is recorded in the ticket's event history and the audit log.

## I. Admin

As in flow 9. Evaluation conversations are excluded from all dashboards.

## J. Data and privacy

- **Synthetic data only:** no real employee, HR or company data.
- User text is redacted (email, phone, ID-like numbers, card, SSN, UK NI) before it is written
  to traces, gap clusters or evaluation exports; raw text stays only in the conversation,
  readable by its owner and authorised roles.
- Another user's conversation or ticket returns "not found", never "forbidden".

## K. Security (prototype level)

Session cookie (httpOnly, 8-hour), role checks on every endpoint, append-only audit log,
request validation on every endpoint. Production hardening is listed in
`docs/PRODUCTION_GAPS.md`, not delivered here.

## L. Technical constraints

Next.js + Tailwind web app; Node.js + Express + TypeScript API; MongoDB (structured data) and
Qdrant (vector and keyword search); LangChain and one LangGraph state graph; Zod; Jest,
Supertest and Playwright. One repository (npm workspaces). LLM providers: Google Gemini and
OpenRouter, switchable by configuration. Runs locally without Docker on the developer machine;
a Docker Compose setup is provided but optional.

## M. Integrations

None. ServiceNow, Jira, Slack, email and HR systems are represented by the app's own ticket
store and seed data.

## N. Non-functional requirements

Measured on the demo machine over 30 scripted turns (playbook W4-09), with the configured
provider. The thresholds are proposed from today's measurements and should be confirmed at
approval.

| ID    | Requirement                                                                      | Target                                                                                                                                                                                                                                                  |
| ----- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-1 | **Responsiveness.** Time to the first word of an answer, and to a complete turn. | p50 first word ≤ 10 s; p90 complete answer turn ≤ 30 s; templated replies (sensitive, out of scope) ≤ 5 s. Progress is shown within 1 s.                                                                                                                |
| NFR-2 | **Cost.** LLM spend per employee turn.                                           | Average ≤ US$0.01 per turn; a full 80-case evaluation ≤ US$2.                                                                                                                                                                                           |
| NFR-3 | **Resilience.** Provider errors, timeouts and quota limits.                      | No turn hangs: a failure shows a retryable error within 90 s; no message is lost (failed replies are stored with status error); failures before any text is shown are retried automatically; the app starts and serves non-AI pages without an LLM key. |

## O. Out of scope (do not build)

Microservices or a separate AI service; multi-agent or autonomous loops; LLM calls beyond the
nine defined prompts; external integrations (section M); real SSO, OAuth or MFA; Redis,
Kubernetes, job queues, any vector database other than Qdrant; real HR data; notifications,
SLA timers, exports, file attachments in chat; ORMs, global state libraries, UI kits beyond
Tailwind, chart libraries. New dependencies need a one-line justification and approval.

## P. Deliverables

1. Source code in one repository with setup instructions (README).
2. Seed and ingestion scripts; the synthetic corpus (section Q).
3. The golden set and evaluation runner with stored reports (sections R and S).
4. Automated tests: unit, API, AI workflow (with fake models) and end-to-end for flows 1–9.
5. Documentation: architecture, decisions (ADRs), progress log, production gaps.
6. A demo script covering flows 1–9.

## Q. Corpus rules

- Synthetic IT and HR policy documents in Markdown with required metadata: slug, title,
  domain, owner, version, effective date, countries, employment types, access level, status,
  and the version they supersede.
- Coverage: US and UK; full-time and contractor variants; manager-only documents; at least one
  superseded version per trap case (an old policy that would give a wrong answer); tables
  where facts are tabular; one document containing a planted instruction, for injection tests.
- Required documents include battery safety and access requests.
- The corpus validates automatically (`npm run corpus:validate`); invalid metadata fails
  ingestion.
- Current corpus: 35 documents (`corpus/README.md` lists them with their key facts).

## R. Golden set and evaluation method

- 80 cases: 35 answerable, 10 partial, 10 clarify, 12 escalate (including 4 multi-turn and 2
  safety), 8 sensitive (2 phrased indirectly), 5 out of scope; tags for injection (5),
  superseded traps (4), profile variants, multi-turn, tables, general IT. Format and validation
  as in playbook section 8.
- Suites: retrieval (no generation), full (the real graph per case), judge (LLM-judged
  groundedness of answers). Every run stores its configuration snapshot, per-case results and
  a report.

## S. Quality targets

| Metric                     | Target                    |
| -------------------------- | ------------------------- |
| Retrieval recall@5         | ≥ 85% (week-1 gate ≥ 75%) |
| Forbidden-document leakage | 0 (**hard gate**)         |
| Decision accuracy          | ≥ 85%                     |
| Sensitive handoff          | 100% (**hard gate**)      |
| Out-of-scope accuracy      | ≥ 90%                     |
| Citation validity          | 100% (**hard gate**)      |
| Ticket category accuracy   | ≥ 90%                     |
| Ticket field accuracy      | ≥ 85%                     |
| Invented field values      | 0                         |
| Safety priority floor      | 100%                      |
| Injection resistance       | 100% (**hard gate**)      |
| Groundedness (judge)       | ≥ 90%                     |
| Key-fact correctness       | ≥ 90%                     |
| Latency and cost           | NFR-1, NFR-2              |

A run passes when every target is met; a hard gate fails a run on its own.

## T. Acceptance

The prototype is accepted when:

1. Flows 1–9 work in the browser and their end-to-end tests pass twice in a row.
2. A full evaluation run meets section S.
3. NFR-1 to NFR-3 are met on the demo machine.
4. Lint, type checks and all automated tests pass.
5. Two clean demo rehearsals are completed.

## U. Change control

Changes to this contract are written as a dated amendment below, with the reason, and approved
by the same approver. Implementation choices that do not change what is delivered are
recorded as ADRs in `docs/DECISIONS.md` instead.

### Amendments

_None._
