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

export interface WorldIdentityInput {
  settlementName?: string;
  cultureName?: string;
  languageName?: string;
  realmName?: string;
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
