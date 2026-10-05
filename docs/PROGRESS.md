# Progress

## Task status

| Task  | Name                                | Status                                 | Date       |
| ----- | ----------------------------------- | -------------------------------------- | ---------- |
| W1-01 | Monorepo scaffold                   | Done (Docker unverified)               | 2026-10-02 |
| W1-02 | Config and env loading              | Done                                   | 2026-10-02 |
| W1-03 | Shared contracts and error envelope | Done                                   | 2026-10-02 |
| W1-04 | Database layer and indexes          | Done (amended: Qdrant, ADR-004)        | 2026-10-05 |
| W1-05 | Users seed and auth                 | Done                                   | 2026-10-05 |
| W1-06 | Frontend shell and login            | Done                                   | 2026-10-05 |
| W1-07 | Corpus authoring and validation     | Done (pending owner review of numbers) | 2026-10-05 |
| W1-08 | Golden set v1                       | Deferred by owner: before W1-12        |            |
| W1-09 | LLM and embedding provider layer    | Done                                   | 2026-10-05 |

## Checkpoints

| Checkpoint      | Status                             | Notes                                                                                               |
| --------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| CP-1 Foundation | **Passed (2026-10-05)**, local run | Compose criterion deferred by the owner; checked as a local run instead. See the CP-1 section below |

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
