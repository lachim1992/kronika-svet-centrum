import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type VisualizeMode = "unit_type" | "stack" | "sigil_realm" | "sigil_stack" | "general_portrait";

interface Params {
  sessionId: string;
  playerName: string;
  mode: VisualizeMode;
  // unit_type mode
  unitType?: string;
  // stack/sigil_stack mode
  stackId?: string;
  stackName?: string;
  // general mode
  generalId?: string;
  generalName?: string;
  generalSkill?: number;
  flavorTrait?: string;
  // shared
  customPrompt?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const params: Params = await req.json();
    const { sessionId, playerName, mode, customPrompt } = params;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch lore bible for context
    const { data: styleCfg } = await sb
      .from("game_style_settings")
      .select("lore_bible, prompt_rules, default_style_preset")
      .eq("session_id", sessionId)
      .maybeSingle();

    const loreBible = styleCfg?.lore_bible?.substring(0, 400) || "";
    const stylePreset = styleCfg?.default_style_preset || "default";

    const STYLE_BASE: Record<string, string> = {
      default: "Rich colors, dramatic lighting, detailed fantasy illustration. Ultra high resolution.",
      medieval_illumination: "Medieval illuminated manuscript style, gold leaf accents, warm parchment tones. Ultra high resolution.",
    };

    const styleStr = STYLE_BASE[stylePreset] || STYLE_BASE.default;

    // Fetch civ info
    const { data: civ } = await sb.from("civilizations")
      .select("civ_name, core_myth, architectural_style")
      .eq("session_id", sessionId)
      .eq("player_name", playerName)
      .maybeSingle();

    const civContext = civ ? `Civilization: ${civ.civ_name}. ${civ.core_myth || ""} ${civ.architectural_style || ""}` : "";

    let prompt = "";
    let targetTable = "";
    let targetId = "";
    let updateData: Record<string, any> = {};

    const UNIT_LABELS: Record<string, string> = {
      INFANTRY: "heavy infantry soldiers, shields and spears, disciplined formation",
      ARCHERS: "archer regiment, longbows, leather armor, ranged formation",
      CAVALRY: "mounted cavalry, warhorses, lances and banners",
      SIEGE: "siege engineers, trebuchets, battering rams, siege equipment",
    };

    switch (mode) {
      case "unit_type": {
        const unitDesc = UNIT_LABELS[params.unitType || "INFANTRY"] || "fantasy military unit";
        prompt = customPrompt
          ? `${customPrompt}. ${unitDesc}. ${styleStr} ${civContext}`
          : `A detailed illustration of a ${unitDesc} belonging to ${civ?.civ_name || playerName}. ${styleStr} ${civContext}. ${loreBible}`;
        targetTable = "unit_type_visuals";
        break;
      }
      case "stack": {
        prompt = customPrompt
          ? `${customPrompt}. Military formation called "${params.stackName}". Wide panoramic 16:9 landscape composition. ${styleStr} ${civContext}`
          : `Wide panoramic 16:9 landscape illustration of epic battle formation: "${params.stackName}", a military unit of ${civ?.civ_name || playerName}. Soldiers marching, banners flying, wide battlefield vista. ${styleStr} ${civContext}. ${loreBible}`;
        targetTable = "military_stacks";
        targetId = params.stackId || "";
        break;
      }
      case "sigil_realm": {
        prompt = customPrompt
          ? `${customPrompt}. Heraldic military emblem/coat of arms. ${styleStr}`
          : `A majestic heraldic coat of arms for the military forces of ${civ?.civ_name || playerName}. Medieval heraldry, shield with symbols, helmet crest, ornate mantling. ${styleStr} ${civContext}. ${loreBible}`;
        targetTable = "realm_resources";
        break;
      }
      case "sigil_stack": {
        prompt = customPrompt
          ? `${customPrompt}. Military standard/banner for "${params.stackName}". ${styleStr}`
          : `A military standard/banner for "${params.stackName}" of ${civ?.civ_name || playerName}. War banner with unique heraldic device. ${styleStr} ${civContext}`;
        targetTable = "military_stacks";
        targetId = params.stackId || "";
        break;
      }
      case "general_portrait": {
        // Generate bio first via text model
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
                content: `Jsi kronikář civilizační hry. Napiš krátký epický životopis vojenského generála (3-5 vět, česky, středověkým stylem). Také vytvoř anglický prompt pro generování portrétu v illuminated manuscript stylu.\n\nSvět: ${loreBible || "středověký fantasy svět"}`,
              },
              {
                role: "user",
                content: `Jméno: ${params.generalName}\nSchopnost: ${params.generalSkill}/100\nRys: ${params.flavorTrait || "neznámý"}\nCivilizace: ${civ?.civ_name || playerName}`,
              },
            ],
            tools: [{
              type: "function",
              function: {
                name: "create_general_profile",
                description: "Create general bio and image prompt",
                parameters: {
                  type: "object",
                  properties: {
                    bio: { type: "string", description: "Epic biography in Czech, 3-5 sentences" },
                    imagePrompt: { type: "string", description: "English portrait prompt, medieval military commander portrait" },
                  },
                  required: ["bio", "imagePrompt"],
                  additionalProperties: false,
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "create_general_profile" } },
          }),
        });

        let bio = `${params.generalName} je legendární vojevůdce ${civ?.civ_name || "neznámé říše"}.`;
        let imgPrompt = `A medieval portrait of military commander ${params.generalName}, illuminated manuscript style, armor, commanding presence`;

        if (bioResponse.ok) {
          const bioData = await bioResponse.json();
          const toolCall = bioData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            try {
              const parsed = JSON.parse(toolCall.function.arguments);
              bio = parsed.bio || bio;
              imgPrompt = parsed.imagePrompt || imgPrompt;
            } catch { /* use defaults */ }
          }
        }

        prompt = customPrompt ? `${customPrompt}. ${styleStr}` : `${imgPrompt}. ${styleStr}`;
        targetTable = "generals";
        targetId = params.generalId || "";
        updateData = { bio };
        break;
      }
    }

    console.log(`[army-visualize] mode=${mode} prompt=${prompt.substring(0, 120)}...`);

    // Generate image
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
      if (imgResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Příliš mnoho požadavků" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (imgResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Nedostatek kreditů" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI image error: ${imgResponse.status}`);
    }

    const imgData = await imgResponse.json();
    const imageBase64 = imgData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image generated", ...updateData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload to storage
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const fileName = `army/${sessionId}/${mode}-${targetId || params.unitType || "realm"}-${Date.now()}.png`;

    const { error: uploadError } = await sb.storage
      .from("wonder-images")
      .upload(fileName, binaryData, { contentType: "image/png", upsert: true });

    let imageUrl: string;
    if (uploadError) {
      console.error("[army-visualize] upload error:", uploadError);
      imageUrl = imageBase64;
    } else {
      const { data: publicUrl } = sb.storage.from("wonder-images").getPublicUrl(fileName);
      imageUrl = publicUrl.publicUrl;
    }

    // Update target table
    switch (mode) {
      case "unit_type": {
        await sb.from("unit_type_visuals").upsert({
          session_id: sessionId,
          player_name: playerName,
          unit_type: params.unitType || "INFANTRY",
          image_url: imageUrl,
          image_prompt: prompt,
        }, { onConflict: "session_id,player_name,unit_type" });
        break;
      }
      case "stack": {
        await sb.from("military_stacks").update({ image_url: imageUrl, image_prompt: prompt }).eq("id", targetId);
        break;
      }
      case "sigil_realm": {
        await sb.from("realm_resources")
          .update({ army_sigil_url: imageUrl, army_sigil_prompt: prompt })
          .eq("session_id", sessionId)
          .eq("player_name", playerName);
        break;
      }
      case "sigil_stack": {
        await sb.from("military_stacks").update({ sigil_url: imageUrl, sigil_prompt: prompt }).eq("id", targetId);
        break;
      }
      case "general_portrait": {
        await sb.from("generals").update({
          image_url: imageUrl, image_prompt: prompt, bio: updateData.bio,
          ...(params.flavorTrait ? { flavor_trait: params.flavorTrait } : {}),
        }).eq("id", targetId);

        // Create wiki_entry for the general (ChroWiki sync)
        const { data: existingWiki } = await sb.from("wiki_entries")
          .select("id")
          .eq("session_id", sessionId)
          .eq("entity_type", "general")
          .eq("entity_id", targetId)
          .maybeSingle();

        if (!existingWiki) {
          await sb.from("wiki_entries").insert({
            session_id: sessionId,
            entity_type: "general",
            entity_id: targetId,
            entity_name: params.generalName || "Generál",
            owner_player: playerName,
            summary: updateData.bio || "",
            ai_description: updateData.bio || "",
            image_url: imageUrl,
            image_prompt: prompt,
          });
        } else {
          await sb.from("wiki_entries").update({
            summary: updateData.bio || "",
            ai_description: updateData.bio || "",
            image_url: imageUrl,
            image_prompt: prompt,
            updated_at: new Date().toISOString(),
          }).eq("id", existingWiki.id);
        }

        // Store in encyclopedia_images too
        await sb.from("encyclopedia_images").insert({
          session_id: sessionId,
          entity_type: "general",
          entity_id: targetId,
          image_url: imageUrl,
          image_prompt: prompt,
          created_by: playerName,
          is_primary: true,
          kind: "portrait",
          style_preset: stylePreset,
        });
        break;
      }
    }

    return new Response(JSON.stringify({
      imageUrl, imagePrompt: prompt, mode, ...updateData,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("[army-visualize] error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
