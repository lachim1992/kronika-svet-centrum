import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

    const entityTypeLabels: Record<string, string> = {
      city: "město", wonder: "div světa", person: "osobnost", battle: "bitva",
      province: "provincie", civilization: "civilizace",
    };

    // Generate description
    const descResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Jsi encyklopedický kronikář. Napiš encyklopedický článek (česky, 4-8 vět) o dané entitě. Piš jako středověký učenec. Také navrhni anglický image prompt pro ilustraci v illuminated manuscript stylu.`
          },
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
                imagePrompt: { type: "string", description: "English image prompt, illuminated manuscript style" },
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

    // Generate image
    let imageUrl: string | null = null;
    try {
      const imgResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: imagePrompt }],
          modalities: ["image", "text"],
        }),
      });

      if (imgResponse.ok) {
        const imgData = await imgResponse.json();
        const imageBase64 = imgData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (imageBase64) {
          const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
          const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
          const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
          const fileName = `wiki/${entityType}/${crypto.randomUUID()}.png`;

          const { error: uploadError } = await supabaseAdmin.storage
            .from("wonder-images")
            .upload(fileName, binaryData, { contentType: "image/png", upsert: true });

          if (!uploadError) {
            const { data: urlData } = supabaseAdmin.storage.from("wonder-images").getPublicUrl(fileName);
            imageUrl = urlData.publicUrl;
          }

          // Upsert wiki entry
          if (sessionId) {
            await supabaseAdmin.from("wiki_entries").upsert({
              session_id: sessionId,
              entity_type: entityType,
              entity_id: entityId || null,
              entity_name: entityName,
              owner_player: ownerPlayer,
              summary,
              ai_description: aiDescription,
              image_url: imageUrl,
              image_prompt: imagePrompt,
              updated_at: new Date().toISOString(),
            }, { onConflict: "id" });
          }
        }
      }
    } catch (imgErr) {
      console.error("Wiki image gen failed:", imgErr);
    }

    return new Response(JSON.stringify({
      summary, aiDescription, imageUrl, imagePrompt,
      debug: { provider: "lovable-ai" }
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("wiki-generate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
