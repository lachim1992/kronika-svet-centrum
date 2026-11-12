import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sanitizeRegionName, terrainReason, workedQuota } from "../../supabase/functions/_shared/terrainSuitability";

const src = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

describe("physical town parcels: bought urban rights versus worked hinterland", () => {
  it("one paid urban plot permits one separate utilized plot, never recursively", () => {
    const bought = Array.from({ length: 8 }, () => ({ status: "claimed", claim_kind: null }));
    const first = workedQuota(bought);
    expect(first).toEqual({ urban: 8, worked: 0, available: 8 });
    const withFive = bought.concat(Array.from({ length: 5 }, () => ({ status: "claimed", claim_kind: "worked" })));
    expect(workedQuota(withFive)).toEqual({ urban: 8, worked: 5, available: 3 });
    const full = bought.concat(Array.from({ length: 8 }, () => ({ status: "claimed", claim_kind: "worked" })));
    expect(workedQuota(full)).toEqual({ urban: 8, worked: 8, available: 0 });
    expect(workedQuota([...full, { status: "wild", claim_kind: "worked" }]).available).toBe(0);
    const converted = full.map((p, i) => i === 8 ? { status: "claimed", claim_kind: "urban" } : p);
    expect(workedQuota(converted)).toEqual({ urban: 9, worked: 7, available: 2 });
  });

  it("names are Unicode friendly, normalized and cannot become markup", () => {
    expect(sanitizeRegionName("  Temný    háj ")).toBe("Temný háj");
    expect(sanitizeRegionName("Zlaté hory")).toBe("Zlaté hory");
    expect(sanitizeRegionName("<script>alert(1)</script>")).toBeNull();
    expect(sanitizeRegionName("a")).toBeNull();
    expect(sanitizeRegionName("Ž".repeat(49))).toBeNull();
  });

  it("terrain suitability distinguishes source land from factory placement", () => {
    expect(terrainReason(["fell_timber"], "dense_forest")).toBeNull();
    expect(terrainReason(["fell_timber"], "fertile_flat")).toMatch(/les/);
    expect(terrainReason(["quarry_stone"], "hillock")).toBeNull();
    expect(terrainReason(["quarry_stone"], "open_water")).toMatch(/skalnatý/);
    expect(terrainReason(["harvest_wheat"], "grassland")).toBeNull();
    expect(terrainReason(["harvest_wheat"], "steep_slope")).toMatch(/louka/);
    expect(terrainReason(["saw_timber"], "fertile_flat")).toBeNull();
  });

  it("server never auto-selects worked plots for construction or housing", () => {
    const commands = src("supabase/functions/command-dispatch/index.ts");
    const seat = src("supabase/functions/_shared/citySeat.ts");
    expect(commands).toContain('.or("claim_kind.is.null,claim_kind.eq.urban")');
    expect(commands).toContain('if (parcel.claim_kind === "worked")');
    expect(seat).toContain('.or("claim_kind.is.null,claim_kind.eq.urban")');
    expect(seat).toContain('row.claim_kind !== "worked"');
  });

  it("paid urban purchase locks both land and money in one database transaction", () => {
    const migration = src("drizzle/migrations/0016_atomic_urban_parcel_purchase.sql");
    const commands = src("supabase/functions/command-dispatch/index.ts");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("gold_reserve=gold_reserve-price_gold");
    expect(migration).toContain("production_reserve=production_reserve-price_production");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.buy_city_parcel");
    expect(commands).toContain('supabase.rpc("buy_city_parcel"');
    const start = commands.indexOf("async function executeClaimTileParcel(");
    const end = commands.indexOf("/** Canonical subnode definitions", start);
    expect(commands.slice(start,end)).not.toContain('.from("realm_resources").update(');
  });

  it("worked claim is an atomic quota-checked database operation", () => {
    const migration = src("drizzle/migrations/0015_parcel_worked_claims_and_names.sql");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("worked>=urban");
    expect(migration).toContain("REVOKE ALL");
    expect(migration).toContain("claim_worked_parcel");
  });
});
