/** Canonical military unit catalogue (recruitment costs, strategic power, recruit morale, building prerequisites).
 *  Battle stats live in fieldBattle.ts. Stored legacy PROFESSIONAL stays valid and means SWORDSMEN in battle. */
export const UNIT_TYPES = ["MILITIA", "SPEARMEN", "PROFESSIONAL", "AXEMEN", "ARCHERS", "SLINGERS", "JAVELINERS",
  "LIGHT_CAVALRY", "HEAVY_CAVALRY", "ELITE_GUARD", "ENGINEERS"] as const;
export type RecruitUnitType = typeof UNIT_TYPES[number];

export const UNIT_TYPE_LABELS: Record<string, string> = {
  MILITIA: "Milice", SPEARMEN: "Kopiníci", PROFESSIONAL: "Profesionálové", SWORDSMEN: "Šermíři", AXEMEN: "Sekerníci",
  ARCHERS: "Lučištníci", SLINGERS: "Prakovníci", JAVELINERS: "Oštěpaři", LIGHT_CAVALRY: "Lehká jízda",
  HEAVY_CAVALRY: "Těžká jízda", ELITE_GUARD: "Elitní garda", ENGINEERS: "Ženisté",
};
export const UNIT_GOLD_FACTOR: Record<string, number> = { MILITIA: 0.40, SPEARMEN: 0.75, PROFESSIONAL: 1.00, AXEMEN: 0.95, ARCHERS: 0.90,
  SLINGERS: 0.55, JAVELINERS: 0.80, LIGHT_CAVALRY: 1.60, HEAVY_CAVALRY: 2.40, ELITE_GUARD: 2.20, ENGINEERS: 1.30 };
export const UNIT_PROD_FACTOR: Record<string, number> = { MILITIA: 0.25, SPEARMEN: 0.55, PROFESSIONAL: 0.75, AXEMEN: 0.70, ARCHERS: 0.65,
  SLINGERS: 0.35, JAVELINERS: 0.55, LIGHT_CAVALRY: 1.10, HEAVY_CAVALRY: 1.80, ELITE_GUARD: 1.50, ENGINEERS: 1.20 };
export const UNIT_POWER_FACTOR: Record<string, number> = { MILITIA: 1.0, SPEARMEN: 1.4, PROFESSIONAL: 2.2, SWORDSMEN: 2.2, AXEMEN: 1.6, ARCHERS: 1.3,
  SLINGERS: 1.1, JAVELINERS: 1.25, LIGHT_CAVALRY: 2.0, HEAVY_CAVALRY: 3.0, ELITE_GUARD: 3.2, ENGINEERS: 1.1 };
export const UNIT_RECRUIT_MORALE: Record<string, number> = { MILITIA: 55, SPEARMEN: 65, PROFESSIONAL: 70, AXEMEN: 65, ARCHERS: 65, SLINGERS: 60,
  JAVELINERS: 60, LIGHT_CAVALRY: 65, HEAVY_CAVALRY: 70, ELITE_GUARD: 85, ENGINEERS: 60 };
/** Completed building NAMES (as stored in city_buildings.name / building_templates.name) required to recruit. */
export const UNIT_REQUIRED_BUILDINGS: Record<string, string[]> = {
  MILITIA: [], SPEARMEN: ["Kasárny"], PROFESSIONAL: ["Kasárny", "Kovárna"], AXEMEN: ["Kasárny", "Kovárna"], ELITE_GUARD: ["Kasárny", "Kovárna"],
  ARCHERS: ["Střelnice"], SLINGERS: ["Střelnice"], JAVELINERS: ["Střelnice"],
  LIGHT_CAVALRY: ["Jízdárna"], HEAVY_CAVALRY: ["Jízdárna", "Kovárna"], ENGINEERS: ["Obléhací dílna"],
};
export const missingBuildings = (required: string[], completedNames: string[]) => {
  const have = new Set(completedNames.map(n => n.trim().toLowerCase()));
  return required.filter(r => !have.has(r.toLowerCase()));
};

type Preset = { label: string; composition: { unit_type: string; manpower: number }[]; formation_type: string; morale: number; gold_override?: number; prod_override?: number; requires_buildings?: string[] };
const single = (t: RecruitUnitType, formation_type = "UNIT"): Preset => ({ label: UNIT_TYPE_LABELS[t], composition: [{ unit_type: t, manpower: 400 }], formation_type, morale: UNIT_RECRUIT_MORALE[t], requires_buildings: UNIT_REQUIRED_BUILDINGS[t] });
/** Recruitment presets shared by command-dispatch RECRUIT_STACK and the army UI. */
export const FORMATION_PRESETS: Record<string, Preset> = {
  emergency_militia: { label: "Krizová milice", composition: [{ unit_type: "MILITIA", manpower: 80 }], formation_type: "UNIT", morale: 45 },
  militia: { label: "Milice", composition: [{ unit_type: "MILITIA", manpower: 400 }], formation_type: "UNIT", morale: 55 },
  professional: { label: "Profesionální vojsko", composition: [{ unit_type: "PROFESSIONAL", manpower: 400 }], formation_type: "UNIT", morale: 70, requires_buildings: UNIT_REQUIRED_BUILDINGS.PROFESSIONAL },
  legion: { label: "Zárodek legie", composition: [{ unit_type: "MILITIA", manpower: 400 }, { unit_type: "PROFESSIONAL", manpower: 400 }], formation_type: "LEGION", morale: 70, gold_override: 80, requires_buildings: UNIT_REQUIRED_BUILDINGS.PROFESSIONAL },
  spearmen: single("SPEARMEN"), axemen: single("AXEMEN"), archers: single("ARCHERS"), slingers: single("SLINGERS"), javeliners: single("JAVELINERS"),
  light_cavalry: single("LIGHT_CAVALRY", "CAVALRY"), heavy_cavalry: single("HEAVY_CAVALRY", "CAVALRY"), elite_guard: single("ELITE_GUARD"), engineers: single("ENGINEERS"),
};
export function presetRequirements(p: Preset) {
  return [...new Set([...(p.requires_buildings ?? []), ...p.composition.flatMap(c => UNIT_REQUIRED_BUILDINGS[c.unit_type] ?? [])])];
}
