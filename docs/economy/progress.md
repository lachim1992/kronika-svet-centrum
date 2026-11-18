# Economy implementation progress

## 2026-11-18 — consolidated military authority, manpower and parcel follow-up

- `DEMOBILIZE_STACK` and `DISBAND_STACK` now share one server helper: session/player/id filtering, duplicate/missing/inactive rejection, DB-derived `actualSoldiers`, conditional active-only update, `is_deployed=false`, server turn+3 remobilization and server event references. Client `returnedManpower` is ignored. Both commands invalidate the derived economy projection; no refresh was run in this task.
- `applyStackMove` now includes `is_active=true` in its atomic hex update. A regression simulates deactivation after the initial read and proves `RACE_LOST` with unchanged coordinates. Internal `system`/`ai_faction` commands require a verified service-role bearer before the resolving-turn gate; all AI call sites already use the service key.
- One shared military ledger patch updates `manpower_pool`, `manpower_available`, committed/mobilized, over-mobilization and both upkeep values from cities plus active stacks after recruit/reinforce/demobilize/disband/remobilize/set-mobilization. Process-turn uses the same patch and no longer subtracts soldiers twice from `manpower_available`. Unused `MOBILIZE_MANPOWER` is retired fail-closed; ResourceHUD now uses `SET_MOBILIZATION`, and upkeep UI filters inactive history.
- Parcel mode is `Number(version ?? 0) >= 1` (including version 2 and explicit previews). Historical production districts stay visible as inactive legacy, hide functional modifiers and do not consume residential limits. Legacy local grain no longer gates settlement upgrades; physical-food actions without an atomic Goods API remain fail-closed.
- PostgreSQL occupancy tests now cover building↔building and building↔subnode races against one named capacity trigger. One-slot races produce exactly one occupant and at most one subnode payment. The prepared linkage migration remains unapplied. Repository inspection confirmed byte-identical unregistered 0023/registered 0024, unregistered 0016 with live service-role RPC, and missing 0025 snapshot; journal/history was not rewritten.
- Read-only JV72O7 audit remains: 7 building parcel IDs without matching content, 6 content/building mismatches where building parcel is NULL, 5 legacy tile building-pointer mismatches, 0 session mismatches and 0 content rows without a building. No live rows were repaired.
- Verification actually run: focused post-fix set **78/78 passed**; final `bunx vitest run --maxWorkers=4` **1219 passed / 3 skipped** (148 files passed, 1 skipped); `oj typecheck -b --noEmit`, `deno check supabase/functions/command-dispatch/index.ts supabase/functions/process-turn/index.ts`, `git diff --check` and automatic build **OK**. Final read-only SELECT confirms JV72O7 turn 21, no resolving turn and the unchanged 7/6/5/0/0 linkage counts. No deployment, publication, production migration, game-data SQL write, gameplay command, process-turn, commit-turn or economy refresh was performed. Next precise task: separately authorize reconciliation of the missing 0025 snapshot plus forward-only occupancy migration, then deploy and exercise demobilization in an isolated test world.

## 2026-11-18 — legacy food, ration authority and parcel integrity

- The earlier command-authority batch remains intact. New `SET_RATION_POLICY` verifies the seated player's own city/session and takes every effect from shared `rationPolicy.ts`; CityGovernancePanel no longer writes ration policy directly. `RESOLVE_UPRISING/open_stores` fails closed before any write because no canonical physical-Goods loot transaction exists. Retired post-battle decisions remain absent.
- Legacy food side effects were removed without touching historical rows: harvest festivals no longer mint `local_grain_reserve`, collapse wealth shocks no longer delete it, new manual food offers and AI acceptance are rejected, and historical food-labelled L3 routes no longer convert that projection into gold. Production/wealth offers remain available. Physical `process-turn` grain projections are still derived outputs, not a second stock.
- Read-only live-schema audit (SELECT only): 7 `city_buildings.parcel_id` values lack matching content, 6 building/content parcel links disagree, 19 legacy single-building tile pointers disagree, 0 over-capacity parcels and 0 duplicate building contents. All 13 link anomalies are in JV72O7; no rows were repaired. Canonical linkage is `city_buildings.parcel_id` + `tile_parcel_contents`; single-entity tile pointers are legacy because parcels support multiple structures.
- `command-dispatch` now calls `occupy_city_parcel_atomic` for building/district occupancy. Prepared forward-only `supabase/reconciliation/0038_atomic_parcel_occupancy.sql` contains the RPC, parcel-row capacity lock, positive-slot/session checks and building-link triggers. Real PGlite tests prove that two competing one-slot builds produce exactly one occupied building/content and that mismatched, orphaned, detached, foreign and cross-session links fail. `BUILD_SUBNODE` keeps its separate already-atomic payment/capacity path.
- Migration inspection found unlisted 0016 purchase SQL, unlisted malformed duplicate 0023, canonical registered 0024, live capacity trigger missing from history, and a missing 0025 snapshot. No safe repair plan was returned. The candidate SQL and exact reconciliation findings are documented in `supabase/reconciliation/README.md`; the platform-owned journal/history was not edited and no production migration was applied. Deploying the new occupancy command remains blocked until that schema candidate is applied through a separately authorized migration workflow.
- Verification actually run: focused command/food/parcel suite **20/20 passed**; full `bunx vitest run --maxWorkers=4` **1189 passed / 3 skipped** (147 files passed, 1 skipped); `oj typecheck -b --noEmit` clean; `deno check` passed for command-dispatch, commit-turn, process-turn, ai-faction-turn, games-announce and collapse-chain; automatic build reports **build OK**. No deployment, publication, turn, commit-turn, refresh-economy, game command or game-data write was performed.

## 2026-11-18 — authoritative city commands and atomic subnodes

- `BUILD_DISTRICT` now accepts only a canonical district key, verifies session/city/parcel ownership, derives all prices/capacities/effects server-side and rejects abstract production districts at parcel economy version 1+. `SET_DISTRICT_PRODUCTION` is legacy-only and validates the stored canonical blueprint. UI panels and map catalogues use the same catalogue; the duplicated old UI district catalogue was removed. Existing rows were not deleted.
- `UPGRADE_SETTLEMENT` and `UPGRADE_INFRASTRUCTURE` derive targets and nonnegative prices from shared authoritative configurations, verify the seated player and use sequential CAS plus reserve debits. `chargeReserves` rejects negative and non-finite prices. `APPLY_DECREE_EFFECTS` fails closed because current client-written declarations/evaluation summaries cannot authorize rewards; CouncilTab no longer sends those rewards.
- `economyAdapter` excludes abstract production districts only in parcel mode; intentional legacy mode and residential/stability behavior remain. New PostgreSQL RPC `build_subnode_atomic` serializes parcel attempts and atomically checks ownership, turn, capacity and funds, then creates the node/content and debits reserves. Migration `0037_atomic_build_subnode.sql` was applied and generated types updated; no game rows, turns or saved economies were changed.
- Tests actually run: focused security/config/PostgreSQL set **60/60 passed**; final full `bunx vitest run --maxWorkers=4` **1180 passed / 3 skipped** (145 files passed, 1 skipped). `oj typecheck -b --noEmit`, `deno check supabase/functions/command-dispatch/index.ts`, `git diff --check` and the automatic preview build passed. The concurrency test proves one node, one slot and one debit from two competing attempts; spoofed payloads, foreign cities, negative costs, skipped levels and decree rewards are covered against the real edge handler.
- Deployment: no edge-function deployment, frontend publication, live gameplay command, process-turn, commit-turn or economy refresh was performed. Next precise task: after separate approval, deploy command-dispatch and exercise these commands in an isolated test world; immediate decree rewards remain disabled until a server-owned decree-effect record exists.


## 2026-11-18 — tactical battle CP correction (non-economy follow-up)

- Committed code: `b583e823` replaces the rejected 25/50/75 thresholds with 40/56/63. Shared `generalCommand.ts` returns 4 CP without a general or at skill 0–39, 5 at 40–55, 6 at 56–62 and 7 at 63–100. Army and field-battle panels use the same conversion and expose the threshold tooltip. Three battle test files were updated; the reserve-order fixture now targets a genuinely empty cell.
- Tests actually run: targeted battle suite **78/78 passed**; full `bunx vitest run --maxWorkers=4` **1158 passed / 3 skipped** (142 files passed, 1 skipped); `oj typecheck -b --noEmit`, Deno checks for command-dispatch/scenario-simulate and the automatic preview build all passed.
- Live deployment: command-dispatch and scenario-simulate deployed from that commit (source SHA-256 `47a782dafdeed26dc53fee7560162ffb77b59a9f89066ff9ac99f0b350eefcc3` and `472ff01c36ca633a80192ffec043e55082915bcab86dfb13e7f2a6a007df6631`). Empty fail-closed probes returned 400/401. Frontend publication was requested after green tests. No live battle, turn, economy refresh or JV72O7 game-data mutation was performed; live battle UI remains unverified.

## 2026-11-18 — JV72O7 live comfort/trade scenario + editor access

- Scope: only session `d379caff-8992-48e2-9084-7c9d74acceb1` (JV72O7), still turn 18 with no resolving turn. Removed the 8,000-man Player army (deleted) and 7,978-composition-man AI army (deactivated because a legacy lobby FK prevents deletion); retained the separate active 101-soldier Player stack and all generals. All seven cities now have stability 100 and no persisted famine flag.
- Per-city scenario changes, not global formula changes: specialised fish/grain/water/mill/bakery capacities and crews, level-3 wheat farm and seven physical logging camps, four charcoal kilns, storage upgrades and ten existing Player roads raised to capacity 20. Urban mills/bakeries were detached from rural parcel IDs. All mutations went through deployed `admin-dev-write` with session scope and audit rows; its tested allowlist now covers `city_buildings`, `road_segments` and `tile_parcels`.
- Final canonical refresh succeeded with `fiscal_unchanged=true`, no warnings and no turn advancement. Food and drinking-water coverage is 100% in every city. Ten canonical flows carry 3.879 raw_grain, 2.402 flour, 0.741 raw_timber and 4.964 charcoal. Fuel remains scarce in Kwak (39.3%), Qweo (39.2%) and Lambadagrad (38.9%); this is not famine and no global production multiplier was introduced.
- Fixed the actual editor-entry defect: the map workspace intercepted the visible admin button. The button now portals to `document.body`; signed-in browser verification opened the editor, selected Lambadagrad and a highlighted tile, then opened Economy → Markets & Trade with no page errors and no famine banner.
- Changed source files: `src/pages/Dashboard.tsx`, `src/pages/LiveGameEditor.tsx`, `supabase/functions/admin-dev-write/policy.ts`, `src/test/admin-dev-write-policy.test.ts`, `roadmap.md` and this report. Deployed only `admin-dev-write` (final source SHA-256 `23afc61d1cd5fc93f506a29f9ca77ab48cd6423c30da0e6dc9f31c4fdc19c36e`); no migration or publication.
- Verification actually run: full suite **1123 passed / 3 skipped** (137 files passed, 1 skipped), `oj typecheck -b --noEmit`, `deno check supabase/functions/admin-dev-write/index.ts`, production build (27.80 s), and signed-in browser UI checks. Next precise task: decide separately whether this test scenario should receive more forest/peat geography; do not hide the remaining fuel deficit with fictitious stocks.

## 2026-11-18 — JV72O7 committed turn-18 counterfactual audit

- Added `docs/economy/JV72O7-turn18-counterfactual-audit.md`, the exact committed fixture `src/test/fixtures/jv72o7-turn18-snapshot.json` (SHA-256 `2d42f319834b09fe1cd7161830416d4c5792747f7d6a5a7dd1df5aa39980447f`), scenario helper, `scripts/jv72o7-turn18-counterfactual.ts`, invariant tests and roadmap evidence.
- Four isolated in-memory `resolveGoodsEconomy` runs changed only city soldier weights. Baseline control totals match the committed ledger. Peacetime restores Player 851 civilian workers / 711.997 urban employed; canonical caps are Player 255 and AI Frakce 1 13. Actual zero trade follows 94 `source_empty` blockers; peacetime produces one 0.459 raw_timber production-input flow. Conservation residual stays below `5e-16` per balance.
- No production economy formula, game row, turn, migration, deployment or publication changed. The audit identifies extreme test mobilization and a legacy `grain_reserve=1,000,000` mismatch; canonical physical food is `0.002176618755707576`. It also documents downstream staffing before input sourcing as a separate model limitation, not something repaired without a focused contract.
- Tests actually run: **71/71 passed** across five relevant files, including **5/5 new counterfactual invariants**. `oj typecheck -b --noEmit` clean; `bun run build` passed (30.07 s, existing chunk warnings only).
- Remaining gaps: one-step physical counterfactual, not a multi-turn/fiscal simulation; no live cleanup performed. Next precise task: specify a synthetic grain→flour→bread regression where an input-starved downstream line cannot consume crews while a feasible upstream critical line remains idle, then implement input-aware subsistence staffing only if that contract passes without changing declared jobs/capacity.

## 2026-11-14 — repeated game updates

- Removed automatic `seed-city-parcels` invocation from `IsometricSquareMap`: map viewing no longer triggers footprint writes and a second full map load. Founding/explicit rollout remain authoritative.
- `Dashboard` membership/foundation loading now depends on stable user ID and fallback player name, not new player arrays/auth objects. Added architecture rule and `src/test/map-read-only.test.tsx` covering mount, identity/turn changes and remount.
- Targeted component + map visual tests: 4/4 passed. Automatic build OK. Signed-in JV72O7 turn 7 browser: zero requests during 15 seconds idle, zero seed calls, zero page errors; Map→Realm→Map renders correctly. Verification blocked game writes and did not advance/refresh/reset any world. Preview only, no publication.
- Remaining: ongoing idle refresh was not reproducible with writes blocked even before the fix; confirmed auto-write/reload path is removed. Next if symptoms persist: inspect fresh browser network/realtime activity during the reported episode rather than changing economy or game data.

## 2026-11-14 — parcel placement recipe-array repair

- Root cause: live `guard_worked_parcel_content` still used the 0022 JSON-to-text[] assignment; existing `0023_fix_rural_site_recipe_guard.sql` was not registered in the migration journal.
- Applied that SQL byte-for-byte through the migration tool as `drizzle/migrations/0024_fix_rural_site_recipe_guard.sql`. Live read-back confirms explicit JSON array expansion, session validation and all-recipes rural classification. No edge-function change/redeployment needed.
- Updated `src/test/rural-site-guard-sql.test.ts` to reproduce the reported `weave_basic` malformed-array error with the old trigger, apply the fix, then repeat the same placement successfully; urban weaving remains rejected on worked parcels.
- Tests actually run twice: rural-site SQL integration + rural-sites, **11/11 passed**. Automatic preview build OK.
- Changed files: registered migration, regenerated client types, regression test, roadmap and this report. No saved games, turns, resources, production coefficients or refreshes changed; no publication. Hosted gameplay placement was not retried because protected worlds must not be mutated.
- Next precise task for this fix: retry the original weaving-building placement through the UI when the player chooses to do so; unrelated production/trade calibration remains deferred.
- Follow-up crash check: regression now reproduces both `weave_basic` and `build_granary` failures on the old trigger and verifies both placements against applied migration 0024. Tests 11/11 passed again; live trigger remains fixed. Public auth page renders with zero page errors; signed-in gameplay placement remains intentionally unexecuted to avoid saved-world writes.

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

## 2026-11-15 — military-only follow-up
- Changed `siege.ts`, `IsometricSquareMap.tsx`, `siege.test.ts`, roadmap and combat preference memory: capture on physical entry to an unoccupied main-building square; removed central target; miniature owner-colour tower flags. No economy formulas or persisted world rows changed.
- Actually run: siege regression 12/12; automatic preview build OK; signed-in JV72O7 map shows 62 tower flags and army detail with zero page errors. Current game has no active siege, so live capture is not verified and no turn was advanced.
- Deployment: commit-turn deployed, source SHA-256 `a7f22ca913bd12ca65b498b853afb8bee92e19708d6ae0ea2fc7be839e8eddae`; frontend preview changed, publication not performed. Repository commits are managed by the platform, not independently confirmed here.
- Remaining military gap: verify entry-to-capture through an authorized test battle. Economy next task remains the isolated grain shipment scenario above.
- Movement follow-up: `IsometricSquareMap.tsx` reads complete nearby stored subterrain in stable pages before enabling confirmation instead of using a potentially truncated global parcel read; `commands.ts` catches session failures too. New `command-errors.test.ts` + existing movement tests 11/11 passed; build OK; signed-in movement planning opened with no page errors. No game writes; original rejected route unavailable, so exact historical reproduction remains unverified.

## 2026-11-15 — Battle System v1 (field battles)
- Files: `_shared/fieldBattle.ts` (rules), `_shared/unitTypes.ts` (recruit catalogue), `command-dispatch/fieldBattleCommand.ts` (new), `command-dispatch/index.ts`, `FieldBattlePanel.tsx`, `IsometricSquareMap.tsx`, `ArmySquad.tsx`, `ArmyTab.tsx`, `src/lib/turnEngine.ts`, `src/test/field-battle.test.ts`.
- Migration prepared, NOT applied: `supabase/migrations/20261115160000_battle_system_v1.sql` (field_battles.meta, formation check incl. shieldwall/deep/loose, `settle_field_battle` RPC).
- Tests: field-battle 53/53; full vitest 1061 passed / 3 skipped; tsgo clean; deno check command-dispatch clean. Not deployed.
- Next: apply migration + deploy command-dispatch, then play one battle end-to-end.

## 2026-11-18 turn-21 deactivation audit
See docs/economy/JV72O7-turn21-deactivation-audit.md. Tests: full suite 1140 passed / 3 skipped. Next: real Player→AI1 road or physical sea mode for built ports.
