import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { entityType, entityName, entityId, sessionId, ownerPlayer, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({
        summary: `${entityName} — slavný ${entityType} tohoto světa.`,
        aiDescription: `Kronikáři dosud marně hledají slova pro ${entityName}.`,
        imageUrl: null,
        debug: { provider: "placeholder" }
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch existing wiki entry to preserve player-written content
    const { data: existingWiki } = await sb
      .from("wiki_entries")
      .select("body_md, summary, ai_description")
      .eq("session_id", sessionId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .maybeSingle();

    const playerLegend = (existingWiki as any)?.body_md || "";
    const playerSummary = (existingWiki as any)?.summary || "";

    // Fetch flavor_prompt from the source entity (city, province, etc.)
    let flavorPrompt = "";
    if (entityType === "city") {
      const { data: cityData } = await sb.from("cities").select("flavor_prompt").eq("id", entityId).maybeSingle();
      flavorPrompt = (cityData as any)?.flavor_prompt || "";
    }

    // Fetch lore bible + prompt_rules for consistency
    const { data: styleCfg } = await sb
      .from("game_style_settings")
      .select("lore_bible, prompt_rules")
      .eq("session_id", sessionId)
      .maybeSingle();
    const loreBible = styleCfg?.lore_bible || "";
    let styleRules: any = {};
    try { styleRules = styleCfg?.prompt_rules ? JSON.parse(styleCfg.prompt_rules) : {}; } catch { /* ignore */ }

    const worldVibe = styleRules.world_vibe || "";
    const writingStyle = styleRules.writing_style || "narrative";
    const constraints = styleRules.constraints || "";

    const entityTypeLabels: Record<string, string> = {
      city: "město", wonder: "div světa", person: "osobnost", battle: "bitva",
      province: "provincie", civilization: "civilizace", region: "region", country: "stát",
    };

    const writingInstructions = writingStyle === "political-chronicle"
      ? "Piš jako politický kronikář — střízlivě, fakticky, bez přehnaných metafor. Styl zpravodajského komentáře."
      : writingStyle === "epic-saga"
      ? "Piš jako bard — vznešeně, epicky, s metaforami a odkazem na mýty."
      : "Piš jako středověký učenec — vzdělaně, s respektem k faktům.";

    // Fetch narrative config for entity-type-specific settings
    const { data: serverCfgData } = await sb.from("server_config")
      .select("economic_params").eq("session_id", sessionId).maybeSingle();
    const narrativeCfg = (serverCfgData as any)?.economic_params?.narrative || {};
    const entityTypeCfg = narrativeCfg.entity_types?.[entityType] || {};
    const tone = entityTypeCfg.tone || "encyklopedický";
    const maxLength = entityTypeCfg.max_length || "4-8 vět";
    const entityStylePrompt = entityTypeCfg.style_prompt || "";
    const entityForbidden = (entityTypeCfg.forbidden || []).join(", ");
    const entityKeywords = (entityTypeCfg.keywords || []).join(", ");

    const systemContent = [
      `Jsi encyklopedický kronikář. Napiš STATICKOU IDENTITU entity (česky, ${maxLength}).`,
      `Tón: ${tone}.`,
      writingInstructions,
      `Zaměř se na: geografii, kulturu, ekonomiku a demografii. NEPIŠ historii — ta bude doplněna později.`,
      `DŮLEŽITÉ: Pokud hráč napsal vlastní legendu nebo flavor prompt, MUSÍŠ je respektovat a integrovat.`,
      entityStylePrompt ? `Stylový prompt: ${entityStylePrompt}` : "",
      entityForbidden ? `Zakázaná slova: ${entityForbidden}` : "",
      entityKeywords ? `Preferovaná klíčová slova: ${entityKeywords}` : "",
      loreBible ? `Lore světa:\n${loreBible.substring(0, 800)}` : "",
      worldVibe ? `Tón světa: ${worldVibe}` : "",
      constraints ? `Omezení: ${constraints}` : "",
    ].filter(Boolean).join("\n");

    // Retry logic: up to 2 retries if ai_description is empty
    let summary = `${entityName} — záznam v encyklopedii.`;
    let aiDescription = "";
    let imagePrompt = `A medieval illuminated manuscript illustration of ${entityName}, ${entityTypeLabels[entityType] || entityType}`;
    const MAX_RETRIES = 2;
    let staticIdentity: any = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const descResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemContent },
            {
              role: "user",
              content: [
                `Typ: ${entityTypeLabels[entityType] || entityType}`,
                `Název: ${entityName}`,
                `Vlastník: ${ownerPlayer}`,
                flavorPrompt ? `Hráčův flavor prompt (MUSÍŠ respektovat): ${flavorPrompt}` : "",
                playerLegend ? `Zakladatelská legenda od hráče (MUSÍŠ integrovat): ${playerLegend}` : "",
                playerSummary ? `Hráčovo shrnutí: ${playerSummary}` : "",
                `Kontext: ${JSON.stringify(context || {})}`,
              ].filter(Boolean).join("\n")
            }
          ],
          tools: [{
            type: "function",
            function: {
              name: "create_wiki_entry",
              description: "Create wiki entry with static core identity",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string", description: "One-sentence Czech summary" },
                  aiDescription: { type: "string", description: "Static identity article in Czech (geography, culture, economy, demography)" },
                  imagePrompt: { type: "string", description: "English image prompt for illustration" },
                  staticIdentity: {
                    type: "object",
                    description: "Structured static identity data",
                    properties: {
                      geography: { type: "string", description: "Geographic description" },
                      culture: { type: "string", description: "Cultural description" },
                      economy: { type: "string", description: "Economic profile" },
                      demography: { type: "string", description: "Demographic composition" },
                    },
                  },
                },
                required: ["summary", "aiDescription", "imagePrompt"],
                additionalProperties: false
              }
            }
          }],
          tool_choice: { type: "function", function: { name: "create_wiki_entry" } },
        }),
      });

      if (descResponse.ok) {
        const descData = await descResponse.json();
        const tc = descData.choices?.[0]?.message?.tool_calls?.[0];
        if (tc?.function?.arguments) {
          const parsed = JSON.parse(tc.function.arguments);
          summary = parsed.summary || summary;
          aiDescription = parsed.aiDescription || aiDescription;
          imagePrompt = parsed.imagePrompt || imagePrompt;
          staticIdentity = parsed.staticIdentity || null;
        }
      }

      // If we got a non-empty description, break out
      if (aiDescription && aiDescription.trim().length > 10) break;

      // Log retry attempt
      if (attempt < MAX_RETRIES) {
        console.warn(`wiki-generate: ai_description empty for ${entityName}, retry ${attempt + 1}/${MAX_RETRIES}`);
        await sb.from("simulation_log").insert({
          session_id: sessionId,
          year_start: 1,
          year_end: 1,
          events_generated: 0,
          scope: "wiki_generate_retry",
          triggered_by: `retry_${attempt + 1}`,
        }).then(() => {}, () => {});
      }
    }

    // Fallback if still empty after retries
    if (!aiDescription || aiDescription.trim().length < 10) {
      aiDescription = `Informace o ${entityName} dosud nebyly zaznamenány kronikářem.`;
    }

    // Build style audit reference
    const styleHash = loreBible ? loreBible.substring(0, 32) : "none";
    const promptUsed = systemContent.substring(0, 200);

    // Upsert wiki entry with audit data
    if (sessionId) {
      const { data: existing } = await sb
        .from("wiki_entries")
        .select("id")
        .eq("session_id", sessionId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .maybeSingle();

      const wikiPayload: any = {
        summary,
        ai_description: aiDescription,
        image_prompt: imagePrompt,
        static_identity: staticIdentity || {},
        last_enriched_turn: 0,
        updated_at: new Date().toISOString(),
        references: {
          style_hash: styleHash,
          style_version: "1",
          prompt_used: promptUsed,
          world_vibe: worldVibe,
          writing_style: writingStyle,
        },
      };

      // Preserve player-written body_md — never overwrite it
      if (existing && playerLegend) {
        // Don't touch body_md
      } else if (!existing) {
        wikiPayload.body_md = playerLegend || null;
      }

      if (existing) {
        await sb.from("wiki_entries").update(wikiPayload).eq("id", existing.id);
      } else {
        await sb.from("wiki_entries").upsert({
          session_id: sessionId,
          entity_type: entityType,
          entity_id: entityId || null,
          entity_name: entityName,
          owner_player: ownerPlayer,
          ...wikiPayload,
        } as any, { onConflict: "id" });
      }
    }

    // Generate image via unified pipeline
    let imageUrl: string | null = null;
    if (entityId && sessionId) {
      try {
        const mediaRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-entity-media`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId,
            entityId,
            entityType,
            entityName,
            kind: "cover",
            imagePrompt,
            createdBy: ownerPlayer || "wiki-generate",
          }),
        });
        if (mediaRes.ok) {
          const mediaData = await mediaRes.json();
          imageUrl = mediaData.imageUrl || null;
        }
      } catch (imgErr) {
        console.error("Wiki image delegation failed:", imgErr);
      }
    }

    return new Response(JSON.stringify({
      summary, aiDescription, imageUrl, imagePrompt,
      debug: { provider: "lovable-ai", pipeline: "unified", worldVibe, writingStyle }
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("wiki-generate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
