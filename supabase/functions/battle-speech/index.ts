import { corsHeaders, jsonResponse } from "../_shared/ai-context.ts";

const SPEECH_TIMEOUT_MS = 20_000;

// Deterministická heuristika nad AI hodnocením - hráč má vždy nějakou zpětnou vazbu
function heuristicSpeech(
  text: string,
  attackerName: string,
  defenderName: string,
): { delta: number; reasons: string[] } {
  const reasons: string[] = [];
  let delta = 0;
  const len = text.trim().length;
  const lower = text.toLowerCase();

  if (len >= 50 && len <= 300) { delta += 1; reasons.push("+1 délka"); }
  else if (len < 20) { delta -= 1; reasons.push("-1 příliš krátké"); }

  const namesHit =
    (attackerName && lower.includes(attackerName.toLowerCase())) ||
    (defenderName && lower.includes(defenderName.toLowerCase()));
  if (namesHit) { delta += 1; reasons.push("+1 jméno"); }

  const emotionWords = [
    "krev", "sláva", "vlast", "smrt", "čest", "bratři", "bratrstvo",
    "domov", "pomsta", "bohové", "boj", "vítěz", "vítězství", "naděje",
    "zem", "země", "padl", "padli", "rod", "předkové", "ohně", "oheň",
  ];
  const hasEmotion = emotionWords.some(w => lower.includes(w));
  const hasExclaim = text.includes("!");
  if (hasEmotion && hasExclaim) { delta += 1; reasons.push("+1 emoce"); }

  return { delta, reasons };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { speech_text, attacker_name, defender_name, biome, attacker_morale } = await req.json();

    if (!speech_text || speech_text.trim().length < 3) {
      return jsonResponse({ morale_modifier: 0, ai_feedback: "Velitel mlčel." });
    }

    const heur = heuristicSpeech(speech_text, attacker_name || "", defender_name || "");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      const finalMod = Math.max(-10, Math.min(10, 2 + heur.delta));
      return jsonResponse({
        morale_modifier: finalMod,
        ai_feedback: `Vojáci naslouchali. ${heur.reasons.join(", ")}`,
      });
    }

    const systemPrompt = `Hodnoť bitevní proslov. Útočník: "${attacker_name}", obránce: "${defender_name}", biome: "${biome || "pláně"}", morálka: ${attacker_morale ?? 70}/100.
Vrať morale_modifier (-10 až +10) a ai_feedback (1 věta v češtině). Pokud proslov má aspoň nějaký emoční náboj, dej minimálně +1, nedávej 0 zbytečně.`;

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
      const fallback = Math.max(-10, Math.min(10, 1 + heur.delta));
      if ((fetchErr as Error).name === "AbortError") {
        return jsonResponse({ morale_modifier: fallback, ai_feedback: `Vojáci naslouchali (AI nedostupná). ${heur.reasons.join(", ")}` });
      }
      console.error("battle-speech fetch error:", fetchErr);
      return jsonResponse({ morale_modifier: fallback, ai_feedback: `Vojáci přikývli. ${heur.reasons.join(", ")}` });
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      const status = response.status;
      await response.text();
      const fallback = Math.max(-10, Math.min(10, 1 + heur.delta));
      if (status === 429) return jsonResponse({ morale_modifier: 0, ai_feedback: "Příliš mnoho proslovů." });
      if (status === 402) return jsonResponse({ morale_modifier: 0, ai_feedback: "Kredit vyčerpán." });
      return jsonResponse({ morale_modifier: fallback, ai_feedback: `Vojáci přikývli. ${heur.reasons.join(", ")}` });
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        let aiMod = Math.round(parsed.morale_modifier || 0);
        const aiFeedback = parsed.ai_feedback || "Vojáci naslouchali.";

        // Floor: pokud AI dala 0 a text >5 znaků, dej aspoň +1 (vojáci aspoň naslouchali)
        if (aiMod === 0 && speech_text.trim().length > 5) {
          aiMod = 1;
        }

        const combined = Math.max(-10, Math.min(10, aiMod + heur.delta));
        const reasonStr = heur.reasons.length > 0 ? ` (heuristika: ${heur.reasons.join(", ")})` : "";

        return jsonResponse({
          morale_modifier: combined,
          ai_feedback: `${aiFeedback}${reasonStr}`,
        });
      } catch (_) { /* fall through */ }
    }

    const fallback = Math.max(-10, Math.min(10, 2 + heur.delta));
    return jsonResponse({ morale_modifier: fallback, ai_feedback: `Vojáci přikývli. ${heur.reasons.join(", ")}` });
  } catch (e) {
    console.error("battle-speech error:", e);
    return jsonResponse({ morale_modifier: 0, ai_feedback: "Velitel zaváhal." });
  }
});
