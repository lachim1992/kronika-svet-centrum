import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * check-victory: Evaluates victory conditions after each turn.
 * Called from commit-turn.
 *
 * Victory styles:
 *   domination — conquer all AI faction capital cities
 *   survival   — survive 3 resolved world crises
 *   story      — manual end (player triggers via UI)
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, playerName } = await req.json();
    if (!sessionId) {
      return json({ error: "sessionId required" }, 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get session
    const { data: session } = await sb
      .from("game_sessions")
      .select("id, current_turn, victory_status, game_mode")
      .eq("id", sessionId)
      .single();

    if (!session || session.victory_status !== "active") {
      return json({ checked: false, reason: "not_active" });
    }

    // Get world foundation for victory_style
    const { data: foundation } = await sb
      .from("world_foundations")
      .select("victory_style")
      .eq("session_id", sessionId)
      .single();

    const victoryStyle = foundation?.victory_style || "story";

    // Get all human players
    const { data: memberships } = await sb
      .from("game_memberships")
      .select("player_name")
      .eq("session_id", sessionId);
    const humanPlayers = (memberships || []).map((m: any) => m.player_name);

    let victoryResult: { won: boolean; winner?: string; data?: any } = { won: false };

    switch (victoryStyle) {
      case "domination":
        victoryResult = await checkDomination(sb, sessionId, humanPlayers);
        break;
      case "survival":
        victoryResult = await checkSurvival(sb, sessionId, humanPlayers);
        break;
      case "cultural":
        victoryResult = await checkCultural(sb, sessionId, humanPlayers);
        break;
      case "annexation":
        victoryResult = await checkAnnexation(sb, sessionId, humanPlayers);
        break;
      case "story":
        victoryResult = { won: false };
        break;
      default:
        victoryResult = { won: false };
    }

    // Always compute progress for UI
    const progress = await computeProgress(sb, sessionId, victoryStyle, humanPlayers);

    if (victoryResult.won) {
      await sb.from("game_sessions").update({
        victory_status: "won",
        victory_winner: victoryResult.winner,
        victory_data: { ...victoryResult.data, progress, victory_style: victoryStyle },
      }).eq("id", sessionId);

      // Create chronicle entry for the victory
      await sb.from("chronicle_entries").insert({
        session_id: sessionId,
        turn_from: session.current_turn,
        turn_to: session.current_turn,
        text: buildVictoryChronicle(victoryStyle, victoryResult.winner || "", session.current_turn),
        source_type: "system",
      });
    }

    return json({
      checked: true,
      victory_style: victoryStyle,
      won: victoryResult.won,
      winner: victoryResult.winner || null,
      progress,
    });
  } catch (e: any) {
    console.error("check-victory error:", e);
    return json({ error: e.message }, 500);
  }
});

// ── Domination: conquer all AI faction capital cities ──
async function checkDomination(sb: any, sessionId: string, humanPlayers: string[]) {
  const { data: aiFactions } = await sb
    .from("ai_factions")
    .select("faction_name, is_active")
    .eq("session_id", sessionId);

  if (!aiFactions || aiFactions.length === 0) return { won: false };

  // Find capital cities of AI factions (cities with is_capital=true owned originally by AI)
  const aiNames = aiFactions.map((f: any) => f.faction_name);
  const { data: capitalCities } = await sb
    .from("cities")
    .select("id, name, owner_player, is_capital")
    .eq("session_id", sessionId)
    .eq("is_capital", true)
    .in("name", aiNames.map((n: string) => n)); // Fallback: check by faction name match

  // Alternative: find first city of each AI faction
  const { data: allAiCities } = await sb
    .from("cities")
    .select("id, name, owner_player, founded_round, is_capital")
    .eq("session_id", sessionId)
    .in("owner_player", [...aiNames, ...humanPlayers])
    .order("founded_round", { ascending: true });

  // Determine capitals: for each AI faction, their first-founded city or any marked is_capital
  const aiCapitals: { id: string; name: string; owner_player: string; faction: string }[] = [];
  const seenFactions = new Set<string>();

  for (const city of (allAiCities || [])) {
    if (city.is_capital && aiNames.includes(city.owner_player)) {
      if (!seenFactions.has(city.owner_player)) {
        aiCapitals.push({ ...city, faction: city.owner_player });
        seenFactions.add(city.owner_player);
      }
    }
  }

  // Fallback: first city per AI faction
  for (const city of (allAiCities || [])) {
    const originalOwner = aiNames.find(n => n === city.owner_player || city.name?.includes(n));
    if (originalOwner && !seenFactions.has(originalOwner)) {
      aiCapitals.push({ ...city, faction: originalOwner });
      seenFactions.add(originalOwner);
    }
  }

  if (aiCapitals.length === 0) return { won: false };

  // Check if all AI capitals are now owned by a human player
  const conqueredByHuman = aiCapitals.filter(c =>
    humanPlayers.includes(c.owner_player)
  );

  if (conqueredByHuman.length === aiCapitals.length) {
    // Find which human owns the most
    const counts: Record<string, number> = {};
    for (const c of conqueredByHuman) {
      counts[c.owner_player] = (counts[c.owner_player] || 0) + 1;
    }
    const winner = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

    return {
      won: true,
      winner,
      data: {
        type: "domination",
        capitals_conquered: conqueredByHuman.map(c => ({ name: c.name, faction: c.faction })),
      },
    };
  }

  return { won: false };
}

// ── Survival: survive 3 resolved world crises ──
async function checkSurvival(sb: any, sessionId: string, humanPlayers: string[]) {
  const { data: crises } = await sb
    .from("world_crises")
    .select("id, status, title")
    .eq("session_id", sessionId)
    .eq("status", "resolved");

  const resolvedCount = crises?.length || 0;

  if (resolvedCount >= 3) {
    // Check that the human player still has at least 1 city
    const { data: cities } = await sb
      .from("cities")
      .select("id, owner_player")
      .eq("session_id", sessionId)
      .in("owner_player", humanPlayers)
      .neq("status", "destroyed");

    if (cities && cities.length > 0) {
      return {
        won: true,
        winner: humanPlayers[0],
        data: {
          type: "survival",
          crises_survived: resolvedCount,
          crises_list: crises?.map((c: any) => c.title) || [],
        },
      };
    }
  }

  return { won: false };
}

// ── Cultural: reach 100+ cultural_prestige ──
async function checkCultural(sb: any, sessionId: string, humanPlayers: string[]) {
  const { data: realms } = await sb
    .from("realm_resources")
    .select("player_name, cultural_prestige, military_prestige, economic_prestige")
    .eq("session_id", sessionId)
    .in("player_name", humanPlayers);

  for (const realm of (realms || [])) {
    if ((realm.cultural_prestige || 0) >= 100) {
      return {
        won: true,
        winner: realm.player_name,
        data: {
          type: "cultural",
          cultural_prestige: realm.cultural_prestige,
          military_prestige: realm.military_prestige || 0,
          economic_prestige: realm.economic_prestige || 0,
          total_prestige: (realm.cultural_prestige || 0) + (realm.military_prestige || 0) + (realm.economic_prestige || 0),
        },
      };
    }
  }

  return { won: false };
}

// ── Annexation: control the most annexed neutral nodes (threshold: 5) ──
const ANNEXATION_TARGET = 5;
async function checkAnnexation(sb: any, sessionId: string, humanPlayers: string[]) {
  const { data: nodes } = await sb
    .from("province_nodes")
    .select("id, controlled_by, is_neutral, autonomy_score")
    .eq("session_id", sessionId)
    .lte("autonomy_score", 20) // fully integrated (annexed)
    .not("controlled_by", "is", null);

  const counts: Record<string, number> = {};
  for (const n of nodes || []) {
    if (humanPlayers.includes(n.controlled_by)) {
      counts[n.controlled_by] = (counts[n.controlled_by] || 0) + 1;
    }
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return { won: false };
  const [winner, count] = ranked[0];
  if (count >= ANNEXATION_TARGET) {
    return {
      won: true,
      winner,
      data: {
        type: "annexation",
        annexed_count: count,
        target: ANNEXATION_TARGET,
        leaderboard: ranked.map(([p, c]) => ({ player: p, annexed: c })),
      },
    };
  }
  return { won: false };
}
async function computeProgress(sb: any, sessionId: string, victoryStyle: string, humanPlayers: string[]) {
  switch (victoryStyle) {
    case "domination": {
      const { data: aiFactions } = await sb
        .from("ai_factions")
        .select("faction_name")
        .eq("session_id", sessionId);
      const aiNames = (aiFactions || []).map((f: any) => f.faction_name);

      const { data: allCities } = await sb
        .from("cities")
        .select("id, name, owner_player, is_capital, founded_round")
        .eq("session_id", sessionId)
        .order("founded_round", { ascending: true });

      // Find capitals per AI faction
      const capitals: { faction: string; city: string; conquered: boolean }[] = [];
      const seen = new Set<string>();
      for (const city of (allCities || [])) {
        if (city.is_capital && aiNames.includes(city.owner_player) && !seen.has(city.owner_player)) {
          capitals.push({ faction: city.owner_player, city: city.name, conquered: humanPlayers.includes(city.owner_player) });
          seen.add(city.owner_player);
        }
      }
      // Fallback
      for (const ai of aiNames) {
        if (!seen.has(ai)) {
          const firstCity = (allCities || []).find((c: any) => c.owner_player === ai);
          if (firstCity) {
            capitals.push({
              faction: ai,
              city: firstCity.name,
              conquered: humanPlayers.includes(firstCity.owner_player),
            });
          }
        }
      }

      const total = capitals.length || 1;
      const conquered = capitals.filter(c => c.conquered).length;

      return {
        type: "domination",
        label: "Dobytí hlavních měst",
        current: conquered,
        target: total,
        pct: Math.round((conquered / total) * 100),
        details: capitals,
      };
    }

    case "survival": {
      const { data: crises } = await sb
        .from("world_crises")
        .select("id, title, status")
        .eq("session_id", sessionId);

      const resolved = (crises || []).filter((c: any) => c.status === "resolved");
      const active = (crises || []).filter((c: any) => c.status === "active");

      return {
        type: "survival",
        label: "Přežij 3 krize",
        current: resolved.length,
        target: 3,
        pct: Math.round((Math.min(resolved.length, 3) / 3) * 100),
        details: {
          resolved: resolved.map((c: any) => c.title),
          active: active.map((c: any) => c.title),
        },
      };
    }

    case "cultural": {
      const { data: realms } = await sb
        .from("realm_resources")
        .select("player_name, cultural_prestige")
        .eq("session_id", sessionId)
        .in("player_name", humanPlayers);

      const best = (realms || []).sort((a: any, b: any) => (b.cultural_prestige || 0) - (a.cultural_prestige || 0))[0];
      const current = best?.cultural_prestige || 0;

      return {
        type: "cultural",
        label: "Kulturní vítězství (100 kulturní prestiže)",
        current,
        target: 100,
        pct: Math.round(Math.min(current, 100)),
        details: { note: `Dosáhni 100+ kulturní prestiže skrze olympiádu, festivaly a akademie.` },
      };
    }

    case "story":
    default:
      return {
        type: "story",
        label: "Příběhový režim",
        current: 0,
        target: 0,
        pct: 0,
        details: { note: "Ukončete hru kdykoli chcete." },
      };
  }
}

function buildVictoryChronicle(style: string, winner: string, turn: number): string {
  switch (style) {
    case "domination":
      return `**V roce ${turn} dosáhl ${winner} naprosté dominance.** Všechna hlavní města nepřátelských říší padla pod jeho vládu. Svět se sklání před novým hegemonem — éra válek končí, začíná éra jednoty pod jedním praporem.`;
    case "survival":
      return `**V roce ${turn} prokázal ${winner} nevídanou odolnost.** Tři velké krize otřásly základy civilizace, ale říše ${winner} přežila každou z nich. Kde jiní padli, on vytrvale budoval a bránil svůj lid.`;
    case "cultural":
      return `**V roce ${turn} dosáhl ${winner} kulturního triumfu.** Prestiž jeho říšea je nepřekonatelná — olympijské vítězství, slavné akademie a úchvatné festivaly proslavily jeho národ po celém známém světě. Kultura zvítězila nad mečem.`;
    default:
      return `**V roce ${turn} uzavřel ${winner} kapitolu dějin svého světa.** Příběh jeho říše se stává legendou předávanou z generace na generaci.`;
  }
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
