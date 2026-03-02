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
  has_river: boolean;
  has_bridge: boolean;
  is_passable: boolean;
  movement_cost: number;
  river_direction: string | null;
  macro_region?: {
    id: string;
    name: string;
    region_key: string;
    climate_band: number;
    elevation_band: number;
    moisture_band: number;
  } | null;
}

export const AXIAL_NEIGHBORS = [
  { dq: 1, dr: 0 }, { dq: -1, dr: 0 },
  { dq: 0, dr: 1 }, { dq: 0, dr: -1 },
  { dq: 1, dr: -1 }, { dq: -1, dr: 1 },
];

const hexKey = (q: number, r: number) => `${q},${r}`;

export function useHexMap(sessionId: string) {
  const [hexes, setHexes] = useState<Record<string, HexData>>({});
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());
  const inflightRef = useRef<Set<string>>(new Set());

  /** Fetch or generate a single hex via edge function */
  const fetchHex = useCallback(async (q: number, r: number): Promise<HexData | null> => {
    const key = hexKey(q, r);
    if (hexes[key]) return hexes[key];
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
  }, [sessionId, hexes]);

  /** Bulk-load province_hexes by their IDs (from discoveries) */
  const loadHexesByIds = useCallback(async (hexIds: string[]) => {
    if (hexIds.length === 0) return;
    // Only fetch IDs we don't already have cached
    const knownIds = new Set(Object.values(hexes).map(h => h.id));
    const missing = hexIds.filter(id => !knownIds.has(id));
    if (missing.length === 0) return;

    // Supabase .in() max ~300, batch if needed
    const BATCH = 200;
    for (let i = 0; i < missing.length; i += BATCH) {
      const batch = missing.slice(i, i + BATCH);
      const { data } = await supabase
        .from("province_hexes")
        .select("*, macro_regions(*)")
        .in("id", batch);
      if (data) {
        const mapped: Record<string, HexData> = {};
        for (const row of data) {
          const h: HexData = {
            id: row.id,
            q: row.q,
            r: row.r,
            mean_height: row.mean_height,
            biome_family: row.biome_family,
            coastal: row.coastal,
            moisture_band: row.moisture_band,
            temp_band: row.temp_band,
            seed: row.seed,
            has_river: (row as any).has_river ?? false,
            has_bridge: (row as any).has_bridge ?? false,
            is_passable: (row as any).is_passable ?? true,
            movement_cost: (row as any).movement_cost ?? 1,
            river_direction: (row as any).river_direction ?? null,
            macro_region: (row as any).macro_regions || null,
          };
          mapped[hexKey(h.q, h.r)] = h;
        }
        setHexes(prev => ({ ...prev, ...mapped }));
      }
    }
  }, [hexes]);

  /** Load ALL generated hexes for this session (admin/dev mode) */
  const loadAllGenerated = useCallback(async () => {
    const { data } = await supabase
      .from("province_hexes")
      .select("*, macro_regions(*)")
      .eq("session_id", sessionId)
      .limit(500);
    if (data) {
      const mapped: Record<string, HexData> = {};
      for (const row of data) {
        const h: HexData = {
          id: row.id,
          q: row.q,
          r: row.r,
          mean_height: row.mean_height,
          biome_family: row.biome_family,
          coastal: row.coastal,
          moisture_band: row.moisture_band,
          temp_band: row.temp_band,
          seed: row.seed,
          has_river: (row as any).has_river ?? false,
          has_bridge: (row as any).has_bridge ?? false,
          is_passable: (row as any).is_passable ?? true,
          movement_cost: (row as any).movement_cost ?? 1,
          river_direction: (row as any).river_direction ?? null,
          macro_region: (row as any).macro_regions || null,
        };
        mapped[hexKey(h.q, h.r)] = h;
      }
      setHexes(prev => ({ ...prev, ...mapped }));
    }
  }, [sessionId]);

  const getHex = useCallback((q: number, r: number): HexData | undefined => {
    return hexes[hexKey(q, r)];
  }, [hexes]);

  const isLoading = useCallback((q: number, r: number): boolean => {
    return loadingKeys.has(hexKey(q, r));
  }, [loadingKeys]);

  return { hexes, getHex, isLoading, fetchHex, loadHexesByIds, loadAllGenerated };
}
