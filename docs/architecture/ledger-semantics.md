# Ledger Semantics — realm_resources Field Contract

> **Evidence header**
> - Repo snapshot: main @ 2026-04-23
> - Audit date: 2026-04-23
> - Sources: static analysis of src/, supabase/functions/
> - Confidence: FACT unless marked INFERENCE
> - Authority: This document is normative. On conflict with `.lovable/plan.md`, this document wins.

## Schema Guarantee

`realm_resources` has `UNIQUE(session_id, player_name)` (migration 20260220223210).
At most one row per player per session. Dashboard single projector relies on this.

## Field Table

| Field | Type | Writers | Mutation Semantics | Reconciliation Mode | Commands That Mutate | Read-Only Consumers |
|---|---|---|---|---|---|---|
| `gold_reserve` | delta-applied stored ledger | process-turn (income/expenses delta), commands (cost deduction) | `gold_reserve = gold_reserve - :cost` | Delta-only | RECRUIT_STACK, REINFORCE_STACK, UPGRADE_FORMATION, BUILD_BUILDING, START_PROJECT, UPGRADE_SETTLEMENT | ResourceHUD, HomeTab, ArmyTab, EconomyTab |
| `grain_reserve` | delta-applied stored ledger | process-turn (production - consumption delta) | `grain_reserve = grain_reserve + :delta` | Delta-only | (indirect via process-turn) | ResourceHUD, HomeTab |
| `production_reserve` | delta-applied stored ledger | process-turn (production delta), commands (cost deduction) | `production_reserve = production_reserve - :cost` | Delta-only | BUILD_BUILDING, START_PROJECT, UPGRADE_SETTLEMENT | ResourceHUD, HomeTab, CityManagement |
| `mobilization_rate` | command-set absolute | player command only | `mobilization_rate = :newRate` | Command-owned absolute | SET_MOBILIZATION | ResourceHUD, ArmyTab |
| `manpower_pool` | derived/cached | process-turn recomputation | Server-side recompute from population × mob_rate | Server-recomputed | (none directly — derived) | ArmyTab, ResourceHUD |
| `manpower_committed` | command delta-only | commands (recruit/disband/demobilize/remobilize) | `manpower_committed = manpower_committed + :delta` | Delta-only | RECRUIT_STACK, REINFORCE_STACK, DISBAND_STACK, DEMOBILIZE, REMOBILIZE_STACK | ArmyTab, ResourceHUD |
| `city_stability` (on `cities`) | delta-only multi-owner | process-turn, ENACT_DECREE | `city_stability = city_stability + :delta` | Delta-only | ENACT_DECREE | HomeTab, CityManagement |
| `settlement_level` (on `cities`) | command increment only | UPGRADE_SETTLEMENT | `settlement_level = :nextLevel` | Command-owned | UPGRADE_SETTLEMENT | HomeTab, CityManagement |

## Manpower Flow Matrix

| Command | manpower_pool | manpower_committed |
|---|---|---|
| RECRUIT_STACK | no change (derived) | +manpower |
| REINFORCE_STACK | no change | +addedManpower |
| DISBAND_STACK | no change | −returnedManpower (100%) |
| DEMOBILIZE | no change | −returnedManpower |
| REMOBILIZE_STACK | no change | +totalManpower |

## Cost Pool Disambiguation

- **RECRUIT_STACK**: costs `gold_reserve` (gold) + `grain_reserve` is NOT directly deducted (supply is turn-level)
- **BUILD_BUILDING / START_PROJECT**: costs `production_reserve` (materials) + `gold_reserve` (financing)
- **UPGRADE_SETTLEMENT**: costs `production_reserve` + `gold_reserve`. `total_capacity` is checked but NOT consumed.

## Turn-Boundary Rules

1. `process-turn` NEVER absolute-overwrites delta-owned ledgers (`gold_reserve`, `grain_reserve`, `production_reserve`, `manpower_committed`).
2. Command-owned absolute fields (`mobilization_rate`) are read-only for `process-turn`.
3. Dual-owner fields use server-side atomic delta.

## Forbidden Patterns

```sql
-- FORBIDDEN: absolute overwrite of delta-owned field
UPDATE cities SET city_stability = :newValue;

-- CORRECT: delta only
UPDATE cities SET city_stability = city_stability + :delta;
```

## Design Decisions

- **CANCEL_BUILDING refund**: 50% `production_reserve` returned, 0% `gold_reserve`.
- **ENACT_DECREE deltas**: From authoritative lookup catalog (`computeDecreeImpacts`), not client-computed.
- **Single mutation step**: One UPDATE per single-row ledger row per RPC/command execution.

## Invariant Precondition

`military_stack_composition` is authoritative for all active stacks.
`manpower_committed` must equal `SUM(manpower)` from all active stacks' compositions.
