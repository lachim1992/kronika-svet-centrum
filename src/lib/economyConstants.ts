import { Wheat, Factory, Coins, Building2, Church, Star } from "lucide-react";
import React from "react";

/**
 * Unified Civilizational Economy v2
 * 6 Core Resources: Produkce, Bohatství, Zásoby, Kapacita, Víra, Prestiž
 * Legacy aliases (food, gold, grain) preserved for backward compat
 */
export const RESOURCE_ICONS: Record<string, React.ReactNode> = {
  production: React.createElement(Factory, { className: "h-4 w-4" }),
  wealth: React.createElement(Coins, { className: "h-4 w-4" }),
  supplies: React.createElement(Wheat, { className: "h-4 w-4" }),
  capacity: React.createElement(Building2, { className: "h-4 w-4" }),
  faith: React.createElement(Church, { className: "h-4 w-4" }),
  prestige: React.createElement(Star, { className: "h-4 w-4" }),
  // Legacy aliases
  food: React.createElement(Wheat, { className: "h-4 w-4" }),
  grain: React.createElement(Wheat, { className: "h-4 w-4" }),
  gold: React.createElement(Coins, { className: "h-4 w-4" }),
};

export const RESOURCE_ICONS_SM: Record<string, React.ReactNode> = {
  production: React.createElement(Factory, { className: "h-3 w-3" }),
  wealth: React.createElement(Coins, { className: "h-3 w-3" }),
  supplies: React.createElement(Wheat, { className: "h-3 w-3" }),
  capacity: React.createElement(Building2, { className: "h-3 w-3" }),
  faith: React.createElement(Church, { className: "h-3 w-3" }),
  prestige: React.createElement(Star, { className: "h-3 w-3" }),
  food: React.createElement(Wheat, { className: "h-3 w-3" }),
  grain: React.createElement(Wheat, { className: "h-3 w-3" }),
  gold: React.createElement(Coins, { className: "h-3 w-3" }),
};

export const RESOURCE_LABELS: Record<string, string> = {
  production: "Produkce",
  wealth: "Bohatství",
  supplies: "Zásoby",
  capacity: "Kapacita",
  faith: "Víra",
  prestige: "Prestiž",
  // Legacy
  food: "Zásoby",
  grain: "Zásoby",
  gold: "Bohatství",
};

export const SETTLEMENT_LABELS: Record<string, string> = {
  HAMLET: "Osada",
  TOWNSHIP: "Městečko",
  CITY: "Město",
  POLIS: "Polis",
};

/** Wealth income per settlement tier */
export const SETTLEMENT_WEALTH: Record<string, number> = {
  HAMLET: 1,
  TOWNSHIP: 2,
  CITY: 4,
  POLIS: 6,
};

// ═══════════════════════════════════════════
// WORKFORCE SYSTEM CONSTANTS
// ═══════════════════════════════════════════

export { ACTIVE_POP_WEIGHTS, DEFAULT_ACTIVE_POP_RATIO, DEFAULT_MAX_MOBILIZATION, computeActivePopRaw, computeWorkforceBreakdown, actualSoldiers } from "../../supabase/functions/_shared/manpower";

/** Compute total wealth income from cities (client-side mirror of process-turn logic) */
export function computeWealthIncome(cities: any[]): number {
  let total = 0;
  for (const c of cities) {
    if (c.status && c.status !== "ok") continue;
    total += (SETTLEMENT_WEALTH[c.settlement_level] || 1)
      + Math.floor((c.population_total || 0) / 500)
      + Math.floor((c.population_burghers || 0) / 200);
  }
  return total;
}

/** Actual soldier count shared with the canonical civilian workforce calculation. */
export function getStackUnitCount(stack: any): number {
  if (stack.is_active === false) return 0;
  return Math.max(0, Number(stack.soldiers ?? stack.unit_count ??
    (stack.military_stack_composition || []).reduce((sum: number, c: any) => sum + (c.manpower ?? 0), 0)) || 0);
}

/** Compute military wealth upkeep: unit_count × 0.003 per stack (matches process-turn backend) */
export function computeArmyGoldUpkeep(stacks: any[]): number {
  let total = 0;
  for (const stack of stacks) {
    total += Math.ceil(getStackUnitCount(stack) * 0.003);
  }
  return total;
}

/** Compute military food/grain upkeep: unit_count × 0.004 per stack (matches process-turn backend) */
export function computeArmyFoodUpkeep(stacks: any[]): number {
  let total = 0;
  for (const stack of stacks) {
    total += Math.ceil(getStackUnitCount(stack) * 0.004);
  }
  return total;
}
