
# Plán: Trade System — Fáze 1 (Stabilizace)

Schváleno se třemi technickými pojistkami. Fáze 2 (basket_trade_flows, HDP unifikace, per-basket trace) **mimo scope**.

## 4 tvrdé acceptance body

1. TradePanel netvrdí, že ruční dohody = celý obchod.
2. `trade_flows` nemíchá `city_id` a `node_id`.
3. Staré `trade_flows` nezůstávají viset, když nový přepočet vyrobí 0 toků.
4. Flow centrality, `commercial_capture` a `transit_tax` používají správné ID vrstvy.

## Additional acceptance

- `source_city_id` i `target_city_id` v `trade_flows` musí resolvovat na `cities.id`.
- `source_node_id` a `target_node_id`, když non-null, musí resolvovat na `province_nodes.id`.
- `nodeById` lookups používají výhradně `*_node_id`.
- `cityMap` lookups používají výhradně `*_city_id`.
- `trade_flows` delete errors a insert errors jsou logované a throwed.
- Když recompute vyrobí 0 flows, `trade_flows` pro session je prázdné, ne stale.

---

## 1. Migrace

```sql
ALTER TABLE trade_flows
  ADD COLUMN IF NOT EXISTS source_node_id uuid,
  ADD COLUMN IF NOT EXISTS target_node_id uuid;
```

Žádné FK, žádný backfill. `trade_flows` je derived runtime — čistí se recompute po deployi.

## 2. `supabase/functions/compute-trade-flows/index.ts`

**A) ID semantics při push:**
```ts
tradeFlows.push({
  session_id,
  source_city_id: neighborId,                       // cities.id
  target_city_id: cityId,                           // cities.id
  source_node_id: cityToNodeId.get(neighborId) ?? null,
  target_node_id: cityToNodeId.get(cityId) ?? null,
  source_player: neighborCity.owner_player || "",
  target_player: city.owner_player || "",
  // ...zbytek beze změny
});
```

**B) Unconditional cleanup s error handling:**
```ts
const { error: deleteFlowsError } = await sb
  .from("trade_flows")
  .delete()
  .eq("session_id", session_id);

if (deleteFlowsError) {
  console.error("[compute-trade-flows] Failed to clear trade_flows", deleteFlowsError);
  throw deleteFlowsError;
}

if (tradeFlows.length > 0) {
  const { error: insertFlowsError } = await sb
    .from("trade_flows")
    .insert(tradeFlows);
  if (insertFlowsError) {
    console.error("[compute-trade-flows] Failed to insert trade_flows", insertFlowsError);
    throw insertFlowsError;
  }
}
```

**C) Lookup hranice (hard rule):**
- `cityMap.get(flow.source_city_id)` / `get(flow.target_city_id)` — city id výhradně.
- `exportFlows = tradeFlows.filter(f => f.source_city_id === city.id)`.
- `commercial_capture` a `transit_tax` agregace přes `source_city_id`/`target_city_id`.
- Phase 3.5 flow centrality:
  ```ts
  const node = nodeById.get((f as any).source_node_id); // NIKDY source_city_id
  ```
- Žádný `nodeById.get(*_city_id)` nikde v souboru. Žádný `cityMap.get(*_node_id)` nikde.

## 3. UI rename + disclaimers

- `src/components/TradePanel.tsx`:
  - Nadpis "Obchodní přehled" → **"Diplomatické obchodní dohody"**
  - Banner: *"0 dohod ≠ 0 obchodu. Automatická obchodní síť a goods ekonomika běží samostatně."*
  - "Nová obchodní nabídka" → "Nová diplomatická obchodní nabídka"
- `src/components/economy/MarketsHub.tsx`: sekce "Trade System Supply/Demand" → **"Síťová bilance košů"**.
- `src/components/economy/DemandFulfillmentPanel.tsx` + Dependency Map: gate za `useDevMode()` + štítek *"Dev — zatím nečteno z canonical Goods v4.3 tables"*.
- `src/pages/game/EconomyTab.tsx`: ověřit, že topbar nemíchá "HDP" s recipe output. HDP unifikace = Fáze 2.

**TradePanel nepřesouvat** do Diplomacy.

## 4. Memory

- `mem://index.md`: Economy Refresh = **5-step chain** (`compute-trade-systems` mezi hex-flows a trade-flows).
- `mem://tech/engine/economy-refresh-orchestration`: rozšířit na 5 kroků.
- Nová `mem://features/trade/three-layer-semantics`:
  - L1 access (`trade_systems` / `player_trade_system_access`)
  - L2 ekonomika (`city_market_baskets`, `node_inventory`, `demand_baskets`)
  - L3 ruční diplomatické smlouvy (`trade_routes` / `trade_offers` / `TradePanel`)
  - Pravidlo: UI musí labelovat, který layer čte.

## 5. Validace po deployi

Spustit `refresh-economy` pro aktivní session, pak:

```sql
-- city refs (oba sloupce, NOT EXISTS)
SELECT count(*) FROM trade_flows tf
WHERE NOT EXISTS (SELECT 1 FROM cities c WHERE c.id = tf.source_city_id);

SELECT count(*) FROM trade_flows tf
WHERE NOT EXISTS (SELECT 1 FROM cities c WHERE c.id = tf.target_city_id);

-- node refs (pokud non-null)
SELECT count(*) FROM trade_flows tf
WHERE tf.source_node_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM province_nodes n WHERE n.id = tf.source_node_id);

SELECT count(*) FROM trade_flows tf
WHERE tf.target_node_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM province_nodes n WHERE n.id = tf.target_node_id);
```

Všechny čtyři dotazy musí vracet **0**.

Dále: `commercial_capture` a `transit_tax` v `realm_resources` nejsou 0 pro hráče s nenulovými flows. UI smoke: TradePanel = nový nadpis + banner; MarketsHub = "Síťová bilance košů".

## 6. Out of scope (→ Fáze 2)

- `basket_trade_flows` tabulka, solver na `export_surplus` × `unmet_demand`.
- Per-basket trace UI.
- HDP unifikace.
- Rozhodnutí pooled system supply: real pool vs diagnostika.
- Případný přesun TradePanel do Diplomacy.

---

Připraven implementovat F1 přesně v tomto rozsahu po schválení.
