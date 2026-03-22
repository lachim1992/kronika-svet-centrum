/**
 * Trade constants — new civilizational economy
 * Trade now exchanges Production and Wealth between players.
 */

export const TRADEABLE_RESOURCES = ["production", "wealth", "grain"] as const;
export type TradeResource = (typeof TRADEABLE_RESOURCES)[number];

export const TRADE_RESOURCE_META: Record<TradeResource, { label: string; icon: string }> = {
  production: { label: "Produkce", icon: "⚒️" },
  wealth: { label: "Bohatství", icon: "💰" },
  grain: { label: "Zásoby", icon: "🌾" },
};

export const TRADE_STATUS_LABELS: Record<string, string> = {
  active: "Aktivní",
  expired: "Vypršela",
  cancelled: "Zrušena",
  blocked: "Blokována",
  pending: "Čeká na schválení",
  accepted: "Přijata",
  rejected: "Odmítnuta",
  countered: "Protinávrh",
};

/** Maximum trade routes per settlement level */
export const MAX_TRADE_ROUTES: Record<string, number> = {
  HAMLET: 1,
  TOWNSHIP: 2,
  CITY: 4,
  POLIS: 6,
};

/** Base trade efficiency — fraction of amount that arrives (rest lost to distance/bandits) */
export function computeTradeEfficiency(routeSafety: number, marketLevel: number): number {
  const base = 0.7;
  const safetyBonus = routeSafety * 0.2;
  const marketBonus = marketLevel * 0.02;
  return Math.min(1.0, base + safetyBonus + marketBonus);
}

/** Map trade resource key to realm_resources column */
export const TRADE_RESOURCE_COLUMN: Record<TradeResource, string> = {
  production: "production_reserve",
  wealth: "gold_reserve",
  grain: "grain_reserve",
};
