import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId } = await req.json();
    if (!sessionId) throw new Error("sessionId required");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── 1. AI Factions ──
    const { data: aiFactions } = await sb
      .from("ai_factions")
      .select("id, faction_name, personality, is_active, disposition, goals, resources_snapshot")
      .eq("session_id", sessionId);

    const aiPlayerNames = (aiFactions || []).map((f: any) => f.faction_name);

    // ── 2. Parallel data fetch for AI factions ──
    let aiActions: any[] = [];
    const aiCitiesMap: Record<string, any[]> = {};
    const aiBuildingsMap: Record<string, any[]> = {};
    const aiStacksMap: Record<string, any[]> = {};
    const aiResourcesMap: Record<string, any> = {};

    if (aiPlayerNames.length > 0) {
      // Fetch all data in parallel
      const [actionsRes, citiesRes, buildingsRes, stacksRes, resourcesRes] = await Promise.all([
        // Recent AI game_events
        sb.from("game_events")
          .select("id, event_type, note, created_at, player, turn_number, command_id, actor_type")
          .eq("session_id", sessionId)
          .in("player", aiPlayerNames)
          .order("created_at", { ascending: false })
          .limit(80),
        // Cities owned by AI
        sb.from("cities")
          .select("id, name, population_total, settlement_level, city_stability, local_grain_reserve, military_garrison, status, owner_player, founded_round, is_capital, development_level")
          .eq("session_id", sessionId)
          .in("owner_player", aiPlayerNames),
        // Buildings in AI cities
        sb.from("city_buildings")
          .select("id, name, category, status, current_level, city_id, is_wonder, is_ai_generated, description, completed_turn, build_started_turn")
          .eq("session_id", sessionId),
        // Military stacks
        sb.from("military_stacks")
          .select("id, name, power, morale, is_active, is_deployed, player_name, hex_q, hex_r, created_at")
          .eq("session_id", sessionId)
          .in("player_name", aiPlayerNames),
        // Realm resources
        sb.from("realm_resources")
          .select("grain_reserve, production_reserve, gold_reserve, faith_reserve, horses_reserve, manpower_pool, manpower_committed, mobilization_rate, player_name")
          .eq("session_id", sessionId)
          .in("player_name", aiPlayerNames),
      ]);

      aiActions = (actionsRes.data || []).map((e: any) => ({
        ...e,
        player_name: e.player,
        event_data: { note: e.note, command_id: e.command_id, actor_type: e.actor_type },
      }));

      // Group cities by owner
      const allCities = citiesRes.data || [];
      const cityIds = allCities.map((c: any) => c.id);
      for (const c of allCities) {
        if (!aiCitiesMap[c.owner_player]) aiCitiesMap[c.owner_player] = [];
        aiCitiesMap[c.owner_player].push(c);
      }

      // Filter buildings to AI cities only, group by city_id
      const allBuildings = (buildingsRes.data || []).filter((b: any) => cityIds.includes(b.city_id));
      for (const b of allBuildings) {
        if (!aiBuildingsMap[b.city_id]) aiBuildingsMap[b.city_id] = [];
        aiBuildingsMap[b.city_id].push(b);
      }

      // Group stacks by player
      for (const s of (stacksRes.data || [])) {
        if (!aiStacksMap[s.player_name]) aiStacksMap[s.player_name] = [];
        aiStacksMap[s.player_name].push(s);
      }

      // Index resources by player
      for (const r of (resourcesRes.data || [])) {
        aiResourcesMap[r.player_name] = r;
      }
    }

    // ── 3. Build per-faction profiles ──
    const factionProfiles = (aiFactions || []).map((f: any) => {
      const cities = aiCitiesMap[f.faction_name] || [];
      const stacks = aiStacksMap[f.faction_name] || [];
      const resources = aiResourcesMap[f.faction_name] || null;

      // Enrich cities with their buildings
      const citiesWithBuildings = cities.map((c: any) => ({
        ...c,
        buildings: (aiBuildingsMap[c.id] || []),
      }));

      // Action summary by type
      const factionActions = aiActions.filter((a: any) => a.player_name === f.faction_name);
      const actionsByType: Record<string, number> = {};
      for (const a of factionActions) {
        actionsByType[a.event_type] = (actionsByType[a.event_type] || 0) + 1;
      }

      // Cross-reference: actual outcomes vs logged events
      const allBuildings = citiesWithBuildings.flatMap((c: any) => c.buildings || []);
      const buildingsCompleted = allBuildings.filter((b: any) => b.status === "completed" && !b.is_wonder).length;
      const buildingsInProgress = allBuildings.filter((b: any) => b.status !== "completed" && !b.is_wonder).length;
      const wondersCompleted = allBuildings.filter((b: any) => b.is_wonder && b.status === "completed").length;
      const wondersInProgress = allBuildings.filter((b: any) => b.is_wonder && b.status !== "completed").length;

      const actionOutcomes = {
        construction: { events: actionsByType["construction"] || 0, completed: buildingsCompleted, inProgress: buildingsInProgress },
        wonder: { events: actionsByType["wonder"] || 0, completed: wondersCompleted, inProgress: wondersInProgress },
        found_settlement: { events: actionsByType["found_settlement"] || 0, actual: cities.length },
        recruit: { events: actionsByType["recruit"] || 0, actual: stacks.length },
      };

      return {
        id: f.id,
        factionName: f.faction_name,
        personality: f.personality,
        isActive: f.is_active,
        disposition: f.disposition,
        goals: f.goals,
        resourcesSnapshot: f.resources_snapshot,
        resources,
        cities: citiesWithBuildings,
        stacks,
        totalPop: cities.reduce((s: number, c: any) => s + (c.population_total || 0), 0),
        totalGarrison: cities.reduce((s: number, c: any) => s + (c.military_garrison || 0), 0),
        totalStrength: stacks.reduce((s: number, st: any) => s + (st.power || 0), 0),
        actionsByType,
        actionOutcomes,
        recentActions: factionActions.slice(0, 20),
      };
    });

    // ── 4. Diplomacy ──
    let aiDiplomacy: any[] = [];
    let aiTensions: any[] = [];
    if (aiPlayerNames.length > 0) {
      const [pactsRes, tensionsRes] = await Promise.all([
        sb.from("diplomatic_pacts")
          .select("*")
          .eq("session_id", sessionId)
          .or(aiPlayerNames.map((n: string) => `party_a.eq.${n},party_b.eq.${n}`).join(","))
          .order("created_at", { ascending: false })
          .limit(30),
        sb.from("civ_tensions")
          .select("*")
          .eq("session_id", sessionId)
          .order("turn_number", { ascending: false })
          .limit(30),
      ]);
      aiDiplomacy = pactsRes.data || [];
      aiTensions = (tensionsRes.data || []).filter((t: any) =>
        aiPlayerNames.includes(t.player_a) || aiPlayerNames.includes(t.player_b)
      );
    }

    // ── 5. Pipeline Stats (parallel) ──
    const [wikiRes, encImgRes, chronRes, styleCfgRes, premiseRes, summCountRes, rumCountRes] = await Promise.all([
      sb.from("wiki_entries")
        .select("entity_type, ai_description, summary, image_url, image_prompt, source_context, updated_at")
        .eq("session_id", sessionId),
      sb.from("encyclopedia_images")
        .select("entity_type, kind, style_preset, model_meta, created_at")
        .eq("session_id", sessionId),
      sb.from("chronicle_entries")
        .select("source_type, epoch_style, turn_from, turn_to")
        .eq("session_id", sessionId),
      sb.from("game_style_settings")
        .select("lore_bible, prompt_rules, default_style_preset, world_vibe, writing_style, constraints")
        .eq("session_id", sessionId)
        .maybeSingle(),
      sb.from("world_premise")
        .select("seed, epoch_style, cosmology, narrative_rules, economic_bias, war_bias")
        .eq("session_id", sessionId)
        .maybeSingle(),
      sb.from("ai_world_summaries")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId),
      sb.from("city_rumors")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId),
    ]);

    const wikiEntries = wikiRes.data || [];
    const wikiStats = {
      total: wikiEntries.length,
      withDescription: wikiEntries.filter((w: any) => w.ai_description).length,
      withImage: wikiEntries.filter((w: any) => w.image_url).length,
      withSourceContext: wikiEntries.filter((w: any) => w.source_context).length,
      byType: {} as Record<string, number>,
    };
    for (const w of wikiEntries) {
      wikiStats.byType[w.entity_type] = (wikiStats.byType[w.entity_type] || 0) + 1;
    }

    const encImages = encImgRes.data || [];
    const imageStats = {
      total: encImages.length,
      byType: {} as Record<string, number>,
      byKind: {} as Record<string, number>,
      byPreset: {} as Record<string, number>,
    };
    for (const img of encImages) {
      imageStats.byType[img.entity_type] = (imageStats.byType[img.entity_type] || 0) + 1;
      imageStats.byKind[img.kind] = (imageStats.byKind[img.kind] || 0) + 1;
      imageStats.byPreset[img.style_preset] = (imageStats.byPreset[img.style_preset] || 0) + 1;
    }

    const chronicleEntries = chronRes.data || [];
    const chronicleStats = {
      total: chronicleEntries.length,
      bySource: {} as Record<string, number>,
      byEpoch: {} as Record<string, number>,
    };
    for (const c of chronicleEntries) {
      chronicleStats.bySource[c.source_type] = (chronicleStats.bySource[c.source_type] || 0) + 1;
      chronicleStats.byEpoch[c.epoch_style] = (chronicleStats.byEpoch[c.epoch_style] || 0) + 1;
    }

    return new Response(
      JSON.stringify({
        aiFactions: aiFactions || [],
        factionProfiles,
        aiActions,
        aiDiplomacy,
        aiTensions,
        wikiStats,
        imageStats,
        chronicleStats,
        styleCfg: styleCfgRes.data || null,
        premise: premiseRes.data || null,
        summariesCount: summCountRes.count || 0,
        rumorsCount: rumCountRes.count || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[ai-diagnostics] error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
