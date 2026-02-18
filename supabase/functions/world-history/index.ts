import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { events, worldMemories, epochStyle, fromTurn, toTurn, existingWorldEvents } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const epochInstructions: Record<string, string> = {
      myty: "Piš jako starověký mýtus, s bohy a legendami.",
      kroniky: "Piš jako středověký kronikář. Formální, vznešený styl.",
      moderni: "Piš jako moderní historik, faktický a analytický styl.",
    };

    const eventsText = events.map((e: any) =>
      `[Rok ${e.turn_number}] ${e.player}: ${e.event_type}${e.location ? ` u ${e.location}` : ""}${e.note ? ` — ${e.note}` : ""}`
    ).join("\n");

    const memoriesText = worldMemories?.length
      ? `\nFakta o světě:\n${worldMemories.map((m: any) => `- ${m}`).join("\n")}`
      : "";

    const existingEventsText = (existingWorldEvents || []).map((e: any) =>
      `- id="${e.id}" title="${e.title}"${e.date ? ` date="${e.date}"` : ""}${e.summary ? ` summary="${e.summary}"` : ""}`
    ).join("\n");

    const systemPrompt = `Jsi nestranný historik světa. ${epochInstructions[epochStyle] || epochInstructions.kroniky}

PRAVIDLA:
- Piš NEUTRÁLNĚ, jako historik celého světa, nikoli z perspektivy jednoho hráče.
- NESMÍŠ vymýšlet nové události. Narativně zpracuj POUZE dodaná data.
- Výstup MUSÍ být v češtině.
- Rozděl vyprávění do logických kapitol podle epoch/období.

EVENT-AWARE PRAVIDLA:
- Při psaní kroniky IDENTIFIKUJ všechny historické události, které v textu popisuješ.
- Pro KAŽDOU zmíněnou událost uveď v eventsMentioned:
  - Pokud událost odpovídá existujícímu záznamu z "EXISTUJÍCÍ UDÁLOSTI", uveď její eventId.
  - Pokud jde o NOVOU událost (neexistuje v databázi), nastav create=true a vyplň metadata.
- PREFERUJ propojení s existujícími událostmi místo vytváření duplicit.
- Každý kronikový zápis MUSÍ mít alespoň 1 event reference.
- Odpověz POUZE voláním funkce generate_world_history.`;

    const userPrompt = `Vygeneruj objektivní dějiny světa pro období roků ${fromTurn}–${toTurn}:

${eventsText}${memoriesText}

EXISTUJÍCÍ UDÁLOSTI V DATABÁZI (použij jejich eventId pokud odpovídají):
${existingEventsText || "žádné"}`;

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
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_world_history",
            description: "Return world history chapter with event metadata.",
            parameters: {
              type: "object",
              properties: {
                chapterTitle: { type: "string", description: "Chapter title in Czech" },
                chapterText: { type: "string", description: "Full chapter text in Czech, multiple paragraphs" },
                eventsMentioned: {
                  type: "array",
                  description: "All historical events mentioned in the chronicle text",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "Event title in Czech" },
                      eventId: { type: "string", description: "ID of existing event if matched, omit if new" },
                      confidence: { type: "number", description: "Match confidence 0-1" },
                      create: { type: "boolean", description: "True if this is a new event to create" },
                      dateGuess: { type: "string", description: "Estimated date/year for new events" },
                      locationGuess: { type: "string", description: "Estimated location for new events" },
                      summary: { type: "string", description: "Brief summary for new events" },
                      participants: {
                        type: "array",
                        items: { type: "string" },
                        description: "Key participants in the event",
                      },
                      tags: {
                        type: "array",
                        items: { type: "string" },
                        description: "Tags like war, trade, diplomacy, founding, etc.",
                      },
                    },
                    required: ["title", "confidence"],
                  },
                },
              },
              required: ["chapterTitle", "chapterText", "eventsMentioned"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_world_history" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ chapterTitle: `Dějiny světa (roky ${fromTurn}–${toTurn})`, chapterText: "Kronikář nemá v tuto chvíli prostředky k záznamu. (AI kredity vyčerpány)", eventsMentioned: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call");

    const result = JSON.parse(toolCall.function.arguments);
    // Ensure eventsMentioned is always an array
    if (!result.eventsMentioned) result.eventsMentioned = [];
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("world-history error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
