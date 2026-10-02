# Progress

## Task status

| Task  | Name                                | Status                           | Date       |
| ----- | ----------------------------------- | -------------------------------- | ---------- |
| W1-01 | Monorepo scaffold                   | Done (Docker unverified)         | 2026-10-02 |
| W1-02 | Config and env loading              | Done                             | 2026-10-02 |
| W1-03 | Shared contracts and error envelope | Done                             | 2026-10-02 |
| W1-04 | Database layer and indexes          | Code done; DB acceptance pending | 2026-10-02 |
| W1-05 | Users seed and auth                 | Not started                      |            |
| W1-06 | Frontend shell and login            | Not started                      |            |

## Checkpoints

| Checkpoint      | Status      | Notes       |
| --------------- | ----------- | ----------- |
| CP-1 Foundation | Not reached | After W1-06 |

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
- Docker acceptance criterion is still open: run `docker compose up --build` on a machine with
  Docker. The `mongodb-atlas-local:8.0` tag could not be checked (Docker Hub unreachable).
- Playwright's bundled Chromium could not be downloaded (network); E2E uses the installed Chrome
  via `E2E_BROWSER_CHANNEL=chrome`.
- ADR-002 tooling dependencies (typescript-eslint, tsx, etc.) await approval.
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

| Check                                                  | Result                                                                                                                                       |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint` / `npm run typecheck`                   | Pass                                                                                                                                         |
| `npm test`                                             | Pass: shared 31, api 177, web 3; 3 DB integration tests skipped                                                                              |
| Index definitions match section 3                      | Pass: unit tests for unique/sparse keys, eval/queue/duplicate indexes, search index definitions                                              |
| Idempotency and drift logic                            | Pass: unit tests against fakes (create all → re-run creates none; only missing created; key drift refused; dimension change refused)         |
| Search index wait logic                                | Pass: unit tests (becomes queryable, FAILED fails fast, timeout names pending)                                                               |
| Regular indexes created once across two runs (real DB) | Pass (2026-10-02): MongoDB 8.3.4 at 192.168.29.3; run 1 → 14 collections and 32 indexes, run 2 → 0 and 0; index sets match definitions       |
| Counters atomicity and unique indexes (real DB)        | Pass: 50 concurrent increments → 1..50; duplicate email and duplicate ticket `conversationId` rejected (E11000)                              |
| **Search indexes reach ready state**                   | **Pending**: the LAN server is MongoDB Community without mongot (`SearchNotEnabled`); Atlas cloud is blocked by the HTC TLS-inspecting proxy |

**Environment (2026-10-02):** `.env` points at `mongodb://192.168.29.3:27017/servicedesk` (LAN,
no auth, shared with other projects' databases). The Atlas URI is kept commented out in `.env`.

**To close the search-index criterion**, run against an Atlas-capable server (Atlas Local on the LAN
PC, or Atlas from a network without TLS inspection):

```bash
npm run db:indexes   # twice
MONGODB_TEST_URI="mongodb://<host>:<port>/?directConnection=true" npm test -w @sd/api
```

**Notes / risks**

- The `tickets` index `{queue, status, priority: -1, createdAt}` follows the playbook. But
  `priority` is a string, so `-1` sorts alphabetically (medium > low > high > critical), not by
  severity. W3-05's queue sort ("priority desc") will need a numeric `priorityRank` field or an
  in-query mapping; this needs a decision before W3-05.
- Integration tests rely on `listSearchIndexes` returning `queryable`. That is documented for
  Atlas and atlas-local, but unverified here.
- LangGraph checkpoint collections are owned by the checkpointer package (W2-02) and are not
  created by `db:indexes`.
