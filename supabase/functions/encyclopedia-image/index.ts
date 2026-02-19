import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { entityType, entityName, entityId, sessionId, imagePrompt, createdBy } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = imagePrompt || `A detailed fantasy illustration of ${entityName}, a ${entityType} in a medieval fantasy world. Rich colors, detailed architecture, dramatic lighting.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          { role: "user", content: prompt },
        ],
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
        imageUrl: null,
        imagePrompt: prompt,
        debug: { provider: "no-image-returned" },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Upload to storage
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Convert base64 to bytes
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    const fileName = `${sessionId}/${entityType}/${entityId || "new"}-${Date.now()}.png`;
    const { error: uploadError } = await supabase.storage
      .from("wonder-images")
      .upload(fileName, bytes, { contentType: "image/png", upsert: true });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      // Return base64 as fallback
      return new Response(JSON.stringify({
        imageUrl: imageData,
        imagePrompt: prompt,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: publicUrl } = supabase.storage
      .from("wonder-images")
      .getPublicUrl(fileName);

    // Save to encyclopedia_images
    if (entityId && sessionId) {
      await supabase.from("encyclopedia_images").insert({
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
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("encyclopedia-image error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
