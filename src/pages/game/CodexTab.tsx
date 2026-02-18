import { useState, useEffect } from "react";
import WorldCodex from "@/components/WorldCodex";
import WikiPanel from "@/components/WikiPanel";
import WondersPanel from "@/components/WondersPanel";
import GreatPersonsPanel from "@/components/GreatPersonsPanel";
import LeaderboardsPanel from "@/components/LeaderboardsPanel";
import UnifiedEntityDetail from "@/components/UnifiedEntityDetail";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Library, BookOpen, Landmark, Star, Trophy } from "lucide-react";

interface Props {
  sessionId: string;
  session: any;
  events: any[];
  memories: any[];
  players: any[];
  cities: any[];
  wonders: any[];
  greatPersons: any[];
  resources: any[];
  armies: any[];
  chronicles: any[];
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
  worldFoundation: any;
  entityIndex?: any;
  onRefetch: () => void;
  onEventClick?: (eventId: string) => void;
  onEntityClick?: (type: string, id: string) => void;
  codexEntityTarget?: { type: string; id: string } | null;
  onClearEntityTarget?: () => void;
}

const CodexTab = ({
  sessionId, session, events, memories, players, cities, wonders, greatPersons,
  resources, armies, chronicles, currentPlayerName, currentTurn, myRole,
  worldFoundation, entityIndex, onRefetch, onEventClick, onEntityClick,
  codexEntityTarget, onClearEntityTarget,
}: Props) => {
  const [selectedEntity, setSelectedEntity] = useState<{ type: string; id: string } | null>(null);

  // Handle external navigation target
  useEffect(() => {
    if (codexEntityTarget) {
      setSelectedEntity(codexEntityTarget);
      onClearEntityTarget?.();
    }
  }, [codexEntityTarget]);

  const handleEntityClick = (type: string, id: string) => {
    if (type === "event") {
      onEventClick?.(id);
      return;
    }
    setSelectedEntity({ type, id });
  };

  // Show unified detail
  if (selectedEntity) {
    return (
      <div className="pb-20">
        <UnifiedEntityDetail
          sessionId={sessionId}
          entityType={selectedEntity.type}
          entityId={selectedEntity.id}
          currentPlayerName={currentPlayerName}
          currentTurn={currentTurn}
          myRole={myRole}
          epochStyle={session.epoch_style}
          cities={cities}
          events={events}
          memories={memories}
          wonders={wonders}
          players={players}
          greatPersons={greatPersons}
          entityIndex={entityIndex}
          onBack={() => setSelectedEntity(null)}
          onEventClick={onEventClick}
          onEntityClick={handleEntityClick}
          onRefetch={onRefetch}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-2 py-1">
        <Library className="h-5 w-5 text-illuminated" />
        <h2 className="text-lg font-display font-bold">Kodex</h2>
      </div>

      <Tabs defaultValue="wiki" className="w-full">
        <TabsList className="w-full justify-start bg-card border border-border h-auto p-1 gap-1 flex-wrap">
          <TabsTrigger value="wiki" className="font-display text-xs gap-1">
            <BookOpen className="h-3 w-3" />Encyklopedie
          </TabsTrigger>
          <TabsTrigger value="codex" className="font-display text-xs gap-1">
            <Library className="h-3 w-3" />World Codex
          </TabsTrigger>
          <TabsTrigger value="wonders" className="font-display text-xs gap-1">
            <Landmark className="h-3 w-3" />Divy světa
          </TabsTrigger>
          <TabsTrigger value="persons" className="font-display text-xs gap-1">
            <Star className="h-3 w-3" />Osobnosti
          </TabsTrigger>
          <TabsTrigger value="leaderboards" className="font-display text-xs gap-1">
            <Trophy className="h-3 w-3" />Žebříčky
          </TabsTrigger>
        </TabsList>

        <TabsContent value="wiki" className="mt-3">
          <WikiPanel
            sessionId={sessionId} currentPlayerName={currentPlayerName}
            cities={cities} wonders={wonders} greatPersons={greatPersons}
            events={events} myRole={myRole} epochStyle={session.epoch_style}
            onRefetch={onRefetch} onEventClick={onEventClick}
            onEntityClick={handleEntityClick}
          />
        </TabsContent>

        <TabsContent value="codex" className="mt-3">
          <WorldCodex foundation={worldFoundation} />
        </TabsContent>

        <TabsContent value="wonders" className="mt-3">
          <WondersPanel
            sessionId={sessionId} wonders={wonders} cities={cities} players={players}
            memories={memories} currentPlayerName={currentPlayerName} currentTurn={currentTurn} onRefetch={onRefetch}
          />
        </TabsContent>

        <TabsContent value="persons" className="mt-3">
          <GreatPersonsPanel
            sessionId={sessionId} currentPlayerName={currentPlayerName}
            greatPersons={greatPersons} cities={cities} currentTurn={currentTurn} onRefetch={onRefetch}
          />
        </TabsContent>

        <TabsContent value="leaderboards" className="mt-3">
          <LeaderboardsPanel players={players} cities={cities} resources={resources} armies={armies} wonders={wonders} events={events} chronicles={chronicles} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CodexTab;
