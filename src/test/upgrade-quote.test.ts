import { describe, it, expect } from 'vitest';
import { quoteBuildingUpgrade } from '../../supabase/functions/_shared/upgradeValidation';

const tmpl = { id: 't', name: 'Tkalcovna', cost_wealth: 20, cost_wood: 20, cost_stone: 10, cost_iron: 5,
  effects: { recipe_keys: ['weave_basic'], capability_tags: ['weaving'] },
  level_data: [{ level: 1, cost_mult: 1, name: 'Tkalcovna' }, { level: 2, cost_mult: 2, name: 'Velká tkalcovna', effects: { recipe_keys: ['weave_basic', 'weave_fine'] } }, { level: 3, cost_mult: 4, name: 'Tkalcovský cech' }] };
const bld = { id: 'b', name: 'Tkalcovna', current_level: 1, effects: { recipe_keys: ['hacked'] } };

describe('authoritative upgrade quote', () => {
  it('next level: base × multiplier, template name and effects', () => {
    const q: any = quoteBuildingUpgrade(bld, tmpl, 2);
    expect(q.cost_wealth).toBe(40); expect(q.cost_production).toBe(70);
    expect(q.name).toBe('Velká tkalcovna');
    expect(q.effects.recipe_keys).toEqual(['weave_basic', 'weave_fine']);
    expect(q.effects.capability_tags).toEqual(['weaving']);
    expect(q.wonder).toBe(false);
  });
  it('rejects bad multipliers, negative base and missing level', () => {
    expect(quoteBuildingUpgrade(bld, { ...tmpl, level_data: [{ level: 2, cost_mult: 0 }] }, 2)).toMatch(/násobek/);
    expect(quoteBuildingUpgrade(bld, { ...tmpl, level_data: [{ level: 2, cost_mult: NaN }] }, 2)).toMatch(/násobek/);
    expect(quoteBuildingUpgrade(bld, { ...tmpl, cost_wood: -5 }, 2)).toMatch(/cena/);
    expect(quoteBuildingUpgrade(bld, tmpl, 9)).toMatch(/úrovně/);
  });
  it('legacy template-less: stored cost required, cannot add production effects', () => {
    const legacy = { name: 'Chrám', cost_wealth: 10, cost_wood: 5, cost_stone: 0, cost_iron: 0, effects: { faith: 1 },
      level_data: [{ level: 2, cost_mult: 2, effects: { recipe_keys: ['gold_mint'], faith: 2 } }] };
    const q: any = quoteBuildingUpgrade(legacy, null, 2);
    expect(q.cost_wealth).toBe(20); expect(q.cost_production).toBe(10);
    expect(q.effects.recipe_keys).toBeUndefined(); expect(q.effects.faith).toBe(2);
    expect(quoteBuildingUpgrade({ ...legacy, cost_wealth: 0, cost_wood: 0 }, null, 2)).toMatch(/ověřitelné ceny/);
  });
  it('wonder only when level data says so', () => {
    const w: any = quoteBuildingUpgrade(bld, { ...tmpl, level_data: [{ level: 2, cost_mult: 2, is_wonder: true }] }, 2);
    expect(w.wonder).toBe(true);
  });
});
