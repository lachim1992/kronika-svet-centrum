# JV72O7 turn 21 — army deactivation, trade and chain audit (read-only)

Session d379caff-8992-48e2-9084-7c9d74acceb1, base commit dfcf72fb. Fixture: `src/test/fixtures/jv72o7-turn21-committed-snapshot.json`
= `economy_turn_ledgers.committed_result.snapshot` (turn 21), SHA-256 `f30d707e2e6b86c034d35d2e0b3851ebcfe7929baf0fcfc92139f48857ebe7a5`.
Preview: `bun scripts/jv72o7-turn21-deactivation-preview.ts` (pure `resolveGoodsEconomy`, no DB, input proven unmutated).

## Timeline (UTC, 2026-11-18)
- 17:41 admin deactivated Železná horda (AI1, 7 373) → AI1 soldiers already 0 in ledgers 20/21.
- 18:44:06 ledger 21 committed with Player soldiers 1 101; 18:44:22 process-turn wrote realm_resources
  (pool 718, over_mobilized=true, military_food_upkeep=7) from those 1 101 active soldiers.
- 18:46:22 / 18:46:30 DISBAND Armáda Player / pojebemtoooo; 18:46:52 mobilization 0 %.
- Old DISBAND only set is_active=false and subtracted a client-supplied number from manpower_committed;
  pool/mobilized/over_mobilized/upkeep stayed stale until the next process-turn (they are recomputed there
  from `is_active=true` stacks; `military_food_upkeep`/`over_mobilized` are never read for charges).
- Note: `economy_turn_ledgers.result` (not committed_result) of turn 21 was later overwritten by an admin
  refresh in the previous iteration, which also raised water/peat/food building outputs; this audit uses committed_result only.

## Preview: committed replay vs current (all stacks inactive)
| Player | committed 21 (replay = ledger) | stacks inactive |
|---|---|---|
| soldiers | 1 101 | 0 |
| civilian workforce | 0 | 755 |
| lines running / no_workers / staffing | 41 / 39 / 13 | 71 / 3 / 13 |
| food / water / fuel coverage | 6.9 / 41.1 / 0 % | 100 / 100 / 59.1 % |
| physical flows | 0 | 9 (grain, flour, charcoal; all Player→Player) |
| import blockers | 66 source_empty, 16 route_unreachable | 29 source_empty, 1 route_unreachable |
AI1 and AI2 are identical in both runs.

**Root cause of zero flows in ledger 21:** 1 101 active soldiers consumed the whole Player civilian workforce,
so every Player source line had no workers and nothing was exportable (source_empty), not a routing bug.

## Physical graph (snapshot.edges = completed road_segments + rivers + spurs)
72 edges (47 river, 15 spur, 10 road), three disconnected components:
Player 5 cities (17 cells), AI1 (9 cells), AI2 (5 cells). Shortest gaps: Player (-6,-1) ↔ AI1 (-1,-4) 8 tiles;
AI1 (0,-5) ↔ AI2 (6,-5) 6 tiles; Player ↔ AI2 16 tiles. All 10 road_segments belong to Player.
The 108 province_routes (102 land_road, 6 sea_lane) all have `route_origin=generated`: they are the L1 access
graph from compute-province-routes, not built infrastructure; no sea lane links Player to another realm
(Lambadagrad's lane only reaches its own port). The only cross-realm candidate is the AI1↔AI2 port lane (12 hexes),
and goodsEconomy has no sea mode. Not integrated: it would invent a physical link. Missing: a built road
Player→AI1 (≥8 tiles), AI1→AI2 (≥6 tiles), or a built port+sea mode.
Embargo: the AI1–Player war is `peace_accepted`, so `snapshot.blockedTrade` is empty; node_blockades are
Ocelový klan diplomatic blocks. Nothing was changed.

## Chains
- grain→flour→baked_staples: working (flows of grain/flour; bake uses peat/charcoal with fallback).
- peat/charcoal: cut_peat starter sites + burn_charcoal exist; fuel 59 % after deactivation.
- raw_fiber→yarn→textile_basic: `harvest_flax`/`herd_sheep` unlock only at Farma level 2 (template level_data);
  upgrades copy level effects correctly. The only Player farm (Lemini) had effects narrowed to harvest_wheat by an
  earlier admin edit, and no Přádelna exists — data, not a mapping bug.
- raw_ore→iron_ingot→metalwork_tools: Důl/Huť/Kovárna templates are correct; none built in JV72O7. Not a mapping bug.

## Code fixes
- DISBAND_STACK: reads the stored owned active stack, derives men server-side, sets is_active=false and is_deployed=false,
  CAS on is_active, recomputes manpower_committed/mobilized/pool via readRealmWorkforce.
- Movement (hex + micro) refuses inactive stacks (`STACK_INACTIVE`); node siege capture ignores an inactive besieger.
- `_shared/stackState.ts` (isStackActive/isFieldStack) and `_shared/commandGate.ts` (TURN_RESOLVING 200 refusal, shared message).
Economy (`actualSoldiers`, adapter, process-turn upkeep), AI, field battles and siege units already filtered is_active.

Next task: decide whether to build a real Player→AI1 road (≥8 tiles) or add a physical sea mode for built ports.
