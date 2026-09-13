export const TILE_INFRASTRUCTURE_LEVELS = [
  { level: 1, key: "trail", label: "Stezka", gold: 30, production: 20, turns: 1 },
  { level: 2, key: "road", label: "Cesta", gold: 65, production: 45, turns: 2 },
  { level: 3, key: "paved", label: "Dlážděná cesta", gold: 120, production: 80, turns: 3 },
] as const;

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
