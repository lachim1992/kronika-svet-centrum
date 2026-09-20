import { describe, it, expect } from "vitest";
import { buildCatalog, matchesQuery, BUILD_CATEGORY_ORDER, BUILD_CATEGORY_LABELS, levelCapacityScale, type TemplateRow, type RecipeRow } from "@/lib/buildCatalog";
import { RESIDENTIAL_DISTRICTS, PRODUCTION_DISTRICTS } from "@/lib/cityDistricts";
import { SUBNODE_DEFS } from "@/lib/buildCatalog";

const recipes: RecipeRow[] = [
  { recipe_key: "mill_grain", output_good_key: "flour", output_quantity: 2, labor_cost: 1, input_items: [{ key: "raw_grain", qty: 3 }], required_role: "processing" },
  { recipe_key: "bake_staples", output_good_key: "baked_staples", output_quantity: 2, labor_cost: 1, input_items: [{ key: "flour", qty: 2 }], required_role: "urban" },
  { recipe_key: "bake_refined", output_good_key: "baked_refined", output_quantity: 1, labor_cost: 2, input_items: [{ key: "flour", qty: 2 }, { key: "olive_oil", qty: 1 }], required_role: "urban" },
  { recipe_key: "prepare_feast", output_good_key: "feast_goods", output_quantity: 1, labor_cost: 3, input_items: [], required_role: "guild" },
];

const templates: TemplateRow[] = [
  { id: "t-mill", name: "Mlýn", category: "economic", cost_wealth: 15, build_turns: 2, max_level: 3, effects: { basket_outputs: { staple_food: 4 }, recipe_keys: ["mill_grain"], capability_tags: ["milling"] } },
  { id: "t-bakery", name: "Pekárna", category: "economic", cost_wealth: 15, build_turns: 2, max_level: 3, effects: { basket_outputs: { staple_food: 5 }, recipe_keys: ["bake_staples"] } },
  { id: "t-walls", name: "Hradby", category: "military", cost_wealth: 30, build_turns: 3, max_level: 3, effects: {} },
  { id: "t-temple", name: "Chrám", category: "cultural", cost_wealth: 20, build_turns: 2, max_level: 3, effects: { basket_outputs: { feast: 2 } } },
];

describe("build catalog", () => {
  const catalog = buildCatalog({ templates, recipes });

  it("covers every buildable template, district blueprint and subnode", () => {
    for (const t of templates) expect(catalog.some(i => i.kind === "building" && i.refId === t.id)).toBe(true);
    for (const d of [...RESIDENTIAL_DISTRICTS, ...PRODUCTION_DISTRICTS]) expect(catalog.some(i => i.kind === "district" && i.refId === d.key)).toBe(true);
    for (const key of Object.keys(SUBNODE_DEFS)) expect(catalog.some(i => i.kind === "subnode" && i.refId === key)).toBe(true);
    expect(catalog.length).toBe(templates.length + RESIDENTIAL_DISTRICTS.length + PRODUCTION_DISTRICTS.length + Object.keys(SUBNODE_DEFS).length);
  });

  it("puts every item in a known, labelled category", () => {
    for (const item of catalog) {
      expect(BUILD_CATEGORY_ORDER).toContain(item.category);
      expect(BUILD_CATEGORY_LABELS[item.category].label.length).toBeGreaterThan(0);
    }
  });

  it("classifies the production chain: source, processing, manufacture", () => {
    expect(catalog.find(i => i.name === "Mlýn")!.category).toBe("processing");
    expect(catalog.find(i => i.name === "Pekárna")!.category).toBe("manufacture");
    expect(catalog.find(i => i.name === "Hradby")!.category).toBe("military");
    expect(catalog.find(i => i.name === "Chrám")!.category).toBe("civic");
  });

  it("derives capacity and jobs from canonical level scaling", () => {
    const mill = catalog.find(i => i.name === "Mlýn")!;
    expect(mill.levels.map(l => l.capacity)).toEqual([4, 4 * levelCapacityScale(2), 4 * levelCapacityScale(3)]);
    // jobs = capacity × labor/qty (single recipe, one allocation) = 4 × 1/2
    expect(mill.levels[0].jobs).toBeCloseTo(2 * ECONOMY.workersPerLaborUnit, 6);
  });

  it("shows recipe unlocks per level as alternatives", () => {
    const bakery = catalog.find(i => i.name === "Pekárna")!;
    expect(bakery.levels[0].unlocks).toEqual(["bake_staples"]);
    expect(bakery.levels[1].unlocks).toEqual(["bake_refined"]);
    expect(bakery.recipes.map(r => r.key)).toEqual(["bake_staples", "bake_refined", "prepare_feast"]);
  });

  it("marks non-productive structures honestly instead of faking output", () => {
    const walls = catalog.find(i => i.name === "Hradby")!;
    expect(walls.productive).toBe(false);
    expect(walls.recipes).toHaveLength(0);
  });

  it("searches by produced and consumed goods, not only by name", () => {
    const mill = catalog.find(i => i.name === "Mlýn")!;
    expect(matchesQuery(mill, "mouka")).toBe(true);
    expect(matchesQuery(mill, "obilí")).toBe(true);
    expect(matchesQuery(mill, "klenoty")).toBe(false);
    const housing = catalog.find(i => i.kind === "district" && i.category === "housing")!;
    expect(housing.housing).toBeGreaterThan(0);
  });

  it("keeps geography prerequisites from the production contract", () => {
    const fishery = buildCatalog({ templates: [{ id: "t-fish", name: "Rybářství", category: "economic", max_level: 3, effects: { basket_outputs: { staple_food: 4 }, recipe_keys: ["catch_fish"] } }], recipes })[
      RESIDENTIAL_DISTRICTS.length + PRODUCTION_DISTRICTS.length
    ];
    expect(fishery.requirements).toContain("Řeka nebo pobřeží");
  });
});
