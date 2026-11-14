import { TILE_PARCEL_COUNT, type TileParcelSpec } from "@/lib/tileParcels";

export type ParcelTerrainHint = Pick<TileParcelSpec, "parcelIndex" | "parcelX" | "parcelY" | "subBiome">;

/**
 * Stored parcels are canonical, but a truncated/partial read must not erase the rest of a tile.
 * Fill only missing indices from the same deterministic generator used by world materialization.
 */
export function completeParcelTerrain(
  stored: ParcelTerrainHint[],
  generate: () => TileParcelSpec[],
): ParcelTerrainHint[] {
  const indices = new Set(stored.map(parcel => parcel.parcelIndex));
  if (stored.length === TILE_PARCEL_COUNT && indices.size === TILE_PARCEL_COUNT) return stored;
  const byIndex = new Map(stored.map(parcel => [parcel.parcelIndex, parcel]));
  return generate().map(parcel => byIndex.get(parcel.parcelIndex) || parcel);
}
