# Legacy Writer Audit — `player_resources`

> **Operative baseline, NOT an append-only log.**
> This document is the factual evidence of what the repo currently does.
> The execution plan lives in `DEPRECATION.md`. The architectural model lives
> in `docs/architecture/ontology.md`. Do not duplicate roles.

---

## Method

```
grep -rn "from\(['\"]player_resources['\"]\)" supabase/functions src/
```

Run across `supabase/functions/**` and `src/**`. Counts and sites below
reflect the result of that grep at the date of last verification.

## Last verified

2026-04-20 (Sprint 1 Krok 0)

## Sprint 1 status

- **Runtime writers**: `process-turn` player_resources write CUT (Krok 1). `command-dispatch` stockpile sync CUT (Krok 1).
- **Seed paths**: `initPlayerResources()` in `createGameSession`/`joinGameSession` CUT (Krok 2). `MyGames.tsx` direct insert CUT (Krok 2).
- **FE allowlist**: see `docs/architecture/legacy-allowlist.md`
- **BE inventory**: see `docs/architecture/legacy-backend-inventory.txt` (Sprint 2)

---

## Writer inventory

### Runtime writers
- `supabase/functions/process-turn/index.ts` — update / insert / update per turn (verified ~lines 1445–1475)
- `supabase/functions/command-dispatch/index.ts` — wealth stockpile sync after command application

### Seed writers
- `src/hooks/useGameSession.ts` — `initPlayerResources()` (called from `createGameSession`, `joinGameSession`)
- `src/components/WorldSetupWizard.tsx` — direct insert at world setup
- `src/pages/MyGames.tsx` — direct insert at create/join
- `src/components/dev/SeedSection.tsx` — dev seeding tooling
- `supabase/functions/world-generate-init/index.ts` — world init seed (incl. AI factions)
- `supabase/functions/mp-world-generate/index.ts` — multiplayer world generation seed (human + AI)
- `supabase/functions/repair-world/index.ts` — world repair tool re-seeds missing rows
- `supabase/functions/generate-promo-world/index.ts` — promo world generator seed

### Editor writers
- `src/hooks/useGameSession.ts` — `updateResource()` (`@deprecated`)
- `src/components/dev/DevPlayerEditor.tsx` — `saveResource()`
- `src/components/dev/EconomyQASection.tsx` — runtime QA mutations

### Cascade deleters
- `src/components/AdminMonitorPanel.tsx` — "remove player" flow deletes `player_resources` rows alongside other player-owned state. Blocks table drop independently of writer removal.

---

## Reader inventory

Taxonomy mirrors `DEPRECATION.md` so the two documents stay aligned.

### Read-only UI consumers
- `LeaderboardsPanel` (CodexTab, CivTab)
- `AdminMonitorPanel` (PersistentTab) — also a cascade deleter, see above
- `EmpireOverview` (WorldTab)

### Write-path UI consumers
- `EmpireManagement` (CitiesTab) — reads AND mutates via `updateResource()`

### Prop-threading only
- `GameHubFAB` (Dashboard)
- `CouncilTab` (Dashboard)
- `CivTab`, `WorldTab`, `CodexTab` where applicable

### Already detached
- `HomeTab` — fetches `realm_resources` independently
- `EconomyTab` — fetches `realm_resources` independently

---

## Corrected false assumptions

- **"`process-turn` už nezapisuje do `player_resources`"** — FALSE. Writer verified at `supabase/functions/process-turn/index.ts` ~lines 1445–1475.
- **"`DEPRECATION.md` lists all writers"** — FALSE at time of audit. Missing entries: `command-dispatch`, four edge-function seeders (`world-generate-init`, `mp-world-generate`, `repair-world`, `generate-promo-world`), and the `AdminMonitorPanel` cascade delete.

---

## Next verification command

```
grep -rn "from\(['\"]player_resources['\"]\)" supabase/functions src/
```

Re-run before any future claim about writer/reader counts. Do not rely on
prose summaries — including this one — without re-running the grep.
