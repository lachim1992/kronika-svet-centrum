# Deprecation Roadmap: `player_resources` → `realm_resources`

> **Faktická evidence writerů a readerů žije v `docs/architecture/legacy-writer-audit.md`.**
> Tento dokument je **exekuční plán** odstranění legacy vrstvy. Nemíchat role.

## Status

`player_resources` is **legacy operational support**. The canonical economic ledger is `realm_resources`.
Do not build new features against `player_resources`.

The UI state variable `armies` maps to `military_capacity` (legacy naming). The canonical military data source is `military_stacks`. `military_capacity` is also legacy operational support.

`trade_log` is a legacy event log, not a canonical state source.

---

## Consumer & Writer Map (6 categories)

The following categories are **disjoint** and ordered by migration risk.
Do not collapse them back into a generic "writers/readers" section.
Counts and sites below must stay in sync with `legacy-writer-audit.md`.

### 1. Seed paths (bootstrap-time inserts)

Run at session create/join or world (re)generation. Spread across both client hooks and edge functions.

| Site | Symbol / call |
|---|---|
| `src/hooks/useGameSession.ts` | `initPlayerResources()` (called from `createGameSession`, `joinGameSession`) |
| `src/components/WorldSetupWizard.tsx` | direct `insert` into `player_resources` |
| `src/pages/MyGames.tsx` | direct `insert` at create/join |
| `src/components/dev/SeedSection.tsx` | dev seeding tooling |
| `supabase/functions/world-generate-init/index.ts` | world init seed (incl. AI factions) |
| `supabase/functions/mp-world-generate/index.ts` | multiplayer world generation seed (human + AI) |
| `supabase/functions/repair-world/index.ts` | world repair tool re-seeds missing rows |
| `supabase/functions/generate-promo-world/index.ts` | promo world generator seed |

### 2. Runtime writers (turn-time, actively perpetuate the legacy ontology)

Highest blocker for table removal. These run on every tick / every turn / every command.

| Site | Notes |
|---|---|
| `supabase/functions/process-turn/index.ts` | back-compat write to `player_resources` (verified ~lines 1445–1475) |
| `supabase/functions/command-dispatch/index.ts` | wealth stockpile sync after command application |
| `src/components/dev/EconomyQASection.tsx` | runtime QA mutations |

### 3. Editor APIs (interactive mutation)

| Site | Symbol |
|---|---|
| `src/hooks/useGameSession.ts` | `updateResource()` (`@deprecated`) |
| `src/components/dev/DevPlayerEditor.tsx` | `saveResource()` |

### 4. Read-only UI consumers

Render `player_resources` rows directly. First targets for migration to `realm_resources` reads.

| Component |
|---|
| `EmpireOverview` (WorldTab) |
| `LeaderboardsPanel` (CodexTab, CivTab) |
| `AdminMonitorPanel` (PersistentTab) |

### 5. Write-path UI consumers

Read AND mutate via `updateResource()`. Cannot be migrated until both `realm_resources` editing API and reads exist.

| Component |
|---|
| `EmpireManagement` (CitiesTab) |

### 6. Cascade deleters

Delete `player_resources` rows alongside other player-owned state. **Independent blocker for table drop** — even after every writer is gone, the table cannot be removed while a delete cascade still targets it.

| Site | Notes |
|---|---|
| `src/components/AdminMonitorPanel.tsx` | "remove player" flow deletes `player_resources` together with cities, provinces, discoveries, etc. |

### 7. Prop-threading only (no real dependency)

Receive `resources` in props for context but do not read fields. Trivial to detach.

| Component |
|---|
| `GameHubFAB` (Dashboard) |
| `CouncilTab` (Dashboard) |
| `CivTab`, `WorldTab`, `CodexTab` (where applicable) |

### Removed consumers (already detached)

| Component | Status |
|---|---|
| `HomeTab` | ✅ fetches `realm_resources` independently |
| `EconomyTab` | ✅ fetches `realm_resources` independently |

---

## Order of dismantling (TENTATIVE — re-decide after inventory repair)

> The order below predates the 2026-04-17 inventory repair, which uncovered
> additional runtime writers (`command-dispatch`), four edge-function seeders,
> and a cascade-delete blocker (`AdminMonitorPanel`). "Read-only-first" is
> **not automatically correct** anymore: a newly discovered writer or seed
> path may represent a lower-risk first cut. Re-evaluate before the next real
> code change.

1. **Prop-threading only** — drop `resources` from props that don't read fields.
2. **Read-only UI consumers** — `LeaderboardsPanel`, `AdminMonitorPanel`, then `EmpireOverview`.
3. **Editor APIs** — replace `updateResource()` and `DevPlayerEditor.saveResource()` with `realm_resources` equivalents.
4. **Write-path UI consumers** — migrate `EmpireManagement`.
5. **Seed paths** — remove `initPlayerResources`, direct seed inserts, and the four edge-function seeders.
6. **Runtime writers** — drop back-compat write from `process-turn`, retire `command-dispatch` stockpile sync, retire `EconomyQASection` legacy mutations.
7. **Cascade deleters** — detach `AdminMonitorPanel` delete cascade.
8. **Drop table** `player_resources`.

The same staged path applies to `military_capacity` (read-only consumers first → editor APIs → seed paths → table drop) and to `trade_log` (consumer audit → write-site removal → table drop).

---

## Canonical Replacement Target

`realm_resources` — single row per player per session with aggregated economic state.

### Migration path (high level)

1. Add per-resource breakdown columns to `realm_resources` (e.g., `gold_income`, `grain_income`, `gold_upkeep`, `grain_upkeep`, …).
2. Update `process-turn` / `commit-turn` to write these new columns.
3. Migrate UI consumers per the order above.
4. Remove the back-compat write to `player_resources`.
5. Drop the table.

---

## Impact if `player_resources` were removed today

- **EmpireOverview**: per-resource income/upkeep/surplus cards break.
- **EmpireManagement**: resource editing UI breaks (uses `updateResource()`).
- **LeaderboardsPanel**: economy rankings break (sums resource stockpiles).
- **AdminMonitorPanel**: resource monitoring display breaks.

Owner of dismantling deadlines: project owner. This document is the execution checklist, not a schedule.
