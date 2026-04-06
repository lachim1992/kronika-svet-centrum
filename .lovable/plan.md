
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

### ✅ Fáze 5: Observatory aktualizace — HOTOVO
- `dataFlowAuditData.ts` rozšířen o: capability_tags, production_role, guild_level, specialization_scores
- Přidány tabulky: node_inventory, demand_baskets, trade_flows, city_market_summary
- Writer type rozšířen o `backfill-economy-tags`

### 🔧 Zbývající problémy (Fáze 2b)
- `demand_baskets` insert selhává tiše — potřeba debuggovat
- `city_market_summary` = 0 — source nodes nemají city_id, potřeba parent-chain lookup
- `trade_flows` = 0 — závisí na funkčních demand baskets

### ⬜ Fáze 3: Sjednocení vrstev — TODO
- Přesunout makro agregaci do goods vrstvy
- process-turn: číst výsledky goods vrstvy místo duplicitního počítání

### ⬜ Fáze 4: Dead metriky — TODO
### ⬜ Fáze 6: UI integrace — TODO
