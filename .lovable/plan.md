# Plan: stop the starter-town collapse (food / water / fuel) and fix worker allocation

This is a plan only. No code, data, migration or deploy changes have been made. JV72O7 and every other saved game stay untouched.

## 0. Corrections to the stated findings (checked in the code)
- **Workers are not shared out across the whole city.** In `goodsEconomy.ts` (around lines 366–415), each *sector* has its own labour pool. Within one sector, every producer gets the same `fill = goodsUsed/goodsJobs`. Workers move between sectors only up to `laborMobility`. So node jobs only take staff from the town's farm, fishery or well when they fall in the **same sector** (or draw on the moved workers). Step 1 below first confirms which sector each JV72O7 producer belongs to. Until then, "500 node jobs drain the fishery" is unconfirmed.
- **Node jobs** come from `economyAdapter.ts` (around line 189): `structureJobsBase × levelScale`, so Lv1 = 100 per node. The node's own `population=0` is never used, so the town really does carry those jobs.
- **The water penalty is banded, not a simple "<50%" rule** (`demandModel.ts`, `waterShortageImpact`). Stability loss is 0/0/2/4/8 by band, and deaths happen only in the `critical` band. The −8 you saw belongs to the critical band. The real thresholds are in `DEMAND.needBands` and will be confirmed in step 1.
- **Famine** (`foodShortage.ts`): the flag turns on at a 5% deficit. Deaths are `pop·0.05·ratio`, so an 80% coverage town loses about 1% a turn. That is mild, but the "famine" label overstates it.
- **Starter well:** `starterEconomy.ts` sets jobs with `starterJobsFor`, capped at 30% of population. At 100 people, the 52 workers against 25+30+25 starter jobs fit on their own. The overload comes from the nodes plus the Farm.
- **Starter granary** uses the `build_granary` recipe, which needs lumber. With no lumber in a fresh town it produces nothing. Confirmed: no fuel, clothing or tools source exists.

## 1. Forensics first (read-only)
- Replay the stored JV72O7 turn-2 snapshot through `computeCanonicalEconomy` in a test. Print each producer's sector, jobs, fill and output, and the need-band thresholds.
- Done when we know the exact share of the shortage caused by staffing, versus capacity, versus the missing fuel source.

## 2. P0: put critical needs first when assigning workers
- In `goodsEconomy.ts`, inside the labour pass, add priority tiers:
  - tier 0: food and drinking water, enough to cover subsistence demand;
  - tier 1: a fuel minimum;
  - tier 2: everything else (nodes, industry, exports).
- Fill the tiers in order from *one* city-wide pool: own sector first, then moved workers. Each worker is counted once, and the total must stay ≤ `available_workforce`.
- A tier-0 producer is staffed only up to what it needs for demand, not to fill all its jobs. Any surplus goes to tier 2, so trade and the market still work.
- Report `critical_priority_employed` and `industrial_output_forgone` per city. Map them in `src/lib/economyFieldContract.ts` so the Economy tab and Dev Mode both show them.
- **Node jobs:** when a node has no population, add a cap: its jobs ≤ the share of the owning town's spare workforce left after tier 0–1. Long-term options:
  - **(a) rural workforce:** fold `compute-rural-population` into the economic turn as the node's own labour. This needs a real population ledger, so it is a later phase.
  - **(b) the cap above.** Recommend (b) now and (a) as P2.
- 100 jobs per Lv1 node is unrealistic for a 100-person hamlet. Review `structureJobsBase` for nodes only after the priority fix is measured.

## 3. A playable starter settlement (new worlds only)
- `starterEconomy.ts`:
  - choose the bundle by biome: farm or fishery, plus a well, a spring or a river intake;
  - add a fuel source chosen by geography: wood gathering in forest, peat cutting on bog or wetland, otherwise a small charcoal or dung-fuel recipe tied to real terrain tags;
  - replace the storage that depends on `build_granary` with a storage structure that has no blocked input.
- One-time **bootstrap stock** of 2–3 turns of food, water-equivalent storage and fuel. It is written once by `create-world-bootstrap` / `world-generate-init` into the goods ledger as opening stock, with provenance `bootstrap`. It is not generated each turn.
- Total starter jobs ≤ about 0.9 × available workforce (about 47 of 52). No heavy industry at start: nodes stay below the cap from §2.
- Applies to player and AI realms alike, through the same helper.

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
  - food and water ≥ 100%, fuel ≥ 80%;
  - stability stays between 0.60 and 0.75, with no downward spiral;
  - employed ≤ workforce;
  - same for an AI realm.
- `src/test/jv72o7-fixture.test.ts`: a frozen copy of the JV72O7 turn-2 inputs (JSON fixture). Expect:
  - before the fix it reproduces 80% / 35% / 33%;
  - after the fix, critical coverage rises and `industrial_output_forgone` is reported;
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
