import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, ScrollText } from "lucide-react";
import WorldEnginePanel from "@/components/WorldEnginePanel";
import LawsPanel from "@/components/LawsPanel";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
}

const EngineTab = ({ sessionId, currentPlayerName, currentTurn, myRole }: Props) => {
  return (
    <div className="space-y-6 pb-24 px-1">
      <Tabs defaultValue="engine" className="w-full">
        <TabsList className="w-full justify-start bg-card border border-border h-auto p-1 gap-1">
          <TabsTrigger value="engine" className="font-display text-xs gap-1">
            <Zap className="h-3 w-3" />World Engine
          </TabsTrigger>
          <TabsTrigger value="laws" className="font-display text-xs gap-1">
            <ScrollText className="h-3 w-3" />Zákony
          </TabsTrigger>
        </TabsList>

        <TabsContent value="engine" className="mt-4">
          <WorldEnginePanel
            sessionId={sessionId}
            currentTurn={currentTurn}
            currentPlayerName={currentPlayerName}
          />
        </TabsContent>

        <TabsContent value="laws" className="mt-4">
          <LawsPanel
            sessionId={sessionId}
            currentPlayerName={currentPlayerName}
            currentTurn={currentTurn}
            myRole={myRole}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default EngineTab;
