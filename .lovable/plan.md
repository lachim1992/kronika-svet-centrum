# Population, Migration & Route Prosperity — Audit + Staged Plan

Everything in sections A–D and G below was read in code or queried in the live database this turn. Sections E, F, H, I are proposed design.

## A. Verified population writers and call graph

Writers of `cities.population_*` (backend, verified by search):

| Where | What it writes | Trigger |
| --- | --- | --- |
| `commit-turn/index.ts:1713` | all 4 classes + total + stability + legitimacy + development_level, via `computeSettlementGrowth` + `distributePopLayers` | every closed turn (turn-based) |
| `commit-turn/index.ts:1965` | total only, rebellion loss (`max(50, total - popLoss)`) | rebellion |
| `process-turn/index.ts:1405-1412` | `population_total` **and** `population_peasants` only, from `stapleSat` (+0.2% / -0.3%) | every processed turn |
| `process-turn/index.ts:712-718` | 4 class columns for a 5% death toll, total not written | famine/disaster path |
| `world-tick/index.ts:175` | full growth write, same `computeSettlementGrowth` | time-based tick |
| `world-tick/index.ts:607` | total only, loss | crisis |
| `world-tick/index.ts:755-763` | total + peasants, migration in/out via `resolveMigration` | time-based tick |
| `world-layer-tick/index.ts:327-328` | writes column `population` (does not exist) | Phase 7 — dead, see C |
| `resolve-battle/index.ts:434,577` | total only, war losses | battle |
| `command-dispatch/index.ts:967` | total 1000 at founding (from nothing) | founding |
| `command-dispatch/index.ts:1246` | total only, loss | destructive action |
| `mp-world-generate`, `world-generate-init`, `generate-civ-start`, `seed-realm-skeleton` | initial seeding | world creation |

Confirmed consequences:

- **Two growth writers per turn.** `commit-turn` (physics growth) and `process-turn` (staple-based growth) both mutate population in the same resolved turn. The comment in `process-turn` claiming growth was removed is wrong.
- **Class-sum drift is real.** `process-turn:1405-1412` adds `popDelta` to total but `round(popDelta*0.6)` to peasants; the famine path at 712 subtracts from classes but not from total. `population_total == sum(classes)` is therefore violated by design today.
- **No conservation anywhere.** Growth is ex-nihilo; the only transfers are `world-tick` migration, which moves total+peasants only.

## B. Verified duplicated / dead / stale demographic logic

- `physics.ts:116 computeSettlementGrowth` — abstract growth: `POP_GROWTH_BASE + (stability-50)/200 + famine + trade`. The `hasTrade` slot is abused by `commit-turn` to smuggle a civ-DNA bonus (`hasTrade: growthBonus > 0`).
- `demographics.ts:376 computeBirthDeathRate` — a full explicit birth/death model, **called from nowhere** (verified: zero callers). Dead code.
- `cities.birth_rate` / `cities.death_rate` columns exist but **no backend writes them** (verified). `PopulationPanel` reads them, so its "growth" is always 0.
- Two migration implementations: `demographics.ts:159 computeMigrationFlows` (no callers) and `physics.ts:2249 resolveMigration` (used by `world-tick`). A third, `world-layer-tick` Phase 7, is dead.
- `PopulationPanel.tsx:56,76` displays `base_rate (1.2%) × food_surplus × stability × housing` and claims it is computed in `process-turn`. No such formula exists anywhere. Misleading.

## C. Verified schema conflicts

Queried against the live database:

- `cities.population` **does not exist** (only `population_total`). `world-layer-tick` Phase 7 selects and writes `population` → PostgREST error → swallowed by its own `try/catch`. Phase 7 has never moved anyone.
- Phase 7 also selects `cities.hex_q, hex_r` — those columns do not exist (the real ones are `province_q`, `province_r`).
- `city_market_baskets` has `basket_key` and `domestic_satisfaction`; Phase 7 selects `basket_kind` and `fulfillment_ratio` → also invalid.
- Correct, contrary to the suspicion: `cities.overcrowding_ratio`, `epidemic_active`, `migration_pressure`, `housing_capacity`, `mobility_rate`, `last_migration_in/out`, `birth_rate`, `death_rate` all exist.
- `province_hexes` already carries `biome_family`, `moisture_band`, `has_river`, `coastal`, `mean_height`, `forest_density`, `access_score`, `is_passable`, `q/r`, `grid_x/y` — enough for deterministic carrying capacity. It has **no** population columns.
- `node_migrations` exists (`from_node`, `to_node`, `population_delta`, `reason`, `route_id`, `turn_number`).
- `node_turn_state` **does not exist**. `route_state` exists with `lifecycle_state`, `maintenance_level`, `quality_level`.

## D. Reusable existing components

- `goodsEconomy.ts` already computes per-city `workforce` / `workforceRatio`, `laborUsed` per sector, realized vs blocked production with `diagnostics.blocked` reasons, and per-city `transit_importance`, `production_importance`, `aggregation_importance`, `strategic_importance`, plus flows with paths. This is the basis for jobs/opportunity and transit service value — no second solver needed.
- `route_state` lifecycle + the physical road/river graph and city catchment logic already built for trade give generalized route cost and the "blocked route blocks migration" rule.
- `demographics.ts` housing, overcrowding, social mobility, epidemic and policy tables are sound and should be consolidated as the canonical demographic library.

## E. Proposed canonical ownership and turn ordering

One population writer per resolution mode:

- **Turn-based:** `commit-turn` is the sole writer of population and demographic state, in one phase, after the economy pipeline has produced current-turn baskets/flows.
- **Time-based:** `world-tick` calls the same shared resolver; it never has its own formula.
- `process-turn` keeps fiscal ownership and loses all population writes; it may emit demand/satisfaction inputs only.
- `refresh-economy` / `compute-*` stay derived-only: no population, no migration history, no gold.
- Destructive one-offs (battle, rebellion, disaster) stay allowed but must go through a shared `applyPopulationLoss` helper that keeps `total == sum(classes)`.

Ordering per resolved turn: physical recompute → goods/derived metrics (jobs, opportunity, transit value) → process-turn fiscal → population resolver (births/deaths → local migration → network migration, all in one atomic pass) → final aggregates → snapshot.

## F. Proposed schema changes (later phases, not Phase A)

- New `world_cell_population` (session_id, cell q/r, carrying_capacity, rural_population, mobile_population, last_resolved_turn) — slow authoritative rural state. Nothing transient in `province_hexes`.
- New `city_population_ledger` (session_id, turn_number, city_id, births, deaths, local_in, foreign_in, emigration, extraordinary_losses, net) — the decomposition the UI shows, written only on successful turn close.
- Extend `node_migrations` usage rather than replacing it; add `from_cell`/`to_cell` for rural↔city moves.
- Write `cities.birth_rate` / `death_rate` from the canonical calculator instead of leaving them null.

## G. Risks to Economy Integrity

- Transit service value must stay a derived metric feeding a tax base; any direct `trade flow → gold_reserve` path is forbidden.
- Population changes affect demand, so the population resolver must run in the writing turn path only — otherwise refresh idempotence breaks (current tests would catch it).
- Removing `process-turn` population writes changes economic trajectories; needs a shadow comparison before the flag flips.
- `world-layer-contract` K1/K2 must be respected: rural cell population is authoritative state, city catchment projections stay derived.

## H. Phase A file list (audit repair only, no new gameplay)

1. `supabase/functions/process-turn/index.ts` — remove the staple-based population mutation (1405-1412); route the famine death toll (712-718) through the shared loss helper so classes and total stay consistent.
2. `supabase/functions/_shared/demographics.ts` — become the single demographic module; add `applyPopulationLoss` and `normalizeClasses`; mark `computeMigrationFlows` deprecated.
3. `supabase/functions/_shared/physics.ts` — keep `computeSettlementGrowth` as the only growth entry for now, stop the `hasTrade` civ-bonus abuse by passing an explicit modifier.
4. `supabase/functions/commit-turn/index.ts` — use the explicit growth modifier; write class columns through `normalizeClasses`.
5. `supabase/functions/world-layer-tick/index.ts` — delete dead Phase 7 (invalid schema, never executed) rather than repair it; network migration lands in Phase E.
6. `src/components/economy/PopulationPanel.tsx` — remove the fictional formula text; show only what the engine produces.
7. `docs/architecture/economy-contract.md` + `world-layer-contract.md` — record the single-population-writer rule.

## I. Phase A acceptance tests

1. `population_total == peasants + burghers + clerics + warriors` after growth, famine, rebellion and battle paths.
2. Exactly one population writer in a resolved turn (static guard test over `process-turn`/`commit-turn`/`world-tick`).
3. No negative population and no city below the floor.
4. Deterministic: same city state → same growth result.
5. Refresh still cannot change population, gold, fiscal columns or history (extend existing integrity test).
6. Existing economy conservation suite stays green.
7. Static test asserting no code selects `cities.population`, `basket_kind` or `fulfillment_ratio`.

## J. Conflicts with existing normative docs

No conflict found with `economy-contract.md` (it does not currently define population ownership — that gap is the root cause). `world-layer-contract.md` K1/K2 is compatible provided rural population is authoritative state and catchment capture stays derived; the doc's runtime-counter table lists `population` on `cities`, which is a stale name and should be corrected to `population_total` in Phase A.

Recommendation: approve Phase A only. Phases B–H proceed one at a time, each gated on its own tests.
