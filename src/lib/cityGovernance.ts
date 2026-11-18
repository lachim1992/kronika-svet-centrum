// City Governance constants & helpers

// District mechanics and display values come only from @/lib/cityDistricts.

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

// Policy presets are validated and applied by command-dispatch from one catalogue.
export { RATION_POLICIES } from "../../supabase/functions/_shared/rationPolicy";

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

// Infrastructure costs/levels are canonical on the server; this re-export is display-only.
export { INFRA_UPGRADES } from "../../supabase/functions/_shared/cityInfrastructure";

// Compute faction base power from city demographics
export function computeFactionPower(city: any): Record<string, number> {
  const pop = city.population_total || 1;
  const peasants = Math.round(((city.population_peasants || 0) / pop) * 40);
  const burghers = Math.round(((city.population_burghers || 0) / pop) * 40);
  const clergy = Math.round(((city.population_clerics || 0) / pop) * 40);
  const military = Math.min(20, Math.round((city.military_garrison || 0) / 50));
  return { peasants, burghers, clergy, military };
}
