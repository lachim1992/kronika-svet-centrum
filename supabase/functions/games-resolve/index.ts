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

    // Check if results already exist (idempotency guard)
    const { count: existingResults } = await sb.from("games_results")
      .select("id", { count: "exact", head: true })
      .eq("festival_id", festival_id);
    if (existingResults && existingResults > 0) {
      return new Response(JSON.stringify({ error: "Hry již byly vyhodnoceny" }), {
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
    // RESOLVE EACH DISCIPLINE + GENERATE LIVE FEED
    // ═══════════════════════════════════════════
    const allResults: any[] = [];
    const medalTally: Record<string, { gold: number; silver: number; bronze: number; player: string }> = {};
    const incidents: any[] = [];
    let feedSeq = 0;

    // Helper to write live feed entry
    const writeFeed = async (type: string, text: string, drama: number = 1, discId?: string, partId?: string, roll?: number) => {
      feedSeq++;
      await sb.from("games_live_feed").insert({
        session_id,
        festival_id,
        discipline_id: discId || null,
        sequence_num: feedSeq,
        feed_type: type,
        text,
        participant_id: partId || null,
        roll_value: roll || null,
        drama_level: drama,
      });
    };

    // Opening narration
    await writeFeed("narration", `🏟️ ${festival.name} začínají! Tribuny se plní, napětí stoupá. Atleti ze všech říší se shromáždili v aréně.`, 3);

    for (const disc of disciplines) {
      // Discipline start
      await writeFeed("discipline_start", `${disc.icon_emoji} ${disc.name}`, 2, disc.id);

      // Calculate performance for each participant
      const performances: { participant: any; baseScore: number; bonus: number; variance: number; total: number }[] = [];

      for (const p of participants) {
        const primaryVal = (p as any)[disc.primary_stat] || 50;
        const secondaryVal = disc.secondary_stat ? (p as any)[disc.secondary_stat] || 50 : 50;
        const allStats = [p.strength, p.endurance, p.agility, p.tactics, p.charisma];
        const avgStat = allStats.reduce((a: number, b: number) => a + b, 0) / allStats.length;

        const baseScore = primaryVal * 0.6 + secondaryVal * 0.25 + avgStat * 0.15;

        let bonus = 0;
        bonus += p.training_bonus * 0.5;
        bonus += p.city_infrastructure_bonus * 0.3;
        bonus += p.civ_modifier * 0.2;
        bonus += p.morale_modifier * 0.3;

        if (p.form === "peak") bonus += 8;
        if (p.form === "tired") bonus -= 5;
        if (p.form === "injured") bonus -= 15;

        if (p.traits.includes("Železný")) bonus += 5;
        if (p.traits.includes("Křehký")) bonus -= 3;
        if (p.traits.includes("Charismatický") && disc.category === "cultural") bonus += 8;
        if (p.traits.includes("Odvážný") && disc.category === "physical") bonus += 5;
        if (p.traits.includes("Stoický") && disc.category === "strategic") bonus += 6;

        bonus += intrigueEffects.get(p.id) || 0;

        const varianceRange = baseScore * 0.15;
        const variance = (Math.random() - 0.5) * 2 * varianceRange;

        const total = baseScore + bonus + variance;
        performances.push({ participant: p, baseScore, bonus, variance, total });
      }

      // Narrate the competition
      const sorted = [...performances].sort((a, b) => b.total - a.total);
      const leader = sorted[0];
      const challenger = sorted[1];
      
      // Opening tension
      await writeFeed("narration", `${leader.participant.athlete_name} z ${leader.participant.player_name} vyráží vpřed s odhodlaným výrazem. ${challenger.participant.athlete_name} je mu v patách!`, 2, disc.id);
      
      // Key roll moment
      const rollDiff = Math.abs(leader.total - challenger.total);
      const tension = rollDiff < 5 ? 5 : rollDiff < 10 ? 4 : rollDiff < 20 ? 3 : 2;
      await writeFeed("roll", `Hod výkonu: ${leader.participant.athlete_name} ${leader.total.toFixed(1)} vs ${challenger.participant.athlete_name} ${challenger.total.toFixed(1)}`, tension, disc.id, leader.participant.id, leader.total);

      // Drama moment
      if (rollDiff < 5) {
        await writeFeed("narration", `Neuvěřitelný souboj! Pouhé setiny dělí soupeře!`, 5, disc.id);
      } else if (rollDiff < 15) {
        await writeFeed("narration", `Těsné finále! ${challenger.participant.athlete_name} se nevzdává!`, 4, disc.id);
      }

      // Sort and assign medals
      performances.sort((a, b) => b.total - a.total);

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

      // Winner announcement
      const winner = performances[0];
      const medalEmoji = "🥇";
      await writeFeed("result", `${medalEmoji} ${winner.participant.athlete_name} (${winner.participant.player_name}) vítězí v ${disc.name}!`, 4, disc.id, winner.participant.id);

      // Check for incident
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

        // Live feed incident
        await writeFeed("incident", incidentDescs[incType], 4, disc.id, target.participant.id);

        if (incType === "injury") {
          await sb.from("games_participants").update({ form: "injured" }).eq("id", target.participant.id);
        }
      }

      // Gladiator death check (for brutal festivals with combat)
      if (disc.category === "physical" && festival.festival_type === "local_gladiator") {
        const brutalityRoll = Math.random();
        if (brutalityRoll < 0.08) { // 8% death chance in gladiator games
          const victim = performances[performances.length - 1]; // Weakest dies
          await writeFeed("gladiator_death", `${victim.participant.athlete_name} padl v aréně! Dav zuří!`, 5, disc.id, victim.participant.id);
          
          // Record death
          await sb.from("games_participants").update({ form: "dead" }).eq("id", victim.participant.id);

          // Try to create gladiator record — find linked academy student
          try {
            const { data: linkedStudent } = await sb.from("academy_students")
              .select("id, academy_id")
              .eq("session_id", session_id)
              .eq("name", victim.participant.athlete_name)
              .eq("player_name", victim.participant.player_name)
              .maybeSingle();

            if (linkedStudent) {
              await sb.from("gladiator_records").insert({
                session_id,
                student_id: linkedStudent.id,
                academy_id: linkedStudent.academy_id,
                status: "dead",
                died_turn: turn_number,
                cause_of_death: `Padl v gladiátorském klání v ${disc.name}`,
                fights: 1,
              });
            }
          } catch (_) { /* non-critical */ }
        }
      }
    }

    // Final narration
    await writeFeed("narration", `🏆 ${festival.name} se chýlí ke konci! Medailisté vystupují na stupně vítězů.`, 4);

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
            flavor_trait: "Hrdina Her",
            born_round: turn_number || 1,
            is_alive: true,
            city_id: p.city_id,
            bio: `Legendární atlet, vítěz ${tally.gold} zlatých medailí na Velkých hrách.`,
          }).select("id").single();

          if (gp) {
            await sb.from("games_participants").update({ great_person_id: gp.id }).eq("id", p.id);

            try {
              await sb.from("entity_traits").insert({
                session_id,
                entity_type: "person",
                entity_id: gp.id,
                trait_key: "hero_of_games",
                trait_label: "Hrdina Her",
                description: `Vítěz ${tally.gold}× zlato na Velkých hrách v ${festival.name}.`,
                intensity: tally.gold * 20,
                source: "games",
              });
            } catch (_) { /* non-critical */ }
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
      // Increment influence on player's cities
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

    // ═══ HYBRID NARRATIVE: Template + AI highlight ═══
    const topMedalist = Object.entries(medalTally).sort((a, b) => b[1].gold - a[1].gold)[0];
    const topPlayer = Object.entries(playerMedals).sort((a, b) => b[1] - a[1])[0];
    const legendNames = Object.entries(medalTally).filter(([, t]) => t.gold >= 2).map(([name]) => name);

    // Re-fetch participants to get updated form (dead athletes)
    const { data: updatedParts } = await sb.from("games_participants")
      .select("athlete_name, form, player_name").eq("festival_id", festival_id);
    const deadAthletes = (updatedParts || []).filter(p => p.form === "dead");

    // Build structured narrative template
    let description = `## ${festival.name}\n\n`;
    description += `**Hostitel:** ${festival.host_player}\n`;
    description += `**Účastníků:** ${participants.length} atletů\n`;
    description += `**Disciplín:** ${disciplines.length}\n\n`;
    description += `### 🏅 Nejúspěšnější atlet\n${topMedalist?.[0] || "—"} (${topMedalist?.[1]?.gold || 0}× 🥇, ${topMedalist?.[1]?.silver || 0}× 🥈, ${topMedalist?.[1]?.bronze || 0}× 🥉)\n\n`;
    description += `### 🏛 Nejúspěšnější říše\n${topPlayer?.[0] || "—"} (${topPlayer?.[1] || 0} medailí)\n\n`;
    if (legendNames.length > 0) {
      description += `### ⭐ Nové legendy\n${legendNames.join(", ")}\n\n`;
    }
    if (deadAthletes.length > 0) {
      description += `### 💀 Padlí v aréně\n${deadAthletes.map(d => `${d.athlete_name} (${d.player_name})`).join(", ")}\n\n`;
    }
    if (incidents.length > 0) {
      description += `### ⚠️ Incidenty\n${incidents.map(i => `- ${i.description}`).join("\n")}\n\n`;
    }

    // Generate short AI highlight (non-blocking)
    try {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (LOVABLE_API_KEY) {
        const highlightPrompt = `Jsi kronikář starověkého světa. Na základě těchto dat napiš JEDEN odstavec (max 3 věty) o nejdramatičtějším momentu her. Styl: epický, faktický.

Data:
- Hry: ${festival.name}
- Vítěz: ${topMedalist?.[0]} s ${topMedalist?.[1]?.gold} zlatými
- Nejsilnější říše: ${topPlayer?.[0]}
- Legendy: ${legendNames.join(", ") || "žádné"}
- Mrtví: ${deadAthletes.map(d => d.athlete_name).join(", ") || "žádní"}
- Incidenty: ${incidents.map(i => i.description).join("; ") || "žádné"}
- Počet atletů: ${participants.length}`;

        const aiResp = await fetch("https://ai.lovable.dev/api/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [{ role: "user", content: highlightPrompt }],
            max_tokens: 200,
          }),
        });
        if (aiResp.ok) {
          const aiData = await aiResp.json();
          const highlight = aiData.choices?.[0]?.message?.content?.trim();
          if (highlight) {
            description += `### ✨ Nejdramatičtější moment\n> ${highlight}\n`;
          }
        }
      }
    } catch (_) { /* AI highlight is optional */ }

    // Mark festival concluded with description
    await sb.from("games_festivals").update({
      status: "concluded",
      concluded_turn: turn_number || festival.announced_turn,
      effects_applied: true,
      description,
    }).eq("id", festival_id);

    // Create conclusion event
    await sb.from("game_events").insert({
      session_id,
      event_type: "games_concluded",
      note: `Velké hry v ${festival.name} skončily! Největším hrdinou se stal ${topMedalist?.[0] || "neznámý"} (${topMedalist?.[1]?.gold || 0}× zlato). Nejúspěšnější říší: ${topPlayer?.[0] || "neznámá"}.`,
      player: festival.host_player,
      turn_number: turn_number || festival.announced_turn,
      confirmed: true,
      reference: {
        festival_id,
        medal_tally: medalTally,
        player_medals: playerMedals,
        incidents_count: incidents.length,
        legends_created: legendNames.length,
      },
    });

    // ═══ CHRONICLE & WIKI INTEGRATION ═══
    try {
      let chronicleText = `**${festival.name} (rok ${turn_number || festival.announced_turn}):** `;
      chronicleText += `Velké hry skončily. Nejúspěšnějším atletem se stal ${topMedalist?.[0] || "neznámý"} s ${topMedalist?.[1]?.gold || 0} zlatými medailemi. `;
      if (legendNames.length > 0) {
        chronicleText += `Legendami her se stali: ${legendNames.join(", ")}. `;
      }
      if (deadAthletes.length > 0) {
        chronicleText += `V aréně zahynul${deadAthletes.length > 1 ? "i" : ""}: ${deadAthletes.map(d => d.athlete_name).join(", ")}. Truchlí celá říše. `;
      }
      if (incidents.length > 0) {
        chronicleText += `Hry poznamenalo ${incidents.length} incident${incidents.length > 1 ? "ů" : ""}.`;
      }

      await sb.from("chronicle_entries").insert({
        session_id,
        text: chronicleText,
        epoch_style: "kroniky",
        turn_from: turn_number || festival.announced_turn,
        turn_to: turn_number || festival.announced_turn,
        source_type: "system",
      });

      // Create wiki entries for new legends
      for (const legendName of legendNames) {
        const legendParticipant = participants.find(p => p.athlete_name === legendName);
        if (legendParticipant?.great_person_id) {
          try {
            await sb.from("wiki_entries").insert({
              session_id, entity_type: "person", entity_id: legendParticipant.great_person_id,
              entity_name: legendName, owner_player: legendParticipant.player_name,
            });
          } catch (_) { /* may already exist via trigger */ }
        }
      }
    } catch (_) { /* non-critical */ }

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
