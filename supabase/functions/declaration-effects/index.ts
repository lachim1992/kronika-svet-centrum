import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { declarationText, declarationType, tone, playerName, cities, recentEvents, worldFacts } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      // Placeholder suggestions when no API key
      return new Response(JSON.stringify({
        effects: [
          {
            entity_type: "EMPIRE",
            entity_id: null,
            trait_key: "declaration_effect",
            trait_label: "Vyhlašovatel",
            description: `${playerName} vydal oficiální vyhlášení.`,
            intensity: 1,
            explanation: "Automaticky navržený rys."
          }
        ]
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const systemPrompt = `Jsi analytik civilizační deskové hry. Na základě textu vyhlášení navrhni 2-5 rysů (traits), které by toto vyhlášení mělo přidat nebo posílit entitám (říši, městům, vůdcům, armádám).

PRAVIDLA:
- Piš česky.
- Rysy ovlivňují narativ, pověst, diplomacii – NE herní mechaniky.
- Každý rys musí mít trait_key (snake_case anglicky), trait_label (česky), description (1-2 věty česky), intensity (1-5), explanation (proč tento rys).
- entity_type: EMPIRE, CITY, LEADER, ARMY, PROVINCE
- entity_id ponech null (uživatel vybere cíl).
- Buď kreativní ale realistický. Válečné vyhlášení = vojenské rysy, mírová smlouva = diplomatické rysy atd.`;

    const userContent = `Typ vyhlášení: ${declarationType}
Tón: ${tone}
Autor: ${playerName}

Text vyhlášení:
${declarationText}

Města autora: ${JSON.stringify(cities?.slice(0, 10) || [])}
Nedávné události: ${JSON.stringify(recentEvents?.slice(0, 10) || [])}
Fakta o světě: ${JSON.stringify(worldFacts?.slice(0, 10) || [])}`;

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
          { role: "user", content: userContent },
        ],
        tools: [{
          type: "function",
          function: {
            name: "suggest_declaration_effects",
            description: "Suggest trait effects from a declaration",
            parameters: {
              type: "object",
              properties: {
                effects: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      entity_type: { type: "string", enum: ["EMPIRE", "CITY", "LEADER", "ARMY", "PROVINCE"] },
                      entity_id: { type: "string", description: "null - user picks target" },
                      trait_key: { type: "string", description: "snake_case English key" },
                      trait_label: { type: "string", description: "Czech label for the trait" },
                      description: { type: "string", description: "1-2 sentence Czech description" },
                      intensity: { type: "number", description: "1-5 scale" },
                      explanation: { type: "string", description: "Why this trait, in Czech" },
                    },
                    required: ["entity_type", "trait_key", "trait_label", "description", "intensity", "explanation"],
                    additionalProperties: false
                  }
                }
              },
              required: ["effects"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "suggest_declaration_effects" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit, zkuste později." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Kredit vyčerpán." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      return new Response(JSON.stringify({ effects: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ effects: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("declaration-effects error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
