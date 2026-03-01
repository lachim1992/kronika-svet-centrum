import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * games-resolve: Resolve all disciplines for a festival.
 * 3-phase per discipline: Qualification → Semifinal → Final
 * Performance = BaseStats(80%) + Infrastructure + CivMod + Variance
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

    const { data: festival } = await sb.from("games_festivals").select("*").eq("id", festival_id).single();
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

    const { count: existingResults } = await sb.from("games_results")
      .select("id", { count: "exact", head: true }).eq("festival_id", festival_id);
    if (existingResults && existingResults > 0) {
      return new Response(JSON.stringify({ error: "Hry již byly vyhodnoceny" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: participants } = await sb.from("games_participants").select("*").eq("festival_id", festival_id);
    if (!participants || participants.length < 2) {
      return new Response(JSON.stringify({ error: "Nedostatek účastníků" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: disciplines } = await sb.from("games_disciplines").select("*");
    if (!disciplines) throw new Error("No disciplines found");

    const { data: intrigues } = await sb.from("games_intrigues")
      .select("*").eq("festival_id", festival_id).eq("success", true);

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
    // RESOLVE EACH DISCIPLINE WITH 3 PHASES
    // ═══════════════════════════════════════════
    const allResults: any[] = [];
    const medalTally: Record<string, { gold: number; silver: number; bronze: number; player: string; participantId: string }> = {};
    const incidents: any[] = [];
    const revealScript: any[] = [];
    let feedSeq = 0;
    let revealSeq = 0;

    const writeFeed = async (type: string, text: string, drama: number = 1, discId?: string, partId?: string, roll?: number) => {
      feedSeq++;
      await sb.from("games_live_feed").insert({
        session_id, festival_id, discipline_id: discId || null,
        sequence_num: feedSeq, feed_type: type, text,
        participant_id: partId || null, roll_value: roll || null, drama_level: drama,
      });
    };

    const addReveal = (type: string, data: any, delayMs: number = 3000, drama: number = 2) => {
      revealSeq++;
      revealScript.push({ seq: revealSeq, type, delay_ms: delayMs, drama, ...data });
    };

    // Helper: compute score for a participant in a discipline
    function computeScore(p: any, disc: any, varianceFactor: number = 0.12): number {
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
      if (p.traits?.includes("Železný")) bonus += 5;
      if (p.traits?.includes("Křehký")) bonus -= 3;
      if (p.traits?.includes("Charismatický") && disc.category === "cultural") bonus += 8;
      if (p.traits?.includes("Odvážný") && disc.category === "physical") bonus += 5;
      if (p.traits?.includes("Stoický") && disc.category === "strategic") bonus += 6;
      bonus += intrigueEffects.get(p.id) || 0;

      const varianceRange = baseScore * varianceFactor;
      const variance = (Math.random() - 0.5) * 2 * varianceRange;
      return baseScore + bonus + variance;
    }

    // ═══ OPENING CEREMONY ═══
    addReveal("ceremony_open", {
      text: `🏟️ ${festival.name} začínají! Tribuny se plní diváky ze všech říší.`,
      athletes_count: participants.length,
      empires: [...new Set(participants.map((p: any) => p.player_name))],
    }, 4000, 3);
    await writeFeed("narration", `🏟️ ${festival.name} začínají! Atleti ze všech říší se shromáždili v aréně.`, 3);

    const runningMedals: Record<string, { gold: number; silver: number; bronze: number }> = {};

    for (const disc of disciplines) {
      await writeFeed("discipline_start", `${disc.icon_emoji} ${disc.name}`, 2, disc.id);

      // Discipline intro
      addReveal("disc_intro", {
        disc_key: disc.key, disc_name: disc.name, disc_emoji: disc.icon_emoji,
        text: `${disc.icon_emoji} ${disc.name} — soutěž začíná!`,
        athletes_count: participants.length,
      }, 3500, 2);

      // ═══ PHASE 1: QUALIFICATION ═══
      const qualScores = participants.map(p => ({
        participant: p, score: computeScore(p, disc, 0.15),
      }));
      qualScores.sort((a, b) => b.score - a.score);

      // Eliminate bottom ~40% (keep at least 4)
      const qualCutoff = Math.max(4, Math.ceil(qualScores.length * 0.6));
      const qualSurvivors = qualScores.slice(0, qualCutoff);
      const qualEliminated = qualScores.slice(qualCutoff);

      const qualStandings = qualScores.map((q, i) => ({
        id: q.participant.id, name: q.participant.athlete_name,
        player: q.participant.player_name, score: Math.round(q.score * 10) / 10,
        eliminated: i >= qualCutoff,
      }));

      addReveal("phase_update", {
        disc_key: disc.key, disc_name: disc.name,
        phase_label: "⚡ Kvalifikace — výsledky",
        standings: qualStandings,
        text: qualEliminated.length > 0
          ? `${qualEliminated.map(e => e.participant.athlete_name).join(", ")} vypadávají! Postupuje ${qualSurvivors.length} atletů.`
          : `Všichni postupují do semifinále!`,
      }, 4000, 3);

      await writeFeed("narration", `Kvalifikace v ${disc.name}: ${qualSurvivors.length} atletů postupuje, ${qualEliminated.length} vyřazeno.`, 2, disc.id);

      // ═══ PHASE 2: SEMIFINAL ═══
      const semiScores = qualSurvivors.map(q => ({
        participant: q.participant, score: computeScore(q.participant, disc, 0.10),
      }));
      semiScores.sort((a, b) => b.score - a.score);

      // Keep top 3 (or all if ≤3)
      const semiCutoff = Math.min(3, semiScores.length);
      const finalists = semiScores.slice(0, semiCutoff);
      const semiEliminated = semiScores.slice(semiCutoff);

      const semiStandings = semiScores.map((s, i) => ({
        id: s.participant.id, name: s.participant.athlete_name,
        player: s.participant.player_name, score: Math.round(s.score * 10) / 10,
        eliminated: i >= semiCutoff,
      }));

      addReveal("phase_update", {
        disc_key: disc.key, disc_name: disc.name,
        phase_label: "🔥 Semifinále — výsledky",
        standings: semiStandings,
        text: semiEliminated.length > 0
          ? `${semiEliminated.map(e => e.participant.athlete_name).join(", ")} končí! Do finále postupují: ${finalists.map(f => f.participant.athlete_name).join(", ")}.`
          : `Všichni postupují do finále!`,
      }, 4000, 3);

      await writeFeed("narration", `Semifinále ${disc.name}: Do finále postupují ${finalists.map(f => f.participant.athlete_name).join(", ")}.`, 3, disc.id);

      // ═══ PHASE 3: FINAL ═══
      const finalScores = finalists.map(f => ({
        participant: f.participant, score: computeScore(f.participant, disc, 0.08),
      }));
      finalScores.sort((a, b) => b.score - a.score);

      const leader = finalScores[0];
      const challenger = finalScores.length > 1 ? finalScores[1] : null;
      const rollDiff = challenger ? Math.abs(leader.score - challenger.score) : 30;
      const tension = rollDiff < 3 ? 5 : rollDiff < 8 ? 4 : rollDiff < 15 ? 3 : 2;

      // Drama moment
      let dramaText = "";
      if (rollDiff < 3) {
        dramaText = `Neuvěřitelné finále! ${leader.participant.athlete_name} a ${challenger?.participant.athlete_name} bojují o setiny!`;
      } else if (rollDiff < 10 && challenger) {
        dramaText = `${leader.participant.athlete_name} zrychluje v závěrečné fázi! ${challenger.participant.athlete_name} se nevzdává!`;
      } else {
        dramaText = `${leader.participant.athlete_name} dominuje finále s jasným náskokem!`;
      }

      addReveal("drama_moment", {
        disc_key: disc.key, disc_name: disc.name, text: dramaText, tension,
      }, 4000, tension);

      if (rollDiff < 5) await writeFeed("narration", `Neuvěřitelné finále! Pouhé setiny dělí soupeře!`, 5, disc.id);
      else if (rollDiff < 15 && challenger) await writeFeed("narration", `Těsné finále! ${challenger.participant.athlete_name} se nevzdává!`, 4, disc.id);

      // Final standings with medals
      const finalStandings = finalScores.map((f, i) => ({
        id: f.participant.id, name: f.participant.athlete_name,
        player: f.participant.player_name,
        score: Math.round(f.score * 100) / 100,
        rank: i + 1,
        medal: i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : null,
      }));

      addReveal("disc_result", {
        disc_key: disc.key, disc_name: disc.name, disc_emoji: disc.icon_emoji,
        text: `🥇 ${leader.participant.athlete_name} (${leader.participant.player_name}) vítězí v ${disc.name}!`,
        standings: finalStandings,
        winner: {
          id: leader.participant.id, name: leader.participant.athlete_name,
          player: leader.participant.player_name, score: Math.round(leader.score * 100) / 100,
        },
      }, 5000, 4);

      await writeFeed("result", `🥇 ${leader.participant.athlete_name} (${leader.participant.player_name}) vítězí v ${disc.name}!`, 4, disc.id, leader.participant.id);

      // Save results to DB — all participants get a result (eliminated ones too)
      const allPerformances = [
        ...finalScores.map((f, i) => ({ ...f, rank: i + 1, medal: i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : null })),
        ...semiEliminated.map((s, i) => ({ ...s, rank: semiCutoff + i + 1, medal: null })),
        ...qualEliminated.map((q, i) => ({ ...q, rank: qualCutoff + i + 1, medal: null })),
      ];

      for (const perf of allPerformances) {
        await sb.from("games_results").insert({
          session_id, festival_id, discipline_id: disc.id,
          participant_id: perf.participant.id,
          base_score: Math.round(perf.score * 100) / 100,
          bonus_score: 0, variance_score: 0,
          total_score: Math.round(perf.score * 100) / 100,
          rank: perf.rank, medal: perf.medal,
        });

        if (perf.medal) {
          const key = perf.participant.athlete_name;
          if (!medalTally[key]) medalTally[key] = { gold: 0, silver: 0, bronze: 0, player: perf.participant.player_name, participantId: perf.participant.id };
          if (perf.medal === "gold") medalTally[key].gold++;
          if (perf.medal === "silver") medalTally[key].silver++;
          if (perf.medal === "bronze") medalTally[key].bronze++;

          const empire = perf.participant.player_name;
          if (!runningMedals[empire]) runningMedals[empire] = { gold: 0, silver: 0, bronze: 0 };
          if (perf.medal === "gold") runningMedals[empire].gold++;
          if (perf.medal === "silver") runningMedals[empire].silver++;
          if (perf.medal === "bronze") runningMedals[empire].bronze++;
        }

        allResults.push({
          discipline: disc.name, athlete: perf.participant.athlete_name,
          player: perf.participant.player_name, rank: perf.rank, medal: perf.medal,
          total: Math.round(perf.score * 100) / 100,
        });
      }

      // Medal update
      addReveal("medal_update", {
        disc_key: disc.key,
        medals: JSON.parse(JSON.stringify(runningMedals)),
        new_medal: { empire: leader.participant.player_name, type: "gold", athlete: leader.participant.athlete_name },
      }, 3000, 2);

      // ═══ INCIDENT CHECK ═══
      const incidentChance = 0.05 + (intrigues || []).length * 0.03 + (festival.incident_chance || 0);
      if (Math.random() < incidentChance) {
        const incidentTypes = ["injury", "bribery", "riot", "protest"];
        const incType = incidentTypes[Math.floor(Math.random() * incidentTypes.length)];
        const target = finalScores[Math.floor(Math.random() * finalScores.length)];

        const incidentDescs: Record<string, string> = {
          injury: `${target.participant.athlete_name} utrpěl zranění během ${disc.name}!`,
          bribery: `Podezření z úplatkářství v disciplíně ${disc.name}!`,
          riot: `Nepokoje v hledišti během ${disc.name}!`,
          protest: `Náboženský protest narušil průběh ${disc.name}!`,
        };

        await sb.from("games_incidents").insert({
          session_id, festival_id, incident_type: incType,
          severity: Math.random() > 0.7 ? "major" : "minor",
          target_participant_id: target.participant.id,
          description: incidentDescs[incType],
          turn_number: turn_number || festival.announced_turn,
          effects: { discipline: disc.key, tension_increase: incType === "riot" ? 5 : 2 },
        });
        incidents.push({ description: incidentDescs[incType] });
        await writeFeed("incident", incidentDescs[incType], 4, disc.id, target.participant.id);
        addReveal("incident", {
          disc_key: disc.key, incident_type: incType,
          text: `⚠️ ${incidentDescs[incType]}`,
        }, 3500, 4);

        if (incType === "injury") {
          await sb.from("games_participants").update({ form: "injured" }).eq("id", target.participant.id);
        }
      }

      // ═══ GLADIATOR DEATH CHECK ═══
      if (disc.category === "physical" && festival.festival_type === "local_gladiator" && Math.random() < 0.08) {
        const victim = finalScores[finalScores.length - 1];
        await writeFeed("gladiator_death", `${victim.participant.athlete_name} padl v aréně!`, 5, disc.id, victim.participant.id);
        await sb.from("games_participants").update({ form: "dead" }).eq("id", victim.participant.id);
        addReveal("gladiator_death", {
          disc_key: disc.key,
          text: `💀 ${victim.participant.athlete_name} padl v aréně! Dav zuří!`,
          victim: { id: victim.participant.id, name: victim.participant.athlete_name, player: victim.participant.player_name },
        }, 4500, 5);

        try {
          const studentId = victim.participant.student_id;
          if (studentId) {
            const { data: ls } = await sb.from("academy_students").select("id, academy_id").eq("id", studentId).maybeSingle();
            if (ls) {
              await sb.from("gladiator_records").insert({
                session_id, student_id: ls.id, academy_id: ls.academy_id,
                status: "dead", died_turn: turn_number,
                cause_of_death: `Padl v gladiátorském klání v ${disc.name}`, fights: 1,
              });
            }
          }
        } catch (_) {}
      }

      // ═══ LEGEND DETECTION ═══
      for (const [name, tally] of Object.entries(medalTally)) {
        if (tally.gold >= 2) {
          const alreadyEmitted = revealScript.some((s: any) => s.type === "legend_moment" && s.athlete_name === name);
          if (!alreadyEmitted) {
            addReveal("legend_moment", {
              athlete_name: name, athlete_player: tally.player,
              text: `⭐ ${name} — LEGENDA HER! ${tally.gold}× zlato!`,
              gold_count: tally.gold,
            }, 4500, 5);
          }
        }
      }
    }

    // ═══ CLOSING CEREMONY ═══
    const topMedalist = Object.entries(medalTally).sort((a, b) => b[1].gold - a[1].gold)[0];
    const playerMedals: Record<string, number> = {};
    for (const [, tally] of Object.entries(medalTally)) {
      playerMedals[tally.player] = (playerMedals[tally.player] || 0) + tally.gold * 3 + tally.silver * 2 + tally.bronze;
    }
    const topPlayer = Object.entries(playerMedals).sort((a, b) => b[1] - a[1])[0];
    const legendNames = Object.entries(medalTally).filter(([, t]) => t.gold >= 2).map(([name]) => name);

    addReveal("ceremony_close", {
      text: `🏆 ${festival.name} se chýlí ke konci! Medailisté vystupují na stupně vítězů.`,
      final_medals: runningMedals,
      best_athlete: topMedalist ? { name: topMedalist[0], ...topMedalist[1] } : null,
      top_empire: topPlayer ? { name: topPlayer[0], score: topPlayer[1] } : null,
      legends: legendNames,
    }, 5000, 4);

    await writeFeed("narration", `🏆 ${festival.name} se chýlí ke konci!`, 4);

    // ═══ AI COMMENTARY ═══
    try {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (LOVABLE_API_KEY) {
        const commentaryPrompt = `Jsi starověký kronikář. Pro každou z těchto ${disciplines.length} disciplín napiš JEDNU krátkou dramatickou větu (max 15 slov). Odpověz jako JSON pole stringů.\n\nDisciplíny a vítězové:\n${disciplines.map((d: any, i: number) => {
  const discResults = allResults.filter((r: any) => r.discipline === d.name);
  const winner = discResults.find((r: any) => r.rank === 1);
  const second = discResults.find((r: any) => r.rank === 2);
  return `${i+1}. ${d.name}: Vítěz ${winner?.athlete} (${winner?.player}), 2. ${second?.athlete}`;
}).join("\n")}\n\nStyl: epický, stručný. Odpověz POUZE JSON pole.`;

        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [{ role: "user", content: commentaryPrompt }],
            max_tokens: 500,
          }),
        });
        if (aiResp.ok) {
          const aiData = await aiResp.json();
          const content = aiData.choices?.[0]?.message?.content?.trim();
          if (content) {
            try {
              const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
              const commentaries: string[] = JSON.parse(cleaned);
              for (let i = 0; i < disciplines.length && i < commentaries.length; i++) {
                const resultStep = revealScript.find((s: any) => s.type === "disc_result" && s.disc_key === disciplines[i].key);
                if (resultStep && commentaries[i]) resultStep.ai_commentary = commentaries[i];
              }
            } catch (_) {}
          }
        }
      }
    } catch (_) {}

    // ═══ APPLY EFFECTS ═══
    for (const p of participants) {
      const tally = medalTally[p.athlete_name];
      if (tally) {
        const totalMedals = tally.gold + tally.silver + tally.bronze;
        const isLegend = tally.gold >= 2;
        await sb.from("games_participants").update({ total_medals: totalMedals, is_legend: isLegend }).eq("id", p.id);

        if (isLegend) {
          const { data: gp } = await sb.from("great_persons").insert({
            session_id, name: p.athlete_name, player_name: p.player_name,
            person_type: "Hero", flavor_trait: "Hrdina Her",
            born_round: turn_number || 1, is_alive: true, city_id: p.city_id,
            bio: `Legendární atlet, vítěz ${tally.gold} zlatých medailí na Velkých hrách.`,
          }).select("id").single();
          if (gp) {
            await sb.from("games_participants").update({ great_person_id: gp.id }).eq("id", p.id);
            try {
              await sb.from("entity_traits").insert({
                session_id, entity_type: "person", entity_id: gp.id,
                trait_key: "hero_of_games", trait_label: "Hrdina Her",
                description: `Vítěz ${tally.gold}× zlato na Velkých hrách.`,
                intensity: tally.gold * 20, source: "games",
              });
            } catch (_) {}
          }
        }
      }
    }

    // Prestige effects on cities
    for (const [playerName, medals] of Object.entries(playerMedals)) {
      const { data: pCities } = await sb.from("cities")
        .select("id, influence_score").eq("session_id", session_id).eq("owner_player", playerName);
      for (const c of (pCities || [])) {
        await sb.from("cities").update({ influence_score: c.influence_score + medals * 2 }).eq("id", c.id);
      }
    }

    // Host city effects
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
          influenceDelta = 15 + hostingCount * 3;
          stabilityDelta = 5;
          hostNarrative = `Město ${hostCity.name} zvládlo pořadatelství skvěle.`;
        } else {
          const collapseRoll = Math.random();
          if (collapseRoll < 0.3) {
            stabilityDelta = -15; influenceDelta = 5;
            hostNarrative = `Město ${hostCity.name} se zhroutilo pod tíhou pořadatelství!`;
            await sb.from("games_incidents").insert({
              session_id, festival_id, incident_type: "riot", severity: "major",
              target_participant_id: null,
              description: `Masové nepokoje v ${hostCity.name}!`,
              turn_number: turn_number || festival.announced_turn,
              effects: { stability_loss: 15, host_collapse: true },
            });
          } else {
            stabilityDelta = -5; influenceDelta = 10;
            hostNarrative = `Město ${hostCity.name} ustálo tlak, ale infrastruktura utrpěla.`;
          }
        }

        await sb.from("cities").update({
          influence_score: hostCity.influence_score + influenceDelta,
          city_stability: Math.max(0, Math.min(100, hostCity.city_stability + stabilityDelta)),
        }).eq("id", festival.host_city_id);

        // Legacy titles
        const newHostingCount = hostingCount + 1;
        try {
          if (newHostingCount >= 3) {
            const { data: existing } = await sb.from("entity_traits").select("id")
              .eq("session_id", session_id).eq("entity_type", "city")
              .eq("entity_id", hostCity.id).eq("trait_key", "cradle_of_games").maybeSingle();
            if (!existing) {
              await sb.from("entity_traits").insert({
                session_id, entity_type: "city", entity_id: hostCity.id,
                trait_key: "cradle_of_games", trait_label: "Kolébka her",
                description: `${hostCity.name} hostilo Velké hry ${newHostingCount}×.`,
                intensity: newHostingCount * 25, source: "games",
              });
            }
          }
        } catch (_) {}

        await writeFeed("narration", hostNarrative, isPrepared ? 3 : 4);
      }
    }

    // ═══ BEST ATHLETE & MOST POPULAR ═══
    const bestAthleteEntry = Object.entries(medalTally)
      .sort((a, b) => b[1].gold !== a[1].gold ? b[1].gold - a[1].gold : (b[1].silver * 10 + b[1].bronze) - (a[1].silver * 10 + a[1].bronze))[0];

    const popularityScores: { participant: any; score: number }[] = [];
    for (const p of participants) {
      const tally = medalTally[p.athlete_name];
      const goldCount = tally?.gold || 0;
      const crowdScore = p.charisma * 0.5 + goldCount * 20 + (p.traits?.includes("Charismatický") ? 15 : 0) + Math.random() * 10;
      popularityScores.push({ participant: p, score: crowdScore });
      await sb.from("games_participants").update({ crowd_popularity: Math.round(crowdScore) }).eq("id", p.id);
    }
    popularityScores.sort((a, b) => b.score - a.score);
    const mostPopular = popularityScores[0];
    const bestAthleteParticipant = bestAthleteEntry ? participants.find((p: any) => p.athlete_name === bestAthleteEntry[0]) : null;

    const festivalUpdate: any = {};
    if (bestAthleteParticipant) festivalUpdate.best_athlete_id = bestAthleteParticipant.id;
    if (mostPopular) festivalUpdate.most_popular_id = mostPopular.participant.id;

    // Champion great persons
    const championsToWrite: any[] = [];
    if (bestAthleteParticipant && bestAthleteEntry) {
      championsToWrite.push({
        participantId: bestAthleteParticipant.id, name: bestAthleteEntry[0], player: bestAthleteEntry[1].player,
        title: "Nejlepší sportovec Her", traitKey: "best_athlete_of_games",
        bio: `Absolutní vítěz ${festival.name} s ${bestAthleteEntry[1].gold} zlatými.`,
      });
    }
    if (mostPopular && (!bestAthleteParticipant || mostPopular.participant.id !== bestAthleteParticipant.id)) {
      championsToWrite.push({
        participantId: mostPopular.participant.id, name: mostPopular.participant.athlete_name,
        player: mostPopular.participant.player_name,
        title: "Nejoblíbenější sportovec Her", traitKey: "most_popular_of_games",
        bio: `Favorit davu na ${festival.name}.`,
      });
    }

    for (const champ of championsToWrite) {
      try {
        const existingP = participants.find((p: any) => p.id === champ.participantId);
        let gpId = (existingP as any)?.great_person_id;
        if (!gpId) {
          const { data: gp } = await sb.from("great_persons").insert({
            session_id, name: champ.name, player_name: champ.player,
            person_type: "Hero", flavor_trait: champ.title,
            born_round: turn_number || 1, is_alive: true, city_id: (existingP as any)?.city_id, bio: champ.bio,
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
          try { await sb.from("wiki_entries").insert({ session_id, entity_type: "person", entity_id: gpId, entity_name: champ.name, owner_player: champ.player }); } catch (_) {}
        }
      } catch (_) {}
      await writeFeed("narration", `🌟 ${champ.name} získává titul "${champ.title}"!`, 5);
    }

    // ═══ BUILD DESCRIPTION ═══
    const { data: updatedParts } = await sb.from("games_participants")
      .select("athlete_name, form, player_name").eq("festival_id", festival_id);
    const deadAthletes = (updatedParts || []).filter((p: any) => p.form === "dead");

    let description = `## ${festival.name}\\n\\n`;
    description += `**Účastníků:** ${participants.length}\\n**Disciplín:** ${disciplines.length}\\n\\n`;
    description += `### 🏅 Nejlepší sportovec\\n${bestAthleteEntry?.[0] || "—"} (${bestAthleteEntry?.[1]?.gold || 0}🥇)\\n\\n`;
    description += `### 🏛 Nejúspěšnější říše\\n${topPlayer?.[0] || "—"}\\n\\n`;
    if (legendNames.length > 0) description += `### ⭐ Legendy\\n${legendNames.join(", ")}\\n\\n`;
    if (deadAthletes.length > 0) description += `### 💀 Padlí\\n${deadAthletes.map((d: any) => d.athlete_name).join(", ")}\\n\\n`;

    // AI highlight
    try {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (LOVABLE_API_KEY) {
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [{ role: "user", content: `Jsi kronikář. Napiš JEDEN odstavec (max 3 věty) o nejdramatičtějším momentu her. Nejlepší: ${bestAthleteEntry?.[0]}. Legendy: ${legendNames.join(", ") || "žádné"}.` }],
            max_tokens: 200,
          }),
        });
        if (aiResp.ok) {
          const aiData = await aiResp.json();
          const hl = aiData.choices?.[0]?.message?.content?.trim();
          if (hl) description += `### ✨ Highlight\\n> ${hl}\\n`;
        }
      }
    } catch (_) {}

    // ═══ SAVE FESTIVAL ═══
    await sb.from("games_festivals").update({
      status: "concluded", concluded_turn: turn_number || festival.announced_turn,
      effects_applied: true, description, reveal_script: revealScript,
      reveal_phase: "computed", ...festivalUpdate,
    }).eq("id", festival_id);

    // Game event
    await sb.from("game_events").insert({
      session_id, event_type: "games_concluded",
      note: `${festival.name} skončily! Hrdina: ${topMedalist?.[0] || "?"} (${topMedalist?.[1]?.gold || 0}🥇). Nejúspěšnější: ${topPlayer?.[0] || "?"}.`,
      player: festival.host_player,
      turn_number: turn_number || festival.announced_turn, confirmed: true,
      reference: { festival_id, medal_tally: medalTally, player_medals: playerMedals },
    });

    // Chronicle
    try {
      let cText = `**${festival.name} (rok ${turn_number || festival.announced_turn}):** `;
      cText += `Nejlepší: ${topMedalist?.[0] || "?"} (${topMedalist?.[1]?.gold || 0}🥇). `;
      if (legendNames.length > 0) cText += `Legendy: ${legendNames.join(", ")}. `;
      await sb.from("chronicle_entries").insert({
        session_id, text: cText, epoch_style: "kroniky",
        turn_from: turn_number || festival.announced_turn,
        turn_to: turn_number || festival.announced_turn, source_type: "system",
      });
    } catch (_) {}

    return new Response(JSON.stringify({
      ok: true, results_count: allResults.length, incidents_count: incidents.length,
      legends: legendNames, reveal_script: revealScript,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("games-resolve error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
