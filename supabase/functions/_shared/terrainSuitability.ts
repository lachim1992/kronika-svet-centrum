/** Parcel terrain rules for productive buildings. Pure; shared by command-dispatch and tests.
 * A rule names the sub-biome pattern a recipe needs; recipes without a rule have no terrain requirement. */
const RULES: Record<string, { re: RegExp; label: string }> = {
  fell_timber: { re: /forest|woods|canopy|thicket/, label: "les" },
  quarry_stone: { re: /rock|gravel|slope|shelf|ridge|hillock|terrace/, label: "skalnatý terén" },
  mine_iron: { re: /rock|slope|shelf|ridge|hillock|terrace/, label: "skalnatý terén s ložiskem" },
  mine_gold: { re: /rock|slope|shelf|ridge|hillock|terrace/, label: "kopcovitý či skalnatý terén se zlatou žilou" },
  harvest_wheat: { re: /fertile|grass|clearing|sheltered|raised_bank|creek_bank|flat/, label: "úrodná louka" },
  harvest_barley: { re: /fertile|grass|clearing|sheltered|raised_bank|creek_bank|flat/, label: "úrodná louka" },
  herd_cattle: { re: /fertile|grass|clearing|sheltered|flat/, label: "pastvina" },
  harvest_grapes: { re: /sheltered|slope|terrace|fertile|hillock/, label: "chráněný svah nebo úrodná půda" },
  harvest_rice: { re: /boggy|marsh|silt|creek_bank|raised_bank/, label: "mokřad u vody" },
  cut_peat: { re: /boggy|marsh|silt/, label: "rašeliniště" },
  catch_fish: { re: /shore|harbour|creek_bank/, label: "břeh" },
};
export type BuildingRole = "raw_extraction" | "processor" | "civic_military" | "unsupported";
export function terrainReason(recipeKeys: string[] | undefined, subBiome: string | null | undefined): string | null {
  for (const k of recipeKeys || []) {
    const r = RULES[k]; if (!r) continue;
    if (!subBiome || !r.re.test(subBiome)) return `Nedostupné: tato stavba potřebuje ${r.label} (parcela: ${subBiome || "neznámá"})`;
  }
  return null;
}
export function buildingRole(recipeKeys: string[] | undefined, inputsByRecipe: Map<string, unknown[]>): BuildingRole {
  if (!recipeKeys?.length) return "civic_military";
  if (recipeKeys.some(k => !inputsByRecipe.has(k))) return "unsupported";
  return recipeKeys.every(k => (inputsByRecipe.get(k) || []).length === 0) ? "raw_extraction" : "processor";
}
/** Free worked-land quota: one worked claim per paid urban parcel, never recursive. */
export function workedQuota(parcels: { status: string; claim_kind?: string | null }[]) {
  const held = parcels.filter(p => p.status === "claimed" || p.status === "occupied");
  const worked = held.filter(p => p.claim_kind === "worked").length;
  const urban = held.length - worked;
  return { urban, worked, available: Math.max(0, urban - worked) };
}
/** 2–48 chars, letters (incl. Czech), digits, space, - ' . ; markup stripped. */
export function sanitizeRegionName(raw: unknown): string | null {
  const s = String(raw ?? "").normalize("NFC").replace(/[<>&"`]/g, "").replace(/\s+/g, " ").trim();
  if (s.length < 2 || s.length > 48 || !/^[\p{L}\p{N} .'\-]+$/u.test(s)) return null;
  return s;
}
