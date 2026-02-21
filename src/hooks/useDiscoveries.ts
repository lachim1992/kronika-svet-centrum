import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Discovery {
  id: string;
  session_id: string;
  player_name: string;
  entity_type: string;
  entity_id: string;
  discovered_at: string;
  source: string;
}

export function useDiscoveries(sessionId: string | undefined, playerName: string, myRole: string) {
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [loading, setLoading] = useState(true);
  const isAdmin = myRole === "admin";

  const fetchDiscoveries = useCallback(async () => {
    if (!sessionId || isAdmin) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("discoveries")
      .select("*")
      .eq("session_id", sessionId)
      .eq("player_name", playerName);
    setDiscoveries(data || []);
    setLoading(false);
  }, [sessionId, playerName, isAdmin]);

  useEffect(() => {
    fetchDiscoveries();
  }, [fetchDiscoveries]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!sessionId || isAdmin) return;
    const channel = supabase
      .channel(`discoveries-${sessionId}-${playerName}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "discoveries",
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const d = payload.new as Discovery;
        if (d.player_name === playerName) {
          setDiscoveries(prev => [...prev, d]);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId, playerName, isAdmin]);

  const isDiscovered = useCallback((entityType: string, entityId: string): boolean => {
    if (isAdmin) return true;
    return discoveries.some(d => d.entity_type === entityType && d.entity_id === entityId);
  }, [discoveries, isAdmin]);

  const discoveredIds = useCallback((entityType: string): Set<string> => {
    if (isAdmin) return new Set(); // empty means "show all" when admin
    return new Set(discoveries.filter(d => d.entity_type === entityType).map(d => d.entity_id));
  }, [discoveries, isAdmin]);

  const addDiscovery = useCallback(async (entityType: string, entityId: string, source = "manual") => {
    if (!sessionId) return;
    await supabase.from("discoveries").upsert({
      session_id: sessionId,
      player_name: playerName,
      entity_type: entityType,
      entity_id: entityId,
      source,
    }, { onConflict: "session_id,player_name,entity_type,entity_id" });
  }, [sessionId, playerName]);

  return { discoveries, loading, isDiscovered, discoveredIds, addDiscovery, refetch: fetchDiscoveries, isAdmin };
}
