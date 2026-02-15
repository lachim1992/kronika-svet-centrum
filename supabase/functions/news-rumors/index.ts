import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { round, confirmedEvents, leakableNotes, diplomacyMessages, epochStyle } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({
        rumors: [
          { text: `Zvěsti z roku ${round}: Kronikář je nedostupný.`, type: "rumor", sourceEventTypes: [] }
        ]
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const eventsText = (confirmedEvents || []).map((e: any) =>
      `[${e.event_type}] ${e.player}${e.location ? ` @ ${e.location}` : ""}${e.note ? ` — "${e.note}"` : ""}`
    ).join("\n");

    const leakableText = (leakableNotes || []).map((n: any) =>
      `${n.author}: "${n.note_text}"`
    ).join("\n");

    const diplomacyText = (diplomacyMessages || []).map((m: any) =>
      `${m.sender} → ${m.recipient || "?"}: "${m.message_text}" [${m.secrecy}]`
    ).join("\n");

    const systemPrompt = `Jsi síť zvědů, obchodníků a poutníků ve starověkém světě. Generuješ ZVĚSTI A ZPRÁVY na konci každého roku.

PRAVIDLA:
- Vygeneruj 3-5 zvěstí/zpráv odvozených PŘÍMO z dodaných dat.
- Typy: "rumor" (zkreslená informace), "verified" (ověřená zpráva), "propaganda" (úmyslně zabarvená).
- Zvěsti NESMÍ být náhodné — musí vycházet z reálných událostí, únikových poznámek nebo diplomacie.
- U rumoru můžeš lehce zkreslit fakta (špatné číslo, přehnaný popis) ale základ musí být pravdivý.
- Výstup v češtině.
- Odpověz POUZE voláním funkce generate_rumors.`;

    const userPrompt = `ROK ${round}

UDÁLOSTI:
${eventsText || "žádné"}

ÚNIKOVÉ POZNÁMKY (leakable):
${leakableText || "žádné"}

DIPLOMATICKÉ ZPRÁVY:
${diplomacyText || "žádné"}`;

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
            name: "generate_rumors",
            description: "Generate news and rumors for the round.",
            parameters: {
              type: "object",
              properties: {
                rumors: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      text: { type: "string", description: "Rumor text in Czech" },
                      type: { type: "string", enum: ["rumor", "verified", "propaganda"] },
                      sourceEventTypes: {
                        type: "array",
                        items: { type: "string" },
                        description: "Event types that inspired this rumor",
                      },
                      cityReference: { type: "string", description: "City name if applicable" },
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
        tool_choice: { type: "function", function: { name: "generate_rumors" } },
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
    console.error("news-rumors error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
