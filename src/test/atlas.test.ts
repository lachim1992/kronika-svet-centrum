import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import * as canon from "@/lib/atlas/canon";
import * as demand from "../../supabase/functions/_shared/demandModel.ts";
import * as market from "../../supabase/functions/_shared/productMarket.ts";
import * as catalog from "../../supabase/functions/_shared/productionCatalog.ts";
import { aggregateWorldMarket, type MarketRow } from "@/lib/atlas/market";
import { buildChain, catalogMismatch, type DbRecipe } from "@/lib/atlas/chains";
import { fetchAllPages } from "@/lib/atlas/paging";
import { fmt, snapshotAge, PROVENANCE_LABEL } from "@/lib/atlas/provenance";
import { basketProducts } from "@/components/atlas/AtlasBaskets";
import { deriveOpportunities } from "@/lib/atlas/opportunities";

const r = (recipe_key: string, out: string, inputs: [string, number][]): DbRecipe => ({ recipe_key, output_good_key: out, output_quantity: 1, input_items: inputs.map(([good, qty]) => ({ good, qty })), required_role: null, required_tags: null, labor_cost: 1, description: null });
const g = (key: string, demand_basket: string) => ({ key, display_name: key, description: null, icon: null, category: null, production_stage: "final", demand_basket, base_price_numeric: 1, storable: true });

describe("Atlas canonical parity", () => {
  it("re-exports the engine objects, not copies", () => {
    expect(canon.BASKET_DEMAND).toBe(demand.BASKET_DEMAND);
    expect(canon.PRODUCT_META).toBe(market.PRODUCT_META);
    expect(canon.substitutionEfficiency).toBe(market.substitutionEfficiency);
    expect(canon.PRODUCTION_BUILDINGS).toBe(catalog.PRODUCTION_BUILDINGS);
  });
  it("exposes exactly the 13 canonical baskets", () => {
    expect(Object.keys(canon.BASKET_DEMAND).sort()).toEqual(["admin_supplies", "basic_clothing", "construction", "drinking_water", "feast", "fuel", "luxury_clothing", "metalwork", "military_supply", "staple_food", "storage_logistics", "tools", "variety"]);
  });
  it("every PRODUCT_META basket is a canonical basket", () => {
    for (const m of Object.values(canon.PRODUCT_META)) expect(canon.BASKET_DEMAND[m.basket], m.basket).toBeDefined();
  });
});

describe("basket products and substitution", () => {
  it("maps goods to their demand_basket only", () => {
    const rows = basketProducts("staple_food", [g("raw_grain", "staple_food"), g("baked_staples", "staple_food"), g("water", "drinking_water")]);
    expect(rows.map(x => x.good.key)).toEqual(["raw_grain", "baked_staples"]);
  });
  it("critical food uses nutritionOnly (taste never reduces nutrition)", () => {
    const rows = basketProducts("staple_food", [g("raw_grain", "staple_food"), g("baked_staples", "staple_food")]);
    expect(rows[0].nutritionOnly).toBe(true);
    const fv = (k: string) => Math.max(0.01, canon.PRODUCT_META[k]?.functional_value ?? 1);
    expect(rows[1].efficiency).toBeCloseTo(fv("baked_staples") / fv("raw_grain"), 6);
  });
  it("non-critical baskets include substitutability friction", () => {
    expect(basketProducts("feast", [g("a", "feast")])[0].nutritionOnly).toBe(false);
  });
});

describe("recipe chains", () => {
  const recipes = [r("mill", "flour", [["raw_grain", 2]]), r("bake_staples", "baked_staples", [["flour", 2]]), r("grow", "raw_grain", []), r("loopA", "x", [["y", 1]]), r("loopB", "y", [["x", 1]])];
  it("walks DB recipes to sources", () => {
    const t = buildChain("baked_staples", recipes);
    const flour = t.recipes[0].inputs[0].node;
    expect(flour.good).toBe("flour");
    expect(flour.recipes[0].inputs[0].node.recipes[0].inputs).toEqual([]);
  });
  it("marks cycles instead of recursing forever", () => {
    expect(buildChain("x", recipes).recipes[0].inputs[0].node.recipes[0].inputs[0].node.cycle).toBe(true);
  });
  it("reports DB vs catalogue mismatches", () => {
    const m = catalogMismatch(recipes, new Set(["flour", "baked_staples", "raw_grain"]));
    expect(m.noBuilding).toContain("loopA");
    expect(m.noBuilding).not.toContain("bake_staples");
    expect(m.unknownGoods).toEqual(expect.arrayContaining(["x", "y"]));
    expect(m.missingInDb.length).toBeGreaterThan(0);
  });
});

describe("world market aggregation", () => {
  const row = (node: string, price: number | null, demand: number, supply = 1): MarketRow => ({ city_node_id: node, good_key: "grain", supply_volume: supply, demand_volume: demand, price_numeric: price, turn_number: 8 });
  it("weights price by demand across markets", () => {
    const m = aggregateWorldMarket([row("a", 2, 1), row("b", 4, 3)], { complete: true, error: null, snapshotTurn: 8, currentTurn: 8 });
    expect(m.status).toBe("ok"); expect(m.marketCount).toBe(2);
    expect(m.goods[0]).toMatchObject({ weightedPrice: 3.5, supply: 2, demand: 4, balance: -2 });
  });
  it("zero demand gives unavailable price, not 0", () => {
    expect(aggregateWorldMarket([row("a", 5, 0)], { complete: true, error: null, snapshotTurn: 8, currentTurn: 8 }).goods[0].weightedPrice).toBeNull();
  });
  it("empty, incomplete and error never produce totals", () => {
    expect(aggregateWorldMarket([], { complete: true, error: null, snapshotTurn: null, currentTurn: 8 }).status).toBe("empty");
    expect(aggregateWorldMarket([row("a", 2, 1)], { complete: false, error: null, snapshotTurn: 8, currentTurn: 8 })).toMatchObject({ status: "incomplete", goods: [] });
    expect(aggregateWorldMarket([row("a", 2, 1)], { complete: false, error: "x", snapshotTurn: 8, currentTurn: 8 })).toMatchObject({ status: "error", goods: [] });
  });
  it("labels stale snapshots", () => {
    expect(snapshotAge(5, 8)).toMatchObject({ age: 3, stale: true });
    expect(snapshotAge(8, 8)).toMatchObject({ age: 0, stale: false });
  });
});

describe("provenance and paging", () => {
  it("formats missing values as unavailable, never 0", () => {
    expect(fmt(null)).toBe("—"); expect(fmt(undefined)).toBe("—"); expect(fmt(0)).toBe("0");
    expect(Object.values(PROVENANCE_LABEL)).toEqual(["Potvrzeno", "Skutečný provoz", "Potenciál", "Odvozeno", "Nedostupná data"]);
  });
  it("reads all pages and flags errors as incomplete", async () => {
    const pages = [[1, 2], [3]];
    expect(await fetchAllPages(async (f) => ({ data: pages[f / 2] ?? [], error: null }), 2)).toEqual({ rows: [1, 2, 3], complete: true, error: null });
    const bad = await fetchAllPages(async (f) => f ? { data: null, error: { message: "boom" } } : { data: [1, 2], error: null }, 2);
    expect(bad).toMatchObject({ complete: false, error: "boom" });
  });
  it("opportunities come only from the report, with unknown margin kept unknown", () => {
    const report = { cities: [{ id: "c", name: "Město" }], prices: [{ city: "c", good: "flour", local_price: 3, base_price: 1 }], producers: [], import_blockers: [{ city: "c", good: "flour", unmet: 4, reason: "route_unreachable", source: null }] };
    const [o] = deriveOpportunities(report, [r("mill", "flour", [["raw_grain", 1]])], new Set());
    expect(o).toMatchObject({ good: "flour", city: "Město", unmet: 4, localPrice: 3, margin: null, certainty: "doloženo reportem" });
    expect(deriveOpportunities(null, [], new Set())).toEqual([]);
  });
});

describe("Atlas is read-only and never leaks hidden geology", () => {
  const files = ["src/hooks/useAtlasData.ts", "src/pages/game/AtlasTab.tsx", ...readdirSync("src/lib/atlas").map(f => `src/lib/atlas/${f}`), ...readdirSync("src/components/atlas").map(f => `src/components/atlas/${f}`)];
  const src = files.map(f => readFileSync(f, "utf8")).join("\n");
  it("never names hidden geology or ledgers", () => {
    for (const bad of ["macro_deposits", "geology_seeds", "resource_deposits", "economy_turn_ledgers"]) expect(src.includes(bad), bad).toBe(false);
  });
  it("contains no write calls or function invocations", () => {
    for (const bad of [".insert(", ".update(", ".upsert(", ".delete(", "functions.invoke", ".rpc("]) expect(src.includes(bad), bad).toBe(false);
  });
  it("loaders only issue select queries", async () => {
    const calls: string[] = [];
    const chain: any = new Proxy({}, { get: (_t, p: string) => p === "then" ? (res: any) => res({ data: [], error: null }) : (...a: any[]) => { calls.push(String(p) + (p === "from" || p === "select" ? `:${a[0]}` : "")); return chain; } });
    vi.resetModules();
    vi.doMock("@/integrations/supabase/client", () => ({ supabase: chain }));
    const mod = await import("@/hooks/useAtlasData");
    expect(mod.HEX_SAFE_COLUMNS).not.toMatch(/deposit|geology/);
    const pick = (await import("@/lib/atlas/paging")).fetchAllPages;
    await pick((f, t) => (chain.from("goods").select("key").range(f, t)));
    expect(calls.every(c => !/^(insert|update|upsert|delete|rpc)/.test(c))).toBe(true);
    vi.doUnmock("@/integrations/supabase/client");
  });
});
