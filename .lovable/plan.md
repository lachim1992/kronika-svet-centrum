

# Economy v4.1 — Celková revize a integrační plán

## Současný stav: Tři paralelní ekonomické vrstvy

Systém aktuálně obsahuje **tři oddělené ekonomické enginy**, které běží nezávisle a nejsou plně propojené:

```text
┌─────────────────────────────────────────────────────────────────┐
│  VRSTVA 1: compute-economy-flow (v3 — Directional Flow)        │
│  ─────────────────────────────────────────────────────────────  │
│  • Macro produkce/supplies/wealth per node                     │
│  • Upward flow: micro→minor→major→capital                      │
│  • Wealth generace přes Market Mechanism na kapitálu            │
│  • Downward redistribuce wealth+supplies                        │
│  • Zapisuje: province_nodes.production_output, wealth_output,   │
│    food_value, capacity_score, importance_score                 │
│  • Agreguje do: realm_resources (total_production, total_wealth)│
│  STATUS: ✅ AKTIVNÍ, počítá se každý tah                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  VRSTVA 2: compute-trade-flows (v4.1 — Goods Economy)          │
│  ─────────────────────────────────────────────────────────────  │
│  • Recipe-based: capability_tags → production_recipes → goods   │
│  • Plní node_inventory, city_market_summary, demand_baskets     │
│  • Trade pressure mezi městy → trade_flows                     │
│  • Fiskální agregáty: tax_market, tax_transit, commercial_capture│
│  STATUS: ⚠️ SCHEMA READY, ALE DATA PRÁZDNÁ                    │
│  PROBLÉM: capability_tags vyplněny u 1/152 uzlů!               │
│  → compute-trade-flows nemůže matchovat žádné recepty           │
│  → node_inventory = 0, demand_baskets = 0, trade_flows = 0     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  VRSTVA 3: process-turn (v3 — City-level Hybrid)               │
│  ─────────────────────────────────────────────────────────────  │
│  • Per-city produkce z populačních tříd (peasants→prod, atd.)  │
│  • Spotřeba obilí, hladomor, prestiž, víra                     │
│  • Nezná goods vrstvu — počítá makro přímo z populace           │
│  STATUS: ✅ AKTIVNÍ, ale NEINTEGROVANÝ s goods vrstvou          │
└─────────────────────────────────────────────────────────────────┘
```

## Klíčové problémy (Critical Gaps)

### 1. capability_tags nejsou populovány (BLOKUJÍCÍ)
- 152 uzlů má `production_role=source`, ale jen 1 má vyplněné `capability_tags`
- `compute-trade-flows` matchuje recepty přes `required_tags ⊆ capability_tags`
- → **Celá goods vrstva je mrtvá** — žádné recepty se neprovádějí
- **Řešení**: Backfill capability_tags z `node_subtype` podle `NODE_CAPABILITY_MAP`

### 2. production_role chybí pro processing/urban/guild uzly
- Všech 152 uzlů má `production_role=source` — žádný processing, urban, guild
- Recepty pro fáze processing, urban, guild se nikdy nespustí
- **Řešení**: Automatické přiřazení `production_role` z `NODE_CAPABILITY_MAP[subtype].role`

### 3. compute-trade-flows má špatné názvy sloupců
- Kód referencuje `production_stage`, `output_good`, `base_output`, `quality_ceiling` v recipes
- Skutečné sloupce: `required_role`, `output_good_key`, `output_quantity`, `quality_output_bonus`
- **Řešení**: Opravit dotazy v compute-trade-flows

### 4. Dvě paralelní wealth kalkulace
- `compute-economy-flow` generuje wealth přes Market Mechanism (burghers × incoming production)
- `compute-trade-flows` generuje fiskální toky (tax_market, capture, transit)
- `process-turn` přidává vlastní wealth z populačních koeficientů
- → **Triple-counting wealth**, žádná z vrstev neví o ostatních

### 5. Goods economy neovlivňuje makro ukazatele
- `realm_resources.total_production` pochází výhradně z `compute-economy-flow`
- `trade_flows` nemají žádný downstream efekt na `total_wealth` ani `total_production`
- Dle designu v `MACRO_DERIVATION` by měly být makro ukazatele **projekcemi** goods vrstvy

### 6. resource_deposits na hexech — nepropojeno
- `compute-trade-flows` čte `province_hexes.resource_deposits` pro source node yield
- Ale deposits nejsou populovány při generaci světa (potřeba ověřit)
- **HexDevTools** teď umí placeovat deposits manuálně → to je ok pro dev, ale engine musí auto-seedovat

### 7. Dead metriky v Observatory
- `labor_allocation`: UI zapisuje, engine ignoruje → FAKE
- `legitimacy`: počítá se, nemá downstream → DEAD
- `migration_pressure`: počítá se, nikdo nečte → DEAD

## Integrační plán — 6 fází

### Fáze 1: Data Hydratace (prerequisite)
**Cíl**: Naplnit capability_tags a production_role tak, aby compute-trade-flows fungoval.

1. **Edge function `backfill-economy-tags`**:
   - Pro každý `province_node` s `node_subtype` v `NODE_CAPABILITY_MAP`:
     - Set `capability_tags` = `NODE_CAPABILITY_MAP[subtype].tags`
     - Set `production_role` = `NODE_CAPABILITY_MAP[subtype].role`
   - Pro města (subtype=city): `production_role=urban`, tags=`[baking, construction]`
   - Pro trade_hub: `production_role=urban`, tags=`[construction]`
   - Spustitelné z Dev panelu i automaticky při `world-generate-init`

2. **Auto-seed resource_deposits** při `explore-hex` a `world-generate-init`:
   - Podle biomu hexu generovat deposits (iron v hills, timber v forest, atd.)
   - Kvalita 1-5 dle RNG + biome match

3. **Integrace do world-generate-init**: Při vytváření nového světa automaticky přiřadit tags+role

### Fáze 2: Oprava compute-trade-flows
**Cíl**: Funkce běží bez chyb a produkuje reálná data.

1. Opravit column references:
   - `production_stage` → `required_role`
   - `output_good` → `output_good_key`
   - `base_output` → `output_quantity`
   - `quality_ceiling` → `quality_output_bonus`

2. Ověřit, že recipes matchují capability_tags (po Fázi 1)
3. Spustit na testovací session → ověřit node_inventory, demand_baskets, trade_flows mají data

### Fáze 3: Sjednocení ekonomických vrstev
**Cíl**: Jediný zdroj pravdy pro makro ukazatele.

```text
NOVÝ TOK (cílový stav):
  hex deposits → source nodes (capability_tags) → raw goods (node_inventory)
       ↓
  processing nodes → processed goods
       ↓
  urban nodes → final goods
       ↓
  guild nodes → luxury goods
       ↓
  city_market_summary (supply vs demand per basket)
       ↓
  demand_baskets satisfaction → trade_pressure → trade_flows
       ↓
  AGREGACE DO MAKRA:
    Production = Σ(goods output × base_price)
    Wealth = tax_pop + tax_market + tax_transit + tax_extraction + capture
    Supplies = Σ(storable goods quantity)
    Capacity = stavební goods + guild level + urbanizace
    Faith = ritual basket satisfaction + temple output
    Prestige = luxury goods + famous goods + export reach
```

**Konkrétní kroky**:
1. `compute-economy-flow` zachovat pro **node-level infrastrukturní metriky** (isolation, connectivity, route_access, importance)
2. Přesunout **makro agregaci** do `compute-trade-flows` — goods vrstva je source of truth
3. `process-turn` odebrat duplicitní wealth/production kalkulaci — místo toho číst výsledky goods vrstvy
4. Zavést `economy_version` flag v session pro postupný rollout

### Fáze 4: Propojení Dead metrik
1. **legitimacy** → modifier stability (+/- drift), modifier na faction unrest
2. **labor_allocation** → buď implementovat jako alokaci workforce mezi capability_tags, nebo odstranit z UI
3. **migration_pressure** → trigger pro přesun populace mezi městy (high pressure = emigrace)

### Fáze 5: Observatory aktualizace
1. Přidat nové uzly do `observatoryData.ts`:
   - `goods_production`: goods → node_inventory → city_market
   - `demand_satisfaction`: demand_baskets → trade_pressure
   - `trade_ideology`: trade ideology → tariff/flow modifiers
   - `guild_specialization`: guild level → quality + famous goods
2. Aktualizovat `dataFlowAuditData.ts`:
   - Přidat sloupce: `capability_tags`, `production_role`, `guild_level`, `specialization_scores`
   - Přidat tabulky: `node_inventory`, `demand_baskets`, `trade_flows`, `city_market_summary`
   - Opravit writers/readers pro goods pipeline

### Fáze 6: UI integrace
1. **EconomyTab**: Přidat goods-level breakdown (ne jen makro čísla)
2. **ResourceHUD tooltips**: Derivace z goods vrstvy (jak je v MACRO_DERIVATION)
3. **TradeNetworkOverlay**: Vizualizovat trade_flows (už implementováno, potřebuje data)
4. **HexDevTools**: Ověřit, že Quick Actions spouštějí správný řetězec

## Prioritní pořadí implementace

```text
1. Fáze 1 (Hydratace)     ← BEZ TOHO NIC NEFUNGUJE
2. Fáze 2 (Fix trade-flows) ← Okamžitě po hydrataci
3. Fáze 5 (Observatory)    ← Dokumentace stavu
4. Fáze 3 (Sjednocení)     ← Největší refactor
5. Fáze 4 (Dead metriky)   ← Nice-to-have
6. Fáze 6 (UI)             ← Postupně
```

## Schéma datového toku (cílový stav)

```text
province_hexes.resource_deposits
        │
        ▼
province_nodes (capability_tags + production_role)
        │
        ▼ [production_recipes match]
node_inventory (good_key, quantity, quality)
        │
        ├──► city_market_summary (supply per city)
        │
        ▼
demand_baskets (satisfaction per basket per city)
        │
        ▼ [deficit → trade pressure]
trade_flows (from_city → to_city, good_key, volume)
        │
        ├──► province_routes (hex pathfinding via flow_paths)
        │
        ▼
realm_resources (makro agregáty = projekce goods vrstvy)
        │
        ▼
ResourceHUD (UI zobrazení)
```

