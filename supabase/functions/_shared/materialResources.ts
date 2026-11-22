/* Canonical, geographic non-food materials. Game probabilities, not empirical geological frequencies. */
export interface MaterialSource {kind:string;good:string;label:string;harvest:string;building:string;tag:string;basket:string;price:number;capacity:number;macro:string|null;biomes:Record<string,number>}
export interface MaterialGood {key:string;label:string;category:string;basket:string;price:number;stage:'raw'|'processed'|'luxury'|'final';finalUse:boolean}
export interface MaterialProcessing {key:string;building:string;tag:string;role:string;output:string;qty:number;inputs:[string,number][]}
export const MATERIAL_SOURCES:MaterialSource[]=[
  {
    "kind": "iron",
    "good": "iron_ore",
    "label": "Železná ruda",
    "harvest": "mine_iron",
    "building": "Důl",
    "tag": "mining",
    "basket": "metalwork",
    "price": 2.2,
    "capacity": 1.5,
    "macro": "iron",
    "biomes": {
      "hillock": 0.35,
      "saddle": 0.3,
      "cliff_edge": 0.4,
      "steep_slope": 0.35,
      "ridge_woods": 0.15
    }
  },
  {
    "kind": "copper",
    "good": "copper_ore",
    "label": "Měděná ruda",
    "harvest": "mine_copper",
    "building": "Důl",
    "tag": "mining",
    "basket": "metalwork",
    "price": 2.5,
    "capacity": 1.5,
    "macro": "copper",
    "biomes": {
      "hillock": 0.2,
      "saddle": 0.2,
      "cliff_edge": 0.25,
      "steep_slope": 0.2
    }
  },
  {
    "kind": "tin",
    "good": "tin_ore",
    "label": "Cínová ruda",
    "harvest": "mine_tin",
    "building": "Důl",
    "tag": "mining",
    "basket": "metalwork",
    "price": 3.1,
    "capacity": 1.1,
    "macro": "tin",
    "biomes": {
      "hillock": 0.14,
      "saddle": 0.1,
      "cliff_edge": 0.2,
      "steep_slope": 0.15
    }
  },
  {
    "kind": "lead",
    "good": "lead_ore",
    "label": "Olověná ruda",
    "harvest": "mine_lead",
    "building": "Důl",
    "tag": "mining",
    "basket": "metalwork",
    "price": 2.4,
    "capacity": 1.2,
    "macro": "lead",
    "biomes": {
      "hillock": 0.19,
      "saddle": 0.11,
      "cliff_edge": 0.22,
      "steep_slope": 0.13
    }
  },
  {
    "kind": "silver",
    "good": "silver_ore",
    "label": "Stříbrná ruda",
    "harvest": "mine_silver",
    "building": "Důl",
    "tag": "mining",
    "basket": "luxury_clothing",
    "price": 5.2,
    "capacity": 0.6,
    "macro": "silver",
    "biomes": {
      "hillock": 0.08,
      "cliff_edge": 0.13,
      "steep_slope": 0.1
    }
  },
  {
    "kind": "coal",
    "good": "raw_coal",
    "label": "Uhlí",
    "harvest": "mine_coal",
    "building": "Důl",
    "tag": "mining",
    "basket": "fuel",
    "price": 1.4,
    "capacity": 1.9,
    "macro": "coal",
    "biomes": {
      "hillock": 0.19,
      "cliff_edge": 0.22,
      "steep_slope": 0.18,
      "ridge_woods": 0.12
    }
  },
  {
    "kind": "salt",
    "good": "raw_salt",
    "label": "Kamenná sůl",
    "harvest": "mine_salt",
    "building": "Důl",
    "tag": "mining",
    "basket": "variety",
    "price": 2.8,
    "capacity": 1.4,
    "macro": "salt",
    "biomes": {
      "sand_flat": 0.16,
      "dune": 0.15,
      "cliff_edge": 0.12,
      "shore": 0.09
    }
  },
  {
    "kind": "sulfur",
    "good": "raw_sulfur",
    "label": "Síra",
    "harvest": "mine_sulfur",
    "building": "Důl",
    "tag": "mining",
    "basket": "metalwork",
    "price": 3.4,
    "capacity": 0.8,
    "macro": "sulfur",
    "biomes": {
      "steep_slope": 0.12,
      "cliff_edge": 0.12,
      "hillock": 0.06
    }
  },
  {
    "kind": "granite",
    "good": "raw_granite",
    "label": "Žula",
    "harvest": "quarry_granite",
    "building": "Kamenolom",
    "tag": "quarrying",
    "basket": "construction",
    "price": 2.2,
    "capacity": 1.4,
    "macro": "granite",
    "biomes": {
      "cliff_edge": 0.45,
      "hillock": 0.3,
      "steep_slope": 0.35,
      "saddle": 0.25
    }
  },
  {
    "kind": "marble",
    "good": "raw_marble",
    "label": "Mramor",
    "harvest": "quarry_marble",
    "building": "Kamenolom",
    "tag": "quarrying",
    "basket": "construction",
    "price": 4.1,
    "capacity": 0.9,
    "macro": "marble",
    "biomes": {
      "cliff_edge": 0.13,
      "terrace": 0.1,
      "hillock": 0.11
    }
  },
  {
    "kind": "limestone",
    "good": "raw_limestone",
    "label": "Vápenec",
    "harvest": "quarry_limestone",
    "building": "Kamenolom",
    "tag": "quarrying",
    "basket": "construction",
    "price": 1.5,
    "capacity": 1.8,
    "macro": "limestone",
    "biomes": {
      "hillock": 0.35,
      "cliff_edge": 0.35,
      "terrace": 0.2,
      "steep_slope": 0.2
    }
  },
  {
    "kind": "sandstone",
    "good": "raw_sandstone",
    "label": "Pískovec",
    "harvest": "quarry_sandstone",
    "building": "Kamenolom",
    "tag": "quarrying",
    "basket": "construction",
    "price": 1.5,
    "capacity": 1.8,
    "macro": "sandstone",
    "biomes": {
      "hillock": 0.25,
      "steep_slope": 0.18,
      "sand_flat": 0.22,
      "terrace": 0.1
    }
  },
  {
    "kind": "flint",
    "good": "raw_flint",
    "label": "Pazourek",
    "harvest": "quarry_flint",
    "building": "Kamenolom",
    "tag": "quarrying",
    "basket": "tools",
    "price": 2.5,
    "capacity": 0.9,
    "macro": "flint",
    "biomes": {
      "hillock": 0.25,
      "terrace": 0.16,
      "steep_slope": 0.16
    }
  },
  {
    "kind": "obsidian",
    "good": "raw_obsidian",
    "label": "Obsidián",
    "harvest": "quarry_obsidian",
    "building": "Kamenolom",
    "tag": "quarrying",
    "basket": "tools",
    "price": 5.5,
    "capacity": 0.45,
    "macro": "obsidian",
    "biomes": {
      "steep_slope": 0.09,
      "cliff_edge": 0.11
    }
  },
  {
    "kind": "gypsum",
    "good": "raw_gypsum",
    "label": "Sádrovec",
    "harvest": "quarry_gypsum",
    "building": "Kamenolom",
    "tag": "quarrying",
    "basket": "construction",
    "price": 2,
    "capacity": 1.2,
    "macro": "gypsum",
    "biomes": {
      "sand_flat": 0.15,
      "dune": 0.12,
      "steep_slope": 0.15
    }
  },
  {
    "kind": "clay",
    "good": "raw_clay",
    "label": "Hrnčířský jíl",
    "harvest": "dig_clay",
    "building": "Kamenolom",
    "tag": "quarrying",
    "basket": "construction",
    "price": 0.9,
    "capacity": 2.1,
    "macro": null,
    "biomes": {
      "fertile_silt": 0.4,
      "creek_bank": 0.45,
      "boggy_dip": 0.3,
      "raised_bank": 0.22
    }
  },
  {
    "kind": "kaolin",
    "good": "raw_kaolin",
    "label": "Kaolín",
    "harvest": "dig_kaolin",
    "building": "Kamenolom",
    "tag": "quarrying",
    "basket": "construction",
    "price": 2.1,
    "capacity": 1.2,
    "macro": "kaolin",
    "biomes": {
      "fertile_silt": 0.12,
      "creek_bank": 0.08,
      "hillock": 0.12
    }
  },
  {
    "kind": "sand",
    "good": "raw_sand",
    "label": "Křemičitý písek",
    "harvest": "collect_sand",
    "building": "Kamenolom",
    "tag": "quarrying",
    "basket": "construction",
    "price": 0.8,
    "capacity": 2.3,
    "macro": null,
    "biomes": {
      "sand_flat": 1,
      "dune": 0.85,
      "shore": 0.72
    }
  },
  {
    "kind": "ochre",
    "good": "raw_ochre",
    "label": "Okr a minerální pigment",
    "harvest": "quarry_ochre",
    "building": "Kamenolom",
    "tag": "quarrying",
    "basket": "admin_supplies",
    "price": 2.4,
    "capacity": 1,
    "macro": "ochre",
    "biomes": {
      "hillock": 0.19,
      "steep_slope": 0.13,
      "terrace": 0.08
    }
  },
  {
    "kind": "cedar",
    "good": "raw_cedar",
    "label": "Cedrové kmeny",
    "harvest": "fell_cedar",
    "building": "Dřevorubecký tábor",
    "tag": "logging",
    "basket": "construction",
    "price": 2.6,
    "capacity": 1.6,
    "macro": null,
    "biomes": {
      "dense_forest": 0.21,
      "ridge_woods": 0.14
    }
  },
  {
    "kind": "hardwood",
    "good": "raw_hardwood",
    "label": "Tvrdé dřevo",
    "harvest": "fell_hardwood",
    "building": "Dřevorubecký tábor",
    "tag": "logging",
    "basket": "construction",
    "price": 1.8,
    "capacity": 2.1,
    "macro": null,
    "biomes": {
      "dense_forest": 0.45,
      "ridge_woods": 0.32
    }
  },
  {
    "kind": "resin",
    "good": "raw_resin",
    "label": "Pryskyřice",
    "harvest": "tap_resin",
    "building": "Dřevorubecký tábor",
    "tag": "logging",
    "basket": "admin_supplies",
    "price": 2.6,
    "capacity": 1.4,
    "macro": null,
    "biomes": {
      "dense_forest": 0.3,
      "ridge_woods": 0.35,
      "clearing": 0.1
    }
  },
  {
    "kind": "hemp",
    "good": "raw_hemp",
    "label": "Konopné vlákno",
    "harvest": "harvest_hemp",
    "building": "Farma",
    "tag": "farming",
    "basket": "basic_clothing",
    "price": 1.6,
    "capacity": 1.8,
    "macro": null,
    "biomes": {
      "fertile_flat": 0.2,
      "fertile_silt": 0.18,
      "grassland": 0.08,
      "creek_bank": 0.2
    }
  },
  {
    "kind": "cotton",
    "good": "raw_cotton",
    "label": "Surová bavlna",
    "harvest": "harvest_cotton",
    "building": "Farma",
    "tag": "farming",
    "basket": "basic_clothing",
    "price": 2.4,
    "capacity": 1.7,
    "macro": null,
    "biomes": {
      "fertile_flat": 0.15,
      "fertile_silt": 0.24,
      "clearing": 0.12
    }
  },
  {
    "kind": "reeds",
    "good": "raw_reeds",
    "label": "Rákos",
    "harvest": "harvest_reeds",
    "building": "Farma",
    "tag": "farming",
    "basket": "storage_logistics",
    "price": 1.1,
    "capacity": 2.1,
    "macro": null,
    "biomes": {
      "reed_marsh": 0.6,
      "boggy_dip": 0.44,
      "creek_bank": 0.26
    }
  },
  {
    "kind": "papyrus",
    "good": "raw_papyrus",
    "label": "Papyrus",
    "harvest": "harvest_papyrus",
    "building": "Farma",
    "tag": "farming",
    "basket": "admin_supplies",
    "price": 2.7,
    "capacity": 1.2,
    "macro": null,
    "biomes": {
      "reed_marsh": 0.23,
      "creek_bank": 0.17,
      "boggy_dip": 0.13
    }
  },
  {
    "kind": "herbs",
    "good": "raw_herbs",
    "label": "Léčivé byliny",
    "harvest": "collect_herbs",
    "building": "Rašeliniště",
    "tag": "gathering",
    "basket": "variety",
    "price": 2.6,
    "capacity": 1.5,
    "macro": null,
    "biomes": {
      "clearing": 0.2,
      "dense_forest": 0.25,
      "grassland": 0.12,
      "sheltered_hollow": 0.19,
      "boggy_dip": 0.2
    }
  }
];
export const MATERIAL_DERIVED:MaterialGood[]=[
  {
    "key": "tin_ingot",
    "label": "Cínový ingot",
    "category": "metalwork",
    "basket": "tools",
    "price": 3.7,
    "stage": "processed",
    "finalUse": false
  },
  {
    "key": "lead_ingot",
    "label": "Olověný ingot",
    "category": "metalwork",
    "basket": "tools",
    "price": 3.1,
    "stage": "processed",
    "finalUse": false
  },
  {
    "key": "silver_ingot",
    "label": "Stříbrný ingot",
    "category": "metalwork",
    "basket": "luxury_clothing",
    "price": 6.4,
    "stage": "processed",
    "finalUse": false
  },
  {
    "key": "bronze_ingot",
    "label": "Bronzový ingot",
    "category": "metalwork",
    "basket": "tools",
    "price": 4.5,
    "stage": "processed",
    "finalUse": false
  },
  {
    "key": "fine_lumber",
    "label": "Kvalitní cedrové řezivo",
    "category": "construction",
    "basket": "construction",
    "price": 3.7,
    "stage": "processed",
    "finalUse": true
  },
  {
    "key": "hardwood_lumber",
    "label": "Tvrdé řezivo",
    "category": "construction",
    "basket": "construction",
    "price": 2.5,
    "stage": "processed",
    "finalUse": true
  },
  {
    "key": "bricks",
    "label": "Pálené cihly",
    "category": "construction",
    "basket": "construction",
    "price": 2.5,
    "stage": "processed",
    "finalUse": true
  },
  {
    "key": "glassware",
    "label": "Skleněné zboží",
    "category": "craft",
    "basket": "variety",
    "price": 4.6,
    "stage": "final",
    "finalUse": true
  },
  {
    "key": "quicklime",
    "label": "Pálené vápno",
    "category": "construction",
    "basket": "construction",
    "price": 2,
    "stage": "processed",
    "finalUse": true
  },
  {
    "key": "plaster",
    "label": "Sádrová omítka",
    "category": "construction",
    "basket": "construction",
    "price": 2.6,
    "stage": "processed",
    "finalUse": true
  },
  {
    "key": "marble_blocks",
    "label": "Mramorové bloky",
    "category": "construction",
    "basket": "construction",
    "price": 5,
    "stage": "processed",
    "finalUse": true
  },
  {
    "key": "granite_blocks",
    "label": "Žulové bloky",
    "category": "construction",
    "basket": "construction",
    "price": 3,
    "stage": "processed",
    "finalUse": true
  },
  {
    "key": "sandstone_blocks",
    "label": "Pískovcové bloky",
    "category": "construction",
    "basket": "construction",
    "price": 2.7,
    "stage": "processed",
    "finalUse": true
  },
  {
    "key": "stone_tools",
    "label": "Pazourkové nástroje",
    "category": "metalwork",
    "basket": "tools",
    "price": 2,
    "stage": "final",
    "finalUse": true
  },
  {
    "key": "obsidian_tools",
    "label": "Obsidiánové nástroje",
    "category": "metalwork",
    "basket": "tools",
    "price": 4,
    "stage": "final",
    "finalUse": true
  },
  {
    "key": "pigments",
    "label": "Pigmenty",
    "category": "craft",
    "basket": "admin_supplies",
    "price": 3.2,
    "stage": "processed",
    "finalUse": true
  },
  {
    "key": "cotton_yarn",
    "label": "Bavlněná příze",
    "category": "textile",
    "basket": "basic_clothing",
    "price": 2.5,
    "stage": "processed",
    "finalUse": false
  },
  {
    "key": "wool_yarn",
    "label": "Vlněná příze",
    "category": "textile",
    "basket": "basic_clothing",
    "price": 2,
    "stage": "processed",
    "finalUse": false
  },
  {
    "key": "rope",
    "label": "Provazy a lana",
    "category": "textile",
    "basket": "storage_logistics",
    "price": 2.5,
    "stage": "final",
    "finalUse": true
  },
  {
    "key": "basketry",
    "label": "Košíkářské výrobky",
    "category": "craft",
    "basket": "storage_logistics",
    "price": 2,
    "stage": "final",
    "finalUse": true
  },
  {
    "key": "remedy_goods",
    "label": "Léčivé přípravky",
    "category": "craft",
    "basket": "variety",
    "price": 3.8,
    "stage": "final",
    "finalUse": true
  },
  {
    "key": "refined_salt",
    "label": "Kuchyňská sůl",
    "category": "craft",
    "basket": "variety",
    "price": 3.5,
    "stage": "processed",
    "finalUse": true
  },
  {
    "key": "sulfur_pigment",
    "label": "Sirné barvivo",
    "category": "craft",
    "basket": "admin_supplies",
    "price": 3.4,
    "stage": "processed",
    "finalUse": true
  },
  {
    "key": "raw_wool",
    "label": "Ovčí vlna",
    "category": "textile",
    "basket": "basic_clothing",
    "price": 1.2,
    "stage": "raw",
    "finalUse": false
  }
];
export const MATERIAL_PROCESSING:MaterialProcessing[]=[
  {
    "key": "smelt_tin",
    "building": "Huť",
    "tag": "smelting",
    "role": "processing",
    "output": "tin_ingot",
    "qty": 2,
    "inputs": [
      [
        "tin_ore",
        3
      ],
      [
        "charcoal",
        1
      ]
    ]
  },
  {
    "key": "smelt_lead",
    "building": "Huť",
    "tag": "smelting",
    "role": "processing",
    "output": "lead_ingot",
    "qty": 2,
    "inputs": [
      [
        "lead_ore",
        3
      ],
      [
        "charcoal",
        1
      ]
    ]
  },
  {
    "key": "smelt_silver",
    "building": "Huť",
    "tag": "smelting",
    "role": "processing",
    "output": "silver_ingot",
    "qty": 1,
    "inputs": [
      [
        "silver_ore",
        3
      ],
      [
        "charcoal",
        1
      ]
    ]
  },
  {
    "key": "cast_bronze",
    "building": "Huť",
    "tag": "smelting",
    "role": "processing",
    "output": "bronze_ingot",
    "qty": 3,
    "inputs": [
      [
        "copper_ingot",
        2
      ],
      [
        "tin_ingot",
        1
      ]
    ]
  },
  {
    "key": "forge_bronze_tools",
    "building": "Kovárna",
    "tag": "smithing",
    "role": "urban",
    "output": "metalwork_tools",
    "qty": 2,
    "inputs": [
      [
        "bronze_ingot",
        2
      ],
      [
        "lumber",
        1
      ]
    ]
  },
  {
    "key": "craft_silver_jewelry",
    "building": "Klenotnická dílna",
    "tag": "master_craft",
    "role": "guild",
    "output": "jewelry",
    "qty": 1,
    "inputs": [
      [
        "silver_ingot",
        2
      ]
    ]
  },
  {
    "key": "saw_cedar",
    "building": "Pila",
    "tag": "sawing",
    "role": "processing",
    "output": "fine_lumber",
    "qty": 2,
    "inputs": [
      [
        "raw_cedar",
        3
      ]
    ]
  },
  {
    "key": "saw_hardwood",
    "building": "Pila",
    "tag": "sawing",
    "role": "processing",
    "output": "hardwood_lumber",
    "qty": 2,
    "inputs": [
      [
        "raw_hardwood",
        3
      ]
    ]
  },
  {
    "key": "fire_bricks",
    "building": "Hrnčířská dílna",
    "tag": "crafting",
    "role": "urban",
    "output": "bricks",
    "qty": 3,
    "inputs": [
      [
        "raw_clay",
        3
      ],
      [
        "charcoal",
        1
      ]
    ]
  },
  {
    "key": "make_glass",
    "building": "Sklárna",
    "tag": "glassmaking",
    "role": "urban",
    "output": "glassware",
    "qty": 2,
    "inputs": [
      [
        "raw_sand",
        3
      ],
      [
        "raw_limestone",
        1
      ],
      [
        "charcoal",
        1
      ]
    ]
  },
  {
    "key": "burn_lime",
    "building": "Huť",
    "tag": "smelting",
    "role": "processing",
    "output": "quicklime",
    "qty": 2,
    "inputs": [
      [
        "raw_limestone",
        3
      ],
      [
        "charcoal",
        1
      ]
    ]
  },
  {
    "key": "make_plaster",
    "building": "Kamenictví",
    "tag": "stonecutting",
    "role": "processing",
    "output": "plaster",
    "qty": 2,
    "inputs": [
      [
        "raw_gypsum",
        3
      ]
    ]
  },
  {
    "key": "cut_marble",
    "building": "Kamenictví",
    "tag": "stonecutting",
    "role": "processing",
    "output": "marble_blocks",
    "qty": 2,
    "inputs": [
      [
        "raw_marble",
        3
      ]
    ]
  },
  {
    "key": "cut_granite",
    "building": "Kamenictví",
    "tag": "stonecutting",
    "role": "processing",
    "output": "granite_blocks",
    "qty": 2,
    "inputs": [
      [
        "raw_granite",
        3
      ]
    ]
  },
  {
    "key": "cut_sandstone",
    "building": "Kamenictví",
    "tag": "stonecutting",
    "role": "processing",
    "output": "sandstone_blocks",
    "qty": 2,
    "inputs": [
      [
        "raw_sandstone",
        3
      ]
    ]
  },
  {
    "key": "knap_flint",
    "building": "Kamenictví",
    "tag": "stonecutting",
    "role": "processing",
    "output": "stone_tools",
    "qty": 3,
    "inputs": [
      [
        "raw_flint",
        2
      ]
    ]
  },
  {
    "key": "carve_obsidian",
    "building": "Kamenictví",
    "tag": "stonecutting",
    "role": "processing",
    "output": "obsidian_tools",
    "qty": 2,
    "inputs": [
      [
        "raw_obsidian",
        2
      ]
    ]
  },
  {
    "key": "extract_pigment",
    "building": "Hrnčířská dílna",
    "tag": "crafting",
    "role": "urban",
    "output": "pigments",
    "qty": 2,
    "inputs": [
      [
        "raw_ochre",
        2
      ]
    ]
  },
  {
    "key": "spin_hemp",
    "building": "Přádelna",
    "tag": "spinning",
    "role": "processing",
    "output": "yarn",
    "qty": 3,
    "inputs": [
      [
        "raw_hemp",
        3
      ]
    ]
  },
  {
    "key": "spin_cotton",
    "building": "Přádelna",
    "tag": "spinning",
    "role": "processing",
    "output": "cotton_yarn",
    "qty": 2,
    "inputs": [
      [
        "raw_cotton",
        3
      ]
    ]
  },
  {
    "key": "spin_wool",
    "building": "Přádelna",
    "tag": "spinning",
    "role": "processing",
    "output": "wool_yarn",
    "qty": 2,
    "inputs": [
      [
        "raw_wool",
        3
      ]
    ]
  },
  {
    "key": "weave_cotton",
    "building": "Tkalcovna",
    "tag": "weaving",
    "role": "urban",
    "output": "textile_basic",
    "qty": 2,
    "inputs": [
      [
        "cotton_yarn",
        2
      ]
    ]
  },
  {
    "key": "weave_wool",
    "building": "Tkalcovna",
    "tag": "weaving",
    "role": "urban",
    "output": "textile_basic",
    "qty": 2,
    "inputs": [
      [
        "wool_yarn",
        2
      ]
    ]
  },
  {
    "key": "make_rope",
    "building": "Přádelna",
    "tag": "spinning",
    "role": "processing",
    "output": "rope",
    "qty": 2,
    "inputs": [
      [
        "raw_hemp",
        3
      ]
    ]
  },
  {
    "key": "scribe_papyrus",
    "building": "Písařská dílna",
    "tag": "crafting",
    "role": "producer",
    "output": "scribed_documents",
    "qty": 2,
    "inputs": [
      [
        "raw_papyrus",
        2
      ]
    ]
  },
  {
    "key": "weave_reeds",
    "building": "Hrnčířská dílna",
    "tag": "crafting",
    "role": "urban",
    "output": "basketry",
    "qty": 3,
    "inputs": [
      [
        "raw_reeds",
        3
      ]
    ]
  },
  {
    "key": "prepare_herbal",
    "building": "Chrámová dílna",
    "tag": "ritual_craft",
    "role": "guild",
    "output": "remedy_goods",
    "qty": 2,
    "inputs": [
      [
        "raw_herbs",
        2
      ]
    ]
  },
  {
    "key": "craft_resin_incense",
    "building": "Chrámová dílna",
    "tag": "ritual_craft",
    "role": "guild",
    "output": "ritual_goods",
    "qty": 2,
    "inputs": [
      [
        "raw_resin",
        2
      ],
      [
        "olive_oil",
        1
      ]
    ]
  },
  {
    "key": "refine_salt",
    "building": "Hrnčířská dílna",
    "tag": "crafting",
    "role": "urban",
    "output": "refined_salt",
    "qty": 3,
    "inputs": [
      [
        "raw_salt",
        3
      ]
    ]
  },
  {
    "key": "make_sulfur_pigment",
    "building": "Hrnčířská dílna",
    "tag": "crafting",
    "role": "urban",
    "output": "sulfur_pigment",
    "qty": 2,
    "inputs": [
      [
        "raw_sulfur",
        2
      ]
    ]
  },
  {
    "key": "make_kaolin_pottery",
    "building": "Hrnčířská dílna",
    "tag": "crafting",
    "role": "urban",
    "output": "pottery",
    "qty": 2,
    "inputs": [
      [
        "raw_kaolin",
        3
      ],
      [
        "charcoal",
        1
      ]
    ]
  }
];
export const MATERIAL_RAW_GOODS:MaterialGood[]=MATERIAL_SOURCES.map(s=>({key:s.good,label:s.label,category:s.basket==='fuel'?'raw':s.basket==='basic_clothing'?'textile':s.basket==='construction'?'construction':s.basket==='metalwork'?'metalwork':'craft',basket:s.basket,price:s.price,stage:'raw',finalUse:s.kind==='coal'}));
export const MATERIAL_SOURCE_RECIPES=MATERIAL_SOURCES.map(s=>({key:s.harvest,building:s.building,tag:s.tag,role:'source' as const,output:s.good,qty:2,inputs:[] as [string,number][]}));
export const MATERIAL_BY_KIND=new Map(MATERIAL_SOURCES.map(r=>[r.kind,r]));
export const MATERIAL_BY_RECIPE=new Map(MATERIAL_SOURCES.map(r=>[r.harvest,r]));