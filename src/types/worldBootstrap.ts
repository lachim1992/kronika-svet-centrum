// Client-side re-export of bootstrap contract.
// Mirrors supabase/functions/_shared/world-bootstrap-types.ts.
// Kept manually in sync — both sides should match exactly.

export type WorldSize = "small" | "medium" | "large";

export type GameMode =
  | "tb_single_ai"
  | "tb_single_manual"
  | "tb_multi"
  | "time_persistent";

export type BootstrapStatus = "pending" | "bootstrapping" | "ready" | "failed";

export interface AdvancedMapOverride {
  enabled: boolean;
  width?: number;
  height?: number;
}

export interface TerrainKnobs {
  targetLandRatio?: number;
  continentShape?: string;
  continentCount?: number;
  mountainDensity?: number;
  biomeWeights?: Record<string, number>;
}

export interface HeraldryInput {
  primary: string;
  secondary: string;
  symbol: string;
}

export interface WorldIdentityInput {
  // Realm basics
  realmName?: string;
  settlementName?: string;
  peopleName?: string;
  cultureName?: string;
  languageName?: string;
  civDescription?: string;
  // Homeland
  homelandName?: string;
  homelandBiome?: string;
  homelandDesc?: string;
  spawnPreference?: string;
  // Ruler
  rulerName?: string;
  rulerTitle?: string;
  rulerArchetype?: string;
  rulerBio?: string;
  // Government & faith
  governmentForm?: string;
  tradeIdeology?: string;
  dominantFaith?: string;
  faithAttitude?: string;
  // Heraldry & secret
  heraldry?: HeraldryInput;
  secretObjectiveArchetype?: string;
  /** Player-authored founding myth — woven into prehistory. */
  foundingLegend?: string;
}

/**
 * Extracted mechanical identity (output of extract-civ-identity preview mode).
 * Wizard ships this to the bootstrap orchestrator so seed-realm-skeleton can
 * persist a fully-formed civ_identity row (modifiers, jednotky, building tags).
 */
export interface ExtractedCivIdentity {
  display_name?: string | null;
  flavor_summary?: string | null;
  culture_tags?: string[];
  urban_style?: string;
  society_structure?: string;
  military_doctrine?: string;
  economic_focus?: string;
  grain_modifier?: number;
  wood_modifier?: number;
  stone_modifier?: number;
  iron_modifier?: number;
  wealth_modifier?: number;
  pop_growth_modifier?: number;
  initial_burgher_ratio?: number;
  initial_cleric_ratio?: number;
  morale_modifier?: number;
  mobilization_speed?: number;
  cavalry_bonus?: number;
  fortification_bonus?: number;
  stability_modifier?: number;
  trade_modifier?: number;
  diplomacy_modifier?: number;
  research_modifier?: number;
  building_tags?: string[];
  militia_unit_name?: string;
  militia_unit_desc?: string;
  professional_unit_name?: string;
  professional_unit_desc?: string;
  core_myth?: string | null;
  cultural_quirk?: string | null;
  architectural_style?: string | null;
  source_description?: string;
}

export interface FactionSeedInput {
  name?: string;
  personality?: string;
  description?: string;
}

export interface ServerBootstrapInput {
  tickIntervalSeconds?: number;
  timeScale?: number;
  maxPlayers?: number;
  inactivityThresholdHours?: number;
  delegationEnabled?: boolean;
}

export interface CreateWorldBootstrapRequest {
  sessionId: string;
  playerName: string;
  mode: GameMode;
  world: {
    name: string;
    premise: string;
    /** Premisa Pradávna (svět před Zlomem). */
    preWorldPremise?: string;
    /** Premisa Současnosti (svět po Zlomu) — alias premise. */
    presentPremise?: string;
    tone: string;
    victoryStyle: string;
    size: WorldSize;
    seed?: string | null;
  };
  map: {
    advancedOverride?: AdvancedMapOverride;
    terrain?: TerrainKnobs;
  };
  identity?: WorldIdentityInput;
  factions?: FactionSeedInput[];
  server?: ServerBootstrapInput;
}

export interface BootstrapStepRecord {
  step: string;
  ok: boolean;
  durationMs: number;
  detail?: string;
}

export interface CreateWorldBootstrapResponse {
  ok: boolean;
  sessionId: string;
  worldReady: boolean;
  alreadyBootstrapped?: boolean;
  worldgen?: {
    seed: string;
    size: WorldSize;
    mapWidth: number;
    mapHeight: number;
    mode: GameMode;
  };
  artifacts?: {
    worldFoundationsId?: string;
    serverConfigId?: string;
    mapGenerated: boolean;
    startPositionsCount?: number;
    provincesSeeded?: number;
    factionsSeeded?: number;
  };
  steps?: BootstrapStepRecord[];
  warnings?: string[];
  error?: string;
}

// Feature flag — controls whether WorldSetupWizard uses the new orchestrator.
// Default OFF: legacy multi-call flow remains in effect.
export const USE_UNIFIED_BOOTSTRAP =
  import.meta.env.VITE_USE_UNIFIED_BOOTSTRAP === "true";

// ─── Inkrement 3: WorldgenSpecV1 + translate-premise-to-spec contract ────────

export interface GeographyRidge {
  id: string;
  startQ: number;
  startR: number;
  endQ: number;
  endR: number;
  strength: number;
}

export interface GeographyBiomeZone {
  id: string;
  biome: string;
  centerQ: number;
  centerR: number;
  radius: number;
  intensity: number;
}

export interface GeographyBlueprint {
  ridges: GeographyRidge[];
  biomeZones: GeographyBiomeZone[];
  climateGradient: "north_warm" | "south_warm" | "equator" | "uniform";
  oceanPattern: "surrounding" | "inland_sea" | "channels" | "minimal";
}

export interface WorldgenSpecV1 {
  version: 1;
  seed: string;
  factionCount: number;
  userIntent: {
    worldName: string;
    premise: string;
    tone: string;
    victoryStyle: string;
    style: string;
    size: WorldSize;
  };
  terrain: {
    targetLandRatio: number;
    continentShape: string;
    continentCount: number;
    mountainDensity: number;
    biomeWeights: Record<string, number>;
  };
  geographyBlueprint: GeographyBlueprint;
}

export type TranslateWarningCode =
  | "GENERIC_PREMISE"
  | "FACTIONS_INFERRED_CONSERVATIVELY"
  | "BIOME_WEIGHTS_NORMALIZED"
  | "RANGE_CLAMPED"
  | "OVERRIDE_APPLIED"
  | "ANCIENT_LAYER_FALLBACK"
  | "ANCIENT_LAYER_INVALID_AI"
  | "ANCIENT_LAYER_RETRY"
  | "PRE_WORLD_AUTO_SUGGESTED";

export interface TranslateWarning {
  code: TranslateWarningCode;
  message: string;
  field?: string;
}

// DeepPartial helper for request payloads (matches client lib).
export type DeepPartial<T> = T extends Array<infer U>
  ? Array<DeepPartial<U>>
  : T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

export interface TranslatePremiseRequest {
  premise: string;
  /** Premisa Pradávna (svět před Zlomem). Volitelné — když chybí, AI ji odvodí. */
  preWorldPremise?: string;
  userOverrides?: DeepPartial<WorldgenSpecV1>;
  lockedPaths?: string[];
  regenerationNonce?: number;
}

// AncientLayer client mirror (see src/types/ancientLayer.ts for the closed
// shape; re-imported here so consumers of TranslatePremiseResponse don't
// need a separate import).
import type { AncientLayerSpec } from "./ancientLayer";

export interface TranslatePremiseResponse {
  ok: boolean;
  spec?: WorldgenSpecV1;
  normalizedPremise?: string;
  warnings?: TranslateWarning[];
  error?: string;
  /** Ancient layer (rody, reset, mythic seeds). Při selhání 502 pole chybí. */
  ancientLayer?: AncientLayerSpec;
  /** Premisa Pradávna použitá pro generování. */
  resolvedPreWorldPremise?: string;
  /** Pokud Pradávno navrhla AI, klient ho zobrazí k editaci. */
  suggestedPreWorldPremise?: string;
}

export type { AncientLayerSpec, LineageProposal, MythicSeed, ResetEvent } from "./ancientLayer";

