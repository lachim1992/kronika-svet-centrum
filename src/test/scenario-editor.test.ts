import { describe, expect, it } from "vitest";
import {
  armyProblem, armySoldiers, cityProblem, createEmptyScenario, createStarterScenario, normalizeScenario,
  paintBiome, parseScenario, prospectProbability, roadProblem, scenarioDeposits, siteProblem, tileAt,
} from "../lib/scenarioSandbox";
import type { Deposit } from "../../supabase/functions/_shared/geology";

const ironDeposit: Deposit = { kind: "iron", good: "raw_ore", implemented: true, grade: 2, reserve: 200, regenerates: false };

describe("scenario editor model", () => {
  it("keeps the square macro map and exactly 36 micro cells on every tile", () => {
    const scenario = createEmptyScenario(8, 6);
    expect(scenario.tiles).toHaveLength(48);
    expect(scenario.tiles.every(tile => tile.micro.length === 36)).toBe(true);
    expect(scenario.width * scenario.height * 36).toBe(1728);
  });

  it("paints a macro biome with a brush and replaces its micro terrain atomically", () => {
    const scenario = paintBiome(createEmptyScenario(6, 6), 2, 2, "forest", 2);
    expect(tileAt(scenario, 2, 2)?.biome).toBe("forest");
    expect(tileAt(scenario, 3, 2)?.biome).toBe("forest");
    expect(tileAt(scenario, 2, 2)?.micro).toHaveLength(36);
    expect(tileAt(scenario, 2, 2)?.micro).toContain("dense_forest");
    expect(tileAt(scenario, 5, 5)?.biome).toBe("plains");
  });

  it("rejects cities and armies on water and duplicate armies", () => {
    let scenario = paintBiome(createEmptyScenario(), 1, 1, "water");
    expect(cityProblem(scenario, { x: 1, y: 1 })).toMatch(/vodě/);
    expect(armyProblem(scenario, { x: 1, y: 1 })).toMatch(/vodu/);
    scenario = createStarterScenario();
    expect(armyProblem(scenario, { x: 2, y: 2 })).toMatch(/už stojí/);
  });

  it("roads join cardinal neighbours exactly once", () => {
    const scenario = createEmptyScenario();
    expect(roadProblem(scenario, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
    expect(roadProblem(scenario, { x: 0, y: 0 }, { x: 1, y: 1 })).toMatch(/stranou/);
    const withRoad = { ...scenario, roads: [{ id: "r", owner: "Hráč", level: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } }] };
    expect(roadProblem(withRoad, { x: 1, y: 0 }, { x: 0, y: 0 })).toMatch(/existuje/);
  });

  it("uses canonical certain resources and macro-gated mineral probabilities", () => {
    const scenario = createEmptyScenario();
    const tile = { ...tileAt(scenario, 0, 0)!, micro: Array(36).fill("hillock") };
    const deposits = new Map([["0,0", [ironDeposit]]]);
    expect(prospectProbability(scenario, tile, 0, "stone", new Map())).toBe(1);
    expect(prospectProbability(scenario, tile, 0, "iron", new Map())).toBe(0);
    expect(prospectProbability(scenario, tile, 0, "iron", deposits)).toBe(0.35);
  });

  it("requires the same confirmed micro resource as the live rural-site gate", () => {
    const scenario = createStarterScenario();
    expect(siteProblem(scenario, { x: 2, y: 4, mx: 1, my: 1, recipe: "harvest_wheat", cityId: "city-west" })).toBeNull();
    expect(siteProblem(scenario, { x: 2, y: 4, mx: 1, my: 1, recipe: "mine_iron", cityId: "city-west" })).toMatch(/Nedostupné/);
  });

  it("round-trips valid JSON and rejects a broken micro grid", () => {
    const scenario = createStarterScenario();
    expect(normalizeScenario(JSON.parse(JSON.stringify(scenario)))).toEqual(scenario);
    expect(parseScenario(JSON.stringify(scenario)).name).toBe("Zkušební údolí");
    const broken = { ...scenario, tiles: scenario.tiles.map((tile, index) => index ? tile : { ...tile, micro: tile.micro.slice(0, 35) }) };
    expect(() => normalizeScenario(broken)).toThrow(/36/);
  });

  it("army manpower is derived from typed composition", () => {
    const scenario = createStarterScenario();
    expect(armySoldiers(scenario.armies[0])).toBe(1000);
    expect(scenarioDeposits(scenario).size).toBe(100);
  });
});
