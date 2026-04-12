

# Economic Layer Separation — Implementation Plan

## Summary

Split the monolithic `getWealthBreakdown()` into 3 ontologically clean helpers, rewrite FiscalSubTab to show only actual state revenue, create a new MarketPerformancePanel for economic vitality metrics, restructure EconomyTab tabs, and update ResourceHUD tooltip.

## Step 1: Add 3 typed helpers to `src/lib/economyFlow.ts`

After the existing `getWealthBreakdown()` function (which stays with `@deprecated` tag), add:

```typescript
// ═══ METRIC ROLES ═══
// activity: wealth_domestic_component, commercial_retention
// position: wealth_market_share
// fiscal: wealth_pop_tax, tax_market, tax_transit, tax_extraction, commercial_capture, wealth_route_commerce
// control: route_access_factor, isolation_penalty (future)
export type MetricRole = 'activity' | 'position' | 'fiscal' | 'control';

/** ACTIVITY — world economic vitality, NOT state income */
export function getEconomicActivity(realm: any) {
  return {
    domesticActivity: Number(realm?.wealth_domestic_component ?? 0),
    internalRetentionPct: Number(realm?.commercial_retention ?? 0),
  };
}

/** POSITION — trade competitiveness, NOT state income */
export function getMarketPosition(realm: any) {
  return {
    exportPosition: Number(realm?.wealth_market_share ?? 0),
  };
}

/** FISCAL — actual treasury intake */
export function getFiscalIncome(realm: any) {
  const popTax = Number(realm?.wealth_pop_tax ?? 0);
  const marketTax = Number(realm?.tax_market ?? 0);
  const transitTax = Number(realm?.tax_transit ?? 0);
  const extractionTax = Number(realm?.tax_extraction ?? 0);
  const exportCapture = Number(realm?.commercial_capture ?? 0);
  const corridorTolls = Number(realm?.wealth_route_commerce ?? 0);

  // Derived aggregate — legacy compat only, NOT a separate income line
  const goodsFiscalAggregate = Number(realm?.goods_wealth_fiscal ?? 0);

  const tradeTaxes = marketTax + transitTax + extractionTax;
  const externalTradeIncome = exportCapture + corridorTolls;
  const totalIncome = popTax + tradeTaxes + externalTradeIncome;

  const wb = realm?.computed_modifiers?.wealth_breakdown || {};
  const armyUpkeep = Number(wb.army_upkeep ?? 0);
  const tolls = Number(wb.tolls ?? 0);
  const sportFunding = Number(wb.sport_funding ?? 0);
  const totalExpenses = armyUpkeep + tolls + sportFunding;

  return {
    popTax, marketTax, transitTax, extractionTax, exportCapture,
    corridorTolls, goodsFiscalAggregate, totalIncome,
    tradeTaxes, externalTradeIncome,
    armyUpkeep, tolls, sportFunding, totalExpenses,
    netChange: totalIncome - totalExpenses,
  };
}
```

Mark existing `getWealthBreakdown` with `@deprecated` JSDoc tag.

## Step 2: Rewrite `FiscalSubTab.tsx` — fiscal only

Replace the current 4-pillar layout with a clean fiscal-only view using `getFiscalIncome()`:

**Section 1: "Příjmy státu"** — 6 fiscal lines with progress bars:
- 👥 Populační daň (`popTax`)
- 🏪 Tržní daň (`marketTax`)
- 🚚 Tranzitní daň (`transitTax`)
- ⛏️ Extrakční daň (`extractionTax`)
- 🎯 Export capture (`exportCapture`)
- 🛤️ Koridorové mýto (`corridorTolls`)

**Section 2: Expenses** (unchanged structure — army, tolls, sport)

**Section 3: Net + Treasury** (unchanged)

**Remove entirely:** "Obchod a trh" blended pillar, Retention/Capture metric cards (those move to MarketPerformancePanel)

**Keep:** Trade ideology switcher at bottom

## Step 3: Create `src/components/economy/MarketPerformancePanel.tsx`

New component showing economic vitality (not income):

- 🏠 **Domácí ekonomická aktivita** — `getEconomicActivity().domesticActivity` with progress bar
  - Tooltip: "Velikost interně uspokojené poptávky. Není to příjem pokladny."
- 📈 **Exportní tržní pozice** — `getMarketPosition().exportPosition` with progress bar
  - Tooltip: "Obchodní síla na globálním trhu. Determinuje budoucí exportní příjmy."
- 🏠 **Internal Retention** — `getEconomicActivity().internalRetentionPct` as percentage with status text
  - Tooltip: "Podíl domácí ekonomické aktivity, který zůstává interně pokrytý místo odtékání ven."

Small disclaimer text under header: "Tyto ukazatele neznamenají příjem pokladny. Popisují sílu a vitalitu trhu."

Props: `{ realm: any }`

## Step 4: Restructure EconomyTab tabs

Current 6 tabs → 5 tabs:

| Current | New | Change |
|---------|-----|--------|
| 📊 Přehled | 📊 Přehled | Unchanged |
| 📦 Poptávka | 📈 Trhy | Rename + add MarketPerformancePanel at top, keep DemandFulfillmentPanel + MarketSharePanel + move TradePanel here |
| 🔗 Supply Chain | 🔗 Supply Chain | Unchanged |
| 🎯 Mezery | *(removed)* | GapAdvisorPanel already dev-gated; TradePanel moves to Trhy |
| 🏛️ Fiskál | 🏛️ Příjmy státu | Rename, uses cleaned FiscalSubTab |
| 🏙️ Sídla | 🏙️ Sídla | Unchanged |

## Step 5: Update ResourceHUD wealth tooltip

Change the wealth chip derivation (line 142) from blended pillars to fiscal-only using `getFiscalIncome()`:

```
Příjmy: +X/kolo (pop: Y, daně: Z, trasy: W)
Výdaje: -X/kolo
Čistě: +/-X/kolo
```

The three buckets in the tooltip correspond to the three fiscal pillars: population existence, trade taxes, external trade + corridors.

Import `getFiscalIncome` instead of `getWealthBreakdown`.

## Files changed

| File | Change |
|------|--------|
| `src/lib/economyFlow.ts` | Add 3 helpers + MetricRole, deprecate `getWealthBreakdown` |
| `src/components/economy/FiscalSubTab.tsx` | Rewrite to fiscal-only |
| `src/components/economy/MarketPerformancePanel.tsx` | **New** |
| `src/pages/game/EconomyTab.tsx` | Restructure tabs (6→5), add MarketPerformancePanel to Trhy |
| `src/components/layout/ResourceHUD.tsx` | Update wealth tooltip to use `getFiscalIncome` |

## What does NOT change

- No database or edge function changes
- `getWealthBreakdown()` stays as deprecated (no unknown consumers)
- Backend columns keep their names
- `commercial_capture` is strictly **fiscal** — appears only in FiscalSubTab, not in MarketPerformancePanel

## Key decisions per user feedback

- `goodsFiscal` renamed to `goodsFiscalAggregate` internally, never shown as separate UI line
- `commercial_retention` → `internalRetentionPct` (not "satisfaction")
- `commercial_capture` is fiscal only — no dual role
- `totalIncome` structured as `popTax + tradeTaxes + externalTradeIncome` for clarity
- MarketPerformancePanel includes explicit "this is not income" disclaimer
- No top export baskets summary yet (data reliability unconfirmed)
- Přehled tab left unchanged for now (separate future audit)

