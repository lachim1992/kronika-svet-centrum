import { describe, expect, it } from "vitest";
import { KEEP_PARCELS, entryParcel, parcelDist, breachChance, executionOrder, initialWalls, microUnits, resolveSiegeTurn, siegeInRange, type SiegeOrder } from "../../supabase/functions/_shared/siege";

const walls = initialWalls("HAMLET");
describe("micro siege", () => {
  it("splits armies into 200-men units and starts only next to the city", () => {
    expect(microUnits("attacker", "a", 8000, 50)).toHaveLength(40);
    expect(microUnits("attacker", "a", 450, 50).map(u => u.men)).toEqual([200, 200, 50]);
    expect(siegeInRange({ x: -6, y: 2 }, { x: -7, y: 1 })).toBe(true);
    expect(siegeInRange({ x: -5, y: 1 }, { x: -7, y: 1 })).toBe(false);
  });
  it("attacker acts first, then issue order", () => {
    const o: SiegeOrder[] = [{ seq: 1, side: "defender", unitKey: "d:0", target: { kind: "unit", key: "a:0" } }, { seq: 2, side: "attacker", unitKey: "a:0", target: { kind: "wall", segment: 0 } }, { seq: 3, side: "defender", unitKey: "d:1", target: { kind: "unit", key: "a:0" } }];
    expect(executionOrder(o).map(x => x.seq)).toEqual([2, 1, 3]);
  });
  it("a unit killed earlier never acts, and each unit acts once", () => {
    const units = [...microUnits("attacker", "a", 10, 50), ...microUnits("defender", "d", 2000, 90)];
    const orders: SiegeOrder[] = [{ seq: 1, side: "attacker", unitKey: "a:0", target: { kind: "wall", segment: 0 } },
      ...Array.from({ length: 10 }, (_, i) => ({ seq: 2 + i, side: "defender" as const, unitKey: `d:${i}`, target: { kind: "unit" as const, key: "a:0" } })),
      { seq: 20, side: "attacker", unitKey: "a:0", target: { kind: "wall", segment: 1 } }];
    const r = resolveSiegeTurn({ seed: "s", wall: 1, walls, units, orders });
    expect(r.events.filter(e => e.unitKey === "a:0")).toHaveLength(1);
    expect(r.events.some(e => e.outcome === "dead_target")).toBe(true);
  });
  it("walls break by chance; strong walls and defenders lower it", () => {
    expect(breachChance(200, 50, 1, 0)).toBeCloseTo(0.25);
    expect(breachChance(200, 50, 4, 800)).toBeLessThan(0.05);
    const units = microUnits("attacker", "a", 8000, 50);
    const orders = units.map((u, i) => ({ seq: i + 1, side: "attacker" as const, unitKey: u.key, target: { kind: "wall" as const, segment: 0 } }));
    expect(resolveSiegeTurn({ seed: "x", wall: 1, walls, units, orders }).walls[0].breached).toBe(true);
  });
  it("defenders behind intact walls cannot be attacked; keep needs a breach and no defenders", () => {
    const units = [...microUnits("attacker", "a", 400, 50), ...microUnits("defender", "d", 100, 50)];
    const r = resolveSiegeTurn({ seed: "k", wall: 1, walls, units, orders: [{ seq: 1, side: "attacker", unitKey: "a:0", target: { kind: "unit", key: "d:0" } }, { seq: 2, side: "attacker", unitKey: "a:1", target: { kind: "keep" } }] });
    expect(r.events.map(e => e.outcome)).toEqual(["blocked", "blocked"]);
    const open = walls.map((w, i) => ({ ...w, breached: i === 0 }));
    const far = resolveSiegeTurn({ seed: "k", wall: 1, walls: open, units: microUnits("attacker", "a", 400, 50), orders: [{ seq: 1, side: "attacker", unitKey: "a:0", target: { kind: "keep" } }], positions: { "a:0": 0 } });
    expect(far.captured).toBe(false);
    const c = resolveSiegeTurn({ seed: "k", wall: 1, walls: open, units: microUnits("attacker", "a", 400, 50), orders: [{ seq: 1, side: "attacker", unitKey: "a:0", target: { kind: "keep" } }], positions: { "a:0": 8 } });
    expect(c.captured).toBe(true);
  });
  it("after a breach only squads sent through it enter the city", () => {
    const open = walls.map((w, i) => ({ ...w, breached: i === 0 }));
    const units = microUnits("attacker", "a", 2000, 50);
    const r = resolveSiegeTurn({ seed: "e", wall: 1, walls: open, units, orders: [{ seq: 1, side: "attacker", unitKey: "a:3", target: { kind: "wall", segment: 0 } }] });
    expect(Object.keys(r.positions)).toEqual(["a:3"]);
    expect(r.positions["a:3"]).toBe(entryParcel(0, open.length));
  });
  it("inside the city a squad advances one micro-square per turn", () => {
    const r = resolveSiegeTurn({ seed: "m", wall: 1, walls, units: microUnits("attacker", "a", 200, 50), orders: [{ seq: 1, side: "attacker", unitKey: "a:0", target: { kind: "move", parcel: 35 } }], positions: { "a:0": 0 } });
    expect(r.positions["a:0"]).toBe(7);
    expect(parcelDist(0, r.positions["a:0"])).toBe(1);
  });
  it("garrison starts on the main building and can only be hit from a neighbouring square", () => {
    const units = [...microUnits("attacker", "a", 200, 50), ...microUnits("defender", null, 200, 50, "garrison")];
    const open = walls.map(w => ({ ...w, breached: true }));
    const r = resolveSiegeTurn({ seed: "g", wall: 1, walls: open, units, orders: [{ seq: 1, side: "attacker", unitKey: "a:0", target: { kind: "unit", key: "garrison:0" } }], positions: { "a:0": 0 } });
    expect(KEEP_PARCELS).toContain(r.positions["garrison:0"]);
    expect(r.events[0].outcome).toBe("blocked");
  });
});
