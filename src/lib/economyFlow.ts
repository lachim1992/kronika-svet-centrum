/**
 * Chronicle Economic Model v2 — Unified Resource System
 * 6 Core Resources: PRODUKCE, BOHATSTVÍ, ZÁSOBY, KAPACITA, VÍRA, PRESTIŽ
 * 11 Strategic Resources: access-based tiers (not stackable)
 */

// ═══════════════════════════════════════════
// CORE RESOURCE LAYERS (6 macro)
// ═══════════════════════════════════════════

export const CORE_RESOURCES = ["production", "wealth", "supplies", "capacity", "faith", "prestige"] as const;
export type CoreResource = (typeof CORE_RESOURCES)[number];

export const CORE_RESOURCE_META: Record<CoreResource, { label: string; icon: string; description: string; dbColumn?: string }> = {
  production: {
    label: "Produkce",
    icon: "⚒️",
    description: "Fyzický výstup uzlů — suroviny, řemesla, těžba. Generována rolníky a flow sítí.",
    dbColumn: "production_reserve",
  },
  wealth: {
    label: "Bohatství",
    icon: "💰",
    description: "Obchodní a finanční tok — vzniká průchodem produkce přes obchodní trasy + daně.",
    dbColumn: "gold_reserve",
  },
  supplies: {
    label: "Zásoby",
    icon: "🌾",
    description: "Potravinový buffer populace. Spotřeba = pop × ration_rate. Deficit = hladomor.",
    dbColumn: "grain_reserve",
  },
  capacity: {
    label: "Kapacita",
    icon: "🏛️",
    description: "Státní aparát — infrastruktura, logistika, urbanizace. Limit pro projekty.",
  },
  faith: {
    label: "Víra",
    icon: "⛪",
    description: "Duchovní síla říše. Generována kleriky. Bonus k morálce, stabilitě.",
  },
  prestige: {
    label: "Prestiž",
    icon: "⭐",
    description: "Kompozitní ukazatel progresu — součet vojenské, kulturní, ekonomické, sportovní, geopolitické a technologické prestiže.",
  },
};

/** Maps old layer names to unified system for backward compat */
export const MACRO_LAYER_LABELS = {
  production: "Produkce",
  wealth: "Bohatství",
  capacity: "Kapacita",
  faith: "Víra",
} as const;

export const MACRO_LAYER_DESCRIPTIONS = {
  production: "Fyzický výstup uzlů — suroviny, řemesla, těžba",
  wealth: "Obchodní tok — vzniká průchodem produkce přes trasy",
  capacity: "Státní aparát — infrastruktura, logistika, urbanizace",
} as const;

export const MACRO_LAYER_COLORS = {
  production: "hsl(var(--chart-2))",
  wealth: "hsl(var(--chart-4))",
  capacity: "hsl(var(--chart-1))",
} as const;

export const MACRO_LAYER_ICONS = {
  production: "⚒️",
  wealth: "💰",
  capacity: "🏛️",
  faith: "⛪",
} as const;

// ═══════════════════════════════════════════
// PRESTIGE SYSTEM — Composite of 6 sub-types
// ═══════════════════════════════════════════

export const PRESTIGE_COMPONENTS = [
  "military", "cultural", "economic", "sport", "geopolitical", "technological",
] as const;
export type PrestigeComponent = (typeof PRESTIGE_COMPONENTS)[number];

export const PRESTIGE_META: Record<PrestigeComponent, {
  label: string; icon: string; dbColumn: string; description: string; sources: string[];
}> = {
  military: {
    label: "Vojenská",
    icon: "⚔️",
    dbColumn: "military_prestige",
    description: "Prestiž z vítězství, kontroly strategických bodů a síly armády",
    sources: ["Vítězství v bitvách (+5)", "Dobytí měst (+10)", "Kontrola strategických uzlů (+2/uzel)", "Velikost armády (+1/500 vojáků)"],
  },
  cultural: {
    label: "Kulturní",
    icon: "🎭",
    dbColumn: "cultural_prestige",
    description: "Prestiž z divů světa, unikátních budov, kronik, akademií a civilizačního vlivu",
    sources: ["Div světa (+20)", "Unikátní budova (+3)", "Kronika (+1)", "Akademie (+2)", "Polis (+5)", "Civilizační vliv (+0.5/bod)"],
  },
  economic: {
    label: "Ekonomická",
    icon: "📈",
    dbColumn: "economic_prestige",
    description: "Prestiž z obchodního objemu, bohatství a obchodních tras",
    sources: ["Wealth tok (+1/10 wealth)", "Obchodní trasy (+2/trasa)", "Market level (+1)", "Strategický monopol (+5)"],
  },
  sport: {
    label: "Sportovní",
    icon: "🏆",
    dbColumn: "sport_prestige",
    description: "Prestiž z olympijských her, akademií a šampionů",
    sources: ["Zlatá medaile (+10)", "Stříbro (+5)", "Bronz (+3)", "Hostování olympiády (+15)", "Šampion (+2)"],
  },
  geopolitical: {
    label: "Geopolitická",
    icon: "🌐",
    dbColumn: "geopolitical_prestige",
    description: "Prestiž z diplomatického vlivu, spojenectví a kontroly území",
    sources: ["Spojenectví (+3)", "Vazalství (+5)", "Kontrola provincií (+1/provincie)", "Městské státy pod vlivem (+2)"],
  },
  technological: {
    label: "Technologická",
    icon: "🔬",
    dbColumn: "technological_prestige",
    description: "Prestiž z přístupu ke strategickým surovinám a unikátních projektů",
    sources: ["Strategická surovina tier 2+ (+3)", "Monopol na surovinu (+8)", "Infrastrukturní projekt (+2)", "Průsmyk/přístav (+3)"],
  },
};

/** Compute total prestige from sub-components */
export function computeTotalPrestige(realm: any): number {
  return (realm?.military_prestige ?? 0)
    + (realm?.cultural_prestige ?? 0)
    + (realm?.economic_prestige ?? 0)
    + (realm?.sport_prestige ?? 0)
    + (realm?.geopolitical_prestige ?? 0)
    + (realm?.technological_prestige ?? 0);
}

/** Prestige tier labels */
export const PRESTIGE_TIER_LABELS: Record<number, string> = {
  0: "Neznámý",
  1: "Lokální",
  2: "Regionální",
  3: "Kontinentální",
  4: "Světová velmoc",
  5: "Legendární",
};

export function getPrestigeTier(total: number): number {
  if (total >= 200) return 5;
  if (total >= 100) return 4;
  if (total >= 50) return 3;
  if (total >= 20) return 2;
  if (total >= 5) return 1;
  return 0;
}

// ═══════════════════════════════════════════
// STRATEGIC RESOURCES — Access-based (11 types)
// ═══════════════════════════════════════════

export const STRATEGIC_RESOURCES = [
  "iron", "horses", "salt", "copper", "gold_deposit",
  "marble", "gems", "timber", "obsidian", "silk", "incense",
] as const;
export type StrategicResource = (typeof STRATEGIC_RESOURCES)[number];

export const STRATEGIC_RESOURCE_META: Record<StrategicResource, {
  label: string;
  icon: string;
  rarity: "common" | "medium" | "rare";
  spawnChance: number; // probability per minor node
  category: string;
  description: string;
  gameplayEffects: Record<number, string[]>;
  prestigePerTier: number;
}> = {
  iron: {
    label: "Železo", icon: "⛏️", rarity: "common", spawnChance: 0.15,
    category: "military",
    description: "Klíčový vojenský materiál. Umožňuje těžkou pěchotu a obléhací stroje.",
    gameplayEffects: {
      1: ["Těžká pěchota", "Obléhací stroje", "+10% síla vojska"],
      2: ["Elitní obrněnci", "Železné hradby", "+20% obrana měst"],
      3: ["Imperiální legie", "Ocelová citadela", "+30% síla + prestiž"],
    },
    prestigePerTier: 2,
  },
  horses: {
    label: "Koně", icon: "🐴", rarity: "medium", spawnChance: 0.10,
    category: "military",
    description: "Mobilita a průzkum. Umožňuje jízdu a rychlé přesuny.",
    gameplayEffects: {
      1: ["Lehká jízda", "Průzkumníci", "+1 hex pohyb"],
      2: ["Těžká kavalerie", "Poštovní služba", "+2 hex pohyb"],
      3: ["Katafrakt", "Nomádská horda", "+3 hex pohyb + prestiž"],
    },
    prestigePerTier: 2,
  },
  salt: {
    label: "Sůl", icon: "🧂", rarity: "medium", spawnChance: 0.10,
    category: "trade",
    description: "Konzervace a obchod. Zvyšuje kapacitu zásob a obchodní efektivitu.",
    gameplayEffects: {
      1: ["Solná konzervace (+20% granary)", "Obchodní výhoda"],
      2: ["Solné doly (+wealth)", "Diplomatický vliv"],
      3: ["Solný monopol (+trade dominance)", "+prestiž"],
    },
    prestigePerTier: 2,
  },
  copper: {
    label: "Měď", icon: "🪙", rarity: "common", spawnChance: 0.15,
    category: "economic",
    description: "Kovářství a mincovnictví. Základ pro měnový systém a řemesla.",
    gameplayEffects: {
      1: ["Bronzové zbraně", "Mince (+5% wealth)"],
      2: ["Pokročilé kovářství", "Monetární systém (+10% wealth)"],
      3: ["Finanční hegemonie (+20% wealth)", "+prestiž"],
    },
    prestigePerTier: 1,
  },
  gold_deposit: {
    label: "Zlato", icon: "✨", rarity: "rare", spawnChance: 0.05,
    category: "luxury",
    description: "Luxus a diplomacie. Přímý bonus k bohatství a diplomatickému vlivu.",
    gameplayEffects: {
      1: ["Zlatnictví (+10 wealth/kolo)", "Diplomatické dary"],
      2: ["Státní pokladnice (+20 wealth/kolo)", "Najímání žoldnéřů"],
      3: ["Ekonomická supervelmoc", "+velká prestiž"],
    },
    prestigePerTier: 4,
  },
  marble: {
    label: "Mramor", icon: "🏛️", rarity: "medium", spawnChance: 0.08,
    category: "cultural",
    description: "Monumentální stavby a prestiž. Umožňuje divy světa a snižuje náklady staveb.",
    gameplayEffects: {
      1: ["Monumenty (-10% stavební náklady)", "+kulturní prestiž"],
      2: ["Velké chrámy (-20% stavby)", "+diplomatický vliv"],
      3: ["Divy světa (bonus)", "+velká kulturní prestiž"],
    },
    prestigePerTier: 3,
  },
  gems: {
    label: "Drahokamy", icon: "💎", rarity: "rare", spawnChance: 0.05,
    category: "luxury",
    description: "Luxus a víra. Zvyšují bohatství a náboženský vliv.",
    gameplayEffects: {
      1: ["Šperkařství (+5 wealth/kolo)", "+víra"],
      2: ["Korunovační klenoty (+stabilita)", "+diplomatické dary"],
      3: ["Duchovní centrum světa", "+prestiž"],
    },
    prestigePerTier: 3,
  },
  timber: {
    label: "Kvalitní dřevo", icon: "🪵", rarity: "common", spawnChance: 0.15,
    category: "infrastructure",
    description: "Stavba lodí a infrastruktury. Základ pro námořní sílu.",
    gameplayEffects: {
      1: ["Loděnice", "Lepší cesty (-10% travel cost)"],
      2: ["Válečná flotila", "Mosty (-20% travel cost)"],
      3: ["Námořní dominance", "+logistická prestiž"],
    },
    prestigePerTier: 1,
  },
  obsidian: {
    label: "Obsidián", icon: "🗡️", rarity: "rare", spawnChance: 0.05,
    category: "military",
    description: "Rituální a vojenské použití. Elitní zbraně a náboženské obřady.",
    gameplayEffects: {
      1: ["Obsidiánové zbraně (+5% síla)", "Rituální předměty (+víra)"],
      2: ["Elitní gardisté (+15% síla)", "Prorocké rituály"],
      3: ["Posvátná garda", "+vojenská + náboženská prestiž"],
    },
    prestigePerTier: 3,
  },
  silk: {
    label: "Hedvábí", icon: "🧵", rarity: "rare", spawnChance: 0.05,
    category: "luxury",
    description: "Diplomatický luxus. Zvyšuje obchodní a diplomatický vliv.",
    gameplayEffects: {
      1: ["Textilní manufaktura (+wealth)", "Diplomatické dary"],
      2: ["Hedvábná stezka (+trade efektivita)", "+diplomatický vliv"],
      3: ["Obchodní hegemonie", "+velká ekonomická prestiž"],
    },
    prestigePerTier: 3,
  },
  incense: {
    label: "Kadidlo", icon: "🪔", rarity: "medium", spawnChance: 0.08,
    category: "faith",
    description: "Náboženský a obchodní vliv. Zvyšuje víru a obchodní hodnotu.",
    gameplayEffects: {
      1: ["Chrámové kadidlo (+víra)", "Obchodní komodita (+wealth)"],
      2: ["Náboženská autorita (+stabilita)", "Poutní místo"],
      3: ["Svaté město", "+velká náboženská prestiž"],
    },
    prestigePerTier: 2,
  },
};

// Legacy-compatible exports
export const STRATEGIC_RESOURCE_LABELS: Record<StrategicResource, string> = Object.fromEntries(
  STRATEGIC_RESOURCES.map(k => [k, STRATEGIC_RESOURCE_META[k].label])
) as Record<StrategicResource, string>;

export const STRATEGIC_RESOURCE_ICONS: Record<StrategicResource, string> = Object.fromEntries(
  STRATEGIC_RESOURCES.map(k => [k, STRATEGIC_RESOURCE_META[k].icon])
) as Record<StrategicResource, string>;

export const STRATEGIC_TIER_LABELS: Record<number, string> = {
  0: "Žádný přístup",
  1: "Základní",
  2: "Pokročilý",
  3: "Dominantní",
};

export const STRATEGIC_TIER_COLORS: Record<number, string> = {
  0: "text-muted-foreground",
  1: "text-yellow-500",
  2: "text-orange-500",
  3: "text-red-500",
};

/** DB column name for each strategic resource tier */
export const STRATEGIC_TIER_DB_COLUMNS: Record<StrategicResource, string> = {
  iron: "strategic_iron_tier",
  horses: "strategic_horses_tier",
  salt: "strategic_salt_tier",
  copper: "strategic_copper_tier",
  gold_deposit: "strategic_gold_tier",
  marble: "strategic_marble_tier",
  gems: "strategic_gems_tier",
  timber: "strategic_timber_tier",
  obsidian: "strategic_obsidian_tier",
  silk: "strategic_silk_tier",
  incense: "strategic_incense_tier",
};

/** Helper: get all strategic tiers from realm object */
export function getStrategicTiers(realm: any): { key: StrategicResource; tier: number }[] {
  return STRATEGIC_RESOURCES.map(key => ({
    key,
    tier: realm?.[STRATEGIC_TIER_DB_COLUMNS[key]] ?? 0,
  })).filter(s => s.tier > 0);
}

// ═══════════════════════════════════════════
// FLOW FORMULAS (client-side mirror)
// ═══════════════════════════════════════════

/** Base production values by node_type */
export const BASE_PRODUCTION: Record<string, number> = {
  resource_node: 8,
  village_cluster: 6,
  primary_city: 4,
  secondary_city: 3,
  port: 5,
  fortress: 1,
  trade_hub: 2,
  pass: 0,
  religious_center: 2,
  logistic_hub: 3,
};

/** Trade efficiency by flow_role */
export const ROLE_TRADE_EFFICIENCY: Record<string, number> = {
  hub: 1.0,
  gateway: 0.8,
  regulator: 0.6,
  producer: 0.3,
  neutral: 0.2,
};

// ═══════════════════════════════════════════
// ISOLATION PENALTY LABELS
// ═══════════════════════════════════════════

export const ISOLATION_PENALTY_LABELS: Record<string, string> = {
  none: "Připojeno",
  mild: "Mírná izolace",
  moderate: "Částečná izolace",
  severe: "Těžká izolace",
  critical: "Odříznuto",
};

export function getIsolationSeverity(penalty: number): string {
  if (penalty <= 0) return "none";
  if (penalty < 0.15) return "mild";
  if (penalty < 0.35) return "moderate";
  if (penalty < 0.55) return "severe";
  return "critical";
}

// ═══════════════════════════════════════════
// IMPORTANCE SCORE LABELS
// ═══════════════════════════════════════════

export function getImportanceLabel(score: number): string {
  if (score >= 15) return "Klíčový";
  if (score >= 10) return "Významný";
  if (score >= 5) return "Střední";
  if (score >= 2) return "Okrajový";
  return "Zanedbatelný";
}

export function getImportanceColor(score: number): string {
  if (score >= 15) return "text-red-500";
  if (score >= 10) return "text-orange-500";
  if (score >= 5) return "text-yellow-500";
  if (score >= 2) return "text-muted-foreground";
  return "text-muted-foreground/50";
}
