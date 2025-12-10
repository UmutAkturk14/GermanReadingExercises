# German Reading Exercises

Full-stack German reading trainer with AI-backed paragraph generation, comprehension checks, word lookups, and progress tracking. The UI runs on React + Vite + Tailwind; the API is Express + GraphQL Yoga + Prisma (SQLite).

## Features
- Paragraph-level reading practice with MCQs, important words, and spaced-review style progress for questions and vocab.
- Word lookup: highlight text and ask the AI (OpenAI) for a quick explanation/translation; recent lookups are saved as flip cards in a local dictionary.
- JWT auth with admin role for AI-powered content generation and seeding.
- Translation helper (DeepL) plus personal dictionary persisted in localStorage.
- GraphQL API for reading content and REST helpers for auth, submissions, translation, and OpenAI-driven generation.

## Tech stack
- Frontend: React 19, Vite, Tailwind CSS 4, React Router.
- Backend: Express on port 3000 with GraphQL Yoga at `/api/graphql` plus REST endpoints under `/api/*`.
- Data: Prisma with SQLite (no external DB needed).
- AI: OpenAI Chat Completions for paragraph/vocab generation and word lookups; optional DeepL for translations.

## Project layout
- `client/` – main project root (run commands here).
- `client/src/` – React UI, hooks, helpers, auth client, and UI state.
- `client/server/` – Express + GraphQL Yoga API, Prisma schema, OpenAI/DeepL services, and seeds.
- `client/api/` and `client/scripts/` – legacy serverless helpers and seed utilities.

## Quick start
Prereqs: Node.js 20+, npm. All commands below run from `client/`.

1) Copy env vars and fill secrets (see list below):
```bash
cd client
cp .env.example .env
```
2) Install dependencies (runs Prisma client generation + server build automatically):
```bash
npm install
```
3) Create/update the local DB schema (SQLite file path comes from `DATABASE_URL`):
```bash
npx prisma db push --schema ./server/src/prisma/schema.prisma
# optional sample data + admin user admin@example.com / 123456
npm --prefix server run prisma:seed
```
4) Run the API (http://localhost:3000):
```bash
npm run serve:api          # compiled server
# or ts-node hot reload
npm run serve:api:dev
```
5) In another terminal, run the UI (http://localhost:8080 proxied to the API):
```bash
npm run dev
```

## Environment variables
Add these to `client/.env` (or `client/server/.env` if you prefer scoping there):
- `DATABASE_URL` (required) – SQLite connection string, e.g. `file:./dev.db` (path is relative to `server/src/prisma/schema.prisma`).
- `OPENAI_API_KEY` (required for generation/word lookups/seeders) – OpenAI secret used by `/api/vocab`, word lookup, and `scripts/seedThemes.ts`.
- `JWT_SECRET` (required) – signs auth tokens for `/api/auth/*` and GraphQL context.
- `AUTH_SECRET` (recommended) – API key that can be used instead of an admin JWT for protected endpoints.
- `DEEPL_API_KEY` (optional) – enables `/api/translate`; supports free keys ending with `:fx`.
- `OPENAI_MODEL` (optional) – override the model for generation; defaults to `gpt-4.1-mini-2025-04-14`.
- `VITE_GRAPHQL_ENDPOINT` (optional) – client override for the GraphQL endpoint; defaults to `/api/graphql`.
- `PORT` (optional) – API port, defaults to `3000`.
- Legacy helpers: `OPENAI_MAX_REQUESTS_PER_DAY` and `GRAPHQL_ENDPOINT` are read by scripts in `api/`/`scripts/` if you use them.

## NPM scripts (run from `client/`)
- `npm run dev` – Vite dev server on :8080 with `/api` proxy.
- `npm run serve:api` / `npm run serve:api:dev` – start the compiled API or ts-node dev server on :3000.
- `npm run build` – type-check then build the UI.
- `npm run typecheck`, `npm run lint`, `npm run lint:fix`, `npm run format` – static checks and formatting.
- `npm run build:server` – compile `server/` (also runs postinstall).
- `npm run db:reset` – prisma db push (force) + server seed.
- `npm run seed:themes` – generate themed items via OpenAI (requires DB + OpenAI key).

## API surface
- GraphQL: `POST /api/graphql` (schema in `server/src/graphql/schema.ts`). Auth with `Authorization: Bearer <JWT>` or `x-api-key: <AUTH_SECRET>`.
- Auth: `POST /api/auth/signup`, `POST /api/auth/signin` (email/password). Tokens are stored in localStorage.
- Progress: `POST /api/exercises/submit` and `POST /api/progress/batch` (JWT required).
- Content generation (admin): `POST /api/vocab` to create new paragraphs via OpenAI.
- Translation: `POST /api/translate` (JWT required; uses `DEEPL_API_KEY`).
