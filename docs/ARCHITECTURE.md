# Architecture — current reality

Living summary of what exists in the code. Target design: playbook sections 2–10.

## Repository layout (as of W1-07)

```
/
├── CLAUDE.md                 standing instructions + session protocol
├── docs/                     contract (placeholder), playbook, ADRs, progress, gaps
├── config/                   nine behaviour YAML files, validated at startup
├── corpus/                   synthetic IT/HR policies (Markdown + frontmatter), README inventory
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

## Auth, RBAC and audit (W1-05)

- `http/routes.ts` is the **route policy table**. Every endpoint is a `RouteDef` with
  `access: 'public' | 'any' | Role[]`, and `mountRoutes` adds `requireAuth` / `requireRole` from
  that rule. `http/routes.test.ts` lists the reviewed policy for every endpoint.
- `http/requireAuth.ts` verifies the `sd_session` cookie (HS256 JWT only) and re-loads the user
  from the database on every request, then sets `req.user`. Otherwise it returns 401.
  `http/requireRole.ts` returns 403 for a disallowed role.
- `modules/auth`:
  - `tokens.ts`: sign/verify; claims `sub`, `role`, `iat`, `exp`; 8 h lifetime.
  - `service.ts`: demo users, and login by `userId` or `email` with the optional
    `DEMO_PASSWORD`, compared in constant time. Unknown user and bad password get the same 401
    message.
  - `routes.ts`: demo-users, login, logout, me. The cookie is httpOnly, `SameSite=Lax`,
    `Path=/`, and `Secure` when `NODE_ENV=production`.
- `modules/users`: `repository.ts` (Mongo: `findById`, `findByEmail`, `listDemo`),
  `mappers.ts` (`AuthUser`, `DemoUser`, profile; `queues` only for agents), `routes.ts`
  (`GET /api/profiles/me`), and `seed.ts`. The seed loader validates `seed/users.json` against
  `UserSchema` and routing queues, then upserts by fixed `_id`, setting `createdAt` only on
  insert.
- `modules/audit`: an append-only repository (validated with `AuditLogSchema`) and `service.record(req,
event)` (actor, role, ip, requestId). It currently logs `auth.login` and `auth.logout`.
- `deps.ts` (`AppDeps`): `createApp(deps)` receives repositories and auth settings.
  `server.ts` wires the MongoDB implementations; API tests use the in-memory ones in
  `test/helpers/app.ts`.
- Shared contracts are in `packages/shared/src/api/auth.ts`.

## Frontend shell (W1-06)

- **Same-origin API.** `next.config.ts` rewrites `/api/*` to `API_URL` (default
  `http://localhost:4000`, server-side only). The browser talks only to the web origin, so the
  `sd_session` cookie is first-party and no CORS is needed between web and api.
- `lib/api.ts` is the typed browser client. It calls the same-origin `/api`, includes
  credentials, sends `X-Requested-With: sd-web` on mutations (for the W4-07 CSRF check) and
  validates every response with the shared Zod schemas. Errors become `ApiError` with code,
  message and request ID; `NETWORK` and `INVALID_RESPONSE` cover client-side failures.
- `lib/session.ts` (Server Components) has `getCurrentUser()`, which forwards the session
  cookie to `GET /api/auth/me`, and `requireArea(roles)`, which sends anonymous users to
  `/login` and wrong-role users to their own home. This is UX only; the API enforces access.
- `lib/roles.ts`: role homes (employee → `/chat`, agent → `/agent/queue`, admin →
  `/admin`), role navigation, area roles (the agent area allows agent and admin) and labels.
- Routes:
  - `app/(auth)/login`: the persona picker (`components/auth/LoginPicker`), grouped by role,
    with skeleton, "API unreachable" with retry, "No demo users — run seed", and a demo-password
    field when `passwordRequired` is true.
  - The `(employee)`, `(agent)` and `(admin)` layouts call `requireArea` and render
    `AppShell` (role navigation with the active page, a user badge with role, country and
    employment type, and Sign out).
  - Every section 10 route has a placeholder page naming the task that builds it.
  - `/` redirects by session.
- `PrototypeBanner` is in the root layout, so it shows on every page. `app/error.tsx` (Next 16
  error boundary with `retry`) and `app/loading.tsx` provide the shared error and loading states.
- UI primitives in `components/ui`: Button, Badge, Card, Spinner, Skeleton/SkeletonCards,
  EmptyState and ErrorState (retry plus request ID). Table, Tabs, Dialog, Textarea, Select and
  Toast are added when a screen first needs them.

## Knowledge corpus (W1-07)

- `corpus/it` (14) and `corpus/hr` (21): 35 synthetic Markdown policies (33 active, 2
  superseded) with YAML frontmatter validated by `DocumentMetadataSchema`
  (`packages/shared/src/api/documents.ts`; also used by the W4-04 upload endpoint).
  `corpus/README.md` has the authoring rules, composition, deliberately missing topics, the
  planted injection, a key-facts sheet and a generated inventory.
- `apps/api/src/ai/ingestion/corpus.ts`:
  - `parseCorpusFile` (reused by ingestion in W1-10) and `loadCorpus`;
  - per-document rules: folder matches domain, taxonomy domain, file naming, at least one H2 and
    no H1, `-us`/`-uk` countries, unique slug@version, one active version per slug, and valid
    `supersedes` chains;
  - section Q composition and README checks (inventory compared cell by cell, so Prettier padding
    is ignored).
- `scripts/validate-corpus.ts` (`npm run corpus:validate`, with `-- --write` to regenerate the
  inventory). `corpus.test.ts` validates the real corpus on every `npm test`.

## Runtime

- `GET /api/health` → `200 { status, db, vectorStore }`; `llmConfigured` is added in W1-09.
- The web app has a placeholder home page only. Auth, layouts and the prototype banner come in
  W1-06.

## Not yet present

Everything under
`apps/api/src/ai`.
