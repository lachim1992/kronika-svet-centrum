

# Chronicle Economy v4.1 — Final Revised Plan with Macro Integration & Dev Mode Updates

## What Changed from v4.0

Three additions based on your feedback:

1. **Macro Integration Layer** — goods economy feeds all 7 top-bar stats (Production, Wealth, Supplies, Capacity, Faith, Prestige, Population) as derived aggregates, not parallel abstractions
2. **Quality Inheritance Rule** — flavor variants decorate but never override parent system-good economics
3. **Dev Mode Integration** — all existing dev panels and economy visualizations updated to reflect the new goods-based economy

---

## Core Design Rules (Locked)

- `hex → resource → processed base → urban branch → guild → city market → demand baskets → trade pressure → flows → retention/capture → taxes → macro aggregates`
- Baskets are aggregation over goods, not replacement
- Production is fine-grained (node-level); trade is aggregated (city/hub-level)
- Variants decorate and bias, but do not replace system-good economics
- No parallel economy — macro stats derived from goods economy outputs
- Urban divergence is the core branching point

---

## NEW: Phase 10 — Macro Integration Layer

How goods economy feeds each top-bar stat:

### Production (⚒️)
= aggregated output efficiency of all production chains
- Source node extraction volume × quality
- Processing node throughput (raw→processed conversion rate)
- Urban node final goods output
- Guild efficiency bonuses
- Workforce utilization
- Supply chain connectivity (isolation penalties reduce it)

### Wealth (💰)
= fiscally captured economic activity
- **Population tax**: pop × land × urbanization factor
- **Market tax**: domestic trade flow volume × city market_level
- **Transit tax**: through-flow volume at hubs/ports × toll_rate
- **Extraction tax**: state-controlled source node output (crown mines, monopolies)
- **Capture bonus**: commercial_capture × foreign demand served
- **Leakage penalty**: high import dependency, weak domestic retention

### Supplies (🌾)
= aggregated storable survival/logistics goods
- Derived from goods tagged as `storable: true` (grain, flour, dried food, salt, timber, iron ingots, oil, basic textiles)
- Storage infrastructure affects capacity
- Surplus accumulates; deficit draws down reserves
- Not all goods contribute — only survival/logistics-relevant ones

### Capacity (🏛️)
= system's ability to sustain growth
- **Material**: construction goods availability (stone, timber, processed blocks, iron)
- **Institutional**: guild sophistication + urbanization level + administrative nodes
- **Logistic**: access_score network + major/minor node density + route quality

### Faith (⛪)
= ritual economy strength + cleric satisfaction
- Ritual basket fulfillment (wine, incense, oils, textiles, candles/wax, sacred materials)
- Temple/shrine node output
- Cleric layer satisfaction score
- Temple construction goods availability

### Prestige (⭐)
= output of luxury/famous economy + cultural dominance
- Luxury goods production volume and quality
- Famous goods (guild tradition milestones)
- Export of high-tier goods (capture prestige)
- Monumental construction
- Cultural/ritual variety and quality

### Population (👥)
= demographic response to economic conditions
- Staple food basket fulfillment → growth/decline
- Stability basket fulfillment → retention
- Urban comfort and variety → urban pull
- Employment in production chains → economic opportunity
- Import dependency shocks → crisis risk

---

## NEW: Phase 11 — Dev Mode & UI Integration

### A. Update `HexNodeMechanicsPanel.tsx` (675 lines)

**Causal Map** — add ~15 new causal links for goods economy:
- `resource_deposits → source_node_output` (yield × quality)
- `capability_tags → recipe_eligibility`
- `production_role → goods_chain_position`
- `guild_level → branch_unlock + quality_ceiling`
- `specialization_scores → famous_good_chance`
- `demand_basket_satisfaction → city_stability`
- `trade_pressure → trade_flow_creation`
- `commercial_retention → wealth_tax_base`
- `commercial_capture → export_income`
- `trade_ideology → merchant_flow_mult + tariff_base`
- `goods_output → macro_production_aggregate`
- `market_tax + transit_tax → macro_wealth_aggregate`
- `storable_goods_surplus → macro_supplies_aggregate`
- `ritual_basket_fulfillment → macro_faith_aggregate`
- `luxury_famous_output → macro_prestige_aggregate`

**Constants Table** — add new sections:
- Resource type spawn rules (biome → resource mapping)
- Recipe constants (input→output ratios, labor costs)
- Demand basket weights per social layer
- Trade pressure formula weights
- Tax rate constants per ideology
- Guild progression thresholds

**Implementation Audit** — add new audit items:
- Goods production chain (source→processing→urban→guild): `planned`
- Demand basket computation: `planned`
- Trade pressure engine: `planned`
- Commercial retention/capture: `planned`
- Macro aggregation from goods: `planned`
- Quality inheritance enforcement: `planned`

**Data Audit** — add live queries for new tables:
- resource_types count
- goods count (system vs flavor variants)
- production_recipes count
- demand_baskets per city
- trade_flows (active/trial/dominant counts)
- node_inventory totals
- city_market_summary snapshots

### B. Update `EconomyDependencyMap.tsx` (221 lines)

Currently shows: Pop → Workforce → Production → Wealth → Reserves → Stability → Prestige

**Replace with goods-aware dependency graph:**
```
Hex Resources → Source Nodes → Processing Nodes → Urban Nodes → Guild Nodes
                                                                    ↓
                                                            City Market
                                                                    ↓
                                                          Demand Baskets
                                                         ↙    ↓    ↘
                                                   Need  Upgrade  Prestige
                                                                    ↓
                                                          Trade Pressure
                                                                    ↓
                                                           Trade Flows
                                                          ↙         ↘
                                                  Retention      Capture
                                                          ↘         ↙
                                                         Taxation
                                                            ↓
                                              Macro Stats (top bar)
```

Each node shows live values from DB. Clicking a node drills into detail.

### C. Update `FormulasReferencePanel.tsx` (129 lines)

Add new formula sections:
- **Goods Production**: `output = recipe_base × quality_input × guild_bonus × workforce_ratio`
- **Demand Fulfillment**: `satisfaction = Σ(good_qty × substitution_score) / basket_need`
- **Trade Pressure**: full formula with all 5 pressure types
- **Retention/Capture**: `retention = domestic_fulfilled / total_demand`, `capture = export_fulfilled / reachable_foreign_demand`
- **Tax Breakdown**: population + market + transit + extraction formulas
- **Macro Derivation**: how each top-bar stat aggregates from goods layer

### D. New Dev Panel: `GoodsEconomyDebugPanel.tsx`

Add to DevTab alongside existing panels:
- **Production Chain Viewer**: tree view of source→processing→urban→guild for selected city/node
- **Demand Pyramid**: visual pyramid per city showing tier 1-5 satisfaction with color coding
- **Trade Flow Map**: table of active/trial/dominant flows with pressure scores
- **Market Summary**: per-city goods supply vs demand table
- **Retention/Capture Dashboard**: realm-level metrics with breakdown
- **Recipe Browser**: searchable catalog of all recipes with inputs/outputs

### E. Update `ResourceHUD.tsx` (311 lines)

Currently shows macro stats as standalone values. After goods integration:
- Each macro stat gets a tooltip showing its derivation source (e.g., "Wealth = pop_tax 12 + market_tax 8 + transit_tax 3 + extraction 2 - leakage 1 = 24")
- Red/green trend indicators based on goods flow health
- Warning badges when key demand baskets are critically unfulfilled

### F. Update `EconomyTab.tsx` (568 lines)

Add new sub-tabs:
- **Goods & Production**: production chain overview with branching visualization
- **Demand**: city demand pyramid with satisfaction bars
- **Trade**: replace/extend existing TradePanel with goods-aware flow view
- **Fiscal**: tax breakdown (population/market/transit/extraction) with retention/capture metrics

---

## Implementation Order (12 Phases Total)

| Phase | What | Files |
|-------|------|-------|
| 1 | Export full spec to `/mnt/documents/` (JSON + MD) | script only |
| 2 | DB tables: resource_types, goods, good_variants, production_recipes | migration |
| 3 | DB tables: node_inventory, city_market_summary, demand_baskets, trade_flows | migration |
| 4 | DB columns: province_nodes + production_role, capability_tags, etc. | migration |
| 5 | DB columns: realm_resources + retention, capture, tax breakdown, ideology | migration |
| 6 | `nodeTypes.ts` — new subtypes + capability tags + role mapping | client lib |
| 7 | `economyFlow.ts` / `economyConstants.ts` — goods catalog, recipe defs, demand weights | client lib |
| 8 | Edge function: `compute-economy-flow` refactor (8-phase goods-aware) | edge function |
| 9 | Edge function: `compute-trade-flows` (new) | edge function |
| 10 | Macro Integration: `process-turn` derives top-bar from goods aggregates | edge function |
| 11 | Dev Mode: update HexNodeMechanicsPanel, EconomyDependencyMap, FormulasReference + new GoodsEconomyDebugPanel | client components |
| 12 | Player UI: EconomyTab sub-tabs, ResourceHUD tooltips, demand pyramid, trade flow overlay | client components |

---

## Files Affected

### New files:
- `src/components/dev/GoodsEconomyDebugPanel.tsx`
- `supabase/functions/compute-trade-flows/index.ts`
- `src/lib/goodsCatalog.ts` (MVP goods + recipes + substitution maps)
- 4-5 migration files

### Modified files:
- `src/components/dev/HexNodeMechanicsPanel.tsx` — new causal links, constants, audit items, data queries
- `src/components/economy/EconomyDependencyMap.tsx` — goods-aware dependency graph
- `src/components/economy/FormulasReferencePanel.tsx` — new formula sections
- `src/components/layout/ResourceHUD.tsx` — derivation tooltips
- `src/pages/game/EconomyTab.tsx` — new sub-tabs
- `src/pages/game/DevTab.tsx` — add GoodsEconomyDebugPanel
- `src/lib/nodeTypes.ts` — new subtypes + tags
- `src/lib/economyFlow.ts` — goods-aware resource definitions
- `src/lib/economyConstants.ts` — demand weights, tax formulas
- `supabase/functions/compute-economy-flow/index.ts` — 8-phase refactor
- `supabase/functions/process-turn/index.ts` — macro derivation from goods

