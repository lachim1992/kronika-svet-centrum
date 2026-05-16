/**
 * Fiscal Model v6 — single source of truth for tax / GDP / pillar math.
 *
 * MUST mirror the Lafferian model in supabase/functions/process-turn/index.ts
 * (the engine block computing pillarPopTax / pillarDomesticMarket / etc.).
 *
 * Used by UI to:
 *   - render per-pillar projections (TreasuryHub Detail tab)
 *   - preview tax-policy slider changes against last_turn_gdp_*
 *   - validate that displayed totals match what engine writes
 */

export type PillarKey = "poll" | "domestic" | "market" | "transit" | "extraction";

export const TAX_MAX: Record<PillarKey, number> = {
  poll: 0.02,        // 2%/capita → tax revolts
  domestic: 0.50,    // 50% consumption tax → full evasion
  market: 0.40,      // 40% market tariff → traders bypass
  transit: 0.30,     // 30% transit toll → caravans reroute
  extraction: 0.50,  // 50% extraction tax → black market
};

export const PILLAR_META: Record<PillarKey, { label: string; icon: string; softThreshold: number; gdpColumn: string; rateColumn: string; revenueColumn: string }> = {
  poll: {
    label: "Daň z hlavy", icon: "👥", softThreshold: 0.005,
    gdpColumn: "population_total", // virtual — populace, ne GDP
    rateColumn: "tax_rate_poll",
    revenueColumn: "wealth_pop_tax",
  },
  domestic: {
    label: "Domácí spotřeba", icon: "🏛️", softThreshold: 0.30,
    gdpColumn: "last_turn_gdp_domestic",
    rateColumn: "tax_rate_domestic",
    revenueColumn: "wealth_domestic_market",
  },
  market: {
    label: "Tržní obrat", icon: "💱", softThreshold: 0.25,
    gdpColumn: "last_turn_gdp_market",
    rateColumn: "tax_rate_market",
    revenueColumn: "goods_wealth_fiscal",
  },
  transit: {
    label: "Tranzitní mýto", icon: "🛤️", softThreshold: 0.18,
    gdpColumn: "last_turn_gdp_transit",
    rateColumn: "tax_rate_transit",
    revenueColumn: "wealth_route_commerce",
  },
  extraction: {
    label: "Těžba", icon: "⛏️", softThreshold: 0.30,
    gdpColumn: "last_turn_gdp_extraction",
    rateColumn: "tax_rate_extraction",
    revenueColumn: "", // bundled into goods_wealth_fiscal
  },
};

/**
 * Laffer dampening: effective share = max(0, 1 − (rate / max_rate)²)
 *   rate=0:        100% volume taxable (but 0 revenue because rate=0)
 *   rate=max/√3:   peak revenue (~38% of max base)
 *   rate=max_rate: full evasion, 0 revenue
 */
export const laffer = (rate: number, max: number): number =>
  Math.max(0, 1 - Math.pow(rate / max, 2));

/**
 * Governance modifier: legitimacy gates collection efficiency.
 *   0 legit  → 0.50× (corruption, refusal, regional leakage)
 *  50 legit  → 0.75×
 * 100 legit  → 1.00×
 */
export const govMod = (legitimacy: number): number => {
  const l = Math.max(0, Math.min(100, Number(legitimacy ?? 50)));
  return 0.5 + 0.5 * (l / 100);
};

export interface PillarProjection {
  key: PillarKey;
  label: string;
  icon: string;
  base: number;          // GDP volume (or population for poll)
  nominalRate: number;
  lafferKeep: number;    // 0..1
  effectiveRate: number; // nominal × laffer × gov
  govMod: number;
  revenue: number;       // base × effectiveRate
  grossPotential: number; // base × nominalRate (no laffer, no gov)
  leakage: number;       // grossPotential − revenue
  overSoftThreshold: boolean;
}

export function computePillar(key: PillarKey, base: number, nominalRate: number, legitimacy: number): PillarProjection {
  const meta = PILLAR_META[key];
  const max = TAX_MAX[key];
  const gov = govMod(legitimacy);
  const keep = laffer(nominalRate, max);
  const effectiveRate = nominalRate * keep * gov;
  const revenue = base * effectiveRate;
  const grossPotential = base * nominalRate;
  return {
    key,
    label: meta.label,
    icon: meta.icon,
    base,
    nominalRate,
    lafferKeep: keep,
    effectiveRate,
    govMod: gov,
    revenue,
    grossPotential,
    leakage: Math.max(0, grossPotential - revenue),
    overSoftThreshold: nominalRate > meta.softThreshold,
  };
}

/** Pull all 5 pillars at once from a realm row. */
export function computeAllPillars(realm: any, populationTotal: number): PillarProjection[] {
  const legit = Number(realm?.legitimacy ?? 50);
  return [
    computePillar("poll",       populationTotal,                         Number(realm?.tax_rate_poll       ?? 0.002), legit),
    computePillar("domestic",   Number(realm?.last_turn_gdp_domestic   ?? 0), Number(realm?.tax_rate_domestic   ?? 0.10), legit),
    computePillar("market",     Number(realm?.last_turn_gdp_market     ?? 0), Number(realm?.tax_rate_market     ?? 0.05), legit),
    computePillar("transit",    Number(realm?.last_turn_gdp_transit    ?? 0), Number(realm?.tax_rate_transit    ?? 0.03), legit),
    computePillar("extraction", Number(realm?.last_turn_gdp_extraction ?? 0), Number(realm?.tax_rate_extraction ?? 0.05), legit),
  ];
}

/** Sum of GDP across all non-poll pillars (poll uses population, not GDP). */
export function totalGDP(pillars: PillarProjection[]): number {
  return pillars.filter(p => p.key !== "poll").reduce((s, p) => s + p.base, 0);
}

/** Sum of revenue across all pillars (= what engine writes to gold_reserve). */
export function totalRevenue(pillars: PillarProjection[]): number {
  return pillars.reduce((s, p) => s + p.revenue, 0);
}
