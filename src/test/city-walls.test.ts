import { describe, expect, it } from "vitest";
import { walledUrbanParcels, type CityWallParcel } from "@/lib/cityWalls";

describe("city rampart footprint", () => {
  it("rings claimed and occupied purchased urban plots, including legacy NULL kinds", () => {
    const parcels = [
      { id: "purchased-legacy", status: "claimed", claim_kind: null },
      { id: "purchased-empty", status: "claimed", claim_kind: "urban" as const },
      { id: "purchased-built", status: "occupied", claim_kind: "urban" as const },
      { id: "not-held", status: "wild", claim_kind: "urban" as const },
    ];

    expect(walledUrbanParcels(parcels).map(parcel => parcel.id)).toEqual([
      "purchased-legacy",
      "purchased-empty",
      "purchased-built",
    ]);
  });

  it("excludes free worked territorial claims whether or not they host a rural site", () => {
    const parcels = [
      { id: "worked-field", status: "claimed", claim_kind: "worked" as const },
      { id: "worked-site-legacy", status: "occupied", claim_kind: "worked" as const },
    ];

    expect(walledUrbanParcels(parcels)).toEqual([]);
  });

  it("does not turn macro-cell or province ownership claims into a city rampart", () => {
    const purchased = [{ id: "purchased", status: "claimed", claim_kind: "urban" as const }];
    const macroAndProvinceClaims = [
      { id: "macro-claim", owner_player: "Player", grid_x: -8, grid_y: 0, province_id: "province-claim" },
      { id: "province-claim", owner_player: "Player", name: "Pouhý nárok" },
    ];
    const rows: Array<CityWallParcel & { id: string }> = [...purchased, ...macroAndProvinceClaims];

    expect(walledUrbanParcels(rows).map(parcel => parcel.id)).toEqual(["purchased"]);
  });
});
