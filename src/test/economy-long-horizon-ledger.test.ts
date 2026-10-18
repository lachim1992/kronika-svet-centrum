/** Pure physical-ledger horizon smoke: no database writes or TEST02 turns. */
import { describe, expect, it } from 'vitest';
import { resolveGoodsEconomy, produced, type Snapshot, type Opening } from '../../supabase/functions/_shared/goodsEconomy';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';

const scenario = (): Snapshot => ({
  turn: 1,
  cities: ['mine', 'forge'].map((id, x) => ({
    id, owner: 'test', name: id, cell: `${x},0`, population: 1000,
    classes: { peasants: 1000 }, soldiers: 0, stability: 1, irrigation: 0,
    labor: {}, market: 2, storage: 10, admin: 0, security: 1, guild: 0,
    ideology: 'open_merchant' as const, coastal: false,
  })),
  goods: ['ore', 'ingot', 'blade'].map((key, i) => ({
    key, basket: 'metalwork', price: (i + 1) * 5, stage: 'intermediate',
    storable: true, bulk: 1, density: 30, perishability: 0, storageLoss: 0,
    storageCost: 0, substitutability: 1, strategic: 0, prestige: 0,
    transshipment: 0, finalUse: false,
  })),
  producers: ['ore', 'ingot', 'blade'].map((key, i) => ({
    id: key, city: i ? 'forge' : 'mine', channel: 'node' as const,
    capacity: 10, jobs: 10, allocation: 1, staffing: 1, logistics: 1,
    mastery: 1, source: i === 0, distinctive: false,
    recipe: {
      key, good: key, qty: 1, inputs: i ? [{ good: ['ore', 'ingot'][i - 1], qty: 1 }] : [],
      labor: 1 / ECONOMY.workersPerLaborUnit, quality: 0, minQuality: 0,
    },
  })),
  edges: [{ id: 'road', from: '0,0', to: '1,0', cost: 1, capacity: 100,
    mode: 'road', risk: 0, toll: 0, border: 0 }],
  opening: [], fame: [],
});

describe('physical ledger long-horizon (synthetic, not live turns)', () => {
  it.each([20, 200])('preserves physical mass and stored lots for %i turns', turns => {
    const base = scenario();
    let opening: Opening[] = [];
    for (let turn = 1; turn <= turns; turn++) {
      const snapshot = { ...base, turn, opening, edges: turn >= 11 && turn <= 15 ? [] : base.edges };
      const before = JSON.stringify(snapshot);
      const result = resolveGoodsEconomy(snapshot);
      expect(JSON.stringify(snapshot)).toBe(before);
      if (turn === 1 || turn === turns) expect(resolveGoodsEconomy(snapshot)).toEqual(result);
      for (const b of result.balances) {
        expect(b.opening + produced(b) + b.imported).toBeCloseTo(
          b.consumed_household + b.consumed_state + b.consumed_as_input +
          b.exported + b.stored + b.lost_spoilage + b.capex, 5);
        expect(Number.isFinite(b.stored)).toBe(true);
        expect(b.stored).toBeGreaterThanOrEqual(-1e-7);
        if (b.stored > 1e-6)
          expect((b.stored_lots ?? []).reduce((sum, lot) => sum + lot.qty, 0)).toBeCloseTo(b.stored, 5);
      }
      if (turn >= 11 && turn <= 15)
        expect(result.flows.filter(f => f.source === 'mine' && f.destination === 'forge')).toHaveLength(0);
      opening = result.balances.filter(b => b.stored > 1e-6).map(b => ({
        city: b.city, good: b.good, qty: b.stored, quality: b.quality, lots: b.stored_lots,
      }));
    }
    expect(opening.length).toBeGreaterThan(0);
  });
});
