import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ═══════════════════════════════════════════════════════════════
// Chronicle Economic Model v3 — Directional Flow Economy
//
// Four resources: Production (⚒️), Supplies (🌾), Wealth (💰), Faith (⛪)
//
// UPWARD:   Production + Supplies flow micro → minor → major → capital
// DOWNWARD: Wealth + Supplies flow capital → major → minor
//
// Each tier consumes a % of throughput (self-sustenance).
// Capital generates wealth via market mechanism from incoming production.
// Wealth + Supplies are distributed back proportionally to contribution.
// ═══════════════════════════════════════════════════════════════

// ── TIER CONSUMPTION RATES ─────────────────────────────────────
const TIER_CONSUMPTION: Record<string, number> = {
  micro: 0.05,
  minor: 0.10,
  major: 0.15,
};

// ── BASE PRODUCTION (unified: production, supplies, wealth, faith) ──
const MINOR_SUBTYPE_PRODUCTION: Record<string, Record<string, number>> = {
  village:          { production: 2, supplies: 4, wealth: 1, faith: 0 },
  lumber_camp:      { production: 8, supplies: 1, wealth: 1, faith: 0 },
  fishing_village:  { production: 1, supplies: 6, wealth: 2, faith: 0 },
  mining_camp:      { production: 10, supplies: 0, wealth: 1, faith: 0 },
  pastoral_camp:    { production: 0, supplies: 5, wealth: 2, faith: 0 },
  trade_post:       { production: 0, supplies: 1, wealth: 6, faith: 0 },
  shrine:           { production: 0, supplies: 0, wealth: 1, faith: 8 },
  watchtower:       { production: 2, supplies: 0, wealth: 0, faith: 0 },
};

const MICRO_SUBTYPE_PRODUCTION: Record<string, Record<string, number>> = {
  field:            { production: 0, supplies: 6, wealth: 0, faith: 0 },
  sawmill:          { production: 7, supplies: 0, wealth: 1, faith: 0 },
  mine:             { production: 7, supplies: 0, wealth: 1, faith: 0 },
  hunting_ground:   { production: 1, supplies: 4, wealth: 1, faith: 0 },
  fishery:          { production: 0, supplies: 5, wealth: 2, faith: 0 },
  quarry:           { production: 7, supplies: 0, wealth: 0, faith: 0 },
  vineyard:         { production: 0, supplies: 1, wealth: 5, faith: 0 },
  herbalist:        { production: 0, supplies: 0, wealth: 1, faith: 4 },
  smithy:           { production: 5, supplies: 0, wealth: 2, faith: 0 },
  outpost:          { production: 0, supplies: 0, wealth: 0, faith: 0 },
  resin_collector:  { production: 2, supplies: 2, wealth: 1, faith: 0 },
  salt_pan:         { production: 0, supplies: 0, wealth: 4, faith: 0 },
};

const BASE_PRODUCTION_LEGACY: Record<string, number> = {
  resource_node: 8, village_cluster: 6, primary_city: 4, secondary_city: 3,
  port: 5, fortress: 1, trade_hub: 2, pass: 0, religious_center: 2, logistic_hub: 3,
};

// ── UPKEEP COSTS (supplies, wealth) ─────────────────────────────
const MINOR_SUBTYPE_UPKEEP: Record<string, { supplies: number; wealth: number }> = {
  village:          { supplies: 3, wealth: 2 },
  lumber_camp:      { supplies: 3, wealth: 2 },
  fishing_village:  { supplies: 3, wealth: 2 },
  mining_camp:      { supplies: 4, wealth: 2 },
  pastoral_camp:    { supplies: 2, wealth: 2 },
  trade_post:       { supplies: 2, wealth: 3 },
  shrine:           { supplies: 2, wealth: 1 },
  watchtower:       { supplies: 2, wealth: 1 },
};

const MICRO_SUBTYPE_UPKEEP: Record<string, { supplies: number; wealth: number }> = {
  field:            { supplies: 1, wealth: 0.5 },
  sawmill:          { supplies: 1.5, wealth: 1 },
  mine:             { supplies: 2, wealth: 1 },
  hunting_ground:   { supplies: 1, wealth: 0.5 },
  fishery:          { supplies: 1, wealth: 0.5 },
  quarry:           { supplies: 1.5, wealth: 0.5 },
  vineyard:         { supplies: 1.5, wealth: 1 },
  herbalist:        { supplies: 1, wealth: 0.5 },
  smithy:           { supplies: 2, wealth: 1 },
  outpost:          { supplies: 0.5, wealth: 0.5 },
  resin_collector:  { supplies: 1, wealth: 0.5 },
  salt_pan:         { supplies: 1, wealth: 1 },
};

const MAJOR_SUBTYPE_UPKEEP: Record<string, { supplies: number; wealth: number }> = {
  city:             { supplies: 10, wealth: 6 },
  fortress:         { supplies: 8, wealth: 4 },
  trade_hub:        { supplies: 6, wealth: 8 },
  guard_station:    { supplies: 6, wealth: 3 },
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
const CLIMATE_SUPPLY_MULT = [0.40, 0.70, 1.00, 1.15, 0.75];
const ELEVATION_FARM_MULT = [1.15, 1.00, 0.80, 0.55, 0.35];
const ELEVATION_MINE_MULT = [0.50, 1.00, 1.30, 1.50, 1.20];
const MOISTURE_PROD_MULT = [0.55, 0.75, 1.00, 1.10, 0.85];
const MOISTURE_SUPPLY_MULT = [0.45, 0.70, 1.00, 1.20, 0.90];
const MOISTURE_FAITH_MULT = [0.80, 0.90, 1.00, 1.10, 1.30];

const MINING_SUBTYPES = new Set(["mining_camp", "mine", "quarry", "smithy"]);
const SUPPLY_SUBTYPES = new Set(["village", "field", "pastoral_camp", "fishing_village", "fishery", "vineyard", "hunting_ground"]);
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

/** Two-channel output: production + supplies */
interface DualOutput {
  production: number;
  supplies: number;
}

// ── PRODUCTION COMPUTATION ─────────────────────────────────────
function computeRawDualOutput(node: NodeData, routeAccess: number, regMod: { production: number; supplies: number }, cityData?: any): DualOutput {
  const stab = Math.max(0.1, node.stability_factor || 1.0);
  const access = Math.max(0.1, routeAccess);

  const subtype = node.node_subtype || "";
  const tier = node.node_tier;

  // Subtype-based production
  const subtypeTable = tier === "minor" ? MINOR_SUBTYPE_PRODUCTION : tier === "micro" ? MICRO_SUBTYPE_PRODUCTION : null;
  const baseProd = subtypeTable ? subtypeTable[subtype] : null;

  if (baseProd) {
    const upgradeBonus = SUBTYPE_UPGRADE_BONUS[subtype] || 0.2;
    const upgradeMult = 1 + ((node.upgrade_level || 1) - 1) * upgradeBonus;
    const biome = (node.biome_at_build || "").toLowerCase();
    const prefs = (tier === "minor" ? MINOR_BIOME_PREFS : MICRO_BIOME_PREFS)[subtype] || [];
    const biomeMatch = prefs.some(pb => biome.includes(pb)) ? 1.0 : 0.6;

    let prod = (baseProd.production || 0) * upgradeMult * biomeMatch * stab * access * regMod.production;
    let supp = (baseProd.supplies || 0) * upgradeMult * biomeMatch * stab * access * regMod.supplies;

    if (cityData) {
      const peasants = cityData.population_peasants || 0;
      const burghers = cityData.population_burghers || 0;
      prod += burghers * 0.002;
      supp += peasants * 0.008;
    }
    return { production: prod, supplies: supp };
  }

  // Legacy/major nodes
  if (node.is_major || tier === "major") {
    const base = BASE_PRODUCTION_LEGACY[node.node_type] ?? 2;
    const val = base * Math.max(0.1, node.development_level || 1.0) * stab * access * regMod.production;
    return { production: val * 0.6, supplies: val * 0.4 };
  }

  const base = BASE_PRODUCTION_LEGACY[node.node_type] ?? 2;
  const val = base * Math.max(0.1, node.development_level || 1.0) * stab * access * regMod.production;
  return { production: val * 0.5, supplies: val * 0.5 };
}

function computeRegionModifier(node: NodeData, region: MacroRegionData | null): { production: number; supplies: number; wealth: number } {
  if (!region) return { production: 1.0, supplies: 1.0, wealth: 1.0 };
  const c = Math.min(4, Math.max(0, region.climate_band));
  const e = Math.min(4, Math.max(0, region.elevation_band));
  const m = Math.min(4, Math.max(0, region.moisture_band));

  const subtype = node.node_subtype || "";
  const isMining = MINING_SUBTYPES.has(subtype);
  const isSupply = SUPPLY_SUBTYPES.has(subtype);
  const isFaith = FAITH_SUBTYPES.has(subtype);

  const elevMult = isMining ? ELEVATION_MINE_MULT[e] : ELEVATION_FARM_MULT[e];
  let prodMult = CLIMATE_PROD_MULT[c] * elevMult * MOISTURE_PROD_MULT[m];
  const supplyMult = CLIMATE_SUPPLY_MULT[c] * ELEVATION_FARM_MULT[e] * MOISTURE_SUPPLY_MULT[m];
  const wealthMult = CLIMATE_WEALTH_MULT[c];

  if (isFaith) {
    prodMult = CLIMATE_PROD_MULT[c] * ELEVATION_FARM_MULT[e] * MOISTURE_FAITH_MULT[m];
  }

  return {
    production: Math.round(prodMult * 100) / 100,
    supplies: Math.round(supplyMult * 100) / 100,
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

    const supplyMap = new Map<string, any>();
    for (const s of (supplyRes.data || [])) supplyMap.set(s.node_id, s);

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

    const cityMap = new Map<string, any>();
    const capitalCityIds = new Set<string>();
    for (const c of (citiesRes.data || [])) {
      cityMap.set(c.id, c);
      if (c.is_capital) capitalCityIds.add(c.id);
    }

    // ── NODE INDEX ─────────────────────────────────────────────
    const nodeMap = new Map<string, NodeData>();
    for (const n of nodes) nodeMap.set(n.id, n);

    const capitalNodeIds = new Set<string>();
    for (const n of nodes) {
      if (n.city_id && capitalCityIds.has(n.city_id) && (n.is_major || n.node_tier === "major")) {
        capitalNodeIds.add(n.id);
      }
    }

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
    // PHASE 1: Raw dual output per node (production + supplies)
    // ════════════════════════════════════════════════════════════
    const rawDual = new Map<string, DualOutput>();
    const regionMods = new Map<string, { production: number; supplies: number; wealth: number }>();

    for (const node of nodes) {
      const routeAccess = computeRouteAccess(node.id, routes);
      const region = hexRegionMap.get(`${node.hex_q},${node.hex_r}`) || null;
      const regMod = computeRegionModifier(node, region);
      regionMods.set(node.id, regMod);
      const cityData = node.city_id ? cityMap.get(node.city_id) : undefined;
      const dual = computeRawDualOutput(node, routeAccess, regMod, cityData);
      rawDual.set(node.id, dual);
    }

    // ════════════════════════════════════════════════════════════
    // PHASE 2: Upward aggregation with tier consumption + upkeep
    //   micro → minor → major → capital (both production AND supplies)
    //   Net = gross - upkeep. Only surplus (net > 0) flows upward.
    //   Deficit nodes are tracked for UI visualization.
    // ════════════════════════════════════════════════════════════

    const nodeUpkeepData = new Map<string, { upkeep_supplies: number; upkeep_wealth: number; net_balance: number }>();

    // Step 2a: Micro → Minor
    const microForwarded = new Map<string, DualOutput>();
    const minorReceivedFromMicros = new Map<string, DualOutput>();

    for (const node of nodes) {
      if (node.node_tier !== "micro") continue;
      const own = rawDual.get(node.id) || { production: 0, supplies: 0 };
      const subtype = node.node_subtype || "";
      const upkeep = MICRO_SUBTYPE_UPKEEP[subtype] || { supplies: 1, wealth: 0.5 };
      const consumed = TIER_CONSUMPTION.micro;

      // Net after upkeep
      const netSupplies = own.supplies - upkeep.supplies;
      const netWealth = -upkeep.wealth; // wealth upkeep tracked separately
      const netBalance = own.production + netSupplies + netWealth;
      nodeUpkeepData.set(node.id, { upkeep_supplies: upkeep.supplies, upkeep_wealth: upkeep.wealth, net_balance: Math.round(netBalance * 100) / 100 });

      // Only forward surplus (positive values) after tier consumption
      const fwd: DualOutput = {
        production: Math.max(0, own.production) * (1 - consumed),
        supplies: Math.max(0, netSupplies) * (1 - consumed),
      };
      microForwarded.set(node.id, fwd);

      if (node.parent_node_id) {
        const prev = minorReceivedFromMicros.get(node.parent_node_id) || { production: 0, supplies: 0 };
        minorReceivedFromMicros.set(node.parent_node_id, {
          production: prev.production + fwd.production,
          supplies: prev.supplies + fwd.supplies,
        });
      }
    }

    // Step 2b: Minor → Major
    const minorTotalDual = new Map<string, DualOutput>();
    const minorForwarded = new Map<string, DualOutput>();
    const majorReceivedFromMinors = new Map<string, DualOutput>();

    for (const node of nodes) {
      const isMinor = node.node_tier === "minor" || (!node.node_tier && !node.is_major && node.node_tier !== "micro");
      if (!isMinor) continue;

      const own = rawDual.get(node.id) || { production: 0, supplies: 0 };
      const fromMicros = minorReceivedFromMicros.get(node.id) || { production: 0, supplies: 0 };
      const total: DualOutput = {
        production: own.production + fromMicros.production,
        supplies: own.supplies + fromMicros.supplies,
      };
      minorTotalDual.set(node.id, total);

      const subtype = node.node_subtype || "";
      const upkeep = MINOR_SUBTYPE_UPKEEP[subtype] || { supplies: 3, wealth: 2 };
      const netSupplies = total.supplies - upkeep.supplies;
      const netWealth = -upkeep.wealth;
      const netBalance = total.production + netSupplies + netWealth;
      nodeUpkeepData.set(node.id, { upkeep_supplies: upkeep.supplies, upkeep_wealth: upkeep.wealth, net_balance: Math.round(netBalance * 100) / 100 });

      const consumed = TIER_CONSUMPTION.minor;
      const fwd: DualOutput = {
        production: Math.max(0, total.production) * (1 - consumed),
        supplies: Math.max(0, netSupplies) * (1 - consumed),
      };
      minorForwarded.set(node.id, fwd);

      if (node.parent_node_id) {
        const prev = majorReceivedFromMinors.get(node.parent_node_id) || { production: 0, supplies: 0 };
        majorReceivedFromMinors.set(node.parent_node_id, {
          production: prev.production + fwd.production,
          supplies: prev.supplies + fwd.supplies,
        });
      }
    }

    // Step 2c: Major → Capital
    const majorTotalDual = new Map<string, DualOutput>();
    const majorForwarded = new Map<string, DualOutput>();

    const playerCapitalNode = new Map<string, string>();
    for (const n of nodes) {
      if (capitalNodeIds.has(n.id) && n.controlled_by) {
        playerCapitalNode.set(n.controlled_by, n.id);
      }
    }

    const capitalIncomingDual = new Map<string, DualOutput>();
    const majorContribToCapital = new Map<string, DualOutput>();

    for (const node of nodes) {
      if (!(node.is_major || node.node_tier === "major")) continue;
      if (capitalNodeIds.has(node.id)) continue;

      const own = rawDual.get(node.id) || { production: 0, supplies: 0 };
      const fromMinors = majorReceivedFromMinors.get(node.id) || { production: 0, supplies: 0 };
      const total: DualOutput = {
        production: own.production + fromMinors.production,
        supplies: own.supplies + fromMinors.supplies,
      };
      majorTotalDual.set(node.id, total);

      // Upkeep for major nodes
      const subtype = node.node_subtype || "";
      const upkeep = MAJOR_SUBTYPE_UPKEEP[subtype] || { supplies: 10, wealth: 6 };
      const netSupplies = total.supplies - upkeep.supplies;
      const netWealth = -upkeep.wealth;
      const netBalance = total.production + netSupplies + netWealth;
      nodeUpkeepData.set(node.id, { upkeep_supplies: upkeep.supplies, upkeep_wealth: upkeep.wealth, net_balance: Math.round(netBalance * 100) / 100 });

      const consumed = TIER_CONSUMPTION.major;
      const fwd: DualOutput = {
        production: Math.max(0, total.production) * (1 - consumed),
        supplies: Math.max(0, netSupplies) * (1 - consumed),
      };
      majorForwarded.set(node.id, fwd);

      const player = node.controlled_by;
      if (player) {
        const capId = playerCapitalNode.get(player);
        if (capId) {
          const prev = capitalIncomingDual.get(capId) || { production: 0, supplies: 0 };
          capitalIncomingDual.set(capId, {
            production: prev.production + fwd.production,
            supplies: prev.supplies + fwd.supplies,
          });
          majorContribToCapital.set(node.id, fwd);
        }
      }
    }

    // Capital's own production
    for (const capId of capitalNodeIds) {
      const capNode = nodeMap.get(capId);
      if (!capNode) continue;
      const own = rawDual.get(capId) || { production: 0, supplies: 0 };
      const fromMinors = majorReceivedFromMinors.get(capId) || { production: 0, supplies: 0 };
      const totalOwn: DualOutput = {
        production: own.production + fromMinors.production,
        supplies: own.supplies + fromMinors.supplies,
      };
      majorTotalDual.set(capId, totalOwn);

      const prev = capitalIncomingDual.get(capId) || { production: 0, supplies: 0 };
      capitalIncomingDual.set(capId, {
        production: prev.production + totalOwn.production,
        supplies: prev.supplies + totalOwn.supplies,
      });
    }

    // ════════════════════════════════════════════════════════════
    // PHASE 3: Wealth generation at Capital (Market Mechanism)
    //   + Supplies pool for redistribution
    // ════════════════════════════════════════════════════════════

    const capitalWealthGenerated = new Map<string, number>();
    const capitalSuppliesPool = new Map<string, number>();

    for (const capId of capitalNodeIds) {
      const capNode = nodeMap.get(capId);
      if (!capNode) continue;

      const incoming = capitalIncomingDual.get(capId) || { production: 0, supplies: 0 };
      const cityData = capNode.city_id ? cityMap.get(capNode.city_id) : undefined;

      // Market efficiency
      const burghers = cityData?.population_burghers || 0;
      const totalPop = cityData?.population_total || 1;
      const burgherRatio = Math.min(0.35, (burghers / Math.max(1, totalPop)) * 0.7);
      const marketLevel = cityData?.market_level || 0;
      const marketBonus = Math.min(0.30, marketLevel * 0.06);
      const marketEfficiency = 0.25 + burgherRatio + marketBonus;

      // Demand factor
      const consumerRatio = totalPop / Math.max(1, incoming.production * 10);
      const demandFactor = 0.5 + 1.0 / (1 + Math.exp(-2 * (consumerRatio - 1)));

      const regionMod = regionMods.get(capId) || { production: 1.0, supplies: 1.0, wealth: 1.0 };
      const wealthGenerated = incoming.production * marketEfficiency * demandFactor * regionMod.wealth;
      capitalWealthGenerated.set(capId, wealthGenerated);

      // Supplies pool: capital consumes 30%, redistributes 70%
      capitalSuppliesPool.set(capId, incoming.supplies);
    }

    // ════════════════════════════════════════════════════════════
    // PHASE 4: Wealth + Supplies distribution downward
    //   Capital keeps 30% wealth + 30% supplies → distributes rest
    //   Major keeps 20% → distributes 80% to minors
    // ════════════════════════════════════════════════════════════

    const CAPITAL_RETENTION = 0.30;
    const MAJOR_RETENTION = 0.20;

    const nodeWealth = new Map<string, number>();
    const nodeSuppliesReturn = new Map<string, number>(); // supplies flowing back down

    for (const capId of capitalNodeIds) {
      const capNode = nodeMap.get(capId);
      if (!capNode) continue;
      const player = capNode.controlled_by;
      if (!player) continue;

      const totalWealth = capitalWealthGenerated.get(capId) || 0;
      const totalSupplies = capitalSuppliesPool.get(capId) || 0;

      const capWealth = totalWealth * CAPITAL_RETENTION;
      const capSupplies = totalSupplies * CAPITAL_RETENTION;
      const distWealth = totalWealth - capWealth;
      const distSupplies = totalSupplies - capSupplies;

      nodeWealth.set(capId, (nodeWealth.get(capId) || 0) + capWealth);
      nodeSuppliesReturn.set(capId, (nodeSuppliesReturn.get(capId) || 0) + capSupplies);

      // Player's major nodes (excl capital)
      const playerMajors = nodes.filter(n =>
        (n.is_major || n.node_tier === "major") &&
        !capitalNodeIds.has(n.id) &&
        n.controlled_by === player
      );

      const totalMajorContrib = playerMajors.reduce((sum, m) => {
        const c = majorContribToCapital.get(m.id);
        return sum + (c ? c.production + c.supplies : 0);
      }, 0);

      for (const major of playerMajors) {
        const majorContrib = majorContribToCapital.get(major.id);
        const contribVal = majorContrib ? majorContrib.production + majorContrib.supplies : 0;
        const proportionalShare = totalMajorContrib > 0 ? (contribVal / totalMajorContrib) : (1 / Math.max(1, playerMajors.length));

        const majorWealthShare = distWealth * proportionalShare;
        const majorSupplyShare = distSupplies * proportionalShare;

        const majorKeepsW = majorWealthShare * MAJOR_RETENTION;
        const majorKeepsS = majorSupplyShare * MAJOR_RETENTION;
        const toMinorsW = majorWealthShare - majorKeepsW;
        const toMinorsS = majorSupplyShare - majorKeepsS;

        nodeWealth.set(major.id, (nodeWealth.get(major.id) || 0) + majorKeepsW);
        nodeSuppliesReturn.set(major.id, (nodeSuppliesReturn.get(major.id) || 0) + majorKeepsS);

        // Distribute to minors proportionally
        const myMinors = minorsByParent.get(major.id) || [];
        const totalMinorContrib = myMinors.reduce((sum, m) => {
          const f = minorForwarded.get(m.id);
          return sum + (f ? f.production + f.supplies : 0);
        }, 0);

        for (const minor of myMinors) {
          const minorFwd = minorForwarded.get(minor.id);
          const minorContrib = minorFwd ? minorFwd.production + minorFwd.supplies : 0;
          const minorShare = totalMinorContrib > 0 ? (minorContrib / totalMinorContrib) : (1 / Math.max(1, myMinors.length));
          nodeWealth.set(minor.id, (nodeWealth.get(minor.id) || 0) + toMinorsW * minorShare);
          nodeSuppliesReturn.set(minor.id, (nodeSuppliesReturn.get(minor.id) || 0) + toMinorsS * minorShare);
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
      food_value: number;
      capacity_score: number;
      importance_score: number;
      incoming_production: number;
      connectivity_score: number;
      route_access_factor: number;
      trade_efficiency: number;
      isolation_penalty: number;
      upkeep_supplies: number;
      upkeep_wealth: number;
      net_balance: number;
    }> = [];

    for (const node of nodes) {
      const routeAccess = computeRouteAccess(node.id, routes);
      const connectivity = computeConnectivity(node.id, routes, nodes.length);
      const cityData = node.city_id ? cityMap.get(node.city_id) : undefined;

      const own = rawDual.get(node.id) || { production: 0, supplies: 0 };
      let production = own.production;
      let supplies = own.supplies + (nodeSuppliesReturn.get(node.id) || 0);

      // Incoming (for display)
      let incoming: number;
      if (capitalNodeIds.has(node.id)) {
        const d = capitalIncomingDual.get(node.id);
        incoming = d ? d.production + d.supplies : 0;
      } else if (node.is_major || node.node_tier === "major") {
        const d = majorTotalDual.get(node.id);
        incoming = d ? d.production + d.supplies : 0;
      } else if (node.node_tier === "minor" || (!node.node_tier && !node.is_major && node.node_tier !== "micro")) {
        const d = minorTotalDual.get(node.id);
        incoming = d ? d.production + d.supplies : 0;
      } else {
        incoming = production + supplies;
      }

      // Wealth
      let wealth = nodeWealth.get(node.id) || 0;
      if (node.node_tier === "micro" && wealth === 0) {
        wealth = (production + supplies) * 0.02;
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

      // Isolation penalty
      const supply = supplyMap.get(node.id);
      if (supply && !supply.connected_to_capital) {
        const isolFactor = Math.min(supply.isolation_turns, 5);
        const pMult = Math.max(0.2, 1 - isolFactor * 0.08);
        const wMult = Math.max(0.3, 1 - isolFactor * 0.06);
        const cMult = Math.max(0.1, 1 - isolFactor * 0.10);
        production *= pMult;
        supplies *= pMult;
        wealth *= wMult;
        capacity *= cMult;
      }
      const isolationPenalty = (supply && !supply.connected_to_capital)
        ? Math.min(1, Math.min(supply.isolation_turns, 5) * 0.08)
        : 0;

      // Trade efficiency
      const ROLE_EFF: Record<string, number> = { hub: 1.0, gateway: 0.8, regulator: 0.6, producer: 0.3, neutral: 0.2 };
      const tradeEff = ROLE_EFF[node.flow_role] || 0.2;

      // Importance
      const importance = production * 0.25 + supplies * 0.15 + wealth * 0.3 + connectivity * 0.15 + node.strategic_value * 0.15;

      const upkeepInfo = nodeUpkeepData.get(node.id) || { upkeep_supplies: 0, upkeep_wealth: 0, net_balance: 0 };

      nodeResults.push({
        id: node.id,
        production_output: Math.round(production * 100) / 100,
        wealth_output: Math.round(wealth * 100) / 100,
        food_value: Math.round(supplies * 100) / 100,
        capacity_score: Math.round(capacity * 100) / 100,
        importance_score: Math.round(importance * 100) / 100,
        incoming_production: Math.round(incoming * 100) / 100,
        connectivity_score: Math.round(connectivity * 100) / 100,
        route_access_factor: Math.round(routeAccess * 100) / 100,
        trade_efficiency: Math.round(tradeEff * 100) / 100,
        isolation_penalty: Math.round(isolationPenalty * 100) / 100,
        upkeep_supplies: upkeepInfo.upkeep_supplies,
        upkeep_wealth: upkeepInfo.upkeep_wealth,
        net_balance: upkeepInfo.net_balance,
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
          food_value: nr.food_value,
          capacity_score: nr.capacity_score,
          importance_score: nr.importance_score,
          incoming_production: nr.incoming_production,
          connectivity_score: nr.connectivity_score,
          route_access_factor: nr.route_access_factor,
          trade_efficiency: nr.trade_efficiency,
          isolation_penalty: nr.isolation_penalty,
          upkeep_supplies: nr.upkeep_supplies,
          upkeep_wealth: nr.upkeep_wealth,
          net_balance: nr.net_balance,
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
      production: number; wealth: number; supplies: number; capacity: number; importance: number;
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
          production: 0, wealth: 0, supplies: 0, capacity: 0, importance: 0,
          iron: 0, horses: 0, salt: 0, copper: 0, gold_res: 0,
          marble: 0, gems: 0, timber: 0, obsidian: 0, silk: 0, incense: 0,
        });
      }
      const pt = playerTotals.get(player)!;
      pt.production += nr.production_output;
      pt.wealth += nr.wealth_output;
      pt.supplies += nr.food_value;
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

    // Phase A fix: read existing wealth components & logistic_capacity, fold them
    // into the canonical totals. Without this, total_wealth and total_capacity
    // collapse to ~0 even though the per-stream components are large.
    const playerNames = Array.from(playerTotals.keys());
    const { data: existingRows } = await sb.from("realm_resources")
      .select("player_name, wealth_pop_tax, wealth_domestic_market, wealth_route_commerce, goods_wealth_fiscal, logistic_capacity")
      .eq("session_id", session_id)
      .in("player_name", playerNames);
    const existingByPlayer = new Map<string, any>(
      (existingRows || []).map((r: any) => [r.player_name, r])
    );

    // Aggregate logistic_capacity per player from province_nodes (canonical)
    const playerLogistic = new Map<string, number>();
    for (const node of nodes) {
      const player = node.controlled_by;
      if (!player) continue;
      const lc = Number((node as any).logistic_capacity || 0);
      playerLogistic.set(player, (playerLogistic.get(player) || 0) + lc);
    }

    for (const [player, totals] of playerTotals) {
      const ex = existingByPlayer.get(player) || {};
      const wealthPopTax = Number(ex.wealth_pop_tax || 0);
      const wealthDomestic = Number(ex.wealth_domestic_market || 0);
      const wealthRoute = Number(ex.wealth_route_commerce || 0);
      const goodsFiscal = Number(ex.goods_wealth_fiscal || 0);

      // Canonical wealth = sum of all explicit revenue streams.
      // Fallback to legacy per-node wealth_output only if all streams are zero
      // (pre-v3 sessions that haven't been recomputed yet).
      const streamWealth = wealthPopTax + wealthDomestic + wealthRoute + goodsFiscal;
      const canonicalWealth = streamWealth > 0 ? streamWealth : totals.wealth;

      // Canonical capacity = sum of node logistic_capacity (real units), not
      // the 0–0.01 capacity_score fragments. Fall back to summed score only
      // if logistic_capacity is missing entirely.
      const summedLogistic = playerLogistic.get(player) || 0;
      const canonicalCapacity = summedLogistic > 0 ? summedLogistic : totals.capacity;

      const update = {
        total_production: Math.round(totals.production * 100) / 100,
        total_wealth: Math.round(canonicalWealth * 100) / 100,
        total_supplies: Math.round(totals.supplies * 100) / 100,
        total_capacity: Math.round(canonicalCapacity * 100) / 100,
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
      const incoming = capitalIncomingDual.get(capId) || { production: 0, supplies: 0 };
      return {
        capital_node: capNode?.city_id,
        player: capNode?.controlled_by,
        incoming_production: Math.round(incoming.production * 10) / 10,
        incoming_supplies: Math.round(incoming.supplies * 10) / 10,
        wealth_generated: Math.round((capitalWealthGenerated.get(capId) || 0) * 10) / 10,
      };
    });

    const summary = {
      ok: true,
      model: "v3_dual_flow",
      nodes_computed: nodeResults.length,
      capital_economies: capitalSummaries,
      totals_by_player: Object.fromEntries(
        Array.from(playerTotals.entries()).map(([p, t]) => [p, {
          production: Math.round(t.production),
          supplies: Math.round(t.supplies),
          wealth: Math.round(t.wealth),
          capacity: Math.round(t.capacity),
        }]),
      ),
      top_nodes: nodeResults
        .sort((a, b) => b.importance_score - a.importance_score)
        .slice(0, 5)
        .map(n => ({ id: n.id, importance: n.importance_score, prod: n.production_output, supplies: n.food_value, wealth: n.wealth_output })),
    };

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("compute-economy-flow error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
