import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
const hexKey = (q: number, r: number) => `${q},${r}`;
const axialDist = (q1: number, r1: number, q2: number, r2: number) => {
  const dq = q1 - q2, dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
};

function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return (Math.abs(h) % 10000) / 10000;
}

// ═══════════════════════════════════════
// CAPABILITY TAGS — node_subtype → tags + role
// Mirrors NODE_CAPABILITY_MAP from goodsCatalog.ts
// ═══════════════════════════════════════
// IMPORTANT: tagy se MUSÍ shodovat s `required_tags` v `production_recipes`,
// jinak nody nic neprodukují. Aktivní tagy v recipes:
// farming, viticulture, herding, gathering, fishing, mining, quarrying,
// logging, sawing, smelting, smithing, baking, brewing, weaving, spinning,
// milling, pressing, fermenting, preserving, tanning, leatherwork, armoring,
// stonecutting, salting, construction, crafting, ritual_craft, master_craft.
const NODE_CAPABILITY_MAP: Record<string, { role: string; tags: string[] }> = {
  field: { role: "source", tags: ["farming", "milling"] },
  vineyard: { role: "source", tags: ["farming", "viticulture", "fermenting", "pressing"] },
  hunting_ground: { role: "source", tags: ["herding", "gathering", "tanning", "preserving"] },
  pastoral_camp: { role: "source", tags: ["herding", "tanning", "leatherwork", "spinning", "weaving"] },
  fishery: { role: "source", tags: ["fishing", "salting", "preserving"] },
  fishing_village: { role: "source", tags: ["fishing", "salting", "preserving"] },
  mine: { role: "source", tags: ["mining", "smelting"] },
  mining_camp: { role: "source", tags: ["mining", "quarrying", "smelting", "stonecutting"] },
  quarry: { role: "source", tags: ["quarrying", "stonecutting"] },
  sawmill: { role: "source", tags: ["logging", "sawing"] },
  lumber_camp: { role: "source", tags: ["logging", "sawing"] },
  herbalist: { role: "source", tags: ["gathering", "brewing", "preserving"] },
  salt_pan: { role: "source", tags: ["mining", "salting"] },
  village: { role: "source", tags: ["farming", "herding", "baking", "brewing", "milling", "weaving", "crafting"] },
  smithy: { role: "processing", tags: ["smelting", "smithing", "armoring"] },
  trade_hub: { role: "urban", tags: ["construction", "crafting", "weaving", "spinning", "baking", "master_craft"] },
  trade_post: { role: "urban", tags: ["construction", "crafting"] },
  shrine: { role: "source", tags: ["ritual_craft"] },
  watchtower: { role: "source", tags: [] },
};

// Biome → extra bonus capability tags (každý hex má 3-5 tagů → pokryje 12 baskets)
const BIOME_BONUS_TAGS: Record<string, string[]> = {
  forest: ["logging", "sawing", "gathering"],
  taiga: ["logging", "sawing"],
  hills: ["mining", "quarrying", "smelting", "stonecutting"],
  mountain: ["mining", "quarrying", "smelting", "stonecutting"],
  mountains: ["mining", "quarrying", "smelting", "stonecutting"],
  highland: ["mining", "quarrying", "stonecutting"],
  coastal: ["fishing", "salting", "preserving"],
  coast: ["fishing", "salting", "preserving"],
  lake: ["fishing", "salting"],
  river: ["fishing", "salting"],
  plains: ["farming", "herding", "weaving", "milling"],
  grassland: ["farming", "herding", "weaving"],
  steppe: ["herding", "tanning", "leatherwork"],
  savanna: ["herding", "tanning"],
  temperate: ["farming", "weaving"],
  desert: ["mining", "salting"],
  marsh: ["gathering", "brewing", "preserving"],
  jungle: ["gathering", "brewing"],
  volcanic: ["mining", "smelting"],
};

function resolveCapabilityTags(subtype: string, biome: string): { role: string; tags: string[] } {
  const base = NODE_CAPABILITY_MAP[subtype] || { role: "source", tags: [] };
  const biomeTags = BIOME_BONUS_TAGS[biome?.toLowerCase()] || [];
  // Merge unique tags
  const allTags = [...new Set([...base.tags, ...biomeTags])];
  return { role: base.role, tags: allTags };
}

// Strategic resource spawn table
const STRATEGIC_SPAWN_TABLE = [
  { type: "iron", chance: 0.15, biomes: ["hills", "mountain"], label: "Železo" },
  { type: "horses", chance: 0.10, biomes: ["plains", "steppe"], label: "Koně" },
  { type: "salt", chance: 0.10, biomes: ["plains", "desert", "hills", "coastal"], label: "Sůl" },
  { type: "copper", chance: 0.15, biomes: ["hills", "mountain"], label: "Měď" },
  { type: "gold_deposit", chance: 0.05, biomes: ["hills", "mountain", "desert"], label: "Zlato" },
  { type: "marble", chance: 0.08, biomes: ["hills", "mountain"], label: "Mramor" },
  { type: "gems", chance: 0.05, biomes: ["mountain", "hills", "jungle"], label: "Drahokamy" },
  { type: "timber", chance: 0.15, biomes: ["forest", "taiga"], label: "Kvalitní dřevo" },
  { type: "obsidian", chance: 0.05, biomes: ["mountain", "volcanic"], label: "Obsidián" },
  { type: "silk", chance: 0.05, biomes: ["forest", "jungle", "plains"], label: "Hedvábí" },
  { type: "incense", chance: 0.08, biomes: ["desert", "jungle", "savanna"], label: "Kadidlo" },
];

// Minor node subtypes with base production
const MINOR_SUBTYPES: Record<string, { biomes: string[]; prod: Record<string, number>; label: string; icon: string }> = {
  village:       { biomes: ["plains", "grassland", "temperate", "forest"], prod: { grain: 4, wood: 2, wealth: 1 }, label: "Vesnice", icon: "🏘️" },
  lumber_camp:   { biomes: ["forest", "taiga"], prod: { wood: 8, grain: 1, wealth: 1 }, label: "Dřevařská osada", icon: "🪵" },
  fishing_village:{ biomes: ["coastal", "lake", "river"], prod: { grain: 6, wood: 1, wealth: 2 }, label: "Rybářská osada", icon: "🎣" },
  mining_camp:   { biomes: ["hills", "mountain", "highland"], prod: { stone: 4, iron: 6, wealth: 1 }, label: "Hornická osada", icon: "⛏️" },
  pastoral_camp: { biomes: ["steppe", "plains", "grassland", "savanna"], prod: { grain: 5, wealth: 2 }, label: "Pastýřská osada", icon: "🐑" },
  trade_post:    { biomes: ["plains", "grassland", "steppe", "coastal", "river"], prod: { wealth: 6, grain: 1 }, label: "Obchodní stanice", icon: "🏪" },
  shrine:        { biomes: ["forest", "mountain", "highland", "marsh"], prod: { faith: 8, wealth: 1 }, label: "Svatyně", icon: "⛪" },
  watchtower:    { biomes: ["hills", "mountain", "highland", "plains", "steppe"], prod: { stone: 1, iron: 1 }, label: "Strážní věž", icon: "🏰" },
};

// Micro node subtypes
const MICRO_SUBTYPES: Record<string, { biomes: string[]; prod: Record<string, number>; strategicPool: string[]; spawnChance: number; label: string; icon: string }> = {
  field:          { biomes: ["plains", "grassland", "temperate", "river"], prod: { grain: 6 }, strategicPool: ["salt"], spawnChance: 0.08, label: "Pole", icon: "🌾" },
  sawmill:        { biomes: ["forest", "taiga"], prod: { wood: 7, wealth: 1 }, strategicPool: ["timber"], spawnChance: 0.12, label: "Pila", icon: "🪚" },
  mine:           { biomes: ["hills", "mountain", "highland"], prod: { iron: 5, stone: 2, wealth: 1 }, strategicPool: ["iron", "copper", "gold_deposit", "gems"], spawnChance: 0.18, label: "Důl", icon: "⛏️" },
  hunting_ground: { biomes: ["forest", "steppe", "grassland", "taiga"], prod: { grain: 4, wood: 1, wealth: 1 }, strategicPool: ["horses"], spawnChance: 0.10, label: "Loviště", icon: "🏹" },
  fishery:        { biomes: ["coastal", "lake", "river", "marsh"], prod: { grain: 5, wealth: 2 }, strategicPool: ["salt"], spawnChance: 0.10, label: "Rybárna", icon: "🐟" },
  quarry:         { biomes: ["hills", "mountain", "highland"], prod: { stone: 7 }, strategicPool: ["marble"], spawnChance: 0.12, label: "Lom", icon: "🪨" },
  vineyard:       { biomes: ["temperate", "plains", "grassland", "hills"], prod: { wealth: 5, grain: 1 }, strategicPool: ["silk"], spawnChance: 0.08, label: "Vinice", icon: "🍇" },
  herbalist:      { biomes: ["forest", "marsh", "jungle", "temperate"], prod: { faith: 4, wealth: 1 }, strategicPool: ["incense"], spawnChance: 0.12, label: "Bylinkárna", icon: "🌿" },
  smithy:         { biomes: ["hills", "mountain"], prod: { iron: 3, wealth: 2 }, strategicPool: ["obsidian"], spawnChance: 0.10, label: "Kovárna", icon: "🔨" },
  salt_pan:       { biomes: ["coastal", "desert", "steppe"], prod: { wealth: 4 }, strategicPool: ["salt"], spawnChance: 0.20, label: "Solná pánev", icon: "🧂" },
};

function pickMinorSubtype(biome: string, seed: string): string {
  const b = biome?.toLowerCase() || "";
  const matches = Object.entries(MINOR_SUBTYPES)
    .filter(([, def]) => def.biomes.some(pb => b.includes(pb)))
    .map(([key]) => key);
  if (matches.length === 0) return "village";
  const idx = Math.floor(seededRandom(seed + "_minor") * matches.length);
  return matches[idx];
}

function pickMicroSubtype(biome: string, seed: string): string {
  const b = biome?.toLowerCase() || "";
  const matches = Object.entries(MICRO_SUBTYPES)
    .filter(([, def]) => def.biomes.some(pb => b.includes(pb)))
    .map(([key]) => key);
  if (matches.length === 0) return "field";
  const idx = Math.floor(seededRandom(seed + "_micro") * matches.length);
  return matches[idx];
}

function rollStrategicResource(biome: string, seed: string): { type: string; label: string } | null {
  const b = biome?.toLowerCase() || "";
  const roll = seededRandom(seed + "_strat");
  if (roll > 0.30) return null;
  let cumulative = 0;
  for (const sr of STRATEGIC_SPAWN_TABLE) {
    const biomeBonus = sr.biomes.some(sb => b.includes(sb)) ? 1.5 : 0.5;
    cumulative += sr.chance * biomeBonus;
    if (roll < cumulative) return { type: sr.type, label: sr.label };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Load provinces, hexes, cities, AND existing nodes
    const [provRes, hexRes, cityRes, existingNodesRes] = await Promise.all([
      sb.from("provinces").select("id, name, owner_player, center_q, center_r").eq("session_id", session_id),
      sb.from("province_hexes").select("id, q, r, province_id, biome_family, coastal, mean_height, is_passable, movement_cost").eq("session_id", session_id).limit(10000),
      sb.from("cities").select("id, name, province_id, province_q, province_r, is_capital, settlement_level, population_total, owner_player").eq("session_id", session_id),
      sb.from("province_nodes").select("id, hex_q, hex_r, node_tier, node_subtype, city_id").eq("session_id", session_id),
    ]);

    const provinces = provRes.data || [];
    const allHexes = hexRes.data || [];
    const cities = cityRes.data || [];
    const existingNodes = existingNodesRes.data || [];

    // Build occupied hex set — ADDITIVE: skip hexes that already have a node
    const occupiedHexes = new Set<string>();
    for (const n of existingNodes) {
      occupiedHexes.add(hexKey(n.hex_q, n.hex_r));
    }
    // Also track which cities already have a node
    const citiesWithNode = new Set<string>();
    for (const n of existingNodes) {
      if (n.city_id) citiesWithNode.add(n.city_id);
    }

    // Index hexes
    const hexByProv: Record<string, typeof allHexes> = {};
    const hexByCoord: Record<string, typeof allHexes[0]> = {};
    for (const h of allHexes) {
      hexByCoord[hexKey(h.q, h.r)] = h;
      if (h.province_id) {
        if (!hexByProv[h.province_id]) hexByProv[h.province_id] = [];
        hexByProv[h.province_id].push(h);
      }
    }

    // Border hexes per province
    const borderHexes: Record<string, typeof allHexes> = {};
    for (const h of allHexes) {
      if (!h.province_id) continue;
      for (const [dq, dr] of NEIGHBORS) {
        const n = hexByCoord[hexKey(h.q + dq, h.r + dr)];
        if (!n || n.province_id !== h.province_id) {
          if (!borderHexes[h.province_id]) borderHexes[h.province_id] = [];
          borderHexes[h.province_id].push(h);
          break;
        }
      }
    }

    const allNewNodes: any[] = [];
    const majorIndices: Array<{ idx: number; provId: string; hex_q: number; hex_r: number }> = [];
    const minorIndices: Array<{ idx: number; provId: string; hex_q: number; hex_r: number }> = [];

    // Also include existing major nodes for parent assignment
    const existingMajors = existingNodes.filter(n => n.node_tier === "major");

    for (const prov of provinces) {
      const pHexes = hexByProv[prov.id] || [];
      const pBorder = borderHexes[prov.id] || [];
      const owner = prov.owner_player || null;

      // ═══════════════════════════════════════
      // TIER 1: MAJOR NODES (cities, ports, fortresses)
      // Only add for cities that don't already have a node
      // ═══════════════════════════════════════
      const provCities = cities.filter(c => c.province_id === prov.id);
      
      const mainCity = provCities.sort((a, b) => (b.population_total || 0) - (a.population_total || 0))[0];
      if (mainCity && !citiesWithNode.has(mainCity.id) && !occupiedHexes.has(hexKey(mainCity.province_q, mainCity.province_r))) {
        const capTags = resolveCapabilityTags("city", mainCity.settlement_level || "village");
        const idx = allNewNodes.length;
        allNewNodes.push({
          session_id, province_id: prov.id, node_type: "primary_city",
          node_tier: "major", node_subtype: "city", node_class: "major",
          name: mainCity.name, hex_q: mainCity.province_q, hex_r: mainCity.province_r,
          city_id: mainCity.id, controlled_by: owner,
          strategic_value: 10, economic_value: 8, defense_value: 5,
          mobility_relevance: 7, supply_relevance: 9,
          population: mainCity.population_total || 0,
          is_major: true, flow_role: "hub",
          production_role: "urban",
          capability_tags: ["farming", "herding", "construction", "baking", "crafting"],
          throughput_military: 1.0, toll_rate: 0,
          resource_output: {},
          metadata: { settlement_level: mainCity.settlement_level, population: mainCity.population_total },
        });
        occupiedHexes.add(hexKey(mainCity.province_q, mainCity.province_r));
        majorIndices.push({ idx, provId: prov.id, hex_q: mainCity.province_q, hex_r: mainCity.province_r });
      }

      // Secondary cities
      for (const sc of provCities.filter(c => c.id !== mainCity?.id)) {
        if (citiesWithNode.has(sc.id) || occupiedHexes.has(hexKey(sc.province_q, sc.province_r))) continue;
        const idx = allNewNodes.length;
        allNewNodes.push({
          session_id, province_id: prov.id, node_type: "secondary_city",
          node_tier: "major", node_subtype: "city", node_class: "major",
          name: sc.name, hex_q: sc.province_q, hex_r: sc.province_r,
          city_id: sc.id, controlled_by: owner,
          strategic_value: 7, economic_value: 6, defense_value: 4,
          mobility_relevance: 6, supply_relevance: 7,
          population: sc.population_total || 0,
          is_major: true, flow_role: "hub",
          production_role: "urban",
          capability_tags: ["farming", "herding", "construction"],
          throughput_military: 1.0, toll_rate: 0,
          resource_output: {},
          metadata: { settlement_level: sc.settlement_level, population: sc.population_total },
        });
        occupiedHexes.add(hexKey(sc.province_q, sc.province_r));
        majorIndices.push({ idx, provId: prov.id, hex_q: sc.province_q, hex_r: sc.province_r });
      }

      // Port (if coastal province, skip if hex occupied)
      const coastalHexes = pHexes.filter(h => h.coastal && h.is_passable);
      if (coastalHexes.length > 0) {
        const portHex = coastalHexes
          .filter(h => !occupiedHexes.has(hexKey(h.q, h.r)))
          .sort((a, b) =>
            axialDist(a.q, a.r, prov.center_q || 0, prov.center_r || 0) -
            axialDist(b.q, b.r, prov.center_q || 0, prov.center_r || 0)
          )[0];
        if (portHex) {
          const capTags = resolveCapabilityTags("trade_hub", portHex.biome_family || "coastal");
          const idx = allNewNodes.length;
          allNewNodes.push({
            session_id, province_id: prov.id, node_type: "port",
            node_tier: "major", node_subtype: "trade_hub", node_class: "major",
            name: `Přístav ${prov.name}`, hex_q: portHex.q, hex_r: portHex.r,
            controlled_by: owner,
            strategic_value: 6, economic_value: 7, defense_value: 3,
            mobility_relevance: 9, supply_relevance: 8,
            is_major: true, flow_role: "hub",
            production_role: capTags.role,
            capability_tags: capTags.tags,
            throughput_military: 1.0, toll_rate: 0.05,
            resource_output: { wealth: 2 },
            metadata: { biome: portHex.biome_family },
          });
          occupiedHexes.add(hexKey(portHex.q, portHex.r));
          majorIndices.push({ idx, provId: prov.id, hex_q: portHex.q, hex_r: portHex.r });
        }
      }

      // Fortress (if hills/mountain border, skip occupied)
      const hillBorder = pBorder.filter(h => (h.biome_family === "hills" || h.mean_height > 55) && !occupiedHexes.has(hexKey(h.q, h.r)));
      if (hillBorder.length > 0) {
        const fortHex = hillBorder.sort((a, b) => b.mean_height - a.mean_height)[0];
        const capTags = resolveCapabilityTags("watchtower", fortHex.biome_family || "hills");
        const idx = allNewNodes.length;
        allNewNodes.push({
          session_id, province_id: prov.id, node_type: "fortress",
          node_tier: "major", node_subtype: "fortress", node_class: "major",
          name: `Pevnost ${prov.name}`, hex_q: fortHex.q, hex_r: fortHex.r,
          controlled_by: owner,
          strategic_value: 8, economic_value: 1, defense_value: 10,
          mobility_relevance: 3, supply_relevance: 4,
          is_major: true, flow_role: "gateway",
          production_role: "source",
          capability_tags: capTags.tags,
          throughput_military: 0.8, toll_rate: 0.1,
          fortification_level: 1,
          resource_output: {},
          metadata: { elevation: fortHex.mean_height, biome: fortHex.biome_family },
        });
        occupiedHexes.add(hexKey(fortHex.q, fortHex.r));
        majorIndices.push({ idx, provId: prov.id, hex_q: fortHex.q, hex_r: fortHex.r });
      }

      // ═══════════════════════════════════════
      // TIER 2: MINOR NODES (settlements / resource clusters)
      // ═══════════════════════════════════════
      const forests = pHexes.filter(h => h.biome_family === "forest" && h.is_passable);
      const plains = pHexes.filter(h => (h.biome_family === "plains" || h.biome_family === "grassland") && h.is_passable);
      const hills = pHexes.filter(h => h.biome_family === "hills" && h.is_passable);
      const coastal = pHexes.filter(h => h.coastal && h.is_passable);
      const other = pHexes.filter(h => h.is_passable && !["forest", "plains", "grassland", "hills"].includes(h.biome_family || ""));

      const clusters: Array<{ hexes: typeof pHexes; biome: string; name: string }> = [];
      if (forests.length >= 3) clusters.push({ hexes: forests, biome: "forest", name: `Hvozd ${prov.name}` });
      if (plains.length >= 3) clusters.push({ hexes: plains, biome: "plains", name: `Pole ${prov.name}` });
      if (hills.length >= 3) clusters.push({ hexes: hills, biome: "hills", name: `Lom ${prov.name}` });
      if (coastal.length >= 2 && coastalHexes.length === 0) clusters.push({ hexes: coastal, biome: "coastal", name: `Pobřeží ${prov.name}` });
      if (other.length >= 3) clusters.push({ hexes: other, biome: other[0]?.biome_family || "plains", name: `Sídliště ${prov.name}` });
      if (clusters.length === 0 && pHexes.length > 0) {
        clusters.push({ hexes: pHexes.filter(h => h.is_passable), biome: pHexes[0]?.biome_family || "plains", name: `Osada ${prov.name}` });
      }

      // Trade hub at border crossing (minor gateway) — skip if hex occupied
      if (pBorder.length > 0) {
        const hexProvCount: Record<string, Set<string>> = {};
        for (const h of pBorder) {
          if (occupiedHexes.has(hexKey(h.q, h.r))) continue;
          const key = hexKey(h.q, h.r);
          if (!hexProvCount[key]) hexProvCount[key] = new Set();
          for (const [dq, dr] of NEIGHBORS) {
            const n = hexByCoord[hexKey(h.q + dq, h.r + dr)];
            if (n && n.province_id && n.province_id !== prov.id) hexProvCount[key].add(n.province_id);
          }
        }
        const best = Object.entries(hexProvCount).sort((a, b) => b[1].size - a[1].size)[0];
        if (best && best[1].size > 0) {
          const [bq, br] = best[0].split(",").map(Number);
          const biome = hexByCoord[hexKey(bq, br)]?.biome_family || "plains";
          const capTags = resolveCapabilityTags("trade_post", biome);
          const idx = allNewNodes.length;
          allNewNodes.push({
            session_id, province_id: prov.id, node_type: "trade_hub",
            node_tier: "minor", node_subtype: "trade_post", node_class: "minor",
            name: `Tržiště ${prov.name}`, hex_q: bq, hex_r: br,
            controlled_by: owner,
            strategic_value: 4, economic_value: 9, defense_value: 2,
            mobility_relevance: 8, supply_relevance: 7,
            is_major: false, flow_role: "gateway",
            production_role: capTags.role,
            capability_tags: capTags.tags,
            throughput_military: 1.0, toll_rate: 0.05,
            resource_output: { wealth: 3 },
            metadata: { adjacent_provinces: best[1].size },
          });
          occupiedHexes.add(hexKey(bq, br));
          minorIndices.push({ idx, provId: prov.id, hex_q: bq, hex_r: br });
        }
      }

      // Resource cluster minor nodes
      for (const cluster of clusters) {
        const avgQ = Math.round(cluster.hexes.reduce((s, h) => s + h.q, 0) / cluster.hexes.length);
        const avgR = Math.round(cluster.hexes.reduce((s, h) => s + h.r, 0) / cluster.hexes.length);
        // Pick center hex that is NOT occupied
        const sortedHexes = cluster.hexes
          .filter(h => !occupiedHexes.has(hexKey(h.q, h.r)))
          .sort((a, b) => axialDist(a.q, a.r, avgQ, avgR) - axialDist(b.q, b.r, avgQ, avgR));
        
        if (sortedHexes.length === 0) continue; // all hexes occupied, skip
        const centerHex = sortedHexes[0];

        const seed = `${session_id}-${prov.id}-${centerHex.q}-${centerHex.r}`;
        const subtype = pickMinorSubtype(cluster.biome, seed);
        const subtypeDef = MINOR_SUBTYPES[subtype] || MINOR_SUBTYPES.village;
        const strat = rollStrategicResource(cluster.biome, seed);
        const capTags = resolveCapabilityTags(subtype, cluster.biome);

        const idx = allNewNodes.length;
        allNewNodes.push({
          session_id, province_id: prov.id,
          node_type: "resource_node",
          node_tier: "minor", node_subtype: subtype, node_class: "minor",
          name: `${subtypeDef.icon} ${cluster.name}`,
          hex_q: centerHex.q, hex_r: centerHex.r,
          controlled_by: owner,
          strategic_value: strat ? 5 : 2, economic_value: 6, defense_value: 1,
          mobility_relevance: 4, supply_relevance: 6,
          is_major: false, flow_role: "producer",
          production_role: capTags.role,
          capability_tags: capTags.tags,
          throughput_military: 1.0, toll_rate: 0,
          resource_output: { ...subtypeDef.prod },
          production_base: Object.values(subtypeDef.prod).reduce((a, b) => a + b, 0),
          strategic_resource_type: strat?.type || null,
          strategic_resource_tier: strat ? 1 : 0,
          spawned_strategic_resource: strat?.type || null,
          biome_at_build: cluster.biome,
          upgrade_level: 1,
          max_upgrade_level: 5,
          metadata: {
            cluster_size: cluster.hexes.length,
            biome: cluster.biome,
            ...(strat ? { strategic_resource: strat.type, strategic_resource_label: strat.label } : {}),
          },
        });
        occupiedHexes.add(hexKey(centerHex.q, centerHex.r));
        minorIndices.push({ idx, provId: prov.id, hex_q: centerHex.q, hex_r: centerHex.r });

        // ═══════════════════════════════════════
        // TIER 3: MICRO NODES (1-2 per minor, production units)
        // ═══════════════════════════════════════
        const microCount = cluster.hexes.length >= 5 ? 2 : 1;

        for (let mi = 0; mi < microCount; mi++) {
          const candidates = cluster.hexes.filter(h => !occupiedHexes.has(hexKey(h.q, h.r)));
          if (candidates.length === 0) break;
          const microHex = candidates.sort((a, b) =>
            axialDist(a.q, a.r, centerHex.q, centerHex.r) - axialDist(b.q, b.r, centerHex.q, centerHex.r)
          )[0];
          occupiedHexes.add(hexKey(microHex.q, microHex.r));

          const microSeed = `${seed}-micro-${mi}`;
          const microSubtype = pickMicroSubtype(microHex.biome_family || cluster.biome, microSeed);
          const microDef = MICRO_SUBTYPES[microSubtype] || MICRO_SUBTYPES.field;
          const microStrat = rollStrategicResource(microHex.biome_family || cluster.biome, microSeed);
          const microCapTags = resolveCapabilityTags(microSubtype, microHex.biome_family || cluster.biome);

          allNewNodes.push({
            session_id, province_id: prov.id,
            node_type: "resource_node",
            node_tier: "micro", node_subtype: microSubtype, node_class: "transit",
            name: `${microDef.icon} ${microDef.label}`,
            hex_q: microHex.q, hex_r: microHex.r,
            controlled_by: owner,
            strategic_value: microStrat ? 3 : 1, economic_value: 4, defense_value: 0,
            mobility_relevance: 2, supply_relevance: 4,
            is_major: false, flow_role: "producer",
            production_role: microCapTags.role,
            capability_tags: microCapTags.tags,
            throughput_military: 1.0, toll_rate: 0,
            resource_output: { ...microDef.prod },
            production_base: Object.values(microDef.prod).reduce((a, b) => a + b, 0),
            strategic_resource_type: microStrat?.type || null,
            strategic_resource_tier: microStrat ? 1 : 0,
            spawned_strategic_resource: microStrat?.type || null,
            biome_at_build: microHex.biome_family || cluster.biome,
            upgrade_level: 1,
            max_upgrade_level: 3,
            _parentMinorIdx: idx,
            metadata: {
              biome: microHex.biome_family || cluster.biome,
              parent_minor: cluster.name,
              ...(microStrat ? { strategic_resource: microStrat.type, strategic_resource_label: microStrat.label } : {}),
            },
          });
        }
      }
    }

    // ═══════════════════════════════════════
    // PARENT ASSIGNMENT: minor → nearest major (including existing majors)
    // ═══════════════════════════════════════
    // Build combined major list: new majors + existing majors
    const allMajorPoints = [
      ...majorIndices.map(m => ({ provId: m.provId, hex_q: m.hex_q, hex_r: m.hex_r, newIdx: m.idx, existingId: null as string | null })),
      ...existingMajors.map(m => {
        // Find province for existing major
        const prov = provinces.find(p => p.id === (m as any).province_id);
        return { provId: (m as any).province_id || "", hex_q: m.hex_q, hex_r: m.hex_r, newIdx: -1, existingId: m.id };
      }),
    ];

    for (const mi of minorIndices) {
      const provMajors = allMajorPoints.filter(m => m.provId === mi.provId);
      if (provMajors.length === 0) continue;
      let bestDist = Infinity, bestMajor = provMajors[0];
      for (const mj of provMajors) {
        const d = axialDist(mi.hex_q, mi.hex_r, mj.hex_q, mj.hex_r);
        if (d < bestDist) { bestDist = d; bestMajor = mj; }
      }
      if (bestMajor.newIdx >= 0) {
        allNewNodes[mi.idx]._parentMajorIdx = bestMajor.newIdx;
      } else if (bestMajor.existingId) {
        allNewNodes[mi.idx]._parentExistingId = bestMajor.existingId;
      }
    }

    // ═══════════════════════════════════════
    // BATCH INSERT
    // ═══════════════════════════════════════
    if (allNewNodes.length === 0) {
      return new Response(JSON.stringify({
        ok: true,
        nodes_created: 0,
        message: "No new nodes to add — all positions occupied",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const insertedIds: string[] = [];
    const BATCH = 50;
    for (let i = 0; i < allNewNodes.length; i += BATCH) {
      const batch = allNewNodes.slice(i, i + BATCH).map((n) => {
        const { _parentMajorIdx, _parentMinorIdx, _parentExistingId, ...rest } = n;
        return {
          ...rest,
          fortification_level: rest.fortification_level ?? 0,
          infrastructure_level: rest.infrastructure_level ?? 0,
          population: rest.population ?? 0,
          growth_rate: rest.growth_rate ?? 0,
          garrison_strength: rest.garrison_strength ?? 0,
          strategic_resource_tier: rest.strategic_resource_tier ?? 0,
          production_base: rest.production_base ?? 0,
          production_output: rest.production_output ?? 0,
          wealth_output: rest.wealth_output ?? 0,
          faith_output: rest.faith_output ?? 0,
          food_value: rest.food_value ?? 0,
          resource_output: rest.resource_output ?? {},
          upgrade_level: rest.upgrade_level ?? 1,
          max_upgrade_level: rest.max_upgrade_level ?? (rest.node_tier === "major" ? 5 : 3),
          capability_tags: rest.capability_tags ?? [],
          production_role: rest.production_role ?? "source",
        };
      });
      const { data: inserted, error: insertErr } = await sb.from("province_nodes").insert(batch).select("id");
      if (insertErr) {
        console.error("Insert error:", insertErr.message, insertErr.details, JSON.stringify(batch[0]));
        throw new Error(`Insert failed: ${insertErr.message}`);
      }
      if (inserted) for (const row of inserted) insertedIds.push(row.id);
    }

    // ═══════════════════════════════════════
    // RESOLVE PARENT LINKS (minor→major, micro→minor)
    // ═══════════════════════════════════════
    const parentUpdates: Array<{ id: string; parent_node_id: string }> = [];
    for (let i = 0; i < allNewNodes.length; i++) {
      const n = allNewNodes[i];
      if (n._parentMajorIdx !== undefined && n._parentMajorIdx >= 0 && insertedIds[i] && insertedIds[n._parentMajorIdx]) {
        parentUpdates.push({ id: insertedIds[i], parent_node_id: insertedIds[n._parentMajorIdx] });
      }
      if (n._parentExistingId && insertedIds[i]) {
        parentUpdates.push({ id: insertedIds[i], parent_node_id: n._parentExistingId });
      }
      if (n._parentMinorIdx !== undefined && insertedIds[i] && insertedIds[n._parentMinorIdx]) {
        parentUpdates.push({ id: insertedIds[i], parent_node_id: insertedIds[n._parentMinorIdx] });
      }
    }

    for (const upd of parentUpdates) {
      await sb.from("province_nodes").update({ parent_node_id: upd.parent_node_id }).eq("id", upd.id);
    }

    // Stats
    const byTier = allNewNodes.reduce((acc, n) => { acc[n.node_tier || "unknown"] = (acc[n.node_tier || "unknown"] || 0) + 1; return acc; }, {} as Record<string, number>);
    const byType = allNewNodes.reduce((acc, n) => { acc[n.node_type] = (acc[n.node_type] || 0) + 1; return acc; }, {} as Record<string, number>);
    const strategicCount = allNewNodes.filter(n => n.strategic_resource_type).length;

    // Chain: compute routes → hex flows after node generation
    let chainResults: Record<string, any> = {};
    try {
      const { data: routesRes } = await sb.functions.invoke("compute-province-routes", {
        body: { session_id },
      });
      chainResults.routes = routesRes;
      const { data: flowsRes } = await sb.functions.invoke("compute-hex-flows", {
        body: { session_id, force_all: true },
      });
      chainResults.flows = flowsRes;
    } catch (chainErr: any) {
      console.error("Chain recompute after nodes error:", chainErr);
      chainResults.error = chainErr.message;
    }

    return new Response(JSON.stringify({
      ok: true,
      nodes_created: allNewNodes.length,
      existing_nodes: existingNodes.length,
      parent_links: parentUpdates.length,
      by_tier: byTier,
      by_type: byType,
      strategic_resources_spawned: strategicCount,
      chain: chainResults,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("compute-province-nodes error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
