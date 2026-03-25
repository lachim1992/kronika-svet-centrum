

## Node Upkeep & Break-Even Economy

### Problem
Currently all nodes produce resources from Lv.1 with zero maintenance cost. There is no "investment phase" — building a node is immediately profitable. The user wants a progression loop:
**Build node → subsidize it → upgrade → break-even → profit → fund next tier.**

### Design: Subtype-Based Upkeep System

Each node subtype has a fixed **upkeep cost** (supplies + wealth consumed per turn). At Lv.1, upkeep exceeds output → the node is a **net drain** on the capital. Upgrading increases output but upkeep stays constant → node hits **break-even at Lv.2** and becomes a **surplus generator** at Lv.3+.

```text
               Output vs Upkeep by Level
  ┌─────────────────────────────────────────────┐
  │  Output  ████████████████████████████  Lv.5  │
  │          ██████████████████           Lv.4  │
  │          ████████████                 Lv.3  │ ← surplus
  │  Upkeep  ═══════════════              fixed │ ← break-even ~Lv.2
  │          ████████                     Lv.2  │
  │          █████                        Lv.1  │ ← deficit (dotovaný)
  └─────────────────────────────────────────────┘
```

### Changes

#### 1. `src/lib/nodeTypes.ts` — Add upkeep definitions

Add `upkeep: { supplies: N, wealth: N }` to every Minor and Micro subtype definition. Also add upkeep to Major node types.

Example upkeep values (tuned so Lv.1 output < upkeep, Lv.2 ≈ break-even):

**Micro nodes** (small upkeep):
- field: `{ supplies: 1, wealth: 0.5 }`
- sawmill: `{ supplies: 1.5, wealth: 1 }`
- mine: `{ supplies: 2, wealth: 1 }`
- etc.

**Minor nodes** (medium upkeep):
- village: `{ supplies: 3, wealth: 2 }`
- mining_camp: `{ supplies: 4, wealth: 2 }`
- lumber_camp: `{ supplies: 3, wealth: 2 }`
- trade_post: `{ supplies: 2, wealth: 3 }`
- shrine: `{ supplies: 2, wealth: 1 }`
- etc.

**Major nodes** (high upkeep):
- city: `{ supplies: 10, wealth: 6 }`
- fortress: `{ supplies: 8, wealth: 4 }`
- trade_hub: `{ supplies: 6, wealth: 8 }`
- guard_station: `{ supplies: 6, wealth: 3 }`

Add helper function `computeNetBalance(tier, subtype, upgradeLevel, biome)` returning `{ netProduction, netSupplies, netWealth, isDeficit }`.

#### 2. `supabase/functions/compute-economy-flow/index.ts` — Integrate upkeep into flow

- Add upkeep constants mirroring `nodeTypes.ts`
- In Phase 2 (upward aggregation), after computing raw output, subtract upkeep before forwarding
- If `output - upkeep < 0`, the deficit is "pulled" from the parent node (capital subsidizes)
- Track deficit per node for visualization
- Store `upkeep_supplies`, `upkeep_wealth`, `net_balance` in node updates

#### 3. Database migration — Add upkeep columns to `province_nodes`

```sql
ALTER TABLE province_nodes
  ADD COLUMN IF NOT EXISTS upkeep_supplies numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upkeep_wealth numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_balance numeric DEFAULT 0;
```

#### 4. `src/components/WorldHexMap.tsx` — Visual indicators

- Fetch `net_balance` along with other node fields
- Render colored glow around node markers:
  - **Red glow** (`net_balance < 0`): node is in deficit, being subsidized
  - **Green glow** (`net_balance > 0`): node is generating surplus
  - Intensity proportional to absolute value
- No change to micro node rendering (too small) — only minor and major get glow

#### 5. `src/components/BuildNodeDialog.tsx` — Show upkeep preview

- In the node type selection, show upkeep cost next to production preview
- Display expected net balance at Lv.1: "⚠️ Deficit: -2.5🌾 -1.5💰 (break-even at Lv.2)"
- Color-code: red text for deficit, green for surplus

#### 6. Node detail panel (click on node) — Full economics breakdown

- Show: Raw Output | Upkeep | Net Balance | Break-even level
- Show incoming resources from children vs outgoing to parent
- Visual bar comparing output to upkeep

### Flow Logic Detail

The key change in the edge function:

```text
For each node:
  gross_output = base × upgrade_mult × biome_match × region_mod
  net_output = gross_output - upkeep
  
  if net_output > 0:
    forward net_output × (1 - tier_consumption) to parent  ← surplus
  else:
    forward 0 to parent
    deficit = |net_output|  ← capital must cover this
    
Capital total income = Σ(surplus from all nodes) - Σ(deficits from all nodes)
```

This creates the natural loop:
1. **Early game**: Capital has some base income. Player builds 1-2 micronodes → small deficit but manageable
2. **Upgrade to Lv.2**: Micros break even, start generating small surplus
3. **Surplus funds Minor node**: Minor at Lv.1 is expensive deficit, but micro surplus helps
4. **Upgrade Minor**: At Lv.2 Minor breaks even, Lv.3+ generates significant surplus
5. **Major node**: Requires substantial surplus from multiple minors to fund the large deficit
6. **Mature economy**: Fully upgraded network generates massive surplus flowing to capital

### Files to modify
- `src/lib/nodeTypes.ts` — upkeep definitions + net balance helper
- `supabase/functions/compute-economy-flow/index.ts` — upkeep subtraction in flow logic
- `supabase/migrations/` — new columns on `province_nodes`
- `src/components/WorldHexMap.tsx` — red/green glow visualization
- `src/components/BuildNodeDialog.tsx` — upkeep preview in build UI
- `src/components/map/RouteCorridorsOverlay.tsx` — net balance in route detail

