import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface PreviewHex {
  q: number;
  r: number;
  terrain: string; // "water" | "plains" | "forest" | "hills" | "mountain" | "desert" | "tundra" | "coast"
  elevation?: number;
}

interface SchematicMapPreviewProps {
  width: number; // grid width in hexes
  height: number; // grid height in hexes
  seed: string;
  targetLandRatio: number; // 0..1
  continentShape: string;
  mountainDensity: number; // 0..1
  /**
   * If provided, renders these hexes directly (used after a "full preview"
   * call). When null, computes a client-side schematic.
   */
  fullPreviewHexes?: PreviewHex[] | null;
  isFullPreview?: boolean;
}

// ── Tiny deterministic noise (no external deps) ──────────────────────────────

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

// Value-noise sampling at hex coords. Smooth-ish via averaging neighbours.
function makeNoise(seed: string) {
  const seedNum = hashSeed(seed);
  // Pre-build a coarse grid of random values for low-frequency continent shape.
  const cache = new Map<string, number>();
  function rand(ix: number, iy: number) {
    const k = `${ix},${iy}`;
    let v = cache.get(k);
    if (v === undefined) {
      const r = mulberry32(seedNum ^ (ix * 73856093) ^ (iy * 19349663))();
      v = r;
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

// Bias function based on continent shape — modulates land probability by
// position in the grid.
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
  const dist = Math.sqrt(dx * dx + dy * dy); // 0 center .. ~1.41 corners

  switch (shape) {
    case "pangaea": {
      // Strong center bias: land in middle, water at edges
      return Math.max(0, 1 - dist * 0.85);
    }
    case "archipelago": {
      // Multiple small island clusters
      const r1 = mulberry32(seedNum ^ 1)();
      const r2 = mulberry32(seedNum ^ 2)();
      const islandX = Math.cos(q * 0.7 + r1 * 6) * Math.sin(r * 0.7 + r2 * 6);
      return 0.35 + islandX * 0.4;
    }
    case "two_continents": {
      // Two land masses left and right
      const lobe = Math.abs(dx) > 0.2 ? 1 - Math.abs(Math.abs(dx) - 0.55) * 1.5 : 0;
      return Math.max(0, lobe - Math.abs(dy) * 0.5);
    }
    case "crescent": {
      // Curved landmass
      const target = Math.cos(dx * Math.PI * 0.7) * 0.6;
      return Math.max(0, 1 - Math.abs(dy - target) * 1.5 - dist * 0.2);
    }
    case "mixed":
    default: {
      // Mild center bias
      return Math.max(0, 0.85 - dist * 0.5);
    }
  }
}

// ── Render ───────────────────────────────────────────────────────────────────

const TERRAIN_COLORS: Record<string, string> = {
  water: "#1e3a5f",
  ocean: "#1e3a5f",
  sea: "#234c7a",
  coast: "#c2a878",
  beach: "#c2a878",
  plains: "#6b9b4a",
  grassland: "#6b9b4a",
  forest: "#3f6b3a",
  hills: "#8a7d4a",
  mountain: "#6b5d4f",
  mountains: "#6b5d4f",
  desert: "#d4b878",
  tundra: "#b8c4cc",
  swamp: "#4a5e3a",
  snow: "#e8eef0",
};

function colorFor(terrain: string): string {
  return TERRAIN_COLORS[terrain] ?? "#6b9b4a";
}

function computeSchematicHexes(
  width: number,
  height: number,
  seed: string,
  targetLandRatio: number,
  continentShape: string,
  mountainDensity: number,
): PreviewHex[] {
  const noise = makeNoise(seed);
  const seedNum = hashSeed(seed);
  const out: PreviewHex[] = [];

  // First pass: compute raw land scores; we'll then threshold to hit target ratio.
  const scored: Array<{ q: number; r: number; score: number }> = [];
  for (let r = 0; r < height; r++) {
    for (let q = 0; q < width; q++) {
      const n = noise.sample(q, r, 4.5); // medium-frequency
      const bias = shapeBias(continentShape, q, r, width, height, seedNum);
      const score = n * 0.55 + bias * 0.55;
      scored.push({ q, r, score });
    }
  }

  // Sort by score and take top N as land to hit target ratio.
  const targetLandCount = Math.round(scored.length * targetLandRatio);
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const landSet = new Set<string>();
  for (let i = 0; i < targetLandCount; i++) {
    const c = sorted[i];
    landSet.add(`${c.q},${c.r}`);
  }

  for (const { q, r, score } of scored) {
    const isLand = landSet.has(`${q},${r}`);
    if (!isLand) {
      out.push({ q, r, terrain: "water" });
      continue;
    }
    // Land sub-classification.
    const elevNoise = noise.sample(q, r, 2.2);
    const isMountain = elevNoise > (1 - mountainDensity * 0.6);
    const isCoast =
      // Approximate: low score within land set → near edge of landmass.
      score < (sorted[Math.floor(targetLandCount * 0.85)]?.score ?? 0);
    const isForest = elevNoise > 0.55 && elevNoise <= 0.75;
    const isDesert = elevNoise < 0.25 && !isCoast;

    let terrain = "plains";
    if (isMountain) terrain = "mountain";
    else if (isCoast) terrain = "coast";
    else if (isForest) terrain = "forest";
    else if (isDesert) terrain = "desert";

    out.push({ q, r, terrain, elevation: elevNoise });
  }

  return out;
}

export const SchematicMapPreview = ({
  width,
  height,
  seed,
  targetLandRatio,
  continentShape,
  mountainDensity,
  fullPreviewHexes,
  isFullPreview,
}: SchematicMapPreviewProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const hexes =
      fullPreviewHexes && fullPreviewHexes.length > 0
        ? fullPreviewHexes
        : computeSchematicHexes(
            width,
            height,
            seed,
            targetLandRatio,
            continentShape,
            mountainDensity,
          );

    // Determine canvas size — fit to container, maintain aspect ratio.
    const cssWidth = canvas.clientWidth || 280;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Hex size: pointy-top, sized to fit width.
    // For pointy-top, width per hex = sqrt(3)*size, vertical = 1.5*size between rows.
    const hexSize = cssWidth / (Math.sqrt(3) * (width + 0.5));
    const hexW = Math.sqrt(3) * hexSize;
    const hexH = 2 * hexSize;
    const cssHeight = hexH * 0.75 * height + hexH * 0.25;

    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    canvas.style.height = `${cssHeight}px`;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    // Index by coords for quick lookup
    const map = new Map<string, PreviewHex>();
    for (const h of hexes) map.set(`${h.q},${h.r}`, h);

    for (let r = 0; r < height; r++) {
      for (let q = 0; q < width; q++) {
        const h = map.get(`${q},${r}`);
        if (!h) continue;
        const offset = r % 2 === 0 ? 0 : hexW / 2;
        const cx = q * hexW + offset + hexW / 2;
        const cy = r * hexH * 0.75 + hexH / 2;

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i + Math.PI / 6;
          const px = cx + hexSize * Math.cos(angle);
          const py = cy + hexSize * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = colorFor(h.terrain);
        ctx.fill();
      }
    }
  }, [
    width,
    height,
    seed,
    targetLandRatio,
    continentShape,
    mountainDensity,
    fullPreviewHexes,
  ]);

  return (
    <div
      className={cn(
        "relative rounded-md p-2 bg-card",
        isFullPreview
          ? "border-2 border-solid border-primary"
          : "border-2 border-dashed border-muted-foreground/40",
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <Badge variant={isFullPreview ? "default" : "secondary"} className="text-xs">
          {isFullPreview ? "Plný náhled (skutečný engine)" : "Rychlý náhled (přibližný)"}
        </Badge>
        <span className="text-[10px] text-muted-foreground">
          {width}×{height}
        </span>
      </div>
      <canvas ref={canvasRef} className="w-full block" />
    </div>
  );
};
