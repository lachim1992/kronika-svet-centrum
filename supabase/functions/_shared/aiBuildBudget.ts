/**
 * AI construction runway guard — pure, shared by ai-faction-turn and tests.
 * Prevents the "capital trap": spending the construction reserve on a non-essential building while the
 * city owns no SCALABLE food/material producer (starter_economy survival huts/wells never count) and real
 * accrual cannot refund the cheapest essential investment within a credible horizon.
 * Never grants points; costs are the canonical template costs charged by command-dispatch.
 */
export const ESSENTIAL_BUILD = /farm|studn|ryb|rašel|pila|kamenolom|lom\b|mlýn|well|sawmill|quarry/i;
export const RUNWAY_HORIZON_TURNS = 10;
/** Preferred first investments, in order: food scaling, then construction chain, then water/fuel. */
export const FALLBACK_PRIORITY = [/^farma/i, /^pila/i, /^kamenolom/i, /^rybářství/i, /^studna/i, /^rašeliniště/i];

export const templateProductionCost = (t: any) =>
  (Number(t?.cost_wood) || 0) + (Number(t?.cost_stone) || 0) + (Number(t?.cost_iron) || 0);

const isStarter = (b: any) => b?.effects?.starter_economy === true || b?.starter_economy === true;

/** A scalable essential producer: essential name, not a starter survival structure. */
export const ownsScalableEssential = (buildings: any[]) =>
  (buildings || []).some(b => !isStarter(b) && ESSENTIAL_BUILD.test(String(b?.name || "")));

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

/** Affordable, not-yet-owned (non-starter) primary investment in priority order, or null. */
export function chooseFallbackInvestment(templates: any[], owned: any[], reserve: number): any | null {
  const have = new Set((owned || []).filter(b => !isStarter(b)).map(b => String(b.name).toLowerCase()));
  for (const re of FALLBACK_PRIORITY) {
    const t = (templates || []).find(x => re.test(String(x?.name || "")) && !have.has(String(x.name).toLowerCase()));
    if (t && templateProductionCost(t) <= reserve && !t.requires_water) return t;
  }
  return null;
}
