// ============================================================================
// EconomyTabDevPanels — lazy-loaded dev-only section of EconomyTab.
//
// Sprint 1: Extracted to keep dev panels and node-level queries out of
// the player path. This module + useEconomyTabDevData are the ONLY files
// that should query province_nodes for the economy view.
//
// Import gate: may only be imported from EconomyTab.tsx or dev surfaces.
// See docs/architecture/legacy-allowlist.md.
// ============================================================================

import { useMemo } from "react";
import { useEconomyTabDevData } from "@/hooks/useEconomyTabDevData";
import NodeFlowBreakdown from "@/components/economy/NodeFlowBreakdown";
import FormulasReferencePanel from "@/components/economy/FormulasReferencePanel";
import GapAdvisorPanel from "@/components/economy/GapAdvisorPanel";
import EconomyDependencyMap from "@/components/economy/EconomyDependencyMap";
import CapacityPanel from "@/components/economy/CapacityPanel";
import TradeSystemSupplyPanel from "@/components/economy/TradeSystemSupplyPanel";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  cities: any[];
  realm: any;
}

const FLOW_ROLE_MULT: Record<string, number> = { hub: 0.8, gateway: 0.9, regulator: 0.7, producer: 1.2, neutral: 1.0 };

const EconomyTabDevPanels = ({ sessionId, currentPlayerName, cities, realm }: Props) => {
  const { nodeStats, cityNodeMap, nodesByRole, isolatedNodes } = useEconomyTabDevData(sessionId, currentPlayerName);

  const myCities = useMemo(() => cities.filter((c: any) => c.owner_player === currentPlayerName), [cities, currentPlayerName]);

  const cityEconMap = useMemo(() => {
    const map = new Map<string, { production: number; demand: number; balance: number; isolation: number; wealthOutput: number }>();
    for (const city of myCities) {
      const node = cityNodeMap.get(city.id);
      const pop = city.population_total || 0;
      const demand = Math.max(1, Math.round(pop * 0.006));
      let production = 0;
      let isolation = 0;
      let wealthOutput = 0;
      if (node) {
        production = (node.production_output || 0) + (node.incoming_production || 0) * 0.5;
        production *= FLOW_ROLE_MULT[node.flow_role] || 1.0;
        isolation = node.isolation_penalty || 0;
        wealthOutput = node.wealth_output || 0;
      }
      map.set(city.id, { production: Math.round(production * 10) / 10, demand, balance: Math.round((production - demand) * 10) / 10, isolation: Math.round(isolation * 100), wealthOutput: Math.round(wealthOutput * 10) / 10 });
    }
    return map;
  }, [myCities, cityNodeMap]);

  return (
    <div className="space-y-5">
      {realm && <CapacityPanel realm={realm} cities={myCities} nodeStats={nodeStats} />}
      
      <NodeFlowBreakdown
        sessionId={sessionId}
        playerName={currentPlayerName}
        realm={realm}
      />
      
      <EconomyDependencyMap realm={realm} cities={myCities} armies={[]} />
      
      <GapAdvisorPanel sessionId={sessionId} playerName={currentPlayerName} cities={cities} />
      
      <FormulasReferencePanel />
    </div>
  );
};

export default EconomyTabDevPanels;
