import { describe, expect, it } from "vitest";
import { auditGoodsFunctions, goodFunctionByKey, catalogDirectUse, GOOD_FUNCTIONS, TEXTILE_MATERIAL } from "../../supabase/functions/_shared/goodsFunction.ts";
import { auditProductionCatalog, GOODS, RECIPES, recipeByKey, goodReachability } from "../../supabase/functions/_shared/productionCatalog.ts";
import { PRODUCT_META, demandShares, textileMaterialFit } from "../../supabase/functions/_shared/productMarket.ts";

describe("goods function catalogue", () => {
  it("has no invariant violations and the production audit stays clean", () => {
    expect(auditGoodsFunctions()).toEqual([]);
    expect(auditProductionCatalog()).toEqual([]);
  });
  it("covers every catalogue good exactly once", () => {
    expect(GOOD_FUNCTIONS.length).toBe(GOODS.length);
    expect(new Set(GOODS.map(g => g.key)).size).toBe(GOODS.length);
    expect(new Set(RECIPES.map(r => r.key)).size).toBe(RECIPES.length);
  });
  it("industrial intermediates are never directly purchased and have no consumer profile", () => {
    for (const k of ["yarn", "hemp_yarn", "cotton_yarn", "wool_yarn", "flour", "iron_ingot", "raw_hemp", "food_wheat"]) {
      const f = goodFunctionByKey.get(k)!;
      expect(f.direct, k).toBe(false);
      expect(f.purchaser, k).toBe("none");
      expect(PRODUCT_META[k], k).toBeUndefined();
      expect(catalogDirectUse(k, true), k).toBe(false);
    }
  });
  it("a DB flag can restrict but never reopen basket purchase", () => {
    expect(catalogDirectUse("textile_wool", false)).toBe(false);
    expect(catalogDirectUse("textile_wool", undefined)).toBe(true);
    expect(catalogDirectUse("not_a_catalogue_good", true)).toBeNull();
  });
  it("organisation goods are profiled for their buyer, not households", () => {
    expect(goodFunctionByKey.get("lumber")!.purchaser).toBe("builder");
    expect(goodFunctionByKey.get("metalwork_tools")!.purchaser).toBe("industry");
    expect(goodFunctionByKey.get("arms_basic")!.purchaser).toBe("army");
    expect(goodFunctionByKey.get("scribed_documents")!.purchaser).toBe("state");
    expect(goodFunctionByKey.get("charcoal")!.uses).toContain("fuel");
  });
  it("every direct staple has an explicit nutrition group", () => {
    for (const f of GOOD_FUNCTIONS) if (f.direct && f.basket === "staple_food") expect(f.nutrition, f.key).toBeDefined();
  });
});

describe("textile material identity", () => {
  it("hemp, cotton and wool weave into their own cloth; legacy flax line unchanged", () => {
    expect(recipeByKey.get("spin_hemp")!.output).toBe("hemp_yarn");
    expect(recipeByKey.get("weave_hemp")!.output).toBe("textile_hemp");
    expect(recipeByKey.get("weave_cotton")!.output).toBe("textile_cotton");
    expect(recipeByKey.get("weave_wool")!.output).toBe("textile_wool");
    expect(recipeByKey.get("weave_basic")!.output).toBe("textile_basic");
    expect(recipeByKey.get("weave_basic")!.inputs.map(i => i.good)).toEqual(["yarn"]);
    expect(TEXTILE_MATERIAL.textile_basic).toBe("flax");
  });
  it("no plain cloth recipe changes fibre", () => {
    for (const r of RECIPES) {
      const out = TEXTILE_MATERIAL[r.output]; if (!out || out === "mixed_fine") continue;
      for (const i of r.inputs) if (TEXTILE_MATERIAL[i.good]) expect(TEXTILE_MATERIAL[i.good], r.key).toBe(out);
    }
  });
  it("all four cloths are reachable, direct basic_clothing goods", () => {
    const reach = new Map(goodReachability().map(e => [e.good, e.reachable]));
    for (const k of ["textile_basic", "textile_hemp", "textile_cotton", "textile_wool"]) {
      expect(reach.get(k), k).toBe(true);
      expect(goodFunctionByKey.get(k)!.basket).toBe("basic_clothing");
      expect(goodFunctionByKey.get(k)!.subbasket).toBe("garments");
    }
  });
  it("cloth shares split one basket need and sum to 1 (no extra need)", () => {
    const opt = (good: string) => ({ good, basket: "basic_clothing", referencePrice: 2, basketAveragePrice: 2, quality: 1, fame: 0, familiarity: 0, prevalence: 0.25, coastal: false, affordability: 1, substitutability: 1 });
    const shares = demandShares(["textile_basic", "textile_hemp", "textile_cotton", "textile_wool"].map(opt));
    expect(shares.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 9);
    expect(new Set(shares.map(s => s.subbasket))).toEqual(new Set(["garments"]));
  });
  it("migration converts outputs and keeps legacy rows", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync("supabase/migrations/20261122190000_textile_material_identity.sql", "utf8");
    expect(sql).not.toMatch(/\bDELETE\b|\bDROP\b/i);
    for (const k of ["hemp_yarn", "textile_hemp", "textile_cotton", "textile_wool", "weave_hemp"]) expect(sql).toContain(`'${k}'`);
  });
});

describe("bounded textile preferences",()=>{
  it("prefers wool in cold climate and cotton in hot climate without changing legacy",()=>{
    expect(textileMaterialFit("textile_wool",0.5,"cold")).toBeGreaterThan(textileMaterialFit("textile_cotton",0.5,"cold"));
    expect(textileMaterialFit("textile_cotton",0.5,"hot")).toBeGreaterThan(textileMaterialFit("textile_wool",0.5,"hot"));
    expect(textileMaterialFit("textile_basic",0.5,"cold")).toBe(1);
  });
  it("clothing shares remain normalized for both climates",()=>{
    const opt=(good:string,clothingClimate:"cold"|"hot")=>({good,basket:"basic_clothing",referencePrice:2,basketAveragePrice:2,
      quality:1,fame:0,familiarity:0,prevalence:0.25,coastal:false,affordability:0.5,substitutability:1,clothingClimate});
    for(const climate of ["cold","hot"] as const) {
      const shares=demandShares(["textile_wool","textile_cotton"].map(k=>opt(k,climate)));
      expect(shares.reduce((sum,x)=>sum+x.share,0)).toBeCloseTo(1,9);
    }
  });
});
