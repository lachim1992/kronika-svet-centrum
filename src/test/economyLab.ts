/**
 * ECONOMY LAB — pure, deterministic calibration fixtures (test-only, never a gameplay save).
 *
 * Every scenario runs the canonical `cityAccounts` with a standard basic basket. Quantities are
 * per-turn need units; base prices are constant reference prices, local prices are what the city
 * actually pays. Numbers are chosen to describe a clear economic situation, not to hit a target.
 */
import { cityAccounts, PRODUCT_MARKET } from '../../supabase/functions/_shared/productMarket';

export type LabCity = ReturnType<typeof cityAccounts>;

/** Standard basic basket of the reference city (per turn, whole city): food, water, fuel, cloth. */
export const REFERENCE_BASKET = [
  { good: 'raw_grain', qty: 60, basePrice: 1 },
  { good: 'well_water', qty: 20, basePrice: 0.5 },
  { good: 'peat', qty: 10, basePrice: 1 },
  { good: 'textile_basic', qty: 5, basePrice: 4 },
];
/** Basket value at base prices = subsistence value added of the reference city. */
export const REFERENCE_BASKET_VALUE = REFERENCE_BASKET.reduce((s, n) => s + n.qty * n.basePrice, 0);

export function labCity(o: { id: string; valueAdded: number; priceMultiple?: number; taxRate?: number; coverage?: number; discretionaryWish?: number }): LabCity {
  const m = o.priceMultiple ?? 1, cov = o.coverage ?? 1;
  return cityAccounts({
    city: o.id, valueAdded: o.valueAdded, householdTaxRate: o.taxRate ?? PRODUCT_MARKET.defaultHouseholdTaxRate,
    needs: REFERENCE_BASKET.map(n => ({ good: n.good, qty: n.qty, basePrice: n.basePrice, localPrice: n.basePrice * m, consumed: n.qty * cov })),
    discretionaryWish: o.discretionaryWish ?? 0, basketConsumption: {},
  });
}

export const LAB_SCENARIOS = {
  /** a) Physically supplied subsistence city at reference prices and standard tax. */
  balanced: () => labCity({ id: 'balanced', valueAdded: REFERENCE_BASKET_VALUE }),
  /** b) Same GDP/income, basic goods 60 % dearer (local scarcity). */
  scarcity: () => labCity({ id: 'scarcity', valueAdded: REFERENCE_BASKET_VALUE, priceMultiple: 1.6, coverage: 0.8 }),
  /** c) Twice the value added (export workshops), same prices and taxes. */
  productiveExport: () => labCity({ id: 'export', valueAdded: REFERENCE_BASKET_VALUE * 2, discretionaryWish: 40 }),
  /** d) 1.5× GDP but heavy taxation (45 %) and 2.2× basic prices. */
  highTaxExpensive: () => labCity({ id: 'high_tax', valueAdded: REFERENCE_BASKET_VALUE * 1.5, taxRate: 0.45, priceMultiple: 2.2 }),
};
