# Quality inheritance (grain → flour → bread)

## Current model
- `productMarket.outputQuality`: source recipes get quality = craftsmanship; processing recipes are capped at
  `min(input quality) + qualityInheritanceHeadroom` (1); recipe bonus added; capped at `maxQuality` (3).
- `goodsEconomy` uses the weighted average quality of each consumed input stock, and the weakest input sets the ceiling.
- Quality raises value by `qualityPremium` (15 %/point) in price, GDP and input value.

## Change (2026-10-12)
The city ideology multiplier (for example guild_chartered ×1.1) used to be applied **after** the inheritance ceiling,
so a guild city could turn grain of quality 0 into flour of 1.1 and bread of 2.2. That broke the ceiling and grew with each step of the chain.
Ideology now scales craftsmanship (`craftFactor`) **before** the ceiling. Result: flour 1.0 and bread 2.0.
Test: `src/test/quality-inheritance.test.ts`.

## Remaining tasks
- Imported inputs mix into the destination stock average; quality per source lot is not tracked.
- `recipe.minQuality` is 0 for every catalogue recipe, so the quality gates are never used.
- Source quality ignores land fertility/irrigation (`irrigation` affects quantity only).
- Headroom is global; per-recipe headroom (e.g. a master bakery) is not modelled.
- Live ledgers committed before this change keep their old quality values (no retroactive repair).

## Regression tests (2026-10-12, after 1097e5b8)
`src/test/quality-inheritance.test.ts` now also runs the real solver with grain crafted at 0/0.5/1/2 plus a quality-3 opening lot.
It checks flour ≤ grain + headroom, bread ≤ flour + headroom, and that fame changes only `fame_factor`, never `quality_factor`
(local price = base × scarcity × quality × fame, each applied once). Result: 7/7 passed, no new bug found, no engine change.
Next task: per-lot provenance for imported grain (see remaining tasks).

## Quality lots and provenance (2026-10-13)
`goodsEconomy` now keeps an in-pass lot composition for each city × good balance: `{qty, quality, origin}`.
This is not a second ledger. Lot quantities are always rescaled to `available(balance)`, so physical conservation and the balance API stay unchanged.
- Opening stock creates a lot with its own quality. Production creates a lot of the output quality, with origin = producing city.
- **Producers** draw lots FIFO (oldest first). The input quality used for the inheritance cap, `minQuality` and input value
  is the quantity-weighted quality of the **drawn batch**, not the city average.
- **Transfers/imports** draw lots FIFO at the source and deliver them to the destination with origin and quality preserved
  (scaled by transport loss). `flow.quality` is the quality of the shipped batch.
- Households, state use and spoilage drain the stock proportionally (they do not pick lots).
- `balance.quality` = weighted quality of the **remaining** stock after draws (previously consumption did not change it).
- New observational field `diagnostics[].input_lots[] = {good, qty, quality, origins: {city: qty}}`. It shows the last pass for each producer.
Tests (`src/test/quality-inheritance.test.ts`): q3 opening lot milled first (flour follows the batch, above the old average cap);
imported q2 grain keeps origin `a` and quality 2 through the flow → mill → bread chain; the cap holds on the consumed batch; conservation holds.
Full suite: 554 passed, 3 skipped; app and edge type checks clean. Not deployed.

### Remaining gaps
- Lots do not persist between turns: the next turn's opening is still one averaged lot per city × good.
- FIFO is fixed; there is no quality-seeking (best-first) or cost-based lot choice by recipe.
- When a producer runs across multiple passes, `input_lots` keeps only the last pass.
- Household/state consumption does not choose by quality; `recipe.minQuality` still tests the remaining average before drawing.
- Per-recipe headroom, land-based source quality and recipe-specific input weights are still open.
Next task: persist lot composition (quality + origin) into the next turn's opening stock.

## 2026-10-14 — lots persist across turns
- `Balance.stored_lots` (closing batch composition of `stored`; capex/spoilage drain proportionally) → `economyAdapter` passes it as `Opening.lots` of the next turn. Same ledger row (`economy_turn_ledgers.result.balances`), no parallel ledger.
- Opening lots are accepted only if they sum to `qty`; otherwise one lot at the average quality (no invented units). Old ledgers without lots fall back the same way.
- Tests: two-turn material balance + carried origin/quality into the mill; mismatch fallback. Full suite 556 passed / 3 skipped.
- Remaining gaps: inventory bootstrap (`city_inventory`) has no origin; FIFO only (no quality/cost choice); minQuality still checks city average; per-recipe headroom, land-based raw quality, recipe input weights open; not deployed.
- Next task: deploy compute-trade-flows/process-turn and verify `stored_lots` appears in a TEST02 ledger after one committed turn.

## 2026-10-15 — minQuality checks the allocated lots
- Audit of 580a6c8: the two-turn test passes. Storage cap, capex and spoilage drain lots proportionally, so `stored_lots` sums to `stored` and keeps quality/origin shares (new storage-cap test). No bug found.
- `recipe.minQuality` no longer compares the city average. Usable input = lots with quality ≥ minQuality (`eligibleQty`). The producer draws FIFO **only from those lots** (`drawLots(..., minQ)`). Lower-quality lots stay in stock, so nothing is consumed twice and no new ledger is added. The 0..3 scale is unchanged.
- Tests: q0+q3 mix with minQuality 2 (average 1.5) mills only the q3 batch; with only q0/q1 stock and minQuality 2, nothing is produced and the grain is untouched.
- Remaining gaps: remote suppliers are still pre-filtered by their average quality, and `transfer` ships FIFO without a quality filter. Imported low-quality lots arrive, but they are never used for that recipe. Every catalogue recipe still has minQuality = 0. The `city_inventory` bootstrap has no origin. Not deployed.
- Next task: quality-filtered remote sourcing (supplier eligibility + transfer by minQuality).
- 2026-10-15 (2): two-turn minQuality test. Opening q0+q3 lots, minQuality 2. Turn 1 mills only q3, and the q0 lot is carried to turn 2 via `stored_lots`. Turn 2 consumes at most the carried q3 remainder, never the q0 batch, and the material balance closes in both turns. The adapter needed no change: `Opening.lots` is still built from `stored_lots`. Full suite 560 passed / 3 skipped; edge type check clean. Next task is unchanged: quality-filtered remote sourcing.

## 2026-10-15 — quality-filtered remote sourcing
- Input sourcing in `goodsEconomy` skips a supplier unless it holds ≥ `minLot` in lots with quality ≥ recipe `minQuality` (was: supplier city average).
- `transfer(..., minQ)` caps the shipped quantity at the eligible lots and draws them FIFO among eligible lots only; origin and quality are kept in transit. Household/arbitrage transfers are unchanged (minQ = −∞).
- Tests (two cities, mill minQuality 2): supplier with q0 (oldest) + q3 ships only q3, provenance `x` reaches the mill, balance closes; a supplier with only q0 is skipped (no import, no flour). 17/17 in `quality-inheritance.test.ts`.
- Not deployed.

### Remaining gaps
- Landed-cost ranking (`landedRoute`) still prices the supplier at its average-quality price, not the eligible-lot price.
- Catalogue recipes all have minQuality 0, so the rule is inert in live play until recipes set minimums.
- Opening stock without carried lots has no origin; 0..100 scale migration, A/B/C factor split, wages/capital cost and value-added money flows remain open.
Next task: price the eligible-lot quality in supplier ranking, then set real minQuality on bread/wine recipes via migration.

## Change: supplier ranking at eligible-lot quality (after e3e7d1d)
- `goodsEconomy.landed(src,dst,g,minQ,wanted)` now values the factory input source price at
  `base × scarcity × (1 + eligibleQuality × qualityPremium)`, where `eligibleQuality` is a read-only
  FIFO peek (`peekQuality`) of the lots ≥ recipe `minQuality` that would actually ship. The city
  average quality and the fame factor are no longer part of the factory landed price (fame stays a
  consumer-WTP effect only; quality applied exactly once).
- Suppliers without ≥ `minLot` eligible lots are filtered out before ranking.
- The transfer landed-cost cap uses the same eligible-lot price.
- Diagnostics `margin.inputs[].ranked_suppliers[]` gain `eligible_quality`, `source_scarcity_factor`,
  `source_quality_factor` (observational only).
- Tests (`src/test/quality-inheritance.test.ts`): A (average 0.75, eligible q3) vs B (all q2), minQuality 2 →
  B ranked first and chosen, all flows from B at q2, mill lot origin B, A exports 0, price parts sum to
  landed, balance closes; famous source → factory source price carries no fame.

## Catalogue minQuality (verified in DB, no change made)
Live `production_recipes.min_quality_input` is already non-zero for guild/luxury recipes only:
age_wine 1, bake_refined 1, build_luxury 1, craft_jewelry 2, craft_ritual 1, embroider_fine 1,
forge_fine_arms 1, prepare_feast 1, weave_fine 1. All basic chains (mill_grain, bake_staples,
press_wine, …) are 0, so the early economy is not gated. The earlier note "all recipes minQuality 0"
was wrong. Risk noted: craft_jewelry needs raw_ore ≥ 2, but source quality comes only from craft
(no land-based ore quality) — on TEST02 max raw_ore quality is 0, so jewelry is currently unreachable.

## Remaining gaps
- `productionCatalog.ts` mirror does not carry min_quality_input (DB authoritative; no audit test yet).
- Jewelry ore gate vs missing land-based raw quality; FIFO only; no-origin bootstrap; 0..100 migration.
- A/B/C input classification, wages/capital cost, value-added money flows — not started.

## Next task
A/B/C classification of inputs in the existing production catalogue (contract field + audit test), no new ledger.

## Checkpoint: A/B/C input classes (after a0f29f5)
Verified first: a0f29f5 contained only the eligible-lot supplier ranking + docs (2 tests); no A/B/C existed
(only city-level tool coverage/wear in goodsEconomy), so nothing was duplicated.
- New contract `_shared/inputKinds.ts`: `kind` = material (A, default) | factor (B) | operating (C), `wear`,
  `factorFloor` 0.6, `defaultWear` 0.05, `consumedPerBatch`, `factorMultiplier`, `parseInputItem`.
- goodsEconomy: A unchanged. C consumed and gating like A, but excluded from minQuality and the quality
  ceiling. B: requirement = capacity × allocation × qty/batch, claimed per city/good (no shared counting),
  saturating productivity `floor + (1−floor)·coverage` in `factors.capital`; only `wear × qty` per batch is
  drawn from lots (`input_lots[].kind='factor'`) and valued in intermediate consumption. Producers with an
  explicit tools factor are excluded from `toolWearOf`/`toolFactor` (no double charge).
- Adapter (AUTO expected cost, availability) and Dev Mode BOM use `consumedPerBatch`; B factors never mark
  a recipe unavailable or block catalogue reachability.
- Catalogue + DB (migration 0004): `mill_grain` = A raw_grain 3, B metalwork_tools 1 (wear 0.05).
  bake_staples is NOT given a C fuel input in the live catalogue yet (would hard-gate staple bread before a
  fuel-supply audit); C is verified in solver tests only.
- Tests `src/test/input-kinds.test.ts` (6): wear-only consumption + balance + cost line; floor/saturation/half
  coverage; two mills cannot share tools; fuel consumed per batch and binding; q0 fuel neither caps bread
  quality nor is blocked by minQuality 2; catalogue contract/audit/reachability.
- Full vitest 570 passed / 0 failed / 3 skipped; deno check of goodsEconomy, economyAdapter, process-turn,
  economy-dev-snapshot, compute-trade-flows, refresh-economy clean. Pre-existing unrelated type errors when
  checking all `_shared/*.ts` at once: buildCatalog.ts:245, terrain.ts:620. Not deployed.

### Next task
Fuel-supply audit (peat/charcoal reachability per start region), then add C fuel to bake_staples/smelting
via migration; classify remaining recipes (pottery/tools as B where appropriate) one chain at a time.

## Checkpoint: fuel audit + B-factor replacement demand
- Re-verified: input-kinds (7) + quality-inheritance (19) tests pass; A/B/C already present — not rewritten.
- Fuel audit TEST02 (latest ledger, 16 cities): peat produced in 2 cities (≈0.3/turn), charcoal in none,
  no recipe consumes fuel. Decision: do NOT add C fuel to bake_staples yet — it would stop staple bread in
  14/16 cities. Precondition: fuel sources reachable from every start region (map generation / peat+charcoal).
- Defect fixed: excluding explicit-tool producers from city tool wear also removed their tools demand, so
  nothing ever replaced worn mill tools. `factorToolDemandOf` now adds, per city, expected wear at staffed
  capacity + (requirement − opening stock) in physical units, through the same industrial_operational
  channel (divided by toolMaintenanceRate, so the channel yields exactly those units). Counted once.
- Test: mill without tools → +5 + 0.25·staffing tools demand; with full stock → +0.25·staffing only.
- Full vitest 571 passed / 0 failed / 3 skipped; edge check (goodsEconomy, commit-turn, compute-trade-flows,
  economy-dev-snapshot) clean. Deployed commit-turn, compute-trade-flows, economy-dev-snapshot.
  No fiscal writer added (solver only; refresh stays derived, process/commit-turn sole fiscal path).

### Next task
Factor sourcing: let B-factor gaps be filled by import through the existing transfer()/landed ranking
(today only local tool stock counts), then live TEST02 refresh check of mill capital factor.

## Checkpoint: wages + fully loaded producer cost (after 8d35ac6)
- Re-verified A/B/C: 571 tests green before changes; no defect found beyond the replacement-demand fix already in.
- `productMarket.localWage` (base 0.03/worker/turn, +0.6×vacancy share, −0.4×unemployment share, bounded
  0.6–2×) from the canonical labour market; `laborMetrics[].wage_rate`.
- `productMarket.producerAccount`: payroll = employed × wage; value_added = revenue − intermediate (A/C inputs +
  B wear); full_cost = intermediate + payroll; operating_surplus = VA − payroll; unit_full_cost; capital_wear
  reported (already inside intermediate — charged once). Stored in `diagnostics[].margin` (diagnostic_version 3).
- Dev Mode costs: "Práce (mzdy)" and "Opotřebení nástrojů" now known per producer when v3 data exists; capital
  depreciation of buildings, overhead and taxes stay "nedostupné".
- City accounts: `producer_payroll`, `producer_operating_surplus`, `wage_rate` reported for reconciliation.
  Household income is STILL the labour-share GDP proxy — switching it to payroll changes affordability
  game-wide and needs a balancing pass (open).
- No fiscal writes: everything is ledger/diagnostic; process/commit-turn remain sole fiscal path; refresh derived.
- Tests: 573 passed / 0 failed / 3 skipped; edge check clean. Deployed commit-turn, compute-trade-flows,
  economy-dev-snapshot.

### Remaining (honest)
Household income from payroll + surplus distribution (balancing), money-flow closure (who pays wages in cash),
building depreciation/overhead per producer, taxes per producer, C fuel in live catalogue (fuel supply first),
B-factor imports, other recipes A/B/C, UI for players (Founder Safe Mode), AI use of producer accounts,
0..100 quality migration, 200-turn simulation, TEST02 live verification.

## Checkpoint 2026-10-15 — výrobní nákladová kalkulace A/B/C
- Audit: canonical owner = `productMarket.producerAccount` volaný z `goodsEconomy` (margin, diagnostic_version 3). Žádná paralelní kalkulace.
- `margin.cost_breakdown` = material (A) + operating (C) + factor_wear (B) = intermediate; `payroll_imputed`; jednotkové hodnoty; `labor_per_unit`.
- Mzdy NEJSOU vypláceny: `payroll_basis:'imputed'`, `cash_settled:false`; Dev Mode ukazuje práci s provenance `imputed`, ne `producer_exact`.
- Test: input-kinds.test.ts (součet tříd = intermediate, jednotkový full cost). 574 passed / 3 skipped.
- Další krok: skutečné peněžní vyplácení mezd v process-turn (jediný fiskální writer) + příjmy domácností z mezd.

## Checkpoint — canonical wage settlement (2026-10-15)
- New `_shared/wageSettlement.ts` (`settleWages`), called only by `process-turn`; result stored in `realm_resources.computed_modifiers.wage_settlement` through `apply_goods_fiscal_plan` (turn guard ⇒ a retry is a no-op; `settleWages` also returns the persisted record when `prior.turn === turn`).
- Money flow: producer cash pool = city goods value added (revenue − purchased inputs) → wages paid = min(payroll due + arrears, pool) → household wage income = wages paid; rest = producer retained; unpaid = arrears carried to next turn. Treasury effect 0 (gold_reserve/turn_fiscal_delta unchanged) ⇒ no money created.
- REAL (settled) values: wages_paid, household_wage_income, arrears, producer_retained (per realm, per city, per turn).
- STILL IMPUTED: the payroll due itself (local wage × employed in goodsEconomy margin, `payroll_basis: 'imputed'`); the producer cash pool is a flow, not a persisted cash stock; household purchasing power in `cityAccounts` still uses the 65 % GDP proxy and does NOT yet read wage income (switch requires balancing).
- refresh-economy untouched. Tests: `src/test/wage-settlement.test.ts` (conservation, 2-turn arrears, idempotence, no negatives). Full suite 574 passed / 3 skipped; `deno check process-turn` clean.
- Next: feed previous committed `household_wage_income` into household purchasing power (replace proxy) behind a balancing test; persist producer cash stock.

## Checkpoint 2026-10-15 — wage vs. purchasing-power reconciliation
- `wageSettlement.ts` now records per city `imputed_labor_income` (cityAccounts proxy), `imputed_minus_settled`, `settled_share_of_imputed`; totals likewise; `household_income_basis: 'imputed_proxy'`.
- Payment unchanged: treasury_effect 0, settled once by process-turn. Purchasing power still uses the imputed GDP proxy.
- Test: wage-settlement reconciliation case. 578 passed / 3 skipped; process-turn deno check clean.
- Next: once the gap is measured on TEST02, switch `cityAccounts` labour income to previous-turn settled wages (one lag, no same-pass loop) with recalibrated incomeUnitFactor.

## Checkpoint 2026-10-15b — settled wages in city accounts (diagnostic)
- economyAdapter reads last committed `realm_resources.computed_modifiers.wage_settlement.cities[].wages_paid` → `Snapshot.settledWages` (read-only; refresh never writes).
- `cityAccounts` reports `settled_wage_income`, `settled_wage_ratio` (paid ÷ VA×laborShare), `labor_income_basis: 'imputed_proxy'`. Purchasing power unchanged.
- Test in product-market.test.ts. 579 passed / 3 skipped; deno check clean (process-turn, commit-turn, compute-trade-flows, economy-dev-snapshot). Not deployed.
- Next: measure settled_wage_ratio on TEST02, then make labour income = settled wages (one-turn lag) with recalibrated incomeUnitFactor; capital income from producer_retained distribution.

## Checkpoint 2026-10-15c — paid wages drive household labour income
- `cityAccounts`: labour income = last committed `wages_paid` × incomeUnitFactor when a settlement exists (`labor_income_basis: 'settled_wages'`); otherwise legacy proxy VA×laborShare (`'imputed_proxy'`). Capital income still proxy.
- No money creation: wages are only those already moved producer→household by process-turn; refresh reads, never writes. One-turn lag, no same-pass loop.
- 579 passed / 3 skipped; deno check clean. Not deployed.
- Limitations: incomeUnitFactor not recalibrated for paid wages (expect lower affordability where producers' cash < payroll); capital income not yet from producer_retained; settlement is per realm city list (cities without settlement fall back).
