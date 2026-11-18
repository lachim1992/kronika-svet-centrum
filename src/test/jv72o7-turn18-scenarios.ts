import { computeWorkforceBreakdown } from "../../supabase/functions/_shared/manpower";
import { resolveGoodsEconomy, type Snapshot } from "../../supabase/functions/_shared/goodsEconomy";
import fixture from "./fixtures/jv72o7-turn18-snapshot.json";

export type JvScenarioName = "actual" | "peacetime" | "player_peace" | "canonical_cap";
export type JvScenario = {
  name: JvScenarioName;
  input: Snapshot;
  result: ReturnType<typeof resolveGoodsEconomy>;
  resolverMutatedInput: boolean;
  caps: Record<string, { soldiersBefore: number; soldiersAfter: number; effectiveActivePop: number; maxMobilization: number; cap: number }>;
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const jv72o7Turn18Snapshot = fixture as unknown as Snapshot;
const urbanRows = (cities: Snapshot["cities"]) => cities.map(c => {
  const classes = c.urbanClasses ?? c.classes;
  return {
    population_peasants: classes.peasants,
    population_burghers: classes.burghers,
    population_clerics: classes.clerics,
    population_warriors: classes.warriors,
  };
});

/** Cap each realm by its real urban effectiveActivePop × canonical maxMobilization.
 * Existing city allocation ratios are retained; no other snapshot field changes. */
export function canonicalCaps(snapshot: Snapshot) {
  const caps: JvScenario["caps"] = {};
  for (const owner of [...new Set(snapshot.cities.map(c => c.owner))].sort()) {
    const cities = snapshot.cities.filter(c => c.owner === owner);
    const soldiersBefore = cities.reduce((s, c) => s + c.soldiers, 0);
    const wf = computeWorkforceBreakdown(urbanRows(cities), 0.1,
      cities[0]?.activePopModifier ?? 0, cities[0]?.maxMobModifier ?? 0, soldiersBefore);
    const cap = Math.floor(wf.effectiveActivePop * wf.maxMobilization);
    caps[owner] = { soldiersBefore, soldiersAfter: Math.min(soldiersBefore, cap),
      effectiveActivePop: wf.effectiveActivePop, maxMobilization: wf.maxMobilization, cap };
  }
  return caps;
}

export function makeJv72o7Scenario(base: Snapshot, name: JvScenarioName): JvScenario {
  const input = clone(base);
  const caps = canonicalCaps(input);
  if (name === "peacetime") for (const c of input.cities) c.soldiers = 0;
  if (name === "player_peace") for (const c of input.cities) if (c.owner === "Player") c.soldiers = 0;
  if (name === "canonical_cap") {
    for (const owner of Object.keys(caps)) {
      const cities = input.cities.filter(c => c.owner === owner);
      const before = caps[owner].soldiersBefore;
      const scale = before > 0 ? caps[owner].soldiersAfter / before : 0;
      for (const c of cities) c.soldiers *= scale;
    }
  }
  const beforeResolve = JSON.stringify(input);
  const result = resolveGoodsEconomy(input);
  return { name, input, result, caps, resolverMutatedInput: JSON.stringify(input) !== beforeResolve };
}

export function runJv72o7Scenarios(): JvScenario[] {
  return (["actual", "peacetime", "player_peace", "canonical_cap"] as JvScenarioName[])
    .map(name => makeJv72o7Scenario(jv72o7Turn18Snapshot, name));
}

export function ownerWorkforce(scenario: JvScenario, owner: string) {
  const cities = scenario.input.cities.filter(c => c.owner === owner);
  const soldiers = cities.reduce((s, c) => s + c.soldiers, 0);
  return computeWorkforceBreakdown(urbanRows(cities), 0.1,
    cities[0]?.activePopModifier ?? 0, cities[0]?.maxMobModifier ?? 0, soldiers);
}
