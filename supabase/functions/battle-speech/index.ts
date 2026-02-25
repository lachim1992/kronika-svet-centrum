import { corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { speech_text, attacker_name, defender_name, biome, attacker_morale } = await req.json();

    if (!speech_text || speech_text.trim().length < 3) {
      return jsonResponse({ morale_modifier: 0, ai_feedback: "Velitel mlčel." });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return jsonResponse({ morale_modifier: 3, ai_feedback: "Vojáci naslouchali." });
    }

    const systemPrompt = `Jsi hodnotitel vojenských proslovů ve fantasy světě. Hráč "${attacker_name}" útočí na "${defender_name}" v biome "${biome || "pláně"}". Aktuální morálka útočníka je ${attacker_morale ?? 70}/100.

Pravidla:
- morale_modifier: celé číslo od -10 do +10
- ai_feedback: 1-2 věty ve stylu kroniky, jak vojáci zareagovali na proslov
- Hodnoť: relevanci, inspirativnost, konkrétnost, leadership
- Pokud je proslov vulgární nebo nesmyslný, dej záporný modifier a ironický komentář`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: speech_text.slice(0, 1000) },
        ],
        tools: [{
          type: "function",
          function: {
            name: "evaluate_speech",
            description: "Evaluate a military speech and return morale modifier and narrative feedback",
            parameters: {
              type: "object",
              properties: {
                morale_modifier: { type: "integer", description: "Morale effect from -10 to +10" },
                ai_feedback: { type: "string", description: "1-2 sentences narrative reaction in Czech" },
              },
              required: ["morale_modifier", "ai_feedback"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "evaluate_speech" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      await response.text();
      if (status === 429) return jsonResponse({ error: "Rate limit" }, 429);
      if (status === 402) return jsonResponse({ error: "Kredit vyčerpán" }, 402);
      return jsonResponse({ morale_modifier: 2, ai_feedback: "Vojáci přikývli." });
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return jsonResponse({
        morale_modifier: Math.max(-10, Math.min(10, Math.round(parsed.morale_modifier || 0))),
        ai_feedback: parsed.ai_feedback || "Vojáci naslouchali.",
      });
    }

    return jsonResponse({ morale_modifier: 2, ai_feedback: "Vojáci přikývli." });
  } catch (e) {
    console.error("battle-speech error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
