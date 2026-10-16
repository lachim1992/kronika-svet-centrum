import { describe, it, expect } from 'vitest';
import { resolveGoodsEconomy, type Good, type City, type Producer, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';
import { RECIPES, PRODUCTION_BUILDINGS, auditReachability } from '../../supabase/functions/_shared/productionCatalog';
import { parseInputItem, fallbackOf } from '../../supabase/functions/_shared/inputKinds';

const good = (key: string, basket: string, price: number, stage = 'final'): Good => ({ key, basket, price, stage, storable: true, bulk: 1, density: 30, perishability: 0, storageLoss: 0, storageCost: 0, substitutability: 1, strategic: 0, prestige: 0, transshipment: 0, finalUse: stage !== 'intermediate' });
const city = (id: string, x: number): City => ({ id, owner: 'p', name: id, cell: `${x},0`, population: 1000, classes: { peasants: 800, burghers: 200 }, soldiers: 0, stability: 1, irrigation: 0, labor: {}, market: 2, storage: 10, admin: 0, security: 1, guild: 0, ideology: 'open_merchant', coastal: false });
const bake = RECIPES.find(r => r.key === 'bake_staples')!;
const baker = (): Producer => ({ id: 'bake', city: 'a', channel: 'node', capacity: 10, jobs: 10, recipe: { key: 'bake', good: 'baked_staples', qty: 2, inputs: bake.inputs, labor: 1 / ECONOMY.workersPerLaborUnit, quality: 0, minQuality: 0 }, allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: false, distinctive: false });
const snap = (peatA: number, peatB = 0): Snapshot => ({ turn: 2, cities: [city('a', 0), city('b', 1)],
  goods: [good('flour', 'staple_food', 3, 'intermediate'), good('baked_staples', 'staple_food', 4), good('peat', 'fuel', 1, 'raw'), good('charcoal', 'fuel', 2)],
  producers: [baker()], edges: [{ id: 'r', from: '0,0', to: '1,0', cost: 1, capacity: 200, mode: 'road', risk: 0, toll: 0, border: 0 }],
  opening: [{ city: 'a', good: 'flour', qty: 100, quality: 0 }, ...(peatA ? [{ city: 'a', good: 'peat', qty: peatA, quality: 0 }] : []), ...(peatB ? [{ city: 'b', good: 'peat', qty: peatB, quality: 0 }] : [])], fame: [] });
const run = (s: Snapshot) => { const r = resolveGoodsEconomy(s); return { r, d: r.diagnostics.find(x => x.producer === 'bake') as any, bal: (c: string, g: string) => r.balances.find(b => b.city === c && b.good === g) as any }; };

describe('staged bakery fuel (peat/charcoal), no phantom fuel', () => {
  it('catalog: bake_staples burns peat OR charcoal with a 0.8 fallback; fuel goods have producing structures; bread stays reachable', () => {
    expect(bake.inputs.filter(i => fallbackOf(i) === 0.8).map(i => i.good)).toEqual(['peat', 'charcoal']);
    for (const r of ['cut_peat', 'burn_charcoal', 'fell_timber']) expect(PRODUCTION_BUILDINGS.some(b => b.levels.flat().includes(r)), r).toBe(true);
    const reach = auditReachability();
    for (const g of ['baked_staples', 'peat', 'charcoal']) expect(reach.find(e => e.good === g)?.reachable, g).toBe(true);
    expect(parseInputItem({ key: 'peat', qty: 1, kind: 'operating', fallback: 0.8 }, Number).fallback).toBe(0.8);
  });
  it('no fuel anywhere: bakery still bakes at the fallback, consumes zero fuel, reports coverage 0', () => {
    const { d, bal } = run(snap(0));
    expect(d.realized).toBeGreaterThan(0);
    expect(d.fuel.coverage).toBe(0); expect(d.fuel.lost_output).toBeGreaterThan(0);
    expect(d.realized).toBeCloseTo(d.fuel.batch * 0.8, 6);
    expect(bal('a', 'peat')?.consumed_as_input ?? 0).toBe(0);
    expect(d.margin.fuel_coverage).toBe(0);
  });
  it('enough local peat: full output, peat physically consumed and conserved', () => {
    const { d, bal } = run(snap(100));
    expect(d.fuel.coverage).toBeCloseTo(1, 9); expect(d.fuel.lost_output).toBeCloseTo(0, 9);
    const b = bal('a', 'peat');
    expect(b.consumed_as_input).toBeCloseTo(d.fuel.consumed.peat, 9);
    expect(d.fuel.consumed.peat).toBeCloseTo(d.realized * 1 / 2, 6);
    expect(d.margin.cost_breakdown.operating).toBeGreaterThan(0);
  });
  it('fuel delivered from a neighbour by road is consumed (transport delivery)', () => {
    const { r, d } = run(snap(0, 100));
    expect(d.fuel.consumed.peat).toBeGreaterThan(0);
    expect(r.flows.some((f: any) => f.good === 'peat' && f.to === 'a')).toBe(true);
  });
  it('partial fuel: coverage between 0 and 1 and output between fallback and full', () => {
    const { d } = run(snap(1));
    expect(d.fuel.coverage).toBeGreaterThan(0); expect(d.fuel.coverage).toBeLessThan(1);
    expect(d.fuel.consumed.peat).toBeLessThanOrEqual(1 + 1e-9);
  });
});
