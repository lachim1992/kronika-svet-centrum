// Deterministic catalog for neutral world nodes.
// Mirror in supabase/functions/_shared/worldNodeCatalog.ts — must stay in sync.
// Hash both files and compare in tests if drift is suspected.
//
// Rules (from .lovable/plan.md, Patch 2):
//   - 20 cultures × 30 profiles is enough to generate hundreds of variants.
//   - No AI involvement: name = deterministic combo of culture.nameRoots + seedHash.
//   - Iteration 1 covers: neutral_settlement, resource_outpost, shrine, ruin.

export type NodeKind = "neutral_settlement" | "resource_outpost" | "shrine" | "ruin";
export type SettlementTier = "hamlet" | "village" | "outpost" | "shrine" | "ruin";

export interface CultureDef {
  key: string;
  label: string;
  terrainBias: string[];        // biome families this culture prefers
  worldToneBias: string[];      // tone keys (e.g. "harsh", "mythic", "mercantile")
  visualTags: string[];
  socialTags: string[];
  preferredBaskets: string[];   // canonical basket keys
  nameRoots: string[];          // deterministic name fragments
}

export interface ProfileDef {
  key: string;
  label: string;
  nodeKind: NodeKind;
  settlementTier: SettlementTier;
  populationRange: [number, number];
  outputBaskets: { basket: string; good?: string; quantity: number; quality?: number; exportable_ratio?: number }[];
  terrainBias: string[];
  defenseRange: [number, number];
  prosperityRange: [number, number];
  autonomyRange: [number, number];
}

export const CULTURES: CultureDef[] = [
  { key: "river_clay_folk",       label: "River Clay Folk",       terrainBias: ["river", "plains", "marsh"],          worldToneBias: ["pastoral", "mercantile"], visualTags: ["mud-brick", "reed"],     socialTags: ["clan", "matriarchal"],   preferredBaskets: ["staple_food", "tools"],          nameRoots: ["Mor", "Iren", "Tul", "Sapha", "Hel", "Quem"] },
  { key: "highland_shepherds",    label: "Highland Shepherds",    terrainBias: ["hills", "highland", "mountain"],     worldToneBias: ["harsh", "stoic"],         visualTags: ["wool", "stone"],         socialTags: ["clan", "patriarchal"],   preferredBaskets: ["staple_food", "basic_clothing"], nameRoots: ["Brak", "Cair", "Dunn", "Gorm", "Heth", "Skara"] },
  { key: "salt_marsh_clans",      label: "Salt Marsh Clans",      terrainBias: ["coastal", "marsh", "river"],         worldToneBias: ["isolated", "mythic"],     visualTags: ["stilts", "reed"],        socialTags: ["clan", "egalitarian"],   preferredBaskets: ["staple_food", "luxury"],         nameRoots: ["Yph", "Lurr", "Mael", "Niss", "Ond", "Theb"] },
  { key: "forest_charcoalers",    label: "Forest Charcoal Burners", terrainBias: ["forest", "taiga"],                 worldToneBias: ["isolated", "harsh"],      visualTags: ["soot", "timber"],        socialTags: ["guild"],                 preferredBaskets: ["fuel", "tools"],                 nameRoots: ["Ash", "Borr", "Cinder", "Pyr", "Wend", "Tarr"] },
  { key: "desert_caravan_kin",    label: "Desert Caravan Kin",    terrainBias: ["desert", "savanna", "steppe"],       worldToneBias: ["mercantile", "mythic"],   visualTags: ["linen", "brass"],        socialTags: ["caravan", "patriarchal"],preferredBaskets: ["luxury", "drink"],               nameRoots: ["Aza", "Sufi", "Khar", "Nem", "Tabr", "Zayd"] },
  { key: "river_grain_holders",   label: "River Grain Holders",   terrainBias: ["river", "plains", "grassland"],      worldToneBias: ["pastoral", "stoic"],      visualTags: ["thatch", "wattle"],      socialTags: ["clan"],                  preferredBaskets: ["staple_food"],                   nameRoots: ["Cor", "Dren", "Pala", "Rufa", "Stell", "Vimm"] },
  { key: "stone_henge_keepers",   label: "Stone Henge Keepers",   terrainBias: ["highland", "hills", "plains"],       worldToneBias: ["mythic", "stoic"],        visualTags: ["megalith"],              socialTags: ["theocratic"],            preferredBaskets: ["faith"],                         nameRoots: ["Gor", "Lhan", "Mehr", "Ogh", "Senn", "Threll"] },
  { key: "iron_hill_kin",         label: "Iron Hill Kin",         terrainBias: ["hills", "mountain"],                 worldToneBias: ["harsh", "mercantile"],    visualTags: ["soot", "iron"],          socialTags: ["guild", "patriarchal"],  preferredBaskets: ["tools", "metalware"],            nameRoots: ["Drog", "Hekk", "Kazn", "Morv", "Ulr", "Xerr"] },
  { key: "lake_fisher_villagers", label: "Lake Fisher Villagers", terrainBias: ["lake", "river", "coastal"],          worldToneBias: ["pastoral"],               visualTags: ["nets", "wood"],          socialTags: ["egalitarian"],           preferredBaskets: ["staple_food"],                   nameRoots: ["Ola", "Pir", "Rin", "Sol", "Veska", "Yor"] },
  { key: "savanna_herd_drivers",  label: "Savanna Herd Drivers",  terrainBias: ["savanna", "steppe", "grassland"],    worldToneBias: ["pastoral", "stoic"],      visualTags: ["leather"],               socialTags: ["clan"],                  preferredBaskets: ["staple_food", "basic_clothing"], nameRoots: ["Anu", "Bara", "Mwen", "Othi", "Sefa", "Tuli"] },
  { key: "jungle_shrine_seers",   label: "Jungle Shrine Seers",   terrainBias: ["jungle", "forest", "marsh"],         worldToneBias: ["mythic"],                 visualTags: ["lacquer", "feathers"],   socialTags: ["theocratic"],            preferredBaskets: ["faith", "luxury"],               nameRoots: ["Ixil", "Quen", "Tama", "Vra", "Zhul", "Ehua"] },
  { key: "tundra_elk_riders",     label: "Tundra Elk Riders",     terrainBias: ["taiga", "tundra", "highland"],       worldToneBias: ["harsh", "isolated"],      visualTags: ["fur"],                   socialTags: ["clan"],                  preferredBaskets: ["staple_food", "fuel"],           nameRoots: ["Aksu", "Vorr", "Tirk", "Ymma", "Sjorn", "Korr"] },
  { key: "broken_road_drifters",  label: "Broken Road Drifters",  terrainBias: ["plains", "steppe", "hills"],         worldToneBias: ["isolated", "mercantile"], visualTags: ["patched"],               socialTags: ["caravan"],               preferredBaskets: ["tools", "luxury"],               nameRoots: ["Marr", "Quill", "Reff", "Stov", "Tann", "Zegh"] },
  { key: "old_god_remnants",      label: "Old God Remnants",      terrainBias: ["forest", "hills", "highland"],       worldToneBias: ["mythic", "isolated"],     visualTags: ["lichen", "carved"],      socialTags: ["theocratic"],            preferredBaskets: ["faith"],                         nameRoots: ["Aen", "Dorr", "Hess", "Mol", "Talth", "Vyr"] },
  { key: "salt_panners",          label: "Salt Panners",          terrainBias: ["coastal", "desert", "marsh"],        worldToneBias: ["mercantile"],             visualTags: ["bleached"],              socialTags: ["guild"],                 preferredBaskets: ["staple_food", "luxury"],         nameRoots: ["Bol", "Cris", "Halen", "Mora", "Sull", "Tev"] },
  { key: "vine_terrace_growers",  label: "Vine Terrace Growers",  terrainBias: ["hills", "temperate", "plains"],      worldToneBias: ["pastoral", "mercantile"], visualTags: ["terracotta"],            socialTags: ["clan"],                  preferredBaskets: ["drink", "luxury"],               nameRoots: ["Calo", "Felo", "Lavi", "Mero", "Soli", "Vino"] },
  { key: "moor_peat_cutters",     label: "Moor Peat Cutters",     terrainBias: ["marsh", "taiga", "highland"],        worldToneBias: ["harsh", "stoic"],         visualTags: ["peat"],                  socialTags: ["clan"],                  preferredBaskets: ["fuel"],                          nameRoots: ["Brod", "Dergh", "Faen", "Inni", "Mosk", "Wenn"] },
  { key: "ash_volcano_kin",       label: "Ash Volcano Kin",       terrainBias: ["volcanic", "mountain", "hills"],     worldToneBias: ["mythic", "harsh"],        visualTags: ["obsidian"],              socialTags: ["theocratic"],            preferredBaskets: ["tools", "faith"],                nameRoots: ["Pyrr", "Vex", "Krath", "Solm", "Othir", "Embra"] },
  { key: "grain_kingdom_remnants",label: "Grain Kingdom Remnants",terrainBias: ["plains", "grassland", "river"],      worldToneBias: ["stoic", "pastoral"],      visualTags: ["wheat"],                 socialTags: ["patriarchal"],           preferredBaskets: ["staple_food"],                   nameRoots: ["Aldra", "Boren", "Cael", "Donn", "Erra", "Fulm"] },
  { key: "ruin_squatters",        label: "Ruin Squatters",        terrainBias: ["plains", "hills", "forest", "desert"], worldToneBias: ["isolated", "mythic"],   visualTags: ["rubble"],                socialTags: ["egalitarian"],           preferredBaskets: ["tools"],                         nameRoots: ["Hesh", "Kirr", "Nogr", "Phar", "Sork", "Tubb"] },
];

export const PROFILES: ProfileDef[] = [
  { key: "grain_hamlet",     label: "Obilná osada",       nodeKind: "neutral_settlement", settlementTier: "hamlet",  populationRange: [80, 220],   outputBaskets: [{ basket: "staple_food", good: "grain", quantity: 4, exportable_ratio: 0.4 }],                terrainBias: ["plains", "grassland", "river"],      defenseRange: [1, 4],  prosperityRange: [2, 5], autonomyRange: [60, 85] },
  { key: "fishing_village",  label: "Rybářská osada",     nodeKind: "neutral_settlement", settlementTier: "village", populationRange: [120, 300],  outputBaskets: [{ basket: "staple_food", good: "fish", quantity: 5, exportable_ratio: 0.5 }],                  terrainBias: ["coastal", "lake", "river"],          defenseRange: [1, 3],  prosperityRange: [3, 6], autonomyRange: [55, 80] },
  { key: "shepherd_hamlet",  label: "Pastýřská osada",    nodeKind: "neutral_settlement", settlementTier: "hamlet",  populationRange: [70, 180],   outputBaskets: [{ basket: "basic_clothing", good: "wool", quantity: 3, exportable_ratio: 0.5 }],              terrainBias: ["hills", "highland", "steppe"],       defenseRange: [1, 3],  prosperityRange: [2, 4], autonomyRange: [70, 90] },
  { key: "salt_panner",      label: "Solná pánev",        nodeKind: "resource_outpost",   settlementTier: "outpost", populationRange: [40, 110],   outputBaskets: [{ basket: "luxury", good: "salt", quantity: 3, exportable_ratio: 0.7 }],                      terrainBias: ["coastal", "desert", "marsh"],        defenseRange: [1, 2],  prosperityRange: [3, 6], autonomyRange: [50, 75] },
  { key: "iron_outpost",     label: "Železárenský tábor", nodeKind: "resource_outpost",   settlementTier: "outpost", populationRange: [50, 140],   outputBaskets: [{ basket: "tools", good: "iron", quantity: 4, exportable_ratio: 0.6 }],                       terrainBias: ["hills", "mountain"],                 defenseRange: [2, 5],  prosperityRange: [3, 6], autonomyRange: [55, 80] },
  { key: "copper_outpost",   label: "Měděný tábor",       nodeKind: "resource_outpost",   settlementTier: "outpost", populationRange: [40, 120],   outputBaskets: [{ basket: "tools", good: "copper", quantity: 3, exportable_ratio: 0.6 }],                     terrainBias: ["hills", "mountain"],                 defenseRange: [2, 4],  prosperityRange: [3, 6], autonomyRange: [55, 80] },
  { key: "charcoal_burner",  label: "Uhlíř",              nodeKind: "resource_outpost",   settlementTier: "outpost", populationRange: [30, 90],    outputBaskets: [{ basket: "fuel", good: "charcoal", quantity: 4, exportable_ratio: 0.7 }],                   terrainBias: ["forest", "taiga"],                   defenseRange: [1, 2],  prosperityRange: [2, 4], autonomyRange: [60, 85] },
  { key: "lumber_camp",      label: "Dřevařský tábor",    nodeKind: "resource_outpost",   settlementTier: "outpost", populationRange: [40, 110],   outputBaskets: [{ basket: "tools", good: "timber", quantity: 4, exportable_ratio: 0.6 }],                     terrainBias: ["forest", "taiga"],                   defenseRange: [1, 3],  prosperityRange: [2, 5], autonomyRange: [60, 85] },
  { key: "vineyard_hamlet",  label: "Vinařská osada",     nodeKind: "neutral_settlement", settlementTier: "hamlet",  populationRange: [80, 200],   outputBaskets: [{ basket: "drink", good: "wine", quantity: 3, exportable_ratio: 0.6 }],                       terrainBias: ["hills", "temperate", "plains"],      defenseRange: [1, 3],  prosperityRange: [3, 6], autonomyRange: [60, 85] },
  { key: "peat_cutter",      label: "Rašelinová stanice", nodeKind: "resource_outpost",   settlementTier: "outpost", populationRange: [30, 80],    outputBaskets: [{ basket: "fuel", good: "peat", quantity: 3, exportable_ratio: 0.7 }],                       terrainBias: ["marsh", "taiga", "highland"],        defenseRange: [1, 2],  prosperityRange: [1, 4], autonomyRange: [65, 90] },
  { key: "herder_camp",      label: "Pastevecký tábor",   nodeKind: "neutral_settlement", settlementTier: "hamlet",  populationRange: [60, 160],   outputBaskets: [{ basket: "staple_food", good: "meat", quantity: 3, exportable_ratio: 0.5 }],                  terrainBias: ["steppe", "savanna", "grassland"],    defenseRange: [1, 3],  prosperityRange: [2, 4], autonomyRange: [70, 90] },
  { key: "marsh_reed_village",label:"Rákosová osada",      nodeKind: "neutral_settlement", settlementTier: "village", populationRange: [90, 220],   outputBaskets: [{ basket: "staple_food", good: "fish", quantity: 4, exportable_ratio: 0.4 }],                  terrainBias: ["marsh", "river", "coastal"],         defenseRange: [1, 3],  prosperityRange: [2, 5], autonomyRange: [60, 85] },
  { key: "obsidian_quarry",  label: "Obsidiánový lom",    nodeKind: "resource_outpost",   settlementTier: "outpost", populationRange: [30, 80],    outputBaskets: [{ basket: "tools", good: "obsidian", quantity: 2, exportable_ratio: 0.7 }],                   terrainBias: ["volcanic", "mountain"],              defenseRange: [2, 4],  prosperityRange: [3, 6], autonomyRange: [55, 80] },
  { key: "marble_quarry",    label: "Mramorový lom",      nodeKind: "resource_outpost",   settlementTier: "outpost", populationRange: [40, 100],   outputBaskets: [{ basket: "luxury", good: "marble", quantity: 2, exportable_ratio: 0.7 }],                    terrainBias: ["hills", "mountain"],                 defenseRange: [2, 4],  prosperityRange: [3, 6], autonomyRange: [55, 80] },
  { key: "incense_grove",    label: "Kadidlový háj",      nodeKind: "resource_outpost",   settlementTier: "outpost", populationRange: [30, 80],    outputBaskets: [{ basket: "luxury", good: "incense", quantity: 2, exportable_ratio: 0.8 }],                   terrainBias: ["desert", "jungle", "savanna"],       defenseRange: [1, 2],  prosperityRange: [3, 6], autonomyRange: [60, 85] },
  { key: "horse_breeders",   label: "Chovatelé koní",     nodeKind: "neutral_settlement", settlementTier: "hamlet",  populationRange: [60, 150],   outputBaskets: [{ basket: "tools", good: "horses", quantity: 2, exportable_ratio: 0.6 }],                     terrainBias: ["plains", "steppe"],                  defenseRange: [2, 4],  prosperityRange: [3, 6], autonomyRange: [60, 85] },
  { key: "forest_shrine",    label: "Lesní svatyně",      nodeKind: "shrine",              settlementTier: "shrine",  populationRange: [10, 40],    outputBaskets: [{ basket: "faith", quantity: 5, exportable_ratio: 0.3 }],                                     terrainBias: ["forest", "taiga", "jungle"],         defenseRange: [0, 2],  prosperityRange: [2, 4], autonomyRange: [70, 95] },
  { key: "highland_shrine",  label: "Horská svatyně",     nodeKind: "shrine",              settlementTier: "shrine",  populationRange: [10, 40],    outputBaskets: [{ basket: "faith", quantity: 5, exportable_ratio: 0.3 }],                                     terrainBias: ["mountain", "highland", "hills"],     defenseRange: [0, 2],  prosperityRange: [2, 4], autonomyRange: [75, 95] },
  { key: "stone_circle",     label: "Kamenný kruh",       nodeKind: "shrine",              settlementTier: "shrine",  populationRange: [5, 25],     outputBaskets: [{ basket: "faith", quantity: 4, exportable_ratio: 0.2 }],                                     terrainBias: ["plains", "highland", "hills"],       defenseRange: [0, 1],  prosperityRange: [1, 3], autonomyRange: [80, 95] },
  { key: "marsh_oracle",     label: "Močálová věštírna",  nodeKind: "shrine",              settlementTier: "shrine",  populationRange: [5, 30],     outputBaskets: [{ basket: "faith", quantity: 4, exportable_ratio: 0.2 }],                                     terrainBias: ["marsh", "river"],                    defenseRange: [0, 1],  prosperityRange: [1, 3], autonomyRange: [80, 95] },
  { key: "desert_oasis",     label: "Pouštní oáza",       nodeKind: "neutral_settlement", settlementTier: "village", populationRange: [80, 200],   outputBaskets: [{ basket: "drink", good: "water", quantity: 4, exportable_ratio: 0.4 }],                      terrainBias: ["desert", "savanna"],                 defenseRange: [2, 4],  prosperityRange: [3, 7], autonomyRange: [55, 80] },
  { key: "roadside_camp",    label: "Karavanní stanice",  nodeKind: "neutral_settlement", settlementTier: "outpost", populationRange: [40, 120],   outputBaskets: [{ basket: "tools", good: "trade_goods", quantity: 2, exportable_ratio: 0.6 }],                terrainBias: ["plains", "steppe", "desert"],        defenseRange: [1, 3],  prosperityRange: [3, 6], autonomyRange: [55, 80] },
  { key: "ruined_keep",      label: "Rozvalená pevnost",  nodeKind: "ruin",                settlementTier: "ruin",    populationRange: [0, 30],     outputBaskets: [],                                                                                            terrainBias: ["hills", "highland", "plains"],       defenseRange: [3, 6],  prosperityRange: [0, 1], autonomyRange: [90, 100] },
  { key: "fallen_temple",    label: "Padlý chrám",        nodeKind: "ruin",                settlementTier: "ruin",    populationRange: [0, 20],     outputBaskets: [],                                                                                            terrainBias: ["forest", "desert", "highland"],      defenseRange: [2, 5],  prosperityRange: [0, 1], autonomyRange: [90, 100] },
  { key: "abandoned_mine",   label: "Opuštěný důl",       nodeKind: "ruin",                settlementTier: "ruin",    populationRange: [0, 20],     outputBaskets: [],                                                                                            terrainBias: ["mountain", "hills"],                 defenseRange: [1, 4],  prosperityRange: [0, 1], autonomyRange: [85, 100] },
  { key: "old_road_marker",  label: "Starodávný milník",  nodeKind: "ruin",                settlementTier: "ruin",    populationRange: [0, 10],     outputBaskets: [],                                                                                            terrainBias: ["plains", "steppe", "hills"],         defenseRange: [0, 1],  prosperityRange: [0, 1], autonomyRange: [95, 100] },
  { key: "burned_village",   label: "Vypálená osada",     nodeKind: "ruin",                settlementTier: "ruin",    populationRange: [0, 30],     outputBaskets: [],                                                                                            terrainBias: ["plains", "forest", "river"],         defenseRange: [0, 2],  prosperityRange: [0, 1], autonomyRange: [85, 100] },
  { key: "trapper_camp",     label: "Lovecký tábor",      nodeKind: "neutral_settlement", settlementTier: "outpost", populationRange: [20, 70],    outputBaskets: [{ basket: "basic_clothing", good: "fur", quantity: 3, exportable_ratio: 0.6 }],                terrainBias: ["taiga", "forest", "tundra"],         defenseRange: [1, 3],  prosperityRange: [2, 5], autonomyRange: [70, 90] },
  { key: "cave_dwellers",    label: "Jeskynní klan",      nodeKind: "neutral_settlement", settlementTier: "hamlet",  populationRange: [30, 90],    outputBaskets: [{ basket: "tools", good: "stone", quantity: 2, exportable_ratio: 0.5 }],                      terrainBias: ["mountain", "hills", "volcanic"],     defenseRange: [3, 5],  prosperityRange: [1, 3], autonomyRange: [80, 95] },
  { key: "river_ford_post",  label: "Brodská stanice",    nodeKind: "neutral_settlement", settlementTier: "outpost", populationRange: [40, 110],   outputBaskets: [{ basket: "tools", good: "trade_goods", quantity: 2, exportable_ratio: 0.5 }],                terrainBias: ["river", "plains"],                   defenseRange: [2, 4],  prosperityRange: [3, 6], autonomyRange: [60, 85] },
];

// Deterministic 32-bit hash (FNV-1a). Stable across JS/Deno.
export function seedHash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

export function pickFromSeed<T>(arr: T[], seed: string): T {
  if (arr.length === 0) throw new Error("pickFromSeed: empty array");
  return arr[seedHash(seed) % arr.length];
}

export function rangeFromSeed(range: [number, number], seed: string): number {
  const [lo, hi] = range;
  if (hi <= lo) return lo;
  const h = seedHash(seed);
  return lo + (h % (hi - lo + 1));
}

export function generateNodeName(culture: CultureDef, nodeKey: string): string {
  const a = pickFromSeed(culture.nameRoots, nodeKey + ":a");
  const b = pickFromSeed(culture.nameRoots, nodeKey + ":b");
  // Avoid duplicating identical roots
  return a === b ? a : `${a}${b.toLowerCase()}`;
}

export function pickProfileForBiome(biome: string, seed: string): ProfileDef {
  const b = (biome || "").toLowerCase();
  const candidates = PROFILES.filter(p => p.terrainBias.some(t => b.includes(t)));
  const pool = candidates.length > 0 ? candidates : PROFILES;
  return pool[seedHash(seed + ":profile") % pool.length];
}

export function pickCultureForBiome(biome: string, tone: string[] | undefined, seed: string): CultureDef {
  const b = (biome || "").toLowerCase();
  const tones = (tone || []).map(t => t.toLowerCase());
  const terrainMatches = CULTURES.filter(c => c.terrainBias.some(t => b.includes(t)));
  const toneMatches = tones.length
    ? terrainMatches.filter(c => c.worldToneBias.some(wt => tones.includes(wt.toLowerCase())))
    : terrainMatches;
  const pool = toneMatches.length > 0 ? toneMatches : (terrainMatches.length > 0 ? terrainMatches : CULTURES);
  return pool[seedHash(seed + ":culture") % pool.length];
}
