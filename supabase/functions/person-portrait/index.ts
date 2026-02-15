import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { personId, personName, personType, flavorTrait, cityName, playerName } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({
        bio: `${personName} je legendární ${personType} z ${cityName || "neznámého města"}. Příběhy o jeho činech se šíří po celé říši.`,
        imageUrl: null,
        debug: { provider: "placeholder" }
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Step 1: Generate bio
    const bioResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `Jsi kronikář civilizační hry. Napiš krátký epický životopis osobnosti (3-5 vět, česky, středověkým stylem). Také vytvoř anglický prompt pro generování portrétu v illuminated manuscript stylu.`
          },
          {
            role: "user",
            content: `Jméno: ${personName}\nTyp: ${personType}\nRys: ${flavorTrait || "neznámý"}\nMěsto: ${cityName || "neznámé"}\nHráč: ${playerName}`
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "create_person_profile",
            description: "Create person bio and image prompt",
            parameters: {
              type: "object",
              properties: {
                bio: { type: "string", description: "Epic biography in Czech, 3-5 sentences" },
                imagePrompt: { type: "string", description: "English portrait prompt, illuminated manuscript style, medieval portrait" },
              },
              required: ["bio", "imagePrompt"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "create_person_profile" } },
      }),
    });

    if (!bioResponse.ok) {
      if (bioResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Příliš mnoho požadavků." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const errText = await bioResponse.text();
      console.error("Bio gen error:", bioResponse.status, errText);
      return new Response(JSON.stringify({ bio: "Kronikář selhal...", imageUrl: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const bioData = await bioResponse.json();
    const toolCall = bioData.choices?.[0]?.message?.tool_calls?.[0];
    let bio = `${personName} je legendární ${personType}.`;
    let imagePrompt = `A medieval portrait of a ${personType} named ${personName}, illuminated manuscript style, parchment colors, golden details`;

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      bio = parsed.bio || bio;
      imagePrompt = parsed.imagePrompt || imagePrompt;
    }

    // Step 2: Generate portrait image
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
          const fileName = `persons/${personId || crypto.randomUUID()}/${crypto.randomUUID()}.png`;

          const { error: uploadError } = await supabaseAdmin.storage
            .from("wonder-images")
            .upload(fileName, binaryData, { contentType: "image/png", upsert: true });

          if (!uploadError) {
            const { data: urlData } = supabaseAdmin.storage.from("wonder-images").getPublicUrl(fileName);
            imageUrl = urlData.publicUrl;
          }

          // Update the person record
          if (personId) {
            await supabaseAdmin.from("great_persons").update({
              bio, image_url: imageUrl, image_prompt: imagePrompt,
            }).eq("id", personId);
          }
        }
      }
    } catch (imgErr) {
      console.error("Image generation failed:", imgErr);
    }

    return new Response(JSON.stringify({
      bio, imageUrl, imagePrompt,
      debug: { provider: "lovable-ai" }
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("person-portrait error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
