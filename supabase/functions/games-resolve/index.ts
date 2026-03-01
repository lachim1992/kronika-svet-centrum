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

          // Create gladiator record using student_id FK from participant
          try {
            const studentId = victim.participant.student_id;
            if (studentId) {
              const { data: linkedStudent } = await sb.from("academy_students")
                .select("id, academy_id").eq("id", studentId).maybeSingle();
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

    // ═══ HOST CITY ECONOMIC EFFECTS (BOOM / COLLAPSE) ═══
    if (festival.host_city_id) {
      const { data: hostCity } = await sb.from("cities")
        .select("id, name, owner_player, influence_score, city_stability, development_level, population_total, hosting_count, housing_capacity")
        .eq("id", festival.host_city_id).single();
      if (hostCity) {
        const preparedness = hostCity.development_level + hostCity.city_stability / 10;
        const isPrepared = preparedness >= 12;
        const hostingCount = hostCity.hosting_count || 0;

        let stabilityDelta = 0;
        let influenceDelta = 0;
        let hostNarrative = "";

        if (isPrepared) {
          // ═══ BOOM: city was ready ═══
          influenceDelta = 15 + hostingCount * 3;
          stabilityDelta = 5;
          hostNarrative = `Město ${hostCity.name} zvládlo pořadatelství skvěle — obchod vzkvétá, prestiž roste.`;
        } else {
          // ═══ COLLAPSE RISK: city was unprepared ═══
          const collapseRoll = Math.random();
          if (collapseRoll < 0.3) {
            stabilityDelta = -15;
            influenceDelta = 5; // still some prestige
            hostNarrative = `Město ${hostCity.name} se zhroutilo pod tíhou pořadatelství — nepokoje, přetížená infrastruktura!`;
            // Create incident
            await sb.from("games_incidents").insert({
              session_id, festival_id, incident_type: "riot", severity: "major",
              target_participant_id: null,
              description: `Masové nepokoje v ${hostCity.name} kvůli přetížení infrastruktury během her!`,
              turn_number: turn_number || festival.announced_turn,
              effects: { stability_loss: 15, host_collapse: true },
            });
          } else {
            stabilityDelta = -5;
            influenceDelta = 10;
            hostNarrative = `Město ${hostCity.name} ustálo tlak pořadatelství, ale infrastruktura utrpěla.`;
          }
        }

        await sb.from("cities").update({
          influence_score: hostCity.influence_score + influenceDelta,
          city_stability: Math.max(0, Math.min(100, hostCity.city_stability + stabilityDelta)),
        }).eq("id", festival.host_city_id);

        // ═══ LEGACY TITLES ═══
        const newHostingCount = hostingCount + 1; // already incremented in select-host, but check
        try {
          if (newHostingCount >= 3) {
            // "Kolébka her" — unique world status
            const { data: existingTrait } = await sb.from("entity_traits")
              .select("id").eq("session_id", session_id).eq("entity_type", "city")
              .eq("entity_id", hostCity.id).eq("trait_key", "cradle_of_games").maybeSingle();

            if (!existingTrait) {
              await sb.from("entity_traits").insert({
                session_id, entity_type: "city", entity_id: hostCity.id,
                trait_key: "cradle_of_games", trait_label: "Kolébka her",
                description: `${hostCity.name} hostilo Velké hry ${newHostingCount}× a získalo legendární status Kolébky her.`,
                intensity: newHostingCount * 25, source: "games",
              });
              await writeFeed("narration", `🏛️ ${hostCity.name} získává titul KOLÉBKA HER! ${newHostingCount}× hostitel Velkých her!`, 5);
            }
          } else if (newHostingCount >= 2) {
            const { data: existingTrait } = await sb.from("entity_traits")
              .select("id").eq("session_id", session_id).eq("entity_type", "city")
              .eq("entity_id", hostCity.id).eq("trait_key", "cultural_center_games").maybeSingle();

            if (!existingTrait) {
              await sb.from("entity_traits").insert({
                session_id, entity_type: "city", entity_id: hostCity.id,
                trait_key: "cultural_center_games", trait_label: "Kulturní centrum her",
                description: `${hostCity.name} je uznávaným kulturním centrem — ${newHostingCount}× hostitel Velkých her.`,
                intensity: newHostingCount * 15, source: "games",
              });
            }
          }
        } catch (_) { /* non-critical */ }

        // Add host narrative to feed
        await writeFeed("narration", hostNarrative, isPrepared ? 3 : 4);
      }
    }

    // ═══ BEST ATHLETE & MOST POPULAR ═══
    // Best athlete = most gold medals (total score as tiebreaker)
    const bestAthleteEntry = Object.entries(medalTally)
      .sort((a, b) => {
        if (b[1].gold !== a[1].gold) return b[1].gold - a[1].gold;
        return (b[1].silver * 10 + b[1].bronze) - (a[1].silver * 10 + a[1].bronze);
      })[0];

    // Most popular = highest crowd_popularity (computed from charisma + gold + drama moments)
    const popularityScores: { participant: any; score: number }[] = [];
    for (const p of participants) {
      const tally = medalTally[p.athlete_name];
      const goldCount = tally?.gold || 0;
      const crowdScore = p.charisma * 0.5 + goldCount * 20 + (p.traits?.includes("Charismatický") ? 15 : 0) + Math.random() * 10;
      popularityScores.push({ participant: p, score: crowdScore });
      // Update crowd_popularity on participant
      await sb.from("games_participants").update({ crowd_popularity: Math.round(crowdScore) }).eq("id", p.id);
    }
    popularityScores.sort((a, b) => b.score - a.score);
    const mostPopular = popularityScores[0];

    const bestAthleteParticipant = bestAthleteEntry
      ? participants.find(p => p.athlete_name === bestAthleteEntry[0])
      : null;

    // Save best_athlete_id and most_popular_id on festival
    const festivalUpdate: any = {};
    if (bestAthleteParticipant) festivalUpdate.best_athlete_id = bestAthleteParticipant.id;
    if (mostPopular) festivalUpdate.most_popular_id = mostPopular.participant.id;

    // Write ChroWiki entries for best athlete & most popular (only if they're different or both exist)
    const championsToWrite: { participantId: string; name: string; player: string; title: string; traitKey: string; bio: string }[] = [];

    if (bestAthleteParticipant && bestAthleteEntry) {
      championsToWrite.push({
        participantId: bestAthleteParticipant.id,
        name: bestAthleteEntry[0],
        player: bestAthleteEntry[1].player,
        title: "Nejlepší sportovec Her",
        traitKey: "best_athlete_of_games",
        bio: `Absolutní vítěz ${festival.name} s ${bestAthleteEntry[1].gold} zlatými medailemi. Jeho jméno bude navždy spojeno s těmito hrami.`,
      });
    }

    if (mostPopular && (!bestAthleteParticipant || mostPopular.participant.id !== bestAthleteParticipant.id)) {
      championsToWrite.push({
        participantId: mostPopular.participant.id,
        name: mostPopular.participant.athlete_name,
        player: mostPopular.participant.player_name,
        title: "Nejoblíbenější sportovec Her",
        traitKey: "most_popular_of_games",
        bio: `Favorit davu na ${festival.name}. Publikum ho/ji zbožňovalo — charisma a styl předčily samotné výsledky.`,
      });
    }

    for (const champ of championsToWrite) {
      try {
        // Create great_person if not already legend
        const existingP = participants.find(p => p.id === champ.participantId);
        let gpId = existingP?.great_person_id;

        if (!gpId) {
          const { data: gp } = await sb.from("great_persons").insert({
            session_id, name: champ.name, player_name: champ.player,
            person_type: "Hero", flavor_trait: champ.title,
            born_round: turn_number || 1, is_alive: true,
            city_id: existingP?.city_id, bio: champ.bio,
          }).select("id").single();
          if (gp) {
            gpId = gp.id;
            await sb.from("games_participants").update({ great_person_id: gp.id }).eq("id", champ.participantId);
          }
        }

        if (gpId) {
          await sb.from("entity_traits").insert({
            session_id, entity_type: "person", entity_id: gpId,
            trait_key: champ.traitKey, trait_label: champ.title,
            description: champ.bio, intensity: 80, source: "games",
          });

          // ChroWiki entry
          try {
            await sb.from("wiki_entries").insert({
              session_id, entity_type: "person", entity_id: gpId,
              entity_name: champ.name, owner_player: champ.player,
            });
          } catch (_) { /* may exist */ }
        }
      } catch (_) { /* non-critical */ }

      await writeFeed("narration", `🌟 ${champ.name} získává titul "${champ.title}"!`, 5);
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
    description += `### 🏅 Nejlepší sportovec\n${bestAthleteEntry?.[0] || "—"} (${bestAthleteEntry?.[1]?.gold || 0}× 🥇, ${bestAthleteEntry?.[1]?.silver || 0}× 🥈, ${bestAthleteEntry?.[1]?.bronze || 0}× 🥉)\n\n`;
    if (mostPopular) {
      description += `### 🌟 Nejoblíbenější sportovec\n${mostPopular.participant.athlete_name} (${mostPopular.participant.player_name}) — oblíbenost: ${Math.round(mostPopular.score)}\n\n`;
    }
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
- Nejlepší sportovec: ${bestAthleteEntry?.[0]} s ${bestAthleteEntry?.[1]?.gold} zlatými
- Nejoblíbenější: ${mostPopular?.participant?.athlete_name || "—"}
- Nejsilnější říše: ${topPlayer?.[0]}
- Legendy: ${legendNames.join(", ") || "žádné"}
- Mrtví: ${deadAthletes.map(d => d.athlete_name).join(", ") || "žádní"}
- Incidenty: ${incidents.map(i => i.description).join("; ") || "žádné"}
- Počet atletů: ${participants.length}`;

        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

    // Mark festival concluded with description + champion IDs
    await sb.from("games_festivals").update({
      status: "concluded",
      concluded_turn: turn_number || festival.announced_turn,
      effects_applied: true,
      description,
      ...festivalUpdate,
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
