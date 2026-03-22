import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NEIGHBORS = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
];
const hexKey = (q: number, r: number) => `${q},${r}`;
const axialDist = (q1: number, r1: number, q2: number, r2: number) => {
  const dq = q1 - q2, dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
};

/** Determine flow_role and regulation params based on node_type + topology */
function assignFlowRole(nodeType: string, metadata: Record<string, any>): {
  flow_role: string;
  is_major: boolean;
  throughput_military: number;
  toll_rate: number;
  resource_output: Record<string, number>;
} {
  switch (nodeType) {
    case "primary_city":
    case "secondary_city":
      return { flow_role: "hub", is_major: true, throughput_military: 1.0, toll_rate: 0, resource_output: {} };
    case "port":
      return { flow_role: "hub", is_major: true, throughput_military: 1.0, toll_rate: 0.05, resource_output: { wealth: 2 } };
    case "fortress":
      // Regulators: control military passage, extract tolls
      return { flow_role: "regulator", is_major: false, throughput_military: 0.8, toll_rate: 0.1, resource_output: {} };
    case "trade_hub":
      // Gateways at borders: facilitate trade but can impose tolls
      return { flow_role: "gateway", is_major: false, throughput_military: 1.0, toll_rate: 0.05, resource_output: { wealth: 1 } };
    case "pass":
      // Gateways between provinces: restrict military movement
      return { flow_role: "gateway", is_major: false, throughput_military: 0.7, toll_rate: 0.08, resource_output: {} };
    case "resource_node":
      // Producers: generate resources flowing to parent major node
      const resType = metadata?.resource_type;
      const clusterSize = metadata?.cluster_size || 5;
      const output: Record<string, number> = {};
      if (resType === "timber") {
        output.wood = Math.max(1, Math.floor(clusterSize * 0.3));
        output.grain = Math.max(1, Math.floor(clusterSize * 0.1));
      } else if (resType === "farmland") {
        output.grain = Math.max(2, Math.floor(clusterSize * 0.4));
        output.wood = 1;
      } else if (resType === "mineral") {
        output.stone = Math.max(1, Math.floor(clusterSize * 0.3));
        output.iron = Math.max(1, Math.floor(clusterSize * 0.15));
      } else {
        output.grain = 2;
        output.wood = 1;
      }
      return { flow_role: "producer", is_major: false, throughput_military: 1.0, toll_rate: 0, resource_output: output };
    case "village_cluster":
      return { flow_role: "producer", is_major: false, throughput_military: 1.0, toll_rate: 0, resource_output: { grain: 3, wood: 1 } };
    case "religious_center":
      return { flow_role: "hub", is_major: true, throughput_military: 1.0, toll_rate: 0, resource_output: { wealth: 1 } };
    case "logistic_hub":
      return { flow_role: "hub", is_major: true, throughput_military: 1.0, toll_rate: 0, resource_output: {} };
    default:
      return { flow_role: "neutral", is_major: false, throughput_military: 1.0, toll_rate: 0, resource_output: {} };
  }
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

    // Load provinces, hexes, cities, adjacency
    const [provRes, hexRes, cityRes, adjRes] = await Promise.all([
      sb.from("provinces").select("id, name, owner_player, center_q, center_r").eq("session_id", session_id),
      sb.from("province_hexes").select("id, q, r, province_id, biome_family, coastal, mean_height, is_passable, movement_cost").eq("session_id", session_id).limit(10000),
      sb.from("cities").select("id, name, province_id, province_q, province_r, is_capital, settlement_level, population_total").eq("session_id", session_id),
      sb.from("province_adjacency").select("province_a, province_b, border_length").eq("session_id", session_id),
    ]);

    const provinces = provRes.data || [];
    const allHexes = hexRes.data || [];
    const cities = cityRes.data || [];
    const adjacency = adjRes.data || [];

    // Index hexes by province
    const hexByProv: Record<string, typeof allHexes> = {};
    const hexByCoord: Record<string, typeof allHexes[0]> = {};
    for (const h of allHexes) {
      hexByCoord[hexKey(h.q, h.r)] = h;
      if (h.province_id) {
        if (!hexByProv[h.province_id]) hexByProv[h.province_id] = [];
        hexByProv[h.province_id].push(h);
      }
    }

    // Build border hex set per province
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

    // Delete old nodes
    await sb.from("province_nodes").delete().eq("session_id", session_id);

    // Province owner map
    const provOwner: Record<string, string> = {};
    for (const p of provinces) provOwner[p.id] = p.owner_player || "";

    const allNodes: any[] = [];

    for (const prov of provinces) {
      const pHexes = hexByProv[prov.id] || [];
      const pBorder = borderHexes[prov.id] || [];
      const cq = prov.center_q || 0;
      const cr = prov.center_r || 0;
      const owner = prov.owner_player || null;

      // Track major nodes for parent assignment
      const majorNodes: Array<{ tempIdx: number; hex_q: number; hex_r: number }> = [];

      // 1. PRIMARY_CITY
      const provCities = cities.filter(c => c.province_id === prov.id);
      const mainCity = provCities.sort((a, b) => (b.population_total || 0) - (a.population_total || 0))[0];
      if (mainCity) {
        const role = assignFlowRole("primary_city", {});
        const idx = allNodes.length;
        allNodes.push({
          session_id, province_id: prov.id, node_type: "primary_city",
          name: mainCity.name, hex_q: mainCity.province_q, hex_r: mainCity.province_r,
          city_id: mainCity.id, controlled_by: owner,
          strategic_value: 10, economic_value: 8, defense_value: 5,
          mobility_relevance: 7, supply_relevance: 9,
          population: mainCity.population_total || 0,
          metadata: { settlement_level: mainCity.settlement_level, population: mainCity.population_total },
          ...role,
        });
        majorNodes.push({ tempIdx: idx, hex_q: mainCity.province_q, hex_r: mainCity.province_r });
      }

      // 2. PORT
      const coastalHexes = pHexes.filter(h => h.coastal && h.is_passable);
      if (coastalHexes.length > 0) {
        const portHex = coastalHexes.sort((a, b) => axialDist(b.q, b.r, cq, cr) - axialDist(a.q, a.r, cq, cr))[0];
        const role = assignFlowRole("port", {});
        const idx = allNodes.length;
        allNodes.push({
          session_id, province_id: prov.id, node_type: "port",
          name: `Přístav ${prov.name}`, hex_q: portHex.q, hex_r: portHex.r,
          controlled_by: owner,
          strategic_value: 6, economic_value: 7, defense_value: 3,
          mobility_relevance: 9, supply_relevance: 8,
          metadata: { biome: portHex.biome_family },
          ...role,
        });
        majorNodes.push({ tempIdx: idx, hex_q: portHex.q, hex_r: portHex.r });
      }

      // 3. FORTRESS (minor regulator)
      const hillBorder = pBorder.filter(h => h.biome_family === "hills" || h.mean_height > 55);
      if (hillBorder.length > 0) {
        const fortHex = hillBorder.sort((a, b) => b.mean_height - a.mean_height)[0];
        const role = assignFlowRole("fortress", {});
        allNodes.push({
          session_id, province_id: prov.id, node_type: "fortress",
          name: `Pevnost ${prov.name}`, hex_q: fortHex.q, hex_r: fortHex.r,
          controlled_by: owner,
          strategic_value: 8, economic_value: 1, defense_value: 10,
          mobility_relevance: 3, supply_relevance: 4,
          fortification_level: 1,
          metadata: { elevation: fortHex.mean_height, biome: fortHex.biome_family },
          ...role,
        });
      }

      // 4. TRADE_HUB (minor gateway at border)
      if (pBorder.length > 0) {
        const hexProvCount: Record<string, Set<string>> = {};
        for (const h of pBorder) {
          const key = hexKey(h.q, h.r);
          if (!hexProvCount[key]) hexProvCount[key] = new Set();
          for (const [dq, dr] of NEIGHBORS) {
            const n = hexByCoord[hexKey(h.q + dq, h.r + dr)];
            if (n && n.province_id && n.province_id !== prov.id) {
              hexProvCount[key].add(n.province_id);
            }
          }
        }
        const best = Object.entries(hexProvCount)
          .sort((a, b) => b[1].size - a[1].size)[0];
        if (best && best[1].size > 0) {
          const [bq, br] = best[0].split(",").map(Number);
          const role = assignFlowRole("trade_hub", {});
          allNodes.push({
            session_id, province_id: prov.id, node_type: "trade_hub",
            name: `Tržiště ${prov.name}`, hex_q: bq, hex_r: br,
            controlled_by: owner,
            strategic_value: 4, economic_value: 9, defense_value: 2,
            mobility_relevance: 8, supply_relevance: 7,
            metadata: { adjacent_provinces: best[1].size },
            ...role,
          });
        }
      }

      // 5. RESOURCE_NODE (minor producer)
      const forests = pHexes.filter(h => h.biome_family === "forest" && h.is_passable);
      const plains = pHexes.filter(h => h.biome_family === "plains" && h.is_passable);
      const hills = pHexes.filter(h => h.biome_family === "hills" && h.is_passable);

      // Create resource nodes for each significant cluster
      const resourceClusters: Array<{ hexes: typeof pHexes; type: string; name: string }> = [];
      if (forests.length >= 3) resourceClusters.push({ hexes: forests, type: "timber", name: `Hvozd ${prov.name}` });
      if (plains.length >= 3) resourceClusters.push({ hexes: plains, type: "farmland", name: `Pole ${prov.name}` });
      if (hills.length >= 5) resourceClusters.push({ hexes: hills, type: "mineral", name: `Lom ${prov.name}` });

      // If no clusters, use any available
      if (resourceClusters.length === 0 && pHexes.length > 0) {
        const resPool = forests.length > 0 ? forests : plains.length > 0 ? plains : pHexes;
        resourceClusters.push({
          hexes: resPool,
          type: forests.length > 0 ? "timber" : "farmland",
          name: forests.length > 0 ? `Hvozd ${prov.name}` : `Pole ${prov.name}`,
        });
      }

      for (const cluster of resourceClusters) {
        const avgQ = Math.round(cluster.hexes.reduce((s, h) => s + h.q, 0) / cluster.hexes.length);
        const avgR = Math.round(cluster.hexes.reduce((s, h) => s + h.r, 0) / cluster.hexes.length);
        const resHex = cluster.hexes.sort((a, b) => axialDist(a.q, a.r, avgQ, avgR) - axialDist(b.q, b.r, avgQ, avgR))[0];
        const meta = { resource_type: cluster.type, cluster_size: cluster.hexes.length };
        const role = assignFlowRole("resource_node", meta);
        allNodes.push({
          session_id, province_id: prov.id, node_type: "resource_node",
          name: cluster.name, hex_q: resHex.q, hex_r: resHex.r,
          controlled_by: owner,
          strategic_value: 2, economic_value: 6, defense_value: 1,
          mobility_relevance: 4, supply_relevance: 6,
          metadata: meta,
          ...role,
        });
      }

      // 6. PASS (minor gateway between provinces)
      const provAdj = adjacency.filter(a => a.province_a === prov.id || a.province_b === prov.id);
      if (provAdj.length > 0) {
        const narrowest = provAdj.sort((a, b) => a.border_length - b.border_length)[0];
        const otherProv = narrowest.province_a === prov.id ? narrowest.province_b : narrowest.province_a;
        const passHexes = pBorder.filter(h => {
          for (const [dq, dr] of NEIGHBORS) {
            const n = hexByCoord[hexKey(h.q + dq, h.r + dr)];
            if (n && n.province_id === otherProv) return true;
          }
          return false;
        });
        if (passHexes.length > 0) {
          const passHex = passHexes.sort((a, b) => b.movement_cost - a.movement_cost)[0];
          const role = assignFlowRole("pass", {});
          allNodes.push({
            session_id, province_id: prov.id, node_type: "pass",
            name: `Průsmyk ${prov.name}`, hex_q: passHex.q, hex_r: passHex.r,
            controlled_by: owner,
            strategic_value: 7, economic_value: 2, defense_value: 6,
            mobility_relevance: 10, supply_relevance: 5,
            metadata: { connects_to: otherProv, movement_cost: passHex.movement_cost },
            ...role,
          });
        }
      }

      // Assign parent_node_id for minor nodes → nearest major node in this province
      if (majorNodes.length > 0) {
        for (let i = 0; i < allNodes.length; i++) {
          const n = allNodes[i];
          if (n.province_id !== prov.id || n.is_major) continue;
          // Find nearest major node
          let bestDist = Infinity;
          let bestMajorIdx = majorNodes[0].tempIdx;
          for (const mj of majorNodes) {
            const d = axialDist(n.hex_q, n.hex_r, mj.hex_q, mj.hex_r);
            if (d < bestDist) { bestDist = d; bestMajorIdx = mj.tempIdx; }
          }
          // Store temp reference (will be resolved after insert)
          n._parentTempIdx = bestMajorIdx;
        }
      }
    }

    // Batch insert and collect IDs
    const insertedIds: string[] = [];
    const BATCH = 50;
    for (let i = 0; i < allNodes.length; i += BATCH) {
      const batch = allNodes.slice(i, i + BATCH).map(n => {
        const { _parentTempIdx, ...rest } = n;
        return rest;
      });
      const { data: inserted } = await sb.from("province_nodes").insert(batch).select("id");
      if (inserted) {
        for (const row of inserted) insertedIds.push(row.id);
      }
    }

    // Update parent_node_id for minor nodes
    const parentUpdates: Array<{ id: string; parent_node_id: string }> = [];
    for (let i = 0; i < allNodes.length; i++) {
      const n = allNodes[i];
      if (n._parentTempIdx !== undefined && insertedIds[i] && insertedIds[n._parentTempIdx]) {
        parentUpdates.push({ id: insertedIds[i], parent_node_id: insertedIds[n._parentTempIdx] });
      }
    }

    for (const upd of parentUpdates) {
      await sb.from("province_nodes").update({ parent_node_id: upd.parent_node_id }).eq("id", upd.id);
    }

    return new Response(JSON.stringify({
      ok: true,
      nodes_created: allNodes.length,
      parent_links: parentUpdates.length,
      by_type: allNodes.reduce((acc, n) => { acc[n.node_type] = (acc[n.node_type] || 0) + 1; return acc; }, {} as Record<string, number>),
      by_role: allNodes.reduce((acc, n) => { acc[n.flow_role] = (acc[n.flow_role] || 0) + 1; return acc; }, {} as Record<string, number>),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("compute-province-nodes error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
