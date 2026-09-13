// ─────────────────────────────────────────────────────────────────────────────
// River network on the square grid.
// A river starts at a highland source and walks cell by cell (cardinal steps only)
// downhill towards the nearest water body, so every river ends in a sea/lake cell.
// The result marks whole map cells; the sub-parcel channel inside a cell is drawn
// deterministically by tileParcels.ts, which lines the crossings up across borders.
// ─────────────────────────────────────────────────────────────────────────────

export type RiverCell = {
  gridX: number;
  gridY: number;
  elevation: number;
  isWater: boolean;
};

export type RiverResult = {
  /** key `x,y` → outflow direction of the river inside that cell */
  cells: Map<string, string>;
  riverCount: number;
};

const STEPS: Array<[number, number, string]> = [
  [1, 0, "east"],
  [-1, 0, "west"],
  [0, 1, "south"],
  [0, -1, "north"],
];

const key = (x: number, y: number) => `${x},${y}`;

function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return (value >>> 0) / 0x100000000;
}

/** BFS distance (in cells) to the nearest water cell. */
function waterDistanceField(cells: RiverCell[]): Map<string, number> {
  const lookup = new Map<string, RiverCell>();
  for (const cell of cells) lookup.set(key(cell.gridX, cell.gridY), cell);

  const distance = new Map<string, number>();
  const queue: RiverCell[] = [];
  for (const cell of cells) {
    if (cell.isWater) {
      distance.set(key(cell.gridX, cell.gridY), 0);
      queue.push(cell);
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    const currentDistance = distance.get(key(current.gridX, current.gridY)) ?? 0;
    for (const [dx, dy] of STEPS) {
      const nextKey = key(current.gridX + dx, current.gridY + dy);
      const next = lookup.get(nextKey);
      if (!next || distance.has(nextKey)) continue;
      distance.set(nextKey, currentDistance + 1);
      queue.push(next);
    }
  }
  return distance;
}

/**
 * Builds the river network for one world.
 * `seed` keeps the layout stable for the same world seed.
 */
export function buildRiverNetwork(seed: string, cells: RiverCell[], maxLength = 14): RiverResult {
  const lookup = new Map<string, RiverCell>();
  for (const cell of cells) lookup.set(key(cell.gridX, cell.gridY), cell);
  const toWater = waterDistanceField(cells);

  const land = cells.filter((cell) => !cell.isWater);
  if (land.length === 0 || land.length === cells.length) return { cells: new Map(), riverCount: 0 };

  // Sources: highland cells that still have a reachable coast, spread over the map.
  const candidates = land
    .filter((cell) => (toWater.get(key(cell.gridX, cell.gridY)) ?? Infinity) <= maxLength)
    .map((cell) => ({
      cell,
      score: cell.elevation + hash(`${seed}:src:${cell.gridX}:${cell.gridY}`) * 25,
    }))
    .sort((a, b) => b.score - a.score);

  const target = Math.max(3, Math.round(land.length / 55));
  const rivers = new Map<string, string>();
  const sources: RiverCell[] = [];

  for (const candidate of candidates) {
    if (sources.length >= target) break;
    const tooClose = sources.some(
      (source) =>
        Math.abs(source.gridX - candidate.cell.gridX) + Math.abs(source.gridY - candidate.cell.gridY) < 4,
    );
    if (tooClose) continue;
    sources.push(candidate.cell);
  }

  for (const source of sources) {
    let current = source;
    const visited = new Set<string>([key(current.gridX, current.gridY)]);
    for (let step = 0; step < maxLength; step += 1) {
      let best: { cell: RiverCell; direction: string; cost: number } | null = null;
      for (const [dx, dy, direction] of STEPS) {
        const nextKey = key(current.gridX + dx, current.gridY + dy);
        const next = lookup.get(nextKey);
        if (!next || visited.has(nextKey)) continue;
        const distance = toWater.get(nextKey) ?? 99;
        const jitter = hash(`${seed}:flow:${nextKey}:${step}`) * 1.5;
        // Flow towards water, prefer going downhill, allow small detours.
        const cost = distance * 3 + next.elevation / 25 + jitter;
        if (!best || cost < best.cost) best = { cell: next, direction, cost };
      }
      if (!best) break;
      rivers.set(key(current.gridX, current.gridY), best.direction);
      visited.add(key(best.cell.gridX, best.cell.gridY));
      if (best.cell.isWater) break;
      rivers.set(key(best.cell.gridX, best.cell.gridY), best.direction);
      current = best.cell;
    }
  }

  return { cells: rivers, riverCount: sources.length };
}
