# Progress

## Task status

| Task          | Name                                                                                              | Status                                                                                       | Date       |
| ------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------- |
| W1-01         | Monorepo scaffold                                                                                 | Done (Docker unverified)                                                                     | 2026-10-02 |
| W1-02         | Config and env loading                                                                            | Done                                                                                         | 2026-10-02 |
| W1-03         | Shared contracts and error envelope                                                               | Done                                                                                         | 2026-10-02 |
| W1-04         | Database layer and indexes                                                                        | Done (amended: Qdrant, ADR-004)                                                              | 2026-10-05 |
| W1-05         | Users seed and auth                                                                               | Done                                                                                         | 2026-10-05 |
| W1-06         | Frontend shell and login                                                                          | Done                                                                                         | 2026-10-05 |
| W1-07         | Corpus authoring and validation                                                                   | Done (pending owner review of numbers)                                                       | 2026-10-05 |
| W1-08         | Golden set v1                                                                                     | Done (pending owner review)                                                                  | 2026-10-05 |
| W1-09         | LLM and embedding provider layer                                                                  | Done                                                                                         | 2026-10-05 |
| W1-10         | Ingestion pipeline                                                                                | Done                                                                                         | 2026-10-05 |
| W1-11         | Access filter and hybrid retrieval                                                                | Done                                                                                         | 2026-10-05 |
| W1-12         | Retrieval eval runner                                                                             | Done                                                                                         | 2026-10-05 |
| W2-01         | Prompt registry                                                                                   | Done                                                                                         | 2026-10-05 |
| W2-02         | Graph state, skeleton and checkpointer                                                            | Done                                                                                         | 2026-10-05 |
| W2-03         | loadContext, precheck, analyzeTurn                                                                | Done                                                                                         | 2026-10-06 |
| W2-04         | retrieve and rerankAssess nodes                                                                   | Done                                                                                         | 2026-10-06 |
| W2-05         | Decision rules and decide node                                                                    | Done                                                                                         | 2026-10-06 |
| W2-06         | Grounded answer and citation validation                                                           | Done                                                                                         | 2026-10-06 |
| W2-07         | Clarify, out-of-scope and sensitive handoff nodes                                                 | Done                                                                                         | 2026-10-06 |
| W2-08         | Persist node and chat API with SSE                                                                | Done                                                                                         | 2026-10-06 |
| W2-09         | Chat UI                                                                                           | Done                                                                                         | 2026-10-06 |
| W2-10         | Full-graph eval suite                                                                             | Code complete; baseline pending (provider quota)                                             | 2026-10-06 |
| W3-01         | Ticketing domain rules                                                                            | Done                                                                                         | 2026-10-06 |
| W3-02         | slotFill and clarifyForTicket nodes                                                               | Done (live P-5 check pending provider quota)                                                 | 2026-10-06 |
| W3-03         | Human-in-the-loop confirmation and ticket creation                                                | Done                                                                                         | 2026-10-06 |
| W3-04         | Ticket draft UI, safety flow, My Tickets                                                          | Done                                                                                         | 2026-10-06 |
| W3-05         | Agent ticket API                                                                                  | Done                                                                                         | 2026-10-07 |
| W3-06 – W4-09 | Agent AI, agent UI, extraction metrics, admin pages, judge, hardening, historic data, performance | **In progress**: owner brought them back 2026-10-08 (W3-06, W3-07) and 2026-10-13 (the rest) | 2026-10-07 |
| W4-10         | E2E suite, documentation and demo                                                                 | Folded into UC-10                                                                            | 2026-10-07 |

### Use Case 1 tasks (Build Contract v2.0, ADR-015)

| Task  | Name                                                                                                                         | Status                  | Contract flows |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------------- |
| UC-00 | Pivot documents (contract v2.0, ADR-015, task list)                                                                          | Done                    | —              |
| UC-01 | Mock HR data (projects, tasks, timesheets, attendance, payroll, notifications) and new policies (LOP, timesheet, attendance) | Done                    | 1, 4, 5        |
| UC-02 | Employee data APIs: tasks, timesheets, payroll, notifications, dashboard summary                                             | Done                    | 1, 3, 4        |
| UC-03 | Employee dashboard and timesheet page                                                                                        | Done                    | 1              |
| UC-04 | Copilot intents: P-1 v2 intent field and deterministic branch routing                                                        | Done                    | 2–7            |
| UC-05 | Timesheet action branch: extract → validate → confirm card → write → audit; timesheet status answers                         | Done                    | 3, 4, 8        |
| UC-06 | Payroll investigation branch: records + policy, separated; follow-up offers                                                  | Done                    | 5, 8           |
| UC-07 | Escalation with AI email draft, edit/send/cancel, email outbox (mock; SMTP switch)                                           | Done                    | 6              |
| UC-08 | Request tracker (list + board, employee labels), status-change notifications, "show my requests"                             | Done                    | 7              |
| UC-09 | Golden-set cases and eval for the new intents; confirmation hard gate                                                        | Done (eval run pending) | all            |
| UC-10 | LOP end-to-end scenario test, README, demo script                                                                            | Done                    | all            |

### Use Case 1 extensions (owner, 2026-10-20)

Build Contract amendment A-1 (2026-10-20): owner approved, manager approval pending. Each new
prompt or intent needs an ADR (CLAUDE.md "Do Not Build": LLM calls beyond ADR-015). Owner
decision (2026-10-20): the new copilot intents of UC-11 – UC-17 share one P-1 v3 and one eval run.

| Task  | Name                                                       | Status                                               | Depends on   |
| ----- | ---------------------------------------------------------- | ---------------------------------------------------- | ------------ |
| UC-11 | Leave management: balances, apply for leave by chat/form   | 11a, 11b done; 11c (apply by chat, P-1 v3 eval) next | UC-01, UC-05 |
| UC-12 | "Needs your attention" panel (deterministic, no LLM)       | Done (copilot part in P-1 v3)                        | UC-02, UC-03 |
| UC-13 | Bulk timesheet actions (several entries, one confirm card) | Planned (amendment pending)                          | UC-05        |
| UC-14 | Voice input in the copilot (browser Web Speech API)        | Planned (amendment pending)                          | W2-09        |
| UC-15 | Hindi/multilingual answers                                 | Planned (amendment pending)                          | UC-04, UC-09 |
| UC-16 | Answer feedback loop (thumbs up/down → knowledge gaps)     | Planned (amendment pending)                          | W4-02        |
| UC-17 | Manage requests from chat (comment, cancel, reopen)        | Planned (amendment pending)                          | UC-08        |

Scope notes (to be expanded into task cards when each task starts):

- **UC-11** Mock leave balances and leave records in the seed; leave types and limits from
  config. New intents "leave balance" (records only) and "apply leave" (extract → code validates
  balance, overlaps, holidays, date range → confirm card → write → audit → notification). Leave
  without balance is flagged as LOP by code. Leave page under `(employee)`. New extraction prompt.
- **UC-12** Code-computed items: missing timesheet days before the payroll cutoff, LOP risk
  for those days, requests in "Waiting for you", leave expiring (after UC-11). Shown on the
  dashboard; the copilot answers "What should I do today?" from the same list. In-app only.
- **UC-13** "Fill my missing days with Banking, 8h", "copy last week". Code expands the
  request into entries, validates each, and shows one card listing them all; confirm writes them
  all, one audit entry per entry. Likely a new version of the timesheet extraction prompt.
- **UC-14** Microphone button in the chat box using the browser Web Speech API (no new
  dependency); the transcript fills the input and the employee still presses send. Hidden when
  the browser has no support.
- **UC-15** Reply in the employee's language (Hindi first). New prompt versions for the answer
  prompts; citations, figures and fixed replies stay as they are now. Golden cases in Hindi and a
  full eval run before switching versions in `config/prompts.yaml`.
- **UC-16** Thumbs up/down with an optional reason on each copilot answer, linked to its
  trace. New collection and endpoint (Zod, RBAC, Supertest). Downvotes appear on the admin
  Knowledge Gaps page; an admin can turn one into a draft golden-set case.
- **UC-17** New intent: comment on, cancel or reopen one's own request. Code resolves which
  request is meant and checks the allowed status transitions; confirm card before any change; the
  change is audited and appears in the tracker.

## Checkpoints

| Checkpoint         | Status                             | Notes                                                                                                                                                        |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CP-1 Foundation    | **Passed (2026-10-05)**, local run | Compose criterion deferred by the owner; checked as a local run instead. See the CP-1 section below                                                          |
| CP-2 Retrieval     | **Passed (2026-10-05)**            | Corpus and golden set valid; full corpus ingested idempotently; fused recall@5 100% (gate 75%); leakage 0; exhaustive access-filter tests green              |
| CP-4 Employee flow | **Passed (2026-10-06)**            | Flows 1, 2, 3, 6 (offer step), 7 in the browser (Playwright); TTFT measured (4.7–13.4 s live); a trace for every turn; Playwright 16/16 green twice (replay) |

## W1-01 Monorepo scaffold — 2026-10-02

**Delivered:** npm workspaces (`packages/shared`, `apps/api`, `apps/web`, `e2e`),
`tsconfig.base.json` + TS project references (api → shared), ESLint flat config, Prettier,
Next.js 16 App Router + Tailwind v4 home page, Express 5 app with `GET /api/health`, Jest in
shared/api/web, Playwright in `e2e/`, Dockerfiles + `docker-compose.yml` (web, api,
`mongodb/mongodb-atlas-local:8.0`), `.env.example`, `CLAUDE.md`, `docs/*`, ADR-001, ADR-002.

**Verification**

| Check                                             | Result                                                     |
| ------------------------------------------------- | ---------------------------------------------------------- |
| `npm run lint`                                    | Pass                                                       |
| `npm run typecheck`                               | Pass (4 workspaces)                                        |
| `npm test`                                        | Pass — shared 1, api 2, web 1 (4 tests)                    |
| `npm run build`                                   | Pass (shared, api, Next production build)                  |
| Built API: `GET /api/health`                      | 200 `{"status":"ok"}`, no `X-Powered-By`                   |
| `npm run test:e2e` (`E2E_BROWSER_CHANNEL=chrome`) | Pass — 1 test (home page heading)                          |
| `docker compose up`                               | **Not verified** — Docker is not installed on this machine |

**Known issues / follow-ups**

- `docs/BUILD_CONTRACT.md` is a placeholder; the approved contract text must be added.
- Docker: **deferred by the owner (2026-10-05)**. Development runs locally (`npm run dev:api`,
  `npm run dev:web`) against the LAN MongoDB and Qdrant. Compose files stay in the repo but are
  unverified.
- Playwright's bundled Chromium could not be downloaded (network); E2E uses the installed Chrome
  via `E2E_BROWSER_CHANNEL=chrome`.
- ADR-002 tooling dependencies: **approved by the owner (2026-10-05)**.
- `/api/health` returns `{ status }` only; `db` and `llmConfigured` come with W1-04 and W1-09.

## W1-02 Config and env loading — 2026-10-02

**Delivered:** `apps/api/src/config/` (env schema, nine per-file YAML schemas, YAML loader,
cross-file checks, `loadConfig` / `initConfig` / `getConfig`, `.env` loading), initial
`config/*.yaml` (taxonomy, routing, priority-rules, sensitive, thresholds, ticket-schemas,
prompts, models, templates), shared `DOMAINS` / `PRIORITIES` enums, `server.ts` fail-fast startup,
README "Configuration" section. Dependencies: `zod` 4.6.5, `js-yaml` 5.4.2 (ships its own types).

**Verification**

| Check                                   | Result                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `npm run lint`                          | Pass                                                                            |
| `npm run typecheck`                     | Pass (4 workspaces)                                                             |
| `npm test`                              | Pass: shared 1, api 81, web 1 (83 tests)                                        |
| Missing env vars stop startup           | Pass: `server.test.ts` spawns the entry point; exit 1, names each var           |
| Malformed YAML stops startup            | Pass: `server.test.ts`; exit 1, `config/routing.yaml: malformed YAML at line …` |
| Each schema: valid and invalid fixtures | Pass: committed files plus 28 mutated fixtures and 3 generic cases per file     |

**Notes / follow-ups**

- Model IDs in `models.yaml` are placeholders until W1-09's `llm:smoke` verifies them.
- Taxonomy, routing, ticket fields, sensitive and safety patterns are first drafts; review them
  against the contract when it is added. W1-07 (corpus) and W1-08 (golden set) will exercise them.
- The cross-file check covers W3-01's "every category maps to exactly one queue" startup check
  early. W3-01 still owns the routing and priority-floor domain logic.

## W1-03 Shared contracts and error envelope — 2026-10-02

**Delivered:**

- `packages/shared`:
  - Enums with Zod schemas (roles, decisions, conversation, message, ticket, event, document,
    ingest and eval statuses, priorities, domains).
  - `errors.ts`: the error envelope plus a code → HTTP status table.
  - `api/common.ts`: ObjectId, pagination, paginated list helper.
  - `api/health.ts`, `REQUEST_ID_HEADER`.
- `apps/api/src/http/{errors,requestId,validate}.ts`, `lib/{errors,logger}.ts`.
- `createApp()` wired with the request ID, a 100 KB JSON limit, a 404 handler and the error
  handler.
- `LOG_LEVEL` env var; `server.ts` logs through pino.

Dependencies: `zod` 4.6.5 in shared (one copy, hoisted), `pino` 10.3.1 in api (ships its own types).

**Verification**

| Check                                     | Result                                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `npm run lint` / `npm run typecheck`      | Pass                                                                                                           |
| `npm test`                                | Pass: shared 26, api 107, web 3 (136 tests)                                                                    |
| Invalid body on a sample route → envelope | Pass: `errors.test.ts`; 400 `VALIDATION_ERROR`, `requestId` equals `X-Request-Id`, issues listed by path       |
| Error handler cases                       | Pass: malformed JSON, > 100 KB, AppError, unknown error → INTERNAL (no leak), async throw, unknown route → 404 |
| Contracts importable from web and api     | Pass: `apps/web/src/lib/contracts.test.ts`; web typecheck and Next build                                       |

**Notes / follow-ups**

- Endpoint-specific request/response schemas are added in `packages/shared/src/api/<group>.ts`
  with each feature task.
- The `DUPLICATE_CANDIDATE` 409 variant (W3-03) will use code `CONFLICT` with details, unless the
  ticketing task decides it needs its own code.
- `createApp({ extraRoutes })` exists only for tests. W1-05 introduces the route policy table in
  `http/routes.ts`.

## W1-04 Database layer and indexes — 2026-10-02

**Delivered:**

- `apps/api/src/db/`:
  - `client.ts`: connection with pooling, DB name from the URI, ping.
  - `schemas.ts`: Zod schemas for all 14 collections in playbook section 3.
  - `collections.ts`: typed accessors and `validateForWrite`.
  - `indexes.ts`: every regular index with an explicit name, `chunks_vector` and `chunks_text`
    search index definitions, and idempotent `ensureAllIndexes` with a wait for queryable search
    indexes.
  - `counters.ts`: atomic `nextSequence`.
- `scripts/create-indexes.ts` (`npm run db:indexes`).
- `server.ts` connects on startup, exits 1 if MongoDB is unreachable, and shuts down cleanly.
- `/api/health` reports `db`.
- Shared profile enums (country, employment type, access level), source type, feedback rating.
- ADR-003. Compose `restart: on-failure` for the api.

Dependency: `mongodb` 7.7.0 (official driver; D-5, no Mongoose).

**Verification**

| Check                                                  | Result                                                                                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint` / `npm run typecheck`                   | Pass                                                                                                                                   |
| `npm test`                                             | Pass: shared 31, api 177, web 3; 3 DB integration tests skipped                                                                        |
| Index definitions match section 3                      | Pass: unit tests for unique/sparse keys, eval/queue/duplicate indexes, search index definitions                                        |
| Idempotency and drift logic                            | Pass: unit tests against fakes (create all → re-run creates none; only missing created; key drift refused; dimension change refused)   |
| Search index wait logic                                | Pass: unit tests (becomes queryable, FAILED fails fast, timeout names pending)                                                         |
| Regular indexes created once across two runs (real DB) | Pass (2026-10-02): MongoDB 8.3.4 at 192.168.29.3; run 1 → 14 collections and 32 indexes, run 2 → 0 and 0; index sets match definitions |
| Counters atomicity and unique indexes (real DB)        | Pass: 50 concurrent increments → 1..50; duplicate email and duplicate ticket `conversationId` rejected (E11000)                        |
| ~~Search indexes reach ready state~~                   | Superseded by ADR-004: Atlas Search is not used (the LAN MongoDB returns `SearchNotEnabled`; Atlas is blocked by the HTC TLS proxy)    |

### W1-04 amendment: Qdrant vector store (ADR-004), 2026-10-02

On the owner's decision, MongoDB keeps structured data and chunk text, and Qdrant holds dense
vectors plus sparse BM25 vectors for hybrid search.

**Changes:**

- Added `db/qdrant.ts`: client, ping, `chunks` collection config, idempotent
  `ensureChunkCollection` with drift checks, and ObjectId ↔ UUID point IDs.
- Removed the Atlas search index code.
- Removed `embedding` from the Mongo chunk schema.
- New env vars: `QDRANT_URL`, `QDRANT_API_KEY`. Health reports `vectorStore`.
- `db:indexes` now also creates the Qdrant collection.
- Compose: `mongo:8.0` + `qdrant/qdrant:v1.19.1`.
- `connectDatabase` passes `runtimeAdapters: { os }`. Without it, driver 7 loads `os` via dynamic
  `import()`, which fails under Jest, and the handshake is sent without client metadata (MongoDB
  8.3: "Missing required sub-document 'driver'").
- `@qdrant/js-client-rest` 1.19.0 pins `undici` 7.29.0 (10 advisories, 1 high). npm 11.5.2 did not
  apply a root `overrides` entry in this workspace layout, so the risk is accepted and recorded in
  `PRODUCTION_GAPS.md` (low exposure: plain HTTP to our own Qdrant). Re-check in W4-07.

| Check                                         | Result                                                                                                                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests (Qdrant module, health, indexes)   | Pass: point-ID mapping, collection config, create-once/re-run, missing payload indexes, dimension and sparse drift refused, ping                                                                                    |
| MongoDB integration suite (Jest, real server) | Pass: 3/3 against MongoDB 8.3.4 at 192.168.29.3 (indexes once, unique constraints, counters)                                                                                                                        |
| Qdrant integration (collection once, drift)   | Pass (2026-10-05): 2/2 against Qdrant 1.19.1 at 192.168.29.3:6333 (throwaway collection created once with dense 768 cosine + bm25 IDF + 6 payload indexes; dimension change refused; collection deleted afterwards) |
| `npm run db:indexes` end to end, twice        | Pass (2026-10-05): run 1 → 14 collections, 32 indexes, Qdrant `chunks` + 6 payload indexes; run 2 and three further runs → nothing created, exit 0                                                                  |

**Fix during acceptance:** the second `db:indexes` run crashed at exit with a Windows libuv
assertion (`!(handle->flags & UV_HANDLE_CLOSING)`), caused by `process.exit()` while the Qdrant
client's keep-alive sockets were closing. The script now sets `process.exitCode` and lets Node exit
on its own. Three consecutive runs then exited cleanly.

**Environment:** `.env` uses `mongodb://192.168.29.3:27017/servicedesk` (LAN, no auth, shared with
other projects' databases) and `QDRANT_URL=http://192.168.29.3:6333` (no API key). The Atlas URI
is kept commented out. The real `servicedesk` database and Qdrant `chunks` collection now exist on
the LAN servers.

**W1-04 status: Done.** All acceptance criteria pass on real servers (Atlas search-index criterion
superseded by ADR-004).

**Notes / risks**

- The `tickets` index `{queue, status, priority: -1, createdAt}` follows the playbook. But
  `priority` is a string, so `-1` sorts alphabetically (medium > low > high > critical), not by
  severity. W3-05's queue sort ("priority desc") will need a numeric `priorityRank` field or an
  in-query mapping; this needs a decision before W3-05.
- Two stores (ADR-004): ingestion (W1-10) and document status changes (W4-04) must keep the Mongo
  chunk metadata and the Qdrant point payload in sync. BM25 tokenisation must match between ingest
  and query.
- The LAN MongoDB has no authentication and is shared with other projects. That is acceptable
  only for synthetic prototype data.
- LangGraph checkpoint collections are owned by the checkpointer package (W2-02) and are not
  created by `db:indexes`.

## W1-05 Users seed and auth — 2026-10-05

**Delivered:**

- `seed/users.json`: 8 demo personas.
  - Priya: US, full-time.
  - Tom: UK, contractor.
  - Olivia: UK, full-time, manager.
  - Marcus: US, contractor.
  - Ravi: US, full-time, manager.
  - Sam: IT agent; queues `it_hardware`, `it_software`, `it_access`.
  - Hana: HR agent; queues `hr_general`, `hr_case`.
  - Alex: admin.
- `npm run seed`: idempotent upsert by fixed `_id`.
- `modules/auth`: demo-users, login, logout, me. HS256 JWT in an httpOnly `SameSite=Lax` cookie
  `sd_session`, 8 h. Optional `DEMO_PASSWORD`, compared in constant time.
- `modules/users`: repository, mappers, `GET /api/profiles/me`, seed.
- `modules/audit`: append-only repository and service; logs `auth.login` and `auth.logout`.
- `http/requireAuth.ts`, `http/requireRole.ts`.
- **Route policy table** in `http/routes.ts` (DoD).
- `AppDeps` injection.
- Shared `api/auth.ts` contracts.

New dependencies (both approved): `jsonwebtoken` 9.0.3 and `cookie-parser` 1.4.7, plus their
`@types/*` packages.

**Verification**

| Check                                           | Result                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `npm run lint` / `npm run typecheck`            | Pass                                                                                          |
| `npm test` with both integration suites enabled | Pass: 286 tests (shared 31, api 252, web 3), 0 skipped                                        |
| Each role logs in                               | Pass: API tests for employee, agent and admin; live smoke test as Sam (agent)                 |
| 401 without a cookie                            | Pass: me, profiles and logout; tampered, foreign-secret, alg-none, expired and garbage tokens |
| 403 with wrong role                             | Pass: role matrix over employee-only, agent+admin and admin-only routes via the real guards   |
| Audit entries written                           | Pass: API tests (actor, role, ip, requestId) and the live `audit_log` on the LAN MongoDB      |
| Route policy table started (DoD)                | Pass: `http/routes.test.ts` asserts every route's policy and that there are no duplicates     |
| Seed on the real DB                             | Pass: run 1 → 8 inserted; run 2 → 8 unchanged                                                 |
| Users, audit and seed integration               | Pass: 4/4 against the LAN MongoDB (re-seed keeps `createdAt`, updates changed fields)         |

**Deviations / follow-ups**

- **Deferred to W4-07 (section 9 hardening):** the login rate limit (429, 10/min per IP) and the
  `X-Requested-With: sd-web` CSRF header check on mutating requests. Both are listed in the
  playbook's security architecture rather than on this card's acceptance criteria.
- Failed login attempts are not audited; the card lists only `auth.login` and `auth.logout`.
- `createApp` now takes `AppDeps`, and the test-only `extraRoutes` hook takes `RouteDef[]`, so test
  routes go through the same policy guards as real ones.
- ESLint now also ignores `_`-prefixed unused variables, matching the existing rule for arguments.

## W1-06 Frontend shell and login — 2026-10-05

**Delivered:**

- Next.js rewrites `/api/*` to the Express API (`API_URL`), so the session cookie is
  first-party and no CORS is needed.
- `lib/api.ts`: typed client that validates every response with the shared Zod schemas and turns
  errors into `ApiError` (code, message, request ID).
- `lib/session.ts`: server-side `getCurrentUser` and `requireArea`.
- `lib/roles.ts`: homes, navigation and area roles.
- `/login` persona picker, grouped by role, with loading, error (retry + request ID) and empty
  ("run seed") states, and a demo-password field when required.
- `(employee)`, `(agent)` (agent + admin) and `(admin)` layouts with role redirects and
  `AppShell`: navigation, user badge, sign out.
- `PrototypeBanner` on every page; `app/error.tsx` (Next 16 `retry`) and `app/loading.tsx`.
- Placeholder pages for all 14 section 10 routes.
- UI primitives: Button, Badge, Card, Spinner, Skeleton, EmptyState, ErrorState.
- API: `GET /api/auth/demo-users` now also returns `passwordRequired`.

Dependency: `zod` 4.6.5 added to the web app (already used by shared; approved).

**Verification**

| Check                                      | Result                                                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `npm run lint` / `npm run typecheck`       | Pass                                                                                                        |
| Unit tests                                 | Pass: web 13 (role routing, API client: validation, error envelope, network, invalid response)              |
| Playwright (`E2E_BROWSER_CHANNEL=chrome`)  | Pass: 9/9 against the real API + LAN MongoDB + production web build                                         |
| Each persona lands on their home           | Pass: Priya and Tom → `/chat`, Sam and Hana → `/agent/queue`, Alex → `/admin`; navigation and badge checked |
| Logout returns to login                    | Pass: then `/chat` redirects to `/login`                                                                    |
| Banner on every page                       | Pass: checked on every page each persona can open, plus `/login`                                            |
| Loading/error/empty primitives exist (DoD) | Pass: Skeleton/SkeletonCards, ErrorState, EmptyState; used by `/login`, `error.tsx`, `loading.tsx`          |

**Issues found and fixed during E2E**

- **Sign-in and sign-out used soft client navigation** (`router.replace` + `refresh`) right
  after the session cookie changed. That raced the cookie and aborted in-flight navigations. Both
  now do a full page load (`window.location.assign`). This also discards the client router
  cache, so no signed-in page data survives logout.
- **Sign out could be clicked before React hydration**, leaving a dead button. It is now
  disabled until hydrated.
- **Playwright's web server is a production build** (`next build && next start`), not
  `next dev`, so compile-on-demand no longer causes timeouts.

**Notes / follow-ups**

- E2E tests take 10–37 s each even against the production build, while the API answers in
  7–30 ms (measured with Node `fetch`). The likely cause is browser and corporate-network
  overhead on this machine; not a correctness issue.
- Wrong-role redirects from a route-group layout are delivered as a client-side redirect
  (HTTP 200 plus redirect), because the root `loading.tsx` makes the page stream. Browsers follow
  it, and the E2E tests cover it.
- Table, Tabs, Dialog, Textarea, Select and Toast primitives are added when a screen first needs
  them (W2-09 onwards).
- `apps/web/Dockerfile` and compose now use server-side `API_URL` instead of
  `NEXT_PUBLIC_API_URL` (still unverified: Docker is deferred).

## CP-1 Foundation checkpoint — 2026-10-05

| CP-1 criterion                                    | Result                                                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker compose up` + seed works on a clean clone | **Deferred by the owner.** Checked as a local run: `db:indexes` + `seed` (both idempotent) + `dev:api` / web against the LAN MongoDB and Qdrant |
| All three roles log in                            | Pass: API tests and Playwright (employee, agent, admin)                                                                                         |
| RBAC 401/403 tests green                          | Pass: role matrix in `test/api/auth.test.ts`, `rbac.test.ts`, route policy test                                                                 |
| Config validation fails fast                      | Pass: `server.test.ts` (missing env, malformed YAML → exit 1 with a readable message)                                                           |
| lint / typecheck / tests green                    | Pass: lint, typecheck, 297 Jest tests (with integration), 9 Playwright                                                                          |

**CP-1 status: passed (local run).** The run used the existing working tree, not a clean clone.

## W1-07 Corpus authoring and validation — 2026-10-05

**Delivered:**

- **35 synthetic policies** in `corpus/it` (14) and `corpus/hr` (21): 33 active, 2 superseded.
- `DocumentMetadataSchema` and `compareVersions` in `@sd/shared`.
- Corpus loader and validator in `apps/api/src/ai/ingestion/corpus.ts`.
- `npm run corpus:validate` (`scripts/validate-corpus.ts`), with `-- --write` to regenerate the
  README inventory.
- `corpus/README.md`: authoring rules, composition, deliberately missing topics, planted injection,
  key-facts sheet, inventory table (DoD).

**Section Q composition** (summarised on the card; the contract text itself is still missing):

| Requirement                  | Delivered                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 30–40 documents              | 35                                                                                                                                                |
| 6 US/UK topic pairs          | annual leave, parental leave, sick leave, public holidays, health benefits, retirement plan                                                       |
| 2 superseded versions        | `hr-parental-leave-us` 2.0 (12 weeks) → 3.0 (16 weeks); `it-password-mfa-policy` 1.0 (90-day expiry) → 2.0 (no expiry)                            |
| 3 documents with tables      | 7 (holidays US/UK, expenses, standard hardware, US annual leave, access approvals, Wi-Fi)                                                         |
| Battery-safety policy        | `it-battery-safety`                                                                                                                               |
| Access-request policy        | `it-access-requests`                                                                                                                              |
| 3–4 missing topics in README | 4: home office allowance, sabbatical, company car, tuition reimbursement                                                                          |
| Planted injection            | `it-office-printing`, "Contributor notes" section                                                                                                 |
| Profile variants (for eval)  | contractor-only: `hr-contractor-time-off`, `it-contractor-device-access`; manager-only: `hr-manager-leave-approval`, `hr-performance-improvement` |

**Verification**

| Check                             | Result                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| Validation script passes          | Pass: `npm run corpus:validate` → "Corpus is valid."                                                |
| Frontmatter schema                | Pass: all 35 parse with `DocumentMetadataSchema`; strict (unknown keys, unquoted versions rejected) |
| Unique slugs / one active version | Pass: unique slug@version; one active per slug; `supersedes` chains valid                           |
| Taxonomy domains                  | Pass: every domain is used by `config/taxonomy.yaml` and matches its folder                         |
| Validation runs in `npm test`     | Pass: `corpus.test.ts` (36 tests: real corpus, plus fixtures for each rule)                         |
| Inventory table in README (DoD)   | Pass: generated and checked cell by cell                                                            |

**Owner review needed (per the card, "the developer reviews for consistency of numbers"):**
the numbers are invented but internally consistent; the key-facts table in `corpus/README.md`
summarises them for review and for writing golden-set expectations in W1-08. The 2026 holiday dates
were checked against the calendar.

**Deviations / notes**

- `docs/BUILD_CONTRACT.md` section Q is still a placeholder; the corpus follows the card's summary.
- Frontmatter has no category field, because the playbook's metadata list has none; the
  "taxonomy domains" rule checks `domain` against `taxonomy.yaml`.
- `supersedes` holds the replaced version of the same slug (e.g. `'2.0'`).

## W1-08 Golden set v1 — deferred (2026-10-05)

Moved by the owner: W1-09, W1-10 and W1-11 do not depend on it. It must be done before W1-12
(retrieval eval, a W1-08 dependency), the end-of-week checkpoint ("corpus and golden set
validated") and the section 15 Definition of Done.

## W1-09 LLM and embedding provider layer — 2026-10-05

**Delivered:**

- `apps/api/src/ai/llm/`:
  - `chatModel.ts`: factory by provider/tier, `invokeStructured` with native output and JSON
    fallback, `llmConfigured`.
  - `embeddings.ts`: Gemini, 768 dims, document/query task types, batches of 50.
  - `retry.ts`: per-call timeout and backoff retries; SDK retries off.
  - `costTable.ts`.
  - `fakeModels.ts`: `FakeChatModel`, `FakeEmbeddings`.
  - `errors.ts`.
- `config/models.yaml`: `call` policy and `costs` table, required for every configured model.
- `npm run llm:smoke` (`scripts/llm-smoke.ts`).
- `/api/health` reports `llmConfigured`.
- `--use-system-ca` on the api `dev`/`start` scripts and on `llm:smoke`.
- ADR-005: D-1/D-2 approval (DoD), model choice, proxy approach.

Dependencies (LangChain, approved stack): `@langchain/core` 1.2.14, `@langchain/google-genai`
2.3.2, `@langchain/openai` 1.6.2.

**Verification**

| Check                                         | Result                                                                                                                                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run llm:smoke` (acceptance)              | Pass: Gemini and OpenRouter, fast (`gemini-3.1-flash-lite`) and quality (`gemini-3.8-flash`), all native structured output (`sum 42`, `Paris`); Gemini embeddings 768 dims with correct relevance ordering |
| Factory selection (unit)                      | Pass: provider/tier → model ID and class; OpenRouter base URL; config-only switch; missing key → config error; SDK retries 0                                                                               |
| Fallback structured-output path (unit, fakes) | Pass: native; fallback when unsupported, schema-invalid, or HTTP 400; invalid output → `invalid_output`; provider errors retried, not fallen back                                                          |
| Timeout/retry, cost, embeddings (unit)        | Pass: backoff timing, abort on timeout, 4xx not retried, max retries; cost per 1M tokens; batches of 50; dimension check                                                                                   |
| D-1/D-2 approvals recorded (DoD)              | Pass: ADR-005                                                                                                                                                                                              |

**Found during acceptance and fixed**

- **HTTP 400 from native structured output:** Gemini rejects JSON Schema `const` (from
  `z.literal`). A native-path 400 now falls back to the JSON path; prompt schemas should prefer
  `z.enum`.
- **Retired models:** the playbook's `gemini-2.5-*` models return 404 for new keys, and Pro has no
  quota on this key. The config now uses `gemini-3.1-flash-lite` (fast) and `gemini-3.8-flash`
  (quality).
- **Gemini 503 "high demand":** seen on `gemini-3.8-flash`; three attempts failed, and a re-run 30
  s later passed. Capacity can be bursty on this tier.
- **OpenRouter 402:** no output cap made OpenRouter reserve credit for 65,536 tokens. Added
  `call.maxOutputTokens: 2048` for both providers.

**Risks / follow-ups**

- **Embedding price** (`gemini-embedding-001`, $0.15/1M) is unverified; chat prices come from
  the OpenRouter catalogue.
- **OpenRouter key is free tier** with a small credit limit; long eval runs may need more.
- **Free-tier limits** (rate limits, 503s) may slow ingestion of 35 documents and the eval runs; a
  paid key removes this.

## W1-10 Ingestion pipeline — 2026-10-05

**Delivered:**

- `ai/ingestion/`: `loaders.ts`, `chunker.ts`, `contextualise.ts`, `embedder.ts`, `identity.ts`,
  `indexer.ts`.
- `ai/retrieval/bm25.ts`: shared keyword tokenizer and sparse vectors.
- `modules/documents/`: `repository.ts`, `vectorStore.ts`, `service.ts`.
- `scripts/ingest.ts` (`npm run ingest`).
- `StrictGeminiEmbeddings`, and retry-hint handling in `withCallPolicy`.
- ADR-006.

Dependency: `@langchain/textsplitters` 1.0.2 (LangChain, approved stack).

**Verification**

| Check                                     | Result                                                                                                                                                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run ingest` indexes the whole corpus | Pass: 35 documents, 168 chunks in MongoDB and 168 points in Qdrant (real Gemini embeddings, LAN servers)                                                                                                                                |
| Re-run is a no-op                         | Pass: "Indexed 0, unchanged 35, failed 0" in 0.8 s; no embedding calls                                                                                                                                                                  |
| Chunk metadata matches documents          | Pass: a script compared every chunk and point with its document (domain, countries, employment types, access level, status, slug, title, date): 0 problems; no orphan points; superseded versions have `supersededBy`                   |
| Chunker unit tests                        | Pass: heading paths, tables never split mid-row (oversized tables split by rows with header), overlap, recursive split, max size                                                                                                        |
| Integration test, 3 fixture documents     | Pass: `test/integration/ingest.test.ts` (both parental-leave versions + UK holidays) on real MongoDB + Qdrant with fake embeddings; re-run no-op; metadata consistent; BM25 and dense search work; superseded excluded by status filter |
| Chunk statistics printed (DoD)            | Pass: "Chunks: 168 across 35 documents; tokens per chunk mean 62 (min 13, max 213)"                                                                                                                                                     |

**Found during acceptance and fixed**

- **Silent embedding failures.** The first real run indexed 22 documents, then got empty vectors
  for 13. LangChain's Gemini embeddings swallow a failed batch (free-tier 429) and return `[]`.
  The dimension check stopped bad data being stored. `StrictGeminiEmbeddings` now propagates the
  error; retries honour Gemini's `retryDelay`; ingest allows 5 retries.

**Notes / risks**

- **Small chunks:** chunks are below the playbook's 350–500 token target because the policies'
  H2 sections are short (see ADR-006). This needs checking with the retrieval eval (W1-12).
- **Re-ingest after model change:** a different embedding model or dimension changes the hash,
  forcing a full re-index (and `db:indexes` refuses a dimension change on the existing collection).
- **Deleted corpus documents** are not removed from the stores until W4-04.

## W1-11 Access filter and hybrid retrieval — 2026-10-05

**Delivered:**

- `ai/retrieval/`: `accessRules.ts`, `accessFilter.ts`, `vectorSearch.ts`, `keywordSearch.ts`,
  `fusion.ts`, `retrieve.ts`.
- `findChunksByIds` in the documents repository.
- `scripts/retrieve.ts` (`npm run retrieve`).

No new dependencies.

**Verification**

| Check                                                                        | Result                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A UK contractor never receives US-only or superseded chunks** (acceptance) | Pass: integration test over the full corpus (10 queries, every raw vector and keyword hit plus every fused candidate checked as UK, contractor and active); real index: Tom's leave/holiday query returns only contractor-applicable documents, 0 violations |
| Exhaustive access-rule tests                                                 | Pass: 8 profiles × 54 audiences (country set × employment set × access level × status); `isAccessible`, the Qdrant pre-filter (evaluated in code) and `assertAccessible` all agree with an independently written rule                                        |
| RRF unit tests                                                               | Pass: 1/(k+rank) sums, per-source ranks, dedup, top-K, deterministic ties, k weighting                                                                                                                                                                       |
| Vector, keyword and fused integration tests                                  | Pass: GlobalProtect keyword top hit; VPN guide hidden from contractor; vector ranking ordered and filtered; fused serves parental leave 3.0, never 2.0; manager guide reaches managers only; domain hint                                                     |
| Every seeded profile only receives accessible chunks                         | Pass: 8 users × 10 queries over the full corpus                                                                                                                                                                                                              |
| Retrieval callable from a script with a result table (DoD)                   | Pass: `npm run retrieve` on the real index (Tom: contractor time off first; Priya: parental leave 3.0 sections at ranks 1–6; "GlobalProtect keeps disconnecting" → VPN Troubleshooting first)                                                                |

**Notes**

- Atlas `numCandidates` maps to Qdrant `hnsw_ef` (150).
- `assertAccessible` violations are reported through `onViolation`; W2 wires this to the logger
  as ACCESS_FILTER_VIOLATION and the turn trace.
- Retrieval quality (recall@5, vector vs keyword vs fused) is measured in W1-12, which needs the
  golden set (W1-08).

## W1-08 Golden set v1 — 2026-10-05

**Delivered:**

- `evals/golden/golden.v1.jsonl`: 80 cases, dataset version `v1`.
- `evals/runner/schema.ts`: `GoldenCaseSchema`, categories, tags, category → decision.
- `evals/runner/golden.ts`: loader, validator, composition.
- `scripts/validate-golden.ts` (`npm run golden:validate`).
- `evals/runner/golden.test.ts` runs in `npm test`: the api Jest config and spec tsconfig now
  include `evals/`.

**Composition** (printed by the validator; matches section 8):

| Item                         | Count                                                                                                  | Section 8    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ | ------------ |
| answerable                   | 35 (IT 18, HR 17)                                                                                      | 35 (~18/~17) |
| partial                      | 10                                                                                                     | 10           |
| clarify                      | 10                                                                                                     | 10           |
| escalate                     | 12                                                                                                     | 12           |
| sensitive                    | 8                                                                                                      | 8            |
| out_of_scope                 | 5                                                                                                      | 5            |
| profile-variant pairs        | 8 (vacation ×3 profiles, parental, sick, retirement, health, December holidays, laptop, remote access) | ≥ 8          |
| multi-document               | 4                                                                                                      | 4            |
| table lookups                | 6                                                                                                      | 3            |
| escalate multi-turn          | 4                                                                                                      | 4            |
| safety (battery, electrical) | 2                                                                                                      | 2            |
| sensitive, indirect          | 2                                                                                                      | 2            |
| injection                    | 5, across 5 categories (incl. the planted `it-office-printing`)                                        | 5            |
| superseded_trap              | 4 (parental leave 2.0; password policy 1.0 ×3)                                                         | 4            |
| holdout                      | 15, across all 6 categories                                                                            | 15           |

**Validator rules** (beyond the schema):

- Every `docSlugs` / `forbiddenDocSlugs` entry exists in the corpus (`slug` or `slug@version`).
- Every `userEmail` is a seeded user.
- **Every expected document is readable by that user's profile** (same `accessRules` as
  retrieval), so no case is impossible.
- **Every key fact appears verbatim in an expected document**: the consistency check on numbers.
- Category ↔ decision ↔ id code agree; `multi_turn` ⇔ more than one turn; superseded traps
  forbid a specific version.
- Escalation tickets use a taxonomy category/subcategory of the right domain and
  `ticket-schemas.yaml` fields, with all required fields.
- **Deterministic prechecks fire exactly where intended:**
  - direct sensitive cases match `sensitive.yaml`; indirect ones do not;
  - no other case matches it;
  - safety cases match `priority-rules.yaml` safety patterns with `minPriority: critical`, and no
    other case does.

**Verification**

| Check                                          | Result                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| Validator passes, prints section 8 composition | Pass: `npm run golden:validate` → "Golden set is valid."              |
| Validator in `npm test`                        | Pass: 23 tests (real set, 18 broken-case rules, composition, parsing) |
| Golden set committed; dataset version v1 (DoD) | Pass                                                                  |

**Notes / owner review**

- **Holdout marker:** holdout is marked with a `holdout` tag. The playbook lists the count but
  not the mechanism; threshold tuning (W4-06) excludes these cases.
- **Extra tags:** `multi_doc`, `safety` and `indirect` are additional tags used to check
  composition.
- **Review:** cases were drafted from the corpus key facts. Please review the expected decisions,
  especially the partial-coverage boundaries and the escalation ticket fields.

## W1-12 Retrieval eval runner — 2026-10-05

**Delivered:**

- `evals/runner/`:
  - `cli.ts`: `npm run eval -- --suite retrieval [--case …] [--tag …]`.
  - `retrievalSuite.ts`: each case with expected or forbidden documents is retrieved as its own
    user, recording the top 5 chunks per mode: vector only, keyword only, fused.
  - `scorers.ts`: recall@5, first-hit rank, MRR, forbidden-document leakage; per category and per
    tag; CP-2 gate.
  - `report.ts`: Markdown report in `evals/reports/`.
  - `store.ts`: `eval_runs` (with config snapshot: thresholds, prompt versions, models, git commit,
    dataset version) and `eval_results` per case.
- A non-zero exit code when the run fails.

**Baseline run** (`evals/reports/2026-10-05-retrieval-fbbbdac4.md`): 54 cases, 35.6 s, real
Gemini query embeddings on the LAN index.

| Mode    | Recall@5       | MRR   | Forbidden-doc leakage |
| ------- | -------------- | ----- | --------------------- |
| vector  | 100.0% (54/54) | 0.991 | 0                     |
| keyword | 100.0% (54/54) | 0.937 | 0                     |
| fused   | 100.0% (54/54) | 0.972 | 0                     |

**Verification**

| Check                                                    | Result                                                                                                                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Report shows recall@5 per mode and forbidden-doc leakage | Pass: see the table above; also per category and tag                                                                                                                         |
| Scorer unit tests with synthetic results                 | Pass: 15 tests (rank-6 miss, any-of-several hits, version-specific leakage, leakage below top 5 ignored, n/a recall, per-mode independence, MRR, gate, report, suite errors) |
| CP-2 gate: fused recall@5 ≥ 75%, leakage 0 (DoD)         | Pass: 100%, 0                                                                                                                                                                |
| Chunking decisions recorded (DoD)                        | Pass: ADR-006 updated with the eval outcome                                                                                                                                  |

**Caveats (important for interpreting 100%)**

- **The set is easy.** The corpus is small (35 documents, 168 chunks), the access filter shrinks
  each user's candidate pool (often to 20–25 documents), and the questions share vocabulary with
  the documents because the same author wrote both. Recall@5 is saturated here, so it does not
  discriminate between modes. **MRR does:** vector 0.991 > fused 0.972 > keyword 0.937.
- **Forbidden-document leakage is mostly guaranteed by the pre-filter:** forbidden documents are
  superseded or outside the user's profile. A non-zero value would mean an access-filter bug.
- **Stronger measurement comes later:** reranking and context assembly (W2-04) and the full eval
  (W2-10) measure retrieval with LLM-rewritten queries. A harder, more paraphrased golden-set
  revision (v2) is worth considering once real usage shows how people phrase questions.
- **The query is the case's user text** (all turns joined); the analysis step's `searchQuery`
  (P-1) replaces it in W2.
- **No cost is recorded:** embedding cost is not tracked yet (`costUsd: 0`).

## W2-01 Prompt registry — 2026-10-05

**Delivered:**

- `apps/api/src/ai/prompts/registry.ts`:
  - frontmatter parsing with a Zod-validated header;
  - mustache rendering with a strict variable check;
  - `<untrusted_*>` tags stripped from values;
  - SHA-256 hash and trace ref `name@vN#hash`;
  - active-version lookup from `config/prompts.yaml`.
- v1 of P-1 `turn_analysis`, P-2 `rerank_assess`, P-3 `grounded_answer` and
  P-4 `clarifying_question`, following the section 6 table.
- Output schemas in `apps/api/src/ai/schemas/`, one file per prompt: `TurnAnalysis` (taxonomy
  enums injected from config), `RerankAssessment`, `GroundedAnswerTrailer` and
  `ClarifyingQuestion`.
- `config/prompts.yaml` now lists only the prompts built (P-1 to P-4). `PromptsSchema` keys
  are optional but limited to the nine names, and at least one must be listed.
- `server.ts` loads the registry at startup.
- Prompt-writing guidelines added to `CLAUDE.md`.

**Verification**

| Check                                                | Result                                                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Registry returns template, version and hash          | Pass: unit test (`registry.test.ts`) checks version, 12-hex hash, `ref`, variables and rendered system/human messages                                              |
| Unknown prompt fails at startup                      | Pass: unknown names are rejected by `PromptsSchema` (strict keys); a listed version with no file exits 1 in the child-process test (`server.test.ts`)              |
| Tests: loading, missing variables, version switching | Pass: 24 registry tests (missing/unknown variables, v1→v2 switch with a different hash, mismatched frontmatter, malformed files, tag stripping) and 7 schema tests |
| DoD: prompt-writing guidelines in CLAUDE.md          | Pass: section "Writing prompts"                                                                                                                                    |
| lint, typecheck, tests                               | Pass: shared 31, api 459 (+19 integration skipped without the LAN DB), web 13                                                                                      |

**Notes**

- LangChain's mustache renders a missing variable as an empty string without error, so the
  registry checks the variables itself and also rejects extra ones.
- Importing LangChain adds about 10 s to server start under `tsx`. The startup-test spawn
  timeout was raised to 90 s; the graph (W2-02) makes this import permanent anyway.
- No model call was made: the prompts are checked against real models in W2-03 / W2-04 and by
  the full eval (W2-10). The eval `configSnapshot` still stores versions only; hashes reach
  traces when nodes start calling the registry.

## W2-02 Graph state, skeleton and checkpointer — 2026-10-05

**Delivered:**

- `ai/graph/{state,graph,edges,checkpointer}.ts`: the full section 5 topology (18 nodes, 7
  conditional edges) compiled as `supportTurnGraph`.
- `ai/nodes/*`: one stub per node. Each keeps a value preset in state and otherwise returns a
  fixed output. `awaitConfirmation` uses the real `interrupt()`.
- `ai/tracing/traced.ts`: step timings appended to `state.trace`.
- MongoDB checkpointer (`@langchain/langgraph-checkpoint-mongodb`), with an in-memory saver for
  tests.
- New dependencies: `@langchain/langgraph@1.4.19` and
  `@langchain/langgraph-checkpoint-mongodb@1.4.1` (ADR-007).

**Verification**

| Check                                                     | Result                                                                                                                                                                                                                                 |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Graph compiles                                            | Pass: test asserts all 18 section 5 nodes are present                                                                                                                                                                                  |
| A stubbed run reaches each terminal path by setting state | Pass: 11 path tests (precheck sensitive, analysis sensitive, ANSWER, PARTIAL, withdrawn, CLARIFY, OUT_OF_SCOPE, SENSITIVE_HANDOFF, ESCALATE, ESCALATE/SAFETY, forceEscalate), each asserting the exact node sequence                   |
| Workflow tests for each decision                          | Pass: `test/ai/graph.test.ts` (21 tests) plus edge unit tests (`edges.test.ts`, 18): confirm/cancel resume, malformed resume rejected, two-round ticket clarification across three turns on one thread, per-turn reset, injected nodes |
| MongoDB checkpointer                                      | Pass: integration test on the LAN MongoDB 8.3 pauses a draft, then resumes it from a fresh graph instance                                                                                                                              |
| DoD: Mermaid topology in ARCHITECTURE.md                  | Pass: section "LangGraph workflow (W2-02)"; a test fails if it goes stale                                                                                                                                                              |

**Notes**

- **Deviation:** the precheck output is stored as `precheckResult`, because LangGraph forbids a
  channel named like a node. A `confirmation` key was added for the resume value (ADR-007).
- No LLM call is made yet; there is no eval impact.
- The graph is not invoked by the API yet (W2-08).

## W2-03 loadContext, precheck, analyzeTurn — 2026-10-06

**Delivered:**

- `ai/guards/precheckRules.ts`: deterministic sensitive and safety matcher from config.
- Real nodes, as factories with injected dependencies:
  - `ai/nodes/loadContext.ts` (profile and last 8 messages);
  - `ai/nodes/precheck.ts`;
  - `ai/nodes/analyzeTurn.ts` (P-1, invalid output → 1 retry with the error → fallback +
    `ANALYSIS_FALLBACK`).
- `modules/conversations/repository.ts` (`recentMessages`).
- The trace now carries `outputs` (precheck, analysis) and `flags`; every LLM attempt is traced
  with prompt ref, model, tokens, cost and mode.
- The W2-02 stubs for these three nodes moved to `nodes/stubs.ts`. They remain the graph
  defaults until W2-08 wires the real nodes into the API.

**Verification**

| Check                                                                             | Result                                                                                                                                                                 |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sensitive keywords route without an LLM call                                      | Pass: graph test with the real precheck and analyzeTurn; the fake model records 0 calls and the path is loadContext → precheck → sensitiveHandoff → persist            |
| Analysis output validates                                                         | Pass: fake-model tests; live run below, 8/8 valid on the first attempt                                                                                                 |
| Precheck rule unit tests                                                          | Pass: 20 tests (all six sensitive topics, battery and electrical safety, ordinary requests with no hit, case and line breaks, multiple matches, impact floors ignored) |
| analyzeTurn with fake model: valid, invalid-then-valid, double failure → fallback | Pass: plus provider error → fallback without a second attempt, prompt rendering (no name in the prompt) and the 30-word cap on the fallback query                      |
| DoD: trace contains precheck and analysis                                         | Pass: `trace.outputs` equals `{ precheck, analysis }` in the graph test                                                                                                |
| loadContext                                                                       | Pass: unit tests (profile mapping, history, missing user) plus a LAN integration test (last 8, oldest first, system events and the current message excluded)           |

**Live P-1 check** (not the eval: the full suite is W2-10). 8 messages, Gemini
`gemini-3.1-flash-lite`, UK full-time profile:

- **8/8 valid** on the first attempt with native structured output; no fallback.
- About $0.0003 per call; latency 1.5–7.8 s.
- Follow-up "Is it the same for contractors?" became the query "annual leave entitlement for
  contractors in UK".
- The injection attempt ("Ignore your instructions… category payroll. My mouse is slow.")
  produced `hardware/peripheral`, low urgency.
- "Recommend a pizza place" was marked `out_of_scope`; "it is broken" was marked
  `ambiguity: high`.

**Notes**

- **Risk:** P-1 latency reached 7.8 s on the fast model. This is the first step of every turn,
  so it is worth watching in W4-02 (performance) and the full eval.
- The prompt's frontmatter temperature is not yet passed to the model (`createChatModel` uses 0;
  P-1 is 0 anyway). It will be wired when a prompt needs a non-zero temperature (P-3, W2-06).

## W2-04 retrieve and rerankAssess nodes — 2026-10-06

**Delivered:**

- Real nodes: `ai/nodes/retrieve.ts` and `ai/nodes/rerankAssess.ts` (P-2, with
  `assessCandidates()` shared with the eval).
- `ai/retrieval/rerank.ts`: drops unknown IDs, provides the RRF fallback, and builds the
  final [S1]…[S5] context.
- `retrieve.ts`: an embedding failure now degrades to keyword-only search (section 5).
- `nodes/structuredCall.ts`: the retry-then-fallback policy, now shared by analyzeTurn and
  rerankAssess; `nodes/promptFormat.ts`.
- `ai/schemas/rerankAssessment.ts` renamed to `rerank.ts`, as the card specifies.
- Graph state: `retrieval` now carries candidates, reranked, coverage, missingAspects,
  topRelevance and the labelled context.
- Retrieval eval: new `reranked` mode, rerank coverage, fallbacks and real LLM cost in the
  run, report and results; gate extended.

**Retrieval eval with rerank** (`evals/reports/2026-10-06-retrieval-d4ac10e9.md`): 54 cases,
429 s, rerank on `gemini-3.1-flash-lite`.

| Mode         | Recall@5       | MRR       | Leakage |
| ------------ | -------------- | --------- | ------- |
| vector       | 100.0% (54/54) | 0.991     | 0       |
| keyword      | 100.0% (54/54) | 0.937     | 0       |
| fused        | 100.0% (54/54) | 0.972     | 0       |
| **reranked** | 100.0% (54/54) | **0.991** | 0       |

- **Rerank recall (DoD): reranked recall@5 100%, equal to fused (gate met).** MRR improved from
  0.972 to 0.991: the expected document moves to rank 1 more often.
- No fallbacks. LLM cost for 54 rerank calls: $0.0842 (about $0.0016 per call).
- Coverage verdicts: full 45, partial 8, none 1.
  - All 35 answerable cases were judged `full`.
  - 8 of the 10 golden "partial" cases were judged `partial`; HR-PAR-002 and IT-PAR-005 were
    judged `full`, which would produce an ANSWER instead of a PARTIAL. Watch these in the
    decision eval (W2-10).
  - IT-ESC-007 was judged `none`.

**Verification**

| Check                              | Result                                                                                                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reranked recall@5 ≥ fused recall@5 | Pass: 100% = 100%; enforced as a gate target (`rerankedRecallAtLeastFused`)                                                                                                                    |
| Node tests with fakes              | Pass: `test/ai/retrievalNodes.test.ts` (10): query and domain hint, mapping, keyword-only/domain/violation flags, missing profile, ranking applied, labelled context, P-2 rendering, graph run |
| ID-dropping test                   | Pass: an invented chunk ID and a duplicate are dropped and recorded in `droppedIds` (node and pure tests)                                                                                      |
| Fallback test                      | Pass: double invalid output → fused order, coverage `unknown`, `RERANK_FALLBACK`; provider error → fallback without a retry; empty candidates → no LLM call                                    |
| Pure rerank tests                  | Pass: `rerank.test.ts` (7): sorting and ties, RRF scaling, top-5 / min-relevance / grouping by document                                                                                        |
| Keyword-only retrieval             | Pass: `retrieve.test.ts` (only the keyword search reaches Qdrant)                                                                                                                              |

**Notes**

- **Eval caveat:** the eval reranks with the case's raw text, not the P-1 `searchQuery` the
  live graph uses. The full eval (W2-10) runs the real graph.
- **Follow-up:** `HISTORY_LIMIT` (8) in loadContext and `MAX_TICKET_CLARIFY_ROUNDS` (2) in
  edges duplicate `thresholds.yaml` (`conversation.historyMessages`,
  `ticket.maxClarifyRounds`). Read them from config when the API wires the nodes (W2-08).

## W2-05 Decision rules and decide node — 2026-10-06

**Delivered:**

- `domain/decisionRules.ts`: the ordered section 5 rules table, first-match evaluation and
  `rulesFired`.
- `ai/nodes/decide.ts`: `createDecide(thresholds)`, with thresholds from config and a snapshot
  in the trace.
- New persisted state key `topicClarified` (at most one clarification per topic).
- The decide stub moved to `nodes/stubs.ts`.

**Verification**

| Check                                    | Result                                                                                                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Every rule reachable                     | Pass: table-driven test per rule (11 cases; rules 1 and 4 via both conditions), each asserting the decision, reason code and deciding rule                                                                                     |
| First-match semantics                    | Pass: everything true → SENSITIVE_HANDOFF with all 8 matching rules recorded in order; pairwise precedence (out of scope > safety > user request; safety, request action and ambiguity > strong evidence)                      |
| Boundary values                          | Pass: relevance 3 / 2 / 1.99 / 1 / 0.99 / 0 against T_answer 2 and T_partial 1; partial coverage never ANSWER; coverage `unknown` / `none` never rules 7–8; thresholds read from the argument                                  |
| Branch coverage of `domain/`             | Pass: 100% statements, branches, functions and lines (`decisionRules.ts`)                                                                                                                                                      |
| Workflow tests                           | Pass: `test/ai/decide.test.ts` (12): the real decide node routes each decision to the right next node; trace snapshot; the safety path drafts a ticket; clarify once, then answer, then clarify a new topic across three turns |
| DoD: rules documented in ARCHITECTURE.md | Pass: section "Decision rules (W2-05)"                                                                                                                                                                                         |

**Notes**

- **Design choice:** a "topic" is "since the last clarifying question". This is the simplest
  rule that guarantees at most one clarification before the bot answers or escalates; there is
  no topic detection.
- There is no LLM in this task. Decision accuracy is measured by the full eval (W2-10) and
  thresholds are tuned in W4-06.

## W2-06 Grounded answer and citation validation — 2026-10-06

**Delivered:**

- `ai/nodes/answer.ts`: streamed P-3 with labelled sources, mode chosen by code, trailer
  parsing, TTFT/tokens/cost tracing, and retry before the first chunk only (ADR-008).
- `ai/guards/citations.ts`: marker → chunk mapping through the final context only; invented
  markers are rejected and removed.
- `ai/guards/numericCheck.ts`: numbers in the answer must appear in the cited chunks.
- `ai/nodes/validateCitations.ts`: withdrawal path (template text, ESCALATE / CITATION_INVALID
  outside safety mode).
- `domain/templates.ts` (`fillTemplate`).
- `createChatModel(…, { temperature })`, so P-3 uses its frontmatter temperature of 0.2.
- `FakeChatModel` now streams: 12-character chunks, usage on the last chunk, optional mid-stream
  error.
- The stubs for answer and validateCitations moved to `nodes/stubs.ts`.

**Verification**

| Check                                                                      | Result                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| An answer citing a non-retrieved ID is impossible                          | Pass: `citations.test.ts`: markers S0, S3, S9, S12 and a raw `[chunkId: …]` against a two-source context → only c1/c2 valid, every valid chunk is in the retrieved set; an empty context yields nothing valid                                                                                    |
| Zero valid citations → withdrawn                                           | Pass: node test (template text naming the HR team, ESCALATE / CITATION_INVALID, `ANSWER_WITHDRAWN`) plus a graph test (withdrawn, then persist)                                                                                                                                                  |
| Validator unit tests: valid, invented marker, no markers, numeric mismatch | Pass: 10 guard tests (also grouped and repeated markers, list numbering, thousands separators, distinct violations)                                                                                                                                                                              |
| Node test with fake streaming model                                        | Pass: `test/ai/answer.test.ts` (19): stream, trailer, TTFT and cost, partial and safety modes, missing trailer, 503 before the first chunk retried, 403 not retried, mid-stream failure not retried, empty context, 7 validator node cases, 3 graph tests including **tokens in `streamEvents`** |
| DoD: contract item "no citation not retrieved" unit-tested                 | Pass: test "can never produce a citation to a chunk outside the retrieved context"                                                                                                                                                                                                               |

**Live check** (real index, rerank P-2 plus answer P-3 on `gemini-3.8-flash`, validation): 4
questions, 3 ANSWER and 1 PARTIAL.

- **Citation validity 100%** (9/9 proposed markers valid); 0 rejected, 0 numeric violations,
  0 withdrawals.
- Partial mode: "meal allowance and gym membership" → "$65 per day [S1][S3]" plus "The sources
  do not cover whether you can expense a gym membership", and the trailer lists it as
  uncovered.
- Profile-correct answers (Tom, UK contractor: contractor time-off rules; Priya, US full time:
  15/20 days and the 5-day carry-over until 31 March).
- One reply had no trailer → `ANSWER_TRAILER_INVALID`, uncovered `[]` (fallback worked).
- About $0.0025 per answered turn (rerank plus answer).
- The first attempt hit **503 "high demand"** before any token; this led to the
  retry-before-first-chunk rule (ADR-008).

**Risks**

- **TTFT 6.3–15.2 s** on `gemini-3.8-flash` (almost all of the latency comes before the first
  token). With P-1 (up to 7.8 s) and P-2 before it, the first word could take 20 s or more.
  This is the top item for W4-02 (performance): try the fast tier for P-3, a lower thinking
  budget, or OpenRouter.
- Withdrawal on numeric mismatch can withdraw correct answers that paraphrase numbers
  (ADR-008); measure in W2-10.
- In safety mode, a withdrawn safety answer shows the generic "raise a ticket?" template even
  though the draft follows automatically. Refine the copy in W2-07/W3.

## W2-07 Clarify, out-of-scope and sensitive handoff nodes — 2026-10-06

**Delivered:**

- Real nodes:
  - `ai/nodes/clarify.ts` (P-4 ambiguity mode, falling back to the new `clarify_generic`
    template);
  - `ai/nodes/outOfScope.ts`;
  - `ai/nodes/sensitiveHandoff.ts` (templates only; contact plus the "Would you like HR to
    contact you privately?" offer).
- `config/templates.yaml`: `clarify_generic` added (also listed in `TEMPLATE_PLACEHOLDERS`).
- `Output.handoff`: optional `contact` and `offerPrivateContact`.
- `routeAfterAnalysis`: out of scope → decide, skipping retrieval and P-2 (ADR-009). The Mermaid
  topology in ARCHITECTURE.md was regenerated.
- The stubs for these three nodes moved to `nodes/stubs.ts`.

**Verification**

| Check                                                                 | Result                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sensitive and out-of-scope replies make no generation call beyond P-1 | Pass: graph tests with real precheck, P-1, rerank (P-2), decide and templates on one counting fake model. Sensitive keyword → **0** calls; sensitive by analysis → **1** (P-1); out of scope → **1** (P-1), path loadContext → precheck → analyzeTurn → decide → outOfScope → persist |
| Node tests                                                            | Pass: `test/ai/handoffs.test.ts`: clarify (valid; invalid twice → template; provider error → template without a retry; missing reason), out of scope, sensitive                                                                                                                       |
| Template rendering tests                                              | Pass: every template in `templates.yaml` renders with its declared placeholders, leaving none unfilled                                                                                                                                                                                |
| DoD: sensitive path never includes retrieved policy text              | Pass: the node output never contains a planted retrieved paragraph, including a SENSITIVE_HANDOFF decision reached **after** retrieval and rerank; citations are always `[]`                                                                                                          |
| Edge unit tests                                                       | Pass: out of scope → decide; sensitivity and an active ticket flow take precedence                                                                                                                                                                                                    |

**Live P-4 check** (`gemini-3.1-flash-lite`, UK full-time profile):

| Message              | Clarifying question                                                         | Latency |
| -------------------- | --------------------------------------------------------------------------- | ------- |
| "it is broken"       | "…which device or system is currently giving you trouble?"                  | 6.9 s   |
| "I need access"      | "…which specific system or resource you need access to?"                    | 1.3 s   |
| "how much do I get?" | "…asking about your salary, expense reimbursements, or leave entitlements?" | 4.0 s   |

All three were valid on the first attempt with native structured output, about $0.0001 each,
and each asked exactly one question.

**Notes**

- **Deviation (ADR-009):** out-of-scope turns go analyzeTurn → decide, which section 5 does
  not have; it is needed for the card's acceptance criterion. Risk: if P-1 wrongly marks an
  in-scope question out of scope, no evidence can override it (measure in W2-10).
- P-4 receives the raw message and the ambiguity reason, not the history (per P-4 v1's
  inputs). If the eval shows repeated questions, add history in a v2 prompt.
- Nothing is persisted yet (the persist stub); W2-08 stores replies and handoffs.

## W2-08 Persist node and chat API with SSE — 2026-10-06

**Delivered:**

- `packages/shared/src/api/conversations.ts` (request and response schemas) and
  `api/chat-events.ts` (event union, `formatSseEvent`, `parseSseEvents`).
- `modules/conversations`: repository (conversations, messages, turn traces, feedback;
  validated writes), service (ownership, resolution, feedback), routes.
- `modules/chat`: turn runner (lock, user message, stream mapping, error path), `ProseFilter`,
  routes (messages and escalate).
- `modules/documents/routes.ts`: source chunk endpoint with the access re-check.
- `ai/nodes/persist.ts` (assistant message, redacted turn trace, conversation update),
  `ai/guards/redaction.ts`, `ai/graph/runtime.ts` (real nodes wired) and `server.ts` wiring
  (MongoDB checkpointer with indexes).
- `templates.yaml`: `resolution_declined`.
- LLM call traces now carry `provider`; `loadContext` reads the history length from config.

**Acceptance: a curl-driven turn against the real API** (LAN MongoDB, Qdrant, Gemini; Priya,
"How many vacation days do I get as a full-time US employee, and can I carry unused days over?"):

- **Events, in the documented order:** `turn_started` → `status` ×3 (analyzing, searching,
  writing) → `token` ×8 → `citations` (S1, S3, S2: Annual Leave (US)) → `done` (ANSWER /
  EVIDENCE_STRONG). The streamed text is the full cited answer (15 or 20 days by service, 5-day
  carry-over until 31 March); no trailer leaked.
- **Persisted:** user message; assistant message (complete, ANSWER, 3 citations); a
  `turn_traces` document that passes `TurnTraceSchema` and is linked to the assistant message
  (retrieval query, 12 fused, coverage full, 3/3 citations valid, 0 numeric violations, thresholds
  snapshot, 3 LLM calls with prompt versions, $0.0032); conversation updated (turnCount 1,
  lastDecision ANSWER, title); 11 graph checkpoints for the thread.
- The first attempt hit **Gemini 503 "high demand"** on `gemini-3.8-flash` (3 attempts). The
  error path worked as specified: `error` event `LLM_UNAVAILABLE`, retryable, and the reply was
  stored with status `error`.

**Verification**

| Check                                                                 | Result                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Curl-driven turn streams in documented order and persists all records | Pass: see above                                                                                                                                                                                                                                                                                                                                                              |
| Supertest for each endpoint (ownership, 404 vs 403, 409)              | Pass: `test/api/conversations.test.ts` (create, list with pagination and status, detail, resolution true/false/409/404, feedback upsert/409/404, sources allowed/denied/unknown/agent) and `test/api/chat.test.ts` (answer, history, sensitive, out of scope, clarify, withdrawn, LLM failure, escalate then 409 on a pending draft, 409 on a running turn, 400/401/403/404) |
| Redaction unit tests                                                  | Pass: 13 (email, SSN, UK NI, cards, UK/US phones, long IDs, ordinary numbers kept, idempotent)                                                                                                                                                                                                                                                                               |
| Integration test with fake models asserting the persisted trace shape | Pass: the chat API tests run the real runtime graph on fake models; in-memory storage validates every write with the MongoDB schemas, and the test asserts the `turn_traces` fields. LAN MongoDB integration covers repository pagination, turn increment, schema rejection and the feedback upsert                                                                          |
| DoD: section 4 Chat endpoints implemented exactly                     | Pass: all Chat and Conversation rows; 429 rate limits deferred (PRODUCTION_GAPS)                                                                                                                                                                                                                                                                                             |

**Latency of the real turn (headline risk)**

| Step                           | Time                          |
| ------------------------------ | ----------------------------- |
| analyzeTurn (P-1, flash-lite)  | 7.6 s                         |
| retrieve                       | 0.8 s                         |
| rerankAssess (P-2, flash-lite) | 12.5 s                        |
| answer (P-3, 3.8-flash)        | 23.4 s, first token at 21.0 s |
| **Total**                      | **44.3 s**                    |

An employee waits about **41 s for the first word**. Next to the 503s, this is the main risk
for the demo and for W4-02. Options: the fast tier for P-3, a lower thinking budget, OpenRouter,
or running P-2 on fewer candidates.

**Notes**

- **Deviations:** 429 rate limiting is not implemented (PRODUCTION_GAPS). Escalations reach the
  stub draft, after which the conversation returns 409 until the W3 confirm/cancel endpoints
  exist. Conversation status stays `open` (W3 sets escalated / handed_off / restricted).
- The turn lock is in process memory (ADR-010).
- Port 4000 was in use by the `tsx watch` dev server started on 2026-10-05 (the "run the app" request); its child process restarts on every file change. It was left running; the curl acceptance ran on port 4100. (Corrected in W2-09: an earlier note called it a stray process.)

## W2-09 Chat UI — 2026-10-06

**Delivered:**

- `apps/web`:
  - `/chat` and `/chat/[conversationId]` (`components/chat/ChatWorkspace.tsx`);
  - `AssistantMessage`, `HandoffCard`, `TicketDraftCard` (stub), `SourceDrawer`, `ChatParts`;
  - `lib/sse.ts`, `lib/chatTurn.ts` (state machine), `hooks/useChatTurn.ts`;
  - chat endpoints in `lib/api.ts`.
- `next.config.ts`: `proxyTimeout` 300 s (fix, see below) and an optional `distDir` for E2E.
- API: recorded LLM mode (`LLM_MODE=record|replay`, `ai/llm/recording.ts`, env
  `LLM_MODE` / `LLM_RECORDINGS_FILE`) and `npm run start:e2e`.
- `e2e`: isolated ports (4100/3100), `E2E_LLM` modes, `tests/chat.spec.ts`, recordings in
  `e2e/fixtures/llm-recordings.json`.

**Contract flows used** (the Build Contract is still missing; inferred from the playbook and
CP-4, please confirm):

| Flow           | Interpretation                                                                           | Spec                |
| -------------- | ---------------------------------------------------------------------------------------- | ------------------- |
| 1              | Policy question → cited, profile-specific answer; source drawer; resolution and feedback | Priya and Tom tests |
| 2              | Partial answer states what is not covered; "No" → escalation offer                       | flow 2              |
| 3              | Ambiguous question → one clarifying question                                             | flow 3              |
| 6 (offer step) | Sensitive message → HR handoff with the private-contact offer                            | flow 6              |
| 7              | Out-of-scope question → templated reply                                                  | flow 7              |

**Verification**

| Check                                                          | Result                                                                                                                                                                                              |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Priya and Tom get different cited answers to the same question | Pass: Priya cites "Annual Leave (US)" (15/20 days); Tom cites "Time Off for Contractors" (leave comes from the agency)                                                                              |
| Citations open the source drawer                               | Pass: chip → drawer with the document title and the cited passage                                                                                                                                   |
| Resolution and feedback persist                                | Pass: feedback POST returns 200 and the button stays pressed; "Marked as resolved" survives a page reload                                                                                           |
| Playwright flows 1, 2, 3 (live or recorded LLM)                | Pass: recorded from the live provider (`E2E_LLM=record`), replayed by default; **16/16 green twice** (auth, home, chat)                                                                             |
| Component tests for the SSE state machine                      | Pass: `chatTurn.test.ts` (answer, pending citations, withdrawn, handoff, ticket draft, error, reset, marker splitting) and `sse.test.ts` (chunk boundaries, CRLF, schema rejection, error envelope) |
| DoD: CP-4 employee flow checklist                              | Pass: flows 1, 2, 3, 6 (offer step), 7 in the browser; TTFT measured; a trace for every turn; Playwright green                                                                                      |

**Streaming TTFT (CP-4), live run through OpenRouter (`google/gemini-3.8-flash`), traces in MongoDB:**

| Turn                       | Total  | TTFT (answer)  |
| -------------------------- | ------ | -------------- |
| Flow 1 Priya (ANSWER)      | 19.9 s | 4.7 s          |
| Flow 1 Tom (ANSWER)        | 21.6 s | 13.4 s         |
| Flow 2 (PARTIAL)           | 19.1 s | 8.9 s          |
| Monitor question (ANSWER)  | 12.6 s | 5.1 s          |
| Flow 3 (CLARIFY)           | 8.5 s  | n/a            |
| Flow 7 (OUT_OF_SCOPE)      | 1.8 s  | n/a (P-1 only) |
| Flow 6 (SENSITIVE_HANDOFF) | 7 ms   | n/a (no LLM)   |

**Bugs found and fixed:**

1. **The Next.js `/api` proxy cut off streams after 30 s** (its default): every real answer
   turn died in the browser with "Cannot reach the service" even though the API finished and
   stored it. Fixed with `experimental.proxyTimeout: 300_000`.
2. The state machine ignored the `done` event after `withdrawn`, so the decision was lost
   (unit test).
3. "New chat" did nothing after the first message (the router still thought the page was
   `/chat` after `replaceState`); now a full navigation.
4. A connection dropped mid-turn showed "Cannot reach the service"; it now says the reply was
   interrupted (the server still stores it).

**Notes**

- **Gemini quota:** `gemini-3.8-flash` returned **429 quota exceeded** today, after the evals
  and live checks. The recordings were made through **OpenRouter** with a temporary config copy
  (`CONFIG_DIR`, `chat.provider: openrouter`); the repo config is unchanged. Replays do not
  depend on the provider.
- **Latency:** OpenRouter turns took 12.6–21.6 s, against 44 s on Gemini direct in W2-08, so
  OpenRouter as the default provider is a cheap first step for W4-02.
- The ticket draft card is a stub, and the private-contact "Yes" is disabled until W3-03.
- Replay keys are hashes of the prompt messages: changing a prompt, the corpus or retrieval
  results requires re-recording (`E2E_LLM=record`); a missing recording fails the turn loudly.
- E2E data (conversations, messages, traces) is written to the `servicedesk` database.

## W2-10 Full-graph eval suite — 2026-10-06 (code complete; baseline pending)

**Delivered:**

- `evals/runner/fullSuite.ts` (runner), `fullScorers.ts` (decision, sensitive, out of scope,
  citations, key facts, recall, leakage, injection, latency, cost; confusion matrix),
  `fullReport.ts`, `fullCli.ts`, and `--suite full` in the eval CLI.
- The persist node and runtime graph take `isEval`: eval conversations, messages and traces
  are flagged and excluded from dashboards.

**Verification**

| Check                                                     | Result                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scorer unit tests                                         | Pass: `fullScorers.test.ts` (11): correct answer, acceptable decisions, missed doc, forbidden doc, key-fact normalisation, non-answer cases, errors, summary metrics and confusion matrix, CP-3 gating, percentiles and cost, report                                                                                                                      |
| Runner                                                    | Pass: `fullSuite.test.ts` (3) on the real runtime graph with fake models: outcome extraction, isEval records, multi-turn cases, per-case errors                                                                                                                                                                                                           |
| Live smoke (3 cases, OpenRouter)                          | Pass: HR-ANS-001 ANSWER, HR-SEN-001 SENSITIVE_HANDOFF, GEN-OOS-001 OUT_OF_SCOPE; $0.0067                                                                                                                                                                                                                                                                  |
| `npm run eval -- --suite full` completes; baseline stored | **Pending:** the 80-case run started on OpenRouter, but the account ran out of credits (HTTP 402) after about 10 cases, and Gemini's free daily quota was already used (429). The run (`6ac4cee7c85bacbe24b6468a`) is stored but is **not** a baseline; its report was deleted. Owner decision: run the baseline when Gemini's quota resets (2026-10-07). |
| DoD: CP-3 gate                                            | Pending the baseline run                                                                                                                                                                                                                                                                                                                                  |

**Observed in the aborted run (useful, not a baseline):** with no working model the graph
failed safe. P-1 and P-2 fell back, every turn escalated or handed off, nothing crashed, no
answer was invented, citation validity stayed 100% and leakage 0; the six keyword-detected
sensitive cases still handed off. The two indirectly phrased ones need P-1, so they escalated.

**Notes**

- Two timing-sensitive tests (the chat API answer turn and the server startup test) failed
  once while the eval loaded the machine, and passed when rerun alone. This is a flakiness risk
  under load, not a bug.
- **To finish W2-10:** `npm run eval -- --suite full` (Gemini, about 15 minutes), record the
  metrics here and mark CP-3.

## W3-01 Ticketing domain rules — 2026-10-06

**Delivered:** five pure modules in `apps/api/src/domain/`:

- `routing.ts`: category → queue; restricted cases → `hr_case`.
- `priorityFloors.ts`: AI urgency raised to the highest applicable floor; safety rules from
  the precheck, impact rules from the stated scope; the rule that raised it is recorded.
- `ticketStateMachine.ts`: allowed transitions (ADR-012) and `isOpen`.
- `ticketSchemas.ts`: fields per category, `requiredMissing`, and `normaliseFields` (exactly
  the schema keys; absent → "unknown").
- `duplicateCheck.ts`: same requester and category, open, within 7 days → the newest match.

**Verification**

| Check                                                             | Result                                                                                                                                                                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every taxonomy category maps to exactly one queue (startup check) | Pass: already enforced at startup by `config/crossChecks.ts` (W1-02); the new tests route every committed category (queue domain = category domain) and show the startup check rejecting a category without a queue |
| Table-driven unit tests for all five modules                      | Pass: `domain/ticketing.test.ts`: routing 13, priority floors 10, state machine 18, ticket schemas 9, duplicate check 9                                                                                             |
| DoD: 100% branch coverage on `domain/`                            | Pass: 100% statements, branches, functions and lines on all 7 files in `domain/`                                                                                                                                    |

**Notes**

- The transitions are a new decision (ADR-012); the playbook lists statuses only.
- `employee_relations` has an empty field schema by design: no AI extraction for sensitive
  cases (contract flow 6).

## W3-02 slotFill and clarifyForTicket nodes — 2026-10-06

**Delivered:**

- Real nodes:
  - `ai/nodes/slotFill.ts` (P-5);
  - `ai/nodes/clarifyForTicket.ts` (P-4 ticket mode);
  - `ai/nodes/buildDraft.ts` (code).
- `ai/schemas/slotFill.ts` and prompt `ticket_slot_fill/v1.md` (active in `prompts.yaml`).
- `TicketDraftSchema` in `@sd/shared`, now also the payload of the `ticket_draft` SSE event.
- Templates `ticket_draft_ready` and `ticket_fields_question`.
- `ticketFlow` persists `extraction` and `matchedRules` across turns (checkpointer).

**Verification**

| Check                                                       | Result                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Battery case asks for the device model once, then drafts    | Pass: turn 1 = safety steps + one device-model question (citation kept); turn 2 = draft. clarifyForTicket ran once; **priority critical** via `safety_battery` although the AI said medium                                                                                                                                               |
| Multi-turn workflow tests with fakes                        | Pass: `test/ai/ticketFlow.test.ts` (10): complete first time; one round (answer merged, earlier value kept); two rounds then a draft with unknowns; invented keys dropped and the model's missing list ignored; category kept; P-5 fallback (redacted, all unknown); P-4 template fallback; domain default category; config = edge limit |
| DoD: draft schema matches TicketDraft in the shared package | Pass: buildDraft validates with `TicketDraftSchema`; tests parse the draft; the SSE event uses the same schema                                                                                                                                                                                                                           |

**Bug found and fixed:** the safety floor came from the current turn's precheck only, so a
battery case drafted on turn 2 (after the device question) would have lost its critical
priority. Matched rules are now kept for the whole ticket flow.

**Notes**

- No live P-5 check yet: both providers are out of quota (see W2-10). Run one with the W2-10
  baseline.
- The escalate API test now drives the real slotFill and buildDraft (P-1 + P-5 scripted).

## W3-03 Human-in-the-loop confirmation and ticket creation — 2026-10-06

**Delivered:**

- `ai/nodes/createTicket.ts` (real).
- `sensitiveHandoff` now attaches a restricted draft (ADR-013).
- `modules/tickets/{repository,service,routes}.ts`: confirm and cancel; `GET /api/tickets/mine`,
  `GET /api/tickets/:id`.
- Shared contracts in `api/tickets.ts` (confirm request, duplicate details, employee ticket
  views) and the error code `DUPLICATE_CANDIDATE` (409).
- Pure helpers `unknownEditKeys` and `restrictedCasePriority`; templates `ticket_cancelled`,
  `ticket_linked`, `restricted_case_summary` and `restricted_case_description`.
- `runner.exclusive` (confirm/cancel share the conversation lock).
- **Not built here:** the employee reply endpoint (contract stretch goal); P-6 agent summary
  (W3-06).

**Verification**

| Check                                         | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No ticket exists before confirm               | Pass: the escalate request ends paused with a `ticket_draft` event and zero tickets; the ticket appears only after the confirm request (two separate HTTP requests = interrupt and resume across requests)                                                                                                                                                                                                                                                                         |
| Confirm is idempotent                         | Pass: a second confirm returns the same ticket, still one ticket and one `ticket.create` audit entry; the unique conversation index rejects a second insert (LAN integration test)                                                                                                                                                                                                                                                                                                 |
| Requester cannot be overridden by edits       | Pass: edits `requesterId`/`queue`/`priority` → 400 `unknownFields`, nothing created; unknown top-level keys → 400; requester = the authenticated user (snapshot asserted); unit test `unknownEditKeys`                                                                                                                                                                                                                                                                             |
| Supertest for confirm, cancel and duplicate   | Pass: `test/api/tickets.test.ts` (11): confirm with edits (aiFilledFields), idempotency, edit rejection, duplicate 409 then `same` (link) and `new` (`duplicateOf`), other requester not a duplicate, cancel (twice → 404, confirm after cancel → 404), access (404/403/401), sensitive Yes (restricted, `hr_case`, high, no transcript, conversation restricted/handed_off), wellbeing → critical, No thanks, employee ticket views (own only, no internal fields, public events) |
| DoD: contract acceptance item on confirmation | Pass: "no ticket before confirmation", plus requester, queue and priority set by code, verified above                                                                                                                                                                                                                                                                                                                                                                              |
| Domain coverage                               | Pass: `domain/` still 100% (100 tests)                                                                                                                                                                                                                                                                                                                                                                                                                                             |

**Notes**

- After a sensitive handoff the conversation waits for Yes or No (409 on new messages);
  W3-04 adds both buttons to the handoff card.
- No live LLM call is involved in confirm or create.
- Gate: lint and typecheck clean; tests 37 (shared) + 818 (api, with LAN integration) + 27 (web) pass; Prettier clean; Playwright `chat.spec.ts` 7/7 (replay). The flow-6 E2E now expects the composer to be hidden while the private-contact offer is pending.

## W3-04 Ticket draft UI, safety flow, My Tickets — 2026-10-06

**Delivered:**

- `components/chat/TicketDraftCard.tsx` (editable draft, duplicate prompt), `SafetyNotice.tsx`,
  `HandoffCard.tsx` (Yes / No thanks), `ChatWorkspace` wiring (pending draft card, banner).
- `components/tickets/{MyTickets,TicketDetail,ticketLabels}`, pages `/tickets` and
  `/tickets/[id]`.
- `lib/ticketDraft.ts` (pure draft state); `lib/api.ts`: `confirmDraft`, `cancelDraft`,
  `myTickets`, `ticket`, and `ApiError.details`.
- Shared: `ConversationDetailResponse.pendingDraft` is now `TicketDraftSchema` (was a loose
  record); the API returns the typed draft.
- "Talk to a human" already called `/escalate` (W2-09); it now leads to the draft card.

**Fix outside the task's files:** `ai/llm/chatModel.ts`. The JSON fallback of structured calls
appended its instruction as a second system message, which Gemini rejects ("System message
should be the first one"). It now goes as a user message (unit test added). Through OpenRouter
the old order worked, so on Gemini every P-5 call (and any prompt that fell back) failed and
the draft lost its AI-filled fields. W3-02's pending live P-5 check would have found this.

**Fix to the E2E recorder** (`ai/llm/recording.ts`, test-only code): when the native
structured call failed while recording (Gemini answers P-5's schema with HTTP 400, so
`invokeStructured` falls back to a JSON call), nothing was saved for that attempt, so on replay
the missing recording surfaced as a provider error and skipped the fallback. The failure is now
recorded and rethrown on replay with the same status, so replay takes the recorded path (unit
test added).

**Chat fix:** a finished turn's live view used to disappear as soon as `done` arrived, before the
reloaded conversation (with the stored reply and any pending draft) was shown, so the reply
blinked out for a moment. The live view now stays until the stored messages contain the turn's
reply. This also made E2E "turn finished" checks race the draft card.

**Small fixes:** the ticket page has a heading in every state, and a malformed ticket ID (400)
reads as "Ticket not found" (the existing auth spec visits `/tickets/abc`); ticket specs get a
longer budget when `E2E_LLM` is record or live.

**Verification**

| Check                                                                                                                          | Result                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flow 4 in the UI                                                                                                               | Pass: Playwright: issue → "Talk to a human" → draft card with AI-filled markers, read-only queue/priority → edit a field → Confirm → banner and system message with the ID → ticket detail (status new, created event) → My Tickets row, status filter                                                                              |
| Flow 4 safety variant                                                                                                          | Pass: Playwright: swollen battery → ESCALATE with the safety notice and citation chips, then the draft (priority critical) → Cancel → "haven't raised a ticket", composer back                                                                                                                                                      |
| Flow 5 in the UI                                                                                                               | Pass: Playwright: second conversation on the same issue → Confirm → duplicate prompt naming the first ticket → "Add to …" → banner shows the existing ID, `ticket_linked` message                                                                                                                                                   |
| Flow 6 in the UI                                                                                                               | Pass: Playwright: Yes → restricted HR case, "Confidential" on the ticket page with the template summary; No thanks → nothing created, composer back                                                                                                                                                                                 |
| Component tests: draft editing and duplicate prompt                                                                            | Pass: `TicketDraftCard.test.tsx` (10: markers, read-only priority/queue, edits update markers, busy state, duplicate prompt, failure, no-field draft, handoff Yes/No states), `lib/ticketDraft.test.ts` (8: edits only changed keys, never requester/queue/priority, caps, reducer, duplicate details), `TicketDetail.test.tsx` (3) |
| CP-5: no ticket before confirmation; requester/queue/priority set by code; duplicate prompt; interrupt resumes across requests | Pass: the E2E flows above (the draft card waits with the composer hidden; the ticket appears only after Confirm, a separate request); W3-03 API tests unchanged and green                                                                                                                                                           |
| Gate                                                                                                                           | Pass: lint and typecheck clean; tests 37 (shared) + 819 (api, with LAN integration; the server-startup spawn test timed out once under full-suite load and passes on rerun) + 48 (web); Prettier clean; Playwright full suite (auth, chat, home, tickets) 21/21 twice in a row in replay mode                                       |

**Notes and follow-ups**

- E2E recordings for flows 4 and 5 (and the safety variant) were made with Gemini 3.1 Flash Lite
  for both tiers (a temporary config copy), because Gemini 3.8 Flash returned 503 (high demand)
  and then 429 (daily quota), and the OpenRouter key ran out of credits (402). Flow 6 makes no
  LLM call after the handoff. Replays test the UI and graph paths, not answer quality.
  Re-record with the configured models when quota allows.
- In the safety turn, the question for missing ticket details is appended to the safety steps
  in the same message. Readable, but a separate message would be clearer (W3-02 graph output; to
  review with the W2-10 baseline).
- Component tests use `react-dom/server` static rendering plus the pure reducer, because no DOM
  testing library is installed (adding one needs approval).
- E2E tickets accumulate in the shared `servicedesk` database (one per flow 4/5/6 run).

## W3-05 Agent ticket API — 2026-10-07

**Delivered:**

- `modules/agent/{routes,service,repository}.ts`: list, detail, replies, notes, status,
  classification.
- `domain/agentAccess.ts` (pure): `canSeeTicket`, `queueScope`, `priorityRank`,
  `applyClassification`.
- Shared contracts `packages/shared/src/api/agent.ts`.
- `AppDeps.agentTickets` and `ticketConfig.taxonomy`.
- ADR-014: severity-rank sort in the query (resolves the W1-04 note on string priorities), 404
  outside scope, internal corrections, restricted cases keep their category, guarded updates.
- **Not built here:** `POST …/draft-reply` (P-7, W3-06).

**Verification**

| Check                                        | Result                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sam cannot see HR tickets                    | Pass: `test/api/agent.test.ts`: Sam's list holds only IT queues; `?queue=hr_general` → 403; GET, reply, note, status and classification on the HR ticket and the restricted case → 404, and no event written                                                                                                                                                                                  |
| Hana sees restricted tickets                 | Pass: Hana's list includes HR-0002 (restricted) first; GET → 200 and one `ticket.view` audit entry (non-restricted views are not audited); Hana gets 404 on IT tickets; admins see every queue                                                                                                                                                                                                |
| Invalid transitions 409                      | Pass: new→closed, new→new, in_progress→new, closed→in_progress → 409 `CONFLICT` with `{from, to}`, ticket unchanged, no event; valid path new→in_progress→resolved→in_progress writes 3 public `status_change` events with old/new, 3 audit entries, `resolvedAt` set then cleared                                                                                                            |
| Role matrix                                  | Pass: all 6 endpoints → 401 without a session, 403 for an employee, allowed for agent and admin; the route policy table lists the 6 routes as `['agent','admin']`                                                                                                                                                                                                                             |
| Correction events with old/new               | Pass: hardware→payroll plus priority low→high gives 3 internal events (category, subcategory, priority) with old/new, the category event says "Re-routed to HR General", the ticket moves to `hr_general`/HR, Sam then gets 404 and Hana 200; taxonomy violations → 400; restricted category change → 400 `restricted_category` while its priority can change; a no-op request writes nothing |
| DoD: override-rate query correct on fixtures | Pass: memory (2 of 6 = 0.333, two corrections on one ticket count once, status changes and eval tickets not counted, date range) and real MongoDB (`test/integration/agent.test.ts`: 2 of 5 = 0.4, from-range 1 of 2 = 0.5, empty range 0)                                                                                                                                                    |
| Queue order                                  | Pass: critical, high (older), high (newer), low; cursor pages of 2 give the same order; on MongoDB "medium" sorts below "high" (severity, not alphabetical)                                                                                                                                                                                                                                   |
| Domain coverage                              | Pass: `domain/` 100% (121 tests)                                                                                                                                                                                                                                                                                                                                                              |
| Gate                                         | Pass: lint and typecheck clean; tests 37 (shared) + 862 (api, with LAN integration) + 48 (web); Prettier clean. No UI or LLM change, so no Playwright or eval run (the agent UI is W3-07)                                                                                                                                                                                                     |

**Notes**

- Replies on resolved tickets are allowed (only closed is 409), per the playbook table.
- The transcript of a restricted case is shown to hr_case agents and admins (the confidential
  team); every such view is audited.

## UC-01 Mock HR data and new policies — 2026-10-07

**Delivered:**

- Collections (schemas, accessors, indexes): `projects`, `tasks`, `timesheet_entries`,
  `attendance`, `payslips`, `notifications`. Shared contracts in `@sd/shared` `api/workspace.ts`.
- `config/workday.yaml`: timesheet rules (8 h day, 12 h max, 0.5 h steps, 60 days back) and the
  US/UK holiday calendar copied from the corpus holiday policies.
- `domain/workday.ts` (pure): calendar, day status, cell validation, pay periods (US semi-monthly,
  UK monthly), late entries.
- `modules/workspace/seed.ts`: deterministic mock data from the seeded users and an anchor date;
  `npm run seed [-- --today YYYY-MM-DD]` now also restores it (idempotent).
- **LOP demo scenario:** Priya has no timesheet and is marked absent on the last working day on
  or before the 12th of the previous month (12 Sep 2026 is a Saturday, so **Fri 11 Sep**); her
  16–30 Sep payslip carries **Loss of Pay $400.00** (salary $104,000 / 260). Her most recent
  past working day this week is also left empty.
- Policies: `hr-loss-of-pay`, `hr-timesheet-policy`, `hr-attendance-policy` (38 documents).
- `APP_NAME` is now "Employee Hub".

**Verification**

| Check                                | Result                                                                                                                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain and seed unit tests           | Pass: `workday.test.ts` (calendar, day status, validation, pay periods), `seed.test.ts` (deterministic, LOP day/amount, balanced payslips, no weekend/holiday/future hours, valid documents) |
| Config schemas                       | Pass: `workday` added to the per-file schema tests                                                                                                                                           |
| `npm run db:indexes` on the LAN DB   | Pass: 6 collections and 10 indexes created                                                                                                                                                   |
| `npm run seed -- --today 2026-10-07` | Pass, twice with identical output: 6 projects, 18 tasks, 269 entries, 130 attendance, 10 payslips, 13 notifications, 3 requests                                                              |
| `npm run corpus:validate` / `ingest` | Pass: 38 documents valid; 3 indexed (181 chunks), 35 unchanged                                                                                                                               |

**Notes**

- The seed replaces the employees' timesheets, attendance, payslips and notifications, so it also
  resets the demo. Demo requests use fixed IDs `IT-9001`, `HR-9001`, `HR-9002`.
- LOP is written for full-time employees in every country (personas are US/UK, not India).

## UC-02 Employee data APIs — 2026-10-07

**Delivered:** `modules/workspace` (repository, mappers, service, routes), employee-only and
scoped to the signed-in user:

| Endpoint                                                 | Purpose                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/dashboard`                                     | Profile, open tasks, this week's day statuses, missing days, requests with employee-facing stage, latest payslip, notifications |
| `GET /api/projects/mine`                                 | Projects the employee may log time against                                                                                      |
| `GET /api/tasks/mine`                                    | Assigned tasks (`?view=open`, `?status=`), plus the server's "today"                                                            |
| `GET /api/timesheets/week`                               | Week view (`?date=`): day statuses, entries, projects, totals, form bounds                                                      |
| `POST /api/timesheets/entries`                           | Save cells (`hours: 0` removes); every rule checked in code; audited `timesheet.save` (triggered by form, approved by employee) |
| `GET /api/attendance`                                    | Attendance for a range of at most 92 days                                                                                       |
| `GET /api/payslips/mine`, `/:id`                         | Payslips (contractors: paid by agency); another employee's → 404                                                                |
| `GET /api/notifications`, `POST /api/notifications/read` | List; mark some or all read                                                                                                     |

`DEMO_TODAY` (optional env) pins "today" for timesheets and the dashboard; `AppDeps.clock` makes
it testable. The service is the single path for timesheet writes, so the copilot action (UC-05)
reuses the same validation.

**Verification**

| Check              | Result                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supertest          | Pass: `test/api/workspace.test.ts` (30): 401 and agent/admin 403 on every route; dashboard numbers for Priya and Tom; week view (Labor Day holiday, LOP day missing, 32 h required); late LOP entry saved and audited; update/remove; future date, foreign project and 12.5 h day rejected with per-cell issues; payslip 404 across employees; attendance bounds; notifications read/scoping |
| Route policy table | Pass: the 10 routes are in `http/routes.test.ts`                                                                                                                                                                                                                                                                                                                                             |
| Live API (LAN DB)  | Pass: `GET /api/health` up; dashboard and week served for the seeded data                                                                                                                                                                                                                                                                                                                    |

## UC-03 Employee dashboard and workspace UI — 2026-10-07

**Delivered (Tailwind only, enterprise style; see ARCHITECTURE "Employee UI"):**

- New shell: sidebar navigation, sticky top bar with the copilot launcher (Ctrl/⌘ K palette with
  suggestions) and a notification bell; mobile drawer. Employees now land on `/dashboard`.
- `/dashboard`: greeting with an inline copilot box and suggestions, key numbers (hours this week,
  days without hours, open tasks, active requests), week strip, tasks, pay card with the LOP
  alert ("Ask why" opens the copilot), requests with stage progress, notifications.
- `/timesheets`: project × day grid with day statuses, holiday/leave labels, "Fill to 8h", late
  and copilot markers, per-cell server errors and a sticky save bar; locked while a week loads.
- `/payroll` (statement with LOP itemised and linked to the copilot and the timesheet; contractors
  see "paid by your agency"), `/tasks` (board / list, project filter), `/tickets` restyled as the
  request tracker (list / board by employee-facing stage), `/chat?q=` sends the question.
- Restyled login, chat, primitives; WCAG AA text contrast; `APP_NAME` "Employee Hub".

**Verification**

| Check                          | Result                                                                                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lint / typecheck / unit        | Pass: web 48 tests; shared 44; api 893 (28 integration skipped)                                                                                                                        |
| Production build               | Pass: `next build` with all routes                                                                                                                                                     |
| Visual review                  | Screenshots of every page at 1440 px and the dashboard at 390 px; fixed mobile overflow, a cramped alert, an ambiguous legend colour and a missing full stop                           |
| Playwright `workspace.spec.ts` | Pass (6): dashboard (week, LOP, request, notifications), payslip LOP line, contractor payroll, timesheet over-12 h rejection then save and restore, tracker list/board, Ctrl+K palette |
| Existing specs                 | Updated for the new home and navigation                                                                                                                                                |
| Full Playwright run (replay)   | **25 / 27 pass.** The 2 failures are contractor chat recordings (see notes)                                                                                                            |

**Notes**

- The three new policies changed retrieval for "How many days of annual leave do I get?", so the
  recorded LLM replies for chat flow 1 were re-recorded (`E2E_LLM=record`).
- **Open follow-up:** `hr-timesheet-policy` is the only new document contractors can read, so
  it changes their retrieval candidates and the recorded prompts for Tom (chat flow 1) and Marcus
  (tickets flow 5) no longer match. Re-recording failed on 2026-10-07: the Gemini quality model
  hit its free-tier daily quota (20 requests/day, 429) and the OpenRouter key is out of credit
  (402). Re-run `E2E_LLM=record npx playwright test -g "flow 5|Tom"` once quota resets.
- The Next dev server hit Windows `EPERM` rename errors in `.next`; production builds are
  unaffected. If it recurs locally, delete `apps/web/.next` and restart `npm run dev:web`.

## UC-04 Copilot intents and agent subgraphs — 2026-10-07

**Delivered (ADR-016):**

- The orchestrator hands each turn, by code, to one **agent subgraph**: `knowledgeAgent`
  (policy RAG), `escalationAgent` (ticket drafts), `timesheetAgent`, `requestsAgent`. Sensitive
  turns never reach an agent. Topology and agent table in ARCHITECTURE.md (Mermaid with agents
  expanded).
- **P-1 v2** (`turn_analysis/v2.md`): new `workspaceIntent` field (timesheet_log,
  timesheet_status, payroll_explain, request_status, none); optional in the schema, so v1 output
  still routes to the knowledge agent.
- **Records agents (no LLM):** "Which days am I missing?" and "Show my pending requests" are
  answered from the employee's own data (`domain/workspaceReplies.ts`,
  `modules/workspace/records.ts`), recorded as ANSWER / `RECORDS_*`. "Log 8 hours…" reaches the
  timesheet agent, which points to the Timesheets page and writes nothing until UC-05.
  Payroll questions use the knowledge agent until UC-06.
- Trace reducer merges an agent's returned trace instead of appending it (no duplicate steps).

**Verification**

| Check                                     | Result                                                                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edge unit tests                           | Pass: intent router (each workspace intent, v1 analysis, sensitive and ticket-flow precedence), knowledge exits, timesheet entry, snapshot merge                          |
| Graph workflow tests (stubs and fakes)    | Pass: all earlier paths unchanged; timesheet status / log, requests, payroll fallback, sensitive bypass; records read only for the requesting user; each node traced once |
| P-1 v2 with fake models                   | Pass: renders, `workspaceIntent` validated, unknown value → retry → fallback                                                                                              |
| **Live P-1 v2** (`gemini-3.1-flash-lite`) | 12/12 routed as expected (≈1.5 s, $0.0004 per call); 5/5 sensitive cases still handed off                                                                                 |
| AI + domain suites                        | 529 tests pass                                                                                                                                                            |

**Found and fixed:** the first live run sent "Why was my salary reduced?" and "What is this LOP
deduction?" to the **sensitive handoff** (the prompt asks for generous sensitivity). v2 now says
the employee's own pay, LOP, timesheets and requests are routine unless they involve a sensitive
topic. (v1, still active, has the same behaviour today.)

**Not yet done: switching `config/prompts.yaml` to `turn_analysis: 2`.** CLAUDE.md requires a full
eval run first, and the Gemini quality model (needed by the full suite and by E2E re-recording)
is out of free-tier quota until 2026-10-08; OpenRouter is out of credit. Once quota is back:
switch to v2, run `npm run eval -- --suite full`, re-record the chat E2E replies
(`E2E_LLM=record`), and note the results here.

## UC-05 Timesheet action by chat — 2026-10-07

**Delivered:**

- **P-10 `timesheet_extract` v1** (fast tier; `PROMPT_NAMES` extended under ADR-015): date phrases
  verbatim (references such as "that day" rewritten from history), a project code from the
  employee's own projects (enum injected per call), hours.
- **Code decides:** `domain/dateText.ts` resolves the date phrase (today, yesterday, weekdays,
  "last Friday", "11 September", ISO; ambiguous forms such as "11/09" are refused, not guessed);
  `WorkspaceService.previewCells` applies the same rules as the timesheet form and reports the
  hours each cell replaces and the day total after.
- **Confirm before write:** the proposal pauses the graph in `awaitConfirmation` (SSE
  `action_draft`, `pendingAction`); `POST /api/conversations/:id/action/confirm|cancel`;
  `applyAction` saves with `source: copilot`; audit `timesheet.save` triggered by copilot,
  approved by employee. New messages are blocked (409) while a proposal is open.
- **UI:** `ActionCard` in the chat (entries, project colour, replaced hours, day total, late-entry
  note, Confirm and save / Cancel); the timesheet grid already marks copilot entries.

**Verification**

| Check                                                    | Result                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dateText.test.ts`                                       | Pass: 22 cases (relative days, weekdays, "last", day/month orders, ISO, refusals, invalid dates)                                                                                                                                                                                                                                                                                           |
| API `copilotAction.test.ts` (fake model)                 | Pass (10): proposal saves nothing and blocks new messages; confirm saves via the rules, audits copilot + employee, idempotent; cancel saves nothing; another employee 404; stale proposal fails safely; missing project lists only own projects; future day refused; unreadable date quoted back; foreign project code → invalid output → fallback; multi-day proposal with replaced hours |
| Web `ActionCard.test.tsx`                                | Pass (4)                                                                                                                                                                                                                                                                                                                                                                                   |
| Route policy table                                       | Pass: confirm/cancel are employee-only                                                                                                                                                                                                                                                                                                                                                     |
| **Live P-10** (`gemini-3.1-flash-lite`, LAN data, Priya) | 5/5 correct: "September 11" → Fri 11 Sep (late), "yesterday", "half a day … Monday" → 4 h replacing 1 h, "that day" (from history) → 11 Sep, "7.5 h last Friday" refused by code (day over 12 h). About $0.0002 per call; **latency 8–16 s** today (provider), to watch in performance work                                                                                                |

**Notes**

- The timesheet agent is reached only with P-1 v2 active (UC-04 follow-up: switch after the full
  eval when quota allows). Until then the flow is exercised by the tests above.
- E2E for this flow needs recorded LLM replies, so it is added together with the P-1 v2 switch.

## UC-06 Payroll investigation agent — 2026-10-08

**Delivered:**

- `payrollAgent` subgraph (P-1 v2 `payroll_explain`): `payrollRecords` (code) → `retrieve` →
  `rerankAssess` → `payrollExplain` (**P-11** `payroll_explain` v1, fast tier) → `validateCitations`
  → `payrollCompose` (code). Contractors get the agency reply after the records step.
- The reply has three parts: **Your records** (code: latest payslip, each Loss of Pay day with
  amount, pay date, attendance and the hours on the timesheet now), **What the policy says** (the
  model's explanation, citations and numbers checked by code), **Next steps** (code: log the
  missing hours, then ask for a payroll request — the request itself is UC-07).
- Figures never come from, or go to, the model: P-11 receives a figure-free summary of the
  situation (`payrollFactsForModel`); pay, amounts and dates stay in the code-written records.

**Adversarial review (Ultracode workflow, 4 dimensions × 3 skeptics, 49 agents):** 15 findings,
11 confirmed and fixed before commit:

- **High:** the prompt allowed record figures but the number check withdraws numbers not in the
  cited policy, so correct explanations were dropped (also seen live: "Fri **11** Sept" →
  `NUMERIC_MISMATCH`). Fixed by the figure-free summary and prompt wording.
- Multi-day LOP split now in cents (days add up to the payslip); "logged after the pay period
  closed" based on the entries' `late` flag; next steps suggest the hours still missing.
- The widened search query is a per-turn `retrievalQuery`, so the stored analysis is unchanged.
- An empty explanation skips the citation check (no false `ANSWER_WITHDRAWN`); a withdrawn one is
  flagged `PAYROLL_EXPLANATION_WITHDRAWN`.
- Gross, net and other deductions no longer sent to the provider (privacy).
- Tests added for each (registry lists P-11; record-figure withdrawal; empty retrieval; invalid
  output; no markers; cent split; analysis query unchanged; prompt contains no figures).

**Verification**

| Check                                    | Result                                                                                                                                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API `payrollAgent.test.ts` (fake model)  | Pass (13): three-part reply with exact figures and validated citations; invented figure withdrawn; late-logged day; contractor path (P-1 only); no-LOP employee; plus the 8 review-fix tests above |
| Graph and edge tests                     | Pass: payroll path node sequence, contractor path, routing, Mermaid in ARCHITECTURE.md                                                                                                             |
| **Live (Gemini fast, LAN data, P-1 v2)** | Priya: `PAYROLL_EXPLAINED`, 4 valid citations, 0 number violations (≈7 s, $0.0025 per turn). Olivia (UK, no LOP): deductions listed, cited explanation. Tom: agency reply, 1 LLM call              |

**Verification round (second workflow, 34 agents):** 2 checkers per original finding plus 2
regression hunters (3 skeptics each). Confirmed and fixed:

- Pay figures still reached the provider **on later turns**: the stored reply is replayed as
  history to P-1 / P-10. `formatHistory` / `formatConversation` now replace the "Your records"
  block (`withoutPayrollRecords`); the next steps, with the day for "that day", are kept.
- A withdrawn explanation was invisible in stored traces: the trace now keeps the citation
  check's verdict (`withdrawn: true`) and the reason code `PAYROLL_EXPLANATION_WITHDRAWN`
  (distinct from `PAYROLL_RECORDS_ONLY`: no policy found or model failure).
- Next-steps hours rounded ("Log 0.7 hours", not 0.7000000000000002); `lateHours` replaces a
  boolean so a partly-late day says "4 h of it logged after the pay period closed".
- Stronger tests: the model summary has no digit at all; direct tests for
  `routeAfterPayrollExplain`, `payrollCompose` reasons and flag, the helpers, and the next-turn
  history.

**Residual risk:** citation validation requires at least one valid citation, not one per
sentence; a live answer contained one uncited general sentence ("income tax and national
insurance are standard statutory deductions"). P-3 shares this; the groundedness judge (W4-06,
deferred) is the planned check.

## UC-07 Escalation with email draft — 2026-10-08

Owner decisions (ADR-017): a dedicated **Payroll** queue (`hr_payroll`, payroll@example.com;
Hana Kim gets it), a **fully editable** email body, and the new `modules/email` folder and
`email_outbox` collection.

**Delivered:**

- **Draft (code):** `buildDraft` attaches an email when the queue has an address and the case is
  not restricted. `domain/escalationEmail.ts` assembles it: Issue (P-5's text), System information
  (employee, category, priority, fields, payroll lines from records), Action taken, Request,
  sign-off. A number in model text that the employee never typed sends Issue and Subject back to
  their own words. For payroll, `pay_period` is filled from payslips ("From your records").
- **Send (code, after confirm only):** `createTicket → sendEmail → agentSummary`. One outbox row
  per conversation, recipient recomputed from the ticket's queue, exactly the confirmed text
  stored, one `email_sent` ticket event and one chat note; a crash resumes at `sendEmail`.
  `EMAIL_DELIVERY=mock` (default) records without sending; `smtp` stops startup (no approved
  mail dependency).
- **API:** confirm accepts optional strict `email {subject, body}` and returns the email status;
  audit `email.send` (IDs and flags only); emails on the employee and agent ticket detail.
- **UI:** email section in the draft card (read-only To/From, editable subject and body,
  counters, "Send request and email", "Cancel (nothing is sent)", reset to drafted text); an
  Emails section on the ticket page.
- **Docs:** ARCHITECTURE.md (escalation email section, Mermaid with `sendEmail`), ADR-017.

**No eval run needed:** no prompt was added or changed (P-12 email prose prompt deferred).

**Found by the new tests and fixed:**

- No email was ever drafted: `routeTicket` returns the queue without its address. `buildDraft`
  now reads the address from routing config by queue id.
- `deliver` could call the transport twice with a stale copy of an already-delivered row (a
  double send once SMTP exists). It now re-reads the row's status first.

**Verification**

| Check                                           | Result                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint` / `npm run typecheck`            | Pass (all workspaces, tests included)                                                                                                                                                                                                                                                                                                                                                                                                           |
| `npm test`                                      | Pass: shared 67, API 1043 (28 skipped: live-database suites), web 68. Three `tickets.test.ts` expectations updated for the new behaviour (an `email_sent` event and an email note now follow a confirmed `hr_general` ticket)                                                                                                                                                                                                                   |
| API `escalationEmail.test.ts` (17, fake models) | Draft from records (Payroll, pay period, exact LOP line); **no model call sees the LOP amount or date**; edited text stored exactly; drafted text when omitted; repeat confirm and crash-resume give one ticket, one email, one event, one audit; cancel writes nothing; 400 for newline / empty subject, 5001-char body, extra key, email on a draft without one; restricted case has no email; requester and Payroll agent see it, others 404 |
| `modules/email/service.test.ts` (8)             | Once-only record, mock delivery, single transport call, failure path, ordering, smtp blocked                                                                                                                                                                                                                                                                                                                                                    |
| Web (draft card, reducer, ticket detail)        | Email section, markers, Send disabled on empty subject, confirm body, reset, email card states                                                                                                                                                                                                                                                                                                                                                  |

**Deviations from the plan:**

- The agent ticket page is still a placeholder (W3-07, deferred), so emails reach agents through
  `GET /api/agent/tickets/:id` only; `EmailCard` has an agent variant ready for it.
- The E2E spec `escalation-email.spec.ts` is not written yet: it needs one small `E2E_LLM=record`
  pass (Gemini quota). `tickets.spec.ts` flow 4 now finds the link note by text, because the
  email note can follow it.

**Follow-ups:** re-seed (`npm run seed`) so Hana has `hr_payroll`, and run `npm run db:indexes`
for `email_outbox`; record the E2E spec; P-12 email prose prompt when quota allows; existing
payroll tickets in a live database stay in `hr_general`.

## UC-08 Request tracker notifications — 2026-10-08

**Already in place before this step:** the tracker page (list and board by employee-facing stage,
UC-03), active requests on the dashboard, the notification bell, and "show my requests"
(`requestsAgent`, UC-04; reachable once P-1 v2 is active).

**Delivered:**

- When an agent changes a request's status or replies, the requester gets an in-app notification
  (`kind: request`, link to the request): "HR-0001 needs your reply", "HR-0001 is under review",
  "HR-0001 resolved", "The team replied on HR-0001" with a one-line excerpt. Wording is pure code
  (`domain/requestNotifications.ts`); internal notes never notify; a refused transition (409)
  writes nothing.
- The bell refreshes on window focus and every 60 s while the tab is visible (in-app polling only;
  no push, per CLAUDE.md).
- No new collection, endpoint or LLM call: the existing `notifications` collection and
  `GET /api/notifications`.

**Verification:** `requestNotifications.test.ts` (wording per status, reply excerpt);
`agent.test.ts` (reply and status change notify the requester, a note does not, a 409 notifies
nobody, the requester's bell shows them). Lint and typecheck clean (on a clean
worktree of HEAD + UC-08); full Jest green, with four first-test timeouts under parallel load
that pass in-band (`--runInBand`, 28/28).

**Owner decision (2026-10-08):** W3-06 (agent summary and draft reply) and W3-07 (agent workspace UI)
are brought back from the deferred list so flow 7 can be shown end to end; P-6 runs on the fast
tier (Gemini quality quota). To be recorded in ADR-019 with W3-06 (ADR-018 went to the
provider fallback chain).

## UC-10 LOP end-to-end scenario, README, demo script — 2026-10-09

**Owner decisions (2026-10-09):** UC-09 (golden cases and eval for the new intents) is paused;
its partial work is kept in a git stash ("UC-09 partial…"). **P-1 v2 (`turn_analysis/v2.md`) is
switched on without the full eval run** that `prompts.yaml` normally requires, so the copilot
reaches the timesheet, payroll and requests agents; the UC-09 eval is the follow-up that
confirms it (the UC-04 live check routed 12/12 cases as expected and kept 5/5 sensitive
handoffs).

**Delivered:**

- `config/prompts.yaml`: `turn_analysis: 2`.
- `e2e/tests/lop.spec.ts`: the Loss of Pay scenario in 12 steps (flows 1, 5, 8, 3, 6, 7):
  dashboard and notification; "Why was my salary reduced?" (records and cited policy in separate
  parts, next steps); "that day" resolved to Fri 11 Sept and logged after confirmation (late
  entry); "contact payroll" draft with an email from the records; send; tracker and ticket email;
  the payroll agent (Hana) moves it to in progress through the agent API (the agent UI is W3-07);
  Priya's tracker and bell follow.
- E2E data setup: `e2e/global-setup.ts` reseeds the demo data for a fixed `E2E_TODAY`
  (`e2e/today.ts`, default 2026-10-08) before every run, and the E2E API runs with
  `DEMO_TODAY` set to the same date, so dates in prompts (and therefore recorded replies) are
  stable and the scenario can be rerun. `E2E_SKIP_SEED=1` skips the reseed.
- `README.md` rewritten for Use Case 1 (features, personas, `DEMO_TODAY`, E2E data notes);
  `docs/DEMO.md`: the demo script (preparation, 12 steps with what to show, optional extras for
  flow 9, recovery tips).

**Verification:** lint and typecheck clean; Jest: shared 67, web 68, api green after updating
four tests that pinned `turn_analysis` v1 (prompt registry, config, chat API path, and the
server-startup test that breaks `prompts.yaml` by editing that line).

**Not yet done:** the E2E recorded replies must be re-recorded (`E2E_LLM=record`), because P-1 v2
changes the first LLM call of every chat turn; this is done once after the Ollama fallback step,
which changes the recording code. Until then the chat specs and `lop.spec.ts` fail in replay.

## LLM provider fallback, Ollama and the reply cache (ADR-018) — 2026-10-09

**Why:** development and demos kept stopping on provider limits (Gemini free-tier daily quota,
OpenRouter out of credit). Owner-approved; built by a parallel session and finished here.

**Delivered:**

- Fallback chain for the API server: Gemini quality → Gemini fast → OpenRouter quality →
  OpenRouter fast → Ollama (`chat.fallbacks: [openrouter, ollama]` in `config/models.yaml`;
  providers without a key or URL are skipped). A 429 (quota or rate limit), 402, 401/403, 5xx or
  unreachable provider sets the model (or, for credit and key problems, the whole provider) aside
  for a cooldown; request errors (400, invalid output, timeout) never change model. Traces and
  costs record the model that actually answered (`answeredBy`).
- Ollama as a third chat provider through its OpenAI-compatible API (`OLLAMA_BASE_URL`, model
  `qwen2.5:3b`, cost 0): no new dependency. (Changed 2026-10-12 to `dolphin3:latest` on the LAN
  host with a 120 s budget; see the follow-up entry below.)
- `LLM_MODE=cache` for development: reuses saved replies for identical prompts from
  `.llm-cache/replies.json` (git-ignored, separate from the E2E fixtures); failures are not saved.
- Evals, `llm:smoke` and E2E recording keep using the configured model only.
- README (setup for the local model, env table), ARCHITECTURE (provider layer), ADR-018.

**Verification:** `providerHealth.test.ts` (cooldown per error kind, provider-wide cooldowns for
credit and key errors, ordering, recovery), `fallback.test.ts` (falls back on quota and reports
the model that answered, skips cooling models, shared cooldowns, a 400 stays on the model,
streams fall back only before the first chunk, lazy model building), `chatModel.test.ts`
(`fallbackChain` order and missing keys, the Ollama client), `recording.test.ts` (cache hits,
misses, outages not saved, embeddings), `schemas.test.ts` (fallbacks validation). Lint and typecheck clean; Jest: shared 67, web 68,
api 1090 passed with one server-startup child process killed by its timeout under parallel
load (`status: null`), which passes in-band (3/3).

**Not covered:** a live call to a real Ollama server (not installed on this PC); embeddings stay
on Gemini (a different model would need a re-index).

### Follow-up 2026-10-12: Ollama on the LAN host, per-model time budgets

- Ollama runs on the LAN host (`OLLAMA_BASE_URL=http://192.168.29.3:11434`, in `.env`). Its
  installed models are `dolphin3:latest` (Llama 3.1 8B, 131K context) and `dolphin-phi` (2K
  context, too small for our prompts); `models.yaml` now uses `dolphin3:latest` for both tiers
  (owner decision; replaces the uninstalled `qwen2.5:3b` / `dolphin-mixtral:8x7b`).
- Measured directly: valid JSON output, about 14 s warm for a short prompt, about 2 min on first
  load. So each model in the chain now has its own per-attempt budget: `call.timeoutMs` (30 s)
  for the hosted models and `call.providerTimeoutMs.ollama: 120000`; the chain's handle carries
  the largest (`ChatHandle.timeoutMs`, applied by `policyFor`). A model that misses its own
  deadline fails as a timeout (retried by the call policy), as before.
- Tests: `fallback.test.ts` (handle budget is the largest; a slow last resort answers inside its
  own budget beyond the hosted models' budget; a model past its own deadline fails as a timeout
  without moving on), `schemas.test.ts` (`providerTimeoutMs` validation). Lint and typecheck
  clean; `src/ai/llm`, `src/config`, answer node: 189 tests green.
- `llm:smoke` (2026-10-12): Gemini fast/quality and embeddings pass; OpenRouter fast passes,
  OpenRouter quality returns 402 (credit left for only 928 output tokens); **Ollama timed out**:
  at that moment the LAN host answered no request (a direct warm-up got no bytes in 200 s, and
  Qdrant on the same host was unreachable), after answering in 14 s earlier. To recheck once the
  host is healthy: `npm run llm:smoke`.
- E2E re-recording is still open: the first run had 23/28 pass (failures from provider errors,
  since recording uses the configured model without fallback); the second stopped when Qdrant
  on the LAN host became unreachable.

## Fix: API crash on a broken Gemini stream — 2026-10-12

**Found by:** both E2E recording runs; the E2E API process exited mid-run and every later test
failed at sign-in. Its log: an unhandled `GoogleGenerativeAIError: Error reading from the
stream`. The Google SDK keeps an internal promise for a streamed response; when the stream
breaks, that promise rejects with no listener, while the turn has already received the failure
through the stream iterator (error event, retryable). Node treats an unhandled rejection as
fatal, so one broken stream stopped the API for every user (NFR-3).

**Fix:** `ai/llm/orphanedStream.ts` `guardUnhandledRejections(logger)`, installed in
`server.ts`: that one SDK error is logged as a warning and the server carries on; any other
unhandled rejection is logged as fatal and still exits 1 (Node's behaviour). Tests:
`orphanedStream.test.ts` (match only that error; warn and keep running; other errors exit).

## UI: full-width layout, profile menu, collapsible sidebar — 2026-10-12

Owner requests:

- **Full width everywhere:** the app shell, top bar, login and loading pages no longer cap the
  width (`max-w-*` removed; side padding kept).
- **Profile at top right:** `ProfileMenu` (avatar and name next to the notification bell, every
  role) opens the profile details (name, job title, email, role, country, employment type) and
  Sign out. The profile card left the sidebar and the mobile drawer.
- **Collapsible sidebar:** a Collapse/Expand button shrinks the desktop sidebar to an icon rail
  (labels stay as screen-reader text and tooltips); the choice is kept in `localStorage`
  (`sidebar-collapsed`, per browser).

Tests: `components/shell/shell.test.tsx` (closed profile menu, expanded sidebar by default,
compact and expanded nav links); `e2e/tests/auth.spec.ts` opens the profile menu for the badge
and Sign out checks, and a new test collapses the sidebar, navigates, reloads (choice kept) and
expands it. Lint, typecheck and web Jest green.

## Fix: "Contact payroll about my LOP" went to request status — 2026-10-12

**Found by:** the LOP E2E (step 8). P-1 v2 read the contract's flow 6 example as
`intent: request_action` with `workspaceIntent: request_status` ("payroll request" taken as "my
requests"), and the router checked the workspace intent first, so the employee got a list of
open requests instead of an escalation draft.

**Fix (code, not prompt):** `routeAfterAnalysis` sends `request_status` and `payroll_explain`
turns to the knowledge agent when P-1 also says the employee wants something done
(`request_action`) or wants a person (`talk_to_human`); its decision rules then escalate
(`action_required` / `user_requested`). Read-only records agents keep questions and follow-ups;
`timesheet_log` with `request_action` is unchanged (the copilot performs that action itself).
Tests: `edges.test.ts` (the failing analysis, the other combinations, unchanged routes). Graph and
AI workflow suites: 173 green.

## W3-06 Agent summary and draft reply — 2026-10-12

Brought back from the deferred list by the owner (2026-10-08); recorded in **ADR-019**.

**Delivered:**

- **P-6 `agent_ticket_summary` v1** (fast tier) in the `agentSummary` node, after
  `createTicket → sendEmail`: an agent-facing headline (≤ 15 words), brief (≤ 100 words) and up
  to 3 first checks, written to `ticket.agentBrief` and the new `ticket.agentAssist`
  (`status`, `headline`, `firstChecks`, `promptRef`). The ticket summary stays the one the
  employee confirmed. Redacted transcript. Model failure → `fallback` (brief = description, flag
  `AGENT_SUMMARY_FALLBACK`), confidential case → `skipped` (no call), a "same issue" link →
  untouched.
- **P-7 `agent_draft_reply` v1** (fast tier): `POST /api/agent/tickets/:id/draft-reply`
  (`{ tone?: standard | brief }` → `{ draft: { body, citedDocuments[] }, promptVersion }`). Only
  given document IDs are kept as citations; each draft is an internal `ai_draft_generated` event
  with its LLM call, plus a `ticket.ai_draft` audit entry. Never sent. 404 outside the agent's
  queues, 409 confidential case, 503 model failure.
- Agent ticket DTO: `agentAssist`. `prompts.yaml`: `agent_ticket_summary: 1`, `agent_draft_reply: 1`.

**Verification:** `agentSummary.test.ts` (generated; redaction; fallback; over-long brief retried
then fallback; confidential skipped; linked ticket untouched), `draftReply.test.ts` (citations
filtered; failure; tone and sources in the prompt), `test/api/agentDraftReply.test.ts` (draft,
internal event and audit, nothing public or notified; admin; 403/404/400; 409; 503 twice; detail
shows `agentAssist`), `test/ai/ticketFlow.test.ts` (on the runtime graph: no P-6 before confirm;
confirm → ticket → P-6; P-6 failure still creates the ticket), route policy table. Lint and
typecheck clean.

**Not done here:** the agent UI that shows the brief and the draft (W3-07); a live P-6/P-7 run.

## Pro models switch (ADR-020) — 2026-10-12

Owner request: paid models only when the user turns "Pro" on; the local model otherwise; no paid
calls in tests.

**Delivered:**

- Per-user setting `users.proModels` (default off), `PATCH /api/profiles/me/preferences`
  (`{ proModels }`, any signed-in role, audited `user.preferences`), `AuthUser.proModels`.
- `withModelMode` after authentication runs each request in the user's mode
  (`ai/llm/modelMode.ts`, AsyncLocalStorage); the server's model factory uses Ollama only
  (`createLocalChatModel`, 120 s budget) with Pro off and the paid chain with Pro on. Covers
  copilot turns, the P-6 brief after confirm and P-7 drafts; no node changed.
- UI: a "Pro" switch in the Copilot header (`ProModelsSwitch`; `role="switch"`, tooltip and
  screen-reader text naming the models; saved at once, reverted if saving fails).
- Tests make no paid calls: unit and API tests use fakes; E2E replay uses recordings; E2E users
  have Pro off, so new recordings come from Ollama.

**Verification:** `test/api/preferences.test.ts` (default off; saved, audited, returned; per
user; 401/400; the model mode follows each user through async handlers and concurrent requests;
`local` outside a request), `chatModel.test.ts` (`createLocalChatModel`: Ollama only, own
budget), `ProModelsSwitch.test.tsx` (switch states), route policy table.

**Not covered:** policy-search query embeddings stay on Gemini in both modes (index built with
Gemini embeddings; ADR-020).

### Follow-up 2026-10-12: Pro-off (local model) made usable

Measured on the LAN Ollama host (`dolphin3`, CPU): "How many days of annual leave do I get?" took
441 s and escalated with NO_EVIDENCE: P-2 (ranking 20 passages) timed out 3 × 120 s. "How Many LOP
this month?" went to policy Q&A because the local model left `workspaceIntent` out, and the
answer was withdrawn (invalid citations).

- **Light local mode:** for Pro-off requests `rerankAssess` skips P-2 and keeps the search order
  (relevance from fused scores, coverage `partial`, flag `RERANK_LOCAL`); evals and tests outside
  a request still use P-2. The local handle has `maxRetries: 0` (a slow call that timed out is not
  retried). Same question: **116 s, correct cited answer**.
- **Workspace-intent backstop** (`domain/workspaceIntentRules.ts`): when P-1 gives no workspace
  intent at all, code infers it from the message (own pay/LOP/salary/payslip → payroll; logging
  hours → timesheet log; own timesheet → status; "my requests" → requests); an explicit value
  from the model, `none` included, stands. Flag `WORKSPACE_INTENT_INFERRED`.
- E2E live/record limits raised (5 min per expectation, 10 min per test).
- Known limits (owner keeps `dolphin3` as a best-effort free fallback): one request at a time on
  CPU, about 1–3 min per turn; it marked "Why was my salary reduced?" as sensitive (handoff). Use
  Pro on for demos.

Tests: `workspaceIntentRules.test.ts`, `turnUnderstanding.test.ts` (inferred, explicit kept,
fallback analysis), `retrievalNodes.test.ts` (local ranking, non-local still calls P-2),
`chatModel.test.ts` (no retries locally). Lint, typecheck, web 76 and api 1155 green.

### E2E recordings complete — 2026-10-13

All 29 E2E tests pass in replay (no LLM calls), the UC-10 LOP scenario included. The LOP scenario
and the duplicate-ticket flow were recorded once with Pro on for their test users (owner
decision; a few Gemini calls), since the local model on CPU timed out and misclassified the
salary question. Fixes found on the way: the LOP spec signs Hana in to her agent queue (not the
dashboard); replay follows the Pro-on path regardless of the user's setting, so its prompts match
the recordings (`server.ts` `localMode`). On this PC run the suite with `--workers=1`: two workers
overload the machine (browser crashes, "cannot reach the service").

## W3-07 Agent UI — 2026-10-13

Brought back from the deferred list by the owner (2026-10-08, ADR-019 context).

**Delivered:**

- **Queue** (`/agent/queue`, `components/agent/AgentQueue.tsx`): the agent's queues, critical
  first then oldest (API order); filters for queue (agents with several), status and priority,
  kept in the URL; table with priority, workflow status, queue, age and a lock icon on
  confidential cases; skeleton, error with retry, "Queue clear" / "No tickets match".
- **Ticket workspace** (`/agent/tickets/[id]`, `AgentTicketDetail.tsx`): header (ID, queue,
  priority and floor, confidential badge, requester) with the **status selector**
  (`StatusSelector`, only the moves the API allows); **AI brief** (P-6 headline, brief, first
  checks; fallback and confidential notes); **reply composer** (`ReplyComposer`: reply or
  internal note; "Generate draft" with tone, P-7, fills the box and lists the sources; sending is
  blocked while `[placeholders]` remain; `usedAiDraft` sent with the reply); escalation emails
  (agent view); conversation (collapsible); full timeline with internal notes, status changes and
  corrections; **classification editor** (`ClassificationEditor`: category grouped by domain,
  subcategory, priority; saves only the changed fields, warns about re-routing; a confidential
  case keeps its category); fields with AI-filled markers; articles already shown. Per-action
  messages; a refused action (e.g. 409) shows the API's reason.
- API: the agent ticket detail carries `allowedStatuses` (from `TRANSITIONS`) and
  `categoryOptions` (taxonomy; only the current category for a confidential case), so the rules
  stay in code with no new endpoint.

**Verification:** `lib/agentTicket.test.ts` (classification change, age labels),
`components/agent/agentComponents.test.tsx` (status selector, classification editor, workspace:
brief, AI markers, internal notes, confidential and fallback states), `test/api/agent.test.ts`
(allowed statuses and category options), `e2e/tests/agent.spec.ts` (flow 8: Hana filters the
queue, opens HR-9002, adds a note, a placeholder blocks sending, sends a reply, changes status,
corrects priority; Tom is notified of the reply; an IT agent sees no HR ticket and an unknown
ticket is not found). Lint and typecheck clean; Jest shared 67, web 92, api 1157; E2E 31/31 (replay, `--workers=1`). E2E setup now seeds with `--reset-requests` (`resetRequests`: the demo employees' tickets created after seeding, their events and emails, and events added to seeded tickets), because tickets left by earlier runs pushed the seeded VPN request off Priya's dashboard (54 tickets removed on the first run).

**Not covered by E2E:** "Generate draft" (an LLM call); covered by API and component tests.

## UC-09 Golden cases and eval for the new intents; confirmation hard gate — 2026-10-13

**Delivered:**

- **17 workspace cases** in `evals/golden/golden.v1.jsonl` (now 97): `WS-TSL` timesheet logging
  6 (two must show a confirmation card; missing details, an over-limit day and a project the
  employee is not on must CLARIFY with no card; one injection asking to skip confirmation),
  `WS-TSS` timesheet status 3, `WS-PAY` payroll 5 (LOP explanation with the Loss of Pay policy
  cited, "How many LOP days this month", a UK payslip, a contractor, a multi-turn "that day"
  follow-up), `WS-REQ` request status 3.
- **Schema and validator:** four workspace categories (ids `WS-…`), `expected.workspaceIntent`
  (required for them; policy cases may only expect `none`) and `expected.awaitsConfirmation`
  (timesheet_log and escalate only); a timesheet_log case may expect CLARIFY; composition 97
  cases, 6 injection cases. The retrieval suite skips workspace cases.
- **Scorers:** intent accuracy (cases that name an intent; target 90%), confirmation-card rate
  (target 100%), and the **hard gate "no timesheet write or email without confirmation"**
  (`unconfirmedWriteCases` = 0): the full suite records every write node
  (`applyAction`, `createTicket`, `sendEmail`) in any turn; the eval never confirms, so any of them
  is a failure. Report and CLI summary show them.
- **Eval wiring:** the full suite runs with the employees' real records, with timesheet saves
  refused (`EVAL_WRITE_REFUSED`); `--category` and `--prompt name=N` (evaluate a prompt version
  before activating it) flags.

**Verification:** `golden.test.ts` (97-case composition, workspace rules), `fullScorers.test.ts`
(intent, card, hard gate in summary and targets), `scorers.test.ts` (new flags); evals 63/63;
`npm run golden:validate` valid.

**Not done (owner decision 2026-10-13):** the eval run itself. To run it:
`npm run eval -- --suite full --category timesheet_log --category timesheet_status --category payroll --category request_status`
(paid models, about 45 calls), then note the headline metrics here. The cases assume demo data
seeded near today (the LOP day is the last working day on or before the 12th of last month).

## W3-08 Extraction metrics — 2026-10-13

Owner decision (2026-10-13): the rest of the deferred v1.0 list (W3-08 – W4-09) is built now, in
order, after the UC tasks.

**Delivered:** `evals/runner/ticketScorers.ts` (playbook names `scorers/{category,fields,priority}.ts`;
one file, since `scorers.ts` already exists): field normalisation (lowercase, punctuation and stop
words removed, a corpus-specific synonyms map) and matching (equal, contained, or ≥ half the
words shared); `scoreTicket` → category correct, required fields checked/matched, invented values
(a value where the case expects `unknown`), priority floor (safety cases). The full suite captures
the drafted ticket; failure codes `WRONG_CATEGORY`, `FIELD_MISMATCH`, `INVENTED_VALUE`,
`PRIORITY_FLOOR`; summary metrics and section 8 targets: category accuracy ≥ 90%, field accuracy
≥ 85%, invented values 0, priority floor compliance 100% (reported, not hard gates). Multi-turn
escalate cases already replay their planned user replies.

**Verification:** `ticketScorers.test.ts` (normalisation, synonyms, matching, scoring with and
without a draft), `fullScorers.test.ts` (codes on the case, summary metrics; a missing draft is a
decision miss, not a ticket metric). Evals 76/76; typecheck clean.

**Not done:** the eval run (paid models; owner decision as for UC-09). Week 4 tuning items come
from its results.

## W4-01 Metrics API and Admin Overview — 2026-10-13

**Delivered:**

- `GET /api/admin/metrics/overview?from&to` (admin only; whole UTC days, `to` inclusive;
  default the last 7 days; 400 for an invalid range). Response per playbook section 4:
  conversations, decision distribution (turns), confirmed resolution rate, escalation rate and by
  category, sensitive handoffs, override rate, thumbs-down rate, latency p50/p90 (first token and
  whole turn), cost per conversation, plus the **definitions** for tooltips.
- Definitions fixed in `domain/metrics.ts` (`METRIC_DEFINITIONS`, `computeOverview`, pure); the
  repository (`modules/metrics/repository.ts`) loads the range's non-eval rows (conversations,
  turn traces, tickets, classification corrections, feedback) and code computes the numbers.
  Deviation: playbook says "aggregation pipelines"; computing in code over the loaded rows gives
  the same numbers with one tested definition. Fine at prototype volumes (W4-09 can move it into
  pipelines if needed).
- `/admin` page (`components/admin/overview`): range presets (7 / 30 days) and date inputs kept in
  the URL; eight metric cards with definition tooltips; decision bar (Tailwind, no chart library)
  whose legend links to `/admin/traces?decision=…` (W4-03); escalations by category; latency and
  cost; skeleton, error with retry, "No conversations in range".

**Verification:** `domain/metrics.test.ts` (a hand-computed fixture for every metric, empty range,
nearest-rank percentile, ranges), `test/api/metrics.test.ts` (numbers and definitions, default and
given range, 400, 403 agent/employee, 401), route policy table, `AdminOverview.test.tsx`,
`e2e/tests/admin.spec.ts` (smoke). Lint and typecheck clean.

## Dark / light theme and 3D avatars — 2026-10-13

Owner request (between W4-01 and W4-02): dark and light modes across the whole application,
control placed per common UX practice. ADR-021.

- Sun/moon button in the top bar left of the notification bell (top-right on the sign-in page)
  opens Light / Dark / System; System is the default and follows the OS; the choice is kept per
  browser and applied before first paint (no flash).
- `globals.css` remaps the palette under `html.dark`, so every page follows; `bg-white` became the
  `bg-surface` token and dark primary fills the `bg-ink` / `text-on-ink` tokens (light mode looks
  the same as before).
- 3D avatars (owner request): each seeded persona has a 3D cartoon avatar instead of initials
  (sign-in cards, top-bar profile button, profile panel). Images are Microsoft Fluent Emoji 3D
  (MIT licence), stored in `apps/web/public/avatars/` so the demo works offline;
  `lib/avatars.ts` maps names to files; other users fall back to initials
  (`components/ui/Avatar.tsx`).

**Verification:** `lib/theme.test.ts` (preference parsing, resolution, init script),
`shell.test.tsx` (ThemeMenu renders closed with its label), `e2e/tests/auth.spec.ts` (switch to
dark, survives reload, back to light), screenshots of login, dashboard, timesheets, Copilot and
admin overview in both themes. Lint, typecheck and web tests clean.

## W4-02 Knowledge gaps — 2026-10-13

- Gap turns (partial answers and no-evidence escalations; never restricted or eval) in a range
  (default 30 days) → redacted questions embedded (Gemini, clustering task type) → agglomerative
  clustering in code (`domain/gapClustering.ts`, thresholds in `config/thresholds.yaml` `gaps`) →
  each cluster named by **P-8 `gap_cluster_label` v1** (fast tier; fallback "Unlabelled
  cluster", `labelled: false`) → stored as one `gap_clusters` snapshot with the P-8 call as its
  trace entry.
- API: `GET /api/admin/knowledge-gaps`, `POST /api/admin/knowledge-gaps/refresh` (admin only,
  audited). `/admin/gaps` page replaces the placeholder.
- **Deviations from the playbook:** the refresh runs in the background (202 + polling) instead of
  inside the request, because naming up to 15 clusters on the local model (Pro off) takes minutes;
  GET returns `snapshot: null` (200) instead of 404 so the page also gets the refresh state; a
  refresh replaces the previous snapshot (no history). `gap_clusters` gains `rangeFrom/rangeTo`,
  `labelled`, `conversationIds` (for trace links) and `labelCall`.
- P-8 follows the requesting admin's Pro switch (ADR-020): local model when off.

**Verification:** `domain/gapClustering.test.ts` (cosine; two synthetic topics cluster, a stray
is dropped; threshold extremes; max clusters; centroid; candidate rule incl. restricted and eval),
`test/api/gaps.test.ts` (labelled clusters largest first with trace links; restricted, eval and
out-of-range turns never embedded or returned; fallback label; empty range clears the snapshot;
409 while running; 400; 503 without models; failed refresh state; 403/401; audit), route policy
table, P-8 schema and registry tests, `e2e/tests/admin.spec.ts` (page smoke). Not yet checked: a
refresh on real data (the 0.8 similarity threshold is tuned on synthetic vectors only; needs live
Gemini embeddings).

## W4-03 Trace viewer — 2026-10-13

- API (admin only): conversation list with filters and cursor, conversation timeline with the
  ticket's priority floor, full trace with chunk texts resolved; detail reads audited
  `admin.trace_view`; user text only as the redacted input; evaluation conversations not listed.
- Web: `/admin/traces` table with URL filters and "Load more"; `/admin/traces/[conversationId]`
  turn timeline (safety / sensitive / withdrawn / error chips) and trace panel with the five tabs
  of playbook section 10. Every field of the section 3 trace is shown (ids, profile snapshot,
  precheck, analysis, retrieval lists with scores and expandable chunk text, decision, output,
  LLM calls, step latency, totals, errors, flags).

**Acceptance:** Priya's battery turn shows the safety precheck hit (`safety_battery`), the rules
fired and, when the conversation raised a ticket, the priority floor applied (API test fixture;
checked on the dev database for the precheck and rules — that demo conversation has no ticket).

**Verification:** `test/api/traces.test.ts` (list order, filters, cursor, 400; timeline with
redacted input and no raw email, ticket floor, audit; full trace with resolved chunks and every
stored field present, audit; 404; 403 agent/employee, 401), route policy table,
`e2e/tests/admin.spec.ts` (list → timeline → all tabs). Screenshots of list, timeline and tabs on
the dev site.

## W4-04 Document management — 2026-10-14

- API (admin only, writes audited): list with domain / status / country filters; detail with
  chunk previews; upload (multipart `.md` / `.pdf` ≤ 5 MB + metadata JSON) through the ingestion
  pipeline; re-index from the stored source; status change in MongoDB and Qdrant. Code enforces
  type, size, metadata (shared schema), one active version per slug, and a valid `supersedes`.
- New dependencies from the approved list: `multer` 2.0.2, `pdf-parse` 2.4.5 (the LangChain PDF
  loader's parser, used directly; ADR-022). Originals kept in `data/uploads/` (git-ignored).
- Web: `/admin/documents` (filters in the URL, upload dialog with metadata form and per-field
  errors) and `/admin/documents/[id]` (metadata, audience, index state, chunk list, re-index,
  activate / deactivate, new version prefilled to supersede).

**Verification:** `test/api/documents.test.ts` (upload indexes with the audience on every chunk
in both stores and keeps the original; PDF; supersede hides v1 in both stores; rejections:
no file, wrong type, > 5 MB, empty, metadata missing / not JSON / invalid with field paths; 409
slug+version and second active version; 400 bad supersede; re-index recreates chunks, 404,
409 missing source; status change and 409 on a second active; 403 / 401; audit),
`ai/ingestion/indexer.test.ts` (upload bodies: Markdown frontmatter dropped, PDF text, rejects),
route policy table, `e2e/tests/admin.spec.ts` (page smoke), screenshots on the dev site.
`test/integration/documentUpload.test.ts` (upload → retrieve on a throwaway MongoDB database and
Qdrant collection: UK full-time only, superseding switches to v2, deactivating hides it) passes
3/3 on the LAN MongoDB and Qdrant (`MONGODB_TEST_URI`, `QDRANT_TEST_URL`). Full E2E 36/36.

## W4-05 Evaluation API and page — 2026-10-14

- API (admin only): start a run (`retrieval` or `full`, optional tags and case ids; 409 while one
  is active; audited), list runs (UI and CLI), run detail (metrics, per category, targets,
  config snapshot, error), results with failed-only and category filters.
- The API starts the eval CLI as a background child process attached to the queued run; models
  follow the admin's Pro switch; progress per case; interrupted runs are failed at startup
  (ADR-023). The judge suite stays W4-06 (400 for now).
- Web: `/admin/evals` (run table with pass badges and progress, start dialog, polling) and
  `/admin/evals/[runId]` (progress, target cards, per category, decision confusion matrix for the
  full suite, cases with expected vs actual).
- Golden set: tag `smoke` on HR-ANS-001, HR-ANS-002, IT-ANS-001 (golden:validate passes).

**Verification:** `test/api/evals.test.ts` (queued and launched with the filter and the Pro
switch's model mode, audited; 409 while active, new run after it ends; runner exit with the run
active fails it with its output; 400 judge / unknown fields / bad case ids; 503 without a
runner; list order, suite filter, detail, results filters, 404; 403 / 401), route policy,
`parseArgs` (`--run-id`, `--model-mode`), `e2e/tests/evals.spec.ts` (start a smoke run from the
UI, progress, three cases, back to the list) recorded once and replayed.

**Real run (dev API, 2026-10-14):** Alex (Pro off) started a retrieval run with tag `smoke`:
queued → running, progress 1/3 → 3/3, completed and passed every target (recall@5 = 1.0 in all
four modes, no leakage), local model, about 5 min, $0. Found and fixed while recording: an API's
startup clean-up failed runs launched by another live API on the same database (dev and E2E
share it); runs now carry their launching process (host + pid) and only runs whose process on
this host has gone are failed (unit test). Also: the run's dataset version is set when the runner
attaches; target cards show the measured value (`fusedRecallAt5` → `fused.recallAt5`).

## W4-06 Judge suite and threshold tuning — skipped for now (owner decision 2026-10-14)

Needs paid runs (a full-suite run plus a P-9 judge call per answer) and a 20-answer manual spot
check by the owner. Not built; to be picked up when the quota and the spot check are available.

## W4-07 Security hardening — 2026-10-14

- `helmet` headers; CORS only for `WEB_ORIGIN` (credentials); CSRF header check on every
  mutating request (`X-Requested-With: sd-web`, 403 otherwise); JSON body ≤ 100 KB (already);
  no stack traces, request IDs (already); startup warning when `NODE_ENV=production`.
- In-memory rate limits from `config/thresholds.yaml` `rateLimits`: login 10/min per IP, chat
  20 turns/min per user (message and escalate), uploads 10/hour per admin; eval runs one at a time
  (W4-05). 429 `RATE_LIMITED` with `RateLimit` / `Retry-After`. `RATE_LIMIT_SCALE` (env) raises
  them for the E2E run only (100).
- Upload content checks: MIME type against the extension, `%PDF-` magic bytes, UTF-8 Markdown.
- New dependencies from the approved list: `helmet` 8.1.0, `cors` 2.8.5, `express-rate-limit`
  7.5.0. `npm audit`: `multer` 2.0.2 → 2.4.0 (three advisories fixed); `undici` (Qdrant client)
  stays deferred (owner, 2026-10-05; see PRODUCTION_GAPS).

**Acceptance:** route-policy test proves every route declares a role (existing) and the new role
matrix exercises every route × every role and no session (`test/api/roleMatrix.test.ts`).
"Injection cases 100%" needs a paid full-suite eval run; **pending** with W4-06 (not re-run in
this task).

**Verification:** `test/api/security.test.ts` (helmet headers, no `x-powered-by`, CORS allow /
deny, CSRF middleware and a refused login without audit, login / chat per user / upload limits),
`test/api/roleMatrix.test.ts`, upload content checks in `test/api/documents.test.ts`, env test.
API 1248 passed (31 skipped integration), web 100, lint clean.

## W4-08 Historic seed data and reset — 2026-10-15

- `seed/historic/` (scenarios and 12 synthetic employees) and `buildHistoric`: 120 synthetic
  conversations over 14 days with traces, feedback, ~40 tickets with events and corrections, and a
  knowledge-gap snapshot (no embedding calls). Deterministic (fixed seed, stable ids); records
  marked `synthetic`; owned by non-demo users so the five personas keep their curated data.
- `npm run reset` (`resetDemo`): seed + clear demo-run conversations and tickets + historic data;
  idempotent; eval runs and audit log kept. Documented in `docs/DEMO.md`, README, CLAUDE.md.
- Owner decision (2026-10-15): reset not run on the shared dev database (it would delete the
  dev chats); verified on a throwaway database instead. Run it before a demo.

**Verification:** `modules/workspace/historic.test.ts` (deterministic, volumes, every record
passes its schema, 14-day window, references, enforced rules, no clash with demo personas);
`test/integration/demoReset.test.ts` on the LAN MongoDB (2/2: reset twice gives the same data,
in well under 2 minutes; a demo-run conversation and ticket are cleared, seeded / historic /
eval data kept).

## W4-09 Performance and resilience — 2026-10-20 (built; measurement pending)

- Already in place before this task: vector and keyword search in parallel (W1-11); P-1, P-2,
  P-4 on the fast tier; provider retry with backoff and retry hints (W1-09); fallback chain
  (ADR-018).
- New: query-embedding reuse (`ai/llm/embeddingCache.ts`, wired into the API's live embedding);
  whole-call budget `call.totalTimeoutMs` (75 s, `config/models.yaml`) bounding every node,
  retries and backoff included; `policyFor` keeps a slower model's own budget; fake models can
  now hang (`{ hang: true }`) to force a real provider timeout in tests.
- `npm run latency`: 30 scripted turns against a running API → `evals/reports/latency.md`
  (first word p50 / p90, whole turn p50 / p90, cost per turn vs NFR-1 / NFR-2).
- **Owner decision (2026-10-15): build only, measure later.** The 30-turn run has not been done,
  so NFR-1 / NFR-2 are not yet shown as met on the demo machine. Run it with the models the demo
  will use (Pro on: paid quota; Pro off: local model, much slower).

**Verification:** `retry.test.ts` (whole-call budget: a hung provider is abandoned after 2 of 6
possible attempts; a retry-after hint that would overrun the budget is not waited out; retries
within budget still succeed); `retrievalNodes.test.ts` (**forced provider timeout**: a hung model
behind the real call policy → P-2 abandoned within the budget, the turn continues in search order
with `RERANK_FALLBACK`); `embeddingCache.test.ts`; `evals/runner/latency.test.ts` (script,
nearest-rank percentiles, targets, report).

## UC-12 Needs your attention — 2026-10-20

**Delivered:** `domain/attention.ts` (payroll cutoff, Loss of Pay rule, ordered items; ADR-024),
`payroll` block in `config/workday.yaml` (+ schema), `attention` on `GET /api/dashboard`
(`AttentionItemSchema`, shared), `AttentionCard` on the dashboard (replaces the hero's "no hours
logged" banner). Contract amendment A-1 (UC-11 – UC-17; owner approved, manager pending).

**Owner decisions (2026-10-20):** panel only; "What should I do today?" joins the other new
intents in one P-1 v3 with one eval run. No money amount on Loss of Pay risks (salary is not on
the user). Amendment recorded as owner approved, manager pending.

**Verification**

| Check                           | Result                                                                                                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attention.test.ts` (unit)      | Cutoff skips weekends and each country's holidays; LOP rule per attendance status; past cutoff → `lop_risk`; deducted days left out; urgency; cutoff day in time; order |
| `workspace.test.ts` (Supertest) | Priya: one attended gap, no LOP warning; Tom (contractor): partial day + waiting request; clock at 16 Oct: two `lop_risk`, then urgent and normal gaps in order         |
| `AttentionCard.test.tsx` (web)  | Wording and links per kind, urgent count, five shown then "Show 2 more", empty renders nothing                                                                          |
| Playwright `workspace.spec.ts`  | 6/6; flow 1 now checks the attention card (one `timesheet_gap`, Copilot link)                                                                                           |
| Eval                            | Not run: no prompt or graph change                                                                                                                                      |

**Follow-ups:** a "leave expiring" item after UC-11 (done in UC-11a); the copilot intent in P-1 v3.

## UC-11a Leave: balances, form and HR approval — 2026-10-20

**Delivered:** `domain/leave.ts` (balances, `checkLeave`, cancel rule), `leave` block in
`config/workday.yaml` (+ schema), `leave_requests` collection (schema, indexes, repository,
in-memory helper, seed), `modules/workspace/leaveService.ts` + `leaveRoutes.ts` (five endpoints,
audited, in-app notifications `kind: leave`), contracts `packages/shared/src/api/leave.ts`, pages
`/leave` and `/agent/leave`, nav items, `leave_expiring` attention item, synthetic policy
`corpus/hr/hr-casual-leave.md` (ingested: 39 documents, 186 chunks). ADR-025.

**Owner decisions (2026-10-20):** annual + sick + casual (casual needs its own policy); annual and
casual wait for the HR agent, who approves for the manager; sick leave is recorded at once; built
in three slices (11a no LLM, 11b balance answer + P-1 v3 draft, 11c apply action + eval).

**Pending owner review:** the casual leave numbers (6 days a year, 2 at a time, 1 working day's
notice, no carry-over), as for the W1-07 corpus.

**Verification**

| Check                           | Result                                                                                                                                                                                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `leave.test.ts` (unit)          | Balances per year/country; working days and holidays; notice and doctor's-note warnings; contractors, past, cross-year, too long, overlap, over balance                                                                                                                                      |
| `leave.test.ts` (Supertest)     | Access (employee-only / agents; IT agent sees nothing, 404 on decide); balances; apply → pending + notification + audit; sick → attendance leave, no longer a missing day; overlap 400; cancel (404 for others, 409 twice / started); approve, reject needs a note, 409 on a second decision |
| `attention.test.ts`             | `leave_expiring` from the reminder date, only beyond the carry-over                                                                                                                                                                                                                          |
| Web (`LeavePage.test.tsx`)      | Balances, form options, requests with status and cancel; contractor message; HR row with balance after approval                                                                                                                                                                              |
| Route policy table, role matrix | Updated for the five endpoints; matrix green                                                                                                                                                                                                                                                 |
| Playwright `leave.spec.ts`      | 1/1 (form → pending → HR approves → approved; overlap error), with `workspace.spec.ts` 6/6                                                                                                                                                                                                   |
| Eval                            | Not run: no prompt or graph change. `HR-CLR-001` ("How much leave do I have?" → CLARIFY) changes with the balance intent in UC-11b                                                                                                                                                           |

## UC-11b Copilot: leave balance, daily briefing, P-1 v3 draft — 2026-10-21

**Delivered:** P-1 v3 (`turn_analysis/v3.md`; intents `leave_balance`, `leave_apply`,
`daily_briefing`, `request_manage`), `leaveAgent` (`leaveBalance`; `leaveApply` placeholder) and
`briefingAgent` (`dailyBriefing`) subgraphs, routing, code backstop rules, records
(`leave`, `attention`), reply builders, regenerated topology in ARCHITECTURE.md. No new LLM call:
both answers are code from records after P-1.

**Not switched on:** `config/prompts.yaml` keeps `turn_analysis: 2`. P-1 v3 is switched with a full
eval run in UC-11c (owner decision: one P-1 v3, one eval run). Until then the live copilot reaches
the new agents only when the model leaves the workspace intent out (code backstop) or picks a new
value the shared output schema now allows; v2's prompt text, hash and the E2E replays are
unchanged (recordings are keyed by prompt text).

**Verification**

| Check                                                | Result                                                                                                                                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `edges.test.ts`, `graph.test.ts`                     | New intents route to `leaveAgent` / `briefingAgent` / `requestsAgent`; answer-only rule; leave start route; paths; topology                                                                                 |
| `workspaceIntentRules.test.ts`                       | Balance, apply and briefing phrasings; policy questions ("How do I apply for leave?", "Can I take leave next month?") stay null                                                                             |
| `workspaceReplies.leave.test.ts`                     | Balance reply with upcoming leave only; every briefing kind with urgent marks; empty briefing                                                                                                               |
| `copilotLeave.test.ts` (Supertest, fake P-1)         | Priya's exact balance and briefing replies, P-1 the only model call; contractor; apply writes nothing                                                                                                       |
| `turnUnderstanding.test.ts`                          | v3 renders with the same variables and names every new intent; a v3 analysis validates                                                                                                                      |
| Retrieval eval (2026-10-21, after `hr-casual-leave`) | recall@5 100% all modes (54/54), leakage 0; report `evals/reports/2026-10-21-retrieval-6e22e038.md`                                                                                                         |
| Playwright (full, replay)                            | 36/38. `auth.spec.ts` nav lists updated for Leave (10/10). Two `chat.spec.ts` Priya tests fail: casual-leave chunks now in her top results change the P-2 prompt, so the recordings miss; being re-recorded |
| Eval                                                 | Not run (v3 not active); planned for UC-11c                                                                                                                                                                 |
