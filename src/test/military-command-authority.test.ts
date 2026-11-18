// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fixture } from "./engine/command-authority-security.test";
import { actualSoldiers, computeMilitaryLedgerPatch, computeWorkforceBreakdown } from "../../supabase/functions/_shared/manpower";
import { applyStackMove } from "../../supabase/functions/_shared/stackMovementCommand";
import { activeUpkeepStacks } from "../components/economy/MilitaryUpkeepPanel";
import { computeArmyFoodUpkeep, computeArmyGoldUpkeep } from "../lib/economyConstants";
import { districtsTowardHousingLimit, isLegacyProductionDistrict } from "../../supabase/functions/_shared/cityDistricts";
import { SETTLEMENT_UPGRADES, settlementUpgradeProblem } from "../../supabase/functions/_shared/settlementUpgrades";

function militaryFixture() {
  const f = fixture(2);
  Object.assign(f.tables.cities[0], {
    population_total: 2000, population_peasants: 2000,
    population_burghers: 0, population_clerics: 0, population_warriors: 0,
  });
  Object.assign(f.tables.realm_resources[0], {
    mobilization_rate: 0.1, manpower_pool: 0, manpower_available: 0,
    manpower_committed: 999999, manpower_mobilized: 999999,
    over_mobilized: true, military_gold_upkeep: 999, military_food_upkeep: 999,
  });
  f.tables.military_stacks = [
    { id: "a", session_id: "s", player_name: "p", name: "Alfa", soldiers: 120, is_active: true, is_deployed: true },
    { id: "b", session_id: "s", player_name: "p", name: "Beta", soldiers: 80, is_active: true, is_deployed: true },
    { id: "c", session_id: "s", player_name: "p", name: "Stráž", soldiers: 10, is_active: true, is_deployed: true },
    { id: "old", session_id: "s", player_name: "p", name: "Historie", soldiers: 50, is_active: false, is_deployed: true },
    { id: "foreign", session_id: "s", player_name: "q", name: "Cizí", soldiers: 900, is_active: true, is_deployed: true },
  ];
  f.tables.laws = [];
  return f;
}

describe("server-authoritative stack deactivation", () => {
  it("demobilizes the real UI selection, ignores returnedManpower and refreshes every HUD field", async () => {
    const f = militaryFixture();
    const result = await f.run("DEMOBILIZE_STACK", { stackIds: ["a", "b"], returnedManpower: 999999, readyTurn: 999 });
    expect(result.status).toBe(200);
    expect(result.body.sideEffects).toMatchObject({ returnedManpower: 200, remobilizeReadyTurn: 4 });
    expect(f.tables.game_events[0].reference).toMatchObject({ returnedManpower: 200, remobilizeReadyTurn: 4, stackIds: ["a", "b"] });
    for (const id of ["a", "b"]) expect(f.tables.military_stacks.find(s => s.id === id)).toMatchObject({
      is_active: false, is_deployed: false, demobilized_turn: 1, remobilize_ready_turn: 4,
    });
    expect(f.tables.military_stacks.find(s => s.id === "c").is_active).toBe(true);
    expect(f.tables.realm_resources[0]).toMatchObject({
      manpower_pool: 990, manpower_available: 990, manpower_committed: 10, manpower_mobilized: 10,
      over_mobilized: false, military_gold_upkeep: 1, military_food_upkeep: 1,
    });
  });

  it("DISBAND shares the same stored-soldier calculation and inactive deployment reset", async () => {
    const f = militaryFixture();
    const result = await f.run("DISBAND_STACK", { stackId: "a", returnedManpower: 888888 });
    expect(result.status).toBe(200);
    expect(result.body.sideEffects.returnedManpower).toBe(120);
    expect(f.tables.game_events[0].reference.returnedManpower).toBe(120);
    expect(f.tables.military_stacks.find(s => s.id === "a")).toMatchObject({ is_active: false, is_deployed: false, remobilize_ready_turn: 4 });
    expect(f.tables.realm_resources[0]).toMatchObject({ manpower_committed: 90, manpower_available: 910 });
  });

  it("rejects duplicate, missing, inactive and foreign stacks before mutation", async () => {
    for (const ids of [["a", "a"], ["missing"], ["old"], ["foreign"]]) {
      const f = militaryFixture();
      const before = JSON.stringify(f.tables.military_stacks);
      const result = await f.run("DEMOBILIZE_STACK", { stackIds: ids, returnedManpower: 1 });
      expect(result.status).toBe(400);
      expect(JSON.stringify(f.tables.military_stacks)).toBe(before);
      expect(f.tables.game_events).toHaveLength(0);
    }
  });

  it("retires the unused direct MOBILIZE_MANPOWER ledger writer", async () => {
    const f = militaryFixture();
    const before = { ...f.tables.realm_resources[0] };
    const result = await f.run("MOBILIZE_MANPOWER", { amount: 100 });
    expect(result.status).toBe(400);
    expect(result.body.error).toContain("vypnutý");
    expect(f.tables.realm_resources[0]).toEqual(before);
  });
});

describe("trusted actor boundary", () => {
  it.each(["system", "ai_faction"])("rejects spoofed %s before the resolving-turn bypass", async type => {
    const f = militaryFixture();
    const result = await f.run("SET_MOBILIZATION", { rate: 0.2 }, { actor: { name: "p", type }, resolvingTurn: 1 });
    expect(result.status).toBe(403);
    expect(f.tables.game_events).toHaveLength(0);
  });

  it("a forged player name is replaced by the verified seat", async () => {
    const f = militaryFixture();
    const result = await f.run("SET_MOBILIZATION", { rate: 0.2 });
    expect(result.status).toBe(200);
    expect(f.tables.game_events[0]).toMatchObject({ player: "p", actor_type: "player" });
  });

  it("a player still receives a normal refusal during resolution", async () => {
    const f = militaryFixture();
    const result = await f.run("SET_MOBILIZATION", { rate: 0.2 }, { resolvingTurn: 1 });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: false, code: "TURN_RESOLVING" });
    expect(f.tables.game_events).toHaveLength(0);
  });

  it("a valid service-role AI caller bypasses resolution without seat spoofing", async () => {
    const f = militaryFixture();
    const result = await f.run("SET_MOBILIZATION", { rate: 0.2 }, {
      actor: { name: "p", type: "ai_faction" }, authorization: "Bearer test-value", resolvingTurn: 1,
    });
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(f.tables.game_events[0]).toMatchObject({ player: "p", actor_type: "ai_faction" });
  });
});

describe("canonical manpower and inactive upkeep", () => {
  it("computes free civilians and upkeep only from active stacks", () => {
    const cities = [{ population_total: 1000, population_peasants: 1000 }];
    const stacks = [{ soldiers: 100, is_active: true }, { soldiers: 10000, is_active: false, is_deployed: true }];
    const soldiers = actualSoldiers(stacks);
    const breakdown = computeWorkforceBreakdown(cities, 0.1, 0, 0, soldiers);
    expect(computeMilitaryLedgerPatch(cities, stacks, breakdown)).toEqual({
      manpower_pool: 400, manpower_available: 400, manpower_committed: 100, manpower_mobilized: 100,
      over_mobilized: false, military_gold_upkeep: 1, military_food_upkeep: 1,
    });
    expect(activeUpkeepStacks(stacks)).toHaveLength(1);
    expect(computeArmyGoldUpkeep(stacks)).toBe(1);
    expect(computeArmyFoodUpkeep(stacks)).toBe(1);
  });

  it("the HUD mobilization slider cannot write realm_resources directly", () => {
    const source = readFileSync("src/components/layout/ResourceHUD.tsx", "utf8");
    expect(source).not.toMatch(/from\("realm_resources"\)\.update/);
    expect(source.match(/commandType: "SET_MOBILIZATION"/g)).toHaveLength(2);
  });
});

describe("hex movement loses a deactivation race without moving", () => {
  it("adds is_active to the atomic update and preserves coordinates", async () => {
    const stack: any = { id: "stack", session_id: "s", player_name: "p", hex_q: 0, hex_r: 0, moved_this_turn: false, is_active: true };
    const rows: Record<string, any[]> = {
      military_stacks: [stack], world_foundations: [{ session_id: "s", grid_kind: "hex6" }],
      province_hexes: [
        { session_id: "s", q: 0, r: 0, biome_family: "plains", is_passable: true },
        { session_id: "s", q: 1, r: 0, biome_family: "plains", is_passable: true },
      ],
      province_routes: [], diplomatic_pacts: [], war_declarations: [],
    };
    const from = (table: string) => {
      let operation = "select", payload: any, single = false;
      const filters: ((row: any) => boolean)[] = [];
      const execute = () => {
        const selected = (rows[table] || []).filter(row => filters.every(filter => filter(row)));
        if (operation === "update") for (const row of selected) Object.assign(row, payload);
        return { data: single ? selected[0] ?? null : selected, error: null };
      };
      const query: any = new Proxy({}, { get(_, key) {
        if (key === "then") return (resolve: any, reject: any) => Promise.resolve(execute()).then(resolve, reject);
        return (...args: any[]) => {
          if (key === "eq") filters.push(row => row[args[0]] === args[1]);
          if (key === "in") filters.push(row => args[1].includes(row[args[0]]));
          if (key === "gte") filters.push(row => Number(row[args[0]]) >= Number(args[1]));
          if (key === "lte") filters.push(row => Number(row[args[0]]) <= Number(args[1]));
          if (key === "single" || key === "maybeSingle") single = true;
          if (key === "update") {
            operation = "update"; payload = args[0];
            // Competing demobilization commits after the initial read but before this write.
            if (table === "military_stacks") stack.is_active = false;
          }
          return query;
        };
      } });
      return query;
    };
    const result = await applyStackMove({ from }, {
      sessionId: "s", stackId: "stack", actorName: "p", plannedPath: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
    });
    expect(result).toMatchObject({ ok: false, code: "RACE_LOST" });
    expect(stack).toMatchObject({ hex_q: 0, hex_r: 0, is_active: false });
  });
});

describe("legacy parcel districts and food prerequisites", () => {
  const production = { district_type: "production" }, homes = { district_type: "residential" };
  it("versions 1 and 2 keep production visible as inactive legacy but outside housing limits", () => {
    for (const version of [1, 2]) {
      expect(isLegacyProductionDistrict(production, version)).toBe(true);
      expect(districtsTowardHousingLimit([production, homes], version)).toEqual([homes]);
    }
    expect(districtsTowardHousingLimit([production, homes], 0)).toHaveLength(2);
    expect(readFileSync("src/components/city/CityGovernancePanel.tsx", "utf8")).toContain("Legacy — neaktivní");
  });

  it("never uses the legacy local grain projection as a settlement prerequisite", () => {
    expect(Object.values(SETTLEMENT_UPGRADES).every(upgrade => upgrade.grain === 0)).toBe(true);
    expect(settlementUpgradeProblem(
      { population_total: 2000, city_stability: 50, local_grain_reserve: 0 }, {}, SETTLEMENT_UPGRADES.HAMLET,
    )).toBeNull();
  });
});
