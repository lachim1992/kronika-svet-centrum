// ─────────────────────────────────────────────────────────────────────────────
// preview-world-map — read-only world map preview (Inkrement 2)
//
// Returns a hex grid based on the same canonical inputs as create-world-bootstrap,
// but writes nothing to the database. Used by the World Setup Wizard to show
// players a "real engine" preview before they commit to creating the world.
//
// Response shape (R6):
//   { hexes, mapWidth, mapHeight, seed, estimatedStartPositions, landRatioResolved }
//
// Out of scope: caching, rate limiting, faction placement.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveMapSize, type WorldSize } from "../_shared/world-sizes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PreviewRequest {
  size: WorldSize;
  seed?: string | null;
  advancedOverride?: { enabled: boolean; width?: number; height?: number };
  terrain: {
    targetLandRatio: number;
    continentShape: string;
    continentCount: number;
    mountainDensity: number;
    biomeWeights?: Record<string, number>;
  };
}

interface PreviewHex {
  q: number;
  r: number;
  terrain: string;
  elevation: number;
}

interface PreviewResponse {
  ok: boolean;
  hexes: PreviewHex[];
  mapWidth: number;
  mapHeight: number;
  seed: string;
  estimatedStartPositions: number;
  landRatioResolved: number;
  error?: string;
}

// ── Deterministic noise (no deps) ────────────────────────────────────────────

function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed: string) {
  const seedNum = hashSeed(seed);
  const cache = new Map<string, number>();
  function rand(ix: number, iy: number) {
    const k = `${ix},${iy}`;
    let v = cache.get(k);
    if (v === undefined) {
      v = mulberry32(seedNum ^ (ix * 73856093) ^ (iy * 19349663))();
      cache.set(k, v);
    }
    return v;
  }
  function sample(x: number, y: number, scale: number) {
    const sx = x / scale;
    const sy = y / scale;
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const fx = sx - x0;
    const fy = sy - y0;
    const a = rand(x0, y0);
    const b = rand(x0 + 1, y0);
    const c = rand(x0, y0 + 1);
    const d = rand(x0 + 1, y0 + 1);
    const ab = a + (b - a) * fx;
    const cd = c + (d - c) * fx;
    return ab + (cd - ab) * fy;
  }
  return { sample };
}

function shapeBias(
  shape: string,
  q: number,
  r: number,
  width: number,
  height: number,
  seedNum: number,
): number {
  const cx = width / 2;
  const cy = height / 2;
  const dx = (q - cx) / cx;
  const dy = (r - cy) / cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  switch (shape) {
    case "pangaea":
      return Math.max(0, 1 - dist * 0.85);
    case "archipelago": {
      const r1 = mulberry32(seedNum ^ 1)();
      const r2 = mulberry32(seedNum ^ 2)();
      const v = Math.cos(q * 0.7 + r1 * 6) * Math.sin(r * 0.7 + r2 * 6);
      return 0.35 + v * 0.4;
    }
    case "two_continents": {
      const lobe = Math.abs(dx) > 0.2 ? 1 - Math.abs(Math.abs(dx) - 0.55) * 1.5 : 0;
      return Math.max(0, lobe - Math.abs(dy) * 0.5);
    }
    case "crescent": {
      const target = Math.cos(dx * Math.PI * 0.7) * 0.6;
      return Math.max(0, 1 - Math.abs(dy - target) * 1.5 - dist * 0.2);
    }
    case "mixed":
    default:
      return Math.max(0, 0.85 - dist * 0.5);
  }
}

function jsonResponse(body: PreviewResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as PreviewRequest;
    if (!body || typeof body !== "object") throw new Error("Body must be an object");
    if (!["small", "medium", "large"].includes(body.size)) {
      throw new Error("size must be small | medium | large");
    }
    if (!body.terrain || typeof body.terrain.targetLandRatio !== "number") {
      throw new Error("terrain.targetLandRatio required");
    }

    const seed = (body.seed && body.seed.trim()) || crypto.randomUUID();
    const resolved = resolveMapSize(body.size, body.advancedOverride);

    const noise = makeNoise(seed);
    const seedNum = hashSeed(seed);

    const targetLandRatio = Math.max(0.05, Math.min(0.95, body.terrain.targetLandRatio));
    const mountainDensity = Math.max(0, Math.min(1, body.terrain.mountainDensity));
    const continentShape = body.terrain.continentShape || "mixed";

    // Score every cell, then take top N as land to hit target ratio.
    const totalCells = resolved.width * resolved.height;
    const scored: Array<{ q: number; r: number; score: number }> = [];
    for (let r = 0; r < resolved.height; r++) {
      for (let q = 0; q < resolved.width; q++) {
        const n = noise.sample(q, r, 4.5);
        const bias = shapeBias(continentShape, q, r, resolved.width, resolved.height, seedNum);
        scored.push({ q, r, score: n * 0.55 + bias * 0.55 });
      }
    }
    const targetLandCount = Math.round(totalCells * targetLandRatio);
    const sorted = [...scored].sort((a, b) => b.score - a.score);
    const landSet = new Set<string>();
    for (let i = 0; i < targetLandCount; i++) {
      landSet.add(`${sorted[i].q},${sorted[i].r}`);
    }
    const coastThreshold = sorted[Math.floor(targetLandCount * 0.85)]?.score ?? 0;

    const hexes: PreviewHex[] = [];
    let actualLand = 0;
    for (const { q, r, score } of scored) {
      const isLand = landSet.has(`${q},${r}`);
      if (!isLand) {
        hexes.push({ q, r, terrain: "water", elevation: 0 });
        continue;
      }
      actualLand++;
      const elev = noise.sample(q, r, 2.2);
      const isMountain = elev > 1 - mountainDensity * 0.6;
      const isCoast = score < coastThreshold;
      const isForest = elev > 0.55 && elev <= 0.75;
      const isDesert = elev < 0.25 && !isCoast;

      let terrain = "plains";
      if (isMountain) terrain = "mountain";
      else if (isCoast) terrain = "coast";
      else if (isForest) terrain = "forest";
      else if (isDesert) terrain = "desert";

      hexes.push({ q, r, terrain, elevation: elev });
    }

    const landRatioResolved = actualLand / totalCells;
    // Rough estimate: ~1 start position per 80 land hexes, min 2, max 8.
    const estimatedStartPositions = Math.max(2, Math.min(8, Math.round(actualLand / 80)));

    const response: PreviewResponse = {
      ok: true,
      hexes,
      mapWidth: resolved.width,
      mapHeight: resolved.height,
      seed,
      estimatedStartPositions,
      landRatioResolved,
    };
    return jsonResponse(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("preview-world-map error:", msg);
    return jsonResponse(
      {
        ok: false,
        hexes: [],
        mapWidth: 0,
        mapHeight: 0,
        seed: "",
        estimatedStartPositions: 0,
        landRatioResolved: 0,
        error: msg,
      },
      400,
    );
  }
});
