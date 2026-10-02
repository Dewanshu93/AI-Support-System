# Architecture — current reality

Living summary of what exists in the code. Target design: playbook sections 2–10.

## Repository layout (as of W1-02)

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

## Runtime

- `GET /api/health` → `200 { status: "ok" }`. The `db` and `llmConfigured` fields from the API
  contract are added with W1-04 and W1-09.
- The web app has a placeholder home page only. Auth, layouts and the prototype banner come in
  W1-06.

## Not yet present

Shared Zod contracts and error envelope (W1-03), DB layer (W1-04), auth (W1-05), everything under
`apps/api/src/ai`.
