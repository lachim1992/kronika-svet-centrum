import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  normalizePopulationClasses,
  applyPopulationLoss,
  POPULATION_FLOOR,
  applyPopulationTransfer,
} from '../../supabase/functions/_shared/demographics.ts';
import { computeSettlementGrowth } from '../../supabase/functions/_shared/physics.ts';

const fn = (rel: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../supabase/functions', rel), 'utf8');

const city = (total: number, split = [0.7, 0.2, 0.06, 0.04]) => ({
  id: 'c1',
  name: 'Testov',
  status: 'ok',
  population_total: total,
  population_peasants: Math.round(total * split[0]),
  population_burghers: Math.round(total * split[1]),
  population_clerics: Math.round(total * split[2]),
  population_warriors: Math.round(total * split[3]),
  city_stability: 60,
  development_level: 3,
  food_surplus: 10,
  housing_capacity: total * 2,
});

const sum = (s: any) =>
  s.population_peasants + s.population_burghers + s.population_clerics + s.population_warriors;

describe('Phase A — population class invariant', () => {
  it('normalization keeps total === sum(classes)', () => {
    for (const total of [50, 137, 1000, 9909, 36684]) {
      const s = normalizePopulationClasses(total, city(1000));
      expect(s.population_total).toBe(total);
      expect(sum(s)).toBe(total);
    }
  });

  it('losses keep total === sum(classes)', () => {
    for (const loss of [0, 1, 37, 500, 99999]) {
      const s = applyPopulationLoss(city(1000), loss);
      expect(sum(s)).toBe(s.population_total);
      expect(s.population_total).toBeGreaterThanOrEqual(POPULATION_FLOOR);
    }
  });

  it('never produces negative population', () => {
    const s = applyPopulationLoss(city(120), 100000);
    expect(s.population_total).toBe(POPULATION_FLOOR);
    for (const k of ['peasants', 'burghers', 'clerics', 'warriors']) {
      expect((s as any)[`population_${k}`]).toBeGreaterThanOrEqual(0);
    }
  });

  it('canonical growth output normalizes into consistent classes', () => {
    const c = city(5000);
    const g = computeSettlementGrowth(c as any, { growthModifier: 0.01 });
    const s = normalizePopulationClasses(Math.max(POPULATION_FLOOR, g.newPop), c);
    expect(sum(s)).toBe(s.population_total);
  });

  it('growth is deterministic for the same state', () => {
    const a = computeSettlementGrowth(city(5000) as any, { growthModifier: 0.01 });
    const b = computeSettlementGrowth(city(5000) as any, { growthModifier: 0.01 });
    expect(a).toEqual(b);
  });

  it('growthModifier replaces the hasTrade carrier', () => {
    const src = fn('_shared/physics.ts');
    expect(src).toContain('growthModifier');
    const calm = { ...city(10000), city_stability: 50 };
    const base = computeSettlementGrowth(calm as any, {});
    const boosted = computeSettlementGrowth(calm as any, { growthModifier: 0.02 });
    expect(boosted.newPop).toBeGreaterThan(base.newPop);
  });
});

describe('Phase A — single canonical population writer', () => {
  it('process-turn does not write city population columns', () => {
    const src = fn('process-turn/index.ts');
    // Only the famine loss path may mention population columns, and it must go
    // through the shared helper.
    expect(src).toContain('applyPopulationLoss');
    expect(src).not.toMatch(/popGrowthMod/);
    expect(src).not.toMatch(/updates\.population_total/);
  });

  it('commit-turn uses the shared demographic helpers', () => {
    const src = fn('commit-turn/index.ts');
    expect(src).toContain('normalizePopulationClasses');
    expect(src).toContain('applyPopulationLoss');
    expect(src).toContain('growthModifier: growthBonus');
    expect(src).not.toContain('distributePopLayers');
  });

  it('world-layer-tick has no population writer and no stale schema reads', () => {
    const src = fn('world-layer-tick/index.ts');
    expect(src).not.toMatch(/basket_kind/);
    expect(src).not.toMatch(/fulfillment_ratio/);
    expect(src).not.toMatch(/hex_q/);
    expect(src).not.toMatch(/update\([^)]*population/);
  });

  it('derived economy recompute never touches population or fiscal state', () => {
    for (const f of [
      'refresh-economy/index.ts',
      'compute-trade-flows/index.ts',
      'compute-economy-flow/index.ts',
    ]) {
      const src = fn(f);
      expect(src).not.toMatch(/population_total\s*[:=]/);
      expect(src).not.toMatch(/gold_reserve\s*:/);
    }
  });
});

describe('Phase A residue — conserving transfers and guarded paths', () => {
  it('transfer moves exactly as many people as it removes', () => {
    const src = city(5000);
    const dst = city(2000);
    for (const req of [0, 1, 250, 100000]) {
      const t = applyPopulationTransfer(src, dst, req);
      const before = src.population_total + dst.population_total;
      const after = t.source.population_total + t.destination.population_total;
      expect(after).toBe(before);
      expect(t.source.population_total).toBe(src.population_total - t.moved);
      expect(t.destination.population_total).toBe(dst.population_total + t.moved);
      expect(sum(t.source)).toBe(t.source.population_total);
      expect(sum(t.destination)).toBe(t.destination.population_total);
      expect(t.source.population_total).toBeGreaterThanOrEqual(POPULATION_FLOOR);
    }
  });

  it('transfer is capped by the source population above the floor', () => {
    const t = applyPopulationTransfer(city(60), city(1000), 10_000);
    expect(t.moved).toBe(10);
    expect(t.source.population_total).toBe(POPULATION_FLOOR);
  });

  it('the time-based world-tick / process-tick loop no longer exists', () => {
    // Phase 4: persistent real-time mode abandoned. Turn resolution has exactly
    // one population writer (commit-turn).
    const fnDir = path.resolve(__dirname, '../../supabase/functions');
    expect(fs.existsSync(path.join(fnDir, 'world-tick/index.ts'))).toBe(false);
    expect(fs.existsSync(path.join(fnDir, 'process-tick/index.ts'))).toBe(false);
    const src = fn('commit-turn/index.ts');
    expect(src).toContain('normalizePopulationClasses');
    expect(src).toContain('computeIntercityMigration');
    expect(src).not.toContain('distributePopLayers');
  });

  it('resolve-battle and command-dispatch losses use the shared helper', () => {
    for (const f of ['resolve-battle/index.ts', 'command-dispatch/index.ts']) {
      const src = fn(f);
      expect(src).toContain('applyPopulationLoss');
      expect(src).not.toMatch(/population_peasants: Math\.max\(\d+,/);
    }
  });

  it('founding still carries the explicit Phase C conservation TODO', () => {
    const src = fn('command-dispatch/index.ts');
    expect(src).toContain('PHASE C TODO');
    expect(src).toMatch(/rural population/i);
  });
});
