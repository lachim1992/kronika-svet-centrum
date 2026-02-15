import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { events, worldMemories, epochStyle, fromTurn, toTurn } = await req.json();

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

    const systemPrompt = `Jsi nestranný historik světa. ${epochInstructions[epochStyle] || epochInstructions.kroniky}

PRAVIDLA:
- Piš NEUTRÁLNĚ, jako historik celého světa, nikoli z perspektivy jednoho hráče.
- NESMÍŠ vymýšlet nové události. Narativně zpracuj POUZE dodaná data.
- Výstup MUSÍ být v češtině.
- Rozděl vyprávění do logických kapitol podle epoch/období.
- Odpověz POUZE voláním funkce generate_world_history.`;

    const userPrompt = `Vygeneruj objektivní dějiny světa pro období roků ${fromTurn}–${toTurn}:\n\n${eventsText}${memoriesText}`;

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
            description: "Return world history chapter title and text.",
            parameters: {
              type: "object",
              properties: {
                chapterTitle: { type: "string", description: "Chapter title in Czech" },
                chapterText: { type: "string", description: "Full chapter text in Czech, multiple paragraphs" },
              },
              required: ["chapterTitle", "chapterText"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_world_history" } },
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
