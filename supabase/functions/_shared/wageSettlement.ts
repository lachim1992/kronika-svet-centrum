import { PRODUCT_MARKET } from './productMarket.ts';
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
export interface WageCityInput { city: string; producer_payroll?: number; rural_producer_payroll?: number; goods_value_added?: number;
  /** Imputed proxy labour income from cityAccounts (GDP share). Diagnostic only — never paid. */
  labor_income?: number;
  /** Imputed proxy ownership income from cityAccounts (capital share of GDP). Settled as a REAL
   *  payout from producer cash AFTER wages; reported only — household spending still uses the proxy. */
  capital_income?: number;
  /** Diagnostic GDP-proxy claim (cash units). Not used for the due amount. */
  ownership_income_claim?: number }
/** Local households own this share of producers' after-wage profit (same constant as the proxy). */
const OWNER_SHARE = PRODUCT_MARKET.localCapitalShare;
export interface WageCitySettlement {
  city: string; payroll_due: number; arrears_opening: number; producer_cash_pool: number;
  wages_paid: number; household_wage_income: number; arrears_closing: number; producer_retained: number;
  rural_payroll_due: number; rural_arrears_opening: number; rural_wages_paid: number; rural_arrears_closing: number;
  urban_wages_paid: number; urban_arrears_closing: number;
  /** Persistent producer cash stock: opening (prior closing) + pool − wages − ownership = closing, never negative. */
  producer_cash_opening: number; producer_cash_closing: number;
  /** Ownership (profit) payout: due = imputed capital income, paid out of cash left after wages. */
  ownership_income_due: number; ownership_income_paid: number; ownership_unpaid: number;
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
  const priorByCity = new Map((prior?.cities || []).map(c => [c.city, c]));
  const cash = new Map((prior?.cities || []).map(c => [c.city, pos(c.producer_cash_closing)]));
  const cities: WageCitySettlement[] = accounts.map(a => {
    const prev = priorByCity.get(a.city);
    const due = pos(a.producer_payroll), ruralDue = Math.min(due, pos(a.rural_producer_payroll));
    const urbanDue = Math.max(0, due-ruralDue), open = pos(prev?.arrears_closing), pool = pos(a.goods_value_added);
    // Legacy arrears without a rural split are carried as urban; new arrears keep their origin.
    const ruralOpen = pos(prev?.rural_arrears_closing);
    const urbanOpen = prev?.urban_arrears_closing == null ? Math.max(0,open-ruralOpen) : pos(prev.urban_arrears_closing);
    const ruralDueTotal = ruralDue+ruralOpen, urbanDueTotal = urbanDue+urbanOpen;
    const totalDue = ruralDueTotal+urbanDueTotal, cashOpen = cash.get(a.city)||0;
    const paid = Math.min(totalDue,pool+cashOpen);
    // Pro-rata settlement preserves the same aggregate cash/wage invariant while making the
    // rural share explicit. Both arrears pools remain separately traceable on the next turn.
    const ruralPaid = totalDue>0 ? r(paid*ruralDueTotal/totalDue) : 0;
    const urbanPaid = r(Math.max(0,paid-ruralPaid));
    const paidTotal = r(ruralPaid+urbanPaid);
    const ruralArrears = r(Math.max(0,ruralDueTotal-ruralPaid));
    const urbanArrears = r(Math.max(0,urbanDueTotal-urbanPaid));
    // Ownership income is paid only from cash left after wages; unpaid profit is not debt.
    const ownershipDue = OWNER_SHARE * Math.max(0, pool - due);
    const ownershipPaid = Math.min(ownershipDue, cashOpen + pool - paidTotal);
    return { city: a.city, payroll_due: r(due), arrears_opening: r(open), producer_cash_pool: r(pool),
      wages_paid: paidTotal, household_wage_income: paidTotal, arrears_closing: r(ruralArrears+urbanArrears), producer_retained: r(Math.max(0, pool - paidTotal)),
      rural_payroll_due: r(ruralDue), rural_arrears_opening: r(ruralOpen), rural_wages_paid: ruralPaid,
      rural_arrears_closing: ruralArrears, urban_wages_paid: urbanPaid, urban_arrears_closing: urbanArrears,
      producer_cash_opening: r(cashOpen), producer_cash_closing: r(cashOpen + pool - paidTotal - ownershipPaid),
      ownership_income_due: r(ownershipDue), ownership_income_paid: r(ownershipPaid), ownership_unpaid: r(ownershipDue - ownershipPaid),
      ...recon(pos(a.labor_income), paidTotal) };
  });
  const sum = (k: keyof WageCitySettlement) => r(cities.reduce((t, c) => t + (c[k] as number), 0));
  return { turn, basis: 'settled' as const, treasury_effect: 0, cities,
    totals: { payroll_due: sum('payroll_due'), wages_paid: sum('wages_paid'), household_wage_income: sum('household_wage_income'),
      arrears_closing: sum('arrears_closing'), producer_retained: sum('producer_retained'), producer_cash_pool: sum('producer_cash_pool'), producer_cash_closing: sum('producer_cash_closing'),
      ownership_income_due: sum('ownership_income_due'), ownership_income_paid: sum('ownership_income_paid'), ownership_unpaid: sum('ownership_unpaid'),
      imputed_labor_income: sum('imputed_labor_income'), imputed_minus_settled: sum('imputed_minus_settled'),
      rural_payroll_due: sum('rural_payroll_due'), rural_wages_paid: sum('rural_wages_paid'), rural_arrears_closing: sum('rural_arrears_closing') },
    /** Next turn's purchasing power uses these settled wages/ownership per city; proxy only where absent (legacy). */
    household_income_basis: 'settled_when_available' as const,
    /** Ownership payout is a real cash transfer out of producer cash and funds next turn's household income. */
    ownership_income_basis: 'settled_spent' as const };
}
