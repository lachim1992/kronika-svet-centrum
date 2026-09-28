import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeIntercityMigration,
  splitNaturalChange,
  POPULATION_FLOOR,
  type IntercityCity,
} from "../../supabase/functions/_shared/demographics.ts";

const COMMIT = readFileSync(resolve(process.cwd(), "supabase/functions/commit-turn/index.ts"), "utf8");

const city = (over: Partial<IntercityCity> & { id: string }): IntercityCity => ({
  name: over.id,
  owner_player: "Lachim",
  population_total: 1000,
  city_stability: 70,
  famine_turn: false,
  housing_capacity: 4000,
  ...over,
});

describe("phase 3: city↔city migration conserves population", () => {
  it("moves exactly as many people out as in", () => {
    const res = computeIntercityMigration([
      city({ id: "a", city_stability: 20 }),
      city({ id: "b", city_stability: 85 }),
      city({ id: "c", city_stability: 80 }),
    ]);
    const out = Object.values(res.emigration).reduce((s, n) => s + n, 0);
    const inn = Object.values(res.immigration).reduce((s, n) => s + n, 0);
    expect(out).toBeGreaterThan(0);
    expect(out).toBe(inn);
  });

  it("is deterministic and order-independent", () => {
    const cities = [
      city({ id: "a", city_stability: 20 }),
      city({ id: "b", city_stability: 85 }),
      city({ id: "c", famine_turn: true, city_stability: 30 }),
    ];
    const first = computeIntercityMigration(cities);
    const second = computeIntercityMigration([...cities].reverse());
    expect(second.emigration).toEqual(first.emigration);
    expect(second.immigration).toEqual(first.immigration);
  });

  it("never exceeds housing headroom at the destination", () => {
    const res = computeIntercityMigration([
      city({ id: "a", city_stability: 10, population_total: 5000 }),
      city({ id: "b", city_stability: 90, population_total: 990, housing_capacity: 1000 }),
    ]);
    expect(res.immigration["b"] ?? 0).toBeLessThanOrEqual(10);
  });

  it("never pushes a source below the population floor", () => {
    const res = computeIntercityMigration([
      city({ id: "a", city_stability: 5, population_total: POPULATION_FLOOR }),
      city({ id: "b", city_stability: 95 }),
    ]);
    expect(res.emigration["a"] ?? 0).toBe(0);
  });

  it("does not move people between different realms", () => {
    const res = computeIntercityMigration([
      city({ id: "a", city_stability: 10 }),
      city({ id: "b", city_stability: 95, owner_player: "Ravens" }),
    ]);
    expect(res.flows).toHaveLength(0);
  });

  it("stable, uncrowded, well-fed realms see no forced migration", () => {
    const res = computeIntercityMigration([city({ id: "a" }), city({ id: "b" })]);
    expect(res.flows).toHaveLength(0);
  });

  it("famine and overcrowding both push people out", () => {
    const famine = computeIntercityMigration([
      city({ id: "a", famine_turn: true }),
      city({ id: "b", city_stability: 90 }),
    ]);
    const crowded = computeIntercityMigration([
      city({ id: "a", population_total: 2000, housing_capacity: 1000 }),
      city({ id: "b", city_stability: 90 }),
    ]);
    expect(famine.flows.length).toBeGreaterThan(0);
    expect(crowded.flows.length).toBeGreaterThan(0);
  });

  it("job vacancies increase pull", () => {
    const base = computeIntercityMigration([
      city({ id: "a", city_stability: 10, population_total: 4000 }),
      city({ id: "b", city_stability: 70 }),
      city({ id: "c", city_stability: 70 }),
    ]);
    const withJobs = computeIntercityMigration([
      city({ id: "a", city_stability: 10, population_total: 4000 }),
      city({ id: "b", city_stability: 70, vacancies: 400 }),
      city({ id: "c", city_stability: 70 }),
    ]);
    expect(withJobs.immigration["b"]).toBeGreaterThan(base.immigration["b"] ?? 0);
  });
});

describe("phase 3: natural change split is honest", () => {
  it("births - deaths always equals the net delta", () => {
    for (const delta of [-40, -1, 0, 7, 120]) {
      const s = splitNaturalChange(delta, { population_total: 3000, city_stability: 60 });
      expect(s.births - s.deaths).toBe(delta);
      expect(s.births).toBeGreaterThanOrEqual(0);
      expect(s.deaths).toBeGreaterThanOrEqual(0);
    }
  });

  it("famine raises deaths", () => {
    const calm = splitNaturalChange(0, { population_total: 3000, city_stability: 60 });
    const famine = splitNaturalChange(0, { population_total: 3000, city_stability: 60, famine_turn: true });
    expect(famine.deaths).toBeGreaterThan(calm.deaths);
  });
});

describe("phase 3: commit-turn ownership contract", () => {
  it("runs migration inside the canonical population writer", () => {
    expect(COMMIT).toMatch(/computeIntercityMigration\(/);
    expect(COMMIT).toMatch(/last_migration_in: immigration/);
    expect(COMMIT).toMatch(/last_migration_out: emigration/);
  });

  it("writes the population ledger only in the successful history phase", () => {
    const histIdx = COMMIT.indexOf("POPULATION HISTORY");
    expect(histIdx).toBeGreaterThan(0);
    // inside the snapshot success branch (after the stale guard)
    expect(COMMIT.indexOf("economy snapshot skipped")).toBeLessThan(histIdx);
    expect(COMMIT).toMatch(/from\("city_population_ledger"\)\s*\n?\s*\.delete\(\)/);
  });

  it("reuses the stored ledger on replay instead of recomputing", () => {
    expect(COMMIT).toMatch(/populationLedger: \(existingTick\.results as any\)\?\.populationLedger/);
  });

  it("leaves rural transfer to Phase C", () => {
    expect(COMMIT).toMatch(/local_immigration: 0, \/\/ rural → city transfer is Phase C/);
  });
});
