import { describe, it, expect } from "vitest";
import { liveToScenario, EDITOR_TO_DB, computeStackPower } from "@/lib/liveGameEditor";

describe("live game editor mapping", () => {
  it("shifts negative world grid to view and keeps origin", () => {
    const { scenario, origin } = liveToScenario("T", [{ grid_x: -7, grid_y: 1, biome_family: "sea" }, { grid_x: -5, grid_y: 2, biome_family: "tundra" }],
      [{ id: "c", name: "L", owner_player: "P", population_total: 900, grid_x: -7, grid_y: 1 }], [], []);
    expect(origin).toEqual({ x: -7, y: 1 });
    expect(scenario.width).toBe(3);
    expect(scenario.tiles[0].biome).toBe("water");
    expect(scenario.cities[0]).toMatchObject({ x: 0, y: 0, population: 900 });
  });
  it("stores water as sea", () => { expect(EDITOR_TO_DB.water).toBe("sea"); });
  it("power matches recruitment formula", () => { expect(computeStackPower([{ unit_type: "MILITIA", manpower: 1000 }], 100)).toBe(1200); });
});
