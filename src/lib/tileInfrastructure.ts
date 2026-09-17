import { ROAD_TIERS } from "@/lib/roadNetwork";

const CZECH_LABELS: Record<number, string> = { 1: "Stezka", 2: "Cesta", 3: "Dlážděná cesta" };

/** Compatibility view of the canonical road tiers for older map callers. */
export const TILE_INFRASTRUCTURE_LEVELS = ROAD_TIERS.map(tier => ({
  level: tier.level,
  key: tier.key,
  label: CZECH_LABELS[tier.level] || tier.label,
  gold: tier.cost.gold,
  production: tier.cost.production,
  turns: tier.buildTurns,
  capacity: tier.capacity,
  speed: tier.speed,
  friction: tier.friction,
  maintenance: tier.maintenance,
}));

export const tileInfrastructureLevel = (level: number) =>
  TILE_INFRASTRUCTURE_LEVELS.find(item => item.level === level);

export type LocalRoadPoint = { x: number; y: number };

/** Deterministic orthogonal network: every occupied parcel joins the cell's central junction. */
export function localRoadSegments(parcelIndexes: number[], cols = 6, rows = 6) {
  const centre = { x: Math.floor((cols - 1) / 2), y: Math.floor((rows - 1) / 2) };
  const unique = [...new Set(parcelIndexes)];
  const edges = new Map<string, { from: LocalRoadPoint; to: LocalRoadPoint }>();
  const add = (from: LocalRoadPoint, to: LocalRoadPoint) => {
    const a = `${from.x},${from.y}`; const b = `${to.x},${to.y}`;
    edges.set(a < b ? `${a}>${b}` : `${b}>${a}`, { from, to });
  };
  unique.forEach(index => {
    let x = index % cols; let y = Math.floor(index / cols);
    while (x !== centre.x) { const next = { x: x + (x < centre.x ? 1 : -1), y }; add({ x, y }, next); x = next.x; }
    while (y !== centre.y) { const next = { x, y: y + (y < centre.y ? 1 : -1) }; add({ x, y }, next); y = next.y; }
  });
  return [...edges.values()];
}
