import { Wheat, Trees, Mountain, Anvil, Coins, Zap } from "lucide-react";
import React from "react";

export const RESOURCE_ICONS: Record<string, React.ReactNode> = {
  food: React.createElement(Wheat, { className: "h-4 w-4" }),
  wood: React.createElement(Trees, { className: "h-4 w-4" }),
  stone: React.createElement(Mountain, { className: "h-4 w-4" }),
  iron: React.createElement(Anvil, { className: "h-4 w-4" }),
  wealth: React.createElement(Coins, { className: "h-4 w-4" }),
};

export const RESOURCE_ICONS_SM: Record<string, React.ReactNode> = {
  food: React.createElement(Wheat, { className: "h-3 w-3" }),
  wood: React.createElement(Trees, { className: "h-3 w-3" }),
  stone: React.createElement(Mountain, { className: "h-3 w-3" }),
  iron: React.createElement(Anvil, { className: "h-3 w-3" }),
  wealth: React.createElement(Coins, { className: "h-3 w-3" }),
  horses: React.createElement(Zap, { className: "h-3 w-3" }),
};

export const RESOURCE_LABELS: Record<string, string> = {
  food: "Obilí",
  wood: "Dřevo",
  stone: "Kámen",
  iron: "Železo",
  wealth: "Bohatství",
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
