import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_TIER1_TEAMS = 20;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, player_name, skip_commentary } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: sess } = await sb.from("game_sessions").select("current_turn").eq("id", session_id).single();
    const currentTurn = sess?.current_turn || 1;

    const { data: allTeams } = await sb.from("league_teams")
      .select("id, team_name, player_name, city_id, attack_rating, defense_rating, tactics_rating, discipline_rating, league_tier")
      .eq("session_id", session_id).eq("is_active", true);

    if (!allTeams || allTeams.length < 2) {
      return new Response(JSON.stringify({ error: "Nedostatek týmů (min 2)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tierMap = new Map<number, typeof allTeams>();
    for (const t of allTeams) {
      const tier = t.league_tier || 1;
      const list = tierMap.get(tier) || [];
      list.push(t);
      tierMap.set(tier, list);
    }

    const tier1 = tierMap.get(1) || [];
    if (tier1.length > MAX_TIER1_TEAMS) {
      tier1.sort((a, b) => (b.attack_rating + b.defense_rating + b.tactics_rating + b.discipline_rating) - (a.attack_rating + a.defense_rating + a.tactics_rating + a.discipline_rating));
      tierMap.set(1, tier1.slice(0, MAX_TIER1_TEAMS));
      const t2 = tierMap.get(2) || [];
      for (const r of tier1.slice(MAX_TIER1_TEAMS)) {
        r.league_tier = 2;
        await sb.from("league_teams").update({ league_tier: 2 }).eq("id", r.id);
        t2.push(r);
      }
      tierMap.set(2, t2);
    }

    const allResults: any[] = [];
    let anySeasonComplete = false;
    let playoffResults: any = null;

    for (const [tier, tierTeams] of tierMap.entries()) {
      if (tierTeams.length < 2) continue;

      // Check if there's an active season in playoff phase
      const { data: activeSeason } = await sb.from("league_seasons").select("*")
        .eq("session_id", session_id).eq("league_tier", tier).eq("status", "active").maybeSingle();

      if (activeSeason && activeSeason.playoff_status && activeSeason.playoff_status !== "none" && activeSeason.playoff_status !== "completed") {
        // Play playoff round
        const result = await playPlayoffRound(sb, session_id, currentTurn, activeSeason, tierTeams);
        playoffResults = result;
        if (result.seasonComplete) anySeasonComplete = true;
        continue;
      }

      const result = await playTierRound(sb, session_id, currentTurn, tier, tierTeams);
      if (result.matches) allResults.push(...result.matches);
      if (result.seasonComplete) anySeasonComplete = true;
    }

    if (anySeasonComplete) await handlePromotionRelegation(sb, session_id);

    // Dynamic stat changes
    await applyDynamicStatChanges(sb, session_id, currentTurn);

    // AI commentary
    let commentary = "";
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const commentaryMatches = playoffResults?.matches || allResults;
    if (!skip_commentary && LOVABLE_API_KEY && commentaryMatches.length > 0) {
      try {
        const isPlayoff = !!playoffResults;
        const prompt = `Jsi kronikář starověké ligy Sphaera – brutálního týmového sportu s kovovou koulí. Napiš krátký komentář (5-8 vět, česky) k výsledkům ${isPlayoff ? "playoff zápasů" : "kola"}:
${commentaryMatches.map((m: any) => `${m.home} ${m.homeScore}:${m.awayScore} ${m.away} (vyřazení: ${m.knockouts || 0})${m.playoffRound ? ` [${m.playoffRound}]` : ""}`).join("\n")}
Styl: dramatický, kronikářský, krvavý. ${isPlayoff ? "Zdůrazni váhu vyřazovacích zápasů, kdo postupuje, kdo je eliminován." : "Zmín brutální momenty, vyřazené hráče, crowd reakce."} NEPOUŽÍVEJ markdown.`;
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
          body: JSON.stringify({ model: "google/gemini-2.5-flash-lite", messages: [{ role: "user", content: prompt }], max_tokens: 500 }),
        });
        if (aiResp.ok) { const d = await aiResp.json(); commentary = d.choices?.[0]?.message?.content?.trim() || ""; }
      } catch (e) { console.error("AI commentary:", e); }
    }

    // Auto-generate Sphaera feed
    try {
      const feedResp = await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/sphaera-feed-generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
        },
        body: JSON.stringify({
          session_id, round_number: allResults[0]?.round || 0, turn_number: currentTurn,
          season_id: (await sb.from("league_seasons").select("id").eq("session_id", session_id).eq("status", "active").order("season_number", { ascending: false }).limit(1).maybeSingle())?.data?.id,
        }),
      });
      if (!feedResp.ok) console.error("Feed gen failed:", await feedResp.text());
    } catch (e) { console.error("Feed gen error:", e); }

    return new Response(JSON.stringify({
      ok: true,
      round: allResults[0]?.round || 0,
      matches: allResults,
      commentary,
      seasonComplete: anySeasonComplete,
      playoff: playoffResults || null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("league-play-round error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

// ========== FAN BASE GROWTH ==========
// Hybrid model: results give immediate boost, team rating provides baseline growth
async function updateTeamFanBase(sb: any, session_id: string, team: any, goalsFor: number, goalsAgainst: number, attendance: number) {
  const { data: t } = await sb.from("league_teams").select("fan_base, popularity, attack_rating, defense_rating, tactics_rating, stadium_building_id").eq("id", team.id).single();
  if (!t) return;

  let fanDelta = 0;
  const currentFans = t.fan_base || 10;

  // Result-based: win +3-5, draw +1, loss -1
  if (goalsFor > goalsAgainst) {
    fanDelta += 3 + Math.floor(Math.random() * 3); // +3 to +5
    // Dominant win bonus
    if (goalsFor - goalsAgainst >= 3) fanDelta += 2;
  } else if (goalsFor === goalsAgainst) {
    fanDelta += 1;
  } else {
    fanDelta -= 1;
  }

  // Rating-based baseline: strong teams attract fans passively
  const avgRating = ((t.attack_rating || 40) + (t.defense_rating || 40) + (t.tactics_rating || 40)) / 3;
  if (avgRating >= 60) fanDelta += 1;
  if (avgRating >= 75) fanDelta += 1;

  // Stadium bonus
  if (t.stadium_building_id) fanDelta += 1;

  // Attendance excitement: high attendance = more engagement
  if (attendance > 500) fanDelta += 1;

  // Goals scored = excitement
  fanDelta += Math.min(2, Math.floor(goalsFor / 2));

  const newFanBase = Math.max(5, currentFans + fanDelta);
  const newPopularity = Math.max(0, Math.min(100, (t.popularity || 30) + (fanDelta > 0 ? 1 : fanDelta < 0 ? -1 : 0)));

  await sb.from("league_teams").update({ fan_base: newFanBase, popularity: newPopularity }).eq("id", team.id);
}

// ========== MATCH REVENUE ==========
// Each match generates ticket revenue based on combined fan bases
async function creditMatchRevenue(sb: any, session_id: string, home: any, away: any, attendance: number) {
  // Collect unique association_ids for both teams
  const teamIds = [home.id, away.id];
  const { data: teams } = await sb.from("league_teams").select("id, association_id, fan_base, player_name").in("id", teamIds);
  if (!teams) return;

  const assocRevenue = new Map<string, number>();
  for (const t of teams) {
    if (!t.association_id) continue;
    const fans = t.fan_base || 10;
    // Revenue: base 2 + fans * 0.05 per match
    const revenue = Math.round(2 + fans * 0.05);
    assocRevenue.set(t.association_id, (assocRevenue.get(t.association_id) || 0) + revenue);
  }

  for (const [assocId, revenue] of assocRevenue.entries()) {
    const { data: assoc } = await sb.from("sports_associations").select("budget").eq("id", assocId).single();
    if (assoc) {
      await sb.from("sports_associations").update({ budget: (assoc.budget || 0) + revenue }).eq("id", assocId);
    }
  }
}

// ========== DYNAMIC STAT CHANGES ==========
async function applyDynamicStatChanges(sb: any, session_id: string, currentTurn: number) {
  const { data: players } = await sb.from("league_players").select("*").eq("session_id", session_id).eq("is_dead", false);
  if (!players) return;
  for (const p of players) {
    const age = p.age || 20, potential = p.talent_potential || 50, peakAge = p.peak_age || 28;
    const u: Record<string, any> = {};
    if (currentTurn % 3 === 0) u.age = age + 1;
    const newAge = u.age || age;
    if (newAge < peakAge && Math.random() < (potential / 100) * 0.6) {
      const stat = pickRandom(["strength", "speed", "technique", "stamina"]);
      u[stat] = Math.min(99, (p[stat] || 50) + 1 + Math.floor(Math.random() * 2));
    }
    if (newAge > peakAge + 3 && Math.random() < (newAge - peakAge - 3) * 0.15) {
      const stat = pickRandom(["speed", "stamina", "aggression", "strength"]);
      u[stat] = Math.max(10, (p[stat] || 50) - 1 - Math.floor(Math.random() * 2));
    }
    if ((p.condition || 100) < 100) u.condition = Math.min(100, (p.condition || 70) + 8 + Math.floor(Math.random() * 8));
    // Heal injuries
    if ((p.injury_turns || 0) > 0) {
      u.injury_turns = p.injury_turns - 1;
      if (u.injury_turns <= 0) { u.is_injured = false; u.injury_turns = 0; u.injury_severity = "none"; }
    }
    const form = p.form || 50;
    u.form = Math.max(10, Math.min(95, form + (form > 50 ? -Math.floor(Math.random() * 4) : Math.floor(Math.random() * 4))));
    const str = u.strength ?? p.strength ?? 50, spd = u.speed ?? p.speed ?? 50, tch = u.technique ?? p.technique ?? 50, sta = u.stamina ?? p.stamina ?? 50;
    const posW: Record<string, number[]> = {
      praetor: [0.15, 0.15, 0.35, 0.2], guardian: [0.35, 0.1, 0.2, 0.25],
      striker: [0.15, 0.35, 0.3, 0.1], carrier: [0.1, 0.2, 0.45, 0.15], exactor: [0.4, 0.15, 0.1, 0.2],
      goalkeeper: [0.15, 0.1, 0.4, 0.2], defender: [0.3, 0.15, 0.2, 0.25], midfielder: [0.15, 0.2, 0.35, 0.25], attacker: [0.15, 0.35, 0.3, 0.1],
    };
    const w = posW[p.position] || [0.25, 0.25, 0.25, 0.25];
    u.overall_rating = Math.round((str * w[0] + spd * w[1] + tch * w[2] + sta * w[3]) * 0.7 + (u.form ?? form) * 0.3);
    if (Object.keys(u).length > 0) await sb.from("league_players").update(u).eq("id", p.id);
  }
}

// ========== PLAY PLAYOFF ROUND ==========
async function playPlayoffRound(sb: any, session_id: string, currentTurn: number, season: any, tierTeams: any[]) {
  const bracket: any[] = season.playoff_bracket || [];
  const status = season.playoff_status;

  // Find scheduled matches for current playoff phase
  const scheduled = bracket.filter((m: any) => m.round === status && m.status === "scheduled");
  if (scheduled.length === 0) {
    return { matches: [], seasonComplete: false };
  }

  const teamMap = new Map(tierTeams.map(t => [t.id, t]));
  const teamIds = tierTeams.map(t => t.id);
  const { data: allPlayers } = await sb.from("league_players").select("*").in("team_id", teamIds);
  const playersByTeam = new Map<string, any[]>();
  for (const p of (allPlayers || [])) { const l = playersByTeam.get(p.team_id) || []; l.push(p); playersByTeam.set(p.team_id, l); }

  const matchResults: any[] = [];
  const roundLabels: Record<string, string> = { quarterfinals: "Čtvrtfinále", semifinals: "Semifinále", final: "Finále" };

  for (const pm of scheduled) {
    const home = teamMap.get(pm.home_team_id), away = teamMap.get(pm.away_team_id);
    if (!home || !away) continue;
    const hp = (playersByTeam.get(home.id) || []).filter(p => !p.is_injured && (p.injury_turns || 0) === 0);
    const ap = (playersByTeam.get(away.id) || []).filter(p => !p.is_injured && (p.injury_turns || 0) === 0);
    const result = simulateSphaera(home, away, hp, ap);

    pm.home_score = result.homeScore;
    pm.away_score = result.awayScore;
    pm.status = "played";
    pm.winner_team_id = result.homeScore >= result.awayScore ? pm.home_team_id : pm.away_team_id;
    pm.events = result.events;

    // Update player stats from events
    for (const evt of result.events) {
      if (evt.type === "goal" && evt.player_id) { const { data: pl } = await sb.from("league_players").select("goals_scored, goals, form").eq("id", evt.player_id).maybeSingle(); if (pl) await sb.from("league_players").update({ goals_scored: (pl.goals_scored||0)+1, goals: (pl.goals||0)+1, form: Math.min(95, (pl.form||50)+4) }).eq("id", evt.player_id); }
      if (evt.type === "breakthrough" && evt.player_id) { const { data: pl } = await sb.from("league_players").select("goals_scored, goals, form").eq("id", evt.player_id).maybeSingle(); if (pl) await sb.from("league_players").update({ goals_scored: (pl.goals_scored||0)+1, goals: (pl.goals||0)+1, form: Math.min(95, (pl.form||50)+6) }).eq("id", evt.player_id); }
      if (evt.type === "assist" && evt.player_id) { const { data: pl } = await sb.from("league_players").select("assists, form").eq("id", evt.player_id).maybeSingle(); if (pl) await sb.from("league_players").update({ assists: (pl.assists||0)+1, form: Math.min(95, (pl.form||50)+2) }).eq("id", evt.player_id); }
      if (evt.type === "knockout" && evt.player_id) { const { data: pl } = await sb.from("league_players").select("yellow_cards, form").eq("id", evt.player_id).maybeSingle(); if (pl) await sb.from("league_players").update({ yellow_cards: (pl.yellow_cards||0)+1, form: Math.min(95, (pl.form||50)+3) }).eq("id", evt.player_id); }
      if (evt.type === "injury" && evt.player_id) {
        if (evt.is_death) {
          await sb.from("league_players").update({ is_dead: true, is_injured: true, death_turn: currentTurn, death_cause: evt.death_cause || "Sphaera" }).eq("id", evt.player_id);
        } else {
          await sb.from("league_players").update({ is_injured: true, injury_turns: evt.injury_turns || (1+Math.floor(Math.random()*3)), injury_severity: evt.severity || "light" }).eq("id", evt.player_id);
        }
      }
    }
    for (const pid of [...result.homePlayed, ...result.awayPlayed]) { const { data: pl } = await sb.from("league_players").select("matches_played, condition, form").eq("id", pid).maybeSingle(); if (pl) await sb.from("league_players").update({ matches_played: (pl.matches_played||0)+1, condition: Math.max(20, (pl.condition||100)-12-Math.floor(Math.random()*12)), form: Math.max(10, Math.min(95, (pl.form||50)+(Math.random()>0.5?2:-2))) }).eq("id", pid); }

    matchResults.push({
      home: home.team_name, away: away.team_name,
      homeScore: result.homeScore, awayScore: result.awayScore,
      knockouts: result.knockouts, highlight: result.highlight,
      events: result.events, playoffRound: roundLabels[status] || status,
      crowdMood: result.crowdMood, tier: season.league_tier,
    });
  }

  // Advance to next phase
  let nextStatus = status;
  let seasonComplete = false;
  const allCurrentPlayed = bracket.filter((m: any) => m.round === status).every((m: any) => m.status === "played");

  if (allCurrentPlayed) {
    const winners = bracket.filter((m: any) => m.round === status && m.status === "played").map((m: any) => m.winner_team_id);

    if (status === "quarterfinals" && winners.length === 4) {
      // Create semifinals: winner of match 0 vs winner of match 3, winner of match 1 vs winner of match 2
      bracket.push(
        { round: "semifinals", match_index: 0, home_team_id: winners[0], away_team_id: winners[3], status: "scheduled" },
        { round: "semifinals", match_index: 1, home_team_id: winners[1], away_team_id: winners[2], status: "scheduled" },
      );
      nextStatus = "semifinals";
    } else if (status === "semifinals" && winners.length === 2) {
      bracket.push(
        { round: "final", match_index: 0, home_team_id: winners[0], away_team_id: winners[1], status: "scheduled" },
      );
      nextStatus = "final";
    } else if (status === "final" && winners.length === 1) {
      nextStatus = "completed";
      seasonComplete = true;
      // Crown champion
      const championId = winners[0];
      const ct = await sb.from("league_teams").select("titles_won, player_name").eq("id", championId).single();
      if (ct?.data) {
        await sb.from("league_teams").update({ titles_won: (ct.data.titles_won || 0) + 1 }).eq("id", championId);
        const { data: a } = await sb.from("sports_associations").select("id, reputation").eq("session_id", session_id).eq("player_name", ct.data.player_name).maybeSingle();
        if (a) await sb.from("sports_associations").update({ reputation: (a.reputation || 0) + 15 }).eq("id", a.id);
      }
      // Update season stats
      const { data: fs } = await sb.from("league_standings").select("*").eq("season_id", season.id);
      for (const st of (fs || [])) {
        const { data: t } = await sb.from("league_teams").select("seasons_played, total_wins, total_draws, total_losses, total_goals_for, total_goals_against").eq("id", st.team_id).single();
        if (t) await sb.from("league_teams").update({ seasons_played: (t.seasons_played||0)+1, total_wins: (t.total_wins||0)+st.wins, total_draws: (t.total_draws||0)+st.draws, total_losses: (t.total_losses||0)+st.losses, total_goals_for: (t.total_goals_for||0)+st.goals_for, total_goals_against: (t.total_goals_against||0)+st.goals_against }).eq("id", st.team_id);
      }
      await sb.from("league_seasons").update({
        status: "concluded",
        ended_turn: currentTurn,
        champion_team_id: championId,
        playoff_status: "completed",
        playoff_bracket: bracket,
      }).eq("id", season.id);

      // ═══ WIKI PROPAGATION for league champion ═══
      try {
        const { data: champTeam } = await sb.from("league_teams")
          .select("id, team_name, player_name, city_id, titles_won")
          .eq("id", championId).single();

        if (champTeam) {
          const seasonLabel = `Sezóna ${season.season_number || "?"}`;
          // Wiki ref for champion's city
          if (champTeam.city_id) {
            await sb.from("wiki_event_refs").upsert([{
              session_id, entity_id: champTeam.city_id, entity_type: "city",
              ref_type: "event", ref_id: season.id,
              ref_label: `🏆 Sphaera Liga ${seasonLabel}: šampion ${champTeam.team_name}`,
              turn_number: currentTurn, impact_score: 4,
              meta: { season_id: season.id, champion: champTeam.team_name, titles: champTeam.titles_won },
            }], { onConflict: "session_id,entity_id,ref_type,ref_id", ignoreDuplicates: true });

            // Trigger wiki-enrich for the champion's city
            try {
              await sb.functions.invoke("wiki-enrich", {
                body: { sessionId: session_id, entityId: champTeam.city_id, entityType: "city", turnNumber: currentTurn },
              });
            } catch (e) { console.error(`Wiki enrich for league champion city:`, e); }
          }

          // Create/update wiki entry for the league team if 5+ titles (dynasty)
          if ((champTeam.titles_won || 0) >= 5) {
            await sb.from("wiki_entries").upsert({
              session_id,
              entity_type: "team",
              entity_id: champTeam.id,
              entity_name: champTeam.team_name,
              owner_player: champTeam.player_name,
              summary: `Legendární dynastie Sphaera Ligy s ${champTeam.titles_won} tituly.`,
            }, { onConflict: "session_id,entity_id" });
          }
        }
      } catch (wikiErr) {
        console.error("League wiki propagation error:", wikiErr);
      }

      return { matches: matchResults, seasonComplete: true };
    }
  }

  await sb.from("league_seasons").update({
    playoff_status: nextStatus,
    playoff_bracket: bracket,
  }).eq("id", season.id);

  return { matches: matchResults, seasonComplete };
}

// ========== PLAY TIER ROUND ==========
async function playTierRound(sb: any, session_id: string, currentTurn: number, tier: number, tierTeams: any[]) {
  let { data: season } = await sb.from("league_seasons").select("*").eq("session_id", session_id).eq("league_tier", tier).eq("status", "active").maybeSingle();
  if (!season) {
    // Get the max season_number to avoid duplicate key violations
    const { data: lastSeason } = await sb.from("league_seasons").select("season_number")
      .eq("session_id", session_id).eq("league_tier", tier)
      .order("season_number", { ascending: false }).limit(1).maybeSingle();
    const nextSeasonNumber = (lastSeason?.season_number || 0) + 1;
    const n = tierTeams.length, adj = n % 2 === 0 ? n : n + 1;

    // Use upsert to handle race conditions where two calls try to create the same season
    const { data: ns, error: seasonErr } = await sb.from("league_seasons").upsert({
      session_id, season_number: nextSeasonNumber, status: "active", started_turn: currentTurn,
      total_rounds: (adj - 1) * 2, current_round: 0, matches_per_round: Math.floor(n / 2),
      league_tier: tier, promotion_count: tier > 1 ? 2 : 0, relegation_count: tier === 1 ? 2 : 0,
      playoff_status: "none", playoff_bracket: [],
    }, { onConflict: "session_id,league_tier,season_number", ignoreDuplicates: true }).select("*").single();

    if (seasonErr || !ns) {
      // If upsert was ignored due to duplicate, fetch the existing season
      const { data: existingSeason } = await sb.from("league_seasons").select("*")
        .eq("session_id", session_id).eq("league_tier", tier).eq("season_number", nextSeasonNumber).maybeSingle();
      if (existingSeason) {
        season = existingSeason;
      } else {
        console.error(`Failed to create season tier ${tier}:`, seasonErr);
        throw new Error(`Failed season tier ${tier}: ${seasonErr?.message || "unknown"}`);
      }
    } else {
      season = ns;
    }
    for (const t of tierTeams) await sb.from("league_standings").insert({ session_id, season_id: season.id, team_id: t.id });
    const schedule = generateDoubleRoundRobin(tierTeams.map(t => t.id));
    let rn = 0;
    for (const round of schedule) { rn++; for (const [h, a] of round) await sb.from("league_matches").insert({ session_id, season_id: season.id, round_number: rn, turn_number: currentTurn + rn, home_team_id: h, away_team_id: a }); }
    // Check if new teams need to be added to standings
    const { data: existingStandings } = await sb.from("league_standings")
      .select("team_id").eq("season_id", season.id);
    const standingTeamIds = new Set((existingStandings || []).map((s: any) => s.team_id));
    const missingTeams = tierTeams.filter(t => !standingTeamIds.has(t.id));
    if (missingTeams.length > 0) {
      for (const t of missingTeams) {
        await sb.from("league_standings").insert({ session_id, season_id: season.id, team_id: t.id });
      }
    }
  }

  const { data: nextMatches } = await sb.from("league_matches").select("*").eq("season_id", season.id).eq("status", "scheduled").order("round_number", { ascending: true });
  if (!nextMatches || nextMatches.length === 0) {
    // No scheduled matches — regenerate schedule if there are enough teams
    const { data: allStandings } = await sb.from("league_standings")
      .select("team_id").eq("season_id", season.id);
    const allTeamIds = (allStandings || []).map((s: any) => s.team_id);

    if (allTeamIds.length >= 2 && season.playoff_status === "none") {
      // Check if season had any played matches
      const { count: playedCount } = await sb.from("league_matches")
        .select("id", { count: "exact", head: true })
        .eq("season_id", season.id).eq("status", "played");

      if ((playedCount || 0) === 0) {
        // Fresh season — generate full double round-robin
        const schedule = generateDoubleRoundRobin(allTeamIds);
        let rn = 0;
        for (const round of schedule) {
          rn++;
          for (const [h, a] of round) {
            await sb.from("league_matches").insert({
              session_id, season_id: season.id, round_number: rn,
              turn_number: (season.started_turn || currentTurn) + rn,
              home_team_id: h, away_team_id: a,
            });
          }
        }
        await sb.from("league_seasons").update({
          total_rounds: schedule.length,
          matches_per_round: Math.floor(allTeamIds.length / 2),
        }).eq("id", season.id);
        // Recurse to play the first round
        return await playTierRound(sb, session_id, currentTurn, tier, tierTeams);
      } else {
        // Mid-season — generate remaining matches for new teams against existing ones
        // Get all played pairings
        const { data: playedMatches } = await sb.from("league_matches")
          .select("home_team_id, away_team_id")
          .eq("season_id", season.id).eq("status", "played");
        const playedPairs = new Set((playedMatches || []).map((m: any) => `${m.home_team_id}-${m.away_team_id}`));

        // Generate missing pairings (each pair plays home+away)
        const newMatches: [string, string][] = [];
        for (let i = 0; i < allTeamIds.length; i++) {
          for (let j = i + 1; j < allTeamIds.length; j++) {
            const a = allTeamIds[i], b = allTeamIds[j];
            if (!playedPairs.has(`${a}-${b}`) && !playedPairs.has(`${b}-${a}`)) {
              newMatches.push([a, b]);
              newMatches.push([b, a]);
            } else if (!playedPairs.has(`${b}-${a}`)) {
              newMatches.push([b, a]); // reverse leg
            }
          }
        }

        // Distribute into rounds
        const maxRound = season.current_round || 1;
        const matchesPerRound = Math.floor(allTeamIds.length / 2);
        let rn = maxRound + 1;
        for (let idx = 0; idx < newMatches.length; idx++) {
          if (idx > 0 && idx % matchesPerRound === 0) rn++;
          const [h, a] = newMatches[idx];
          await sb.from("league_matches").insert({
            session_id, season_id: season.id, round_number: rn,
            turn_number: currentTurn + (rn - maxRound),
            home_team_id: h, away_team_id: a,
          });
        }
        await sb.from("league_seasons").update({
          total_rounds: rn,
          matches_per_round: matchesPerRound,
        }).eq("id", season.id);
        // Recurse to play
        return await playTierRound(sb, session_id, currentTurn, tier, tierTeams);
      }
    }

    // Regular season done — start playoffs if enough teams
    if (season.playoff_status === "none") {
      return await startPlayoffs(sb, session_id, season);
    }
    return { matches: [], seasonComplete: true };
  }

  const roundNumber = nextMatches[0].round_number;
  const roundMatches = nextMatches.filter(m => m.round_number === roundNumber);
  const teamMap = new Map(tierTeams.map(t => [t.id, t]));
  const teamIds = tierTeams.map(t => t.id);
  const { data: allPlayers } = await sb.from("league_players").select("*").in("team_id", teamIds);
  const playersByTeam = new Map<string, any[]>();
  for (const p of (allPlayers || [])) { const l = playersByTeam.get(p.team_id) || []; l.push(p); playersByTeam.set(p.team_id, l); }

  const matchResults: any[] = [];
  for (const match of roundMatches) {
    const home = teamMap.get(match.home_team_id), away = teamMap.get(match.away_team_id);
    if (!home || !away) continue;
    const hp = (playersByTeam.get(home.id) || []).filter(p => !p.is_injured && (p.injury_turns || 0) === 0);
    const ap = (playersByTeam.get(away.id) || []).filter(p => !p.is_injured && (p.injury_turns || 0) === 0);
    const result = simulateSphaera(home, away, hp, ap);

    await sb.from("league_matches").update({ home_score: result.homeScore, away_score: result.awayScore, status: "played", played_turn: currentTurn, match_events: result.events, highlight_text: result.highlight, attendance: result.attendance }).eq("id", match.id);
    await updateStandings(sb, season.id, match.home_team_id, result.homeScore, result.awayScore);
    await updateStandings(sb, season.id, match.away_team_id, result.awayScore, result.homeScore);

    for (const evt of result.events) {
      if (evt.type === "goal" && evt.player_id) { const { data: pl } = await sb.from("league_players").select("goals_scored, goals, form").eq("id", evt.player_id).maybeSingle(); if (pl) await sb.from("league_players").update({ goals_scored: (pl.goals_scored||0)+1, goals: (pl.goals||0)+1, form: Math.min(95, (pl.form||50)+4) }).eq("id", evt.player_id); }
      if (evt.type === "breakthrough" && evt.player_id) { const { data: pl } = await sb.from("league_players").select("goals_scored, goals, form").eq("id", evt.player_id).maybeSingle(); if (pl) await sb.from("league_players").update({ goals_scored: (pl.goals_scored||0)+1, goals: (pl.goals||0)+1, form: Math.min(95, (pl.form||50)+6) }).eq("id", evt.player_id); }
      if (evt.type === "assist" && evt.player_id) { const { data: pl } = await sb.from("league_players").select("assists, form").eq("id", evt.player_id).maybeSingle(); if (pl) await sb.from("league_players").update({ assists: (pl.assists||0)+1, form: Math.min(95, (pl.form||50)+2) }).eq("id", evt.player_id); }
      if (evt.type === "knockout" && evt.player_id) { const { data: pl } = await sb.from("league_players").select("yellow_cards, form").eq("id", evt.player_id).maybeSingle(); if (pl) await sb.from("league_players").update({ yellow_cards: (pl.yellow_cards||0)+1, form: Math.min(95, (pl.form||50)+3) }).eq("id", evt.player_id); }
      if (evt.type === "injury" && evt.player_id) {
        if (evt.is_death) {
          await sb.from("league_players").update({ is_dead: true, is_injured: true, death_turn: currentTurn, death_cause: evt.death_cause || "Sphaera" }).eq("id", evt.player_id);
        } else {
          await sb.from("league_players").update({ is_injured: true, injury_turns: evt.injury_turns || (1+Math.floor(Math.random()*3)), injury_severity: evt.severity || "light" }).eq("id", evt.player_id);
        }
      }
      if (evt.type === "brutal_foul" && evt.player_id) { const { data: pl } = await sb.from("league_players").select("yellow_cards").eq("id", evt.player_id).maybeSingle(); if (pl) await sb.from("league_players").update({ yellow_cards: (pl.yellow_cards||0)+1 }).eq("id", evt.player_id); }
    }
    for (const pid of [...result.homePlayed, ...result.awayPlayed]) { const { data: pl } = await sb.from("league_players").select("matches_played, condition, form").eq("id", pid).maybeSingle(); if (pl) await sb.from("league_players").update({ matches_played: (pl.matches_played||0)+1, condition: Math.max(20, (pl.condition||100)-12-Math.floor(Math.random()*12)), form: Math.max(10, Math.min(95, (pl.form||50)+(Math.random()>0.5?2:-2))) }).eq("id", pid); }

    matchResults.push({ home: home.team_name, away: away.team_name, homeScore: result.homeScore, awayScore: result.awayScore, knockouts: result.knockouts, highlight: result.highlight, events: result.events, round: roundNumber, tier, crowdMood: result.crowdMood });

    // ═══ FAN BASE GROWTH (hybrid model) ═══
    await updateTeamFanBase(sb, session_id, home, result.homeScore, result.awayScore, result.attendance || 0);
    await updateTeamFanBase(sb, session_id, away, result.awayScore, result.homeScore, result.attendance || 0);

    // ═══ MATCH REVENUE → association budget ═══
    await creditMatchRevenue(sb, session_id, home, away, result.attendance || 0);
  }

  await sb.from("league_seasons").update({ current_round: roundNumber }).eq("id", season.id);
  const { data: standings } = await sb.from("league_standings").select("id, points, goals_for, goals_against").eq("season_id", season.id);
  const sorted = (standings || []).sort((a: any, b: any) => { if (b.points !== a.points) return b.points - a.points; const dA = a.goals_for-a.goals_against, dB = b.goals_for-b.goals_against; if (dB !== dA) return dB-dA; return b.goals_for-a.goals_for; });
  for (let i = 0; i < sorted.length; i++) await sb.from("league_standings").update({ position: i+1 }).eq("id", sorted[i].id);

  const { count: remaining } = await sb.from("league_matches").select("id", { count: "exact", head: true }).eq("season_id", season.id).eq("status", "scheduled");
  if (remaining === 0) {
    // Regular season complete — start playoffs
    return await startPlayoffs(sb, session_id, season, matchResults);
  }
  return { matches: matchResults, seasonComplete: false };
}

// ========== START PLAYOFFS ==========
async function startPlayoffs(sb: any, session_id: string, season: any, matchResults?: any[]) {
  // Get final standings
  const { data: fs } = await sb.from("league_standings").select("*, league_teams(team_name, player_name)").eq("season_id", season.id).order("position", { ascending: true });
  const sorted = (fs || []).sort((a: any, b: any) => { if (b.points !== a.points) return b.points - a.points; const dA = a.goals_for-a.goals_against, dB = b.goals_for-b.goals_against; if (dB !== dA) return dB-dA; return b.goals_for-a.goals_for; });

  const qualifiedCount = Math.min(8, sorted.length);
  // Guard: don't award titles from mini-seasons with very few matches played
  const minRoundsForTitle = Math.max(4, Math.floor(season.total_rounds * 0.5));
  const actualRoundsPlayed = season.current_round || 0;

  if (qualifiedCount < 4) {
    // Not enough teams for playoffs, just crown #1 (if enough rounds played)
    const champ = sorted[0];
    if (champ && actualRoundsPlayed >= minRoundsForTitle) {
      const { data: ct } = await sb.from("league_teams").select("titles_won").eq("id", champ.team_id).single();
      if (ct) await sb.from("league_teams").update({ titles_won: (ct.titles_won || 0) + 1 }).eq("id", champ.team_id);
    }
    await sb.from("league_seasons").update({
      status: "concluded", ended_turn: season.started_turn + season.total_rounds,
      champion_team_id: (actualRoundsPlayed >= minRoundsForTitle ? champ?.team_id : null) || null, playoff_status: "completed", playoff_bracket: [],
    }).eq("id", season.id);
    for (const st of sorted) { const { data: t } = await sb.from("league_teams").select("seasons_played, total_wins, total_draws, total_losses, total_goals_for, total_goals_against").eq("id", st.team_id).single(); if (t) await sb.from("league_teams").update({ seasons_played: (t.seasons_played||0)+1, total_wins: (t.total_wins||0)+st.wins, total_draws: (t.total_draws||0)+st.draws, total_losses: (t.total_losses||0)+st.losses, total_goals_for: (t.total_goals_for||0)+st.goals_for, total_goals_against: (t.total_goals_against||0)+st.goals_against }).eq("id", st.team_id); }
    return { matches: matchResults || [], seasonComplete: true };
  }

  // Create bracket: 1v8, 2v7, 3v6, 4v5
  const top = sorted.slice(0, qualifiedCount);
  const bracket: any[] = [];

  if (qualifiedCount >= 8) {
    // Full quarterfinals
    bracket.push(
      { round: "quarterfinals", match_index: 0, home_team_id: top[0].team_id, away_team_id: top[7].team_id, status: "scheduled", home_seed: 1, away_seed: 8 },
      { round: "quarterfinals", match_index: 1, home_team_id: top[1].team_id, away_team_id: top[6].team_id, status: "scheduled", home_seed: 2, away_seed: 7 },
      { round: "quarterfinals", match_index: 2, home_team_id: top[2].team_id, away_team_id: top[5].team_id, status: "scheduled", home_seed: 3, away_seed: 6 },
      { round: "quarterfinals", match_index: 3, home_team_id: top[3].team_id, away_team_id: top[4].team_id, status: "scheduled", home_seed: 4, away_seed: 5 },
    );
    await sb.from("league_seasons").update({ playoff_status: "quarterfinals", playoff_bracket: bracket }).eq("id", season.id);
  } else {
    // 4-7 teams: skip to semifinals
    bracket.push(
      { round: "semifinals", match_index: 0, home_team_id: top[0].team_id, away_team_id: top[3]?.team_id || top[top.length-1].team_id, status: "scheduled", home_seed: 1, away_seed: 4 },
      { round: "semifinals", match_index: 1, home_team_id: top[1].team_id, away_team_id: top[2].team_id, status: "scheduled", home_seed: 2, away_seed: 3 },
    );
    await sb.from("league_seasons").update({ playoff_status: "semifinals", playoff_bracket: bracket }).eq("id", season.id);
  }

  return { matches: matchResults || [], seasonComplete: false, playoffStarted: true };
}

// ========== AUTO-LINEUP: Select best 11 from roster ==========
function selectLineup(allPlayers: any[]): any[] {
  // Filter out injured/dead
  const available = allPlayers.filter(p => !p.is_injured && !p.is_dead && (p.injury_turns || 0) === 0);
  if (available.length <= 11) return available;

  // Target composition: 1 praetor, 3 guardians, 4 strikers, 2 carriers, 1 exactor
  const targetComp: Record<string, number> = { praetor: 1, guardian: 3, striker: 4, carrier: 2, exactor: 1 };
  const lineup: any[] = [];
  const used = new Set<string>();

  // Fill each position by best form+condition+overall
  for (const [pos, count] of Object.entries(targetComp)) {
    const posPlayers = available
      .filter(p => !used.has(p.id) && (p.position === pos || legacyPos(p.position) === pos))
      .sort((a, b) => effectiveScore(b) - effectiveScore(a));
    for (let i = 0; i < count && i < posPlayers.length; i++) {
      lineup.push(posPlayers[i]);
      used.add(posPlayers[i].id);
    }
  }

  // Fill remaining slots with best available
  if (lineup.length < 11) {
    const remaining = available.filter(p => !used.has(p.id)).sort((a, b) => effectiveScore(b) - effectiveScore(a));
    for (const p of remaining) {
      if (lineup.length >= 11) break;
      lineup.push(p);
      used.add(p.id);
    }
  }

  return lineup;
}

function legacyPos(pos: string): string {
  const map: Record<string, string> = { goalkeeper: "praetor", defender: "guardian", midfielder: "carrier", attacker: "striker" };
  return map[pos] || pos;
}

function effectiveScore(p: any): number {
  return (p.overall_rating || 50) * 0.4 + (p.form || 50) * 0.3 + (p.condition || 80) * 0.3;
}

// ========== INJURY SYSTEM: 4 severity levels + death ==========
interface InjuryResult {
  severity: "light" | "medium" | "severe" | "career_ending";
  turns: number;
  isDeath: boolean;
  deathCause?: string;
}

function rollInjury(aggression: number, victimCondition: number): InjuryResult {
  const roll = Math.random() * 100;
  const conditionFactor = (100 - (victimCondition || 80)) / 100; // worse condition = worse injury

  if (roll < 50 + conditionFactor * 10) {
    // Light: 1-2 rounds
    return { severity: "light", turns: 1 + Math.floor(Math.random() * 2), isDeath: false };
  } else if (roll < 80 + conditionFactor * 5) {
    // Medium: 3-5 rounds
    return { severity: "medium", turns: 3 + Math.floor(Math.random() * 3), isDeath: false };
  } else if (roll < 97) {
    // Severe: 6-10 rounds, 10% death chance
    const isDeath = Math.random() < 0.10;
    return {
      severity: "severe", turns: 6 + Math.floor(Math.random() * 5),
      isDeath,
      deathCause: isDeath ? "Smrtelné zranění v aréně Sphaery" : undefined,
    };
  } else {
    // Career ending
    return { severity: "career_ending", turns: 99, isDeath: false };
  }
}

// ========== SPHAERA MATCH SIMULATION ==========
function simulateSphaera(home: any, away: any, homePlayers: any[], awayPlayers: any[]) {
  // Auto-select best 11 from each roster
  const homeLineup = selectLineup(homePlayers);
  const awayLineup = selectLineup(awayPlayers);

  const hEff = calcTeamEffective(homeLineup), aEff = calcTeamEffective(awayLineup);
  const hAtk = hEff.attack * 0.8 + (home.attack_rating || 40) * 0.2;
  const hDef = hEff.defense * 0.8 + (home.defense_rating || 40) * 0.2;
  const aAtk = aEff.attack * 0.8 + (away.attack_rating || 40) * 0.2;
  const aDef = aEff.defense * 0.8 + (away.defense_rating || 40) * 0.2;

  let homeScore = 0, awayScore = 0;
  const events: any[] = [];
  let knockouts = 0;
  let crowdMeter = 50;
  const injuries: InjuryResult[] = [];
  const deaths: { playerId: string; playerName: string; team: string }[] = [];

  const hStrikers = homeLineup.filter(p => ["attacker", "striker"].includes(p.position));
  const hCarriers = homeLineup.filter(p => ["midfielder", "carrier"].includes(p.position));
  const aStrikers = awayLineup.filter(p => ["attacker", "striker"].includes(p.position));
  const aCarriers = awayLineup.filter(p => ["midfielder", "carrier"].includes(p.position));
  const hExactors = homeLineup.filter(p => p.position === "exactor");
  const aExactors = awayLineup.filter(p => p.position === "exactor");

  for (let period = 1; period <= 3; period++) {
    const actions = 5 + Math.floor(Math.random() * 3);
    for (let action = 0; action < actions; action++) {
      const minute = (period - 1) * 30 + Math.floor((action / actions) * 30) + 1;
      const homeAdvantage = crowdMeter > 60 ? 1.08 : crowdMeter < 40 ? 0.95 : 1.03;

      // Home attack
      const hChance = (hAtk * homeAdvantage - aDef * 0.5) / 80;
      if (Math.random() < hChance) {
        if (Math.random() < 0.15) {
          const scorer = pickWeighted([...hStrikers, ...hCarriers], p => (p.technique||50) + (p.speed||50)*0.7 + (p.form||50)*0.3);
          if (scorer) { homeScore += 5; events.push({ minute, type: "breakthrough", team: "home", player_name: scorer.name, player_id: scorer.id, points: 5, period }); crowdMeter = Math.min(100, crowdMeter + 10); }
        } else {
          const scorer = pickWeighted([...hStrikers, ...hCarriers], p => (p.technique||50) + (p.speed||50)*0.5 + (p.form||50)*0.3);
          const assister = pickWeighted(homeLineup.filter(p => p.id !== scorer?.id), p => (p.technique||50) + (p.leadership||20)*0.3);
          if (scorer) { homeScore += 3; events.push({ minute, type: "goal", team: "home", player_name: scorer.name, player_id: scorer.id, points: 3, period }); if (assister && Math.random() > 0.3) events.push({ minute, type: "assist", team: "home", player_name: assister.name, player_id: assister.id, period }); crowdMeter = Math.min(100, crowdMeter + 5); }
        }
      }

      // Away attack
      const aChance = (aAtk - hDef * 0.5) / 80;
      if (Math.random() < aChance) {
        if (Math.random() < 0.15) {
          const scorer = pickWeighted([...aStrikers, ...aCarriers], p => (p.technique||50) + (p.speed||50)*0.7 + (p.form||50)*0.3);
          if (scorer) { awayScore += 5; events.push({ minute, type: "breakthrough", team: "away", player_name: scorer.name, player_id: scorer.id, points: 5, period }); crowdMeter = Math.max(0, crowdMeter - 8); }
        } else {
          const scorer = pickWeighted([...aStrikers, ...aCarriers], p => (p.technique||50) + (p.speed||50)*0.5 + (p.form||50)*0.3);
          const assister = pickWeighted(awayLineup.filter(p => p.id !== scorer?.id), p => (p.technique||50) + (p.leadership||20)*0.3);
          if (scorer) { awayScore += 3; events.push({ minute, type: "goal", team: "away", player_name: scorer.name, player_id: scorer.id, points: 3, period }); if (assister && Math.random() > 0.3) events.push({ minute, type: "assist", team: "away", player_name: assister.name, player_id: assister.id, period }); crowdMeter = Math.max(0, crowdMeter - 5); }
        }
      }

      // Knockouts by exactors
      const allExactors = [...(hExactors.length > 0 ? hExactors : homeLineup.filter(p => (p.aggression||30) > 50)), ...(aExactors.length > 0 ? aExactors : awayLineup.filter(p => (p.aggression||30) > 50))];
      for (const ex of allExactors) {
        const isHome = homeLineup.some(p => p.id === ex.id);
        const targets = isHome ? awayLineup : homeLineup;
        const koChance = ((ex.strength||50) + (ex.aggression||30)) / 800;
        if (Math.random() < koChance) {
          const victim = pickWeighted(targets, p => 100 - (p.strength||50));
          if (victim) {
            const team = isHome ? "home" : "away";
            if (isHome) homeScore += 1; else awayScore += 1;
            knockouts++;
            events.push({ minute, type: "knockout", team, player_name: ex.name, player_id: ex.id, victim_name: victim.name, victim_id: victim.id, points: 1, period });

            // Roll injury with severity system
            if (Math.random() < 0.5) {
              const inj = rollInjury(ex.aggression || 30, victim.condition || 80);
              events.push({
                minute, type: "injury", team: isHome ? "away" : "home",
                player_name: victim.name, player_id: victim.id, period,
                severity: inj.severity, injury_turns: inj.turns,
                is_death: inj.isDeath, death_cause: inj.deathCause,
              });
              injuries.push(inj);
              if (inj.isDeath) {
                deaths.push({ playerId: victim.id, playerName: victim.name, team: isHome ? "away" : "home" });
              }
            }
            crowdMeter = Math.min(100, crowdMeter + (isHome ? 4 : -3));
          }
        }
      }

      // Brutal fouls
      for (const pool of [{ players: homeLineup, team: "home" }, { players: awayLineup, team: "away" }]) {
        for (const p of pool.players) {
          if (Math.random() < (p.aggression || 30) / 600) {
            events.push({ minute, type: "brutal_foul", team: pool.team, player_name: p.name, player_id: p.id, period });
            crowdMeter = Math.min(100, crowdMeter + (pool.team === "home" ? -2 : 2));
          }
        }
      }

      // Fatigue injuries
      for (const pool of [{ players: homeLineup, team: "home" }, { players: awayLineup, team: "away" }]) {
        for (const p of pool.players) {
          const injuryChance = (100 - (p.condition || 100)) / 1200 + 0.005;
          if (Math.random() < injuryChance) {
            const inj = rollInjury(0, p.condition || 80);
            events.push({
              minute, type: "injury", team: pool.team,
              player_name: p.name, player_id: p.id, period,
              severity: inj.severity, injury_turns: inj.turns,
            });
            injuries.push(inj);
          }
        }
      }

      // Crowd events
      if (crowdMeter < 25 && Math.random() < 0.15) { events.push({ minute, type: "crowd_riot", period, description: "Dav hází předměty na hřiště!" }); crowdMeter = Math.max(0, crowdMeter - 5); }
      else if (crowdMeter > 85 && Math.random() < 0.1) { events.push({ minute, type: "crowd_chant", period, description: "Tribuny se otřásají skandováním!" }); }
    }
  }

  events.sort((a, b) => a.minute - b.minute);
  const crowdMood = crowdMeter > 75 ? "Extáze" : crowdMeter > 55 ? "Nadšení" : crowdMeter > 40 ? "Napětí" : crowdMeter > 20 ? "Hněv" : "Chaos";
  const totalGoals = events.filter(e => e.type === "goal" || e.type === "breakthrough").length;
  const highlight = deaths.length > 0 ? `☠️ Smrtelná Sphaera! ${deaths.map(d => d.playerName).join(", ")} zaplatil${deaths.length > 1 ? "i" : ""} nejvyšší cenu.`
    : totalGoals === 0 ? "Krutý boj bez jediného bodu. Sphaera zůstala mrtvá."
    : homeScore > awayScore + 5 ? "Domácí dominance! Aréna řvala krví a slávou."
    : awayScore > homeScore + 5 ? "Hosté ztrhali domácí obranu na kusy!"
    : knockouts >= 3 ? "Brutální masakr! Více vyřazených než bodů."
    : homeScore === awayScore ? "Vyrovnaný boj – Sphaera nikoho neušetřila."
    : "Dramatický souboj v prachu arény.";

  return {
    homeScore, awayScore, events, highlight, knockouts, crowdMood,
    attendance: 500 + Math.floor(Math.random() * 2500),
    homePlayed: homeLineup.map(p => p.id),
    awayPlayed: awayLineup.map(p => p.id),
    injuries, deaths,
  };
}

function calcTeamEffective(players: any[]) {
  if (players.length === 0) return { attack: 30, defense: 30, brutality: 20 };
  const atk = players.filter(p => ["attacker", "striker"].includes(p.position));
  const mid = players.filter(p => ["midfielder", "carrier"].includes(p.position));
  const def = players.filter(p => ["defender", "guardian"].includes(p.position));
  const gk = players.filter(p => ["goalkeeper", "praetor"].includes(p.position));
  const ex = players.filter(p => p.position === "exactor");
  const avg = (a: any[], s: string) => a.length === 0 ? 35 : a.reduce((x: number, p: any) => x+(p[s]||40), 0)/a.length;
  const fM = (a: any[]) => a.length === 0 ? 1 : 0.7 + a.reduce((x: number, p: any) => x+(p.form||50), 0)/a.length/166;
  const cM = (a: any[]) => a.length === 0 ? 1 : 0.6 + a.reduce((x: number, p: any) => x+(p.condition||80), 0)/a.length/250;
  return {
    attack: (avg(atk, "technique")*0.4 + avg(atk, "speed")*0.35 + avg(mid, "technique")*0.15 + avg(mid, "speed")*0.1) * fM([...atk,...mid]) * cM([...atk,...mid]),
    defense: (avg(def, "strength")*0.35 + avg(def, "stamina")*0.25 + avg(gk, "technique")*0.25 + avg(def, "aggression")*0.15) * fM([...def,...gk]) * cM([...def,...gk]),
    brutality: avg([...ex, ...def], "aggression") * 0.6 + avg([...ex, ...def], "strength") * 0.4,
  };
}

function pickWeighted<T>(arr: T[], wFn: (i: T) => number): T | null {
  if (!arr.length) return null;
  const ws = arr.map(wFn), tot = ws.reduce((s, w) => s+Math.max(1,w), 0);
  let r = Math.random()*tot;
  for (let i = 0; i < arr.length; i++) { r -= Math.max(1, ws[i]); if (r <= 0) return arr[i]; }
  return arr[arr.length-1];
}
function pickRandom<T>(a: T[]): T { return a[Math.floor(Math.random()*a.length)]; }

async function updateStandings(sb: any, sid: string, tid: string, gf: number, ga: number) {
  const { data: st } = await sb.from("league_standings").select("*").eq("season_id", sid).eq("team_id", tid).single();
  if (!st) return;
  const w = gf > ga, d = gf === ga, pts = w ? 3 : d ? 1 : 0;
  await sb.from("league_standings").update({ played: st.played+1, wins: st.wins+(w?1:0), draws: st.draws+(d?1:0), losses: st.losses+(!w&&!d?1:0), goals_for: st.goals_for+gf, goals_against: st.goals_against+ga, points: st.points+pts, form: ((w?"W":d?"D":"L")+(st.form||"")).slice(0,5) }).eq("id", st.id);
}

async function handlePromotionRelegation(sb: any, sid: string) {
  const { data: t1 } = await sb.from("league_seasons").select("id, relegation_count").eq("session_id", sid).eq("league_tier", 1).eq("status", "concluded").order("season_number", { ascending: false }).limit(1).maybeSingle();
  const { data: t2 } = await sb.from("league_seasons").select("id, promotion_count").eq("session_id", sid).eq("league_tier", 2).eq("status", "concluded").order("season_number", { ascending: false }).limit(1).maybeSingle();
  if (!t1 || !t2) return;
  const { data: r1 } = await sb.from("league_standings").select("team_id").eq("season_id", t1.id).order("position", { ascending: false }).limit(t1.relegation_count||2);
  const { data: r2 } = await sb.from("league_standings").select("team_id").eq("season_id", t2.id).order("position", { ascending: true }).limit(t2.promotion_count||2);
  for (const s of (r1||[])) await sb.from("league_teams").update({ league_tier: 2 }).eq("id", s.team_id);
  for (const s of (r2||[])) await sb.from("league_teams").update({ league_tier: 1 }).eq("id", s.team_id);
}

function generateDoubleRoundRobin(ids: string[]): [string,string][][] {
  const f = generateSingleRoundRobin(ids);
  return [...f, ...f.map(r => r.map(([h,a]) => [a,h] as [string,string]))];
}
function generateSingleRoundRobin(ids: string[]): [string,string][][] {
  const t = [...ids]; if (t.length%2!==0) t.push("BYE");
  const n = t.length, rounds: [string,string][][] = [];
  for (let r = 0; r < n-1; r++) {
    const m: [string,string][] = [];
    for (let i = 0; i < n/2; i++) { const h = t[i], a = t[n-1-i]; if (h!=="BYE"&&a!=="BYE") m.push([h,a]); }
    if (m.length > 0) rounds.push(m);
    const last = t.pop()!; t.splice(1, 0, last);
  }
  return rounds;
}
