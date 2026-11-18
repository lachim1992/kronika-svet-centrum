/** Stateless scenario simulations. These functions have no database client and perform no writes. */
import {
  armySoldiers, normalizeScenario, pointKey, scenarioDeposits, siteProblem, tileAt,
  type Scenario, type ScenarioArmy, type ScenarioPoint,
} from "../_shared/scenarioSandbox.ts";
import {
  autoDeploy, battleInRange, buildUnits, commandPoints, planAiOrders, resolveRound, seededRandom,
  stackOutcome, terrainOfSubBiome, validateBattlefield, type FBEvent, type FBUnit, type Terrain,
} from "../_shared/fieldBattle.ts";
import { depositKey, parcelTransport, siteSpecs, type MacroReserve } from "../_shared/ruralSites.ts";
import { parcelProducers } from "../_shared/parcelEconomy.ts";
import { RECIPES } from "../_shared/productionCatalog.ts";


export type BattleSimulationResult = {
  kind: "battle"; attackerId: string; defenderId: string; winner: string | "draw";
  rounds: number; totalMen: number; events: Array<FBEvent & { round: number }>;
  armies: Array<{ id: string; name: string; before: number; survivors: number; losses: number; morale: number }>;
};

function battlefieldBetween(a: ScenarioPoint, d: ScenarioPoint): ScenarioPoint[] {
  if (a.x === d.x && a.y === d.y) return [{ ...a }];
  const cells = [{ ...a }];
  if (a.x !== d.x && a.y !== d.y) cells.push({ x: d.x, y: a.y });
  cells.push({ ...d });
  return cells;
}

function nearestEnemy(scenario: Scenario, attacker: ScenarioArmy): ScenarioArmy | null {
  return scenario.armies
    .filter(a => a.id !== attacker.id && a.owner !== attacker.owner && battleInRange(attacker, a))
    .sort((a, b) => (Math.abs(a.x - attacker.x) + Math.abs(a.y - attacker.y)) - (Math.abs(b.x - attacker.x) + Math.abs(b.y - attacker.y)) || a.id.localeCompare(b.id))[0] ?? null;
}

export function simulateBattle(input: unknown, attackerId: string): BattleSimulationResult {
  const scenario = normalizeScenario(input);
  const attacker = scenario.armies.find(a => a.id === attackerId);
  if (!attacker) throw new Error("Vyber útočící armádu");
  const defender = nearestEnemy(scenario, attacker);
  if (!defender) throw new Error("V dosahu není žádná nepřátelská armáda");
  if (armySoldiers(attacker) <= 0 || armySoldiers(defender) <= 0) throw new Error("Obě armády musí mít vojáky");
  const field = battlefieldBetween(attacker, defender);
  const totalMen = armySoldiers(attacker) + armySoldiers(defender);
  const invalid = validateBattlefield(field, attacker, defender, totalMen);
  if (invalid) throw new Error(invalid);
  const composition = (army: ScenarioArmy) => army.composition.map(row => ({ id: row.id, unit_type: row.unit_type, manpower: row.manpower }));
  let units: FBUnit[] = [
    ...buildUnits("attacker", attacker.id, armySoldiers(attacker), composition(attacker), attacker.morale, attacker.formation),
    ...buildUnits("defender", defender.id, armySoldiers(defender), composition(defender), defender.morale, defender.formation),
  ];
  const terrainAt = (x: number, y: number): Terrain => {
    const tile = tileAt(scenario, Math.floor(x / 6), Math.floor(y / 6));
    return terrainOfSubBiome(tile?.micro[(y % 6) * 6 + (x % 6)]);
  };
  units = autoDeploy(units, "attacker", field, attacker, defender, terrainAt);
  units = autoDeploy(units, "defender", field, attacker, defender, terrainAt);
  let winner: "attacker" | "defender" | "draw" | null = null;
  let round = 0;
  const events: Array<FBEvent & { round: number }> = [];
  let meta = {};
  while (!winner && round < 40) {
    round += 1;
    const orders = [
      ...planAiOrders(units, "attacker", field, terrainAt, commandPoints(6), 1),
      ...planAiOrders(units, "defender", field, terrainAt, commandPoints(6), 1000),
    ];
    const resolved = resolveRound(units, orders, field, terrainAt, seededRandom(`${scenario.seed}:${attacker.id}:${defender.id}:${round}`), round, meta);
    units = resolved.units;
    winner = resolved.winner;
    meta = resolved.meta;
    events.push(...resolved.events.map(event => ({ ...event, round })));
  }
  const outcomes = stackOutcome(units);
  return {
    kind: "battle", attackerId: attacker.id, defenderId: defender.id,
    winner: winner === "attacker" ? attacker.id : winner === "defender" ? defender.id : "draw",
    rounds: round, totalMen, events: events.slice(0, 600),
    armies: [attacker, defender].map(army => {
      const outcome = outcomes.get(army.id);
      const before = armySoldiers(army);
      return { id: army.id, name: army.name, before, survivors: outcome?.men ?? 0, losses: outcome?.lost ?? before, morale: outcome?.morale ?? 0 };
    }),
  };
}

export type ExtractionRow = {
  siteId: string; cityId: string; cityName: string; recipe: string; good: string | null;
  capacityPerTurn: number; capacityUnits: number; jobs: number; transport: string; transportFactor: number; reason: string | null;
};
export type ExtractionSimulationResult = {
  kind: "extraction"; rows: ExtractionRow[];
  totals: Array<{ good: string; capacityPerTurn: number }>;
};

export function simulateExtraction(input: unknown): ExtractionSimulationResult {
  const scenario = normalizeScenario(input);
  const depositsByTile = scenarioDeposits(scenario);
  const recipes = new Map(RECIPES.map(recipe => [recipe.key, {
    recipe_key: recipe.key, output_good_key: recipe.output, output_quantity: recipe.qty,
    labor_cost: 1, input_items: recipe.inputs.map(input => ({ key: input.good, qty: input.qty })),
  }]));
  const rows: ExtractionRow[] = [];
  for (const city of scenario.cities) {
    const citySites = scenario.sites.filter(site => site.cityId === city.id);
    if (!citySites.length) continue;
    const deposits = new Set<string>();
    const reserves = new Map<string, MacroReserve>();
    for (const tile of scenario.tiles) {
      const generated = depositsByTile.get(pointKey(tile)) ?? [];
      for (const deposit of generated) {
        deposits.add(depositKey(city.owner, tile.x, tile.y, deposit.kind));
        if (deposit.reserve !== null) reserves.set(`${tile.x},${tile.y}|${deposit.kind}`, { reserve: deposit.reserve, grade: deposit.grade });
      }
      for (const resource of scenario.resources.filter(r => r.x === tile.x && r.y === tile.y)) {
        if (resource.kind === "iron" || resource.kind === "gold") {
          deposits.add(depositKey(city.owner, tile.x, tile.y, resource.kind));
          reserves.set(`${tile.x},${tile.y}|${resource.kind}`, { reserve: resource.amount, grade: 2 });
        }
      }
    }
    const roads = scenario.roads.map(road => ({ from: pointKey(road.from), to: pointKey(road.to), owner: road.owner }));
    const parcelMap = new Map<string, any>();
    for (const road of scenario.roads) for (const p of [road.from, road.to]) {
      parcelMap.set(`road:${pointKey(p)}`, { id: `road:${city.id}:${pointKey(p)}`, grid_x: p.x, grid_y: p.y, parcel_index: 0,
        sub_biome: tileAt(scenario, p.x, p.y)?.micro[0] ?? "grassland", buildable: true, status: "claimed", city_id: city.id,
        owner_player: city.owner, land_use: "civic", capacity_slots: 2 });
    }
    for (const site of citySites) {
      const tile = tileAt(scenario, site.x, site.y)!;
      parcelMap.set(`site:${site.id}`, { id: site.id, grid_x: site.x, grid_y: site.y, parcel_index: site.my * 6 + site.mx,
        sub_biome: tile.micro[site.my * 6 + site.mx], buildable: true, status: "claimed", city_id: city.id,
        owner_player: city.owner, land_use: "rural", capacity_slots: 2 });
    }
    parcelMap.set(`seat:${city.id}`, { id: `seat:${city.id}`, grid_x: city.x, grid_y: city.y, parcel_index: 0,
      sub_biome: tileAt(scenario, city.x, city.y)?.micro[0] ?? "grassland", buildable: true, status: "occupied", city_id: city.id,
      owner_player: city.owner, land_use: "civic", capacity_slots: 2 });
    const parcels = [...parcelMap.values()];
    const terrain = scenario.tiles.map(tile => ({ grid_x: tile.x, grid_y: tile.y, q: tile.x, r: tile.y,
      biome_family: tile.biome, is_passable: tile.biome !== "water", coastal: tile.biome === "water" }));
    const sites = citySites.map(site => ({ parcelId: site.id, recipeKeys: [site.recipe], level: site.level, owner: site.owner }));
    const producers = parcelProducers(parcels, terrain, [{ id: city.id, owner: city.owner, cell: pointKey(city) }], recipes, 1, {},
      { sites, roads, deposits, reserves });
    for (const site of citySites) {
      const recipe = recipes.get(site.recipe);
      const producer = producers.find(p => p.id === `parcel:${site.id}:${site.recipe}`);
      const tile = tileAt(scenario, site.x, site.y)!;
      const gate = siteProblem(scenario, site);
      const blocked = siteSpecs([], { parcelId: site.id, recipeKeys: [site.recipe], level: site.level, owner: site.owner }, site.x, site.y, deposits).blocked[0]?.reason;
      const transport = parcelTransport(pointKey(site), pointKey(city), roads, city.owner);
      rows.push({
        siteId: site.id, cityId: city.id, cityName: city.name, recipe: site.recipe, good: recipe?.output_good_key ?? null,
        capacityPerTurn: producer ? Math.round(producer.capacity * producer.recipe.qty * 100) / 100 : 0,
        capacityUnits: producer?.capacity ?? 0,
        jobs: producer?.jobs ?? 0, transport: (producer?.parcel as any)?.transport?.mode ?? transport.mode,
        transportFactor: (producer?.parcel as any)?.transport?.applied ?? transport.factor,
        reason: gate ?? blocked ?? (producer ? null : transport.mode === "no_road" ? "Bez dokončené cesty do města" : "Stavba nemá fyzický vstup nebo je mimo spojené území"),
      });
    }
  }
  const totals = new Map<string, number>();
  for (const row of rows) if (row.good && !row.reason) totals.set(row.good, (totals.get(row.good) ?? 0) + row.capacityPerTurn);
  return { kind: "extraction", rows, totals: [...totals.entries()].map(([good, capacityPerTurn]) => ({ good, capacityPerTurn: Math.round(capacityPerTurn * 100) / 100 })) };
}
