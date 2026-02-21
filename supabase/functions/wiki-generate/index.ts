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

    // Fetch lore bible for consistency
    const { data: styleCfg } = await sb
      .from("game_style_settings")
      .select("lore_bible")
      .eq("session_id", sessionId)
      .maybeSingle();
    const loreBible = styleCfg?.lore_bible || "";

    const entityTypeLabels: Record<string, string> = {
      city: "město", wonder: "div světa", person: "osobnost", battle: "bitva",
      province: "provincie", civilization: "civilizace", region: "region", country: "stát",
    };

    const systemContent = [
      `Jsi encyklopedický kronikář. Napiš encyklopedický článek (česky, 4-8 vět) o dané entitě. Piš jako středověký učenec.`,
      loreBible ? `Lore světa: ${loreBible.substring(0, 600)}` : "",
    ].filter(Boolean).join("\n");

    // Generate TEXT ONLY (images handled by generate-entity-media)
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
            content: `Typ: ${entityTypeLabels[entityType] || entityType}\nNázev: ${entityName}\nVlastník: ${ownerPlayer}\nKontext: ${JSON.stringify(context || {})}`
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "create_wiki_entry",
            description: "Create wiki entry",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string", description: "One-sentence Czech summary" },
                aiDescription: { type: "string", description: "4-8 sentence encyclopedia article in Czech" },
                imagePrompt: { type: "string", description: "English image prompt for illustration" },
              },
              required: ["summary", "aiDescription", "imagePrompt"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "create_wiki_entry" } },
      }),
    });

    let summary = `${entityName} — záznam v encyklopedii.`;
    let aiDescription = `Informace o ${entityName} dosud nebyly zaznamenány.`;
    let imagePrompt = `A medieval illuminated manuscript illustration of ${entityName}, ${entityTypeLabels[entityType] || entityType}`;

    if (descResponse.ok) {
      const descData = await descResponse.json();
      const tc = descData.choices?.[0]?.message?.tool_calls?.[0];
      if (tc?.function?.arguments) {
        const parsed = JSON.parse(tc.function.arguments);
        summary = parsed.summary || summary;
        aiDescription = parsed.aiDescription || aiDescription;
        imagePrompt = parsed.imagePrompt || imagePrompt;
      }
    }

    // Upsert wiki entry (text only, no image generation here)
    if (sessionId) {
      const { data: existing } = await sb
        .from("wiki_entries")
        .select("id")
        .eq("session_id", sessionId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .maybeSingle();

      if (existing) {
        await sb.from("wiki_entries").update({
          summary,
          ai_description: aiDescription,
          image_prompt: imagePrompt,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await sb.from("wiki_entries").upsert({
          session_id: sessionId,
          entity_type: entityType,
          entity_id: entityId || null,
          entity_name: entityName,
          owner_player: ownerPlayer,
          summary,
          ai_description: aiDescription,
          image_prompt: imagePrompt,
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });
      }
    }

    // Now generate image via unified pipeline (fire-and-forget for speed, or await)
    let imageUrl: string | null = null;
    if (entityId && sessionId) {
      try {
        // Call generate-entity-media internally
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
      debug: { provider: "lovable-ai", pipeline: "unified" }
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("wiki-generate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
