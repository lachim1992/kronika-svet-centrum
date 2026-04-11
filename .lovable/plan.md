

# Economy v4.2 — Final Corrections Integration

## 3 changes to lock before implementation

### 1. City export share — explicit formula

**Current issue**: `city_basket_wealth = BASKET_VALUE × city_export_share × market_fill × city_monetization` is ambiguous.

**Locked definition**:
```text
// Step A: Player gets wealth from global market
player_market_basket_wealth = BASKET_VALUE × player_market_share × market_fill

// Step B: Distribute that wealth among player's cities
city_export_share = city_effective_export / max(1, player_effective_export_total)
city_basket_wealth = player_market_basket_wealth × city_export_share × city_monetization
```

This cleanly separates: player share determines total wealth, city share distributes it.

### 2. Naming — new columns instead of overwriting `wealth_domestic_market`

**Current DB columns**: `wealth_domestic_market`, `wealth_pop_tax`, `wealth_route_commerce`, `goods_wealth_fiscal`, `total_wealth`

**Change**: Do NOT repurpose `wealth_domestic_market`. Instead add two new columns:
```sql
ALTER TABLE realm_resources ADD COLUMN IF NOT EXISTS wealth_domestic_component numeric DEFAULT 0;
ALTER TABLE realm_resources ADD COLUMN IF NOT EXISTS wealth_market_share numeric DEFAULT 0;
```

Pillar 2 in UI = `wealth_domestic_component * 0.4 + wealth_market_share * 0.6` — computed at read time in `economyFlow.ts`. Old `wealth_domestic_market` stays as legacy (not used in new flow).

### 3. Goods basket audit — confirmed issues from live data

**Current state**:
- `goods.demand_basket`: 4 NULL keys (`raw_fiber`, `raw_hide`, `raw_ore`, `yarn`)
- `goods.demand_basket`: Already uses `variety` (correct) and `prestige` (correct) — no legacy `variety_food` or `luxury` in goods table
- `demand_baskets.basket_key`: Still has `variety_food` and `luxury` — these MUST be fixed to `variety` and `prestige`

**Data updates needed**:
```sql
-- Fix NULL goods
UPDATE goods SET demand_basket = 'basic_material' WHERE key IN ('raw_ore', 'raw_hide');
UPDATE goods SET demand_basket = 'textile' WHERE key IN ('raw_fiber', 'yarn');

-- Fix demand_baskets naming
UPDATE demand_baskets SET basket_key = 'variety' WHERE basket_key = 'variety_food';
UPDATE demand_baskets SET basket_key = 'prestige' WHERE basket_key = 'luxury';
```

**Post-update audit queries** (run after data fix):
```sql
SELECT key, demand_basket FROM goods ORDER BY demand_basket NULLS FIRST;
SELECT demand_basket, count(*) FROM goods GROUP BY demand_basket;
SELECT DISTINCT basket_key FROM demand_baskets ORDER BY basket_key;
```

Expected: 0 NULLs in goods, 10 canonical baskets, no `variety_food` or `luxury` anywhere.

## Updated implementation plan summary

All three corrections are integrated into the existing plan. The only structural changes:
- Migration adds `wealth_domestic_component` + `wealth_market_share` (not repurposing old column)
- `compute-trade-flows` Phase 4b uses the two-step city export share formula
- `economyFlow.ts` computes Pillar 2 from the two new columns with 0.4/0.6 weights
- Data fix includes demand_baskets rename + post-fix audit

Everything else from the previous plan remains locked and unchanged.

## Implementation order (unchanged)

1. DB migration (`market_shares` + `city_market_baskets` + two new `realm_resources` columns)
2. Data fix (goods NULL baskets + demand_baskets naming) + audit
3. `goodsCatalog.ts` — BASKET_CONFIG
4. `compute-trade-flows` — auto-production + market share with city export share formula
5. Dev verification (SQL)
6. `process-turn` — legacy blend removal + Pillar 2 from new columns + grain_reserve fix
7. `economyFlow.ts` — Pillar 2 = `domestic * 0.4 + market_share * 0.6`
8. UI components (MarketSharePanel, DemandFulfillmentPanel rewrite)
9. FiscalSubTab + ResourceHUD update
10. Deploy + test

