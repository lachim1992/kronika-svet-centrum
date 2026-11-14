import { SUB_BIOME_COLORS } from "@/lib/tileParcels";

const WATER_SUB_BIOMES = new Set(["creek_bank", "river_bank", "river_channel", "lake", "open_water"]);

const randomFrom = (text: string) => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
};

/** Visual-only, stable variation. It never participates in map identity or game rules. */
export function mapVisualVariation(seed: string, a: number, b: number, parcelX: number, parcelY: number) {
  const key = `${seed}:${a}:${b}:${parcelX}:${parcelY}`;
  return {
    scale: .88 + randomFrom(`${key}:scale`) * .24,
    offsetX: (randomFrom(`${key}:x`) - .5) * 1.6,
    offsetY: (randomFrom(`${key}:y`) - .5) * .8,
    density: randomFrom(`${key}:density`),
    tintDelta: (randomFrom(`${key}:tint`) - .5) * .035,
  };
}

/** Compress harsh parcel-to-parcel contrast without changing any biome assignment. */
export function polishedTerrainTint(subBiome: string) {
  const source = SUB_BIOME_COLORS[subBiome];
  const match = source?.match(/^hsl\(([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\)$/);
  if (!match) return source;
  const [, hueText, saturationText, lightnessText] = match;
  const water = WATER_SUB_BIOMES.has(subBiome);
  const saturation = Number(saturationText) * (water ? .72 : .84);
  const lightness = water
    ? Number(lightnessText) * .78
    : Number(lightnessText) * .78 + 44 * .22;
  return `hsl(${hueText} ${saturation.toFixed(1)}% ${lightness.toFixed(1)}%)`;
}

export function polishedTerrainTintAlpha(subBiome: string, delta = 0) {
  const base = WATER_SUB_BIOMES.has(subBiome) ? .36 : .23;
  return Math.max(.16, Math.min(.42, base + delta));
}
