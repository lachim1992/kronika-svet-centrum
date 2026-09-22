import { describe, it, expect } from 'vitest';
import { starterBundle, starterEffects } from '../../supabase/functions/_shared/starterEconomy';
import { ratedNodeCapacity } from '../../supabase/functions/_shared/nodeCapacity';
import { resolveGoodsEconomy, produced, type Snapshot, type Good } from '../../supabase/functions/_shared/goodsEconomy';
import { GOODS, RECIPES } from '../../supabase/functions/_shared/productionCatalog';

const goods: Good[] = GOODS.map(g => ({ ...g, price: 1, storable: true, bulk: 1, density: 3,
  perishability: 0, storageLoss: 0, storageCost: 0, substitutability: g.key === 'raw_grain' ? 0.3 : 1,
  strategic: 0, prestige: 0, transshipment: 0 }));
function settlement(population: number, water: boolean): Snapshot {
  return { turn: 1, goods, edges: [], opening: [], fame: [], cities: [{
    id: 'city', owner: 'p', name: 'New settlement', cell: '0,0', population,
    classes: { peasants: population * .8, burghers: population * .15, clerics: population * .05 },
    soldiers: 0, stability: .7, irrigation: 0, labor: { farming: .6, crafting: .25, logistics: .1, administration: .05 },
    market: .5, storage: .5, admin: 0, security: .7, guild: 0, ideology: 'customary_local', coastal: water,
  }], producers: starterBundle(water).map(contract => {
    const effect = starterEffects(contract, population), recipe = RECIPES.find(r => r.key === contract.recipeKeys[0])!;
    return { id: contract.name, city: 'city', channel: 'facility', capacity: Object.values(effect.basket_outputs)[0],
      jobs: effect.jobs_capacity, allocation: 1, staffing: 1, logistics: 1, mastery: 1,
      source: recipe.role === 'source' || (recipe.role === 'producer' && goods.find(g => g.key === recipe.output)?.stage === 'raw'), distinctive: false, recipe: { key: recipe.key, good: recipe.output,
        qty: recipe.qty, inputs: recipe.inputs, labor: 1, quality: 0, minQuality: 0 } };
  }) };
}

describe('TEST02 starter economy', () => {
  for (const population of [100, 200, 450, 1000, 4000]) for (const water of [false, true]) {
    it(`feeds and waters ${population} residents (${water ? 'fishery' : 'farm'}) with its own workers`, () => {
      const result = resolveGoodsEconomy(settlement(population, water));
      for (const basket of ['staple_food', 'drinking_water']) {
        const balances = result.balances.filter(b => goods.find(g => g.key === b.good)?.basket === basket);
        expect(balances.reduce((sum, b) => sum + b.unmet_demand, 0)).toBeLessThan(1e-7);
      }
      expect(result.labor[0].employed_total).toBeLessThanOrEqual(result.labor[0].available_workforce);
      for (const b of result.balances) expect(b.opening + produced(b) + b.imported)
        .toBeCloseTo(b.consumed_household + b.consumed_state + b.consumed_as_input + b.exported + b.stored + b.capex + b.lost_spoilage, 7);
    });
  }
  it('restores rated generated sources without reviving inactive or explicitly disabled player structures', () => {
    expect(ratedNodeCapacity({ production_output: 0, production_base: 7 })).toBe(7);
    expect(ratedNodeCapacity({ production_output: 11, production_base: 7 })).toBe(11);
    expect(ratedNodeCapacity({ production_output: 0, production_base: 7, built_by: 'p' })).toBe(0);
    expect(ratedNodeCapacity({ production_output: 4, production_base: 7, is_active: false })).toBe(0);
  });
});
