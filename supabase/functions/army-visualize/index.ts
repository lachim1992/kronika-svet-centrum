/**
 * army-visualize — Generates military visuals (units, stacks, sigils, generals).
 *
 * General-portrait BIO migrated to unified AI pipeline so it cites both
 * P0 (world premise) and P0b (player premise + claimed lineages).
 *
 * Image prompts are enriched with civContext data (architectural style,
 * lineage cultural anchors) so visuals stay coherent with the world.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  corsHeaders,
  createAIContext,
  invokeAI,
} from "../_shared/ai-context.ts";

type VisualizeMode = "unit_type" | "stack" | "sigil_realm" | "sigil_stack" | "general_portrait";

interface Params {
  sessionId: string;
  playerName: string;
  mode: VisualizeMode;
  unitType?: string;
  stackId?: string;
  stackName?: string;
  generalId?: string;
  generalName?: string;
  generalSkill?: number;
  flavorTrait?: string;
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

    // Build unified context (P0 + P0b).
    const ctx = await createAIContext(sessionId, undefined, sb, playerName);
    const cc = ctx.civContext;
    const civNameStr = cc?.civName || playerName;
    const lineageAnchors = (cc?.claimedLineages ?? [])
      .map((l) => l.culturalAnchor || l.name)
      .filter(Boolean)
      .slice(0, 2)
      .join(", ");

    const { data: styleCfg } = await sb
      .from("game_style_settings")
      .select("default_style_preset")
      .eq("session_id", sessionId)
      .maybeSingle();

    const stylePreset = styleCfg?.default_style_preset || "default";
    const STYLE_BASE: Record<string, string> = {
      default: "Rich colors, dramatic lighting, detailed fantasy illustration. Ultra high resolution.",
      medieval_illumination: "Medieval illuminated manuscript style, gold leaf accents, warm parchment tones. Ultra high resolution.",
    };
    const styleStr = STYLE_BASE[stylePreset] || STYLE_BASE.default;

    // Compact civ string for image prompts (heritage-aware).
    const civImgContext = [
      `Civilization: ${civNameStr}`,
      cc?.architecturalStyle ? `Architectural style: ${cc.architecturalStyle}` : "",
      cc?.civDescription ? `Identity: ${cc.civDescription.slice(0, 200)}` : "",
      lineageAnchors ? `Heritage motifs from ancient lineages (${lineageAnchors}) — must be visible.` : "",
    ].filter(Boolean).join(". ");

    let prompt = "";
    let targetTable = "";
    let targetId = "";
    let updateData: Record<string, any> = {};

    const UNIT_LABELS: Record<string, string> = {
      MILITIA: "militia soldiers, basic weapons, volunteer fighters, light armor",
      PROFESSIONAL: "elite professional soldiers, heavy armor, disciplined formation, veteran warriors",
      INFANTRY: "heavy infantry soldiers, shields and spears, disciplined formation",
      ARCHERS: "archer regiment, longbows, leather armor, ranged formation",
      CAVALRY: "mounted cavalry, warhorses, lances and banners",
      SIEGE: "siege engineers, trebuchets, battering rams, siege equipment",
    };

    switch (mode) {
      case "unit_type": {
        const unitDesc = UNIT_LABELS[params.unitType || "INFANTRY"] || "fantasy military unit";
        prompt = customPrompt
          ? `${customPrompt}. ${unitDesc}. ${styleStr} ${civImgContext}`
          : `A detailed illustration of a ${unitDesc} belonging to ${civNameStr}. ${styleStr} ${civImgContext}`;
        targetTable = "unit_type_visuals";
        break;
      }
      case "stack": {
        prompt = customPrompt
          ? `${customPrompt}. Military formation called "${params.stackName}". Wide panoramic 16:9 landscape composition. ${styleStr} ${civImgContext}`
          : `Wide panoramic 16:9 landscape illustration of epic battle formation: "${params.stackName}", a military unit of ${civNameStr}. Soldiers marching, banners flying, wide battlefield vista. ${styleStr} ${civImgContext}`;
        targetTable = "military_stacks";
        targetId = params.stackId || "";
        break;
      }
      case "sigil_realm": {
        prompt = customPrompt
          ? `${customPrompt}. Heraldic military emblem/coat of arms. ${styleStr}`
          : `A majestic heraldic coat of arms for the military forces of ${civNameStr}. Medieval heraldry, shield with symbols, helmet crest, ornate mantling. ${styleStr} ${civImgContext}`;
        targetTable = "realm_resources";
        break;
      }
      case "sigil_stack": {
        prompt = customPrompt
          ? `${customPrompt}. Military standard/banner for "${params.stackName}". ${styleStr}`
          : `A military standard/banner for "${params.stackName}" of ${civNameStr}. War banner with unique heraldic device. ${styleStr} ${civImgContext}`;
        targetTable = "military_stacks";
        targetId = params.stackId || "";
        break;
      }
      case "general_portrait": {
        // BIO via unified AI pipeline so it cites P0 + P0b + lineages.
        const bioRes = await invokeAI(ctx, {
          model: "google/gemini-3-flash-preview",
          systemPrompt: `Jsi kronikář civilizační hry. Napiš krátký epický životopis vojenského generála (3-5 vět, česky, středověkým stylem).
ŽIVOTOPIS MUSÍ:
  - navazovat na premisu světa (P0 — Pradávno, Současnost, Zlom)
  - reflektovat premisu národa hráče (P0b — civilizace + adoptované Pradávné rody)
  - pokud národ adoptoval Pradávný rod, ZMÍNIT jeho jméno nebo cultural_anchor
Také vytvoř anglický prompt pro generování portrétu — MUSÍ obsahovat odkaz na architectural_style národa nebo na cultural_anchor adoptovaného rodu.`,
          userPrompt: `Jméno: ${params.generalName}
Schopnost: ${params.generalSkill}/100
Rys: ${params.flavorTrait || "neznámý"}
Civilizace: ${civNameStr}`,
          functionName: "army-visualize/general_portrait",
          tools: [{
            type: "function",
            function: {
              name: "create_general_profile",
              description: "Create general bio and image prompt",
              parameters: {
                type: "object",
                properties: {
                  bio: { type: "string", description: "Epic biography in Czech, 3-5 sentences, must cite P0 + P0b" },
                  imagePrompt: { type: "string", description: "English portrait prompt; must reference architectural style or ancient-lineage anchor" },
                },
                required: ["bio", "imagePrompt"],
                additionalProperties: false,
              },
            },
          }],
          toolChoice: { type: "function", function: { name: "create_general_profile" } },
        });

        let bio = `${params.generalName} je legendární vojevůdce ${civNameStr}.`;
        let imgPrompt = `A medieval portrait of military commander ${params.generalName}, illuminated manuscript style, armor, commanding presence`;
        if (bioRes.ok && bioRes.data) {
          bio = bioRes.data.bio || bio;
          imgPrompt = bioRes.data.imagePrompt || imgPrompt;
        }
        if (lineageAnchors && !imgPrompt.toLowerCase().includes(lineageAnchors.toLowerCase())) {
          imgPrompt = `${imgPrompt}. Heritage motifs: ${lineageAnchors}.`;
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
