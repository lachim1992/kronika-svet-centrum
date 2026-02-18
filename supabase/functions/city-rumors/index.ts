import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { cityName, ownerPlayer, currentTurn, confirmedEvents, leakableNotes, memories, epochStyle } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({
        rumors: [{ text: `V ${cityName} je ticho... Zvědové nejsou k dispozici.`, type: "rumor", sourceEventTypes: [], references: [] }]
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const eventsText = (confirmedEvents || []).map((e: any) =>
      `[${e.event_type}] ${e.player}${e.location ? ` @ ${e.location}` : ""}${e.note ? ` — "${e.note}"` : ""}${e.result ? ` (výsledek: ${e.result})` : ""}${e.casualties ? ` (ztráty: ${e.casualties})` : ""}`
    ).join("\n");

    const leakableText = (leakableNotes || []).map((n: any) =>
      `${n.author}: "${n.note_text}"`
    ).join("\n");

    const memoriesText = (memories || []).join("\n");

    const systemPrompt = `Jsi síť šeptandů, obchodníků a obyvatel města ${cityName} (vládce: ${ownerPlayer}).
Generuješ LOKÁLNÍ ZVĚSTI A DRBY z perspektivy běžných obyvatel tohoto města.

PRAVIDLA:
- Vygeneruj 3-5 zvěstí z pohledu lidí žijících v ${cityName}.
- Zvěsti MUSÍ vycházet z dodaných událostí, poznámek a tradic.
- Piš z lokální perspektivy: jak se události dotýkají tohoto města a jeho lidí.
- Zahrnuj reakce na: bitvy poblíž, obchodní změny, náladu lidu, místní tradice.
- Typy: "gossip" (zkreslený drb), "news" (ověřená zpráva), "propaganda" (úmyslně zabarvená).
- U gossip můžeš lehce zkreslit fakta, ale základ musí být pravdivý.
- Styl: ${epochStyle || "kroniky"} — přizpůsob jazyk době.
- Zmiňuj konkrétní jména měst, vládců a událostí kde je to možné.
- Každá zvěst by měla mít 1-3 věty.
- Výstup v češtině.
- Odpověz POUZE voláním funkce generate_city_rumors.`;

    const userPrompt = `MĚSTO: ${cityName} (vládce: ${ownerPlayer})
ROK: ${currentTurn}

UDÁLOSTI SPOJENÉ S MĚSTEM:
${eventsText || "žádné"}

ÚNIKOVÉ POZNÁMKY:
${leakableText || "žádné"}

MÍSTNÍ TRADICE A PAMĚŤ:
${memoriesText || "žádné"}`;

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
            name: "generate_city_rumors",
            description: "Generate local rumors and gossip for a specific city.",
            parameters: {
              type: "object",
              properties: {
                rumors: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      text: { type: "string", description: "Rumor text in Czech" },
                      type: { type: "string", enum: ["gossip", "news", "propaganda"] },
                      sourceEventTypes: { type: "array", items: { type: "string" } },
                      references: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            type: { type: "string", enum: ["city", "player", "event"] },
                            name: { type: "string" },
                          },
                          required: ["type", "name"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["text", "type", "sourceEventTypes"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["rumors"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_city_rumors" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ rumors: [{ text: `Zvědové z ${cityName} nemají prostředky.`, type: "gossip", sourceEventTypes: [], references: [] }] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI gateway error: " + response.status);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call");

    const result = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("city-rumors error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
