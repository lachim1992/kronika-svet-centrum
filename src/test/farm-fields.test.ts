import { describe, expect, it } from "vitest";
import { MAX_FARM_FIELDS, farmFieldReason, fieldBonus, type FieldParcel } from "../../supabase/functions/_shared/farmFields";
import { siteSpecs } from "../../supabase/functions/_shared/ruralSites";

const P = (id: string, gx: number, pi: number, sub = "fertile_flat", extra: Partial<FieldParcel> = {}): FieldParcel =>
  ({ id, grid_x: gx, grid_y: 0, parcel_index: pi, sub_biome: sub, city_id: "c", owner_player: "A", claim_kind: "worked", ...extra });
const farm = P("farm", 0, 0);

describe("farm fields", () => {
  it("max 8 fields per farm", () => {
    expect(MAX_FARM_FIELDS).toBe(8);
    const eight = Array.from({ length: 8 }, (_, i) => P(`f${i}`, 0, 6 + i));
    expect(farmFieldReason(farm, ["harvest_wheat"], P("x", 0, 1), eight, false)).toMatch(/8 polí/);
  });
  it("only adjacent to the farm or its field, also across the macro edge", () => {
    expect(farmFieldReason(farm, ["harvest_wheat"], P("x", 0, 1), [], false)).toBeNull();
    expect(farmFieldReason(farm, ["harvest_wheat"], P("x", 0, 2), [], false)).toMatch(/sousedit/);
    expect(farmFieldReason(farm, ["harvest_wheat"], P("x", 0, 2), [P("f", 0, 1)], false)).toBeNull();
    expect(farmFieldReason(P("e", 0, 5), ["harvest_wheat"], P("x", 1, 0), [], false)).toBeNull();
  });
  it("needs arable worked land of the same city, no building, and a farm", () => {
    expect(farmFieldReason(farm, ["harvest_wheat"], P("x", 0, 1, "dense_forest"), [], false)).toMatch(/orná/);
    expect(farmFieldReason(farm, ["harvest_wheat"], P("x", 0, 1, "fertile_flat", { city_id: "d" }), [], false)).toMatch(/stejným městem/);
    expect(farmFieldReason(farm, ["harvest_wheat"], P("x", 0, 1), [], true)).toMatch(/stavba/);
    expect(farmFieldReason(farm, ["quarry_stone"], P("x", 0, 1), [], false)).toMatch(/farmě/);
  });
  it("each field adds 25 % farm capacity and 3 jobs", () => {
    expect(fieldBonus(4)).toEqual({ capacityFactor: 2, extraJobs: 12 });
    const base = siteSpecs([], { parcelId: "farm", recipeKeys: ["harvest_wheat"], level: 1, owner: "A" }, 0, 0, undefined).specs[0];
    const four = siteSpecs([], { parcelId: "farm", recipeKeys: ["harvest_wheat"], level: 1, owner: "A", fields: 4 }, 0, 0, undefined).specs[0];
    expect(four.capacity).toBeCloseTo(base.capacity * 2);
    expect(four.jobs).toBe(base.jobs + 12);
  });
});
