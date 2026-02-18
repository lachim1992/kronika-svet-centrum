import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { playerName, civName, events, playerCities, playerMemories, rivalInfo, epochStyle, fromTurn, toTurn, existingWorldEvents } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const epochInstructions: Record<string, string> = {
      myty: "Piš jako heroický epos, kde hráčova civilizace je hlavním hrdinou.",
      kroniky: "Piš jako dvorní kronikář hráčovy říše. Zaujatý, vznešený, oslavující.",
      moderni: "Piš jako válečný dopisovatel na straně hráčovy civilizace.",
    };

    const eventsText = events.map((e: any) =>
      `[Rok ${e.turn_number}] ${e.player}: ${e.event_type}${e.location ? ` u ${e.location}` : ""}${e.note ? ` — ${e.note}` : ""}`
    ).join("\n");

    const citiesText = playerCities?.length
      ? `\nMěsta ${playerName}: ${playerCities.map((c: any) => c.name).join(", ")}`
      : "";

    const memoriesText = playerMemories?.length
      ? `\nPaměti říše:\n${playerMemories.map((m: any) => `- ${m}`).join("\n")}`
      : "";

    const rivalText = rivalInfo?.length
      ? `\nZvěsti o soupeřích:\n${rivalInfo.map((r: any) => `- ${r}`).join("\n")}`
      : "";

    const existingEventsText = (existingWorldEvents || []).map((e: any) =>
      `- id="${e.id}" title="${e.title}"${e.date ? ` date="${e.date}"` : ""}${e.summary ? ` summary="${e.summary}"` : ""}`
    ).join("\n");

    const systemPrompt = `Jsi dvorní kronikář civilizace "${civName || playerName}". ${epochInstructions[epochStyle] || epochInstructions.kroniky}

PRAVIDLA:
- Piš z PERSPEKTIVY hráče ${playerName} a jeho říše "${civName || playerName}".
- Hráčovy úspěchy zdůrazni, porážky prezentuj jako hrdinské oběti nebo zrady nepřátel.
- Události jiných hráčů popisuj z pohledu rivala/pozorovatele.
- NESMÍŠ vymýšlet nové události. Narativně zpracuj POUZE dodaná data.
- Výstup MUSÍ být v češtině.

EVENT-AWARE PRAVIDLA:
- IDENTIFIKUJ všechny historické události zmíněné v textu.
- Pokud událost odpovídá existujícímu záznamu, uveď její eventId.
- Pokud jde o NOVOU událost, nastav create=true a vyplň metadata.
- PREFERUJ existující události místo duplicit.
- Každý kronikový zápis MUSÍ mít alespoň 1 event reference.
- Odpověz POUZE voláním funkce generate_player_chronicle.`;

    const userPrompt = `Vygeneruj osobní kroniku říše "${civName || playerName}" pro období roků ${fromTurn}–${toTurn}:

${eventsText}${citiesText}${memoriesText}${rivalText}

EXISTUJÍCÍ UDÁLOSTI V DATABÁZI:
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
            name: "generate_player_chronicle",
            description: "Return player chronicle chapter with event metadata.",
            parameters: {
              type: "object",
              properties: {
                chapterTitle: { type: "string", description: "Chapter title in Czech, from player perspective" },
                chapterText: { type: "string", description: "Full chapter text in Czech, biased toward the player" },
                eventsMentioned: {
                  type: "array",
                  description: "All historical events mentioned in the chronicle text",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "Event title in Czech" },
                      eventId: { type: "string", description: "ID of existing event if matched" },
                      confidence: { type: "number", description: "Match confidence 0-1" },
                      create: { type: "boolean", description: "True if new event to create" },
                      dateGuess: { type: "string", description: "Estimated date/year" },
                      locationGuess: { type: "string", description: "Estimated location" },
                      summary: { type: "string", description: "Brief summary" },
                      participants: { type: "array", items: { type: "string" } },
                      tags: { type: "array", items: { type: "string" } },
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
        tool_choice: { type: "function", function: { name: "generate_player_chronicle" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Nedostatek kreditů" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call");

    const result = JSON.parse(toolCall.function.arguments);
    if (!result.eventsMentioned) result.eventsMentioned = [];
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("player-chronicle error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
