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

- **Status:** Superseded by ADR-004 (2026-10-02). Atlas Search and Vector Search are no longer used, so any MongoDB 8.x works
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

## ADR-004 — Qdrant for vector and keyword (BM25) search; MongoDB for structured data

- **Status:** Accepted by the project owner (2026-10-02, W1-04 amendment)
- **Context:**
  - MongoDB Atlas cannot be reached from the development network. The HTC TLS-inspecting proxy
    resets TLS on port 27017 (certificate issuer "HTC GLOBAL SERVICES INDIA PRIV Forward Trust CA").
  - The available LAN server (192.168.29.3) is MongoDB Community 8.3.4 without mongot, so
    `$vectorSearch` and `$search` return `SearchNotEnabled`.
  - The owner chose: MongoDB for structured data, Qdrant for semantic/vector search, and Qdrant
    sparse BM25 for the keyword side of hybrid search.
- **Decision:**
  - **MongoDB** (any 8.x) stays the system of record: users, documents, chunk text and metadata,
    conversations, messages, traces, tickets, evals, audit.
  - **Qdrant** (server ≥ 1.10, `qdrant/qdrant:v1.19.1` in compose) holds one point per chunk in
    collection `chunks`:
    - named dense vector `dense`: cosine, size from `config/models.yaml`;
    - named sparse vector `bm25`: `modifier: idf`, so Qdrant computes IDF and the client supplies
      term-frequency sparse vectors;
    - payload with the access-filter fields (`countries`, `employmentTypes`, `accessLevel`,
      `status`, `domain`) and `documentId`, all keyword-indexed.
  - Point ID = the chunk's ObjectId zero-padded into a UUID (`chunkPointId`), so there is no
    lookup table.
  - Hybrid retrieval (W1-11) runs a dense query and a BM25 query, each with the same payload
    pre-filter, and fuses them with Reciprocal Rank Fusion in application code (D-4 unchanged), so
    vector-only, keyword-only and fused recall can still be measured separately.
  - Permission enforcement stays three-layered: the Qdrant payload filter, `assertAccessible` in
    code, and the re-check on source view. The LLM never decides access.
  - `npm run db:indexes` creates the Mongo indexes and the Qdrant collection and payload indexes
    idempotently. It refuses a dense-size change or missing sparse vector (re-index needed, D-2).
  - `/api/health` adds an optional `vectorStore: up|down` field. The API boots without Qdrant and
    reports `degraded`.
  - New dependency: `@qdrant/js-client-rest` 1.19.0 (official client). Whether retrieval goes
    through LangChain's Qdrant integration or the client directly is decided in W1-11.
- **Deviations approved:**
  - From the mandatory stack: Atlas Vector Search and Atlas Search are replaced by Qdrant.
  - From playbook section 14 (Do Not Build): "separate vector database" is excepted for Qdrant
    only.
  - D-3 (atlas-local) is superseded.
- **Alternatives:**
  - Atlas Local on the LAN PC (keeps the playbook stack; needs Docker there).
  - Atlas cloud (blocked on this network).
  - MongoDB `$text` for keyword search (rejected by the owner in favour of BM25 in Qdrant).
- **Consequences:**
  - Two stores must stay consistent. Ingestion writes the Mongo chunk, then upserts the Qdrant
    point. Any document status or audience change must re-sync both the Mongo chunk metadata and
    the Qdrant payload.
  - Deleting or re-indexing a document deletes its points by `documentId` filter.
  - BM25 tokenisation (W1-10/W1-11) must be identical at ingest and query time and covered by unit
    tests.
  - Another service to run: compose gains `qdrant`, and the LAN PC needs
    `docker run -p 6333:6333 qdrant/qdrant:v1.19.1`.
