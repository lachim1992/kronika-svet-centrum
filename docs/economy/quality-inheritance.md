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
