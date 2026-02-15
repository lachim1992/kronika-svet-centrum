import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { gameState } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ crisis: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Jsi AI herní mistr civilizační deskové hry. Analyzuj stav hry a rozhodni, zda nastala vhodná situace pro světovou krizi.

Typy krizí:
- sea_peoples: Mořské národy útočí na pobřeží
- confederation: Konfederace městských států se bouří
- collapse: Kolaps éry bronzu — hladomor a chaos
- plague: Mor decimuje města
- migration: Velké stěhování národů

Pravidla:
- Krize by měla nastávat jen pokud je hra dost rozvinutá (min. 5 kol)
- Max 1 krize na 5 kol
- Krize musí být vysvětlitelná stavem hry
- Pokud situace není vhodná, vrať null

Odpověz přes tool call.`
          },
          { role: "user", content: `Aktuální stav hry:\n${JSON.stringify(gameState, null, 2)}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "evaluate_crisis",
            description: "Evaluate whether a world crisis should trigger",
            parameters: {
              type: "object",
              properties: {
                should_trigger: { type: "boolean", description: "Whether a crisis should happen" },
                crisis_type: { type: "string", description: "Type of crisis" },
                title: { type: "string", description: "Czech title of the crisis" },
                description: { type: "string", description: "Czech description of the crisis" },
                affected_cities: { type: "array", items: { type: "string" }, description: "Names of affected cities" },
              },
              required: ["should_trigger"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "evaluate_crisis" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429 || status === 402) {
        return new Response(JSON.stringify({ error: status === 429 ? "Rate limited" : "Credits exhausted" }), {
          status, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ crisis: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      if (result.should_trigger) {
        return new Response(JSON.stringify({
          crisis: {
            crisis_type: result.crisis_type || "collapse",
            title: result.title || "Neznámá krize",
            description: result.description || "Svět čelí neznámé hrozbě.",
            affected_cities: result.affected_cities || [],
          }
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    return new Response(JSON.stringify({ crisis: null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("world-crisis error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
