
# Plán: Trade System — Fáze 2

Fáze 1 stabilizovala ID vrstvy a názvy. Fáze 2 dodává **skutečný basket-level obchod** a rozlomí matoucí "HDP". Stavíme na L1 access (`player_trade_system_access`) a L2 basketech (`city_market_baskets`), které už mají `export_surplus` a `unmet_demand`.

## Cíle (4 acceptance body)

1. Vznikne tabulka `basket_trade_flows` (per-basket, per-pair, per-turn) jako derived runtime — solver ji přepíše každý refresh.
2. Solver páruje `export_surplus` × `unmet_demand` napříč městy **uvnitř stejného trade_system** s respektem k `access_level` a `tariff_factor` z `player_trade_system_access`.
3. Hodnoty basket_trade_flows se promítnou do `city_market_baskets`: `local_supply` (kupující), `domestic_satisfaction`, a do fiskálu odesílatele přes `goods_wealth_fiscal`.
4. UI ukáže rozdíl mezi **GDP** (ekonomická aktivita = výroba × cena) a **fiskálním příjmem** (co plyne do státní pokladny). Topbar EconomyTab přestane míchat.

## Additional acceptance

- `basket_trade_flows.source_city_id`/`target_city_id` → `cities.id` (žádné node ID).
- Solver respektuje `access_level`: 0 = žádný tok, 1 = base, 2 = preferential (-tariff), 3 = sovereign (no tariff).
- Když recompute vyrobí 0 flows, tabulka pro session je prázdná (stejné cleanup pravidlo jako trade_flows).
- `domestic_satisfaction` = `(local_supply_after_imports) / local_demand`, clamped [0,1].
- `total_wealth` v `realm_resources` zůstává fiskální (suma streams). Nové pole `total_gdp` = ekonomická aktivita.

---

## 1. Migrace

```sql
-- Nová derived tabulka
CREATE TABLE basket_trade_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  trade_system_id uuid,                 -- volné, pro debug; FK nepřidávat (runtime)
  basket_key text NOT NULL,
  source_city_id uuid NOT NULL,         -- cities.id
  target_city_id uuid NOT NULL,         -- cities.id
  source_player text NOT NULL,
  target_player text NOT NULL,
  volume numeric NOT NULL DEFAULT 0,    -- jednotky basketu/turn
  unit_price numeric NOT NULL DEFAULT 0,
  gross_value numeric NOT NULL DEFAULT 0, -- volume * unit_price
  tariff_factor numeric NOT NULL DEFAULT 1.0,
  fiscal_capture numeric NOT NULL DEFAULT 0, -- co odesílatel realizuje
  access_level int NOT NULL DEFAULT 1,
  turn_number int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_btf_session ON basket_trade_flows(session_id);
CREATE INDEX idx_btf_session_target ON basket_trade_flows(session_id, target_city_id);
CREATE INDEX idx_btf_session_source ON basket_trade_flows(session_id, source_city_id);

-- Nový sloupec pro GDP (ekonomická aktivita ≠ fiskální příjem)
ALTER TABLE realm_resources
  ADD COLUMN IF NOT EXISTS total_gdp numeric NOT NULL DEFAULT 0;
```

Žádné FK na cities/trade_systems (runtime tabulka, semantická validace v solveru).

## 2. Nová edge funkce `compute-basket-trade-flows`

Vkládá se do `refresh-economy` chain **mezi** `compute-trade-flows` a `compute-economy-flow`:

```
routes → hex-flows → trade-systems → trade-flows → basket-trade-flows → economy-flow
```

Algoritmus (čistý solver, žádné AI):

1. Načti `city_market_baskets` pro session (turn = current).
2. Načti `trade_systems` + `player_trade_system_access` → mapa `(player, system_id) → {access_level, tariff_factor}`.
3. Načti `cities` a jejich `trade_system_id` (přes `province_nodes.trade_system_id` JOIN přes `city_id`).
4. Pro každý basket_key, pro každý trade_system:
   - Surplus: `[(city_id, player, export_surplus)]` filtr > 0.
   - Demand: `[(city_id, player, unmet_demand)]` filtr > 0.
   - Greedy párování (largest demand first), respekt:
     - oba hráči musí mít access_level ≥ 1 do systému,
     - `effective_tariff = max(source.tariff, target.tariff)`.
   - Výpočet:
     - `volume = min(surplus_left, demand_left)`
     - `unit_price = basket_base_price[basket_key]` (konstanta z `lib/economyConstants` nebo default 1.0)
     - `gross_value = volume * unit_price`
     - `fiscal_capture = gross_value * (1 - effective_tariff) * monetization_efficiency` (efficiency = 0.6 default)
5. Unconditional cleanup před insert:
   ```ts
   await sb.from("basket_trade_flows").delete().eq("session_id", session_id);
   if (flows.length > 0) await sb.from("basket_trade_flows").insert(flows);
   ```
6. Po insertu update `city_market_baskets`:
   - `local_supply += sum(imported volume)` per (city, basket)
   - `domestic_satisfaction = min(1, (local_supply + auto + bonus + imports) / local_demand)`
   - `unmet_demand = max(0, local_demand - all_supply)`
   - `export_surplus -= sum(exported volume)` per (city, basket)
7. Update `realm_resources.goods_wealth_fiscal += sum(fiscal_capture)` per source_player.

Error handling: log + throw stejně jako Fáze 1.

## 3. HDP rozlomení v `compute-economy-flow`

Přidat výpočet GDP před zápis `realm_resources`:

```ts
// GDP = ekonomická aktivita: domestic production hodnota + export gross_value
const { data: btfRows } = await sb.from("basket_trade_flows")
  .select("source_player, gross_value")
  .eq("session_id", session_id);

const gdpByPlayer = new Map<string, number>();
for (const node of nodes) {
  if (!node.controlled_by) continue;
  const prodValue = Number(node.production_output || 0); // proxy: production output × 1.0
  gdpByPlayer.set(node.controlled_by, (gdpByPlayer.get(node.controlled_by) || 0) + prodValue);
}
for (const row of btfRows || []) {
  gdpByPlayer.set(row.source_player,
    (gdpByPlayer.get(row.source_player) || 0) + Number(row.gross_value || 0));
}

// V update objektu:
total_gdp: Math.round((gdpByPlayer.get(player) || 0) * 100) / 100,
```

`total_wealth` ZŮSTÁVÁ jako suma fiskálních streams. Žádné jiné změny v compute-economy-flow.

## 4. `refresh-economy` chain rozšíření

`supabase/functions/refresh-economy/index.ts`:

```ts
const steps = [
  { name: "compute-province-routes", ... },
  { name: "compute-hex-flows", ... },
  { name: "compute-trade-systems", ... },
  { name: "compute-trade-flows", ... },
  { name: "compute-basket-trade-flows", fn: "compute-basket-trade-flows", body: { session_id } },
  { name: "compute-economy-flow", ... },
];
```

## 5. UI

**EconomyTab.tsx topbar:**
- "Bohatství" (`total_wealth`) → label: *"Fiskální příjem"* + tooltip "Daně, cla a tržní výnos plynoucí do státní pokladny."
- Přidat kartu *"GDP"* (`total_gdp`) + tooltip "Ekonomická aktivita: hodnota produkce + export."

**HomeTab.tsx:** `total_wealth` ponechat jako "Bohatství" (state-level), žádná změna.

**MarketsHub → DemandFulfillmentPanel:** Přidat per-basket trace `<TradeFlowTrace />` (read-only) — kolik basketu město dováží odkud, za jakou tariff. Gate za `useDevMode()` pro tuto iteraci, později unhide.

**TradePanel:** beze změny (L3 layer, Fáze 1 to už správně labeluje).

## 6. Memory updates

- `mem://index.md` Core: `refresh-economy` = **6-step chain** (přidán basket-trade-flows).
- `mem://tech/engine/economy-refresh-orchestration`: aktualizovat na 6 kroků.
- Nová `mem://features/economy/basket-trade-solver` — greedy párování, access_level gating, fiscal_capture formula.
- `mem://features/trade/three-layer-semantics`: rozšířit L2 o basket_trade_flows + povinné cleanup pravidlo.
- Nová `mem://features/economy/gdp-vs-fiscal` — `total_gdp` vs `total_wealth` semantika, kde se každé čte v UI.

## 7. Validace po deployi

```sql
-- 1. ID semantics (musí být 0)
SELECT count(*) FROM basket_trade_flows tf
WHERE NOT EXISTS (SELECT 1 FROM cities c WHERE c.id = tf.source_city_id)
   OR NOT EXISTS (SELECT 1 FROM cities c WHERE c.id = tf.target_city_id);

-- 2. Stejný trade_system u obou stran (sanity)
SELECT count(*) FROM basket_trade_flows tf
JOIN cities cs ON cs.id = tf.source_city_id
JOIN cities ct ON ct.id = tf.target_city_id
JOIN province_nodes ns ON ns.city_id = cs.id
JOIN province_nodes nt ON nt.city_id = ct.id
WHERE ns.trade_system_id IS DISTINCT FROM nt.trade_system_id;
-- musí být 0

-- 3. GDP ≥ fiscal income (sanity)
SELECT count(*) FROM realm_resources
WHERE total_gdp < total_wealth AND total_gdp > 0;
-- mělo by být 0 (fiscal je podmnožinou ekonomické aktivity)

-- 4. Po prvním refresh musí být alespoň pár flows
SELECT count(*) FROM basket_trade_flows
WHERE session_id = '0de6fab4-b925-4faf-bced-14ec85730f45';
-- > 0 pokud má session překrývající surplus/demand
```

Smoke: EconomyTab topbar ukáže oba štítky (GDP + Fiskální příjem), DemandFulfillmentPanel v dev mode ukáže basket import trace.

## 8. Out of scope

- Quality/price band differentiation v solveru (greedy bere first match, ne nejlevnější).
- Multi-hop trade přes mezilehlé systémy (jen direct uvnitř jednoho systému).
- L3 (TradePanel) integrace do basket solveru — manuální smlouvy zůstávají paralelní.
- Migration TradePanel do Diplomacy taby.

---

Připraven implementovat po schválení.
