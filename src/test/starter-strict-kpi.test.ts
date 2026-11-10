import { describe, it, expect } from 'vitest';
import { resolveGoodsEconomy, produced, type Good, type City, type Producer, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';
import { RECIPES, GOODS } from '../../supabase/functions/_shared/productionCatalog';
import { starterBundle, starterEffects, starterReserveFor } from '../../supabase/functions/_shared/starterEconomy';

// STRICT starter KPIs (no shock): first 5 turns food & water = 100 %, fuel ≥ 80 %, player (5 nodes) and AI.
const STORABLE = new Set(['raw_grain', 'peat', 'charcoal', 'raw_timber']);
const KEYS = ['raw_grain', 'raw_fish', 'well_water', 'peat', 'raw_timber'].filter(k => GOODS.some(g => g.key === k));
const goodOf = (key: string): Good => { const c = GOODS.find(g => g.key === key)!;
  return { key, basket: c.basket, price: 1, stage: c.stage as any, storable: STORABLE.has(key), bulk: 1, density: 30, perishability: STORABLE.has(key) ? 0 : 1,
    storageLoss: 0, storageCost: 0, substitutability: 1, strategic: 0, prestige: 0, transshipment: 0, finalUse: c.finalUse, household: (c as any).household } as any; };
const town = (id: string, owner: string, coastal: boolean): City => ({ id, owner, name: id, cell: `${id.length},0`, population: 100, classes: { peasants: 100 }, soldiers: 0,
  stability: 0.65, irrigation: 0, labor: {}, market: 1, storage: 10, admin: 0, security: 1, guild: 0, ideology: 'customary_local', coastal });
const prod = (id: string, city: string, key: string, capacity: number, jobs: number): Producer => { const r = RECIPES.find(x => x.key === key)!;
  return { id, city, channel: 'facility', capacity, jobs, recipe: { key, good: r.output, qty: r.qty, inputs: r.inputs as any, labor: 1 / ECONOMY.workersPerLaborUnit, quality: 0, minQuality: 0 },
    allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: r.inputs.length === 0, distinctive: false }; };
const starter = (id: string, coastal: boolean, fuel: boolean, nodes: number) => [
  ...starterBundle(coastal, fuel).flatMap(c => { const e: any = starterEffects(c, 100);
    return (e.recipe_keys || []).map((k: string) => prod(`${id}:${k}`, id, k, Object.values(e.basket_outputs)[0] as number, e.jobs_capacity)); }),
  ...Array.from({ length: nodes }, (_, i) => prod(`${id}:node${i}`, id, 'fell_timber', 7, 100))];
const cov = (r: any, c: string, b: string) => { const bs = r.balances.filter((x: any) => x.city === c && goodOf(x.good).basket === b);
  const d = bs.reduce((s: number, x: any) => s + x.demand, 0), u = bs.reduce((s: number, x: any) => s + x.unmet_demand, 0); return d > 0 ? 1 - u / d : 1; };

const BIOMES = [{ name: 'coastal', coastal: true, fuel: true }, { name: 'inland river', coastal: false, fuel: true }, { name: 'wetland', coastal: true, fuel: true }];
import { isHabitableStart } from '../../supabase/functions/_shared/terrain';
describe('start without biome-legal fuel is an invalid start, not magic fuel', () => {
  it('desert/arid hexes are rejected even next to water', () => {
    const h = (b: string, extra: any = {}) => ({ q: 0, r: 0, biomeFamily: b, isPassable: true, coastal: false, hasRiver: false, ...extra }) as any;
    expect(isHabitableStart(h('desert', { coastal: true }), new Map())).toBe(false);
    expect(isHabitableStart(h('arid', { coastal: true }), new Map())).toBe(false);
  });
});
describe('strict starter KPIs, first 5 turns', () => {
  for (const b of BIOMES) it(`${b.name}: food=100 %, water=100 %, fuel ≥80 %, player+5 nodes and AI`, () => {
    let snap: Snapshot = { turn: 1, goods: KEYS.map(goodOf), edges: [], fame: [], cities: [town('player', 'P', b.coastal), town('ai', 'AI', b.coastal)],
      producers: [...starter('player', b.coastal, b.fuel, 5), ...starter('ai', b.coastal, b.fuel, 0)],
      opening: ['player', 'ai'].flatMap(city => Object.entries(starterReserveFor(100, b.fuel)).filter(([g]) => KEYS.includes(g)).map(([good, qty]) => ({ city, good, qty, quality: 1 }))) };
    for (let t = 0; t < 5; t++) {
      const r = resolveGoodsEconomy(snap);
      for (const x of r.balances) expect(x.opening + produced(x) + x.imported).toBeCloseTo(x.consumed_household + x.consumed_state + x.consumed_as_input + x.exported + x.stored + x.capex + x.lost_spoilage, 6);
      for (const c of ['player', 'ai']) {
        expect(cov(r, c, 'staple_food'), `${c} food t${t + 1}`).toBeGreaterThanOrEqual(0.999);
        expect(cov(r, c, 'drinking_water'), `${c} water t${t + 1}`).toBeGreaterThanOrEqual(0.999);
        expect(cov(r, c, 'fuel'), `${c} fuel t${t + 1}`).toBeGreaterThanOrEqual(0.8);
      }
      snap = { ...snap, turn: snap.turn + 1, opening: r.balances.filter(x => x.stored > 0).map(x => ({ city: x.city, good: x.good, qty: x.stored, quality: x.quality })) };
    }
  });
});
