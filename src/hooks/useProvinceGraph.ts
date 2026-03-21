import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ProvinceNode {
  id: string;
  name: string;
  owner_player: string;
  center_q: number;
  center_r: number;
  color_index: number;
  hex_count: number;
  strategic_value: number;
  terrain_profile: {
    biome_distribution?: Record<string, number>;
    avg_elevation?: number;
    coastal_hexes?: number;
    dominant_biome?: string;
  };
  economic_profile: {
    farmland_score?: number;
    timber_score?: number;
    mineral_score?: number;
    trade_potential?: number;
  };
}

export interface ProvinceEdge {
  id: string;
  province_a: string;
  province_b: string;
  border_length: number;
  border_terrain: Record<string, number>;
  is_contested: boolean;
}

export function useProvinceGraph(sessionId: string) {
  const [nodes, setNodes] = useState<ProvinceNode[]>([]);
  const [edges, setEdges] = useState<ProvinceEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const [provRes, adjRes] = await Promise.all([
        supabase
          .from("provinces")
          .select("id, name, owner_player, center_q, center_r, color_index, hex_count, strategic_value, terrain_profile, economic_profile")
          .eq("session_id", sessionId),
        supabase
          .from("province_adjacency")
          .select("id, province_a, province_b, border_length, border_terrain, is_contested")
          .eq("session_id", sessionId),
      ]);

      if (provRes.data) {
        setNodes(provRes.data.map((p: any) => ({
          id: p.id,
          name: p.name,
          owner_player: p.owner_player,
          center_q: p.center_q || 0,
          center_r: p.center_r || 0,
          color_index: p.color_index || 0,
          hex_count: p.hex_count || 0,
          strategic_value: p.strategic_value || 0,
          terrain_profile: (p.terrain_profile as any) || {},
          economic_profile: (p.economic_profile as any) || {},
        })));
      }

      if (adjRes.data) {
        setEdges(adjRes.data.map((e: any) => ({
          id: e.id,
          province_a: e.province_a,
          province_b: e.province_b,
          border_length: e.border_length,
          border_terrain: (e.border_terrain as any) || {},
          is_contested: e.is_contested,
        })));
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const computeGraph = useCallback(async () => {
    setComputing(true);
    try {
      const { data, error } = await supabase.functions.invoke("compute-province-graph", {
        body: { session_id: sessionId },
      });
      if (error) throw error;
      await loadGraph();
      return data;
    } finally {
      setComputing(false);
    }
  }, [sessionId, loadGraph]);

  return { nodes, edges, loading, computing, loadGraph, computeGraph };
}
