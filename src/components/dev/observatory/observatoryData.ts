/**
 * Static system map for Chronicle Observatory.
 * Defines all game mechanics as nodes and their relationships as edges.
 * Purely declarative — no runtime data fetching.
 *
 * UPDATED 2026-03: Reflects unified 6-pillar economy, workforce system,
 * tiered strategic resources, prestige sub-types, capacity limits,
 * faith bonuses, military upkeep, and population growth engine.
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
  // ══════════════ CORE RESOURCES (6 PILLARS) ══════════════

  {
    id: "grain", label: "🌾 Zásoby (Grain)", type: "resource", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 3, downstreamCount: 4, playerInfluenceScore: 6, aiDependencyScore: 8, uiSurfacingLevel: 9,
    gaps: [], formula: "rolníci × irrigation_level × ration_policy_mult",
    description: "Potravinový buffer. Spotřeba = pop × 0.006/kolo. Deficit → hladomor → smrt populace. Záporná bilance vyčerpává grain_reserve.",
  },
  {
    id: "production", label: "⚒️ Produkce", type: "resource", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 4, downstreamCount: 3, playerInfluenceScore: 5, aiDependencyScore: 7, uiSurfacingLevel: 9,
    gaps: [], formula: "base[node_type] × role_mult × (1 − isolation) × workforce_ratio",
    description: "Fyzický výstup uzlů — generován demograficky (rolníci). Base: resource_node=8, village=6, port=5, city=4. Akumuluje se v production_reserve.",
  },
  {
    id: "wealth", label: "💰 Bohatství", type: "resource", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 4, downstreamCount: 3, playerInfluenceScore: 5, aiDependencyScore: 8, uiSurfacingLevel: 9,
    gaps: [], formula: "production_flow × trade_eff[role] + settlement_income + prestige_bonus",
    description: "Obchodní tok — vzniká průchodem produkce přes trasy. Trade eff: hub=1.0, gateway=0.8, regulator=0.6. +0.1% za bod prestiže. Spotřebovává ho vojsko a stavby.",
  },
  {
    id: "capacity", label: "🏛️ Kapacita", type: "resource", status: "full",
    playerFacing: true, usedByAI: false, readOnly: true, agency: "indirect",
    upstreamCount: 3, downstreamCount: 3, playerInfluenceScore: 4, aiDependencyScore: 3, uiSurfacingLevel: 8,
    gaps: [],
    formula: "Σ(urbanizace sídel) + Σ(infra_uzly × 2) + Σ(klerici × 0.05)",
    description: "Administrativní limit. Určuje max stavebních projektů (cap/5), obchodních tras (cap/3), správu provincií (cap/10). HAMLET=1, TOWNSHIP=2, TOWN=3, CITY=5, POLIS=8.",
  },
  {
    id: "faith", label: "⛪ Víra", type: "resource", status: "full",
    playerFacing: true, usedByAI: false, readOnly: true, agency: "indirect",
    upstreamCount: 2, downstreamCount: 3, playerInfluenceScore: 3, aiDependencyScore: 2, uiSurfacingLevel: 8,
    gaps: [],
    formula: "Σ(klerici × 0.01) + Σ(temple_level × 0.5)",
    description: "Duchovní síla. Klerici +0.01/kolo, chrámy +0.5/level/kolo. Bonus morálka vojska +0.5%/bod, stabilita měst +0.2%/bod. Přispívá k náboženské prestiži.",
  },
  {
    id: "prestige", label: "⭐ Prestiž", type: "resource", status: "full",
    playerFacing: true, usedByAI: false, readOnly: true, agency: "indirect",
    upstreamCount: 6, downstreamCount: 2, playerInfluenceScore: 3, aiDependencyScore: 2, uiSurfacingLevel: 9,
    gaps: [],
    formula: "military + cultural + economic + sport + geopolitical + technological",
    description: "Kompozitní ukazatel — 6 sub-typů. Plynulý bonus +0.1% wealth/bod. Milníky 5/20/50/100/200 odemykají tituly a bonusy. Vojenská: vítězství+armáda. Kulturní: divy+polis. Ekonomická: obchod+wealth. Sportovní: olympiáda. Geopolitická: provincie. Technologická: suroviny.",
  },

  // ══════════════ STRATEGIC RESOURCES (11 TYPES) ══════════════

  {
    id: "strategic_resources", label: "⚡ Strategické suroviny", type: "resource", status: "partial",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 1, downstreamCount: 3, playerInfluenceScore: 4, aiDependencyScore: 5, uiSurfacingLevel: 8,
    gaps: ["Threshold unused"],
    formula: "1 kontrolovaný minor uzel = +1 tier (max 3). 11 typů.",
    description: "Access-based model: Železo, Koně, Sůl, Měď, Zlato, Mramor, Drahokamy, Dřevo, Obsidián, Hedvábí, Kadidlo. Tiery odemykají bonusy (T1=základní, T2=pokročilé, T3=dominantní). Skryté pod mlhou dějin — odhalují se průzkumem hexu. Mechanické efekty zatím narativní.",
  },

  // ══════════════ STATS ══════════════

  {
    id: "population", label: "👥 Populace", type: "stat", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 4, downstreamCount: 5, playerInfluenceScore: 4, aiDependencyScore: 9, uiSurfacingLevel: 10,
    gaps: [], formula: "base_rate(1.2%) × food_surplus × stability × housing_mult",
    description: "4 třídy: Rolníci(55%), Měšťané(20%+market), Klerici(10%+temple), Válečníci(garrison). Settlement upgrade: 100→Vesnice, 500→Městečko, 2000→Město, 8000→Velké město, 20000→Polis.",
  },
  {
    id: "workforce", label: "🔧 Pracovní síla", type: "stat", status: "full",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 2, downstreamCount: 1, playerInfluenceScore: 4, aiDependencyScore: 7, uiSurfacingLevel: 8,
    gaps: [],
    formula: "active_pop − mobilized. active_pop = peasants×1.0 + burghers×0.7 + clerics×0.2",
    description: "Efektivní pracovní síla. Snížena mobilizací. Over-mobilization (>15%) progresivně penalizuje produkce uzlů: penalty = (mob−max) × 2, max 80%.",
  },
  {
    id: "stability", label: "🛡️ Stabilita", type: "stat", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 5, downstreamCount: 4, playerInfluenceScore: 6, aiDependencyScore: 9, uiSurfacingLevel: 9,
    gaps: [], formula: "base(50) ± famine(−5%/kolo) ± overcrowding ± garrison ± faith(+0.2%/bod) ± policy",
    description: "Pod 30% hrozí rebelie. Pod 15% téměř jisté. Ovlivňuje růst populace (stability/100 multiplikátor).",
  },
  {
    id: "influence", label: "🌍 Vliv", type: "stat", status: "full",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 7, downstreamCount: 2, playerInfluenceScore: 4, aiDependencyScore: 8, uiSurfacingLevel: 8,
    gaps: [], formula: "military(22%) + trade(18%) + territory(18%) + diplomacy(13%) + reputation(10%) + culture(10%) + laws(9%)",
    description: "Kompozitní skóre z 7 složek. Používá se pro vítězné podmínky.",
  },
  {
    id: "tension", label: "⚠️ Tenze", type: "stat", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 3, downstreamCount: 3, playerInfluenceScore: 5, aiDependencyScore: 9, uiSurfacingLevel: 7,
    gaps: [], formula: "border_friction + grievance_score + diplomatic_incidents",
    description: "Termostat diplomatických krizí. Prahy 65/88 spouští krize a války.",
  },

  // ══════════════ SOCIAL DRIVERS ══════════════

  {
    id: "legitimacy", label: "👑 Legitimita", type: "social_driver", status: "readonly",
    playerFacing: true, usedByAI: false, readOnly: true, agency: "none",
    upstreamCount: 2, downstreamCount: 0, playerInfluenceScore: 0, aiDependencyScore: 1, uiSurfacingLevel: 4,
    gaps: ["Dead metric", "No player agency", "No downstream"],
    formula: "base + policy_effects + stability_drift",
    description: "Zobrazuje se v UI, ale nemá žádný mechanický dopad. Kandidát na propojení se stabilitou.",
  },
  {
    id: "renown", label: "🏅 Věhlas", type: "social_driver", status: "partial",
    playerFacing: true, usedByAI: false, readOnly: true, agency: "none",
    upstreamCount: 2, downstreamCount: 1, playerInfluenceScore: 1, aiDependencyScore: 2, uiSurfacingLevel: 5,
    gaps: ["No player agency"],
    formula: "medals + hosting_count × 15 + academy_avg × 0.3",
    description: "Přispívá ke cultural_score v Influence, ale hráč nemůže přímo ovlivnit.",
  },
  {
    id: "faction_power", label: "⚖️ Frakce", type: "social_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 3, downstreamCount: 2, playerInfluenceScore: 4, aiDependencyScore: 6, uiSurfacingLevel: 6,
    gaps: [], formula: "population_class_ratio × satisfaction × loyalty",
    description: "Ovlivňuje stabilitu a politické požadavky frakcí ve městech.",
  },

  // ══════════════ MILITARY DRIVERS ══════════════

  {
    id: "mobilization", label: "⚙️ Mobilizace", type: "military_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "direct",
    upstreamCount: 2, downstreamCount: 4, playerInfluenceScore: 9, aiDependencyScore: 8, uiSurfacingLevel: 8,
    gaps: [], formula: "mobilized = active_pop × mobilization_rate",
    description: "Trade-off: víc vojáků = méně pracovníků = nižší produkce. Over-mob >15% → progresivní penalty.",
  },
  {
    id: "military_upkeep", label: "🗡️ Vojenská údržba", type: "military_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 1, downstreamCount: 2, playerInfluenceScore: 3, aiDependencyScore: 6, uiSurfacingLevel: 8,
    gaps: [],
    formula: "gold_upkeep = ⌈manpower/100⌉, food_upkeep = ⌈manpower/500⌉",
    description: "Armáda spotřebovává bohatství a zásoby každé kolo. Vizualizováno v Economy Tab per-stack.",
  },
  {
    id: "morale", label: "💪 Morálka", type: "military_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "indirect",
    upstreamCount: 4, downstreamCount: 2, playerInfluenceScore: 5, aiDependencyScore: 7, uiSurfacingLevel: 7,
    gaps: [], formula: "base + faith_bonus(+0.5%/bod) + stability_mod + speech_modifier",
    description: "Ovlivňuje výsledek bitev. Hráč může ovlivnit řečí před bitvou a vírou.",
  },
  {
    id: "garrison", label: "🏰 Posádka", type: "military_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "direct",
    upstreamCount: 1, downstreamCount: 2, playerInfluenceScore: 8, aiDependencyScore: 7, uiSurfacingLevel: 7,
    gaps: [], formula: "stationed_units_in_city",
    description: "Přispívá ke stabilitě a obraně města.",
  },

  // ══════════════ ECONOMIC DRIVERS ══════════════

  {
    id: "node_score", label: "📊 Node Score", type: "hidden_engine_stat", status: "auto",
    playerFacing: false, usedByAI: true, readOnly: true, agency: "none",
    upstreamCount: 6, downstreamCount: 2, playerInfluenceScore: 0, aiDependencyScore: 9, uiSurfacingLevel: 2,
    gaps: ["UI hidden", "No player agency", "AI only"],
    formula: "trade(25%) + food(20%) + strategic(20%) + resources(15%) + religion(10%) + defense(10%)",
    description: "AI používá k rozhodování o expanzi a urbanizaci. Hráč nevidí.",
  },
  {
    id: "trade_flow", label: "🔄 Obchodní tok", type: "economic_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 3, downstreamCount: 2, playerInfluenceScore: 4, aiDependencyScore: 7, uiSurfacingLevel: 7,
    gaps: [], formula: "production × route_efficiency × node_role",
    description: "Tok produkce sítí. Hub=1.0, Gateway=0.8, Regulator=0.6, Producer=0.3. Hráč ovlivňuje stavbou infrastruktury.",
  },
  {
    id: "isolation", label: "⛓️ Izolace uzlů", type: "economic_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 2, downstreamCount: 2, playerInfluenceScore: 4, aiDependencyScore: 6, uiSurfacingLevel: 7,
    gaps: [],
    formula: "A* pathfinding k hlavnímu městu. Nenalezená cesta = 100% izolace",
    description: "Penalizace produkce izolovaných uzlů. <15% mírná, 15-35% částečná, 35-55% těžká, >55% odříznuto.",
  },
  {
    id: "labor_allocation", label: "👷 Alokace práce", type: "economic_driver", status: "dead",
    playerFacing: true, usedByAI: false, readOnly: false, agency: "direct",
    upstreamCount: 1, downstreamCount: 0, playerInfluenceScore: 2, aiDependencyScore: 0, uiSurfacingLevel: 6,
    gaps: ["Dead metric", "No downstream"],
    formula: "player_set_priorities → cities.labor_allocation (IGNORED by process-turn)",
    description: "Hráč může měnit, ale engine priority ignoruje. FAKE MECHANIKA.",
  },
  {
    id: "ration_policy", label: "🍽️ Příděly", type: "economic_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: false, agency: "direct",
    upstreamCount: 1, downstreamCount: 2, playerInfluenceScore: 8, aiDependencyScore: 5, uiSurfacingLevel: 7,
    gaps: [], formula: "player_choice → grain_consumption_modifier",
    description: "Přímo ovlivňuje spotřebu obilí a riziko hladomoru.",
  },
  {
    id: "reserves", label: "🏦 Rezervy", type: "economic_driver", status: "full",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 3, downstreamCount: 2, playerInfluenceScore: 3, aiDependencyScore: 5, uiSurfacingLevel: 8,
    gaps: [],
    formula: "gold_reserve += wealth_income − army_upkeep − building_costs; production_reserve += production",
    description: "Pokladna: akumulace bohatství a produkce. Spotřebovává se na stavby, armádu, diplomacii.",
  },

  // ══════════════ NARRATIVE DRIVERS ══════════════

  {
    id: "chronicles", label: "📜 Kronika", type: "narrative_driver", status: "auto",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "none",
    upstreamCount: 5, downstreamCount: 1, playerInfluenceScore: 2, aiDependencyScore: 6, uiSurfacingLevel: 9,
    gaps: [], formula: "AI generates 800-1200 words from game_events + battles + rumors",
    description: "AI kronikář generuje záznamy z herních dat. Přispívá k wiki.",
  },
  {
    id: "wiki", label: "📖 Encyklopedie", type: "narrative_driver", status: "auto",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "none",
    upstreamCount: 4, downstreamCount: 0, playerInfluenceScore: 1, aiDependencyScore: 4, uiSurfacingLevel: 8,
    gaps: ["No downstream"],
    formula: "auto-created on entity birth, enriched by AI",
    description: "Automaticky generované záznamy. Nemají mechanický dopad.",
  },
  {
    id: "rumors", label: "🗣️ Zvěsti", type: "narrative_driver", status: "partial",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "none",
    upstreamCount: 3, downstreamCount: 1, playerInfluenceScore: 1, aiDependencyScore: 5, uiSurfacingLevel: 7,
    gaps: [], formula: "AI generates from city state + events + world_events",
    description: "Zvěsti informují AI rozhodování a přispívají ke kronice.",
  },
  {
    id: "diplomatic_memory", label: "🧠 Diplomatická paměť", type: "narrative_driver", status: "full",
    playerFacing: false, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 3, downstreamCount: 2, playerInfluenceScore: 6, aiDependencyScore: 9, uiSurfacingLevel: 3,
    gaps: ["UI hidden"],
    formula: "extracted from pacts + messages + events → memory entries",
    description: "AI paměť vztahů. Hráč ovlivňuje svými diplomatickými akcemi.",
  },

  // ══════════════ HIDDEN ENGINE STATS ══════════════

  {
    id: "dev_level", label: "📈 Development Level", type: "hidden_engine_stat", status: "partial",
    playerFacing: true, usedByAI: true, readOnly: true, agency: "indirect",
    upstreamCount: 3, downstreamCount: 1, playerInfluenceScore: 3, aiDependencyScore: 5, uiSurfacingLevel: 5,
    gaps: [],
    formula: "buildings_completed + population_tier + infrastructure",
    description: "Ovlivňuje urbanizační milníky. Nyní vizualizován v PopulationPanel s progress bary.",
  },
  {
    id: "migration_pressure", label: "🚶 Migration Pressure", type: "hidden_engine_stat", status: "auto",
    playerFacing: false, usedByAI: false, readOnly: true, agency: "none",
    upstreamCount: 3, downstreamCount: 1, playerInfluenceScore: 0, aiDependencyScore: 2, uiSurfacingLevel: 1,
    gaps: ["UI hidden", "No player agency"],
    formula: "overcrowding × famine_severity × (1 - stability)",
    description: "Automaticky počítaný tlak na migraci. Hráč nevidí ani neovlivní.",
  },
  {
    id: "disease_level", label: "🦠 Disease Level", type: "hidden_engine_stat", status: "auto",
    playerFacing: false, usedByAI: false, readOnly: true, agency: "none",
    upstreamCount: 2, downstreamCount: 2, playerInfluenceScore: 0, aiDependencyScore: 1, uiSurfacingLevel: 1,
    gaps: ["UI hidden", "No player agency"],
    formula: "overcrowding × base_rate + famine_boost",
    description: "Spouští epidemie. Automatický engine systém.",
  },
  {
    id: "vulnerability", label: "🎯 Vulnerability", type: "hidden_engine_stat", status: "auto",
    playerFacing: false, usedByAI: true, readOnly: true, agency: "none",
    upstreamCount: 4, downstreamCount: 1, playerInfluenceScore: 0, aiDependencyScore: 7, uiSurfacingLevel: 0,
    gaps: ["UI hidden", "AI only", "No player agency"],
    formula: "low_stability + low_garrison + famine + isolation",
    description: "AI používá k identifikaci slabých míst pro útok.",
  },
];

// ─── EDGE DEFINITIONS ────────────────────────────────────────

export const SYSTEM_EDGES: SystemEdge[] = [
  // ── Grain (Zásoby) ──
  { source: "population", target: "grain", linkType: "causal", label: "spotřeba pop×0.006" },
  { source: "grain", target: "population", linkType: "threshold", label: "hladomor → smrt" },
  { source: "grain", target: "stability", linkType: "modifier", label: "deficit → −stabilita" },
  { source: "ration_policy", target: "grain", linkType: "modifier", label: "spotřeba modifier" },
  { source: "military_upkeep", target: "grain", linkType: "causal", label: "−⌈manpower/500⌉/kolo" },

  // ── Production ──
  { source: "workforce", target: "production", linkType: "causal", label: "workforce_ratio multiplikátor" },
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

  // ── Capacity sources ──
  // (capacity is computed from urbanization + infra + clerics, implicit)

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

  // ── Dead ends (explicit) ──
  { source: "labor_allocation", target: "labor_allocation", linkType: "projection", label: "IGNORED" },
  { source: "legitimacy", target: "legitimacy", linkType: "projection", label: "NO OUTPUT" },
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
    description: "Hráč ovlivňuje prostřednictvím jiných systémů.",
    color: "#eab308",
  },
  none: {
    label: "Bez vlivu",
    description: "Hráč nemá žádný vliv. Čistě automatický engine.",
    color: "#ef4444",
  },
};
