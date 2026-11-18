import { describe, expect, it } from "vitest";
import { ECONOMY } from "../../supabase/functions/_shared/economyConfig";
import { channelTotal } from "../../supabase/functions/_shared/demandModel";
import { produced, resolveGoodsEconomy, type City, type Good, type Snapshot } from "../../supabase/functions/_shared/goodsEconomy";

const city = (id: string, x: number): City => ({
  id, owner: "p", name: id.toUpperCase(), cell: `${x},0`, population: 1000,
  classes: { peasants: 1000 }, soldiers: 0, stability: 1, irrigation: 0, labor: {},
  market: 1, storage: 1000, admin: 0, security: 1, guild: 0,
  ideology: "open_merchant", coastal: false,
});
const fuelGood = (key: "charcoal" | "peat"): Good => ({
  key, basket: "fuel", price: 10, stage: "final", storable: true, bulk: 1, density: 30,
  perishability: 0.01, storageLoss: 0, storageCost: 0, substitutability: 1,
  strategic: 0, prestige: 0, transshipment: 0, finalUse: true, household: true,
});
const snapshot = (connected: boolean): Snapshot => ({
  turn: 1,
  cities: [city("a", 0), city("b", 1)],
  goods: [fuelGood("charcoal"), fuelGood("peat")],
  producers: [],
  opening: [{ city: "a", good: "charcoal", qty: 100, quality: 0.5 }],
  fame: [],
  edges: connected ? [{ id: "road-ab", from: "0,0", to: "1,0", cost: 1, capacity: 100, mode: "road", risk: 0, toll: 0, border: 0 }] : [],
});
const balance = (r: ReturnType<typeof resolveGoodsEconomy>, city: string, good: string) =>
  r.balances.find(b => b.city === city && b.good === good)!;
const fuelRows = (r: ReturnType<typeof resolveGoodsEconomy>, city: string) =>
  r.balances.filter(b => b.city === city && ["charcoal", "peat"].includes(b.good));
const demand = (r: ReturnType<typeof resolveGoodsEconomy>, city: string) => fuelRows(r, city).reduce((sum, b) => sum + b.demand, 0);
const consumed = (r: ReturnType<typeof resolveGoodsEconomy>, city: string) => fuelRows(r, city).reduce((sum, b) => sum + b.consumed_household + b.consumed_state, 0);
const unmet = (r: ReturnType<typeof resolveGoodsEconomy>, city: string) => fuelRows(r, city).reduce((sum, b) => sum + b.unmet_demand, 0);

describe("regional basic-need substitution", () => {
  it("physically ships surplus charcoal for unmet peat and conserves goods, reserves and demand channels", () => {
    const connected = resolveGoodsEconomy(snapshot(true));
    const disconnected = resolveGoodsEconomy(snapshot(false));
    const source = balance(connected, "a", "charcoal");
    const destination = balance(connected, "b", "charcoal");
    const peat = balance(connected, "b", "peat");
    const flows = connected.flows.filter(f => f.good === "charcoal" && f.source === "a" && f.destination === "b");
    const shipped = flows.reduce((sum, f) => sum + f.qty, 0);
    const delivered = flows.reduce((sum, f) => sum + f.delivered, 0);

    expect(flows.length).toBeGreaterThan(0);
    expect(flows.every(f => f.reason === "regional_redistribution" || f.reason === "household_consumption")).toBe(true);
    expect(flows.every(f => f.quality === 0.5)).toBe(true);
    expect(source.exported).toBeCloseTo(shipped, 9);
    expect(destination.imported).toBeCloseTo(shipped, 9); // gross credit includes recorded transport loss
    expect(destination.lost_transport).toBeCloseTo(shipped - delivered, 9);
    expect(source.exported).toBeCloseTo(delivered + destination.lost_transport, 9);
    expect(peat.unmet_demand).toBeCloseTo(0, 9);
    expect(unmet(connected, "b")).toBeLessThan(unmet(disconnected, "b"));
    expect(demand(connected, "b")).toBeCloseTo(demand(disconnected, "b"), 9);
    expect(consumed(connected, "b")).toBeCloseTo(demand(connected, "b"), 9);
    expect(consumed(connected, "b")).toBeLessThanOrEqual(demand(connected, "b") + 1e-9);

    const isolatedSource = balance(disconnected, "a", "charcoal");
    expect(source.consumed_household + source.consumed_state)
      .toBeCloseTo(isolatedSource.consumed_household + isolatedSource.consumed_state, 9);
    expect(source.stored).toBeGreaterThanOrEqual(source.demand * ECONOMY.reserveTurns - 1e-9);
    expect(connected.flows.filter(f => f.good === "charcoal" && f.source === "b")).toHaveLength(0);

    const peatDemand = connected.demand.find(d => d.city === "b" && d.good === "peat")!;
    const charcoalDemand = connected.demand.find(d => d.city === "b" && d.good === "charcoal")!;
    expect(peat.demand).toBeCloseTo(0, 9);
    expect(peatDemand.channels.household_need).toBeCloseTo(0, 9);
    expect(channelTotal(peatDemand.channels)).toBeCloseTo(peat.demand, 9);
    expect(channelTotal(charcoalDemand.channels)).toBeCloseTo(destination.demand, 9);

    for (const b of connected.balances) {
      const residual = b.opening + produced(b) + b.imported - b.exported - b.consumed_household
        - b.consumed_state - b.consumed_as_input - b.lost_spoilage - b.stored - b.capex;
      expect(Math.abs(residual), `${b.city}/${b.good}`).toBeLessThanOrEqual(1e-6);
    }
    expect(resolveGoodsEconomy(snapshot(true))).toEqual(connected);
  });

  it("transfers nothing between disconnected cities", () => {
    const out = resolveGoodsEconomy(snapshot(false));
    expect(out.flows).toHaveLength(0);
    expect(balance(out, "b", "charcoal").imported).toBe(0);
    expect(balance(out, "a", "charcoal").exported).toBe(0);
    expect(unmet(out, "b")).toBeGreaterThan(0);
    expect(consumed(out, "b")).toBe(0);
  });
});
