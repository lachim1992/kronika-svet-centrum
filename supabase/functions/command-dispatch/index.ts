import { isStackActive } from "../_shared/stackState.ts";
import { turnResolvingRefusal } from "../_shared/commandGate.ts";
import { terrainReason, sanitizeRegionName } from "../_shared/terrainSuitability.ts";
import { validateBuild, canonicalBuilding, stripProductionEffects } from "../_shared/buildValidation.ts";
import { validateBuildingUpgrade, quoteBuildingUpgrade } from '../_shared/upgradeValidation.ts';
import { strategicBuildCostMult, discountedCost } from '../_shared/strategicEffects.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUBNODE_DEFS as SHARED_SUBNODE_DEFS } from "../_shared/subnodeCatalog.ts";
import { readRealmWorkforce, actualSoldiers, syncRealmMilitaryLedger } from '../_shared/manpower.ts';
import { isInternalActorType, isTrustedInternalRequest } from '../_shared/internalActor.ts';
import {
  computeAnnexCheck,
  DEFAULT_INFLUENCE,
  computePressure,
  computeContestation,
  applyRivalryErosion,
  scaleByCompetition,
  type InfluenceState,
  type RivalRow,
} from "../_shared/nodeInfluence.ts";
import { applyStackMove, applyStackMicroMove } from "../_shared/stackMovementCommand.ts";
import { checkTerritoryAccess, checkWarDeclaration, loadDiplomacyState } from "../_shared/diplomacyEnforcement.ts";
import {
  parcelClaimCost,
  POPULATION_PER_SLOT,
  riverChannelCells,
  TILE_PARCEL_COLS,
  TILE_PARCEL_COUNT,
  TILE_PARCEL_ROWS,
} from "../_shared/tileParcels.ts";
import {
  cityParcelCapacity,
  ensureTileParcels,
  seatCityOnParcels,
} from "../_shared/citySeat.ts";
import { ensureCitySettlementNodes } from "../_shared/citySettlementNodes.ts";
import { ensureStarterEconomy } from "../_shared/starterEconomy.ts";
import { FOUNDING_HAMLET_POPULATION } from "../_shared/foundingPopulation.ts";
import { ensureSingleCapital } from "../_shared/capital.ts";
import { tileInfrastructureLevel } from "../_shared/tileInfrastructure.ts";
import { tileBridgeCells, tileRoadCost } from "../_shared/tileRoads.ts";
import { PRODUCTION_PER_RESIDENTIAL, districtBlueprint, storedDistrictBlueprint, districtBasketProblem } from "../_shared/cityDistricts.ts";
import { settlementUpgradeDefinition, settlementUpgradeProblem } from "../_shared/settlementUpgrades.ts";
import { infrastructureUpgradeByField, infrastructureUpgradeQuote } from "../_shared/cityInfrastructure.ts";
import { templateSiteRole, DEPOSIT_REQUIRED, availableMacroReserve, macroReserveKey, RURAL_RECIPES, type SiteRole } from "../_shared/ruralSites.ts";
import { MATERIAL_BY_RECIPE } from "../_shared/materialResources.ts";
import { goldVeinCells, generateMacroDeposits, surveyFindings, SURVEY_COST } from "../_shared/geology.ts";
import { generateTileParcels } from "../_shared/tileParcels.ts";
import { MICRO_SURVEY_COST, surveyMicroSquare, microSiteReason } from "../_shared/microResources.ts";
import { PLANT_COST, plantReason } from "../_shared/cropSpread.ts";
import { initialWalls, siegeInRange } from "../_shared/siege.ts";
import { loadSiegeUnits } from "../_shared/siegeState.ts";
import { executeFieldBattleCommand } from "./fieldBattleCommand.ts";
import { FORMATIONS } from "../_shared/fieldBattle.ts";
import { FORMATION_PRESETS as SHARED_FORMATION_PRESETS, UNIT_GOLD_FACTOR as SHARED_GOLD, UNIT_PROD_FACTOR as SHARED_PROD, UNIT_TYPE_LABELS as SHARED_LABELS, presetRequirements, missingBuildings, computeStackPower } from "../_shared/unitTypes.ts";
import { generalArmyCapacity } from "../_shared/generalCommand.ts";
import { FARM_FIELD_COST, MAX_FARM_FIELDS, farmFieldReason } from "../_shared/farmFields.ts";
import { chargeReserves, refundReserves, realmReserveIO } from "../_shared/reserveLedger.ts";
import { requirePlayerSeat, PlayerIdentityError } from "../_shared/playerIdentity.ts";
import { rationPolicy } from "../_shared/rationPolicy.ts";
import { LEGACY_FOOD_TRANSFER_ERROR } from "../_shared/legacyFood.ts";
import { FINANCIAL_COMMANDS, executeFinancialCommand } from './financialCommand.ts';
import { foodSurveyFindings, specializationReason, isFoodFinding, starterKitCost, starterKitReason } from '../_shared/foodSpecialization.ts';
import { foodResourceByKey } from '../_shared/foodResources.ts';

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

    // JSON actor.type is never authority. Only an authenticated service-role edge caller may
    // act as system/AI or bypass the player turn gate; reject spoofing before any side effect.
    const trustedInternal = isTrustedInternalRequest(req);
    if (isInternalActorType(actor?.type) && !trustedInternal) {
      return json({ error: "Interní aktér vyžaduje ověřené servisní volání" }, 403);
    }

    // ── Validate session ──
    const { data: session, error: sessErr } = await supabase
      .from("game_sessions")
      .select("id, current_turn, resolving_turn")
      .eq("id", sessionId)
      .single();

    if (sessErr || !session) {
      return json({ error: "Session not found" }, 404);
    }
    // Expected busy state, not a failure: a normal 200 refusal so the client shows a notice instead of crashing.
    const busy = turnResolvingRefusal(session, trustedInternal ? actor?.type : "player");
    if (busy) return json(busy, 200);

    // Human authority is the verified JWT's own seat, never a body-supplied realm name.
    let authenticatedUserId: string | null = null;
    if (actor?.type !== "system" && actor?.type !== "ai_faction") {
      try {
        const authHeader = req.headers.get("authorization") || "";
        const jwt = authHeader.replace(/^Bearer\s+/i, "").trim() || null;
        const seated = await requirePlayerSeat(supabase, sessionId, actor, jwt);
        authenticatedUserId = seated.id || null;
        actor.id = seated.id;
        actor.name = seated.name;
      } catch (e) {
        if (e instanceof PlayerIdentityError) return json({ error: e.message }, e.status);
        throw e;
      }
    }

    if (turnNumber !== undefined && turnNumber !== null && turnNumber !== session.current_turn) {
      return json({ error: "Turn mismatch", expected: session.current_turn, received: turnNumber }, 409);
    }

    const effectiveTurn = turnNumber ?? session.current_turn;

    // Finance must bypass sandbox funding, generic event replay and derived refresh.
    // The SQL transaction owns balances, its complete journal and its canonical event together.
    if (FINANCIAL_COMMANDS.has(commandType)) {
      const finance = await executeFinancialCommand(supabase, sessionId, authenticatedUserId, commandId, commandType, commandPayload);
      return json(finance, finance.status || 200);
    }

    // ── Sandbox (testing) mode ──
    // Removes the economic gate only: resources are topped up before the command
    // and every queued construction is finished immediately, so the real game
    // effects of each change are visible right away. All other rules still apply.
    let sandbox = false;
    if (body.sandbox === true && actor?.type !== "ai_faction" && authenticatedUserId) {
      const { data: adminRole, error: adminRoleError } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", authenticatedUserId)
        .eq("role", "admin")
        .maybeSingle();
      if (adminRoleError) console.error("[command-dispatch] sandbox authorization failed:", adminRoleError.message);
      sandbox = Boolean(adminRole);
    }
    if (sandbox) await sandboxTopUp(supabase, sessionId, actor);

    // ── Execute command ──
    const result = await executeCommand(
      supabase, sessionId, effectiveTurn, actor, commandType, commandPayload, commandId
    );

    if (result.error) {
      // Tactical-battle rule refusals are normal gameplay answers, not failures.
      const isBattleRule = /FIELD_BATTLE|SET_BATTLE_FORMATION/.test(String(commandType)) && !result.status;
      return json({ ok: false, error: result.error }, isBattleRule ? 200 : (result.status || 400));
    }

    if (sandbox && !result.idempotent) {
      await sandboxInstantComplete(supabase, sessionId, actor, effectiveTurn);
    }

    // ── Audit log ──
    await supabase.from("world_action_log").insert({
      session_id: sessionId,
      player_name: actor.name,
      turn_number: effectiveTurn,
      action_type: commandType,
      description: `Command ${commandType} dispatched (${result.events.length} events)`,
    }).then(() => {}, () => {});

    // Commands change the physical input state; refresh the whole derived projection.
    // A failed refresh must not turn a successfully applied command into a retryable failure.
    const TRADE_TOPOLOGY_COMMANDS = new Set([
      "OPEN_TRADE_WITH_NODE",
      "JOIN_TRADE_SYSTEM",
      "ESTABLISH_PROTECTORATE",
      "VASSALIZE_NODE",
      "ANNEX_NODE",
      "FOUND_CITY", "BUILD_BUILDING", "UPGRADE_BUILDING", "BUILD_DISTRICT",
      "SET_DISTRICT_PRODUCTION", "BUILD_SUBNODE", "BUILD_ROAD_PATH",
      "UPGRADE_INFRASTRUCTURE", "UPGRADE_SETTLEMENT", "APPLY_DECREE_EFFECTS",
      "SET_TRADE_IDEOLOGY", "RECRUIT_STACK", "REINFORCE_STACK", "DISBAND_STACK",
      "DEMOBILIZE_STACK", "REMOBILIZE_STACK",
    ]);
    if (!result.idempotent && TRADE_TOPOLOGY_COMMANDS.has(commandType)) {
      try {
        const { data: refreshed, error: tfErr } = await supabase.functions.invoke("refresh-economy", {
          body: { session_id: sessionId },
        });
        const fresh = !tfErr && refreshed?.ok === true;
        result.sideEffects = { ...result.sideEffects, economy: { status: fresh ? 'fresh' : 'stale',
          error: fresh ? null : tfErr?.message || refreshed?.error || 'Economy refresh incomplete' } };
        if (!fresh) console.warn(`[command-dispatch] refresh-economy after ${commandType}:`, result.sideEffects.economy.error);
      } catch (e) {
        result.sideEffects = { ...result.sideEffects, economy: { status: 'stale', error: (e as Error).message } };
        console.warn(`[command-dispatch] refresh-economy after ${commandType} failed:`, (e as Error).message);
      }
    }

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

async function resolveCanonicalPlayerName(
  supabase: any,
  sessionId: string,
  actor: Actor,
): Promise<string> {
  const requestedName = actor?.name?.trim();
  if (!requestedName) return "";

  const directRealm = await supabase
    .from("realm_resources")
    .select("player_name")
    .eq("session_id", sessionId)
    .eq("player_name", requestedName)
    .maybeSingle();

  if (directRealm.data?.player_name) return directRealm.data.player_name;

  const directPlayer = await supabase
    .from("game_players")
    .select("player_name")
    .eq("session_id", sessionId)
    .eq("player_name", requestedName)
    .maybeSingle();

  if (directPlayer.data?.player_name) return directPlayer.data.player_name;

  if (actor?.id) {
    const byActorId = await supabase
      .from("game_players")
      .select("player_name")
      .eq("session_id", sessionId)
      .eq("user_id", actor.id)
      .maybeSingle();

    if (byActorId.data?.player_name) return byActorId.data.player_name;
  }

  const normalizedRequested = requestedName.toLocaleLowerCase("cs-CZ");
  const { data: players } = await supabase
    .from("game_players")
    .select("player_name")
    .eq("session_id", sessionId);

  const fuzzy = (players || []).find((row: any) =>
    String(row.player_name || "").trim().toLocaleLowerCase("cs-CZ") === normalizedRequested,
  );

  return fuzzy?.player_name || requestedName;
}

async function getRealmByActor(
  supabase: any,
  sessionId: string,
  actor: Actor,
  columns = "*",
) {
  const canonicalName = await resolveCanonicalPlayerName(supabase, sessionId, actor);
  if (canonicalName && canonicalName !== actor.name) {
    console.log(`[command-dispatch] Canonical realm fallback "${actor.name}" → "${canonicalName}"`);
    actor.name = canonicalName;
  }

  const { data } = await supabase
    .from("realm_resources")
    .select(columns)
    .eq("session_id", sessionId)
    .eq("player_name", actor.name)
    .maybeSingle();

  return data;
}

// ═══════════════════════════════════════════
// SANDBOX (TESTING) HELPERS
// ═══════════════════════════════════════════

const SANDBOX_FLOOR = 1_000_000;

/** Raise the actor's ledger so no command can fail on cost checks. Effects stay real. */
async function sandboxTopUp(supabase: any, sessionId: string, actor: Actor) {
  try {
    const realm = await getRealmByActor(
      supabase, sessionId, actor,
      "id, gold_reserve, production_reserve, grain_reserve, manpower_pool",
    );
    if (!realm) return;

    const patch: Record<string, number> = {};
    for (const key of ["gold_reserve", "production_reserve", "grain_reserve", "manpower_pool"]) {
      const current = Number((realm as any)[key] || 0);
      if (current < SANDBOX_FLOOR) patch[key] = SANDBOX_FLOOR;
    }
    if (Object.keys(patch).length === 0) return;

    await supabase.from("realm_resources").update(patch).eq("id", realm.id);
    console.log(`[command-dispatch] sandbox top-up for ${actor.name}:`, Object.keys(patch).join(", "));
  } catch (e) {
    console.warn("[command-dispatch] sandbox top-up failed:", (e as Error).message);
  }
}

/** Finish everything the actor has queued so the resulting game effects apply now. */
async function sandboxInstantComplete(
  supabase: any,
  sessionId: string,
  actor: Actor,
  turnNumber: number,
) {
  try {
    const { data: cities } = await supabase
      .from("cities")
      .select("id")
      .eq("session_id", sessionId)
      .eq("owner_player", actor.name);
    const cityIds = (cities || []).map((c: any) => c.id);

    if (cityIds.length > 0) {
      await supabase
        .from("city_buildings")
        .update({ status: "completed", completed_turn: turnNumber })
        .eq("session_id", sessionId)
        .in("city_id", cityIds)
        .neq("status", "completed");

      await supabase
        .from("city_districts")
        .update({ status: "completed", completed_turn: turnNumber })
        .eq("session_id", sessionId)
        .in("city_id", cityIds)
        .neq("status", "completed");
    }

    const { data: infra } = await supabase
      .from("tile_infrastructure")
      .select("id, level, target_level")
      .eq("session_id", sessionId)
      .eq("owner_player", actor.name)
      .neq("status", "completed");

    for (const row of infra || []) {
      await supabase
        .from("tile_infrastructure")
        .update({
          level: row.target_level ?? row.level,
          target_level: null,
          progress: 100,
          status: "completed",
          completed_turn: turnNumber,
        })
        .eq("id", row.id);
    }

    await supabase
      .from("node_projects")
      .update({ status: "completed", progress: 100, completed_turn: turnNumber })
      .eq("session_id", sessionId)
      .eq("initiated_by", actor.name)
      .neq("status", "completed");
  } catch (e) {
    console.warn("[command-dispatch] sandbox instant-complete failed:", (e as Error).message);
  }
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
      return await executeRecruitGeneral(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "SIGN_NEUTRAL_PACT":
      return await executeSignNeutralPact(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "RESOLVE_UPRISING":
      return await executeResolveUprising(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "DEPLOY_STACK":
      return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
        ...base,
        event_type: "military",
        note: payload.note || `Armáda byla rozmístěna.`,
        importance: "normal",
        reference: payload,
      }], payload.chronicleText);

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

    case "SET_DISTRICT_PRODUCTION":
      return await executeSetDistrictProduction(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "SET_RATION_POLICY":
      return await executeSetRationPolicy(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "ASSIGN_CITY_PARCEL":
      return await executeAssignCityParcel(supabase, base, actor, payload, commandId, sessionId, turnNumber);


    case "SURVEY_MACRO": {
      const x = Number(payload.gridX), y = Number(payload.gridY), level = Number(payload.level || 1) >= 2 ? 2 : 1;
      if (!Number.isInteger(x) || !Number.isInteger(y)) return { events: [], error: "Neplatné pole" };
      const { data: hex } = await supabase.from("province_hexes").select("biome_family, mean_height, is_passable, has_river, coastal, temp_band, moisture_band")
        .eq("session_id", sessionId).eq("grid_x", x).eq("grid_y", y).maybeSingle();
      if (!hex) return { events: [], error: "Pole neexistuje" };
      await supabase.from("geology_seeds").upsert({ session_id: sessionId }, { onConflict: "session_id", ignoreDuplicates: true });
      const { data: seed } = await supabase.from("geology_seeds").select("salt").eq("session_id", sessionId).single();
      let { data: truth } = await supabase.from("macro_deposits").select("deposits").eq("session_id", sessionId).eq("grid_x", x).eq("grid_y", y).maybeSingle();
      if (!truth) {
        // Gold veins are a world-level rank (rarest hills), so they need every rocky tile once.
        const { data: rocky } = await supabase.from("province_hexes").select("grid_x, grid_y, biome_family")
          .eq("session_id", sessionId).or("biome_family.ilike.%hill%,biome_family.ilike.%mountain%").limit(5000);
        const veins = goldVeinCells(seed!.salt, (rocky || []).map((h: any) => ({ x: h.grid_x, y: h.grid_y, biome_family: h.biome_family })));
        const deposits = generateMacroDeposits(seed!.salt, x, y, hex as any, veins);
        await supabase.from("macro_deposits").upsert({ session_id: sessionId, grid_x: x, grid_y: y, deposits }, { onConflict: "session_id,grid_x,grid_y", ignoreDuplicates: true });
        ({ data: truth } = await supabase.from("macro_deposits").select("deposits").eq("session_id", sessionId).eq("grid_x", x).eq("grid_y", y).single());
      }
      const findings = surveyFindings((truth as any).deposits || [], level as 1 | 2);
      const { data, error } = await supabase.rpc("record_macro_survey", { p_session: sessionId, p_player: actor.name, p_x: x, p_y: y,
        p_level: level, p_findings: findings, p_cost: SURVEY_COST[level as 1 | 2], p_turn: turnNumber });
      if (error) return { events: [], error: error.message };
      return { events: [], result: { ...data, findings } } as any;
    }

    case "PLANT_CROP": {
      const parcelId = String(payload.parcelId || ""), kind = String(payload.kind || "") as any;
      const { data: p } = await supabase.from("tile_parcels").select("id, grid_x, grid_y, parcel_index, sub_biome, owner_player, claim_kind").eq("session_id", sessionId).eq("id", parcelId).maybeSingle();
      if (!p) return { events: [], error: "Políčko neexistuje" };
      const mx = p.grid_x * 6 + (p.parcel_index % 6), my = p.grid_y * 6 + Math.floor(p.parcel_index / 6);
      const [{ data: surveys }, { data: plants }] = await Promise.all([
        supabase.from("micro_surveys").select("micro_x, micro_y, findings").eq("session_id", sessionId).eq("player_name", actor.name),
        supabase.from("crop_plantings").select("micro_x, micro_y, kind, planted_turn").eq("session_id", sessionId).eq("owner_player", actor.name).eq("kind", kind),
      ]);
      const has = (r: any) => (r.findings || []).some((f: any) => f.kind === kind);
      const hasSource = (surveys || []).some(has) || (plants || []).some((c: any) => turnNumber - c.planted_turn >= 3);
      const here = (surveys || []).some((r: any) => r.micro_x === mx && r.micro_y === my && has(r)) || (plants || []).some((c: any) => c.micro_x === mx && c.micro_y === my);
      const reason = plantReason(kind, p as any, actor.name, hasSource, here);
      if (reason) return { events: [], error: reason };
      const { data, error } = await supabase.rpc("plant_crop", { p_session: sessionId, p_player: actor.name, p_parcel: parcelId, p_x: mx, p_y: my, p_kind: kind, p_cost: PLANT_COST, p_turn: turnNumber });
      if (error) return { events: [], error: error.message };
      return { events: [], result: data } as any;
    }

    case "SET_FOOD_SPECIALIZATION": {
      const siteId = String(payload.parcelId || ""), key = String(payload.resourceKey || "");
      const sx = Number(payload.sourceMicroX), sy = Number(payload.sourceMicroY);
      if (!Number.isInteger(sx) || !Number.isInteger(sy)) return { events: [], error: "Neplatné zdrojové políčko" };
      const { data: site } = await supabase.from("tile_parcels").select("id, grid_x, grid_y, parcel_index, owner_player, claim_kind").eq("session_id", sessionId).eq("id", siteId).maybeSingle();
      if (!site) return { events: [], error: "Políčko neexistuje" };
      const { data: b } = await supabase.from("city_buildings").select("template_id, effects").eq("parcel_id", siteId).eq("status", "completed").maybeSingle();
      if (!b) return { events: [], error: "Na políčku není dokončená stavba" };
      const { data: tpl } = await supabase.from("building_templates").select("effects").eq("id", (b as any).template_id).maybeSingle();
      const specKeys = (((b as any).effects?.specialization_recipe_keys ?? (tpl as any)?.effects?.specialization_recipe_keys) || []).map(String);
      const gx = Math.floor(sx / 6), gy = Math.floor(sy / 6), spi = (sy % 6) * 6 + (sx % 6);
      const [{ data: src }, { data: surv }] = await Promise.all([
        supabase.from("tile_parcels").select("sub_biome").eq("session_id", sessionId).eq("grid_x", gx).eq("grid_y", gy).eq("parcel_index", spi).maybeSingle(),
        supabase.from("micro_surveys").select("findings").eq("session_id", sessionId).eq("player_name", actor.name).eq("micro_x", sx).eq("micro_y", sy).maybeSingle(),
      ]);
      const siteMicro: [number, number] = [site.grid_x * 6 + (site.parcel_index % 6), site.grid_y * 6 + Math.floor(site.parcel_index / 6)];
      const reason = specializationReason({ resourceKey: key, siteOwner: site.owner_player, siteClaim: site.claim_kind, player: actor.name, specializationKeys: specKeys,
        siteMicro, sourceMicro: [sx, sy], sourceSubBiome: (src as any)?.sub_biome ?? null,
        discoveredAtSource: true });
      if (reason) return { events: [], error: reason };
      // Source of the stock: own survey find, or an imported starter kit (seed / breeding stock / hives) paid from the treasury.
      const found = (((surv as any)?.findings) || []).some((f: any) => isFoodFinding(f, key));
      const useKit = payload.starterKit === true;
      let kitCost = 0;
      if (!found) {
        if (!useKit) return { events: [], error: `Nejdřív musíš průzkumem najít ${foodResourceByKey.get(key)?.label.toLowerCase() ?? 'zdroj'} na zdrojovém políčku, nebo koupit startovní osivo/chovný materiál.` };
        const { data: hx } = await supabase.from("province_hexes").select("temp_band, moisture_band, mean_height, has_river, coastal").eq("session_id", sessionId).eq("grid_x", gx).eq("grid_y", gy).maybeSingle();
        const elev = Number((hx as any)?.mean_height);
        const kr = starterKitReason(foodResourceByKey.get(key), { subBiome: (src as any)?.sub_biome ?? null, tempBand: (hx as any)?.temp_band, moistureBand: (hx as any)?.moisture_band,
          elevation: Number.isFinite(elev) ? (elev > 1 ? elev / 100 : elev) : null, hasRiver: !!(hx as any)?.has_river, coastal: !!(hx as any)?.coastal } as any);
        if (kr) return { events: [], error: kr };
        kitCost = starterKitCost(foodResourceByKey.get(key)!)!;
      }
      const { data, error } = await supabase.rpc("set_food_specialization_v3", { p_session: sessionId, p_command: String(commandId), p_player: actor.name, p_parcel: siteId, p_key: key, p_x: sx, p_y: sy, p_turn: turnNumber,
        p_mode: found ? "found" : "starter_kit", p_cost: kitCost });
      if (error) return { events: [], error: error.message };
      return { events: [], result: data } as any;
    }

    case "ADD_FARM_FIELD": {
      const farmId = String(payload.farmParcelId || ""), fieldId = String(payload.fieldParcelId || "");
      const cols = "id, grid_x, grid_y, parcel_index, sub_biome, city_id, owner_player, claim_kind";
      const { data: pair } = await supabase.from("tile_parcels").select(cols).eq("session_id", sessionId).in("id", [farmId, fieldId]);
      const farm = (pair || []).find((p: any) => p.id === farmId), field = (pair || []).find((p: any) => p.id === fieldId);
      if (!farm || !field) return { events: [], error: "Políčko neexistuje" };
      if (farm.owner_player !== actor.name) return { events: [], error: "Farma ti nepatří" };
      const { data: farmB } = await supabase.from("city_buildings").select("template_id, effects, status").eq("parcel_id", farmId).eq("status", "completed").maybeSingle();
      if (!farmB) return { events: [], error: "Na políčku není dokončená farma" };
      const { data: tpl } = await supabase.from("building_templates").select("effects").eq("id", farmB.template_id).maybeSingle();
      const recipes = ((farmB as any).effects?.recipe_keys ?? (tpl as any)?.effects?.recipe_keys ?? []).map(String);
      const { data: rows } = await supabase.from("farm_fields").select("field_parcel_id, farm_parcel_id").eq("session_id", sessionId).or(`farm_parcel_id.eq.${farmId},field_parcel_id.eq.${fieldId}`);
      const mine = (rows || []).filter((r: any) => r.farm_parcel_id === farmId).map((r: any) => r.field_parcel_id);
      const { data: existing } = mine.length ? await supabase.from("tile_parcels").select(cols).in("id", mine) : { data: [] as any[] };
      const { count: built } = await supabase.from("city_buildings").select("id", { count: "exact", head: true }).eq("parcel_id", fieldId);
      const occupied = (built ?? 0) > 0 || (rows || []).some((r: any) => r.field_parcel_id === fieldId);
      const { data: hex } = await supabase.from("province_hexes").select("biome_family").eq("session_id", sessionId).eq("grid_x", field.grid_x).eq("grid_y", field.grid_y).maybeSingle();
      const reason = farmFieldReason(farm as any, recipes, field as any, (existing || []) as any, occupied, (hex as any)?.biome_family);
      if (reason) return { events: [], error: reason };
      const { data, error } = await supabase.rpc("add_farm_field", { p_session: sessionId, p_player: actor.name, p_farm: farmId, p_field: fieldId, p_cost: FARM_FIELD_COST, p_max: MAX_FARM_FIELDS, p_turn: turnNumber });
      if (error) return { events: [], error: error.message };
      return { events: [], result: data } as any;
    }

    case "SURVEY_MICRO": {
      // Paid survey of one 6x6 sub-square. Sub-biome: stored parcel, else the same deterministic layout the map shows.
      const x = Number(payload.gridX), y = Number(payload.gridY), pi = Number(payload.parcelIndex);
      if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(pi) || pi < 0 || pi > 35) return { events: [], error: "Neplatné políčko" };
      const { data: patch } = await supabase.from("province_hexes")
        .select("grid_x, grid_y, biome_family, mean_height, has_river, river_direction, coastal, is_passable, temp_band, moisture_band")
        .eq("session_id", sessionId).gte("grid_x", x - 1).lte("grid_x", x + 1).gte("grid_y", y - 1).lte("grid_y", y + 1);
      const hex = (patch || []).find((h: any) => h.grid_x === x && h.grid_y === y);
      if (!hex) return { events: [], error: "Pole neexistuje" };
      const asTerrain = (row: any) => ({ biome_family: row.biome_family, elevation: row.mean_height, has_river: row.has_river, river_direction: row.river_direction, is_coastal: row.coastal, is_passable: row.is_passable });
      const { data: stored } = await supabase.from("tile_parcels").select("sub_biome").eq("session_id", sessionId).eq("grid_x", x).eq("grid_y", y).eq("parcel_index", pi).maybeSingle();
      let subBiome: string | null = stored?.sub_biome ?? null;
      if (!subBiome) {
        const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => {
          const row = (patch || []).find((r: any) => r.grid_x === x + dx && r.grid_y === y + dy);
          return row ? { dx, dy, terrain: asTerrain(row) } : null;
        }).filter(Boolean) as any[];
        subBiome = generateTileParcels(sessionId, x, y, asTerrain(hex), neighbours).find(spec => spec.parcelIndex === pi)?.subBiome ?? null;
      }
      await supabase.from("geology_seeds").upsert({ session_id: sessionId }, { onConflict: "session_id", ignoreDuplicates: true });
      const { data: seed } = await supabase.from("geology_seeds").select("salt").eq("session_id", sessionId).single();
      let { data: truth } = await supabase.from("macro_deposits").select("deposits").eq("session_id", sessionId).eq("grid_x", x).eq("grid_y", y).maybeSingle();
      if (!truth) {
        const { data: rocky } = await supabase.from("province_hexes").select("grid_x, grid_y, biome_family")
          .eq("session_id", sessionId).or("biome_family.ilike.%hill%,biome_family.ilike.%mountain%").limit(5000);
        const veins = goldVeinCells(seed!.salt, (rocky || []).map((h: any) => ({ x: h.grid_x, y: h.grid_y, biome_family: h.biome_family })));
        await supabase.from("macro_deposits").upsert({ session_id: sessionId, grid_x: x, grid_y: y, deposits: generateMacroDeposits(seed!.salt, x, y, hex as any, veins) }, { onConflict: "session_id,grid_x,grid_y", ignoreDuplicates: true });
        ({ data: truth } = await supabase.from("macro_deposits").select("deposits").eq("session_id", sessionId).eq("grid_x", x).eq("grid_y", y).single());
      }
      const mx = x * 6 + (pi % 6), my = y * 6 + Math.floor(pi / 6);
      const elev = Number((hex as any).mean_height);
      const findings = [...surveyMicroSquare(seed!.salt, mx, my, subBiome, hex.biome_family, (truth as any)?.deposits || [],hex as any),
        // Food resources: same private seed, real climate bands, water access and regional origin (never spoiled to clients).
        ...foodSurveyFindings(seed!.salt, mx, my, { subBiome, tempBand: (hex as any).temp_band, moistureBand: (hex as any).moisture_band,
          elevation: Number.isFinite(elev) ? (elev > 1 ? elev / 100 : elev) : null, hasRiver: !!(hex as any).has_river, coastal: !!(hex as any).coastal })] as any[];
      const { data, error } = await supabase.rpc("record_micro_survey", { p_session: sessionId, p_player: actor.name, p_x: mx, p_y: my,
        p_findings: findings, p_cost: MICRO_SURVEY_COST, p_turn: turnNumber });
      if (error) return { events: [], error: error.message };
      return { events: [], result: { ...data, findings } } as any;
    }

    case "CLAIM_MACRO_TILE": {
      const { data, error } = await supabase.rpc("claim_macro_tile", { p_session: sessionId, p_player: actor.name,
        p_x: Number(payload.gridX), p_y: Number(payload.gridY), p_turn: turnNumber });
      if (error) return { events: [], error: error.message };
      return insertEvents(supabase, commandId, [{ ...base, event_type: "territory_claim", note: `${actor.name} rozšířil území o pole ${payload.gridX}, ${payload.gridY}.`,
        importance: "minor", reference: { gridX: payload.gridX, gridY: payload.gridY, ...data } }], data);
    }

    case "ASSIGN_MACRO_PROVINCE": {
      const { data, error } = await supabase.rpc("assign_macro_province", { p_session: sessionId, p_player: actor.name,
        p_x: Number(payload.gridX), p_y: Number(payload.gridY), p_province: String(payload.provinceId || "") });
      if (error) return { events: [], error: error.message };
      return { events: [], result: data } as any;
    }

    case "RENAME_PROVINCE": {
      const name = sanitizeRegionName(payload.name);
      if (!name) return { events: [], error: "Název musí mít 2–48 znaků (písmena, čísla, mezera, - ' .)" };
      const { data, error } = await supabase.rpc("rename_province", { p_session: sessionId, p_player: actor.name,
        p_province: String(payload.provinceId || ""), p_name: name });
      if (error) return { events: [], error: error.message };
      return { events: [], result: data } as any;
    }

    case "CREATE_TERRITORY_DISTRICT":
    case "ADD_TO_TERRITORY_DISTRICT":
    case "RENAME_TERRITORY_DISTRICT": {
      const isAdd = commandType === "ADD_TO_TERRITORY_DISTRICT";
      const name = isAdd ? "" : sanitizeRegionName(payload.name);
      if (!isAdd && !name) return { events: [], error: "Název musí mít 2–48 znaků (písmena, čísla, mezera, - ' .)" };
      const kind = ["forest", "meadow", "mine", "desert", "other"].includes(String(payload.kind)) ? String(payload.kind) : "other";
      const { data, error } = commandType === "CREATE_TERRITORY_DISTRICT"
        ? await supabase.rpc("create_territory_district", { p_session: sessionId, p_player: actor.name, p_parcel: String(payload.parcelId || ""), p_name: name, p_kind: kind, p_turn: turnNumber })
        : isAdd ? await supabase.rpc("add_parcel_to_district", { p_session: sessionId, p_player: actor.name, p_district: String(payload.districtId || ""), p_parcel: String(payload.parcelId || "") })
        : await supabase.rpc("rename_territory_district", { p_session: sessionId, p_player: actor.name, p_district: String(payload.districtId || ""), p_name: name });
      if (error) return { events: [], error: error.message };
      return { events: [], result: data } as any;
    }

    case "CLAIM_WORKED_PARCEL": {
      const { data, error } = await supabase.rpc("claim_worked_parcel", { p_session: sessionId, p_city: String(payload.cityId || ""),
        p_player: actor.name, p_parcel: String(payload.parcelId || ""), p_turn: turnNumber });
      if (error) return { events: [], error: error.message };
      return insertEvents(supabase, commandId, [{ ...base, event_type: "city_planning", city_id: payload.cityId,
        note: `Město začalo zdarma využívat okolní parcelu.`, importance: "minor", reference: { parcelId: payload.parcelId, ...data } }], data);
    }

    case "RENAME_PARCEL": {
      const name = sanitizeRegionName(payload.name);
      if (!name) return { events: [], error: "Název musí mít 2–48 znaků (písmena, čísla, mezera, - ' .)" };
      const { data, error } = await supabase.from("tile_parcels").update({ region_name: name })
        .eq("id", String(payload.parcelId || "")).eq("session_id", sessionId).eq("owner_player", actor.name)
        .in("status", ["claimed", "occupied"]).select("id");
      if (error) return { events: [], error: error.message };
      if (!data?.length) return { events: [], error: "Pojmenovat lze jen vlastní parcelu" };
      return { events: [], result: { parcelId: data[0].id, name } } as any;
    }

    case "CLAIM_TILE_PARCEL":
      return await executeClaimTileParcel(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "BUILD_SUBNODE":
      return await executeBuildSubnode(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "UPGRADE_TILE_INFRASTRUCTURE":
      return await executeUpgradeTileInfrastructure(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "BUILD_ROAD_PATH":
      return await executeBuildRoadPath(supabase, base, actor, payload, commandId, sessionId, turnNumber);

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

    case "SET_TAX_RATES": {
      const realm = await getRealmFull(supabase, sessionId, actor.name);
      if (!realm) return { events: [], error: "Realm not found" };
      const clamp = (v: any, max: number) => Math.max(0, Math.min(max, Number(v ?? 0)));
      const upd: Record<string, number> = {};
      if (payload.domestic   !== undefined) upd.tax_rate_domestic   = clamp(payload.domestic,   0.5);
      if (payload.market     !== undefined) upd.tax_rate_market     = clamp(payload.market,     0.4);
      if (payload.transit    !== undefined) upd.tax_rate_transit    = clamp(payload.transit,    0.3);
      if (payload.extraction !== undefined) upd.tax_rate_extraction = clamp(payload.extraction, 0.5);
      if (payload.poll       !== undefined) upd.tax_rate_poll       = clamp(payload.poll,       0.02);
      if (Object.keys(upd).length === 0) return { events: [], error: "No tax rates provided" };
      await supabase.from("realm_resources").update(upd).eq("id", realm.id);
      return insertEvents(supabase, commandId, [{
        ...base,
        event_type: "policy",
        note: payload.note || `${actor.name} upravil daňovou politiku.`,
        importance: "normal",
        reference: { ...upd },
      }]);
    }

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
          source_type: "event_fragment",
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

    case "START_FIELD_BATTLE":
    case "FIELD_BATTLE_DEPLOY":
    case "FIELD_BATTLE_FORMATION":
    case "FIELD_BATTLE_ORDER":
    case "FIELD_BATTLE_READY":
      return await executeFieldBattleCommand(supabase, base, actor, commandType, payload || {}, commandId, sessionId, turnNumber, insertEventsWithChronicle);

    case "START_SIEGE": {
      const { stackId, cityId } = payload || {};
      const { data: st } = await supabase.from("military_stacks").select("id, name, player_name, controller_player, grid_x, grid_y, hex_q, hex_r, is_active, is_deployed, soldiers")
        .eq("id", stackId).eq("session_id", sessionId).maybeSingle();
      if (!st || !st.is_active || !st.is_deployed) return { events: [], error: "Armáda není v poli" };
      if (st.player_name !== actor.name && st.controller_player !== actor.name) return { events: [], error: "Tato armáda není tvoje" };
      const { data: city } = await supabase.from("cities").select("id, name, owner_player, grid_x, grid_y, settlement_level, occupied_by").eq("id", cityId).eq("session_id", sessionId).maybeSingle();
      if (!city) return { events: [], error: "Město neexistuje" };
      if (city.owner_player === st.player_name) return { events: [], error: "Vlastní město nelze obléhat" };
      if (city.occupied_by) return { events: [], error: "Město už je obsazené" };
      if (!siegeInRange({ x: st.grid_x ?? st.hex_q, y: st.grid_y ?? st.hex_r }, { x: city.grid_x, y: city.grid_y })) return { events: [], error: "Armáda musí stát na čtverci sousedícím s městem" };
      const { data: war } = await supabase.from("war_declarations").select("id").eq("session_id", sessionId).eq("status", "active")
        .or(`and(declaring_player.eq."${st.player_name}",target_player.eq."${city.owner_player}"),and(declaring_player.eq."${city.owner_player}",target_player.eq."${st.player_name}")`).limit(1);
      if (!war?.length) return { events: [], error: "Obléhat lze jen město nepřítele, se kterým jsi ve válce" };
      const { data: siege, error: sErr } = await supabase.from("sieges").insert({ session_id: sessionId, city_id: city.id, attacker_player: st.player_name, defender_player: city.owner_player,
        attacker_stack_id: st.id, started_turn: turnNumber, walls: initialWalls(city.settlement_level) }).select("id").single();
      if (sErr) return { events: [], error: sErr.code === "23505" ? "Město už je obléháno" : sErr.message };
      return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
        ...base, event_type: "military", player: st.player_name, note: `${st.name} zahájila obléhání města ${city.name}.`, importance: "critical",
        reference: { siegeId: siege.id, cityId: city.id, stackId: st.id },
      }], payload.chronicleText);
    }

    case "SIEGE_ORDER": {
      const { siegeId, unitKey, target } = payload || {};
      const { data: siege } = await supabase.from("sieges").select("*").eq("id", siegeId).eq("session_id", sessionId).eq("status", "active").maybeSingle();
      if (!siege) return { events: [], error: "Obléhání neběží" };
      const { data: city } = await supabase.from("cities").select("id, grid_x, grid_y, military_garrison, owner_player").eq("id", siege.city_id).single();
      const units = await loadSiegeUnits(supabase, siege, city);
      const unit = units.find(u => u.key === unitKey);
      if (!unit) return { events: [], error: "Tato jednotka se obléhání neúčastní" };
      if (unit.stackId) {
        const { data: st } = await supabase.from("military_stacks").select("player_name, controller_player").eq("id", unit.stackId).single();
        if (st.player_name !== actor.name && st.controller_player !== actor.name) return { events: [], error: "Tuto jednotku neovládáš" };
      } else if (city.owner_player !== actor.name) return { events: [], error: "Posádku ovládá jen vlastník města" };
      const kind = target?.kind;
      const ok = (kind === "wall" && unit.side === "attacker" && (siege.walls || []).some((w: any) => w.id === Number(target.segment)))
        || (kind === "unit" && units.some(u => u.key === target.key && u.side !== unit.side))
        || (kind === "keep" && unit.side === "attacker")
        || (kind === "move" && Number.isInteger(Number(target.parcel)) && Number(target.parcel) >= 0 && Number(target.parcel) < 36);
      if (!ok) return { events: [], error: "Neplatný cíl" };
      const clean = kind === "wall" ? { kind, segment: Number(target.segment) } : kind === "unit" ? { kind, key: String(target.key) } : kind === "move" ? { kind, parcel: Number(target.parcel) } : { kind };
      await supabase.from("siege_orders").delete().eq("siege_id", siegeId).eq("turn_number", turnNumber).eq("unit_key", unitKey);
      const { data: row, error } = await supabase.from("siege_orders").insert({ siege_id: siegeId, session_id: sessionId, turn_number: turnNumber, side: unit.side, issued_by: actor.name, unit_key: unitKey, target: clean }).select("seq").single();
      if (error) return { events: [], error: error.message };
      return { events: [], result: { seq: row.seq } } as any;
    }

    case "SET_BATTLE_FORMATION": {
      const allowed = [...FORMATIONS, "column"];
      const { stackId, formation } = payload || {};
      if (!stackId || !allowed.includes(formation)) return { events: [], error: "Neplatná formace" };
      const { data: upd, error: updErr } = await supabase.from("military_stacks").update({ battle_formation: formation })
        .eq("id", stackId).eq("session_id", sessionId).or(`player_name.eq."${String(actor.name).replace(/"/g, "")}",controller_player.eq."${String(actor.name).replace(/"/g, "")}"`).select("id, name");
      if (updErr) return { events: [], error: updErr.message };
      if (!upd || upd.length === 0) return { events: [], error: "Armáda nepatří tomuto hráči" };
      return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
        ...base, event_type: "military", note: `${upd[0].name} mění formaci.`, importance: "low", reference: { stackId, formation },
      }], payload.chronicleText);
    }

    case "MOVE_STACK":
      return await executeMoveStack(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "MOVE_STACK_ROUTE":
      return await executeMoveStackRoute(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "BUILD_ROUTE":
      return await executeBuildRoute(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "UPGRADE_ROUTE":
      return await executeUpgradeRoute(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "ADJUST_ROUTE_WORKFORCE":
      return await executeAdjustRouteWorkforce(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "RENAME_ROUTE":
      return await executeRenameRoute(supabase, base, actor, payload, commandId, sessionId, turnNumber);

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

    case "OPEN_TRADE_WITH_NODE":
      return await executeOpenTradeWithNode(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "SEND_ENVOY_TO_NODE":
      return await executeSendEnvoyToNode(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "APPLY_MILITARY_PRESSURE":
      return await executeApplyMilitaryPressure(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "ANNEX_NODE":
      return await executeAnnexNode(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "BLOCK_NODE_ANNEXATION":
      return await executeBlockNodeAnnexation(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "ESTABLISH_PROTECTORATE":
      return await executeUpgradeNeutralLink(supabase, base, actor, payload, commandId, sessionId, turnNumber, "protected");

    case "VASSALIZE_NODE":
      return await executeUpgradeNeutralLink(supabase, base, actor, payload, commandId, sessionId, turnNumber, "vassalized");

    case "JOIN_TRADE_SYSTEM":
      return await executeJoinTradeSystem(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    // ─── Node-Trade v1 (Stage 6) ───
    case "MOBILIZE_MANPOWER":
      // Dead legacy endpoint: recruitment is the only physical way to create soldiers.
      return { events: [], error: "MOBILIZE_MANPOWER je vypnutý; použij RECRUIT_STACK nebo REINFORCE_STACK" };

    case "PROPOSE_TREATY":
      return await executeProposeTreaty(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "RESPOND_TREATY":
      return await executeRespondTreaty(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "CANCEL_TREATY":
      return await executeCancelTreaty(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "ASSIGN_STACK_TO_ROUTE":
      return await executeAssignStackToRoute(supabase, base, actor, payload, commandId, sessionId, turnNumber);

    case "CANCEL_ROUTE_CONSTRUCTION":
      return await executeCancelRouteConstruction(supabase, base, actor, payload, commandId, sessionId, turnNumber);

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

/** BUILD_ROAD_PATH — create or upgrade one explicitly drawn, cardinal road path. */
async function executeBuildRoadPath(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const rawPath = Array.isArray(payload.pathCells) ? payload.pathCells : [];
  const path = rawPath.map((cell: any) => ({ x: Number(cell?.x), y: Number(cell?.y) }));
  const rawSubPath = Array.isArray(payload.subPathCells) ? payload.subPathCells : [];
  const subPath = rawSubPath.map((cell: any) => ({
    gridX: Number(cell?.gridX), gridY: Number(cell?.gridY),
    parcelX: Number(cell?.parcelX), parcelY: Number(cell?.parcelY),
  }));
  const level = Number(payload.level || 1);
  const tier = tileInfrastructureLevel(level);
  if (!tier || path.length < 1 || path.length > 120) return { events: [], error: "Trasa musí mít 1 až 120 polí a úroveň 1–2" };
  if (path.some((cell: any) => !Number.isInteger(cell.x) || !Number.isInteger(cell.y))) return { events: [], error: "Trasa obsahuje neplatné pole" };
  for (let i = 1; i < path.length; i += 1) {
    if (Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y) !== 1) return { events: [], error: "Cesta musí vést přes sousední pole" };
  }
  if (subPath.length < 2 || subPath.length > 720 || subPath.some((cell: any) =>
    !Number.isInteger(cell.gridX) || !Number.isInteger(cell.gridY)
    || !Number.isInteger(cell.parcelX) || !Number.isInteger(cell.parcelY)
    || cell.parcelX < 0 || cell.parcelX >= TILE_PARCEL_COLS || cell.parcelY < 0 || cell.parcelY >= TILE_PARCEL_ROWS)) {
    return { events: [], error: "Trasa podčtverců je neplatná" };
  }
  const globalSubKey = (cell: any) => `${cell.gridX * TILE_PARCEL_COLS + cell.parcelX},${cell.gridY * TILE_PARCEL_ROWS + cell.parcelY}`;
  for (let i = 1; i < subPath.length; i += 1) {
    const previous = subPath[i - 1]; const current = subPath[i];
    const dx = Math.abs((current.gridX * TILE_PARCEL_COLS + current.parcelX) - (previous.gridX * TILE_PARCEL_COLS + previous.parcelX));
    const dy = Math.abs((current.gridY * TILE_PARCEL_ROWS + current.parcelY) - (previous.gridY * TILE_PARCEL_ROWS + previous.parcelY));
    if (dx + dy !== 1) return { events: [], error: "Cesta musí vést přes sousední podčtverce" };
  }
  const derivedPath: Array<{ x: number; y: number }> = [];
  subPath.forEach((cell: any) => {
    const previous = derivedPath[derivedPath.length - 1];
    if (!previous || previous.x !== cell.gridX || previous.y !== cell.gridY) derivedPath.push({ x: cell.gridX, y: cell.gridY });
  });
  if (derivedPath.length !== path.length || derivedPath.some((cell, index) => cell.x !== path[index]?.x || cell.y !== path[index]?.y)) {
    return { events: [], error: "Trasa polí neodpovídá trase podčtverců" };
  }

  const xs = path.map((cell: any) => cell.x); const ys = path.map((cell: any) => cell.y);
  const { data: tiles, error: tileError } = await supabase.from("province_hexes")
    .select("grid_x, grid_y, biome_family, mean_height, has_river, river_direction, is_passable, owner_player")
    .eq("session_id", sessionId).gte("grid_x", Math.min(...xs) - 1).lte("grid_x", Math.max(...xs) + 1)
    .gte("grid_y", Math.min(...ys) - 1).lte("grid_y", Math.max(...ys) + 1);
  if (tileError) return { events: [], error: tileError.message };
  const tileByKey = new Map<string,any>((tiles || []).map((tile: any) => [`${tile.grid_x},${tile.grid_y}`, tile]));
  const pathTiles = path.map((cell: any) => tileByKey.get(`${cell.x},${cell.y}`));
  if (pathTiles.some((tile: any) => !tile || tile.is_passable === false || tile.biome_family === "sea")) return { events: [], error: "Trasa vede přes neprůchodné nebo mořské pole" };

  const edges = path.slice(1).map((to: any, index: number) => {
    const from = path[index];
    return from.x < to.x || (from.x === to.x && from.y < to.y)
      ? { from_x: from.x, from_y: from.y, to_x: to.x, to_y: to.y }
      : { from_x: to.x, from_y: to.y, to_x: from.x, to_y: from.y };
  });
  const { data: existingSegments } = await supabase.from("road_segments").select("id, from_x, from_y, to_x, to_y, level, status")
    .eq("session_id", sessionId);
  const existingByEdge = new Map<string,any>((existingSegments || []).map((edge: any) => [`${edge.from_x},${edge.from_y}>${edge.to_x},${edge.to_y}`, edge]));
  for (const edge of edges) {
    const existing = existingByEdge.get(`${edge.from_x},${edge.from_y}>${edge.to_x},${edge.to_y}`);
    const where = `mezi poli ${edge.from_x},${edge.from_y} a ${edge.to_x},${edge.to_y}`;
    if (existing && Number(existing.level) >= level) return { events: [], error: `Tady už cesta ${where} je (úroveň ${existing.level}) — existující úsek znovu nestavíš.` };
  }

  const riverSubCells = new Set<string>();
  path.forEach((cell: any) => {
    const tile = tileByKey.get(`${cell.x},${cell.y}`);
    if (!tile) return;
    const neighbours = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }].flatMap(step => {
      const neighbour = tileByKey.get(`${cell.x + step.dx},${cell.y + step.dy}`);
      return neighbour ? [{ dx: step.dx, dy: step.dy, terrain: { ...neighbour, elevation: neighbour.mean_height } }] : [];
    });
    riverChannelCells(sessionId, cell.x, cell.y, { ...tile, elevation: tile.mean_height }, neighbours)
      .forEach((sub: any) => riverSubCells.add(`${cell.x},${cell.y},${sub.x},${sub.y}`));
  });
  const bridgeCount = new Set(subPath.filter((cell: any) => riverSubCells.has(`${cell.gridX},${cell.gridY},${cell.parcelX},${cell.parcelY}`)).map(globalSubKey)).size;
  const uniquePathTiles: any[] = [...new Map<string, any>(path.map((cell: any, index: number): [string, any] => [`${cell.x},${cell.y}`, pathTiles[index]])).values()];
  const terrainFactor = uniquePathTiles.reduce((sum: number, tile: any) => sum + (["mountain", "mountains"].includes(tile.biome_family) ? 1.8 : tile.biome_family === "swamp" ? 1.5 : tile.biome_family === "hills" ? 1.25 : 1), 0) / uniquePathTiles.length;
  const length = new Set(edges.map((edge: any) => `${edge.from_x},${edge.from_y}>${edge.to_x},${edge.to_y}`)).size;
  const subLength = Math.max(0, new Set(subPath.map(globalSubKey)).size - 1);
  const edgeEquivalent = subLength / TILE_PARCEL_COLS;
  const cost = {
    gold: Math.ceil(tier.gold * edgeEquivalent * terrainFactor + bridgeCount * 45),
    production: Math.ceil(tier.production * edgeEquivalent * terrainFactor + bridgeCount * 30),
  };
  const realm = await getRealmFull(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };
  if (Number(realm.gold_reserve || 0) < cost.gold || Number(realm.production_reserve || 0) < cost.production) return { events: [], error: `Potřeba ${cost.gold} zlata a ${cost.production} produkce` };

  const totalWork = Math.max(1, tier.turns * 100);
  const { data: project, error: projectError } = await supabase.from("road_projects").insert({
    session_id: sessionId, owner_player: actor.name, level, path_cells: path, sub_path_cells: subPath, status: "building", progress: 0,
    total_work: totalWork, work_done: 0, cost_gold: cost.gold, cost_production: cost.production,
    bridge_count: bridgeCount, started_turn: turnNumber,
  }).select("id").single();
  if (projectError || !project) return { events: [], error: projectError?.message || "Projekt cesty se nepodařilo založit" };

  const segmentRows = [...new Map(edges.map((edge: any, index: number) => {
    const key = `${edge.from_x},${edge.from_y}>${edge.to_x},${edge.to_y}`;
    return [key, {
      session_id: sessionId, project_id: project.id, owner_player: actor.name, ...edge, level,
      status: "building", progress: 0, capacity: tier.capacity,
      speed: tier.speed,
      friction: Number((terrainFactor * tier.friction).toFixed(3)),
      maintenance: tier.maintenance.gold,
      bridge_count: new Set(subPath.filter((cell: any) => (cell.gridX === path[index].x && cell.gridY === path[index].y) || (cell.gridX === path[index + 1].x && cell.gridY === path[index + 1].y))
        .filter((cell: any) => riverSubCells.has(`${cell.gridX},${cell.gridY},${cell.parcelX},${cell.parcelY}`)).map(globalSubKey)).size,
      path_cells: [path[index], path[index + 1]],
      sub_path_cells: subPath.filter((cell: any) => (cell.gridX === path[index].x && cell.gridY === path[index].y) || (cell.gridX === path[index + 1].x && cell.gridY === path[index + 1].y)),
      utilization: 0,
    }] as const;
  })).values()];
  const segmentError = segmentRows.length
    ? (await supabase.from("road_segments").upsert(segmentRows, { onConflict: "session_id,from_x,from_y,to_x,to_y" })).error
    : null;
  if (segmentError) { await supabase.from("road_projects").delete().eq("id", project.id); return { events: [], error: segmentError.message }; }
  const { error: resourceError } = await supabase.from("realm_resources").update({ gold_reserve: Number(realm.gold_reserve || 0) - cost.gold, production_reserve: Number(realm.production_reserve || 0) - cost.production }).eq("id", realm.id);
  if (resourceError) {
    await supabase.from("road_segments").delete().eq("project_id", project.id);
    await supabase.from("road_projects").delete().eq("id", project.id);
    return { events: [], error: resourceError.message };
  }

  return insertEvents(supabase, commandId, [{ ...base, event_type: "construction", note: `${actor.name} zahájil stavbu ${tier.label.toLowerCase()} o délce ${length} polí.`, importance: "normal", reference: { projectId: project.id, pathCells: path, subPathCells: subPath, level, bridges: bridgeCount, costGold: cost.gold, costProduction: cost.production } }], { projectId: project.id, length, level, bridgeCount, cost });
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
  const parcelIndexRaw = Number(payload.parcelIndex);
  const foundedParcelIndex = Number.isInteger(parcelIndexRaw) && parcelIndexRaw >= 0 && parcelIndexRaw < TILE_PARCEL_COUNT
    ? parcelIndexRaw
    : null;

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
    const [{ data: occupiedCities }, { data: ownedHexes }, { data: ruralRows }] = await Promise.all([
      supabase.from("cities").select("province_q, province_r").eq("session_id", sessionId),
      supabase.from("province_hexes").select("q,r,province_id,biome_family,is_passable,owner_player")
        .eq("session_id", sessionId).eq("owner_player", actor.name).eq("is_passable", true),
      supabase.from("hex_population").select("q,r,rural_population").eq("session_id", sessionId),
    ]);
    const occupied = new Set((occupiedCities || []).map((c:any)=>`${c.province_q},${c.province_r}`));
    const hexByKey = new Map<string, any>((ownedHexes || []).map((h:any):[string,any]=>[`${h.q},${h.r}`,h]));
    const ruralByKey = new Map<string, number>((ruralRows || []).map((h:any):[string,number]=>[`${h.q},${h.r}`,Number(h.rural_population)||0]));
    const candidates = (ownedHexes || []).filter((h:any)=>
      !occupied.has(`${h.q},${h.r}`) && ["plains","hills","forest","swamp"].includes(h.biome_family)
    ).map((h:any)=>{
      let localPopulation=0;
      // A radius-two axial hex neighbourhood has only 19 cells; use direct keyed lookups
      // instead of scanning every rural row for every candidate tile.
      for(let dq=-2;dq<=2;dq++)for(let dr=-2;dr<=2;dr++){
        if(Math.max(Math.abs(dq),Math.abs(dr),Math.abs(dq+dr))>2)continue;
        const cell=`${h.q+dq},${h.r+dr}`;
        const source=hexByKey.get(cell) as any;
        if(source && source.province_id===h.province_id)localPopulation+=ruralByKey.get(cell)||0;
      }
      return {...h,localPopulation};
    }).filter((h:any)=>h.localPopulation>=FOUNDING_HAMLET_POPULATION)
      .sort((a:any,b:any)=>b.localPopulation-a.localPopulation||a.q-b.q||a.r-b.r);
    if(!candidates.length) return {events:[],error:"Na vlastním kontrolovaném území není volné místo s alespoň 100 místními venkovskými obyvateli."};
    freeQ=candidates[0].q; freeR=candidates[0].r;
  }

  // ── 1. Atomic city founding + rural population transfer ──
  // One SECURITY DEFINER RPC locks the local rural rows, subtracts settlers and inserts the
  // city in the same database transaction. A repeated command_id returns the same city without
  // deducting residents twice; insufficient local population rolls back everything.
  const { data: foundingData, error: foundingErr } = await supabase.rpc("found_city_with_rural_settlers", {
    p_session_id: sessionId,
    p_command_id: String(base.command_id),
    p_turn_number: turnNumber,
    p_owner_player: actor.name,
    p_city_name: cityName.trim(),
    p_province_id: provinceId || null,
    p_province: provinceName || "",
    p_tags: tags?.length > 0 ? tags : null,
    p_flavor_prompt: flavorPrompt?.trim() || null,
    p_q: freeQ,
    p_r: freeR,
    p_founded_parcel_index: foundedParcelIndex,
    p_settlers: FOUNDING_HAMLET_POPULATION,
  });
  if (foundingErr) {
    const message = foundingErr.message || "Neznámá chyba převodu osadníků";
    const userMessage = message.includes("INSUFFICIENT_RURAL_SETTLERS")
      ? "V okolí není dost venkovských obyvatel. Osada potřebuje 100 skutečných osadníků z vlastního území."
      : message.includes("FOUNDING_TARGET_ENEMY_CONTROLLED")
        ? "Na cílovém hexu je nepřátelská kontrola; zvol neutrální nebo vlastní území s dostatkem místních osadníků."
        : message.includes("FOUNDING_TARGET_OCCUPIED")
          ? "Na tomto poli už stojí město nebo osada."
          : message.includes("FOUNDING_TARGET_NOT_SETTLEABLE")
            ? "Na tomto typu terénu nelze založit osadu."
          : message.includes("FOUNDING_TARGET_PROVINCE_MISMATCH")
            ? "Cílové pole nepatří do vybrané provincie."
            : message.includes("FOUNDING_TARGET_HEX_NOT_FOUND")
              ? "Cílové pole na mapě neexistuje."
              : `Založení osady selhalo: ${message}`;
    return { events: [], error: userMessage };
  }
  const cityId = foundingData?.city_id;
  const settlersTransferred = Number(foundingData?.transferred || 0);
  if (!cityId || settlersTransferred !== FOUNDING_HAMLET_POPULATION) {
    return { events: [], error: "Atomické založení nevrátilo úplný převod 100 osadníků." };
  }

  // ── 1b. Physical footprint on the 32 sub-parcel grid of the founding cell ──
  const seatResult = await seatCityOnParcels(supabase, {
    sessionId, cityId, cityName: cityName.trim(), ownerPlayer: actor.name,
    gridX: freeQ, gridY: freeR, population: FOUNDING_HAMLET_POPULATION, turnNumber,
    preferredIndex: foundedParcelIndex,
  });
  if (seatResult.seatIndex !== null && seatResult.seatIndex !== foundedParcelIndex) {
    await supabase.from("cities").update({ founded_parcel_index: seatResult.seatIndex }).eq("id", cityId);
  }

  // ── 1c. Settlement node in the physical graph (structural, idempotent) ──
  await ensureCitySettlementNodes(supabase, sessionId);
  const foundingReason = `Založení osady: ${cityName.trim()} [${String(base.command_id)}]`;
  const { data: foundingNode } = await supabase.from("province_nodes")
    .select("id").eq("session_id", sessionId).eq("city_id", cityId)
    .eq("node_subtype", "city").maybeSingle();
  if (foundingNode?.id) {
    const { data: priorFoundingFlow } = await supabase.from("node_migrations")
      .select("id").eq("session_id", sessionId).eq("reason", foundingReason).maybeSingle();
    if (!priorFoundingFlow) await safeInsert(supabase.from("node_migrations").insert({
      session_id: sessionId, turn_number: turnNumber, from_node: null, to_node: foundingNode.id,
      population_delta: settlersTransferred, reason: foundingReason,
    }));
  }

  // ── 1d. Starter production bundle: a settlement subsists on real structures,
  // never on population emitting goods out of nothing (idempotent).
  await ensureStarterEconomy(supabase, sessionId, { cityId, turnNumber });

  // ── 1e. Capital invariant: a realm's first city becomes its capital; an
  // existing capital is never displaced by a newly founded settlement.
  await ensureSingleCapital(supabase, sessionId, { owners: [actor.name] });


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
    text: `V provincii ${provinceName || ""} byla založena nová osada ${cityName.trim()} a z okolního venkova se do ní přestěhovalo ${settlersTransferred} obyvatel.`,
    player_source: actor.name,
    related_entity_type: "city",
    related_entity_id: cityId,
  }));

  // ── 4. Chronicle entry ──
  const chronicleText = legend?.trim()
    ? `V roce ${turnNumber} byla založena osada **${cityName.trim()}** v provincii ${provinceName || ""}, pod vládou ${actor.name}. ${legend.trim()}`
    : `V roce ${turnNumber} byla založena osada **${cityName.trim()}** v provincii ${provinceName || ""}, pod vládou ${actor.name}. Nová osada se rodí z okolního venkova: ${settlersTransferred} obyvatel opustilo své dosavadní domovy a přestěhovalo se do ní.`;

  await safeInsert(supabase.from("chronicle_entries").insert({
    session_id: sessionId,
    turn_from: turnNumber,
    turn_to: turnNumber,
    text: chronicleText,
    source_type: "event_fragment",
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
    note: payload.note || `${actor.name} založil město ${cityName.trim()} a přivedl do něj ${settlersTransferred} osadníků z okolního venkova.`,
    importance: "critical",
    reference: {
      cityName: cityName.trim(), cityId, provinceId, provinceName,
      flavorPrompt: flavorPrompt?.trim(), legend: legend?.trim(),
      tags, provinceQ: freeQ, provinceR: freeR, settlersTransferred,
      ruralSourceCells: foundingData?.source_cells || [], populationSource: "rural_transfer",
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
  const { stackId, toQ, toR, fromQ, fromR, plannedPath } = payload;
  if (!stackId) return { events: [], error: "Missing stackId" };

  // Micro-square movement: the path is validated tile-by-tile on the 6x6 sub-squares.
  if (Array.isArray(payload.microPath)) {
    const micro = await applyStackMicroMove(supabase, { sessionId, stackId, microPath: payload.microPath, actorName: actor.name });
    if (micro.ok === false) return { events: [], error: micro.error };
    return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
      ...base,
      event_type: "military",
      note: payload.note || `${actor.name} přesunul armádu ${payload.stackName || ""} o ${micro.steps} políček na pole [${micro.gridX},${micro.gridY}].`,
      importance: "normal",
      reference: { stackId, microPath: payload.microPath, final: micro.final, gridX: micro.gridX, gridY: micro.gridY, parcelIndex: micro.parcelIndex, spent: micro.spent },
    }], payload.chronicleText);
  }

  // Build planned path: prefer client-supplied plannedPath if it looks valid,
  // otherwise synthesize start→target using fromQ/fromR + toQ/toR (single hop).
  let path: { q: number; r: number }[] | null = null;
  if (Array.isArray(plannedPath) && plannedPath.length >= 2) {
    path = plannedPath
      .filter((h: any) => typeof h?.q === "number" && typeof h?.r === "number")
      .map((h: any) => ({ q: h.q, r: h.r }));
  }
  if (!path || path.length < 2) {
    if (toQ === undefined || toR === undefined) return { events: [], error: "Missing toQ/toR" };
    // Fetch current position to anchor the path
    const { data: stackPos } = await supabase.from("military_stacks")
      .select("hex_q, hex_r").eq("id", stackId).eq("session_id", sessionId).maybeSingle();
    if (!stackPos) return { events: [], error: "Stack not found" };
    const sq = fromQ ?? stackPos.hex_q;
    const sr = fromR ?? stackPos.hex_r;
    path = [{ q: sq, r: sr }, { q: toQ, r: toR }];
  }

  const result = await applyStackMove(supabase, {
    sessionId,
    stackId,
    plannedPath: path,
    actorName: actor.name,
  });

  if (result.ok === false) return { events: [], error: result.error };

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "military",
    note: payload.note ||
      `${actor.name} přesunul armádu ${payload.stackName || ""} na [${result.finalHex.q},${result.finalHex.r}]` +
      (result.usedRoadBonus ? " (po silnici)" : "") + ".",
    importance: "normal",
    reference: { ...payload, finalHex: result.finalHex, usedRoadBonus: result.usedRoadBonus, allowedSteps: result.allowedSteps },
  }], payload.chronicleText);
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

  // Phase 6 — an active alliance / defense pact / vassalage blocks the declaration.
  const { pacts } = await loadDiplomacyState(supabase, sessionId);
  const warCheck = checkWarDeclaration(pacts, actor.name, targetPlayer);
  if (warCheck.ok === false) {
    return { events: [], error: warCheck.error, status: 409 };
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
    text: chronicleText, source_type: "event_fragment",
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

const FORMATION_PRESETS = SHARED_FORMATION_PRESETS;

// Mixed recruitment cost: HALVED (Apr 2026 balance pass — wealth & prod /2; manpower untouched)
const UNIT_GOLD_FACTOR: Record<string, number> = SHARED_GOLD;
const UNIT_PROD_FACTOR: Record<string, number> = SHARED_PROD;

const UNIT_TYPE_LABELS: Record<string, string> = SHARED_LABELS;
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

  // ── Free-form manpower override ──────────────────────────────────────
  // Player may specify any positive manpower count (Stage 8 redesign).
  // The preset still governs unit composition ratios + morale + buildings.
  const presetTotal = preset.composition.reduce((s, c) => s + c.manpower, 0);
  const requestedManpower = Math.floor(Number(payload.manpower) || presetTotal);
  if (!Number.isFinite(requestedManpower) || requestedManpower <= 0) {
    return { events: [], error: "manpower must be a positive integer" };
  }
  // Scale composition proportionally to requested size.
  const scale = requestedManpower / presetTotal;
  const scaledComposition = preset.composition.map((c) => ({
    unit_type: c.unit_type,
    manpower: Math.max(1, Math.round(c.manpower * scale)),
  }));
  const totalManpower = scaledComposition.reduce((s, c) => s + c.manpower, 0);

  // General identity, ownership, availability and capacity are always resolved server-side.
  let selectedGeneral: { id: string; name: string; skill: number } | null = null;
  const generalId = payload.generalId == null || payload.generalId === "" ? null : String(payload.generalId);
  if (generalId) {
    const { data: general, error: generalError } = await supabase.from("generals")
      .select("id, name, skill").eq("id", generalId).eq("session_id", sessionId).eq("player_name", playerName).maybeSingle();
    if (generalError) throw generalError;
    if (!general) return { events: [], error: "Generál nepatří tvé říši nebo neexistuje" };
    const { data: assigned, error: assignedError } = await supabase.from("military_stacks")
      .select("id").eq("session_id", sessionId).eq("general_id", generalId).limit(1);
    if (assignedError) throw assignedError;
    if (assigned?.length) return { events: [], error: "Generál už velí jiné armádě" };
    selectedGeneral = general;
  }
  const capacity = generalArmyCapacity(selectedGeneral?.skill ?? null);
  if (totalManpower > capacity) return { events: [], error: `Armáda překračuje velitelskou kapacitu ${capacity} mužů` };

  // Building prerequisites by real completed building names (Kasárny, Kovárna, Střelnice, Jízdárna, Obléhací dílna).
  const required = presetRequirements(preset);
  if (required.length > 0) {
    const { data: playerCities } = await supabase.from("cities").select("id").eq("session_id", sessionId).eq("owner_player", playerName);
    const { data: buildings } = await supabase.from("city_buildings").select("name").eq("session_id", sessionId)
      .in("city_id", (playerCities || []).map((c: any) => c.id)).eq("status", "completed");
    const missing = missingBuildings(required, (buildings || []).map((b: any) => String(b.name || "")));
    if (missing.length > 0) return { events: [], error: `Chybí dokončené budovy: ${missing.join(", ")}.` };
  }

  // Costs scale linearly with manpower; presets keep their override budgets if set.
  const baseGoldCost = scaledComposition.reduce((s, c) => s + c.manpower * (UNIT_GOLD_FACTOR[c.unit_type] || 1), 0);
  const baseProdCost = scaledComposition.reduce((s, c) => s + c.manpower * (UNIT_PROD_FACTOR[c.unit_type] || 0.5), 0);
  const totalGold = preset.gold_override != null
    ? Math.round(preset.gold_override * scale)
    : Math.round(baseGoldCost);
  const totalProdCost = preset.prod_override != null
    ? Math.round(preset.prod_override * scale)
    : Math.round(baseProdCost);

  // ── Load realm resources ──
  const realm = await getRealmByActor(supabase, sessionId, actor, "*");
  if (!realm) return { events: [], error: "Realm resources not found" };

  // ── Manpower validation: free-form against pool (no mobilization cap) ──
  const currentWorkforce = await readRealmWorkforce(supabase,sessionId,playerName,realm.mobilization_rate??0.1);
  const manpowerPool = currentWorkforce.workforce;
  if (totalManpower > manpowerPool) {
    return { events: [], error: `Nedostatek mužů v poolu: potřeba ${totalManpower}, dostupno ${manpowerPool}.` };
  }
  if (totalGold > (realm.gold_reserve || 0)) {
    return { events: [], error: `Nedostatek zlata: potřeba ${totalGold}, dostupno ${realm.gold_reserve || 0}` };
  }
  // Recruitment is a one-off capital expense. grain_reserve is a derived projection
  // of the goods ledger and must never be spent independently of its physical stock.
  const productionReserve = realm.production_reserve || 0;
  if (totalProdCost > productionReserve) {
    return { events: [], error: `Nedostatek produkční zásoby: potřeba ${totalProdCost}, dostupno ${Math.round(productionReserve)}` };
  }

  // ── Faith morale bonus ──
  const faithMoraleBonus = Math.round((realm.faith || 0) * 0.003 * 10);
  const adjustedMorale = Math.min(100, preset.morale + faithMoraleBonus);

  // ── Warrior ratio doctrine bonus ──
  const { data: cities } = await supabase
    .from("cities")
    .select("population_total, population_warriors, status")
    .eq("session_id", sessionId).eq("owner_player", playerName);
  const totalPop = (cities || []).reduce((s: any, c: any) => s + (c.population_total || 0), 0);
  const totalWarriors = (cities || []).reduce((s: any, c: any) => s + (c.population_warriors || 0), 0);
  const warriorRatio = totalPop > 0 ? totalWarriors / totalPop : 0;
  const disciplineBonus = Math.round(warriorRatio * 20);
  const finalMorale = Math.min(100, adjustedMorale + disciplineBonus);

  // ── 1. Create stack ──
  const stackPower = computeStackPower(scaledComposition, finalMorale);
  const { data: stack, error: stackErr } = await supabase.from("military_stacks").insert({
    session_id: sessionId, player_name: playerName, owner_player: playerName,
    name: stackName.trim(),
    formation_type: preset.formation_type, morale: finalMorale,
    soldiers: totalManpower,
    unit_count: totalManpower,
    power: stackPower,
    general_id: selectedGeneral?.id ?? null,
    assignment: "idle",
  }).select("id").single();

  if (stackErr || !stack) return { events: [], error: `Stack creation failed: ${stackErr?.message}` };
  const stackId = stack.id;

  // ── 2. Create compositions ──
  for (const comp of scaledComposition) {
    await safeInsert(supabase.from("military_stack_composition").insert({
      stack_id: stackId, unit_type: comp.unit_type, manpower: comp.manpower,
    }));
  }

  // ── 3. Recompute every HUD military field from the newly inserted active stack ──
  const newGold = (realm.gold_reserve || 0) - totalGold;
  const newProduction = Math.max(0, productionReserve - totalProdCost);
  await syncRealmMilitaryLedger(supabase, sessionId, playerName, {
    gold_reserve: newGold,
    production_reserve: newProduction,
  });

  // ── 4. Chronicle ──
  const chronicleText = `${playerName} zřídil armádu **${stackName.trim()}** (${preset.label}). Síla: ${totalManpower} mužů, náklady: ${totalGold} zlata + ${totalProdCost} produkce. Morálka: ${finalMorale}.`;
  await safeInsert(supabase.from("chronicle_entries").insert({
    session_id: sessionId, turn_from: turnNumber, turn_to: turnNumber, text: chronicleText,
    source_type: "event_fragment",
  }));

  // ── 5. Legacy compat ──
  const mainUnit = scaledComposition[0];
  await safeInsert(supabase.from("military_capacity").insert({
    session_id: sessionId, player_name: playerName, army_name: stackName.trim(),
    army_type: UNIT_TYPE_LABELS[mainUnit.unit_type] || mainUnit.unit_type,
    iron_cost: Math.ceil(totalManpower / 200), migrated: true,
  }));

  // ── 6. Event ──
  const events = [{
    ...base,
    event_type: "military",
    note: `${playerName} zřídil armádu ${stackName.trim()} (${preset.label}, ${totalManpower} mužů). Náklady: ${totalGold} 💰 + ${totalProdCost} ⚒️. Morálka: ${finalMorale}.`,
    importance: "normal",
    reference: { stackId, stackName: stackName.trim(), presetKey, totalManpower, totalGold, totalProdCost, morale: finalMorale },
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
      source_type: "event_fragment",
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
    text: chronicleText, source_type: "event_fragment",
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
    text: chronicleText, source_type: "event_fragment",
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
    text: note, source_type: "event_fragment",
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
    .select("name, hex_q, hex_r, owner_player").eq("id", targetNodeId).single();

  // Phase 6 — strategic march into foreign territory needs war, open borders or an alliance.
  const { pacts: routePacts, wars: routeWars } = await loadDiplomacyState(supabase, sessionId);
  const routeAccess = checkTerritoryAccess(routePacts, routeWars, actor.name, [targetNode?.owner_player]);
  if (routeAccess.ok === false) {
    return { events: [], error: routeAccess.error, status: 409 };
  }



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
  // Node-Trade v1: BUILD_ROUTE creates a planned/under_construction route.
  // Construction is powered by LABOR (pracovní síla) drawn from realm.labor_reserve.
  // Soldiers/manpower are reserved exclusively for combat & garrison duties.
  // Unified workforce model (May 2026):
  // 1 hex = 25 workforce. Player allocates `workforcePerTurn` to project (min 5).
  // Each turn that allocation is added to progress; project completes when progress ≥ totalWork.
  const { nodeAId, nodeBId, routeType, workforcePerTurn, labor, assignedLabor, soldiers, hexPath, name, waypoints } = payload;
  if (!nodeAId || !nodeBId) return { events: [], error: "Missing nodeAId or nodeBId" };

  const { data: nodeA } = await supabase.from("province_nodes")
    .select("id, name, controlled_by, province_id").eq("id", nodeAId).eq("session_id", sessionId).single();
  const { data: nodeB } = await supabase.from("province_nodes")
    .select("id, name, controlled_by, province_id").eq("id", nodeBId).eq("session_id", sessionId).single();
  if (!nodeA || !nodeB) return { events: [], error: "Node not found" };
  if (nodeA.controlled_by !== actor.name && nodeB.controlled_by !== actor.name) {
    return { events: [], error: "You must control at least one endpoint node" };
  }

  // Idempotency on (session, ordered pair)
  const ordA = nodeAId < nodeBId ? nodeAId : nodeBId;
  const ordB = nodeAId < nodeBId ? nodeBId : nodeAId;
  const { data: existing } = await supabase.from("province_routes")
    .select("id, construction_state").eq("session_id", sessionId).eq("node_a", ordA).eq("node_b", ordB).maybeSingle();
  if (existing) {
    return { events: [], error: existing.construction_state === "complete"
      ? "Route already exists between these nodes"
      : "A route between these nodes is already under construction" };
  }

  // Gold cost (small flat fee, per route type)
  const buildCostMap: Record<string, number> = {
    land_road: 50, river_route: 30, sea_lane: 20, mountain_pass: 80, caravan_route: 60,
    trail: 30, road: 50, paved: 100,
  };
  const type = routeType || "land_road";
  const goldCost = buildCostMap[type] || 50;

  // Compute planned hex path (A* / waypoints / chebyshev fallback)
  let plannedHexPath: { q: number; r: number }[] = [];
  if (Array.isArray(hexPath) && hexPath.length >= 2) {
    plannedHexPath = hexPath
      .filter((h: any) => Number.isFinite(h?.q) && Number.isFinite(h?.r))
      .map((h: any) => ({ q: h.q, r: h.r }));
  }
  if (plannedHexPath.length < 2) {
    const { data: nodeAPos } = await supabase.from("province_nodes")
      .select("hex_q, hex_r").eq("id", nodeAId).maybeSingle();
    const { data: nodeBPos } = await supabase.from("province_nodes")
      .select("hex_q, hex_r").eq("id", nodeBId).maybeSingle();
    if (nodeAPos && nodeBPos) {
      const aq = nodeAPos.hex_q, ar = nodeAPos.hex_r;
      const bq = nodeBPos.hex_q, br = nodeBPos.hex_r;
      const dq = bq - aq, dr = br - ar;
      const steps = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
      plannedHexPath = [];
      for (let i = 0; i <= steps; i++) {
        const t = steps === 0 ? 0 : i / steps;
        plannedHexPath.push({ q: Math.round(aq + dq * t), r: Math.round(ar + dr * t) });
      }
      plannedHexPath = plannedHexPath.filter((h, i, arr) =>
        i === 0 || h.q !== arr[i - 1].q || h.r !== arr[i - 1].r);
    }
  }

  // === Sjednocený workforce model: 25 prac. síly na hex ===
  const WORKFORCE_PER_HEX = 25;
  const hexCount = Math.max(1, plannedHexPath.length - 1); // počet hex-edges (= "hex" pro user-facing výpočet)
  const totalWork = WORKFORCE_PER_HEX * hexCount;

  // Per-turn allocation. Backward-compat: starý `labor` parametr se interpretuje jako per-turn alokace.
  const requestedPerTurn = Math.max(
    5,
    Math.floor(Number(workforcePerTurn ?? labor ?? assignedLabor ?? soldiers ?? WORKFORCE_PER_HEX)),
  );

  const realm = await getRealmByActor(supabase, sessionId, actor, "id, gold_reserve, mobilization_rate, player_name");
  if (!realm) return { events: [], error: "Realm not found" };
  if ((realm.gold_reserve ?? 0) < goldCost) return { events: [], error: `Nedostatek zlata (potřeba: ${goldCost})` };

  // Workforce = aktivní pop − mobilizovaní (computed). Není to ledger; per-turn alokace se odčítá v process-turn.
  const { data: ownedCities } = await supabase.from("cities")
    .select("status, population_peasants, population_burghers, population_clerics")
    .eq("session_id", sessionId).eq("owner_player", realm.player_name);
  const ACTIVE_POP_WEIGHTS = { peasants: 1.0, burghers: 0.8, clerics: 0.4 };
  const DEFAULT_ACTIVE_POP_RATIO = 0.5;
  let activePopRaw = 0;
  for (const c of (ownedCities || [])) {
    if (c.status && c.status !== "ok") continue;
    activePopRaw += (c.population_peasants || 0) * ACTIVE_POP_WEIGHTS.peasants
                  + (c.population_burghers || 0) * ACTIVE_POP_WEIGHTS.burghers
                  + (c.population_clerics || 0) * ACTIVE_POP_WEIGHTS.clerics;
  }
  const effectiveActivePop = Math.floor(activePopRaw * DEFAULT_ACTIVE_POP_RATIO);
  const mobRate = Number(realm.mobilization_rate ?? 0.1);
  const mobilized = Math.floor(effectiveActivePop * mobRate);
  const workforceAvailable = Math.max(0, effectiveActivePop - mobilized);
  if (workforceAvailable < requestedPerTurn) {
    return { events: [], error: `Nedostatek pracovní síly (k dispozici: ${workforceAvailable}, požaduješ ${requestedPerTurn}/tah).` };
  }

  await supabase.from("realm_resources").update({
    gold_reserve: realm.gold_reserve - goldCost,
  }).eq("id", realm.id);

  // Sanitize name (max 60 chars, trimmed). Empty → NULL → UI fallback "Via A – B".
  const trimmedName = typeof name === "string" ? name.trim().slice(0, 60) : "";
  const finalName = trimmedName.length > 0 ? trimmedName : null;

  // Sanitize waypoints (array of {q,r}); empty → NULL.
  let finalWaypoints: any = null;
  if (Array.isArray(waypoints) && waypoints.length > 0) {
    finalWaypoints = waypoints
      .filter((w: any) => w && Number.isFinite(w.q) && Number.isFinite(w.r))
      .map((w: any) => ({ q: Math.trunc(w.q), r: Math.trunc(w.r) }));
    if (finalWaypoints.length === 0) finalWaypoints = null;
  }

  await supabase.from("province_routes").insert({
    session_id: sessionId,
    node_a: ordA, node_b: ordB,
    route_type: type,
    capacity_value: 5,
    military_relevance: 3, economic_relevance: 3,
    vulnerability_score: 4,
    control_state: "open",
    build_cost: goldCost, upgrade_level: 1,
    route_origin: "player_built",
    construction_state: "under_construction",
    name: finalName,
    waypoints: finalWaypoints,
    planned_hex_path: plannedHexPath.length >= 2 ? plannedHexPath : null,
    path_dirty: true,
    metadata: {
      built_by: actor.name,
      started_turn: turnNumber,
      workforce_per_turn: requestedPerTurn,
      assigned_labor: requestedPerTurn, // back-compat
      total_work: totalWork,
      progress: 0,
      hex_path: plannedHexPath.length >= 2 ? plannedHexPath : null,
      planned_hex_path: plannedHexPath.length >= 2 ? plannedHexPath : null,
      path_edge_count: hexCount,
      hex_count: hexCount,
      waypoints: finalWaypoints,
      custom_name: finalName,
    },
  });

  const etaTurns = Math.max(1, Math.ceil(totalWork / requestedPerTurn));
  const note = `${actor.name} zahájil stavbu cesty (${type}) mezi ${nodeA.name} a ${nodeB.name}. ${hexCount} hexů × 25 prac. síly = ${totalWork}. Alokováno ${requestedPerTurn}/tah → hotovo za ${etaTurns} kol.`;
  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "construction",
    note, importance: "normal",
    reference: { nodeAId, nodeBId, routeType: type, goldCost, workforcePerTurn: requestedPerTurn, totalWork, hexCount, etaTurns },
  }], payload.chronicleText);
}

// ═══════════════════════════════════════════
// ADJUST_ROUTE_WORKFORCE — change per-turn workforce allocation on under-construction route
// ═══════════════════════════════════════════

async function executeAdjustRouteWorkforce(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { routeId, workforcePerTurn } = payload;
  if (!routeId || !Number.isFinite(workforcePerTurn)) return { events: [], error: "Missing routeId or workforcePerTurn" };
  const newAlloc = Math.max(5, Math.floor(Number(workforcePerTurn)));

  const { data: route } = await supabase.from("province_routes")
    .select("id, metadata, construction_state").eq("id", routeId).eq("session_id", sessionId).single();
  if (!route) return { events: [], error: "Route not found" };
  if (route.construction_state !== "under_construction") return { events: [], error: "Route not under construction" };
  const md = (route.metadata || {}) as any;
  if (md.built_by !== actor.name) return { events: [], error: "Not your project" };

  await supabase.from("province_routes").update({
    metadata: { ...md, workforce_per_turn: newAlloc, assigned_labor: newAlloc },
  }).eq("id", routeId);

  const remaining = Math.max(0, Number(md.total_work || 0) - Number(md.progress || 0));
  const etaTurns = newAlloc > 0 ? Math.max(1, Math.ceil(remaining / newAlloc)) : 0;
  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base, event_type: "construction",
    note: `${actor.name} upravil alokaci pracovní síly na ${newAlloc}/tah (zbývá ~${etaTurns} kol).`,
    importance: "minor", reference: { routeId, workforcePerTurn: newAlloc, etaTurns },
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

  // Tier ladder: trail → road → paved.
  // Legacy aliases (land_road, caravan_route, river_route, sea_lane, mountain_pass) are normalized to "road".
  const TIER_ORDER = ["trail", "road", "paved"] as const;
  const TIER_LABELS: Record<string, string> = { trail: "Stezka", road: "Cesta", paved: "Dlážděná" };
  const LEGACY_MAP: Record<string, string> = {
    land_road: "road", caravan_route: "road", river_route: "road",
    sea_lane: "road", mountain_pass: "trail",
  };
  const currentNormalized = LEGACY_MAP[route.route_type] || route.route_type;
  const currentIdx = TIER_ORDER.indexOf(currentNormalized as any);
  if (currentIdx < 0) {
    return { events: [], error: `Neznámý typ cesty: ${route.route_type}` };
  }
  if (currentIdx >= TIER_ORDER.length - 1) {
    return { events: [], error: "Cesta je již na maximálním tieru (dlážděná)." };
  }
  const nextTier = TIER_ORDER[currentIdx + 1];
  const upgradeCost = Math.round((route.build_cost || 50) * 0.5 * (route.upgrade_level + 1));

  const { data: realm } = await supabase.from("realm_resources")
    .select("id, gold_reserve").eq("session_id", sessionId).eq("player_name", actor.name).single();
  if (!realm || (realm.gold_reserve ?? 0) < upgradeCost) {
    return { events: [], error: `Nedostatek zlata (potřeba: ${upgradeCost})` };
  }

  await supabase.from("realm_resources").update({ gold_reserve: realm.gold_reserve - upgradeCost }).eq("id", realm.id);

  // Tier-specific stat bumps.
  const tierStats: Record<string, { capacity: number; speed: number; vuln: number }> = {
    trail: { capacity: 5, speed: 3, vuln: 5 },
    road:  { capacity: 8, speed: 5, vuln: 4 },
    paved: { capacity: 12, speed: 7, vuln: 2 },
  };
  const stats = tierStats[nextTier];

  await supabase.from("province_routes").update({
    route_type: nextTier,
    upgrade_level: route.upgrade_level + 1,
    capacity_value: stats.capacity,
    speed_value: stats.speed,
    vulnerability_score: stats.vuln,
  }).eq("id", routeId);

  const note = `${actor.name} vylepšil cestu na ${TIER_LABELS[nextTier]} (úroveň ${route.upgrade_level + 1}) za ${upgradeCost}g.`;

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "construction", note, importance: "normal",
    reference: { routeId, newTier: nextTier, newLevel: route.upgrade_level + 1, cost: upgradeCost },
  }], payload.chronicleText);
}

// ═══════════════════════════════════════════
// RENAME_ROUTE — change a route's display name
// ═══════════════════════════════════════════

async function executeRenameRoute(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { routeId, name } = payload;
  if (!routeId) return { events: [], error: "Missing routeId" };

  const { data: route } = await supabase.from("province_routes")
    .select("id, node_a, node_b, metadata, name")
    .eq("id", routeId).eq("session_id", sessionId).single();
  if (!route) return { events: [], error: "Route not found" };

  // Authorization: only built_by or controller of either endpoint may rename.
  const builtBy = route.metadata?.built_by;
  let allowed = builtBy === actor.name;
  if (!allowed) {
    const { data: ends } = await supabase.from("province_nodes")
      .select("id, controlled_by").in("id", [route.node_a, route.node_b]);
    allowed = (ends || []).some((n: any) => n.controlled_by === actor.name);
  }
  if (!allowed) return { events: [], error: "Pouze stavitel nebo vlastník koncového uzlu může cestu přejmenovat." };

  const trimmed = typeof name === "string" ? name.trim().slice(0, 60) : "";
  const finalName = trimmed.length > 0 ? trimmed : null;

  await supabase.from("province_routes").update({ name: finalName }).eq("id", routeId);

  const note = finalName
    ? `${actor.name} přejmenoval cestu na „${finalName}".`
    : `${actor.name} odebral vlastní název cesty.`;

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "construction", note, importance: "minor",
    reference: { routeId, name: finalName },
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

  // Legacy projects alter infrastructure, never node upgrade_level. Validate ownership before charging.
  if (['create_fort', 'create_port', 'expand_hub'].includes(projectType)) {
    if (!nodeId) return { events: [], error: 'Missing nodeId' };
    const { data: node, error } = await supabase.from('province_nodes').select('id,controlled_by')
      .eq('id', nodeId).eq('session_id', sessionId).maybeSingle();
    if (error || !node || node.controlled_by !== actor.name) return { events: [], error: 'Projekt lze zahájit jen na vlastním uzlu' };
  }
  if (['build_route', 'upgrade_route', 'repair_route'].includes(projectType)) {
    if (!routeId) return { events: [], error: 'Missing routeId' };
    const { data: route, error } = await supabase.from('province_routes').select('id,node_a,node_b')
      .eq('id', routeId).eq('session_id', sessionId).maybeSingle();
    if (error || !route) return { events: [], error: 'Route not found' };
    const { data: endpoints, error: endpointError } = await supabase.from('province_nodes').select('id,controlled_by')
      .eq('session_id', sessionId).in('id', [route.node_a, route.node_b]);
    if (endpointError || endpoints?.length !== 2 || endpoints.some((n: any) => n.controlled_by !== actor.name))
      return { events: [], error: 'Projekt vyžaduje vlastní koncové uzly' };
  }

  // Check player has enough resources (new civilizational economy)
  const { data: realm } = await supabase.from("realm_resources")
    .select("gold_reserve, production_reserve, total_capacity")
    .eq("session_id", sessionId).eq("player_name", actor.name).maybeSingle();

  if (!realm) return { events: [], error: 'Realm not found' };
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
    .select("id, manpower_committed, gold_reserve, mobilization_rate, player_name")
    .eq("session_id", sessionId).eq("player_name", playerName).maybeSingle();
  return data;
}

async function executeRemobilizeStack(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { stackId, stackName } = payload;
  if (!stackId) return { events: [], error: "Missing stackId" };

  const realm = await getRealm(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };
  const {data:storedStack,error:storedError}=await supabase.from('military_stacks').select('*').eq('session_id',sessionId).eq('player_name',actor.name).eq('id',stackId).maybeSingle();
  if(storedError)throw storedError;
  if(!storedStack||storedStack.is_active)return {events:[],error:'Inactive owned stack required'};
  if(storedStack.remobilize_ready_turn!=null&&storedStack.remobilize_ready_turn>turnNumber)return {events:[],error:'Stack is not ready to remobilize'};
  const manpower=actualSoldiers([{...storedStack,is_active:true}]);
  const available=await readRealmWorkforce(supabase,sessionId,actor.name,realm.mobilization_rate??0.1);
  if(manpower>available.workforce)return {events:[],error:`Nedostatek obyvatel: ${available.workforce}`};

  const { data: reactivated, error: reactivateError } = await supabase.from("military_stacks").update({
    is_active: true,
    demobilized_turn: null,
    remobilize_ready_turn: null,
    morale: 30,
  }).eq("id", stackId).eq("session_id", sessionId).eq("player_name", actor.name).eq("is_active", false).select("id").maybeSingle();
  if (reactivateError) throw reactivateError;
  if (!reactivated) return { events: [], error: "Armádu mezitím změnil jiný proces." };

  await syncRealmMilitaryLedger(supabase, sessionId, actor.name);

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
  return executeStackDeactivation(supabase, base, actor, payload, commandId, sessionId, turnNumber, "disband");
}

/** Shared by DISBAND_STACK and DEMOBILIZE_STACK; all manpower and timing come from stored rows. */
async function executeStackDeactivation(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number, action: "disband" | "demobilize",
): Promise<CommandResult> {
  const rawIds = action === "demobilize" ? payload?.stackIds : [payload?.stackId];
  if (!Array.isArray(rawIds) || rawIds.length === 0 || rawIds.some(id => typeof id !== "string" || !id)) {
    return { events: [], error: "Missing stackIds" };
  }
  const stackIds = rawIds as string[];
  if (new Set(stackIds).size !== stackIds.length) return { events: [], error: "Duplicitní armády nejsou povoleny" };

  const realm = await getRealm(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };
  const { data: storedStacks, error: storedError } = await supabase.from("military_stacks").select("*")
    .eq("session_id", sessionId).eq("player_name", actor.name).in("id", stackIds);
  if (storedError) throw storedError;
  if (!storedStacks || storedStacks.length !== stackIds.length) {
    return { events: [], error: "Všechny armády musí existovat a patřit tvé říši v této hře" };
  }
  if (storedStacks.some((stack: any) => !isStackActive(stack))) {
    return { events: [], error: "Demobilizovat lze jen aktivní vlastní armády" };
  }

  const returnedManpower = actualSoldiers(storedStacks);
  const remobilizeReadyTurn = turnNumber + 3;
  // One conditional statement changes only rows still active at write time.
  const { data: updated, error: updateError } = await supabase.from("military_stacks").update({
    is_active: false,
    is_deployed: false,
    demobilized_turn: turnNumber,
    remobilize_ready_turn: remobilizeReadyTurn,
  }).eq("session_id", sessionId).eq("player_name", actor.name).eq("is_active", true).in("id", stackIds).select("id");
  if (updateError) throw updateError;
  if (!updated || updated.length !== stackIds.length) {
    return { events: [], error: "Armádu mezitím změnil jiný proces." };
  }

  await syncRealmMilitaryLedger(supabase, sessionId, actor.name);
  const stackNames = storedStacks.map((stack: any) => String(stack.name || stack.id));
  const verb = action === "demobilize" ? "demobilizoval" : "rozpustil";
  const note = `${actor.name} ${verb} ${stackNames.join(", ")} (${returnedManpower} mužů).`;
  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "military",
    note,
    importance: "normal",
    reference: { stackIds, stackNames, returnedManpower, demobilizedTurn: turnNumber, remobilizeReadyTurn, action },
  }], note, { stackIds, returnedManpower, remobilizeReadyTurn });
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
  const { stackId, generalId } = payload;
  if (!stackId || !generalId) return { events: [], error: "Missing stackId or generalId" };

  // The RPC locks both armies, verifies actor/session ownership and releases the previous assignment atomically.
  const { data: assignment, error: assignmentError } = await supabase.rpc("assign_general_to_stack", {
    p_session: sessionId, p_actor: actor.name, p_stack: stackId, p_general: generalId,
  });
  if (assignmentError) return { events: [], error: assignmentError.message };
  if (!assignment?.ok) return { events: [], error: assignment?.error || "Generála nelze přiřadit" };
  const resolvedGeneralName = assignment.general_name;
  const resolvedStackName = assignment.stack_name;

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base, event_type: "military",
    note: payload.note || `${actor.name} jmenoval ${resolvedGeneralName} velitelem ${resolvedStackName}.`,
    importance: "normal", reference: { stackId, generalId, capacity: assignment.capacity },
  }], payload.chronicleText);
}

async function executeReinforceStack(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { stackId, stackName, reinforcements } = payload;
  if (!stackId) return { events: [], error: "Missing stackId" };
  const entries = Object.entries(reinforcements || {});
  if (!entries.length || entries.some(([unit,amount]) => !(unit in UNIT_GOLD_FACTOR) || !Number.isSafeInteger(amount) || Number(amount) < 0)) {
    return { events: [], error: "Invalid reinforcement composition" };
  }
  const addedManpower = entries.reduce((sum,[,amount]) => sum + Number(amount),0);
  const addedGold = Math.round(entries.reduce((sum,[unit,amount]) => sum + Number(amount) * (UNIT_GOLD_FACTOR[unit] || 1),0));
  const {data:ownedStack,error:ownedError} = await supabase.from('military_stacks').select('id,is_active,soldiers,morale,general_id').eq('session_id',sessionId).eq('player_name',actor.name).eq('id',stackId).maybeSingle();
  if(ownedError)throw ownedError;
  if(!ownedStack?.is_active)return {events:[],error:'Active owned stack required'};
  let generalSkill: number | null = null;
  if (ownedStack.general_id) {
    const { data: general, error: generalError } = await supabase.from("generals").select("skill")
      .eq("id", ownedStack.general_id).eq("session_id", sessionId).eq("player_name", actor.name).maybeSingle();
    if (generalError) throw generalError;
    if (!general) return { events: [], error: "Velitel armády nebyl nalezen" };
    generalSkill = general.skill;
  }
  const capacity = generalArmyCapacity(generalSkill);
  if (Number(ownedStack.soldiers || 0) + addedManpower > capacity) {
    return { events: [], error: `Posily překračují velitelskou kapacitu ${capacity} mužů` };
  }

  const realm = await getRealm(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };
  const available = await readRealmWorkforce(supabase,sessionId,actor.name,realm.mobilization_rate??0.1);
  if(addedManpower>available.workforce)return {events:[],error:`Nedostatek obyvatel pro posily: ${available.workforce}`};
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

  // Recompute stack power + soldier counters from updated composition
  const { data: updatedComps } = await supabase
    .from("military_stack_composition")
    .select("unit_type, manpower")
    .eq("stack_id", stackId);
  const totalSoldiers = (updatedComps || []).reduce((s: number, c: any) => s + (c.manpower || 0), 0);
  const newPower = computeStackPower(updatedComps || [], ownedStack.morale ?? 70);
  await supabase.from("military_stacks").update({
    soldiers: totalSoldiers, unit_count: totalSoldiers, power: newPower,
  }).eq("id", stackId);

  await syncRealmMilitaryLedger(supabase, sessionId, actor.name, {
    gold_reserve: (realm.gold_reserve || 0) - (addedGold || 0),
  });

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
  return executeStackDeactivation(supabase, base, actor, payload, commandId, sessionId, turnNumber, "demobilize");
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

  await supabase.from("realm_resources").update({ mobilization_rate: rate }).eq("id", realm.id);
  await syncRealmMilitaryLedger(supabase, sessionId, actor.name);

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

/** First claimed sub-parcel with remaining slots, optionally a specific one. */
async function getAvailableParcel(supabase: any, cityId: string, requestedParcelId?: string, recipeKeys?: string[], role: SiteRole = "urban") {
  let query = supabase.from("tile_parcels")
    .select("id, city_id, grid_x, grid_y, parcel_index, status, capacity_slots, claim_kind, sub_biome, owner_player")
    .eq("city_id", cityId)
    .in("status", ["claimed", "occupied"]);
  // Rural extraction sites go only on worked land; everything else only on paid urban plots.
  query = role === "rural" ? query.eq("claim_kind", "worked") : query.or("claim_kind.is.null,claim_kind.eq.urban");
  query = query
    .order("parcel_index")
    .limit(requestedParcelId ? 1 : 100);
  if (requestedParcelId) query = query.eq("id", requestedParcelId);
  const { data } = await query;
  for (const parcel of data || []) {
    // Auto-pick only plots whose terrain suits the building; an explicit choice is validated by the caller.
    if (!requestedParcelId && recipeKeys?.length && terrainReason(recipeKeys, parcel.sub_biome)) continue;
    const { data: contents } = await supabase.from("tile_parcel_contents").select("slots_used").eq("parcel_id", parcel.id);
    const used = (contents || []).reduce((sum: number, item: any) => sum + Number(item.slots_used || 0), 0);
    const cap = parcel.claim_kind === "worked" ? ((contents || []).length ? 0 : 1) : Number(parcel.capacity_slots || 0);
    if (used < cap) return { ...parcel, used_slots: used };
  }
  return null;
}

async function occupyParcel(
  supabase: any, sessionId: string, playerName: string, parcelId: string,
  kind: "building" | "district", entityId: string, landUse: string, worked = false,
) {
  // The RPC commits entity linkage, physical content and legacy tile projection together.
  // Its parcel lock + DB capacity trigger protect against competing construction.
  const { error } = await supabase.rpc("occupy_city_parcel_atomic", {
    p_session: sessionId, p_player: playerName, p_parcel: parcelId,
    p_kind: kind, p_entity: entityId, p_land_use: landUse, p_worked: worked,
  });
  return error || null;
}

/**
 * CLAIM_TILE_PARCEL — buy one sub-parcel for a city. Terrain drives the price and the
 * housing capacity the parcel adds. Only parcels on the city cell or a cell next to it.
 * Payload: { cityId, gridX, gridY, parcelIndex }
 */
/**
 * Paid urban parcel claim and optional worked→urban conversion.
 * All rights checks, price quotation and the realm debit run together inside
 * buy_city_parcel(), so a failed payment NEVER leaves a free building plot.
 * RPC only executable by the trusted command-dispatch service role.
 */
async function executeClaimTileParcel(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const cityId = String(payload.cityId || "");
  const gridX = Number(payload.gridX);
  const gridY = Number(payload.gridY);
  const parcelIndex = Number(payload.parcelIndex);
  if (!cityId || !Number.isInteger(gridX) || !Number.isInteger(gridY)
    || !Number.isInteger(parcelIndex) || parcelIndex < 0 || parcelIndex >= TILE_PARCEL_COUNT) {
    return { events: [], error: "Neplatná stavební parcela" };
  }
  // Materialize the deterministic 6×6 tile first; this is not an ownership change.
  const parcels = await ensureTileParcels(supabase, sessionId, gridX, gridY);
  const parcel = (parcels || []).find((row: any) => row.parcel_index === parcelIndex);
  if (!parcel) return { events: [], error: "Parcela nebyla nalezena" };
  const { data: purchased, error } = await supabase.rpc("buy_city_parcel", {
    p_session: sessionId, p_city: cityId, p_player: actor.name,
    p_parcel: parcel.id, p_turn: turnNumber,
  });
  if (error) return { events: [], error: error.message };
  if (purchased?.already) return { events: [], result: { parcelId: parcel.id, already: true } } as CommandResult;
  const { data: city } = await supabase.from("cities").select("name").eq("id", cityId).eq("session_id", sessionId).maybeSingle();
  const costGold = Number(purchased?.costGold ?? 0);
  const costProduction = Number(purchased?.costProduction ?? 0);
  return insertEvents(supabase, commandId, [{
    ...base, event_type: "city_planning", city_id: cityId,
    note: `${city?.name || "Město"} ${purchased?.converted ? "převedlo využívanou půdu na stavební" : "koupilo stavební parcelu"} ${parcelIndex + 1} na poli ${gridX}, ${gridY}.`,
    importance: "minor",
    reference: {
      cityId, gridX, gridY, parcelIndex,
      subBiome: purchased?.subBiome,
      elevation: purchased?.elevation,
      costGold, costProduction,
      capacityAdded: Number(purchased?.capacitySlots ?? 0) * POPULATION_PER_SLOT,
      converted: Boolean(purchased?.converted),
    },
  }], { parcelId: parcel.id, costGold, costProduction });
}

/** Canonical subnode definitions — shared with the construction UI. */
const SUBNODE_DEFS = SHARED_SUBNODE_DEFS;


/** BUILD_SUBNODE — place a small production, military, or trade node on a held parcel. */
async function executeBuildSubnode(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const parcelId = String(payload.parcelId || "");
  const subtype = String(payload.subtype || "");
  const def = SUBNODE_DEFS[subtype];
  if (!parcelId || !def) return { events: [], error: "Neplatný typ subuzlu" };

  const { data: parcel } = await supabase.from("tile_parcels")
    .select("id, city_id, owner_player, grid_x, grid_y, parcel_index, buildable, capacity_slots, sub_biome, claim_kind")
    .eq("id", parcelId).eq("session_id", sessionId).maybeSingle();
  if (!parcel) return { events: [], error: "Parcela nebyla nalezena" };
  if (parcel.owner_player && parcel.owner_player !== actor.name) return { events: [], error: `Parcelu drží ${parcel.owner_player}` };
  if (!parcel.buildable) return { events: [], error: "Na této parcele nelze stavět" };
  if (parcel.claim_kind === "worked") return { events: [], error: "Využívanou parcelu nejprve kup jako stavební, teprve pak lze stavět" };

  const { data: contents } = await supabase.from("tile_parcel_contents").select("slots_used").eq("parcel_id", parcelId);
  const used = (contents || []).reduce((sum: number, item: any) => sum + Number(item.slots_used || 0), 0);
  if (used >= Number(parcel.capacity_slots || 0)) return { events: [], error: "Parcela už nemá volnou kapacitu" };

  const { data: tile } = await supabase.from("province_hexes")
    .select("province_id, biome_family, coastal, has_river, is_passable, owner_player")
    .eq("session_id", sessionId).eq("grid_x", parcel.grid_x).eq("grid_y", parcel.grid_y).maybeSingle();
  if (!tile) return { events: [], error: "Pole nebylo nalezeno" };
  if (tile.is_passable === false) return { events: [], error: "Pole je neprůchodné" };
  if (tile.owner_player && tile.owner_player !== actor.name) return { events: [], error: `Pole ovládá ${tile.owner_player}` };
  if (subtype === "river_wharf" && !tile.coastal && !tile.has_river) return { events: [], error: "Překladiště vyžaduje řeku nebo pobřeží" };
  if (subtype === "farmstead" && ["mountains", "mountain", "desert"].includes(String(tile.biome_family))) return { events: [], error: "Produkční dvůr se pro tento terén nehodí" };

  // Provinces are optional on square-grid worlds — fall back to the owning city's province.
  let provinceId: string | null = tile.province_id ?? null;
  let parcelCityId: string | null = parcel.city_id ?? null;
  if (parcelCityId) {
    const { data: parcelCity } = await supabase.from("cities")
      .select("id, name, province_id, owner_player").eq("id", parcelCityId).eq("session_id", sessionId).maybeSingle();
    if (!parcelCity || parcelCity.owner_player !== actor.name) return { events: [], error: "Město u této parcely ti nepatří" };
    if (!provinceId) provinceId = parcelCity.province_id ?? null;
  } else {
    // Outpost on unclaimed land: attach it to the nearest own city so its output reaches a market.
    const { data: ownCities } = await supabase.from("cities")
      .select("id, province_id, grid_x, grid_y, province_q, province_r")
      .eq("session_id", sessionId).eq("owner_player", actor.name);
    let best: any = null; let bestDist = Infinity;
    for (const c of (ownCities || [])) {
      const cx = c.grid_x ?? c.province_q; const cy = c.grid_y ?? c.province_r;
      if (cx == null || cy == null) continue;
      const dist = Math.abs(Number(cx) - parcel.grid_x) + Math.abs(Number(cy) - parcel.grid_y);
      if (dist < bestDist) { bestDist = dist; best = c; }
    }
    if (best && bestDist <= 6) {
      parcelCityId = best.id;
      if (!provinceId) provinceId = best.province_id ?? null;
    } else if (!provinceId && best) {
      provinceId = best.province_id ?? null;
    }
  }

  // A production node without a market anchor would produce goods nobody can consume.
  // Require a valid own city within reach instead of creating an orphaned node.
  if (!parcelCityId && def.group === "production") {
    return { events: [], error: "Produkční dvůr musí patřit k vlastnímu městu do vzdálenosti 6 polí" };
  }


  const realm = await getRealmFull(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };
  if (Number(realm.gold_reserve || 0) < def.gold || Number(realm.production_reserve || 0) < def.production) {
    return { events: [], error: `Potřeba ${def.gold} zlata a ${def.production} produkce` };
  }

  // Authorization, parcel capacity, node/content creation and reserve debit commit
  // together. Competing commands cannot create an unpaid node or oversubscribe slots.
  const { data: built, error: buildError } = await supabase.rpc("build_subnode_atomic", {
    p_session: sessionId, p_player: actor.name, p_parcel: parcelId, p_city: parcelCityId,
    p_province: provinceId, p_turn: turnNumber, p_name: String(payload.name || def.label).slice(0, 80),
    p_subtype: subtype, p_def: def, p_cost_gold: def.gold, p_cost_production: def.production,
  });
  if (buildError || !built?.nodeId) return { events: [], error: buildError?.message || "Subuzel se nepodařilo vytvořit" };

  return insertEvents(supabase, commandId, [{ ...base, event_type: "construction", city_id: parcelCityId,
    note: `${actor.name} zahájil provoz ${def.label.toLowerCase()} na parcele ${parcel.parcel_index + 1}.`, importance: "normal",
    reference: { parcelId, nodeId: built.nodeId, subtype, gridX: parcel.grid_x, gridY: parcel.grid_y, costGold: def.gold, costProduction: def.production },
  }], { nodeId: built.nodeId });
}

/** UPGRADE_TILE_INFRASTRUCTURE — sequential trail, road, paved-road project on one macro cell. */
async function executeUpgradeTileInfrastructure(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const gridX = Number(payload.gridX); const gridY = Number(payload.gridY);
  if (!Number.isInteger(gridX) || !Number.isInteger(gridY)) return { events: [], error: "Neplatné pole" };
  const { data: tile } = await supabase.from("province_hexes").select("owner_player, is_passable, biome_family")
    .eq("session_id", sessionId).eq("grid_x", gridX).eq("grid_y", gridY).maybeSingle();
  if (!tile || tile.is_passable === false || tile.biome_family === "sea") return { events: [], error: "Na tomto poli nelze stavět cestu" };
  if (tile.owner_player && tile.owner_player !== actor.name) return { events: [], error: `Pole ovládá ${tile.owner_player}` };
  // Anchor: your parcel, your city seat, or your sub-node on the tile all justify a road.
  const [{ data: held }, { data: seatCities }, { data: ownNodes }] = await Promise.all([
    supabase.from("tile_parcels").select("id").eq("session_id", sessionId).eq("grid_x", gridX).eq("grid_y", gridY).eq("owner_player", actor.name).limit(1),
    supabase.from("cities").select("id").eq("session_id", sessionId).eq("owner_player", actor.name).eq("grid_x", gridX).eq("grid_y", gridY).limit(1),
    supabase.from("province_nodes").select("id").eq("session_id", sessionId).eq("controlled_by", actor.name).eq("grid_x", gridX).eq("grid_y", gridY).limit(1),
  ]);
  if (!held?.length && !seatCities?.length && !ownNodes?.length) {
    return { events: [], error: "Na poli musíš držet parcelu, město nebo subuzel" };
  }

  const { data: existing } = await supabase.from("tile_infrastructure").select("*").eq("session_id", sessionId).eq("grid_x", gridX).eq("grid_y", gridY).maybeSingle();
  if (existing?.status === "building") return { events: [], error: "Infrastruktura už se staví" };
  const nextLevel = Number(existing?.level || 0) + 1;
  const tier = tileInfrastructureLevel(nextLevel);
  if (!tier) return { events: [], error: "Dlážděná cesta je nejvyšší úroveň" };
  // Roads follow the sub-parcel layout: every river sub-parcel on the trace needs a bridge.
  const { data: around } = await supabase.from("province_hexes")
    .select("grid_x, grid_y, biome_family, mean_height, has_river, river_direction, is_passable")
    .eq("session_id", sessionId)
    .in("grid_x", [gridX - 1, gridX, gridX + 1]).in("grid_y", [gridY - 1, gridY, gridY + 1]);
  const neighbourRows = (around || []).filter((row: any) =>
    Math.abs(row.grid_x - gridX) + Math.abs(row.grid_y - gridY) === 1);
  const self = (around || []).find((row: any) => row.grid_x === gridX && row.grid_y === gridY) || {};
  const terrainOf = (row: any) => ({ biome_family: row.biome_family, elevation: row.mean_height,
    has_river: row.has_river, river_direction: row.river_direction, is_passable: row.is_passable });
  // The trace only reaches neighbours that already carry a road or hold a settlement — same rule as the map.
  const { data: neighbourRoads } = await supabase.from("tile_infrastructure").select("grid_x, grid_y")
    .eq("session_id", sessionId).in("grid_x", [gridX - 1, gridX, gridX + 1]).in("grid_y", [gridY - 1, gridY, gridY + 1]);
  const { data: neighbourSeats } = await supabase.from("tile_parcels").select("grid_x, grid_y")
    .eq("session_id", sessionId).not("city_id", "is", null)
    .in("grid_x", [gridX - 1, gridX, gridX + 1]).in("grid_y", [gridY - 1, gridY, gridY + 1]);
  const { data: neighbourNodes } = await supabase.from("province_nodes").select("grid_x, grid_y")
    .eq("session_id", sessionId).in("grid_x", [gridX - 1, gridX, gridX + 1]).in("grid_y", [gridY - 1, gridY, gridY + 1]);
  const connected = new Set([...(neighbourRoads || []), ...(neighbourSeats || []), ...(neighbourNodes || [])].map((row: any) => `${row.grid_x},${row.grid_y}`));

  const steps = neighbourRows
    .filter((row: any) => row.is_passable !== false && row.biome_family !== "sea" && connected.has(`${row.grid_x},${row.grid_y}`))
    .map((row: any) => ({ dx: row.grid_x - gridX, dy: row.grid_y - gridY }));

  const bridges = tileBridgeCells(sessionId, gridX, gridY, steps, terrainOf(self),
    neighbourRows.map((row: any) => ({ dx: row.grid_x - gridX, dy: row.grid_y - gridY, terrain: terrainOf(row) }))).length;
  const cost = tileRoadCost(tier, bridges);
  const realm = await getRealmFull(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };
  if (Number(realm.gold_reserve || 0) < cost.gold || Number(realm.production_reserve || 0) < cost.production) return { events: [], error: `Potřeba ${cost.gold} zlata a ${cost.production} produkce${bridges ? ` (${bridges}× most)` : ""}` };
  const completesNow = tier.turns <= 1;
  const row = { session_id: sessionId, grid_x: gridX, grid_y: gridY, owner_player: actor.name,
    level: completesNow ? nextLevel : Number(existing?.level || 0), target_level: completesNow ? null : nextLevel,
    status: completesNow ? "completed" : "building", progress: completesNow ? 100 : 0,
    started_turn: turnNumber, completed_turn: completesNow ? turnNumber : null };
  const { error } = await supabase.from("tile_infrastructure").upsert(row, { onConflict: "session_id,grid_x,grid_y" });
  if (error) return { events: [], error: error.message };
  await supabase.from("realm_resources").update({ gold_reserve: Number(realm.gold_reserve || 0) - cost.gold,
    production_reserve: Number(realm.production_reserve || 0) - cost.production }).eq("id", realm.id);
  return insertEvents(supabase, commandId, [{ ...base, event_type: "construction",
    note: `${actor.name} ${completesNow ? "dokončil" : "zahájil"} projekt ${tier.label.toLowerCase()} na poli ${gridX}, ${gridY}${bridges ? ` (${bridges}× most přes řeku)` : ""}.`, importance: "normal",
    reference: { gridX, gridY, infrastructureLevel: nextLevel, costGold: cost.gold, costProduction: cost.production, bridges },
  }], { gridX, gridY, infrastructureLevel: nextLevel });

}

async function executeAssignCityParcel(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { cityId, parcelId, buildingId, districtId } = payload;
  if (!cityId || !parcelId || (!buildingId && !districtId) || (buildingId && districtId)) {
    return { events: [], error: "Neplatné přiřazení parcely" };
  }
  const { data: city } = await supabase.from("cities").select("id, name, owner_player").eq("id", cityId).eq("session_id", sessionId).maybeSingle();
  if (!city || city.owner_player !== actor.name) return { events: [], error: "Toto město vám nepatří" };
  const parcel = await getAvailableParcel(supabase, cityId, parcelId);
  if (!parcel) return { events: [], error: "Parcela není volná" };
  const kind = buildingId ? "building" : "district";
  const entityId = buildingId || districtId;
  const table = kind === "building" ? "city_buildings" : "city_districts";
  const { data: entity } = await supabase.from(table).select("id, category, district_type").eq("id", entityId).eq("city_id", cityId).maybeSingle();
  if (!entity) return { events: [], error: "Objekt nepatří do vybraného města" };
  const landUse = kind === "district" ? (entity.district_type || "residential") : categoryToLandUse(entity.category);
  const occupancyError = await occupyParcel(supabase, sessionId, actor.name, parcelId, kind, entityId, landUse);
  if (occupancyError) return { events: [], error: `Parcelu nelze obsadit: ${occupancyError.message}` };
  return insertEvents(supabase, commandId, [{ ...base, event_type: "city_planning", city_id: cityId, note: `${city.name} upravilo parcelní plán.`, importance: "minor", reference: { cityId, parcelId, buildingId, districtId } }]);
}

function categoryToLandUse(category?: string) {
  if (category === "military" || category === "fortification") return "military";
  if (category === "religious") return "sacred";
  if (category === "infrastructure") return "infrastructure";
  if (category === "economic" || category === "trade") return "commercial";
  return "civic";
}

/**
 * BUILD_BUILDING — full server-side: deduct resources, insert city_buildings row, emit event.
 * Payload: { cityId, cityName, template?, ai? (full building data), chronicleText? }
 */
async function executeBuildBuilding(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  let { cityId, cityName, building, isAiGenerated, chronicleText, parcelId } = payload;
  const resourceRecipe = typeof payload.resourceRecipe === 'string' ? payload.resourceRecipe : null;

  // Back-compat: AI faction calls send buildingName/templateId without a building object.
  // Resolve the template into a building payload so the command does not 400 on legacy callers.
  if (!building && (payload.templateId || payload.buildingName)) {
    let tmpl: any = null;
    if (payload.templateId) {
      const { data } = await supabase.from("building_templates")
        .select("*").eq("id", payload.templateId).maybeSingle();
      tmpl = data;
    }
    if (!tmpl && payload.buildingName) {
      const { data } = await supabase.from("building_templates")
        .select("*").ilike("name", payload.buildingName).limit(1).maybeSingle();
      tmpl = data;
    }
    if (tmpl) {
      building = {
        template_id: tmpl.id,
        name: tmpl.name,
        description: tmpl.description,
        category: tmpl.category,
        cost_wealth: tmpl.cost_wealth || 0,
        cost_wood: tmpl.cost_wood || 0,
        cost_stone: tmpl.cost_stone || 0,
        cost_iron: tmpl.cost_iron || 0,
        build_duration: tmpl.build_duration || tmpl.build_turns || 1,
        effects: tmpl.effects || {},
        max_level: tmpl.max_level,
        building_tags: tmpl.building_tags || null,
      };
    }
  }

  if (!cityId || !building) return { events: [], error: "Missing cityId or building" };

  // AUTHORITATIVE TEMPLATE: cost, time, effects, recipes, levels and prerequisites come from the
  // server-side template; client-sent values for these fields are ignored.
  const templateId = building.template_id || payload.templateId || null;
  let template: any = null;
  if (templateId) {
    const { data } = await supabase.from("building_templates").select("*").eq("id", templateId).maybeSingle();
    if (!data) return { events: [], error: "Neznámá šablona stavby" };
    template = data;
    building = canonicalBuilding(template, building);
  } else if (!isAiGenerated) {
    return { events: [], error: "Stavba musí vycházet ze šablony" };
  } else {
    building = { ...building, effects: stripProductionEffects(building.effects) };
  }
  {
    const { data: cityRow } = await supabase.from("cities").select("owner_player, settlement_level, grid_x, grid_y, province_q, province_r").eq("id", cityId).maybeSingle();
    if (!cityRow) return { events: [], error: "Město neexistuje" };
    const gx = cityRow.grid_x ?? cityRow.province_q, gy = cityRow.grid_y ?? cityRow.province_r;
    const { data: tile } = await supabase.from("province_hexes").select("has_river, coastal, biome_family, resource_deposits")
      .eq("session_id", sessionId).eq("grid_x", gx).eq("grid_y", gy).maybeSingle();
    const { data: existing } = await supabase.from("city_buildings").select("name, template_id, status").eq("city_id", cityId);
    const done = (existing || []).filter((b: any) => b.status === "completed");
    const reason = template ? validateBuild(template, { actor: actor.name, city: cityRow, tile,
      existingBuildingNames: done.map((b: any) => b.name), existingTemplateIds: (existing || []).map((b: any) => b.template_id).filter(Boolean) })
      : (cityRow.owner_player !== actor.name ? "Nedostupné: stavět lze jen ve vlastním městě" : null);
    if (reason) return { events: [], error: reason };
  }

  // A rural building must pick ONE confirmed natural material when changing the
  // default template extraction. Otherwise a generic mine could generate iron AND
  // copper AND tin merely because all recipes were listed in its catalogue.
  if (resourceRecipe) {
    const natural = MATERIAL_BY_RECIPE.get(resourceRecipe);
    if (!natural || !template || template.name !== natural.building ||
        !RURAL_RECIPES.has(resourceRecipe) ||
        ![...(template.effects?.recipe_keys || []),...(template.effects?.specialization_recipe_keys || [])].includes(resourceRecipe)) {
      return { events: [], error: 'Neplatná nebo nepovolená specializace přírodního zdroje' };
    }
    const { data: chosenRecipe } = await supabase.from('production_recipes')
      .select('required_role,required_tags,output_good_key').eq('recipe_key',resourceRecipe).maybeSingle();
    if (!chosenRecipe || chosenRecipe.required_role !== 'source' ||
        chosenRecipe.output_good_key !== natural.good ||
        !(chosenRecipe.required_tags || []).every((tag: string) => (template.effects?.capability_tags || []).includes(tag)))
      return { events: [], error: 'Zdrojová receptura neodpovídá výrobnímu kontraktu' };
    building.effects = { ...building.effects,recipe_keys:[resourceRecipe],
      selected_natural_resource:natural.kind };
  }
  const recipeKeys: string[] | undefined = resourceRecipe ? [resourceRecipe] : template?.effects?.recipe_keys;
  const siteRole = templateSiteRole(recipeKeys);
  if (parcelId) {
    const { data: chosen } = await supabase.from("tile_parcels").select("claim_kind").eq("id", parcelId).eq("city_id", cityId).maybeSingle();
    if (chosen && (chosen.claim_kind === "worked") !== (siteRole === "rural")) return { events: [], error: siteRole === "rural"
      ? "Venkovskou těžební stavbu postav na využívané parcele, ne na stavební" : "Tato stavba patří do města — na využívané půdě lze stavět jen farmy, doly, lomy, tábory a rybářství" };
  }
  const targetParcel = await getAvailableParcel(supabase, cityId, parcelId, recipeKeys, siteRole);
  if (parcelId && !targetParcel) return { events: [], error: "Vybraná parcela není volná" };
  if (siteRole === "rural" && !targetParcel) return { events: [], error: "Město nemá volnou využívanou parcelu s vhodným terénem — nejdřív zaber okolní půdu" };
  if (targetParcel && siteRole === "rural") {
    const mx = targetParcel.grid_x * 6 + (targetParcel.parcel_index % 6), my = targetParcel.grid_y * 6 + Math.floor(targetParcel.parcel_index / 6);
    const [{ data: microSv, error: microErr }, { data: macroTile }, { data: planted }] = await Promise.all([
      supabase.from("micro_surveys").select("findings").eq("session_id", sessionId).eq("player_name", actor.name).eq("micro_x", mx).eq("micro_y", my).maybeSingle(),
      supabase.from("province_hexes").select("biome_family").eq("session_id", sessionId).eq("grid_x", targetParcel.grid_x).eq("grid_y", targetParcel.grid_y).maybeSingle(),
      supabase.from("crop_plantings").select("kind").eq("session_id", sessionId).eq("owner_player", actor.name).eq("micro_x", mx).eq("micro_y", my),
    ]);
    if (microErr) return { events: [], error: "Průzkum políčka se nepodařilo ověřit" };
    const microReason = microSiteReason(recipeKeys || [], targetParcel.sub_biome, macroTile?.biome_family, [...(((microSv as any)?.findings) || []), ...(planted || [])]);
    if (microReason) return { events: [], error: microReason };
    const needs = [...new Set((recipeKeys || []).map(k => DEPOSIT_REQUIRED[k]).filter(Boolean))];
    if (needs.length) {
      const [{ data: sv, error: surveyError }, { data: truth, error: truthError }, { data: previous, error: previousError }] = await Promise.all([
        supabase.from("macro_surveys").select("level, findings").eq("session_id", sessionId).eq("player_name", actor.name)
          .eq("grid_x", targetParcel.grid_x).eq("grid_y", targetParcel.grid_y).maybeSingle(),
        supabase.from("macro_deposits").select("deposits").eq("session_id", sessionId)
          .eq("grid_x", targetParcel.grid_x).eq("grid_y", targetParcel.grid_y).maybeSingle(),
        supabase.from("economy_turn_ledgers").select("parcelEcology:committed_result->parcelEcology").eq("session_id", sessionId)
          .lt("turn_number", turnNumber).eq("committed", true).order("turn_number", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (surveyError || truthError || previousError) return { events: [], error: "Stav ložiska se nepodařilo ověřit" };
      const deposits = (truth as any)?.deposits || [];
      const committedEcology = previous?.parcelEcology || {};
      for (const need of needs) {
        if (!sv || sv.level < 2 || !(sv.findings || []).some((f: any) => f.kind === need))
          return { events: [], error: `Nedostupné: důl potřebuje potvrzené ložisko (${need}) — proveďte podrobný průzkum pole` };
        const deposit = deposits.find((d: any) => d.kind === need);
        const remaining = availableMacroReserve(deposit?.reserve, committedEcology[macroReserveKey(targetParcel.grid_x, targetParcel.grid_y, need)]);
        if (remaining <= 0) return { events: [], error: deposit ? `Ložisko (${need}) je vyčerpané` : `Ložisko (${need}) na tomto poli není k dispozici` };
      }
    }
  }
  if (!parcelId && !targetParcel && recipeKeys?.length && terrainReason(recipeKeys, null)) {
    return { events: [], error: terrainReason(recipeKeys, null)!.replace(/ \(parcela: .*\)$/, "") + " — město nemá volnou stavební parcelu s vhodným terénem" };
  }
  if (targetParcel) {
    const tr = terrainReason(recipeKeys, targetParcel.sub_biome);
    if (tr) return { events: [], error: tr };
  }

  // Resolve city name if missing
  if (!cityName) {
    const { data: c } = await supabase.from("cities").select("name").eq("id", cityId).maybeSingle();
    cityName = c?.name || "město";
  }

  const realm = await getRealmFull(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };

  // Marble discount from the realm's own server tier, applied once (client discounts ignored).
  const marble = strategicBuildCostMult(realm);
  const costGold = discountedCost(building.cost_wealth || 0, marble);
  const prodCost = discountedCost((building.cost_wood || 0) + (building.cost_stone || 0) + (building.cost_iron || 0), marble);

  if ((realm.gold_reserve || 0) < costGold) return { events: [], error: `Nedostatek zlata (potřeba ${costGold}, máš ${Math.floor(realm.gold_reserve || 0)})` };
  if ((realm.production_reserve || 0) < prodCost) return { events: [], error: `Nedostatek produkce (potřeba ${prodCost}, máš ${Math.floor(realm.production_reserve || 0)})` };

  // Delta compare-and-set with retry (shared ledger helper): charged at most once, refunds add back exactly the cost.
  const reserveIO = realmReserveIO(supabase, realm.id);
  const buildCost = { gold: costGold, production: prodCost };
  const charge = await chargeReserves(reserveIO, buildCost, 3, realm);
  if (charge.ok === false) return { events: [], error: charge.error };

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

  if (insertErr) {
    await refundReserves(reserveIO, buildCost);
    return { events: [], error: `Insert failed: ${insertErr.message}` };
  }
  if (targetParcel) {
    const occupancyError = await occupyParcel(supabase, sessionId, actor.name, targetParcel.id, "building", inserted.id, categoryToLandUse(building.category), targetParcel.claim_kind === "worked");
    if (occupancyError) {
      await supabase.from("city_buildings").delete().eq("id", inserted.id);
      await refundReserves(reserveIO, buildCost);
      return { events: [], error: `Parcelu nelze obsadit: ${occupancyError.message}` };
    }
  }

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "construction",
    city_id: cityId,
    note: payload.note || `Stavba ${building.name} v ${cityName}.`,
    importance: "normal",
    reference: { buildingId: inserted.id, buildingName: building.name, cityId, cityName, parcelId: targetParcel?.id || null },
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
  const { cityId, cityName, buildingId, newLevel, chronicleText } = payload;
  if (!buildingId || !newLevel) return { events: [], error: "Missing buildingId or newLevel" };

  const { data: existing, error: buildingError } = await supabase.from('city_buildings').select('*')
    .eq('id', buildingId).eq('session_id', sessionId).maybeSingle();
  if (buildingError || !existing) return { events: [], error: 'Building not found' };
  const { data: ownedCity, error: cityError } = await supabase.from('cities').select('id,owner_player')
    .eq('id', existing.city_id).eq('session_id', sessionId).maybeSingle();
  if (cityError || cityId !== existing.city_id) return { events: [], error: 'City mismatch' };
  let authoritativeTemplate: any = null;
  if (existing.template_id) {
    const { data, error } = await supabase.from('building_templates').select('*').eq('id', existing.template_id).maybeSingle();
    if (error || !data) return { events: [], error: 'Building template unavailable' };
    authoritativeTemplate = data;
  }
  const upgradeError = validateBuildingUpgrade(existing, ownedCity, actor.name, newLevel, authoritativeTemplate);
  if (upgradeError) return { events: [], error: upgradeError };

  const realm = await getRealmFull(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };

  // Authoritative quote: client costs/newName/newEffects/isWonderConversion are ignored.
  const quote = quoteBuildingUpgrade(existing, authoritativeTemplate, Number(newLevel));
  if (typeof quote === "string") return { events: [], error: quote };
  const marble = strategicBuildCostMult(realm);
  const costGold = discountedCost(quote.cost_wealth, marble), prodCost = discountedCost(quote.cost_production, marble);
  const gold0 = Number(realm.gold_reserve) || 0, prod0 = Number(realm.production_reserve) || 0;
  if (gold0 < costGold) return { events: [], error: `Nedostatek zlata (potřeba ${costGold})` };
  if (prod0 < prodCost) return { events: [], error: `Nedostatek produkce (potřeba ${prodCost})` };
  // Level compare-and-set first: a retry/concurrent upgrade of the same level cannot charge twice.
  const { data: lvlRow } = await supabase.from("city_buildings")
    .update({ current_level: newLevel, name: quote.name, effects: quote.effects })
    .eq("id", buildingId).eq("current_level", existing.current_level ?? 1).select("id").maybeSingle();
  if (!lvlRow) return { events: [], error: "Budova byla mezitím změněna" };
  const paidCharge = await chargeReserves(realmReserveIO(supabase, realm.id), { gold: costGold, production: prodCost }, 3, realm);
  const paid = paidCharge.ok;
  if (!paid) {
    await supabase.from("city_buildings").update({ current_level: existing.current_level ?? 1, name: existing.name, effects: existing.effects })
      .eq("id", buildingId).eq("current_level", newLevel);
    return { events: [], error: paidCharge.ok === false ? paidCharge.error : "Platba stavby se nezdařila" };
  }
  const updateData: any = {};
  const newName = quote.name; const newEffects = quote.effects; const isWonderConversion = quote.wonder && !existing.is_wonder;
  void payload.newName; void payload.newEffects; void payload.costs; void payload.isWonderConversion;

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

  if (Object.keys(updateData).length) await supabase.from("city_buildings").update(updateData).eq("id", buildingId);

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: isWonderConversion ? "wonder" : "construction",
    city_id: cityId,
    note: `${actor.name} vylepšil ${newName} v ${cityName} na úroveň ${newLevel}.`,
    importance: isWonderConversion ? "critical" : "normal",
    reference: { buildingId, newLevel, newName, cityId, cityName, isWonderConversion },
  }], chronicleText, { buildingId, wonderId });
}

/** BUILD_DISTRICT — payload identifies only city, optional parcel and canonical blueprint key. */
async function executeBuildDistrict(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { cityId, chronicleText, parcelId, basketKey } = payload;
  const blueprint = districtBlueprint(String(payload.districtKey || ""));
  if (!cityId || !blueprint) return { events: [], error: "Neplatná šablona čtvrti" };

  const { data: session, error: sessionError } = await supabase.from("game_sessions")
    .select("parcel_economy_version").eq("id", sessionId).single();
  if (sessionError || !session) return { events: [], error: "Session not found" };
  const isProduction = blueprint.district_type === "production";
  if (isProduction && Number(session.parcel_economy_version || 0) >= 1) {
    return { events: [], error: "Abstraktní produkční čtvrti jsou v parcelové ekonomice vypnuté — použij fyzické budovy a parcely" };
  }

  const { data: city, error: cityError } = await supabase.from("cities")
    .select("id, name, owner_player").eq("id", cityId).eq("session_id", sessionId).maybeSingle();
  if (cityError || !city) return { events: [], error: "Město nebylo nalezeno" };
  if (city.owner_player !== actor.name) return { events: [], error: "Čtvrť lze založit jen ve vlastním městě" };

  let chosenBasket: string | null = null;
  if (isProduction) {
    chosenBasket = String(basketKey || blueprint.baskets?.[0] || "");
    const basketError = districtBasketProblem(blueprint, chosenBasket);
    if (basketError) return { events: [], error: basketError };
    const { data: existing } = await supabase.from("city_districts")
      .select("district_type, status").eq("session_id", sessionId).eq("city_id", cityId)
      .in("status", ["completed", "building"]);
    const residential = (existing || []).filter((d: any) => d.district_type === "residential").length;
    const production = (existing || []).filter((d: any) => d.district_type === "production").length;
    if (production >= residential * PRODUCTION_PER_RESIDENTIAL) {
      return { events: [], error: `Chybí pracovní síla — postav obytnou čtvrť (${production}/${residential * PRODUCTION_PER_RESIDENTIAL} obsazeno)` };
    }
  }

  const targetParcel = await getAvailableParcel(supabase, cityId, parcelId);
  if (parcelId && !targetParcel) return { events: [], error: "Vybraná parcela není volná" };
  if (targetParcel && targetParcel.owner_player !== actor.name) return { events: [], error: "Na cizí parcele nelze stavět" };

  const realm = await getRealmFull(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };
  const costGold = blueprint.build_cost_wealth;
  const prodCost = (blueprint.build_cost_wood || 0) + (blueprint.build_cost_stone || 0);
  const reserveIO = realmReserveIO(supabase, realm.id);
  const buildCost = { gold: costGold, production: prodCost };
  const charge = await chargeReserves(reserveIO, buildCost, 3, realm);
  if (charge.ok === false) return { events: [], error: charge.error };

  const buildTurns = blueprint.build_turns;
  const { data: inserted, error: dErr } = await supabase.from("city_districts").insert({
    session_id: sessionId, city_id: cityId,
    district_type: blueprint.district_type, name: blueprint.name,
    population_capacity: blueprint.population_capacity || 0,
    grain_modifier: blueprint.grain_modifier || 0,
    wealth_modifier: blueprint.wealth_modifier || 0,
    production_modifier: blueprint.production_modifier || 0,
    stability_modifier: blueprint.stability_modifier || 0,
    influence_modifier: 0,
    peasant_attraction: blueprint.peasant_attraction || 0,
    burgher_attraction: blueprint.burgher_attraction || 0,
    cleric_attraction: 0,
    military_attraction: 0,
    build_cost_wealth: costGold,
    build_cost_wood: blueprint.build_cost_wood || 0,
    build_cost_stone: blueprint.build_cost_stone || 0,
    build_turns: buildTurns,
    build_started_turn: turnNumber,
    status: buildTurns <= 1 ? "completed" : "building",
    completed_turn: buildTurns <= 1 ? turnNumber : null,
    description: blueprint.description,
    basket_key: chosenBasket,
    basket_output: isProduction ? (blueprint.basket_output || 0) : 0,
    basket_quality: blueprint.basket_quality || 1,
    demand_bonus: blueprint.demand_bonus || 0,
  }).select("id").single();

  if (dErr) {
    await refundReserves(reserveIO, buildCost);
    return { events: [], error: `District insert failed: ${dErr.message}` };
  }
  if (targetParcel) {
    const occupancyError = await occupyParcel(supabase, sessionId, actor.name, targetParcel.id, "district", inserted.id, blueprint.district_type);
    if (occupancyError) {
      await supabase.from("city_districts").delete().eq("id", inserted.id);
      await refundReserves(reserveIO, buildCost);
      return { events: [], error: `Parcelu nelze obsadit: ${occupancyError.message}` };
    }
  }

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "construction",
    city_id: cityId,
    note: `${actor.name} založil čtvrť ${blueprint.name} v ${city.name}${chosenBasket ? ` — výroba: ${chosenBasket}` : ""}.`,
    importance: "normal",
    reference: { districtId: inserted.id, districtKey: blueprint.key, districtName: blueprint.name, cityId, parcelId: targetParcel?.id || null, basketKey: chosenBasket },
  }], chronicleText, { districtId: inserted.id });
}

/**
 * SET_DISTRICT_PRODUCTION — point an existing production district at another demand basket.
 * Payload: { districtId, basketKey }
 */
async function executeSetDistrictProduction(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { districtId, basketKey } = payload;
  if (!districtId || !basketKey) return { events: [], error: "Missing districtId or basketKey" };
  const { data: session } = await supabase.from("game_sessions").select("parcel_economy_version").eq("id", sessionId).single();
  if (Number(session?.parcel_economy_version || 0) >= 1) {
    return { events: [], error: "Abstraktní produkce čtvrtí je v parcelové ekonomice vypnutá" };
  }
  const { data: district } = await supabase.from("city_districts")
    .select("id, name, city_id, district_type, cities!inner(name, owner_player)")
    .eq("session_id", sessionId).eq("id", districtId).maybeSingle();
  if (!district) return { events: [], error: "Čtvrť nenalezena" };
  if (district.cities?.owner_player !== actor.name) return { events: [], error: "Čtvrť patří jiné říši" };
  const blueprint = storedDistrictBlueprint(district);
  if (district.district_type !== "production" || !blueprint) return { events: [], error: "Neznámá produkční čtvrť" };
  const chosen = String(basketKey);
  const basketError = districtBasketProblem(blueprint, chosen);
  if (basketError) return { events: [], error: basketError };
  const { error: uErr } = await supabase.from("city_districts").update({ basket_key: chosen })
    .eq("id", districtId).eq("session_id", sessionId);
  if (uErr) return { events: [], error: `Nastavení výroby selhalo: ${uErr.message}` };

  return insertEvents(supabase, commandId, [{
    ...base,
    event_type: "economy",
    city_id: district.city_id,
    note: `${district.name} v ${district.cities?.name || "?"} přešla na výrobu ${chosen}.`,
    importance: "minor",
    reference: { districtId, basketKey: chosen },
  }]);
}


/**
 * UPGRADE_SETTLEMENT — deduct consumable resources, update city level.
 * Payload: { cityId, cityName, nextLevel, nextSettlement, costs: Record<string, number> }
 */
async function executeUpgradeSettlement(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const { cityId } = payload;
  if (!cityId) return { events: [], error: "Missing cityId" };
  const { data: city, error: cityError } = await supabase.from("cities")
    .select("id, name, owner_player, settlement_level, level, population_total, city_stability, local_grain_reserve")
    .eq("id", cityId).eq("session_id", sessionId).maybeSingle();
  if (cityError || !city) return { events: [], error: "Město nebylo nalezeno" };
  if (city.owner_player !== actor.name) return { events: [], error: "Povýšit lze jen vlastní město" };
  const definition = settlementUpgradeDefinition(city.settlement_level);
  if (!definition) return { events: [], error: "Sídlo je na maximální úrovni nebo má neplatný stav" };

  const realm = await getRealmFull(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };
  const requirementError = settlementUpgradeProblem(city, realm, definition);
  if (requirementError) return { events: [], error: requirementError };
  const cost = { gold: definition.costGold, production: definition.costProduction };
  const nextLevel = definition.nextLabel;
  const nextSettlement = definition.nextSettlement;

  // Lock the logical progression first. A concurrent upgrade can then win at most once.
  const { data: upgraded, error: upgradeError } = await supabase.from("cities").update({
    settlement_level: nextSettlement,
    level: nextLevel,
  }).eq("id", cityId).eq("session_id", sessionId).eq("settlement_level", definition.current)
    .select("id").maybeSingle();
  if (upgradeError || !upgraded) return { events: [], error: "Sídlo bylo mezitím změněno" };

  const reserveIO = realmReserveIO(supabase, realm.id);
  const charge = await chargeReserves(reserveIO, cost, 3, realm);
  if (charge.ok === false) {
    await supabase.from("cities").update({ settlement_level: definition.current, level: city.level })
      .eq("id", cityId).eq("session_id", sessionId).eq("settlement_level", nextSettlement);
    return { events: [], error: charge.error };
  }

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "settlement_upgrade",
    city_id: cityId,
    note: `${city.name} povýšeno na ${nextLevel}.`,
    importance: "critical",
    reference: { cityId, cityName: city.name, nextLevel, nextSettlement, cost },
  }], payload.chronicleText);
}

/**
 * APPLY_DECREE_EFFECTS — apply immediate one-time effects from decree to realm + cities.
 * Payload: { effects: [{ type, value }], chronicleText? }
 */
async function executeApplyDecreeEffects(
  _supabase: any, _base: any, _actor: Actor, _payload: any,
  _commandId: string, _sessionId: string, _turnNumber: number,
): Promise<CommandResult> {
  // Council evaluations store summaries, while declarations are client-written narrative rows.
  // Neither can authorize resources, stability or loyalty. Fail closed before any mutation.
  return { events: [], error: "Okamžité efekty dekretu nejsou dostupné: chybí serverem ověřený uložený efekt dekretu" };
}

/** SET_RATION_POLICY — policy effects come from the shared server catalogue. */
async function executeSetRationPolicy(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const cityId = String(payload?.cityId || "");
  const selected = rationPolicy(payload?.policyKey);
  if (!cityId || !selected) return { events: [], error: "Neplatný přídělový režim" };
  const { data: city, error: cityError } = await supabase.from("cities")
    .select("id, name, owner_player, ration_policy")
    .eq("id", cityId).eq("session_id", sessionId).maybeSingle();
  if (cityError || !city) return { events: [], error: "Město nebylo nalezeno" };
  if (city.owner_player !== actor.name) return { events: [], error: "Příděly lze měnit jen ve vlastním městě" };

  const { error: updateError } = await supabase.from("cities")
    .update({ ration_policy: selected.key }).eq("id", cityId).eq("session_id", sessionId);
  if (updateError) return { events: [], error: `Příděly nelze změnit: ${updateError.message}` };
  const { policy } = selected;
  const { error: policyError } = await supabase.from("city_policies").upsert({
    session_id: sessionId, city_id: cityId,
    policy_category: "food", policy_key: "ration", policy_value: selected.key,
    grain_effect: policy.grain_effect, stability_effect: policy.stability_effect,
    faction_impact: policy.faction_impact, enacted_turn: turnNumber,
    enacted_by: actor.name, description: policy.description, is_active: true,
  }, { onConflict: "city_id,policy_category,policy_key" });
  if (policyError) {
    await supabase.from("cities").update({ ration_policy: city.ration_policy })
      .eq("id", cityId).eq("session_id", sessionId).eq("ration_policy", selected.key);
    return { events: [], error: `Příděly nelze uložit: ${policyError.message}` };
  }

  return insertEvents(supabase, commandId, [{
    ...base, event_type: "policy", city_id: cityId,
    note: `${city.name}: ${policy.label}.`, importance: "minor",
    reference: { cityId, policyKey: selected.key },
  }]);
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
  const { cityId, field, nextLevel, chronicleText } = payload;
  const upgrade = infrastructureUpgradeByField(field);
  if (!cityId || !upgrade) return { events: [], error: "Neplatná infrastruktura" };
  const { data: city, error: cityError } = await supabase.from("cities")
    .select("id, name, owner_player, irrigation_level, temple_level, market_level")
    .eq("id", cityId).eq("session_id", sessionId).maybeSingle();
  if (cityError || !city) return { events: [], error: "Město nebylo nalezeno" };
  if (city.owner_player !== actor.name) return { events: [], error: "Vylepšit lze jen vlastní město" };
  const currentLevel = city[upgrade.field];
  const quote = infrastructureUpgradeQuote(upgrade, currentLevel, nextLevel);
  if (typeof quote === "string") return { events: [], error: quote };
  const infraCost = { gold: quote.costGold, production: quote.costProduction };

  const realm = await getRealmFull(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };

  // Sequential CAS prevents two simultaneous upgrades from buying the same level.
  let levelUpdate = supabase.from("cities").update({ [upgrade.field]: quote.nextLevel })
    .eq("id", cityId).eq("session_id", sessionId);
  levelUpdate = currentLevel == null ? levelUpdate.is(upgrade.field, null) : levelUpdate.eq(upgrade.field, currentLevel);
  const { data: upgraded, error: upgradeError } = await levelUpdate.select("id").maybeSingle();
  if (upgradeError || !upgraded) return { events: [], error: "Úroveň infrastruktury byla mezitím změněna" };

  const reserveIO = realmReserveIO(supabase, realm.id);
  const charge = await chargeReserves(reserveIO, infraCost, 3, realm);
  if (charge.ok === false) {
    await supabase.from("cities").update({ [upgrade.field]: currentLevel ?? 0 })
      .eq("id", cityId).eq("session_id", sessionId).eq(upgrade.field, quote.nextLevel);
    return { events: [], error: charge.error };
  }

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "construction",
    city_id: cityId,
    note: `${city.name}: ${upgrade.label} vylepšeno na úroveň ${quote.nextLevel} (−${quote.costGold} zlata, −${quote.costProduction} produkce).`,
    importance: "normal",
    reference: { cityId, field: upgrade.field, nextLevel: quote.nextLevel, costGold: quote.costGold, costProduction: quote.costProduction },
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

  // Build culturally-aware summary
  const describeNode = (n: any) => {
    const parts: string[] = [n.name];
    if (n.culture_key) parts.push(`(${n.culture_key})`);
    if (n.profile_key) parts.push(`[${n.profile_key}]`);
    return parts.join(" ");
  };
  const discoveredSummary = discoveredCount > 0
    ? `objevil ${discoveredCount === 1
        ? describeNode(discoveredNodes![0])
        : `${discoveredCount} neutrálních uzlů (${discoveredNodes!.map(describeNode).join(", ")})`}`
    : `prozkoumal hex (${tile_q}, ${tile_r})`;

  // Persist node-discovery facts into world memory for narrative continuity
  if (discoveredCount > 0) {
    const memoryRows = discoveredNodes!.map((n: any) => ({
      session_id: sessionId,
      text: `${actor.name} objevil neutrální uzel "${n.name}"${n.culture_key ? ` kultury ${n.culture_key}` : ""}${n.profile_key ? ` (profil: ${n.profile_key})` : ""} v hexu (${tile_q}, ${tile_r}).`,
      category: "discovery",
      created_round: turnNumber,
      approved: true,
    }));
    await supabase.from("world_memories").insert(memoryRows).then(() => {}, (e: any) => {
      console.warn("EXPLORE_TILE world_memories insert error:", e?.message);
    });
  }

  // Patch 14 — Public rumors so other players see vague signals about discoveries.
  if (discoveredCount > 0) {
    await emitDiscoveryRumors(supabase, sessionId, turnNumber, actor.name, discoveredNodes!);
  }

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
      discovered_nodes: (discoveredNodes || []).map((n: any) => ({
        id: n.id, name: n.name, culture: n.culture_key, profile: n.profile_key,
      })),
    },
  }], { discoveredNodes: discoveredNodes || [], visibilityWritten: upserts.length });
}

// ═══════════════════════════════════════════
// Patch 6 — Trade & Influence commands on neutral nodes
// All four require the node to be discovered by the actor.
// Engine-only: AI never decides values; thresholds in _shared/nodeInfluence.ts.
// ═══════════════════════════════════════════

function nodeContext(node: any): { suffix: string; tags: Record<string, any> } {
  const bits: string[] = [];
  if (node?.culture_key) bits.push(`kultura ${node.culture_key}`);
  if (node?.profile_key) bits.push(`profil ${node.profile_key}`);
  return {
    suffix: bits.length ? ` (${bits.join(", ")})` : "",
    tags: { node_name: node?.name, culture: node?.culture_key, profile: node?.profile_key },
  };
}

async function loadNeutralNodeForActor(
  supabase: any,
  sessionId: string,
  nodeId: string,
  actorName: string,
): Promise<{ node?: any; error?: string; status?: number }> {
  const { data: node, error } = await supabase
    .from("province_nodes")
    .select("id, name, is_neutral, discovered, controlled_by, autonomy_score, profile_key, culture_key")
    .eq("session_id", sessionId)
    .eq("id", nodeId)
    .maybeSingle();
  if (error) return { error: error.message, status: 500 };
  if (!node) return { error: "Node not found", status: 404 };
  if (!node.is_neutral || node.controlled_by) {
    return { error: "Node is not neutral / already controlled", status: 409 };
  }
  if (!node.discovered) {
    return { error: "Node has not been discovered yet", status: 403 };
  }
  // Discovery is global on the node, but the actor must also have visibility
  // on the tile. Cheap proxy: ensure they discovered or at least see it via
  // map_visibility. Skipped here for simplicity; EXPLORE_TILE feeds both paths.
  void actorName;
  return { node };
}

async function loadOrInitInfluence(
  supabase: any, sessionId: string, playerName: string, nodeId: string,
) {
  const { data: row } = await supabase
    .from("node_influence")
    .select("economic_influence, political_influence, military_pressure, resistance, integration_progress")
    .eq("session_id", sessionId).eq("player_name", playerName).eq("node_id", nodeId)
    .maybeSingle();
  if (row) return row;
  return { ...DEFAULT_INFLUENCE };
}

async function upsertInfluence(
  supabase: any, sessionId: string, playerName: string, nodeId: string, patch: Record<string, number>,
) {
  const current = await loadOrInitInfluence(supabase, sessionId, playerName, nodeId);
  const next = { ...current, ...patch };
  await supabase.from("node_influence").upsert({
    session_id: sessionId, player_name: playerName, node_id: nodeId,
    ...next,
    updated_at: new Date().toISOString(),
  }, { onConflict: "session_id,player_name,node_id" });
  return next;
}

// ─── Patch 12 — Multiplayer contestation helpers ───

async function loadRivalInfluences(
  supabase: any, sessionId: string, nodeId: string, excludePlayer: string,
): Promise<RivalRow[]> {
  const { data } = await supabase
    .from("node_influence")
    .select("player_name, economic_influence, political_influence, military_pressure, resistance, integration_progress")
    .eq("session_id", sessionId).eq("node_id", nodeId)
    .neq("player_name", excludePlayer);
  return ((data || []) as any[]).map((r) => {
    const inf: InfluenceState = {
      economic_influence: Number(r.economic_influence) || 0,
      political_influence: Number(r.political_influence) || 0,
      military_pressure: Number(r.military_pressure) || 0,
      resistance: Number(r.resistance) || 0,
      integration_progress: Number(r.integration_progress) || 0,
    };
    return { player_name: String(r.player_name), influence: inf, pressure: computePressure(inf) };
  });
}

async function countActiveTradeRivals(
  supabase: any, sessionId: string, nodeId: string, excludePlayer: string,
): Promise<number> {
  const { data } = await supabase
    .from("node_trade_links")
    .select("player_name, link_status")
    .eq("session_id", sessionId).eq("node_id", nodeId)
    .neq("player_name", excludePlayer)
    .in("link_status", ["trade_open", "protected", "vassalized"]);
  return (data || []).length;
}

async function applyRivalryErosionToAll(
  supabase: any, sessionId: string, nodeId: string, actorName: string,
  channel: "economic_influence" | "political_influence" | "military_pressure",
  actorGain: number,
): Promise<{ player_name: string; before: number; after: number }[]> {
  const rivals = await loadRivalInfluences(supabase, sessionId, nodeId, actorName);
  const log: { player_name: string; before: number; after: number }[] = [];
  for (const r of rivals) {
    const patch = applyRivalryErosion(r.influence, channel, actorGain);
    const next = patch[channel];
    if (next === undefined) continue;
    if (next === r.influence[channel]) continue;
    await supabase.from("node_influence").update({
      [channel]: next, updated_at: new Date().toISOString(),
    }).eq("session_id", sessionId).eq("node_id", nodeId).eq("player_name", r.player_name);
    log.push({ player_name: r.player_name, before: r.influence[channel], after: next });
  }
  return log;
}

async function loadActiveBlockade(
  supabase: any, sessionId: string, nodeId: string, currentTurn: number,
): Promise<{ blocked_by_player: string; blocked_until_turn: number; reason: string | null } | null> {
  const { data } = await supabase
    .from("node_blockades")
    .select("blocked_by_player, blocked_until_turn, reason")
    .eq("session_id", sessionId).eq("node_id", nodeId)
    .gte("blocked_until_turn", currentTurn)
    .order("blocked_until_turn", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as any) || null;
}

async function upsertTradeLink(
  supabase: any, sessionId: string, playerName: string, nodeId: string,
  patch: { link_status?: string; trade_level?: number; route_safety?: number },
) {
  const { data: existing } = await supabase
    .from("node_trade_links")
    .select("link_status, trade_level, route_safety")
    .eq("session_id", sessionId).eq("player_name", playerName).eq("node_id", nodeId)
    .maybeSingle();
  const next = {
    link_status: patch.link_status ?? existing?.link_status ?? "none",
    trade_level: patch.trade_level ?? existing?.trade_level ?? 0,
    route_safety: patch.route_safety ?? existing?.route_safety ?? 1,
  };
  await supabase.from("node_trade_links").upsert({
    session_id: sessionId, player_name: playerName, node_id: nodeId,
    ...next,
    updated_at: new Date().toISOString(),
  }, { onConflict: "session_id,player_name,node_id" });
  return next;
}

async function executeOpenTradeWithNode(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const nodeId = String(payload?.node_id || "");
  if (!nodeId) return { events: [], error: "node_id required", status: 400 };

  const r = await loadNeutralNodeForActor(supabase, sessionId, nodeId, actor.name);
  if (r.error) return { events: [], error: r.error, status: r.status };
  const node = r.node!;

  // Trade race: each existing rival shrinks the influence gain.
  const rivalCount = await countActiveTradeRivals(supabase, sessionId, nodeId, actor.name);
  const baseGain = 5;
  const gain = scaleByCompetition(baseGain, rivalCount);

  const link = await upsertTradeLink(supabase, sessionId, actor.name, nodeId, {
    link_status: "trade_open", trade_level: 1,
  });
  const current = await loadOrInitInfluence(supabase, sessionId, actor.name, nodeId);
  const inf = await upsertInfluence(supabase, sessionId, actor.name, nodeId, {
    economic_influence: current.economic_influence + gain,
  });

  // Rivalry erosion: rivals lose a small amount of economic_influence.
  const erosionLog = await applyRivalryErosionToAll(
    supabase, sessionId, nodeId, actor.name, "economic_influence", gain,
  );

  const ctx = nodeContext(node);
  const competitionTag = rivalCount > 0 ? ` · konkurence: ${rivalCount}` : "";
  return await insertEvents(supabase, commandId, [{
    ...base, event_type: "trade_link_opened",
    note: `${actor.name} otevřel obchod s ${node.name}${ctx.suffix} (+${gain.toFixed(1)} ekon.${competitionTag}).`,
    importance: "normal",
    reference: {
      node_id: nodeId, node_name: node.name, culture: node.culture_key, profile: node.profile_key,
      link, influence: inf, gain, rival_count: rivalCount, rival_erosion: erosionLog,
    },
  }], { link, influence: inf, gain, rivalCount, erosionLog });
}

async function executeSendEnvoyToNode(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const nodeId = String(payload?.node_id || "");
  if (!nodeId) return { events: [], error: "node_id required", status: 400 };

  const r = await loadNeutralNodeForActor(supabase, sessionId, nodeId, actor.name);
  if (r.error) return { events: [], error: r.error, status: r.status };
  const node = r.node!;

  const gain = 8;
  const current = await loadOrInitInfluence(supabase, sessionId, actor.name, nodeId);
  const inf = await upsertInfluence(supabase, sessionId, actor.name, nodeId, {
    political_influence: current.political_influence + gain,
  });

  const erosionLog = await applyRivalryErosionToAll(
    supabase, sessionId, nodeId, actor.name, "political_influence", gain,
  );

  const ctxE = nodeContext(node);
  return await insertEvents(supabase, commandId, [{
    ...base, event_type: "envoy_sent",
    note: `${actor.name} vyslal vyslance k ${node.name}${ctxE.suffix}.`,
    importance: "normal",
    reference: { node_id: nodeId, ...ctxE.tags, influence: inf, rival_erosion: erosionLog },
  }], { influence: inf, erosionLog });
}

async function executeApplyMilitaryPressure(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const nodeId = String(payload?.node_id || "");
  if (!nodeId) return { events: [], error: "node_id required", status: 400 };

  const r = await loadNeutralNodeForActor(supabase, sessionId, nodeId, actor.name);
  if (r.error) return { events: [], error: r.error, status: r.status };
  const node = r.node!;

  const gain = 10;
  const current = await loadOrInitInfluence(supabase, sessionId, actor.name, nodeId);
  const inf = await upsertInfluence(supabase, sessionId, actor.name, nodeId, {
    military_pressure: current.military_pressure + gain,
    resistance: Math.min(100, current.resistance + 3), // pushback raises resistance slightly
  });

  const erosionLog = await applyRivalryErosionToAll(
    supabase, sessionId, nodeId, actor.name, "military_pressure", gain,
  );

  const ctxP = nodeContext(node);
  return await insertEvents(supabase, commandId, [{
    ...base, event_type: "military_pressure_applied",
    note: `${actor.name} vyvíjí vojenský tlak na ${node.name}${ctxP.suffix}.`,
    importance: "high",
    reference: { node_id: nodeId, ...ctxP.tags, influence: inf, rival_erosion: erosionLog },
  }], { influence: inf, erosionLog });
}

async function executeAnnexNode(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const nodeId = String(payload?.node_id || "");
  if (!nodeId) return { events: [], error: "node_id required", status: 400 };

  const r = await loadNeutralNodeForActor(supabase, sessionId, nodeId, actor.name);
  if (r.error) return { events: [], error: r.error, status: r.status };
  const node = r.node!;

  const influence = await loadOrInitInfluence(supabase, sessionId, actor.name, nodeId);
  const check = computeAnnexCheck({
    influence,
    autonomy_score: Number(node.autonomy_score ?? 80),
  });

  if (!check.allowed) {
    return {
      events: [], status: 409,
      error: `Anexe ${node.name} není povolena: tlak ${check.integrationPressure.toFixed(1)} / práh ${check.threshold.toFixed(1)} (chybí ${check.missing.toFixed(1)})`,
    };
  }

  // Patch 12 — Diplomatic blockade lock
  const blockade = await loadActiveBlockade(supabase, sessionId, nodeId, turnNumber);
  if (blockade && blockade.blocked_by_player !== actor.name) {
    return {
      events: [], status: 409,
      error: `Anexe ${node.name} je diplomaticky zablokována hráčem ${blockade.blocked_by_player} do tahu ${blockade.blocked_until_turn}.`,
    };
  }

  // Patch 12 — Multiplayer contestation
  const rivals = await loadRivalInfluences(supabase, sessionId, nodeId, actor.name);
  const contest = computeContestation({ actorPressure: check.integrationPressure, rivals });
  if (contest.contested) {
    return {
      events: [], status: 409,
      error: `Anexe ${node.name} je kontestována (${contest.contestants}× rival, nejsilnější má tlak ${contest.topRivalPressure.toFixed(1)} vs. tvých ${check.integrationPressure.toFixed(1)}). Oslab konkurenci nebo zvyš svůj tlak.`,
    };
  }

  // ── Transition node: neutral → owned ──
  await supabase.from("province_nodes").update({
    is_neutral: false,
    controlled_by: actor.name,
    updated_at: new Date().toISOString(),
  }).eq("id", nodeId);

  await upsertTradeLink(supabase, sessionId, actor.name, nodeId, { link_status: "annexed" });
  await upsertInfluence(supabase, sessionId, actor.name, nodeId, {
    integration_progress: 100,
  });

  // Persist the annexation as a permanent world memory
  await supabase.from("world_memories").insert({
    session_id: sessionId,
    text: `${actor.name} anektoval uzel "${node.name}"${node.culture_key ? ` kultury ${node.culture_key}` : ""}${node.profile_key ? ` (profil: ${node.profile_key})` : ""} v roce ${turnNumber}.`,
    category: "annexation",
    created_round: turnNumber,
    approved: true,
  }).then(() => {}, (e: any) => {
    console.warn("ANNEX_NODE world_memories insert error:", e?.message);
  });

  // Patch 14 — Public rumor about annexation (visible to all players).
  await emitAnnexationRumor(supabase, sessionId, turnNumber, actor.name, node);

  const ctxA = nodeContext(node);
  return await insertEvents(supabase, commandId, [{
    ...base, event_type: "node_annexed",
    note: `${actor.name} anektoval ${node.name}${ctxA.suffix}.`,
    importance: "high",
    reference: { node_id: nodeId, ...ctxA.tags, check, contest },
  }], { node_id: nodeId, annex_check: check, contest });
}

// Patch 12 — Diplomatic blockade against another player's annexation attempt.
// Cost: dispatch-level (engine accepts; resource enforcement is left to upstream
// validation, since this command is intended to be paired with prestige cost).
async function executeBlockNodeAnnexation(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const nodeId = String(payload?.node_id || "");
  if (!nodeId) return { events: [], error: "node_id required", status: 400 };

  const r = await loadNeutralNodeForActor(supabase, sessionId, nodeId, actor.name);
  if (r.error) return { events: [], error: r.error, status: r.status };
  const node = r.node!;

  const durationTurns = Math.max(1, Math.min(10, Number(payload?.duration_turns ?? 3)));
  const reason = String(payload?.reason || "Diplomatický blok").slice(0, 200);
  const blockedUntil = turnNumber + durationTurns;

  await supabase.from("node_blockades").insert({
    session_id: sessionId,
    node_id: nodeId,
    blocked_by_player: actor.name,
    blocked_until_turn: blockedUntil,
    reason,
  });

  const ctxB = nodeContext(node);
  return await insertEvents(supabase, commandId, [{
    ...base, event_type: "node_annexation_blocked",
    note: `${actor.name} diplomaticky zablokoval anexi ${node.name}${ctxB.suffix} do tahu ${blockedUntil}.`,
    importance: "high",
    reference: { node_id: nodeId, ...ctxB.tags, blocked_until_turn: blockedUntil, duration_turns: durationTurns, reason },
  }], { node_id: nodeId, blocked_until_turn: blockedUntil, duration_turns: durationTurns });
}

// ─── Patch 16 — Protectorate / Vassalize / Join Trade System ───

const NEUTRAL_LINK_THRESHOLDS: Record<string, { pressure: number; econ?: number; pol?: number; mil?: number; level: number; label: string }> = {
  protected: { pressure: 25, econ: 15, level: 2, label: "Protektorát" },
  vassalized: { pressure: 45, econ: 20, pol: 20, level: 3, label: "Vasalizace" },
};

async function executeUpgradeNeutralLink(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
  targetStatus: "protected" | "vassalized",
): Promise<CommandResult> {
  const nodeId = String(payload?.node_id || "");
  if (!nodeId) return { events: [], error: "node_id required", status: 400 };

  const r = await loadNeutralNodeForActor(supabase, sessionId, nodeId, actor.name);
  if (r.error) return { events: [], error: r.error, status: r.status };
  const node = r.node!;

  const cfg = NEUTRAL_LINK_THRESHOLDS[targetStatus];
  const inf = await loadOrInitInfluence(supabase, sessionId, actor.name, nodeId);
  const pressure = inf.economic_influence * 0.45 + inf.political_influence * 0.35 + inf.military_pressure * 0.20;
  if (pressure < cfg.pressure
    || (cfg.econ && inf.economic_influence < cfg.econ)
    || (cfg.pol && inf.political_influence < cfg.pol)
    || (cfg.mil && inf.military_pressure < cfg.mil)) {
    return {
      events: [], status: 409,
      error: `${cfg.label} vyžaduje tlak ≥ ${cfg.pressure}${cfg.econ ? `, ekon. ≥ ${cfg.econ}` : ""}${cfg.pol ? `, pol. ≥ ${cfg.pol}` : ""} (máš ${pressure.toFixed(1)}, ekon. ${inf.economic_influence.toFixed(1)}, pol. ${inf.political_influence.toFixed(1)}).`,
    };
  }

  const blockade = await loadActiveBlockade(supabase, sessionId, nodeId, turnNumber);
  if (blockade && blockade.blocked_by_player !== actor.name) {
    return { events: [], status: 409, error: `${cfg.label} blokován hráčem ${blockade.blocked_by_player} do tahu ${blockade.blocked_until_turn}.` };
  }

  const link = await upsertTradeLink(supabase, sessionId, actor.name, nodeId, {
    link_status: targetStatus, trade_level: cfg.level,
  });

  const ctx = nodeContext(node);
  return await insertEvents(supabase, commandId, [{
    ...base, event_type: targetStatus === "protected" ? "node_protectorate" : "node_vassalized",
    note: `${actor.name} ustavil ${cfg.label.toLowerCase()} nad ${node.name}${ctx.suffix}.`,
    importance: "high",
    reference: { node_id: nodeId, ...ctx.tags, link, pressure },
  }], { link, pressure });
}

async function executeJoinTradeSystem(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const nodeId = String(payload?.node_id || "");
  const tradeSystemId = String(payload?.trade_system_id || "");
  if (!nodeId || !tradeSystemId) return { events: [], error: "node_id & trade_system_id required", status: 400 };

  const { data: node } = await supabase
    .from("province_nodes")
    .select("id, name, trade_system_id, controlled_by, is_neutral")
    .eq("session_id", sessionId).eq("id", nodeId).maybeSingle();
  if (!node) return { events: [], error: "Node not found", status: 404 };

  const { data: sys } = await supabase
    .from("trade_systems")
    .select("id, system_key, member_players")
    .eq("id", tradeSystemId).eq("session_id", sessionId).maybeSingle();
  if (!sys) return { events: [], error: "Trade system not found", status: 404 };
  if (!(sys.member_players || []).includes(actor.name)) {
    return { events: [], error: "Nejsi členem tohoto obchodního systému.", status: 403 };
  }

  // Verify a route exists between this node and any node already in the system
  const { data: sysNodes } = await supabase
    .from("province_nodes")
    .select("id").eq("session_id", sessionId).eq("trade_system_id", tradeSystemId);
  const sysNodeIds = (sysNodes || []).map((n: any) => n.id);
  if (sysNodeIds.length === 0) return { events: [], error: "Systém nemá žádné uzly.", status: 409 };

  const { data: routes } = await supabase
    .from("province_routes")
    .select("id, node_a, node_b")
    .eq("session_id", sessionId)
    .or(`and(node_a.eq.${nodeId},node_b.in.(${sysNodeIds.join(",")})),and(node_b.eq.${nodeId},node_a.in.(${sysNodeIds.join(",")}))`);
  if (!routes || routes.length === 0) {
    return { events: [], status: 409, error: "Mezi uzlem a obchodním systémem neexistuje cesta. Postav silnici nebo přístav." };
  }

  await supabase.from("province_nodes").update({
    trade_system_id: tradeSystemId, updated_at: new Date().toISOString(),
  }).eq("id", nodeId);

  return await insertEvents(supabase, commandId, [{
    ...base, event_type: "node_joined_trade_system",
    note: `${actor.name} připojil ${node.name} k obchodnímu systému #${sys.system_key.slice(0, 6)}.`,
    importance: "normal",
    reference: { node_id: nodeId, trade_system_id: tradeSystemId },
  }], { trade_system_id: tradeSystemId });
}
// Other players see vague signals so they can react (form rivalries, race for nodes).
// Rumors live in the global `rumors` table; UNIQUE source_hash dedupes accidental retries.

async function emitDiscoveryRumors(
  supabase: any, sessionId: string, turnNumber: number, actorName: string, nodes: any[],
) {
  if (!nodes?.length) return;
  const rows = nodes.map((n: any) => {
    const cultureBit = n.culture_key ? ` lid kultury ${n.culture_key}` : "";
    const profileBit = n.profile_key ? ` (${n.profile_key})` : "";
    return {
      session_id: sessionId,
      turn_number: turnNumber,
      category: "exploration",
      scope: "regional",
      confidence: 60,
      bias: "merchant",
      tone: "curious",
      short_text: `Zvěsti o objevu uzlu „${n.name}"${profileBit} —${cultureBit}.`,
      entity_refs: { node_id: n.id, discovered_by: actorName },
      source_hash: `discovery:${n.id}:t${turnNumber}`,
      is_reminder: false,
    };
  });
  await supabase.from("rumors").upsert(rows, {
    onConflict: "session_id,source_hash", ignoreDuplicates: true,
  }).then(() => {}, (e: any) => {
    console.warn("emitDiscoveryRumors error:", e?.message);
  });
}

async function emitAnnexationRumor(
  supabase: any, sessionId: string, turnNumber: number, actorName: string, node: any,
) {
  const cultureBit = node.culture_key ? ` (kultura ${node.culture_key})` : "";
  await supabase.from("rumors").upsert([{
    session_id: sessionId,
    turn_number: turnNumber,
    category: "diplomacy",
    scope: "world",
    confidence: 90,
    bias: "court",
    tone: "tense",
    short_text: `${actorName} anektoval uzel „${node.name}"${cultureBit}. Mocenská rovnováha v regionu se mění.`,
    entity_refs: { node_id: node.id, annexed_by: actorName },
    source_hash: `annex:${node.id}`,
    is_reminder: false,
  }], { onConflict: "session_id,source_hash", ignoreDuplicates: true })
    .then(() => {}, (e: any) => {
      console.warn("emitAnnexationRumor error:", e?.message);
    });
}

// ═══════════════════════════════════════════════════════════════════════
// Node-Trade v1 — Stage 6 handlers
// PROPOSE_TREATY, RESPOND_TREATY, CANCEL_TREATY. MOBILIZE_MANPOWER is retired fail-closed above.
// ═══════════════════════════════════════════════════════════════════════

async function executeProposeTreaty(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const treatyType = String(payload.treatyType || "").trim();
  const partner = String(payload.partner || payload.otherParty || "").trim();
  const ALLOWED = ["open_borders", "trade_access", "non_aggression", "alliance", "peace"];
  if (!ALLOWED.includes(treatyType)) {
    return { events: [], error: `Invalid treatyType (${treatyType}). Allowed: ${ALLOWED.join(", ")}` };
  }
  if (!partner || partner === actor.name) return { events: [], error: "Invalid partner" };

  // Idempotent on (session, type, sorted players, status=proposed)
  const [pa, pb] = [actor.name, partner].sort();
  const { data: dup } = await supabase.from("diplomatic_treaties")
    .select("id").eq("session_id", sessionId)
    .eq("treaty_type", treatyType).eq("player_a", pa).eq("player_b", pb)
    .in("status", ["proposed", "active"]).maybeSingle();
  if (dup) return { events: [], error: "Treaty already proposed or active between these players" };

  const meta = {
    proposed_by: actor.name,
    tariff_factor: typeof payload.tariffFactor === "number" ? payload.tariffFactor : 1.2,
    terms: payload.terms || null,
  };

  const { data: inserted, error } = await supabase.from("diplomatic_treaties").insert({
    session_id: sessionId,
    treaty_type: treatyType,
    player_a: pa, player_b: pb,
    status: "proposed",
    signed_turn: null,
    metadata: meta,
  }).select("id").single();
  if (error) return { events: [], error: error.message };

  const note = `${actor.name} navrhl ${partner} smlouvu typu „${treatyType}".`;
  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "treaty_proposed",
    note, importance: "normal",
    reference: { treatyId: inserted?.id, treatyType, partner, terms: meta.terms },
  }], payload.chronicleText);
}

async function executeRespondTreaty(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const treatyId = String(payload.treatyId || "").trim();
  const accept = !!payload.accept;
  if (!treatyId) return { events: [], error: "Missing treatyId" };

  const { data: t } = await supabase.from("diplomatic_treaties")
    .select("id, treaty_type, player_a, player_b, status, metadata")
    .eq("id", treatyId).eq("session_id", sessionId).single();
  if (!t) return { events: [], error: "Treaty not found" };
  if (t.status !== "proposed") return { events: [], error: `Treaty is not pending (status=${t.status})` };
  if (t.player_a !== actor.name && t.player_b !== actor.name) {
    return { events: [], error: "You are not party to this treaty" };
  }
  const proposer = (t.metadata as any)?.proposed_by;
  if (proposer === actor.name) return { events: [], error: "You cannot respond to your own proposal" };

  if (accept) {
    await supabase.from("diplomatic_treaties").update({
      status: "active",
      signed_turn: turnNumber,
    }).eq("id", treatyId);
    const note = `${actor.name} přijal smlouvu „${t.treaty_type}" s ${proposer || (t.player_a === actor.name ? t.player_b : t.player_a)}.`;
    return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
      ...base,
      event_type: "treaty_signed",
      note, importance: "critical",
      reference: { treatyId, treatyType: t.treaty_type, partners: [t.player_a, t.player_b] },
    }], payload.chronicleText);
  } else {
    await supabase.from("diplomatic_treaties").update({
      status: "rejected",
      cancelled_turn: turnNumber,
    }).eq("id", treatyId);
    const note = `${actor.name} odmítl návrh smlouvy „${t.treaty_type}".`;
    return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
      ...base,
      event_type: "treaty_rejected",
      note, importance: "normal",
      reference: { treatyId, treatyType: t.treaty_type },
    }], payload.chronicleText);
  }
}

async function executeCancelTreaty(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const treatyId = String(payload.treatyId || "").trim();
  if (!treatyId) return { events: [], error: "Missing treatyId" };

  const { data: t } = await supabase.from("diplomatic_treaties")
    .select("id, treaty_type, player_a, player_b, status")
    .eq("id", treatyId).eq("session_id", sessionId).single();
  if (!t) return { events: [], error: "Treaty not found" };
  if (t.player_a !== actor.name && t.player_b !== actor.name) {
    return { events: [], error: "You are not party to this treaty" };
  }
  if (t.status === "cancelled" || t.status === "rejected") {
    return { events: [], error: `Treaty already inactive (status=${t.status})` };
  }

  await supabase.from("diplomatic_treaties").update({
    status: "cancelled",
    cancelled_turn: turnNumber,
  }).eq("id", treatyId);

  const other = t.player_a === actor.name ? t.player_b : t.player_a;
  const note = `${actor.name} jednostranně ukončil smlouvu „${t.treaty_type}" s ${other}.`;
  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "treaty_cancelled",
    note, importance: "critical",
    reference: { treatyId, treatyType: t.treaty_type, terminated_by: actor.name },
  }], payload.chronicleText);
}

// ═══════════════════════════════════════════
// Stage 8 — ASSIGN_STACK_TO_ROUTE
// Assigns an idle military stack to a route under construction.
// ═══════════════════════════════════════════
async function executeAssignStackToRoute(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const stackId = String(payload.stackId || "").trim();
  const routeId = String(payload.routeId || "").trim();
  if (!stackId || !routeId) return { events: [], error: "Missing stackId or routeId" };

  const { data: stack } = await supabase.from("military_stacks")
    .select("id, owner_player, player_name, soldiers, unit_count, assignment, assigned_route_id, name")
    .eq("id", stackId).eq("session_id", sessionId).maybeSingle();
  if (!stack) return { events: [], error: "Stack not found" };
  const owner = stack.owner_player || stack.player_name;
  if (owner !== actor.name) return { events: [], error: "You do not own this stack" };

  const { data: route } = await supabase.from("province_routes")
    .select("id, construction_state, route_type, metadata, node_a, node_b")
    .eq("id", routeId).eq("session_id", sessionId).maybeSingle();
  if (!route) return { events: [], error: "Route not found" };
  if (route.construction_state !== "under_construction") {
    return { events: [], error: `Route is not under construction (state=${route.construction_state})` };
  }

  await supabase.from("military_stacks").update({
    assignment: "construction",
    assigned_route_id: routeId,
  }).eq("id", stackId);

  const soldiers = stack.soldiers || stack.unit_count || 0;
  const note = `${actor.name} přidělil ${stack.name} (${soldiers} mužů) na stavbu cesty (${route.route_type}).`;
  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "construction",
    note, importance: "normal",
    reference: { stackId, routeId, soldiers, routeType: route.route_type },
  }], payload.chronicleText);
}

// ═══════════════════════════════════════════
// Stage 8 — CANCEL_ROUTE_CONSTRUCTION
// Cancels a route under construction; refunds 50% gold; releases assigned stacks.
// ═══════════════════════════════════════════
async function executeCancelRouteConstruction(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const routeId = String(payload.routeId || "").trim();
  if (!routeId) return { events: [], error: "Missing routeId" };

  const { data: route } = await supabase.from("province_routes")
    .select("id, construction_state, route_type, metadata, build_cost, node_a, node_b")
    .eq("id", routeId).eq("session_id", sessionId).maybeSingle();
  if (!route) return { events: [], error: "Route not found" };
  if (route.construction_state !== "under_construction") {
    return { events: [], error: "Route is not under construction" };
  }

  const md = (route.metadata || {}) as any;
  const builtBy = md.built_by;
  if (builtBy && builtBy !== actor.name) {
    return { events: [], error: "Only the builder can cancel construction" };
  }

  // Release any assigned stacks
  await supabase.from("military_stacks")
    .update({ assignment: "idle", assigned_route_id: null })
    .eq("session_id", sessionId)
    .eq("assigned_route_id", routeId);

  // Refund 50% of gold cost (pracovní síla není ledger - nic neodečítáme ani nevracíme)
  const refund = Math.floor((route.build_cost || 0) * 0.5);
  if (refund > 0) {
    const { data: realm } = await supabase.from("realm_resources")
      .select("id, gold_reserve").eq("session_id", sessionId).eq("player_name", actor.name).maybeSingle();
    if (realm) {
      await supabase.from("realm_resources").update({
        gold_reserve: (realm.gold_reserve || 0) + refund,
      }).eq("id", realm.id);
    }
  }

  // Delete route (it never reached complete state)
  await supabase.from("province_routes").delete().eq("id", routeId);

  const note = `${actor.name} zrušil stavbu cesty (${route.route_type}). Vráceno ${refund} zlata.`;
  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "construction_cancelled",
    note, importance: "normal",
    reference: { routeId, routeType: route.route_type, refund },
  }], payload.chronicleText);
}

// ════════════════════════════════════════════════════════════════════════════
// CANONICAL WRITES MOVED OFF THE CLIENT (audit Phase 2)
//
// These used to be UI-side writes into realm_resources / cities / generals,
// which bypassed command idempotency and the gold_reserve ownership rule.
// They are ONE-OFF TRANSACTIONS (command-dispatch's documented exception to
// "process-turn owns the turn fiscal"), never turn fiscal and never history.
// ════════════════════════════════════════════════════════════════════════════

/** Deterministic 0..1 draw from a command id — no Math.random in canonical writes. */
function commandRandom(commandId: string, salt = ""): number {
  let h = 2166136261;
  const s = `${commandId}:${salt}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * RECRUIT_GENERAL — insert the general and charge the fee atomically.
 * Payload: { generalName, cost?, flavorTrait?, chronicleText? }
 * Skill is rolled server-side from the command id, so a retry of the same
 * command can never produce a different general.
 */
async function executeRecruitGeneral(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const name = String(payload?.generalName || payload?.name || "").trim();
  if (!name) return { events: [], error: "Jméno generála je povinné", status: 400 };
  const cost = Math.max(0, Math.round(Number(payload?.cost ?? 100)));

  const realm = await getRealmFull(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };
  const gold = Number(realm.gold_reserve || 0);
  if (gold < cost) return { events: [], error: `Nedostatek zlata (potřeba ${cost}, máš ${Math.floor(gold)})` };

  const skill = 40 + Math.floor(commandRandom(commandId, "skill") * 30); // 40-69
  const { error: insErr } = await supabase.from("generals").insert({
    session_id: sessionId,
    player_name: actor.name,
    name,
    skill,
    flavor_trait: String(payload?.flavorTrait || "").trim() || null,
  });
  if (insErr) return { events: [], error: `Generála nelze jmenovat: ${insErr.message}` };

  if (cost > 0) {
    await supabase.from("realm_resources").update({ gold_reserve: gold - cost }).eq("id", realm.id);
  }

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "military",
    note: payload.note || `${actor.name} jmenoval generála ${name} (schopnost ${skill}). Náklady: ${cost} zlata.`,
    importance: "normal",
    reference: { general_name: name, skill, cost },
  }], payload.chronicleText || `${actor.name} jmenoval generála **${name}** (schopnost ${skill}). Náklady: ${cost} zlata.`);
}

const NEUTRAL_TRIBUTE: Record<string, number> = {
  HAMLET: 50, TOWNSHIP: 100, CITY: 200, POLIS: 300,
};

/**
 * SIGN_NEUTRAL_PACT — pay tribute to a neutral settlement for trade access.
 * Payload: { city_id, node_id }. The tribute is derived server-side from the
 * settlement level, so the client cannot choose its own price.
 */
async function executeSignNeutralPact(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const cityId = String(payload?.city_id || "");
  if (!cityId) return { events: [], error: "city_id required", status: 400 };

  const { data: city } = await supabase.from("cities")
    .select("id, name, node_id, settlement_level, owner_player")
    .eq("session_id", sessionId).eq("id", cityId).maybeSingle();
  if (!city) return { events: [], error: "Město nenalezeno", status: 404 };
  const nodeId = city.node_id || payload?.node_id || null;
  if (!nodeId) return { events: [], error: "Město není v dopravní síti" };

  const { data: existing } = await supabase.from("neutral_trade_pacts")
    .select("id").eq("session_id", sessionId).eq("neutral_node_id", nodeId)
    .eq("player_name", actor.name).eq("status", "active").maybeSingle();
  if (existing) return { events: [], error: "Pakt s tímto městem už máš" };

  const level = String(city.settlement_level ?? "HAMLET").toUpperCase();
  const tribute = NEUTRAL_TRIBUTE[level] ?? 50;

  const realm = await getRealmFull(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };
  const gold = Number(realm.gold_reserve || 0);
  if (gold < tribute) return { events: [], error: `Nedostatek zlata (potřeba ${tribute}, máš ${Math.floor(gold)})` };

  const { error: pactErr } = await supabase.from("neutral_trade_pacts").insert({
    session_id: sessionId,
    neutral_node_id: nodeId,
    player_name: actor.name,
    tribute_paid: tribute,
    signed_turn: turnNumber,
    status: "active",
    metadata: { city_id: cityId, settlement_level: level },
  });
  if (pactErr) return { events: [], error: `Pakt nelze uzavřít: ${pactErr.message}` };

  await supabase.from("realm_resources").update({ gold_reserve: gold - tribute }).eq("id", realm.id);

  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "neutral_pact_signed",
    note: `${actor.name} uzavřel obchodní pakt s neutrálním ${city.name} (tribut ${tribute} zlata).`,
    importance: "important",
    city_id: cityId,
    reference: { city_id: cityId, node_id: nodeId, tribute, settlement_level: level },
  }], payload.chronicleText);
}

/**
 * RESOLVE_UPRISING — apply the chosen concession atomically.
 * Payload: { uprisingId, concession, responseText? }
 * Concession costs are derived from the stored uprising demands, never from
 * client-supplied numbers. Population is not modified here.
 */
async function executeResolveUprising(
  supabase: any, base: any, actor: Actor, payload: any,
  commandId: string, sessionId: string, turnNumber: number,
): Promise<CommandResult> {
  const uprisingId = String(payload?.uprisingId || "");
  const concession = String(payload?.concession || "");
  if (!uprisingId || !concession) return { events: [], error: "uprisingId a concession jsou povinné", status: 400 };

  const { data: uprising } = await supabase.from("city_uprisings")
    .select("id, session_id, city_id, city_name, status, demands, city_stability")
    .eq("session_id", sessionId).eq("id", uprisingId).maybeSingle();
  if (!uprising) return { events: [], error: "Vzpoura nenalezena", status: 404 };
  if (uprising.status === "resolved") return { events: [], error: "Vzpoura už je vyřešena" };

  const { data: city } = await supabase.from("cities")
    .select("id, name, owner_player, city_stability").eq("id", uprising.city_id).maybeSingle();
  if (!city || city.owner_player !== actor.name) {
    return { events: [], error: "Toto město nepatří tvé říši", status: 403 };
  }

  const realm = await getRealmFull(supabase, sessionId, actor.name);
  if (!realm) return { events: [], error: "Realm not found" };

  const demands = Array.isArray(uprising.demands) ? uprising.demands : [];
  const stability = Number(uprising.city_stability ?? city.city_stability ?? 30);
  const effects: Record<string, any> = {};
  const extraEvents: any[] = [];

  if (concession === "pay_wealth") {
    const pct = Number(demands.find((d: any) => d.type === "pay_wealth")?.cost_percent ?? 30);
    const gold = Number(realm.gold_reserve || 0);
    const loss = Math.round(gold * pct / 100);
    await supabase.from("realm_resources").update({ gold_reserve: Math.max(0, gold - loss) }).eq("id", realm.id);
    effects.wealth_lost = loss;
    effects.cooldown_until = turnNumber + 3;
    await supabase.from("cities").update({
      famine_consecutive_turns: 0, famine_turn: false, famine_severity: 0,
      city_stability: Math.min(100, stability + 20),
      uprising_cooldown_until: effects.cooldown_until,
    }).eq("id", uprising.city_id);
  } else if (concession === "open_stores") {
    // TODO: enable only after a canonical Goods RPC can move physical food lots atomically.
    return { events: [], error: LEGACY_FOOD_TRANSFER_ERROR };
  } else if (concession === "cede_city") {
    await supabase.from("cities").update({
      owner_player: "Nezávislé",
      famine_turn: false, famine_severity: 0, famine_consecutive_turns: 0,
      city_stability: 60, is_capital: false,
      uprising_cooldown_until: turnNumber + 99,
    }).eq("id", uprising.city_id);
    effects.city_ceded = true;
    await ensureSingleCapital(supabase, sessionId, { owners: [actor.name] });
    extraEvents.push({
      ...base, event_type: "crisis",
      note: `${actor.name} se vzdal města ${uprising.city_name} po vzpouře lidu.`,
      importance: "critical", city_id: uprising.city_id,
    });
  } else if (concession === "abdicate") {
    await supabase.from("cities")
      .update({ owner_player: "Nezávislé", is_capital: false })
      .eq("session_id", sessionId).eq("owner_player", actor.name);
    effects.abdicated = true;
    extraEvents.push({
      ...base, event_type: "abdication",
      note: `${actor.name} odstoupil z trůnu pod tlakem hladovějícího lidu.`,
      importance: "critical",
    });
  } else {
    return { events: [], error: `Neznámé ústupky: ${concession}`, status: 400 };
  }

  await supabase.from("city_uprisings").update({
    status: "resolved",
    chosen_concession: concession,
    player_response_text: String(payload?.responseText || "").trim() || null,
    resolved_turn: turnNumber,
    effects_applied: effects,
  }).eq("id", uprisingId);

  const label = demands.find((d: any) => d.type === concession)?.label || concession;
  return insertEventsWithChronicle(supabase, commandId, sessionId, turnNumber, [{
    ...base,
    event_type: "uprising_resolved",
    note: `Vzpoura v ${uprising.city_name} ukončena: ${label}.`,
    importance: "important",
    city_id: uprising.city_id,
    reference: { uprising_id: uprisingId, concession, effects },
  }, ...extraEvents], payload.chronicleText
    || `**Vzpoura v ${uprising.city_name} ukončena (rok ${turnNumber}):** Vládce ${actor.name} zvolil: "${label}".`);
}
