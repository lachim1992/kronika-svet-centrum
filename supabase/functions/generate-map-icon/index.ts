import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { session_id, city_id } = await req.json();
    if (!session_id || !city_id) {
      return new Response(
        JSON.stringify({ error: "session_id and city_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Get city info
    const { data: city, error: cityErr } = await sb
      .from("cities")
      .select("id, name, settlement_level, owner_player")
      .eq("id", city_id)
      .eq("session_id", session_id)
      .single();

    if (cityErr || !city) {
      return new Response(
        JSON.stringify({ error: "City not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Get existing primary cover image
    const { data: images } = await sb
      .from("encyclopedia_images")
      .select("image_url")
      .eq("entity_id", city_id)
      .eq("entity_type", "city")
      .eq("is_primary", true)
      .eq("kind", "cover")
      .limit(1);

    const sourceImageUrl = images?.[0]?.image_url;
    if (!sourceImageUrl) {
      return new Response(
        JSON.stringify({ error: "No cover image found for this city" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Generate pixel art icon using Lovable AI image editing
    console.log(`Generating pixel map icon for ${city.name} from ${sourceImageUrl}`);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Convert this city illustration into a tiny pixel art map icon. Requirements:
- Top-down/isometric perspective suitable for a hex map tile
- 64x64 pixel art style with visible pixels
- Show the key architectural features of this specific city in miniature
- Use a warm color palette that stands out on a dark map background
- No background (or very minimal), just the settlement itself
- The style should feel like classic strategy game map icons (Age of Empires, Civilization)
- Make it recognizable as "${city.name}" - a ${city.settlement_level.toLowerCase()} level settlement`,
              },
              {
                type: "image_url",
                image_url: { url: sourceImageUrl },
              },
            ],
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "AI generation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const generatedImage = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!generatedImage) {
      console.error("No image in AI response:", JSON.stringify(aiData).slice(0, 500));
      return new Response(
        JSON.stringify({ error: "AI did not return an image" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Upload to storage
    const base64Data = generatedImage.replace(/^data:image\/\w+;base64,/, "");
    const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const storagePath = `${session_id}/city/${city_id}-map-icon-${Date.now()}.png`;

    const { error: uploadErr } = await sb.storage
      .from("wonder-images")
      .upload(storagePath, binaryData, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadErr) {
      console.error("Storage upload error:", uploadErr);
      return new Response(
        JSON.stringify({ error: "Failed to upload icon" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: publicUrl } = sb.storage
      .from("wonder-images")
      .getPublicUrl(storagePath);

    // 5. Save as encyclopedia_images entry with kind='map_icon'
    // Remove old map_icon entries for this city
    await sb
      .from("encyclopedia_images")
      .delete()
      .eq("entity_id", city_id)
      .eq("entity_type", "city")
      .eq("kind", "map_icon")
      .eq("session_id", session_id);

    const { error: insertErr } = await sb.from("encyclopedia_images").insert({
      session_id,
      entity_id: city_id,
      entity_type: "city",
      image_url: publicUrl.publicUrl,
      kind: "map_icon",
      is_primary: false,
      created_by: "ai_generate",
      image_prompt: `Pixel art map icon for ${city.name}`,
    });

    if (insertErr) {
      console.error("DB insert error:", insertErr);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        city_name: city.name,
        map_icon_url: publicUrl.publicUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-map-icon error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
