import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { speech_text, attacker_name, defender_name, biome, attacker_morale } = await req.json();

    if (!speech_text || speech_text.trim().length < 3) {
      // No speech → no modifier
      return new Response(
        JSON.stringify({ morale_modifier: 0, ai_feedback: "Velitel mlčel." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      // Fallback: deterministic small bonus for any speech
      return new Response(
        JSON.stringify({ morale_modifier: 3, ai_feedback: "Vojáci naslouchali." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const systemPrompt = `Jsi hodnotitel vojenských proslovů ve fantasy světě. Hráč "${attacker_name}" útočí na "${defender_name}" v biome "${biome || "pláně"}". Aktuální morálka útočníka je ${attacker_morale ?? 70}/100.

Tvým úkolem je zhodnotit kvalitu proslovu a vrátit strukturovaný výsledek.

Pravidla:
- morale_modifier: celé číslo od -10 do +10
  - Skvělý, inspirativní proslov: +5 až +10
  - Průměrný, generický proslov: -2 až +3
  - Zbabělý, demotivující, nesmyslný: -10 až -3
- ai_feedback: 1-2 věty ve stylu kroniky, jak vojáci zareagovali na proslov
- Hodnoť: relevanci k situaci, inspirativnost, konkrétnost, leadership

Odpověz POUZE validním JSON bez markdown:
{"morale_modifier": <number>, "ai_feedback": "<string>"}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: speech_text.slice(0, 1000) },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "evaluate_speech",
              description: "Evaluate a military speech and return morale modifier",
              parameters: {
                type: "object",
                properties: {
                  morale_modifier: {
                    type: "integer",
                    description: "Morale modifier from -10 to +10",
                  },
                  ai_feedback: {
                    type: "string",
                    description: "1-2 sentence chronicle-style reaction of soldiers",
                  },
                },
                required: ["morale_modifier", "ai_feedback"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "evaluate_speech" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      // Fallback
      return new Response(
        JSON.stringify({ morale_modifier: 2, ai_feedback: "Vojáci přikývli." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiResult = await response.json();
    
    // Extract from tool call
    let morale_modifier = 0;
    let ai_feedback = "Vojáci naslouchali.";

    try {
      const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        morale_modifier = Math.max(-10, Math.min(10, Math.round(parsed.morale_modifier || 0)));
        ai_feedback = parsed.ai_feedback || ai_feedback;
      }
    } catch (parseErr) {
      console.error("Failed to parse AI tool call:", parseErr);
      // Try content fallback
      try {
        const content = aiResult.choices?.[0]?.message?.content || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          morale_modifier = Math.max(-10, Math.min(10, Math.round(parsed.morale_modifier || 0)));
          ai_feedback = parsed.ai_feedback || ai_feedback;
        }
      } catch (_) {
        // Use defaults
      }
    }

    return new Response(
      JSON.stringify({ morale_modifier, ai_feedback }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("battle-speech error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
