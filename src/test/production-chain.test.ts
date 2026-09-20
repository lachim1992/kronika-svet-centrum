/**
 * Economy Integrity: physical production chain.
 *
 * Guards that every catalog good is producible by a real player-buildable structure,
 * that structures only run the recipes they explicitly declare, and that raw/processed
 * intermediates travel through the ONE canonical trade/route engine as production inputs.
 */
import { describe, it, expect } from 'vitest';
import {
  GOODS, RECIPES, PRODUCTION_BUILDINGS, recipeByKey, goodByKey,
  recipesForLevel, producersOfRecipe, goodReachability, auditProductionCatalog,
} from '../../supabase/functions/_shared/productionCatalog';
import { GOOD_FINAL_USE, GOOD_HOUSEHOLD } from '../../supabase/functions/_shared/economyConfig';
import { runGoodsEconomy } from '../../supabase/functions/_shared/goodsEconomy';

describe('production catalog contract', () => {
  it('passes the static audit (known recipes, matching roles/tags, no orphan structures)', () => {
    expect(auditProductionCatalog()).toEqual([]);
  });

  it('A: every catalog good has a reachable production path from a root source', () => {
    const unreachable = goodReachability().filter((e) => !e.reachable);
    expect(unreachable.map((e) => `${e.good}: ${e.blocker}`)).toEqual([]);
  });

  it('B: no production cycle without a root source', () => {
    const roots = RECIPES.filter((r) => !r.inputs.length);
    expect(roots.length).toBeGreaterThan(0);
    for (const entry of goodReachability()) expect(entry.blocker).not.toBe('production_cycle');
  });

  it('C: each declared building recipe exists and its role/tags match the recipe', () => {
    for (const b of PRODUCTION_BUILDINGS) {
      for (const key of b.levels.flat()) {
        const recipe = recipeByKey.get(key);
        expect(recipe, `${b.name} -> ${key}`).toBeTruthy();
        expect(b.roles, `${b.name} role for ${key}`).toContain(recipe!.role);
        for (const tag of recipe!.tags) expect(b.tags, `${b.name} tag for ${key}`).toContain(tag);
      }
    }
  });

  it('D: source/processing structures cannot silently do unrelated work', () => {
    const farm = recipesForLevel(PRODUCTION_BUILDINGS.find((b) => b.name === 'Farma')!, 3);
    expect(farm).not.toContain('mill_grain');
    expect(farm).not.toContain('bake_staples');
    expect(farm).not.toContain('preserve_food');

    const mine = recipesForLevel(PRODUCTION_BUILDINGS.find((b) => b.name === 'Důl')!, 3);
    expect(mine).not.toContain('smelt_iron');
    expect(mine).not.toContain('forge_tools');

    // Pila processes timber, it never creates it.
    const saw = recipeByKey.get('saw_timber')!;
    expect(saw.inputs.some((i) => i.good === 'raw_timber')).toBe(true);
    expect(producersOfRecipe('fell_timber').map((p) => p.building)).not.toContain('Pila');

    // Military/cultural buildings are not in the production catalog at all.
    for (const b of PRODUCTION_BUILDINGS) {
      expect(['economic', 'infrastructure']).toContain(b.category);
    }
  });

  it('luxury/guild recipes are reachable through master structures', () => {
    for (const key of ['build_luxury', 'prepare_feast', 'forge_fine_arms', 'craft_jewelry', 'craft_ritual', 'embroider_fine', 'age_wine']) {
      expect(producersOfRecipe(key).length, key).toBeGreaterThan(0);
    }
  });

  it('industrial intermediates are not household final-use goods', () => {
    for (const key of ['raw_ore', 'raw_timber', 'raw_stone', 'raw_fiber', 'raw_hide', 'flour', 'yarn', 'leather', 'iron_ingot', 'copper_ingot']) {
      expect(GOOD_FINAL_USE[key], key).toBe(false);
      expect(GOOD_HOUSEHOLD[key], key).toBe(false);
      expect(goodByKey.get(key)!.finalUse, key).toBe(false);
    }
    // deliberate decisions
    expect(GOOD_FINAL_USE.raw_fish).toBe(true);
    expect(GOOD_FINAL_USE.raw_meat).toBe(true);
    expect(GOOD_FINAL_USE.raw_olives).toBe(false);
    expect(GOOD_FINAL_USE.raw_grapes).toBe(false);
  });

  it('gather_incense produces incense, not ore', () => {
    expect(recipeByKey.get('gather_incense')!.output).toBe('raw_incense');
    expect(recipeByKey.get('craft_ritual')!.inputs.map((i) => i.good)).toContain('raw_incense');
    expect(GOODS.some((g) => g.key === 'raw_incense')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Long-distance industrial input trade through the canonical route engine.
// ---------------------------------------------------------------------------

const good = (key: string, basket: string, price: number): Good => ({
  key, basket, price, stage: 'intermediate', storable: true, bulk: 1, density: 30, perishability: 0,
  storageLoss: 0, storageCost: 0, substitutability: 1, strategic: 0, prestige: 0, transshipment: 0,
});
const city = (id: string, x: number, market = 0): City => ({
  id, owner: 'p', name: id, cell: `${x},0`, population: 1000, classes: { peasants: 1000 }, soldiers: 0,
  stability: 1, irrigation: 0, labor: {}, market, storage: 10, admin: 0, security: 1, guild: 0,
  ideology: 'open_merchant', coastal: false,
});
const producer = (id: string, c: string, g: string, capacity = 10, inputs: { good: string; qty: number }[] = []): Producer => ({
  id, city: c, channel: 'node', capacity, recipe: { key: id, good: g, qty: 1, inputs, labor: 1, quality: 0, minQuality: 0 },
  allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: inputs.length === 0, distinctive: false,
});

/**
 * farm -> its own nearby regional hub, mill city far away on its own hub.
 * The mill therefore has NO local/hub sibling holding grain and must reach the
 * distant farming region through the canonical route graph.
 */
function scenario(blockRoute = false): Snapshot {
  return {
    turn: 1,
    cities: [city('farm', 0), city('farmhub', 1, 2), city('millcity', 9, 3)],
    goods: [good('raw_grain', 'staple_food', 4), good('flour', 'staple_food', 9)],
    producers: [producer('harvest_wheat', 'farm', 'raw_grain', 400),
                producer('mill_grain', 'millcity', 'flour', 200, [{ good: 'raw_grain', qty: 1 }])],
    edges: [
      { id: 'r1', from: '0,0', to: '1,0', cost: 1, capacity: 500, mode: 'road', risk: 0, toll: 0, border: 0 },
      { id: 'r2', from: '1,0', to: '9,0', cost: 2, capacity: blockRoute ? 0 : 500, mode: 'road', risk: 0, toll: 0, border: 0 },
    ],
    opening: [], fame: [],
  };
}

describe('raw & processed goods trade as industrial inputs', () => {
  it('E/H: a distant mill imports raw_grain as a production_input flow on the canonical graph', () => {
    const out = resolveGoodsEconomy(scenario());
    const input = out.flows.filter((f) => f.reason === 'production_input' && f.good === 'raw_grain' && f.to === 'millcity');
    expect(input.length).toBeGreaterThan(0);
    expect(input[0].qty).toBeGreaterThan(0);
    const flour = out.balances.find((b) => b.city === 'millcity' && b.good === 'flour')!;
    expect(produced(flour)).toBeGreaterThan(0);
  });

  it('G: blocking the only route prevents the industrial input trade and the dependent production', () => {
    const out = resolveGoodsEconomy(scenario(true));
    expect(out.flows.filter((f) => f.reason === 'production_input' && f.to === 'millcity')).toHaveLength(0);
    const flour = out.balances.find((b) => b.city === 'millcity' && b.good === 'flour');
    expect(flour ? produced(flour) : 0).toBe(0);
  });
});
