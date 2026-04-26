// Canonical contract for create-world-bootstrap.
// Imported by both the orchestrator and the client (via src/types/worldBootstrap.ts).

import type { WorldSize, AdvancedMapOverride } from "./world-sizes.ts";

export type GameMode =
  | "tb_single_ai"
  | "tb_single_manual"
  | "tb_multi"
  | "time_persistent";

export type BootstrapStatus = "pending" | "bootstrapping" | "ready" | "failed";

export type WorldTone =
  | "mythic"
  | "realistic"
  | "dark_fantasy"
  | "heroic"
  | "grim"
  | string;

export type VictoryStyle =
  | "story"
  | "domination"
  | "survival"
  | "sandbox"
  | string;

export type ContinentShape =
  | "pangaea"
  | "two_continents"
  | "archipelago"
  | "crescent"
  | "mixed"
  | string;

export interface TerrainKnobs {
  targetLandRatio?: number;
  continentShape?: ContinentShape;
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
  realmName?: string;
  settlementName?: string;
  peopleName?: string;
  cultureName?: string;
  languageName?: string;
  civDescription?: string;
  homelandName?: string;
  homelandBiome?: string;
  homelandDesc?: string;
  spawnPreference?: string;
  rulerName?: string;
  rulerTitle?: string;
  rulerArchetype?: string;
  rulerBio?: string;
  governmentForm?: string;
  tradeIdeology?: string;
  dominantFaith?: string;
  faithAttitude?: string;
  heraldry?: HeraldryInput;
  secretObjectiveArchetype?: string;
  /** Player-authored founding myth — woven into prehistory. */
  foundingLegend?: string;
}

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
    tone: WorldTone;
    victoryStyle: VictoryStyle;
    size: WorldSize;
    seed?: string | null;
  };
  map: {
    advancedOverride?: AdvancedMapOverride;
    terrain?: TerrainKnobs;
  };
  identity?: WorldIdentityInput;
  /** Mechanical identity extracted by AI in the wizard. */
  identityModifiers?: ExtractedCivIdentity;
  /** Lineage IDs selected by the player. */
  lineageIds?: string[];
  factions?: FactionSeedInput[];
  server?: ServerBootstrapInput;
}

// ── Persisted spec artifact (stored in world_foundations.worldgen_spec) ──
// NOTE: Inkrement 3 expanded shape — add geographyBlueprint, factionCount, style.
//       Legacy producers may omit these; consumers should treat them optional.

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

// Backwards-compat: legacy mode field on persisted spec may exist; new producers
// derive mode from CreateWorldBootstrapRequest separately.
export interface LegacyWorldgenSpecFields {
  mode?: GameMode;
  resolvedSize?: {
    width: number;
    height: number;
    source: "size_profile" | "advanced_override";
  };
  notes?: {
    usedAdvancedOverride?: boolean;
    promptBiasApplied?: boolean;
  };
}

// ── Translate-premise-to-spec contract (Inkrement 3) ──

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

export interface TranslatePremiseResponse {
  ok: boolean;
  spec?: WorldgenSpecV1;
  normalizedPremise?: string;
  warnings?: TranslateWarning[];
  error?: string;
  /**
   * Track 1 (T1-PR2): Ancient Layer artifact derived from the same premise.
   * Validated against AncientLayerSchema on the server before being returned.
   * Pokud generování selže, server vrací 502 — pole je pak undefined.
   */
  ancientLayer?: import("./ancient-layer-types.ts").AncientLayerSpec;
  /** Premisa Pradávna použitá pro generování (ručně zadaná nebo AI-suggested). */
  resolvedPreWorldPremise?: string;
  /** Pokud bylo Pradávno odvozeno AI ze současné premisy, klient ho zobrazí k editaci. */
  suggestedPreWorldPremise?: string;
}

// ── Response ──

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
