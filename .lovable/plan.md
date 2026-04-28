# Node-Trade v1 — IMPLEMENTAČNÍ LOCK

Architektonické pravidlo:
> **Diplomacy writes treaties. `compute-trade-systems` projects access. `compute-trade-flows` consumes access. WorldMap only visualizes canonical outputs.**

## Stav etap

- [x] **Etapa 1 — Schema** (migrace + backfill, RLS read-only public, write jen service role).
  Tabulky: `trade_systems`, `trade_system_basket_supply`, `trade_system_node_snapshot`, `player_trade_system_access`, `diplomatic_treaties`.
  Sloupce: `province_nodes.trade_system_id`, `province_routes.{route_origin, construction_state}`, `realm_resources.{manpower_available, manpower_mobilized, military_gold_upkeep, military_food_upkeep, over_mobilized}`, `military_stacks.{soldiers, assignment, assigned_route_id, upkeep_gold, upkeep_food, construction_progress}`.
- [x] **Etapa 2 — Ochrana player_built routes** v `compute-province-routes`: maže jen `route_origin='generated'`, pre-seeduje `routeSet` pairs z protected řádků, inserts mají explicit `route_origin='generated'`, `construction_state='complete'`.
- [ ] **Etapa 3 — Neutral nodes density** (`generate-neutral-nodes`: presets 0.06/0.05/0.04, 4 role intent, repair-world backfill).
- [ ] **Etapa 4 — `compute-trade-systems`** (snapshot → BFS jen `control_state='open'` + lifecycle usable/maintained/degraded → deterministic system_key sha256(sorted nodes)[0:16] → upsert + diff events → access projekce z `diplomatic_treaties` + own_city/discovery/occupation/vassalage).
- [ ] **Etapa 5 — `compute-trade-flows`** system aggregation; symetrický price `pressure=(d-s)/max(d+s,1)`, `price=clamp(0.5,2.0,1+pressure)`; per-city fill local→system pool s tariff×route_access×exportable_penalty.
- [ ] **Etapa 6 — Commands** v `command-dispatch`: MOBILIZE/DEMOBILIZE_MANPOWER (hard 20% cap, soft 10% over_mobilized flag), BUILD_ROUTE (A* validation, neutral risk flags, route_origin='player_built', construction_state='under_construction'), ASSIGN_STACK_TO_ROUTE, CANCEL_ROUTE_CONSTRUCTION, PROPOSE/ACCEPT/BREAK_TREATY (open_borders, trade_access).
- [x] **Etapa 7 — `process-turn` construction tick + manpower ledger**: progress = soldiers × engineering_mult; complete → construction_state='complete', stack assignment='idle'. Upkeep parity 0.3% gold + 0.4% food per soldier; over_mobilized (>10% pop) → ×1.5 upkeep. Writes `manpower_available`/`manpower_mobilized`/`over_mobilized`/`military_gold_upkeep`/`military_food_upkeep` na `realm_resources`. (Ambush check + ×0.85 city prod + unrest odloženo do Etapy 8 UI feedback.)
- [x] **Etapa 8 — WorldMap UI**: ManpowerHUDCard, WorldMapBuildPanel (Build Mode + assignment + cancel), UnderConstructionRoutesOverlay (dashed pulse + %), TradeSystemsOverlay (color halos). Recruit refactor: free-form `manpower` proti `realm.manpower_pool`. Nové commandy ASSIGN_STACK_TO_ROUTE + CANCEL_ROUTE_CONSTRUCTION.
- [ ] **Etapa 9 — Legacy degradace**: TradePanel pod Diplomacy → Smluvní obchod (legacy); compute-trade-flows přestane číst trade_routes pro auto-fill.

## Klíčové konstanty

- **Neutral density**: small=0.06, medium=0.05, large=0.04.
- **Price**: `pressure=(d-s)/max(d+s,1); price=clamp(0.5,2.0,1+pressure)`.
- **Tariffs**: direct=1.0, occupied=1.0, treaty=1.05, open=1.15, vassal=0.95.
- **Manpower**: hard 20% pop, soft trigger 10%.
- **Upkeep parity**: 0.3% gold + 0.4% food per soldier.
- **soldier_power_ratio**: 1.0 (zatím konstanta, později economy_overrides).
- **engineering_mult**: trail=1.0, road=0.7, paved=0.4, harbor_link=0.5.
- **Build cost**: trail=50, road=100, paved=200, harbor_link=30.
- **system_key**: `sha256(sorted(node_ids).join(',')).slice(0,16)`.
- **BFS edge filter**: `construction_state='complete'` AND `control_state='open'` AND `route_state.lifecycle_state IN ('maintained','usable','degraded')`. (`contested` mimo MVP.)
