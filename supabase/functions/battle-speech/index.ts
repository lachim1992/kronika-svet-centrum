import { corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";

const SPEECH_TIMEOUT_MS = 20_000;

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

    const systemPrompt = `Hodnoť bitevní proslov. Útočník: "${attacker_name}", obránce: "${defender_name}", biome: "${biome || "pláně"}", morálka: ${attacker_morale ?? 70}/100.
Vrať morale_modifier (-10 až +10) a ai_feedback (1 věta v češtině).`;

    // ⏱ Abort controller - timeout fallback
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SPEECH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: speech_text.slice(0, 800) },
          ],
          tools: [{
            type: "function",
            function: {
              name: "evaluate_speech",
              description: "Evaluate a military speech",
              parameters: {
                type: "object",
                properties: {
                  morale_modifier: { type: "integer" },
                  ai_feedback: { type: "string" },
                },
                required: ["morale_modifier", "ai_feedback"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "evaluate_speech" } },
        }),
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if ((fetchErr as Error).name === "AbortError") {
        console.warn("battle-speech: AI timeout, returning neutral");
        return jsonResponse({ morale_modifier: 0, ai_feedback: "Vojáci naslouchali (AI nedostupná)." });
      }
      console.error("battle-speech fetch error:", fetchErr);
      return jsonResponse({ morale_modifier: 0, ai_feedback: "Vojáci přikývli." });
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      const status = response.status;
      await response.text();
      if (status === 429) return jsonResponse({ morale_modifier: 0, ai_feedback: "Příliš mnoho proslovů." });
      if (status === 402) return jsonResponse({ morale_modifier: 0, ai_feedback: "Kredit vyčerpán." });
      return jsonResponse({ morale_modifier: 2, ai_feedback: "Vojáci přikývli." });
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        return jsonResponse({
          morale_modifier: Math.max(-10, Math.min(10, Math.round(parsed.morale_modifier || 0))),
          ai_feedback: parsed.ai_feedback || "Vojáci naslouchali.",
        });
      } catch (_) { /* fall through */ }
    }

    return jsonResponse({ morale_modifier: 2, ai_feedback: "Vojáci přikývli." });
  } catch (e) {
    console.error("battle-speech error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
