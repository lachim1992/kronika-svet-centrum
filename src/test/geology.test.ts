import { describe, it, expect } from "vitest";
import { generateMacroDeposits, surveyFindings, macroClaimCost } from "../../supabase/functions/_shared/geology";

const scan = (salt: string, biome: string) => { const all = []; for (let x = 0; x < 31; x++) for (let y = 0; y < 31; y++) all.push(...generateMacroDeposits(salt, x, y, { biome_family: biome })); return all; };
describe("geology", () => {
  it("is deterministic for the same salt", () => {
    expect(generateMacroDeposits("s1", 4, 7, { biome_family: "mountains" })).toEqual(generateMacroDeposits("s1", 4, 7, { biome_family: "mountains" }));
  });
  it("varies with the salt", () => { expect(JSON.stringify(scan("a", "mountains"))).not.toBe(JSON.stringify(scan("b", "mountains"))); });
  it("never puts gold or ore in sea or plains", () => {
    expect(scan("a", "sea")).toEqual([]);
    expect(scan("a", "plains").some(d => ["gold", "iron", "copper"].includes(d.kind))).toBe(false);
  });
  it("gold exists only at a world-ranked vein and is a finite implemented ore", () => {
    expect(scan("a", "mountains").some(d => d.kind === "gold")).toBe(false);
    expect(scan("a", "hills").some(d => d.kind === "gold")).toBe(false);
    const mountain = generateMacroDeposits("a", 4, 7, { biome_family: "mountains" }, new Set(["4,7"]));
    const gold = mountain.filter(d => d.kind === "gold");
    expect(gold).toHaveLength(1);
    expect(gold[0].reserve!).toBeGreaterThan(0);
    expect(gold[0].regenerates).toBe(false);
    expect(gold[0].implemented).toBe(true);
    expect(gold[0].good).toBe("gold_ore");
  });
  it("hint survey hides grade and reserve", () => {
    const f = surveyFindings(generateMacroDeposits("a", 1, 1, { biome_family: "hills" }), 1);
    expect(f.every(d => !("reserve" in d))).toBe(true);
  });
  it("claim cost rises with holdings", () => { expect(macroClaimCost(0)).toBe(25); expect(macroClaimCost(10)).toBe(35); });
});

import world from "./fixtures/jv72o7-macro-geology.json";
import { goldVeinCells, grapeClimate } from "../../supabase/functions/_shared/geology";
describe("geology on the real JV72O7 macro layout (961 tiles, 28 hills, 0 mountains)", () => {
  const hexes = (world as any[]).map(([x, y, biome_family, mean_height, temp_band, moisture_band]) => ({ x, y, biome_family, mean_height, temp_band, moisture_band }));
  const scanWorld = (salt: string) => { const veins = goldVeinCells(salt, hexes);
    return hexes.flatMap(h => generateMacroDeposits(salt, h.x, h.y, h, veins).map(d => ({ ...d, biome: h.biome_family }))); };
  it("fixture matches the live world", () => { expect(hexes).toHaveLength(961); expect(hexes.filter(h => h.biome_family === "hills")).toHaveLength(28); });
  it("every seed has rare gold, only in hills, never plains/forest/sea, and never mineable", () => {
    for (const salt of ["a", "b", "c", "d", "e"]) {
      const gold = scanWorld(salt).filter(d => d.kind === "gold");
      expect(gold.length).toBeGreaterThan(0);
      expect(gold.length / 28).toBeLessThanOrEqual(0.04); // ≤1 of 28 hills
      expect(gold.every(d => d.biome === "hills" && d.implemented && d.good === "gold_ore" && !d.regenerates)).toBe(true);
    }
  });
  it("wild grapes occur on some suitable plains/hills, not all", () => {
    for (const salt of ["a", "b", "c"]) {
      const all = scanWorld(salt); const grapes = all.filter(d => d.kind === "wild_grapes");
      const suitable = hexes.filter(h => /plains|hills/.test(h.biome_family) && grapeClimate(h)).length;
      expect(grapes.length).toBeGreaterThan(0);
      expect(grapes.length).toBeLessThan(suitable * 0.6);
      expect(grapes.every(d => d.biome === "plains" || d.biome === "hills")).toBe(true);
    }
  });
  it("cold or waterlogged land never gets vines", () => {
    expect(grapeClimate({ biome_family: "plains", mean_height: 30, temp_band: 1, moisture_band: 2 })).toBe(false);
    expect(grapeClimate({ biome_family: "plains", mean_height: 30, temp_band: 3, moisture_band: 3 })).toBe(false);
    expect(grapeClimate({ biome_family: "plains", mean_height: 30, temp_band: 3, moisture_band: 2 })).toBe(true);
  });
});
