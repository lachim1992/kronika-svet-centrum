import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FOUNDING_HAMLET_POPULATION, foundingHamletPopulation } from '../../supabase/functions/_shared/foundingPopulation';

const readCommand = () =>
  fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/command-dispatch/index.ts'), 'utf8');

describe('new town founding matches physical parcel economy', () => {
  it('founding a small hamlet does not spawn one thousand people on six parcels', () => {
    const first = foundingHamletPopulation();
    expect(FOUNDING_HAMLET_POPULATION).toBe(100);
    expect(first.population_total).toBe(100);
    expect(first.population_peasants + first.population_burghers + first.population_clerics + first.population_warriors).toBe(first.population_total);
    expect(Object.values(first).every(Number.isFinite)).toBe(true);
  });

  it('command dispatch uses one founding population for city and claimed parcel footprint', () => {
    const source = readCommand();
    const start = source.indexOf('async function executeFoundCity(');
    const end = source.indexOf('async function ', start + 12);
    expect(start).toBeGreaterThan(0);
    const founding = source.slice(start, end > start ? end : undefined);
    expect(founding).toContain('...foundingHamletPopulation()');
    expect(founding).toContain('population: FOUNDING_HAMLET_POPULATION');
    expect(founding).not.toMatch(/population_total:\\s*1000|population:\\s*1000/);
    // The rural-population transfer is still a separate incomplete invariant.
    expect(founding).toContain('PHASE C TODO');
  });
});
