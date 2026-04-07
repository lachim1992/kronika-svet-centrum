/**
 * Static system map for Chronicle Observatory.
 * Defines all game mechanics as nodes and their relationships as edges.
 * Purely declarative — no runtime data fetching.
 *
 * UPDATED 2026-04: Full v4.1 goods pipeline, social drivers (legitimacy,
 * migration, labor), layer-based filtering, ~40 nodes, ~70 edges.
 */

export type SystemNodeType =
  | "resource"
  | "stat"
  | "social_driver"
  | "military_driver"
  | "economic_driver"
  | "narrative_driver"
  | "hidden_engine_stat"
  | "goods_pipeline";

export type NodeStatus =
  | "full"       // 🟢 fully connected
  | "partial"    // 🟡 partial downstream
  | "dead"       // 🔴 dead end
  | "auto"       // 🔵 automatic engine
  | "readonly"   // ⚪ read-only
  | "ai_only";   // 🟣 AI only

export type LinkType =
  | "causal"
  | "modifier"
  | "threshold"
  | "unlock"
  | "event_driven"
  | "projection";

export type AgencyLevel = "direct" | "indirect" | "none";

export type GapBadge =
  | "Dead metric"
  | "No player agency"
  | "AI only"
  | "UI hidden"
  | "No downstream"
  | "Threshold unused";

export type SystemLayer =
  | "core"
  | "economy_v41"
  | "military"
  | "narrative"
  | "infrastructure"
  | "social";

export interface SystemNode {
  id: string;
  label: string;
  type: SystemNodeType;
  status: NodeStatus;
  playerFacing: boolean;
  usedByAI: boolean;
  readOnly: boolean;
  agency: AgencyLevel;
  upstreamCount: number;
  downstreamCount: number;
  playerInfluenceScore: number;   // 0–10
  aiDependencyScore: number;      // 0–10
  uiSurfacingLevel: number;       // 0–10
  gaps: GapBadge[];
  formula?: string;
  description: string;
  layers: SystemLayer[];
  /** Optional DB table name for live data lookups */
  dbTable?: string;
  /** Optional edge function that writes this */
  writerFn?: string;
}

export interface SystemEdge {
  source: string;
  target: string;
  linkType: LinkType;
  label?: string;
}

export const LAYER_META: Record<SystemLayer, { icon: string; label: string; color: string }> = {
  core:           { icon: "🏛️", label: "Core", color: "#22c55e" },
  economy_v41:    { icon: "⚒️", label: "Economy v4.1", color: "#f59e0b" },
  military:       { icon: "⚔️", label: "Military", color: "#ef4444" },
  narrative:      { icon: "📜", label: "Narrative", color: "#8b5cf6" },
  infrastructure: { icon: "🔧", label: "Infrastructure", color: "#06b6d4" },
  social:         { icon: "👥", label: "Social", color: "#ec4899" },
};

// ─── NODE DEFINITIONS ────────────────────────────────────────

export const SYSTEM_NODES: SystemNode[] = [
  // ══════════════ CORE RESOURCES (6 PILLARS) ══════════════
  {
    id: "grain", label: "🌾 Zásoby (Grain)", type: "resource", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 3, downstreamCount: 4, playerInfluenceScore: 6, aiDependencyScore: 8, uiSurfacingLevel: 9,
    gaps: [], formula: "rolníci × irrigation_level × ration_policy_mult",
    description: "Potravinový buffer. Spotřeba = pop × 0.006/kolo. Deficit → hladomor → smrt populace.",
    layers: ["core"], dbTable: "realm_resources", writerFn: "process-turn",
  },
  {
    id: "production", label: "⚒️ Produkce", type: "resource", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 4, downstreamCount: 3, playerInfluenceScore: 5, aiDependencyScore: 7, uiSurfacingLevel: 9,
    gaps: [], formula: "base[node_type] × role_mult × (1 − isolation) × workforce_ratio",
    description: "Fyzický výstup uzlů — generován demograficky (rolníci). Akumuluje se v production_reserve.",
    layers: ["core"], dbTable: "realm_resources", writerFn: "compute-economy-flow",
  },
  {
    id: "wealth", label: "💰 Bohatství", type: "resource", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 4, downstreamCount: 3, playerInfluenceScore: 5, aiDependencyScore: 8, uiSurfacingLevel: 9,
    gaps: [], formula: "production_flow × trade_eff[role] + settlement_income + prestige_bonus",
    description: "Obchodní tok — vzniká průchodem produkce přes trasy.",
    layers: ["core"], dbTable: "realm_resources", writerFn: "process-turn",
  },
  {
    id: "capacity", label: "🏛️ Kapacita", type: "resource", status: "full",
    playerFacing: true, usedByAI: false, readOnly: true, agency: "indirect",
    upstreamCount: 3, downstreamCount: 3, playerInfluenceScore: 4, aiDependencyScore: 3, uiSurfacingLevel: 8,
    gaps: [], formula: "Σ(urbanizace sídel) + Σ(infra_uzly × 2) + Σ(klerici × 0.05)",
    description: "Administrativní limit. Určuje max stavebních projektů, tras, provincií.",
    layers: ["core"], dbTable: "realm_resources", writerFn: "compute-economy-flow",
  },
  {
    id: "faith", label: "⛪ Víra", type: "resource", status: "full",
    playerFacing: true, usedByAI: false, readOnly: true, agency: "indirect",
    upstreamCount: 2, downstreamCount: 3, playerInfluenceScore: 3, aiDependencyScore: 2, uiSurfacingLevel: 8,
    gaps: [], formula: "Σ(klerici × 0.01) + Σ(temple_level × 0.5)",
    description: "Duchovní síla. Bonus morálka +0.5%/bod, stabilita +0.2%/bod.",
    layers: ["core"], dbTable: "realm_resources", writerFn: "process-turn",
  },
  {
    id: "prestige", label: "⭐ Prestiž", type: "resource", status: "full",
    playerFacing: true, usedByAI: false, readOnly: true, agency: "indirect",
    upstreamCount: 6, downstreamCount: 2, playerInfluenceScore: 3, aiDependencyScore: 2, uiSurfacingLevel: 9,
    gaps: [], formula: "military + cultural + economic + sport + geopolitical + technological",
    description: "Kompozitní ukazatel — 6 sub-typů. +0.1% wealth/bod.",
    layers: ["core"], dbTable: "realm_resources",
  },
  {
    id: "strategic_resources", label: "⚡ Strategické suroviny", type: "resource", status: "partial",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 1, downstreamCount: 3, playerInfluenceScore: 4, aiDependencyScore: 5, uiSurfacingLevel: 8,
    gaps: ["Threshold unused"], formula: "1 kontrolovaný minor uzel = +1 tier (max 3). 11 typů.",
    description: "Access-based: Železo, Koně, Sůl, Měď, Zlato, Mramor, Drahokamy, Dřevo, Obsidián, Hedvábí, Kadidlo.",
    layers: ["core", "economy_v41"], dbTable: "realm_resources", writerFn: "compute-economy-flow",
  },

  // ══════════════ STATS ══════════════
  {
    id: "population", label: "👥 Populace", type: "stat", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 4, downstreamCount: 5, playerInfluenceScore: 4, aiDependencyScore: 9, uiSurfacingLevel: 10,
    gaps: [], formula: "base_rate(1.2%) × food_surplus × stability × housing_mult",
    description: "4 třídy: Rolníci, Měšťané, Klerici, Válečníci.",
    layers: ["core", "social"],
  },
  {
    id: "workforce", label: "🔧 Pracovní síla", type: "stat", status: "full",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 2, downstreamCount: 1, playerInfluenceScore: 4, aiDependencyScore: 7, uiSurfacingLevel: 8,
    gaps: [], formula: "active_pop − mobilized",
    description: "Efektivní pracovní síla. Over-mobilization >15% → progresivní penalty.",
    layers: ["core", "military"],
  },
  {
    id: "stability", label: "🛡️ Stabilita", type: "stat", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 5, downstreamCount: 4, playerInfluenceScore: 6, aiDependencyScore: 9, uiSurfacingLevel: 9,
    gaps: [], formula: "base(50) ± famine ± overcrowding ± garrison ± faith ± legitimacy",
    description: "Pod 30% hrozí rebelie. Pod 15% téměř jisté.",
    layers: ["core", "social"],
  },
  {
    id: "influence", label: "🌍 Vliv", type: "stat", status: "full",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 7, downstreamCount: 2, playerInfluenceScore: 4, aiDependencyScore: 8, uiSurfacingLevel: 8,
    gaps: [], formula: "military(22%) + trade(18%) + territory(18%) + diplomacy(13%) + reputation(10%) + culture(10%) + laws(9%)",
    description: "Kompozitní skóre pro vítězné podmínky.",
    layers: ["core"],
  },
  {
    id: "tension", label: "⚠️ Tenze", type: "stat", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 3, downstreamCount: 3, playerInfluenceScore: 5, aiDependencyScore: 9, uiSurfacingLevel: 7,
    gaps: [], formula: "border_friction + grievance_score + diplomatic_incidents",
    description: "Prahy 65/88 spouští krize a války.",
    layers: ["core", "social"],
  },

  // ══════════════ SOCIAL DRIVERS ══════════════
  {
    id: "legitimacy", label: "👑 Legitimita", type: "social_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 5, downstreamCount: 3, playerInfluenceScore: 4, aiDependencyScore: 3, uiSurfacingLevel: 6,
    gaps: [],
    formula: "drift = demand_sat(>0.7→+1) − famine(−3) + temple(×0.5) − conquest(−5) + policies",
    description: "Drift per kolo. Downstream: stabilita, rebelie práh, faction loyalty.",
    layers: ["social"], dbTable: "cities", writerFn: "world-tick",
  },
  {
    id: "faction_power", label: "⚖️ Frakce", type: "social_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 3, downstreamCount: 2, playerInfluenceScore: 4, aiDependencyScore: 6, uiSurfacingLevel: 6,
    gaps: [], formula: "population_class_ratio × satisfaction × loyalty",
    description: "Ovlivňuje stabilitu a politické požadavky.",
    layers: ["social"],
  },
  {
    id: "renown", label: "🏅 Věhlas", type: "social_driver", status: "partial",
    playerFacing: true, usedByAI: false, readOnly: true, agency: "none",
    upstreamCount: 2, downstreamCount: 1, playerInfluenceScore: 1, aiDependencyScore: 2, uiSurfacingLevel: 5,
    gaps: ["No player agency"], formula: "medals + hosting_count × 15 + academy_avg × 0.3",
    description: "Přispívá ke cultural_score v Influence.",
    layers: ["social"],
  },
  {
    id: "migration_pressure", label: "🚶 Migrace", type: "social_driver", status: "full",
    playerFacing: true, usedByAI: false, readOnly: true, agency: "indirect",
    upstreamCount: 4, downstreamCount: 2, playerInfluenceScore: 3, aiDependencyScore: 2, uiSurfacingLevel: 4,
    gaps: [],
    formula: "push(famine×10 + overcrowding×20 + instability + epidemic×15) − pull(stability×0.5 + market×3 + housing). >15 → emigrace 1-3%.",
    description: "Tlak na migraci mezi městy. Spouští reálné přesuny obyvatel.",
    layers: ["social"], dbTable: "cities", writerFn: "world-tick",
  },
  {
    id: "labor_allocation", label: "👷 Alokace práce", type: "economic_driver", status: "full",
    playerFacing: true, usedByAI: false, readOnly: false, agency: "direct",
    upstreamCount: 1, downstreamCount: 4, playerInfluenceScore: 7, aiDependencyScore: 0, uiSurfacingLevel: 6,
    gaps: [],
    formula: "farming→food_mod(1+Δ×0.005), crafting→prod_mod(1+Δ×0.008), canal→irrigation(+0.01/%), scribes→social_mobility",
    description: "Hráčem nastavené priority práce. Engine čte v world-tick.",
    layers: ["social", "economy_v41"], dbTable: "cities", writerFn: "UI",
  },

  // ══════════════ MILITARY DRIVERS ══════════════
  {
    id: "mobilization", label: "⚙️ Mobilizace", type: "military_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "direct",
    upstreamCount: 2, downstreamCount: 4, playerInfluenceScore: 9, aiDependencyScore: 8, uiSurfacingLevel: 8,
    gaps: [], formula: "mobilized = active_pop × mobilization_rate",
    description: "Trade-off: víc vojáků = méně pracovníků = nižší produkce.",
    layers: ["military"],
  },
  {
    id: "military_upkeep", label: "🗡️ Vojenská údržba", type: "military_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 1, downstreamCount: 2, playerInfluenceScore: 3, aiDependencyScore: 6, uiSurfacingLevel: 8,
    gaps: [], formula: "gold_upkeep = ⌈manpower/100⌉, food_upkeep = ⌈manpower/500⌉",
    description: "Armáda spotřebovává bohatství a zásoby každé kolo.",
    layers: ["military"],
  },
  {
    id: "morale", label: "💪 Morálka", type: "military_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 4, downstreamCount: 2, playerInfluenceScore: 5, aiDependencyScore: 7, uiSurfacingLevel: 7,
    gaps: [], formula: "base + faith_bonus(+0.5%/bod) + stability_mod + speech",
    description: "Ovlivňuje výsledek bitev.",
    layers: ["military"],
  },
  {
    id: "garrison", label: "🏰 Posádka", type: "military_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "direct",
    upstreamCount: 1, downstreamCount: 2, playerInfluenceScore: 8, aiDependencyScore: 7, uiSurfacingLevel: 7,
    gaps: [], formula: "stationed_units_in_city",
    description: "Přispívá ke stabilitě a obraně města.",
    layers: ["military"],
  },

  // ══════════════ ECONOMIC DRIVERS ══════════════
  {
    id: "node_score", label: "📊 Node Score", type: "hidden_engine_stat", status: "auto",
    playerFacing: false, usedByAI: true, readOnly: true, agency: "none",
    upstreamCount: 6, downstreamCount: 2, playerInfluenceScore: 0, aiDependencyScore: 9, uiSurfacingLevel: 2,
    gaps: ["UI hidden", "No player agency", "AI only"],
    formula: "trade(25%) + food(20%) + strategic(20%) + resources(15%) + religion(10%) + defense(10%)",
    description: "AI rozhodování o expanzi a urbanizaci.",
    layers: ["infrastructure"],
  },
  {
    id: "trade_flow", label: "🔄 Obchodní tok", type: "economic_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 3, downstreamCount: 2, playerInfluenceScore: 4, aiDependencyScore: 7, uiSurfacingLevel: 7,
    gaps: [], formula: "production × route_efficiency × node_role",
    description: "Tok produkce sítí. Hub=1.0, Gateway=0.8, Regulator=0.6.",
    layers: ["infrastructure", "economy_v41"],
  },
  {
    id: "isolation", label: "⛓️ Izolace uzlů", type: "economic_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 2, downstreamCount: 2, playerInfluenceScore: 4, aiDependencyScore: 6, uiSurfacingLevel: 7,
    gaps: [], formula: "A* pathfinding k hlavnímu městu",
    description: "Penalizace produkce izolovaných uzlů.",
    layers: ["infrastructure"],
  },
  {
    id: "ration_policy", label: "🍽️ Příděly", type: "economic_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "direct",
    upstreamCount: 1, downstreamCount: 2, playerInfluenceScore: 8, aiDependencyScore: 5, uiSurfacingLevel: 7,
    gaps: [], formula: "player_choice → grain_consumption_modifier",
    description: "Přímo ovlivňuje spotřebu obilí.",
    layers: ["core"],
  },
  {
    id: "reserves", label: "🏦 Rezervy", type: "economic_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 3, downstreamCount: 2, playerInfluenceScore: 3, aiDependencyScore: 5, uiSurfacingLevel: 8,
    gaps: [], formula: "gold_reserve += wealth_income − army_upkeep − building_costs",
    description: "Pokladna: akumulace bohatství a produkce.",
    layers: ["core"],
  },

  // ══════════════ GOODS PIPELINE (v4.1) ══════════════
  {
    id: "resource_deposits", label: "⛏️ Suroviny hexu", type: "goods_pipeline", status: "full",
    playerFacing: true, usedByAI: false, readOnly: true, agency: "indirect",
    upstreamCount: 0, downstreamCount: 2, playerInfluenceScore: 3, aiDependencyScore: 4, uiSurfacingLevel: 6,
    gaps: [], formula: "hex_tiles.resource_type → province_nodes.capability_tags via backfill-economy-tags",
    description: "Suroviny na hexech. Source pro capability_tags a produkční řetězce.",
    layers: ["economy_v41"], dbTable: "hex_tiles", writerFn: "world-generate-init",
  },
  {
    id: "capability_tags", label: "🏷️ Capability Tags", type: "goods_pipeline", status: "full",
    playerFacing: true, usedByAI: false, readOnly: false, agency: "indirect",
    upstreamCount: 2, downstreamCount: 1, playerInfluenceScore: 4, aiDependencyScore: 3, uiSurfacingLevel: 5,
    gaps: [], formula: "terrain + resource + biome + buildings → tags[]",
    description: "Tagy uzlů matchující production_recipes. Hydratováno backfill-economy-tags.",
    layers: ["economy_v41"], dbTable: "province_nodes", writerFn: "compute-province-nodes",
  },
  {
    id: "production_recipes", label: "📋 Recepty", type: "goods_pipeline", status: "full",
    playerFacing: false, usedByAI: false, readOnly: true, agency: "none",
    upstreamCount: 0, downstreamCount: 1, playerInfluenceScore: 0, aiDependencyScore: 0, uiSurfacingLevel: 3,
    gaps: ["No player agency"], formula: "45 statických receptů: tags[] → good_key + quantity",
    description: "Produkční recepty. Matchují capability_tags uzlů na zboží.",
    layers: ["economy_v41"], dbTable: "production_recipes",
  },
  {
    id: "node_inventory", label: "📦 Node Inventory", type: "goods_pipeline", status: "full",
    playerFacing: true, usedByAI: false, readOnly: true, agency: "indirect",
    upstreamCount: 2, downstreamCount: 2, playerInfluenceScore: 3, aiDependencyScore: 4, uiSurfacingLevel: 7,
    gaps: [], formula: "recipe output per node: good_key × quantity × quality_band",
    description: "Výstup receptů per node. Vstup pro demand matching a trade.",
    layers: ["economy_v41"], dbTable: "node_inventory", writerFn: "compute-economy-flow",
  },
  {
    id: "demand_baskets", label: "🛒 Poptávkové koše", type: "goods_pipeline", status: "full",
    playerFacing: true, usedByAI: false, readOnly: true, agency: "indirect",
    upstreamCount: 1, downstreamCount: 2, playerInfluenceScore: 2, aiDependencyScore: 3, uiSurfacingLevel: 7,
    gaps: [], formula: "per city: staple_food, tools, construction, military, ritual, luxury",
    description: "Koše poptávky per city. Satisfaction 0-1 ovlivňuje trade pressure a stabilitu.",
    layers: ["economy_v41"], dbTable: "demand_baskets", writerFn: "compute-economy-flow",
  },
  {
    id: "trade_flows", label: "🚢 Trade Flows", type: "goods_pipeline", status: "full",
    playerFacing: true, usedByAI: false, readOnly: true, agency: "indirect",
    upstreamCount: 2, downstreamCount: 2, playerInfluenceScore: 3, aiDependencyScore: 4, uiSurfacingLevel: 7,
    gaps: [], formula: "deficit city ← surplus city via routes. Status: latent/trial/active/dominant/blocked",
    description: "Meziměstské toky zboží. Objem, pressure_score, status.",
    layers: ["economy_v41"], dbTable: "trade_flows", writerFn: "compute-economy-flow",
  },
  {
    id: "city_market_summary", label: "🏪 Tržní souhrn", type: "goods_pipeline", status: "full",
    playerFacing: true, usedByAI: false, readOnly: true, agency: "indirect",
    upstreamCount: 2, downstreamCount: 1, playerInfluenceScore: 2, aiDependencyScore: 2, uiSurfacingLevel: 7,
    gaps: [], formula: "per city per good: supply, demand, domestic_share, import_share, price_band",
    description: "Agregovaný přehled trhu per city. UI visualizace.",
    layers: ["economy_v41"], dbTable: "city_market_summary", writerFn: "compute-economy-flow",
  },
  {
    id: "goods_macro", label: "📊 Goods → Macro", type: "goods_pipeline", status: "full",
    playerFacing: false, usedByAI: false, readOnly: true, agency: "none",
    upstreamCount: 3, downstreamCount: 3, playerInfluenceScore: 0, aiDependencyScore: 0, uiSurfacingLevel: 2,
    gaps: ["No player agency", "UI hidden"], formula: "goods_production_value, goods_supply_volume, goods_wealth_fiscal → blend with legacy",
    description: "Projekce goods vrstvy do realm_resources makro agregátů.",
    layers: ["economy_v41"], dbTable: "realm_resources", writerFn: "compute-economy-flow",
  },

  // ══════════════ INFRASTRUCTURE ══════════════
  {
    id: "routes", label: "🛤️ Trasy", type: "hidden_engine_stat", status: "full",
    playerFacing: true, usedByAI: false, readOnly: false, agency: "indirect",
    upstreamCount: 1, downstreamCount: 2, playerInfluenceScore: 5, aiDependencyScore: 3, uiSurfacingLevel: 7,
    gaps: [], formula: "province_routes: node_a ↔ node_b, capacity, safety, damage",
    description: "Síť tras mezi uzly. Dirty flag → auto recompute.",
    layers: ["infrastructure"], dbTable: "province_routes", writerFn: "compute-province-routes",
  },
  {
    id: "hex_flows", label: "🔀 Hex Flows", type: "hidden_engine_stat", status: "auto",
    playerFacing: false, usedByAI: false, readOnly: true, agency: "none",
    upstreamCount: 1, downstreamCount: 1, playerInfluenceScore: 0, aiDependencyScore: 0, uiSurfacingLevel: 3,
    gaps: ["No player agency", "UI hidden"], formula: "A* hex pathfinding per route → flow_paths",
    description: "Kanonické hexové cesty pro vizualizaci a toky.",
    layers: ["infrastructure"], dbTable: "flow_paths", writerFn: "compute-hex-flows",
  },
  {
    id: "irrigation", label: "💧 Zavlažování", type: "hidden_engine_stat", status: "full",
    playerFacing: true, usedByAI: false, readOnly: true, agency: "indirect",
    upstreamCount: 1, downstreamCount: 1, playerInfluenceScore: 4, aiDependencyScore: 0, uiSurfacingLevel: 4,
    gaps: [], formula: "irrigation_level += labor.canal × 0.01 per turn",
    description: "Multiplikátor produkce obilí. Ovlivňován alokací práce (kanály).",
    layers: ["infrastructure", "social"], dbTable: "cities", writerFn: "world-tick",
  },
  {
    id: "dev_level", label: "📈 Development Level", type: "hidden_engine_stat", status: "partial",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 3, downstreamCount: 1, playerInfluenceScore: 3, aiDependencyScore: 5, uiSurfacingLevel: 5,
    gaps: [], formula: "buildings_completed + population_tier + infrastructure",
    description: "Urbanizační milníky. Vizualizován v PopulationPanel.",
    layers: ["infrastructure"],
  },

  // ══════════════ NARRATIVE ══════════════
  {
    id: "chronicles", label: "📜 Kronika", type: "narrative_driver", status: "auto",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "none",
    upstreamCount: 5, downstreamCount: 1, playerInfluenceScore: 2, aiDependencyScore: 6, uiSurfacingLevel: 9,
    gaps: [], formula: "AI generates 800-1200 words from game_events + battles + rumors",
    description: "AI kronikář generuje záznamy z herních dat.",
    layers: ["narrative"],
  },
  {
    id: "wiki", label: "📖 Encyklopedie", type: "narrative_driver", status: "auto",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "none",
    upstreamCount: 4, downstreamCount: 0, playerInfluenceScore: 1, aiDependencyScore: 4, uiSurfacingLevel: 8,
    gaps: ["No downstream"], formula: "auto-created on entity birth, enriched by AI",
    description: "Automaticky generované záznamy. Nemají mechanický dopad.",
    layers: ["narrative"],
  },
  {
    id: "rumors", label: "🗣️ Zvěsti", type: "narrative_driver", status: "partial",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "none",
    upstreamCount: 3, downstreamCount: 1, playerInfluenceScore: 1, aiDependencyScore: 5, uiSurfacingLevel: 7,
    gaps: [], formula: "AI generates from city state + events",
    description: "Zvěsti informují AI a přispívají ke kronice.",
    layers: ["narrative"],
  },
  {
    id: "diplomatic_memory", label: "🧠 Diplomatická paměť", type: "narrative_driver", status: "full",
    playerFacing: false, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 3, downstreamCount: 2, playerInfluenceScore: 6, aiDependencyScore: 9, uiSurfacingLevel: 3,
    gaps: ["UI hidden"], formula: "extracted from pacts + messages + events",
    description: "AI paměť vztahů. Hráč ovlivňuje diplomacií.",
    layers: ["narrative"],
  },

  // ══════════════ HIDDEN ENGINE STATS ══════════════
  {
    id: "disease_level", label: "🦠 Disease Level", type: "hidden_engine_stat", status: "auto",
    playerFacing: false, usedByAI: false, readOnly: true, agency: "none",
    upstreamCount: 2, downstreamCount: 2, playerInfluenceScore: 0, aiDependencyScore: 1, uiSurfacingLevel: 1,
    gaps: ["UI hidden", "No player agency"], formula: "overcrowding × base_rate + famine_boost",
    description: "Spouští epidemie. Automatický engine systém.",
    layers: ["social"],
  },
  {
    id: "vulnerability", label: "🎯 Vulnerability", type: "hidden_engine_stat", status: "auto",
    playerFacing: false, usedByAI: true, readOnly: true, agency: "none",
    upstreamCount: 4, downstreamCount: 1, playerInfluenceScore: 0, aiDependencyScore: 7, uiSurfacingLevel: 0,
    gaps: ["UI hidden", "AI only", "No player agency"],
    formula: "low_stability + low_garrison + famine + isolation",
    description: "AI identifikuje slabá místa pro útok.",
    layers: ["military"],
  },

  // ══════════════ VIRTUAL TARGETS ══════════════
  {
    id: "rebellion", label: "🔥 Rebelie", type: "hidden_engine_stat", status: "full",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 2, downstreamCount: 1, playerInfluenceScore: 4, aiDependencyScore: 5, uiSurfacingLevel: 6,
    gaps: [], formula: "stability < threshold (30 base, −10 if legitimacy<25)",
    description: "Práh rebelie. Legitimita<25 snižuje práh o 10 bodů.",
    layers: ["social"],
  },
];

// ─── EDGE DEFINITIONS ────────────────────────────────────────

export const SYSTEM_EDGES: SystemEdge[] = [
  // ── Grain ──
  { source: "population", target: "grain", linkType: "causal", label: "spotřeba pop×0.006" },
  { source: "grain", target: "population", linkType: "threshold", label: "hladomor → smrt" },
  { source: "grain", target: "stability", linkType: "modifier", label: "deficit → −stabilita" },
  { source: "ration_policy", target: "grain", linkType: "modifier", label: "spotřeba modifier" },
  { source: "military_upkeep", target: "grain", linkType: "causal", label: "−⌈manpower/500⌉/kolo" },

  // ── Production ──
  { source: "workforce", target: "production", linkType: "causal", label: "workforce_ratio" },
  { source: "isolation", target: "production", linkType: "modifier", label: "−izolace %" },
  { source: "capacity", target: "production", linkType: "modifier", label: "limit projektů" },
  { source: "production", target: "trade_flow", linkType: "causal", label: "network flow" },
  { source: "production", target: "reserves", linkType: "causal", label: "akumulace" },
  { source: "strategic_resources", target: "production", linkType: "modifier", label: "tier bonusy" },

  // ── Wealth ──
  { source: "trade_flow", target: "wealth", linkType: "causal", label: "trade efficiency" },
  { source: "production", target: "wealth", linkType: "causal", label: "přímá konverze" },
  { source: "prestige", target: "wealth", linkType: "modifier", label: "+0.1%/bod" },
  { source: "capacity", target: "wealth", linkType: "modifier", label: "limit tras" },
  { source: "wealth", target: "reserves", linkType: "causal", label: "+wealth/kolo" },

  // ── Workforce & Mobilization ──
  { source: "population", target: "workforce", linkType: "causal", label: "active_pop" },
  { source: "mobilization", target: "workforce", linkType: "modifier", label: "−mobilized" },
  { source: "population", target: "mobilization", linkType: "causal", label: "eligible pop" },
  { source: "mobilization", target: "military_upkeep", linkType: "causal", label: "manpower → údržba" },
  { source: "mobilization", target: "garrison", linkType: "causal", label: "stationed units" },

  // ── Military upkeep ──
  { source: "military_upkeep", target: "reserves", linkType: "causal", label: "−gold/kolo" },

  // ── Stability chain ──
  { source: "stability", target: "population", linkType: "threshold", label: "rebelie → smrt" },
  { source: "stability", target: "tension", linkType: "modifier", label: "instability drift" },
  { source: "faction_power", target: "stability", linkType: "modifier", label: "faction unrest" },
  { source: "garrison", target: "stability", linkType: "modifier", label: "security bonus" },
  { source: "faith", target: "stability", linkType: "modifier", label: "+0.2%/bod" },

  // ── Faith ──
  { source: "faith", target: "morale", linkType: "modifier", label: "+0.5%/bod" },
  { source: "faith", target: "prestige", linkType: "causal", label: "+náboženská prestiž" },

  // ── Prestige composition ──
  { source: "mobilization", target: "prestige", linkType: "projection", label: "+vojenská" },
  { source: "wealth", target: "prestige", linkType: "projection", label: "+ekonomická" },
  { source: "renown", target: "prestige", linkType: "projection", label: "+sportovní" },
  { source: "strategic_resources", target: "prestige", linkType: "projection", label: "+technologická" },

  // ── Tension → Crisis ──
  { source: "tension", target: "diplomatic_memory", linkType: "event_driven", label: "crisis events" },
  { source: "tension", target: "morale", linkType: "modifier", label: "war footing" },

  // ── Influence composition ──
  { source: "mobilization", target: "influence", linkType: "projection", label: "military 22%" },
  { source: "trade_flow", target: "influence", linkType: "projection", label: "trade 18%" },
  { source: "renown", target: "influence", linkType: "projection", label: "culture 10%" },
  { source: "stability", target: "influence", linkType: "projection", label: "laws 9%" },

  // ── Morale ──
  { source: "morale", target: "garrison", linkType: "modifier", label: "battle effectiveness" },
  { source: "stability", target: "morale", linkType: "modifier", label: "stability mod" },

  // ── Node score → AI ──
  { source: "node_score", target: "vulnerability", linkType: "projection" },
  { source: "trade_flow", target: "node_score", linkType: "causal", label: "trade potential" },
  { source: "grain", target: "node_score", linkType: "causal", label: "food potential" },
  { source: "strategic_resources", target: "node_score", linkType: "causal", label: "strategic value" },

  // ── Hidden metrics ──
  { source: "population", target: "migration_pressure", linkType: "causal" },
  { source: "grain", target: "migration_pressure", linkType: "modifier", label: "famine push" },
  { source: "population", target: "disease_level", linkType: "causal", label: "overcrowding" },
  { source: "disease_level", target: "population", linkType: "threshold", label: "epidemic deaths" },

  // ── Vulnerability ──
  { source: "stability", target: "vulnerability", linkType: "causal" },
  { source: "garrison", target: "vulnerability", linkType: "modifier", label: "defense" },
  { source: "grain", target: "vulnerability", linkType: "modifier", label: "famine risk" },
  { source: "isolation", target: "vulnerability", linkType: "modifier", label: "cut-off risk" },

  // ── Narrative ──
  { source: "chronicles", target: "wiki", linkType: "causal", label: "enrichment" },
  { source: "rumors", target: "chronicles", linkType: "causal", label: "source material" },
  { source: "diplomatic_memory", target: "tension", linkType: "modifier", label: "grievance" },

  // ── Legitimacy (Phase 4) ──
  { source: "legitimacy", target: "stability", linkType: "modifier", label: "(leg−50)×0.05" },
  { source: "legitimacy", target: "rebellion", linkType: "threshold", label: "leg<25 → práh −10" },
  { source: "legitimacy", target: "faction_power", linkType: "modifier", label: "loyalty drift" },

  // ── Labor allocation (Phase 4) ──
  { source: "labor_allocation", target: "grain", linkType: "modifier", label: "farming_mod" },
  { source: "labor_allocation", target: "production", linkType: "modifier", label: "crafting_mod" },
  { source: "labor_allocation", target: "population", linkType: "causal", label: "social mobility" },
  { source: "labor_allocation", target: "irrigation", linkType: "modifier", label: "canal_mod" },

  // ── Migration (Phase 4) ──
  { source: "migration_pressure", target: "population", linkType: "causal", label: "emigrace/imigrace" },
  { source: "stability", target: "migration_pressure", linkType: "modifier", label: "push/pull" },

  // ── Rebellion target ──
  { source: "stability", target: "rebellion", linkType: "threshold", label: "stability < 30" },
  { source: "rebellion", target: "population", linkType: "event_driven", label: "destruction" },

  // ── Goods Pipeline (v4.1) ──
  { source: "resource_deposits", target: "capability_tags", linkType: "causal", label: "hex→tags" },
  { source: "capability_tags", target: "node_inventory", linkType: "causal", label: "recipe match" },
  { source: "production_recipes", target: "node_inventory", linkType: "causal", label: "recipe def" },
  { source: "node_inventory", target: "demand_baskets", linkType: "causal", label: "supply match" },
  { source: "node_inventory", target: "trade_flows", linkType: "causal", label: "surplus export" },
  { source: "demand_baskets", target: "trade_flows", linkType: "causal", label: "deficit import" },
  { source: "trade_flows", target: "city_market_summary", linkType: "causal", label: "market agg" },
  { source: "node_inventory", target: "city_market_summary", linkType: "causal", label: "domestic" },
  { source: "city_market_summary", target: "goods_macro", linkType: "projection", label: "aggregation" },
  { source: "goods_macro", target: "production", linkType: "modifier", label: "goods_blend" },
  { source: "goods_macro", target: "wealth", linkType: "modifier", label: "fiscal_blend" },
  { source: "goods_macro", target: "grain", linkType: "modifier", label: "supply_blend" },
  { source: "demand_baskets", target: "stability", linkType: "modifier", label: "satisfaction→stability" },
  { source: "demand_baskets", target: "legitimacy", linkType: "modifier", label: "demand_satisfaction" },

  // ── Infrastructure ──
  { source: "routes", target: "hex_flows", linkType: "causal", label: "pathfinding" },
  { source: "routes", target: "trade_flow", linkType: "causal", label: "route capacity" },
  { source: "routes", target: "isolation", linkType: "modifier", label: "connectivity" },
  { source: "hex_flows", target: "trade_flows", linkType: "causal", label: "physical path" },
  { source: "resource_deposits", target: "strategic_resources", linkType: "causal", label: "tier access" },
  { source: "irrigation", target: "grain", linkType: "modifier", label: "food×irrigation" },
];

// ─── STATUS COLORS ────────────────────────────────────────

export const STATUS_COLORS: Record<NodeStatus, { bg: string; border: string; text: string }> = {
  full:     { bg: "#166534", border: "#22c55e", text: "#dcfce7" },
  partial:  { bg: "#854d0e", border: "#eab308", text: "#fef9c3" },
  dead:     { bg: "#991b1b", border: "#ef4444", text: "#fecaca" },
  auto:     { bg: "#1e3a5f", border: "#3b82f6", text: "#dbeafe" },
  readonly: { bg: "#374151", border: "#9ca3af", text: "#f3f4f6" },
  ai_only:  { bg: "#581c87", border: "#a855f7", text: "#f3e8ff" },
};

export const LINK_STYLES: Record<LinkType, { stroke: string; dashArray?: string; label: string }> = {
  causal:       { stroke: "#22c55e", label: "Causal" },
  modifier:     { stroke: "#eab308", dashArray: "5,5", label: "Modifier" },
  threshold:    { stroke: "#ef4444", dashArray: "3,3", label: "Threshold" },
  unlock:       { stroke: "#06b6d4", dashArray: "8,4", label: "Unlock" },
  event_driven: { stroke: "#f97316", dashArray: "2,6", label: "Event" },
  projection:   { stroke: "#a855f7", dashArray: "10,5", label: "Projection" },
};

export const AGENCY_LAYERS = {
  direct:   { label: "Přímý vliv hráče", description: "Hráč má UI akci.", color: "#22c55e" },
  indirect: { label: "Nepřímý vliv", description: "Hráč ovlivňuje prostřednictvím jiných systémů.", color: "#eab308" },
  none:     { label: "Bez vlivu", description: "Čistě automatický engine.", color: "#ef4444" },
};
