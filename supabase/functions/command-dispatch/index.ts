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
 *   commandType: string,
 *   commandPayload: object,
 *   commandId: string
 * }
 *
 * Responsibilities:
 * 1. Validate session exists and turnNumber matches
 * 2. Check idempotency via command_id UNIQUE index on game_events
 * 3. Execute command-specific side-effects (e.g. create city row)
 * 4. Append 1+ events to game_events (append-only)
 * 5. Return created event IDs + sideEffects
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { sessionId, turnNumber, actor, commandType, commandPayload, commandId } = body;

    if (!sessionId || !commandType || !commandId || !actor?.name) {
      return json({ error: "Missing required fields: sessionId, commandType, commandId, actor.name" }, 400);
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
      return json({ error: "Session not found" }, 404);
    }

    if (turnNumber !== undefined && turnNumber !== null && turnNumber !== session.current_turn) {
      return json({ error: "Turn mismatch", expected: session.current_turn, received: turnNumber }, 409);
    }

    const effectiveTurn = turnNumber ?? session.current_turn;

    // ── Execute command ──
    const result = await executeCommand(
      supabase, sessionId, effectiveTurn, actor, commandType, commandPayload, commandId
    );

    if (result.error) {
      return json({ error: result.error }, result.status || 400);
    }

    // ── Audit log ──
    await supabase.from("world_action_log").insert({
      session_id: sessionId,
      player_name: actor.name,
      turn_number: effectiveTurn,
      action_type: commandType,
      description: `Command ${commandType} dispatched (${result.events.length} events)`,
    }).then(() => {}, () => {});

    return json({
      ok: true,
      idempotent: result.idempotent || false,
      events: result.events,
      sideEffects: result.sideEffects || {},
    });

  } catch (err) {
    console.error("command-dispatch error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Actor { name: string; type?: string; id?: string; }

interface CommandResult {
  events: any[];
  sideEffects?: Record<string, any>;
  idempotent?: boolean;
  error?: string;
  status?: number;
}

// ═══════════════════════════════════════════
// COMMAND EXECUTOR
// ═══════════════════════════════════════════

async function executeCommand(
  supabase: any,
  sessionId: string,
  turnNumber: number,
  actor: Actor,
  commandType: string,
  payload: any,
  commandId: string,
): Promise<CommandResult> {
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
      return await executeFoundCity(supabase, base, actor, payload);

    case "RECRUIT_STACK":
      return insertEvents(supabase, commandId, [{
        ...base,
        event_type: "military",
        note: payload.note || `${actor.name} verboval novou armádu.`,
        importance: "normal",
        reference: { stackId: payload.stackId, units: payload.units, ...payload },
      }]);

    case "DECLARE_WAR":
      return insertEvents(supabase, commandId, [{
        ...base,
        event_type: "war",
        note: payload.note || `${actor.name} vyhlásil válku ${payload.targetPlayer}.`,
        importance: "critical",
        reference: { targetPlayer: payload.targetPlayer, ...payload },
      }]);

    case "SIGN_TREATY":
      return insertEvents(supabase, commandId, [{
        ...base,
        event_type: "treaty",
        note: payload.note || `Smlouva mezi ${actor.name} a ${payload.otherParty}.`,
        treaty_type: payload.treatyType || "peace",
        terms_summary: payload.terms || "",
        importance: "critical",
        reference: { otherParty: payload.otherParty, ...payload },
      }]);

    case "ISSUE_DECLARATION":
      return insertEvents(supabase, commandId, [{
        ...base,
        event_type: "proclamation",
        note: payload.text || payload.note || `${actor.name} vydal prohlášení.`,
        importance: payload.importance || "normal",
        reference: { declarationType: payload.declarationType, ...payload },
      }]);

    case "BUILD_BUILDING":
      return insertEvents(supabase, commandId, [{
        ...base,
        event_type: "construction",
        city_id: payload.cityId,
        note: payload.note || `Stavba ${payload.buildingName} v ${payload.cityName}.`,
        importance: "normal",
        reference: { buildingId: payload.buildingId, buildingName: payload.buildingName, ...payload },
      }]);

    case "GENERIC":
      return insertEvents(supabase, commandId, [{
        ...base,
        event_type: payload.eventType || "other",
        note: payload.note || "",
        importance: payload.importance || "normal",
        city_id: payload.cityId || null,
        location: payload.location || null,
        reference: payload.reference || payload,
      }]);

    default:
      return insertEvents(supabase, commandId, [{
        ...base,
        event_type: commandType.toLowerCase(),
        note: payload.note || `${commandType} by ${actor.name}`,
        importance: payload.importance || "normal",
        reference: payload || {},
      }]);
  }
}

// ═══════════════════════════════════════════
// FOUND_CITY — full server-side execution
// ═══════════════════════════════════════════

async function executeFoundCity(
  supabase: any,
  base: any,
  actor: Actor,
  payload: any,
): Promise<CommandResult> {
  const {
    cityName, provinceId, provinceName, tags, flavorPrompt, legend,
    // Optional: client can send pre-computed coords
    provinceQ, provinceR,
  } = payload;

  if (!cityName?.trim()) return { events: [], error: "Missing cityName" };

  const sessionId = base.session_id;
  const turnNumber = base.turn_number;

  // ── Find free hex coordinates ──
  let freeQ = provinceQ ?? 0;
  let freeR = provinceR ?? 0;

  if (provinceQ === undefined || provinceR === undefined) {
    const { data: occupiedCities } = await supabase
      .from("cities")
      .select("province_q, province_r")
      .eq("session_id", sessionId);

    const occupied = new Set(
      (occupiedCities || []).map((c: any) => `${c.province_q},${c.province_r}`)
    );

    let found = false;
    const directions = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
    if (!occupied.has("0,0")) { freeQ = 0; freeR = 0; found = true; }
    else {
      outer:
      for (let ring = 1; ring <= 20; ring++) {
        let q = 0, r = -ring;
        for (let d = 0; d < 6; d++) {
          for (let step = 0; step < ring; step++) {
            if (!occupied.has(`${q},${r}`)) { freeQ = q; freeR = r; found = true; break outer; }
            q += directions[d][0]; r += directions[d][1];
          }
        }
      }
    }
    if (!found) { freeQ = Math.floor(Math.random() * 100) + 20; freeR = Math.floor(Math.random() * 100) + 20; }
  }

  // ── 1. Create city ──
  const { data: cityData, error: cityErr } = await supabase.from("cities").insert({
    session_id: sessionId,
    owner_player: actor.name,
    name: cityName.trim(),
    province_id: provinceId || null,
    province: provinceName || "",
    level: "Osada",
    settlement_level: "HAMLET",
    tags: tags?.length > 0 ? tags : null,
    founded_round: turnNumber,
    flavor_prompt: flavorPrompt?.trim() || null,
    province_q: freeQ,
    province_r: freeR,
    population_total: 1000,
    population_peasants: 800,
    population_burghers: 150,
    population_clerics: 50,
    city_stability: 70,
    local_grain_reserve: 0,
    local_granary_capacity: 0,
  }).select("id").single();

  if (cityErr) return { events: [], error: `City creation failed: ${cityErr.message}` };
  const cityId = cityData.id;

  // ── 2. World event ──
  const slug = `founding-${cityName.trim().toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
  const legendText = legend?.trim()
    ? `${actor.name} založil novou osadu ${cityName.trim()} v provincii ${provinceName || ""}. ${legend.trim()}`
    : `${actor.name} založil novou osadu ${cityName.trim()} v provincii ${provinceName || ""}.`;

  await safeInsert(supabase.from("world_events").insert({
    session_id: sessionId,
    title: `Založení osady ${cityName.trim()}`,
    slug,
    summary: legendText,
    event_category: "founding",
    created_turn: turnNumber,
    date: `Rok ${turnNumber}`,
    status: "published",
    created_by_type: "player",
    affected_players: [actor.name],
    location_id: cityId,
    participants: JSON.stringify([{ name: actor.name, role: "founder" }]),
  }));

  // ── 3. Feed item ──
  await safeInsert(supabase.from("world_feed_items").insert({
    session_id: sessionId,
    turn_number: turnNumber,
    feed_type: "gossip",
    text: `V provincii ${provinceName || ""} byla založena nová osada ${cityName.trim()}.`,
    player_source: actor.name,
    related_entity_type: "city",
    related_entity_id: cityId,
  }));

  // ── 4. Chronicle entry ──
  const chronicleText = legend?.trim()
    ? `V roce ${turnNumber} byla založena osada **${cityName.trim()}** v provincii ${provinceName || ""}, pod vládou ${actor.name}. ${legend.trim()}`
    : `V roce ${turnNumber} byla založena osada **${cityName.trim()}** v provincii ${provinceName || ""}, pod vládou ${actor.name}. Nová osada se rodí z prachu a naděje.`;

  await safeInsert(supabase.from("chronicle_entries").insert({
    session_id: sessionId,
    turn_from: turnNumber,
    turn_to: turnNumber,
    text: chronicleText,
  }));

  // ── 5. Wiki entry ──
  const playerSummary = flavorPrompt?.trim() || `Nově založená osada v provincii ${provinceName || ""}.`;
  const playerLegend = legend?.trim() || null;
  const playerAiDesc = playerLegend ? `${playerSummary}\n\n${playerLegend}` : playerSummary;

  await safeInsert(supabase.from("wiki_entries").upsert({
    session_id: sessionId,
    entity_type: "city",
    entity_id: cityId,
    entity_name: cityName.trim(),
    summary: playerSummary,
    body_md: playerLegend,
    ai_description: playerAiDesc,
    status: "published",
  }, { onConflict: "session_id,entity_type,entity_id" }));

  // ── 6. Auto-discover entities ──
  const discoveryRows: any[] = [
    { session_id: sessionId, player_name: actor.name, entity_type: "city", entity_id: cityId, source: "founded" },
  ];
  if (provinceId) {
    discoveryRows.push({ session_id: sessionId, player_name: actor.name, entity_type: "province", entity_id: provinceId, source: "founded" });
    // Discover region
    const { data: prov } = await supabase.from("provinces").select("region_id").eq("id", provinceId).single();
    if (prov?.region_id) {
      discoveryRows.push({ session_id: sessionId, player_name: actor.name, entity_type: "region", entity_id: prov.region_id, source: "founded" });
    }
    // Discover sibling cities
    const { data: siblings } = await supabase.from("cities").select("id").eq("session_id", sessionId).eq("province_id", provinceId).neq("id", cityId);
    if (siblings) {
      for (const s of siblings) {
        discoveryRows.push({ session_id: sessionId, player_name: actor.name, entity_type: "city", entity_id: s.id, source: "founded" });
      }
    }
  }
  await safeInsert(supabase.from("discoveries").upsert(discoveryRows, { onConflict: "session_id,player_name,entity_type,entity_id" }));

  // ── 7. Settlement resource profile ──
  const seed = Math.abs(cityId.split("").reduce((h: number, c: string) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0));
  const roll = seed % 100;
  const specialType = roll < 25 ? "IRON" : roll < 50 ? "STONE" : "NONE";
  await safeInsert(supabase.from("settlement_resource_profiles").upsert({
    city_id: cityId,
    produces_grain: true,
    produces_wood: true,
    special_resource_type: specialType,
    base_grain: 8,
    base_wood: 6,
    base_special: specialType !== "NONE" ? 2 : 0,
    founded_seed: cityId,
  }, { onConflict: "city_id" }));

  // ── 8. Insert canonical event ──
  const events = [{
    ...base,
    event_type: "founding",
    location: cityName.trim(),
    city_id: cityId,
    note: payload.note || `${actor.name} založil město ${cityName.trim()}.`,
    importance: "critical",
    reference: {
      cityName: cityName.trim(), cityId, provinceId, provinceName,
      flavorPrompt: flavorPrompt?.trim(), legend: legend?.trim(),
      tags, provinceQ: freeQ, provinceR: freeR,
    },
  }];

  return insertEvents(supabase, base.command_id, events, { cityId });
}

// ═══════════════════════════════════════════
// SHARED INSERT WITH IDEMPOTENCY
// ═══════════════════════════════════════════

async function insertEvents(
  supabase: any,
  commandId: string,
  events: any[],
  sideEffects?: Record<string, any>,
): Promise<CommandResult> {
  const { data: inserted, error: insertErr } = await supabase
    .from("game_events")
    .insert(events)
    .select("id, event_type, command_id");

  if (insertErr) {
    if (insertErr.code === "23505" && insertErr.message?.includes("command_id")) {
      const { data: existing } = await supabase
        .from("game_events")
        .select("id, event_type, command_id")
        .eq("command_id", commandId);
      return { events: existing || [], idempotent: true, sideEffects };
    }
    return { events: [], error: insertErr.message };
  }

  return { events: inserted || [], sideEffects };
}

async function safeInsert(query: any) {
  try { await query; } catch (_) { /* non-critical side-effect */ }
}
