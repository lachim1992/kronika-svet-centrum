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

export interface StrategicNode {
  id: string;
  province_id: string;
  node_type: string;
  name: string;
  hex_q: number;
  hex_r: number;
  city_id: string | null;
  strategic_value: number;
  economic_value: number;
  defense_value: number;
  mobility_relevance: number;
  supply_relevance: number;
  metadata: Record<string, any>;
}

export interface ProvinceRoute {
  id: string;
  node_a: string;
  node_b: string;
  route_type: string;
  capacity_value: number;
  military_relevance: number;
  economic_relevance: number;
  vulnerability_score: number;
  control_state: string;
  build_cost: number;
  upgrade_level: number;
  metadata: Record<string, any>;
}

export function useProvinceGraph(sessionId: string) {
  const [nodes, setNodes] = useState<ProvinceNode[]>([]);
  const [edges, setEdges] = useState<ProvinceEdge[]>([]);
  const [strategicNodes, setStrategicNodes] = useState<StrategicNode[]>([]);
  const [routes, setRoutes] = useState<ProvinceRoute[]>([]);
  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const [provRes, adjRes, snodesRes, routesRes] = await Promise.all([
        supabase
          .from("provinces")
          .select("id, name, owner_player, center_q, center_r, color_index, hex_count, strategic_value, terrain_profile, economic_profile")
          .eq("session_id", sessionId),
        supabase
          .from("province_adjacency")
          .select("id, province_a, province_b, border_length, border_terrain, is_contested")
          .eq("session_id", sessionId),
        supabase
          .from("province_nodes")
          .select("id, province_id, node_type, name, hex_q, hex_r, city_id, strategic_value, economic_value, defense_value, mobility_relevance, supply_relevance, metadata")
          .eq("session_id", sessionId),
        supabase
          .from("province_routes")
          .select("id, node_a, node_b, route_type, capacity_value, military_relevance, economic_relevance, vulnerability_score, control_state, build_cost, upgrade_level, metadata")
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

      if (snodesRes.data) {
        setStrategicNodes(snodesRes.data.map((n: any) => ({
          id: n.id,
          province_id: n.province_id,
          node_type: n.node_type,
          name: n.name,
          hex_q: n.hex_q,
          hex_r: n.hex_r,
          city_id: n.city_id,
          strategic_value: n.strategic_value,
          economic_value: n.economic_value,
          defense_value: n.defense_value,
          mobility_relevance: n.mobility_relevance,
          supply_relevance: n.supply_relevance,
          metadata: (n.metadata as any) || {},
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

  const computeNodes = useCallback(async () => {
    setComputing(true);
    try {
      const { data, error } = await supabase.functions.invoke("compute-province-nodes", {
        body: { session_id: sessionId },
      });
      if (error) throw error;
      await loadGraph();
      return data;
    } finally {
      setComputing(false);
    }
  }, [sessionId, loadGraph]);

  return { nodes, edges, strategicNodes, loading, computing, loadGraph, computeGraph, computeNodes };
}
