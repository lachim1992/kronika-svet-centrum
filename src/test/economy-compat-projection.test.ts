import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const adapter = readFileSync("supabase/functions/_shared/economyAdapter.ts", "utf8");

describe("trade flow identity columns", () => {
  it("writes cities.id into city columns", () => {
    expect(adapter).toContain("source_city_id:f.source,target_city_id:f.destination");
  });

  it("writes province_nodes.id into node columns", () => {
    expect(adapter).toContain("source_node_id:cityNode.get(f.source),target_node_id:cityNode.get(f.destination)");
  });

  it("never puts the anchoring node id into a city column", () => {
    expect(adapter).not.toContain("source_city_id:cityNode.get");
    expect(adapter).not.toContain("target_city_id:cityNode.get");
  });
});

describe("demand_baskets compatibility projection", () => {
  it("is derived from the canonical basket ledger, not a second solver", () => {
    expect(adapter).toContain("const demandBaskets=marketBaskets");
    expect(adapter).toContain("quantity_needed:b.local_demand");
    expect(adapter).toContain("quantity_fulfilled:Math.max(0,b.local_demand-b.unmet_demand)");
  });

  it("anchors demand rows to province_nodes.id per the existing FK", () => {
    expect(adapter).toMatch(/demandBaskets=marketBaskets[\s\S]*city_id:cityNode\.get\(b\.city_id\)/);
  });

  it("ships the projection in the canonical payload", () => {
    expect(adapter).toContain("{result,marketBaskets,demandBaskets,");
  });
});

describe("trade_routes column contract", () => {
  const files = [
    "supabase/functions/commit-turn/index.ts",
    "supabase/functions/ai-faction-turn/index.ts",
    "supabase/functions/council-session/index.ts",
  ];

  it("never filters trade_routes by the non-existent is_active column", () => {
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const routeQueries = src.split("\n").filter((l) => l.includes('from("trade_routes")'));
      for (const line of routeQueries) expect(line).not.toContain("is_active");
    }
  });

  it("uses from_player/to_player instead of legacy player_a/player_b", () => {
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/tr\.player_a|tr\.player_b/);
    }
  });
});
