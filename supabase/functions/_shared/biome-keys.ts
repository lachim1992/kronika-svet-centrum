// Backend mirror of the canonical biome list.
// INVARIANT: must match CANONICAL_BIOMES in src/lib/worldgenSpecPaths.ts.
// Drift detection: translate-premise-to-spec logs a warning when AI biomes
// fall outside this set after normalization (see normalizeSpec consumers).
export const BIOME_KEYS = [
  "plains",
  "forest",
  "hills",
  "mountain",
  "desert",
  "tundra",
  "coast",
  "swamp",
] as const;
export type BiomeKey = (typeof BIOME_KEYS)[number];

export const BIOME_KEY_SET: ReadonlySet<string> = new Set(BIOME_KEYS);
