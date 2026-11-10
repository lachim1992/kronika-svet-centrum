import { describe, it, expect } from 'vitest';
import { resolveGoodsEconomy, produced, type Good, type City, type Producer, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';
import { RECIPES, GOODS } from '../../supabase/functions/_shared/productionCatalog';
import { starterBundle, starterEffects, starterGeography, starterReserveFor, STARTER_HUNT, STARTER_WELL, STARTER_RIVER_WATER, STARTER_FISHERY, STARTER_FARM } from '../../supabase/functions/_shared/starterEconomy';

// Drinking water and wild food follow REAL geography: a river is fresh water, the sea is not;
// hunting needs wild land and stays small; physical goods and labour are conserved.
type Hex = { q: number; r: number; has_river?: boolean; biome_family: string };
const grid = (biome: string, extra: Partial<Hex>[] = []): Hex[] => {
  const out: Hex[] = [];
  for (let q = -1; q <= 1; q++) for (let r = -1; r <= 1; r++) out.push({ q, r, biome_family: biome, has_river: false });
  for (const e of extra) Object.assign(out.find(h => h.q === e.q && h.r === e.r)!, e);
  return out;
};
const names = (hexes: Hex[]) => starterBundle(starterGeography(hexes, 0, 0)).map(c => c.name);

describe('starter geography: water source and wild food', () => {
  it('river town gets a river water intake and no well', () => {
    const n = names(grid('forest', [{ q: 1, r: 0, has_river: true }]));
    expect(n).toContain(STARTER_RIVER_WATER.name);
    expect(n).not.toContain(STARTER_WELL.name);
  });
  it('inland town without a river needs a well', () => {
    const n = names(grid('plains'));
    expect(n).toContain(STARTER_WELL.name);
    expect(n).not.toContain(STARTER_RIVER_WATER.name);
    expect(n).toContain(STARTER_FARM.name);
  });
  it('sea-only town gets fish but no direct drinking water from the sea', () => {
    const n = names(grid('plains', [{ q: 1, r: 0, biome_family: 'sea' }]));
    expect(n).toContain(STARTER_FISHERY.name);
    expect(n).toContain(STARTER_WELL.name);
    expect(n).not.toContain(STARTER_RIVER_WATER.name);
  });
  it('forest allows hunting, desert gives none', () => {
    expect(names(grid('forest'))).toContain(STARTER_HUNT.name);
    expect(names(grid('desert'))).not.toContain(STARTER_HUNT.name);
  });
  it('hunting does not grow with population (no free sustain for big cities)', () => {
    expect(starterEffects(STARTER_HUNT, 4000).basket_outputs).toEqual(starterEffects(STARTER_HUNT, 100).basket_outputs);
    expect(starterEffects(STARTER_HUNT, 100).jobs_capacity).toBeLessThanOrEqual(15);
  });
});

const STORABLE = new Set(['raw_grain', 'peat']);
const KEYS = ['raw_grain', 'raw_fish', 'raw_meat', 'well_water', 'peat'];
const goodOf = (key: string): Good => { const c = GOODS.find(g => g.key === key)!;
  return { key, basket: c.basket, price: 1, stage: c.stage as any, storable: STORABLE.has(key), bulk: 1, density: 30, perishability: STORABLE.has(key) ? 0 : 1,
    storageLoss: 0, storageCost: 0, substitutability: 1, strategic: 0, prestige: 0, transshipment: 0, finalUse: c.finalUse, household: (c as any).household } as any; };
const town = (id: string): City => ({ id, owner: id, name: id, cell: `${id.length},0`, population: 100, classes: { peasants: 100 }, soldiers: 0,
  stability: 0.65, irrigation: 0, labor: {}, market: 1, storage: 10, admin: 0, security: 1, guild: 0, ideology: 'customary_local', coastal: false });
const prod = (id: string, city: string, key: string, capacity: number, jobs: number): Producer => { const r = RECIPES.find(x => x.key === key)!;
  return { id, city, channel: 'facility', capacity, jobs, recipe: { key, good: r.output, qty: r.qty, inputs: r.inputs as any, labor: 1 / ECONOMY.workersPerLaborUnit, quality: 0, minQuality: 0 },
    allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: true, distinctive: false }; };
const cov = (r: any, c: string, b: string) => { const bs = r.balances.filter((x: any) => x.city === c && goodOf(x.good).basket === b);
  const d = bs.reduce((s: number, x: any) => s + x.demand, 0), u = bs.reduce((s: number, x: any) => s + x.unmet_demand, 0); return d > 0 ? 1 - u / d : 1; };

describe('river + hunting hamlet of 100 survives 5 turns without a well', () => {
  it('food & water 100 %, goods and labour conserved, no free production', () => {
    const geo = starterGeography(grid('forest', [{ q: 0, r: 1, has_river: true }]), 0, 0);
    const bundle = starterBundle(geo);
    expect(bundle.map(c => c.name)).not.toContain(STARTER_WELL.name);
    const producers = bundle.flatMap(c => { const e: any = starterEffects(c, 100);
      return (e.recipe_keys || []).map((k: string) => prod(`h:${k}`, 'h', k, Object.values(e.basket_outputs)[0] as number, e.jobs_capacity)); });
    expect(producers.map(p => p.recipe.key)).toEqual(expect.arrayContaining(['catch_fish', 'draw_river_water', 'hunt_game']));
    let snap: Snapshot = { turn: 1, goods: KEYS.map(goodOf), edges: [], fame: [], cities: [town('h')], producers,
      opening: Object.entries(starterReserveFor(100)).map(([good, qty]) => ({ city: 'h', good, qty, quality: 1 })) };
    for (let t = 0; t < 5; t++) {
      const r: any = resolveGoodsEconomy(snap);
      for (const x of r.balances) expect(x.opening + produced(x) + x.imported).toBeCloseTo(x.consumed_household + x.consumed_state + x.consumed_as_input + x.exported + x.stored + x.capex + x.lost_spoilage, 6);
      expect(cov(r, 'h', 'staple_food'), `food t${t + 1}`).toBeGreaterThanOrEqual(0.999);
      expect(cov(r, 'h', 'drinking_water'), `water t${t + 1}`).toBeGreaterThanOrEqual(0.999);
      const water = r.balances.find((x: any) => x.good === 'well_water');
      expect(produced(water)).toBeGreaterThan(0);
      const lab = (r.labor || []).find((l: any) => l.city === 'h');
      if (lab) expect(lab.employed_total).toBeLessThanOrEqual(lab.available_workforce + 1e-6);
      snap = { ...snap, turn: snap.turn + 1, opening: r.balances.filter((x: any) => x.stored > 0).map((x: any) => ({ city: x.city, good: x.good, qty: x.stored, quality: x.quality })) };
    }
  });
});
