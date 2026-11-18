/** Field battle rules shared by command-dispatch and the map UI (all games). */
import { generalCommandPoints, generalMoraleLossReduction, generalRallyStrength } from "./generalCommand.ts";
export type Cell = { x: number; y: number };
export const MEN_PER_EXTRA_SQUARE = 7200; // 36 micro-squares x 200 men
export const MAX_BATTLEFIELD_SQUARES = 6;
export const cellKey = (c: Cell) => `${c.x},${c.y}`;
/** An enemy army is in reach when it stands on the same or a neighbouring macro square. */
export const battleInRange = (a: Cell, b: Cell) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;
/** How many macro squares the attacker may choose, by total men on the field. */
export const maxBattlefieldSquares = (totalMen: number) =>
  Math.min(MAX_BATTLEFIELD_SQUARES, 1 + Math.ceil(Math.max(0, totalMen) / MEN_PER_EXTRA_SQUARE));

/** Smallest contiguous battlefield containing both macro cells. */
export function minimalBattlefield(attacker: Cell, defender: Cell): Cell[] {
  const cells = [{ ...attacker }];
  if (attacker.x !== defender.x && attacker.y !== defender.y) cells.push({ x: defender.x, y: attacker.y });
  if (attacker.x !== defender.x || attacker.y !== defender.y) cells.push({ ...defender });
  return cells;
}

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

// ───────────────────────── Battle System v1: units, formations, deployment, rounds ─────────────────────────
export const MICRO = 6;
export const MEN_PER_UNIT = 200;
export const MAX_ROUNDS = 40;
export const ROUT_MORALE = 25;
export const BASE_CP = 4;
export const MAX_CP = 7;
export type Side = "attacker" | "defender";
export const otherSide = (s: Side): Side => s === "attacker" ? "defender" : "attacker";

export const UNIT_TYPES = ["MILITIA", "SPEARMEN", "SWORDSMEN", "AXEMEN", "ARCHERS", "SLINGERS", "JAVELINERS",
  "LIGHT_CAVALRY", "HEAVY_CAVALRY", "ELITE_GUARD", "ENGINEERS"] as const;
export type UnitType = typeof UNIT_TYPES[number];
export type UnitStats = { melee: number; ranged: number; defense: number; armor: number; move: number; range: number; ammo: number };
export const UNIT_STATS: Record<UnitType, UnitStats> = {
  MILITIA:       { melee: 14, ranged: 0,  defense: 14, armor: 5,  move: 2, range: 1, ammo: 0 },
  SPEARMEN:      { melee: 17, ranged: 0,  defense: 30, armor: 15, move: 2, range: 1, ammo: 0 },
  SWORDSMEN:     { melee: 23, ranged: 0,  defense: 22, armor: 15, move: 2, range: 1, ammo: 0 },
  AXEMEN:        { melee: 26, ranged: 0,  defense: 14, armor: 10, move: 2, range: 1, ammo: 0 },
  ARCHERS:       { melee: 7,  ranged: 18, defense: 8,  armor: 5,  move: 2, range: 5, ammo: 6 },
  SLINGERS:      { melee: 9,  ranged: 14, defense: 10, armor: 5,  move: 3, range: 5, ammo: 8 },
  JAVELINERS:    { melee: 14, ranged: 17, defense: 10, armor: 6,  move: 3, range: 2, ammo: 3 },
  LIGHT_CAVALRY: { melee: 21, ranged: 0,  defense: 16, armor: 12, move: 4, range: 1, ammo: 0 },
  HEAVY_CAVALRY: { melee: 27, ranged: 0,  defense: 24, armor: 24, move: 3, range: 1, ammo: 0 },
  ELITE_GUARD:   { melee: 25, ranged: 0,  defense: 30, armor: 22, move: 2, range: 1, ammo: 0 },
  ENGINEERS:     { melee: 8,  ranged: 0,  defense: 15, armor: 10, move: 2, range: 1, ammo: 0 },
};
export const isCavalry = (t: UnitType) => t === "LIGHT_CAVALRY" || t === "HEAVY_CAVALRY";
export const isRanged = (t: UnitType) => UNIT_STATS[t].ranged > 0;
export const isInfantry = (t: UnitType) => !isCavalry(t) && !isRanged(t);
/** Map any stored unit_type (incl. legacy) onto the battle catalogue; PROFESSIONAL/INFANTRY → SWORDSMEN. */
export function normalizeUnitType(raw: string | null | undefined): UnitType {
  const u = String(raw || "").toUpperCase();
  if ((UNIT_TYPES as readonly string[]).includes(u)) return u as UnitType;
  if (u === "PROFESSIONAL" || u === "INFANTRY") return "SWORDSMEN";
  if (u === "CAVALRY" || u.includes("HORSE")) return "LIGHT_CAVALRY";
  if (u.includes("ARCH")) return "ARCHERS";
  return "MILITIA";
}

// ── Formations ──
export const FORMATIONS = ["line", "shieldwall", "deep", "loose", "wedge", "square", "skirmish"] as const;
export type Formation = typeof FORMATIONS[number];
export const FORMATION_INFO: Record<Formation, { label: string; text: string }> = {
  line: { label: "Linie", text: "+5 % útok, +5 % obrana" },
  shieldwall: { label: "Štítová hradba", text: "+25 % čelní obrana, −10 % útok · pohyb −1 (jen pěchota)" },
  deep: { label: "Hluboký šik", text: "+15 % útok zblízka, +10 % obrana · pohyb −1 (jen pěchota)" },
  loose: { label: "Volný šik", text: "−25 % obdržené střelecké poškození · pohyb +1" },
  wedge: { label: "Klín", text: "+35 % náraz (jízda a pěchota)" },
  square: { label: "Čtverec", text: "+20 % obrana ze všech stran · pohyb −1 (jen pěchota)" },
  skirmish: { label: "Rozptyl", text: "+15 % střelecký útok · pohyb +1 (jen střelci, oštěpaři, lehká jízda)" },
};
/** Stored value → canonical formation (legacy column = deep). */
export function normalizeFormation(raw: string | null | undefined): Formation {
  const f = String(raw || "line").toLowerCase();
  if (f === "column") return "deep";
  return (FORMATIONS as readonly string[]).includes(f) ? f as Formation : "line";
}
export function formationAllowed(f: Formation, t: UnitType): boolean {
  if (f === "skirmish") return isRanged(t) || t === "LIGHT_CAVALRY";
  if (f === "shieldwall" || f === "deep" || f === "square") return isInfantry(t);
  if (f === "wedge") return isCavalry(t) || isInfantry(t);
  return true;
}
/** Formation a unit really uses: the stack formation if allowed for its type, otherwise line. */
export const unitFormation = (stackFormation: string | null | undefined, t: UnitType): Formation => {
  const f = normalizeFormation(stackFormation); return formationAllowed(f, t) ? f : "line";
};

/** Deployment-phase formation change for selected units of one side; incompatible types are rejected, never silently changed. */
export function applyFormation(units: FBUnit[], side: Side, keys: string[], raw: string) {
  const f = String(raw || "").toLowerCase();
  if (!(FORMATIONS as readonly string[]).includes(f)) return { units, accepted: [] as string[], rejected: keys.map(key => ({ key, reason: "Neznámá formace" })) };
  const accepted: string[] = [], rejected: { key: string; reason: string }[] = [];
  const next = units.map(u => {
    if (!keys.includes(u.key)) return u;
    if (u.side !== side) { rejected.push({ key: u.key, reason: "Oddíl nepatří této straně" }); return u; }
    if (u.status === "dead" || u.status === "routed") { rejected.push({ key: u.key, reason: "Oddíl už nebojuje" }); return u; }
    if (!formationAllowed(f as Formation, u.type)) { rejected.push({ key: u.key, reason: `${FORMATION_INFO[f as Formation].label} není pro tento typ` }); return u; }
    accepted.push(u.key); return { ...u, formation: f as Formation };
  });
  for (const k of keys) if (!units.some(u => u.key === k)) rejected.push({ key: k, reason: "Neznámý oddíl" });
  return { units: next, accepted, rejected };
}

// ── Terrain (from tile_parcels.sub_biome) ──
export type Terrain = "plain" | "forest" | "hills" | "marsh" | "village" | "water";
const TERRAIN_BY_SUB_BIOME: Record<string, Terrain> = {
  dense_forest: "forest", ridge_woods: "forest",
  hillock: "hills", steep_slope: "hills", cliff_edge: "hills", terrace: "hills", saddle: "hills", permafrost_rise: "hills",
  boggy_dip: "marsh", reed_marsh: "marsh",
  open_water: "water", river_channel: "water",
};
/** Known sub-biomes map to battle terrain; anything unknown is honest PLAIN. No sub-biome is a village today. */
export const terrainOfSubBiome = (sb: string | null | undefined): Terrain => TERRAIN_BY_SUB_BIOME[String(sb || "").toLowerCase()] ?? "plain";
export type TerrainAt = (x: number, y: number) => Terrain;

// ── Units ──
export type Facing = "n" | "s" | "e" | "w";
export type UnitStatus = "ready" | "routed" | "dead" | "reserve";
export type FBUnit = { key: string; side: Side; stackId: string; compId: string | null; sourceType: string | null; type: UnitType;
  formation: Formation; men: number; startMen: number; morale: number; fatigue: number; ammo: number; quality: number;
  x: number | null; y: number | null; facing: Facing; status: UnitStatus };
/** Normalise a stored unit (also v0 rows without the new fields). */
export function upgradeUnit(u: any): FBUnit {
  const type = normalizeUnitType(u.type);
  const status: UnitStatus = u.status === "routed" && u.x === null && u.reserve !== false && u.fatigue === undefined ? "reserve" : (u.status ?? "ready");
  return { key: u.key, side: u.side, stackId: u.stackId, compId: u.compId ?? null, sourceType: u.sourceType ?? null, type,
    formation: u.formation ? normalizeFormation(u.formation) : "line", men: u.men, startMen: u.startMen ?? u.men, morale: u.morale ?? 70,
    fatigue: u.fatigue ?? 0, ammo: u.ammo ?? UNIT_STATS[type].ammo, quality: u.quality ?? 1, x: u.x ?? null, y: u.y ?? null, facing: u.facing ?? "n", status };
}

/** Stored composition quality 0–100 → bounded combat multiplier 0.75–1.25 (quality 50 = 1.0). */
export const qualityCombatMultiplier = (quality: number | null | undefined) => 0.75 + 0.005 * Math.max(0, Math.min(100, Number(quality ?? 50) || 0));

/** Split a stack into ≤200-man units. Composition must account for every soldier exactly: no silent militia or losses. */
export function buildUnits(side: Side, stackId: string, soldiers: number, composition: { id?: string; unit_type: string; manpower: number; quality?: number }[],
  morale: number, stackFormation?: string | null): FBUnit[] {
  if (!Number.isSafeInteger(soldiers) || soldiers < 0) throw new Error(`Invalid soldier count for ${stackId}`);
  let sum = 0;
  for (const c of composition) {
    if (!Number.isSafeInteger(c.manpower) || c.manpower < 0) throw new Error(`Invalid composition manpower for ${stackId}`);
    sum += c.manpower;
  }
  if (sum !== soldiers) throw new Error(`Composition manpower ${sum} does not match stack soldiers ${soldiers} for ${stackId}`);
  const out: FBUnit[] = []; let i = 0;
  for (const c of composition) {
    const type = normalizeUnitType(c.unit_type);
    for (let left = c.manpower; left > 0;) {
      const men = Math.min(MEN_PER_UNIT, left); left -= men;
      out.push({ key: `${stackId}:${i++}`, side, stackId, compId: c.id ?? null, sourceType: c.unit_type, type,
        formation: unitFormation(stackFormation, type), men, startMen: men, morale, fatigue: 0, ammo: UNIT_STATS[type].ammo,
        quality: qualityCombatMultiplier(c.quality), x: null, y: null, facing: "n", status: "ready" });
    }
  }
  return out;
}

// ── Geometry ──
const microCell = (x: number, y: number): Cell => ({ x: Math.floor(x / MICRO), y: Math.floor(y / MICRO) });
export const inBattlefield = (field: Cell[], x: number, y: number) => { const c = microCell(x, y); return field.some(f => f.x === c.x && f.y === c.y); };
const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const manhattan = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const pos = (u: FBUnit) => ({ x: u.x!, y: u.y! });
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** A side deploys on battlefield squares at least as close to its own army as to the enemy. */
export function inDeployZone(field: Cell[], own: Cell, enemy: Cell, x: number, y: number) {
  if (!inBattlefield(field, x, y)) return false; const c = microCell(x, y); return cheb(c, own) <= cheb(c, enemy);
}
export const faceTo = (from: { x: number; y: number }, to: { x: number; y: number }): Facing => {
  const dx = to.x - from.x, dy = to.y - from.y; return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "e" : "w") : (dy >= 0 ? "s" : "n");
};

/** Auto-deploy: melee in front, ranged behind, cavalry on the wings, engineers behind the line. Units that do not fit stay in reserve. */
export function autoDeploy(units: FBUnit[], side: Side, field: Cell[], own: Cell, enemy: Cell, terrainAt: TerrainAt = () => "plain"): FBUnit[] {
  const taken = new Set(units.filter(u => u.x !== null && u.side !== side).map(u => `${u.x},${u.y}`));
  const ec = { x: enemy.x * MICRO + 2.5, y: enemy.y * MICRO + 2.5 }, oc = { x: own.x * MICRO + 2.5, y: own.y * MICRO + 2.5 };
  const axis = { x: ec.x - oc.x, y: ec.y - oc.y }; const len = Math.hypot(axis.x, axis.y) || 1;
  const fwd = { x: axis.x / len, y: axis.y / len }, lat = { x: -fwd.y, y: fwd.x };
  const spots: { x: number; y: number; depth: number; wing: number; ownSq: boolean }[] = [];
  for (const f of field) for (let i = 0; i < MICRO; i++) for (let j = 0; j < MICRO; j++) {
    const x = f.x * MICRO + i, y = f.y * MICRO + j;
    if (taken.has(`${x},${y}`) || terrainAt(x, y) === "water" || !inDeployZone(field, own, enemy, x, y)) continue;
    const rx = x + .5 - oc.x, ry = y + .5 - oc.y;
    spots.push({ x, y, depth: -(rx * fwd.x + ry * fwd.y), wing: Math.abs(rx * lat.x + ry * lat.y), ownSq: cheb(f, own) < cheb(f, enemy) });
  }
  const sideUnits = units.filter(u => u.side === side && (u.status === "ready" || u.status === "reserve"));
  const role = (u: FBUnit) => isCavalry(u.type) ? "cav" : isRanged(u.type) ? "ranged" : u.type === "ENGINEERS" ? "eng" : "melee";
  // Own squares first, then contested ones; front = smallest depth.
  const byFront = spots.slice().sort((a, b) => Number(b.ownSq) - Number(a.ownSq) || a.depth - b.depth || a.wing - b.wing || a.y - b.y || a.x - b.x);
  const free = new Set(byFront.map(s => `${s.x},${s.y}`));
  const take = (list: typeof spots) => { const s = list.find(p => free.has(`${p.x},${p.y}`)); if (s) free.delete(`${s.x},${s.y}`); return s; };
  const melee = sideUnits.filter(u => role(u) === "melee"), ranged = sideUnits.filter(u => role(u) === "ranged"),
    cav = sideUnits.filter(u => role(u) === "cav"), eng = sideUnits.filter(u => role(u) === "eng");
  const placed = new Map<string, { x: number; y: number }>();
  const ownSpots = byFront;
  // Cavalry: widest wing spots near the front.
  const wingSpots = spots.slice().sort((a, b) => Number(b.ownSq) - Number(a.ownSq) || b.wing - a.wing || a.depth - b.depth || a.y - b.y || a.x - b.x);
  const meleeCount = melee.length; const centreSpots = ownSpots;
  for (const u of cav) { const s = take(wingSpots); if (s) placed.set(u.key, s); }
  for (const u of melee) { const s = take(centreSpots); if (s) placed.set(u.key, s); }
  for (const u of ranged) { const s = take(ownSpots); if (s) placed.set(u.key, s); }
  for (const u of eng) { const s = take(ownSpots); if (s) placed.set(u.key, s); }
  void meleeCount;
  const facing = faceTo(oc, ec);
  return units.map(u => {
    if (u.side !== side || !((u.status as UnitStatus) === "ready" || (u.status as UnitStatus) === "reserve")) return u;
    const p = placed.get(u.key);
    return p ? { ...u, x: p.x, y: p.y, facing, status: "ready" } : { ...u, x: null, y: null, status: "reserve" };
  });
}

// ── Command points ──
export const commandPoints = (generalSkill: number | null | undefined) => generalCommandPoints(generalSkill);

// ── Orders ──
export type OrderKind = "MOVE" | "ATTACK" | "CHARGE" | "HOLD" | "VOLLEY" | "FORTIFY" | "RALLY" | "RESERVE";
export type FBOrder = { seq: number; cmd: number; key: string; kind: OrderKind; to?: { x: number; y: number }; target?: string };
export type BattleMeta = { rallyReadyRound?: Partial<Record<Side, number>>; fortified?: { x: number; y: number; side: Side; until: number }[];
  hasGeneral?: Partial<Record<Side, boolean>>; generalSkill?: Partial<Record<Side, number | null>>; ai?: Partial<Record<Side, boolean>>;
  aiPlan?: Partial<Record<Side, BattleAiPlan>>; combatMult?: Partial<Record<Side, number>> };
export type FBEvent = { seq: number; key: string; kind: string; text: string; target?: string; lossesTarget?: number; lossesSelf?: number };

/** Effective movement for this round: type + formation + terrain + fatigue, at least 1. */
export function moveRange(u: FBUnit, terrainAt: TerrainAt = () => "plain") {
  let m = UNIT_STATS[u.type].move;
  if (u.formation === "shieldwall" || u.formation === "deep" || u.formation === "square") m -= 1;
  if (u.formation === "loose" || u.formation === "skirmish") m += 1;
  if (u.x !== null && isCavalry(u.type)) { const t = terrainAt(u.x, u.y!); if (t === "forest" || t === "marsh") m -= 1; }
  if (u.fatigue >= 80) m -= 1;
  return Math.max(MIN_MOVE, m);
}
/** Movement floor: a unit always moves at least one cell; the base stat is never overridden. */
export const MIN_MOVE = 1;

/** Legal four-connected movement: water, battlefield edges and every occupied cell block the path, not only the destination. */
export function reachableCells(u: FBUnit, units: FBUnit[], field: Cell[], terrainAt: TerrainAt = () => "plain") {
  const out = new Map<string, Cell & { distance: number }>();
  if (u.status !== "ready" || u.x === null) return out;
  const occupied = new Set(units.filter(v => v.key !== u.key && v.status === "ready" && v.x !== null).map(v => `${v.x},${v.y}`));
  const range = moveRange(u, terrainAt), queue: (Cell & { distance: number })[] = [{ x: u.x, y: u.y!, distance: 0 }];
  const seen = new Set([`${u.x},${u.y}`]);
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i];
    for (const [dx, dy] of ORTHO) {
      const next = { x: at.x + dx, y: at.y + dy, distance: at.distance + 1 }, key = `${next.x},${next.y}`;
      if (next.distance > range || seen.has(key) || occupied.has(key) || !inBattlefield(field, next.x, next.y) || terrainAt(next.x, next.y) === "water") continue;
      seen.add(key); out.set(key, next); queue.push(next);
    }
  }
  return out;
}

const canDo = (u: FBUnit, kind: OrderKind) =>
  kind === "CHARGE" ? isCavalry(u.type) : kind === "VOLLEY" ? (u.type === "ARCHERS" || u.type === "SLINGERS" || u.type === "JAVELINERS")
  : kind === "FORTIFY" ? u.type === "ENGINEERS" : true;

/** Entry-time validation of one unit's part of a (group) order. Resolution re-checks everything. */
export function orderProblem(units: FBUnit[], field: Cell[], key: string, o: { kind: OrderKind; to?: { x: number; y: number }; target?: string },
  terrainAt: TerrainAt = () => "plain", ctx: { round?: number; meta?: BattleMeta; zone?: (x: number, y: number) => boolean } = {}): string | null {
  const u = units.find(v => v.key === key); if (!u) return "Neznámý oddíl";
  if (o.kind === "RESERVE") {
    if (u.status !== "reserve") return "Oddíl není v záloze";
    if (!o.to || !ctx.zone?.(o.to.x, o.to.y)) return "Zálohu lze přivolat jen do vlastní zóny";
    if (terrainAt(o.to.x, o.to.y) === "water") return "Do vody nelze";
    if (units.some(v => v.status === "ready" && v.x === o.to!.x && v.y === o.to!.y)) return "Políčko je obsazené";
    return null;
  }
  if (u.status !== "ready" || u.x === null) return "Oddíl nemůže jednat";
  if (!canDo(u, o.kind)) return o.kind === "CHARGE" ? "Náraz umí jen jízda" : o.kind === "VOLLEY" ? "Salvu umí jen střelci a oštěpaři" : "Opevnění staví jen ženisté";
  if (o.kind === "MOVE") {
    if (!o.to || !Number.isInteger(o.to.x) || !Number.isInteger(o.to.y)) return "Neplatný cíl";
    if (!inBattlefield(field, o.to.x, o.to.y)) return "Cíl je mimo bojiště";
    if (terrainAt(o.to.x, o.to.y) === "water") return "Do vody nelze";
    const r = moveRange(u, terrainAt); if (manhattan(pos(u), o.to) > r) return `Oddíl dojde nejvýš ${r} políčka`;
    if (!reachableCells(u, units, field, terrainAt).has(`${o.to.x},${o.to.y}`)) return "Cesta je blokovaná nepřátelemi, oddíly nebo terénem";
    return null;
  }
  if (o.kind === "ATTACK" || o.kind === "CHARGE" || o.kind === "VOLLEY") {
    const t = units.find(v => v.key === o.target); if (!t || t.side === u.side || t.status !== "ready") return "Neplatný cíl útoku";
    if (o.kind === "VOLLEY" && u.ammo < 2) return "Na salvu chybí munice (2)";
    if (o.kind === "VOLLEY" && cheb(pos(u), pos(t)) > UNIT_STATS[u.type].range) return "Cíl je mimo dostřel";
    if (o.kind === "ATTACK") {
      const d = cheb(pos(u), pos(t)), st = UNIT_STATS[u.type];
      if (d > 1 && (st.ranged <= 0 || d > st.range)) return "Cíl je mimo dosah";
      if (d > 1 && st.ranged > 0 && u.ammo < 1) return "Došla munice";
    }
    if (o.kind === "CHARGE" && manhattan(pos(u), pos(t)) > moveRange(u, terrainAt) + 1) return "Cíl je pro náraz příliš daleko";
    return null;
  }
  if (o.kind === "RALLY") {
    if (!ctx.meta?.hasGeneral?.[u.side]) return "Shromáždit může jen armáda s generálem";
    const readyAt = ctx.meta?.rallyReadyRound?.[u.side] ?? 0; if ((ctx.round ?? 1) < readyAt) return `Shromáždění bude znovu možné v kole ${readyAt}`;
    return null;
  }
  return null;
}
/** Server-side CP check: distinct command ids of a side must not exceed its command points. */
export function cpUsed(orders: FBOrder[], units: FBUnit[], side: Side) {
  const sideOf = new Map(units.map(u => [u.key, u.side]));
  // Every order kind uses the same rule: one distinct command group = one CP, however many units it contains.
  return new Set(orders.filter(o => sideOf.get(o.key) === side).map(o => o.cmd)).size;
}

// ── Deterministic RNG ──
export function seededRandom(seedText: string) {
  let h = 2166136261; for (let i = 0; i < seedText.length; i++) { h ^= seedText.charCodeAt(i); h = Math.imul(h, 16777619); }
  let s = h >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// ── Combat ──
const FLANK = { front: 1, side: 1.25, rear: 1.5 } as const;
export type Flank = keyof typeof FLANK;
export function flankOf(target: FBUnit, from: { x: number; y: number }): Flank {
  const dir = faceTo(pos(target), from); const opp: Record<Facing, Facing> = { n: "s", s: "n", e: "w", w: "e" };
  return dir === target.facing ? "front" : dir === opp[target.facing] ? "rear" : "side";
}
export function supportDefense(units: FBUnit[], u: FBUnit) {
  if (u.x === null) return 0;
  const n = ORTHO.filter(([dx, dy]) => units.some(v => v !== u && v.side === u.side && v.status === "ready" && v.x === u.x! + dx && v.y === u.y! + dy)).length;
  return Math.min(0.15, n * 0.05);
}
export type HitCtx = { ranged: boolean; charge: boolean; volley: boolean; flank: Flank; holding: boolean; fortified: boolean; variance: number;
  terrainAttacker: Terrain; terrainTarget: Terrain; support: number; attackMultiplier?: number };
/** Casualties of one hit — the single combat formula. */
export function casualties(a: FBUnit, t: FBUnit, c: HitCtx): number {
  const st = UNIT_STATS[a.type], ts = UNIT_STATS[t.type];
  const base = c.ranged ? st.ranged : st.melee;
  const moraleF = 0.5 + a.morale / 200, fatigueF = 1 - Math.min(100, a.fatigue) * 0.003;
  let formAtk = 1;
  if (a.formation === "line") formAtk *= 1.05;
  if (a.formation === "shieldwall") formAtk *= 0.9;
  if (!c.ranged && a.formation === "deep") formAtk *= 1.15;
  if (c.ranged && a.formation === "skirmish") formAtk *= 1.15;
  if (c.charge) { formAtk *= 1.25; if (a.formation === "wedge") formAtk *= 1.35;
    if (t.type === "SPEARMEN" && c.flank === "front") formAtk *= 0.5; }
  let terrAtk = 1;
  if (c.ranged && c.terrainAttacker === "hills") terrAtk *= 1.10;
  if (isCavalry(a.type) && c.terrainAttacker === "marsh") terrAtk *= 0.85;
  let matchup = 1;
  if (a.type === "SPEARMEN" && isCavalry(t.type)) matchup *= 1.5;
  if (a.type === "AXEMEN" && isInfantry(t.type) && (t.formation === "shieldwall" || ts.armor >= 20)) matchup *= 1.3;
  if (isCavalry(a.type) && isRanged(t.type)) matchup *= 1.25;
  // Target defensive modifiers (fractions of mitigation) and damage multipliers by formation vs ranged/flank.
  let formDef = 0, dmgMul = 1;
  switch (t.formation) {
    case "line": formDef += 0.05; break;
    case "shieldwall": if (c.flank === "front") formDef += 0.25; break;
    case "deep": formDef += 0.10; break;
    case "loose": if (c.ranged) dmgMul *= 0.75; break;
    case "square": formDef += 0.20; break;
  }
  let terrDef = 0;
  if (c.terrainTarget === "hills") terrDef += 0.10;
  if (c.terrainTarget === "village") terrDef += 0.20;
  if (c.ranged && c.terrainTarget === "forest") dmgMul *= 0.8;
  if (c.holding) formDef += 0.10;
  if (c.fortified) formDef += 0.25;
  const mitigation = Math.max(0.45, Math.min(1, 1 - ts.defense / 100 - ts.armor / 200 - terrDef - formDef - c.support));
  const volley = c.volley ? 1.3 : 1;
  const raw = (a.men / MEN_PER_UNIT) * base * moraleF * fatigueF * a.quality * formAtk * terrAtk * matchup * FLANK[c.flank] * c.variance * mitigation * dmgMul * volley * (c.attackMultiplier ?? 1);
  return Math.min(t.men, Math.max(1, Math.round(raw)));
}

/** Initiative: odd rounds attacker first, even rounds defender; sides alternate, each side keeps its own entry order. */
export function initiativeOrder(orders: FBOrder[], units: FBUnit[], round: number): FBOrder[] {
  const sideOf = new Map(units.map(u => [u.key, u.side]));
  const first: Side = round % 2 === 1 ? "attacker" : "defender";
  const a = orders.filter(o => sideOf.get(o.key) === first).sort((x, y) => x.seq - y.seq);
  const b = orders.filter(o => sideOf.get(o.key) === otherSide(first)).sort((x, y) => x.seq - y.seq);
  const out: FBOrder[] = []; for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) out.push(a[i]); if (b[i]) out.push(b[i]); }
  return out;
}

export type RoundResult = { units: FBUnit[]; events: FBEvent[]; winner: Side | "draw" | null; meta: BattleMeta };
/** Resolve one round deterministically (rand seeded by battleId+round). Each unit acts at most once; units without orders hold. */
export function resolveRound(units0: FBUnit[], orders: FBOrder[], field: Cell[], terrainAt: TerrainAt, rand: () => number,
  round = 1, meta0: BattleMeta = {}, zoneOf?: (side: Side) => (x: number, y: number) => boolean): RoundResult {
  const units = units0.map(u => upgradeUnit(u)); const by = new Map(units.map(u => [u.key, u]));
  const meta: BattleMeta = JSON.parse(JSON.stringify(meta0 || {}));
  meta.fortified = (meta.fortified ?? []).filter(f => f.until >= round);
  const events: FBEvent[] = []; const acted = new Set<string>(); const roundLoss = new Map<string, number>(); const lostMoraleFlag = new Set<string>();
  const holding = new Set(units.filter(u => u.status === "ready" && !orders.some(o => o.key === u.key && o.kind !== "HOLD")).map(u => u.key));
  const occupied = (x: number, y: number) => units.some(u => u.status === "ready" && u.x === x && u.y === y);
  const fortifiedAt = (u: FBUnit) => (meta.fortified ?? []).some(f => f.side === u.side && f.x === u.x && f.y === u.y);
  const moraleHit = (t: FBUnit, amount: number) => {
    const elite = t.type === "ELITE_GUARD" ? 0.75 : 1;
    const leadership = meta.hasGeneral?.[t.side] ? 1 - generalMoraleLossReduction(meta.generalSkill?.[t.side]) : 1;
    const m = amount * elite * leadership;
    t.morale = Math.max(0, Math.round((t.morale - m) * 100) / 100);
  };
  const checkRout = (t: FBUnit) => { if (t.men <= 0) { t.men = 0; t.status = "dead"; } else if (t.status === "ready" && t.morale < ROUT_MORALE) t.status = "routed"; };
  const strike = (a: FBUnit, t: FBUnit, opts: { ranged: boolean; charge?: boolean; volley?: boolean }) => {
    const flank = flankOf(t, pos(a));
    const loss = casualties(a, t, { ranged: opts.ranged, charge: !!opts.charge, volley: !!opts.volley, flank, holding: holding.has(t.key), fortified: fortifiedAt(t),
      variance: 0.9 + rand() * 0.2, terrainAttacker: terrainAt(a.x!, a.y!), terrainTarget: terrainAt(t.x!, t.y!), support: supportDefense(units, t),
      attackMultiplier: meta.combatMult?.[a.side] ?? 1 });
    t.men -= loss; const rl = (roundLoss.get(t.key) ?? 0) + loss; roundLoss.set(t.key, rl);
    let m = flank === "rear" ? 12 : flank === "side" ? 6 : 0;
    if (rl >= t.startMen * 0.1 && !lostMoraleFlag.has(t.key)) { lostMoraleFlag.add(t.key); m += 6; }
    if (m) moraleHit(t, m);
    checkRout(t);
    return { loss, flank };
  };
  const melee = (a: FBUnit, t: FBUnit, charge: boolean, seq: number, label: string) => {
    a.facing = faceTo(pos(a), pos(t));
    const r = strike(a, t, { ranged: false, charge });
    let back = 0;
    if (r.flank !== "rear" && t.status === "ready") { const save = t.facing; t.facing = faceTo(pos(t), pos(a)); back = strike({ ...t, men: Math.round(t.men * 0.5) }, a, { ranged: false }).loss; t.facing = save; }
    events.push({ seq, key: a.key, kind: charge ? "charge" : "attack", target: t.key, lossesTarget: r.loss, lossesSelf: back,
      text: `${label} ${r.flank === "front" ? "zepředu" : r.flank === "side" ? "z boku" : "do týlu"}: ${r.loss} padlých${back ? `, vlastní ztráty ${back}` : ""}${t.status === "routed" ? ", nepřítel prchá" : t.status === "dead" ? ", oddíl zničen" : ""}` });
  };
  for (const o of initiativeOrder(orders, units, round)) {
    const u = by.get(o.key); if (!u || acted.has(u.key)) continue;
    if (o.kind === "RESERVE") {
      acted.add(u.key);
      if (u.status !== "reserve" || !o.to) continue;
      const okZone = zoneOf ? zoneOf(u.side)(o.to.x, o.to.y) : inBattlefield(field, o.to.x, o.to.y);
      if (!okZone || occupied(o.to.x, o.to.y) || terrainAt(o.to.x, o.to.y) === "water") { events.push({ seq: o.seq, key: u.key, kind: "reserve_blocked", text: "záloha nemá kam nastoupit" }); continue; }
      const enemyUnit = units.find(v => v.side !== u.side && v.status === "ready");
      u.x = o.to.x; u.y = o.to.y; u.status = "ready"; u.facing = enemyUnit ? faceTo(o.to, pos(enemyUnit)) : u.facing; holding.delete(u.key);
      events.push({ seq: o.seq, key: u.key, kind: "reserve", text: `záloha nastoupila na ${o.to.x},${o.to.y}` }); continue;
    }
    if (u.status !== "ready" || u.x === null) continue;
    acted.add(u.key);
    if (o.kind === "HOLD") { events.push({ seq: o.seq, key: u.key, kind: "hold", text: "drží pozici" }); continue; }
    if (o.kind === "MOVE") {
      const to = o.to!;
      if (!inBattlefield(field, to.x, to.y) || terrainAt(to.x, to.y) === "water" || manhattan(pos(u), to) > moveRange(u, terrainAt)) { events.push({ seq: o.seq, key: u.key, kind: "move_fail", text: "pohyb mimo dosah" }); continue; }
      if (occupied(to.x, to.y)) { events.push({ seq: o.seq, key: u.key, kind: "move_blocked", text: "cílové políčko je obsazené" }); continue; }
      if (!reachableCells(u, units, field, terrainAt).has(`${to.x},${to.y}`)) { events.push({ seq: o.seq, key: u.key, kind: "move_blocked", text: "cesta je blokovaná" }); continue; }
      u.facing = faceTo(pos(u), to); u.x = to.x; u.y = to.y; u.fatigue = Math.min(100, u.fatigue + 8);
      events.push({ seq: o.seq, key: u.key, kind: "move", text: `přesun na ${to.x},${to.y}` }); continue;
    }
    if (o.kind === "FORTIFY") {
      if (u.type !== "ENGINEERS") continue;
      const cells = [[0, 0], ...ORTHO].map(([dx, dy]) => ({ x: u.x! + dx, y: u.y! + dy })).filter(c => inBattlefield(field, c.x, c.y));
      meta.fortified = [...(meta.fortified ?? []).filter(f => !cells.some(c => c.x === f.x && c.y === f.y && f.side === u.side)), ...cells.map(c => ({ ...c, side: u.side, until: round + 1 }))];
      u.fatigue = Math.min(100, u.fatigue + 8);
      events.push({ seq: o.seq, key: u.key, kind: "fortify", text: `opevnění ${cells.length} políček do kola ${round + 1}` }); continue;
    }
    if (o.kind === "RALLY") {
      const readyAt = meta.rallyReadyRound?.[u.side] ?? 0;
      if (!meta.hasGeneral?.[u.side] || round < readyAt) { events.push({ seq: o.seq, key: u.key, kind: "rally_fail", text: "shromáždění nelze" }); continue; }
      const rally = generalRallyStrength(meta.generalSkill?.[u.side]);
      let n = 0; for (const v of units) if (v.side === u.side && v.status === "ready" && v.x !== null && manhattan(pos(v), pos(u)) <= 3) { v.morale = Math.min(100, v.morale + rally); n++; }
      meta.rallyReadyRound = { ...(meta.rallyReadyRound ?? {}), [u.side]: round + 3 };
      events.push({ seq: o.seq, key: u.key, kind: "rally", text: `generál shromáždil ${n} oddílů (+${rally} morálky)` }); continue;
    }
    const t = o.target ? by.get(o.target) : undefined;
    if (!t || t.status !== "ready" || t.x === null) { events.push({ seq: o.seq, key: u.key, kind: "attack_void", target: o.target, text: "cíl už nebojuje" }); continue; }
    if (o.kind === "CHARGE") {
      if (!isCavalry(u.type)) continue;
      const tt = terrainAt(t.x!, t.y!);
      if (tt === "forest" || tt === "village") { events.push({ seq: o.seq, key: u.key, kind: "charge_fail", target: t.key, text: "náraz do lesa/vesnice nelze" }); continue; }
      const opp: Record<Facing, [number, number]> = { n: [0, 1], s: [0, -1], e: [-1, 0], w: [1, 0] };
      const reachable = reachableCells(u, units, field, terrainAt);
      const cand = ORTHO.map(([dx, dy]) => ({ x: t.x! + dx, y: t.y! + dy, rear: opp[t.facing][0] === dx && opp[t.facing][1] === dy }))
        .filter(c => (c.x === u.x && c.y === u.y) || (reachable.has(`${c.x},${c.y}`) && !occupied(c.x, c.y) && terrainAt(c.x, c.y) !== "forest"))
        .map(c => ({ ...c, f: flankOf(t, c) })).sort((a, b) => FLANK[b.f] - FLANK[a.f] || manhattan(pos(u), a) - manhattan(pos(u), b) || a.y - b.y || a.x - b.x);
      const spot = cand[0];
      if (!spot) { events.push({ seq: o.seq, key: u.key, kind: "charge_fail", target: t.key, text: "k cíli není volná cesta" }); continue; }
      u.x = spot.x; u.y = spot.y; u.fatigue = Math.min(100, u.fatigue + 20);
      melee(u, t, true, o.seq, "náraz"); continue;
    }
    // ATTACK / VOLLEY
    const d = cheb(pos(u), pos(t)); const st = UNIT_STATS[u.type];
    if (d <= 1 && o.kind === "ATTACK") { u.fatigue = Math.min(100, u.fatigue + 10); melee(u, t, false, o.seq, "útok"); continue; }
    const need = o.kind === "VOLLEY" ? 2 : 1;
    if (st.ranged > 0 && d <= st.range && u.ammo >= need) {
      u.ammo -= need; u.fatigue = Math.min(100, u.fatigue + 10); u.facing = faceTo(pos(u), pos(t));
      const r = strike(u, t, { ranged: true, volley: o.kind === "VOLLEY" });
      events.push({ seq: o.seq, key: u.key, kind: o.kind === "VOLLEY" ? "volley" : "shoot", target: t.key, lossesTarget: r.loss,
        text: `${o.kind === "VOLLEY" ? "salva" : "střelba"} ${r.flank === "front" ? "zepředu" : r.flank === "side" ? "z boku" : "do týlu"}: ${r.loss} padlých${(t.status as UnitStatus) === "routed" ? ", nepřítel prchá" : (t.status as UnitStatus) === "dead" ? ", oddíl zničen" : ""}` });
      continue;
    }
    events.push({ seq: o.seq, key: u.key, kind: "attack_miss", target: t.key, text: st.ranged > 0 && u.ammo < need && d <= st.range ? "došla munice" : "cíl mimo dosah (mezitím odešel?)" });
  }
  // Holding units recover.
  for (const u of units) if (u.status === "ready" && holding.has(u.key) && !acted.has(u.key)) u.fatigue = Math.max(0, u.fatigue - 8);
  for (const u of units) if (u.status === "ready" && orders.some(o => o.key === u.key && o.kind === "HOLD")) u.fatigue = Math.max(0, u.fatigue - 8);
  // Rout chain: each adjacent routed friendly −4 morale, max −12, single pass.
  const routedNow = units.filter(u => u.status === "routed" && u.x !== null);
  for (const u of units) {
    if (u.status !== "ready" || u.x === null) continue;
    const n = routedNow.filter(r => r.side === u.side && cheb(pos(r), pos(u)) <= 1).length;
    if (n) { moraleHit(u, Math.min(12, n * 4)); checkRout(u); if ((u.status as UnitStatus) === "routed") events.push({ seq: 999, key: u.key, kind: "rout_chain", text: "panika se šíří, oddíl prchá" }); }
  }
  // Routed and dead leave the field.
  for (const u of units) if (u.status === "routed" || u.status === "dead") { u.x = null; u.y = null; }
  for (const u of units) u.morale = Math.round(u.morale);
  const alive = (s: Side) => units.some(u => u.side === s && u.status === "ready");
  let winner: Side | "draw" | null = !alive("attacker") && !alive("defender") ? "draw" : !alive("attacker") ? "defender" : !alive("defender") ? "attacker" : null;
  if (!winner && round >= MAX_ROUNDS) winner = timeoutWinner(units);
  return { units, events, winner, meta };
}
/** After 40 rounds: effective strength men × morale × quality of ready units; ≥15 % lead wins, else draw. */
export function timeoutWinner(units: FBUnit[]): Side | "draw" {
  const s = (side: Side) => units.filter(u => u.side === side && u.status === "ready").reduce((a, u) => a + u.men * (u.morale / 100) * u.quality, 0);
  const a = s("attacker"), d = s("defender");
  if (a >= d * 1.15 && a > 0) return "attacker"; if (d >= a * 1.15 && d > 0) return "defender"; return "draw";
}

// ── Deterministic Battle AI v2: doctrine + roles + legal utility-scored command groups ──
export const BATTLE_DOCTRINES = ["hammer_anvil", "defensive_line", "cavalry_flank", "ranged_attrition", "forest_ambush", "center_breakthrough", "elastic_defense"] as const;
export type BattleDoctrine = typeof BATTLE_DOCTRINES[number];
export type TacticalRole = "center" | "left_wing" | "right_wing" | "ranged_support" | "reserve";
export type BattleAiPlan = { version: 2; round: number; doctrine: BattleDoctrine; reason: string; strengthRatio: number;
  roles: Record<string, TacticalRole>; reserveCalled: boolean; explanation?: string[] };

/** Utility weights of a candidate attack (sum 100). Penalties for own losses, fatigue, ammo and danger are subtracted. */
export const AI_UTILITY_WEIGHTS = { enemyLosses: 28, moralePressure: 18, flankRear: 16, targetImportance: 12, cohesion: 10, terrain: 8, objective: 8 } as const;
export type AiUtilityWeights = Record<keyof typeof AI_UTILITY_WEIGHTS, number>;
export type AttackUtility = { score: number; parts: AiUtilityWeights; penalty: number; flank: Flank };
/** Score one legal ATTACK/CHARGE/VOLLEY from the real combat formula (variance fixed at 1). */
export function attackUtility(units: FBUnit[], u: FBUnit, t: FBUnit, kind: OrderKind, terrainAt: TerrainAt,
  weights: AiUtilityWeights = AI_UTILITY_WEIGHTS, meta: BattleMeta = {}): AttackUtility {
  const ranged = kind === "VOLLEY" || (kind === "ATTACK" && cheb(pos(u), pos(t)) > 1);
  const flank = flankOf(t, pos(u));
  const hit = (a: FBUnit, d: FBUnit, r: boolean, ch: boolean, f: Flank) => casualties(a, d, { ranged: r, charge: ch, volley: kind === "VOLLEY" && r, flank: f,
    holding: false, fortified: (meta.fortified ?? []).some(x => x.side === d.side && x.x === d.x && x.y === d.y), variance: 1,
    terrainAttacker: terrainAt(a.x!, a.y!), terrainTarget: terrainAt(d.x!, d.y!), support: supportDefense(units, d), attackMultiplier: meta.combatMult?.[a.side] ?? 1 });
  const loss = hit(u, t, ranged, kind === "CHARGE", flank), lossRatio = Math.min(1, loss / Math.max(1, t.men));
  const exposedTarget = !units.some(v => v.side === t.side && v.key !== t.key && v.status === "ready" && v.x !== null && manhattan(pos(v), pos(t)) <= 1);
  const terr = terrainAt(u.x!, u.y!);
  const parts: AiUtilityWeights = {
    enemyLosses: Math.min(1, lossRatio * 4),
    moralePressure: Math.min(1, Math.max(0, (100 - t.morale) / 75) * 0.6 + (t.morale - (flank === "rear" ? 12 : flank === "side" ? 6 : 0) - (lossRatio >= 0.1 ? 6 : 0) < ROUT_MORALE ? 0.4 : 0)),
    flankRear: (FLANK[flank] - 1) / 0.5,
    targetImportance: isRanged(t.type) ? (exposedTarget ? 1 : 0.7) : (u.type === "SPEARMEN" && isCavalry(t.type)) ? 1 : isCavalry(t.type) ? 0.6 : t.type === "ELITE_GUARD" ? 0.6 : 0.4,
    cohesion: supportDefense(units, u) / 0.15,
    terrain: terr === "hills" || terr === "forest" ? 1 : terr === "marsh" ? 0 : 0.5,
    objective: Math.min(1, t.men < t.startMen * 0.4 || t.morale < 40 ? 1 : 0.5 + 0.5 * (1 - t.men / Math.max(1, t.startMen))),
  };
  let score = 0; for (const k of Object.keys(AI_UTILITY_WEIGHTS) as (keyof AiUtilityWeights)[]) score += (weights[k] ?? 0) * parts[k];
  let penalty = 0;
  if (!ranged && flank !== "rear") penalty += 40 * Math.min(1, hit({ ...t, men: Math.round(t.men * 0.5) }, u, false, false, "front") / Math.max(1, u.men) * 4);
  penalty += (u.fatigue / 100) * 15 + (kind === "CHARGE" ? 4 : 0);
  if (ranged) penalty += (kind === "VOLLEY" ? 2 : 1) / Math.max(1, UNIT_STATS[u.type].ammo) * 10;
  if (isCavalry(u.type) && t.type === "SPEARMEN" && flank === "front") penalty += 60;
  if (isRanged(u.type) && !ranged) penalty += 15;
  return { score: Math.round((score - penalty) * 100) / 100, parts, penalty: Math.round(penalty * 100) / 100, flank };
}
export const DOCTRINE_LABELS: Record<BattleDoctrine, string> = {
  hammer_anvil: "Kladivo a kovadlina", defensive_line: "Obranná linie", cavalry_flank: "Jezdecký obchvat",
  ranged_attrition: "Střelecké oslabení", forest_ambush: "Lesní léčka", center_breakthrough: "Průlom středu", elastic_defense: "Pružná obrana",
};

const battleMen = (units: FBUnit[], side: Side, readyOnly = false) => units.filter(u => u.side === side && (readyOnly ? u.status === "ready" : u.status === "ready" || u.status === "reserve"))
  .reduce((sum, u) => sum + u.men * u.quality * (0.5 + u.morale / 200), 0);
const meanMorale = (units: FBUnit[], side: Side) => {
  const mine = units.filter(u => u.side === side && u.status === "ready"); return mine.length ? mine.reduce((s, u) => s + u.morale, 0) / mine.length : 0;
};
const fieldTerrains = (field: Cell[], terrainAt: TerrainAt) => field.flatMap(f => Array.from({ length: MICRO * MICRO }, (_, i) => terrainAt(f.x * MICRO + i % MICRO, f.y * MICRO + Math.floor(i / MICRO))));

/** Doctrine is recomputed every round from actual troops, terrain, role, strength and morale. */
export function selectBattleDoctrine(units: FBUnit[], side: Side, field: Cell[], terrainAt: TerrainAt): { doctrine: BattleDoctrine; reason: string; strengthRatio: number } {
  const mine = units.filter(u => u.side === side && (u.status === "ready" || u.status === "reserve"));
  const foes = units.filter(u => u.side !== side && (u.status === "ready" || u.status === "reserve"));
  const ownPower = battleMen(units, side), enemyPower = battleMen(units, otherSide(side)), ratio = ownPower / Math.max(1, enemyPower);
  const men = Math.max(1, mine.reduce((s, u) => s + u.men, 0)), count = (pred: (u: FBUnit) => boolean) => mine.filter(pred).reduce((s, u) => s + u.men, 0) / men;
  const morale = meanMorale(units, side), terrains = fieldTerrains(field, terrainAt), open = terrains.filter(t => t === "plain" || t === "hills" || t === "village").length / Math.max(1, terrains.length);
  const ownForest = mine.filter(u => u.x !== null && terrainAt(u.x, u.y!) === "forest").reduce((s, u) => s + u.men, 0) / men;
  const ranged = count(u => isRanged(u.type) && u.ammo > 0), enemyRanged = foes.filter(u => isRanged(u.type) && u.ammo > 0).reduce((s, u) => s + u.men, 0);
  const ownRangedMen = mine.filter(u => isRanged(u.type) && u.ammo > 0).reduce((s, u) => s + u.men, 0);
  const cavalry = count(u => isCavalry(u.type)), mobile = count(u => isCavalry(u.type) || u.type === "SLINGERS" || u.type === "JAVELINERS" || u.type === "MILITIA");
  const shock = count(u => u.type === "AXEMEN" || u.type === "SWORDSMEN" || u.type === "ELITE_GUARD" || u.type === "HEAVY_CAVALRY");
  if (morale < 45 || ratio < 0.55) return { doctrine: "elastic_defense", reason: "nízká morálka nebo vážná početní nevýhoda", strengthRatio: ratio };
  if (ownForest >= 0.25 && mobile >= 0.30) return { doctrine: "forest_ambush", reason: "les a dostatek lehkých či mobilních oddílů", strengthRatio: ratio };
  if (ranged >= 0.35 && ownRangedMen >= 400 && (enemyRanged === 0 ? ownRangedMen >= 600 : ownRangedMen >= enemyRanged * 1.2)) return { doctrine: "ranged_attrition", reason: "střelecká převaha s dostupnou municí", strengthRatio: ratio };
  if (cavalry >= 0.22 && open >= 0.55) return { doctrine: "cavalry_flank", reason: "silná jízda a vhodný otevřený terén", strengthRatio: ratio };
  if (shock >= 0.40 && ratio >= 1.05) return { doctrine: "center_breakthrough", reason: "silná úderná pěchota a převaha", strengthRatio: ratio };
  if (side === "defender" || ratio < 0.85 || open < 0.55) return { doctrine: "defensive_line", reason: "obrana, nevýhoda nebo uzavřený terén", strengthRatio: ratio };
  return { doctrine: "hammer_anvil", reason: "vyvážené kombinované zbraně", strengthRatio: ratio };
}

export function assignTacticalRoles(units: FBUnit[], side: Side): Record<string, TacticalRole> {
  const roles: Record<string, TacticalRole> = {}; let wing = 0;
  const mine = units.filter(u => u.side === side && u.status !== "dead" && u.status !== "routed").sort((a, b) => a.key.localeCompare(b.key));
  const line = mine.filter(u => !isCavalry(u.type) && !isRanged(u.type) && u.type !== "ENGINEERS");
  for (const u of mine) {
    if (u.status === "reserve" || u.morale < 35 || u.fatigue >= 85) roles[u.key] = "reserve";
    else if (isRanged(u.type)) roles[u.key] = "ranged_support";
    else if (isCavalry(u.type)) roles[u.key] = wing++ % 2 ? "right_wing" : "left_wing";
    else if (line.length > 6 && line.indexOf(u) >= line.length - 2) roles[u.key] = "reserve";
    else roles[u.key] = "center";
  }
  return roles;
}

type AiEntry = { u: FBUnit; to?: Cell; target?: string };
type AiCandidate = { kind: OrderKind; entries: AiEntry[]; score: number; signature: string };

/** Authoritative server AI. No randomness or LLM: identical canonical inputs produce identical groups and doctrine. */
export function planBattleAi(units: FBUnit[], side: Side, field: Cell[], terrainAt: TerrainAt, cp: number, startSeq = 1,
  round = 1, meta: BattleMeta = {}, zoneOf?: (side: Side) => (x: number, y: number) => boolean, weights: AiUtilityWeights = AI_UTILITY_WEIGHTS): { orders: FBOrder[]; plan: BattleAiPlan } {
  const selected = selectBattleDoctrine(units, side, field, terrainAt), doctrine = selected.doctrine;
  const roles = assignTacticalRoles(units, side), mine = units.filter(u => u.side === side && u.status === "ready" && u.x !== null).sort((a, b) => a.key.localeCompare(b.key));
  const reserves = units.filter(u => u.side === side && u.status === "reserve").sort((a, b) => a.key.localeCompare(b.key));
  const foes = units.filter(u => u.side !== side && u.status === "ready" && u.x !== null);
  const plan: BattleAiPlan = { version: 2, round, doctrine, reason: selected.reason, strengthRatio: Math.round(selected.strengthRatio * 1000) / 1000, roles, reserveCalled: false };
  if (!mine.length || !foes.length || cp <= 0) return { orders: [], plan };
  const ctx = { round, meta, zone: zoneOf?.(side) };
  const valid = (entry: AiEntry, kind: OrderKind) => !orderProblem(units, field, entry.u.key, { kind, to: entry.to, target: entry.target }, terrainAt, ctx);
  const threatenedRanged = mine.filter(u => isRanged(u.type) && foes.some(f => manhattan(pos(u), pos(f)) <= 3));
  const candidates: AiCandidate[] = [], immediate = new Map<string, AiCandidate>(), engaged = new Set<string>();
  // Every legal attack kind against every enemy is scored by the weighted utility; the best positive one per unit wins.
  for (const u of mine) {
    const weak = u.morale < 40 || u.fatigue >= 85 || u.men < u.startMen * 0.3;
    if (weak) continue;
    let best: { kind: OrderKind; t: FBUnit; score: number } | null = null;
    for (const t of foes.slice().sort((a, b) => a.key.localeCompare(b.key))) {
      for (const kind of ["CHARGE", "VOLLEY", "ATTACK"] as OrderKind[]) {
        if (kind === "CHARGE" && t.type === "SPEARMEN" && flankOf(t, pos(u)) === "front") continue; // never ride into a frontal spear wall
        if (!valid({ u, target: t.key }, kind)) continue;
        const sc = attackUtility(units, u, t, kind, terrainAt, weights, meta).score;
        if (!best || sc > best.score) best = { kind, t, score: sc };
      }
    }
    if (!best || best.score <= 0) continue;
    const signature = `${best.kind}:${best.t.key}`, existing = immediate.get(signature), entry = { u, target: best.t.key };
    const score = 60 + best.score + (doctrine === "ranged_attrition" && best.kind === "VOLLEY" ? 10 : 0);
    if (existing) { existing.entries.push(entry); existing.score = Math.max(existing.score, score) + 2; }
    else immediate.set(signature, { kind: best.kind, entries: [entry], score, signature });
    engaged.add(u.key);
  }
  candidates.push(...immediate.values());

  // Rally and fortify are real commands, selected only when valid and useful.
  if (meta.hasGeneral?.[side] && round >= (meta.rallyReadyRound?.[side] ?? 0)) {
    const average = meanMorale(units, side);
    if (average < 68 || mine.some(u => u.morale < 40)) {
      const leader = mine.slice().sort((a, b) => mine.filter(v => manhattan(pos(a), pos(v)) <= 3).length - mine.filter(v => manhattan(pos(b), pos(v)) <= 3).length || a.key.localeCompare(b.key))[0];
      if (leader) candidates.push({ kind: "RALLY", entries: [{ u: leader }], score: average < 45 ? 220 : 125, signature: "leadership:rally" });
    }
  }
  if (doctrine === "defensive_line" || doctrine === "elastic_defense" || doctrine === "forest_ambush") {
    const engineers = mine.filter(u => u.type === "ENGINEERS" && !engaged.has(u.key));
    if (engineers.length) candidates.push({ kind: "FORTIFY", entries: engineers.map(u => ({ u })), score: 105, signature: "engineers:fortify" });
  }

  // Meaningful reserve trigger: threatened ranged line, losing field strength, or round four of an aggressive plan.
  const reserveTrigger = threatenedRanged.length > 0 || battleMen(units, side, true) < battleMen(units, otherSide(side), true) * 0.85
    || (round >= 4 && ["hammer_anvil", "cavalry_flank", "center_breakthrough"].includes(doctrine));
  if (reserves.length && reserveTrigger && zoneOf) {
    const occupied = new Set(units.filter(u => u.status === "ready" && u.x !== null).map(u => `${u.x},${u.y}`));
    const entries: AiEntry[] = [];
    for (const u of reserves) {
      let best: Cell | null = null, bestScore = -Infinity;
      for (const f of field) for (let dx = 0; dx < MICRO; dx++) for (let dy = 0; dy < MICRO; dy++) {
        const to = { x: f.x * MICRO + dx, y: f.y * MICRO + dy }, key = `${to.x},${to.y}`;
        if (occupied.has(key) || !zoneOf(side)(to.x, to.y) || terrainAt(to.x, to.y) === "water") continue;
        const anchor = threatenedRanged[0] ?? mine.find(v => roles[v.key] === "center") ?? mine[0];
        const score = -manhattan(to, pos(anchor)) + (["forest", "hills", "village"].includes(terrainAt(to.x, to.y)) ? 3 : 0);
        if (score > bestScore) { bestScore = score; best = to; }
      }
      if (best && valid({ u, to: best }, "RESERVE")) { entries.push({ u, to: best }); occupied.add(`${best.x},${best.y}`); }
    }
    if (entries.length) candidates.push({ kind: "RESERVE", entries, score: threatenedRanged.length ? 190 : 115, signature: "reserves:deploy" });
  }

  // Legal movement and withdrawals. Candidate destinations are scored, never nearest-target teleports.
  for (const u of mine) {
    if (engaged.has(u.key)) continue;
    const nearest = foes.slice().sort((a, b) => cheb(pos(u), pos(a)) - cheb(pos(u), pos(b)) || a.key.localeCompare(b.key))[0];
    const distance = cheb(pos(u), pos(nearest));
    const weak = u.morale < 40 || u.fatigue >= 85 || u.men < u.startMen * 0.3;
    if (!weak && (doctrine === "defensive_line" || doctrine === "elastic_defense") && distance > 4 && !threatenedRanged.length) continue;
    let best: Cell | null = null, bestScore = -Infinity;
    for (const to of reachableCells(u, units, field, terrainAt).values()) {
      const nearestAfter = Math.min(...foes.map(f => cheb(to, pos(f))));
      const terrain = terrainAt(to.x, to.y), defensive = terrain === "forest" || terrain === "hills" || terrain === "village" ? 5 : terrain === "marsh" ? -2 : 0;
      let score = defensive;
      if (weak || doctrine === "elastic_defense") score += nearestAfter * 9 + (u.morale < 35 ? 15 : 0);
      else if (isRanged(u.type)) score += -Math.abs(nearestAfter - Math.min(3, UNIT_STATS[u.type].range - 1)) * 8 + (nearestAfter <= 1 ? -30 : 0);
      else score += (distance - nearestAfter) * 12;
      if (doctrine === "forest_ambush" && terrain === "forest") score += 14;
      if (isCavalry(u.type)) score += (FLANK[flankOf(nearest, to)] - 1) * 25;
      if (!isRanged(u.type) && threatenedRanged.length) score += Math.max(0, 20 - Math.min(...threatenedRanged.map(r => manhattan(to, pos(r)))) * 3);
      score -= to.y * 1e-6 + to.x * 1e-9;
      if (score > bestScore) { bestScore = score; best = to; }
    }
    if (best && valid({ u, to: best }, "MOVE")) candidates.push({ kind: "MOVE", entries: [{ u, to: best }], score: (weak ? 85 : 35) + bestScore, signature: `move:${u.key}` });
  }

  const usedUnits = new Set<string>(), plannedCells = new Set<string>(), accepted: AiCandidate[] = [];
  for (const candidate of candidates.sort((a, b) => b.score - a.score || a.signature.localeCompare(b.signature))) {
    if (accepted.length >= cp) break;
    const entries = candidate.entries.filter(e => !usedUnits.has(e.u.key) && valid(e, candidate.kind)
      && (!e.to || !plannedCells.has(`${e.to.x},${e.to.y}`)));
    if (!entries.length) continue;
    accepted.push({ ...candidate, entries });
    for (const e of entries) { usedUnits.add(e.u.key); if (e.to) plannedCells.add(`${e.to.x},${e.to.y}`); }
  }
  const orders: FBOrder[] = []; let seq = startSeq;
  const KIND_CZ: Record<OrderKind, string> = { MOVE: "přesun", ATTACK: "útok", CHARGE: "náraz", HOLD: "držet", VOLLEY: "salva", FORTIFY: "opevnění", RALLY: "shromáždění", RESERVE: "nástup zálohy" };
  plan.explanation = accepted.map(c => {
    const t = c.entries[0].target ? units.find(v => v.key === c.entries[0].target) : undefined;
    return `${KIND_CZ[c.kind]} ${c.entries.length}× ${c.entries[0].u.type}${t ? ` → ${t.type}${t.x !== null ? ` (${flankOf(t, pos(c.entries[0].u)) === "front" ? "zepředu" : flankOf(t, pos(c.entries[0].u)) === "side" ? "z boku" : "do týlu"})` : ""}` : ""} · skóre ${Math.round(c.score)}`;
  });
  accepted.forEach((candidate, cmdIndex) => {
    if (candidate.kind === "RESERVE") plan.reserveCalled = true;
    for (const entry of candidate.entries) orders.push({ seq: seq++, cmd: startSeq + cmdIndex, key: entry.u.key, kind: candidate.kind,
      ...(entry.to ? { to: { x: entry.to.x, y: entry.to.y } } : {}), ...(entry.target ? { target: entry.target } : {}) });
  });
  return { orders, plan };
}

/** Compatibility wrapper for stateless scenario simulations; live battles persist planBattleAi metadata. */
export function planAiOrders(units: FBUnit[], side: Side, field: Cell[], terrainAt: TerrainAt, cp: number, startSeq = 1): FBOrder[] {
  return planBattleAi(units, side, field, terrainAt, cp, startSeq).orders;
}

// ── Settlement ──
export type StackRow = { id: string; soldiers: number; power: number; morale: number };
export type CompRow = { id: string; stack_id: string; unit_type: string; manpower: number };
const powerBase = (comps: { unit_type: string; manpower: number }[], factor: Record<string, number>) => comps.reduce((s, c) => s + c.manpower * (factor[c.unit_type] ?? 1), 0);
/** Final per-stack outcome. Dead men are lost from their own composition row; routed and reserve survivors return. */
export function settlementPlan(units: FBUnit[], stacks: StackRow[], comps: CompRow[], powerFactor: Record<string, number>) {
  const lossByComp = new Map<string, number>(); const lossByStack = new Map<string, number>(); const lossByType = new Map<string, Record<string, number>>();
  const moraleSum = new Map<string, { w: number; m: number }>();
  for (const u of units) {
    const lost = Math.max(0, u.startMen - u.men);
    lossByStack.set(u.stackId, (lossByStack.get(u.stackId) ?? 0) + lost);
    if (u.compId) lossByComp.set(u.compId, (lossByComp.get(u.compId) ?? 0) + lost);
    const lt = lossByType.get(u.stackId) ?? {}; lt[u.sourceType ?? "MILITIA"] = (lt[u.sourceType ?? "MILITIA"] ?? 0) + lost; lossByType.set(u.stackId, lt);
    const ms = moraleSum.get(u.stackId) ?? { w: 0, m: 0 }; ms.w += u.men; ms.m += u.men * u.morale; moraleSum.set(u.stackId, ms);
  }
  const compUpdates = comps.filter(c => (lossByComp.get(c.id) ?? 0) > 0).map(c => ({ id: c.id, manpower: Math.max(0, c.manpower - (lossByComp.get(c.id) ?? 0)) }));
  const stackUpdates = stacks.map(s => {
    const soldiers = Math.max(0, s.soldiers - (lossByStack.get(s.id) ?? 0));
    const before = comps.filter(c => c.stack_id === s.id);
    const after = before.map(c => ({ ...c, manpower: compUpdates.find(x => x.id === c.id)?.manpower ?? c.manpower }));
    const b0 = powerBase(before, powerFactor), b1 = powerBase(after, powerFactor);
    const ms = moraleSum.get(s.id); const morale = ms && ms.w > 0 ? Math.round(ms.m / ms.w) : s.morale;
    const mm = (m: number) => 0.5 + (Math.max(0, Math.min(100, m)) / 100) * 0.7;
    const ratio = b0 > 0 ? b1 / b0 : (s.soldiers > 0 ? soldiers / s.soldiers : 0);
    return { id: s.id, soldiers, unit_count: soldiers, power: Math.round(s.power * ratio * mm(morale) / mm(s.morale || 1)), morale, is_active: soldiers > 0,
      lost: lossByStack.get(s.id) ?? 0, lostByType: lossByType.get(s.id) ?? {} };
  });
  return { stackUpdates, compUpdates };
}
/** Settlement may run exactly once: only an unfinished battle at the expected revision can be settled. */
export const canSettle = (battle: { status: string; rev: number }, expectedRev: number) => battle.status !== "finished" && battle.rev === expectedRev;

// Back-compat alias used by older code/tests.
export const MOVE_RANGE: Record<string, number> = Object.fromEntries(UNIT_TYPES.map(t => [t, UNIT_STATS[t].move]));
export function stackOutcome(units: FBUnit[]) {
  const out = new Map<string, { men: number; lost: number; morale: number }>();
  for (const u of units) { const o = out.get(u.stackId) ?? { men: 0, lost: 0, morale: 0 }; o.men += u.men; o.lost += u.startMen - u.men; o.morale += u.morale * u.men; out.set(u.stackId, o); }
  for (const o of out.values()) o.morale = o.men > 0 ? Math.round(o.morale / o.men) : 0;
  return out;
}
