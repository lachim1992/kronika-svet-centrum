/**
 * Construction material sub-ledger of `realm_resources.production_reserve` (pure, no I/O).
 *
 * ONE spending channel: goodsEconomy already consumed the physical wood/stone goods as `capex`
 * when the turn closed and turned them into `construction_points`; process-turn accrues those
 * points 1:1 into production_reserve. This module only ATTRIBUTES that same reserve to the
 * material it came from (wood / stone / mixed construction_materials / legacy unattributed),
 * so a building that needs 30 wood draws 30 points of wood-origin reserve — never a second
 * deduction from city stock. Invariant: sum(composition) === production_reserve.
 *
 * Iron is NOT a capex good: goodsEconomy never converts iron into construction points. The
 * iron share of a template cost is therefore paid from pooled points (legacy contract) and is
 * reported as `iron_from_pooled_points` — no physical iron is drawn and the UI must say so.
 * Mirror of SQL `public.allocate_construction_reserve` (migration 20261123100000).
 */
export type Bucket = 'wood' | 'stone' | 'mixed' | 'unattributed';
export type Composition = Record<Bucket, number>;
export const BUCKETS: Bucket[] = ['wood', 'stone', 'mixed', 'unattributed'];
export const MATERIAL_OF_CAPEX_GOOD: Record<string, Exclude<Bucket, 'unattributed'>> = {
  lumber: 'wood', raw_timber: 'wood', stone_blocks: 'stone', raw_stone: 'stone', construction_materials: 'mixed',
};
/** Draw order per requirement. Iron has no physical capex origin → pooled order. */
export const DRAW_ORDER: Record<'wood' | 'stone' | 'iron', Bucket[]> = {
  wood: ['wood', 'mixed', 'unattributed'],
  stone: ['stone', 'mixed', 'unattributed'],
  iron: ['unattributed', 'mixed', 'wood', 'stone'],
};
const EPS = 1e-6;
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0; };
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** Construction points by material for a set of city balances (same total as construction_available_for_capex). */
export function constructionPointsByMaterial(balances: { good: string; construction_points?: number }[]): Composition {
  const out: Composition = { wood: 0, stone: 0, mixed: 0, unattributed: 0 };
  for (const b of balances) {
    const p = n(b.construction_points); if (!p) continue;
    out[MATERIAL_OF_CAPEX_GOOD[b.good] ?? 'unattributed'] += p;
  }
  for (const k of BUCKETS) out[k] = r6(out[k]);
  return out;
}

/**
 * Make the composition sum exactly `reserve`. Other spenders (projects, roads, units) debit
 * production_reserve without naming a material: they are treated as a proportional draw.
 * A legacy realm with no composition gets everything as `unattributed`.
 */
export function normalizeComposition(raw: unknown, reserveRaw: unknown): Composition {
  const reserve = n(reserveRaw), src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const named = { wood: n(src.wood), stone: n(src.stone), mixed: n(src.mixed) };
  const namedSum = named.wood + named.stone + named.mixed;
  const tracked = namedSum + n(src.unattributed);
  if (tracked <= reserve + EPS) return { ...named, unattributed: r6(Math.max(0, reserve - namedSum)) };
  const f = tracked > 0 ? reserve / tracked : 0;
  const out = { wood: r6(named.wood * f), stone: r6(named.stone * f), mixed: r6(named.mixed * f), unattributed: 0 };
  out.unattributed = r6(Math.max(0, reserve - out.wood - out.stone - out.mixed));
  return out;
}

/** Accrual at turn close: previous normalized composition + this turn's points by material. */
export function accrueComposition(prev: unknown, prevReserve: unknown, accrual: Partial<Composition> | null | undefined, newReserve: number): Composition {
  const base = normalizeComposition(prev, prevReserve);
  const add = accrual ?? {};
  const next = { wood: base.wood + n(add.wood), stone: base.stone + n(add.stone), mixed: base.mixed + n(add.mixed), unattributed: base.unattributed + n(add.unattributed) };
  return normalizeComposition(next, newReserve);
}

export interface MaterialRequirement { wood: number; stone: number; iron: number; total: number }
/**
 * Server-authoritative split of the template's discounted production cost. `total` equals the
 * existing command-dispatch price (discountedCost of the sum), split by largest remainder so
 * wood+stone+iron === total exactly.
 */
export function materialRequirement(t: { cost_wood?: unknown; cost_stone?: unknown; cost_iron?: unknown }, total: number): MaterialRequirement {
  const base = { wood: n(t.cost_wood), stone: n(t.cost_stone), iron: n(t.cost_iron) };
  const sum = base.wood + base.stone + base.iron;
  const T = Math.max(0, Math.round(n(total)));
  if (!sum || !T) return { wood: 0, stone: 0, iron: 0, total: T };
  const keys = ['wood', 'stone', 'iron'] as const;
  const raw = keys.map(k => base[k] * T / sum), fl = raw.map(Math.floor);
  let left = T - fl.reduce((s, x) => s + x, 0);
  const order = keys.map((_, i) => i).sort((a, b) => (raw[b] - fl[b]) - (raw[a] - fl[a]) || a - b);
  for (const i of order) { if (left <= 0) break; fl[i]++; left--; }
  return { wood: fl[0], stone: fl[1], iron: fl[2], total: T };
}

export type Draws = Record<'wood' | 'stone' | 'iron', Partial<Record<Bucket, number>>>;
export interface Allocation { ok: boolean; draws: Draws; next: Composition; shortage: { wood: number; stone: number; iron: number } }

/** Deterministic allocation; ok=false (nothing drawn) when any material is short. */
export function allocateConstruction(comp: Composition, req: MaterialRequirement): Allocation {
  const left: Composition = { ...comp };
  const draws: Draws = { wood: {}, stone: {}, iron: {} };
  const shortage = { wood: 0, stone: 0, iron: 0 };
  for (const mat of ['wood', 'stone', 'iron'] as const) {
    let need = req[mat];
    for (const b of DRAW_ORDER[mat]) {
      if (need <= EPS) break;
      const take = Math.min(need, left[b]);
      if (take > EPS) { draws[mat][b] = r6(take); left[b] = r6(left[b] - take); need -= take; }
    }
    shortage[mat] = need > EPS ? r6(need) : 0;
  }
  const ok = shortage.wood + shortage.stone + shortage.iron === 0;
  return { ok, draws: ok ? draws : { wood: {}, stone: {}, iron: {} }, next: ok ? left : { ...comp }, shortage };
}

export interface QuoteLine { material: 'wood' | 'stone' | 'iron'; required: number; available: number; status: 'covered' | 'shortage' | 'none'; physical: boolean }
/** Read-only availability quote: what the reserve covers per material. Never writes. */
export function quoteConstruction(compRaw: unknown, reserve: unknown, req: MaterialRequirement): { lines: QuoteLine[]; ok: boolean } {
  const comp = normalizeComposition(compRaw, reserve), alloc = allocateConstruction(comp, req);
  const avail = (m: 'wood' | 'stone' | 'iron') => r6(DRAW_ORDER[m].reduce((s, b) => s + comp[b], 0));
  const lines = (['wood', 'stone', 'iron'] as const).map(m => ({ material: m, required: req[m], available: avail(m),
    status: (req[m] <= 0 ? 'none' : alloc.shortage[m] > 0 ? 'shortage' : 'covered') as QuoteLine['status'], physical: m !== 'iron' }));
  return { lines, ok: alloc.ok };
}

/** Scale a by-material breakdown so it sums exactly to the accrued points (remainder → unattributed). */
export function scaleAccrual(byMaterial: unknown, accrued: number): Composition {
  const A = n(accrued), src = (byMaterial && typeof byMaterial === 'object' ? byMaterial : {}) as Record<string, unknown>;
  const parts = { wood: n(src.wood), stone: n(src.stone), mixed: n(src.mixed), unattributed: n(src.unattributed) };
  const sum = parts.wood + parts.stone + parts.mixed + parts.unattributed;
  if (!A) return { wood: 0, stone: 0, mixed: 0, unattributed: 0 };
  if (!sum) return { wood: 0, stone: 0, mixed: 0, unattributed: r6(A) };
  const f = A / sum, out = { wood: r6(parts.wood * f), stone: r6(parts.stone * f), mixed: r6(parts.mixed * f), unattributed: 0 };
  out.unattributed = r6(Math.max(0, A - out.wood - out.stone - out.mixed));
  return out;
}
