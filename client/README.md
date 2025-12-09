# German Reading Exercises

Full-stack German reading trainer with paragraph-level exercises, comprehension questions, vocabulary cards, translation helper, progress tracking, and admin-only OpenAI generation. UI is React + Vite + Tailwind; the API is Express + GraphQL Yoga with Prisma (SQLite).

## Features
- Reading mode with leveled paragraphs, MCQs, and important words per text.
- JWT auth with admin role for AI-powered content generation and database seeding.
- Progress tracking per question/word plus simple spaced review scheduling.
- Translation helper backed by DeepL (auth required) that saves a personal dictionary in localStorage.
- GraphQL API for querying items and REST helpers for auth, submissions, and translation.

## Tech stack
- Frontend: React 19, Vite, Tailwind CSS 4, React Router.
- Backend: Express on port 3000 with GraphQL Yoga at `/api/graphql` plus REST endpoints under `/api/*`.
- Data: Prisma with SQLite (no external DB needed).
- AI: OpenAI Chat Completions with JSON schema enforcement for generated content.

## Quick start
Prereqs: Node.js 20+, npm. SQLite ships with Prisma, so nothing extra to install.

1) Copy env files and fill secrets (see variables below):
```bash
cp .env.example .env
# if you prefer env files scoped to the server package:
cp server/.env.example server/.env
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
4) Run the API (default http://localhost:3000):
```bash
npm run serve:api          # compiled server
# or for ts-node hot reload
npm run serve:api:dev
```
5) In another terminal, run the UI (http://localhost:8080 with /api proxy to :3000):
```bash
npm run dev
```

## Environment variables
Add these to `.env` (or `server/.env` if running from that folder):
- `DATABASE_URL` (required) – SQLite connection string, e.g. `file:./dev.db` (path is relative to `server/src/prisma/schema.prisma`).
- `OPENAI_API_KEY` (required for generation/seeders) – OpenAI secret used by `/api/vocab` and `scripts/seedThemes.ts`.
- `JWT_SECRET` (required) – signs auth tokens for `/api/auth/*` and GraphQL context.
- `AUTH_SECRET` (recommended) – API key that can be used instead of an admin JWT for protected endpoints.
- `DEEPL_API_KEY` (optional) – enables `/api/translate`; supports free keys ending with `:fx`.
- `OPENAI_MODEL` (optional) – override the model for generation; defaults to `gpt-4.1-mini-2025-04-14`.
- `VITE_GRAPHQL_ENDPOINT` (optional) – client override for the GraphQL endpoint; defaults to `/api/graphql`.
- `PORT` (optional) – API port, defaults to `3000`.
- Legacy helpers: `OPENAI_MAX_REQUESTS_PER_DAY` and `GRAPHQL_ENDPOINT` are read by scripts in `api/`/`scripts/` if you use them.

## NPM scripts (root)
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
- Translation: `POST /api/translate` (JWT required; needs `DEEPL_API_KEY`).

## Project structure
- `src/` – React UI components, hooks, helpers (includes client auth + GraphQL fetcher).
- `server/` – Express entrypoint, GraphQL Yoga schema/resolvers, Prisma schema, OpenAI + DeepL services, seeds.
- `api/` – legacy serverless helpers (not used by the Express server but available for reference).
- `scripts/` – maintenance utilities and AI seeding helpers.
