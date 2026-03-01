import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * games-resolve: Resolve all disciplines for a festival.
 *
 * Performance = BaseStats(80%) + Infrastructure + CivMod + SmallVariance(5-15%)
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

    // Get festival
    const { data: festival } = await sb.from("games_festivals")
      .select("*").eq("id", festival_id).single();

    if (!festival) {
      return new Response(JSON.stringify({ error: "Festival nenalezen" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (festival.status === "concluded") {
      return new Response(JSON.stringify({ error: "Festival již skončil" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get participants
    const { data: participants } = await sb.from("games_participants")
      .select("*").eq("festival_id", festival_id);

    if (!participants || participants.length < 2) {
      return new Response(JSON.stringify({ error: "Nedostatek účastníků" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get disciplines
    const { data: disciplines } = await sb.from("games_disciplines").select("*");
    if (!disciplines) throw new Error("No disciplines found");

    // Get any active intrigues for this festival
    const { data: intrigues } = await sb.from("games_intrigues")
      .select("*").eq("festival_id", festival_id).eq("success", true);

    // Build intrigue effects map: participant_id -> modifier
    const intrigueEffects = new Map<string, number>();
    for (const ig of (intrigues || [])) {
      if (ig.target_participant_id) {
        const current = intrigueEffects.get(ig.target_participant_id) || 0;
        if (ig.action_type === "sabotage") intrigueEffects.set(ig.target_participant_id, current - 15);
        if (ig.action_type === "sponsor") intrigueEffects.set(ig.target_participant_id, current + 10);
        if (ig.action_type === "bribe") intrigueEffects.set(ig.target_participant_id, current + 5);
      }
    }

    // ═══════════════════════════════════════════
    // RESOLVE EACH DISCIPLINE
    // ═══════════════════════════════════════════
    const allResults: any[] = [];
    const medalTally: Record<string, { gold: number; silver: number; bronze: number; player: string }> = {};
    const incidents: any[] = [];

    for (const disc of disciplines) {
      // Calculate performance for each participant
      const performances: { participant: any; baseScore: number; bonus: number; variance: number; total: number }[] = [];

      for (const p of participants) {
        // Base score from stats (primary stat weights 60%, secondary 25%, average of rest 15%)
        const primaryVal = (p as any)[disc.primary_stat] || 50;
        const secondaryVal = disc.secondary_stat ? (p as any)[disc.secondary_stat] || 50 : 50;
        const allStats = [p.strength, p.endurance, p.agility, p.tactics, p.charisma];
        const avgStat = allStats.reduce((a, b) => a + b, 0) / allStats.length;

        const baseScore = primaryVal * 0.6 + secondaryVal * 0.25 + avgStat * 0.15;

        // Bonuses
        let bonus = 0;
        bonus += p.training_bonus * 0.5;
        bonus += p.city_infrastructure_bonus * 0.3;
        bonus += p.civ_modifier * 0.2;
        bonus += p.morale_modifier * 0.3;

        // Form modifier
        if (p.form === "peak") bonus += 8;
        if (p.form === "tired") bonus -= 5;
        if (p.form === "injured") bonus -= 15;

        // Trait modifiers
        if (p.traits.includes("Železný")) bonus += 5;
        if (p.traits.includes("Křehký")) bonus -= 3;
        if (p.traits.includes("Charismatický") && disc.category === "cultural") bonus += 8;
        if (p.traits.includes("Odvážný") && disc.category === "physical") bonus += 5;
        if (p.traits.includes("Stoický") && disc.category === "strategic") bonus += 6;

        // Intrigue effects
        bonus += intrigueEffects.get(p.id) || 0;

        // Drama variance: 5-15%
        const varianceRange = baseScore * 0.15;
        const variance = (Math.random() - 0.5) * 2 * varianceRange;

        const total = baseScore + bonus + variance;
        performances.push({ participant: p, baseScore, bonus, variance, total });
      }

      // Sort by total score descending
      performances.sort((a, b) => b.total - a.total);

      // Assign medals
      for (let i = 0; i < performances.length; i++) {
        const perf = performances[i];
        const medal = i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : null;

        await sb.from("games_results").insert({
          session_id,
          festival_id,
          discipline_id: disc.id,
          participant_id: perf.participant.id,
          base_score: Math.round(perf.baseScore * 100) / 100,
          bonus_score: Math.round(perf.bonus * 100) / 100,
          variance_score: Math.round(perf.variance * 100) / 100,
          total_score: Math.round(perf.total * 100) / 100,
          rank: i + 1,
          medal,
        });

        if (medal) {
          const key = perf.participant.athlete_name;
          if (!medalTally[key]) medalTally[key] = { gold: 0, silver: 0, bronze: 0, player: perf.participant.player_name };
          if (medal === "gold") medalTally[key].gold++;
          if (medal === "silver") medalTally[key].silver++;
          if (medal === "bronze") medalTally[key].bronze++;
        }

        allResults.push({
          discipline: disc.name,
          athlete: perf.participant.athlete_name,
          player: perf.participant.player_name,
          rank: i + 1,
          medal,
          total: Math.round(perf.total * 100) / 100,
        });
      }

      // Check for incident (5-15% chance, higher with tensions/intrigues)
      const incidentChance = 0.05 + (intrigues || []).length * 0.03 + festival.incident_chance;
      if (Math.random() < incidentChance) {
        const incidentTypes = ["injury", "bribery", "riot", "protest"];
        const incType = incidentTypes[Math.floor(Math.random() * incidentTypes.length)];
        const target = performances[Math.floor(Math.random() * Math.min(3, performances.length))];

        const incidentDescs: Record<string, string> = {
          injury: `${target.participant.athlete_name} utrpěl zranění během ${disc.name}!`,
          bribery: `Podezření z úplatkářství v disciplíně ${disc.name}!`,
          riot: `Nepokoje v hledišti během ${disc.name}!`,
          protest: `Náboženský protest narušil průběh ${disc.name}!`,
        };

        const incident = {
          session_id,
          festival_id,
          incident_type: incType,
          severity: Math.random() > 0.7 ? "major" : "minor",
          target_participant_id: target.participant.id,
          description: incidentDescs[incType],
          turn_number: turn_number || festival.announced_turn,
          effects: { discipline: disc.key, tension_increase: incType === "riot" ? 5 : 2 },
        };

        await sb.from("games_incidents").insert(incident);
        incidents.push(incident);

        // If injury, mark participant
        if (incType === "injury") {
          await sb.from("games_participants").update({ form: "injured" }).eq("id", target.participant.id);
        }
      }
    }

    // ═══════════════════════════════════════════
    // APPLY EFFECTS
    // ═══════════════════════════════════════════

    // Update medal counts on participants
    for (const p of participants) {
      const tally = medalTally[p.athlete_name];
      if (tally) {
        const totalMedals = tally.gold + tally.silver + tally.bronze;
        const isLegend = tally.gold >= 2;
        await sb.from("games_participants").update({
          total_medals: totalMedals,
          is_legend: isLegend,
        }).eq("id", p.id);

        // Legend → create great_person
        if (isLegend) {
          const { data: gp } = await sb.from("great_persons").insert({
            session_id,
            name: p.athlete_name,
            player_name: p.player_name,
            person_type: "Hero",
            title: "Hrdina Her",
            birth_year: -(turn_number || 1),
            is_alive: true,
            city_id: p.city_id,
            backstory: `Legendární atlet, vítěz ${tally.gold} zlatých medailí na Velkých hrách.`,
          }).select("id").single();

          if (gp) {
            await sb.from("games_participants").update({ great_person_id: gp.id }).eq("id", p.id);

            // Add entity trait
            await sb.from("entity_traits").insert({
              session_id,
              entity_type: "person",
              entity_id: gp.id,
              trait_key: "hero_of_games",
              trait_label: "Hrdina Her",
              description: `Vítěz ${tally.gold}× zlato na Velkých hrách v ${festival.name}.`,
              intensity: tally.gold * 20,
              source: "games",
            }).catch(() => {});
          }
        }
      }
    }

    // Prestige effects on cities
    const playerMedals: Record<string, number> = {};
    for (const [, tally] of Object.entries(medalTally)) {
      playerMedals[tally.player] = (playerMedals[tally.player] || 0) + tally.gold * 3 + tally.silver * 2 + tally.bronze;
    }

    for (const [playerName, medals] of Object.entries(playerMedals)) {
      // Boost influence on player's cities
      await sb.from("cities")
        .update({ influence_score: sb.rpc ? medals * 2 : 0 }) // Fallback
        .eq("session_id", session_id)
        .eq("owner_player", playerName);
      
      // Actually, just increment
      const { data: pCities } = await sb.from("cities")
        .select("id, influence_score").eq("session_id", session_id).eq("owner_player", playerName);
      for (const c of (pCities || [])) {
        await sb.from("cities").update({ influence_score: c.influence_score + medals * 2 }).eq("id", c.id);
      }
    }

    // Host city bonus
    if (festival.host_city_id) {
      const { data: hostCity } = await sb.from("cities")
        .select("id, influence_score, city_stability").eq("id", festival.host_city_id).single();
      if (hostCity) {
        await sb.from("cities").update({
          influence_score: hostCity.influence_score + 10,
          city_stability: Math.min(100, hostCity.city_stability + 5),
        }).eq("id", festival.host_city_id);
      }
    }

    // Mark festival concluded
    await sb.from("games_festivals").update({
      status: "concluded",
      concluded_turn: turn_number || festival.announced_turn,
      effects_applied: true,
    }).eq("id", festival_id);

    // Create conclusion event
    const topMedalist = Object.entries(medalTally).sort((a, b) => b[1].gold - a[1].gold)[0];
    const topPlayer = Object.entries(playerMedals).sort((a, b) => b[1] - a[1])[0];

    await sb.from("game_events").insert({
      session_id,
      event_type: "games_concluded",
      description: `Velké hry v ${festival.name} skončily! Největším hrdinou se stal ${topMedalist?.[0] || "neznámý"} (${topMedalist?.[1]?.gold || 0}× zlato). Nejúspěšnější říší: ${topPlayer?.[0] || "neznámá"}.`,
      player_name: festival.host_player,
      turn_number: turn_number || festival.announced_turn,
      confirmed: true,
      data: {
        festival_id,
        medal_tally: medalTally,
        player_medals: playerMedals,
        incidents_count: incidents.length,
        legends_created: Object.values(medalTally).filter(t => t.gold >= 2).length,
      },
    });

    return new Response(JSON.stringify({
      ok: true,
      results: allResults,
      medal_tally: medalTally,
      player_medals: playerMedals,
      incidents,
      legends: Object.entries(medalTally).filter(([, t]) => t.gold >= 2).map(([name]) => name),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("games-resolve error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
