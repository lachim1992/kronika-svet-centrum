// Canonical payload composer.
//
// Inkrement 3 update: composer now derives bootstrap & preview payloads from
// the resolved WorldgenSpecV1 (output of translate-premise-to-spec + user
// overrides). The legacy "WizardCanonicalState" interface is preserved for
// back-compat with the still-current bootstrap flow, but new code should
// prefer `composeBootstrapFromSpec`.

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
  ALL_NON_BLUEPRINT_LEAF_PATHS,
  pickNonBlueprintFields,
} from "@/lib/worldgenSpecPaths";

// ─── Legacy canonical state (kept for back-compat) ───────────────────────────
export interface WizardCanonicalState {
  sessionId: string;
  playerName: string;
  mode: GameMode;
  worldName: string;
  premise: string;
  tone: string;
  victoryStyle: string;
  size: WorldSize;
  seed: string | null;
  advancedOverrideEnabled: boolean;
  customWidth?: number;
  customHeight?: number;
  targetLandRatio: number;
  continentShape: string;
  continentCount: number;
  mountainDensity: number;
  biomeWeights?: Record<string, number>;
  identity?: {
    settlementName?: string;
    cultureName?: string;
    languageName?: string;
    realmName?: string;
  };
  factions?: FactionSeedInput[];
}

interface CanonicalBase {
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

function buildCanonicalBase(s: WizardCanonicalState): CanonicalBase {
  const base: CanonicalBase = {
    size: s.size,
    seed: s.seed,
    terrain: {
      targetLandRatio: s.targetLandRatio,
      continentShape: s.continentShape,
      continentCount: s.continentCount,
      mountainDensity: s.mountainDensity,
      biomeWeights: s.biomeWeights,
    },
  };
  if (s.advancedOverrideEnabled && s.customWidth && s.customHeight) {
    base.advancedOverride = {
      enabled: true,
      width: s.customWidth,
      height: s.customHeight,
    };
  }
  return base;
}

export function composeBootstrapPayload(
  s: WizardCanonicalState,
): CreateWorldBootstrapRequest {
  const base = buildCanonicalBase(s);
  return {
    sessionId: s.sessionId,
    playerName: s.playerName,
    mode: s.mode,
    world: {
      name: s.worldName,
      premise: s.premise,
      tone: s.tone,
      victoryStyle: s.victoryStyle,
      size: base.size,
      seed: base.seed,
    },
    map: {
      advancedOverride: base.advancedOverride,
      terrain: base.terrain,
    },
    identity: s.identity,
    factions: s.factions,
  };
}

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

export function composePreviewPayload(
  s: WizardCanonicalState,
): PreviewWorldMapRequest {
  const base = buildCanonicalBase(s);
  return {
    size: base.size,
    seed: base.seed,
    advancedOverride: base.advancedOverride,
    terrain: base.terrain,
  };
}

export function assertPayloadParity(s: WizardCanonicalState): boolean {
  const boot = composeBootstrapPayload(s);
  const prev = composePreviewPayload(s);
  const sameSize = boot.world.size === prev.size;
  const sameSeed = (boot.world.seed ?? null) === (prev.seed ?? null);
  const sameAdv =
    JSON.stringify(boot.map.advancedOverride ?? null) ===
    JSON.stringify(prev.advancedOverride ?? null);
  const sameTerrain =
    JSON.stringify(boot.map.terrain) === JSON.stringify(prev.terrain);
  return sameSize && sameSeed && sameAdv && sameTerrain;
}

// ─── Inkrement 3: spec-driven composers ──────────────────────────────────────

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
 * after AI returns.
 */
export function composeBlueprintRegenRequest(args: {
  spec: WorldgenSpecV1;
  regenerationNonce: number;
}): TranslatePremiseRequest {
  return {
    premise: args.spec.userIntent.premise,
    userOverrides: pickNonBlueprintFields(args.spec),
    lockedPaths: [...ALL_NON_BLUEPRINT_LEAF_PATHS],
    regenerationNonce: args.regenerationNonce,
  };
}

/**
 * Compose CreateWorldBootstrapRequest from a fully resolved WorldgenSpecV1
 * (Inkrement 3 path). Back-compat: existing create-world-bootstrap accepts
 * the same wire shape, so we just project spec → request.
 */
export function composeBootstrapFromSpec(args: {
  sessionId: string;
  playerName: string;
  mode: GameMode;
  spec: WorldgenSpecV1;
  identity?: WizardCanonicalState["identity"];
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
      },
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
