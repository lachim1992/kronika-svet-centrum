/** Canonical city infrastructure upgrades; client payload may identify only city and field. */
export interface InfrastructureUpgrade {
  label: string;
  icon: string;
  field: "irrigation_level" | "temple_level" | "market_level";
  maxLevel: number;
  costPerLevel: { wealth: number; wood: number; stone: number };
  effects: string;
  tip: string;
}

export const INFRA_UPGRADES: Record<string, InfrastructureUpgrade> = {
  irrigation: { label: "Zavlažování", icon: "🏗️", field: "irrigation_level", maxLevel: 5, costPerLevel: { wealth: 20, wood: 10, stone: 15 }, effects: "+3 🌾 produkce obilí / úroveň", tip: "Kanály a hráze. Každá úroveň zvyšuje produkci obilí o 3. Riziko povodně při zanedbání." },
  temple: { label: "Chrám", icon: "⛪", field: "temple_level", maxLevel: 5, costPerLevel: { wealth: 30, wood: 5, stone: 25 }, effects: "+5 legitimita, +2 stabilita / úroveň", tip: "Posvátné místo. Zvyšuje legitimitu a stabilitu, posiluje kněžskou frakci." },
  market: { label: "Tržiště", icon: "🏪", field: "market_level", maxLevel: 5, costPerLevel: { wealth: 25, wood: 15, stone: 10 }, effects: "+4 💰 bohatství / úroveň", tip: "Obchodní centrum. Každá úroveň zvyšuje příjem bohatství. Přitahuje měšťany a cizince." },
};

export function infrastructureUpgradeByField(field: unknown): InfrastructureUpgrade | null {
  return Object.values(INFRA_UPGRADES).find(upgrade => upgrade.field === field) ?? null;
}

export function infrastructureUpgradeQuote(upgrade: InfrastructureUpgrade, currentLevel: unknown, requestedLevel: unknown) {
  const current = Number(currentLevel || 0);
  const requested = Number(requestedLevel);
  if (!Number.isInteger(current) || current < 0 || current >= upgrade.maxLevel) return "Infrastruktura je na maximální úrovni" as const;
  if (!Number.isInteger(requested) || requested !== current + 1) return "Vylepšení musí zvýšit úroveň právě o jednu" as const;
  const multiplier = requested;
  return {
    nextLevel: requested,
    costGold: upgrade.costPerLevel.wealth * multiplier,
    costProduction: (upgrade.costPerLevel.wood + upgrade.costPerLevel.stone) * multiplier,
  };
}
