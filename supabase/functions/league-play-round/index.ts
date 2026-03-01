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
    const { session_id, player_name } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: sess } = await sb.from("game_sessions").select("current_turn").eq("id", session_id).single();
    const currentTurn = sess?.current_turn || 1;

    // Process each tier that has an active season or can start one
    const { data: allTeams } = await sb.from("league_teams")
      .select("id, team_name, player_name, city_id, attack_rating, defense_rating, tactics_rating, discipline_rating, league_tier")
      .eq("session_id", session_id).eq("is_active", true);

    if (!allTeams || allTeams.length < 2) {
      return new Response(JSON.stringify({ error: "Nedostatek týmů (min 2)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group teams by tier
    const tierMap = new Map<number, typeof allTeams>();
    for (const t of allTeams) {
      const tier = t.league_tier || 1;
      const list = tierMap.get(tier) || [];
      list.push(t);
      tierMap.set(tier, list);
    }

    // If tier 1 has > MAX_TIER1_TEAMS, move excess to tier 2
    const tier1 = tierMap.get(1) || [];
    if (tier1.length > MAX_TIER1_TEAMS) {
      // Sort by rating, worst go to tier 2
      tier1.sort((a, b) => {
        const ra = a.attack_rating + a.defense_rating + a.tactics_rating + a.discipline_rating;
        const rb = b.attack_rating + b.defense_rating + b.tactics_rating + b.discipline_rating;
        return rb - ra;
      });
      const promoted = tier1.slice(0, MAX_TIER1_TEAMS);
      const relegated = tier1.slice(MAX_TIER1_TEAMS);
      tierMap.set(1, promoted);
      const t2 = tierMap.get(2) || [];
      for (const r of relegated) {
        r.league_tier = 2;
        await sb.from("league_teams").update({ league_tier: 2 }).eq("id", r.id);
        t2.push(r);
      }
      tierMap.set(2, t2);
    }

    const allResults: any[] = [];
    let anySeasonComplete = false;

    for (const [tier, tierTeams] of tierMap.entries()) {
      if (tierTeams.length < 2) continue;

      const result = await playTierRound(sb, session_id, currentTurn, tier, tierTeams, allTeams);
      if (result.matches) allResults.push(...result.matches);
      if (result.seasonComplete) anySeasonComplete = true;
    }

    // Handle promotion/relegation if both tiers concluded
    if (anySeasonComplete) {
      await handlePromotionRelegation(sb, session_id);
    }

    // AI commentary
    let commentary = "";
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (LOVABLE_API_KEY && allResults.length > 0) {
      try {
        const prompt = `Jsi sportovní komentátor starověké ligy Sphaera (obdoba fotbalu). Napiš krátký komentář (5-8 vět, česky) k výsledkům kola:
${allResults.map(m => `${m.home} ${m.homeScore}:${m.awayScore} ${m.away}`).join("\n")}
Styl: dramatický, kronikářský. Zmín nejzajímavější momenty. NEPOUŽÍVEJ markdown.`;

        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 500,
          }),
        });
        if (aiResp.ok) {
          const aiData = await aiResp.json();
          commentary = aiData.choices?.[0]?.message?.content?.trim() || "";
        }
      } catch (e) {
        console.error("AI commentary error:", e);
      }
    }

    return new Response(JSON.stringify({
      ok: true, round: allResults[0]?.round || 0, matches: allResults,
      commentary, seasonComplete: anySeasonComplete,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("league-play-round error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function playTierRound(sb: any, session_id: string, currentTurn: number, tier: number, tierTeams: any[], allTeamsForPlayers: any[]) {
  // Get or create season for this tier
  let { data: season } = await sb.from("league_seasons")
    .select("*").eq("session_id", session_id).eq("league_tier", tier).eq("status", "active").maybeSingle();

  if (!season) {
    const { count: pastSeasons } = await sb.from("league_seasons")
      .select("id", { count: "exact", head: true }).eq("session_id", session_id).eq("league_tier", tier);
    const seasonNum = (pastSeasons || 0) + 1;
    const teamCount = tierTeams.length;
    // Double round-robin: each pair plays twice (home+away)
    const totalRounds = (teamCount - 1 + (teamCount % 2 === 0 ? 0 : 0)) * 2;
    const matchesPerRound = Math.floor(teamCount / 2);

    const { data: newSeason } = await sb.from("league_seasons").insert({
      session_id, season_number: seasonNum, status: "active",
      started_turn: currentTurn, total_rounds: totalRounds,
      current_round: 0, matches_per_round: matchesPerRound,
      league_tier: tier,
      promotion_count: tier > 1 ? 2 : 0,
      relegation_count: tier === 1 ? 2 : 0,
    }).select("*").single();
    if (!newSeason) throw new Error(`Failed to create season for tier ${tier}`);
    season = newSeason;

    // Create standings
    for (const t of tierTeams) {
      await sb.from("league_standings").insert({ session_id, season_id: season.id, team_id: t.id });
    }

    // Generate DOUBLE round-robin schedule
    const schedule = generateDoubleRoundRobin(tierTeams.map(t => t.id));
    let roundNum = 0;
    for (const round of schedule) {
      roundNum++;
      for (const [home, away] of round) {
        await sb.from("league_matches").insert({
          session_id, season_id: season.id, round_number: roundNum,
          turn_number: currentTurn + roundNum, home_team_id: home, away_team_id: away,
        });
      }
    }
  }

  // Find next unplayed round
  const { data: nextMatches } = await sb.from("league_matches")
    .select("*").eq("season_id", season.id).eq("status", "scheduled")
    .order("round_number", { ascending: true });

  if (!nextMatches || nextMatches.length === 0) {
    return { matches: [{ home: "—", away: "—", homeScore: 0, awayScore: 0, round: 0, tier }], seasonComplete: true };
  }

  const roundNumber = nextMatches[0].round_number;
  const roundMatches = nextMatches.filter(m => m.round_number === roundNumber);

  const teamMap = new Map(tierTeams.map(t => [t.id, t]));

  // Get all players for these teams
  const teamIds = tierTeams.map(t => t.id);
  const { data: allPlayers } = await sb.from("league_players").select("*").in("team_id", teamIds);
  const playersByTeam = new Map<string, any[]>();
  for (const p of (allPlayers || [])) {
    const list = playersByTeam.get(p.team_id) || [];
    list.push(p);
    playersByTeam.set(p.team_id, list);
  }

  const matchResults: any[] = [];

  for (const match of roundMatches) {
    const home = teamMap.get(match.home_team_id);
    const away = teamMap.get(match.away_team_id);
    if (!home || !away) continue;

    const homePlayers = playersByTeam.get(home.id) || [];
    const awayPlayers = playersByTeam.get(away.id) || [];

    const result = simulateMatch(home, away, homePlayers, awayPlayers);

    await sb.from("league_matches").update({
      home_score: result.homeGoals, away_score: result.awayGoals,
      status: "played", played_turn: currentTurn,
      match_events: result.events, highlight_text: result.highlight,
      attendance: result.attendance,
    }).eq("id", match.id);

    // Update standings
    await updateStandings(sb, season.id, match.home_team_id, result.homeGoals, result.awayGoals);
    await updateStandings(sb, season.id, match.away_team_id, result.awayGoals, result.homeGoals);

    // Update player stats
    for (const evt of result.events) {
      if (evt.type === "goal" && evt.player_id) {
        const { data: pl } = await sb.from("league_players").select("goals_scored, goals, form").eq("id", evt.player_id).maybeSingle();
        if (pl) {
          await sb.from("league_players").update({
            goals_scored: (pl.goals_scored || 0) + 1,
            goals: (pl.goals || 0) + 1,
            form: Math.min(99, (pl.form || 50) + 3),
          }).eq("id", evt.player_id);
        }
      }
      if (evt.type === "assist" && evt.player_id) {
        const { data: pl } = await sb.from("league_players").select("assists").eq("id", evt.player_id).maybeSingle();
        if (pl) {
          await sb.from("league_players").update({ assists: (pl.assists || 0) + 1 }).eq("id", evt.player_id);
        }
      }
    }

    // Update matches_played + condition
    for (const pid of [...result.homePlayed, ...result.awayPlayed]) {
      const { data: pl } = await sb.from("league_players").select("matches_played, condition").eq("id", pid).maybeSingle();
      if (pl) {
        await sb.from("league_players").update({
          matches_played: (pl.matches_played || 0) + 1,
          condition: Math.max(30, (pl.condition || 100) - 8 - Math.floor(Math.random() * 7)),
        }).eq("id", pid);
      }
    }

    matchResults.push({
      home: home.team_name, away: away.team_name,
      homeScore: result.homeGoals, awayScore: result.awayGoals,
      highlight: result.highlight, events: result.events,
      round: roundNumber, tier,
    });
  }

  // Update season round
  await sb.from("league_seasons").update({ current_round: roundNumber }).eq("id", season.id);

  // Recompute positions - ORDER BY points DESC, goal diff DESC, goals_for DESC
  const { data: standings } = await sb.from("league_standings")
    .select("id, points, goals_for, goals_against").eq("season_id", season.id);
  
  const sorted = (standings || []).sort((a: any, b: any) => {
    if (b.points !== a.points) return b.points - a.points;
    const diffA = a.goals_for - a.goals_against;
    const diffB = b.goals_for - b.goals_against;
    if (diffB !== diffA) return diffB - diffA;
    return b.goals_for - a.goals_for;
  });
  
  for (let i = 0; i < sorted.length; i++) {
    await sb.from("league_standings").update({ position: i + 1 }).eq("id", sorted[i].id);
  }

  // Check if season complete
  const { count: remaining } = await sb.from("league_matches")
    .select("id", { count: "exact", head: true })
    .eq("season_id", season.id).eq("status", "scheduled");

  let seasonComplete = false;
  if (remaining === 0) {
    seasonComplete = true;
    await concludeSeason(sb, session_id, season, tierTeams);
  }

  return { matches: matchResults, seasonComplete };
}

async function concludeSeason(sb: any, session_id: string, season: any, tierTeams: any[]) {
  const { data: finalStandings } = await sb.from("league_standings")
    .select("*, league_teams(team_name, player_name)").eq("season_id", season.id)
    .order("points", { ascending: false });
  
  // Re-sort properly
  const sorted = (finalStandings || []).sort((a: any, b: any) => {
    if (b.points !== a.points) return b.points - a.points;
    const diffA = a.goals_for - a.goals_against;
    const diffB = b.goals_for - b.goals_against;
    if (diffB !== diffA) return diffB - diffA;
    return b.goals_for - a.goals_for;
  });

  const champion = sorted[0];

  const teamIds = sorted.map((s: any) => s.team_id);
  const { data: topScorer } = await sb.from("league_players")
    .select("id, goals_scored").in("team_id", teamIds)
    .order("goals_scored", { ascending: false }).limit(1).maybeSingle();

  const bestDef = [...sorted].sort((a: any, b: any) => a.goals_against - b.goals_against)[0];

  await sb.from("league_seasons").update({
    status: "concluded",
    ended_turn: (await sb.from("game_sessions").select("current_turn").eq("id", session_id).single()).data?.current_turn || 0,
    champion_team_id: champion?.team_id || null,
    top_scorer_player_id: topScorer?.id || null,
    best_defense_team_id: bestDef?.team_id || null,
  }).eq("id", season.id);

  // Update titles_won for champion
  if (champion?.team_id) {
    const { data: ct } = await sb.from("league_teams").select("titles_won").eq("id", champion.team_id).single();
    if (ct) {
      await sb.from("league_teams").update({ titles_won: (ct.titles_won || 0) + 1 }).eq("id", champion.team_id);
    }

    // Boost association prestige
    const champPlayer = (champion as any).league_teams?.player_name;
    if (champPlayer) {
      const { data: assoc } = await sb.from("sports_associations")
        .select("id, reputation").eq("session_id", session_id).eq("player_name", champPlayer).maybeSingle();
      if (assoc) {
        await sb.from("sports_associations").update({ reputation: (assoc.reputation || 0) + 10 }).eq("id", assoc.id);
      }
    }
  }

  // Update cumulative stats for all teams
  for (const st of sorted) {
    const { data: t } = await sb.from("league_teams")
      .select("seasons_played, total_wins, total_draws, total_losses, total_goals_for, total_goals_against")
      .eq("id", st.team_id).single();
    if (t) {
      await sb.from("league_teams").update({
        seasons_played: (t.seasons_played || 0) + 1,
        total_wins: (t.total_wins || 0) + st.wins,
        total_draws: (t.total_draws || 0) + st.draws,
        total_losses: (t.total_losses || 0) + st.losses,
        total_goals_for: (t.total_goals_for || 0) + st.goals_for,
        total_goals_against: (t.total_goals_against || 0) + st.goals_against,
      }).eq("id", st.team_id);
    }
  }
}

async function handlePromotionRelegation(sb: any, session_id: string) {
  // Get most recently concluded seasons for tier 1 and 2
  const { data: t1Season } = await sb.from("league_seasons")
    .select("id, relegation_count").eq("session_id", session_id).eq("league_tier", 1).eq("status", "concluded")
    .order("season_number", { ascending: false }).limit(1).maybeSingle();

  const { data: t2Season } = await sb.from("league_seasons")
    .select("id, promotion_count").eq("session_id", session_id).eq("league_tier", 2).eq("status", "concluded")
    .order("season_number", { ascending: false }).limit(1).maybeSingle();

  if (!t1Season || !t2Season) return;

  // Get bottom N from tier 1
  const relCount = t1Season.relegation_count || 2;
  const { data: t1Standings } = await sb.from("league_standings")
    .select("team_id, position").eq("season_id", t1Season.id)
    .order("position", { ascending: false }).limit(relCount);

  // Get top N from tier 2
  const proCount = t2Season.promotion_count || 2;
  const { data: t2Standings } = await sb.from("league_standings")
    .select("team_id, position").eq("season_id", t2Season.id)
    .order("position", { ascending: true }).limit(proCount);

  // Swap tiers
  for (const s of (t1Standings || [])) {
    await sb.from("league_teams").update({ league_tier: 2 }).eq("id", s.team_id);
  }
  for (const s of (t2Standings || [])) {
    await sb.from("league_teams").update({ league_tier: 1 }).eq("id", s.team_id);
  }
}

function simulateMatch(home: any, away: any, homePlayers: any[], awayPlayers: any[]) {
  const homeStr = (home.attack_rating + home.tactics_rating) / 2 + 5; // home advantage
  const awayStr = (away.attack_rating + away.tactics_rating) / 2;
  const homeDef = (home.defense_rating + home.discipline_rating) / 2 + 3;
  const awayDef = (away.defense_rating + away.discipline_rating) / 2;

  const homeExpected = Math.max(0.3, (homeStr - awayDef * 0.6) / 30);
  const awayExpected = Math.max(0.2, (awayStr - homeDef * 0.6) / 30);

  const homeGoals = poissonRandom(homeExpected);
  const awayGoals = poissonRandom(awayExpected);

  const events: any[] = [];
  const attackersH = homePlayers.filter(p => p.position === "attacker" || p.position === "midfielder");
  const attackersA = awayPlayers.filter(p => p.position === "attacker" || p.position === "midfielder");

  for (let g = 0; g < homeGoals; g++) {
    const min = 1 + Math.floor(Math.random() * 90);
    const scorer = attackersH.length > 0 ? attackersH[Math.floor(Math.random() * attackersH.length)] : null;
    const assister = homePlayers.filter(p => p.id !== scorer?.id)[Math.floor(Math.random() * Math.max(1, homePlayers.length - 1))];
    events.push({ minute: min, type: "goal", team: "home", player_name: scorer?.name || "Neznámý", player_id: scorer?.id });
    if (assister && Math.random() > 0.4) {
      events.push({ minute: min, type: "assist", team: "home", player_name: assister.name, player_id: assister.id });
    }
  }

  for (let g = 0; g < awayGoals; g++) {
    const min = 1 + Math.floor(Math.random() * 90);
    const scorer = attackersA.length > 0 ? attackersA[Math.floor(Math.random() * attackersA.length)] : null;
    const assister = awayPlayers.filter(p => p.id !== scorer?.id)[Math.floor(Math.random() * Math.max(1, awayPlayers.length - 1))];
    events.push({ minute: min, type: "goal", team: "away", player_name: scorer?.name || "Neznámý", player_id: scorer?.id });
    if (assister && Math.random() > 0.4) {
      events.push({ minute: min, type: "assist", team: "away", player_name: assister.name, player_id: assister.id });
    }
  }

  if (Math.random() < 0.4) {
    const team = Math.random() > 0.5 ? "home" : "away";
    const pool = team === "home" ? homePlayers : awayPlayers;
    const p = pool[Math.floor(Math.random() * pool.length)];
    events.push({ minute: 20 + Math.floor(Math.random() * 60), type: "yellow_card", team, player_name: p?.name || "?" });
  }

  events.sort((a, b) => a.minute - b.minute);

  const highlight = homeGoals + awayGoals === 0
    ? "Bezbrankový souboj plný taktiky."
    : homeGoals > awayGoals + 1 ? "Dominantní výkon domácích!"
    : awayGoals > homeGoals + 1 ? "Hosté překvapili arénu!"
    : homeGoals === awayGoals ? "Vyrovnaný boj." : "Dramatický souboj.";

  return {
    homeGoals, awayGoals, events, highlight,
    attendance: 500 + Math.floor(Math.random() * 2000),
    homePlayed: homePlayers.filter(p => (p.injury_turns || 0) === 0).slice(0, 11).map((p: any) => p.id),
    awayPlayed: awayPlayers.filter(p => (p.injury_turns || 0) === 0).slice(0, 11).map((p: any) => p.id),
  };
}

function poissonRandom(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return Math.min(k - 1, 6);
}

async function updateStandings(sb: any, seasonId: string, teamId: string, goalsFor: number, goalsAgainst: number) {
  const { data: st } = await sb.from("league_standings")
    .select("*").eq("season_id", seasonId).eq("team_id", teamId).single();
  if (!st) return;
  const won = goalsFor > goalsAgainst;
  const draw = goalsFor === goalsAgainst;
  const pts = won ? 3 : draw ? 1 : 0;
  const formChar = won ? "W" : draw ? "D" : "L";
  const form = (formChar + (st.form || "")).slice(0, 5);
  await sb.from("league_standings").update({
    played: st.played + 1, wins: st.wins + (won ? 1 : 0),
    draws: st.draws + (draw ? 1 : 0), losses: st.losses + (!won && !draw ? 1 : 0),
    goals_for: st.goals_for + goalsFor, goals_against: st.goals_against + goalsAgainst,
    points: st.points + pts, form,
  }).eq("id", st.id);
}

/**
 * Generate a DOUBLE round-robin schedule: each pair plays home+away.
 * First half is standard round-robin, second half reverses home/away.
 */
function generateDoubleRoundRobin(teamIds: string[]): [string, string][][] {
  const firstHalf = generateSingleRoundRobin(teamIds);
  // Second half: reverse home/away
  const secondHalf = firstHalf.map(round => round.map(([h, a]) => [a, h] as [string, string]));
  return [...firstHalf, ...secondHalf];
}

function generateSingleRoundRobin(teamIds: string[]): [string, string][][] {
  const teams = [...teamIds];
  if (teams.length % 2 !== 0) teams.push("BYE");
  const n = teams.length;
  const rounds: [string, string][][] = [];
  for (let round = 0; round < n - 1; round++) {
    const matches: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const home = teams[i];
      const away = teams[n - 1 - i];
      if (home === "BYE" || away === "BYE") continue;
      matches.push([home, away]);
    }
    if (matches.length > 0) rounds.push(matches);
    const last = teams.pop()!;
    teams.splice(1, 0, last);
  }
  return rounds;
}
