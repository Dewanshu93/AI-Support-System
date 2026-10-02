# Architecture Decision Records

Format: context · decision · alternatives · consequences. Numbering follows the playbook
(ADR-003 is reserved for atlas-local in W1-04).

## ADR-001 — Mandatory stack replaces the contract's recommended stack

- **Status:** Accepted (2026-10-02, W1-01)
- **Context:** The Build Contract recommended FastAPI, PostgreSQL + pgvector, a hand-written state
  machine and a single LLM provider, and allowed substitution. The mandatory stack is
  TypeScript end to end.
- **Decision:**

  | Contract said                     | Now                                                | Consequence                                                          |
  | --------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
  | FastAPI (Python)                  | Node.js + Express + TypeScript                     | AI, evals and API in one language                                    |
  | PostgreSQL + pgvector + full-text | MongoDB Atlas + Atlas Vector Search + Atlas Search | Hybrid search = `$vectorSearch` + `$search`, fused (RRF) in code     |
  | Deterministic state machine       | LangGraph `StateGraph`                             | Same design as nodes + deterministic conditional edges               |
  | Single LLM provider               | Gemini or OpenRouter via config                    | LangChain provider factory; provider-neutral prompts                 |
  | Docker Compose: web, api, db      | Docker Compose: web, api, `mongodb-atlas-local`    | Local image provides Search + Vector Search; Atlas cloud as fallback |

  Constraints kept from the contract: one graph (no multi-agent), the LLM is never bound to tools,
  retrieval and ticket creation are graph-owned nodes, ticket creation only after a resumed
  `interrupt()`, state persisted with a MongoDB checkpointer (`thread_id` = conversation ID).
  Frontend: Next.js App Router + Tailwind. Tests: Jest + ts-jest, Supertest, Playwright.

- **Alternatives:** the contract's recommended stack (rejected: mandatory stack is given).
- **Consequences:** D-1 – D-5 (reranker, embeddings, local DB, fusion, DB access) need approval
  before week 2; defaults are assumed until then.

## ADR-002 — Toolchain versions and module format

- **Status:** Proposed (2026-10-02, W1-01) — tooling deps marked † need approval
- **Context:** Versions checked against the npm registry at install time. `typescript@latest` is
  7.0 (native compiler), but ts-jest 29.4 requires `typescript <7` and typescript-eslint 8.71
  requires `<6.1`.
- **Decision:**
  - TypeScript pinned to **6.0.3** across the repo.
  - api and shared are **CommonJS** (`module`/`moduleResolution: nodenext`, `"type": "commonjs"`),
    so Jest + ts-jest run without experimental ESM flags. Web uses Next's bundler resolution.
  - `@sd/shared` is consumed as built output (`dist/`) via TS project references; Jest maps it to
    source so unit tests never depend on a stale build.
  - Exact versions pinned in package.json; lockfile committed: next 16.3.8, react 19.3.0,
    tailwindcss 4.3.3, express 5.2.1, jest 30.5.2, ts-jest 29.4.14, supertest 7.3.0,
    @playwright/test 1.63.0, eslint 10.11.0, prettier 3.9.9.
  - Tooling outside the approved list †: `typescript-eslint` (ESLint cannot parse TS without it),
    `@eslint/js` and `globals` (ESLint flat-config base), `@next/eslint-plugin-next` (Next 16
    removed `next lint`), `@tailwindcss/postcss` (Tailwind v4's PostCSS integration), `tsx` (api
    dev watch runner; replaceable with `tsc -b -w` + `node --watch` if rejected), `@types/*`.
- **Alternatives:** TS 7 (blocked by ts-jest/typescript-eslint); ESM api (needs Jest experimental
  VM modules).
- **Consequences:** Revisit when ts-jest and typescript-eslint support TS 7.

## ADR-003 — mongodb-atlas-local for development and integration tests (D-3)

- **Status:** Accepted as the playbook default (2026-10-02, W1-04); D-3 approval pending
- **Context:** Retrieval needs `$vectorSearch` and `$search`. Plain `mongod` and in-memory test
  servers do not support them, so a test environment without them can't validate retrieval.
- **Decision:**
  - `docker-compose.yml` runs `mongodb/mongodb-atlas-local:8.0` as `mongodb`; the API uses
    `mongodb://mongodb:27017/servicedesk?directConnection=true`.
  - Integration tests run only when `MONGODB_TEST_URI` points at an Atlas-capable server
    (atlas-local or an Atlas free-tier cluster). Each run creates and drops its own
    `servicedesk_test_<random>` database.
  - `npm run db:indexes` is idempotent. It creates collections, regular indexes and the
    `chunks_vector` / `chunks_text` search indexes, then waits until they are queryable.
  - Search index definitions are compared by name. A vector dimension that differs from
    `config/models.yaml` is refused with re-index instructions (D-2), never silently rebuilt.
  - Data access uses the official driver (`mongodb` 7.7.0) plus Zod schemas, with no Mongoose
    (D-5).
- **Alternatives:** Atlas cloud only (needs network and an account for every developer and test
  run); plain MongoDB plus a separate vector DB (violates Do Not Build).
- **Consequences:** CI or developers need Docker, or an Atlas URI, to run integration tests. On
  this development machine neither is available yet, so the W1-04 acceptance run is pending.
