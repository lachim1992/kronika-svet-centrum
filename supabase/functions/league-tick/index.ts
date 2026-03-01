import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * league-tick: Processes one round of Sphaera league matches per turn.
 *
 * 1. Auto-creates teams from cities with stadiums (is_arena buildings)
 * 2. Creates/manages league seasons
 * 3. Simulates scheduled matches for current turn
 * 4. Updates standings
 * 5. Concludes seasons when all rounds played
 *
 * Input: { session_id, turn_number }
 */

const POSITIONS = [
  { pos: "goalkeeper", count: 1 },
  { pos: "defender", count: 4 },
  { pos: "midfielder", count: 3 },
  { pos: "attacker", count: 3 },
];

const FIRST_NAMES = [
  "Aethon", "Brutus", "Cassian", "Darius", "Eneas", "Felix", "Gaius", "Hector",
  "Icarus", "Julius", "Kaelen", "Leon", "Marcus", "Nero", "Orion", "Primus",
  "Quintus", "Rex", "Servius", "Titus", "Ulric", "Varro", "Xander", "Zeno",
  "Ajax", "Balthus", "Corvus", "Drago", "Erebus", "Falco", "Gryphon", "Hadrian",
];

const TEAM_PREFIXES = [
  "FC", "SK", "Legie", "Gladiátoři", "Válečníci", "Štíty", "Orel", "Drakouni",
  "Krkavci", "Kladiva", "Blesky", "Stíny", "Titáni", "Korunní", "Býci",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, turn_number } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const results: any = { teamsCreated: 0, matchesPlayed: 0, seasonAction: null };

    // ═══ STEP 1: Auto-create teams from cities with stadiums ═══
    const { data: citiesWithStadiums } = await sb.from("cities")
      .select("id, name, owner_player, influence_score, development_level, city_stability, population_total")
      .eq("session_id", session_id).in("status", ["ok", "active"]);

    const { data: existingTeams } = await sb.from("league_teams")
      .select("city_id").eq("session_id", session_id);

    const existingCityIds = new Set((existingTeams || []).map(t => t.city_id));

    for (const city of (citiesWithStadiums || [])) {
      if (existingCityIds.has(city.id)) continue;

      // Check for stadium (arena)
      const { data: stadium } = await sb.from("city_buildings")
        .select("id, name, current_level")
        .eq("city_id", city.id).eq("session_id", session_id)
        .eq("status", "completed").eq("is_arena", true)
        .maybeSingle();

      if (!stadium) continue;

      // Generate team name
      const prefix = TEAM_PREFIXES[Math.floor(Math.random() * TEAM_PREFIXES.length)];
      const teamName = `${prefix} ${city.name}`;

      // Base ratings from city stats
      const baseRating = 30 + Math.floor(city.development_level * 3) + Math.floor(city.city_stability * 0.2);

      const { data: team } = await sb.from("league_teams").insert({
        session_id, city_id: city.id, stadium_building_id: stadium.id,
        player_name: city.owner_player, team_name: teamName,
        motto: `Za slávu ${city.name}!`,
        attack_rating: baseRating + Math.floor(Math.random() * 20) - 10,
        defense_rating: baseRating + Math.floor(Math.random() * 20) - 10,
        tactics_rating: baseRating + Math.floor(Math.random() * 15) - 7,
        discipline_rating: baseRating + Math.floor(Math.random() * 15) - 7,
        popularity: Math.floor(city.population_total / 100),
        fan_base: Math.floor(city.population_total / 5),
      }).select("id").single();

      if (team) {
        // Generate 11 players
        const usedNames = new Set<string>();
        for (const posGroup of POSITIONS) {
          for (let i = 0; i < posGroup.count; i++) {
            let name: string;
            do {
              name = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
            } while (usedNames.has(name));
            usedNames.add(name);

            const isCaptain = posGroup.pos === "midfielder" && i === 0 && usedNames.size <= 6;
            const posBonus = posGroup.pos === "goalkeeper" ? { technique: 15, speed: -5 }
              : posGroup.pos === "defender" ? { strength: 10, aggression: 5 }
              : posGroup.pos === "attacker" ? { speed: 10, technique: 5 }
              : { stamina: 5, technique: 5 };

            await sb.from("league_players").insert({
              session_id, team_id: team.id, name,
              position: posGroup.pos, is_captain: isCaptain,
              strength: 35 + Math.floor(Math.random() * 30) + (posBonus as any).strength || 0,
              speed: 35 + Math.floor(Math.random() * 30) + (posBonus as any).speed || 0,
              technique: 35 + Math.floor(Math.random() * 30) + (posBonus as any).technique || 0,
              stamina: 40 + Math.floor(Math.random() * 25) + (posBonus as any).stamina || 0,
              aggression: 25 + Math.floor(Math.random() * 30) + (posBonus as any).aggression || 0,
              leadership: isCaptain ? 70 + Math.floor(Math.random() * 20) : Math.floor(Math.random() * 40),
            });
          }
        }
        results.teamsCreated++;
      }
    }

    // ═══ STEP 2: Season management ═══
    const { data: allTeams } = await sb.from("league_teams")
      .select("id, team_name, player_name, city_id, attack_rating, defense_rating, tactics_rating, discipline_rating")
      .eq("session_id", session_id).eq("is_active", true);

    if (!allTeams || allTeams.length < 2) {
      return new Response(JSON.stringify({ ...results, note: "Nedostatek týmů pro ligu (min 2)" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get or create active season
    let { data: season } = await sb.from("league_seasons")
      .select("*").eq("session_id", session_id).eq("status", "active").maybeSingle();

    if (!season) {
      // Determine season number
      const { count: pastSeasons } = await sb.from("league_seasons")
        .select("id", { count: "exact", head: true }).eq("session_id", session_id);

      const seasonNum = (pastSeasons || 0) + 1;
      const teamCount = allTeams.length;
      // Dynamic: small league (≤4) = 2×, large (5+) = 1×
      const matchesPerPairing = teamCount <= 4 ? 2 : 1;
      const totalRounds = (teamCount - 1 + (teamCount % 2 === 0 ? 0 : 0)) * matchesPerPairing;
      // Each round has floor(teamCount/2) matches
      const matchesPerRound = Math.floor(teamCount / 2);

      const { data: newSeason } = await sb.from("league_seasons").insert({
        session_id, season_number: seasonNum, status: "active",
        started_turn: turn_number, total_rounds: totalRounds,
        current_round: 0, matches_per_round: matchesPerRound,
      }).select("*").single();

      if (!newSeason) throw new Error("Failed to create season");
      season = newSeason;

      // Create standings for all teams
      for (const t of allTeams) {
        await sb.from("league_standings").insert({
          session_id, season_id: season.id, team_id: t.id,
        });
      }

      // Generate match schedule using round-robin
      const schedule = generateRoundRobin(allTeams.map(t => t.id), matchesPerPairing);
      let roundNum = 0;
      for (const round of schedule) {
        roundNum++;
        const matchTurn = turn_number + roundNum; // one round per turn
        for (const [home, away] of round) {
          await sb.from("league_matches").insert({
            session_id, season_id: season.id, round_number: roundNum,
            turn_number: matchTurn, home_team_id: home, away_team_id: away,
          });
        }
      }

      results.seasonAction = { created: true, seasonNumber: seasonNum, totalRounds: schedule.length, teams: teamCount };

      // Create game event
      await sb.from("game_events").insert({
        session_id, event_type: "league_season_start",
        note: `🏟️ Sphaera Liga — ${seasonNum}. sezóna zahájena! ${teamCount} týmů soupeří o titul mistra.`,
        turn_number, confirmed: true,
        reference: { season_id: season.id, teams: allTeams.map(t => t.team_name) },
      });
    }

    // ═══ STEP 3: Simulate matches for current turn ═══
    const { data: scheduledMatches } = await sb.from("league_matches")
      .select("*").eq("season_id", season.id).eq("turn_number", turn_number).eq("status", "scheduled");

    const teamMap = new Map(allTeams.map(t => [t.id, t]));

    for (const match of (scheduledMatches || [])) {
      const home = teamMap.get(match.home_team_id);
      const away = teamMap.get(match.away_team_id);
      if (!home || !away) continue;

      const result = simulateMatch(home, away);

      await sb.from("league_matches").update({
        home_score: result.homeGoals, away_score: result.awayGoals,
        status: "played", played_turn: turn_number,
        match_events: result.events, highlight_text: result.highlight,
        attendance: result.attendance,
      }).eq("id", match.id);

      // Update standings
      await updateStandings(sb, season.id, match.home_team_id, result.homeGoals, result.awayGoals);
      await updateStandings(sb, season.id, match.away_team_id, result.awayGoals, result.homeGoals);

      // Update goal scorers
      for (const evt of result.events) {
        if (evt.type === "goal" && evt.player_id) {
          await sb.from("league_players").update({
            goals_scored: (evt.prev_goals || 0) + 1,
            matches_played: (evt.prev_matches || 0) + 1,
          }).eq("id", evt.player_id);
        }
      }

      // Update season current_round
      await sb.from("league_seasons").update({
        current_round: match.round_number,
      }).eq("id", season.id);

      results.matchesPlayed++;
    }

    // ═══ STEP 4: Check if season is complete ═══
    const { count: remainingMatches } = await sb.from("league_matches")
      .select("id", { count: "exact", head: true })
      .eq("season_id", season.id).eq("status", "scheduled");

    if (remainingMatches === 0 && results.matchesPlayed > 0) {
      // Season over! Determine champion
      const { data: finalStandings } = await sb.from("league_standings")
        .select("*, league_teams(team_name, player_name, city_id)")
        .eq("season_id", season.id)
        .order("points", { ascending: false })
        .order("goals_for", { ascending: false });

      const champion = finalStandings?.[0];

      // Find top scorer
      const { data: topScorer } = await sb.from("league_players")
        .select("id, name, goals_scored, team_id")
        .in("team_id", allTeams.map(t => t.id))
        .order("goals_scored", { ascending: false })
        .limit(1).maybeSingle();

      // Best defense
      const bestDefense = finalStandings ? [...finalStandings].sort((a, b) => a.goals_against - b.goals_against)[0] : null;

      await sb.from("league_seasons").update({
        status: "concluded", ended_turn: turn_number,
        champion_team_id: champion?.team_id || null,
        top_scorer_player_id: topScorer?.id || null,
        best_defense_team_id: bestDefense?.team_id || null,
      }).eq("id", season.id);

      // Award prestige to champion's city
      if (champion) {
        const champTeam = (champion as any).league_teams;
        // Cultural prestige for champion
        const { data: realm } = await sb.from("realm_resources")
          .select("cultural_prestige, prestige")
          .eq("session_id", session_id).eq("player_name", champTeam?.player_name).single();
        if (realm) {
          await sb.from("realm_resources").update({
            cultural_prestige: (realm.cultural_prestige || 0) + 8,
            prestige: (realm.prestige || 0) + 5,
          }).eq("session_id", session_id).eq("player_name", champTeam?.player_name);
        }

        // Boost city stability & local_renown
        await sb.rpc("", {}).catch(() => {}); // placeholder
        const { data: champCity } = await sb.from("cities")
          .select("city_stability, local_renown, influence_score")
          .eq("id", champion.team_id ? champTeam?.city_id : null).maybeSingle();

        if (champCity && champTeam?.city_id) {
          await sb.from("cities").update({
            city_stability: Math.min(100, champCity.city_stability + 5),
            local_renown: (champCity.local_renown || 0) + 8,
            influence_score: champCity.influence_score + 3,
          }).eq("id", champTeam.city_id);
        }

        // Update team titles
        await sb.from("league_teams").update({
          titles_won: (champion as any).wins || 0, // we'll fix this
          seasons_played: season.season_number,
        }).eq("id", champion.team_id);

        // Game event
        await sb.from("game_events").insert({
          session_id, event_type: "league_champion",
          note: `🏆 ${champTeam?.team_name || "Neznámý tým"} se stal mistrem ${season.season_number}. sezóny Sphaera Ligy!${topScorer ? ` Nejlepší střelec: ${topScorer.name} (${topScorer.goals_scored} gólů).` : ""}`,
          player: champTeam?.player_name, turn_number, confirmed: true,
          reference: { season_id: season.id, champion: champTeam?.team_name, top_scorer: topScorer?.name },
        });
      }

      results.seasonAction = { concluded: true, champion: (champion as any)?.league_teams?.team_name };
    }

    // ═══ STEP 5: Recompute standings positions ═══
    if (results.matchesPlayed > 0) {
      const { data: standings } = await sb.from("league_standings")
        .select("id, points, goals_for, goals_against")
        .eq("season_id", season.id)
        .order("points", { ascending: false })
        .order("goals_for", { ascending: false });

      for (let i = 0; i < (standings || []).length; i++) {
        await sb.from("league_standings").update({ position: i + 1 }).eq("id", standings![i].id);
      }
    }

    return new Response(JSON.stringify({ ok: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("league-tick error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ═══ MATCH SIMULATION ═══
function simulateMatch(home: any, away: any) {
  const homeStr = (home.attack_rating + home.tactics_rating) / 2 + 5; // home advantage
  const awayStr = (away.attack_rating + away.tactics_rating) / 2;
  const homeDef = (home.defense_rating + home.discipline_rating) / 2 + 3;
  const awayDef = (away.defense_rating + away.discipline_rating) / 2;

  // Expected goals (Poisson-ish)
  const homeExpected = Math.max(0.3, (homeStr - awayDef * 0.6) / 30);
  const awayExpected = Math.max(0.2, (awayStr - homeDef * 0.6) / 30);

  const homeGoals = poissonRandom(homeExpected);
  const awayGoals = poissonRandom(awayExpected);

  // Generate match events
  const events: any[] = [];
  const allMinutes: number[] = [];

  for (let g = 0; g < homeGoals; g++) {
    const min = 1 + Math.floor(Math.random() * 90);
    allMinutes.push(min);
    events.push({ minute: min, type: "goal", team: "home", player_name: FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)] });
  }
  for (let g = 0; g < awayGoals; g++) {
    const min = 1 + Math.floor(Math.random() * 90);
    allMinutes.push(min);
    events.push({ minute: min, type: "goal", team: "away", player_name: FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)] });
  }

  // Occasional cards
  if (Math.random() < 0.4) {
    events.push({ minute: 20 + Math.floor(Math.random() * 60), type: "yellow_card", team: Math.random() > 0.5 ? "home" : "away", player_name: FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)] });
  }
  if (Math.random() < 0.08) {
    events.push({ minute: 30 + Math.floor(Math.random() * 50), type: "red_card", team: Math.random() > 0.5 ? "home" : "away", player_name: FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)] });
  }

  events.sort((a, b) => a.minute - b.minute);

  const highlight = homeGoals + awayGoals === 0
    ? "Bezbrankový zápas plný taktiky."
    : homeGoals > awayGoals + 1
    ? "Dominantní výkon domácích!"
    : awayGoals > homeGoals + 1
    ? "Hosté překvapili arénu!"
    : homeGoals === awayGoals
    ? "Vyrovnaný boj o každý míč."
    : "Dramatický souboj až do konce.";

  return {
    homeGoals, awayGoals, events, highlight,
    attendance: 500 + Math.floor(Math.random() * 2000),
  };
}

function poissonRandom(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return Math.min(k - 1, 6); // cap at 6 goals
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
    played: st.played + 1,
    wins: st.wins + (won ? 1 : 0),
    draws: st.draws + (draw ? 1 : 0),
    losses: st.losses + (!won && !draw ? 1 : 0),
    goals_for: st.goals_for + goalsFor,
    goals_against: st.goals_against + goalsAgainst,
    points: st.points + pts,
    form,
  }).eq("id", st.id);
}

// ═══ ROUND-ROBIN SCHEDULE GENERATOR ═══
function generateRoundRobin(teamIds: string[], matchesPerPairing: number): [string, string][][] {
  const teams = [...teamIds];
  if (teams.length % 2 !== 0) teams.push("BYE");

  const n = teams.length;
  const rounds: [string, string][][] = [];

  for (let pass = 0; pass < matchesPerPairing; pass++) {
    for (let round = 0; round < n - 1; round++) {
      const matches: [string, string][] = [];
      for (let i = 0; i < n / 2; i++) {
        const home = teams[i];
        const away = teams[n - 1 - i];
        if (home === "BYE" || away === "BYE") continue;
        // Alternate home/away for second pass
        if (pass % 2 === 0) {
          matches.push([home, away]);
        } else {
          matches.push([away, home]);
        }
      }
      if (matches.length > 0) rounds.push(matches);

      // Rotate teams (keep first fixed)
      const last = teams.pop()!;
      teams.splice(1, 0, last);
    }
  }

  return rounds;
}
