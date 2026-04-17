# Deprecation Roadmap: `player_resources` → `realm_resources`

## Status

`player_resources` is **legacy operational support**. The canonical economic ledger is `realm_resources`.
Do not build new features against `player_resources`.

The UI state variable `armies` maps to `military_capacity` (legacy naming). The canonical military data source is `military_stacks`. `military_capacity` is also legacy operational support.

`trade_log` is a legacy event log, not a canonical state source.

---

## Consumer & Writer Map (5 categories)

The following categories are **disjoint** and ordered by migration risk.
Do not collapse them back into a generic "writers/readers" section.

### 1. Seed paths (bootstrap-time inserts)

Run only at session create/join. Lowest cardinality, easiest to retire once `realm_resources` seeding is in place.

| Site | Symbol / call |
|---|---|
| `src/hooks/useGameSession.ts` | `initPlayerResources()` (called from `createGameSession`, `joinGameSession`) |
| `src/components/WorldSetupWizard.tsx` | direct `insert` into `player_resources` |
| `src/pages/MyGames.tsx` | direct `insert` at create/join |
| `src/components/dev/SeedSection.tsx` | dev seeding tooling |

### 2. Runtime writers (turn-time, actively perpetuate the legacy ontology)

Highest blocker for table removal. These run on every tick / every turn.

| Site | Notes |
|---|---|
| `supabase/functions/process-turn/index.ts` | back-compat write to `player_resources` |
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

### 6. Prop-threading only (no real dependency)

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

## Order of dismantling

1. **Prop-threading only** — drop `resources` from props that don't read fields.
2. **Read-only UI consumers** — `LeaderboardsPanel`, `AdminMonitorPanel`, then `EmpireOverview`.
3. **Editor APIs** — replace `updateResource()` and `DevPlayerEditor.saveResource()` with `realm_resources` equivalents.
4. **Write-path UI consumers** — migrate `EmpireManagement`.
5. **Seed paths** — remove `initPlayerResources` and direct seed inserts.
6. **Runtime writers** — drop back-compat write from `process-turn`, retire `EconomyQASection` legacy mutations.
7. **Drop table** `player_resources`.

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
