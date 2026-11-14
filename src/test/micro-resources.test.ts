import { describe, expect, it } from "vitest";
import { MICRO_CHANCES, MICRO_RESOURCE_GOOD, MICRO_SURVEY_COST, certainMicroResources, surveyMicroSquare } from "../../supabase/functions/_shared/microResources";
import { SURVEY_COST } from "../../supabase/functions/_shared/geology";
import { CATALOG_GOODS } from "../../supabase/functions/_shared/productionCatalog";

describe("micro-square resources", () => {
  it("grain is always possible on arable flats; stone is certain in hills and mountains", () => {
    expect(certainMicroResources("fertile_flat")).toContain("grain");
    expect(certainMicroResources("grassland")).toContain("grain");
    expect(certainMicroResources("hillock")).toContain("stone");
    expect(certainMicroResources("grassland", "mountains")).toContain("stone");
    expect(certainMicroResources("dense_forest")).toContain("timber");
    expect(certainMicroResources("open_water")).toEqual([]);
  });
  it("micro survey costs one tenth of a full macro survey, rounded up", () => {
    expect(MICRO_SURVEY_COST).toBe(Math.ceil(SURVEY_COST[2] / 10));
  });
  it("gold or iron on a micro square only where the macro tile truly holds it", () => {
    const none = Array.from({ length: 200 }, (_, i) => surveyMicroSquare("salt", i, 3, "cliff_edge", "mountains", []))
      .flat().filter(f => f.kind === "gold" || f.kind === "iron");
    expect(none).toEqual([]);
    const gold = [{ kind: "gold", good: "gold_ore", implemented: true, grade: 2, reserve: 50, regenerates: false }] as any;
    const hits = Array.from({ length: 200 }, (_, i) => surveyMicroSquare("salt", i, 3, "cliff_edge", "mountains", gold))
      .filter(fs => fs.some(f => f.kind === "gold")).length;
    expect(hits).toBeGreaterThan(30);
    expect(hits).toBeLessThan(120);
  });
  it("is deterministic and never invents certain resources as rare", () => {
    const a = surveyMicroSquare("s", 10, 20, "terrace", "hills", []);
    expect(surveyMicroSquare("s", 10, 20, "terrace", "hills", [])).toEqual(a);
    expect(a.find(f => f.kind === "grain")?.certain).toBe(true);
  });
  it("every produced good exists in the goods catalogue", () => {
    const keys = new Set(CATALOG_GOODS.map((g: { key: string }) => g.key));
    for (const good of Object.values(MICRO_RESOURCE_GOOD)) if (good) expect(keys.has(good)).toBe(true);
    for (const table of Object.values(MICRO_CHANCES)) for (const p of Object.values(table)) expect(p).toBeGreaterThan(0), expect(p).toBeLessThanOrEqual(1);
  });
});
