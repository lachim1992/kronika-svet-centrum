import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
  // ── Idempotency pre-check (best-effort, not transactional) ──
  // Sprint A mitigation: if an event with this command_id already exists,
  // return it without re-mutating. Does NOT prevent TOCTOU race —
  // full transactional idempotency requires Sprint B typed RPCs.
  const { data: existingEvents } = await supabase
    .from("game_events")
    .select("id, event_type, command_id")
    .eq("command_id", commandId);

  if (existingEvents && existingEvents.length > 0) {
    return { events: existingEvents, idempotent: true };
  }

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
      return await executeRecruitStack(supabase, base, actor, payload);

    case "REINFORCE_STACK":
      return await executeReinforceStack(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "UPGRADE_FORMATION":
      return await executeUpgradeFormation(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "ASSIGN_GENERAL":
      return await executeAssignGeneral(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "DISBAND_STACK":
      return await executeDisbandStack(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "REMOBILIZE_STACK":
      return await executeRemobilizeStack(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "DEMOBILIZE_STACK":
      return await executeDemobilizeStack(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "SET_MOBILIZATION":
      return await executeSetMobilization(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "RECRUIT_GENERAL":
      return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
        ...base,
        event_type: "military",
        note: payload.note || `${actor.name} jmenoval nového generála.`,
        importance: "normal",
        reference: payload,
      }], payload.chronicleText);

    case "DEPLOY_STACK":
      return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
        ...base,
        event_type: "military",
        note: payload.note || `Armáda byla rozmístěna.`,
        importance: "normal",
        reference: payload,
      }], payload.chronicleText);

    case "POST_BATTLE_DECISION":
      return await executePostBattleDecision(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "DECLARE_WAR":
      return await executeDeclareWar(supabase, base, actor, payload, commandId, sessionId, turnNumber);

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
      return await executeBuildBuilding(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "UPGRADE_BUILDING":
      return await executeUpgradeBuilding(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "BUILD_DISTRICT":
      return await executeBuildDistrict(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "UPGRADE_INFRASTRUCTURE":
      return await executeUpgradeInfrastructure(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "UPGRADE_SETTLEMENT":
      return await executeUpgradeSettlement(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "APPLY_DECREE_EFFECTS":
      return await executeApplyDecreeEffects(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "SET_TRADE_IDEOLOGY":
      return await executeSetTradeIdeology(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "SET_SPORT_FUNDING":
      return await executeSetSportFunding(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "WONDER_COMPLETED":
      return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
        ...base,
        event_type: "wonder",
        city_id: payload.cityId,
        note: payload.note || `Div světa: ${payload.wonderName}.`,
        importance: "critical",
        reference: payload,
      }], payload.chronicleText);

    case "CREATE_TRADE_OFFER":
      return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
        ...base,
        event_type: "trade",
        note: payload.note || `${actor.name} odeslal obchodní nabídku.`,
        importance: "normal",
        reference: payload,
      }], payload.chronicleText);

    case "ACCEPT_TRADE_OFFER":
      return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
        ...base,
        event_type: "trade",
        note: payload.note || `Obchodní dohoda uzavřena.`,
        importance: "normal",
        reference: payload,
      }], payload.chronicleText);

    case "GENERATE_CHRONICLE": {
      const chronicleTurn = payload.chronicleTurn || turnNumber;
      const result = await insertEvents(supabase, commandId, [{
        ...base,
        event_type: "chronicle_generation",
        note: payload.note || `Kronika vygenerována pro rok ${chronicleTurn}.`,
        importance: "normal",
        actor_type: "system",
        reference: payload,
      }]);
      if (result.error) return result;
      if (payload.chronicleText) {
        await safeInsert(supabase.from("chronicle_entries").insert({
          session_id: sessionId,
          turn_from: chronicleTurn,
          turn_to: chronicleTurn,
          text: payload.chronicleText,
        }));
      }
      return result;
    }

    case "IMPORT_SOURCE":
      return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
        ...base,
        event_type: "source_import",
        note: payload.note || `Import textu do kroniky.`,
        importance: "normal",
        reference: payload,
      }], payload.chronicleText);

    case "MOVE_STACK":
      return await executeMoveStack(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "MOVE_STACK_ROUTE":
      return await executeMoveStackRoute(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "BUILD_ROUTE":
      return await executeBuildRoute(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "UPGRADE_ROUTE":
      return await executeUpgradeRoute(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "FORTIFY_NODE":
      return await executeFortifyNode(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "BLOCKADE_ROUTE":
      return await executeBlockadeRoute(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "AMBUSH_ROUTE":
      return await executeAmbushRoute(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "SIEGE_NODE":
      return await executeSiegeNode(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "DISRUPT_ROUTE":
      return await executeDisruptRoute(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "START_PROJECT":
      return await executeStartProject(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "CANCEL_PROJECT":
      return await executeCancelProject(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "PROPOSE_PACT":
      return await executeProposePact(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "ACCEPT_PACT":
      return await executeAcceptPact(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "REJECT_PACT":
      return await executeRejectPact(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "LIFT_EMBARGO":
      return await executeLiftEmbargo(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "EXPLORE_TILE":
      return await executeExploreTile(supabase, base, actor, payload, commandId, sessionId, turnNumber);

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
    provinceQ, provinceR,
  } = payload;

  if (!cityName?.trim()) return { events: [], error: "Missing cityName" };

  const sessionId = base.session_id;
  const turnNumber = base.turn_number;

  // ── Validate target hex passability for city founding ──
  if (provinceQ !== undefined && provinceR !== undefined) {
    const { data: targetHex } = await supabase.from("province_hexes")
      .select("biome_family, has_river, is_passable")
      .eq("session_id", sessionId).eq("q", provinceQ).eq("r", provinceR).maybeSingle();

    if (targetHex) {
      const CITY_ALLOWED = ["plains", "hills", "forest", "swamp"];
      if (!CITY_ALLOWED.includes(targetHex.biome_family)) {
        return { events: [], error: `Nelze založit město na biomu '${targetHex.biome_family}' — povolené: pláně, kopce, les, bažiny` };
      }
      if (targetHex.has_river) {
        // Rivers are allowed for cities — river cities get trade bonus
        // But we don't block it
      }
    }
  }

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
    population_warriors: 0,
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

  // ── 8. Claim surrounding hexes (center + ring 1 = 7 hexes) ──
  const RING1_DIRS = [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
  const claimHexes = [{ q: freeQ, r: freeR }];
  for (const [dq, dr] of RING1_DIRS) {
    claimHexes.push({ q: freeQ + dq, r: freeR + dr });
  }
  for (const h of claimHexes) {
    const { data: existing } = await supabase.from("province_hexes")
      .select("id, owner_player")
      .eq("session_id", sessionId).eq("q", h.q).eq("r", h.r)
      .maybeSingle();
    if (existing) {
      // Only claim if unclaimed
      if (!existing.owner_player) {
        await supabase.from("province_hexes")
          .update({ owner_player: actor.name, province_id: provinceId || null })
          .eq("id", existing.id);
      }
    }
    // If hex doesn't exist in province_hexes yet, it will be claimed when generated
  }

  // ── 9. Insert canonical event ──
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
// MOVE_STACK — update hex position + event
// ═══════════════════════════════════════════

async function executeMoveStack(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { stackId, toQ, toR, fromQ, fromR } = payload;
  if (!stackId) return { events: [], error: "Missing stackId" };
  if (toQ === undefined || toR === undefined) return { events: [], error: "Missing toQ/toR" };

  // Verify stack belongs to actor
  const { data: stack } = await supabase.from("military_stacks")
    .select("id, player_name, hex_q, hex_r")
    .eq("id", stackId).eq("session_id", sessionId).single();

  if (!stack) return { events: [], error: "Stack not found" };
  if (stack.player_name !== actor.name) return { events: [], error: "Not your stack" };

  // Server-side distance check
  const actualFromQ = fromQ ?? stack.hex_q;
  const actualFromR = fromR ?? stack.hex_r;
  const dq2 = toQ - actualFromQ;
  const dr2 = toR - actualFromR;
  const actualDist = Math.max(Math.abs(dq2), Math.abs(dr2), Math.abs(dq2 + dr2));
  if (actualDist > 3) {
    return { events: [], error: `Move too far: distance ${actualDist} exceeds max 3 hexes per turn` };
  }

  // ── PASSABILITY CHECK ──
  const { data: targetHex } = await supabase.from("province_hexes")
    .select("biome_family, is_passable, has_river, has_bridge")
    .eq("session_id", sessionId).eq("q", toQ).eq("r", toR).maybeSingle();

  if (targetHex) {
    // Sea and mountains are always impassable
    if (targetHex.biome_family === "sea") {
      return { events: [], error: "Nelze vstoupit na moře — hex je neprostupný" };
    }
    if (targetHex.biome_family === "mountains") {
      return { events: [], error: "Nelze vstoupit do hor — hex je neprostupný" };
    }
    // River without bridge is impassable
    if (targetHex.has_river && !targetHex.has_bridge) {
      return { events: [], error: "Nelze překročit řeku bez mostu — hex je neprostupný" };
    }
  }

  // Update stack position
  const { error: moveErr } = await supabase.from("military_stacks")
    .update({ hex_q: toQ, hex_r: toR })
    .eq("id", stackId)
    .eq("session_id", sessionId);

  if (moveErr) return { events: [], error: `Move failed: ${moveErr.message}` };

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "military",
    note: payload.note || `${actor.name} přesunul armádu ${payload.stackName || ""} na [${toQ},${toR}].`,
    importance: "normal",
    reference: payload,
  }], payload.chronicleText);
}

// ═══════════════════════════════════════════
// POST_BATTLE_DECISION — Conquer / Pillage / Vassalize
// ═══════════════════════════════════════════

async function executePostBattleDecision(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { battleId, decision, cityId } = payload;
  // decision: "conquer" | "pillage" | "vassalize"
  if (!battleId) return { events: [], error: "Missing battleId" };
  if (!decision) return { events: [], error: "Missing decision" };
  if (!cityId) return { events: [], error: "Missing cityId" };

  // Validate battle exists and belongs to actor
  const { data: battle } = await supabase.from("battles")
    .select("*").eq("id", battleId).eq("session_id", sessionId).single();
  if (!battle) return { events: [], error: "Battle not found" };
  if (battle.post_action !== "pending_decision") {
    return { events: [], error: "Battle already resolved", status: 409 };
  }

  // Get the city
  const { data: city } = await supabase.from("cities")
    .select("*").eq("id", cityId).eq("session_id", sessionId).single();
  if (!city) return { events: [], error: "City not found" };

  const previousOwner = city.owner_player;
  const cityName = city.name;
  let chronicleText = "";
  const sideEffects: Record<string, any> = { decision, cityId, previousOwner };

  switch (decision) {
    case "conquer": {
      // Transfer city ownership
      await supabase.from("cities").update({
        owner_player: actor.name,
        city_stability: Math.max(5, Math.floor((city.city_stability || 50) * 0.4)),
        legitimacy: Math.max(0, (city.legitimacy || 50) - 30),
      }).eq("id", cityId);

      // Transfer province ownership if exists
      if (city.province_id) {
        await safeInsert(supabase.from("provinces").update({
          owner_player: actor.name,
        }).eq("id", city.province_id).eq("owner_player", previousOwner));
      }

      // Update wiki
      await safeInsert(supabase.from("wiki_entries").update({
        owner_player: actor.name,
      }).eq("session_id", sessionId).eq("entity_type", "city").eq("entity_id", cityId));

      // Auto-discover for new owner
      await safeInsert(supabase.from("discoveries").upsert({
        session_id: sessionId, player_name: actor.name,
        entity_type: "city", entity_id: cityId, source: "conquered",
      }, { onConflict: "session_id,player_name,entity_type,entity_id" }));

      chronicleText = `V roce ${turnNumber} dobyl **${actor.name}** město **${cityName}**, které dříve patřilo ${previousOwner}. Nový pořádek se etabluje za cenu stability a legitimity.`;
      sideEffects.newOwner = actor.name;
      sideEffects.stabilityAfter = Math.max(5, Math.floor((city.city_stability || 50) * 0.4));
      break;
    }

    case "pillage": {
      // Calculate loot based on city development
      const lootGold = Math.floor(50 + (city.development_level || 1) * 20 + (city.population_total || 1000) * 0.02);
      const lootGrain = Math.floor((city.local_grain_reserve || 0) * 0.6);
      const popLoss = Math.floor((city.population_total || 1000) * 0.25);

      // Devastate the city
      await supabase.from("cities").update({
        status: "devastated",
        devastated_round: turnNumber,
        ruins_note: `Zpustošeno armádou ${actor.name} v roce ${turnNumber}.`,
        population_total: Math.max(100, (city.population_total || 1000) - popLoss),
        population_peasants: Math.max(50, (city.population_peasants || 500) - Math.floor(popLoss * 0.6)),
        population_burghers: Math.max(20, (city.population_burghers || 200) - Math.floor(popLoss * 0.3)),
        population_clerics: Math.max(10, (city.population_clerics || 100) - Math.floor(popLoss * 0.1)),
        city_stability: Math.max(0, (city.city_stability || 50) - 30),
        local_grain_reserve: Math.max(0, (city.local_grain_reserve || 0) - lootGrain),
        development_level: Math.max(0, (city.development_level || 1) - 1),
      }).eq("id", cityId);

      // Give loot to attacker
      const { data: realm } = await supabase.from("realm_resources")
        .select("id, gold_reserve, grain_reserve")
        .eq("session_id", sessionId).eq("player_name", actor.name).maybeSingle();
      if (realm) {
        await supabase.from("realm_resources").update({
          gold_reserve: (realm.gold_reserve || 0) + lootGold,
          grain_reserve: (realm.grain_reserve || 0) + lootGrain,
        }).eq("id", realm.id);
      }

      chronicleText = `V roce ${turnNumber} **${actor.name}** zpustošil město **${cityName}** (${previousOwner}). Kořist: ${lootGold} zlata, ${lootGrain} obilí. Obyvatelé oplakávají ${popLoss} mrtvých.`;
      sideEffects.lootGold = lootGold;
      sideEffects.lootGrain = lootGrain;
      sideEffects.populationLoss = popLoss;
      break;
    }

    case "vassalize": {
      // City stays with owner but becomes vassal — tribute is tracked
      await supabase.from("cities").update({
        city_stability: Math.max(10, (city.city_stability || 50) - 15),
        tags: [...(city.tags || []), `vassal_of:${actor.name}`],
      }).eq("id", cityId);

      // Create a tribute trade agreement via game_events reference
      const tributeGold = Math.max(5, Math.floor((city.development_level || 1) * 8));

      chronicleText = `V roce ${turnNumber} přijalo město **${cityName}** (${previousOwner}) vazalství pod **${actor.name}**. Roční tribut: ${tributeGold} zlata. Město si zachovává autonomii, ale pod stínem nového pána.`;
      sideEffects.tributeGold = tributeGold;
      sideEffects.vassalOf = actor.name;
      break;
    }

    default:
      return { events: [], error: `Unknown decision: ${decision}` };
  }

  // Mark battle as resolved
  await supabase.from("battles").update({
    post_action: decision,
    resolved_at: new Date().toISOString(),
  }).eq("id", battleId);

  // Add city rumor
  await safeInsert(supabase.from("city_rumors").insert({
    session_id: sessionId, city_id: cityId, city_name: cityName,
    turn_number: turnNumber, created_by: "system",
    tone_tag: decision === "conquer" ? "dramatic" : decision === "pillage" ? "alarming" : "tense",
    text: decision === "conquer"
      ? `Město ${cityName} padlo do rukou ${actor.name}! Nový vladař přebírá vládu.`
      : decision === "pillage"
      ? `Hrůza! Armáda ${actor.name} zpustošila ${cityName}. Ruiny a popel jsou vše, co zbylo.`
      : `Město ${cityName} se poddalo ${actor.name} jako vazal. Tribut bude placen výměnou za přežití.`,
  }));

  // World feed item
  await safeInsert(supabase.from("world_feed_items").insert({
    session_id: sessionId, turn_number: turnNumber, feed_type: "war",
    text: chronicleText, player_source: actor.name,
    related_entity_type: "city", related_entity_id: cityId,
  }));

  // Faction loyalty impacts in the city
  if (decision !== "vassalize") {
    const { data: factions } = await supabase.from("city_factions")
      .select("id, loyalty, satisfaction").eq("city_id", cityId);
    for (const f of (factions || [])) {
      await supabase.from("city_factions").update({
        loyalty: Math.max(0, (f.loyalty || 50) - (decision === "pillage" ? 25 : 15)),
        satisfaction: Math.max(0, (f.satisfaction || 50) - (decision === "pillage" ? 30 : 10)),
      }).eq("id", f.id);
    }
  }

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "battle_outcome",
    city_id: cityId,
    note: `${actor.name} rozhodl o osudu města ${cityName}: ${decision === "conquer" ? "Dobytí" : decision === "pillage" ? "Drancování" : "Vazalství"}.`,
    importance: "critical",
    reference: { battleId, decision, cityId, previousOwner, ...sideEffects },
  }], chronicleText, sideEffects);
}

// ═══════════════════════════════════════════
// DECLARE_WAR — create war record + stability penalties + event
// ═══════════════════════════════════════════

async function executeDeclareWar(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { targetPlayer, reason, manifestText } = payload;
  if (!targetPlayer) return { events: [], error: "Missing targetPlayer" };

  // Check for existing active war
  const { data: existingWar } = await supabase.from("war_declarations")
    .select("id").eq("session_id", sessionId)
    .eq("declaring_player", actor.name).eq("target_player", targetPlayer)
    .eq("status", "active").maybeSingle();

  if (existingWar) {
    return { events: [], error: "War already active between these players", status: 409 };
  }

  // Create war declaration record
  const { data: warRecord, error: warErr } = await supabase.from("war_declarations").insert({
    session_id: sessionId,
    declaring_player: actor.name,
    target_player: targetPlayer,
    declared_turn: turnNumber,
    status: "active",
    manifest_text: manifestText || reason || null,
  }).select("id").single();

  if (warErr) return { events: [], error: `War declaration failed: ${warErr.message}` };

  // Apply stability penalties: -5 attacker, -8 defender
  const applyStabilityPenalty = async (player: string, penalty: number) => {
    const { data: cities } = await supabase.from("cities")
      .select("id, city_stability").eq("session_id", sessionId).eq("owner_player", player);
    for (const c of (cities || [])) {
      await supabase.from("cities").update({
        city_stability: Math.max(0, (c.city_stability || 50) - penalty),
      }).eq("id", c.id);
    }
  };

  await Promise.all([
    applyStabilityPenalty(actor.name, 5),
    applyStabilityPenalty(targetPlayer, 8),
  ]);

  // Mark stability penalty as applied
  await supabase.from("war_declarations").update({ stability_penalty_applied: true }).eq("id", warRecord.id);

  // Chronicle entry
  const chronicleText = `V roce ${turnNumber} vyhlásil **${actor.name}** válku **${targetPlayer}**. ${reason ? `Důvod: ${reason}.` : "Příčiny konfliktu zůstávají zahaleny tajemstvím."}`;
  await safeInsert(supabase.from("chronicle_entries").insert({
    session_id: sessionId, turn_from: turnNumber, turn_to: turnNumber,
    text: chronicleText, source_type: "system",
  }));

  // City rumors for both sides
  const addWarRumors = async (player: string, isAttacker: boolean) => {
    const { data: cities } = await supabase.from("cities")
      .select("id, name").eq("session_id", sessionId).eq("owner_player", player);
    for (const c of (cities || [])) {
      await safeInsert(supabase.from("city_rumors").insert({
        session_id: sessionId, city_id: c.id, city_name: c.name, turn_number: turnNumber,
        text: isAttacker
          ? `Vladař ${actor.name} vyhlásil válku ${targetPlayer}. Město se připravuje na konflikt.`
          : `${actor.name} vyhlásil válku naší říši! Obavy se šíří mezi obyvateli ${c.name}.`,
        tone_tag: isAttacker ? "tense" : "alarming", created_by: "system",
      }));
    }
  };

  await Promise.all([addWarRumors(actor.name, true), addWarRumors(targetPlayer, false)]);

  return insertEvents(supabase, commandId, [{
    ...base,
    event_type: "war",
    note: payload.note || `${actor.name} vyhlásil válku ${targetPlayer}.`,
    importance: "critical",
    reference: { targetPlayer, warId: warRecord.id, reason, ...payload },
  }], { warId: warRecord.id });
}

// ═══════════════════════════════════════════
// RECRUIT_STACK — full server-side execution
// ═══════════════════════════════════════════

const FORMATION_PRESETS: Record<string, { label: string; composition: { unit_type: string; manpower: number }[]; formation_type: string; morale: number; gold_override?: number; prod_override?: number; requires_buildings?: string[] }> = {
  militia: { label: "Milice", composition: [{ unit_type: "MILITIA", manpower: 400 }], formation_type: "UNIT", morale: 55 },
  professional: { label: "Profesionální vojsko", composition: [{ unit_type: "PROFESSIONAL", manpower: 400 }], formation_type: "UNIT", morale: 70, requires_buildings: ["barracks", "smithy"] },
  legion: { label: "Zárodek legie", composition: [{ unit_type: "MILITIA", manpower: 400 }, { unit_type: "PROFESSIONAL", manpower: 400 }], formation_type: "LEGION", morale: 70, gold_override: 80, requires_buildings: ["barracks", "smithy"] },
};

// Mixed recruitment cost: 40% production, 30% wealth
const UNIT_GOLD_FACTOR: Record<string, number> = { MILITIA: 0.8, PROFESSIONAL: 2 };
const UNIT_PROD_FACTOR: Record<string, number> = { MILITIA: 0.5, PROFESSIONAL: 1.5 };
const UNIT_TYPE_LABELS: Record<string, string> = { MILITIA: "Milice", PROFESSIONAL: "Profesionálové" };
const ACTIVE_POP_WEIGHTS = { peasants: 1.0, burghers: 0.7, clerics: 0.2, warriors: 0.9 };
const DEFAULT_ACTIVE_POP_RATIO = 0.5;
const DEFAULT_MAX_MOBILIZATION = 0.3;

function computeActivePopRaw(cities: any[]): number {
  let total = 0;
  for (const c of cities) {
    if (c.status && c.status !== "ok") continue;
    total += (c.population_peasants || 0) * ACTIVE_POP_WEIGHTS.peasants
           + (c.population_burghers || 0) * ACTIVE_POP_WEIGHTS.burghers
           + (c.population_clerics || 0) * ACTIVE_POP_WEIGHTS.clerics
           + (c.population_warriors || 0) * ACTIVE_POP_WEIGHTS.warriors;
  }
  return Math.floor(total);
}

function computeMobilized(cities: any[], mobilizationRate: number): number {
  const activePopRaw = computeActivePopRaw(cities);
  const effectiveActivePop = Math.floor(activePopRaw * Math.max(0.1, Math.min(0.9, DEFAULT_ACTIVE_POP_RATIO)));
  return Math.floor(effectiveActivePop * mobilizationRate);
}

async function executeRecruitStack(
  supabase: any, base: any, actor: Actor, payload: any,
): Promise<CommandResult> {
  const { stackName, presetKey } = payload;
  if (!stackName?.trim()) return { events: [], error: "Missing stackName" };
  if (!presetKey) return { events: [], error: "Missing presetKey" };

  const preset = FORMATION_PRESETS[presetKey];
  if (!preset) return { events: [], error: `Unknown preset: ${presetKey}` };

  const sessionId = base.session_id;
  const turnNumber = base.turn_number;
  const playerName = actor.name;

  // Check building requirements (professional/legion need barracks+smithy)
  if (preset.requires_buildings && preset.requires_buildings.length > 0) {
    const { data: playerCities } = await supabase.from("cities").select("id").eq("session_id", sessionId).eq("owner_player", playerName);
    const { data: buildings } = await supabase
      .from("city_buildings")
      .select("category, status")
      .eq("session_id", sessionId)
      .in("city_id", (playerCities || []).map((c: any) => c.id))
      .eq("status", "completed");

    const builtCategories = new Set((buildings || []).map((b: any) => b.category?.toLowerCase()));
    const missing = preset.requires_buildings.filter(req => !builtCategories.has(req));
    if (missing.length > 0) {
      return { events: [], error: `Chybí budovy: ${missing.join(", ")}. Profesionální vojsko vyžaduje kasárny a kovárnu.` };
    }
  }

  const totalManpower = preset.composition.reduce((s: number, c: any) => s + c.manpower, 0);
  // Mixed cost: wealth (gold) + production
  const totalGold = preset.gold_override ?? preset.composition.reduce((s: number, c: any) => s + c.manpower * (UNIT_GOLD_FACTOR[c.unit_type] || 1), 0);
  const totalProdCost = preset.prod_override ?? preset.composition.reduce((s: number, c: any) => s + c.manpower * (UNIT_PROD_FACTOR[c.unit_type] || 0.5), 0);

  // ── Load realm resources ──
  const { data: realm } = await supabase
    .from("realm_resources").select("*")
    .eq("session_id", sessionId).eq("player_name", playerName).maybeSingle();
  if (!realm) return { events: [], error: "Realm resources not found" };

  // ── Compute mobilization cap ──
  const { data: cities } = await supabase
    .from("cities")
    .select("population_total, population_peasants, population_burghers, population_clerics, population_warriors, status")
    .eq("session_id", sessionId).eq("owner_player", playerName);

  const mobilized = computeMobilized(cities || [], realm.mobilization_rate || 0.1);

  // ── Get actual committed ──
  const { data: existingStacks } = await supabase
    .from("military_stacks").select("id")
    .eq("session_id", sessionId).eq("player_name", playerName).eq("is_active", true);
  const stackIds = (existingStacks || []).map((s: any) => s.id);
  let actualCommitted = 0;
  if (stackIds.length > 0) {
    const { data: comps } = await supabase
      .from("military_stack_composition").select("manpower").in("stack_id", stackIds);
    actualCommitted = (comps || []).reduce((s: number, c: any) => s + (c.manpower || 0), 0);
  }

  const availableManpower = Math.max(0, mobilized - actualCommitted);
  if (totalManpower > availableManpower) {
    return { events: [], error: `Nedostatek mužů: potřeba ${totalManpower}, dostupno ${availableManpower} (mobilizační strop: ${mobilized})` };
  }
  if (totalGold > realm.gold_reserve) {
    return { events: [], error: `Nedostatek zlata: potřeba ${totalGold}, dostupno ${realm.gold_reserve}` };
  }
  // Production cost check against grain reserve (production stored as grain)
  const grainReserve = realm.grain_reserve || 0;
  if (totalProdCost > grainReserve) {
    return { events: [], error: `Nedostatek produkce: potřeba ${Math.round(totalProdCost)}, dostupno ${Math.round(grainReserve)} (zásoby obilí)` };
  }

  // ── Faith morale bonus ──
  const faithMoraleBonus = Math.round((realm.faith || 0) * 0.003 * 10); // Up to +3 morale at faith 100
  const adjustedMorale = Math.min(100, preset.morale + faithMoraleBonus);

  // ── Warrior ratio doctrine bonus ──
  const totalPop = (cities || []).reduce((s: any, c: any) => s + (c.population_total || 0), 0);
  const totalWarriors = (cities || []).reduce((s: any, c: any) => s + (c.population_warriors || 0), 0);
  const warriorRatio = totalPop > 0 ? totalWarriors / totalPop : 0;
  const disciplineBonus = Math.round(warriorRatio * 20); // Warriors 10% → +2 morale
  const finalMorale = Math.min(100, adjustedMorale + disciplineBonus);

  // ── 1. Create stack ──
  const { data: stack, error: stackErr } = await supabase.from("military_stacks").insert({
    session_id: sessionId, player_name: playerName, name: stackName.trim(),
    formation_type: preset.formation_type, morale: finalMorale,
  }).select("id").single();

  if (stackErr || !stack) return { events: [], error: `Stack creation failed: ${stackErr?.message}` };
  const stackId = stack.id;

  // ── 2. Create compositions ──
  for (const comp of preset.composition) {
    await safeInsert(supabase.from("military_stack_composition").insert({
      stack_id: stackId, unit_type: comp.unit_type, manpower: comp.manpower,
    }));
  }

  // ── 3. Update realm resources (mixed cost: gold + production) ──
  const newGold = realm.gold_reserve - totalGold;
  const newGrain = Math.max(0, grainReserve - totalProdCost);
  await supabase.from("realm_resources").update({
    manpower_committed: (realm.manpower_committed || 0) + totalManpower,
    gold_reserve: newGold,
    grain_reserve: newGrain,
  }).eq("id", realm.id);

  // player_resources stockpile sync REMOVED (Sprint 1, Krok 1)
  // Canonical gold_reserve is already updated in realm_resources above.

  // ── 4. Chronicle ──
  const chronicleText = `${playerName} zřídil armádu **${stackName.trim()}** (${preset.label}). Síla: ${totalManpower} mužů, náklady: ${totalGold} zlata + ${Math.round(totalProdCost)} produkce. Morálka: ${finalMorale}.`;
  await safeInsert(supabase.from("chronicle_entries").insert({
    session_id: sessionId, turn_from: turnNumber, turn_to: turnNumber, text: chronicleText,
  }));

  // ── 5. Legacy compat ──
  const mainUnit = preset.composition[0];
  await safeInsert(supabase.from("military_capacity").insert({
    session_id: sessionId, player_name: playerName, army_name: stackName.trim(),
    army_type: UNIT_TYPE_LABELS[mainUnit.unit_type] || mainUnit.unit_type,
    iron_cost: Math.ceil(totalManpower / 200), migrated: true,
  }));

  // ── 6. Event ──
  const events = [{
    ...base,
    event_type: "military",
    note: `${playerName} zřídil armádu ${stackName.trim()} (${preset.label}). Náklady: ${totalGold} 💰 + ${Math.round(totalProdCost)} ⚒️. Morálka: ${finalMorale}.`,
    importance: "normal",
    reference: { stackId, stackName: stackName.trim(), presetKey, totalManpower, totalGold, totalProdCost: Math.round(totalProdCost), morale: finalMorale },
  }];

  return insertEvents(supabase, base.command_id, events, { stackId });
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

async function insertEventsWithChronicle(
  supabase: any,
  commandId: string,
  sessionId: string,
  turnNumber: number,
  events: any[],
  chronicleText?: string,
  sideEffects?: Record<string, any>,
): Promise<CommandResult> {
  const result = await insertEvents(supabase, commandId, events, sideEffects);
  if (result.error) return result;

  if (chronicleText) {
    await safeInsert(supabase.from("chronicle_entries").insert({
      session_id: sessionId,
      turn_from: turnNumber,
      turn_to: turnNumber,
      text: chronicleText,
    }));
  }

  return result;
}

async function safeInsert(query: any) {
  try { await query; } catch (_) { /* non-critical side-effect */ }
}

// ═══════════════════════════════════════════
// PROPOSE_PACT — P2P diplomatic pact proposal
// ═══════════════════════════════════════════

async function executeProposePact(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { targetPlayer, pactType, proclamationText, effects, durationTurns, targetParty } = payload;
  if (!targetPlayer) return { events: [], error: "Missing targetPlayer" };
  if (!pactType) return { events: [], error: "Missing pactType" };

  const validTypes = ["alliance", "open_borders", "defense_pact", "condemnation", "joint_decree", "embargo"];
  if (!validTypes.includes(pactType)) return { events: [], error: `Invalid pactType: ${pactType}` };

  // For embargo, it's unilateral — auto-activate
  const isUnilateral = pactType === "embargo";

  const { data: pact, error: pactErr } = await supabase.from("diplomatic_pacts").insert({
    session_id: sessionId,
    party_a: actor.name,
    party_b: targetPlayer,
    pact_type: pactType,
    target_party: targetParty || null,
    status: isUnilateral ? "active" : "proposed",
    proposed_by: actor.name,
    proposed_turn: turnNumber,
    accepted_turn: isUnilateral ? turnNumber : null,
    proclamation_text: proclamationText || `${actor.name} navrhuje ${pactType} s ${targetPlayer}.`,
    effects: effects || {},
    expires_turn: durationTurns ? turnNumber + durationTurns : null,
  }).select("id").single();

  if (pactErr) return { events: [], error: `Pact creation failed: ${pactErr.message}` };

  // Embargo side-effects: block trade routes
  if (pactType === "embargo") {
    await supabase.from("trade_routes").update({ status: "embargoed" })
      .eq("session_id", sessionId)
      .or(`and(from_player.eq.${actor.name},to_player.eq.${targetPlayer}),and(from_player.eq.${targetPlayer},to_player.eq.${actor.name})`)
      .eq("status", "active");
  }

  // Condemnation: apply disposition penalty to target
  if (pactType === "condemnation" && targetParty && isUnilateral) {
    const { data: targetFaction } = await supabase.from("ai_factions").select("id, disposition")
      .eq("session_id", sessionId).eq("faction_name", targetParty).maybeSingle();
    if (targetFaction) {
      const disp = { ...(targetFaction.disposition as Record<string, number> || {}) };
      disp[actor.name] = Math.max(-100, (disp[actor.name] || 0) - 10);
      disp[targetPlayer] = Math.max(-100, (disp[targetPlayer] || 0) - 10);
      await supabase.from("ai_factions").update({ disposition: disp }).eq("id", targetFaction.id);
    }
  }

  const pactLabels: Record<string, string> = {
    alliance: "spojenectví", open_borders: "otevření hranic", defense_pact: "obranný pakt",
    condemnation: "odsouzení", joint_decree: "společný dekret", embargo: "embargo",
  };

  const chronicleText = `${actor.name} ${isUnilateral ? "uvalil" : "navrhl"} ${pactLabels[pactType] || pactType} ${isUnilateral ? "na" : "s"} ${targetPlayer}.${targetParty ? ` Cíl: ${targetParty}.` : ""}`;

  await safeInsert(supabase.from("chronicle_entries").insert({
    session_id: sessionId, turn_from: turnNumber, turn_to: turnNumber,
    text: chronicleText, source_type: "system",
  }));

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "diplomacy",
    note: chronicleText,
    importance: "critical",
    reference: { pactId: pact.id, pactType, targetPlayer, targetParty },
  }], undefined, { pactId: pact.id });
}

// ═══════════════════════════════════════════
// ACCEPT_PACT — Accept a proposed pact
// ═══════════════════════════════════════════

async function executeAcceptPact(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { pactId } = payload;
  if (!pactId) return { events: [], error: "Missing pactId" };

  const { data: pact } = await supabase.from("diplomatic_pacts")
    .select("*").eq("id", pactId).eq("session_id", sessionId).single();

  if (!pact) return { events: [], error: "Pact not found" };
  if (pact.status !== "proposed") return { events: [], error: "Pact not in proposed state" };
  if (pact.party_b !== actor.name && pact.party_a !== actor.name) return { events: [], error: "Not your pact to accept" };

  await supabase.from("diplomatic_pacts").update({
    status: "active", accepted_turn: turnNumber,
  }).eq("id", pactId);

  const pactLabels: Record<string, string> = {
    alliance: "Spojenectví", open_borders: "Otevření hranic", defense_pact: "Obranný pakt",
    condemnation: "Odsouzení", joint_decree: "Společný dekret",
  };

  const chronicleText = `🤝 ${pactLabels[pact.pact_type] || pact.pact_type} mezi ${pact.party_a} a ${pact.party_b} bylo přijato a vstupuje v platnost.${pact.target_party ? ` Cíl: ${pact.target_party}.` : ""}`;

  await safeInsert(supabase.from("chronicle_entries").insert({
    session_id: sessionId, turn_from: turnNumber, turn_to: turnNumber,
    text: chronicleText, source_type: "system",
  }));

  // Apply condemnation effects on accept
  if (pact.pact_type === "condemnation" && pact.target_party) {
    const { data: targetFaction } = await supabase.from("ai_factions").select("id, disposition")
      .eq("session_id", sessionId).eq("faction_name", pact.target_party).maybeSingle();
    if (targetFaction) {
      const disp = { ...(targetFaction.disposition as Record<string, number> || {}) };
      disp[pact.party_a] = Math.max(-100, (disp[pact.party_a] || 0) - 10);
      disp[pact.party_b] = Math.max(-100, (disp[pact.party_b] || 0) - 10);
      await supabase.from("ai_factions").update({ disposition: disp }).eq("id", targetFaction.id);
    }
  }

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "diplomacy",
    note: chronicleText,
    importance: "critical",
    reference: { pactId, pactType: pact.pact_type, partyA: pact.party_a, partyB: pact.party_b },
  }], undefined, { pactId });
}

// ═══════════════════════════════════════════
// REJECT_PACT — Reject a proposed pact
// ═══════════════════════════════════════════

async function executeRejectPact(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { pactId } = payload;
  if (!pactId) return { events: [], error: "Missing pactId" };

  const { data: pact } = await supabase.from("diplomatic_pacts")
    .select("*").eq("id", pactId).eq("session_id", sessionId).single();

  if (!pact) return { events: [], error: "Pact not found" };
  if (pact.status !== "proposed") return { events: [], error: "Pact not in proposed state" };

  await supabase.from("diplomatic_pacts").update({ status: "rejected" }).eq("id", pactId);

  const note = `${actor.name} odmítl nabídku ${pact.pact_type} od ${pact.proposed_by}.`;

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "diplomacy",
    note,
    importance: "normal",
    reference: { pactId, pactType: pact.pact_type },
  }]);
}

// ═══════════════════════════════════════════
// LIFT_EMBARGO — Remove an active embargo
// ═══════════════════════════════════════════

async function executeLiftEmbargo(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { pactId, targetPlayer } = payload;

  let embargoId = pactId;

  // Find embargo by target if no pactId
  if (!embargoId && targetPlayer) {
    const { data: embargo } = await supabase.from("diplomatic_pacts")
      .select("id").eq("session_id", sessionId).eq("pact_type", "embargo").eq("status", "active")
      .or(`and(party_a.eq.${actor.name},party_b.eq.${targetPlayer}),and(party_a.eq.${targetPlayer},party_b.eq.${actor.name})`)
      .maybeSingle();
    embargoId = embargo?.id;
  }

  if (!embargoId) return { events: [], error: "No active embargo found" };

  // Mark as broken (triggers post-embargo penalty via physics.ts)
  await supabase.from("diplomatic_pacts").update({ status: "broken" }).eq("id", embargoId);

  // Unblock trade routes (but with lingering penalty from pact status)
  await supabase.from("trade_routes").update({ status: "active" })
    .eq("session_id", sessionId).eq("status", "embargoed")
    .or(`and(from_player.eq.${actor.name},to_player.eq.${targetPlayer || ""}),and(from_player.eq.${targetPlayer || ""},to_player.eq.${actor.name})`);

  const note = `${actor.name} zrušil embargo${targetPlayer ? ` vůči ${targetPlayer}` : ""}. Obchodní cesty obnoveny s penalizací -30%.`;

  await safeInsert(supabase.from("chronicle_entries").insert({
    session_id: sessionId, turn_from: turnNumber, turn_to: turnNumber,
    text: note, source_type: "system",
  }));

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "trade",
    note,
    importance: "normal",
    reference: { pactId: embargoId, action: "lift_embargo", targetPlayer },
  }]);
}

// ═══════════════════════════════════════════
// MOVE_STACK_ROUTE — route-based strategic movement
// ═══════════════════════════════════════════

async function executeMoveStackRoute(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { stackId, targetNodeId, routeId } = payload;
  if (!stackId) return { events: [], error: "Missing stackId" };
  if (!targetNodeId) return { events: [], error: "Missing targetNodeId" };

  // Verify stack
  const { data: stack } = await supabase.from("military_stacks")
    .select("id, player_name, current_node_id, travel_route_id, hex_q, hex_r")
    .eq("id", stackId).eq("session_id", sessionId).single();

  if (!stack) return { events: [], error: "Stack not found" };
  if (stack.player_name !== actor.name) return { events: [], error: "Not your stack" };
  if (stack.travel_route_id) return { events: [], error: "Stack is already in transit" };

  // Find the route connecting current node to target
  const fromNodeId = stack.current_node_id;
  if (!fromNodeId) return { events: [], error: "Stack is not at a strategic node — use hex movement or assign to node first" };

  let selectedRouteId = routeId;
  if (!selectedRouteId) {
    // Auto-find route between nodes
    const { data: foundRoutes } = await supabase.from("province_routes")
      .select("id, control_state, capacity_value, route_type, metadata")
      .eq("session_id", sessionId)
      .or(`and(node_a.eq.${fromNodeId},node_b.eq.${targetNodeId}),and(node_a.eq.${targetNodeId},node_b.eq.${fromNodeId})`);

    if (!foundRoutes || foundRoutes.length === 0) return { events: [], error: "No route between these nodes" };
    const openRoute = foundRoutes.find((r: any) => r.control_state !== "blocked");
    if (!openRoute) return { events: [], error: "All routes are blocked" };
    selectedRouteId = openRoute.id;
  }

  // Verify route exists and is not blocked
  const { data: route } = await supabase.from("province_routes")
    .select("id, node_a, node_b, control_state, capacity_value, route_type, metadata")
    .eq("id", selectedRouteId).eq("session_id", sessionId).single();

  if (!route) return { events: [], error: "Route not found" };
  if (route.control_state === "blocked") return { events: [], error: "Route is blocked" };

  // Verify route connects current node to target
  const nodeSet = new Set([route.node_a, route.node_b]);
  if (!nodeSet.has(fromNodeId) || !nodeSet.has(targetNodeId)) {
    return { events: [], error: "Route does not connect source and target nodes" };
  }

  // Get target node name for narrative
  const { data: targetNode } = await supabase.from("province_nodes")
    .select("name, hex_q, hex_r").eq("id", targetNodeId).single();

  // Update stack: set travel state + stance
  await supabase.from("military_stacks").update({
    travel_route_id: selectedRouteId,
    travel_target_node_id: targetNodeId,
    travel_progress: 0,
    travel_departed_turn: turnNumber,
    moved_this_turn: true,
    stance: "marching",
  }).eq("id", stackId);

  const routeLabels: Record<string, string> = {
    land_road: "silnici", river_route: "říční cestu", sea_lane: "námořní trasu",
    mountain_pass: "horský průsmyk", caravan_route: "karavanní stezku",
  };

  const note = `${actor.name} vyslal armádu ${payload.stackName || ""} po ${routeLabels[route.route_type] || "cestě"} směrem k ${targetNode?.name || "cíli"}.`;

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "military",
    note,
    importance: "normal",
    reference: { ...payload, routeType: route.route_type, targetNodeName: targetNode?.name },
  }], payload.chronicleText);
}

// ═══════════════════════════════════════════
// BUILD_ROUTE — construct new route between nodes
// ═══════════════════════════════════════════

async function executeBuildRoute(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { nodeAId, nodeBId, routeType } = payload;
  if (!nodeAId || !nodeBId) return { events: [], error: "Missing nodeAId or nodeBId" };

  // Verify both nodes exist and at least one is controlled by actor
  const { data: nodeA } = await supabase.from("province_nodes")
    .select("id, name, controlled_by, province_id").eq("id", nodeAId).eq("session_id", sessionId).single();
  const { data: nodeB } = await supabase.from("province_nodes")
    .select("id, name, controlled_by, province_id").eq("id", nodeBId).eq("session_id", sessionId).single();

  if (!nodeA || !nodeB) return { events: [], error: "Node not found" };
  if (nodeA.controlled_by !== actor.name && nodeB.controlled_by !== actor.name) {
    return { events: [], error: "You must control at least one endpoint node" };
  }

  // Check no existing route
  const ordA = nodeAId < nodeBId ? nodeAId : nodeBId;
  const ordB = nodeAId < nodeBId ? nodeBId : nodeAId;
  const { data: existing } = await supabase.from("province_routes")
    .select("id").eq("session_id", sessionId).eq("node_a", ordA).eq("node_b", ordB).maybeSingle();
  if (existing) return { events: [], error: "Route already exists between these nodes" };

  const buildCostMap: Record<string, number> = {
    land_road: 50, river_route: 30, sea_lane: 20, mountain_pass: 80, caravan_route: 60,
  };
  const type = routeType || "land_road";
  const cost = buildCostMap[type] || 50;

  // Deduct gold
  const { data: realm } = await supabase.from("realm_resources")
    .select("id, gold_reserve").eq("session_id", sessionId).eq("player_name", actor.name).single();
  if (!realm || realm.gold_reserve < cost) return { events: [], error: `Nedostatek zlata (potřeba: ${cost})` };

  await supabase.from("realm_resources").update({ gold_reserve: realm.gold_reserve - cost }).eq("id", realm.id);

  // Insert route
  await supabase.from("province_routes").insert({
    session_id: sessionId,
    node_a: ordA, node_b: ordB,
    route_type: type,
    capacity_value: 5,
    military_relevance: 3, economic_relevance: 3,
    vulnerability_score: 4,
    control_state: "open",
    build_cost: cost, upgrade_level: 1,
    metadata: { built_by: actor.name, built_turn: turnNumber },
  });

  const note = `${actor.name} vybudoval ${type === "land_road" ? "silnici" : type} mezi ${nodeA.name} a ${nodeB.name} za ${cost} zlata.`;

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "construction",
    note, importance: "normal",
    reference: { nodeAId, nodeBId, routeType: type, cost },
  }], payload.chronicleText);
}

// ═══════════════════════════════════════════
// UPGRADE_ROUTE — improve an existing route
// ═══════════════════════════════════════════

async function executeUpgradeRoute(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { routeId } = payload;
  if (!routeId) return { events: [], error: "Missing routeId" };

  const { data: route } = await supabase.from("province_routes")
    .select("id, node_a, node_b, upgrade_level, build_cost, route_type, capacity_value")
    .eq("id", routeId).eq("session_id", sessionId).single();
  if (!route) return { events: [], error: "Route not found" };

  const upgradeCost = Math.round(route.build_cost * 0.5 * (route.upgrade_level + 1));

  const { data: realm } = await supabase.from("realm_resources")
    .select("id, gold_reserve").eq("session_id", sessionId).eq("player_name", actor.name).single();
  if (!realm || realm.gold_reserve < upgradeCost) return { events: [], error: `Nedostatek zlata (potřeba: ${upgradeCost})` };

  await supabase.from("realm_resources").update({ gold_reserve: realm.gold_reserve - upgradeCost }).eq("id", realm.id);

  await supabase.from("province_routes").update({
    upgrade_level: route.upgrade_level + 1,
    capacity_value: route.capacity_value + 2,
  }).eq("id", routeId);

  const note = `${actor.name} vylepšil trasu na úroveň ${route.upgrade_level + 1} za ${upgradeCost} zlata.`;

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "construction", note, importance: "normal",
    reference: { routeId, newLevel: route.upgrade_level + 1, cost: upgradeCost },
  }], payload.chronicleText);
}

// ═══════════════════════════════════════════
// FORTIFY_NODE — assign garrison to a strategic node
// ═══════════════════════════════════════════

async function executeFortifyNode(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { nodeId, stackId } = payload;
  if (!nodeId) return { events: [], error: "Missing nodeId" };

  const { data: node } = await supabase.from("province_nodes")
    .select("id, name, province_id, controlled_by")
    .eq("id", nodeId).eq("session_id", sessionId).single();
  if (!node) return { events: [], error: "Node not found" };

  // If assigning a stack as garrison
  if (stackId) {
    const { data: stack } = await supabase.from("military_stacks")
      .select("id, player_name, power, name").eq("id", stackId).eq("session_id", sessionId).single();
    if (!stack) return { events: [], error: "Stack not found" };
    if (stack.player_name !== actor.name) return { events: [], error: "Not your stack" };

    // Set stack's current node, stance and update node control
    await supabase.from("military_stacks").update({
      current_node_id: nodeId,
      stance: "defending",
    }).eq("id", stackId);

    await supabase.from("province_nodes").update({
      controlled_by: actor.name,
      garrison_strength: stack.power || 0,
    }).eq("id", nodeId);

    const note = `${actor.name} opevnil ${node.name} armádou ${stack.name}.`;

    return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
      ...base,
      event_type: "military", note, importance: "normal",
      reference: { nodeId, stackId, nodeName: node.name },
    }], payload.chronicleText);
  }

  // Claim uncontrolled node
  if (!node.controlled_by) {
    await supabase.from("province_nodes").update({ controlled_by: actor.name }).eq("id", nodeId);
    const note = `${actor.name} převzal kontrolu nad ${node.name}.`;
    return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
      ...base,
      event_type: "military", note, importance: "normal",
      reference: { nodeId, nodeName: node.name },
    }], payload.chronicleText);
  }

  return { events: [], error: "Node is already controlled by another player" };
}

// ═══════════════════════════════════════════
// BLOCKADE_ROUTE — block a route with a military stack
// ═══════════════════════════════════════════

async function executeBlockadeRoute(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { stackId, routeId } = payload;
  if (!stackId || !routeId) return { events: [], error: "Missing stackId or routeId" };

  const { data: stack } = await supabase.from("military_stacks")
    .select("id, player_name, name, current_node_id")
    .eq("id", stackId).eq("session_id", sessionId).single();
  if (!stack) return { events: [], error: "Stack not found" };
  if (stack.player_name !== actor.name) return { events: [], error: "Not your stack" };

  const { data: route } = await supabase.from("province_routes")
    .select("id, node_a, node_b, control_state, blocked_by")
    .eq("id", routeId).eq("session_id", sessionId).single();
  if (!route) return { events: [], error: "Route not found" };

  // Stack must be at one of the route endpoints
  if (stack.current_node_id !== route.node_a && stack.current_node_id !== route.node_b) {
    return { events: [], error: "Stack must be at one of the route endpoints to blockade" };
  }

  const blockedBy = [...(route.blocked_by || []), actor.name];
  await supabase.from("province_routes").update({
    control_state: "blocked",
    blocked_by: blockedBy,
  }).eq("id", routeId);

  await supabase.from("military_stacks").update({
    stance: "intercepting",
    blockading_route_id: routeId,
  }).eq("id", stackId);

  const note = `${actor.name} zablokoval cestu armádou ${stack.name}.`;
  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base, event_type: "military", note, importance: "normal",
    reference: { stackId, routeId, action: "blockade" },
  }], payload.chronicleText);
}

// ═══════════════════════════════════════════
// AMBUSH_ROUTE — set ambush on a route
// ═══════════════════════════════════════════

async function executeAmbushRoute(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { stackId, routeId } = payload;
  if (!stackId || !routeId) return { events: [], error: "Missing stackId or routeId" };

  const { data: stack } = await supabase.from("military_stacks")
    .select("id, player_name, name, current_node_id")
    .eq("id", stackId).eq("session_id", sessionId).single();
  if (!stack) return { events: [], error: "Stack not found" };
  if (stack.player_name !== actor.name) return { events: [], error: "Not your stack" };

  const { data: route } = await supabase.from("province_routes")
    .select("id, node_a, node_b")
    .eq("id", routeId).eq("session_id", sessionId).single();
  if (!route) return { events: [], error: "Route not found" };

  if (stack.current_node_id !== route.node_a && stack.current_node_id !== route.node_b) {
    return { events: [], error: "Stack must be at a route endpoint to set ambush" };
  }

  await supabase.from("province_routes").update({
    ambush_stack_id: stackId,
  }).eq("id", routeId);

  await supabase.from("military_stacks").update({
    stance: "intercepting",
  }).eq("id", stackId);

  const note = `${actor.name} nastražil léčku na cestě armádou ${stack.name}.`;
  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base, event_type: "military", note, importance: "normal",
    reference: { stackId, routeId, action: "ambush" },
  }], payload.chronicleText);
}

// ═══════════════════════════════════════════
// SIEGE_NODE — begin siege of a strategic node
// ═══════════════════════════════════════════

async function executeSiegeNode(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { stackId, nodeId } = payload;
  if (!stackId || !nodeId) return { events: [], error: "Missing stackId or nodeId" };

  const { data: stack } = await supabase.from("military_stacks")
    .select("id, player_name, name, current_node_id")
    .eq("id", stackId).eq("session_id", sessionId).single();
  if (!stack) return { events: [], error: "Stack not found" };
  if (stack.player_name !== actor.name) return { events: [], error: "Not your stack" };

  const { data: node } = await supabase.from("province_nodes")
    .select("id, name, controlled_by, garrison_strength, fortification_level, besieged_by")
    .eq("id", nodeId).eq("session_id", sessionId).single();
  if (!node) return { events: [], error: "Node not found" };
  if (node.controlled_by === actor.name) return { events: [], error: "You already control this node" };
  if (node.besieged_by) return { events: [], error: "Node is already under siege" };

  // Stack must be at the node or adjacent (at a route endpoint)
  if (stack.current_node_id !== nodeId) {
    // Check if stack is at a connected node
    const { data: connRoutes } = await supabase.from("province_routes")
      .select("id")
      .eq("session_id", sessionId)
      .or(`and(node_a.eq.${stack.current_node_id},node_b.eq.${nodeId}),and(node_a.eq.${nodeId},node_b.eq.${stack.current_node_id})`);
    if (!connRoutes || connRoutes.length === 0) {
      return { events: [], error: "Stack must be at or adjacent to the node to siege" };
    }
  }

  await supabase.from("province_nodes").update({
    besieged_by: actor.name,
    besieging_stack_id: stackId,
    siege_turn_start: turnNumber,
  }).eq("id", nodeId);

  await supabase.from("military_stacks").update({
    stance: "besieging",
    current_node_id: nodeId,
  }).eq("id", stackId);

  const note = `${actor.name} zahájil obléhání ${node.name} armádou ${stack.name}.`;
  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base, event_type: "military", note, importance: "critical",
    reference: { stackId, nodeId, nodeName: node.name, action: "siege" },
  }], payload.chronicleText);
}

// ═══════════════════════════════════════════
// DISRUPT_ROUTE — damage a route (sabotage)
// ═══════════════════════════════════════════

async function executeDisruptRoute(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { routeId, stackId } = payload;
  if (!routeId) return { events: [], error: "Missing routeId" };

  const { data: route } = await supabase.from("province_routes")
    .select("id, node_a, node_b, damage_level, control_state, capacity_value")
    .eq("id", routeId).eq("session_id", sessionId).single();
  if (!route) return { events: [], error: "Route not found" };

  // Verify stack is at endpoint if provided
  if (stackId) {
    const { data: stack } = await supabase.from("military_stacks")
      .select("current_node_id, player_name")
      .eq("id", stackId).eq("session_id", sessionId).single();
    if (!stack || stack.player_name !== actor.name) return { events: [], error: "Invalid stack" };
    if (stack.current_node_id !== route.node_a && stack.current_node_id !== route.node_b) {
      return { events: [], error: "Stack must be at a route endpoint" };
    }
  }

  const newDamage = Math.min(10, (route.damage_level || 0) + 3);
  const newState = newDamage >= 8 ? "blocked" : newDamage >= 4 ? "damaged" : route.control_state;
  const capacityPenalty = Math.max(1, route.capacity_value - 2);

  await supabase.from("province_routes").update({
    damage_level: newDamage,
    control_state: newState,
    capacity_value: capacityPenalty,
  }).eq("id", routeId);

  const note = `${actor.name} poškodil cestu (poškození: ${newDamage}/10). ${newState === "blocked" ? "Cesta je neprůchodná!" : ""}`;
  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base, event_type: "military", note, importance: newState === "blocked" ? "critical" : "normal",
    reference: { routeId, damageLevel: newDamage, action: "disrupt" },
  }], payload.chronicleText);
}

// ═══════════════════════════════════════════
// START_PROJECT — begin a node/route construction project
// ═══════════════════════════════════════════

const PROJECT_TEMPLATES: Record<string, { name: string; totalTurns: number; costProduction: number; costWealth: number; capacityReq: number }> = {
  build_route: { name: "Stavba cesty", totalTurns: 3, costProduction: 40, costWealth: 30, capacityReq: 5 },
  upgrade_route: { name: "Vylepšení cesty", totalTurns: 2, costProduction: 25, costWealth: 20, capacityReq: 8 },
  create_fort: { name: "Stavba pevnosti", totalTurns: 5, costProduction: 100, costWealth: 60, capacityReq: 15 },
  create_port: { name: "Stavba přístavu", totalTurns: 4, costProduction: 80, costWealth: 50, capacityReq: 12 },
  expand_hub: { name: "Rozšíření centra", totalTurns: 3, costProduction: 50, costWealth: 40, capacityReq: 10 },
  repair_route: { name: "Oprava cesty", totalTurns: 2, costProduction: 20, costWealth: 10, capacityReq: 3 },
};

async function executeStartProject(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { projectType, nodeId, routeId, targetNodeId, provinceId, customName } = payload;
  if (!projectType) return { events: [], error: "Missing projectType" };

  const template = PROJECT_TEMPLATES[projectType];
  if (!template) return { events: [], error: `Unknown project type: ${projectType}` };

  // Check player has enough resources (new civilizational economy)
  const { data: realm } = await supabase.from("realm_resources")
    .select("gold_reserve, production_reserve, total_capacity")
    .eq("session_id", sessionId).eq("player_name", actor.name).maybeSingle();

  if (realm) {
    if ((realm.production_reserve || 0) < template.costProduction) return { events: [], error: `Nedostatek produkce (${realm.production_reserve || 0}/${template.costProduction})` };
    if ((realm.gold_reserve || 0) < template.costWealth) return { events: [], error: `Nedostatek bohatství (${realm.gold_reserve || 0}/${template.costWealth})` };
    if ((realm.total_capacity || 0) < template.capacityReq) return { events: [], error: `Nedostatečná kapacita (${realm.total_capacity || 0}/${template.capacityReq})` };

    // Deduct production + wealth (capacity is a throughput limit, not consumed)
    await supabase.from("realm_resources").update({
      production_reserve: (realm.production_reserve || 0) - template.costProduction,
      gold_reserve: (realm.gold_reserve || 0) - template.costWealth,
    }).eq("session_id", sessionId).eq("player_name", actor.name);
  }

  // Create project
  const { data: project, error: projErr } = await supabase.from("node_projects").insert({
    session_id: sessionId,
    project_type: projectType,
    province_id: provinceId || null,
    node_id: nodeId || null,
    route_id: routeId || null,
    target_node_id: targetNodeId || null,
    initiated_by: actor.name,
    name: customName || template.name,
    cost_gold: template.costWealth,
    cost_wood: 0,
    cost_stone: 0,
    cost_iron: 0,
    total_turns: template.totalTurns,
    created_turn: turnNumber,
    status: "active",
  }).select("id").single();

  if (projErr) return { events: [], error: `Project creation failed: ${projErr.message}` };

  const note = `${actor.name} zahájil projekt: ${customName || template.name}. Dokončení za ${template.totalTurns} kol.`;
  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base, event_type: "construction", note, importance: "normal",
    reference: { projectId: project.id, projectType, nodeId, routeId, targetNodeId },
  }], payload.chronicleText, { projectId: project.id });
}

// ═══════════════════════════════════════════
// CANCEL_PROJECT — cancel an active project (no refund)
// ═══════════════════════════════════════════

async function executeCancelProject(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { projectId } = payload;
  if (!projectId) return { events: [], error: "Missing projectId" };

  const { data: project } = await supabase.from("node_projects")
    .select("id, initiated_by, name, status")
    .eq("id", projectId).eq("session_id", sessionId).single();

  if (!project) return { events: [], error: "Project not found" };
  if (project.initiated_by !== actor.name) return { events: [], error: "Not your project" };
  if (project.status !== "active") return { events: [], error: "Project is not active" };

  await supabase.from("node_projects").update({ status: "cancelled" }).eq("id", projectId);

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base, event_type: "construction", note: `${actor.name} zrušil projekt: ${project.name}.`, importance: "normal",
    reference: { projectId, action: "cancel" },
  }], payload.chronicleText);
}

// ═══════════════════════════════════════════
// MILITARY MUTATIONS — Sprint A best-effort transactional path
// (Sprint B will move these into typed PL/pgSQL RPCs.)
// ═══════════════════════════════════════════

const LEGION_GOLD_COST = 200;
const ARMY_GOLD_COST = 500;

async function getRealm(supabase: any, sessionId: string, playerName: string) {
  const { data } = await supabase.from("realm_resources")
    .select("id, manpower_committed, gold_reserve, mobilization_rate")
    .eq("session_id", sessionId).eq("player_name", playerName).maybeSingle();
  return data;
}

async function executeRemobilizeStack(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { stackId, stackName, manpower } = payload;
  if (!stackId || !manpower) return { events: [], error: "Missing stackId or manpower" };

  const realm = await getRealm(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };

  await supabase.from("military_stacks").update({
    is_active: true,
    demobilized_turn: null,
    remobilize_ready_turn: null,
    morale: 30,
  }).eq("id", stackId).eq("player_name", actor.name);

  await supabase.from("realm_resources").update({
    manpower_committed: (realm.manpower_committed || 0) + manpower,
  }).eq("id", realm.id);

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base, event_type: "military",
    note: payload.note || `${actor.name} reaktivoval ${stackName}.`,
    importance: "normal", reference: payload,
  }], payload.chronicleText);
}

async function executeDisbandStack(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { stackId, stackName, returnedManpower } = payload;
  if (!stackId) return { events: [], error: "Missing stackId" };

  const realm = await getRealm(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };

  await supabase.from("military_stacks").update({ is_active: false })
    .eq("id", stackId).eq("player_name", actor.name);

  await supabase.from("realm_resources").update({
    manpower_committed: Math.max(0, (realm.manpower_committed || 0) - (returnedManpower || 0)),
  }).eq("id", realm.id);

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base, event_type: "military",
    note: payload.note || `${actor.name} rozpustil ${stackName}.`,
    importance: "normal", reference: payload,
  }], payload.chronicleText);
}

async function executeUpgradeFormation(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { stackId, stackName, target } = payload;
  if (!stackId || !target) return { events: [], error: "Missing stackId or target" };

  const cost = target === "LEGION" ? LEGION_GOLD_COST : target === "ARMY" ? ARMY_GOLD_COST : 0;
  const realm = await getRealm(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };
  if ((realm.gold_reserve || 0) < cost) {
    return { events: [], error: `Nedostatek zlata (potřeba ${cost})` };
  }

  await supabase.from("military_stacks").update({ formation_type: target })
    .eq("id", stackId).eq("player_name", actor.name);

  if (cost > 0) {
    await supabase.from("realm_resources").update({
      gold_reserve: (realm.gold_reserve || 0) - cost,
    }).eq("id", realm.id);
  }

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base, event_type: "military",
    note: payload.note || `${actor.name} povýšil ${stackName} na ${target}.`,
    importance: "normal", reference: { ...payload, cost },
  }], payload.chronicleText);
}

async function executeAssignGeneral(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { stackId, stackName, generalId, generalName } = payload;
  if (!stackId || !generalId) return { events: [], error: "Missing stackId or generalId" };

  // Unassign general from any other stack first
  await supabase.from("military_stacks").update({ general_id: null })
    .eq("general_id", generalId).eq("session_id", sessionId);

  await supabase.from("military_stacks").update({ general_id: generalId })
    .eq("id", stackId).eq("player_name", actor.name);

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base, event_type: "military",
    note: payload.note || `${actor.name} jmenoval ${generalName} velitelem ${stackName}.`,
    importance: "normal", reference: payload,
  }], payload.chronicleText);
}

async function executeReinforceStack(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { stackId, stackName, reinforcements, addedManpower, addedGold } = payload;
  if (!stackId) return { events: [], error: "Missing stackId" };

  const realm = await getRealm(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };
  if ((realm.gold_reserve || 0) < (addedGold || 0)) {
    return { events: [], error: "Nedostatek zlata" };
  }

  // reinforcements: { unit_type: amount, ... }
  if (reinforcements && typeof reinforcements === "object") {
    const { data: existingComps } = await supabase
      .from("military_stack_composition")
      .select("id, unit_type, manpower")
      .eq("stack_id", stackId);
    const compMap = new Map((existingComps || []).map((c: any) => [c.unit_type, c]));

    for (const [unitType, amount] of Object.entries(reinforcements)) {
      const amt = Number(amount);
      if (amt <= 0) continue;
      const existing = compMap.get(unitType) as any;
      if (existing) {
        await supabase.from("military_stack_composition")
          .update({ manpower: existing.manpower + amt })
          .eq("id", existing.id);
      } else {
        await supabase.from("military_stack_composition")
          .insert({ stack_id: stackId, unit_type: unitType, manpower: amt });
      }
    }
  }

  await supabase.from("realm_resources").update({
    manpower_committed: (realm.manpower_committed || 0) + (addedManpower || 0),
    gold_reserve: (realm.gold_reserve || 0) - (addedGold || 0),
  }).eq("id", realm.id);

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base, event_type: "military",
    note: payload.note || `${actor.name} posílil ${stackName}.`,
    importance: "normal", reference: payload,
  }], payload.chronicleText);
}

async function executeDemobilizeStack(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { stackIds, returnedManpower, readyTurn } = payload;
  if (!stackIds || !Array.isArray(stackIds) || stackIds.length === 0) {
    return { events: [], error: "Missing stackIds" };
  }

  const realm = await getRealm(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };

  await supabase.from("military_stacks").update({
    is_active: false,
    demobilized_turn: turnNumber,
    remobilize_ready_turn: readyTurn || (turnNumber + 3),
  }).in("id", stackIds).eq("player_name", actor.name);

  await supabase.from("realm_resources").update({
    manpower_committed: Math.max(0, (realm.manpower_committed || 0) - (returnedManpower || 0)),
  }).eq("id", realm.id);

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base, event_type: "military",
    note: payload.note || `${actor.name} demobilizoval ${stackIds.length} jednotek.`,
    importance: "normal", reference: payload,
  }], payload.chronicleText);
}

async function executeSetMobilization(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { rate, manpowerPool } = payload;
  if (typeof rate !== "number" || rate < 0 || rate > 0.5) {
    return { events: [], error: "Invalid mobilization rate (0–0.5)" };
  }

  const realm = await getRealm(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };

  const update: any = { mobilization_rate: rate };
  if (typeof manpowerPool === "number") update.manpower_pool = manpowerPool;
  await supabase.from("realm_resources").update(update).eq("id", realm.id);

  return insertEvents(supabase, commandId, [{
    ...base, event_type: "policy",
    note: payload.note || `${actor.name} nastavil mobilizaci na ${Math.round(rate * 100)}%.`,
    importance: "normal", reference: payload,
  }]);
}

// ═══════════════════════════════════════════
// SPRINT B — City / Council / Fiscal commands
// ═══════════════════════════════════════════

async function getRealmFull(supabase: any, sessionId: string, playerName: string) {
  const { data } = await supabase.from("realm_resources")
    .select("*")
    .eq("session_id", sessionId).eq("player_name", playerName).maybeSingle();
  return data;
}

/**
 * BUILD_BUILDING — full server-side: deduct resources, insert city_buildings row, emit event.
 * Payload: { cityId, cityName, template?, ai? (full building data), chronicleText? }
 */
async function executeBuildBuilding(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { cityId, cityName, building, isAiGenerated, chronicleText } = payload;
  if (!cityId || !building) return { events: [], error: "Missing cityId or building" };

  const realm = await getRealmFull(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };

  const costGold = building.cost_wealth || 0;
  const prodCost = (building.cost_wood || 0) + (building.cost_stone || 0) + (building.cost_iron || 0);

  if ((realm.gold_reserve || 0) < costGold) return { events: [], error: `Nedostatek zlata (potřeba ${costGold})` };
  if ((realm.production_reserve || 0) < prodCost) return { events: [], error: `Nedostatek produkce (potřeba ${prodCost})` };

  // Deduct
  await supabase.from("realm_resources").update({
    gold_reserve: (realm.gold_reserve || 0) - costGold,
    production_reserve: Math.max(0, (realm.production_reserve || 0) - prodCost),
  }).eq("id", realm.id);

  // Insert building
  const buildDuration = building.build_duration || building.build_turns || 1;
  const { data: inserted, error: insertErr } = await supabase.from("city_buildings").insert({
    session_id: sessionId,
    city_id: cityId,
    template_id: building.template_id || null,
    name: building.name,
    description: building.description || "",
    category: building.category || "economic",
    cost_wealth: costGold,
    cost_wood: building.cost_wood || 0,
    cost_stone: building.cost_stone || 0,
    cost_iron: building.cost_iron || 0,
    build_duration: buildDuration,
    build_started_turn: turnNumber,
    effects: building.effects || {},
    flavor_text: building.flavor_text || null,
    founding_myth: building.founding_myth || null,
    image_prompt: building.image_prompt || null,
    image_url: building.image_url || null,
    is_ai_generated: !!isAiGenerated,
    is_arena: building.is_arena || false,
    building_tags: building.building_tags || null,
    status: buildDuration <= 1 ? "completed" : "building",
    completed_turn: buildDuration <= 1 ? turnNumber : null,
    current_level: 1,
    max_level: building.max_level || (isAiGenerated ? 5 : 3),
    level_data: building.level_data || [],
  }).select("id").single();

  if (insertErr) return { events: [], error: `Insert failed: ${insertErr.message}` };

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "construction",
    city_id: cityId,
    note: payload.note || `Stavba ${building.name} v ${cityName}.`,
    importance: "normal",
    reference: { buildingId: inserted.id, buildingName: building.name, cityId, cityName },
  }], chronicleText, { buildingId: inserted.id });
}

/**
 * UPGRADE_BUILDING — deduct resources, update city_buildings level/effects.
 * Payload: { cityId, cityName, buildingId, newLevel, newName, newEffects, costs, isWonderConversion?, wonderData? }
 */
async function executeUpgradeBuilding(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { cityId, cityName, buildingId, newLevel, newName, newEffects, costs, isWonderConversion, chronicleText } = payload;
  if (!buildingId || !newLevel) return { events: [], error: "Missing buildingId or newLevel" };

  const realm = await getRealmFull(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };

  const costGold = costs?.cost_wealth || 0;
  const prodCost = (costs?.cost_wood || 0) + (costs?.cost_stone || 0) + (costs?.cost_iron || 0);

  if ((realm.gold_reserve || 0) < costGold) return { events: [], error: "Nedostatek zlata" };
  if ((realm.production_reserve || 0) < prodCost) return { events: [], error: "Nedostatek produkce" };

  await supabase.from("realm_resources").update({
    gold_reserve: Math.max(0, (realm.gold_reserve || 0) - costGold),
    production_reserve: Math.max(0, (realm.production_reserve || 0) - prodCost),
  }).eq("id", realm.id);

  const updateData: any = { current_level: newLevel };
  if (newName) updateData.name = newName;
  if (newEffects) updateData.effects = newEffects;

  let wonderId: string | null = null;
  if (isWonderConversion) {
    updateData.is_wonder = true;
    const { data: existingBuilding } = await supabase.from("city_buildings")
      .select("description, image_url, image_prompt").eq("id", buildingId).maybeSingle();
    const { data: wonder } = await supabase.from("wonders").insert({
      session_id: sessionId,
      name: newName,
      description: existingBuilding?.description || "",
      owner_player: actor.name,
      city_id: cityId,
      era: "current",
      status: "completed",
      effects: { ...(newEffects || {}), global_influence: 10, diplomatic_prestige: 15 },
      completed_turn: turnNumber,
      image_url: existingBuilding?.image_url,
      image_prompt: existingBuilding?.image_prompt,
    }).select("id").single();
    if (wonder) {
      wonderId = wonder.id;
      updateData.wonder_id = wonder.id;
    }
  }

  await supabase.from("city_buildings").update(updateData).eq("id", buildingId);

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: isWonderConversion ? "wonder" : "construction",
    city_id: cityId,
    note: `${actor.name} vylepšil ${newName} v ${cityName} na úroveň ${newLevel}.`,
    importance: isWonderConversion ? "critical" : "normal",
    reference: { buildingId, newLevel, newName, cityId, cityName, isWonderConversion },
  }], chronicleText, { buildingId, wonderId });
}

/**
 * BUILD_DISTRICT — deduct, insert city_districts.
 * Payload: { cityId, cityName, district (full template + values), chronicleText? }
 */
async function executeBuildDistrict(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { cityId, cityName, district, chronicleText } = payload;
  if (!cityId || !district) return { events: [], error: "Missing cityId or district" };

  const realm = await getRealmFull(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };

  const costGold = district.build_cost_wealth || 0;
  const prodCost = (district.build_cost_wood || 0) + (district.build_cost_stone || 0);

  if ((realm.gold_reserve || 0) < costGold) return { events: [], error: "Nedostatek zlata" };
  if ((realm.production_reserve || 0) < prodCost) return { events: [], error: "Nedostatek produkce" };

  await supabase.from("realm_resources").update({
    gold_reserve: (realm.gold_reserve || 0) - costGold,
    production_reserve: Math.max(0, (realm.production_reserve || 0) - prodCost),
  }).eq("id", realm.id);

  const buildTurns = district.build_turns || 1;
  const { data: inserted, error: dErr } = await supabase.from("city_districts").insert({
    session_id: sessionId, city_id: cityId,
    district_type: district.district_type, name: district.name,
    population_capacity: district.population_capacity || 0,
    grain_modifier: district.grain_modifier || 0,
    wealth_modifier: district.wealth_modifier || 0,
    production_modifier: district.production_modifier || 0,
    stability_modifier: district.stability_modifier || 0,
    influence_modifier: district.influence_modifier || 0,
    peasant_attraction: district.peasant_attraction || 0,
    burgher_attraction: district.burgher_attraction || 0,
    cleric_attraction: district.cleric_attraction || 0,
    military_attraction: district.military_attraction || 0,
    build_cost_wealth: costGold,
    build_cost_wood: district.build_cost_wood || 0,
    build_cost_stone: district.build_cost_stone || 0,
    build_turns: buildTurns,
    build_started_turn: turnNumber,
    status: buildTurns <= 1 ? "completed" : "building",
    completed_turn: buildTurns <= 1 ? turnNumber : null,
    description: district.description || null,
  }).select("id").single();

  if (dErr) return { events: [], error: `District insert failed: ${dErr.message}` };

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "construction",
    city_id: cityId,
    note: `${actor.name} založil čtvrť ${district.name} v ${cityName}.`,
    importance: "normal",
    reference: { districtId: inserted.id, districtName: district.name, cityId },
  }], chronicleText, { districtId: inserted.id });
}

/**
 * UPGRADE_SETTLEMENT — deduct consumable resources, update city level.
 * Payload: { cityId, cityName, nextLevel, nextSettlement, costs: Record<string, number> }
 */
async function executeUpgradeSettlement(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { cityId, cityName, nextLevel, nextSettlement, costs } = payload;
  if (!cityId || !nextSettlement) return { events: [], error: "Missing cityId or nextSettlement" };

  const realm = await getRealmFull(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };

  // Validate funds
  if (costs?.production_reserve && (realm.production_reserve || 0) < costs.production_reserve) {
    return { events: [], error: "Nedostatek produkce" };
  }
  if (costs?.gold_reserve && (realm.gold_reserve || 0) < costs.gold_reserve) {
    return { events: [], error: "Nedostatek zlata" };
  }

  await supabase.from("cities").update({
    settlement_level: nextSettlement,
    level: nextLevel,
  }).eq("id", cityId);

  if (costs && Object.keys(costs).length > 0) {
    const update: any = {};
    for (const [field, amount] of Object.entries(costs)) {
      update[field] = Math.max(0, ((realm as any)[field] || 0) - (amount as number));
    }
    await supabase.from("realm_resources").update(update).eq("id", realm.id);
  }

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "settlement_upgrade",
    city_id: cityId,
    note: `${cityName} povýšeno na ${nextLevel}.`,
    importance: "critical",
    reference: { cityId, cityName, nextLevel, nextSettlement },
  }], payload.chronicleText);
}

/**
 * APPLY_DECREE_EFFECTS — apply immediate one-time effects from decree to realm + cities.
 * Payload: { effects: [{ type, value }], chronicleText? }
 */
async function executeApplyDecreeEffects(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { effects } = payload;
  if (!Array.isArray(effects)) return { events: [], error: "Missing effects array" };

  const RESOURCE_FIELD_MAP: Record<string, string> = {
    gold: "gold_reserve", wealth: "gold_reserve",
    grain: "grain_reserve", supplies: "grain_reserve",
    production: "production_reserve", manpower: "manpower_pool",
  };
  const IMMEDIATE = new Set(["gold", "wealth", "grain", "supplies", "production", "manpower", "stability"]);
  const immediate = effects.filter((e: any) => IMMEDIATE.has(e.type));

  const realm = await getRealmFull(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };

  const realmUpdates: Record<string, number> = {};
  let stabilityDelta = 0;
  for (const eff of immediate) {
    if (eff.type === "stability") {
      stabilityDelta += eff.value;
    } else {
      const field = RESOURCE_FIELD_MAP[eff.type];
      if (field) {
        const current = (realm as any)[field] || 0;
        realmUpdates[field] = Math.max(0, current + eff.value);
      }
    }
  }

  if (Object.keys(realmUpdates).length > 0) {
    await supabase.from("realm_resources").update(realmUpdates).eq("id", realm.id);
  }

  if (stabilityDelta !== 0) {
    const { data: cities } = await supabase.from("cities")
      .select("id, city_stability").eq("session_id", sessionId).eq("owner_player", actor.name);
    for (const c of (cities || [])) {
      const newStab = Math.max(0, Math.min(100, (c.city_stability || 50) + stabilityDelta));
      await supabase.from("cities").update({ city_stability: newStab }).eq("id", c.id);
    }
  }

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "decree",
    note: payload.note || `${actor.name} aplikoval okamžité dopady dekretu.`,
    importance: "normal",
    reference: { effects: immediate },
  }], payload.chronicleText);
}

/**
 * SET_TRADE_IDEOLOGY — update realm.trade_ideology.
 * Payload: { ideology }
 */
async function executeSetTradeIdeology(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { ideology } = payload;
  if (!ideology || typeof ideology !== "string") return { events: [], error: "Missing ideology" };

  const realm = await getRealmFull(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };

  await supabase.from("realm_resources").update({ trade_ideology: ideology }).eq("id", realm.id);

  return insertEvents(supabase, commandId, [{
    ...base,
    event_type: "policy",
    note: payload.note || `${actor.name} změnil obchodní ideologii na ${ideology}.`,
    importance: "normal",
    reference: payload,
  }]);
}

/**
 * SET_SPORT_FUNDING — update realm.sport_funding_pct.
 * Payload: { pct }
 */
async function executeSetSportFunding(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { pct } = payload;
  if (typeof pct !== "number" || pct < 0 || pct > 100) {
    return { events: [], error: "Invalid pct (0–100)" };
  }

  const realm = await getRealmFull(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };

  await supabase.from("realm_resources").update({ sport_funding_pct: pct }).eq("id", realm.id);

  return insertEvents(supabase, commandId, [{
    ...base,
    event_type: "policy",
    note: payload.note || `${actor.name} nastavil sportovní financování na ${pct}%.`,
    importance: "normal",
    reference: payload,
  }]);
}

/**
 * UPGRADE_INFRASTRUCTURE — deduct realm resources, increment city infra field.
 * Payload: { cityId, cityName, field, nextLevel, costGold, costProduction, label?, icon?, chronicleText? }
 */
async function executeUpgradeInfrastructure(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { cityId, cityName, field, nextLevel, costGold = 0, costProduction = 0, label, chronicleText } = payload;
  if (!cityId || !field || typeof nextLevel !== "number") {
    return { events: [], error: "Missing cityId, field or nextLevel" };
  }
  const ALLOWED = new Set(["irrigation_level", "market_level", "temple_level", "development_level"]);
  if (!ALLOWED.has(field)) return { events: [], error: `Field ${field} not allowed` };

  const realm = await getRealmFull(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };

  if ((realm.gold_reserve || 0) < costGold) return { events: [], error: "Nedostatek zlata" };
  if ((realm.production_reserve || 0) < costProduction) return { events: [], error: "Nedostatek produkce" };

  await supabase.from("realm_resources").update({
    gold_reserve: (realm.gold_reserve || 0) - costGold,
    production_reserve: Math.max(0, (realm.production_reserve || 0) - costProduction),
  }).eq("id", realm.id);

  await supabase.from("cities").update({ [field]: nextLevel }).eq("id", cityId);

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "construction",
    city_id: cityId,
    note: `${actor.name} vylepšil ${label || field} v ${cityName} na úroveň ${nextLevel}.`,
    importance: "normal",
    reference: { cityId, field, nextLevel },
  }], chronicleText);
}

// ═══════════════════════════════════════════
// EXPLORE_TILE — Patch 5
// Reveals a tile adjacent to the player's currently-visible area.
// Updates map_visibility, discovers neutral nodes on the tile,
// writes audit log, and emits a single "exploration" event.
// ═══════════════════════════════════════════

async function executeExploreTile(
  supabase: any,
  base: any,
  actor: Actor,
  payload: any,
  commandId: string,
  sessionId: string,
  turnNumber: number,
): Promise<CommandResult> {
  const tile_q = Number(payload?.tile_q);
  const tile_r = Number(payload?.tile_r);
  if (!Number.isFinite(tile_q) || !Number.isFinite(tile_r)) {
    return { events: [], error: "EXPLORE_TILE requires numeric tile_q and tile_r", status: 400 };
  }

  // ── Validate adjacency: target must be neighbour of a 'visible' tile owned by actor ──
  const RING1: Array<[number, number]> = [
    [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
  ];
  const neighbourKeys = RING1.map(([dq, dr]) => `${tile_q - dq},${tile_r - dr}`);

  const { data: visTiles } = await supabase
    .from("map_visibility")
    .select("tile_q, tile_r, visibility")
    .eq("session_id", sessionId)
    .eq("player_name", actor.name)
    .eq("visibility", "visible");

  const visibleSet = new Set<string>((visTiles || []).map((v: any) => `${v.tile_q},${v.tile_r}`));
  const isAdjacent = neighbourKeys.some(k => visibleSet.has(k));
  const alreadyVisible = visibleSet.has(`${tile_q},${tile_r}`);

  if (!isAdjacent && !alreadyVisible) {
    return { events: [], error: "Target tile must be adjacent to a visible tile", status: 400 };
  }

  // ── Validate tile exists and is passable ──
  const { data: hex } = await supabase
    .from("province_hexes")
    .select("q, r, biome_family, is_passable")
    .eq("session_id", sessionId)
    .eq("q", tile_q).eq("r", tile_r)
    .maybeSingle();

  if (!hex) {
    return { events: [], error: "Tile not found", status: 404 };
  }

  const now = new Date().toISOString();

  // ── Promote target to 'visible'; promote unknown neighbours to 'seen' ──
  const upserts: any[] = [{
    session_id: sessionId, player_name: actor.name,
    tile_q, tile_r, visibility: "visible",
    first_seen_at: now, last_seen_at: now, discovered_by: actor.name,
  }];

  for (const [dq, dr] of RING1) {
    const nq = tile_q + dq;
    const nr = tile_r + dr;
    if (visibleSet.has(`${nq},${nr}`)) continue;
    upserts.push({
      session_id: sessionId, player_name: actor.name,
      tile_q: nq, tile_r: nr, visibility: "seen",
      first_seen_at: now, last_seen_at: now, discovered_by: actor.name,
    });
  }

  const { error: visErr } = await supabase.from("map_visibility").upsert(upserts, {
    onConflict: "session_id,player_name,tile_q,tile_r",
    ignoreDuplicates: false,
  });
  if (visErr) {
    console.warn("EXPLORE_TILE map_visibility upsert error:", visErr.message);
  }

  // ── Discover neutral nodes on the tile ──
  const { data: discoveredNodes } = await supabase
    .from("province_nodes")
    .update({ discovered: true, discovered_by: actor.name, discovered_at: now })
    .eq("session_id", sessionId)
    .eq("hex_q", tile_q).eq("hex_r", tile_r)
    .eq("is_neutral", true)
    .eq("discovered", false)
    .select("id, name, profile_key, culture_key");

  const discoveredCount = discoveredNodes?.length || 0;
  const discoveredSummary = discoveredCount > 0
    ? `objevil ${discoveredCount === 1 ? `${discoveredNodes![0].name}` : `${discoveredCount} neutrálních uzlů`}`
    : `prozkoumal hex (${tile_q}, ${tile_r})`;

  // ── Per-player legacy 'discoveries' row for back-compat with frontier renderer ──
  await supabase.from("discoveries").insert({
    session_id: sessionId,
    player_name: actor.name,
    entity_type: "province_hex",
    entity_id: `${tile_q}:${tile_r}`,
    discovered_at: now,
    turn_number: turnNumber,
  }).then(() => {}, () => {});

  return await insertEvents(supabase, commandId, [{
    ...base,
    event_type: "exploration",
    note: `${actor.name} ${discoveredSummary}.`,
    importance: discoveredCount > 0 ? "high" : "normal",
    location: `${tile_q},${tile_r}`,
    reference: {
      tile_q, tile_r,
      biome: hex.biome_family,
      discovered_node_ids: (discoveredNodes || []).map((n: any) => n.id),
    },
  }], { discoveredNodes: discoveredNodes || [], visibilityWritten: upserts.length });
}
