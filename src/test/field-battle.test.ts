import { describe, it, expect } from "vitest";
import {
  battleInRange, maxBattlefieldSquares, validateBattlefield, buildUnits, autoDeploy, resolveRound, settlementPlan, canSettle,
  UNIT_STATS, UNIT_TYPES, normalizeUnitType, normalizeFormation, formationAllowed, unitFormation, FORMATIONS, casualties, flankOf,
  supportDefense, moveRange, terrainOfSubBiome, commandPoints, cpUsed, orderProblem, planAiOrders, seededRandom, timeoutWinner,
  initiativeOrder, upgradeUnit, MAX_ROUNDS, type FBUnit, type FBOrder, type HitCtx, type UnitType, type Formation,
} from "../../supabase/functions/_shared/fieldBattle";
import { UNIT_GOLD_FACTOR, UNIT_PROD_FACTOR, UNIT_POWER_FACTOR, UNIT_RECRUIT_MORALE, FORMATION_PRESETS, presetRequirements, missingBuildings } from "../../supabase/functions/_shared/unitTypes";

const plain = () => "plain" as const;
const field = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
const u = (key: string, side: "attacker" | "defender", x: number | null, y: number | null, extra: Partial<FBUnit> = {}): FBUnit => upgradeUnit({
  key, side, stackId: side, compId: null, sourceType: null, type: "SWORDSMEN", formation: "line", men: 200, startMen: 200, morale: 70, fatigue: 0,
  ammo: 0, quality: 1, x, y, facing: side === "attacker" ? "e" : "w", status: "ready", ...extra });
const ctx = (o: Partial<HitCtx> = {}): HitCtx => ({ ranged: false, charge: false, volley: false, flank: "front", holding: false, fortified: false, variance: 1, terrainAttacker: "plain", terrainTarget: "plain", support: 0, ...o });
const hit = (a: Partial<FBUnit>, t: Partial<FBUnit>, c: Partial<HitCtx> = {}) => casualties(u("a", "attacker", 0, 0, a), u("t", "defender", 1, 0, t), ctx(c));

describe("battle start (regression)", () => {
  it("enemy in reach on neighbouring square only", () => { expect(battleInRange({ x: -6, y: 1 }, { x: -7, y: 2 })).toBe(true); expect(battleInRange({ x: -6, y: 1 }, { x: -8, y: 1 })).toBe(false); });
  it("two 8000 armies allow 4 squares", () => expect(maxBattlefieldSquares(16000)).toBe(4));
  it("battlefield contiguous and contains both", () => {
    const a = { x: 0, y: 0 }, d = { x: 1, y: 0 };
    expect(validateBattlefield([a, d], a, d, 16000)).toBeNull();
    expect(validateBattlefield([a], a, d, 16000)).toMatch(/obou/);
    expect(validateBattlefield([a, d, { x: 3, y: 0 }], a, d, 16000)).toMatch(/navazovat/);
  });
});

describe("unit catalogue", () => {
  it("has the exact stat table", () => {
    expect(UNIT_STATS.MILITIA).toEqual({ melee: 14, ranged: 0, defense: 14, armor: 5, move: 2, range: 1, ammo: 0 });
    expect(UNIT_STATS.SPEARMEN).toEqual({ melee: 17, ranged: 0, defense: 30, armor: 15, move: 2, range: 1, ammo: 0 });
    expect(UNIT_STATS.SWORDSMEN).toEqual({ melee: 23, ranged: 0, defense: 22, armor: 15, move: 2, range: 1, ammo: 0 });
    expect(UNIT_STATS.AXEMEN).toEqual({ melee: 26, ranged: 0, defense: 14, armor: 10, move: 2, range: 1, ammo: 0 });
    expect(UNIT_STATS.ARCHERS).toEqual({ melee: 7, ranged: 18, defense: 8, armor: 5, move: 2, range: 5, ammo: 6 });
    expect(UNIT_STATS.SLINGERS).toEqual({ melee: 9, ranged: 14, defense: 10, armor: 5, move: 3, range: 5, ammo: 8 });
    expect(UNIT_STATS.JAVELINERS).toEqual({ melee: 14, ranged: 17, defense: 10, armor: 6, move: 3, range: 2, ammo: 3 });
    expect(UNIT_STATS.LIGHT_CAVALRY).toEqual({ melee: 21, ranged: 0, defense: 16, armor: 12, move: 4, range: 1, ammo: 0 });
    expect(UNIT_STATS.HEAVY_CAVALRY).toEqual({ melee: 27, ranged: 0, defense: 24, armor: 24, move: 3, range: 1, ammo: 0 });
    expect(UNIT_STATS.ELITE_GUARD).toEqual({ melee: 25, ranged: 0, defense: 30, armor: 22, move: 2, range: 1, ammo: 0 });
    expect(UNIT_STATS.ENGINEERS).toEqual({ melee: 8, ranged: 0, defense: 15, armor: 10, move: 2, range: 1, ammo: 0 });
  });
  it("legacy PROFESSIONAL/INFANTRY play as SWORDSMEN, MILITIA stays", () => {
    expect(normalizeUnitType("PROFESSIONAL")).toBe("SWORDSMEN"); expect(normalizeUnitType("INFANTRY")).toBe("SWORDSMEN"); expect(normalizeUnitType("MILITIA")).toBe("MILITIA");
  });
  it("recruit costs, power and morale per spec", () => {
    expect(UNIT_GOLD_FACTOR).toMatchObject({ MILITIA: 0.4, SPEARMEN: 0.75, PROFESSIONAL: 1, AXEMEN: 0.95, ARCHERS: 0.9, SLINGERS: 0.55, JAVELINERS: 0.8, LIGHT_CAVALRY: 1.6, HEAVY_CAVALRY: 2.4, ELITE_GUARD: 2.2, ENGINEERS: 1.3 });
    expect(UNIT_PROD_FACTOR).toMatchObject({ MILITIA: 0.25, SPEARMEN: 0.55, PROFESSIONAL: 0.75, AXEMEN: 0.7, ARCHERS: 0.65, SLINGERS: 0.35, JAVELINERS: 0.55, LIGHT_CAVALRY: 1.1, HEAVY_CAVALRY: 1.8, ELITE_GUARD: 1.5, ENGINEERS: 1.2 });
    expect(UNIT_POWER_FACTOR).toMatchObject({ MILITIA: 1, SPEARMEN: 1.4, PROFESSIONAL: 2.2, AXEMEN: 1.6, ARCHERS: 1.3, SLINGERS: 1.1, JAVELINERS: 1.25, LIGHT_CAVALRY: 2, HEAVY_CAVALRY: 3, ELITE_GUARD: 3.2, ENGINEERS: 1.1 });
    expect(UNIT_RECRUIT_MORALE.ELITE_GUARD).toBe(85); expect(UNIT_RECRUIT_MORALE.MILITIA).toBe(55);
  });
  it("every new type is recruitable with real building prerequisites", () => {
    for (const t of ["SPEARMEN", "AXEMEN", "ARCHERS", "SLINGERS", "JAVELINERS", "LIGHT_CAVALRY", "HEAVY_CAVALRY", "ELITE_GUARD", "ENGINEERS"])
      expect(Object.values(FORMATION_PRESETS).some(p => p.composition.some(c => c.unit_type === t))).toBe(true);
    expect(presetRequirements(FORMATION_PRESETS.archers)).toEqual(["Střelnice"]);
    expect(presetRequirements(FORMATION_PRESETS.militia)).toEqual([]);
    expect(missingBuildings(["Kasárny", "Kovárna"], ["kasárny"])).toEqual(["Kovárna"]);
  });
});

describe("unit split", () => {
  it("keeps manpower exactly and types per composition row", () => {
    const us = buildUnits("attacker", "s", 7981, [{ id: "i", unit_type: "PROFESSIONAL", manpower: 3990 }, { id: "a", unit_type: "ARCHERS", manpower: 1595 }, { id: "m", unit_type: "MILITIA", manpower: 2396 }], 70);
    expect(us.reduce((s, x) => s + x.men, 0)).toBe(7981);
    expect(us.every(x => x.men <= 200)).toBe(true);
    expect(us.filter(x => x.compId === "a").reduce((s, x) => s + x.men, 0)).toBe(1595);
    expect(us.filter(x => x.compId === "i").every(x => x.type === "SWORDSMEN")).toBe(true);
    expect(us.every(x => x.compId !== null)).toBe(true);
    expect(() => buildUnits("attacker", "bad", 201, [{ unit_type: "MILITIA", manpower: 200 }], 70)).toThrow(/does not match/);
  });
  it("snapshots a formation allowed for the type", () => {
    const us = buildUnits("attacker", "s", 400, [{ unit_type: "ARCHERS", manpower: 200 }, { unit_type: "SPEARMEN", manpower: 200 }], 70, "shieldwall");
    expect(us[0].formation).toBe("line"); expect(us[1].formation).toBe("shieldwall");
  });
});

describe("formations", () => {
  it("all seven canonical, column = deep", () => { expect(FORMATIONS.length).toBe(7); expect(normalizeFormation("column")).toBe("deep"); expect(normalizeFormation("??")).toBe("line"); });
  it("availability by type", () => {
    expect(formationAllowed("skirmish", "ARCHERS")).toBe(true); expect(formationAllowed("skirmish", "SWORDSMEN")).toBe(false);
    expect(formationAllowed("skirmish", "LIGHT_CAVALRY")).toBe(true); expect(formationAllowed("shieldwall", "HEAVY_CAVALRY")).toBe(false);
    expect(formationAllowed("wedge", "HEAVY_CAVALRY")).toBe(true); expect(unitFormation("square", "LIGHT_CAVALRY")).toBe("line");
  });
  const base = hit({}, { formation: "line" });
  const f = (form: Formation, c: Partial<HitCtx> = {}, a: Partial<FBUnit> = {}) => hit({ formation: "line", ...a }, { formation: form }, c);
  it("line +5% attack", () => expect(hit({ formation: "line" }, {})).toBeGreaterThan(hit({ formation: "loose" }, { formation: "line" }) - 1));
  it("shieldwall strong front, weak flank, better vs ranged", () => {
    expect(f("shieldwall")).toBeLessThan(base);
    expect(f("shieldwall", { flank: "side" })).toBeGreaterThan(f("line", { flank: "side" }));
    expect(f("shieldwall", { ranged: true }, { type: "ARCHERS" })).toBeLessThan(f("line", { ranged: true }, { type: "ARCHERS" }));
  });
  it("deep +melee, more ranged damage taken", () => {
    expect(hit({ formation: "deep" }, {})).toBeGreaterThan(hit({ formation: "line" }, {}));
    expect(f("deep", { ranged: true }, { type: "ARCHERS" })).toBeGreaterThan(f("square", { ranged: true }, { type: "ARCHERS" }) );
  });
  it("loose −25% ranged taken, weaker in melee", () => {
    expect(f("loose", { ranged: true }, { type: "ARCHERS" })).toBeLessThan(f("line", { ranged: true }, { type: "ARCHERS" }));
    expect(f("loose")).toBeGreaterThan(base);
  });
  it("wedge boosts charge, weak flanks", () => {
    expect(hit({ type: "HEAVY_CAVALRY", formation: "wedge" }, {}, { charge: true })).toBeGreaterThan(hit({ type: "HEAVY_CAVALRY", formation: "line" }, {}, { charge: true }));
    expect(f("wedge", { flank: "rear" })).toBeGreaterThan(f("line", { flank: "rear" }));
  });
  it("square: +20 % defence from every side, no hidden charge halving", () => {
    const sq = hit({ type: "HEAVY_CAVALRY" }, { formation: "square" }, { charge: true }), none = hit({ type: "HEAVY_CAVALRY" }, { formation: "wedge" }, { charge: true });
    expect(sq).toBeLessThan(none); expect(sq).toBeGreaterThan(none * 0.6);
  });
  it("skirmish +15% ranged, −20% melee defense", () => {
    expect(hit({ type: "ARCHERS", formation: "skirmish" }, {}, { ranged: true })).toBeGreaterThan(hit({ type: "ARCHERS", formation: "line" }, {}, { ranged: true }) - 1);
    expect(f("skirmish")).toBeGreaterThan(base);
  });
  it("movement modifiers", () => {
    expect(moveRange(u("a", "attacker", 0, 0, { type: "SPEARMEN", formation: "shieldwall" }))).toBe(1);
    expect(moveRange(u("a", "attacker", 0, 0, { type: "SLINGERS", formation: "skirmish" }))).toBe(4);
    expect(moveRange(u("a", "attacker", 0, 0, { type: "LIGHT_CAVALRY" }), () => "forest")).toBe(3);
    expect(moveRange(u("a", "attacker", 0, 0, { fatigue: 85 }))).toBe(1);
    expect(moveRange(u("a", "attacker", 0, 0, { type: "LIGHT_CAVALRY", formation: "skirmish" }))).toBe(5);
  });
});

describe("matchups, flank, terrain", () => {
  it("spearmen ×1.5 vs cavalry", () => expect(hit({ type: "SPEARMEN" }, { type: "LIGHT_CAVALRY" })).toBeGreaterThan(hit({ type: "SPEARMEN" }, { type: "AXEMEN" })));
  it("axemen ×1.3 vs shieldwall", () => expect(hit({ type: "AXEMEN" }, { formation: "shieldwall" })).toBeGreaterThan(hit({ type: "SWORDSMEN" }, { formation: "shieldwall" })));
  // 21 melee × morale .85 × line 1.05 × 1.25 matchup × mitigation (1 − .08 − .025 − .05) = 19.8 → 20 (16 without the matchup)
  it("cavalry ×1.25 vs ranged", () => expect(hit({ type: "LIGHT_CAVALRY" }, { type: "ARCHERS" })).toBe(20));
  it("front < side < rear", () => {
    const fr = hit({}, {}, { flank: "front" }), sd = hit({}, {}, { flank: "side" }), rr = hit({}, {}, { flank: "rear" });
    expect(fr).toBeLessThan(sd); expect(sd).toBeLessThan(rr);
    expect(flankOf(u("t", "defender", 1, 0, { facing: "w" }), { x: 0, y: 0 })).toBe("front");
    expect(flankOf(u("t", "defender", 1, 0, { facing: "e" }), { x: 0, y: 0 })).toBe("rear");
    expect(flankOf(u("t", "defender", 1, 0, { facing: "n" }), { x: 0, y: 0 })).toBe("side");
  });
  it("mitigation floor 0.45", () => expect(hit({}, { type: "ELITE_GUARD" }, { fortified: true, holding: true, support: .15, terrainTarget: "hills" })).toBe(Math.round(23 * 0.85 * 1.05 * 0.45)));
  it("sub-biome mapping uses real values; unknown is plain", () => {
    expect(terrainOfSubBiome("dense_forest")).toBe("forest"); expect(terrainOfSubBiome("hillock")).toBe("hills");
    expect(terrainOfSubBiome("reed_marsh")).toBe("marsh"); expect(terrainOfSubBiome("open_water")).toBe("water");
    expect(terrainOfSubBiome("grassland")).toBe("plain"); expect(terrainOfSubBiome("whatever")).toBe("plain");
  });
  it("forest −20% ranged, hills defend and help archers, marsh slows cavalry attack", () => {
    expect(hit({ type: "ARCHERS" }, {}, { ranged: true, terrainTarget: "forest" })).toBeLessThan(hit({ type: "ARCHERS" }, {}, { ranged: true }));
    expect(hit({}, {}, { terrainTarget: "hills" })).toBeLessThan(hit({}, {}));
    expect(hit({ type: "ARCHERS" }, {}, { ranged: true, terrainAttacker: "hills" })).toBeGreaterThan(hit({ type: "ARCHERS" }, {}, { ranged: true }) - 1);
    expect(hit({ type: "LIGHT_CAVALRY" }, {}, { terrainAttacker: "marsh" })).toBeLessThan(hit({ type: "LIGHT_CAVALRY" }, {}));
  });
  it("orthogonal support only, max 15%, identical for loose", () => {
    const t = u("t", "defender", 5, 5);
    const ns = [u("n1", "defender", 6, 5), u("n2", "defender", 4, 5), u("n3", "defender", 5, 6), u("n4", "defender", 5, 4), u("d", "defender", 6, 6)];
    expect(supportDefense([t, ...ns], t)).toBeCloseTo(0.15);
    expect(supportDefense([t, ns[4]], t)).toBe(0);
    const l = u("t", "defender", 5, 5, { formation: "loose" }); expect(supportDefense([l, ns[0]], l)).toBeCloseTo(0.05);
  });
});

describe("rounds", () => {
  it("initiative alternates: odd attacker first, even defender first", () => {
    const us = [u("a", "attacker", 0, 0), u("d", "defender", 3, 0)];
    const os: FBOrder[] = [{ seq: 1, cmd: 1, key: "d", kind: "HOLD" }, { seq: 2, cmd: 2, key: "a", kind: "HOLD" }];
    expect(initiativeOrder(os, us, 1)[0].key).toBe("a"); expect(initiativeOrder(os, us, 2)[0].key).toBe("d");
  });
  it("attack misses when target moved away first (defender initiative)", () => {
    const r = resolveRound([u("a", "attacker", 2, 2), u("d", "defender", 3, 2)],
      [{ seq: 1, cmd: 1, key: "a", kind: "ATTACK", target: "d" }, { seq: 2, cmd: 2, key: "d", kind: "MOVE", to: { x: 5, y: 2 } }], field, plain, () => .5, 2);
    expect(r.events.find(e => e.key === "a")!.kind).toBe("attack_miss");
  });
  it("unit acts once; no order = hold (+defense, fatigue recovers)", () => {
    const r = resolveRound([u("a", "attacker", 2, 2, { fatigue: 20 }), u("d", "defender", 3, 2, { fatigue: 20 })],
      [{ seq: 1, cmd: 1, key: "a", kind: "ATTACK", target: "d" }, { seq: 2, cmd: 1, key: "a", kind: "ATTACK", target: "d" }], field, plain, () => .5, 1);
    expect(r.events.filter(e => e.key === "a").length).toBe(1);
    expect(r.units.find(x => x.key === "a")!.fatigue).toBe(30);
    expect(r.units.find(x => x.key === "d")!.fatigue).toBe(12);
  });
  it("ranged uses ranged stat and ammo; out of ammo cannot shoot", () => {
    const r = resolveRound([u("a", "attacker", 0, 2, { type: "ARCHERS", ammo: 1 }), u("d", "defender", 4, 2)],
      [{ seq: 1, cmd: 1, key: "a", kind: "ATTACK", target: "d" }], field, plain, () => .5, 1);
    expect(r.events[0].kind).toBe("shoot"); expect(r.units[0].ammo).toBe(0);
    const r2 = resolveRound(r.units, [{ seq: 1, cmd: 1, key: "a", kind: "ATTACK", target: "d" }], field, plain, () => .5, 2);
    expect(r2.events[0].text).toMatch(/munice/);
  });
  it("volley +30% and spends 2 ammo", () => {
    const mk = () => [u("a", "attacker", 0, 2, { type: "ARCHERS", ammo: 6 }), u("d", "defender", 4, 2)];
    const s = resolveRound(mk(), [{ seq: 1, cmd: 1, key: "a", kind: "ATTACK", target: "d" }], field, plain, () => .5, 1);
    const v = resolveRound(mk(), [{ seq: 1, cmd: 1, key: "a", kind: "VOLLEY", target: "d" }], field, plain, () => .5, 1);
    expect(v.events[0].lossesTarget!).toBeGreaterThan(s.events[0].lossesTarget!); expect(v.units[0].ammo).toBe(4);
  });
  it("charge moves cavalry next to target, prefers flank, +20 fatigue", () => {
    const r = resolveRound([u("c", "attacker", 0, 0, { type: "HEAVY_CAVALRY" }), u("d", "defender", 3, 1, { facing: "w" })],
      [{ seq: 1, cmd: 1, key: "c", kind: "CHARGE", target: "d" }], field, plain, () => .5, 1);
    const c = r.units.find(x => x.key === "c")!;
    expect(Math.abs(c.x! - 3) + Math.abs(c.y! - 1)).toBe(1); expect(c.fatigue).toBe(20); expect(r.events[0].kind).toBe("charge");
    expect(r.events[0].text).not.toMatch(/zepředu/);
  });
  it("rout below 25 morale, survivors kept; rout chain −4 per neighbour", () => {
    const r = resolveRound([u("a", "attacker", 2, 2, { type: "AXEMEN" }), u("d", "defender", 3, 2, { morale: 26, facing: "e" }), u("d2", "defender", 3, 3, { morale: 28 })],
      [{ seq: 1, cmd: 1, key: "a", kind: "ATTACK", target: "d" }], field, plain, () => .5, 1);
    const d = r.units.find(x => x.key === "d")!; expect(d.status).toBe("routed"); expect(d.men).toBeGreaterThan(0); expect(d.x).toBeNull();
    expect(r.units.find(x => x.key === "d2")!.morale).toBe(24);
  });
  it("elite guard takes 75% morale loss", () => {
    const a = resolveRound([u("a", "attacker", 2, 2), u("d", "defender", 3, 2, { facing: "e", type: "ELITE_GUARD" })], [{ seq: 1, cmd: 1, key: "a", kind: "ATTACK", target: "d" }], field, plain, () => .5, 1);
    expect(a.units.find(x => x.key === "d")!.morale).toBe(70 - Math.round(12 * 0.75));
  });
  it("fortify gives +25% defense for 2 rounds", () => {
    const r = resolveRound([u("e", "defender", 8, 2, { type: "ENGINEERS" }), u("a", "attacker", 0, 0)], [{ seq: 1, cmd: 1, key: "e", kind: "FORTIFY" }], field, plain, () => .5, 1);
    expect(r.meta.fortified!.length).toBe(5); expect(r.meta.fortified![0].until).toBe(2);
  });
  it("rally needs general and has 3-round cooldown", () => {
    const us = [u("g", "attacker", 2, 2, { morale: 50 }), u("n", "attacker", 3, 2, { morale: 50 }), u("d", "defender", 9, 2)];
    expect(orderProblem(us, field, "g", { kind: "RALLY" }, plain, { round: 1, meta: {} })).toMatch(/generálem/);
    const r = resolveRound(us, [{ seq: 1, cmd: 1, key: "g", kind: "RALLY" }], field, plain, () => .5, 1, { hasGeneral: { attacker: true } });
    expect(r.units.find(x => x.key === "n")!.morale).toBe(65); expect(r.meta.rallyReadyRound!.attacker).toBe(4);
    expect(orderProblem(r.units, field, "g", { kind: "RALLY" }, plain, { round: 2, meta: r.meta })).toMatch(/kole 4/);
  });
  it("move bounds and occupied cells", () => {
    const us = [u("a", "attacker", 2, 2), u("b", "attacker", 3, 2)];
    expect(orderProblem(us, field, "a", { kind: "MOVE", to: { x: 7, y: 2 } })).toMatch(/nejvýš 2/);
    expect(orderProblem(us, field, "a", { kind: "MOVE", to: { x: 2, y: 9 } })).toMatch(/mimo bojiště/);
    const r = resolveRound(us, [{ seq: 1, cmd: 1, key: "a", kind: "MOVE", to: { x: 3, y: 2 } }], field, plain, () => .5, 1);
    expect(r.events[0].kind).toBe("move_blocked");
  });
  it("side without ready units loses; routed/reserve do not count", () => {
    const r = resolveRound([u("a", "attacker", 2, 2), u("r", "defender", null, null, { status: "reserve" })], [], field, plain, () => .5, 1);
    expect(r.winner).toBe("attacker");
  });
  it("40-round limit compares effective strength with 15% margin", () => {
    expect(timeoutWinner([u("a", "attacker", 0, 0, { men: 200 }), u("d", "defender", 3, 0, { men: 180 })])).toBe("draw");
    expect(timeoutWinner([u("a", "attacker", 0, 0, { men: 200 }), u("d", "defender", 3, 0, { men: 150 })])).toBe("attacker");
    const r = resolveRound([u("a", "attacker", 0, 0), u("d", "defender", 9, 0)], [], field, plain, () => .5, MAX_ROUNDS);
    expect(r.winner).toBe("draw");
  });
  it("deterministic RNG by battle+round", () => {
    const a = seededRandom("b:3"), b = seededRandom("b:3"), c = seededRandom("b:4");
    const x = [a(), a()], y = [b(), b()]; expect(x).toEqual(y); expect(c()).not.toBe(x[0]);
  });
});

describe("command points and orders", () => {
  it("4 CP base, 4–7 by skill quartile", () => { expect(commandPoints(null)).toBe(4); expect(commandPoints(40)).toBe(5); expect(commandPoints(56)).toBe(6); expect(commandPoints(80)).toBe(7); expect(commandPoints(100)).toBe(7); });
  it("a group order costs 1 CP", () => {
    const us = [u("a", "attacker", 0, 0), u("b", "attacker", 0, 1), u("d", "defender", 9, 0)];
    expect(cpUsed([{ seq: 1, cmd: 1, key: "a", kind: "HOLD" }, { seq: 2, cmd: 1, key: "b", kind: "HOLD" }], us, "attacker")).toBe(1);
    expect(cpUsed([{ seq: 1, cmd: 1, key: "a", kind: "HOLD" }, { seq: 2, cmd: 2, key: "b", kind: "HOLD" }], us, "attacker")).toBe(2);
    expect(cpUsed([{ seq: 1, cmd: 1, key: "a", kind: "MOVE", to: { x: 1, y: 0 } }, { seq: 2, cmd: 1, key: "b", kind: "MOVE", to: { x: 1, y: 1 } }], us, "attacker")).toBe(1);
  });
  it("type-specific order validation", () => {
    const us = [u("a", "attacker", 0, 0), u("d", "defender", 1, 0)];
    expect(orderProblem(us, field, "a", { kind: "CHARGE", target: "d" })).toMatch(/jízda/);
    expect(orderProblem(us, field, "a", { kind: "VOLLEY", target: "d" })).toMatch(/střelci/);
    expect(orderProblem(us, field, "a", { kind: "FORTIFY" })).toMatch(/ženisté/);
  });
});

describe("deployment and reserves", () => {
  it("auto deploy: own squares, melee front, ranged behind, cavalry on wings, no shared cells", () => {
    const comp = [{ unit_type: "PROFESSIONAL", manpower: 2000 }, { unit_type: "ARCHERS", manpower: 1000 }, { unit_type: "LIGHT_CAVALRY", manpower: 600 }];
    const f = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    const us = autoDeploy(buildUnits("attacker", "a", 3600, comp, 70), "attacker", f, { x: 0, y: 0 }, { x: 1, y: 0 });
    expect(us.every(x => x.x! < 6)).toBe(true);
    expect(new Set(us.map(x => `${x.x},${x.y}`)).size).toBe(us.length);
    const avg = (t: UnitType) => { const l = us.filter(x => x.type === t); return l.reduce((s, x) => s + x.x!, 0) / l.length; };
    expect(avg("SWORDSMEN")).toBeGreaterThan(avg("ARCHERS"));
    const cav = us.filter(x => x.type === "LIGHT_CAVALRY"); expect(cav.every(x => x.y === 0 || x.y === 5)).toBe(true);
  });
  it("units that do not fit become reserve (not routed, not lost)", () => {
    const us = autoDeploy(buildUnits("attacker", "a", 8000, [{ unit_type: "MILITIA", manpower: 8000 }], 70), "attacker", [{ x: 0, y: 0 }, { x: 1, y: 0 }], { x: 0, y: 0 }, { x: 1, y: 0 });
    expect(us.filter(x => x.status === "reserve").length).toBe(4);
    const plan = settlementPlan(us, [{ id: "a", soldiers: 8000, power: 7600, morale: 70 }], [], UNIT_POWER_FACTOR);
    expect(plan.stackUpdates[0].soldiers).toBe(8000);
  });
  it("reserve can be called into a free own-zone cell", () => {
    const us = [u("r", "attacker", null, null, { status: "reserve" }), u("d", "defender", 9, 0)];
    const r = resolveRound(us, [{ seq: 1, cmd: 1, key: "r", kind: "RESERVE", to: { x: 1, y: 1 } }], field, plain, () => .5, 1, {}, () => (x: number) => x < 6);
    expect(r.units[0].status).toBe("ready"); expect(r.units[0].x).toBe(1);
  });
  it("old v0 rows load (INFANTRY, no fatigue)", () => {
    const v = upgradeUnit({ key: "k", side: "attacker", stackId: "s", type: "INFANTRY", men: 150, startMen: 200, morale: 60, x: 1, y: 1, facing: "e", status: "ready" });
    expect(v.type).toBe("SWORDSMEN"); expect(v.fatigue).toBe(0); expect(v.formation).toBe("line");
  });
});

describe("AI", () => {
  it("is deterministic and respects CP", () => {
    const us = [...buildUnits("attacker", "a", 2000, [{ unit_type: "PROFESSIONAL", manpower: 1200 }, { unit_type: "ARCHERS", manpower: 400 }, { unit_type: "LIGHT_CAVALRY", manpower: 400 }], 70)];
    const dep = autoDeploy(autoDeploy([...us, ...buildUnits("defender", "d", 2000, [{ unit_type: "MILITIA", manpower: 2000 }], 70)], "attacker", field, { x: 0, y: 0 }, { x: 1, y: 0 }), "defender", field, { x: 1, y: 0 }, { x: 0, y: 0 });
    const a = planAiOrders(dep, "defender", field, plain, 4), b = planAiOrders(dep, "defender", field, plain, 4);
    expect(a).toEqual(b); expect(new Set(a.map(o => o.cmd)).size).toBeLessThanOrEqual(4); expect(a.length).toBeGreaterThan(0);
  });
  it("cavalry targets archers; weak units hold", () => {
    const us = [u("c", "defender", 5, 2, { type: "LIGHT_CAVALRY" }), u("w", "defender", 5, 4, { men: 40 }), u("ar", "attacker", 3, 2, { type: "ARCHERS", ammo: 6 }), u("s", "attacker", 4, 4)];
    const os = planAiOrders(us, "defender", field, plain, 4);
    expect(os.find(o => o.key === "c")).toMatchObject({ kind: "CHARGE", target: "ar" });
    expect(os.find(o => o.key === "w")?.kind).not.toBe("ATTACK");
  });
});

describe("settlement", () => {
  it("losses hit the composition row of the units that died", () => {
    const us = buildUnits("attacker", "s", 600, [{ id: "inf", unit_type: "PROFESSIONAL", manpower: 400 }, { id: "arc", unit_type: "ARCHERS", manpower: 200 }], 70);
    const after = us.map(x => x.compId === "arc" ? { ...x, men: 50, status: "dead" as const } : x);
    const p = settlementPlan(after, [{ id: "s", soldiers: 600, power: 1000, morale: 70 }],
      [{ id: "inf", stack_id: "s", unit_type: "PROFESSIONAL", manpower: 400 }, { id: "arc", stack_id: "s", unit_type: "ARCHERS", manpower: 200 }], UNIT_POWER_FACTOR);
    expect(p.compUpdates).toEqual([{ id: "arc", manpower: 50 }]);
    expect(p.stackUpdates[0]).toMatchObject({ soldiers: 450, unit_count: 450, is_active: true, lost: 150 });
    expect(p.stackUpdates[0].lostByType).toEqual({ PROFESSIONAL: 0, ARCHERS: 150 });
  });
  it("routed survivors return; wiped stack becomes inactive", () => {
    const us = [u("a", "attacker", null, null, { stackId: "s", men: 120, status: "routed" })];
    expect(settlementPlan(us, [{ id: "s", soldiers: 200, power: 100, morale: 70 }], [], UNIT_POWER_FACTOR).stackUpdates[0].soldiers).toBe(120);
    const dead = [u("a", "attacker", null, null, { stackId: "s", men: 0, status: "dead" })];
    expect(settlementPlan(dead, [{ id: "s", soldiers: 200, power: 100, morale: 70 }], [], UNIT_POWER_FACTOR).stackUpdates[0].is_active).toBe(false);
  });
  it("finalization is idempotent: only unfinished battle at expected rev settles", () => {
    expect(canSettle({ status: "fighting", rev: 5 }, 5)).toBe(true);
    expect(canSettle({ status: "finished", rev: 6 }, 5)).toBe(false);
    expect(canSettle({ status: "fighting", rev: 6 }, 5)).toBe(false);
  });
});
