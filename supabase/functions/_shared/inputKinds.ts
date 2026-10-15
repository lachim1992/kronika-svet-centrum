/**
 * RECIPE INPUT CLASSES (Economy 2.0 A/B/C). One contract read by the catalogue, the adapter
 * (AUTO expected cost), the physical solver (goodsEconomy) and Dev Mode — never re-derived.
 *  A 'material'  — mandatory BOM, physically consumed per unit; gates output; sets the quality ceiling.
 *  B 'factor'    — durable productive factor (tools, pottery). Required stock = qty per unit of
 *                  CAPACITY; not consumed whole. Coverage gives a SATURATING productivity multiplier
 *                  (floor..1, never a hard gate) and `wear` × qty per OUTPUT unit is physically consumed.
 *  C 'operating' — consumed support input (fuel). Consumed per unit and gates output like A, but does
 *                  not cap output quality and is not subject to recipe minQuality.
 * Missing `kind` = 'material' (every legacy input is BOM).
 */
export type InputKind = 'material' | 'factor' | 'operating';
export interface KindedInput { good: string; qty: number; kind?: InputKind; wear?: number }

export const INPUT_KINDS = {
  /** Productivity with zero factor stock (no death spiral). */
  factorFloor: 0.6,
  /** Default share of the factor requirement worn out per output unit. */
  defaultWear: 0.05,
} as const;

export const kindOf = (i: { kind?: unknown }): InputKind =>
  i.kind === 'factor' || i.kind === 'operating' ? i.kind : 'material';
export const isFactor = (i: { kind?: unknown }) => kindOf(i) === 'factor';
export const wearOf = (i: { wear?: unknown }) => {
  const w = Number(i.wear); return Number.isFinite(w) && w >= 0 ? Math.min(1, w) : INPUT_KINDS.defaultWear;
};
/** Physically consumed units of this input per unit of recipe batch (A/C: qty; B: qty × wear). */
export const consumedPerBatch = (i: KindedInput) => isFactor(i) ? i.qty * wearOf(i) : i.qty;
/** Saturating productivity from factor coverage (available / required), floor..1. */
export const factorMultiplier = (coverage: number) =>
  INPUT_KINDS.factorFloor + (1 - INPUT_KINDS.factorFloor) * Math.max(0, Math.min(1, Number.isFinite(coverage) ? coverage : 0));
/** Parse a DB `input_items` entry (keeps kind/wear when present). */
export const parseInputItem = (i: any, num: (x: unknown) => number): KindedInput => {
  const out: KindedInput = { good: i?.key ?? i?.good_key ?? i?.good, qty: num(i?.qty ?? i?.quantity) };
  const k = kindOf(i ?? {}); if (k !== 'material') out.kind = k;
  if (k === 'factor' && i?.wear != null) out.wear = wearOf(i);
  return out;
};
