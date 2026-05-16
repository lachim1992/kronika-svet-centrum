## Cíl

Sjednotit pokladnici tak, aby všechny zobrazované hodnoty pocházely z **jediného** kanonického fiskálního modelu: **per-pillar GDP** (`last_turn_gdp_*`). Legacy `wealth_domestic_component` / `wealth_market_share` zmizí, akumulační bugy zmizí, UI bude konzistentní.

## 1. Engine (supabase/functions/process-turn/index.ts)

### Per-pillar GDP — kanonický výpočet (overwrite, ne akumulace)

```text
gdp_domestic   = totalCityProduction × goods_price_index    -- domácí spotřební trh
gdp_market     = goods_production_value                      -- Goods v4.3 = tržní obrat
gdp_transit    = Σ(playerRoutes: cap × ctrl × rel)           -- už existuje, ok
gdp_extraction = Σ(strategic_yields × tier_value)            -- z STRATEGIC_TIER_BONUSES
gdp_poll_base  = totalPopulation
```

Každý turn se zapíše do `last_turn_gdp_{domestic,market,transit,extraction}` jako **overwrite** (žádné +=).

### Per-pillar revenue (jedna rovnice pro všechny)

```text
pillar_revenue[k] = last_turn_gdp[k] × tax_rate[k] × laffer(tax_rate[k], MAX[k]) × govMod
wealth_pop_tax    = totalPopulation  × tr_poll  × laffer(...) × govMod × strategicMult × lawMult
```

Zapisuje se do `wealth_pop_tax`, `wealth_domestic_market`, `wealth_route_commerce`, `goods_wealth_fiscal` — vše **overwrite**.

`goods_wealth_fiscal` přestane být součtem `tax_market+tax_transit+tax_extraction` (které se počítaly jinde a duplikovaly). Bude rovno `pillar_market_revenue` (z `gdp_market = goods_production_value`).

`totalWealthIncome = wealth_pop_tax + wealth_domestic_market + goods_wealth_fiscal + wealth_route_commerce` (žádné odečítání transit-double-count, protože goods_wealth_fiscal už neobsahuje transit).

### Odstranit z process-turn

- Čtení a používání `wealth_domestic_component`, `wealth_market_share`.
- Back-compute `gdp_market = wealthMarketShare + tax_market / tr_market` (mrtvá větev).
- Komponenty `tax_market`, `tax_transit`, `tax_extraction`, `commercial_capture` jako separátní zápisy do realm_resources (zůstanou jen jako jednorázové debug fieldy v computed_modifiers, ne v ledgeru).

## 2. compute-trade-flows / compute-economy-flow

Přestanou zapisovat `tax_market`, `tax_transit`, `tax_extraction`, `commercial_capture` přímo do `realm_resources`. Místo toho vrátí strukturovaná data, která process-turn použije pro `gdp_extraction` a `gdp_transit` výpočet. Tím se eliminuje druhý writer fiskálních polí.

## 3. DB migrace

```sql
-- Reset rozbitých legacy / akumulovaných polí na 0
UPDATE realm_resources SET
  wealth_pop_tax = 0,
  wealth_domestic_market = 0,
  wealth_route_commerce = 0,
  goods_wealth_fiscal = 0,
  last_turn_gdp_domestic = 0,
  last_turn_gdp_market = 0,
  last_turn_gdp_transit = 0,
  last_turn_gdp_extraction = 0,
  tax_market = 0,
  tax_transit = 0,
  tax_extraction = 0,
  commercial_capture = 0,
  wealth_domestic_component = 0,
  wealth_market_share = 0;

-- Komentář: legacy sloupce wealth_domestic_component, wealth_market_share, commercial_capture
-- a tax_{market,transit,extraction} se zatím NEDROPNOU (drží je staré edge funkce).
-- Drop přijde v samostatné migraci, jakmile všechny writery zmizí.
```

Žádné `ALTER TABLE DROP COLUMN` v této fázi — minimalizujeme riziko, že něco jiného sletí.

## 4. UI — Pokladnice (TreasuryHub)

### Struktura

```text
TreasuryHub
├── Sub-tab "Souhrn"
│   ├── KPI row: HDP (Σ last_turn_gdp_*) │ Příjem koruny │ Čistá změna
│   └── Bilance: Příjem ↑  − Výdaje ↓  = Net
├── Sub-tab "Detail pilířů"
│   └── 5 řádků (Poll, Domácí, Tržní, Tranzit, Těžba):
│       Nominál │ Laffer keep │ Efektiv. │ Gov mod │ HDP báze │ Příjem
├── Sub-tab "Daňová politika"
│   └── slidery + projekce přes detail
└── Sub-tab "Výdaje"
    └── MilitaryUpkeep + tolls + sport
```

### Zdrojová pravidla

- **Veškerý KPI/total** přes `getFiscalIncome(realm)` (už existuje, jen se odstraní vetev `commercial_capture`).
- **Per-pillar tabulka** čte `last_turn_gdp_*` + `tax_rate_*` + `legitimacy` a počítá Laffer projekci stejnou rovnicí jako engine (sdílený helper `src/lib/fiscalMath.ts`).
- `TreasuryPanel.tsx` se **smaže** (jeho per-pillar view nahradí "Detail pilířů" sub-tab vykreslený stejným helperem, takže nikdy se dvě karty s "Příjem koruny" nemohou rozejít).

### Mazat

- `src/components/economy/TreasuryPanel.tsx` (nahrazeno detailem sub-tabu).
- `FiscalSubTab.tsx` legacy ledger karty.
- Vše, co čte `wealth_domestic_component`, `wealth_market_share`, `commercial_capture` v `src/lib/economyFlow.ts` (`getWealthBreakdown` deprecated → smazat).

## 5. Acceptance kritéria

- Po refreshi turnu se v DB `last_turn_gdp_*` zapíší **kladné** hodnoty pro pilíře s aktivitou.
- `wealth_pop_tax + wealth_domestic_market + goods_wealth_fiscal + wealth_route_commerce` na DB řádku = "Příjem koruny / kolo" v UI = sum per-pillar `Příjem` v detail tabulce.
- "HDP" v souhrnu = Σ `last_turn_gdp_*` = Σ "HDP báze" v detail tabulce.
- `wealth_domestic_market` neroste mezi koly při nezměněné konfiguraci (overwrite test).
- Žádný panel nečte `wealth_domestic_component`, `wealth_market_share`, `commercial_capture`, `tax_market`, `tax_transit`, `tax_extraction`.
- Build prochází, nejsou unused importy.

## 6. Out of scope (zatím)

- DROP COLUMN legacy polí (samostatná pozdější migrace).
- Změna daňových sazeb a Laffer křivek (jen sjednotit existující model).
- `ProductionOverviewCard` (Goods v4.3) zůstane jak je — jen v Detail pilířů se ukáže, že `gdp_market === goods_production_value` (link "viz Produkce").
- Hluboký refactor `compute-trade-flows` (jen zastavíme jeho zápisy do `tax_*` polí, vnitřek nechte).

## 7. Technické poznámky

- Shared helper `src/lib/fiscalMath.ts` exportuje `laffer(rate, max)`, `govMod(legitimacy)`, `TAX_MAX` konstanty, `computePillarRevenue({ gdp, rate, max, govMod })`. Identický kód v `process-turn/index.ts` (via copy, ne import — edge funkce).
- `getFiscalIncome` v `economyFlow.ts` se zjednoduší: `totalIncome = popTax + domesticMarket + goodsFiscal + routeCommerce`. Konec.
- Memory aktualizace: `mem://features/economy/fiscal-model-v6` (nový soubor), index update.
