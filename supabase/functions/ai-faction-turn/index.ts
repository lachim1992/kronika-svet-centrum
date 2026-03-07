/**
 * ai-faction-turn: Enhanced AI faction decision-making with FULL military capability.
 * Uses unified AI context (createAIContext + invokeAI) for premise injection.
 */

import { createAIContext, invokeAI, getServiceClient, corsHeaders, jsonResponse as json, errorResponse } from "../_shared/ai-context.ts";

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
      wood: realmRes?.wood_reserve || 0,
      stone: realmRes?.stone_reserve || 0,
      iron: realmRes?.iron_reserve || 0,
      manpower: realmRes?.manpower_pool || 0,
      manpowerCommitted: realmRes?.manpower_committed || 0,
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

    // Affordable buildings
    const affordableBuildings = (buildingTemplates || []).filter((t: any) =>
      t.cost_wood <= resources.wood && t.cost_stone <= resources.stone &&
      t.cost_iron <= resources.iron && t.cost_wealth <= resources.gold
    ).map((t: any) => t.name).slice(0, 8);

    const personality = faction.personality || "diplomatic";
    const goals = faction.goals || [];

    // ── Load unified AI context (premise, lore, constraints) ──
    const aiCtx = await createAIContext(sessionId, turn, supabase, factionName);

    const systemPrompt = `Jsi AI řídící frakci "${factionName}" v civilizační strategické hře.

OSOBNOST: ${personality}
MÝTUS: ${civ?.core_myth || "neznámý"}
KULTURNÍ ZVLÁŠTNOST: ${civ?.cultural_quirk || "žádná"}
CÍLE: ${JSON.stringify(goals)}
POSTOJ K OSTATNÍM: ${JSON.stringify(faction.disposition)}

PRAVIDLA ROZHODOVÁNÍ:
1. EKONOMIE: Rozhoduj na základě aktuálních zdrojů. Nestavěj/neverbuj bez zdrojů.
2. DIPLOMACIE: Vyhrožuj, nabízej smír, komunikuj — vše skrze diplomatické zprávy.
3. VÁLKA: PŘED vyhlášením války MUSÍŠ nejdřív poslat ultimátum (send_ultimatum). Válku můžeš vyhlásit až v DALŠÍM kole po ultimátu.
4. MÍR: Pokud válka trvá a jsi v nevýhodě, nabídni mír. Pokud jsi silný, požaduj podmínky.
5. ARMÁDA: Verbuj vojsko úměrně hrozbám a zdrojům. DODRŽUJ doporučenou mobilizační sazbu.
6. STAVBY: Stavěj budovy které odpovídají tvé situaci (obrana při válce, ekonomika v míru).
7. Max 8 akcí za kolo (více v době války).
8. Odpovídej ČESKY. Diplomatické zprávy piš v dobovém středověkém tónu odpovídajícím tvé osobnosti.
9. Nesmíš měnit číselné hodnoty — pouze rozhoduj o akcích.

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
- set_mobilization: nastavuje globální mobilizační sazbu dle situace.

OSOBNOSTNÍ VZORCE:
- aggressive: Přímé hrozby, časné verbování, rychlá eskalace. Cílí na slabší.
- diplomatic: Preferuje jednání, kompromisy, mírová řešení. Buduje aliance.
- mercantile: Obchod, ekonomický růst, stavby, obchodní dohody. Obchoduje se všemi.
- isolationist: Opatrnost, fortifikace, minimální interakce. Uzavírá jen obranné pakty.
- expansionist: Územní růst, kolonizace, strategická válka. Hledá příležitosti.`;

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
Zlato: ${resources.gold}, Obilí: ${resources.grain}, Dřevo: ${resources.wood}, Kámen: ${resources.stone}, Železo: ${resources.iron}
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

═══ TVOJE MINULÉ AKCE (paměť) ═══
${(myPastActions || []).map((a: any) => `  [Rok ${a.turn_number}] ${a.action_type}: ${a.description}`).join("\n") || "žádné záznamy"}

═══ ZAKLÁDÁNÍ OSAD ═══
Můžeš založit novou osadu na volném hexu ve vlastní provincii. Stojí: 200 zlata, 50 dřeva, 30 kamene.
Tvé provincie: ${(myProvinces || []).map((p: any) => `${p.name} [${p.hex_q},${p.hex_r}]`).join(", ") || "žádné"}
Volné hexy existují, pokud v provincii není přelidněno.

Rozhodni, co frakce udělá v tomto kole. ${milMetrics.warState === "war" ? "JSTE VE VÁLCE — PRIORITA: nasadit armády, útočit na města, bránit vlastní území!" : ""} Buď strategický a situační. Zvažuj akce vůči VŠEM hráčům i AI frakcím — obchod, pakty, společné útoky.`;

    // ── Call AI via unified pipeline ──
    const aiResult = await invokeAI(aiCtx, {
      model: "google/gemini-2.5-pro",
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
              internalThought: { type: "string", description: "Interní úvaha AI (pro debug/narativ)" },
            },
            required: ["actions", "internalThought"],
            additionalProperties: false,
          },
        },
      }],
      toolChoice: { type: "function", function: { name: "faction_turn" } },
    });

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

    // ── SPORTS ONBOARDING: ensure AI has all 3 association types, academies, teams, funding ──
    await ensureSportsOnboarding(supabase, sessionId, factionName, turn, cities || []);

    // ── Execute each action ──
    for (const action of (result.actions || []).slice(0, 8)) {
      try {
        const executed = await executeAction(
          supabase, supabaseUrl, supabaseKey, sessionId, turn, factionName, action, faction,
          sentUltimatums.length > 0, stacks || [], cities || [], allCities || [], enemyStacks || [], realmRes,
        );
        executedActions.push({ ...action, executed: true, result: executed });
      } catch (err) {
        console.error(`Action ${action.actionType} failed:`, err);
        executedActions.push({ ...action, executed: false, error: (err as Error).message });
      }
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

    // ── Audit log ──
    await supabase.from("world_action_log").insert({
      session_id: sessionId,
      player_name: factionName,
      turn_number: turn,
      action_type: "ai_faction_turn",
      description: `AI frakce ${factionName}: ${executedActions.filter(a => a.executed).length}/${executedActions.length} akcí [${milMetrics.warState}]. ${result.internalThought || ""}`,
    }).then(() => {}, () => {});

    // Economy is now handled centrally by commit-turn (no duplicate processing)

    return json({
      faction: factionName,
      actionsCount: executedActions.filter(a => a.executed).length,
      actions: executedActions,
      militaryMetrics: milMetrics,
      internalThought: result.internalThought,
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

      // Auto-downgrade preset if manpower is insufficient
      const presetManpower: Record<string, number> = {
        legion: 800, cavalry_wing: 200, cohort: 400, militia: 200,
      };
      const availableManpower = realmRes?.manpower_pool || 0;
      const mobRate = realmRes?.mobilization_rate || 0.1;
      const mobilizedCap = Math.floor(availableManpower * mobRate);

      if (mobilizedCap < (presetManpower[preset] || 200)) {
        // Try to downgrade
        const fallbackOrder = ["militia", "cohort", "cavalry_wing", "legion"];
        let found = false;
        for (const fb of fallbackOrder) {
          if (mobilizedCap >= (presetManpower[fb] || 200)) {
            console.log(`[${factionName}] Downgraded ${preset} → ${fb} (manpower ${mobilizedCap})`);
            preset = fb;
            found = true;
            break;
          }
        }
        if (!found) {
          console.log(`[${factionName}] Cannot recruit — manpower ${mobilizedCap} too low for any preset`);
          return "insufficient_manpower";
        }
      }

      await invokeFunction(supabaseUrl, supabaseKey, "command-dispatch", {
        sessionId, turnNumber: turn,
        actor: { name: factionName, type: "ai_faction" },
        commandType: "RECRUIT_STACK",
        commandPayload: {
          stackName: name, presetKey: preset,
          note: action.description,
          chronicleText: action.narrativeNote || `${factionName} verbuje novou armádu: ${name}.`,
        },
        commandId,
      });
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

      const next = stepToward(stack.hex_q, stack.hex_r, targetQ, targetR);
      await supabase.from("military_stacks").update({
        hex_q: next.q, hex_r: next.r, moved_this_turn: true,
      }).eq("id", stack.id);

      return `moved_to_${next.q}_${next.r}`;
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

      // Cost check
      if (resources.gold < 200 || resources.wood < 50 || resources.stone < 30) return "insufficient_resources";
      if (hexQ === undefined || hexR === undefined) return "missing_hex_coords";

      // Check hex is not occupied by another city
      const existingCity = allCities.find((c: any) => c.province_q === hexQ && c.province_r === hexR);
      if (existingCity) return "hex_occupied";

      // Deduct resources
      await supabase.from("realm_resources").update({
        gold_reserve: resources.gold - 200,
        wood_reserve: resources.wood - 50,
        stone_reserve: resources.stone - 30,
      }).eq("session_id", sessionId).eq("player_name", factionName);

      // Find province for this hex
      const province = (myProvinces || []).find((p: any) => p.owner_player === factionName);

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

    for (const aType of ASSOCIATION_TYPES) {
      if (existingTypes.has(aType)) continue;

      const label = ASSOCIATION_LABELS[aType];
      const city = myCities[0]; // Use capital / first city

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

      // 2. Create academy linked to association
      await supabase.from("academies").insert({
        session_id: sessionId,
        city_id: city.id,
        player_name: factionName,
        name: `${label.academyName} – ${city.name}`,
        academy_type: label.academyType,
        association_id: assoc.id,
        founded_turn: turn,
        last_training_turn: turn,
        training_cycle_turns: label.cycleTurns,
        status: "active",
        infrastructure: 10,
        reputation: 10,
        nutrition: 10,
        trainer_level: 10,
      });

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
            association_id: assoc.id,
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
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${funcName} failed (${res.status}): ${text}`);
  }
  return res.json();
}
