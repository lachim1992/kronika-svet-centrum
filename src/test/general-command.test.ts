import { describe, expect, it } from "vitest";
import { generalArmyCapacity, generalCommandPoints, generalMoraleLossReduction, generalRallyStrength } from "../../supabase/functions/_shared/generalCommand";
import { computeStackPower } from "../../supabase/functions/_shared/unitTypes";
import { buildUnits, qualityCombatMultiplier, resolveRound, upgradeUnit, type FBUnit } from "../../supabase/functions/_shared/fieldBattle";

const unit = (key: string, side: "attacker" | "defender", x: number | null, y: number | null, extra: Record<string, unknown> = {}) => upgradeUnit({
  key, side, stackId: side, type: "SWORDSMEN", men: 200, startMen: 200, morale: 70, fatigue: 0, ammo: 0,
  quality: 1, x, y, facing: side === "attacker" ? "e" : "w", status: "ready", ...extra,
}) as FBUnit;

describe("canonical general command on the 0–100 skill scale", () => {
  it("uses exact CP examples and clamps outliers", () => {
    expect(generalCommandPoints(null)).toBe(2);
    expect(generalCommandPoints(40)).toBe(5);
    expect(generalCommandPoints(56)).toBe(6);
    expect(generalCommandPoints(63)).toBe(7);
    expect(generalCommandPoints(100)).toBe(10);
    expect(generalCommandPoints(1000)).toBe(10);
    expect(generalCommandPoints(-10)).toBe(2);
  });
  it("uses per-stack capacity, not a realm mobilization pool", () => {
    expect(generalArmyCapacity(null)).toBe(2000);
    expect(generalArmyCapacity(56)).toBe(7600);
    expect(generalArmyCapacity(63)).toBe(8300);
    expect(generalArmyCapacity(100)).toBe(12000);
    expect(generalArmyCapacity(1000)).toBe(12000);
  });
  it("caps morale resistance at 25% and Rally at 20", () => {
    expect(generalMoraleLossReduction(null)).toBe(0);
    expect(generalMoraleLossReduction(40)).toBeCloseTo(0.10);
    expect(generalMoraleLossReduction(100)).toBeCloseTo(0.25);
    expect(generalRallyStrength(0)).toBe(15);
    expect(generalRallyStrength(40)).toBe(17);
    expect(generalRallyStrength(100)).toBe(20);
  });
  it("does not turn general skill into strategic power", () => {
    const composition = [{ unit_type: "PROFESSIONAL", manpower: 1000 }];
    const withoutGeneral = computeStackPower(composition, 70);
    const withGeneral = (computeStackPower as unknown as (...args: unknown[]) => number)(composition, 70, 100);
    expect(withGeneral).toBe(withoutGeneral);
    expect(withoutGeneral).toBe(Math.round(2200 * 0.99));
  });
});

describe("quality and morale leadership in tactical combat", () => {
  it("maps stored quality 0/50/100 to 0.75/1/1.25 and snapshots it", () => {
    expect(qualityCombatMultiplier(0)).toBe(0.75);
    expect(qualityCombatMultiplier(50)).toBe(1);
    expect(qualityCombatMultiplier(100)).toBe(1.25);
    const units = buildUnits("attacker", "s", 600, [
      { id: "low", unit_type: "MILITIA", manpower: 200, quality: 0 },
      { id: "mid", unit_type: "MILITIA", manpower: 200, quality: 50 },
      { id: "high", unit_type: "MILITIA", manpower: 200, quality: 100 },
    ], 70);
    expect(units.map(u => u.quality)).toEqual([0.75, 1, 1.25]);
  });
  it("reduces morale loss by 25% at skill 100 without adding a permanent bonus", () => {
    const units = () => [unit("a", "attacker", 2, 2), unit("d", "defender", 3, 2, { facing: "e" })];
    const orders = [{ seq: 1, cmd: 1, key: "a", kind: "ATTACK" as const, target: "d" }];
    const plain = () => "plain" as const, field = [{ x: 0, y: 0 }];
    const ordinary = resolveRound(units(), orders, field, plain, () => 0.5, 1, {});
    const led = resolveRound(units(), orders, field, plain, () => 0.5, 1, { hasGeneral: { defender: true }, generalSkill: { defender: 100 } });
    expect(ordinary.units[1].morale).toBe(58);
    expect(led.units[1].morale).toBe(61);
  });
  it("Rally uses skill strength and keeps the existing cooldown", () => {
    const units = [unit("a", "attacker", 2, 2, { morale: 50 }), unit("d", "defender", 5, 5)];
    const result = resolveRound(units, [{ seq: 1, cmd: 1, key: "a", kind: "RALLY" }], [{ x: 0, y: 0 }], () => "plain", () => 0.5, 1,
      { hasGeneral: { attacker: true }, generalSkill: { attacker: 100 } });
    expect(result.units[0].morale).toBe(70);
    expect(result.meta.rallyReadyRound?.attacker).toBe(4);
  });
});
