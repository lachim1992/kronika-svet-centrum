import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, loreType, context, customPrompt } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch world context
    const { data: foundation } = await supabase.from("world_foundations")
      .select("world_name, premise, tone")
      .eq("session_id", sessionId)
      .limit(1)
      .single();

    const { data: memories } = await supabase.from("world_memories")
      .select("fact_text, category")
      .eq("session_id", sessionId)
      .eq("approved", true)
      .limit(15);

    const worldContext = `SVĚT: ${foundation?.world_name || "Neznámý"}
PREMISA: ${foundation?.premise || ""}
TÓN: ${foundation?.tone || "kroniky"}
FAKTA O SVĚTĚ:
${(memories || []).map(m => `- [${m.category}] ${m.fact_text}`).join("\n")}`;

    const LORE_INSTRUCTIONS: Record<string, string> = {
      city_lore: `Vygeneruj bohatý popis a historii města "${context.cityName || ""}".
Biom: ${context.biome || "neznámý"}, Vlastník: ${context.owner || "neznámý"}.
${context.additionalInfo || ""}
Zahrň atmosféru, zvyky, architekturu a krátkou historii. 2-3 odstavce.`,
      artifact: `Vygeneruj legendární artefakt pro svět.
Název: ${context.artifactName || "vygeneruj"}
Místo: ${context.location || "neznámé"}
${context.additionalInfo || ""}
Zahrň původ, sílu, legendu a současný stav. 2-3 odstavce.`,
      region_summary: `Vytvoř geografický a kulturní souhrn regionu "${context.regionName || ""}".
Biom: ${context.biome || "neznámý"}.
${context.additionalInfo || ""}
Zahrň krajinu, obyvatele, obchodní cesty a zajímavosti. 2-3 odstavce.`,
      war_outcome: `Popiš výsledek vojenského konfliktu.
Útočník: ${context.attacker || "neznámý"}, Obránce: ${context.defender || "neznámý"}.
Místo: ${context.location || "neznámé"}.
${context.additionalInfo || ""}
Zahrň průběh bitvy, ztráty, následky pro region. 2-3 odstavce.`,
      faction_lore: `Vytvoř kulturní profil frakce "${context.factionName || ""}".
${context.additionalInfo || ""}
Zahrň tradice, víru, politický systém, zvyky a vztahy s okolím. 2-3 odstavce.`,
      custom: customPrompt || "Vygeneruj narativní text.",
    };

    const instruction = LORE_INSTRUCTIONS[loreType] || LORE_INSTRUCTIONS.custom;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Jsi kronikář a tvůrce lore pro fantasy svět. Piš česky, v narativním stylu odpovídajícím tónu světa. Tvým úkolem je vytvořit krátký, ale barvitý text, který hráč může použít ve svém příběhu.\n\n${worldContext}`,
          },
          { role: "user", content: instruction },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "Kronikář selhal...";

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-lore-generate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
