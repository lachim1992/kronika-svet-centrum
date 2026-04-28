// generate-neutral-nodes
// Deterministic placement of neutral world nodes (settlements, outposts, shrines, ruins)
// across unowned hexes. No AI involvement — uses _shared/worldNodeCatalog.ts.
//
// Pipeline (Patch 3):
//   1. Load province_hexes + cities + existing province_nodes for the session.
//   2. Build exclusion mask: city tiles + radius 2 around them + impassable biomes.
//   3. Pick `count` slots via seeded shuffle (count = clamp(floor(hexCount/8), 8, 20)).
//   4. For each slot: pick profile (biome match) + culture (biome+tone match), generate name.
//   5. Insert into province_nodes (is_neutral=true, discovered=false, controlled_by=null).
//   6. Insert into world_node_outputs (1 per outputBasket on profile).
//
// Failure is non-fatal for the bootstrap caller.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  CULTURES,
  PROFILES,
  pickProfileForBiome,
  pickCultureForBiome,
  generateNodeName,
  rangeFromSeed,
  seedHash,
} from "../_shared/worldNodeCatalog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const IMPASSABLE_BIOMES = new Set(["ocean", "deep_ocean", "glacier", "ice"]);

function hexKey(q: number, r: number) { return `${q},${r}`; }

// Axial hex distance
function hexDist(aq: number, ar: number, bq: number, br: number): number {
  const dq = aq - bq;
  const dr = ar - br;
  const ds = -dq - dr;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const session_id: string | undefined = body.session_id;
    const seed: string = body.seed || `seed:${session_id}`;
    const requestedCount: number | undefined = body.count;
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Load tone (best-effort) from worldgen_spec / world_premise
    let tone: string[] = [];
    try {
      const { data: spec } = await sb.from("worldgen_spec").select("tone, world_tone").eq("session_id", session_id).maybeSingle();
      const t = (spec as any)?.tone || (spec as any)?.world_tone;
      if (Array.isArray(t)) tone = t.map(String);
      else if (typeof t === "string") tone = [t];
    } catch (_) { /* optional */ }

    // Load hexes, existing nodes, cities
    const [hexRes, nodeRes, cityRes] = await Promise.all([
      sb.from("province_hexes").select("q, r, biome_family, is_passable, owner_player").eq("session_id", session_id),
      sb.from("province_nodes").select("hex_q, hex_r").eq("session_id", session_id),
      sb.from("cities").select("id, name, owner_player, province_id").eq("session_id", session_id),
    ]);
    if (hexRes.error) throw hexRes.error;

    const hexes = hexRes.data || [];
    const existingNodeHexes = new Set<string>((nodeRes.data || []).map((n: any) => hexKey(n.hex_q, n.hex_r)));
    const cities = cityRes.data || [];

    // City anchor positions: take first hex of each city's province
    const cityAnchors: Array<{ q: number; r: number }> = [];
    {
      const provIds = Array.from(new Set(cities.map((c: any) => c.province_id).filter(Boolean)));
      if (provIds.length > 0) {
        const { data: provHexes } = await sb
          .from("province_hexes")
          .select("q, r, province_id")
          .eq("session_id", session_id)
          .in("province_id", provIds as string[]);
        // Use one hex per province as anchor (centroid approx: first one)
        const seen = new Set<string>();
        for (const ph of provHexes || []) {
          const pid = (ph as any).province_id;
          if (seen.has(pid)) continue;
          seen.add(pid);
          cityAnchors.push({ q: (ph as any).q, r: (ph as any).r });
        }
      }
    }

    const isExcluded = (h: any) => {
      if (!h.is_passable) return true;
      if (IMPASSABLE_BIOMES.has(String(h.biome_family || "").toLowerCase())) return true;
      if (h.owner_player) return true;
      if (existingNodeHexes.has(hexKey(h.q, h.r))) return true;
      for (const a of cityAnchors) {
        if (hexDist(h.q, h.r, a.q, a.r) <= 2) return true;
      }
      return false;
    };

    const candidates = hexes.filter(isExcluded ? (h) => !isExcluded(h) : () => true);

    // Deterministic shuffle (Fisher–Yates with seeded RNG)
    const shuffled = [...candidates];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = seedHash(`${seed}:shuffle:${i}`) % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Density preset by map size (Node-Trade v1):
    //   small  (<400 hexes):   6% of hexes
    //   medium (400–1200):     5%
    //   large  (>1200):        4%
    // Floor at 12 nodes so even tiny worlds have a meaningful neutral fabric.
    const totalHexes = hexes.length;
    const density = totalHexes < 400 ? 0.06 : totalHexes <= 1200 ? 0.05 : 0.04;
    const computedCount = Math.max(12, Math.round(totalHexes * density));
    const targetCount = requestedCount ?? computedCount;
    const slots = shuffled.slice(0, Math.min(targetCount, shuffled.length));
    console.log(`[neutral-nodes] hexes=${totalHexes} density=${density} target=${targetCount} candidates=${candidates.length}`);

    // Build inserts
    const nodeInserts: any[] = [];
    const outputInserts: { idx: number; basket: string; good?: string; quantity: number; quality: number; exportable_ratio: number }[] = [];

    let idx = 0;
    for (const h of slots) {
      const nodeKey = `${session_id}:neutral:${h.q}:${h.r}:v1`;
      const profile = pickProfileForBiome(h.biome_family, nodeKey);
      const culture = pickCultureForBiome(h.biome_family, tone, nodeKey);
      const name = generateNodeName(culture, nodeKey);
      const population = rangeFromSeed(profile.populationRange, nodeKey + ":pop");
      const defense = rangeFromSeed(profile.defenseRange, nodeKey + ":def");
      const prosperity = rangeFromSeed(profile.prosperityRange, nodeKey + ":pros");
      const autonomy = rangeFromSeed(profile.autonomyRange, nodeKey + ":aut");

      nodeInserts.push({
        session_id,
        province_id: null,
        node_type: profile.nodeKind,
        node_subtype: profile.key,
        node_class: "neutral",
        node_tier: profile.nodeKind === "ruin" ? "micro" : "minor",
        name,
        hex_q: h.q,
        hex_r: h.r,
        controlled_by: null,
        is_major: false,
        is_active: true,
        is_neutral: true,
        discovered: false,
        culture_key: culture.key,
        profile_key: profile.key,
        autonomy_score: autonomy,
        population,
        defense_value: defense,
        economic_value: prosperity,
        strategic_value: prosperity,
        resource_output: profile.outputBaskets.reduce((acc, b) => {
          const k = b.good || b.basket;
          acc[k] = (acc[k] || 0) + b.quantity;
          return acc;
        }, {} as Record<string, number>),
        metadata: {
          biome: h.biome_family,
          culture_label: culture.label,
          profile_label: profile.label,
          settlement_tier: profile.settlementTier,
          generated_seed: nodeKey,
        },
      });

      profile.outputBaskets.forEach((b) =>
        outputInserts.push({
          idx,
          basket: b.basket,
          good: b.good,
          quantity: b.quantity,
          quality: b.quality ?? 1,
          exportable_ratio: b.exportable_ratio ?? 0.4,
        })
      );

      idx++;
    }

    if (nodeInserts.length === 0) {
      return new Response(JSON.stringify({ ok: true, inserted: 0, reason: "no candidate hexes" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: inserted, error: insErr } = await sb
      .from("province_nodes")
      .insert(nodeInserts)
      .select("id");
    if (insErr) throw insErr;

    const insertedIds = (inserted || []).map((n: any) => n.id);

    // Insert outputs (link via index → returned id)
    const outputRows = outputInserts
      .filter((o) => insertedIds[o.idx])
      .map((o) => ({
        session_id,
        node_id: insertedIds[o.idx],
        basket_key: o.basket,
        good_key: o.good ?? null,
        quantity: o.quantity,
        quality: o.quality,
        exportable_ratio: o.exportable_ratio,
      }));

    if (outputRows.length > 0) {
      const { error: outErr } = await sb.from("world_node_outputs").insert(outputRows);
      if (outErr) console.warn("world_node_outputs insert failed:", outErr.message);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        inserted: insertedIds.length,
        outputs: outputRows.length,
        candidate_pool: candidates.length,
        target_count: targetCount,
        cultures: CULTURES.length,
        profiles: PROFILES.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("generate-neutral-nodes error:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
