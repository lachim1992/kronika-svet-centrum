// quick-random-game
// One-click random world creation.
//
// Flow:
//   1) Lovable AI generates: world (name, premise, tone, victoryStyle),
//      player identity (realm, settlement, ruler, secret objective),
//      and 1–2 AI factions.
//   2) Map/terrain settings are COPIED from the user's most recent ready
//      world (worldgen_spec). If none exist → response signals
//      `needsWizard: true` so the client opens WorldSetupWizard.
//   3) translate-premise-to-spec → resolved WorldgenSpecV1.
//   4) Insert game_sessions / game_players / game_memberships.
//   5) create-world-bootstrap with composed payload.
//
// Returns: { ok, sessionId } | { ok:false, needsWizard:true } | { ok:false, error }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PERSONALITIES = ["aggressive", "diplomatic", "mercantile", "isolationist", "expansionist"];
const ARCHETYPES = ["conqueror", "merchant_prince", "prophet", "scholar", "diplomat", "explorer"];

async function callAI(apiKey: string, prompt: string): Promise<any> {
  const tool = {
    type: "function",
    function: {
      name: "create_random_world",
      description: "Generate a complete random world setup",
      parameters: {
        type: "object",
        properties: {
          world_name: { type: "string", description: "1–4 slova, evokativní" },
          premise: { type: "string", description: "120–250 slov; tematicky bohatá premisa světa v češtině" },
          tone: { type: "string", enum: ["mythic", "realistic", "dark_fantasy", "heroic", "grim"] },
          victory_style: { type: "string", enum: ["story", "domination", "survival", "sandbox"] },
          realm_name: { type: "string" },
          settlement_name: { type: "string", description: "Hlavní město hráče" },
          people_name: { type: "string" },
          culture_name: { type: "string" },
          ruler_name: { type: "string" },
          ruler_title: { type: "string", description: "Např. Král, Velkokněz, Chán" },
          ruler_archetype: { type: "string" },
          ruler_bio: { type: "string", description: "30–60 slov" },
          government_form: { type: "string" },
          dominant_faith: { type: "string" },
          secret_objective: {
            type: "string",
            enum: ARCHETYPES,
          },
          ai_factions: {
            type: "array",
            minItems: 1,
            maxItems: 2,
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                personality: { type: "string", enum: PERSONALITIES },
                description: { type: "string", description: "40–80 slov o této frakci" },
              },
              required: ["name", "personality", "description"],
              additionalProperties: false,
            },
          },
        },
        required: [
          "world_name", "premise", "tone", "victory_style",
          "realm_name", "settlement_name", "ruler_name", "ruler_title",
          "secret_objective", "ai_factions",
        ],
        additionalProperties: false,
      },
    },
  };

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "Jsi kreativní worldbuilder pro tahovou strategii. Generuj originální, tematicky soudržné a hratelné světy. Premisu i texty piš česky." },
        { role: "user", content: prompt },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "create_random_world" } },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI ${res.status}: ${t.substring(0, 200)}`);
  }
  const j = await res.json();
  const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI nevrátila tool_call");
  return JSON.parse(args);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("LOVABLE_API_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    const { playerName, userId } = await req.json();
    if (!playerName?.trim() || !userId) {
      return new Response(JSON.stringify({ ok: false, error: "playerName a userId jsou povinné" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Find last ready world spec from this user (for map/terrain copy)
    const { data: lastWorld } = await sb
      .from("world_foundations")
      .select("worldgen_spec, pre_world_premise, tone, victory_style, created_at, bootstrap_status")
      .eq("created_by", userId)
      .eq("bootstrap_status", "ready")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastWorld?.worldgen_spec) {
      // No history → instruct client to open wizard
      return new Response(JSON.stringify({ ok: false, needsWizard: true, reason: "no_prior_world" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lastSpec = lastWorld.worldgen_spec as any;

    // 2) AI generates everything text-based
    const aiOut = await callAI(apiKey,
      `Vygeneruj kompletně náhodný, originální svět pro tahovou hru. Hráč se jmenuje "${playerName}". ` +
      `Vyber 1 nebo 2 AI rivalské frakce. Drž se interní konzistence (tone ↔ premisa ↔ frakce ↔ vládce).`,
    );

    // 3) Build translate-premise-to-spec userOverrides from last spec (size + terrain)
    const userOverrides: any = {
      userIntent: {
        size: lastSpec?.userIntent?.size ?? "medium",
        tone: aiOut.tone,
        victoryStyle: aiOut.victory_style,
        worldName: aiOut.world_name,
      },
      terrain: lastSpec?.terrain ?? undefined,
    };
    const lockedPaths = ["userIntent.size"];

    const { data: translated, error: translateErr } = await sb.functions.invoke(
      "translate-premise-to-spec",
      { body: { premise: aiOut.premise, userOverrides, lockedPaths, regenerationNonce: 0 } },
    );
    if (translateErr) throw new Error(`translate-premise: ${translateErr.message}`);
    if (!translated?.ok || !translated?.spec) throw new Error(translated?.error || "translate-premise selhal");
    const spec = translated.spec;

    // 4) Create session + player + membership
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data: session, error: sessErr } = await sb
      .from("game_sessions")
      .insert({
        room_code: roomCode,
        player1_name: playerName.trim(),
        max_players: 1,
        created_by: userId,
        game_mode: "tb_single_ai",
        tier: "premium",
        init_status: "initializing",
      } as any)
      .select()
      .single();
    if (sessErr || !session) throw new Error(sessErr?.message || "Vytvoření session selhalo");

    await sb.from("game_players").insert({
      session_id: session.id,
      player_name: playerName.trim(),
      player_number: 1,
      user_id: userId,
    } as any);
    await sb.from("game_memberships").insert({
      user_id: userId,
      session_id: session.id,
      player_name: playerName.trim(),
      role: "admin",
      setup_status: "ready",
    } as any);

    // 5) Compose bootstrap payload
    const factions = (aiOut.ai_factions ?? []).slice(0, 2).map((f: any, i: number) => ({
      name: f.name || `AI Frakce ${i + 1}`,
      personality: f.personality || PERSONALITIES[i % PERSONALITIES.length],
      description: f.description,
    }));

    // Honor declared faction count via spec.factionCount as well
    spec.factionCount = factions.length;

    const identity = {
      realmName: aiOut.realm_name,
      settlementName: aiOut.settlement_name,
      peopleName: aiOut.people_name,
      cultureName: aiOut.culture_name,
      rulerName: aiOut.ruler_name,
      rulerTitle: aiOut.ruler_title,
      rulerArchetype: aiOut.ruler_archetype,
      rulerBio: aiOut.ruler_bio,
      governmentForm: aiOut.government_form,
      dominantFaith: aiOut.dominant_faith,
      secretObjectiveArchetype: aiOut.secret_objective,
    };

    const bootstrapBody = {
      sessionId: session.id,
      playerName: playerName.trim(),
      mode: "tb_single_ai" as const,
      world: {
        name: spec.userIntent.worldName,
        premise: spec.userIntent.premise,
        presentPremise: spec.userIntent.premise,
        tone: spec.userIntent.tone,
        victoryStyle: spec.userIntent.victoryStyle,
        size: spec.userIntent.size,
        seed: spec.seed,
      },
      map: {
        terrain: {
          targetLandRatio: spec.terrain.targetLandRatio,
          continentShape: spec.terrain.continentShape,
          continentCount: spec.terrain.continentCount,
          mountainDensity: spec.terrain.mountainDensity,
          biomeWeights: spec.terrain.biomeWeights,
          geographyBlueprint: spec.geographyBlueprint,
        },
      },
      identity,
      factions,
    };

    const { data: bootstrapData, error: bootErr } = await sb.functions.invoke(
      "create-world-bootstrap",
      { body: bootstrapBody },
    );
    if (bootErr) throw new Error(`bootstrap: ${bootErr.message}`);
    if (!bootstrapData?.ok) throw new Error(bootstrapData?.error || "bootstrap selhal");

    return new Response(JSON.stringify({
      ok: true,
      sessionId: session.id,
      worldName: aiOut.world_name,
      factionCount: factions.length,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[quick-random-game] failed:", e);
    return new Response(JSON.stringify({ ok: false, error: e?.message || "Neznámá chyba" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
