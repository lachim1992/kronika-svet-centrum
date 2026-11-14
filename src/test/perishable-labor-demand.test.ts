import { describe, expect, it } from "vitest";
import { resolveGoodsEconomy, type City, type Good, type Producer, type Snapshot } from "../../supabase/functions/_shared/goodsEconomy";

const good = (key: string, basket: string, storable: boolean, stage = "raw"): Good => ({
  key, basket, price: 1, stage, storable, bulk: 1, density: 3, perishability: 0,
  storageLoss: 0, storageCost: 0, substitutability: 1, strategic: 0, prestige: 0,
  transshipment: 0, finalUse: stage !== "intermediate", household: basket === "staple_food",
});

const city = (id: string, x: number, population = 1000): City => ({
  id, owner: "Player", name: id, cell: `${x},0`, population,
  classes: { peasants: population }, soldiers: 0, stability: 1, irrigation: 0,
  labor: {}, market: 2, storage: 10, admin: 0, security: 1, guild: 0,
  ideology: "open_merchant", coastal: true,
});

const producer = (id: string, goodKey: string, capacity: number, jobs: number,
  inputs: { good: string; qty: number }[] = []): Producer => ({
  id, city: "town", channel: "facility", capacity, jobs,
  recipe: { key: id, good: goodKey, qty: 1, inputs, labor: 1, quality: 0, minQuality: 0 },
  allocation: 1, staffing: 1, logistics: 1, mastery: 1,
  source: inputs.length === 0, distinctive: false,
});

const overfishedTown = (): Snapshot => ({
  turn: 7,
  cities: [city("town", 0)],
  goods: [
    good("raw_fish", "staple_food", false),
    good("raw_grain", "staple_food", true),
    good("flour", "staple_food", true, "intermediate"),
    good("baked_staples", "staple_food", true, "final"),
  ],
  producers: [
    producer("fishery", "raw_fish", 30, 300),
    producer("farm", "raw_grain", 10, 50),
    producer("mill", "flour", 6, 50, [{ good: "raw_grain", qty: 1 }]),
    producer("bakery", "baked_staples", 6, 100, [{ good: "flour", qty: 1 }]),
  ],
  edges: [], opening: [], fame: [],
});

const diagnostic = (result: ReturnType<typeof resolveGoodsEconomy>, id: string) =>
  result.diagnostics.find((row) => row.producer === id)!;

describe("demand-aware labour for non-storable subsistence sources", () => {
  it("does not let unavoidable fish discard crowd out the existing mill and bakery", () => {
    const result = resolveGoodsEconomy(overfishedTown());
    const fish = diagnostic(result, "fishery");
    const mill = diagnostic(result, "mill");
    const bakery = diagnostic(result, "bakery");
    const fishBalance = result.balances.find((row) => row.city === "town" && row.good === "raw_fish")!;

    expect(fishBalance.lost_discard).toBeLessThan(3);
    expect(fish.realized).toBeLessThan(8);
    expect(mill.staffing_ratio).toBeCloseTo(1, 7);
    expect(bakery.staffing_ratio).toBeCloseTo(1, 7);
    expect(result.cityAccounts[0].physical_need_coverage).toBeCloseTo(1, 7);
    expect(fish.realized / fish.employed!).toBeCloseTo(30 / 300, 7);
    expect(result.labor[0].employed_total).toBeLessThanOrEqual(result.labor[0].available_workforce + 1e-7);
    expect(result.labor[0].perishable_demand_limited_jobs).toBeGreaterThan(0);
    expect(result.labor[0].structural_unemployed!).toBeLessThanOrEqual(
      result.labor[0].vacancies_total - result.labor[0].perishable_demand_limited_jobs! + 1e-7,
    );
  });

  it("keeps a bounded physical surplus available for a real food shipment", () => {
    const snapshot = overfishedTown();
    snapshot.cities = [city("town", 0, 100), { ...city("buyer", 1, 100), owner: "Player" }];
    snapshot.producers = [{ ...producer("fishery", "raw_fish", 3, 20) }];
    snapshot.goods = [good("raw_fish", "staple_food", false)];
    snapshot.edges = [{ id: "road", from: "0,0", to: "1,0", cost: 0.01, capacity: 20, mode: "road", risk: 0, toll: 0, border: 0 }];

    const result = resolveGoodsEconomy(snapshot);
    const shipment = result.flows.find((flow) => flow.good === "raw_fish" && flow.destination === "buyer");
    expect(shipment?.delivered).toBeGreaterThan(0);
    expect(result.balances.find((row) => row.city === "town" && row.good === "raw_fish")!.lost_discard).toBeLessThan(0.3);
  });
});
