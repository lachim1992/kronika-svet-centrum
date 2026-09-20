/**
 * CANONICAL DEMAND MODEL — needs vs operational / development / civic / military / luxury.
 *
 * One demand solver only: `resolveGoodsEconomy` computes every unit of demand and this module
 * is its single configuration + formula layer. Nothing else (UI, reports, process-turn) may
 * invent demand; they read the provenance this module defines.
 *
 * Population supplies LABOUR and NEEDS (plus a little discretionary consumption). Everything
 * else is demanded because the settlement actually DOES something: staffed industry needs
 * tools, active building sites need construction goods, institutions need supplies, armies
 * need military supply, wealthy households want variety and luxury.
 *
 * Shortage consequences differ by class: only needs are survival problems. Operational,
 * development, civic and military shortages are efficiency/opportunity problems; luxury and
 * variety shortfalls are unrealised market demand, never a red alarm.
 */

/** Demand class of a basket. Replaces one-dimensional BASKET_TIER semantics. */
export type BasketClass =
  | 'critical_need' | 'basic_need' | 'operational' | 'development'
  | 'civic' | 'military' | 'discretionary' | 'luxury' | 'intermediate_only';

/** Where a unit of demand comes from. Physical inventories stay single; only accounting splits. */
export type DemandChannel =
  | 'household_need' | 'household_discretionary' | 'industrial_operational'
  | 'institutional' | 'construction' | 'military' | 'fame';

export const DEMAND_CHANNELS: DemandChannel[] = ['household_need', 'household_discretionary',
  'industrial_operational', 'institutional', 'construction', 'military', 'fame'];

export type ShortageBehavior =
  | 'health' | 'satisfaction' | 'productivity' | 'construction'
  | 'civic_efficiency' | 'readiness' | 'opportunity' | 'none';

/** Alert priority. P0 is the only survival-level alarm. */
export type AlertPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'info' | 'none';

export interface BasketDemandSpec {
  class: BasketClass;
  /** Which channels may generate demand for this basket. Nothing else ever does. */
  drivers: DemandChannel[];
  shortage: ShortageBehavior;
  /** Counts towards the settlement's basic-needs satisfaction (stability / migration / growth). */
  basicNeeds: boolean;
  /** Priority of an unmet-demand alert; 'none' never alerts. */
  alert: AlertPriority;
  /** Per-capita intensity for household channels (legacy 1/tier scale, kept for calibration). */
  intensity: number;
  /** Czech UI group + label. */
  group: string;
  label: string;
  /** Short Czech explanation of the consequence of a shortage. */
  consequence: string;
}

export const BASKET_GROUPS = {
  needs: 'ZÁKLADNÍ POTŘEBY',
  operations: 'PROVOZNÍ EKONOMIKA',
  development: 'ROZVOJ',
  military: 'VOJENSTVÍ',
  discretionary: 'VOLITELNÁ SPOTŘEBA / LUXUS',
  intermediate: 'PRŮMYSLOVÉ POLOTOVARY',
} as const;

/**
 * Canonical classification. `variety` is included explicitly — it exists in the goods
 * catalogue (pottery, olive oil, grapes) and must never be silently folded into `feast`.
 * `metalwork` holds only industrial intermediates (raw_ore) and therefore has no household
 * demand at all; its pull comes from downstream recipes.
 */
export const BASKET_DEMAND: Record<string, BasketDemandSpec> = {
  staple_food: { class: 'critical_need', drivers: ['household_need', 'military'], shortage: 'health',
    basicNeeds: true, alert: 'P0', intensity: 1, group: BASKET_GROUPS.needs, label: 'Základní potraviny',
    consequence: 'Hlad, úmrtnost a pokles stability' },
  drinking_water: { class: 'critical_need', drivers: ['household_need'], shortage: 'health',
    basicNeeds: true, alert: 'P0', intensity: 0.5, group: BASKET_GROUPS.needs, label: 'Pitná voda',
    consequence: 'Zdraví a stabilita pod tlakem' },
  fuel: { class: 'basic_need', drivers: ['household_need'], shortage: 'satisfaction',
    basicNeeds: true, alert: 'P1', intensity: 1, group: BASKET_GROUPS.needs, label: 'Palivo a teplo',
    consequence: 'Nižší spokojenost a pomalý pokles stability' },
  basic_clothing: { class: 'basic_need', drivers: ['household_need'], shortage: 'satisfaction',
    basicNeeds: true, alert: 'P1', intensity: 1, group: BASKET_GROUPS.needs, label: 'Základní oděv',
    consequence: 'Nižší spokojenost obyvatel' },

  tools: { class: 'operational', drivers: ['industrial_operational'], shortage: 'productivity',
    basicNeeds: false, alert: 'P2', intensity: 0, group: BASKET_GROUPS.operations, label: 'Nástroje a nářadí',
    consequence: 'Nižší výrobní produktivita' },
  storage_logistics: { class: 'civic', drivers: ['institutional'], shortage: 'civic_efficiency',
    basicNeeds: false, alert: 'P3', intensity: 0, group: BASKET_GROUPS.operations, label: 'Skladování a logistika',
    consequence: 'Horší skladování a manipulace se zbožím' },
  admin_supplies: { class: 'civic', drivers: ['institutional'], shortage: 'civic_efficiency',
    basicNeeds: false, alert: 'P3', intensity: 0, group: BASKET_GROUPS.operations, label: 'Správní potřeby',
    consequence: 'Nižší účinnost správy' },

  construction: { class: 'development', drivers: ['construction'], shortage: 'construction',
    basicNeeds: false, alert: 'P3', intensity: 0, group: BASKET_GROUPS.development, label: 'Stavební materiály',
    consequence: 'Zpomalení rozestavěných projektů' },

  military_supply: { class: 'military', drivers: ['military'], shortage: 'readiness',
    basicNeeds: false, alert: 'P2', intensity: 0, group: BASKET_GROUPS.military, label: 'Vojenské zásoby',
    consequence: 'Nižší bojová připravenost' },

  variety: { class: 'discretionary', drivers: ['household_discretionary'], shortage: 'opportunity',
    basicNeeds: false, alert: 'info', intensity: 0.5, group: BASKET_GROUPS.discretionary, label: 'Rozmanitost',
    consequence: 'Nevyužitá spotřebitelská poptávka' },
  feast: { class: 'luxury', drivers: ['household_discretionary'], shortage: 'opportunity',
    basicNeeds: false, alert: 'info', intensity: 0.17, group: BASKET_GROUPS.discretionary, label: 'Slavnostní hostiny',
    consequence: 'Nevyužitá poptávka zámožných vrstev' },
  luxury_clothing: { class: 'luxury', drivers: ['household_discretionary'], shortage: 'opportunity',
    basicNeeds: false, alert: 'info', intensity: 0.17, group: BASKET_GROUPS.discretionary, label: 'Luxusní oděvy',
    consequence: 'Nevyužitá luxusní poptávka' },

  metalwork: { class: 'intermediate_only', drivers: [], shortage: 'none',
    basicNeeds: false, alert: 'none', intensity: 0, group: BASKET_GROUPS.intermediate, label: 'Kovové polotovary',
    consequence: 'Poptávka vzniká jen z navazujících receptur' },
};

export const BASKET_KEYS = Object.keys(BASKET_DEMAND);
export const basketSpec = (basket: string): BasketDemandSpec | undefined => BASKET_DEMAND[basket];
export const basketClass = (basket: string): BasketClass => BASKET_DEMAND[basket]?.class ?? 'intermediate_only';
export const isNeedBasket = (basket: string) => !!BASKET_DEMAND[basket]?.basicNeeds;

/** Every tunable number of the demand model. Never hard-code these at a call site. */
export const DEMAND = {
  /** Tools are durable operational support: maintenance per unit of STAFFED capacity. */
  toolMaintenanceRate: 0.2,
  /**
   * Relative tool intensity of a producer, keyed by the basket it produces. Extraction and
   * metal trades wear tools fastest; administration needs none.
   */
  toolIntensity: {
    metalwork: 1, tools: 1, construction: 1, military_supply: 1,
    luxury_clothing: 0.6, basic_clothing: 0.5, staple_food: 0.5, feast: 0.5, variety: 0.5, fuel: 0.5,
    storage_logistics: 0.3, drinking_water: 0.25, admin_supplies: 0,
  } as Record<string, number>,
  /** Tool coverage is a bounded soft productivity effect, never an on/off recipe input. */
  toolProductivityFloor: 0.75,
  /** Civic demand: administration. */
  adminPerWorker: 0.004, adminPerInstitution: 0.5,
  /** Civic demand: storage & logistics scale with stock volume, handling jobs and market size. */
  storagePerStockUnit: 0.01, storagePerLogisticsWorker: 0.004, storagePerMarketLevel: 0.2,
  /** Development demand: per active building site / project per turn. */
  constructionPerProject: 2,
  /** Military demand: per actual soldier. */
  militaryPerSoldier: 0.004,
  /** Discretionary demand scales with the affluent share of the population and market reach. */
  affluenceReference: 0.25, marketAffluenceGain: 0.08,
  /** Even a poor settlement buys a little pottery or oil; the floor keeps variety alive. */
  discretionaryFloor: 0.15,
  /** Coverage bands of a need basket. */
  needBands: { healthy: 1, minor: 0.9, meaningful: 0.75, severe: 0.5 },
  /** Water shortage curve (stability loss and mortality share by band). */
  waterStability: { minor: 0, meaningful: 2, severe: 4, critical: 8 },
  waterMortality: 0.02,
  /** Below this coverage a basic need starts to bite. */
  basicNeedThreshold: 0.8,
  /** An operational/civic/military alert needs a materially reduced system, not a rounding gap. */
  materialShortage: 0.9,
  epsilon: 1e-8,
} as const;

/** Inputs of the canonical per-basket demand formula. All values are physical/derived, never fiscal. */
export interface DemandInput {
  /** Σ population class × DEMAND_WEIGHTS[basket] for this basket. */
  weightedPop: number;
  /** Baseline per-capita demand rate (ECONOMY.populationDemand). */
  populationRate: number;
  /** Affluent share proxy: (burghers + clerics) / population. */
  affluentShare: number;
  /** Market level of the settlement (reach of discretionary consumption). */
  market: number;
  /** Σ staffed capacity × tool intensity over the city's producers. */
  toolWear: number;
  /** Workers actually employed in administration. */
  adminWorkers: number;
  /** Administrative institutions in use (temples, chanceries…). */
  adminInstitutions: number;
  /** Workers actually employed in logistics. */
  logisticsWorkers: number;
  /** Physical stock volume held in the settlement (bulk-weighted). */
  stockVolume: number;
  /** Active construction projects / building sites of the settlement. */
  constructionProjects: number;
  /** Actual soldiers supplied from this settlement. */
  soldiers: number;
}

export const emptyChannels = (): Record<DemandChannel, number> =>
  ({ household_need: 0, household_discretionary: 0, industrial_operational: 0,
    institutional: 0, construction: 0, military: 0, fame: 0 });

/** Discretionary consumption exists only where households have something to spend. */
export const affluenceFactor = (input: DemandInput) =>
  Math.max(DEMAND.discretionaryFloor,
    Math.min(2, input.affluentShare / DEMAND.affluenceReference * (1 + Math.max(0, input.market) * DEMAND.marketAffluenceGain)));

/**
 * THE canonical demand formula. Returns demand per channel for one basket of one settlement.
 * Population never creates operational, civic, construction or military demand.
 */
export function basketDemandChannels(basket: string, input: DemandInput): Record<DemandChannel, number> {
  const spec = BASKET_DEMAND[basket];
  const out = emptyChannels();
  if (!spec) return out;
  const allow = (channel: DemandChannel) => spec.drivers.includes(channel);
  const pos = (v: number) => (Number.isFinite(v) ? Math.max(0, v) : 0);
  if (allow('household_need')) out.household_need = pos(input.weightedPop) * pos(input.populationRate) * spec.intensity;
  if (allow('household_discretionary')) out.household_discretionary =
    pos(input.weightedPop) * pos(input.populationRate) * spec.intensity * affluenceFactor(input);
  if (allow('industrial_operational')) out.industrial_operational = pos(input.toolWear) * DEMAND.toolMaintenanceRate;
  if (allow('institutional')) {
    if (basket === 'admin_supplies') out.institutional =
      pos(input.adminWorkers) * DEMAND.adminPerWorker + pos(input.adminInstitutions) * DEMAND.adminPerInstitution;
    if (basket === 'storage_logistics') out.institutional =
      pos(input.stockVolume) * DEMAND.storagePerStockUnit +
      pos(input.logisticsWorkers) * DEMAND.storagePerLogisticsWorker +
      pos(input.market) * DEMAND.storagePerMarketLevel;
  }
  if (allow('construction')) out.construction = pos(input.constructionProjects) * DEMAND.constructionPerProject;
  if (allow('military')) out.military = pos(input.soldiers) * DEMAND.militaryPerSoldier;
  return out;
}

export const channelTotal = (channels: Record<DemandChannel, number>) =>
  DEMAND_CHANNELS.reduce((sum, c) => sum + (channels[c] || 0), 0);

/** Relative tool wear of a producer by the basket it makes. */
export const toolIntensityOf = (basket: string) => DEMAND.toolIntensity[basket] ?? 0;

/**
 * Bounded soft productivity effect of tool coverage. Zero tools never means zero production,
 * so a tool workshop can always rebuild the tools of its own region.
 */
export function toolProductivityMultiplier(coverage: number) {
  const floor = DEMAND.toolProductivityFloor;
  const c = Number.isFinite(coverage) ? Math.max(0, Math.min(1, coverage)) : 1;
  return floor + (1 - floor) * c;
}

export type NeedBand = 'healthy' | 'minor' | 'meaningful' | 'severe' | 'critical';

/** Coverage band of a need basket. A floating-point crumb is never a catastrophe. */
export function needBand(coverage: number): NeedBand {
  const c = Number.isFinite(coverage) ? Math.max(0, coverage) : 1;
  if (c >= DEMAND.needBands.healthy - 1e-6) return 'healthy';
  if (c >= DEMAND.needBands.minor) return 'minor';
  if (c >= DEMAND.needBands.meaningful) return 'meaningful';
  if (c >= DEMAND.needBands.severe) return 'severe';
  return 'critical';
}

/** Drinking-water shortage: public health, on its own curve (not the food curve). */
export function waterShortageImpact(population: number, coverage: number) {
  const band = needBand(coverage);
  const pop = Math.max(0, Number(population) || 0);
  const stabilityLoss = band === 'healthy' || band === 'minor' ? DEMAND.waterStability.minor
    : band === 'meaningful' ? DEMAND.waterStability.meaningful
    : band === 'severe' ? DEMAND.waterStability.severe : DEMAND.waterStability.critical;
  const deaths = band === 'critical'
    ? Math.floor(pop * DEMAND.waterMortality * Math.max(0, 1 - Math.max(0, coverage))) : 0;
  return { band, stabilityLoss, deaths };
}

/** Does unmet demand of this basket deserve a player alert, and at which priority? */
export function alertPriority(basket: string, coverage: number, context: { activeSystem?: boolean } = {}): AlertPriority {
  const spec = BASKET_DEMAND[basket];
  if (!spec || spec.alert === 'none') return 'none';
  const band = needBand(coverage);
  if (spec.class === 'critical_need') return band === 'severe' || band === 'critical' ? 'P0'
    : band === 'meaningful' ? 'P1' : 'none';
  if (spec.class === 'basic_need') return band === 'severe' || band === 'critical' ? 'P1'
    : band === 'meaningful' ? 'P2' : 'none';
  if (spec.class === 'discretionary' || spec.class === 'luxury') return coverage >= 1 ? 'none' : 'info';
  // Operational / civic / development / military: only when a real system is constrained.
  if (context.activeSystem === false) return 'none';
  return coverage >= DEMAND.materialShortage ? 'none' : spec.alert;
}

/** Czech one-liner describing what a given coverage actually does. */
export function shortageEffect(basket: string, coverage: number): string {
  const spec = BASKET_DEMAND[basket];
  if (!spec) return '';
  const pct = Math.round(Math.max(0, Math.min(1, coverage)) * 100);
  switch (spec.shortage) {
    case 'productivity': {
      const penalty = Math.round((1 - toolProductivityMultiplier(coverage)) * 100);
      return penalty > 0 ? `Výrobní produktivita −${penalty} %` : 'Výroba bez omezení';
    }
    case 'health': {
      const band = needBand(coverage);
      return band === 'healthy' ? 'Potřeba pokryta'
        : band === 'minor' ? 'Mírný tlak na zásobování'
        : band === 'meaningful' ? 'Zdraví a stabilita pod tlakem'
        : band === 'severe' ? 'Vážný nedostatek: stabilita klesá'
        : 'Kritický nedostatek: úmrtnost a nepokoje';
    }
    case 'satisfaction':
      return coverage >= DEMAND.basicNeedThreshold ? 'Potřeba v podstatě pokryta'
        : `Nižší spokojenost obyvatel (pokrytí ${pct} %)`;
    case 'construction':
      return coverage >= DEMAND.materialShortage ? 'Stavby postupují' : `Rozestavěné projekty zpomalují (${pct} %)`;
    case 'civic_efficiency':
      return coverage >= DEMAND.materialShortage ? 'Systém plně zásoben' : `Nižší účinnost systému (${pct} %)`;
    case 'readiness':
      return coverage >= DEMAND.materialShortage ? 'Vojsko zásobeno' : `Nižší připravenost vojska (${pct} %)`;
    case 'opportunity':
      return coverage >= 1 ? 'Poptávka uspokojena' : 'Nevyužitá poptávka (tržní příležitost)';
    default:
      return 'Poptávka vzniká jen z navazujících receptur';
  }
}

/** UI severity of an unmet basket. Luxury shortfalls are opportunities, not alarms. */
export function basketSeverity(basket: string, coverage: number): 'critical' | 'warning' | 'opportunity' | 'info' | 'ok' {
  const spec = BASKET_DEMAND[basket];
  if (!spec) return 'info';
  if (spec.class === 'discretionary' || spec.class === 'luxury') return coverage >= 1 ? 'ok' : 'opportunity';
  if (spec.class === 'intermediate_only') return 'info';
  const priority = alertPriority(basket, coverage);
  return priority === 'P0' ? 'critical' : priority === 'none' ? 'ok' : priority === 'info' ? 'info' : 'warning';
}

/** Czech label of a demand channel, for provenance readouts. */
export const CHANNEL_LABELS: Record<DemandChannel, string> = {
  household_need: 'Obyvatelstvo (potřeby)',
  household_discretionary: 'Obyvatelstvo (volitelná spotřeba)',
  industrial_operational: 'Průmysl (provoz)',
  institutional: 'Instituce a správa',
  construction: 'Stavby a projekty',
  military: 'Vojsko',
  fame: 'Poptávka po proslulém zboží',
};
