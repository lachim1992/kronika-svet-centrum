import { describe, it, expect } from 'vitest';
import { villageFootpathFactor, upgradeRuralSettlementReason, RURAL_SETTLEMENT_UPGRADE_COST } from '../../supabase/functions/_shared/ruralSettlement';
import { withVillageTransport, parcelTransport, FOOTPATH_FACTOR, FREIGHT_RECIPES } from '../../supabase/functions/_shared/ruralSites';
import { parcelProducers, type EconomicParcel } from '../../supabase/functions/_shared/parcelEconomy';
import { villageGain } from '../../supabase/functions/_shared/regionalSettlementEconomy';
import { RECIPES } from '../../supabase/functions/_shared/productionCatalog';

const recipes = new Map(RECIPES.map(r => [r.key, { recipe_key: r.key, output_good_key: r.output, output_quantity: r.qty, labor_cost: 1, input_items: r.inputs.map(i => ({ key: i.good, qty: i.qty })) }]));
const terrain = [{ q: 0, r: 0, biome_family: 'forest', is_passable: true }, { q: 1, r: 0, biome_family: 'forest', is_passable: true }, { q: 2, r: 0, biome_family: 'forest', is_passable: true }];
const parcel = (id: string, x: number): EconomicParcel => ({ id, grid_x: x, grid_y: 0, parcel_index: 0, sub_biome: 'clearing', buildable: true, status: 'claimed', city_id: 'P', owner_player: 'Player', capacity_slots: 2 } as any);
const city: any = { id: 'P', owner: 'Player', name: 'P', cell: '0,0', population: 100, classes: { peasants: 100 }, soldiers: 0, stability: 0.65, irrigation: 0, labor: {}, market: 1, storage: 10, admin: 0, security: 1, guild: 0, ideology: 'customary_local', coastal: false };
const sites = (id: string) => [{ parcelId: id, recipeKeys: ['fell_timber'], level: 1, owner: 'Player' }];

describe('village economic effect (footpath freight only)', () => {
  it('levels 1/2/3 give 40/55/70 % from a 25 % footpath, never reaching a road', () => {
    expect(villageFootpathFactor(FOOTPATH_FACTOR, 1)).toBeCloseTo(0.40);
    expect(villageFootpathFactor(FOOTPATH_FACTOR, 2)).toBeCloseTo(0.55);
    expect(villageFootpathFactor(FOOTPATH_FACTOR, 3)).toBeCloseTo(0.70);
    expect(villageFootpathFactor(FOOTPATH_FACTOR, 9)).toBeCloseTo(0.70);
  });
  it('a cell with no road stays blocked; road and local stay 1; foreign village has no effect', () => {
    const v = { level: 3, owner: 'Player' };
    expect(withVillageTransport(parcelTransport('2,0', '0,0', []), v, 'Player').factor).toBe(0);
    expect(withVillageTransport(parcelTransport('0,0', '0,0', []), v, 'Player').factor).toBe(1);
    expect(withVillageTransport(parcelTransport('2,0', '0,0', [{ from: '0,0', to: '1,0' }, { from: '1,0', to: '2,0' }]), v, 'Player').factor).toBe(1);
    expect(withVillageTransport(parcelTransport('1,0', '0,0', []), { level: 3, owner: 'AI' }, 'Player').factor).toBe(FOOTPATH_FACTOR);
  });
  it('solver input: village raises only freight capacity of the footpath site, non-freight unchanged', () => {
    const ps = [parcel('a', 1)];
    const none = parcelProducers(ps, terrain, [city], recipes, 1, {}, { sites: sites('a'), roads: [] });
    const lvl1 = parcelProducers(ps, terrain, [city], recipes, 1, {}, { sites: sites('a'), roads: [], villages: new Map([['1,0', { level: 1, owner: 'Player' }]]) });
    expect(lvl1.map(p => p.id)).toEqual(none.map(p => p.id));
    for (const p of none) {
      const q = lvl1.find(x => x.id === p.id)!;
      if (FREIGHT_RECIPES.has(p.recipe.key)) expect(q.capacity).toBeCloseTo(p.capacity * 0.40 / 0.25);
      else expect(q.capacity).toBe(p.capacity);
      expect(q.jobs).toBe(p.jobs); // no extra people or jobs
    }
  });
  it('road-blocked (no road, two cells away) site yields nothing with or without a village', () => {
    const ps = [parcel('a', 1), parcel('b', 2)];
    const v = parcelProducers(ps, terrain, [city], recipes, 1, {}, { sites: sites('b'), roads: [], villages: new Map([['2,0', { level: 3, owner: 'Player' }]]) });
    const n = parcelProducers(ps, terrain, [city], recipes, 1, {}, { sites: sites('b'), roads: [] });
    const freight = (xs: any[]) => xs.filter(p => p.parcel?.id === 'b' && FREIGHT_RECIPES.has(p.recipe.key)).reduce((s, p) => s + p.capacity, 0);
    expect(freight(v)).toBe(0); expect(freight(n)).toBe(0);
  });
  it('attributed gain is the share of realized output above the base footpath factor', () => {
    expect(villageGain([{ realized: 4, parcel: { transport: { applied: 0.4, base_factor: 0.25, village_level: 1 } } }])).toBeCloseTo(1.5);
    expect(villageGain([{ realized: 4, parcel: { transport: { applied: 1, mode: 'road' } } }])).toBe(0);
  });
  it('upgrade rules: owner, one step, max 3; prices are server constants', () => {
    expect(RURAL_SETTLEMENT_UPGRADE_COST).toEqual({ 2: 40, 3: 80 });
    expect(upgradeRuralSettlementReason({ player: 'p', village: { owner_player: 'p', level: 1 }, targetLevel: 2 })).toBeNull();
    expect(upgradeRuralSettlementReason({ player: 'p', village: { owner_player: 'p', level: 1 }, targetLevel: 3 })).not.toBeNull();
    expect(upgradeRuralSettlementReason({ player: 'p', village: { owner_player: 'p', level: 3 }, targetLevel: 4 })).not.toBeNull();
    expect(upgradeRuralSettlementReason({ player: 'q', village: { owner_player: 'p', level: 1 }, targetLevel: 2 })).not.toBeNull();
  });
});
