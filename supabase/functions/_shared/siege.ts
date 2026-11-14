// Micro-square siege rules (pure, deterministic). command-dispatch validates orders, commit-turn resolves once per turn.
// Each micro unit (<=200 men) may act once per turn on one target: a wall segment, an enemy micro unit, or the main building.
// The attacker always acts first; after that orders resolve in the order they were issued. A unit killed earlier never acts.
import { MAX_MEN_PER_MICRO } from "./microMovement.ts";

export const WALL_SEGMENT_NAMES = ["Severní hradba", "Východní hradba", "Jižní hradba", "Západní hradba", "Severovýchodní hradba", "Jihovýchodní hradba", "Jihozápadní hradba", "Severozápadní hradba"];
const WALL_STRENGTH: Record<string, number> = { HAMLET: 1, VILLAGE: 1.5, TOWN: 2.5, CITY: 4, POLIS: 5 };

export type WallSegment = { id: number; name: string; breached: boolean };
export type Side = "attacker" | "defender";
export type SiegeUnit = { key: string; side: Side; stackId: string | null; idx: number; men: number; quality: number };
export type SiegeTarget = { kind: "wall"; segment: number } | { kind: "unit"; key: string } | { kind: "keep" } | { kind: "move"; parcel: number };
/** Unit key -> city micro-square (0..35, 6x6) for units INSIDE the walls. Attackers without an entry stand outside. */
export type SiegePositions = Record<string, number>;
export type SiegeOrder = { seq: number; side: Side; unitKey: string; target: SiegeTarget };
export type SiegeEvent = { seq: number; unitKey: string; side: Side; target: SiegeTarget; outcome: string; lossesSelf: number; lossesTarget: number; text: string };

export function wallStrength(settlementLevel: string | null | undefined) { return WALL_STRENGTH[String(settlementLevel || "HAMLET").toUpperCase()] ?? 1; }
export function initialWalls(settlementLevel: string | null | undefined): WallSegment[] {
  const n = wallStrength(settlementLevel) >= 2.5 ? 8 : 4;
  return Array.from({ length: n }, (_, id) => ({ id, name: WALL_SEGMENT_NAMES[id], breached: false }));
}

/** Split a stack into micro units of at most 200 men; idx 0 is the fullest. */
export function microUnits(side: Side, stackId: string | null, soldiers: number, quality: number, keyPrefix = stackId ?? "garrison"): SiegeUnit[] {
  const out: SiegeUnit[] = [];
  for (let i = 0, left = Math.max(0, Math.floor(soldiers)); left > 0; i += 1, left -= MAX_MEN_PER_MICRO)
    out.push({ key: `${keyPrefix}:${i}`, side, stackId, idx: i, men: Math.min(MAX_MEN_PER_MICRO, left), quality });
  return out;
}

/** Siege may start from the city square or any of its 8 neighbours. */
export const siegeInRange = (army: { x: number; y: number }, city: { x: number; y: number }) => Math.max(Math.abs(army.x - city.x), Math.abs(army.y - city.y)) <= 1;

function rand(seed: string) { let h = 2166136261; for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// City interior: 6x6 micro squares; the main building occupies the four centre squares.
export const CITY_SIDE = 6;
export const KEEP_PARCELS = [14, 15, 20, 21];
const pxy = (i: number) => ({ x: i % CITY_SIDE, y: Math.floor(i / CITY_SIDE) });
export const parcelDist = (a: number, b: number) => { const p = pxy(a), q = pxy(b); return Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)); };
export const validParcel = (i: unknown) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < CITY_SIDE * CITY_SIDE;
/** Edge micro square behind wall segment i of n (same compass direction the map draws the wall marker in). */
export function entryParcel(segment: number, n: number) {
  const a = -Math.PI / 2 + (segment / Math.max(1, n)) * Math.PI * 2; let best = 0, score = -Infinity;
  for (let i = 0; i < CITY_SIDE * CITY_SIDE; i++) { const { x, y } = pxy(i); if (x > 0 && y > 0 && x < CITY_SIDE - 1 && y < CITY_SIDE - 1) continue;
    const u = (x - y) / (CITY_SIDE - 1), v = (x + y) / (CITY_SIDE - 1) - 1; const sc = u * Math.cos(a) + v * Math.sin(a); if (sc > score + 1e-9) { score = sc; best = i; } }
  return best;
}
/** Defenders without a square take the main building first, then the squares nearest to it. */
export function placeDefenders(units: SiegeUnit[], positions: SiegePositions): SiegePositions {
  const out: SiegePositions = {}; const alive = new Set(units.filter(u => u.men > 0).map(u => u.key));
  for (const [k, p] of Object.entries(positions || {})) if (alive.has(k) && validParcel(p)) out[k] = p;
  const taken = new Set(Object.values(out));
  const order = Array.from({ length: CITY_SIDE * CITY_SIDE }, (_, i) => i).sort((a, b) => Math.min(...KEEP_PARCELS.map(k => parcelDist(a, k))) - Math.min(...KEEP_PARCELS.map(k => parcelDist(b, k))) || a - b);
  for (const u of units) if (u.side === "defender" && u.men > 0 && out[u.key] === undefined) { const free = order.find(i => !taken.has(i)); if (free === undefined) break; out[u.key] = free; taken.add(free); }
  return out;
}

/** Attacker first, then issue order. */
export function executionOrder(orders: SiegeOrder[]): SiegeOrder[] {
  const sorted = [...orders].sort((a, b) => a.seq - b.seq);
  const first = sorted.findIndex(o => o.side === "attacker");
  if (first > 0) sorted.unshift(sorted.splice(first, 1)[0]);
  return sorted;
}

/** Chance one micro unit breaches a wall segment: own strength vs wall strength and defenders on the walls. */
export function breachChance(men: number, quality: number, wall: number, defendersOnWalls: number) {
  return clamp(0.25 * (men / MAX_MEN_PER_MICRO) * (quality / 50) / (wall * (1 + defendersOnWalls / 400)), 0.03, 0.85);
}

export function resolveSiegeTurn(input: { seed: string; wall: number; walls: WallSegment[]; units: SiegeUnit[]; orders: SiegeOrder[]; positions?: SiegePositions }) {
  const walls = input.walls.map(w => ({ ...w }));
  const units = new Map(input.units.map(u => [u.key, { ...u }]));
  const pos: SiegePositions = placeDefenders(input.units, input.positions || {});
  const occupied = (p: number) => Object.entries(pos).some(([k, q]) => q === p && (units.get(k)?.men ?? 0) > 0);
  const n = walls.length;
  const alive = (side: Side) => [...units.values()].filter(u => u.side === side && u.men > 0);
  const events: SiegeEvent[] = [];
  const acted = new Set<string>();
  let captured = false;
  for (const o of executionOrder(input.orders)) {
    const me = units.get(o.unitKey);
    if (!me || me.side !== o.side || acted.has(o.unitKey)) continue;
    acted.add(o.unitKey);
    const ev = (outcome: string, lossesSelf: number, lossesTarget: number, text: string) => events.push({ seq: o.seq, unitKey: o.unitKey, side: o.side, target: o.target, outcome, lossesSelf, lossesTarget, text });
    if (me.men <= 0) { ev("dead", 0, 0, "Jednotka padla dřív, než stihla zaútočit."); continue; }
    const r = rand(`${input.seed}:${o.seq}:${o.unitKey}`);
    const breached = walls.some(w => w.breached);
    const onWalls = alive("defender").reduce((s, u) => s + u.men, 0);
    if (o.target.kind === "wall") {
      if (me.side !== "attacker") { ev("invalid", 0, 0, "Obránci hradby neútočí."); continue; }
      const seg = walls.find(w => w.id === (o.target as any).segment);
      if (!seg) { ev("invalid", 0, 0, "Úsek hradby neexistuje."); continue; }
      if (pos[me.key] !== undefined) { ev("invalid", 0, 0, "Oddíl už je uvnitř města."); continue; }
      // Through an existing breach: the squad steps onto the edge square behind that wall (if free).
      if (seg.breached) { const e = entryParcel(seg.id, n);
        if (occupied(e)) { ev("blocked", 0, 0, `Průlom v ${seg.name} je ucpaný — pole za ním je obsazené.`); continue; }
        pos[me.key] = e; ev("entered", 0, 0, `Oddíl prošel průlomem v ${seg.name} do města.`); continue; }
      const p = breachChance(me.men, me.quality, input.wall, onWalls);
      const loss = Math.min(me.men, Math.round(me.men * 0.04 * input.wall * (1 + onWalls / 400) * (0.6 + 0.8 * rand(`${input.seed}:${o.seq}:loss`))));
      me.men -= loss;
      if (r < p) { seg.breached = true; const e = entryParcel(seg.id, n);
        if (me.men > 0 && !occupied(e)) pos[me.key] = e;
        ev("breach", loss, 0, `${seg.name} prolomena (šance ${Math.round(p * 100)} %)${pos[me.key] === e ? " — oddíl vnikl do města" : ""}.`); }
      else ev("held", loss, 0, `${seg.name} odolala (šance ${Math.round(p * 100)} %).`);
      continue;
    }
    if (o.target.kind === "move") {
      const from = pos[me.key]; const to = (o.target as any).parcel;
      if (from === undefined) { ev("invalid", 0, 0, "Oddíl ještě není ve městě — nejdřív projdi průlomem."); continue; }
      if (!validParcel(to)) { ev("invalid", 0, 0, "Neplatné pole."); continue; }
      // One micro square per turn towards the target, never onto an occupied square.
      const { x, y } = pxy(from); let best = from, bd = parcelDist(from, to);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy;
        if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= CITY_SIDE || ny >= CITY_SIDE) continue; const c = ny * CITY_SIDE + nx;
        if (occupied(c)) continue; const d = parcelDist(c, to); if (d < bd) { bd = d; best = c; } }
      if (best === from) { ev("blocked", 0, 0, "Cesta je zablokovaná."); continue; }
      pos[me.key] = best; ev("moved", 0, 0, "Oddíl postoupil o jedno pole."); continue;
    }
    if (o.target.kind === "unit") {
      const t = units.get((o.target as any).key);
      if (!t || t.side === me.side) { ev("invalid", 0, 0, "Neplatný cíl."); continue; }
      if (t.men <= 0) { ev("dead_target", 0, 0, "Cíl už padl."); continue; }
      // Attackers reach defenders only through a breach; defenders shoot from the walls at half effect.
      // Inside the city both must stand on neighbouring squares; attackers outside cannot reach; defenders shoot from the walls at half effect.
      const mp = pos[me.key], tp = pos[t.key];
      let factor = 0;
      if (mp !== undefined && tp !== undefined) factor = parcelDist(mp, tp) <= 1 ? 1 : 0;
      else if (me.side === "defender" && tp === undefined) factor = 0.5;
      if (!factor) { ev("blocked", 0, 0, me.side === "attacker" && mp === undefined ? (breached ? "Nejdřív projdi průlomem do města." : "Obránci jsou za hradbami — nejdřív je prolom.") : "Cíl je příliš daleko — musí stát na sousedním poli."); continue; }
      const dmg = Math.min(t.men, Math.round(me.men * 0.12 * (me.quality / 50) * factor * (0.7 + 0.6 * r)));
      const back = Math.min(me.men, Math.round(t.men * 0.06 * (t.quality / 50) * (0.7 + 0.6 * rand(`${input.seed}:${o.seq}:back`))));
      t.men -= dmg; me.men -= back;
      ev(t.men <= 0 ? "killed" : "hit", back, dmg, `Zabito ${dmg} nepřátel, ztráty ${back}${t.men <= 0 ? " — nepřátelská jednotka zničena" : ""}.`);
      continue;
    }
    // Main building: needs a breach and no living defenders.
    if (me.side !== "attacker") { ev("invalid", 0, 0, "Neplatný cíl."); continue; }
    if (!breached) { ev("blocked", 0, 0, "K hlavní budově se dostaneš jen průlomem v hradbách."); continue; }
    const mp = pos[me.key];
    if (mp === undefined || !KEEP_PARCELS.some(k => parcelDist(mp, k) <= 1)) { ev("blocked", 0, 0, "Oddíl musí stát u hlavní budovy."); continue; }
    if (KEEP_PARCELS.some(k => Object.entries(pos).some(([u, q]) => q === k && units.get(u)?.side === "defender" && (units.get(u)?.men ?? 0) > 0))) { ev("blocked", 0, 0, "Hlavní budovu ještě brání posádka."); continue; }
    captured = true; ev("captured", 0, 0, "Hlavní budova dobyta — město padlo.");
  }
  const losses = new Map<string, number>();
  for (const u of input.units) { const now = units.get(u.key)!; const lost = u.men - Math.max(0, now.men); if (lost > 0) losses.set(u.stackId ?? "garrison", (losses.get(u.stackId ?? "garrison") ?? 0) + lost); }
  const positions: SiegePositions = {}; const roster: Record<string, number> = {};
  for (const [k, p] of Object.entries(pos)) { const u = units.get(k); if (u && u.men > 0) { positions[k] = p; roster[k] = u.men; } }
  return { walls, events, captured, losses: Object.fromEntries(losses), positions, roster };
}
