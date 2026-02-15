import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { cityStates, recentEvents } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({
        actions: cityStates.map((cs: any) => ({
          cityStateName: cs.name,
          action: "Městský stát vyčkává... (AI nedostupná)",
          type: "wait"
        }))
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const systemPrompt = `Jsi AI řídící NPC městské státy v civilizační deskové hře. Pro každý městský stát vygeneruj 1-2 akce na základě jeho typu, nálady a vlivu hráčů.

Typy akcí: nabídka obchodu, požadavek tributu, vyhlášení embarga, poskytnutí pomoci, najatí nájezdníků, vyčkávání.

Odpověz česky. Buď kreativní a vtipný.`;

    const userContent = `Městské státy:\n${JSON.stringify(cityStates, null, 2)}\n\nNedávné události:\n${JSON.stringify(recentEvents, null, 2)}`;

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
            name: "city_state_actions",
            description: "Generate NPC city-state actions",
            parameters: {
              type: "object",
              properties: {
                actions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      cityStateName: { type: "string" },
                      action: { type: "string", description: "Description of the action in Czech" },
                      type: { type: "string", enum: ["trade", "tribute", "embargo", "aid", "raiders", "wait"] },
                      targetPlayer: { type: "string", description: "Target player name or empty" }
                    },
                    required: ["cityStateName", "action", "type"],
                    additionalProperties: false
                  }
                }
              },
              required: ["actions"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "city_state_actions" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Příliš mnoho požadavků." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      return new Response(JSON.stringify({ actions: [] }), {
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

    return new Response(JSON.stringify({ actions: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("citystates error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
