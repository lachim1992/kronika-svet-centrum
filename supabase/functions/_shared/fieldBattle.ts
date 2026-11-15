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

// ───────────────────────── Tactical units, deployment and rounds ─────────────────────────
export const MICRO = 6;
export const MEN_PER_UNIT = 200;
export const MAX_ROUNDS = 40;
export type Side = "attacker" | "defender";
export type UnitType = "INFANTRY" | "ARCHERS" | "MILITIA" | "CAVALRY";
export type Facing = "n" | "s" | "e" | "w";
export type FBUnit = { key: string; side: Side; stackId: string; type: UnitType; men: number; startMen: number; morale: number;
  x: number | null; y: number | null; facing: Facing; status: "ready" | "routed" | "dead" };
export type FBOrder = { seq: number; key: string; kind: "move"; to: { x: number; y: number } } | { seq: number; key: string; kind: "attack"; target: string };
export type FBEvent = { seq: number; key: string; text: string; kind: string; lossesSelf?: number; lossesTarget?: number; target?: string };
export type Terrain = "plain" | "forest" | "hills";

export const MOVE_RANGE: Record<UnitType, number> = { INFANTRY: 2, MILITIA: 2, ARCHERS: 2, CAVALRY: 4 };
export const ARCHER_RANGE = 4;
const ATTACK: Record<UnitType, number> = { INFANTRY: 1, MILITIA: 0.7, ARCHERS: 0.5, CAVALRY: 1.3 };
const RANGED = 0.8;
export const ROUT_MORALE = 25;

const microCell = (x: number, y: number): Cell => ({ x: Math.floor(x / MICRO), y: Math.floor(y / MICRO) });
export const inBattlefield = (field: Cell[], x: number, y: number) => { const c = microCell(x, y); return field.some(f => f.x === c.x && f.y === c.y); };
const cheb = (a: Cell, b: Cell) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const manhattan = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Split a stack into ≤200-man units; unit types follow the stack composition proportionally. */
export function buildUnits(side: Side, stackId: string, soldiers: number, composition: { unit_type: string; manpower: number }[], morale: number): FBUnit[] {
  const n = Math.ceil(Math.max(0, soldiers) / MEN_PER_UNIT);
  const comp = composition.filter(c => c.manpower > 0); const tot = comp.reduce((s, c) => s + c.manpower, 0);
  const types: UnitType[] = [];
  if (tot > 0) { let acc = 0; for (const c of comp) { acc += c.manpower; const until = Math.round(acc / tot * n); while (types.length < until) types.push(normType(c.unit_type)); } }
  const out: FBUnit[] = [];
  for (let i = 0, left = Math.floor(soldiers); left > 0; i++, left -= MEN_PER_UNIT) {
    const men = Math.min(MEN_PER_UNIT, left);
    out.push({ key: `${stackId}:${i}`, side, stackId, type: types[i] ?? "INFANTRY", men, startMen: men, morale, x: null, y: null, facing: "n", status: "ready" });
  }
  return out;
}
const normType = (t: string): UnitType => { const u = String(t).toUpperCase(); return u.includes("ARCH") ? "ARCHERS" : u.includes("CAV") || u.includes("HORSE") ? "CAVALRY" : u.includes("MILIT") ? "MILITIA" : "INFANTRY"; };

/** A side may deploy on battlefield squares at least as close to its own army as to the enemy. */
export function inDeployZone(field: Cell[], own: Cell, enemy: Cell, x: number, y: number) {
  if (!inBattlefield(field, x, y)) return false; const c = microCell(x, y); return cheb(c, own) <= cheb(c, enemy);
}
const faceTo = (from: { x: number; y: number }, to: { x: number; y: number }): Facing => {
  const dx = to.x - from.x, dy = to.y - from.y; return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "e" : "w") : (dy >= 0 ? "s" : "n");
};
/** Place every undeployed unit of a side in ranks in its own zone, front rank towards the enemy. */
export function autoDeploy(units: FBUnit[], side: Side, field: Cell[], own: Cell, enemy: Cell): FBUnit[] {
  const taken = new Set(units.filter(u => u.x !== null).map(u => `${u.x},${u.y}`));
  const ec = { x: enemy.x * MICRO + 2.5, y: enemy.y * MICRO + 2.5 };
  const spots: { x: number; y: number; d: number }[] = [];
  for (const f of field) for (let i = 0; i < MICRO; i++) for (let j = 0; j < MICRO; j++) {
    const x = f.x * MICRO + i, y = f.y * MICRO + j;
    if (!taken.has(`${x},${y}`) && inDeployZone(field, own, enemy, x, y)) spots.push({ x, y, d: Math.hypot(x - ec.x, y - ec.y) });
  }
  spots.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  // Melee first (front), archers behind.
  const order = (u: FBUnit) => u.type === "ARCHERS" ? 2 : u.type === "MILITIA" ? 1 : 0;
  const todo = units.filter(u => u.side === side && u.x === null && u.status === "ready").sort((a, b) => order(a) - order(b));
  const facing = faceTo({ x: own.x, y: own.y }, enemy);
  const placed = new Map<string, { x: number; y: number }>();
  todo.forEach((u, i) => { const s = spots[i]; if (s) placed.set(u.key, s); });
  return units.map(u => placed.has(u.key) ? { ...u, ...placed.get(u.key)!, facing } : u);
}

export type TerrainAt = (x: number, y: number) => Terrain;
const flankOf = (target: FBUnit, from: { x: number; y: number }) => {
  const dir = faceTo({ x: target.x!, y: target.y! }, from);
  const opp: Record<Facing, Facing> = { n: "s", s: "n", e: "w", w: "e" };
  return dir === target.facing ? "front" : dir === opp[target.facing] ? "rear" : "side";
};
const FLANK = { front: 1, side: 1.25, rear: 1.5 } as const;

/** Validate a new order at entry time (the situation may still change before it resolves). */
export function orderProblem(units: FBUnit[], field: Cell[], key: string, o: { kind: string; to?: { x: number; y: number }; target?: string }): string | null {
  const u = units.find(v => v.key === key); if (!u || u.status !== "ready" || u.x === null) return "Oddíl nemůže jednat";
  if (o.kind === "move") {
    if (!o.to || !Number.isInteger(o.to.x) || !Number.isInteger(o.to.y)) return "Neplatný cíl";
    if (!inBattlefield(field, o.to.x, o.to.y)) return "Cíl je mimo bojiště";
    if (manhattan(u as any, o.to) > MOVE_RANGE[u.type]) return `Oddíl dojde nejvýš ${MOVE_RANGE[u.type]} políčka`;
    return null;
  }
  if (o.kind === "attack") {
    const t = units.find(v => v.key === o.target); if (!t || t.side === u.side || t.status !== "ready") return "Neplatný cíl útoku";
    return null;
  }
  return "Neznámý rozkaz";
}

/** Resolve one battle round: attacker's first order first, then entry order; each unit acts once; dead/routed units do not act. */
export function resolveRound(units0: FBUnit[], orders: FBOrder[], field: Cell[], terrainAt: TerrainAt, rand: () => number) {
  const units = units0.map(u => ({ ...u }));
  const by = new Map(units.map(u => [u.key, u]));
  const sorted = [...orders].sort((a, b) => a.seq - b.seq);
  const firstAtt = sorted.findIndex(o => by.get(o.key)?.side === "attacker");
  if (firstAtt > 0) sorted.unshift(sorted.splice(firstAtt, 1)[0]);
  const events: FBEvent[] = []; const acted = new Set<string>();
  const occupied = (x: number, y: number) => units.some(u => u.status === "ready" && u.x === x && u.y === y);
  const hit = (a: FBUnit, t: FBUnit, ranged: boolean) => {
    const flank = flankOf(t, a as any);
    const tt = terrainAt(t.x!, t.y!);
    const cover = tt === "forest" ? (ranged ? 0.6 : 0.8) : tt === "hills" ? 0.85 : 1;
    const height = terrainAt(a.x!, a.y!) === "hills" && tt !== "hills" ? 1.15 : 1;
    const power = a.men * 0.12 * (ranged ? RANGED : ATTACK[a.type]) * (0.5 + a.morale / 200) * FLANK[flank] * cover * height * (0.85 + rand() * 0.3);
    const loss = Math.min(t.men, Math.max(1, Math.round(power)));
    t.men -= loss;
    t.morale = Math.max(0, Math.round(t.morale - (loss / Math.max(1, t.startMen)) * 60 - (flank === "rear" ? 12 : flank === "side" ? 6 : 0)));
    if (t.men <= 0) t.status = "dead"; else if (t.morale < ROUT_MORALE) t.status = "routed";
    return { loss, flank };
  };
  for (const o of sorted) {
    const u = by.get(o.key); if (!u || acted.has(u.key) || u.status !== "ready" || u.x === null) continue;
    acted.add(u.key);
    if (o.kind === "move") {
      if (!inBattlefield(field, o.to.x, o.to.y) || manhattan(u as any, o.to) > MOVE_RANGE[u.type]) { events.push({ seq: o.seq, key: u.key, kind: "move_fail", text: "pohyb mimo dosah" }); continue; }
      if (occupied(o.to.x, o.to.y)) { events.push({ seq: o.seq, key: u.key, kind: "move_blocked", text: "cílové políčko je obsazené" }); continue; }
      u.facing = faceTo(u as any, o.to); u.x = o.to.x; u.y = o.to.y;
      events.push({ seq: o.seq, key: u.key, kind: "move", text: `přesun na ${o.to.x},${o.to.y}` });
      continue;
    }
    const t = by.get(o.target);
    if (!t || t.status !== "ready" || t.x === null) { events.push({ seq: o.seq, key: u.key, kind: "attack_void", target: o.target, text: "cíl už nebojuje" }); continue; }
    const d = Math.max(Math.abs(u.x - t.x), Math.abs(u.y! - t.y));
    const ranged = u.type === "ARCHERS" && d > 1;
    if (d > (u.type === "ARCHERS" ? ARCHER_RANGE : 1)) { events.push({ seq: o.seq, key: u.key, kind: "attack_miss", target: t.key, text: "cíl mezitím odešel z dosahu" }); continue; }
    u.facing = faceTo(u as any, t as any);
    const r = hit(u, t, ranged);
    let back = 0;
    if (!ranged && r.flank !== "rear" && t.status === "ready") { const save = t.men; const rr = hit({ ...t, men: Math.round(save * 0.5) }, u, false); back = rr.loss; }
    events.push({ seq: o.seq, key: u.key, kind: "attack", target: t.key, lossesTarget: r.loss, lossesSelf: back,
      text: `${ranged ? "střelba" : "útok"} ${r.flank === "front" ? "zepředu" : r.flank === "side" ? "z boku" : "do týlu"}: ${r.loss} padlých${back ? `, vlastní ztráty ${back}` : ""}${t.status === "routed" ? ", nepřítel prchá" : t.status === "dead" ? ", oddíl zničen" : ""}` });
  }
  const alive = (s: Side) => units.some(u => u.side === s && u.status === "ready");
  const winner: Side | "draw" | null = !alive("attacker") && !alive("defender") ? "draw" : !alive("attacker") ? "defender" : !alive("defender") ? "attacker" : null;
  return { units, events, winner };
}

/** Final per-stack outcome: dead men are lost; routed units return to their stack. */
export function stackOutcome(units: FBUnit[]) {
  const out = new Map<string, { men: number; lost: number; morale: number }>();
  for (const u of units) {
    const o = out.get(u.stackId) ?? { men: 0, lost: 0, morale: 0 };
    o.men += u.men; o.lost += u.startMen - u.men; o.morale += u.morale * u.men; out.set(u.stackId, o);
  }
  for (const o of out.values()) o.morale = o.men > 0 ? Math.round(o.morale / o.men) : 0;
  return out;
}
