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

    // ── 1. AI Faction Actions ──
    const { data: aiFactions } = await sb
      .from("ai_factions")
      .select("id, faction_name, personality, is_active, disposition, goals, resources_snapshot")
      .eq("session_id", sessionId);

    // Get recent AI game_events (actions taken by AI factions)
    const aiPlayerNames = (aiFactions || []).map((f: any) => f.faction_name);
    let aiActions: any[] = [];
    if (aiPlayerNames.length > 0) {
      const { data } = await sb
        .from("game_events")
        .select("id, event_type, note, created_at, player, turn_number, command_id, actor_type")
        .eq("session_id", sessionId)
        .in("player", aiPlayerNames)
        .order("created_at", { ascending: false })
        .limit(50);
      aiActions = (data || []).map((e: any) => ({ ...e, player_name: e.player, event_data: { note: e.note, command_id: e.command_id, actor_type: e.actor_type } }));
    }

    // ── 2. AI Economy & Military ──
    const aiEconomyStats: any[] = [];
    for (const faction of (aiFactions || [])) {
      const { data: cities } = await sb
        .from("cities")
        .select("id, name, population_total, settlement_level, city_stability, local_grain_reserve, military_garrison, status")
        .eq("session_id", sessionId)
        .eq("owner_player", faction.faction_name);

      const { data: stacks } = await sb
        .from("military_stacks")
        .select("id, name, power, morale, is_active, is_deployed")
        .eq("session_id", sessionId)
        .eq("player_name", faction.faction_name);

      const { data: res } = await sb
        .from("realm_resources")
        .select("grain_reserve, wood_reserve, stone_reserve, iron_reserve, gold_reserve, horses_reserve, manpower_pool, manpower_committed, mobilization_rate")
        .eq("session_id", sessionId)
        .eq("player_name", faction.faction_name)
        .maybeSingle();

      aiEconomyStats.push({
        factionName: faction.faction_name,
        personality: faction.personality,
        isActive: faction.is_active,
        disposition: faction.disposition,
        goals: faction.goals,
        cities: cities || [],
        totalPop: (cities || []).reduce((s: number, c: any) => s + (c.population_total || 0), 0),
        totalGarrison: (cities || []).reduce((s: number, c: any) => s + (c.military_garrison || 0), 0),
        stacks: stacks || [],
        totalStrength: (stacks || []).reduce((s: number, st: any) => s + (st.power || 0), 0),
        resources: res || null,
      });
    }

    // ── 3. AI Diplomacy ──
    let aiDiplomacy: any[] = [];
    if (aiPlayerNames.length > 0) {
      const { data: pacts } = await sb
        .from("diplomatic_pacts")
        .select("*")
        .eq("session_id", sessionId)
        .or(
          aiPlayerNames.map((n: string) => `party_a.eq.${n},party_b.eq.${n}`).join(",")
        )
        .order("created_at", { ascending: false })
        .limit(30);
      aiDiplomacy = pacts || [];
    }

    // AI tensions
    let aiTensions: any[] = [];
    if (aiPlayerNames.length > 0) {
      const { data: tensions } = await sb
        .from("civ_tensions")
        .select("*")
        .eq("session_id", sessionId)
        .order("turn_number", { ascending: false })
        .limit(30);
      // Filter to only include tensions involving AI
      aiTensions = (tensions || []).filter((t: any) =>
        aiPlayerNames.includes(t.player_a) || aiPlayerNames.includes(t.player_b)
      );
    }

    // ── 4. Generation Pipeline Stats ──
    // Wiki entries stats
    const { data: wikiEntries } = await sb
      .from("wiki_entries")
      .select("entity_type, ai_description, summary, image_url, image_prompt, source_context, updated_at")
      .eq("session_id", sessionId);

    const wikiStats = {
      total: (wikiEntries || []).length,
      withDescription: (wikiEntries || []).filter((w: any) => w.ai_description).length,
      withImage: (wikiEntries || []).filter((w: any) => w.image_url).length,
      withSourceContext: (wikiEntries || []).filter((w: any) => w.source_context).length,
      byType: {} as Record<string, number>,
    };
    for (const w of (wikiEntries || [])) {
      wikiStats.byType[w.entity_type] = (wikiStats.byType[w.entity_type] || 0) + 1;
    }

    // Encyclopedia images stats
    const { data: encImages } = await sb
      .from("encyclopedia_images")
      .select("entity_type, kind, style_preset, model_meta, created_at")
      .eq("session_id", sessionId);

    const imageStats = {
      total: (encImages || []).length,
      byType: {} as Record<string, number>,
      byKind: {} as Record<string, number>,
      byPreset: {} as Record<string, number>,
    };
    for (const img of (encImages || [])) {
      imageStats.byType[img.entity_type] = (imageStats.byType[img.entity_type] || 0) + 1;
      imageStats.byKind[img.kind] = (imageStats.byKind[img.kind] || 0) + 1;
      imageStats.byPreset[img.style_preset] = (imageStats.byPreset[img.style_preset] || 0) + 1;
    }

    // Chronicle entries stats
    const { data: chronicleEntries } = await sb
      .from("chronicle_entries")
      .select("source_type, epoch_style, turn_from, turn_to")
      .eq("session_id", sessionId);

    const chronicleStats = {
      total: (chronicleEntries || []).length,
      bySource: {} as Record<string, number>,
      byEpoch: {} as Record<string, number>,
    };
    for (const c of (chronicleEntries || [])) {
      chronicleStats.bySource[c.source_type] = (chronicleStats.bySource[c.source_type] || 0) + 1;
      chronicleStats.byEpoch[c.epoch_style] = (chronicleStats.byEpoch[c.epoch_style] || 0) + 1;
    }

    // Style settings (lore bible context)
    const { data: styleCfg } = await sb
      .from("game_style_settings")
      .select("lore_bible, prompt_rules, default_style_preset, world_vibe, writing_style, constraints")
      .eq("session_id", sessionId)
      .maybeSingle();

    // World premise
    const { data: premise } = await sb
      .from("world_premise")
      .select("seed, epoch_style, cosmology, narrative_rules, economic_bias, war_bias")
      .eq("session_id", sessionId)
      .maybeSingle();

    // AI summaries count
    const { count: summariesCount } = await sb
      .from("ai_world_summaries")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);

    // City rumors count
    const { count: rumorsCount } = await sb
      .from("city_rumors")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);

    return new Response(
      JSON.stringify({
        aiFactions: aiFactions || [],
        aiActions,
        aiEconomyStats,
        aiDiplomacy,
        aiTensions,
        wikiStats,
        imageStats,
        chronicleStats,
        styleCfg: styleCfg || null,
        premise: premise || null,
        summariesCount: summariesCount || 0,
        rumorsCount: rumorsCount || 0,
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
