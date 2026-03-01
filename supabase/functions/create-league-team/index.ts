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
  { pos: "goalkeeper", count: 1 },
  { pos: "defender", count: 4 },
  { pos: "midfielder", count: 3 },
  { pos: "attacker", count: 3 },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, cityId, buildingId, teamName, colorPrimary, colorSecondary, motto, playerName } = await req.json();

    if (!sessionId || !cityId || !teamName || !playerName) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Check city ownership
    const { data: city } = await sb.from("cities").select("name, owner_player, development_level, city_stability, population_total")
      .eq("id", cityId).eq("session_id", sessionId).single();
    if (!city || city.owner_player !== playerName) {
      return new Response(JSON.stringify({ error: "Město nepatří tomuto hráči" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for existing team in this city
    const { data: existing } = await sb.from("league_teams")
      .select("id").eq("session_id", sessionId).eq("city_id", cityId).eq("is_active", true).maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ error: "Město už má aktivní tým" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check stadium building exists
    if (buildingId) {
      const { data: building } = await sb.from("city_buildings")
        .select("id, building_tags, name").eq("id", buildingId).eq("status", "completed").maybeSingle();
      const tags = (building?.building_tags as string[]) || [];
      const nameLC = (building?.name || "").toLowerCase();
      const isStadium = tags.includes("stadium") || nameLC.includes("stadion") || nameLC.includes("závodiště") || nameLC.includes("hippodrom");
      if (!building || !isStadium) {
        return new Response(JSON.stringify({ error: "Budova není stadion" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Base ratings from city
    const baseRating = 30 + Math.floor((city.development_level || 1) * 3) + Math.floor((city.city_stability || 50) * 0.2);

    const { data: team, error: teamErr } = await sb.from("league_teams").insert({
      session_id: sessionId,
      city_id: cityId,
      stadium_building_id: buildingId || null,
      player_name: playerName,
      team_name: teamName,
      motto: motto || `Za slávu ${city.name}!`,
      color_primary: colorPrimary || "#c4a000",
      color_secondary: colorSecondary || "#1a1a2e",
      attack_rating: baseRating + Math.floor(Math.random() * 20) - 10,
      defense_rating: baseRating + Math.floor(Math.random() * 20) - 10,
      tactics_rating: baseRating + Math.floor(Math.random() * 15) - 7,
      discipline_rating: baseRating + Math.floor(Math.random() * 15) - 7,
      popularity: Math.floor((city.population_total || 100) / 100),
      fan_base: Math.floor((city.population_total || 100) / 5),
    }).select("*").single();

    if (teamErr) throw teamErr;

    // Generate 11 players
    const usedNames = new Set<string>();
    const playerRows: any[] = [];
    for (const posGroup of POSITIONS) {
      for (let i = 0; i < posGroup.count; i++) {
        let name: string;
        do {
          name = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
        } while (usedNames.has(name));
        usedNames.add(name);

        const isCaptain = posGroup.pos === "midfielder" && i === 0;
        const posBonus: Record<string, number> =
          posGroup.pos === "goalkeeper" ? { technique: 15, speed: -5 } :
          posGroup.pos === "defender" ? { strength: 10, aggression: 5 } :
          posGroup.pos === "attacker" ? { speed: 10, technique: 5 } :
          { stamina: 5, technique: 5 };

        playerRows.push({
          session_id: sessionId, team_id: team.id, name,
          position: posGroup.pos, is_captain: isCaptain,
          strength: 35 + Math.floor(Math.random() * 30) + (posBonus.strength || 0),
          speed: 35 + Math.floor(Math.random() * 30) + (posBonus.speed || 0),
          technique: 35 + Math.floor(Math.random() * 30) + (posBonus.technique || 0),
          stamina: 40 + Math.floor(Math.random() * 25) + (posBonus.stamina || 0),
          aggression: 25 + Math.floor(Math.random() * 30) + (posBonus.aggression || 0),
          leadership: isCaptain ? 70 + Math.floor(Math.random() * 20) : Math.floor(Math.random() * 40),
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
