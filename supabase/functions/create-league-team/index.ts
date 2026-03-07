import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIRST_NAMES = [
  "Aethon", "Brutus", "Cassian", "Darius", "Eneas", "Felix", "Gaius", "Hector",
  "Icarus", "Julius", "Kaelen", "Leon", "Marcus", "Nero", "Orion", "Primus",
  "Quintus", "Rex", "Servius", "Titus", "Ulric", "Varro", "Xander", "Zeno",
  "Ajax", "Balthus", "Corvus", "Drago", "Erebus", "Falco", "Gryphon", "Hadrian",
];

const POSITIONS = [
  { pos: "praetor", count: 1 },
  { pos: "guardian", count: 3 },
  { pos: "striker", count: 4 },
  { pos: "carrier", count: 2 },
  { pos: "exactor", count: 1 },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, cityId, buildingId, teamName, colorPrimary, colorSecondary, motto, playerName, associationId } = await req.json();

    // Association is now REQUIRED for team creation
    if (!sessionId || !cityId || !teamName || !playerName || !associationId) {
      return new Response(JSON.stringify({ error: "Missing required fields (associationId is required)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Verify association exists and belongs to the player
    const { data: assoc } = await sb.from("sports_associations")
      .select("id, player_name")
      .eq("id", associationId)
      .eq("session_id", sessionId)
      .single();
    if (!assoc || assoc.player_name !== playerName) {
      return new Response(JSON.stringify({ error: "Svaz neexistuje nebo nepatří tomuto hráči" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: city } = await sb.from("cities").select("name, owner_player, development_level, city_stability, population_total")
      .eq("id", cityId).eq("session_id", sessionId).single();
    if (!city || city.owner_player !== playerName) {
      return new Response(JSON.stringify({ error: "Město nepatří tomuto hráči" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existing } = await sb.from("league_teams")
      .select("id").eq("session_id", sessionId).eq("city_id", cityId).eq("is_active", true);
    if ((existing || []).length >= 3) {
      return new Response(JSON.stringify({ error: "Město už má maximální počet aktivních týmů (3)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stadium is OPTIONAL — just validate if provided
    if (buildingId) {
      const { data: building } = await sb.from("city_buildings")
        .select("id, building_tags, name").eq("id", buildingId).eq("status", "completed").maybeSingle();
      const tags = (building?.building_tags as string[]) || [];
      const nameLC = (building?.name || "").toLowerCase();
      const isStadium = tags.includes("stadium") || nameLC.includes("stadion") || nameLC.includes("závodiště") || nameLC.includes("hippodrom") || nameLC.includes("aréna") || nameLC.includes("arena");
      if (!building || !isStadium) {
        return new Response(JSON.stringify({ error: "Budova není aréna/stadion" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const baseRating = 30 + Math.floor((city.development_level || 1) * 3) + Math.floor((city.city_stability || 50) * 0.2);

    const { data: team, error: teamErr } = await sb.from("league_teams").insert({
      session_id: sessionId,
      city_id: cityId,
      stadium_building_id: buildingId || null,
      player_name: playerName,
      team_name: teamName,
      association_id: associationId,
      motto: motto || `Za čest ${city.name}! Sphaera si žádá krev.`,
      color_primary: colorPrimary || "#8b0000",
      color_secondary: colorSecondary || "#1a1a2e",
      attack_rating: baseRating + Math.floor(Math.random() * 20) - 10,
      defense_rating: baseRating + Math.floor(Math.random() * 20) - 10,
      tactics_rating: baseRating + Math.floor(Math.random() * 15) - 7,
      discipline_rating: baseRating + Math.floor(Math.random() * 15) - 7,
      popularity: Math.floor((city.population_total || 100) / 100),
      fan_base: Math.floor((city.population_total || 100) / 5),
    }).select("*").single();

    if (teamErr) throw teamErr;

    // Generate 11 Sphaera players
    const usedNames = new Set<string>();
    const playerRows: any[] = [];
    for (const posGroup of POSITIONS) {
      for (let i = 0; i < posGroup.count; i++) {
        let name: string;
        do {
          name = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
        } while (usedNames.has(name));
        usedNames.add(name);

        const isCaptain = posGroup.pos === "praetor";
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
        const ps = posStats[posGroup.pos] || posStats.striker;

        playerRows.push({
          session_id: sessionId, team_id: team.id, name,
          position: posGroup.pos, is_captain: isCaptain,
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
    }

    await sb.from("league_players").insert(playerRows);

    return new Response(JSON.stringify({ ok: true, team, playersCreated: playerRows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("create-league-team error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
