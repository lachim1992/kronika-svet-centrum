import { describe, expect, it } from "vitest";
import { parcelBenefit } from "@/lib/parcelDisplay";
import { POPULATION_PER_SLOT } from "@/lib/tileParcels";
import type { ParcelActual } from "@/lib/parcelActual";

const actual = (good: string, realized: number): ParcelActual => ({
  producer: `parcel:00000000-0000-0000-0000-000000000000:${good}`,
  recipe: good, good, realized, potential: realized, employed: 1, jobs: 1, reservoir: null, reason: null,
});

describe("parcel benefit labels", () => {
  it("converts every urban building slot to the canonical housing capacity", () => {
    expect(parcelBenefit({ capacity_slots: 3, claim_kind: "urban" }, [])).toMatchObject({
      kind: "housing", value: 3 * POPULATION_PER_SLOT, label: "+270", detail: "míst k bydlení",
    });
  });

  it("shows the largest actual committed yield without adding different goods together", () => {
    const benefit = parcelBenefit({ capacity_slots: 2, claim_kind: "worked" }, [actual("water", 0.4), actual("raw_grain", 1.25)]);
    expect(benefit).toMatchObject({ kind: "yield", value: 1.25, label: "+1,25" });
    expect(benefit.detail).toContain("raw_grain");
    expect(benefit.detail).toContain("další výnosy");
  });

  it("never turns an unreported worked parcel into housing or invented production", () => {
    expect(parcelBenefit({ capacity_slots: 3, claim_kind: "worked" }, undefined)).toMatchObject({ kind: "yield", value: 0, label: "+0" });
  });
});
