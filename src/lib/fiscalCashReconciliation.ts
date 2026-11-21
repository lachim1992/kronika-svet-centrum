/**
 * Read-only fiscal cash reconciliation (Stage 2C/1). Pure; never writes, never infers.
 * Source: the persisted authoritative treasury breakdown (computed_modifiers.wealth_breakdown,
 * produced by _shared/treasury.ts) and the realm tax-pillar columns. Tax is credited to STATE
 * (gold_reserve) as a modelled amount; no PRIVATE financial_accounts are debited for it yet.
 */
export const FISCAL_TOLERANCE = 0.01;

/** Future contract: a cash-taxable private flow per tax pillar. No writer exists yet. */
export type TaxPillar = 'pop_tax' | 'domestic_market' | 'market_tariff' | 'transit_toll' | 'extraction_tax';
export interface TaxablePrivateFlow {
  session_id: string; turn_number: number; city_id: string; pillar: TaxPillar;
  payer_account_id: string; // PRIVATE city_group HOUSEHOLD|BUSINESS account
  taxable_base: number; rate: number; assessed: number; // assessed = taxable_base * rate
  settled: number | null; unpaid: number | null; // settled + unpaid = assessed once a writer exists
}

export type FiscalCheck = { key: string; ok: boolean | null; detail: string };
export interface FiscalCashReconciliation {
  available: boolean;
  legacy_imputed_tax: number | null;     // fiscal_revenue credited to STATE without a payer debit
  real_cash_tax_paid: number | null;     // no cash-tax ledger exists => always null (unavailable)
  uncovered_tax_source: number | null;   // imputed tax not backed by any cash-tax entry
  pillars: { pop_tax: number | null; domestic_market: number | null; goods_fiscal: number | null };
  legacy: { trade_net: number | null; tolls: number | null; prestige: number | null; insolvency_relief: number | null; rounding: number | null };
  opening: number | null; closing: number | null; turn_fiscal_delta: number | null;
  source_missing: string[];
  checks: FiscalCheck[];
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function reconcileFiscalCash(realm: { wealth_pop_tax?: unknown; wealth_domestic_market?: unknown; goods_wealth_fiscal?: unknown; computed_modifiers?: any } | null | undefined): FiscalCashReconciliation {
  const wb = realm?.computed_modifiers?.wealth_breakdown;
  const missing: string[] = [];
  const pick = (k: string) => { const v = num(wb?.[k]); if (v === null) missing.push(`wealth_breakdown.${k}`); return v; };
  const opening = pick('treasury_opening'), closing = pick('treasury_closing'), delta = pick('turn_fiscal_delta');
  const revenue = pick('fiscal_revenue');
  const legacy = { trade_net: pick('legacy_trade_net'), tolls: pick('tolls'), prestige: pick('prestige_bonus'), insolvency_relief: pick('insolvency_relief'), rounding: pick('rounding_adjustment') };
  const col = (k: 'wealth_pop_tax' | 'wealth_domestic_market' | 'goods_wealth_fiscal') => { const v = num(realm?.[k]); if (v === null) missing.push(k); return v; };
  const pillars = { pop_tax: col('wealth_pop_tax'), domestic_market: col('wealth_domestic_market'), goods_fiscal: col('goods_wealth_fiscal') };
  const checks: FiscalCheck[] = [];
  checks.push(opening !== null && closing !== null && delta !== null
    ? { key: 'opening+delta=closing', ok: Math.abs(opening + delta - closing) <= FISCAL_TOLERANCE, detail: `${opening} + ${delta} vs ${closing}` }
    : { key: 'opening+delta=closing', ok: null, detail: 'Nedostupné — chybí položky snapshotu' });
  const pSum = pillars.pop_tax !== null && pillars.domestic_market !== null && pillars.goods_fiscal !== null ? pillars.pop_tax + pillars.domestic_market + pillars.goods_fiscal : null;
  checks.push(pSum !== null && revenue !== null
    ? { key: 'pillars=fiscal_revenue', ok: Math.abs(pSum - revenue) <= FISCAL_TOLERANCE, detail: `${pSum} vs ${revenue} (sloupce mohou pocházet z jiného přepočtu než snapshot)` }
    : { key: 'pillars=fiscal_revenue', ok: null, detail: 'Nedostupné — chybí pilíře nebo fiscal_revenue' });
  return {
    available: !!wb && revenue !== null,
    legacy_imputed_tax: revenue,
    real_cash_tax_paid: null,
    uncovered_tax_source: revenue,
    pillars, legacy, opening, closing, turn_fiscal_delta: delta,
    source_missing: missing, checks,
  };
}
