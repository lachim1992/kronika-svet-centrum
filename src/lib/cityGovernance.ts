// City Governance constants & helpers

// ═══════════════════════════════════════════
// DISTRICT TYPES
// ═══════════════════════════════════════════
export const DISTRICT_TYPES: Record<string, {
  label: string;
  icon: string;
  description: string;
  population_capacity: number;
  grain_modifier: number;
  wealth_modifier: number;
  production_modifier: number;
  stability_modifier: number;
  influence_modifier: number;
  peasant_attraction: number;
  burgher_attraction: number;
  cleric_attraction: number;
  military_attraction: number;
  build_cost_wealth: number;
  build_cost_wood: number;
  build_cost_stone: number;
  build_turns: number;
}> = {
  residential: {
    label: "Obytná čtvrť",
    icon: "🏘️",
    description: "Základní obytná oblast pro nové obyvatele.",
    population_capacity: 300,
    grain_modifier: -5, wealth_modifier: 2, production_modifier: 0,
    stability_modifier: 5, influence_modifier: 0,
    peasant_attraction: 3, burgher_attraction: 1, cleric_attraction: 0, military_attraction: 0,
    build_cost_wealth: 30, build_cost_wood: 25, build_cost_stone: 10, build_turns: 2,
  },
  artisan: {
    label: "Řemeslnická čtvrť",
    icon: "⚒️",
    description: "Dílny a manufaktury. Zvyšuje produkci a přitahuje měšťany.",
    population_capacity: 200,
    grain_modifier: -3, wealth_modifier: 8, production_modifier: 5,
    stability_modifier: 0, influence_modifier: 1,
    peasant_attraction: -1, burgher_attraction: 5, cleric_attraction: 0, military_attraction: 0,
    build_cost_wealth: 50, build_cost_wood: 30, build_cost_stone: 20, build_turns: 3,
  },
  temple: {
    label: "Chrámová čtvrť",
    icon: "⛪",
    description: "Posvátná oblast. Zvyšuje legitimitu a vliv kněží.",
    population_capacity: 100,
    grain_modifier: -2, wealth_modifier: -3, production_modifier: 0,
    stability_modifier: 8, influence_modifier: 3,
    peasant_attraction: 0, burgher_attraction: 0, cleric_attraction: 5, military_attraction: 0,
    build_cost_wealth: 60, build_cost_wood: 15, build_cost_stone: 35, build_turns: 4,
  },
  market: {
    label: "Obchodní čtvrť",
    icon: "🏪",
    description: "Tržiště a sklady. Generuje bohatství, přitahuje cizince.",
    population_capacity: 150,
    grain_modifier: -2, wealth_modifier: 12, production_modifier: 2,
    stability_modifier: -2, influence_modifier: 2,
    peasant_attraction: 0, burgher_attraction: 4, cleric_attraction: 0, military_attraction: 0,
    build_cost_wealth: 70, build_cost_wood: 20, build_cost_stone: 15, build_turns: 3,
  },
  military: {
    label: "Vojenský okrsek",
    icon: "⚔️",
    description: "Kasárny a zbrojnice. Zvyšuje obranu a vojenskou sílu.",
    population_capacity: 150,
    grain_modifier: -4, wealth_modifier: -5, production_modifier: 0,
    stability_modifier: 3, influence_modifier: 1,
    peasant_attraction: 0, burgher_attraction: 0, cleric_attraction: 0, military_attraction: 5,
    build_cost_wealth: 55, build_cost_wood: 25, build_cost_stone: 30, build_turns: 3,
  },
  farm: {
    label: "Zemědělská čtvrť",
    icon: "🌾",
    description: "Rozšířená pole a zahrady. Zvyšuje produkci potravin.",
    population_capacity: 250,
    grain_modifier: 10, wealth_modifier: -1, production_modifier: 0,
    stability_modifier: 2, influence_modifier: 0,
    peasant_attraction: 5, burgher_attraction: -1, cleric_attraction: 0, military_attraction: 0,
    build_cost_wealth: 25, build_cost_wood: 30, build_cost_stone: 5, build_turns: 2,
  },
};

// ═══════════════════════════════════════════
// FACTION TYPES
// ═══════════════════════════════════════════
export const FACTION_TYPES: Record<string, {
  label: string;
  icon: string;
  baseSource: string;
  description: string;
}> = {
  peasants: { label: "Rolníci", icon: "🌾", baseSource: "population_peasants", description: "Základ společnosti. Požadují jídlo a bezpečnost." },
  burghers: { label: "Řemeslníci a měšťané", icon: "⚒️", baseSource: "population_burghers", description: "Ekonomická síla. Požadují volný obchod a stabilitu." },
  clergy: { label: "Kněží", icon: "⛪", baseSource: "population_clerics", description: "Duchovní autorita. Požadují chrámové investice a legitimitu." },
  military: { label: "Vojenská družina", icon: "⚔️", baseSource: "military_garrison", description: "Ozbrojená síla. Požadují výzbroj a uznání." },
};

// ═══════════════════════════════════════════
// POLICY PRESETS
// ═══════════════════════════════════════════
export const RATION_POLICIES: Record<string, {
  label: string;
  description: string;
  grain_effect: number;
  stability_effect: number;
  faction_impact: Record<string, number>;
}> = {
  equal: {
    label: "Rovný příděl",
    description: "Každý dostane stejně. Spravedlivé, ale neefektivní.",
    grain_effect: 0, stability_effect: 5,
    faction_impact: { peasants: 5, burghers: 0, clergy: 0 },
  },
  elite: {
    label: "Přednostní elita",
    description: "Měšťané a klerici jí lépe. Více produktivity, méně spokojenosti lidu.",
    grain_effect: 2, stability_effect: -5,
    faction_impact: { peasants: -8, burghers: 5, clergy: 5 },
  },
  austerity: {
    label: "Úsporný režim",
    description: "Šetříme zásoby. Nižší spotřeba, ale lid reptá.",
    grain_effect: 5, stability_effect: -8,
    faction_impact: { peasants: -10, burghers: -5, clergy: -3 },
  },
  sacrifice: {
    label: "Obětiny bohům",
    description: "Část obilí obětujeme. Kněží jásají, lid hladoví.",
    grain_effect: -8, stability_effect: 3,
    faction_impact: { peasants: -5, burghers: -3, clergy: 15 },
  },
};

export const LABOR_KEYS = ["farming", "crafting", "scribes", "canal"] as const;
export const LABOR_LABELS: Record<string, { label: string; icon: string; tip: string }> = {
  farming: { label: "Pole", icon: "🌾", tip: "Více rolníků = více jídla. Základ přežití." },
  crafting: { label: "Dílny", icon: "⚒️", tip: "Specializace zvyšuje produkci a bohatství, ale snižuje produkci jídla." },
  scribes: { label: "Písaři", icon: "📜", tip: "Administrativa. Zvyšuje legitimitu a vliv, ale snižuje produktivitu." },
  canal: { label: "Kanály", icon: "🏗️", tip: "Zavlažování. Postupně zvyšuje irrigation_level a produkci obilí." },
};

// Max districts by settlement level
export const MAX_DISTRICTS: Record<string, number> = {
  HAMLET: 2, TOWNSHIP: 4, CITY: 6, POLIS: 10,
};

// ═══════════════════════════════════════════
// INFRASTRUCTURE UPGRADES
// ═══════════════════════════════════════════
export const INFRA_UPGRADES: Record<string, {
  label: string;
  icon: string;
  field: string;
  maxLevel: number;
  costPerLevel: { wealth: number; wood: number; stone: number };
  effects: string;
  tip: string;
}> = {
  irrigation: {
    label: "Zavlažování", icon: "🏗️", field: "irrigation_level", maxLevel: 5,
    costPerLevel: { wealth: 20, wood: 10, stone: 15 },
    effects: "+3 🌾 produkce obilí / úroveň",
    tip: "Kanály a hráze. Každá úroveň zvyšuje produkci obilí o 3. Riziko povodně při zanedbání.",
  },
  temple: {
    label: "Chrám", icon: "⛪", field: "temple_level", maxLevel: 5,
    costPerLevel: { wealth: 30, wood: 5, stone: 25 },
    effects: "+5 legitimita, +2 stabilita / úroveň",
    tip: "Posvátné místo. Zvyšuje legitimitu a stabilitu, posiluje kněžskou frakci.",
  },
  market: {
    label: "Tržiště", icon: "🏪", field: "market_level", maxLevel: 5,
    costPerLevel: { wealth: 25, wood: 15, stone: 10 },
    effects: "+4 💰 bohatství / úroveň",
    tip: "Obchodní centrum. Každá úroveň zvyšuje příjem bohatství. Přitahuje měšťany a cizince.",
  },
};

// Compute faction base power from city demographics
export function computeFactionPower(city: any): Record<string, number> {
  const pop = city.population_total || 1;
  const peasants = Math.round(((city.population_peasants || 0) / pop) * 40);
  const burghers = Math.round(((city.population_burghers || 0) / pop) * 40);
  const clergy = Math.round(((city.population_clerics || 0) / pop) * 40);
  const military = Math.min(20, Math.round((city.military_garrison || 0) / 50));
  return { peasants, burghers, clergy, military };
}
