import { describe, expect, it } from "vitest";
import { produced } from "../../supabase/functions/_shared/goodsEconomy";
import { ownerWorkforce, runJv72o7Scenarios } from "./jv72o7-turn18-scenarios";

const scenarios = runJv72o7Scenarios();
const actual = scenarios.find(s => s.name === "actual")!;
const peace = scenarios.find(s => s.name === "peacetime")!;
const capped = scenarios.find(s => s.name === "canonical_cap")!;
const owners = [...new Set(actual.input.cities.map(c => c.owner))];
const playerCityIds = new Set(actual.input.cities.filter(c => c.owner === "Player").map(c => c.id));

describe("JV72O7 committed turn-18 counterfactual invariants", () => {
  it("uses isolated clones, changes only soldiers, and the resolver does not mutate its input", () => {
    for (const s of scenarios) {
      expect(s.resolverMutatedInput).toBe(false);
      if (s.name !== "actual") expect(s.input).not.toBe(actual.input);
      const withoutSoldiers = (value: typeof s.input) => JSON.stringify({ ...value,
        cities: value.cities.map(c => ({ ...c, soldiers: 0 })) });
      expect(withoutSoldiers(s.input)).toBe(withoutSoldiers(actual.input));
    }
  });

  it("armies never create active population or push civilian/rural labour below zero", () => {
    for (const s of scenarios) {
      for (const owner of owners) {
        const wf = ownerWorkforce(s, owner);
        expect(wf.workforce).toBeGreaterThanOrEqual(0);
        expect(wf.effectiveActivePop).toBe(ownerWorkforce(actual, owner).effectiveActivePop);
      }
      for (const labor of s.result.labor) {
        expect(labor.available_workforce).toBeGreaterThanOrEqual(0);
        expect(labor.rural_available_workforce).toBeGreaterThanOrEqual(0);
        expect(labor.rural_employed).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("peacetime restores real civilian work without changing rural catchment crews", () => {
    for (const owner of owners) {
      const before = ownerWorkforce(actual, owner), after = ownerWorkforce(peace, owner);
      expect(after.workforce).toBe(after.effectiveActivePop);
      expect(after.workforce).toBeGreaterThanOrEqual(before.workforce);
    }
    expect(ownerWorkforce(peace, "Player").workforce).toBeGreaterThan(0);
    for (const city of peace.result.labor) {
      const baseline = actual.result.labor.find(l => l.city === city.city)!;
      expect(city.rural_available_workforce).toBe(baseline.rural_available_workforce);
      expect(city.rural_employed).toBe(baseline.rural_employed);
    }
    const producerCity = (s: typeof actual, producer: string) => s.input.producers.find(p => p.id === producer)?.city;
    const running = (s: typeof actual) => s.result.diagnostics.filter(d => playerCityIds.has(producerCity(s, d.producer) ?? "") && d.realized > 1e-9).length;
    const blocked = (s: typeof actual) => s.result.diagnostics.filter(d => playerCityIds.has(producerCity(s, d.producer) ?? "") && d.blocked === "no_workers").length;
    expect(peace.result.labor.filter(l => playerCityIds.has(l.city)).reduce((sum, l) => sum + l.employed_total, 0)).toBeGreaterThan(0);
    expect(running(peace)).toBeGreaterThan(running(actual));
    expect(blocked(peace)).toBeLessThan(blocked(actual));
  });

  it("canonical cap uses actual effectiveActivePop × maxMobilization for every realm", () => {
    for (const owner of owners) {
      const wf = ownerWorkforce(capped, owner), cap = capped.caps[owner];
      expect(wf.mobilized).toBeLessThanOrEqual(cap.cap + 1e-6);
      expect(wf.effectiveActivePop).toBe(cap.effectiveActivePop);
      expect(wf.maxMobilization).toBe(cap.maxMobilization);
      expect(wf.workforce).toBeGreaterThanOrEqual(wf.effectiveActivePop - cap.cap - 1e-6);
    }
  });

  it("every scenario conserves physical goods within the resolver tolerance", () => {
    for (const s of scenarios) for (const b of s.result.balances) {
      const residual = b.opening + produced(b) + b.imported - b.exported - b.consumed_household
        - b.consumed_state - b.consumed_as_input - b.lost_spoilage - b.stored - b.capex;
      expect(Math.abs(residual), `${s.name} ${b.city} ${b.good}`).toBeLessThanOrEqual(1e-6);
    }
  });
});
