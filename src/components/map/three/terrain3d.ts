/** Pure helpers for the trial 3D map: no React, no three.js. Squares keep their grid_x/grid_y identity. */
export type Tile3D = { grid_x: number; grid_y: number; biome_family: string; mean_height: number | null; has_river: boolean | null; coastal: boolean | null };

export const isWater = (b: string) => b === "sea" || b === "lake" || b === "ocean";

/** Gentle stepped land height from the existing mean_height (-22..23). */
export function tileHeight(t: Tile3D): number {
  if (isWater(t.biome_family)) return 0.02;
  const h = Math.max(0, Number(t.mean_height ?? 0));
  return 0.12 + Math.round((h / 23) * 4) * 0.08;
}

export const BIOME_COLOR: Record<string, string> = {
  plains: "#6f9a2a", forest: "#2f5a20", hills: "#8a7440", tundra: "#7d8487", swamp: "#4e6b3d", desert: "#d9be7a",
};
export const SEA_SHALLOW = "#2fb3c4";
export const SEA_DEEP = "#11507e";

/** Deterministic pseudo-random per square so trees never jump between renders. */
export function seeded(x: number, y: number, i: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + i * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

export function treeCount(b: string): number {
  return b === "forest" ? 14 : b === "swamp" ? 6 : b === "plains" ? 2 : b === "hills" ? 3 : 0;
}
export const hasMountain = (b: string) => b === "tundra";
