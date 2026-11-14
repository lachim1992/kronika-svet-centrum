// Spreading a discovered crop (stage 4 of micro resources). Pure rules shared by command-dispatch, economyAdapter and the map UI.
import { MICRO_CHANCES, MICRO_RESOURCE_LABEL, type MicroResourceKind } from "./microResources.ts";

export const PLANTABLE: MicroResourceKind[] = ["wild_grapes", "olives"];
export const PLANT_COST = 3;
export const MATURE_TURNS = 3;
/** Recipes whose output comes from a planted crop and must wait for it to mature. */
export const CROP_RECIPE: Partial<Record<MicroResourceKind, string>> = { wild_grapes: "harvest_grapes" };

export const cropSuits = (kind: MicroResourceKind, subBiome: string | null | undefined) => (MICRO_CHANCES[subBiome || ""]?.[kind] ?? 0) > 0;
export const isMature = (plantedTurn: number, turn: number) => turn - plantedTurn >= MATURE_TURNS;

/** Why the player cannot plant `kind` here (null = allowed). hasSource: found by own survey or a mature planting elsewhere. */
export function plantReason(kind: MicroResourceKind, p: { sub_biome: string | null; owner_player: string | null; claim_kind?: string | null },
  player: string, hasSource: boolean, alreadyHere: boolean): string | null {
  if (!PLANTABLE.includes(kind)) return "Tuto plodinu nelze vysadit.";
  if (p.owner_player !== player || p.claim_kind !== "worked") return "Sázet lze jen na políčka, která obdělává tvé město.";
  if (alreadyHere) return `${MICRO_RESOURCE_LABEL[kind]} tu už roste.`;
  if (!hasSource) return `Nejdřív musíš někde najít ${MICRO_RESOURCE_LABEL[kind].toLowerCase()} (průzkum políčka).`;
  if (!cropSuits(kind, p.sub_biome)) return `Políčko se pro ${MICRO_RESOURCE_LABEL[kind].toLowerCase()} nehodí.`;
  return null;
}
