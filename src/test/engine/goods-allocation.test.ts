// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadEdgeFunction } from "./loadEdgeFunction";
import { database } from "./fakeProjectionDatabase";

function tradeWorld(sellers: number, buyers: number, buyerPopulation = 2000) {
  const db = database();
  db.tables.cities = [];
  db.tables.province_nodes = [];
  db.tables.node_inventory = [];
  db.tables.goods = [{ key: "tools", demand_basket: "tools", storable: true, base_price_numeric: 2 }];
  db.tables.production_recipes = [{ required_role: "processing", required_tags: ["smithing"], output_good_key: "tools", output_quantity: 10 }];
  for (let i = 0; i < sellers + buyers; i++) {
    const seller = i < sellers;
    const id = `${seller ? "seller" : "buyer"}-${i}`;
    db.tables.cities.push({ id, session_id: "world", owner_player: "A", population_total: seller ? 0 : buyerPopulation, population_peasants: seller ? 0 : buyerPopulation });
    db.tables.province_nodes.push({ id: `node-${id}`, city_id: id, session_id: "world", is_active: true, controlled_by: "A", trade_system_id: "market", production_role: seller ? "processing" : null, capability_tags: seller ? ["smithing"] : [], production_output: 5 });
  }
  return db;
}
const request = () => new Request("https://local", { method: "POST", body: JSON.stringify({ session_id: "world" }) });
async function refresh(db: ReturnType<typeof database>) {
  const response = await loadEdgeFunction("compute-trade-flows", { createClient: () => db })(request());
  expect(response.status).toBe(200);
  return db.tables.trade_flows;
}

describe("goods allocation conserves supply and demand", () => {
  it("does not sell one producer's surplus again to each buyer", async () => {
    const db = tradeWorld(1, 3);
    const flows = await refresh(db);
    const total = flows.reduce((sum, flow) => sum + Number(flow.volume_per_turn), 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(10);
    expect(db.tables.realm_resources[0].goods_wealth_fiscal).toBe(42);
  });

  it("does not fill the same buyer deficit once per supplier", async () => {
    const db = tradeWorld(3, 1, 100);
    const flows = await refresh(db);
    const basket = db.tables.city_market_baskets.find(row => row.city_id === "buyer-3" && row.basket_key === "tools")!;
    const total = flows.reduce((sum, flow) => sum + Number(flow.volume_per_turn), 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(Number(basket.unmet_demand));
  });

  it("counts completed building output when deciding whether a buyer needs imports", async () => {
    const db = tradeWorld(1, 1, 100);
    db.tables.city_buildings = [{ id: "smithy", session_id: "world", city_id: "buyer-1", status: "completed", current_level: 1, effects: { basket_outputs: { tools: 10 } } }];
    expect(await refresh(db)).toHaveLength(0);
  });

  it("never rounds a shipment above a sub-unit deficit", async () => {
    const db = tradeWorld(1, 1, 10);
    const flows = await refresh(db);
    const basket = db.tables.city_market_baskets.find(row => row.city_id === "buyer-1" && row.basket_key === "tools")!;
    expect(flows.reduce((sum, flow) => sum + Number(flow.volume_per_turn), 0)).toBeLessThanOrEqual(Number(basket.unmet_demand));
    expect(flows.every(flow => Number(flow.volume_per_turn) > 0)).toBe(true);
  });

  it("is repeatable and independent of database row order", async () => {
    const db = tradeWorld(2, 4);
    const first = structuredClone(await refresh(db));
    expect(await refresh(db)).toEqual(first);
    db.tables.cities.reverse();
    db.tables.province_nodes.reverse();
    expect(await refresh(db)).toEqual(first);
  });
});
