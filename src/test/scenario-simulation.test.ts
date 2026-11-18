import { describe, expect, it } from "vitest";
import { createEmptyScenario, createStarterScenario } from "../lib/scenarioSandbox";
import { simulateBattle, simulateExtraction } from "../../supabase/functions/scenario-simulate/simulate";

describe("isolated scenario battle", () => {
  it("uses the canonical resolver deterministically without mutating the scenario", () => {
    const scenario = createStarterScenario();
    const before = JSON.stringify(scenario);
    const first = simulateBattle(scenario, "army-west");
    const second = simulateBattle(scenario, "army-west");
    expect(first).toEqual(second);
    expect(first.totalMen).toBe(2000);
    expect(first.rounds).toBeGreaterThan(0);
    expect(first.rounds).toBeLessThanOrEqual(40);
    expect(first.armies.reduce((sum, army) => sum + army.before, 0)).toBe(2000);
    expect(first.armies.every(army => army.survivors + army.losses === army.before)).toBe(true);
    expect(JSON.stringify(scenario)).toBe(before);
  });

  it("refuses to invent an enemy outside battle reach", () => {
    const scenario = createStarterScenario();
    scenario.armies[1].x = 8;
    scenario.armies[1].y = 8;
    expect(() => simulateBattle(scenario, "army-west")).toThrow(/V dosahu/);
  });
});

describe("isolated physical extraction", () => {
  it("reports the starter farm as local physical capacity", () => {
    const result = simulateExtraction(createStarterScenario());
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].reason).toBeNull();
    expect(result.rows[0].transport).toBe("local");
    expect(result.rows[0].capacityPerTurn).toBeGreaterThan(0);
  });

  it("completed roads raise adjacent freight from footpath to full capacity", () => {
    const scenario = createEmptyScenario(6, 6);
    scenario.cities = [{ id: "city", name: "Mlýn", owner: "Hráč", population: 1000, x: 0, y: 0 }];
    scenario.sites = [{ id: "farm", cityId: "city", owner: "Hráč", recipe: "harvest_wheat", level: 1, x: 1, y: 0, mx: 0, my: 0 }];
    const footpath = simulateExtraction(scenario).rows[0];
    scenario.roads = [{ id: "road", owner: "Hráč", level: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } }];
    const road = simulateExtraction(scenario).rows[0];
    expect(footpath.transport).toBe("footpath");
    expect(road.transport).toBe("road");
    expect(road.capacityPerTurn).toBeCloseTo(footpath.capacityPerTurn * 4, 5);
  });

  it("two mines share one finite macro reserve instead of cloning it", () => {
    const scenario = createEmptyScenario(6, 6);
    scenario.cities = [{ id: "city", name: "Hornice", owner: "Hráč", population: 1000, x: 0, y: 0 }];
    scenario.resources = [
      { id: "iron-a", kind: "iron", amount: 1, x: 0, y: 0, mx: 0, my: 0 },
      { id: "iron-b", kind: "iron", amount: 1, x: 0, y: 0, mx: 1, my: 0 },
    ];
    scenario.sites = [
      { id: "mine-a", cityId: "city", owner: "Hráč", recipe: "mine_iron", level: 1, x: 0, y: 0, mx: 0, my: 0 },
      { id: "mine-b", cityId: "city", owner: "Hráč", recipe: "mine_iron", level: 1, x: 0, y: 0, mx: 1, my: 0 },
    ];
    const result = simulateExtraction(scenario);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.reduce((sum, row) => sum + row.capacityUnits, 0)).toBeLessThanOrEqual(1);
  });
});
