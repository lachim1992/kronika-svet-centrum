import { describe, it, expect } from 'vitest';
import { resolveGoodsEconomy, type Good, type City, type Producer, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { BASKET_DEMAND, basketDemandChannels, basketClass, needBand, waterShortageImpact,
  toolProductivityMultiplier, alertPriority, channelTotal, DEMAND } from '../../supabase/functions/_shared/demandModel';

// CANONICAL DEMAND CLASSES — needs vs operational / development / civic / military / luxury.
// Population creates needs (and a little discretionary consumption). Everything else is
// demanded because the settlement actually does something.

const good = (key: string, basket: string, stage: Good['stage'] = 'final', price = 10): Good =>
  ({ key, basket, price, stage, storable: true, bulk: 1, density: 10, perishability: 0, storageLoss: 0,
     storageCost: 0, substitutability: 1, strategic: 0, prestige: 0, transshipment: 0, finalUse: stage !== 'intermediate' });
const city = (over: Partial<City> = {}): City =>
  ({ id: 'c', owner: 'p', name: 'C', cell: '0,0', population: 2000, classes: { peasants: 2000 }, soldiers: 0,
     stability: 1, irrigation: 0, labor: {}, market: 1, storage: 20, admin: 0, security: 1, guild: 0,
     ideology: 'open_merchant', coastal: false, ...over });
const producer = (id: string, g: string, capacity = 10, inputs: { good: string; qty: number }[] = []): Producer =>
  ({ id, city: 'c', channel: 'facility', capacity, recipe: { key: id, good: g, qty: 1, inputs, labor: 0.05, quality: 0, minQuality: 0 },
     allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: inputs.length === 0, distinctive: false });
const snap = (goods: Good[], producers: Producer[] = [], over: Partial<City> = {}): Snapshot =>
  ({ turn: 1, goods, cities: [city(over)], producers, edges: [], opening: [], fame: [] });
const demandOf = (r: ReturnType<typeof resolveGoodsEconomy>, basket: string, goods: Good[]) =>
  r.balances.filter(b => goods.find(g => g.key === b.good)?.basket === basket).reduce((n, b) => n + b.demand, 0);

const baseGoods = [
  good('bread', 'staple_food'), good('water', 'drinking_water'), good('hoe', 'tools'),
  good('beams', 'construction'), good('ledgers', 'admin_supplies'), good('crates', 'storage_logistics'),
  good('spears', 'military_supply'), good('pottery', 'variety'), good('robes', 'luxury_clothing'),
  good('ore', 'metalwork', 'intermediate'),
];

describe('canonical demand classes', () => {
  it('A/N: classification covers every basket, tools are operational and water is a critical need', () => {
    expect(basketClass('tools')).toBe('operational');
    expect(basketClass('drinking_water')).toBe('critical_need');
    expect(basketClass('variety')).toBe('discretionary');
    expect(basketClass('metalwork')).toBe('intermediate_only');
    expect(BASKET_DEMAND.tools.drivers).toEqual(['industrial_operational']);
    expect(BASKET_DEMAND.tools.basicNeeds).toBe(false);
  });

  it('B/C: tool demand comes from staffed productive capacity, not from population', () => {
    const idle = resolveGoodsEconomy(snap(baseGoods, [], { population: 20000, classes: { peasants: 20000 } }));
    expect(demandOf(idle, 'tools', baseGoods)).toBe(0);
    const busy = resolveGoodsEconomy(snap(baseGoods, [producer('mine', 'ore', 10)]));
    expect(demandOf(busy, 'tools', baseGoods)).toBeGreaterThan(0);
    const bigger = resolveGoodsEconomy(snap(baseGoods, [producer('mine', 'ore', 10), producer('mine2', 'ore', 20)]));
    expect(demandOf(bigger, 'tools', baseGoods)).toBeGreaterThan(demandOf(busy, 'tools', baseGoods));
  });

  it('D: a tool shortage lowers productivity softly and never stops production', () => {
    expect(toolProductivityMultiplier(1)).toBe(1);
    expect(toolProductivityMultiplier(0)).toBe(DEMAND.toolProductivityFloor);
    expect(toolProductivityMultiplier(0)).toBeGreaterThan(0.5);
    const r = resolveGoodsEconomy(snap(baseGoods, [producer('mine', 'ore', 10)]));
    expect(r.balances.find(b => b.good === 'ore')!.produced_facility).toBeGreaterThan(0);
    expect(r.diagnostics.find(d => d.producer === 'mine')!.factors.tools)
      .toBeCloseTo(DEMAND.toolProductivityFloor);
  });

  it('E/F: population creates water demand and only a real gap has need consequences', () => {
    const r = resolveGoodsEconomy(snap(baseGoods));
    expect(demandOf(r, 'drinking_water', baseGoods)).toBeGreaterThan(0);
    expect(needBand(0.9999999)).toBe('healthy');
    expect(waterShortageImpact(1000, 0.999).stabilityLoss).toBe(0);
    expect(waterShortageImpact(1000, 0.4).stabilityLoss).toBeGreaterThan(0);
    expect(waterShortageImpact(1000, 0.4).deaths).toBeGreaterThan(0);
    expect(waterShortageImpact(1000, 0.8).deaths).toBe(0);
  });

  it('G/H: construction demand exists only while something is being built', () => {
    expect(demandOf(resolveGoodsEconomy(snap(baseGoods)), 'construction', baseGoods)).toBe(0);
    expect(demandOf(resolveGoodsEconomy(snap(baseGoods, [], { constructionProjects: 3 })), 'construction', baseGoods))
      .toBeCloseTo(3 * DEMAND.constructionPerProject);
  });

  it('I/J: military supply scales with actual soldiers only', () => {
    expect(demandOf(resolveGoodsEconomy(snap(baseGoods)), 'military_supply', baseGoods)).toBe(0);
    const few = resolveGoodsEconomy(snap(baseGoods, [], { soldiers: 100 }));
    const many = resolveGoodsEconomy(snap(baseGoods, [], { soldiers: 400 }));
    expect(demandOf(many, 'military_supply', baseGoods))
      .toBeCloseTo(demandOf(few, 'military_supply', baseGoods) * 4);
  });

  it('K/L: civic demand scales with institutions, stock and market activity', () => {
    const plain = resolveGoodsEconomy(snap(baseGoods));
    const admin = resolveGoodsEconomy(snap(baseGoods, [], { admin: 3 }));
    expect(demandOf(admin, 'admin_supplies', baseGoods)).toBeGreaterThan(demandOf(plain, 'admin_supplies', baseGoods));
    const stocked = { ...snap(baseGoods), opening: [{ city: 'c', good: 'bread', qty: 500, quality: 1 }] };
    expect(demandOf(resolveGoodsEconomy(stocked), 'storage_logistics', baseGoods))
      .toBeGreaterThan(demandOf(plain, 'storage_logistics', baseGoods));
  });

  it('M: luxury and feast demand grows with affluent classes and never alerts as a crisis', () => {
    const poor = resolveGoodsEconomy(snap(baseGoods));
    const rich = resolveGoodsEconomy(snap(baseGoods, [], { classes: { peasants: 500, burghers: 1200, clerics: 300 } }));
    expect(demandOf(rich, 'luxury_clothing', baseGoods)).toBeGreaterThan(demandOf(poor, 'luxury_clothing', baseGoods));
    expect(alertPriority('luxury_clothing', 0)).toBe('info');
    expect(alertPriority('variety', 0)).toBe('info');
    expect(alertPriority('drinking_water', 0.4)).toBe('P0');
    expect(alertPriority('tools', 0.6)).toBe('P2');
    expect(alertPriority('tools', 1)).toBe('none');
    expect(alertPriority('military_supply', 0.5, { activeSystem: false })).toBe('none');
  });

  it('O: industrial intermediates get demand from recipes, never from population', () => {
    const r = resolveGoodsEconomy(snap(baseGoods, [producer('mine', 'ore', 10)]));
    expect(r.balances.find(b => b.good === 'ore')!.demand).toBe(0);
    const chainGoods = [...baseGoods, good('ingot', 'tools')];
    const chained = resolveGoodsEconomy(snap(chainGoods,
      [producer('mine', 'ore', 10), producer('forge', 'ingot', 10, [{ good: 'ore', qty: 1 }])]));
    expect(chained.balances.find(b => b.good === 'ore')!.consumed_as_input).toBeGreaterThan(0);
  });

  it('Q: every demand component sums exactly to the canonical demand', () => {
    const r = resolveGoodsEconomy(snap(baseGoods, [producer('mine', 'ore', 10)], { soldiers: 50, admin: 2, constructionProjects: 1 }));
    for (const row of r.demand) {
      const b = r.balances.find(x => x.city === row.city && x.good === row.good)!;
      expect(channelTotal(row.channels)).toBeCloseTo(b.demand, 9);
    }
    const tools = r.demand.find(d => d.good === 'hoe')!;
    expect(tools.channels.industrial_operational).toBeGreaterThan(0);
    expect(tools.channels.household_need).toBe(0);
    const water = r.demand.find(d => d.good === 'water')!;
    expect(water.channels.household_need).toBeGreaterThan(0);
  });

  it('R: the demand pass is deterministic and free of side effects', () => {
    const s = snap(baseGoods, [producer('mine', 'ore', 10)], { soldiers: 20 });
    const before = JSON.stringify(s);
    expect(resolveGoodsEconomy(s)).toEqual(resolveGoodsEconomy(s));
    expect(JSON.stringify(s)).toBe(before);
  });

  it('formula unit: population never feeds operational, civic, construction or military channels', () => {
    const input = { weightedPop: 10000, populationRate: 0.01, affluentShare: 0.3, market: 0, toolWear: 0,
      adminWorkers: 0, adminInstitutions: 0, logisticsWorkers: 0, stockVolume: 0, constructionProjects: 0, soldiers: 0 };
    for (const basket of ['tools', 'construction', 'admin_supplies', 'storage_logistics', 'military_supply'])
      expect(channelTotal(basketDemandChannels(basket, input))).toBe(0);
    expect(basketDemandChannels('staple_food', input).household_need).toBeGreaterThan(0);
  });
});
