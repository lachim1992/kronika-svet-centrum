

# Economy v4.3 — 12 Civilizational Baskets (Corrected Legacy Remap)

## Summary

Replace 10-basket flat model with 12-basket, 6-tier hierarchy. Fix legacy remap semantics per user feedback. Add unmapped basket warnings. Update all UI in same batch.

## Corrected Legacy Remap

Previous (problematic):
- `variety → storage_logistics` (variety = consumer diversity, not logistics)
- `ritual → admin_supplies` (ritual = cult/prestige, not administration)

**Fixed**:
```text
basic_material → metalwork        (semantically close: raw materials → metal processing)
textile        → basic_clothing   (direct match)
variety        → feast            (consumer variety → celebratory consumption)
ritual         → luxury_clothing  (cult/prestige goods → luxury tier)
prestige       → luxury_clothing  (merge into same luxury bucket)
```

This keeps legacy goods flowing into semantically closer baskets rather than forcing cult goods into civic administration.

## 12 Baskets (unchanged from approved plan)

```text
#  Key                Tier  TierClass   Category
1  staple_food        1     need        universal
2  basic_clothing     1     need        universal
3  tools              1     need        universal
4  fuel               1     need        universal       (NEW, 70% baseline)
5  drinking_water     2     civic       conditional     (NEW, 80% baseline)
6  storage_logistics  2     civic       conditional     (NEW, market_level≥1)
7  admin_supplies     2     civic       conditional     (NEW, pop≥300)
8  construction       3     upgrade     universal
9  metalwork          3     upgrade     conditional     (soft gate: ore local=full, import=50%, none=0)
10 military_supply    4     military    conditional     (warriors/total>0.05)
11 luxury_clothing    6     luxury      premium
12 feast              6     luxury      premium
```

## Unmapped Basket Warning

Both solver and client will include:
```typescript
const LEGACY_BASKET_MAP: Record<string, string> = {
  basic_material: "metalwork",
  textile: "basic_clothing",
  variety: "feast",
  ritual: "luxury_clothing",
  prestige: "luxury_clothing",
};

function resolveBasketKey(raw: string, warnings?: string[]): string {
  if (BASKET_CONFIG[raw]) return raw;
  const mapped = LEGACY_BASKET_MAP[raw];
  if (mapped) {
    if (warnings) warnings.push(`Legacy remap: ${raw} → ${mapped}`);
    return mapped;
  }
  if (warnings) warnings.push(`Unknown basket_key: ${raw}, fallback to staple_food`);
  return "staple_food";
}
```

Solver returns `warnings[]` in response JSON. Client logs unknown keys to console.

## Files Changed

### 1. `src/lib/goodsCatalog.ts`
- Add `BasketTierClass` type: `"need"|"civic"|"upgrade"|"military"|"prestige"|"luxury"`
- Add `phaseActive` field to `BasketConfig` (flags for which mechanics are active)
- Replace 10-entry `BASKET_CONFIG` with 12 entries using new tier classes + metadata fields (`resourceDependencies`, `productionInputs`, `stateEffect`, `marketability`, `uniqueProductSlots`, `routeEffect` — all metadata-only, marked inactive via `phaseActive`)
- Replace 10-entry `DEMAND_BASKETS` with 12 entries
- Add `LEGACY_BASKET_MAP` + `resolveBasketKey` helper
- Update `TRADE_PRESSURE_WEIGHTS` keys: `{ need: 1.0, civic: 0.7, upgrade: 0.6, military: 0.5, luxury: 0.3 }`
- Update `MACRO_DERIVATION` sources to reference new basket keys
- Comment: `// prestige tier class reserved for Phase 2 — no baskets use it yet`

### 2. `supabase/functions/compute-trade-flows/index.ts`
- Replace 10-basket `BASKET_CONFIG` with 12-basket version (same keys/rates as client)
- Add `LEGACY_BASKET_MAP` + `resolveBasketKey` with warnings collection
- Update conditional gates: soft gates for `metalwork` (ore deposit check with 50% import fallback), `drinking_water` (80% min), `fuel` (70% min), `storage_logistics` (market≥1), `admin_supplies` (pop≥300)
- Update `PRESSURE_WEIGHTS` to tier-class-based
- All `good?.demand_basket` references go through `resolveBasketKey`
- Replace hardcoded fallback `"basic_material"` with `resolveBasketKey(good?.demand_basket || "staple_food", warnings)`
- Return `warnings` array and `unmapped_count` in response JSON
- **No stateEffect/routeEffect application** — pure solver

### 3. `src/components/economy/DemandFulfillmentPanel.tsx`
- Replace `LAYER_META` (3 layers) with 5 layers:
  - **NEED** 🔴: `staple_food`, `basic_clothing`, `tools`, `fuel`
  - **CIVIC** 🟢: `drinking_water`, `storage_logistics`, `admin_supplies`
  - **UPGRADE** 🟡: `construction`, `metalwork`
  - **MILITARY** ⚔️: `military_supply`
  - **LUXURY** 🔵: `luxury_clothing`, `feast`
- Update iteration from `["need","upgrade","prestige"]` to `["need","civic","upgrade","military","luxury"]`
- Import `resolveBasketKey` and apply to `basket_key` from DB rows

### 4. `src/components/economy/GoodsDemandSubTab.tsx`
- Update `TIER_LABELS`: `{ 1: "Need", 2: "Civic", 3: "Upgrade", 4: "Military", 5: "Prestige (reserved)", 6: "Luxury" }`
- Update `TIER_COLORS` to match

### 5. `src/components/map/EconomyFlowOverlay.tsx`
- Update macro category colors/labels to include `civic` and `military`
- Apply `resolveBasketKey` when reading `basket_key` from DB data

### 6. `src/components/WorldHexMap.tsx`
- Update legend entries for 5 active tier classes

### 7. Dev panels
- `GoodsEconomyDebugPanel.tsx`, `DevNodeEditor.tsx` — import updated `DEMAND_BASKETS` (automatic via import)

## Execution Order

1. `goodsCatalog.ts` — new 12-basket model + legacy remap helper
2. `compute-trade-flows/index.ts` — mirror baskets, soft gates, legacy remap with warnings
3. `DemandFulfillmentPanel.tsx` — 5 layers
4. `GoodsDemandSubTab.tsx` — tier labels
5. `EconomyFlowOverlay.tsx` + `WorldHexMap.tsx` — legend
6. Dev panels (if needed)

## Constraints (explicit in code)

- `stateEffect`: inactive metadata only
- `routeEffect`: inactive metadata only
- `uniqueProductSlots`: inactive metadata only
- `prestige` tier class: reserved for Phase 2
- `drinking_water`/`fuel`: simplified baseline, not environmental simulation
- Legacy remap is **temporary bridge**, not final semantics (marked in comments)

