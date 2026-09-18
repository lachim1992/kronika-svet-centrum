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
  ani `building_bonus` / district output. Sjednotím to: domácí realizovaná produkce =
  `auto_supply + recipe_bonus + structure_supply` (structures = budovy **i** čtvrti).
- **Nikdy z `local_supply`** — po basket trade obsahuje i import. Domácí output se počítá
  výhradně ze tří domácích složek.
- **Jedna účetní jednotka**: všechny tři kanály oceněny na basketové škále
  (`× basketValue`). `base_price_numeric` se do součtu nemíchá (není potvrzeno, že je
  kalibrovaný ve stejné měnové škále) — zůstává pro goods-level UI a obchod.
- Rozpad `goods_value_detail: { auto, recipe, structures }` s invariantem
  `goods_production_value == auto + recipe + structures`.
- `total_gdp` (provisional proxy) **= goods_production_value**, bez exportu.
  `export_gross_value` je samostatná obchodní metrika a NESMÍ vstoupit do HDP podruhé.
  Value-added / final-demand reforma = samostatný pass.
- Explicitně: přesnější základ změní `market_tax_base` → tarify → `goods_wealth_fiscal` →
  pokladnu. Očekávaný důsledek opravy datového základu, **ne balancing**. Daňové sazby ani
  multiplikátory se v tomto passu neladí, i kdyby příjem výrazně vzrostl.

### 3. Kapacita působí právě jednou
- Dnes `production_output` vstupuje dvakrát: v `capacityFor()` (`capacityBudget`) a znovu
  jako `nodeProductionFactor` v množství receptu. `nodeProductionFactor` z finálního
  vzorce odstraním — `production_output` působí výhradně přes throughput budget.
- Quantity zůstává `output × guild × upgrade × resourceYield × share`.
- Žádný strop „quantity ≤ production_output“: kapacita limituje work/throughput slots, ne
  kusy výrobku. Diagnostika `capacity_budget`, `capacity_allocated`,
  `capacity_utilization = allocated / budget` (ve slotech, nikoli v kusech goods).

### 4. Souhrny říše a guard pro legacy wealth
- `aggregate-realm-totals`: nový `total_production_capacity` (Σ production_output),
  `total_production` označen jako deprecated alias; `total_gdp` dle bodu 2.
- `wealth_output` smí číst jen `compute-economy-flow` a dev/debug nástroje. NESMÍ ho číst
  hráčské makro KPI, pokladna, fiskální výpočet ani HDP — vynuceno testem přes allowlist.

### 4b. Zrušit třetí ekonomiku v process-turn (klíčové)
- `process-turn` dnes počítá vlastní `cityProduction = (nodeProduction +
  computeCityLayerEconomy().production) × labor + apportioned goods_production_value`.
  Tuhle paralelní makro produkci odstraním.
- `production_output` už nikdy nevede na `cityProduction`, `grain_reserve`,
  `production_reserve`, `domestic_tax_base` ani `extraction_tax_base`. Jeho jediná cesta je
  throughput budget → recepty → goods.
- `computeCityLayerEconomy()` zůstává pro populaci, workforce, kapacitu a faith;
  `layers.production` a `layers.wealth` jsou deprecated jako makro veličiny. Jejich vstupy
  (populace, labor allocation) působí upstream na `auto_supply`, workforce a stabilitu.
- **Hlad a obilí** přestanou číst obecný `goods_supply_volume` (součet storable goods, tedy
  i nástroje či textil). Nově se čte konkrétní koš `staple_food` z `city_market_baskets`
  **po** basket trade: `local_supply` (import už je v něm zahrnutý — nesmí se přičítat
  podruhé), `local_demand`, `unmet_demand`.

### 4c. Nahradit downstream spotřebitele legacy cityProduction
Každá veličina, která dnes visí na `cityProduction`, dostane explicitní Layer B zdroj:
- **domestic_tax_base** = hodnota skutečně uspokojené domácí spotřeby:
  `Σ min(post_trade_supply, demand) × basketValue` (zdaňuje i prodaný import).
- **extraction_tax_base** = hodnota realizovaného outputu extractive/source sektoru
  (recepty na uzlech s `production_role = source`), oceněná stejným basketValue.
  Goods vrstva publikuje `goods_domestic_consumption_value` a `goods_extraction_value`;
  process-turn z nich udělá daňové základy a zůstává jediným writerem fiskálu.
- **famine / food balance**, `last_turn_grain_prod` / `_cons` / `_net` a **faction food
  satisfaction** čtou výhradně `staple_food` (satisfaction, `unmet_demand`), ne
  `cityEcon.balance`.
- **production_reserve**: akumulace z `totalCityProduction` se ruší. V tomto passu je
  označena jako **DEPRECATED / unresolved** — nesmí dostat ad hoc nový vzorec. Cílový model
  (napájení z `construction` koše, případně zrušení ve prospěch construction goods) je
  samostatný navazující pass. Do té doby zůstává jen existující zásoba jako CAPEX pro
  command-dispatch, bez nového přírůstku z legacy produkce.
- **labor multiplikátory**: legacy `laborGrainMult` / `laborWealthMult` se nesmí použít ke
  vytvoření paralelní produkce. Existující labor efekt v Goods vrstvě zůstává; sektorové
  labor multiplikátory = samostatný pass (jinak by šlo o balancing).


### 5. UI
`ProductionOverviewCard` jako lineární řetězec:
```text
🏗 Organizovaná kapacita  →  📦 Realizovaná produkce (auto | recepty | structures)
   →  💰 Hodnota produkce  →  🏛 Fiskální příjem z goods
```
„Hodnota produkce“, ne „tržní hodnota“ — oceňuje se i neprodaný přebytek. Vedle řetězce
samostatný blok „🚚 Trh & obchod“ (domácí spotřeba, export, import, přebytek, market
access, využití cest). Σ node wealth z hráčského UI zmizí — karta dnes navíc zobrazuje
`total_wealth`, což je alias fiskálního příjmu. Stejný slovník projdu v
`NodeFlowBreakdown`, `ResourceHUD` a `EconomyDebugTab` (legacy zůstane jen v Dev Mode).

### 6. Testy a ověření (vynutitelné vrstvení)
- `goods_production_value == goods_value_detail.auto + recipe + structures`
- `goods_production_value` se počítá z `auto_supply + recipe_bonus + structures`,
  nikdy z post-trade `local_supply`
- `total_gdp == goods_production_value`; `export_gross_value` do HDP nevstupuje
- `wealth_output` nemá konzumenta mimo allowlist (compute-economy-flow + dev/debug)
- `production_output` se aplikuje jen jednou (bez `nodeProductionFactor`) a nevede na
  `grain_reserve`, `production_reserve`, `domestic_tax_base`, `extraction_tax_base`
- `process-turn` nepočítá `cityProduction` z node + layers + goods
- hlad/obilí čte `staple_food`, ne `goods_supply_volume`; import se nepřičítá podruhé
- `domestic_tax_base` / `extraction_tax_base` nevycházejí z `totalCityProduction`
- `production_reserve` nedostává přírůstek z legacy produkce
- karta produkce nečte `total_wealth`

- Dvojitý přepočet na živé session → identický stav (idempotence)

## Explicitní ontologie
`node production ≠ goods`, `node wealth ≠ economy`, `city layer production ≠ goods`,
`export ≠ extra production`, `import ≠ domestic production`, `fiscal revenue ≠ production`.

## Co se nemění
Fiskální kontrakt (process-turn jediný writer turnového fiskálu), pravidla snapshotů a
historie, pět daňových základů, `fiscal_capture` zůstává telemetrií, daňové sazby a
multiplikátory (i kdyby se fiskální výsledek kvůli opravě základu výrazně změnil).


