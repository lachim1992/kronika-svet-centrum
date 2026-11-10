# Plan: stop the starter-town collapse (food / water / fuel) and fix worker allocation

This is a plan only. No code, data, migration or deploy changes have been made. JV72O7 and every other saved game stay untouched.

## 0. Verified findings (corrected)
- **Jobs at JV72O7 turn 2.** Effective building jobs are fishery 30 and well 25, so 55. The starter storage (`build_granary`, which needs 2 lumber) does not run. The player also has a completed Farm with 100 jobs, so the player has 155 building jobs plus 500 node jobs (5 nodes × 100 at Lv1). AI1 has 55 jobs and no nodes; AI2 has 55 + 600. With 52 workers, even 55 is already over capacity.
- **Worker sharing (confirmed in the code and in diagnostics).** `producerSector()` in `goodsEconomy.ts` puts fishery, well and food in the farming sector, together with most resource nodes. Inside a sector, every producer gets the same `fill = goodsUsed/goodsJobs`, which is why fishery staffing is 7.57%. Workers move between sectors only through `laborMobility`. What is left to do is measure the improvement after prioritisation.
- **Node jobs** come from `economyAdapter.ts`: `structureJobsBase × levelScale`, so Lv1 = 100. The nodes' own `population=0` is not used.
- **Water penalty** is banded (`waterShortageImpact`: 0/0/2/4/8 stability, deaths only in `critical`). Famine turns on at a 5% deficit, with deaths `pop·0.05·ratio`.
- **Storage.** `economyAdapter.ts` reads storage from `effects.storage_capacity`/`warehouse_level` + baseline. The starter "Osadní sklad" has only `basket_outputs.storage_logistics` and `build_granary`, with no `storage_capacity` effect.
- **Storability** (from the goods catalogue in the database): `well_water` and `raw_fish` cannot be stored; `raw_grain`, `peat` and `charcoal` can. Step 1 re-confirms this into a JSON fixture with read-only queries.

## 1. Read-only verification (no writes to any game)
- List the code paths actually used: adapter → `producerSector` → labour pass → `foodShortage`/`waterShortageImpact`.
- Use SELECT queries for the goods catalogue status (storable, perishability, substitution).
- Export the JV72O7 turn-2 inputs into `src/test/fixtures/jv72o7_t2.json`. Nothing is written to the database.

## 2. P0: put basic needs first when assigning workers, keep mobility
- In `goodsEconomy.ts`, sort the producers *inside each sector* into tiers:
  - tier 0: food and drinking water, up to subsistence demand;
  - tier 1: a fuel minimum;
  - tier 2: everything else (nodes, industry, exports).
- Fill the tiers in order from that sector's own workers. Unmet tier-0/1 vacancies then draw only on the workers already moved through the existing `laborMobility` (bounded retraining). There is no free city-wide pool.
- Each worker is counted once, and employed ≤ workforce. Above subsistence, tier-0 producers compete normally, so market choices and trade stay.
- Report `critical_priority_employed` and `industrial_output_forgone`, mapped in `economyFieldContract.ts`.
- Node cap: when a node has no population, its jobs ≤ the owning town's spare workers after tiers 0–1.
- Long-term: treat rural workers as node labour once a real population ledger exists (P2).
- Review node `structureJobsBase` only after this change has been measured.

## 3. A playable starter settlement (new worlds only)
- **Site check first.** Starting positions must be valid for settling: reachable water (river, lake, coast or spring) and a food tile. Otherwise move the start (`terrain.ts` `findStartPositions`). Do not add a generic production source to make a bad site work.
- **Bundle by biome:** farm or fishery, plus a water source. Water backup is a second, independent water source, or a later explicit water-storage mechanic (cistern), never stored water from nowhere.
- **Fuel source by geography:** forest gives wood or charcoal, bog gives peat.
- **Starter storage:** give "Osadní sklad" a real `effects.storage_capacity`. Remove the production recipe whose input is blocked. Do not add any recipe without an input.
- **One-time opening stock,** only of goods that can be stored: 2–3 turns of `raw_grain`/`preserved_food` and `peat`/`charcoal`. It is booked in the goods ledger with provenance `bootstrap` and written once.
- Starter jobs ≤ about 0.9 × workforce. Same rules for AI realms.

## 4. Demand and severity
- `foodShortage.ts`: split `food_deficit_minor` (deficit 5–15%, no deaths, −1 stability) from `famine` (>15% or reserve 0 for two or more turns). Exact cut-offs to be tuned in §6.
- Keep water on its own curve.
- Clothing and fuel: slow stability modifier only, no deaths, and only below `minor`.
- Tools: an operating input, never a household need. Remove them from the need coverage shown as starvation, after checking `demandModel.ts` drivers.
- Construction and industrial demand count only when there is an active project or producer (already partly true; to be verified).
- Shortage and its consequences stay for real mismanagement.

## 5. Production chains to check
- raw_timber → lumber → granary/storage/construction
- peat or charcoal (from timber) → fuel
- grain → flour → bakery, plus food substitutes
- New catalogue test: every starter or bootstrap building has a reachable input in each biome fixture. No building may start with a blocked input.

## 6. Tuning (only after §2–§3 are measured)
- Production coefficients, jobs per throughput, farm levels (7/14/28 stays), household demand (`populationDemand`), wages and margins.
- Invariants stay as they are:
  - process-turn is the only writer of fiscal and committed state, and refresh only recomputes;
  - goods balance (production + opening + imports = use + exports + stock + losses);
  - exports only from physical surplus after the subsistence reserve.

## 7. Acceptance tests and KPIs
- `src/test/starter-settlement.test.ts`: a 100-person town in coastal, inland river, dry, forest and bog biomes. Over 5 turns with no player action:
  - only on valid starting biomes;
  - food and water ≥ 100%, fuel ≥ 80%;
  - start stability around 60–75/100;
  - with no outside shock, stability never falls below the safe limit or by more than 5 points in the first 5 turns (rising is fine);
  - no deaths from hunger or thirst;
  - employed ≤ workforce;
  - same for an AI realm.
- `src/test/jv72o7-fixture.test.ts`: a frozen copy of the JV72O7 turn-2 inputs (JSON fixture, never written back to the game). Expect:
  - before the fix it reproduces 80% / 35% / 33%;
  - after the fix, the rise in fishery and well staffing is measured, critical coverage rises and `industrial_output_forgone` is reported;
  - nothing is produced or bought without a physical source.
- Extend `test02-startup.test.ts` to a full bootstrap with nodes and trade.
- 20- and 200-turn simulations, deterministic and repeatable, with exact goods balance.
- A shock case (crop failure or a blocked route) must still create shortage.
- Existing trade, industrial-input and food-security tests must stay green.

## 8. New games versus existing games
- New behaviour turns on with `economy_version` (or a `game_settings` flag) for new worlds only.
- Old games: an admin-only dry-run, read-only, shows before/after for one game. The upgrade is explicit and per game, through an admin function. It is never automatic and never touches JV72O7 without approval.
- The labour-priority change in §2 is a solver rule, so it also changes old games on their next turn. Two options:
  - **(a)** put it behind the same version flag;
  - **(b)** treat it as a bug fix for all games.
  
  This is your decision. Recommendation: (a) first, then (b) after the fixture results.

## Files and order
1. `src/test/fixtures/jv72o7_t2.json` + `src/test/jv72o7-fixture.test.ts` (forensics)
2. `supabase/functions/_shared/goodsEconomy.ts` (labour tiers), `economyConfig` (tier and cap constants), `src/lib/economyFieldContract.ts`
3. `supabase/functions/_shared/economyAdapter.ts` (node job cap)
4. `supabase/functions/_shared/starterEconomy.ts`, `create-world-bootstrap`, `world-generate-init` (bundle and bootstrap stock), `productionCatalog.ts` + catalogue migration for new starter recipes
5. `foodShortage.ts`, `demandModel.ts` (severity)
6. Tests from §7, `roadmap.md`, `docs/architecture/economy-contract.md`

Test commands: `bunx vitest run src/test/jv72o7-fixture.test.ts src/test/starter-settlement.test.ts`, then the full suite and `tsgo -b --noEmit`.

## Effort and risk
- Forensics: small.
- Labour tiers: medium. This is the highest risk, because it changes employment, which feeds wages and GDP.
- Starter bundle and bootstrap: medium, and needs a catalogue migration.
- Severity: small.
- Tests and simulations: medium.
- In total about 5–7 small slices.
- Main risks: changes in old games (handled by the version flag), and opening stock being read as phantom goods (handled by provenance and a one-time write).
