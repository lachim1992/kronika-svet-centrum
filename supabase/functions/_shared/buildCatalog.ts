/**
 * CANONICAL BUILD CATALOG — one read-only description of everything a player can build.
 *
 * It merges, without inventing a single number:
 *   - `building_templates` rows (cost, build time, max level, effects, level_data),
 *   - the district blueprints (`cityDistricts.ts`),
 *   - the subnode definitions (`subnodeCatalog.ts`),
 *   - the production contract (`productionCatalog.ts`: which recipes a structure may run per level),
 *   - the canonical labour/capacity interpretation (`economyConfig.ts`).
 *
 * Capacity and jobs use the SAME formulas as the economy adapter:
 *   capacity(level) = Σ basket_outputs × ECONOMY.levelCapacityScale[level-1]
 *   allocation      = autoAllocationWeight(basket) normalised over the legal recipes
 *   jobs            = Σ capacity × allocation × recipe.labor / recipe.qty × workersPerLaborUnit
 * If a value cannot be derived honestly it stays undefined — the UI then says so.
 */
import { ECONOMY, BASKET_TIER } from './economyConfig.ts';
import { GOODS, PRODUCTION_BUILDINGS, type BuildingContract } from './productionCatalog.ts';
import { RESIDENTIAL_DISTRICTS, PRODUCTION_DISTRICTS, PRODUCTION_PER_RESIDENTIAL, type DistrictBlueprint } from './cityDistricts.ts';
import { SUBNODE_DEFS } from './subnodeCatalog.ts';

export type BuildCategory =
  | 'housing' | 'source' | 'processing' | 'manufacture' | 'trade'
  | 'infrastructure' | 'civic' | 'military' | 'district' | 'territorial';

export const BUILD_CATEGORY_ORDER: BuildCategory[] = [
  'housing', 'source', 'processing', 'manufacture', 'trade',
  'infrastructure', 'civic', 'military', 'district', 'territorial',
];

export const BUILD_CATEGORY_LABELS: Record<BuildCategory, { label: string; hint: string }> = {
  housing: { label: 'A. Obytné', hint: 'Bydlení, obyvatelé a pracovní síla pro dílny.' },
  source: { label: 'B. Suroviny a těžba', hint: 'Získává surovinu z krajiny — začátek každého řetězce.' },
  processing: { label: 'C. Zpracování', hint: 'Mění surovinu na polotovar (obilí → mouka, ruda → ingot).' },
  manufacture: { label: 'D. Výroba', hint: 'Dělá hotové zboží z polotovarů (mouka → chléb).' },
  trade: { label: 'E. Obchod, sklady a logistika', hint: 'Skladování, trhy a napojení na obchodní síť.' },
  infrastructure: { label: 'F. Infrastruktura a služby', hint: 'Voda, cesty, hygiena — podmínky pro růst.' },
  civic: { label: 'G. Správa, kultura a víra', hint: 'Správa, stabilita, víra a prestiž.' },
  military: { label: 'H. Vojenství a bezpečnost', hint: 'Obrana, výcvik a kontrola území.' },
  district: { label: 'I. Výrobní a obytné zóny', hint: 'Celé čtvrti města — větší záběr než jedna budova.' },
  territorial: { label: 'J. Subuzly v území', hint: 'Malé objekty na parcele mimo jádro města.' },
};

/** Player-facing names of the physical goods (internal keys stay in dev mode). */
export const GOOD_LABELS: Record<string, string> = {
  raw_grain: 'Surové obilí', raw_fish: 'Ryby', raw_meat: 'Surové maso', raw_olives: 'Olivy',
  raw_grapes: 'Hrozny', raw_fiber: 'Surové vlákno', raw_hide: 'Surové kůže', raw_ore: 'Ruda',
  raw_stone: 'Surový kámen', raw_timber: 'Surové dřevo', raw_incense: 'Kadidlová pryskyřice',
  peat: 'Rašelina', well_water: 'Voda', charcoal: 'Dřevěné uhlí', flour: 'Mouka', yarn: 'Příze',
  leather: 'Kůže', iron_ingot: 'Železný ingot', copper_ingot: 'Měděný ingot', lumber: 'Řezivo',
  stone_blocks: 'Kamenné bloky', olive_oil: 'Olivový olej', granary_storage: 'Skladová kapacita',
  scribed_documents: 'Písemnosti', baked_staples: 'Chléb', baked_refined: 'Jemné pečivo',
  preserved_food: 'Konzervované potraviny', textile_basic: 'Základní textil', textile_fine: 'Jemný textil',
  metalwork_tools: 'Nástroje', construction_materials: 'Stavební materiál', pottery: 'Keramika',
  arms_basic: 'Základní výzbroj', wine_standard: 'Víno', feast_goods: 'Hostinské zboží',
  wine_luxury: 'Archivní víno', fine_arms: 'Zdobená výzbroj', jewelry: 'Klenoty', ritual_goods: 'Rituální předměty',
};

export const goodLabel = (key: string) => GOOD_LABELS[key] || key;

export const ROLE_LABELS: Record<string, string> = {
  source: 'Zdroj surovin', processing: 'Zpracování', urban: 'Městská výroba',
  guild: 'Cechovní mistrovství', producer: 'Výrobna', control: 'Kontrola území',
};

/** Same weighting the economy adapter uses to split capacity between legal recipes. */
export const autoAllocationWeight = (basketKey: string) => 1 / (BASKET_TIER[basketKey] || 1);
/** Capacity multiplier of a structure level (canonical ECONOMY.levelCapacityScale). */
export function levelCapacityScale(level: number): number {
  const scale = ECONOMY.levelCapacityScale;
  return scale[Math.min(scale.length, Math.max(1, Math.round(level || 1))) - 1];
}

/** A recipe as stored in `production_recipes`. */
export interface RecipeRow {
  recipe_key: string; output_good_key: string; output_quantity: number; labor_cost: number;
  input_items: { key: string; qty: number }[] | null;
  required_role?: string | null; required_tags?: string[] | null;
  min_quality_input?: number | null; quality_output_bonus?: number | null;
  description?: string | null;
}

export interface TemplateRow {
  id: string; name: string; category: string; description?: string | null;
  cost_wealth?: number | null; cost_wood?: number | null; cost_stone?: number | null; cost_iron?: number | null;
  build_turns?: number | null; max_level?: number | null; effects?: any; level_data?: any;
}

export interface CatalogRecipeView {
  key: string; output: string; outputQty: number; labor: number;
  inputs: { good: string; qty: number }[]; role: string;
  minQuality: number; qualityBonus: number; unlockLevel: number;
}

export interface CatalogLevelView {
  level: number; capacity: number; jobs?: number; recipes: string[]; unlocks: string[];
}

export interface CatalogItem {
  key: string;
  kind: 'building' | 'district' | 'subnode';
  category: BuildCategory;
  name: string;
  purpose: string;
  description: string;
  /** Raw template/blueprint identifier for the dispatch command. */
  refId: string;
  cost: { gold: number; wood: number; stone: number; iron: number; production: number };
  buildTurns: number;
  maxLevel: number;
  productive: boolean;
  role?: string;
  housing?: number;
  capacityLevel1?: number;
  jobsLevel1?: number;
  levels: CatalogLevelView[];
  recipes: CatalogRecipeView[];
  baskets: Record<string, number>;
  tags: string[];
  requirements: string[];
  /** Everything searchable: name, goods in and out, tags, category. */
  searchTerms: string[];
  /** Honest gaps: values that the canonical data does not provide. */
  dataGaps: string[];
}

const GOOD_BASKET: Record<string, string> = Object.fromEntries(GOODS.map(g => [g.key, g.basket]));
const num = (v: unknown) => Math.max(0, Number(v) || 0);
const contractOf = (name: string): BuildingContract | undefined =>
  PRODUCTION_BUILDINGS.find(b => b.name.toLowerCase() === (name || '').toLowerCase());

/** Category overrides for structures the production contract does not classify. */
const CATEGORY_BY_NAME: Record<string, BuildCategory> = {
  'Sýpka': 'trade', 'Tržiště': 'trade', 'Přístav': 'trade', 'Sklárna': 'manufacture',
  'Mincovna': 'civic', 'Studna': 'infrastructure', 'Akvadukt': 'infrastructure',
  'Uhlířství': 'processing', 'Rašeliniště': 'source', 'Rybářství': 'source', 'Manufaktura': 'manufacture',
};

function buildingCategory(t: TemplateRow, contract?: BuildingContract): BuildCategory {
  if (CATEGORY_BY_NAME[t.name]) return CATEGORY_BY_NAME[t.name];
  if (t.category === 'military') return 'military';
  if (t.category === 'cultural') return 'civic';
  if (t.category === 'infrastructure') return 'infrastructure';
  if (t.category === 'residential') return 'housing';
  const roles = contract?.roles || [];
  if (roles.includes('source')) return 'source';
  if (roles.includes('processing')) return 'processing';
  if (roles.includes('urban') || roles.includes('guild')) return 'manufacture';
  return 'manufacture';
}

/** Cumulative recipe keys available at `level` according to the production contract. */
function contractRecipes(contract: BuildingContract | undefined, level: number): string[] {
  if (!contract) return [];
  return contract.levels.slice(0, Math.max(1, level)).flat();
}

/**
 * Jobs of a structure level, exactly like the economy adapter: a producing structure employs
 * ECONOMY.structureJobsBase people at level 1 (or its declared jobs_capacity) and doubles with
 * every level, together with the physical capacity.
 */
function jobsFor(capacityBase: number, declared: number, level: number): number | undefined {
  if (capacityBase <= 0) return undefined;
  return (declared > 0 ? declared : ECONOMY.structureJobsBase) * levelCapacityScale(level);
}



const recipeView = (r: RecipeRow, unlockLevel: number): CatalogRecipeView => ({
  key: r.recipe_key, output: r.output_good_key, outputQty: num(r.output_quantity), labor: num(r.labor_cost),
  inputs: (r.input_items || []).map(i => ({ good: i.key, qty: num(i.qty) })),
  role: String(r.required_role || ''), minQuality: num(r.min_quality_input), qualityBonus: num(r.quality_output_bonus),
  unlockLevel,
});

function templateItem(t: TemplateRow, recipesByKey: Map<string, RecipeRow>): CatalogItem {
  const contract = contractOf(t.name);
  const effects = t.effects || {};
  const baskets: Record<string, number> = effects.basket_outputs || {};
  const capacityBase = Object.values(baskets).reduce((s, v) => s + num(v), 0);
  const maxLevel = Math.max(1, Number(t.max_level) || 1);
  const dataGaps: string[] = [];
  const allKeys = contractRecipes(contract, maxLevel);
  const missing = allKeys.filter(k => !recipesByKey.has(k));
  if (missing.length) dataGaps.push(`Recepty bez dat: ${missing.join(', ')}`);

  const levels: CatalogLevelView[] = [];
  for (let level = 1; level <= maxLevel; level++) {
    const keys = contractRecipes(contract, level);
    const rows = keys.map(k => recipesByKey.get(k)).filter(Boolean) as RecipeRow[];
    const capacity = capacityBase * levelCapacityScale(level);
    levels.push({
      level, capacity, jobs: jobsFor(capacity, rows), recipes: keys,
      unlocks: contract?.levels[level - 1] || [],
    });
  }
  const recipes = allKeys
    .map(k => {
      const row = recipesByKey.get(k);
      const unlock = (contract?.levels || []).findIndex(keys => keys.includes(k)) + 1;
      return row ? recipeView(row, unlock || 1) : null;
    })
    .filter(Boolean) as CatalogRecipeView[];

  const requirements: string[] = [];
  if (contract?.requiresWater) requirements.push('Řeka nebo pobřeží');
  if (!contract && capacityBase > 0) {
    dataGaps.push('Bez výrobního kontraktu — nemá vlastní recepty, přispívá jen zásobováním koše.');
  }
  const productive = recipes.length > 0;
  const purpose = productive
    ? `${ROLE_LABELS[recipes[0].role] || 'Výrobna'} — vyrábí ${recipes.map(r => goodLabel(r.output)).slice(0, 3).join(', ')}`
    : Object.keys(baskets).length
      ? `Zásobuje potřeby: ${Object.keys(baskets).join(', ')}`
      : t.description || 'Stavba bez výrobního výstupu.';
  return {
    key: `building:${t.id}`, kind: 'building', category: buildingCategory(t, contract), name: t.name,
    purpose, description: t.description || '', refId: t.id,
    cost: { gold: num(t.cost_wealth), wood: num(t.cost_wood), stone: num(t.cost_stone), iron: num(t.cost_iron), production: 0 },
    buildTurns: Math.max(1, Number(t.build_turns) || 1), maxLevel, productive,
    role: recipes[0]?.role || undefined,
    capacityLevel1: capacityBase || undefined, jobsLevel1: levels[0]?.jobs,
    levels, recipes, baskets, tags: effects.capability_tags || contract?.tags || [],
    requirements,
    searchTerms: [t.name, t.category, ...Object.keys(baskets), ...(contract?.tags || []),
      ...recipes.flatMap(r => [goodLabel(r.output), r.output, ...r.inputs.flatMap(i => [goodLabel(i.good), i.good])])],
    dataGaps,
  };
}

function districtItem(d: DistrictBlueprint): CatalogItem {
  const residential = d.district_type === 'residential';
  const baskets = residential ? {} : { '(volitelný koš)': num(d.basket_output) };
  return {
    key: `district:${d.key}`, kind: 'district', category: residential ? 'housing' : 'district',
    name: d.name, purpose: residential
      ? `Bydlení pro ${num(d.population_capacity)} lidí — dodává pracovní sílu dílnám`
      : `Výrobní zóna — ${num(d.basket_output)} jednotek do zvoleného koše; jedna obytná čtvrť obsadí ${PRODUCTION_PER_RESIDENTIAL} výrobní`,
    description: d.description, refId: d.key,
    cost: { gold: num(d.build_cost_wealth), wood: num(d.build_cost_wood), stone: num(d.build_cost_stone), iron: 0, production: 0 },
    buildTurns: Math.max(1, num(d.build_turns)), maxLevel: 1, productive: !residential,
    housing: residential ? num(d.population_capacity) : undefined,
    capacityLevel1: residential ? undefined : num(d.basket_output),
    levels: [{ level: 1, capacity: residential ? 0 : num(d.basket_output), recipes: [], unlocks: [] }],
    recipes: [], baskets, tags: [],
    requirements: residential
      ? ['Parcela vlastního města']
      : ['Parcela vlastního města', `Volná obytná kapacita (1 obytná čtvrť uživí ${PRODUCTION_PER_RESIDENTIAL} výrobní)`],
    searchTerms: [d.name, ...(d.baskets || [])],
    dataGaps: residential ? [] : ['Čtvrť nemá vlastní recepty — vyrábí do vybraného koše podle kapacity.'],
  };
}

function subnodeItem(key: string): CatalogItem {
  const def = SUBNODE_DEFS[key];
  return {
    key: `subnode:${key}`, kind: 'subnode', category: 'territorial', name: def.label,
    purpose: `${ROLE_LABELS[def.role] || 'Územní objekt'} — ${Object.entries(def.resource).map(([k, v]) => `${k} +${v}`).join(', ') || 'bez přímého výnosu'}`,
    description: def.description, refId: key,
    cost: { gold: num(def.gold), wood: 0, stone: 0, iron: 0, production: num(def.production) },
    buildTurns: 1, maxLevel: 1, productive: def.role !== 'control', role: def.role,
    levels: [{ level: 1, capacity: 0, recipes: [], unlocks: [] }],
    recipes: [], baskets: {}, tags: def.capabilities,
    requirements: [def.requiresWater ? 'Řeka nebo pobřeží' : 'Vlastní parcela s volným slotem'],
    searchTerms: [def.label, ...def.capabilities, def.group],
    dataGaps: ['Subuzel nemá deklarovanou pracovní kapacitu — výkon se dopočítá po uzavření kola.'],
  };
}

/** Build the whole catalog. `recipes` may be empty: productive detail then reports the gap. */
export function buildCatalog(input: { templates: TemplateRow[]; recipes?: RecipeRow[] }): CatalogItem[] {
  const recipesByKey = new Map((input.recipes || []).map(r => [r.recipe_key, r]));
  return [
    ...RESIDENTIAL_DISTRICTS.map(districtItem),
    ...PRODUCTION_DISTRICTS.map(districtItem),
    ...input.templates.map(t => templateItem(t, recipesByKey)),
    ...Object.keys(SUBNODE_DEFS).map(subnodeItem),
  ];
}

/** Text search across names, goods (in and out), tags and categories. */
export function matchesQuery(item: CatalogItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [item.name, item.purpose, item.description, BUILD_CATEGORY_LABELS[item.category].label, ...item.searchTerms]
    .join(' ').toLowerCase();
  return q.split(/\s+/).every(part => haystack.includes(part));
}
