import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const NEIGHBORS = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
];

const hexKey = (q: number, r: number) => `${q},${r}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { session_id } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Load all provinces for session
    const { data: provinces } = await sb
      .from("provinces")
      .select("id, name, owner_player, center_q, center_r, color_index")
      .eq("session_id", session_id);

    if (!provinces || provinces.length === 0) {
      return new Response(JSON.stringify({ error: "No provinces found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Load all hexes for session
    const { data: allHexes } = await sb
      .from("province_hexes")
      .select("id, q, r, province_id, biome_family, mean_height, coastal, is_passable, movement_cost, owner_player")
      .eq("session_id", session_id)
      .limit(10000);

    if (!allHexes || allHexes.length === 0) {
      return new Response(JSON.stringify({ error: "No hexes found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build spatial index
    const hexByCoord: Record<string, typeof allHexes[0]> = {};
    for (const h of allHexes) {
      hexByCoord[hexKey(h.q, h.r)] = h;
    }

    // 3. Assign unassigned hexes to nearest province (by center_q/r distance)
    const unassigned = allHexes.filter(h => !h.province_id);
    const assignments: { id: string; province_id: string }[] = [];

    for (const hex of unassigned) {
      if (!hex.is_passable) continue; // skip sea/mountains for province assignment

      let bestProv: string | null = null;
      let bestDist = Infinity;
      for (const p of provinces) {
        const dq = hex.q - (p.center_q || 0);
        const dr = hex.r - (p.center_r || 0);
        const dist = Math.sqrt(dq * dq + dr * dr + dq * dr); // axial distance approx
        if (dist < bestDist) {
          bestDist = dist;
          bestProv = p.id;
        }
      }
      if (bestProv) {
        assignments.push({ id: hex.id, province_id: bestProv });
        hex.province_id = bestProv; // update in-memory
      }
    }

    // Batch update assignments
    const BATCH = 100;
    for (let i = 0; i < assignments.length; i += BATCH) {
      const batch = assignments.slice(i, i + BATCH);
      for (const a of batch) {
        await sb.from("province_hexes").update({ province_id: a.province_id }).eq("id", a.id);
      }
    }

    // 4. Compute per-province metadata
    const provHexes: Record<string, typeof allHexes> = {};
    for (const h of allHexes) {
      if (!h.province_id) continue;
      if (!provHexes[h.province_id]) provHexes[h.province_id] = [];
      provHexes[h.province_id].push(h);
    }

    for (const p of provinces) {
      const pHexes = provHexes[p.id] || [];
      const hexCount = pHexes.length;

      // Terrain profile: biome distribution
      const biomeCounts: Record<string, number> = {};
      let coastalCount = 0;
      let totalHeight = 0;
      let riverCount = 0;
      for (const h of pHexes) {
        biomeCounts[h.biome_family] = (biomeCounts[h.biome_family] || 0) + 1;
        if (h.coastal) coastalCount++;
        totalHeight += h.mean_height;
      }
      const terrainProfile = {
        biome_distribution: biomeCounts,
        avg_elevation: hexCount > 0 ? Math.round(totalHeight / hexCount) : 0,
        coastal_hexes: coastalCount,
        dominant_biome: Object.entries(biomeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown",
      };

      // Economic profile: resource potential based on biomes
      const farmland = (biomeCounts["plains"] || 0) + (biomeCounts["hills"] || 0) * 0.5;
      const timber = (biomeCounts["forest"] || 0);
      const minerals = (biomeCounts["hills"] || 0) + (biomeCounts["mountains"] || 0);
      const economicProfile = {
        farmland_score: Math.round(farmland),
        timber_score: Math.round(timber),
        mineral_score: Math.round(minerals),
        trade_potential: coastalCount > 0 ? coastalCount * 2 : 0,
      };

      // Strategic value: size + diversity + coastal access + chokepoints
      const biomeTypes = Object.keys(biomeCounts).length;
      const strategicValue = hexCount + biomeTypes * 3 + coastalCount * 2;

      await sb.from("provinces").update({
        terrain_profile: terrainProfile,
        economic_profile: economicProfile,
        strategic_value: strategicValue,
        hex_count: hexCount,
        adjacency_computed_at: new Date().toISOString(),
      }).eq("id", p.id);
    }

    // 5. Compute adjacency graph from shared hex borders
    // Two provinces are adjacent if any hex in A neighbors any hex in B
    const adjacencyMap = new Map<string, { a: string; b: string; borderLen: number; borderBiomes: Record<string, number> }>();

    for (const hex of allHexes) {
      if (!hex.province_id) continue;
      for (const [dq, dr] of NEIGHBORS) {
        const nKey = hexKey(hex.q + dq, hex.r + dr);
        const neighbor = hexByCoord[nKey];
        if (!neighbor || !neighbor.province_id) continue;
        if (neighbor.province_id === hex.province_id) continue;

        // Canonical edge key (smaller UUID first)
        const [pa, pb] = hex.province_id < neighbor.province_id
          ? [hex.province_id, neighbor.province_id]
          : [neighbor.province_id, hex.province_id];
        const edgeKey = `${pa}|${pb}`;

        if (!adjacencyMap.has(edgeKey)) {
          adjacencyMap.set(edgeKey, { a: pa, b: pb, borderLen: 0, borderBiomes: {} });
        }
        const edge = adjacencyMap.get(edgeKey)!;
        edge.borderLen++;
        edge.borderBiomes[hex.biome_family] = (edge.borderBiomes[hex.biome_family] || 0) + 1;
      }
    }

    // Delete old adjacency for session, insert new
    await sb.from("province_adjacency").delete().eq("session_id", session_id);

    const adjRows = Array.from(adjacencyMap.values()).map(e => ({
      session_id,
      province_a: e.a,
      province_b: e.b,
      border_length: Math.ceil(e.borderLen / 2), // each border counted from both sides
      border_terrain: e.borderBiomes,
    }));

    if (adjRows.length > 0) {
      const ABATCH = 50;
      for (let i = 0; i < adjRows.length; i += ABATCH) {
        await sb.from("province_adjacency").insert(adjRows.slice(i, i + ABATCH));
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      provinces_count: provinces.length,
      hexes_total: allHexes.length,
      hexes_assigned: assignments.length,
      adjacency_edges: adjRows.length,
      province_stats: provinces.map(p => ({
        id: p.id,
        name: p.name,
        hex_count: (provHexes[p.id] || []).length,
      })),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("compute-province-graph error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
