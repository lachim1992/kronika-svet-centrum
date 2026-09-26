/**
 * ECONOMY CLOSURE HARDENING — production contract normalization + catalogue audit.
 * Guards the ONE legacy drift we repair (zero-input extraction became 'source') and proves that
 * nothing else can gain a source role, so goods can never appear from nothing.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeProductionContract,
  normalizeStructureRoles,
  auditProductionContracts,
  isZeroInputSource,
} from '../../supabase/functions/_shared/productionContract.ts';

const drawWater = { recipe_key: 'draw_water', required_role: 'source', input_items: [], output_good_key: 'drinking_water' };
const bakeBread = { recipe_key: 'bake_bread', required_role: 'producer', input_items: [{ good_key: 'grain', qty: 2 }], required_tags: ['bakery'], output_good_key: 'baked_staples' };
const recipes = [drawWater, bakeBread];

describe('normalizeProductionContract', () => {
  it('gives a legacy well the canonical source role and drops the stale producer role', () => {
    const r = normalizeProductionContract({ recipe_keys: ['draw_water'], production_roles: ['producer'] }, recipes);
    expect(r.changed).toBe(true);
    expect(r.effects.production_roles).toEqual(['source']);
  });

  it('keeps producer for a mixed structure but adds source', () => {
    const r = normalizeProductionContract({ recipe_keys: ['draw_water', 'bake_bread'], production_roles: ['producer'] }, recipes);
    expect(r.effects.production_roles.sort()).toEqual(['producer', 'source']);
  });

  it('never grants source to a structure whose recipes all consume inputs', () => {
    const r = normalizeProductionContract({ recipe_keys: ['bake_bread'], production_roles: ['producer'] }, recipes);
    expect(r.changed).toBe(false);
    expect(r.effects.production_roles).toEqual(['producer']);
  });

  it('is idempotent and reports unknown recipes without changing the whitelist', () => {
    const once = normalizeProductionContract({ recipe_keys: ['draw_water', 'ghost'], production_roles: ['producer'] }, recipes);
    const twice = normalizeProductionContract(once.effects, recipes);
    expect(twice.changed).toBe(false);
    expect(once.notes).toContain('unknown_recipe:ghost');
    expect(once.effects.recipe_keys).toEqual(['draw_water', 'ghost']);
  });

  it('leaves contracts without a whitelist untouched', () => {
    const effects = { capability_tags: ['water'] };
    expect(normalizeProductionContract(effects, recipes).effects).toBe(effects);
  });

  it('keeps the legacy role-list helper behaviour', () => {
    expect(normalizeStructureRoles(['producer'], [drawWater], r => r.required_role)).toEqual(['producer', 'source']);
    expect(normalizeStructureRoles(['producer'], [bakeBread], r => r.required_role)).toEqual(['producer']);
    expect(isZeroInputSource(drawWater)).toBe(true);
    expect(isZeroInputSource(bakeBread)).toBe(false);
  });
});

describe('auditProductionContracts', () => {
  const template = (over: any = {}) => ({
    name: 'Pekárna', required_settlement_level: 'TOWNSHIP',
    effects: { recipe_keys: ['bake_bread'], production_roles: ['producer'], capability_tags: ['bakery'] }, ...over,
  });

  it('accepts a consistent catalogue', () => {
    expect(auditProductionContracts({ recipes, templates: [template()] })).toEqual([]);
  });

  it('flags a zero-input recipe that is not declared a source', () => {
    const bad = { recipe_key: 'free_iron', required_role: 'producer', input_items: [] };
    const f = auditProductionContracts({ recipes: [...recipes, bad], templates: [] });
    expect(f.some(x => x.scope === 'recipe' && x.id === 'free_iron')).toBe(true);
  });

  it('honours documented zero-input exceptions', () => {
    const bad = { recipe_key: 'free_iron', required_role: 'producer', input_items: [] };
    expect(auditProductionContracts({ recipes: [bad], templates: [], zeroInputExceptions: ['free_iron'] })).toEqual([]);
  });

  it('flags unknown settlement tiers, unknown recipes, wrong roles and missing tags', () => {
    const f = auditProductionContracts({
      recipes,
      templates: [
        template({ required_settlement_level: 'METROPOLIS' }),
        template({ name: 'Ghost', effects: { recipe_keys: ['ghost'], production_roles: ['producer'], capability_tags: [] } }),
        template({ name: 'ZlyRole', effects: { recipe_keys: ['bake_bread'], production_roles: ['trade'], capability_tags: ['bakery'] } }),
        template({ name: 'ChybiTag', effects: { recipe_keys: ['need_tag'], production_roles: ['producer'], capability_tags: [] } }),
      ],
    } as any);
    const issues = f.map(x => `${x.id}:${x.issue}`).join('|');
    expect(issues).toContain('METROPOLIS');
    expect(issues).toContain('unknown recipe ghost');
    expect(issues).toContain('needs role producer');
  });

  it('audits already standing city buildings too', () => {
    const f = auditProductionContracts({
      recipes, templates: [],
      buildings: [{ name: 'Stará pekárna', effects: { recipe_keys: ['bake_bread'], production_roles: ['producer'], capability_tags: [] } }],
    });
    expect(f.some(x => x.scope === 'building' && x.issue.includes('tags'))).toBe(true);
  });

  it('does not flag a legacy well, because normalization repairs it', () => {
    const f = auditProductionContracts({
      recipes, templates: [],
      buildings: [{ name: 'Studna', effects: { recipe_keys: ['draw_water'], production_roles: ['producer'], capability_tags: [] } }],
    });
    expect(f).toEqual([]);
  });
});
