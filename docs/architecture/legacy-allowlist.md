# Legacy Allowlist — Sprint 1

> Files that are explicitly permitted to reference legacy tables
> (`player_resources`, `military_capacity`, `trade_log`) or legacy types
> (`PlayerResource`, `MilitaryCapacity`) during the Sprint 1 hardening window.
>
> **Every file NOT on this list must have zero legacy references after Sprint 1.**

Last verified: 2026-04-20

---

## Frontend allowlist (FE)

These files may still import/reference legacy types or query legacy tables:

| File | Reason | Sprint target |
|---|---|---|
| `src/hooks/useGameSession.ts` | Hook still holds deprecated state + `useGameSessionLegacy()` opt-in | Sprint 3 (migrate consumers → drop) |
| `src/components/EmpireManagement.tsx` | Reads AND mutates via `updateResource()` | Sprint 3 |
| `src/components/LeaderboardsPanel.tsx` | Economy rankings read from `player_resources` | Sprint 3 |
| `src/components/AdminMonitorPanel.tsx` | Cascade deleter + monitoring display | Sprint 3 |
| `src/lib/empireOverviewAdapter.ts` | Type imports for adapter bridge (no queries) | Sprint 3 |

## Backend inventory (BE — Sprint 2)

These edge functions still write to `player_resources`. They are documented but
NOT blocked in Sprint 1. Sprint 2 will cut them.

See `docs/architecture/legacy-backend-inventory.txt` for the grep-compatible list.

---

## Companion files

- `docs/architecture/legacy-allowlist-files.txt` — grep `-f` compatible FE allowlist
- `docs/architecture/legacy-backend-inventory.txt` — grep `-f` compatible BE inventory
