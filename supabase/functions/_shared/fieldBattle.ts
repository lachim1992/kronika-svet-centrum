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
  shieldwall: { label: "Štítová hradba", text: "−10 % útok, +25 % čelní obrana, +10 % proti střelbě; z boku/týlu +20 % ztrát; pohyb −1" },
  deep: { label: "Hluboký šik", text: "+15 % útok zblízka, +10 % obrana, +10 % ztrát od střelby; pohyb −1" },
  loose: { label: "Volný šik", text: "−25 % ztrát od střelby, +1 pohyb, −15 % obrana zblízka, poloviční podpora sousedů" },
  wedge: { label: "Klín", text: "+35 % náraz, +10 % útok zblízka, −15 % obrana z boku/týlu" },
  square: { label: "Čtverec", text: "+20 % obrana ze všech stran, náraz jízdy ×0,5, −20 % útok; pohyb −1" },
  skirmish: { label: "Rozptyl", text: "+15 % střelba, +1 pohyb, −20 % obrana zblízka (jen střelci, oštěpaři, lehká jízda)" },
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

/** Split a stack into ≤200-man units, per composition row so every unit keeps its real type; manpower is preserved exactly.
 *  Soldiers not covered by the composition become untyped militia units (compId null). */
export function buildUnits(side: Side, stackId: string, soldiers: number, composition: { id?: string; unit_type: string; manpower: number }[],
  morale: number, stackFormation?: string | null): FBUnit[] {
  const out: FBUnit[] = []; let i = 0; let covered = 0; const total = Math.max(0, Math.floor(soldiers));
  const push = (men: number, compId: string | null, sourceType: string | null) => {
    const type = normalizeUnitType(sourceType);
    out.push({ key: `${stackId}:${i++}`, side, stackId, compId, sourceType, type, formation: unitFormation(stackFormation, type), men, startMen: men,
      morale, fatigue: 0, ammo: UNIT_STATS[type].ammo, quality: 1, x: null, y: null, facing: "n", status: "ready" });
  };
  for (const c of composition) {
    let left = Math.min(Math.max(0, Math.floor(c.manpower)), total - covered); covered += left;
    while (left > 0) { const men = Math.min(MEN_PER_UNIT, left); push(men, c.id ?? null, c.unit_type); left -= men; }
  }
  for (let left = total - covered; left > 0; left -= MEN_PER_UNIT) push(Math.min(MEN_PER_UNIT, left), null, null);
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
export const commandPoints = (generalSkill: number | null | undefined) =>
  generalSkill == null ? BASE_CP : Math.min(MAX_CP, BASE_CP + Math.floor(Math.max(0, Math.min(10, generalSkill)) / 3));

// ── Orders ──
export type OrderKind = "MOVE" | "ATTACK" | "CHARGE" | "HOLD" | "VOLLEY" | "FORTIFY" | "RALLY" | "RESERVE";
export type FBOrder = { seq: number; cmd: number; key: string; kind: OrderKind; to?: { x: number; y: number }; target?: string };
export type BattleMeta = { rallyReadyRound?: Partial<Record<Side, number>>; fortified?: { x: number; y: number; side: Side; until: number }[];
  hasGeneral?: Partial<Record<Side, boolean>>; generalSkill?: Partial<Record<Side, number | null>>; ai?: Partial<Record<Side, boolean>> };
export type FBEvent = { seq: number; key: string; kind: string; text: string; target?: string; lossesTarget?: number; lossesSelf?: number };

/** Effective movement for this round: type + formation + terrain + fatigue, at least 1. */
export function moveRange(u: FBUnit, terrainAt: TerrainAt = () => "plain") {
  let m = UNIT_STATS[u.type].move;
  if (u.formation === "shieldwall" || u.formation === "deep" || u.formation === "square") m -= 1;
  if (u.formation === "loose" || u.formation === "skirmish") m += 1;
  if (u.x !== null && isCavalry(u.type)) { const t = terrainAt(u.x, u.y!); if (t === "forest" || t === "marsh") m -= 1; }
  if (u.fatigue >= 80) m -= 1;
  return Math.max(1, m);
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
    return null;
  }
  if (o.kind === "ATTACK" || o.kind === "CHARGE" || o.kind === "VOLLEY") {
    const t = units.find(v => v.key === o.target); if (!t || t.side === u.side || t.status !== "ready") return "Neplatný cíl útoku";
    if (o.kind === "VOLLEY" && u.ammo < 2) return "Na salvu chybí munice (2)";
    if (o.kind === "VOLLEY" && cheb(pos(u), pos(t)) > UNIT_STATS[u.type].range) return "Cíl je mimo dostřel";
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
  const s = Math.min(0.15, n * 0.05); return u.formation === "loose" || u.formation === "skirmish" ? s / 2 : s;
}
export type HitCtx = { ranged: boolean; charge: boolean; volley: boolean; flank: Flank; holding: boolean; fortified: boolean; variance: number;
  terrainAttacker: Terrain; terrainTarget: Terrain; support: number };
/** Casualties of one hit — the single combat formula. */
export function casualties(a: FBUnit, t: FBUnit, c: HitCtx): number {
  const st = UNIT_STATS[a.type], ts = UNIT_STATS[t.type];
  const base = c.ranged ? st.ranged : st.melee;
  const moraleF = 0.5 + a.morale / 200, fatigueF = 1 - Math.min(100, a.fatigue) * 0.003;
  let formAtk = 1;
  if (a.formation === "line") formAtk *= 1.05;
  if (a.formation === "shieldwall") formAtk *= 0.9;
  if (a.formation === "square") formAtk *= 0.8;
  if (!c.ranged && a.formation === "deep") formAtk *= 1.15;
  if (!c.ranged && a.formation === "wedge") formAtk *= 1.10;
  if (c.ranged && a.formation === "skirmish") formAtk *= 1.15;
  if (c.charge) { formAtk *= 1.25; if (a.formation === "wedge") formAtk *= 1.35; if (t.formation === "square") formAtk *= 0.5;
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
    case "shieldwall": if (c.flank === "front") formDef += 0.25; else dmgMul *= 1.2; if (c.ranged) dmgMul *= 0.9; break;
    case "deep": formDef += 0.10; if (c.ranged) dmgMul *= 1.1; break;
    case "loose": if (c.ranged) dmgMul *= 0.75; else formDef -= 0.15; break;
    case "wedge": if (c.flank !== "front") formDef -= 0.15; break;
    case "square": formDef += 0.20; break;
    case "skirmish": if (!c.ranged) formDef -= 0.20; break;
  }
  let terrDef = 0;
  if (c.terrainTarget === "hills") terrDef += 0.10;
  if (c.terrainTarget === "village") terrDef += 0.20;
  if (c.ranged && c.terrainTarget === "forest") dmgMul *= 0.8;
  if (c.holding) formDef += 0.10;
  if (c.fortified) formDef += 0.25;
  const mitigation = Math.max(0.45, Math.min(1, 1 - ts.defense / 100 - ts.armor / 200 - terrDef - formDef - c.support));
  const volley = c.volley ? 1.3 : 1;
  const raw = (a.men / MEN_PER_UNIT) * base * moraleF * fatigueF * a.quality * formAtk * terrAtk * matchup * FLANK[c.flank] * c.variance * mitigation * dmgMul * volley;
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
  const moraleHit = (t: FBUnit, amount: number) => { const m = t.type === "ELITE_GUARD" ? amount * 0.75 : amount; t.morale = Math.max(0, Math.round((t.morale - m) * 100) / 100); };
  const checkRout = (t: FBUnit) => { if (t.men <= 0) { t.men = 0; t.status = "dead"; } else if (t.status === "ready" && t.morale < ROUT_MORALE) t.status = "routed"; };
  const strike = (a: FBUnit, t: FBUnit, opts: { ranged: boolean; charge?: boolean; volley?: boolean }) => {
    const flank = flankOf(t, pos(a));
    const loss = casualties(a, t, { ranged: opts.ranged, charge: !!opts.charge, volley: !!opts.volley, flank, holding: holding.has(t.key), fortified: fortifiedAt(t),
      variance: 0.9 + rand() * 0.2, terrainAttacker: terrainAt(a.x!, a.y!), terrainTarget: terrainAt(t.x!, t.y!), support: supportDefense(units, t) });
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
      let n = 0; for (const v of units) if (v.side === u.side && v.status === "ready" && v.x !== null && manhattan(pos(v), pos(u)) <= 3) { v.morale = Math.min(100, v.morale + 15); n++; }
      meta.rallyReadyRound = { ...(meta.rallyReadyRound ?? {}), [u.side]: round + 3 };
      events.push({ seq: o.seq, key: u.key, kind: "rally", text: `generál shromáždil ${n} oddílů (+15 morálky)` }); continue;
    }
    const t = o.target ? by.get(o.target) : undefined;
    if (!t || t.status !== "ready" || t.x === null) { events.push({ seq: o.seq, key: u.key, kind: "attack_void", target: o.target, text: "cíl už nebojuje" }); continue; }
    if (o.kind === "CHARGE") {
      if (!isCavalry(u.type)) continue;
      const tt = terrainAt(t.x!, t.y!);
      if (tt === "forest" || tt === "village") { events.push({ seq: o.seq, key: u.key, kind: "charge_fail", target: t.key, text: "náraz do lesa/vesnice nelze" }); continue; }
      const r = moveRange(u, terrainAt);
      const opp: Record<Facing, [number, number]> = { n: [0, 1], s: [0, -1], e: [-1, 0], w: [1, 0] };
      const cand = ORTHO.map(([dx, dy]) => ({ x: t.x! + dx, y: t.y! + dy, rear: opp[t.facing][0] === dx && opp[t.facing][1] === dy }))
        .filter(c => (c.x === u.x && c.y === u.y) || (!occupied(c.x, c.y) && inBattlefield(field, c.x, c.y) && terrainAt(c.x, c.y) !== "water" && terrainAt(c.x, c.y) !== "forest" && manhattan(pos(u), c) <= r))
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

// ── Deterministic AI ──
/** Heuristic AI orders for one side (no LLM): uses at most `cp` commands, deterministic for the same state. */
export function planAiOrders(units: FBUnit[], side: Side, field: Cell[], terrainAt: TerrainAt, cp: number, startSeq = 1): FBOrder[] {
  const mine = units.filter(u => u.side === side && u.status === "ready" && u.x !== null).sort((a, b) => a.key.localeCompare(b.key));
  const foes = units.filter(u => u.side !== side && u.status === "ready" && u.x !== null);
  if (!foes.length || !mine.length) return [];
  const taken = new Set(units.filter(u => u.status === "ready" && u.x !== null).map(u => `${u.x},${u.y}`));
  type Plan = { u: FBUnit; kind: OrderKind; target?: string; to?: { x: number; y: number }; score: number };
  const plans: Plan[] = [];
  const nearest = (u: FBUnit, list = foes) => list.slice().sort((a, b) => cheb(pos(u), pos(a)) - cheb(pos(u), pos(b)) || a.men - b.men || a.key.localeCompare(b.key))[0];
  for (const u of mine) {
    const st = UNIT_STATS[u.type];
    const weak = u.men < u.startMen * 0.35 || u.morale < 35;
    const adj = foes.filter(f => cheb(pos(u), pos(f)) <= 1).sort((a, b) => a.men - b.men || a.key.localeCompare(b.key));
    if (weak) { plans.push({ u, kind: "HOLD", score: 1 }); continue; }
    if (isRanged(u.type)) {
      const inRange = foes.filter(f => cheb(pos(u), pos(f)) <= st.range && cheb(pos(u), pos(f)) > 1).sort((a, b) => a.men - b.men || a.key.localeCompare(b.key));
      if (u.ammo >= 1 && inRange.length) { plans.push({ u, kind: u.ammo >= 2 && u.type !== "SLINGERS" ? "VOLLEY" : "ATTACK", target: inRange[0].key, score: 8 }); continue; }
      if (adj.length) { plans.push({ u, kind: "ATTACK", target: adj[0].key, score: 5 }); continue; }
      // keep distance: if nothing in range, step forward one square toward nearest enemy
    }
    if (isCavalry(u.type)) {
      const archers = foes.filter(f => isRanged(f.type) && manhattan(pos(u), pos(f)) <= moveRange(u, terrainAt) + 1);
      const tgt = (archers.length ? archers : foes.filter(f => manhattan(pos(u), pos(f)) <= moveRange(u, terrainAt) + 1 && f.type !== "SPEARMEN"))
        .sort((a, b) => FLANK[flankOf(b, pos(u))] - FLANK[flankOf(a, pos(u))] || a.men - b.men || a.key.localeCompare(b.key))[0];
      if (tgt && terrainAt(tgt.x!, tgt.y!) !== "forest") { plans.push({ u, kind: "CHARGE", target: tgt.key, score: 9 }); continue; }
    }
    if (u.type === "SPEARMEN" && foes.some(f => isCavalry(f.type) && cheb(pos(u), pos(f)) <= 4) && !adj.length) { plans.push({ u, kind: "HOLD", score: 2 }); continue; }
    if (adj.length) { plans.push({ u, kind: "ATTACK", target: adj[0].key, score: 7 }); continue; }
    const n = nearest(u); const r = moveRange(u, terrainAt);
    let best: { x: number; y: number } | null = null; let bestD = cheb(pos(u), pos(n));
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.abs(dx) + Math.abs(dy) > r || (!dx && !dy)) continue;
      const c = { x: u.x! + dx, y: u.y! + dy };
      if (taken.has(`${c.x},${c.y}`) || !inBattlefield(field, c.x, c.y) || terrainAt(c.x, c.y) === "water") continue;
      const d = cheb(c, pos(n)); if (isRanged(u.type) && d < 2) continue;
      if (d < bestD) { bestD = d; best = c; }
    }
    if (best) { taken.add(`${best.x},${best.y}`); plans.push({ u, kind: "MOVE", to: best, score: 4 }); }
  }
  // Each AI command is one CP; group identical moves are not needed — pick the highest-value orders.
  const chosen = plans.filter(p => p.kind !== "HOLD").sort((a, b) => b.score - a.score || a.u.key.localeCompare(b.u.key)).slice(0, cp);
  return chosen.map((p, i) => ({ seq: startSeq + i, cmd: startSeq + i, key: p.u.key, kind: p.kind, ...(p.to ? { to: p.to } : {}), ...(p.target ? { target: p.target } : {}) }));
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
  const compUpdates = comps.filter(c => lossByComp.has(c.id)).map(c => ({ id: c.id, manpower: Math.max(0, c.manpower - (lossByComp.get(c.id) ?? 0)) }));
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
