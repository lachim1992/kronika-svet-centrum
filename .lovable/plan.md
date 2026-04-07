
# Economy v4.1 — Integrační plán

## Stav implementace

### ✅ Fáze 1: Data Hydratace — HOTOVO
- Edge function `backfill-economy-tags` vytvořena a nasazena
- Hydratuje `capability_tags` + `production_role` z NODE_CAPABILITY_MAP
- Auto-seed `resource_deposits` na hexech dle biomu
- Testováno: 23/35 uzlů aktualizováno (source/processing/urban)
- Tlačítko "Hydratace" přidáno do HexDevTools Quick Actions

### ✅ Fáze 2: Oprava compute-trade-flows — HOTOVO
- Opraveny column references: `required_role`, `output_good_key`, `output_quantity`, `quality_output_bonus`
- Opraveny column names pro `demand_baskets` (`basket_key`, `quantity_needed`, `satisfaction_score`)
- Opraveny column names pro `trade_flows` (`source_city_id`, `target_city_id`, `volume_per_turn`, etc.)
- Opravena agregace duplicitních inventářů (node_id + good_key)
- Testováno: 19 inventory rows, 4 hráči aktualizováni

### ✅ Fáze 2b: FK opravy + chybějící sloupce — HOTOVO
- **demand_baskets**: FK `city_id` referencuje `province_nodes(id)`, ne `cities(id)` — opraveno mapováním `cityToNodeId`
- **demand_baskets**: Přidány chybějící NOT NULL sloupce: `fulfillment_type`, `min_quality`, `preferred_quality`
- **trade_flows**: FK `source_city_id`/`target_city_id` referencují `province_nodes(id)` — opraveno
- **trade_flows**: Přidány chybějící NOT NULL sloupce: `flow_type`, `quality_band`, `friction_score`, `maturity`
- **Parent chain**: Implementován rekurzivní `resolveCityId()` pro mapování non-city uzlů na města přes `parent_node_id`
- Přidáno error logging pro všechny inserty
- **Výsledky**: 80 demand_baskets, 10 city_market_summary, 4 trade_flows, 55 node_inventory — vše funkční

### ✅ Fáze 5: Observatory aktualizace — HOTOVO
- `dataFlowAuditData.ts` rozšířen o: capability_tags, production_role, guild_level, specialization_scores
- Přidány tabulky: node_inventory, demand_baskets, trade_flows, city_market_summary
- Writer type rozšířen o `backfill-economy-tags`

### ✅ Fáze 3: Sjednocení vrstev — HOTOVO
- compute-trade-flows zapisuje `goods_production_value`, `goods_supply_volume`, `goods_wealth_fiscal` do realm_resources
- process-turn používá blending systém: `economy_version >= 4` → 70% goods / 30% legacy
- Když goods data existují (i v economy_version=3), automaticky blenduje 30% goods / 70% legacy
- Per-city produkce a bohatství blendují goods hodnoty distribuované dle populace/tržní úrovně
- Grain reserve obohacen o goods supply volume (storable goods)
- Odstraněno double-counting: goods fiscal bonus škáluje dle legacyBlend
- DB migrace: přidány sloupce `goods_production_value`, `goods_supply_volume`, `goods_wealth_fiscal`, `economy_version`

### ⬜ Fáze 4: Dead metriky — TODO
### ⬜ Fáze 6: UI integrace — TODO

## Aktuální data pipeline stav

```
province_hexes.resource_deposits
        │
        ▼
province_nodes (capability_tags + production_role)     ✅ Hydratováno
        │
        ▼ [production_recipes match]
node_inventory (good_key, quantity, quality)             ✅ 55 záznamů
        │
        ├──► city_market_summary (supply per city)       ✅ 10 záznamů
        │
        ▼
demand_baskets (satisfaction per basket per city)         ✅ 80 záznamů
        │
        ▼ [deficit → trade pressure]
trade_flows (from_node → to_node, good_key, volume)      ✅ 4 záznamů
        │
        ▼
realm_resources (fiskální agregáty)                       ✅ 4 hráči aktualizováni
```

### ✅ Fáze 4: Dead metriky — HOTOVO
- **Legitimacy**: `computeLegitimacyDrift()` v physics.ts. Drift dle demand_satisfaction, famine, temple, conquest, policies. Downstream: stabilita += (leg−50)×0.05, rebelie práh −10 pod 25. Zapojen do world-tick step 8b.
- **Migration Pressure**: `computeMigrationPressure()` + `resolveMigration()` v physics.ts. Push/pull faktory, reálné přesuny populace mezi městy. Zapojen do world-tick step 8c.
- **Labor Allocation**: `computeLaborModifiers()` v demographics.ts + `computeSocialMobility()` zapojena do world-tick step 8d. farming→food_mod, crafting→prod_mod, canal→irrigation, scribes→mobilita.
- AI kontext: legitimacy přidán do ai-context.ts (buildStrategicMapContext).
- Observatory: Všechny 3 metriky změněny z dead/readonly → full. Nové edge vazby přidány.
- DataFlowAudit: labor_allocation, legitimacy, migration_pressure aktualizovány na liveUsed=true s novými readers.
- UI: RealmIndicators legitimita tooltip s vysvětlením driftu a barevným kódováním.
- Fix: Odstraněn duplicitní MigrationCity interface v demographics.ts.

## Zbývá
- Fáze 6: UI integrace goods economy
