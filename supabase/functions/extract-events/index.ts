import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, sessionId } = await req.json();
    if (!text || !sessionId) throw new Error("Missing text or sessionId");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Fetch existing world_events for this session
    const { data: existingEvents } = await sb
      .from("world_events")
      .select("id, title, slug, date, summary, tags")
      .eq("session_id", sessionId)
      .limit(200);

    const eventsContext = (existingEvents || [])
      .map((e: any) => `- id:${e.id} title:"${e.title}" slug:${e.slug}${e.date ? ` date:${e.date}` : ""}${e.tags?.length ? ` tags:${e.tags.join(",")}` : ""}`)
      .join("\n");

    const systemPrompt = `Jsi analytik historických textů. Tvým úkolem je najít všechny zmínky o událostech v textu.

Pro každou zmínku urči:
- mention: přesná fráze z textu
- eventType: typ události (battle, coronation, plague, fall, founding, treaty, migration, disaster, celebration, other)

Poté porovnej s existujícími událostmi v databázi a urči:
- Pokud odpovídá existující události (confidence >= 0.8): status "linked", existingEventId
- Pokud částečně odpovídá (confidence 0.4-0.79): status "ambiguous", candidates (array existingEventId)
- Pokud neodpovídá ničemu: status "suggested", navrhni title a slug pro novou událost

Existující události:
${eventsContext || "(žádné)"}

Odpověz POUZE voláním funkce extract_events.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyzuj tento text:\n\n${text}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_events",
              description: "Return detected event mentions from the text.",
              parameters: {
                type: "object",
                properties: {
                  detectedEvents: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        mention: { type: "string", description: "Exact phrase from text" },
                        eventType: { type: "string" },
                        status: { type: "string", enum: ["linked", "ambiguous", "suggested"] },
                        confidence: { type: "number", description: "0-1 confidence score" },
                        existingEventId: { type: "string", description: "UUID of matched event if linked" },
                        candidates: {
                          type: "array",
                          items: { type: "string" },
                          description: "Array of candidate event UUIDs if ambiguous",
                        },
                        suggestedTitle: { type: "string", description: "Title for new event if suggested" },
                        suggestedSlug: { type: "string", description: "Slug for new event if suggested" },
                      },
                      required: ["mention", "eventType", "status", "confidence"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["detectedEvents"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_events" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const result = JSON.parse(toolCall.function.arguments);

    // Enrich ambiguous candidates with their titles
    const enriched = await Promise.all(
      (result.detectedEvents || []).map(async (evt: any) => {
        if (evt.status === "ambiguous" && evt.candidates?.length) {
          const { data: candidateEvents } = await sb
            .from("world_events")
            .select("id, title, slug, date, summary")
            .in("id", evt.candidates);
          return { ...evt, candidateDetails: candidateEvents || [] };
        }
        if (evt.status === "linked" && evt.existingEventId) {
          const { data: linked } = await sb
            .from("world_events")
            .select("id, title, slug, date")
            .eq("id", evt.existingEventId)
            .maybeSingle();
          return { ...evt, linkedEvent: linked };
        }
        return evt;
      })
    );

    return new Response(JSON.stringify({ detectedEvents: enriched }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-events error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
