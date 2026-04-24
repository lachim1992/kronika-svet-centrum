import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * games-select-host: Resolve the candidacy phase → select winner → advance to nomination.
 *
 * Picks the highest-scoring bid, applies economic effects to the host city,
 * generates athletes, and moves the festival to "nomination" status.
 *
 * Input: { session_id, festival_id, turn_number }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, festival_id, turn_number } = await req.json();

    if (!session_id || !festival_id) {
      return new Response(JSON.stringify({ error: "session_id, festival_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify festival is in candidacy
    const { data: festival } = await sb.from("games_festivals")
      .select("*").eq("id", festival_id).single();

    if (!festival || festival.status !== "candidacy") {
      return new Response(JSON.stringify({ error: "Festival není ve fázi kandidatury" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all bids
    const { data: bids } = await sb.from("games_bids")
      .select("*").eq("festival_id", festival_id).order("total_bid_score", { ascending: false });

    if (!bids || bids.length === 0) {
      // No bids → auto-select city with arena (fallback)
      const { data: cities } = await sb.from("cities")
        .select("id, name, owner_player, influence_score, development_level, city_stability, population_total, hosting_count")
        .eq("session_id", session_id).in("status", ["ok", "active"])
        .order("influence_score", { ascending: false });

      // Find first city with a completed arena
      let hostCity: any = null;
      for (const c of (cities || [])) {
        const { data: arena } = await sb.from("city_buildings")
          .select("id").eq("city_id", c.id).eq("session_id", session_id)
          .eq("status", "completed").eq("is_arena", true)
          .maybeSingle();
        if (arena) { hostCity = c; break; }
      }

      // Ultimate fallback: highest influence city even without arena
      if (!hostCity) hostCity = cities?.[0];

      if (!hostCity) {
        return new Response(JSON.stringify({ error: "Žádné město pro hostování" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await advanceToNomination(sb, festival, hostCity, session_id, turn_number);

      return new Response(JSON.stringify({
        ok: true,
        host: { city: hostCity.name, player: hostCity.owner_player },
        method: "auto_fallback",
        bids_count: 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Winner = highest bid score
    const winnerBid = bids[0];

    // Mark winner
    await sb.from("games_bids").update({ is_winner: true }).eq("id", winnerBid.id);

    // Get winner city
    const { data: hostCity } = await sb.from("cities")
      .select("id, name, owner_player, influence_score, development_level, city_stability, population_total, hosting_count")
      .eq("id", winnerBid.city_id).single();

    if (!hostCity) {
      return new Response(JSON.stringify({ error: "Vítězné město nenalezeno" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Increment hosting count
    await sb.from("cities").update({
      hosting_count: (hostCity.hosting_count || 0) + 1,
    }).eq("id", hostCity.id);

    // Advance to nomination
    await advanceToNomination(sb, festival, hostCity, session_id, turn_number);

    // Create game events
    await sb.from("game_events").insert({
      session_id,
      event_type: "olympic_host_selected",
      note: `${hostCity.name} bylo zvoleno hostitelem Velkých her! Skóre kandidatury: ${winnerBid.total_bid_score.toFixed(1)}. Soupeřilo ${bids.length} měst.`,
      player: hostCity.owner_player,
      turn_number: turn_number || festival.announced_turn,
      confirmed: true,
      reference: {
        festival_id,
        host_city: hostCity.name,
        host_player: hostCity.owner_player,
        winning_score: winnerBid.total_bid_score,
        bids_count: bids.length,
        all_candidates: bids.map(b => ({ player: b.player_name, score: b.total_bid_score })),
      },
    });

    return new Response(JSON.stringify({
      ok: true,
      host: { city: hostCity.name, player: hostCity.owner_player, score: winnerBid.total_bid_score },
      bids: bids.map(b => ({ player: b.player_name, score: b.total_bid_score, city_id: b.city_id })),
      method: "candidacy",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("games-select-host error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Advance festival from candidacy → nomination, set host.
 * Human players run their own national qualification via games-qualify.
 * AI factions get auto-generated athletes.
 */
async function advanceToNomination(
  sb: any,
  festival: any,
  hostCity: any,
  sessionId: string,
  turnNumber: number
) {
  const currentTurn = turnNumber || festival.announced_turn;

  // Update festival
  await sb.from("games_festivals").update({
    status: "nomination",
    host_city_id: hostCity.id,
    host_player: hostCity.owner_player,
    finals_turn: currentTurn + 3, // extra turn for qualification
    host_selection_method: "candidacy",
  }).eq("id", festival.id);

  // Get AI factions only — human players will use games-qualify
  const { data: aiFactions } = await sb.from("ai_factions")
    .select("faction_name").eq("session_id", sessionId).eq("is_active", true);

  const STAT_NAMES = ["strength", "endurance", "agility", "tactics", "charisma"];
  const athleteNames = [
    "Aethon", "Kallistos", "Lykaon", "Theron", "Nikias", "Demetrios", "Kassandros",
    "Herakleidos", "Agathos", "Philon", "Solon", "Kyros", "Andronikos", "Timotheos",
    "Ariston", "Leontios", "Xenophon", "Ptolemaios", "Diogenes", "Epikouros",
  ];
  let nameIdx = 0;

  for (const faction of (aiFactions || [])) {
    const factionName = faction.faction_name;

    // Try academy graduates first for AI factions too
    const { data: graduates } = await sb.from("academy_students")
      .select("*").eq("session_id", sessionId).eq("player_name", factionName)
      .eq("status", "graduated").order("strength", { ascending: false }).limit(3);

    const { data: fCities } = await sb.from("cities")
      .select("id, development_level").eq("session_id", sessionId).eq("owner_player", factionName).limit(1);

    const bestCity = fCities?.[0];
    const infraBonus = bestCity ? bestCity.development_level * 2 : 0;

    const { data: civId } = await sb.from("civ_identity")
      .select("morale_modifier").eq("session_id", sessionId).eq("player_name", factionName).maybeSingle();

    const civMod = civId?.morale_modifier || 0;

    if (graduates && graduates.length > 0) {
      for (const grad of graduates) {
        await sb.from("games_participants").insert({
          session_id: sessionId, festival_id: festival.id, player_name: factionName,
          city_id: bestCity?.id || null, athlete_name: grad.name,
          student_id: grad.id,
          strength: grad.strength, endurance: grad.endurance, agility: grad.agility,
          tactics: grad.tactics, charisma: grad.charisma,
          training_bonus: infraBonus + 10, city_infrastructure_bonus: infraBonus,
          civ_modifier: civMod * 10, traits: grad.traits || [], form: "peak",
          background: grad.bio,
        });
        await sb.from("academy_students").update({ status: "promoted" }).eq("id", grad.id);
      }
    } else {
      // Generate random athletes for AI factions without academies
      const count = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < count && nameIdx < athleteNames.length; i++) {
        const name = athleteNames[nameIdx++];
        const stats: Record<string, number> = {};
        const primary = STAT_NAMES[Math.floor(Math.random() * STAT_NAMES.length)];
        for (const s of STAT_NAMES) {
          stats[s] = 30 + Math.floor(Math.random() * 40) + (s === primary ? 15 : 0);
        }
        const allTraits = ["Železný", "Křehký", "Zbožný", "Nervózní", "Charismatický", "Lstivý", "Odvážný", "Stoický"];
        await sb.from("games_participants").insert({
          session_id: sessionId, festival_id: festival.id, player_name: factionName,
          city_id: bestCity?.id || null, athlete_name: name,
          strength: stats.strength, endurance: stats.endurance, agility: stats.agility,
          tactics: stats.tactics, charisma: stats.charisma,
          training_bonus: infraBonus, city_infrastructure_bonus: infraBonus,
          civ_modifier: civMod * 10, traits: [allTraits[Math.floor(Math.random() * allTraits.length)]],
          form: Math.random() > 0.8 ? "peak" : "normal",
        });
      }
    }
  }
}
