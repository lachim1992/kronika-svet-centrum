/**
 * Static system map for Chronicle Observatory.
 * Defines all game mechanics as nodes and their relationships as edges.
 * Purely declarative — no runtime data fetching.
 */

export type SystemNodeType =
  | "resource"
  | "stat"
  | "social_driver"
  | "military_driver"
  | "economic_driver"
  | "narrative_driver"
  | "hidden_engine_stat";

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
}

export interface SystemEdge {
  source: string;
  target: string;
  linkType: LinkType;
  label?: string;
}

// ─── NODE DEFINITIONS ────────────────────────────────────────

export const SYSTEM_NODES: SystemNode[] = [
  // ── RESOURCES ──
  {
    id: "grain", label: "Grain (Obilí)", type: "resource", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 3, downstreamCount: 4, playerInfluenceScore: 6, aiDependencyScore: 8, uiSurfacingLevel: 9,
    gaps: [], formula: "peasants × 0.03 × irrigation_mod × ration_policy",
    description: "Jediná surovina se spotřebou. Buffer pro populaci. Hladomor při deficitu.",
  },
  {
    id: "production", label: "Production (Produkce)", type: "resource", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 2, downstreamCount: 3, playerInfluenceScore: 5, aiDependencyScore: 7, uiSurfacingLevel: 8,
    gaps: [], formula: "peasants × base_rate + building_bonuses",
    description: "Akumuluje se v production_reserve. Slouží ke stavbě a údržbě vojska.",
  },
  {
    id: "wealth", label: "Wealth (Bohatství)", type: "resource", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 3, downstreamCount: 3, playerInfluenceScore: 5, aiDependencyScore: 8, uiSurfacingLevel: 9,
    gaps: [], formula: "production_flow × route_efficiency × node_role_modifier",
    description: "Vzniká průchodem produkce přes obchodní trasy. Klíčová pro armádu a budovy.",
  },
  {
    id: "capacity", label: "Capacity (Kapacita)", type: "resource", status: "dead",
    playerFacing: true, usedByAI: false, readOnly: true, agency: "none",
    upstreamCount: 2, downstreamCount: 0, playerInfluenceScore: 0, aiDependencyScore: 0, uiSurfacingLevel: 5,
    gaps: ["Dead metric", "No downstream", "No player agency"],
    formula: "burghers × rate + clerics × rate",
    description: "Počítá se, ale nikde se neutrácí. Žádný mechanický dopad.",
  },
  {
    id: "faith", label: "Faith (Víra)", type: "resource", status: "partial",
    playerFacing: true, usedByAI: false, readOnly: true, agency: "none",
    upstreamCount: 2, downstreamCount: 1, playerInfluenceScore: 1, aiDependencyScore: 2, uiSurfacingLevel: 5,
    gaps: ["No player agency", "Threshold unused"],
    formula: "clerics × rate + warriors × rate + temple_level_bonus",
    description: "Chybí prahové efekty (zázraky). Pouze přispívá k morálce.",
  },
  {
    id: "iron", label: "Iron (Železo)", type: "resource", status: "partial",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 1, downstreamCount: 1, playerInfluenceScore: 3, aiDependencyScore: 4, uiSurfacingLevel: 6,
    gaps: ["Threshold unused"],
    formula: "hex.special_resource === 'iron' ? tier_output : 0",
    description: "Strategická surovina. Odemyká elitní jednotky (zatím jen narativně).",
  },
  {
    id: "horses", label: "Horses (Koně)", type: "resource", status: "partial",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 1, downstreamCount: 1, playerInfluenceScore: 3, aiDependencyScore: 4, uiSurfacingLevel: 6,
    gaps: ["Threshold unused"],
    formula: "hex.special_resource === 'horses' ? tier_output : 0",
    description: "Strategická surovina. Odemyká jízdu (zatím jen narativně).",
  },

  // ── STATS ──
  {
    id: "population", label: "Population (Populace)", type: "stat", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 3, downstreamCount: 5, playerInfluenceScore: 4, aiDependencyScore: 9, uiSurfacingLevel: 10,
    gaps: [], formula: "birth_rate × pop - death_rate × pop ± migration ± famine_deaths",
    description: "Motor spotřeby i produkce. Hlavní páka simulace.",
  },
  {
    id: "stability", label: "Stability (Stabilita)", type: "stat", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 5, downstreamCount: 4, playerInfluenceScore: 6, aiDependencyScore: 9, uiSurfacingLevel: 9,
    gaps: [], formula: "base ± famine_penalty ± overcrowding ± garrison ± policy_effects",
    description: "Regulátor driftu a rebelií. Pod 30% hrozí povstání.",
  },
  {
    id: "influence", label: "Influence (Vliv)", type: "stat", status: "full",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 7, downstreamCount: 2, playerInfluenceScore: 4, aiDependencyScore: 8, uiSurfacingLevel: 8,
    gaps: [], formula: "military(22%) + trade(18%) + territory(18%) + diplomacy(13%) + reputation(10%) + culture(10%) + laws(9%)",
    description: "Kompozitní skóre z 7 složek. Používá se pro vítězné podmínky.",
  },
  {
    id: "tension", label: "Tension (Tenze)", type: "stat", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 3, downstreamCount: 3, playerInfluenceScore: 5, aiDependencyScore: 9, uiSurfacingLevel: 7,
    gaps: [], formula: "border_friction + grievance_score + diplomatic_incidents",
    description: "Termostat diplomatických krizí. Prahy 65/88 spouští krize a války.",
  },

  // ── SOCIAL DRIVERS ──
  {
    id: "legitimacy", label: "Legitimacy (Legitimita)", type: "social_driver", status: "readonly",
    playerFacing: true, usedByAI: false, readOnly: true, agency: "none",
    upstreamCount: 2, downstreamCount: 0, playerInfluenceScore: 0, aiDependencyScore: 1, uiSurfacingLevel: 4,
    gaps: ["Dead metric", "No player agency", "No downstream"],
    formula: "base + policy_effects + stability_drift",
    description: "Zobrazuje se v UI, ale nemá žádný mechanický dopad.",
  },
  {
    id: "prestige", label: "Prestige (Prestiž)", type: "social_driver", status: "readonly",
    playerFacing: true, usedByAI: false, readOnly: true, agency: "none",
    upstreamCount: 1, downstreamCount: 0, playerInfluenceScore: 0, aiDependencyScore: 1, uiSurfacingLevel: 4,
    gaps: ["Dead metric", "No player agency", "No downstream"],
    formula: "wonders_built + great_persons + victories",
    description: "Zobrazuje se v UI, ale nemá žádný mechanický dopad.",
  },
  {
    id: "renown", label: "Renown (Věhlas)", type: "social_driver", status: "partial",
    playerFacing: true, usedByAI: false, readOnly: true, agency: "none",
    upstreamCount: 2, downstreamCount: 1, playerInfluenceScore: 1, aiDependencyScore: 2, uiSurfacingLevel: 5,
    gaps: ["No player agency"],
    formula: "medals + hosting_count × 15 + academy_avg × 0.3",
    description: "Přispívá ke cultural_score v Influence, ale hráč nemůže přímo ovlivnit.",
  },
  {
    id: "faction_power", label: "Faction Power", type: "social_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 3, downstreamCount: 2, playerInfluenceScore: 4, aiDependencyScore: 6, uiSurfacingLevel: 6,
    gaps: [], formula: "population_class_ratio × satisfaction × loyalty",
    description: "Ovlivňuje stabilitu a politické požadavky frakcí ve městech.",
  },

  // ── MILITARY DRIVERS ──
  {
    id: "mobilization", label: "Mobilization (Mobilizace)", type: "military_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "direct",
    upstreamCount: 2, downstreamCount: 3, playerInfluenceScore: 9, aiDependencyScore: 8, uiSurfacingLevel: 8,
    gaps: [], formula: "recruited_warriors / eligible_population",
    description: "Trade-off produkce vs. manpower. Hráč přímo rekrutuje jednotky.",
  },
  {
    id: "morale", label: "Morale (Morálka)", type: "military_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 4, downstreamCount: 2, playerInfluenceScore: 5, aiDependencyScore: 7, uiSurfacingLevel: 7,
    gaps: [], formula: "base + faith_bonus + stability_mod + speech_modifier",
    description: "Ovlivňuje výsledek bitev. Hráč může ovlivnit řečí před bitvou.",
  },
  {
    id: "garrison", label: "Garrison (Posádka)", type: "military_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "direct",
    upstreamCount: 1, downstreamCount: 2, playerInfluenceScore: 8, aiDependencyScore: 7, uiSurfacingLevel: 7,
    gaps: [], formula: "stationed_units_in_city",
    description: "Přispívá ke stabilitě a obraně města.",
  },

  // ── ECONOMIC DRIVERS ──
  {
    id: "node_score", label: "Node Score", type: "hidden_engine_stat", status: "auto",
    playerFacing: false, usedByAI: true, readOnly: true, agency: "none",
    upstreamCount: 6, downstreamCount: 2, playerInfluenceScore: 0, aiDependencyScore: 9, uiSurfacingLevel: 2,
    gaps: ["UI hidden", "No player agency", "AI only"],
    formula: "trade(25%) + food(20%) + strategic(20%) + resources(15%) + religion(10%) + defense(10%)",
    description: "AI používá k rozhodování o expanzi a urbanizaci. Hráč nevidí.",
  },
  {
    id: "trade_flow", label: "Trade Flow", type: "economic_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 3, downstreamCount: 2, playerInfluenceScore: 4, aiDependencyScore: 7, uiSurfacingLevel: 6,
    gaps: [], formula: "production × route_efficiency × node_role",
    description: "Tok produkce sítí. Hráč ovlivňuje stavbou infrastruktury.",
  },
  {
    id: "labor_allocation", label: "Labor Allocation", type: "economic_driver", status: "dead",
    playerFacing: true, usedByAI: false, readOnly: false, agency: "direct",
    upstreamCount: 1, downstreamCount: 0, playerInfluenceScore: 2, aiDependencyScore: 0, uiSurfacingLevel: 6,
    gaps: ["Dead metric", "No downstream"],
    formula: "player_set_priorities → cities.labor_allocation (IGNORED by process-turn)",
    description: "Hráč může měnit, ale engine priority ignoruje. FAKE MECHANIKA.",
  },
  {
    id: "ration_policy", label: "Ration Policy", type: "economic_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "direct",
    upstreamCount: 1, downstreamCount: 2, playerInfluenceScore: 8, aiDependencyScore: 5, uiSurfacingLevel: 7,
    gaps: [], formula: "player_choice → grain_consumption_modifier",
    description: "Přímo ovlivňuje spotřebu obilí a riziko hladomoru.",
  },

  // ── NARRATIVE DRIVERS ──
  {
    id: "chronicles", label: "Chronicles (Kronika)", type: "narrative_driver", status: "auto",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "none",
    upstreamCount: 5, downstreamCount: 1, playerInfluenceScore: 2, aiDependencyScore: 6, uiSurfacingLevel: 9,
    gaps: [], formula: "AI generates 800-1200 words from game_events + battles + rumors",
    description: "AI kronikář generuje záznamy z herních dat. Přispívá k wiki.",
  },
  {
    id: "wiki", label: "Wiki (Encyklopedie)", type: "narrative_driver", status: "auto",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "none",
    upstreamCount: 4, downstreamCount: 0, playerInfluenceScore: 1, aiDependencyScore: 4, uiSurfacingLevel: 8,
    gaps: ["No downstream"],
    formula: "auto-created on entity birth, enriched by AI",
    description: "Automaticky generované záznamy. Nemají mechanický dopad.",
  },
  {
    id: "rumors", label: "Rumors (Zvěsti)", type: "narrative_driver", status: "partial",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "none",
    upstreamCount: 3, downstreamCount: 1, playerInfluenceScore: 1, aiDependencyScore: 5, uiSurfacingLevel: 7,
    gaps: [], formula: "AI generates from city state + events + world_events",
    description: "Zvěsti informují AI rozhodování a přispívají ke kronice.",
  },
  {
    id: "diplomatic_memory", label: "Diplomatic Memory", type: "narrative_driver", status: "full",
    playerFacing: false, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 3, downstreamCount: 2, playerInfluenceScore: 6, aiDependencyScore: 9, uiSurfacingLevel: 3,
    gaps: ["UI hidden"],
    formula: "extracted from pacts + messages + events → memory entries",
    description: "AI paměť vztahů. Hráč ovlivňuje svými diplomatickými akcemi.",
  },

  // ── HIDDEN ENGINE STATS ──
  {
    id: "dev_level", label: "Development Level", type: "hidden_engine_stat", status: "partial",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 3, downstreamCount: 1, playerInfluenceScore: 3, aiDependencyScore: 5, uiSurfacingLevel: 5,
    gaps: [],
    formula: "buildings_completed + population_tier + infrastructure",
    description: "Ovlivňuje urbanizační milníky. UI chybí indikátor postupu.",
  },
  {
    id: "migration_pressure", label: "Migration Pressure", type: "hidden_engine_stat", status: "auto",
    playerFacing: false, usedByAI: false, readOnly: true, agency: "none",
    upstreamCount: 3, downstreamCount: 1, playerInfluenceScore: 0, aiDependencyScore: 2, uiSurfacingLevel: 1,
    gaps: ["UI hidden", "No player agency"],
    formula: "overcrowding × famine_severity × (1 - stability)",
    description: "Automaticky počítaný tlak na migraci. Hráč nevidí ani neovlivní.",
  },
  {
    id: "disease_level", label: "Disease Level", type: "hidden_engine_stat", status: "auto",
    playerFacing: false, usedByAI: false, readOnly: true, agency: "none",
    upstreamCount: 2, downstreamCount: 2, playerInfluenceScore: 0, aiDependencyScore: 1, uiSurfacingLevel: 1,
    gaps: ["UI hidden", "No player agency"],
    formula: "overcrowding × base_rate + famine_boost",
    description: "Spouští epidemie. Automatický engine systém.",
  },
  {
    id: "vulnerability", label: "Vulnerability Score", type: "hidden_engine_stat", status: "auto",
    playerFacing: false, usedByAI: true, readOnly: true, agency: "none",
    upstreamCount: 4, downstreamCount: 1, playerInfluenceScore: 0, aiDependencyScore: 7, uiSurfacingLevel: 0,
    gaps: ["UI hidden", "AI only", "No player agency"],
    formula: "low_stability + low_garrison + famine + isolation",
    description: "AI používá k identifikaci slabých míst pro útok.",
  },
];

// ─── EDGE DEFINITIONS ────────────────────────────────────────

export const SYSTEM_EDGES: SystemEdge[] = [
  // Grain connections
  { source: "population", target: "grain", linkType: "causal", label: "consumption" },
  { source: "grain", target: "population", linkType: "threshold", label: "famine → death" },
  { source: "grain", target: "stability", linkType: "modifier", label: "famine penalty" },
  { source: "ration_policy", target: "grain", linkType: "modifier", label: "consumption rate" },

  // Production flow
  { source: "population", target: "production", linkType: "causal", label: "labor" },
  { source: "production", target: "trade_flow", linkType: "causal", label: "network flow" },
  { source: "trade_flow", target: "wealth", linkType: "causal", label: "route efficiency" },
  { source: "production", target: "wealth", linkType: "causal", label: "direct conversion" },

  // Mobilization
  { source: "population", target: "mobilization", linkType: "causal", label: "eligible pop" },
  { source: "mobilization", target: "production", linkType: "modifier", label: "labor drain" },
  { source: "mobilization", target: "garrison", linkType: "causal", label: "stationed units" },
  { source: "garrison", target: "stability", linkType: "modifier", label: "security bonus" },

  // Stability chain
  { source: "stability", target: "population", linkType: "threshold", label: "rebellion → deaths" },
  { source: "stability", target: "tension", linkType: "modifier", label: "instability drift" },
  { source: "faction_power", target: "stability", linkType: "modifier", label: "faction unrest" },

  // Tension → Crisis
  { source: "tension", target: "diplomatic_memory", linkType: "event_driven", label: "crisis events" },
  { source: "tension", target: "morale", linkType: "modifier", label: "war footing" },

  // Influence composition
  { source: "mobilization", target: "influence", linkType: "projection", label: "military 22%" },
  { source: "trade_flow", target: "influence", linkType: "projection", label: "trade 18%" },
  { source: "renown", target: "influence", linkType: "projection", label: "culture 10%" },
  { source: "stability", target: "influence", linkType: "projection", label: "laws 9%" },

  // Faith
  { source: "faith", target: "morale", linkType: "modifier", label: "faith bonus" },

  // Morale
  { source: "morale", target: "garrison", linkType: "modifier", label: "battle effectiveness" },
  { source: "stability", target: "morale", linkType: "modifier", label: "stability mod" },

  // Node score → AI
  { source: "node_score", target: "vulnerability", linkType: "projection" },
  { source: "trade_flow", target: "node_score", linkType: "causal", label: "trade potential" },
  { source: "grain", target: "node_score", linkType: "causal", label: "food potential" },
  { source: "iron", target: "node_score", linkType: "causal", label: "strategic value" },
  { source: "horses", target: "node_score", linkType: "causal", label: "strategic value" },

  // Hidden metrics
  { source: "population", target: "migration_pressure", linkType: "causal" },
  { source: "grain", target: "migration_pressure", linkType: "modifier", label: "famine push" },
  { source: "population", target: "disease_level", linkType: "causal", label: "overcrowding" },
  { source: "disease_level", target: "population", linkType: "threshold", label: "epidemic deaths" },

  // Vulnerability
  { source: "stability", target: "vulnerability", linkType: "causal" },
  { source: "garrison", target: "vulnerability", linkType: "modifier", label: "defense" },
  { source: "grain", target: "vulnerability", linkType: "modifier", label: "famine risk" },

  // Narrative
  { source: "chronicles", target: "wiki", linkType: "causal", label: "enrichment" },
  { source: "rumors", target: "chronicles", linkType: "causal", label: "source material" },
  { source: "diplomatic_memory", target: "tension", linkType: "modifier", label: "grievance" },

  // Dead ends — explicitly shown
  { source: "capacity", target: "capacity", linkType: "projection", label: "NO OUTPUT" },
  { source: "labor_allocation", target: "labor_allocation", linkType: "projection", label: "IGNORED" },
  { source: "legitimacy", target: "legitimacy", linkType: "projection", label: "NO OUTPUT" },
  { source: "prestige", target: "prestige", linkType: "projection", label: "NO OUTPUT" },
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

// ─── AGENCY CATEGORIES ────────────────────────────────────────

export const AGENCY_LAYERS = {
  direct: {
    label: "Přímý vliv hráče",
    description: "Hráč má UI akci, která přímo mění hodnotu.",
    color: "#22c55e",
  },
  indirect: {
    label: "Nepřímý vliv",
    description: "Hráč ovlivňuje skrze jiné systémy (stavby, diplomacie, válka).",
    color: "#eab308",
  },
  none: {
    label: "Žádný vliv",
    description: "Automatický engine nebo AI-only systém. Hráč nemůže ovlivnit.",
    color: "#ef4444",
  },
} as const;
