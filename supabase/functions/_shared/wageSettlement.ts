/**
 * WAGE SETTLEMENT — canonical private-sector payroll transfer, settled once per turn by process-turn.
 *
 * Money source: a city's producers can pay wages only out of the cash their sales left after buying
 * inputs (goods value added = revenue − intermediate). Wages move producer cash → household cash.
 * The crown treasury is NOT a party: gold_reserve/turn_fiscal_delta are unchanged, so no money is
 * created or destroyed. Unpaid wages become arrears (carried, never negative funds). Persisted in
 * realm_resources.computed_modifiers.wage_settlement through apply_goods_fiscal_plan, whose turn guard
 * makes a retry a no-op. refresh-economy never calls this.
 */
export interface WageCityInput { city: string; producer_payroll?: number; goods_value_added?: number;
  /** Imputed proxy labour income from cityAccounts (GDP share). Diagnostic only — never paid. */
  labor_income?: number }
export interface WageCitySettlement {
  city: string; payroll_due: number; arrears_opening: number; producer_cash_pool: number;
  wages_paid: number; household_wage_income: number; arrears_closing: number; producer_retained: number;
  /** Persistent producer cash stock: opening (prior closing) + pool − wages = closing, never negative. */
  producer_cash_opening: number; producer_cash_closing: number;
  /** Reconciliation: imputed purchasing-power labour income vs. settled cash. */
  imputed_labor_income: number; imputed_minus_settled: number; settled_share_of_imputed: number | null;
}
const recon = (imputed: number, paid: number) => ({ imputed_labor_income: r(imputed),
  imputed_minus_settled: r(imputed - paid), settled_share_of_imputed: imputed > 0 ? r(paid / imputed) : null });
const pos = (v: unknown) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0; };
const r = (v: number) => Math.round(v * 1000) / 1000;

export function settleWages(turn: number, accounts: WageCityInput[], prior?: { turn?: number; cities?: WageCitySettlement[] } | null) {
  if (prior?.turn === turn) return { ...prior, replay: true } as ReturnType<typeof build> & { replay: true };
  return build(turn, accounts, prior);
}
function build(turn: number, accounts: WageCityInput[], prior?: { cities?: WageCitySettlement[] } | null) {
  const carried = new Map((prior?.cities || []).map(c => [c.city, pos(c.arrears_closing)]));
  const cash = new Map((prior?.cities || []).map(c => [c.city, pos(c.producer_cash_closing)]));
  const cities: WageCitySettlement[] = accounts.map(a => {
    const due = pos(a.producer_payroll), open = carried.get(a.city) || 0, pool = pos(a.goods_value_added);
    const cashOpen = cash.get(a.city) || 0;
    const paid = Math.min(due + open, pool + cashOpen);
    return { city: a.city, payroll_due: r(due), arrears_opening: r(open), producer_cash_pool: r(pool),
      wages_paid: r(paid), household_wage_income: r(paid), arrears_closing: r(due + open - paid), producer_retained: r(pool - paid),
      producer_cash_opening: r(cashOpen), producer_cash_closing: r(cashOpen + pool - paid),
      ...recon(pos(a.labor_income), paid) };
  });
  const sum = (k: keyof WageCitySettlement) => r(cities.reduce((t, c) => t + (c[k] as number), 0));
  return { turn, basis: 'settled' as const, treasury_effect: 0, cities,
    totals: { payroll_due: sum('payroll_due'), wages_paid: sum('wages_paid'), household_wage_income: sum('household_wage_income'),
      arrears_closing: sum('arrears_closing'), producer_retained: sum('producer_retained'), producer_cash_pool: sum('producer_cash_pool'), producer_cash_closing: sum('producer_cash_closing'),
      imputed_labor_income: sum('imputed_labor_income'), imputed_minus_settled: sum('imputed_minus_settled') },
    /** Household purchasing power still uses the imputed proxy; settled wages are reported, not yet spent. */
    household_income_basis: 'imputed_proxy' as const };
}
