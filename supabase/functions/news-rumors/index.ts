import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { round, confirmedEvents, leakableNotes, diplomacyMessages, epochStyle, sessionId } = await req.json();

    if (!sessionId) {
      return jsonResponse({
        rumors: [{ text: `Zvěsti z roku ${round}: Kronikář je nedostupný.`, type: "rumor", sourceEventTypes: [] }]
      });
    }

    const ctx = await createAIContext(sessionId, round);

    const eventsText = (confirmedEvents || []).map((e: any) =>
      `[${e.event_type}] ${e.player}${e.location ? ` @ ${e.location}` : ""}${e.note ? ` — "${e.note}"` : ""}`
    ).join("\n");

    const leakableText = (leakableNotes || []).map((n: any) => `${n.author}: "${n.note_text}"`).join("\n");
    const diplomacyText = (diplomacyMessages || []).map((m: any) =>
      `${m.sender} → ${m.recipient || "?"}: "${m.message_text}" [${m.secrecy}]`
    ).join("\n");

    const systemPrompt = `Jsi síť zvědů, obchodníků a poutníků ve starověkém světě. Generuješ ZVĚSTI A ZPRÁVY na konci každého roku.

PRAVIDLA:
- Vygeneruj 3-5 zvěstí/zpráv odvozených PŘÍMO z dodaných dat.
- Typy: "rumor" (zkreslená informace), "verified" (ověřená zpráva), "propaganda" (úmyslně zabarvená).
- Zvěsti NESMÍ být náhodné — musí vycházet z reálných událostí.
- Výstup v češtině.
- Odpověz POUZE voláním funkce generate_rumors.`;

    const result = await invokeAI(ctx, {
      systemPrompt,
      userPrompt: `ROK ${round}\n\nUDÁLOSTI:\n${eventsText || "žádné"}\n\nÚNIKOVÉ POZNÁMKY:\n${leakableText || "žádné"}\n\nDIPLOMATICKÉ ZPRÁVY:\n${diplomacyText || "žádné"}`,
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
                    text: { type: "string" },
                    type: { type: "string", enum: ["rumor", "verified", "propaganda"] },
                    sourceEventTypes: { type: "array", items: { type: "string" } },
                    cityReference: { type: "string" },
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
      toolChoice: { type: "function", function: { name: "generate_rumors" } },
    });

    if (!result.ok) {
      if (result.status === 429) return jsonResponse({ error: "Rate limit" }, 429);
      if (result.status === 402) return jsonResponse({ rumors: [{ text: `Rok ${round}: Zvědové nemají prostředky.`, type: "rumor", sourceEventTypes: [] }] });
      return jsonResponse({ rumors: [], debug: result.debug });
    }

    return jsonResponse({ ...result.data, debug: result.debug });
  } catch (e) {
    console.error("news-rumors error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
