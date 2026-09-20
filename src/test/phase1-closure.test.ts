// ============================================================================
// PHASE 1 CLOSURE — contract guards for:
//   1. new-world bootstrap seeds a real starter economy + one derived pass
//   2. exactly one capital per realm (creation, founding, conquest, repair)
//   3. route upkeep is charged inside the authoritative fiscal boundary
// ============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { selectCapital } from "../../supabase/functions/_shared/capital";
import { planRouteMaintenance, type RouteStateRow } from "../../supabase/functions/_shared/routeUpkeep";
import { starterBundle } from "../../supabase/functions/_shared/starterEconomy";

const fn = (name: string) => readFileSync(`supabase/functions/${name}/index.ts`, "utf8");

describe("new-world bootstrap reaches a playable economy", () => {
  const src = fn("create-world-bootstrap");

  it("calls the canonical starter-economy helper (no local re-implementation)", () => {
    expect(src).toContain('from "../_shared/starterEconomy.ts"');
    expect(src).toMatch(/ensureStarterEconomy\(sb, normalized\.sessionId, \{ turnNumber: 1 \}\)/);
    expect(src).not.toMatch(/city_buildings/); // seeding stays in the shared helper
  });

  it("runs exactly one derived economy pass, via refresh-economy", () => {
    expect(src).toContain("functions/v1/refresh-economy");
    expect(src.match(/functions\/v1\/refresh-economy/g)!.length).toBe(1);
    // no fiscal writer may be invoked from bootstrap
    expect(src).not.toContain("functions/v1/process-turn");
    expect(src).not.toContain("functions/v1/commit-turn");
  });

  it("enforces the capital invariant at creation", () => {
    expect(src).toContain("ensureSingleCapital(sb, normalized.sessionId)");
  });

  it("the starter bundle is real producing structures with jobs and recipes", () => {
    for (const nearWater of [false, true]) {
      const bundle = starterBundle(nearWater);
      expect(bundle.length).toBeGreaterThanOrEqual(3);
      for (const c of bundle) {
        expect(c.recipeKeys.length).toBeGreaterThan(0);
        expect(c.jobsCapacity).toBeGreaterThan(0);
      }
    }
    expect(starterBundle(true).some((c) => c.recipeKeys.includes("catch_fish"))).toBe(true);
    expect(starterBundle(false).some((c) => c.recipeKeys.includes("harvest_wheat"))).toBe(true);
  });

  it("scales the starter economy to settlement population", () => {
    expect(starterLevelFor(100)).toBe(1);
    expect(starterLevelFor(200)).toBe(2);
    expect(starterLevelFor(450)).toBe(3);
    // monotonic: a bigger settlement never gets a smaller starter economy
    let previous = 0;
    for (const pop of [0, 50, 100, 174, 175, 349, 350, 900]) {
      const level = starterLevelFor(pop);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });

  it("narrative settlements also get the starter economy", () => {
    const init = fn("world-generate-init");
    expect(init).toContain("ensureStarterEconomy(supabase, sessionId");
  });


  it("household auto-production stays off (population is not a goods producer)", () => {
    const cfg = readFileSync("supabase/functions/_shared/economyConfig.ts", "utf8");
    expect(cfg).toMatch(/householdProduction:\s*false/);
  });
});

describe("capital invariant", () => {
  const city = (id: string, extra: Record<string, unknown> = {}) =>
    ({ id, owner_player: "P", population_total: 100, founded_round: 1, ...extra }) as any;

  it("keeps an already-flagged capital", () => {
    const chosen = selectCapital([city("b"), city("a", { is_capital: true })]);
    expect(chosen!.id).toBe("a");
  });

  it("is deterministic when several cities are flagged", () => {
    const rows = [city("c", { is_capital: true }), city("a", { is_capital: true })];
    expect(selectCapital(rows)!.id).toBe("a");
    expect(selectCapital(rows.slice().reverse())!.id).toBe("a");
  });

  it("prefers the founding capital tag, then the largest city", () => {
    expect(selectCapital([city("b", { population_total: 9000 }), city("a", { tags: ["capital"] })])!.id).toBe("a");
    expect(selectCapital([city("b", { population_total: 9000 }), city("a", { population_total: 10 })])!.id).toBe("b");
  });

  it("returns null for a realm without cities", () => {
    expect(selectCapital([])).toBeNull();
  });

  it("conquest clears the capital flag and repairs both realms", () => {
    const src = fn("commit-turn");
    expect(src).toContain("is_capital: false");
    expect(src).toContain("ensureSingleCapital(supabase, sessionId, {");
    expect(src).toContain("affectedCapitalOwners");
  });

  it("founding a settlement keeps the invariant", () => {
    expect(fn("command-dispatch")).toContain("ensureSingleCapital(supabase, sessionId, { owners: [actor.name] })");
  });

  it("a deterministic repair path exists for legacy capital-less realms", () => {
    const src = fn("backfill-starter-economy");
    expect(src).toContain("ensureSingleCapital(supabase, session_id, { dryRun: dryRun !== false })");
  });
});

describe("route upkeep sits inside the fiscal boundary", () => {
  const state = (id: string, extra: Partial<RouteStateRow> = {}): RouteStateRow => ({
    route_id: id, session_id: "S", lifecycle_state: "usable", maintenance_level: 50,
    quality_level: 1, last_maintained_turn: 0, upkeep_cost: 10, ...extra,
  });

  const plan = (gold: number, states = [state("r1"), state("r2")]) =>
    planRouteMaintenance({
      sessionId: "S", turnNumber: 7, states,
      ownerOf: () => "P", goldOf: () => gold,
    });

  it("reports upkeep per owner instead of debiting gold", () => {
    const p = plan(100);
    expect(p.upkeepByOwner).toEqual({ P: 20 });
    expect(p.stateUpdates.every((u) => u.last_maintained_turn === 7)).toBe(true);
  });

  it("stops servicing when the treasury cannot afford it", () => {
    const p = plan(10);
    expect(p.upkeepByOwner).toEqual({ P: 10 });
    expect(p.stateUpdates.filter((u) => u.last_maintained_turn === 7).length).toBe(1);
    expect(p.stateUpdates.some((u) => Number(u.turns_unpaid) === 1)).toBe(true);
  });

  it("is order-independent and deterministic", () => {
    const a = plan(15, [state("r1"), state("r2")]);
    const b = plan(15, [state("r2"), state("r1")]);
    expect(a.upkeepByOwner).toEqual(b.upkeepByOwner);
    expect(a.stateUpdates.map((u) => u.route_id)).toEqual(b.stateUpdates.map((u) => u.route_id));
  });

  it("orphan routes decay but are never charged", () => {
    const p = planRouteMaintenance({
      sessionId: "S", turnNumber: 7, states: [state("r1")],
      ownerOf: () => null, goldOf: () => 1000,
    });
    expect(p.upkeepByOwner).toEqual({});
    expect(p.stateUpdates[0].maintenance_level).toBe(45);
  });

  it("world-layer-tick never writes gold and guards itself per turn", () => {
    const src = fn("world-layer-tick");
    expect(src).not.toMatch(/gold_reserve:/);
    expect(src).toContain("world_layer_tick_guards");
    expect(src).toContain("replayed: true");
  });

  it("process-turn charges it and reports it in the turn ledger", () => {
    const src = fn("process-turn");
    expect(src).toContain("routeUpkeepDueThisTurn(supabase, sessionId, playerName, currentTurn)");
    expect(src).toContain("newGoldReserve -= routeUpkeepExpense");
    expect(src).toContain("route_upkeep: routeUpkeepExpense");
    expect(src).toMatch(/recurring_expenses:.*routeUpkeepExpense/);
    expect(src).toMatch(/turn_fiscal_delta:.*routeUpkeepExpense/);
  });

  it("commit-turn runs the world layer tick before the fiscal pass", () => {
    const src = fn("commit-turn");
    const tick = src.indexOf('invoke("world-layer-tick"');
    const fiscal = src.indexOf('invoke("process-turn"');
    expect(tick).toBeGreaterThan(0);
    expect(fiscal).toBeGreaterThan(0);
    expect(tick).toBeLessThan(fiscal);
  });
});
