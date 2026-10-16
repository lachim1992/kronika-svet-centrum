import { describe, it, expect } from 'vitest';
import { resolveGoodsEconomy, type City, type Good, type Producer, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';
import { buildManagementReport } from '../../supabase/functions/_shared/management';
import { buildSnapshot } from '../../supabase/functions/economy-dev-snapshot/build';

const good = (key: string, basket: string, price: number, stage = 'final'): Good => ({
  key, basket, price, stage, storable: true, bulk: 1, density: 30, perishability: 0,
  storageLoss: 0, storageCost: 0, substitutability: 1, strategic: 0, prestige: 0,
  transshipment: 0, finalUse: stage !== 'intermediate',
});
const city = (id: string, x: number): City => ({
  id, owner: 'p', name: id, cell: `${x},0`, population: 1000,
  classes: { peasants: 800, burghers: 200 }, soldiers: 0,
  stability: 1, irrigation: 0, labor: {}, market: 2, storage: 10, admin: 0,
  security: 1, guild: 0, ideology: 'open_merchant', coastal: false,
});
const mill = (id = 'mill'): Producer => ({
  id, city: 'a', channel: 'node', capacity: 10, jobs: 10,
  recipe: { key: 'mill_grain', good: 'flour', qty: 2,
    inputs: [{ good: 'raw_grain', qty: 3, kind: 'material' },
      { good: 'metalwork_tools', qty: 1, kind: 'factor', wear: 0.05 }],
    labor: 1 / ECONOMY.workersPerLaborUnit, quality: 0, minQuality: 0 },
  allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: false, distinctive: false,
});
const base = (road = true, tools = 100): Snapshot => ({
  turn: 2, cities: [city('a', 0), city('b', 1)],
  goods: [good('raw_grain', 'staple_food', 2), good('flour', 'staple_food', 3, 'intermediate'),
    good('metalwork_tools', 'tools', 3)],
  producers: [mill()],
  edges: road ? [{ id: 'r', from: '0,0', to: '1,0', cost: 1, capacity: 200,
    mode: 'road', risk: 0, toll: 0, border: 0 }] : [],
  opening: [{ city: 'a', good: 'raw_grain', qty: 100, quality: 0 },
    ...(tools > 0 ? [{ city: 'b', good: 'metalwork_tools', qty: tools, quality: 0 }] : [])],
  fame: [],
});
const bal = (r: ReturnType<typeof resolveGoodsEconomy>, c: string, g: string) =>
  r.balances.find(x => x.city === c && x.good === g)!;
const diag = (r: ReturnType<typeof resolveGoodsEconomy>, p = 'mill') =>
  r.diagnostics.find(x => x.producer === p)! as any;

describe('class B durable tooling — sourcing, wear and canonical reporting', () => {
  it('imports real tools from a reachable city before calculating capital productivity', () => {
    const without = resolveGoodsEconomy(base(false));
    const withRoad = resolveGoodsEconomy(base(true));
    const f = withRoad.flows.find(x => x.good === 'metalwork_tools' && x.source === 'b' && x.destination === 'a');
    expect(f?.reason).toBe('production_input');
    expect(f?.delivered).toBeGreaterThan(0);
    expect(diag(withRoad).factors.capital).toBeGreaterThan(diag(without).factors.capital);
    expect(diag(withRoad).factors.capital).toBeCloseTo(1, 9);
    expect(bal(withRoad, 'a', 'metalwork_tools').imported).toBeGreaterThan(0);
  });

  it('never imports through a disconnected route and never creates stock', () => {
    const l = resolveGoodsEconomy(base(false));
    expect(l.flows.some(x => x.good === 'metalwork_tools')).toBe(false);
    expect(bal(l, 'a', 'metalwork_tools').imported).toBe(0);
    expect(bal(l, 'a', 'metalwork_tools').consumed_as_input).toBe(0);
    expect(diag(l).factors.capital).toBeCloseTo(0.6, 9);
  });

  it('shares insufficient imported factor stock across competing mills and only wears a fraction', () => {
    const s = base(true, 3); s.producers.push(mill('mill2'));
    const l = resolveGoodsEconomy(s);
    const a = bal(l, 'a', 'metalwork_tools'), b = bal(l, 'b', 'metalwork_tools');
    expect(a.imported).toBeGreaterThan(0);
    expect(a.imported).toBeLessThanOrEqual(3 + 1e-7);
    expect(a.consumed_as_input).toBeGreaterThan(0);
    expect(a.consumed_as_input).toBeLessThan(a.imported);
    expect(b.exported).toBeLessThanOrEqual(3 + 1e-7);
    expect(diag(l, 'mill').factors.capital).toBeLessThan(1);
    expect(diag(l, 'mill2').factors.capital).toBeLessThan(1);
    expect(a.stored).toBeGreaterThan(0);
  });

  it('carries un-worn tools across turns; replaying the same input is deterministic', () => {
    const s = base(true, 6), first = resolveGoodsEconomy(s);
    expect(resolveGoodsEconomy(s)).toEqual(first);
    const next = base(false, 0); next.turn = 3;
    next.opening = first.balances.filter(b => b.stored > 1e-9).map(b => ({
      city: b.city, good: b.good, qty: b.stored, quality: b.quality, lots: b.stored_lots,
    }));
    const second = resolveGoodsEconomy(next);
    expect(diag(second).factors.capital).toBeGreaterThan(0.6);
    expect(bal(second, 'a', 'metalwork_tools').consumed_as_input).toBeGreaterThan(0);
    expect(bal(second, 'a', 'metalwork_tools').stored).toBeGreaterThanOrEqual(0);
    expect(second.flows.filter(x => x.good === 'metalwork_tools')).toEqual([]);
  });

  it('Economy tab and Dev Mode expose the same canonical supplier and worn-factor costs', () => {
    const s = base(), l = resolveGoodsEconomy(s);
    const owner = buildManagementReport(s, l, { player_name: 'p' }).producers.find(p => p.producer === 'mill');
    const dev = buildSnapshot({ ...l, snapshot: { ...s, producers: s.producers.map(p => ({ ...p, node: p.node ?? '' })) } }, null)
      .costs.find(p => p.producer === 'mill');
    const margin = diag(l).margin;
    expect(owner?.margin).toBe(margin);
    expect(dev?.canonical_margin).toBe(margin);
    expect(margin.cost_breakdown.factor_wear).toBeGreaterThan(0);
    expect(margin.inputs.find((x: any) => x.good === 'metalwork_tools')?.chosen_supplier).toBe('b');
    expect(margin.inputs.find((x: any) => x.good === 'metalwork_tools')?.imported_qty).toBeGreaterThan(0);
  });
});
