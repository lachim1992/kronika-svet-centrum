import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildTypeInstructions(entityType: string): string {
  switch (entityType?.toLowerCase()) {
    case "wonder": return "Monumental scale, cinematic composition, epic atmosphere, clear grandeur. Include small human figures for scale reference.";
    case "polis": return "Large classical city with visible walls, multiple districts. Elevated or panoramic view.";
    case "city": return "Medium to large urban layout, dense structures, visible market or central area.";
    case "town": return "Small town with dozens of buildings, modest density.";
    case "settlement": return "Small cluster of buildings, simple infrastructure.";
    case "village": return "5–10 houses, rural environment, low density.";
    case "province": return "Sweeping landscape view of a province, varied terrain, roads and scattered settlements visible.";
    case "region": return "Grand panoramic landscape, vast wilderness or terrain, distant horizons.";
    case "person": return "Portrait-style illustration, character study, expressive face, period-appropriate clothing and accessories.";
    case "arena": return "Ancient arena or stadium, tiered stone seating, open sky above, athletic grounds or gladiatorial sand floor, dramatic architecture with columns and arches.";
    case "building": return "Detailed medieval fantasy building, clear architectural features, dramatic lighting, stone and wood construction.";
    default: return "Detailed fantasy illustration with clear scale indicators.";
  }
}

function buildSmartPrompt(params: {
  entityType: string;
  entityName: string;
  description?: string;
  flavorText?: string;
  era?: string;
  imagePrompt?: string;
}): string {
  if (params.imagePrompt) {
    const typeHint = buildTypeInstructions(params.entityType);
    return `${params.imagePrompt}. ${typeHint} Include scale indicators such as people, animals, or carts. Ultra high resolution.`;
  }

  const parts: string[] = [];
  if (params.description) parts.push(params.description);
  if (params.flavorText) parts.push(`Atmosphere: ${params.flavorText}`);
  parts.push(buildTypeInstructions(params.entityType));
  if (params.era) parts.push(`Era/period: ${params.era}.`);
  if (params.entityName) parts.push(`Context: this depicts "${params.entityName}".`);
  if (!params.description && !params.flavorText) {
    parts.unshift(`A detailed fantasy illustration of ${params.entityName}, a ${params.entityType} in a medieval fantasy world. Rich colors, dramatic lighting.`);
  }
  parts.push("Include scale indicators such as people, animals, or carts. Ultra high resolution.");
  return parts.join(" ");
}

/** Fetch reference images for compositional generation */
async function fetchReferenceImages(
  sb: any, sessionId: string, entityType: string, entityId: string
): Promise<{ urls: string[]; contextHint: string }> {
  const urls: string[] = [];
  let contextHint = "";

  try {
    if (entityType === "province") {
      // Fetch city images within this province
      const { data: cities } = await sb.from("cities")
        .select("id, name, population_total, settlement_level")
        .eq("province_id", entityId).limit(5);
      
      if (cities?.length) {
        const cityIds = cities.map((c: any) => c.id);
        const { data: imgs } = await sb.from("encyclopedia_images")
          .select("image_url, entity_id")
          .eq("session_id", sessionId)
          .eq("entity_type", "city")
          .eq("is_primary", true)
          .in("entity_id", cityIds);
        
        for (const img of (imgs || [])) {
          if (img.image_url && !img.image_url.startsWith("data:")) urls.push(img.image_url);
        }
        
        const cityDescs = cities.map((c: any) => 
          `${c.name} (${c.settlement_level}, ${c.population_total} residents)`
        ).join(", ");
        contextHint = `This province contains these settlements: ${cityDescs}. The reference images show the actual cities — integrate their visual style into the landscape. Cities should appear at CORRECT SCALE on the horizon matching their settlement level.`;
      }
    } else if (entityType === "region") {
      // Fetch province/city images within this region
      const { data: provinces } = await sb.from("provinces")
        .select("id, name").eq("region_id", entityId).limit(5);
      
      if (provinces?.length) {
        const provIds = provinces.map((p: any) => p.id);
        const { data: cities } = await sb.from("cities")
          .select("id, name, population_total, settlement_level")
          .in("province_id", provIds).limit(6);
        
        if (cities?.length) {
          const cityIds = cities.map((c: any) => c.id);
          const { data: imgs } = await sb.from("encyclopedia_images")
            .select("image_url, entity_id")
            .eq("session_id", sessionId)
            .eq("entity_type", "city")
            .eq("is_primary", true)
            .in("entity_id", cityIds);
          
          for (const img of (imgs || [])) {
            if (img.image_url && !img.image_url.startsWith("data:")) urls.push(img.image_url);
          }
          
          const cityDescs = cities.map((c: any) =>
            `${c.name} (${c.settlement_level}, ${c.population_total} residents)`
          ).join(", ");
          contextHint = `This region contains settlements: ${cityDescs}. The reference images show actual cities in this region — they should appear as DISTANT elements in the vast landscape, at correct relative scale.`;
        }
      }
    } else if (entityType === "city") {
      // Fetch province landscape image as background reference
      const { data: city } = await sb.from("cities")
        .select("province_id").eq("id", entityId).maybeSingle();
      
      if (city?.province_id) {
        const { data: provImg } = await sb.from("encyclopedia_images")
          .select("image_url")
          .eq("session_id", sessionId)
          .eq("entity_type", "province")
          .eq("entity_id", city.province_id)
          .eq("is_primary", true)
          .maybeSingle();
        
        if (provImg?.image_url && !provImg.image_url.startsWith("data:")) {
          urls.push(provImg.image_url);
          contextHint = `The reference image shows the surrounding province landscape. The city's background terrain, horizon, and environment should MATCH this landscape — use similar colors, terrain features, and atmosphere. The city is WITHIN this landscape.`;
        }
      }
    }
  } catch (e) {
    console.warn("Failed to fetch reference images:", e);
  }

  return { urls: urls.slice(0, 3), contextHint };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { entityType, entityName, entityId, sessionId, imagePrompt, createdBy, description, flavorText, era } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let resolvedDescription = description || "";
    let resolvedFlavor = flavorText || "";
    let resolvedEra = era || "";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    if (!resolvedDescription && entityId && sessionId) {
      const { data: wiki } = await sb.from("wiki_entries").select("ai_description, summary").eq("entity_id", entityId).eq("session_id", sessionId).maybeSingle();
      if (wiki) resolvedDescription = wiki.ai_description || wiki.summary || "";

      if (entityType === "city") {
        const { data: city } = await sb.from("cities").select("flavor_prompt, level").eq("id", entityId).maybeSingle();
        if (city) resolvedFlavor = resolvedFlavor || city.flavor_prompt || "";
      } else if (entityType === "wonder") {
        const { data: wonder } = await sb.from("wonders").select("description, era, bonus").eq("id", entityId).maybeSingle();
        if (wonder) {
          resolvedDescription = resolvedDescription || wonder.description || "";
          resolvedEra = resolvedEra || wonder.era || "";
          resolvedFlavor = resolvedFlavor || wonder.bonus || "";
        }
      } else if (entityType === "person") {
        const { data: person } = await sb.from("great_persons").select("bio, flavor_trait, person_type").eq("id", entityId).maybeSingle();
        if (person) {
          resolvedDescription = resolvedDescription || person.bio || "";
          resolvedFlavor = resolvedFlavor || person.flavor_trait || "";
        }
      } else if (entityType === "region") {
        const { data: region } = await sb.from("regions").select("description, ai_description, biome").eq("id", entityId).maybeSingle();
        if (region) {
          resolvedDescription = resolvedDescription || region.ai_description || region.description || "";
          resolvedFlavor = resolvedFlavor || (region.biome ? `Biome: ${region.biome}` : "");
        }
      } else if (entityType === "province") {
        const { data: prov } = await sb.from("provinces").select("description, ai_description").eq("id", entityId).maybeSingle();
        if (prov) resolvedDescription = resolvedDescription || prov.ai_description || prov.description || "";
      }
    }

    const prompt = buildSmartPrompt({
      entityType: entityType || "unknown",
      entityName: entityName || "Unknown",
      description: resolvedDescription,
      flavorText: resolvedFlavor,
      era: resolvedEra,
      imagePrompt,
    });

    // Fetch reference images for compositional generation
    const refs = entityId && sessionId
      ? await fetchReferenceImages(sb, sessionId, entityType, entityId)
      : { urls: [], contextHint: "" };

    const hasRefs = refs.urls.length > 0;
    console.log(`[encyclopedia-image] type=${entityType} refs=${refs.urls.length} prompt=${prompt.substring(0, 150)}...`);

    // Build message content - multimodal if we have reference images
    let messageContent: any;
    if (hasRefs) {
      const compositPrompt = `${prompt}\n\nIMPORTANT VISUAL INTEGRATION: ${refs.contextHint}\nUse the reference images to ensure visual consistency. Generate a NEW image that integrates elements from the references.`;
      messageContent = [
        { type: "text", text: compositPrompt },
        ...refs.urls.map(url => ({
          type: "image_url",
          image_url: { url },
        })),
      ];
    } else {
      messageContent = prompt;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: messageContent }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Nedostatek kreditů" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI image gateway error");
    }

    const data = await response.json();
    const imageData = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageData) {
      console.warn("No image in AI response, returning fallback");
      return new Response(JSON.stringify({
        imageUrl: null, imagePrompt: prompt,
        debug: { provider: "no-image-returned", refsUsed: refs.urls.length },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Upload to storage
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const fileName = `${sessionId}/${entityType}/${entityId || "new"}-${Date.now()}.png`;
    const { error: uploadError } = await sb.storage
      .from("wonder-images")
      .upload(fileName, bytes, { contentType: "image/png", upsert: true });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(JSON.stringify({ imageUrl: imageData, imagePrompt: prompt }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: publicUrl } = sb.storage.from("wonder-images").getPublicUrl(fileName);

    if (entityId && sessionId) {
      await sb.from("encyclopedia_images").insert({
        session_id: sessionId,
        entity_type: entityType,
        entity_id: entityId,
        image_url: publicUrl.publicUrl,
        image_prompt: prompt,
        created_by: createdBy || "system",
        is_primary: true,
      });
    }

    return new Response(JSON.stringify({
      imageUrl: publicUrl.publicUrl,
      imagePrompt: prompt,
      refsUsed: refs.urls.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("encyclopedia-image error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
