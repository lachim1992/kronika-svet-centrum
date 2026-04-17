# Chronicle

A narrative civilization engine with two play modes: turn-based with an AI
oracle, and a persistent real-time world driven by minute-scale ticks. The
engine is the source of truth for state; AI narrates the state but never
invents it.

## Stack

React 18 + Vite 5 + TypeScript 5, Tailwind CSS v3, shadcn/ui. Backend on
Lovable Cloud (Supabase Postgres + Edge Functions on Deno). Realtime via
Supabase channels. AI via Lovable AI Gateway (Gemini / GPT models, no
per-user API keys).

## Architecture entry points

Read these before changing engine, schema, or orchestration code.

- [`docs/architecture/ontology.md`](docs/architecture/ontology.md) —
  Canonical state, legacy surfaces, target model. Source-of-truth map.
- [`docs/architecture/feature-freeze.md`](docs/architecture/feature-freeze.md) —
  What is in active development vs. frozen for the consolidation window.
- [`DEPRECATION.md`](DEPRECATION.md) —
  Legacy `player_resources` / `military_capacity` / `trade_log` dismantling
  checklist by category and order.
- [`docs/economy-v4.3-architecture.md`](docs/economy-v4.3-architecture.md) —
  Economy v4.3 model: 6 civilizational classes × 5 baskets, solver design,
  basket aggregation.

## Where to start reading code

- `src/hooks/useGameSession.ts` — session-scoped data hook (core + legacy
  compat + content channels).
- `supabase/functions/refresh-economy/index.ts` — canonical economy
  recompute orchestrator.
- `supabase/functions/process-turn/index.ts` — turn resolution.
- `supabase/functions/commit-turn/index.ts` — write-path turn commit.
- `src/lib/turnEngine.ts` — client-side turn helpers.

## Development workflow

This repo is edited primarily through [Lovable](https://lovable.dev).
Changes made in Lovable are committed to this repo. Local development with
Vite (`npm i && npm run dev`) is supported but not the primary workflow.
