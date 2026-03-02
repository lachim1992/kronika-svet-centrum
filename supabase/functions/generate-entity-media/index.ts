import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Style-aware prompt builder ── */

function buildTypeInstructions(entityType: string): string {
  switch (entityType?.toLowerCase()) {
    case "wonder":
      return "Monumental scale, cinematic composition, epic atmosphere, clear grandeur. Include small human figures for scale reference.";
    case "polis":
      return "CLOSE-UP view of a grand classical city. Focus on monumental architecture, colonnades, plazas, walls. Individual buildings and people clearly visible. NO wide landscape.";
    case "city":
      return "CLOSE-UP street-level or low aerial view of the settlement. Focus on architecture, buildings, walls, gates, market squares. Individual structures clearly visible. NO wide landscape — this is a zoom into the settlement itself.";
    case "town":
      return "CLOSE-UP view of a small town with dozens of buildings. Focus on rooftops, a modest market square, town walls. People visible in streets. NO wide landscape.";
    case "settlement":
      return "CLOSE-UP view of a small cluster of buildings, simple infrastructure. Individual huts and people visible. Surrounding terrain only as immediate context.";
    case "village":
      return "CLOSE-UP view of 5–10 houses in a rural clearing. Individual buildings, gardens, and villagers visible. Immediate surroundings only.";
    case "province":
      return "WIDE landscape view from a hilltop. Focus on terrain, nature, rivers, forests, fields. Settlements appear ONLY as tiny specks or smoke plumes on the distant horizon. DO NOT show close-up buildings or streets — this is a landscape, not a city.";
    case "region":
      return "GRAND panoramic vista from a great height. Vast wilderness stretching to the horizon. No individual buildings visible — only terrain, rivers, mountain ranges, forests. Scale of an entire geographic region.";
    case "person":
      return "Portrait-style illustration, character study, expressive face, period-appropriate clothing and accessories.";
    case "country":
      return "Majestic panoramic view of an entire realm from extreme height. Multiple terrain types visible. Castles and cities appear as tiny dots. Banners and heraldic elements frame the composition.";
    default:
      return "Detailed fantasy illustration with clear scale indicators.";
  }
}

const STYLE_PRESETS: Record<string, string> = {
  default:
    "Rich colors, dramatic lighting, detailed fantasy illustration. Include scale indicators such as people, animals, or carts. Ultra high resolution.",
  medieval_illumination:
    "Style of a medieval illuminated manuscript. Gold leaf accents, intricate borders, warm parchment tones. Decorated initials and marginalia. Ultra high resolution.",
  oil_painting:
    "Oil painting style, Baroque lighting, heavy impasto, warm color palette. Ultra high resolution.",
  map_cartographic:
    "Fantasy cartography style, parchment paper, inked outlines, compass rose, labeled landmarks. Ultra high resolution.",
};

interface GenerateParams {
  sessionId: string;
  entityId: string;
  entityType: string;
  entityName: string;
  kind: string; // 'cover' | 'portrait' | 'illustration' | 'sigil' | 'card'
  stylePreset?: string;
  imagePrompt?: string; // explicit override
  createdBy?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const params: GenerateParams = await req.json();
    const {
      sessionId,
      entityId,
      entityType,
      entityName,
      kind = "cover",
      stylePreset = "default",
      imagePrompt,
      createdBy = "system",
    } = params;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 1. Fetch lore bible ──
    const { data: styleCfg } = await sb
      .from("game_style_settings")
      .select("lore_bible, prompt_rules, default_style_preset")
      .eq("session_id", sessionId)
      .maybeSingle();

    const loreBible = styleCfg?.lore_bible || "";
    const promptRules = styleCfg?.prompt_rules || "";
    const effectivePreset = stylePreset || styleCfg?.default_style_preset || "default";

    // ── 2. Fetch canonical description ──
    let description = "";
    let flavorText = "";
    let era = "";

    // Try wiki_entries first (canonical description layer)
    const { data: wiki } = await sb
      .from("wiki_entries")
      .select("ai_description, summary, image_prompt")
      .eq("session_id", sessionId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .maybeSingle();

    if (wiki) {
      description = wiki.ai_description || wiki.summary || "";
    }

    // Enrich from entity-specific tables + fetch owner's civ DNA
    let ownerPlayer = "";
    if (entityType === "city") {
      const { data: city } = await sb.from("cities").select("flavor_prompt, level, settlement_level, owner_player").eq("id", entityId).maybeSingle();
      if (city) {
        flavorText = city.flavor_prompt || "";
        ownerPlayer = city.owner_player || "";
      }
    } else if (entityType === "wonder") {
      const { data: wonder } = await sb.from("wonders").select("description, era, bonus, owner_player").eq("id", entityId).maybeSingle();
      if (wonder) {
        description = description || wonder.description || "";
        era = wonder.era || "";
        flavorText = wonder.bonus || "";
        ownerPlayer = wonder.owner_player || "";
      }
    } else if (entityType === "person") {
      const { data: person } = await sb.from("great_persons").select("bio, flavor_trait, person_type, player_name").eq("id", entityId).maybeSingle();
      if (person) {
        description = description || person.bio || "";
        flavorText = person.flavor_trait || "";
        ownerPlayer = person.player_name || "";
      }
    } else if (entityType === "region") {
      const { data: region } = await sb.from("regions").select("description, ai_description, biome, owner_player").eq("id", entityId).maybeSingle();
      if (region) {
        description = description || region.ai_description || region.description || "";
        flavorText = region.biome ? `Biome: ${region.biome}` : "";
        ownerPlayer = region.owner_player || "";
      }
    } else if (entityType === "province") {
      const { data: prov } = await sb.from("provinces").select("description, ai_description, owner_player").eq("id", entityId).maybeSingle();
      if (prov) {
        description = description || prov.ai_description || prov.description || "";
        ownerPlayer = prov.owner_player || "";
      }
    } else if (entityType === "country") {
      const { data: country } = await sb.from("countries").select("description, ai_description, ruler_player").eq("id", entityId).maybeSingle();
      if (country) {
        description = description || country.ai_description || country.description || "";
        ownerPlayer = country.ruler_player || "";
      }
    }

    // Load owner's civilization DNA for architectural style
    let architecturalStyle = "";
    let culturalQuirk = "";
    if (ownerPlayer && sessionId) {
      const { data: civ } = await sb.from("civilizations")
        .select("architectural_style, cultural_quirk")
        .eq("session_id", sessionId)
        .eq("player_name", ownerPlayer)
        .maybeSingle();
      if (civ) {
        architecturalStyle = civ.architectural_style || "";
        culturalQuirk = civ.cultural_quirk || "";
      }
    }

    // ── 3. Fetch recent chronicle mentions for context ──
    const { data: mentions } = await sb
      .from("chronicle_mentions")
      .select("entry_id")
      .eq("session_id", sessionId)
      .eq("entity_id", entityId)
      .limit(5);

    let chronicleContext = "";
    if (mentions && mentions.length > 0) {
      const entryIds = mentions.map((m: any) => m.entry_id);
      const { data: entries } = await sb
        .from("chronicle_entries")
        .select("text")
        .in("id", entryIds)
        .limit(5);
      if (entries) {
        chronicleContext = entries.map((e: any) => e.text).join(" ").substring(0, 500);
      }
    }

    // ── 4. Build prompt ──
    const styleStr = STYLE_PRESETS[effectivePreset] || STYLE_PRESETS["default"];
    const typeStr = buildTypeInstructions(entityType);

    let prompt: string;
    if (imagePrompt) {
      // Explicit prompt override, still enriched
      prompt = `${imagePrompt}. ${typeStr} ${styleStr}`;
    } else {
      const parts: string[] = [];
      if (architecturalStyle) parts.push(`IMPORTANT — Civilization's architectural style: "${architecturalStyle}". ALL structures, buildings, and urban landscapes MUST visually reflect this style in materials, shapes, and decoration.`);
      if (culturalQuirk) parts.push(`Cultural tradition: "${culturalQuirk}". Reflect subtle cultural elements in the scene.`);
      if (description) parts.push(description);
      if (flavorText) parts.push(`Atmosphere: ${flavorText}`);
      parts.push(typeStr);
      if (era) parts.push(`Era/period: ${era}.`);
      if (entityName) parts.push(`Context: this depicts "${entityName}".`);
      if (chronicleContext) parts.push(`Historical context: ${chronicleContext.substring(0, 300)}`);
      if (loreBible) parts.push(`World lore: ${loreBible.substring(0, 400)}`);
      if (promptRules) parts.push(`Style rules: ${promptRules.substring(0, 200)}`);

      if (!description && !flavorText) {
        parts.unshift(
          `A detailed fantasy illustration of ${entityName}, a ${entityType} in a medieval fantasy world. Rich colors, dramatic lighting.`
        );
      }
      parts.push(styleStr);
      prompt = parts.join(" ");
    }

    console.log(`[generate-entity-media] kind=${kind} preset=${effectivePreset} prompt=${prompt.substring(0, 150)}...`);

    // ── 5. Generate image ──
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

    if (!response.ok) {
      if (response.status === 429)
        return new Response(JSON.stringify({ error: "Rate limit" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      if (response.status === 402)
        return new Response(JSON.stringify({ error: "Nedostatek kreditů" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      throw new Error(`AI image gateway error: ${response.status}`);
    }

    const data = await response.json();
    const imageBase64 = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageBase64) {
      console.warn("[generate-entity-media] No image returned by AI");
      return new Response(
        JSON.stringify({ imageUrl: null, imagePrompt: prompt, debug: { provider: "no-image-returned" } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 6. Upload to storage ──
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const fileName = `${sessionId}/${entityType}/${entityId || "new"}-${kind}-${Date.now()}.png`;

    const { error: uploadError } = await sb.storage
      .from("wonder-images")
      .upload(fileName, binaryData, { contentType: "image/png", upsert: true });

    let imageUrl: string;
    if (uploadError) {
      console.error("[generate-entity-media] Upload error:", uploadError);
      imageUrl = imageBase64; // fallback to base64
    } else {
      const { data: publicUrl } = sb.storage.from("wonder-images").getPublicUrl(fileName);
      imageUrl = publicUrl.publicUrl;
    }

    // ── 7. Store in encyclopedia_images (SINGLE SOURCE OF TRUTH) ──
    // If this is a primary cover, unset other primaries first
    if (kind === "cover") {
      await sb
        .from("encyclopedia_images")
        .update({ is_primary: false })
        .eq("session_id", sessionId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("kind", "cover")
        .eq("is_primary", true);
    }

    await sb.from("encyclopedia_images").insert({
      session_id: sessionId,
      entity_type: entityType,
      entity_id: entityId,
      image_url: imageUrl,
      image_prompt: prompt,
      created_by: createdBy,
      is_primary: kind === "cover",
      kind,
      style_preset: effectivePreset,
      model_meta: { model: "gemini-2.5-flash-image", loreBibleUsed: !!loreBible },
    });

    // ── 8. Also update wiki_entries.image_url for backward compat ──
    if (kind === "cover" && wiki) {
      await sb
        .from("wiki_entries")
        .update({ image_url: imageUrl, image_prompt: prompt, updated_at: new Date().toISOString() })
        .eq("session_id", sessionId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId);
    }

    return new Response(
      JSON.stringify({
        imageUrl,
        imagePrompt: prompt,
        kind,
        stylePreset: effectivePreset,
        debug: { provider: "lovable-ai", loreBibleUsed: !!loreBible, chronicleContextUsed: !!chronicleContext },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[generate-entity-media] error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
