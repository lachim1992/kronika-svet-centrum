import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { PNG } from "https://esm.sh/pngjs@7.0.0";
import { Buffer } from "node:buffer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Remove background by flood-filling from corners with transparency */
function removeBackground(pngBuffer: Uint8Array): Uint8Array {
  const png = PNG.sync.read(Buffer.from(pngBuffer));
  const { width, height, data } = png;

  // Sample corner pixels to determine background color
  const corners = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: 0, y: height - 1 },
    { x: width - 1, y: height - 1 },
  ];

  // Get average corner color
  let rSum = 0, gSum = 0, bSum = 0;
  for (const c of corners) {
    const idx = (c.y * width + c.x) * 4;
    rSum += data[idx];
    gSum += data[idx + 1];
    bSum += data[idx + 2];
  }
  const bgR = Math.round(rSum / 4);
  const bgG = Math.round(gSum / 4);
  const bgB = Math.round(bSum / 4);

  console.log(`Detected background color: rgb(${bgR}, ${bgG}, ${bgB})`);

  // Flood fill from all corners
  const tolerance = 60; // color distance tolerance
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  function colorDist(idx: number): number {
    const dr = data[idx] - bgR;
    const dg = data[idx + 1] - bgG;
    const db = data[idx + 2] - bgB;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  // Seed from corners and edges
  for (let x = 0; x < width; x++) {
    queue.push(x); // top edge
    queue.push((height - 1) * width + x); // bottom edge
  }
  for (let y = 0; y < height; y++) {
    queue.push(y * width); // left edge
    queue.push(y * width + width - 1); // right edge
  }

  while (queue.length > 0) {
    const pos = queue.pop()!;
    if (visited[pos]) continue;
    visited[pos] = 1;

    const idx = pos * 4;
    if (colorDist(idx) > tolerance) continue;

    // Make transparent
    data[idx + 3] = 0;

    const x = pos % width;
    const y = Math.floor(pos / width);

    if (x > 0) queue.push(pos - 1);
    if (x < width - 1) queue.push(pos + 1);
    if (y > 0) queue.push(pos - width);
    if (y < height - 1) queue.push(pos + width);
  }

  // Also make any remaining pixels that closely match bg color semi-transparent
  // (catches isolated bg-color pixels inside the image)
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    if (data[idx + 3] === 0) continue; // already transparent
    if (colorDist(idx) < tolerance * 0.5) {
      data[idx + 3] = 0;
    }
  }

  return new Uint8Array(PNG.sync.write(png));
}

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

    // 3. Generate pixel art icon on solid background
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
                text: `Convert this city illustration into a tiny pixel art map icon on a SOLID BRIGHT GREEN (#00FF00) background. Requirements:
- Isometric/top-down perspective for a hex map tile
- 64x64 pixel art style with visible pixels
- Show the key architectural features of "${city.name}" (${city.settlement_level.toLowerCase()}) in miniature
- Use warm colors for the buildings that contrast with the green background
- The ENTIRE background must be uniform solid bright green (#00FF00) — no gradients, no shadows on the background
- Buildings should NOT contain any bright green (#00FF00) color
- Style: classic strategy game map icons (Civilization, Age of Empires)
- NO ground plane or terrain — buildings float directly on the green background`,
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

    // 4. Programmatic background removal (chroma key on detected bg color)
    console.log("Removing background programmatically...");
    const rawBase64 = generatedImage.replace(/^data:image\/\w+;base64,/, "");
    const rawBytes = Uint8Array.from(atob(rawBase64), (c) => c.charCodeAt(0));
    const cleanedBytes = removeBackground(rawBytes);

    // 5. Upload to storage
    const storagePath = `${session_id}/city/${city_id}-map-icon-${Date.now()}.png`;

    const { error: uploadErr } = await sb.storage
      .from("wonder-images")
      .upload(storagePath, cleanedBytes, {
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

    // 6. Save as encyclopedia_images entry with kind='map_icon'
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
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
