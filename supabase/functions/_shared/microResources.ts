/**
 * Raw resources of a single 6x6 micro-square, from its sub-biome.
 * Obvious resources are certain and public (stone on rocky ground, timber in woods, fish on water edges, peat in bogs,
 * grain on arable flats). Rare ones are a chance, hidden until a paid micro survey, and only exist where the macro tile's
 * true deposits allow them — so a micro find never invents a deposit the macro geology does not hold.
 */
import { type Deposit, type DepositKind } from "./geology.ts";

export type MicroResourceKind =
  | "grain" | "stone" | "timber" | "fish" | "peat" | "clay" | "fibre" | "game" | "resin"
  | "wild_grapes" | "olives" | "iron" | "gold" | "copper" | "granite" | "herbs";

export const MICRO_RESOURCE_GOOD: Record<MicroResourceKind, string | null> = {
  grain: "raw_grain", stone: "raw_stone", timber: "raw_timber", fish: "raw_fish", peat: "peat", clay: null,
  fibre: "raw_fiber", game: "raw_meat", resin: "raw_incense", wild_grapes: "raw_grapes", olives: "raw_olives",
  iron: "raw_ore", gold: "gold_ore", copper: null, granite: null, herbs: null,
};
export const MICRO_RESOURCE_LABEL: Record<MicroResourceKind, string> = {
  grain: "Obilí", stone: "Kámen", timber: "Dřevo", fish: "Ryby", peat: "Rašelina", clay: "Hlína", fibre: "Len a vlákna",
  game: "Zvěř", resin: "Pryskyřice", wild_grapes: "Divoká réva", olives: "Olivy", iron: "Železná ruda", gold: "Zlatá ruda",
  copper: "Měděná ruda", granite: "Žula", herbs: "Byliny",
};

const ARABLE = new Set(["grassland", "fertile_flat", "clearing", "fertile_silt", "terrace", "sheltered_hollow", "creek_bank", "raised_bank"]);
const ROCKY = new Set(["hillock", "cliff_edge", "steep_slope", "saddle", "permafrost_rise"]);
const WOODS = new Set(["dense_forest", "ridge_woods"]);
const WET_EDGE = new Set(["shore", "harbour_flat", "creek_bank"]);
const BOG = new Set(["boggy_dip", "reed_marsh"]);

/** Certain, public resources of a sub-biome (no survey needed). */
export function certainMicroResources(subBiome: string | null | undefined, macroBiome?: string | null): MicroResourceKind[] {
  const s = subBiome || "";
  const out: MicroResourceKind[] = [];
  if (ARABLE.has(s)) out.push("grain");
  if (ROCKY.has(s) || /mountain/.test(macroBiome || "")) out.push("stone");
  if (WOODS.has(s)) out.push("timber");
  if (WET_EDGE.has(s)) out.push("fish");
  if (BOG.has(s)) out.push("peat");
  return out;
}

/** Hidden chances per sub-biome (0..1); a survey rolls them deterministically. Mineral kinds also need the macro deposit. */
export const MICRO_CHANCES: Record<string, Partial<Record<MicroResourceKind, number>>> = {
  grassland: { fibre: .25, game: .2, herbs: .12, wild_grapes: .1, olives: .05 },
  fertile_flat: { fibre: .3, herbs: .1, wild_grapes: .08 },
  clearing: { game: .35, herbs: .2, resin: .1 },
  fertile_silt: { fibre: .35, clay: .4 },
  terrace: { wild_grapes: .3, olives: .2 },
  sheltered_hollow: { wild_grapes: .2, herbs: .2, olives: .1 },
  creek_bank: { clay: .45, fibre: .2 },
  raised_bank: { clay: .3 },
  hillock: { wild_grapes: .2, olives: .12, iron: .35, copper: .2, gold: .25, granite: .3 },
  saddle: { iron: .3, copper: .2, gold: .2, granite: .25 },
  cliff_edge: { iron: .4, copper: .25, gold: .35, granite: .45 },
  steep_slope: { iron: .35, copper: .2, gold: .3, granite: .35 },
  permafrost_rise: { iron: .2, granite: .2 },
  dense_forest: { game: .45, resin: .3, herbs: .2 },
  ridge_woods: { game: .35, resin: .35, iron: .15 },
  boggy_dip: { herbs: .2, clay: .3 },
  reed_marsh: { fibre: .4, game: .2 },
  shore: { clay: .15 },
  dune: { olives: .08 },
};

const MINERAL: Partial<Record<MicroResourceKind, DepositKind>> = { iron: "iron", gold: "gold", copper: "copper", granite: "granite", wild_grapes: "wild_grapes" };

function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

export interface MicroFinding { kind: MicroResourceKind; good: string | null; implemented: boolean; certain: boolean }

/** Server only (needs the private salt + macro truth). Deterministic: same inputs → same finds. */
export function surveyMicroSquare(salt: string, mx: number, my: number, subBiome: string | null | undefined, macroBiome: string | null | undefined, macroDeposits: Deposit[]): MicroFinding[] {
  const macroKinds = new Set(macroDeposits.map(d => d.kind));
  const found = new Map<MicroResourceKind, boolean>();
  for (const k of certainMicroResources(subBiome, macroBiome)) found.set(k, true);
  const chances = MICRO_CHANCES[subBiome || ""] || {};
  for (const [kind, p] of Object.entries(chances) as [MicroResourceKind, number][]) {
    const needs = MINERAL[kind];
    if (needs && !macroKinds.has(needs)) continue;
    if (hash(`${salt}:micro:${kind}:${mx}:${my}`) < p && !found.has(kind)) found.set(kind, false);
  }
  return [...found.entries()].map(([kind, certain]) => ({ kind, good: MICRO_RESOURCE_GOOD[kind], implemented: MICRO_RESOURCE_GOOD[kind] !== null, certain }));
}

/** One tenth of a full (level-2) macro survey, rounded up. */
export const MICRO_SURVEY_COST = 2;

/** Which micro resource a rural extraction recipe physically needs on its parcel. */
export const RECIPE_MICRO_RESOURCE: Record<string, MicroResourceKind> = {
  fell_timber: "timber", quarry_stone: "stone", mine_iron: "iron", mine_gold: "gold", harvest_wheat: "grain", harvest_barley: "grain",
  harvest_rice: "grain", herd_cattle: "grain", harvest_grapes: "wild_grapes", cut_peat: "peat", catch_fish: "fish",
};

/**
 * Stage 2 gate: a rural site may stand only on a micro-square where at least one of its recipes' resources is confirmed —
 * either certain from the sub-biome, or found by this player's own micro survey. Returns a Czech reason or null.
 */
export function microSiteReason(recipeKeys: string[], subBiome: string | null | undefined, macroBiome: string | null | undefined,
  surveyed: Array<{ kind?: string }> | null | undefined): string | null {
  const needed = [...new Set(recipeKeys.map(k => RECIPE_MICRO_RESOURCE[k]).filter(Boolean))];
  if (!needed.length) return null;
  const confirmed = new Set<string>([...certainMicroResources(subBiome, macroBiome), ...(surveyed || []).map(f => String(f.kind))]);
  if (needed.some(k => confirmed.has(k))) return null;
  return `Nedostupné: na tomto políčku není potvrzená surovina (${needed.map(k => MICRO_RESOURCE_LABEL[k]).join(" / ")}) — prozkoumej políčko nebo vyber jiné`;
}
