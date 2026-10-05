# CLAUDE.md — standing instructions

## Sources of truth

- `docs/BUILD_CONTRACT.md` — **what** is built (read-only; approved amendments only).
- `docs/PLAYBOOK.md` → `docs/PLAYBOOK.pdf` — **how** it is built: task cards, sections 1–15.
- `docs/ARCHITECTURE.md` (current reality), `docs/DECISIONS.md` (ADRs), `docs/PROGRESS.md` (task status).

## Stack (mandatory — do not replace without approval)

Next.js (App Router) + Tailwind · Node.js + Express + TypeScript · MongoDB (structured data and
chunk text) + Qdrant (dense + sparse BM25 vector search; ADR-004 replaces Atlas Search/Vector Search) ·
LangChain · LangGraph (one `StateGraph`) · Zod · Jest + ts-jest ·
Supertest · Playwright. npm workspaces modular monolith: `apps/web`, `apps/api`,
`packages/shared`, `e2e`.

## Commands

| Command                               | What it does                                                     |
| ------------------------------------- | ---------------------------------------------------------------- |
| `npm install`                         | Install all workspaces                                           |
| `npm run dev:api` / `npm run dev:web` | Build shared, then run api (:4000) / web (:3000)                 |
| `npm run lint`                        | ESLint over the whole repo                                       |
| `npm run typecheck`                   | `tsc` in every workspace (includes tests)                        |
| `npm test`                            | Jest in shared, api, web                                         |
| `npm run test:e2e`                    | Playwright (starts web dev server if not running)                |
| `npm run db:indexes`                  | Create Mongo indexes + Qdrant collection (idempotent)            |
| `npm run seed`                        | Upsert demo users from `seed/users.json` (idempotent)            |
| `npm run corpus:validate`             | Validate `corpus/` (`-- --write` refreshes the README inventory) |
| `docker compose up --build`           | web + api + mongodb + qdrant                                     |

## Core rules

- **AI proposes, code decides.** Anything that must be exact (permissions, IDs, routing, priority
  floors, citations, decisions) is plain TypeScript with unit tests, never inside a prompt.
- One LangGraph `StateGraph`, deterministic conditional edges. No multi-agent designs, no
  LLM-chosen routing, no tools bound to the LLM. Retrieval and ticket creation are graph-owned nodes.
- No AI call without a Zod output schema, a versioned prompt and a trace entry.
- No endpoint without a Zod request schema, an RBAC rule and a Supertest test.
- Zod schemas live once: `packages/shared` (API) or `apps/api/src/ai/schemas` (LLM outputs).
- Folder boundaries per playbook section 2 (e.g. `modules/*` never import `ai/llm`; `domain/` does
  no I/O; prompts only in `ai/prompts`).
- Tests next to code (`*.test.ts`); API tests in `apps/api/test/api/`; AI workflow tests in
  `apps/api/test/ai/` with fake models; E2E in `e2e/`.

## Do Not Build (playbook section 14 — stop and propose instead)

Microservices / separate AI service / brokers · multi-agent or autonomous loops · LLM calls beyond
P-1–P-9 · external integrations (ServiceNow, Jira, Slack, …) · real SSO/OAuth/MFA · Redis,
Kubernetes, job queues, any vector DB other than Qdrant (ADR-004) · real HR data · notifications, SLA timers, exports,
attachments · Mongoose/ORMs, Redux/Zustand, UI kits beyond Tailwind, chart libraries.
Any new dependency outside the approved list needs a one-line justification and approval.

## Session protocol

Before implementation:

1. Read `CLAUDE.md`, `docs/PROGRESS.md`, the task card in `docs/PLAYBOOK.md`, and the playbook
   sections the card references.
2. Inspect the affected modules and their tests; run `npm test` to confirm a green baseline.
3. Restate the task scope, the files to be touched, and anything ambiguous. Stop and ask if the
   card conflicts with the code or contract.
4. Propose a short plan; wait for approval on tasks marked with dependencies on D-1 – D-5 decisions.

During implementation:

1. Implement only the current task; no opportunistic refactors outside its files.
2. Write or update tests alongside code; use fake models for AI unit and workflow tests.
3. Keep Zod schemas in `packages/shared` or `ai/schemas` as the single definition of every shape.
4. Any new dependency, folder, collection, endpoint or LLM call not in the playbook → stop and ask.
5. Record non-obvious decisions as ADRs immediately.

After implementation:

1. Run `npm run lint`, `npm run typecheck`, `npm test` (unit + integration + API) and the relevant
   Playwright spec.
2. For AI-affecting tasks, run the relevant eval suite and paste the headline metrics into
   PROGRESS.md.
3. Verify each acceptance criterion on the card, one by one, stating how it was verified.
4. Report: changed files, tests added, acceptance results, risks, follow-ups, any deviation from
   the playbook.
5. Update ARCHITECTURE.md and PROGRESS.md; commit with message `W<w>-<nn>: <task name>`.
