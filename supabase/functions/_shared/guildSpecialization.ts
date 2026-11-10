import type { Producer } from './goodsEconomy.ts';

// Bounded experience, not goods, quality or currency. Thresholds retain the existing turn contract.
export const GUILD_SPECIALIZATION = { decay: 0.99, gainPerTurn: 2, cap: 100, thresholds: [0, 10, 30, 60, 100] } as const;
export interface GuildState {
  id: string; controlled_by: string | null; production_role: string | null; guild_level: number | null;
  specialization_scores: unknown; specialization_last_turn?: number | null;
}
export function accrueGuildSpecialization(node: GuildState, player: string, turn: number,
  producers: Producer[], diagnostics: { producer: string; good: string; realized: number }[]) {
  if (node.controlled_by !== player || node.production_role !== 'guild' || (node.guild_level ?? 0) < 1
    || !Number.isInteger(turn) || turn <= (node.specialization_last_turn ?? 0)) return null;
  const eligible = new Map(producers.filter(p => p.node === node.id && p.channel === 'node' && !p.source).map(p => [p.id, p]));
  const output = new Map<string, number>();
  const seen = new Set<string>();
  for (const d of diagnostics) {
    const p = eligible.get(d.producer);
    if (!p || seen.has(d.producer) || p.recipe.good !== d.good || !Number.isFinite(d.realized) || d.realized <= 0) continue;
    seen.add(d.producer);
    output.set(d.good, (output.get(d.good) ?? 0) + d.realized);
  }
  const old = node.specialization_scores && typeof node.specialization_scores === 'object' && !Array.isArray(node.specialization_scores)
    ? node.specialization_scores as Record<string, unknown> : {};
  const scores: Record<string, number> = {};
  for (const key of Object.keys(old).sort()) {
    const value = Number(old[key]);
    if (Number.isFinite(value) && value > 0) scores[key] = Math.min(GUILD_SPECIALIZATION.cap, value) * GUILD_SPECIALIZATION.decay;
  }
  const totalProduced = [...output.values()].reduce((sum, value) => sum + value, 0);
  const gain = Math.min(GUILD_SPECIALIZATION.gainPerTurn, totalProduced);
  for (const [good, qty] of [...output.entries()].sort(([a], [b]) => a.localeCompare(b))) scores[good] = (scores[good] ?? 0) + gain * qty / totalProduced;
  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  if (total > GUILD_SPECIALIZATION.cap) for (const good of Object.keys(scores)) scores[good] *= GUILD_SPECIALIZATION.cap / total;
  const specialization = Math.min(total, GUILD_SPECIALIZATION.cap);
  let level = Math.min(5, Math.max(1, node.guild_level ?? 1));
  for (let next = level + 1; next <= 5; next++) if (specialization >= GUILD_SPECIALIZATION.thresholds[next - 1]) level = next;
  return { specialization_scores: scores, specialization_last_turn: turn, guild_level: level };
}