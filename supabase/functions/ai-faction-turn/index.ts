/**
 * ai-faction-turn: Enhanced AI faction decision-making with FULL military capability.
 * Uses unified AI context (createAIContext + invokeAI) for premise injection.
 */

import { createAIContext, invokeAI, getServiceClient, corsHeaders, jsonResponse as json, errorResponse } from "../_shared/ai-context.ts";
import { buildBasketSnapshot } from "../_shared/basket-context.ts";
import { applyStackMove } from "../_shared/stackMovementCommand.ts";
import { planShortHopToward } from "../_shared/movement.ts";
import { buildFactionBriefing } from "./briefing.ts";
import { generateValidActions } from "./actions.ts";

// ═══════════════════════════════════════════
// HEX MATH
// ═══════════════════════════════════════════

const AXIAL_NEIGHBORS = [
  { dq: 1, dr: 0 }, { dq: -1, dr: 0 },
  { dq: 0, dr: 1 }, { dq: 0, dr: -1 },
  { dq: 1, dr: -1 }, { dq: -1, dr: 1 },
];

function hexDistance(q1: number, r1: number, q2: number, r2: number): number {
  return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
}

/** Returns the neighbor hex of (fromQ, fromR) that is closest to (toQ, toR). */
function stepToward(fromQ: number, fromR: number, toQ: number, toR: number): { q: number; r: number } {
  let best = { q: fromQ, r: fromR };
  let bestDist = Infinity;
  for (const n of AXIAL_NEIGHBORS) {
    const nq = fromQ + n.dq;
    const nr = fromR + n.dr;
    const d = hexDistance(nq, nr, toQ, toR);
    if (d < bestDist) {
      bestDist = d;
      best = { q: nq, r: nr };
    }
  }
  return best;
}

// ═══════════════════════════════════════════
// MOBILIZATION SCALING (Aggressive profile)
// ═══════════════════════════════════════════

interface MilitaryMetrics {
  warState: "peace" | "tension" | "war";
  suggestedMobilizationRate: number;
  maxSafeMobilization: number;
  currentMobilizationRate: number;
  armyMaintenanceCost: { gold: number; grain: number };
  canAffordMoreTroops: boolean;
  warReadiness: number; // 0-100
  totalArmyPower: number;
  deployedArmyPower: number;
  enemyVisiblePower: number;
  vulnerableCities: Array<{ name: string; hexQ: number; hexR: number; stability: number; garrison: number }>;
  suggestedTargets: Array<{ name: string; hexQ: number; hexR: number; ownerPlayer: string; distanceFromNearest: number }>;
  undeployedStacks: Array<{ id: string; name: string; power: number }>;
  deployedStacks: Array<{ id: string; name: string; power: number; hexQ: number; hexR: number; movedThisTurn: boolean }>;
}

function computeMilitaryMetrics(
  resources: { gold: number; grain: number; manpower: number; manpowerCommitted: number },
  mobilizationRate: number,
  activeWars: any[],
  tensionData: any[],
  factionName: string,
  myStacks: any[],
  myCities: any[],
  allCities: any[],
  enemyStacks: any[],
): MilitaryMetrics {
  // Determine war state
  const atWar = activeWars.length > 0;
  const maxTension = tensionData
    .filter((t: any) => t.player_a === factionName || t.player_b === factionName)
    .reduce((max: number, t: any) => Math.max(max, t.total_tension || 0), 0);
  const warState = atWar ? "war" : maxTension >= 40 ? "tension" : "peace";

  // Mobilization targets (aggressive profile)
  const targetRates: Record<string, number> = { peace: 0.20, tension: 0.35, war: 0.55 };
  const suggestedMobilizationRate = targetRates[warState];

  // Economic safety checks
  const totalPop = myCities.reduce((s: number, c: any) => s + (c.population_total || 0), 0);
  const totalArmy = myStacks.reduce((s: number, st: any) => s + (st.power || 0), 0);
  const armyGoldCost = Math.ceil(totalArmy / 100); // 1 gold per 100 troops
  const armyGrainCost = Math.ceil(totalArmy / 500); // 1 grain per 500 troops

  // Safety: never mobilize if it would crash economy within 3 turns
  const grainSafetyMargin = resources.grain - armyGrainCost * 3;
  const goldSafetyMargin = resources.gold - armyGoldCost * 3;
  const maxSafe = grainSafetyMargin > 0 && goldSafetyMargin > 0
    ? suggestedMobilizationRate
    : Math.min(suggestedMobilizationRate, mobilizationRate * 0.8); // Don't increase if broke

  const canAfford = grainSafetyMargin > 10 && goldSafetyMargin > 5;

  // War readiness = army power relative to threats
  const enemyPower = enemyStacks.reduce((s: number, st: any) => s + (st.power || 0), 0);
  const warReadiness = enemyPower > 0
    ? Math.min(100, Math.round((totalArmy / enemyPower) * 100))
    : totalArmy > 0 ? 100 : 0;

  // Vulnerable own cities (low stability/garrison)
  const vulnerable = myCities
    .filter((c: any) => (c.city_stability || 70) < 50 || (c.military_garrison || 0) < 100)
    .map((c: any) => ({ name: c.name, hexQ: c.province_q, hexR: c.province_r, stability: c.city_stability || 0, garrison: c.military_garrison || 0 }));

  // Enemy targets: find enemy cities, sorted by distance from nearest own city
  const warTargetPlayers = activeWars.map((w: any) =>
    w.declaring_player === factionName ? w.target_player : w.declaring_player
  );
  const enemyCities = allCities.filter((c: any) =>
    warTargetPlayers.includes(c.owner_player)
  );

  const suggestedTargets = enemyCities.map((ec: any) => {
    const minDist = myCities.reduce((min: number, mc: any) =>
      Math.min(min, hexDistance(mc.province_q, mc.province_r, ec.province_q, ec.province_r)), Infinity
    );
    return { name: ec.name, hexQ: ec.province_q, hexR: ec.province_r, ownerPlayer: ec.owner_player, distanceFromNearest: minDist };
  }).sort((a, b) => a.distanceFromNearest - b.distanceFromNearest);

  const deployed = myStacks.filter((s: any) => s.is_deployed);
  const undeployed = myStacks.filter((s: any) => !s.is_deployed);

  return {
    warState,
    suggestedMobilizationRate,
    maxSafeMobilization: maxSafe,
    currentMobilizationRate: mobilizationRate,
    armyMaintenanceCost: { gold: armyGoldCost, grain: armyGrainCost },
    canAffordMoreTroops: canAfford,
    warReadiness,
    totalArmyPower: totalArmy,
    deployedArmyPower: deployed.reduce((s: number, st: any) => s + (st.power || 0), 0),
    enemyVisiblePower: enemyPower,
    vulnerableCities: vulnerable,
    suggestedTargets,
    undeployedStacks: undeployed.map((s: any) => ({ id: s.id, name: s.name, power: s.power || 0 })),
    deployedStacks: deployed.map((s: any) => ({
      id: s.id, name: s.name, power: s.power || 0,
      hexQ: s.hex_q ?? 0, hexR: s.hex_r ?? 0, movedThisTurn: !!s.moved_this_turn,
    })),
  };
}

// ═══════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  try {
    const { sessionId, factionName } = await req.json();

    const supabase = getServiceClient();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── Fetch faction ──
    const { data: faction } = await supabase.from("ai_factions")
      .select("*").eq("session_id", sessionId)
      .eq("faction_name", factionName).eq("is_active", true).single();
    if (!faction) return json({ error: "Faction not found or inactive" }, 404);

    // ── Fetch session ──
    const { data: session } = await supabase.from("game_sessions")
      .select("current_turn, epoch_style").eq("id", sessionId).single();
    if (!session) throw new Error("Session not found");

    const turn = session.current_turn;

    // ── Parallel data fetch ──
    const [
      { data: cities },
      { data: allCities },
      { data: realmRes },
      { data: stacks },
      { data: enemyStacks },
      { data: recentEvents },
      { data: worldSummary },
      { data: influenceData },
      { data: tensionData },
      { data: warDeclarations },
      { data: diplomacyRooms },
      { data: civ },
      { data: buildingTemplates },
      { data: allFactions },
      { data: allTensionData },
      { data: tradeRoutes },
      { data: myPastActions },
      { data: pendingPactEvents },
      { data: myProvinces },
    ] = await Promise.all([
      supabase.from("cities").select("id, name, level, status, population_total, city_stability, settlement_level, military_garrison, province_q, province_r")
        .eq("session_id", sessionId).eq("owner_player", factionName),
      supabase.from("cities").select("id, name, owner_player, population_total, city_stability, military_garrison, province_q, province_r, settlement_level")
        .eq("session_id", sessionId),
      supabase.from("realm_resources").select("*")
        .eq("session_id", sessionId).eq("player_name", factionName).maybeSingle(),
      supabase.from("military_stacks").select("id, name, formation_type, morale, power, is_deployed, player_name, hex_q, hex_r, moved_this_turn")
        .eq("session_id", sessionId).eq("player_name", factionName).eq("is_active", true),
      supabase.from("military_stacks").select("id, name, power, player_name, is_deployed, hex_q, hex_r")
        .eq("session_id", sessionId).neq("player_name", factionName).eq("is_active", true).eq("is_deployed", true),
      supabase.from("game_events").select("event_type, player, turn_number, note, result, location")
        .eq("session_id", sessionId).eq("confirmed", true)
        .gte("turn_number", Math.max(1, turn - 3)).order("turn_number", { ascending: false }).limit(20),
      supabase.from("ai_world_summaries").select("summary_text, key_facts")
        .eq("session_id", sessionId).eq("summary_type", "world_state")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("civ_influence")
        .select("player_name, total_influence, military_score, trade_score, diplomatic_score")
        .eq("session_id", sessionId).order("turn_number", { ascending: false }).limit(10),
      supabase.from("civ_tensions")
        .select("player_a, player_b, total_tension, crisis_triggered")
        .eq("session_id", sessionId)
        .or(`player_a.eq.${factionName},player_b.eq.${factionName}`)
        .order("turn_number", { ascending: false }).limit(10),
      supabase.from("war_declarations").select("*")
        .eq("session_id", sessionId)
        .or(`declaring_player.eq.${factionName},target_player.eq.${factionName}`)
        .in("status", ["active", "peace_offered"]),
      supabase.from("diplomacy_rooms").select("id, participant_a, participant_b")
        .eq("session_id", sessionId)
        .or(`participant_a.eq.${factionName},participant_b.eq.${factionName}`),
      supabase.from("civilizations").select("civ_bonuses, core_myth, cultural_quirk, architectural_style")
        .eq("session_id", sessionId).eq("player_name", factionName).maybeSingle(),
      supabase.from("building_templates").select("name, category, cost_wood, cost_stone, cost_iron, cost_wealth, required_settlement_level")
        .limit(20),
      // NPC-NPC: fetch all AI factions for inter-faction awareness
      supabase.from("ai_factions").select("faction_name, personality, disposition, goals, is_active")
        .eq("session_id", sessionId).eq("is_active", true),
      // All tensions (not just involving this faction)
      supabase.from("civ_tensions").select("player_a, player_b, total_tension, crisis_triggered")
        .eq("session_id", sessionId).order("turn_number", { ascending: false }).limit(50),
      // Trade routes
      supabase.from("trade_routes").select("player_a, player_b, resource_type, amount, route_safety, is_active")
        .eq("session_id", sessionId).eq("is_active", true),
      // AI MEMORY: what did this faction do last turn?
      supabase.from("world_action_log").select("action_type, description, turn_number")
        .eq("session_id", sessionId).eq("player_name", factionName)
        .gte("turn_number", Math.max(1, turn - 2)).order("turn_number", { ascending: false }).limit(15),
      // Pending pact proposals directed at this faction
      supabase.from("game_events").select("id, event_type, player, note, reference, turn_number")
        .eq("session_id", sessionId).eq("confirmed", true)
        .in("event_type", ["treaty"])
        .gte("turn_number", Math.max(1, turn - 1)).limit(20),
      // Provinces for settlement founding
      supabase.from("provinces").select("id, name, owner_player, hex_q, hex_r")
        .eq("session_id", sessionId),
    ]);

    // ── Load diplomatic relations, memory, intents + STRATEGIC GRAPH ──
    const [
      { data: diplomRelations },
      { data: diplomMemories },
      { data: activeIntents },
      { data: strategicNodes },
      { data: strategicRoutes },
      { data: supplyStates },
    ] = await Promise.all([
      supabase.from("diplomatic_relations").select("*")
        .eq("session_id", sessionId)
        .or(`faction_a.eq.${factionName},faction_b.eq.${factionName}`),
      supabase.from("diplomatic_memory").select("*")
        .eq("session_id", sessionId).eq("is_active", true)
        .or(`faction_a.eq.${factionName},faction_b.eq.${factionName}`)
        .order("turn_number", { ascending: false }).limit(30),
      supabase.from("faction_intents").select("*")
        .eq("session_id", sessionId).eq("faction_name", factionName).eq("status", "active"),
      // Strategic nodes with scores (incl. neutral metadata for Patch 9c)
      supabase.from("province_nodes")
        .select("id, name, node_type, hex_q, hex_r, strategic_value, economic_value, defense_value, is_major, city_id, controlled_by, fortification_level, infrastructure_level, production_output, wealth_output, capacity_score, cumulative_trade_flow, is_neutral, discovered, culture_key, profile_key, autonomy_score")
        .eq("session_id", sessionId).eq("is_active", true),
      // Routes with flow data
      supabase.from("province_routes")
        .select("id, node_a, node_b, route_type, capacity_value, control_state, upgrade_level, hex_path_cost, hex_bottleneck_q, hex_bottleneck_r")
        .eq("session_id", sessionId),
      // Supply chain state
      supabase.from("supply_chain_state")
        .select("node_id, connected_to_capital, supply_level, isolation_turns, hop_distance")
        .eq("session_id", sessionId)
        .order("turn_number", { ascending: false }),
    ]);

    // ── Patch 9c + 12: faction's influence + trade links + RIVAL pressure + active blockades ──
    const [{ data: nodeInfluenceRows }, { data: nodeTradeLinks }, { data: rivalInfluenceRows }, { data: blockadeRows }] = await Promise.all([
      supabase.from("node_influence")
        .select("node_id, economic_influence, political_influence, military_pressure, resistance, integration_progress")
        .eq("session_id", sessionId).eq("player_name", factionName),
      supabase.from("node_trade_links")
        .select("node_id, link_status, trade_level, route_safety")
        .eq("session_id", sessionId).eq("player_name", factionName),
      supabase.from("node_influence")
        .select("node_id, player_name, economic_influence, political_influence, military_pressure")
        .eq("session_id", sessionId).neq("player_name", factionName),
      supabase.from("node_blockades")
        .select("node_id, blocked_by_player, blocked_until_turn, reason")
        .eq("session_id", sessionId).gte("blocked_until_turn", turn),
    ]);
    const influenceByNode = new Map<string, any>();
    for (const r of (nodeInfluenceRows || [])) influenceByNode.set(r.node_id, r);
    const linkByNode = new Map<string, any>();
    for (const l of (nodeTradeLinks || [])) linkByNode.set(l.node_id, l);
    // Aggregate rival pressure per node (anonymized; AI sees only counts + max)
    const rivalsByNode = new Map<string, { count: number; topPressure: number; topPlayer: string | null; players: string[] }>();
    for (const r of (rivalInfluenceRows || [])) {
      const p = (Number(r.economic_influence) || 0) * 0.45
              + (Number(r.political_influence) || 0) * 0.35
              + (Number(r.military_pressure) || 0) * 0.20;
      if (p <= 0) continue;
      const cur = rivalsByNode.get(r.node_id) || { count: 0, topPressure: 0, topPlayer: null as string | null, players: [] as string[] };
      cur.count += 1;
      if (p > cur.topPressure) { cur.topPressure = p; cur.topPlayer = String(r.player_name); }
      cur.players.push(String(r.player_name));
      rivalsByNode.set(r.node_id, cur);
    }
    const blockadeByNode = new Map<string, any>();
    for (const b of (blockadeRows || [])) blockadeByNode.set(b.node_id, b);

    // Fetch recent diplomacy messages for all rooms involving this faction
    const roomIds = (diplomacyRooms || []).map((r: any) => r.id);
    let recentMessages: any[] = [];
    if (roomIds.length > 0) {
      const { data: msgs } = await supabase.from("diplomacy_messages")
        .select("sender, message_text, room_id, created_at")
        .in("room_id", roomIds)
        .order("created_at", { ascending: false }).limit(15);
      recentMessages = msgs || [];
    }

    // Check if AI already sent an ultimatum recently (for war prerequisite)
    const sentUltimatums = recentMessages.filter((m: any) =>
      m.sender === factionName && m.message_text?.includes("[ULTIMÁTUM]")
    );

    // ── Build context for AI ──
    const resources = {
      gold: realmRes?.gold_reserve || 0,
      grain: realmRes?.grain_reserve || 0,
      production: realmRes?.production_reserve || 0,
      manpower: realmRes?.manpower_pool || 0,
      manpowerCommitted: realmRes?.manpower_committed || 0,
      faith: realmRes?.faith || 0,
    };

    const activeWars = (warDeclarations || []).filter((w: any) => w.status === "active");
    const peaceOffers = (warDeclarations || []).filter((w: any) => w.status === "peace_offered");

    // ── MILITARY METRICS ──
    const milMetrics = computeMilitaryMetrics(
      resources,
      realmRes?.mobilization_rate || 0.1,
      activeWars,
      tensionData || [],
      factionName,
      stacks || [],
      cities || [],
      allCities || [],
      enemyStacks || [],
    );

    // Affordable buildings: merged production cost = cost_wood + cost_stone + cost_iron; wealth = cost_wealth
    const affordableBuildings = (buildingTemplates || []).filter((t: any) => {
      const prodCost = (t.cost_wood || 0) + (t.cost_stone || 0) + (t.cost_iron || 0);
      return prodCost <= resources.production && (t.cost_wealth || 0) <= resources.gold;
    }).map((t: any) => t.name).slice(0, 8);

    const personality = faction.personality || "diplomatic";
    const goals = faction.goals || [];

    // ── Load unified AI context (premise, lore, constraints) ──
    const aiCtx = await createAIContext(sessionId, turn, supabase, factionName);

    // ── Basket snapshot for this faction (player scope) ──
    const basketSnapshot = await buildBasketSnapshot(supabase, { sessionId, playerName: factionName });

    const systemPrompt = `Jsi AI řídící frakci "${factionName}" v civilizační strategické hře.

OSOBNOST: ${personality}
MÝTUS: ${civ?.core_myth || "neznámý"}
KULTURNÍ ZVLÁŠTNOST: ${civ?.cultural_quirk || "žádná"}
CÍLE: ${JSON.stringify(goals)}
POSTOJ K OSTATNÍM: ${JSON.stringify(faction.disposition)}

${basketSnapshot ? basketSnapshot + "\n" : ""}
PRAVIDLA ROZHODOVÁNÍ:
1. EKONOMIE: Rozhoduj na základě aktuálních zdrojů. Nestavěj/neverbuj bez zdrojů.
2. DIPLOMACIE: Vyhrožuj, nabízej smír, komunikuj — vše skrze diplomatické zprávy.
3. VÁLKA: PŘED vyhlášením války MUSÍŠ nejdřív poslat ultimátum (send_ultimatum). Válku můžeš vyhlásit až v DALŠÍM kole po ultimátu.
4. MÍR: Pokud válka trvá a jsi v nevýhodě, nabídni mír. Pokud jsi silný, požaduj podmínky.
5. ARMÁDA — DOKTRÍNA (PROAKTIVNÍ + REAKTIVNÍ):
   • PROAKTIVNĚ: Udržuj stálou armádu úměrnou velikosti říše i v míru. Cílový počet vojáků = 5–12 % populace podle osobnosti (aggressive 10–12 %, defensive 7–9 %, balanced 5–7 %, pacifist 3–5 %).
   • REAKTIVNĚ: Při ⚠ NAPĚTÍ zdvojnásob recruit_army. Při 🔴 VÁLCE recruit_army v KAŽDÉM kole, dokud máš zdroje.
   • Pokud totalArmyPower < 50 % nepřátelské viditelné síly → KRITICKÉ: 2× recruit_army.
   • PRVNÍ tahy hry (turn ≤ 5): vždy aspoň 1× recruit_army (militia, manpower 80–200), abys měl základní armádu.
   • Levné minimum: militia preset za ~32 zlata + ~20 produkce + ~80 mužů — vždy si můžeš dovolit.
   • DODRŽUJ doporučenou mobilizační sazbu (suggestedMobilizationRate).
6. STAVBY: Stavěj budovy které odpovídají tvé situaci (obrana při válce, ekonomika v míru).
7. Max 8 akcí za kolo (více v době války).
8. Odpovídej ČESKY. Diplomatické zprávy piš v dobovém středověkém tónu odpovídajícím tvé osobnosti.
9. Nesmíš měnit číselné hodnoty — pouze rozhoduj o akcích.

═══ VYNUCENÁ DOKTRÍNA ROZVOJE (BEHAVIORAL PRESSURE — vyhodnocuje se před akcemi) ═══
Než pošleš seznam akcí, projdi tato povinná pravidla. Pokud platí, MUSÍŠ zahrnout danou akci v top 3 svých akcí (jinak frakce stagnuje a prohraje hru):

[REC-1] Pokud (počet vlastních stacků < 2) NEBO (totalArmyPower < 100) NEBO (warState != peace) → MUSÍŠ zařadit recruit_army (preset militia, manpower 80–150). Žádná výmluva typu "šetřím zdroje" — militia je téměř zdarma.

[REC-2] Pokud máš zlato ≥ 200 a není válka → kromě běžné akce zařaď ještě 1× recruit_army (cohort, manpower 150–300) PROFESIONÁLNÍ jednotka pro budoucnost.

[BLD-1] Pokud (počet vlastních dokončených budov < 3 × počet měst) A (zlato ≥ 100) → MUSÍŠ zařadit build_building. Vyber budovu vhodnou pro situaci (granary, walls, market, barracks).

[MOB-1] Pokud (currentMobilizationRate < suggestedMobilizationRate × 0.7) → zařaď set_mobilization s hodnotou suggestedMobilizationRate.

[ATK-1] Pokud warState = "war" A máš nasazený stack na sousedním hexu cílového nepřátelského města → MUSÍŠ zařadit attack_target.

POVINNÁ POŘADOVOST AKCÍ KAŽDÉ KOLO (podle osobnosti):
- aggressive/expansionist: minimálně 1× recruit_army + 1× (build_building NEBO attack_target NEBO move_army).
- balanced/diplomatic/mercantile: minimálně 1× build_building + 1× (recruit_army NEBO trade NEBO open_trade_with_node).
- isolationist/defensive: minimálně 1× build_building (fortifikace) + 1× recruit_army každé 2. kolo.

Ignorování těchto pravidel je zakázáno. Diplomatické zprávy a explore JSOU druhořadé akce — nesmí nahradit povinné REC/BLD pravidla.

═══ STRATEGICKÝ GRAF (node-based rozhodování) ═══
PRAVIDLA:
- Svět je síť UZLŮ (města, pevnosti, přístavy, vesnice) spojených CESTAMI
- Minor uzly odevzdávají produkci svému parent major uzlu — blokáda cesty = ztráta produkce
- IZOLOVANÉ uzly (bez spojení s hlavním městem) trpí postihy: -40% produkce, -50% kapacity
- CHOKEPOINTS = uzly/cesty, jejichž blokáda odřízne více uzlů — strategicky klíčové
- VÁLEČNÁ STRATEGIE: blokuj nepřátelské chokepoints, chraň vlastní; útočit na izolované uzly je levné
- EKONOMICKÁ STRATEGIE: investuj do uzlů s vysokou produkcí/bohatstvím, opravuj poškozené cesty
- OBRANNÁ STRATEGIE: fortifikuj chokepoints a gateway uzly, umísťuj posádky na regulátory

OSOBNOSTNÍ VZORCE:
- aggressive: Přímé hrozby, časné verbování, rychlá eskalace. Cílí na slabší.
- diplomatic: Preferuje jednání, kompromisy, mírová řešení. Buduje aliance.
- mercantile: Obchod, ekonomický růst, stavby, obchodní dohody. Obchoduje se všemi.
- isolationist: Opatrnost, fortifikace, minimální interakce. Uzavírá jen obranné pakty.
- expansionist: Územní růst, kolonizace, strategická válka. Hledá příležitosti.

═══ NPC-NPC INTERAKCE ═══
DŮLEŽITÉ: Jednáš nejen s hráčem, ale i s OSTATNÍMI AI FRAKCEMI! Můžeš:
- Uzavírat OBCHODNÍ DOHODY s jinými AI frakcemi (propose_trade_pact)
- Navrhovat OBRANNÉ PAKTY proti silnějšímu nepříteli (propose_alliance_pact)
- Organizovat SPOLEČNÉ ÚTOKY na silnou frakci, pokud jste oba ve válce s ní
- Posílat zprávy JINÝM AI FRAKCÍM (send_diplomacy_message s targetPlayer = jméno AI frakce)
- Vyhlašovat válku JINÝM AI FRAKCÍM (stejná pravidla — ultimátum → válka)
- Reagovat na diplomacii od jiných AI frakcí

STRATEGIE NPC-NPC:
- Pokud je někdo příliš silný (vliv > 2× tvůj), hledej spojence mezi slabšími
- Pokud sdílíte nepřítele, navrhni společný útok
- Obchoduj s frakcemi s nízkou tenzí — zlepšuje vztahy i ekonomiku
- Při vysoké tenzi s AI frakcí: eskaluj diplomacii, ultimáta, válku
- Neopakuj zbytečně stejné zprávy — komunikuj jen když je důvod

VOJENSKÁ PRAVIDLA:
- Za VÁLKY musíš VŽDY nasadit armády a útočit na nepřátelská města.
- Priorita cílů: 1. Nepřátelská města (cíl je dobytí), 2. Nepřátelské stacky na cestě.
- Nasaď nerozmístěné stacky u vlastních měst blízkých nepříteli.
- Posuň rozmístěné stacky směrem k cílovým městům (1 hex/kolo).
- Zaútoč na cíl, když je tvůj stack na sousedním hexu.
- V MÍRU: drž garnizon, minimální mobilizace. Za NAPĚTÍ: zvyš mobilizaci, připrav se.
- BRAŇ vlastní města — pokud nepřátelský stack je blízko, posuň obranu tam.
- set_mobilization: nastavuje globální mobilizační sazbu dle situace.`;

    // Build NPC-NPC context
    const otherFactions = (allFactions || []).filter((f: any) => f.faction_name !== factionName);
    const otherFactionsContext = otherFactions.map((f: any) => {
      const fCities = (allCities || []).filter((c: any) => c.owner_player === f.faction_name);
      const fInf = (influenceData || []).find((i: any) => i.player_name === f.faction_name);
      const fTension = (allTensionData || []).find((t: any) =>
        (t.player_a === factionName && t.player_b === f.faction_name) ||
        (t.player_a === f.faction_name && t.player_b === factionName)
      );
      const fTrade = (tradeRoutes || []).filter((tr: any) =>
        (tr.player_a === factionName && tr.player_b === f.faction_name) ||
        (tr.player_a === f.faction_name && tr.player_b === factionName)
      );
      const myDisposition = (faction.disposition || {})[f.faction_name] ?? 0;
      return `  ${f.faction_name} [${f.personality}]: Města: ${fCities.length}, Vliv: ${fInf?.total_influence || "?"}, Tenze s tebou: ${fTension?.total_tension?.toFixed(0) || 0}, Tvůj postoj: ${myDisposition}, Obch. trasy: ${fTrade.length}, Cíle: ${JSON.stringify(f.goals || [])}`;
    }).join("\n");

    // Inter-faction tensions (between OTHER factions)
    const interFactionTensions = (allTensionData || [])
      .filter((t: any) => t.player_a !== factionName && t.player_b !== factionName && t.total_tension > 20)
      .slice(0, 10)
      .map((t: any) => `  ${t.player_a} ⟷ ${t.player_b}: tenze ${t.total_tension?.toFixed(0)}${t.crisis_triggered ? " [KRIZE]" : ""}`)
      .join("\n");

    const userPrompt = `ROK: ${turn}

EKONOMIKA FRAKCE:
Produkce: ${realmRes?.total_production?.toFixed(1) || "?"}, Bohatství: ${realmRes?.total_wealth?.toFixed(1) || "?"}, Kapacita: ${realmRes?.total_capacity?.toFixed(1) || "?"}
Zlato (rezerva): ${resources.gold}, Obilí: ${resources.grain}, Produkční rezerva: ${realmRes?.production_reserve || 0}
Víra: ${realmRes?.faith || 0}
Lidská síla (pool): ${resources.manpower}, Nasazeno: ${resources.manpowerCommitted}

MĚSTA (${(cities || []).length}):
${JSON.stringify((cities || []).map((c: any) => ({ name: c.name, pop: c.population_total, stabilita: c.city_stability, úroveň: c.settlement_level, garnizona: c.military_garrison, hex: [c.province_q, c.province_r] })), null, 2)}

═══ VOJENSKÝ STAV ═══
Válečný stav: ${milMetrics.warState === "war" ? "🔴 VÁLKA" : milMetrics.warState === "tension" ? "🟡 NAPĚTÍ" : "🟢 MÍR"}
Připravenost: ${milMetrics.warReadiness}/100
Celková síla: ${milMetrics.totalArmyPower} (nasazeno: ${milMetrics.deployedArmyPower})
Viditelná síla nepřítele: ${milMetrics.enemyVisiblePower}
Údržba armády: ${milMetrics.armyMaintenanceCost.gold} zlata + ${milMetrics.armyMaintenanceCost.grain} obilí/kolo
Může si dovolit více vojáků: ${milMetrics.canAffordMoreTroops ? "ANO" : "NE"}

Aktuální mobilizační sazba: ${(milMetrics.currentMobilizationRate * 100).toFixed(0)}%
Doporučená mobilizační sazba: ${(milMetrics.suggestedMobilizationRate * 100).toFixed(0)}%
Maximální bezpečná sazba: ${(milMetrics.maxSafeMobilization * 100).toFixed(0)}%

Nerozmístěné armády (v garnizóně):
${milMetrics.undeployedStacks.length > 0 ? JSON.stringify(milMetrics.undeployedStacks) : "žádné"}

Rozmístěné armády na mapě:
${milMetrics.deployedStacks.length > 0 ? JSON.stringify(milMetrics.deployedStacks) : "žádné"}

Zranitelná vlastní města (nízká stabilita/garnizona):
${milMetrics.vulnerableCities.length > 0 ? JSON.stringify(milMetrics.vulnerableCities) : "žádná"}

Cíle k útoku (nepřátelská města, seřazeno dle vzdálenosti):
${milMetrics.suggestedTargets.length > 0 ? JSON.stringify(milMetrics.suggestedTargets) : "žádné (nejsme ve válce)"}

Viditelné nepřátelské stacky:
${(enemyStacks || []).length > 0 ? JSON.stringify((enemyStacks || []).map((s: any) => ({ name: s.name, síla: s.power, hráč: s.player_name, hex: [s.hex_q, s.hex_r] }))) : "žádné"}

DOSTUPNÉ STAVBY: ${affordableBuildings.join(", ") || "žádné (nedostatek zdrojů)"}

═══ OSTATNÍ FRAKCE (NPC i hráči) ═══
${otherFactionsContext || "žádné další frakce"}

═══ TENZE MEZI OSTATNÍMI (příležitosti pro diplomacii) ═══
${interFactionTensions || "žádné významné tenze mezi ostatními"}

═══ AKTIVNÍ OBCHODNÍ TRASY ═══
${(tradeRoutes || []).filter((tr: any) => tr.player_a === factionName || tr.player_b === factionName).map((tr: any) => `  ${tr.player_a} ⟷ ${tr.player_b}: ${tr.resource_type} (${tr.amount}), bezpečnost: ${tr.route_safety}`).join("\n") || "žádné"}

VLIV CIVILIZACÍ:
${JSON.stringify(influenceData || [], null, 2)}

NAPĚTÍ S OSTATNÍMI:
${JSON.stringify(tensionData || [], null, 2)}

AKTIVNÍ VÁLKY: ${activeWars.length > 0 ? JSON.stringify(activeWars.map((w: any) => ({ s: w.declaring_player, cíl: w.target_player, od_kola: w.declared_turn }))) : "žádné"}
NABÍDKY MÍRU: ${peaceOffers.length > 0 ? JSON.stringify(peaceOffers.map((w: any) => ({ nabídl: w.peace_offered_by, podmínky: w.peace_conditions }))) : "žádné"}

ODESLANÁ ULTIMÁTA: ${sentUltimatums.length > 0 ? "ANO (můžeš vyhlásit válku)" : "NE (musíš nejdřív poslat ultimátum)"}

POSLEDNÍ DIPLOMATICKÉ ZPRÁVY:
${recentMessages.slice(0, 10).map((m: any) => `[${m.sender}]: ${m.message_text}`).join("\n") || "žádné"}

NEDÁVNÉ UDÁLOSTI:
${JSON.stringify((recentEvents || []).slice(0, 10), null, 2)}

STAV SVĚTA: ${worldSummary?.summary_text || "Žádný souhrn"}

═══ DIPLOMATICKÉ VZTAHY (vícerozměrné) ═══
${(diplomRelations || []).map((r: any) => {
  const other = r.faction_a === factionName ? r.faction_b : r.faction_a;
  return `  ${other}: důvěra=${r.trust}, strach=${r.fear}, křivda=${r.grievance}, závislost=${r.dependency}, spolupráce=${r.cooperation_score}, zrada=${r.betrayal_score}, celkově=${r.overall_disposition}`;
}).join("\n") || "žádné vztahy"}

═══ DIPLOMATICKÁ PAMĚŤ (co si pamatuješ) ═══
${(diplomMemories || []).slice(0, 15).map((m: any) => {
  const other = m.faction_a === factionName ? m.faction_b : m.faction_a;
  return `  [Rok ${m.turn_number}] ${m.memory_type} s ${other}: ${m.detail?.substring(0, 100)}`;
}).join("\n") || "žádné vzpomínky"}

═══ TVOJE AKTIVNÍ STRATEGICKÉ ZÁMĚRY ═══
${(activeIntents || []).map((i: any) => `  ${i.intent_type}${i.target_faction ? ` → ${i.target_faction}` : ""} (priorita ${i.priority}): ${i.reasoning || ""}`).join("\n") || "žádné záměry (navrhni nové!)"}

═══ TVOJE MINULÉ AKCE (paměť) ═══
${(myPastActions || []).map((a: any) => `  [Rok ${a.turn_number}] ${a.action_type}: ${a.description}`).join("\n") || "žádné záznamy"}

═══ STRATEGICKÝ GRAF — TVOJE UZLY ═══
${(() => {
  const myNodes = (strategicNodes || []).filter((n: any) => n.controlled_by === factionName);
  const supMap = new Map<string, any>();
  for (const s of (supplyStates || [])) { if (!supMap.has(s.node_id)) supMap.set(s.node_id, s); }
  
  const nodeLines = myNodes.slice(0, 15).map((n: any) => {
    const sup = supMap.get(n.id);
    const isolated = sup?.connected_to_capital === false;
    return `  ${n.name} [${n.node_type}] hex(${n.hex_q},${n.hex_r}) ⚔${n.strategic_value} 💰${n.economic_value} 🛡${n.defense_value} prod=${n.production_output?.toFixed(1)} wealth=${n.wealth_output?.toFixed(1)} fort=${n.fortification_level} infra=${n.infrastructure_level} trade_flow=${n.cumulative_trade_flow || 0}${isolated ? " ⚠IZOLOVÁN" : ""} supply=${sup?.supply_level ?? "?"}`;
  });
  return nodeLines.join("\n") || "žádné uzly";
})()}

═══ STRATEGICKÝ GRAF — NEPŘÁTELSKÉ UZLY (blízké) ═══
${(() => {
  const myNodeHexes = (strategicNodes || []).filter((n: any) => n.controlled_by === factionName);
  const enemyNodes = (strategicNodes || []).filter((n: any) => n.controlled_by && n.controlled_by !== factionName && n.is_major);
  // Filter to those within reasonable distance (hex distance <= 8 from any of my nodes)
  const nearEnemyNodes = enemyNodes.filter((en: any) => 
    myNodeHexes.some((mn: any) => hexDistance(mn.hex_q, mn.hex_r, en.hex_q, en.hex_r) <= 8)
  ).slice(0, 10);
  return nearEnemyNodes.map((n: any) => 
    `  ${n.name} [${n.node_type}] vlastník=${n.controlled_by} hex(${n.hex_q},${n.hex_r}) ⚔${n.strategic_value} 💰${n.economic_value} fort=${n.fortification_level}`
  ).join("\n") || "žádné blízké nepřátelské uzly";
})()}

═══ STRATEGICKÝ GRAF — KLÍČOVÉ TRASY ═══
${(() => {
  const nodeNameMap = new Map<string, string>();
  for (const n of (strategicNodes || [])) nodeNameMap.set(n.id, n.name);
  
  // Routes connected to my nodes
  const myNodeIds = new Set((strategicNodes || []).filter((n: any) => n.controlled_by === factionName).map((n: any) => n.id));
  const myRoutes = (strategicRoutes || []).filter((r: any) => myNodeIds.has(r.node_a) || myNodeIds.has(r.node_b));
  
  return myRoutes.slice(0, 15).map((r: any) => {
    const blocked = r.control_state === "blocked" || r.control_state === "embargoed";
    const damaged = r.control_state === "damaged";
    const bottleneck = r.hex_bottleneck_q != null ? ` bottleneck(${r.hex_bottleneck_q},${r.hex_bottleneck_r})` : "";
    return `  ${nodeNameMap.get(r.node_a) || "?"} ↔ ${nodeNameMap.get(r.node_b) || "?"} [${r.route_type}] cap=${r.capacity_value} cost=${r.hex_path_cost || "?"}${bottleneck}${blocked ? " 🚫BLOKOVÁNO" : ""}${damaged ? " ⚠POŠKOZENO" : ""}`;
  }).join("\n") || "žádné trasy";
})()}

═══ STRATEGICKÁ DOPORUČENÍ ═══
${(() => {
  const supMap = new Map<string, any>();
  for (const s of (supplyStates || [])) { if (!supMap.has(s.node_id)) supMap.set(s.node_id, s); }
  
  const recommendations: string[] = [];
  
  // 1. Uncontrolled high-value nodes nearby (expansion targets)
  const uncontr = (strategicNodes || []).filter((n: any) => !n.controlled_by && n.is_major && (n.economic_value >= 5 || n.strategic_value >= 5));
  const myNodeHexes = (strategicNodes || []).filter((n: any) => n.controlled_by === factionName);
  const nearUncontr = uncontr.filter((un: any) => myNodeHexes.some((mn: any) => hexDistance(mn.hex_q, mn.hex_r, un.hex_q, un.hex_r) <= 6)).slice(0, 3);
  if (nearUncontr.length > 0) {
    recommendations.push(`🏗 ZAKLÁDÁNÍ: Blízké volné uzly s vysokou hodnotou: ${nearUncontr.map((n: any) => `${n.name}(⚔${n.strategic_value},💰${n.economic_value}) hex(${n.hex_q},${n.hex_r})`).join(", ")}`);
  }
  
  // 2. Isolated own nodes (need reconnection or fortification)
  const isolated = (strategicNodes || []).filter((n: any) => n.controlled_by === factionName && supMap.get(n.id)?.connected_to_capital === false);
  if (isolated.length > 0) {
    recommendations.push(`⚠ IZOLACE: ${isolated.length} tvých uzlů je izolováno! Oprav cesty nebo fortifikuj: ${isolated.slice(0, 3).map((n: any) => n.name).join(", ")}`);
  }
  
  // 3. Enemy chokepoints (war targets)
  const enemyChokes = (strategicNodes || []).filter((n: any) => 
    n.controlled_by && n.controlled_by !== factionName && 
    (n.node_type === "fortress" || n.node_type === "pass") && 
    n.strategic_value >= 6
  );
  if (enemyChokes.length > 0 && milMetrics.warState !== "peace") {
    recommendations.push(`🎯 CHOKEPOINTS: Nepřátelské strategické body k útoku: ${enemyChokes.slice(0, 3).map((n: any) => `${n.name}(${n.controlled_by}) ⚔${n.strategic_value}`).join(", ")}`);
  }
  
  // 4. Damaged/blocked routes to repair
  const damagedRoutes = (strategicRoutes || []).filter((r: any) => 
    (r.control_state === "damaged" || r.control_state === "blocked") && 
    (strategicNodes || []).some((n: any) => n.controlled_by === factionName && (n.id === r.node_a || n.id === r.node_b))
  );
  if (damagedRoutes.length > 0) {
    recommendations.push(`🔧 OPRAVY: ${damagedRoutes.length} poškozených/blokovaných tras — oprav pro obnovení toku`);
  }
  
  // 5. High-traffic nodes without fortification (vulnerable corridors)
  const unfortifiedTraffic = (strategicNodes || []).filter((n: any) => 
    n.controlled_by === factionName && (n.cumulative_trade_flow || 0) > 20 && n.fortification_level < 1
  );
  if (unfortifiedTraffic.length > 0) {
    recommendations.push(`🏰 FORTIFIKACE: Vytížené uzly bez opevnění: ${unfortifiedTraffic.slice(0, 3).map((n: any) => `${n.name}(flow=${n.cumulative_trade_flow})`).join(", ")}`);
  }
  
  return recommendations.join("\n") || "Žádná zvláštní doporučení";
})()}

═══ NEUTRÁLNÍ UZLY (objevené, vliv & anexe) ═══
${(() => {
  const known = (strategicNodes || []).filter((n: any) => n.is_neutral && n.discovered);
  if (known.length === 0) return "žádné objevené neutrální uzly (zkus EXPLORE)";
  return known.slice(0, 12).map((n: any) => {
    const inf = influenceByNode.get(n.id) || { economic_influence: 0, political_influence: 0, military_pressure: 0, resistance: 0, integration_progress: 0 };
    const link = linkByNode.get(n.id);
    // Patch 12: real annex formula matches _shared/nodeInfluence
    const myPressure = inf.economic_influence * 0.45 + inf.political_influence * 0.35 + inf.military_pressure * 0.20;
    const threshold = inf.resistance + (n.autonomy_score ?? 80) * 0.5;
    const rivals = rivalsByNode.get(n.id);
    const blockade = blockadeByNode.get(n.id);
    const contested = !!(rivals && myPressure > 0 && rivals.topPressure >= myPressure * 0.6);
    const blocked = !!(blockade && blockade.blocked_by_player !== factionName);
    const blockedByMe = !!(blockade && blockade.blocked_by_player === factionName);
    let status: string;
    if (blocked) status = ` 🚫BLOCKED_BY_${blockade.blocked_by_player}_until_t${blockade.blocked_until_turn}`;
    else if (contested) status = ` ⚠️CONTESTED_by_${rivals!.count}_rival(s)_top=${rivals!.topPressure.toFixed(0)}`;
    else if (myPressure >= threshold) status = " ✅ANNEX_READY";
    else status = ` (pressure ${myPressure.toFixed(0)}/${threshold.toFixed(0)})`;
    const rivalTag = rivals ? ` rivals=${rivals.count}(top=${rivals.topPressure.toFixed(0)})` : "";
    const blockTag = blockedByMe ? ` 🛡️MY_BLOCK_until_t${blockade.blocked_until_turn}` : "";
    return `  ${n.name} hex(${n.hex_q},${n.hex_r}) kult=${n.culture_key || "?"} prof=${n.profile_key || "?"} aut=${n.autonomy_score} | econ=${inf.economic_influence} pol=${inf.political_influence} mil=${inf.military_pressure} res=${inf.resistance}${link ? ` link=${link.link_status}` : ""}${rivalTag}${status}${blockTag}`;
  }).join("\n");
})()}

NEUTRÁLNÍ STRATEGIE:
- open_trade_with_node — otevírá obchod, zvyšuje economic_influence. Při více konkurentech klesá zisk → buď první!
- send_envoy_to_node — diplomatická mise, zvyšuje political_influence (kulturně vhodné kultury preferuj).
- apply_military_pressure — vojenský tlak, zvyšuje military_pressure ale i resistance.
- annex_node — anexe (jen když ✅ANNEX_READY a NE ⚠️CONTESTED a NE 🚫BLOCKED).
- block_node_annexation — diplomaticky zablokuje anexi soupeři na 1–10 tahů. Použij když rival je blízko ANNEX_READY na uzlu, který chceš sám získat, nebo proti nepřátelské frakci. Parametr: blockDurationTurns (default 3).
- KONTESTACE: Pokud má rival ≥ 60 % tvého tlaku, anexe je zamítnuta. Buď zlikviduj rivala (žádné společné akce, ekonomická eroze), nebo blokuj jeho anexi.
- Strategie podle profilu uzlu: trade hub → trade, kulturně podobný → envoy, slabě bráněný → pressure.

═══ ZAKLÁDÁNÍ OSAD ═══
Můžeš založit novou osadu na volném hexu ve vlastní provincii. Stojí: 150 produkce + 100 bohatství.
DŮLEŽITÉ: Zakládej osady na UZLECH s vysokým node_score! Preferuj: trade hub pozice, food basin, resource node, chokepoint.
Tvé provincie: ${(myProvinces || []).map((p: any) => `${p.name} [${p.hex_q},${p.hex_r}]`).join(", ") || "žádné"}
Volné hexy existují, pokud v provincii není přelidněno.

Rozhodni, co frakce udělá v tomto kole. ${milMetrics.warState === "war" ? "JSTE VE VÁLCE — PRIORITA: nasadit armády, útočit na města, bránit vlastní území!" : ""} Buď strategický a situační. Zvažuj akce vůči VŠEM hráčům i AI frakcím — obchod, pakty, společné útoky. Na základě svých vztahů, pamětí a cílů navrhni nebo uprav své strategické záměry (intenty).`;

    // ── Call AI via unified pipeline ──
    // Wave 1: model selection — Pro ONLY for active war or triggered crisis.
    // Tension/peace uses Flash (cheaper, sufficient for routine planning).
    const highStakes =
      milMetrics.warState === "war" ||
      ((allTensionData as any[]) || []).some((t: any) => t.crisis_triggered);
    const factionModel = highStakes ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash";

    const aiResult = await invokeAI(aiCtx, {
      model: factionModel,
      functionName: "ai-faction-turn",
      purpose: highStakes ? "war-decision" : "peace-decision",
      auto: true,
      systemPrompt,
      userPrompt,
      tools: [{
        type: "function",
        function: {
          name: "faction_turn",
          description: "Submit faction decisions for this turn.",
          parameters: {
            type: "object",
            properties: {
              actions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    actionType: {
                      type: "string",
                      enum: [
                        "build_building", "recruit_army", "deploy_army", "move_army",
                        "attack_target", "set_mobilization", "send_diplomacy_message",
                        "send_ultimatum", "declare_war", "offer_peace", "accept_peace",
                        "issue_declaration", "propose_trade_pact", "propose_alliance_pact",
                        "found_settlement", "trade", "explore",
                        "fortify_node", "repair_route", "blockade_route",
                        "open_trade_with_node", "send_envoy_to_node",
                        "apply_military_pressure", "annex_node", "block_node_annexation",
                      ],
                    },
                    description: { type: "string", description: "Stručný popis akce" },
                    targetPlayer: { type: "string" },
                    targetCity: { type: "string" },
                    buildingName: { type: "string" },
                    armyName: { type: "string" },
                    armyPreset: { type: "string", enum: ["militia", "cohort", "cavalry_wing", "legion"] },
                    stackId: { type: "string" },
                    stackName: { type: "string" },
                    targetStackName: { type: "string" },
                    targetHexQ: { type: "number" },
                    targetHexR: { type: "number" },
                    settlementName: { type: "string" },
                    targetNodeName: { type: "string", description: "Name of strategic or neutral node (for fortify_node, blockade_route, open_trade_with_node, send_envoy_to_node, apply_military_pressure, annex_node, block_node_annexation)" },
                    blockDurationTurns: { type: "number", description: "For block_node_annexation: 1-10 turns (default 3)" },
                    mobilizationRate: { type: "number" },
                    messageText: { type: "string" },
                    peaceConditions: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["white_peace", "tribute", "territory", "vassalage"] },
                        tributeAmount: { type: "number" },
                        territoryName: { type: "string" },
                      },
                    },
                    narrativeNote: { type: "string" },
                  },
                  required: ["actionType", "description"],
                  additionalProperties: false,
                },
              },
              dispositionChanges: {
                type: "object",
                description: "Změny postoje k hráčům: { jménoHráče: delta (-20 až +20) }",
              },
              diplomaticIntents: {
                type: "array",
                description: "Strategické diplomatické záměry frakce. Navrhni 1-3 záměry.",
                items: {
                  type: "object",
                  properties: {
                    intentType: {
                      type: "string",
                      enum: [
                        "seek_ally", "isolate_rival", "buy_time", "threaten_neighbor",
                        "seek_trade", "revenge_betrayal", "exploit_instability",
                        "anti_hegemon_coalition", "consolidate", "defend_territory",
                        "expand", "dominate",
                      ],
                    },
                    targetFaction: { type: "string", description: "Cílová frakce/hráč" },
                    priority: { type: "number", description: "1 (nízká) - 3 (vysoká)" },
                    reasoning: { type: "string", description: "Důvod záměru (krátce česky)" },
                  },
                  required: ["intentType", "priority", "reasoning"],
                  additionalProperties: false,
                },
              },
              internalThought: { type: "string", description: "Interní úvaha AI (pro debug/narativ)" },
            },
            required: ["actions", "internalThought"],
            additionalProperties: false,
          },
        },
      }],
      toolChoice: { type: "function", function: { name: "faction_turn" } },
    });

    // ── Wave 2 SHADOW telemetry — does NOT affect AI behavior. ──
    try {
      const briefing = buildFactionBriefing({
        factionName, faction, civ, turn,
        resources, realmRes, milMetrics,
        cities: cities || [], allCities: allCities || [],
        allFactions: allFactions || [],
        allTensionData: allTensionData || [],
        tradeRoutes: tradeRoutes || [],
        diplomRelations: diplomRelations || [],
        diplomMemories: diplomMemories || [],
        myPastActions: myPastActions || [],
        activeWars, peaceOffers,
        recentMessages, sentUltimatums,
        strategicNodes: strategicNodes || [],
        supplyStates: supplyStates || [],
        enemyStacks: enemyStacks || [],
      });
      const validActions = generateValidActions({
        factionName, resources, realmRes, milMetrics,
        cities: cities || [],
        affordableBuildings,
        strategicNodes: strategicNodes || [],
        strategicRoutes: strategicRoutes || [],
        supplyStates: supplyStates || [],
        influenceByNode, rivalsByNode,
        enemyStacks: enemyStacks || [],
        activeWars: activeWars || [],
        peaceOffers: peaceOffers || [],
        allTensionData: allTensionData || [],
        tradeRoutes: tradeRoutes || [],
        allFactions: allFactions || [],
        turn,
      });
      const briefingChars = JSON.stringify(briefing).length;
      const currentPromptChars = systemPrompt.length + userPrompt.length;
      const ratio = currentPromptChars > 0 ? briefingChars / currentPromptChars : 0;
      const sorted = [...validActions].sort((a, b) => b.score - a.score);
      const top5Arr = sorted.slice(0, 5);
      const top5 = top5Arr.map(a => `${a.type}:${a.score}`);
      const top5UniqueTypes = new Set(top5Arr.map(a => a.type)).size;
      const top5Scores = top5Arr.map(a => a.score);
      const top5Spread = top5Scores.length > 0 ? Math.max(...top5Scores) - Math.min(...top5Scores) : 0;
      const MIL = ["RECRUIT_ARMY","MOVE_ARMY","ATTACK_TARGET","ANNEX_NODE"];
      const DIP = ["OFFER_PEACE","SEND_DIPLOMACY_MESSAGE","PROPOSE_TRADE"];
      const hasHold = validActions.some(a => a.type === "HOLD_POSITION");
      const hasEcoOrDef = validActions.some(a => ["BUILD_BUILDING","FORTIFY_NODE","REPAIR_ROUTE","OPEN_TRADE_WITH_NODE"].includes(a.type));
      const hasMil = validActions.some(a => MIL.includes(a.type));
      const hasDip = validActions.some(a => DIP.includes(a.type));
      const hasMilOrDip = hasMil || hasDip;
      const hasRecruit = validActions.some(a => a.type === "RECRUIT_ARMY");
      const hasMoveOrAttack = validActions.some(a => a.type === "MOVE_ARMY" || a.type === "ATTACK_TARGET");
      let missingReason = "";
      if (!hasMilOrDip) {
        const reasons: string[] = [];
        if (!hasRecruit) reasons.push(`no_recruit(mp=${resources.manpower},gold=${resources.gold},prod=${resources.production})`);
        if (!hasMoveOrAttack) reasons.push(`no_move(deployed=${(milMetrics.deployedStacks||[]).length},targets=${(milMetrics.suggestedTargets||[]).length},enemy=${(enemyStacks||[]).length})`);
        if (!hasDip) reasons.push(`no_diplo(wars=${(activeWars||[]).length},offers=${(peaceOffers||[]).length})`);
        missingReason = reasons.join("|");
      }
      if (validActions.length === 0) {
        console.error(`[ai-shadow] ERROR fn=ai-faction-turn faction=${factionName} valid_actions_count=0 turn=${turn} state=${milMetrics.warState}`);
      } else {
        console.log(`[ai-shadow] fn=ai-faction-turn faction=${factionName} turn=${turn} state=${milMetrics.warState} current_chars=${currentPromptChars} briefing_chars=${briefingChars} ratio=${ratio.toFixed(3)} valid_actions=${validActions.length} top5=[${top5.join(",")}] top5_uniq=${top5UniqueTypes} top5_spread=${top5Spread} has_hold=${hasHold} has_eco_def=${hasEcoOrDef} has_mil_dip=${hasMilOrDip} has_recruit=${hasRecruit} has_move_attack=${hasMoveOrAttack} has_diplomacy=${hasDip}${missingReason ? ` missing=${missingReason}` : ""}`);
      }
    } catch (e) {
      console.error(`[ai-shadow] threw fn=ai-faction-turn faction=${factionName}: ${(e as Error).message}`);
    }

    if (!aiResult.ok) {
      if (aiResult.status === 429) return json({ error: "Rate limit" }, 429);
      if (aiResult.status === 402) return json({ error: "Credits exhausted" }, 402);
      throw new Error(aiResult.error || "AI error");
    }

    const result = aiResult.data;
    if (!result?.actions) throw new Error("No actions returned from AI");
    const executedActions: any[] = [];

    // ── Auto-accept incoming pacts from other AI factions ──
    await autoAcceptPendingPacts(supabase, sessionId, factionName, faction, allFactions || [], turn);

    // ── Auto-raise mobilization if at war but too low ──
    if (milMetrics.warState === "war" && (realmRes?.mobilization_rate || 0.1) < 0.3) {
      const warMobRate = Math.min(0.55, milMetrics.suggestedMobilizationRate);
      await supabase.from("realm_resources").update({ mobilization_rate: warMobRate })
        .eq("session_id", sessionId).eq("player_name", factionName);
      console.log(`[${factionName}] Auto-raised mobilization to ${warMobRate} due to war state`);
    }

    // ── Auto-raise mobilization for stack-less factions (turn ≥ 3) ──
    // Prevents permanent stagnation where AI never accumulates manpower to recruit.
    // Escalating: turn 3+ → 0.3, turn 6+ → 0.45, turn 10+ → 0.6
    const myActiveStackCount = (stacks || []).filter((s: any) => s.is_active).length;
    if (myActiveStackCount === 0 && turn >= 3) {
      const targetMob = turn >= 10 ? 0.6 : turn >= 6 ? 0.45 : 0.3;
      if ((realmRes?.mobilization_rate || 0.1) < targetMob) {
        await supabase.from("realm_resources").update({ mobilization_rate: targetMob })
          .eq("session_id", sessionId).eq("player_name", factionName);
        console.log(`[${factionName}] Auto-raised mobilization to ${targetMob} (no active stacks, turn ${turn})`);
      }
    }

    // ── EMERGENCY MANPOWER GRANT ──
    // If AI has 0 stacks for too long (turn ≥ 6) AND insufficient manpower to recruit even militia,
    // grant a one-time emergency pool. Prevents permanent disarmament from low population/economy.
    if (myActiveStackCount === 0 && turn >= 6) {
      const curMp = realmRes?.manpower_pool || 0;
      if (curMp < 50) {
        const grant = 60 - curMp;
        await supabase.from("realm_resources")
          .update({ manpower_pool: curMp + grant })
          .eq("session_id", sessionId).eq("player_name", factionName);
        if (realmRes) realmRes.manpower_pool = curMp + grant;
        console.log(`[${factionName}] EMERGENCY MANPOWER GRANT +${grant} (was ${curMp})`);
        await supabase.from("world_action_log").insert({
          session_id: sessionId, turn_number: turn, player_name: factionName,
          action_type: "system_emergency_manpower",
          description: `Krizová mobilizace: frakce dlouhodobě bez vojska, povolán nábor (+${grant} manpower).`,
          metadata: { grant, previous: curMp, _system: true },
        });
      }
    }

    // ── SPORTS ONBOARDING: ensure AI has all 3 association types, academies, teams, funding ──
    await ensureSportsOnboarding(supabase, sessionId, factionName, turn, cities || []);

    // ── Execute each action ──
    const FAILURE_RESULTS = new Set([
      "missing_params", "missing_target", "stack_not_found", "city_not_found", "template_not_found",
      "no_target", "no_target_in_range", "already_deployed", "already_moved", "not_deployed",
      "insufficient_resources", "ultimatum_required_first", "war_already_active", "no_active_war",
      "room_creation_failed",
    ]);
    for (const action of (result.actions || []).slice(0, 8)) {
      try {
        const executed = await executeAction(
          supabase, supabaseUrl, supabaseKey, sessionId, turn, factionName, action, faction,
          sentUltimatums.length > 0, stacks || [], cities || [], allCities || [], enemyStacks || [], realmRes,
        );
        const isFailure = typeof executed === "string"
          && (FAILURE_RESULTS.has(executed) || executed.endsWith("_failed") || executed.startsWith("recruit_failed"));
        executedActions.push({
          ...action,
          executed: !isFailure,
          result: executed,
          error: isFailure ? executed : undefined,
        });
      } catch (err) {
        console.error(`Action ${action.actionType} failed:`, err);
        executedActions.push({ ...action, executed: false, error: (err as Error).message });
      }
    }

    // ── DETERMINISTIC RECRUIT FALLBACK ──
    // If AI has 0 active stacks AND can afford militia AND didn't recruit this turn,
    // force one militia recruit. Breaks "AI never builds army" stagnation.
    try {
      const recruitedThisTurn = executedActions.some(
        (a) => a.actionType === "recruit_army" && a.executed && a.result === "ok",
      );
      if (myActiveStackCount === 0 && !recruitedThisTurn) {
        const { data: rrNow } = await supabase.from("realm_resources")
          .select("manpower_pool, gold_reserve, grain_reserve")
          .eq("session_id", sessionId).eq("player_name", factionName).maybeSingle();
        const mp = rrNow?.manpower_pool || 0;
        const gold = rrNow?.gold_reserve || 0;
        const grain = rrNow?.grain_reserve || 0;
        // emergency_militia floor: ~50 men → 50 mp, 20 gold, 13 prod
        if (mp >= 50 && gold >= 20 && grain >= 13) {
          console.log(`[${factionName}] FORCED RECRUIT emergency_militia (mp=${mp} gold=${gold} grain=${grain})`);
          const forcedAction = {
            actionType: "recruit_army",
            armyPreset: "emergency_militia",
            armyName: `${factionName} Krizová milice ${turn}`,
            description: "Deterministický fallback — frakce bez aktivních stacků",
            narrativeNote: `${factionName} v zoufalství mobilizuje krizovou milici, neboť žádná frakce nesmí zůstat bez ozbrojené síly.`,
          };
          try {
            const fres = await executeAction(
              supabase, supabaseUrl, supabaseKey, sessionId, turn, factionName, forcedAction, faction,
              sentUltimatums.length > 0, stacks || [], cities || [], allCities || [], enemyStacks || [], { ...realmRes, ...rrNow },
            );
            const failed = typeof fres === "string" && (fres.startsWith("recruit_failed") || fres.endsWith("_failed") || ["insufficient_resources","city_not_found","template_not_found"].includes(fres));
            executedActions.push({ ...forcedAction, executed: !failed, result: fres, _forced: true, error: failed ? fres : undefined });
          } catch (err) {
            console.error(`[${factionName}] Forced recruit failed:`, err);
            executedActions.push({ ...forcedAction, executed: false, error: (err as Error).message, _forced: true });
          }
        } else {
          console.log(`[${factionName}] Forced recruit skipped — insufficient (mp=${mp} gold=${gold} grain=${grain})`);
        }
      }
    } catch (e) {
      console.warn(`[${factionName}] Forced recruit check failed:`, e);
    }

    // ── Update disposition ──
    if (result.dispositionChanges && typeof result.dispositionChanges === "object") {
      const newDisposition = { ...faction.disposition };
      for (const [target, delta] of Object.entries(result.dispositionChanges)) {
        const d = Number(delta) || 0;
        const clamped = Math.max(-20, Math.min(20, d));
        newDisposition[target] = Math.max(-100, Math.min(100, ((newDisposition[target] as number) || 0) + clamped));
      }
      await supabase.from("ai_factions").update({ disposition: newDisposition }).eq("id", faction.id);
    }

    // ── Persist diplomatic intents ──
    if (Array.isArray(result.diplomaticIntents) && result.diplomaticIntents.length > 0) {
      // Mark old intents as superseded
      await supabase.from("faction_intents")
        .update({ status: "superseded" })
        .eq("session_id", sessionId).eq("faction_name", factionName).eq("status", "active");

      // Insert new intents
      const intentRows = result.diplomaticIntents.slice(0, 5).map((i: any) => ({
        session_id: sessionId,
        faction_name: factionName,
        intent_type: i.intentType || "consolidate",
        target_faction: i.targetFaction || null,
        priority: Math.max(1, Math.min(3, i.priority || 1)),
        reasoning: (i.reasoning || "").substring(0, 500),
        created_turn: turn,
        status: "active",
      }));
      await supabase.from("faction_intents").insert(intentRows);
    }

    // ── Derive doctrine from candidate actions for diagnostics ──
    const candidateActions = (result.actions || []).slice(0, 8);
    const recruits = candidateActions.filter((a: any) => a.actionType === "recruit_army").length;
    const builds = candidateActions.filter((a: any) => a.actionType === "build_building").length;
    const attacks = candidateActions.filter((a: any) => ["attack_target", "apply_military_pressure", "send_ultimatum", "declare_war"].includes(a.actionType)).length;
    const trades = candidateActions.filter((a: any) => ["trade", "open_trade_with_node", "propose_trade_pact"].includes(a.actionType)).length;
    let doctrine: "military" | "expansion" | "economy" | "diplomacy" = "diplomacy";
    if (recruits + attacks >= 2) doctrine = "military";
    else if (candidateActions.some((a: any) => a.actionType === "found_settlement" || a.actionType === "annex_node")) doctrine = "expansion";
    else if (builds + trades >= 2) doctrine = "economy";

    // ── Compute deltas vs previous turn (best-effort) ──
    let powerDelta = 0;
    let wealthDelta = 0;
    try {
      const { data: prevSummary } = await supabase.from("ai_faction_turn_summary")
        .select("power_delta, wealth_delta")
        .eq("session_id", sessionId).eq("faction_name", factionName)
        .lt("turn_number", turn).order("turn_number", { ascending: false }).limit(1).maybeSingle();
      // We don't store absolute power; instead approximate delta from milMetrics vs prev.
      // For now, store current totalArmyPower / totalWealth as the "delta" snapshot proxy.
      powerDelta = milMetrics.totalArmyPower || 0;
      wealthDelta = Math.round(realmRes?.total_wealth || 0);
      void prevSummary;
    } catch (_e) { /* noop */ }

    const failedActions = executedActions.filter((a) => !a.executed);
    const okActions = executedActions.filter((a) => a.executed);

    // ── Build rich metadata trace ──
    const otherSide = (m: any) => m.faction_a === factionName ? m.faction_b : m.faction_a;
    const traceMetadata = {
      doctrine,
      war_state: milMetrics.warState,
      inputs: {
        military: {
          manpower_pool: realmRes?.manpower_pool || 0,
          mobilization_rate: realmRes?.mobilization_rate || 0,
          my_stacks_count: (stacks || []).length,
          my_total_power: milMetrics.totalArmyPower,
          deployed_power: milMetrics.deployedArmyPower,
          enemy_visible_power: milMetrics.enemyVisiblePower,
          war_state: milMetrics.warState,
          war_readiness: milMetrics.warReadiness,
        },
        economic: {
          wealth: Math.round(realmRes?.total_wealth || 0),
          production: Math.round(realmRes?.total_production || 0),
          production_reserve: Math.round(realmRes?.production_reserve || 0),
          capacity: Math.round(realmRes?.total_capacity || 0),
          grain: resources.grain,
          gold: resources.gold,
          faith: realmRes?.faith || 0,
        },
        diplomatic: {
          active_pacts: (pendingPactEvents || []).length,
          hostile_relations: (diplomRelations || []).filter((r: any) => r.overall_disposition < -20).length,
          allied_relations: (diplomRelations || []).filter((r: any) => r.overall_disposition > 20).length,
          pending_ultimatums: sentUltimatums.length,
          active_intents: (activeIntents || []).length,
        },
        spatial: {
          my_cities: (cities || []).length,
          my_provinces: (myProvinces || []).length,
        },
      },
      weighted_memories: (diplomMemories || []).slice(0, 8).map((m: any) => ({
        type: m.memory_type,
        target: otherSide(m),
        importance: m.importance,
        decay: m.decay_rate,
        weight: Math.max(0, (m.importance || 0) * (1 - (m.decay_rate || 0) * Math.max(0, turn - (m.turn_number || turn)))),
        detail: (m.detail || "").substring(0, 140),
        turn: m.turn_number,
      })),
      candidate_actions: candidateActions.map((a: any) => ({
        type: a.actionType,
        target: a.targetCity || a.targetPlayer || a.targetNodeName || a.targetStackName || null,
        description: (a.description || "").substring(0, 120),
      })),
      executed_actions: executedActions.map((a) => ({
        type: a.actionType,
        ok: !!a.executed,
        error: a.error ? String(a.error).substring(0, 200) : null,
      })),
      counts: { recruits, builds, attacks, trades, planned: candidateActions.length, executed: okActions.length, failed: failedActions.length },
      model_used: factionModel,
      ms_elapsed: Date.now() - startedAt,
    };

    // ── Audit log (with rich metadata trace for AI Lab) ──
    await supabase.from("world_action_log").insert({
      session_id: sessionId,
      player_name: factionName,
      turn_number: turn,
      action_type: "ai_faction_turn",
      description: `AI frakce ${factionName}: ${okActions.length}/${executedActions.length} akcí [${milMetrics.warState}][${doctrine}]. ${result.internalThought || ""}`,
      metadata: traceMetadata,
    }).then(() => {}, (e: any) => { console.warn("world_action_log insert:", e?.message); });

    // ── Per-turn summary row for AI Lab Engine panel ──
    await supabase.from("ai_faction_turn_summary").upsert({
      session_id: sessionId,
      faction_name: factionName,
      turn_number: turn,
      doctrine,
      war_state: milMetrics.warState,
      actions_planned: candidateActions.length,
      actions_executed: okActions.length,
      actions_failed: failedActions.length,
      recruits_attempted: recruits,
      builds_attempted: builds,
      attacks_attempted: attacks,
      power_delta: powerDelta,
      wealth_delta: wealthDelta,
      internal_thought: (result.internalThought || "").substring(0, 2000),
      failure_reasons: failedActions.map((a: any) => `${a.actionType}: ${String(a.error || "unknown").substring(0, 160)}`).slice(0, 8),
    }, { onConflict: "session_id,faction_name,turn_number" }).then(() => {}, (e: any) => { console.warn("ai_faction_turn_summary upsert:", e?.message); });

    // Economy is now handled centrally by commit-turn (no duplicate processing)

    return json({
      faction: factionName,
      actionsCount: executedActions.filter((a) => a.executed).length,
      actions: executedActions,
      militaryMetrics: milMetrics,
      internalThought: result.internalThought,
      doctrine,
    });
  } catch (e) {
    console.error("ai-faction-turn error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

// ═══════════════════════════════════════════
// ACTION EXECUTOR
// ═══════════════════════════════════════════

async function executeAction(
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string,
  sessionId: string,
  turn: number,
  factionName: string,
  action: any,
  faction: any,
  hasUltimatum: boolean,
  myStacks: any[],
  myCities: any[],
  allCities: any[],
  enemyStacks: any[],
  realmRes: any,
): Promise<string> {
  const commandId = crypto.randomUUID();

  switch (action.actionType) {
    // ─── BUILD BUILDING ───
    case "build_building": {
      if (!action.buildingName || !action.targetCity) return "missing_params";
      const { data: tmpl } = await supabase.from("building_templates")
        .select("*").ilike("name", action.buildingName).limit(1).maybeSingle();
      if (!tmpl) return "template_not_found";
      const { data: city } = await supabase.from("cities")
        .select("id, name").eq("session_id", sessionId)
        .eq("owner_player", factionName).ilike("name", action.targetCity).limit(1).maybeSingle();
      if (!city) return "city_not_found";

      await invokeFunction(supabaseUrl, supabaseKey, "command-dispatch", {
        sessionId, turnNumber: turn,
        actor: { name: factionName, type: "ai_faction" },
        commandType: "BUILD_BUILDING",
        commandPayload: {
          cityId: city.id, cityName: city.name,
          buildingName: tmpl.name, templateId: tmpl.id,
          note: action.description,
          chronicleText: action.narrativeNote || `Frakce ${factionName} zahájila stavbu ${tmpl.name} v ${city.name}.`,
        },
        commandId,
      });
      return "ok";
    }

    // ─── RECRUIT ARMY ───
    case "recruit_army": {
      let preset = action.armyPreset || "militia";
      const name = action.armyName || `${factionName} ${preset} ${turn}`;

      // Aligned with command-dispatch FORMATION_PRESETS (incl. new emergency_militia).
      const presetManpower: Record<string, number> = {
        emergency_militia: 80, militia: 400, cohort: 400, professional: 400, cavalry_wing: 200, legion: 800,
      };
      const availableManpower = realmRes?.manpower_pool || 0;
      const goldReserve = realmRes?.gold_reserve || 0;
      const grainReserve = realmRes?.grain_reserve || 0;

      // Absolute floor for an emergency militia (~50 men): 50 mp, 20 gold, 13 prod.
      const MIN_RECRUIT_MANPOWER = 50;
      const MIN_RECRUIT_GOLD = 20;
      const MIN_RECRUIT_PROD = 13;

      if (availableManpower < MIN_RECRUIT_MANPOWER || goldReserve < MIN_RECRUIT_GOLD || grainReserve < MIN_RECRUIT_PROD) {
        console.log(`[${factionName}] Cannot recruit — pool=${availableManpower} gold=${goldReserve} grain=${grainReserve}`);
        return "insufficient_resources";
      }

      // If the requested preset cannot be afforded at full strength, drop down to
      // emergency_militia so the call always produces a real stack instead of failing.
      const target = presetManpower[preset] || 200;
      if (target > availableManpower) {
        const downgrade = ["militia", "cohort", "professional", "cavalry_wing", "legion"]
          .find((fb) => availableManpower >= (presetManpower[fb] || 9999));
        if (downgrade) {
          console.log(`[${factionName}] Downgraded ${preset} → ${downgrade} (pool ${availableManpower})`);
          preset = downgrade;
        } else {
          preset = "emergency_militia";
          console.log(`[${factionName}] Downgraded to emergency_militia (pool ${availableManpower})`);
        }
      }

      // Cap manpower to what is actually affordable across all 3 resources.
      // Costs (per soldier, MILITIA): gold 0.4, prod 0.25.
      const maxByGold = Math.floor(goldReserve / 0.4);
      const maxByProd = Math.floor(grainReserve / 0.25);
      const requestedManpower = Math.max(
        preset === "emergency_militia" ? 50 : 80,
        Math.min(presetManpower[preset] || 200, availableManpower, maxByGold, maxByProd),
      );

      const dispatchRes = await invokeFunction(supabaseUrl, supabaseKey, "command-dispatch", {
        sessionId, turnNumber: turn,
        actor: { name: factionName, type: "ai_faction" },
        commandType: "RECRUIT_STACK",
        commandPayload: {
          stackName: name, presetKey: preset, manpower: requestedManpower,
          note: action.description,
          chronicleText: action.narrativeNote || `${factionName} verbuje novou armádu: ${name}.`,
        },
        commandId,
      });
      if (dispatchRes && dispatchRes.error) {
        return `recruit_failed: ${dispatchRes.error}`;
      }

      // Auto-deploy: if the faction had no deployed stacks before this recruit, immediately
      // place the new stack at the capital so the AI is functional within the same turn.
      try {
        const hadDeployed = (myStacks || []).some((s: any) => s.is_active && s.is_deployed);
        if (!hadDeployed) {
          const newStackId: string | undefined = dispatchRes?.sideEffects?.stackId;
          const capital = (myCities || [])[0];
          if (newStackId && capital) {
            await supabase.from("military_stacks").update({
              hex_q: capital.province_q,
              hex_r: capital.province_r,
              is_deployed: true,
              moved_this_turn: false,
            }).eq("id", newStackId);
            console.log(`[${factionName}] Auto-deployed ${name} → ${capital.name}`);
          }
        }
      } catch (e) {
        console.warn(`[${factionName}] Auto-deploy after recruit failed:`, (e as Error).message);
      }

      return "ok";
    }

    // ─── DEPLOY ARMY (garrison → map hex at own city) ───
    case "deploy_army": {
      const stack = findStack(myStacks, action.stackId, action.stackName);
      if (!stack) return "stack_not_found";
      if (stack.is_deployed) return "already_deployed";

      // Find target city to deploy at
      const city = findCityByName(myCities, action.targetCity);
      if (!city) return "city_not_found";

      await supabase.from("military_stacks").update({
        hex_q: city.province_q,
        hex_r: city.province_r,
        is_deployed: true,
        moved_this_turn: false,
      }).eq("id", stack.id);

      await invokeFunction(supabaseUrl, supabaseKey, "command-dispatch", {
        sessionId, turnNumber: turn,
        actor: { name: factionName, type: "ai_faction" },
        commandType: "DEPLOY_STACK",
        commandPayload: {
          stackId: stack.id, stackName: stack.name,
          cityId: city.id, cityName: city.name,
          hexQ: city.province_q, hexR: city.province_r,
          chronicleText: action.narrativeNote || `Armáda ${stack.name} frakce ${factionName} byla rozmístěna u ${city.name}.`,
        },
        commandId,
      });
      return "ok";
    }

    // ─── MOVE ARMY (1 hex toward target city/hex) ───
    case "move_army": {
      const stack = findStack(myStacks, action.stackId, action.stackName);
      if (!stack) return "stack_not_found";
      if (!stack.is_deployed) return "not_deployed";
      if (stack.moved_this_turn) return "already_moved";

      // Determine target hex: find target city by name
      let targetQ: number, targetR: number;
      const targetCity = action.targetCity
        ? allCities.find((c: any) => c.name.toLowerCase() === action.targetCity.toLowerCase())
        : null;

      if (targetCity) {
        targetQ = targetCity.province_q;
        targetR = targetCity.province_r;
      } else {
        // Fallback: move toward nearest enemy city
        const enemyCities = allCities.filter((c: any) => c.owner_player !== factionName);
        if (enemyCities.length === 0) return "no_target";
        const nearest = enemyCities.reduce((best: any, c: any) => {
          const d = hexDistance(stack.hex_q, stack.hex_r, c.province_q, c.province_r);
          return d < (best.d || Infinity) ? { city: c, d } : best;
        }, { d: Infinity });
        targetQ = nearest.city.province_q;
        targetR = nearest.city.province_r;
      }

      // Already at target?
      if (stack.hex_q === targetQ && stack.hex_r === targetR) return "already_at_target";

      // Plan up to 2 hexes via shared engine (handles road bonus & passability)
      const plan = await planShortHopToward(
        supabase,
        sessionId,
        { q: stack.hex_q, r: stack.hex_r },
        { q: targetQ, r: targetR },
      );
      if (plan.path.length < 2) return "blocked_no_step";

      const moveResult = await applyStackMove(supabase, {
        sessionId,
        stackId: stack.id,
        plannedPath: plan.path,
        actorName: factionName,
      });
      if (!moveResult.ok) return `move_failed_${moveResult.code}`;

      // Mirror local cache so subsequent actions in this turn see new pos
      stack.hex_q = moveResult.finalHex.q;
      stack.hex_r = moveResult.finalHex.r;
      stack.moved_this_turn = true;

      return `moved_to_${moveResult.finalHex.q}_${moveResult.finalHex.r}${moveResult.usedRoadBonus ? "_road" : ""}`;
    }

    // ─── ATTACK TARGET (city or stack) ───
    case "attack_target": {
      const stack = findStack(myStacks, action.stackId, action.stackName);
      if (!stack) return "stack_not_found";
      if (!stack.is_deployed) return "not_deployed";

      const sq = stack.hex_q ?? 0;
      const sr = stack.hex_r ?? 0;
      const reachableHexes = new Set([
        `${sq},${sr}`,
        ...AXIAL_NEIGHBORS.map(n => `${sq + n.dq},${sr + n.dr}`),
      ]);

      // Try city target
      let defenderCityId: string | null = null;
      let defenderStackId: string | null = null;

      if (action.targetCity) {
        const targetCity = allCities.find((c: any) =>
          c.name.toLowerCase() === action.targetCity.toLowerCase() &&
          c.owner_player !== factionName &&
          reachableHexes.has(`${c.province_q},${c.province_r}`)
        );
        if (targetCity) defenderCityId = targetCity.id;
      }

      if (!defenderCityId && action.targetStackName) {
        const targetStack = enemyStacks.find((s: any) =>
          s.name.toLowerCase() === action.targetStackName.toLowerCase() &&
          reachableHexes.has(`${s.hex_q},${s.hex_r}`)
        );
        if (targetStack) defenderStackId = targetStack.id;
      }

      // Fallback: attack any reachable enemy
      if (!defenderCityId && !defenderStackId) {
        // Try enemy city in range
        const enemyCity = allCities.find((c: any) =>
          c.owner_player !== factionName && reachableHexes.has(`${c.province_q},${c.province_r}`)
        );
        if (enemyCity) defenderCityId = enemyCity.id;
        else {
          const enemyStack = enemyStacks.find((s: any) =>
            reachableHexes.has(`${s.hex_q},${s.hex_r}`)
          );
          if (enemyStack) defenderStackId = enemyStack.id;
        }
      }

      if (!defenderCityId && !defenderStackId) return "no_target_in_range";

      // Create battle in action_queue
      const seed = Date.now() + Math.floor(Math.random() * 100000);
      await supabase.from("action_queue").insert({
        session_id: sessionId,
        player_name: factionName,
        action_type: "battle",
        status: "pending",
        action_data: {
          attacker_stack_id: stack.id,
          defender_city_id: defenderCityId,
          defender_stack_id: defenderStackId,
          speech_text: action.narrativeNote || `Za slávu ${factionName}!`,
          speech_morale_modifier: 0,
          seed,
          biome: "plains",
        },
        completes_at: new Date().toISOString(),
        created_turn: turn,
        execute_on_turn: turn,
      });

      return `battle_queued_${defenderCityId ? "city" : "stack"}`;
    }

    // ─── SET MOBILIZATION RATE ───
    case "set_mobilization": {
      const rate = Math.max(0.05, Math.min(0.6, action.mobilizationRate || 0.2));
      await supabase.from("realm_resources")
        .update({ mobilization_rate: rate })
        .eq("session_id", sessionId)
        .eq("player_name", factionName);
      return `mobilization_set_to_${(rate * 100).toFixed(0)}%`;
    }

    // ─── SEND DIPLOMACY MESSAGE ───
    case "send_diplomacy_message": {
      if (!action.targetPlayer || !action.messageText) return "missing_params";
      return await sendDiplomacyMessage(supabase, sessionId, factionName, action.targetPlayer, action.messageText);
    }

    // ─── SEND ULTIMATUM (prerequisite for war) ───
    case "send_ultimatum": {
      if (!action.targetPlayer) return "missing_target";
      const text = `[ULTIMÁTUM] ${action.messageText || `Frakce ${factionName} žádá podřízení se jejím podmínkám. Neuposlechnutí bude znamenat válku.`}`;
      await sendDiplomacyMessage(supabase, sessionId, factionName, action.targetPlayer, text);
      await supabase.from("declarations").insert({
        session_id: sessionId, player_name: factionName,
        turn_number: turn, declaration_type: "ultimatum",
        original_text: text, tone: "Threatening",
        target_empire_ids: [action.targetPlayer], visibility: "PUBLIC",
        status: "published", ai_generated: true,
      }).then(() => {}, () => {});
      return "ok";
    }

    // ─── DECLARE WAR ───
    case "declare_war": {
      if (!action.targetPlayer) return "missing_target";
      if (!hasUltimatum) return "ultimatum_required_first";

      const { data: existing } = await supabase.from("war_declarations")
        .select("id").eq("session_id", sessionId).eq("status", "active")
        .or(`and(declaring_player.eq.${factionName},target_player.eq.${action.targetPlayer}),and(declaring_player.eq.${action.targetPlayer},target_player.eq.${factionName})`)
        .maybeSingle();
      if (existing) return "war_already_active";

      const manifest = action.messageText || `Frakce ${factionName} vyhlašuje válku!`;
      await supabase.from("war_declarations").insert({
        session_id: sessionId, declaring_player: factionName,
        target_player: action.targetPlayer, status: "active",
        manifest_text: manifest, declared_turn: turn,
        stability_penalty_applied: true,
      });

      const { data: attackerCities } = await supabase.from("cities")
        .select("id, city_stability").eq("session_id", sessionId).eq("owner_player", factionName);
      for (const c of (attackerCities || [])) {
        await supabase.from("cities").update({ city_stability: Math.max(0, (c.city_stability || 50) - 5) }).eq("id", c.id);
      }
      const { data: defenderCities } = await supabase.from("cities")
        .select("id, city_stability").eq("session_id", sessionId).eq("owner_player", action.targetPlayer);
      for (const c of (defenderCities || [])) {
        await supabase.from("cities").update({ city_stability: Math.max(0, (c.city_stability || 50) - 8) }).eq("id", c.id);
      }

      await supabase.from("game_events").insert({
        session_id: sessionId, event_type: "war", player: factionName,
        turn_number: turn, confirmed: true, note: manifest,
        importance: "critical", truth_state: "canon", actor_type: "ai_faction",
        reference: { targetPlayer: action.targetPlayer },
      }).then(() => {}, () => {});

      await supabase.from("declarations").insert({
        session_id: sessionId, player_name: factionName,
        turn_number: turn, declaration_type: "war_declaration",
        original_text: manifest, tone: "Threatening",
        target_empire_ids: [action.targetPlayer], visibility: "PUBLIC",
        status: "published", ai_generated: true,
      }).then(() => {}, () => {});

      return "ok";
    }

    // ─── OFFER PEACE ───
    case "offer_peace": {
      if (!action.targetPlayer) return "missing_target";
      const { data: war } = await supabase.from("war_declarations")
        .select("*").eq("session_id", sessionId).eq("status", "active")
        .or(`and(declaring_player.eq.${factionName},target_player.eq.${action.targetPlayer}),and(declaring_player.eq.${action.targetPlayer},target_player.eq.${factionName})`)
        .maybeSingle();
      if (!war) return "no_active_war";

      const conditions = action.peaceConditions || { type: "white_peace" };
      await supabase.from("war_declarations").update({
        status: "peace_offered",
        peace_offered_by: factionName,
        peace_offer_text: action.messageText || `${factionName} nabízí mír.`,
        peace_conditions: conditions,
      }).eq("id", war.id);

      const peaceMsg = action.messageText || `Nabízíme mír. Podmínky: ${conditions.type}.`;
      await sendDiplomacyMessage(supabase, sessionId, factionName, action.targetPlayer, `[MÍROVÁ NABÍDKA] ${peaceMsg}`);

      await supabase.from("declarations").insert({
        session_id: sessionId, player_name: factionName,
        turn_number: turn, declaration_type: "peace_offer",
        original_text: peaceMsg, tone: "Neutral",
        target_empire_ids: [action.targetPlayer], visibility: "PUBLIC",
        status: "published", ai_generated: true,
      }).then(() => {}, () => {});

      return "ok";
    }

    // ─── ACCEPT PEACE ───
    case "accept_peace": {
      if (!action.targetPlayer) return "missing_target";
      const { data: offer } = await supabase.from("war_declarations")
        .select("*").eq("session_id", sessionId).eq("status", "peace_offered")
        .eq("peace_offered_by", action.targetPlayer)
        .or(`and(declaring_player.eq.${factionName},target_player.eq.${action.targetPlayer}),and(declaring_player.eq.${action.targetPlayer},target_player.eq.${factionName})`)
        .maybeSingle();
      if (!offer) return "no_peace_offer";

      await supabase.from("war_declarations").update({
        status: "peace_accepted", ended_turn: turn,
      }).eq("id", offer.id);

      await sendDiplomacyMessage(supabase, sessionId, factionName, action.targetPlayer,
        `[MÍR PŘIJAT] ${factionName} přijímá mírovou nabídku.`);

      await supabase.from("game_events").insert({
        session_id: sessionId, event_type: "treaty", player: factionName,
        turn_number: turn, confirmed: true,
        note: `Mír uzavřen mezi ${factionName} a ${action.targetPlayer}.`,
        importance: "critical", truth_state: "canon", actor_type: "ai_faction",
        treaty_type: "peace", terms_summary: JSON.stringify(offer.peace_conditions),
      }).then(() => {}, () => {});

      return "ok";
    }

    // ─── ISSUE DECLARATION ───
    case "issue_declaration": {
      await supabase.from("declarations").insert({
        session_id: sessionId, player_name: factionName,
        turn_number: turn, declaration_type: "proclamation",
        original_text: action.messageText || action.description,
        tone: "Neutral", visibility: "PUBLIC",
        status: "published", ai_generated: true,
        target_empire_ids: action.targetPlayer ? [action.targetPlayer] : [],
      }).then(() => {}, () => {});
      return "ok";
    }

    // ─── PROPOSE TRADE PACT (NPC-NPC or NPC-Player) ───
    case "propose_trade_pact": {
      if (!action.targetPlayer) return "missing_target";
      const resourceType = action.description?.match(/(\w+)/)?.[1] || "grain";

      // Create trade route
      await supabase.from("trade_routes").insert({
        session_id: sessionId,
        player_a: factionName,
        player_b: action.targetPlayer,
        resource_type: resourceType,
        amount: 5,
        route_safety: 80,
        is_active: true,
      }).then(() => {}, () => {});

      // Diplomatic message
      await sendDiplomacyMessage(supabase, sessionId, factionName, action.targetPlayer,
        `[OBCHODNÍ DOHODA] ${action.messageText || `${factionName} navrhuje obchodní spojenectví. Nechť naše trhy vzkvétají společně.`}`);

      // Event
      await supabase.from("game_events").insert({
        session_id: sessionId, event_type: "treaty", player: factionName,
        turn_number: turn, confirmed: true,
        note: `${factionName} uzavřel obchodní dohodu s ${action.targetPlayer}.`,
        importance: "major", truth_state: "canon", actor_type: "ai_faction",
        treaty_type: "trade_pact",
        reference: { targetPlayer: action.targetPlayer, resourceType },
      }).then(() => {}, () => {});

      // Chronicle
      await supabase.from("chronicle_entries").insert({
        session_id: sessionId,
        text: action.narrativeNote || `V roce ${turn} uzavřely ${factionName} a ${action.targetPlayer} obchodní dohodu. Karavany začaly proudit mezi oběma říšemi.`,
        source_type: "ai_faction", turn_from: turn, turn_to: turn,
      }).then(() => {}, () => {});

      return "ok";
    }

    // ─── PROPOSE ALLIANCE PACT (defensive pact) ───
    case "propose_alliance_pact": {
      if (!action.targetPlayer) return "missing_target";

      // Diplomatic message
      await sendDiplomacyMessage(supabase, sessionId, factionName, action.targetPlayer,
        `[OBRANNÝ PAKT] ${action.messageText || `${factionName} navrhuje obranný pakt. Společně budeme silnější proti našim nepřátelům.`}`);

      // Event — alliance
      await supabase.from("game_events").insert({
        session_id: sessionId, event_type: "alliance", player: factionName,
        turn_number: turn, confirmed: true,
        note: `${factionName} uzavřel obranný pakt s ${action.targetPlayer}.`,
        importance: "critical", truth_state: "canon", actor_type: "ai_faction",
        reference: { targetPlayer: action.targetPlayer, pactType: "defensive" },
      }).then(() => {}, () => {});

      // Declaration
      await supabase.from("declarations").insert({
        session_id: sessionId, player_name: factionName,
        turn_number: turn, declaration_type: "alliance",
        original_text: `${factionName} a ${action.targetPlayer} uzavřely obranný pakt.`,
        tone: "Friendly", visibility: "PUBLIC",
        status: "published", ai_generated: true,
        target_empire_ids: [action.targetPlayer],
      }).then(() => {}, () => {});

      // Chronicle
      await supabase.from("chronicle_entries").insert({
        session_id: sessionId,
        text: action.narrativeNote || `V roce ${turn} spojily ${factionName} a ${action.targetPlayer} své síly v obranném paktu. „Útok na jednoho bude útokem na oba," zněla přísaha.`,
        source_type: "ai_faction", turn_from: turn, turn_to: turn,
      }).then(() => {}, () => {});

      return "ok";
    }

    // ─── FOUND SETTLEMENT ───
    case "found_settlement": {
      const name = action.settlementName || `${factionName} Osada ${turn}`;
      const hexQ = action.targetHexQ;
      const hexR = action.targetHexR;

      // Cost check (new economy: 150 production + 100 wealth)
      const goldReserve = realmRes?.gold_reserve || 0;
      const prodReserve = realmRes?.production_reserve || 0;
      if (prodReserve < 150 || goldReserve < 100) return "insufficient_resources";
      if (hexQ === undefined || hexR === undefined) return "missing_hex_coords";

      // Check hex is not occupied by another city
      const existingCity = allCities.find((c: any) => c.province_q === hexQ && c.province_r === hexR);
      if (existingCity) return "hex_occupied";

      // Deduct resources
      await supabase.from("realm_resources").update({
        gold_reserve: goldReserve - 100,
        production_reserve: prodReserve - 150,
      }).eq("session_id", sessionId).eq("player_name", factionName);

      // Province lookup not available in this scope — let command-dispatch resolve it
      const province: any = null;

      // Create settlement via command-dispatch
      await invokeFunction(supabaseUrl, supabaseKey, "command-dispatch", {
        sessionId, turnNumber: turn,
        actor: { name: factionName, type: "ai_faction" },
        commandType: "FOUND_CITY",
        commandPayload: {
          cityName: name,
          provinceQ: hexQ, provinceR: hexR,
          provinceId: province?.id || null,
          flavorPrompt: action.narrativeNote || `Osada založená frakcí ${factionName}.`,
          note: action.description,
          chronicleText: action.narrativeNote || `Frakce ${factionName} založila novou osadu ${name} na souřadnicích [${hexQ},${hexR}].`,
        },
        commandId,
      });

      // Chronicle entry
      await supabase.from("chronicle_entries").insert({
        session_id: sessionId,
        text: action.narrativeNote || `V roce ${turn} frakce ${factionName} založila nové sídlo ${name}. Osadníci se vydali na dlouhou cestu k novému domovu.`,
        source_type: "ai_faction", turn_from: turn, turn_to: turn,
      }).then(() => {}, () => {});

      return "ok";
    }

    // ─── TRADE / EXPLORE (legacy) ───
    // ─── FORTIFY NODE ───
    case "fortify_node": {
      if (!action.targetNodeName) return "missing_params";
      const { data: node } = await supabase.from("province_nodes")
        .select("id, name, fortification_level")
        .eq("session_id", sessionId).eq("controlled_by", factionName)
        .ilike("name", action.targetNodeName).limit(1).maybeSingle();
      if (!node) return "node_not_found";
      const newFort = Math.min(5, (node.fortification_level || 0) + 1);
      await supabase.from("province_nodes").update({ fortification_level: newFort }).eq("id", node.id);
      await supabase.from("game_events").insert({
        session_id: sessionId, event_type: "fortify_node",
        player: factionName, turn_number: turn, confirmed: true,
        note: `${factionName} fortifikuje ${node.name} (úroveň ${newFort})`,
        location: node.name, importance: 5, actor_type: "ai_faction",
      });
      return "ok";
    }

    // ─── REPAIR ROUTE ───
    case "repair_route": {
      // Find a damaged route connected to own nodes
      const { data: myNodes } = await supabase.from("province_nodes")
        .select("id").eq("session_id", sessionId).eq("controlled_by", factionName);
      const myIds = (myNodes || []).map((n: any) => n.id);
      if (myIds.length === 0) return "no_nodes";
      const { data: damagedRoute } = await supabase.from("province_routes")
        .select("id, node_a, node_b")
        .eq("session_id", sessionId).eq("control_state", "damaged")
        .or(myIds.map((id: string) => `node_a.eq.${id},node_b.eq.${id}`).join(","))
        .limit(1).maybeSingle();
      if (!damagedRoute) return "no_damaged_routes";
      await supabase.from("province_routes").update({ control_state: "open", path_dirty: true }).eq("id", damagedRoute.id);
      await supabase.from("game_events").insert({
        session_id: sessionId, event_type: "repair_route",
        player: factionName, turn_number: turn, confirmed: true,
        note: `${factionName} opravuje poškozenou trasu`, importance: 4, actor_type: "ai_faction",
      });
      return "ok";
    }

    // ─── BLOCKADE ROUTE ───
    case "blockade_route": {
      if (!action.targetNodeName) return "missing_params";
      // Find enemy node and blockade a route to it
      const { data: enemyNode } = await supabase.from("province_nodes")
        .select("id, name").eq("session_id", sessionId)
        .ilike("name", action.targetNodeName).limit(1).maybeSingle();
      if (!enemyNode) return "node_not_found";
      const { data: routeToBlock } = await supabase.from("province_routes")
        .select("id").eq("session_id", sessionId).eq("control_state", "open")
        .or(`node_a.eq.${enemyNode.id},node_b.eq.${enemyNode.id}`)
        .limit(1).maybeSingle();
      if (!routeToBlock) return "no_route_to_block";
      await supabase.from("province_routes").update({ control_state: "blocked", path_dirty: true }).eq("id", routeToBlock.id);
      await supabase.from("game_events").insert({
        session_id: sessionId, event_type: "blockade_route",
        player: factionName, turn_number: turn, confirmed: true,
        note: `${factionName} blokuje trasu k ${enemyNode.name}`,
        location: enemyNode.name, importance: 7, actor_type: "ai_faction",
      });
      return "ok";
    }

    // ─── PATCH 9c + 12: NEUTRAL NODE INFLUENCE, ANNEXATION & BLOCKADE ───
    case "open_trade_with_node":
    case "send_envoy_to_node":
    case "apply_military_pressure":
    case "annex_node":
    case "block_node_annexation": {
      if (!action.targetNodeName) return "missing_params";
      const { data: node } = await supabase.from("province_nodes")
        .select("id, name, hex_q, hex_r, is_neutral, discovered, controlled_by")
        .eq("session_id", sessionId)
        .ilike("name", action.targetNodeName).limit(1).maybeSingle();
      if (!node) return "node_not_found";
      if (!node.is_neutral || node.controlled_by) return "node_not_neutral";
      if (!node.discovered) return "node_not_discovered";

      let effectiveActionType = action.actionType;

      // ─── Inc 5: annex_node requires adjacent friendly stack.
      // Without one, downgrade to military_pressure (long-term claim project).
      if (effectiveActionType === "annex_node") {
        const { data: ownStacks } = await supabase
          .from("military_stacks")
          .select("hex_q, hex_r, soldiers, unit_count")
          .eq("session_id", sessionId)
          .eq("owner_player", factionName);
        const adjacent = (ownStacks || []).some((s: any) => {
          const dq = (s.hex_q ?? 0) - (node.hex_q ?? 0);
          const dr = (s.hex_r ?? 0) - (node.hex_r ?? 0);
          // Hex axial distance ≤ 1 (same hex or neighbour)
          const dist = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
          const strength = Number(s.soldiers ?? s.unit_count ?? 0);
          return dist <= 1 && strength > 0;
        });
        if (!adjacent) {
          effectiveActionType = "apply_military_pressure";
          console.log(`[ai-faction-turn] ${factionName}: annex_node ${node.name} downgraded to apply_military_pressure (no adjacent stack)`);
        }
      }

      const cmdMap: Record<string, string> = {
        open_trade_with_node: "OPEN_TRADE_WITH_NODE",
        send_envoy_to_node: "SEND_ENVOY_TO_NODE",
        apply_military_pressure: "APPLY_MILITARY_PRESSURE",
        annex_node: "ANNEX_NODE",
        block_node_annexation: "BLOCK_NODE_ANNEXATION",
      };
      const extraPayload: Record<string, unknown> = { note: action.description };
      if (effectiveActionType === "block_node_annexation") {
        const dur = Number((action as any).blockDurationTurns ?? 3);
        extraPayload.duration_turns = Math.max(1, Math.min(10, dur));
        extraPayload.reason = (action as any).narrativeNote || `Diplomatický blok (${factionName})`;
      }
      await invokeFunction(supabaseUrl, supabaseKey, "command-dispatch", {
        sessionId, turnNumber: turn,
        actor: { name: factionName, type: "ai_faction" },
        commandType: cmdMap[effectiveActionType],
        commandPayload: { node_id: node.id, ...extraPayload },
        commandId,
      });
      return "ok";
    }

    case "trade":
    case "explore":
    default: {
      await supabase.from("game_events").insert({
        session_id: sessionId, event_type: action.actionType || "other",
        player: factionName, turn_number: turn, confirmed: true,
        note: action.description, location: action.targetCity || null,
        result: action.narrativeNote || null,
        importance: "normal", truth_state: "canon", actor_type: "ai_faction",
      }).then(() => {}, () => {});
      return "ok";
    }
  }
}

// ═══════════════════════════════════════════
// AUTO-ACCEPT PACTS (AI-to-AI)
// ═══════════════════════════════════════════

async function autoAcceptPendingPacts(
  supabase: any, sessionId: string, factionName: string, faction: any,
  allFactions: any[], turn: number,
) {
  // Check unread diplomacy messages with pact proposals from other AI factions
  const { data: rooms } = await supabase.from("diplomacy_rooms")
    .select("id, participant_a, participant_b")
    .eq("session_id", sessionId)
    .or(`participant_a.eq.${factionName},participant_b.eq.${factionName}`);

  if (!rooms || rooms.length === 0) return;

  const aiFactionNames = allFactions.map((f: any) => f.faction_name);

  for (const room of rooms) {
    const otherParty = room.participant_a === factionName ? room.participant_b : room.participant_a;
    // Only auto-accept from other AI factions
    if (!aiFactionNames.includes(otherParty)) continue;

    // Check disposition toward this faction
    const disposition = (faction.disposition || {})[otherParty] ?? 0;
    const otherFaction = allFactions.find((f: any) => f.faction_name === otherParty);
    const otherDisposition = otherFaction ? ((otherFaction.disposition || {})[factionName] ?? 0) : 0;

    // Auto-accept trade pacts if disposition > 20 for both parties
    if (disposition > 20 || otherDisposition > 20) {
      // Check for recent pact proposals
      const { data: recentMsgs } = await supabase.from("diplomacy_messages")
        .select("message_text, sender, created_at")
        .eq("room_id", room.id).eq("sender", otherParty)
        .order("created_at", { ascending: false }).limit(3);

      for (const msg of (recentMsgs || [])) {
        if (msg.message_text?.includes("[OBCHODNÍ DOHODA]") || msg.message_text?.includes("[OBRANNÝ PAKT]")) {
          // Send acceptance message
          await supabase.from("diplomacy_messages").insert({
            room_id: room.id, sender: factionName, sender_type: "ai_faction",
            message_text: `[PŘIJATO] ${factionName} přijímá návrh od ${otherParty}. Ať tato dohoda prospívá oběma stranám.`,
            secrecy: "PRIVATE",
          });
          break; // One acceptance per room per turn
        }
      }
    }
  }
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

function findStack(stacks: any[], id?: string, name?: string): any | null {
  if (id) {
    const byId = stacks.find((s: any) => s.id === id);
    if (byId) return byId;
  }
  if (name) {
    return stacks.find((s: any) => s.name.toLowerCase() === name.toLowerCase()) || null;
  }
  return null;
}

function findCityByName(cities: any[], name?: string): any | null {
  if (!name) return cities[0] || null; // fallback to first city
  return cities.find((c: any) => c.name.toLowerCase() === name.toLowerCase()) || cities[0] || null;
}

async function sendDiplomacyMessage(
  supabase: any, sessionId: string, sender: string, target: string, text: string,
): Promise<string> {
  const { data: room } = await supabase.from("diplomacy_rooms")
    .select("id").eq("session_id", sessionId)
    .or(`and(participant_a.eq.${sender},participant_b.eq.${target}),and(participant_a.eq.${target},participant_b.eq.${sender})`)
    .maybeSingle();

  let roomId = room?.id;
  if (!roomId) {
    const { data: newRoom } = await supabase.from("diplomacy_rooms").insert({
      session_id: sessionId, participant_a: sender, participant_b: target,
      room_type: "ai_faction",
    }).select("id").single();
    roomId = newRoom?.id;
  }
  if (!roomId) return "room_creation_failed";

  await supabase.from("diplomacy_messages").insert({
    room_id: roomId, sender, sender_type: "ai_faction",
    message_text: text, secrecy: "PRIVATE",
  });
  return "ok";
}

// ═══════════════════════════════════════════
// SPORTS ONBOARDING — ensure AI factions have all 3 association types
// ═══════════════════════════════════════════

const ASSOCIATION_TYPES = ["sphaera", "olympic", "gladiatorial"] as const;
const ASSOCIATION_LABELS: Record<string, { name: string; academyName: string; cycleTurns: number; academyType: string }> = {
  sphaera: { name: "Liga Sphaera", academyName: "Sportovní akademie", cycleTurns: 5, academyType: "sphaera" },
  olympic: { name: "Olympijský svaz", academyName: "Olympijská akademie", cycleTurns: 4, academyType: "athletic" },
  gladiatorial: { name: "Gladiátorský svaz", academyName: "Gladiátorská škola", cycleTurns: 6, academyType: "gladiatorial" },
};

const TEAM_PREFIXES = ["Lvi", "Orli", "Vlci", "Jestřábi", "Draci", "Hadi", "Býci", "Sokolové", "Medvědi", "Panter"];

async function ensureSportsOnboarding(
  supabase: any, sessionId: string, factionName: string, turn: number, myCities: any[],
) {
  if (myCities.length === 0) return;

  try {
    // Check existing associations
    const { data: existing } = await supabase.from("sports_associations")
      .select("id, association_type, city_id")
      .eq("session_id", sessionId).eq("player_name", factionName);

    const existingTypes = new Set((existing || []).map((a: any) => a.association_type));
    const existingAssocMap = new Map<string, string>((existing || []).map((a: any) => [a.association_type as string, a.id as string]));

    // Check existing academies
    const { data: existingAcademies } = await supabase.from("academies")
      .select("id, association_id, academy_type")
      .eq("session_id", sessionId).eq("player_name", factionName);
    const academyAssocIds = new Set((existingAcademies || []).map((a: any) => a.association_id).filter(Boolean));

    for (const aType of ASSOCIATION_TYPES) {
      const label = ASSOCIATION_LABELS[aType];
      const city = myCities[0]; // Use capital / first city
      let assocId: string;

      if (existingTypes.has(aType)) {
        // Association exists — use it
        assocId = existingAssocMap.get(aType)!;
      } else {
        // 1. Create association
        const { data: assoc, error: assocErr } = await supabase.from("sports_associations").insert({
          session_id: sessionId,
          city_id: city.id,
          player_name: factionName,
          name: `${label.name} ${factionName}`,
          association_type: aType,
          founded_turn: turn,
          status: "active",
          reputation: 10,
          scouting_level: 1,
          youth_development: 1,
          training_quality: 1,
        }).select("id").single();

        if (assocErr || !assoc) {
          console.warn(`[${factionName}] Failed to create ${aType} association:`, assocErr?.message);
          continue;
        }
        assocId = assoc.id;
        console.log(`[${factionName}] Created ${aType} association in ${city.name}`);
      }

      // 2. Create academy if missing for this association
      if (!academyAssocIds.has(assocId)) {
        await supabase.from("academies").insert({
          session_id: sessionId,
          city_id: city.id,
          player_name: factionName,
          name: `${label.academyName} – ${city.name}`,
          academy_type: label.academyType,
          association_id: assocId,
          founded_turn: turn,
          last_training_turn: turn,
          training_cycle_turns: label.cycleTurns,
          status: "active",
          infrastructure: 10,
          reputation: 10,
          nutrition: 10,
          trainer_level: 10,
        });
        console.log(`[${factionName}] Created ${label.academyType} academy in ${city.name}`);
      }

      // 3. For Sphaera — create teams (up to 3 per city)
      if (aType === "sphaera") {
        for (let i = 0; i < Math.min(3, myCities.length); i++) {
          const teamCity = myCities[i];
          // Check existing team count for this city
          const { count } = await supabase.from("league_teams")
            .select("id", { count: "exact", head: true })
            .eq("session_id", sessionId).eq("city_id", teamCity.id).eq("is_active", true);

          if ((count || 0) >= 3) continue;

          const prefix = TEAM_PREFIXES[Math.floor(Math.random() * TEAM_PREFIXES.length)];
          const hue = Math.floor(Math.random() * 360);
          const color = `hsl(${hue}, 70%, 50%)`;

          const { data: team } = await supabase.from("league_teams").insert({
            session_id: sessionId,
            city_id: teamCity.id,
            player_name: factionName,
            team_name: `${prefix} ${teamCity.name}`,
            association_id: assocId,
            color_primary: color,
            color_secondary: "#ffffff",
            attack_rating: 40 + Math.floor(Math.random() * 20),
            defense_rating: 40 + Math.floor(Math.random() * 20),
            tactics_rating: 40 + Math.floor(Math.random() * 20),
            discipline_rating: 40 + Math.floor(Math.random() * 20),
            popularity: 10,
            fan_base: 50 + Math.floor(Math.random() * 200),
            is_active: true,
          }).select("id").single();

          // Generate roster for the team
          if (team) {
            await generateTeamRoster(supabase, sessionId, team.id, factionName);
          }
        }
      }

      console.log(`[${factionName}] Created ${aType} association + academy in ${city.name}`);
    }

    // 4. Set sport_funding_pct if not set
    const { data: realm } = await supabase.from("realm_resources")
      .select("sport_funding_pct").eq("session_id", sessionId).eq("player_name", factionName).maybeSingle();

    if (realm && (realm.sport_funding_pct || 0) < 5) {
      const funding = 5 + Math.floor(Math.random() * 10); // 5-14%
      await supabase.from("realm_resources")
        .update({ sport_funding_pct: funding })
        .eq("session_id", sessionId).eq("player_name", factionName);
    }
  } catch (e) {
    console.warn(`[${factionName}] Sports onboarding error (non-blocking):`, e);
  }
}

const SPHAERA_POSITIONS = ["striker", "striker", "guardian", "guardian", "carrier", "praetor", "exactor"];

async function generateTeamRoster(supabase: any, sessionId: string, teamId: string, playerName: string) {
  const firstNames = ["Aelius", "Brutus", "Cassius", "Decimus", "Flavius", "Gaius", "Lucius", "Marcus", "Publius", "Titus", "Varro", "Servius"];
  const lastNames = ["Ferro", "Stratos", "Nerva", "Corvus", "Plinius", "Regulus", "Rufus", "Vindex", "Calvus", "Crispus"];

  for (const pos of SPHAERA_POSITIONS) {
    const name = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
    const overall = 40 + Math.floor(Math.random() * 30); // 40-69
    await supabase.from("league_players").insert({
      session_id: sessionId,
      team_id: teamId,
      name,
      position: pos,
      strength: 30 + Math.floor(Math.random() * 40),
      speed: 30 + Math.floor(Math.random() * 40),
      technique: 30 + Math.floor(Math.random() * 40),
      stamina: 50 + Math.floor(Math.random() * 30),
      aggression: 20 + Math.floor(Math.random() * 40),
      leadership: 10 + Math.floor(Math.random() * 30),
      overall_rating: overall,
      form: 50 + Math.floor(Math.random() * 30),
      condition: 80 + Math.floor(Math.random() * 20),
      age: 18 + Math.floor(Math.random() * 12),
      talent_potential: overall + Math.floor(Math.random() * 20),
      peak_age: 25 + Math.floor(Math.random() * 5),
    }).then(() => {}, () => {});
  }
}

async function invokeFunction(
  supabaseUrl: string, supabaseKey: string, funcName: string, body: any,
) {
  const res = await fetch(`${supabaseUrl}/functions/v1/${funcName}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => "");
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
  if (!res.ok) {
    // Do not throw — return a structured error so callers can mark the action as failed.
    return { ok: false, error: parsed?.error || `${funcName} failed (${res.status})`, status: res.status };
  }
  return parsed ?? {};
}
