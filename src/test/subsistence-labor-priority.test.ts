import { describe, it, expect } from 'vitest';
import { resolveGoodsEconomy, type Good, type City, type Producer, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { autoAllocationDetail } from '../../supabase/functions/_shared/productMarket';
import { foodShortageImpact } from '../../supabase/functions/_shared/foodShortage';
import { starterBundle, starterEffects, STARTER_STORAGE } from '../../supabase/functions/_shared/starterEconomy';

// JV72O7 turn-2 shape: Lambadagrad, 103 people, fishery 30 + well 25 + farm 100 jobs, and
// 5 attached resource nodes × 100 jobs in the SAME farming sector.
const good = (key: string, basket: string, storable = true): Good =>
  ({ key, basket, price: 1, stage: 'raw', storable, bulk: 1, density: 30, perishability: 0, storageLoss: 0,
     storageCost: 0, substitutability: 1, strategic: 0, prestige: 0, transshipment: 0, finalUse: true } as Good);
const city: City = ({ id: 'lamb', owner: 'p', name: 'Lambadagrad', cell: '0,0', population: 103, classes: { peasants: 103 },
  soldiers: 0, stability: 0.53, irrigation: 0, labor: {}, market: 0, storage: 1, admin: 0, security: 0.5, guild: 0,
  ideology: 'open_merchant', coastal: true } as City);
const prod = (id: string, g: string, capacity: number, jobs: number): Producer =>
  ({ id, city: 'lamb', channel: 'facility', capacity, jobs, recipe: { key: id, good: g, qty: 1, inputs: [], labor: 1, quality: 0, minQuality: 0 },
     allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: true, distinctive: false } as Producer);
const snap = (withNodes: boolean): Snapshot => ({
  turn: 2, cities: [city],
  goods: [good('raw_fish', 'staple_food', false), good('raw_grain', 'staple_food'), good('well_water', 'drinking_water', false),
    good('peat', 'fuel'), good('hides', 'fuel')],
  producers: [prod('fishery', 'raw_fish', 7, 30), prod('well', 'well_water', 3, 25), prod('farm', 'raw_grain', 7, 100),
    ...(withNodes ? [0, 1, 2, 3, 4].map(i => prod(`node${i}`, 'hides', 7, 100)) : [])],
  edges: [], opening: [], fame: [],
});
const emp = (r: any, id: string) => r.diagnostics.find((d: any) => d.producer === id)?.labor?.employed ?? 0;
const out = (r: any, id: string) => r.diagnostics.find((d: any) => d.producer === id)?.realized ?? 0;

describe('subsistence labour priority (JV72O7 shape)', () => {
  const r = resolveGoodsEconomy(snap(true));
  const lab = r.labor.find((l: any) => l.city === 'lamb')!;

  it('nobody is counted twice: employed ≤ workforce and ≤ declared jobs', () => {
    expect(lab.employed_total).toBeLessThanOrEqual(lab.available_workforce + 1e-6);
    for (const d of r.diagnostics) expect(d.labor?.employed ?? 0).toBeLessThanOrEqual((d.labor?.jobs_capacity ?? 0) + 1e-6);
    expect(lab.critical_priority_employed).toBeGreaterThan(0);
  });

  it('food and water crews are staffed before nodes, so 500 node jobs no longer starve them', () => {
    const fishStaff = emp(r, 'fishery') / 30, wellStaff = emp(r, 'well') / 25;
    const nodeStaff = emp(r, 'node0') / 100;
    expect(fishStaff + emp(r, 'farm') / 100).toBeGreaterThan(nodeStaff);
    expect(wellStaff).toBeGreaterThan(nodeStaff);
    const food = out(r, 'fishery') + out(r, 'farm'), water = out(r, 'well');
    // household need ≈ 1.05 food / 0.42 water for 103 people
    expect(food).toBeGreaterThan(0.95);
    expect(water).toBeGreaterThan(0.38);
  });

  it('output per worker is unchanged: priority moves people, never productivity', () => {
    const per = (id: string, cap: number, jobs: number) => out(r, id) / Math.max(1e-9, emp(r, id));
    for (const [id, cap, jobs] of [['fishery', 7, 30], ['well', 3, 25]] as const)
      expect(per(id, cap, jobs)).toBeLessThanOrEqual(cap / jobs * 1.0000001);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(resolveGoodsEconomy(snap(true)).labor)).toBe(JSON.stringify(r.labor));
  });
});

describe('AUTO allocation keeps critical need lines alive', () => {
  it('a profitable rival no longer zeroes an essential food line', () => {
    const d = autoAllocationDetail([{ key: 'food', necessity: 1, marginRatio: -0.2, essential: true },
      { key: 'lux', necessity: 1, marginRatio: 0.5 }]);
    expect(d.weights.food).toBeGreaterThan(0);
    const blocked = autoAllocationDetail([{ key: 'food', necessity: 1, marginRatio: -0.2, essential: true, inputsAvailable: false }]);
    expect(blocked.weights.food).toBe(0); // still no phantom goods without inputs
  });
});

describe('food shortage severity', () => {
  it('10 % deficit is rationing, 20 % is famine', () => {
    expect(foodShortageImpact(100, 1, 0.1)).toMatchObject({ famine: false, minor: true, deaths: 0, stabilityLoss: 1 });
    expect(foodShortageImpact(1000, 1, 0.2).famine).toBe(true);
  });
});

describe('starter bundle', () => {
  it('storehouse is a storage service without a lumber recipe; fuel only on fuel land', () => {
    const e = starterEffects(STARTER_STORAGE, 100);
    expect(e.storage_capacity).toBe(1);
    expect(e.recipe_keys).toEqual([]);
    expect(starterBundle(true, true).some(c => c.recipeKeys.includes('cut_peat'))).toBe(true);
    expect(starterBundle(true, false).some(c => c.recipeKeys.includes('cut_peat'))).toBe(false);
  });
});
