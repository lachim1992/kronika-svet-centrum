import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type GameSession = Tables<"game_sessions">;
type GameEvent = Tables<"game_events">;
type WorldMemory = Tables<"world_memories">;
type ChronicleEntry = Tables<"chronicle_entries">;
type CityState = Tables<"city_states">;
type EventResponse = Tables<"event_responses">;

export function useGameSession(sessionId: string | null) {
  const [session, setSession] = useState<GameSession | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [memories, setMemories] = useState<WorldMemory[]>([]);
  const [chronicles, setChronicles] = useState<ChronicleEntry[]>([]);
  const [cityStates, setCityStates] = useState<CityState[]>([]);
  const [responses, setResponses] = useState<EventResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);

    const [sessRes, evtRes, memRes, chrRes, csRes] = await Promise.all([
      supabase.from("game_sessions").select("*").eq("id", sessionId).single(),
      supabase.from("game_events").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
      supabase.from("world_memories").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
      supabase.from("chronicle_entries").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
      supabase.from("city_states").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
    ]);

    if (sessRes.data) setSession(sessRes.data);
    if (evtRes.data) {
      setEvents(evtRes.data);
      // Fetch responses for all events
      const eventIds = evtRes.data.map(e => e.id);
      if (eventIds.length > 0) {
        const respRes = await supabase.from("event_responses").select("*").in("event_id", eventIds).order("created_at", { ascending: true });
        if (respRes.data) setResponses(respRes.data);
      }
    }
    if (memRes.data) setMemories(memRes.data);
    if (chrRes.data) setChronicles(chrRes.data);
    if (csRes.data) setCityStates(csRes.data);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Realtime subscriptions
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`session-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_events", filter: `session_id=eq.${sessionId}` }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "world_memories", filter: `session_id=eq.${sessionId}` }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "chronicle_entries", filter: `session_id=eq.${sessionId}` }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "city_states", filter: `session_id=eq.${sessionId}` }, () => fetchAll())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId, fetchAll]);

  return { session, events, memories, chronicles, cityStates, responses, loading, refetch: fetchAll };
}

export async function createGameSession(player1Name: string): Promise<GameSession | null> {
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const { data, error } = await supabase.from("game_sessions").insert({ room_code: roomCode, player1_name: player1Name }).select().single();
  if (error) { console.error(error); return null; }
  return data;
}

export async function joinGameSession(roomCode: string, player2Name: string): Promise<GameSession | null> {
  const { data, error } = await supabase.from("game_sessions").update({ player2_name: player2Name }).eq("room_code", roomCode.toUpperCase()).select().single();
  if (error) { console.error(error); return null; }
  return data;
}

export async function addGameEvent(sessionId: string, eventType: string, player: string, location: string, note: string, turnNumber: number) {
  const { error } = await supabase.from("game_events").insert({ session_id: sessionId, event_type: eventType, player, location: location || null, note: note || null, turn_number: turnNumber });
  if (error) console.error(error);
}

export async function confirmEvent(eventId: string) {
  const { error } = await supabase.from("game_events").update({ confirmed: true }).eq("id", eventId);
  if (error) console.error(error);
}

export async function addEventResponse(eventId: string, player: string, note: string) {
  const { error } = await supabase.from("event_responses").insert({ event_id: eventId, player, note });
  if (error) console.error(error);
}

export async function addWorldMemory(sessionId: string, text: string, approved = false) {
  const { error } = await supabase.from("world_memories").insert({ session_id: sessionId, text, approved });
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

export async function addChronicleEntry(sessionId: string, text: string, epochStyle: string) {
  const { error } = await supabase.from("chronicle_entries").insert({ session_id: sessionId, text, epoch_style: epochStyle });
  if (error) console.error(error);
}

export async function addCityState(sessionId: string, name: string, type: string) {
  const { error } = await supabase.from("city_states").insert({ session_id: sessionId, name, type });
  if (error) console.error(error);
}

export async function updateCityState(id: string, updates: { mood?: string; influence_p1?: number; influence_p2?: number }) {
  const { error } = await supabase.from("city_states").update(updates).eq("id", id);
  if (error) console.error(error);
}

export async function updateEpochStyle(sessionId: string, epochStyle: string) {
  const { error } = await supabase.from("game_sessions").update({ epoch_style: epochStyle }).eq("id", sessionId);
  if (error) console.error(error);
}
