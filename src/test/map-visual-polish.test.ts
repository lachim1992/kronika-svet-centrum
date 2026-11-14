import { describe, expect, it } from "vitest";
import { mapVisualVariation, polishedTerrainTint, polishedTerrainTintAlpha } from "@/lib/mapVisualPolish";

 describe("map visual polish", () => {
  it("keeps decoration deterministic for the same world and parcel coordinates", () => {
    const first = mapVisualVariation("world-seed", 4, -2, 3, 5);
    expect(mapVisualVariation("world-seed", 4, -2, 3, 5)).toEqual(first);
    expect(mapVisualVariation("world-seed", 4, -2, 3, 4)).not.toEqual(first);
    expect(first.scale).toBeGreaterThanOrEqual(.88);
    expect(first.scale).toBeLessThanOrEqual(1.12);
    expect(Math.abs(first.offsetX)).toBeLessThanOrEqual(.8);
    expect(Math.abs(first.offsetY)).toBeLessThanOrEqual(.4);
  });

  it("keeps tint variation subtle and bounded", () => {
    expect(polishedTerrainTintAlpha("open_water", -1)).toBe(.16);
    expect(polishedTerrainTintAlpha("open_water", 1)).toBe(.42);
    expect(polishedTerrainTintAlpha("grassland", 0)).toBe(.23);
  });

  it("softens water and compatible land tints without changing their hue family", () => {
    expect(polishedTerrainTint("open_water")).toBe("hsl(192 41.8% 31.2%)");
    expect(polishedTerrainTint("dense_forest")).toBe("hsl(140 28.6% 30.0%)");
  });
});
