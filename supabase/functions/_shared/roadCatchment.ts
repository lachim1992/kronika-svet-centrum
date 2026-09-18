// ════════════════════════════════════════════════════════════════
// ROAD CATCHMENT (dosah napojení na silniční systém)
//
// A node/city does NOT need a road on its own tile. Every settlement has a
// catchment radius: if a completed road (or navigable river) cell lies within
// that radius, the node attaches to the transport system through a virtual
// "spur" (feeder path) — a short off-road haul with extra friction and a
// limited capacity.
//
// SSOT: radius depends only on Layer A properties (tier, upgrade,
// infrastructure). It never depends on goods or fiscal state.
// ════════════════════════════════════════════════════════════════

export const SPUR_COST_PER_TILE = 1.4; // off-road haul is pricier than a road tile
export const MAX_CATCHMENT_RADIUS = 4;

/** Catchment radius of a production/settlement node, in tiles. */
export function nodeCatchmentRadius(node: any): number {
  const tier = String(node?.node_tier ?? "").toLowerCase();
  let base = 1;
  if (tier.includes("capital") || tier.includes("major")) base = 3;
  else if (tier.includes("minor")) base = 2;
  else base = 1;

  const upgrade = Math.max(0, Number(node?.upgrade_level ?? 1) - 1);
  if (upgrade >= 2) base += 1;
  if (Number(node?.infrastructure_level ?? 0) >= 2) base += 1;

  return Math.min(MAX_CATCHMENT_RADIUS, base);
}

/** Catchment radius of a city, in tiles. */
export function cityCatchmentRadius(city: any): number {
  const level = Number(city?.city_level ?? city?.settlement_level ?? city?.level ?? 1);
  let base = 2;
  if (level >= 4) base = 3;
  if (level >= 6) base = 4;
  return Math.min(MAX_CATCHMENT_RADIUS, base);
}

export function tileDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/**
 * Nearest transport cell ("x,y" keys) within `radius`. Returns the cell key and
 * its tile distance, or null when nothing is in reach.
 */
export function nearestTransportCell(
  x: number,
  y: number,
  radius: number,
  transportCells: Set<string>,
): { cell: string; dist: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (transportCells.has(`${x},${y}`)) return { cell: `${x},${y}`, dist: 0 };

  let best: { cell: string; dist: number } | null = null;
  for (let d = 1; d <= radius; d++) {
    for (let dx = -d; dx <= d; dx++) {
      for (let dy = -d; dy <= d; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        const key = `${x + dx},${y + dy}`;
        if (transportCells.has(key)) {
          if (!best || d < best.dist) best = { cell: key, dist: d };
        }
      }
    }
    if (best) break; // ring search: first hit is the closest
  }
  return best;
}

/** Throughput of a feeder spur — shorter hauls carry more. */
export function spurCapacity(dist: number): number {
  return Math.max(6, Math.round((60 / (1 + Math.max(0, dist))) * 10) / 10);
}
