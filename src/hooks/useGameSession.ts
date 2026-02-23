import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type GameSession = Tables<"game_sessions">;
type GameEvent = Tables<"game_events">;
type WorldMemory = Tables<"world_memories">;
type ChronicleEntry = Tables<"chronicle_entries">;
type CityState = Tables<"city_states">;
type EventResponse = Tables<"event_responses">;
type GamePlayer = Tables<"game_players">;
type City = Tables<"cities">;
type PlayerResource = Tables<"player_resources">;
type MilitaryCapacity = Tables<"military_capacity">;
type TradeLog = Tables<"trade_log">;

interface EntityTrait {
  id: string;
  session_id: string;
  entity_type: string;
  entity_name: string;
  entity_id: string | null;
  trait_category: string;
  trait_text: string;
  source_event_id: string | null;
  source_turn: number;
  is_active: boolean;
  created_at: string;
}
type Wonder = Tables<"wonders">;

export function useGameSession(sessionId: string | null) {
  const [session, setSession] = useState<GameSession | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [memories, setMemories] = useState<WorldMemory[]>([]);
  const [chronicles, setChronicles] = useState<ChronicleEntry[]>([]);
  const [cityStates, setCityStates] = useState<CityState[]>([]);
  const [responses, setResponses] = useState<EventResponse[]>([]);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [resources, setResources] = useState<PlayerResource[]>([]);
  const [armies, setArmies] = useState<MilitaryCapacity[]>([]);
  const [trades, setTrades] = useState<TradeLog[]>([]);
  const [wonders, setWonders] = useState<Wonder[]>([]);
  const [entityTraits, setEntityTraits] = useState<EntityTrait[]>([]);
  const [civilizations, setCivilizations] = useState<any[]>([]);
  const [greatPersons, setGreatPersons] = useState<any[]>([]);
  const [declarations, setDeclarations] = useState<any[]>([]);
  const [worldCrises, setWorldCrises] = useState<any[]>([]);
  const [secretObjectives, setSecretObjectives] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const initialLoadDone = useRef(false);
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAll = useCallback(async () => {
    if (!sessionId) return;
    if (!initialLoadDone.current) setLoading(true);

    const [sessRes, evtRes, memRes, chrRes, csRes, plRes, citRes, resRes, armRes, trdRes, wndRes, trtRes,
      civRes, gpRes, declRes, crisisRes, objRes] = await Promise.all([
      supabase.from("game_sessions").select("*").eq("id", sessionId).single(),
      supabase.from("game_events").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
      supabase.from("world_memories").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
      supabase.from("chronicle_entries").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
      supabase.from("city_states").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
      supabase.from("game_players").select("*").eq("session_id", sessionId).order("player_number", { ascending: true }),
      supabase.from("cities").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
      supabase.from("player_resources").select("*").eq("session_id", sessionId).order("player_name", { ascending: true }),
      supabase.from("military_capacity").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
      supabase.from("trade_log").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
      supabase.from("wonders").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
      supabase.from("entity_traits").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
      supabase.from("civilizations").select("*").eq("session_id", sessionId),
      supabase.from("great_persons").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
      supabase.from("declarations").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
      supabase.from("world_crises").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
      supabase.from("secret_objectives").select("*").eq("session_id", sessionId),
    ]);

    if (sessRes.data) setSession(sessRes.data);
    if (evtRes.data) {
      setEvents(evtRes.data);
      const eventIds = evtRes.data.map(e => e.id);
      if (eventIds.length > 0) {
        const respRes = await supabase.from("event_responses").select("*").in("event_id", eventIds).order("created_at", { ascending: true });
        if (respRes.data) setResponses(respRes.data);
      }
    }
    if (memRes.data) setMemories(memRes.data);
    if (chrRes.data) setChronicles(chrRes.data);
    if (csRes.data) setCityStates(csRes.data);
    if (plRes.data) setPlayers(plRes.data);
    if (citRes.data) setCities(citRes.data);
    if (resRes.data) setResources(resRes.data);
    if (armRes.data) setArmies(armRes.data);
    if (trdRes.data) setTrades(trdRes.data);
    if (wndRes.data) setWonders(wndRes.data);
    if (trtRes.data) setEntityTraits(trtRes.data as EntityTrait[]);
    if (civRes.data) setCivilizations(civRes.data);
    if (gpRes.data) setGreatPersons(gpRes.data);
    if (declRes.data) setDeclarations(declRes.data);
    if (crisisRes.data) setWorldCrises(crisisRes.data);
    if (objRes.data) setSecretObjectives(objRes.data);
    setLoading(false);
    initialLoadDone.current = true;
  }, [sessionId]);

  // Debounced refetch for realtime events
  const debouncedRefetch = useCallback(() => {
    if (fetchTimer.current) clearTimeout(fetchTimer.current);
    fetchTimer.current = setTimeout(() => fetchAll(), 800);
  }, [fetchAll]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel(`session-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_events", filter: `session_id=eq.${sessionId}` }, () => debouncedRefetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "world_memories", filter: `session_id=eq.${sessionId}` }, () => debouncedRefetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "chronicle_entries", filter: `session_id=eq.${sessionId}` }, () => debouncedRefetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "city_states", filter: `session_id=eq.${sessionId}` }, () => debouncedRefetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "game_sessions", filter: `id=eq.${sessionId}` }, () => debouncedRefetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "game_players", filter: `session_id=eq.${sessionId}` }, () => debouncedRefetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "cities", filter: `session_id=eq.${sessionId}` }, () => debouncedRefetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "player_resources", filter: `session_id=eq.${sessionId}` }, () => debouncedRefetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "military_capacity", filter: `session_id=eq.${sessionId}` }, () => debouncedRefetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "trade_log", filter: `session_id=eq.${sessionId}` }, () => debouncedRefetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "wonders", filter: `session_id=eq.${sessionId}` }, () => debouncedRefetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "entity_traits", filter: `session_id=eq.${sessionId}` }, () => debouncedRefetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "civilizations", filter: `session_id=eq.${sessionId}` }, () => debouncedRefetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "great_persons", filter: `session_id=eq.${sessionId}` }, () => debouncedRefetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "declarations", filter: `session_id=eq.${sessionId}` }, () => debouncedRefetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "world_crises", filter: `session_id=eq.${sessionId}` }, () => debouncedRefetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "secret_objectives", filter: `session_id=eq.${sessionId}` }, () => debouncedRefetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "turn_summaries", filter: `session_id=eq.${sessionId}` }, () => debouncedRefetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "world_feed_items", filter: `session_id=eq.${sessionId}` }, () => debouncedRefetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "world_action_log", filter: `session_id=eq.${sessionId}` }, () => debouncedRefetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId, debouncedRefetch]);

  return {
    session, events, memories, chronicles, cityStates, responses, players, cities,
    resources, armies, trades, wonders, entityTraits,
    civilizations, greatPersons, declarations, worldCrises, secretObjectives,
    loading, refetch: fetchAll,
  };
}

// ---- Session Management ----

export async function createGameSession(playerName: string): Promise<GameSession | null> {
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const { data, error } = await supabase.from("game_sessions").insert({
    room_code: roomCode,
    player1_name: playerName,
    max_players: 10,
  }).select().single();
  if (error) { console.error(error); return null; }

  await supabase.from("game_players").insert({
    session_id: data.id,
    player_name: playerName,
    player_number: 1,
  });

  await initPlayerResources(data.id, playerName);
  return data;
}

export async function joinGameSession(roomCode: string, playerName: string): Promise<GameSession | null> {
  const { data: session, error: fetchErr } = await supabase
    .from("game_sessions").select("*").eq("room_code", roomCode.toUpperCase()).single();
  if (fetchErr || !session) { console.error(fetchErr); return null; }

  const { data: existingPlayers } = await supabase
    .from("game_players").select("*").eq("session_id", session.id).order("player_number", { ascending: true });
  
  const playerCount = existingPlayers?.length || 0;
  if (playerCount >= session.max_players) { console.error("Game is full"); return null; }

  const nextNumber = playerCount + 1;
  const { error: plErr } = await supabase.from("game_players").insert({
    session_id: session.id, player_name: playerName, player_number: nextNumber,
  });
  if (plErr) { console.error(plErr); return null; }

  if (nextNumber === 2) {
    await supabase.from("game_sessions").update({ player2_name: playerName }).eq("id", session.id);
  }

  await initPlayerResources(session.id, playerName);
  return session;
}

async function initPlayerResources(sessionId: string, playerName: string) {
  const resourceTypes = ["food", "wood", "stone", "iron", "wealth"];
  const defaults: Record<string, { income: number; upkeep: number; stockpile: number }> = {
    food: { income: 4, upkeep: 2, stockpile: 10 },
    wood: { income: 3, upkeep: 1, stockpile: 5 },
    stone: { income: 2, upkeep: 0, stockpile: 3 },
    iron: { income: 1, upkeep: 0, stockpile: 2 },
    wealth: { income: 2, upkeep: 1, stockpile: 5 },
  };

  for (const rt of resourceTypes) {
    await supabase.from("player_resources").insert({
      session_id: sessionId, player_name: playerName, resource_type: rt, ...defaults[rt],
    });
  }
}

// ---- Events ----

export async function addGameEvent(sessionId: string, eventType: string, player: string, location: string, note: string, turnNumber: number) {
  const { error } = await supabase.from("game_events").insert({ session_id: sessionId, event_type: eventType, player, location: location || null, note: note || null, turn_number: turnNumber });
  if (error) console.error(error);
}

export async function confirmEvent(eventId: string, sessionId?: string, currentTurn?: number, epochStyle?: string) {
  const { error } = await supabase.from("game_events").update({ confirmed: true }).eq("id", eventId);
  if (error) { console.error(error); return; }

  // Auto-trigger Rumor Engine for confirmed events
  if (sessionId) {
    try {
      await supabase.functions.invoke("rumor-engine", {
        body: {
          sessionId,
          eventId,
          currentTurn: currentTurn || 1,
          epochStyle: epochStyle || "kroniky",
          isPlayerEvent: false,
        },
      });
    } catch (e) {
      console.warn("Rumor engine failed (non-blocking):", e);
    }
  }
}

export async function addEventResponse(eventId: string, player: string, note: string) {
  const { error } = await supabase.from("event_responses").insert({ event_id: eventId, player, note });
  if (error) console.error(error);
}

// ---- Memories ----

export async function addWorldMemory(
  sessionId: string, text: string, approved = false,
  cityId?: string, provinceId?: string, category?: string, createdRound?: number
) {
  const record: any = { session_id: sessionId, text, approved };
  if (cityId) record.city_id = cityId;
  if (provinceId) record.province_id = provinceId;
  if (category) record.category = category;
  if (createdRound) record.created_round = createdRound;
  const { error } = await supabase.from("world_memories").insert(record);
  if (error) console.error(error);
}

export async function approveMemory(memoryId: string) {
  const { error } = await supabase.from("world_memories").update({ approved: true }).eq("id", memoryId);
  if (error) console.error(error);
}

export async function deleteMemory(memoryId: string) {
  const { error } = await supabase.from("world_memories").delete().eq("id", memoryId);
  if (error) console.error(error);
}

// ---- Chronicle ----

export async function addChronicleEntry(sessionId: string, text: string, epochStyle: string, turnNumber: number) {
  const { error } = await supabase.from("chronicle_entries").insert({ session_id: sessionId, text, epoch_style: epochStyle });
  if (error) console.error(error);
}

// ---- City States ----

export async function addCityState(sessionId: string, name: string, type: string) {
  const { error } = await supabase.from("city_states").insert({ session_id: sessionId, name, type });
  if (error) console.error(error);
}

export async function updateCityState(id: string, updates: { mood?: string; influence_p1?: number; influence_p2?: number }) {
  const { error } = await supabase.from("city_states").update(updates).eq("id", id);
  if (error) console.error(error);
}

// ---- Session State ----

export async function updateEpochStyle(sessionId: string, epochStyle: string) {
  const { error } = await supabase.from("game_sessions").update({ epoch_style: epochStyle }).eq("id", sessionId);
  if (error) console.error(error);
}

export async function closeTurnForPlayer(sessionId: string, playerNumber: number) {
  const { error } = await supabase.from("game_players").update({ turn_closed: true })
    .eq("session_id", sessionId).eq("player_number", playerNumber);
  if (error) console.error(error);

  if (playerNumber === 1) {
    await supabase.from("game_sessions").update({ turn_closed_p1: true }).eq("id", sessionId);
  } else if (playerNumber === 2) {
    await supabase.from("game_sessions").update({ turn_closed_p2: true }).eq("id", sessionId);
  }
}

export async function advanceTurn(sessionId: string, currentTurn: number) {
  await supabase.from("game_players").update({ turn_closed: false }).eq("session_id", sessionId);

  const { error } = await supabase.from("game_sessions").update({
    current_turn: currentTurn + 1, turn_closed_p1: false, turn_closed_p2: false,
  }).eq("id", sessionId);
  if (error) console.error(error);
}

// ---- Cities ----

export async function addCity(sessionId: string, ownerPlayer: string, name: string, province: string, level: string, tags: string[], currentTurn?: number) {
  // Check for existing city with same name in this session (prevent duplicates)
  const { data: existing } = await supabase
    .from("cities")
    .select("id")
    .eq("session_id", sessionId)
    .eq("name", name)
    .maybeSingle();

  let cityId: string | undefined;

  if (existing) {
    // City already exists — reuse it, optionally update fields
    cityId = existing.id;
    await supabase.from("cities").update({
      owner_player: ownerPlayer, province: province || null, level, tags,
    }).eq("id", cityId);
  } else {
    const { data: cityData, error } = await supabase.from("cities").insert({
      session_id: sessionId, owner_player: ownerPlayer, name, province: province || null, level, tags,
    }).select("id").single();
    if (error) { console.error(error); return; }
    cityId = cityData?.id;
  }

  const turn = currentTurn || 1;

  // Auto-create World Event for city founding
  const slug = `founding-${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
  await supabase.from("world_events").insert({
    session_id: sessionId,
    title: `Založení města ${name}`,
    slug,
    summary: `${ownerPlayer} založil${province ? ` v provincii ${province}` : ""} nové ${level.toLowerCase()} ${name}.`,
    event_category: "founding",
    created_turn: turn,
    date: `Rok ${turn}`,
    status: "published",
    created_by_type: "player",
    affected_players: [ownerPlayer],
    location_id: cityId || null,
    participants: JSON.stringify([{ name: ownerPlayer, role: "founder" }]),
  });

  // Auto-create Feed item (šuškanda)
  await supabase.from("world_feed_items").insert({
    session_id: sessionId,
    turn_number: turn,
    feed_type: "gossip",
    content: `👂 Šeptá se, že ${ownerPlayer} založil nové ${level.toLowerCase()} jménem **${name}**${province ? ` v provincii ${province}` : ""}. Obchodníci již hledají cestu do nových ulic…`,
    linked_city: name,
    importance: "normal",
  });

  // Auto-create Chronicle entry
  await supabase.from("chronicle_entries").insert({
    session_id: sessionId,
    turn_from: turn,
    turn_to: turn,
    text: `V roce ${turn} bylo založeno ${level.toLowerCase()} **${name}**${province ? ` v provincii ${province}` : ""}, pod vládou ${ownerPlayer}. Nová osada se rodí z prachu a naděje.`,
  });
}

export async function updateCity(id: string, updates: { level?: string; province?: string; tags?: string[] }) {
  const { error } = await supabase.from("cities").update(updates).eq("id", id);
  if (error) console.error(error);
}

export async function deleteCity(id: string) {
  const { error } = await supabase.from("cities").delete().eq("id", id);
  if (error) console.error(error);
}

// ---- Resources ----

export async function updateResource(id: string, updates: { income?: number; upkeep?: number; stockpile?: number }) {
  const { error } = await supabase.from("player_resources").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) console.error(error);
}

// ---- Military ----

export async function addArmy(sessionId: string, playerName: string, armyName: string, armyType: string, ironCost: number) {
  const { error } = await supabase.from("military_capacity").insert({
    session_id: sessionId, player_name: playerName, army_name: armyName, army_type: armyType, iron_cost: ironCost,
  });
  if (error) console.error(error);
}

export async function updateArmy(id: string, updates: { status?: string; army_type?: string }) {
  const { error } = await supabase.from("military_capacity").update(updates).eq("id", id);
  if (error) console.error(error);
}

// ---- Trade ----

export async function addTrade(sessionId: string, turnNumber: number, fromPlayer: string, toPlayer: string, resourceType: string, amount: number, tradeType: string, note?: string) {
  const { error } = await supabase.from("trade_log").insert({
    session_id: sessionId, turn_number: turnNumber, from_player: fromPlayer, to_player: toPlayer,
    resource_type: resourceType, amount, trade_type: tradeType, note: note || null,
  });
  if (error) console.error(error);
}
