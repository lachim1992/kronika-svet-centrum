// Inkrement 3 v9 — Path infrastructure for WorldgenSpecV1.
//
// CANONICAL NAMESPACE INVARIANT
// ─────────────────────────────────────────────────────────────────────────────
// All path whitelists, merge helpers, diff tests and reducer guards in
// Inkrement 3 are derived from the canonical WorldgenSpecV1 namespace.
// No alias such as `worldName` vs `userIntent.worldName` is permitted.
// Any leaf appearing in a whitelist must exist as an editable field on
// WorldgenSpecV1 (see src/types/worldBootstrap.ts).
// ─────────────────────────────────────────────────────────────────────────────
//
// Provides:
//  - DeepPartial<T>
//  - deepMerge (immutable, override wins)
//  - getByPath / setByPath / unsetByPath using "a.b.c" notation
//  - LOCKABLE_LEAF_PATHS    — what the user can manually lock
//  - ADVANCED_MANAGED_PATHS — bulk-locked by Advanced override toggle
//  - BLUEPRINT_REGEN_LOCK_PATHS — fields hard-locked during D2 blueprint regen
//      (everything editable EXCEPT geographyBlueprint and seed; seed is
//       deterministically re-derived server-side from premise + nonce)
//  - BLUEPRINT_REGEN_USER_OVERRIDE_PATHS — fields whose current resolved
//      values are sent as userOverrides on blueprint regen
//  - CANONICAL_BIOMES — frontend canonical biome list. Mirror lives in
//      supabase/functions/_shared/terrain.ts (BIOME_KEYS). Drift detection
//      is performed at runtime in translate-premise-to-spec; this is NOT a
//      true single source of truth (frontend Vite vs Deno backend cannot
//      share one module without extra build glue), it is a synchronized
//      mirror with a runtime audit.
//  - canonicalizeLocks: filter to whitelist + dedup
//  - pickBlueprintRegenLockedFields: extract overrides for D2 blueprint regen
//  - isTerrainDependentPath: check if edit invalidates geographyBlueprint
//
// Path semantics: dot-separated; only LEAF paths are lockable in Inkrement 3.

import type { WorldgenSpecV1 } from "@/types/worldBootstrap";

// ─── DeepPartial ─────────────────────────────────────────────────────────────
export type DeepPartial<T> = T extends Array<infer U>
  ? Array<DeepPartial<U>>
  : T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

// ─── Canonical biome list (frontend) ─────────────────────────────────────────
// INVARIANT: must match BIOME_KEYS in supabase/functions/_shared/terrain.ts.
// Drift detection: translate-premise-to-spec logs a warning at request time
// if AI output references biomes outside this set after normalization.
export const CANONICAL_BIOMES = [
  "plains",
  "forest",
  "hills",
  "mountain",
  "desert",
  "tundra",
  "coast",
  "swamp",
] as const;
export type CanonicalBiome = (typeof CANONICAL_BIOMES)[number];

// ─── Whitelists (canonical constants) ────────────────────────────────────────
export const LOCKABLE_LEAF_PATHS = [
  "userIntent.worldName",
  "userIntent.size",
  "userIntent.tone",
  "userIntent.victoryStyle",
  "userIntent.style",
  "factionCount",
  "terrain.targetLandRatio",
  "terrain.mountainDensity",
  "terrain.continentShape",
  "terrain.continentCount",
] as const;
export type LockablePath = (typeof LOCKABLE_LEAF_PATHS)[number];

export const ADVANCED_MANAGED_PATHS: readonly LockablePath[] = [
  "userIntent.size",
  "userIntent.style",
  "userIntent.victoryStyle",
  "factionCount",
  "terrain.targetLandRatio",
  "terrain.mountainDensity",
  "terrain.continentShape",
  "terrain.continentCount",
];

// ─── Blueprint regen lock set (D2 + v9) ──────────────────────────────────────
// During blueprint regeneration the server must hard-lock every editable
// non-blueprint leaf. `terrain.biomeWeights.*` is included so AI cannot drift
// the palette while regenerating geography. `seed` is intentionally OMITTED:
// the server derives a fresh deterministic seed from (premise|nonce) so that
// regeneration produces a different blueprint while everything else is held.
export const BLUEPRINT_REGEN_LOCK_PATHS: readonly string[] = [
  ...LOCKABLE_LEAF_PATHS,
  "userIntent.premise",
  // biomeWeights as a whole — server treats this as a leaf (record replaced wholesale)
  "terrain.biomeWeights",
];

// User-overrides payload paths for blueprint regen: same as lock paths,
// minus premise (which is sent as the top-level `premise` field instead).
const REGEN_OVERRIDE_LEAF_PATHS: readonly string[] = [
  ...LOCKABLE_LEAF_PATHS,
  "terrain.biomeWeights",
];

// Paths whose edit invalidates the derived geographyBlueprint.
const TERRAIN_DEPENDENT_PREFIXES = [
  "userIntent.size",
  "terrain.",
];

export function isTerrainDependentPath(path: string): boolean {
  return TERRAIN_DEPENDENT_PREFIXES.some((p) =>
    path === p.replace(/\.$/, "") || path.startsWith(p),
  );
}

// ─── Canonicalization ────────────────────────────────────────────────────────
const LOCKABLE_SET = new Set<string>(LOCKABLE_LEAF_PATHS);

export function canonicalizeLocks(paths: readonly string[]): string[] {
  const out = new Set<string>();
  for (const p of paths) {
    if (LOCKABLE_SET.has(p)) out.add(p);
  }
  return Array.from(out).sort();
}

export function isLockable(path: string): boolean {
  return LOCKABLE_SET.has(path);
}

// ─── Path helpers (dot notation, leaf-only writes) ───────────────────────────
export function getByPath(obj: unknown, path: string): unknown {
  if (obj == null) return undefined;
  const parts = path.split(".");
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

export function setByPath<T extends object>(obj: T, path: string, value: unknown): T {
  const parts = path.split(".");
  const next: any = Array.isArray(obj) ? [...(obj as any)] : { ...(obj as any) };
  let cur = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    const child = cur[k];
    cur[k] = child && typeof child === "object" ? (Array.isArray(child) ? [...child] : { ...child }) : {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
  return next;
}

export function unsetByPath<T extends object>(obj: T, path: string): T {
  const parts = path.split(".");
  const next: any = Array.isArray(obj) ? [...(obj as any)] : { ...(obj as any) };
  let cur = next;
  const stack: Array<{ parent: any; key: string }> = [];
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== "object") return next;
    cur[k] = Array.isArray(cur[k]) ? [...cur[k]] : { ...cur[k] };
    stack.push({ parent: cur, key: k });
    cur = cur[k];
  }
  delete cur[parts[parts.length - 1]];
  return next;
}

// ─── Deep merge (override wins; arrays replaced wholesale) ───────────────────
export function deepMerge<T>(base: T, override: DeepPartial<T> | undefined | null): T {
  if (override == null) return base;
  if (typeof base !== "object" || base === null || Array.isArray(base)) {
    return (override as unknown as T) ?? base;
  }
  if (typeof override !== "object" || override === null || Array.isArray(override)) {
    return (override as unknown as T) ?? base;
  }
  const out: any = { ...(base as any) };
  for (const k of Object.keys(override)) {
    const ov = (override as any)[k];
    if (ov === undefined) continue;
    const bv = (base as any)[k];
    if (
      bv && typeof bv === "object" && !Array.isArray(bv) &&
      ov && typeof ov === "object" && !Array.isArray(ov)
    ) {
      out[k] = deepMerge(bv, ov);
    } else {
      out[k] = ov;
    }
  }
  return out as T;
}

// ─── Pick blueprint-regen-locked fields (for D2 payload) ─────────────────────
// Returns DeepPartial with all non-blueprint editable fields cloned from spec.
// The premise is intentionally NOT included — caller passes it as top-level
// `premise` on the TranslatePremiseRequest.
export function pickBlueprintRegenLockedFields(
  spec: WorldgenSpecV1,
): DeepPartial<WorldgenSpecV1> {
  let out: DeepPartial<WorldgenSpecV1> = {};
  for (const path of REGEN_OVERRIDE_LEAF_PATHS) {
    const v = getByPath(spec, path);
    if (v !== undefined) {
      out = setByPath(out as any, path, v) as DeepPartial<WorldgenSpecV1>;
    }
  }
  return out;
}

// ─── Resolved spec helper ────────────────────────────────────────────────────
export function resolveSpec(
  aiSuggestion: WorldgenSpecV1 | null,
  userOverrides: DeepPartial<WorldgenSpecV1>,
): WorldgenSpecV1 | null {
  if (!aiSuggestion) return null;
  return deepMerge(aiSuggestion, userOverrides);
}

// ─── Stale detection helpers ─────────────────────────────────────────────────
/**
 * Returns true if an edit at the given path invalidates the AI's
 * geographyBlueprint and should set isBlueprintStale=true.
 */
export function shouldMarkBlueprintStale(path: string): boolean {
  return isTerrainDependentPath(path);
}
