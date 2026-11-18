// Client mirror: cities and resource nodes connect only on their own macro cell
// or one cardinal neighbour. Upgrades never extend road catchment.

export const MAX_CATCHMENT_RADIUS = 4;

export function nodeCatchmentRadius(_node: {
  node_tier?: string | null; upgrade_level?: number | null; infrastructure_level?: number | null;
}): number {
  return 1;
}

export function cityCatchmentRadius(_city: { settlement_level?: string | number | null; development_level?: number | null }): number {
  return 1;
}

export function tileDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}
