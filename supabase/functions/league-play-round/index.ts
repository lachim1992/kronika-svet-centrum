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
    for (const [tier, tierTeams] of tierMap.entries()) {
      if (tierTeams.length < 2) continue;
      const result = await playTierRound(sb, session_id, currentTurn, tier, tierTeams);
      if (result.matches) allResults.push(...result.matches);
      if (result.seasonComplete) anySeasonComplete = true;
    }

    if (anySeasonComplete) await handlePromotionRelegation(sb, session_id);

    // Dynamic stat changes (form, aging, growth, injuries)
    await applyDynamicStatChanges(sb, session_id, currentTurn);

    // AI commentary
    let commentary = "";
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (LOVABLE_API_KEY && allResults.length > 0) {
      try {
        const prompt = `Jsi kronikář starověké ligy Sphaera – brutálního týmového sportu s kovovou koulí, kde se hráči mohou fyzicky napadat. Napiš krátký komentář (5-8 vět, česky) k výsledkům kola:
${allResults.map(m => `${m.home} ${m.homeScore}:${m.awayScore} ${m.away} (vyřazení: ${m.knockouts || 0})`).join("\n")}
Styl: dramatický, kronikářský, krvavý. Zmín brutální momenty, vyřazené hráče, crowd reakce. NEPOUŽÍVEJ markdown.`;
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
          body: JSON.stringify({ model: "google/gemini-2.5-flash-lite", messages: [{ role: "user", content: prompt }], max_tokens: 500 }),
        });
        if (aiResp.ok) { const d = await aiResp.json(); commentary = d.choices?.[0]?.message?.content?.trim() || ""; }
      } catch (e) { console.error("AI commentary:", e); }
    }

    return new Response(JSON.stringify({ ok: true, round: allResults[0]?.round || 0, matches: allResults, commentary, seasonComplete: anySeasonComplete }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("league-play-round error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

// ========== DYNAMIC STAT CHANGES ==========
async function applyDynamicStatChanges(sb: any, session_id: string, currentTurn: number) {
  const { data: players } = await sb.from("league_players").select("*").eq("session_id", session_id);
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
    if ((p.injury_turns || 0) > 0) { u.injury_turns = p.injury_turns - 1; if (u.injury_turns <= 0) { u.is_injured = false; u.injury_turns = 0; } }
    if (!p.is_injured && Math.random() < 0.03) { u.is_injured = true; u.injury_turns = 1 + Math.floor(Math.random() * 3); }
    const form = p.form || 50;
    u.form = Math.max(10, Math.min(95, form + (form > 50 ? -Math.floor(Math.random() * 4) : Math.floor(Math.random() * 4))));
    const str = u.strength ?? p.strength ?? 50, spd = u.speed ?? p.speed ?? 50, tch = u.technique ?? p.technique ?? 50, sta = u.stamina ?? p.stamina ?? 50;
    const posW: Record<string, number[]> = {
      praetor: [0.15, 0.15, 0.35, 0.2], guardian: [0.35, 0.1, 0.2, 0.25],
      striker: [0.15, 0.35, 0.3, 0.1], carrier: [0.1, 0.2, 0.45, 0.15], exactor: [0.4, 0.15, 0.1, 0.2],
      // Legacy fallback
      goalkeeper: [0.15, 0.1, 0.4, 0.2], defender: [0.3, 0.15, 0.2, 0.25], midfielder: [0.15, 0.2, 0.35, 0.25], attacker: [0.15, 0.35, 0.3, 0.1],
    };
    const w = posW[p.position] || [0.25, 0.25, 0.25, 0.25];
    u.overall_rating = Math.round((str * w[0] + spd * w[1] + tch * w[2] + sta * w[3]) * 0.7 + (u.form ?? form) * 0.3);
    if (Object.keys(u).length > 0) await sb.from("league_players").update(u).eq("id", p.id);
  }
}

// ========== PLAY TIER ROUND ==========
async function playTierRound(sb: any, session_id: string, currentTurn: number, tier: number, tierTeams: any[]) {
  let { data: season } = await sb.from("league_seasons").select("*").eq("session_id", session_id).eq("league_tier", tier).eq("status", "active").maybeSingle();
  if (!season) {
    const { count: past } = await sb.from("league_seasons").select("id", { count: "exact", head: true }).eq("session_id", session_id).eq("league_tier", tier);
    const n = tierTeams.length, adj = n % 2 === 0 ? n : n + 1;
    const { data: ns } = await sb.from("league_seasons").insert({
      session_id, season_number: (past || 0) + 1, status: "active", started_turn: currentTurn,
      total_rounds: (adj - 1) * 2, current_round: 0, matches_per_round: Math.floor(n / 2),
      league_tier: tier, promotion_count: tier > 1 ? 2 : 0, relegation_count: tier === 1 ? 2 : 0,
    }).select("*").single();
    if (!ns) throw new Error(`Failed season tier ${tier}`);
    season = ns;
    for (const t of tierTeams) await sb.from("league_standings").insert({ session_id, season_id: season.id, team_id: t.id });
    const schedule = generateDoubleRoundRobin(tierTeams.map(t => t.id));
    let rn = 0;
    for (const round of schedule) { rn++; for (const [h, a] of round) await sb.from("league_matches").insert({ session_id, season_id: season.id, round_number: rn, turn_number: currentTurn + rn, home_team_id: h, away_team_id: a }); }
  }

  const { data: nextMatches } = await sb.from("league_matches").select("*").eq("season_id", season.id).eq("status", "scheduled").order("round_number", { ascending: true });
  if (!nextMatches || nextMatches.length === 0) return { matches: [], seasonComplete: true };

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

    // Process player stat updates from events
    for (const evt of result.events) {
      if (evt.type === "goal" && evt.player_id) { const { data: pl } = await sb.from("league_players").select("goals_scored, goals, form").eq("id", evt.player_id).maybeSingle(); if (pl) await sb.from("league_players").update({ goals_scored: (pl.goals_scored||0)+1, goals: (pl.goals||0)+1, form: Math.min(95, (pl.form||50)+4) }).eq("id", evt.player_id); }
      if (evt.type === "breakthrough" && evt.player_id) { const { data: pl } = await sb.from("league_players").select("goals_scored, goals, form").eq("id", evt.player_id).maybeSingle(); if (pl) await sb.from("league_players").update({ goals_scored: (pl.goals_scored||0)+1, goals: (pl.goals||0)+1, form: Math.min(95, (pl.form||50)+6) }).eq("id", evt.player_id); }
      if (evt.type === "assist" && evt.player_id) { const { data: pl } = await sb.from("league_players").select("assists, form").eq("id", evt.player_id).maybeSingle(); if (pl) await sb.from("league_players").update({ assists: (pl.assists||0)+1, form: Math.min(95, (pl.form||50)+2) }).eq("id", evt.player_id); }
      if (evt.type === "knockout" && evt.player_id) { const { data: pl } = await sb.from("league_players").select("yellow_cards, form").eq("id", evt.player_id).maybeSingle(); if (pl) await sb.from("league_players").update({ yellow_cards: (pl.yellow_cards||0)+1, form: Math.min(95, (pl.form||50)+3) }).eq("id", evt.player_id); }
      if (evt.type === "injury" && evt.player_id) await sb.from("league_players").update({ is_injured: true, injury_turns: 1+Math.floor(Math.random()*3) }).eq("id", evt.player_id);
      if (evt.type === "brutal_foul" && evt.player_id) { const { data: pl } = await sb.from("league_players").select("yellow_cards").eq("id", evt.player_id).maybeSingle(); if (pl) await sb.from("league_players").update({ yellow_cards: (pl.yellow_cards||0)+1 }).eq("id", evt.player_id); }
    }
    for (const pid of [...result.homePlayed, ...result.awayPlayed]) { const { data: pl } = await sb.from("league_players").select("matches_played, condition, form").eq("id", pid).maybeSingle(); if (pl) await sb.from("league_players").update({ matches_played: (pl.matches_played||0)+1, condition: Math.max(20, (pl.condition||100)-12-Math.floor(Math.random()*12)), form: Math.max(10, Math.min(95, (pl.form||50)+(Math.random()>0.5?2:-2))) }).eq("id", pid); }

    matchResults.push({ home: home.team_name, away: away.team_name, homeScore: result.homeScore, awayScore: result.awayScore, knockouts: result.knockouts, highlight: result.highlight, events: result.events, round: roundNumber, tier, crowdMood: result.crowdMood });
  }

  await sb.from("league_seasons").update({ current_round: roundNumber }).eq("id", season.id);
  const { data: standings } = await sb.from("league_standings").select("id, points, goals_for, goals_against").eq("season_id", season.id);
  const sorted = (standings || []).sort((a: any, b: any) => { if (b.points !== a.points) return b.points - a.points; const dA = a.goals_for-a.goals_against, dB = b.goals_for-b.goals_against; if (dB !== dA) return dB-dA; return b.goals_for-a.goals_for; });
  for (let i = 0; i < sorted.length; i++) await sb.from("league_standings").update({ position: i+1 }).eq("id", sorted[i].id);

  const { count: remaining } = await sb.from("league_matches").select("id", { count: "exact", head: true }).eq("season_id", season.id).eq("status", "scheduled");
  let seasonComplete = false;
  if (remaining === 0) { seasonComplete = true; await concludeSeason(sb, session_id, season, tierTeams); }
  return { matches: matchResults, seasonComplete };
}

// ========== SPHAERA MATCH SIMULATION ==========
// 3 periods, actions per period, Sphaera scoring: goal=3, breakthrough=5, knockout=+1
function simulateSphaera(home: any, away: any, homePlayers: any[], awayPlayers: any[]) {
  const hEff = calcTeamEffective(homePlayers), aEff = calcTeamEffective(awayPlayers);
  const hAtk = hEff.attack * 0.8 + (home.attack_rating || 40) * 0.2;
  const hDef = hEff.defense * 0.8 + (home.defense_rating || 40) * 0.2;
  const hBrut = hEff.brutality;
  const aAtk = aEff.attack * 0.8 + (away.attack_rating || 40) * 0.2;
  const aDef = aEff.defense * 0.8 + (away.defense_rating || 40) * 0.2;
  const aBrut = aEff.brutality;

  let homeScore = 0, awayScore = 0;
  const events: any[] = [];
  let knockouts = 0;

  // Crowd meter: starts neutral, shifts based on action
  let crowdMeter = 50; // 0=hostile, 100=ecstatic

  const hStrikers = homePlayers.filter(p => ["attacker", "striker"].includes(p.position));
  const hCarriers = homePlayers.filter(p => ["midfielder", "carrier"].includes(p.position));
  const hExactors = homePlayers.filter(p => ["exactor"].includes(p.position));
  const aStrikers = awayPlayers.filter(p => ["attacker", "striker"].includes(p.position));
  const aCarriers = awayPlayers.filter(p => ["midfielder", "carrier"].includes(p.position));
  const aExactors = awayPlayers.filter(p => ["exactor"].includes(p.position));

  // 3 periods, 5-7 actions each
  for (let period = 1; period <= 3; period++) {
    const actions = 5 + Math.floor(Math.random() * 3);
    for (let action = 0; action < actions; action++) {
      const minute = (period - 1) * 30 + Math.floor((action / actions) * 30) + 1;
      const homeAdvantage = crowdMeter > 60 ? 1.08 : crowdMeter < 40 ? 0.95 : 1.03;

      // === HOME ATTACK ===
      const hChance = (hAtk * homeAdvantage - aDef * 0.5) / 80;
      if (Math.random() < hChance) {
        // Breakthrough (solo run, no assist) — rarer, worth 5 pts
        if (Math.random() < 0.15) {
          const scorer = pickWeighted([...hStrikers, ...hCarriers], p => (p.technique||50) + (p.speed||50)*0.7 + (p.form||50)*0.3);
          if (scorer) {
            homeScore += 5;
            events.push({ minute, type: "breakthrough", team: "home", player_name: scorer.name, player_id: scorer.id, points: 5, period });
            crowdMeter = Math.min(100, crowdMeter + 10);
          }
        } else {
          // Normal goal — worth 3 pts
          const scorer = pickWeighted([...hStrikers, ...hCarriers], p => (p.technique||50) + (p.speed||50)*0.5 + (p.form||50)*0.3);
          const assister = pickWeighted(homePlayers.filter(p => p.id !== scorer?.id), p => (p.technique||50) + (p.leadership||20)*0.3);
          if (scorer) {
            homeScore += 3;
            events.push({ minute, type: "goal", team: "home", player_name: scorer.name, player_id: scorer.id, points: 3, period });
            if (assister && Math.random() > 0.3) events.push({ minute, type: "assist", team: "home", player_name: assister.name, player_id: assister.id, period });
            crowdMeter = Math.min(100, crowdMeter + 5);
          }
        }
      }

      // === AWAY ATTACK ===
      const aChance = (aAtk - hDef * 0.5) / 80;
      if (Math.random() < aChance) {
        if (Math.random() < 0.15) {
          const scorer = pickWeighted([...aStrikers, ...aCarriers], p => (p.technique||50) + (p.speed||50)*0.7 + (p.form||50)*0.3);
          if (scorer) {
            awayScore += 5;
            events.push({ minute, type: "breakthrough", team: "away", player_name: scorer.name, player_id: scorer.id, points: 5, period });
            crowdMeter = Math.max(0, crowdMeter - 8);
          }
        } else {
          const scorer = pickWeighted([...aStrikers, ...aCarriers], p => (p.technique||50) + (p.speed||50)*0.5 + (p.form||50)*0.3);
          const assister = pickWeighted(awayPlayers.filter(p => p.id !== scorer?.id), p => (p.technique||50) + (p.leadership||20)*0.3);
          if (scorer) {
            awayScore += 3;
            events.push({ minute, type: "goal", team: "away", player_name: scorer.name, player_id: scorer.id, points: 3, period });
            if (assister && Math.random() > 0.3) events.push({ minute, type: "assist", team: "away", player_name: assister.name, player_id: assister.id, period });
            crowdMeter = Math.max(0, crowdMeter - 5);
          }
        }
      }

      // === KNOCKOUTS (Exactor special) ===
      // Home exactor tries to knock out opponent
      const allExactors = [...(hExactors.length > 0 ? hExactors : homePlayers.filter(p => (p.aggression||30) > 50)), ...(aExactors.length > 0 ? aExactors : awayPlayers.filter(p => (p.aggression||30) > 50))];
      for (const ex of allExactors) {
        const isHome = homePlayers.some(p => p.id === ex.id);
        const targets = isHome ? awayPlayers : homePlayers;
        const koChance = ((ex.strength||50) + (ex.aggression||30)) / 800;
        if (Math.random() < koChance) {
          const victim = pickWeighted(targets, p => 100 - (p.strength||50)); // weaker targets more likely
          if (victim) {
            const team = isHome ? "home" : "away";
            if (isHome) homeScore += 1; else awayScore += 1;
            knockouts++;
            events.push({ minute, type: "knockout", team, player_name: ex.name, player_id: ex.id, victim_name: victim.name, victim_id: victim.id, points: 1, period });
            // Victim might get injured
            if (Math.random() < 0.4) {
              events.push({ minute, type: "injury", team: isHome ? "away" : "home", player_name: victim.name, player_id: victim.id, period });
            }
            crowdMeter = Math.min(100, crowdMeter + (isHome ? 4 : -3));
          }
        }
      }

      // === BRUTAL FOULS ===
      for (const pool of [{ players: homePlayers, team: "home" }, { players: awayPlayers, team: "away" }]) {
        for (const p of pool.players) {
          if (Math.random() < (p.aggression || 30) / 600) {
            events.push({ minute, type: "brutal_foul", team: pool.team, player_name: p.name, player_id: p.id, period });
            crowdMeter = Math.min(100, crowdMeter + (pool.team === "home" ? -2 : 2));
          }
        }
      }

      // === INJURIES (condition-based) ===
      for (const pool of [{ players: homePlayers, team: "home" }, { players: awayPlayers, team: "away" }]) {
        for (const p of pool.players) {
          const injuryChance = (100 - (p.condition || 100)) / 1000 + 0.008;
          if (Math.random() < injuryChance) {
            events.push({ minute, type: "injury", team: pool.team, player_name: p.name, player_id: p.id, period });
          }
        }
      }

      // === CROWD EVENTS ===
      if (crowdMeter < 25 && Math.random() < 0.15) {
        events.push({ minute, type: "crowd_riot", period, description: "Dav hází předměty na hřiště!" });
        crowdMeter = Math.max(0, crowdMeter - 5);
      } else if (crowdMeter > 85 && Math.random() < 0.1) {
        events.push({ minute, type: "crowd_chant", period, description: "Tribuny se otřásají skandováním!" });
      }
    }
  }

  events.sort((a, b) => a.minute - b.minute);

  // Crowd mood label
  const crowdMood = crowdMeter > 75 ? "Extáze" : crowdMeter > 55 ? "Nadšení" : crowdMeter > 40 ? "Napětí" : crowdMeter > 20 ? "Hněv" : "Chaos";

  const totalGoals = events.filter(e => e.type === "goal" || e.type === "breakthrough").length;
  const highlight = totalGoals === 0
    ? "Krutý boj bez jediného bodu. Sphaera zůstala mrtvá."
    : homeScore > awayScore + 5 ? "Domácí dominance! Aréna řvala krví a slávou."
    : awayScore > homeScore + 5 ? "Hosté ztrhali domácí obranu na kusy!"
    : knockouts >= 3 ? "Brutální masakr! Více vyřazených než bodů."
    : homeScore === awayScore ? "Vyrovnaný boj – Sphaera nikoho neušetřila."
    : "Dramatický souboj v prachu arény.";

  return {
    homeScore, awayScore, events, highlight, knockouts, crowdMood,
    attendance: 500 + Math.floor(Math.random() * 2500),
    homePlayed: homePlayers.slice(0, 11).map(p => p.id),
    awayPlayed: awayPlayers.slice(0, 11).map(p => p.id),
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
function poissonRandom(l: number): number { const L = Math.exp(-l); let k=0, p=1; do { k++; p*=Math.random(); } while (p > L); return Math.min(k-1, 6); }

async function updateStandings(sb: any, sid: string, tid: string, gf: number, ga: number) {
  const { data: st } = await sb.from("league_standings").select("*").eq("season_id", sid).eq("team_id", tid).single();
  if (!st) return;
  const w = gf > ga, d = gf === ga, pts = w ? 3 : d ? 1 : 0;
  await sb.from("league_standings").update({ played: st.played+1, wins: st.wins+(w?1:0), draws: st.draws+(d?1:0), losses: st.losses+(!w&&!d?1:0), goals_for: st.goals_for+gf, goals_against: st.goals_against+ga, points: st.points+pts, form: ((w?"W":d?"D":"L")+(st.form||"")).slice(0,5) }).eq("id", st.id);
}

async function concludeSeason(sb: any, session_id: string, season: any, tierTeams: any[]) {
  const { data: fs } = await sb.from("league_standings").select("*, league_teams(team_name, player_name)").eq("season_id", season.id);
  const sorted = (fs||[]).sort((a: any,b: any) => { if (b.points!==a.points) return b.points-a.points; const dA=a.goals_for-a.goals_against, dB=b.goals_for-b.goals_against; if (dB!==dA) return dB-dA; return b.goals_for-a.goals_for; });
  const champ = sorted[0];
  const tids = sorted.map((s: any) => s.team_id);
  const { data: ts } = await sb.from("league_players").select("id, goals_scored").in("team_id", tids).order("goals_scored", { ascending: false }).limit(1).maybeSingle();
  const bestDef = [...sorted].sort((a: any,b: any) => a.goals_against-b.goals_against)[0];
  await sb.from("league_seasons").update({ status: "concluded", ended_turn: (await sb.from("game_sessions").select("current_turn").eq("id", session_id).single()).data?.current_turn||0, champion_team_id: champ?.team_id||null, top_scorer_player_id: ts?.id||null, best_defense_team_id: bestDef?.team_id||null }).eq("id", season.id);
  if (champ?.team_id) {
    const { data: ct } = await sb.from("league_teams").select("titles_won").eq("id", champ.team_id).single();
    if (ct) await sb.from("league_teams").update({ titles_won: (ct.titles_won||0)+1 }).eq("id", champ.team_id);
    const cp = (champ as any).league_teams?.player_name;
    if (cp) { const { data: a } = await sb.from("sports_associations").select("id, reputation").eq("session_id", session_id).eq("player_name", cp).maybeSingle(); if (a) await sb.from("sports_associations").update({ reputation: (a.reputation||0)+10 }).eq("id", a.id); }
  }
  for (const st of sorted) { const { data: t } = await sb.from("league_teams").select("seasons_played, total_wins, total_draws, total_losses, total_goals_for, total_goals_against").eq("id", st.team_id).single(); if (t) await sb.from("league_teams").update({ seasons_played: (t.seasons_played||0)+1, total_wins: (t.total_wins||0)+st.wins, total_draws: (t.total_draws||0)+st.draws, total_losses: (t.total_losses||0)+st.losses, total_goals_for: (t.total_goals_for||0)+st.goals_for, total_goals_against: (t.total_goals_against||0)+st.goals_against }).eq("id", st.team_id); }
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
