import { describe, expect, it } from "vitest";
import { walledUrbanParcels } from "@/lib/cityWalls";

describe("city rampart footprint", () => {
  it("rings purchased urban plots but excludes worked territorial claims", () => {
    const parcels = [
      { id: "purchased-empty", status: "claimed", claim_kind: null },
      { id: "purchased-built", status: "occupied", claim_kind: "urban" as const },
      { id: "worked-field", status: "claimed", claim_kind: "worked" as const },
      { id: "worked-mine", status: "occupied", claim_kind: "worked" as const },
    ];

    expect(walledUrbanParcels(parcels).map(parcel => parcel.id)).toEqual([
      "purchased-empty",
      "purchased-built",
    ]);
  });
});
