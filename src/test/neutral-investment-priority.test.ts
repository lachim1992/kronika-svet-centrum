import { describe, expect, it } from "vitest";
import { allocateNeutralInvestmentSlots, rankNeutralInvestmentPlans } from "../../supabase/functions/_shared/neutralInvestmentPriority";

const well = (city_id: string) => ({ city_id, action: "build_well" });
const need = (city_id: string, unmet_demand: number, basket_key = "drinking_water", turn_number = 3) =>
  ({ city_id, unmet_demand, local_demand: 10, basket_key, turn_number });

describe("neutral investment priorities", () => {
  it("places demonstrated water shortage ahead of routine construction", () => {
    const result = rankNeutralInvestmentPlans([well("a"), well("b")], [need("b", 7)], 3);
    expect(result.map(p => p.city_id)).toEqual(["b", "a"]);
  });
  it("ignores future and superseded snapshots", () => {
    const result = rankNeutralInvestmentPlans([well("a"), well("b")],
      [need("a", 10, "drinking_water", 2), need("a", 0, "drinking_water", 3),
       need("a", 10, "drinking_water", 4), need("b", 4)], 3);
    expect(result[0].city_id).toBe("b");
  });
  it("responds to the good addressed by the intended investment", () => {
    const candidates = [{city_id:"a", action:"build_structure", reason:{chosen_template:"Sýpka"}},
      {city_id:"b", action:"build_structure", reason:{chosen_template:"Uhlířství"}}];
    expect(rankNeutralInvestmentPlans(candidates,
      [need("a", 8, "staple_food"), need("b", 8, "fuel")], 3)[0].city_id).toBe("a");
  });
  it("preserves deterministic fair rotation when there is no usable data", () => {
    const input = [well("a"), well("b"), well("c"), well("d")];
    expect(rankNeutralInvestmentPlans(input, [], 1).map(p => p.city_id)).toEqual(["c","d","a","b"]);
    expect(rankNeutralInvestmentPlans(input, [], 2).map(p => p.city_id)).toEqual(["a","b","c","d"]);
  });
  it("does not infer priority from nonfinite or negative demand", () => {
    expect(rankNeutralInvestmentPlans([well("a"), well("b")],
      [{...need("a", 5), unmet_demand: "NaN"}, need("b", 1)], 3)[0].city_id).toBe("b");
  });
});

// Shared municipal action-slot allocation, tested independently from live writes.
describe("neutral municipal strategic allocation", () => {
  const candidates = [well("a"), well("b")];
  it("reserves an expansion slot only on eligible turns with an actual proposal", () => {
    expect(allocateNeutralInvestmentSlots(candidates, [], 3, true)).toEqual({
      buildingLimit: 1, expansionLimit: 1, rationale: "balanced_investment",
    });
    expect(allocateNeutralInvestmentSlots(candidates, [], 2, true).expansionLimit).toBe(0);
    expect(allocateNeutralInvestmentSlots(candidates, [], 3, false).buildingLimit).toBe(2);
  });
  it("gives both slots to essential buildings during a documented water crisis", () => {
    expect(allocateNeutralInvestmentSlots(candidates, [need("a", 8)], 3, true)).toEqual({
      buildingLimit: 2, expansionLimit: 0, rationale: "critical_needs_first",
    });
  });
  it("ignores obsolete and future deficits when assessing the current emergency", () => {
    expect(allocateNeutralInvestmentSlots(candidates,
      [need("a", 9, "drinking_water", 2), need("a", 0, "drinking_water", 3),
       need("b", 10, "drinking_water", 4)], 3, true).expansionLimit).toBe(1);
  });
  it("does not claim a food shortage is addressed by building wells", () => {
    expect(allocateNeutralInvestmentSlots(candidates,
      [need("a", 10, "staple_food")], 3, true).expansionLimit).toBe(1);
  });
});
