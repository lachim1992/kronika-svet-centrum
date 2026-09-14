// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadEdgeFunction } from "./loadEdgeFunction";

type Row = Record<string, string | number | boolean | null>;
function database() {
  const tables: Record<string, Row[]> = {
    game_sessions: [{ id: "world", current_turn: 2 }],
    city_market_baskets: [
      { session_id: "world", city_id: "source", player_name: "A", basket_key: "tools", auto_supply: 5, bonus_supply: 2, local_supply: 7, local_demand: 5, export_surplus: 2, unmet_demand: 0, turn_number: 2 },
      { session_id: "world", city_id: "target", player_name: "B", basket_key: "tools", auto_supply: 3, bonus_supply: 1, local_supply: 4, local_demand: 10, export_surplus: 0, unmet_demand: 6, turn_number: 2 },
    ],
    province_nodes: [
      { session_id: "world", city_id: "source", trade_system_id: "market" },
      { session_id: "world", city_id: "target", trade_system_id: "market" },
    ],
    player_trade_system_access: [
      { session_id: "world", player_name: "A", trade_system_id: "market", access_level: 1, tariff_factor: 1 },
      { session_id: "world", player_name: "B", trade_system_id: "market", access_level: 1, tariff_factor: 1 },
    ],
    realm_resources: [
      { session_id: "world", player_name: "A", total_production: 7, total_gdp: 7, total_wealth: 0, goods_wealth_fiscal: 0, gold_reserve: 100 },
      { session_id: "world", player_name: "B", total_production: 4, total_gdp: 4, total_wealth: 25, goods_wealth_fiscal: 25, gold_reserve: 200 },
    ],
    basket_trade_flows: [],
  };
  let failBasketWrites = false;
  const writes: { table: string; values: Row }[] = [];
  return {
    tables, writes,
    failBasketWrites: () => { failBasketWrites = true; },
    from(table: string) {
      let operation = "select";
      let single = false;
      let values: Row | Row[] = {};
      const filters: ((row: Row) => boolean)[] = [];
      const query = {
        select: () => query,
        single: () => { single = true; return query; },
        limit: () => query,
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
        not: (key: string, _: string, value: unknown) => { filters.push(row => row[key] !== value); return query; },
        delete: () => { operation = "delete"; return query; },
        insert: (value: Row | Row[]) => { operation = "insert"; values = value; return query; },
        update: (value: Row) => { operation = "update"; values = value; return query; },
        then(resolve: (result: { data: Row[] | Row | null; error: { message: string } | null }) => unknown) {
          const matches = (row: Row) => filters.every(filter => filter(row));
          const rows = tables[table] || [];
          if (operation === "update" && table === "city_market_baskets" && failBasketWrites) {
            return Promise.resolve(resolve({ data: [], error: { message: "basket write failed" } }));
          }
          if (operation === "delete") tables[table] = rows.filter(row => !matches(row));
          if (operation === "insert") tables[table] = [...rows, ...structuredClone(Array.isArray(values) ? values : [values])];
          if (operation === "update") {
            writes.push({ table, values: structuredClone(values as Row) });
            for (const row of rows.filter(matches)) Object.assign(row, structuredClone(values));
          }
          const selected = rows.filter(matches);
          return Promise.resolve(resolve({ data: structuredClone(single ? selected[0] ?? null : selected), error: null }));
        },
      };
      return query;
    },
  };
}

const request = () => new Request("https://local", { method: "POST", body: JSON.stringify({ session_id: "world" }) });

describe("basket trade projection (real edge handler)", () => {
  it("macro projection preserves a real zero fiscal income instead of reviving legacy wealth", async () => {
    const db = database();
    db.tables.province_nodes = [{
      session_id: "world", id: "village", controlled_by: "A", node_type: "village_cluster",
      node_tier: "minor", node_subtype: "village", upgrade_level: 1, population: 100,
      infrastructure_level: 1, economic_value: 1, strategic_value: 1, development_level: 1,
      stability_factor: 1, hex_q: 0, hex_r: 0,
    }];
    const handler = loadEdgeFunction("compute-economy-flow", { createClient: () => db });
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(db.tables.realm_resources[0].total_wealth).toBe(0);
    expect(db.tables.realm_resources[0].goods_wealth_fiscal).toBe(0);
    expect(db.writes.some(w => w.table === "province_nodes")).toBe(true);
    expect(db.writes.filter(w => w.table === "realm_resources").every(w =>
      !("total_wealth" in w.values) && !("total_gdp" in w.values))).toBe(true);
  });

  it("counts domestic supply once and conserves supply during a partial import", async () => {
    const db = database();
    const handler = loadEdgeFunction("compute-basket-trade-flows", { createClient: () => db });
    expect((await handler(request())).status).toBe(200);
    const [source, target] = db.tables.city_market_baskets;
    // Source exports 2 of 7; target has 4 + 2, not 4 + 4 + 2.
    expect(source.local_supply).toBe(5);
    expect(target.local_supply).toBe(6);
    expect(target.unmet_demand).toBe(4);
    expect(target.domestic_satisfaction).toBe(0.6);
    expect(Number(source.local_supply) + Number(target.local_supply)).toBe(11);
    expect(db.tables.realm_resources[0].total_gdp).toBe(11); // domestic 7 + exports 2×2
  });

  it("repeated projection produces identical flows and never posts fiscal income", async () => {
    const db = database();
    const handler = loadEdgeFunction("compute-basket-trade-flows", { createClient: () => db });
    await handler(request());
    const first = structuredClone(db.tables);
    await handler(request());
    expect(db.tables).toEqual(first);
    expect(db.tables.realm_resources.map(r => r.goods_wealth_fiscal)).toEqual([0, 25]);
    expect(db.tables.realm_resources.map(r => r.gold_reserve)).toEqual([100, 200]);
    expect(db.writes.filter(w => w.table === "realm_resources").every(w =>
      Object.keys(w.values).every(key => key === "total_gdp"))).toBe(true);
  });

  it("does not trade from or overwrite historical basket snapshots", async () => {
    const db = database();
    const history = { ...db.tables.city_market_baskets[0], turn_number: 1, auto_supply: 900, local_supply: 900, export_surplus: 895 };
    db.tables.city_market_baskets.push(history);
    const handler = loadEdgeFunction("compute-basket-trade-flows", { createClient: () => db });
    await handler(request());
    expect(history.local_supply).toBe(900);
    expect(db.tables.basket_trade_flows).toHaveLength(1);
    expect(db.tables.basket_trade_flows[0].volume).toBe(2);
    expect(db.tables.basket_trade_flows[0].turn_number).toBe(2);
  });

  it("clears stale imports, exports and export GDP when access disappears", async () => {
    const db = database();
    const handler = loadEdgeFunction("compute-basket-trade-flows", { createClient: () => db });
    await handler(request());
    db.tables.player_trade_system_access = [];
    await handler(request());
    expect(db.tables.basket_trade_flows).toEqual([]);
    expect(db.tables.city_market_baskets[0].local_supply).toBe(7);
    expect(db.tables.city_market_baskets[1].local_supply).toBe(4);
    expect(db.tables.city_market_baskets[1].unmet_demand).toBe(6);
    expect(db.tables.realm_resources[0].total_gdp).toBe(7);
  });

  it("does not report success when publishing baskets fails", async () => {
    const db = database();
    db.failBasketWrites();
    const handler = loadEdgeFunction("compute-basket-trade-flows", { createClient: () => db });
    const response = await handler(request());
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("basket write failed");
  });
});
