# Employee Unified AI Gateway

A prototype employee portal with an AI Copilot (Build Contract v2.0, Use Case 1). Synthetic
data and mock internal systems; not a production service.

- **Dashboard:** profile, this week's tasks and timesheet, pay, active requests, notifications.
- **Copilot:** policy answers with citations; timesheet status and logging by chat (saved only
  after the employee confirms); payroll investigation (Loss of Pay) from the employee's own
  records plus the cited policy; escalation to a team with an AI-drafted ticket and email that
  the employee reviews, edits and sends; "show my requests".
- **Requests:** a tracker (list and board) whose status follows the agent's changes, with
  in-app notifications.
- **Safety rails:** sensitive topics go to a confidential HR handoff, out-of-scope requests get
  a fixed reply, vague ones one clarifying question, duplicates an "add to existing" prompt.

How it works: one LangGraph state graph per copilot turn; the model proposes, code decides
(routing, permissions, figures, priorities, citations). See [Architecture](docs/ARCHITECTURE.md).
For a walkthrough, follow the [demo script](docs/DEMO.md).

## Setup

Requires Node.js ≥ 24, a reachable MongoDB 8.x and a Qdrant server (set `MONGODB_URI` and
`QDRANT_URL` in `.env`). The app runs locally:

```bash
cp .env.example .env               # then set MONGODB_URI, QDRANT_URL, JWT_SECRET
npm install
npm run db:indexes                 # once per database; safe to repeat
npm run seed                       # demo users and mock HR data (safe to repeat; restores the demo)
npm run reset                      # seed + clear demo-run data + 14 days of synthetic history for the admin pages
npm run ingest                     # index corpus/ (needs GEMINI_API_KEY; safe to repeat)
npm run dev:api                    # terminal 1: api http://localhost:4000
npm run dev:web                    # terminal 2: web http://localhost:3000
```

Open http://localhost:3000 and pick a persona (password: `DEMO_PASSWORD`, if set):

| Persona        | Role     | Profile                   | Demo use                                       |
| -------------- | -------- | ------------------------- | ---------------------------------------------- |
| Priya Shah     | Employee | US, full time             | The Loss of Pay scenario (see the demo script) |
| Ravi Iyer      | Employee | US, full time             | Policy answers, IT tickets                     |
| Olivia Bennett | Employee | UK, full time             | UK policy variants, timesheet form             |
| Tom Clarke     | Employee | UK, contractor            | Contractor rules; paid by agency               |
| Marcus Lee     | Employee | US, contractor            | Contractor rules                               |
| Hana Kim       | Agent    | HR queues (incl. Payroll) | Works HR and payroll requests                  |
| Sam Patel      | Agent    | IT queues                 | Works IT requests                              |
| Alex Morgan    | Admin    | —                         | Admin pages are deferred (placeholders)        |

The agent workspace UI is deferred too (W3-07): agents work requests through the agent API.

The mock HR data is generated for "today" (`npm run seed -- --today YYYY-MM-DD` picks another
anchor date). To rehearse a demo on a fixed week, set `DEMO_TODAY` in `.env` and seed with the
same date.

`docker-compose.yml` (web, api, mongodb, qdrant) is kept for later but is not used yet.

## Configuration

The API validates everything at startup and exits with a readable message if anything is
missing or malformed. Nothing is silently defaulted except where noted below.

**Environment variables** (secrets and environment-specific values; schema in
`apps/api/src/config/env.ts`). The API loads `.env` from the repo root if present; variables
already set in the environment win.

| Variable                               | Required | Default                 | Notes                                                                |
| -------------------------------------- | -------- | ----------------------- | -------------------------------------------------------------------- |
| `MONGODB_URI`                          | yes      | —                       | `mongodb://` or `mongodb+srv://`                                     |
| `JWT_SECRET`                           | yes      | —                       | ≥ 32 characters                                                      |
| `NODE_ENV`                             | no       | `development`           | `development` \| `test` \| `production`                              |
| `API_PORT`                             | no       | `4000`                  |                                                                      |
| `WEB_ORIGIN`                           | no       | `http://localhost:3000` | CORS allowlist origin                                                |
| `LOG_LEVEL`                            | no       | `info`                  | pino level; `silent` under Jest                                      |
| `DEMO_PASSWORD`                        | no       | —                       | Shared password for the demo login picker                            |
| `GEMINI_API_KEY`, `OPENROUTER_API_KEY` | no       | —                       | Needed for the configured provider                                   |
| `QDRANT_URL`, `QDRANT_API_KEY`         | no       | `http://localhost:6333` | Vector store                                                         |
| `DEMO_TODAY`                           | no       | system date             | Pins "today" (YYYY-MM-DD) for the demo                               |
| `EMAIL_DELIVERY`                       | no       | `mock`                  | `mock` records emails in the outbox only                             |
| `OLLAMA_BASE_URL`                      | no       | —                       | Local fallback model, e.g. `http://localhost:11434`                  |
| `LLM_MODE`                             | no       | `live`                  | `record` \| `replay`: E2E recorded replies; `cache`: dev reply cache |
| `CONFIG_DIR`                           | no       | `<repo>/config`         | Alternative config directory                                         |
| `ENV_FILE`                             | no       | `<repo>/.env`           | Alternative env file path                                            |

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
| `prompts.yaml`        | Active version of each prompt                                                                 |
| `workday.yaml`        | Working hours, timesheet rules and public holidays per country                                |
| `models.yaml`         | Chat provider (`gemini` \| `openrouter`), fast/quality models, embeddings model and dimension |
| `templates.yaml`      | Fixed replies (out of scope, sensitive handoff, withdrawn answer, …)                          |

Startup also checks the files against each other: every taxonomy category needs a queue of the
same domain and a ticket schema, and no route or schema may name an unknown category.

## Database

- **MongoDB 8.x** (`MONGODB_URI`): structured data and chunk text.
- **Qdrant** (`QDRANT_URL`): dense and sparse BM25 vectors for hybrid search (ADR-004).

Both run in Docker Compose. Create the Mongo collections and indexes and the Qdrant collection
(safe to repeat):

```bash
npm run db:indexes
```

## LLM providers

Set `GEMINI_API_KEY` in `.env` (chat and embeddings; `OPENROUTER_API_KEY` is optional for
OpenRouter chat). Models, tiers, timeouts, retries and prices live in `config/models.yaml`.

**Pro switch (ADR-020):** each user chooses in the Copilot header. **Pro off** (the default):
answers come from the local Ollama model only, free but slower. **Pro on:** paid models (Gemini,
then OpenRouter). Policy search always uses Gemini embeddings (a tiny call per question).

With Pro on, when a model is out of quota or credit, rejects its key or is unreachable, the API falls back:
Gemini quality → Gemini fast → OpenRouter → a local Ollama model (ADR-018). For the local
model, run [Ollama](https://ollama.com) with `ollama pull dolphin3` and set `OLLAMA_BASE_URL`
(here the LAN host, `http://192.168.29.3:11434`; Ollama must listen on `OLLAMA_HOST=0.0.0.0`).
Providers without a key or URL are skipped. On CPU the local model is slow, so it gets its own
time budget (`call.providerTimeoutMs` in `models.yaml`). For
development, `LLM_MODE=cache` reuses saved replies for identical prompts (`.llm-cache/`).

Check real connectivity with:

```bash
npm run llm:smoke
```

Behind a TLS-inspecting corporate proxy, Node needs the corporate CA: the api scripts and
`llm:smoke` pass `--use-system-ca`, so Node trusts the operating system's certificate store.

## Checks

```bash
npm run lint && npm run typecheck && npm test
# Integration tests run only when their URLs are set (throwaway DB/collection, removed after):
MONGODB_TEST_URI="mongodb://localhost:27017/?directConnection=true" \
QDRANT_TEST_URL="http://localhost:6333" npm test -w @sd/api
npm run test:e2e                   # first time: npx playwright install chromium
```

The E2E run reseeds the demo data for a fixed date (`E2E_TODAY`, default 2026-10-08) and replays
recorded LLM replies (`E2E_LLM=record` re-records them with the live provider). Run
`npm run seed` afterwards to return the demo data to today.

## Docs

[Demo script](docs/DEMO.md) · [Build Contract](docs/BUILD_CONTRACT.md) ·
[Architecture](docs/ARCHITECTURE.md) · [Decisions](docs/DECISIONS.md) ·
[Progress](docs/PROGRESS.md) · [Production gaps](docs/PRODUCTION_GAPS.md) ·
[Playbook](docs/PLAYBOOK.md) · [CLAUDE.md](CLAUDE.md)
