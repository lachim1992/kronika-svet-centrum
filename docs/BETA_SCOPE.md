# Chronicle — Beta Scope

> One-page contract. If a change makes the canonical loop weaker or wider, it's out of scope.

## In scope (beta target)

- **1 session, 1 realm, 1 human player** (AI factions optional but not required for the loop).
- **30 turns** must be playable end-to-end without engine or read-path errors.
- **Canonical turn loop**:
  1. **Load** session via `useGameSession` (core: `game_sessions`, `game_players`, `cities`, `realm_resources`, `military_stacks`).
  2. **Command** — every player write goes through `command-dispatch` (single write entrypoint).
  3. **Commit** — turn progression via `commit-turn` (server-owned). Writes canonical state to `realm_resources` and event log.
  4. **Refresh** — `refresh-economy` (4-step safe recompute, no side effects on game time).
  5. **UI refresh** — re-fetch via `useGameSession`. Player-facing panels read **only** from canonical state.
  6. **Chronicle** — narrative entries appended (non-blocking).

## Out of scope (this beta window)

- ❌ **Persistent / time-based tick mode** (`process-tick`, `world-tick` outside commit-turn).
- ❌ **Sport / leagues / academies** (`league-*`, `games-*`, `academy-*`).
- ❌ **Lore-heavy generators** as part of the player loop (`saga-*`, `wiki-*` batch). Allowed as background, never blocking.
- ❌ **Admin/editor surfaces in the player path** (`EmpireManagement`, `AdminMonitorPanel`, `DevModePanel`). Dev-only mounts.
- ❌ **Multiplayer > 2 humans**.
- ❌ **Schema migrations** during this window. Gaps are surfaced in adapters and reports, never masked.

## Source-of-truth pointers

- **Ontology / canonical vs legacy state**: [`docs/architecture/ontology.md`](architecture/ontology.md)
- **What is frozen**: [`docs/architecture/feature-freeze.md`](architecture/feature-freeze.md)
- **Legacy writer audit**: [`docs/architecture/legacy-writer-audit.md`](architecture/legacy-writer-audit.md)
- **Removal order**: [`DEPRECATION.md`](../DEPRECATION.md)
- **Economy model**: [`docs/economy-v4.3-architecture.md`](economy-v4.3-architecture.md)

## Beta player loop — what counts as the player surface

| Surface | Status |
|---|---|
| `WorldTab` → `EmpireOverview` | **Player loop.** Must read canonical (`realm_resources`, `military_stacks`). |
| `HomeTab` | Player signals only. No legacy ledger. |
| `CitiesTab` → `CityDirectory`, `GreatPersonsPanel` | Player loop. |
| `CitiesTab` → `EmpireManagement` | **Dev-only.** Hidden behind `useDevMode`. |
| `LeaderboardsPanel`, `AdminMonitorPanel` | Legacy. Migration after smoke run. |
| `DevTab` → `BetaSmokeHarness` | Dev observability for 30-turn validation. |

## Hard rules for adapters

1. **Never fabricate data.** If a canonical field is missing, return `undefined`. Never `0`, never `""`.
2. **Adapters are beta bridges, not ontology.** Mapping `grain_reserve → "food"` is a UI convenience; it does not redefine the canonical model.
3. **UI renders missing data as `—`**, never as `+0` or `0`.
4. **Schema gaps are TODOs in code**, not silent fallbacks.

## Smoke validation

`BetaSmokeHarness` (Dev only) runs the canonical loop for N turns (default 30) and asserts:

- session loads, `commit-turn` ok, `refresh-economy` 4 steps ok
- adapter view-model is valid (NaN = fail; `undefined` for income/upkeep is expected and OK)
- chronicle count monotonic non-decreasing
- `useGameSessionLegacy()` (opt-in) does not throw when called explicitly
- exactly **one** `realm_resources` row per player per session
- reserve sanity: `gold/grain/wood/stone/iron/horses/labor_reserve >= 0` (negative = warning, not fail)
- turn monotonicity: `current_turn_after === current_turn_before + 1`

On first failure, snapshot `{ turn_number, player_name, session_id, realm_resources_row_id, realm_resources_row_count, stack }` so the bug can be reproduced without replaying 30 turns.

## After this window

Evaluate smoke report → migrate `LeaderboardsPanel` → removal decision for `player_resources` / `military_capacity` / `trade_log`.
