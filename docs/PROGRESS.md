# Progress

## Task status

| Task  | Name                                | Status                   | Date       |
| ----- | ----------------------------------- | ------------------------ | ---------- |
| W1-01 | Monorepo scaffold                   | Done (Docker unverified) | 2026-10-02 |
| W1-02 | Config and env loading              | Done                     | 2026-10-02 |
| W1-03 | Shared contracts and error envelope | Not started              |            |
| W1-04 | Database layer and indexes          | Not started              |            |
| W1-05 | Users seed and auth                 | Not started              |            |
| W1-06 | Frontend shell and login            | Not started              |            |

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
- Logging is still `console`; pino arrives in W1-03.
