import { describe, it, expect } from "vitest";
import { battleInRange, maxBattlefieldSquares, validateBattlefield } from "../../supabase/functions/_shared/fieldBattle";
describe("field battle start", () => {
  it("enemy in reach on neighbouring square only", () => { expect(battleInRange({x:-6,y:1},{x:-7,y:2})).toBe(true); expect(battleInRange({x:-6,y:1},{x:-8,y:1})).toBe(false); });
  it("two 8000 armies allow 4 squares", () => expect(maxBattlefieldSquares(16000)).toBe(4));
  it("battlefield must contain both armies and be contiguous", () => {
    const a = {x:0,y:0}, d = {x:1,y:0};
    expect(validateBattlefield([a,d], a, d, 16000)).toBeNull();
    expect(validateBattlefield([a], a, d, 16000)).toMatch(/obou/);
    expect(validateBattlefield([a,d,{x:3,y:0}], a, d, 16000)).toMatch(/navazovat/);
    expect(validateBattlefield([a,d,{x:0,y:1},{x:1,y:1},{x:2,y:0}], a, d, 16000)).toMatch(/nejvýš 4/);
  });
});
import { buildUnits, autoDeploy, resolveRound, stackOutcome, type FBUnit } from "../../supabase/functions/_shared/fieldBattle";
const plain = () => "plain" as const;
const u = (key: string, side: "attacker" | "defender", x: number, y: number, extra: Partial<FBUnit> = {}): FBUnit =>
  ({ key, side, stackId: side, type: "INFANTRY", men: 200, startMen: 200, morale: 70, x, y, facing: side === "attacker" ? "e" : "w", status: "ready", ...extra });
const field = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
describe("tactical rounds", () => {
  it("8000 men become 40 units following composition", () => {
    const us = buildUnits("attacker", "s", 8000, [{ unit_type: "INFANTRY", manpower: 4000 }, { unit_type: "ARCHERS", manpower: 1600 }, { unit_type: "MILITIA", manpower: 2400 }], 70);
    expect(us.length).toBe(40); expect(us.filter(x => x.type === "ARCHERS").length).toBe(8);
  });
  it("auto deploy stays in own zone", () => {
    const us = autoDeploy(buildUnits("attacker", "a", 1000, [], 70), "attacker", field, { x: 0, y: 0 }, { x: 1, y: 0 });
    expect(us.every(x => x.x !== null && x.x! < 6)).toBe(true);
  });
  it("attack misses when target moved away first", () => {
    const r = resolveRound([u("a", "attacker", 2, 2), u("d", "defender", 3, 2)],
      [{ seq: 1, key: "d", kind: "move", to: { x: 5, y: 2 } }, { seq: 2, key: "a", kind: "attack", target: "d" }], field, plain, () => .5);
    // attacker acts first, so the defender is still adjacent and is hit
    expect(r.events[0].kind).toBe("attack");
    const r2 = resolveRound([u("a", "attacker", 2, 2), u("a2", "attacker", 0, 0), u("d", "defender", 3, 2)],
      [{ seq: 1, key: "a2", kind: "move", to: { x: 1, y: 0 } }, { seq: 2, key: "d", kind: "move", to: { x: 5, y: 2 } }, { seq: 3, key: "a", kind: "attack", target: "d" }], field, plain, () => .5);
    expect(r2.events.find(e => e.key === "a")!.kind).toBe("attack_miss");
  });
  it("rear attack hurts more than front", () => {
    const front = resolveRound([u("a", "attacker", 2, 2), u("d", "defender", 3, 2, { facing: "w" })], [{ seq: 1, key: "a", kind: "attack", target: "d" }], field, plain, () => .5);
    const rear = resolveRound([u("a", "attacker", 2, 2), u("d", "defender", 3, 2, { facing: "e" })], [{ seq: 1, key: "a", kind: "attack", target: "d" }], field, plain, () => .5);
    expect(rear.events[0].lossesTarget!).toBeGreaterThan(front.events[0].lossesTarget!);
    expect(rear.events[0].lossesSelf).toBe(0);
  });
  it("a unit acts once per round and dead men are lost", () => {
    const r = resolveRound([u("a", "attacker", 2, 2), u("d", "defender", 3, 2)],
      [{ seq: 1, key: "a", kind: "attack", target: "d" }, { seq: 2, key: "a", kind: "attack", target: "d" }], field, plain, () => .5);
    expect(r.events.length).toBe(1);
    const o = stackOutcome(r.units).get("defender")!; expect(o.lost).toBe(r.events[0].lossesTarget);
  });
});
