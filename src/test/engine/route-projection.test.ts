// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadEdgeFunction } from "./loadEdgeFunction";
import { database } from "./fakeProjectionDatabase";

const request = () => new Request("https://local", { method: "POST", body: JSON.stringify({ session_id: "world", force_all: true }) });
function routeDatabase() {
  const db = database();
  db.tables.world_foundations = [{ session_id: "world", grid_kind: "square4" }];
  db.tables.province_nodes = [
    { id: "a", session_id: "world", province_id: "p", is_active: true, controlled_by: "A", is_neutral: false, discovered: true, node_type: "city", hex_q: 0, hex_r: 0, strategic_value: 2, economic_value: 4 },
    { id: "b", session_id: "world", province_id: "p", is_active: true, controlled_by: "B", is_neutral: false, discovered: true, node_type: "city", hex_q: 1, hex_r: 0, parent_node_id: "a", strategic_value: 2, economic_value: 4 },
  ];
  db.tables.province_routes = [{ id: "route", session_id: "world", node_a: "a", node_b: "b", route_origin: "generated", route_type: "land_road", control_state: "open", construction_state: "complete", capacity_value: 17, path_dirty: true }];
  db.tables.province_hexes = [0, 1].map(q => ({ id: `hex-${q}`, session_id: "world", q, r: 0, biome_family: "plains", is_passable: true }));
  return db;
}

describe("route projection integrity (real edge handlers)", () => {
  it.each(["square4", "hex6"])("uses %s distances for generated routes", async grid_kind => {
    const db = routeDatabase();
    db.tables.world_foundations[0].grid_kind = grid_kind;
    db.tables.province_nodes[1].hex_r = -1;
    expect((await loadEdgeFunction("compute-province-routes", { createClient: () => db })(request())).status).toBe(200);
    expect(db.tables.province_routes).toHaveLength(1);
    const metadata = db.tables.province_routes[0].metadata as { distance: number };
    expect(metadata.distance).toBe(grid_kind === "square4" ? 2 : 1);
  });

  it("connects an orphan minor in a province with only one major", async () => {
    const db = routeDatabase();
    db.tables.province_nodes[0].is_major = true;
    db.tables.province_nodes[1].parent_node_id = null;
    db.tables.province_nodes[1].node_tier = "minor";
    expect((await loadEdgeFunction("compute-province-routes", { createClient: () => db })(request())).status).toBe(200);
    expect(db.tables.province_routes).toHaveLength(1);
    expect(db.tables.province_routes[0].metadata).toMatchObject({ tier_link: "minor→major_fallback" });
  });

  it("removes generated routes when no active nodes remain, preserving player routes", async () => {
    const db = routeDatabase();
    db.tables.province_nodes = [];
    const playerRoute = { ...db.tables.province_routes[0], id: "player", route_origin: "player_built" };
    db.tables.province_routes.push(playerRoute);
    expect((await loadEdgeFunction("compute-province-routes", { createClient: () => db })(request())).status).toBe(200);
    expect(db.tables.province_routes).toEqual([playerRoute]);
  });

  it("publishes capacity from the selected route columns", async () => {
    const db = routeDatabase();
    const response = await loadEdgeFunction("compute-trade-systems", { createClient: () => db })(request());
    expect(response.status).toBe(200);
    expect(db.tables.trade_systems).toHaveLength(1);
    expect(db.tables.trade_systems[0].total_capacity).toBe(17);
    expect(db.tables.player_trade_system_access).toHaveLength(2);
  });

  it("publishes a valid path before marking its route clean", async () => {
    const db = routeDatabase();
    const response = await loadEdgeFunction("compute-hex-flows", { createClient: () => db })(request());
    expect(response.status).toBe(200);
    expect(db.tables.flow_paths).toHaveLength(1);
    expect(db.tables.province_routes[0].path_dirty).toBe(false);
    const pathWrite = db.operations.findIndex(op => op.table === "flow_paths" && op.operation === "upsert");
    const routeWrite = db.operations.findIndex(op => op.table === "province_routes" && op.operation === "update");
    expect(pathWrite).toBeLessThan(routeWrite);
  });

  it.each([
    ["compute-province-routes", "world_foundations:select"],
    ["compute-province-routes", "province_nodes:select"],
    ["compute-province-routes", "province_adjacency:select"],
    ["compute-province-routes", "province_routes:select"],
    ["compute-hex-flows", "province_nodes:select"],
    ["compute-hex-flows", "province_routes:select"],
    ["compute-trade-systems", "game_sessions:select"],
    ["compute-trade-systems", "trade_system_node_snapshot:select"],
    ["compute-trade-systems", "diplomatic_treaties:select"],
    ["compute-trade-systems", "neutral_trade_pacts:select"],
  ])("%s stops before writes when %s fails", async (handlerName, failure) => {
    const db = routeDatabase();
    db.failures.add(failure);
    const response = await loadEdgeFunction(handlerName, { createClient: () => db })(request());
    expect(response.status).toBe(500);
    expect(db.operations.every(op => op.operation === "select")).toBe(true);
  });

  it.each([
    ["compute-province-routes", "province_routes:delete"],
    ["compute-province-routes", "province_routes:insert"],
    ["compute-hex-flows", "flow_paths:delete"],
    ["compute-hex-flows", "flow_paths:upsert"],
    ["compute-hex-flows", "province_routes:update"],
    ["compute-trade-systems", "world_events:insert"],
    ["compute-trade-systems", "trade_systems:delete"],
    ["compute-trade-systems", "trade_systems:upsert"],
    ["compute-trade-systems", "province_nodes:update"],
    ["compute-trade-systems", "trade_system_node_snapshot:insert"],
    ["compute-trade-systems", "player_trade_system_access:delete"],
    ["compute-trade-systems", "player_trade_system_access:insert"],
  ])("%s reports failed publication for %s", async (handlerName, failure) => {
    const db = routeDatabase();
    db.failures.add(failure);
    const response = await loadEdgeFunction(handlerName, { createClient: () => db })(request());
    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain("failed");
    if (failure.startsWith("flow_paths:")) expect(db.tables.province_routes[0].path_dirty).toBe(true);
  });
});
