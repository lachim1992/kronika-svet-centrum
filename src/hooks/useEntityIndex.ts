import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface EntityEntry {
  type: "city" | "province" | "region" | "wonder" | "person" | "event" | "faction";
  id: string;
  label: string;
}

export interface EntityIndex {
  entries: EntityEntry[];
  byName: Map<string, EntityEntry>;
  ready: boolean;
}

const cache = new Map<string, EntityIndex>();

export function useEntityIndex(sessionId: string | undefined): EntityIndex {
  const [index, setIndex] = useState<EntityIndex>(() => {
    if (sessionId && cache.has(sessionId)) return cache.get(sessionId)!;
    return { entries: [], byName: new Map(), ready: false };
  });

  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId || fetchedRef.current === sessionId) return;
    if (cache.has(sessionId)) {
      setIndex(cache.get(sessionId)!);
      fetchedRef.current = sessionId;
      return;
    }

    fetchedRef.current = sessionId;

    const load = async () => {
      const [
        { data: cities },
        { data: provinces },
        { data: regions },
        { data: wonders },
        { data: persons },
        { data: worldEvents },
      ] = await Promise.all([
        supabase.from("cities").select("id, name").eq("session_id", sessionId),
        supabase.from("provinces").select("id, name").eq("session_id", sessionId),
        supabase.from("regions").select("id, name").eq("session_id", sessionId),
        supabase.from("wonders").select("id, name").eq("session_id", sessionId),
        supabase.from("great_persons").select("id, name").eq("session_id", sessionId),
        supabase.from("world_events").select("id, title").eq("session_id", sessionId).eq("status", "published"),
      ]);

      const entries: EntityEntry[] = [];
      cities?.forEach(c => entries.push({ type: "city", id: c.id, label: c.name }));
      provinces?.forEach(p => entries.push({ type: "province", id: p.id, label: p.name }));
      regions?.forEach(r => entries.push({ type: "region", id: r.id, label: r.name }));
      wonders?.forEach(w => entries.push({ type: "wonder", id: w.id, label: w.name }));
      persons?.forEach(p => entries.push({ type: "person", id: p.id, label: p.name }));
      worldEvents?.forEach(e => entries.push({ type: "event", id: e.id, label: e.title }));

      // Sort by label length descending so longer names match first
      entries.sort((a, b) => b.label.length - a.label.length);

      const byName = new Map<string, EntityEntry>();
      entries.forEach(e => {
        const key = e.label.toLowerCase();
        if (!byName.has(key)) byName.set(key, e);
      });

      const result: EntityIndex = { entries, byName, ready: true };
      cache.set(sessionId, result);
      setIndex(result);
    };

    load();
  }, [sessionId]);

  return index;
}

/** Invalidate cache for a session so next render re-fetches */
export function invalidateEntityIndex(sessionId: string) {
  cache.delete(sessionId);
}
