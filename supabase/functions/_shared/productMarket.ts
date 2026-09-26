/**
 * PRODUCT MARKET LAYER (Goods v4.3 extension) — pure, deterministic, no DB.
 *
 * Basket → Subbasket → Product → Famous variant.
 *   basket     = economic need / function (demandModel.ts owns classes and need quantities)
 *   subbasket  = group of close functional substitutes (bread, grain porridge, protein, ...)
 *   product    = concrete tradeable good (goods catalogue key)
 *   famous     = origin reputation of a product (famous_goods rows: city × good), never a new need
 *
 * This module never creates physical units, never changes the NEED quantity of a basket and
 * never writes fiscal state. It only:
 *   1) splits an already-computed basket demand between products (attractiveness shares),
 *   2) measures within-basket diversity (utility only, never a survival requirement),
 *   3) derives city accounts (GDP, income, purchasing power, price index, affordability),
 *   4) evaluates producer margin at local prices (cost ≠ market value).
 * All coefficients live in PRODUCT_MARKET below — the UI reads results, never recomputes them.
 */

export const PRODUCT_MARKET = {
  /** Max relative swing of each bounded attractiveness factor (±). */
  preferenceSpan: 0.5,
  familiaritySpan: 0.25,
  noveltySpan: 0.15,
  qualitySpan: 0.2,
  fameSpan: 0.3,
  priceElasticity: 0.6,
  /** Locally familiar/prevalent share above which novelty is zero (diminishing returns). */
  noveltySaturation: 0.5,
  /** Coastal settlements prefer sea protein; inland ones barely consume it (derived regional taste). */
  coastalAffinity: 1.6,
  inlandAffinity: 0.35,
  /**
   * Provisional household income distribution of city value added (transparent, not a wage sim).
   * Calibrated for a pre-industrial economy: most value added is peasant/artisan labour income and
   * most of the rest (rents, workshop profits) is spent locally, with almost nothing saved — so a
   * city that physically feeds itself can also pay for its own basic basket.
   */
  laborShare: 0.65,
  /** Part of non-labour value added (rents, profits) that stays with local households. */
  localCapitalShare: 0.6,
  /** Share of disposable income spent on market goods this turn (rest = saving, not modelled yet). */
  propensityToConsume: 0.95,
  /** Tax wedge applied to household income: domestic + poll proxy from realm tax rates. */
  defaultHouseholdTaxRate: 0.1,
  // ── LANDED INPUT COST (sourcing) ──
  /** Monetised risk per unit of route risk, as a share of the source price. */
  landedRiskShare: 0.05,
  /** A factory refuses inputs whose landed cost exceeds this multiple of the base price. */
  maxLandedInputMultiple: 4,
  // ── AUTO PRODUCTION ──
  /** Weight of margin ratio vs basket necessity in AUTO allocation (bounded, no loop). */
  autoMarginWeight: 1,
  /** Loss-making options keep this tiny weight only if NO profitable legal option exists. */
  autoLossFloor: 0,
  // ── TRADE SERVICES (service demand rates on gross handled value; only this margin is VA) ──
  serviceRates: { local_exchange: 0.03, import_export: 0.05, aggregation: 0.04, reexport: 0.06, transit: 0.01 },
  /** Capture without any staffed commercial capacity (a road passing a hamlet). */
  serviceCaptureFloor: 0.15,
  /** Commercial capacity (market + storage levels) at which capture is complete. */
  serviceCapacityRef: 12,
  // ── CITY CAPITAL STOCK (process-turn only writer) ──
  capitalRetentionBase: 0.08,
  capitalRetentionMax: 0.2,
  capitalDepreciation: 0.03,
  capitalWarLoss: 0.25,
  // ── CRAFTSMANSHIP / QUALITY ──
  /** Craft points per structure level above 1 (Lv1 0, Lv2 1, Lv3 2). */
  craftPerLevel: 1,
  /** Extra craft from an explicit master_craft capability tag. */
  masterCraftBonus: 1,
  /** Processed output may exceed the worst input quality by at most this much (bounded inheritance). */
  qualityInheritanceHeadroom: 1,
  maxQuality: 3,
} as const;

/**
 * LANDED INPUT COST of one delivered unit: source local price + transport + tolls + tariff +
 * risk premium + expected transport loss. Deterministic and bounded; used to rank suppliers.
 */
export function landedInputCost(i: { sourcePrice: number; transport: number; tolls: number; tariffRate: number;
  destinationPrice?: number; risk: number; loss: number }) {
  const loss = Math.min(0.95, pos(i.loss)), src = pos(i.sourcePrice);
  const tariff = pos(i.tariffRate) * (i.destinationPrice ?? src);
  const risk = pos(i.risk) * PRODUCT_MARKET.landedRiskShare * src;
  const perShipped = src + pos(i.transport) + pos(i.tolls) + tariff + risk;
  const landed = perShipped / (1 - loss);
  return { landed, source: src, transport: pos(i.transport), tolls: pos(i.tolls), tariff, risk, loss_cost: landed - perShipped };
}

/**
 * AUTO allocation among legal recipes of one structure. Weight = necessity × margin ratio (from
 * the previous committed / reference prices — never the same pass, so no price loop).
 * Loss-making options get zero whenever a profitable legal option exists; if nothing pays, the
 * structure keeps its necessity weights (a starter farm never stops feeding people) and the
 * diagnostics flag the loss.
 */
export function autoAllocation(options: { key: string; necessity: number; marginRatio: number }[]) {
  const profitable = options.filter(o => o.marginRatio > 0);
  if (!profitable.length) return Object.fromEntries(options.map(o => [o.key, pos(o.necessity)]));
  return Object.fromEntries(options.map(o => [o.key, o.marginRatio > 0
    ? pos(o.necessity) * (1 + PRODUCT_MARKET.autoMarginWeight * Math.min(1, o.marginRatio)) : PRODUCT_MARKET.autoLossFloor]));
}

/**
 * TRADE-SERVICE VALUE ADDED. Gross trade is not GDP; it creates service DEMAND at configured
 * rates. Topology gives the opportunity, staffed commercial capacity monetises it.
 */
export function tradeServiceValue(i: { local_exchange: number; import_export: number; aggregation: number; reexport: number;
  transit: number; commercialCapacity: number }) {
  const R = PRODUCT_MARKET.serviceRates;
  const opportunity = { local_exchange: pos(i.local_exchange) * R.local_exchange, import_export: pos(i.import_export) * R.import_export,
    aggregation: pos(i.aggregation) * R.aggregation, reexport: pos(i.reexport) * R.reexport, transit: pos(i.transit) * R.transit };
  const total = Object.values(opportunity).reduce((s, v) => s + v, 0);
  const capacity = clamp01(pos(i.commercialCapacity) / PRODUCT_MARKET.serviceCapacityRef);
  const capture = PRODUCT_MARKET.serviceCaptureFloor + (1 - PRODUCT_MARKET.serviceCaptureFloor) * capacity;
  return { opportunity, opportunity_total: total, capture, service_value_added: total * capture };
}

/** Producer craftsmanship from explicit, player-visible progression (level + master craft). */
export function craftsmanship(level: unknown, tags: string[] = [], guild = 0) {
  const lv = Math.max(1, Math.round(Number(level) || 1));
  const own = (lv - 1) * PRODUCT_MARKET.craftPerLevel + (tags.includes('master_craft') ? PRODUCT_MARKET.masterCraftBonus : 0);
  return Math.min(PRODUCT_MARKET.maxQuality, Math.max(own, pos(guild)));
}

/** Output quality: recipe bonus + craftsmanship, processed goods bounded by input quality. */
export function outputQuality(i: { recipeBonus: number; craft: number; source: boolean; minInputQuality: number }) {
  const craft = pos(i.craft);
  const bounded = i.source ? craft : Math.min(craft, pos(i.minInputQuality) + PRODUCT_MARKET.qualityInheritanceHeadroom);
  return Math.min(PRODUCT_MARKET.maxQuality, pos(i.recipeBonus) + bounded);
}

/** PROSPERITY: derived current-condition index 0..1 — NOT a stock, never accumulated. */
export function prosperityIndex(i: { realPurchasingPowerPerCapita: number; employment: number; needCoverage: number;
  housingHeadroom: number; stability: number; marketAccess: number }) {
  const parts = { purchasing: clamp01(pos(i.realPurchasingPowerPerCapita) / 0.05), employment: clamp01(i.employment),
    needs: clamp01(i.needCoverage), housing: clamp01(i.housingHeadroom), stability: clamp01(i.stability), market: clamp01(i.marketAccess) };
  const index = (parts.purchasing + parts.employment + parts.needs * 2 + parts.housing + parts.stability + parts.market) / 7;
  return { index, parts };
}

/**
 * CITY CAPITAL STOCK delta (Bohatství města). Derived candidate only; process-turn is the one
 * writer that persists it. Retention depends on stable signals only; stock never creates goods.
 */
export function capitalStockDelta(i: { stock: number; valueAdded: number; needCoverage: number; stability: number;
  taxRate: number; devastated: boolean }) {
  const M = PRODUCT_MARKET;
  const retention = Math.min(M.capitalRetentionMax, M.capitalRetentionBase * clamp01(i.needCoverage) * (0.5 + clamp01(i.stability)) * (1 - clamp01(i.taxRate)) * 1.5);
  const accumulation = pos(i.valueAdded) * retention, depreciation = pos(i.stock) * M.capitalDepreciation;
  const war = i.devastated ? pos(i.stock) * M.capitalWarLoss : 0;
  const delta = accumulation - depreciation - war;
  return { retention, accumulation, depreciation, war_loss: war, delta, next: Math.max(0, pos(i.stock) + delta) };
}

export interface ProductMeta {
  basket: string;
  subbasket: string;
  /** Need units satisfied per physical unit (functional contribution). */
  functional_value: number;
  base_preference: number;
  /** 0..1 how freely it swaps with other products of the same basket. */
  substitutability: number;
  /** Regional taste hint: 'coastal' | 'inland' | undefined. */
  origin?: 'coastal' | 'inland';
  /** 0..1 how distinct it feels from others in the subbasket (drives novelty ceiling). */
  distinctiveness: number;
}

/**
 * Representative seed over the current catalogue. Extensible: add a product key here (plus its
 * goods row and recipe) and the solver picks it up with no code change. Unknown goods fall back
 * to neutral metadata in their own subbasket.
 */
export const PRODUCT_META: Record<string, ProductMeta> = {
  raw_grain:      { basket: 'staple_food', subbasket: 'grain_porridge', functional_value: 1, base_preference: 0.8, substitutability: 1, distinctiveness: 0.2 },
  baked_staples:  { basket: 'staple_food', subbasket: 'bread', functional_value: 1, base_preference: 1.25, substitutability: 1, distinctiveness: 0.4 },
  preserved_food: { basket: 'staple_food', subbasket: 'preserved', functional_value: 1, base_preference: 0.9, substitutability: 1, distinctiveness: 0.5 },
  raw_fish:       { basket: 'staple_food', subbasket: 'protein', functional_value: 1, base_preference: 1, substitutability: 1, origin: 'coastal', distinctiveness: 0.6 },
  raw_meat:       { basket: 'staple_food', subbasket: 'protein', functional_value: 1, base_preference: 1.1, substitutability: 1, origin: 'inland', distinctiveness: 0.6 },
  well_water:     { basket: 'drinking_water', subbasket: 'water', functional_value: 1, base_preference: 1, substitutability: 1, distinctiveness: 0 },
  peat:           { basket: 'fuel', subbasket: 'solid_fuel', functional_value: 1, base_preference: 0.8, substitutability: 1, distinctiveness: 0.2 },
  charcoal:       { basket: 'fuel', subbasket: 'solid_fuel', functional_value: 1, base_preference: 1.2, substitutability: 1, distinctiveness: 0.3 },
  textile_basic:  { basket: 'basic_clothing', subbasket: 'garments', functional_value: 1, base_preference: 1, substitutability: 1, distinctiveness: 0.3 },
  pottery:        { basket: 'variety', subbasket: 'household_wares', functional_value: 1, base_preference: 1, substitutability: 0.8, distinctiveness: 0.6 },
  olive_oil:      { basket: 'variety', subbasket: 'condiments', functional_value: 1, base_preference: 1.1, substitutability: 0.8, distinctiveness: 0.7 },
  baked_refined:  { basket: 'feast', subbasket: 'fine_bread', functional_value: 1, base_preference: 1, substitutability: 0.8, distinctiveness: 0.5 },
  wine_standard:  { basket: 'feast', subbasket: 'wine', functional_value: 1, base_preference: 1.1, substitutability: 0.8, distinctiveness: 0.6 },
  wine_luxury:    { basket: 'feast', subbasket: 'wine', functional_value: 1, base_preference: 1.3, substitutability: 0.7, distinctiveness: 0.8 },
  feast_goods:    { basket: 'feast', subbasket: 'banquet', functional_value: 1, base_preference: 1.2, substitutability: 0.7, distinctiveness: 0.8 },
  textile_fine:   { basket: 'luxury_clothing', subbasket: 'fine_cloth', functional_value: 1, base_preference: 1, substitutability: 0.7, distinctiveness: 0.7 },
  jewelry:        { basket: 'luxury_clothing', subbasket: 'adornment', functional_value: 1, base_preference: 1.2, substitutability: 0.6, distinctiveness: 0.9 },
};

export function productMeta(good: string, basket: string): ProductMeta {
  return PRODUCT_META[good] ?? { basket, subbasket: good, functional_value: 1, base_preference: 1, substitutability: 1, distinctiveness: 0.3 };
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const pos = (x: number) => (Number.isFinite(x) ? Math.max(0, x) : 0);

export interface ProductChoiceInput {
  good: string;
  basket: string;
  /** Reference price (base × quality, NO scarcity: avoids the price↔demand loop inside one pass). */
  referencePrice: number;
  /** Basket average reference price in this city. */
  basketAveragePrice: number;
  quality: number;
  /** 0..100 origin reputation reachable in this city. */
  fame: number;
  /** Share (0..1) of this product in the city's consumption of the basket last committed turn. */
  familiarity: number;
  /** Share (0..1) of this product among what is locally available / produced now. */
  prevalence: number;
  coastal: boolean;
  /** Household budget relief: 1 = comfortable, 0 = cannot afford anything above subsistence. */
  affordability: number;
  /** Legacy substitutability weight from goods.friction_profile. */
  substitutability: number;
}

export interface Attractiveness {
  good: string; preference: number; region: number; familiarity: number; novelty: number;
  quality: number; fame: number; price: number; total: number;
}

/**
 * Bounded multiplicative attractiveness. Novelty comes from LOW LOCAL PREVALENCE (how common the
 * product already is in the city), capped by distinctiveness and saturating — never from
 * 1/production, so throttling your own output cannot manufacture value.
 */
export function attractiveness(i: ProductChoiceInput): Attractiveness {
  const M = PRODUCT_MARKET, meta = productMeta(i.good, i.basket);
  const preference = 1 + M.preferenceSpan * Math.tanh(meta.base_preference - 1);
  const region = meta.origin === 'coastal' ? (i.coastal ? M.coastalAffinity : M.inlandAffinity) : 1;
  const familiarity = 1 + M.familiaritySpan * clamp01(i.familiarity);
  const novelty = 1 + M.noveltySpan * meta.distinctiveness * clamp01(1 - clamp01(i.prevalence) / M.noveltySaturation);
  const quality = 1 + M.qualitySpan * Math.tanh(pos(i.quality) / 2);
  const fame = 1 + M.fameSpan * clamp01(i.fame / 100) * clamp01(i.affordability);
  const relative = i.basketAveragePrice > 0 ? pos(i.referencePrice) / i.basketAveragePrice : 1;
  // Poorer households react more strongly to price differences.
  const elasticity = M.priceElasticity * (1.5 - 0.5 * clamp01(i.affordability));
  const price = Math.pow(Math.max(0.2, relative), -elasticity);
  const total = preference * region * familiarity * novelty * quality * fame * price * Math.max(0.01, i.substitutability);
  return { good: i.good, preference, region, familiarity, novelty, quality, fame, price, total };
}

/** Normalised demand shares; sum exactly 1 (or all 0 when no option). Deterministic tie order. */
export function demandShares(options: ProductChoiceInput[]) {
  const rows = [...options].sort((a, b) => a.good.localeCompare(b.good)).map(attractiveness);
  const sum = rows.reduce((s, r) => s + r.total, 0);
  return rows.map(r => ({ ...r, share: sum > 0 ? r.total / sum : 0 }));
}

/**
 * Within-basket diversity (utility only). Effective number of products (exp Shannon), normalised
 * to 0..1 by the number of offered options. Never affects need quantity or survival.
 */
export function diversityIndex(quantities: number[]) {
  const q = quantities.map(pos).filter(x => x > 0), total = q.reduce((s, x) => s + x, 0);
  if (q.length <= 1 || total <= 0) return { effective: q.length ? 1 : 0, index: 0 };
  const h = -q.reduce((s, x) => s + (x / total) * Math.log(x / total), 0);
  const effective = Math.exp(h);
  return { effective, index: clamp01((effective - 1) / (q.length - 1)) };
}

/**
 * Producer margin at LOCAL market prices: output value − input value. Input costs never raise
 * the output price; fame only raises what buyers are willing to pay (price side).
 */
export function recipeMargin(outputQty: number, outputPrice: number, inputs: { qty: number; price: number }[]) {
  const revenue = pos(outputQty) * pos(outputPrice);
  const cost = inputs.reduce((s, i) => s + pos(i.qty) * pos(i.price), 0);
  return { revenue, cost, margin: revenue - cost, margin_ratio: revenue > 0 ? (revenue - cost) / revenue : -1 };
}

/**
 * AUTO production choice among alternative recipes of one structure: weight by expected margin ×
 * unmet effective demand. Loss-making recipes get zero weight (fame cannot keep them alive).
 * Returns normalised allocation weights; all-zero when nothing pays.
 */
export function autoRecipeWeights(options: { key: string; margin: number; unmetDemand: number; inputsAvailable: boolean }[]) {
  const scored = options.map(o => ({ key: o.key,
    score: o.inputsAvailable && o.margin > 0 ? o.margin * Math.max(0.1, pos(o.unmetDemand)) : 0 }));
  const sum = scored.reduce((s, o) => s + o.score, 0);
  return Object.fromEntries(scored.map(o => [o.key, sum > 0 ? o.score / sum : 0]));
}

export interface CityAccountsInput {
  city: string;
  /** Σ(gross output − intermediate inputs) of the city, from the physical ledger. */
  valueAdded: number;
  householdTaxRate: number;
  /** Need-class household demand per good with local and base prices. */
  needs: { good: string; qty: number; localPrice: number; basePrice: number; consumed: number }[];
  /** Discretionary goods the households would like to buy (value at local price). */
  discretionaryWish: number;
  /** Per-basket consumed quantities per product, for diversity. */
  basketConsumption: Record<string, number[]>;
}

/**
 * CITY ACCOUNTS. GDP ≠ income ≠ purchasing power ≠ treasury. Private wealth stock is NOT
 * modelled (deferred): every figure is a per-turn flow derived from the physical ledger.
 */
export function cityAccounts(i: CityAccountsInput) {
  const M = PRODUCT_MARKET, gdp = pos(i.valueAdded);
  // The physical ledger values gross output at BASE prices, so city_gdp is a CONSTANT-PRICE figure.
  // Households, however, buy at local (scarcity/quality/fame) prices. Comparing a constant-price
  // income against a local-price basket understated affordability by the whole price index, which
  // made every city look bankrupt. Producers sell at local prices, so nominal income carries the
  // same price level as the basket: nominal = constant-price × price_level. Real purchasing power
  // is unchanged by this (it divides the level out again) — only the money comparison is honest.
  const basicCost = i.needs.reduce((s, n) => s + pos(n.qty) * pos(n.localPrice), 0);
  const basicCostAtBase = i.needs.reduce((s, n) => s + pos(n.qty) * pos(n.basePrice), 0);
  const priceIndex = basicCostAtBase > 0 ? basicCost / basicCostAtBase : 1;
  const priceLevel = Math.max(0.05, priceIndex);
  const laborIncome = gdp * M.laborShare * priceLevel;
  const capitalIncome = gdp * (1 - M.laborShare) * M.localCapitalShare * priceLevel;
  const grossIncome = laborIncome + capitalIncome;
  const taxes = grossIncome * clamp01(i.householdTaxRate);
  const disposable = grossIncome - taxes;
  const purchasingPower = disposable * M.propensityToConsume;
  const realPurchasingPower = purchasingPower / priceLevel;
  const discretionaryBudget = Math.max(0, purchasingPower - basicCost);
  const needQty = i.needs.reduce((s, n) => s + pos(n.qty), 0);
  const consumed = i.needs.reduce((s, n) => s + Math.min(pos(n.qty), pos(n.consumed)), 0);
  const physicalCoverage = needQty > 0 ? consumed / needQty : 1;
  /** Money shortfall for the basic basket even if every unit were physically available. */
  const affordabilityGap = Math.max(0, basicCost - purchasingPower);
  const affordability = basicCost > 0 ? clamp01(purchasingPower / basicCost) : 1;
  /** Discretionary demand is hard budget-constrained. */
  const discretionaryFunded = Math.min(pos(i.discretionaryWish), discretionaryBudget);
  const discretionaryRatio = i.discretionaryWish > 0 ? discretionaryFunded / i.discretionaryWish : 1;
  const diversity = Object.fromEntries(Object.entries(i.basketConsumption).map(([b, q]) => [b, diversityIndex(q)]));
  return {
    city: i.city, city_gdp: gdp, labor_income: laborIncome, capital_income: capitalIncome,
    household_income: grossIncome, household_taxes: taxes, disposable_income: disposable,
    purchasing_power: purchasingPower, basic_basket_cost: basicCost, price_index: priceIndex,
    /** Nominal counterpart of the constant-price city_gdp (city_gdp × local price level). */
    nominal_gdp: gdp * priceLevel, price_level: priceLevel,
    real_purchasing_power: realPurchasingPower, discretionary_budget: discretionaryBudget,
    discretionary_wish: pos(i.discretionaryWish), discretionary_funded: discretionaryFunded,
    discretionary_ratio: discretionaryRatio, physical_need_coverage: physicalCoverage,
    affordability_gap: affordabilityGap, affordability, diversity,
    proxy: true, private_wealth: null as null,
  };
}
export type CityAccounts = ReturnType<typeof cityAccounts>;
