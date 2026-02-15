import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { wonderId, city, ownerFlavorPrompt, wonderPromptCzech, existingMemories } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({
        candidates: [],
        debug: { provider: "placeholder", message: "No API key configured" }
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Step 1: Generate English image prompt from Czech description
    const promptResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are an expert at creating vivid image generation prompts. Convert the user's Czech description of a world wonder into 2 different English image prompts. Each should describe the wonder in illuminated manuscript style with parchment colors, golden details, and epic architecture. Vary the angle, lighting, and mood between prompts.`
          },
          {
            role: "user",
            content: `Wonder: ${wonderPromptCzech || "A majestic ancient wonder"}\nCity: ${city || "unknown"}\nOwner's vision: ${ownerFlavorPrompt || "epic and legendary"}\nWorld context: ${JSON.stringify(existingMemories?.slice(0, 5) || [])}`
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "create_prompts",
            description: "Return image generation prompts",
            parameters: {
              type: "object",
              properties: {
                prompts: {
                  type: "array",
                  items: { type: "string" },
                  description: "2 different English image prompts for the wonder"
                }
              },
              required: ["prompts"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "create_prompts" } },
      }),
    });

    if (!promptResponse.ok) {
      if (promptResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Příliš mnoho požadavků, zkuste to později." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (promptResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Kredit vyčerpán." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const errText = await promptResponse.text();
      console.error("Prompt generation error:", promptResponse.status, errText);
      return new Response(JSON.stringify({ candidates: [], debug: { provider: "error" } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const promptData = await promptResponse.json();
    const toolCall = promptData.choices?.[0]?.message?.tool_calls?.[0];
    let imagePrompts: string[] = [];

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      imagePrompts = parsed.prompts || [];
    }

    if (imagePrompts.length === 0) {
      imagePrompts = [
        `A majestic ancient wonder in ${city || "a medieval city"}, illuminated manuscript style, parchment colors, golden details, epic architecture, sunset lighting`,
        `A grand monument in ${city || "a medieval city"}, bird's eye view, illuminated manuscript style, golden hour, intricate stonework`
      ];
    }

    // Step 2: Generate images using Gemini image model
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const candidates: Array<{ imageUrl: string; imagePrompt: string }> = [];

    for (const prompt of imagePrompts.slice(0, 2)) {
      try {
        const imgResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-image",
            messages: [{ role: "user", content: prompt }],
            modalities: ["image", "text"],
          }),
        });

        if (!imgResponse.ok) {
          console.error("Image gen error:", imgResponse.status);
          continue;
        }

        const imgData = await imgResponse.json();
        const imageBase64 = imgData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

        if (!imageBase64) {
          console.error("No image in response");
          continue;
        }

        // Extract base64 data and upload to storage
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        const fileName = `${wonderId || "unknown"}/${crypto.randomUUID()}.png`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from("wonder-images")
          .upload(fileName, binaryData, { contentType: "image/png", upsert: true });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          continue;
        }

        const { data: urlData } = supabaseAdmin.storage
          .from("wonder-images")
          .getPublicUrl(fileName);

        candidates.push({
          imageUrl: urlData.publicUrl,
          imagePrompt: prompt,
        });
      } catch (imgErr) {
        console.error("Image generation failed:", imgErr);
      }
    }

    // Store draft images in DB if wonderId provided
    if (wonderId && candidates.length > 0) {
      for (const c of candidates) {
        await supabaseAdmin.from("wonder_draft_images").insert({
          wonder_id: wonderId,
          image_url: c.imageUrl,
          image_prompt: c.imagePrompt,
        });
      }
    }

    return new Response(JSON.stringify({
      candidates,
      debug: { provider: "lovable-ai", promptCount: imagePrompts.length, generatedCount: candidates.length }
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("wonder-portrait error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
