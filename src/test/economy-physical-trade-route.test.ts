import { describe, expect, it } from 'vitest';
import { resolveGoodsEconomy, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';

const fixture = (): Snapshot => ({
  turn: 1,
  cities: ['mine', 'forge'].map((id, x) => ({
    id, owner: 'test', name: id, cell: `${x},0`, population: 1000,
    classes: { peasants: 1000 }, soldiers: 0, stability: 1, irrigation: 0,
    labor: {}, market: 2, storage: 10, admin: 0, security: 1, guild: 0,
    ideology: 'open_merchant' as const, coastal: false,
  })),
  goods: ['ore', 'ingot'].map((key, i) => ({
    key, basket: 'metalwork', price: (i + 1) * 5, stage: 'intermediate',
    storable: true, bulk: 1, density: 30, perishability: 0, storageLoss: 0,
    storageCost: 0, substitutability: 1, strategic: 0, prestige: 0,
    transshipment: 0, finalUse: false,
  })),
  producers: ['ore', 'ingot'].map((key, i) => ({
    id: key, city: i ? 'forge' : 'mine', channel: 'node' as const,
    capacity: 10, jobs: 10, allocation: 1, staffing: 1, logistics: 1,
    mastery: 1, source: i === 0, distinctive: false,
    recipe: { key, good: key, qty: 1,
      inputs: i ? [{ good: 'ore', qty: 1 }] : [],
      labor: 1 / ECONOMY.workersPerLaborUnit, quality: 0, minQuality: 0 },
  })),
  edges: [{ id: 'road', from: '0,0', to: '1,0', cost: 1, capacity: 100,
    mode: 'road', risk: 0, toll: 0, border: 0 }],
  opening: [], fame: [],
});

describe('trade requires physical delivery, not merely a balanced ledger', () => {
  it('moves input over the road and reconciles shipment and transport loss', () => {
    const s = fixture(), before = JSON.stringify(s);
    const r = resolveGoodsEconomy(s);
    const flows = r.flows.filter(f => f.good === 'ore' && f.source === 'mine'
      && f.destination === 'forge' && f.reason === 'production_input');
    expect(flows.length).toBeGreaterThan(0);
    const shipped = flows.reduce((n, f) => n + f.qty, 0);
    const delivered = flows.reduce((n, f) => n + f.delivered, 0);
    expect(delivered).toBeGreaterThan(0);
    expect(delivered).toBeLessThanOrEqual(shipped);
    const source = r.balances.find(b => b.city === 'mine' && b.good === 'ore');
    const target = r.balances.find(b => b.city === 'forge' && b.good === 'ore');
    expect(source?.exported).toBeCloseTo(shipped, 6);
    expect(target?.imported).toBeCloseTo(shipped, 6);
    expect(target?.lost_spoilage).toBeCloseTo(shipped - delivered, 6);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('blocks transfers on road removal, and restores deterministic results on reconnection', () => {
    const s = fixture();
    const connected = resolveGoodsEconomy(s);
    const disconnected = resolveGoodsEconomy({ ...s, edges: [] });
    expect(connected.flows.some(f => f.good === 'ore' && f.destination === 'forge')).toBe(true);
    expect(disconnected.flows).toHaveLength(0);
    expect(disconnected.diagnostics.find(d => d.producer === 'ingot')?.realized ?? 0).toBe(0);
    expect(resolveGoodsEconomy(s)).toEqual(connected);
  });
});
