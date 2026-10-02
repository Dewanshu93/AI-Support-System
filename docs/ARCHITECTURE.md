# Architecture — current reality

Living summary of what exists in the code. Target design: playbook sections 2–10.

## Repository layout (as of W1-04)

```
/
├── CLAUDE.md                 standing instructions + session protocol
├── docs/                     contract (placeholder), playbook, ADRs, progress, gaps
├── config/                   nine behaviour YAML files, validated at startup
├── apps/
│   ├── api/                  Express 5 + TS (CommonJS)
│   │   ├── src/app.ts        createApp() — no config dependency yet
│   │   ├── src/server.ts     loads .env → initConfig() → listen; exits 1 on ConfigError
│   │   ├── src/config/       env schema, per-file YAML schemas, loader, cross-file checks
│   │   └── test/helpers/     test-only helpers (typechecked, never built)
│   └── web/                  Next.js 16 App Router + Tailwind v4; src/app, src/lib
├── packages/shared/          @sd/shared — enums (DOMAINS, PRIORITIES), constants
├── scripts/                  operational CLIs (create-indexes)
├── e2e/                      Playwright specs
├── docker-compose.yml        web :3000, api :4000, mongodb-atlas-local :27017
├── tsconfig.base.json        shared compiler options (TS 6.0, strict)
└── eslint.config.mjs         flat config: js + typescript-eslint + Next plugin for apps/web
```

## Configuration (W1-02)

- `apps/api/src/config/env.ts` — `EnvSchema` (Zod). Blank values count as unset. Required:
  `MONGODB_URI`, `JWT_SECRET` (≥ 32 chars). LLM keys are optional.
- `apps/api/src/config/schemas.ts` — one strict Zod schema per YAML file, plus `CONFIG_FILES`
  (file → schema → `AppConfig` key). Regex patterns are compiled during validation, and templates
  must contain their placeholders.
- `apps/api/src/config/crossChecks.ts` — each category has exactly one same-domain queue and a
  ticket schema; no unknown categories; the sensitive queue is HR.
- `apps/api/src/config/index.ts` — `loadConfig(env)` (pure, throws `ConfigError`), the
  `initConfig()` / `getConfig()` singleton (deep-frozen), `loadDotEnv()`.
- Every failure message names the source: `Invalid environment variables: …`,
  `config/<file>: malformed YAML at line L, column C: …`, `config/<file> is invalid: - path: …`,
  `Config files are inconsistent: …`.

## HTTP layer and shared contracts (W1-03)

- `packages/shared`: enums with matching Zod schemas (roles, decisions, conversation, message,
  ticket, event, document, ingest and eval statuses, priorities, domains). Also
  `ErrorEnvelopeSchema` with `ERROR_HTTP_STATUS` (each code maps to one status), `api/common.ts`
  (`ObjectIdStringSchema`, `PaginationQuerySchema`, `paginatedSchema`) and `api/health.ts`. Web
  and api import the same definitions.
- Middleware order in `createApp()`: `requestId` → `express.json({ limit: 100kb })` → routes →
  `notFoundHandler` → `errorHandler`.
- `http/requestId.ts`: accepts a safe incoming `X-Request-Id` (8–64 of `[A-Za-z0-9._-]`) or
  generates a UUID; sets `req.id` and a child logger `req.log`; logs one line per request.
- `http/validate.ts`: `validate({ body?, query?, params? })` puts parsed values on
  `req.validated` and replaces `req.body`. Failures become `VALIDATION_ERROR` with
  `details.issues[] = { location, path, message }`.
- `http/errors.ts`: an `AppError` (`lib/errors.ts`) keeps its code and message. body-parser errors
  map to `VALIDATION_ERROR`. Anything else becomes `INTERNAL` with a generic message, and the
  stack is logged but never returned.
- `lib/logger.ts`: pino JSON logger; level from `LOG_LEVEL`, silent under Jest.
- `createApp({ extraRoutes })` is a test-only hook for mounting sample routes.

## Database layer (W1-04)

- `db/client.ts`: `connectDatabase(uri)` (pool max 20, 10 s server selection; DB name from the URI
  path, default `servicedesk`) and `pingDatabase(db)` for health.
- `db/schemas.ts`: a Zod schema for all 14 collections in playbook section 3. It covers ObjectId
  and Date types plus the constraints: agent ⇔ non-empty queues, lowercase email, restricted ⇒
  `hr_case`, humanId format. `CHUNK_FILTER_FIELDS` lists the metadata copied onto chunks.
- `db/collections.ts`: `COLLECTIONS` names, typed `getCollections(db)`, and
  `validateForWrite(collection, schema, doc)` for repositories.
- `db/indexes.ts`: explicit-name regular indexes per collection, plus the idempotent
  `ensureAllIndexes(db, qdrant, { embeddingDimension })` (Mongo collections and indexes, then the
  Qdrant collection).
- `db/qdrant.ts` (ADR-004): the Qdrant client factory and ping, and the `chunks` collection, which
  has a cosine `dense` vector (size from `models.yaml`), a `bm25` sparse vector with
  `modifier: idf`, and keyword payload indexes on the access-filter fields plus `documentId`.
  `chunkPointId` / `chunkIdFromPointId` map a chunk's ObjectId to a UUID. `ensureChunkCollection`
  refuses a dense-size change or a missing sparse vector.
- Chunk text and metadata live in MongoDB (`chunks`, no `embedding` field). Vectors live only in
  Qdrant.
- `db/counters.ts`: `nextSequence(counters, 'IT' | 'HR')`, an atomic `$inc` upsert that retries
  once on a first-insert race.
- `scripts/create-indexes.ts` (`npm run db:indexes`) calls `ensureAllIndexes`.
- `server.ts` connects to MongoDB before listening and exits 1 if it is unreachable (compose
  restarts it with `restart: on-failure`). Qdrant is optional at boot (a warning is logged).
  It shuts down cleanly on SIGTERM/SIGINT. Health reports `db` and `vectorStore` as `up/down`,
  with `status: degraded` if either is down.
- LangGraph checkpoint collections are created later by the checkpointer package and are not
  listed here.

## Runtime

- `GET /api/health` → `200 { status, db, vectorStore }`; `llmConfigured` is added in W1-09.
- The web app has a placeholder home page only. Auth, layouts and the prototype banner come in
  W1-06.

## Not yet present

Auth (W1-05), everything under
`apps/api/src/ai`.
