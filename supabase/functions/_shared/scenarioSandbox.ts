/** Isolated, free scenario-editor model. No session ids and no live-game writes. */
import { generateMacroDeposits, goldVeinCells, type Deposit } from "./geology.ts";
import {
  MICRO_RESOURCE_LABEL,
  certainMicroResources,
  microResourceProbability,
  microSiteReason,
  type MicroResourceKind,
} from "./microResources.ts";
import type { Formation, UnitType } from "./fieldBattle.ts";

export type ScenarioPoint = { x: number; y: number };
export type ScenarioBiome = "plains" | "forest" | "hills" | "mountain" | "water" | "desert" | "swamp";
export type ScenarioTile = ScenarioPoint & { biome: ScenarioBiome; micro: string[] };
export type ScenarioComposition = { id: string; unit_type: UnitType; manpower: number };
export type ScenarioCity = { id: string; name: string; owner: string; population: number } & ScenarioPoint;
export type ScenarioArmy = {
  id: string; name: string; owner: string; morale: number; formation: Formation;
  composition: ScenarioComposition[];
} & ScenarioPoint;
export type ScenarioRoad = { id: string; owner: string; level: number; from: ScenarioPoint; to: ScenarioPoint };
export type ScenarioResource = {
  id: string; kind: MicroResourceKind; amount: number; mx: number; my: number;
} & ScenarioPoint;
export type ScenarioSite = {
  id: string; cityId: string; owner: string; recipe: string; level: number; mx: number; my: number;
} & ScenarioPoint;
export type Scenario = {
  version: 1; name: string; seed: string; width: number; height: number;
  tiles: ScenarioTile[]; cities: ScenarioCity[]; armies: ScenarioArmy[]; roads: ScenarioRoad[];
  resources: ScenarioResource[]; sites: ScenarioSite[];
};

export const SCENARIO_BIOMES: Record<ScenarioBiome, { label: string; micro: string[] }> = {
  plains: { label: "Roviny", micro: ["grassland", "fertile_flat", "clearing", "fertile_flat", "grassland", "sheltered_hollow"] },
  forest: { label: "Les", micro: ["dense_forest", "ridge_woods", "clearing", "dense_forest", "dense_forest", "ridge_woods"] },
  hills: { label: "Kopce", micro: ["hillock", "terrace", "saddle", "hillock", "sheltered_hollow", "hillock"] },
  mountain: { label: "Hory", micro: ["cliff_edge", "steep_slope", "permafrost_rise", "saddle", "cliff_edge", "steep_slope"] },
  water: { label: "Voda", micro: ["open_water", "open_water", "river_channel", "open_water", "open_water", "open_water"] },
  desert: { label: "Poušť", micro: ["dune", "dune", "dune", "dune", "dune", "dune"] },
  swamp: { label: "Bažiny", micro: ["boggy_dip", "reed_marsh", "fertile_silt", "boggy_dip", "reed_marsh", "creek_bank"] },
};

export const MICRO_BIOME_LABEL: Record<string, string> = {
  grassland: "Travnatá rovina", fertile_flat: "Úrodná rovina", clearing: "Mýtina", fertile_silt: "Úrodný nános",
  terrace: "Terasa", sheltered_hollow: "Chráněná kotlina", creek_bank: "Břeh potoka", raised_bank: "Vyvýšený břeh",
  hillock: "Kopec", saddle: "Sedlo", cliff_edge: "Útes", steep_slope: "Strmý svah", permafrost_rise: "Zmrzlá vyvýšenina",
  dense_forest: "Hustý les", ridge_woods: "Hřebenový les", boggy_dip: "Bažinatá sníženina", reed_marsh: "Rákosí",
  shore: "Mořský břeh", harbour_flat: "Přístavní rovina", dune: "Duna", open_water: "Otevřená voda", river_channel: "Říční koryto",
};

export const SITE_OPTIONS: Record<string, { label: string; resource: MicroResourceKind }> = {
  harvest_wheat: { label: "Obilná farma", resource: "grain" },
  fell_timber: { label: "Dřevorubecký tábor", resource: "timber" },
  quarry_stone: { label: "Kamenolom", resource: "stone" },
  mine_iron: { label: "Železný důl", resource: "iron" },
  mine_gold: { label: "Zlatý důl", resource: "gold" },
  harvest_grapes: { label: "Vinice", resource: "wild_grapes" },
  cut_peat: { label: "Těžba rašeliny", resource: "peat" },
  catch_fish: { label: "Rybářská osada", resource: "fish" },
};

export const cloneScenario = (scenario: Scenario): Scenario => JSON.parse(JSON.stringify(scenario)) as Scenario;
export const pointKey = (p: ScenarioPoint) => `${p.x},${p.y}`;
export const microKey = (p: ScenarioPoint, mx: number, my: number) => `${p.x},${p.y}:${mx},${my}`;
export const armySoldiers = (army: ScenarioArmy) => army.composition.reduce((sum, row) => sum + Math.max(0, row.manpower), 0);
export const tileAt = (scenario: Scenario, x: number, y: number) => scenario.tiles.find(t => t.x === x && t.y === y);

function makeTile(x: number, y: number, biome: ScenarioBiome = "plains"): ScenarioTile {
  const variants = SCENARIO_BIOMES[biome].micro;
  return { x, y, biome, micro: Array.from({ length: 36 }, (_, i) => variants[(i + x * 3 + y * 5) % variants.length]) };
}

export function createEmptyScenario(width = 10, height = 10, seed = "CHRONICLE-SANDBOX"): Scenario {
  const w = Math.max(4, Math.min(20, Math.floor(width)));
  const h = Math.max(4, Math.min(20, Math.floor(height)));
  return {
    version: 1, name: "Nový scénář", seed: seed || "CHRONICLE-SANDBOX", width: w, height: h,
    tiles: Array.from({ length: w * h }, (_, i) => makeTile(i % w, Math.floor(i / w))),
    cities: [], armies: [], roads: [], resources: [], sites: [],
  };
}

export function paintBiome(scenario: Scenario, x: number, y: number, biome: ScenarioBiome, brush = 1): Scenario {
  const next = cloneScenario(scenario);
  const radius = Math.max(0, Math.min(2, brush - 1));
  next.tiles = next.tiles.map(tile => {
    if (Math.abs(tile.x - x) + Math.abs(tile.y - y) > radius) return tile;
    return makeTile(tile.x, tile.y, biome);
  });
  return next;
}

export function createStarterScenario(): Scenario {
  let scenario = createEmptyScenario(10, 10, "ZLATY-BROD-01");
  scenario.name = "Zkušební údolí";
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    if ((x >= 6 && y <= 4) || (x === 5 && y <= 2)) scenario = paintBiome(scenario, x, y, x >= 8 ? "mountain" : "hills");
    if ((x <= 3 && y >= 6) || (x === 4 && y >= 8)) scenario = paintBiome(scenario, x, y, "forest");
    if (x === 4 && y >= 3 && y <= 6) scenario = paintBiome(scenario, x, y, "water");
  }
  scenario.cities = [
    { id: "city-west", name: "Zlatý Brod", owner: "Hráč", population: 4200, x: 2, y: 4 },
    { id: "city-east", name: "Černá Stráž", owner: "Frakce 1", population: 3600, x: 7, y: 5 },
  ];
  scenario.armies = [
    { id: "army-west", name: "Brodecká legie", owner: "Hráč", morale: 75, formation: "line", x: 2, y: 2,
      composition: [
        { id: "west-swords", unit_type: "SWORDSMEN", manpower: 400 },
        { id: "west-spears", unit_type: "SPEARMEN", manpower: 400 },
        { id: "west-archers", unit_type: "ARCHERS", manpower: 200 },
      ] },
    { id: "army-east", name: "Černý šik", owner: "Frakce 1", morale: 70, formation: "shieldwall", x: 3, y: 2,
      composition: [
        { id: "east-spears", unit_type: "SPEARMEN", manpower: 600 },
        { id: "east-archers", unit_type: "ARCHERS", manpower: 200 },
        { id: "east-militia", unit_type: "MILITIA", manpower: 200 },
      ] },
  ];
  scenario.roads = [
    { id: "road-0", owner: "Hráč", level: 1, from: { x: 2, y: 4 }, to: { x: 3, y: 4 } },
    { id: "road-1", owner: "Hráč", level: 1, from: { x: 3, y: 4 }, to: { x: 4, y: 4 } },
  ];
  scenario.resources = [{ id: "resource-grain", kind: "grain", amount: 500, x: 2, y: 4, mx: 1, my: 1 }];
  scenario.sites = [{ id: "site-farm", cityId: "city-west", owner: "Hráč", recipe: "harvest_wheat", level: 1, x: 2, y: 4, mx: 1, my: 1 }];
  return scenario;
}

export function cityProblem(scenario: Scenario, p: ScenarioPoint, ignoreId?: string): string | null {
  const tile = tileAt(scenario, p.x, p.y);
  if (!tile) return "Město je mimo mapu";
  if (tile.biome === "water") return "Město nelze postavit na vodě";
  if (scenario.cities.some(c => c.id !== ignoreId && c.x === p.x && c.y === p.y)) return "Na poli už stojí město";
  return null;
}

export function armyProblem(scenario: Scenario, p: ScenarioPoint): string | null {
  const tile = tileAt(scenario, p.x, p.y);
  if (!tile) return "Armáda je mimo mapu";
  if (tile.biome === "water") return "Armádu nelze umístit na vodu";
  if (scenario.armies.some(a => a.x === p.x && a.y === p.y)) return "Na poli už stojí armáda";
  return null;
}

export function roadProblem(scenario: Scenario, from: ScenarioPoint, to: ScenarioPoint): string | null {
  if (!tileAt(scenario, from.x, from.y) || !tileAt(scenario, to.x, to.y)) return "Cesta je mimo mapu";
  if (Math.abs(from.x - to.x) + Math.abs(from.y - to.y) !== 1) return "Cesta musí spojovat sousední pole stranou";
  if (scenario.roads.some(r => (pointKey(r.from) === pointKey(from) && pointKey(r.to) === pointKey(to))
    || (pointKey(r.from) === pointKey(to) && pointKey(r.to) === pointKey(from)))) return "Cesta už existuje";
  return null;
}

export function siteProblem(scenario: Scenario, site: Pick<ScenarioSite, "x" | "y" | "mx" | "my" | "recipe" | "cityId">): string | null {
  const tile = tileAt(scenario, site.x, site.y);
  if (!tile || site.mx < 0 || site.mx > 5 || site.my < 0 || site.my > 5) return "Těžební stavba je mimo mapu";
  if (!scenario.cities.some(c => c.id === site.cityId)) return "Nejdřív umísti město, ke kterému stavba patří";
  if (!SITE_OPTIONS[site.recipe]) return "Neznámý typ těžební stavby";
  const subBiome = tile.micro[site.my * 6 + site.mx];
  const confirmed = scenario.resources.filter(r => r.x === site.x && r.y === site.y && r.mx === site.mx && r.my === site.my);
  return microSiteReason([site.recipe], subBiome, tile.biome, confirmed);
}

export function scenarioDeposits(scenario: Scenario): Map<string, Deposit[]> {
  const goldVeins = goldVeinCells(scenario.seed, scenario.tiles.map(t => ({ x: t.x, y: t.y, biome_family: t.biome })));
  const out = new Map<string, Deposit[]>();
  for (const tile of scenario.tiles) {
    out.set(pointKey(tile), generateMacroDeposits(scenario.seed, tile.x, tile.y, {
      biome_family: tile.biome,
      mean_height: tile.biome === "mountain" ? 90 : tile.biome === "hills" ? 55 : 15,
      is_passable: tile.biome !== "water",
    }, goldVeins));
  }
  return out;
}

export function prospectProbability(scenario: Scenario, tile: ScenarioTile, microIndex: number,
  kind: MicroResourceKind, deposits: Map<string, Deposit[]>): number {
  return microResourceProbability(kind, tile.micro[microIndex], tile.biome, deposits.get(pointKey(tile)) ?? []);
}

export function knownResourcesAt(scenario: Scenario, tile: ScenarioTile, microIndex: number): MicroResourceKind[] {
  const certain = certainMicroResources(tile.micro[microIndex], tile.biome);
  const placed = scenario.resources.filter(r => r.x === tile.x && r.y === tile.y && r.my * 6 + r.mx === microIndex).map(r => r.kind);
  return [...new Set([...certain, ...placed])];
}

export function resourceLabel(kind: MicroResourceKind): string {
  return MICRO_RESOURCE_LABEL[kind];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Import/API boundary: bounded sizes and complete 6×6 terrain, never arbitrary unbounded JSON. */
export function normalizeScenario(value: unknown): Scenario {
  assert(value && typeof value === "object", "Scénář není objekt");
  const input = value as Partial<Scenario>;
  assert(input.version === 1, "Nepodporovaná verze scénáře");
  assert(typeof input.name === "string" && input.name.trim().length > 0 && input.name.length <= 80, "Neplatný název scénáře");
  assert(typeof input.seed === "string" && input.seed.length <= 80, "Neplatné semínko scénáře");
  assert(Number.isInteger(input.width) && Number.isInteger(input.height), "Neplatná velikost mapy");
  const width = input.width!, height = input.height!;
  assert(width >= 4 && width <= 20 && height >= 4 && height <= 20, "Mapa musí mít 4–20 polí v každé ose");
  for (const key of ["tiles", "cities", "armies", "roads", "resources", "sites"] as const) assert(Array.isArray(input[key]), `Chybí ${key}`);
  assert(input.tiles!.length === width * height, "Počet polí nesouhlasí s velikostí mapy");
  assert(input.cities!.length <= 100 && input.armies!.length <= 100 && input.roads!.length <= 1200, "Příliš mnoho objektů");
  assert(input.resources!.length <= 5000 && input.sites!.length <= 2000, "Příliš mnoho mikro objektů");
  const tiles = input.tiles!.map(tile => {
    assert(Number.isInteger(tile.x) && Number.isInteger(tile.y) && tile.x >= 0 && tile.x < width && tile.y >= 0 && tile.y < height, "Neplatné pole");
    assert(tile.biome in SCENARIO_BIOMES && Array.isArray(tile.micro) && tile.micro.length === 36, "Pole musí mít 36 mikropolíček");
    assert(tile.micro.every(m => typeof m === "string" && m.length <= 40), "Neplatný mikrobiom");
    return { x: tile.x, y: tile.y, biome: tile.biome, micro: [...tile.micro] };
  });
  const point = (p: ScenarioPoint) => {
    assert(p && Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < width && p.y >= 0 && p.y < height, "Objekt je mimo mapu");
    return { x: p.x, y: p.y };
  };
  const micro = (mx: number, my: number) => assert(Number.isInteger(mx) && Number.isInteger(my) && mx >= 0 && mx <= 5 && my >= 0 && my <= 5, "Neplatné mikropolíčko");
  const id = (v: unknown) => { assert(typeof v === "string" && v.length > 0 && v.length <= 100, "Neplatné ID"); return v; };
  const scenario: Scenario = {
    version: 1, name: input.name!.trim(), seed: input.seed!, width, height, tiles,
    cities: input.cities!.map(c => ({ ...point(c), id: id(c.id), name: String(c.name).slice(0, 80), owner: String(c.owner).slice(0, 60), population: Math.max(0, Math.floor(c.population)) })),
    armies: input.armies!.map(a => {
      assert(Array.isArray(a.composition) && a.composition.length > 0 && a.composition.length <= 40, "Armáda musí mít složení");
      return { ...point(a), id: id(a.id), name: String(a.name).slice(0, 80), owner: String(a.owner).slice(0, 60),
        morale: Math.max(0, Math.min(100, Number(a.morale) || 0)), formation: a.formation,
        composition: a.composition.map(row => ({ id: id(row.id), unit_type: row.unit_type, manpower: Math.max(0, Math.min(100000, Math.floor(row.manpower))) })) };
    }),
    roads: input.roads!.map(r => ({ id: id(r.id), owner: String(r.owner).slice(0, 60), level: Math.max(1, Math.min(3, Math.floor(r.level))), from: point(r.from), to: point(r.to) })),
    resources: input.resources!.map(r => { micro(r.mx, r.my); assert(r.kind in MICRO_RESOURCE_LABEL, "Neznámá surovina"); return { ...point(r), id: id(r.id), kind: r.kind, amount: Math.max(0, Math.min(1000000, Number(r.amount) || 0)), mx: r.mx, my: r.my }; }),
    sites: input.sites!.map(s => { micro(s.mx, s.my); assert(s.recipe in SITE_OPTIONS, "Neznámá těžební stavba"); return { ...point(s), id: id(s.id), cityId: id(s.cityId), owner: String(s.owner).slice(0, 60), recipe: s.recipe, level: Math.max(1, Math.min(5, Math.floor(s.level))), mx: s.mx, my: s.my }; }),
  };
  return scenario;
}

export function parseScenario(text: string): Scenario {
  return normalizeScenario(JSON.parse(text));
}
