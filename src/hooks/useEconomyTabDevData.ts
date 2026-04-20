// ============================================================================
// useEconomyTabDevData — dev-only data hook for EconomyTab.
//
// Sprint 1: Extracted from EconomyTab to keep province_nodes queries and
// node-level computations out of the player path.
//
// Import gate: may only be imported from EconomyTabDevPanels.tsx or dev surfaces.
// See docs/architecture/legacy-allowlist.md.
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useEconomyTabDevData(sessionId: string, currentPlayerName: string) {
  const [nodeStats, setNodeStats] = useState<any[]>([]);
  const [cityNodeMap, setCityNodeMap] = useState<Map<string, any>>(new Map());

  const fetchDevData = useCallback(async () => {
    const [nodesRes, cityNodesRes] = await Promise.all([
      supabase.from("province_nodes")
        .select("id, name, node_type, flow_role, is_major, controlled_by, production_output, wealth_output, capacity_score, importance_score, connectivity_score, isolation_penalty, strategic_resource_type, strategic_resource_tier, incoming_production, city_id")
        .eq("session_id", sessionId).eq("controlled_by", currentPlayerName),
      supabase.from("province_nodes")
        .select("id, city_id, production_output, incoming_production, flow_role, isolation_penalty, wealth_output")
        .eq("session_id", sessionId).not("city_id", "is", null),
    ]);
    setNodeStats(nodesRes.data || []);
    const map = new Map<string, any>();
    for (const n of (cityNodesRes.data || [])) {
      if (n.city_id) map.set(n.city_id, n);
    }
    setCityNodeMap(map);
  }, [sessionId, currentPlayerName]);

  useEffect(() => { fetchDevData(); }, [fetchDevData]);

  const nodesByRole = useMemo(() => {
    const roles: Record<string, { count: number; production: number; wealth: number; capacity: number }> = {};
    for (const n of nodeStats) {
      const role = n.flow_role || "neutral";
      if (!roles[role]) roles[role] = { count: 0, production: 0, wealth: 0, capacity: 0 };
      roles[role].count++;
      roles[role].production += n.production_output ?? 0;
      roles[role].wealth += n.wealth_output ?? 0;
      roles[role].capacity += n.capacity_score ?? 0;
    }
    return roles;
  }, [nodeStats]);

  const isolatedNodes = useMemo(() =>
    nodeStats.filter(n => (n.isolation_penalty ?? 0) > 0),
  [nodeStats]);

  return { nodeStats, cityNodeMap, nodesByRole, isolatedNodes, refetchDevData: fetchDevData };
}
