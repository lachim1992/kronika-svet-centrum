# Economy implementation progress

## 2026-11-14 — parcel placement recipe-array repair

- Root cause: live `guard_worked_parcel_content` still used the 0022 JSON-to-text[] assignment; existing `0023_fix_rural_site_recipe_guard.sql` was not registered in the migration journal.
- Applied that SQL byte-for-byte through the migration tool as `drizzle/migrations/0024_fix_rural_site_recipe_guard.sql`. Live read-back confirms explicit JSON array expansion, session validation and all-recipes rural classification. No edge-function change/redeployment needed.
- Updated `src/test/rural-site-guard-sql.test.ts` to reproduce the reported `weave_basic` malformed-array error with the old trigger, apply the fix, then repeat the same placement successfully; urban weaving remains rejected on worked parcels.
- Tests actually run twice: rural-site SQL integration + rural-sites, **11/11 passed**. Automatic preview build OK.
- Changed files: registered migration, regenerated client types, regression test, roadmap and this report. No saved games, turns, resources, production coefficients or refreshes changed; no publication. Hosted gameplay placement was not retried because protected worlds must not be mutated.
- Next precise task for this fix: retry the original weaving-building placement through the UI when the player chooses to do so; unrelated production/trade calibration remains deferred.

## 2026-11-14 — demand-aware labour for non-storable subsistence sources

### Scope and changed files

- `supabase/functions/_shared/goodsEconomy.ts`: after the existing subsistence-priority pass, urban non-storable food/water/fuel sources receive no additional workers above total local household need plus the existing `ECONOMY.reserveTurns` buffer. Declared jobs, capacity and output per worker are unchanged; remaining workers are offered to other producers in the same sector. Intentional overcapacity is excluded from structural-mismatch and wage-vacancy calculations. Product-choice calculation is shared between this planning stage and the canonical demand pass.
- `src/lib/economyFieldContract.ts`: canonical `labor[].perishable_demand_limited_jobs` is labelled and rendered through the shared SubsistencePanel in both Economy and Economy Dev Mode.
- `src/test/perishable-labor-demand.test.ts`: regression for fish discard crowding out a mill/bakery, food coverage, output per worker, labour accounting and a real surplus shipment over a road.
- `roadmap.md`: diagnosis, evidence and the next vertical slice.

No catalogue, schema, saved-game, opening-stock, recipe, price or fiscal-writer changes. JV72O7/TEST02 were not refreshed, advanced or otherwise mutated.

### Tests actually run

- The new regression failed on the old engine: 11.807 fish discarded in the synthetic town and 1.0 discarded despite a connected buyer.
- Targeted labour/subsistence/demand/contract suite: 47/47 passed during iteration.
- Final full suite: **926 passed, 3 skipped (112 files passed, 1 skipped)**.
- Automatic preview builds observed `build OK` after the source changes.

### Isolated JV72O7 turn-7 simulation (read-only frozen snapshot, no DB write)

| Metric | Persisted baseline | New isolated result |
|---|---:|---:|
| Total physical output | 85.428 | 78.286 |
| Fish discard | 12.550 | 7.459 |
| Water discard | 6.469 | 2.468 |
| Flour/bread output | 0.068 | 0.110 |
| Total unmet demand | 54.429 | 53.768 |
| Export volume | 0.2286 | 0.2286 |
| Physical conservation errors | 0 | 0 |

The mill/bakery chain improves, but **no additional shipment appears yet**. This slice removes a labour/waste distortion; it does not claim that trade is now vibrant or that missing producers/routes are fixed.

### Deployment status

Deployed source functions: `compute-trade-flows`, `preview-economy`, `commit-turn`, `process-turn`, `command-dispatch`, `backfill-parcel-economy`. No live refresh, process-turn, commit or gameplay acceptance was run after deployment; protected games remain untouched.

### Remaining gaps and one precise next task

Textile/tools/storage still have no producer, AI fuel stocks remain disconnected, and five player cities still share similar basic-output profiles. Global production/demand multipliers remain unjustified.

**Next:** in an isolated JV72O7 snapshot, specialize the existing mill city and its grain-producing neighbours so a canonical `raw_grain` `production_input` shipment occurs over the completed roads while every city's food coverage and physical conservation remain intact; only after that test bounded volume coefficients.
