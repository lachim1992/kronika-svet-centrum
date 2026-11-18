// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadEdgeFunction } from "./loadEdgeFunction";

export function fixture(parcelEconomyVersion = 1) {
  let sequence = 0;
  const tables: Record<string, any[]> = {
    game_sessions: [{ id: "s", current_turn: 1, resolving_turn: null, parcel_economy_version: parcelEconomyVersion }],
    game_players: [{ session_id: "s", user_id: "u", player_name: "p" }],
    realm_resources: [{ id: "realm", session_id: "s", player_name: "p", gold_reserve: 1000, production_reserve: 1000, total_capacity: 100, prestige: 100 }],
    cities: [
      { id: "city", session_id: "s", name: "Vlastní", owner_player: "p", settlement_level: "HAMLET", level: "Osada", population_total: 2000, city_stability: 80, local_grain_reserve: 100, irrigation_level: 0, temple_level: 0, market_level: 0, province_id: "province", grid_x: 0, grid_y: 0 },
      { id: "foreign", session_id: "s", name: "Cizí", owner_player: "q", settlement_level: "HAMLET", population_total: 99999, city_stability: 100, local_grain_reserve: 100 },
      { id: "other-session", session_id: "other", name: "Jiná hra", owner_player: "p", settlement_level: "HAMLET" },
    ],
    tile_parcels: [{ id: "parcel", session_id: "s", city_id: "city", owner_player: "p", grid_x: 0, grid_y: 0, parcel_index: 0, buildable: true, capacity_slots: 2, sub_biome: "plain", claim_kind: "urban", status: "claimed", land_use: "open" }],
    tile_parcel_contents: [],
    province_hexes: [{ id: "hex", session_id: "s", grid_x: 0, grid_y: 0, province_id: "province", biome_family: "plains", coastal: false, has_river: false, is_passable: true, owner_player: "p" }],
    province_nodes: [], city_districts: [], game_events: [], world_action_log: [], chronicle_entries: [],
    city_policies: [], city_uprisings: [],
  };
  const rpcCalls: { name: string; args: any }[] = [];
  const from = (table: string) => {
    const rows = tables[table] ?? (tables[table] = []);
    let operation = "select", payload: any, single = false;
    const filters: ((row: any) => boolean)[] = [];
    const execute = () => {
      let selected = rows.filter(row => filters.every(filter => filter(row)));
      if (operation === "insert" || operation === "upsert") {
        selected = (Array.isArray(payload) ? payload : [payload]).map(row => ({ id: `${table}-${++sequence}`, ...row }));
        rows.push(...selected);
      } else if (operation === "update") {
        selected.forEach(row => Object.assign(row, payload));
      } else if (operation === "delete") {
        for (const row of selected) rows.splice(rows.indexOf(row), 1);
      }
      return { data: single ? selected[0] ?? null : selected, error: null };
    };
    const query: any = new Proxy({}, { get(_, key) {
      if (key === "then") return (resolve: any, reject: any) => Promise.resolve(execute()).then(resolve, reject);
      return (...args: any[]) => {
        if (key === "eq") filters.push(row => row[args[0]] === args[1]);
        if (key === "in") filters.push(row => args[1].includes(row[args[0]]));
        if (key === "gte") filters.push(row => Number(row[args[0]]) >= Number(args[1]));
        if (key === "lte") filters.push(row => Number(row[args[0]]) <= Number(args[1]));
        if (key === "is") filters.push(row => row[args[0]] === args[1]);
        if (key === "single" || key === "maybeSingle") single = true;
        if (key === "insert" || key === "upsert" || key === "update" || key === "delete") { operation = String(key); payload = args[0]; }
        return query;
      };
    } });
    return query;
  };
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: "u" } }, error: null }) },
    from,
    functions: { invoke: async () => ({ data: { ok: true }, error: null }) },
    rpc: async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      if (name === "build_subnode_atomic") return { data: { nodeId: "node-1", costGold: args.p_cost_gold, costProduction: args.p_cost_production }, error: null };
      if (name === "occupy_city_parcel_atomic") {
        const table = args.p_kind === "building" ? "city_buildings" : "city_districts";
        const entity = tables[table].find(row => row.id === args.p_entity);
        if (entity) entity.parcel_id = args.p_parcel;
        const parcel = tables.tile_parcels.find(row => row.id === args.p_parcel);
        if (parcel) {
          parcel.status = "occupied";
          parcel.land_use = args.p_land_use;
          parcel[`${args.p_kind}_id`] = args.p_entity;
        }
        tables.tile_parcel_contents.push({ id: `content-${++sequence}`, session_id: args.p_session, parcel_id: args.p_parcel, entity_type: args.p_kind, entity_id: args.p_entity, slots_used: 1 });
        return { data: { occupied: true }, error: null };
      }
      return { data: null, error: null };
    },
  };
  const handler = loadEdgeFunction("command-dispatch", { createClient: () => db });
  const run = async (commandType: string, commandPayload: any, options: { actor?: any; authorization?: string; resolvingTurn?: number | null } = {}) => {
    tables.game_sessions[0].resolving_turn = options.resolvingTurn ?? null;
    const response = await handler(new Request("https://local/command", {
      method: "POST", headers: { authorization: options.authorization || "Bearer verified" },
      body: JSON.stringify({ sessionId: "s", turnNumber: 1, actor: options.actor || { name: "forged-name", type: "player" }, commandType, commandId: `${commandType}-${++sequence}`, commandPayload }),
    }));
    return { status: response.status, body: await response.json() };
  };
  return { tables, rpcCalls, run };
}

describe("authoritative construction and decree commands", () => {
  it("rejects abstract production districts in parcel economy before charging", async () => {
    const f = fixture(1);
    const result = await f.run("BUILD_DISTRICT", { cityId: "city", districtKey: "farm_belt", district: { build_cost_wealth: -1000, basket_output: 999999 } });
    expect(result.status).toBe(400); expect(result.body.error).toContain("parcelové ekonomice");
    expect(f.tables.realm_resources[0].gold_reserve).toBe(1000);
    expect(f.tables.city_districts).toHaveLength(0);
  });

  it("rejects a foreign city even when the browser claims ownership and free costs", async () => {
    const f = fixture();
    const result = await f.run("BUILD_DISTRICT", { cityId: "foreign", districtKey: "quarter", district: { population_capacity: 99999, build_cost_wealth: 0 } });
    expect(result.status).toBe(400); expect(result.body.error).toContain("vlastním městě");
    expect(f.tables.city_districts).toHaveLength(0);
    expect(f.tables.realm_resources[0].gold_reserve).toBe(1000);
  });

  it("uses the canonical residential capacity and price, ignoring spoofed values", async () => {
    const f = fixture();
    const result = await f.run("BUILD_DISTRICT", { cityId: "city", districtKey: "quarter", parcelId: "parcel", district: { name: "Podvod", population_capacity: 99999, build_cost_wealth: -500, stability_modifier: 100 } });
    expect(result.status).toBe(200);
    expect(f.tables.city_districts[0]).toMatchObject({ name: "Obytná čtvrť", population_capacity: 400, stability_modifier: 1, build_cost_wealth: 25, basket_output: 0 });
    expect(f.tables.realm_resources[0]).toMatchObject({ gold_reserve: 975, production_reserve: 965 });
    expect(f.tables.tile_parcels[0].district_id).toBe(f.tables.city_districts[0].id);
  });

  it("rejects legacy production switching in parcel economy", async () => {
    const f = fixture();
    f.tables.city_districts.push({ id: "district", session_id: "s", city_id: "city", name: "Hospodářský pás", district_type: "production", basket_key: "staple_food" });
    const result = await f.run("SET_DISTRICT_PRODUCTION", { districtId: "district", basketKey: "forged_basket" });
    expect(result.status).toBe(400);
    expect(f.tables.city_districts[0].basket_key).toBe("staple_food");
  });

  it("fails closed for client-supplied decree rewards without any writes", async () => {
    const f = fixture();
    const result = await f.run("APPLY_DECREE_EFFECTS", { effects: [{ type: "gold", value: 999999 }], stabilityPenalty: -100, factionImpacts: { merchants: { loyalty: 100 } } });
    expect(result.status).toBe(400); expect(result.body.error).toContain("serverem ověřený");
    expect(f.tables.realm_resources[0].gold_reserve).toBe(1000);
    expect(f.tables.game_events).toHaveLength(0);
  });

  it("derives settlement target and cost instead of accepting POLIS and negative prices", async () => {
    const f = fixture();
    const result = await f.run("UPGRADE_SETTLEMENT", { cityId: "city", nextSettlement: "POLIS", nextLevel: 999, costs: { gold_reserve: -1000, production_reserve: -1000 } });
    expect(result.status).toBe(200);
    expect(f.tables.cities[0].settlement_level).toBe("TOWNSHIP");
    expect(f.tables.cities[0].level).toBe("Městečko");
    expect(f.tables.realm_resources[0]).toMatchObject({ gold_reserve: 970, production_reserve: 970 });
  });

  it("rejects over-level infrastructure and does not charge", async () => {
    const f = fixture();
    const result = await f.run("UPGRADE_INFRASTRUCTURE", { cityId: "city", field: "irrigation_level", nextLevel: 5, costGold: -1000, costProduction: -1000 });
    expect(result.status).toBe(400); expect(result.body.error).toContain("právě o jednu");
    expect(f.tables.cities[0].irrigation_level).toBe(0);
    expect(f.tables.realm_resources[0].gold_reserve).toBe(1000);
  });

  it("prices a valid infrastructure level from the server catalogue", async () => {
    const f = fixture();
    const result = await f.run("UPGRADE_INFRASTRUCTURE", { cityId: "city", field: "irrigation_level", nextLevel: 1, costGold: -1000, costProduction: -1000 });
    expect(result.status).toBe(200);
    expect(f.tables.cities[0].irrigation_level).toBe(1);
    expect(f.tables.realm_resources[0]).toMatchObject({ gold_reserve: 980, production_reserve: 975 });
  });

  it("sends only server-derived subnode definitions and costs to the atomic RPC", async () => {
    const f = fixture();
    const result = await f.run("BUILD_SUBNODE", { parcelId: "parcel", subtype: "farmstead", gold: -1000, production: -1000, resource: { supplies: 99999 } });
    expect(result.status).toBe(200);
    expect(f.rpcCalls).toHaveLength(1);
    expect(f.rpcCalls[0]).toMatchObject({ name: "build_subnode_atomic", args: { p_session: "s", p_player: "p", p_city: "city", p_cost_gold: 35, p_cost_production: 45 } });
    expect(f.rpcCalls[0].args.p_def.resource).toEqual({ supplies: 4, production: 2 });
    expect(f.tables.province_nodes).toHaveLength(0); // only the transactional RPC may create it
  });

  it("applies a canonical ration policy only to the seated player's own city", async () => {
    const f = fixture();
    const result = await f.run("SET_RATION_POLICY", { cityId: "city", policyKey: "austerity", grain_effect: 9999 });
    expect(result.status).toBe(200);
    expect(f.tables.cities[0].ration_policy).toBe("austerity");
    expect(f.tables.city_policies[0]).toMatchObject({ policy_value: "austerity", grain_effect: 5, stability_effect: -8, enacted_by: "p" });
  });

  it("rejects foreign or invented ration policies without a write", async () => {
    const foreign = await fixture().run("SET_RATION_POLICY", { cityId: "foreign", policyKey: "austerity" });
    expect(foreign.status).toBe(400);
    const f = fixture();
    const invalid = await f.run("SET_RATION_POLICY", { cityId: "city", policyKey: "free_grain" });
    expect(invalid.status).toBe(400);
    expect(f.tables.cities[0].ration_policy).toBeUndefined();
    expect(f.tables.city_policies).toHaveLength(0);
  });

  it("fails closed for legacy grain loot without changing either projection", async () => {
    const f = fixture();
    f.tables.realm_resources[0].grain_reserve = 500;
    f.tables.city_uprisings.push({ id: "uprising", session_id: "s", city_id: "city", city_name: "Vlastní", status: "pending", city_stability: 20, demands: [{ type: "open_stores", label: "Otevřít sklady" }] });
    const result = await f.run("RESOLVE_UPRISING", { uprisingId: "uprising", concession: "open_stores" });
    expect(result.status).toBe(400);
    expect(result.body.error).toContain("fyzické zboží");
    expect(f.tables.realm_resources[0]).toMatchObject({ grain_reserve: 500, production_reserve: 1000 });
    expect(f.tables.city_uprisings[0].status).toBe("pending");
    expect(f.tables.game_events).toHaveLength(0);
  });
});
