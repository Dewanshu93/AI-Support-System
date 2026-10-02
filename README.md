# AI Service Desk Front Door

Prototype IT/HR service desk front door: cited answers from policy documents, or a
ready-to-confirm ticket. Synthetic data and mocked integrations.

## Setup

Requires Node.js ≥ 24 and Docker.

```bash
cp .env.example .env
npm install
docker compose up --build          # web http://localhost:3000, api http://localhost:4000
```

Without Docker: `npm run dev:api` and `npm run dev:web` in two terminals.

## Configuration

The API validates everything at startup and exits with a readable message if anything is
missing or malformed. Nothing is silently defaulted except where noted below.

**Environment variables** (secrets and environment-specific values; schema in
`apps/api/src/config/env.ts`). The API loads `.env` from the repo root if present; variables
already set in the environment win.

| Variable                               | Required | Default                 | Notes                                     |
| -------------------------------------- | -------- | ----------------------- | ----------------------------------------- |
| `MONGODB_URI`                          | yes      | —                       | `mongodb://` or `mongodb+srv://`          |
| `JWT_SECRET`                           | yes      | —                       | ≥ 32 characters                           |
| `NODE_ENV`                             | no       | `development`           | `development` \| `test` \| `production`   |
| `API_PORT`                             | no       | `4000`                  |                                           |
| `WEB_ORIGIN`                           | no       | `http://localhost:3000` | CORS allowlist origin                     |
| `LOG_LEVEL`                            | no       | `info`                  | pino level; `silent` under Jest           |
| `DEMO_PASSWORD`                        | no       | —                       | Shared password for the demo login picker |
| `GEMINI_API_KEY`, `OPENROUTER_API_KEY` | no       | —                       | Needed for the configured provider        |
| `CONFIG_DIR`                           | no       | `<repo>/config`         | Alternative config directory              |
| `ENV_FILE`                             | no       | `<repo>/.env`           | Alternative env file path                 |

**Behaviour files** (`config/*.yaml`, tunable without code changes; one strict Zod schema each in
`apps/api/src/config/schemas.ts`):

| File                  | Contents                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `taxonomy.yaml`       | IT/HR categories and subcategories                                                            |
| `routing.yaml`        | Queues, category → queue routes, sensitive queue                                              |
| `priority-rules.yaml` | Priority floors; safety patterns that trigger the safety path                                 |
| `sensitive.yaml`      | Sensitive-topic patterns that trigger the HR handoff                                          |
| `thresholds.yaml`     | Decision thresholds (T_answer, T_partial) and retrieval parameters                            |
| `ticket-schemas.yaml` | Ticket fields per category, with required flags                                               |
| `prompts.yaml`        | Active version of each of the nine prompts                                                    |
| `models.yaml`         | Chat provider (`gemini` \| `openrouter`), fast/quality models, embeddings model and dimension |
| `templates.yaml`      | Fixed replies (out of scope, sensitive handoff, withdrawn answer, …)                          |

Startup also checks the files against each other: every taxonomy category needs a queue of the
same domain and a ticket schema, and no route or schema may name an unknown category.

## Checks

```bash
npm run lint && npm run typecheck && npm test
npm run test:e2e                   # first time: npx playwright install chromium
```

## Docs

[CLAUDE.md](CLAUDE.md) · [Playbook](docs/PLAYBOOK.md) · [Architecture](docs/ARCHITECTURE.md) ·
[Decisions](docs/DECISIONS.md) · [Progress](docs/PROGRESS.md)
