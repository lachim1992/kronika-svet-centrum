/**
 * Chronicle Economic Model v1 — Client-side constants and helpers
 * 3 macro layers: PRODUCTION, WEALTH, CAPACITY
 */

// ═══════════════════════════════════════════
// MACRO LAYER LABELS
// ═══════════════════════════════════════════

export const MACRO_LAYER_LABELS = {
  production: "Produkce",
  wealth: "Bohatství",
  capacity: "Kapacita",
} as const;

export const MACRO_LAYER_DESCRIPTIONS = {
  production: "Fyzický výstup uzlů — potraviny, suroviny, řemesla, těžba",
  wealth: "Obchodní tok — vzniká průchodem produkce přes trasy",
  capacity: "Státní aparát — infrastruktura, logistika, urbanizace",
} as const;

export const MACRO_LAYER_COLORS = {
  production: "hsl(var(--chart-2))",  // green-ish
  wealth: "hsl(var(--chart-4))",       // gold-ish  
  capacity: "hsl(var(--chart-1))",     // blue-ish
} as const;

export const MACRO_LAYER_ICONS = {
  production: "⚒️",
  wealth: "💰",
  capacity: "🏛️",
} as const;

// ═══════════════════════════════════════════
// STRATEGIC RESOURCES
// ═══════════════════════════════════════════

export const STRATEGIC_RESOURCES = ["iron", "horses", "salt", "copper", "gold_deposit"] as const;
export type StrategicResource = typeof STRATEGIC_RESOURCES[number];

export const STRATEGIC_RESOURCE_LABELS: Record<StrategicResource, string> = {
  iron: "Železo",
  horses: "Koně",
  salt: "Sůl",
  copper: "Měď",
  gold_deposit: "Zlato",
};

export const STRATEGIC_RESOURCE_ICONS: Record<StrategicResource, string> = {
  iron: "⛏️",
  horses: "🐴",
  salt: "🧂",
  copper: "🪙",
  gold_deposit: "✨",
};

export const STRATEGIC_TIER_LABELS: Record<number, string> = {
  0: "Žádný přístup",
  1: "Základní",
  2: "Pokročilý",
  3: "Dominantní",
};

export const STRATEGIC_TIER_COLORS: Record<number, string> = {
  0: "text-muted-foreground",
  1: "text-yellow-500",
  2: "text-orange-500",
  3: "text-red-500",
};

// ═══════════════════════════════════════════
// FLOW FORMULAS (client-side mirror)
// ═══════════════════════════════════════════

/** Base production values by node_type */
export const BASE_PRODUCTION: Record<string, number> = {
  resource_node: 8,
  village_cluster: 6,
  primary_city: 4,
  secondary_city: 3,
  port: 5,
  fortress: 1,
  trade_hub: 2,
  pass: 0,
  religious_center: 2,
  logistic_hub: 3,
};

/** Trade efficiency by flow_role */
export const ROLE_TRADE_EFFICIENCY: Record<string, number> = {
  hub: 1.0,
  gateway: 0.8,
  regulator: 0.6,
  producer: 0.3,
  neutral: 0.2,
};

/** What strategic tier unlocks */
export const STRATEGIC_TIER_UNLOCKS: Record<StrategicResource, Record<number, string[]>> = {
  iron: {
    1: ["Těžká pěchota", "Obléhací stroje"],
    2: ["Elitní obrněnci", "Železné hradby"],
    3: ["Imperiální legie", "Ocelová citadela"],
  },
  horses: {
    1: ["Lehká jízda", "Průzkumníci"],
    2: ["Těžká kavalerie", "Poštovní služba"],
    3: ["Katafrakt", "Nomádská horda"],
  },
  salt: {
    1: ["Solná konzervace (+zásoby)", "Obchodní výhoda"],
    2: ["Solné doly (+wealth)", "Diplomatický vliv"],
    3: ["Solný monopol (+trade dominance)"],
  },
  copper: {
    1: ["Bronzové zbraně", "Mince"],
    2: ["Pokročilé kovářství", "Monetární systém"],
    3: ["Finanční hegemonie"],
  },
  gold_deposit: {
    1: ["Zlatnictví", "+Wealth bonus"],
    2: ["Státní pokladnice", "Najímání žoldnéřů"],
    3: ["Ekonomická supervelmoc"],
  },
};

// ═══════════════════════════════════════════
// ISOLATION PENALTY LABELS
// ═══════════════════════════════════════════

export const ISOLATION_PENALTY_LABELS: Record<string, string> = {
  none: "Připojeno",
  mild: "Mírná izolace",
  moderate: "Částečná izolace",
  severe: "Těžká izolace",
  critical: "Odříznuto",
};

export function getIsolationSeverity(penalty: number): string {
  if (penalty <= 0) return "none";
  if (penalty < 0.15) return "mild";
  if (penalty < 0.35) return "moderate";
  if (penalty < 0.55) return "severe";
  return "critical";
}

// ═══════════════════════════════════════════
// IMPORTANCE SCORE LABELS
// ═══════════════════════════════════════════

export function getImportanceLabel(score: number): string {
  if (score >= 15) return "Klíčový";
  if (score >= 10) return "Významný";
  if (score >= 5) return "Střední";
  if (score >= 2) return "Okrajový";
  return "Zanedbatelný";
}

export function getImportanceColor(score: number): string {
  if (score >= 15) return "text-red-500";
  if (score >= 10) return "text-orange-500";
  if (score >= 5) return "text-yellow-500";
  if (score >= 2) return "text-muted-foreground";
  return "text-muted-foreground/50";
}
