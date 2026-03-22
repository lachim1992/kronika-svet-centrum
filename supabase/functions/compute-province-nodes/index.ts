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

    const allNodes: any[] = [];

    for (const prov of provinces) {
      const pHexes = hexByProv[prov.id] || [];
      const pBorder = borderHexes[prov.id] || [];
      const cq = prov.center_q || 0;
      const cr = prov.center_r || 0;

      // 1. PRIMARY_CITY — from existing city
      const provCities = cities.filter(c => c.province_id === prov.id);
      const mainCity = provCities.sort((a, b) => (b.population_total || 0) - (a.population_total || 0))[0];
      if (mainCity) {
        allNodes.push({
          session_id, province_id: prov.id, node_type: "primary_city",
          name: mainCity.name, hex_q: mainCity.province_q, hex_r: mainCity.province_r,
          city_id: mainCity.id,
          strategic_value: 10, economic_value: 8, defense_value: 5,
          mobility_relevance: 7, supply_relevance: 9,
          is_major: true, population: mainCity.population_total || 0,
          metadata: { settlement_level: mainCity.settlement_level, population: mainCity.population_total },
        });
      }

      // 2. PORT — coastal hex farthest from center
      const coastalHexes = pHexes.filter(h => h.coastal && h.is_passable);
      if (coastalHexes.length > 0) {
        const portHex = coastalHexes.sort((a, b) => axialDist(b.q, b.r, cq, cr) - axialDist(a.q, a.r, cq, cr))[0];
        allNodes.push({
          session_id, province_id: prov.id, node_type: "port",
          name: `Přístav ${prov.name}`, hex_q: portHex.q, hex_r: portHex.r,
          strategic_value: 6, economic_value: 7, defense_value: 3,
          mobility_relevance: 9, supply_relevance: 8,
          is_major: true,
          metadata: { biome: portHex.biome_family },
        });
      }

      // 3. FORTRESS — hills/high-elevation hex closest to border
      const hillBorder = pBorder.filter(h => h.biome_family === "hills" || h.mean_height > 55);
      if (hillBorder.length > 0) {
        const fortHex = hillBorder.sort((a, b) => b.mean_height - a.mean_height)[0];
        allNodes.push({
          session_id, province_id: prov.id, node_type: "fortress",
          name: `Pevnost ${prov.name}`, hex_q: fortHex.q, hex_r: fortHex.r,
          strategic_value: 8, economic_value: 1, defense_value: 10,
          mobility_relevance: 3, supply_relevance: 4,
          is_major: true, fortification_level: 1,
          metadata: { elevation: fortHex.mean_height, biome: fortHex.biome_family },
        });
      }

      // 4. TRADE_HUB — border hex with most neighboring provinces
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
          allNodes.push({
            session_id, province_id: prov.id, node_type: "trade_hub",
            name: `Tržiště ${prov.name}`, hex_q: bq, hex_r: br,
            strategic_value: 4, economic_value: 9, defense_value: 2,
            mobility_relevance: 8, supply_relevance: 7,
            is_major: true,
            metadata: { adjacent_provinces: best[1].size },
          });
        }
      }

      // 5. RESOURCE_NODE — forest cluster (timber) or plains cluster (farmland)
      const forests = pHexes.filter(h => h.biome_family === "forest" && h.is_passable);
      const plains = pHexes.filter(h => h.biome_family === "plains" && h.is_passable);
      const resPool = forests.length >= 3 ? forests : plains;
      if (resPool.length > 0) {
        // Pick centroid of resource cluster
        const avgQ = Math.round(resPool.reduce((s, h) => s + h.q, 0) / resPool.length);
        const avgR = Math.round(resPool.reduce((s, h) => s + h.r, 0) / resPool.length);
        // Snap to nearest actual hex in pool
        const resHex = resPool.sort((a, b) => axialDist(a.q, a.r, avgQ, avgR) - axialDist(b.q, b.r, avgQ, avgR))[0];
        allNodes.push({
          session_id, province_id: prov.id, node_type: "resource_node",
          name: forests.length >= 3 ? `Hvozd ${prov.name}` : `Pole ${prov.name}`,
          hex_q: resHex.q, hex_r: resHex.r,
          strategic_value: 2, economic_value: 6, defense_value: 1,
          mobility_relevance: 4, supply_relevance: 6,
          metadata: { resource_type: forests.length >= 3 ? "timber" : "farmland", cluster_size: resPool.length },
        });
      }

      // 6. PASS — narrowest border between two adjacent provinces
      const provAdj = adjacency.filter(a => a.province_a === prov.id || a.province_b === prov.id);
      if (provAdj.length > 0) {
        const narrowest = provAdj.sort((a, b) => a.border_length - b.border_length)[0];
        const otherProv = narrowest.province_a === prov.id ? narrowest.province_b : narrowest.province_a;
        // Find border hex between these two provinces
        const passHexes = pBorder.filter(h => {
          for (const [dq, dr] of NEIGHBORS) {
            const n = hexByCoord[hexKey(h.q + dq, h.r + dr)];
            if (n && n.province_id === otherProv) return true;
          }
          return false;
        });
        if (passHexes.length > 0) {
          // Pick the one with highest movement cost (natural chokepoint)
          const passHex = passHexes.sort((a, b) => b.movement_cost - a.movement_cost)[0];
          allNodes.push({
            session_id, province_id: prov.id, node_type: "pass",
            name: `Průsmyk ${prov.name}`, hex_q: passHex.q, hex_r: passHex.r,
            strategic_value: 7, economic_value: 2, defense_value: 6,
            mobility_relevance: 10, supply_relevance: 5,
            metadata: { connects_to: otherProv, movement_cost: passHex.movement_cost },
          });
        }
      }
    }

    // Batch insert
    const BATCH = 50;
    for (let i = 0; i < allNodes.length; i += BATCH) {
      await sb.from("province_nodes").insert(allNodes.slice(i, i + BATCH));
    }

    return new Response(JSON.stringify({
      ok: true,
      nodes_created: allNodes.length,
      by_type: allNodes.reduce((acc, n) => { acc[n.node_type] = (acc[n.node_type] || 0) + 1; return acc; }, {} as Record<string, number>),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("compute-province-nodes error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
