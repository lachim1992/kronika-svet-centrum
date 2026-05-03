/**
 * wiki-generate — Unified AI pipeline
 * 
 * Uses createAIContext + invokeAI for premise injection.
 * Entity-specific builders are in _shared/wiki-builders.ts.
 */

import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse, getServiceClient } from "../_shared/ai-context.ts";
import { buildCityContext, buildProvinceContext, buildRegionContext, buildCountryContext, buildGenericContext, type EntityContext } from "../_shared/wiki-builders.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { entityType, entityName, entityId, sessionId, ownerPlayer, context } = await req.json();
    if (!sessionId) {
      return jsonResponse({ summary: `${entityName} — záznam v encyklopedii.`, aiDescription: "", imageUrl: null });
    }

    const sb = getServiceClient();
    const ctx = await createAIContext(sessionId, undefined, sb, ownerPlayer);

    // ═══ Fetch existing wiki entry to preserve player-written content ═══
    const { data: existingWiki } = await sb
      .from("wiki_entries")
      .select("id, body_md, summary, ai_description")
      .eq("session_id", sessionId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .maybeSingle();

    const playerLegend = (existingWiki as any)?.body_md || "";
    const playerSummary = (existingWiki as any)?.summary || "";

    // ═══ Fetch flavor_prompt for cities ═══
    let flavorPrompt = "";
    if (entityType === "city") {
      const { data: cityData } = await sb.from("cities").select("flavor_prompt").eq("id", entityId).maybeSingle();
      flavorPrompt = (cityData as any)?.flavor_prompt || "";
    }

    // ═══ Build entity-specific context ═══
    let entityCtx: EntityContext;

    if (entityType === "city") {
      entityCtx = await buildCityContext(sb, sessionId, entityId, entityName, ownerPlayer, flavorPrompt, playerLegend, playerSummary);
    } else if (entityType === "province") {
      entityCtx = await buildProvinceContext(sb, sessionId, entityId, entityName, ownerPlayer);
    } else if (entityType === "region") {
      entityCtx = await buildRegionContext(sb, sessionId, entityId, entityName, ownerPlayer);
    } else if (entityType === "country") {
      entityCtx = await buildCountryContext(sb, sessionId, entityId, entityName, ownerPlayer);
    } else {
      entityCtx = await buildGenericContext(sb, sessionId, entityId, entityType, entityName, ownerPlayer, playerLegend, context);
    }

    // ═══ AI Call via unified pipeline (with retry) ═══
    let summary = `${entityName} — záznam v encyklopedii.`;
    let aiDescription = "";
    let imagePrompt = entityCtx.imageInstructions;
    let staticIdentity: any = null;
    const MAX_RETRIES = 2;

    const tools = [{
      type: "function",
      function: {
        name: "create_wiki_entry",
        description: "Create wiki entry with detailed description",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "One-sentence Czech summary" },
            aiDescription: { type: "string", description: "Full article in Czech, multiple paragraphs" },
            imagePrompt: { type: "string", description: "English image prompt — MUST follow the style instructions provided" },
            staticIdentity: {
              type: "object",
              description: "Structured identity data",
              properties: {
                geography: { type: "string" },
                culture: { type: "string" },
                economy: { type: "string" },
                demography: { type: "string" },
              },
            },
          },
          required: ["summary", "aiDescription", "imagePrompt"],
          additionalProperties: false,
        },
      },
    }];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const result = await invokeAI(ctx, {
        systemPrompt: entityCtx.systemPrompt,
        userPrompt: entityCtx.userPrompt,
        tools,
        toolChoice: { type: "function", function: { name: "create_wiki_entry" } },
      });

      if (!result.ok) {
        if (result.status === 429) return jsonResponse({ ok: false, fallback: true, error: "Rate limit", summary, aiDescription, imagePrompt }, 200);
        if (result.status === 402) return jsonResponse({ ok: false, fallback: true, error: "AI kredit vyčerpán — dobijte v Settings → Cloud & AI balance.", summary, aiDescription, imagePrompt }, 200);
      }

      if (result.ok && result.data) {
        summary = result.data.summary || summary;
        aiDescription = result.data.aiDescription || aiDescription;
        imagePrompt = result.data.imagePrompt || imagePrompt;
        staticIdentity = result.data.staticIdentity || null;
      }

      if (aiDescription && aiDescription.trim().length > 10) break;
      if (attempt < MAX_RETRIES) {
        console.warn(`wiki-generate: ai_description empty for ${entityName} (${entityType}), retry ${attempt + 1}`);
      }
    }

    if (!aiDescription || aiDescription.trim().length < 10) {
      aiDescription = `Informace o ${entityName} dosud nebyly zaznamenány kronikářem.`;
    }

    // ═══ Upsert wiki entry ═══
    const wikiPayload: any = {
      summary,
      ai_description: aiDescription,
      image_prompt: imagePrompt,
      static_identity: staticIdentity || {},
      last_enriched_turn: 0,
      updated_at: new Date().toISOString(),
      references: {
        style_version: "3",
        premise_version: ctx.premise.version,
        entity_context_type: entityType,
      },
    };

    if (existingWiki) {
      // Preserve player-written body_md
      await sb.from("wiki_entries").update(wikiPayload).eq("id", (existingWiki as any).id);
    } else {
      await sb.from("wiki_entries").upsert({
        session_id: sessionId,
        entity_type: entityType,
        entity_id: entityId || null,
        entity_name: entityName,
        owner_player: ownerPlayer,
        body_md: playerLegend || null,
        ...wikiPayload,
      } as any, { onConflict: "id" });
    }

    // ═══ Generate image via unified pipeline ═══
    let imageUrl: string | null = null;
    if (entityId && sessionId) {
      try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const mediaRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-entity-media`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId, entityId, entityType, entityName,
            kind: "cover", imagePrompt,
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

    return jsonResponse({
      summary, aiDescription, imageUrl, imagePrompt,
      debug: { ...ctx.requestId ? { requestId: ctx.requestId } : {}, pipeline: "unified-v3", entityType, premiseVersion: ctx.premise.version }
    });

  } catch (e) {
    console.error("wiki-generate error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
