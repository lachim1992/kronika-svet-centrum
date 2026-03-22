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
  controlled_by: string | null;
  garrison_strength: number | null;
  is_major: boolean;
  population: number;
  fortification_level: number;
  infrastructure_level: number;
  parent_node_id: string | null;
  is_active: boolean;
  metadata: Record<string, any>;
  // Regulation & urbanization
  throughput_military: number;
  toll_rate: number;
  cumulative_trade_flow: number;
  urbanization_score: number;
  hinterland_level: number;
  resource_output: Record<string, number>;
  flow_role: string;
  // Economy flow fields
  production_output: number;
  wealth_output: number;
  capacity_score: number;
  importance_score: number;
  incoming_production: number;
  connectivity_score: number;
  route_access_factor: number;
  trade_efficiency: number;
  isolation_penalty: number;
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
          .select("id, province_id, node_type, name, hex_q, hex_r, city_id, strategic_value, economic_value, defense_value, mobility_relevance, supply_relevance, controlled_by, garrison_strength, is_major, population, fortification_level, infrastructure_level, parent_node_id, is_active, metadata, throughput_military, toll_rate, cumulative_trade_flow, urbanization_score, hinterland_level, resource_output, flow_role, production_output, wealth_output, capacity_score, importance_score, incoming_production, connectivity_score, route_access_factor, trade_efficiency, isolation_penalty")
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
          controlled_by: n.controlled_by,
          garrison_strength: n.garrison_strength,
          is_major: n.is_major ?? false,
          population: n.population ?? 0,
          fortification_level: n.fortification_level ?? 0,
          infrastructure_level: n.infrastructure_level ?? 0,
          parent_node_id: n.parent_node_id,
          is_active: n.is_active ?? true,
          metadata: (n.metadata as any) || {},
          throughput_military: n.throughput_military ?? 1.0,
          toll_rate: n.toll_rate ?? 0.0,
          cumulative_trade_flow: n.cumulative_trade_flow ?? 0,
          urbanization_score: n.urbanization_score ?? 0,
          hinterland_level: n.hinterland_level ?? 0,
          resource_output: (n.resource_output as any) || {},
          flow_role: n.flow_role || "neutral",
          production_output: n.production_output ?? 0,
          wealth_output: n.wealth_output ?? 0,
          capacity_score: n.capacity_score ?? 0,
          importance_score: n.importance_score ?? 0,
          incoming_production: n.incoming_production ?? 0,
          connectivity_score: n.connectivity_score ?? 0,
          route_access_factor: n.route_access_factor ?? 1.0,
          trade_efficiency: n.trade_efficiency ?? 1.0,
          isolation_penalty: n.isolation_penalty ?? 0,
        })));
      }
      if (routesRes.data) {
        setRoutes(routesRes.data.map((r: any) => ({
          id: r.id,
          node_a: r.node_a,
          node_b: r.node_b,
          route_type: r.route_type,
          capacity_value: r.capacity_value,
          military_relevance: r.military_relevance,
          economic_relevance: r.economic_relevance,
          vulnerability_score: r.vulnerability_score,
          control_state: r.control_state,
          build_cost: r.build_cost,
          upgrade_level: r.upgrade_level,
          metadata: (r.metadata as any) || {},
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

  const computeRoutes = useCallback(async () => {
    setComputing(true);
    try {
      const { data, error } = await supabase.functions.invoke("compute-province-routes", {
        body: { session_id: sessionId },
      });
      if (error) throw error;
      await loadGraph();
      return data;
    } finally {
      setComputing(false);
    }
  }, [sessionId, loadGraph]);

  return { nodes, edges, strategicNodes, routes, loading, computing, loadGraph, computeGraph, computeNodes, computeRoutes };
}
