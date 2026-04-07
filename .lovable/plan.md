
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

### ⬜ Fáze 3: Sjednocení vrstev — TODO
- Přesunout makro agregaci do goods vrstvy
- process-turn: číst výsledky goods vrstvy místo duplicitního počítání

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
