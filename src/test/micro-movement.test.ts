import { describe, expect, it } from "vitest";
import { MAX_MEN_PER_MICRO, MOVE_BUDGET, microEntryCost, microFootprint, microOf, planMicroPath, tileOfMicro, validateMicroPath, type Micro, type MicroTerrain } from "../../supabase/functions/_shared/microMovement";
import { armyCampParcels } from "@/lib/tileParcels";

const flat = (sub = "grassland", extra: Partial<MicroTerrain> = {}) => () => ({ macroBiome: "plains", macroPassable: true, subBiome: sub, ...extra });
const line = (n: number): Micro[] => Array.from({ length: n + 1 }, (_, i) => ({ x: i, y: 0 }));

describe("micro-square army movement", () => {
  it("allows 10 road steps and no more", () => {
    const road = flat("grassland", { road: true });
    expect(validateMicroPath(line(10), road)).toMatchObject({ ok: true, steps: 10 });
    expect(validateMicroPath(line(11), road)).toMatchObject({ ok: false, reason: "over_budget" });
  });
  it("plains allow 6 steps, forest 5, mountains 3", () => {
    expect(validateMicroPath(line(6), flat("grassland")).ok).toBe(true);
    expect(validateMicroPath(line(7), flat("grassland")).ok).toBe(false);
    expect(validateMicroPath(line(5), flat("dense_forest")).ok).toBe(true);
    expect(validateMicroPath(line(6), flat("dense_forest")).ok).toBe(false);
    const mountain = () => ({ macroBiome: "mountains", macroPassable: true, subBiome: null });
    expect(validateMicroPath(line(3), mountain).ok).toBe(true);
    expect(validateMicroPath(line(4), mountain).ok).toBe(false);
  });
  it("water and river without bridge are impassable, a road (bridge) crosses the river", () => {
    expect(microEntryCost({ subBiome: "open_water", macroBiome: "plains" })).toBeNull();
    expect(microEntryCost({ subBiome: "river_channel", macroBiome: "plains" })).toBeNull();
    expect(microEntryCost({ subBiome: "river_channel", macroBiome: "plains", road: true })).toBe(10);
    expect(microEntryCost({ macroBiome: "sea" })).toBeNull();
    expect(microEntryCost(undefined)).toBeNull();
  });
  it("rejects diagonal jumps and teleports", () => {
    expect(validateMicroPath([{ x: 0, y: 0 }, { x: 1, y: 1 }], flat())).toMatchObject({ ok: false, reason: "not_adjacent" });
  });
  it("planner never exceeds the budget and stops short of an unreachable target", () => {
    const plan = planMicroPath({ x: 0, y: 0 }, { x: 20, y: 0 }, flat());
    expect(plan.reachedTarget).toBe(false);
    expect(plan.spent).toBeLessThanOrEqual(MOVE_BUDGET);
    expect(plan.path.length - 1).toBe(6);
    expect(validateMicroPath(plan.path, flat()).ok).toBe(true);
  });
  it("planner prefers a road detour over open fields", () => {
    const terrain = (m: Micro) => ({ macroBiome: "plains", macroPassable: true, subBiome: "grassland", road: m.y === 1 || (m.y === 0 && (m.x === 0 || m.x === 8)) });
    const plan = planMicroPath({ x: 0, y: 0 }, { x: 8, y: 0 }, terrain);
    expect(plan.reachedTarget).toBe(true);
    expect(plan.spent).toBe(100);
  });
  it("max 200 men per micro square; bigger armies spread but stay within one tile", () => {
    expect(MAX_MEN_PER_MICRO).toBe(200);
    expect(microFootprint(200)).toBe(1);
    expect(microFootprint(201)).toBe(2);
    expect(microFootprint(1600)).toBe(8);
    expect(microFootprint(100000)).toBe(36);
    const camp = armyCampParcels(35, microFootprint(1600));
    expect(camp).toHaveLength(8);
    expect(new Set(camp).size).toBe(8);
    expect(camp.every(i => i >= 0 && i < 36)).toBe(true);
  });
  it("global micro coordinates round-trip, including negative tiles", () => {
    for (const [gx, gy, pi] of [[0, 0, 0], [-3, 1, 29], [6, -1, 5]]) {
      expect(tileOfMicro(microOf(gx, gy, pi))).toEqual({ gridX: gx, gridY: gy, parcelIndex: pi });
    }
  });
});
