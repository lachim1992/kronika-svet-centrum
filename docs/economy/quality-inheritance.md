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
