# Node-Trade v1 — IMPLEMENTAČNÍ LOCK

Aplikované korekce z poslední revize (5×) zafixovány níže. Architektonické pravidlo:

> **Diplomacy writes treaties. `compute-trade-systems` projects access. `compute-trade-flows` consumes access. WorldMap only visualizes canonical outputs.**

---

## Korekce zapracované

1. **Access je projekce, ne ručně vedená pravda.** Treaty commands zapisují jen `diplomatic_treaties` (akt). `compute-trade-systems` z toho každý recompute znovu **přepočítá** `player_trade_system_access` (truncate per session + reinsert). Žádné mrtvé řádky po split/merge.
2. **`contested` se do BFS NEPOUŠTÍ** v MVP. Jen `control_state='open'`. (`contested` můžeme pustit s penalizací později; teď validujeme čistou kostru.)
3. **Price index — symetrický vzorec:**
   ```
   pressure = (demand - supply) / max(demand + supply, 1)
   price_index = clamp(0.5, 2.0, 1 + pressure)
   ```
4. **Snapshot před recompute** pro spolehlivý merge/split diff:
   ```sql
   CREATE TABLE trade_system_node_snapshot (
     session_id uuid NOT NULL,
     node_id uuid NOT NULL,
     trade_system_id uuid,
     system_key text,
     snapshot_turn int,
     snapshot_at timestamptz DEFAULT now(),
     PRIMARY KEY (session_id, node_id)
   );
   ```
   `compute-trade-systems` před BFS uloží snapshot z aktuálního stavu, po BFS porovná key sady → emit `trade_system_formed/dissolved/merged/split`.
5. **Manpower / soldiers backfill konzervativně:**
   ```sql
   UPDATE military_stacks
   SET soldiers = COALESCE(NULLIF(soldiers, 0), ROUND(power / 1.0))
   WHERE soldiers = 0 OR soldiers IS NULL;
   ```
   `soldier_power_ratio = 1` (lze později retunovat přes `economy_overrides`).

---

## Etapa 1 — Schema migrate (jeden patch)

```sql
-- Trade systems (deterministic key)
CREATE TABLE trade_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  system_key text NOT NULL,                 -- sha256(sorted(node_ids))[0:16]
  node_count int NOT NULL DEFAULT 0,
  route_count int NOT NULL DEFAULT 0,
  total_capacity numeric NOT NULL DEFAULT 0,
  member_players text[] NOT NULL DEFAULT '{}',
  computed_turn int,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (session_id, system_key)
);
CREATE INDEX idx_trade_systems_session ON trade_systems(session_id);

CREATE TABLE trade_system_basket_supply (
  session_id uuid NOT NULL,
  trade_system_id uuid NOT NULL REFERENCES trade_systems(id) ON DELETE CASCADE,
  basket_key text NOT NULL,
  total_supply numeric NOT NULL DEFAULT 0,
  total_demand numeric NOT NULL DEFAULT 0,
  surplus numeric NOT NULL DEFAULT 0,
  shortage numeric NOT NULL DEFAULT 0,
  price_index numeric NOT NULL DEFAULT 1.0,
  avg_quality numeric NOT NULL DEFAULT 1.0,
  PRIMARY KEY (session_id, trade_system_id, basket_key)
);

-- Snapshot pro diff (korekce 4)
CREATE TABLE trade_system_node_snapshot (
  session_id uuid NOT NULL,
  node_id uuid NOT NULL,
  trade_system_id uuid,
  system_key text,
  snapshot_turn int,
  snapshot_at timestamptz DEFAULT now(),
  PRIMARY KEY (session_id, node_id)
);

-- Access — PROJEKCE, ne pravda (korekce 1)
CREATE TABLE player_trade_system_access (
  session_id uuid NOT NULL,
  player_name text NOT NULL,
  trade_system_id uuid NOT NULL REFERENCES trade_systems(id) ON DELETE CASCADE,
  access_level text NOT NULL,                -- direct | treaty | open | occupied | vassal
  tariff_factor numeric NOT NULL DEFAULT 1.0,
  access_source text,                        -- 'own_city' | 'open_borders' | 'trade_treaty' | 'occupation' | 'vassalage' | 'discovery'
  computed_at timestamptz DEFAULT now(),
  PRIMARY KEY (session_id, player_name, trade_system_id)
);
CREATE INDEX idx_ptsa_player ON player_trade_system_access(session_id, player_name);

-- Diplomatic treaties — pravda pro access projekci
CREATE TABLE diplomatic_treaties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  treaty_type text NOT NULL,                 -- 'open_borders' | 'trade_access'
  player_a text NOT NULL,
  player_b text NOT NULL,
  status text NOT NULL DEFAULT 'active',     -- 'active' | 'cancelled' | 'broken'
  signed_turn int,
  cancelled_turn int,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_treaties_session_active ON diplomatic_treaties(session_id, status);

-- Province nodes: jen UI cache pro trade_system_id
ALTER TABLE province_nodes ADD COLUMN trade_system_id uuid;

-- Province routes: ontologické oddělení
ALTER TABLE province_routes
  ADD COLUMN route_origin text NOT NULL DEFAULT 'generated',
  -- 'generated' | 'player_built' | 'treaty' | 'event'
  ADD COLUMN construction_state text NOT NULL DEFAULT 'complete';
  -- 'planned' | 'under_construction' | 'complete' | 'cancelled'

-- Realm resources: manpower + upkeep
ALTER TABLE realm_resources
  ADD COLUMN manpower_available int NOT NULL DEFAULT 0,
  ADD COLUMN manpower_mobilized int NOT NULL DEFAULT 0,
  ADD COLUMN military_gold_upkeep numeric NOT NULL DEFAULT 0,
  ADD COLUMN military_food_upkeep numeric NOT NULL DEFAULT 0,
  ADD COLUMN over_mobilized boolean NOT NULL DEFAULT false;

-- Military stacks: soldiers + assignment
ALTER TABLE military_stacks
  ADD COLUMN soldiers int NOT NULL DEFAULT 0,
  ADD COLUMN assignment text NOT NULL DEFAULT 'idle',
  -- 'idle' | 'marching' | 'guarding' | 'building_route' | 'besieging' | 'escorting'
  ADD COLUMN assigned_route_id uuid,
  ADD COLUMN upkeep_gold numeric NOT NULL DEFAULT 0,
  ADD COLUMN upkeep_food numeric NOT NULL DEFAULT 0,
  ADD COLUMN construction_progress numeric NOT NULL DEFAULT 0;
```

**Backfill (přes insert tool, ne migration):**
```sql
-- Manpower available (korekce 5 týká soldiers, manpower zvlášť)
UPDATE realm_resources
SET manpower_available = GREATEST(0, manpower_pool - manpower_committed);

-- Soldiers konzervativně (korekce 5)
UPDATE military_stacks
SET soldiers = COALESCE(NULLIF(soldiers, 0), GREATEST(1, ROUND(power / 1.0)))
WHERE is_active = true;

-- Existing routes = generated/complete (defaulty stačí, ale pro jistotu)
UPDATE province_routes
SET route_origin = 'generated', construction_state = 'complete'
WHERE route_origin IS NULL OR construction_state IS NULL;
```

**RLS:**
- `trade_systems`, `trade_system_basket_supply`, `trade_system_node_snapshot`, `player_trade_system_access`: read pro session members; write jen service role.
- `diplomatic_treaties`: read pro session members; write jen service role (přes `command-dispatch`).

---

## Etapa 2 — Ochrana player-built routes

`compute-province-routes`:
- Smí číst/mazat/insert jen řádky `route_origin='generated'`.
- `route_origin IN ('player_built','treaty','event')` jsou **immutable** — pouze `flow_paths` cache se přepočte, nic víc.
- Snapshot test: re-run nezmění hash player_built řádků.

---

## Etapa 3 — Neutral nodes density

`generate-neutral-nodes`:
- `targetCount = floor(passableUnownedHexes * density)`, presets `small=0.06 / medium=0.05 / large=0.04`.
- Min vzdálenost mezi neutrály ≥ 2 hex; city-radius=2 exclusion zachován.
- `node_subtype` 4 role: `neutral_settlement / resource_site / shrine_ruin / outpost`, persist do `metadata.role_intent`.
- `repair-world`: idempotentní backfill pro existující sessions.

---

## Etapa 4 — `compute-trade-systems` (NOVÁ edge)

Pořadí v `refresh-economy`:
```
compute-province-routes
compute-hex-flows
compute-trade-systems    ← NEW
compute-trade-flows
compute-economy-flow
```

Logika:
1. **Snapshot uložit** (korekce 4): copy `province_nodes.trade_system_id` + lookup `system_key` → `trade_system_node_snapshot`.
2. Načti nody + routes kde **`construction_state='complete'` AND `control_state='open'`** (korekce 2 — `contested` se nepouští) AND `route_state.lifecycle_state IN ('maintained','usable','degraded')`.
3. Union-find / BFS → connected components.
4. Pro každou komponentu:
   - `system_key = sha256(sorted(node_ids).join(',')).slice(0,16)`.
   - Upsert `trade_systems(session_id, system_key)`.
   - Naplň cache `province_nodes.trade_system_id`.
5. **Diff snapshotu** → emit `world_events`:
   - new key = `trade_system_formed`
   - chybějící key = `trade_system_dissolved`
   - množina nodů ze 2+ starých keys → 1 nový = `trade_system_merged`
   - 1 starý key → 2+ nových = `trade_system_split`
6. **Access projekce** (korekce 1) — TRUNCATE `player_trade_system_access` per session + reinsert:
   - `direct` = hráč má v komponentě vlastní city/owned node — `tariff=1.0`, source=`own_city`.
   - `open` = hráč má discovered neutrální node v komponentě bez hostile flag — `tariff=1.15`, source=`discovery`.
   - `treaty` = `diplomatic_treaties` aktivní (`open_borders` nebo `trade_access`) s některým `direct` členem komponenty — `tariff=1.05`, source=odpovídající.
   - `occupied` = hráč okupuje cizí node v komponentě — `tariff=1.0`, source=`occupation`.
   - `vassal` = vazalský vztah — `tariff=0.95`, source=`vassalage`.

---

## Etapa 5 — `compute-trade-flows` system aggregation

Refactor:
- Per-system agregace baskets:
  - `total_supply` = Σ exportable production v komponentě (po `route_access_factor` na hraně).
  - `total_demand` = Σ city baskets v komponentě.
  - `surplus = max(0, supply - demand)`, `shortage = max(0, demand - supply)`.
  - **Symetrický price** (korekce 3):
    ```
    pressure = (demand - supply) / max(demand + supply, 1)
    price_index = clamp(0.5, 2.0, 1 + pressure)
    ```
  - `avg_quality` = capacity-weighted mean.
- Per-city fill:
  1. Local production (bez tariffu).
  2. System pool — jen pro komponentu s aktivním `player_trade_system_access`. Aplikuj `tariff_factor × route_access_factor × (1 - exportable_ratio_penalty)`.
  3. Žádný access → 0 z importu.
- Persist do `city_market_baskets` + `trade_system_basket_supply`.

---

## Etapa 6 — Manpower & army construction commands

Přes `command-dispatch` (idempotent, command_id):

- `MOBILIZE_MANPOWER { source_city_id, soldiers, target_stack_id? }`
  - Hard cap: `manpower_mobilized + soldiers ≤ 0.20 × total_population` → reject.
  - Po insertu: `over_mobilized = (mobilized / pop ≥ 0.10)` flag → `process-turn` aplikuje upkeep ×1.5, city production ×0.85, +unrest.
  - Upkeep: `0.003 × soldier_value` gold + `0.004` food (mem://features/military/upkeep-parity).
- `DEMOBILIZE_MANPOWER { stack_id, soldiers }` — opak, respektuje `remobilize_ready_turn`.
- `BUILD_ROUTE { from_node_id, to_node_id, assigned_stack_id, road_type }`
  - Validace path: A* po hexech kde každý je `discovered=true` AND (vlastní OR neutrální non-hostile).
  - Pokud path obsahuje neutrální hex → vypočti risk flagy → ulož do `province_routes.metadata.risk_flags`:
    - `ambush_chance`, `local_resistance`, `diplomatic_penalty`, `construction_slowdown`.
  - Stack musí být na `from_node_id`; `assignment='building_route'`.
  - Strhne počáteční gold (50 trail / 100 road / 200 paved / 30 harbor_link).
  - Insert `province_routes` s `route_origin='player_built'`, `construction_state='under_construction'`, `control_state='open'`.
  - Insert `route_state` s `lifecycle_state='under_construction'`.
- `ASSIGN_STACK_TO_ROUTE { stack_id, route_id }` — re-assign rozestavěné cesty.
- `CANCEL_ROUTE_CONSTRUCTION { route_id }` — refund 50 % gold, `construction_state='cancelled'`, stack → `idle`.
- **Diplomacy commands (korekce 1):**
  - `PROPOSE_OPEN_BORDERS { partner }` → vznik nabídky.
  - `PROPOSE_TRADE_ACCESS_TREATY { partner }` → vznik nabídky.
  - `ACCEPT_TREATY { treaty_id }` → insert do `diplomatic_treaties` se `status='active'`. **Žádný přímý zápis do `player_trade_system_access`** — projekce proběhne v dalším `compute-trade-systems`.
  - `BREAK_TREATY { treaty_id }` → `status='broken'`, `cancelled_turn`.

---

## Etapa 7 — `process-turn` construction tick

Mezi Tick fází a Battles:
- Pro každý stack `assignment='building_route'`:
  - `engineering_mult = { trail:1.0, road:0.7, paved:0.4, harbor_link:0.5 }[road_type]`
  - `terrain_mult` = avg pomalost biomes na hex_path.
  - `risk_mult = 1 - construction_slowdown`.
  - `progress += soldiers × engineering_mult × terrain_mult × risk_mult`.
  - Ambush check: P=`ambush_chance`. Při proc → `world_event`, ztráta `soldiers × 0.05`.
  - Při `progress ≥ build_cost`:
    - `province_routes.construction_state='complete'`, `route_state.lifecycle_state='usable'`.
    - Stack → `assignment='idle'`, `assigned_route_id=null`.
    - Emit `route_constructed`.
- Strhni `military_gold_upkeep` + `military_food_upkeep`. Aplikuj soft over-mobilization (×1.5) podle `over_mobilized`.
- `manage-route` rozšířit: pod `construction_state='under_construction'` žádný decay, žádný `INVEST_MAINTENANCE`.

---

## Etapa 8 — WorldMap overlays + UI

`WorldHexMap` — nové layer toggles:

1. **Trade Systems overlay**: barevné podsvícení per `trade_system_id` (deterministická barva z `system_key`). Klik → side panel s přístupem, členy, surplus/deficit, ceny, fill efekt na vlastní města.
2. **Build Mode** (toggle "Postavit cestu"): hover ukazuje A* preview (hex count, terrain mult, soldiers required, gold cost, ETA, risk badges). `BuildRouteDialog` s road_type + stack picker; pro neutrální path varovná sekce s riziky.
3. **Routes overlay**: barvy podle stavu (green/yellow/orange/red) + dashed pulsing pro `under_construction` s progress badgem.
4. **NeutralNodePanel** rozšířit: sekce "Trade system", akce **Napojit cestou** předvyplní Build Mode.
5. **HUD**: karta **Manpower** (`available / mobilized / cap`), warning při ≥10 % a ≥20 %, tooltip s upkeep.
6. **Army Panel**: assignment dropdown, progress bar pro `building_route` + risk badges.

WorldMap **jen vizualizuje** kanonické výstupy — žádné direct writes.

---

## Etapa 9 — Legacy degradace

- `TradePanel` → přesun do **Diplomacy → Smluvní obchod (legacy)**.
- `compute-trade-flows` přestane číst `trade_routes` jako automatický fill. Smluvní access běží jen přes `diplomatic_treaties` → projekce.
- Banner: "Smluvní obchod je nyní diplomatický nástroj. Pro automatický tok zboží uzavři **Open Borders** nebo **Trade Access Treaty**."

---

## Pořadí commitů (LOCK)

1. Schema migrate (Etapa 1) + backfill scripty.
2. `route_origin` ochrana v `compute-province-routes` (Etapa 2).
3. `generate-neutral-nodes` density + `repair-world` backfill (Etapa 3).
4. `compute-trade-systems` (Etapa 4) + integrace do `refresh-economy` + snapshot/diff + access projekce.
5. `compute-trade-flows` system aggregation se symetrickým price (Etapa 5).
6. Manpower + BUILD_ROUTE + treaty commands v `command-dispatch` (Etapa 6).
7. `process-turn` construction tick (Etapa 7).
8. WorldMap overlays + UI (Etapa 8).
9. Legacy degradace (Etapa 9).

Schválením spustím Etapu 1.
