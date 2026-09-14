// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadEdgeFunction } from "./loadEdgeFunction";

import { database } from "./fakeProjectionDatabase";

const request = (extra = {}) => new Request("https://local", { method: "POST", body: JSON.stringify({ session_id: "world", ...extra }) });

describe("goods projection publication (real edge handler)", () => {
  it("clears output of a stopped producer without touching another world's inventory", async () => {
    const db = database();
    const response = await loadEdgeFunction("compute-trade-flows", { createClient: () => db })(request());
    expect(response.status).toBe(200);
    expect(db.tables.node_inventory).toEqual([{ node_id: "foreign", quantity: 10 }]);
    expect(db.tables.realm_resources[0].goods_production_value).toBe(0);
    expect(db.tables.realm_resources[0].goods_wealth_fiscal).toBe(42);
  });

  it("does not run eligible recipes on an inactive node", async () => {
    const db = database();
    Object.assign(db.tables.province_nodes[0], { is_active: false, production_role: "processing", capability_tags: ["smithing"], production_output: 5 });
    db.tables.goods = [{ key: "tools", demand_basket: "tools", storable: true, base_price_numeric: 2 }];
    db.tables.production_recipes = [{ required_role: "processing", required_tags: ["smithing"], output_good_key: "tools", output_quantity: 10 }];
    expect((await loadEdgeFunction("compute-trade-flows", { createClient: () => db })(request())).status).toBe(200);
    expect(db.tables.node_inventory.some(row => row.node_id === "node")).toBe(false);
    expect(db.tables.realm_resources[0].goods_production_value).toBe(0);
  });

  it("clears empty current snapshots, preserves history and resets a realm that lost its last city", async () => {
    const db = database();
    db.tables.cities = [];
    for (const table of ["city_market_summary", "city_market_baskets", "demand_baskets", "market_shares"]) {
      db.tables[table] = [{ session_id: "world", turn_number: 1 }, { session_id: "world", turn_number: 2 }, { session_id: "other", turn_number: 2 }];
    }
    const handler = loadEdgeFunction("compute-trade-flows", { createClient: () => db });
    expect((await handler(request())).status).toBe(200);
    for (const table of ["city_market_summary", "city_market_baskets", "demand_baskets", "market_shares"]) {
      const expected = [{ session_id: "other", turn_number: 2 }];
      if (table !== "demand_baskets") expected.unshift({ session_id: "world", turn_number: 1 });
      expect(db.tables[table], table).toEqual(expected);
    }
    expect(db.tables.realm_resources[0].goods_supply_volume).toBe(0);
    expect(db.tables.realm_resources[0].goods_production_value).toBe(0);
  });

  it("replaces the current-only legacy demand snapshot idempotently", async () => {
    const db = database();
    db.tables.demand_baskets = [{ session_id: "world", turn_number: 1, marker: "history" }];
    const handler = loadEdgeFunction("compute-trade-flows", { createClient: () => db });
    expect((await handler(request())).status).toBe(200);
    expect(db.tables.demand_baskets.some(row => row.marker === "history")).toBe(false);
    const first = structuredClone(db.tables.demand_baskets);
    expect((await handler(request())).status).toBe(200);
    expect(db.tables.demand_baskets).toEqual(first);
  });

  it.each(["game_sessions", "goods", "production_recipes", "province_nodes", "cities", "province_routes", "province_hexes", "node_production_orders", "realm_resources"])("fails before mutation when %s cannot be read", async table => {
    const db = database();
    db.failures.add(`${table}:select`);
    const response = await loadEdgeFunction("compute-trade-flows", { createClient: () => db })(request());
    expect(response.status).toBe(500);
    expect(db.operations.every(op => op.operation === "select")).toBe(true);
  });

  it.each(["node_inventory:delete", "city_market_summary:delete", "demand_baskets:insert", "city_market_baskets:insert", "trade_system_basket_supply:delete", "market_shares:insert", "realm_resources:update", "province_nodes:update", "world_node_outputs:select", "trade_systems:select"])("reports failure instead of success for %s", async failure => {
    const db = database();
    db.failures.add(failure);
    const response = await loadEdgeFunction("compute-trade-flows", { createClient: () => db })(request());
    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain("failed");
  });

  it.each([0, 1, 3])("rejects a requested turn %s different from the server turn before mutation", async turn_number => {
    const db = database();
    const response = await loadEdgeFunction("compute-trade-flows", { createClient: () => db })(request({ turn_number }));
    expect(response.status).toBe(409);
    expect(db.operations.every(op => op.operation === "select")).toBe(true);
  });
});
