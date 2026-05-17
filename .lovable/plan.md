# Economy Debug Tab — Plan

A new **Dev Mode-only** top-level tab in `EconomyTab` that acts as a forensic observability layer over the economy/trade engine. Read-only (except for triggering existing `refresh-economy`), no migrations, no new solvers, no business logic.

## Scope

- Frontend-only. No DB changes. No new edge functions.
- Visible only when `useDevMode().devMode === true`.
- Every section labels its source table + row counts + max `turn_number`.
- No "pretty" graphs in v1 — tables, health checks, and pipeline panels.

## Files

New:
- `src/components/economy/EconomyDebugTab.tsx` (orchestrator, parallel fetch + section layout)
- `src/components/economy/debug/EconomyDebugHealth.tsx`
- `src/components/economy/debug/EconomyDebugLedger.tsx`
- `src/components/economy/debug/EconomyDebugProduction.tsx`
- `src/components/economy/debug/EconomyDebugBaskets.tsx`
- `src/components/economy/debug/EconomyDebugTradeSystems.tsx`
- `src/components/economy/debug/EconomyDebugFlows.tsx`
- `src/components/economy/debug/EconomyDebugFiscal.tsx`
- `src/components/economy/debug/EconomyDebugManualDeals.tsx`

Edited:
- `src/pages/game/EconomyTab.tsx` — add dev-gated `TabsTrigger` + `TabsContent` for `debug`. Also fix the stale "4 kroky" toast/badge text to reflect the **6-step** chain (routes → hex-flows → trade-systems → trade-flows → basket-trade-flows → economy-flow).

## Section contract

```
1. Health      — sessionId/turn/player, expected 6-step chain, row counts,
                 max turn_number per table, warning list (stale snapshots,
                 orphan city_id/node_id, flows=0 vs surplus+deficit,
                 capture=0 vs export flows, transit=0 vs cross-player flows,
                 capacity=0 vs nodes>0, etc.)
2. Ledger      — realm_resources fields verbatim + meaning labels
3. Production  — A) province_nodes raw   B) node_inventory by good/basket
                 C) city_market_baskets auto/bonus/local supply
4. Baskets     — basket × {demand, local, auto, bonus, import,
                 export_surplus, unmet, satisfaction, bottleneck cause}
5. Trade Sys   — trade_systems + player_trade_system_access (access graph,
                 explicitly NOT manual contracts)
6. Flows       — trade_flows + basket_trade_flows, IDs resolved to names,
                 orphan checks (*_city_id → cities, *_node_id → province_nodes)
7. Fiscal      — pipeline: goods_production_value → taxes → capture →
                 goods_wealth_fiscal → total_wealth; warnings
8. Manual      — trade_routes + trade_offers, clearly labeled as
                 "Manual diplomatic layer — not the automatic economy"
```

## Data access

Single `EconomyDebugTab` performs parallel `supabase.from(...).select(...)` for: `realm_resources`, `cities`, `province_nodes`, `province_routes`, `trade_systems`, `player_trade_system_access`, `node_inventory`, `city_market_baskets`, `demand_baskets`, `trade_flows`, `basket_trade_flows`, `trade_routes`, `trade_offers`. Passes slices to subcomponents. Each subcomponent renders a small "Source: <table> · turn=<n> · rows=<k>" footer.

## Bottleneck heuristic (Baskets)

```
local_supply == 0                       → "no local production"
bonus_supply == 0                       → "no recipe/node output"
export_surplus == 0 && unmet > 0        → "no surplus to export"
trade/basket flows == 0 && unmet > 0    → "no generated flow"
import == 0 && remote surplus exists    → "access/route blocked"
```

## ID hygiene (enforced in Flows section)

- `trade_flows.source_city_id` / `target_city_id` → resolve via `cities.id`
- `trade_flows.source_node_id` / `target_node_id` → resolve via `province_nodes.id`
- `basket_trade_flows.*_city_id` → `cities.id`
- Never mix — orphan counts surface as red warnings.

## Out of scope (v1)

- Flow diagrams / sankey / animated graphs.
- New edge function (`economy-debug-snapshot`) — defer until UI is too slow.
- Any writes beyond invoking existing `refresh-economy`.
- Player-facing copy or labels.

## Acceptance

- Tab hidden when `devMode === false`.
- A dev can answer in one screen: (a) why basket X has deficit despite surplus elsewhere, (b) why a flow didn't propagate into fiscal.
- Every section shows its source table, latest turn, row count.
- EconomyTab footer/toast no longer says "4 kroky" — corrected to 6-step chain.
- Build passes; no migrations.
