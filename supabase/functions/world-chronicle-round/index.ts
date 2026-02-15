import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { round, confirmedEvents, annotations, worldMemories, epochStyle } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({
        chronicleText: `📜 Rok ${round} — Kronikář odpočívá... (API klíč chybí)`,
        newSuggestedMemories: [],
        linkedCities: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const epochInstructions: Record<string, string> = {
      myty: "Piš jako starověký mytograf. Epický jazyk plný metafor, bohů a legend.",
      kroniky: "Piš jako středověký kronikář. Formální, vznešený, archaický jazyk.",
      moderni: "Piš jako moderní novinář. Stručný, faktický zpravodajský styl.",
    };

    const eventsText = (confirmedEvents || []).map((e: any) =>
      `[${e.event_type}] ${e.player}${e.location ? ` @ ${e.location}` : ""}${e.note ? ` — "${e.note}"` : ""}${e.result ? ` → ${e.result}` : ""}${e.casualties ? ` (ztráty: ${e.casualties})` : ""}`
    ).join("\n");

    const annotationsText = (annotations || []).map((a: any) =>
      `${a.author} o [${a.event_type || "události"}]: "${a.note_text}" (${a.visibility})`
    ).join("\n");

    const memoriesText = (worldMemories || []).map((m: any) =>
      typeof m === "string" ? m : `[${m.category || ""}] ${m.text}`
    ).join("\n");

    const systemPrompt = `Jsi kronikář civilizační deskové hry. ${epochInstructions[epochStyle] || epochInstructions.kroniky}

ÚKOL: Vygeneruj zápis kroniky pro rok ${round}. Tento zápis se stane trvalou součástí dějin světa.

PRAVIDLA:
- Zahrň VŠECHNY potvrzené události roku — žádná nesmí zůstat nezaznamenaná.
- Zapracuj poznámky hráčů jako citace, kontext nebo perspektivu do příběhu.
- Zohledni existující paměti světa pro kontinuitu.
- NESMÍŠ vymýšlet nové události — pouze narativně zpracuj dodaná data.
- Navrhni 0-3 nové paměti světa vyplývající z událostí roku.
- Uveď seznam měst, která se v kronice objevují.
- Výstup MUSÍ být v češtině.
- Odpověz POUZE voláním funkce write_round_chronicle.`;

    const userPrompt = `ROK ${round}

POTVRZENÉ UDÁLOSTI:
${eventsText || "žádné události"}

POZNÁMKY HRÁČŮ:
${annotationsText || "žádné poznámky"}

PAMĚTI SVĚTA:
${memoriesText || "žádné paměti"}`;

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
            name: "write_round_chronicle",
            description: "Write chronicle entry for a specific round.",
            parameters: {
              type: "object",
              properties: {
                chronicleText: { type: "string", description: "Full chronicle text for this round in Czech" },
                newSuggestedMemories: {
                  type: "array",
                  items: { type: "string" },
                  description: "Suggested new world memory facts in Czech",
                },
                linkedCities: {
                  type: "array",
                  items: { type: "string" },
                  description: "Names of cities mentioned in the chronicle",
                },
              },
              required: ["chronicleText", "newSuggestedMemories", "linkedCities"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "write_round_chronicle" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Nedostatek kreditů" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
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
    console.error("world-chronicle-round error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
