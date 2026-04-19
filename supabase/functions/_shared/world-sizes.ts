// Single source of truth for world size → map dimensions.
// Used by create-world-bootstrap and any client/server code that needs
// to resolve world.size (master input) to concrete map dimensions.

export type WorldSize = "small" | "medium" | "large";

export const WORLD_SIZE_PRESETS: Record<WorldSize, { width: number; height: number }> = {
  small: { width: 21, height: 21 },
  medium: { width: 31, height: 31 },
  large: { width: 41, height: 41 },
};

export const MAP_DIM_MIN = 11;
export const MAP_DIM_MAX = 61;

export interface AdvancedMapOverride {
  enabled: boolean;
  width?: number;
  height?: number;
}

export interface ResolvedMapSize {
  width: number;
  height: number;
  source: "size_profile" | "advanced_override";
}

export function resolveMapSize(
  size: WorldSize,
  advanced?: AdvancedMapOverride,
): ResolvedMapSize {
  if (advanced?.enabled && advanced.width && advanced.height) {
    return {
      width: Math.max(MAP_DIM_MIN, Math.min(MAP_DIM_MAX, advanced.width)),
      height: Math.max(MAP_DIM_MIN, Math.min(MAP_DIM_MAX, advanced.height)),
      source: "advanced_override",
    };
  }
  const preset = WORLD_SIZE_PRESETS[size] ?? WORLD_SIZE_PRESETS.medium;
  return { ...preset, source: "size_profile" };
}
