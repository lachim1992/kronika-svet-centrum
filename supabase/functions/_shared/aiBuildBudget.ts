/**
 * AI construction runway guard — pure, shared by ai-faction-turn and tests.
 * Prevents the "capital trap": an AI spending its whole construction reserve on a non-essential
 * building (e.g. barracks) while it owns no scalable food/water/fuel/material producer and its
 * real accrual cannot refund the cheapest essential building within a credible horizon.
 * Never grants points; costs are the canonical template costs charged by command-dispatch.
 */
export const ESSENTIAL_BUILD = /farm|studn|ryb|rašel|pila|kamenolom|lom\b|mlýn|well|sawmill|quarry/i;
export const RUNWAY_HORIZON_TURNS = 10;

export const templateProductionCost = (t: any) =>
  (Number(t?.cost_wood) || 0) + (Number(t?.cost_stone) || 0) + (Number(t?.cost_iron) || 0);

export interface RunwayInput {
  template: any; reserve: number; accrualPerTurn: number;
  essentialTemplates: any[]; ownsEssential: boolean;
}

/** null = allowed; otherwise exact reason. */
export function aiBuildRunway(i: RunwayInput): string | null {
  const cost = templateProductionCost(i.template);
  if (i.reserve < cost) return `insufficient_reserve(${cost}>${i.reserve.toFixed(3)})`;
  if (ESSENTIAL_BUILD.test(String(i.template?.name || ""))) return null;
  if (i.ownsEssential) return null;
  const floor = Math.min(...i.essentialTemplates.map(templateProductionCost).filter(c => c > 0), Infinity);
  if (!Number.isFinite(floor)) return null;
  const after = i.reserve - cost;
  if (after >= floor) return null;
  const turns = i.accrualPerTurn > 0 ? (floor - after) / i.accrualPerTurn : Infinity;
  return turns <= RUNWAY_HORIZON_TURNS ? null : `deferred_runway(needs ${floor} for essential, recovery ${Number.isFinite(turns) ? Math.ceil(turns) : '∞'} turns)`;
}
