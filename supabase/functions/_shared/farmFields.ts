// Farm fields: extra worked micro squares attached to one farm (stage 3 of micro resources).
// Pure rules shared by command-dispatch (authority), economyAdapter (effect) and the map UI (hint).
import { certainMicroResources } from "./microResources.ts";

export const MAX_FARM_FIELDS = 8;
export const FARM_FIELD_COST = 3;
/** Each field adds this share of the farm's Lv1 capacity and these jobs. */
export const FIELD_CAPACITY_SHARE = 0.25;
export const FIELD_JOBS = 3;
/** Farm recipes that can be extended by fields. */
export const FIELD_RECIPES = new Set(["harvest_wheat", "harvest_barley", "harvest_rice", "herd_cattle"]);

export interface FieldParcel { id: string; grid_x: number; grid_y: number; parcel_index: number; sub_biome: string | null; city_id: string | null; owner_player: string | null; claim_kind?: string | null }
export const microXY = (p: { grid_x: number; grid_y: number; parcel_index: number }) => ({ x: p.grid_x * 6 + (p.parcel_index % 6), y: p.grid_y * 6 + Math.floor(p.parcel_index / 6) });

export const isFieldFarm = (recipeKeys: string[]) => recipeKeys.some(k => FIELD_RECIPES.has(k));

/** Why this parcel cannot become a field of the farm (null = allowed). Fields chain: adjacent to the farm or to one of its fields. */
export function farmFieldReason(farm: FieldParcel, farmRecipes: string[], field: FieldParcel, existing: FieldParcel[], occupied: boolean, macroBiome?: string | null): string | null {
  if (!isFieldFarm(farmRecipes)) return "Pole lze přidat jen k farmě nebo pastvině.";
  if (existing.length >= MAX_FARM_FIELDS) return `Farma už má ${MAX_FARM_FIELDS} polí.`;
  if (field.id === farm.id || existing.some(e => e.id === field.id)) return "Toto políčko už k farmě patří.";
  if (field.city_id !== farm.city_id || field.owner_player !== farm.owner_player || field.claim_kind !== "worked") return "Políčko musí být obdělávané stejným městem.";
  if (occupied) return "Na políčku už stojí stavba nebo jiné pole.";
  if (!certainMicroResources(field.sub_biome, macroBiome).includes("grain")) return "Políčko není orná půda.";
  const f = microXY(field);
  const touches = [farm, ...existing].some(p => { const m = microXY(p); return Math.abs(m.x - f.x) + Math.abs(m.y - f.y) === 1; });
  if (!touches) return "Pole musí sousedit s farmou nebo s jejím polem.";
  return null;
}

/** Capacity multiplier and extra jobs a farm gets from its fields. */
export function fieldBonus(fields: number) {
  const n = Math.max(0, Math.min(MAX_FARM_FIELDS, Math.floor(fields)));
  return { capacityFactor: 1 + FIELD_CAPACITY_SHARE * n, extraJobs: FIELD_JOBS * n };
}
