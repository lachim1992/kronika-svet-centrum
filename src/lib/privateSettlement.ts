/** Read-only reconciliation of the modelled producer settlement (computed_modifiers.wage_settlement).
 * Never fills missing source fields with zero and never creates cash: producer cash stock is existing model state. */
export const SETTLEMENT_TOLERANCE = 0.002;
const FIELDS = ['producer_cash_opening', 'producer_cash_pool', 'wages_paid', 'ownership_income_paid', 'producer_cash_closing', 'arrears_closing'] as const;
type Field = typeof FIELDS[number];

export type CitySettlementCheck = {
  city: string | null;
  values: Partial<Record<Field, number>>;
  missing: Field[];
  residual: number | null;
  status: 'ok' | 'mismatch' | 'missing';
};

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;

export function reconcileCitySettlement(raw: unknown): CitySettlementCheck {
  const row = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const city = typeof row.city === 'string' && row.city ? row.city : null;
  const values: Partial<Record<Field, number>> = {};
  const missing: Field[] = [];
  for (const f of FIELDS) { const v = num(row[f]); if (v == null) missing.push(f); else values[f] = v; }
  if (!city || missing.some(f => f !== 'arrears_closing')) return { city, values, missing, residual: null, status: 'missing' };
  const v = values as Record<Field, number>;
  const residual = Math.round((v.producer_cash_opening + v.producer_cash_pool - v.wages_paid - v.ownership_income_paid - v.producer_cash_closing) * 1e6) / 1e6;
  return { city, values, missing, residual, status: missing.length ? 'missing' : Math.abs(residual) <= SETTLEMENT_TOLERANCE ? 'ok' : 'mismatch' };
}

export type SettlementReconciliation = {
  turn: number | null; basis: string | null;
  cities: CitySettlementCheck[];
  /** Sums only when every city has the field; otherwise null (Nedostupné). */
  totals: Partial<Record<Field, number | null>>;
};

export function reconcileWageSettlement(snapshot: unknown): SettlementReconciliation | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const s = snapshot as Record<string, unknown>;
  if (!Array.isArray(s.cities)) return null;
  const cities = s.cities.map(reconcileCitySettlement)
    .sort((a, b) => (a.city ?? '').localeCompare(b.city ?? ''));
  const totals: Partial<Record<Field, number | null>> = {};
  for (const f of FIELDS) totals[f] = cities.length && cities.every(c => c.values[f] != null)
    ? Math.round(cities.reduce((t, c) => t + (c.values[f] as number), 0) * 1000) / 1000 : null;
  return { turn: num(s.turn), basis: typeof s.basis === 'string' ? s.basis : null, cities, totals };
}
