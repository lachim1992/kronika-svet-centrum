import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { event, cityMemories, notes, epochStyle, worldFacts } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const epochInstructions: Record<string, string> = {
      myty: "Piš jako starověký mýtus, s bohy a legendami. Používej archaický jazyk.",
      kroniky: "Piš jako středověký kronikář v češtině. Formální, vznešený styl s historickými obraty.",
      moderni: "Piš jako moderní novinář, krátké odstavce, faktický styl.",
    };

    const notesContext = notes?.length
      ? `\nPoznámky hráčů k události:\n${notes.map((n: any) => `- ${n.author}: "${n.note_text}"`).join("\n")}`
      : "";

    const memoriesContext = cityMemories?.length
      ? `\nPaměti města:\n${cityMemories.map((m: any) => `- ${m}`).join("\n")}`
      : "";

    const factsContext = worldFacts?.length
      ? `\nFakta o světě:\n${worldFacts.map((f: any) => `- ${f}`).join("\n")}`
      : "";

    const eventDesc = `Typ: ${event.event_type}, Hráč: ${event.player}, Kolo: ${event.turn_number}` +
      (event.location ? `, Místo: ${event.location}` : "") +
      (event.note ? `, Poznámka: ${event.note}` : "") +
      (event.result ? `, Výsledek: ${event.result}` : "") +
      (event.casualties ? `, Ztráty: ${event.casualties}` : "") +
      (event.treaty_type ? `, Typ smlouvy: ${event.treaty_type}` : "") +
      (event.terms_summary ? `, Podmínky: ${event.terms_summary}` : "");

    const systemPrompt = `Jsi kronikář starověkého světa. ${epochInstructions[epochStyle] || epochInstructions.kroniky}

PRAVIDLA:
- NESMÍŠ vymýšlet nové události nebo výsledky.
- Narativně zpracuj POUZE data, která dostaneš.
- MUSÍŠ zahrnoout poznámky hráčů — citace, kontext, perspektivu. Hráčské poznámky obohacují příběh.
- Pokud existují městské paměti nebo fakta o světě, zapracuj je přirozeně do narativu.
- Výstup MUSÍ být v češtině.
- Odpověz POUZE voláním funkce generate_narrative.`;

    const userPrompt = `Vygeneruj narativní popis této události:\n\n${eventDesc}${notesContext}${memoriesContext}${factsContext}`;

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
        tools: [
          {
            type: "function",
            function: {
              name: "generate_narrative",
              description: "Return the narrative text and optional key quotes.",
              parameters: {
                type: "object",
                properties: {
                  narrativeText: { type: "string", description: "Czech narrative paragraph" },
                  keyQuotes: {
                    type: "array",
                    items: { type: "string" },
                    description: "Optional funny or memorable quotes from the narrative",
                  },
                },
                required: ["narrativeText"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_narrative" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit, zkuste to znovu za chvíli." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Nedostatek kreditů." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    return new Response(JSON.stringify({
      narrativeText: result.narrativeText || "Kronikář selhal...",
      keyQuotes: result.keyQuotes || [],
      debug: { provider: "lovable-ai" },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("event-narrative error:", e);
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : "Unknown error",
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
