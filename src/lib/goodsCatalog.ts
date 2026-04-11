/**
 * Chronicle Economy v4.2 — Client-side Goods Catalog
 * 
 * Mirrors DB data for UI previews, recipe browsing, demand basket logic.
 * Source of truth is the DB; this is a convenience mirror.
 * 
 * v4.2: Added BASKET_CONFIG for auto-production + market share system.
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
// DEMAND BASKETS — aggregation layer
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
  { key: "staple_food", label: "Základní potraviny", icon: "🍞", tier: 1, description: "Chléb, obilí, maso — přežití", socialWeights: { peasants: 1.0, burghers: 0.6, clerics: 0.3, warriors: 0.8 } },
  { key: "basic_material", label: "Základní materiály", icon: "🪨", tier: 1, description: "Ruda, kůže — surové stavební kameny ekonomiky", socialWeights: { peasants: 0.5, burghers: 0.7, clerics: 0.2, warriors: 0.4 } },
  { key: "tools", label: "Nástroje & nářadí", icon: "🔧", tier: 1, description: "Kovové nástroje, kožené výrobky", socialWeights: { peasants: 0.7, burghers: 0.5, clerics: 0.2, warriors: 0.4 } },
  { key: "construction", label: "Stavební materiály", icon: "🧱", tier: 2, description: "Dřevo, kámen, stavební bloky", socialWeights: { peasants: 0.3, burghers: 0.6, clerics: 0.4, warriors: 0.3 } },
  { key: "textile", label: "Textil", icon: "🧵", tier: 2, description: "Vlákna, příze, tkaniny", socialWeights: { peasants: 0.4, burghers: 0.7, clerics: 0.5, warriors: 0.3 } },
  { key: "military_supply", label: "Vojenské zásoby", icon: "⚔️", tier: 2, description: "Zbraně, výzbroj, munice", socialWeights: { peasants: 0.1, burghers: 0.2, clerics: 0.1, warriors: 1.0 } },
  { key: "variety", label: "Rozmanitost", icon: "🎭", tier: 3, description: "Keramika, textil, víno — komfort", socialWeights: { peasants: 0.3, burghers: 0.8, clerics: 0.5, warriors: 0.3 } },
  { key: "ritual", label: "Rituální potřeby", icon: "🕯️", tier: 3, description: "Kadidlo, oleje, svíce, posvátné materiály", socialWeights: { peasants: 0.2, burghers: 0.3, clerics: 1.0, warriors: 0.2 } },
  { key: "feast", label: "Slavnostní pochutiny", icon: "🥂", tier: 4, description: "Lahůdky, kvalitní víno, sladkosti", socialWeights: { peasants: 0.1, burghers: 0.6, clerics: 0.4, warriors: 0.4 } },
  { key: "prestige", label: "Prestiž", icon: "👑", tier: 4, description: "Šperky, luxusní zbraně, jemné textilie", socialWeights: { peasants: 0.05, burghers: 0.5, clerics: 0.3, warriors: 0.6 } },
];

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
// MACRO INTEGRATION — how goods feed top-bar
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
      "Capture bonus: export × cizí poptávka",
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
      "Storage infrastruktura ovlivňuje kapacitu",
    ],
  },
  capacity: {
    label: "🏛️ Kapacita",
    icon: "🏛️",
    sources: [
      "Materiální: stavební goods (kámen, dřevo, bloky, železo)",
      "Institucionální: guild level + urbanizace + admin nodes",
      "Logistická: access_score + hustota uzlů + kvalita tras",
    ],
  },
  faith: {
    label: "⛪ Víra",
    icon: "⛪",
    sources: [
      "Ritual basket fulfillment (víno, kadidlo, oleje, textil)",
      "Temple/shrine node output",
      "Cleric satisfaction score",
      "Chrámové stavební goods",
    ],
  },
  prestige: {
    label: "⭐ Prestiž",
    icon: "⭐",
    sources: [
      "Luxury goods produkce (objem + kvalita)",
      "Famous goods (guild tradice)",
      "Export high-tier goods (capture prestige)",
      "Monumentální výstavba",
      "Kulturní a rituální rozmanitost",
    ],
  },
  population: {
    label: "👥 Populace",
    icon: "👥",
    sources: [
      "Staple food basket → růst/úbytek",
      "Stability basket → retence",
      "Urban comfort + variety → urban pull",
      "Zaměstnanost v produkčních chainech",
      "Import dependency šoky → krizové riziko",
    ],
  },
};

// ═══════════════════════════════════════════
// TRADE PRESSURE FORMULA (reference)
// ═══════════════════════════════════════════

export const TRADE_PRESSURE_WEIGHTS = {
  need: 1.0,
  upgrade: 0.6,
  variety: 0.4,
  prestige: 0.3,
  ritual: 0.5,
};

export const TRADE_FLOW_STATUSES = [
  { key: "latent", label: "Latentní", color: "text-muted-foreground", description: "Potenciální tok, zatím neaktivní" },
  { key: "trial", label: "Zkušební", color: "text-yellow-500", description: "Nově vznikající tok" },
  { key: "active", label: "Aktivní", color: "text-green-500", description: "Stabilní obchodní tok" },
  { key: "dominant", label: "Dominantní", color: "text-primary", description: "Hlavní obchodní tepna" },
  { key: "blocked", label: "Blokovaný", color: "text-destructive", description: "Přerušený embargo nebo válkou" },
];
