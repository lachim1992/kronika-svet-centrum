/**
 * wiki-enrich: AI enrichment for wiki entries triggered by impact threshold.
 *
 * Called after turn processing when significant events occur for an entity.
 * Uses narrative config, world style, and all available data sources.
 *
 * Input: { sessionId, entityId, entityType, turnNumber }
 */
import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, entityId, entityType, turnNumber } = await req.json();
    if (!sessionId || !entityId) return errorResponse("Missing sessionId or entityId", 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch wiki entry
    const { data: wiki } = await sb
      .from("wiki_entries")
      .select("*")
      .eq("session_id", sessionId)
      .eq("entity_id", entityId)
      .maybeSingle();

    if (!wiki) return errorResponse("Wiki entry not found", 404);

    // Fetch all event refs for this entity
    const { data: eventRefs } = await sb
      .from("wiki_event_refs")
      .select("*")
      .eq("session_id", sessionId)
      .eq("entity_id", entityId)
      .order("turn_number", { ascending: true });

    // Fetch narrative config
    const { data: serverCfg } = await sb
      .from("server_config")
      .select("economic_params")
      .eq("session_id", sessionId)
      .maybeSingle();

    const econ = (serverCfg as any)?.economic_params || {};
    const narrativeCfg = econ.narrative || {};
    const entityCfg = narrativeCfg.entity_types?.[entityType] || {};

    // Fetch style settings
    const { data: styleCfg } = await sb
      .from("game_style_settings")
      .select("lore_bible, prompt_rules")
      .eq("session_id", sessionId)
      .maybeSingle();

    const loreBible = styleCfg?.lore_bible || "";
    let styleRules: any = {};
    try { styleRules = styleCfg?.prompt_rules ? JSON.parse(styleCfg.prompt_rules) : {}; } catch { /* */ }

    // Fetch related game_events
    const eventIds = (eventRefs || [])
      .filter((r: any) => r.ref_type === "event")
      .map((r: any) => r.ref_id);

    let events: any[] = [];
    if (eventIds.length > 0) {
      const { data } = await sb.from("game_events").select("*")
        .in("id", eventIds.slice(0, 50));
      events = data || [];
    }

    // Fetch battles
    const battleIds = (eventRefs || [])
      .filter((r: any) => r.ref_type === "battle")
      .map((r: any) => r.ref_id);

    let battles: any[] = [];
    if (battleIds.length > 0) {
      const { data } = await sb.from("battles").select("*")
        .in("id", battleIds.slice(0, 20));
      battles = data || [];
    }

    // Fetch world memories
    const { data: memories } = await sb.from("world_memories")
      .select("text, category")
      .eq("session_id", sessionId)
      .eq("approved", true)
      .limit(20);

    // Fetch entity-specific data
    let entityData: any = {};
    if (entityType === "city") {
      const { data } = await sb.from("cities").select("*").eq("id", entityId).maybeSingle();
      entityData = data || {};
    } else if (entityType === "province") {
      const { data } = await sb.from("provinces").select("*").eq("id", entityId).maybeSingle();
      entityData = data || {};
    } else if (entityType === "region") {
      const { data } = await sb.from("regions").select("*").eq("id", entityId).maybeSingle();
      entityData = data || {};
    } else if (entityType === "person") {
      const { data } = await sb.from("great_persons").select("*").eq("id", entityId).maybeSingle();
      entityData = data || {};
    }

    // Build enrichment context
    const staticIdentity = (wiki as any).static_identity || {};
    const existingDesc = (wiki as any).ai_description || "";

    const entityTypeLabels: Record<string, string> = {
      city: "město", province: "provincie", region: "region",
      person: "osobnost", wonder: "div světa", country: "stát",
    };

    // Build style instructions from narrative config
    const stylePrompt = entityCfg.style_prompt || narrativeCfg.history?.style_prompt || "";
    const tone = entityCfg.tone || "encyklopedický";
    const maxLength = entityCfg.max_length || "8-15 vět";
    const forbiddenWords = [
      ...(narrativeCfg.saga?.forbidden || []),
      ...(entityCfg.forbidden || []),
    ];
    const keywords = [
      ...(narrativeCfg.saga?.keywords || []),
      ...(entityCfg.keywords || []),
    ];

    const eventsText = events.map((e: any) =>
      `- [Rok ${e.turn_number}] ${e.event_type}: ${e.note || "bez popisu"} (${e.importance})`
    ).join("\n");

    const battlesText = battles.map((b: any) =>
      `- [Rok ${b.turn_number}] Bitva: výsledek=${b.result}, ztráty útočník=${b.casualties_attacker}, obránce=${b.casualties_defender}`
    ).join("\n");

    const ctx = await createAIContext(sessionId, turnNumber);

    const systemPrompt = [
      `Jsi encyklopedický kronikář fantasy světa. Aktualizuješ encyklopedický článek o entitě typu ${entityTypeLabels[entityType] || entityType}.`,
      `Tvým úkolem je OBOHATIT stávající článek o nové události, které se odehrály.`,
      `NESMÍŠ přepsat statickou identitu (geografie, kultura). Tu pouze zachovej.`,
      `Přidej nebo aktualizuj sekci "Nedávné události" a historii.`,
      `Piš ${tone} stylem, ${maxLength}.`,
      stylePrompt ? `Stylový prompt: ${stylePrompt}` : "",
      forbiddenWords.length > 0 ? `Zakázaná slova: ${forbiddenWords.join(", ")}` : "",
      keywords.length > 0 ? `Preferovaná klíčová slova: ${keywords.join(", ")}` : "",
      loreBible ? `Lore světa:\n${loreBible.substring(0, 600)}` : "",
      styleRules.world_vibe ? `Tón světa: ${styleRules.world_vibe}` : "",
      styleRules.constraints ? `Omezení: ${styleRules.constraints}` : "",
      `Odpověz POUZE voláním funkce enrich_wiki_entry.`,
    ].filter(Boolean).join("\n");

    const userPrompt = [
      `Entita: ${wiki.entity_name} (${entityType})`,
      `Vlastník: ${wiki.owner_player}`,
      `\nSTATICKÁ IDENTITA:\n${JSON.stringify(staticIdentity, null, 2)}`,
      `\nSTÁVAJÍCÍ POPIS:\n${existingDesc}`,
      `\nNOVÉ UDÁLOSTI:\n${eventsText || "žádné"}`,
      `\nBITVY:\n${battlesText || "žádné"}`,
      `\nFAKTA O SVĚTĚ:\n${(memories || []).map((m: any) => `- [${m.category}] ${m.text}`).join("\n") || "žádná"}`,
      entityData.flavor_prompt ? `\nFlavor prompt: ${entityData.flavor_prompt}` : "",
    ].filter(Boolean).join("\n");

    const result = await invokeAI(ctx, {
      systemPrompt,
      userPrompt,
      tools: [{
        type: "function",
        function: {
          name: "enrich_wiki_entry",
          description: "Update encyclopedia article with new events",
          parameters: {
            type: "object",
            properties: {
              updated_description: { type: "string", description: "Full updated article in Czech" },
              updated_summary: { type: "string", description: "One-sentence updated summary in Czech" },
              recent_events_section: { type: "string", description: "New 'Nedávné události' section text" },
            },
            required: ["updated_description", "updated_summary", "recent_events_section"],
            additionalProperties: false,
          },
        },
      }],
      toolChoice: { type: "function", function: { name: "enrich_wiki_entry" } },
    });

    if (!result.ok) {
      return jsonResponse({ error: result.error }, result.status || 500);
    }

    const toolCall = result.data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) return errorResponse("No tool call in AI response");

    const parsed = JSON.parse(toolCall.function.arguments);

    // Update wiki entry
    await sb.from("wiki_entries").update({
      ai_description: parsed.updated_description,
      summary: parsed.updated_summary,
      last_enriched_turn: turnNumber,
      updated_at: new Date().toISOString(),
    }).eq("id", wiki.id);

    return jsonResponse({
      ok: true,
      entityId,
      entityType,
      turnNumber,
      refsCount: (eventRefs || []).length,
    });

  } catch (e) {
    console.error("wiki-enrich error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
