/**
 * Chronicle Economy v4.3 — Client-side Goods Catalog
 * 
 * 12-basket civilizational hierarchy with 6 tier classes.
 * Source of truth is the DB; this is a convenience mirror.
 * 
 * v4.3: Expanded from 10 to 12 baskets. Added tierClass, phaseActive flags,
 *        metadata fields (stateEffect, routeEffect, etc.) — inactive in Phase 1.
 *        Legacy basket remap for backward compatibility.
 */

// ═══════════════════════════════════════════
// CAPABILITY TAGS — what a node can do
// ═══════════════════════════════════════════

export const CAPABILITY_TAGS: Record<string, { label: string; icon: string; description: string }> = {
  farming: { label: "Zemědělství", icon: "🌾", description: "Pěstování plodin a chov" },
  herding: { label: "Pastevectví", icon: "🐑", description: "Chov dobytka a ovcí" },
  fishing: { label: "Rybolov", icon: "🐟", description: "Lov ryb" },
  logging: { label: "Těžba dřeva", icon: "🪵", description: "Kácení a sběr dřeva" },
  mining: { label: "Hornictví", icon: "⛏️", description: "Těžba rudy a minerálů" },
  quarrying: { label: "Lámání kamene", icon: "🪨", description: "Těžba kamene a mramoru" },
  gathering: { label: "Sběr", icon: "🌿", description: "Sběr pryskyřice, bylin" },
  viticulture: { label: "Vinařství", icon: "🍇", description: "Pěstování vinné révy" },
  milling: { label: "Mletí", icon: "🏭", description: "Mletí obilí na mouku" },
  sawing: { label: "Řezání", icon: "🪚", description: "Řezání dřeva na řezivo" },
  smelting: { label: "Tavení", icon: "🔥", description: "Tavení rudy na ingoty" },
  stonecutting: { label: "Kamenictví", icon: "🧱", description: "Řezání kamenných bloků" },
  spinning: { label: "Předení", icon: "🧶", description: "Předení vláken na přízi" },
  pressing: { label: "Lisování", icon: "🫒", description: "Lisování oleje" },
  tanning: { label: "Činění", icon: "🪡", description: "Činění kůží" },
  preserving: { label: "Konzervace", icon: "🥫", description: "Sušení, solení potravin" },
  baking: { label: "Pečení", icon: "🍞", description: "Pečení chleba a pečiva" },
  weaving: { label: "Tkaní", icon: "🧵", description: "Tkaní textilu" },
  smithing: { label: "Kovářství", icon: "🔨", description: "Kování nástrojů a zbraní" },
  armoring: { label: "Zbrojířství", icon: "🛡️", description: "Výroba výzbroje" },
  fermenting: { label: "Kvašení", icon: "🍷", description: "Výroba vína a nápojů" },
  crafting: { label: "Řemeslo", icon: "🏺", description: "Obecné řemeslné výrobky" },
  construction: { label: "Stavitelství", icon: "🏗️", description: "Výroba stavebních materiálů" },
  ritual_craft: { label: "Rituální řemeslo", icon: "🕯️", description: "Výroba rituálních předmětů" },
  master_craft: { label: "Mistrovské řemeslo", icon: "⚜️", description: "Cechové mistrovství" },
};

// ═══════════════════════════════════════════
// NODE SUBTYPE → CAPABILITY TAGS MAPPING
// ═══════════════════════════════════════════

export type ProductionRole = "source" | "processing" | "urban" | "guild";

export const NODE_CAPABILITY_MAP: Record<string, { role: ProductionRole; tags: string[] }> = {
  // Source (existing micro/minor)
  field: { role: "source", tags: ["farming"] },
  vineyard: { role: "source", tags: ["farming", "viticulture"] },
  hunting_ground: { role: "source", tags: ["herding", "gathering"] },
  pastoral_camp: { role: "source", tags: ["herding"] },
  fishery: { role: "source", tags: ["fishing"] },
  fishing_village: { role: "source", tags: ["fishing"] },
  mine: { role: "source", tags: ["mining"] },
  mining_camp: { role: "source", tags: ["mining"] },
  quarry: { role: "source", tags: ["quarrying"] },
  sawmill: { role: "source", tags: ["logging", "sawing"] },
  lumber_camp: { role: "source", tags: ["logging"] },
  herbalist: { role: "source", tags: ["gathering"] },
  resin_collector: { role: "source", tags: ["logging", "gathering"] },
  salt_pan: { role: "source", tags: ["mining"] },
  village: { role: "source", tags: ["farming", "herding"] },

  // Processing (new + upgraded existing)
  smithy: { role: "processing", tags: ["smelting", "smithing"] },
  mill: { role: "processing", tags: ["milling"] },
  press: { role: "processing", tags: ["pressing"] },
  tannery: { role: "processing", tags: ["tanning"] },
  spinner: { role: "processing", tags: ["spinning"] },
  stonecutter: { role: "processing", tags: ["stonecutting"] },
  smokehouse: { role: "processing", tags: ["preserving"] },
  smelter: { role: "processing", tags: ["smelting"] },

  // Urban (new city-attached)
  bakery: { role: "urban", tags: ["baking"] },
  forge: { role: "urban", tags: ["smithing", "armoring"] },
  weaver: { role: "urban", tags: ["weaving"] },
  winery: { role: "urban", tags: ["fermenting"] },
  pottery_workshop: { role: "urban", tags: ["crafting"] },
  armory: { role: "urban", tags: ["smithing", "armoring"] },
  builder_yard: { role: "urban", tags: ["construction"] },

  // Guild (new)
  guild_workshop: { role: "guild", tags: ["master_craft"] },
  master_workshop: { role: "guild", tags: ["master_craft"] },
  court_manufactory: { role: "guild", tags: ["master_craft"] },
  temple_workshop: { role: "guild", tags: ["ritual_craft", "master_craft"] },

  // Major nodes
  trade_hub: { role: "urban", tags: ["construction"] },
  trade_post: { role: "urban", tags: [] },
  shrine: { role: "source", tags: ["ritual_craft"] },
  watchtower: { role: "source", tags: [] },
  outpost: { role: "source", tags: [] },
};

// ═══════════════════════════════════════════
// DEMAND BASKETS — v4.3 12-basket hierarchy
// ═══════════════════════════════════════════

export interface DemandBasketDef {
  key: string;
  label: string;
  icon: string;
  tier: number;
  description: string;
  socialWeights: { peasants: number; burghers: number; clerics: number; warriors: number };
}

export const DEMAND_BASKETS: DemandBasketDef[] = [
  // NEED tier (1)
  { key: "staple_food", label: "Základní potraviny", icon: "🍞", tier: 1, description: "Chléb, obilí, maso — přežití", socialWeights: { peasants: 1.0, burghers: 0.6, clerics: 0.3, warriors: 0.8 } },
  { key: "basic_clothing", label: "Základní oděv", icon: "👕", tier: 1, description: "Tkaniny, kůže, základní oblečení", socialWeights: { peasants: 0.4, burghers: 0.7, clerics: 0.5, warriors: 0.3 } },
  { key: "tools", label: "Nástroje & nářadí", icon: "🔧", tier: 1, description: "Kovové nástroje, kožené výrobky", socialWeights: { peasants: 0.7, burghers: 0.5, clerics: 0.2, warriors: 0.4 } },
  { key: "fuel", label: "Palivo a teplo", icon: "🔥", tier: 1, description: "Dřevo, uhlí — topení, výroba", socialWeights: { peasants: 0.6, burghers: 0.5, clerics: 0.3, warriors: 0.4 } },
  // CIVIC tier (2)
  { key: "drinking_water", label: "Pitná voda", icon: "💧", tier: 2, description: "Studny, cisterny, akvadukty", socialWeights: { peasants: 0.8, burghers: 0.7, clerics: 0.5, warriors: 0.6 } },
  { key: "storage_logistics", label: "Skladování a logistika", icon: "📦", tier: 2, description: "Sklady, distribuce, řetězce zásobování", socialWeights: { peasants: 0.2, burghers: 0.8, clerics: 0.3, warriors: 0.3 } },
  { key: "admin_supplies", label: "Správní potřeby", icon: "📜", tier: 2, description: "Pergamen, inkoust, správní aparát", socialWeights: { peasants: 0.1, burghers: 0.4, clerics: 0.7, warriors: 0.2 } },
  // UPGRADE tier (3)
  { key: "construction", label: "Stavební materiály", icon: "🧱", tier: 3, description: "Dřevo, kámen, stavební bloky", socialWeights: { peasants: 0.3, burghers: 0.6, clerics: 0.4, warriors: 0.3 } },
  { key: "metalwork", label: "Kovovýroba", icon: "⚒️", tier: 3, description: "Ingoty, kované díly, kovové výrobky", socialWeights: { peasants: 0.5, burghers: 0.7, clerics: 0.2, warriors: 0.4 } },
  // MILITARY tier (4)
  { key: "military_supply", label: "Vojenské zásoby", icon: "⚔️", tier: 4, description: "Zbraně, výzbroj, munice", socialWeights: { peasants: 0.1, burghers: 0.2, clerics: 0.1, warriors: 1.0 } },
  // LUXURY tier (6) — tier 5 (prestige) reserved for Phase 2
  { key: "luxury_clothing", label: "Luxusní oděvy", icon: "👑", tier: 6, description: "Hedvábí, brokát, jemné textilie", socialWeights: { peasants: 0.05, burghers: 0.5, clerics: 0.3, warriors: 0.6 } },
  { key: "feast", label: "Slavnostní hostiny", icon: "🥂", tier: 6, description: "Lahůdky, kvalitní víno, slavnosti", socialWeights: { peasants: 0.1, burghers: 0.6, clerics: 0.4, warriors: 0.4 } },
];

// ═══════════════════════════════════════════
// LEGACY BASKET REMAP — temporary bridge for old DB keys
// ═══════════════════════════════════════════

/**
 * Maps old v4.2 basket keys to new v4.3 keys.
 * This is a TEMPORARY bridge, not final semantics.
 * Legacy goods in DB still reference these old keys in demand_basket column.
 */
export const LEGACY_BASKET_MAP: Record<string, string> = {
  basic_material: "metalwork",
  textile: "basic_clothing",
  variety: "feast",
  ritual: "luxury_clothing",
  prestige: "luxury_clothing",
};

/**
 * Resolves a basket key, remapping legacy keys if needed.
 * Logs warnings for unknown/remapped keys.
 */
export function resolveBasketKey(raw: string, warnings?: string[]): string {
  if (BASKET_CONFIG[raw]) return raw;
  const mapped = LEGACY_BASKET_MAP[raw];
  if (mapped) {
    if (warnings) warnings.push(`Legacy remap: ${raw} → ${mapped}`);
    return mapped;
  }
  if (warnings) warnings.push(`Unknown basket_key: ${raw}, fallback to staple_food`);
  console.warn(`[goodsCatalog] Unknown basket_key: "${raw}", falling back to staple_food`);
  return "staple_food";
}

// ═══════════════════════════════════════════
// TRADE IDEOLOGY — mechanical binding
// ═══════════════════════════════════════════

export interface TradeIdeologyDef {
  key: string;
  label: string;
  icon: string;
  merchantFlowMult: number;
  tariffBase: number;
  guildPower: string;
  stateCapture: string;
  importOpenness: string;
  description: string;
}

export const TRADE_IDEOLOGIES: TradeIdeologyDef[] = [
  { key: "customary_local", label: "Zvykové místní", icon: "🏘️", merchantFlowMult: 0.6, tariffBase: 0, guildPower: "nízká", stateCapture: "nízký", importOpenness: "nízká", description: "Tradiční lokální ekonomika, malý dálkový obchod" },
  { key: "open_merchant", label: "Volný obchod", icon: "🚢", merchantFlowMult: 1.2, tariffBase: 0.05, guildPower: "střední", stateCapture: "nízký", importOpenness: "vysoká", description: "Svobodný obchod vedený kupci" },
  { key: "guild_chartered", label: "Cechovní listina", icon: "⚜️", merchantFlowMult: 0.9, tariffBase: 0.10, guildPower: "vysoká", stateCapture: "střední", importOpenness: "střední", description: "Obchod regulovaný cechy" },
  { key: "crown_mercantile", label: "Korunní merkantilismus", icon: "👑", merchantFlowMult: 0.7, tariffBase: 0.20, guildPower: "nízká", stateCapture: "vysoký", importOpenness: "nízká", description: "Státem řízený obchod" },
  { key: "palace_commanded", label: "Palácová ekonomika", icon: "🏛️", merchantFlowMult: 0.5, tariffBase: 0.30, guildPower: "žádná", stateCapture: "velmi vysoký", importOpenness: "velmi nízká", description: "Centralizovaná kontrola výroby a distribuce" },
];

// ═══════════════════════════════════════════
// GUILD PROGRESSION
// ═══════════════════════════════════════════

export interface GuildLevelEffect {
  level: number;
  qualityBoost: number;
  branchUnlock: boolean;
  famousGoodChance: number;
  exportReach: number;
  marketCapture: number;
  politicalWeight: string;
}

export const GUILD_PROGRESSION: GuildLevelEffect[] = [
  { level: 1, qualityBoost: 0, branchUnlock: false, famousGoodChance: 0, exportReach: 0, marketCapture: 0, politicalWeight: "žádná" },
  { level: 2, qualityBoost: 1, branchUnlock: false, famousGoodChance: 0.05, exportReach: 0.10, marketCapture: 0.05, politicalWeight: "nízká" },
  { level: 3, qualityBoost: 1, branchUnlock: true, famousGoodChance: 0.10, exportReach: 0.20, marketCapture: 0.10, politicalWeight: "střední" },
  { level: 4, qualityBoost: 2, branchUnlock: true, famousGoodChance: 0.20, exportReach: 0.25, marketCapture: 0.12, politicalWeight: "vysoká" },
  { level: 5, qualityBoost: 2, branchUnlock: true, famousGoodChance: 0.30, exportReach: 0.30, marketCapture: 0.15, politicalWeight: "dominantní" },
];

// ═══════════════════════════════════════════
// MACRO INTEGRATION — how goods feed top-bar (v4.3 updated)
// ═══════════════════════════════════════════

export const MACRO_DERIVATION: Record<string, { label: string; icon: string; sources: string[] }> = {
  production: {
    label: "⚒️ Produkce",
    icon: "⚒️",
    sources: [
      "Extrakce source nodes (objem × kvalita)",
      "Processing throughput (konverze raw→processed)",
      "Urban final goods output",
      "Guild efficiency bonusy",
      "Workforce utilization",
      "Supply chain konektivita (izolace snižuje)",
    ],
  },
  wealth: {
    label: "💰 Bohatství",
    icon: "💰",
    sources: [
      "Populační daň: pop × urbanizace",
      "Tržní daň: domácí objem × market_level",
      "Tranzitní daň: průtok × toll_rate",
      "Extrakční daň: korunní doly, monopoly",
      "Capture bonus: export × cizí poptávka (metalwork, luxury_clothing)",
      "Leakage penalizace: import závislost",
    ],
  },
  supplies: {
    label: "🌾 Zásoby",
    icon: "🌾",
    sources: [
      "Goods s tagem storable=true",
      "Obilí, mouka, konzervované jídlo, sůl",
      "Dřevo, ingoty, olej, základní textil",
      "Storage infrastruktura (storage_logistics basket)",
    ],
  },
  capacity: {
    label: "🏛️ Kapacita",
    icon: "🏛️",
    sources: [
      "Materiální: stavební goods (construction basket)",
      "Institucionální: guild level + urbanizace + admin_supplies basket",
      "Logistická: access_score + hustota uzlů + storage_logistics",
    ],
  },
  faith: {
    label: "⛪ Víra",
    icon: "⛪",
    sources: [
      "Temple/shrine node output",
      "Cleric satisfaction score",
      "Chrámové stavební goods",
      "Luxury_clothing basket partial (cult component)",
    ],
  },
  prestige: {
    label: "⭐ Prestiž",
    icon: "⭐",
    sources: [
      "Luxury goods produkce (luxury_clothing + feast)",
      "Famous goods (guild tradice)",
      "Export high-tier goods (capture prestige)",
      "Monumentální výstavba",
    ],
  },
  population: {
    label: "👥 Populace",
    icon: "👥",
    sources: [
      "Staple food basket → růst/úbytek",
      "Drinking_water basket → health/growth support",
      "Urban comfort + feast → urban pull",
      "Zaměstnanost v produkčních chainech",
      "Import dependency šoky → krizové riziko",
    ],
  },
};

// ═══════════════════════════════════════════
// TRADE PRESSURE FORMULA — v4.3 tier-class based
// ═══════════════════════════════════════════

export const TRADE_PRESSURE_WEIGHTS: Record<string, number> = {
  need: 1.0,
  civic: 0.7,
  upgrade: 0.6,
  military: 0.5,
  luxury: 0.3,
  // prestige tier class reserved for Phase 2 — no baskets use it yet
};

export const TRADE_FLOW_STATUSES = [
  { key: "latent", label: "Latentní", color: "text-muted-foreground", description: "Potenciální tok, zatím neaktivní" },
  { key: "trial", label: "Zkušební", color: "text-yellow-500", description: "Nově vznikající tok" },
  { key: "active", label: "Aktivní", color: "text-green-500", description: "Stabilní obchodní tok" },
  { key: "dominant", label: "Dominantní", color: "text-primary", description: "Hlavní obchodní tepna" },
  { key: "blocked", label: "Blokovaný", color: "text-destructive", description: "Přerušený embargo nebo válkou" },
];

// ═══════════════════════════════════════════
// BASKET CONFIG — v4.3 civilizational 12-basket model
// ═══════════════════════════════════════════

export type BasketCategory = "universal" | "conditional" | "premium";

/** 6 tier classes. prestige is reserved for Phase 2 — no baskets use it yet. */
export type BasketTierClass = "need" | "civic" | "upgrade" | "military" | "prestige" | "luxury";

/** Which mechanics are active in Phase 1 */
export interface PhaseActiveFlags {
  basketFulfillment: boolean;
  marketability: boolean;
  uniqueSlots: boolean;
  /** stateEffect is inactive metadata only — NOT applied in any solver */
  stateEffect: boolean;
  /** routeEffect is inactive metadata only — NOT applied in any solver */
  routeEffect: boolean;
}

export interface BasketConfig {
  /** Base production rate per effective workforce unit */
  baseRate: number;
  /** Wealth value of this basket for market share calculation */
  basketValue: number;
  /** universal = always auto-produced, conditional = gated, premium = manual only */
  category: BasketCategory;
  /** Population weights for demand calculation */
  popWeights: { peasants: number; burghers: number; clerics: number; warriors: number };
  /** Tier for UI sorting */
  tier: number;
  /** Civilizational tier class */
  tierClass: BasketTierClass;
  /** Condition gate for conditional baskets (evaluated at city level) */
  condition?: (city: { market_level?: number; temple_level?: number; population_warriors?: number; population_total?: number; resource_deposits?: string[] }) => boolean;
  // ── Phase 1 metadata fields (informational only, NOT mechanically enforced) ──
  /** Resource dependencies — what raw resources feed this basket */
  resourceDependencies: string[];
  /** What production inputs are needed */
  productionInputs: string[];
  /** What drives demand for this basket */
  demandDrivers: string[];
  /** State effects — INACTIVE METADATA ONLY. Not applied in compute-trade-flows. */
  stateEffect: Record<string, number>;
  /** 0-1 exportability/tradability of this basket */
  marketability: number;
  /** How many unique product slots this basket supports (Phase 2) */
  uniqueProductSlots: number;
  /** Route/corridor effects — INACTIVE METADATA ONLY. */
  routeEffect?: Record<string, number>;
  /** Phase activation flags */
  phaseActive: PhaseActiveFlags;
}

export const SETTLEMENT_MULT: Record<string, number> = {
  HAMLET: 0.5,
  TOWNSHIP: 0.8,
  CASTLE: 0.9,
  CITY: 1.0,
  POLIS: 1.3,
};

export const BASKET_CONFIG: Record<string, BasketConfig> = {
  // ── NEED tier (1) ──
  staple_food: {
    baseRate: 0.012, basketValue: 8, category: "universal", tier: 1, tierClass: "need",
    popWeights: { peasants: 1.0, burghers: 0.6, clerics: 0.3, warriors: 0.8 },
    resourceDependencies: ["grain", "livestock", "fish"],
    productionInputs: ["farming", "herding", "fishing"],
    demandDrivers: ["population_total", "military_garrison"],
    stateEffect: { stability: 0.15, growth: 0.10 },
    marketability: 0.3, uniqueProductSlots: 0,
    phaseActive: { basketFulfillment: true, marketability: true, uniqueSlots: false, stateEffect: false, routeEffect: false },
  },
  basic_clothing: {
    baseRate: 0.004, basketValue: 10, category: "universal", tier: 1, tierClass: "need",
    popWeights: { peasants: 0.4, burghers: 0.7, clerics: 0.5, warriors: 0.3 },
    resourceDependencies: ["fiber", "wool", "flax", "cotton", "raw_hide"],
    productionInputs: ["spinning", "weaving", "tanning"],
    demandDrivers: ["population_total", "climate"],
    stateEffect: { stability: 0.05 },
    marketability: 0.5, uniqueProductSlots: 0,
    phaseActive: { basketFulfillment: true, marketability: true, uniqueSlots: false, stateEffect: false, routeEffect: false },
    condition: (city) => {
      const deps = city.resource_deposits || [];
      return deps.some(d => ["fiber", "livestock", "wool", "flax", "cotton", "raw_fiber", "raw_hide"].includes(d));
    },
  },
  tools: {
    baseRate: 0.006, basketValue: 10, category: "universal", tier: 1, tierClass: "need",
    popWeights: { peasants: 0.7, burghers: 0.5, clerics: 0.2, warriors: 0.4 },
    resourceDependencies: ["iron", "wood"],
    productionInputs: ["smithing", "crafting"],
    demandDrivers: ["population_total", "production_activity"],
    stateEffect: { production_efficiency: 0.05 },
    marketability: 0.5, uniqueProductSlots: 0,
    phaseActive: { basketFulfillment: true, marketability: true, uniqueSlots: false, stateEffect: false, routeEffect: false },
  },
  fuel: {
    baseRate: 0.004, basketValue: 6, category: "universal", tier: 1, tierClass: "need",
    popWeights: { peasants: 0.6, burghers: 0.5, clerics: 0.3, warriors: 0.4 },
    resourceDependencies: ["wood", "coal", "peat"],
    productionInputs: ["logging"],
    demandDrivers: ["population_total", "climate", "production_activity"],
    stateEffect: { stability: 0.03, production_efficiency: 0.02 },
    marketability: 0.2, uniqueProductSlots: 0,
    phaseActive: { basketFulfillment: true, marketability: true, uniqueSlots: false, stateEffect: false, routeEffect: false },
    // Soft gate: 70% baseline even without local fuel sources
  },

  // ── CIVIC tier (2) ──
  drinking_water: {
    baseRate: 0.003, basketValue: 5, category: "conditional", tier: 2, tierClass: "civic",
    popWeights: { peasants: 0.8, burghers: 0.7, clerics: 0.5, warriors: 0.6 },
    resourceDependencies: ["river", "well", "aquifer"],
    productionInputs: [],
    demandDrivers: ["population_total", "climate"],
    stateEffect: { health: 0.10, growth: 0.05 },
    marketability: 0.0, uniqueProductSlots: 0,
    phaseActive: { basketFulfillment: true, marketability: false, uniqueSlots: false, stateEffect: false, routeEffect: false },
    // Soft gate: always 80% minimum, full with water sources nearby
    condition: () => true, // Always active — soft gate applied at rate level
  },
  storage_logistics: {
    baseRate: 0.003, basketValue: 14, category: "conditional", tier: 2, tierClass: "civic",
    popWeights: { peasants: 0.2, burghers: 0.8, clerics: 0.3, warriors: 0.3 },
    resourceDependencies: [],
    productionInputs: ["construction"],
    demandDrivers: ["market_level", "trade_volume"],
    stateEffect: {},
    marketability: 0.3, uniqueProductSlots: 0,
    routeEffect: { capacity: 0.15, loss_reduction: 0.1 },
    phaseActive: { basketFulfillment: true, marketability: true, uniqueSlots: false, stateEffect: false, routeEffect: false },
    condition: (city) => (city.market_level ?? 0) >= 1,
  },
  admin_supplies: {
    baseRate: 0.002, basketValue: 12, category: "conditional", tier: 2, tierClass: "civic",
    popWeights: { peasants: 0.1, burghers: 0.4, clerics: 0.7, warriors: 0.2 },
    resourceDependencies: [],
    productionInputs: ["crafting"],
    demandDrivers: ["population_total", "settlement_level"],
    stateEffect: { tax_efficiency: 0.05, legitimacy: 0.03 },
    marketability: 0.2, uniqueProductSlots: 0,
    phaseActive: { basketFulfillment: true, marketability: true, uniqueSlots: false, stateEffect: false, routeEffect: false },
    condition: (city) => (city.population_total ?? 0) >= 300,
  },

  // ── UPGRADE tier (3) ──
  construction: {
    baseRate: 0.005, basketValue: 12, category: "universal", tier: 3, tierClass: "upgrade",
    popWeights: { peasants: 0.3, burghers: 0.6, clerics: 0.4, warriors: 0.3 },
    resourceDependencies: ["stone", "wood", "iron"],
    productionInputs: ["quarrying", "logging", "construction"],
    demandDrivers: ["building_activity", "population_growth"],
    stateEffect: { capacity: 0.10 },
    marketability: 0.4, uniqueProductSlots: 0,
    phaseActive: { basketFulfillment: true, marketability: true, uniqueSlots: false, stateEffect: false, routeEffect: false },
  },
  metalwork: {
    baseRate: 0.008, basketValue: 6, category: "conditional", tier: 3, tierClass: "upgrade",
    popWeights: { peasants: 0.5, burghers: 0.7, clerics: 0.2, warriors: 0.4 },
    resourceDependencies: ["iron", "copper", "tin", "raw_ore"],
    productionInputs: ["mining", "smelting", "smithing"],
    demandDrivers: ["population_total", "military_size", "construction"],
    stateEffect: { production_efficiency: 0.05, military_quality: 0.03 },
    marketability: 0.6, uniqueProductSlots: 1,
    phaseActive: { basketFulfillment: true, marketability: true, uniqueSlots: false, stateEffect: false, routeEffect: false },
    // Soft gate: local ore=full, import=50%, none=0
    condition: (city) => {
      const deps = city.resource_deposits || [];
      return deps.some(d => ["iron", "copper", "tin", "raw_ore", "ore", "metal"].includes(d));
    },
  },

  // ── MILITARY tier (4) ──
  military_supply: {
    baseRate: 0.003, basketValue: 15, category: "conditional", tier: 4, tierClass: "military",
    popWeights: { peasants: 0.1, burghers: 0.2, clerics: 0.1, warriors: 1.0 },
    resourceDependencies: ["iron", "leather", "wood"],
    productionInputs: ["smithing", "armoring", "tanning"],
    demandDrivers: ["military_size", "war_status"],
    stateEffect: { military_readiness: 0.10 },
    marketability: 0.4, uniqueProductSlots: 1,
    phaseActive: { basketFulfillment: true, marketability: true, uniqueSlots: false, stateEffect: false, routeEffect: false },
    condition: (city) => {
      const warriors = city.population_warriors || 0;
      const total = city.population_total || 1;
      return (warriors / total) > 0.05;
    },
  },

  // ── LUXURY tier (6) ── (tier 5 = prestige, reserved for Phase 2)
  luxury_clothing: {
    baseRate: 0, basketValue: 25, category: "premium", tier: 6, tierClass: "luxury",
    popWeights: { peasants: 0.05, burghers: 0.5, clerics: 0.3, warriors: 0.6 },
    resourceDependencies: ["silk", "dye", "gold"],
    productionInputs: ["weaving", "crafting", "master_craft"],
    demandDrivers: ["elite_population", "cultural_prestige"],
    stateEffect: { prestige: 0.10, legitimacy: 0.05 },
    marketability: 0.9, uniqueProductSlots: 2,
    phaseActive: { basketFulfillment: true, marketability: true, uniqueSlots: false, stateEffect: false, routeEffect: false },
  },
  feast: {
    baseRate: 0, basketValue: 20, category: "premium", tier: 6, tierClass: "luxury",
    popWeights: { peasants: 0.1, burghers: 0.6, clerics: 0.4, warriors: 0.4 },
    resourceDependencies: ["wine", "spices", "fish", "grain"],
    productionInputs: ["fermenting", "baking", "preserving"],
    demandDrivers: ["elite_population", "festivals", "diplomatic_events"],
    stateEffect: { stability: 0.05, prestige: 0.05 },
    marketability: 0.7, uniqueProductSlots: 1,
    phaseActive: { basketFulfillment: true, marketability: true, uniqueSlots: false, stateEffect: false, routeEffect: false },
  },
};

/** Helper: get canonical basket keys in tier order */
export const CANONICAL_BASKET_KEYS = Object.entries(BASKET_CONFIG)
  .sort((a, b) => a[1].tier - b[1].tier)
  .map(([k]) => k);

/** Pillar 2 weight constants */
export const PILLAR2_DOMESTIC_WEIGHT = 0.4;
export const PILLAR2_MARKET_SHARE_WEIGHT = 0.6;
