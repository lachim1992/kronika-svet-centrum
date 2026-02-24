import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { personId, personName, personType, flavorTrait, exceptionalPrompt, cityName, playerName, sessionId } = await req.json();
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

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch rich context from DB
    let worldContext = "";
    let playerContext = "";
    let historyContext = "";

    if (sessionId) {
      const [styleRes, civRes, eventsRes, citiesRes, traitsRes] = await Promise.all([
        supabaseAdmin.from("game_style_settings").select("lore_bible, prompt_rules").eq("session_id", sessionId).maybeSingle(),
        supabaseAdmin.from("civilizations").select("civ_name, core_myth, cultural_quirk, architectural_style").eq("session_id", sessionId).eq("player_name", playerName).maybeSingle(),
        supabaseAdmin.from("game_events").select("event_type, note, turn_number").eq("session_id", sessionId).eq("player", playerName).eq("confirmed", true).order("turn_number", { ascending: false }).limit(10),
        supabaseAdmin.from("cities").select("name, level, settlement_level, province, tags, flavor_prompt").eq("session_id", sessionId).eq("owner_player", playerName).limit(10),
        supabaseAdmin.from("entity_traits").select("trait_text, trait_category, intensity").eq("session_id", sessionId).eq("entity_name", personName).limit(10),
      ]);

      if (styleRes.data) {
        const s = styleRes.data as any;
        if (s.lore_bible) worldContext += `Lore Bible světa: ${s.lore_bible}\n`;
        if (s.prompt_rules) worldContext += `Pravidla narativu: ${s.prompt_rules}\n`;
      }

      if (civRes.data) {
        const c = civRes.data as any;
        playerContext += `Civilizace: ${c.civ_name || "Neznámá"}`;
        if (c.core_myth) playerContext += `, Zakladatelský mýtus: ${c.core_myth}`;
        if (c.cultural_quirk) playerContext += `, Kulturní zvláštnost: ${c.cultural_quirk}`;
        if (c.architectural_style) playerContext += `, Architektonický styl: ${c.architectural_style}`;
        playerContext += "\n";
      }

      if (eventsRes.data && eventsRes.data.length > 0) {
        historyContext += "Nedávné události hráče:\n";
        for (const ev of eventsRes.data) {
          historyContext += `- [Rok ${ev.turn_number}] ${ev.event_type}: ${ev.note || "bez poznámky"}\n`;
        }
      }

      if (citiesRes.data && citiesRes.data.length > 0) {
        playerContext += "Města hráče: " + citiesRes.data.map((c: any) => `${c.name} (${c.settlement_level || c.level})`).join(", ") + "\n";
      }

      if (traitsRes.data && traitsRes.data.length > 0) {
        playerContext += "Vlastnosti osobnosti: " + traitsRes.data.map((t: any) => `${t.trait_text} (${t.trait_category}, intenzita ${t.intensity})`).join(", ") + "\n";
      }
    }

    const fullContext = [
      worldContext ? `== SVĚT ==\n${worldContext}` : "",
      playerContext ? `== HRÁČ: ${playerName} ==\n${playerContext}` : "",
      historyContext ? `== HISTORIE ==\n${historyContext}` : "",
      exceptionalPrompt ? `== HRÁČŮV POPIS VÝJIMEČNOSTI ==\n${exceptionalPrompt}` : "",
    ].filter(Boolean).join("\n\n");

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
            content: `Jsi kronikář civilizační hry. Napiš epický životopis osobnosti (4-8 vět, česky, středověkým stylem). Životopis musí být zasazen do kontextu světa a civilizace hráče. Pokud hráč poskytl popis výjimečnosti, použij ho jako hlavní zdroj inspirace. Také vytvoř anglický prompt pro generování portrétu v illuminated manuscript stylu.\n\nKONTEXT SVĚTA A HRÁČE:\n${fullContext}`
          },
          {
            role: "user",
            content: `Jméno: ${personName}\nTyp: ${personType}\nPřezdívka/Rys: ${flavorTrait || "neznámý"}\nMěsto: ${cityName || "neznámé"}\nHráč: ${playerName}${exceptionalPrompt ? `\nVýjimečnost (od hráče): ${exceptionalPrompt}` : ""}`
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
                bio: { type: "string", description: "Epic biography in Czech, 4-8 sentences, grounded in world lore and player civilization" },
                imagePrompt: { type: "string", description: "English portrait prompt, illuminated manuscript style, medieval portrait, incorporating world style and character traits" },
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
      if (bioResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Nedostatek kreditů." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" }
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
      debug: { provider: "lovable-ai", contextLength: fullContext.length }
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("person-portrait error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
