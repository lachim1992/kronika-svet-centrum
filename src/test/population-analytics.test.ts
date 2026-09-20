import { describe, expect, it } from "vitest";
import { aggregatePopulationTurns, populationCauseSummary } from "@/lib/populationAnalytics";

describe("realm population analytics", () => {
  it("aggregates city ledgers by turn without inventing causes", () => {
    const rows = [
      { city_id: "a", turn_number: 4, population_before: 100, population_after: 110, births: 8, deaths: 2, local_immigration: 1, intercity_immigration: 4, emigration: 1, extraordinary_losses: 0 },
      { city_id: "b", turn_number: 4, population_before: 50, population_after: 47, births: 1, deaths: 2, local_immigration: 0, intercity_immigration: 0, emigration: 2, extraordinary_losses: 0 },
    ];
    expect(aggregatePopulationTurns(rows)).toEqual([{ turn: 4, before: 150, after: 157, births: 9, deaths: 4, localImmigration: 1, intercityImmigration: 4, emigration: 3, extraordinaryLosses: 0, net: 7 }]);
  });

  it("renders losses as negative causes", () => {
    const turn = aggregatePopulationTurns([{ city_id: "a", turn_number: 1, population_before: 20, population_after: 17, births: 0, deaths: 1, local_immigration: 0, intercity_immigration: 0, emigration: 0, extraordinary_losses: 2 }])[0];
    expect(populationCauseSummary(turn).map(item => item.value)).toEqual([0, -1, 0, 0, 0, -2]);
  });
});