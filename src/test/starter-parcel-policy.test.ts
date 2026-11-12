import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { suppressStarterLandExtraction } from '../../supabase/functions/_shared/starterParcelPolicy';
import { STARTER_FISHERY, STARTER_RIVER_WATER, STARTER_HUNT, starterEffects } from '../../supabase/functions/_shared/starterEconomy';

describe('founded infrastructure survives parcel-mode integration', () => {
  it('keeps a staffed fishery and river intake as explicit building producers', () => {
    expect(suppressStarterLandExtraction(STARTER_FISHERY.recipeKeys)).toBe(false);
    expect(suppressStarterLandExtraction(STARTER_RIVER_WATER.recipeKeys)).toBe(false);
    expect(starterEffects(STARTER_FISHERY, 1000).jobs_capacity).toBeGreaterThan(0);
    expect(starterEffects(STARTER_RIVER_WATER, 1000).jobs_capacity).toBeGreaterThan(0);
  });
  it('still replaces wild hunting and peat gathering by the land-based model', () => {
    expect(suppressStarterLandExtraction(STARTER_HUNT.recipeKeys)).toBe(true);
    expect(suppressStarterLandExtraction(['cut_peat'])).toBe(true);
    expect(suppressStarterLandExtraction([])).toBe(false);
    expect(suppressStarterLandExtraction(null)).toBe(false);
  });
  it('adapter applies the shared source policy rather than removing all starter fisheries', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/_shared/economyAdapter.ts'), 'utf8');
    expect(src).toContain('suppressStarterLandExtraction(b.effects?.recipe_keys)');
    expect(src).not.toMatch(/\['hunt_game','catch_fish','cut_peat','draw_river_water'\]/);
  });
});
