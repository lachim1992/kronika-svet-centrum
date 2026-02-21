import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface HexData {
  id: string;
  q: number;
  r: number;
  mean_height: number;
  biome_family: string;
  coastal: boolean;
  moisture_band: number;
  temp_band: number;
  seed: string;
  macro_region?: {
    id: string;
    name: string;
    region_key: string;
    climate_band: number;
    elevation_band: number;
    moisture_band: number;
  } | null;
}

const hexKey = (q: number, r: number) => `${q},${r}`;

export function useHexMap(sessionId: string) {
  const [hexes, setHexes] = useState<Record<string, HexData>>({});
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());
  const inflightRef = useRef<Set<string>>(new Set());

  const fetchHex = useCallback(async (q: number, r: number): Promise<HexData | null> => {
    const key = hexKey(q, r);
    if (inflightRef.current.has(key)) return null;
    inflightRef.current.add(key);
    setLoadingKeys(prev => new Set(prev).add(key));

    try {
      const { data, error } = await supabase.functions.invoke("generate-hex", {
        body: { session_id: sessionId, q, r },
      });
      if (error) throw error;
      const hex = data as HexData;
      setHexes(prev => ({ ...prev, [key]: hex }));
      return hex;
    } catch (e) {
      console.error("Hex fetch failed", q, r, e);
      return null;
    } finally {
      inflightRef.current.delete(key);
      setLoadingKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [sessionId]);

  const ensureHexes = useCallback(async (coords: { q: number; r: number }[]) => {
    const missing = coords.filter(c => {
      const k = hexKey(c.q, c.r);
      return !hexes[k] && !inflightRef.current.has(k);
    });
    if (missing.length === 0) return;
    // Batch in groups of 7 to avoid overload
    const BATCH = 7;
    for (let i = 0; i < missing.length; i += BATCH) {
      await Promise.all(missing.slice(i, i + BATCH).map(c => fetchHex(c.q, c.r)));
    }
  }, [hexes, fetchHex]);

  const getHex = useCallback((q: number, r: number): HexData | undefined => {
    return hexes[hexKey(q, r)];
  }, [hexes]);

  const isLoading = useCallback((q: number, r: number): boolean => {
    return loadingKeys.has(hexKey(q, r));
  }, [loadingKeys]);

  return { hexes, getHex, isLoading, ensureHexes, fetchHex };
}

// Generate axial coords within a given radius
export function axialRange(cq: number, cr: number, radius: number): { q: number; r: number }[] {
  const results: { q: number; r: number }[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
      results.push({ q: cq + dq, r: cr + dr });
    }
  }
  return results;
}
