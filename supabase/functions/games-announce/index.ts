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
    // OLYMPIC GAMES
    // ═══════════════════════════════════════════
    if (isGlobal) {
      // Check if games already active
      const { data: activeGames } = await sb.from("games_festivals")
        .select("id").eq("session_id", session_id)
        .in("status", ["announced", "nomination", "qualifying", "finals"]);

      if (activeGames && activeGames.length > 0) {
        return new Response(JSON.stringify({ error: "Hry již probíhají", existing: activeGames[0].id }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Select host city: highest influence_score + development_level
      const { data: cities } = await sb.from("cities")
        .select("id, name, owner_player, influence_score, development_level, city_stability, population_total")
        .eq("session_id", session_id)
        .in("status", ["ok", "active"])
        .order("influence_score", { ascending: false })
        .limit(5);

      if (!cities || cities.length === 0) {
        return new Response(JSON.stringify({ error: "Žádná aktivní města pro hostování" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Score top cities: influence + dev + stability + pop bonus
      const scored = cities.map(c => ({
        ...c,
        score: c.influence_score * 2 + c.development_level * 10 + c.city_stability + Math.log(c.population_total + 1) * 5,
      })).sort((a, b) => b.score - a.score);

      const hostCity = scored[0];

      // Create the festival
      const { data: festival, error: festErr } = await sb.from("games_festivals").insert({
        session_id,
        festival_type: "olympic",
        name: `Velké hry v ${hostCity.name}`,
        host_city_id: hostCity.id,
        host_player: hostCity.owner_player,
        status: "nomination",
        announced_turn: currentTurn,
        finals_turn: currentTurn + 2, // Finals in 2 turns
        is_global: true,
        prestige_pool: 50,
      }).select("*").single();

      if (festErr) throw festErr;

      // Get all factions (players + AI)
      const [{ data: players }, { data: aiFactions }] = await Promise.all([
        sb.from("game_players").select("player_name").eq("session_id", session_id),
        sb.from("ai_factions").select("faction_name").eq("session_id", session_id).eq("is_active", true),
      ]);

      const allFactions = [
        ...(players || []).map(p => p.player_name),
        ...(aiFactions || []).map(f => f.faction_name),
      ];

      // Get disciplines
      const { data: disciplines } = await sb.from("games_disciplines").select("*");

      // ═══ ACADEMY COEXISTENCE: Source athletes from academy graduates first ═══
      const athleteNamesFallback = [
        "Aethon", "Kallistos", "Lykaon", "Theron", "Nikias", "Demetrios", "Kassandros",
        "Herakleidos", "Agathos", "Philon", "Solon", "Kyros", "Andronikos", "Timotheos",
        "Ariston", "Leontios", "Xenophon", "Ptolemaios", "Diogenes", "Epikouros",
      ];

      const STAT_NAMES = ["strength", "endurance", "agility", "tactics", "charisma"];
      let nameIdx = 0;

      for (const factionName of allFactions) {
        // 1. Try to source from academy graduates
        const { data: graduates } = await sb.from("academy_students")
          .select("*")
          .eq("session_id", session_id).eq("player_name", factionName)
          .eq("status", "graduated")
          .order("strength", { ascending: false })
          .limit(3);

        // Get faction's cities for infrastructure bonus
        const { data: fCities } = await sb.from("cities")
          .select("id, name, development_level, settlement_level")
          .eq("session_id", session_id).eq("owner_player", factionName).limit(5);

        const bestCity = fCities?.[0];
        const infraBonus = bestCity ? bestCity.development_level * 2 : 0;

        // Get civ identity for modifiers
        const { data: civId } = await sb.from("civ_identity")
          .select("military_doctrine, society_structure, morale_modifier, stability_modifier")
          .eq("session_id", session_id).eq("player_name", factionName).maybeSingle();

        const civMod = civId?.morale_modifier || 0;

        if (graduates && graduates.length > 0) {
          // Use academy graduates — superior athletes
          for (const grad of graduates) {
            await sb.from("games_participants").insert({
              session_id,
              festival_id: festival.id,
              player_name: factionName,
              city_id: grad.academy_id ? bestCity?.id : null,
              athlete_name: grad.name,
              strength: grad.strength,
              endurance: grad.endurance,
              agility: grad.agility,
              tactics: grad.tactics,
              charisma: grad.charisma,
              training_bonus: infraBonus + 10, // Academy bonus
              city_infrastructure_bonus: infraBonus,
              civ_modifier: civMod * 10,
              traits: grad.traits || [],
              form: "peak", // Academy graduates are in peak form
            });

            // Mark student as promoted
            await sb.from("academy_students").update({
              status: "promoted",
              promoted_to_participant_id: null, // Will be linked after insert
            }).eq("id", grad.id);
          }
        } else {
          // 2. Fallback: auto-generate athletes (no academy)
          const athleteCount = 2 + Math.floor(Math.random() * 2);
          for (let i = 0; i < athleteCount && nameIdx < athleteNamesFallback.length; i++) {
            const name = athleteNamesFallback[nameIdx++];

            const stats: Record<string, number> = {};
            const primary = STAT_NAMES[Math.floor(Math.random() * STAT_NAMES.length)];
            for (const s of STAT_NAMES) {
              stats[s] = 30 + Math.floor(Math.random() * 40) + (s === primary ? 15 : 0);
            }

            const allTraits = ["Železný", "Křehký", "Zbožný", "Nervózní", "Charismatický", "Lstivý", "Odvážný", "Stoický"];
            const traits = [allTraits[Math.floor(Math.random() * allTraits.length)]];

            await sb.from("games_participants").insert({
              session_id,
              festival_id: festival.id,
              player_name: factionName,
              city_id: bestCity?.id || null,
              athlete_name: name,
              strength: stats.strength,
              endurance: stats.endurance,
              agility: stats.agility,
              tactics: stats.tactics,
              charisma: stats.charisma,
              training_bonus: infraBonus,
              city_infrastructure_bonus: infraBonus,
              civ_modifier: civMod * 10,
              traits,
              form: Math.random() > 0.8 ? "peak" : "normal",
            });
          }
        }
      }

      // Create game event
      await sb.from("game_events").insert({
        session_id,
        event_type: "games_announced",
        note: `Velké hry byly vyhlášeny v ${hostCity.name}! Všechny říše nominují své nejlepší atlety. Finále proběhne v roce ${currentTurn + 2}.`,
        player: hostCity.owner_player,
        turn_number: currentTurn,
        confirmed: true,
        reference: {
          festival_id: festival.id,
          host_city: hostCity.name,
          host_player: hostCity.owner_player,
          finals_turn: currentTurn + 2,
          factions_count: allFactions.length,
        },
      });

      return new Response(JSON.stringify({
        ok: true,
        festival,
        host: { city: hostCity.name, player: hostCity.owner_player },
        athletes_generated: nameIdx,
        candidates: scored.map(c => ({ name: c.name, score: c.score })),
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
