# Progress

## Task status

| Task  | Name                                | Status                   | Date       |
| ----- | ----------------------------------- | ------------------------ | ---------- |
| W1-01 | Monorepo scaffold                   | Done (Docker unverified) | 2026-10-02 |
| W1-02 | Config and env loading              | Not started              |            |
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
