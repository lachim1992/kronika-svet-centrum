import { it, expect } from 'vitest';
import fixture from './fixtures/parcel-jv72o7-preflight.json';
import { parcelSubsistencePreflight } from '../../supabase/functions/_shared/parcelPreflight';
import { parcelProducers } from '../../supabase/functions/_shared/parcelEconomy';
import { RECIPES } from '../../supabase/functions/_shared/productionCatalog';
import type { Snapshot } from '../../supabase/functions/_shared/goodsEconomy';

const recipes = new Map(RECIPES.map(r => [r.key, { recipe_key: r.key, output_good_key: r.output, output_quantity: r.qty, labor_cost: 1 }]));
const parcels = fixture.parcels.map(p => ({ ...p, id: `preview:${p.grid_x}:${p.grid_y}:${p.parcel_index}` }));
const base = fixture.snapshot as unknown as Snapshot;
const sources = parcelProducers(parcels, fixture.terrain, base.cities, recipes, base.turn);
const baseline = { ...base, producers: [...base.producers.filter(p => !p.parcel), ...sources] };

it('actual JV72O7 five-step preflight keeps food/water 100% and fuel at least 80% for human and AI', () => {
  const before = JSON.stringify(baseline);
  const result = parcelSubsistencePreflight(baseline, parcels, fixture.terrain, recipes);
  expect(result.coverage).toHaveLength(45);
  expect(result.unsafe).toEqual([]);
  for (const b of result.coverage) expect(b.coverage).toBeGreaterThanOrEqual(b.basket === 'fuel' ? 0.8 : 1 - 1e-6);
  expect(parcelSubsistencePreflight(baseline, parcels, fixture.terrain, recipes)).toEqual(result);
  expect(JSON.stringify(baseline)).toBe(before);
});

it('preflight cannot regenerate depleted first-step sources into free food', () => {
  const depleted = { ...baseline, opening: [], producers: baseline.producers.map(p => ({ ...p, capacity: 0 })) };
  const result = parcelSubsistencePreflight(depleted, parcels, fixture.terrain, recipes);
  expect(result.unsafe.some(b => b.step === 1 && b.basket === 'staple_food' && b.coverage === 0)).toBe(true);
});

it('rejects invalid preflight horizons instead of reporting a false safe result', () => {
  for (const steps of [0, -1, 1.5, NaN, Infinity, 201]) {
    expect(() => parcelSubsistencePreflight(baseline, parcels, fixture.terrain, recipes, steps)).toThrow(RangeError);
  }
});


it('20-step isolated parcel replay is deterministic, read-only and covers every city and subsistence basket', () => {
  const originalSnapshot = JSON.stringify(baseline);
  const originalParcels = JSON.stringify(parcels);
  const originalTerrain = JSON.stringify(fixture.terrain);
  const run = parcelSubsistencePreflight(baseline, parcels, fixture.terrain, recipes, 20);
  const expectedSamples = baseline.cities.length * 3 * 20;
  expect(run.coverage).toHaveLength(expectedSamples);
  expect(run.fifth).toHaveLength(baseline.cities.length * 3);
  expect(run.coverage.every(row =>
    Number.isFinite(row.coverage) && row.coverage >= -1e-6 && row.coverage <= 1 + 1e-6
  )).toBe(true);
  expect(run.unsafe).toEqual(run.coverage.filter(row =>
    row.coverage + 1e-6 < (row.basket === 'fuel' ? 0.8 : 1)
  ));
  expect(parcelSubsistencePreflight(baseline, parcels, fixture.terrain, recipes, 20)).toEqual(run);
  expect(JSON.stringify(baseline)).toBe(originalSnapshot);
  expect(JSON.stringify(parcels)).toBe(originalParcels);
  expect(JSON.stringify(fixture.terrain)).toBe(originalTerrain);
});
