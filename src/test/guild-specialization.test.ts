import { it, expect } from 'vitest';
import { accrueGuildSpecialization, GUILD_SPECIALIZATION } from '../../supabase/functions/_shared/guildSpecialization';
import type { Producer } from '../../supabase/functions/_shared/goodsEconomy';
const node = { id: 'guild', controlled_by: 'p', production_role: 'guild', guild_level: 1, specialization_scores: {}, specialization_last_turn: 0 };
const producer: Producer = { id: 'guild:variant', node: 'guild', city: 'c', channel: 'node', capacity: 10,
  recipe: { key: 'variant', good: 'wine_luxury', qty: 1, inputs: [{ good: 'raw_grapes', qty: 1 }], labor: 1, quality: 0, minQuality: 0 },
  allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: false, distinctive: true };
const diagnostics = [{ producer: producer.id, good: 'wine_luxury', realized: 3 }];
it('no guild, foreign owner and generic non-node production cannot gain specialization', () => {
  expect(accrueGuildSpecialization({ ...node, production_role: 'processing' }, 'p', 1, [producer], diagnostics)).toBeNull();
  expect(accrueGuildSpecialization(node, 'enemy', 1, [producer], diagnostics)).toBeNull();
  expect(accrueGuildSpecialization(node, 'p', 1, [{ ...producer, node: undefined, channel: 'facility' }], diagnostics)?.specialization_scores).toEqual({});
});
it('only the actual produced good gains, bounded at two points per node per turn', () => {
  const result = accrueGuildSpecialization(node, 'p', 1, [producer], diagnostics);
  expect(result?.specialization_scores).toEqual({ wine_luxury: 2 });
  expect(accrueGuildSpecialization(node, 'p', 1, [producer], [{ ...diagnostics[0], realized: 0 }])?.specialization_scores).toEqual({});
  expect(accrueGuildSpecialization(node, 'p', 1, [producer], [{ ...diagnostics[0], good: 'raw_grain' }])?.specialization_scores).toEqual({});
});
it('retry and older turns cannot gain or decay twice', () => {
  const result = accrueGuildSpecialization(node, 'p', 1, [producer], diagnostics);
  expect(result).not.toBeNull();
  if (!result) return;
  expect(accrueGuildSpecialization({ ...node, ...result }, 'p', 1, [producer], diagnostics)).toBeNull();
  expect(accrueGuildSpecialization({ ...node, ...result }, 'p', 0, [producer], diagnostics)).toBeNull();
});
it('idle guild decays once by 1%; cap is per node and existing 10/30/60/100 thresholds progress', () => {
  expect(accrueGuildSpecialization({ ...node, specialization_scores: { wine_luxury: 10 } }, 'p', 1, [], [])?.specialization_scores.wine_luxury).toBe(9.9);
  for (const [score, level] of [[10, 2], [30, 3], [60, 4], [100, 5]]) {
    const r = accrueGuildSpecialization({ ...node, specialization_scores: { wine_luxury: (score - 2) / GUILD_SPECIALIZATION.decay } }, 'p', 1, [producer], diagnostics);
    expect(r?.guild_level).toBe(level);
  }
  const capped = accrueGuildSpecialization({ ...node, specialization_scores: { a: 100, b: 100 } }, 'p', 1, [producer], diagnostics);
  expect(Object.values(capped?.specialization_scores ?? {}).reduce((sum, v) => sum + v, 0)).toBeCloseTo(100);
});