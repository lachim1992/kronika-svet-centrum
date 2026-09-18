# Vrstvení ekonomiky: uzly = kapacita, zboží = skutečná produkce

Cíl: dokončit hierarchii Layer A → B → C. Uzly přestanou být druhá ekonomika a stanou se
horní vrstvou (organizovaný produkční potenciál). Zboží a trh zůstanou jediným místem, kde
se „produkuje“. Fiskál je až třetí následek.

```text
                    POPULACE
                       │ household output
                       ▼
                 AUTO PRODUCTION  ───────────┐
                                             │
GEOGRAFIE → UZLY → ORGANIZOVANÁ KAPACITA     │
                       │ recepty / zakázky   │
                       ▼                     │
              SPECIALIZOVANÉ GOODS ──────────┤
                                             │
BUDOVY / ČTVRTI ─────────────────────────────┤
                                             ▼
                              REALIZOVANÁ LOKÁLNÍ NABÍDKA
                                  spotřeba / přebytek / obchod
                                             ▼
                                     TRŽNÍ HODNOTA
                                             ▼
                        DAŇOVÉ ZÁKLADY → FISKÁL → POKLADNA
```

Volím variantu B: kapacita uzlů omezuje jen organizovanou (node/recipe) produkci.
Domácí/auto produkce obyvatelstva je samostatný základní sektor.

## Kroky

### 1. Slovník a role
- `production_output` = organizovaný produkční potenciál uzlu (Layer A). Význam zachovat.
- `wealth_output` = **legacy abstraktní wealth-flow**, deprecated. Nepřejmenovávat na
  obchodní kapacitu, nepoužívat jako makroveličinu ani v hráčském UI.
- `total_commercial_capacity` v tomto passu **nevznikne**. Skutečná distribuční kapacita se
  odvodí z fyzické dopravní vrstvy (silnice, řeky, capacity, route access) v samostatném kroku.
- `COMMENT ON COLUMN` pro oba sloupce + sekce „Layer A / B / C“ v
  `docs/architecture/economy-contract.md`. Fyzické přejmenování sloupců = samostatný pass.

### 2. Definice realizované produkce a jednotná valuace (nejdřív, než se změní HDP)
- Dnes `goods_production_value` sčítá jen node recipe inventory, nikoli `auto_supply`
  ani `building_bonus` / district output, zatímco `city_market_baskets.local_supply` je
  součtem všech tří. Sjednotím to: realizovaná produkce = auto + recipe + buildings.
- **Jedna účetní jednotka**: všechny tři kanály oceněny na basketové škále
  (`auto_supply × basketValue`, `recipe_bonus × basketValue`, `building_bonus × basketValue`).
  `base_price_numeric` u jednotlivých goods se do tohoto součtu nemíchá (není potvrzeno,
  že je kalibrovaný ve stejné měnové škále) — zůstává pro goods-level UI a obchod.
- Rozpad `goods_value_detail: { auto, recipe, buildings }` s invariantem
  `goods_production_value == auto + recipe + buildings`.
- `total_gdp` (provisional proxy) **= realized_goods_value**, bez exportu.
  `export_gross_value` je samostatná obchodní metrika a NESMÍ vstoupit do HDP podruhé
  (exportované zboží už je součástí realizované produkce). Value-added / final-demand
  reforma = samostatný pass.
- Explicitně: přesnější základ změní `market_tax_base` → tarify → `goods_wealth_fiscal` →
  pokladnu. Je to očekávaný důsledek opravy datového základu, **ne balancing**. Daňové
  sazby ani multiplikátory se v tomto passu neladí, i kdyby příjem výrazně vzrostl.

### 3. Kapacita působí právě jednou
- Dnes `production_output` vstupuje dvakrát: v `capacityFor()` (`capacityBudget`) a znovu
  jako `nodeProductionFactor` v množství receptu. `nodeProductionFactor` z finálního
  vzorce odstraním — `production_output` působí výhradně přes throughput budget.
- Quantity zůstává `output × guild × upgrade × resourceYield × share`.
- Žádný strop „quantity ≤ production_output“: kapacita limituje work/throughput slots, ne
  kusy výrobku. Diagnostika: `capacity_budget`, `capacity_allocated`,
  `capacity_utilization = allocated / budget` (ve slotech, nikoli v kusech goods).

### 4. Souhrny říše a guard pro legacy wealth
- `aggregate-realm-totals`: nový `total_production_capacity` (Σ production_output),
  `total_production` označen jako deprecated alias; `total_gdp` dle bodu 2.
- `wealth_output` smí číst jen `compute-economy-flow` a dev/debug nástroje. NESMÍ ho číst
  hráčské makro KPI, pokladna, fiskální výpočet ani HDP — vynuceno testem přes allowlist.
- `process-turn` čte Layer B daňové základy a fyzické údaje, které skutečně používá.

### 5. UI
`ProductionOverviewCard` jako lineární řetězec:
```text
🏗 Organizovaná kapacita  →  📦 Realizovaná produkce (auto | recepty | budovy)
   →  💰 Hodnota produkce  →  🏛 Fiskální příjem z goods
```
Export není další stupeň výroby, proto vedle řetězce samostatný blok
„🚚 Obchod“ (export, import, využití cest, market access). Σ node wealth z hráčského UI
zmizí — karta dnes navíc zobrazuje `total_wealth`, což je alias fiskálního příjmu.
Stejný slovník projdu v `NodeFlowBreakdown`, `ResourceHUD` a `EconomyDebugTab`
(legacy node wealth zůstane jen v Dev Mode).

### 6. Testy a ověření (vynutitelné vrstvení)
- `goods_production_value == goods_value_detail.auto + recipe + buildings`
- `total_gdp == goods_production_value` (provisional model)
- `export_gross_value` nevstupuje do `total_gdp` podruhé
- `wealth_output` nemá konzumenta mimo allowlist (compute-economy-flow + dev/debug)
- `production_output` se v compute-trade-flows aplikuje jen jednou (bez nodeProductionFactor)
- karta produkce nečte `total_wealth`
- Dvojitý přepočet na živé session → identický stav (idempotence).

## Co se nemění
Fiskální kontrakt (process-turn jediný writer turnového fiskálu), pravidla snapshotů a
historie, pět daňových základů, `fiscal_capture` zůstává telemetrií, daňové sazby a
multiplikátory (i kdyby se fiskální výsledek kvůli opravě základu výrazně změnil).

