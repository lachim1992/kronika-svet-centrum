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

/** Weight of each population layer toward the active population pool */
export const ACTIVE_POP_WEIGHTS = {
  peasants: 1.0,
  burghers: 0.7,
  clerics: 0.2,
};

/** Default ratio of active population (can be modified by laws/decrees) */
export const DEFAULT_ACTIVE_POP_RATIO = 0.5;

/** Default maximum mobilization rate (can be modified by laws/decrees) */
export const DEFAULT_MAX_MOBILIZATION = 0.3;

/**
 * Compute the weighted active population for a set of cities.
 * active_pop_raw = peasants*1.0 + burghers*0.7 + clerics*0.2
 */
export function computeActivePopRaw(cities: any[]): number {
  let total = 0;
  for (const c of cities) {
    if (c.status && c.status !== "ok") continue;
    total += (c.population_peasants || 0) * ACTIVE_POP_WEIGHTS.peasants
           + (c.population_burghers || 0) * ACTIVE_POP_WEIGHTS.burghers
           + (c.population_clerics || 0) * ACTIVE_POP_WEIGHTS.clerics;
  }
  return Math.floor(total);
}

/**
 * Compute effective active population, workforce, and mobilized counts.
 */
export function computeWorkforceBreakdown(
  cities: any[],
  mobilizationRate: number,
  activePopRatioModifier = 0,
  maxMobilizationModifier = 0,
) {
  const activePopRaw = computeActivePopRaw(cities);
  const effectiveRatio = Math.max(0.1, Math.min(0.9, DEFAULT_ACTIVE_POP_RATIO + activePopRatioModifier));
  const effectiveActivePop = Math.floor(activePopRaw * effectiveRatio);
  const maxMob = Math.max(0.05, Math.min(0.5, DEFAULT_MAX_MOBILIZATION + maxMobilizationModifier));
  const isOverMob = mobilizationRate > maxMob;
  const mobilized = Math.floor(effectiveActivePop * mobilizationRate);
  const workforce = effectiveActivePop - mobilized;
  const workforceRatio = effectiveActivePop > 0 ? workforce / effectiveActivePop : 1;
  const overMobPenalty = isOverMob ? Math.min(0.8, (mobilizationRate - maxMob) * 2) : 0;
  const effectiveWorkforceRatio = Math.max(0.05, workforceRatio * (1 - overMobPenalty));

  return {
    activePopRaw,
    effectiveRatio,
    effectiveActivePop,
    maxMobilization: maxMob,
    clampedMobRate: mobilizationRate,
    mobilized,
    workforce,
    workforceRatio,
    overMobPenalty,
    effectiveWorkforceRatio,
    isOverMob,
  };
}

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

/** Compute military wealth upkeep: 1 gold per 100 troops */
export function computeArmyGoldUpkeep(stacks: any[]): number {
  let total = 0;
  for (const stack of stacks) {
    const manpower = (stack.military_stack_composition || [])
      .reduce((sum: number, c: any) => sum + (c.manpower ?? 0), 0);
    total += Math.ceil(manpower / 100);
  }
  return total;
}

/** Compute military food upkeep: 1 food per 500 troops */
export function computeArmyFoodUpkeep(stacks: any[]): number {
  let total = 0;
  for (const stack of stacks) {
    const manpower = (stack.military_stack_composition || [])
      .reduce((sum: number, c: any) => sum + (c.manpower ?? 0), 0);
    total += Math.ceil(manpower / 500);
  }
  return total;
}
