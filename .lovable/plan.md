# Economy Closure Pass — audit result and plan

## Audit of final code (after previous Economy Pass)
Nearly all items in the follow-up are still open:

| Item | State now |
|---|---|
| Landed input sourcing | Missing — suppliers ranked by route cost/tolls/surplus only |
| Profitability-driven AUTO | Missing — `autoRecipeWeights` defined, never called; `recipeMargin` diagnostics only |
| Input valuation in intermediate_value | Catalogue base price, not acquisition cost |
| Legacy population city wealth / TRADE_BOOM | Still live in process-turn (`computeCityLayerEconomy`, `layers.wealth > 3 && hub`) |
| City trade-service VA | Missing |
| City capital stock | Missing |
| Rice | `harvest_rice -> raw_grain` |
| Tools household flag | `metalwork_tools household: true` (catalog + DB) |
| Zero-input producers | `draw_water`, `cut_peat` role `producer` (catalog, DB, starterEconomy) |
| Quality/mastery | Not re-audited yet; guild_level still hidden |
| Server build validation | BUILD_BUILDING trusts client object; no requires_water check |
| Build catalog coverage / starter viability | To re-verify after fixes |

## Phase 1 — data correctness (small, low risk)
- Catalog + migration: `draw_water`, `cut_peat` → `source`; starterEconomy roles updated.
- `metalwork_tools` household=false; scan other goods for demand-class contradictions.
- New good `raw_rice` (staple_food, direct), `harvest_rice -> raw_rice`, requires river/coast tile; mill_grain unchanged.
- Tests: starter settlement (small/medium pop) produces food + water; source guard still rejects arbitrary zero-input factories.

## Phase 2 — cost loop (canonical Goods solver only)
- `productMarket.ts`: `landedInputCost(sourcePrice, transport, tolls, tariff, risk, lossRate)`.
- `goodsEconomy.ts`: input source ranking by landed cost (capacity/reserve/diplomacy still gates); production_input transfers use landed-cost threshold; intermediate_value uses realized acquisition cost.
- AUTO: recipe allocation weighted by `autoRecipeWeights` using previous-committed-turn prices (no same-pass price loop). PREFER keeps choice + loss flag; LOCK unchanged + loss warning.
- Producer diagnostics: output price, unit input cost, landed cost per import, margin, margin ratio, chosen vs cheaper supplier; shown in production panel.
- Tests: the six listed in section A.

## Phase 3 — city value
- Remove `layers.wealth` from TRADE_BOOM, UI, migration inputs; keep column writes only as legacy zero-effect if needed for compatibility.
- Trade-service VA: service-demand rates (local exchange, import/export, aggregation, reexport, transit) in economyConfig; realized value gated by staffed market/warehouse/port capacity; added to city_gdp and realm value_added_gdp (Σ equality test).
- Prosperity index (derived, bounded) in cityAccounts.
- TRADE_BOOM: service VA above threshold and growth vs trailing committed turns, cooldown.
- City capital stock: new table `city_capital_stock` written only by process-turn (delta = VA × retention − depreciation − war loss); refresh shows candidate delta only. Test: refresh twice leaves stock unchanged.

## Phase 4 — quality, validation, catalog
- Quality: producer craftsmanship = building level + master_craft/guild building tag; output quality = recipe bonus + craftsmanship + bounded input inheritance; test one source→processed→luxury chain reachable via normal upgrades.
- BUILD_BUILDING: resolve template by id server-side; ignore client cost/effects/recipes; enforce requires_water, biome, deposit, settlement level, prerequisites, ownership. BuildCatalogPanel turns water into a hard block with same reason text. Tests listed in section E.
- Build catalog coverage test re-run against final backend.

## Execution
Phases run in order in this pass; each ends with full vitest + typecheck. Test01/Test02 are not mutated; verification uses fixtures/disposable sessions. Final report table as requested.

## Technical notes
- Single source of truth stays `productMarket.ts` / `economyConfig.ts`.
- One additive migration (catalog roles, raw_rice, tools flag, city_capital_stock with GRANTs + RLS).
- Previous-turn prices come from `committed_result`, same mechanism as familiarity/budget.
