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

### 2. Definice realizované produkce (nejdřív, než se změní HDP)
- Dnes `goods_production_value` sčítá jen node recipe inventory, nikoli `auto_supply`
  ani `building_bonus` / district output, zatímco `city_market_baskets.local_supply` je
  součtem všech tří. Sjednotím to: realizovaná produkce = auto + recipe + buildings,
  se explicitním rozpadem (`goods_value_detail`: auto / recipe / buildings).
- Až pak `total_gdp` (proxy) přestane číst výkon uzlů a bude
  `realized_goods_value + export_gross_value`. Value-added reforma zůstává TODO.

### 3. Kapacita působí právě jednou
- Dnes `production_output` vstupuje dvakrát: v `capacityFor()` (`capacityBudget`) a znovu
  jako `nodeProductionFactor` v množství receptu. Odstraním druhou aplikaci —
  `production_output` bude působit výhradně přes throughput budget kapacity.
- Žádný strop „quantity ≤ production_output“: kapacita limituje work/throughput, ne kusy
  výrobku (různé goods mají různé jednotky a výnosy). Diagnostika: hlášení, kolik budgetu
  bylo vyčerpáno (`capacity_utilization`).

### 4. Souhrny říše
- `aggregate-realm-totals`: nový `total_production_capacity` (Σ production_output),
  `total_production` označen jako deprecated alias.
- `process-turn` už nebude potřebovat stará node-agregáta; čte Layer B daňové základy a
  fyzické údaje, které skutečně používá (kapacita pro logistiku zůstává fyzická).

### 5. UI
`ProductionOverviewCard` jako řetězec:
```text
🏗 Organizovaná produkční kapacita  →  📦 Realizovaná produkce (auto + recepty + budovy)
   →  🏪 Tržní hodnota  →  🏛 Fiskální příjem z goods
```
Vedle toho „🚚 Distribuce“ z fyzické dopravní vrstvy (route access / market access), nikoli
Σ node wealth. Zároveň opravím chybu: karta dnes zobrazuje „Σ node wealth“ z `total_wealth`,
což je alias fiskálního příjmu. Stejný slovník projdu v `NodeFlowBreakdown`, `ResourceHUD`
a `EconomyDebugTab`; legacy node wealth zmizí z hráčského UI (zůstane jen v Dev Mode).

### 6. Testy a ověření
- `src/test/economy-integrity.test.ts`: HDP proxy nečte výkon uzlů; karta produkce nečte
  `total_wealth`; `production_output` se v compute-trade-flows aplikuje jen jednou;
  realizovaná produkce má tři složky.
- Dvojitý přepočet na živé session → identický stav (idempotence).

## Co se nemění
Fiskální kontrakt (process-turn jediný writer turnového fiskálu), pravidla snapshotů a
historie, pět daňových základů, `fiscal_capture` zůstává telemetrií, balancing čísel.
