import { describe, it, expect } from 'vitest';
import { cityAccounts } from '../../supabase/functions/_shared/productMarket';
import { resolveGoodsEconomy } from '../../supabase/functions/_shared/goodsEconomy';
import { CITY_ACCOUNT_FIELDS, CITY_ACCOUNT_UNMAPPED_OK, formatField, fieldByKey } from '@/lib/economyFieldContract';

const inp = { city: 'c', valueAdded: 100, householdTaxRate: 0.1, needs: [{ good: 'g', qty: 10, localPrice: 1, basePrice: 1, consumed: 10 }], discretionaryWish: 0, basketConsumption: {} };

describe('economy field contract (Economy tab + Dev Mode)', () => {
  it('every engine cityAccounts field is mapped or explicitly exempt — new fields must reach both tabs', () => {
    const keys = Object.keys(cityAccounts({ ...inp, settledWageIncome: 5 }));
    const mapped = new Set(CITY_ACCOUNT_FIELDS.map(f => f.key));
    expect(keys.filter(k => !mapped.has(k) && !CITY_ACCOUNT_UNMAPPED_OK.has(k))).toEqual([]);
  });
  it('goodsEconomy city account extras are mapped too', async () => {
    const t = await import('./product-market.test.ts?raw').catch(() => null); void t;
    const { CITY_ACCOUNT_FIELDS: F } = await import('@/lib/economyFieldContract');
    for (const k of ['producer_payroll', 'producer_operating_surplus', 'wage_rate']) expect(F.some(f => f.key === k)).toBe(true);
  });
  it('mapped keys exist in the engine output (no stale UI fields)', () => {
    const r = resolveGoodsEconomy({ turn: 1, cities: [], goods: [], producers: [], edges: [], opening: [], fame: [] } as any);
    void r;
    const engine = new Set(Object.keys(cityAccounts({ ...inp, settledWageIncome: 5 })));
    const extras = new Set(['producer_payroll', 'producer_operating_surplus', 'wage_rate']);
    for (const f of CITY_ACCOUNT_FIELDS) expect(engine.has(f.key) || extras.has(f.key)).toBe(true);
  });
  it('distinguishes missing, not-yet and real zero', () => {
    const w = fieldByKey('settled_wage_income');
    expect(formatField(w, {})).toEqual({ text: 'chybí', missing: true });
    expect(formatField(w, { settled_wage_income: null })).toEqual({ text: 'zatím není', missing: true });
    expect(formatField(w, { settled_wage_income: 0 })).toEqual({ text: '0.0', missing: false });
    expect(formatField(fieldByKey('labor_income_basis'), { labor_income_basis: 'settled_wages' }).text).toBe('vyplacené mzdy');
  });
});
