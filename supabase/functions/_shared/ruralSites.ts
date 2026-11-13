/**
 * Rural extraction sites on worked parcels + parcel→city freight access.
 * One physical source per parcel/recipe: a rural building REPLACES the natural parcel producer
 * (same producer id parcel:{id}:{recipe}) with a bounded, levelled capacity — never stacked on top.
 */
export const RURAL_RECIPES = new Set(["fell_timber", "quarry_stone", "mine_iron", "harvest_wheat", "harvest_barley",
  "herd_cattle", "harvest_grapes", "cut_peat", "catch_fish", "harvest_rice"]);
/** Every rural output (crops, cattle, fish, grapes, timber, stone, ore, peat) must be hauled to the city market.
 * Subsistence grace comes only from the city's own macro cell (factor 1 "local"); river water is not freight. */
export const FREIGHT_RECIPES = new Set(RURAL_RECIPES);
/** Deposit (from a detailed survey) a recipe needs before it may run at all. */
export const DEPOSIT_REQUIRED: Record<string, string> = { mine_iron: "iron" };
/** Lv1 site capacity per recipe (output units/turn before staffing). */
export const RURAL_BASE: Record<string, number> = { fell_timber: 2.4, quarry_stone: 2, mine_iron: 1.5, harvest_wheat: 2.2,
  harvest_barley: 2, herd_cattle: 1.2, harvest_grapes: 1.4, cut_peat: 1.4, catch_fish: 2, harvest_rice: 2.2 };
export const FOOTPATH_FACTOR = 0.25;

export type SiteRole = "rural" | "urban";
export function templateSiteRole(recipeKeys: unknown): SiteRole {
  const keys = Array.isArray(recipeKeys) ? recipeKeys.map(String) : [];
  return keys.length > 0 && keys.every(k => RURAL_RECIPES.has(k)) ? "rural" : "urban";
}
export function siteCapacity(recipe: string, level: number) { return (RURAL_BASE[recipe] ?? 0) * (1 + 0.5 * Math.max(0, level - 1)); }

/** deposit key `${player}|${x},${y}|${kind}` confirmed by that player's level-2 survey. */
export function depositKey(player: string, x: number, y: number, kind: string) { return `${player}|${x},${y}|${kind}`; }

export interface RoadEdge { from: string; to: string; owner?: string | null }
export interface Transport { factor: number; mode: "local" | "road" | "footpath" | "no_road" }
/** Deterministic access from parcel cell to the city seat over COMPLETED roads (bridges are segments too). */
/** Only the hauling realm's own roads (or unowned legacy roads) count — no freight over foreign roads. Edge capacity is not modelled. */
export function parcelTransport(parcelCell: string, cityCell: string, roads: RoadEdge[], owner?: string | null): Transport {
  if (parcelCell === cityCell) return { factor: 1, mode: "local" };
  const adj = new Map<string, string[]>();
  for (const e of roads) { if (owner && e.owner && e.owner !== owner) continue; (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to); (adj.get(e.to) ?? adj.set(e.to, []).get(e.to)!).push(e.from); }
  const seen = new Set([cityCell]), queue = [cityCell];
  for (const c of queue) for (const n of adj.get(c) || []) if (!seen.has(n)) { if (n === parcelCell) return { factor: 1, mode: "road" }; seen.add(n); queue.push(n); }
  const [px, py] = parcelCell.split(",").map(Number), [cx, cy] = cityCell.split(",").map(Number);
  return Math.abs(px - cx) + Math.abs(py - cy) === 1 ? { factor: FOOTPATH_FACTOR, mode: "footpath" } : { factor: 0, mode: "no_road" };
}

export interface RuralSite { parcelId: string; recipeKeys: string[]; level: number; owner: string }
export interface RuralContext { sites?: RuralSite[]; roads?: RoadEdge[]; deposits?: Set<string> }

/** Merge natural specs with the parcel's rural site; enforce deposits. Returns specs + reasons for blocked recipes. */
export function siteSpecs(natural: { recipe: string; capacity: number; jobs: number; renewable: boolean }[], site: RuralSite | undefined,
  x: number, y: number, deposits: Set<string> | undefined) {
  const specs = new Map(natural.map(s => [s.recipe, { ...s, site: false }]));
  const blocked: { recipe: string; reason: string }[] = [];
  for (const recipe of site?.recipeKeys || []) {
    const need = DEPOSIT_REQUIRED[recipe];
    if (need && !deposits?.has(depositKey(site!.owner, x, y, need))) { blocked.push({ recipe, reason: `chybí potvrzené ložisko (${need})` }); continue; }
    const cap = siteCapacity(recipe, site!.level), prev = specs.get(recipe);
    specs.set(recipe, { recipe, capacity: Math.max(cap, prev?.capacity ?? 0), jobs: Math.max(6, prev?.jobs ?? 0) * Math.max(1, site!.level),
      renewable: recipe !== "mine_iron" && recipe !== "quarry_stone" && recipe !== "cut_peat", site: true });
  }
  return { specs: [...specs.values()], blocked };
}
