

# Sjednocení Wealth systému — 4 pilíře

## Současný stav (problémy)

1. **Magic blend**: `combinedWealth = wealthFromLayers + wealthFromNodes * 0.3 * legacyBlend` (řádek 717 process-turn) — neprůhledný koeficient
2. **Bug**: process-turn zapisuje `tax_pop` ale sloupec se jmenuje `tax_population` → data se nezapisují
3. **Žádný route commerce**: province_routes mají `capacity_value`, `economic_relevance`, `damage_level`, `controlled_by` — ale nikdy negenerují wealth
4. **Existující sloupce v realm_resources**: `tax_market`, `tax_transit`, `tax_extraction`, `tax_population`, `commercial_capture`, `commercial_retention`, `goods_wealth_fiscal`, `total_wealth`

## Architektura po změně

```text
WEALTH INCOME (4 pilíře)
├─ 1. Population Tax (wealth_pop_tax)
│   = pop × 0.002 × polis_bonus × taxMult
│   Přejmenovano z totalCityWealth → population_tax_base
│
├─ 2. Domestic Market (wealth_domestic_market)  
│   = total_wealth (z compute-economy-flow) × DOMESTIC_MARKET_REALIZATION
│   DOMESTIC_MARKET_REALIZATION = pojmenovaný tuning knob (0.5 start)
│
├─ 3. Goods Fiscal (wealth_goods_fiscal) — existující sloupec
│   = tax_market + tax_transit + tax_extraction + capture
│   Bez změny logiky, jen se přestane blendovat
│
├─ 4. Route Commerce (wealth_route_commerce) — NOVÉ
│   = Σ route: capacity × (1-damage×0.1) × controlFactor × econ_relevance × RATE
│   Monetizace průtoku, ne daň. Služby, sklady, karavany.
│
├─ + Prestige bonus, trade gold, strategic mult
├─ - Army upkeep, tolls, sport funding
└─ = net → gold_reserve
```

## Konkrétní změny

### 1. DB migrace
Přidat 3 nové sloupce (reuse existující `goods_wealth_fiscal`):
```sql
ALTER TABLE realm_resources 
  ADD COLUMN IF NOT EXISTS wealth_pop_tax numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wealth_domestic_market numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wealth_route_commerce numeric DEFAULT 0;
```

### 2. process-turn (edge function)
- **Fix bug**: `tax_pop` → `tax_population` 
- **Nahradit blend** (řádky 710-718): Explicitní 4 pilíře s pojmenovanými konstantami
- **Přidat route commerce výpočet**: Iterace přes `province_routes` kontrolované hráčem, výpočet `effectiveCapacity × economic_relevance × ROUTE_COMMERCE_RATE`
- `DOMESTIC_MARKET_REALIZATION = 0.5` jako pojmenovaný tuning knob
- `ROUTE_COMMERCE_RATE = 0.05` jako pojmenovaný tuning knob
- Route commerce zahrnuje `controlFactor` (owned=1, contested=0.25, other=0) a `damagePenalty`
- Zapsat všechny 4 pilíře do DB: `wealth_pop_tax`, `wealth_domestic_market`, `goods_wealth_fiscal` (update), `wealth_route_commerce`
- Jasně oddělit income vs expenses vs gold_reserve

### 3. Utility: `getWealthBreakdown()` 
Nová funkce v `src/lib/economyFlow.ts`:
```typescript
export function getWealthBreakdown(realm: any) {
  return {
    popTax: Number(realm.wealth_pop_tax ?? realm.tax_population ?? 0),
    domesticMarket: Number(realm.wealth_domestic_market ?? 0),
    goodsFiscal: Number(realm.goods_wealth_fiscal ?? 0),
    routeCommerce: Number(realm.wealth_route_commerce ?? 0),
  };
}
```
Jednotný selektor — UI neřeší fallbacky a legacy názvy.

### 4. FiscalSubTab — přepis
Nový layout s 4 pilíři + výdaje + pokladna:
- PŘÍJMY: Pop daň, Domácí trh, Goods fiskál (s rozbaleným sub-detail), Koridorový obchod
- VÝDAJE: Army upkeep, Mýtné, Sport funding
- ČISTÝ PŘÍRŮSTEK + stav POKLADNY
- Používá `getWealthBreakdown()` pro data

### 5. ResourceHUD tooltip
Wealth tooltip zobrazí:
```
👥 Pop daň: X | 🏪 Trh: X | 📦 Goods: X | 🛤️ Trasy: X
Příjem: +X | Výdaje: -Y | Čistě: +Z/kolo
Pokladna: N
```

### 6. Deploy + build ověření

## Pořadí implementace

1. DB migrace (3 nové sloupce)
2. process-turn: oprava bugu + 4 pilíře + route commerce
3. `getWealthBreakdown()` utility
4. FiscalSubTab přepis
5. ResourceHUD tooltip
6. Deploy process-turn + build check

## Soubory

| Soubor | Změna |
|--------|-------|
| DB migrace | 3 nové sloupce |
| `supabase/functions/process-turn/index.ts` | Fix bug, 4 pilíře, route commerce |
| `src/lib/economyFlow.ts` | `getWealthBreakdown()` |
| `src/components/economy/FiscalSubTab.tsx` | Přepis UI |
| `src/components/layout/ResourceHUD.tsx` | Tooltip update |

