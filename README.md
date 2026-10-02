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

## Checks

```bash
npm run lint && npm run typecheck && npm test
npm run test:e2e                   # first time: npx playwright install chromium
```

## Docs

[CLAUDE.md](CLAUDE.md) · [Playbook](docs/PLAYBOOK.md) · [Architecture](docs/ARCHITECTURE.md) ·
[Decisions](docs/DECISIONS.md) · [Progress](docs/PROGRESS.md)
