import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildBasketSnapshot } from "../_shared/basket-context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, playerName } = await req.json();
    if (!sessionId || !playerName) {
      return new Response(JSON.stringify({ error: "Missing sessionId or playerName" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch player's city node IDs
    const { data: cities } = await supabase
      .from("cities")
      .select("id, name, population_total, settlement_level, city_stability")
      .eq("session_id", sessionId)
      .eq("owner_player", playerName);

    const cityIds = (cities || []).map((c: any) => c.id);

    const { data: nodes } = await supabase
      .from("province_nodes")
      .select("id, city_id, name, capability_tags, production_role")
      .eq("session_id", sessionId)
      .not("city_id", "is", null);

    const myNodeIds = (nodes || [])
      .filter((n: any) => cityIds.includes(n.city_id))
      .map((n: any) => n.id);

    // Fetch demand baskets for my nodes
    const { data: baskets } = await supabase
      .from("demand_baskets")
      .select("basket_key, fulfillment_type, quantity_needed, quantity_fulfilled, satisfaction_score, city_id, tier")
      .eq("session_id", sessionId)
      .in("city_id", myNodeIds.length > 0 ? myNodeIds : ["__none__"])
      .limit(300);

    // Fetch production recipes
    const { data: recipes } = await supabase
      .from("production_recipes")
      .select("recipe_key, inputs, outputs, required_tags, production_role")
      .limit(100);

    // Fetch all player nodes with capabilities
    const { data: allNodes } = await supabase
      .from("province_nodes")
      .select("id, name, node_type, capability_tags, production_role, city_id")
      .eq("session_id", sessionId)
      .eq("controlled_by", playerName);

    // Fetch market summary
    const { data: market } = await supabase
      .from("city_market_summary")
      .select("good_key, supply_volume, demand_volume, city_node_id")
      .eq("session_id", sessionId)
      .in("city_node_id", myNodeIds.length > 0 ? myNodeIds : ["__none__"])
      .limit(300);

    // Build context for AI
    const gapGoods = (baskets || [])
      .filter((b: any) => b.quantity_fulfilled < b.quantity_needed)
      .sort((a: any, b: any) => (b.quantity_needed - b.quantity_fulfilled) - (a.quantity_needed - a.quantity_fulfilled))
      .slice(0, 20);

    const nodeCapabilities = (allNodes || []).map((n: any) => ({
      name: n.name,
      tags: n.capability_tags || [],
      role: n.production_role,
      cityId: n.city_id,
    }));

    const cityNames = new Map((cities || []).map((c: any) => [c.id, c.name]));
    const nodeToCity = new Map((nodes || []).map((n: any) => [n.id, n.city_id]));

    const prompt = `Jsi ekonomický poradce středověké říše. Analyzuj poptávku a produkci a dej 3-5 konkrétních doporučení.

MĚSTA HRÁČE:
${(cities || []).map((c: any) => `- ${c.name} (pop: ${c.population_total}, level: ${c.settlement_level}, stabilita: ${c.city_stability}%)`).join("\n")}

CHYBĚJÍCÍ ZBOŽÍ (seřazeno dle urgence):
${gapGoods.map((g: any) => {
  const cityName = cityNames.get(nodeToCity.get(g.city_id) || "") || g.city_id;
  return `- ${g.basket_key} [${g.fulfillment_type}]: potřeba ${g.quantity_needed}, splněno ${g.quantity_fulfilled} (${(g.satisfaction_score * 100).toFixed(0)}%) — město: ${cityName}`;
}).join("\n") || "Žádné mezery"}

DOSTUPNÉ PRODUKČNÍ CAPABILITY:
${nodeCapabilities.map((n: any) => `- ${n.name}: [${n.tags.join(", ")}] role=${n.role}`).join("\n")}

DOSTUPNÉ RECEPTY:
${(recipes || []).slice(0, 30).map((r: any) => `- ${r.recipe_key}: ${JSON.stringify(r.inputs)} → ${JSON.stringify(r.outputs)} (tags: ${JSON.stringify(r.required_tags)})`).join("\n")}

TRŽNÍ DATA:
${(market || []).slice(0, 20).map((m: any) => `- ${m.good_key}: supply=${m.supply_volume.toFixed(1)}, demand=${m.demand_volume.toFixed(1)}`).join("\n")}

Odpověz česky. Pro každé doporučení uveď:
1. Co konkrétně udělat (stavba, recept, obchod)
2. Kde (které město)
3. Jaký to bude mít dopad (% pokrytí poptávky, stabilita)
4. Priorita: KRITICKÉ / DŮLEŽITÉ / VYLEPŠENÍ`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Jsi ekonomický poradce středověké civilizace. Odpovídej stručně, konkrétně a česky." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "economy_recommendations",
            description: "Return economic recommendations for the player's realm",
            parameters: {
              type: "object",
              properties: {
                recommendations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "Short title of the recommendation" },
                      description: { type: "string", description: "Detailed description of what to do" },
                      priority: { type: "string", enum: ["critical", "important", "improvement"] },
                      impact: { type: "string", description: "Expected impact on the economy" },
                      targetCity: { type: "string", description: "Which city this applies to, if specific" },
                      actionType: { type: "string", enum: ["build", "trade", "recipe", "policy", "military"], description: "Type of action" },
                    },
                    required: ["title", "description", "priority", "impact", "actionType"],
                  },
                },
                summary: { type: "string", description: "Brief overall economic assessment" },
              },
              required: ["recommendations", "summary"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "economy_recommendations" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let result = { recommendations: [], summary: "Nepodařilo se získat doporučení." };

    if (toolCall?.function?.arguments) {
      try {
        result = JSON.parse(toolCall.function.arguments);
      } catch {
        result.summary = toolCall.function.arguments;
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("economy-advisor error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
