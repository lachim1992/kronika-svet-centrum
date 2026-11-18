/** Authoritative settlement progression shared by the upgrade panel and command-dispatch. */
export interface SettlementUpgradeDefinition {
  current: "HAMLET" | "TOWNSHIP" | "CITY";
  nextLabel: string;
  nextSettlement: "TOWNSHIP" | "CITY" | "POLIS";
  population: number;
  stability: number;
  grain: number;
  costGold: number;
  costProduction: number;
  capacity: number;
  prestige: number;
}

export const SETTLEMENT_UPGRADES: Record<string, SettlementUpgradeDefinition> = {
  HAMLET: { current: "HAMLET", nextLabel: "Městečko", nextSettlement: "TOWNSHIP", population: 2000, stability: 50, grain: 20, costGold: 30, costProduction: 30, capacity: 0, prestige: 0 },
  TOWNSHIP: { current: "TOWNSHIP", nextLabel: "Město", nextSettlement: "CITY", population: 5000, stability: 60, grain: 50, costGold: 100, costProduction: 80, capacity: 10, prestige: 0 },
  CITY: { current: "CITY", nextLabel: "Polis", nextSettlement: "POLIS", population: 15000, stability: 70, grain: 0, costGold: 300, costProduction: 250, capacity: 25, prestige: 50 },
};

export function settlementUpgradeDefinition(current: unknown): SettlementUpgradeDefinition | null {
  return SETTLEMENT_UPGRADES[String(current || "")] ?? null;
}

/** Null means every stored requirement is met. Costs are never read from the command payload. */
export function settlementUpgradeProblem(city: any, realm: any, definition: SettlementUpgradeDefinition): string | null {
  if (Number(city?.population_total || 0) < definition.population) return `Potřeba ${definition.population} obyvatel`;
  if (Number(city?.city_stability ?? 70) < definition.stability) return `Potřeba stabilita ${definition.stability}`;
  if (Number(city?.local_grain_reserve || 0) < definition.grain) return `Potřeba ${definition.grain} obilí v sýpce`;
  if (Number(realm?.total_capacity || 0) < definition.capacity) return `Potřeba kapacita ${definition.capacity}`;
  if (Number(realm?.prestige || 0) < definition.prestige) return `Potřeba prestiž ${definition.prestige}`;
  return null;
}
