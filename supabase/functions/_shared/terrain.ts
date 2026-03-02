/**
 * Shared Terrain Generation Module
 * Multi-octave noise, continent masks, moisture/temperature simulation,
 * proper biome assignment, and strategic map features.
 */

// ── Deterministic hash ──
export function hashSeed(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return ((h >>> 0) % 1000000) / 1000000;
}

// ── Permutation table for gradient noise ──
function buildPerm(seed: string): Uint8Array {
  const p = new Uint8Array(512);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher-Yates shuffle seeded
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(hashSeed(seed + ":perm:" + i) * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 256; i++) p[i + 256] = p[i];
  return p;
}

// ── 2D gradient noise (value noise with smooth interpolation) ──
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function grad2d(perm: Uint8Array, ix: number, iy: number, fx: number, fy: number): number {
  const h = perm[perm[ix & 255] + (iy & 255)] & 3;
  switch (h) {
    case 0: return fx + fy;
    case 1: return -fx + fy;
    case 2: return fx - fy;
    default: return -fx - fy;
  }
}

function noise2d(perm: Uint8Array, x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fade(fx);
  const v = fade(fy);
  const n00 = grad2d(perm, ix, iy, fx, fy);
  const n10 = grad2d(perm, ix + 1, iy, fx - 1, fy);
  const n01 = grad2d(perm, ix, iy + 1, fx, fy - 1);
  const n11 = grad2d(perm, ix + 1, iy + 1, fx - 1, fy - 1);
  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
}

// ── Multi-octave fractal noise ──
export function fractalNoise(
  perm: Uint8Array,
  x: number,
  y: number,
  octaves: number,
  lacunarity = 2.0,
  persistence = 0.5,
): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxAmplitude = 0;
  for (let i = 0; i < octaves; i++) {
    value += noise2d(perm, x * frequency, y * frequency) * amplitude;
    maxAmplitude += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return value / maxAmplitude; // normalized to roughly [-1, 1]
}

// ── Continent mask: creates landmass shapes using multiple blobs ──
function continentMask(
  q: number,
  r: number,
  halfW: number,
  halfH: number,
  blobs: Array<{ cx: number; cy: number; rx: number; ry: number; strength: number }>,
): number {
  // Edge falloff: force ocean at map borders
  const edgeX = Math.abs(q) / halfW;
  const edgeY = Math.abs(r) / halfH;
  const edgeFalloff = Math.max(0, 1 - Math.pow(Math.max(edgeX, edgeY), 2) * 1.2);

  // Blob influence
  let blobVal = 0;
  for (const b of blobs) {
    const dx = (q - b.cx) / b.rx;
    const dy = (r - b.cy) / b.ry;
    const dist = Math.sqrt(dx * dx + dy * dy);
    blobVal += b.strength * Math.max(0, 1 - dist);
  }

  return Math.min(1, blobVal) * edgeFalloff;
}

// ── Generate continent blobs from seed ──
function generateBlobs(
  worldSeed: string,
  halfW: number,
  halfH: number,
  numContinentsOverride?: number,
  landRatioTarget?: number,
): Array<{ cx: number; cy: number; rx: number; ry: number; strength: number }> {
  const numContinents = numContinentsOverride ?? (2 + Math.floor(hashSeed(worldSeed + ":numCont") * 3));
  // Scale blob size based on land ratio target (higher = bigger blobs)
  const sizeScale = landRatioTarget ? 0.6 + landRatioTarget * 0.8 : 1.0;
  const blobs: Array<{ cx: number; cy: number; rx: number; ry: number; strength: number }> = [];

  for (let i = 0; i < numContinents; i++) {
    const cx = (hashSeed(worldSeed + `:cont${i}:cx`) - 0.5) * halfW * 1.4;
    const cy = (hashSeed(worldSeed + `:cont${i}:cy`) - 0.5) * halfH * 1.4;
    const baseR = halfW * (0.3 + hashSeed(worldSeed + `:cont${i}:r`) * 0.4) * sizeScale;
    const rx = baseR * (0.7 + hashSeed(worldSeed + `:cont${i}:rx`) * 0.6);
    const ry = baseR * (0.7 + hashSeed(worldSeed + `:cont${i}:ry`) * 0.6);
    blobs.push({ cx, cy, rx, ry, strength: (0.8 + hashSeed(worldSeed + `:cont${i}:s`) * 0.4) * sizeScale });

    // Sub-blobs for peninsulas / irregular coastlines
    const numSub = 1 + Math.floor(hashSeed(worldSeed + `:cont${i}:nsub`) * 3);
    for (let j = 0; j < numSub; j++) {
      const angle = hashSeed(worldSeed + `:cont${i}:sub${j}:a`) * Math.PI * 2;
      const dist = baseR * (0.5 + hashSeed(worldSeed + `:cont${i}:sub${j}:d`) * 0.5);
      blobs.push({
        cx: cx + Math.cos(angle) * dist,
        cy: cy + Math.sin(angle) * dist,
        rx: baseR * (0.2 + hashSeed(worldSeed + `:cont${i}:sub${j}:rx`) * 0.3),
        ry: baseR * (0.2 + hashSeed(worldSeed + `:cont${i}:sub${j}:ry`) * 0.3),
        strength: 0.5 + hashSeed(worldSeed + `:cont${i}:sub${j}:s`) * 0.5,
      });
    }
  }
  return blobs;
}

// ── Mountain ridge generator ──
function mountainRidgeValue(
  q: number,
  r: number,
  ridges: Array<{ x1: number; y1: number; x2: number; y2: number; width: number; strength: number }>,
): number {
  let maxVal = 0;
  for (const ridge of ridges) {
    // Distance from point to line segment
    const dx = ridge.x2 - ridge.x1;
    const dy = ridge.y2 - ridge.y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((q - ridge.x1) * dx + (r - ridge.y1) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ridge.x1 + t * dx;
    const py = ridge.y1 + t * dy;
    const dist = Math.sqrt((q - px) ** 2 + (r - py) ** 2);
    const val = Math.max(0, 1 - dist / ridge.width) * ridge.strength;
    maxVal = Math.max(maxVal, val);
  }
  return maxVal;
}

function generateRidges(
  worldSeed: string,
  halfW: number,
  halfH: number,
  mountainDensity = 0.5,
): Array<{ x1: number; y1: number; x2: number; y2: number; width: number; strength: number }> {
  const baseRidges = 2 + Math.floor(hashSeed(worldSeed + ":numRidges") * 3);
  const numRidges = Math.max(1, Math.round(baseRidges * (0.5 + mountainDensity)));
  const ridges: Array<{ x1: number; y1: number; x2: number; y2: number; width: number; strength: number }> = [];
  for (let i = 0; i < numRidges; i++) {
    const x1 = (hashSeed(worldSeed + `:ridge${i}:x1`) - 0.5) * halfW * 1.6;
    const y1 = (hashSeed(worldSeed + `:ridge${i}:y1`) - 0.5) * halfH * 1.6;
    const angle = hashSeed(worldSeed + `:ridge${i}:a`) * Math.PI * 2;
    const length = halfW * (0.4 + hashSeed(worldSeed + `:ridge${i}:l`) * 0.8);
    ridges.push({
      x1,
      y1,
      x2: x1 + Math.cos(angle) * length,
      y2: y1 + Math.sin(angle) * length,
      width: (2 + hashSeed(worldSeed + `:ridge${i}:w`) * 4) * (0.6 + mountainDensity * 0.8),
      strength: (0.4 + hashSeed(worldSeed + `:ridge${i}:s`) * 0.4) * (0.6 + mountainDensity * 0.8),
    });
  }
  return ridges;
}

// ── Passability constants ──
export const IMPASSABLE_BIOMES = new Set(["sea", "mountains"]);
export const CITY_ALLOWED_BIOMES = new Set(["plains", "hills", "forest", "swamp"]);

// ── Biome determination ──
export type BiomeFamily = "sea" | "plains" | "forest" | "hills" | "mountains" | "desert" | "swamp" | "tundra";

export function determineBiome(height: number, moisture: number, temp: number): BiomeFamily {
  if (height < 0.15) return "sea";
  if (height > 0.85) return "mountains";
  if (height > 0.7) return "hills";
  if (temp < 0.2 && moisture < 0.3) return "tundra";
  if (temp < 0.25) return moisture > 0.5 ? "forest" : "tundra";
  if (moisture < 0.2 && temp > 0.55) return "desert";
  if (moisture > 0.7 && height < 0.3) return "swamp";
  if (moisture > 0.5) return "forest";
  if (moisture > 0.35) return height > 0.5 ? "hills" : "plains";
  return "plains";
}

// ── River generation (BFS from high points to sea) ──
export interface RiverHex {
  q: number;
  r: number;
  direction: string; // "N" | "NE" | "SE" | "S" | "SW" | "NW"
}

const DIR_LABELS = ["E", "W", "SE", "NW", "NE", "SW"];
const NEIGHBORS_HEX_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

function generateRivers(
  hexGrid: Map<string, { height: number; moisture: number; temp: number; biome: BiomeFamily }>,
  worldSeed: string,
  halfW: number,
  halfH: number,
): RiverHex[] {
  const rivers: RiverHex[] = [];
  const riverSet = new Set<string>();

  // Find river sources: hexes near mountains or high hills
  const sources: Array<{ q: number; r: number; height: number }> = [];
  for (let q = -halfW; q <= halfW; q++) {
    for (let r = -halfH; r <= halfH; r++) {
      const cell = hexGrid.get(`${q},${r}`);
      if (!cell) continue;
      // Source: hills adjacent to mountains, or high hills with moisture
      if (cell.biome === "hills" && cell.height > 0.65 && cell.moisture > 0.3) {
        // Must have a mountain neighbor
        let nearMountain = false;
        for (const [dq, dr] of NEIGHBORS_HEX_DIRS) {
          const nb = hexGrid.get(`${q + dq},${r + dr}`);
          if (nb && nb.biome === "mountains") { nearMountain = true; break; }
        }
        if (nearMountain) sources.push({ q, r, height: cell.height });
      }
    }
  }

  // Deterministic selection of river sources
  const numRivers = Math.min(sources.length, 3 + Math.floor(hashSeed(worldSeed + ":numRivers") * 4));
  // Sort by height descending, pick top N spread out
  sources.sort((a, b) => b.height - a.height);
  const selectedSources: typeof sources = [];
  const MIN_RIVER_SPACING = Math.max(4, halfW * 0.3);
  for (const src of sources) {
    if (selectedSources.length >= numRivers) break;
    const tooClose = selectedSources.some(s => {
      const d = Math.sqrt((src.q - s.q) ** 2 + (src.r - s.r) ** 2);
      return d < MIN_RIVER_SPACING;
    });
    if (!tooClose) selectedSources.push(src);
  }

  // Trace each river downhill to sea
  for (const source of selectedSources) {
    let cur = { q: source.q, r: source.r };
    const visited = new Set<string>();
    let maxSteps = halfW + halfH; // safety limit

    while (maxSteps-- > 0) {
      const key = `${cur.q},${cur.r}`;
      if (visited.has(key)) break;
      visited.add(key);

      const curCell = hexGrid.get(key);
      if (!curCell) break;
      if (curCell.biome === "sea") break; // reached water

      // Find lowest neighbor
      let bestNb: { q: number; r: number; height: number; dirIdx: number } | null = null;
      for (let i = 0; i < NEIGHBORS_HEX_DIRS.length; i++) {
        const [dq, dr] = NEIGHBORS_HEX_DIRS[i];
        const nq = cur.q + dq, nr = cur.r + dr;
        const nb = hexGrid.get(`${nq},${nr}`);
        if (!nb) continue;
        if (nb.biome === "mountains") continue; // rivers don't go through mountains
        if (!bestNb || nb.height < bestNb.height) {
          bestNb = { q: nq, r: nr, height: nb.height, dirIdx: i };
        }
      }

      if (!bestNb) break;
      // Only flow downhill (or flat)
      if (bestNb.height > curCell.height + 0.05) break;

      // Add current hex as river
      if (!riverSet.has(key) && curCell.biome !== "mountains") {
        riverSet.add(key);
        rivers.push({ q: cur.q, r: cur.r, direction: DIR_LABELS[bestNb.dirIdx] });
      }

      cur = { q: bestNb.q, r: bestNb.r };
    }
  }

  return rivers;
}

// ── BFS flood fill for ocean distance ──
function computeOceanDistance(
  grid: Map<string, { height: number }>,
  halfW: number,
  halfH: number,
): Map<string, number> {
  const NEIGHBORS_HEX = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  const dist = new Map<string, number>();
  const queue: Array<[number, number, number]> = [];

  // Seed: all ocean hexes + edges
  for (let q = -halfW; q <= halfW; q++) {
    for (let r = -halfH; r <= halfH; r++) {
      const key = `${q},${r}`;
      const cell = grid.get(key);
      if (!cell || cell.height < 0.15) {
        dist.set(key, 0);
        queue.push([q, r, 0]);
      }
    }
  }

  let head = 0;
  while (head < queue.length) {
    const [q, r, d] = queue[head++];
    for (const [dq, dr] of NEIGHBORS_HEX) {
      const nq = q + dq;
      const nr = r + dr;
      const nk = `${nq},${nr}`;
      if (nq < -halfW || nq > halfW || nr < -halfH || nr > halfH) continue;
      if (!dist.has(nk)) {
        dist.set(nk, d + 1);
        queue.push([nq, nr, d + 1]);
      }
    }
  }
  return dist;
}

// ══════════════════════════════════════════════
// MAIN GENERATOR
// ══════════════════════════════════════════════

export interface HexData {
  q: number;
  r: number;
  seed: string;
  meanHeight: number;       // 0-100 integer
  moistureBand: number;     // 0-4
  tempBand: number;         // 0-4
  biomeFamily: BiomeFamily;
  coastal: boolean;
  hasRiver: boolean;
  riverDirection: string | null;
  isPassable: boolean;
  movementCost: number;
}

export interface GeneratedMap {
  hexes: HexData[];
  rivers: RiverHex[];
  startPositions: Array<{ q: number; r: number }>;
  stats: {
    landRatio: number;
    biomeCounts: Record<string, number>;
    coastalCount: number;
    riverCount: number;
  };
}

export interface TerrainParams {
  targetLandRatio?: number;      // 0-1, default ~0.55
  continentCount?: number;       // 1-6, default 2-4 random
  mountainDensity?: number;      // 0-1, default 0.5
  coastalRichness?: number;      // 0-1, default 0.5
  biomeWeights?: Record<string, number>; // multipliers per biome
}

export function generateWorldTerrain(
  worldSeed: string,
  mapW: number,
  mapH: number,
  params: TerrainParams = {},
): GeneratedMap {
  const halfW = Math.floor(mapW / 2);
  const halfH = Math.floor(mapH / 2);

  const {
    targetLandRatio = 0.55,
    continentCount,
    mountainDensity = 0.5,
    coastalRichness = 0.5,
    biomeWeights = {},
  } = params;

  // Build noise permutation tables
  const permHeight = buildPerm(worldSeed + ":height");
  const permMoist = buildPerm(worldSeed + ":moist");
  const permTemp = buildPerm(worldSeed + ":temp");
  const permDetail = buildPerm(worldSeed + ":detail");

  // Generate continent blobs and mountain ridges (now parameterized)
  const blobs = generateBlobs(worldSeed, halfW, halfH, continentCount, targetLandRatio);
  const ridges = generateRidges(worldSeed, halfW, halfH, mountainDensity);

  const NEIGHBORS_HEX = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

  // ── Phase 1: Raw terrain computation ──
  const rawGrid = new Map<string, { height: number; rawMoist: number; rawTemp: number }>();

  for (let q = -halfW; q <= halfW; q++) {
    for (let r = -halfH; r <= halfH; r++) {
      const key = `${q},${r}`;
      const nx = q / halfW;
      const ny = r / halfH;

      // Height: continent mask + fractal noise + mountain ridges
      const contMask = continentMask(q, r, halfW, halfH, blobs);
      const fractal = fractalNoise(permHeight, q * 0.08, r * 0.08, 6, 2.0, 0.5);
      const detail = fractalNoise(permDetail, q * 0.15, r * 0.15, 3, 2.0, 0.4) * 0.15;
      const ridgeVal = mountainRidgeValue(q, r, ridges);

      // Combine: continent mask gates land/sea, fractal adds variation
      let height = contMask * 0.6 + (fractal * 0.5 + 0.5) * 0.3 + detail + ridgeVal * 0.3;
      // Normalize to 0-1
      height = Math.max(0, Math.min(1, height));

      // Temperature: latitude-based + noise
      const latitudeFactor = 1 - Math.abs(ny) * 0.8; // warmer near equator (r=0)
      const tempNoise = fractalNoise(permTemp, q * 0.05, r * 0.05, 3, 2.0, 0.5) * 0.2;
      const rawTemp = Math.max(0, Math.min(1, latitudeFactor * 0.7 + 0.15 + tempNoise));

      // Moisture: will be refined after ocean distance computation
      const moistNoise = fractalNoise(permMoist, q * 0.06, r * 0.06, 4, 2.0, 0.5);
      const rawMoist = (moistNoise + 1) / 2; // normalize to 0-1

      rawGrid.set(key, { height, rawMoist, rawTemp });
    }
  }

  // ── Phase 2: Ocean distance for moisture ──
  const oceanDist = computeOceanDistance(rawGrid, halfW, halfH);
  const maxDist = Math.max(1, ...Array.from(oceanDist.values()));

  // ── Phase 3: Final terrain values + biome ──
  const hexGrid = new Map<string, {
    height: number; moisture: number; temp: number; biome: BiomeFamily;
  }>();

  for (let q = -halfW; q <= halfW; q++) {
    for (let r = -halfH; r <= halfH; r++) {
      const key = `${q},${r}`;
      const raw = rawGrid.get(key)!;
      const od = oceanDist.get(key) ?? 0;

      // Moisture: combine noise with coastal influence (scaled by coastalRichness)
      const coastalScale = 0.3 + coastalRichness * 0.7; // 0.3-1.0
      const coastalMoist = Math.max(0, 1 - od / (maxDist * (0.3 + (1 - coastalRichness) * 0.5)));
      let moisture = raw.rawMoist * (1 - coastalScale * 0.5) + coastalMoist * coastalScale * 0.5;

      // Altitude reduces temperature
      let temp = raw.rawTemp;
      if (raw.height > 0.6) {
        temp *= 1 - (raw.height - 0.6) * 1.5;
      }
      temp = Math.max(0, Math.min(1, temp));
      moisture = Math.max(0, Math.min(1, moisture));

      let biome = determineBiome(raw.height, moisture, temp);

      // Apply biome weights: if weight < 0.5, try to convert to neighbor-compatible biome
      if (biome !== "sea" && biome !== "mountains") {
        const w = biomeWeights[biome] ?? 1;
        if (w < 0.3) {
          // Very low weight — force re-roll to an alternative
          const alts: BiomeFamily[] = ["plains", "forest", "hills", "desert", "swamp", "tundra"];
          const candidates = alts.filter(b => b !== biome && (biomeWeights[b] ?? 1) > 0.3);
          if (candidates.length > 0) {
            const pick = candidates[Math.floor(hashSeed(`${worldSeed}:bw:${q}:${r}`) * candidates.length)];
            biome = pick;
          }
        }
      }

      hexGrid.set(key, { height: raw.height, moisture, temp, biome });
    }
  }

  // ── Phase 4: Smoothing pass for biome coherence ──
  for (let pass = 0; pass < 2; pass++) {
    for (let q = -halfW; q <= halfW; q++) {
      for (let r = -halfH; r <= halfH; r++) {
        const key = `${q},${r}`;
        const cell = hexGrid.get(key)!;
        if (cell.biome === "sea" || cell.biome === "mountains") continue;

        // Count neighbor biomes
        const nbBiomes: Record<string, number> = {};
        let nbCount = 0;
        for (const [dq, dr] of NEIGHBORS_HEX) {
          const nb = hexGrid.get(`${q + dq},${r + dr}`);
          if (nb) {
            nbBiomes[nb.biome] = (nbBiomes[nb.biome] || 0) + 1;
            nbCount++;
          }
        }

        // If cell is isolated (no neighbor shares its biome), adopt majority
        if (nbCount >= 4 && !(nbBiomes[cell.biome])) {
          let maxBiome = cell.biome;
          let maxCount = 0;
          for (const [b, c] of Object.entries(nbBiomes)) {
            if (b !== "sea" && b !== "mountains" && c > maxCount) {
              maxBiome = b as BiomeFamily;
              maxCount = c;
            }
          }
          cell.biome = maxBiome;
        }

        // Enforce desert-forest separation
        if (cell.biome === "desert" && nbBiomes["forest"]) cell.biome = "plains";
        if (cell.biome === "forest" && nbBiomes["desert"]) cell.biome = "plains";
      }
    }
  }

  // ── Phase 5: Generate rivers ──
  const riverHexes = generateRivers(hexGrid, worldSeed, halfW, halfH);
  const riverMap = new Map<string, RiverHex>();
  for (const rh of riverHexes) riverMap.set(`${rh.q},${rh.r}`, rh);

  // ── Phase 6: Build output ──
  const hexes: HexData[] = [];
  const biomeCounts: Record<string, number> = {};
  let landCount = 0;
  let coastalCount = 0;

  for (let q = -halfW; q <= halfW; q++) {
    for (let r = -halfH; r <= halfH; r++) {
      const cell = hexGrid.get(`${q},${r}`)!;
      const hexSeed = `${worldSeed}:${q}:${r}`;
      const key = `${q},${r}`;

      // Coastal detection
      let coastal = false;
      if (cell.biome !== "sea") {
        landCount++;
        for (const [dq, dr] of NEIGHBORS_HEX) {
          const nb = hexGrid.get(`${q + dq},${r + dr}`);
          if (!nb || nb.biome === "sea") { coastal = true; break; }
        }
        if (coastal) coastalCount++;
      }

      biomeCounts[cell.biome] = (biomeCounts[cell.biome] || 0) + 1;

      const river = riverMap.get(key);
      const hasRiver = !!river;
      const isImpassable = IMPASSABLE_BIOMES.has(cell.biome) || hasRiver;

      hexes.push({
        q, r,
        seed: hexSeed,
        meanHeight: Math.round(cell.height * 100),
        moistureBand: Math.min(4, Math.max(0, Math.round(cell.moisture * 4))),
        tempBand: Math.min(4, Math.max(0, Math.round(cell.temp * 4))),
        biomeFamily: cell.biome,
        coastal,
        hasRiver,
        riverDirection: river?.direction || null,
        isPassable: !isImpassable,
        movementCost: isImpassable ? 0 : (cell.biome === "hills" ? 2 : cell.biome === "swamp" ? 2 : cell.biome === "forest" ? 1 : 1),
      });
    }
  }

  const totalHexes = hexes.length;

  // ── Phase 7: Start positions ──
  const startPositions = findStartPositions(hexes, halfW, halfH);

  return {
    hexes,
    rivers: riverHexes,
    startPositions,
    stats: {
      landRatio: landCount / totalHexes,
      biomeCounts,
      coastalCount,
      riverCount: riverHexes.length,
    },
  };
}

// ── Start position finder ──
function findStartPositions(
  hexes: HexData[],
  halfW: number,
  halfH: number,
): Array<{ q: number; r: number }> {
  const landHexes = hexes.filter(h =>
    h.biomeFamily !== "sea" && h.biomeFamily !== "mountains" && h.biomeFamily !== "swamp"
  );

  // Score each land hex
  const scored = landHexes.map(h => {
    const dist = Math.sqrt(h.q * h.q + h.r * h.r);
    const idealDist = Math.min(halfW, halfH) * 0.45;
    const distScore = 1 - Math.min(1, Math.abs(dist - idealDist) / idealDist);

    const biomeScore =
      h.biomeFamily === "plains" ? 1.0 :
      h.biomeFamily === "hills" ? 0.85 :
      h.biomeFamily === "forest" ? 0.7 :
      0.5;

    // Prefer coastal for trade access
    const coastalBonus = h.coastal ? 0.15 : 0;

    return { q: h.q, r: h.r, score: distScore * 0.5 + biomeScore * 0.35 + coastalBonus };
  });

  scored.sort((a, b) => b.score - a.score);

  const MIN_SPACING = Math.max(6, Math.floor(Math.min(halfW, halfH) * 0.4));
  const positions: Array<{ q: number; r: number }> = [];

  for (const candidate of scored) {
    if (positions.length >= 8) break;
    const tooClose = positions.some(p => {
      const dq = candidate.q - p.q;
      const dr = candidate.r - p.r;
      return Math.sqrt(dq * dq + dr * dr) < MIN_SPACING;
    });
    if (!tooClose) positions.push({ q: candidate.q, r: candidate.r });
  }

  return positions;
}
