import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { events, existingTraits, players, cities } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ traits: [], debug: { provider: "placeholder" } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const existingTraitsSummary = (existingTraits || [])
      .map((t: any) => `${t.entity_name} (${t.entity_type}): ${t.trait_text}`)
      .join("\n");

    const systemPrompt = `Jsi historik a kronikář civilizační hry. Analyzuj herní události a extrahuj z nich vlastnosti, přídomky, pověsti a vztahy pro entity (města, vládce, osoby, armády, provincie).

Pravidla:
- Vycházej POUZE z potvrzených událostí — nic nevymýšlej.
- Vlastnost musí být odvozena z konkrétní události nebo vzorce událostí.
- Přídomky jsou krátké (2-5 slov): "Krutý", "Ochránce chudých", "Neporazitelný".
- Pověsti jsou delší popisy: "Město proslulé svými hradbami a věrností kočkám".
- Vztahy popisují vazby mezi entitami: "Spojenec Petra od roku 3".
- Historické fakty: "Přežilo dvě obléhání", "Založeno v roce 1".
- NEopakuj existující vlastnosti.

Hráči: ${(players || []).join(", ")}
Města: ${(cities || []).map((c: any) => `${c.name} (${c.owner}, ${c.level})`).join(", ")}

Existující vlastnosti (neopakuj):
${existingTraitsSummary || "žádné"}`;

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
          {
            role: "user",
            content: `Analyzuj tyto události a navrhni nové vlastnosti entit:\n${JSON.stringify(events, null, 2)}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_traits",
              description: "Extract entity traits from game events",
              parameters: {
                type: "object",
                properties: {
                  traits: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        entity_type: {
                          type: "string",
                          enum: ["city", "ruler", "person", "army", "province", "civilization", "empire", "country"],
                        },
                        entity_name: { type: "string" },
                        trait_category: {
                          type: "string",
                          enum: ["epithet", "title", "reputation", "characteristic", "relation", "history"],
                        },
                        trait_text: { type: "string" },
                      },
                      required: ["entity_type", "entity_name", "trait_category", "trait_text"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["traits"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_traits" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      return new Response(
        JSON.stringify({ traits: result.traits || [], debug: { provider: "lovable-ai" } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ traits: [], debug: { provider: "lovable-ai", fallback: true } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("extract-traits error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
