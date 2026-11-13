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
  it("gold is rare and finite, only in mountains", () => {
    const m = scan("a", "mountains"); const gold = m.filter(d => d.kind === "gold");
    expect(gold.length).toBeLessThan(961 * 0.1);
    expect(gold.every(d => d.reserve! > 0 && !d.regenerates && !d.implemented && d.good === null)).toBe(true);
    expect(scan("a", "hills").some(d => d.kind === "gold")).toBe(false);
  });
  it("hint survey hides grade and reserve", () => {
    const f = surveyFindings(generateMacroDeposits("a", 1, 1, { biome_family: "hills" }), 1);
    expect(f.every(d => !("reserve" in d))).toBe(true);
  });
  it("claim cost rises with holdings", () => { expect(macroClaimCost(0)).toBe(25); expect(macroClaimCost(10)).toBe(35); });
});
