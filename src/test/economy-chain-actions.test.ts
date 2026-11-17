import { describe, expect, it } from 'vitest';
import { RECIPES, PRODUCTION_BUILDINGS } from '../../supabase/functions/_shared/productionCatalog';

const recipe = (key: string) => {
  const found = RECIPES.find((r) => r.key === key);
  if (!found) throw new Error(`Missing recipe: ${key}`);
  return found;
};
const inputs = (key: string) => Object.fromEntries(recipe(key).inputs.map((i) => [i.good, i.qty]));
const hasBuilding = (name: string, key: string) =>
  PRODUCTION_BUILDINGS.some((b) => b.name === name && b.levels.some((level) => level.includes(key)));

describe('Chronicle iron tools chain – catalogue integration smoke', () => {
  it('maps mine, smelter and smith to real production structures', () => {
    expect(hasBuilding('Důl', 'mine_iron')).toBe(true);
    expect(hasBuilding('Huť', 'smelt_iron')).toBe(true);
    expect(hasBuilding('Kovárna', 'forge_tools')).toBe(true);
  });

  it('balances one full recipe batch without creating intermediate goods', () => {
    const ore = recipe('mine_iron');
    const ingot = recipe('smelt_iron');
    const tools = recipe('forge_tools');
    expect(ore.output).toBe('raw_ore');
    expect(ore.qty).toBe(2);
    expect(inputs('smelt_iron')).toEqual({ raw_ore: 2 });
    expect(ingot.output).toBe('iron_ingot');
    expect(ingot.qty).toBe(1);
    expect(inputs('forge_tools')).toEqual({ iron_ingot: 1, lumber: 1 });
    expect(tools.output).toBe('metalwork_tools');
    expect(tools.qty).toBe(2);
    const stock = { raw_ore: 0, iron_ingot: 0, lumber: 1, metalwork_tools: 0 };
    stock.raw_ore += ore.qty;
    stock.raw_ore -= inputs('smelt_iron').raw_ore;
    stock.iron_ingot += ingot.qty;
    stock.iron_ingot -= inputs('forge_tools').iron_ingot;
    stock.lumber -= inputs('forge_tools').lumber;
    stock.metalwork_tools += tools.qty;
    expect(stock).toEqual({ raw_ore: 0, iron_ingot: 0, lumber: 0, metalwork_tools: 2 });
  });

  it('flags cross-metal ore fungibility (known model defect)', () => {
    // The assertion intentionally documents a known defect. Remove .fails when the
    // catalogue distinguishes ore types; the CI will then force updating this test.
    expect(recipe('mine_iron').output).toBe(recipe('mine_copper').output);
    expect(recipe('mine_iron').output).toBe(recipe('mine_gold').output);
    expect(inputs('smelt_iron')).toEqual(inputs('smelt_copper'));
  });
});


describe('Recipe-driven turn-by-turn stock simulation', () => {
  const simulate = (initial: Record<string, number>, stages: string[], staffing = 1) => {
    const stock: Record<string, number> = { ...initial };
    const history: Array<{ recipe: string; produced: number; stock: Record<string, number> }> = [];
    for (const key of stages) {
      const r = recipe(key);
      const batches = Math.min(staffing, ...r.inputs.filter(i => i.kind !== 'factor').map(i => (stock[i.good] || 0) / i.qty));
      const produced = Math.max(0, batches) * r.qty;
      for (const input of r.inputs.filter(i => i.kind !== 'factor')) {
        stock[input.good] = (stock[input.good] || 0) - batches * input.qty;
      }
      stock[r.output] = (stock[r.output] || 0) + produced;
      history.push({ recipe: key, produced, stock: { ...stock } });
    }
    return { stock, history };
  };

  it('makes two tools after extraction, smelting, lumber supply and smithing', () => {
    const result = simulate({ lumber: 1 }, ['mine_iron', 'smelt_iron', 'forge_tools']);
    expect(result.history.map(h => h.produced)).toEqual([2, 1, 2]);
    expect(result.stock.metalwork_tools).toBe(2);
    expect(result.stock.raw_ore).toBe(0);
    expect(result.stock.iron_ingot).toBe(0);
  });

  it('blocks smithing without lumber, retaining its ingot', () => {
    const result = simulate({}, ['mine_iron', 'smelt_iron', 'forge_tools']);
    expect(result.stock.metalwork_tools).toBe(0);
    expect(result.stock.iron_ingot).toBe(1);
  });

  it('limits all downstream output under 50 percent staffing', () => {
    const result = simulate({ lumber: 1 }, ['mine_iron', 'smelt_iron', 'forge_tools'], 0.5);
    expect(result.history.map(h => h.produced)).toEqual([1, 0.5, 1]);
    expect(result.stock.metalwork_tools).toBe(1);
  });
});
