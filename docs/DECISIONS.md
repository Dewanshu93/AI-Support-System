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

- **Status:** Accepted (2026-10-05): tooling deps marked † approved by the project owner
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

## ADR-005 — D-1 and D-2 approved; LLM provider layer

- **Status:** Accepted by the project owner (2026-10-05, W1-09)
- **D-1 (reranker), approved:** reranking uses the fast chat model in one listwise call, combined
  with the context-sufficiency verdict (prompt P-2). No dedicated rerank provider is added.
- **D-2 (embeddings), approved:** Gemini `gemini-embedding-001` at 768 dimensions
  (`outputDimensionality`), configured in `config/models.yaml` separately from the chat
  provider. `RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY` task types are used for chunks and queries.
  Changing the model or dimension needs a full re-index, and `db:indexes` refuses a dimension
  change.
- **Provider layer (`apps/api/src/ai/llm`):**
  - LangChain `ChatGoogleGenerativeAI` for `gemini`, and `ChatOpenAI` with the OpenRouter base
    URL for `openrouter`, selected by `chat.provider` and tier (`fast` / `quality`). Switching is
    config-only.
  - SDK retries are disabled (`maxRetries: 0`). `withCallPolicy` is the single retry layer: a
    per-attempt timeout that aborts the call, then exponential backoff with jitter for timeouts,
    408/429/5xx and network errors. 4xx errors are not retried.
  - `invokeStructured` tries the provider's native structured output first and falls back once to
    a JSON-instructed plain call when native output is unsupported, does not parse, or is rejected
    with HTTP 400. Gemini rejects JSON Schema `const`, which `z.literal` produces. Timeouts, auth,
    rate-limit and server errors never fall back.
  - Token usage is captured from `usage_metadata`; cost comes from the `costs` table in
    `models.yaml`, which config validation requires for every configured model.
  - Every chat call is capped at `call.maxOutputTokens` (2048). Without a cap, OpenRouter
    reserves credit for the model maximum (65,536 tokens) and returns 402 on low-credit keys.
- **Models (verified 2026-10-05):**
  - The playbook's Gemini 2.5 models return 404 ("no longer available to new users") for this
    key, and `gemini-3.1-pro-preview` has no quota on it (429).
  - `fast` = `gemini-3.1-flash-lite`; `quality` = `gemini-3.8-flash`.
  - OpenRouter `google/gemini-3.1-flash-lite` and `google/gemini-3.8-flash` were verified in its
    catalogue and by `llm:smoke`. Chat prices come from that catalogue; the embedding price is
    still unverified.
- **Corporate TLS inspection:**
  - Node's bundled CA list does not trust the HTC proxy, and `NODE_EXTRA_CA_CERTS` can only be set
    before Node starts.
  - The api `dev`/`start` scripts and `llm:smoke` run Node with `--use-system-ca`, which trusts
    the OS certificate store, where IT installs the corporate CA. On other networks the OS store
    holds the usual public CAs, so the flag is harmless.
- **Consequences:** prompt schemas should prefer `z.enum` over `z.literal`, so the native path is
  used. If quality-tier answers are weak, a Pro model needs a paid key; that is config-only.

## ADR-006 — Ingestion pipeline choices

- **Status:** Accepted (2026-10-05, W1-10)
- **Heading splitter:** LangChain JS has no Markdown header splitter, so H2/H3 splitting is done
  in `ai/ingestion/chunker.ts`. LangChain's `RecursiveCharacterTextSplitter` handles only
  over-long prose.
- **Chunk sizes:**
  - Tokens are estimated at about 4 characters per token: deterministic and offline, because the
    tiktoken loaders fetch rank files over the network.
  - Chunks fill up to 500 tokens, with a 60-token overlap inside long sections. Tables are never
    split mid-row; an oversized table is split between rows and repeats its header.
  - The corpus policies have short sections, so chunks average 62 tokens (max 213). They fall
    below the 350–500 target because each H2 section is its own chunk, as the heading-first rule
    specifies. Merging small sections would blur citations.
- **Identity and idempotency:**
  - Document `_id` = first 12 bytes of SHA-256 of `slug@version`; chunk `_id` is derived from the
    document, content hash and ordinal.
  - `contentHash` covers metadata, the normalised body, the chunker and BM25 tokenizer versions,
    and the embedding model and dimension.
  - A document is skipped only if the hash matches, it is `indexed`, and both MongoDB and Qdrant
    hold `chunkCount` items.
- **Write order per document:**
  1. Save the record as `pending`.
  2. Replace the MongoDB chunks.
  3. Replace the Qdrant points (`wait: true`).
  4. Poll until Qdrant counts them (30 s).
  5. Mark the document `indexed`. Any failure marks it `failed` with `ingestError`.
- **Supersede sync:** runs on every ingest and is idempotent. It updates the old document
  (`status`, `supersededBy`), its MongoDB chunks and its Qdrant payloads.
- **BM25 (ADR-004):**
  - Single tokenizer in `ai/retrieval/bm25.ts`: NFKD, lowercase, alphanumeric words, a small
    stopword list, no stemming.
  - Indices are FNV-1a 32-bit hashes; values use BM25 TF saturation (k1 1.2, b 0.75, fixed
    average length 100). Qdrant applies IDF.
  - `BM25_TOKENIZER_VERSION` is part of the content hash.
- **Gemini embeddings:** `@langchain/google-genai` runs batches with `Promise.allSettled` and
  turns failures, such as free-tier 429s, into empty vectors. `StrictGeminiEmbeddings` overrides
  that method to run batches sequentially and propagate the error. `withCallPolicy` honours the
  provider's retry hint (`retryDelay`), capped at 60 s, and `npm run ingest` allows 5 retries.
- **PDF:** loading is deferred to W4-04 (the upload endpoint, the first PDF source); the loader
  rejects `.pdf` with that message.
- **Not handled yet:** a document deleted from `corpus/` stays in the stores. Removal arrives with
  the admin document status endpoint (W4-04).

- **Outcome (W1-12, 2026-10-05):** with these choices the baseline retrieval eval reached recall@5
  100% in every mode (vector, keyword, fused), with MRR 0.991 / 0.937 / 0.972 and forbidden-doc
  leakage 0 (54 cases). Small heading-level chunks did not hurt recall, so chunking stays as is.
  Revisit if the full eval (W2-10) shows answers missing context from neighbouring sections.
