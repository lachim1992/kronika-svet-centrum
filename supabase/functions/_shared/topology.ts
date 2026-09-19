// Shared grid topology for edge functions.
// New worlds and all migrated worlds use "square4" (four cardinal neighbours).
// "hex6" remains supported for any world that has not been migrated.

export type GridKind = "hex6" | "square4";

export const HEX6_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
];

export const SQUARE4_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

export function neighborOffsets(kind: GridKind): ReadonlyArray<readonly [number, number]> {
  return kind === "square4" ? SQUARE4_OFFSETS : HEX6_OFFSETS;
}

export function cellDistance(kind: GridKind, aq: number, ar: number, bq: number, br: number): number {
  const dq = aq - bq;
  const dr = ar - br;
  if (kind === "square4") return Math.abs(dq) + Math.abs(dr);
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Cells within `radius` steps of origin (excluding origin itself). */
export function ringCells(kind: GridKind, radius: number): Array<readonly [number, number]> {
  const cells: Array<readonly [number, number]> = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = -radius; dr <= radius; dr++) {
      if (dq === 0 && dr === 0) continue;
      if (cellDistance(kind, dq, dr, 0, 0) <= radius) cells.push([dq, dr]);
    }
  }
  return cells;
}

/** Resolve the immutable topology of a world. Defaults to square4 when unknown. */
export async function loadGridKind(sb: any, sessionId: string): Promise<GridKind> {
  const { data, error } = await sb
    .from("world_foundations")
    .select("grid_kind")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw new Error(`read world topology: ${error.message}`);
  return data?.grid_kind === "hex6" ? "hex6" : "square4";
}
