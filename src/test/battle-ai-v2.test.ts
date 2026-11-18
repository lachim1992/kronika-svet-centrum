import { describe, expect, it } from "vitest";
import {
  assignTacticalRoles, autoDeploy, buildUnits, cpUsed, planBattleAi, resolveRound, seededRandom, selectBattleDoctrine,
  upgradeUnit, type BattleMeta, type FBUnit, type Side, type TerrainAt,
} from "../../supabase/functions/_shared/fieldBattle";

const field = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
const plain: TerrainAt = () => "plain";
const forest: TerrainAt = () => "forest";
const unit = (key: string, side: Side, type: string, x: number | null, y: number | null, extra: Record<string, unknown> = {}) => upgradeUnit({
  key, side, stackId: side, type, men: 200, startMen: 200, morale: 70, fatigue: 0, quality: 1, x, y,
  facing: side === "attacker" ? "e" : "w", status: x == null ? "reserve" : "ready", ...extra,
}) as FBUnit;
const army = (side: Side, specs: [string, string, number, number][], morale = 70) => specs.map(([key, type, x, y], i) => unit(`${side[0]}${i}${key}`, side, type, x, y, { morale }));
const enemy = () => army("defender", [["s", "SWORDSMEN", 9, 2], ["m", "MILITIA", 9, 3]]);
const doctrine = (own: FBUnit[], side: Side = "attacker", terrain: TerrainAt = plain, foes = enemy()) => selectBattleDoctrine([...own, ...foes], side, field, terrain).doctrine;

describe("Battle AI v2 doctrine selection", () => {
  it("selects hammer_anvil for balanced combined arms", () => {
    expect(doctrine(army("attacker", [["a", "SWORDSMEN", 1, 1], ["b", "SPEARMEN", 1, 2], ["c", "ARCHERS", 0, 3]]))).toBe("hammer_anvil");
  });
  it("selects defensive_line for a defender without a more specific advantage", () => {
    expect(doctrine(army("defender", [["a", "SWORDSMEN", 9, 1], ["b", "SPEARMEN", 9, 2]]), "defender", plain,
      army("attacker", [["a", "SWORDSMEN", 1, 1], ["b", "MILITIA", 1, 2]]))).toBe("defensive_line");
  });
  it("selects cavalry_flank with enough cavalry on open terrain", () => {
    expect(doctrine(army("attacker", [["a", "LIGHT_CAVALRY", 1, 0], ["b", "LIGHT_CAVALRY", 1, 1], ["c", "SWORDSMEN", 1, 2], ["d", "MILITIA", 1, 3]]))).toBe("cavalry_flank");
  });
  it("selects ranged_attrition only with ranged superiority and ammo", () => {
    const own = army("attacker", [["a", "ARCHERS", 0, 0], ["b", "ARCHERS", 0, 1], ["c", "ARCHERS", 0, 2], ["d", "ARCHERS", 0, 3], ["e", "MILITIA", 1, 4]]);
    const foes = army("defender", [["a", "ARCHERS", 9, 0], ["b", "MILITIA", 9, 1], ["c", "MILITIA", 9, 2], ["d", "MILITIA", 9, 3]]);
    expect(doctrine(own, "attacker", plain, foes)).toBe("ranged_attrition");
  });
  it("selects forest_ambush for a mobile force actually in forest", () => {
    expect(doctrine(army("attacker", [["a", "SLINGERS", 1, 0], ["b", "JAVELINERS", 1, 1], ["c", "MILITIA", 1, 2]]), "attacker", forest)).toBe("forest_ambush");
  });
  it("selects center_breakthrough for superior shock infantry", () => {
    const own = army("attacker", [["a", "AXEMEN", 1, 0], ["b", "AXEMEN", 1, 1], ["c", "SWORDSMEN", 1, 2], ["d", "ELITE_GUARD", 1, 3]]);
    expect(doctrine(own)).toBe("center_breakthrough");
  });
  it("selects elastic_defense for low morale and adapts when morale recovers", () => {
    const own = army("attacker", [["a", "SWORDSMEN", 1, 1], ["b", "SPEARMEN", 1, 2]], 30);
    expect(doctrine(own)).toBe("elastic_defense");
    expect(doctrine(own.map(u => ({ ...u, morale: 75 })))).toBe("hammer_anvil");
  });
});

describe("Battle AI v2 tactics and command accounting", () => {
  it("assigns center, wings, ranged support and reserve deterministically", () => {
    const roles = assignTacticalRoles([...army("attacker", [["a", "SWORDSMEN", 1, 1], ["b", "ARCHERS", 0, 1], ["c", "LIGHT_CAVALRY", 1, 0]]), unit("r", "attacker", "MILITIA", null, null)], "attacker");
    expect(Object.values(roles)).toContain("center");
    expect(Object.values(roles)).toContain("ranged_support");
    expect(Object.values(roles)).toContain("left_wing");
    expect(Object.values(roles)).toContain("reserve");
  });
  it("uses spearmen against cavalry that threatens own ranged units", () => {
    const own = [unit("spear", "attacker", "SPEARMEN", 2, 2), unit("bow", "attacker", "ARCHERS", 2, 3)];
    const foes = [unit("cav", "defender", "LIGHT_CAVALRY", 3, 2)];
    const { orders } = planBattleAi([...own, ...foes], "attacker", field, plain, 3);
    expect(orders.find(o => o.key === "spear")).toMatchObject({ kind: "ATTACK", target: "cav" });
  });
  it("prioritizes an exposed ranged target for a legal cavalry flank", () => {
    const own = [unit("cav", "attacker", "LIGHT_CAVALRY", 1, 1), unit("cav2", "attacker", "LIGHT_CAVALRY", 1, 0)];
    const foes = [unit("bow", "defender", "ARCHERS", 4, 1), unit("guard", "defender", "SWORDSMEN", 8, 5)];
    const { orders, plan } = planBattleAi([...own, ...foes], "attacker", field, plain, 3);
    expect(orders.find(o => o.key === "cav")).toMatchObject({ kind: "CHARGE", target: "bow" });
    expect(plan.doctrine).toBe("cavalry_flank");
  });
  it("groups two ranged units on one target into one CP command", () => {
    const own = [unit("a", "attacker", "ARCHERS", 1, 1), unit("b", "attacker", "ARCHERS", 1, 2)];
    const foes = [unit("target", "defender", "MILITIA", 4, 1)];
    const units = [...own, ...foes];
    const { orders } = planBattleAi(units, "attacker", field, plain, 1);
    expect(orders.filter(o => o.target === "target")).toHaveLength(2);
    expect(cpUsed(orders, units, "attacker")).toBe(1);
  });
  it("calls reserves when the ranged line is threatened", () => {
    const own = [unit("bow", "attacker", "ARCHERS", 2, 2), unit("res", "attacker", "SWORDSMEN", null, null)];
    const foes = [unit("cav", "defender", "LIGHT_CAVALRY", 4, 2)];
    const { orders, plan } = planBattleAi([...own, ...foes], "attacker", field, plain, 2, 1, 2, {}, () => (x: number) => x < 6);
    expect(orders.some(o => o.key === "res" && o.kind === "RESERVE")).toBe(true);
    expect(plan.reserveCalled).toBe(true);
  });
  it("uses Rally at skill-scaled availability and never exceeds CP", () => {
    const own = [unit("a", "attacker", "SWORDSMEN", 2, 2, { morale: 35 }), unit("b", "attacker", "SPEARMEN", 2, 3, { morale: 40 })];
    const meta: BattleMeta = { hasGeneral: { attacker: true }, generalSkill: { attacker: 100 } };
    const units = [...own, ...enemy()];
    const { orders, plan } = planBattleAi(units, "attacker", field, plain, 2, 1, 1, meta);
    expect(orders.some(o => o.kind === "RALLY")).toBe(true);
    expect(cpUsed(orders, units, "attacker")).toBeLessThanOrEqual(2);
    expect(plan.version).toBe(2);
  });
  it("is deterministic for identical state and seed-relevant inputs", () => {
    const units = [...army("attacker", [["a", "SWORDSMEN", 1, 1], ["b", "ARCHERS", 0, 1], ["c", "LIGHT_CAVALRY", 1, 0]]), ...enemy()];
    expect(planBattleAi(units, "attacker", field, plain, 4, 1, 3, {})).toEqual(planBattleAi(units, "attacker", field, plain, 4, 1, 3, {}));
  });
});

describe("AI-vs-AI deterministic scenario harness", () => {
  it("runs representative combined-arms rounds without illegal CP budgets", () => {
    const run = () => {
      let units = [
        ...buildUnits("attacker", "a", 1200, [{ id: "as", unit_type: "SWORDSMEN", manpower: 600, quality: 60 }, { id: "aa", unit_type: "ARCHERS", manpower: 400, quality: 50 }, { id: "ac", unit_type: "LIGHT_CAVALRY", manpower: 200, quality: 50 }], 70),
        ...buildUnits("defender", "d", 1200, [{ id: "ds", unit_type: "SPEARMEN", manpower: 800, quality: 50 }, { id: "da", unit_type: "ARCHERS", manpower: 400, quality: 40 }], 65),
      ];
      units = autoDeploy(units, "attacker", field, { x: 0, y: 0 }, { x: 1, y: 0 }, plain);
      units = autoDeploy(units, "defender", field, { x: 1, y: 0 }, { x: 0, y: 0 }, plain);
      let meta: BattleMeta = {};
      for (let round = 1; round <= 8; round++) {
        const a = planBattleAi(units, "attacker", field, plain, 6, 1, round, meta, () => (x: number) => x < 6);
        const d = planBattleAi(units, "defender", field, plain, 6, 1000, round, meta, () => (x: number) => x >= 6);
        const orders = [...a.orders, ...d.orders];
        expect(cpUsed(orders, units, "attacker")).toBeLessThanOrEqual(6);
        expect(cpUsed(orders, units, "defender")).toBeLessThanOrEqual(6);
        const result = resolveRound(units, orders, field, plain, seededRandom(`ai-v2:${round}`), round, meta);
        units = result.units; meta = result.meta;
        if (result.winner) break;
      }
      return { units, meta };
    };
    expect(run()).toEqual(run());
  });
});
