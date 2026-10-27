# Build Contract — Employee Unified AI Gateway & Resolution Hub

|                          |                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| **Version**              | 2.0 (draft for approval)                                                                             |
| **Date**                 | 2026-10-07                                                                                           |
| **Author**               | Dewanshu Chakraborty                                                                                 |
| **Based on**             | "Use Case 1: Employee Unified AI Gateway & Resolution Hub" (project brief, 4 weeks)                  |
| **Supersedes**           | v1.0 "AI Service Desk Front Door" (draft, never approved); see the change summary at the end         |
| **Approved by**          | _name, date_                                                                                         |
| **Implementation guide** | `docs/PLAYBOOK.pdf` for the engineering method; the task list in `docs/PROGRESS.md` for the UC tasks |

Once approved, this document is read-only. Changes follow section U.

---

## A. Purpose

A single employee portal that brings common employee services into one place: checking assigned
work, updating timesheets, understanding payroll deductions, finding HR and IT policies, raising
HR/IT requests and following them up. An **AI Copilot** in the portal answers questions from
company policy and the employee's own records, performs simple actions (such as logging hours)
after the employee confirms them, and prepares escalations (a ticket plus an email draft) that the
employee reviews before anything is sent.

The deliverable is a **working prototype** for demonstration, built on synthetic data and mock
internal systems. It is not a production service.

## B. Scope (MVP)

In scope:

1. **Unified employee dashboard**: profile, today's/this week's tasks, timesheet status for the
   week, active requests, in-app notifications, and the AI Copilot.
2. **Timesheet management**: view timesheet status; log or update hours through the copilot in
   natural language ("Log 8 hours for the Banking project on September 12") or on a form.
3. **HR/payroll/IT question answering**: grounded, cited answers from policy documents.
4. **Payroll investigation**: questions such as "Why was my salary reduced?" are answered from the
   employee's own payroll, timesheet and attendance records **plus** the relevant policy, with
   record data and policy text shown separately.
5. **Escalation and tracking**: when the copilot cannot resolve an issue it offers a request; the
   AI drafts the ticket and an email to the right team; the employee reviews, edits and approves;
   the request is created and tracked on the dashboard.
6. **Audit trail** of every action the copilot takes or proposes.
7. A synthetic policy corpus (section Q) and mock data for employees, projects, tasks, timesheets,
   attendance and payroll (section J).

Already built and kept (from v1.0): cited answers with access control, clarifying questions,
sensitive-topic handoff, out-of-scope replies, ticket drafts with confirmation, duplicate check,
My Tickets, agent ticket API.

**Deferred — decision pending** (built only if the owner decides so after the MVP): agent AI
summary and draft reply, agent workspace UI, admin metrics, knowledge gaps, trace viewer,
document management UI, evaluation UI, judge suite and threshold tuning, historic demo data,
formal latency tuning. These were v1.0 tasks W3-06 to W4-09.

Out of scope: see section O.

## C. Users and roles

| Role                  | Can do                                                                                                    | Cannot do                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Employee              | Dashboard, copilot, own timesheets, own payroll records, own requests, approve/cancel AI-proposed actions | See other employees' data, team/admin pages  |
| Agent (HR/Payroll/IT) | Work requests in assigned queues and change their status (this moves the employee's tracker)              | See queues not assigned to them, admin pages |
| Admin                 | Read audit and traces; manage documents and evaluations (deferred UI)                                     | Act as an employee in the copilot            |

The eight seeded demo personas remain (five employees, two agents, one admin); sign-in is a demo
persona picker issuing a JWT session cookie. Real SSO is out of scope.

## D. User flows

Each flow is accepted when it works in the browser and has an automated end-to-end test.

| #   | Flow                                                                                                    | Acceptance                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Dashboard.** The employee signs in and lands on the dashboard.                                        | Shows profile, tasks with status, the week's timesheet (submitted, missing, not due), active requests with status, unread notifications, and the copilot.                                                                               |
| 2   | **Policy answer.** "What is the leave policy?" / "I cannot access VPN."                                 | A grounded answer from documents the employee's profile may read, with clickable citations; IT questions use the IT knowledge base.                                                                                                     |
| 3   | **Log timesheet by chat.** "Log 8 hours for the Banking project on September 12."                       | The copilot shows a confirmation card (date, project, hours); nothing is saved before the employee confirms; on confirm the entry is saved, the dashboard updates, an audit entry records "triggered by copilot, approved by employee". |
| 4   | **Timesheet status.** "Which days am I missing this week?"                                              | The answer comes from the employee's timesheet records, not from a model guess.                                                                                                                                                         |
| 5   | **Payroll investigation (LOP).** "Why was my salary reduced for September 12?"                          | The answer states the employee's record (e.g. no hours logged on Sept 12, LOP deduction of a given amount) and the cited policy rule, in separate parts; it then offers to log the missing timesheet and to raise a payroll request.    |
| 6   | **Escalation with email draft.** "Contact payroll about my LOP." or an unresolved issue.                | An AI-drafted request and email (subject, issue, system information, action taken, request) is shown; the employee can edit, send or cancel; on send a ticket is created, routed by rules, and the email is recorded in the outbox.     |
| 7   | **Request tracking.** "Show my pending requests." and the tracker page.                                 | Requests are listed with department and status (list and board views); a status change by an agent appears on the employee's dashboard with a notification.                                                                             |
| 8   | **Follow-up memory.** "Why was I marked absent on Sept 12?" → "I actually worked that day."             | "That day" resolves to September 12 without asking again.                                                                                                                                                                               |
| 9   | **Safety rails (kept from v1.0).** Sensitive topics, out-of-scope requests, vague requests, duplicates. | Sensitive topics get the confidential HR handoff with no AI advice; out-of-scope gets a fixed reply; vague requests get one clarifying question; a duplicate open request prompts "add to existing or create new".                      |

## E. AI behaviour rules

1. **Grounded answers only.** Policy answers use only retrieved policy text and cite it; numbers
   and dates are copied exactly; an answer with no valid citation is withdrawn.
2. **Record data comes from code.** Employee figures (hours, deductions, dates, statuses) are read
   by code from the database and shown as "your records"; the model may explain them but never
   invents or changes them.
3. **AI proposes, code decides and executes.** The model extracts intent and fields (date,
   project, hours, request details). Code resolves relative dates, validates them (own employee
   ID, known project, allowed date range, hour limits), routes the request, sets queue and
   priority, and performs the action only after the employee confirms. The model never calls
   the database or an API directly.
4. **Human in the loop.** No timesheet write, ticket or email happens without explicit
   confirmation of the exact content shown to the employee.
5. **Access control is enforced by code**: employees only ever see their own records and the
   policies their profile may read.
6. **Sensitive topics bypass the AI** for advice and field extraction.
7. **Prompt injection** in user text or documents is treated as data and never changes rules.
8. Every AI call has a validated output schema, a versioned prompt and a stored trace.

## F. Copilot intents and orchestration

One LangGraph state graph handles every copilot turn. The "specialised agents" of the brief are
**branches of that graph**, selected by deterministic code from the model's intent analysis:

| Intent                             | Example                             | Branch                                              |
| ---------------------------------- | ----------------------------------- | --------------------------------------------------- |
| Policy / IT question               | "What is the leave policy?"         | Policy RAG (HR and IT knowledge)                    |
| Payroll investigation              | "Why was my salary reduced?"        | Employee records + policy RAG                       |
| Timesheet action                   | "Log 8 hours for Project A."        | Extract → validate → confirm → write                |
| Timesheet / task view              | "Which days am I missing?"          | Employee records                                    |
| Request status                     | "Show my pending requests."         | Ticket store                                        |
| Escalation                         | "Contact payroll regarding my LOP." | Ticket + email draft → confirm → create and send    |
| Sensitive / out of scope / unclear | (see flow 9)                        | Fixed handoff, fixed reply, one clarifying question |

## G. Requests (tickets)

- Categories: IT (hardware, software, access, network) and HR (leave, benefits, payroll including
  timesheet and LOP queries, policy, employee relations), each routed to one queue by
  configuration.
- Priority: AI proposes; code applies floors (safety issues always critical).
- Workflow statuses are enforced in code. The tracker shows employee-facing labels (Open, AI
  investigation, Waiting for you, Escalated, Under review, Resolved), mapped from the workflow
  statuses by configuration.
- The requester, queue and priority floor are set by code, never by AI output or edits.
- No request exists and no email is sent until the employee confirms.

## H. Email

- The AI drafts the email; the employee sees and can edit subject and body before sending.
- Sent emails are stored in an outbox collection with the linked request and shown in the UI.
- Delivery is **mock by default** (outbox only). Real SMTP via Nodemailer is a configuration
  switch, enabled only if the network allows it.

## I. Audit trail

Every copilot action and every confirmation is written to the append-only audit log with
employee ID, action, parameters (e.g. date, hours, project), triggered by (copilot or form),
approved by, and timestamp. Employees can see their own activity; admins can see all.

## J. Data and privacy

- **Synthetic data only:** no real employee, HR, payroll or company data. Projects, tasks,
  timesheets, attendance and payroll records are generated by a deterministic seed script and
  include the LOP demo scenario.
- Internal systems (task tracker, HR/payroll system) are **mock APIs inside this application**.
- User text is redacted (email, phone, ID-like numbers, card, SSN, UK NI) before it is written
  to traces or evaluation exports.
- Another user's data returns "not found", never "forbidden".

## K. Security (prototype level)

JWT session cookie (httpOnly, 8-hour), role checks on every endpoint, append-only audit log,
request validation on every endpoint. Production hardening is listed in
`docs/PRODUCTION_GAPS.md`, not delivered here.

## L. Technical constraints

React (Next.js App Router) + Tailwind web app; Node.js + Express + TypeScript API; MongoDB
(structured data) and Qdrant (vector and keyword search); LangChain and one LangGraph state graph;
Zod; Jest, Supertest and Playwright; Nodemailer only if real email is enabled. One repository (npm
workspaces). LLM providers: Google Gemini and OpenRouter (which also reaches OpenAI and Claude
models), switchable by configuration. Runs locally without Docker; a Docker Compose setup is
provided but optional; cloud deployment depends on network approval.

## M. Integrations

None with real systems. Jira-style tasks, HR/payroll data and email are represented by mock
services and seed data inside the application.

## N. Non-functional requirements

| ID    | Requirement                                                                      | Target                                                                                         |
| ----- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| NFR-1 | **Responsiveness.** Time to the first word of an answer, and to a complete turn. | p50 first word ≤ 10 s; p90 complete turn ≤ 30 s; actions and fixed replies ≤ 5 s after confirm |
| NFR-2 | **Cost.** LLM spend per copilot turn.                                            | Average ≤ US$0.01 per turn                                                                     |
| NFR-3 | **Resilience.** Provider errors, timeouts and quota limits.                      | No turn hangs; a failure shows a retryable error; the dashboard works without an LLM key       |

## O. Out of scope (do not build)

Real payroll, HR or Jira/ServiceNow integration; actual salary processing; autonomous approval of
payroll corrections; any email or action without employee confirmation; complex multi-department
workflows; microservices or a separate AI service; autonomous agent loops or tools bound directly
to the LLM; real SSO, OAuth or MFA; Redis, Kubernetes, job queues, any vector database other than
Qdrant; real HR data; SLA timers, exports, file attachments; ORMs, global state libraries, UI kits
beyond Tailwind, chart libraries. New dependencies need a one-line justification and approval.

## P. Deliverables

1. Source code in one repository with setup instructions (README).
2. Seed scripts for users and mock HR data; ingestion script; the synthetic corpus.
3. Automated tests: unit, API, AI workflow (with fake models) and end-to-end for flows 1–9.
4. Documentation: architecture, decisions (ADRs), progress log, production gaps.
5. A demo script built around the LOP scenario (brief section 4).

## Q. Corpus rules

- Synthetic IT and HR policy documents in Markdown with validated metadata (as in v1.0).
- Adds: Loss of Pay (LOP) policy, timesheet policy, attendance policy; work-from-home is covered
  by the existing flexible-working policy.
- The corpus validates automatically (`npm run corpus:validate`).

## R. Evaluation

The existing golden set, retrieval eval and full-graph eval are kept and extended with cases for
the new intents (timesheet extraction, payroll investigation, request status). Hard gates:
forbidden-document leakage 0, sensitive handoff 100%, citation validity 100%, injection
resistance 100%, **no timesheet write or email without confirmation (100%)**.

## S. Acceptance

The prototype is accepted when:

1. Flows 1–9 work in the browser and their end-to-end tests pass.
2. The LOP scenario (brief section 4, steps 1–12) runs end to end in a demo.
3. The hard gates in section R pass.
4. Lint, type checks and all automated tests pass.

## U. Change control

Changes to this contract are written as a dated amendment below, with the reason, and approved
by the same approver. Implementation choices that do not change what is delivered are recorded
as ADRs in `docs/DECISIONS.md`.

### Change summary from v1.0

- Product re-scoped from an IT/HR service desk to the Employee Unified AI Gateway (Use Case 1).
- Added: dashboard, timesheets, payroll investigation, email drafting and outbox, request
  tracker, in-app notifications, mock task/HR/payroll data.
- Deferred (decision pending): agent AI assistance and UI, admin dashboards, knowledge gaps,
  trace viewer, document and evaluation UIs, judge suite, historic demo data.
- Removed from "out of scope": in-app notifications and email (both now confirmed by the
  employee and mock by default).
- Quality targets reduced to the hard gates; the v1.0 numeric targets remain measurable by the
  existing eval runner.

### Amendments

**A-1 (2026-10-20) — Use Case 1 extensions UC-11 – UC-17.** Status: approved by the owner;
manager approval pending (as for v2.0 itself).

- **Reason:** the MVP (UC-01 – UC-10) and the deferred v1.0 tasks are built; the owner chose the
  next features for the employee portal.
- **Added to scope (section B):**
  1. Leave management: leave balances and applying for leave through the copilot or a form, with
     a confirmation card (rule E.4) and audit (UC-11).
  2. A "Needs your attention" panel on the dashboard, computed by code: timesheet gaps, Loss of
     Pay risks around the payroll cutoff, requests waiting for the employee (UC-12, ADR-024).
  3. Bulk timesheet actions: several entries in one confirmation card (UC-13).
  4. Voice input in the copilot through the browser's speech recognition; the employee still
     sends the text (UC-14).
  5. Replies in the employee's language, Hindi first (UC-15).
  6. Feedback (thumbs up/down) on copilot answers, shown to admins with the knowledge gaps (UC-16).
  7. Managing one's own requests from chat: comment, cancel, reopen, each confirmed (UC-17).
- **Unchanged:** sections E (AI rules), O (out of scope) and the hard gates. New intents share
  one new version of the turn-analysis prompt, with golden cases and a full eval run before it
  is switched on.

**A-2 (2026-10-27) — Real tool integrations, Jira Cloud first; extensions UC-18 – UC-24.**
Status: approved by the owner (the company allows integrations with its tools); manager approval
pending.

- **Reason:** employees use real tools (Jira first); the copilot is more useful on their real
  work than on mock tasks.
- **Changed (sections M and O):** a real integration is allowed once it has its own ADR. The
  first is Jira Cloud (UC-18, ADR-032). Each employee connects their own Atlassian account
  (OAuth 2.0); the app sees only what Jira lets that employee see. HR, payroll, ITSM and email
  stay mock until their own ADR (UC-19).
- **Rules for every integration:** code calls the system (no tools bound to the model); reads
  first; every write is a confirmed action with an audit entry (rule E.4); secrets and client
  credentials only in `.env`; tokens encrypted at rest; tests and the demo run on the mock.
- **Added to scope (section B):** UC-18 Jira Cloud; UC-19 connector layer for the other systems;
  UC-20 IT access requests; UC-21 expense claims (no attachments); UC-22 my equipment; UC-23
  satisfaction rating after resolution; UC-24 agent reply templates.
- **Unchanged:** section E (AI rules) and the hard gates.
