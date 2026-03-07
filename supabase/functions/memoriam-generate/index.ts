import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { player, sessionId } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Fetch Chronicle 0 for narrative grounding
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let chronicle0Text = "";
    try {
      const { data: c0 } = await sb
        .from("chronicle_entries")
        .select("text")
        .eq("session_id", sessionId)
        .eq("source_type", "chronicle_zero")
        .maybeSingle();
      chronicle0Text = c0?.text || "";
    } catch { /* ignore */ }

    // Fetch world style
    let worldVibe = "";
    try {
      const { data: style } = await sb
        .from("game_style_settings")
        .select("world_vibe, writing_style")
        .eq("session_id", sessionId)
        .maybeSingle();
      if (style) worldVibe = `Atmosféra světa: ${style.world_vibe || ""}. Styl: ${style.writing_style || ""}`;
    } catch { /* ignore */ }

    const systemPrompt = `Jsi kronikář fantasy světa, který sepisuje pamětní nekrology padlých bojovníků sportovní arény Sphaera. Tvé texty mají být emocionální, epické a důstojné — jako pamětní desky v síni hrdinů.

PRAVIDLA:
- Piš výhradně v češtině, formálním ale emotivním kronikářským stylem.
- NEPŘIDÁVEJ žádné nové události ani fakta — pracuj POUZE s dodanými daty.
- Text má mít strukturu: úvodní věta (kdo to byl), kariéra (zápasy, góly), okolnosti smrti (zápas, kolo, protivník, vrah), odkaz a vzpomínka.
- Celkový rozsah: 150–300 slov. Bohatý, narativní text — NE suchý výčet.
- Odpověz POUZE voláním funkce write_memoriam.
${chronicle0Text ? `\nKRONIKA NULTÉHO ROKU (pro narativní zasazení):\n${chronicle0Text.substring(0, 2000)}` : ""}
${worldVibe ? `\n${worldVibe}` : ""}`;

    const p = player;
    const userPrompt = `Napiš pamětní nekrolog padlého hráče Sphaery:

JMÉNO: ${p.name}
POZICE: ${p.position}
TÝM: ${p.team_name} (město ${p.city_name}, frakce ${p.owner_player})
BARVA TÝMU: ${p.color_primary}

KARIÉRA:
- Odehrál ${p.matches_played} zápasů
- Vstřelil ${p.goals_scored} gólů
- Narozen v kole ${p.birth_turn}

SMRT:
- Padl v ${p.death_turn}. kole
${p.match_opponent ? `- V zápase proti ${p.match_opponent} (výsledek ${p.match_score})` : ""}
${p.death_minute ? `- K tragédii došlo v ${p.death_minute}. minutě zápasu` : ""}
${p.killer_name ? `- Smrtelný úder zasadil ${p.killer_name}` : ""}
${p.death_cause ? `- Příčina: ${p.death_cause}` : "- Smrtelné zranění v aréně Sphaery"}

${p.bio ? `EXISTUJÍCÍ BIO: ${p.bio}` : ""}`;

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
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "write_memoriam",
            description: "Write a memorial nekrolog for a fallen Sphaera player.",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string", description: "One-sentence memorial summary in Czech (zlatý text pod jménem)" },
                nekrolog: { type: "string", description: "Full memorial text in Czech, 150-300 words, rich narrative" },
                epitaf: { type: "string", description: "Short epitaf (1-2 sentences) for the memorial plaque in Czech" },
                imagePrompt: { type: "string", description: "English prompt for generating a memorial statue/portrait illustration" },
              },
              required: ["summary", "nekrolog", "epitaf", "imagePrompt"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "write_memoriam" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Nedostatek kreditů" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call");

    const result = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("memoriam-generate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
