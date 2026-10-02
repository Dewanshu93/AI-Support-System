# Architecture — current reality

Living summary of what exists in the code. Target design: playbook sections 2–10.

## Repository layout (as of W1-01)

```
/
├── CLAUDE.md                 standing instructions + session protocol
├── docs/                     contract (placeholder), playbook, ADRs, progress, gaps
├── apps/
│   ├── api/                  Express 5 + TS (CommonJS); src/app.ts (createApp), src/server.ts
│   └── web/                  Next.js 16 App Router + Tailwind v4; src/app, src/lib
├── packages/shared/          @sd/shared — built with tsc project references (dist/)
├── e2e/                      Playwright specs
├── docker-compose.yml        web :3000, api :4000, mongodb-atlas-local :27017
├── tsconfig.base.json        shared compiler options (TS 6.0, strict)
└── eslint.config.mjs         flat config: js + typescript-eslint + Next plugin for apps/web
```

## Runtime

- `GET /api/health` → `200 { status: "ok" }`. The `db` and `llmConfigured` fields from the API
  contract are added with W1-04 and W1-09.
- The web app has a placeholder home page only. Auth, layouts and the prototype banner come in W1-06.

## Not yet present

config loading (W1-02), shared Zod contracts and error envelope (W1-03), DB layer (W1-04), auth
(W1-05), everything under `apps/api/src/ai`.
