import { describe, it, expect } from "vitest";
import {
  casualties, upgradeUnit, supportDefense, moveRange, reachableCells, orderProblem, resolveRound, buildUnits, autoDeploy, planBattleAi,
  attackUtility, applyFormation, cpUsed, terrainOfSubBiome, settlementPlan, seededRandom, AI_UTILITY_WEIGHTS, ROUT_MORALE, MIN_MOVE, UNIT_TYPES,
  FORMATIONS, type AiUtilityWeights, type FBUnit, type HitCtx, type Side, type FBOrder,
} from "../../supabase/functions/_shared/fieldBattle";
import { generalArmyCapacity, generalCommandPoints, generalMoraleLossReduction, generalRallyStrength } from "../../supabase/functions/_shared/generalCommand";

const plain = () => "plain" as const;
const field = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
const u = (key: string, side: Side, x: number | null, y: number | null, extra: Partial<FBUnit> = {}): FBUnit => upgradeUnit({
  key, side, stackId: side, compId: null, sourceType: null, type: "SWORDSMEN", formation: "wedge", men: 200, startMen: 200, morale: 70, fatigue: 0,
  ammo: 0, quality: 1, x, y, facing: side === "attacker" ? "e" : "w", status: "ready", ...extra });
const ctx = (o: Partial<HitCtx> = {}): HitCtx => ({ ranged: false, charge: false, volley: false, flank: "front", holding: false, fortified: false, variance: 1,
  terrainAttacker: "plain", terrainTarget: "plain", support: 0, attackMultiplier: 1000, ...o });
const hit = (a: Partial<FBUnit>, t: Partial<FBUnit>, c: Partial<HitCtx> = {}) => casualties(u("a", "attacker", 0, 0, a), u("t", "defender", 1, 0, { men: 1e9, ...t }), ctx(c));
const close = (v: number, e: number) => expect(Math.abs(v - e)).toBeLessThan(0.002);
// SWORDSMEN target mitigation without formation: 1 - 0.22 - 0.075
const M = 1 - 0.22 - 15 / 200;

describe("7 formations: exactly the approved base effects", () => {
  it("attack side", () => {
    close(hit({ formation: "line" }, {}) / hit({}, {}), 1.05);
    close(hit({ formation: "shieldwall" }, {}) / hit({}, {}), 0.9);
    close(hit({ formation: "deep" }, {}) / hit({}, {}), 1.15);
    close(hit({ type: "ARCHERS", formation: "skirmish" }, {}, { ranged: true }) / hit({ type: "ARCHERS" }, {}, { ranged: true }), 1.15);
    close(hit({ type: "HEAVY_CAVALRY", formation: "wedge" }, {}, { charge: true }) / hit({ type: "HEAVY_CAVALRY", formation: "loose" }, {}, { charge: true }), 1.35);
    close(hit({ formation: "square" }, {}) / hit({}, {}), 1); close(hit({ formation: "loose" }, {}) / hit({}, {}), 1);
  });
  it("defence side", () => {
    close(hit({}, { formation: "line" }) / hit({}, {}), (M - 0.05) / M);
    close(hit({}, { formation: "shieldwall" }) / hit({}, {}), (M - 0.25) / M);
    close(hit({}, { formation: "shieldwall" }, { flank: "side" }) / hit({}, {}, { flank: "side" }), 1); // no hidden flank penalty
    close(hit({}, { formation: "deep" }) / hit({}, {}), (M - 0.10) / M);
    close(hit({}, { formation: "square" }, { flank: "rear" }) / hit({}, {}, { flank: "rear" }), (M - 0.20) / M);
    close(hit({ type: "ARCHERS" }, { formation: "loose" }, { ranged: true }) / hit({ type: "ARCHERS" }, {}, { ranged: true }), 0.75);
    close(hit({}, { formation: "loose" }) / hit({}, {}), 1); close(hit({}, { type: "ARCHERS", formation: "skirmish" }) / hit({}, { type: "ARCHERS" }), 1);
  });
  it("compatibility is enforced server-side and snapshotted per unit", () => {
    const us = [u("s", "attacker", 0, 0, { type: "SPEARMEN" }), u("c", "attacker", 1, 0, { type: "LIGHT_CAVALRY" }), u("e", "defender", 9, 0)];
    const r = applyFormation(us, "attacker", ["s", "c", "e"], "shieldwall");
    expect(r.accepted).toEqual(["s"]); expect(r.rejected.map(x => x.key).sort()).toEqual(["c", "e"]);
    expect(r.units.find(x => x.key === "s")!.formation).toBe("shieldwall"); expect(r.units.find(x => x.key === "c")!.formation).toBe("wedge");
    expect(applyFormation(us, "attacker", ["c"], "skirmish").accepted).toEqual(["c"]);
    expect(applyFormation(us, "attacker", ["s"], "bogus").accepted).toEqual([]);
    expect(FORMATIONS.length).toBe(7);
  });
});

describe("geometry, support, rout, fatigue", () => {
  it("flank 1.25 and rear 1.5", () => { close(hit({}, {}, { flank: "side" }) / hit({}, {}), 1.25); close(hit({}, {}, { flank: "rear" }) / hit({}, {}), 1.5); });
  it("orthogonal support 5/10/15 % and never more; same for loose/skirmish", () => {
    for (const f of ["line", "loose", "skirmish"] as const) {
      const t = u("t", "defender", 5, 5, { formation: f, type: "ARCHERS" }), n = [u("1", "defender", 6, 5), u("2", "defender", 4, 5), u("3", "defender", 5, 6), u("4", "defender", 5, 4)];
      expect(supportDefense([t, n[0]], t)).toBeCloseTo(0.05); expect(supportDefense([t, n[0], n[1]], t)).toBeCloseTo(0.10);
      expect(supportDefense([t, ...n.slice(0, 3)], t)).toBeCloseTo(0.15); expect(supportDefense([t, ...n], t)).toBeCloseTo(0.15);
    }
  });
  it("morale below 25 routs without casualties from the rout itself", () => {
    expect(ROUT_MORALE).toBe(25);
    const t = u("t", "defender", 1, 0, { morale: 26, facing: "e" }), a = u("a", "attacker", 0, 0, { morale: 100 });
    const r = resolveRound([a, t], [{ seq: 1, cmd: 1, key: "a", kind: "ATTACK", target: "t" }], field, plain, () => .5, 1);
    const tt = r.units.find(x => x.key === "t")!; const lost = 200 - tt.men;
    expect(tt.status).toBe("routed"); expect(lost).toBeGreaterThan(0);
    expect(r.events.find(e => e.key === "a")!.lossesTarget).toBe(lost);
  });
  it("fatigue: move +8, attack +10, charge +20, hold recovers 8; reduces damage", () => {
    const r = resolveRound([u("m", "attacker", 0, 0), u("h", "attacker", 0, 3, { fatigue: 20 }), u("x", "defender", 10, 5)],
      [{ seq: 1, cmd: 1, key: "m", kind: "MOVE", to: { x: 1, y: 0 } }, { seq: 2, cmd: 2, key: "h", kind: "HOLD" }], field, plain, () => .5, 1);
    expect(r.units.find(v => v.key === "m")!.fatigue).toBe(8); expect(r.units.find(v => v.key === "h")!.fatigue).toBe(12);
    expect(hit({ fatigue: 50 }, {})).toBeLessThan(hit({}, {}));
  });
});

describe("movement and terrain", () => {
  it("uses the base move stat, min 1, never a flat 4", () => {
    expect(MIN_MOVE).toBe(1);
    expect(moveRange(u("a", "attacker", 0, 0, { formation: "line" }))).toBe(2);
    expect(moveRange(u("a", "attacker", 0, 0, { type: "LIGHT_CAVALRY", formation: "line" }))).toBe(4);
    expect(moveRange(u("a", "attacker", 0, 0, { type: "SPEARMEN", formation: "square", fatigue: 90 }))).toBe(1);
    expect(moveRange(u("a", "attacker", 0, 0, { type: "HEAVY_CAVALRY", formation: "line" }), () => "marsh")).toBe(2);
  });
  it("sub_biome is the only terrain source; unknown is plain; water blocks", () => {
    expect(terrainOfSubBiome("dense_forest")).toBe("forest"); expect(terrainOfSubBiome("hillock")).toBe("hills");
    expect(terrainOfSubBiome("reed_marsh")).toBe("marsh"); expect(terrainOfSubBiome("river_channel")).toBe("water");
    expect(terrainOfSubBiome("whatever")).toBe("plain"); expect(terrainOfSubBiome(null)).toBe("plain");
    const water = (x: number) => x === 1 ? "water" as const : "plain" as const;
    const a = u("a", "attacker", 0, 0, { type: "LIGHT_CAVALRY", formation: "line" });
    expect(reachableCells(a, [a], [{ x: 0, y: 0 }], water).has("1,0")).toBe(false);
    expect(orderProblem([a], [{ x: 0, y: 0 }], "a", { kind: "MOVE", to: { x: 1, y: 0 } }, water)).toMatch(/vody/);
    expect(hit({}, {}, { terrainTarget: "hills" })).toBeLessThan(hit({}, {}));
    expect(hit({ type: "ARCHERS" }, {}, { ranged: true, terrainTarget: "forest" })).toBeLessThan(hit({ type: "ARCHERS" }, {}, { ranged: true }));
  });
});

describe("general and command points", () => {
  it("4–7 CP at 40/56/63, capacity 2000+100/skill max 12000, morale −25 % max, rally 15–20", () => {
    expect([null, 0, 39, 40, 55, 56, 62, 63, 100].map(generalCommandPoints)).toEqual([4, 4, 4, 5, 5, 6, 6, 7, 7]);
    expect(generalArmyCapacity(null)).toBe(2000); expect(generalArmyCapacity(37)).toBe(5700); expect(generalArmyCapacity(100)).toBe(12000);
    expect(generalMoraleLossReduction(100)).toBe(0.25); expect(generalMoraleLossReduction(null)).toBe(0);
    expect(generalRallyStrength(0)).toBe(15); expect(generalRallyStrength(100)).toBe(20);
  });
  it("one group order = 1 CP regardless of size", () => {
    const us = [0, 1, 2, 3, 4].map(i => u(`a${i}`, "attacker", 0, i));
    const orders: FBOrder[] = us.map((x, i) => ({ seq: i + 1, cmd: 1, key: x.key, kind: "HOLD" }));
    expect(cpUsed(orders, us, "attacker")).toBe(1);
    expect(cpUsed([...orders, { seq: 9, cmd: 2, key: "a0", kind: "MOVE", to: { x: 1, y: 0 } }], us, "attacker")).toBe(2);
  });
  it("order legality for every kind", () => {
    const us = [u("sw", "attacker", 0, 0), u("ar", "attacker", 0, 2, { type: "ARCHERS", ammo: 1 }), u("en", "attacker", 0, 4, { type: "ENGINEERS" }),
      u("cv", "attacker", 0, 1, { type: "LIGHT_CAVALRY" }), u("rs", "attacker", null, null, { status: "reserve" }), u("foe", "defender", 1, 0)];
    expect(orderProblem(us, field, "sw", { kind: "CHARGE", target: "foe" })).toMatch(/jízda/);
    expect(orderProblem(us, field, "sw", { kind: "VOLLEY", target: "foe" })).toMatch(/střelci/);
    expect(orderProblem(us, field, "ar", { kind: "VOLLEY", target: "foe" })).toMatch(/munice/);
    expect(orderProblem(us, field, "sw", { kind: "FORTIFY" })).toMatch(/ženisté/);
    expect(orderProblem(us, field, "en", { kind: "FORTIFY" })).toBeNull();
    expect(orderProblem(us, field, "sw", { kind: "RALLY" }, plain, { meta: {} })).toMatch(/generálem/);
    expect(orderProblem(us, field, "sw", { kind: "RESERVE", to: { x: 0, y: 1 } })).toMatch(/záloze/);
    expect(orderProblem(us, field, "rs", { kind: "RESERVE", to: { x: 0, y: 3 } }, plain, { zone: () => true })).toBeNull();
    expect(orderProblem(us, field, "cv", { kind: "CHARGE", target: "foe" })).toBeNull();
    expect(orderProblem(us, field, "sw", { kind: "ATTACK", target: "foe" })).toBeNull();
  });
  it("a unit never acts twice in a round", () => {
    const us = [u("a", "attacker", 0, 0), u("t", "defender", 1, 0, { morale: 100 })];
    const r = resolveRound(us, [{ seq: 1, cmd: 1, key: "a", kind: "ATTACK", target: "t" }, { seq: 2, cmd: 2, key: "a", kind: "ATTACK", target: "t" }], field, plain, () => .5, 1);
    expect(r.events.filter(e => e.key === "a").length).toBe(1);
  });
});

describe("Battle AI v2 utility weights", () => {
  it("weights sum to 100 in the approved split", () => {
    expect(AI_UTILITY_WEIGHTS).toEqual({ enemyLosses: 28, moralePressure: 18, flankRear: 16, targetImportance: 12, cohesion: 10, terrain: 8, objective: 8 });
    expect(Object.values(AI_UTILITY_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("changing the weights changes the chosen target", () => {
    // Swordsman between a fresh frontal heavy unit and a battered archer on its flank-side.
    const me = u("me", "attacker", 3, 3, { facing: "e" });
    const strong = u("strong", "defender", 4, 3, { type: "AXEMEN", morale: 95, facing: "w" });
    const archer = u("arch", "defender", 3, 4, { type: "ARCHERS", men: 200, morale: 30, facing: "e", ammo: 6 });
    const units = [me, strong, archer];
    const pick = (w: AiUtilityWeights) => planBattleAi(units, "attacker", field, plain, 1, 1, 1, {}, undefined, w).orders[0]?.target;
    const lossOnly = { enemyLosses: 100, moralePressure: 0, flankRear: 0, targetImportance: 0, cohesion: 0, terrain: 0, objective: 0 };
    const importanceOnly = { enemyLosses: 0, moralePressure: 0, flankRear: 0, targetImportance: 100, cohesion: 0, terrain: 0, objective: 0 };
    expect(attackUtility(units, me, archer, "ATTACK", plain, importanceOnly).score).toBeGreaterThan(attackUtility(units, me, strong, "ATTACK", plain, importanceOnly).score);
    expect(pick(importanceOnly)).toBe("arch");
    const flankOnly = { ...lossOnly, enemyLosses: 0, flankRear: 100 };
    expect(attackUtility(units, me, archer, "ATTACK", plain, flankOnly).parts.flankRear).toBe(0.5);
    expect(pick(AI_UTILITY_WEIGHTS)).toBe("arch");
    // When only frontal losses matter and the archer is shielded, the AI prefers the bigger casualty number.
    const shielded = [me, strong, { ...archer, men: 20, startMen: 200, morale: 100 }];
    const zero = { enemyLosses: 0, moralePressure: 0, flankRear: 0, targetImportance: 0, cohesion: 0, terrain: 0, objective: 0 };
    expect(planBattleAi(shielded, "attacker", field, plain, 1, 1, 1, {}, undefined, zero).orders.some(o => o.kind === "ATTACK")).toBe(false);
  });
  it("never charges into frontal spearmen; prefers exposed archers", () => {
    const cav = u("cav", "attacker", 2, 2, { type: "HEAVY_CAVALRY", facing: "e" });
    const spear = u("sp", "defender", 4, 2, { type: "SPEARMEN", facing: "w" });
    const r1 = planBattleAi([cav, spear], "attacker", field, plain, 4, 1, 1, {});
    expect(r1.orders.some(o => o.kind === "CHARGE" && o.target === "sp")).toBe(false);
    const arch = u("ar", "defender", 2, 5, { type: "ARCHERS", ammo: 6, facing: "w" });
    const r2 = planBattleAi([cav, spear, arch], "attacker", field, plain, 4, 1, 1, {});
    expect(r2.orders.find(o => o.key === "cav")).toMatchObject({ kind: "CHARGE", target: "ar" });
    expect(r2.plan.explanation?.length).toBeGreaterThan(0);
  });
  it("AI-vs-AI is deterministic and conserves every man", () => {
    const run = () => {
      let units = [...buildUnits("attacker", "A", 1530, [{ id: "c1", unit_type: "SPEARMEN", manpower: 610 }, { id: "c2", unit_type: "ARCHERS", manpower: 520 }, { id: "c3", unit_type: "LIGHT_CAVALRY", manpower: 400 }], 70),
        ...buildUnits("defender", "D", 1401, [{ id: "d1", unit_type: "AXEMEN", manpower: 801 }, { id: "d2", unit_type: "SLINGERS", manpower: 600 }], 70)];
      units = autoDeploy(autoDeploy(units, "attacker", field, { x: 0, y: 0 }, { x: 1, y: 0 }), "defender", field, { x: 1, y: 0 }, { x: 0, y: 0 });
      let meta = {}; let winner = null; let round = 1;
      for (; round <= 40 && !winner; round++) {
        const a = planBattleAi(units, "attacker", field, plain, 5, 1, round, meta), d = planBattleAi(units, "defender", field, plain, 5, 1000, round, meta);
        const r = resolveRound(units, [...a.orders, ...d.orders], field, plain, seededRandom(`b:${round}`), round, meta); units = r.units; meta = r.meta; winner = r.winner;
      }
      return { units, winner };
    };
    const x = run(), y = run(); expect(x).toEqual(y);
    const plan = settlementPlan(x.units, [{ id: "A", soldiers: 1530, power: 1000, morale: 70 }, { id: "D", soldiers: 1401, power: 1000, morale: 70 }],
      [{ id: "c1", stack_id: "A", unit_type: "SPEARMEN", manpower: 610 }, { id: "c2", stack_id: "A", unit_type: "ARCHERS", manpower: 520 }, { id: "c3", stack_id: "A", unit_type: "LIGHT_CAVALRY", manpower: 400 },
       { id: "d1", stack_id: "D", unit_type: "AXEMEN", manpower: 801 }, { id: "d2", stack_id: "D", unit_type: "SLINGERS", manpower: 600 }], {});
    const alive = (s: string) => x.units.filter(v => v.stackId === s).reduce((a, v) => a + v.men, 0);
    expect(plan.stackUpdates.find(s => s.id === "A")!.soldiers).toBe(alive("A")); expect(plan.stackUpdates.find(s => s.id === "D")!.soldiers).toBe(alive("D"));
  });
  it("composition split keeps every man and type, ≤200 per unit, 11 types only", () => {
    const us = buildUnits("attacker", "S", 1001, [{ unit_type: "PROFESSIONAL", manpower: 401 }, { unit_type: "ENGINEERS", manpower: 600 }], 70);
    expect(us.every(v => v.men <= 200)).toBe(true); expect(us.reduce((a, v) => a + v.men, 0)).toBe(1001);
    expect(us.filter(v => v.type === "SWORDSMEN").reduce((a, v) => a + v.men, 0)).toBe(401);
    expect(UNIT_TYPES.length).toBe(11); expect(() => buildUnits("attacker", "S", 1000, [{ unit_type: "MILITIA", manpower: 999 }], 70)).toThrow();
  });
});
