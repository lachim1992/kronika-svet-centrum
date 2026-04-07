import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * compute-trade-flows: Goods-aware city-to-city trade flow resolution
 *
 * Phase 9 of Chronicle Economy v4.1
 *
 * 1. Load goods catalog, recipes, demand baskets
 * 2. For each city node with production_role, run eligible recipes → populate node_inventory
 * 3. Aggregate node_inventory into city_market_summary (projection)
 * 4. Compute demand basket satisfaction per city
 * 5. Compute trade pressure between cities with unmet demand
 * 6. Create/update trade_flows records
 */

// ── Demand basket definitions (mirrors goodsCatalog.ts) ──
const DEMAND_BASKETS: Record<string, { tier: number; social_weights: Record<string, number> }> = {
  staple_food:     { tier: 1, social_weights: { peasants: 1.0, burghers: 0.8, clerics: 0.7, warriors: 1.0 } },
  basic_material:  { tier: 1, social_weights: { peasants: 0.5, burghers: 0.8, clerics: 0.3, warriors: 0.6 } },
  variety_food:    { tier: 2, social_weights: { peasants: 0.3, burghers: 0.8, clerics: 0.5, warriors: 0.4 } },
  textile:         { tier: 2, social_weights: { peasants: 0.4, burghers: 0.9, clerics: 0.6, warriors: 0.5 } },
  tools:           { tier: 2, social_weights: { peasants: 0.8, burghers: 0.6, clerics: 0.3, warriors: 0.4 } },
  construction:    { tier: 2, social_weights: { peasants: 0.2, burghers: 0.5, clerics: 0.4, warriors: 0.3 } },
  military_supply: { tier: 2, social_weights: { peasants: 0.1, burghers: 0.2, clerics: 0.1, warriors: 1.0 } },
  ritual:          { tier: 3, social_weights: { peasants: 0.3, burghers: 0.4, clerics: 1.0, warriors: 0.2 } },
  luxury:          { tier: 4, social_weights: { peasants: 0.1, burghers: 0.6, clerics: 0.3, warriors: 0.2 } },
  feast:           { tier: 5, social_weights: { peasants: 0.1, burghers: 0.5, clerics: 0.4, warriors: 0.3 } },
};

// Trade pressure weights
const PRESSURE_WEIGHTS = { need: 1.0, upgrade: 0.6, variety: 0.4, prestige: 0.3, ritual: 0.5 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, turn_number } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── LOAD DATA ──
    const [goodsRes, recipesRes, nodesRes, citiesRes, routesRes, hexesRes] = await Promise.all([
      sb.from("goods").select("key, category, production_stage, market_tier, base_price_numeric, demand_basket, substitution_map, storable"),
      sb.from("production_recipes").select("*"),
      sb.from("province_nodes").select("id, session_id, node_type, node_tier, node_subtype, production_role, capability_tags, guild_level, city_id, controlled_by, production_output, hex_q, hex_r, upgrade_level, specialization_scores, parent_node_id").eq("session_id", session_id),
      sb.from("cities").select("id, name, owner_player, population_total, population_peasants, population_burghers, population_clerics, population_warriors, market_level, settlement_level").eq("session_id", session_id),
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

    // Build hex deposit lookup
    const depositMap = new Map<string, any[]>();
    for (const h of hexDeposits) {
      if (h.resource_deposits && Array.isArray(h.resource_deposits)) {
        depositMap.set(`${h.q},${h.r}`, h.resource_deposits);
      }
    }

    // ════════════════════════════════════════════
    // PHASE 1: Run recipes on nodes → compute node_inventory
    // ════════════════════════════════════════════
    const nodeInventories: Array<{ node_id: string; good_key: string; quantity: number; quality_band: number }> = [];

    for (const node of nodes) {
      const role = node.production_role;
      const tags: string[] = node.capability_tags || [];
      if (!role || tags.length === 0) continue;

      // Find eligible recipes for this node
      const eligibleRecipes = recipes.filter(r => {
        if (r.required_role !== role) return false;
        const reqTags: string[] = r.required_tags || [];
        return reqTags.every(t => tags.includes(t));
      });

      for (const recipe of eligibleRecipes) {
        // Base output from recipe (correct column: output_quantity)
        const baseOutput = recipe.output_quantity || 1;
        const guildBonus = 1 + (node.guild_level || 0) * 0.15;
        const upgradeMult = 1 + ((node.upgrade_level || 1) - 1) * 0.2;
        const nodeProductionFactor = Math.max(0.1, (node.production_output || 1) / 5); // normalize

        // For source nodes, check hex deposits
        let resourceYield = 1.0;
        if (role === "source") {
          const hexKey = `${node.hex_q},${node.hex_r}`;
          const deposits = depositMap.get(hexKey) || [];
          // Check if this recipe's output matches any deposit (correct column: output_good_key)
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

          // Track specialization
          if (node.specialization_scores && recipe.output_good_key) {
            const scores = node.specialization_scores as Record<string, number>;
            const branch = recipe.output_good_key.split("_")[0];
            scores[branch] = (scores[branch] || 0) + 1;
            // Will batch update later
          }
        }
      }
    }

    // ── Persist node_inventory ──
    // Aggregate duplicates (same node_id + good_key from multiple recipes)
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
        const { error: delErr } = await sb.from("node_inventory").delete().in("node_id", nodeIds.slice(i, i + 50));
        if (delErr) console.error("node_inventory delete error:", JSON.stringify(delErr));
      }
      for (let i = 0; i < dedupedInventories.length; i += 50) {
        const { error: insErr } = await sb.from("node_inventory").insert(dedupedInventories.slice(i, i + 50));
        if (insErr) console.error("node_inventory insert error:", JSON.stringify(insErr));
      }
    }

    // ════════════════════════════════════════════
    // PHASE 2: Aggregate into city_market_summary
    // ════════════════════════════════════════════
    // Build city → nodes map
    const cityNodes = new Map<string, string[]>();
    for (const n of nodes) {
      if (!n.city_id) continue;
      const arr = cityNodes.get(n.city_id) || [];
      arr.push(n.id);
      cityNodes.set(n.city_id, arr);
    }
    // Also include child nodes (nodes whose parent is a city node)
    const cityNodeIds = new Set(nodes.filter(n => n.city_id).map(n => n.id));
    for (const n of nodes) {
      if (n.city_id) continue; // already handled
      // Find if this node's parent chain leads to a city node
      // Simple: just check direct parent
      const parent = nodes.find(p => p.id === (n as any).parent_node_id);
      if (parent?.city_id) {
        const arr = cityNodes.get(parent.city_id) || [];
        arr.push(n.id);
        cityNodes.set(parent.city_id, arr);
      }
    }

    // Group inventory by city+good
    const cityGoodSupply = new Map<string, Map<string, { quantity: number; quality_sum: number; count: number }>>();
    for (const inv of nodeInventories) {
      // Find which city this node belongs to
      let cityId: string | null = null;
      for (const [cid, nids] of cityNodes) {
        if (nids.includes(inv.node_id)) { cityId = cid; break; }
      }
      if (!cityId) continue;

      if (!cityGoodSupply.has(cityId)) cityGoodSupply.set(cityId, new Map());
      const cityGoods = cityGoodSupply.get(cityId)!;
      const existing = cityGoods.get(inv.good_key) || { quantity: 0, quality_sum: 0, count: 0 };
      existing.quantity += inv.quantity;
      existing.quality_sum += inv.quality_band;
      existing.count += 1;
      cityGoods.set(inv.good_key, existing);
    }

    // Compute demand per city
    const cityDemands = new Map<string, Map<string, number>>();
    for (const city of cities) {
      const pop = city.population_total || 100;
      const demands = new Map<string, number>();

      for (const [basketKey, basket] of Object.entries(DEMAND_BASKETS)) {
        const sw = basket.social_weights;
        const weightedPop =
          (city.population_peasants || 0) * (sw.peasants || 0) +
          (city.population_burghers || 0) * (sw.burghers || 0) +
          (city.population_clerics || 0) * (sw.clerics || 0) +
          (city.population_warriors || 0) * (sw.warriors || 0);

        // Demand scales with weighted population and tier (higher tiers = less base demand)
        const tierMult = 1 / basket.tier;
        const demand = Math.round(weightedPop * 0.01 * tierMult * 10) / 10;
        if (demand > 0) demands.set(basketKey, demand);
      }
      cityDemands.set(city.id, demands);
    }

    // Write city_market_summary
    const summaryRows: any[] = [];
    for (const [cityId, goodsSupply] of cityGoodSupply) {
      const cityNodeId = nodes.find(n => n.city_id === cityId)?.id;
      if (!cityNodeId) continue;

      const demands = cityDemands.get(cityId) || new Map();

      for (const [goodKey, supply] of goodsSupply) {
        const good = goodsMap.get(goodKey);
        const basketKey = good?.demand_basket || "basic_material";
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
          domestic_share: 1.0, // Initially all domestic
          import_share: 0.0,
          turn_number: turn_number || 1,
        });
      }
    }

    // Upsert city_market_summary
    if (summaryRows.length > 0) {
      await sb.from("city_market_summary").delete()
        .eq("session_id", session_id)
        .eq("turn_number", turn_number || 1);
      for (let i = 0; i < summaryRows.length; i += 50) {
        await sb.from("city_market_summary").insert(summaryRows.slice(i, i + 50));
      }
    }

    // ════════════════════════════════════════════
    // PHASE 2b: Persist demand_baskets with satisfaction
    // ════════════════════════════════════════════
    const demandBasketRows: any[] = [];
    for (const [cityId, demands] of cityDemands) {
      const citySupply = cityGoodSupply.get(cityId) || new Map();
      
      for (const [basketKey, demandQty] of demands) {
        // Calculate satisfaction: how much of this basket's demand is met
        const relevantGoods = goods.filter(g => g.demand_basket === basketKey);
        let domesticSatisfaction = 0;
        for (const g of relevantGoods) {
          const supply = citySupply.get(g.key);
          if (supply) domesticSatisfaction += supply.quantity;
        }
        const satisfaction = demandQty > 0 ? Math.min(1.0, domesticSatisfaction / demandQty) : 1.0;
        const deficit = Math.max(0, demandQty - domesticSatisfaction);

        demandBasketRows.push({
          session_id,
          city_id: cityId,
          basket_key: basketKey,
          tier: DEMAND_BASKETS[basketKey]?.tier || 1,
          quantity_needed: Math.round(demandQty * 10) / 10,
          quantity_fulfilled: Math.round(domesticSatisfaction * 10) / 10,
          satisfaction_score: Math.round(satisfaction * 1000) / 1000,
          turn_number: turn_number || 1,
        });
      }
    }

    if (demandBasketRows.length > 0) {
      await sb.from("demand_baskets").delete().eq("session_id", session_id);
      for (let i = 0; i < demandBasketRows.length; i += 50) {
        await sb.from("demand_baskets").insert(demandBasketRows.slice(i, i + 50));
      }
    }

    // ════════════════════════════════════════════
    // PHASE 3: Compute trade pressure & create trade_flows
    // ════════════════════════════════════════════
    // Build adjacency for city-level connectivity
    const cityAdjacency = new Map<string, Set<string>>();
    for (const route of routes) {
      if (route.control_state === "blocked") continue;
      const nodeA = nodes.find(n => n.id === route.node_a);
      const nodeB = nodes.find(n => n.id === route.node_b);
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
        // Calculate current satisfaction from domestic supply
        const relevantGoods = goods.filter(g => g.demand_basket === basketKey);
        let domesticSatisfaction = 0;
        for (const g of relevantGoods) {
          const supply = citySupply.get(g.key);
          if (supply) domesticSatisfaction += supply.quantity;
        }

        const gap = demandQty - domesticSatisfaction;
        if (gap <= 0) continue; // Demand met domestically

        // Look for supply in neighboring cities
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

          // Compute trade pressure
          const basket = DEMAND_BASKETS[basketKey];
          const needPressure = gap / Math.max(1, demandQty);
          const tierPressure = basket ? (basket.tier >= 3 ? PRESSURE_WEIGHTS.prestige : PRESSURE_WEIGHTS.upgrade) : 0;
          const pressure = PRESSURE_WEIGHTS.need * needPressure + tierPressure * 0.5;

          if (pressure < 0.1) continue;

          const flowVolume = Math.min(gap, availableSurplus * 0.5); // Max 50% of surplus flows

          tradeFlows.push({
            session_id,
            source_city_id: neighborId,
            target_city_id: cityId,
            source_player: neighborCity.owner_player || "",
            target_player: city.owner_player || "",
            good_key: bestGoodKey,
            volume_per_turn: Math.round(flowVolume * 10) / 10,
            trade_pressure: Math.round(pressure * 100) / 100,
            effective_price: goodsMap.get(bestGoodKey)?.base_price_numeric || 1,
            price_band: goodsMap.get(bestGoodKey)?.base_price_numeric > 5 ? 1 : 0,
            status: pressure > 0.5 ? "active" : "trial",
            turn_created: turn_number || 1,
          });
        }
      }
    }

    // Persist trade_flows
    if (tradeFlows.length > 0) {
      // Remove old flows for this session (they're recomputed each turn)
      await sb.from("trade_flows").delete().eq("session_id", session_id);

      for (let i = 0; i < tradeFlows.length; i += 50) {
        await sb.from("trade_flows").insert(tradeFlows.slice(i, i + 50));
      }
    }

    // ════════════════════════════════════════════
    // PHASE 4: Compute per-player goods economy aggregates
    // ════════════════════════════════════════════
    const playerAggregates = new Map<string, {
      tax_market: number;
      tax_transit: number;
      tax_extraction: number;
      commercial_retention: number;
      commercial_capture: number;
      goods_production_total: number;
      goods_supply_total: number;
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
          // Extraction tax from raw goods
          if (good?.production_stage === "raw") {
            agg.tax_extraction += sv.quantity * (good.base_price_numeric || 1) * 0.05;
          }
        }
        agg.goods_production_total += totalSupply;
        agg.goods_supply_total += storableSupply;

        // Market tax = domestic trade value * market_level factor
        const marketFactor = 1 + (city.market_level || 0) * 0.1;
        agg.tax_market += totalSupply * 0.08 * marketFactor;
      }

      // Capture = export flows from this player's cities
      const exportFlows = tradeFlows.filter(f => f.source_city_id === city.id);
      for (const ef of exportFlows) {
        agg.commercial_capture += ef.volume_per_turn * (ef.effective_price || 1) * 0.1;
      }

      // Retention = fraction of demand met domestically
      const demands = cityDemands.get(city.id);
      if (demands && supply) {
        let totalDemand = 0;
        let totalDomestic = 0;
        for (const [bk, dq] of demands) {
          totalDemand += dq;
          const relevantGoods = goods.filter(g => g.demand_basket === bk);
          for (const g of relevantGoods) {
            const s = supply.get(g.key);
            if (s) totalDomestic += Math.min(s.quantity, dq);
          }
        }
        if (totalDemand > 0) {
          agg.commercial_retention += totalDomestic / totalDemand;
        }
      }
    }

    // Transit tax from trade flows passing through player's nodes
    for (const flow of tradeFlows) {
      // Simple: if flow passes between two different owners, intermediate nodes get transit tax
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

    // ── Update realm_resources with goods economy data ──
    for (const [player, agg] of playerAggregates) {
      const cityCount = cities.filter(c => c.owner_player === player).length;
      const avgRetention = cityCount > 0 ? agg.commercial_retention / cityCount : 0;

      await sb.from("realm_resources").update({
        tax_market: Math.round(agg.tax_market * 10) / 10,
        tax_transit: Math.round(agg.tax_transit * 10) / 10,
        tax_extraction: Math.round(agg.tax_extraction * 10) / 10,
        commercial_retention: Math.round(avgRetention * 1000) / 1000,
        commercial_capture: Math.round(agg.commercial_capture * 10) / 10,
      }).eq("session_id", session_id).eq("player_name", player);
    }

    return new Response(JSON.stringify({
      ok: true,
      inventories_computed: nodeInventories.length,
      market_summaries: summaryRows.length,
      trade_flows_created: tradeFlows.length,
      players_updated: playerAggregates.size,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("compute-trade-flows error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
