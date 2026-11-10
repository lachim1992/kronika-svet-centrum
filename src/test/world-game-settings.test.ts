import { describe, it, expect } from "vitest";
import { buildRiverNetwork, type RiverCell } from "../../supabase/functions/_shared/riverNetwork";
import { normalizeGameSettings, riverOptions, startingReserves, neutralMultiplier } from "../../supabase/functions/_shared/worldGameSettings";

// 30x30 island: sea border, highland in the middle.
const cells: RiverCell[] = [];
for (let x = 0; x < 30; x++) for (let y = 0; y < 30; y++) {
  const edge = Math.min(x, y, 29 - x, 29 - y);
  cells.push({ gridX: x, gridY: y, elevation: edge * 6, isWater: edge < 2 });
}
const count = (o: object) => buildRiverNetwork("seed", cells, o).cells.size;

describe("world creation settings", () => {
  it("rivers always form on land with highlands and reach water", () => {
    const r = buildRiverNetwork("seed", cells, riverOptions({}));
    expect(r.riverCount).toBeGreaterThanOrEqual(3);
    expect(r.cells.size).toBeGreaterThan(0);
  });
  it("more rivers / longer rivers produce more river cells", () => {
    expect(count(riverOptions({ riverAmount: "high" }))).toBeGreaterThan(count(riverOptions({ riverAmount: "low" })));
    expect(count(riverOptions({ riverLength: "high" }))).toBeGreaterThanOrEqual(count(riverOptions({ riverLength: "low" })));
  });
  it("defaults keep the old river behaviour", () => {
    expect(count(riverOptions({}))).toBe(buildRiverNetwork("seed", cells).cells.size);
  });
  it("starting wealth and neutral towns map to concrete values", () => {
    expect(startingReserves("normal")).toEqual({ gold: 100, grain: 20 });
    expect(startingReserves("high").gold).toBe(250);
    expect(startingReserves("low").gold).toBe(50);
    expect(neutralMultiplier("none")).toBe(0);
  });
  it("clamps opponents and starting cities", () => {
    const s = normalizeGameSettings({ aiOpponents: 20, startingCities: 9 });
    expect(s.aiOpponents).toBe(7);
    expect(s.startingCities).toBe(3);
  });
});
