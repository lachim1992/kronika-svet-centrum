import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIRST_NAMES = [
  "Aethon","Brutus","Cassian","Darius","Eneas","Felix","Gaius","Hector",
  "Icarus","Julius","Kaelen","Leon","Marcus","Nero","Orion","Primus",
  "Quintus","Rex","Servius","Titus","Ulric","Varro","Xander","Zeno",
  "Ajax","Balthus","Corvus","Drago","Erebus","Falco","Gryphon","Hadrian",
  "Agrippa","Ares","Bellator","Caelus","Dominus","Ferox","Gladius","Ignis",
  "Kael","Lancer","Maximus","Noctis","Octavus","Pontus","Regulus","Silvanus",
  "Theron","Umber","Valens","Wraith","Xenos","Yaroslav","Zenith","Alaric",
  "Bastion","Cyrus","Decimus","Ebon","Fury","Gideon","Haldor","Invictus",
];

const TEAM_PREFIXES = [
  "Legie","Gladiátoři","Válečníci","Štíty","Orlové","Drakouni","Krkavci",
  "Kladiva","Blesky","Stíny","Titáni","Korunní","Býci","Sokoli","Jaguáři",
  "Hadi","Lvi","Vlci","Škorpioni","Medvědi","Jestřábi","Fenixové","Draci",
  "Centauři","Berserci","Spartáni","Valkýry","Démoni","Goliáši","Hydry",
];

const MOTTOS = [
  "Krev a čest!","Sphaera si žádá oběť.","Vítězství nebo smrt!",
  "Aréna je náš domov.","Nesmilujeme se.","Za slávu a zlato!",
  "Kosti se lámou, duch ne.","Strach neznáme.","Až do poslední kapky!",
  "Síla v jednotě!","Ocel a oheň!","Přežijí jen silní.",
];

const POSITIONS = [
  { pos: "praetor", count: 2 },
  { pos: "guardian", count: 5 },
  { pos: "striker", count: 7 },
  { pos: "carrier", count: 4 },
  { pos: "exactor", count: 4 },
];

const COLORS = [
  "#8b0000","#1a1a2e","#2d5a27","#1e3a5f","#5c2d91","#8b4513","#191970",
  "#006400","#800080","#b22222","#2f4f4f","#4b0082","#556b2f","#8b008b",
  "#483d8b","#008080","#b8860b","#a0522d","#6b8e23","#708090",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, players_per_team = 22 } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Get ALL cities in the session
    const { data: cities, error: citiesErr } = await sb.from("cities")
      .select("id, name, owner_player, development_level, city_stability, population_total, status")
      .eq("session_id", session_id);
    
    const liveCities = (cities || []).filter(c => !["ruins","razed","abandoned"].includes(c.status));

    if (citiesErr) { console.error("Cities query error:", citiesErr); }
    if (liveCities.length === 0) {
      return new Response(JSON.stringify({ error: "Žádná města v této hře" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get existing associations
    const { data: existingAssocs } = await sb.from("sports_associations")
      .select("id, player_name, city_id, association_type")
      .eq("session_id", session_id);

    const assocByPlayer = new Map<string, any>();
    for (const a of (existingAssocs || [])) {
      assocByPlayer.set(a.player_name, a);
    }

    // Get AI factions to identify AI players
    const { data: aiFactions } = await sb.from("ai_factions")
      .select("faction_name")
      .eq("session_id", session_id)
      .eq("is_active", true);
    const aiFactionNames = new Set((aiFactions || []).map(f => f.faction_name));

    // Identify all unique city owners
    const allOwners = [...new Set(liveCities.map(c => c.owner_player))];

    // Auto-create associations for AI players who don't have one
    let assocsCreated = 0;
    for (const owner of allOwners) {
      if (assocByPlayer.has(owner)) continue;
      if (!aiFactionNames.has(owner)) continue; // only auto-create for AI

      // Find capital or first city of this AI player
      const aiCity = liveCities.find(c => c.owner_player === owner);
      if (!aiCity) continue;

      const { data: newAssoc, error: assocErr } = await sb.from("sports_associations").insert({
        session_id,
        player_name: owner,
        city_id: aiCity.id,
        name: `Svaz Sphaery – ${owner}`,
        association_type: "sphaera",
        motto: `Za slávu ${owner}!`,
        color_primary: COLORS[Math.floor(Math.random() * COLORS.length)],
        color_secondary: COLORS[Math.floor(Math.random() * COLORS.length)],
      }).select("id, player_name, city_id, association_type").single();

      if (assocErr) { console.error("Auto-create assoc error:", assocErr); continue; }
      assocByPlayer.set(owner, newAssoc);
      assocsCreated++;
    }

    // Stadiums for auto-assignment
    const { data: stadiums } = await sb.from("city_buildings")
      .select("id, city_id")
      .eq("session_id", session_id)
      .eq("status", "completed")
      .contains("building_tags", ["stadium"]);

    const stadiumByCity = new Map<string, string>();
    for (const s of (stadiums || [])) {
      if (!stadiumByCity.has(s.city_id)) stadiumByCity.set(s.city_id, s.id);
    }

    // Get existing teams
    const { data: existingTeams } = await sb.from("league_teams")
      .select("id, city_id, team_name")
      .eq("session_id", session_id)
      .eq("is_active", true);

    const teamsByCity = new Map<string, any[]>();
    for (const t of (existingTeams || [])) {
      const list = teamsByCity.get(t.city_id) || [];
      list.push(t);
      teamsByCity.set(t.city_id, list);
    }

    // Get existing players to check who needs more
    const existingTeamIds = (existingTeams || []).map(t => t.id);
    const { data: existingPlayers } = existingTeamIds.length > 0
      ? await sb.from("league_players").select("team_id").in("team_id", existingTeamIds)
      : { data: [] };

    const playerCountByTeam = new Map<string, number>();
    for (const p of (existingPlayers || [])) {
      playerCountByTeam.set(p.team_id, (playerCountByTeam.get(p.team_id) || 0) + 1);
    }

    let teamsCreated = 0;
    let playersCreated = 0;
    const usedTeamNames = new Set((existingTeams || []).map(t => t.team_name));

    for (const city of liveCities) {
      const assoc = assocByPlayer.get(city.owner_player);
      if (!assoc) continue; // no association for this player (human without assoc — skip)

      const cityTeams = teamsByCity.get(city.id) || [];
      const needed = 3 - cityTeams.length;
      if (needed <= 0) continue;

      const stadiumId = stadiumByCity.get(city.id) || null;
      const baseRating = 30 + Math.floor((city.development_level || 1) * 3) + Math.floor((city.city_stability || 50) * 0.2);

      for (let i = 0; i < needed; i++) {
        let teamName: string;
        let attempts = 0;
        do {
          const prefix = TEAM_PREFIXES[Math.floor(Math.random() * TEAM_PREFIXES.length)];
          teamName = `${prefix} ${city.name}`;
          attempts++;
          if (attempts > 30) teamName = `${prefix} ${city.name} ${romanNumeral(cityTeams.length + i + 1)}`;
        } while (usedTeamNames.has(teamName) && attempts <= 30);
        usedTeamNames.add(teamName);

        const c1 = COLORS[Math.floor(Math.random() * COLORS.length)];
        let c2 = COLORS[Math.floor(Math.random() * COLORS.length)];
        while (c2 === c1) c2 = COLORS[Math.floor(Math.random() * COLORS.length)];

        const tier = cityTeams.length + i < 2 ? 1 : 2;

        const { data: team, error: teamErr } = await sb.from("league_teams").insert({
          session_id, city_id: city.id,
          stadium_building_id: stadiumId,
          player_name: city.owner_player,
          team_name: teamName,
          association_id: assoc.id,
          motto: MOTTOS[Math.floor(Math.random() * MOTTOS.length)],
          color_primary: c1, color_secondary: c2,
          attack_rating: baseRating + Math.floor(Math.random() * 20) - 10,
          defense_rating: baseRating + Math.floor(Math.random() * 20) - 10,
          tactics_rating: baseRating + Math.floor(Math.random() * 15) - 7,
          discipline_rating: baseRating + Math.floor(Math.random() * 15) - 7,
          popularity: Math.floor((city.population_total || 100) / 100),
          fan_base: Math.floor((city.population_total || 100) / 5),
          league_tier: tier,
        }).select("id").single();

        if (teamErr) { console.error("Team create error:", teamErr); continue; }

        await generatePlayersForTeam(sb, session_id, team!.id, players_per_team);
        teamsCreated++;
        playersCreated += players_per_team;
      }

      // Fill existing teams to target player count
      for (const existingTeam of cityTeams) {
        const currentCount = playerCountByTeam.get(existingTeam.id) || 0;
        const playersNeeded = players_per_team - currentCount;
        if (playersNeeded > 0) {
          await generatePlayersForTeam(sb, session_id, existingTeam.id, playersNeeded);
          playersCreated += playersNeeded;
        }
      }
    }

    // ═══ AUTO-INTEGRATE into unplayed season ═══
    let seasonReset = false;
    if (teamsCreated > 0) {
      // Find active season with 0 played matches
      const { data: activeSeason } = await sb.from("league_seasons")
        .select("id, season_number, started_turn, league_tier")
        .eq("session_id", session_id).eq("status", "active").maybeSingle();

      if (activeSeason) {
        const { count: playedCount } = await sb.from("league_matches")
          .select("id", { count: "exact", head: true })
          .eq("season_id", activeSeason.id).eq("status", "played");

        if ((playedCount || 0) === 0) {
          // No matches played yet — safe to reset the season with all teams
          // Delete old matches and standings
          await sb.from("league_matches").delete().eq("season_id", activeSeason.id);
          await sb.from("league_standings").delete().eq("season_id", activeSeason.id);

          // Get all active teams for this tier
          const tier = activeSeason.league_tier || 1;
          const { data: allActiveTeams } = await sb.from("league_teams")
            .select("id").eq("session_id", session_id).eq("is_active", true)
            .eq("league_tier", tier);

          const teamIds = (allActiveTeams || []).map(t => t.id);
          
          if (teamIds.length >= 2) {
            // Recreate standings
            for (const tid of teamIds) {
              await sb.from("league_standings").insert({
                session_id, season_id: activeSeason.id, team_id: tid,
              });
            }

            // Recreate schedule
            const matchesPerPairing = teamIds.length <= 4 ? 2 : 1;
            const schedule = generateRoundRobin(teamIds, matchesPerPairing);
            let roundNum = 0;
            for (const round of schedule) {
              roundNum++;
              const matchTurn = (activeSeason.started_turn || 1) + roundNum;
              for (const [home, away] of round) {
                await sb.from("league_matches").insert({
                  session_id, season_id: activeSeason.id, round_number: roundNum,
                  turn_number: matchTurn, home_team_id: home, away_team_id: away,
                });
              }
            }

            // Update season total rounds
            await sb.from("league_seasons").update({
              total_rounds: schedule.length,
              matches_per_round: Math.floor(teamIds.length / 2),
            }).eq("id", activeSeason.id);

            seasonReset = true;
          }
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true, teamsCreated, playersCreated, assocsCreated, seasonReset,
      cities: liveCities.length,
      message: `Vytvořeno ${assocsCreated} svazů, ${teamsCreated} týmů a ${playersCreated} hráčů.${seasonReset ? " Sezóna přegenerována se všemi týmy." : ""}`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("bulk-generate-teams error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function generatePlayersForTeam(sb: any, sessionId: string, teamId: string, count: number) {
  const { data: existing } = await sb.from("league_players").select("name").eq("team_id", teamId);
  const usedNames = new Set((existing || []).map((p: any) => p.name));
  const existingCount = existing?.length || 0;

  const fullRoster = [
    { pos: "praetor", count: 2 },
    { pos: "guardian", count: 5 },
    { pos: "striker", count: 7 },
    { pos: "carrier", count: 4 },
    { pos: "exactor", count: 4 },
  ];

  const rows: any[] = [];

  for (let i = 0; i < count; i++) {
    const slotIndex = existingCount + i;
    let position = "striker";
    let accumulated = 0;
    for (const pg of fullRoster) {
      accumulated += pg.count;
      if (slotIndex < accumulated) { position = pg.pos; break; }
    }

    let name: string;
    let attempts = 0;
    do {
      name = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
      if (attempts > 50) name += ` ${romanNumeral(Math.floor(Math.random() * 10) + 2)}`;
      attempts++;
    } while (usedNames.has(name) && attempts < 80);
    usedNames.add(name);

    const isCaptain = slotIndex === 0;
    const age = 17 + Math.floor(Math.random() * 16);
    const talentPotential = 25 + Math.floor(Math.random() * 70);
    const peakAge = 26 + Math.floor(Math.random() * 6);

    const posStats: Record<string, { str: number[], spd: number[], tch: number[], sta: number[], agg: number[] }> = {
      praetor:   { str: [35, 40], spd: [30, 35], tch: [45, 45], sta: [45, 35], agg: [15, 30] },
      guardian:  { str: [45, 45], spd: [25, 35], tch: [20, 35], sta: [50, 35], agg: [30, 40] },
      striker:   { str: [25, 45], spd: [45, 50], tch: [40, 50], sta: [35, 30], agg: [20, 35] },
      carrier:   { str: [25, 35], spd: [35, 40], tch: [50, 45], sta: [40, 35], agg: [10, 25] },
      exactor:   { str: [55, 40], spd: [25, 30], tch: [15, 30], sta: [45, 35], agg: [55, 40] },
    };
    const ps = posStats[position] || posStats.striker;

    rows.push({
      session_id: sessionId, team_id: teamId, name,
      position, is_captain: isCaptain,
      strength: ps.str[0] + Math.floor(Math.random() * ps.str[1]),
      speed: ps.spd[0] + Math.floor(Math.random() * ps.spd[1]),
      technique: ps.tch[0] + Math.floor(Math.random() * ps.tch[1]),
      stamina: ps.sta[0] + Math.floor(Math.random() * ps.sta[1]),
      aggression: ps.agg[0] + Math.floor(Math.random() * ps.agg[1]),
      leadership: isCaptain ? 60 + Math.floor(Math.random() * 35) : 5 + Math.floor(Math.random() * 50),
      overall_rating: 30 + Math.floor(Math.random() * 50),
      form: 30 + Math.floor(Math.random() * 60),
      condition: 70 + Math.floor(Math.random() * 30),
      age, talent_potential: talentPotential, peak_age: peakAge,
      birth_turn: 0,
    });
  }

  if (rows.length > 0) {
    const { error } = await sb.from("league_players").insert(rows);
    if (error) console.error("Player insert error:", error);
  }
}

function romanNumeral(n: number): string {
  const vals = [10,9,5,4,1], syms = ["X","IX","V","IV","I"];
  let r = ""; for (let i = 0; i < vals.length; i++) while (n >= vals[i]) { r += syms[i]; n -= vals[i]; }
  return r;
}
