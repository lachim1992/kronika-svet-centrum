/**
 * Minor & Micro Node Type Definitions
 * Hierarchie: Micronode → Minor Node → Major Node → Capital
 */

// ═══════════════════════════════════════════
// NODE TIERS
// ═══════════════════════════════════════════

export type NodeTier = "major" | "minor" | "micro";

export const NODE_TIER_LABELS: Record<NodeTier, string> = {
  major: "Major (město/hrad)",
  minor: "Minor (osada)",
  micro: "Micro (zázemí)",
};

export const NODE_TIER_COLORS: Record<NodeTier, string> = {
  major: "text-primary",
  minor: "text-yellow-500",
  micro: "text-emerald-500",
};

// ═══════════════════════════════════════════
// MAJOR NODE TYPES (4 typy — město, hrad, obchodní hub, strážní stanice)
// ═══════════════════════════════════════════

export interface MajorNodeDef {
  key: string;
  label: string;
  icon: string;
  preferredBiomes: string[];
  description: string;
  dbNodeType: string; // maps to province_nodes.node_type
  bonusEffect: string;
}

export const MAJOR_NODE_TYPES: MajorNodeDef[] = [
  {
    key: "city",
    label: "Město",
    icon: "🏙️",
    preferredBiomes: ["plains", "grassland", "temperate", "river", "coastal"],
    description: "Hlavní sídlo s vysokou populací. Hub pro ekonomické toky a zásobování.",
    dbNodeType: "primary_city",
    bonusEffect: "Hub role — akumuluje produkci z minor uzlů, generuje bohatství",
  },
  {
    key: "fortress",
    label: "Hrad",
    icon: "🏰",
    preferredBiomes: ["hills", "mountain", "highland", "forest"],
    description: "Opevněné sídlo. Kontroluje průchod a poskytuje vojenskou ochranu.",
    dbNodeType: "fortress",
    bonusEffect: "+fortifikace, gateway role — blokuje nepřátelský postup",
  },
  {
    key: "trade_hub",
    label: "Obchodní stanice",
    icon: "🏪",
    preferredBiomes: ["plains", "grassland", "coastal", "river", "steppe"],
    description: "Velké obchodní centrum na křižovatce tras. Maximalizuje wealth throughput.",
    dbNodeType: "trade_hub",
    bonusEffect: "+trade efficiency, wealth multiplikátor z průchozích tras",
  },
  {
    key: "guard_station",
    label: "Strážní stanice",
    icon: "⚔️",
    preferredBiomes: ["hills", "mountain", "highland", "plains", "steppe", "forest"],
    description: "Vojenská stanice kontrolující oblast. Strategický přehled a obrana.",
    dbNodeType: "fortress",
    bonusEffect: "+vision, zpomalení nepřátel, regulator role",
  },
];

export function suggestMajorType(biome: string): string {
  const b = biome?.toLowerCase() || "";
  if (b.includes("hill") || b.includes("mountain") || b.includes("highland")) return "fortress";
  if (b.includes("coast") || b.includes("river")) return "trade_hub";
  if (b.includes("steppe") || b.includes("desert")) return "guard_station";
  return "city";
}

export function getCompatibleMajorTypes(biome: string): MajorNodeDef[] {
  const b = biome?.toLowerCase() || "";
  return MAJOR_NODE_TYPES.filter(t =>
    t.preferredBiomes.some(pb => b.includes(pb)) || t.key === "guard_station"
  );
}

// ═══════════════════════════════════════════
// MINOR NODE TYPES (8 osad)
// ═══════════════════════════════════════════

export interface MinorNodeDef {
  key: string;
  label: string;
  icon: string;
  preferredBiomes: string[];
  baseProduction: { grain: number; wood: number; stone: number; iron: number; wealth: number; faith: number };
  bonusEffect: string;
  description: string;
  maxUpgrade: number;
  upgradeBonus: number; // production multiplier per level
}

export const MINOR_NODE_TYPES: MinorNodeDef[] = [
  {
    key: "village",
    label: "Vesnice",
    icon: "🏘️",
    preferredBiomes: ["plains", "forest", "grassland", "temperate"],
    baseProduction: { grain: 4, wood: 2, stone: 0, iron: 0, wealth: 1, faith: 0 },
    bonusEffect: "Vyvážená produkce, základní populace",
    description: "Obecná osada s vyváženou produkcí. Základ pro kolonizaci nového území.",
    maxUpgrade: 5,
    upgradeBonus: 0.2,
  },
  {
    key: "lumber_camp",
    label: "Dřevařská osada",
    icon: "🪵",
    preferredBiomes: ["forest", "dense_forest", "taiga"],
    baseProduction: { grain: 1, wood: 8, stone: 0, iron: 0, wealth: 1, faith: 0 },
    bonusEffect: "+50% wood z okolních micro lesních hexů",
    description: "Osada zaměřená na těžbu dřeva. Ideální v hustých lesích.",
    maxUpgrade: 5,
    upgradeBonus: 0.25,
  },
  {
    key: "fishing_village",
    label: "Rybářská osada",
    icon: "🎣",
    preferredBiomes: ["coastal", "lake", "river", "marsh"],
    baseProduction: { grain: 6, wood: 1, stone: 0, iron: 0, wealth: 2, faith: 0 },
    bonusEffect: "+trade efficiency z pobřeží",
    description: "Pobřežní osada živící se rybolovem a drobným námořním obchodem.",
    maxUpgrade: 5,
    upgradeBonus: 0.2,
  },
  {
    key: "mining_camp",
    label: "Hornická osada",
    icon: "⛏️",
    preferredBiomes: ["hills", "mountain", "mountain_pass", "highland"],
    baseProduction: { grain: 0, wood: 0, stone: 4, iron: 6, wealth: 1, faith: 0 },
    bonusEffect: "+zvýšená šance na spawn strategických surovin v micro",
    description: "Hornická osada v kopcích. Produkuje kov a kámen.",
    maxUpgrade: 5,
    upgradeBonus: 0.3,
  },
  {
    key: "pastoral_camp",
    label: "Pastýřská osada",
    icon: "🐑",
    preferredBiomes: ["steppe", "plains", "grassland", "savanna"],
    baseProduction: { grain: 5, wood: 0, stone: 0, iron: 0, wealth: 2, faith: 0 },
    bonusEffect: "+mobilita jednotek, spawn koní",
    description: "Pastevecká osada na otevřených pláních. Dodává potraviny a kůže.",
    maxUpgrade: 5,
    upgradeBonus: 0.2,
  },
  {
    key: "trade_post",
    label: "Obchodní stanice",
    icon: "🏪",
    preferredBiomes: ["plains", "grassland", "steppe", "coastal", "river"],
    baseProduction: { grain: 1, wood: 0, stone: 0, iron: 0, wealth: 6, faith: 0 },
    bonusEffect: "+trade efficiency, wealth multiplikátor z průchodu",
    description: "Obchodní stanice na křižovatce tras. Generuje bohatství z průchodu zboží.",
    maxUpgrade: 5,
    upgradeBonus: 0.25,
  },
  {
    key: "shrine",
    label: "Svatyně",
    icon: "⛪",
    preferredBiomes: ["forest", "mountain", "highland", "marsh", "sacred"],
    baseProduction: { grain: 0, wood: 0, stone: 0, iron: 0, wealth: 1, faith: 8 },
    bonusEffect: "+stabilita okolních osad, víra",
    description: "Posvátné místo víry. Zvyšuje stabilitu a morálku v okolí.",
    maxUpgrade: 5,
    upgradeBonus: 0.2,
  },
  {
    key: "watchtower",
    label: "Strážní věž",
    icon: "🏰",
    preferredBiomes: ["hills", "mountain", "highland", "plains", "steppe"],
    baseProduction: { grain: 0, wood: 0, stone: 1, iron: 1, wealth: 0, faith: 0 },
    bonusEffect: "+strategický přehled (vision), +fortifikace, zpomalení nepřátel",
    description: "Vojenská hlídka kontrolující okolní území. Malá produkce, velký strategický význam.",
    maxUpgrade: 3,
    upgradeBonus: 0.15,
  },
];

// ═══════════════════════════════════════════
// MICRO NODE TYPES (12 zázemí)
// ═══════════════════════════════════════════

export interface MicroNodeDef {
  key: string;
  label: string;
  icon: string;
  preferredBiomes: string[];
  baseProduction: { grain: number; wood: number; stone: number; iron: number; wealth: number; faith: number };
  strategicResourcePool: string[]; // which strategic resources can spawn here
  spawnChance: number; // 0-1 chance to spawn a strategic resource at build
  description: string;
  maxUpgrade: number;
  upgradeBonus: number;
}

export const MICRO_NODE_TYPES: MicroNodeDef[] = [
  {
    key: "field",
    label: "Pole",
    icon: "🌾",
    preferredBiomes: ["plains", "grassland", "temperate", "river"],
    baseProduction: { grain: 6, wood: 0, stone: 0, iron: 0, wealth: 0, faith: 0 },
    strategicResourcePool: ["salt"],
    spawnChance: 0.08,
    description: "Orná půda. Hlavní zdroj obilí pro okolní osady.",
    maxUpgrade: 3,
    upgradeBonus: 0.3,
  },
  {
    key: "sawmill",
    label: "Pila",
    icon: "🪚",
    preferredBiomes: ["forest", "dense_forest", "taiga"],
    baseProduction: { grain: 0, wood: 7, stone: 0, iron: 0, wealth: 1, faith: 0 },
    strategicResourcePool: ["timber"],
    spawnChance: 0.12,
    description: "Zpracovává dřevo z okolních lesů. Klíčová pro stavební projekty.",
    maxUpgrade: 3,
    upgradeBonus: 0.25,
  },
  {
    key: "mine",
    label: "Důl",
    icon: "⛏️",
    preferredBiomes: ["hills", "mountain", "highland"],
    baseProduction: { grain: 0, wood: 0, stone: 2, iron: 5, wealth: 1, faith: 0 },
    strategicResourcePool: ["iron", "copper", "gold_deposit", "gems"],
    spawnChance: 0.18,
    description: "Hlubinný důl těžící kovy a minerály. Vysoká šance na strategické suroviny.",
    maxUpgrade: 3,
    upgradeBonus: 0.3,
  },
  {
    key: "hunting_ground",
    label: "Loviště",
    icon: "🏹",
    preferredBiomes: ["forest", "steppe", "grassland", "taiga"],
    baseProduction: { grain: 4, wood: 1, stone: 0, iron: 0, wealth: 1, faith: 0 },
    strategicResourcePool: ["horses"],
    spawnChance: 0.10,
    description: "Lovecký revír. Dodává potraviny a kůže.",
    maxUpgrade: 3,
    upgradeBonus: 0.2,
  },
  {
    key: "fishery",
    label: "Rybárna",
    icon: "🐟",
    preferredBiomes: ["coastal", "lake", "river", "marsh"],
    baseProduction: { grain: 5, wood: 0, stone: 0, iron: 0, wealth: 2, faith: 0 },
    strategicResourcePool: ["salt"],
    spawnChance: 0.10,
    description: "Rybářské zázemí. Stabilní zdroj potravin z vody.",
    maxUpgrade: 3,
    upgradeBonus: 0.2,
  },
  {
    key: "quarry",
    label: "Lom",
    icon: "🪨",
    preferredBiomes: ["hills", "mountain", "highland"],
    baseProduction: { grain: 0, wood: 0, stone: 7, iron: 0, wealth: 0, faith: 0 },
    strategicResourcePool: ["marble"],
    spawnChance: 0.12,
    description: "Kamenolom. Klíčový pro výstavbu monumentů a opevnění.",
    maxUpgrade: 3,
    upgradeBonus: 0.25,
  },
  {
    key: "vineyard",
    label: "Vinice",
    icon: "🍇",
    preferredBiomes: ["temperate", "plains", "grassland", "hills"],
    baseProduction: { grain: 1, wood: 0, stone: 0, iron: 0, wealth: 5, faith: 0 },
    strategicResourcePool: ["silk"],
    spawnChance: 0.08,
    description: "Vinice a ovocné sady. Generují bohatství z luxusních produktů.",
    maxUpgrade: 3,
    upgradeBonus: 0.25,
  },
  {
    key: "herbalist",
    label: "Bylinkárna",
    icon: "🌿",
    preferredBiomes: ["forest", "marsh", "jungle", "temperate"],
    baseProduction: { grain: 0, wood: 0, stone: 0, iron: 0, wealth: 1, faith: 4 },
    strategicResourcePool: ["incense"],
    spawnChance: 0.12,
    description: "Bylinkářská dílna. Produkuje léčiva a kadidlo pro víru.",
    maxUpgrade: 3,
    upgradeBonus: 0.2,
  },
  {
    key: "smithy",
    label: "Kovárna",
    icon: "🔨",
    preferredBiomes: ["hills", "mountain", "highland"],
    baseProduction: { grain: 0, wood: 0, stone: 0, iron: 3, wealth: 2, faith: 0 },
    strategicResourcePool: ["obsidian"],
    spawnChance: 0.10,
    description: "Kovárna zpracovávající suroviny. Vyžaduje přístup k železu pro plný výkon.",
    maxUpgrade: 3,
    upgradeBonus: 0.3,
  },
  {
    key: "outpost",
    label: "Hlídka",
    icon: "👁️",
    preferredBiomes: ["plains", "hills", "steppe", "mountain", "highland", "forest"],
    baseProduction: { grain: 0, wood: 0, stone: 0, iron: 0, wealth: 0, faith: 0 },
    strategicResourcePool: [],
    spawnChance: 0,
    description: "Vojenská hlídka. Žádná produkce, ale strategický přehled a obrana.",
    maxUpgrade: 2,
    upgradeBonus: 0.1,
  },
  {
    key: "resin_collector",
    label: "Sběrna pryskyřice",
    icon: "🌲",
    preferredBiomes: ["forest", "dense_forest", "taiga"],
    baseProduction: { grain: 2, wood: 2, stone: 0, iron: 0, wealth: 1, faith: 0 },
    strategicResourcePool: ["timber"],
    spawnChance: 0.10,
    description: "Sběr pryskyřice a lesních produktů. Zásoby a dřevo.",
    maxUpgrade: 3,
    upgradeBonus: 0.2,
  },
  {
    key: "salt_pan",
    label: "Solná pánev",
    icon: "🧂",
    preferredBiomes: ["coastal", "desert", "steppe"],
    baseProduction: { grain: 0, wood: 0, stone: 0, iron: 0, wealth: 4, faith: 0 },
    strategicResourcePool: ["salt"],
    spawnChance: 0.20,
    description: "Solná pánev na pobřeží nebo v poušti. Sůl je cenná obchodní komodita.",
    maxUpgrade: 3,
    upgradeBonus: 0.25,
  },
];

// ═══════════════════════════════════════════
// BIOME → SUGGESTED NODE TYPE MAPPING
// ═══════════════════════════════════════════

export function suggestMinorType(biome: string): string {
  const b = biome?.toLowerCase() || "";
  if (b.includes("forest") || b.includes("taiga")) return "lumber_camp";
  if (b.includes("coast") || b.includes("lake")) return "fishing_village";
  if (b.includes("hill") || b.includes("mountain") || b.includes("highland")) return "mining_camp";
  if (b.includes("steppe") || b.includes("savanna")) return "pastoral_camp";
  if (b.includes("marsh") || b.includes("sacred")) return "shrine";
  if (b.includes("desert")) return "trade_post";
  return "village";
}

export function suggestMicroType(biome: string): string {
  const b = biome?.toLowerCase() || "";
  if (b.includes("plains") || b.includes("grassland") || b.includes("temperate")) return "field";
  if (b.includes("forest") || b.includes("taiga")) return "sawmill";
  if (b.includes("hill") || b.includes("mountain") || b.includes("highland")) return "mine";
  if (b.includes("coast") || b.includes("lake")) return "fishery";
  if (b.includes("steppe") || b.includes("savanna")) return "hunting_ground";
  if (b.includes("marsh") || b.includes("jungle")) return "herbalist";
  if (b.includes("desert")) return "salt_pan";
  return "field";
}

/** Get compatible minor types for a biome */
export function getCompatibleMinorTypes(biome: string): MinorNodeDef[] {
  const b = biome?.toLowerCase() || "";
  return MINOR_NODE_TYPES.filter(t =>
    t.preferredBiomes.some(pb => b.includes(pb)) || t.key === "village" || t.key === "watchtower"
  );
}

/** Get compatible micro types for a biome */
export function getCompatibleMicroTypes(biome: string): MicroNodeDef[] {
  const b = biome?.toLowerCase() || "";
  return MICRO_NODE_TYPES.filter(t =>
    t.preferredBiomes.some(pb => b.includes(pb)) || t.key === "outpost"
  );
}

/** Roll for strategic resource spawn on micronode build */
export function rollStrategicResource(microDef: MicroNodeDef): string | null {
  if (microDef.strategicResourcePool.length === 0) return null;
  if (Math.random() > microDef.spawnChance) return null;
  const pool = microDef.strategicResourcePool;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Compute effective production for a node based on tier, subtype, upgrade level, biome match */
export function computeNodeProduction(
  tier: NodeTier,
  subtype: string,
  upgradeLevel: number,
  biome: string,
): Record<string, number> {
  let def: { baseProduction: Record<string, number>; upgradeBonus: number; preferredBiomes: string[] } | undefined;

  if (tier === "minor") {
    def = MINOR_NODE_TYPES.find(t => t.key === subtype);
  } else if (tier === "micro") {
    def = MICRO_NODE_TYPES.find(t => t.key === subtype);
  }

  if (!def) return { grain: 0, wood: 0, stone: 0, iron: 0, wealth: 0, faith: 0 };

  const b = biome?.toLowerCase() || "";
  const biomeMatch = def.preferredBiomes.some(pb => b.includes(pb));
  const biomeMult = biomeMatch ? 1.0 : 0.6; // 40% penalty if wrong biome
  const upgradeMult = 1 + (upgradeLevel - 1) * def.upgradeBonus;

  const result: Record<string, number> = {};
  for (const [key, val] of Object.entries(def.baseProduction)) {
    result[key] = Math.round(val * biomeMult * upgradeMult * 10) / 10;
  }
  return result;
}

/** Total production as single number for display */
export function totalProduction(prod: Record<string, number>): number {
  return Object.values(prod).reduce((a, b) => a + b, 0);
}
