// Canonical payload composer (R3).
//
// Single source of truth for translating the wizard state into both:
//   • create-world-bootstrap request
//   • preview-world-map request (a derived subset of the same base)
//
// This guarantees payload parity: identical wizard state produces identical
// {size, terrain, seed} in both requests.

import type {
  CreateWorldBootstrapRequest,
  FactionSeedInput,
  GameMode,
  WorldSize,
} from "@/types/worldBootstrap";

export interface WizardCanonicalState {
  // World identity
  sessionId: string; // empty string for preview (no session yet)
  playerName: string;
  mode: GameMode;
  worldName: string;
  premise: string;
  tone: string;
  victoryStyle: string;
  size: WorldSize;
  seed: string | null;

  // Map
  advancedOverrideEnabled: boolean;
  customWidth?: number;
  customHeight?: number;

  // Terrain
  targetLandRatio: number; // 0..1
  continentShape: string;
  continentCount: number;
  mountainDensity: number; // 0..1
  biomeWeights?: Record<string, number>;

  // Optional identity / factions (only used for bootstrap)
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

// Test helper — verifies that bootstrap and preview payloads agree on the
// canonical map/terrain inputs. Used by acceptance criterion 11.
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
