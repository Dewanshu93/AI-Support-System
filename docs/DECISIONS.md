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

## ADR-007 — LangGraph checkpointer package and state naming (W2-02)

- **Status:** Accepted (2026-10-05)
- **Context:** W2-02 needs LangGraph (mandatory stack) and "the MongoDB checkpointer package"
  (playbook section 3). `@langchain/langgraph-checkpoint-mongodb@1.4.1` depends on
  `mongodb@^6.21`, but the app uses `mongodb@7.7.0`. Separately, LangGraph refuses a state
  channel with the same name as a node, and section 5 uses `precheck` for both.
- **Decision:**
  - Install `@langchain/langgraph@1.4.19` and `@langchain/langgraph-checkpoint-mongodb@1.4.1`
    (exact versions).
  - Pass our v7 `MongoClient` to `MongoDBSaver`, cast at one place (`ai/graph/checkpointer.ts`).
    The saver only calls `client.db()`, `collection().find/updateOne/bulkWrite/deleteMany/createIndex`
    and `Binary.value()`. The v7 driver provides all of these, and the nested mongodb 6 copy is
    never used for checkpoints. This is proven by an integration test against the LAN MongoDB
    8.3: a draft paused by `interrupt()` resumes in a fresh graph instance.
  - Checkpoint collections are named `graph_checkpoints` / `graph_checkpoint_writes`
    (package-owned, never touched by app code).
  - The state key for precheck output is `precheckResult`; node names stay as in section 5,
    because they appear in SSE status events.
- **Alternatives:** our own `BaseCheckpointSaver` on the v7 driver (about 150 lines to maintain);
  downgrading the app to mongodb 6 (loses the 8.3 handshake fix).
- **Consequences:** two driver copies in `node_modules`. Revisit when the package moves to
  mongodb 7: drop the cast and re-run the integration test.

## ADR-008 — Answer withdrawal on numeric mismatch; stream retry boundary (W2-06)

- **Status:** Accepted (2026-10-06)
- **Context:**
  - Section 5 withdraws an answer with zero valid citations. W2-06 adds a numeric check
    ("numbers in answer must appear in cited chunks") but does not say what a violation does.
  - Separately, a live run showed `gemini-3.8-flash` failing with 503 "high demand" before
    streaming any token, which section 5's "stream failure → error" would turn into a failed
    turn.
- **Decision:**
  - **A numeric violation also withdraws the answer** (`withdrawnReason: NUMERIC_MISMATCH`).
    P-3 must copy numbers exactly, and an invented leave figure, limit or amount is the most
    harmful error this product can make. Only numbers from the chunks the answer **cites**
    count, and only digits are checked.
  - **Streaming retries happen only before the first chunk:** the stream opening and the first
    chunk run inside `withCallPolicy` (same timeout, backoff and provider retry hints as other
    calls). After the first chunk, a failure is an error event and is never retried, because the
    employee has already seen text.
- **Alternatives:**
  - Strip unsupported numbers or sentences instead of withdrawing (risks a misleading
    half-answer).
  - Only flag numeric violations (lets wrong numbers through).
  - Retry mid-stream (duplicates or contradicts text already shown).
- **Consequences:** a correct answer that paraphrases a number ("twenty-five days" in the source,
  "25" in the answer) is withdrawn. Measure the withdrawal rate in the full eval (W2-10) and
  relax the rule only with evidence.

## ADR-009 — Out-of-scope turns skip retrieval (W2-07)

- **Status:** Accepted (2026-10-06)
- **Context:** W2-07's acceptance criterion requires that out-of-scope replies make no
  generation call beyond P-1. Section 5's node sequence sends every non-sensitive,
  non-ticket turn through retrieve → rerankAssess (P-2) → decide, so an out-of-scope turn
  would still embed the query and call P-2.
- **Decision:** `routeAfterAnalysis` gains a branch: `analysis.intent = out_of_scope` → `decide`.
  The order is: sensitive → sensitiveHandoff; active ticket flow or forceEscalate → slotFill;
  out of scope → decide; otherwise → retrieve. `decide` still records OUT_OF_SCOPE /
  OUT_OF_SCOPE through rule 2, so the decision record and the evals are unchanged.
- **Alternatives:** keep section 5's sequence and accept the P-2 call (fails the acceptance
  criterion); or route directly to `outOfScope` (no recorded decision, bypasses the rules
  table).
- **Consequences:** out-of-scope turns are faster and cheaper (no embedding, no search, no P-2).
  If P-1 wrongly marks an in-scope question as out of scope, no retrieval evidence can override
  it. The decision eval (W2-10) measures this.

## ADR-010 — In-process turn lock (W2-08)

- **Status:** Accepted (2026-10-06)
- **Context:** Section 4 requires 409 when a turn is already running in a conversation. The
  prototype runs a single API process, and Redis and job queues are on the Do Not Build list.
- **Decision:** a `Set` of running conversation IDs inside the turn runner (one per app). It is
  checked and taken before the user message is stored, and released when the turn ends,
  successfully or not. The pending-draft 409 is read from the graph checkpoint, so it holds
  across restarts.
- **Alternatives:** a MongoDB lease document with an expiry (survives restarts, works with
  several processes; more code and stale-lease handling).
- **Consequences:** with more than one API process, two turns in the same conversation could run
  at once. Production needs a shared lock (for example a MongoDB lease or a unique "running"
  marker on the conversation); recorded in PRODUCTION_GAPS.md.

## ADR-011 — Build Contract missing: the playbook is the working reference

- **Status:** Superseded (2026-10-06) by `docs/BUILD_CONTRACT.md` v1.0, written by the owner at the manager's request (approval pending). Kept for history.
- **Context:** `docs/BUILD_CONTRACT.md` is a placeholder; the owner does not have the approved
  contract. The playbook quotes or summarises parts of it (flows 1–9, section Q corpus rules,
  section S targets, NFR-1–NFR-3), but not all of the text.
- **Decision:** build against the playbook's summaries and list every assumption here, so one
  person can confirm them in place of the missing document. No replacement contract is
  written: the contract is meant to be the approved original.
- **Assumptions to confirm:**
  - **Flows** (inferred from task cards and checkpoints):
    1. Policy question → cited, profile-specific answer; source drawer; resolution; feedback.
    2. Partial answer that states what is not covered; "not resolved" → escalation offer.
    3. Ambiguous question → one clarifying question → answer.
    4. Escalation → ticket draft reviewed, edited and confirmed by the employee (W3).
    5. Duplicate ticket prompt: same issue → link or create new (W3).
    6. Sensitive topic → private HR contact offer → restricted HR case on "Yes" (offer step
       built in W2; case creation W3-03).
    7. Out-of-scope question → templated reply.
    8. Agent works a ticket: queue, AI summary, draft reply, status, reclassification (W3).
    9. Admin: metrics, knowledge gaps, traces, documents, evaluations (W4).
  - **Section S targets** (playbook section 8): retrieval recall@5 ≥ 85% (week-1 gate 75%);
    forbidden-doc leakage 0; decision accuracy ≥ 85%; sensitive 100%; out-of-scope ≥ 90%;
    citation validity 100%; category ≥ 90%; field accuracy ≥ 85%; invented values 0; priority
    floor 100%; injection resistance 100%; groundedness ≥ 90%; key facts ≥ 90%. Hard gates:
    sensitive, leakage, citation validity, injection.
  - **NFR-1–NFR-3:** values not available. Latency and cost are measured and reported
    (p50/p90 TTFT and total, USD per case); thresholds are set when known (W4-09).
  - **Corpus rules (section Q):** as implemented in W1-07 (synthetic US/UK, full-time and
    contractor, versioned documents with superseded traps).
- **Consequences:** if the approved contract appears later, compare it against this list and
  fix any differences; until the owner confirms the list, a mismatch may only show at final
  acceptance.

## ADR-012 — Ticket status transitions (W3-01)

- **Status:** Accepted (2026-10-06)
- **Context:** The playbook and the Build Contract name five statuses (new, in_progress,
  waiting_on_employee, resolved, closed) and require a state machine, but do not list the
  allowed transitions.
- **Decision** (`domain/ticketStateMachine.ts`):

  | From                | Allowed to                                 |
  | ------------------- | ------------------------------------------ |
  | new                 | in_progress, waiting_on_employee, resolved |
  | in_progress         | waiting_on_employee, resolved              |
  | waiting_on_employee | in_progress, resolved                      |
  | resolved            | closed, in_progress (reopen)               |
  | closed              | none (final)                               |

  No status returns to `new`, and nothing transitions to itself. Any other change gets 409.
  "Open" (duplicate check, queues) means new, in_progress or waiting_on_employee.

- **Alternatives:** allow any change (no audit value); also allow resolved → waiting_on_employee
  (reopen covers it).
- **Consequences:** an agent cannot close an unresolved ticket directly. If that is needed, add
  it as a contract amendment.

## ADR-013 — Confidential HR cases: one-click "Yes" through the draft confirm, and their priority (W3-03)

- **Status:** Accepted (2026-10-06)
- **Context:** Contract flow 6 requires a restricted HR case when the employee says "Yes" to
  private contact, with no AI extraction and no AI advice. The playbook does not say which
  endpoint "Yes" calls, nor the priority of such a case (there is no AI urgency).
- **Decision:**
  - `sensitiveHandoff` attaches a restricted `TicketDraft` (category `employee_relations`,
    queue `hr_case`, template summary and description, no fields, no transcript). The graph
    pauses as for any draft, and "Yes" is `POST …/ticket-draft/confirm`; "No thanks" is cancel.
    No new endpoint is needed, and the contract's confirmation rule is the same for every ticket.
  - Priority: **critical** when the precheck matched the `wellbeing` rule (self-harm or
    crisis language), otherwise **high**.
- **Alternatives:** a dedicated `POST …/private-contact` endpoint (duplicates the confirm path);
  a fixed medium priority (too low for crisis language).
- **Consequences:** after a sensitive handoff, the conversation takes no new messages until the
  employee answers Yes or No (the same 409 rule as any pending draft). The W3-04 UI must show
  both buttons on the handoff card.

## ADR-014 — Agent queue order, scope errors and correction rules (W3-05)

- **Status:** Accepted (2026-10-07)
- **Context:** The queue must be sorted "priority desc, then createdAt asc", but `priority` is a
  string, so a database sort is alphabetical (noted at W1-04). The playbook also leaves open what
  an agent gets for a ticket outside their queues, and whether a restricted case can be
  re-categorised.
- **Decision:**
  - Sort on a severity rank computed in the aggregation (`$indexOfArray` over `PRIORITIES`),
    with the cursor carrying (rank, createdAt, id). No stored `priorityRank` field, so no
    migration or backfill and no second place to keep in sync. At prototype scale the in-query
    sort is cheap; a stored, indexed rank is the production option.
  - A ticket outside the agent's scope is **404** on every per-ticket endpoint (as for employees),
    so its existence is not revealed; only an explicit `?queue=` for another queue is 403, as the
    playbook specifies.
  - Classification corrections are **internal** events (the employee's timeline shows only
    replies and status changes); status changes are **public**.
  - A restricted case **keeps its category** (400 `restricted_category`); its priority can still
    be corrected. It must never leave the confidential queue through a re-route.
  - Updates are guarded by `updatedAt` (409 if another agent changed the ticket first).
- **Consequences:** a re-categorised ticket keeps its human ID (an IT ticket moved to HR stays
  `IT-…`). An agent loses sight of a ticket they re-route out of their queues.

## ADR-015 — Pivot to Use Case 1: Employee Unified AI Gateway (Build Contract v2.0)

- **Status:** Accepted by the owner (2026-10-07); Build Contract v2.0 awaits manager approval
- **Context:** The project brief is "Use Case 1: Employee Unified AI Gateway & Resolution Hub"
  (timesheets, payroll investigation, policy Q&A, escalation with email drafts, request tracking,
  dashboard). The playbook and Build Contract v1.0 described a narrower IT/HR service desk with a
  heavy agent/admin/evaluation scope. About 60% of the built work (auth, MongoDB + Qdrant, RAG
  with citations, the LangGraph pipeline with `interrupt()` confirmation, ticket rules, chat UI
  with SSE, audit log) is reused unchanged.
- **Decision:**
  - The Build Contract is rewritten as v2.0 for Use Case 1. The remaining v1.0 tasks W3-06 to
    W4-10 are **deferred, decision pending** (not cut); W4-10's E2E/README/demo work is folded
    into UC-10.
  - The brief's "specialised agents" (HR, Payroll, Action, IT, Escalation) are **branches of the
    one StateGraph**, chosen by deterministic edges from the P-1 intent. No multi-agent design.
  - The brief's "tool calling" is implemented as **model proposes, code executes**: the model
    returns a Zod-validated action proposal; code resolves dates, validates against the
    employee's own data, shows a confirmation card (`interrupt()`), and calls the service only on
    confirm. No tools are bound to the LLM. This keeps the "AI proposes, code decides" rule and
    makes every action testable without a model.
  - Mock internal systems (tasks, timesheets, attendance, payroll) are MongoDB collections with
    module APIs, seeded deterministically. LOP is modelled as a payroll deduction line linked to
    dates; the LOP policy applies to all countries' full-time employees (personas are US/UK).
  - Email: an `email_outbox` collection; delivery is mock by default, Nodemailer behind a config
    switch (needs approval as a dependency and network access).
  - In-app notifications are allowed (collection + dashboard list); push/email notifications are
    not.
  - UI stays Tailwind (Next.js is React); Material UI/Bootstrap from the brief are not adopted.
  - New prompts beyond P-1–P-9 (timesheet extraction, payroll explanation, email draft) are
    approved as part of this pivot, each with a schema, a versioned file and a trace.
- **Alternatives:** keep v1.0 and add timesheets later (delays the brief's core scenario); start
  over with a plain React + agent-with-tools design (throws away tested, working foundations and
  the safety properties).
- **Consequences:** CLAUDE.md "Do Not Build" is updated. The golden set gains cases for the new
  intents. Tracker labels are a configuration mapping over the existing ticket state machine, so
  ADR-012 stays valid.

## ADR-016 — Copilot agents as LangGraph subgraphs of the one orchestrator (UC-04)

- **Status:** Accepted by the owner (2026-10-07: "subgraphs")
- **Context:** The Use Case 1 brief describes an intent router and specialised agents (HR, IT,
  Payroll, Action, Escalation). CLAUDE.md forbids multi-agent designs and LLM-chosen routing.
  The owner chose named subgraphs over plain branches so the agents are visible in the
  architecture and traces.
- **Decision:**
  - `supportTurnGraph` stays the one orchestrator `StateGraph`. After `analyzeTurn`, code
    (`routeAfterAnalysis`) hands the turn to one compiled subgraph: `knowledgeAgent` (the
    existing policy RAG pipeline; HR and IT share it because their pipeline is identical),
    `escalationAgent` (ticket drafts), `timesheetAgent`, `requestsAgent`; `payrollAgent` follows
    in UC-06. Sensitive turns never reach an agent. Persist, confirmation (`interrupt()`) and
    ticket creation stay in the orchestrator.
  - Subgraphs share `GraphState` and keep their node names, so traces, `streamEvents`
    (`langgraph_node`) and path tests are unchanged.
  - A subgraph returns its full state, including the trace it was given; the trace reducer
    detects such a snapshot (strictly longer, existing lists as prefixes) and merges it instead
    of appending, so no step is recorded twice.
  - P-1 v2 adds `workspaceIntent` (none, timesheet_log, timesheet_status, payroll_explain,
    request_status). It is optional in the schema, so v1 output still validates and routes to
    the knowledge agent.
  - Records agents answer with code-built text from the employee's own data (no LLM call) and
    record ANSWER with reason codes `RECORDS_TIMESHEET` / `RECORDS_REQUESTS`.
- **Alternatives:** plain branch nodes (same behaviour, less visible structure); a supervisor LLM
  choosing agents (forbidden: non-deterministic routing); tools bound to the model (forbidden).
- **Consequences:** a new agent is a subgraph plus one case in `routeAfterAnalysis`. The Mermaid
  export uses `xray` to show agent internals.

## ADR-017 — Escalation email: code-built draft, confirm-then-send, mock outbox (UC-07)

- **Status:** Accepted by the owner (2026-10-08)
- **Context:** Build Contract v2.0 flow 6 and section H: escalations come with an AI-drafted email
  the employee can edit, send or cancel; sent emails are stored in an outbox, linked to the
  request and shown in the UI; delivery is mock by default. P-1 v2 is not active and the Gemini
  quality tier has no free quota, so no new prompt can be evaluated now. Chosen by a judge-panel
  design workflow (3 designs, 3 judges, synthesis).
- **Decision:**
  - The email is an optional `draft.email` on the existing ticket draft, so it travels with the
    draft (SSE `ticket_draft`, `pendingDraft`, message snapshot) and the same confirm/cancel.
  - **Code builds the email** (`domain/escalationEmail.ts`): recipient and sender, greeting,
    "System information" (employee, request, fields, and for payroll the exact payslip and Loss of
    Pay lines from the records), "Action taken", request line and sign-off. The only model text is
    P-5's summary and description; any digit sequence the employee never typed sends them back to
    the employee's own (redacted) words. **No new LLM call**; a P-12 prose prompt is a follow-up.
  - Sending is a new code-only graph node, **`sendEmail`**, after `createTicket`: it recomputes the
    recipient from the ticket's queue, records the confirmed text once (`email_outbox`, unique per
    conversation, `$setOnInsert`), delivers through the transport, writes one public `email_sent`
    event and a system note without the subject or body. A crash resumes at `sendEmail`.
  - The employee may edit the **whole** subject and body; the AI draft and `edited` flags are kept.
  - **Payroll queue:** new `hr_payroll` ("Payroll", payroll@example.com), handled by Hana; the
    confidential `hr_case` queue can never have an address (config cross-check and schema refine).
  - New module `apps/api/src/modules/email/` and collection `email_outbox` (approved).
    `EMAIL_DELIVERY=mock` (default) records only; `smtp` refuses to start until Nodemailer is
    approved.
- **Alternatives:** a separate email endpoint and card (more churn, a second confirmation); a model-
  written email (figures and privacy risk, needs evaluation); a locked system-information block.
- **Consequences:** payroll tickets route to Payroll (existing database tickets stay where they
  are; re-seed for Hana's queues). Confirm-path node sequences gain `sendEmail`.

## ADR-018 — LLM provider fallback chain, local Ollama model and a development reply cache

- **Status:** Accepted by the owner (2026-10-08)
- **Context:** development kept stopping on provider limits: the Gemini free tier runs out daily
  (the quality model first) and the OpenRouter key is out of credit. The project is a skills
  showcase, not a production system, so a free local model is an acceptable last resort.
- **Decision:**
  - **Fallback chain (API server only).** Each chat call goes through `FallbackChatModel`
    (`ai/llm/fallback.ts`), which tries, in order: the main provider's model for the tier, its
    fast model (quality calls), then the same for each provider in `chat.fallbacks`
    (`config/models.yaml`; default `[openrouter, ollama]`). Providers without their key or URL are
    left out.
  - It moves on only for **provider limits and outages** (`cooldownFor`, `ai/llm/providerHealth.ts`):
    429 (a per-day quota sets the model aside for at least an hour; per-minute limits for the
    provider's hint or a minute), 402 and 401/403 (the whole provider, an hour), 5xx and an
    unreachable server (30 s). A 400, invalid output, a timeout or an abort never changes model,
    so invokeStructured's JSON fallback and the node retry rules behave as before.
  - Cooldowns live in one in-process `ProviderHealth`: set-aside models go to the back of the
    order (never dropped). A stream falls back only before its first chunk.
  - The reply is stamped with the model that answered (`answeredBy`); traces and cost use it.
  - **Ollama** is a third chat provider through its OpenAI-compatible API (`ChatOpenAI`,
    `OLLAMA_BASE_URL`), so **no new dependency**. Default model `qwen2.5:3b` (CPU-friendly), cost 0.
    _Amended 2026-10-12 (owner):_ the model is `dolphin3:latest` (Llama 3.1 8B) on the LAN host
    (`192.168.29.3:11434`), the one installed there; measured about 14 s warm for a short prompt
    and about 2 min on first load, so Ollama gets its own per-attempt budget
    (`call.providerTimeoutMs.ollama: 120000`) while the hosted models keep 30 s.
  - **`LLM_MODE=cache`** (development): serves a saved reply for an identical prompt, otherwise
    calls the chain and saves the reply to `.llm-cache/replies.json` (git-ignored). Failures are
    not saved, except a schema rejection (HTTP 400), which would recur.
  - **Not covered:** embeddings stay on Gemini (the Qdrant index is Gemini 768-dimension; another
    model means a re-index). Evals, `llm:smoke` and E2E recording (`LLM_MODE=record`) use the
    configured provider only, so their numbers and fixtures never mix in a fallback model.
- **Alternatives:** LangChain `withFallbacks()` (no cooldown memory: every call pays the failed
  attempt; loses the model identity for traces); a paid key only (blocked on approval); a local
  model as the main provider (too slow and unreliable on this PC: 8 GB RAM, no GPU).
- **Consequences:** a demo keeps answering when quotas run out, at lower quality when Ollama
  answers; traces show which model answered. Cached replies hide prompt changes only when the
  prompt text is identical (the key is the full rendered prompt). Delete `.llm-cache/` to clear it.

## ADR-019 — Agent AI assistance: P-6 brief after creation, P-7 draft on demand (W3-06)

- **Status:** Accepted by the owner (2026-10-08: W3-06/W3-07 brought back from the deferred list;
  P-6 on the fast tier)
- **Context:** agents read a ticket cold. The playbook gives P-6 (`agent_ticket_summary`, after
  ticket creation) and P-7 (`agent_draft_reply`, on demand). Build Contract v2.0 adds rules that
  shape them: nothing is created or sent without the employee confirming the exact content
  shown (E.4), and sensitive topics bypass the AI (E.6).
- **Decision:**
  - **P-6** runs in the graph after `createTicket → sendEmail` (`agentSummary` node, fast tier).
    It writes `agentBrief` and a new `ticket.agentAssist` (`status` generated / fallback / skipped,
    `headline`, `firstChecks` ≤ 3, `promptRef`). **The ticket's `summary` stays the one the
    employee confirmed**; P-6's one-line summary is the agent-facing `headline`. The transcript
    is redacted (`redactPII`) before the call. A model failure never fails the confirm: the brief
    stays the employee's description and `agentAssist.status` is `fallback` (trace flag
    `AGENT_SUMMARY_FALLBACK`). Confidential cases (`restricted`) get no model call (`skipped`). Only
    the ticket this conversation created is summarised (a "same issue" link is left as it was).
  - **P-7** is `POST /api/agent/tickets/:id/draft-reply` (`{ tone?: standard | brief }`), outside
    the turn graph. The model sees the ticket (requester first name, never contact details), the
    agent brief and the policy passages cited in the conversation (≤ 5). Code keeps only cited
    document IDs that were given. Each draft is an internal `ai_draft_generated` event with the
    LLM call (`llmCall`) and an audit entry (`ticket.ai_draft`). It is **never sent**: the agent
    sends their own reply (`usedAiDraft` on that audit entry). 503 `LLM_UNAVAILABLE` when the model
    fails or none is configured; **409 for confidential cases** (no AI on sensitive topics; the
    playbook lists only 404/503).
  - Folder boundaries: the model call is `ai/nodes/draftReply.ts` (`createDraftReply`), injected
    into `modules/agent/draftReply.ts` as `AppDeps.agentDraft`, so modules never import `ai/llm`
    (the playbook names `modules/agent/draftReply.ts` for the whole feature).
  - P-7 also runs on the fast tier (quality quota), temperature 0.2.
- **Consequences:** agents get a brief and first checks on every new non-confidential ticket, and
  a cited draft to edit. The employee's confirmed text is never rewritten. A confirm takes one
  more fast-tier call (a few seconds), bounded by the call policy.

## ADR-020 — Per-user "Pro" models switch: paid models on, local model off

- **Status:** Accepted by the owner (2026-10-12)
- **Context:** paid quotas ran out repeatedly during development and testing. The owner wants
  paid models (Gemini, OpenRouter) used only when a user turns "Pro" on, and the local Ollama
  model otherwise, with tests making no paid calls.
- **Decision:**
  - **Per user, saved on the account:** `users.proModels` (absent = off; never seeded, so a reseed
    keeps it). `PATCH /api/profiles/me/preferences` `{ proModels }` (any signed-in role, own
    record only, audited as `user.preferences`); `AuthUser.proModels` exposes it.
  - **Per request, not per node:** after authentication, `withModelMode` runs the request in an
    `AsyncLocalStorage` context (`ai/llm/modelMode.ts`). The server's model factory reads
    `currentModelMode()`: `local` → `createLocalChatModel` (Ollama only, its own time budget);
    `pro` → the ADR-018 chain (Gemini → OpenRouter → Ollama as last resort). So every LLM call made
    for that user follows the switch — copilot turns, the P-6 brief after their confirm, P-7
    drafts — and no graph node changed. Outside a request (scripts) the mode is `local`.
  - **Recording (E2E, `LLM_MODE=record`):** one model per mode (no fallback), so fixtures name the
    model that produced them; E2E users have Pro off, so recording uses Ollama. Replay makes no
    LLM calls. Evals and `llm:smoke` keep using the configured models.
  - **UI:** a labelled "Pro" switch (`role="switch"`) in the Copilot page header with a tooltip
    and screen-reader text naming the models; it loads the setting from `GET /api/auth/me` and
    saves it immediately (optimistic, reverted on failure).
- **Not covered:** query embeddings for policy search stay on Gemini in both modes (the Qdrant
  index is Gemini 768-dimension; a local embedding model means a re-index, ADR-018). Agents have
  no Copilot page yet, so their P-7 drafts use their own saved setting (off unless set via the API).
- **Consequences:** Pro off is free but slower (the local 8B model on CPU: seconds per call, about
  2 min on first load) and less precise; Pro on is fast but uses paid quota.

## ADR-021 — Light / dark theme by remapping the palette, not per-component `dark:` classes

- **Status:** Accepted (owner request, 2026-10-13)
- **Context:** the owner asked for dark and light modes across the whole application, with the
  control placed per common UX practice. About 600 colour utilities are spread over ~35
  components; adding a `dark:` twin to each would double the class strings and every new
  component would have to remember them.
- **Decision:**
  - **One place:** `globals.css` defines a `.dark` block on `<html>` that remaps the palette
    variables Tailwind utilities read: the slate ramp is inverted (text-slate-900 becomes
    near-white, bg-slate-50 a raised dark panel), each accent hue's tints (50–300) become dim
    washes and its dark text shades (700–950) become light ones; saturated fills (400–600) keep
    their value so white text on buttons and badges stays legible. Mid-tone accent text
    (`text-*-500/600`) is lifted one step. `@custom-variant dark` exists for the few exceptions.
  - **Semantic tokens** where a fixed colour carried meaning: `bg-surface` (cards, panels; was
    `bg-white`), `bg-ink`/`text-on-ink`/`ink-hover` (primary button, selected toggles). Literal
    `white` keeps meaning white (text on coloured fills).
  - **Preference:** Light, Dark or System (default), per browser in `localStorage` (`theme`),
    not on the account: it is a display setting and must apply on the sign-in page too. An inline
    script in `<head>` (`THEME_INIT_SCRIPT`, `lib/theme.ts`) sets the class before first paint,
    so there is no light flash; "System" follows OS changes live.
  - **Placement:** a sun/moon icon button in the top bar, left of the notification bell, opening a
    three-option menu (`menuitemradio`); top-right on the sign-in page.
- **Consequences:** new components get dark mode for free if they use the palette and `bg-surface`
  instead of `bg-white`. A raw hex colour in a component (only project colours from data today)
  does not adapt. Contrast was checked by screenshots of the main pages, not an automated audit.

## ADR-022 — Document upload: pdf-parse directly, originals kept under data/uploads

- **Status:** Accepted (W4-04, 2026-10-14)
- **Context:** the admin upload (playbook section 4) takes Markdown or PDF up to 5 MB and must
  reuse the ingestion pipeline; re-index must rebuild a document from its source. Multipart
  parsing and PDF text extraction are new needs.
- **Decision:**
  - `multer` (approved list) parses the multipart request into memory, capped at 5 MB.
  - PDF text comes from `pdf-parse` 2.x, the PDF parsing dependency the approved LangChain PDF
    loader uses, called directly (`ai/ingestion/loaders.ts extractPdfText`) instead of adding all
    of `@langchain/community` for one loader. Text is chunked like Markdown without headings.
  - The original file is written to `data/uploads/<slug>@<version>.<ext>` (git-ignored) and
    becomes the document's `sourcePath`; corpus documents keep `corpus/...`. Re-index reads
    `sourcePath` and rebuilds with the stored metadata (`force` skips the up-to-date check) and
    keeps the stored supersede link.
  - Code enforces: type and size; metadata with the shared Zod schema; one active version per
    slug (an upload must name the active version it supersedes, an activation 409s if another is
    active); `supersedes` must exist and be lower.
- **Consequences:** uploads live on the API host's disk (fine for the single-instance prototype;
  production would use object storage, see PRODUCTION_GAPS). PDFs with scanned pages and no text
  layer index as empty and are rejected ("contains no text").

## ADR-023 — Eval runs from the admin UI: the eval CLI as a child process, models by Pro switch

- **Status:** Accepted (W4-05, 2026-10-14; owner decisions on models and the E2E smoke)
- **Context:** the playbook asks for an in-process background job around the runner. The runner
  lives in `evals/runner` (run with tsx, importing the API's code); the API package builds only
  `src/`, so it cannot import the runner back without restructuring the build. A full run takes
  minutes to hours and must not block the API.
- **Decision:**
  - The API queues the run (`eval_runs`, `queued`) and starts the existing CLI as a child process
    with `--run-id` (attach to the queued run) and `--model-mode`; one run at a time, enforced on
    the stored status. The same runner and collections serve `npm run eval` (`triggeredBy: cli`).
  - Models follow the starting admin's Pro switch (owner decision): `pro` = the configured chain,
    `local` = Ollama only (concurrency 1, P-2 skipped in the graph like the API). Query embeddings
    stay Gemini (the index is Gemini).
  - The runner honours `LLM_MODE` like the API. The E2E smoke run (tag `smoke`, 3 retrieval cases)
    was recorded once (owner decision) and replays with no provider call; recorded / replayed runs
    write their Markdown reports to the temp folder, not `evals/reports/`.
- **Consequences:** progress is per case (`completedCases`), not per step. A run's process is
  not cancellable from the UI (stop the API to stop it; the run is then marked interrupted).
  Deviation: child process instead of in-process, for the reason above.

## ADR-024 — "Needs your attention": payroll cutoff in code, panel only (UC-12)

- **Status:** Accepted (UC-12, 2026-10-20; owner decisions on scope, amount and amendment)
- **Context:** UC-12 warns employees before a day becomes Loss of Pay. The cutoff rule existed only
  in the policy text (corpus `hr-loss-of-pay`: "5 working days after that day"; LOP when there is
  no timesheet entry and no attendance record, or the employee was absent). Salary is not stored
  on the user (only the seed has it). A copilot question "What should I do today?" needs a new
  P-1 intent, hence a new prompt version and a full eval run.
- **Decision:**
  - The rule is code (`domain/attention.ts`) with its numbers in `config/workday.yaml`
    (`payroll.cutoffWorkingDays: 5`, `payroll.urgentWithinWorkingDays: 2`). The cutoff is the
    5th working day after the day, in the employee's holiday calendar; hours logged **on** the
    cutoff day still count ("before the cutoff" read as "by the end of the cutoff day").
  - A day with hours but under 8, or with an attendance record (present / remote), gets a
    reminder only, never a Loss of Pay warning, matching the policy wording. Contractors never
    get a Loss of Pay warning.
  - Window: start of the previous pay period to yesterday. Days already deducted on a payslip are
    left out (the payroll card and the payroll branch cover them).
  - No amount is shown (owner decision): items give the day and the cutoff.
  - Items are structured data on `GET /api/dashboard`; the web words them. No new endpoint.
  - The copilot part is deferred to one P-1 v3 shared with the UC-11 – UC-17 intents (owner
    decision), so the whole set gets one golden-set update and one eval run.
- **Consequences:** the policy text and `config/workday.yaml` must change together if the cutoff
  changes. The rule is a prototype reading of the policy; real payroll would own it.

## ADR-025 — Leave: three types, HR agent approves for the manager, attendance as the record (UC-11a)

- **Status:** Accepted (UC-11a, 2026-10-20; owner decisions on types, approval and slicing)
- **Context:** amendment A-1 adds leave balances and applications. The corpus defines annual and
  sick leave (US/UK) but no "casual" leave; the owner asked for annual + sick + casual. Leave is
  approved by the employee's manager in the policies, but the demo has no manager persona.
- **Decision:**
  - **Types:** annual, sick and casual, with numbers in `config/workday.yaml` (`leave`) that match
    the policies. A new synthetic policy `corpus/hr/hr-casual-leave.md` (6 days a year, at most 2
    at a time, 1 working day's notice, no carry-over, full-time only; numbers pending owner
    review like W1-07) keeps copilot answers grounded. Parental leave stays an HR request.
    Seniority steps and US monthly accrual are not modelled (full allowance from 1 January).
  - **Approval:** annual and casual requests are `pending` until an agent of the leave queue
    (`routing.routes.leave` = `hr_general`, Hana) approves or declines (a reason is required to
    decline); she stands in for the manager. Sick leave is recorded as approved at once ("tell
    your manager", not "ask").
  - **Rules in code** (`domain/leave.ts`): working days in the employee's holiday calendar; same
    and current calendar year; contractors cannot book; annual/casual not in the past, sick only
    today or up to 30 days back; per-type maximum length; no overlap with pending/approved leave;
    balance = entitlement − approved − pending, and a request beyond it is refused (the policy
    makes such days Loss of Pay; the prototype does not create them). Notice periods and the
    doctor's-note rule are warnings, not blocks.
  - **Attendance is the record of leave:** approval writes `attendance` `leave` for each day
    (replacing that day's record) and cancelling approved leave removes them, so timesheet
    statuses, Loss of Pay and "Needs your attention" honour leave with no change to their code.
  - **Storage:** `leave_requests` with the covered working days stored on the request
    (`dates`). Status changes are guarded on the current status (no double decisions). The
    service lives in `modules/workspace` (mock HR system) behind the same repository.
  - Every write is audited (`leave.apply`, `leave.cancel`, `leave.decide`) and the employee gets
    an in-app notification (`kind: leave`).
- **Consequences:** a new collection, five endpoints, two pages and a nav item each for employees
  and agents. An agent outside the leave queue (the IT agent) sees an empty list and gets 404 on a
  decision, as with ticket queues (W3-05).
  The copilot parts (balance answer, apply action) come in UC-11b/c with P-1 v3.

## ADR-026 — Booking leave by chat: P-12 leave_extract, one action union, eval with P-1 v3 (UC-11c)

- **Status:** Accepted (UC-11c, 2026-10-23; amendment A-1, owner decisions on slicing and one eval run)
- **Context:** "Apply leave for Oct 24-25" needs the leave type and dates read from free text,
  which code cannot do reliably; CLAUDE.md allows no LLM call beyond the approved prompts without
  an ADR. The UC-05 confirmation plumbing (state, SSE, pending action, confirm/cancel, audit, card)
  only knew timesheet entries.
- **Decision:**
  - New prompt **P-12 `leave_extract`** (fast tier, temperature 0). The model only picks a type
    from the config ids (or "unknown") and copies the first and last day phrases; it never
    calculates dates, counts days or sees balances. Output schema `LeaveExtraction`.
  - Code does the rest: `resolveDateText(…, { ahead })` reads leave dates forward ("Friday",
    "next Monday", "tomorrow"), except sick leave, which looks back; `resolveRangeEnd` reads a
    bare end day ("Oct 24-25") in the start month. Missing type or dates, an unreadable date or a
    rule problem (`checkLeave`, the Leave page's rules) gives a code-written CLARIFY; contractors get
    the fixed reply with no model call. Otherwise a `leave_apply` action is proposed.
  - **One action union** `CopilotActionSchema` (`timesheet_log` | `leave_apply`) in
    `packages/shared/src/api/actions.ts` for state, the `action_draft` event and `pendingAction`;
    `applyAction` books leave through the same `LeaveService.apply` as the form, so a rule that
    fails at confirm time (e.g. the day was booked meanwhile) books nothing. Audit `leave.apply`
    with `triggeredBy: copilot, approvedBy: employee` and the request id (`ActionResult.recordId`).
  - `config/prompts.yaml` lists `leave_extract: 1` so the branch runs; its eval and recordings
    come with the P-1 v3 switch (one run for UC-11 – UC-17, owner decision). Golden set: ten
    workspace cases (`WS-LBL`, `WS-LAP`, `WS-BRF`); `HR-CLR-001`'s question moved to `WS-LBL-001`
    and the clarify slot got a new vague question.
- **Consequences:** live booking by chat depends on P-1 v3 (or the code backstop) picking
  `leave_apply`; until the eval run switches v3 on, v2 rarely does. The eval never confirms
  (`applyLeave` refuses in eval runs, like `saveTimesheet`).

## ADR-027 — Bulk timesheet requests: P-10 v2 names the kind, code picks the days (UC-13)

- **Status:** Accepted (UC-13, 2026-10-23; amendment A-1)
- **Context:** "Fill my missing days with Banking" or "copy last week" name no day. Asking the
  model to list the days would let it invent dates or hours, against rule E.2.
- **Decision:**
  - **P-10 `timesheet_extract` v2** adds an optional `bulk` field: `kind` (`none`,
    `missing_days`, `copy_last_week`), plus project and hours for `missing_days`. The model never
    names days for a bulk request. v1 output (no `bulk`) still validates; the schema accepts
    either entries or a bulk request.
  - Code expands it (`domain/timesheetBulk.ts`): **missing days** = missing or partial past
    working days of this week and last (the window of "Which days am I missing?"), each with the
    given hours or what is left of the required hours; **copy last week** = this week's empty
    working days up to today take last week's entries for the same weekday (days with hours,
    weekends, holidays, leave and empty source days are skipped). The result goes through the same
    timesheet rules and the same confirmation card; nothing to fill gives a code reply.
  - v2 joins the P-1 v3 eval run before it is switched on in `config/prompts.yaml` (v1 stays
    active). Golden set: `WS-TSL-007` – `009`.
- **Consequences:** one confirm saves every entry, audited as one `timesheet.save` with every
  change listed. Wider windows (a whole month) are out of scope: the employee names days instead.

## ADR-028 — The requester's own changes: comment, withdraw, reopen; P-13 (UC-17)

- **Status:** Accepted (UC-17, 2026-10-23; owner decisions on all four points below)
- **Context:** employees could only read their requests. ADR-012's transitions are the agents'
  workflow and have no way for a requester to cancel; "add a note to my VPN ticket" needs the
  request and the comment read from free text.
- **Decision:**
  - **Requester rules** (`domain/requestChanges.ts`, separate from ADR-012's agent table):
    _comment_ on anything but a closed request, **no status change** (owner decision: the agent
    moves it on); _withdraw_ any open request → **closed** (owner decision), recorded as a public
    `status_change` with the reason; _reopen_ a resolved request → in progress (resolution time
    cleared). Closed is final for the requester.
  - **One service** (`modules/tickets/requesterService.ts`, guarded update shared with agents) for
    the request page and the copilot. Endpoints `POST /api/tickets/:id/comment | withdraw | reopen`
    (employee-only; another employee's request 404; 409 with the reason when a rule refuses),
    audited `ticket.comment` / `ticket.withdraw` / `ticket.reopen` with `triggeredBy`. The request
    page shows the comment box and Withdraw / Reopen (owner decision).
  - **P-13 `request_change_extract`** (fast tier): operation, the request as the employee
    referred to it, and the comment text copied. Code finds the request: a number in the
    reference or message among the employee's own, else the only request the change fits; several
    → "which request?" with the list; none → says so. Then the rules, then a `request_change`
    action on the confirmation card; applyAction goes through the same service.
  - P-13 is listed in `config/prompts.yaml`; its eval comes with the P-1 v3 run. Golden
    `WS-RMG-001` – `003`.
- **Consequences:** agents see the employee's comment as a public reply and the withdrawal as a
  status change; they get no notification (in-app notifications are for employees only).

## ADR-029 — Answer feedback loop: reasons, the admin list, golden drafts in the browser (UC-16)

- **Status:** Accepted (UC-16, 2026-10-24; amendment A-1)
- **Context:** thumbs up/down and an optional comment were already stored (`feedback`, W2-09)
  and the admin overview shows the thumbs-down rate, but nobody could see _which_ answers were
  rated down or why.
- **Decision:**
  - Chat: after "Not helpful", optional quick reasons plus a short note, saved as the existing
    feedback comment (same upsert; no new collection or endpoint for employees).
  - Admin: `GET /api/admin/feedback?rating=down|up` (admin only) joins each rating with its turn
    trace: the **redacted** question (`trace.redactedInput`), an answer excerpt, the decision and
    reason code, the profile snapshot and the persona's email. The comment is PII-redacted on the
    way out. Confidential (restricted) turns show no question or answer: they stay in the audited
    trace viewer. Shown on the Knowledge gaps page ("Rated not helpful").
  - **"Copy as golden case"** builds a draft JSONL line in the browser (question, persona,
    placeholders for id, category, decision, documents and key facts, and the reason in the
    notes). The API writes nothing to the repository; a person reviews it and adds it to
    `evals/golden` (then `golden:validate`).
- **Consequences:** no LLM involved. The list is a recent window (50 by default, at most 100);
  aggregation by topic stays with the knowledge-gap clusters.

## ADR-030 — Voice input with the browser's Web Speech API (UC-14)

- **Status:** Accepted (UC-14, 2026-10-24; amendment A-1)
- **Context:** employees want to speak to the copilot. Server-side speech-to-text would add a
  provider, a dependency and audio uploads (out of scope: no attachments, no new services).
- **Decision:**
  - The browser's `SpeechRecognition` (`webkitSpeechRecognition` in Chrome / Edge), wrapped in
    `hooks/useSpeechInput.ts`. No dependency, no API change: the transcript only fills the
    composer, after any typed text, and the employee reviews it and presses Send (nothing is sent
    by voice alone). The mic button is hidden where the browser has no support (Firefox).
  - **Privacy:** Chrome and Edge send the audio to the browser vendor's speech service. Recognition
    runs only while the employee holds the mic on (one click to start, one to stop); a notice says
    so while listening, and the button's title repeats it. Production would need this cleared by
    the data-protection owner, or an on-device engine.
  - Errors (microphone blocked, speech service unreachable from the corporate network, no speech)
    are shown in words; typing always works.
  - Language `en-US` for now; UC-15 (Hindi) can pass `hi-IN`.
- **Consequences:** behaviour depends on the browser and network; E2E uses a fake recognizer.

## ADR-031 — Hindi replies: code picks the language, model answers follow it (UC-15)

- **Status:** Accepted (UC-15, 2026-10-26; amendment A-1). Prompts not active until the eval run.
- **Context:** employees may write in Hindi. The policies are English; citations, figures and the
  number check must keep working; the language must not be the model's choice.
- **Decision:**
  - **Code decides** (`domain/language.ts` `replyLanguageFor`): the user's setting
    `replyLanguage` (`auto` | `en` | `hi`, default auto, `PATCH /api/profiles/me/preferences`, a
    "Reply in" select next to the Pro switch); on auto, Hindi when the message contains
    Devanagari. Romanised Hindi is not detected: the employee can choose Hindi.
  - **Model-written answers only:** new versions P-3 `grounded_answer` v2, P-4
    `clarifying_question` v2 and P-11 `payroll_explain` v2 take `{{language}}` and keep source
    markers, digits, dates, amounts and limits exactly as the sources write them, so citation
    validation and the numeric check are unchanged. `uncovered` stays English. Code-written replies
    (records answers, confirmations, fixed templates) and policy titles stay English for now: a
    separate localisation task.
  - Nodes pass `language` only when the active version declares it (`languageVariable`), so v1
    keeps rendering unchanged and the switch is a `config/prompts.yaml` change.
  - **Search stays English:** P-1 v3 writes the search query in English whatever the message
    language (the corpus is English; BM25 would miss Hindi words).
  - Golden set: three Hindi answerable cases (tag `hindi`, key facts that survive translation:
    figures and addresses); the full scorer fails a `hindi` answer without Devanagari
    (`WRONG_LANGUAGE`). Voice input (ADR-030) can pass `hi-IN` later.
- **Consequences:** a mixed reply (Hindi answer, English records and buttons) until the UI and
  code replies are localised. Switch the v2 prompts with the P-1 v3 eval run.
