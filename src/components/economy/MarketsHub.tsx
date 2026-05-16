// MarketsHub — unifies Trhy + Supply Chain + Trade systems under one root tab
// with nested sub-tabs. No business logic, only orchestration.

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import TradePanel from "@/components/TradePanel";
import SupplyChainPanel from "@/components/SupplyChainPanel";
import MarketPerformancePanel from "./MarketPerformancePanel";
import DemandFulfillmentPanel from "./DemandFulfillmentPanel";
import MarketSharePanel from "./MarketSharePanel";
import NeutralNodeContributionPanel from "./NeutralNodeContributionPanel";
import TradeSystemsSubTab from "./TradeSystemsSubTab";
import StrategicResourcesDetail from "./StrategicResourcesDetail";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  cities: any[];
  realm: any;
  onRefetch?: () => void;
}

const subTrigger =
  "text-[11px] font-display rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm whitespace-nowrap px-2.5";

const MarketsHub = ({
  sessionId,
  currentPlayerName,
  currentTurn,
  cities,
  realm,
  onRefetch,
}: Props) => {
  const myCities = cities.filter(c => c.owner_player === currentPlayerName);

  return (
    <Tabs defaultValue="performance" className="space-y-4">
      <ScrollArea className="w-full">
        <TabsList className="inline-flex w-auto min-w-full h-9 bg-muted/20 rounded-xl p-1 gap-1">
          <TabsTrigger value="performance" className={subTrigger}>
            Výkon
          </TabsTrigger>
          <TabsTrigger value="demand" className={subTrigger}>
            Poptávka & Fill
          </TabsTrigger>
          <TabsTrigger value="share" className={subTrigger}>
            Tržní podíl
          </TabsTrigger>
          <TabsTrigger value="supply" className={subTrigger}>
            Supply Chain
          </TabsTrigger>
          <TabsTrigger value="systems" className={subTrigger}>
            Trade systems
          </TabsTrigger>
        </TabsList>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <TabsContent value="performance" className="space-y-4 animate-fade-in">
        {realm && <MarketPerformancePanel realm={realm} />}
      </TabsContent>

      <TabsContent value="demand" className="space-y-4 animate-fade-in">
        <DemandFulfillmentPanel
          sessionId={sessionId}
          playerName={currentPlayerName}
          cities={cities}
        />
        <NeutralNodeContributionPanel sessionId={sessionId} playerName={currentPlayerName} />
      </TabsContent>

      <TabsContent value="share" className="space-y-4 animate-fade-in">
        <MarketSharePanel sessionId={sessionId} playerName={currentPlayerName} />
        <TradePanel
          sessionId={sessionId}
          currentPlayerName={currentPlayerName}
          currentTurn={currentTurn}
          myCities={myCities}
          allCities={cities}
          realm={realm}
          onRefetch={onRefetch}
        />
      </TabsContent>

      <TabsContent value="supply" className="space-y-4 animate-fade-in">
        <SupplyChainPanel
          sessionId={sessionId}
          playerName={currentPlayerName}
          currentTurn={currentTurn}
        />
      </TabsContent>

      <TabsContent value="systems" className="space-y-4 animate-fade-in">
        <TradeSystemsSubTab sessionId={sessionId} playerName={currentPlayerName} />
        {realm && <StrategicResourcesDetail realm={realm} />}
      </TabsContent>
    </Tabs>
  );
};

export default MarketsHub;
