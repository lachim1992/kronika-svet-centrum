import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * league-play-round: Simulate one round of matches on-demand (button press).
 * Independent of game turns. Uses AI for commentary.
 */
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

    // Get active season
    let { data: season } = await sb.from("league_seasons")
      .select("*").eq("session_id", session_id).eq("status", "active").maybeSingle();

    const { data: allTeams } = await sb.from("league_teams")
      .select("id, team_name, player_name, city_id, attack_rating, defense_rating, tactics_rating, discipline_rating")
      .eq("session_id", session_id).eq("is_active", true);

    if (!allTeams || allTeams.length < 2) {
      return new Response(JSON.stringify({ error: "Nedostatek týmů (min 2)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get current turn
    const { data: sess } = await sb.from("game_sessions").select("current_turn").eq("id", session_id).single();
    const currentTurn = sess?.current_turn || 1;

    // Create season if none exists
    if (!season) {
      const { count: pastSeasons } = await sb.from("league_seasons")
        .select("id", { count: "exact", head: true }).eq("session_id", session_id);
      const seasonNum = (pastSeasons || 0) + 1;
      const teamCount = allTeams.length;
      const totalRounds = teamCount - 1 + (teamCount % 2 === 0 ? 0 : 0);
      const matchesPerRound = Math.floor(teamCount / 2);

      const { data: newSeason } = await sb.from("league_seasons").insert({
        session_id, season_number: seasonNum, status: "active",
        started_turn: currentTurn, total_rounds: totalRounds,
        current_round: 0, matches_per_round: matchesPerRound,
      }).select("*").single();
      if (!newSeason) throw new Error("Failed to create season");
      season = newSeason;

      for (const t of allTeams) {
        await sb.from("league_standings").insert({ session_id, season_id: season.id, team_id: t.id });
      }

      const schedule = generateRoundRobin(allTeams.map(t => t.id));
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
      return new Response(JSON.stringify({ error: "Všechna kola odehrána! Sezóna je u konce.", seasonComplete: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const roundNumber = nextMatches[0].round_number;
    const roundMatches = nextMatches.filter(m => m.round_number === roundNumber);

    const teamMap = new Map(allTeams.map(t => [t.id, t]));

    // Get all league players for these teams
    const teamIds = allTeams.map(t => t.id);
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

      // Update matches_played + condition for all participants
      for (const pid of [...result.homePlayed, ...result.awayPlayed]) {
        const { data: pl } = await sb.from("league_players").select("matches_played, condition, form").eq("id", pid).maybeSingle();
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
      });
    }

    // Update season round
    await sb.from("league_seasons").update({ current_round: roundNumber }).eq("id", season.id);

    // Check if season complete
    const { count: remaining } = await sb.from("league_matches")
      .select("id", { count: "exact", head: true })
      .eq("season_id", season.id).eq("status", "scheduled");

    let seasonComplete = false;
    if (remaining === 0) {
      seasonComplete = true;
      // conclude season
      const { data: finalStandings } = await sb.from("league_standings")
        .select("*, league_teams(team_name, player_name)").eq("season_id", season.id)
        .order("points", { ascending: false }).order("goals_for", { ascending: false });
      const champion = finalStandings?.[0];

      // Find top scorer
      const teamIdsForSeason = (finalStandings || []).map((s: any) => s.team_id);
      const { data: topScorer } = await sb.from("league_players")
        .select("id, goals_scored").in("team_id", teamIdsForSeason)
        .order("goals_scored", { ascending: false }).limit(1).maybeSingle();

      // Find best defense (least goals_against)
      const bestDef = [...(finalStandings || [])].sort((a: any, b: any) => a.goals_against - b.goals_against)[0];

      await sb.from("league_seasons").update({
        status: "concluded", ended_turn: currentTurn,
        champion_team_id: champion?.team_id || null,
        top_scorer_player_id: topScorer?.id || null,
        best_defense_team_id: bestDef?.team_id || null,
      }).eq("id", season.id);

      // Update titles_won + total stats on champion team
      if (champion?.team_id) {
        const { data: champTeam } = await sb.from("league_teams")
          .select("titles_won, seasons_played, total_wins, total_draws, total_losses, total_goals_for, total_goals_against")
          .eq("id", champion.team_id).single();
        if (champTeam) {
          await sb.from("league_teams").update({
            titles_won: (champTeam.titles_won || 0) + 1,
          }).eq("id", champion.team_id);
        }

        // Boost association prestige for champion's player
        const champPlayer = (champion as any).league_teams?.player_name;
        if (champPlayer) {
          const { data: assoc } = await sb.from("sports_associations")
            .select("id, reputation").eq("session_id", session_id)
            .eq("player_name", champPlayer).maybeSingle();
          if (assoc) {
            await sb.from("sports_associations").update({
              reputation: (assoc.reputation || 0) + 10,
            }).eq("id", assoc.id);
          }
        }
      }

      // Update seasons_played for all teams
      for (const st of (finalStandings || [])) {
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

    // Recompute positions
    const { data: standings } = await sb.from("league_standings")
      .select("id, points, goals_for").eq("season_id", season.id)
      .order("points", { ascending: false }).order("goals_for", { ascending: false });
    for (let i = 0; i < (standings || []).length; i++) {
      await sb.from("league_standings").update({ position: i + 1 }).eq("id", standings![i].id);
    }

    // Generate AI commentary
    let commentary = "";
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (LOVABLE_API_KEY && matchResults.length > 0) {
      try {
        const prompt = `Jsi sportovní komentátor starověké ligy Sphaera (obdoba fotbalu). Napiš krátký komentář (5-8 vět, česky) k výsledkům ${roundNumber}. kola:
${matchResults.map(m => `${m.home} ${m.homeScore}:${m.awayScore} ${m.away}`).join("\n")}
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
      ok: true, round: roundNumber, matches: matchResults, commentary, seasonComplete,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("league-play-round error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function simulateMatch(home: any, away: any, homePlayers: any[], awayPlayers: any[]) {
  const homeStr = (home.attack_rating + home.tactics_rating) / 2 + 5;
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
    events.push({
      minute: min, type: "goal", team: "home",
      player_name: scorer?.name || "Neznámý", player_id: scorer?.id,
    });
    if (assister && Math.random() > 0.4) {
      events.push({ minute: min, type: "assist", team: "home", player_name: assister.name, player_id: assister.id });
    }
  }

  for (let g = 0; g < awayGoals; g++) {
    const min = 1 + Math.floor(Math.random() * 90);
    const scorer = attackersA.length > 0 ? attackersA[Math.floor(Math.random() * attackersA.length)] : null;
    events.push({
      minute: min, type: "goal", team: "away",
      player_name: scorer?.name || "Neznámý", player_id: scorer?.id,
    });
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
    homePlayed: homePlayers.filter(p => p.injury_turns === 0).slice(0, 11).map(p => p.id),
    awayPlayed: awayPlayers.filter(p => p.injury_turns === 0).slice(0, 11).map(p => p.id),
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

function generateRoundRobin(teamIds: string[]): [string, string][][] {
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
