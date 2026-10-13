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
