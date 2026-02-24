export const TRADEABLE_RESOURCES = ["gold", "grain", "wood", "stone", "iron"] as const;
export type TradeResource = (typeof TRADEABLE_RESOURCES)[number];

export const TRADE_RESOURCE_META: Record<TradeResource, { label: string; icon: string }> = {
  gold: { label: "Zlato", icon: "💰" },
  grain: { label: "Obilí", icon: "🌾" },
  wood: { label: "Dřevo", icon: "🪵" },
  stone: { label: "Kámen", icon: "🪨" },
  iron: { label: "Železo", icon: "⚙️" },
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
