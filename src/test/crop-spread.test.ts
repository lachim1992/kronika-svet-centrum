import { describe, expect, it } from "vitest";
import { MATURE_TURNS, isMature, plantReason } from "../../supabase/functions/_shared/cropSpread";
import { microSiteReason } from "../../supabase/functions/_shared/microResources";
import { parcelProducers } from "../../supabase/functions/_shared/parcelEconomy";

const sq = { sub_biome: "terrace", owner_player: "A", claim_kind: "worked" };
describe("spreading crops", () => {
  it("needs a find elsewhere, own worked suitable land, not twice", () => {
    expect(plantReason("wild_grapes", sq, "A", true, false)).toBeNull();
    expect(plantReason("wild_grapes", sq, "A", false, false)).toMatch(/najít/);
    expect(plantReason("wild_grapes", { ...sq, sub_biome: "dense_forest" }, "A", true, false)).toMatch(/nehodí/);
    expect(plantReason("wild_grapes", { ...sq, owner_player: "B" }, "A", true, false)).toMatch(/obdělává/);
    expect(plantReason("wild_grapes", sq, "A", true, true)).toMatch(/roste/);
  });
  it("yields after 3 turns", () => {
    expect(MATURE_TURNS).toBe(3);
    expect(isMature(10, 12)).toBe(false);
    expect(isMature(10, 13)).toBe(true);
  });
  it("a planting confirms the vineyard site", () => {
    expect(microSiteReason(["harvest_grapes"], "terrace", "hills", [])).not.toBeNull();
    expect(microSiteReason(["harvest_grapes"], "terrace", "hills", [{ kind: "wild_grapes" }])).toBeNull();
  });
  it("an immature vineyard produces nothing", () => {
    const parcel = { id: "p", grid_x: 0, grid_y: 0, parcel_index: 0, sub_biome: "terrace", buildable: true, status: "claimed", city_id: "c", owner_player: "A", land_use: "open", capacity_slots: 2 };
    const terrain = [{ q: 0, r: 0, grid_x: 0, grid_y: 0, is_passable: true, biome_family: "hills" }];
    const recipes = new Map(["harvest_grapes", "quarry_stone", "gather_wild_seeds", "hunt_game"].map(k => [k, { recipe_key: k, output_good_key: k, output_quantity: 1, labor_cost: 1 }]));
    const sites = [{ parcelId: "p", recipeKeys: ["harvest_grapes"], level: 1, owner: "A" }];
    const run = (immature?: Set<string>) => parcelProducers([parcel], terrain, [{ id: "c", owner: "A", cell: "0,0" }], recipes, 1, {}, { sites, immature }).some(p => p.id === "parcel:p:harvest_grapes");
    expect(run()).toBe(true);
    expect(run(new Set(["p:harvest_grapes"]))).toBe(false);
  });
});
