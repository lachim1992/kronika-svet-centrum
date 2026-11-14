import { describe, expect, it, vi } from "vitest";
import { completeParcelTerrain } from "@/lib/parcelTerrainFallback";
import { generateTileParcels, TILE_PARCEL_COUNT } from "@/lib/tileParcels";

describe("partial parcel terrain reads", () => {
  const generated = generateTileParcels("session", -6, 1, { biome_family: "plains", elevation: 40 });

  it("fills every missing parcel without replacing stored terrain", () => {
    const stored = generated.slice(0, 34).map(parcel => ({ ...parcel, subBiome: parcel.parcelIndex === 33 ? "fertile_flat" : parcel.subBiome }));
    const completed = completeParcelTerrain(stored, () => generated);
    expect(completed).toHaveLength(TILE_PARCEL_COUNT);
    expect(new Set(completed.map(parcel => parcel.parcelIndex)).size).toBe(TILE_PARCEL_COUNT);
    expect(completed[33].subBiome).toBe("fertile_flat");
    expect(completed[34]).toEqual(generated[34]);
    expect(completed[35]).toEqual(generated[35]);
  });

  it("does not regenerate a complete canonical 6x6 survey", () => {
    const generate = vi.fn(() => generated);
    expect(completeParcelTerrain(generated, generate)).toBe(generated);
    expect(generate).not.toHaveBeenCalled();
  });
});
