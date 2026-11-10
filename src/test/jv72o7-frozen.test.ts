import { describe, it, expect } from 'vitest';
import snapJson from './fixtures/jv72o7-snapshot.json';
import { resolveGoodsEconomy, produced } from '../../supabase/functions/_shared/goodsEconomy';

// Frozen JV72O7 turn-3 snapshot (read-only export of economy_turn_ledgers.result.snapshot); no DB access.
const snap: any = snapJson;
const cov = (r: any, city: string, basket: string) => {
  const keys = new Set(snap.goods.filter((g: any) => g.basket === basket).map((g: any) => g.key));
  const bs = r.balances.filter((b: any) => b.city === city && keys.has(b.good));
  const d = bs.reduce((s: number, b: any) => s + b.demand, 0), u = bs.reduce((s: number, b: any) => s + b.unmet_demand, 0);
  return d > 0 ? 1 - u / d : 1;
};
describe('JV72O7 frozen fixture (turn 3)', () => {
  const r = resolveGoodsEconomy(snap);
  it('every city: food & water 100 %, headcount conserved, physical balance', () => {
    for (const c of snap.cities) {
      expect(cov(r, c.id, 'staple_food'), `${c.name} food`).toBeGreaterThanOrEqual(0.999);
      expect(cov(r, c.id, 'drinking_water'), `${c.name} water`).toBeGreaterThanOrEqual(0.999);
      const l = r.labor.find((x: any) => x.city === c.id)!;
      expect(l.employed_total).toBeLessThanOrEqual(l.available_workforce + 1e-6);
      const sectorsEmployed = Object.values(l.sectors).reduce((s: number, x: any) => s + x.employed, 0);
      expect(sectorsEmployed).toBeCloseTo(l.employed_total, 6);
    }
    for (const b of r.balances) expect(b.opening + produced(b) + b.imported)
      .toBeCloseTo(b.consumed_household + b.consumed_state + b.consumed_as_input + b.exported + b.stored + b.capex + b.lost_spoilage, 6);
  });
  it('Lambadagrad fuel ≥ 80 % once critical retraining may staff the peat cut', () => {
    const lam = snap.cities.find((c: any) => /Lambad/.test(c.name));
    expect(cov(r, lam.id, 'fuel')).toBeGreaterThanOrEqual(0.8 - 1e-9); // was 0.51 before critical retraining
  });
  it('idempotent', () => expect(JSON.stringify(resolveGoodsEconomy(snap))).toBe(JSON.stringify(r)));
});
