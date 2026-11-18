import { produced, type Balance, type Snapshot } from "../supabase/functions/_shared/goodsEconomy";
import { runJv72o7Scenarios, type JvScenario } from "../src/test/jv72o7-turn18-scenarios";

const GOODS = ["raw_grain", "flour", "baked_staples", "raw_fish", "raw_meat", "well_water", "peat", "charcoal"];
const BASKETS = ["staple_food", "drinking_water", "fuel"];
const CHAIN_RECIPES = new Set(["harvest_wheat", "harvest_barley", "mill_grain", "bake_staples"]);
const sum = (rows: any[], field: string) => rows.reduce((s, row) => s + Number(row[field] || 0), 0);
const residual = (b: Balance) => b.opening + produced(b) + b.imported - b.exported - b.consumed_household
  - b.consumed_state - b.consumed_as_input - b.lost_spoilage - b.stored - b.capex;
const cityOwner = (snapshot: Snapshot, city: string) => snapshot.cities.find(c => c.id === city)?.owner ?? "?";
const aggregateBalances = (rows: Balance[]) => ({
  opening: sum(rows, "opening"), produced: rows.reduce((s, b) => s + produced(b), 0),
  consumed_household: sum(rows, "consumed_household"), consumed_state: sum(rows, "consumed_state"),
  consumed_as_input: sum(rows, "consumed_as_input"), imported: sum(rows, "imported"), exported: sum(rows, "exported"),
  stored: sum(rows, "stored"), unmet: sum(rows, "unmet_demand"), demand: sum(rows, "demand"),
  lost_spoilage: sum(rows, "lost_spoilage"), lost_decay: sum(rows, "lost_decay"),
  lost_transport: sum(rows, "lost_transport"), lost_discard: sum(rows, "lost_discard"), capex: sum(rows, "capex"),
});

function analyze(s: JvScenario) {
  const goodBasket = new Map(s.input.goods.map(g => [g.key, g.basket]));
  const producerCity = new Map(s.input.producers.map(p => [p.id, p.city]));
  const diagnosticCity = (producer: string) => producerCity.get(producer) ?? "?";
  const cityRows = s.input.cities.map(city => {
    const labor = s.result.labor.find(l => l.city === city.id)!;
    const diagnostics = s.result.diagnostics.filter(d => diagnosticCity(d.producer) === city.id);
    const balances = s.result.balances.filter(b => b.city === city.id);
    return {
      id: city.id, name: city.name, owner: city.owner,
      population_total_with_rural: city.population, urban_population: city.urbanPopulation ?? city.population,
      rural_population: city.ruralPopulation ?? 0, classes: city.classes, urban_classes: city.urbanClasses,
      soldiers: city.soldiers, effective_active_population: labor.economically_active,
      civilian_workforce: labor.available_workforce, rural_workforce: labor.rural_available_workforce,
      rural_employed: labor.rural_employed, urban_employed: labor.employed_total,
      urban_unemployed: labor.unemployed_total, structural_unemployed: labor.structural_unemployed,
      employment_rate: labor.employment_rate, wage_rate: labor.wage_rate, labor_mobility: labor.labor_mobility,
      sectors: labor.sectors, service: labor.service,
      lines: {
        total: diagnostics.length,
        running: diagnostics.filter(d => d.realized > 1e-9).length,
        no_workers: diagnostics.filter(d => d.blocked === "no_workers").length,
        capacity_labor_or_staffing: diagnostics.filter(d => d.blocked === "capacity_labor_or_staffing").length,
        missing_recipe_inputs: diagnostics.filter(d => d.blocked === "missing_recipe_inputs").length,
        other_blocked: diagnostics.filter(d => d.blocked && !["no_workers", "capacity_labor_or_staffing", "missing_recipe_inputs"].includes(d.blocked)).length,
      },
      baskets: Object.fromEntries(BASKETS.map(basket => {
        const rows = balances.filter(b => goodBasket.get(b.good) === basket);
        const demand = sum(rows, "demand"), satisfied = sum(rows, "consumed_household") + sum(rows, "consumed_state");
        return [basket, { demand, supply_produced: rows.reduce((sum, b) => sum + produced(b), 0),
          imported: sum(rows, "imported"), satisfied, unmet: sum(rows, "unmet_demand"),
          coverage: demand > 0 ? satisfied / demand : 1, stored: sum(rows, "stored") }];
      })),
      goods: Object.fromEntries(GOODS.map(good => [good, aggregateBalances(balances.filter(b => b.good === good))])),
      storage: { capacity_rating: city.storage, ...aggregateBalances(balances) },
    };
  });
  const owners = [...new Set(s.input.cities.map(c => c.owner))].sort();
  const ownerRows = Object.fromEntries(owners.map(owner => {
    const cities = cityRows.filter(c => c.owner === owner);
    const balances = s.result.balances.filter(b => cityOwner(s.input, b.city) === owner);
    return [owner, {
      urban_population: sum(cities, "urban_population"), rural_population: sum(cities, "rural_population"),
      soldiers: sum(cities, "soldiers"), effective_active_population: sum(cities, "effective_active_population"),
      civilian_workforce: sum(cities, "civilian_workforce"), rural_workforce: sum(cities, "rural_workforce"),
      urban_employed: sum(cities, "urban_employed"), rural_employed: sum(cities, "rural_employed"),
      running_lines: sum(cities.map(c => c.lines), "running"), no_workers: sum(cities.map(c => c.lines), "no_workers"),
      capacity_labor_or_staffing: sum(cities.map(c => c.lines), "capacity_labor_or_staffing"),
      missing_recipe_inputs: sum(cities.map(c => c.lines), "missing_recipe_inputs"),
      baskets: Object.fromEntries(BASKETS.map(basket => {
        const rows = balances.filter(b => goodBasket.get(b.good) === basket);
        const demand = sum(rows, "demand"), satisfied = sum(rows, "consumed_household") + sum(rows, "consumed_state");
        return [basket, { demand, supply_produced: rows.reduce((sum, b) => sum + produced(b), 0), imported: sum(rows, "imported"),
          satisfied, unmet: sum(rows, "unmet_demand"), coverage: demand > 0 ? satisfied / demand : 1, stored: sum(rows, "stored") }];
      })),
      goods: Object.fromEntries(GOODS.map(good => [good, aggregateBalances(balances.filter(b => b.good === good))])),
    }];
  }));
  const residuals = s.result.balances.map(b => ({ city: b.city, good: b.good, residual: residual(b) }));
  return {
    name: s.name, resolverMutatedInput: s.resolverMutatedInput, caps: s.caps,
    cities: cityRows, owners: ownerRows,
    chains: s.result.diagnostics.filter(d => CHAIN_RECIPES.has(s.input.producers.find(p => p.id === d.producer)?.recipe.key ?? ""))
      .map(d => ({ ...d, city: diagnosticCity(d.producer), owner: cityOwner(s.input, diagnosticCity(d.producer)), recipe: s.input.producers.find(p => p.id === d.producer)?.recipe.key })),
    flows: s.result.flows.map(f => ({ ...f, source_owner: cityOwner(s.input, f.source), destination_owner: cityOwner(s.input, f.destination) })),
    importBlockers: s.result.importBlockers,
    industrialInputs: s.result.industrialInputs.filter(x => GOODS.includes(x.good)),
    prices: s.result.prices.filter(p => GOODS.includes(p.good)),
    conservation: { max_abs_residual: Math.max(...residuals.map(r => Math.abs(r.residual))),
      sum_abs_residual: residuals.reduce((sum, r) => sum + Math.abs(r.residual), 0), residuals },
  };
}

const scenarios = runJv72o7Scenarios();
console.log(JSON.stringify({
  metadata: {
    session: "d379caff-8992-48e2-9084-7c9d74acceb1", turn: 18,
    fixture: "src/test/fixtures/jv72o7-turn18-snapshot.json",
    fixtureSha256: "2d42f319834b09fe1cd7161830416d4c5792747f7d6a5a7dd1df5aa39980447f",
    solver: "resolveGoodsEconomy (pure, in-memory)", scenarioOrder: scenarios.map(s => s.name),
    rules: {
      actual: "unchanged snapshot",
      peacetime: "all cities.soldiers = 0",
      player_peace: "Player cities.soldiers = 0; AI unchanged",
      canonical_cap: "per owner min(actual soldiers, floor(real urban effectiveActivePop × canonical maxMobilization)); city ratios retained",
    },
  },
  scenarios: Object.fromEntries(scenarios.map(s => [s.name, analyze(s)])),
}, null, 2));
