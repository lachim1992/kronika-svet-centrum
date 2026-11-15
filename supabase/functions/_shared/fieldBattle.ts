/** Field battle rules shared by command-dispatch and the map UI (all games). */
export type Cell = { x: number; y: number };
export const MEN_PER_EXTRA_SQUARE = 7200; // 36 micro-squares x 200 men
export const MAX_BATTLEFIELD_SQUARES = 6;
export const cellKey = (c: Cell) => `${c.x},${c.y}`;
/** An enemy army is in reach when it stands on the same or a neighbouring macro square. */
export const battleInRange = (a: Cell, b: Cell) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;
/** How many macro squares the attacker may choose, by total men on the field. */
export const maxBattlefieldSquares = (totalMen: number) =>
  Math.min(MAX_BATTLEFIELD_SQUARES, 1 + Math.ceil(Math.max(0, totalMen) / MEN_PER_EXTRA_SQUARE));

export function validateBattlefield(cells: Cell[], attacker: Cell, defender: Cell, totalMen: number): string | null {
  if (!Array.isArray(cells) || !cells.length) return "Vyber aspoň jedno makropole bojiště";
  const keys = new Set<string>();
  for (const c of cells) {
    if (!Number.isInteger(c?.x) || !Number.isInteger(c?.y)) return "Neplatné pole bojiště";
    keys.add(cellKey(c));
  }
  if (keys.size !== cells.length) return "Pole bojiště se opakuje";
  const max = maxBattlefieldSquares(totalMen);
  if (keys.size > max) return `Bojiště může mít nejvýš ${max} makropolí`;
  if (!keys.has(cellKey(attacker)) || !keys.has(cellKey(defender))) return "Bojiště musí zahrnout pole obou armád";
  const seen = new Set([cellKey(cells[0])]); const q = [cells[0]];
  while (q.length) { const c = q.pop()!;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const k = `${c.x+dx},${c.y+dy}`; if (keys.has(k) && !seen.has(k)) { seen.add(k); q.push({ x: c.x+dx, y: c.y+dy }); } } }
  if (seen.size !== keys.size) return "Makropole bojiště musí na sebe navazovat stranou";
  return null;
}
