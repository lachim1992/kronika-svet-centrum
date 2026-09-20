// ─────────────────────────────────────────────────────────────────────────────
// compute-rural-population — PHASE B (shadow projection, admin/dev only)
//
// Writes the deterministic rural population / carrying capacity projection into
// hex_population. Nothing else. Explicitly OUT of the canonical turn pipeline:
//
//   • does NOT touch settlements, realm ledgers, gold, demand, trade, production
//   • does NOT advance the turn and is never called by commit-turn/refresh-economy
//   • fully idempotent: same world state ⇒ identical rows (upsert by session+q+r)
//   • no randomness anywhere in the derivation
//
// Phase C will read this pool for atomic founding and local migration.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ruralPopulationForWorld, type RuralCell } from "../_shared/ruralPopulation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = body.session_id || body.sessionId;
    const dryRun = body.dry_run === true;
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: session, error: sErr } = await sb
      .from("game_sessions").select("id, current_turn, world_seed").eq("id", sessionId).maybeSingle();
    if (sErr) throw new Error(`session load: ${sErr.message}`);
    if (!session) throw new Error("session not found");
    const turn = Number((session as any).current_turn ?? 0);
    const sessionSeed = String((session as any).world_seed ?? sessionId);

    // Page through all cells — worlds can exceed the 1000-row API cap.
    const cells: RuralCell[] = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      const { data, error } = await sb
        .from("province_hexes")
        .select("q, r, seed, is_passable, biome_family, moisture_band, temp_band, mean_height, forest_density, coastal, has_river, movement_cost, access_score")
        .eq("session_id", sessionId)
        .order("q", { ascending: true }).order("r", { ascending: true })
        .range(from, from + page - 1);
      if (error) throw new Error(`province_hexes load: ${error.message}`);
      if (!data || data.length === 0) break;
      cells.push(...(data as unknown as RuralCell[]));
      if (data.length < page) break;
    }

    const rows = ruralPopulationForWorld(sessionSeed, cells);
    const totals = rows.reduce(
      (a, r) => ({
        capacity: a.capacity + r.carrying_capacity,
        rural: a.rural + r.rural_population,
        mobile: a.mobile + r.mobile_population,
      }),
      { capacity: 0, rural: 0, mobile: 0 },
    );

    let written = 0;
    if (!dryRun) {
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map((r) => ({
          session_id: sessionId,
          q: r.q,
          r: r.r,
          carrying_capacity: r.carrying_capacity,
          rural_population: r.rural_population,
          mobile_population: r.mobile_population,
          last_resolved_turn: turn,
        }));
        const { error } = await sb.from("hex_population").upsert(chunk, { onConflict: "session_id,q,r" });
        if (error) throw new Error(`hex_population upsert: ${error.message}`);
        written += chunk.length;
      }
    }

    return new Response(JSON.stringify({
      ok: true, shadow: true, turn, cells: cells.length, rows: rows.length, written,
      totals,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("compute-rural-population error:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
