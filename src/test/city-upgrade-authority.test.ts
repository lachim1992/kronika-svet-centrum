import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { availableDistrictBlueprints, districtBasketProblem, districtBlueprint } from "../../supabase/functions/_shared/cityDistricts";
import { INFRA_UPGRADES, infrastructureUpgradeQuote } from "../../supabase/functions/_shared/cityInfrastructure";
import { SETTLEMENT_UPGRADES, settlementUpgradeProblem } from "../../supabase/functions/_shared/settlementUpgrades";

describe("canonical city construction contracts", () => {
  it("parcel worlds expose housing only while legacy worlds retain production", () => {
    expect(availableDistrictBlueprints(1)).toHaveLength(4);
    expect(availableDistrictBlueprints(1).every(d => d.district_type === "residential")).toBe(true);
    expect(availableDistrictBlueprints(0)).toHaveLength(9);
  });

  it("district basket validation rejects forged and incompatible keys", () => {
    expect(districtBasketProblem(districtBlueprint("farm_belt")!, "forged_basket")).toBeTruthy();
    expect(districtBasketProblem(districtBlueprint("farm_belt")!, "tools")).toBeTruthy();
    expect(districtBasketProblem(districtBlueprint("farm_belt")!, "staple_food")).toBeNull();
    expect(districtBasketProblem(districtBlueprint("manufactory_yard")!, "staple_food")).toBeNull();
    expect(districtBasketProblem(districtBlueprint("manufactory_yard")!, "made_up")).toBeTruthy();
  });

  it("infrastructure quotes only the next sequential level and never accepts negative prices", () => {
    expect(infrastructureUpgradeQuote(INFRA_UPGRADES.irrigation, 0, 1)).toEqual({ nextLevel: 1, costGold: 20, costProduction: 25 });
    expect(infrastructureUpgradeQuote(INFRA_UPGRADES.irrigation, 1, 2)).toEqual({ nextLevel: 2, costGold: 40, costProduction: 50 });
    expect(typeof infrastructureUpgradeQuote(INFRA_UPGRADES.irrigation, 1, 4)).toBe("string");
    expect(typeof infrastructureUpgradeQuote(INFRA_UPGRADES.irrigation, 1, 0)).toBe("string");
    expect(typeof infrastructureUpgradeQuote(INFRA_UPGRADES.irrigation, 5, 6)).toBe("string");
    for (const upgrade of Object.values(INFRA_UPGRADES)) {
      expect(upgrade.maxLevel).toBe(5);
      expect(Object.values(upgrade.costPerLevel).every(cost => Number.isFinite(cost) && cost >= 0)).toBe(true);
    }
  });

  it("UI sends canonical keys, never template effects or upgrade prices", () => {
    const governance = readFileSync("src/components/city/CityGovernancePanel.tsx", "utf8");
    expect(governance).toContain("availableDistrictBlueprints(parcelEconomyVersion)");
    expect(governance).toContain("districtKey: blueprint.key");
    expect(governance).not.toContain("DISTRICT_TYPES");
    expect(governance).not.toMatch(/costGold\s*:|costProduction\s*:/);
    const settlement = readFileSync("src/components/SettlementUpgradePanel.tsx", "utf8");
    expect(settlement).toContain('commandType: "UPGRADE_SETTLEMENT"');
    expect(settlement).not.toMatch(/costs\s*:|nextSettlement\s*:/);
    const map = readFileSync("src/components/map/IsometricSquareMap.tsx", "utf8");
    expect(map).toContain("districtKey: district.key");
    expect(map).toContain("allowProductionDistricts={availableDistrictBlueprints(parcelEconomyVersion)");
  });

  it("settlement requirements come from stored city and realm values", () => {
    const hamlet = SETTLEMENT_UPGRADES.HAMLET;
    expect(settlementUpgradeProblem({ population_total: 1999, city_stability: 100, local_grain_reserve: 100 }, {}, hamlet)).toContain("2000");
    expect(settlementUpgradeProblem({ population_total: 2000, city_stability: 50, local_grain_reserve: 20 }, { gold_reserve: 0, production_reserve: 0 }, hamlet)).toBeNull();
    expect(Object.values(SETTLEMENT_UPGRADES).every(def => def.costGold >= 0 && def.costProduction >= 0)).toBe(true);
  });
});
