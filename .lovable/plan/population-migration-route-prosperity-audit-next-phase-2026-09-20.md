# Population, Migration & Route Prosperity — Audit + Next Phase

Phase A of this rework was implemented and deployed in the previous turn. This document re-states the audit against the **current** code (verified now, post-Phase-A) and plans the remaining work: a short Phase A-residue cleanup, then Phase B.

---

## A. Current population writers + call graph (verified)

Turn-based chain (verified in code):

```text
useNextTurn / DevTab  →  commit-turn
   commit-turn: physical recompute → aggregate-realm-totals (physical)
              → process-turn (fiscal)            [guardedFiscal]
              → aggregate-realm-totals (final)
              → world-layer-tick (route lifecycle, mythic, cleanup)
              → snapshot (only if the whole pipeline succeeded)
Time-based chain: src/lib/ai.ts → world-tick → aggregate-realm-totals
```

Writers of `cities.population_total` / class columns, verified today:

| Writer | Role | Status |
|---|---|---|
| `commit-turn` settlement growth | canonical turn-based growth, normalized classes | correct |
| `commit-turn` rebellion | loss via `applyPopulationLoss` on post-growth total | correct |
| `process-turn` famine | loss via `applyPopulationLoss` | correct |
| `world-tick` growth (line ~175) | canonical time-based growth | writes `population_total` only |
| `world-tick` disaster loss (~607) | `max(50, total − loss)` | classes not adjusted |
| `world-tick` migration (~755/762) | only live migration; total + peasants | not conserving-safe, peasant-only |
| `world-tick` social mobility | class shifts | needs invariant check |
| `resolve-battle` (~434, ~577) | war losses | total only |
| `command-dispatch` founding (~967) | creates 1000 people ex nihilo | conflicts with target model |
| `command-dispatch` destruction (~1246) | total only | classes not adjusted |
| worldgen (`mp-world-generate`, `world-generate-init`, `generate-civ-start`, `seed-realm-skeleton`) | initial seeding | fine |

`process-turn` no longer contains any growth mutation (staple-based growth removed in Phase A).

## B. Duplicated / dead / stale demographic logic (verified)

- `computeMigrationFlows()` in `_shared/demographics.ts` — zero callers, marked deprecated.
- `computeBirthDeathRate()` in `_shared/demographics.ts` — zero callers; `cities.birth_rate` / `death_rate` are never written by any backend function.
- `world-layer-tick` Phase 7 migration — removed in Phase A (it read columns that do not exist).
- `world-tick` sections labelled "Phase 4 dead metric" (migration pressure, labor allocation) still execute and still write population.
- `RealmDashboard.tsx` invokes `process-turn` directly from the client, outside the `commit-turn` pipeline — a pipeline-ordering hazard worth closing.

## C. Verified schema facts

- `cities`: `population_total` + four class columns, `housing_capacity`, `overcrowding_ratio`, `migration_pressure`, `mobility_rate`, `last_migration_in/out`, `birth_rate`, `death_rate`, `epidemic_active`, `province_q/r`, `settlement_level`. There is **no** `cities.population` and no `hex_q/hex_r`.
- `province_hexes`: full geography (`biome_family`, `moisture_band`, `temp_band`, `has_river`, `coastal`, `mean_height`, `forest_density`, `geology_type`, `resource_deposits`, `access_score`, `is_passable`, `movement_cost`, `seed`) — but **no population columns**.
- `node_migrations` exists: `from_node`, `to_node`, `population_delta`, `reason`, `route_id`, `turn_number`.
- `city_market_baskets` uses `basket_key` and `domestic_satisfaction`.
- `node_turn_state` does not exist.

## D. Reusable components (verified)

- `goodsEconomy.ts` `Flow` already carries `path`, `edges`, `via_hubs`, `gross_value`, `net_value`, `tolls`, `transport_cost` — enough for `transit_service_value` with no second trade solver.
- `metrics` already expose `transit_importance`, `production_importance`, `aggregation_importance`, `strategic_importance`.
- Per-city `workforce` / `workforceRatio`, `laborUsed`, and `diagnostics.blocked` already exist — the basis for real jobs and Opportunity Score.
- The physical route graph (`snapshot.edges`, `route()` with capacity/risk/toll) is the same graph long-distance migration must use.
- `route_state.lifecycle_state` / `maintenance_level` supply route quality friction.

## E. Proposed canonical ownership and ordering

```text
PHYSICAL RECOMPUTE → PHYSICAL AGGREGATES → PROCESS-TURN (fiscal)
  → POPULATION RESOLUTION (single writer, inside commit-turn)
      births/deaths → local migration → intercity migration → class allocation
  → FINAL AGGREGATES → SNAPSHOT (history only on full success)
```

One canonical population resolver module, called by `commit-turn` (turn mode) and `world-tick` (time mode). All losses and transfers go through `_shared/demographics.ts` helpers. `refresh-economy` and `compute-*` stay derived-only.

## F. Proposed schema changes (Phase B)

New table `hex_population` (one row per passable cell): `session_id`, `cell_id` (FK `province_hexes`), `carrying_capacity`, `rural_population`, `mobile_population`, `last_resolved_turn`, timestamps. RLS + GRANTs per session membership; no transient scores stored here.

New table `city_population_ledger` (one row per city per resolved turn): `births`, `deaths`, `local_immigration`, `intercity_immigration`, `emigration`, `extraordinary_losses`, `population_before`, `population_after`. Written only on successful turn resolution.

Later phases add derived (non-authoritative) projections for opportunity score and transit service value.

## G. Risks to Economy Integrity

- Any population write outside the canonical resolver breaks the single-writer rule — the residual writers in section A are the live risk.
- `transit_service_value` must remain derived: trade flow → derived value → tax base → fiscal resolution → treasury. Never flow → gold.
- `world-tick` writing population per city in loops makes conservation hard to assert; it needs the same resolver.
- Client-side `process-turn` invocation can run the fiscal writer out of pipeline order.

## H. Remaining Phase A work (files)

1. `supabase/functions/world-tick/index.ts` — route disaster loss and migration through `applyPopulationLoss` / `normalizePopulationClasses`; make migration transfer conserving (deduct exactly what is added, floors applied before transfer).
2. `supabase/functions/resolve-battle/index.ts` — both loss paths through the shared helper.
3. `supabase/functions/command-dispatch/index.ts` — destructive loss path through the shared helper; add explicit TODO for founding conservation (Phase C).
4. `src/components/RealmDashboard.tsx` — stop invoking `process-turn` directly; use the pipeline entry point.
5. `docs/architecture/economy-contract.md` — record the remaining intentional writers as closed.
6. `src/test/population-ownership.test.ts` — extend with the cases in section I.

No new gameplay, no schema change, no rural population, no opportunity score in this step.

## I. Phase A acceptance tests

- After every touched loss path, `population_total === sum(classes)`.
- `world-tick` migration: total population across all cities is unchanged by migration (conservation), source never below floor.
- No negative class values anywhere; floor 50 preserved.
- Static: no backend file writes population columns without the shared helpers; no `cities.population` / `basket_kind` / `fulfillment_ratio` usage.
- Growth determinism for identical state.
- `refresh-economy` / `compute-*` cannot mutate population, fiscal state, or history.
- Existing 196-test suite stays green.

## J. Conflicts with normative docs

None. `economy-contract.md` now carries INVARIANT 4 (single population writer) and INVARIANT 5 (class sum), and `world-layer-contract.md` records the corrected column names and forbids population writes in the world layer. The target model extends those documents rather than contradicting them; the rural-population and ledger tables are T2 runtime state, which the world-layer contract already separates from the immutable ancient layer.

---

## Current UI pass — population on the map and in Realm

### Goal

Expose already-produced demographic data without adding a writer or changing population mechanics. Every inspected map cell shows its rural population projection, capacity, mobile share, and whether the value is current. The Realm overview gains a dedicated population section with totals, city development, recorded births/deaths/migration/losses, and movement origins/destinations.

### Implementation

1. **Map cell detail**
   - Read `hex_population` alongside `province_hexes` and join by `(session_id, q, r)` in the existing map load.
   - In the selected-cell panel show rural population, carrying capacity, occupancy, mobile population, and last resolved turn.
   - Clearly label Phase B values as a deterministic projection that does not yet affect city population or gameplay; show “not yet calculated” instead of deriving a fallback.
   - Keep the city population separate when a city occupies the cell, so rural and urban residents are never added together as if they were one canonical total.

2. **Realm population view**
   - Add a `Populace` tab under Realm, using a focused realm analytics component rather than overloading the general overview.
   - Read `city_population_ledger` for the player’s cities and aggregate by turn: population before/after, births, deaths, local/intercity immigration, emigration, extraordinary losses, and net change.
   - Show a turn-by-turn trend, the latest causes of growth/decline, and a city table. All numbers come from stored engine output.
   - Read recorded migration events for named origin/destination details. When historic route/reason data is absent, state that it was not recorded; never infer it from current rates or pressure.
   - Keep current city totals/classes and settlement progression visible using the existing `PopulationPanel`.

3. **Truthfulness and integrity**
   - Frontend/read-only changes only: no population, migration, economy, trade, treasury, or history writes.
   - No Test01 turn advancement or live-state mutation.
   - Empty ledger/history states explicitly explain that detailed causes become available only for turns recorded by the demographic ledger.
   - Do not present `birth_rate`, `death_rate`, or `migration_pressure` estimates as recorded births, deaths, or migration.

4. **Verification**
   - Add focused tests for population aggregation and labels where practical.
   - Run the full test suite and rely on the preview build check.
   - Verify the map detail and Realm population view at desktop and mobile widths without changing Test01 data.

### Master-roadmap preservation

This UI pass does not replace or shorten Phases C–H. The original invariants remain binding: migration conserves people; founding becomes rural transfer only in Phase C; `population_total == sum(classes)`; deterministic outcomes; non-negative population; migration caps by source mobility and destination capacity; route blocking affects long migration; transit prosperity derives from canonical flows; refresh remains population/fiscal/history read-only and idempotent; exactly one population writer per mode; no second trade/economy/route/fiscal engine; deterministic 30-turn and preferably 100-turn smoke tests before final cutover.
