import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ═══════════════════════════════════════════════════════════════
// Chronicle Economic Model v2 — Directional Flow Economy
//
// PRODUCTION flows UPWARD:  micro → minor → major → capital
// WEALTH    flows DOWNWARD:  capital → major → minor
//
// Each tier consumes a % of throughput (self-sustenance).
// Capital generates wealth via market mechanism from incoming production.
// Wealth is distributed back proportionally to production contribution.
// ═══════════════════════════════════════════════════════════════

// ── TIER CONSUMPTION RATES ─────────────────────────────────────
// % of production consumed at each tier (not forwarded upward)
const TIER_CONSUMPTION: Record<string, number> = {
  micro: 0.05,   // 5% consumed locally
  minor: 0.10,   // 10% consumed locally
  major: 0.15,   // 15% consumed locally (fortress/garrison)
};

// ── BASE PRODUCTION ────────────────────────────────────────────
const MINOR_SUBTYPE_PRODUCTION: Record<string, Record<string, number>> = {
  village:          { grain: 4, wood: 2, stone: 0, iron: 0, wealth: 1, faith: 0 },
  lumber_camp:      { grain: 1, wood: 8, stone: 0, iron: 0, wealth: 1, faith: 0 },
  fishing_village:  { grain: 6, wood: 1, stone: 0, iron: 0, wealth: 2, faith: 0 },
  mining_camp:      { grain: 0, wood: 0, stone: 4, iron: 6, wealth: 1, faith: 0 },
  pastoral_camp:    { grain: 5, wood: 0, stone: 0, iron: 0, wealth: 2, faith: 0 },
  trade_post:       { grain: 1, wood: 0, stone: 0, iron: 0, wealth: 6, faith: 0 },
  shrine:           { grain: 0, wood: 0, stone: 0, iron: 0, wealth: 1, faith: 8 },
  watchtower:       { grain: 0, wood: 0, stone: 1, iron: 1, wealth: 0, faith: 0 },
};

const MICRO_SUBTYPE_PRODUCTION: Record<string, Record<string, number>> = {
  field:            { grain: 6, wood: 0, stone: 0, iron: 0, wealth: 0, faith: 0 },
  sawmill:          { grain: 0, wood: 7, stone: 0, iron: 0, wealth: 1, faith: 0 },
  mine:             { grain: 0, wood: 0, stone: 2, iron: 5, wealth: 1, faith: 0 },
  hunting_ground:   { grain: 4, wood: 1, stone: 0, iron: 0, wealth: 1, faith: 0 },
  fishery:          { grain: 5, wood: 0, stone: 0, iron: 0, wealth: 2, faith: 0 },
  quarry:           { grain: 0, wood: 0, stone: 7, iron: 0, wealth: 0, faith: 0 },
  vineyard:         { grain: 1, wood: 0, stone: 0, iron: 0, wealth: 5, faith: 0 },
  herbalist:        { grain: 0, wood: 0, stone: 0, iron: 0, wealth: 1, faith: 4 },
  smithy:           { grain: 0, wood: 0, stone: 0, iron: 3, wealth: 2, faith: 0 },
  outpost:          { grain: 0, wood: 0, stone: 0, iron: 0, wealth: 0, faith: 0 },
  resin_collector:  { grain: 2, wood: 2, stone: 0, iron: 0, wealth: 1, faith: 0 },
  salt_pan:         { grain: 0, wood: 0, stone: 0, iron: 0, wealth: 4, faith: 0 },
};

const BASE_PRODUCTION_LEGACY: Record<string, number> = {
  resource_node: 8, village_cluster: 6, primary_city: 4, secondary_city: 3,
  port: 5, fortress: 1, trade_hub: 2, pass: 0, religious_center: 2, logistic_hub: 3,
};

const SUBTYPE_UPGRADE_BONUS: Record<string, number> = {
  village: 0.2, lumber_camp: 0.25, fishing_village: 0.2, mining_camp: 0.3,
  pastoral_camp: 0.2, trade_post: 0.25, shrine: 0.2, watchtower: 0.15,
  field: 0.3, sawmill: 0.25, mine: 0.3, hunting_ground: 0.2, fishery: 0.2,
  quarry: 0.25, vineyard: 0.25, herbalist: 0.2, smithy: 0.3, outpost: 0.1,
  resin_collector: 0.2, salt_pan: 0.25,
};

const MINOR_BIOME_PREFS: Record<string, string[]> = {
  village: ["plains", "forest", "grassland", "temperate"],
  lumber_camp: ["forest", "dense_forest", "taiga"],
  fishing_village: ["coastal", "lake", "river", "marsh"],
  mining_camp: ["hills", "mountain", "mountain_pass", "highland"],
  pastoral_camp: ["steppe", "plains", "grassland", "savanna"],
  trade_post: ["plains", "grassland", "steppe", "coastal", "river"],
  shrine: ["forest", "mountain", "highland", "marsh", "sacred"],
  watchtower: ["hills", "mountain", "highland", "plains", "steppe"],
};
const MICRO_BIOME_PREFS: Record<string, string[]> = {
  field: ["plains", "grassland", "temperate", "river"],
  sawmill: ["forest", "dense_forest", "taiga"],
  mine: ["hills", "mountain", "highland"],
  hunting_ground: ["forest", "steppe", "grassland", "taiga"],
  fishery: ["coastal", "lake", "river", "marsh"],
  quarry: ["hills", "mountain", "highland"],
  vineyard: ["temperate", "plains", "grassland", "hills"],
  herbalist: ["forest", "marsh", "jungle", "temperate"],
  smithy: ["hills", "mountain", "highland"],
  outpost: ["plains", "hills", "steppe", "mountain", "highland", "forest"],
  resin_collector: ["forest", "dense_forest", "taiga"],
  salt_pan: ["coastal", "desert", "steppe"],
};

// ── MACRO REGION MODIFIERS ─────────────────────────────────────
const CLIMATE_PROD_MULT = [0.50, 0.70, 1.00, 1.10, 0.85];
const CLIMATE_WEALTH_MULT = [0.40, 0.65, 1.00, 1.15, 0.80];
const ELEVATION_FARM_MULT = [1.15, 1.00, 0.80, 0.55, 0.35];
const ELEVATION_MINE_MULT = [0.50, 1.00, 1.30, 1.50, 1.20];
const MOISTURE_PROD_MULT = [0.55, 0.75, 1.00, 1.10, 0.85];
const MOISTURE_FAITH_MULT = [0.80, 0.90, 1.00, 1.10, 1.30];

const MINING_SUBTYPES = new Set(["mining_camp", "mine", "quarry", "smithy"]);
const FARM_SUBTYPES = new Set(["village", "field", "pastoral_camp", "fishing_village", "fishery", "vineyard", "hunting_ground"]);
const FAITH_SUBTYPES = new Set(["shrine", "herbalist", "religious_center"]);

const STRATEGIC_TIER_THRESHOLDS = [0, 1, 3, 6];
function computeTier(count: number): number {
  for (let i = STRATEGIC_TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (count >= STRATEGIC_TIER_THRESHOLDS[i]) return i;
  }
  return 0;
}

interface NodeData {
  id: string;
  session_id: string;
  province_id: string;
  node_type: string;
  node_tier: string | null;
  node_subtype: string | null;
  upgrade_level: number;
  biome_at_build: string | null;
  flow_role: string;
  is_major: boolean;
  parent_node_id: string | null;
  controlled_by: string | null;
  city_id: string | null;
  population: number;
  infrastructure_level: number;
  urbanization_score: number;
  hinterland_level: number;
  cumulative_trade_flow: number;
  throughput_military: number;
  toll_rate: number;
  strategic_value: number;
  economic_value: number;
  defense_value: number;
  resource_output: Record<string, number>;
  metadata: Record<string, any> | null;
  development_level: number;
  stability_factor: number;
  faith_output: number;
  food_value: number;
  hex_q: number;
  hex_r: number;
}

interface RouteData {
  id: string;
  node_a: string;
  node_b: string;
  capacity_value: number;
  control_state: string;
  damage_level: number;
  speed_value: number;
  safety_value: number;
}

interface MacroRegionData {
  climate_band: number;
  elevation_band: number;
  moisture_band: number;
}

// ── PRODUCTION COMPUTATION ─────────────────────────────────────
function computeRawProduction(node: NodeData, routeAccess: number, regMod: number, cityData?: any): number {
  const stab = Math.max(0.1, node.stability_factor || 1.0);
  const access = Math.max(0.1, routeAccess);

  let production: number;

  if (node.node_tier === "minor" && node.node_subtype && MINOR_SUBTYPE_PRODUCTION[node.node_subtype]) {
    const baseProd = MINOR_SUBTYPE_PRODUCTION[node.node_subtype];
    const totalBase = Object.values(baseProd).reduce((a, b) => a + b, 0);
    const upgradeBonus = SUBTYPE_UPGRADE_BONUS[node.node_subtype] || 0.2;
    const upgradeMult = 1 + ((node.upgrade_level || 1) - 1) * upgradeBonus;
    const biome = (node.biome_at_build || "").toLowerCase();
    const prefs = MINOR_BIOME_PREFS[node.node_subtype] || [];
    const biomeMatch = prefs.some(pb => biome.includes(pb)) ? 1.0 : 0.6;
    production = totalBase * upgradeMult * biomeMatch * stab * access * regMod;
  } else if (node.node_tier === "micro" && node.node_subtype && MICRO_SUBTYPE_PRODUCTION[node.node_subtype]) {
    const baseProd = MICRO_SUBTYPE_PRODUCTION[node.node_subtype];
    const totalBase = Object.values(baseProd).reduce((a, b) => a + b, 0);
    const upgradeBonus = SUBTYPE_UPGRADE_BONUS[node.node_subtype] || 0.2;
    const upgradeMult = 1 + ((node.upgrade_level || 1) - 1) * upgradeBonus;
    const biome = (node.biome_at_build || "").toLowerCase();
    const prefs = MICRO_BIOME_PREFS[node.node_subtype] || [];
    const biomeMatch = prefs.some(pb => biome.includes(pb)) ? 1.0 : 0.6;
    production = totalBase * upgradeMult * biomeMatch * stab * access * regMod;
  } else if (node.is_major || node.node_tier === "major") {
    // Major nodes have minimal own production — they aggregate
    const base = BASE_PRODUCTION_LEGACY[node.node_type] ?? 2;
    production = base * Math.max(0.1, node.development_level || 1.0) * stab * access * regMod;
  } else {
    const base = BASE_PRODUCTION_LEGACY[node.node_type] ?? 2;
    production = base * Math.max(0.1, node.development_level || 1.0) * stab * access * regMod;
  }

  // Demographic bonus for city-linked nodes
  if (cityData) {
    const peasants = cityData.population_peasants || 0;
    const burghers = cityData.population_burghers || 0;
    production += (peasants * 0.008 + burghers * 0.002);
  }
  return production;
}

function computeRegionModifier(node: NodeData, region: MacroRegionData | null): { production: number; wealth: number } {
  if (!region) return { production: 1.0, wealth: 1.0 };
  const c = Math.min(4, Math.max(0, region.climate_band));
  const e = Math.min(4, Math.max(0, region.elevation_band));
  const m = Math.min(4, Math.max(0, region.moisture_band));

  const subtype = node.node_subtype || "";
  const isMining = MINING_SUBTYPES.has(subtype);
  const isFaith = FAITH_SUBTYPES.has(subtype);

  const elevMult = isMining ? ELEVATION_MINE_MULT[e] : ELEVATION_FARM_MULT[e];
  let prodMult = CLIMATE_PROD_MULT[c] * elevMult * MOISTURE_PROD_MULT[m];
  const wealthMult = CLIMATE_WEALTH_MULT[c];

  if (isFaith) {
    prodMult = CLIMATE_PROD_MULT[c] * ELEVATION_FARM_MULT[e] * MOISTURE_FAITH_MULT[m];
  }

  return {
    production: Math.round(prodMult * 100) / 100,
    wealth: Math.round(wealthMult * 100) / 100,
  };
}

// ── ROUTE ACCESS ───────────────────────────────────────────────
function computeRouteAccess(nodeId: string, routes: RouteData[]): number {
  const connected = routes.filter(
    r => (r.node_a === nodeId || r.node_b === nodeId) && r.control_state !== "blocked",
  );
  if (connected.length === 0) return 0.3;
  let totalCap = 0;
  for (const r of connected) {
    const damageMult = 1 - (r.damage_level || 0) * 0.1;
    totalCap += (r.capacity_value || 5) * Math.max(0.1, damageMult);
  }
  return Math.min(1.5, 0.3 + totalCap / 15);
}

function computeConnectivity(nodeId: string, routes: RouteData[], totalNodes: number): number {
  const degree = routes.filter(
    r => (r.node_a === nodeId || r.node_b === nodeId) && r.control_state !== "blocked",
  ).length;
  return Math.min(2.0, degree / Math.max(1, Math.sqrt(totalNodes)));
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, turn_number, save_history } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── FETCH DATA ────────────────────────────────────────────
    const [nodesRes, routesRes, supplyRes, citiesRes, hexesRes] = await Promise.all([
      sb.from("province_nodes")
        .select("id, session_id, province_id, node_type, node_tier, node_subtype, upgrade_level, biome_at_build, flow_role, is_major, parent_node_id, controlled_by, city_id, population, infrastructure_level, urbanization_score, hinterland_level, cumulative_trade_flow, throughput_military, toll_rate, strategic_value, economic_value, defense_value, resource_output, metadata, development_level, stability_factor, strategic_resource_type, strategic_resource_tier, faith_output, food_value, hex_q, hex_r")
        .eq("session_id", session_id),
      sb.from("province_routes")
        .select("id, node_a, node_b, capacity_value, control_state, damage_level, speed_value, safety_value")
        .eq("session_id", session_id),
      sb.from("supply_chain_state")
        .select("node_id, connected_to_capital, hop_distance, isolation_turns, supply_level, route_quality")
        .eq("session_id", session_id),
      sb.from("cities")
        .select("id, is_capital, population_total, population_peasants, population_burghers, population_clerics, population_warriors, market_level, temple_level")
        .eq("session_id", session_id),
      sb.from("province_hexes")
        .select("q, r, macro_region_id, macro_regions(climate_band, elevation_band, moisture_band)")
        .eq("session_id", session_id)
        .not("macro_region_id", "is", null)
        .limit(10000),
    ]);

    const nodes: NodeData[] = (nodesRes.data || []).map((n: any) => ({
      ...n,
      resource_output: n.resource_output || {},
      metadata: n.metadata || {},
      development_level: n.development_level || 1.0,
      stability_factor: n.stability_factor || 1.0,
      node_tier: n.node_tier || null,
      node_subtype: n.node_subtype || null,
      upgrade_level: n.upgrade_level || 1,
      biome_at_build: n.biome_at_build || null,
      faith_output: n.faith_output || 0,
      food_value: n.food_value || 0,
      hex_q: n.hex_q || 0,
      hex_r: n.hex_r || 0,
    }));
    const routes: RouteData[] = routesRes.data || [];

    // Supply chain state
    const supplyMap = new Map<string, any>();
    for (const s of (supplyRes.data || [])) supplyMap.set(s.node_id, s);

    // Hex → macro region
    const hexRegionMap = new Map<string, MacroRegionData>();
    for (const h of (hexesRes.data || [])) {
      const mr = (h as any).macro_regions;
      if (mr) {
        hexRegionMap.set(`${h.q},${h.r}`, {
          climate_band: mr.climate_band ?? 2,
          elevation_band: mr.elevation_band ?? 0,
          moisture_band: mr.moisture_band ?? 2,
        });
      }
    }

    // City data map + identify capitals
    const cityMap = new Map<string, any>();
    const capitalCityIds = new Set<string>();
    for (const c of (citiesRes.data || [])) {
      cityMap.set(c.id, c);
      if (c.is_capital) capitalCityIds.add(c.id);
    }

    // ── NODE INDEX ─────────────────────────────────────────────
    const nodeMap = new Map<string, NodeData>();
    for (const n of nodes) nodeMap.set(n.id, n);

    // Identify capital nodes (major nodes linked to capital cities)
    const capitalNodeIds = new Set<string>();
    for (const n of nodes) {
      if (n.city_id && capitalCityIds.has(n.city_id) && (n.is_major || n.node_tier === "major")) {
        capitalNodeIds.add(n.id);
      }
    }

    // Build children maps: parent → children
    const microsByParent = new Map<string, NodeData[]>();
    const minorsByParent = new Map<string, NodeData[]>();

    for (const n of nodes) {
      if (!n.parent_node_id) continue;
      if (n.node_tier === "micro") {
        const arr = microsByParent.get(n.parent_node_id) || [];
        arr.push(n);
        microsByParent.set(n.parent_node_id, arr);
      } else if (n.node_tier === "minor" || (!n.node_tier && !n.is_major)) {
        const arr = minorsByParent.get(n.parent_node_id) || [];
        arr.push(n);
        minorsByParent.set(n.parent_node_id, arr);
      }
    }

    // ════════════════════════════════════════════════════════════
    // PHASE 1: Raw production per node
    // ════════════════════════════════════════════════════════════
    const rawProd = new Map<string, number>();
    const regionMods = new Map<string, { production: number; wealth: number }>();

    for (const node of nodes) {
      const routeAccess = computeRouteAccess(node.id, routes);
      const region = hexRegionMap.get(`${node.hex_q},${node.hex_r}`) || null;
      const regMod = computeRegionModifier(node, region);
      regionMods.set(node.id, regMod);
      const cityData = node.city_id ? cityMap.get(node.city_id) : undefined;
      const prod = computeRawProduction(node, routeAccess, regMod.production, cityData);
      rawProd.set(node.id, prod);
    }

    // ════════════════════════════════════════════════════════════
    // PHASE 2: Upward production aggregation with tier consumption
    //   micro → minor → major → capital
    // ════════════════════════════════════════════════════════════

    // Step 2a: Micro → Minor
    // Each micro consumes 5%, forwards 95% to parent minor
    const microForwarded = new Map<string, number>(); // micro_id → amount forwarded
    const minorReceivedFromMicros = new Map<string, number>(); // minor_id → total received

    for (const node of nodes) {
      if (node.node_tier !== "micro") continue;
      const ownProd = rawProd.get(node.id) || 0;
      const consumed = ownProd * TIER_CONSUMPTION.micro;
      const forwarded = ownProd - consumed;
      microForwarded.set(node.id, forwarded);

      if (node.parent_node_id) {
        const prev = minorReceivedFromMicros.get(node.parent_node_id) || 0;
        minorReceivedFromMicros.set(node.parent_node_id, prev + forwarded);
      }
    }

    // Step 2b: Minor → Major
    // Minor's total = own production + received from micros
    // Minor consumes 10%, forwards 90% to parent major
    const minorTotalProd = new Map<string, number>(); // minor_id → total production (own + micros)
    const minorForwarded = new Map<string, number>(); // minor_id → forwarded to major
    const majorReceivedFromMinors = new Map<string, number>(); // major_id → total received

    for (const node of nodes) {
      const isMinor = node.node_tier === "minor" || (!node.node_tier && !node.is_major && node.node_tier !== "micro");
      if (!isMinor) continue;

      const ownProd = rawProd.get(node.id) || 0;
      const fromMicros = minorReceivedFromMicros.get(node.id) || 0;
      const total = ownProd + fromMicros;
      minorTotalProd.set(node.id, total);

      const consumed = total * TIER_CONSUMPTION.minor;
      const forwarded = total - consumed;
      minorForwarded.set(node.id, forwarded);

      if (node.parent_node_id) {
        const prev = majorReceivedFromMinors.get(node.parent_node_id) || 0;
        majorReceivedFromMinors.set(node.parent_node_id, prev + forwarded);
      }
    }

    // Step 2c: Major → Capital
    // Major's total incoming = own production + received from minors
    // Major consumes 15%, forwards 85%
    const majorTotalIncoming = new Map<string, number>();
    const majorForwarded = new Map<string, number>();

    // Group majors by player to find their capital
    const playerCapitalNode = new Map<string, string>(); // player → capital_node_id
    for (const n of nodes) {
      if (capitalNodeIds.has(n.id) && n.controlled_by) {
        playerCapitalNode.set(n.controlled_by, n.id);
      }
    }

    // For each player's capital, accumulate forwarded from all their majors
    const capitalIncomingProd = new Map<string, number>(); // capital_node_id → total incoming
    const majorContribToCapital = new Map<string, number>(); // major_id → what it sent to capital

    for (const node of nodes) {
      if (!(node.is_major || node.node_tier === "major")) continue;
      if (capitalNodeIds.has(node.id)) continue; // Capital handled separately

      const ownProd = rawProd.get(node.id) || 0;
      const fromMinors = majorReceivedFromMinors.get(node.id) || 0;
      const totalIncoming = ownProd + fromMinors;
      majorTotalIncoming.set(node.id, totalIncoming);

      const consumed = totalIncoming * TIER_CONSUMPTION.major;
      const forwarded = totalIncoming - consumed;
      majorForwarded.set(node.id, forwarded);

      // Find this player's capital
      const player = node.controlled_by;
      if (player) {
        const capId = playerCapitalNode.get(player);
        if (capId) {
          const prev = capitalIncomingProd.get(capId) || 0;
          capitalIncomingProd.set(capId, prev + forwarded);
          majorContribToCapital.set(node.id, forwarded);
        }
      }
    }

    // Capital itself also has own production + minors feeding it
    for (const capId of capitalNodeIds) {
      const capNode = nodeMap.get(capId);
      if (!capNode) continue;
      const ownProd = rawProd.get(capId) || 0;
      const fromMinors = majorReceivedFromMinors.get(capId) || 0;
      const totalOwn = ownProd + fromMinors;
      majorTotalIncoming.set(capId, totalOwn);

      const prev = capitalIncomingProd.get(capId) || 0;
      capitalIncomingProd.set(capId, prev + totalOwn);
    }

    // ════════════════════════════════════════════════════════════
    // PHASE 3: Wealth generation at Capital (Market Mechanism)
    //
    // wealth = incoming_prod × market_efficiency × demand_factor
    //
    // market_efficiency: how well capital converts production to wealth
    //   = base (0.25) + burgher_ratio (up to 0.35) + market_level (up to 0.30)
    //
    // demand_factor: supply/demand balance
    //   = sigmoid based on consumer/producer ratio
    //   balanced economy → 1.0, oversupply → lower, undersupply → higher
    // ════════════════════════════════════════════════════════════

    const capitalWealthGenerated = new Map<string, number>(); // capital_id → total wealth generated

    for (const capId of capitalNodeIds) {
      const capNode = nodeMap.get(capId);
      if (!capNode) continue;

      const totalIncoming = capitalIncomingProd.get(capId) || 0;
      const cityData = capNode.city_id ? cityMap.get(capNode.city_id) : undefined;

      // Market efficiency
      const burghers = cityData?.population_burghers || 0;
      const totalPop = cityData?.population_total || 1;
      const burgherRatio = Math.min(0.35, (burghers / Math.max(1, totalPop)) * 0.7);
      const marketLevel = cityData?.market_level || 0;
      const marketBonus = Math.min(0.30, marketLevel * 0.06);
      const marketEfficiency = 0.25 + burgherRatio + marketBonus;

      // Demand factor: based on ratio of consumers (population) to producers (incoming prod)
      // More consumers per production unit → higher demand → higher prices → more wealth
      const consumerRatio = totalPop / Math.max(1, totalIncoming * 10);
      // Sigmoid-like: tanh capped between 0.5 and 1.5
      const demandFactor = 0.5 + 1.0 / (1 + Math.exp(-2 * (consumerRatio - 1)));

      const regionMod = regionMods.get(capId) || { production: 1.0, wealth: 1.0 };
      const wealthGenerated = totalIncoming * marketEfficiency * demandFactor * regionMod.wealth;

      capitalWealthGenerated.set(capId, wealthGenerated);
    }

    // ════════════════════════════════════════════════════════════
    // PHASE 4: Wealth distribution downward
    //   Capital keeps 30% → distributes 70% to majors proportionally
    //   Major keeps 20% → distributes 80% to minors proportionally
    //   Minor keeps all received wealth
    // ════════════════════════════════════════════════════════════

    const CAPITAL_WEALTH_RETENTION = 0.30;
    const MAJOR_WEALTH_RETENTION = 0.20;

    const nodeWealth = new Map<string, number>(); // node_id → final wealth

    for (const capId of capitalNodeIds) {
      const capNode = nodeMap.get(capId);
      if (!capNode) continue;
      const player = capNode.controlled_by;
      if (!player) continue;

      const totalWealth = capitalWealthGenerated.get(capId) || 0;
      const capitalKeeps = totalWealth * CAPITAL_WEALTH_RETENTION;
      const toDistribute = totalWealth - capitalKeeps;

      // Capital's own wealth
      nodeWealth.set(capId, (nodeWealth.get(capId) || 0) + capitalKeeps);

      // Find all majors belonging to this player (excluding capital)
      const playerMajors = nodes.filter(n =>
        (n.is_major || n.node_tier === "major") &&
        !capitalNodeIds.has(n.id) &&
        n.controlled_by === player
      );

      // Total contribution from all majors
      const totalMajorContrib = playerMajors.reduce((sum, m) => sum + (majorContribToCapital.get(m.id) || 0), 0);

      for (const major of playerMajors) {
        const majorContrib = majorContribToCapital.get(major.id) || 0;
        const proportionalShare = totalMajorContrib > 0 ? (majorContrib / totalMajorContrib) : (1 / Math.max(1, playerMajors.length));
        const majorWealthShare = toDistribute * proportionalShare;

        const majorKeeps = majorWealthShare * MAJOR_WEALTH_RETENTION;
        const toMinors = majorWealthShare - majorKeeps;

        nodeWealth.set(major.id, (nodeWealth.get(major.id) || 0) + majorKeeps);

        // Distribute to this major's minors proportionally to their production
        const myMinors = minorsByParent.get(major.id) || [];
        const totalMinorProd = myMinors.reduce((sum, m) => sum + (minorForwarded.get(m.id) || 0), 0);

        for (const minor of myMinors) {
          const minorContrib = minorForwarded.get(minor.id) || 0;
          const minorShare = totalMinorProd > 0 ? (minorContrib / totalMinorProd) : (1 / Math.max(1, myMinors.length));
          const minorWealth = toMinors * minorShare;
          nodeWealth.set(minor.id, (nodeWealth.get(minor.id) || 0) + minorWealth);
        }
      }
    }

    // ════════════════════════════════════════════════════════════
    // PHASE 5: Compute final metrics + isolation penalties
    // ════════════════════════════════════════════════════════════

    const nodeResults: Array<{
      id: string;
      production_output: number;
      wealth_output: number;
      capacity_score: number;
      importance_score: number;
      incoming_production: number;
      connectivity_score: number;
      route_access_factor: number;
      trade_efficiency: number;
      isolation_penalty: number;
    }> = [];

    for (const node of nodes) {
      const routeAccess = computeRouteAccess(node.id, routes);
      const connectivity = computeConnectivity(node.id, routes, nodes.length);
      const cityData = node.city_id ? cityMap.get(node.city_id) : undefined;

      // Production output = node's own raw production
      let production = rawProd.get(node.id) || 0;

      // Incoming production (for display): what flowed through this node
      let incoming: number;
      if (capitalNodeIds.has(node.id)) {
        incoming = capitalIncomingProd.get(node.id) || 0;
      } else if (node.is_major || node.node_tier === "major") {
        incoming = majorTotalIncoming.get(node.id) || 0;
      } else if (node.node_tier === "minor" || (!node.node_tier && !node.is_major && node.node_tier !== "micro")) {
        incoming = minorTotalProd.get(node.id) || 0;
      } else {
        incoming = production;
      }

      // Wealth
      let wealth = nodeWealth.get(node.id) || 0;
      // Micro nodes get a tiny trickle of wealth
      if (node.node_tier === "micro" && wealth === 0) {
        wealth = production * 0.02;
      }

      // Capacity
      const pop = Math.max(1, node.population);
      const infra = Math.max(0.1, node.infrastructure_level);
      let capacity = (pop / 1000) * infra * Math.max(0.1, connectivity);
      if (cityData) {
        const clerics = cityData.population_clerics || 0;
        const burghers = cityData.population_burghers || 0;
        capacity += (clerics * 0.006 + burghers * 0.002);
      }

      // Apply isolation penalty
      const supply = supplyMap.get(node.id);
      if (supply && !supply.connected_to_capital) {
        const isolFactor = Math.min(supply.isolation_turns, 5);
        const pMult = Math.max(0.2, 1 - isolFactor * 0.08);
        const wMult = Math.max(0.3, 1 - isolFactor * 0.06);
        const cMult = Math.max(0.1, 1 - isolFactor * 0.10);
        production *= pMult;
        wealth *= wMult;
        capacity *= cMult;
      }
      const isolationPenalty = (supply && !supply.connected_to_capital)
        ? Math.min(1, Math.min(supply.isolation_turns, 5) * 0.08)
        : 0;

      // Trade efficiency based on flow role
      const ROLE_EFF: Record<string, number> = { hub: 1.0, gateway: 0.8, regulator: 0.6, producer: 0.3, neutral: 0.2 };
      const tradeEff = ROLE_EFF[node.flow_role] || 0.2;

      // Importance
      const importance = production * 0.3 + wealth * 0.3 + connectivity * 0.2 + node.strategic_value * 0.2;

      nodeResults.push({
        id: node.id,
        production_output: Math.round(production * 100) / 100,
        wealth_output: Math.round(wealth * 100) / 100,
        capacity_score: Math.round(capacity * 100) / 100,
        importance_score: Math.round(importance * 100) / 100,
        incoming_production: Math.round(incoming * 100) / 100,
        connectivity_score: Math.round(connectivity * 100) / 100,
        route_access_factor: Math.round(routeAccess * 100) / 100,
        trade_efficiency: Math.round(tradeEff * 100) / 100,
        isolation_penalty: Math.round(isolationPenalty * 100) / 100,
      });
    }

    // ── PERSIST NODE RESULTS ──────────────────────────────────
    const BATCH = 50;
    for (let i = 0; i < nodeResults.length; i += BATCH) {
      const batch = nodeResults.slice(i, i + BATCH);
      for (const nr of batch) {
        await sb.from("province_nodes").update({
          production_output: nr.production_output,
          wealth_output: nr.wealth_output,
          capacity_score: nr.capacity_score,
          importance_score: nr.importance_score,
          incoming_production: nr.incoming_production,
          connectivity_score: nr.connectivity_score,
          route_access_factor: nr.route_access_factor,
          trade_efficiency: nr.trade_efficiency,
          isolation_penalty: nr.isolation_penalty,
        }).eq("id", nr.id);
      }
    }

    // ── SAVE HISTORY ──────────────────────────────────────────
    if (save_history && turn_number) {
      const histRows = nodeResults.map(nr => ({
        session_id,
        node_id: nr.id,
        turn_number,
        production_output: nr.production_output,
        wealth_output: nr.wealth_output,
        capacity_score: nr.capacity_score,
        importance_score: nr.importance_score,
        incoming_production: nr.incoming_production,
        connectivity_score: nr.connectivity_score,
        isolation_penalty: nr.isolation_penalty,
      }));
      for (let i = 0; i < histRows.length; i += BATCH) {
        await sb.from("node_economy_history").insert(histRows.slice(i, i + BATCH));
      }
    }

    // ── AGGREGATE PER PLAYER → realm_resources ────────────────
    const playerTotals = new Map<string, {
      production: number; wealth: number; capacity: number; importance: number;
      iron: number; horses: number; salt: number; copper: number; gold_res: number;
      marble: number; gems: number; timber: number; obsidian: number; silk: number; incense: number;
    }>();

    for (const node of nodes) {
      const player = node.controlled_by;
      if (!player) continue;
      const nr = nodeResults.find(r => r.id === node.id);
      if (!nr) continue;

      if (!playerTotals.has(player)) {
        playerTotals.set(player, {
          production: 0, wealth: 0, capacity: 0, importance: 0,
          iron: 0, horses: 0, salt: 0, copper: 0, gold_res: 0,
          marble: 0, gems: 0, timber: 0, obsidian: 0, silk: 0, incense: 0,
        });
      }
      const pt = playerTotals.get(player)!;
      pt.production += nr.production_output;
      pt.wealth += nr.wealth_output;
      pt.capacity += nr.capacity_score;
      pt.importance += nr.importance_score;

      const stratRes = (node as any).strategic_resource_type || node.metadata?.strategic_resource;
      if (stratRes === "iron" || stratRes === "mineral") pt.iron++;
      if (stratRes === "horses") pt.horses++;
      if (stratRes === "salt") pt.salt++;
      if (stratRes === "copper") pt.copper++;
      if (stratRes === "gold_deposit") pt.gold_res++;
      if (stratRes === "marble") pt.marble++;
      if (stratRes === "gems") pt.gems++;
      if (stratRes === "timber") pt.timber++;
      if (stratRes === "obsidian") pt.obsidian++;
      if (stratRes === "silk") pt.silk++;
      if (stratRes === "incense") pt.incense++;
    }

    for (const [player, totals] of playerTotals) {
      const update = {
        total_production: Math.round(totals.production * 100) / 100,
        total_wealth: Math.round(totals.wealth * 100) / 100,
        total_capacity: Math.round(totals.capacity * 100) / 100,
        total_importance: Math.round(totals.importance * 100) / 100,
        strategic_iron_tier: computeTier(totals.iron),
        strategic_horses_tier: computeTier(totals.horses),
        strategic_salt_tier: computeTier(totals.salt),
        strategic_copper_tier: computeTier(totals.copper),
        strategic_gold_tier: computeTier(totals.gold_res),
        strategic_marble_tier: computeTier(totals.marble),
        strategic_gems_tier: computeTier(totals.gems),
        strategic_timber_tier: computeTier(totals.timber),
        strategic_obsidian_tier: computeTier(totals.obsidian),
        strategic_silk_tier: computeTier(totals.silk),
        strategic_incense_tier: computeTier(totals.incense),
      };
      await sb.from("realm_resources").update(update)
        .eq("session_id", session_id).eq("player_name", player);
    }

    // ── RESPONSE ──────────────────────────────────────────────
    const capitalSummaries = Array.from(capitalNodeIds).map(capId => {
      const capNode = nodeMap.get(capId);
      return {
        capital_node: capNode?.city_id,
        player: capNode?.controlled_by,
        incoming_production: Math.round((capitalIncomingProd.get(capId) || 0) * 10) / 10,
        wealth_generated: Math.round((capitalWealthGenerated.get(capId) || 0) * 10) / 10,
      };
    });

    const summary = {
      ok: true,
      model: "v2_directional_flow",
      nodes_computed: nodeResults.length,
      capital_economies: capitalSummaries,
      totals_by_player: Object.fromEntries(
        Array.from(playerTotals.entries()).map(([p, t]) => [p, {
          production: Math.round(t.production),
          wealth: Math.round(t.wealth),
          capacity: Math.round(t.capacity),
        }]),
      ),
      top_nodes: nodeResults
        .sort((a, b) => b.importance_score - a.importance_score)
        .slice(0, 5)
        .map(n => ({ id: n.id, importance: n.importance_score, prod: n.production_output, wealth: n.wealth_output })),
    };

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("compute-economy-flow error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
