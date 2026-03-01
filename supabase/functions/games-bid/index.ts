import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * games-bid: Submit a city's candidacy bid for hosting the Olympics.
 *
 * Input: { session_id, player_name, festival_id, city_id, gold_invested, pitch_text }
 *
 * Calculates bid score from:
 *   - Cultural prestige (influence_score)
 *   - Infrastructure (development_level)
 *   - Stability (city_stability)
 *   - Gold investment (lobbying)
 *   - Historical legacy (hosting_count)
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, player_name, festival_id, city_id, gold_invested, pitch_text } = await req.json();

    if (!session_id || !player_name || !festival_id || !city_id) {
      return new Response(JSON.stringify({ error: "session_id, player_name, festival_id, city_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify festival is in candidacy phase
    const { data: festival } = await sb.from("games_festivals")
      .select("*").eq("id", festival_id).single();

    if (!festival || festival.status !== "candidacy") {
      return new Response(JSON.stringify({ error: "Festival není ve fázi kandidatury" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify city ownership
    const { data: city } = await sb.from("cities")
      .select("id, name, owner_player, influence_score, development_level, city_stability, population_total, hosting_count")
      .eq("id", city_id).eq("session_id", session_id).single();

    if (!city || city.owner_player !== player_name) {
      return new Response(JSON.stringify({ error: "Město nenalezeno nebo vám nepatří" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══ ARENA CHECK: City must have a completed Arena (is_arena flag) ═══
    const { data: arenaBuilding } = await sb.from("city_buildings")
      .select("id, name, current_level, status")
      .eq("city_id", city_id).eq("session_id", session_id)
      .eq("status", "completed")
      .eq("is_arena", true)
      .maybeSingle();

    if (!arenaBuilding) {
      return new Response(JSON.stringify({ error: "Město musí mít postavenou Arénu pro kandidaturu na pořadatelství her." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already bid for this festival
    const { data: existingBid } = await sb.from("games_bids")
      .select("id").eq("festival_id", festival_id).eq("player_name", player_name).maybeSingle();

    if (existingBid) {
      return new Response(JSON.stringify({ error: "Již jste podali kandidaturu" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check gold
    const investment = Math.max(0, Math.min(gold_invested || 0, 100));
    if (investment > 0) {
      const { data: res } = await sb.from("realm_resources")
        .select("gold_reserve").eq("session_id", session_id).eq("player_name", player_name).single();

      if (!res || res.gold_reserve < investment) {
        return new Response(JSON.stringify({ error: `Nedostatek zlata. Máte: ${res?.gold_reserve || 0}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Deduct gold
      await sb.from("realm_resources").update({
        gold_reserve: res.gold_reserve - investment,
      }).eq("session_id", session_id).eq("player_name", player_name);
    }

    // Calculate scores
    const culturalScore = city.influence_score * 2;
    const logisticsScore = city.development_level * 10 + city.city_stability;
    const lobbyBonus = investment * 0.5;
    const legacyBonus = city.hosting_count * 8; // Historical hosting bonus
    const popBonus = Math.log(city.population_total + 1) * 3;
    const totalBidScore = culturalScore + logisticsScore + lobbyBonus + legacyBonus + popBonus;

    // Insert bid
    const { data: bid, error: bidErr } = await sb.from("games_bids").insert({
      session_id,
      festival_id,
      player_name,
      city_id,
      gold_invested: investment,
      pitch_text: pitch_text || `${city.name} se uchází o pořadatelství Velkých her.`,
      cultural_score: culturalScore,
      logistics_score: logisticsScore,
      stability_score: city.city_stability,
      hosting_legacy_bonus: legacyBonus,
      total_bid_score: totalBidScore,
      is_winner: false,
    }).select("*").single();

    if (bidErr) throw bidErr;

    // Create game event
    await sb.from("game_events").insert({
      session_id,
      event_type: "olympic_candidacy",
      note: `${city.name} podalo kandidaturu na pořadatelství Velkých her. Investice: ${investment} zlata.`,
      player: player_name,
      turn_number: festival.announced_turn,
      confirmed: true,
      reference: { bid_id: bid.id, city_name: city.name, gold_invested: investment, total_score: totalBidScore },
    });

    return new Response(JSON.stringify({
      ok: true,
      bid,
      scores: { cultural: culturalScore, logistics: logisticsScore, lobby: lobbyBonus, legacy: legacyBonus, pop: popBonus, total: totalBidScore },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("games-bid error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
