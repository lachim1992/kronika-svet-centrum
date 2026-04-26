/**
 * person-portrait — Generates a great-person bio + portrait image.
 *
 * Bio generation migrated to unified AI pipeline (createAIContext + invokeAI)
 * so that the biography always cites both:
 *   - P0  (World Premise: Pradávno + Současnost + Zlom + Pradávné rody)
 *   - P0b (Player Premise: civilization identity + claimed lineages)
 *
 * Image generation continues to use the dedicated image model directly,
 * with the AI-produced imagePrompt enriched by lineage anchors.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  corsHeaders,
  createAIContext,
  invokeAI,
} from "../_shared/ai-context.ts";

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

    // Build unified context (P0 world + P0b player) for the bio.
    const ctx = await createAIContext(sessionId, undefined, supabaseAdmin, playerName);
    const cc = ctx.civContext;

    // Pull supplementary data: recent player events + entity traits (history layer).
    let historyContext = "";
    let traitContext = "";
    if (sessionId) {
      const [eventsRes, traitsRes] = await Promise.all([
        supabaseAdmin.from("game_events").select("event_type, note, turn_number").eq("session_id", sessionId).eq("player", playerName).eq("confirmed", true).order("turn_number", { ascending: false }).limit(10),
        supabaseAdmin.from("entity_traits").select("trait_text, trait_category, intensity").eq("session_id", sessionId).eq("entity_name", personName).limit(10),
      ]);
      if (eventsRes.data && eventsRes.data.length > 0) {
        historyContext = "Nedávné události hráče:\n" + eventsRes.data.map(
          (ev: any) => `- [Rok ${ev.turn_number}] ${ev.event_type}: ${ev.note || "bez poznámky"}`,
        ).join("\n");
      }
      if (traitsRes.data && traitsRes.data.length > 0) {
        traitContext = "Vlastnosti osobnosti: " + traitsRes.data.map(
          (t: any) => `${t.trait_text} (${t.trait_category}, intenzita ${t.intensity})`,
        ).join(", ");
      }
    }

    const systemPrompt = `Jsi kronikář civilizační hry. Napiš epický životopis osobnosti (4-8 vět, česky, středověkým stylem).
ŽIVOTOPIS MUSÍ:
  - doslova navazovat na premisu světa (P0 — Pradávno, Současnost, Zlom, Pradávné rody)
  - reflektovat premisu národa hráče (P0b — civilizace, adoptované Pradávné rody, kulturní zvláštnost)
  - zmínit alespoň jedno Pradávné dědictví národa (pokud nějaké existuje)
Také vytvoř anglický prompt pro generování portrétu v illuminated manuscript stylu;
prompt MUSÍ obsahovat odkaz na architectural_style národa nebo na cultural_anchor adoptovaného Pradávného rodu.

DOPLŇUJÍCÍ KONTEXT (historie + traits, NEsmí přebít P0/P0b):
${historyContext}
${traitContext}
${exceptionalPrompt ? `\nVÝJIMEČNOST OD HRÁČE (hlavní zdroj inspirace pro postavu):\n${exceptionalPrompt}` : ""}`;

    const userPrompt = `Jméno: ${personName}
Typ: ${personType}
Přezdívka/Rys: ${flavorTrait || "neznámý"}
Město: ${cityName || "neznámé"}
Hráč: ${playerName}`;

    const bioResult = await invokeAI(ctx, {
      model: "google/gemini-3-flash-preview",
      systemPrompt,
      userPrompt,
      functionName: "person-portrait",
      tools: [{
        type: "function",
        function: {
          name: "create_person_profile",
          description: "Create person bio and image prompt",
          parameters: {
            type: "object",
            properties: {
              bio: { type: "string", description: "Epic biography in Czech, 4-8 sentences, grounded in world lore (P0) and player civilization (P0b)" },
              imagePrompt: { type: "string", description: "English portrait prompt, illuminated manuscript style, must reference architectural style or ancient lineage anchor" },
            },
            required: ["bio", "imagePrompt"],
            additionalProperties: false,
          },
        },
      }],
      toolChoice: { type: "function", function: { name: "create_person_profile" } },
    });

    if (!bioResult.ok) {
      const status = bioResult.status ?? 500;
      return new Response(JSON.stringify({ error: bioResult.error || "Bio gen failed", debug: bioResult.debug }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let bio: string = bioResult.data?.bio || `${personName} je legendární ${personType}.`;
    let imagePrompt: string = bioResult.data?.imagePrompt || `A medieval portrait of a ${personType} named ${personName}, illuminated manuscript style, parchment colors, golden details`;

    // Enrich image prompt with lineage anchor if AI omitted it.
    const lineageAnchors = (cc?.claimedLineages ?? [])
      .map((l) => l.culturalAnchor || l.name)
      .filter(Boolean)
      .slice(0, 1)
      .join(", ");
    if (lineageAnchors && !imagePrompt.toLowerCase().includes(lineageAnchors.toLowerCase())) {
      imagePrompt = `${imagePrompt}. Heritage motifs: ${lineageAnchors}.`;
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
      debug: bioResult.debug,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("person-portrait error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
