// Inkrement 3 — Path infrastructure for WorldgenSpecV1.
//
// Provides:
//  - DeepPartial<T>
//  - deepMerge (immutable, override wins)
//  - getByPath / setByPath / unsetByPath using "a.b.c" notation
//  - LOCKABLE_LEAF_PATHS / ADVANCED_MANAGED_PATHS / ALL_NON_BLUEPRINT_LEAF_PATHS
//  - canonicalizeLocks: filter to whitelist + dedup
//  - pickNonBlueprintFields: extract overrides for D2 blueprint regen
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

// All non-blueprint editable leaf paths — used in D2 (blueprint regen) to
// hard-lock everything except geographyBlueprint.
export const ALL_NON_BLUEPRINT_LEAF_PATHS: readonly string[] = [
  ...LOCKABLE_LEAF_PATHS,
  "userIntent.premise",
  "seed",
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
  // Clean up empty parents (optional — safer to leave; keep empty objects).
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

// ─── Pick non-blueprint fields (for D2 blueprint regen payload) ──────────────
// Returns a DeepPartial with all editable non-blueprint fields cloned from spec.
export function pickNonBlueprintFields(
  spec: WorldgenSpecV1,
): DeepPartial<WorldgenSpecV1> {
  let out: DeepPartial<WorldgenSpecV1> = {};
  for (const path of ALL_NON_BLUEPRINT_LEAF_PATHS) {
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
