import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BIOME_CAPACITY,
  RURAL_MOBILE_SHARE,
  carryingCapacityForCell,
  cellNoise,
  ruralPopulationForCell,
  ruralPopulationForWorld,
  stableHash,
  type RuralCell,
} from "../../supabase/functions/_shared/ruralPopulation";

const fn = (p: string) => readFileSync(join(process.cwd(), "supabase/functions", p), "utf8");

const cell = (over: Partial<RuralCell> = {}): RuralCell => ({
  q: 3,
  r: -2,
  seed: "cell-seed-1",
  is_passable: true,
  biome_family: "grassland",
  moisture_band: 2,
  temp_band: 2,
  mean_height: 0.2,
  forest_density: 0.1,
  coastal: false,
  has_river: false,
  movement_cost: 1,
  access_score: 0.5,
  ...over,
});

const SEED = "world-seed-A";

describe("Phase B — deterministic rural population (shadow)", () => {
  it("is fully deterministic for the same seed and cell", () => {
    const a = ruralPopulationForCell(SEED, cell());
    const b = ruralPopulationForCell(SEED, cell());
    expect(a).toEqual(b);
    expect(stableHash("abc")).toBe(stableHash("abc"));
    expect(cellNoise(SEED, cell())).toBe(cellNoise(SEED, cell()));
  });

  it("changes with the world seed but never randomly", () => {
    const a = ruralPopulationForCell(SEED, cell());
    const b = ruralPopulationForCell("world-seed-B", cell());
    expect(a).not.toEqual(b);
    // repeated evaluation of the alternative seed is still stable
    expect(ruralPopulationForCell("world-seed-B", cell())).toEqual(b);
  });

  it("yields zero on impassable and water cells", () => {
    expect(carryingCapacityForCell(SEED, cell({ is_passable: false }))).toBe(0);
    expect(carryingCapacityForCell(SEED, cell({ biome_family: "ocean" }))).toBe(0);
    expect(carryingCapacityForCell(SEED, cell({ biome_family: "glacier" }))).toBe(0);
  });

  it("never produces negative or over-capacity population", () => {
    const variants: Partial<RuralCell>[] = [
      {}, { mean_height: 1 }, { moisture_band: 0 }, { moisture_band: 4 }, { temp_band: 0 },
      { temp_band: 4 }, { forest_density: 1 }, { movement_cost: 6 }, { access_score: 0 },
      { biome_family: "desert" }, { biome_family: "mountain" }, { biome_family: "unknown-biome" },
    ];
    for (const v of variants) {
      const row = ruralPopulationForCell(SEED, cell(v));
      expect(row.carrying_capacity).toBeGreaterThanOrEqual(0);
      expect(row.rural_population).toBeGreaterThanOrEqual(0);
      expect(row.rural_population).toBeLessThanOrEqual(row.carrying_capacity);
      expect(row.mobile_population).toBeLessThanOrEqual(row.rural_population);
    }
  });

  it("keeps the mobile pool a small share of rural inhabitants", () => {
    const row = ruralPopulationForCell(SEED, cell({ biome_family: "plains" }));
    expect(row.mobile_population).toBe(Math.round(row.rural_population * RURAL_MOBILE_SHARE));
    expect(RURAL_MOBILE_SHARE).toBeLessThan(0.2);

  });

  it("rewards rivers, coasts and fertile ground over barren ground", () => {
    const plain = carryingCapacityForCell(SEED, cell());
    expect(carryingCapacityForCell(SEED, cell({ has_river: true }))).toBeGreaterThan(plain);
    expect(carryingCapacityForCell(SEED, cell({ coastal: true }))).toBeGreaterThan(plain);
    expect(carryingCapacityForCell(SEED, cell({ biome_family: "desert" }))).toBeLessThan(plain);
    expect(carryingCapacityForCell(SEED, cell({ mean_height: 0.9 }))).toBeLessThan(plain);
    expect(BIOME_CAPACITY.grassland).toBeGreaterThan(BIOME_CAPACITY.tundra);
  });

  it("is order-independent across a whole world", () => {
    const cells = [
      cell({ q: 0, r: 0, seed: "s0" }),
      cell({ q: 1, r: 4, seed: "s1", has_river: true }),
      cell({ q: -3, r: 2, seed: "s2", biome_family: "forest" }),
      cell({ q: 2, r: 2, seed: "s3", is_passable: false }),
    ];
    const a = ruralPopulationForWorld(SEED, cells);
    const b = ruralPopulationForWorld(SEED, [...cells].reverse());
    expect(a).toEqual(b);
    // impassable cell is dropped, never stored as an empty row
    expect(a.some((r) => r.q === 2 && r.r === 2)).toBe(false);
  });

  it("contains no randomness in the derivation", () => {
    const src = fn("_shared/ruralPopulation.ts");
    expect(src).not.toContain("Math.random");
    expect(src).not.toContain("Date.now");
  });

  it("the shadow writer touches only hex_population", () => {
    const src = fn("compute-rural-population/index.ts");
    expect(src).not.toContain("Math.random");
    for (const forbidden of [
      "realm_resources", "gold_reserve", "city_market_baskets", "demand_baskets",
      "trade_flows", "basket_trade_flows", "province_nodes", "game_events",
      "world_events", "province_control_snapshots",
    ]) {
      expect(src).not.toContain(forbidden);
    }
    // it must not write to cities at all
    expect(src).not.toMatch(/from\("cities"\)/);
    expect(src).toMatch(/from\("hex_population"\)\s*\.upsert/);
  });

  it("stays out of the canonical turn pipeline", () => {
    for (const f of ["commit-turn/index.ts", "process-turn/index.ts", "refresh-economy/index.ts", "world-tick/index.ts"]) {
      expect(fn(f)).not.toContain("compute-rural-population");
    }
  });
});
