// Shared validation + normalization for translate-premise-to-spec (Inkrement 3).
//
// Responsibilities:
//   - Zod schema for WorldgenSpecV1 (loose: parses partial AI output)
//   - Range clamping for known numeric fields
//   - biomeWeights normalization (sum=1)
//   - Default-fill for missing fields
//   - Hard-merge of userOverrides over AI output (overrides ALWAYS win)
//   - Premise normalization (trim + collapse whitespace + lowercase for hash)
//   - Deterministic seed derivation (UUIDv5 over normalizedPremise|nonce)
//
// All exports are pure & stateless.

import { z } from "https://esm.sh/zod@3.23.8";
import type {
  DeepPartial,
  TranslateWarning,
  WorldgenSpecV1,
} from "./world-bootstrap-types.ts";

// ─── UUIDv5 (RFC 4122 §4.3) over SHA-1 ───────────────────────────────────────
// Namespace UUID: a fixed v4 generated for The Chronicle Hub worldgen.
const NAMESPACE_UUID = "6f1d9c3a-5e7b-4d2a-9c8f-1b3a4e5d6c7e";

function uuidStringToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function bytesToUuidString(bytes: Uint8Array): string {
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function uuidv5(name: string, namespace: string = NAMESPACE_UUID): Promise<string> {
  const nsBytes = uuidStringToBytes(namespace);
  const nameBytes = new TextEncoder().encode(name);
  const buf = new Uint8Array(nsBytes.length + nameBytes.length);
  buf.set(nsBytes, 0);
  buf.set(nameBytes, nsBytes.length);
  const hashBuf = await crypto.subtle.digest("SHA-1", buf);
  const hash = new Uint8Array(hashBuf).slice(0, 16);
  // Set version (5) and variant (RFC 4122)
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  return bytesToUuidString(hash);
}

// ─── Premise normalization ───────────────────────────────────────────────────
export function normalizePremise(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function deriveSeed(premise: string, nonce: number): Promise<string> {
  const normalized = normalizePremise(premise);
  return uuidv5(`${normalized}|${nonce}`);
}

// ─── Defaults ────────────────────────────────────────────────────────────────
export const DEFAULT_BIOME_WEIGHTS: Record<string, number> = {
  plains: 0.3,
  forest: 0.25,
  hills: 0.15,
  mountain: 0.1,
  desert: 0.1,
  tundra: 0.05,
  coast: 0.05,
};

const VALID_SIZES = ["small", "medium", "large"] as const;
const VALID_TONES = ["realistic", "mythic", "dark_fantasy", "heroic", "grim"];
const VALID_VICTORY = ["story", "domination", "survival", "sandbox"];
const VALID_SHAPES = ["pangaea", "two_continents", "archipelago", "crescent", "mixed"];
const VALID_CLIMATES = ["north_warm", "south_warm", "equator", "uniform"] as const;
const VALID_OCEAN = ["surrounding", "inland_sea", "channels", "minimal"] as const;

// ─── Loose Zod schema (passthrough — we clamp/normalize after) ───────────────
const RidgeSchema = z.object({
  id: z.string().default(""),
  startQ: z.number().default(0),
  startR: z.number().default(0),
  endQ: z.number().default(0),
  endR: z.number().default(0),
  strength: z.number().default(0.5),
});

const BiomeZoneSchema = z.object({
  id: z.string().default(""),
  biome: z.string().default("plains"),
  centerQ: z.number().default(0),
  centerR: z.number().default(0),
  radius: z.number().default(3),
  intensity: z.number().default(0.5),
});

export const WorldgenSpecLooseSchema = z.object({
  version: z.literal(1).optional(),
  seed: z.string().optional(),
  factionCount: z.number().optional(),
  userIntent: z.object({
    worldName: z.string().optional(),
    premise: z.string().optional(),
    tone: z.string().optional(),
    victoryStyle: z.string().optional(),
    style: z.string().optional(),
    size: z.string().optional(),
  }).optional(),
  terrain: z.object({
    targetLandRatio: z.number().optional(),
    continentShape: z.string().optional(),
    continentCount: z.number().optional(),
    mountainDensity: z.number().optional(),
    biomeWeights: z.record(z.number()).optional(),
  }).optional(),
  geographyBlueprint: z.object({
    ridges: z.array(RidgeSchema).optional(),
    biomeZones: z.array(BiomeZoneSchema).optional(),
    climateGradient: z.string().optional(),
    oceanPattern: z.string().optional(),
  }).optional(),
}).passthrough();

// ─── Helpers ─────────────────────────────────────────────────────────────────
function clamp(n: number | undefined, min: number, max: number, fallback: number): { value: number; clamped: boolean } {
  if (typeof n !== "number" || !Number.isFinite(n)) return { value: fallback, clamped: false };
  if (n < min) return { value: min, clamped: true };
  if (n > max) return { value: max, clamped: true };
  return { value: n, clamped: false };
}

function pickEnum<T extends readonly string[]>(value: string | undefined, valid: T, fallback: T[number]): T[number] {
  if (value && (valid as readonly string[]).includes(value)) return value as T[number];
  return fallback;
}

function normalizeBiomeWeights(input: Record<string, number> | undefined): { weights: Record<string, number>; normalized: boolean } {
  if (!input || Object.keys(input).length === 0) {
    return { weights: { ...DEFAULT_BIOME_WEIGHTS }, normalized: false };
  }
  const cleaned: Record<string, number> = {};
  let sum = 0;
  for (const [k, v] of Object.entries(input)) {
    const n = typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
    if (n > 0) { cleaned[k] = n; sum += n; }
  }
  if (sum <= 0) return { weights: { ...DEFAULT_BIOME_WEIGHTS }, normalized: true };
  const out: Record<string, number> = {};
  let needNormalize = Math.abs(sum - 1) > 0.001;
  for (const [k, v] of Object.entries(cleaned)) out[k] = v / sum;
  return { weights: out, normalized: needNormalize };
}

// ─── Deep merge (override wins; arrays replaced) ─────────────────────────────
export function deepMerge<T>(base: T, override: any): T {
  if (override == null) return base;
  if (typeof base !== "object" || base === null || Array.isArray(base)) return override ?? base;
  if (typeof override !== "object" || Array.isArray(override)) return override ?? base;
  const out: any = { ...(base as any) };
  for (const k of Object.keys(override)) {
    const ov = override[k];
    if (ov === undefined) continue;
    const bv = (base as any)[k];
    if (bv && typeof bv === "object" && !Array.isArray(bv) && ov && typeof ov === "object" && !Array.isArray(ov)) {
      out[k] = deepMerge(bv, ov);
    } else {
      out[k] = ov;
    }
  }
  return out as T;
}

// ─── Canonicalize/clamp/fill an AI-produced spec → valid WorldgenSpecV1 ──────
export interface NormalizeContext {
  premise: string;
  seed: string;
  warnings: TranslateWarning[];
}

export function normalizeSpec(rawAI: unknown, ctx: NormalizeContext): WorldgenSpecV1 {
  const parsed = WorldgenSpecLooseSchema.safeParse(rawAI ?? {});
  const ai: any = parsed.success ? parsed.data : {};

  // userIntent
  const ui = ai.userIntent ?? {};
  const sizeVal = pickEnum(ui.size, VALID_SIZES, "medium");
  const toneVal = typeof ui.tone === "string" && ui.tone ? ui.tone : "realistic";
  const victoryVal = typeof ui.victoryStyle === "string" && ui.victoryStyle ? ui.victoryStyle : "story";
  const styleVal = typeof ui.style === "string" && ui.style ? ui.style : "balanced";
  const worldNameVal = typeof ui.worldName === "string" && ui.worldName.trim() ? ui.worldName.trim() : "Nový svět";

  // factionCount
  const fc = clamp(ai.factionCount, 0, 6, 3);
  if (fc.clamped) ctx.warnings.push({ code: "RANGE_CLAMPED", message: "factionCount mimo rozsah, oříznuto.", field: "factionCount" });

  // terrain
  const t = ai.terrain ?? {};
  const tlr = clamp(t.targetLandRatio, 0.1, 0.9, 0.45);
  if (tlr.clamped) ctx.warnings.push({ code: "RANGE_CLAMPED", message: "targetLandRatio mimo rozsah.", field: "terrain.targetLandRatio" });
  const md = clamp(t.mountainDensity, 0, 0.8, 0.3);
  if (md.clamped) ctx.warnings.push({ code: "RANGE_CLAMPED", message: "mountainDensity mimo rozsah.", field: "terrain.mountainDensity" });
  const cc = clamp(t.continentCount, 1, 6, 2);
  if (cc.clamped) ctx.warnings.push({ code: "RANGE_CLAMPED", message: "continentCount mimo rozsah.", field: "terrain.continentCount" });
  const csVal = pickEnum(t.continentShape, VALID_SHAPES as any, "mixed");

  const bw = normalizeBiomeWeights(t.biomeWeights);
  if (bw.normalized) ctx.warnings.push({ code: "BIOME_WEIGHTS_NORMALIZED", message: "Váhy biomů normalizovány na součet 1." });

  // geographyBlueprint
  const gb = ai.geographyBlueprint ?? {};
  const ridges = Array.isArray(gb.ridges) ? gb.ridges.slice(0, 12).map((r: any, i: number) => ({
    id: typeof r.id === "string" ? r.id : `ridge_${i}`,
    startQ: Math.round(Number(r.startQ) || 0),
    startR: Math.round(Number(r.startR) || 0),
    endQ: Math.round(Number(r.endQ) || 0),
    endR: Math.round(Number(r.endR) || 0),
    strength: clamp(r.strength, 0, 1, 0.5).value,
  })) : [];
  const biomeZones = Array.isArray(gb.biomeZones) ? gb.biomeZones.slice(0, 24).map((z: any, i: number) => ({
    id: typeof z.id === "string" ? z.id : `zone_${i}`,
    biome: typeof z.biome === "string" ? z.biome : "plains",
    centerQ: Math.round(Number(z.centerQ) || 0),
    centerR: Math.round(Number(z.centerR) || 0),
    radius: clamp(z.radius, 1, 12, 3).value,
    intensity: clamp(z.intensity, 0, 1, 0.5).value,
  })) : [];
  const climate = pickEnum(gb.climateGradient, VALID_CLIMATES, "uniform");
  const ocean = pickEnum(gb.oceanPattern, VALID_OCEAN, "surrounding");

  return {
    version: 1,
    seed: ctx.seed,
    factionCount: fc.value,
    userIntent: {
      worldName: worldNameVal,
      premise: ctx.premise,
      tone: toneVal,
      victoryStyle: victoryVal,
      style: styleVal,
      size: sizeVal,
    },
    terrain: {
      targetLandRatio: tlr.value,
      continentShape: csVal,
      continentCount: cc.value,
      mountainDensity: md.value,
      biomeWeights: bw.weights,
    },
    geographyBlueprint: {
      ridges,
      biomeZones,
      climateGradient: climate,
      oceanPattern: ocean,
    },
  };
}

// ─── Hard-merge userOverrides AFTER normalization ────────────────────────────
export function applyHardOverrides(
  spec: WorldgenSpecV1,
  overrides: DeepPartial<WorldgenSpecV1> | undefined,
  warnings: TranslateWarning[],
): WorldgenSpecV1 {
  if (!overrides || Object.keys(overrides).length === 0) return spec;
  const merged = deepMerge(spec, overrides);
  warnings.push({ code: "OVERRIDE_APPLIED", message: "User overrides aplikovány po AI generaci." });
  // Re-clamp & re-normalize the merged result to be safe (override could be out of range)
  return normalizeSpec(merged, { premise: spec.userIntent.premise, seed: spec.seed, warnings });
}

// ─── Request validation schema ───────────────────────────────────────────────
export const TranslateRequestSchema = z.object({
  premise: z.string().min(30, "Premisa musí mít alespoň 30 znaků").max(2000, "Premisa max 2000 znaků"),
  preWorldPremise: z.string().max(2000).optional(),
  userOverrides: z.any().optional(),
  lockedPaths: z.array(z.string()).max(50).optional(),
  regenerationNonce: z.number().int().min(0).max(9999).optional(),
});
