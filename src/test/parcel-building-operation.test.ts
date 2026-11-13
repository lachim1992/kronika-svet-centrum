import { describe, expect, it } from "vitest";
import { buildingOperationLines } from "../lib/parcelActual";

const producers = [
  { producer: "building-1:refine_gold", good: "gold_ingot" },
  { producer: "parcel:123e4567-e89b-42d3-a456-426614174000:mine_gold", good: "gold_ore" },
  { producer: "parcel:123e4567-e89b-42d3-a456-426614174000:hunt_game", good: "raw_meat" },
  { producer: "parcel:123e4567-e89b-42d3-a456-426614174001:mine_gold", good: "gold_ore" },
];

describe("building live operation", () => {
  it("reads an urban producer under its building id", () => {
    expect(buildingOperationLines(producers, { id: "building-1" }).map(p => p.good)).toEqual(["gold_ingot"]);
  });
  it("reads only the rural site's own recipes on its exact parcel, not natural or neighbouring output", () => {
    const lines = buildingOperationLines(producers, { id: "building-2", parcelId: "123e4567-e89b-42d3-a456-426614174000", recipeKeys: ["mine_gold"] });
    expect(lines).toHaveLength(1);
    expect(lines[0].good).toBe("gold_ore");
  });
});
