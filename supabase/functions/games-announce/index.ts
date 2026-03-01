import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * games-announce: Announce Olympic Games or create a local festival.
 *
 * For Olympics (is_global=true):
 *   - Auto-selects host city based on cultural influence + prestige
 *   - Creates announcement event → nomination phase starts
 *   - Auto-generates athletes for each faction
 *
 * For Local festivals:
 *   - Player chooses city and festival type
 *   - Immediate effects (morale boost, resource cost)
 *
 * Input: { session_id, player_name, type: "olympic" | "local_*", city_id?, turn_number }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, player_name, type, city_id, turn_number } = await req.json();

    if (!session_id || !player_name || !type) {
      return new Response(JSON.stringify({ error: "session_id, player_name, type required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const currentTurn = turn_number || 1;
    const isGlobal = type === "olympic";

    // ═══════════════════════════════════════════
    // OLYMPIC GAMES → Start CANDIDACY phase
    // ═══════════════════════════════════════════
    if (isGlobal) {
      // Check if games already active
      const { data: activeGames } = await sb.from("games_festivals")
        .select("id").eq("session_id", session_id)
        .in("status", ["candidacy", "announced", "nomination", "qualifying", "finals"]);

      if (activeGames && activeGames.length > 0) {
        return new Response(JSON.stringify({ error: "Hry již probíhají", existing: activeGames[0].id }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create the festival in CANDIDACY phase — no host yet
      const { data: festival, error: festErr } = await sb.from("games_festivals").insert({
        session_id,
        festival_type: "olympic",
        name: `Velké hry — rok ${currentTurn}`,
        host_city_id: null,
        host_player: null,
        status: "candidacy",
        announced_turn: currentTurn,
        candidacy_deadline_turn: currentTurn + 1,
        is_global: true,
        prestige_pool: 50,
        host_selection_method: "candidacy",
      }).select("*").single();

      if (festErr) throw festErr;

      // Create game event
      await sb.from("game_events").insert({
        session_id,
        event_type: "games_candidacy_open",
        note: `Velké hry byly vyhlášeny! Města mohou podávat kandidatury na pořadatelství. Uzávěrka v roce ${currentTurn + 1}.`,
        player: player_name,
        turn_number: currentTurn,
        confirmed: true,
        reference: {
          festival_id: festival.id,
          candidacy_deadline: currentTurn + 1,
        },
      });

      return new Response(JSON.stringify({
        ok: true,
        festival,
        phase: "candidacy",
        deadline_turn: currentTurn + 1,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══════════════════════════════════════════
    // LOCAL FESTIVAL
    // ═══════════════════════════════════════════
    if (!city_id) {
      return new Response(JSON.stringify({ error: "city_id required for local festival" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify city ownership
    const { data: city } = await sb.from("cities")
      .select("id, name, owner_player, city_stability, population_total")
      .eq("id", city_id).eq("session_id", session_id).single();

    if (!city || city.owner_player !== player_name) {
      return new Response(JSON.stringify({ error: "Město nenalezeno nebo vám nepatří" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Festival costs
    const FESTIVAL_COSTS: Record<string, { gold: number; morale_boost: number; stability_boost: number }> = {
      local_gladiator: { gold: 30, morale_boost: 15, stability_boost: 5 },
      local_harvest: { gold: 15, morale_boost: 10, stability_boost: 8 },
      local_tournament: { gold: 25, morale_boost: 12, stability_boost: 3 },
      local_academic: { gold: 20, morale_boost: 8, stability_boost: 10 },
      local_religious: { gold: 10, morale_boost: 5, stability_boost: 15 },
    };

    const costs = FESTIVAL_COSTS[type] || FESTIVAL_COSTS.local_harvest;

    // Check gold
    const { data: res } = await sb.from("realm_resources")
      .select("gold_reserve").eq("session_id", session_id).eq("player_name", player_name).single();

    if (!res || res.gold_reserve < costs.gold) {
      return new Response(JSON.stringify({ error: `Nedostatek zlata. Potřeba: ${costs.gold}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduct gold
    await sb.from("realm_resources").update({
      gold_reserve: res.gold_reserve - costs.gold,
    }).eq("session_id", session_id).eq("player_name", player_name);

    // Apply morale + stability boost to city
    await sb.from("cities").update({
      city_stability: Math.min(100, city.city_stability + costs.stability_boost),
    }).eq("id", city_id);

    // Create festival record
    const festivalNames: Record<string, string> = {
      local_gladiator: `Gladiátorské hry v ${city.name}`,
      local_harvest: `Slavnosti sklizně v ${city.name}`,
      local_tournament: `Rytířský turnaj v ${city.name}`,
      local_academic: `Akademická soutěž v ${city.name}`,
      local_religious: `Náboženský festival v ${city.name}`,
    };

    const { data: festival } = await sb.from("games_festivals").insert({
      session_id,
      festival_type: type,
      name: festivalNames[type] || `Festival v ${city.name}`,
      host_city_id: city_id,
      host_player: player_name,
      status: "concluded",
      announced_turn: currentTurn,
      concluded_turn: currentTurn,
      is_global: false,
      total_investment_gold: costs.gold,
      effects_applied: true,
    }).select("*").single();

    // Create game event
    await sb.from("game_events").insert({
      session_id,
      event_type: "local_festival",
      note: `${festivalNames[type] || "Festival"} byl uspořádán. Stabilita města vzrostla o ${costs.stability_boost}.`,
      player: player_name,
      turn_number: currentTurn,
      confirmed: true,
      reference: {
        festival_id: festival?.id,
        city_name: city.name,
        type,
        gold_cost: costs.gold,
        stability_boost: costs.stability_boost,
        morale_boost: costs.morale_boost,
      },
    });

    return new Response(JSON.stringify({
      ok: true,
      festival,
      costs,
      city: city.name,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("games-announce error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
