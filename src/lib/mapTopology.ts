export type GridKind = "hex6" | "square4";
export type GridCell = { a: number; b: number };
export type PixelPoint = { x: number; y: number };

export const HEX6_NEIGHBORS: readonly GridCell[] = [
  { a: 1, b: 0 }, { a: -1, b: 0 }, { a: 0, b: 1 },
  { a: 0, b: -1 }, { a: 1, b: -1 }, { a: -1, b: 1 },
];
export const SQUARE4_NEIGHBORS: readonly GridCell[] = [
  { a: 1, b: 0 }, { a: -1, b: 0 }, { a: 0, b: 1 }, { a: 0, b: -1 },
];

export function cellKey(cell: GridCell): string {
  return `${cell.a},${cell.b}`;
}

export function neighbors(kind: GridKind, cell: GridCell): GridCell[] {
  const offsets = kind === "square4" ? SQUARE4_NEIGHBORS : HEX6_NEIGHBORS;
  return offsets.map(({ a, b }) => ({ a: cell.a + a, b: cell.b + b }));
}

export function gridDistance(kind: GridKind, from: GridCell, to: GridCell): number {
  const da = to.a - from.a;
  const db = to.b - from.b;
  return kind === "square4"
    ? Math.abs(da) + Math.abs(db)
    : (Math.abs(da) + Math.abs(db) + Math.abs(da + db)) / 2;
}

export function projectCell(kind: GridKind, cell: GridCell, size = 38): PixelPoint {
  if (kind === "square4") {
    return { x: (cell.a - cell.b) * size, y: (cell.a + cell.b) * size * 0.5 };
  }
  return { x: size * (Math.sqrt(3) * cell.a + (Math.sqrt(3) / 2) * cell.b), y: size * 1.5 * cell.b };
}

export function squareDiamondPoints(center: PixelPoint, size = 38): string {
  return `${center.x},${center.y - size * 0.5} ${center.x + size},${center.y} ${center.x},${center.y + size * 0.5} ${center.x - size},${center.y}`;
}
