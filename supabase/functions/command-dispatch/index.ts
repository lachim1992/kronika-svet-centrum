import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * command-dispatch: Single write entrypoint for all game commands.
 *
 * Input: {
 *   sessionId: string,
 *   turnNumber: number,
 *   actor: { name: string, type: "player" | "system" | "ai_faction", id?: string },
 *   commandType: string,        // e.g. "FOUND_CITY", "RECRUIT_STACK", "DECLARE_WAR"
 *   commandPayload: object,     // type-specific data
 *   commandId: string           // UUID for idempotency
 * }
 *
 * Responsibilities:
 * 1. Validate session exists and turnNumber matches
 * 2. Check idempotency via command_id UNIQUE index on game_events
 * 3. Append 1+ events to game_events (append-only)
 * 4. Return created event IDs
 *
 * Does NOT: update projection tables, run world-tick, advance turns.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { sessionId, turnNumber, actor, commandType, commandPayload, commandId } = body;

    // ── Validate required fields ──
    if (!sessionId || !commandType || !commandId || !actor?.name) {
      return new Response(JSON.stringify({
        error: "Missing required fields: sessionId, commandType, commandId, actor.name",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Validate session ──
    const { data: session, error: sessErr } = await supabase
      .from("game_sessions")
      .select("id, current_turn")
      .eq("id", sessionId)
      .single();

    if (sessErr || !session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If turnNumber provided, validate it matches current turn
    if (turnNumber !== undefined && turnNumber !== null && turnNumber !== session.current_turn) {
      return new Response(JSON.stringify({
        error: "Turn mismatch",
        expected: session.current_turn,
        received: turnNumber,
      }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const effectiveTurn = turnNumber ?? session.current_turn;

    // ── Build events from command ──
    const events = buildEventsFromCommand(
      sessionId, effectiveTurn, actor, commandType, commandPayload, commandId
    );

    if (events.length === 0) {
      return new Response(JSON.stringify({ error: `Unknown commandType: ${commandType}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Insert events (idempotency enforced by UNIQUE index on command_id) ──
    const { data: inserted, error: insertErr } = await supabase
      .from("game_events")
      .insert(events)
      .select("id, event_type, command_id");

    if (insertErr) {
      // Check for unique constraint violation (duplicate command_id)
      if (insertErr.code === "23505" && insertErr.message?.includes("command_id")) {
        // Idempotent: return existing events for this command
        const { data: existing } = await supabase
          .from("game_events")
          .select("id, event_type, command_id")
          .eq("command_id", commandId);
        return new Response(JSON.stringify({
          ok: true,
          idempotent: true,
          events: existing || [],
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw insertErr;
    }

    // ── Audit log ──
    await supabase.from("world_action_log").insert({
      session_id: sessionId,
      player_name: actor.name,
      turn_number: effectiveTurn,
      action_type: commandType,
      description: `Command ${commandType} dispatched (${events.length} events)`,
    }).then(() => {}, () => {}); // non-critical

    return new Response(JSON.stringify({
      ok: true,
      idempotent: false,
      events: inserted || [],
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("command-dispatch error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ═══════════════════════════════════════════
// COMMAND → EVENT MAPPING
// ═══════════════════════════════════════════

interface Actor {
  name: string;
  type?: string;
  id?: string;
}

function buildEventsFromCommand(
  sessionId: string,
  turnNumber: number,
  actor: Actor,
  commandType: string,
  payload: any,
  commandId: string,
): any[] {
  const base = {
    session_id: sessionId,
    turn_number: turnNumber,
    player: actor.name,
    actor_type: actor.type || "player",
    command_id: commandId,
    confirmed: true,
    truth_state: "canon",
  };

  switch (commandType) {
    case "FOUND_CITY":
      return [{
        ...base,
        event_type: "founding",
        location: payload.cityName,
        city_id: payload.cityId || null,
        note: payload.note || `${actor.name} založil město ${payload.cityName}.`,
        importance: "critical",
        reference: { cityName: payload.cityName, provinceId: payload.provinceId, ...payload },
      }];

    case "RECRUIT_STACK":
      return [{
        ...base,
        event_type: "military",
        note: payload.note || `${actor.name} verboval novou armádu.`,
        importance: "normal",
        reference: { stackId: payload.stackId, units: payload.units, ...payload },
      }];

    case "DECLARE_WAR":
      return [{
        ...base,
        event_type: "war",
        note: payload.note || `${actor.name} vyhlásil válku ${payload.targetPlayer}.`,
        importance: "critical",
        reference: { targetPlayer: payload.targetPlayer, ...payload },
      }];

    case "SIGN_TREATY":
      return [{
        ...base,
        event_type: "treaty",
        note: payload.note || `Smlouva mezi ${actor.name} a ${payload.otherParty}.`,
        treaty_type: payload.treatyType || "peace",
        terms_summary: payload.terms || "",
        importance: "critical",
        reference: { otherParty: payload.otherParty, ...payload },
      }];

    case "ISSUE_DECLARATION":
      return [{
        ...base,
        event_type: "proclamation",
        note: payload.text || payload.note || `${actor.name} vydal prohlášení.`,
        importance: payload.importance || "normal",
        reference: { declarationType: payload.declarationType, ...payload },
      }];

    case "BUILD_BUILDING":
      return [{
        ...base,
        event_type: "construction",
        city_id: payload.cityId,
        note: payload.note || `Stavba ${payload.buildingName} v ${payload.cityName}.`,
        importance: "normal",
        reference: { buildingId: payload.buildingId, buildingName: payload.buildingName, ...payload },
      }];

    case "GENERIC":
      return [{
        ...base,
        event_type: payload.eventType || "other",
        note: payload.note || "",
        importance: payload.importance || "normal",
        city_id: payload.cityId || null,
        location: payload.location || null,
        reference: payload.reference || payload,
      }];

    default:
      // Extensible: unknown commands become generic events
      return [{
        ...base,
        event_type: commandType.toLowerCase(),
        note: payload.note || `${commandType} by ${actor.name}`,
        importance: payload.importance || "normal",
        reference: payload || {},
      }];
  }
}
