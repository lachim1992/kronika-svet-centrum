import { MICRO_CHANCES, MICRO_RESOURCE_LABEL, certainMicroResources, microResourceProbability, type MicroResourceKind } from "../../supabase/functions/_shared/microResources";
import type { Deposit } from "../../supabase/functions/_shared/geology";

export const ATLAS_KINDS = Object.keys(MICRO_RESOURCE_LABEL) as MicroResourceKind[];
export const atlasColor = (kind: MicroResourceKind) => `var(--res-${kind})`;

export interface MicroAtlasCell { top: MicroResourceKind | null; p: number; all: { kind: MicroResourceKind; p: number }[] }

/** Every resource's chance on one micro-square (same formula as surveys); top = the most likely, rare resources win ties. */
export function microAtlasCell(subBiome: string | null | undefined, macroBiome: string | null | undefined, deposits: Pick<Deposit, "kind">[] | null): MicroAtlasCell {
  const kinds = new Set<MicroResourceKind>([...certainMicroResources(subBiome, macroBiome), ...Object.keys(MICRO_CHANCES[subBiome || ""] || {}) as MicroResourceKind[]]);
  const all = [...kinds].map(kind => ({ kind, p: microResourceProbability(kind, subBiome, macroBiome, (deposits ?? []) as Deposit[]) }))
    .filter(x => x.p > 0).sort((a, b) => b.p - a.p || ATLAS_KINDS.indexOf(b.kind) - ATLAS_KINDS.indexOf(a.kind));
  const rare = all.find(x => x.p < 1);
  // A certain everyday resource would hide every rare chance; show the best rare chance when there is one.
  const top = rare ?? all[0] ?? null;
  return { top: top?.kind ?? null, p: top?.p ?? 0, all };
}
