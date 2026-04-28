import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * compute-trade-flows v4.3: 12-basket civilizational hierarchy
 *
 * Phase 1a: Run recipes on nodes → node_inventory (bonus production)
 * Phase 1b: Auto-production per city per basket (12 baskets, soft gates)
 * Phase 2:  Aggregate into city_market_summary (per good)
 * Phase 2b: Persist demand_baskets + city_market_baskets (per basket)
 * Phase 3:  Trade pressure & trade_flows
 * Phase 4:  Per-player goods fiscal aggregates
 * Phase 4b: Market share computation → market_shares + realm_resources
 *
 * CONSTRAINTS:
 * - stateEffect: inactive metadata only — NOT applied here
 * - routeEffect: inactive metadata only — NOT applied here
 * - uniqueProductSlots: inactive metadata only
 * - prestige tier class: reserved for Phase 2
 */

// ── Canonical basket config (mirrors goodsCatalog.ts BASKET_CONFIG v4.3) ──
type BasketTierClass = "need" | "civic" | "upgrade" | "military" | "prestige" | "luxury";

interface BasketDef {
  tier: number;
  tierClass: BasketTierClass;
  baseRate: number;
  basketValue: number;
  category: "universal" | "conditional" | "premium";
  popWeights: Record<string, number>;
}

const BASKET_CONFIG: Record<string, BasketDef> = {
  // NEED tier (1)
  staple_food:     { tier: 1, tierClass: "need",     baseRate: 0.012, basketValue: 8,  category: "universal",    popWeights: { peasants: 1.0, burghers: 0.6, clerics: 0.3, warriors: 0.8 } },
  basic_clothing:  { tier: 1, tierClass: "need",     baseRate: 0.004, basketValue: 10, category: "universal",    popWeights: { peasants: 0.4, burghers: 0.7, clerics: 0.5, warriors: 0.3 } },
  tools:           { tier: 1, tierClass: "need",     baseRate: 0.006, basketValue: 10, category: "universal",    popWeights: { peasants: 0.7, burghers: 0.5, clerics: 0.2, warriors: 0.4 } },
  fuel:            { tier: 1, tierClass: "need",     baseRate: 0.004, basketValue: 6,  category: "universal",    popWeights: { peasants: 0.6, burghers: 0.5, clerics: 0.3, warriors: 0.4 } },
  // CIVIC tier (2)
  drinking_water:  { tier: 2, tierClass: "civic",    baseRate: 0.003, basketValue: 5,  category: "conditional",  popWeights: { peasants: 0.8, burghers: 0.7, clerics: 0.5, warriors: 0.6 } },
  storage_logistics:{ tier: 2, tierClass: "civic",   baseRate: 0.003, basketValue: 14, category: "conditional",  popWeights: { peasants: 0.2, burghers: 0.8, clerics: 0.3, warriors: 0.3 } },
  admin_supplies:  { tier: 2, tierClass: "civic",    baseRate: 0.002, basketValue: 12, category: "conditional",  popWeights: { peasants: 0.1, burghers: 0.4, clerics: 0.7, warriors: 0.2 } },
  // UPGRADE tier (3)
  construction:    { tier: 3, tierClass: "upgrade",  baseRate: 0.005, basketValue: 12, category: "universal",    popWeights: { peasants: 0.3, burghers: 0.6, clerics: 0.4, warriors: 0.3 } },
  metalwork:       { tier: 3, tierClass: "upgrade",  baseRate: 0.008, basketValue: 6,  category: "conditional",  popWeights: { peasants: 0.5, burghers: 0.7, clerics: 0.2, warriors: 0.4 } },
  // MILITARY tier (4)
  military_supply: { tier: 4, tierClass: "military", baseRate: 0.003, basketValue: 15, category: "conditional",  popWeights: { peasants: 0.1, burghers: 0.2, clerics: 0.1, warriors: 1.0 } },
  // LUXURY tier (6) — tier 5 (prestige) reserved for Phase 2
  luxury_clothing: { tier: 6, tierClass: "luxury",   baseRate: 0,     basketValue: 25, category: "premium",      popWeights: { peasants: 0.05, burghers: 0.5, clerics: 0.3, warriors: 0.6 } },
  feast:           { tier: 6, tierClass: "luxury",   baseRate: 0,     basketValue: 20, category: "premium",      popWeights: { peasants: 0.1, burghers: 0.6, clerics: 0.4, warriors: 0.4 } },
};

const SETTLEMENT_MULT: Record<string, number> = {
  HAMLET: 0.5, TOWNSHIP: 0.8, CASTLE: 0.9, CITY: 1.0, POLIS: 1.3,
};

const PRESSURE_WEIGHTS: Record<string, number> = {
  need: 1.0, civic: 0.7, upgrade: 0.6, military: 0.5, luxury: 0.3,
};

// ── Legacy basket remap — temporary bridge for old DB keys ──
const LEGACY_BASKET_MAP: Record<string, string> = {
  basic_material: "metalwork",
  textile: "basic_clothing",
  variety: "feast",
  ritual: "luxury_clothing",
  prestige: "luxury_clothing",
};

/** Remap counters — tracked independently from warning text */
const remapCounters = { unmapped: 0, legacy: 0 };

function resolveBasketKey(raw: string, warnings: string[]): string {
  if (BASKET_CONFIG[raw]) return raw;
  const mapped = LEGACY_BASKET_MAP[raw];
  if (mapped) {
    remapCounters.legacy++;
    warnings.push(`Legacy remap: ${raw} → ${mapped}`);
    return mapped;
  }
  remapCounters.unmapped++;
  // Keep existing fallback behavior unless required for fix
  warnings.push(`Unknown basket_key: ${raw}, fallback to staple_food`);
  return "staple_food";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, turn_number } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const warnings: string[] = [];
    // Reset counters per invocation
    remapCounters.unmapped = 0;
    remapCounters.legacy = 0;
    // Resolve turn_number from session if not provided (refresh-economy doesn't pass it).
    let tn = (turn_number as number | undefined);
    if (!tn) {
      const { data: sessRow } = await sb
        .from("game_sessions")
        .select("current_turn")
        .eq("id", session_id)
        .maybeSingle();
      tn = (sessRow?.current_turn as number) || 1;
    }

    // ── LOAD DATA ──
    const [goodsRes, recipesRes, nodesRes, citiesRes, routesRes, hexesRes] = await Promise.all([
      sb.from("goods").select("key, category, production_stage, market_tier, base_price_numeric, demand_basket, substitution_map, storable"),
      sb.from("production_recipes").select("*"),
      sb.from("province_nodes").select("id, session_id, node_type, node_tier, node_subtype, production_role, capability_tags, guild_level, city_id, controlled_by, production_output, hex_q, hex_r, upgrade_level, specialization_scores, parent_node_id, route_access_factor").eq("session_id", session_id),
      sb.from("cities").select("id, name, owner_player, population_total, population_peasants, population_burghers, population_clerics, population_warriors, market_level, settlement_level, temple_level, city_stability, labor_allocation").eq("session_id", session_id),
      sb.from("province_routes").select("id, node_a, node_b, capacity_value, control_state").eq("session_id", session_id),
      sb.from("province_hexes").select("q, r, resource_deposits").eq("session_id", session_id).not("resource_deposits", "is", null),
    ]);

    const goods = goodsRes.data || [];
    const recipes = recipesRes.data || [];
    const nodes = nodesRes.data || [];
    const cities = citiesRes.data || [];
    const routes = routesRes.data || [];
    const hexDeposits = hexesRes.data || [];

    const goodsMap = new Map(goods.map(g => [g.key, g]));
    const cityMap = new Map(cities.map(c => [c.id, c]));
    const cityToNodeId = new Map<string, string>();
    for (const n of nodes) {
      if (n.city_id && !cityToNodeId.has(n.city_id)) {
        cityToNodeId.set(n.city_id, n.id);
      }
    }

    // Build hex deposit lookup
    const depositMap = new Map<string, any[]>();
    for (const h of hexDeposits) {
      if (h.resource_deposits && Array.isArray(h.resource_deposits)) {
        depositMap.set(`${h.q},${h.r}`, h.resource_deposits);
      }
    }

    // ════════════════════════════════════════════
    // PHASE 1a: Run recipes on nodes → node_inventory (bonus production)
    // ════════════════════════════════════════════
    const nodeInventories: Array<{ node_id: string; good_key: string; quantity: number; quality_band: number }> = [];

    for (const node of nodes) {
      const role = node.production_role;
      const tags: string[] = node.capability_tags || [];
      if (!role || tags.length === 0) continue;

      const eligibleRecipes = recipes.filter(r => {
        if (r.required_role !== role) return false;
        const reqTags: string[] = r.required_tags || [];
        return reqTags.every(t => tags.includes(t));
      });

      for (const recipe of eligibleRecipes) {
        const baseOutput = recipe.output_quantity || 1;
        const guildBonus = 1 + (node.guild_level || 0) * 0.15;
        const upgradeMult = 1 + ((node.upgrade_level || 1) - 1) * 0.2;
        const nodeProductionFactor = Math.max(0.1, (node.production_output || 1) / 5);

        let resourceYield = 1.0;
        if (role === "source") {
          const hexKey = `${node.hex_q},${node.hex_r}`;
          const deposits = depositMap.get(hexKey) || [];
          const outputKey = recipe.output_good_key;
          const matchingDeposit = deposits.find((d: any) =>
            d.resource_type_key === outputKey || d.resource_type_key?.includes(outputKey?.split("_")[0])
          );
          if (matchingDeposit) {
            resourceYield = (matchingDeposit.yield_per_turn || 1) * ((matchingDeposit.quality || 50) / 50);
          }
        }

        const quantity = Math.round(baseOutput * guildBonus * upgradeMult * nodeProductionFactor * resourceYield * 10) / 10;
        const qualityBand = Math.min(3, Math.max(0, Math.floor((node.guild_level || 0) / 2) + (recipe.quality_output_bonus || 1) - 1));

        if (quantity > 0) {
          nodeInventories.push({
            node_id: node.id,
            good_key: recipe.output_good_key,
            quantity,
            quality_band: Math.min(qualityBand, recipe.quality_output_bonus || 2),
          });
        }
      }
    }

    // Aggregate duplicates
    const invAgg = new Map<string, { node_id: string; good_key: string; quantity: number; quality_band: number; count: number }>();
    for (const ni of nodeInventories) {
      const key = `${ni.node_id}|${ni.good_key}`;
      const existing = invAgg.get(key);
      if (existing) {
        existing.quantity += ni.quantity;
        existing.quality_band = Math.max(existing.quality_band, ni.quality_band);
        existing.count++;
      } else {
        invAgg.set(key, { ...ni, count: 1 });
      }
    }
    const dedupedInventories = [...invAgg.values()].map(({ count, ...rest }) => rest);

    if (dedupedInventories.length > 0) {
      const nodeIds = [...new Set(dedupedInventories.map(ni => ni.node_id))];
      for (let i = 0; i < nodeIds.length; i += 50) {
        await sb.from("node_inventory").delete().in("node_id", nodeIds.slice(i, i + 50));
      }
      for (let i = 0; i < dedupedInventories.length; i += 50) {
        await sb.from("node_inventory").insert(dedupedInventories.slice(i, i + 50));
      }
    }

    // ════════════════════════════════════════════
    // Build node→city and city→nodes mappings
    // ════════════════════════════════════════════
    const nodeById = new Map(nodes.map(n => [n.id, n]));

    function resolveCityId(nodeId: string, depth = 0): string | null {
      if (depth > 5) return null;
      const node = nodeById.get(nodeId);
      if (!node) return null;
      if (node.city_id) return node.city_id;
      if (node.parent_node_id) return resolveCityId(node.parent_node_id, depth + 1);
      return null;
    }

    const nodeToCityMap = new Map<string, string>();
    for (const n of nodes) {
      const cityId = resolveCityId(n.id);
      if (cityId) nodeToCityMap.set(n.id, cityId);
    }

    const cityNodeIds = new Map<string, string[]>();
    for (const [nodeId, cityId] of nodeToCityMap) {
      const arr = cityNodeIds.get(cityId) || [];
      arr.push(nodeId);
      cityNodeIds.set(cityId, arr);
    }

    // Group inventory by city+good (bonus supply from recipes)
    const cityGoodSupply = new Map<string, Map<string, { quantity: number; quality_sum: number; count: number }>>();
    for (const inv of nodeInventories) {
      const cityId = nodeToCityMap.get(inv.node_id);
      if (!cityId) continue;

      if (!cityGoodSupply.has(cityId)) cityGoodSupply.set(cityId, new Map());
      const cityGoods = cityGoodSupply.get(cityId)!;
      const existing = cityGoods.get(inv.good_key) || { quantity: 0, quality_sum: 0, count: 0 };
      existing.quantity += inv.quantity;
      existing.quality_sum += inv.quality_band;
      existing.count += 1;
      cityGoods.set(inv.good_key, existing);
    }

    // ════════════════════════════════════════════
    // PHASE 1b: Auto-production per city per basket (v4.2)
    // ════════════════════════════════════════════

    // Collect all hex resource deposits near each city for conditional gates
    const cityResourceDeposits = new Map<string, Set<string>>();
    for (const [nodeId, cityId] of nodeToCityMap) {
      const node = nodeById.get(nodeId);
      if (!node) continue;
      const hexKey = `${node.hex_q},${node.hex_r}`;
      const deposits = depositMap.get(hexKey) || [];
      if (!cityResourceDeposits.has(cityId)) cityResourceDeposits.set(cityId, new Set());
      const set = cityResourceDeposits.get(cityId)!;
      for (const d of deposits) {
        if (d.resource_type_key) set.add(d.resource_type_key);
      }
    }

    // Auto-production results: city → basket → auto_supply
    const cityAutoSupply = new Map<string, Map<string, number>>();

    for (const city of cities) {
      const pop = city.population_total || 100;
      const weightedPopMap = new Map<string, number>();

      for (const [bk, bc] of Object.entries(BASKET_CONFIG)) {
        const pw = bc.popWeights;
        const weightedPop =
          (city.population_peasants || 0) * (pw.peasants || 0) +
          (city.population_burghers || 0) * (pw.burghers || 0) +
          (city.population_clerics || 0) * (pw.clerics || 0) +
          (city.population_warriors || 0) * (pw.warriors || 0);
        weightedPopMap.set(bk, weightedPop);
      }

      // Workforce participation from labor_allocation, fallback 0.7
      let workforceParticipation = 0.7;
      if (city.labor_allocation && typeof city.labor_allocation === "object") {
        const la = city.labor_allocation as Record<string, number>;
        const productiveSectors = ["farming", "mining", "crafting", "military", "trade", "construction"];
        const totalAllocated = productiveSectors.reduce((s, k) => s + (la[k] || 0), 0);
        if (totalAllocated > 0) workforceParticipation = Math.min(1, totalAllocated);
      }

      const stabilityFactor = Math.max(0.1, (city.city_stability || 50) / 100);
      const settlementMult = SETTLEMENT_MULT[city.settlement_level || "HAMLET"] || 0.5;

      const deposits = cityResourceDeposits.get(city.id) || new Set();

      const autoMap = new Map<string, number>();

      for (const [bk, bc] of Object.entries(BASKET_CONFIG)) {
        // Premium: never auto
        if (bc.category === "premium") {
          autoMap.set(bk, 0);
          continue;
        }

        // Conditional gates (v4.3 soft gates)
        if (bc.category === "conditional") {
          let gateOpen = false;
          let softMult = 1.0;

          if (bk === "basic_clothing") {
            gateOpen = ["fiber", "livestock", "wool", "flax", "cotton", "raw_fiber", "raw_hide"].some(d => deposits.has(d));
          } else if (bk === "metalwork") {
            // Soft gate: local ore = full, import routes could give 50% but we check deposits only here
            const hasLocalOre = ["iron", "copper", "tin", "raw_ore", "ore", "metal"].some(d => deposits.has(d));
            gateOpen = hasLocalOre;
            // If no local ore, the city might still get metalwork via trade flows (handled by bonus_supply from recipes)
          } else if (bk === "military_supply") {
            const warriors = city.population_warriors || 0;
            gateOpen = (warriors / Math.max(1, pop)) > 0.05;
          } else if (bk === "drinking_water") {
            // Soft gate: always active at 80% minimum, full with water sources
            gateOpen = true;
            const hasWater = ["river", "well", "aquifer", "lake", "spring", "water"].some(d => deposits.has(d));
            softMult = hasWater ? 1.0 : 0.8;
          } else if (bk === "storage_logistics") {
            gateOpen = (city.market_level || 0) >= 1;
          } else if (bk === "admin_supplies") {
            gateOpen = pop >= 300;
          } else if (bk === "fuel") {
            // Fuel is universal but with soft gate: 70% baseline without local sources
            gateOpen = true;
            const hasFuel = ["wood", "coal", "peat", "timber", "forest"].some(d => deposits.has(d));
            softMult = hasFuel ? 1.0 : 0.7;
          }

          if (!gateOpen) {
            autoMap.set(bk, 0);
            continue;
          }

          const weightedPop = weightedPopMap.get(bk) || 0;
          const autoSupply = weightedPop * bc.baseRate * workforceParticipation * stabilityFactor * settlementMult * softMult;
          autoMap.set(bk, Math.round(autoSupply * 100) / 100);
          continue;
        }

        const weightedPop = weightedPopMap.get(bk) || 0;
        const autoSupply = weightedPop * bc.baseRate * workforceParticipation * stabilityFactor * settlementMult;
        autoMap.set(bk, Math.round(autoSupply * 100) / 100);
      }

      cityAutoSupply.set(city.id, autoMap);
    }

    // ════════════════════════════════════════════
    // Compute demand per city per basket
    // ════════════════════════════════════════════
    const cityDemands = new Map<string, Map<string, number>>();
    for (const city of cities) {
      const demands = new Map<string, number>();
      for (const [bk, bc] of Object.entries(BASKET_CONFIG)) {
        const pw = bc.popWeights;
        const weightedPop =
          (city.population_peasants || 0) * (pw.peasants || 0) +
          (city.population_burghers || 0) * (pw.burghers || 0) +
          (city.population_clerics || 0) * (pw.clerics || 0) +
          (city.population_warriors || 0) * (pw.warriors || 0);
        const tierMult = 1 / bc.tier;
        const demand = Math.round(weightedPop * 0.01 * tierMult * 10) / 10;
        if (demand > 0) demands.set(bk, demand);
      }
      cityDemands.set(city.id, demands);
    }

    // ════════════════════════════════════════════
    // Aggregate bonus_supply per city per basket (from recipe node_inventory)
    // ════════════════════════════════════════════
    const cityBonusPerBasket = new Map<string, Map<string, { quantity: number; qualitySum: number; count: number }>>();
    for (const [cityId, goodsSupply] of cityGoodSupply) {
      const basketAgg = new Map<string, { quantity: number; qualitySum: number; count: number }>();
      for (const [gk, sv] of goodsSupply) {
        const good = goodsMap.get(gk);
        const rawBk = good?.demand_basket || "staple_food";
        const bk = resolveBasketKey(rawBk, warnings);
        const existing = basketAgg.get(bk) || { quantity: 0, qualitySum: 0, count: 0 };
        existing.quantity += sv.quantity;
        existing.qualitySum += sv.quality_sum;
        existing.count += sv.count;
        basketAgg.set(bk, existing);
      }
      cityBonusPerBasket.set(cityId, basketAgg);
    }

    // ════════════════════════════════════════════
    // PHASE 2: Write city_market_summary (per good, unchanged)
    // ════════════════════════════════════════════
    const summaryRows: any[] = [];
    for (const [cityId, goodsSupply] of cityGoodSupply) {
      const cityNodeId = nodes.find(n => n.city_id === cityId)?.id;
      if (!cityNodeId) continue;
      const demands = cityDemands.get(cityId) || new Map();

      for (const [goodKey, supply] of goodsSupply) {
        const good = goodsMap.get(goodKey);
        const rawBasketKey = good?.demand_basket || "staple_food";
        const basketKey = resolveBasketKey(rawBasketKey, warnings);
        const demandForBasket = demands.get(basketKey) || 0;

        summaryRows.push({
          session_id,
          city_node_id: cityNodeId,
          good_key: goodKey,
          supply_volume: Math.round(supply.quantity * 10) / 10,
          demand_volume: Math.round(demandForBasket * 10) / 10,
          avg_quality: supply.count > 0 ? Math.round(supply.quality_sum / supply.count) : 0,
          price_band: good?.base_price_numeric ? (good.base_price_numeric > 10 ? 2 : good.base_price_numeric > 3 ? 1 : 0) : 0,
          price_numeric: good?.base_price_numeric || 1,
          domestic_share: 1.0,
          import_share: 0.0,
          turn_number: tn,
        });
      }
    }

    if (summaryRows.length > 0) {
      await sb.from("city_market_summary").delete().eq("session_id", session_id).eq("turn_number", tn);
      for (let i = 0; i < summaryRows.length; i += 50) {
        await sb.from("city_market_summary").insert(summaryRows.slice(i, i + 50));
      }
    }

    // ════════════════════════════════════════════
    // PHASE 2b: Persist demand_baskets + city_market_baskets (per basket)
    // ════════════════════════════════════════════
    const demandBasketRows: any[] = [];
    const cityBasketRows: any[] = [];

    for (const city of cities) {
      const cityNodeId = cityToNodeId.get(city.id);
      const demands = cityDemands.get(city.id) || new Map();
      const autoMap = cityAutoSupply.get(city.id) || new Map();
      const bonusMap = cityBonusPerBasket.get(city.id) || new Map();

      // Compute city market_access from its nodes' route_access_factor
      const nids = cityNodeIds.get(city.id) || [];
      let sumAccess = 0;
      let accessCount = 0;
      for (const nid of nids) {
        const n = nodeById.get(nid);
        if (n && n.route_access_factor != null) {
          sumAccess += n.route_access_factor;
          accessCount++;
        }
      }
      const avgRouteAccess = accessCount > 0 ? sumAccess / accessCount : 0.5;
      const cityMarketAccess = avgRouteAccess * (0.8 + (city.market_level || 0) * 0.1);
      const cityMonetization = (1 + (city.market_level || 0) * 0.1) * Math.max(0.1, (city.city_stability || 50) / 100);

      for (const [bk, bc] of Object.entries(BASKET_CONFIG)) {
        const demandQty = demands.get(bk) || 0;
        const autoSupply = autoMap.get(bk) || 0;
        const bonus = bonusMap.get(bk);
        const bonusSupply = bonus?.quantity || 0;
        const localSupply = autoSupply + bonusSupply;
        const domesticSatisfaction = demandQty > 0 ? Math.min(1.0, localSupply / demandQty) : 1.0;
        const exportSurplus = Math.max(0, localSupply - demandQty);
        const guildLevel = bonus?.count ? Math.round(bonus.qualitySum / bonus.count) : 0;
        const qualityWeight = Math.min(2.0, Math.max(1.0, 1 + guildLevel * 0.15));

        // demand_baskets row (needs cityNodeId)
        if (cityNodeId) {
          demandBasketRows.push({
            session_id,
            city_id: cityNodeId,
            basket_key: bk,
            tier: bc.tier,
            quantity_needed: Math.round(demandQty * 10) / 10,
            quantity_fulfilled: Math.round(localSupply * 10) / 10,
            fulfillment_type: domesticSatisfaction >= 0.8 ? "full" : domesticSatisfaction >= 0.3 ? "partial" : "deficit",
            min_quality: 0,
            preferred_quality: bc.tier >= 3 ? 2 : 1,
            satisfaction_score: Math.round(domesticSatisfaction * 1000) / 1000,
            turn_number: tn,
          });
        }

        // city_market_baskets row (v4.2)
        const unmetDemand = Math.max(0, demandQty - localSupply);
        cityBasketRows.push({
          session_id,
          city_id: city.id,
          player_name: city.owner_player || "",
          basket_key: bk,
          auto_supply: autoSupply,
          bonus_supply: bonusSupply,
          local_demand: demandQty,
          local_supply: localSupply,
          domestic_satisfaction: Math.round(domesticSatisfaction * 1000) / 1000,
          unmet_demand: Math.round(unmetDemand * 100) / 100,
          export_surplus: Math.round(exportSurplus * 100) / 100,
          quality_weight: qualityWeight,
          market_access: Math.round(cityMarketAccess * 1000) / 1000,
          monetization: Math.round(cityMonetization * 1000) / 1000,
          turn_number: tn,
        });
      }
    }

    // Persist demand_baskets
    if (demandBasketRows.length > 0) {
      await sb.from("demand_baskets").delete().eq("session_id", session_id);
      for (let i = 0; i < demandBasketRows.length; i += 50) {
        const { error: dbErr } = await sb.from("demand_baskets").insert(demandBasketRows.slice(i, i + 50));
        if (dbErr) console.error("demand_baskets insert error:", JSON.stringify(dbErr));
      }
    }

    // Persist city_market_baskets
    if (cityBasketRows.length > 0) {
      await sb.from("city_market_baskets").delete().eq("session_id", session_id).eq("turn_number", tn);
      for (let i = 0; i < cityBasketRows.length; i += 50) {
        const { error } = await sb.from("city_market_baskets").insert(cityBasketRows.slice(i, i + 50));
        if (error) console.error("city_market_baskets insert error:", JSON.stringify(error));
      }
    }

    // ════════════════════════════════════════════
    // PHASE 3: Trade pressure & trade_flows
    // ════════════════════════════════════════════
    const cityAdjacency = new Map<string, Set<string>>();
    for (const route of routes) {
      if (route.control_state === "blocked") continue;
      const nodeA = nodeById.get(route.node_a);
      const nodeB = nodeById.get(route.node_b);
      if (!nodeA?.city_id || !nodeB?.city_id) continue;
      if (nodeA.city_id === nodeB.city_id) continue;

      if (!cityAdjacency.has(nodeA.city_id)) cityAdjacency.set(nodeA.city_id, new Set());
      if (!cityAdjacency.has(nodeB.city_id)) cityAdjacency.set(nodeB.city_id, new Set());
      cityAdjacency.get(nodeA.city_id)!.add(nodeB.city_id);
      cityAdjacency.get(nodeB.city_id)!.add(nodeA.city_id);
    }

    const tradeFlows: any[] = [];
    for (const [cityId, demands] of cityDemands) {
      const citySupply = cityGoodSupply.get(cityId) || new Map();
      const city = cityMap.get(cityId);
      if (!city) continue;
      const neighbors = cityAdjacency.get(cityId) || new Set();

      for (const [basketKey, demandQty] of demands) {
        // Match goods whose demand_basket resolves to this basketKey
        const relevantGoods = goods.filter(g => resolveBasketKey(g.demand_basket || "staple_food", warnings) === basketKey);
        let domesticSatisfaction = 0;
        for (const g of relevantGoods) {
          const supply = citySupply.get(g.key);
          if (supply) domesticSatisfaction += supply.quantity;
        }
        // Also add auto-supply
        const autoForBasket = cityAutoSupply.get(cityId)?.get(basketKey) || 0;
        domesticSatisfaction += autoForBasket;

        const gap = demandQty - domesticSatisfaction;
        if (gap <= 0) continue;

        for (const neighborId of neighbors) {
          const neighborSupply = cityGoodSupply.get(neighborId) || new Map();
          const neighborCity = cityMap.get(neighborId);
          if (!neighborCity) continue;

          let availableSurplus = 0;
          let bestGoodKey = "";
          for (const g of relevantGoods) {
            const ns = neighborSupply.get(g.key);
            const nd = cityDemands.get(neighborId)?.get(basketKey) || 0;
            if (ns && ns.quantity > nd) {
              const surplus = ns.quantity - nd;
              if (surplus > availableSurplus) {
                availableSurplus = surplus;
                bestGoodKey = g.key;
              }
            }
          }

          if (availableSurplus <= 0 || !bestGoodKey) continue;

          const basket = BASKET_CONFIG[basketKey];
          const needPressure = gap / Math.max(1, demandQty);
          const tierPressure = basket ? (PRESSURE_WEIGHTS[basket.tierClass] || 0.3) : 0;
          const pressure = PRESSURE_WEIGHTS.need * needPressure + tierPressure * 0.5;
          if (pressure < 0.1) continue;

          const flowVolume = Math.min(gap, availableSurplus * 0.5);

          tradeFlows.push({
            session_id,
            source_city_id: cityToNodeId.get(neighborId) || neighborId,
            target_city_id: cityToNodeId.get(cityId) || cityId,
            source_player: neighborCity.owner_player || "",
            target_player: city.owner_player || "",
            good_key: bestGoodKey,
            flow_type: "demand_pull",
            volume_per_turn: Math.round(flowVolume * 10) / 10,
            quality_band: 0,
            trade_pressure: Math.round(pressure * 100) / 100,
            effective_price: goodsMap.get(bestGoodKey)?.base_price_numeric || 1,
            price_band: (goodsMap.get(bestGoodKey)?.base_price_numeric || 0) > 5 ? 1 : 0,
            friction_score: 0,
            maturity: 0,
            status: pressure > 0.5 ? "active" : "trial",
            turn_created: tn,
          });
        }
      }
    }

    if (tradeFlows.length > 0) {
      await sb.from("trade_flows").delete().eq("session_id", session_id);
      for (let i = 0; i < tradeFlows.length; i += 50) {
        const { error: tfErr } = await sb.from("trade_flows").insert(tradeFlows.slice(i, i + 50));
        if (tfErr) console.error("trade_flows insert error:", JSON.stringify(tfErr));
      }
    }

    // ════════════════════════════════════════════
    // PHASE 4: Per-player goods fiscal aggregates
    // ════════════════════════════════════════════
    const playerAggregates = new Map<string, {
      tax_market: number; tax_transit: number; tax_extraction: number;
      commercial_retention: number; commercial_capture: number;
      goods_production_total: number; goods_supply_total: number;
    }>();

    for (const city of cities) {
      const player = city.owner_player;
      if (!player) continue;

      if (!playerAggregates.has(player)) {
        playerAggregates.set(player, {
          tax_market: 0, tax_transit: 0, tax_extraction: 0,
          commercial_retention: 0, commercial_capture: 0,
          goods_production_total: 0, goods_supply_total: 0,
        });
      }
      const agg = playerAggregates.get(player)!;

      const supply = cityGoodSupply.get(city.id);
      if (supply) {
        let totalSupply = 0;
        let storableSupply = 0;
        for (const [gk, sv] of supply) {
          totalSupply += sv.quantity;
          const good = goodsMap.get(gk);
          if (good?.storable) storableSupply += sv.quantity;
          if (good?.production_stage === "raw") {
            agg.tax_extraction += sv.quantity * (good.base_price_numeric || 1) * 0.05;
          }
        }
        agg.goods_production_total += totalSupply;
        agg.goods_supply_total += storableSupply;
        const marketFactor = 1 + (city.market_level || 0) * 0.1;
        agg.tax_market += totalSupply * 0.08 * marketFactor;
      }

      const exportFlows = tradeFlows.filter(f => f.source_city_id === city.id);
      for (const ef of exportFlows) {
        agg.commercial_capture += ef.volume_per_turn * (ef.effective_price || 1) * 0.1;
      }

      const demands = cityDemands.get(city.id);
      if (demands && supply) {
        let totalDemand = 0;
        let totalDomestic = 0;
        for (const [bk, dq] of demands) {
          totalDemand += dq;
          const relevantGoods = goods.filter(g => resolveBasketKey(g.demand_basket || "staple_food", warnings) === bk);
          for (const g of relevantGoods) {
            const s = supply.get(g.key);
            if (s) totalDomestic += Math.min(s.quantity, dq);
          }
        }
        if (totalDemand > 0) agg.commercial_retention += totalDomestic / totalDemand;
      }
    }

    for (const flow of tradeFlows) {
      const fromCity = cityMap.get(flow.source_city_id);
      const toCity = cityMap.get(flow.target_city_id);
      if (fromCity && toCity && fromCity.owner_player !== toCity.owner_player) {
        for (const player of [fromCity.owner_player, toCity.owner_player]) {
          if (!player) continue;
          const agg = playerAggregates.get(player);
          if (agg) agg.tax_transit += flow.volume_per_turn * 0.03;
        }
      }
    }

    // ════════════════════════════════════════════
    // PHASE 4b: Market share computation (v4.2)
    // ════════════════════════════════════════════

    // Per player per basket: aggregate city basket data
    const playerBasketData = new Map<string, Map<string, {
      localSupply: number; localDemand: number;
      effectiveExport: number; domesticSatisfaction: number;
      autoProduction: number; bonusProduction: number;
      qualityWeight: number;
    }>>();

    for (const row of cityBasketRows) {
      const player = row.player_name;
      if (!player) continue;
      if (!playerBasketData.has(player)) playerBasketData.set(player, new Map());
      const pMap = playerBasketData.get(player)!;

      const existing = pMap.get(row.basket_key) || {
        localSupply: 0, localDemand: 0, effectiveExport: 0,
        domesticSatisfaction: 0, autoProduction: 0, bonusProduction: 0,
        qualityWeight: 1,
      };

      existing.localSupply += row.local_supply;
      existing.localDemand += row.local_demand;
      existing.autoProduction += row.auto_supply;
      existing.bonusProduction += row.bonus_supply;
      // effective_export = surplus × quality × market_access
      const effectiveExport = row.export_surplus * row.quality_weight * row.market_access;
      existing.effectiveExport += effectiveExport;
      existing.qualityWeight = Math.max(existing.qualityWeight, row.quality_weight);

      pMap.set(row.basket_key, existing);
    }

    // ════════════════════════════════════════════
    // PHASE 4a-bis: Neutral node contributions (Patch 7)
    // Inject supply from world_node_outputs via node_trade_links and annexed nodes.
    // ════════════════════════════════════════════
    try {
      const [outputsRes, linksRes, neutralNodesRes] = await Promise.all([
        sb.from("world_node_outputs").select("node_id, basket_key, quantity, quality, exportable_ratio").eq("session_id", session_id),
        sb.from("node_trade_links").select("node_id, player_name, link_status, route_safety").eq("session_id", session_id),
        sb.from("province_nodes").select("id, is_neutral, controlled_by, discovered").eq("session_id", session_id),
      ]);
      const outputs = outputsRes.data || [];
      const links = linksRes.data || [];
      const nNodes = neutralNodesRes.data || [];

      const outputsByNode = new Map<string, any[]>();
      for (const o of outputs) {
        if (!outputsByNode.has(o.node_id)) outputsByNode.set(o.node_id, []);
        outputsByNode.get(o.node_id)!.push(o);
      }
      const nodeStateMap = new Map(nNodes.map(n => [n.id, n]));

      const addToBasket = (player: string, bk: string, supplyAdd: number) => {
        if (!playerBasketData.has(player)) playerBasketData.set(player, new Map());
        const pMap = playerBasketData.get(player)!;
        const existing = pMap.get(bk) || {
          localSupply: 0, localDemand: 0, effectiveExport: 0,
          domesticSatisfaction: 0, autoProduction: 0, bonusProduction: 0,
          qualityWeight: 1,
        };
        existing.localSupply += supplyAdd;
        existing.bonusProduction += supplyAdd;
        // contributes to export pool with neutral safety penalty already applied
        existing.effectiveExport += supplyAdd * 0.6;
        pMap.set(bk, existing);
      };

      // 1) Trade-linked neutral nodes → partial supply with route_safety penalty
      for (const link of links) {
        if (!["trade_open", "protected", "vassalized"].includes(link.link_status)) continue;
        const node = nodeStateMap.get(link.node_id);
        if (!node || !node.discovered || !node.is_neutral) continue;
        const outs = outputsByNode.get(link.node_id) || [];
        const safety = Number(link.route_safety ?? 1);
        for (const o of outs) {
          const supplyAdd = Number(o.quantity || 0) * Number(o.exportable_ratio || 0.4) * safety;
          if (supplyAdd <= 0) continue;
          addToBasket(link.player_name, o.basket_key, supplyAdd);
        }
      }

      // 2) Annexed nodes (controlled_by + !is_neutral) → full quantity to owner
      for (const node of nNodes) {
        if (node.is_neutral) continue;
        if (!node.controlled_by) continue;
        const outs = outputsByNode.get(node.id) || [];
        for (const o of outs) {
          const supplyAdd = Number(o.quantity || 0);
          if (supplyAdd <= 0) continue;
          addToBasket(node.controlled_by, o.basket_key, supplyAdd);
        }
      }
    } catch (e) {
      warnings.push(`Neutral node integration failed: ${(e as Error).message}`);
    }

    // ════════════════════════════════════════════
    // PHASE 4a-ter: Trade systems aggregation (Node-Trade v1, Stage 5)
    //   - aggregate supply/demand per (trade_system, basket)
    //   - symmetric price index: clamp(0.5, 2.0, 1 + (D - S) / max(D + S, 1))
    //   - members of a system gain pooled supply weighted by access tariff
    //   Architecture: compute-trade-systems projects access → THIS consumes.
    // ════════════════════════════════════════════
    try {
      const [systemsRes, accessRes, outputsRes2, nodesRes2] = await Promise.all([
        sb.from("trade_systems").select("id, system_key, member_players").eq("session_id", session_id),
        sb.from("player_trade_system_access").select("trade_system_id, player_name, access_level, tariff_factor").eq("session_id", session_id),
        sb.from("world_node_outputs").select("node_id, basket_key, quantity, quality, exportable_ratio").eq("session_id", session_id),
        sb.from("province_nodes").select("id, trade_system_id, controlled_by, is_neutral").eq("session_id", session_id),
      ]);
      const systems = systemsRes.data || [];
      const accesses = accessRes.data || [];
      const outputs2 = outputsRes2.data || [];
      const nodes2 = nodesRes2.data || [];

      const sysIdToKey = new Map<string, string>(systems.map((s: any) => [s.id, s.system_key as string]));
      const nodeToSys = new Map<string, string>();
      for (const n of nodes2) if ((n as any).trade_system_id) nodeToSys.set((n as any).id, (n as any).trade_system_id);

      // System-level supply/quality by basket
      type SysAgg = { supply: number; quality_sum: number; quality_n: number; demand: number };
      const sysAgg = new Map<string, Map<string, SysAgg>>(); // sysId -> basket -> agg
      const ensure = (sysId: string, bk: string): SysAgg => {
        if (!sysAgg.has(sysId)) sysAgg.set(sysId, new Map());
        const m = sysAgg.get(sysId)!;
        if (!m.has(bk)) m.set(bk, { supply: 0, quality_sum: 0, quality_n: 0, demand: 0 });
        return m.get(bk)!;
      };

      // Supply: every node output contributes to its system, scaled by exportable_ratio
      // (annexed/owned full quantity; neutral exportable_ratio kept as-is)
      for (const o of outputs2) {
        const sysId = nodeToSys.get((o as any).node_id);
        if (!sysId) continue;
        const node = nodes2.find((n: any) => n.id === (o as any).node_id);
        const isOwned = !!node && !(node as any).is_neutral && !!(node as any).controlled_by;
        const qty = Number((o as any).quantity || 0);
        const ratio = isOwned ? 1.0 : Number((o as any).exportable_ratio || 0.4);
        const supplyAdd = qty * ratio;
        if (supplyAdd <= 0) continue;
        const agg = ensure(sysId, (o as any).basket_key);
        agg.supply += supplyAdd;
        const q = Number((o as any).quality ?? 1);
        agg.quality_sum += q * supplyAdd;
        agg.quality_n += supplyAdd;
      }

      // Demand: aggregate localDemand of members into their systems
      // (a player may belong to multiple systems → demand split equally across them)
      const memberSystems = new Map<string, string[]>(); // player -> sysIds
      for (const s of systems) {
        for (const m of (s as any).member_players || []) {
          const arr = memberSystems.get(m) ?? [];
          arr.push((s as any).id);
          memberSystems.set(m, arr);
        }
      }
      for (const [player, baskets] of playerBasketData) {
        const sysIds = memberSystems.get(player) || [];
        if (sysIds.length === 0) continue;
        const split = 1 / sysIds.length;
        for (const [bk, data] of baskets) {
          if (!data.localDemand) continue;
          for (const sysId of sysIds) {
            const agg = ensure(sysId, bk);
            agg.demand += data.localDemand * split;
          }
        }
      }

      // Persist trade_system_basket_supply (delete + insert; cascades cleared above by compute-trade-systems too)
      await sb.from("trade_system_basket_supply").delete().eq("session_id", session_id);
      const supplyRows: any[] = [];
      for (const [sysId, byBasket] of sysAgg.entries()) {
        for (const [bk, a] of byBasket.entries()) {
          const D = a.demand;
          const S = a.supply;
          const denom = Math.max(D + S, 1);
          const priceIndex = Math.max(0.5, Math.min(2.0, 1 + (D - S) / denom));
          const avgQuality = a.quality_n > 0 ? a.quality_sum / a.quality_n : 1.0;
          supplyRows.push({
            session_id,
            trade_system_id: sysId,
            basket_key: bk,
            total_supply: Math.round(S * 100) / 100,
            total_demand: Math.round(D * 100) / 100,
            surplus: Math.max(0, Math.round((S - D) * 100) / 100),
            shortage: Math.max(0, Math.round((D - S) * 100) / 100),
            price_index: Math.round(priceIndex * 1000) / 1000,
            avg_quality: Math.round(avgQuality * 1000) / 1000,
            computed_at: new Date().toISOString(),
          });
        }
      }
      if (supplyRows.length > 0) {
        const CHUNK = 200;
        for (let i = 0; i < supplyRows.length; i += CHUNK) {
          const { error } = await sb.from("trade_system_basket_supply").insert(supplyRows.slice(i, i + CHUNK));
          if (error) console.warn("trade_system_basket_supply insert failed:", error.message);
        }
      }

      // Inject system-pooled supply back into playerBasketData via access projection
      // Each member with access gets a tariff-scaled share of the system surplus.
      const accessByPlayer = new Map<string, Array<{ sysId: string; tariff: number; level: string }>>();
      for (const a of accesses) {
        const arr = accessByPlayer.get((a as any).player_name) ?? [];
        arr.push({ sysId: (a as any).trade_system_id, tariff: Number((a as any).tariff_factor || 1), level: String((a as any).access_level) });
        accessByPlayer.set((a as any).player_name, arr);
      }
      for (const [player, accList] of accessByPlayer.entries()) {
        if (!playerBasketData.has(player)) playerBasketData.set(player, new Map());
        const pMap = playerBasketData.get(player)!;
        for (const acc of accList) {
          if (acc.level === "visible") continue; // intel only, no trade
          const byBasket = sysAgg.get(acc.sysId);
          if (!byBasket) continue;
          // Count how many traders share this system to split surplus fairly
          const sharers = (accesses as any[]).filter((x) => x.trade_system_id === acc.sysId && x.access_level !== "visible").length || 1;
          for (const [bk, a] of byBasket.entries()) {
            const surplus = Math.max(0, a.supply - a.demand);
            if (surplus <= 0) continue;
            const grant = (surplus / sharers) / Math.max(0.5, acc.tariff);
            const existing = pMap.get(bk) || {
              localSupply: 0, localDemand: 0, effectiveExport: 0,
              domesticSatisfaction: 0, autoProduction: 0, bonusProduction: 0,
              qualityWeight: 1,
            };
            existing.localSupply += grant;
            existing.bonusProduction += grant;
            existing.effectiveExport += grant; // already tariff-adjusted
            const avgQ = a.quality_n > 0 ? a.quality_sum / a.quality_n : 1;
            existing.qualityWeight = Math.max(existing.qualityWeight, avgQ);
            pMap.set(bk, existing);
          }
        }
      }
    } catch (e) {
      warnings.push(`Trade systems aggregation failed: ${(e as Error).message}`);
    }

    // Compute domestic satisfaction per player per basket (weighted aggregate)
    for (const [player, baskets] of playerBasketData) {
      for (const [bk, data] of baskets) {
        data.domesticSatisfaction = data.localDemand > 0
          ? Math.min(1, data.localSupply / data.localDemand)
          : 1;
      }
    }

    // Global aggregates per basket
    const globalPerBasket = new Map<string, { totalExport: number; totalDemand: number; totalSupply: number }>();
    for (const [_player, baskets] of playerBasketData) {
      for (const [bk, data] of baskets) {
        const g = globalPerBasket.get(bk) || { totalExport: 0, totalDemand: 0, totalSupply: 0 };
        g.totalExport += data.effectiveExport;
        g.totalDemand += data.localDemand;
        g.totalSupply += data.localSupply;
        globalPerBasket.set(bk, g);
      }
    }

    // Compute market_shares rows + player wealth
    const marketShareRows: any[] = [];
    const playerMarketWealth = new Map<string, number>();
    const playerDomesticWealth = new Map<string, number>();

    for (const [player, baskets] of playerBasketData) {
      let totalMW = 0;
      let totalDW = 0;

      for (const [bk, data] of baskets) {
        const bc = BASKET_CONFIG[bk];
        if (!bc) continue;
        const global = globalPerBasket.get(bk) || { totalExport: 0, totalDemand: 0, totalSupply: 0 };
        const marketShare = global.totalExport > 0 ? data.effectiveExport / global.totalExport : 0;
        const marketFill = global.totalDemand > 0 ? Math.min(1, global.totalSupply / global.totalDemand) : 1;

        // Player market basket wealth
        const playerMarketBasketWealth = bc.basketValue * marketShare * marketFill;
        totalMW += playerMarketBasketWealth;

        // Domestic wealth component
        const domesticWealth = data.localDemand * data.domesticSatisfaction * bc.basketValue;
        totalDW += domesticWealth;

        marketShareRows.push({
          session_id,
          player_name: player,
          basket_key: bk,
          auto_production: data.autoProduction,
          bonus_production: data.bonusProduction,
          quality_weight: data.qualityWeight,
          effective_export: Math.round(data.effectiveExport * 100) / 100,
          global_export: Math.round(global.totalExport * 100) / 100,
          global_demand: Math.round(global.totalDemand * 100) / 100,
          market_share: Math.round(marketShare * 10000) / 10000,
          domestic_satisfaction: Math.round(data.domesticSatisfaction * 1000) / 1000,
          wealth_generated: Math.round(playerMarketBasketWealth * 100) / 100,
          turn_number: tn,
        });
      }

      playerMarketWealth.set(player, totalMW);
      playerDomesticWealth.set(player, totalDW);
    }

    // Persist market_shares
    if (marketShareRows.length > 0) {
      await sb.from("market_shares").delete().eq("session_id", session_id).eq("turn_number", tn);
      for (let i = 0; i < marketShareRows.length; i += 50) {
        const { error } = await sb.from("market_shares").insert(marketShareRows.slice(i, i + 50));
        if (error) console.error("market_shares insert error:", JSON.stringify(error));
      }
    }

    // ── Persist fiscal + market share to realm_resources ──
    for (const [player, agg] of playerAggregates) {
      const cityCount = cities.filter(c => c.owner_player === player).length;
      const avgRetention = cityCount > 0 ? agg.commercial_retention / cityCount : 0;

      let playerGoodsProductionValue = 0;
      let playerGoodsSupplyVolume = 0;
      const playerCityIds = cities.filter(c => c.owner_player === player).map(c => c.id);
      const playerNodeIds = new Set<string>();
      for (const [nodeId, cityId] of nodeToCityMap) {
        if (playerCityIds.includes(cityId)) playerNodeIds.add(nodeId);
      }
      for (const inv of dedupedInventories) {
        if (!playerNodeIds.has(inv.node_id)) continue;
        const good = goodsMap.get(inv.good_key);
        const basePrice = good?.base_price_numeric || 1;
        playerGoodsProductionValue += inv.quantity * basePrice;
        if (good?.storable) playerGoodsSupplyVolume += inv.quantity;
      }

      const goodsWealthFiscal = agg.tax_market + agg.tax_transit + agg.tax_extraction + agg.commercial_capture;

      await sb.from("realm_resources").update({
        tax_market: Math.round(agg.tax_market * 10) / 10,
        tax_transit: Math.round(agg.tax_transit * 10) / 10,
        tax_extraction: Math.round(agg.tax_extraction * 10) / 10,
        commercial_retention: Math.round(avgRetention * 1000) / 1000,
        commercial_capture: Math.round(agg.commercial_capture * 10) / 10,
        goods_production_value: Math.round(playerGoodsProductionValue * 10) / 10,
        goods_supply_volume: Math.round(playerGoodsSupplyVolume * 10) / 10,
        goods_wealth_fiscal: Math.round(goodsWealthFiscal * 10) / 10,
        wealth_domestic_component: Math.round((playerDomesticWealth.get(player) || 0) * 100) / 100,
        wealth_market_share: Math.round((playerMarketWealth.get(player) || 0) * 100) / 100,
      }).eq("session_id", session_id).eq("player_name", player);
    }

    const uniqueWarnings = [...new Set(warnings)];
    return new Response(JSON.stringify({
      ok: true,
      version: "v4.3",
      baskets_count: Object.keys(BASKET_CONFIG).length,
      inventories_computed: nodeInventories.length,
      auto_production_cities: cityAutoSupply.size,
      market_summaries: summaryRows.length,
      city_basket_rows: cityBasketRows.length,
      market_share_rows: marketShareRows.length,
      trade_flows_created: tradeFlows.length,
      players_updated: playerAggregates.size,
      unmapped_count: remapCounters.unmapped,
      legacy_remap_count: remapCounters.legacy,
      warnings: uniqueWarnings.slice(0, 50),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("compute-trade-flows error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
