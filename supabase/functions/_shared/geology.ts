/**
 * Server-authoritative, deterministic geology for macro tiles.
 * Deposits depend only on a private per-session salt + coordinates, so regeneration is idempotent.
 * Only resources with a canonical goods chain are `implemented`; the rest are prospects (no output).
 */
export type DepositKind = "stone" | "granite" | "iron" | "copper" | "gold" | "timber" | "fertile_soil" | "wild_grapes" | "herbs";
export interface Deposit { kind: DepositKind; good: string | null; implemented: boolean; grade: 1 | 2 | 3; reserve: number | null; regenerates: boolean; tag?: string }
export interface MacroHexInput { biome_family: string; mean_height?: number | null; is_passable?: boolean | null; has_river?: boolean | null; coastal?: boolean | null }

export const DEPOSIT_GOOD: Record<DepositKind, string | null> = {
  stone: "raw_stone", granite: null, iron: "raw_ore", copper: null, gold: null,
  timber: "raw_timber", fertile_soil: null, wild_grapes: "raw_grapes", herbs: null,
};
export const DEPOSIT_LABEL: Record<DepositKind, string> = {
  stone: "Kámen", granite: "Žula", iron: "Železná ruda", copper: "Měděná ruda", gold: "Zlatá ruda",
  timber: "Dřevo", fertile_soil: "Úrodná půda", wild_grapes: "Divoká réva", herbs: "Byliny",
};

function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
/** Coarse value noise so ore bodies cluster across neighbouring tiles. */
function cluster(salt: string, kind: string, x: number, y: number, size: number): number {
  const cx = Math.floor(x / size), cy = Math.floor(y / size), fx = x / size - cx, fy = y / size - cy;
  const v = (a: number, b: number) => hash(`${salt}:${kind}:${a}:${b}`);
  const top = v(cx, cy) * (1 - fx) + v(cx + 1, cy) * fx, bot = v(cx, cy + 1) * (1 - fx) + v(cx + 1, cy + 1) * fx;
  return top * (1 - fy) + bot * fy;
}
const grade = (r: number): 1 | 2 | 3 => (r > .85 ? 3 : r > .5 ? 2 : 1);

export function isWaterBiome(b: string) { return /sea|ocean|lake|water/.test(b); }

export function generateMacroDeposits(salt: string, x: number, y: number, hex: MacroHexInput): Deposit[] {
  const b = hex.biome_family || "";
  if (isWaterBiome(b) || hex.is_passable === false && !/mountain/.test(b)) return [];
  const out: Deposit[] = [];
  const r = (k: string) => hash(`${salt}:${k}:${x}:${y}`);
  const add = (kind: DepositKind, g: 1 | 2 | 3, reserve: number | null, regenerates = false, tag?: string) =>
    out.push({ kind, good: DEPOSIT_GOOD[kind], implemented: DEPOSIT_GOOD[kind] !== null, grade: g, reserve, regenerates, ...(tag ? { tag } : {}) });
  const rocky = /mountain|hill/.test(b);
  if (rocky) {
    const mountain = /mountain/.test(b);
    add("stone", grade(r("stone")), Math.round(400 + r("stone_r") * 800));
    if (cluster(salt, "granite", x, y, 4) > .62) add("granite", grade(r("granite")), Math.round(300 + r("granite_r") * 600));
    const iron = cluster(salt, "iron", x, y, 5);
    if (iron > (mountain ? .58 : .66)) add("iron", grade(iron), Math.round(150 + iron * 450));
    const copper = cluster(salt, "copper", x, y, 6);
    if (copper > .7) add("copper", grade(copper), Math.round(100 + copper * 300));
    const gold = cluster(salt, "gold", x, y, 7);
    if (mountain && gold > .82 && r("gold") > .8) add("gold", grade(gold), Math.round(20 + gold * 60));
  }
  if (/forest|jungle|taiga|wood/.test(b)) {
    const q = r("timber"); const species = q > .8 ? "cedr" : q > .45 ? "dub" : "buk";
    add("timber", grade(q), Math.round(600 + q * 600), true, species);
    if (r("herbs") > .7) add("herbs", 1, null, true);
  }
  if (/plain|grass|meadow|steppe|savanna|flood/.test(b) || (hex.has_river && !rocky)) {
    add("fertile_soil", grade(r("soil") + (hex.has_river ? .25 : 0)), null, true);
    const warm = !/tundra|taiga|snow|steppe/.test(b) && (hex.mean_height ?? 0) < 0.6;
    if (warm && cluster(salt, "grapes", x, y, 3) > .72) add("wild_grapes", grade(r("grapes")), null, true);
    if (r("herbs") > .8) add("herbs", 1, null, true);
  }
  return out;
}

/** Survey level 1 = hint (kinds only), 2 = confirmed (grade, reserve, implemented). */
export function surveyFindings(deposits: Deposit[], level: 1 | 2) {
  return level >= 2 ? deposits : deposits.map(d => ({ kind: d.kind, hint: true }));
}
export const SURVEY_COST: Record<1 | 2, number> = { 1: 5, 2: 15 };
export function macroClaimCost(ownedTiles: number) { return 25 + Math.floor(ownedTiles / 5) * 5; }
