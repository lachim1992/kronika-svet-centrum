// Canonical payload composer.
//
// Inkrement 3 v9: composer derives bootstrap & preview payloads from the
// resolved WorldgenSpecV1 (output of translate-premise-to-spec + user
// overrides). The legacy WizardCanonicalState is removed in v9 — the wizard
// now drives everything from a resolved spec via useWorldSetupWizardState.

import {
  type CreateWorldBootstrapRequest,
  type DeepPartial,
  type FactionSeedInput,
  type GameMode,
  type TranslatePremiseRequest,
  type WorldgenSpecV1,
  type WorldSize,
} from "@/types/worldBootstrap";
import {
  BLUEPRINT_REGEN_LOCK_PATHS,
  pickBlueprintRegenLockedFields,
} from "@/lib/worldgenSpecPaths";

// ─── Preview request shape (server contract) ─────────────────────────────────
export interface PreviewWorldMapRequest {
  size: WorldSize;
  seed: string | null;
  advancedOverride?: { enabled: true; width: number; height: number };
  terrain: {
    targetLandRatio: number;
    continentShape: string;
    continentCount: number;
    mountainDensity: number;
    biomeWeights?: Record<string, number>;
  };
}

export interface PreviewWorldMapResponse {
  ok: boolean;
  hexes: Array<{ q: number; r: number; terrain: string; elevation?: number }>;
  mapWidth: number;
  mapHeight: number;
  seed: string;
  estimatedStartPositions: number;
  landRatioResolved: number;
  error?: string;
}

// ─── Inkrement 3: spec-driven composers ──────────────────────────────────────

export interface WizardIdentityInput {
  settlementName?: string;
  cultureName?: string;
  languageName?: string;
  realmName?: string;
}

/** Build the request to translate-premise-to-spec from current wizard state. */
export function composeAnalyzeRequest(args: {
  premise: string;
  userOverrides?: DeepPartial<WorldgenSpecV1>;
  lockedPaths?: string[];
  regenerationNonce?: number;
}): TranslatePremiseRequest {
  return {
    premise: args.premise,
    userOverrides: args.userOverrides,
    lockedPaths: args.lockedPaths,
    regenerationNonce: args.regenerationNonce ?? 0,
  };
}

/**
 * D2: Build a translate request that regenerates ONLY the geographyBlueprint
 * by hard-locking every non-blueprint editable leaf to the current resolved
 * spec values. Server respects locks in prompt + always hard-merges overrides
 * after AI returns. Seed is NOT locked — server re-derives from (premise|nonce).
 */
export function composeBlueprintRegenRequest(args: {
  spec: WorldgenSpecV1;
  regenerationNonce: number;
}): TranslatePremiseRequest {
  return {
    premise: args.spec.userIntent.premise,
    userOverrides: pickBlueprintRegenLockedFields(args.spec),
    lockedPaths: [...BLUEPRINT_REGEN_LOCK_PATHS],
    regenerationNonce: args.regenerationNonce,
  };
}

/**
 * Compose CreateWorldBootstrapRequest from a fully resolved WorldgenSpecV1.
 * The bootstrap orchestrator's wire shape projects directly from the spec.
 */
export function composeBootstrapFromSpec(args: {
  sessionId: string;
  playerName: string;
  mode: GameMode;
  spec: WorldgenSpecV1;
  identity?: WizardIdentityInput;
  factions?: FactionSeedInput[];
}): CreateWorldBootstrapRequest {
  const { spec } = args;
  return {
    sessionId: args.sessionId,
    playerName: args.playerName,
    mode: args.mode,
    world: {
      name: spec.userIntent.worldName,
      premise: spec.userIntent.premise,
      tone: spec.userIntent.tone,
      victoryStyle: spec.userIntent.victoryStyle,
      size: spec.userIntent.size,
      seed: spec.seed,
    },
    map: {
      terrain: {
        targetLandRatio: spec.terrain.targetLandRatio,
        continentShape: spec.terrain.continentShape,
        continentCount: spec.terrain.continentCount,
        mountainDensity: spec.terrain.mountainDensity,
        biomeWeights: spec.terrain.biomeWeights,
        // v9: pass full blueprint so generate-world-map can place ridges + biome zones.
        geographyBlueprint: spec.geographyBlueprint as any,
      } as any,
    },
    identity: args.identity,
    factions: args.factions,
  };
}

export function composePreviewFromSpec(spec: WorldgenSpecV1): PreviewWorldMapRequest {
  return {
    size: spec.userIntent.size,
    seed: spec.seed,
    terrain: {
      targetLandRatio: spec.terrain.targetLandRatio,
      continentShape: spec.terrain.continentShape,
      continentCount: spec.terrain.continentCount,
      mountainDensity: spec.terrain.mountainDensity,
      biomeWeights: spec.terrain.biomeWeights,
    },
  };
}
