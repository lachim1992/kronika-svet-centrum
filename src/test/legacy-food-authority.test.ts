import { describe, expect, it } from "vitest";
import { isLegacyFoodResource, legacyFoodTradeProblem } from "../../supabase/functions/_shared/legacyFood";
import { rationPolicy } from "../../supabase/functions/_shared/rationPolicy";

 describe("legacy food is never a second physical inventory", () => {
  it("recognizes every historical manual food label", () => {
    for (const key of ["grain", "supplies", "food", "raw_grain", "flour", "baked_staples"]) {
      expect(isLegacyFoodResource(key)).toBe(true);
    }
    expect(isLegacyFoodResource("gold")).toBe(false);
    expect(isLegacyFoodResource("production")).toBe(false);
    expect(isLegacyFoodResource(null)).toBe(false);
  });

  it("rejects food on either side of a manual offer and preserves ledger-only trade", () => {
    expect(legacyFoodTradeProblem({ supplies: 10 }, { gold: 5 })).toMatch("fyzické zboží");
    expect(legacyFoodTradeProblem({ wealth: 10 }, { grain: 5 })).toMatch("fyzické zboží");
    expect(legacyFoodTradeProblem({ production: 10 }, { wealth: 5 })).toBeNull();
  });

  it("keeps the approved ration effects in one server-owned catalogue", () => {
    expect(rationPolicy("austerity")?.policy).toMatchObject({ grain_effect: 5, stability_effect: -8 });
    expect(rationPolicy("equal")?.policy).toMatchObject({ grain_effect: 0, stability_effect: 5 });
    expect(rationPolicy("free_grain")).toBeNull();
  });
});
