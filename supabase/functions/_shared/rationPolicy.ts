export interface RationPolicy {
  label: string;
  description: string;
  grain_effect: number;
  stability_effect: number;
  faction_impact: Record<string, number>;
}

/** Server-owned catalogue; the browser receives effects only after validation. */
export const RATION_POLICIES: Record<string, RationPolicy> = {
  equal: {
    label: "Rovný příděl",
    description: "Každý dostane stejně. Spravedlivé, ale neefektivní.",
    grain_effect: 0,
    stability_effect: 5,
    faction_impact: { peasants: 5, burghers: 0, clergy: 0 },
  },
  elite: {
    label: "Přednostní elita",
    description: "Měšťané a klerici jí lépe. Více produktivity, méně spokojenosti lidu.",
    grain_effect: 2,
    stability_effect: -5,
    faction_impact: { peasants: -8, burghers: 5, clergy: 5 },
  },
  austerity: {
    label: "Úsporný režim",
    description: "Šetříme zásoby. Nižší spotřeba, ale lid reptá.",
    grain_effect: 5,
    stability_effect: -8,
    faction_impact: { peasants: -10, burghers: -5, clergy: -3 },
  },
  sacrifice: {
    label: "Obětiny bohům",
    description: "Část obilí obětujeme. Kněží jásají, lid hladoví.",
    grain_effect: -8,
    stability_effect: 3,
    faction_impact: { peasants: -5, burghers: -3, clergy: 15 },
  },
};

export function rationPolicy(key: unknown): { key: string; policy: RationPolicy } | null {
  const normalized = String(key || "");
  const policy = RATION_POLICIES[normalized];
  return policy ? { key: normalized, policy } : null;
}
