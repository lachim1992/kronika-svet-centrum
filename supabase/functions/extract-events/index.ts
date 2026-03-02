/**
 * extract-events — Analyzes text to find event mentions and link to existing events.
 * Uses createAIContext for premise injection (epoch context helps terminology matching).
 */

import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse, getServiceClient } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, sessionId } = await req.json();
    if (!text || !sessionId) throw new Error("Missing text or sessionId");

    const sb = getServiceClient();
    const ctx = await createAIContext(sessionId, undefined, sb);

    // Fetch existing world_events for matching
    const { data: existingEvents } = await sb
      .from("world_events")
      .select("id, title, slug, date, summary, tags")
      .eq("session_id", sessionId)
      .limit(200);

    const eventsContext = (existingEvents || [])
      .map((e: any) => `- id:${e.id} title:"${e.title}" slug:${e.slug}${e.date ? ` date:${e.date}` : ""}${e.tags?.length ? ` tags:${e.tags.join(",")}` : ""}`)
      .join("\n");

    const result = await invokeAI(ctx, {
      systemPrompt: `Jsi analytik historických textů. Tvým úkolem je najít všechny zmínky o událostech v textu.

Pro každou zmínku urči:
- mention: přesná fráze z textu
- eventType: typ události (battle, coronation, plague, fall, founding, treaty, migration, disaster, celebration, other)

Poté porovnej s existujícími událostmi v databázi a urči:
- Pokud odpovídá existující události (confidence >= 0.8): status "linked", existingEventId
- Pokud částečně odpovídá (confidence 0.4-0.79): status "ambiguous", candidates (array existingEventId)
- Pokud neodpovídá ničemu: status "suggested", navrhni title a slug pro novou událost

Existující události:
${eventsContext || "(žádné)"}

Odpověz POUZE voláním funkce extract_events.`,
      userPrompt: `Analyzuj tento text:\n\n${text}`,
      tools: [{
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
                    mention: { type: "string" },
                    eventType: { type: "string" },
                    status: { type: "string", enum: ["linked", "ambiguous", "suggested"] },
                    confidence: { type: "number" },
                    existingEventId: { type: "string" },
                    candidates: { type: "array", items: { type: "string" } },
                    suggestedTitle: { type: "string" },
                    suggestedSlug: { type: "string" },
                  },
                  required: ["mention", "eventType", "status", "confidence"],
                  additionalProperties: false,
                },
              },
            },
            required: ["detectedEvents"], additionalProperties: false,
          },
        },
      }],
      toolChoice: { type: "function", function: { name: "extract_events" } },
    });

    if (!result.ok) {
      if (result.status === 429) return jsonResponse({ error: "Rate limit exceeded" }, 429);
      if (result.status === 402) return jsonResponse({ error: "AI credits exhausted" }, 402);
      return jsonResponse({ detectedEvents: [], debug: result.debug });
    }

    // Enrich ambiguous candidates with titles
    const enriched = await Promise.all(
      (result.data?.detectedEvents || []).map(async (evt: any) => {
        if (evt.status === "ambiguous" && evt.candidates?.length) {
          const { data: candidateEvents } = await sb
            .from("world_events").select("id, title, slug, date, summary").in("id", evt.candidates);
          return { ...evt, candidateDetails: candidateEvents || [] };
        }
        if (evt.status === "linked" && evt.existingEventId) {
          const { data: linked } = await sb
            .from("world_events").select("id, title, slug, date").eq("id", evt.existingEventId).maybeSingle();
          return { ...evt, linkedEvent: linked };
        }
        return evt;
      })
    );

    return jsonResponse({ detectedEvents: enriched, debug: result.debug });
  } catch (e) {
    console.error("extract-events error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
