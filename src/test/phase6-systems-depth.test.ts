import { describe, expect, it } from "vitest";
import {
  activePactBetween,
  areAtWar,
  checkTerritoryAccess,
  checkWarDeclaration,
  deterministicSeed,
} from "../../supabase/functions/_shared/diplomacyEnforcement.ts";
import { ECONOMY } from "../../supabase/functions/_shared/economyConfig.ts";
import { BASE_HOUSING } from "../../supabase/functions/_shared/demographics.ts";

const pact = (a: string, b: string, type: string, status = "active") =>
  ({ party_a: a, party_b: b, pact_type: type, status });
const war = (a: string, b: string, status = "active") =>
  ({ declaring_player: a, target_player: b, status });

describe("Phase 6 — alliance blocks war", () => {
  it("rejects a declaration against an ally", () => {
    const res = checkWarDeclaration([pact("A", "B", "alliance")], "A", "B");
    expect(res.ok).toBe(false);
    if (res.ok === false) expect(res.pactType).toBe("alliance");
  });

  it("rejects a declaration against a defensive partner regardless of pact direction", () => {
    expect(checkWarDeclaration([pact("B", "A", "defense_pact")], "A", "B").ok).toBe(false);
  });

  it("allows a declaration when the pact is no longer active", () => {
    expect(checkWarDeclaration([pact("A", "B", "alliance", "broken")], "A", "B").ok).toBe(true);
  });

  it("ignores pacts with third parties", () => {
    expect(checkWarDeclaration([pact("A", "C", "alliance")], "A", "B").ok).toBe(true);
  });
});

describe("Phase 6 — open borders gate peacetime movement", () => {
  it("blocks foreign territory in peace without a passage pact", () => {
    const res = checkTerritoryAccess([], [], "A", ["B"]);
    expect(res.ok).toBe(false);
    if (res.ok === false) expect(res.owner).toBe("B");
  });

  it("allows own and unclaimed land", () => {
    expect(checkTerritoryAccess([], [], "A", ["A", null, undefined]).ok).toBe(true);
  });

  it("allows passage with open borders or an alliance", () => {
    expect(checkTerritoryAccess([pact("A", "B", "open_borders")], [], "A", ["B"]).ok).toBe(true);
    expect(checkTerritoryAccess([pact("B", "A", "alliance")], [], "A", ["B"]).ok).toBe(true);
  });

  it("allows invasion when at war", () => {
    expect(checkTerritoryAccess([], [war("B", "A")], "A", ["B"]).ok).toBe(true);
    expect(areAtWar([war("B", "A")], "A", "B")).toBe(true);
  });

  it("blocks when only one of several owners is closed", () => {
    const res = checkTerritoryAccess([pact("A", "B", "open_borders")], [], "A", ["B", "C"]);
    expect(res.ok).toBe(false);
    if (res.ok === false) expect(res.owner).toBe("C");
  });

  it("finds the pact in either direction", () => {
    expect(activePactBetween([pact("B", "A", "open_borders")], "A", "B", ["open_borders"])).not.toBeNull();
  });
});

describe("Phase 6 — server-side determinism", () => {
  it("returns the same positive seed for the same inputs", () => {
    const a = deterministicSeed("s", 12, "lobby", "stack");
    const b = deterministicSeed("s", 12, "lobby", "stack");
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });

  it("separates different battles", () => {
    expect(deterministicSeed("s", 12, "lobby-1")).not.toBe(deterministicSeed("s", 12, "lobby-2"));
    expect(deterministicSeed("s", 12, "lobby")).not.toBe(deterministicSeed("s", 13, "lobby"));
  });
});

describe("Jobs are real headcounts", () => {
  it("scales a labour unit to a work crew", () => {
    expect(ECONOMY.workersPerLaborUnit).toBeGreaterThanOrEqual(15);
  });

  it("puts a level-1 production centre in the tens of workers", () => {
    // Typical level-1 recipe: ~2.2 labour units per unit of output at full capacity.
    const jobs = 2.2 * ECONOMY.workersPerLaborUnit;
    expect(jobs).toBeGreaterThanOrEqual(30);
    expect(jobs).toBeLessThanOrEqual(80);
  });

  it("lets one residential quarter staff about two production centres", () => {
    const quarterInhabitants = 250; // cityDistricts: residential quarter population_capacity
    const activeShare = 0.5; // manpower.DEFAULT_ACTIVE_POP_RATIO
    const centres = (quarterInhabitants * activeShare) / (2.2 * ECONOMY.workersPerLaborUnit);
    expect(centres).toBeGreaterThanOrEqual(1.5);
    expect(centres).toBeLessThanOrEqual(3.5);
  });

  it("keeps settlement housing tiers monotonic", () => {
    expect(BASE_HOUSING.HAMLET).toBeLessThan(BASE_HOUSING.TOWNSHIP);
    expect(BASE_HOUSING.TOWNSHIP).toBeLessThan(BASE_HOUSING.CITY);
    expect(BASE_HOUSING.CITY).toBeLessThan(BASE_HOUSING.POLIS);
  });
});
