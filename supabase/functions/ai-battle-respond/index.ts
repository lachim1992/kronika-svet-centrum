// ai-battle-respond — AI faction autopilot v battle lobby
// Vstup: { lobby_id, side: "attacker" | "defender" }
// Akce: vybere optimální formaci dle terénu/role + krátký proslov + nastaví ready=true.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIMEOUT_MS = 15_000;

// Deterministický fallback pro výběr formace (bez AI)
function chooseFormationDeterministic(side: "attacker" | "defender", isCityBattle: boolean, biome: string): string {
  if (side === "defender") {
    return "DEFENSIVE"; // obránce vždy bránit
  }
  // attacker
  if (isCityBattle) return "SIEGE";
  if (["forest", "mountains", "swamp"].includes(biome)) return "FLANK"; // ignoruje 50% opevnění
  return "ASSAULT";
}

async function generateSpeech(name: string, formation: string, isCityBattle: boolean): Promise<{ text: string; mod: number }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return { text: `${name} svolal vojsko.`, mod: 2 };
  }
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const sysPrompt = `Jsi velitel ${name}. Vygeneruj 1-2 věty bitevního proslovu v češtině. Formace: ${formation}. ${isCityBattle ? "Útočíme na město." : "Polní bitva."} Buď stručný, epický.`;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: "Proslov:" },
        ],
        max_tokens: 80,
      }),
    });
    clearTimeout(tid);
    if (!res.ok) return { text: `${name} pozvedl meč. „Za vlast!"`, mod: 3 };
    const data = await res.json();
    const text = (data.choices?.[0]?.message?.content || "").trim() || `Vojáci, dnes vyhrajeme!`;
    return { text: text.slice(0, 280), mod: 4 + Math.floor(Math.random() * 3) }; // +4 až +6
  } catch (_) {
    clearTimeout(tid);
    return { text: `${name}: "Za naši zem!"`, mod: 3 };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { lobby_id, side } = await req.json();
    if (!lobby_id || !side) {
      return new Response(JSON.stringify({ error: "Missing lobby_id or side" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: lobby } = await supabase.from("battle_lobbies").select("*").eq("id", lobby_id).maybeSingle();
    if (!lobby) {
      return new Response(JSON.stringify({ error: "Lobby not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (lobby.status !== "preparing") {
      return new Response(JSON.stringify({ ok: true, skipped: "already_resolved" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const playerName = side === "attacker" ? lobby.attacker_player : lobby.defender_player;
    const alreadyReady = side === "attacker" ? lobby.attacker_ready : lobby.defender_ready;
    if (alreadyReady) {
      return new Response(JSON.stringify({ ok: true, skipped: "already_ready" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Determine biome from defender city or attacker stack hex
    let biome = "plains";
    let isCityBattle = !!lobby.defender_city_id;
    if (lobby.defender_city_id) {
      const { data: city } = await supabase.from("cities").select("province_q, province_r").eq("id", lobby.defender_city_id).maybeSingle();
      if (city) {
        const { data: hex } = await supabase.from("province_hexes").select("biome_family").eq("session_id", lobby.session_id).eq("q", city.province_q).eq("r", city.province_r).maybeSingle();
        if (hex?.biome_family) biome = hex.biome_family;
      }
    }

    const formation = chooseFormationDeterministic(side, isCityBattle, biome);
    const stackId = side === "attacker" ? lobby.attacker_stack_id : lobby.defender_stack_id;
    let stackName = playerName;
    if (stackId) {
      const { data: s } = await supabase.from("military_stacks").select("name").eq("id", stackId).maybeSingle();
      if (s?.name) stackName = s.name;
    }

    const speech = await generateSpeech(stackName, formation, isCityBattle);

    const fields: Record<string, any> = side === "attacker" ? {
      attacker_formation: formation,
      attacker_speech: speech.text,
      attacker_speech_modifier: speech.mod,
      attacker_speech_feedback: "AI velitel zvolil formaci a proslov.",
      attacker_ready: true,
      is_ai_attacker: true,
      ai_responded_at: new Date().toISOString(),
    } : {
      defender_formation: formation,
      defender_speech: speech.text,
      defender_speech_modifier: speech.mod,
      defender_speech_feedback: "AI velitel zvolil formaci a proslov.",
      defender_ready: true,
      is_ai_defender: true,
      ai_responded_at: new Date().toISOString(),
    };

    await supabase.from("battle_lobbies").update(fields).eq("id", lobby_id);

    // If both sides ready, fire resolve immediately (don't wait for player to refresh)
    const { data: refreshed } = await supabase.from("battle_lobbies").select("*").eq("id", lobby_id).maybeSingle();
    if (refreshed && refreshed.attacker_ready && refreshed.defender_ready && refreshed.status === "preparing") {
      try {
        await supabase.functions.invoke("resolve-battle", {
          body: {
            session_id: refreshed.session_id,
            player_name: refreshed.attacker_player,
            current_turn: refreshed.turn_number,
            attacker_stack_id: refreshed.attacker_stack_id,
            defender_city_id: refreshed.defender_city_id || null,
            defender_stack_id: refreshed.defender_stack_id || null,
            speech_text: refreshed.attacker_speech || null,
            speech_morale_modifier: refreshed.attacker_speech_modifier || 0,
            defender_speech_text: refreshed.defender_speech || null,
            defender_speech_morale_modifier: refreshed.defender_speech_modifier || 0,
            attacker_formation: refreshed.attacker_formation || "ASSAULT",
            defender_formation: refreshed.defender_formation || "DEFENSIVE",
            seed: Date.now(),
            lobby_id: refreshed.id,
          },
        });
      } catch (rErr) {
        console.error("ai-battle-respond auto-resolve error:", rErr);
      }
    }

    return new Response(JSON.stringify({ ok: true, formation, speech: speech.text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("ai-battle-respond error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
