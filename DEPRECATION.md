# Deprecation Roadmap: `player_resources` → `realm_resources`

## Status

`player_resources` is **legacy operational support**. The canonical economic ledger is `realm_resources`.
Do not build new features against `player_resources`.

## Consumer Map

| Component | How it uses `player_resources` | Blocker for removal |
|-----------|-------------------------------|---------------------|
| `EmpireOverview` (WorldTab) | Renders per-resource income/upkeep/surplus breakdown | Needs per-resource columns on `realm_resources` |
| `LeaderboardsPanel` (CodexTab, CivTab) | Economy rankings using resource totals | Needs aggregate columns on `realm_resources` |
| `EmpireManagement` (CitiesTab) | Renders + edits individual resource rows via `updateResource()` | Needs replacement editing API |
| `AdminMonitorPanel` (PersistentTab) | Displays resource state for admin monitoring | Needs `realm_resources` equivalent view |
| `GameHubFAB` (Dashboard) | Receives `resources` in props for context | Can be migrated to `realm_resources` |
| `CouncilTab` (Dashboard) | Receives `resources` for council context | Can be migrated to `realm_resources` |

### Removed consumers (dead prop threading cleaned up)

| Component | Status |
|-----------|--------|
| `HomeTab` | ✅ Removed — fetches `realm_resources` independently |
| `EconomyTab` | ✅ Removed — fetches `realm_resources` independently |

## Canonical Replacement Target

`realm_resources` table — single row per player per session with aggregated economic state.

## Migration Path

1. Add per-resource breakdown columns to `realm_resources`: `gold_income`, `grain_income`, `gold_upkeep`, `grain_upkeep`, etc.
2. Update `process-turn` / `commit-turn` to write these new columns
3. Migrate UI consumers (EmpireOverview, LeaderboardsPanel, EmpireManagement, AdminMonitorPanel) to read from `realm_resources`
4. Remove backward-compat write to `player_resources` from turn processing
5. Drop `player_resources` table

## Impact if `player_resources` removed today

- **EmpireOverview**: income/upkeep/surplus display breaks (renders per-resource-type cards)
- **EmpireManagement**: resource editing UI breaks entirely (uses `updateResource()`)
- **LeaderboardsPanel**: economy rankings break (sums resource stockpiles)
- **AdminMonitorPanel**: resource monitoring display breaks

## Naming Note

The UI state variable `armies` maps to the `military_capacity` database table.
This is a legacy naming inconsistency — the UI was named before the table was finalized.
`military_capacity` is also legacy operational support, not true core state.
The canonical military data source is `military_stacks`.
